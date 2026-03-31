# Deploy Automated Meeting Preparation

## Compatibility
- **OpenClaw Version**: 2026.2.26
- **Status**: READY
- **Notes**: Uses platform-native scheduling (launchd on macOS), raw API calls (Google Calendar, Notion, Tavily, Claude, Telegram), and file-based configuration. No dependency on nonexistent CLI commands. All scheduling via launchd (NOT crontab, which hangs on macOS 15).

## Purpose

Install an automated meeting preparation system that scans Google Calendar daily, researches every attendee via Notion CRM and web search, and delivers a polished briefing to the client via Telegram before their day begins. Transforms "who am I meeting today?" into a comprehensive intelligence brief with relationship history, company context, and suggested talking points.

**When to use:** After the Notion People & Companies workspace is deployed and Google Calendar access is configured. This is a high-value daily automation for any executive who takes external meetings.

**What this skill does:**
1. Creates the meeting-prep workspace directory and configuration
2. Writes a standalone Node.js script that fetches calendar events, looks up attendees in Notion, researches unknowns via Tavily, and synthesizes a briefing via Claude API
3. Writes the Telegram delivery module
4. Schedules daily 6:30 AM execution via launchd
5. Provides an on-demand trigger script for "prep my next meeting" requests
6. Verifies end-to-end with a test run

## How Commands Are Sent

This skill is executed by an operator who has an active remote session.
See `_deploy-common.md` -> "Command Delivery" for the full protocol.

- **Remote:** commands sent via `POST /api/devices/${DEVICE_ID}/exec` (preferred) or `POST /api/sessions/${SESSION_ID}/commands`
- **Operator:** commands run on the operator's local terminal

## Variables

| Variable | Source | Example |
|----------|--------|---------|
| `${WORKSPACE}` | Client profile: workspace path | `/Users/edge/.openclaw/workspace/` |
| `${DEVICE_ID}` | Device enrollment or session context | `dev_abc123` |
| `${SESSION_ID}` | Session polling or creation (fallback if device not enrolled) | `sess_abc123` |
| `${BEARER}` | `POST /api/operator/login` response | `eyJhbG...` |
| `${AGENT_USER}` | `whoami` on client machine | `edge` |
| `${NOTION_API_KEY}` | Client profile: Notion integration token | `ntn_...` |
| `${NOTION_PEOPLE_DB_ID}` | Client profile: Notion People database ID | `abc123...` |
| `${NOTION_COMPANIES_DB_ID}` | Client profile: Notion Companies database ID | `def456...` |
| `${TAVILY_API_KEY}` | Client profile or `.env` on target machine | `tvly-...` |
| `${ANTHROPIC_API_KEY}` | Client profile or `auth-profiles.json` on target machine | `sk-ant-api03-...` |
| `${GOOGLE_CALENDAR_EMAIL}` | Client profile: calendar identity | `edge@crusoeventures.com` |
| `${GOOGLE_CREDENTIALS_PATH}` | Client profile: path to Google service account JSON or gog config | `${WORKSPACE}/config/google-service-account.json` |
| `${TELEGRAM_BOT_TOKEN}` | Client profile: Edge's Telegram bot token | `7123456789:AAF...` |
| `${TELEGRAM_CHAT_ID}` | Client profile: Dan's Telegram user ID | `8730867387` |
| `${TIMEZONE}` | Client profile: timezone | `America/Denver` |
| `${PREP_HOUR}` | Client preference (default: 6) | `6` |
| `${PREP_MINUTE}` | Client preference (default: 30) | `30` |

## Before You Start

Follow the **Standard Deployment Protocol** in `_deploy-common.md`.

**Pre-flight checks for this skill:**

Check if the meeting-prep directory already exists:

**Remote:**
```
ls ${WORKSPACE}/meeting-prep/ 2>/dev/null || echo 'NOT_FOUND'
```

Check if Google Calendar access is working (via gog CLI or service account):

**Remote:**
```
gog calendar events list --max-results 1 2>/dev/null || echo 'NO_GOG'
```

If `NO_GOG`, check for a service account JSON file:

**Remote:**
```
test -f ${WORKSPACE}/config/google-service-account.json && echo 'SERVICE_ACCOUNT_OK' || echo 'NO_SERVICE_ACCOUNT'
```

Expected: At least one of `gog` or the service account must work. If neither, deploy `deploy-google-workspace.md` first or provision a Google service account.

Check if Notion API key is configured:

**Remote:**
```
test -f ${WORKSPACE}/config/.env && grep -q 'NOTION_API_KEY' ${WORKSPACE}/config/.env && echo 'NOTION_KEY_OK' || echo 'NO_NOTION_KEY'
```

Expected: `NOTION_KEY_OK`. If missing, the operator must provide the Notion integration token.

Check if Node.js is available:

**Remote:**
```
node --version 2>/dev/null || echo 'NO_NODE'
```

Expected: Node.js v18+. If missing, install it.

Check if the launchd job already exists:

**Remote:**
```
launchctl list 2>/dev/null | grep 'com.edge.meeting-prep' || echo 'NO_EXISTING_JOB'
```

**Decision points from pre-flight:**
- What time should the prep run? (Default: 6:30 AM in `${TIMEZONE}`, 30 min before daily briefing)
- Is Google Calendar accessed via `gog` CLI or a service account?
- Are the Notion People & Companies databases populated?
- Does Dan want weekend meeting prep too, or weekdays only?

## Adaptation Points

| Component | Default | Customize When... |
|-----------|---------|-------------------|
| Schedule time | 6:30 AM daily in `${TIMEZONE}` | Client has different morning routine or briefing time |
| Schedule days | Every day (daily) | Client only wants weekday prep |
| Calendar source | Google Calendar via `gog` CLI | Client uses service account JSON, Outlook, or CalDAV |
| Attendee lookup | Notion People & Companies DBs | Client uses a different CRM (Airtable, HubSpot, SQLite) |
| Web research | Tavily Search API | Client prefers Perplexity, SerpAPI, or no web research |
| Synthesis model | Claude claude-sonnet-4-20250514 via Anthropic API | Client wants cheaper model or different provider |
| Delivery channel | Telegram direct message | Client prefers Slack, email, or Telegram topic |
| Lookahead window | Next 24 hours of meetings | Client wants 48-hour lookahead for travel prep |

## Meeting Classification & Ranking System

**Emily owns this configuration.** She defines who is internal vs. external, which meeting types are moveable, and how meetings rank against each other when scheduling conflicts arise. This is presented to Emily for approval via Telegram during deployment, and she can update it anytime.

### People Classification

Every person in the CRM is classified as internal or external. This determines meeting moveability and prep depth. **Deep research and dossiers are ONLY generated for external people.** Internal team members are excluded from research — Edge already knows who they are.

**Internal people** (Crusoe Ventures team — meetings with ONLY these people are potentially moveable):

These are **suggested defaults.** Emily owns the final rankings and must approve them via Telegram before the system goes live. She can change any ranking at any time.

| Person | Role | Suggested Rank | Notes |
|--------|------|---------------|-------|
| Dan Caruso | Managing Director | 10 (highest) | Dan's time is the constraint. Never auto-moved. |
| Danny Caruso | (Family) | 9 | Family — high priority |
| Cody Moore | VP | 8 | Senior leadership |
| Joe | VP (Events/Sundance) | 8 | Senior leadership |
| Sabrina Caruso | (Family/Board) | 8 | Family/board — same tier as senior leadership |
| Connor | Analyst | 5 | Standard CVT team |
| Emily | EA | 5 | Standard CVT team |
| Liam | Dev | 5 | Standard CVT team |
| Gibson | Team | 5 | Standard CVT team |

**These are SUGGESTIONS for Emily to approve.** She may adjust any ranking. The system presents these as defaults and Emily confirms or modifies.

**External** = anyone NOT on the internal list. External meetings require explicit human approval (Emily or Dan) to move. The AI system CANNOT move external meetings on its own, ever.

Emily maintains this list. New team members get added via Telegram: "Edge: New person Alex started at CVT. Classify as internal? What rank? [Add as rank 5] [Different rank] [Not internal]"

### Meeting Type Classification & Moveability

**Core rule: NO meeting — internal or external — is moved without human approval.** The AI system classifies and recommends, but Emily or Dan must explicitly approve any schedule change via Telegram.

| Meeting Type | Can AI Auto-Move? | Rank | How Detected |
|-------------|-------------------|------|-------------|
| **External — any** | NO. Only moved if Emily/Dan explicitly says so. | 100 (unmoveable by default) | Any non-internal attendee |
| **Podcast / Interview** | NO. External guests, highest priority. | 100 (same as external) | Title contains "podcast", "interview", "recording" + typically has external guest |
| **Internal — time-sensitive** | NO | 90 | Marked with "[TS]" or "time-sensitive" in title, or flagged by Emily |
| **Internal — Dan + Danny** | Recommend only, Emily approves | 85 | Family meeting |
| **Internal — Dan + Cody/Joe/Sabrina** | Recommend only, Emily approves | 70 | Senior team / family |
| **Internal — Dan + CVT team** | Recommend only, Emily approves | 40 | Standard team |
| **Internal — no Dan** | Recommend only, Emily approves | 20 | Dan not attending |
| **Block / Focus time** | Recommend only, Emily approves | 10 | Title contains "focus", "block", "hold" |

**Ranking is used for recommendations, not auto-action.** When a conflict is detected, Edge tells Emily: "These two meetings conflict. I recommend moving [lower-ranked meeting]. [Approve] [Move the other one] [Keep both — Dan will double-book]"

### Topic-Based Overrides

Some topics elevate a meeting's rank regardless of attendees:

| Topic Keyword | Rank Override | Why |
|--------------|--------------|-----|
| "podcast", "interview", "recording" | → 100 (unmoveable) | External guests, media commitments, very hard to reschedule |
| "closing", "term sheet", "signing" | → 95 (near-unmoveable) | Active deal closings cannot wait |
| "board", "quarterly" | → 90 | Board prep and quarterly reviews are time-bound |
| "dinner", "event", "reception" | → 80 | Social/networking events with fixed timing |
| "foundation", "grant" | → 70 | Caruso Foundation items — important but flexible |
| "brainstorm", "planning" | → 35 | Planning sessions can shift |
| "1:1", "sync", "check-in" | → 30 | Routine syncs are the most moveable |

### Non-Moveable Rules (Hard — AI Cannot Override)

These meetings are NEVER recommended for moving:
1. **Any meeting with external attendees** — unless Emily/Dan explicitly says "this one can move"
2. **Podcast/interview** — external guests, always rank 100
3. Any meeting flagged `[TS]` or "time-sensitive" in the title
4. Any meeting Emily explicitly marks as non-moveable
5. Any meeting in the next 2 hours (too late to reschedule gracefully)
6. Any meeting that has already been rescheduled once this week (prevent ping-pong)

**Even for "moveable" internal meetings, the AI only RECOMMENDS. Emily approves every schedule change via Telegram.**

### Configuration File (`config/scheduling-rules.json`)

```json
{
  "version": 1,
  "status": "pending_emily_approval",
  "approvedBy": null,
  "approvedAt": null,
  "note": "These are SUGGESTED defaults. Emily must review and approve via Telegram before the system uses them.",
  "internalDomains": ["crusoeventures.com"],
  "internalPeople": {
    "dan@crusoeventures.com": { "name": "Dan Caruso", "role": "Managing Director", "rank": 10 },
    "danny@crusoeventures.com": { "name": "Danny Caruso", "role": "Family", "rank": 9 },
    "cody@crusoeventures.com": { "name": "Cody Moore", "role": "VP", "rank": 8 },
    "joe@crusoeventures.com": { "name": "Joe", "role": "VP Events", "rank": 8 },
    "sabrina@crusoeventures.com": { "name": "Sabrina Caruso", "role": "Family/Board", "rank": 8 },
    "emily@crusoeventures.com": { "name": "Emily", "role": "EA", "rank": 5 },
    "connor@crusoeventures.com": { "name": "Connor", "role": "Analyst", "rank": 5 },
    "liam@crusoeventures.com": { "name": "Liam", "role": "Dev", "rank": 5 },
    "gibson@crusoeventures.com": { "name": "Gibson", "role": "Team", "rank": 5 }
  },
  "meetingTypeRanks": {
    "external": 100,
    "podcast_interview": 100,
    "internal_time_sensitive": 90,
    "internal_dan_danny": 85,
    "internal_dan_senior": 70,
    "internal_dan_team": 40,
    "internal_no_dan": 20,
    "block_focus": 10
  },
  "topicOverrides": [
    { "keywords": ["podcast", "interview", "recording"], "rank": 100 },
    { "keywords": ["closing", "term sheet", "signing"], "rank": 95 },
    { "keywords": ["board", "quarterly"], "rank": 90 },
    { "keywords": ["dinner", "event", "reception"], "rank": 80 },
    { "keywords": ["foundation", "grant"], "rank": 70 },
    { "keywords": ["brainstorm", "planning"], "rank": 35 },
    { "keywords": ["1:1", "sync", "check-in", "standup"], "rank": 30 }
  ],
  "moveabilityRules": {
    "aiCanAutoMove": false,
    "note": "AI NEVER auto-moves any meeting. It classifies and recommends. Emily or Dan approve all schedule changes.",
    "externalMoveableOnlyIf": "emily_or_dan_explicitly_says_so",
    "internalMoveableOnlyIf": "emily_approves_via_telegram"
  },
  "nonMoveableRules": [
    "external_attendees_unless_explicit_override",
    "podcast_interview",
    "time_sensitive_flag",
    "emily_explicit_lock",
    "within_2_hours",
    "already_rescheduled_this_week"
  ],
  "conflictResolution": {
    "method": "recommend_lower_rank_moves",
    "tieBreaker": "later_scheduled_moves",
    "requiresApproval": true,
    "approver": "emily"
  }
}
```

### Emily Approval Flow for Scheduling Rules

During deployment, the rules are presented to Emily via Telegram for her to own:

```
Emily, here are the SUGGESTED scheduling rules for Edge.
These are starting points — you decide the final rankings.

INTERNAL TEAM RANKINGS (higher = harder to move):
  Dan (10) > Danny (9) > Cody, Joe, Sabrina (8)
  > Connor, Emily, Liam, Gibson (5)

Is anyone missing? Should any rankings change?
[Approve Rankings] [Modify]

IMPORTANT: Edge will NEVER auto-move any meeting.
It will recommend, and you approve via Telegram.
External meetings can only be moved if you or Dan
explicitly say so.

TOPIC RANKINGS (higher = harder to move):
  Podcast/interview (100) > Closing/signing (95)
  > Board/quarterly (90) > Events (80) > Foundation (70)
  > Dan+senior (70) > Dan+team (40) > Planning (35)
  > Sync/1:1 (30) > Focus block (10)

[Approve Topics] [Modify]
```

Emily's approved version is saved with her name and timestamp. She can update rankings anytime by messaging Edge.

### How Meeting Prep Uses These Rules

The meeting prep script reads `scheduling-rules.json` to:
1. **Classify each meeting** — internal/external, rank, moveable status
2. **Research only external attendees** — internal CVT team members are excluded from dossiers and deep research. When a meeting has 3 internal + 1 external, only the external person gets a full dossier.
3. **Include scheduling context in Emily's briefing** — "This meeting is internal rank 40 (Dan + Connor sync). Could be moved if a higher-priority meeting needs this slot. [Lock this meeting] [Leave moveable]"
4. **Feed the Scheduling Intelligence skill** — the rules engine is shared between Meeting Prep and the Scheduling Intelligence skill

### Meeting Context: Why Are We Meeting?

For every external meeting, Edge traces the origin:

1. **Email thread search**: Search Himalaya for email threads between the attendees in the last 30 days. Extract the initial outreach — who reached out first? What was the ask?
2. **Calendar invite analysis**: Read the event description and any notes. Who created the invite?
3. **CRM interaction history**: Check the interactions table for how this person was introduced. Was it a warm intro from Connor? A cold inbound?
4. **Classify the meeting purpose**:
   - **Inbound pitch**: "They reached out because they want us to look at their Series A"
   - **Warm intro**: "Connor introduced them on Mar 15 — they're building AI infrastructure"
   - **Follow-up**: "Continuing conversation from Mar 20 meeting about portfolio synergies"
   - **Relationship maintenance**: "Quarterly catch-up, no specific agenda"
   - **Event-related**: "Met at Sundance, following up on conversation about X"
   - **Unknown**: "No email trail found — ask Dan/Emily for context"

This context appears in both Dan's and Emily's briefings under "Why this meeting."

### Meeting Link Validation

For every meeting, Edge checks and flags:

| Check | What | If Missing |
|-------|------|-----------|
| **Virtual meeting link** | Is there a Zoom link, Google Meet link, or Teams link in the event? | **FLAG: "⚠ MISSING MEETING LINK — this appears to be a virtual meeting with no video link. Emily: please add one."** |
| **Meeting platform** | Zoom vs. Google Meet vs. Teams | **HIGHLIGHT: "📹 Zoom meeting" or "📹 Google Meet" so Dan knows which app to open** |
| **Physical location** | Is there a street address in the location field? | If virtual: fine. If in-person with no address: **FLAG: "⚠ In-person meeting with no address specified."** |

### Physical Meeting Logistics

For every in-person meeting, Edge provides:

1. **Travel time estimate**: Google Maps Directions API with departure time set to meeting time minus buffer. Uses Dan's current location:
   - If Dan's previous meeting was at the office → estimate from office (1035 Pearl St, Boulder)
   - If Dan's previous meeting was elsewhere → estimate from that location
   - If no prior context → estimate from Dan's home address (stored in config, private)
   - **Always use the more conservative estimate** (Emily's requirement)

2. **When to leave**: "Leave by 1:25 PM to arrive by 1:50 PM (10 min buffer)"

3. **Parking recommendations**:
   - Check parking database (`config/parking-locations.json`) for known venues
   - If unknown venue: Google Maps search for nearby parking structures
   - Include: name, address, cost estimate, entrance notes
   - Format as a shareable GPS link Dan can tap to navigate

4. **Directions**: Google Maps link formatted for mobile — tap to open in navigation:
   `https://www.google.com/maps/dir/?api=1&destination={address}&travelmode=driving`

## Prerequisites

- `deploy-notion-workspace.md` completed (People & Companies databases with Notion API integration)
- Google Calendar access working (either `gog` CLI or service account -- see `deploy-google-workspace.md`)
- Tavily Search API key configured on target machine
- Telegram bot configured and operational on target machine
- Anthropic API key available on target machine
- Node.js v18+ installed on target machine
- Emily on Telegram (for scheduling rules approval)
- `config/scheduling-rules.json` approved by Emily (deployed as part of this skill)

## What Gets Installed

### Directory Structure

```
${WORKSPACE}/meeting-prep/
  config.json           # Runtime configuration (API keys, DB IDs, schedule)
  meeting-prep.js       # Main script: calendar scan -> lookup -> research -> synthesize -> deliver
  on-demand.js          # On-demand trigger: prep for next meeting only
  package.json          # npm package manifest
  lib/
    calendar.js         # Google Calendar fetch module
    notion-lookup.js    # Notion People & Companies query module
    web-research.js     # Tavily web research module
    synthesize.js       # Claude API briefing synthesis
    telegram.js         # Telegram delivery module
  data/
    last-run.json       # Timestamp and result of last scheduled run
    meeting-prep.log    # stdout from launchd runs
    meeting-prep-error.log  # stderr from launchd runs
    cache/              # Attendee research cache (24h TTL)
```

### Scripts

| Script | Purpose |
|--------|---------|
| `meeting-prep.js` | Main orchestrator: scans calendar, researches attendees, generates and delivers briefing |
| `on-demand.js` | On-demand mode: preps only the next upcoming meeting |

### Scheduled Job

| Job | Schedule | Method |
|-----|----------|--------|
| Daily Meeting Prep | `${PREP_HOUR}:${PREP_MINUTE}` daily in `${TIMEZONE}` | macOS `launchd` (LaunchAgent plist) |

### Briefing Contents (per meeting)

| Section | Content |
|---------|---------|
| Meeting overview | Title, time, location/link, duration |
| Attendee profiles | Name, role, company, email -- from Notion or web research |
| Relationship history | Last meeting date, interaction count, key notes from previous meetings |
| Company context | Company description, sector, stage, recent news -- from Notion Companies DB |
| Unknown attendees | Web research summary for anyone not in Notion |
| Suggested talking points | AI-generated based on relationship history and meeting context |

## Steps

### Phase 1: Create Workspace

#### 1.1 Create Directory Structure `[AUTO]`

Create the meeting-prep workspace with all required subdirectories.

**Remote:**
```
mkdir -p ${WORKSPACE}/meeting-prep/lib ${WORKSPACE}/meeting-prep/data/cache
```

Expected: Directories exist at `${WORKSPACE}/meeting-prep/`, `lib/`, `data/`, `data/cache/`.

If this fails: Check that `${WORKSPACE}` exists and `${AGENT_USER}` has write permissions.

If already exists: Skip. `mkdir -p` is idempotent.

#### 1.2 Write Configuration File `[GUIDED]`

Write the runtime configuration that the meeting-prep script reads. This contains API keys, database IDs, schedule, and delivery settings.

**Level 1 -- Exact syntax required.** The config schema must match what the script expects.

Construct the JSON content on the operator side with all variables substituted, then base64-encode and send:

**Operator:**
```bash
CONFIG_JSON=$(cat << HEREDOC
{
  "calendar": {
    "provider": "google",
    "email": "${GOOGLE_CALENDAR_EMAIL}",
    "credentialsPath": "${GOOGLE_CREDENTIALS_PATH}",
    "lookaheadHours": 24
  },
  "notion": {
    "apiKey": "${NOTION_API_KEY}",
    "peopleDatabaseId": "${NOTION_PEOPLE_DB_ID}",
    "companiesDatabaseId": "${NOTION_COMPANIES_DB_ID}"
  },
  "tavily": {
    "apiKey": "${TAVILY_API_KEY}"
  },
  "anthropic": {
    "apiKey": "${ANTHROPIC_API_KEY}",
    "model": "claude-sonnet-4-20250514",
    "maxTokens": 4096
  },
  "telegram": {
    "botToken": "${TELEGRAM_BOT_TOKEN}",
    "chatId": "${TELEGRAM_CHAT_ID}"
  },
  "schedule": {
    "hour": ${PREP_HOUR},
    "minute": ${PREP_MINUTE},
    "timezone": "${TIMEZONE}",
    "daysOfWeek": [0, 1, 2, 3, 4, 5, 6]
  },
  "cache": {
    "ttlHours": 24
  }
}
HEREDOC
)
B64_CONFIG=$(printf '%s' "$CONFIG_JSON" | base64)
```

**Remote:**
```
echo '<base64-encoded-config>' | base64 -d > ${WORKSPACE}/meeting-prep/config.json
```

Expected: File exists at `${WORKSPACE}/meeting-prep/config.json` with valid JSON. Verify with:

**Remote:**
```
node -e "console.log(JSON.parse(require('fs').readFileSync('${WORKSPACE}/meeting-prep/config.json','utf8')).calendar.email)"
```

Expected: Prints the calendar email address.

If this fails: Check that the base64 content decoded correctly. Verify no special characters were mangled.

If already exists: Compare content. If API keys or DB IDs have changed, back up existing as `config.json.bak` and write new version. If unchanged, skip.

### Phase 2: Install Dependencies

#### 2.1 Initialize npm Package and Install Dependencies `[AUTO]`

The meeting-prep script needs the Google APIs client, Notion SDK, and node-fetch (for Tavily and Telegram API calls).

**Remote:**
```
cd ${WORKSPACE}/meeting-prep && npm init -y 2>/dev/null
```

**Remote:**
```
cd ${WORKSPACE}/meeting-prep && npm install googleapis @notionhq/client node-fetch@2
```

Expected: `node_modules/` directory created with all three packages. `package.json` lists them as dependencies.

If this fails: Check Node.js version (`node --version`). The Notion SDK requires Node 18+. If npm is not found, check PATH includes the Node installation.

If already exists: `npm install` is idempotent -- it will skip already-installed packages and update `package-lock.json` if needed.

### Phase 3: Write Application Scripts

All scripts are written via base64-encoded file transfer. The operator constructs each script locally, base64-encodes it, and sends the encoded content to the remote machine.

**Critical:** Each script below is described by its intent and key implementation details. The operator must construct the full script content, base64-encode it, and transfer using the pattern:

```
echo '<base64-content>' | base64 -d > ${WORKSPACE}/meeting-prep/<filename>
```

For scripts larger than ~5.5KB, use chunked writes (first chunk with `>`, subsequent chunks with `>>`).

#### 3.1 Write Calendar Module `[GUIDED]`

Write `${WORKSPACE}/meeting-prep/lib/calendar.js`.

**Intent:** Export a function `getUpcomingMeetings(config, options)` that:

1. Authenticates with Google Calendar using either:
   - A service account JSON file (if `config.calendar.credentialsPath` points to a `.json` file and the file exists)
   - The `gog` CLI as a fallback (shell out to `gog calendar events list` with JSON output)
2. Fetches events from `config.calendar.email` for the next `config.calendar.lookaheadHours` hours
3. Filters out all-day events and declined events
4. For each event, extracts:
   - `id`: event ID
   - `title`: event summary
   - `start`: ISO timestamp
   - `end`: ISO timestamp
   - `location`: location string or video conference link
   - `description`: event description/notes
   - `attendees`: array of `{ email, name, responseStatus }` (excluding the calendar owner)
   - `organizer`: `{ email, name }`
5. Returns an array of meeting objects sorted by start time
6. If `options.nextOnly` is true, returns only the single next upcoming meeting

**Key implementation details:**
- Use `googleapis` npm package for service account auth: `google.auth.GoogleAuth({ keyFile, scopes: ['https://www.googleapis.com/auth/calendar.readonly'] })`
- Calendar API endpoint: `calendar.events.list({ calendarId, timeMin, timeMax, singleEvents: true, orderBy: 'startTime' })`
- For `gog` fallback: use `require('child_process').execFileSync('gog', ['calendar', 'events', 'list', '--start-date', today, '--end-date', tomorrow, '--json'], { encoding: 'utf8' })` -- use `execFileSync` (not `execSync`) to avoid shell injection
- Filter: skip events where the owner's `responseStatus` is `'declined'`
- Filter: skip events where `start.date` exists (all-day events) -- only include events with `start.dateTime`

**Remote (base64 transfer):**
```
echo '<base64-encoded-calendar-js>' | base64 -d > ${WORKSPACE}/meeting-prep/lib/calendar.js
```

Expected: File exists, `node -e "require('${WORKSPACE}/meeting-prep/lib/calendar.js')"` exits without error.

If this fails: Check that `googleapis` is installed (`ls ${WORKSPACE}/meeting-prep/node_modules/googleapis`).

#### 3.2 Write Notion Lookup Module `[GUIDED]`

Write `${WORKSPACE}/meeting-prep/lib/notion-lookup.js`.

**Intent:** Export functions for looking up people and companies in Notion:

`lookupPerson(config, email)`:
1. Query the People database (`config.notion.peopleDatabaseId`) filtering by email property
2. If found, extract: name, role/title, company name, email, phone, last interaction date, tags, notes
3. If the person has a linked Company relation, fetch that company record too
4. Return `{ found: true, person: {...}, company: {...} }` or `{ found: false }`

`lookupCompany(config, companyName)`:
1. Query the Companies database (`config.notion.companiesDatabaseId`) filtering by name
2. If found, extract: name, description, sector/industry, stage, website, location, key contacts, notes
3. Return `{ found: true, company: {...} }` or `{ found: false }`

`getRecentInteractions(config, personName)`:
1. Query the People database for the person, then check for a "Meetings" or "Interactions" relation/rollup
2. Return the last 5 interactions with dates and summaries
3. If no interaction history property exists, return an empty array

**Key implementation details:**
- Use `@notionhq/client`: `new Client({ auth: config.notion.apiKey })`
- Database query: `notion.databases.query({ database_id, filter: { property: 'Email', email: { equals: email } } })`
- Handle Notion property types: `title`, `rich_text`, `email`, `phone_number`, `date`, `relation`, `rollup`, `select`, `multi_select`
- For company lookup by name: `filter: { property: 'Name', title: { equals: companyName } }`
- Wrap all Notion API calls in try/catch -- return `{ found: false, error: message }` on failure, never throw

**Remote (base64 transfer):**
```
echo '<base64-encoded-notion-lookup-js>' | base64 -d > ${WORKSPACE}/meeting-prep/lib/notion-lookup.js
```

Expected: File exists, module loads without error.

#### 3.3 Write Web Research Module `[GUIDED]`

Write `${WORKSPACE}/meeting-prep/lib/web-research.js`.

**Intent:** Export a function `researchPerson(config, { name, email, company })` that:

1. Checks the local cache (`${WORKSPACE}/meeting-prep/data/cache/`) for a recent result (within `config.cache.ttlHours`)
2. If cached and fresh, return the cached result
3. If not cached, call the Tavily Search API to research the person:
   - Search query: `"${name}" ${company || ''} professional background`
   - Tavily endpoint: `POST https://api.tavily.com/search`
   - Body: `{ api_key, query, search_depth: 'basic', max_results: 5, include_answer: true }`
4. Extract the Tavily `answer` field (AI-generated summary) and the top result URLs
5. Cache the result to `data/cache/<email-hash>.json` with a timestamp
6. Return `{ summary, sources: [{ title, url }], cachedAt }`

Also export `researchCompany(config, companyName)` with similar logic:
- Search query: `"${companyName}" company overview recent news`
- Cache key based on company name hash

**Key implementation details:**
- Use `node-fetch` for Tavily API calls
- Cache file naming: use a simple hash of the email/company name (e.g., `Buffer.from(email).toString('hex').slice(0, 16)`)
- Check cache freshness: `Date.now() - cachedAt < config.cache.ttlHours * 3600 * 1000`
- Rate limiting: if Tavily returns 429, wait 2 seconds and retry once
- If Tavily API fails entirely, return `{ summary: 'Research unavailable', sources: [], error: message }`

**Remote (base64 transfer):**
```
echo '<base64-encoded-web-research-js>' | base64 -d > ${WORKSPACE}/meeting-prep/lib/web-research.js
```

Expected: File exists, module loads without error.

#### 3.4 Write Synthesis Module `[GUIDED]`

Write `${WORKSPACE}/meeting-prep/lib/synthesize.js`.

**Intent:** Export a function `synthesizeBriefing(config, meetings)` that takes the enriched meeting data and produces a formatted briefing string via the Claude API.

The function:
1. Constructs a system prompt that instructs Claude to act as an executive briefing writer for a VC Managing Director
2. Passes the full meeting data (attendees with Notion profiles, web research, company context, interaction history) as structured context
3. Asks Claude to generate a briefing for each meeting with:
   - Meeting overview (time, title, location)
   - Attendee profiles (who they are, what they do)
   - Relationship context (last interaction, history highlights)
   - Company intelligence (what the company does, recent developments)
   - Suggested talking points (based on relationship history and meeting context)
4. Returns the formatted text ready for Telegram delivery (HTML format)

**Key implementation details:**
- Use direct Anthropic API via `node-fetch` (NOT the SDK, to minimize dependencies):
  ```
  POST https://api.anthropic.com/v1/messages
  Headers: x-api-key, anthropic-version: 2023-06-01, content-type: application/json
  Body: { model, max_tokens, system, messages: [{ role: 'user', content }] }
  ```
- System prompt should emphasize:
  - Concise, scannable format optimized for mobile reading (Telegram on phone)
  - Use HTML tags for formatting: `<b>bold</b>` for names/companies, `<i>italic</i>` for context
  - Bullet points, not paragraphs
  - Flag first-time meetings vs. recurring contacts
  - Highlight anything that needs follow-up from previous meetings
  - Use `---` as a separator between meetings
- If there are no meetings, return a short "No meetings scheduled for the next 24 hours" message
- If Claude API fails, return the raw structured data as a fallback (still useful, just unpolished)
- Respect `config.anthropic.maxTokens` for response length

**Remote (base64 transfer):**
```
echo '<base64-encoded-synthesize-js>' | base64 -d > ${WORKSPACE}/meeting-prep/lib/synthesize.js
```

Expected: File exists, module loads without error.

#### 3.5 Write Telegram Delivery Module `[GUIDED]`

Write `${WORKSPACE}/meeting-prep/lib/telegram.js`.

**Intent:** Export a function `sendBriefing(config, text)` that delivers the meeting prep briefing to Dan via Telegram.

The function:
1. Sends the briefing text to `config.telegram.chatId` using the Telegram Bot API
2. If the message exceeds Telegram's 4096-character limit, splits it into multiple messages at logical breakpoints (between meeting sections, at `---` separators)
3. Uses `parse_mode: 'HTML'` for formatting (bold, italic, links)
4. Returns `{ success: true, messageIds: [...] }` or `{ success: false, error: message }`

Also export `sendError(config, errorMessage)` for sending error notifications when the pipeline fails.

**Key implementation details:**
- Use `node-fetch` for Telegram Bot API calls
- Telegram sendMessage endpoint: `POST https://api.telegram.org/bot<token>/sendMessage`
- Body: `{ chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true }`
- Message splitting: find the last `\n---\n` (meeting separator) before the 4096 char limit
- If no logical breakpoint exists, split at the last `\n` before the limit
- HTML entities in attendee names/companies must be escaped (`&amp;`, `&lt;`, `&gt;`)
- Retry once on transient errors (5xx status codes), with 2-second delay between attempts
- Add a small delay (500ms) between split messages to avoid rate limiting

**Remote (base64 transfer):**
```
echo '<base64-encoded-telegram-js>' | base64 -d > ${WORKSPACE}/meeting-prep/lib/telegram.js
```

Expected: File exists, module loads without error.

#### 3.6 Write Main Orchestrator Script `[GUIDED]`

Write `${WORKSPACE}/meeting-prep/meeting-prep.js`.

**Intent:** The main entry point that orchestrates the full meeting prep pipeline. This is what launchd runs daily and what the agent can invoke on-demand.

The script:
1. Loads `config.json` from the script's directory (`__dirname`)
2. Parses command-line flags: `--dry-run`, `--next-only`
3. Calls `calendar.getUpcomingMeetings(config, { nextOnly })` to get meetings
4. For each meeting, for each attendee:
   a. Calls `notionLookup.lookupPerson(config, attendee.email)` to check Notion
   b. If found in Notion, calls `notionLookup.getRecentInteractions(config, person.name)`
   c. If the person has a company, fetches company context from Notion
   d. If NOT found in Notion, calls `webResearch.researchPerson(config, attendee)` via Tavily
   e. For companies not in Notion, calls `webResearch.researchCompany(config, companyName)`
5. Calls `synthesize.synthesizeBriefing(config, enrichedMeetings)` to generate the briefing
6. If `--dry-run`: prints the briefing to stdout and exits
7. Otherwise calls `telegram.sendBriefing(config, briefingText)` to deliver
8. Writes run metadata to `data/last-run.json`: `{ timestamp, meetingCount, attendeeCount, deliveredAt, success }`
9. On any unhandled error, calls `telegram.sendError(config, errorMessage)` and exits with code 1

**Key implementation details:**
- Shebang: `#!/usr/bin/env node`
- Use `Promise.allSettled` for attendee lookups so one failed lookup does not block others
- Log to stdout with timestamps (launchd captures this via `StandardOutPath`)
- Timestamp format: ISO 8601 for logs, human-readable for the briefing
- Exit code 0 on success, 1 on failure
- Wrap the entire main function in try/catch with Telegram error notification as the last resort
- Config path: `path.join(__dirname, 'config.json')`
- Data path: `path.join(__dirname, 'data')`

**Remote (base64 transfer):**
```
echo '<base64-encoded-meeting-prep-js>' | base64 -d > ${WORKSPACE}/meeting-prep/meeting-prep.js
chmod +x ${WORKSPACE}/meeting-prep/meeting-prep.js
```

Expected: File exists, is executable. `node ${WORKSPACE}/meeting-prep/meeting-prep.js --dry-run` runs without import errors (may fail on API calls if credentials are not yet configured, but should not fail on missing modules).

If this fails: Check that all lib modules exist and load correctly. Check that `node_modules` has all dependencies.

#### 3.7 Write On-Demand Trigger Script `[AUTO]`

Write `${WORKSPACE}/meeting-prep/on-demand.js`.

**Intent:** A thin wrapper that runs the meeting-prep pipeline in `--next-only` mode. This is what the agent invokes when Dan says "prep for my next meeting."

The script:
1. Shells out to `node meeting-prep.js --next-only` using the same working directory
2. Streams stdout/stderr to the caller
3. Exits with the same exit code as the child process

**Key implementation details:**
- Use `require('child_process').execFileSync('node', [path.join(__dirname, 'meeting-prep.js'), '--next-only'], { stdio: 'inherit', cwd: __dirname })`
- Shebang: `#!/usr/bin/env node`
- Keep this script small (under 20 lines) -- it is just a convenience wrapper

**Remote (base64 transfer):**
```
echo '<base64-encoded-on-demand-js>' | base64 -d > ${WORKSPACE}/meeting-prep/on-demand.js
chmod +x ${WORKSPACE}/meeting-prep/on-demand.js
```

Expected: File exists, is executable.

### Phase 4: Schedule Daily Execution

#### 4.1 Create the launchd Plist `[GUIDED]`

**Level 1 -- Exact syntax required.** launchd plists must use absolute paths (no `~` or `$HOME`). The `StartCalendarInterval` uses local time, so no timezone conversion is needed -- schedule in the client's local time directly.

First, verify the node binary path:

**Remote:**
```
which node
```

Expected: A path like `/usr/local/bin/node` or `/opt/homebrew/bin/node`. Use this exact path in the `ProgramArguments` array below.

The operator must substitute `${AGENT_USER}`, `${PREP_HOUR}`, `${PREP_MINUTE}`, `${TIMEZONE}`, and the node path into the plist with literal values, then base64-encode and transfer. The plist MUST NOT contain any shell variables.

Plist content template (operator resolves all variables before encoding):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.edge.meeting-prep</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/node</string>
        <string>/Users/edge/.openclaw/workspace/meeting-prep/meeting-prep.js</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>6</integer>
        <key>Minute</key>
        <integer>30</integer>
    </dict>
    <key>WorkingDirectory</key>
    <string>/Users/edge/.openclaw/workspace/meeting-prep</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>HOME</key>
        <string>/Users/edge</string>
        <key>TZ</key>
        <string>America/Denver</string>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/edge/.openclaw/workspace/meeting-prep/data/meeting-prep.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/edge/.openclaw/workspace/meeting-prep/data/meeting-prep-error.log</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
```

The above shows the resolved example for the Edge/Dan deployment. For other clients, the operator substitutes the correct values for the user, paths, schedule, and timezone.

**Remote (base64 transfer):**
```
echo '<base64-encoded-plist>' | base64 -d > /Users/${AGENT_USER}/Library/LaunchAgents/com.edge.meeting-prep.plist
```

Expected: File exists at `~/Library/LaunchAgents/com.edge.meeting-prep.plist` with valid XML.

Validate the plist:

**Remote:**
```
plutil -lint ~/Library/LaunchAgents/com.edge.meeting-prep.plist
```

Expected: Output ends with `OK`.

If this fails: Check that `~/Library/LaunchAgents/` exists. Create it with `mkdir -p ~/Library/LaunchAgents/` if missing. If the XML is invalid, re-encode and transfer.

If already exists: Compare content. If the schedule or paths have changed, unload the old job first (Step 4.2), then overwrite and reload.

#### 4.2 Load the LaunchAgent `[GUIDED]`

Register the plist with launchd. **Do NOT use `crontab`** -- it hangs on macOS 15.x via remote PTY.

First, unload any existing version (safe to fail if not loaded):

**Remote:**
```
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.edge.meeting-prep.plist 2>/dev/null; echo 'bootout done'
```

Then load the new version:

**Remote:**
```
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.edge.meeting-prep.plist
```

Expected: No error output. The job is now registered and will fire at the scheduled time.

Verify the job is loaded:

**Remote:**
```
launchctl list | grep 'com.edge.meeting-prep'
```

Expected: One line showing the job label. The PID column may show `-` (not currently running) and the exit status column should be `-` (not yet run) or `0` (last run succeeded).

If this fails: Check the plist for errors with `plutil -lint`. Common issues: incorrect XML, wrong paths, missing closing tags.

### Phase 5: Register On-Demand Trigger

#### 5.1 Document the On-Demand Command `[AUTO]`

The agent (Edge) needs to know how to trigger on-demand meeting prep when Dan asks. Write this to the agent's tools/capabilities reference file.

**Remote:**
```
test -f ${WORKSPACE}/TOOLS.md && echo 'TOOLS_EXISTS' || echo 'NO_TOOLS'
```

Create or update `${WORKSPACE}/TOOLS.md` with the meeting prep section. Check if a meeting prep section already exists:

**Remote:**
```
grep -q 'Meeting Prep' ${WORKSPACE}/TOOLS.md 2>/dev/null && echo 'SECTION_EXISTS' || echo 'NO_SECTION'
```

If `NO_SECTION` or `NO_TOOLS`, append the following via base64 transfer:

Content to append:

```markdown

## Meeting Prep

When Dan asks to prep for his meetings or says "prep for my next meeting":

```bash
node /Users/edge/.openclaw/workspace/meeting-prep/meeting-prep.js --next-only
```

For full daily prep (all meetings in next 24h):

```bash
node /Users/edge/.openclaw/workspace/meeting-prep/meeting-prep.js
```

For dry-run (preview without sending to Telegram):

```bash
node /Users/edge/.openclaw/workspace/meeting-prep/meeting-prep.js --dry-run
```
```

**Remote (base64 transfer):**
```
echo '<base64-encoded-tools-section>' | base64 -d >> ${WORKSPACE}/TOOLS.md
```

Expected: `${WORKSPACE}/TOOLS.md` contains the meeting prep trigger commands.

If already exists with meeting prep section: Check if the paths are correct. If so, skip.

### Phase 6: Test and Verify

#### 6.1 Run a Dry-Run Test `[GUIDED]`

Execute the meeting-prep script in dry-run mode to verify all modules work without sending to Telegram.

**Remote:**
```
cd ${WORKSPACE}/meeting-prep && node meeting-prep.js --dry-run 2>&1
```

Expected: Script runs through the full pipeline:
1. Fetches calendar events (may be empty if no meetings in the next 24h)
2. Looks up attendees in Notion
3. Researches unknown attendees via Tavily
4. Generates briefing via Claude API
5. Prints the briefing to stdout instead of sending to Telegram
6. Exits with code 0

If this fails:
- `Error: Cannot find module`: Check that npm dependencies are installed (`ls node_modules/`)
- `config.json not found`: Check that config.json exists and is valid JSON
- `Google Calendar auth error`: Check service account credentials or gog auth status
- `Notion API error 401`: Check that `${NOTION_API_KEY}` is valid and the integration has access to the databases
- `Tavily API error`: Check that `${TAVILY_API_KEY}` is valid
- `Anthropic API error 401`: Check that `${ANTHROPIC_API_KEY}` is valid and starts with `sk-ant-api03-`

#### 6.2 Run a Live Test `[GUIDED]`

If the dry run succeeds, run the script live to verify Telegram delivery.

**Remote:**
```
cd ${WORKSPACE}/meeting-prep && node meeting-prep.js 2>&1
```

Expected: Briefing message appears in Dan's Telegram chat (chat ID `${TELEGRAM_CHAT_ID}`). The script prints delivery confirmation with message IDs.

After running, check the run metadata:

**Remote:**
```
cat ${WORKSPACE}/meeting-prep/data/last-run.json
```

Expected: JSON with `success: true`, recent `timestamp`, and `deliveredAt` fields.

If no message appears in Telegram: Check the error log and stdout output. Test the bot directly:

**Operator:**
```bash
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "content-type: application/json" \
  -d "{\"chat_id\": \"${TELEGRAM_CHAT_ID}\", \"text\": \"Meeting prep test message\"}"
```

If the direct test works but the script fails, the issue is in the script's Telegram module -- not in the bot configuration.

#### 6.3 Verify launchd Job is Registered `[AUTO]`

Confirm the scheduled job exists and will fire at the configured time.

**Remote:**
```
launchctl list | grep 'com.edge.meeting-prep'
```

Expected: Job listed with no error exit code.

**Remote:**
```
plutil -convert json -o - ~/Library/LaunchAgents/com.edge.meeting-prep.plist 2>/dev/null | node -e "
  const fs = require('fs');
  const d = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
  const h = d.StartCalendarInterval.Hour;
  const m = String(d.StartCalendarInterval.Minute).padStart(2, '0');
  console.log('Scheduled at: ' + h + ':' + m);
"
```

Expected: Prints `Scheduled at: 6:30` (or whatever `${PREP_HOUR}:${PREP_MINUTE}` was set to).

#### 6.4 Test On-Demand Mode `[GUIDED]`

Verify the on-demand trigger works for "prep my next meeting" requests.

**Remote:**
```
cd ${WORKSPACE}/meeting-prep && node meeting-prep.js --next-only 2>&1
```

Expected: If there is an upcoming meeting, a single-meeting briefing is generated and delivered. If no meetings are scheduled, a "No upcoming meetings found" message is sent or printed.

## Verification

Run these checks to confirm the full system is operational:

**Remote:**
```
ls -la ${WORKSPACE}/meeting-prep/meeting-prep.js ${WORKSPACE}/meeting-prep/config.json ${WORKSPACE}/meeting-prep/lib/*.js
```

Expected: All script files exist with non-zero file sizes.

**Remote:**
```
launchctl list | grep 'com.edge.meeting-prep'
```

Expected: Job listed.

**Remote:**
```
cat ${WORKSPACE}/meeting-prep/data/last-run.json
```

Expected: Recent successful run recorded.

**Remote:**
```
cd ${WORKSPACE}/meeting-prep && node meeting-prep.js --dry-run 2>&1 | tail -5
```

Expected: Briefing output printed to stdout, exit code 0.

Full verification checklist:
- Config file has valid JSON with all required keys
- All lib modules load without error
- npm dependencies installed (googleapis, @notionhq/client, node-fetch)
- Google Calendar returns events (or empty list if no meetings)
- Notion lookup returns results for known contacts
- Tavily research returns results for unknown contacts
- Claude API synthesizes a readable briefing
- Telegram delivery succeeds (message appears in Dan's chat)
- launchd job registered and plist passes `plutil -lint`
- On-demand `--next-only` mode works
- `last-run.json` records successful execution metadata
- TOOLS.md updated with on-demand trigger commands

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Script fails to start | Missing node_modules | Run `cd ${WORKSPACE}/meeting-prep && npm install` |
| Config parse error | Malformed config.json | Validate: `node -e "JSON.parse(require('fs').readFileSync('config.json','utf8'))"` |
| No calendar events returned | Auth expired or wrong calendar ID | Check `gog calendar events list --max-results 1` or verify service account has calendar access |
| Notion lookup returns nothing | Integration not shared with database | In Notion, share the People/Companies databases with the integration |
| Notion 401 error | Invalid or expired API key | Verify key: `curl -sS https://api.notion.com/v1/users/me -H "Authorization: Bearer ${NOTION_API_KEY}" -H "Notion-Version: 2022-06-28"` |
| Tavily returns empty results | API key invalid or rate limited | Test: `curl -sS -X POST https://api.tavily.com/search -H 'content-type: application/json' -d '{"api_key":"KEY","query":"test"}'` |
| Claude API 401 | Invalid Anthropic API key | Verify key starts with `sk-ant-api03-`. Test with a minimal messages API call. |
| Telegram delivery fails | Bot token invalid or chat ID wrong | Test: `curl -sS "https://api.telegram.org/bot<TOKEN>/sendMessage" -d "chat_id=<CHAT_ID>&text=test"` |
| Telegram message too long | Briefing exceeds 4096 chars | The script auto-splits messages. If splitting fails, check for unclosed HTML tags in the briefing. |
| launchd job not firing | Plist not loaded or invalid XML | Run `plutil -lint` on the plist. Re-bootstrap with `launchctl bootout` then `bootstrap`. Check log files for errors. |
| launchd fires but script fails | Wrong node path or missing PATH | Check `StandardErrorPath` log file at `${WORKSPACE}/meeting-prep/data/meeting-prep-error.log`. Verify the node path in the plist matches `which node`. |
| Cache not clearing | Stale research results | Delete cache: `rm -f ${WORKSPACE}/meeting-prep/data/cache/*.json` |
| Script runs but no Telegram message | Dry-run mode accidentally enabled | Check the plist ProgramArguments array does NOT include `--dry-run`. |
| On-demand trigger unknown to agent | TOOLS.md not updated | Re-run Step 5.1 to add the trigger documentation. |
| `crontab` hangs on macOS 15 | TCC permissions issue | **Never use crontab on macOS 15.x via remote PTY.** This skill uses launchd exclusively. |
| Log files growing unbounded | No log rotation | Add periodic cleanup: `truncate -s 0 ${WORKSPACE}/meeting-prep/data/meeting-prep.log` weekly, or configure newsyslog. |

## Autonomy Mode Behavior

| Step | Auto | Guided | Manual |
|------|------|--------|--------|
| 1.1 Create directories | Execute silently | Execute silently | Show command, confirm |
| 1.2 Write config | Execute silently | Confirm API keys and DB IDs before writing | Confirm full config content |
| 2.1 Install npm deps | Execute silently | Execute silently | Show package list, confirm |
| 3.1-3.5 Write lib modules | Execute silently | Confirm each module's intent before writing | Review script content, confirm each |
| 3.6 Write main script | Execute silently | Confirm orchestration logic | Review script content |
| 3.7 Write on-demand script | Execute silently | Execute silently | Confirm script content |
| 4.1 Create plist | Execute silently | Confirm schedule time and node path | Review full plist XML |
| 4.2 Load LaunchAgent | Execute silently | Confirm before loading | Confirm command |
| 5.1 Register on-demand | Execute silently | Execute silently | Confirm TOOLS.md changes |
| 6.1 Dry-run test | Execute, report result | Execute, review output together | Walk through output together |
| 6.2 Live test | Execute, report result | Execute, verify Telegram delivery together | Confirm before sending, review together |
| 6.3 Verify launchd | Execute silently | Execute, show schedule | Show output, confirm |
| 6.4 Test on-demand | Execute, report result | Execute, review output together | Confirm, review together |

## Dependencies

- **Depends on:** `deploy-notion-workspace.md` (People & Companies databases), `deploy-google-workspace.md` (Google Calendar access)
- **Enhanced by:** Richer Notion data (more contacts, more interaction history) produces better briefings over time
- **Required by:** None (standalone automation). Complements `deploy-daily-briefing.md` -- the daily briefing is a broader operational overview, while meeting prep is deep per-meeting intelligence delivered 30 minutes earlier.
- **Runtime API dependencies:** Google Calendar API, Notion API, Tavily Search API, Anthropic Messages API, Telegram Bot API
