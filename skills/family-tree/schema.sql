-- Edge Family Module schema.
-- File: ~/.openclaw/workspace/family/data/family.db
-- Source of truth for the family-side storage. crm.db is NOT modified by this module.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ----------------------------------------------------------------------------
-- family_members: canonical record per person (shared across all family agents)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS family_members (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  gedcom_id         TEXT UNIQUE NOT NULL,          -- e.g. "I46106454245"
  display_name      TEXT NOT NULL,
  given_name        TEXT,
  surname           TEXT,
  suffix            TEXT,
  sex               TEXT,                          -- M | F | U
  birth_date        TEXT,                          -- ISO-ish; may be partial "1901-00-00"
  birth_year        INTEGER,
  birth_place       TEXT,
  death_date        TEXT,
  death_year        INTEGER,
  death_place       TEXT,
  occupation        TEXT,
  residence_city    TEXT,                          -- populated over time via family_facts capture
  residence_state   TEXT,
  residence_country TEXT,
  is_living         INTEGER NOT NULL DEFAULT 0,    -- 0 | 1
  family_closeness  INTEGER,                       -- BFS degree from Dan (0..N); NULL if unreachable
  family_relation   TEXT,                          -- "parent", "grandmother", "1st cousin", "half-sibling", ...
  family_priority   TEXT,                          -- "Very High" | "High" | "Medium" | "Low" | NULL
  media_refs        TEXT,                          -- JSON array of absolute paths (resolved disk files only)
  primary_media     TEXT,                          -- single primary photo absolute path, if any
  notes             TEXT,                          -- from GEDCOM NOTE tags (newline-joined)
  sources_count     INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fm_gedcom_id    ON family_members(gedcom_id);
CREATE INDEX IF NOT EXISTS idx_fm_closeness    ON family_members(family_closeness);
CREATE INDEX IF NOT EXISTS idx_fm_display_name ON family_members(display_name);
CREATE INDEX IF NOT EXISTS idx_fm_surname      ON family_members(surname);
CREATE INDEX IF NOT EXISTS idx_fm_birth_year   ON family_members(birth_year);

-- ----------------------------------------------------------------------------
-- crm_link: dedup bridge to crm.db for the few family members who are also in
-- Notion-sourced business contacts. crm_contact_id references crm.db:contacts.id
-- (FK not enforced across DB files — verify at application layer).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS crm_link (
  family_member_id  INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  crm_contact_id    INTEGER NOT NULL,              -- crm.db:contacts.id (cross-DB; app enforces)
  matched_by        TEXT NOT NULL,                 -- 'name+birthyear' | 'manual' | 'email'
  confidence        TEXT NOT NULL,                 -- 'high' | 'medium' | 'manual'
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (family_member_id, crm_contact_id)
);
CREATE INDEX IF NOT EXISTS idx_crmlink_crm ON crm_link(crm_contact_id);

-- ----------------------------------------------------------------------------
-- family_facts: growth-loop captures (preferences, life events, wishes).
-- owner_agent attributes the capture — dan-primary, danny-primary, etc.
-- Reads on a person's dossier show facts from ALL owners. Confirmation queue
-- filters to WHERE owner_agent = <caller> so each person confirms their own.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS family_facts (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  family_member_id   INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  owner_agent        TEXT NOT NULL,                -- 'dan-primary' | 'danny-primary' | ...
  fact_type          TEXT NOT NULL,                -- 'preference' | 'life_event' | 'wish' | 'dislike' | 'trivia' | 'residence'
  fact_subtype       TEXT,                         -- 'food' | 'drink' | 'hobby' | 'move' | 'job' | ...
  fact_text          TEXT NOT NULL,
  source             TEXT NOT NULL,                -- 'trigger_phrase' | 'explicit' | 'nightshift_distill'
  source_ref         TEXT,                         -- message/email id for trace
  captured_at        INTEGER NOT NULL,             -- unix epoch seconds
  confirmed_by_owner INTEGER,                      -- NULL=pending; 1=kept; 0=rejected
  superseded_by      INTEGER REFERENCES family_facts(id)
);
CREATE INDEX IF NOT EXISTS idx_ff_person  ON family_facts(family_member_id);
CREATE INDEX IF NOT EXISTS idx_ff_owner   ON family_facts(owner_agent);
CREATE INDEX IF NOT EXISTS idx_ff_pending ON family_facts(confirmed_by_owner, owner_agent)
  WHERE confirmed_by_owner IS NULL;

-- ----------------------------------------------------------------------------
-- family_gifts: per-agent gift ledger. Reads filter to caller's own ledger by default.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS family_gifts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  family_member_id  INTEGER NOT NULL REFERENCES family_members(id) ON DELETE CASCADE,
  owner_agent       TEXT NOT NULL,
  occasion          TEXT NOT NULL,                 -- 'birthday' | 'christmas' | 'anniversary' | 'other'
  year              INTEGER NOT NULL,
  item              TEXT NOT NULL,
  notes             TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_fg_person ON family_gifts(family_member_id);
CREATE INDEX IF NOT EXISTS idx_fg_owner  ON family_gifts(owner_agent);

-- ----------------------------------------------------------------------------
-- research_cache_meta: tracks nightshift phase-9 research scheduling.
-- Weighted round-robin: score = days_since_last / refresh_interval_days.
-- refresh_interval_days seeded at ingest: 14 (closeness=1), 30 (2), 90 (3+).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS research_cache_meta (
  family_member_id       INTEGER PRIMARY KEY REFERENCES family_members(id) ON DELETE CASCADE,
  last_researched        INTEGER,                  -- unix epoch seconds; NULL = never
  refresh_interval_days  INTEGER NOT NULL          -- seeded by ingester based on closeness
);

-- Trigger: keep family_members.updated_at current
CREATE TRIGGER IF NOT EXISTS trg_fm_updated_at
AFTER UPDATE ON family_members
FOR EACH ROW
BEGIN
  UPDATE family_members SET updated_at = datetime('now') WHERE id = NEW.id;
END;
