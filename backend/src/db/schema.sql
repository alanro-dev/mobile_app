-- Run this once against your Neon database to create/update the schema.
-- Either: psql "$DATABASE_URL" -f src/db/schema.sql
-- Or:     npm run db:migrate

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gives us gen_random_uuid()

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safe to re-run: adds the column only if it isn't already there
-- (covers people who ran migrate.js before 'name' existed).
ALTER TABLE users ADD COLUMN IF NOT EXISTS name TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- ═══════════════════════════════════════════════════════════════════════════
-- Zenless Zone Zero profile data
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN IF NOT EXISTS zzz_uid TEXT UNIQUE;

-- ─── Metadata (refreshed periodically from Enka's static game-data store) ────
-- Keyed by the numeric game ID used throughout Enka's raw API responses.

CREATE TABLE IF NOT EXISTS zzz_agents (
  id            INTEGER     PRIMARY KEY,
  name          TEXT        NOT NULL,
  attribute     TEXT,                 -- e.g. "Ice", "Fire", "Ether"
  specialty     TEXT,                 -- e.g. "Attack", "Stun", "Support"
  rarity        TEXT,                 -- "S" | "A" | "B"
  icon_url      TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zzz_weapons (
  id            INTEGER     PRIMARY KEY,
  name          TEXT        NOT NULL,
  specialty     TEXT,
  rarity        TEXT,
  icon_url      TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zzz_equipment (
  id            INTEGER     PRIMARY KEY,   -- Drive Disc set-piece ID
  set_id        INTEGER,
  set_name      TEXT,
  rarity        TEXT,
  icon_url      TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS zzz_properties (
  id            INTEGER     PRIMARY KEY,   -- PropertyId, e.g. 11103 = HP (flat)
  name          TEXT        NOT NULL,      -- e.g. "HP", "ATK%", "CRIT Rate"
  is_percent    BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tracks when each metadata table was last refreshed from Enka's store,
-- so we can check staleness without a separate scheduler/cron.
CREATE TABLE IF NOT EXISTS zzz_metadata_refresh (
  id            TEXT        PRIMARY KEY DEFAULT 'singleton',
  refreshed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Snapshots (one full set written per profile refresh) ────────────────────

CREATE TABLE IF NOT EXISTS profile_snapshots (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  uid             TEXT        NOT NULL,
  nickname        TEXT,
  interknot_level INTEGER,
  region          TEXT,
  fetched_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profile_snapshots_user_latest
  ON profile_snapshots(user_id, fetched_at DESC);

CREATE TABLE IF NOT EXISTS agent_snapshots (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_snapshot_id   UUID        NOT NULL REFERENCES profile_snapshots(id) ON DELETE CASCADE,
  agent_id              INTEGER     NOT NULL REFERENCES zzz_agents(id),
  level                 INTEGER     NOT NULL,
  promotion_level       INTEGER     NOT NULL DEFAULT 0,
  mindscape_cinema      INTEGER     NOT NULL DEFAULT 0,  -- constellation-equivalent rank (0-6)
  core_skill_enhancement INTEGER    NOT NULL DEFAULT 0,

  -- Gear-derived stat totals (see resolveProfile.service.js for calc notes —
  -- these are bonuses from equipped gear, NOT the full in-game final stat,
  -- which also needs each agent's base-stat growth curve).
  hp                    NUMERIC     NOT NULL DEFAULT 0,
  atk                   NUMERIC     NOT NULL DEFAULT 0,
  def                   NUMERIC     NOT NULL DEFAULT 0,
  impact                NUMERIC     NOT NULL DEFAULT 0,
  crit_rate             NUMERIC     NOT NULL DEFAULT 0,
  crit_dmg              NUMERIC     NOT NULL DEFAULT 0,
  attribute_dmg_bonus   NUMERIC     NOT NULL DEFAULT 0,
  anomaly_mastery       NUMERIC     NOT NULL DEFAULT 0,
  anomaly_proficiency   NUMERIC     NOT NULL DEFAULT 0,
  pen_ratio             NUMERIC     NOT NULL DEFAULT 0,
  pen_flat              NUMERIC     NOT NULL DEFAULT 0,
  energy_regen          NUMERIC     NOT NULL DEFAULT 0,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_snapshots_profile ON agent_snapshots(profile_snapshot_id);

-- One skill row per agent per snapshot (basic/dodge/assist/special/chain/passive).
CREATE TABLE IF NOT EXISTS agent_skill_snapshots (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_snapshot_id UUID        NOT NULL REFERENCES agent_snapshots(id) ON DELETE CASCADE,
  skill_type        TEXT        NOT NULL,  -- "basic" | "dodge" | "assist" | "special" | "chain" | "passive"
  level             INTEGER     NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_agent_skill_snapshots_agent ON agent_skill_snapshots(agent_snapshot_id);

CREATE TABLE IF NOT EXISTS weapon_snapshots (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_snapshot_id UUID        NOT NULL REFERENCES agent_snapshots(id) ON DELETE CASCADE,
  weapon_id         INTEGER     NOT NULL REFERENCES zzz_weapons(id),
  level             INTEGER     NOT NULL,
  phase             INTEGER     NOT NULL DEFAULT 1,   -- ascension "star mark"
  modification      INTEGER     NOT NULL DEFAULT 1,   -- refinement rank (1-5)
  main_stat_id      INTEGER     REFERENCES zzz_properties(id),
  main_stat_value   NUMERIC     NOT NULL DEFAULT 0,
  sub_stat_id       INTEGER     REFERENCES zzz_properties(id),
  sub_stat_value    NUMERIC     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_weapon_snapshots_agent ON weapon_snapshots(agent_snapshot_id);

CREATE TABLE IF NOT EXISTS disc_snapshots (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_snapshot_id UUID        NOT NULL REFERENCES agent_snapshots(id) ON DELETE CASCADE,
  equipment_id      INTEGER     NOT NULL REFERENCES zzz_equipment(id),
  slot              INTEGER     NOT NULL,   -- 1-6
  level             INTEGER     NOT NULL DEFAULT 0,
  main_stat_id      INTEGER     REFERENCES zzz_properties(id),
  main_stat_value   NUMERIC     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_disc_snapshots_agent ON disc_snapshots(agent_snapshot_id);

CREATE TABLE IF NOT EXISTS disc_substats (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  disc_snapshot_id  UUID        NOT NULL REFERENCES disc_snapshots(id) ON DELETE CASCADE,
  property_id       INTEGER     NOT NULL REFERENCES zzz_properties(id),
  value             NUMERIC     NOT NULL DEFAULT 0,
  rolls             INTEGER     NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_disc_substats_disc ON disc_substats(disc_snapshot_id);

-- ─── Growth-curve data (needed to compute real final stats, not just gear) ───
-- Confirmed against the live EnkaNetwork/API-docs store/zzz files: avatars.json
-- includes each agent's BaseProps/GrowthProps/PromotionProps/CoreEnhancementProps,
-- and weapons.json includes each W-Engine's MainStat/SecondaryStat base values.
-- Stored as JSONB so we don't need another migration every time the shape shifts.

ALTER TABLE zzz_agents ADD COLUMN IF NOT EXISTS base_props JSONB;
ALTER TABLE zzz_agents ADD COLUMN IF NOT EXISTS growth_props JSONB;
ALTER TABLE zzz_agents ADD COLUMN IF NOT EXISTS promotion_props JSONB;
ALTER TABLE zzz_agents ADD COLUMN IF NOT EXISTS core_enhancement_props JSONB;

ALTER TABLE zzz_weapons ADD COLUMN IF NOT EXISTS main_stat JSONB;
ALTER TABLE zzz_weapons ADD COLUMN IF NOT EXISTS secondary_stat JSONB;

-- The disc main-stat formula needs the *numeric* rarity (2/3/4), while `rarity`
-- stores the friendly letter (B/A/S) for display.
ALTER TABLE zzz_equipment ADD COLUMN IF NOT EXISTS rarity_value INTEGER;
