# Edge Deployment v2 — Updated Plan (April 8, 2026)

## Status Summary

**Sessions completed:** April 7 + April 8
**Code written:** ~10,000 lines (12 lib modules, 12 tools, 20 scripts)
**Infrastructure:** Running (oMLX, KG, syncs, backup)
**Nightshift engine:** Built and tested (8 phases, 371 cache entries, 0 errors)
**LaunchAgents:** 6 running (infrastructure), 10 disabled (all skills)
**Production Telegram topics:** 0 (all cleared after March 31 leak)
**Test Telegram topics:** 22 (13 Edge HQ + 9 Emily HQ)

---

## What's Done (Don't Touch)

- [x] Layer 0: Security, config, timezone, SSH keys
- [x] Layer 1: Identity (SOUL.md with confidence check, TOOLS-INVENTORY.md, TOOLS.md)
- [x] Layer 2: Humanizer (31 patterns, 9 rules)
- [x] Layer 3: Memory (hybrid search, 82 chunks indexed)
- [x] Layer 4: Himalaya Email (IMAP read + SMTP send, Gmail App Password)
- [x] Layer 5: Google Calendar (service account, permanent, no OAuth)
- [x] Layer 6: Notion Workspace (3 databases, 16K records, notion-read/write/sync)
- [x] Layer 7: Personal CRM (6,161 contacts, 549 with priority, semantic search)
- [x] Layer 8: Knowledge Graph (Neo4j, 6,119 persons, 4,071 companies, Graphiti API)
- [x] Layer 9: gog OAuth (custom client `edge`, edge@carusoventures.com, permanent)
- [x] Layer 10: Git Autosync (CarusoVentures/edge-workspace)
- [x] Layer 11: Test infrastructure (test-utils.js, test groups, 9 mock fixtures)
- [x] Infrastructure LaunchAgents: oMLX, KG API, Notion sync, CRM sync, backup, git-autosync
- [x] 12 shared lib modules (3,269 lines): learning, scheduling, travel, email-intel, task-intel, telegram, three-steps-ahead, design-system, cache, anticipate, formatter, dossier-builder
- [x] 7 fast tools: fast-answer (0.05s), quick-calendar (2s), quick-tasks (0.04s), quick-dashboard (0.1s), quick-contact (0s), check-priority-emails (5s), update-contact-priority (10s)
- [x] 4 OpenClaw skills: fast-answer, email-priority, calendar-check, contact-lookup
- [x] Briefing v6 "Jarvis" (daily-briefing.js, 425 lines, uses 6 lib modules)
- [x] Nightshift engine (nightshift.js, 701 lines, 8 phases, 14.6 min runtime, 0 errors)
- [x] Contact dossier builder (dossier-builder.js, 489 lines, 163 priority contacts cached)
- [x] Fast-answer wired to dossiers + pre-computed AI answers
- [x] CRM priority sync (computeEffectivePriority from 7+ Notion columns, 2% → 9%)
- [x] SOUL.md confidence check (5-step "Can I Do This?" + banned phrases)
- [x] TOOLS-INVENTORY.md (100+ tools, all MCP tools documented)
- [x] "Edge" Notion view created on Persons Directory (Name, Email, Colorado, Dan Priority)
- [x] Skill audit: 10/10 passing

---

## Gap 1: 8 Scripts Need Rewrite (v1 → v2)

These scripts exist but use the old pattern: hardcoded bot tokens, no lib module integration, no formatter, no design-system. Each needs the same treatment daily-briefing and nightshift got.

| # | Script | Lines | Problem | Rewrite Scope |
|---|--------|-------|---------|---------------|
| 1 | **meeting-prep.js** | 144 | Uses clawAgent for calendar (slow), no dossier-builder, hardcoded token | Wire to quick-calendar + dossier-builder + formatter + design-system. Use travel.js for in-person meetings. |
| 2 | **email-check.js** | 191 | Minimal lib use, hardcoded token | Wire to email-intel.js + CRM cross-reference + formatter. VIP detection from cache. |
| 3 | **eod-summary.js** | 151 | No lib modules, hardcoded token | Same architecture as daily-briefing. Uses task-intel, email-intel, design-system. Mirror of morning briefing for evening. |
| 4 | **scheduling-heartbeat.js** | 84 | No lib modules, hardcoded token | Wire to scheduling.js + travel.js + learning.js. Only alert on conflicts or tight buffers. |
| 5 | **contact-enrichment.js** | 119 | No lib modules, hardcoded token | Wire to dossier-builder.js (already does the heavy lifting). This becomes a thin wrapper. |
| 6 | **security-council.js** | 128 | Minimal lib use, hardcoded token | Wire to design-system for formatting. 4-persona audit is the right approach, just needs polish. |
| 7 | **transcript-pipeline.js** | 119 | No lib modules, hardcoded token | Needs Fathom/Drive integration. Extract action items → feed to action-item-router. |
| 8 | **action-item-router.js** | 90 | No lib modules, hardcoded token | Extract owners + due dates, route to Emily's Actions & Approvals topic. Wire to learning.js. |

**Approach for each:** Review → rewrite with lib modules → dry-run → test delivery → Ryan reviews → approve.

---

## Gap 2: No LaunchAgents Running for Skills

10 LaunchAgents are in `_disabled/`. Nothing delivers to Telegram on a schedule.

| LaunchAgent | Schedule | Script | Depends On |
|-------------|----------|--------|-----------|
| com.edge.nightman | Every 30 min, 10 PM - 5:30 AM | nightshift.js | Script is ready. Needs plist updated (rename nightman→nightshift), EDGE_TEST_MODE=true for first run. |
| com.edge.cache-refresh | Every 5 min | fast-answer.js --refresh | Script is ready. Safe — no Telegram delivery. |
| com.edge.daily-briefing | 5:30 AM weekdays | daily-briefing.js | Script is ready. Needs test delivery review first. |
| com.edge.eod-summary | 7:00 PM weekdays | eod-summary.js | Needs rewrite (Gap 1 #3). |
| com.edge.email-check | Every 15 min | email-check.js | Needs rewrite (Gap 1 #2). |
| com.edge.meeting-prep | 6:30 AM daily | meeting-prep.js | Needs rewrite (Gap 1 #1). |
| com.edge.scheduling | Every 30 min | scheduling-heartbeat.js | Needs rewrite (Gap 1 #4). |
| com.edge.contact-enrichment | 5:00 AM daily | contact-enrichment.js | Needs rewrite (Gap 1 #5). |
| com.edge.security-council | 3:30 AM nightly | security-council.js | Needs rewrite (Gap 1 #6). |
| com.edge.transcript-pipeline | Every 2 hours | transcript-pipeline.js | Needs rewrite (Gap 1 #7). |

**Safe to enable now (no Telegram, no rewrite needed):**
- cache-refresh (just refreshes SQLite cache)

**Ready to test-deploy (script is solid):**
- nightshift (with EDGE_TEST_MODE=true)
- daily-briefing (with EDGE_TEST_MODE=true)

**Blocked on rewrite:**
- Everything else

---

## Gap 3: Production Telegram Not Set Up

- 0 production topics exist in Edge HQ or Emily HQ
- All cleared after March 31 leak incident
- Test groups have full topic structure (13 + 9)

**To go live, for each skill:**
1. Test in test group → Ryan reviews
2. Create production topic in real group
3. Remove EDGE_TEST_MODE from LaunchAgent plist
4. Monitor first production run

---

## Gap 4: Emily's Workflow Incomplete

| Component | Status | What's Needed |
|-----------|--------|---------------|
| Hub message with drill-down buttons | Built in daily-briefing.js | Working |
| Guided walkthrough (one card at a time) | Not built | Emily taps [Calendar] → gets meetings one by one with action buttons |
| Button callbacks (edge-callbacks plugin) | Buttons display, handlers have TODOs | Need to: actually send emails via himalaya, close tasks in Notion, forward to Dan's topic |
| Learning loop | Records decisions | Needs to act on predictions (skip asking Emily when confidence > 0.85) |

---

## Gap 5: KG Needs Interaction Data

- Neo4j has 6,119 persons and 4,071 companies but **0 meetings and 1 edge**
- Contact dossiers show "Cold — minimal history" for everyone because no interactions logged
- Need to seed from: email history (himalaya), calendar history (service account), Notion meeting notes

---

## Gap 6: Infrastructure Fixes

| Issue | Detail | Fix |
|-------|--------|-----|
| Dashboard owner UUIDs | Some task owners show as Notion People field UUIDs, not names | Use notion-get-users MCP to build UUID→name map, apply in task-intel.js |
| Edge tool consistency | Edge sometimes picks gog over fast tools | SOUL.md updated with tool priority + banned gog for calendar. Monitor. |
| Notion property audit | 71 priority columns in Persons Directory | `docs/notion-priority-columns-audit.md` ready to send to Emily for triage |
| Backup WAL mode | SQLite backup may miss in-flight writes | Enable WAL mode in backup.js for edge-cache.db and learning.db |

---

## Gap 7: Deferred (Needs External Input)

| Item | Blocked On |
|------|-----------|
| GitHub repos + CI/CD | Ryan's walkthrough of CarusoVentures repos |
| Voice & Tone STYLE.md | Dan's sent email corpus (200+ emails) |
| Voice Cloning (Vapi) | Dan's consent + audio sample |
| Dev Team Orchestration | GitHub CI/CD (above) |

---

## Recommended Work Order for Next Session

### Phase A: Enable what's already built (30 min)
1. Enable cache-refresh LaunchAgent (safe, no Telegram)
2. Test nightshift.js in test mode → Ryan reviews test group output
3. Test daily-briefing.js in test mode → Ryan reviews test group output
4. If approved, enable both LaunchAgents with EDGE_TEST_MODE=true

### Phase B: Rewrite scripts depth-first (2-3 hours)
Priority order (highest Dan/Emily impact first):
1. **meeting-prep.js** — Dan gets rich attendee dossiers before every meeting
2. **email-check.js** — Emily gets VIP email alerts every 15 min
3. **eod-summary.js** — Dan gets evening wrap-up
4. **scheduling-heartbeat.js** — Emily gets conflict alerts

For each: review → rewrite with lib modules → dry-run → test delivery → Ryan reviews.

### Phase C: Production Telegram setup (1 hour)
1. Create production topics in Edge HQ and Emily HQ
2. For each approved skill: remove EDGE_TEST_MODE, reload LaunchAgent
3. Monitor first production run of each

### Phase D: Emily's guided walkthrough (1-2 hours)
1. Build one-card-at-a-time flow in edge-callbacks plugin
2. Wire button handlers to actually execute (send emails, close tasks, forward)
3. Test with Emily's test group

### Phase E: KG seeding (1 hour)
1. Script to ingest email history → log interactions in KG
2. Script to ingest calendar history → log meetings in KG
3. Re-run dossier builder — relationship states will be richer

---

## Go-Live Checklist

- [ ] cache-refresh LaunchAgent enabled
- [ ] Nightshift tested in test group + approved + LaunchAgent enabled
- [ ] Daily briefing tested + approved + scheduled (5:30 AM)
- [ ] Meeting prep rewritten + tested + approved + scheduled (6:30 AM)
- [ ] Email check rewritten + tested + approved + scheduled (every 15 min)
- [ ] EOD summary rewritten + tested + approved + scheduled (7 PM)
- [ ] Scheduling heartbeat rewritten + tested + approved + scheduled (every 30 min)
- [ ] Contact enrichment wired to dossier-builder + tested + approved
- [ ] Security council polished + tested + approved
- [ ] Production topics created in Edge HQ and Emily HQ
- [ ] All LaunchAgents have correct EDGE_TEST_MODE state
- [ ] First production run monitored for each skill
- [ ] Emily's guided walkthrough tested
- [ ] Button callbacks execute real actions
- [ ] KG seeded with email + calendar history
