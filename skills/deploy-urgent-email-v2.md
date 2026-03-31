# Deploy Contextual Email Intelligence v3

## Compatibility
- **OpenClaw Version**: 2026.3.27
- **Status**: READY (requires Knowledge Graph for full capability — degrades gracefully without it)
- **Blocked Commands**: None
- **Notes**: Complete rewrite. Uses Claude Opus for dual-classification (not Haiku — integrity over cost). Thread reconstruction via Himalaya. Knowledge Graph integration for temporal relationship context. Ask extraction identifies what's being requested, not just urgency. Relationship state machine detects dormant contacts reactivating. Multi-level feedback loop learns per-sender, per-thread, per-topic, per-relationship-state, and temporal patterns.
- **Updated**: 2026-03-30 based on Emily meeting requirements, Anthropic harness design analysis, and KG dependency review.

> **Replaces:** `deploy-urgent-email.md` (BLOCKED) and the previous v2 draft (used Haiku, no thread context, no KG).

## Purpose

Deploy a contextual email intelligence engine that understands the full story behind every email — not just keywords and sender names, but the thread history, relationship context, deal state, commitments made, and what's actually being asked. Uses Claude Opus for dual-classification with disagreement escalation, the Knowledge Graph for temporal relationship data, and a multi-level feedback loop that learns from Dan's responses over time.

This is NOT a spam filter with better grammar. It's a system that knows:
- This is message #7 in a 3-week Series B thread
- Dan promised metrics by Friday and hasn't delivered
- Sequoia's committee meets Tuesday — making this time-critical
- John and Dan have met 12 times over 2 years — this is a deep relationship
- The actual ASK is "send the remaining metrics" — not just "urgent email from Sequoia"

**When to use:** After Himalaya email, CRM, and Knowledge Graph are deployed. The KG provides the deep contextual layer that makes this skill intelligent.

**What this skill does:**
1. Reconstructs full email threads (not just individual messages) via Himalaya
2. Enriches each email with KG context: relationship timeline, deal state, commitments, dormancy status
3. Dual-classifies urgency with two independent Opus classifiers (disagreement → escalate higher score)
4. Extracts the actual ASK: what's being requested, what commitments exist, what's the deadline
5. Detects relationship state changes: dormant contacts reactivating, new contacts from warm intros
6. Alerts via Telegram with full context (not just "urgent email from X" but the full story)
7. Multi-level feedback loop: per-sender, per-thread, per-ask-type, per-relationship-state, temporal patterns
8. Nightly learning: Nightman aggregates feedback and updates classification rules

## Dual-Classification Pattern (Not Harness — Better for Scoring Decisions)

Instead of Generator + Evaluator (Harness Pattern), this skill uses **Dual-Classification with Disagreement Escalation** — two independent classifiers with different perspectives:

```
Email arrives + full context assembled
         ↓
Classifier 1 (Opus):
  "Score urgency based on content, sender, relationship history,
   deal state, thread context, and commitments."
  → Score: 65 (reason: "routine update from portfolio company")

Classifier 2 (Opus, adversarial prompt):
  "Score urgency assuming you might be WRONG about importance.
   What would Dan miss if this email went unread for 24 hours?
   Look for buried deadlines, implicit asks, and time-sensitivity
   that the subject line doesn't reveal."
  → Score: 82 (reason: "buried mention of board vote deadline Friday")
         ↓
DISAGREE (spread > 15 points):
  → Use HIGHER score (82) — err on side of alerting
  → Flag: "Classifiers disagreed — alerting to be safe"

AGREE (spread ≤ 15 points):
  → Use average score — confident assessment
```

**Why dual-classification beats Harness here:**

| | Harness (Generator + Evaluator) | Dual-Classification |
|---|---|---|
| Catches | "Was the classification good?" | "Did we miss something?" |
| Failure mode | Evaluator agrees with generator (both miss same thing) | Two perspectives catch different things |
| On disagreement | Regenerate (might get same wrong answer) | Escalate higher score (err on alerting) |
| Best for | Complex artifacts (briefings, code) | Binary/scoring decisions (urgent vs. not) |

## Thread Reconstruction

Individual emails are meaningless without the thread. Before classification:

1. **Pull full thread** via Himalaya: `himalaya message read --thread <id>`
2. **Reconstruct conversation**: who said what, when, in what order
3. **Extract chain of asks**: first ask → response → follow-up → current state
4. **Identify commitments**: "Dan said he'd send X by Friday" — tracked as a promise
5. **Detect re-engagement**: "Last email in this thread was 8 months ago" — dormant reactivating

The THREAD context goes to the classifiers, not just the latest message.

## Ask Extraction

For every email scored ≥ 50, Opus extracts the actual ask:

```json
{
  "asks": [
    {
      "ask": "Send remaining PortCo X metrics",
      "askType": "fulfillment_of_commitment",
      "commitmentDate": "2026-03-28",
      "commitmentBy": "Dan",
      "deadline": "Before Tuesday committee meeting (Apr 8)",
      "context": "Dan promised in thread on Mar 28. Partial sent. Rest outstanding."
    }
  ],
  "threadSummary": "7-message thread over 3 weeks. Series B discussion.",
  "relationshipContext": "John Smith, MD at Sequoia. 12 meetings since 2024. Deep relationship."
}
```

Dan doesn't see "urgent email from Sequoia." He sees "John is waiting for the metrics you promised. Committee meets Tuesday."

## Knowledge Graph Integration

The KG provides context that transforms surface-level classification into deep understanding:

| KG Query | What It Returns | How It Changes Classification |
|----------|----------------|------------------------------|
| Relationship state | COLD/WARM/ACTIVE/DEEP/DORMANT/REACTIVATING | Dormant→Reactivating = +20 urgency boost |
| Relationship timeline | "12 meetings since 2024, last Mar 15" | Deep relationship = +10 boost |
| Deal state | "Series B in progress, committee Apr 8" | Active deal = +15 boost |
| Commitments | "Dan promised metrics by Friday" | Unfulfilled commitment = +25 boost |
| Network path | "Connor introduced them via YC" | Warm intro context |
| Company events | "Sequoia closing Fund XVIII" | External context |

**Without KG**: "Email from john@sequoia.com, score 65, routine update"
**With KG**: "Email from John Smith (deep relationship, 12 meetings). Active Series B deal. Dan has an unfulfilled commitment. Committee meets Tuesday. Score: 92."

## Relationship State Machine

Computed by the KG, consumed by this skill:

| State | Detection | Urgency Impact |
|-------|-----------|---------------|
| COLD | No prior interaction | No boost |
| WARM | 1-2 interactions, recent | +5 |
| ACTIVE | Regular meetings, open deal | +10 |
| DEEP | 10+ interactions, long history | +15 |
| DORMANT | No contact in 90+ days | Flag as "dormant — why are they emailing?" |
| REACTIVATING | Email after 90+ day gap | +20 — something prompted them to reach out |

## Multi-Level Feedback Loop

Dan's responses train the system at multiple levels:

| Level | What's Learned | Storage | How It Feeds Back |
|-------|---------------|---------|-------------------|
| **Per-sender** | "john@sequoia.com is urgent 80% of the time" | SQLite feedback DB | Boost/suppress sender score |
| **Per-thread** | "This Series B thread is high-priority until deal closes" | KG thread→deal edge | All messages in this thread get boosted |
| **Per-ask-type** | "Capital calls are ALWAYS urgent. Quarterly updates rarely are." | SQLite ask_type table | Ask-type → urgency mapping |
| **Per-relationship-state** | "Dormant contacts reactivating are always worth alerting" | Config rules | State → urgency boost rules |
| **Per-topic** | "Legal review = urgent. Event invites = not." | SQLite topic table | Topic → urgency mapping |
| **Temporal** | "Emails after 9 PM from portfolio founders are usually crises" | SQLite temporal patterns | Time × sender-type → boost |

**Nightly aggregation (Nightman):**
- Recalculate per-sender hit rates
- Promote senders with >80% confirmed → VIP list
- Demote senders with <20% confirmed → noise list
- Update ask-type mappings based on last 30 days
- Report: "Classification accuracy this week: 87%. 3 senders promoted to VIP."

## Pipeline Flow (Complete)

```
Every 30 min (5 AM - 11 PM):

1. FETCH: Himalaya gets new emails from last 30 min

2. FILTER: Skip noise senders (newsletters, noreply, marketing)

3. For each remaining email:

   a. THREAD RECONSTRUCTION
      Pull full thread via Himalaya
      Reconstruct conversation chain
      Identify commitments and asks

   b. CONTEXT ENRICHMENT
      ├── CRM: sender profile, preferred email, EA, role
      ├── Knowledge Graph: relationship state, timeline, deal state, commitments
      ├── Feedback history: per-sender, per-topic, per-ask-type patterns
      └── Thread history: what was said before, what was promised

   c. DUAL CLASSIFICATION (Opus × 2)
      Classifier 1: score with full context
      Classifier 2: adversarial — "what would you miss?"
      Disagree (spread > 15) → use higher score
      Agree → use average

   d. ASK EXTRACTION (Opus, for scores ≥ 50)
      What's being asked? Commitments? Deadlines?

   e. ALERT (scores ≥ threshold)
      Telegram with full context:
      - Thread summary
      - Relationship context
      - The actual ask
      - Commitment status
      - [Reply] [Snooze] [Not Urgent]

   f. LOG everything to SQLite + KG edges

4. FEEDBACK: process Dan's button presses → update all feedback levels
```

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
| `${ANTHROPIC_API_KEY}` | Client profile: Anthropic API key (from `auth-profiles.json` or `.env`) | `sk-ant-api03-...` |
| `${TELEGRAM_BOT_TOKEN}` | Client profile: Edge's bot token | `7123456789:AAF...` |
| `${TELEGRAM_CHAT_ID}` | Client profile: Dan's Telegram user ID | `123456789` |
| `${NOTION_PEOPLE_DB_ID}` | From `config/notion.json` (deployed by `deploy-notion-workspace.md`) | `a1b2c3d4e5f6...` |
| `${TIMEZONE}` | Client profile: timezone | `America/Denver` |
| `${AGENT_USER}` | Pre-flight check: `whoami` on client machine | `edge` |
| `${AGENT_USER_UID}` | Pre-flight check: `id -u` on client machine | `501` |

## Before You Start

Follow the **Standard Deployment Protocol** in `_deploy-common.md`: read the client profile, check what exists, identify adaptations, and present a deployment plan before executing.

**Pre-flight checks for this skill:**

Verify Node.js is available (required for all scripts):

**Remote:**
```
node --version 2>/dev/null || echo 'NO_NODE'
```

Expected: Version string (v18+ required for native fetch). If `NO_NODE`, install Node.js first.

Verify Himalaya CLI is installed and email access works:

**Remote:**
```
which himalaya 2>/dev/null && himalaya envelope list --page-size 1 2>/dev/null | head -3 || echo 'NO_HIMALAYA'
```

Expected: At least one envelope listed. If `NO_HIMALAYA`, deploy `deploy-himalaya-email.md` first.

Verify the Anthropic API key is available:

**Remote:**
```
test -f ${WORKSPACE}/.env && grep -q ANTHROPIC_API_KEY ${WORKSPACE}/.env && echo 'KEY_FOUND' || echo 'NO_KEY'
```

Expected: `KEY_FOUND`. If `NO_KEY`, the Anthropic API key must be added to `${WORKSPACE}/.env`.

Check if Notion People DB is configured (optional but enhances sender importance):

**Remote:**
```
test -f ${WORKSPACE}/config/notion.json && python3 -c "import json; c=json.load(open('${WORKSPACE}/config/notion.json')); print('NOTION_OK:', c['databases']['people']['id'])" 2>/dev/null || echo 'NO_NOTION'
```

Expected: `NOTION_OK:` with a database ID. If `NO_NOTION`, urgency detection still works but without sender importance from CRM. The Notion integration is recommended but not required.

Check if urgency detection is already deployed:

**Remote:**
```
test -f ${WORKSPACE}/config/urgency.json && echo 'ALREADY_CONFIGURED' || echo 'NOT_CONFIGURED'
ls ${WORKSPACE}/scripts/urgency-check.js ${WORKSPACE}/scripts/urgency-notify.js ${WORKSPACE}/scripts/urgency-feedback.js 2>/dev/null || echo 'NO_SCRIPTS'
launchctl list 2>/dev/null | grep com.openclaw.urgency-check || echo 'NO_LAUNCHD'
```

Expected: `NOT_CONFIGURED`, `NO_SCRIPTS`, and `NO_LAUNCHD` for a fresh install.

Resolve the macOS username and UID (needed for launchd absolute paths):

**Remote:**
```
whoami && id -u
```

Expected: Username and numeric UID. Record both -- launchd plists require absolute paths (`/Users/${AGENT_USER}/...`) and `launchctl bootstrap` requires `gui/${AGENT_USER_UID}`.

**Decision points from pre-flight:**
- What are Dan's waking hours? Default: 6am-9pm Mountain time. Alerts are suppressed outside this window.
- Should urgency checks run as a separate launchd job (every 30 min) or hook into the existing email-check launchd job (every 15 min)?
- Is the Notion People DB available for sender importance scoring?

## Adaptation Points

| Component | Default | Customize When... |
|-----------|---------|-------------------|
| Email source | Himalaya CLI (IMAP) with thread reconstruction | Client uses a different email CLI or API |
| Classification model | Claude Opus (dual-classification) | Downgrade to Sonnet after feedback loop proves accuracy. Never Haiku for initial deployment — integrity over cost. |
| Alert time window | 5am-11pm in `${TIMEZONE}` every day | Dan has different waking hours or wants weekday-only alerts |
| Urgency threshold | Score >= 70 out of 100 triggers alert | Dan wants more/fewer alerts (lower = more alerts) |
| Scan frequency | Every 30 min via launchd | More frequent (15 min) or less frequent (1 hour) |
| Alert channel | Telegram via bot API with inline buttons | Client uses a different messaging platform |
| Feedback storage | SQLite at `${WORKSPACE}/data/urgency-feedback.db` | Client prefers a different DB location |
| Notion integration | Enabled (sender lookup from People DB) | Disabled if Notion is not deployed |
| Lookback window | 30 minutes (match scan interval) | Adjust to match actual scan frequency |

## Prerequisites

- `deploy-himalaya-email.md` completed (Himalaya CLI with thread reading capability)
- `deploy-messaging-setup.md` completed (Telegram bot token and chat ID available)
- `deploy-identity.md` completed (agent identity configured)
- Anthropic API key available in `${WORKSPACE}/.env` (must support Opus)
- Node.js v18+ available on the client machine
- `deploy-personal-crm-v2.md` completed (sender lookups, preferred email, EA info)
- **Required for full capability:** `deploy-knowledge-graph.md` completed (temporal relationship context, deal state, commitments, dormancy detection). Skill degrades gracefully without KG — classification works but loses deep context.
- **Recommended:** `deploy-notion-workspace.md` completed (sender importance from People DB)

## What Gets Installed

### Configuration (`config/urgency.json`)

| Field | Description |
|-------|-------------|
| `anthropicModel` | Claude model for classification (default: `claude-haiku-4-20250514`) |
| `urgencyThreshold` | Minimum score (0-100) to trigger alert (default: 70) |
| `lookbackMinutes` | How far back to scan for new emails (default: 30) |
| `alertWindow.start` | Earliest hour to send alerts (default: 6) |
| `alertWindow.end` | Latest hour to send alerts (default: 21) |
| `telegram.botToken` | Bot token for sending alerts |
| `telegram.chatId` | Dan's Telegram user ID |
| `notion.enabled` | Whether to use Notion People DB for sender importance |
| `notion.configPath` | Path to Notion config file |
| `noiseSenders` | Array of email patterns to always skip (newsletters, marketing) |
| `vipSenders` | Array of email patterns to always flag as urgent |
| `feedbackDbPath` | Path to SQLite feedback database |

### Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `email-intel-check.js` | `${WORKSPACE}/scripts/email-intel-check.js` | Main orchestrator: fetch emails → reconstruct threads → enrich with KG/CRM context → dual-classify (Opus) → extract asks → alert |
| `email-intel-thread.js` | `${WORKSPACE}/scripts/email-intel-thread.js` | Thread reconstruction module: pulls full thread via Himalaya, reconstructs conversation chain, identifies commitments and asks |
| `email-intel-context.js` | `${WORKSPACE}/scripts/email-intel-context.js` | Context enrichment module: queries KG for relationship state/timeline/deal state, CRM for sender profile, feedback DB for history |
| `email-intel-classify.js` | `${WORKSPACE}/scripts/email-intel-classify.js` | Dual-classification module: two Opus classifiers with disagreement escalation |
| `email-intel-ask.js` | `${WORKSPACE}/scripts/email-intel-ask.js` | Ask extraction module: identifies what's being requested, commitments, deadlines |
| `email-intel-notify.js` | `${WORKSPACE}/scripts/email-intel-notify.js` | Telegram alert with full context, inline buttons (Reply / Snooze / Not Urgent) |
| `email-intel-feedback.js` | `${WORKSPACE}/scripts/email-intel-feedback.js` | Multi-level feedback processor: per-sender, per-thread, per-ask-type, per-relationship-state, temporal |
| `email-intel-run.sh` | `${WORKSPACE}/scripts/email-intel-run.sh` | Wrapper invoked by launchd: runs check → feedback aggregation |

### Database (`data/urgency-feedback.db`)

**`notifications` table:**

| Column | Type | Purpose |
|--------|------|---------|
| `id` | INTEGER PRIMARY KEY | Auto-increment row ID |
| `email_id` | TEXT UNIQUE | Himalaya envelope ID (dedup key) |
| `message_id` | TEXT | Email Message-ID header |
| `subject` | TEXT | Email subject line |
| `sender` | TEXT | Sender email address |
| `sender_name` | TEXT | Sender display name |
| `received_at` | TEXT | Email received timestamp (ISO 8601) |
| `urgency_score` | INTEGER | AI-assigned urgency score (0-100) |
| `urgency_reason` | TEXT | AI reasoning for the score |
| `sender_importance` | TEXT | Notion-derived importance (vip/known/unknown) |
| `notified_at` | TEXT | When the Telegram alert was sent (ISO 8601) |
| `telegram_message_id` | INTEGER | Telegram message ID for callback tracking |
| `feedback` | TEXT | User feedback: `was_urgent` or `was_not_urgent` or NULL |
| `feedback_at` | TEXT | When feedback was given (ISO 8601) |
| `created_at` | TEXT | Row creation timestamp (ISO 8601) |

**`feedback_summary` table:**

| Column | Type | Purpose |
|--------|------|---------|
| `id` | INTEGER PRIMARY KEY | Auto-increment row ID |
| `sender_pattern` | TEXT UNIQUE | Email address or domain pattern |
| `total_notifications` | INTEGER | Total times this sender triggered an alert |
| `confirmed_urgent` | INTEGER | Times Dan confirmed as urgent |
| `confirmed_not_urgent` | INTEGER | Times Dan dismissed as not urgent |
| `last_updated` | TEXT | Last summary recalculation (ISO 8601) |

### Launchd Plist

| Detail | Value |
|--------|-------|
| Label | `com.openclaw.urgency-check` |
| Schedule | Every 30 minutes (StartInterval: 1800 seconds) |
| Location | `~/Library/LaunchAgents/com.openclaw.urgency-check.plist` |
| Log output | `${WORKSPACE}/logs/urgency-check.log` |
| Error output | `${WORKSPACE}/logs/urgency-check-error.log` |

### TOOLS.md Entries

Adds entries to `${WORKSPACE}/TOOLS.md` so the agent knows how to:
- Trigger a manual urgency scan
- Review recent urgent notifications
- Review feedback history and classification accuracy
- Adjust urgency threshold
- Manage VIP and noise sender lists

## Steps

### Phase 1: Configuration

#### 1.1 Create Directory Structure `[AUTO]`

Create all directories needed for urgency detection files.

**Remote:**
```
mkdir -p ${WORKSPACE}/config ${WORKSPACE}/scripts ${WORKSPACE}/logs ${WORKSPACE}/data
```

Expected: All directories exist. `mkdir -p` is idempotent.

#### 1.2 Write Urgency Config `[GUIDED]`

Write the urgency detection configuration file. The operator must substitute actual values for the Telegram bot token, chat ID, and Notion database ID before sending.

**Remote (use base64 encoding per `_deploy-common.md` File Transfer Standard):**
```
echo '<base64-encoded-urgency-config-json>' | base64 -d > ${WORKSPACE}/config/urgency.json
```

The JSON structure must follow this template:

```json
{
  "anthropicModel": "claude-haiku-4-20250514",
  "urgencyThreshold": 70,
  "lookbackMinutes": 30,
  "alertWindow": {
    "start": 6,
    "end": 21,
    "timezone": "${TIMEZONE}"
  },
  "telegram": {
    "botToken": "${TELEGRAM_BOT_TOKEN}",
    "chatId": "${TELEGRAM_CHAT_ID}"
  },
  "notion": {
    "enabled": true,
    "configPath": "${WORKSPACE}/config/notion.json"
  },
  "noiseSenders": [
    "*@notifications.google.com",
    "*@marketing.*",
    "*@newsletter.*",
    "noreply@*",
    "no-reply@*",
    "*@accounts.google.com"
  ],
  "vipSenders": [],
  "feedbackDbPath": "${WORKSPACE}/data/urgency-feedback.db",
  "maxEmailsPerScan": 50,
  "himalayaAccountName": "default"
}
```

**Adaptation notes:**
- Set `notion.enabled` to `false` if `deploy-notion-workspace.md` has not been run.
- Populate `vipSenders` with any email addresses or domain patterns Dan always wants flagged (e.g., `*@crusoeventures.com`, specific partner emails). These bypass AI classification and always alert.
- `noiseSenders` patterns use glob-style matching: `*` matches any characters.
- `alertWindow.start` and `alertWindow.end` are hours in 24h format in the client's timezone.
- `himalayaAccountName` must match the account name in Himalaya's config (usually `default`).

Expected: File exists at `${WORKSPACE}/config/urgency.json` with valid JSON.

If this fails: Check that `${WORKSPACE}/config/` exists.

If already exists: Compare content. If unchanged, skip. If different, back up as `urgency.json.bak` and write new version.

#### 1.3 Verify Anthropic API Key `[AUTO]`

Test that the Anthropic API key can reach Claude Haiku with a minimal request.

**Remote:**
```
node -e "
const fs = require('fs');
const key = fs.readFileSync('${WORKSPACE}/.env', 'utf8').match(/ANTHROPIC_API_KEY=(.+)/)?.[1]?.trim();
if (!key) { console.error('NO_KEY'); process.exit(1); }
if (!key.startsWith('sk-ant-api03-')) { console.error('INVALID_PREFIX:', key.substring(0, 12)); process.exit(1); }
fetch('https://api.anthropic.com/v1/messages', {
  method: 'POST',
  headers: {
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  },
  body: JSON.stringify({
    model: 'claude-haiku-4-20250514',
    max_tokens: 10,
    messages: [{ role: 'user', content: 'Reply with OK' }]
  })
}).then(r => r.json()).then(d => {
  if (d.content) console.log('HAIKU_OK');
  else console.error('HAIKU_FAIL:', JSON.stringify(d));
}).catch(e => console.error('NETWORK_ERROR:', e.message));
"
```

Expected: `HAIKU_OK`. This confirms Claude Haiku is accessible with the stored API key.

If this fails:
- **NO_KEY:** Add `ANTHROPIC_API_KEY=sk-ant-api03-...` to `${WORKSPACE}/.env`.
- **INVALID_PREFIX:** The key does not start with `sk-ant-api03-`. Get the correct key from auth-profiles.json or ask the client.
- **HAIKU_FAIL with 401:** API key is invalid or expired. Replace it.
- **NETWORK_ERROR:** Check internet connectivity on the client machine.

### Phase 2: Database Setup

#### 2.1 Create the Feedback Database `[AUTO]`

Create the SQLite database with tables for notification tracking and feedback aggregation.

**Remote:**
```
sqlite3 ${WORKSPACE}/data/urgency-feedback.db << 'DBEOF'
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_id TEXT UNIQUE,
  message_id TEXT,
  subject TEXT,
  sender TEXT,
  sender_name TEXT,
  received_at TEXT,
  urgency_score INTEGER,
  urgency_reason TEXT,
  sender_importance TEXT DEFAULT 'unknown',
  notified_at TEXT,
  telegram_message_id INTEGER,
  feedback TEXT,
  feedback_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback_summary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_pattern TEXT UNIQUE,
  total_notifications INTEGER DEFAULT 0,
  confirmed_urgent INTEGER DEFAULT 0,
  confirmed_not_urgent INTEGER DEFAULT 0,
  last_updated TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_email_id ON notifications(email_id);
CREATE INDEX IF NOT EXISTS idx_notifications_sender ON notifications(sender);
CREATE INDEX IF NOT EXISTS idx_notifications_feedback ON notifications(feedback);
CREATE INDEX IF NOT EXISTS idx_feedback_summary_pattern ON feedback_summary(sender_pattern);
DBEOF
```

Verify the tables were created:

**Remote:**
```
sqlite3 ${WORKSPACE}/data/urgency-feedback.db ".tables"
```

Expected: `feedback_summary  notifications`.

If this fails: Check that `sqlite3` is available on the machine (`which sqlite3`). On macOS it is pre-installed. Ensure `${WORKSPACE}/data/` exists.

If already exists: The `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS` statements are idempotent. Safe to re-run.

### Phase 3: Install Scripts

#### 3.1 Install urgency-check.js `[GUIDED]`

Write the main urgency check script. This is the core of the system -- it reads new emails, classifies urgency, and hands off urgent items to the notification script.

The script must:
- Load config from `${WORKSPACE}/config/urgency.json`
- Load the Anthropic API key from `${WORKSPACE}/.env`
- Use Himalaya CLI to list envelopes received in the last `lookbackMinutes`
- Filter out noise senders using glob pattern matching against `noiseSenders`
- Auto-flag VIP senders using `vipSenders` patterns (bypass AI, score = 100)
- For remaining emails, read the email body via `himalaya message read <id>`
- If Notion is enabled, look up the sender in the People database to determine importance
- Build a classification prompt that includes:
  - The email subject, sender, and body (truncated to 2000 chars)
  - Sender importance from Notion (vip / known contact / unknown)
  - Recent feedback examples from SQLite (last 20 was_urgent and was_not_urgent entries) as few-shot context
  - Classification criteria: time-sensitivity, sender importance, actionability, financial/legal impact
- Call Claude Haiku via raw `fetch()` to `https://api.anthropic.com/v1/messages`
- Parse the response to extract urgency score (0-100) and reasoning
- Check for duplicates in SQLite (skip if `email_id` already exists)
- Insert classified emails into the `notifications` table
- For emails scoring >= `urgencyThreshold`, call `urgency-notify.js` as a child process
- Respect the alert time window: if outside window, still classify and store but do not notify
- Support `--force` flag to bypass alert time window (for testing)
- Support `--dry-run` flag to classify without storing or notifying
- Log all activity to stdout (captured by launchd to `${WORKSPACE}/logs/urgency-check.log`)
- Exit 0 on success, non-zero on error

**Remote (use base64 encoding per `_deploy-common.md` File Transfer Standard):**
```
echo '<base64-encoded-urgency-check-js>' | base64 -d > ${WORKSPACE}/scripts/urgency-check.js
```

Expected: File exists at `${WORKSPACE}/scripts/urgency-check.js`. The operator constructs the full script implementing the requirements above, base64-encodes it, and sends via the file transfer standard.

If this fails: Check Node.js version (v18+ for native fetch). Verify `${WORKSPACE}/scripts/` exists.

If already exists: Compare content. If unchanged, skip. If different, back up as `urgency-check.js.bak` and write new version.

**Implementation guidance for the operator building this script:**

The classification prompt should follow this structure:

```
You are an email urgency classifier for Dan Caruso, Managing Director of Crusoe Ventures.

Rate this email's urgency from 0-100 and explain why.

SCORING GUIDE:
- 90-100: Immediate action required. Legal deadlines, closing deals, investor emergencies, board matters.
- 70-89: Important and time-sensitive. Key relationship follow-ups, deal flow requiring response today, portfolio company issues.
- 40-69: Moderately important. Can wait hours. Meeting requests, general business inquiries, non-urgent updates.
- 0-39: Low priority. Newsletters, marketing, automated notifications, CC'd threads, FYI-only.

SENDER CONTEXT:
- Sender: {sender_name} <{sender_email}>
- CRM Status: {notion_importance} (vip = portfolio founder/co-investor/board, known = in CRM, unknown = not in CRM)
- Sender history: {feedback_stats} (e.g., "3 of 4 past alerts from this sender confirmed urgent")

RECENT FEEDBACK EXAMPLES (learn from these):
{recent_feedback_examples}

EMAIL:
Subject: {subject}
Body: {body_truncated}

Respond in JSON: {"score": <0-100>, "reason": "<one sentence>"}
```

The few-shot feedback examples section pulls the most recent 10 `was_urgent` and 10 `was_not_urgent` entries from SQLite, formatted as:
```
- Subject: "Re: Series A Term Sheet" from john@acme.com -> URGENT (score: 92, Dan confirmed: was_urgent)
- Subject: "Your weekly digest" from digest@substack.com -> NOT URGENT (score: 15, Dan confirmed: was_not_urgent)
```

This is how the system learns over time -- the feedback examples shape the model's calibration.

**Himalaya CLI usage within the script:**

The script should spawn Himalaya as a child process to list envelopes and read message bodies. Use `spawnSync` from `child_process` with an array of arguments (avoiding shell injection):

```javascript
const { spawnSync } = require('child_process');

// List recent envelopes
const envResult = spawnSync('himalaya', ['envelope', 'list', '--page-size', '50', '--output', 'json'], {
  encoding: 'utf8',
  timeout: 30000
});

// Read a specific email body
const msgResult = spawnSync('himalaya', ['message', 'read', emailId], {
  encoding: 'utf8',
  timeout: 30000
});
```

**Notion People DB lookup (when enabled):**

```javascript
// Look up sender in Notion People DB
const notionConfig = JSON.parse(fs.readFileSync(config.notion.configPath, 'utf8'));
const response = await fetch(
  'https://api.notion.com/v1/databases/' + notionConfig.databases.people.id + '/query',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + notionConfig.apiKey,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      filter: {
        property: notionConfig.databases.people.fields.email,
        email: { equals: senderEmail }
      },
      page_size: 1
    })
  }
);
```

#### 3.2 Install urgency-notify.js `[GUIDED]`

Write the notification script that sends Telegram alerts for urgent emails with inline action buttons.

The script must:
- Accept arguments: `--email-id <id>` `--subject <subject>` `--sender <sender>` `--score <score>` `--reason <reason>`
- Alternatively accept `--json <path>` pointing to a JSON file with all fields
- Load config from `${WORKSPACE}/config/urgency.json`
- Send a Telegram message via raw Bot API call to `https://api.telegram.org/bot${TOKEN}/sendMessage`
- Format the message with urgency score, sender, subject, and AI reasoning
- Include inline keyboard buttons using Telegram's `reply_markup`:
  - "Was Urgent" (callback_data: `urgent_yes_${email_id}`)
  - "Not Urgent" (callback_data: `urgent_no_${email_id}`)
  - "Snooze 1h" (callback_data: `urgent_snooze_${email_id}`)
- Record the Telegram message_id returned by the API in the SQLite `notifications` table
- Support `--dry-run` flag to format the message without sending
- Exit 0 on success, non-zero on error

**Remote (use base64 encoding):**
```
echo '<base64-encoded-urgency-notify-js>' | base64 -d > ${WORKSPACE}/scripts/urgency-notify.js
```

Expected: File exists at `${WORKSPACE}/scripts/urgency-notify.js`.

**Telegram message format:**

```
URGENT EMAIL [Score: 85/100]

From: John Smith <john@acmevc.com>
Subject: Re: Series A Term Sheet - Need Signature Today

AI Assessment: Time-sensitive legal document requiring signature. Sender is a known portfolio company founder in CRM.

[Was Urgent] [Not Urgent] [Snooze 1h]
```

**Telegram inline keyboard API pattern:**

```javascript
const payload = {
  chat_id: config.telegram.chatId,
  text: messageText,
  parse_mode: 'HTML',
  reply_markup: JSON.stringify({
    inline_keyboard: [[
      { text: 'Was Urgent', callback_data: 'urgent_yes_' + emailId },
      { text: 'Not Urgent', callback_data: 'urgent_no_' + emailId },
      { text: 'Snooze 1h', callback_data: 'urgent_snooze_' + emailId }
    ]]
  })
};

const response = await fetch(
  'https://api.telegram.org/bot' + config.telegram.botToken + '/sendMessage',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }
);
```

If this fails: Check Telegram bot token validity. Verify the bot can send messages to the chat ID.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

#### 3.3 Install urgency-feedback.js `[GUIDED]`

Write the feedback processor that handles Dan's reactions to urgency alerts. This is the learning loop that improves classification over time.

The script must support two modes:

**Mode 1: Telegram callback processor (primary)**
- Poll for Telegram callback queries via `getUpdates` with `allowed_updates: ["callback_query"]`
- Parse callback_data matching `urgent_yes_*`, `urgent_no_*`, `urgent_snooze_*`
- For `urgent_yes_{email_id}`: update the `notifications` row with `feedback = 'was_urgent'` and `feedback_at`
- For `urgent_no_{email_id}`: update the `notifications` row with `feedback = 'was_not_urgent'` and `feedback_at`
- For `urgent_snooze_{email_id}`: update the `notifications` row with `feedback = 'snoozed'` and `feedback_at`, write a snooze marker file (`${WORKSPACE}/data/snooze_{email_id}.json` with re-alert timestamp) that the next urgency-check run will read
- Answer the callback query via `answerCallbackQuery` to remove the "loading" state on the button
- Edit the original message to show the feedback received (e.g., append "Dan marked: Was Urgent")
- After processing feedback, update the `feedback_summary` table: increment counts for the sender's domain pattern
- Run as a one-shot process (not a long-lived daemon) -- process pending callbacks and exit
- Support `--stats` flag to print feedback statistics: total notifications, feedback rate, accuracy breakdown by sender domain
- Support `--export` flag to dump all feedback as JSON (for analysis)
- Exit 0 on success, non-zero on error

**Mode 2: Manual feedback (fallback)**
- Support `--manual <email_id> <was_urgent|was_not_urgent>` for CLI-based feedback
- Useful when Telegram buttons are missed or for bulk corrections

**Remote (use base64 encoding):**
```
echo '<base64-encoded-urgency-feedback-js>' | base64 -d > ${WORKSPACE}/scripts/urgency-feedback.js
```

Expected: File exists at `${WORKSPACE}/scripts/urgency-feedback.js`.

**Feedback summary update logic:**

After recording feedback on a notification, update the sender's aggregate statistics. Use an UPSERT pattern against the `feedback_summary` table:

```sql
INSERT INTO feedback_summary (sender_pattern, total_notifications, confirmed_urgent, confirmed_not_urgent, last_updated)
VALUES ('@domain.com', 1, 1, 0, datetime('now'))
ON CONFLICT(sender_pattern) DO UPDATE SET
  total_notifications = total_notifications + 1,
  confirmed_urgent = confirmed_urgent + 1,
  last_updated = datetime('now');
```

The sender_pattern is derived from the sender's email domain (e.g., `*@acmevc.com`). This allows the urgency-check script to query historical accuracy per sender domain and include it in the classification prompt.

**Important Telegram webhook consideration:**

The feedback script uses `getUpdates` polling for callback queries. If a Telegram webhook is set on this bot, `getUpdates` will not work. The script must check for an active webhook and warn:

```javascript
const whInfo = await fetch(
  'https://api.telegram.org/bot' + token + '/getWebhookInfo'
).then(r => r.json());

if (whInfo.result && whInfo.result.url) {
  console.error('WARNING: Webhook is active at', whInfo.result.url);
  console.error('getUpdates will not receive callback queries while webhook is set.');
  console.error('Options: (1) Remove webhook temporarily, (2) Add callback handler to webhook endpoint');
  process.exit(1);
}
```

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

### Phase 4: Scheduling

#### 4.1 Determine Scheduling Strategy `[GUIDED]`

Check if the Himalaya email-check launchd job already exists. If it does, the urgency check can be chained as a post-step. If not, create a standalone schedule.

**Remote:**
```
launchctl list 2>/dev/null | grep com.openclaw.email-check || echo 'NO_EMAIL_CHECK_JOB'
```

If the email-check job exists (runs every 15 min), the operator should decide:
- **Option A (recommended):** Create a separate launchd job for urgency checks at 30-min intervals. This keeps the two systems decoupled and independently debuggable.
- **Option B:** Modify the email-check wrapper script to call urgency-check.js after email ingestion. Tighter coupling but ensures urgency runs only after fresh emails are available.

Proceed with Option A (separate launchd job) by default.

#### 4.2 Write the Urgency Check Wrapper Script `[GUIDED]`

Create a shell wrapper that runs urgency-check.js followed by urgency-feedback.js (to process any pending button presses). This is the script that launchd will invoke.

**Remote (use base64 encoding):**
```
echo '<base64-encoded-wrapper-script>' | base64 -d > ${WORKSPACE}/scripts/urgency-run.sh && chmod +x ${WORKSPACE}/scripts/urgency-run.sh
```

The wrapper script content:

```bash
#!/bin/bash
# Urgency detection pipeline: check emails, process feedback
# Invoked by launchd every 30 minutes

set -euo pipefail

WORKSPACE_DIR="/Users/${AGENT_USER}/.openclaw/workspace"
NODE_BIN="/usr/local/bin/node"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

printf '%s Starting urgency check pipeline\n' "$LOG_PREFIX"

# Step 1: Check new emails for urgency
if "$NODE_BIN" "$WORKSPACE_DIR/scripts/urgency-check.js"; then
  printf '%s Urgency check completed\n' "$LOG_PREFIX"
else
  printf '%s Urgency check failed with exit code %s\n' "$LOG_PREFIX" "$?"
fi

# Step 2: Process any pending feedback from Telegram buttons
if "$NODE_BIN" "$WORKSPACE_DIR/scripts/urgency-feedback.js" 2>/dev/null; then
  printf '%s Feedback processing completed\n' "$LOG_PREFIX"
else
  printf '%s Feedback processing skipped or failed\n' "$LOG_PREFIX"
fi

printf '%s Pipeline complete\n' "$LOG_PREFIX"
```

**IMPORTANT adaptation notes:**
- Replace `/usr/local/bin/node` with the actual path from `which node` on the client machine (may be `/opt/homebrew/bin/node` on Apple Silicon).
- Replace `/Users/${AGENT_USER}/.openclaw/workspace` with the actual resolved `${WORKSPACE}` path.
- The wrapper catches errors from each step independently so a feedback processing failure does not block urgency checks.

Expected: File exists at `${WORKSPACE}/scripts/urgency-run.sh` and is executable.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

#### 4.3 Write Launchd Plist `[GUIDED]`

Create the launchd plist for 30-minute urgency checks. **Level 1 -- exact syntax required.** Launchd plists require absolute paths (`~` and `${HOME}` are NOT expanded).

**CRITICAL:** Do NOT use crontab on macOS. `crontab -` and `crontab /file` hang indefinitely on macOS 15.x (Sequoia) via remote PTY due to TCC permissions. Always use launchd.

The operator must resolve `${AGENT_USER}` to the literal macOS username (e.g., `edge`) before sending this file. All paths must be absolute.

**Remote (use base64 encoding):**
```
echo '<base64-encoded-plist>' | base64 -d > /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.urgency-check.plist
```

The plist content must be:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.urgency-check</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/${AGENT_USER}/.openclaw/workspace/scripts/urgency-run.sh</string>
    </array>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>StandardOutPath</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace/logs/urgency-check.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace/logs/urgency-check-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/${AGENT_USER}</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace</string>
    <key>RunAtLoad</key>
    <false/>
</dict>
</plist>
```

**IMPORTANT adaptation notes:**
- `StartInterval` of 1800 seconds = every 30 minutes. Change to 900 for 15-minute intervals.
- Replace `/Users/${AGENT_USER}/.openclaw/workspace/` with the actual resolved `${WORKSPACE}` path if it differs.
- `RunAtLoad` is `false` because we do not want an urgency check to fire the moment the plist loads (e.g., after reboot at 3am). The first check will happen at the next 30-minute interval.
- The `PATH` includes `/opt/homebrew/bin` for Apple Silicon Macs where `node` and `himalaya` are installed via Homebrew.
- `launchd StartInterval` fires every N seconds from when the job was loaded. If you prefer clock-aligned times (e.g., at :00 and :30), use `StartCalendarInterval` instead with two entries.

**Alternative: clock-aligned schedule using StartCalendarInterval:**

```xml
<key>StartCalendarInterval</key>
<array>
    <dict>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <dict>
        <key>Minute</key>
        <integer>30</integer>
    </dict>
</array>
```

This fires at exactly :00 and :30 of every hour in local time. Use this if alignment with the email-check schedule matters.

Expected: Plist file exists at `/Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.urgency-check.plist` with valid XML.

If this fails: Check that `~/Library/LaunchAgents/` exists. Create with `mkdir -p /Users/${AGENT_USER}/Library/LaunchAgents`.

If already exists: Compare content. If unchanged, skip. If different, unload the old plist first, then write new version and reload.

#### 4.4 Load the Launchd Plist `[AUTO]`

Register the plist with launchd so the 30-minute urgency checks begin. **Level 1 -- exact syntax required.**

First, check if already loaded:

**Remote:**
```
launchctl list 2>/dev/null | grep com.openclaw.urgency-check && echo 'ALREADY_LOADED' || echo 'NOT_LOADED'
```

If `ALREADY_LOADED`, unload first:

**Remote:**
```
launchctl bootout gui/${AGENT_USER_UID}/com.openclaw.urgency-check 2>/dev/null; sleep 1
```

Then load:

**Remote:**
```
launchctl bootstrap gui/${AGENT_USER_UID} /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.urgency-check.plist
```

Expected: No error output. Verify with:

**Remote:**
```
launchctl list | grep com.openclaw.urgency-check
```

Expected: Shows the job with PID (or `-` if not currently running) and exit status 0.

If this fails:
- **"Bootstrap failed: 5: Input/output error":** Plist has syntax errors. Validate with `plutil -lint /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.urgency-check.plist`.
- **"Bootstrap failed: 37: Operation already in progress":** Already loaded. Bootout first, then bootstrap again.
- **Path errors in logs:** Check that the bash path and script path in the plist are correct.

### Phase 5: TOOLS.md Integration

#### 5.1 Write TOOLS.md Entries `[GUIDED]`

Add entries to `${WORKSPACE}/TOOLS.md` so the agent knows how to use the urgency detection system.

Check if TOOLS.md exists and if an urgency section is already present:

**Remote:**
```
test -f ${WORKSPACE}/TOOLS.md && echo 'EXISTS' || echo 'NOT_FOUND'
grep -q "## Urgent Email Detection" ${WORKSPACE}/TOOLS.md 2>/dev/null && echo 'SECTION_EXISTS' || echo 'NO_SECTION'
```

The urgency detection TOOLS.md content to add:

```markdown
## Urgent Email Detection

### Manual Urgency Scan
Run an urgency check on recent emails immediately, bypassing the 30-minute schedule.
```
node /Users/edge/.openclaw/workspace/scripts/urgency-check.js --force
```
Use for: When Dan asks "any urgent emails?", after returning from a meeting, or after a long offline period.

### Urgency Scan (Dry Run)
Classify recent emails without storing results or sending notifications.
```
node /Users/edge/.openclaw/workspace/scripts/urgency-check.js --dry-run
```
Use for: Testing classification quality, reviewing what would be flagged.

### Review Recent Notifications
Query the urgency database for recent notifications and their feedback status.
```
sqlite3 /Users/edge/.openclaw/workspace/data/urgency-feedback.db "SELECT subject, sender, urgency_score, feedback FROM notifications ORDER BY created_at DESC LIMIT 20;"
```
Use for: Daily briefing context, reviewing alert history, checking feedback gaps.

### Feedback Statistics
View classification accuracy and feedback patterns by sender domain.
```
node /Users/edge/.openclaw/workspace/scripts/urgency-feedback.js --stats
```
Use for: Monthly review of urgency detection quality, identifying senders to add to VIP or noise lists.

### Export Feedback Data
Export all feedback as JSON for analysis.
```
node /Users/edge/.openclaw/workspace/scripts/urgency-feedback.js --export
```
Use for: Detailed analysis, reporting, prompt tuning.

### Manual Feedback
Record feedback for a specific notification when Telegram buttons were missed.
```
node /Users/edge/.openclaw/workspace/scripts/urgency-feedback.js --manual <email_id> was_urgent
node /Users/edge/.openclaw/workspace/scripts/urgency-feedback.js --manual <email_id> was_not_urgent
```
Use for: Correcting missed feedback, bulk corrections.
```

Write the TOOLS.md content using base64 encoding.

If `SECTION_EXISTS`, compare and update if different. If `NO_SECTION`, append. If `NOT_FOUND`, create the file with the urgency section.

**Remote (to append):**
```
echo '<base64-encoded-urgency-tools-section>' | base64 -d >> ${WORKSPACE}/TOOLS.md
```

Expected: TOOLS.md contains the Urgent Email Detection section with all tool entries.

If already exists with correct content: Skip.

### Phase 6: Verification

#### 6.1 Verify Config is Valid `[AUTO]`

**Remote:**
```
node -e "
const fs = require('fs');
const c = JSON.parse(fs.readFileSync('${WORKSPACE}/config/urgency.json', 'utf8'));
console.log('Model:', c.anthropicModel);
console.log('Threshold:', c.urgencyThreshold);
console.log('Alert window:', c.alertWindow.start + '-' + c.alertWindow.end, c.alertWindow.timezone);
console.log('Telegram chat:', c.telegram.chatId);
console.log('Notion enabled:', c.notion.enabled);
console.log('Noise senders:', c.noiseSenders.length);
console.log('VIP senders:', c.vipSenders.length);
console.log('CONFIG_VALID');
"
```

Expected: All fields printed with sensible values, ending with `CONFIG_VALID`.

#### 6.2 Verify Database Schema `[AUTO]`

**Remote:**
```
sqlite3 ${WORKSPACE}/data/urgency-feedback.db ".schema notifications" && sqlite3 ${WORKSPACE}/data/urgency-feedback.db ".schema feedback_summary"
```

Expected: Both table schemas printed with correct columns.

#### 6.3 Verify Scripts Exist and Are Syntactically Valid `[AUTO]`

**Remote:**
```
node -c ${WORKSPACE}/scripts/urgency-check.js && echo 'CHECK_OK'
node -c ${WORKSPACE}/scripts/urgency-notify.js && echo 'NOTIFY_OK'
node -c ${WORKSPACE}/scripts/urgency-feedback.js && echo 'FEEDBACK_OK'
test -x ${WORKSPACE}/scripts/urgency-run.sh && echo 'WRAPPER_OK'
```

Expected: All four `_OK` messages. `node -c` parses the file for syntax errors without executing.

#### 6.4 Run a Manual Urgency Scan `[GUIDED]`

Execute a full scan with the `--force` flag to bypass time window restrictions.

**Remote:**
```
cd ${WORKSPACE} && node scripts/urgency-check.js --force 2>&1 | tail -30
```

Expected: Script runs, reads recent emails via Himalaya, classifies each using Claude Haiku, and reports results. If any emails score >= threshold, a Telegram notification is sent.

Review the output:
- Are noise senders correctly filtered?
- Are VIP senders auto-flagged?
- Do the urgency scores seem reasonable?
- Did the Telegram notification arrive (if any emails were urgent)?

If this fails:
- **Himalaya errors:** Check email access with `himalaya envelope list --page-size 1`.
- **Anthropic API errors:** Check the API key and model availability.
- **Telegram errors:** Check bot token and chat ID. Verify the bot can send to the chat.
- **SQLite errors:** Check database file permissions and schema.

#### 6.5 Test the Feedback Loop `[GUIDED]`

If a notification was sent in step 6.4, test the feedback mechanism:

1. Press one of the inline buttons on the Telegram notification (Was Urgent / Not Urgent).
2. Run the feedback processor:

**Remote:**
```
cd ${WORKSPACE} && node scripts/urgency-feedback.js 2>&1
```

Expected: Processes the callback query, updates the notification row in SQLite, edits the Telegram message to show feedback received.

3. Verify the feedback was stored:

**Remote:**
```
sqlite3 ${WORKSPACE}/data/urgency-feedback.db "SELECT email_id, subject, feedback, feedback_at FROM notifications WHERE feedback IS NOT NULL ORDER BY feedback_at DESC LIMIT 5;"
```

Expected: The notification shows the feedback value and timestamp.

If no notification was sent (no urgent emails found), skip this step. The feedback loop can be tested later when real urgent emails arrive.

#### 6.6 Verify Launchd is Scheduled `[AUTO]`

**Remote:**
```
launchctl list | grep com.openclaw.urgency-check
```

Expected: Job listed with exit status 0 (or `-` for PID if not currently running).

#### 6.7 Verify TOOLS.md Has Urgency Entries `[AUTO]`

**Remote:**
```
grep -c "urgency-check\|urgency-feedback\|urgency-feedback.db" ${WORKSPACE}/TOOLS.md
```

Expected: Count >= 4 (multiple references across tool entries).

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| No alerts generated | Outside alert time window or no urgent emails | Use `--force` flag to bypass time window. Check `lookbackMinutes` covers the scan interval. |
| Too many alerts (noise) | Threshold too low or noise senders not filtered | Increase `urgencyThreshold` in config. Add sender patterns to `noiseSenders`. Give "Not Urgent" feedback on false positives. |
| Missed urgent emails | Threshold too high or sender not in CRM | Lower `urgencyThreshold`. Add critical senders to `vipSenders`. Give "Was Urgent" feedback to improve recall. |
| Himalaya CLI errors | Email credentials expired or config wrong | Check `himalaya envelope list`. Re-run `deploy-himalaya-email.md` if needed. |
| Claude Haiku API errors | API key invalid, rate limited, or model unavailable | Check API key prefix (`sk-ant-api03-`). Try a manual API call. Check Anthropic status page. |
| Telegram notifications not arriving | Bot token invalid, chat ID wrong, or bot blocked | Test with a manual `sendMessage` curl call. Verify bot is not blocked by the user. |
| Inline buttons not working | Webhook consuming callbacks before feedback script polls | Check `getWebhookInfo`. Remove webhook or add callback handler to webhook endpoint. |
| Feedback not stored | SQLite database locked or permissions issue | Check file permissions on `urgency-feedback.db`. Ensure no other process has an exclusive lock. |
| Feedback not improving classification | Too few samples | The learning loop needs 20+ feedback examples to meaningfully shift classification. Continue providing feedback consistently. |
| launchd job not firing | Plist syntax error or wrong paths | Validate with `plutil -lint`. Check log files for errors. Verify `node` and `himalaya` are in the PATH specified in the plist. |
| Duplicate notifications | `email_id` dedup not working | Check the UNIQUE constraint on `notifications.email_id`. Query: `sqlite3 ${WORKSPACE}/data/urgency-feedback.db "SELECT email_id, COUNT(*) FROM notifications GROUP BY email_id HAVING COUNT(*) > 1;"` |
| Notion lookup errors (when enabled) | Notion API key expired or People DB not shared with integration | Check Notion config. Test with `node ${WORKSPACE}/tools/notion-read.js people --limit 1`. Set `notion.enabled` to `false` as fallback. |
| Script OOM on large email | Email body too large for Node.js heap | The script truncates body to 2000 chars before classification. If still failing, add `--max-old-space-size=512` to the node command in the wrapper script. |
| Wrong timezone for alert window | Config timezone does not match Dan's actual timezone | Update `alertWindow.timezone` in `urgency.json`. Verify with `date` on the client machine. |

## Autonomy Mode Behavior

| Step | Auto | Guided | Manual |
|------|------|--------|--------|
| 1.1 Create directories | Execute silently | Execute silently | Confirm before creating |
| 1.2 Write urgency config | Execute silently | Review config before writing | Review every field |
| 1.3 Verify API key | Execute silently | Execute silently | Show response |
| 2.1 Create feedback DB | Execute silently | Execute silently | Show schema, confirm |
| 3.1 Install urgency-check.js | Execute silently | Confirm before writing | Review script, confirm |
| 3.2 Install urgency-notify.js | Execute silently | Confirm before writing | Review script, confirm |
| 3.3 Install urgency-feedback.js | Execute silently | Confirm before writing | Review script, confirm |
| 4.1 Determine scheduling | Execute silently | Present options, confirm | Present options, confirm |
| 4.2 Write wrapper script | Execute silently | Confirm before writing | Review script, confirm |
| 4.3 Write launchd plist | Execute silently | Review plist before writing | Review every field |
| 4.4 Load launchd plist | Execute silently | Confirm before loading | Confirm command |
| 5.1 Write TOOLS.md entries | Execute silently | Review entries before writing | Review each entry |
| 6.1 Verify config | Execute silently | Execute, show output | Show output |
| 6.2 Verify DB schema | Execute silently | Execute silently | Show schema |
| 6.3 Verify scripts | Execute silently | Execute, show result | Show each result |
| 6.4 Manual urgency scan | Execute, report result | Execute, review alerts together | Confirm, review together |
| 6.5 Test feedback loop | Skip in auto | Execute, review together | Execute step by step |
| 6.6 Verify launchd | Execute silently | Execute, show status | Show status |
| 6.7 Verify TOOLS.md | Execute silently | Execute, show count | Show count |

## Dependencies

- **Depends on:** `deploy-himalaya-email.md` (Himalaya CLI and email access), `deploy-messaging-setup.md` (Telegram bot token and chat ID), `deploy-identity.md` (agent identity configured)
- **Enhanced by:** `deploy-notion-workspace.md` (sender importance from People DB enriches classification), `deploy-personal-crm.md` (contact data for cross-reference)
- **Required by:** `deploy-daily-briefing.md` (urgent email summary feeds into morning briefing)
- **Replaces:** `deploy-urgent-email.md` (BLOCKED -- uses nonexistent `openclaw cron` and `openclaw config` commands)
