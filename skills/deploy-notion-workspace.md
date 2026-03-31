# Deploy Notion Workspace Integration

## Compatibility
- **OpenClaw Version**: 2026.3.22
- **Status**: READY
- **Blocked Commands**: None
- **Notes**: This skill avoids all nonexistent OpenClaw CLI commands. Uses file-based config, Node.js scripts with raw Notion API calls, and launchd for scheduling. Fully tested against 2026.3.22 limitations.

## Purpose

Connect the agent to a client's Notion workspace for bidirectional data access. Enables the agent to read from key databases (People, Companies, Tasks) for meeting prep and briefings, and write back action items, CRM enrichment, and status updates. The Notion workspace becomes a live data layer that the agent can query and update as part of its daily operations.

**When to use:** When the client uses Notion as their primary workspace for contacts, companies, and task management -- particularly VC firms, operators, and executives who maintain large Notion CRMs.

**What this skill does:**
1. Configures Notion API connection with a workspace-level integration bot token
2. Discovers and maps the client's key databases (People, Companies, Tasks/Action Items)
3. Creates a local config file mapping Notion database IDs to purposes
4. Installs Node.js scripts for reading, writing, and syncing Notion data
5. Schedules hourly bidirectional sync via launchd
6. Creates TOOLS.md entries so the agent knows how to use Notion
7. Verifies read AND write access with test operations

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
| `${NOTION_API_KEY}` | Client: Notion Settings > Integrations > Internal integration token | `ntn_abc123def456...` |
| `${NOTION_PEOPLE_DB_ID}` | Discovered in Phase 2 or client provides | `a1b2c3d4e5f6...` |
| `${NOTION_COMPANIES_DB_ID}` | Discovered in Phase 2 or client provides | `b2c3d4e5f6a1...` |
| `${NOTION_TASKS_DB_ID}` | Discovered in Phase 2 or client provides | `c3d4e5f6a1b2...` |
| `${TIMEZONE}` | Client profile: timezone | `America/Denver` |
| `${AGENT_USER}` | Pre-flight check: `whoami` on client machine | `edge` |
| `${AGENT_USER_UID}` | Pre-flight check: `id -u` on client machine | `501` |

## Before You Start

Follow the **Standard Deployment Protocol** in `_deploy-common.md`: read the client profile, check what exists, identify adaptations, and present a deployment plan before executing.

**Pre-flight checks for this skill:**

Check if Node.js is available (required for all scripts):

**Remote:**
```
node --version 2>/dev/null || echo 'NO_NODE'
```

Expected: Version string (v18+ required). If `NO_NODE`, install Node.js first.

Check if a Notion config already exists:

**Remote:**
```
test -f ${WORKSPACE}/config/notion.json && cat ${WORKSPACE}/config/notion.json | head -20 || echo 'NOT_CONFIGURED'
```

Expected: Either existing config (review for correctness) or `NOT_CONFIGURED`.

Check if Notion scripts already exist:

**Remote:**
```
ls ${WORKSPACE}/tools/notion-read.js ${WORKSPACE}/tools/notion-write.js ${WORKSPACE}/tools/notion-sync.js 2>/dev/null || echo 'NO_SCRIPTS'
```

Expected: Either file paths listed (review for correctness) or `NO_SCRIPTS`.

Check if the hourly sync launchd plist is already loaded:

**Remote:**
```
launchctl list 2>/dev/null | grep com.openclaw.notion-sync || echo 'NO_LAUNCHD'
```

Expected: Either plist entry (already scheduled) or `NO_LAUNCHD`.

Resolve the macOS username and UID (needed for launchd absolute paths):

**Remote:**
```
whoami && id -u
```

Expected: Username and numeric UID. Record both -- launchd plists require absolute paths (`/Users/${AGENT_USER}/...`) and `launchctl bootstrap` requires `gui/${AGENT_USER_UID}`.

**Decision points from pre-flight:**
- Does the client have a Notion workspace with an internal integration created? If not, guide them through creating one at https://www.notion.so/my-integrations.
- Which databases should be mapped? Get confirmation on People, Companies, and Tasks database names/locations.
- Is the integration bot invited to each database? The bot must be explicitly added to each database via the "..." menu > "Connections" in Notion.

## Adaptation Points

| Component | Default | Customize When... |
|-----------|---------|-------------------|
| People database | `${NOTION_PEOPLE_DB_ID}` | Client uses a different name (e.g., "Contacts", "Network", "Rolodex") |
| Companies database | `${NOTION_COMPANIES_DB_ID}` | Client uses "Firms", "Portfolio", "Organizations", etc. |
| Tasks database | `${NOTION_TASKS_DB_ID}` | Client uses "Inquiries", "Action Items", "Board", "To Do", etc. |
| Sync frequency | Hourly | Client wants more/less frequent sync |
| Sync direction | Bidirectional (read + write) | Client wants read-only (no agent writes to Notion) |
| Rate limiting | 3 req/sec with exponential backoff | Notion changes rate limits (unlikely) |
| Config location | `${WORKSPACE}/config/notion.json` | Client prefers config in a different path |
| Script location | `${WORKSPACE}/tools/` | Client prefers scripts elsewhere |
| People DB page limit | 100 per query (paginated) | Adjust batch size for very large databases (20,000+ records) |

## Approval Gates & Oversight Agent

**Every write, update, archive, or delete operation against Notion requires human approval.** This is non-negotiable. Notion contains Dan's 20K+ contact directory, company records, and operational tasks. A misfire — deleting a record, overwriting a field, archiving the wrong database — could destroy years of accumulated context.

### Operation Classification

| Operation Type | Risk Level | Approval Required | Who Approves |
|---------------|------------|-------------------|-------------|
| **Read / Query** | None | No approval needed | Auto |
| **Create** (new page/task) | Low | Emily approves via Telegram before creation | Emily |
| **Update** (modify existing properties) | Medium | Oversight agent reviews diff, then Emily approves | Oversight → Emily |
| **Archive** (soft delete — page still recoverable) | High | Oversight agent reviews, Emily approves, logged with rollback info | Oversight → Emily |
| **Delete** (permanent — NOT recoverable) | BLOCKED | **Never executed by Edge. Period.** If deletion is needed, a human does it manually in Notion. | N/A — not allowed |
| **Bulk operations** (sync pushing 100+ changes) | High | Oversight agent reviews batch summary, Emily approves batch, first 5 changes shown in detail | Oversight → Emily |
| **Schema changes** (add/rename/remove properties) | BLOCKED | **Never executed by Edge.** Schema changes are manual only. | N/A — not allowed |

### Oversight Agent (Harness Pattern)

Before any write/update/archive operation reaches the Notion API, an Oversight Agent (Claude Sonnet) reviews it. This implements the same Generator + Evaluator harness pattern used in the Daily Briefing.

**Flow for every Notion write:**

```
Edge wants to write to Notion
         ↓
1. Operation queued to notion-outbox/ as JSON
   { "action": "update", "database": "people", "pageId": "abc123",
     "changes": { "Last Touchpoint": "2026-03-31" }, "reason": "Post-meeting enrichment" }
         ↓
2. Oversight Agent (Claude Sonnet) reviews:
   - Is this operation consistent with the reason given?
   - Does the change make sense? (e.g., updating a date is fine; blanking a name is suspicious)
   - Is the scope proportional? (updating 1 field = fine; updating 50 fields on 1 record = flag)
   - Is this a bulk operation? If >10 records, flag for batch review.
   - Could this be destructive? (setting a field to empty, archiving, changing a relation)
         ↓
3. Oversight Agent verdict:
   SAFE → queue for Emily approval
   SUSPICIOUS → flag with explanation, queue for Emily with warning
   DANGEROUS → block, notify Ryan (operator) immediately
         ↓
4. Emily receives Telegram notification:
   "Edge wants to update Dan Caruso's record:
    Last Touchpoint: 2026-03-28 → 2026-03-31
    Reason: Post-meeting enrichment from today's 2:00 PM meeting
    Oversight: ✓ SAFE
    [Approve] [Reject] [Review Details]"
         ↓
5. Emily approves → operation executes → result logged
   Emily rejects → operation discarded → logged with rejection reason
   No response in 4 hours → operation expires → logged as timeout
```

### Oversight Agent Prompt

```
You are a Notion database oversight agent for a VC firm. Your job is to review
every proposed write operation before it reaches the Notion API.

RULES:
1. NEVER approve deletion operations. They should never reach you, but if they do, BLOCK.
2. NEVER approve schema changes (adding/removing/renaming properties). BLOCK.
3. Flag any operation that empties/blanks a field that previously had content.
4. Flag any operation that changes more than 5 fields on a single record.
5. Flag any bulk operation affecting more than 10 records.
6. Flag any operation on a record that was last modified less than 1 hour ago (rapid changes = possible loop).
7. For updates: show the BEFORE and AFTER values so the human reviewer can see the diff.
8. For creates: verify all required fields are populated.
9. For archives: verify the record isn't a high-value contact (Dan Priority = High, or has recent interactions).

Return:
{
  "verdict": "safe|suspicious|dangerous",
  "explanation": "Why this verdict",
  "diff": { "field": { "before": "old", "after": "new" } },
  "flags": ["list of concerns if any"],
  "recommendation": "approve|review_carefully|block"
}
```

### What Gets Blocked (Hard Rules — No Override)

These operations are **never** executed by Edge regardless of approval:

1. **Permanent deletion** of any Notion page (use archive instead, which is recoverable)
2. **Schema modification** (adding, removing, or renaming database properties)
3. **Bulk deletion/archive** of more than 10 records in a single operation
4. **Modifying another user's** integration permissions or workspace settings
5. **Writing to databases** not in the approved config (`notion.json`)

If Edge encounters a situation requiring any of these, it sends a Telegram message to Ryan (operator) explaining what it needs done, and a human performs the operation manually.

### Rollback Capability

Every write operation is logged with enough detail to manually reverse it:

```json
{
  "operationId": "op_abc123",
  "timestamp": "2026-03-31T...",
  "action": "update",
  "database": "people",
  "pageId": "notion_page_abc",
  "before": { "Last Touchpoint": "2026-03-28", "Dan Priority": "Medium" },
  "after": { "Last Touchpoint": "2026-03-31", "Dan Priority": "High" },
  "approvedBy": "Emily",
  "approvedAt": "2026-03-31T...",
  "oversightVerdict": "safe"
}
```

Stored at `${WORKSPACE}/logs/notion-operations.jsonl` (append-only log). If something goes wrong, the operator can read the before-values and manually revert.

### Cost

- Oversight agent: ~$0.02 per operation (one Sonnet call with operation context)
- For a typical day with 10-20 Notion writes: ~$0.20-0.40/day
- Worth it — protecting 20K+ contacts from accidental corruption

## Prerequisites

- Node.js v18+ available on the client machine
- `deploy-identity.md` completed (agent identity configured)
- Notion workspace with an internal integration created (https://www.notion.so/my-integrations)
- Integration bot invited to each target database in Notion (via database "..." menu > Connections)
- Emily on Telegram (for write approvals)
- Anthropic API key (for oversight agent)

## What Gets Installed

### Notion Config (`config/notion.json`)

| Field | Description |
|-------|-------------|
| `apiKey` | Notion integration token (ntn_...) |
| `version` | Notion API version header (2022-06-28) |
| `databases.people` | Database ID and field mappings for People |
| `databases.companies` | Database ID and field mappings for Companies |
| `databases.tasks` | Database ID and field mappings for Tasks |
| `rateLimitMs` | Minimum milliseconds between API calls (334ms = ~3/sec) |
| `syncState` | Last sync cursors per database |

### Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `notion-read.js` | `${WORKSPACE}/tools/notion-read.js` | Query databases with filters. Used for meeting prep, briefings, lookups. |
| `notion-write.js` | `${WORKSPACE}/tools/notion-write.js` | Create/update pages. Used for action items, CRM enrichment. |
| `notion-sync.js` | `${WORKSPACE}/tools/notion-sync.js` | Bidirectional hourly sync. Detects changes, reconciles conflicts. |

### Launchd Plist

| Detail | Value |
|--------|-------|
| Label | `com.openclaw.notion-sync` |
| Schedule | Every hour at minute 0 |
| Location | `~/Library/LaunchAgents/com.openclaw.notion-sync.plist` |
| Log output | `${WORKSPACE}/logs/notion-sync.log` |
| Error output | `${WORKSPACE}/logs/notion-sync-error.log` |

### TOOLS.md Entries

Adds entries to `${WORKSPACE}/TOOLS.md` so the agent knows:
- How to look up a person by name or email
- How to look up a company
- How to query tasks by status or assignee
- How to create a new task/action item
- How to update a person or company record

## Steps

### Phase 1: Directory Structure and Credentials

#### 1.1 Create Directory Structure `[AUTO]`

Create all directories needed for Notion integration files.

**Remote:**
```
mkdir -p ${WORKSPACE}/config ${WORKSPACE}/tools ${WORKSPACE}/logs ${WORKSPACE}/data
```

Expected: All directories exist. `mkdir -p` is idempotent.

#### 1.2 Store Notion API Key `[HUMAN_INPUT]`

The client must provide their Notion internal integration token. Guide them to https://www.notion.so/my-integrations if they haven't created one.

The token must start with `ntn_`. If it does not, STOP and ask the client for the correct token.

Write the token to the workspace `.env` file.

**Remote:**
```
grep -q NOTION_API_KEY ${WORKSPACE}/.env 2>/dev/null && echo 'ALREADY_SET' || echo 'NOTION_API_KEY=${NOTION_API_KEY}' >> ${WORKSPACE}/.env
```

Expected: Token line present in `.env`. Verify with:

**Remote:**
```
grep NOTION_API_KEY ${WORKSPACE}/.env | head -c 25
```

Expected: Shows `NOTION_API_KEY=ntn_` prefix (enough to confirm format without exposing full secret).

If this fails: Ensure `${WORKSPACE}/.env` exists and is writable. Create it if missing.

If already exists: Verify the token is still valid by testing it in Phase 2. If invalid, replace the line.

#### 1.3 Validate Notion API Connection `[AUTO]`

Test that the API key works by calling the Users endpoint (lightweight, always available).

**Remote:**
```
curl -s -w "\n%{http_code}" "https://api.notion.com/v1/users/me" \
  -H "Authorization: Bearer ${NOTION_API_KEY}" \
  -H "Notion-Version: 2022-06-28"
```

Expected: HTTP 200 response with bot user object. The response includes the integration name and bot ID.

If this fails:
- **401 Unauthorized:** Token is invalid or expired. Ask the client to regenerate at https://www.notion.so/my-integrations.
- **403 Forbidden:** Token is valid but lacks permissions. Check integration capabilities in Notion settings.
- **Network error:** Check internet connectivity on the client machine.

### Phase 2: Database Discovery and Mapping

#### 2.1 Search for Databases `[GUIDED]`

Use the Notion search API to discover databases the integration can access. This requires the integration bot to have been invited to each database.

**Remote:**
```
curl -s "https://api.notion.com/v1/search" \
  -H "Authorization: Bearer ${NOTION_API_KEY}" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{"filter":{"value":"database","property":"object"},"page_size":20}'
```

Expected: JSON response with a `results` array listing databases. Each result includes `id`, `title`, and `properties` (the schema). Record the database names and IDs.

If this fails:
- **Empty results:** The integration bot has not been invited to any databases. Guide the client: open each database in Notion, click "..." menu > "Connections" > add the integration.
- **Only some databases found:** The bot is only connected to some databases. Repeat the invitation process for missing ones.

If the client's database names do not exactly match "People", "Companies", "Tasks", ask the client to confirm which databases to map. Common alternatives: "Contacts", "Network", "Firms", "Portfolio", "Action Items", "Inquiries", "Board".

#### 2.2 Map Database Properties `[GUIDED]`

For each discovered database, retrieve its schema to understand the property names and types. This is critical for building correct queries.

**Remote (repeat for each database ID):**
```
curl -s "https://api.notion.com/v1/databases/${DATABASE_ID}" \
  -H "Authorization: Bearer ${NOTION_API_KEY}" \
  -H "Notion-Version: 2022-06-28" | python3 -c "
import json, sys
db = json.load(sys.stdin)
title = db.get('title', [{}])[0].get('plain_text', 'Unknown')
print(f'Database: {title}')
print(f'ID: {db[\"id\"]}')
print('Properties:')
for name, prop in sorted(db.get('properties', {}).items()):
    print(f'  {name}: {prop[\"type\"]}')
"
```

Expected: Database name, ID, and property listing (name + type). Record the property names -- these will be used in the config file for field mapping.

Present the mapping to the operator for confirmation before proceeding:

> **Database Mapping:**
> - People: `${NOTION_PEOPLE_DB_ID}` -- properties: Name (title), Email (email), Company (relation), Phone (phone_number), ...
> - Companies: `${NOTION_COMPANIES_DB_ID}` -- properties: Name (title), Industry (select), Website (url), ...
> - Tasks: `${NOTION_TASKS_DB_ID}` -- properties: Title (title), Status (status/select), Assignee (people), Due Date (date), ...

#### 2.3 Write Notion Config `[GUIDED]`

Write the config file that maps database IDs to purposes and records property names for queries.

The operator must construct this JSON with the actual database IDs and property names discovered in steps 2.1 and 2.2. The template below shows the structure -- substitute real values.

**Remote (use base64 encoding per `_deploy-common.md` File Transfer Standard):**

Encode the JSON config content as base64 on the operator side, then send:

```
echo '<base64-encoded-notion-config-json>' | base64 -d > ${WORKSPACE}/config/notion.json
```

The JSON structure must follow this template:

```json
{
  "apiKey": "${NOTION_API_KEY}",
  "version": "2022-06-28",
  "baseUrl": "https://api.notion.com/v1",
  "rateLimitMs": 334,
  "databases": {
    "people": {
      "id": "${NOTION_PEOPLE_DB_ID}",
      "purpose": "Contact directory - people, relationships, meeting history",
      "fields": {
        "name": "Name",
        "email": "Email",
        "company": "Company",
        "phone": "Phone",
        "notes": "Notes",
        "lastContacted": "Last Contacted"
      }
    },
    "companies": {
      "id": "${NOTION_COMPANIES_DB_ID}",
      "purpose": "Company directory - firms, portfolio companies, partners",
      "fields": {
        "name": "Name",
        "industry": "Industry",
        "website": "Website",
        "stage": "Stage",
        "notes": "Notes"
      }
    },
    "tasks": {
      "id": "${NOTION_TASKS_DB_ID}",
      "purpose": "Action items, inquiries, discussion topics",
      "fields": {
        "title": "Title",
        "status": "Status",
        "assignee": "Assignee",
        "dueDate": "Due Date",
        "priority": "Priority",
        "notes": "Notes"
      }
    }
  },
  "syncState": {
    "lastSync": null,
    "cursors": {}
  }
}
```

**Critical:** The `fields` mappings MUST match the actual Notion property names discovered in step 2.2. Notion property names are case-sensitive. If the People database has a property called "Full Name" instead of "Name", the config must say `"name": "Full Name"`.

Expected: File exists at `${WORKSPACE}/config/notion.json` with valid JSON.

If this fails: Check that `${WORKSPACE}/config/` exists. Verify base64 encoding produced valid JSON with `python3 -c "import json; json.load(open('${WORKSPACE}/config/notion.json'))"`.

If already exists: Compare database IDs and field mappings. If unchanged, skip. If different, back up as `notion.json.bak` and write new version.

### Phase 3: Install Scripts

#### 3.1 Install notion-read.js `[GUIDED]`

Write the read script that queries Notion databases with filters. This is the primary tool for meeting prep, briefings, and lookups.

The script must:
- Read config from `${WORKSPACE}/config/notion.json`
- Accept a database name (`people`, `companies`, `tasks`) and optional filter JSON
- Support search by name (fuzzy text match), email (exact), status (select/status), date range
- Handle pagination for large result sets (Notion returns max 100 per page)
- Respect rate limits: minimum 334ms between requests, exponential backoff on 429
- Output results as formatted text (for agent consumption) or JSON (with `--json` flag)
- Support `--limit N` to cap results (default 25)
- Support `--fields field1,field2` to select specific properties
- Exit with code 0 on success, non-zero on error with descriptive message

Usage examples the script must support:
```
# Look up a person by name
node notion-read.js people --search "Dan Caruso"

# Find all tasks with status "In Progress"
node notion-read.js tasks --filter '{"property":"Status","status":{"equals":"In Progress"}}'

# Get companies in a specific industry
node notion-read.js companies --search "crypto" --limit 10

# Output as JSON for piping
node notion-read.js people --search "John" --json

# List available databases
node notion-read.js --list
```

Write the script to `${WORKSPACE}/tools/notion-read.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-notion-read-js>' | base64 -d > ${WORKSPACE}/tools/notion-read.js
```

Expected: File exists at `${WORKSPACE}/tools/notion-read.js`. Test with `node ${WORKSPACE}/tools/notion-read.js --list` -- should list the three configured databases.

If this fails: Check Node.js version (v18+ for native fetch). If older Node.js, the script must use `https` module or install `node-fetch`.

If already exists: Compare content. If unchanged, skip. If different, back up as `notion-read.js.bak` and write new version.

#### 3.2 Install notion-write.js `[GUIDED]`

Write the script that creates and updates pages in Notion databases. This enables the agent to add action items, enrich CRM records, and log meeting outcomes.

The script must:
- Read config from `${WORKSPACE}/config/notion.json`
- Support `create` command: add a new page to a database
- Support `update` command: modify properties on an existing page by page ID
- Support `append` command: add content blocks to an existing page (for notes, meeting logs)
- Accept properties as JSON or as `--key value` pairs for common fields
- Validate required fields before making API calls
- Respect rate limits: minimum 334ms between requests, exponential backoff on 429
- Output the created/updated page ID and URL on success
- Exit with code 0 on success, non-zero on error with descriptive message

Usage examples the script must support:
```
# Create a new task
node notion-write.js tasks create --title "Follow up with Acme Corp" --status "To Do" --dueDate "2026-04-01"

# Update a person's record
node notion-write.js people update PAGE_ID --lastContacted "2026-03-27"

# Append notes to a page
node notion-write.js tasks append PAGE_ID --text "Discussed pricing. They want a proposal by Friday."

# Create with full JSON properties
node notion-write.js companies create --properties '{"Name":{"title":[{"text":{"content":"NewCo"}}]},"Industry":{"select":{"name":"FinTech"}}}'
```

Write the script to `${WORKSPACE}/tools/notion-write.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-notion-write-js>' | base64 -d > ${WORKSPACE}/tools/notion-write.js
```

Expected: File exists at `${WORKSPACE}/tools/notion-write.js`.

If this fails: Same as 3.1 -- check Node.js version and config file.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

#### 3.3 Install notion-sync.js `[GUIDED]`

Write the bidirectional sync script that keeps local cache in sync with Notion and can push local changes back. This runs on an hourly schedule.

The sync script must:
- Read config from `${WORKSPACE}/config/notion.json`
- Pull changes from each configured database since last sync cursor
- Store pulled data in `${WORKSPACE}/data/notion-cache/` as JSON files per database
- Detect local changes queued in `${WORKSPACE}/data/notion-outbox/` and push them to Notion
- Update sync cursors in `notion.json` after successful sync
- Handle conflicts: Notion wins for fields modified in both places (log the conflict)
- Respect rate limits: minimum 334ms between requests, exponential backoff on 429
- For large databases (20,000+ records like People): use pagination, process in batches of 100, track progress
- Log sync activity to `${WORKSPACE}/logs/notion-sync.log`
- Support `--status` flag to show last sync time and record counts
- Support `--dry-run` flag to show what would change without making API calls
- Support `--full` flag to force a full re-sync (ignore cursors)
- Exit with code 0 on success, non-zero on error

**Important for large databases:** The People directory has 20,000+ records. A full initial sync will take significant time due to rate limiting (20,000 records / 100 per page / 3 requests per second = ~67 seconds minimum for reads alone). The sync script must:
- Show progress during initial sync (e.g., "Synced 500/20000 people records...")
- Save progress incrementally (so a crashed sync can resume)
- Not attempt to pull all 20,000 records on every hourly sync -- use the `last_edited_time` filter to only get recently changed records

Write the script to `${WORKSPACE}/tools/notion-sync.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-notion-sync-js>' | base64 -d > ${WORKSPACE}/tools/notion-sync.js
```

Expected: File exists at `${WORKSPACE}/tools/notion-sync.js`.

If this fails: Same as 3.1 -- check Node.js version and config file. Also ensure `${WORKSPACE}/data/` directory exists.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

#### 3.4 Create Cache and Outbox Directories `[AUTO]`

Create the directories used by the sync script for local data storage.

**Remote:**
```
mkdir -p ${WORKSPACE}/data/notion-cache ${WORKSPACE}/data/notion-outbox
```

Expected: Directories exist. `mkdir -p` is idempotent.

### Phase 4: Initial Sync and Verification

#### 4.1 Test Read Access `[GUIDED]`

Verify the read script can query each database successfully.

**Remote:**
```
cd ${WORKSPACE} && node tools/notion-read.js people --limit 3
```

Expected: Returns up to 3 people records with names and properties. If the People database has 20,000+ records, this should return quickly (only fetching 3).

**Remote:**
```
cd ${WORKSPACE} && node tools/notion-read.js companies --limit 3
```

Expected: Returns up to 3 company records.

**Remote:**
```
cd ${WORKSPACE} && node tools/notion-read.js tasks --limit 3
```

Expected: Returns up to 3 task/action item records.

If any of these fail:
- **Empty results:** The integration bot may not be connected to that database. Guide the client to add the connection in Notion.
- **Property errors:** The field mappings in `notion.json` don't match actual Notion property names. Re-run step 2.2 to check.
- **401/403:** API key issue -- re-check step 1.2 and 1.3.

#### 4.2 Test Write Access `[GUIDED]`

Create a test page in the Tasks database, then delete it. This confirms bidirectional access.

**Remote:**
```
cd ${WORKSPACE} && node tools/notion-write.js tasks create --title "[TEST] Edge Integration Verification" --status "To Do" --dueDate "2026-03-28"
```

Expected: Returns a page ID and URL. Record the page ID for cleanup.

Verify the page was created:

**Remote:**
```
cd ${WORKSPACE} && node tools/notion-read.js tasks --search "Edge Integration Verification" --limit 1
```

Expected: The test task appears in results.

Clean up the test page by archiving it:

**Remote:**
```
curl -s -X PATCH "https://api.notion.com/v1/pages/${TEST_PAGE_ID}" \
  -H "Authorization: Bearer ${NOTION_API_KEY}" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{"archived": true}'
```

Expected: HTTP 200, page archived. The test page will move to Notion's trash.

If write fails:
- **403 Forbidden:** The integration does not have write ("Insert content") capability. The client must edit the integration settings at https://www.notion.so/my-integrations and enable content capabilities.
- **400 Bad Request:** Property names or types don't match the database schema. Check the field mappings in `notion.json` against the actual Notion properties from step 2.2.
- **Validation error on property:** The status value may not match available options. Query the database schema to see valid status options.

#### 4.3 Run Initial Sync `[GUIDED]`

Run the sync script for the first time. This populates the local cache. For large databases (People with 20,000+ records), this will take several minutes.

**Remote:**
```
cd ${WORKSPACE} && node tools/notion-sync.js --full 2>&1 | tail -20
```

Expected: Sync completes, shows progress and final record counts. Creates JSON cache files in `${WORKSPACE}/data/notion-cache/`. Updates sync cursors in `notion.json`.

For a database with 20,000+ people records, expect this to take 2-5 minutes due to rate limiting. The script should show progress.

If this fails:
- **Rate limited (429):** The script's backoff logic should handle this automatically. If it persists, increase `rateLimitMs` in `notion.json`.
- **Timeout:** For very large initial syncs, the command may time out over the API. Run it with output redirected so it continues even if the session is interrupted: `nohup node tools/notion-sync.js --full > logs/notion-sync.log 2>&1 &`
- **Disk space:** 20,000 records as JSON will use ~50-100MB. Check available disk space.

### Phase 5: Schedule Hourly Sync

#### 5.1 Write Launchd Plist `[GUIDED]`

Create the launchd plist for hourly Notion sync. **Level 1 -- exact syntax required.** Launchd plists require absolute paths (`~` and `${HOME}` are NOT expanded).

**CRITICAL:** Do NOT use crontab on macOS. `crontab -` and `crontab /file` hang indefinitely on macOS 15.x (Sequoia) via remote PTY due to TCC permissions. Always use launchd.

The operator must resolve `${AGENT_USER}` to the literal macOS username (e.g., `edge`) before sending this file. All paths must be absolute.

**Remote (use base64 encoding):**
```
echo '<base64-encoded-plist>' | base64 -d > /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.notion-sync.plist
```

The plist content must be:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.notion-sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/${AGENT_USER}/.openclaw/workspace/tools/notion-sync.js</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace/logs/notion-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace/logs/notion-sync-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/${AGENT_USER}</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace</string>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
```

**IMPORTANT adaptation notes:**
- Replace `/usr/local/bin/node` with the actual path from `which node` on the client machine (may be `/opt/homebrew/bin/node` on Apple Silicon Macs).
- Replace `/Users/${AGENT_USER}/.openclaw/workspace/` with the actual resolved `${WORKSPACE}` path if it differs from `/Users/edge/.openclaw/workspace/`.
- `StartCalendarInterval` with only `Minute` set to 0 fires at the top of every hour.
- `RunAtLoad` set to true means the sync will also run when the plist is first loaded.
- `launchd StartCalendarInterval` uses local time, not UTC -- no timezone conversion needed.

Expected: Plist file exists at `/Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.notion-sync.plist` with valid XML.

If this fails: Check that `~/Library/LaunchAgents/` directory exists. Create with `mkdir -p /Users/${AGENT_USER}/Library/LaunchAgents`.

If already exists: Compare content. If unchanged, skip. If different, unload the old plist first, then write new version and reload.

#### 5.2 Load the Launchd Plist `[AUTO]`

Register the plist with launchd so the hourly sync begins. **Level 1 -- exact syntax required.**

First, check if already loaded:

**Remote:**
```
launchctl list 2>/dev/null | grep com.openclaw.notion-sync && echo 'ALREADY_LOADED' || echo 'NOT_LOADED'
```

If `ALREADY_LOADED`, unload first:

**Remote:**
```
launchctl bootout gui/${AGENT_USER_UID}/com.openclaw.notion-sync 2>/dev/null; sleep 1
```

Then load:

**Remote:**
```
launchctl bootstrap gui/${AGENT_USER_UID} /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.notion-sync.plist
```

Expected: No error output. Verify with:

**Remote:**
```
launchctl list | grep com.openclaw.notion-sync
```

Expected: Shows the job with PID (or `-` if not currently running) and exit status 0.

If this fails:
- **"Bootstrap failed: 5: Input/output error":** Plist has syntax errors. Validate with `plutil -lint /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.notion-sync.plist`.
- **"Bootstrap failed: 37: Operation already in progress":** Already loaded. Bootout first, then bootstrap again.
- **Path errors in logs:** Check that the `node` path and script path in the plist are correct. Verify with `which node` and `ls ${WORKSPACE}/tools/notion-sync.js`.

### Phase 6: TOOLS.md Integration

#### 6.1 Write TOOLS.md Entries `[GUIDED]`

Add entries to `${WORKSPACE}/TOOLS.md` so the agent knows how to use the Notion integration. These entries define the tools the agent can invoke during conversations.

Check if TOOLS.md exists:

**Remote:**
```
test -f ${WORKSPACE}/TOOLS.md && echo 'EXISTS' || echo 'NOT_FOUND'
```

If it exists, append the Notion section. If not, create it with the Notion section.

The Notion TOOLS.md content to add:

```markdown
## Notion Workspace

### Look Up a Person
Query the People database by name, email, or other fields.
```
node /Users/edge/.openclaw/workspace/tools/notion-read.js people --search "NAME_OR_EMAIL"
```
Use for: meeting prep (who is this person?), relationship context, contact details.

### Look Up a Company
Query the Companies database by name or industry.
```
node /Users/edge/.openclaw/workspace/tools/notion-read.js companies --search "COMPANY_NAME"
```
Use for: portfolio research, company background, industry context.

### Query Tasks
View action items, inquiries, or discussion topics by status or assignee.
```
node /Users/edge/.openclaw/workspace/tools/notion-read.js tasks --filter '{"property":"Status","status":{"equals":"STATUS"}}'
```
Use for: daily briefing, overdue items, workload review.

### Create a Task
Add a new action item, inquiry, or discussion topic.
```
node /Users/edge/.openclaw/workspace/tools/notion-write.js tasks create --title "TASK TITLE" --status "To Do" --dueDate "YYYY-MM-DD"
```
Use for: capturing action items from meetings, follow-up reminders.

### Update a Record
Modify properties on an existing Notion page.
```
node /Users/edge/.openclaw/workspace/tools/notion-write.js DATABASE_NAME update PAGE_ID --FIELD "NEW_VALUE"
```
Use for: CRM enrichment, marking tasks complete, updating contact info.

### Add Notes to a Page
Append text content to an existing Notion page.
```
node /Users/edge/.openclaw/workspace/tools/notion-write.js DATABASE_NAME append PAGE_ID --text "NOTE CONTENT"
```
Use for: meeting notes, interaction logs, status updates.

### Notion Sync Status
Check when the last sync ran and how many records are cached.
```
node /Users/edge/.openclaw/workspace/tools/notion-sync.js --status
```
```

Write the TOOLS.md content using base64 encoding.

If TOOLS.md already exists, **append** the Notion section rather than overwriting. Check if a "Notion Workspace" section already exists:

**Remote:**
```
grep -q "## Notion Workspace" ${WORKSPACE}/TOOLS.md 2>/dev/null && echo 'NOTION_SECTION_EXISTS' || echo 'NO_NOTION_SECTION'
```

If `NOTION_SECTION_EXISTS`, compare and update if different. If `NO_NOTION_SECTION`, append.

**Remote (to append):**
```
echo '<base64-encoded-notion-tools-section>' | base64 -d >> ${WORKSPACE}/TOOLS.md
```

Expected: TOOLS.md contains the Notion Workspace section with all tool entries.

If already exists with correct content: Skip.

## Verification

Run these checks to confirm the Notion integration is working end-to-end.

### Verify config is valid

**Remote:**
```
cd ${WORKSPACE} && python3 -c "import json; c=json.load(open('config/notion.json')); print('Databases:', list(c['databases'].keys())); print('API key prefix:', c['apiKey'][:8])"
```

Expected: Lists three databases (people, companies, tasks) and shows `ntn_` prefix.

### Verify read from each database

**Remote:**
```
cd ${WORKSPACE} && node tools/notion-read.js people --limit 1
```

**Remote:**
```
cd ${WORKSPACE} && node tools/notion-read.js companies --limit 1
```

**Remote:**
```
cd ${WORKSPACE} && node tools/notion-read.js tasks --limit 1
```

Expected: Each returns at least one record with formatted output.

### Verify write access

**Remote:**
```
cd ${WORKSPACE} && node tools/notion-write.js tasks create --title "[VERIFY] Notion Integration Test" --status "To Do" && echo 'WRITE_OK'
```

Expected: Page created, returns page ID. Clean up afterward:

**Remote:**
```
curl -s -X PATCH "https://api.notion.com/v1/pages/${VERIFY_PAGE_ID}" \
  -H "Authorization: Bearer ${NOTION_API_KEY}" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  -d '{"archived": true}'
```

### Verify sync runs and completes

**Remote:**
```
cd ${WORKSPACE} && node tools/notion-sync.js --status
```

Expected: Shows last sync time and record counts per database. If initial sync hasn't run yet, run `node tools/notion-sync.js --full` first.

### Verify launchd is scheduled

**Remote:**
```
launchctl list | grep com.openclaw.notion-sync
```

Expected: Job listed with exit status 0 (or `-` for PID if not currently running).

### Verify TOOLS.md has Notion entries

**Remote:**
```
grep -c "notion-read\|notion-write\|notion-sync" ${WORKSPACE}/TOOLS.md
```

Expected: Count >= 5 (multiple references across tool entries).

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| 401 on all API calls | Invalid or expired Notion API key | Regenerate at https://www.notion.so/my-integrations. Update `${WORKSPACE}/.env` and `config/notion.json`. |
| Empty results from a database | Integration bot not connected to that database | Open the database in Notion, click "..." > Connections > add the integration. |
| Wrong property names in queries | Field mapping mismatch in `notion.json` | Re-run database schema discovery (step 2.2). Update `fields` in `notion.json` to match actual Notion property names (case-sensitive). |
| 429 Too Many Requests | Exceeding 3 req/sec rate limit | The scripts should handle this with exponential backoff. If persistent, increase `rateLimitMs` in `notion.json` to 500 or higher. |
| Sync takes very long | 20,000+ records in People database | Normal for initial sync. Subsequent hourly syncs only pull recently changed records via `last_edited_time` filter. |
| Sync crashes mid-run | Memory or network issue with large batch | Check `${WORKSPACE}/logs/notion-sync-error.log`. The sync saves progress incrementally -- re-run and it will resume. |
| launchd job not firing | Plist syntax error or wrong paths | Validate with `plutil -lint`. Check that `node` path and script path are absolute and correct. Check `${WORKSPACE}/logs/notion-sync-error.log`. |
| launchd fires but sync errors | Node.js not found at the path in plist | Update `ProgramArguments` in the plist to match `which node` output. Bootout and re-bootstrap. |
| Write creates page with wrong properties | Property type mismatch | Notion properties have specific type formats. A `select` property needs `{"name":"value"}`, a `date` needs `{"start":"YYYY-MM-DD"}`, etc. Check Notion API docs for property value formats. |
| "Could not find database" error | Database ID changed (restored from trash, duplicated) | Re-run database discovery (step 2.1) and update IDs in `notion.json`. |
| Test write succeeds but real writes fail | Database has required properties not being set | Query the database schema to find required properties. Update the write script or TOOLS.md instructions to include them. |
| Sync conflict: both local and Notion changed | Default: Notion wins, conflict logged | Check `${WORKSPACE}/logs/notion-sync.log` for conflict entries. Manual resolution may be needed for important conflicts. |

## Autonomy Mode Behavior

| Step | Auto | Guided | Manual |
|------|------|--------|--------|
| 1.1 Create directories | Execute silently | Execute silently | Confirm before creating |
| 1.2 Store Notion API key | Pause for `[HUMAN_INPUT]` | Pause for `[HUMAN_INPUT]` | Pause for `[HUMAN_INPUT]` |
| 1.3 Validate API connection | Execute silently | Execute silently | Show response |
| 2.1 Search for databases | Execute silently | Show results, confirm mapping | Show results, confirm each |
| 2.2 Map database properties | Execute silently | Show properties, confirm mapping | Show properties, confirm each |
| 2.3 Write Notion config | Execute silently | Review config before writing | Review every field |
| 3.1 Install notion-read.js | Execute silently | Confirm before writing | Review script, confirm |
| 3.2 Install notion-write.js | Execute silently | Confirm before writing | Review script, confirm |
| 3.3 Install notion-sync.js | Execute silently | Confirm before writing | Review script, confirm |
| 3.4 Create cache directories | Execute silently | Execute silently | Confirm before creating |
| 4.1 Test read access | Execute, report result | Execute, review output together | Confirm each query, review |
| 4.2 Test write access | Execute, report result | Execute, review output together | Confirm, review, confirm cleanup |
| 4.3 Run initial sync | Execute, report result | Confirm before running, monitor progress | Confirm, monitor, review results |
| 5.1 Write launchd plist | Execute silently | Review plist content before writing | Review every field |
| 5.2 Load launchd plist | Execute silently | Confirm before loading | Confirm command |
| 6.1 Write TOOLS.md entries | Execute silently | Review entries before writing | Review each entry |

## Dependencies

- **Depends on:** `openclaw/install.md` (OpenClaw must be installed), `deploy-identity.md` (agent identity configured)
- **Enhanced by:** `deploy-daily-briefing.md` (Notion tasks feed into daily briefing action items section), `deploy-personal-crm.md` (Notion People data can cross-reference with CRM contacts)
- **Required by:** None (standalone integration, but enriches many other systems)
- **Feeds into:** `deploy-daily-briefing.md` (tasks and meeting prep data), `deploy-fathom-pipeline.md` (action items from meetings can be written to Notion Tasks)
