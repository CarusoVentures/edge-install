# Deploy Personal CRM v3

## Compatibility
- **OpenClaw Version**: 2026.3.27
- **Status**: READY (with Phase 0 Notion audit required before sync)
- **Blocked Commands**: None
- **Notes**: Complete rewrite of `deploy-personal-crm.md` (BLOCKED). Uses file-based config, standalone Node.js scripts, and launchd for scheduling. Zero OpenClaw CLI dependencies. Designed for macOS (Mac Mini M4 Pro). SQLite is a fast local cache; Notion is the source of truth. **Embeddings via mxbai-embed-large on oMLX (local, zero data leaves machine)** — NOT Gemini (architecture decision: Gemini rejected for confidential contact data).
- **Updated**: 2026-03-30 based on Notion Persons Directory audit (351 properties), Emily meeting (EA triage workflow), and architecture decision corrections.

## Purpose

Deploy a local SQLite CRM with semantic vector search, automated contact discovery, and a structured Notion data triage workflow for the Edge AI executive assistant on a Mac Mini M4 Pro.

The CRM acts as a fast local cache that syncs bidirectionally with Notion (the source of truth for People and Companies). But Notion's data is messy — the Persons Directory has **351 properties**, ~200 of which are one-time event-specific fields accumulated over years (Emily: "every time we plan an event, we make five new properties"). Before syncing, we need to audit the schema, present properties to Emily for triage, and build a clean field mapping.

This skill includes:
- **Phase 0: Notion Data Audit & Emily Triage** — pull live schema from any Notion database, categorize properties by AI, present to Emily via Telegram for keep/archive/transform decisions. This phase is reusable for ANY Notion database, not just People.
- **Phase 1-5: CRM deployment** — SQLite database, discovery, embedding (local via oMLX), sync, enrichment.

Enables queries like "find me the guy who runs that fintech startup in Austin" — semantic search over contact context, not just exact-match lookups.

**When to use:** After Notion workspace, Himalaya email, and Google Calendar access are deployed. Phase 0 runs first and requires Emily's active participation for triage.

**What this skill does:**
1. **Phase 0:** Pulls live Notion database schema via API, AI-categorizes properties (core/useful/event-specific/temp), presents categorized list to Emily via Telegram with approve/modify buttons, generates field mapping document
2. Creates the CRM directory structure, config, and SQLite database (7 tables — expanded from 5)
3. Installs standalone Node.js scripts: audit, init, discover, embed, sync, enrich
4. Schedules daily contact discovery (6 AM), hourly Notion sync, and post-meeting enrichment via launchd
5. Creates TOOLS.md entries for contact search, notes, and relationship history
6. Verifies end-to-end: discovery, embedding, sync, and semantic search

## Phase 0: Notion Data Audit & Triage

**This phase runs before any database or sync script is created.** It is reusable — any time we connect to a new Notion database, we run this audit first.

### Why This Exists

The Notion Persons Directory has 351 properties. The Company Directory has 113. Syncing all of them into a clean CRM would import years of event logistics ("Hat Coupons", "# of Raffle Entries", "Welcome Bag Delivered") alongside core contact data. Emily needs to decide what matters.

See `docs/research/2026-03-30-notion-people-db-audit.md` for the full property inventory.

### How It Works

```
Step 1: Pull live schema from Notion API
         ↓
Step 2: AI categorizes each property (Claude Sonnet)
         Categories: CORE / USEFUL / EVENT_SPECIFIC / NEWSLETTER / TEMP / UNKNOWN
         ↓
Step 3: Generate triage document with AI recommendations
         ↓
Step 4: Present to Emily via Telegram in batches
         "Here are 25 properties I think are CORE contact data. Agree? [Yes/Modify]"
         "Here are 15 properties I think are newsletter-related. Keep or archive? [Keep/Archive]"
         "Here are 90 event checkboxes. Archive all? [Yes/Review individually]"
         ↓
Step 5: Emily responds (approve batch / modify individual / archive all)
         ↓
Step 6: Generate field-mapping.json
         Maps: Notion property name → CRM table.column (or "archive" or "skip")
         ↓
Step 7: Operator reviews and deploys field mapping
```

### Audit Script (`crm-audit-notion.js`)

The audit script:
1. Queries `GET /v1/databases/{database_id}` to get all properties with types
2. Queries `POST /v1/databases/{database_id}/query` with `page_size: 5` to get sample values for each property
3. Sends the full property list + sample values to Claude Sonnet with this prompt:

```
You are auditing a Notion database for a VC firm. Categorize each property:

CORE: Permanent contact fields used across all workflows (name, email, phone, company, title, interests, relationship data). These map to CRM columns.

USEFUL: Not core contact data but operationally valuable (newsletter status, Dan's comments, priority flags, next steps). Keep but may not need a dedicated CRM column.

EVENT_SPECIFIC: One-time event properties (invite status, guest count, RSVP, ticket allocation, parking, welcome bag). Archive the data but remove from active schema.

NEWSLETTER: Email list management (newsletter subscription status, email campaign tracking). Keep for email skill but don't pollute CRM.

TEMP: Explicitly temporary fields ([TEMP], "Pending", "RocketReach Needed?"). Clean up.

UNKNOWN: Can't determine from name and type alone. Flag for Emily.

For each property, return:
- name, type, category, confidence (0-1), recommendation, suggested_crm_mapping (table.column or null)
```

4. Saves the categorized results to `${WORKSPACE}/crm/config/notion-audit-{database_name}.json`
5. Generates a human-readable triage document at `${WORKSPACE}/crm/config/notion-triage-{database_name}.md`

### Emily Triage via Telegram

The triage is presented in batches to avoid overwhelming Emily:

**Batch 1: CORE properties (AI confidence > 0.8)**
```
Emily, I've audited the Persons Directory (351 properties).
Here are 25 properties I'm confident are core contact data:

Name, *Email 1, Email 2, *Phone 1, Phone 2, *Company,
*LinkedIn or Bio, *Context, *Exec Summary, *Interests,
*Role Category, Industry, Dan Comments, Dan Priority,
Last Touchpoint, Next Touch Point, CV Next Step, Owner,
EA / Executive, Spouse / Sig Other, Introduced By,
Board Member, Board Observer, Created time, Company Name

These will be synced to the CRM. Agree?
[Approve All] [Review Individually]
```

**Batch 2: EVENT_SPECIFIC properties (largest group)**
```
I found ~200 event-specific properties like:
"Avs Invite", "Senator Bennett Dinner", "Hat Coupons",
"# of Raffle Entries", "Welcome Bag Delivered"...

These are one-time event logistics. I recommend archiving
the DATA (so nothing is lost) but not syncing these as
active CRM fields.

[Archive All] [Let Me Review]
```

**Batch 3: USEFUL but unclear**
```
These 15 properties seem useful but I'm not sure where they belong:
[List with AI's recommendation for each]
[Approve Recommendations] [Modify]
```

**Batch 4: TEMP/CLEANUP**
```
These look temporary. Safe to ignore for CRM sync?
[TEMP] Done, [TEMP] Updated, BW Duplicate, etc.
[Yes, Skip All] [Review]
```

Emily's responses are stored in `${WORKSPACE}/crm/config/emily-triage-decisions.json`. The field mapping is generated from her decisions.

### Field Mapping Output

After Emily's triage, the system generates `field-mapping.json`:

```json
{
  "database": "Persons Directory",
  "databaseId": "100bbced-0aa8-4135-9104-777c2f5e2e10",
  "auditedAt": "2026-03-31T...",
  "triagedBy": "Emily",
  "totalProperties": 351,
  "mappings": {
    "Name": { "action": "sync", "crmTable": "contacts", "crmColumn": "name" },
    "*Email 1": { "action": "sync", "crmTable": "contacts", "crmColumn": "email" },
    "Email 2": { "action": "sync", "crmTable": "contacts", "crmColumn": "email_secondary" },
    "*Phone 1": { "action": "sync", "crmTable": "contacts", "crmColumn": "phone" },
    "*Company": { "action": "sync", "crmTable": "contacts", "crmColumn": "company_id", "type": "relation" },
    "*LinkedIn or Bio": { "action": "sync", "crmTable": "contacts", "crmColumn": "linkedin_url" },
    "*Context": { "action": "sync", "crmTable": "contacts", "crmColumn": "context" },
    "*Exec Summary": { "action": "sync", "crmTable": "contacts", "crmColumn": "exec_summary" },
    "*Interests": { "action": "sync", "crmTable": "tags", "crmColumn": "tag", "type": "multi_select_to_tags" },
    "*Role Category": { "action": "sync", "crmTable": "tags", "crmColumn": "tag", "type": "multi_select_to_tags" },
    "EA / Executive": { "action": "sync", "crmTable": "contacts", "crmColumn": "ea_contact_id", "type": "relation" },
    "Dan Comments": { "action": "sync", "crmTable": "contacts", "crmColumn": "dan_comments" },
    "Dan Comments BW Events": { "action": "sync", "crmTable": "contacts", "crmColumn": "dan_comments_bw_events" },
    "Dan's Feedback": { "action": "sync", "crmTable": "contacts", "crmColumn": "dan_feedback" },
    "Dan Priority": { "action": "sync", "crmTable": "contacts", "crmColumn": "dan_priority" },
    "Dan Approved": { "action": "sync", "crmTable": "contacts", "crmColumn": "dan_approved" },
    "Dan's Approval to Invite": { "action": "sync", "crmTable": "contacts", "crmColumn": "dan_approval_to_invite" },
    "Avs Invite": { "action": "archive", "archiveTable": "event_participation" },
    "Senator Bennett Dinner Oct 13th": { "action": "archive", "archiveTable": "event_participation" },
    "Hat Coupons": { "action": "archive", "archiveTable": "event_participation" },
    "[TEMP] Done": { "action": "skip" },
    "[TEMP] Updated": { "action": "skip" }
  }
}
```

### Reusability

This Phase 0 audit works for ANY Notion database:

```bash
# Audit the People directory
node crm-audit-notion.js --database "100bbced-0aa8-4135-9104-777c2f5e2e10" --name "Persons Directory"

# Audit the Company directory
node crm-audit-notion.js --database "37bdaa35-5a7e-4a36-acb4-775829d4d493" --name "Company Directory"

# Audit any new database Dan creates
node crm-audit-notion.js --database "<id>" --name "Boulder Roots Sponsors"
```

Every time we connect to a new Notion database, we pull the live schema first, categorize, triage with Emily, and generate a field mapping before writing any sync code.

## How Commands Are Sent

This skill is executed by an operator who has an active remote session.
See `_deploy-common.md` -> "Command Delivery" for the full protocol.

- **Remote:** commands sent via `POST /api/devices/${DEVICE_ID}/exec` (preferred for enrolled devices) or `POST /api/sessions/${SESSION_ID}/commands`
- **Operator:** commands run on the operator's local terminal

## Variables

| Variable | Source | Example |
|----------|--------|---------|
| `${WORKSPACE}` | Client profile: workspace path | `/Users/edge/.openclaw/workspace/` |
| `${DEVICE_ID}` | Device enrollment or session context | `dev_abc123` |
| `${SESSION_ID}` | Session polling or creation (fallback if not enrolled) | `sess_abc123` |
| `${BEARER}` | `POST /api/operator/login` response | `eyJhbG...` |
| `${NOTION_API_KEY}` | Client profile or `${WORKSPACE}/.env`: Notion integration token | `ntn_abc123def456...` |
| `${NOTION_PEOPLE_DB_ID}` | `deploy-notion-workspace.md` output: People database ID | `a1b2c3d4e5f6...` |
| `${NOTION_COMPANIES_DB_ID}` | `deploy-notion-workspace.md` output: Companies database ID | `b2c3d4e5f6a1...` |
| `${GEMINI_API_KEY}` | Client profile or `${WORKSPACE}/.env`: Gemini API key for embeddings | `AIzaSy...` |
| `${TIMEZONE}` | Client profile: timezone | `America/Denver` |
| `${AGENT_USER}` | Pre-flight check: `whoami` on client machine | `edge` |
| `${AGENT_USER_UID}` | Pre-flight check: `id -u` on client machine | `501` |
| `${AGENT_HOME}` | Pre-flight check: `echo $HOME` on client machine | `/Users/edge` |
| `${NODE_PATH}` | Pre-flight check: `which node` on client machine | `/opt/homebrew/bin/node` |

## Before You Start

Follow the **Standard Deployment Protocol** in `_deploy-common.md`: read the client profile, check what exists, identify adaptations, and present a deployment plan before executing.

**Pre-flight checks for this skill:**

Detect platform, user, and home directory:

**Remote:**
```
uname -s && uname -m && whoami && id -u && echo $HOME
```

Expected: `Darwin`, `arm64` (M4 Pro), username, numeric UID, and home directory. Record as `${AGENT_USER}`, `${AGENT_USER_UID}`, and `${AGENT_HOME}`.

Resolve the Node.js path:

**Remote:**
```
which node && node --version
```

Expected: Absolute path to node (e.g., `/opt/homebrew/bin/node`) and version v18+. Record as `${NODE_PATH}`.

Check if the CRM database already exists:

**Remote:**
```
test -f ${WORKSPACE}/crm/data/crm.db && echo 'EXISTS' || echo 'NOT_FOUND'
```

Expected: `NOT_FOUND` for fresh install, `EXISTS` for upgrade (back up before proceeding).

Verify Himalaya email is deployed (dependency):

**Remote:**
```
which himalaya 2>/dev/null && himalaya --version || echo 'NO_HIMALAYA'
```

Expected: Version string. If `NO_HIMALAYA`, deploy `deploy-himalaya-email.md` first.

Verify Notion workspace is deployed (dependency):

**Remote:**
```
test -f ${WORKSPACE}/config/notion.json && echo 'NOTION_OK' || echo 'NO_NOTION'
```

Expected: `NOTION_OK`. If `NO_NOTION`, deploy `deploy-notion-workspace.md` first.

Verify Google Calendar access:

**Remote:**
```
which gcalcli 2>/dev/null && echo 'GCALCLI_OK' || (test -f ${WORKSPACE}/config/google-calendar-sa.json && echo 'SA_OK' || echo 'NO_GCAL')
```

Expected: Either `GCALCLI_OK` (gcalcli installed) or `SA_OK` (Google Calendar Service Account key exists). If `NO_GCAL`, ensure Google Calendar access is configured first.

Verify Gemini API key is available:

**Remote:**
```
grep GEMINI_API_KEY ${WORKSPACE}/.env 2>/dev/null | head -c 20 || echo 'NO_GEMINI_KEY'
```

Expected: Shows `GEMINI_API_KEY=AIza` prefix. If `NO_GEMINI_KEY`, the key must be added to `${WORKSPACE}/.env` before proceeding.

Check for existing CRM launchd jobs:

**Remote:**
```
launchctl list 2>/dev/null | grep com.edge.crm || echo 'NO_CRM_JOBS'
```

Expected: `NO_CRM_JOBS` for fresh install. If jobs exist, note them for Phase 3 (unload before reloading).

**Decision points from pre-flight:**
- Is there an existing CRM database? If so, back up before proceeding.
- Are all three dependencies met (Himalaya, Notion, Google Calendar)? All are required.
- Is the Gemini API key set? Required for vector embeddings.
- Does the client use gcalcli or a Google Calendar Service Account? The discover script must be adapted.

## Adaptation Points

| Component | Default | Customize When... |
|-----------|---------|-------------------|
| Database path | `${WORKSPACE}/crm/data/crm.db` | Client wants databases in a different location |
| Email source | Himalaya CLI (IMAP) | Client uses a different email tool (adapt discover script) |
| Calendar source | gcalcli or Google Calendar Service Account | Client uses CalDAV, Outlook, or other calendar provider |
| Embedding provider | Gemini `gemini-embedding-001` (768-dim) | Client prefers OpenAI `text-embedding-3-small` (1536-dim) |
| Notion People DB | `${NOTION_PEOPLE_DB_ID}` | Client uses a different database name or structure |
| Notion Companies DB | `${NOTION_COMPANIES_DB_ID}` | Client uses a different database name or structure |
| Discovery schedule | Daily at 6:00 AM local | Client prefers different time |
| Sync schedule | Hourly at minute 15 | Client wants more/less frequent sync |
| Enrichment trigger | Post-meeting (via transcript watcher) | Client wants manual-only enrichment |
| Sync direction | Bidirectional (Notion is source of truth for conflicts) | Client wants read-only local cache |
| Config location | `${WORKSPACE}/crm/config/crm-config.json` | Client prefers config in a different path |

## Prerequisites

- macOS machine (Mac Mini M4 Pro) with Node.js v18+ and npm
- `deploy-notion-workspace.md` completed (Notion API connection, People and Companies databases mapped)
- `deploy-himalaya-email.md` completed (Himalaya CLI configured for Gmail IMAP access)
- Google Calendar access configured (gcalcli or Service Account key at `${WORKSPACE}/config/google-calendar-sa.json`)
- Gemini API key available in `${WORKSPACE}/.env` as `GEMINI_API_KEY`
- `better-sqlite3` npm package compiles on Apple Silicon (requires Xcode CLI tools)

## What Gets Installed

### Configuration

| File | Location | Purpose |
|------|----------|---------|
| CRM config | `${WORKSPACE}/crm/config/crm-config.json` | Database paths, Notion DB IDs, API endpoints, embedding settings |

### Database

| File | Location | Purpose |
|------|----------|---------|
| CRM database | `${WORKSPACE}/crm/data/crm.db` | SQLite WAL-mode database with 5 tables |

### Database Schema (7 tables)

| Table | Purpose |
|-------|---------|
| `contacts` | Core contact records. Every Notion property marked CORE by Emily gets its own dedicated column — no merging, no summarizing, no lossy transformation. Includes: name, email, email_secondary, phone, company, title, linkedin_url, context, exec_summary, dan_comments, dan_comments_bw_events, dan_feedback, dan_priority, preferred_email, ea_contact_id, ea_email, ea_name, source, timestamps, Notion page ID. Schema is dynamically generated from Emily's field mapping — if she marks 30 properties as CORE, the table gets 30+ columns. |
| `companies` | Company records: name, industry, website, stage, relationship_status, notes, Notion page ID |
| `interactions` | Meeting/email/call/note log per contact: type, direction, summary, occurred_at |
| `tags` | Freeform tags per contact: tag name, contact ID. Syncs bidirectionally with Notion *Interests and *Role Category multi-selects. |
| `contact_embeddings` | Vector embeddings per contact via mxbai-embed-large (oMLX local, 1024 dimensions). Content text + embedding BLOB. |
| `event_participation` | Archived event-specific data from Notion. Preserves all 200+ event properties without polluting the core schema. Columns: contact_id, event_name, property_name, property_value, property_type, notion_source. |
| `field_mappings` | Stores the Emily-approved triage decisions for each Notion database. Maps Notion property → CRM action (sync/archive/skip). Every synced property gets its own column — never merged. Generated by Phase 0 audit. |

### Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `crm-audit-notion.js` | `${WORKSPACE}/crm/scripts/crm-audit-notion.js` | **Phase 0:** Pulls live Notion DB schema, AI-categorizes properties, presents to Emily for triage, generates field mapping. Reusable for any Notion database. |
| `crm-init.js` | `${WORKSPACE}/crm/scripts/crm-init.js` | Creates SQLite database with 7-table schema, WAL mode, indexes |
| `crm-discover.js` | `${WORKSPACE}/crm/scripts/crm-discover.js` | Scans Gmail (Himalaya) and Calendar for new contacts not yet in CRM |
| `crm-embed.js` | `${WORKSPACE}/crm/scripts/crm-embed.js` | Generates vector embeddings via **mxbai-embed-large on oMLX** (local, 1024 dimensions, zero data leaves machine). NOT Gemini. |
| `crm-sync.js` | `${WORKSPACE}/crm/scripts/crm-sync.js` | Bidirectional sync with Notion People and Companies databases. Reads field-mapping.json to know which properties to sync, archive, or skip. |
| `crm-enrich.js` | `${WORKSPACE}/crm/scripts/crm-enrich.js` | Enriches contacts from meeting transcripts (title, company, topics, interests) |

### Scheduled Jobs (launchd)

| Job | Label | Schedule | Mechanism |
|-----|-------|----------|-----------|
| Contact discovery | `com.edge.crm-discover` | Daily at 6:00 AM local | `StartCalendarInterval` Hour=6, Minute=0 |
| Notion sync | `com.edge.crm-sync` | Hourly at minute 15 | `StartCalendarInterval` Minute=15 |
| Post-meeting enrichment | `com.edge.crm-enrich` | Every 30 minutes | `StartInterval` 1800 seconds |

### TOOLS.md Entries

| Tool | Description |
|------|-------------|
| `crm_search` | Search contacts by name, company, or semantic query |
| `crm_add_note` | Add an interaction note to a contact |
| `crm_history` | View relationship history and interaction timeline for a contact |
| `crm_discover` | Trigger manual contact discovery scan |
| `crm_sync` | Trigger manual Notion sync |

## Steps

### Phase 1: Configuration and Database Setup

#### 1.1 Create CRM Directory Structure `[AUTO]`

Create the directory tree for the CRM: data, scripts, config, and logs.

**Remote:**
```
mkdir -p ${WORKSPACE}/crm/data ${WORKSPACE}/crm/scripts ${WORKSPACE}/crm/config ${WORKSPACE}/crm/logs
```

Expected: Four directories created. No output on success.

If this fails: Check that `${WORKSPACE}` exists. If not, create it first with `mkdir -p ${WORKSPACE}`.

If already exists: `mkdir -p` is idempotent -- safe to re-run.

#### 1.2 Write CRM Configuration File `[GUIDED]`

Write the configuration file that all CRM scripts read. This maps database paths, Notion database IDs, embedding settings, and operational parameters.

The operator must substitute all variable values before writing. Use an unquoted heredoc so the shell expands variables at write time.

**Remote:**
```
cat > ${WORKSPACE}/crm/config/crm-config.json << CONFIG_EOF
{
  "database": {
    "path": "${WORKSPACE}/crm/data/crm.db",
    "walMode": true
  },
  "notion": {
    "apiKey": "${NOTION_API_KEY}",
    "apiVersion": "2022-06-28",
    "peopleDatabaseId": "${NOTION_PEOPLE_DB_ID}",
    "companiesDatabaseId": "${NOTION_COMPANIES_DB_ID}",
    "rateLimitMs": 334,
    "syncDirection": "bidirectional",
    "conflictResolution": "notion-wins"
  },
  "embedding": {
    "provider": "omlx",
    "model": "mxbai-embed-large",
    "dimensions": 1024,
    "endpoint": "http://localhost:8000/v1/embeddings",
    "batchSize": 10,
    "rateLimitMs": 50,
    "note": "Local embeddings via oMLX. Zero data leaves the machine. Architecture decision: Gemini rejected for confidential contact data."
  },
  "fieldMapping": {
    "path": "${WORKSPACE}/crm/config/field-mapping.json",
    "note": "Generated by Phase 0 Notion audit + Emily triage. Must exist before sync runs."
  },
  "discovery": {
    "emailSource": "himalaya",
    "calendarSource": "gcalcli",
    "lookbackDays": 30,
    "dailyLookbackDays": 1,
    "ignoreDomains": ["noreply", "no-reply", "notifications", "mailer-daemon", "postmaster"],
    "ignorePatterns": ["^noreply@", "^no-reply@", "^notifications@", "^.*\\.noreply@", "^calendar-notification@"]
  },
  "enrichment": {
    "transcriptDir": "${WORKSPACE}/data/transcripts",
    "updateNotion": true,
    "extractFields": ["title", "company", "topics", "action_items"]
  },
  "sync": {
    "lastPeopleSyncAt": null,
    "lastCompaniesSyncAt": null,
    "lastDiscoverAt": null
  }
}
CONFIG_EOF
```

Expected: File exists at `${WORKSPACE}/crm/config/crm-config.json` with all values substituted (no `${...}` literals).

Verify:

**Remote:**
```
python3 -c "import json; c=json.load(open('${WORKSPACE}/crm/config/crm-config.json')); print('DB:', c['database']['path']); print('Notion People:', c['notion']['peopleDatabaseId'][:8]+'...'); print('Embedding:', c['embedding']['model']); print('Gemini key:', c['embedding']['apiKey'][:8]+'...')"
```

Expected: Shows the database path, Notion DB ID prefix, embedding model name, and Gemini key prefix. No literal `${...}` strings.

If this fails: Check that the shell expanded variables correctly. If values contain special characters, use base64 encoding instead.

If already exists: Compare content. If unchanged, skip. If different, back up as `crm-config.json.bak` and write new version.

#### 1.3 Initialize npm Project and Install Dependencies `[AUTO]`

Set up the Node.js project with required packages for SQLite access, HTTP requests, and embeddings.

**Remote:**
```
cd ${WORKSPACE}/crm && npm init -y 2>/dev/null && npm install better-sqlite3 2>&1 | tail -5
```

Expected: `package.json` created, `better-sqlite3` installed. The install may take a minute on first run as it compiles native bindings for Apple Silicon.

If this fails:
- **`better-sqlite3` compilation error:** Ensure Xcode CLI tools are installed: `xcode-select --install`. On Apple Silicon, ensure the correct architecture is used.
- **npm not found:** Check that Node.js is installed and on PATH.

If already exists: `npm install` is idempotent -- skips packages already in `node_modules/`.

#### 1.4 Write crm-init.js `[GUIDED]`

Write the database initialization script. This creates the SQLite database with WAL mode, 5 tables, and performance indexes. **Level 1 -- exact schema matters for correctness.**

The script must:
- Read config from `${WORKSPACE}/crm/config/crm-config.json`
- Create the database file if it does not exist
- Enable WAL mode and foreign keys
- Create all 5 tables with `CREATE TABLE IF NOT EXISTS` (idempotent)
- Create performance indexes
- Print a summary of tables created and row counts
- Exit with code 0 on success

**Reference implementation:**

```javascript
#!/usr/bin/env node
// crm-init.js -- Initialize the CRM SQLite database
//
// Usage: node crm-init.js
// Idempotent: safe to run multiple times. Uses CREATE TABLE IF NOT EXISTS.

const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(__dirname, '..', 'config', 'crm-config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const DB_PATH = config.database.path.replace(/^\~/, process.env.HOME);

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const Database = require('better-sqlite3');
const db = new Database(DB_PATH);

// Enable WAL mode for concurrent reads and crash safety
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// -- Core tables --

db.exec(`
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  company TEXT,
  title TEXT,
  linkedin_url TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'discovered',
  notion_page_id TEXT,
  discovered_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_interaction_at TEXT
);

CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  industry TEXT,
  website TEXT,
  notes TEXT,
  notion_page_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  type TEXT NOT NULL CHECK(type IN ('email','meeting','call','note')),
  direction TEXT CHECK(direction IN ('inbound','outbound','mutual')),
  subject TEXT,
  summary TEXT,
  occurred_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  tag TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(contact_id, tag)
);

CREATE TABLE IF NOT EXISTS contact_embeddings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id),
  content TEXT NOT NULL,
  embedding BLOB NOT NULL,
  model TEXT NOT NULL,
  dimensions INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
`);

// -- Performance indexes --

db.exec(`
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);
CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company);
CREATE INDEX IF NOT EXISTS idx_contacts_notion_page_id ON contacts(notion_page_id);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_notion_page_id ON companies(notion_page_id);
CREATE INDEX IF NOT EXISTS idx_interactions_contact_id ON interactions(contact_id);
CREATE INDEX IF NOT EXISTS idx_interactions_occurred_at ON interactions(occurred_at);
CREATE INDEX IF NOT EXISTS idx_tags_contact_id ON tags(contact_id);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);
CREATE INDEX IF NOT EXISTS idx_contact_embeddings_contact_id ON contact_embeddings(contact_id);
`);

// Report
const tables = db.prepare(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
).all();
console.log('CRM database initialized: ' + DB_PATH);
console.log('Tables (' + tables.length + '): ' + tables.map(t => t.name).join(', '));
for (const t of tables) {
  const count = db.prepare('SELECT count(*) as c FROM "' + t.name + '"').get();
  console.log('  ' + t.name + ': ' + count.c + ' rows');
}
console.log('WAL mode:', db.pragma('journal_mode', { simple: true }));
db.close();
```

Write this script to `${WORKSPACE}/crm/scripts/crm-init.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-crm-init-js>' | base64 -d > ${WORKSPACE}/crm/scripts/crm-init.js
```

Verify syntax:

**Remote:**
```
node -c ${WORKSPACE}/crm/scripts/crm-init.js && echo 'SYNTAX_OK'
```

Expected: `SYNTAX_OK`.

If this fails: Check for syntax errors in the base64-decoded output. Common issue: corrupted base64 encoding.

If already exists: Compare content. If unchanged, skip. If different, back up as `crm-init.js.bak` and write new version.

#### 1.5 Run crm-init.js to Create the Database `[GUIDED]`

Execute the init script to create the SQLite database with the full schema.

**Remote:**
```
cd ${WORKSPACE}/crm && node scripts/crm-init.js
```

Expected: Output showing database path, 5 tables created, 0 rows each, WAL mode active.

Verify:

**Remote:**
```
sqlite3 ${WORKSPACE}/crm/data/crm.db "SELECT count(*) FROM sqlite_master WHERE type='table';"
```

Expected: `5` (five tables).

**Remote:**
```
sqlite3 ${WORKSPACE}/crm/data/crm.db "PRAGMA journal_mode;"
```

Expected: `wal`.

If this fails: Check that `better-sqlite3` is installed (`ls ${WORKSPACE}/crm/node_modules/better-sqlite3`). Check file permissions on the data directory.

If already exists: All statements use `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` -- safe to re-run. Existing data is preserved.

### Phase 2: Scripts

#### 2.1 Write crm-discover.js `[GUIDED]`

Write the contact discovery script that scans Gmail (via Himalaya) and Google Calendar (via gcalcli or Service Account) for contacts not yet in the CRM. This is the primary ingestion pipeline.

The script must:
- Read config from `${WORKSPACE}/crm/config/crm-config.json`
- Open the CRM database via `better-sqlite3`
- **Gmail discovery:** Run `himalaya envelope list --page-size 100` to get recent email envelopes. Parse From/To/Cc headers to extract name + email pairs. Filter out ignored domains and patterns from config.
- **Calendar discovery:** Run `gcalcli agenda` (or query Google Calendar API with Service Account) to get recent calendar events. Extract attendee email addresses and names from event data.
- **Deduplication:** For each discovered email, check if it already exists in the `contacts` table. Skip existing contacts.
- **Insert new contacts:** Add new contacts with source `email` or `calendar`, set `discovered_at` to now.
- **Company extraction:** Parse email domain to guess company name (e.g., `john@acme.com` -> `Acme`). Create company record if not exists.
- Accept `--lookback N` flag to set the lookback window in days (default: config `lookbackDays`).
- Accept `--dry-run` flag to show what would be discovered without inserting.
- Log activity to `${WORKSPACE}/crm/logs/discover.log`.
- Print summary: N emails scanned, N calendar events scanned, N new contacts discovered, N already known.
- Exit with code 0 on success.

**Key patterns for Himalaya integration:**

```bash
# List recent email envelopes (headers only, not bodies)
himalaya envelope list --page-size 100 --output json

# The JSON output includes:
# - from: { name: "John Doe", addr: "john@acme.com" }
# - to: [{ name: "You", addr: "you@example.com" }]
# - date: "2026-03-27T10:00:00Z"
```

**Key patterns for Calendar integration:**

```bash
# gcalcli: list events with attendees
gcalcli agenda --details all --tsv "$(date -v-7d +%Y-%m-%d)" "$(date +%Y-%m-%d)"

# OR: Google Calendar API with Service Account
# Use the service account JSON at ${WORKSPACE}/config/google-calendar-sa.json
# GET https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=...&timeMax=...
```

**Discovery deduplication logic:**

```javascript
// For each extracted email address:
// 1. Check if email exists in contacts table
// 2. If yes, skip (already known)
// 3. If no, check against ignorePatterns from config
// 4. If not ignored, insert new contact
const existing = db.prepare('SELECT id FROM contacts WHERE email = ?').get(email);
if (existing) { skipped++; continue; }
const dominated = config.discovery.ignorePatterns.some(p => new RegExp(p, 'i').test(email));
if (dominated) { filtered++; continue; }
db.prepare('INSERT INTO contacts (name, email, company, source) VALUES (?, ?, ?, ?)').run(name, email, domain, source);
```

Write the script to `${WORKSPACE}/crm/scripts/crm-discover.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-crm-discover-js>' | base64 -d > ${WORKSPACE}/crm/scripts/crm-discover.js
```

Verify syntax:

**Remote:**
```
node -c ${WORKSPACE}/crm/scripts/crm-discover.js && echo 'SYNTAX_OK'
```

Expected: `SYNTAX_OK`.

If this fails: Fix syntax errors. Common issues: JSON parsing of Himalaya output, spawning external processes.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

#### 2.2 Write crm-embed.js `[GUIDED]`

Write the embedding script that generates vector embeddings for contacts using the Gemini API. This enables semantic search -- "find me the guy who runs that fintech startup in Austin" returns results based on meaning, not keyword matching.

The script must:
- Read config from `${WORKSPACE}/crm/config/crm-config.json`
- Open the CRM database via `better-sqlite3`
- For each contact without an embedding (or with stale embeddings), generate a text representation: `"${name}, ${title} at ${company}. ${notes}. Tags: ${tags}. Recent interactions: ${interaction_summaries}"`
- Call the Gemini embedding API to generate a vector embedding for each text representation
- Store the embedding as a BLOB in `contact_embeddings` along with the content text, model name, and dimension count
- **Semantic search function:** Accept a `--search "query text"` argument. Embed the query, then compute cosine similarity against all stored embeddings. Return the top N matches (default 10).
- Accept `--refresh` flag to regenerate all embeddings (for when contact data has changed significantly)
- Accept `--batch-size N` flag to control how many embeddings to generate per run (default: config `batchSize`)
- Respect Gemini rate limits: minimum `rateLimitMs` between requests
- Print progress: "Embedded 5/20 contacts..."
- Exit with code 0 on success

**Gemini Embedding API reference:**

```bash
curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}" \
  -H 'Content-Type: application/json' \
  -d '{
    "model": "models/gemini-embedding-001",
    "content": {
      "parts": [{"text": "John Doe, CTO at TechCo. Discussed AI strategy."}]
    }
  }'
# Response: { "embedding": { "values": [0.1, -0.2, ...] } }  (768 dimensions)
```

**Cosine similarity in JavaScript:**

```javascript
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

**Embedding storage as BLOB:**

```javascript
// Store: Float32Array -> Buffer -> BLOB
const floats = new Float32Array(embeddingValues);
const buffer = Buffer.from(floats.buffer);
db.prepare(
  'INSERT INTO contact_embeddings (contact_id, content, embedding, model, dimensions) VALUES (?, ?, ?, ?, ?)'
).run(contactId, contentText, buffer, 'gemini-embedding-001', 768);

// Retrieve: BLOB -> Buffer -> Float32Array
const row = db.prepare('SELECT embedding FROM contact_embeddings WHERE contact_id = ?').get(contactId);
const retrieved = new Float32Array(
  row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4
);
```

Write the script to `${WORKSPACE}/crm/scripts/crm-embed.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-crm-embed-js>' | base64 -d > ${WORKSPACE}/crm/scripts/crm-embed.js
```

Verify syntax:

**Remote:**
```
node -c ${WORKSPACE}/crm/scripts/crm-embed.js && echo 'SYNTAX_OK'
```

Expected: `SYNTAX_OK`.

If this fails: Fix syntax errors. Common issues: Buffer/Float32Array conversion, async/await patterns for API calls.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

#### 2.3 Write crm-sync.js `[GUIDED]`

Write the bidirectional sync script that keeps the local SQLite CRM in sync with Notion People and Companies databases. **Notion is the source of truth** -- when conflicts arise, Notion data wins.

The script must:
- Read config from `${WORKSPACE}/crm/config/crm-config.json`
- Open the CRM database via `better-sqlite3`
- **Pull from Notion (People):** Query Notion People database for records updated since `lastPeopleSyncAt`. For each Notion person:
  - If `notion_page_id` exists in local `contacts` table: update local fields from Notion (Notion wins on conflict)
  - If `notion_page_id` does not exist locally but email matches: link the records by setting `notion_page_id`
  - If no local match: create a new contact from Notion data
- **Pull from Notion (Companies):** Same pattern for Companies database.
- **Push to Notion:** For contacts discovered locally (via `crm-discover.js`) that do not have a `notion_page_id`:
  - Create a new page in the Notion People database
  - Store the returned page ID in `notion_page_id`
  - For the contact's company, create or link a Notion Companies page similarly
- **Conflict resolution:** If a field was modified both locally and in Notion since last sync, Notion wins. Log the conflict for operator review.
- Update `lastPeopleSyncAt` and `lastCompaniesSyncAt` in config after successful sync.
- Accept `--dry-run` flag to show what would change without making API calls.
- Accept `--full` flag to force a full re-sync ignoring sync timestamps.
- Accept `--status` flag to show last sync times and record counts.
- Accept `--push-only` or `--pull-only` flags for one-direction sync.
- Respect Notion rate limits: minimum 334ms between requests, exponential backoff on 429.
- Log sync activity to `${WORKSPACE}/crm/logs/sync.log`.
- Print summary: N pulled from Notion, N pushed to Notion, N conflicts (Notion won), N unchanged.
- Exit with code 0 on success.

**Notion API patterns for sync:**

```javascript
// Query recently updated People
// POST https://api.notion.com/v1/databases/${PEOPLE_DB_ID}/query
// Headers: Authorization: Bearer ${NOTION_API_KEY}, Notion-Version: 2022-06-28
// Body: {
//   "filter": {
//     "timestamp": "last_edited_time",
//     "last_edited_time": { "after": "2026-03-27T00:00:00Z" }
//   },
//   "page_size": 100
// }

// Create a new Person page
// POST https://api.notion.com/v1/pages
// Body: {
//   "parent": { "database_id": "${PEOPLE_DB_ID}" },
//   "properties": {
//     "Name": { "title": [{ "text": { "content": "John Doe" } }] },
//     "Email": { "email": "john@acme.com" },
//     "Company": { "rich_text": [{ "text": { "content": "Acme Corp" } }] }
//   }
// }
```

**Rate limiting with exponential backoff:**

```javascript
async function notionFetch(url, options, attempt = 0) {
  const res = await fetch(url, options);
  if (res.status === 429) {
    const wait = Math.min(1000 * Math.pow(2, attempt), 30000);
    console.log('Rate limited, waiting ' + wait + 'ms...');
    await new Promise(r => setTimeout(r, wait));
    return notionFetch(url, options, attempt + 1);
  }
  return res;
}
```

Write the script to `${WORKSPACE}/crm/scripts/crm-sync.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-crm-sync-js>' | base64 -d > ${WORKSPACE}/crm/scripts/crm-sync.js
```

Verify syntax:

**Remote:**
```
node -c ${WORKSPACE}/crm/scripts/crm-sync.js && echo 'SYNTAX_OK'
```

Expected: `SYNTAX_OK`.

If this fails: Fix syntax errors. Common issues: Notion API response pagination, async/await patterns, JSON property format mismatches.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

#### 2.4 Write crm-enrich.js `[GUIDED]`

Write the enrichment script that updates contact records after meetings using transcript data. When a meeting transcript becomes available, this script extracts new information (title changes, company changes, discussed topics) and updates both the local CRM and Notion.

The script must:
- Read config from `${WORKSPACE}/crm/config/crm-config.json`
- Open the CRM database via `better-sqlite3`
- Scan `${WORKSPACE}/data/transcripts/` (or configured transcript directory) for new/unprocessed transcript files
- For each transcript:
  - Extract attendee names and match against existing contacts in the CRM
  - Use pattern matching to detect new information: "I just became VP of Engineering at NewCo" -> update title and company
  - Extract discussed topics and add as tags
  - Log a `meeting` interaction for each matched contact
  - Update the local contact record with new fields
  - If `notion_page_id` exists, update the Notion page too (respecting rate limits)
  - Mark the transcript as processed (create a `.processed` marker file alongside the transcript)
- Accept `--transcript PATH` flag to process a specific transcript file
- Accept `--dry-run` flag to show what would be extracted without updating
- Log enrichment activity to `${WORKSPACE}/crm/logs/enrich.log`
- Print summary: N transcripts processed, N contacts enriched, N new tags added, N Notion pages updated.
- Exit with code 0 on success.

**Enrichment extraction patterns:**

The script should look for patterns in transcripts that indicate updated contact info:
- Title changes: "I'm now...", "I just started as...", "my new role is..."
- Company changes: "I moved to...", "I joined...", "we're at [company] now"
- Topics: Key phrases, project names, technology mentions
- Action items: "I'll send you...", "let's follow up on...", "action item:..."

The operator should implement this using straightforward string matching and regex. LLM-based extraction can be added later as an enhancement.

**Processed file tracking:**

```javascript
// For each transcript file, check for a .processed marker
const markerPath = transcriptPath + '.processed';
if (fs.existsSync(markerPath)) { continue; } // Already processed

// After processing, create the marker
fs.writeFileSync(markerPath, JSON.stringify({
  processedAt: new Date().toISOString(),
  contactsEnriched: enrichedCount,
  tagsAdded: tagsCount
}));
```

Write the script to `${WORKSPACE}/crm/scripts/crm-enrich.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-crm-enrich-js>' | base64 -d > ${WORKSPACE}/crm/scripts/crm-enrich.js
```

Verify syntax:

**Remote:**
```
node -c ${WORKSPACE}/crm/scripts/crm-enrich.js && echo 'SYNTAX_OK'
```

Expected: `SYNTAX_OK`.

If this fails: Fix syntax errors. Common issues: regex patterns with unescaped characters, file system path handling.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

### Phase 3: Scheduling via launchd

**CRITICAL:** Do NOT use crontab on macOS. `crontab -` and `crontab /file` hang indefinitely on macOS 15.x (Sequoia) via remote PTY due to TCC permissions. Always use launchd.

All launchd plists require absolute paths. `~` and `${HOME}` are NOT expanded in plist files. The operator must resolve all variables to literal paths before writing.

#### 3.1 Resolve Absolute Paths `[AUTO]`

Get the absolute paths needed for all plists.

**Remote:**
```
printf "NODE_PATH=%s\nWORKSPACE_ABS=%s\nAGENT_HOME=%s\n" "$(which node)" "$(cd ${WORKSPACE} && pwd)" "$HOME"
```

Record all three values. Every plist below uses these literal paths.

#### 3.2 Write Daily Discovery Plist `[GUIDED]`

Create the launchd plist for daily contact discovery at 6:00 AM local time. **Level 1 -- exact syntax required.**

The operator MUST substitute all path values before writing. Use an unquoted heredoc so the shell expands variables.

**Remote:**
```
NODE_PATH=$(which node)
WORKSPACE_ABS=$(cd ${WORKSPACE} && pwd)

cat > ${AGENT_HOME}/Library/LaunchAgents/com.edge.crm-discover.plist << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.edge.crm-discover</string>

    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${WORKSPACE_ABS}/crm/scripts/crm-discover.js</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${AGENT_HOME}</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>WorkingDirectory</key>
    <string>${WORKSPACE_ABS}/crm</string>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>6</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>${WORKSPACE_ABS}/crm/logs/discover-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${WORKSPACE_ABS}/crm/logs/discover-stderr.log</string>

    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
PLIST_EOF
```

Expected: Plist file exists at `${AGENT_HOME}/Library/LaunchAgents/com.edge.crm-discover.plist` with all absolute paths substituted. `RunAtLoad` is false because discovery should wait for its scheduled time.

`StartCalendarInterval` with Hour=6, Minute=0 fires daily at 6:00 AM local time. launchd uses local time, not UTC -- no timezone conversion needed.

Validate:

**Remote:**
```
plutil -lint ${AGENT_HOME}/Library/LaunchAgents/com.edge.crm-discover.plist
```

Expected: `OK`.

If this fails: Check for XML syntax errors -- missing closing tags, unescaped characters. Re-validate that paths are absolute (no `~`).

If already exists: Unload the existing job first (`launchctl bootout gui/${AGENT_USER_UID}/com.edge.crm-discover 2>/dev/null`), back up the old plist, write new version.

#### 3.3 Write Hourly Notion Sync Plist `[GUIDED]`

Create the launchd plist for hourly Notion sync at minute 15 of each hour. **Level 1 -- exact syntax required.**

**Remote:**
```
NODE_PATH=$(which node)
WORKSPACE_ABS=$(cd ${WORKSPACE} && pwd)

cat > ${AGENT_HOME}/Library/LaunchAgents/com.edge.crm-sync.plist << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.edge.crm-sync</string>

    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${WORKSPACE_ABS}/crm/scripts/crm-sync.js</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${AGENT_HOME}</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>WorkingDirectory</key>
    <string>${WORKSPACE_ABS}/crm</string>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Minute</key>
        <integer>15</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>${WORKSPACE_ABS}/crm/logs/sync-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${WORKSPACE_ABS}/crm/logs/sync-stderr.log</string>

    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
PLIST_EOF
```

Expected: Plist file at `${AGENT_HOME}/Library/LaunchAgents/com.edge.crm-sync.plist`. `StartCalendarInterval` with only Minute=15 fires at minute 15 of every hour. `RunAtLoad` is true so the first sync happens immediately on deploy.

Validate:

**Remote:**
```
plutil -lint ${AGENT_HOME}/Library/LaunchAgents/com.edge.crm-sync.plist
```

Expected: `OK`.

If this fails: Same troubleshooting as step 3.2.

If already exists: Unload existing, back up, write new, reload.

#### 3.4 Write Post-Meeting Enrichment Plist `[GUIDED]`

Create the launchd plist for post-meeting enrichment, running every 30 minutes to check for new transcripts. **Level 1 -- exact syntax required.**

**Remote:**
```
NODE_PATH=$(which node)
WORKSPACE_ABS=$(cd ${WORKSPACE} && pwd)

cat > ${AGENT_HOME}/Library/LaunchAgents/com.edge.crm-enrich.plist << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.edge.crm-enrich</string>

    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${WORKSPACE_ABS}/crm/scripts/crm-enrich.js</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>${AGENT_HOME}</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>WorkingDirectory</key>
    <string>${WORKSPACE_ABS}/crm</string>

    <key>StartInterval</key>
    <integer>1800</integer>

    <key>StandardOutPath</key>
    <string>${WORKSPACE_ABS}/crm/logs/enrich-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${WORKSPACE_ABS}/crm/logs/enrich-stderr.log</string>

    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
PLIST_EOF
```

Expected: Plist file at `${AGENT_HOME}/Library/LaunchAgents/com.edge.crm-enrich.plist`. `StartInterval` of 1800 seconds = every 30 minutes. `RunAtLoad` is false because enrichment should wait for transcripts to appear.

Validate:

**Remote:**
```
plutil -lint ${AGENT_HOME}/Library/LaunchAgents/com.edge.crm-enrich.plist
```

Expected: `OK`.

If this fails: Same troubleshooting as step 3.2.

If already exists: Unload existing, back up, write new, reload.

#### 3.5 Load All Plists into launchd `[AUTO]`

Unload any existing CRM jobs and load all three new plists. **Level 1 -- exact syntax required.**

**Remote:**
```
# Unload any existing CRM jobs (idempotency)
launchctl bootout gui/$(id -u)/com.edge.crm-discover 2>/dev/null
launchctl bootout gui/$(id -u)/com.edge.crm-sync 2>/dev/null
launchctl bootout gui/$(id -u)/com.edge.crm-enrich 2>/dev/null
sleep 1

# Load all three
launchctl bootstrap gui/$(id -u) ${AGENT_HOME}/Library/LaunchAgents/com.edge.crm-discover.plist
launchctl bootstrap gui/$(id -u) ${AGENT_HOME}/Library/LaunchAgents/com.edge.crm-sync.plist
launchctl bootstrap gui/$(id -u) ${AGENT_HOME}/Library/LaunchAgents/com.edge.crm-enrich.plist
```

Expected: No error output (success is silent for launchctl).

Verify all three are loaded:

**Remote:**
```
launchctl list | grep com.edge.crm
```

Expected: Three lines showing `com.edge.crm-discover`, `com.edge.crm-sync`, and `com.edge.crm-enrich` with PID (or `-` if waiting) and exit status.

If this fails:
- **"Bootstrap failed: 5: Input/output error":** Plist has XML syntax errors. Validate each with `plutil -lint`.
- **"Bootstrap failed: 37: Operation already in progress":** Already loaded. The bootout above should have handled this -- try again with explicit label: `launchctl bootout gui/$(id -u)/com.edge.crm-discover`.
- **Path errors:** Verify all paths in the plist are absolute and the referenced files exist.

### Phase 4: TOOLS.md Integration

#### 4.1 Write TOOLS.md Entries `[GUIDED]`

Add CRM tool entries to `${WORKSPACE}/TOOLS.md` so the agent knows how to use the CRM during conversations.

Check if TOOLS.md exists and whether a CRM section is already present:

**Remote:**
```
test -f ${WORKSPACE}/TOOLS.md && echo 'TOOLS_EXISTS' || echo 'NO_TOOLS'
grep -q "## Personal CRM" ${WORKSPACE}/TOOLS.md 2>/dev/null && echo 'CRM_SECTION_EXISTS' || echo 'NO_CRM_SECTION'
```

The CRM TOOLS.md content to add:

````markdown
## Personal CRM

### Search Contacts
Search the CRM by name, email, company, or semantic query. Semantic search uses vector embeddings to match by meaning (e.g., "the fintech guy in Austin").
```
node /Users/edge/.openclaw/workspace/crm/scripts/crm-embed.js --search "QUERY"
```
For exact lookups by email or name:
```
sqlite3 /Users/edge/.openclaw/workspace/crm/data/crm.db "SELECT name, email, company, title FROM contacts WHERE name LIKE '%NAME%' OR email LIKE '%QUERY%';"
```
Use for: finding contacts before meetings, answering "who do I know at X?", relationship context.

### Add Interaction Note
Log an interaction (meeting, call, email, note) for a contact.
```
sqlite3 /Users/edge/.openclaw/workspace/crm/data/crm.db "INSERT INTO interactions (contact_id, type, direction, subject, summary, occurred_at) VALUES ((SELECT id FROM contacts WHERE email='EMAIL'), 'TYPE', 'DIRECTION', 'SUBJECT', 'SUMMARY', datetime('now'));"
```
Types: email, meeting, call, note. Directions: inbound, outbound, mutual.
Use for: logging meeting outcomes, recording phone calls, adding context notes.

### View Relationship History
View the full interaction timeline and tags for a contact.
```
sqlite3 /Users/edge/.openclaw/workspace/crm/data/crm.db "SELECT i.type, i.direction, i.subject, i.summary, i.occurred_at FROM interactions i JOIN contacts c ON i.contact_id = c.id WHERE c.email='EMAIL' ORDER BY i.occurred_at DESC LIMIT 20;"
```
For tags:
```
sqlite3 /Users/edge/.openclaw/workspace/crm/data/crm.db "SELECT t.tag FROM tags t JOIN contacts c ON t.contact_id = c.id WHERE c.email='EMAIL';"
```
Use for: pre-meeting briefing, understanding relationship depth, context for follow-ups.

### Trigger Contact Discovery
Manually run contact discovery to scan recent emails and calendar for new contacts.
```
node /Users/edge/.openclaw/workspace/crm/scripts/crm-discover.js --lookback 7
```
Use for: after connecting a new email account, on-demand refresh before a big event.

### Trigger Notion Sync
Manually sync the CRM with Notion People and Companies databases.
```
node /Users/edge/.openclaw/workspace/crm/scripts/crm-sync.js
```
Check sync status:
```
node /Users/edge/.openclaw/workspace/crm/scripts/crm-sync.js --status
```
Use for: ensuring latest Notion data is available before meetings, after bulk Notion edits.

### CRM Stats
Quick overview of CRM health and counts.
```
sqlite3 /Users/edge/.openclaw/workspace/crm/data/crm.db "SELECT 'contacts' as type, count(*) as count FROM contacts UNION ALL SELECT 'companies', count(*) FROM companies UNION ALL SELECT 'interactions', count(*) FROM interactions UNION ALL SELECT 'tags', count(*) FROM tags UNION ALL SELECT 'embeddings', count(*) FROM contact_embeddings;"
```
````

If TOOLS.md exists but has no CRM section, **append** the CRM section:

**Remote:**
```
echo '<base64-encoded-crm-tools-section>' | base64 -d >> ${WORKSPACE}/TOOLS.md
```

If TOOLS.md does not exist, create it with the CRM section:

**Remote:**
```
echo '<base64-encoded-crm-tools-section>' | base64 -d > ${WORKSPACE}/TOOLS.md
```

If a CRM section already exists, compare content and update if different.

Expected: TOOLS.md contains the "Personal CRM" section with all tool entries.

Verify:

**Remote:**
```
grep -c "crm-embed\|crm-discover\|crm-sync\|crm\.db" ${WORKSPACE}/TOOLS.md
```

Expected: Count >= 6 (multiple references across tool entries).

### Phase 5: Verification

#### 5.1 Run Initial Contact Discovery `[GUIDED]`

Execute the discovery script with a 30-day lookback to populate the CRM with initial contacts.

**Remote:**
```
cd ${WORKSPACE}/crm && node scripts/crm-discover.js --lookback 30
```

Expected: Output showing number of emails scanned, calendar events scanned, new contacts discovered, and already-known contacts skipped. Typical first run discovers 20-200 contacts depending on email volume.

If this fails:
- **Himalaya errors:** Check that Himalaya is configured and authenticated: `himalaya account list`
- **Calendar errors:** Check gcalcli or Service Account access: `gcalcli list`
- **Database locked:** Check for zombie processes: `lsof ${WORKSPACE}/crm/data/crm.db`

#### 5.2 Run Initial Embedding Generation `[GUIDED]`

Generate vector embeddings for all discovered contacts.

**Remote:**
```
cd ${WORKSPACE}/crm && node scripts/crm-embed.js
```

Expected: Output showing progress ("Embedded 5/50 contacts...") and final count. Each embedding requires one Gemini API call, so this takes approximately 1 second per contact with rate limiting.

If this fails:
- **Gemini API errors:** Test the key directly:
  ```
  curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}" -H 'Content-Type: application/json' -d '{"model":"models/gemini-embedding-001","content":{"parts":[{"text":"test"}]}}'
  ```
- **Rate limit (429):** The script should handle this with backoff. If persistent, increase `rateLimitMs` in config.
- **No contacts:** Run discovery (step 5.1) first.

#### 5.3 Test Semantic Search `[GUIDED]`

Verify that semantic search returns meaningful results.

**Remote:**
```
cd ${WORKSPACE}/crm && node scripts/crm-embed.js --search "investor in technology companies"
```

Expected: Returns a ranked list of contacts with similarity scores. The top results should be contacts related to technology investing.

**Remote:**
```
cd ${WORKSPACE}/crm && node scripts/crm-embed.js --search "someone at a fintech startup"
```

Expected: Returns contacts associated with fintech companies, ranked by relevance.

If results are poor: The embedding quality depends on the richness of contact data. Run enrichment or manually add notes to contacts, then regenerate embeddings with `--refresh`.

#### 5.4 Run Initial Notion Sync `[GUIDED]`

Sync local contacts with Notion and verify bidirectional data flow.

**Remote:**
```
cd ${WORKSPACE}/crm && node scripts/crm-sync.js --full
```

Expected: Output showing N pulled from Notion, N pushed to Notion, N conflicts, N unchanged. First sync may take several minutes depending on Notion database size.

If this fails:
- **401 Unauthorized:** Notion API key is invalid. Check `${WORKSPACE}/.env` and `crm-config.json`.
- **Empty pull:** The Notion integration bot may not be connected to the databases. The client must add the connection via the "..." menu > Connections in each Notion database.
- **429 Too Many Requests:** Rate limiting. The script should handle this with exponential backoff.

Verify sync status:

**Remote:**
```
cd ${WORKSPACE}/crm && node scripts/crm-sync.js --status
```

Expected: Shows last sync timestamps and record counts for People and Companies.

#### 5.5 Verify Database Health `[AUTO]`

Confirm the database is healthy and populated.

**Remote:**
```
sqlite3 ${WORKSPACE}/crm/data/crm.db "SELECT 'contacts' as tbl, count(*) as cnt FROM contacts UNION ALL SELECT 'companies', count(*) FROM companies UNION ALL SELECT 'interactions', count(*) FROM interactions UNION ALL SELECT 'tags', count(*) FROM tags UNION ALL SELECT 'embeddings', count(*) FROM contact_embeddings;"
```

Expected: Contacts > 0, embeddings > 0 (at minimum). Companies and interactions may be 0 initially.

**Remote:**
```
sqlite3 ${WORKSPACE}/crm/data/crm.db "PRAGMA integrity_check;"
```

Expected: `ok`.

**Remote:**
```
sqlite3 ${WORKSPACE}/crm/data/crm.db "PRAGMA journal_mode;"
```

Expected: `wal`.

#### 5.6 Verify launchd Jobs Are Running `[AUTO]`

Confirm all three scheduled jobs are registered and healthy.

**Remote:**
```
launchctl list | grep com.edge.crm
```

Expected: Three lines showing `com.edge.crm-discover`, `com.edge.crm-sync`, and `com.edge.crm-enrich`. Exit status 0 (or `-` for PID if not currently running) indicates no errors.

Check log output from the sync job (which has `RunAtLoad` = true, so it should have run):

**Remote:**
```
tail -10 ${WORKSPACE}/crm/logs/sync-stdout.log 2>/dev/null || echo 'NO_SYNC_LOG_YET'
```

Expected: Sync output showing pull/push counts, or `NO_SYNC_LOG_YET` if the job has not fired yet.

#### 5.7 Verify TOOLS.md `[AUTO]`

Confirm the agent tools are registered.

**Remote:**
```
grep "## Personal CRM" ${WORKSPACE}/TOOLS.md && echo 'CRM_TOOLS_OK' || echo 'CRM_TOOLS_MISSING'
```

Expected: `CRM_TOOLS_OK`.

#### 5.8 Update Client Profile `[AUTO]`

**Operator:** Update `clients/<name>.md` with:
- CRM v2 deployed: date, database location (`${WORKSPACE}/crm/data/crm.db`), contact count
- Embedding provider: Gemini `gemini-embedding-001` (768-dim)
- Notion sync: People DB `${NOTION_PEOPLE_DB_ID}`, Companies DB `${NOTION_COMPANIES_DB_ID}`
- Scheduled jobs: discovery (6 AM daily), sync (hourly at :15), enrichment (every 30 min)
- Any issues encountered or adaptations made

## Verification

Run these checks to confirm the CRM is fully operational.

### Database health

**Remote:**
```
sqlite3 ${WORKSPACE}/crm/data/crm.db "PRAGMA integrity_check; PRAGMA journal_mode;"
```

Expected: `ok` and `wal`.

### Table counts

**Remote:**
```
sqlite3 ${WORKSPACE}/crm/data/crm.db "SELECT 'contacts' as tbl, count(*) as cnt FROM contacts UNION ALL SELECT 'companies', count(*) FROM companies UNION ALL SELECT 'interactions', count(*) FROM interactions UNION ALL SELECT 'tags', count(*) FROM tags UNION ALL SELECT 'embeddings', count(*) FROM contact_embeddings;"
```

Expected: Contacts > 0, embeddings > 0.

### Semantic search

**Remote:**
```
cd ${WORKSPACE}/crm && node scripts/crm-embed.js --search "technology investor"
```

Expected: Ranked contact results with similarity scores.

### Notion sync status

**Remote:**
```
cd ${WORKSPACE}/crm && node scripts/crm-sync.js --status
```

Expected: Last sync timestamps and record counts.

### Scheduled jobs

**Remote:**
```
launchctl list | grep com.edge.crm
```

Expected: Three entries with exit status 0.

### TOOLS.md entries

**Remote:**
```
grep -c "crm-embed\|crm-discover\|crm-sync\|crm\.db" ${WORKSPACE}/TOOLS.md
```

Expected: Count >= 6.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| No contacts discovered | Himalaya not configured or no emails in lookback window | Check `himalaya account list`, try larger `--lookback` value |
| Himalaya envelope parsing fails | Himalaya output format changed | Check `himalaya envelope list --page-size 1 --output json` output, adapt parser |
| Calendar events not scanned | gcalcli not installed or Service Account not configured | Install gcalcli (`brew install gcalcli`) or place Service Account JSON in config |
| Embedding API returns 400 | Empty or too-long content text | The embed script should truncate content to 2000 chars max per the Gemini limit |
| Embedding API returns 429 | Rate limiting | Increase `rateLimitMs` in config. Default 200ms should work for moderate batches |
| Semantic search returns poor results | Sparse contact data (name only, no notes/interactions) | Enrich contacts with notes and interactions, then run `crm-embed.js --refresh` |
| Notion sync 401 | API key expired or revoked | Regenerate at https://www.notion.so/my-integrations, update `.env` and `crm-config.json` |
| Notion sync empty results | Integration bot not connected to database | Add the integration via "..." > Connections in each Notion database |
| Notion property mismatch | Field names in config do not match Notion schema | Compare config field mappings against actual Notion properties (case-sensitive) |
| Sync conflict logged | Field changed both locally and in Notion | Normal -- Notion wins. Check `${WORKSPACE}/crm/logs/sync.log` for details |
| Database locked | Concurrent scripts accessing SQLite | WAL mode allows concurrent reads. If writes conflict, one will retry. Check for zombie processes: `lsof ${WORKSPACE}/crm/data/crm.db` |
| `better-sqlite3` will not install | Missing build tools on Apple Silicon | Run `xcode-select --install`, then `npm rebuild better-sqlite3` |
| launchd job not firing | Plist syntax error or wrong paths | Validate with `plutil -lint`. Check that node path and script paths are absolute. Check stderr log. |
| launchd fires but script fails | Node.js not found at plist path | Update `ProgramArguments` to match `which node`. Bootout and re-bootstrap. |
| Enrichment finds no transcripts | Transcript directory empty or path wrong | Check `${WORKSPACE}/data/transcripts/` exists and has files. Verify path in `crm-config.json`. |
| Enrichment misses contact matches | Transcript attendee names do not match CRM names | The enrich script should fuzzy-match names. Check the matching logic and consider adding email-based matching from calendar invites. |

## Autonomy Mode Behavior

| Step | Auto | Guided | Manual |
|------|------|--------|--------|
| 1.1 Create directories | Execute silently | Execute silently | Confirm before creating |
| 1.2 Write CRM config | Execute silently | Review config before writing | Review every field |
| 1.3 Install npm dependencies | Execute silently | Execute silently | Confirm before install |
| 1.4 Write crm-init.js | Execute silently | Confirm before writing | Review script, confirm |
| 1.5 Run crm-init.js | Execute silently | Confirm before running | Show schema, confirm |
| 2.1 Write crm-discover.js | Execute silently | Confirm before writing | Review script, confirm |
| 2.2 Write crm-embed.js | Execute silently | Confirm before writing | Review script, confirm |
| 2.3 Write crm-sync.js | Execute silently | Confirm before writing | Review script, confirm |
| 2.4 Write crm-enrich.js | Execute silently | Confirm before writing | Review script, confirm |
| 3.1 Resolve absolute paths | Execute silently | Execute silently | Show values |
| 3.2 Write discover plist | Execute silently | Review plist before writing | Review every field |
| 3.3 Write sync plist | Execute silently | Review plist before writing | Review every field |
| 3.4 Write enrich plist | Execute silently | Review plist before writing | Review every field |
| 3.5 Load all plists | Execute silently | Confirm before loading | Confirm each plist |
| 4.1 Write TOOLS.md entries | Execute silently | Review entries before writing | Review each entry |
| 5.1 Initial discovery | Execute, report results | Confirm before running, review results | Confirm, monitor, review |
| 5.2 Initial embedding | Execute, report results | Confirm before running, monitor progress | Confirm, monitor, review |
| 5.3 Test semantic search | Execute, report results | Execute, review results together | Confirm each query, review |
| 5.4 Initial Notion sync | Execute, report results | Confirm before running, review results | Confirm, monitor, review |
| 5.5 Verify database health | Execute, report | Execute, report | Execute, review output |
| 5.6 Verify launchd jobs | Execute, report | Execute, report | Execute, review each job |
| 5.7 Verify TOOLS.md | Execute, report | Execute, report | Execute, review |
| 5.8 Update client profile | Execute silently | Show changes, confirm | Show changes, confirm |

## Dependencies

- **Depends on:** `deploy-notion-workspace.md` (Notion API connection, People and Companies databases), `deploy-himalaya-email.md` (Himalaya CLI for Gmail IMAP access), Google Calendar access (gcalcli or Service Account)
- **Required by:** `deploy-fathom-pipeline.md` (meeting transcript enrichment writes to CRM), `deploy-daily-briefing.md` (CRM data feeds into relationship context), `deploy-meeting-prep.md` (contact lookup and relationship history)
- **Enhanced by:** `deploy-urgent-email.md` (urgent emails can reference CRM contacts for context), `deploy-advisory-council.md` (CRM relationship data informs advisory recommendations)
