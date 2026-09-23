const pool = require('../db/pool');

const STALE_AFTER_MS = 24 * 60 * 60 * 1000; // refresh metadata at most once a day

async function isStale() {
  const { rows } = await pool.query(
    "SELECT refreshed_at FROM zzz_metadata_refresh WHERE id = 'singleton'"
  );
  if (!rows[0]) return true;
  return Date.now() - new Date(rows[0].refreshed_at).getTime() > STALE_AFTER_MS;
}

async function markRefreshed() {
  await pool.query(
    `INSERT INTO zzz_metadata_refresh (id, refreshed_at) VALUES ('singleton', NOW())
     ON CONFLICT (id) DO UPDATE SET refreshed_at = NOW()`
  );
}

async function upsertAgent(agent) {
  await pool.query(
    `INSERT INTO zzz_agents (id, name, attribute, specialty, rarity, icon_url, base_props, growth_props, promotion_props, core_enhancement_props)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, attribute = EXCLUDED.attribute, specialty = EXCLUDED.specialty,
       rarity = EXCLUDED.rarity, icon_url = EXCLUDED.icon_url,
       base_props = EXCLUDED.base_props, growth_props = EXCLUDED.growth_props,
       promotion_props = EXCLUDED.promotion_props, core_enhancement_props = EXCLUDED.core_enhancement_props,
       updated_at = NOW()`,
    [
      agent.id,
      agent.name,
      agent.attribute ?? null,
      agent.specialty ?? null,
      agent.rarity ?? null,
      agent.iconUrl ?? null,
      JSON.stringify(agent.baseProps ?? {}),
      JSON.stringify(agent.growthProps ?? {}),
      JSON.stringify(agent.promotionProps ?? []),
      JSON.stringify(agent.coreEnhancementProps ?? []),
    ]
  );
}

async function upsertWeapon(weapon) {
  await pool.query(
    `INSERT INTO zzz_weapons (id, name, specialty, rarity, icon_url, main_stat, secondary_stat)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name, specialty = EXCLUDED.specialty, rarity = EXCLUDED.rarity,
       icon_url = EXCLUDED.icon_url, main_stat = EXCLUDED.main_stat, secondary_stat = EXCLUDED.secondary_stat,
       updated_at = NOW()`,
    [
      weapon.id,
      weapon.name,
      weapon.specialty ?? null,
      weapon.rarity ?? null,
      weapon.iconUrl ?? null,
      JSON.stringify(weapon.mainStat ?? null),
      JSON.stringify(weapon.secondaryStat ?? null),
    ]
  );
}

async function upsertEquipment(equipment) {
  await pool.query(
    `INSERT INTO zzz_equipment (id, set_id, set_name, rarity, rarity_value, icon_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET
       set_id = EXCLUDED.set_id, set_name = EXCLUDED.set_name, rarity = EXCLUDED.rarity,
       rarity_value = EXCLUDED.rarity_value, icon_url = EXCLUDED.icon_url, updated_at = NOW()`,
    [
      equipment.id,
      equipment.setId ?? null,
      equipment.setName ?? null,
      equipment.rarity ?? null,
      equipment.rarityValue ?? null,
      equipment.iconUrl ?? null,
    ]
  );
}

async function upsertProperty(property) {
  await pool.query(
    `INSERT INTO zzz_properties (id, name, is_percent)
     VALUES ($1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, is_percent = EXCLUDED.is_percent, updated_at = NOW()`,
    [property.id, property.name, property.isPercent ?? false]
  );
}

async function getPropertyMeta(propertyId) {
  const { rows } = await pool.query(
    'SELECT name, is_percent FROM zzz_properties WHERE id = $1',
    [propertyId]
  );
  return rows[0]
    ? { name: rows[0].name, isPercent: rows[0].is_percent }
    : { name: String(propertyId), isPercent: false };
}

/** Growth-curve data needed to compute an agent's real (non-gear) base stats. */
async function getAgentCurve(agentId) {
  const { rows } = await pool.query(
    'SELECT base_props, growth_props, promotion_props, core_enhancement_props FROM zzz_agents WHERE id = $1',
    [agentId]
  );
  if (!rows[0]) return null;
  return {
    baseProps: rows[0].base_props || {},
    growthProps: rows[0].growth_props || {},
    promotionProps: rows[0].promotion_props || [],
    coreEnhancementProps: rows[0].core_enhancement_props || [],
  };
}

/** Base main/secondary stat values needed to compute a W-Engine's real stat values. */
async function getWeaponCurve(weaponId) {
  const { rows } = await pool.query(
    'SELECT main_stat, secondary_stat FROM zzz_weapons WHERE id = $1',
    [weaponId]
  );
  if (!rows[0]) return null;
  return { mainStat: rows[0].main_stat, secondaryStat: rows[0].secondary_stat };
}

/** Numeric rarity (2/3/4) for a piece of equipment — needed for the disc main-stat formula. */
async function getEquipmentRarityValue(equipmentId) {
  const { rows } = await pool.query('SELECT rarity_value FROM zzz_equipment WHERE id = $1', [equipmentId]);
  return rows[0]?.rarity_value ?? null;
}

module.exports = {
  isStale,
  markRefreshed,
  upsertAgent,
  upsertWeapon,
  upsertEquipment,
  upsertProperty,
  getPropertyMeta,
  getAgentCurve,
  getWeaponCurve,
  getEquipmentRarityValue,
};
