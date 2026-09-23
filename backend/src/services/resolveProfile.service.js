/**
 * Turns a raw Enka ZZZ profile response into our normalized snapshot tables
 * (profile_snapshots -> agent_snapshots -> weapon/disc snapshots).
 *
 * This version was corrected against the actual EnkaNetwork/API-docs repo
 * (downloaded and inspected directly) and the documented formulas in
 * docs/zzz/api.md, after the original guesses caused a NaN crash. Notable
 * fixes from the first version:
 * - Raw disc main stat lives at `Equipment.MainStatList`, not `MainPropertyList`.
 * - Raw weapon fields are `UpgradeLevel` (phase) and `BreakLevel`
 *   (modification) — the original code had these reversed and referenced a
 *   nonexistent `StarMark` field.
 * - `SkillLevelList` is a dict keyed by skill index, not an array of objects.
 * - Elemental DMG Bonus property IDs are 31503/31603/31703/31803/31903
 *   (Physical/Fire/Ice/Electric/Ether) — the original code used made-up IDs
 *   and included a nonexistent "Wind" element.
 * - Disc rarity isn't present on the per-instance raw payload at all; it has
 *   to come from the zzz_equipment metadata table.
 *
 * Stat calculation (now verified, not approximated):
 * - Agent base stats (HP/ATK/DEF/Impact/etc.) use the documented formula —
 *   BaseTotal = BaseProps[id] + GrowthValue + PromotionValue + CoreEnhancementValue
 *   — using each agent's real growth-curve data cached from avatars.json.
 * - Percent-type gear bonuses (ATK%, HP%, etc.) are now properly applied
 *   multiplicatively against the base total; flat-type bonuses are added on
 *   top. This replaces the old "gear bonus only, no true total" limitation.
 * - Drive Disc main-stat scaling uses the documented + example-verified
 *   formula: value = base + (base * level * rarityScale), rarity sourced
 *   from metadata (not the raw payload, which doesn't carry it per-instance).
 * - W-Engine main/secondary stat values use the documented "Approximate"
 *   formula, cross-checked against the docs' own worked example (Steel
 *   Cushion, id 14102: 46 -> 684 main stat, 960 -> 2400 secondary stat at
 *   Level 60 / BreakLevel 5 — both match exactly).
 *
 * Remaining known gap: gear gives bonus DMG% for whatever element it rolls,
 * but we only surface the bonus matching the agent's own element (the one
 * relevant to their own damage output) — a disc/weapon rolling an off-element
 * bonus (rare, usually not useful) is not reflected in attribute_dmg_bonus.
 */

const pool = require('../db/pool');
const zzzMetadataModel = require('../models/zzzMetadata.model');
const zzzProfileModel = require('../models/zzzProfile.model');
const { refreshMetadataIfStale } = require('./enkaMetadata.service');

const STAT_MODIFIER_SCALE = 10000;

const DISC_RARITY_SCALE = {
  4: 0.2, // S rank
  3: 0.25, // A rank
  2: 0.3, // B rank
};

// W-Engine "Approximate" formula coefficients (docs/zzz/api.md), verified
// against the docs' own worked example.
const WEAPON_MAIN_LEVEL_COEFFICIENT = 0.1568166666666667;
const WEAPON_MAIN_BREAK_COEFFICIENT = 0.8922;
const WEAPON_SECONDARY_BREAK_COEFFICIENT = 0.3;

// [Base] / [%] / [Flat] property id triples for stats that can have a
// percent-of-base gear bonus applied multiplicatively.
const PERCENT_CAPABLE_STATS = {
  hp: { base: 11101, percent: 11102, flat: 11103 },
  atk: { base: 12101, percent: 12102, flat: 12103 },
  def: { base: 13101, percent: 13102, flat: 13103 },
  impact: { base: 12201, percent: 12202, flat: null }, // no [Flat] variant exists for Impact
};

// [Base] / [Flat] pairs for stats with no percent-of-base variant — gear
// bonuses here are always additive.
const FLAT_ONLY_STATS = {
  crit_rate: { base: 20101, flat: 20103 },
  crit_dmg: { base: 21101, flat: 21103 },
  pen_ratio: { base: 23101, flat: 23103 },
  pen_flat: { base: 23201, flat: 23203 },
  energy_regen: { base: 30501, flat: 30503 },
  anomaly_proficiency: { base: 31201, flat: 31203 },
  anomaly_mastery: { base: 31401, flat: 31403 },
};

const ATTRIBUTE_DMG_BONUS_IDS = {
  Physical: { base: 31501, flat: 31503 },
  Fire: { base: 31601, flat: 31603 },
  Ice: { base: 31701, flat: 31703 },
  Electric: { base: 31801, flat: 31803 },
  Ether: { base: 31901, flat: 31903 },
};

async function scaledValue(propertyId, rawValue) {
  const meta = await zzzMetadataModel.getPropertyMeta(propertyId);
  return meta.isPercent ? rawValue / STAT_MODIFIER_SCALE : rawValue;
}

/** Sums every stat property (main + sub) across all equipped gear into a single { [propertyId]: totalValue } map. */
async function buildGearTotals(avatar) {
  const totals = {};

  const addProp = async (prop) => {
    if (!prop) return;
    const value = await scaledValue(prop.PropertyId, prop.PropertyValue);
    totals[prop.PropertyId] = (totals[prop.PropertyId] ?? 0) + value;
  };

  for (const item of avatar.EquippedList || []) {
    for (const stat of item.Equipment.MainStatList || []) await addProp(stat);
    for (const stat of item.Equipment.RandomPropertyList || []) await addProp(stat);
  }

  return totals;
}

// ─── Agent base-stat formula (docs/zzz/api.md "Agent Stats") ─────────────────

function growthValue(curve, propertyId, level) {
  const g = curve.growthProps[String(propertyId)];
  return g ? (g * (level - 1)) / STAT_MODIFIER_SCALE : 0;
}

function promotionValue(curve, propertyId, promotionLevel) {
  const arr = curve.promotionProps || [];
  const idx = Math.max(0, Math.min(arr.length - 1, promotionLevel - 1));
  return arr[idx]?.[String(propertyId)] ?? 0;
}

function coreEnhancementValue(curve, propertyId, coreSkillEnhancement) {
  const arr = curve.coreEnhancementProps || [];
  const idx = Math.max(0, Math.min(arr.length - 1, coreSkillEnhancement));
  return arr[idx]?.[String(propertyId)] ?? 0;
}

/**
 * BaseTotal per the docs' formula, PLUS one thing the docs don't spell out
 * explicitly but is confirmed by the real data: for percent-type properties
 * (Crit Rate, Crit DMG, Pen Ratio, elemental DMG Bonus — verified via
 * property.json's Format field), the whole summed total is in the same
 * permyriad units as raw gear stats and needs the same /10000 scaling.
 * Verified against known game constants: CritDmg [Base]=5000 -> 0.5 (the
 * well-known 50% base crit damage), Crit Rate [Base]=500 -> 0.05 (5% base).
 * Flat-type stats (HP/ATK/DEF/Impact/Anomaly Mastery/Proficiency/PEN) are
 * already in correct display units and are left unscaled.
 */
async function baseTotal(curve, propertyId, avatar) {
  const raw =
    (curve.baseProps[String(propertyId)] || 0) +
    growthValue(curve, propertyId, avatar.Level) +
    promotionValue(curve, propertyId, avatar.PromotionLevel) +
    coreEnhancementValue(curve, propertyId, avatar.CoreSkillEnhancement);

  const meta = await zzzMetadataModel.getPropertyMeta(propertyId);
  return meta.isPercent ? raw / STAT_MODIFIER_SCALE : raw;
}

async function computeAgentStats(avatar, curve, gearTotals, agentAttribute) {
  const stats = {};

  for (const [column, ids] of Object.entries(PERCENT_CAPABLE_STATS)) {
    const base = await baseTotal(curve, ids.base, avatar);
    const percentBonus = gearTotals[ids.percent] ?? 0;
    const flatBonus = ids.flat ? gearTotals[ids.flat] ?? 0 : 0;
    stats[column] = base * (1 + percentBonus) + flatBonus;
  }

  for (const [column, ids] of Object.entries(FLAT_ONLY_STATS)) {
    const base = await baseTotal(curve, ids.base, avatar);
    const flatBonus = gearTotals[ids.flat] ?? 0;
    stats[column] = base + flatBonus;
  }

  const elementIds = ATTRIBUTE_DMG_BONUS_IDS[agentAttribute];
  stats.attribute_dmg_bonus = elementIds
    ? (await baseTotal(curve, elementIds.base, avatar)) + (gearTotals[elementIds.flat] ?? 0)
    : 0;

  return stats;
}

// ─── W-Engine stat formula (docs/zzz/api.md "Approximate" W-Engine formulas) ─

async function computeWeaponStats(weaponCurve, level, breakLevel) {
  if (!weaponCurve?.mainStat) return { main: null, sub: null };

  const mainRaw =
    weaponCurve.mainStat.PropertyValue *
    (1 + WEAPON_MAIN_LEVEL_COEFFICIENT * level + WEAPON_MAIN_BREAK_COEFFICIENT * breakLevel);
  const main = {
    propertyId: weaponCurve.mainStat.PropertyId,
    value: await scaledValue(weaponCurve.mainStat.PropertyId, mainRaw),
  };

  let sub = null;
  if (weaponCurve.secondaryStat) {
    const subRaw =
      weaponCurve.secondaryStat.PropertyValue * (1 + WEAPON_SECONDARY_BREAK_COEFFICIENT * breakLevel);
    sub = {
      propertyId: weaponCurve.secondaryStat.PropertyId,
      value: await scaledValue(weaponCurve.secondaryStat.PropertyId, subRaw),
    };
  }

  return { main, sub };
}

// ─── Disc stat formula (docs/zzz/api.md "Approximate" Drive Disc formula) ────

async function computeDiscMainStat(mainStatEntry, level, equipmentId) {
  if (!mainStatEntry) return { propertyId: null, value: 0 };

  const rarityValue = await zzzMetadataModel.getEquipmentRarityValue(equipmentId);
  const scale = DISC_RARITY_SCALE[rarityValue] ?? 0.2;
  const base = await scaledValue(mainStatEntry.PropertyId, mainStatEntry.PropertyValue);
  const value = base + base * level * scale;

  return { propertyId: mainStatEntry.PropertyId, value };
}

// ─── Skills ───────────────────────────────────────────────────────────────────
// SkillLevelList is a dict keyed by skill index (docs/zzz/api.md "Skills"):
// 0 Basic Attack, 1 Special Attack, 2 Dash, 3 Ultimate, 5 Core Skill, 6 Assist.
const SKILL_INDEX_NAMES = {
  0: 'basic',
  1: 'special',
  2: 'dash',
  3: 'ultimate',
  5: 'core',
  6: 'assist',
};

// ─── Orchestration ────────────────────────────────────────────────────────────

async function insertDisc(agentSnapshotId, item) {
  const { Equipment, Slot } = item;
  const mainStatEntry = (Equipment.MainStatList || [])[0] || null;

  const mainStat = await computeDiscMainStat(mainStatEntry, Equipment.Level, Equipment.Id);

  const discSnapshotId = await zzzProfileModel.insertDiscSnapshot(agentSnapshotId, {
    equipmentId: Equipment.Id,
    slot: Slot,
    level: Equipment.Level,
    mainStatId: mainStat.propertyId,
    mainStatValue: mainStat.value,
  });

  for (const sub of Equipment.RandomPropertyList || []) {
    const value = await scaledValue(sub.PropertyId, sub.PropertyValue);
    await zzzProfileModel.insertDiscSubstat(discSnapshotId, {
      propertyId: sub.PropertyId,
      value,
      rolls: sub.PropertyLevel ?? 1, // "Amount of rolls, only matters if substat" per docs
    });
  }
}

async function getAgentAttribute(agentId) {
  const { rows } = await pool.query('SELECT attribute FROM zzz_agents WHERE id = $1', [agentId]);
  return rows[0]?.attribute ?? null;
}

async function insertAgent(profileSnapshotId, avatar) {
  const curve = (await zzzMetadataModel.getAgentCurve(avatar.Id)) || {
    baseProps: {},
    growthProps: {},
    promotionProps: [],
    coreEnhancementProps: [],
  };
  const agentAttribute = await getAgentAttribute(avatar.Id);

  const gearTotals = await buildGearTotals(avatar);
  const stats = await computeAgentStats(avatar, curve, gearTotals, agentAttribute);

  const agentSnapshotId = await zzzProfileModel.insertAgentSnapshot(
    profileSnapshotId,
    {
      agentId: avatar.Id,
      level: avatar.Level,
      promotionLevel: avatar.PromotionLevel,
      mindscapeCinema: avatar.TalentLevel,
      coreSkillEnhancement: avatar.CoreSkillEnhancement,
    },
    stats
  );

  if (avatar.Weapon) {
    const weaponCurve = await zzzMetadataModel.getWeaponCurve(avatar.Weapon.Id);
    const { main, sub } = await computeWeaponStats(weaponCurve, avatar.Weapon.Level, avatar.Weapon.BreakLevel);

    await zzzProfileModel.insertWeaponSnapshot(agentSnapshotId, {
      weaponId: avatar.Weapon.Id,
      level: avatar.Weapon.Level,
      phase: avatar.Weapon.UpgradeLevel, // docs: UpgradeLevel = "W-Engine Phase Level"
      modification: avatar.Weapon.BreakLevel, // docs: BreakLevel = "W-Engine modification Level"
      mainStatId: main?.propertyId ?? null,
      mainStatValue: main?.value ?? 0,
      subStatId: sub?.propertyId ?? null,
      subStatValue: sub?.value ?? 0,
    });
  }

  for (const item of avatar.EquippedList || []) {
    await insertDisc(agentSnapshotId, item);
  }

  // SkillLevelList is a dict, e.g. { "0": 6, "1": 8, "3": 10, "5": 4, "6": 3 }
  for (const [indexStr, level] of Object.entries(avatar.SkillLevelList || {})) {
    const skillType = SKILL_INDEX_NAMES[Number(indexStr)] ?? `skill_${indexStr}`;
    await zzzProfileModel.insertSkillSnapshot(agentSnapshotId, skillType, level);
  }
}

/**
 * Resolves and persists a full new snapshot for the given user from a raw
 * Enka API response. Returns the new profile_snapshot id.
 */
async function storeProfileSnapshot(userId, raw) {
  await refreshMetadataIfStale();

  const { SocialDetail, ShowcaseDetail } = raw.PlayerInfo;
  const ProfileDetail = SocialDetail && SocialDetail.ProfileDetail;

  if (!ProfileDetail) {
    const err = new Error(`Enka profile for uid ${raw.uid} is missing SocialDetail.ProfileDetail.`);
    err.status = 502;
    throw err;
  }

  const profileSnapshotId = await zzzProfileModel.insertProfileSnapshot(
    userId,
    raw.uid,
    ProfileDetail.Nickname ?? null,
    ProfileDetail.Level
  );

  const avatars = (ShowcaseDetail && ShowcaseDetail.AvatarList) || [];
  for (const avatar of avatars) {
    await insertAgent(profileSnapshotId, avatar);
  }

  return profileSnapshotId;
}

module.exports = { storeProfileSnapshot };