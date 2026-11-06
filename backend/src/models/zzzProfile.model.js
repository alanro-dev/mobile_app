const pool = require('../db/pool');

// ─── Writes (used by resolveProfile.service.js when storing a new snapshot) ──

async function insertProfileSnapshot(userId, uid, nickname, interknotLevel, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO profile_snapshots (user_id, uid, nickname, interknot_level, fetched_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id`,
    [userId, uid, nickname, interknotLevel]
  );
  return rows[0].id;
}

async function insertAgentSnapshot(profileSnapshotId, avatar, stats, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO agent_snapshots (
       profile_snapshot_id, agent_id, level, promotion_level, mindscape_cinema, core_skill_enhancement,
       hp, atk, def, impact, crit_rate, crit_dmg, attribute_dmg_bonus,
       anomaly_mastery, anomaly_proficiency, pen_ratio, pen_flat, energy_regen
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
     RETURNING id`,
    [
      profileSnapshotId,
      avatar.agentId,
      avatar.level,
      avatar.promotionLevel,
      avatar.mindscapeCinema,
      avatar.coreSkillEnhancement,
      stats.hp,
      stats.atk,
      stats.def,
      stats.impact,
      stats.crit_rate,
      stats.crit_dmg,
      stats.attribute_dmg_bonus,
      stats.anomaly_mastery,
      stats.anomaly_proficiency,
      stats.pen_ratio,
      stats.pen_flat,
      stats.energy_regen,
    ]
  );
  return rows[0].id;
}

async function insertWeaponSnapshot(agentSnapshotId, weapon, db = pool) {
  await db.query(
    `INSERT INTO weapon_snapshots (
       agent_snapshot_id, weapon_id, level, phase, modification,
       main_stat_id, main_stat_value, sub_stat_id, sub_stat_value
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      agentSnapshotId,
      weapon.weaponId,
      weapon.level,
      weapon.phase,
      weapon.modification,
      weapon.mainStatId ?? null,
      weapon.mainStatValue ?? 0,
      weapon.subStatId ?? null,
      weapon.subStatValue ?? 0,
    ]
  );
}

async function insertDiscSnapshot(agentSnapshotId, disc, db = pool) {
  const { rows } = await db.query(
    `INSERT INTO disc_snapshots (agent_snapshot_id, equipment_id, slot, level, main_stat_id, main_stat_value)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [agentSnapshotId, disc.equipmentId, disc.slot, disc.level, disc.mainStatId, disc.mainStatValue]
  );
  return rows[0].id;
}

async function insertDiscSubstat(discSnapshotId, substat, db = pool) {
  await db.query(
    `INSERT INTO disc_substats (disc_snapshot_id, property_id, value, rolls)
     VALUES ($1, $2, $3, $4)`,
    [discSnapshotId, substat.propertyId, substat.value, substat.rolls ?? 1]
  );
}

async function insertSkillSnapshot(agentSnapshotId, skillType, level, db = pool) {
  await db.query(
    `INSERT INTO agent_skill_snapshots (agent_snapshot_id, skill_type, level) VALUES ($1, $2, $3)`,
    [agentSnapshotId, skillType, level]
  );
}

// ─── Reads (used by GET /api/profile) ────────────────────────────────────────

async function getLatestSnapshot(userId) {
  const { rows } = await pool.query(
    `SELECT * FROM profile_snapshots WHERE user_id = $1 ORDER BY fetched_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] || null;
}

async function getAgentSnapshots(profileSnapshotId) {
  const { rows } = await pool.query(
    `SELECT ags.*, za.name, za.attribute, za.specialty, za.rarity, za.icon_url
     FROM agent_snapshots ags
     JOIN zzz_agents za ON za.id = ags.agent_id
     WHERE ags.profile_snapshot_id = $1
     ORDER BY ags.level DESC, za.name ASC, ags.agent_id ASC`,
    [profileSnapshotId]
  );
  return rows;
}

async function getWeaponSnapshot(agentSnapshotId) {
  const { rows } = await pool.query(
    `SELECT ws.*, zw.name, zw.specialty, zw.rarity, zw.icon_url,
            mp.name AS main_stat_name, mp.is_percent AS main_stat_is_percent,
            sp.name AS sub_stat_name, sp.is_percent AS sub_stat_is_percent
     FROM weapon_snapshots ws
     JOIN zzz_weapons zw ON zw.id = ws.weapon_id
     LEFT JOIN zzz_properties mp ON mp.id = ws.main_stat_id
     LEFT JOIN zzz_properties sp ON sp.id = ws.sub_stat_id
     WHERE ws.agent_snapshot_id = $1
     LIMIT 1`,
    [agentSnapshotId]
  );
  return rows[0] || null;
}

async function getDiscSnapshots(agentSnapshotId) {
  const { rows } = await pool.query(
    `SELECT ds.*, ze.set_name, ze.rarity, ze.icon_url,
            mp.name AS main_stat_name, mp.is_percent AS main_stat_is_percent
     FROM disc_snapshots ds
     JOIN zzz_equipment ze ON ze.id = ds.equipment_id
     LEFT JOIN zzz_properties mp ON mp.id = ds.main_stat_id
     WHERE ds.agent_snapshot_id = $1
     ORDER BY ds.slot ASC`,
    [agentSnapshotId]
  );
  return rows;
}

async function getDiscSubstats(discSnapshotId) {
  const { rows } = await pool.query(
    `SELECT sub.*, zp.name, zp.is_percent
     FROM disc_substats sub
     JOIN zzz_properties zp ON zp.id = sub.property_id
     WHERE sub.disc_snapshot_id = $1`,
    [discSnapshotId]
  );
  return rows;
}

async function getSkillSnapshots(agentSnapshotId) {
  const { rows } = await pool.query(
    `SELECT skill_type, level FROM agent_skill_snapshots WHERE agent_snapshot_id = $1`,
    [agentSnapshotId]
  );
  return rows;
}

// ─── Batched reads (used by GET /api/profile) ────────────────────────────────
// One query per table for the WHOLE roster, instead of several per agent.

const SKILL_ORDER_SQL = `array_position(ARRAY['basic','special','dash','ultimate','core','assist'], skill_type), skill_type`;

async function getWeaponSnapshotsForAgents(agentSnapshotIds) {
  if (!agentSnapshotIds.length) return [];
  const { rows } = await pool.query(
    `SELECT ws.*, zw.name, zw.specialty, zw.rarity, zw.icon_url,
            mp.name AS main_stat_name, mp.is_percent AS main_stat_is_percent,
            sp.name AS sub_stat_name, sp.is_percent AS sub_stat_is_percent
     FROM weapon_snapshots ws
     JOIN zzz_weapons zw ON zw.id = ws.weapon_id
     LEFT JOIN zzz_properties mp ON mp.id = ws.main_stat_id
     LEFT JOIN zzz_properties sp ON sp.id = ws.sub_stat_id
     WHERE ws.agent_snapshot_id = ANY($1::uuid[])`,
    [agentSnapshotIds]
  );
  return rows;
}

async function getDiscSnapshotsForAgents(agentSnapshotIds) {
  if (!agentSnapshotIds.length) return [];
  const { rows } = await pool.query(
    `SELECT ds.*, ze.set_name, ze.rarity, ze.icon_url,
            mp.name AS main_stat_name, mp.is_percent AS main_stat_is_percent
     FROM disc_snapshots ds
     JOIN zzz_equipment ze ON ze.id = ds.equipment_id
     LEFT JOIN zzz_properties mp ON mp.id = ds.main_stat_id
     WHERE ds.agent_snapshot_id = ANY($1::uuid[])
     ORDER BY ds.agent_snapshot_id, ds.slot ASC`,
    [agentSnapshotIds]
  );
  return rows;
}

async function getDiscSubstatsForDiscs(discSnapshotIds) {
  if (!discSnapshotIds.length) return [];
  const { rows } = await pool.query(
    `SELECT sub.*, zp.name, zp.is_percent
     FROM disc_substats sub
     JOIN zzz_properties zp ON zp.id = sub.property_id
     WHERE sub.disc_snapshot_id = ANY($1::uuid[])`,
    [discSnapshotIds]
  );
  return rows;
}

async function getSkillSnapshotsForAgents(agentSnapshotIds) {
  if (!agentSnapshotIds.length) return [];
  const { rows } = await pool.query(
    `SELECT agent_snapshot_id, skill_type, level
     FROM agent_skill_snapshots
     WHERE agent_snapshot_id = ANY($1::uuid[])
     ORDER BY agent_snapshot_id, ${SKILL_ORDER_SQL}`,
    [agentSnapshotIds]
  );
  return rows;
}

// ─── History (used by GET /api/profile/history) ──────────────────────────────

// The most recent `limit` snapshots for a user, returned oldest → newest so the
// client can plot them left to right without re-sorting.
async function getSnapshotHistory(userId, limit) {
  const { rows } = await pool.query(
    `SELECT id, fetched_at, interknot_level
     FROM (
       SELECT id, fetched_at, interknot_level
       FROM profile_snapshots
       WHERE user_id = $1
       ORDER BY fetched_at DESC
       LIMIT $2
     ) recent
     ORDER BY fetched_at ASC`,
    [userId, limit]
  );
  return rows;
}

// Every agent row (core fields + stats only, no gear) for a set of snapshots,
// in ONE query — avoids the per-agent query pattern used by GET /api/profile.
async function getAgentSnapshotsForProfiles(profileSnapshotIds) {
  if (!profileSnapshotIds.length) return [];
  const { rows } = await pool.query(
    `SELECT ags.id, ags.profile_snapshot_id, ags.agent_id,
            ags.level, ags.promotion_level, ags.mindscape_cinema, ags.core_skill_enhancement,
            ags.hp, ags.atk, ags.def, ags.impact, ags.crit_rate, ags.crit_dmg,
            ags.attribute_dmg_bonus, ags.anomaly_mastery, ags.anomaly_proficiency,
            ags.pen_ratio, ags.pen_flat, ags.energy_regen,
            za.name, za.attribute, za.specialty, za.rarity, za.icon_url
     FROM agent_snapshots ags
     JOIN zzz_agents za ON za.id = ags.agent_id
     WHERE ags.profile_snapshot_id = ANY($1::uuid[])`,
    [profileSnapshotIds]
  );
  return rows;
}

module.exports = {
  insertProfileSnapshot,
  insertAgentSnapshot,
  insertWeaponSnapshot,
  insertDiscSnapshot,
  insertDiscSubstat,
  insertSkillSnapshot,
  getLatestSnapshot,
  getAgentSnapshots,
  getWeaponSnapshot,
  getDiscSnapshots,
  getDiscSubstats,
  getSkillSnapshots,
  getWeaponSnapshotsForAgents,
  getDiscSnapshotsForAgents,
  getDiscSubstatsForDiscs,
  getSkillSnapshotsForAgents,
  getSnapshotHistory,
  getAgentSnapshotsForProfiles,
};
