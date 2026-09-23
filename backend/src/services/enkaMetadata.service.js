/**
 * Refreshes the zzz_agents / zzz_weapons / zzz_equipment / zzz_properties
 * lookup tables from Enka.Network's static game-data "store", so raw numeric
 * IDs from the profile API can be turned into names, elements, rarities, etc.
 *
 * Source: https://github.com/EnkaNetwork/API-docs (store/zzz/*.json)
 *
 * File shapes below were confirmed by downloading and inspecting the actual
 * repo (not guessed) — see comments per parser for what's verified vs. not:
 *
 * - avatars.json: flat map { [agentId]: { Name, Rarity, ProfessionType,
 *   ElementTypes: [...], Image, CircleIcon, BaseProps, GrowthProps,
 *   PromotionProps: [...], CoreEnhancementProps: [...] } }. VERIFIED.
 * - weapons.json: flat map { [weaponId]: { ItemName, Rarity, ProfessionType,
 *   ImagePath, MainStat: {PropertyId,PropertyValue}, SecondaryStat: {...} } }.
 *   VERIFIED (cross-checked against the docs' own worked example, exact match).
 * - equipments.json: NOT a flat map — it's { Items: { [equipmentId]: {Rarity,
 *   SuitId} }, Suits: { [suitId]: {Icon, Name, SetBonusProps} } }. VERIFIED
 *   (this was the source of the original NaN crash — the old code treated
 *   the whole file as a flat id->object map).
 * - property.json: flat map { [propertyId]: { Name, Format } }. `Format`
 *   contains "%" for percent-type stats (e.g. "{0:0.#%}") and no "%" for
 *   flat/numeric ones (e.g. "{0:0}"). VERIFIED. `Name` is a plain internal
 *   code (e.g. "HpMax", "Crit"), not a loc key — kept as-is, with a small
 *   friendly-name override for the properties we surface in the UI.
 * - locs.json: { [langCode]: { [internalKey]: "Display String" } } — note
 *   this is keyed by LANGUAGE first, then by the internal key found in
 *   avatars.json's `Name` / weapons.json's `ItemName` / equipments.json
 *   Suits' `Name`. VERIFIED against real entries (e.g. locs.en["Avatar_
 *   Female_Size02_Anbi"] === "Anby").
 *
 * ⚠️ Still NOT verified (couldn't check without live network access to
 * enka.network itself, which isn't reachable from this environment):
 * - Icon CDN base URL. Paths in the store files are relative (e.g.
 *   "/ui/zzz/IconRole01.png"). Prefixing with "https://enka.network" is the
 *   standard convention Enka uses for its other games (Genshin/HSR), but
 *   confirm images actually load before shipping.
 */

const zzzMetadataModel = require('../models/zzzMetadata.model');

const STORE_BASE_URL = 'https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/zzz';
const ICON_CDN_BASE = 'https://enka.network'; // see caveat above — unverified

const STORE_FILES = {
  agents: 'avatars.json',
  weapons: 'weapons.json',
  equipment: 'equipments.json',
  properties: 'property.json', // NOTE: singular "property.json", not "properties.json"
  locs: 'locs.json',
};

const LOCALE = process.env.ENKA_LOCALE || 'en';

// property.json's own `Name` field is an internal code name, not a display
// string (e.g. "HpMax" instead of "HP", "ElementAbnormalPower" instead of
// "Anomaly Mastery"). Friendlier overrides for the ones we surface in the UI;
// anything not listed here just falls back to the raw internal name.
const PROPERTY_DISPLAY_NAMES = {
  11101: 'HP', 11102: 'HP%', 11103: 'HP',
  12101: 'ATK', 12102: 'ATK%', 12103: 'ATK',
  13101: 'DEF', 13102: 'DEF%', 13103: 'DEF',
  12201: 'Impact', 12202: 'Impact%',
  20101: 'CRIT Rate', 20103: 'CRIT Rate',
  21101: 'CRIT DMG', 21103: 'CRIT DMG',
  23101: 'PEN Ratio', 23103: 'PEN Ratio',
  23201: 'PEN', 23203: 'PEN',
  30501: 'Energy Regen', 30502: 'Energy Regen%', 30503: 'Energy Regen',
  31201: 'Anomaly Proficiency', 31203: 'Anomaly Proficiency',
  31401: 'Anomaly Mastery', 31402: 'Anomaly Mastery%', 31403: 'Anomaly Mastery',
  31501: 'Physical DMG Bonus', 31503: 'Physical DMG Bonus',
  31601: 'Fire DMG Bonus', 31603: 'Fire DMG Bonus',
  31701: 'Ice DMG Bonus', 31703: 'Ice DMG Bonus',
  31801: 'Electric DMG Bonus', 31803: 'Electric DMG Bonus',
  31901: 'Ether DMG Bonus', 31903: 'Ether DMG Bonus',
};

const RARITY_LETTER = { 4: 'S', 3: 'A', 2: 'B' };

// avatars.json's ElementTypes uses different strings than the property table's
// naming (verified against the full real dataset — every distinct value seen
// across all 60 agents: AuricEther, Elec, Ether, Fire, FireFrost, Ice, Lumen,
// Physics, Wind, ZhenZhenAssault). The five standard elements map cleanly to
// the five documented "X DMG Bonus" properties; the others are special
// per-agent mechanic tags with no corresponding DMG Bonus property id in the
// docs, so they're displayed as-is but resolveProfile.service.js's
// ATTRIBUTE_DMG_BONUS_IDS won't match them (attribute_dmg_bonus safely falls
// back to 0 for those agents rather than guessing).
const ELEMENT_DISPLAY_NAMES = {
  Elec: 'Electric',
  Physics: 'Physical',
  Fire: 'Fire',
  Ice: 'Ice',
  Ether: 'Ether',
};

async function fetchJson(fileName) {
  const res = await fetch(`${STORE_BASE_URL}/${fileName}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch Enka store file "${fileName}": HTTP ${res.status}`);
  }
  return res.json();
}

function locName(locs, key) {
  if (!key) return null;
  return locs[LOCALE]?.[key] ?? key;
}

function iconUrl(path) {
  return path ? `${ICON_CDN_BASE}${path}` : null;
}

async function isMetadataStale() {
  return zzzMetadataModel.isStale();
}

/**
 * Re-downloads Enka's store JSON and upserts it into our metadata tables.
 * Safe to call frequently — callers should gate this behind
 * isMetadataStale() to avoid hammering GitHub's raw content CDN.
 */
async function refreshMetadata() {
  const [locs, agents, weapons, equipment, properties] = await Promise.all([
    fetchJson(STORE_FILES.locs),
    fetchJson(STORE_FILES.agents),
    fetchJson(STORE_FILES.weapons),
    fetchJson(STORE_FILES.equipment),
    fetchJson(STORE_FILES.properties),
  ]);

  // --- Agents ---------------------------------------------------------------
  for (const [idStr, a] of Object.entries(agents)) {
    const id = Number(idStr);
    if (Number.isNaN(id)) continue;
    await zzzMetadataModel.upsertAgent({
      id,
      name: locName(locs, a.Name) ?? a.Name,
      attribute: Array.isArray(a.ElementTypes)
        ? ELEMENT_DISPLAY_NAMES[a.ElementTypes[0]] ?? a.ElementTypes[0] ?? null
        : null,
      specialty: a.ProfessionType ?? null,
      rarity: RARITY_LETTER[a.Rarity] ?? null,
      iconUrl: iconUrl(a.CircleIcon || a.Image),
      baseProps: a.BaseProps || {},
      growthProps: a.GrowthProps || {},
      promotionProps: a.PromotionProps || [],
      coreEnhancementProps: a.CoreEnhancementProps || [],
    });
  }

  // --- Weapons (W-Engines) ----------------------------------------------------
  for (const [idStr, w] of Object.entries(weapons)) {
    const id = Number(idStr);
    if (Number.isNaN(id)) continue;
    await zzzMetadataModel.upsertWeapon({
      id,
      name: locName(locs, w.ItemName) ?? w.ItemName,
      specialty: w.ProfessionType ?? null,
      rarity: RARITY_LETTER[w.Rarity] ?? null,
      iconUrl: iconUrl(w.ImagePath),
      mainStat: w.MainStat ?? null,
      secondaryStat: w.SecondaryStat ?? null,
    });
  }

  // --- Equipment (Drive Discs) -------------------------------------------------
  // Real shape: { Items: { [id]: {Rarity, SuitId} }, Suits: { [suitId]: {Icon, Name} } }
  const items = equipment.Items || {};
  const suits = equipment.Suits || {};
  for (const [idStr, item] of Object.entries(items)) {
    const id = Number(idStr);
    if (Number.isNaN(id)) continue;
    const suit = suits[String(item.SuitId)];
    await zzzMetadataModel.upsertEquipment({
      id,
      setId: item.SuitId ?? null,
      setName: suit ? locName(locs, suit.Name) ?? suit.Name : null,
      rarity: RARITY_LETTER[item.Rarity] ?? null,
      rarityValue: item.Rarity ?? null,
      iconUrl: suit ? iconUrl(suit.Icon) : null,
    });
  }

  // --- Properties (stat IDs) -------------------------------------------------
  for (const [idStr, p] of Object.entries(properties)) {
    const id = Number(idStr);
    if (Number.isNaN(id)) continue;
    await zzzMetadataModel.upsertProperty({
      id,
      name: PROPERTY_DISPLAY_NAMES[id] ?? p.Name ?? String(id),
      isPercent: typeof p.Format === 'string' && p.Format.includes('%'),
    });
  }

  await zzzMetadataModel.markRefreshed();
}

async function refreshMetadataIfStale() {
  if (await isMetadataStale()) {
    await refreshMetadata();
  }
}

module.exports = { isMetadataStale, refreshMetadata, refreshMetadataIfStale };
