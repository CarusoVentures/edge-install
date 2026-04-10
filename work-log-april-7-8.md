# Edge Deployment — Work Log
## April 7-8, 2026 | Ryan Shuken, Proletariat Consulting

---

## Overview

Two full working sessions deploying Edge, Dan Caruso's AI executive assistant, on a Mac Mini M4 Pro. Edge runs 24/7, communicates via Telegram, and serves Dan (concise, action-oriented) and Emily (his EA, detailed operational view with approval workflow).

**Total code written:** ~10,000 lines across 12 lib modules, 12 tools, 20 scripts
**Total tools available:** 100+ (local scripts + MCP integrations for Notion, Gmail, Calendar, Slack, Linear)
**Cache entries:** 371 active (359 contact dossiers, 3 pre-computed AI answers, 3 project analyses)
**CRM:** 6,161 contacts, 549 with priority, 170 Very High

---

## Day 1 — April 7: The Foundation

### What We Built

#### 1. Briefing v6 "Jarvis" Architecture (scripts/daily-briefing.js — 425 lines)
**What it does:** Generates personalized morning briefings for Dan and Emily, delivered to Telegram.
**Why:** Dan needs a 30-second status check on his phone at 5:30 AM. Emily needs a detailed operational view with drill-down buttons and approval cards.
**How:** Reads Nightshift output from `data/nightshift/YYYY-MM-DD/`, gets live calendar (with travel + scheduling classification), email analysis, task analysis. Dan sees: status + schedule + action items + "Edge is ahead." Emily gets: hub with drill-down buttons + approval cards. Error DB + Ryan alerts on failure.

#### 2. Ten Shared Library Modules (~3,200 lines)
All at `/Users/edge/.openclaw/workspace/lib/`:

| Module | Lines | What It Does | Why It Matters |
|--------|-------|-------------|----------------|
| **learning.js** | 293 | Reinforcement learning engine. SQLite-backed, KG-integrated. Records Emily's decisions, predicts future ones. | Edge learns from every correction. If Emily moves a meeting twice, Edge predicts it next time. |
| **scheduling.js** | 173 | Meeting classification: ALWAYS FIXED / HARD TO MOVE / CAN BE MOVED / EASY TO MOVE. | Emily only gets asked about meetings that actually need decisions — not every team standup. |
| **travel.js** | 156 | Google Maps Directions + Places API. Live traffic, parking, departure time. | Dan never walks into a meeting without knowing travel time and where to park. |
| **email-intel.js** | 359 | Thread-based email analysis. Groups by subject, enriches with CRM + KG. Detects VIP, developing threads, dormant reactivation. | Edge catches when a Very High priority contact emails — even if their name is abbreviated. |
| **task-intel.js** | 378 | Task intelligence from Notion. Detects OVERDUE, DUE_TODAY, INCOMPLETE, STALE. Project detection. Follow-up suggestions. | Found 2 overdue tasks, 2 stale tasks, and generated 11 follow-up suggestions in the first run. |
| **telegram.js** | 284 | Delivery with auto-chunking. Inline keyboard buttons. sendSchedulingCard, sendTaskCard, sendEmailCard. | Every card Emily gets has action buttons — not text walls. Short labels, "Edge will:" context in message body. |
| **three-steps-ahead.js** | 194 | Proactive intelligence. Takes a topic, researches via CRM+KG, identifies next 3 logical steps. | Dan doesn't just get status — Edge tells him what to do next. Pre-built overnight. |
| **design-system.js** | 334 | Shared formatting. EMOJI constants, day status assessment, Dan/Emily message builders. | Consistent look across all skills. Green/yellow/red day assessment. |
| **cache.js** | 181 | SQLite response cache with TTL. 0.05s retrieval vs 10-24s AI. | Dan asks "What's on my calendar?" — answer in 50 milliseconds, not 24 seconds. |
| **anticipate.js** | 275 | Overnight anticipation engine. 7 phases of pre-computation. | Everything Dan might ask in the morning is already computed and cached. |
| **formatter.js** | 155 | Cleans raw tool output. Emails→names, duplicate time formats removed, Video→camera emoji. | Dan sees "Cody, Connor" not "cody@carusoventures.com, connor@carusoventures.com". |

#### 3. Fast Tools (tools/ directory — 1,419 lines)

| Tool | Speed | What It Does |
|------|-------|-------------|
| **fast-answer.js** | 0.05s | Cache-first answer tool. Pattern matches question → cached answer. Falls through to AI on miss. |
| **quick-calendar.js** | 2s | Google Calendar via service account. No OAuth. |
| **quick-tasks.js** | 0.04s | Notion tasks from local cache. |
| **quick-dashboard.js** | 0.1s | Full team dashboard (78 tasks) from local cache. |
| **quick-contact.js** | 0s | CRM search from local SQLite. |
| **check-priority-emails.js** | 5s | Batch email + CRM cross-reference with fuzzy name matching. |
| **update-contact-priority.js** | 10s | Updates Notion Dan Priority + resyncs CRM. Single command. |

#### 4. OpenClaw Skills (4 skills at ~/.agents/skills/)
- **fast-answer** — "Try this FIRST" for all common questions
- **email-priority** — Batch email priority check
- **calendar-check** — Google Calendar via service account ("DO NOT use gog")
- **contact-lookup** — CRM search + priority update

#### 5. OpenClaw Plugin (extensions/edge-callbacks/)
Callback handler for Emily's Telegram button taps. Processes `sched:`, `task:`, `email:` callback namespaces. Records decisions to learning.js.

### Key Fixes (Day 1)

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| **CRM priority coverage 2%** | Only checking `Dan Priority` field, ignoring 6 other priority columns | `computeEffectivePriority()` checks 7+ Notion columns. Coverage: 2% → 9% (549 contacts). |
| **Steve Cohen missed** | His `Very High Net Worth` checkbox was set, but `Dan Priority` was blank | Updated Notion Dan Priority to "1. Very High". Fixed CRM sync to check all priority signals. |
| **Ken Gart not found** | Email showed "K. Gart & A. Gart" — CRM couldn't match | Fuzzy matching: splits on "&", tries last names, expands abbreviations. |
| **gog OAuth broken** | Default OAuth client not verified by Google | Created custom OAuth client `edge` in edge-agent GCP project. Internal Workspace app = no verification needed. |
| **Edge ignores fast tools** | Edge uses gog (broken) instead of service account tools | SOUL.md tool priority rules. Skill descriptions say "IMMEDIATELY run this command." Calendar skill says "DO NOT use gog." |
| **Response times 10-24 seconds** | Every question goes through full AI pipeline | Built SQLite caching layer. Pre-compute answers overnight. 0.05s for cached answers. |
| **Button text overflows** | Telegram truncates long inline button text | All buttons use short labels: `[Do it] [Edit] [Skip]`. Detail goes in message body. |
| **Formatting awful** | Raw tool output with emails, duplicate times, no structure | formatter.js cleans everything before caching. Names not emails. Clean times. |

### Skill Audit Results (Day 1)
All 10 skill tests passing:
- email-priority: 10s, finds all VIPs
- contact-lookup: 12s, finds contacts
- calendar-check: 24s, full schedule
- notion tasks: 15s, correct task list
- contact update: 9s, updates Notion + CRM
- himalaya read: 18s, reads emails
- notion people: 18s, finds contacts
- weather: 15s
- tavily search: 39s
- CRM semantic: 34s, found Wade Arnold (fintech Austin)

---

## Day 2 — April 8: The Engine & Intelligence Layer

### What We Built

#### 1. Nightshift Engine (scripts/nightshift.js — 701 lines)
**What it does:** The overnight orchestrator that powers everything. Runs 8 phases between 10 PM and 5:30 AM, pre-computing every answer Dan might need in the morning.

**Why:** Ryan's key insight: "we should be nightly adding everything we know about our contacts so it's easy to retrieve and detailed and up to date. We want lots of this work to happen at night."

**The 8 Phases:**

| Phase | What It Does | Time | Results |
|-------|-------------|------|---------|
| 1. Evening Plan | Announces tonight's work to Telegram | 3s | 8 meetings tomorrow, 61 tasks |
| 2. Contact Dossiers | Builds rich profiles for all priority contacts + calendar attendees | 12 min | 163 priority contacts + 10 attendees enriched |
| 3. Calendar Enrichment | Travel time, missing Meet link detection | 3s | 0 travel items, flagged calendar issues |
| 4. Task Processing | Overdue detection, follow-up suggestions via task-intel | 4s | 2 overdue, 2 stale, 11 follow-ups |
| 5. Email Digest | VIP cross-reference, thread analysis | 5s | 6 urgent emails, 10 threads analyzed |
| 6. Common Questions | AI-synthesized answers to "What should I focus on?", "Any fires?", "Prep for tomorrow?" | 41s | 3 answers pre-computed |
| 7. Three Steps Ahead | Top 3 projects get proactive next-move analysis | 49s | Boulder Roots, Bifrost, Ensuring Colorado |
| 8. Morning Summary | What was accomplished, delivered to Telegram | instant | 371 cache entries ready |

**Full test run:** 879 seconds (14.6 minutes), 0 errors. All data stored in `data/nightshift/YYYY-MM-DD/` + SQLite cache.

#### 2. Contact Dossier Builder (lib/dossier-builder.js — 489 lines)
**What it does:** Builds rich contact profiles from 4 sources: CRM (SQLite), Knowledge Graph (Neo4j), Email (Himalaya IMAP), and Notion (tasks).

**Why:** When Dan asks "Who is Steve Cohen?" the answer should be rich and instant — not a 15-second AI lookup. Pre-built overnight, served from cache in 0.05 seconds.

**Example output (from cache):**
```
Steve Cohen
Very High Priority | Cold — minimal history
sac@tac-denver.com | linkedin.com/in/steven-cohen-40907411

Recent threads:
  • RE: Ensuring Colorado's Innovative Future (2026-04-07)
```

**Functions:**
- `buildOne(name)` — Single dossier from CRM + KG + Email + Notion (~3 seconds)
- `buildBatch({ limit: 170 })` — All priority contacts (~12 minutes)
- `buildForCalendar('tomorrow')` — External attendees for tomorrow's meetings
- `lookup(name)` — Flexible cache lookup (instant, used by fast-answer.js)

#### 3. Fast-Answer Upgrades (tools/fast-answer.js — 148 lines)
**What changed:**
- Pre-computed AI answers checked FIRST (before raw data)
- "What should I focus on?" → AI-synthesized answer with specific actions, not raw task list
- "Who is Steve Cohen?" → pre-built dossier from cache (0.05s), falls back to live CRM
- "Any fires?" → concise AI answer about real issues

**Before vs After:**

| Question | Before | After |
|----------|--------|-------|
| "Who is Steve Cohen?" | Raw CRM: name, email, company | Rich dossier: priority, relationship state, email threads, LinkedIn |
| "What should I focus on?" | Raw task list (10 items) | "Three things: (1) Ken Gart signature page, (2) Danielle Lloyd Post Nup docs, (3) Frost Carbon overdue" |
| "Any fires?" | CACHE_MISS → 15s AI call | "Three fires: Frost Carbon overdue, Danielle Lloyd legal docs unread, Ken Gart signature unconfirmed" |
| "Prep for tomorrow?" | CACHE_MISS → 15s AI call | "Two things: Eric Cornell podcast prep, Nuggets game logistics with Kendall" |

#### 4. The "Never Say I Can't" Fix

**The Incident:** Dan asked Edge to create a Notion view. Edge said "Notion's API doesn't support creating database views programmatically" and told Dan to do it himself. **Edge had the `notion-create-view` MCP tool the entire time.**

**Root Cause Analysis:**
1. Edge hallucinated a limitation from outdated training data
2. No rule in SOUL.md about checking tools before declining
3. TOOLS.md didn't list MCP tools
4. Edge had no awareness of its own capabilities

**The Comprehensive Fix:**

| What | File | Details |
|------|------|---------|
| **5-step confidence check** | SOUL.md | Mandatory before saying "I can't": (1) Check TOOLS-INVENTORY.md, (2) Check MCP tools, (3) Check local scripts, (4) Try it, (5) Only then report limitation with alternative |
| **Banned phrases** | SOUL.md | "The API doesn't support that", "That's not possible", "You'll need to do that yourself", "I can't" without trying |
| **Tool inventory** | TOOLS-INVENTORY.md (new, 208 lines) | Every tool Edge has, organized by domain. Notion: 16 tools, Gmail: 7, Calendar: 9, Slack: 13, Linear: 26, Playwright: 21 |
| **TOOLS.md update** | TOOLS.md | Added MCP tool counts, pointed to full inventory |
| **Decision framework** | SOUL.md | Added "Try first, report second" as core principle |
| **Notion capabilities** | SOUL.md | Explicit: "You CAN create views, update views, query views, create pages..." |

**Proof it works:** Created the "Edge" view Dan asked for on the Persons Directory — one MCP call, 2 seconds. Table view with Name, Email, Colorado checkbox, Dan Priority, sorted by priority.

**DM sent to Dan** explaining what went wrong, what Ryan fixed, and asking for feedback on the view.

---

## Architecture Summary

```
NIGHTSHIFT (10 PM - 5:30 AM, every 30 min)
  → Phase 1: Evening plan announcement
  → Phase 2: 170 contact dossiers (CRM + KG + Email + Notion)
  → Phase 3: Calendar enrichment (travel, Meet links)
  → Phase 4: Task processing (overdue, stale, follow-ups)
  → Phase 5: Email digest (VIP cross-reference, threads)
  → Phase 6: Pre-compute AI answers ("Focus?", "Fires?", "Prep?")
  → Phase 7: Three steps ahead (top 3 projects)
  → Phase 8: Morning summary → Telegram

CACHE (SQLite, 371 entries, refreshed overnight + every 5 min)
  → calendar:today, calendar:tomorrow
  → email:priority
  → tasks:dan, tasks:dashboard, tasks:analysis
  → contact:<name> (359 pre-built dossiers)
  → question:focus-today, question:fires, question:tomorrow-prep
  → project:<name>-next (three-steps-ahead analyses)

FAST-ANSWER (0.05 seconds)
  → Dan asks question → check cache → instant answer
  → AI-synthesized answers preferred over raw data
  → Cache miss → "Looking into that..." → fall through to AI

EDGE SKILLS (2-24 seconds, AI pipeline)
  → email-priority, calendar-check, contact-lookup, fast-answer
  → Uses 12 lib modules for intelligence

LIB MODULES (shared infrastructure, 3,269 lines)
  → learning, scheduling, travel, email-intel, task-intel
  → telegram, three-steps-ahead, design-system
  → cache, anticipate, formatter, dossier-builder

MCP INTEGRATIONS (100+ tools)
  → Notion (16), Gmail (7), Calendar (9), Slack (13)
  → Linear (26), Playwright (21), Supabase, Vercel

SOUL.md (Edge's behavioral rules)
  → Decision framework: try first, report second
  → 5-step "Can I Do This?" check before declining
  → Tool priority: fast-answer FIRST, then skills, then AI
  → Banned phrases: never say "I can't" without trying
```

---

## Key Metrics

| Metric | Before | After |
|--------|--------|-------|
| Response time (common questions) | 10-24 seconds | 0.05 seconds |
| Contact dossier richness | Name + email only | Name, title, company, priority, relationship state, email threads, LinkedIn, tasks |
| CRM priority coverage | 2% (153 contacts) | 9% (549 contacts) |
| Pre-built dossiers | 0 | 163 (all Very High priority) |
| Cache entries | 5 (basic) | 371 (contacts + questions + projects) |
| Overnight work | Nothing (skeleton script) | 8-phase engine, 14.6 min runtime, 0 errors |
| Tool awareness | Incomplete, no MCP tools listed | 100+ tools documented in TOOLS-INVENTORY.md |
| "I can't" protection | None | 5-step mandatory check + banned phrases |
| Skills passing audit | 0 | 10/10 |

---

## Files Created / Modified

### New Files (Day 2)
- `lib/dossier-builder.js` — Contact dossier builder (489 lines)
- `TOOLS-INVENTORY.md` — Comprehensive tool inventory (208 lines)

### Major Rewrites (Day 2)
- `scripts/nightshift.js` — Skeleton → full 8-phase engine (701 lines)
- `tools/fast-answer.js` — Added dossier cache, pre-computed questions, priority reordering
- `SOUL.md` — Added confidence check, banned phrases, tool awareness, Notion capabilities
- `TOOLS.md` — Added MCP tool references

### New Files (Day 1)
- 12 lib modules (3,269 lines total)
- 7 fast tools (1,419 lines total)
- 4 OpenClaw skills
- 1 OpenClaw plugin (edge-callbacks)
- `scripts/daily-briefing.js` v6 (425 lines)
- `scripts/audit-edge-skills.js` (327 lines)
- `config/briefing-preferences.json`

### Key Fixes (Day 1)
- `crm/scripts/crm-sync.js` — computeEffectivePriority() from 7+ Notion columns
- gog OAuth — custom client `edge` with edge@carusoventures.com
- Steve Cohen / Ken Gart priority updates in Notion + CRM

---

## What's Next

### Ready to Deploy (need LaunchAgent setup)
1. **Nightshift** — every 30 min, 10 PM - 5:30 AM
2. **Cache refresh** — every 5 min (base data)
3. **Daily Briefing** — 5:30 AM weekdays
4. **EOD Summary** — 7 PM weekdays

### Needs Work
1. **Emily's guided walkthrough** — Hub exists but detail is still text wall. Need one-card-at-a-time flow.
2. **Button callbacks** — Buttons display but handlers have TODOs (actually send emails, close tasks)
3. **Remaining skills deep-dive** — 10 scripts still need the same treatment briefing got
4. **KG interaction data** — Neo4j has 6,119 persons but 0 meetings logged. Needs seeding from email/calendar history.
5. **Dashboard UUID resolution** — Some task owners show as Notion IDs instead of names
6. **GitHub CI/CD** — Needs Ryan's repo walkthrough
7. **Voice & Tone** — Needs Dan's sent email corpus
