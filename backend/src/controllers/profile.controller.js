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

const DEFAULT_HISTORY_LIMIT = 50;
const MAX_HISTORY_LIMIT = 200;

function toStats(row) {
  return {
    hp: Number(row.hp),
    atk: Number(row.atk),
    def: Number(row.def),
    impact: Number(row.impact),
    critRate: Number(row.crit_rate),
    critDmg: Number(row.crit_dmg),
    attributeDmgBonus: Number(row.attribute_dmg_bonus),
    anomalyMastery: Number(row.anomaly_mastery),
    anomalyProficiency: Number(row.anomaly_proficiency),
    penRatio: Number(row.pen_ratio),
    penFlat: Number(row.pen_flat),
    energyRegen: Number(row.energy_regen),
  };
}

// GET /api/profile/history?limit=50
// Growth over time: one point per stored snapshot, grouped per agent.
//
//   {
//     snapshots: [{ snapshotId, fetchedAt, interknotLevel, agentCount }],   // oldest → newest
//     agents: [{
//       agentId, name, iconUrl, attribute, specialty, rarity,
//       points: [{ snapshotId, fetchedAt, level, promotionLevel, mindscapeCinema,
//                  coreSkillEnhancement, stats: {...} }]                    // oldest → newest
//     }]
//   }
//
// An agent only has points for snapshots in which it was present. Returns an
// empty history (not a 404) when the user has no snapshots yet.
async function getHistory(req, res, next) {
  try {
    const requested = Number.parseInt(req.query.limit, 10);
    const limit =
      Number.isInteger(requested) && requested > 0
        ? Math.min(requested, MAX_HISTORY_LIMIT)
        : DEFAULT_HISTORY_LIMIT;

    const snapshotRows = await zzzProfileModel.getSnapshotHistory(req.userId, limit);
    if (snapshotRows.length === 0) {
      return res.status(200).json({ snapshots: [], agents: [] });
    }

    const agentRows = await zzzProfileModel.getAgentSnapshotsForProfiles(snapshotRows.map((s) => s.id));

    const snapshotIndex = new Map(snapshotRows.map((s, i) => [s.id, i]));
    const agentCounts = new Map();
    const byAgent = new Map();

    for (const row of agentRows) {
      const index = snapshotIndex.get(row.profile_snapshot_id);
      const snapshot = snapshotRows[index];

      agentCounts.set(row.profile_snapshot_id, (agentCounts.get(row.profile_snapshot_id) || 0) + 1);

      if (!byAgent.has(row.agent_id)) {
        byAgent.set(row.agent_id, {
          agentId: row.agent_id,
          name: row.name,
          iconUrl: row.icon_url,
          attribute: row.attribute,
          specialty: row.specialty,
          rarity: row.rarity,
          points: [],
        });
      }

      byAgent.get(row.agent_id).points.push({
        _order: index,
        snapshotId: row.profile_snapshot_id,
        fetchedAt: snapshot.fetched_at,
        level: row.level,
        promotionLevel: row.promotion_level,
        mindscapeCinema: row.mindscape_cinema,
        coreSkillEnhancement: row.core_skill_enhancement,
        stats: toStats(row),
      });
    }

    const agents = [...byAgent.values()]
      .map((agent) => ({
        ...agent,
        points: agent.points
          .sort((a, b) => a._order - b._order)
          .map(({ _order, ...point }) => point),
      }))
      // Highest-level agents first, then alphabetical — stable for the UI.
      .sort((a, b) => {
        const levelA = a.points[a.points.length - 1].level;
        const levelB = b.points[b.points.length - 1].level;
        return levelB - levelA || a.name.localeCompare(b.name);
      });

    const snapshots = snapshotRows.map((s) => ({
      snapshotId: s.id,
      fetchedAt: s.fetched_at,
      interknotLevel: s.interknot_level,
      agentCount: agentCounts.get(s.id) || 0,
    }));

    return res.status(200).json({ snapshots, agents });
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

module.exports = { getProfile, getHistory, refreshProfile };
