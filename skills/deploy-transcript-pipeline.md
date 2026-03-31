# Deploy Transcript Ingestion Pipeline

## Compatibility
- **OpenClaw Version**: 2026.3.22+
- **Status**: READY
- **Blocked Commands**: None
- **Notes**: This skill avoids all nonexistent OpenClaw CLI commands. Uses file-based config, Node.js scripts with raw API calls (Google Drive, Fathom, Notion, Anthropic), SQLite for tracking, and launchd for scheduling. Fully designed for the working pattern: no `openclaw cron`, no `openclaw config set`, no `openclaw telegram`, no `openclaw skill install`.

## Purpose

Deploy an automated multi-source meeting transcript ingestion pipeline that collects transcripts from Google Meet (Gemini), Fathom, and Notion, then processes them through a Claude-powered analysis pipeline that extracts action items, matches attendees to the Notion People database, generates summaries, and creates Interaction records in Notion. This gives the client a unified view of all meeting activity regardless of which tool recorded it, with automatic CRM enrichment and action item extraction.

**When to use:** When the client uses multiple meeting/transcript tools (Gemini for Google Meet, Fathom for AI recording, and/or Notion for manual meeting notes) and wants automated processing of all transcript sources into a unified Notion-based CRM workflow.

**What this skill does:**
1. Configures transcript pipeline with source definitions and API credentials
2. Installs source adapters for Gemini (Google Drive API), Fathom (Fathom API), and Notion (Notion API)
3. Installs a transcript processing orchestrator that runs all adapters, matches attendees, extracts action items and summaries via Claude API, and writes results to Notion
4. Creates a SQLite tracking database to avoid duplicate processing
5. Schedules transcript checks every 30 minutes during business hours via launchd
6. Supports manual trigger for on-demand processing
7. Verifies each source adapter independently and the full pipeline end-to-end

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
| `${FATHOM_API_KEY}` | Client-provided Fathom API key (optional -- `HUMAN_INPUT` if available) | `fth_abc123...` |
| `${GOOGLE_SERVICE_ACCOUNT_KEY}` | Path to Google service account JSON on client machine | `/Users/edge/.openclaw/workspace/config/google-service-account.json` |
| `${NOTION_API_KEY}` | Client: Notion Settings > Integrations > Internal integration token | `ntn_abc123def456...` |
| `${NOTION_INTERACTIONS_DB_ID}` | Notion Interactions database ID (discovered or client-provided) | `a1b2c3d4e5f6...` |
| `${NOTION_PEOPLE_DB_ID}` | Notion People database ID (from `deploy-notion-workspace.md` or client) | `b2c3d4e5f6a1...` |
| `${ANTHROPIC_API_KEY}` | Client-provided Claude API key (from auth-profiles.json or `.env`) | `sk-ant-api03-...` |
| `${TIMEZONE}` | Client profile: timezone | `America/Denver` |
| `${BIZ_HOURS_START}` | Client preference: processing window start (24h local time) | `5` |
| `${BIZ_HOURS_END}` | Client preference: processing window end (24h local time) | `23` |
| `${AGENT_USER}` | Pre-flight check: `whoami` on client machine | `edge` |
| `${AGENT_USER_UID}` | Pre-flight check: `id -u` on client machine | `501` |
| `${NODE_PATH}` | Pre-flight check: `which node` on client machine | `/opt/homebrew/bin/node` |

## Before You Start

Follow the **Standard Deployment Protocol** in `_deploy-common.md`: read the client profile, check what exists, identify adaptations, and present a deployment plan before executing.

**Pre-flight checks for this skill:**

Check if Node.js is available (v18+ required for native fetch):

**Remote:**
```
node --version 2>/dev/null || echo 'NO_NODE'
```

Expected: Version string (v18+). If `NO_NODE` or below v18, install Node.js first.

Record the Node.js binary path (needed for launchd plist):

**Remote:**
```
which node
```

Expected: Absolute path like `/opt/homebrew/bin/node` or `/usr/local/bin/node`. Record as `${NODE_PATH}`.

Check if SQLite3 CLI is available (used for tracking database verification):

**Remote:**
```
which sqlite3 2>/dev/null || echo 'NO_SQLITE3'
```

Expected: Path to sqlite3 CLI. macOS ships with it by default.

Check if the transcript pipeline config already exists:

**Remote:**
```
test -f ${WORKSPACE}/config/transcript-pipeline.json && cat ${WORKSPACE}/config/transcript-pipeline.json | head -30 || echo 'NOT_CONFIGURED'
```

Expected: Either existing config (review for correctness) or `NOT_CONFIGURED`.

Check if transcript scripts already exist:

**Remote:**
```
ls ${WORKSPACE}/tools/transcripts/ 2>/dev/null || echo 'NO_SCRIPTS'
```

Expected: Either file listing or `NO_SCRIPTS`.

Check if the transcript launchd plist is already loaded:

**Remote:**
```
launchctl list 2>/dev/null | grep com.openclaw.transcript-pipeline || echo 'NO_LAUNCHD'
```

Expected: Either plist entry (already scheduled) or `NO_LAUNCHD`.

Resolve the macOS username and UID (needed for launchd absolute paths):

**Remote:**
```
whoami && id -u
```

Expected: Username and numeric UID. Record both.

Check if Notion workspace integration is deployed (required dependency):

**Remote:**
```
test -f ${WORKSPACE}/config/notion.json && echo 'NOTION_OK' || echo 'NOTION_MISSING'
```

Expected: `NOTION_OK`. If missing, deploy `deploy-notion-workspace.md` first.

Check if the Google service account key exists:

**Remote:**
```
test -f ${GOOGLE_SERVICE_ACCOUNT_KEY} && echo 'SA_KEY_OK' || echo 'SA_KEY_MISSING'
```

Expected: `SA_KEY_OK`. If missing, the client must create a Google Cloud service account with Google Drive API read access and download the JSON key file.

Check if an Anthropic API key is available:

**Remote:**
```
grep ANTHROPIC_API_KEY ${WORKSPACE}/.env 2>/dev/null | head -c 25 || echo 'NO_ANTHROPIC_KEY'
```

Expected: Shows `ANTHROPIC_API_KEY=sk-ant-` prefix. If missing, check `auth-profiles.json` or ask the client.

**Decision points from pre-flight:**
- Is the Notion workspace integration deployed with People and Interactions databases mapped? **Required.** If not, deploy `deploy-notion-workspace.md` first and ensure an Interactions database exists.
- Does the client have a Google service account with Drive API access? **Required for Gemini source.** If not, guide them through Google Cloud Console service account creation. The service account must have "Google Drive API" enabled and the client must share their meeting transcript folders with the service account email.
- Does the client have a Fathom API key? **Optional.** If not, the Fathom source adapter will be configured but disabled. The pipeline handles missing sources gracefully.
- Is the Interactions database ready in Notion? If the client doesn't have one, create it in Phase 1 or guide the client to create it with the required properties.

## Adaptation Points

| Component | Default | Customize When... |
|-----------|---------|-------------------|
| Transcript sources | All three (Gemini, Fathom, Notion) | Client only uses some sources -- disable unused ones in config |
| Fathom source | Enabled if API key provided | Client doesn't use Fathom -- set `"enabled": false` |
| Gemini transcript filename pattern | `"Meeting transcript - *"` | Google changes the naming convention for auto-generated transcripts |
| Notion transcript database | Scans for pages tagged "Meeting Notes" | Client uses different tags or a dedicated transcript database |
| Processing schedule | Every 30 min, 5 AM - 11 PM | Client wants different frequency or processing window |
| Claude model for extraction | `claude-sonnet-4-20250514` | Client wants higher quality (Opus) or lower cost |
| Action item destination | Notion Tasks database | Client uses Todoist, Asana, or another task manager |
| Interactions database | `${NOTION_INTERACTIONS_DB_ID}` | Client uses a different name ("Meetings", "Notes", "Log") |
| People database | `${NOTION_PEOPLE_DB_ID}` | Client has a different People/Contacts database |
| SQLite database path | `${WORKSPACE}/data/transcript-tracking.db` | Client wants DBs in a different location |
| Script location | `${WORKSPACE}/tools/transcripts/` | Client prefers scripts elsewhere |
| Rate limit backoff | Exponential with 1s base, 5 retries | Adjust for specific API rate limit behavior |

## Prerequisites

- OpenClaw installed and running (`openclaw/install.md`)
- Node.js v18+ available on the client machine
- `deploy-identity.md` completed (agent identity configured)
- `deploy-notion-workspace.md` completed (Notion API key, People database mapped)
- Notion Interactions database exists and is connected to the integration bot
- Google Cloud service account with Drive API access (for Gemini source)
- Anthropic API key available (for Claude-powered transcript analysis)
- Fathom API key (optional -- pipeline works without it)

## What Gets Installed

### Pipeline Config (`config/transcript-pipeline.json`)

| Field | Description |
|-------|-------------|
| `sources.gemini` | Google Drive API config: service account path, search patterns, enabled flag |
| `sources.fathom` | Fathom API config: API key, base URL, enabled flag |
| `sources.notion` | Notion transcript scanning config: database ID, tag filters, enabled flag |
| `processing.model` | Claude model ID for transcript analysis |
| `processing.anthropicApiKey` | Anthropic API key reference (reads from `.env`) |
| `notion.interactionsDbId` | Target database for processed transcript summaries |
| `notion.peopleDbId` | People database for attendee matching |
| `notion.apiKey` | Notion API key reference (reads from `.env` or config) |
| `schedule.intervalMinutes` | How often the pipeline runs (default 30) |
| `schedule.bizHoursStart` | Business hours start (local time, 24h) |
| `schedule.bizHoursEnd` | Business hours end (local time, 24h) |
| `schedule.timezone` | Timezone for business hours |

### SQLite Tracking Database (`data/transcript-tracking.db`)

| Table | Purpose |
|-------|---------|
| `processed_transcripts` | Tracks every transcript processed: source, source_id, title, date, status, processed_at |
| `processing_errors` | Logs errors per transcript: source, source_id, error_message, attempted_at |
| `pipeline_runs` | Logs each pipeline execution: run_id, started_at, completed_at, sources_checked, transcripts_found, transcripts_processed, errors |

### Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `source-gemini.js` | `${WORKSPACE}/tools/transcripts/source-gemini.js` | Fetches Google Meet transcripts from Google Drive via service account |
| `source-fathom.js` | `${WORKSPACE}/tools/transcripts/source-fathom.js` | Fetches meeting recordings and transcripts from Fathom API |
| `source-notion.js` | `${WORKSPACE}/tools/transcripts/source-notion.js` | Scans Notion for pages tagged as meeting notes/transcripts |
| `transcript-processor.js` | `${WORKSPACE}/tools/transcripts/transcript-processor.js` | Orchestrator: runs adapters, matches attendees, extracts action items via Claude, writes to Notion |
| `db.js` | `${WORKSPACE}/tools/transcripts/db.js` | SQLite helper module for tracking database operations |
| `common.js` | `${WORKSPACE}/tools/transcripts/common.js` | Shared utilities: rate limiting, retry logic, date formatting, transcript normalization |

### Launchd Plist

| Detail | Value |
|--------|-------|
| Label | `com.openclaw.transcript-pipeline` |
| Schedule | Every 30 minutes during business hours (7 AM - 7 PM) |
| Location | `~/Library/LaunchAgents/com.openclaw.transcript-pipeline.plist` |
| Log output | `${WORKSPACE}/logs/transcript-pipeline.log` |
| Error output | `${WORKSPACE}/logs/transcript-pipeline-error.log` |

### TOOLS.md Entries

Adds entries to `${WORKSPACE}/TOOLS.md` so the agent knows:
- How to manually trigger transcript processing
- How to check pipeline status and recent runs
- How to process a specific meeting on demand
- How to view processing errors

## Steps

### Phase 1: Directory Structure and Configuration

#### 1.1 Create Directory Structure `[AUTO]`

Create all directories needed for the transcript pipeline.

**Remote:**
```
mkdir -p ${WORKSPACE}/tools/transcripts ${WORKSPACE}/config ${WORKSPACE}/data ${WORKSPACE}/logs
```

Expected: All directories exist. `mkdir -p` is idempotent.

#### 1.2 Install Node.js Dependencies `[AUTO]`

The transcript pipeline requires `better-sqlite3` for the tracking database and `googleapis` for Google Drive access. Install them in the workspace.

**Remote:**
```
cd ${WORKSPACE} && npm init -y 2>/dev/null; npm install better-sqlite3 googleapis 2>&1 | tail -5
```

Expected: Packages installed successfully. `better-sqlite3` provides synchronous SQLite bindings. `googleapis` provides the Google Drive API client.

If this fails:
- **node-gyp errors on better-sqlite3:** Requires Xcode Command Line Tools. Run `xcode-select --install` (client may need to click "Install" in the GUI dialog). Then retry.
- **Permission errors:** Ensure `${WORKSPACE}` is writable by the current user.

If already exists: `npm install` is idempotent -- re-running updates if needed.

#### 1.3 Collect Fathom API Key `[HUMAN_INPUT]`

Ask the client if they use Fathom. If yes, collect the API key. If no, the Fathom source will be disabled.

If the client provides a Fathom API key, write it to the workspace `.env` file:

**Remote:**
```
grep -q FATHOM_API_KEY ${WORKSPACE}/.env 2>/dev/null && echo 'ALREADY_SET' || echo 'FATHOM_API_KEY=${FATHOM_API_KEY}' >> ${WORKSPACE}/.env
```

Expected: Key line present in `.env`. If the client does not use Fathom, skip this step and set `sources.fathom.enabled` to `false` in the config.

#### 1.4 Verify Google Service Account `[GUIDED]`

Validate the Google service account key file and test Drive API access.

**Remote:**
```
python3 -c "
import json
with open('${GOOGLE_SERVICE_ACCOUNT_KEY}') as f:
    sa = json.load(f)
print('Service Account:', sa.get('client_email', 'UNKNOWN'))
print('Project:', sa.get('project_id', 'UNKNOWN'))
print('Type:', sa.get('type', 'UNKNOWN'))
"
```

Expected: Shows service account email, project ID, and type `service_account`. Record the `client_email` -- the client must share meeting transcript folders with this email address.

If this fails:
- **File not found:** Ask the client to download the service account JSON from Google Cloud Console > IAM > Service Accounts > Keys.
- **Not a service account:** The JSON may be an OAuth client credential instead. Must be a service account with `"type": "service_account"`.
- **Missing Drive API scope:** Ensure the Google Drive API is enabled for the project in Google Cloud Console > APIs & Services > Library.

**Important:** The client must share their Google Meet transcript folder (or their entire Google Drive, depending on preference) with the service account email address. Without this, the service account cannot find transcripts.

#### 1.5 Verify Notion Interactions Database `[GUIDED]`

Check that an Interactions database exists in Notion and discover its schema. If the deploy-notion-workspace skill was already run, the Notion API key is available.

**Remote:**
```
curl -s "https://api.notion.com/v1/databases/${NOTION_INTERACTIONS_DB_ID}" \
  -H "Authorization: Bearer ${NOTION_API_KEY}" \
  -H "Notion-Version: 2022-06-28" | python3 -c "
import json, sys
db = json.load(sys.stdin)
if 'object' in db and db['object'] == 'database':
    title = db.get('title', [{}])[0].get('plain_text', 'Unknown')
    print(f'Database: {title}')
    print(f'ID: {db[\"id\"]}')
    print('Properties:')
    for name, prop in sorted(db.get('properties', {}).items()):
        print(f'  {name}: {prop[\"type\"]}')
else:
    print('ERROR:', db.get('message', 'Unknown error'))
"
```

Expected: Database schema listing with properties like Title (title), Date (date), Attendees (relation to People), Summary (rich_text), Action Items (rich_text), Source (select), etc.

If this fails:
- **404 Not Found:** The database ID is wrong, or the integration bot is not connected. Verify the ID and ensure the bot is invited to the database.
- **Database doesn't exist yet:** Guide the client to create an Interactions database in Notion with these recommended properties: Title (title), Date (date), Attendees (relation to People DB), Summary (rich_text), Action Items (rich_text), Source (select: Gemini/Fathom/Notion), Duration (number), Topics (multi_select).

Record the property names -- they will be used in the config for field mapping.

#### 1.6 Write Pipeline Config `[GUIDED]`

Write the master configuration file that defines all sources, processing settings, and Notion targets.

The operator must construct this JSON with actual values from the pre-flight checks and discovery steps. The template below shows the structure -- substitute real values.

**Remote (use base64 encoding per `_deploy-common.md` File Transfer Standard):**

```
echo '<base64-encoded-config-json>' | base64 -d > ${WORKSPACE}/config/transcript-pipeline.json
```

The JSON structure must follow this template:

```json
{
  "sources": {
    "gemini": {
      "enabled": true,
      "serviceAccountKeyPath": "${GOOGLE_SERVICE_ACCOUNT_KEY}",
      "searchPattern": "Meeting transcript - ",
      "mimeType": "application/vnd.google-apps.document",
      "maxAgeDays": 30,
      "description": "Google Meet transcripts via Google Drive API"
    },
    "fathom": {
      "enabled": true,
      "apiBaseUrl": "https://api.fathom.video/v1",
      "apiKeyEnvVar": "FATHOM_API_KEY",
      "maxAgeDays": 90,
      "rateLimitMs": 1000,
      "maxRetries": 5,
      "description": "Fathom meeting recordings and transcripts"
    },
    "notion": {
      "enabled": true,
      "databaseId": "${NOTION_INTERACTIONS_DB_ID}",
      "tagFilter": ["Meeting Notes", "Transcript", "Meeting"],
      "tagProperty": "Type",
      "description": "Notion pages tagged as meeting notes/transcripts"
    }
  },
  "processing": {
    "model": "claude-sonnet-4-20250514",
    "anthropicApiKeyEnvVar": "ANTHROPIC_API_KEY",
    "maxTokens": 4096,
    "extractActionItems": true,
    "extractTopics": true,
    "generateSummary": true,
    "matchAttendees": true
  },
  "notion": {
    "apiKeyEnvVar": "NOTION_API_KEY",
    "version": "2022-06-28",
    "interactionsDbId": "${NOTION_INTERACTIONS_DB_ID}",
    "peopleDbId": "${NOTION_PEOPLE_DB_ID}",
    "rateLimitMs": 334,
    "interactionFields": {
      "title": "Title",
      "date": "Date",
      "attendees": "Attendees",
      "summary": "Summary",
      "actionItems": "Action Items",
      "source": "Source",
      "duration": "Duration",
      "topics": "Topics"
    },
    "peopleFields": {
      "name": "Name",
      "email": "Email",
      "lastContacted": "Last Contacted"
    }
  },
  "tracking": {
    "dbPath": "data/transcript-tracking.db"
  },
  "schedule": {
    "intervalMinutes": 30,
    "bizHoursStart": 7,
    "bizHoursEnd": 19,
    "timezone": "${TIMEZONE}"
  }
}
```

**Critical:** The `interactionFields` and `peopleFields` mappings MUST match the actual Notion property names discovered in steps 1.5. Notion property names are case-sensitive.

**Critical:** If the client does not use Fathom, set `"sources.fathom.enabled": false`. The pipeline handles disabled sources gracefully.

Expected: File exists at `${WORKSPACE}/config/transcript-pipeline.json` with valid JSON.

If this fails: Check that `${WORKSPACE}/config/` exists. Verify base64 encoding produced valid JSON with `python3 -c "import json; json.load(open('${WORKSPACE}/config/transcript-pipeline.json'))"`.

If already exists: Compare config values. If unchanged, skip. If different, back up as `transcript-pipeline.json.bak` and write new version.

### Phase 2: Install Shared Modules

#### 2.1 Install Common Utilities Module `[GUIDED]`

Write the shared utilities module used by all source adapters and the processor. This provides rate limiting, retry logic, date formatting, and the common transcript format.

The module must export:

- `sleep(ms)` -- Promise-based delay for rate limiting
- `retryWithBackoff(fn, opts)` -- Exponential backoff retry wrapper. Options: `maxRetries` (default 5), `baseDelayMs` (default 1000), `maxDelayMs` (default 30000). Retries on network errors and 429 status codes.
- `normalizeTranscript(raw)` -- Normalizes any source's raw output to the common format:
  ```json
  {
    "source": "gemini|fathom|notion",
    "sourceId": "unique-id-from-source",
    "meetingTitle": "string",
    "date": "ISO-8601",
    "attendees": ["name or email", ...],
    "rawText": "full transcript text",
    "duration": "minutes (number or null)",
    "metadata": {}
  }
  ```
- `formatDate(date)` -- Formats a date to ISO-8601 date string
- `isBusinessHours(config)` -- Returns true if current time is within configured business hours and timezone
- `loadConfig()` -- Reads and parses `${WORKSPACE}/config/transcript-pipeline.json`. Resolves env var references (fields ending in `EnvVar`) by reading from `${WORKSPACE}/.env`.
- `loadEnv()` -- Reads `${WORKSPACE}/.env` and populates `process.env` for referenced keys

Write the module to `${WORKSPACE}/tools/transcripts/common.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-common-js>' | base64 -d > ${WORKSPACE}/tools/transcripts/common.js
```

Expected: File exists at `${WORKSPACE}/tools/transcripts/common.js`. Test with `node -e "const c = require('${WORKSPACE}/tools/transcripts/common.js'); console.log(Object.keys(c))"` -- should list exported functions.

If this fails: Check Node.js version. The module uses standard CommonJS `require()` and should work with any Node.js v18+.

If already exists: Compare content. If unchanged, skip. If different, back up as `common.js.bak` and write new version.

#### 2.2 Install SQLite Database Module `[GUIDED]`

Write the database helper module that creates and manages the SQLite tracking database. This ensures transcripts are never processed twice and provides audit logging.

The module must export:

- `initDb(dbPath)` -- Creates the database file and tables if they don't exist. Returns a `better-sqlite3` database instance. Tables:
  - `processed_transcripts`: columns `id` (INTEGER PRIMARY KEY), `source` (TEXT NOT NULL), `source_id` (TEXT NOT NULL), `meeting_title` (TEXT), `meeting_date` (TEXT), `attendees_json` (TEXT), `status` (TEXT DEFAULT 'processed'), `notion_page_id` (TEXT), `processed_at` (TEXT DEFAULT CURRENT_TIMESTAMP). Unique constraint on `(source, source_id)`.
  - `processing_errors`: columns `id` (INTEGER PRIMARY KEY), `source` (TEXT), `source_id` (TEXT), `error_message` (TEXT), `stack_trace` (TEXT), `attempted_at` (TEXT DEFAULT CURRENT_TIMESTAMP).
  - `pipeline_runs`: columns `id` (INTEGER PRIMARY KEY), `run_id` (TEXT UNIQUE), `started_at` (TEXT), `completed_at` (TEXT), `sources_checked` (TEXT), `transcripts_found` (INTEGER DEFAULT 0), `transcripts_processed` (INTEGER DEFAULT 0), `errors` (INTEGER DEFAULT 0), `report_json` (TEXT).
- `isProcessed(db, source, sourceId)` -- Returns true if this transcript has already been processed successfully
- `markProcessed(db, record)` -- Inserts a processed transcript record
- `logError(db, source, sourceId, error)` -- Logs a processing error
- `startRun(db, runId, sources)` -- Creates a pipeline run record
- `completeRun(db, runId, stats)` -- Updates the pipeline run with completion stats
- `getRecentRuns(db, limit)` -- Returns the last N pipeline runs for status reporting
- `getErrors(db, since)` -- Returns errors since a given date for troubleshooting

Write the module to `${WORKSPACE}/tools/transcripts/db.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-db-js>' | base64 -d > ${WORKSPACE}/tools/transcripts/db.js
```

Expected: File exists at `${WORKSPACE}/tools/transcripts/db.js`. Test with:

**Remote:**
```
node -e "
const db = require('${WORKSPACE}/tools/transcripts/db.js');
const instance = db.initDb('${WORKSPACE}/data/transcript-tracking.db');
console.log('Tables:', instance.prepare(\"SELECT name FROM sqlite_master WHERE type='table'\").all().map(r => r.name));
instance.close();
"
```

Expected: Lists three tables: `processed_transcripts`, `processing_errors`, `pipeline_runs`.

If this fails:
- **better-sqlite3 not found:** Re-run `npm install better-sqlite3` in `${WORKSPACE}`.
- **Native module errors:** `better-sqlite3` is a native addon. On Apple Silicon Macs, ensure the version matches the Node.js architecture. `npm rebuild better-sqlite3` may fix architecture mismatches.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

### Phase 3: Install Source Adapters

#### 3.1 Install Gemini Source Adapter `[GUIDED]`

Write the Google Meet transcript adapter. This uses the Google Drive API via a service account to find and fetch auto-generated meeting transcripts.

The script must:
- Read config from `transcript-pipeline.json` (the `sources.gemini` section)
- Authenticate with Google Drive API using the service account JSON key file via the `googleapis` npm package
- Search for Google Docs matching the transcript filename pattern (`"Meeting transcript - "` prefix) using `drive.files.list` with query `name contains 'Meeting transcript - ' and mimeType = 'application/vnd.google-apps.document'`
- Filter results to only include files modified within `maxAgeDays` (default 30 -- Google Meet transcripts are only available for 30 days)
- For each transcript found, check if already processed via the tracking database
- For new transcripts, export the document content as plain text using `drive.files.export` with mimeType `text/plain`
- Parse the transcript text to extract:
  - Meeting title (from the document title, stripping "Meeting transcript - " prefix)
  - Date (from file `createdTime` metadata)
  - Attendees (parsed from the transcript text header, which typically lists participants)
  - Raw text (the full transcript body)
  - Duration (estimated from transcript length and timestamps if present)
- Normalize output to the common transcript format via `common.normalizeTranscript()`
- Export a `fetchNew(db)` function that returns an array of new normalized transcripts
- Handle errors gracefully: log to stderr, return partial results if some transcripts fail
- Respect Google Drive API rate limits (default 1000 queries per 100 seconds per user for service accounts)

Write the script to `${WORKSPACE}/tools/transcripts/source-gemini.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-source-gemini-js>' | base64 -d > ${WORKSPACE}/tools/transcripts/source-gemini.js
```

Expected: File exists at `${WORKSPACE}/tools/transcripts/source-gemini.js`.

If this fails: Check that `googleapis` is installed (`npm list googleapis` in `${WORKSPACE}`). Check that the service account key path is correct.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

#### 3.2 Install Fathom Source Adapter `[GUIDED]`

Write the Fathom meeting transcript adapter. This uses the Fathom API to fetch recent meeting recordings and their transcripts.

The script must:
- Read config from `transcript-pipeline.json` (the `sources.fathom` section)
- Read the Fathom API key from `${WORKSPACE}/.env`
- Call the Fathom API to list recent recordings: `GET /v1/recordings?limit=50` with `Authorization: Bearer ${FATHOM_API_KEY}`
- Filter results to only include recordings within `maxAgeDays` (default 90)
- For each recording found, check if already processed via the tracking database (keyed by Fathom recording ID)
- For new recordings, fetch the full transcript: `GET /v1/recordings/{id}/transcript`
- Also fetch the Fathom-generated summary and action items if available: `GET /v1/recordings/{id}/summary`
- Parse the response to extract:
  - Meeting title (from recording title)
  - Date (from recording `created_at`)
  - Attendees (from recording participants list)
  - Raw text (full transcript)
  - Duration (from recording duration field)
  - Fathom-generated summary and action items (stored in `metadata` for comparison with Claude extraction)
- Normalize output to the common transcript format
- Export a `fetchNew(db)` function that returns an array of new normalized transcripts
- Implement exponential backoff for rate limiting: start at `rateLimitMs` (default 1000ms), double on 429, max 5 retries using `common.retryWithBackoff()`
- If the Fathom API key is not configured, log a warning and return an empty array (not an error)

Write the script to `${WORKSPACE}/tools/transcripts/source-fathom.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-source-fathom-js>' | base64 -d > ${WORKSPACE}/tools/transcripts/source-fathom.js
```

Expected: File exists at `${WORKSPACE}/tools/transcripts/source-fathom.js`.

If this fails: Check that the `.env` file contains `FATHOM_API_KEY`. If the client doesn't use Fathom, this adapter will gracefully return empty results.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

#### 3.3 Install Notion Source Adapter `[GUIDED]`

Write the Notion transcript adapter. This scans a designated Notion database for pages that contain meeting transcript content.

The script must:
- Read config from `transcript-pipeline.json` (the `sources.notion` section)
- Read the Notion API key from `${WORKSPACE}/.env` or `config/notion.json`
- Query the configured Notion database with a filter for pages matching the configured tag property and values (e.g., `Type` is one of `["Meeting Notes", "Transcript", "Meeting"]`)
- Also filter by `last_edited_time` to only check recently modified pages (within `maxAgeDays` or since last pipeline run)
- For each page found, check if already processed via the tracking database (keyed by Notion page ID)
- For new pages, fetch the full page content using the Notion blocks API: `GET /v1/blocks/{page_id}/children?page_size=100` (handle pagination for long pages)
- Extract text content from all text-bearing block types: `paragraph`, `heading_1/2/3`, `bulleted_list_item`, `numbered_list_item`, `to_do`, `toggle`, `callout`, `quote`
- Parse the page to extract:
  - Meeting title (from page title property)
  - Date (from the Date property if present, otherwise page `created_time`)
  - Attendees (from an Attendees/People relation property if present, or parsed from text)
  - Raw text (concatenated text from all blocks)
  - Duration (from a Duration property if present, otherwise null)
- Normalize output to the common transcript format
- Export a `fetchNew(db)` function that returns an array of new normalized transcripts
- Respect Notion rate limits: minimum 334ms between requests, exponential backoff on 429

Write the script to `${WORKSPACE}/tools/transcripts/source-notion.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-source-notion-js>' | base64 -d > ${WORKSPACE}/tools/transcripts/source-notion.js
```

Expected: File exists at `${WORKSPACE}/tools/transcripts/source-notion.js`.

If this fails: Check Notion API key and database ID. Verify the database has the configured tag property.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

### Phase 4: Install Processing Pipeline

#### 4.1 Install Transcript Processor `[GUIDED]`

Write the orchestrator script that ties everything together. This is the main entry point that runs all source adapters, processes new transcripts through Claude, and writes results to Notion.

The script must:

**Orchestration:**
- Accept command-line arguments:
  - `--run` (default): Run the full pipeline (all enabled sources)
  - `--source <name>`: Run only one source adapter (gemini, fathom, or notion)
  - `--status`: Show pipeline status (last run, record counts, recent errors)
  - `--manual "<meeting title or ID>"`: Process a specific meeting by title search across all sources
  - `--errors [--since YYYY-MM-DD]`: Show recent processing errors
  - `--dry-run`: Discover new transcripts but don't process or write to Notion
- Load config via `common.loadConfig()`
- Initialize the tracking database via `db.initDb()`
- Create a unique run ID (ISO timestamp + random suffix)
- Log the pipeline run start via `db.startRun()`

**Source collection:**
- Run each enabled source adapter's `fetchNew(db)` function
- Collect all new transcripts into a single array
- Handle errors per-source: if one source throws, catch the error, log it via `db.logError()`, and continue with remaining sources. One source failing must NOT block others.
- Log the count of new transcripts found per source

**Transcript processing (for each new transcript):**
- **Attendee matching:** For each attendee name/email in the transcript, query the Notion People database to find matching records. Use fuzzy name matching (case-insensitive, handle "John Smith" vs "Smith, John"). Use `notion-read.js` or direct API calls.
- **Claude analysis:** Send the transcript text to the Anthropic API with a system prompt that extracts:
  - Key topics and decisions (as a bulleted list)
  - Action items with owner and due date (if mentioned)
  - A 2-3 sentence meeting summary
  - Sentiment/tone of the meeting (for CRM context)

  The Claude API call structure:
  ```
  POST https://api.anthropic.com/v1/messages
  Headers:
    x-api-key: ${ANTHROPIC_API_KEY}
    anthropic-version: 2023-06-01
    content-type: application/json
  Body:
    model: ${config.processing.model}
    max_tokens: ${config.processing.maxTokens}
    system: [analysis prompt]
    messages: [{ role: "user", content: [transcript text] }]
  ```

  The system prompt must instruct Claude to return structured JSON:
  ```json
  {
    "summary": "2-3 sentence meeting summary",
    "topics": ["topic 1", "topic 2"],
    "decisions": ["decision 1", "decision 2"],
    "actionItems": [
      {
        "description": "action item text",
        "owner": "person name",
        "dueDate": "YYYY-MM-DD or null",
        "priority": "high|medium|low"
      }
    ],
    "sentiment": "positive|neutral|negative|mixed"
  }
  ```

- **Notion Interactions page creation:** Create a new page in the Interactions database with:
  - Title: meeting title
  - Date: meeting date
  - Attendees: relations to matched People records (by Notion page ID)
  - Summary: Claude-generated summary
  - Action Items: formatted action items list
  - Source: which adapter found this transcript (Gemini/Fathom/Notion)
  - Duration: meeting duration if available
  - Topics: extracted topics as multi-select tags

  Use the Notion API: `POST https://api.notion.com/v1/pages` with the appropriate property format.

  Also append the full transcript text as page content blocks (split into paragraphs to stay within Notion block size limits of 2000 characters per block).

- **People record updates:** For each matched attendee, update their "Last Contacted" date in the People database if the meeting date is more recent than the current value. Use `PATCH https://api.notion.com/v1/pages/{people_page_id}`.

- **Tracking:** Mark the transcript as processed in SQLite via `db.markProcessed()` with the Notion Interactions page ID for cross-reference.

- **Error handling per transcript:** If processing a single transcript fails (Claude API error, Notion write error), catch the error, log it via `db.logError()`, and continue with the next transcript. Never let one bad transcript kill the entire pipeline run.

**Completion:**
- Complete the pipeline run record via `db.completeRun()` with stats: transcripts found, processed, errors
- Print a processing report to stdout:
  ```
  Transcript Pipeline Run: 2026-03-27T10:30:00-06:00
  Sources checked: gemini, fathom, notion
  New transcripts found: 3 (gemini: 1, fathom: 2, notion: 0)
  Processed: 3
  Errors: 0
  Notion pages created: 3
  People records updated: 5
  ```
- Exit with code 0 if all transcripts processed, code 1 if any errors occurred (but still processed what it could)

Write the script to `${WORKSPACE}/tools/transcripts/transcript-processor.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-transcript-processor-js>' | base64 -d > ${WORKSPACE}/tools/transcripts/transcript-processor.js
```

Expected: File exists at `${WORKSPACE}/tools/transcripts/transcript-processor.js`.

If this fails: Check that all dependencies are installed (`better-sqlite3`, `googleapis`). Check that all source adapter modules exist and export `fetchNew`.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

### Phase 5: Scheduling

#### 5.1 Write Business-Hours Wrapper Script `[GUIDED]`

Launchd `StartCalendarInterval` can schedule at fixed intervals but cannot natively enforce business hours. Write a wrapper script that checks if the current time is within business hours before running the processor.

The script must:
- Read the schedule config from `transcript-pipeline.json`
- Check if the current local time is within `bizHoursStart` and `bizHoursEnd`
- If within business hours, execute `transcript-processor.js --run`
- If outside business hours, log "Outside business hours, skipping" and exit 0
- Handle the timezone correctly using the configured `${TIMEZONE}`

**Remote (use base64 encoding):**
```
echo '<base64-encoded-wrapper-sh>' | base64 -d > ${WORKSPACE}/tools/transcripts/run-pipeline.sh && chmod +x ${WORKSPACE}/tools/transcripts/run-pipeline.sh
```

The wrapper script content:

```bash
#!/bin/bash
# Transcript pipeline business-hours wrapper
# Called by launchd every 30 minutes; only runs the processor during business hours.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
CONFIG_FILE="${WORKSPACE_DIR}/config/transcript-pipeline.json"
LOG_FILE="${WORKSPACE_DIR}/logs/transcript-pipeline.log"

# Read business hours from config
BIZ_START=$(python3 -c "import json; c=json.load(open('${CONFIG_FILE}')); print(c['schedule']['bizHoursStart'])")
BIZ_END=$(python3 -c "import json; c=json.load(open('${CONFIG_FILE}')); print(c['schedule']['bizHoursEnd'])")
TZ_NAME=$(python3 -c "import json; c=json.load(open('${CONFIG_FILE}')); print(c['schedule']['timezone'])")

# Get current hour in the configured timezone
CURRENT_HOUR=$(TZ="${TZ_NAME}" date +%H | sed 's/^0//')

if [ "$CURRENT_HOUR" -ge "$BIZ_START" ] && [ "$CURRENT_HOUR" -lt "$BIZ_END" ]; then
    printf "%s Running transcript pipeline (hour %s within %s-%s %s)\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$CURRENT_HOUR" "$BIZ_START" "$BIZ_END" "$TZ_NAME" >> "$LOG_FILE"
    exec node "${SCRIPT_DIR}/transcript-processor.js" --run
else
    printf "%s Skipping: outside business hours (hour %s, window %s-%s %s)\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$CURRENT_HOUR" "$BIZ_START" "$BIZ_END" "$TZ_NAME" >> "$LOG_FILE"
    exit 0
fi
```

Expected: File exists at `${WORKSPACE}/tools/transcripts/run-pipeline.sh` with execute permission.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

#### 5.2 Write Launchd Plist `[GUIDED]`

Create the launchd plist for 30-minute transcript pipeline execution. **Level 1 -- exact syntax required.** Launchd plists require absolute paths (`~` and `${HOME}` are NOT expanded).

**CRITICAL:** Do NOT use crontab on macOS. `crontab -` and `crontab /file` hang indefinitely on macOS 15.x (Sequoia) via remote PTY due to TCC permissions. Always use launchd.

The operator must resolve `${AGENT_USER}`, `${NODE_PATH}`, and `${WORKSPACE}` to literal values before sending this file.

**Remote (use base64 encoding):**
```
echo '<base64-encoded-plist>' | base64 -d > /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.transcript-pipeline.plist
```

The plist content must be:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.transcript-pipeline</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/${AGENT_USER}/.openclaw/workspace/tools/transcripts/run-pipeline.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>StandardOutPath</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace/logs/transcript-pipeline.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace/logs/transcript-pipeline-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/${AGENT_USER}</string>
        <key>NODE_PATH</key>
        <string>/Users/${AGENT_USER}/.openclaw/workspace/node_modules</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace</string>
    <key>RunAtLoad</key>
    <false/>
    <key>Nice</key>
    <integer>10</integer>
</dict>
</plist>
```

**IMPORTANT adaptation notes:**
- Replace `/Users/${AGENT_USER}/.openclaw/workspace/` with the actual resolved `${WORKSPACE}` path if it differs from `/Users/edge/.openclaw/workspace/`.
- `StartInterval` of 1800 = 30 minutes. Launchd will fire every 1800 seconds regardless of time of day -- the business-hours check is in the wrapper script.
- `RunAtLoad` is `false` because the wrapper script handles the business hours check. We don't want an immediate run on plist load (which happens on login).
- `Nice` set to 10 gives the pipeline lower CPU priority so it doesn't interfere with the client's foreground work.
- The PATH includes `/opt/homebrew/bin` for Apple Silicon Macs and `/usr/local/bin` for Intel Macs.

Expected: Plist file exists at `/Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.transcript-pipeline.plist` with valid XML.

If this fails: Check that `~/Library/LaunchAgents/` directory exists. Create with `mkdir -p /Users/${AGENT_USER}/Library/LaunchAgents`.

If already exists: Compare content. If unchanged, skip. If different, unload the old plist first, then write new version and reload.

#### 5.3 Load the Launchd Plist `[AUTO]`

Register the plist with launchd so the scheduled runs begin. **Level 1 -- exact syntax required.**

First, check if already loaded:

**Remote:**
```
launchctl list 2>/dev/null | grep com.openclaw.transcript-pipeline && echo 'ALREADY_LOADED' || echo 'NOT_LOADED'
```

If `ALREADY_LOADED`, unload first:

**Remote:**
```
launchctl bootout gui/${AGENT_USER_UID}/com.openclaw.transcript-pipeline 2>/dev/null; sleep 1
```

Then load:

**Remote:**
```
launchctl bootstrap gui/${AGENT_USER_UID} /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.transcript-pipeline.plist
```

Expected: No error output. Verify with:

**Remote:**
```
launchctl list | grep com.openclaw.transcript-pipeline
```

Expected: Shows the job with PID (`-` if not currently running) and exit status 0.

If this fails:
- **"Bootstrap failed: 5: Input/output error":** Plist has syntax errors. Validate with `plutil -lint /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.transcript-pipeline.plist`.
- **"Bootstrap failed: 37: Operation already in progress":** Already loaded. Bootout first, then bootstrap again.
- **Path errors in logs:** Check that the bash path and script path in the plist are correct. Check `${WORKSPACE}/logs/transcript-pipeline-error.log` for details.

### Phase 6: TOOLS.md Integration

#### 6.1 Write TOOLS.md Entries `[GUIDED]`

Add entries to `${WORKSPACE}/TOOLS.md` so the agent knows how to use the transcript pipeline. These entries define the tools the agent can invoke during conversations.

Check if TOOLS.md exists:

**Remote:**
```
test -f ${WORKSPACE}/TOOLS.md && echo 'EXISTS' || echo 'NOT_FOUND'
```

If it exists, append the transcript pipeline section. If not, create it.

Check if a transcript section already exists:

**Remote:**
```
grep -q "## Transcript Pipeline" ${WORKSPACE}/TOOLS.md 2>/dev/null && echo 'SECTION_EXISTS' || echo 'NO_SECTION'
```

If `SECTION_EXISTS`, compare and update if different. If `NO_SECTION`, append.

The transcript pipeline TOOLS.md content to add:

```markdown
## Transcript Pipeline

### Process Latest Meetings
Run the transcript pipeline to collect and process new meeting transcripts from all sources.
```
node /Users/edge/.openclaw/workspace/tools/transcripts/transcript-processor.js --run
```
Use for: "Process my latest meetings", "Check for new transcripts", "Run the transcript pipeline"

### Process from Specific Source
Run only one source adapter (gemini, fathom, or notion).
```
node /Users/edge/.openclaw/workspace/tools/transcripts/transcript-processor.js --source gemini
```
Use for: "Check for new Google Meet transcripts", "Process Fathom recordings", "Scan Notion for meeting notes"

### Find a Specific Meeting
Search for and process a specific meeting by title.
```
node /Users/edge/.openclaw/workspace/tools/transcripts/transcript-processor.js --manual "MEETING TITLE"
```
Use for: "Process my meeting with Dan from this morning", "Find the transcript from the board meeting"

### Pipeline Status
Check when the pipeline last ran and how many transcripts have been processed.
```
node /Users/edge/.openclaw/workspace/tools/transcripts/transcript-processor.js --status
```
Use for: "When did transcripts last sync?", "How many meetings have been processed?"

### View Processing Errors
Show recent errors from transcript processing.
```
node /Users/edge/.openclaw/workspace/tools/transcripts/transcript-processor.js --errors
```
Use for: "Are there any transcript processing errors?", "Why wasn't my meeting processed?"

### Dry Run
Discover new transcripts without processing them.
```
node /Users/edge/.openclaw/workspace/tools/transcripts/transcript-processor.js --dry-run
```
Use for: "What new meetings are available?", "Preview what would be processed"
```

Write the TOOLS.md content using base64 encoding.

**Remote (to append):**
```
echo '<base64-encoded-tools-section>' | base64 -d >> ${WORKSPACE}/TOOLS.md
```

Expected: TOOLS.md contains the Transcript Pipeline section with all tool entries.

If already exists with correct content: Skip.

## Verification

Run these checks to confirm the transcript pipeline is working end-to-end.

### Verify config is valid

**Remote:**
```
cd ${WORKSPACE} && python3 -c "
import json
c = json.load(open('config/transcript-pipeline.json'))
sources = {k: v.get('enabled', False) for k, v in c['sources'].items()}
print('Sources:', sources)
print('Processing model:', c['processing']['model'])
print('Interactions DB:', c['notion']['interactionsDbId'][:12] + '...')
print('People DB:', c['notion']['peopleDbId'][:12] + '...')
print('Schedule:', c['schedule']['intervalMinutes'], 'min,', c['schedule']['bizHoursStart'], '-', c['schedule']['bizHoursEnd'], c['schedule']['timezone'])
"
```

Expected: Shows enabled sources, model, database IDs, and schedule configuration.

### Verify tracking database exists and has correct schema

**Remote:**
```
sqlite3 ${WORKSPACE}/data/transcript-tracking.db ".tables" 2>/dev/null || echo 'NO_DB'
```

Expected: Lists `pipeline_runs`, `processed_transcripts`, `processing_errors`.

### Verify Gemini source adapter (if enabled)

**Remote:**
```
cd ${WORKSPACE} && node -e "
const source = require('./tools/transcripts/source-gemini.js');
const db = require('./tools/transcripts/db.js');
const instance = db.initDb('./data/transcript-tracking.db');
source.fetchNew(instance).then(results => {
    console.log('Gemini transcripts found:', results.length);
    results.forEach(t => console.log(' -', t.meetingTitle, '(' + t.date + ')'));
    instance.close();
}).catch(err => { console.error('Error:', err.message); instance.close(); process.exit(1); });
"
```

Expected: Lists any Google Meet transcripts found (may be 0 if no recent meetings). The adapter should not throw.

If this fails:
- **Authentication error:** Check the service account key path and that Drive API is enabled.
- **No transcripts:** Verify that the client's Google Drive has meeting transcripts shared with the service account email.

### Verify Fathom source adapter (if enabled)

**Remote:**
```
cd ${WORKSPACE} && node -e "
const source = require('./tools/transcripts/source-fathom.js');
const db = require('./tools/transcripts/db.js');
const instance = db.initDb('./data/transcript-tracking.db');
source.fetchNew(instance).then(results => {
    console.log('Fathom transcripts found:', results.length);
    results.forEach(t => console.log(' -', t.meetingTitle, '(' + t.date + ')'));
    instance.close();
}).catch(err => { console.error('Error:', err.message); instance.close(); process.exit(1); });
"
```

Expected: Lists any Fathom recordings found (may be 0). If Fathom is not configured, should print a warning and return 0 results, not throw.

### Verify Notion source adapter (if enabled)

**Remote:**
```
cd ${WORKSPACE} && node -e "
const source = require('./tools/transcripts/source-notion.js');
const db = require('./tools/transcripts/db.js');
const instance = db.initDb('./data/transcript-tracking.db');
source.fetchNew(instance).then(results => {
    console.log('Notion transcripts found:', results.length);
    results.forEach(t => console.log(' -', t.meetingTitle, '(' + t.date + ')'));
    instance.close();
}).catch(err => { console.error('Error:', err.message); instance.close(); process.exit(1); });
"
```

Expected: Lists any Notion pages matching transcript tags. Should not throw even if no matching pages exist.

### Verify full pipeline with dry run

**Remote:**
```
cd ${WORKSPACE} && node tools/transcripts/transcript-processor.js --dry-run
```

Expected: Shows a report of new transcripts found across all sources without processing them. Confirms all source adapters can be loaded and executed together.

### Verify full pipeline end-to-end (process one transcript)

**Remote:**
```
cd ${WORKSPACE} && node tools/transcripts/transcript-processor.js --run 2>&1 | tail -20
```

Expected: Pipeline runs, processes new transcripts, creates Notion Interactions pages, updates People records. Shows a processing report with counts.

After running, verify a Notion Interactions page was created:

**Remote:**
```
curl -s "https://api.notion.com/v1/databases/${NOTION_INTERACTIONS_DB_ID}/query" \
  -H "Authorization: Bearer ${NOTION_API_KEY}" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{"page_size": 3, "sorts": [{"timestamp": "created_time", "direction": "descending"}]}' \
  | python3 -c "
import json, sys
data = json.load(sys.stdin)
for page in data.get('results', []):
    props = page.get('properties', {})
    title_arr = props.get('Title', props.get('Name', {})).get('title', [])
    title = title_arr[0]['plain_text'] if title_arr else 'Untitled'
    print(f'  {title} (created: {page[\"created_time\"][:10]})')
"
```

Expected: Shows recently created Interactions pages including any just processed by the pipeline.

### Verify pipeline status command

**Remote:**
```
cd ${WORKSPACE} && node tools/transcripts/transcript-processor.js --status
```

Expected: Shows last run time, total transcripts processed, source breakdown, and recent errors (if any).

### Verify launchd is scheduled

**Remote:**
```
launchctl list | grep com.openclaw.transcript-pipeline
```

Expected: Job listed with exit status 0 (or `-` for PID if not currently running).

### Verify TOOLS.md has transcript entries

**Remote:**
```
grep -c "transcript-processor\|source-gemini\|source-fathom\|source-notion" ${WORKSPACE}/TOOLS.md
```

Expected: Count >= 4 (multiple references across tool entries).

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Gemini: "insufficient permissions" | Service account not shared with transcript folder | Client must share their meeting transcript folder with the service account email address |
| Gemini: no transcripts found | Transcripts older than 30 days, or wrong search pattern | Check `maxAgeDays` in config. Verify transcript filename pattern matches what Google generates. |
| Gemini: "Google Drive API not enabled" | API not enabled for the service account project | Enable Google Drive API in Google Cloud Console > APIs & Services > Library |
| Fathom: 401 Unauthorized | Invalid or expired API key | Ask client to regenerate at Fathom settings. Update `${WORKSPACE}/.env`. |
| Fathom: 429 Too Many Requests | Rate limiting | The adapter has built-in exponential backoff. If persistent, increase `rateLimitMs` in config. |
| Fathom: empty results | No recordings in the configured time window | Check `maxAgeDays`. Verify the client is recording with Fathom. |
| Notion: empty results | Wrong tag filter or database ID | Verify `tagProperty` and `tagFilter` in config match actual Notion property name and values. Check that pages are tagged correctly. |
| Notion: 401 on API calls | Invalid or expired Notion API key | Regenerate at https://www.notion.so/my-integrations. Update `.env` and config. |
| Claude API: 401 | Invalid Anthropic API key | Check `ANTHROPIC_API_KEY` in `.env`. Must start with `sk-ant-api03-`. |
| Claude API: 429 | Rate limited | The processor has built-in backoff. If persistent, reduce batch size or add delay between transcripts. |
| Notion write: 400 Bad Request | Property name mismatch in config | Re-check `interactionFields` against actual Notion database schema. Property names are case-sensitive. |
| Notion write: page created but no content | Block write failed, page properties succeeded | Check `transcript-pipeline-error.log`. Notion blocks API has a 2000-char limit per block. |
| People matching: no matches found | Name format mismatch (e.g., "J. Smith" vs "John Smith") | The matcher uses fuzzy matching. Check the People database has names in a recognizable format. May need manual mapping for common mismatches. |
| Pipeline runs but finds 0 transcripts | All transcripts already processed | Check `--status` for last run and processed count. Use `sqlite3 ${WORKSPACE}/data/transcript-tracking.db "SELECT COUNT(*) FROM processed_transcripts"` to see total. |
| Pipeline hangs | One source adapter is stuck on an API call | Check which source is running. Each source has a timeout. Kill the process and check error logs. |
| Launchd fires but nothing happens | Business hours check: running outside configured hours | Check `transcript-pipeline.log` for "Skipping: outside business hours" messages. Adjust `bizHoursStart`/`bizHoursEnd` if needed. |
| Launchd not firing at all | Plist syntax error or not loaded | Validate with `plutil -lint`. Verify loaded with `launchctl list | grep transcript`. Check error log. |
| better-sqlite3 module error | Native addon architecture mismatch | Run `cd ${WORKSPACE} && npm rebuild better-sqlite3`. On Apple Silicon, ensure Node.js is ARM64 native. |
| Duplicate Interactions pages | Tracking database corrupted or reset | Check `transcript-tracking.db`. If corrupted, back up and recreate. Pipeline will re-process transcripts but can detect existing Notion pages. |

## Autonomy Mode Behavior

| Step | Auto | Guided | Manual |
|------|------|--------|--------|
| 1.1 Create directories | Execute silently | Execute silently | Confirm before creating |
| 1.2 Install npm dependencies | Execute silently | Confirm before installing | Confirm, review packages |
| 1.3 Collect Fathom API key | Pause for `[HUMAN_INPUT]` | Pause for `[HUMAN_INPUT]` | Pause for `[HUMAN_INPUT]` |
| 1.4 Verify Google service account | Execute silently | Show SA details, confirm | Show details, confirm each check |
| 1.5 Verify Notion Interactions DB | Execute silently | Show schema, confirm mapping | Show schema, confirm each field |
| 1.6 Write pipeline config | Execute silently | Review config before writing | Review every field |
| 2.1 Install common.js | Execute silently | Confirm before writing | Review module, confirm |
| 2.2 Install db.js | Execute silently | Confirm before writing | Review module, confirm |
| 3.1 Install source-gemini.js | Execute silently | Confirm before writing | Review script, confirm |
| 3.2 Install source-fathom.js | Execute silently | Confirm before writing | Review script, confirm |
| 3.3 Install source-notion.js | Execute silently | Confirm before writing | Review script, confirm |
| 4.1 Install transcript-processor.js | Execute silently | Confirm before writing | Review script, confirm |
| 5.1 Write business-hours wrapper | Execute silently | Review script before writing | Review every line |
| 5.2 Write launchd plist | Execute silently | Review plist content before writing | Review every field |
| 5.3 Load launchd plist | Execute silently | Confirm before loading | Confirm command |
| 6.1 Write TOOLS.md entries | Execute silently | Review entries before writing | Review each entry |

## Security Considerations

- **All processing is LOCAL.** Transcript text is never stored in cloud services beyond what already exists in the source (Google Drive, Fathom, Notion). The Claude API call sends transcript text for analysis but Anthropic does not retain it per their API terms.
- **Service account key:** The Google service account JSON key must be protected. It should be readable only by the agent user: `chmod 600 ${GOOGLE_SERVICE_ACCOUNT_KEY}`.
- **API keys in `.env`:** The `.env` file contains sensitive keys. Ensure it is not committed to git and has restrictive permissions: `chmod 600 ${WORKSPACE}/.env`.
- **SQLite database:** The tracking database contains meeting titles and attendee names (not full transcripts). Ensure `${WORKSPACE}/data/` is not publicly accessible.
- **Notion writes:** The pipeline creates pages in Notion that contain meeting summaries and action items. Ensure the Interactions database has appropriate sharing settings in Notion.

## Dependencies

- **Depends on:** `openclaw/install.md` (OpenClaw installed), `deploy-identity.md` (agent identity), `deploy-notion-workspace.md` (Notion API key and People database mapping)
- **Enhanced by:** `deploy-daily-briefing.md` (processed meetings feed into daily briefing context), `deploy-personal-crm.md` (People matching can cross-reference with CRM contacts)
- **Required by:** None (standalone pipeline, but enriches many other systems)
- **Feeds into:** `deploy-daily-briefing.md` (meeting summaries and action items), `deploy-notion-workspace.md` (creates Interactions pages, updates People records), action item tracking workflows (extracted action items can be piped to Todoist, Asana, or Notion Tasks via downstream skills)
