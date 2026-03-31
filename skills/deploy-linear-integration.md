# Deploy Linear Ticket Management Integration

## Compatibility
- **OpenClaw Version**: 2026.3.22+
- **Status**: OPTIONAL / DEFERRED — Ryan decision 2026-03-30: Dan's team is not ticket-driven. Nobody will manage Linear tickets. GitHub handles version control already. This skill adds process overhead without clear value for this team right now. Can revisit if the team adopts ticket-based workflows. Build it, but don't install.
- **Blocked Commands**: None
- **Notes**: This skill avoids all nonexistent OpenClaw CLI commands. Uses file-based config in workspace, Node.js scripts with raw Linear GraphQL API calls, launchd for scheduling, and SQLite for local cache. Fully compatible with 2026.3.22 limitations.

## Purpose

Connect the agent to a client's Linear workspace for engineering ticket management. Enables the agent to query issues, cycles, and projects for sprint briefings, create tickets from action items and meeting notes, update issue status, and maintain a local SQLite cache for fast daily briefing integration. Linear becomes the engineering command center that the agent can read and write as part of its daily operations.

**When to use:** When the client uses Linear for engineering and dev ticket management -- particularly venture-backed teams, startups, and engineering organizations that run sprints in Linear.

**What this skill does:**
1. Configures Linear API connection with a personal API key and team/project defaults
2. Installs `linear-read.js` for querying issues, cycles, and projects via GraphQL
3. Installs `linear-write.js` for creating/updating issues with AI traceability labels
4. Installs `linear-sync.js` for syncing Linear state to local SQLite cache
5. Schedules sync every 2 hours during business hours via launchd
6. Creates TOOLS.md entries so the agent can create tickets, check sprints, and update status
7. Verifies read, write, and sync with end-to-end test operations

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
| `${LINEAR_API_KEY}` | **PENDING** — must use Crusoe Ventures Linear workspace API key (NOT Ryan's personal). Ryan has account access but API key not yet generated. | `lin_api_...` |
| `${LINEAR_TEAM_ID}` | Discovered in Phase 1 or client provides | `a1b2c3d4-e5f6-7890-abcd-ef1234567890` |
| `${LINEAR_PROJECT_ID}` | Discovered in Phase 1 or client provides (optional) | `b2c3d4e5-f6a1-2345-bcde-f12345678901` |
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

Expected: Version string (v18+ required for native fetch). If `NO_NODE`, install Node.js first.

Check if better-sqlite3 npm package is available (required for sync script):

**Remote:**
```
node -e "require('better-sqlite3')" 2>/dev/null && echo 'SQLITE_OK' || echo 'NO_SQLITE'
```

Expected: `SQLITE_OK`. If `NO_SQLITE`, it will be installed in Phase 2.

Check if a Linear config already exists:

**Remote:**
```
test -f ${WORKSPACE}/config/linear.json && cat ${WORKSPACE}/config/linear.json | head -20 || echo 'NOT_CONFIGURED'
```

Expected: Either existing config (review for correctness) or `NOT_CONFIGURED`.

Check if Linear scripts already exist:

**Remote:**
```
ls ${WORKSPACE}/tools/linear-read.js ${WORKSPACE}/tools/linear-write.js ${WORKSPACE}/tools/linear-sync.js 2>/dev/null || echo 'NO_SCRIPTS'
```

Expected: Either file paths listed (review for correctness) or `NO_SCRIPTS`.

Check if the sync launchd plist is already loaded:

**Remote:**
```
launchctl list 2>/dev/null | grep com.openclaw.linear-sync || echo 'NO_LAUNCHD'
```

Expected: Either plist entry (already scheduled) or `NO_LAUNCHD`.

Resolve the macOS username and UID (needed for launchd absolute paths):

**Remote:**
```
whoami && id -u
```

Expected: Username and numeric UID. Record both -- launchd plists require absolute paths (`/Users/${AGENT_USER}/...`) and `launchctl bootstrap` requires `gui/${AGENT_USER_UID}`.

**Decision points from pre-flight:**
- Does the client have a Linear API key? If not, guide them to https://linear.app/settings/api > "Personal API keys" > "Create key".
- Which team should be the default? Get confirmation on team name/ID.
- Is there a default project? Optional -- some teams organize by project, others by label.
- Should the agent create issues with an `edge-created` label for traceability? (Default: yes.)

## Adaptation Points

| Component | Default | Customize When... |
|-----------|---------|-------------------|
| Default team | `${LINEAR_TEAM_ID}` | Client has multiple teams and wants the agent to target a specific one |
| Default project | `${LINEAR_PROJECT_ID}` (optional) | Client organizes work into Linear projects |
| AI traceability label | `edge-created` | Client wants a different label name for AI-created issues |
| Sync frequency | Every 2 hours during business hours (7am-7pm) | Client wants more/less frequent sync |
| Business hours | 7am-7pm in `${TIMEZONE}` | Client works non-standard hours |
| SQLite cache location | `${WORKSPACE}/data/linear.db` | Client prefers databases in a different location |
| Config location | `${WORKSPACE}/config/linear.json` | Client prefers config in a different path |
| Script location | `${WORKSPACE}/tools/` | Client prefers scripts elsewhere |
| Default priority | None (inherit from Linear defaults) | Client wants all agent-created issues at a specific priority |
| Rate limiting | 50 req/min with exponential backoff | Linear changes rate limits |

## Prerequisites

- OpenClaw installed and running (`openclaw/install.md`)
- Node.js v18+ available on the client machine
- `deploy-identity.md` completed (agent identity configured)
- Linear workspace with a personal API key created (https://linear.app/settings/api)
- `better-sqlite3` npm package (installed in Phase 2 if missing)

## What Gets Installed

### Linear Config (`config/linear.json`)

| Field | Description |
|-------|-------------|
| `apiKey` | Linear personal API key (`lin_api_...`) |
| `graphqlEndpoint` | Linear GraphQL endpoint (`https://api.linear.app/graphql`) |
| `defaultTeamId` | Default team UUID for issue creation |
| `defaultProjectId` | Default project UUID (optional, can be `null`) |
| `defaultLabels` | Array of label names to auto-apply (includes `edge-created`) |
| `rateLimitPerMinute` | Max requests per minute (default 50) |
| `syncState` | Last sync timestamp and cursors |

### Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `linear-read.js` | `${WORKSPACE}/tools/linear-read.js` | Query issues, cycles, projects via GraphQL. Used for sprint briefings, issue lookups, cycle progress. |
| `linear-write.js` | `${WORKSPACE}/tools/linear-write.js` | Create/update issues, add comments. Used for action items, status updates, PR linking. |
| `linear-sync.js` | `${WORKSPACE}/tools/linear-sync.js` | Sync Linear state to local SQLite cache. Used by daily briefing for fast queries. |

### SQLite Database

| Detail | Value |
|--------|-------|
| Location | `${WORKSPACE}/data/linear.db` |
| Tables | `issues`, `cycles`, `sync_log` |
| Purpose | Fast local queries for briefing integration, change tracking |

### Launchd Plist

| Detail | Value |
|--------|-------|
| Label | `com.openclaw.linear-sync` |
| Schedule | Every 2 hours during business hours (7am, 9am, 11am, 1pm, 3pm, 5pm, 7pm) |
| Location | `~/Library/LaunchAgents/com.openclaw.linear-sync.plist` |
| Log output | `${WORKSPACE}/logs/linear-sync.log` |
| Error output | `${WORKSPACE}/logs/linear-sync-error.log` |

### TOOLS.md Entries

Adds entries to `${WORKSPACE}/TOOLS.md` so the agent knows:
- How to list issues by status, assignee, priority, or label
- How to get full issue details with comments and history
- How to check current cycle/sprint progress
- How to create a new issue with labels and priority
- How to update issue status or add a comment
- How to check what changed since the last sync

## Steps

### Phase 1: Configuration

#### 1.1 Create Directory Structure `[AUTO]`

Create all directories needed for Linear integration files.

**Remote:**
```
mkdir -p ${WORKSPACE}/config ${WORKSPACE}/tools ${WORKSPACE}/logs ${WORKSPACE}/data
```

Expected: All directories exist. `mkdir -p` is idempotent.

#### 1.2 Store Linear API Key `[HUMAN_INPUT]`

The client must provide their Linear personal API key. Guide them to https://linear.app/settings/api > "Personal API keys" > "Create key" if they haven't created one.

The token should start with `lin_api_`. If it does not, confirm with the client that the key is correct -- older Linear keys may use a different prefix.

Write the token to the workspace `.env` file.

**Remote:**
```
grep -q LINEAR_API_KEY ${WORKSPACE}/.env 2>/dev/null && echo 'ALREADY_SET' || echo 'LINEAR_API_KEY=${LINEAR_API_KEY}' >> ${WORKSPACE}/.env
```

Expected: Token line present in `.env`. Verify with:

**Remote:**
```
grep LINEAR_API_KEY ${WORKSPACE}/.env | head -c 30
```

Expected: Shows `LINEAR_API_KEY=lin_api_` prefix (enough to confirm format without exposing full secret).

If this fails: Ensure `${WORKSPACE}/.env` exists and is writable. Create it if missing.

If already exists: Verify the token is still valid by testing it in step 1.4. If invalid, replace the line.

#### 1.3 Discover Teams and Projects `[GUIDED]`

Query the Linear API to discover available teams and projects. This resolves `${LINEAR_TEAM_ID}` and `${LINEAR_PROJECT_ID}`.

**Remote:**
```
curl -s "https://api.linear.app/graphql" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ teams { nodes { id name key } } }"}'
```

Expected: JSON response with a `data.teams.nodes` array listing teams. Each team has `id`, `name`, and `key` (short prefix like "ENG", "OPS"). Record the default team ID.

If this fails:
- **401 Unauthorized:** API key is invalid. Ask the client to check/regenerate at https://linear.app/settings/api.
- **Network error:** Check internet connectivity on the client machine.

If the client has multiple teams, confirm which should be the default for agent-created issues.

Next, discover projects for the selected team:

**Remote:**
```
curl -s "https://api.linear.app/graphql" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ projects(filter: { state: { eq: \"started\" } }) { nodes { id name state } } }"}'
```

Expected: JSON response with active projects. Record the default project ID if the client uses projects, or set to `null` if they organize by labels/teams only.

Discover available labels for the default team:

**Remote:**
```
curl -s "https://api.linear.app/graphql" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"{ team(id: \\\"${LINEAR_TEAM_ID}\\\") { labels { nodes { id name color } } } }\"}"
```

Expected: JSON response with label list. Check if `edge-created` label already exists. If not, it will be created in Phase 2.

Present the discovery results to the operator for confirmation:

> **Linear Workspace Discovery:**
> - Teams: [list of team name (key) pairs]
> - Default team: [selected team name] (`${LINEAR_TEAM_ID}`)
> - Active projects: [list or "none"]
> - Default project: [selected project or "none"] (`${LINEAR_PROJECT_ID}`)
> - Labels: [list of existing labels]
> - Will create label: `edge-created` (if not found)

#### 1.4 Validate API Connection `[AUTO]`

Test that the API key has the required permissions by querying the authenticated user.

**Remote:**
```
curl -s -w "\n%{http_code}" "https://api.linear.app/graphql" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"query":"{ viewer { id name email } }"}'
```

Expected: HTTP 200 response with the authenticated user's details. This confirms the key is valid and has read access.

If this fails:
- **401 Unauthorized:** Token is invalid or expired. Ask the client to regenerate at https://linear.app/settings/api.
- **403 Forbidden:** Token lacks required scopes. Linear personal API keys should have full access by default.

#### 1.5 Create Traceability Label `[AUTO]`

Create the `edge-created` label on the default team so all AI-created issues are tagged for traceability. Skip if the label already exists (discovered in step 1.3).

**Remote:**
```
curl -s "https://api.linear.app/graphql" \
  -H "Authorization: ${LINEAR_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"mutation { issueLabelCreate(input: { name: \\\"edge-created\\\", color: \\\"#6B7280\\\", teamId: \\\"${LINEAR_TEAM_ID}\\\" }) { success issueLabel { id name } } }\"}"
```

Expected: JSON response with `data.issueLabelCreate.success: true` and the label ID. Record the label ID for use in `linear.json`.

If this fails:
- **Label already exists:** Linear returns an error for duplicate labels. This is fine -- record the existing label's ID from step 1.3.
- **Permission error:** The API key may lack write access. Check with the client.

If already exists: Skip. Use the existing label ID.

#### 1.6 Write Linear Config `[GUIDED]`

Write the config file that stores API connection details, default team/project, and label preferences.

The operator must construct this JSON with the actual values discovered in steps 1.3-1.5. The template below shows the structure -- substitute real values.

**Remote (use base64 encoding per `_deploy-common.md` File Transfer Standard):**

Encode the JSON config content as base64 on the operator side, then send:

```
echo '<base64-encoded-linear-config-json>' | base64 -d > ${WORKSPACE}/config/linear.json
```

The JSON structure must follow this template:

```json
{
  "apiKey": "${LINEAR_API_KEY}",
  "graphqlEndpoint": "https://api.linear.app/graphql",
  "defaultTeamId": "${LINEAR_TEAM_ID}",
  "defaultProjectId": "${LINEAR_PROJECT_ID}",
  "defaultLabels": ["edge-created"],
  "edgeCreatedLabelId": "<label-id-from-step-1.5>",
  "rateLimitPerMinute": 50,
  "syncState": {
    "lastSync": null,
    "lastIssueSyncAt": null,
    "lastCycleSyncAt": null
  }
}
```

**Notes:**
- `defaultProjectId` can be `null` if the client does not use Linear projects.
- `defaultLabels` array can include additional labels the client wants auto-applied.
- `edgeCreatedLabelId` is the UUID of the traceability label -- needed for mutations.

Expected: File exists at `${WORKSPACE}/config/linear.json` with valid JSON.

If this fails: Check that `${WORKSPACE}/config/` exists. Verify base64 encoding produced valid JSON with `python3 -c "import json; json.load(open('${WORKSPACE}/config/linear.json'))"`.

If already exists: Compare values. If unchanged, skip. If different, back up as `linear.json.bak` and write new version.

### Phase 2: Script Installation

#### 2.1 Install better-sqlite3 Dependency `[AUTO]`

The sync script requires `better-sqlite3` for local caching. Install it in the workspace if not already available.

**Remote:**
```
cd ${WORKSPACE} && test -d node_modules/better-sqlite3 && echo 'ALREADY_INSTALLED' || npm install better-sqlite3 --save
```

Expected: `better-sqlite3` available in `${WORKSPACE}/node_modules/`. If `ALREADY_INSTALLED`, skip.

If this fails:
- **npm not found:** Install Node.js first (includes npm).
- **Compilation error:** `better-sqlite3` includes native code. On macOS, Xcode Command Line Tools are required (`xcode-select --install`). On Apple Silicon, ensure the native architecture matches the Node.js build.
- **Permission denied:** Ensure the workspace directory is writable by `${AGENT_USER}`.

#### 2.2 Install linear-read.js `[GUIDED]`

Write the read script that queries Linear's GraphQL API for issues, cycles, and projects. This is the primary tool for sprint briefings, issue lookups, and cycle progress checks.

The script must:
- Read config from `${WORKSPACE}/config/linear.json`
- Accept subcommands: `issues`, `issue`, `cycle`, `projects`
- `issues` subcommand: list issues with filters for status, assignee, priority, label, team
- `issue` subcommand: get full issue details including comments, history, and linked PRs
- `cycle` subcommand: show active cycle with progress (total, completed, in-progress, triage counts)
- `projects` subcommand: list active projects with progress
- Support `--assignee NAME` to filter by assignee
- Support `--status STATUS` to filter by status (e.g., "In Progress", "Todo", "Done")
- Support `--priority NUMBER` to filter by priority (1=Urgent, 2=High, 3=Medium, 4=Low, 0=None)
- Support `--label NAME` to filter by label
- Support `--limit N` to cap results (default 25)
- Support `--json` flag for machine-readable JSON output (default is formatted text for agent consumption)
- Respect rate limits: track request count, pause if approaching 50/min
- Exit with code 0 on success, non-zero on error with descriptive message

Usage examples the script must support:
```
# List all in-progress issues
node linear-read.js issues --status "In Progress"

# List issues assigned to a person
node linear-read.js issues --assignee "Dan Caruso"

# List high-priority issues
node linear-read.js issues --priority 2

# List issues with a specific label
node linear-read.js issues --label "bug"

# Get full details for a specific issue (by ID or key like ENG-123)
node linear-read.js issue ENG-123

# Show active cycle progress
node linear-read.js cycle

# List active projects
node linear-read.js projects

# Output as JSON for piping
node linear-read.js issues --status "Todo" --json
```

**Key GraphQL queries the script uses:**

Issues query:
```graphql
query($filter: IssueFilter, $first: Int) {
  issues(filter: $filter, first: $first, orderBy: updatedAt) {
    nodes {
      id identifier title description priority priorityLabel
      state { name color }
      assignee { name email }
      labels { nodes { name } }
      project { name }
      cycle { name number }
      createdAt updatedAt
      url
    }
  }
}
```

Single issue with comments:
```graphql
query($id: String!) {
  issue(id: $id) {
    id identifier title description priority priorityLabel
    state { name color }
    assignee { name email }
    labels { nodes { name } }
    project { name }
    cycle { name number }
    comments { nodes { body createdAt user { name } } }
    relations { nodes { type relatedIssue { identifier title } } }
    attachments { nodes { title url sourceType } }
    history(first: 10) { nodes { createdAt fromState { name } toState { name } actor { name } } }
    createdAt updatedAt completedAt
    url
  }
}
```

Active cycle:
```graphql
query($teamId: String!) {
  team(id: $teamId) {
    activeCycle {
      id name number startsAt endsAt
      progress
      issues {
        nodes {
          id identifier title priority priorityLabel
          state { name }
          assignee { name }
        }
      }
    }
  }
}
```

Write the script to `${WORKSPACE}/tools/linear-read.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-linear-read-js>' | base64 -d > ${WORKSPACE}/tools/linear-read.js
```

Expected: File exists at `${WORKSPACE}/tools/linear-read.js`. Test with `node ${WORKSPACE}/tools/linear-read.js cycle` -- should return the active cycle or "No active cycle".

If this fails: Check Node.js version (v18+ for native fetch). If older Node.js, the script must use the `https` module instead.

If already exists: Compare content. If unchanged, skip. If different, back up as `linear-read.js.bak` and write new version.

#### 2.3 Install linear-write.js `[GUIDED]`

Write the script that creates and updates issues, adds comments, and manages issue state. This enables the agent to capture action items, update sprint status, and maintain engineering workflow.

The script must:
- Read config from `${WORKSPACE}/config/linear.json`
- Support `create` command: create a new issue with title, description, priority, labels, assignee
- Support `update` command: update issue fields (status, priority, assignee, labels) by issue ID or key
- Support `comment` command: add a comment to an existing issue
- Support `close` command: mark an issue as done/completed
- Auto-apply `edge-created` label to all issues created by the agent (from config `defaultLabels`)
- Auto-apply `defaultTeamId` and optionally `defaultProjectId` from config
- Accept `--title`, `--description`, `--priority`, `--status`, `--assignee`, `--label`, `--project` flags
- Accept `--text` for comment content
- Validate required fields before making API calls (title is required for create)
- Respect rate limits: track request count, pause if approaching 50/min
- Output the created/updated issue identifier (e.g., ENG-123) and URL on success
- Exit with code 0 on success, non-zero on error with descriptive message

Usage examples the script must support:
```
# Create a new issue
node linear-write.js create --title "Implement auth flow" --description "Set up OAuth2 for API" --priority 2

# Create with specific assignee and label
node linear-write.js create --title "Fix login bug" --priority 1 --assignee "dan@crusoeventures.com" --label "bug"

# Update issue status
node linear-write.js update ENG-123 --status "In Progress"

# Add a comment to an issue
node linear-write.js comment ENG-123 --text "PR submitted: https://github.com/org/repo/pull/42"

# Close an issue
node linear-write.js close ENG-123

# Create with explicit project
node linear-write.js create --title "API rate limiting" --project "Backend Infra"
```

**Key GraphQL mutations the script uses:**

Create issue:
```graphql
mutation($input: IssueCreateInput!) {
  issueCreate(input: $input) {
    success
    issue {
      id identifier title url
      state { name }
    }
  }
}
```

Update issue:
```graphql
mutation($id: String!, $input: IssueUpdateInput!) {
  issueUpdate(id: $id, input: $input) {
    success
    issue {
      id identifier title url
      state { name }
    }
  }
}
```

Create comment:
```graphql
mutation($input: CommentCreateInput!) {
  commentCreate(input: $input) {
    success
    comment {
      id body
    }
  }
}
```

**Assignee resolution:** When `--assignee` is provided as a name or email, the script must resolve it to a Linear user ID first:
```graphql
query {
  users {
    nodes { id name email }
  }
}
```

**Status resolution:** When `--status` is provided as a name (e.g., "In Progress"), the script must resolve it to a workflow state ID:
```graphql
query($teamId: String!) {
  team(id: $teamId) {
    states { nodes { id name type } }
  }
}
```

**Label resolution:** When `--label` is provided as a name (e.g., "bug"), the script must resolve it to a label ID:
```graphql
query($teamId: String!) {
  team(id: $teamId) {
    labels { nodes { id name } }
  }
}
```

**Project resolution:** When `--project` is provided as a name, the script must resolve it to a project ID:
```graphql
query {
  projects(filter: { name: { eq: "PROJECT_NAME" } }) {
    nodes { id name }
  }
}
```

Write the script to `${WORKSPACE}/tools/linear-write.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-linear-write-js>' | base64 -d > ${WORKSPACE}/tools/linear-write.js
```

Expected: File exists at `${WORKSPACE}/tools/linear-write.js`.

If this fails: Same as 2.2 -- check Node.js version and config file.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

#### 2.4 Install linear-sync.js `[GUIDED]`

Write the sync script that pulls active Linear state into a local SQLite database for fast querying by the daily briefing and other systems.

The sync script must:
- Read config from `${WORKSPACE}/config/linear.json`
- Initialize SQLite database at `${WORKSPACE}/data/linear.db` with `CREATE TABLE IF NOT EXISTS` for idempotency
- Create tables: `issues` (active issues with all fields), `cycles` (cycle metadata and progress), `sync_log` (audit trail of sync runs)
- On each run: pull issues updated since `lastIssueSyncAt`, pull current active cycle
- Insert/update (upsert) pulled records into SQLite using `INSERT OR REPLACE`
- Track changes: compare previous state to current for "what changed since last sync" reporting
- Log sync activity with timestamps to `${WORKSPACE}/logs/linear-sync.log`
- Update `syncState` in `linear.json` after successful sync
- Support `--status` flag: show last sync time, record counts, and recent changes
- Support `--changes` flag: show what changed since the last sync (new issues, status changes, completed issues)
- Support `--full` flag: force a full re-sync (ignore timestamps, pull all active issues)
- Exit with code 0 on success, non-zero on error

**SQLite schema:**

```sql
CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority INTEGER,
  priority_label TEXT,
  state_name TEXT,
  state_type TEXT,
  assignee_name TEXT,
  assignee_email TEXT,
  labels TEXT,          -- JSON array of label names
  project_name TEXT,
  cycle_name TEXT,
  cycle_number INTEGER,
  url TEXT,
  created_at TEXT,
  updated_at TEXT,
  completed_at TEXT,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cycles (
  id TEXT PRIMARY KEY,
  name TEXT,
  number INTEGER,
  starts_at TEXT,
  ends_at TEXT,
  progress REAL,
  total_issues INTEGER,
  completed_issues INTEGER,
  synced_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sync_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  issues_synced INTEGER DEFAULT 0,
  issues_created INTEGER DEFAULT 0,
  issues_updated INTEGER DEFAULT 0,
  issues_completed INTEGER DEFAULT 0,
  status TEXT DEFAULT 'running',
  error TEXT
);
```

**Key GraphQL query for sync (issues updated since timestamp):**

```graphql
query($filter: IssueFilter, $after: String) {
  issues(
    filter: $filter
    first: 100
    after: $after
    orderBy: updatedAt
  ) {
    nodes {
      id identifier title description priority priorityLabel
      state { name type }
      assignee { name email }
      labels { nodes { name } }
      project { name }
      cycle { name number }
      createdAt updatedAt completedAt
      url
    }
    pageInfo {
      hasNextPage endCursor
    }
  }
}
```

The `$filter` for incremental sync uses:
```json
{
  "team": { "id": { "eq": "${LINEAR_TEAM_ID}" } },
  "updatedAt": { "gte": "${lastIssueSyncAt}" }
}
```

For full sync, omit the `updatedAt` filter and add:
```json
{
  "team": { "id": { "eq": "${LINEAR_TEAM_ID}" } },
  "state": { "type": { "nin": ["canceled"] } }
}
```

**Change detection logic:**
1. Before upserting, read the existing record from SQLite
2. Compare `state_name` -- if changed, log as status change
3. If no existing record, log as new issue
4. If `completed_at` is now set and was previously null, log as completed
5. Store change summary in `sync_log` for the `--changes` flag

Write the script to `${WORKSPACE}/tools/linear-sync.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-linear-sync-js>' | base64 -d > ${WORKSPACE}/tools/linear-sync.js
```

Expected: File exists at `${WORKSPACE}/tools/linear-sync.js`.

If this fails: Check Node.js version, check that `better-sqlite3` is installed (step 2.1), check config file.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

### Phase 3: Scheduling

#### 3.1 Write Launchd Plist `[GUIDED]`

Create the launchd plist for syncing Linear every 2 hours during business hours. **Level 1 -- exact syntax required.** Launchd plists require absolute paths (`~` and `${HOME}` are NOT expanded).

**CRITICAL:** Do NOT use crontab on macOS. `crontab -` and `crontab /file` hang indefinitely on macOS 15.x (Sequoia) via remote PTY due to TCC permissions. Always use launchd.

The operator must resolve `${AGENT_USER}` to the literal macOS username (e.g., `edge`) before sending this file. All paths must be absolute.

**Remote (use base64 encoding):**
```
echo '<base64-encoded-plist>' | base64 -d > /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.linear-sync.plist
```

The plist content must be:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.linear-sync</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>/Users/${AGENT_USER}/.openclaw/workspace/tools/linear-sync.js</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Hour</key>
            <integer>7</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>9</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>11</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>13</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>15</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>17</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <dict>
            <key>Hour</key>
            <integer>19</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
    </array>
    <key>StandardOutPath</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace/logs/linear-sync.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace/logs/linear-sync-error.log</string>
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
- Replace `/usr/local/bin/node` with the actual path from `which node` on the client machine (may be `/opt/homebrew/bin/node` on Apple Silicon Macs like the M4 Pro).
- Replace `/Users/${AGENT_USER}/.openclaw/workspace/` with the actual resolved `${WORKSPACE}` path if it differs from `/Users/edge/.openclaw/workspace/`.
- The `StartCalendarInterval` array schedules at 7am, 9am, 11am, 1pm, 3pm, 5pm, 7pm local time. Adjust hours if the client works non-standard hours.
- `RunAtLoad` set to true means the sync will also run immediately when the plist is first loaded.
- `launchd StartCalendarInterval` uses local time, not UTC -- no timezone conversion needed.

Expected: Plist file exists at `/Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.linear-sync.plist` with valid XML.

If this fails: Check that `~/Library/LaunchAgents/` directory exists. Create with `mkdir -p /Users/${AGENT_USER}/Library/LaunchAgents`.

If already exists: Compare content. If unchanged, skip. If different, unload the old plist first, then write new version and reload.

#### 3.2 Load the Launchd Plist `[AUTO]`

Register the plist with launchd so the scheduled sync begins. **Level 1 -- exact syntax required.**

First, check if already loaded:

**Remote:**
```
launchctl list 2>/dev/null | grep com.openclaw.linear-sync && echo 'ALREADY_LOADED' || echo 'NOT_LOADED'
```

If `ALREADY_LOADED`, unload first:

**Remote:**
```
launchctl bootout gui/${AGENT_USER_UID}/com.openclaw.linear-sync 2>/dev/null; sleep 1
```

Then load:

**Remote:**
```
launchctl bootstrap gui/${AGENT_USER_UID} /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.linear-sync.plist
```

Expected: No error output. Verify with:

**Remote:**
```
launchctl list | grep com.openclaw.linear-sync
```

Expected: Shows the job with PID (or `-` if not currently running) and exit status 0.

If this fails:
- **"Bootstrap failed: 5: Input/output error":** Plist has syntax errors. Validate with `plutil -lint /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.linear-sync.plist`.
- **"Bootstrap failed: 37: Operation already in progress":** Already loaded. Bootout first, then bootstrap again.
- **Path errors in logs:** Check that the `node` path and script path in the plist are correct. Verify with `which node` and `ls ${WORKSPACE}/tools/linear-sync.js`.

### Phase 4: TOOLS.md Integration

#### 4.1 Write TOOLS.md Entries `[GUIDED]`

Add entries to `${WORKSPACE}/TOOLS.md` so the agent knows how to use the Linear integration. These entries define the tools the agent can invoke during conversations.

Check if TOOLS.md exists:

**Remote:**
```
test -f ${WORKSPACE}/TOOLS.md && echo 'EXISTS' || echo 'NOT_FOUND'
```

If it exists, append the Linear section. If not, create it with the Linear section.

Check if a Linear section already exists:

**Remote:**
```
grep -q "## Linear Ticket Management" ${WORKSPACE}/TOOLS.md 2>/dev/null && echo 'LINEAR_SECTION_EXISTS' || echo 'NO_LINEAR_SECTION'
```

If `LINEAR_SECTION_EXISTS`, compare and update if different. If `NO_LINEAR_SECTION`, append.

The Linear TOOLS.md content to add:

```markdown
## Linear Ticket Management

### List Issues
Query issues by status, assignee, priority, or label.
```
node /Users/edge/.openclaw/workspace/tools/linear-read.js issues --status "In Progress"
node /Users/edge/.openclaw/workspace/tools/linear-read.js issues --assignee "Dan Caruso"
node /Users/edge/.openclaw/workspace/tools/linear-read.js issues --priority 2
node /Users/edge/.openclaw/workspace/tools/linear-read.js issues --label "bug"
```
Use for: sprint standups, workload review, issue triage, daily briefing.

### Get Issue Details
Get full details for an issue including comments, history, and linked PRs.
```
node /Users/edge/.openclaw/workspace/tools/linear-read.js issue ENG-123
```
Use for: context gathering before meetings, understanding issue history, status checks.

### Check Sprint/Cycle Progress
Show the active cycle with completion progress and issue breakdown.
```
node /Users/edge/.openclaw/workspace/tools/linear-read.js cycle
```
Use for: sprint briefings, progress reports, cycle health checks.

### Create Issue
Create a new engineering ticket. Automatically tagged with "edge-created" label.
```
node /Users/edge/.openclaw/workspace/tools/linear-write.js create --title "ISSUE TITLE" --description "DESCRIPTION" --priority 2
node /Users/edge/.openclaw/workspace/tools/linear-write.js create --title "ISSUE TITLE" --assignee "email@example.com" --label "bug"
```
Use for: capturing action items from meetings, filing bugs, creating follow-up tasks.
Priority: 1=Urgent, 2=High, 3=Medium, 4=Low, 0=None.

### Update Issue Status
Move an issue to a new workflow state.
```
node /Users/edge/.openclaw/workspace/tools/linear-write.js update ENG-123 --status "In Progress"
node /Users/edge/.openclaw/workspace/tools/linear-write.js update ENG-123 --priority 1
```
Use for: updating sprint boards, triaging issues, marking progress.

### Comment on Issue
Add a comment to an existing issue (e.g., linking a PR, noting a decision).
```
node /Users/edge/.openclaw/workspace/tools/linear-write.js comment ENG-123 --text "PR submitted: https://github.com/org/repo/pull/42"
```
Use for: PR linking, meeting notes, decision documentation.

### Close Issue
Mark an issue as completed.
```
node /Users/edge/.openclaw/workspace/tools/linear-write.js close ENG-123
```
Use for: closing out completed work, sprint cleanup.

### Check What Changed
See what changed in Linear since the last sync.
```
node /Users/edge/.openclaw/workspace/tools/linear-sync.js --changes
```
Use for: daily briefing "what changed overnight" section, catching up on sprint activity.

### Sync Status
Check when the last Linear sync ran and record counts.
```
node /Users/edge/.openclaw/workspace/tools/linear-sync.js --status
```
```

Write the TOOLS.md content using base64 encoding.

**Remote (to append):**
```
echo '<base64-encoded-linear-tools-section>' | base64 -d >> ${WORKSPACE}/TOOLS.md
```

Expected: TOOLS.md contains the Linear Ticket Management section with all tool entries.

If already exists with correct content: Skip.

### Phase 5: Verification

#### 5.1 Test Read -- List Issues `[GUIDED]`

Verify the read script can query the Linear API successfully.

**Remote:**
```
cd ${WORKSPACE} && node tools/linear-read.js issues --limit 5
```

Expected: Returns up to 5 issues with identifiers, titles, status, and assignees. If the team has no issues yet, an empty result with no errors is acceptable.

**Remote:**
```
cd ${WORKSPACE} && node tools/linear-read.js cycle
```

Expected: Returns the active cycle with progress, or "No active cycle" if the team is between cycles.

If these fail:
- **Authentication error:** Re-check API key in step 1.4.
- **Empty results with errors:** Check team ID in `linear.json` matches the client's actual team.
- **Fetch not defined:** Node.js version is below 18. Upgrade Node.js or modify the script to use the `https` module.

#### 5.2 Test Write -- Create and Archive Test Issue `[GUIDED]`

Create a test issue, verify it exists, then close/archive it. This confirms write access and the traceability label.

**Remote:**
```
cd ${WORKSPACE} && node tools/linear-write.js create --title "[TEST] Edge Integration Verification" --description "Automated test issue created during Linear integration deployment. Safe to delete." --priority 4
```

Expected: Returns an issue identifier (e.g., ENG-42) and URL. Record the identifier for cleanup.

Verify the issue was created with the `edge-created` label:

**Remote:**
```
cd ${WORKSPACE} && node tools/linear-read.js issue ${TEST_ISSUE_IDENTIFIER}
```

Expected: The test issue appears with title, `edge-created` label, and priority 4 (Low).

Test adding a comment:

**Remote:**
```
cd ${WORKSPACE} && node tools/linear-write.js comment ${TEST_ISSUE_IDENTIFIER} --text "Integration test comment. This issue will be archived."
```

Expected: Comment added successfully.

Clean up by closing the test issue:

**Remote:**
```
cd ${WORKSPACE} && node tools/linear-write.js close ${TEST_ISSUE_IDENTIFIER}
```

Expected: Issue marked as done/completed.

If write fails:
- **Permission error:** The API key may lack write scope. Linear personal API keys should have full access -- check with the client.
- **Invalid team/state:** The workflow state names may differ. Query available states: `node tools/linear-read.js issues --limit 1 --json` to see what states the team uses.
- **Label not found:** The `edge-created` label may not have been created successfully in step 1.5. Re-run label creation.

#### 5.3 Test Sync `[GUIDED]`

Run the sync script and verify data lands in SQLite.

**Remote:**
```
cd ${WORKSPACE} && node tools/linear-sync.js --full 2>&1 | tail -20
```

Expected: Sync completes, shows issue count and cycle info. Creates/updates SQLite database at `${WORKSPACE}/data/linear.db`.

Verify SQLite data:

**Remote:**
```
cd ${WORKSPACE} && node -e "
const db = require('better-sqlite3')('data/linear.db');
const issueCount = db.prepare('SELECT COUNT(*) as c FROM issues').get().c;
const cycleCount = db.prepare('SELECT COUNT(*) as c FROM cycles').get().c;
const lastSync = db.prepare('SELECT completed_at FROM sync_log ORDER BY id DESC LIMIT 1').get();
console.log('Issues cached:', issueCount);
console.log('Cycles cached:', cycleCount);
console.log('Last sync:', lastSync ? lastSync.completed_at : 'never');
db.close();
"
```

Expected: Issue count > 0 (unless the team has no issues), sync timestamp is recent.

Test the `--status` flag:

**Remote:**
```
cd ${WORKSPACE} && node tools/linear-sync.js --status
```

Expected: Shows last sync time and record counts.

Test the `--changes` flag:

**Remote:**
```
cd ${WORKSPACE} && node tools/linear-sync.js --changes
```

Expected: Shows changes since last sync (may be empty if just synced).

If sync fails:
- **SQLite error:** Check that `better-sqlite3` is installed (step 2.1). Check file permissions on `${WORKSPACE}/data/`.
- **Rate limited:** The sync should handle 429 responses with exponential backoff. If it persists, increase `rateLimitPerMinute` in `linear.json`.
- **Timeout:** For large backlogs, the initial full sync may take a while. Run with `nohup` if needed: `nohup node tools/linear-sync.js --full > logs/linear-sync.log 2>&1 &`

#### 5.4 Verify Launchd Schedule `[AUTO]`

Confirm the launchd job is registered and has the correct schedule.

**Remote:**
```
launchctl list | grep com.openclaw.linear-sync
```

Expected: Job listed with exit status 0 (or `-` for PID if not currently running).

**Remote:**
```
plutil -lint /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.linear-sync.plist
```

Expected: `OK` -- valid plist syntax.

Check sync log for the initial RunAtLoad execution:

**Remote:**
```
tail -5 ${WORKSPACE}/logs/linear-sync.log 2>/dev/null || echo 'NO_LOG_YET'
```

Expected: Recent sync log entries from the RunAtLoad execution.

#### 5.5 Verify TOOLS.md `[AUTO]`

Confirm TOOLS.md has all Linear tool entries.

**Remote:**
```
grep -c "linear-read\|linear-write\|linear-sync" ${WORKSPACE}/TOOLS.md
```

Expected: Count >= 8 (multiple references across tool entries).

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| 401 on all API calls | Invalid or expired Linear API key | Regenerate at https://linear.app/settings/api. Update `${WORKSPACE}/.env` and `config/linear.json`. |
| Empty issue results | Wrong team ID in config, or team has no issues | Verify `defaultTeamId` in `linear.json` matches the client's actual team. Check with `node tools/linear-read.js issues --limit 1 --json`. |
| "Cannot find module better-sqlite3" | npm package not installed | Run `cd ${WORKSPACE} && npm install better-sqlite3 --save`. |
| GraphQL validation error | Query syntax mismatch with Linear API version | Linear's API evolves. Check https://studio.apollographql.com/public/Linear-API for current schema. Update queries in affected script. |
| Rate limited (429 Too Many Requests) | Exceeding 50 req/min limit | Scripts should handle this with exponential backoff. If persistent, increase `rateLimitPerMinute` in `linear.json` (lower number = more conservative). |
| `edge-created` label not applied | Label ID mismatch in config | Re-query labels: `node tools/linear-read.js issues --label "edge-created" --limit 1`. If label doesn't exist, re-run step 1.5. Update `edgeCreatedLabelId` in `linear.json`. |
| Sync shows 0 issues cached | Full sync never ran, or filter too restrictive | Run `node tools/linear-sync.js --full` to force complete sync. Check that the team has issues that aren't in "canceled" state. |
| launchd job not firing | Plist syntax error or wrong paths | Validate with `plutil -lint`. Check that `node` path matches `which node`. Check `${WORKSPACE}/logs/linear-sync-error.log`. |
| launchd fires but sync errors | Node.js not found at the path in plist | Update `ProgramArguments` in the plist to match `which node` output. On Apple Silicon Macs (M4 Pro), this is often `/opt/homebrew/bin/node`. Bootout and re-bootstrap. |
| Issue create returns "field required" | Linear team has required custom fields | Query the team's issue creation schema. Add required fields to the `create` command or update TOOLS.md with instructions. |
| Assignee not found | Name/email doesn't match any Linear user | Run `node tools/linear-read.js issues --limit 1 --json` to see valid assignee names. Use exact email or display name from Linear. |
| SQLite database locked | Concurrent sync runs | The launchd schedule avoids overlap (2-hour intervals). If manually running sync while launchd fires, wait for one to complete. Check with `lsof ${WORKSPACE}/data/linear.db`. |
| Status update fails | Workflow state name doesn't match team's states | Linear teams can customize workflow states. Query valid states: `curl -s https://api.linear.app/graphql -H "Authorization: ${LINEAR_API_KEY}" -H "Content-Type: application/json" -d '{"query":"{ team(id: \"${LINEAR_TEAM_ID}\") { states { nodes { name type } } } }"}'`. |

## Autonomy Mode Behavior

| Step | Auto | Guided | Manual |
|------|------|--------|--------|
| 1.1 Create directories | Execute silently | Execute silently | Confirm before creating |
| 1.2 Store Linear API key | Pause for `[HUMAN_INPUT]` | Pause for `[HUMAN_INPUT]` | Pause for `[HUMAN_INPUT]` |
| 1.3 Discover teams/projects | Execute silently | Show results, confirm defaults | Show results, confirm each |
| 1.4 Validate API connection | Execute silently | Execute silently | Show response |
| 1.5 Create traceability label | Execute silently | Confirm before creating | Review label details, confirm |
| 1.6 Write Linear config | Execute silently | Review config before writing | Review every field |
| 2.1 Install better-sqlite3 | Execute silently | Execute silently | Confirm before installing |
| 2.2 Install linear-read.js | Execute silently | Confirm before writing | Review script, confirm |
| 2.3 Install linear-write.js | Execute silently | Confirm before writing | Review script, confirm |
| 2.4 Install linear-sync.js | Execute silently | Confirm before writing | Review script, confirm |
| 3.1 Write launchd plist | Execute silently | Review plist content before writing | Review every field |
| 3.2 Load launchd plist | Execute silently | Confirm before loading | Confirm command |
| 4.1 Write TOOLS.md entries | Execute silently | Review entries before writing | Review each entry |
| 5.1 Test read | Execute, report result | Execute, review output together | Confirm each query, review |
| 5.2 Test write | Execute, report result | Execute, review output together | Confirm, review, confirm cleanup |
| 5.3 Test sync | Execute, report result | Confirm before running, monitor progress | Confirm, monitor, review results |
| 5.4 Verify launchd | Execute silently | Execute silently | Confirm command |
| 5.5 Verify TOOLS.md | Execute silently | Execute silently | Review output |

## Dependencies

- **Depends on:** `openclaw/install.md` (OpenClaw must be installed), `deploy-identity.md` (agent identity configured), Node.js v18+ with npm
- **Enhanced by:** `deploy-daily-briefing.md` (Linear cycle progress and issue changes feed into daily briefing), `deploy-fathom-pipeline.md` (action items from meetings can be created as Linear issues)
- **Required by:** None (standalone integration, but enriches many other systems)
- **Feeds into:** `deploy-daily-briefing.md` (sprint progress and active issues for briefing), any workflow that needs to create or track engineering tickets
