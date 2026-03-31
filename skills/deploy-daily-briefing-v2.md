# Deploy Daily Morning Briefing v3

## Compatibility
- **OpenClaw Version**: 2026.3.27
- **Status**: READY
- **Blocked Commands**: None
- **Notes**: Full rewrite of `deploy-daily-briefing.md` (v1 BROKEN -- context overflow). Uses standalone Node.js scripts (no OpenClaw session dependency), file-based config, launchd for scheduling, and raw API calls for Telegram and Claude. Scripts are stateless per run -- no context accumulation across executions. Implements Anthropic's Generator + Evaluator harness pattern for quality control. Two-tier delivery: Emily (EA) gets detailed operational version, Dan gets concise need-to-know version.
- **Updated**: 2026-03-30 based on Emily (Dan's EA) meeting and Anthropic harness design research.

## Purpose

Install a two-tier daily intelligence briefing system for a VC Managing Director and his Executive Assistant. The system recognizes that Dan and Emily have different needs:

- **Dan** needs: short, concise, need-to-know only. Calendar with attendee context, urgent items, action items due. No noise.
- **Emily** (EA) needs: detailed operational view. Calendar integrity report, draft follow-up emails, scheduling recommendations, contact updates needed, full email digest. She filters and approves before things reach Dan.

The 7 AM morning briefing delivers both versions simultaneously. The 7 PM end-of-day summary captures accomplishments, meetings attended, new action items, and tomorrow's preview.

This is the highest-value daily touchpoint between the agent and the client. It transforms the first 5 minutes of Dan's day from "checking apps" to "reading a prepared brief from your chief of staff" -- while giving Emily the operational detail she needs to stay ahead.

**Architecture pattern:** Implements Anthropic's Generator + Evaluator harness design (https://anthropic.com/engineering/harness-design-long-running-apps). After Claude Sonnet generates the briefing, a separate evaluator call grades it against explicit quality criteria before delivery. Emily serves as the human evaluator in the harness for operational items.

**When to use:** After Notion workspace, Google Workspace (calendar + email), and messaging are deployed. The more data sources configured, the richer the briefing. Reads Nightman overnight processing results if available.

**What this skill does:**
1. Creates briefing configuration with two-tier delivery preferences (Dan concise / Emily detailed), data sources, section toggles, and quality evaluation criteria
2. Installs a standalone `daily-briefing.js` script (no OpenClaw dependency) that:
   a. Reads Nightman overnight results (calendar enrichment, contact research, draft follow-ups) from `workspace/data/nightman/YYYY-MM-DD/`
   b. Gathers live data from calendar, email, Notion, and CRM
   c. Generates two briefing versions via Claude Sonnet (concise for Dan, detailed for Emily)
   d. Runs an evaluator pass (Claude Haiku) that grades against explicit quality criteria -- regenerates once if it fails
   e. Delivers both versions via Telegram
3. Installs a standalone `eod-summary.js` script for end-of-day wrap-up (same two-tier pattern)
4. Schedules both via launchd (7 AM and 7 PM weekdays)
5. Adds TOOLS.md entries for on-demand triggering and configuration
6. Verifies delivery end-to-end

## Two-Tier Delivery Model

Based on March 30, 2026 meeting with Emily (Dan's EA). See `docs/meetings/2026-03-30-emily-ea-meeting.md`.

### Dan's Briefing (Concise)
- Calendar with attendee context (name, title, company, last interaction, interests like Sundance/music/politics)
- Urgent items only (things that need attention today)
- Action items due or overdue
- Unread email count (urgent count + total)
- Target: under 2,000 characters. Scannable in 60 seconds.

### Emily's Briefing (Detailed Operational)
- Calendar integrity report (Nightman results: missing Meet links, travel time gaps, parking info added)
- Scheduling intelligence (which meetings are moveable, conflicts detected)
- Draft follow-up emails for things that fell through cracks (Emily reviews and approves before sending)
- Contact updates needed (new people with no CRM record, outdated records flagged)
- Full email digest (all urgency tiers with recommended actions)
- Action items (full list, not just urgent)

### What Emily Does NOT See
- Investment team briefings (portfolio company updates, deal flow)
- Investor-specific content
- These go directly to Dan without Emily's review

### Approval Flow
| Item Type | Who Reviews | Who Receives |
|-----------|-------------|-------------|
| Draft follow-up emails | Emily approves via Telegram | Sent from Dan's email after approval |
| Scheduling changes | Emily approves via Telegram | Calendar updated after approval |
| Investment briefings | Nobody (direct) | Dan only |
| Operational items | Emily reviews first | Dan gets concise version |

## Evaluator Harness Pattern

Based on Anthropic's harness design research. The generator (Claude Sonnet) produces the briefing, then a separate evaluator (Claude Haiku) grades it before delivery.

### Quality Criteria (configurable in `briefing.json`)

```json
{
  "evaluator": {
    "enabled": true,
    "model": "claude-haiku-4-5-20250514",
    "maxRetries": 1,
    "criteria": {
      "conciseness": {
        "weight": 0.3,
        "rule": "Dan's version must be under 2000 chars. Emily's under 6000 chars. No filler sentences."
      },
      "actionability": {
        "weight": 0.25,
        "rule": "Every item must have a clear next step or be explicitly informational. No vague summaries like 'various tasks are pending.'"
      },
      "signalToNoise": {
        "weight": 0.25,
        "rule": "Would Dan care about this at 7 AM? Would Emily need this to do her job? If no to both, remove it."
      },
      "accuracy": {
        "weight": 0.1,
        "rule": "Attendee names and companies must match CRM data. Dates must be correct. Meeting times must match calendar."
      },
      "formatting": {
        "weight": 0.1,
        "rule": "Clean Telegram markdown. Scannable headers. No walls of text. Priority indicators for urgent items."
      }
    },
    "passThreshold": 0.7
  }
}
```

### Evaluator Flow
1. Generator produces Dan's briefing + Emily's briefing
2. Evaluator grades each against the 5 criteria (returns score 0-1 per criterion)
3. If weighted average >= 0.7: PASS → deliver
4. If FAIL: evaluator returns specific feedback → generator regenerates once with feedback
5. If still FAIL after retry: deliver anyway with a flag to Emily ("⚠ Briefing quality below threshold — please review carefully")
6. Cost: ~$0.03 extra per briefing (one Haiku call)

## Nightman File Handoff

The morning briefing reads overnight processing results via structured file handoff (no context accumulation, no session state -- just files).

### Expected Directory Structure
```
${WORKSPACE}/data/nightman/YYYY-MM-DD/
├── calendar-enrichment.json    # Meet links added, travel time calculated, parking info
├── contact-research.json       # New contacts researched, existing contacts updated
├── draft-followups.json        # Emails drafted for things that fell through cracks
├── project-updates.json        # Proactive recommendations, research findings
└── run-summary.json            # What Nightman did, what succeeded, what failed
```

If the Nightman directory doesn't exist for today (Nightman not yet deployed, or it failed), the briefing degrades gracefully -- it just doesn't include those sections. No error, no failure.

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
| `${ANTHROPIC_API_KEY}` | Client profile or `${WORKSPACE}/.env` | `sk-ant-api03-...` |
| `${TELEGRAM_BOT_TOKEN}` | Client profile: agent bot token | `7123456789:AAF...` |
| `${TELEGRAM_CHAT_ID}` | Client profile: Dan's Telegram user ID | `8730867387` |
| `${EMILY_TELEGRAM_CHAT_ID}` | Emily's Telegram user ID (needs setup) | `TBD` |
| `${TIMEZONE}` | Client profile: timezone | `America/Denver` |
| `${BRIEFING_TIME}` | Client preference (24h format) | `05:30` |
| `${EOD_TIME}` | Client preference (24h format) | `19:00` |
| `${AGENT_USER}` | Pre-flight check: `whoami` on client machine | `edge` |
| `${AGENT_USER_UID}` | Pre-flight check: `id -u` on client machine | `501` |
| `${NODE_PATH}` | Pre-flight check: `which node` on client machine | `/opt/homebrew/bin/node` |
| `${CLIENT_NAME}` | Client profile: first name for personalization | `Dan` |
| `${EA_NAME}` | EA profile: first name for personalization | `Emily` |

## Before You Start

Follow the **Standard Deployment Protocol** in `_deploy-common.md`: read the client profile, check what exists, identify adaptations, and present a deployment plan before executing.

**Pre-flight checks for this skill:**

Check if Node.js is available (required for all scripts):

**Remote:**
```
node --version 2>/dev/null || echo 'NO_NODE'
```

Expected: Version string (v18+ required for native fetch). If `NO_NODE`, install Node.js first.

Check the `@anthropic-ai/sdk` npm package is available:

**Remote:**
```
test -d ${WORKSPACE}/node_modules/@anthropic-ai/sdk && echo 'SDK_OK' || echo 'NO_SDK'
```

Expected: `SDK_OK`. If `NO_SDK`, install it:

**Remote:**
```
cd ${WORKSPACE} && npm install @anthropic-ai/sdk 2>&1 | tail -3
```

Check if Notion config exists (required for attendee lookups and task queries):

**Remote:**
```
test -f ${WORKSPACE}/config/notion.json && echo 'NOTION_OK' || echo 'NO_NOTION'
```

Expected: `NOTION_OK`. If `NO_NOTION`, deploy `deploy-notion-workspace.md` first. The briefing can still run without Notion (graceful degradation), but attendee dossiers and task sections will be empty.

Check if briefing config already exists:

**Remote:**
```
test -f ${WORKSPACE}/config/briefing.json && cat ${WORKSPACE}/config/briefing.json | head -20 || echo 'NOT_CONFIGURED'
```

Expected: Either existing config (review for correctness) or `NOT_CONFIGURED`.

Check if briefing scripts already exist:

**Remote:**
```
ls ${WORKSPACE}/scripts/daily-briefing.js ${WORKSPACE}/scripts/eod-summary.js 2>/dev/null || echo 'NO_SCRIPTS'
```

Expected: Either file paths listed (review versions) or `NO_SCRIPTS`.

Check if launchd plists are already loaded:

**Remote:**
```
launchctl list 2>/dev/null | grep com.openclaw.daily-briefing || echo 'NO_MORNING_PLIST'
launchctl list 2>/dev/null | grep com.openclaw.eod-summary || echo 'NO_EOD_PLIST'
```

Expected: Either plist entries (already scheduled) or `NO_*_PLIST`.

Check email CLI availability:

**Remote:**
```
which himalaya 2>/dev/null && echo 'HIMALAYA_OK' || echo 'NO_HIMALAYA'
which gogcli 2>/dev/null && echo 'GOGCLI_OK' || echo 'NO_GOGCLI'
gog mail list --max-results 1 2>/dev/null && echo 'GOG_MAIL_OK' || echo 'NO_GOG_MAIL'
```

Expected: At least one email CLI available. Record which one for the config.

Check calendar CLI availability:

**Remote:**
```
gog calendar events list --max-results 1 2>/dev/null && echo 'GOG_CAL_OK' || echo 'NO_GOG_CAL'
```

Expected: `GOG_CAL_OK`. If unavailable, the briefing will have no calendar section.

Resolve macOS username and UID (needed for launchd absolute paths):

**Remote:**
```
whoami && id -u && which node
```

Expected: Username, numeric UID, and node path. Record all three -- launchd plists require absolute paths.

**Decision points from pre-flight:**
- What time does the client want the morning briefing? (Default: 7:00 AM weekdays)
- What time for the EOD summary? (Default: 7:00 PM weekdays)
- Which data sources are available? (Notion, calendar, email, social tracking, Fathom)
- Which sections should be enabled/disabled?
- Is the Anthropic API key available in `.env`?

## Adaptation Points

| Component | Default | Customize When... |
|-----------|---------|-------------------|
| Morning briefing time | 5:30 AM weekdays (gives Nightman 3:30-5:30 to enrich) | Client has different morning routine |
| EOD summary time | 7:00 PM weekdays | Client works different hours |
| Delivery channel | Telegram direct message | Client prefers topic in group, or different platform |
| Calendar source | Google Calendar via `gog` CLI | Client uses Outlook or CalDAV |
| Email source | `himalaya` or `gog mail` | Client uses different email CLI |
| Attendee context | Notion People + Companies databases | CRM not deployed, or client wants lighter briefing |
| Task tracking | Notion Tasks database | Client uses Todoist, Asana, or other system |
| AI model for synthesis | Claude claude-sonnet-4-20250514 | Client wants Haiku for cost savings or Opus for depth |
| AI model for email triage | Claude claude-haiku-4-5-20250514 | Balance speed vs accuracy for email classification |
| Briefing sections | All enabled | Client wants a simpler briefing |
| Script location | `${WORKSPACE}/scripts/` | Client prefers different path |
| Log location | `${WORKSPACE}/logs/briefing/` | Client prefers different path |

## Memory Integration & Skill Dependencies

The Daily Briefing does not exist in isolation. It reads from and writes to multiple memory and data systems. Understanding these connections is critical for deployment ordering and debugging.

### How Memory Layers Feed the Briefing

| Memory Layer | What the Briefing Uses It For | Skill That Provides It |
|-------------|-------------------------------|----------------------|
| **Hot Memory** (`memory.md`, <200 lines) | Recent context Edge should know -- active deals, Dan's current focus, recent decisions. Used in synthesis to personalize the briefing. | Layer 0.6: Persistent Memory |
| **Warm Memory** (topic files: `contacts/`, `portfolio/`, `meetings/`) | Per-contact context, per-company context, recent meeting summaries. Pulled when building attendee dossiers. | Layer 0.6: Persistent Memory |
| **Cold Memory** (`archive/` monthly summaries) | Historical context for "last quarter we discussed X with this person." Used by accuracy agent to verify "last interaction" claims. | Layer 0.6: Persistent Memory |
| **Vector Embeddings** (mxbai-embed-large via oMLX) | Semantic search for attendee context. "Find everything we know about this person" -- even if their name is slightly different in different records. Hybrid search (vector 0.7 + text 0.3). | Layer 0.5: oMLX + Layer 0.6: Embeddings |
| **Knowledge Graph** (Neo4j + Graphiti) | Temporal relationship queries. "Who is John Smith WITH right now?" (not 6 months ago). Relationship changes over time. Critical for accuracy verification. | Layer 0.8: Knowledge Graph |
| **SQLite CRM** (5 tables) | Fast local cache of contacts, companies, interactions, tags, embeddings. The accuracy agent queries this for verification. | Layer 2.2: Personal CRM |
| **Notion** (People, Companies, Tasks DBs) | Source of truth for all structured data. CRM syncs from here. Briefing queries tasks directly. | Layer 2.1: Notion Workspace |
| **Lossless Claw** (context management) | Ensures Edge's conversation history with Dan/Emily persists across context resets. If Dan said "don't brief me on PortCo X anymore" last week, that instruction survives. | Layer 0.7: Lossless Claw |

### How the Briefing Writes Back

| What Gets Written | Where | Why |
|-------------------|-------|-----|
| Briefing metadata (what was delivered, scores, timing) | `${WORKSPACE}/logs/briefing/` | Debugging, quality tracking over time |
| "Briefing delivered" interaction record | Notion Interactions DB (if available) | CRM tracks all touchpoints |
| Accuracy corrections (wrong titles, outdated companies) | Flagged for CRM update queue | Keeps CRM data clean over time |
| Suggested contact tags (unverified interests) | `${WORKSPACE}/data/briefing/suggested-tags.json` | Emily or Nightman reviews and applies |

### Skill Dependency Map

```
REQUIRED (briefing won't run without these):
├── Telegram (messaging) .............. Already configured
├── Google Calendar (calendar data) ... Layer 1.2
├── Himalaya Email (email data) ....... Layer 1.1
└── Anthropic API key ................. In .env

STRONGLY RECOMMENDED (briefing degrades without these):
├── Notion Workspace .................. Layer 2.1 (attendee dossiers, tasks)
├── Personal CRM ...................... Layer 2.2 (fast local queries, accuracy verification)
├── Persistent Memory ................. Layer 0.6 (context for personalization)
└── oMLX + Embeddings ................. Layer 0.5 + 0.6 (semantic search for contacts)

ENHANCES (briefing is richer with these):
├── Knowledge Graph ................... Layer 0.8 (temporal relationship queries)
├── Lossless Claw ..................... Layer 0.7 (instruction persistence)
├── Nightman (overnight processing) ... NEW SKILL (calendar enrichment, research, draft follow-ups)
├── Transcript Pipeline ............... Layer 4.1 (meeting context from recent transcripts)
└── Contact Auto-Enrichment ........... NEW SKILL (LinkedIn research, interest tagging)

FEEDS INTO (skills that consume briefing data):
├── Action Items ...................... Layer 4.2 (follow-up drafts become action items)
├── Email Triage ...................... Layer 3.3 (briefing email digest informs triage priorities)
└── Meeting Prep ...................... Layer 3.2 (shares attendee dossier logic)
```

### Skills Not Yet Drafted That This Skill Reveals We Need

| Missing Skill | Why We Need It | Priority |
|---------------|---------------|----------|
| **Nightman (Overnight Processing)** | Emily meeting confirmed this: nightly calendar enrichment (Meet links, travel time, parking), contact research, project advancement, draft follow-ups. The briefing reads Nightman's output. Without Nightman, the briefing has no overnight intelligence. | HIGH -- should be drafted before deployment |
| **Scheduling Intelligence** | Emily's #1 pain point: moveable vs. fixed meetings, auto-rescheduling internals, travel time with live traffic. The briefing reports scheduling status but the scheduling engine is a separate skill. | HIGH -- new skill needed |
| **Contact Auto-Enrichment** | Emily spends hours manually tagging contacts (investor/tech entrepreneur/interests). The briefing flags contacts needing updates, but the enrichment engine that actually does LinkedIn research and auto-tagging is a separate skill. | HIGH -- new skill needed |
| **Voice Cloning / Dinner Reservations** | Stretch goal from Emily meeting. Not related to briefing but surfaced during the same conversation. | LOW -- stretch goal |

## Prerequisites

- Node.js v18+ available on the client machine
- `@anthropic-ai/sdk` npm package installed in `${WORKSPACE}`
- `deploy-identity.md` completed (agent identity configured)
- `deploy-messaging-setup.md` completed (Telegram bot token available)
- `deploy-google-workspace.md` completed (calendar + email access)
- Emily set up on Telegram (for two-tier delivery -- Dan's briefing works without this, Emily's doesn't)
- Recommended: `deploy-notion-workspace.md` completed (attendee dossiers, task queries, accuracy verification)
- Recommended: `deploy-personal-crm-v2.md` completed (fast local CRM queries, accuracy agent depends on this)
- Recommended: `deploy-memory.md` completed (persistent memory for personalization and context)
- Recommended: oMLX + mxbai-embed-large running (semantic contact search)
- Optional: Knowledge Graph deployed (temporal relationship verification)
- Optional: Nightman deployed (overnight enrichment results)
- Anthropic API key available in `${WORKSPACE}/.env` (must support Opus for accuracy agent)

## What Gets Installed

### Configuration (`config/briefing.json`)

| Field | Description |
|-------|-------------|
| `schedule.morning` | Delivery time, days of week for morning briefing |
| `schedule.eod` | Delivery time, days of week for EOD summary |
| `delivery.telegram.botToken` | Reference to env var for Telegram bot token |
| `delivery.telegram.chatId` | Dan's Telegram user ID |
| `dataSources` | Which sources are enabled (calendar, email, notion, crm) |
| `sections` | Toggle for each briefing section |
| `ai.synthesisModel` | Claude model for briefing generation |
| `ai.triageModel` | Claude model for email urgency classification |
| `client.name` | Client first name for personalized greeting |
| `client.timezone` | Timezone for date handling |

### Scripts

| Script | Location | Purpose |
|--------|----------|---------|
| `daily-briefing.js` | `${WORKSPACE}/scripts/daily-briefing.js` | Morning briefing: calendar + attendee dossiers + email triage + action items + follow-ups. Standalone Node.js (no OpenClaw dependency). |
| `eod-summary.js` | `${WORKSPACE}/scripts/eod-summary.js` | End-of-day: accomplishments + meetings attended + new action items + tomorrow preview. Standalone Node.js. |

### Launchd Plists

| Detail | Value |
|--------|-------|
| Morning briefing label | `com.openclaw.daily-briefing` |
| Morning briefing schedule | Weekdays at 5:30 AM MT (local time) |
| EOD summary label | `com.openclaw.eod-summary` |
| EOD summary schedule | Weekdays at `${EOD_TIME}` (local time) |
| Plist location | `~/Library/LaunchAgents/` |
| Log output | `${WORKSPACE}/logs/briefing/` |

### TOOLS.md Entries

Adds entries to `${WORKSPACE}/TOOLS.md` so the agent knows how to:
- Trigger a morning briefing on demand
- Trigger an EOD summary on demand
- Check briefing run logs and status
- Modify briefing preferences

### Log Files

| Log | Location | Format |
|-----|----------|--------|
| Per-run log | `${WORKSPACE}/logs/briefing/YYYY-MM-DD-morning.json` | JSON with status per section, timing, errors |
| Per-run log | `${WORKSPACE}/logs/briefing/YYYY-MM-DD-eod.json` | Same format for EOD |
| Launchd stdout | `${WORKSPACE}/logs/briefing/daily-briefing.log` | Raw script output |
| Launchd stderr | `${WORKSPACE}/logs/briefing/daily-briefing-error.log` | Error output |
| EOD stdout | `${WORKSPACE}/logs/briefing/eod-summary.log` | Raw script output |
| EOD stderr | `${WORKSPACE}/logs/briefing/eod-summary-error.log` | Error output |

## Steps

### Phase 1: Configuration

#### 1.1 Create Directory Structure `[AUTO]`

Create all directories needed for the briefing system.

**Remote:**
```
mkdir -p ${WORKSPACE}/scripts ${WORKSPACE}/config ${WORKSPACE}/logs/briefing
```

Expected: All directories exist. `mkdir -p` is idempotent.

#### 1.2 Verify Environment Variables `[GUIDED]`

Confirm the required API keys are present in the workspace `.env` file.

**Remote:**
```
grep -c ANTHROPIC_API_KEY ${WORKSPACE}/.env 2>/dev/null && echo 'ANTHROPIC_KEY_OK' || echo 'NO_ANTHROPIC_KEY'
grep -c TELEGRAM_BOT_TOKEN ${WORKSPACE}/.env 2>/dev/null && echo 'TELEGRAM_TOKEN_OK' || echo 'NO_TELEGRAM_TOKEN'
grep -c TELEGRAM_CHAT_ID ${WORKSPACE}/.env 2>/dev/null && echo 'TELEGRAM_CHAT_OK' || echo 'NO_TELEGRAM_CHAT'
```

Expected: All three present. If any are missing, add them:

**Remote (only for missing keys):**
```
printf 'ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}\n' >> ${WORKSPACE}/.env
printf 'TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}\n' >> ${WORKSPACE}/.env
printf 'TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}\n' >> ${WORKSPACE}/.env
```

If this fails: Ensure `${WORKSPACE}/.env` exists and is writable. Create it if missing with `touch ${WORKSPACE}/.env`.

If already exists: Verify values are current. Check `ANTHROPIC_API_KEY` starts with `sk-ant-api03-`. Check `TELEGRAM_CHAT_ID` is a bare integer.

#### 1.3 Write Briefing Config `[GUIDED]`

Write the configuration file that controls briefing behavior, sections, data sources, and delivery.

The operator must construct this JSON with the client's actual values before sending. The template below shows the structure.

**Remote (use base64 encoding per `_deploy-common.md` File Transfer Standard):**

```
echo '<base64-encoded-briefing-config-json>' | base64 -d > ${WORKSPACE}/config/briefing.json
```

The JSON structure must follow this template:

```json
{
  "version": 2,
  "client": {
    "name": "${CLIENT_NAME}",
    "timezone": "${TIMEZONE}"
  },
  "schedule": {
    "morning": {
      "time": "${BRIEFING_TIME}",
      "days": ["Mon", "Tue", "Wed", "Thu", "Fri"]
    },
    "eod": {
      "time": "${EOD_TIME}",
      "days": ["Mon", "Tue", "Wed", "Thu", "Fri"]
    }
  },
  "delivery": {
    "dan": {
      "telegram": {
        "botTokenEnv": "TELEGRAM_BOT_TOKEN",
        "chatId": "${TELEGRAM_CHAT_ID}"
      },
      "format": "concise",
      "maxChars": 2000,
      "sections": ["calendar", "needsAttention", "actionItemsDue", "urgentEmailCount"]
    },
    "emily": {
      "telegram": {
        "botTokenEnv": "TELEGRAM_BOT_TOKEN",
        "chatId": "${EMILY_TELEGRAM_CHAT_ID}"
      },
      "format": "detailed",
      "maxChars": 6000,
      "sections": ["calendarIntegrity", "scheduling", "draftFollowUps", "contactUpdates", "emailDigest", "actionItems", "pendingFollowUps"]
    },
    "approvalFlow": {
      "draftEmails": "emily",
      "schedulingChanges": "emily",
      "investmentBriefings": "dan_direct",
      "operationalItems": "emily_then_dan"
    }
  },
  "nightmanHandoff": {
    "enabled": true,
    "dataDir": "${WORKSPACE}/data/nightman",
    "gracefulDegradation": true
  },
  "dataSources": {
    "calendar": {
      "enabled": true,
      "provider": "gog",
      "command": "gog calendar events list --start-date TODAY --end-date TODAY --max-results 25"
    },
    "email": {
      "enabled": true,
      "provider": "himalaya",
      "command": "himalaya list --folder INBOX --max-width 200 -s 30",
      "unreadOnly": true
    },
    "notion": {
      "enabled": true,
      "configPath": "${WORKSPACE}/config/notion.json",
      "databases": {
        "people": true,
        "companies": true,
        "tasks": true
      }
    }
  },
  "sections": {
    "calendar": {
      "enabled": true,
      "label": "Today's Calendar",
      "includeAttendeeDossiers": true,
      "flagUnknownAttendees": true
    },
    "emailDigest": {
      "enabled": true,
      "label": "Email Digest",
      "maxUrgentItems": 5,
      "showTotalUnread": true
    },
    "actionItems": {
      "enabled": true,
      "label": "Action Items Due",
      "includeOverdue": true,
      "groupByPriority": true
    },
    "pendingFollowUps": {
      "enabled": true,
      "label": "Waiting On",
      "staleDays": 3
    },
    "eodAccomplishments": {
      "enabled": true,
      "label": "Accomplished Today"
    },
    "tomorrowPreview": {
      "enabled": true,
      "label": "Tomorrow's Calendar"
    }
  },
  "ai": {
    "synthesisModel": "claude-sonnet-4-20250514",
    "triageModel": "claude-haiku-4-5-20250514",
    "maxTokens": 4000
  },
  "logging": {
    "dir": "${WORKSPACE}/logs/briefing",
    "retainDays": 30
  }
}
```

**Critical:** The `dataSources.email.command` must match the actual email CLI available on the client machine. If `himalaya` is not installed but `gog mail` is, change to `"provider": "gog", "command": "gog mail list --max-results 30"`. Adjust `dataSources.calendar.command` similarly based on the pre-flight check.

Expected: File exists at `${WORKSPACE}/config/briefing.json` with valid JSON.

If this fails: Check that `${WORKSPACE}/config/` exists. Verify base64 produced valid JSON: `python3 -c "import json; json.load(open('${WORKSPACE}/config/briefing.json'))"`.

If already exists: Compare content. If unchanged, skip. If different, back up as `briefing.json.bak` and write new version.

### Phase 2: Script Installation

#### 2.1 Install daily-briefing.js `[GUIDED]`

Write the standalone morning briefing script. This is the core of the system -- it gathers data from all configured sources, synthesizes via Claude Sonnet, and delivers via Telegram.

**CRITICAL DESIGN REQUIREMENT:** This script is STANDALONE. It does NOT depend on OpenClaw, does NOT run inside an OpenClaw session, and does NOT accumulate context across runs. Each execution is a fresh process that reads config, gathers data, calls Claude once for synthesis, delivers, and exits. This prevents the context overflow that broke the v1 implementation.

The script must:
- Read config from `${WORKSPACE}/config/briefing.json`
- Read secrets from `${WORKSPACE}/.env` (parse KEY=VALUE lines)
- Load Notion config from `${WORKSPACE}/config/notion.json` if Notion is enabled
- Use `@anthropic-ai/sdk` for Claude API calls (NOT raw HTTP)
- Use Node.js `execFileSync` from `child_process` to invoke CLI tools (`gog`, `himalaya`) for calendar and email data -- pass arguments as an array to avoid shell injection
- Use `fetch` (Node 18+ native) for Notion API and Telegram Bot API calls
- Wrap each data-gathering section in its own try/catch -- if one source fails, continue with available data
- Log structured JSON to `${WORKSPACE}/logs/briefing/YYYY-MM-DD-morning.json`
- Exit cleanly with code 0 on success, non-zero on critical failure (e.g., cannot read config, cannot reach Telegram)

**Script behavior in order:**

**Step A -- Load config and secrets:**
- Read and parse `briefing.json`
- Read `${WORKSPACE}/.env`, parse each `KEY=VALUE` line into an env object
- Validate required keys: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- Initialize the Anthropic SDK client with the API key
- Initialize the run log object with timestamp and empty section results

**Step B -- Calendar scan:**
- Use `execFileSync` to invoke the calendar CLI command from config (e.g., `gog` with arguments `['calendar', 'events', 'list', '--start-date', todayStr, '--end-date', todayStr, '--max-results', '25']`)
- Parse the output to extract: event title, start/end time, attendees (names + emails), location/Meet link, description
- Store as structured data for synthesis
- Log: number of events found, timing

**Step C -- Meeting prep / Attendee dossiers:**
- For each calendar event with external attendees:
  - Extract attendee email addresses
  - If Notion is enabled: use `execFileSync` to invoke `node` with args `['${WORKSPACE}/tools/notion-read.js', 'people', '--search', attendeeEmail, '--json']` for each attendee
  - Pull: name, title, company, last interaction date, notes
  - If Notion has a Companies database: look up the attendee's company for additional context (industry, stage, relationship)
  - If attendee is not found in Notion: flag as "Unknown -- research recommended"
- Store attendee dossiers alongside their calendar events
- Log: attendees looked up, found vs unknown, timing

**Step D -- Email digest:**
- Use `execFileSync` to invoke the email CLI from config (e.g., `himalaya` with args `['list', '--folder', 'INBOX', '--max-width', '200', '-s', '30']`)
- Parse output to get sender, subject, date for recent emails
- Call Claude Haiku (the triage model from config) with a batch of email subjects to classify urgency: "urgent", "important", "normal", "low"
  - System prompt: "You classify emails by urgency for a VC Managing Director named Dan Caruso at Crusoe Ventures. Respond as a JSON array of objects with 'index' and 'urgency' fields."
  - Keep the prompt small -- just subjects and senders, not full bodies
- Select top N urgent items per config (`sections.emailDigest.maxUrgentItems`)
- Count total unread
- Log: total emails scanned, urgent count, triage model tokens used, timing

**Step E -- Action items due:**
- If Notion tasks are enabled: use `execFileSync` to invoke `node` with the notion-read script to query for tasks due today or overdue
  - Pass a Notion filter for: Due Date on_or_before today AND Status does_not_equal "Done"
- Group by priority if `sections.actionItems.groupByPriority` is true
- Log: items found, overdue count, timing

**Step F -- Pending follow-ups:**
- If Notion tasks are enabled: query for items where Status equals "Waiting On" (or equivalent status name)
- Calculate age of each item from its creation date or last update
- Flag items older than `sections.pendingFollowUps.staleDays` (default 3 days)
- Log: follow-ups found, stale count, timing

**Step G -- Read Nightman Results (if available):**
- Check for `${WORKSPACE}/data/nightman/YYYY-MM-DD/` directory
- If it exists, read: `calendar-enrichment.json`, `contact-research.json`, `draft-followups.json`, `run-summary.json`
- If it doesn't exist: skip gracefully (Nightman not deployed yet or failed overnight)
- Merge Nightman data into the briefing context (calendar integrity fixes, new contact research, draft follow-up emails)
- Log: nightman data found/not found, files read, timing

**Step H -- Two-Tier Synthesis (Generator):**
- Build TWO prompts for Claude Sonnet with all gathered data sections:

  **Dan's briefing (concise):**
  - System prompt: "You produce a concise morning briefing for a VC Managing Director. SHORT AND TO THE POINT. Under 2000 characters. Only need-to-know items. No filler."
  - Personalized greeting ("Good morning, Dan. Here's your Wednesday brief.")
  - Calendar events with attendee context inline -- "Meeting with John Smith (Partner, Sequoia -- last spoke 2 weeks ago, interested in Sundance)"
  - Needs Attention section: overdue follow-ups, items requiring Dan's action today
  - Urgent email count + total unread (no details -- Emily handles triage)
  - NO operational noise, NO scheduling details, NO contact update requests

  **Emily's briefing (detailed):**
  - System prompt: "You produce a detailed operational briefing for an Executive Assistant. Include everything she needs to manage the day: calendar integrity, scheduling intelligence, draft emails for review, contact updates, full email digest."
  - Calendar integrity report (from Nightman: Meet links, travel time, parking)
  - Scheduling intelligence: which meetings are moveable (internal) vs. fixed (external)
  - Draft follow-up emails for items that fell through cracks (with approve/reject buttons)
  - Contact updates needed (new people without CRM records, outdated records)
  - Full email digest with urgency tiers and recommended actions
  - Action items (full list with priorities)

- Call Claude Sonnet ONCE with both prompts batched (or sequentially if token limits require)
- Store both formatted briefing texts
- Log: synthesis model, input/output tokens for each version, timing

**Step I -- Accuracy Verification Agent (Dedicated):**
- This is a SEPARATE dedicated verification step using Claude Opus (best reasoning model -- cost is not a constraint for a VC firm)
- Purpose: Every named entity, date, time, email, and factual claim in both briefings must be cross-referenced against source data before delivery. Getting a name, email, or context wrong is unacceptable.
- The accuracy agent receives: both briefing texts + ALL raw source data (calendar API response, CRM records, Notion query results, email data, Nightman results)

- **Verification checks performed:**

  1. **Person names**: Every person mentioned → lookup against Notion People DB + SQLite CRM + raw calendar attendee list. Verify spelling, correct title, correct company affiliation AS OF TODAY (people change jobs -- use Knowledge Graph temporal queries if available).

  2. **Email addresses**: Every email referenced → verify it's the PREFERRED email for that contact (per CRM). Check EA CC rules -- if the contact has a known EA, flag if the EA was not included. (Per Emily: "we basically always need to CC their EA.")

  3. **Company names**: Every company mentioned → verify against Notion Companies DB. Check current status (active portfolio? prospective? LP? Former?). Flag if a company name has changed or person has moved to a new company.

  4. **Meeting times and dates**: Every time reference → verify against the RAW calendar API response (not the Generator's interpretation). Check timezone handling (all times must be Mountain Time). Verify no meetings were omitted or duplicated.

  5. **"Last interaction" claims**: Every "last spoke X ago" or "met on DATE" → verify against CRM interaction history or Knowledge Graph. If no interaction record exists, say "no prior interaction on record" rather than hallucinating.

  6. **Interest tags and context**: Every interest/tag mentioned (Sundance, politics, music, etc.) → verify it exists in the contact's CRM record. Do NOT infer interests that aren't tagged -- flag them as "suggested tag, unverified" instead.

  7. **Action item status**: Every "overdue" or "pending" claim → verify against Notion Tasks DB. Confirm the item actually exists, is actually overdue, and hasn't been completed since the data was gathered.

  8. **Email counts and urgency**: Verify urgent email count matches the actual classification results from Step D. No rounding, no approximation.

- **Output format:**
  ```json
  {
    "status": "pass|fail|corrected",
    "claims_verified": 23,
    "claims_corrected": 2,
    "claims_unverifiable": 1,
    "corrections": [
      {
        "original": "John Smith (Partner, Sequoia)",
        "corrected": "John Smith (Managing Director, Sequoia)",
        "source": "Notion People DB, updated 2026-03-28",
        "field": "title"
      }
    ],
    "unverifiable": [
      {
        "claim": "interested in Sundance",
        "reason": "No Sundance tag in CRM. Mentioned in transcript 2026-02-14 but not tagged.",
        "recommendation": "Add Sundance interest tag to contact record"
      }
    ]
  }
  ```

- If corrections found: Generator receives the correction list and produces a targeted fix (not a full regeneration -- just patches the specific errors)
- If unverifiable claims found: They are either removed or marked with "(unverified)" in the briefing
- Cost: ~$0.30-0.50 per briefing (one Opus call with full source data). Worth it -- accuracy is non-negotiable.
- Log: all verification results, corrections applied, unverifiable claims, timing, tokens

**Step J -- Quality Evaluator (Harness Pattern):**
- AFTER accuracy verification, a separate quality evaluator (Claude Sonnet) grades the corrected briefings:
  - **Conciseness** (0.35 weight): Dan's under 2000 chars? Emily's under 6000? No filler?
  - **Actionability** (0.35): Every item has a clear next step? No vague summaries?
  - **Signal-to-noise** (0.2): Would Dan/Emily care at 7 AM? If not, flag for removal.
  - **Formatting** (0.1): Clean Telegram markdown? Scannable? No walls of text?
- (Accuracy is no longer in this evaluator -- it has its own dedicated agent above)
- If weighted average >= 0.7: PASS → deliver
- If FAIL: feed feedback back to Generator, regenerate ONCE
- If still FAIL: deliver with flag to Emily
- Cost: ~$0.05 (one Sonnet evaluator call)
- Log: evaluator scores, pass/fail, retry count, timing

**Step K -- Delivery:**
- Send Dan's concise briefing to Dan's Telegram
- Send Emily's detailed briefing to Emily's Telegram
- For each delivery:
  - Use `fetch` to POST to Telegram Bot API
  - If message > 4096 chars, split at section boundaries
  - If Telegram fails (non-2xx), retry once after 5 seconds
  - If still fails, send without parse_mode (raw text fallback)
- Log: delivery status per recipient, message_id(s), timing

**Step I -- Logging:**
- Write the complete run log to `${WORKSPACE}/logs/briefing/YYYY-MM-DD-morning.json`
- Log schema:
  ```json
  {
    "type": "morning",
    "timestamp": "2026-03-27T07:00:01-06:00",
    "status": "success|partial|failed",
    "durationMs": 8500,
    "sections": {
      "calendar": { "status": "success", "eventsFound": 4, "durationMs": 1200 },
      "attendeeDossiers": { "status": "success", "lookedUp": 6, "found": 4, "unknown": 2, "durationMs": 3400 },
      "emailDigest": { "status": "success", "totalEmails": 23, "urgentCount": 3, "durationMs": 2100 },
      "actionItems": { "status": "success", "dueToday": 2, "overdue": 1, "durationMs": 800 },
      "pendingFollowUps": { "status": "skipped", "reason": "No items with Waiting On status", "durationMs": 600 }
    },
    "ai": {
      "synthesisModel": "claude-sonnet-4-20250514",
      "synthesisTokens": { "input": 2100, "output": 850 },
      "triageModel": "claude-haiku-4-5-20250514",
      "triageTokens": { "input": 400, "output": 120 }
    },
    "delivery": {
      "telegram": { "status": "success", "messageIds": [12345] }
    },
    "errors": []
  }
  ```
- Clean up log files older than `logging.retainDays` from config (default 30 days)

**Important implementation note for the operator:** The script should be written with clear, readable code. Each step (B through H) should be a separate async function that returns its result and logs its timing. The main function orchestrates them in sequence. Error in one step should NOT prevent subsequent steps from executing.

Write the script to `${WORKSPACE}/scripts/daily-briefing.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-daily-briefing-js>' | base64 -d > ${WORKSPACE}/scripts/daily-briefing.js && chmod +x ${WORKSPACE}/scripts/daily-briefing.js
```

Expected: File exists at `${WORKSPACE}/scripts/daily-briefing.js`. Test with `node ${WORKSPACE}/scripts/daily-briefing.js --dry-run` (if you implement a dry-run flag that skips Telegram delivery and prints to stdout instead).

If this fails: Check Node.js version (v18+ for native fetch). Verify `@anthropic-ai/sdk` is installed. Check config files exist.

If already exists: Compare content. If unchanged, skip. If different, back up as `daily-briefing.js.bak` and write new version.

#### 2.2 Install eod-summary.js `[GUIDED]`

Write the end-of-day summary script. This provides a daily wrap-up so the client can close out the day with clarity on what happened and what's ahead.

**CRITICAL DESIGN REQUIREMENT:** Same standalone architecture as the morning briefing. No OpenClaw dependency. Fresh process per run. No accumulated context.

The script must:
- Read the same `briefing.json` config and `.env` secrets
- Use the same modular architecture (try/catch per section, structured logging)
- Share utility functions with daily-briefing.js if practical (or duplicate for simplicity -- the operator decides)

**Script behavior in order:**

**Step A -- Load config and secrets:**
- Same pattern as morning briefing (read briefing.json, parse .env, init Anthropic SDK)

**Step B -- Accomplishments (completed tasks):**
- If Notion tasks are enabled: query for tasks completed today
  - Filter: Status = "Done" AND last_edited_time = today
- If no Notion: skip section gracefully

**Step C -- Meetings attended:**
- Use `execFileSync` to invoke the calendar CLI for today's events
- Cross-reference with meeting transcripts if Fathom pipeline is deployed (check for files matching `${WORKSPACE}/data/fathom/transcripts/YYYY-MM-DD-*.json`)
- For each meeting: note title, attendees, whether transcript is available

**Step D -- Action items created today:**
- If Notion tasks are enabled: query for tasks with created_time = today
- Show what new items were added to the plate during the day

**Step E -- Tomorrow's calendar preview:**
- Use `execFileSync` to invoke the calendar CLI for tomorrow's events
- Highlight early morning meetings, external meetings, and meetings requiring prep

**Step F -- Outstanding items:**
- Overdue tasks (carried over from morning, or re-queried)
- Items still "Waiting On" with no update today

**Step G -- Synthesis:**
- Build a prompt for Claude Sonnet to create a concise EOD wrap-up
- Tone: warm, reflective for accomplishments, clear and forward-looking on what's ahead
- Keep under 3000 characters for a quick evening read
- Telegram Markdown format

**Step H -- Delivery:**
- Same Telegram delivery pattern as morning briefing (with split and retry logic)

**Step I -- Logging:**
- Write to `${WORKSPACE}/logs/briefing/YYYY-MM-DD-eod.json`
- Same log schema as morning briefing, with `"type": "eod"`

Write the script to `${WORKSPACE}/scripts/eod-summary.js` using base64 encoding.

**Remote:**
```
echo '<base64-encoded-eod-summary-js>' | base64 -d > ${WORKSPACE}/scripts/eod-summary.js && chmod +x ${WORKSPACE}/scripts/eod-summary.js
```

Expected: File exists at `${WORKSPACE}/scripts/eod-summary.js`.

If this fails: Same troubleshooting as daily-briefing.js.

If already exists: Compare content. If unchanged, skip. If different, back up and write new version.

#### 2.3 Install Shared Utilities (Optional) `[AUTO]`

If the operator decides to factor out shared code (env parsing, Telegram delivery, Notion queries, logging), install a shared module.

This is optional -- the operator may prefer to keep each script fully self-contained for simplicity and debuggability. The tradeoff:
- **Shared module**: Less duplication, single place to fix bugs. Risk: breaking one breaks both.
- **Self-contained**: Each script is independently debuggable. Risk: fixing a bug requires updating both files.

If the operator chooses shared utilities, write them to `${WORKSPACE}/scripts/briefing-utils.js` and have both scripts `require('./briefing-utils')`.

Recommended shared functions:
- `loadConfig(workspaceDir)` -- reads briefing.json and .env
- `sendTelegram(botToken, chatId, text, parseMode)` -- sends message with split and retry
- `runCli(command, args)` -- wraps `execFileSync` with timeout and error handling
- `queryNotion(database, filter, options)` -- wraps notion-read.js invocation
- `writeLog(logDir, type, logData)` -- writes structured JSON log with cleanup

### Phase 3: Scheduling

#### 3.1 Write Morning Briefing Launchd Plist `[GUIDED]`

Create the launchd plist for the morning briefing. **Level 1 -- exact syntax required.** Launchd plists require absolute paths (`~` and `${HOME}` are NOT expanded).

**CRITICAL:** Do NOT use crontab on macOS. `crontab -` and `crontab /file` hang indefinitely on macOS 15.x (Sequoia) via remote PTY due to TCC permissions. Always use launchd.

The operator must resolve all variables to literal values before sending:
- `${AGENT_USER}` -> the actual macOS username (e.g., `edge`)
- `${NODE_PATH}` -> the actual node binary path (e.g., `/opt/homebrew/bin/node`)
- `${WORKSPACE}` -> the actual resolved path (e.g., `/Users/edge/.openclaw/workspace`)
- `${BRIEFING_TIME}` -> hour and minute integers (e.g., `07:00` -> Hour=7, Minute=0)

Parse `${BRIEFING_TIME}` to extract hour and minute for `StartCalendarInterval`. For `05:30`: Hour=5, Minute=30.

**Remote (use base64 encoding):**
```
echo '<base64-encoded-plist>' | base64 -d > /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.daily-briefing.plist
```

The plist content must be:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.daily-briefing</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>/Users/${AGENT_USER}/.openclaw/workspace/scripts/daily-briefing.js</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Weekday</key>
            <integer>1</integer>
            <key>Hour</key>
            <integer>5</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
        <dict>
            <key>Weekday</key>
            <integer>2</integer>
            <key>Hour</key>
            <integer>5</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
        <dict>
            <key>Weekday</key>
            <integer>3</integer>
            <key>Hour</key>
            <integer>5</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
        <dict>
            <key>Weekday</key>
            <integer>4</integer>
            <key>Hour</key>
            <integer>5</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
        <dict>
            <key>Weekday</key>
            <integer>5</integer>
            <key>Hour</key>
            <integer>5</integer>
            <key>Minute</key>
            <integer>30</integer>
        </dict>
    </array>
    <key>StandardOutPath</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace/logs/briefing/daily-briefing.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace/logs/briefing/daily-briefing-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/${AGENT_USER}</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace</string>
</dict>
</plist>
```

**IMPORTANT adaptation notes:**
- Replace `${NODE_PATH}` with the actual path from `which node` on the client machine.
- Replace `/Users/${AGENT_USER}/.openclaw/workspace/` with the actual resolved workspace path if it differs.
- `StartCalendarInterval` with an array of dicts fires at the specified times. Weekday 1=Monday through 5=Friday. This uses local time (not UTC) -- no timezone conversion needed.
- Do NOT set `RunAtLoad` to true -- we don't want the briefing to fire when the plist is loaded (it should only fire at the scheduled time). The test briefing in Phase 5 is triggered manually.
- Include `/opt/homebrew/bin` in PATH for Apple Silicon Macs where Homebrew installs there.

Expected: Plist file exists at `/Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.daily-briefing.plist` with valid XML.

If this fails: Check that `~/Library/LaunchAgents/` directory exists. Create with `mkdir -p /Users/${AGENT_USER}/Library/LaunchAgents`.

If already exists: Compare content. If unchanged, skip. If different, unload the old plist first (`launchctl bootout gui/${AGENT_USER_UID}/com.openclaw.daily-briefing 2>/dev/null`), then write new version and reload.

#### 3.2 Write EOD Summary Launchd Plist `[GUIDED]`

Same pattern as 3.1, but for the end-of-day summary.

Parse `${EOD_TIME}` to extract hour and minute. For `19:00`: Hour=19, Minute=0.

**Remote (use base64 encoding):**
```
echo '<base64-encoded-plist>' | base64 -d > /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.eod-summary.plist
```

The plist content must be:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.openclaw.eod-summary</string>
    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>/Users/${AGENT_USER}/.openclaw/workspace/scripts/eod-summary.js</string>
    </array>
    <key>StartCalendarInterval</key>
    <array>
        <dict>
            <key>Weekday</key>
            <integer>1</integer>
            <key>Hour</key>
            <integer>19</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <dict>
            <key>Weekday</key>
            <integer>2</integer>
            <key>Hour</key>
            <integer>19</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <dict>
            <key>Weekday</key>
            <integer>3</integer>
            <key>Hour</key>
            <integer>19</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <dict>
            <key>Weekday</key>
            <integer>4</integer>
            <key>Hour</key>
            <integer>19</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
        <dict>
            <key>Weekday</key>
            <integer>5</integer>
            <key>Hour</key>
            <integer>19</integer>
            <key>Minute</key>
            <integer>0</integer>
        </dict>
    </array>
    <key>StandardOutPath</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace/logs/briefing/eod-summary.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace/logs/briefing/eod-summary-error.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/${AGENT_USER}</string>
    </dict>
    <key>WorkingDirectory</key>
    <string>/Users/${AGENT_USER}/.openclaw/workspace</string>
</dict>
</plist>
```

Same adaptation notes as step 3.1 apply.

Expected: Plist file exists at `/Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.eod-summary.plist` with valid XML.

#### 3.3 Load Both Launchd Plists `[AUTO]`

Register both plists with launchd. **Level 1 -- exact syntax required.**

First, check if already loaded:

**Remote:**
```
launchctl list 2>/dev/null | grep com.openclaw.daily-briefing && echo 'MORNING_LOADED' || echo 'MORNING_NOT_LOADED'
launchctl list 2>/dev/null | grep com.openclaw.eod-summary && echo 'EOD_LOADED' || echo 'EOD_NOT_LOADED'
```

If either is `LOADED`, unload first:

**Remote:**
```
launchctl bootout gui/${AGENT_USER_UID}/com.openclaw.daily-briefing 2>/dev/null
launchctl bootout gui/${AGENT_USER_UID}/com.openclaw.eod-summary 2>/dev/null
```

Then load both:

**Remote:**
```
launchctl bootstrap gui/${AGENT_USER_UID} /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.daily-briefing.plist
launchctl bootstrap gui/${AGENT_USER_UID} /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.eod-summary.plist
```

Verify both are registered:

**Remote:**
```
launchctl list | grep com.openclaw.daily-briefing
launchctl list | grep com.openclaw.eod-summary
```

Expected: Both jobs appear with PID `-` (not currently running) and exit status (may be `-` if never run). Both are registered.

If this fails:
- **"Bootstrap failed: 5: Input/output error":** Plist has XML syntax errors. Validate with `plutil -lint /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.daily-briefing.plist`.
- **"Bootstrap failed: 37: Operation already in progress":** Already loaded. Bootout first, then bootstrap again.
- **Path errors in logs:** Check that the node path and script path in the plist are correct.

### Phase 4: TOOLS.md Integration

#### 4.1 Write TOOLS.md Entries `[GUIDED]`

Add entries to `${WORKSPACE}/TOOLS.md` so the agent knows how to trigger briefings on demand, check logs, and modify preferences.

Check if TOOLS.md exists:

**Remote:**
```
test -f ${WORKSPACE}/TOOLS.md && echo 'EXISTS' || echo 'NOT_FOUND'
```

If it exists, append the briefing section. If not, create it with the briefing section as the first content.

The TOOLS.md content to add (the operator should base64-encode this and write/append to the file):

````markdown

---

## Daily Briefing System

### Trigger Morning Briefing On Demand

When Dan asks for his morning brief outside the scheduled time ("give me my morning brief", "run the briefing", "what's my day look like"):

```bash
cd ${WORKSPACE} && node scripts/daily-briefing.js
```

The briefing will be generated and sent to Telegram. Output is also logged to `logs/briefing/YYYY-MM-DD-morning.json`.

### Trigger EOD Summary On Demand

When Dan asks for his end-of-day summary ("wrap up the day", "what did I accomplish today", "EOD summary"):

```bash
cd ${WORKSPACE} && node scripts/eod-summary.js
```

### Check Briefing Logs

To see the status of recent briefing runs:

```bash
ls -la ${WORKSPACE}/logs/briefing/*.json | tail -10
```

To read a specific day's log:

```bash
cat ${WORKSPACE}/logs/briefing/YYYY-MM-DD-morning.json | python3 -m json.tool
```

Look for the `"status"` field per section. If a section shows `"error"`, check the `"error"` field for details.

### Modify Briefing Preferences

The briefing config is at `${WORKSPACE}/config/briefing.json`. To change:

- **Delivery time:** Edit `schedule.morning.time` or `schedule.eod.time`. Then update the Hour/Minute in the launchd plist and re-bootstrap.
- **Enable/disable a section:** Toggle `sections.<sectionName>.enabled` to true/false.
- **Change AI model:** Edit `ai.synthesisModel` (e.g., switch to `claude-opus-4-20250514` for more depth).
- **Email urgency threshold:** Adjust `sections.emailDigest.maxUrgentItems`.
- **Follow-up stale threshold:** Adjust `sections.pendingFollowUps.staleDays`.

After editing the JSON, no restart is needed -- the scripts read config fresh on every run.

### Briefing Schedule

- Morning briefing: Weekdays at 5:30 AM (Mountain Time)
- EOD summary: Weekdays at 7:00 PM (Mountain Time)
- Managed by launchd (automatic, survives reboots)
- Launchd plists: `~/Library/LaunchAgents/com.openclaw.daily-briefing.plist` and `com.openclaw.eod-summary.plist`
````

**Remote (use base64 encoding):**

If TOOLS.md exists, append:
```
echo '<base64-encoded-tools-section>' | base64 -d >> ${WORKSPACE}/TOOLS.md
```

If TOOLS.md does not exist, create:
```
echo '<base64-encoded-tools-content>' | base64 -d > ${WORKSPACE}/TOOLS.md
```

Expected: TOOLS.md contains the Daily Briefing System section.

If already exists (the section, not just the file): Check for a "Daily Briefing" heading already present with `grep -c "Daily Briefing System" ${WORKSPACE}/TOOLS.md`. If it exists, the operator should replace that section rather than duplicating. Use `python3` to find and replace the section between `## Daily Briefing System` and the next `## ` heading (or EOF).

### Phase 5: Testing & Validation

**CRITICAL:** All testing happens on Ryan's Telegram account (ID: 7191564227, @ryanshuken) — NEVER on Dan's or Emily's accounts during testing. All tests use mock/sample data where possible. Only after full E2E validation passes does the operator switch delivery targets to production.

#### 5.0 Install Test Configuration `[GUIDED]`

Create a test-mode configuration that overrides delivery targets and uses sample data.

**Remote (base64 encode):**

Write `${WORKSPACE}/config/briefing-test.json`:

```json
{
  "_comment": "TEST MODE — delivers to Ryan (operator), uses sample data",
  "testMode": true,
  "delivery": {
    "dan": {
      "telegram": {
        "botTokenEnv": "TELEGRAM_BOT_TOKEN",
        "chatId": "7191564227"
      },
      "format": "concise",
      "maxChars": 2000
    },
    "emily": {
      "telegram": {
        "botTokenEnv": "TELEGRAM_BOT_TOKEN",
        "chatId": "7191564227"
      },
      "format": "detailed",
      "maxChars": 6000
    }
  },
  "mockData": {
    "enabled": true,
    "calendar": [
      {
        "title": "Series B Discussion",
        "start": "09:00",
        "end": "10:00",
        "attendees": ["john.smith@sequoiacap.com", "connor@crusoeventures.com"],
        "location": "Google Meet",
        "meetLink": "https://meet.google.com/test-abc"
      },
      {
        "title": "NextGen Board Call",
        "start": "11:00",
        "end": "12:00",
        "attendees": ["dan@crusoeventures.com", "sabrina@crusoeventures.com"],
        "location": "Virtual",
        "meetLink": "https://meet.google.com/test-def"
      },
      {
        "title": "New Founder Intro",
        "start": "14:00",
        "end": "15:00",
        "attendees": ["unknown.founder@startup.com"],
        "location": "WeWork Boulder, 1035 Pearl St",
        "meetLink": null
      },
      {
        "title": "Internal Sync with Cody",
        "start": "16:00",
        "end": "16:30",
        "attendees": ["cody@crusoeventures.com"],
        "location": "Office",
        "internal": true,
        "moveable": true
      }
    ],
    "emails": [
      { "id": "test-1", "from": "lp-fund3@example.com", "subject": "Capital Call Notice - Q2 2026", "urgency": "urgent" },
      { "id": "test-2", "from": "legal@portfolioco.com", "subject": "Board Resolution Review Required", "urgency": "urgent" },
      { "id": "test-3", "from": "sarah@foundation.org", "subject": "Re: Sundance Invite Follow-up", "urgency": "important" },
      { "id": "test-4", "from": "newsletter@techcrunch.com", "subject": "TechCrunch Daily", "urgency": "low" },
      { "id": "test-5", "from": "vendor@saas.com", "subject": "Invoice #4521 - Payment Due", "urgency": "normal" }
    ],
    "contacts": [
      { "name": "John Smith", "email": "john.smith@sequoiacap.com", "title": "Managing Director", "company": "Sequoia Capital", "tags": ["investor", "Sundance", "politics"], "lastInteraction": "2026-03-15", "preferredEmail": "john.smith@sequoiacap.com", "eaEmail": "jane.doe@sequoiacap.com", "eaName": "Jane Doe" },
      { "name": "Connor", "email": "connor@crusoeventures.com", "title": "Analyst", "company": "Crusoe Ventures", "tags": ["internal"], "lastInteraction": "2026-03-29" }
    ],
    "actionItems": [
      { "title": "Respond to LP capital call", "dueDate": "2026-03-27", "status": "overdue", "priority": "high" },
      { "title": "Review board deck for NextGen", "dueDate": "2026-03-30", "status": "due_today", "priority": "high" },
      { "title": "Send Sundance invite to Sarah", "dueDate": "2026-03-30", "status": "due_today", "priority": "medium" }
    ],
    "nightmanResults": {
      "calendarEnrichment": {
        "meetLinksAdded": 0,
        "travelTimeAdded": [{ "meeting": "New Founder Intro", "travelMinutes": 25, "parking": "WeWork garage, $12/hr, Walnut St entrance" }],
        "issues": []
      },
      "contactResearch": {
        "newContacts": [{ "email": "unknown.founder@startup.com", "status": "research_pending", "source": "Connor intro email 2026-03-29" }]
      },
      "draftFollowUps": [
        { "subject": "Re: Capital Call Notice", "to": "lp-fund3@example.com", "body": "Thank you for the notice. We will wire the funds by...", "reason": "3 days overdue, no response from Dan" }
      ]
    }
  }
}
```

The script must check for `--test` flag or `BRIEFING_TEST_MODE=true` env var. When in test mode:
- Load `briefing-test.json` instead of `briefing.json` for delivery targets and mock data
- Use mock data instead of calling live calendar/email/Notion APIs
- Prefix all Telegram messages with "[TEST MODE]"
- Still run the full pipeline: synthesis, accuracy agent, quality evaluator — using mock data as the "source" for verification
- Log to `${WORKSPACE}/logs/briefing/test-YYYY-MM-DD-morning.json`

#### 5.1 Validate Plist Syntax `[AUTO]`

Confirm both plists are valid XML.

**Remote:**
```
plutil -lint /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.daily-briefing.plist
plutil -lint /Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.eod-summary.plist
```

Expected: Both return `OK`.

#### 5.2 Test 1: Telegram Connectivity `[AUTO]`

Verify the bot can send messages to Ryan's test account before running the full pipeline.

**Remote:**
```
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -d "chat_id=7191564227" \
  -d "text=[TEST] Edge Briefing System - Telegram connectivity test" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('OK' if d.get('ok') else f'FAIL: {d}')"
```

Expected: `OK` and Ryan receives the test message.

If this fails: Check bot token. The bot may need to have a conversation started with Ryan first (Ryan sends `/start` to the bot).

#### 5.3 Test 2: Mock Data Morning Briefing (Full Pipeline) `[GUIDED]`

Run the complete morning briefing pipeline using mock data, delivering to Ryan.

**Remote:**
```
cd ${WORKSPACE} && BRIEFING_TEST_MODE=true node scripts/daily-briefing.js --test 2>&1
```

**What to verify (go/no-go checklist):**

| # | Check | Expected | Go/No-Go |
|---|-------|----------|----------|
| 1 | Script exits cleanly | Exit code 0 | REQUIRED |
| 2 | Dan's concise version delivered to Ryan's Telegram | Message received, prefixed with [TEST MODE] | REQUIRED |
| 3 | Emily's detailed version delivered to Ryan's Telegram | Message received, prefixed with [TEST MODE] | REQUIRED |
| 4 | Dan's version under 2,000 chars | Count characters in received message | REQUIRED |
| 5 | Emily's version under 6,000 chars | Count characters | REQUIRED |
| 6 | Calendar events match mock data | 4 meetings with correct times, attendees | REQUIRED |
| 7 | Attendee dossier for John Smith includes title + company + tags | "Managing Director, Sequoia Capital, Sundance, politics" | REQUIRED |
| 8 | Unknown founder flagged | "no CRM record — research pending" | REQUIRED |
| 9 | Internal meeting marked moveable | "Cody (moveable)" | REQUIRED |
| 10 | Accuracy agent ran | Log shows verification results | REQUIRED |
| 11 | All mock contact data verified correctly by accuracy agent | claims_corrected = 0 for mock data (data is intentionally correct) | REQUIRED |
| 12 | Quality evaluator ran | Log shows evaluator scores | REQUIRED |
| 13 | Quality evaluator passed | Weighted average >= 0.7 | REQUIRED |
| 14 | Draft follow-up email included in Emily's version | LP capital call draft | REQUIRED |
| 15 | Nightman results incorporated | Travel time for WeWork meeting, parking info | REQUIRED |
| 16 | Log file created | `logs/briefing/test-YYYY-MM-DD-morning.json` exists with full structured data | REQUIRED |
| 17 | Log includes token usage | `ai.synthesisTokens`, `ai.accuracyTokens`, `ai.evaluatorTokens` all present | REQUIRED |

**All 17 checks must PASS before proceeding to live data testing.**

#### 5.4 Test 3: Mock Data EOD Summary `[GUIDED]`

Same pattern for EOD.

**Remote:**
```
cd ${WORKSPACE} && BRIEFING_TEST_MODE=true node scripts/eod-summary.js --test 2>&1
```

Verify: message delivered to Ryan's Telegram, structured log created, all sections present.

#### 5.5 Test 4: Live Data Dry Run (Ryan Only) `[GUIDED]`

After mock data tests pass, run with LIVE calendar/email/Notion data but deliver to Ryan's Telegram (not Dan/Emily).

**Remote:**
```
cd ${WORKSPACE} && BRIEFING_DRY_RUN_TARGET=7191564227 node scripts/daily-briefing.js 2>&1
```

The `BRIEFING_DRY_RUN_TARGET` env var overrides all delivery targets to Ryan's Telegram. Uses real data sources but safe delivery.

**What to verify:**

| # | Check | Expected |
|---|-------|----------|
| 1 | Real calendar events appear | Today's actual meetings on Dan's calendar |
| 2 | Real attendees looked up in Notion | Contact data from actual People DB |
| 3 | Real email count accurate | Matches what Himalaya reports |
| 4 | Accuracy agent catches real issues | May flag outdated titles, missing contacts |
| 5 | No message sent to Dan or Emily | Only Ryan receives |
| 6 | Sensitive data stays in Telegram (not logged to stdout) | API keys, email bodies not in console output |

#### 5.6 Test 5: Accuracy Agent Stress Test `[GUIDED]`

Intentionally feed the generator bad data to verify the accuracy agent catches errors.

Create `${WORKSPACE}/config/briefing-accuracy-test.json` with deliberately wrong mock data:

```json
{
  "testMode": true,
  "accuracyStressTest": true,
  "mockData": {
    "contacts": [
      { "name": "John Smith", "title": "Partner", "company": "Sequoia Capital", "_correct_title": "Managing Director" },
      { "name": "Jane Doe", "company": "Acme Corp", "_correct_company": "Acme Ventures (renamed 2025)" }
    ],
    "calendar": [
      { "title": "Meeting", "start": "09:00", "_note": "Generator may say 9 AM but mock source says 09:30 - accuracy agent should catch" }
    ]
  }
}
```

**Run:**
```
cd ${WORKSPACE} && BRIEFING_TEST_CONFIG=briefing-accuracy-test.json node scripts/daily-briefing.js --test 2>&1
```

**Expected:** Accuracy agent returns `status: "corrected"` with at least 1 correction. Verify the correction appears in the log and the delivered briefing has the corrected data.

#### 5.7 Go-Live Checklist `[HUMAN_APPROVAL]`

Before switching delivery targets from Ryan to Dan/Emily:

| # | Requirement | Status |
|---|------------|--------|
| 1 | All 17 mock data checks passed (5.3) | [ ] |
| 2 | EOD mock test passed (5.4) | [ ] |
| 3 | Live data dry run reviewed by Ryan (5.5) | [ ] |
| 4 | Accuracy stress test passed (5.6) | [ ] |
| 5 | Ryan reviewed both Dan's and Emily's briefing formats | [ ] |
| 6 | Emily's Telegram account configured | [ ] |
| 7 | No sensitive data leaked to logs or stdout | [ ] |
| 8 | Launchd plists validated and loaded | [ ] |
| 9 | Ryan approves go-live | [ ] |

**Only after ALL boxes are checked:** Update `briefing.json` to replace Ryan's Telegram ID with Dan's and Emily's actual IDs. The script reads config fresh every run — no restart needed.

### Phase 6: Rollback

If something goes wrong after go-live:

**Immediate (stop delivery):**
```
launchctl bootout gui/${AGENT_USER_UID}/com.openclaw.daily-briefing
launchctl bootout gui/${AGENT_USER_UID}/com.openclaw.eod-summary
```

**Switch back to test mode:**
Edit `briefing.json` and replace Dan/Emily's chat IDs with Ryan's (7191564227).

**Full rollback:**
```
rm ${WORKSPACE}/scripts/daily-briefing.js ${WORKSPACE}/scripts/eod-summary.js
rm ${WORKSPACE}/config/briefing.json
launchctl bootout gui/${AGENT_USER_UID}/com.openclaw.daily-briefing 2>/dev/null
launchctl bootout gui/${AGENT_USER_UID}/com.openclaw.eod-summary 2>/dev/null
rm ~/Library/LaunchAgents/com.openclaw.daily-briefing.plist
rm ~/Library/LaunchAgents/com.openclaw.eod-summary.plist
```

#### 5.6 Verify Launchd Jobs Are Registered `[AUTO]`

Confirm both scheduled jobs are visible to launchd.

**Remote:**
```
launchctl list | grep com.openclaw.daily-briefing && launchctl list | grep com.openclaw.eod-summary
```

Expected: Both jobs appear. The PID column will show `-` (not currently running, which is correct -- they only run at scheduled times). The exit status may show `-` (never run) or `0` (last run succeeded).

If either is missing: Re-bootstrap the plist (step 3.3).

## Verification

After all phases complete, the full verification checklist:

1. **Config file**: `${WORKSPACE}/config/briefing.json` exists with valid JSON, correct sections, correct delivery target
2. **Morning script**: `${WORKSPACE}/scripts/daily-briefing.js` exists, runs without errors, sends Telegram message
3. **EOD script**: `${WORKSPACE}/scripts/eod-summary.js` exists, runs without errors, sends Telegram message
4. **Morning plist**: `/Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.daily-briefing.plist` exists, valid XML, loaded in launchd
5. **EOD plist**: `/Users/${AGENT_USER}/Library/LaunchAgents/com.openclaw.eod-summary.plist` exists, valid XML, loaded in launchd
6. **TOOLS.md**: Contains Daily Briefing System section with on-demand commands
7. **Log files**: `${WORKSPACE}/logs/briefing/` contains today's run logs
8. **Telegram**: Dan received the test briefing message
9. **Graceful degradation**: If any data source is unavailable, the briefing still sends with available sections (not a total failure)

**Remote (comprehensive check):**
```
printf "Config: " && test -f ${WORKSPACE}/config/briefing.json && echo "OK" || echo "MISSING"
printf "Morning script: " && test -f ${WORKSPACE}/scripts/daily-briefing.js && echo "OK" || echo "MISSING"
printf "EOD script: " && test -f ${WORKSPACE}/scripts/eod-summary.js && echo "OK" || echo "MISSING"
printf "Morning plist: " && launchctl list 2>/dev/null | grep -q com.openclaw.daily-briefing && echo "LOADED" || echo "NOT LOADED"
printf "EOD plist: " && launchctl list 2>/dev/null | grep -q com.openclaw.eod-summary && echo "LOADED" || echo "NOT LOADED"
printf "TOOLS.md: " && grep -q "Daily Briefing" ${WORKSPACE}/TOOLS.md 2>/dev/null && echo "OK" || echo "MISSING"
printf "Logs dir: " && test -d ${WORKSPACE}/logs/briefing && echo "OK" || echo "MISSING"
printf "Today's log: " && test -f ${WORKSPACE}/logs/briefing/$(date +%Y-%m-%d)-morning.json && echo "OK" || echo "NOT YET"
```

Expected: All items show OK/LOADED.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Script crashes with "Cannot find module" | `@anthropic-ai/sdk` not installed | `cd ${WORKSPACE} && npm install @anthropic-ai/sdk` |
| "ANTHROPIC_API_KEY not found" | Missing from `.env` | Add to `${WORKSPACE}/.env`. Verify key starts with `sk-ant-api03-`. |
| Telegram delivery fails (HTTP 400) | Bad chat_id or malformed Markdown | Verify `TELEGRAM_CHAT_ID` is a bare integer. Script should auto-retry without parse_mode on Markdown failure. Test: `curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" -d "chat_id=${TELEGRAM_CHAT_ID}" -d "text=test"` |
| Telegram delivery fails (HTTP 401) | Invalid bot token | Verify `TELEGRAM_BOT_TOKEN` format: `NNNNNNN:AAxxxxxxxxxx`. Regenerate via BotFather if expired. |
| Calendar section empty when meetings exist | `gog` not in launchd PATH | Add the directory containing `gog` to the PATH in the launchd plist `EnvironmentVariables`. Re-bootstrap the plist. |
| Notion lookups fail | API key expired or bot removed from database | Test: `node ${WORKSPACE}/tools/notion-read.js people --limit 1`. Re-check integration at https://www.notion.so/my-integrations. |
| Email section fails | `himalaya` or `gog mail` not configured | Verify email CLI works: `himalaya list --folder INBOX -s 1` or `gog mail list --max-results 1`. Ensure the CLI binary is in the launchd PATH. |
| Briefing not firing at scheduled time | Plist not loaded or machine asleep | Check `launchctl list \| grep daily-briefing`. If missing, re-bootstrap. If machine was asleep, launchd will fire the job when it wakes if the scheduled time has passed. |
| Script works manually but fails via launchd | PATH difference between shell and launchd | Launchd has a minimal PATH. Ensure the plist `EnvironmentVariables` PATH includes all required directories (node, gog, himalaya, etc.). Check `${WORKSPACE}/logs/briefing/daily-briefing-error.log` for "command not found" errors. |
| Context overflow / growing memory | Running as OpenClaw session instead of standalone | **This is the v1 bug.** Verify the script is being run as `node scripts/daily-briefing.js`, NOT as an OpenClaw prompt. The launchd plist ProgramArguments should be `[node, script.js]`, not `[openclaw, ...]`. |
| Briefing has stale data | Cached or rate-limited data | Each run queries live data -- there is no cache layer. If Notion queries are timing out, check rate limits in notion.json. If calendar is stale, verify OAuth token: `gog auth status`. |
| Log files filling disk | `retainDays` cleanup not running | Check the cleanup logic in the scripts. Manual cleanup: `find ${WORKSPACE}/logs/briefing -name '*.json' -mtime +30 -delete`. |
| Email triage classifies everything as "normal" | Haiku model too conservative | Review the system prompt for the triage model. Consider adjusting to give more context about what Dan considers urgent (deals, board matters, portfolio emergencies). |

## Autonomy Mode Behavior

| Step | Auto | Guided | Manual |
|------|------|--------|--------|
| 1.1 Create directories | Execute silently | Execute silently | Show command, confirm |
| 1.2 Verify env vars | Execute, add missing | Confirm before adding | Show each command |
| 1.3 Write briefing config | Execute silently | Review config JSON, confirm | Show full JSON, confirm |
| 2.1 Install daily-briefing.js | Execute silently | Confirm script installation | Review script, confirm |
| 2.2 Install eod-summary.js | Execute silently | Confirm script installation | Review script, confirm |
| 2.3 Install shared utils | Execute if chosen | Confirm approach (shared vs standalone) | Review code, confirm |
| 3.1-3.2 Write plists | Execute silently | Review plist content, confirm | Show full XML, confirm |
| 3.3 Load plists | Execute silently | Confirm loading | Show each command |
| 4.1 Write TOOLS.md | Execute silently | Review content, confirm | Show content, confirm |
| 5.1 Validate plists | Execute silently | Execute silently | Show output |
| 5.2 Test morning briefing | Execute, report result | Execute, review output | Confirm, review together |
| 5.3 Verify Telegram | Check automatically | Ask Dan to confirm | Ask Dan to confirm |
| 5.4 Verify logs | Execute silently | Execute, show log summary | Show full log |
| 5.5 Test EOD summary | Execute, report result | Execute, review output | Confirm, review together |
| 5.6 Verify launchd | Execute silently | Execute, show status | Show output |

## Dependencies

- **Depends on:** `deploy-google-workspace.md` (calendar + email CLIs), `deploy-messaging-setup.md` (Telegram bot token), `deploy-identity.md` (agent persona)
- **Enhanced by:** `deploy-notion-workspace.md` (attendee dossiers, task queries, follow-up tracking), `deploy-fathom-pipeline.md` (meeting transcripts for EOD context), `deploy-personal-crm.md` (legacy CRM -- Notion replaces this for Dan)
- **Required by:** None (this is a consumer of other systems' data)
- **Replaces:** `deploy-daily-briefing.md` (BLOCKED -- relies on nonexistent `openclaw cron` and `openclaw config set` commands)

## Architecture Decision Records

### ADR-1: Standalone Node.js vs OpenClaw Session

**Decision:** Scripts run as standalone Node.js processes, not OpenClaw sessions.

**Context:** The v1 implementation ran the briefing as an OpenClaw prompt/session. After 3+ daily runs, the accumulated context caused the session to overflow, producing degraded or failed briefings.

**Consequences:**
- Each run is a fresh process with zero accumulated state
- Scripts use `@anthropic-ai/sdk` directly for Claude API calls
- No dependency on OpenClaw being running or healthy
- Scripts can be debugged, tested, and run independently
- Cost is slightly higher (no shared session context), but reliability is dramatically better

### ADR-2: Claude Sonnet for Synthesis, Haiku for Triage

**Decision:** Use Claude Sonnet for briefing synthesis, Claude Haiku for email urgency triage.

**Context:** The briefing runs twice daily. Opus would produce marginally better prose but at significantly higher cost. Sonnet produces excellent briefings at a fraction of the cost. Haiku is used only for email triage (classifying urgency from subject lines), where speed matters more than depth.

**Estimated daily cost:** ~$0.05-0.15 per day (2 Sonnet calls + 1-2 Haiku calls).

### ADR-3: Launchd over Crontab

**Decision:** Use launchd `StartCalendarInterval` for scheduling on macOS.

**Context:** `crontab -` hangs indefinitely on macOS 15.x (Sequoia) via remote PTY due to TCC permissions. Launchd is the native macOS scheduler, survives reboots, and fires missed jobs when the machine wakes from sleep.

### ADR-4: Each Section Has Try/Catch

**Decision:** Every data-gathering section is wrapped in its own error handler.

**Context:** A VC MD's morning briefing must never completely fail because one data source is down. If Notion is unreachable, the calendar and email sections should still deliver. The briefing degrades gracefully -- missing sections are noted, but available data is always delivered.

### ADR-5: execFileSync over execSync

**Decision:** Use `execFileSync` (with arguments as an array) instead of `execSync` (shell string) for invoking CLI tools.

**Context:** `execFileSync` passes arguments directly to the executable without shell interpolation, preventing command injection from malformed data (e.g., a calendar event title containing shell metacharacters). The commands invoked (`gog`, `himalaya`, `node`) and their arguments are known at config time, making `execFileSync` with an args array the correct choice.
