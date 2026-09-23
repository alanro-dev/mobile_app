const pool = require('../db/pool');
const enkaService = require('../services/enka.service');
const resolveProfileService = require('../services/resolveProfile.service');
const zzzProfileModel = require('../models/zzzProfile.model');

async function buildAgentPayload(agentSnapshot) {
  const weapon = await zzzProfileModel.getWeaponSnapshot(agentSnapshot.id);
  const discRows = await zzzProfileModel.getDiscSnapshots(agentSnapshot.id);
  const skills = await zzzProfileModel.getSkillSnapshots(agentSnapshot.id);

  const discs = await Promise.all(
    discRows.map(async (disc) => {
      const substats = await zzzProfileModel.getDiscSubstats(disc.id);
      return {
        slot: disc.slot,
        equipmentId: disc.equipment_id,
        setName: disc.set_name,
        rarity: disc.rarity,
        iconUrl: disc.icon_url,
        level: disc.level,
        mainStat: disc.main_stat_id
          ? {
              propertyId: disc.main_stat_id,
              name: disc.main_stat_name,
              value: Number(disc.main_stat_value),
              isPercent: disc.main_stat_is_percent,
            }
          : null,
        subStats: substats.map((s) => ({
          propertyId: s.property_id,
          name: s.name,
          value: Number(s.value),
          isPercent: s.is_percent,
          rolls: s.rolls,
        })),
      };
    })
  );

  return {
    snapshotId: agentSnapshot.id,
    agentId: agentSnapshot.agent_id,
    name: agentSnapshot.name,
    attribute: agentSnapshot.attribute,
    specialty: agentSnapshot.specialty,
    rarity: agentSnapshot.rarity,
    iconUrl: agentSnapshot.icon_url,
    level: agentSnapshot.level,
    promotionLevel: agentSnapshot.promotion_level,
    mindscapeCinema: agentSnapshot.mindscape_cinema,
    coreSkillEnhancement: agentSnapshot.core_skill_enhancement,
    stats: {
      hp: Number(agentSnapshot.hp),
      atk: Number(agentSnapshot.atk),
      def: Number(agentSnapshot.def),
      impact: Number(agentSnapshot.impact),
      critRate: Number(agentSnapshot.crit_rate),
      critDmg: Number(agentSnapshot.crit_dmg),
      attributeDmgBonus: Number(agentSnapshot.attribute_dmg_bonus),
      anomalyMastery: Number(agentSnapshot.anomaly_mastery),
      anomalyProficiency: Number(agentSnapshot.anomaly_proficiency),
      penRatio: Number(agentSnapshot.pen_ratio),
      penFlat: Number(agentSnapshot.pen_flat),
      energyRegen: Number(agentSnapshot.energy_regen),
    },
    skills: skills.map((s) => ({ type: s.skill_type, level: s.level })),
    weapon: weapon
      ? {
          weaponId: weapon.weapon_id,
          name: weapon.name,
          specialty: weapon.specialty,
          rarity: weapon.rarity,
          iconUrl: weapon.icon_url,
          level: weapon.level,
          phase: weapon.phase,
          modification: weapon.modification,
          mainStat: weapon.main_stat_name
            ? { name: weapon.main_stat_name, value: Number(weapon.main_stat_value), isPercent: weapon.main_stat_is_percent }
            : null,
          subStat: weapon.sub_stat_name
            ? { name: weapon.sub_stat_name, value: Number(weapon.sub_stat_value), isPercent: weapon.sub_stat_is_percent }
            : null,
        }
      : null,
    discs,
  };
}

// GET /api/profile
// Returns the latest stored snapshot for the authenticated user (per the
// "backend is always the source of truth" decision — /hub calls this on
// every load rather than reading from localStorage).
async function getProfile(req, res, next) {
  try {
    const snapshot = await zzzProfileModel.getLatestSnapshot(req.userId);
    if (!snapshot) {
      return res.status(404).json({ message: 'No profile snapshot yet. Set a UID first.' });
    }

    const agentSnapshots = await zzzProfileModel.getAgentSnapshots(snapshot.id);
    const agents = await Promise.all(agentSnapshots.map(buildAgentPayload));

    return res.status(200).json({
      uid: snapshot.uid,
      nickname: snapshot.nickname,
      interknotLevel: snapshot.interknot_level,
      fetchedAt: snapshot.fetched_at,
      agents,
    });
  } catch (err) {
    return next(err);
  }
}

// POST /api/profile/refresh
// Manually re-fetches the player's profile from enka.network and stores a
// new snapshot. No automatic polling happens anywhere in this backend —
// refreshing is always a deliberate user action.
async function refreshProfile(req, res, next) {
  try {
    const { rows } = await pool.query('SELECT zzz_uid FROM users WHERE id = $1', [req.userId]);
    const uid = rows[0]?.zzz_uid;

    if (!uid) {
      return res.status(400).json({ message: 'No UID saved for this account yet.' });
    }

    const raw = await enkaService.fetchRawProfile(uid);
    const snapshotId = await resolveProfileService.storeProfileSnapshot(req.userId, raw);

    return res.status(201).json({ snapshotId });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getProfile, refreshProfile };
