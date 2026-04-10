# Edge — Next Session Plan

**Last session:** April 7, 2026
**Start here:** Read `/Users/edge/.claude/projects/-Users-edge-ai/memory/session_april7_full.md` for full context.

---

## Priority 1: Nightshift Worker (the engine that powers everything)

Everything depends on Nightshift doing real work overnight. Currently it's a skeleton.

### Build Nightshift to:
1. **Enrich contacts** — For every person Dan interacted with today + everyone on tomorrow's calendar:
   - Pull CRM + KG + email threads + Notion context
   - AI synthesizes into a 200-word dossier
   - Store in cache (`contact:name` → rich profile)
   - Dan asks "Who is X?" → instant rich answer from cache

2. **Enrich calendar** — For tomorrow's meetings:
   - Add Meet links where missing
   - Calculate travel time + parking for in-person
   - Research external attendees
   - Pre-build meeting dossiers
   - Store in cache + `data/nightshift/YYYY-MM-DD/calendar-actions.json`

3. **Process tasks** — Full dashboard analysis:
   - Detect overdue, stale, incomplete
   - Draft follow-up emails for overdue items
   - Resolve owner UUIDs → names
   - Store in cache (`tasks:dashboard` → formatted, enriched)

4. **Summarize emails** — Thread analysis:
   - Group into threads
   - Identify developing/urgent threads
   - Cross-reference senders with CRM priorities
   - Pre-build email digest for morning briefing

5. **Three steps ahead** — For top 3 priority items:
   - Research, pre-draft, pre-compute
   - Store in cache for morning retrieval

6. **Store all results** in:
   - `data/nightshift/YYYY-MM-DD/` (for briefing to read)
   - `lib/cache.js` SQLite (for fast-answer.js to serve)

### LaunchAgent:
- `com.edge.cache-refresh` — every 5 min (base data)
- `com.edge.nightshift` — every 30 min, 10 PM - 5:30 AM (full anticipation)

---

## Priority 2: Contact Dossier (pre-built, not on-demand)

When Dan asks "Who is Steve Cohen?" the answer should be rich:
```
Steve Cohen — Investor, Very High Priority
TAC Denver | sac@tac-denver.com
LinkedIn: linkedin.com/in/steven-cohen-40907411

Relationship: Dan has interacted with Steve 3 times this month.
Most recent: Ensuring Colorado DocuSign thread (today).
Context: Key stakeholder in Ensuring Colorado's Innovation Future initiative.
Interests: [from Notion]
Notes: [Dan's comments from Notion]

Active threads:
- Ensuring Colorado DocuSign (today, 3 messages)

Next step: Follow up after DocuSign execution is complete.
```

This should come from cache in 0.05s — built overnight by Nightshift.

---

## Priority 3: Emily's Guided Walkthrough

The briefing hub exists but Emily still gets a text wall for details. Build:

1. Emily taps `[📅 Calendar]` → Edge sends meetings one at a time
2. Each meeting card has action buttons (approve travel block, add Meet link, etc.)
3. Emily taps `[☑️ Tasks]` → Edge sends tasks one at a time
4. Each task card shows context + what Edge will do + [Do it] [Skip]
5. When Emily finishes reviewing → `[Send briefing to Dan]`

Requires: callback handlers in `edge-callbacks` plugin to process each button tap and send the next card.

---

## Priority 4: Remaining Skills Deep-Dive

Each skill needs the same treatment the briefing got:
1. Review against interview transcripts
2. Wire into lib modules (learning, cache, telegram, design-system)
3. Create fast tool wrapper
4. Test with Dan-like questions
5. Audit Edge's behavior

### Skills in order:
1. **Meeting Prep** — uses travel.js, scheduling.js, contact dossier. Pre-built overnight.
2. **Email Intelligence** — uses email-intel.js, learning.js. The 15-min check.
3. **EOD Summary** — same architecture as morning briefing. Uses same lib modules.
4. **Scheduling Heartbeat** — uses scheduling.js, travel.js. 30-min calendar monitor.
5. **Transcript Pipeline** — processes meeting transcripts → action items.
6. **Action Item Router** — extracts action items → routes to Emily for approval.
7. **Contact Enrichment** — overnight batch enrichment for Nightshift.
8. **Security Council** — enhanced 4-persona audit. Already v2.
9. **Git Autosync** — works, just needs cache data included.
10. **Backup** — works, needs WAL-mode fix for SQLite.

---

## Priority 5: Infrastructure Fixes

1. **Dashboard owner UUIDs** — Notion People fields store IDs, not names. Sync needs to resolve them.
2. **Edge tool consistency** — Edge sometimes picks gog over our fast tools. May need to disable gog for calendar/email or make skill priority stronger.
3. **Notion property audit with Emily** — 71 priority columns. `docs/notion-priority-columns-audit.md` is ready to send.
4. **Button callback handlers** — `edge-callbacks` plugin has TODOs for actually sending emails, closing tasks, forwarding to Dan.

---

## Priority 6: Deferred Items

- GitHub repos + CI/CD (needs Ryan's repo walkthrough)
- Voice & Tone STYLE.md (needs Dan's sent email corpus)
- Voice Cloning (needs Dan's consent + audio + Vapi)
- Dev Team Orchestration (needs GitHub CI/CD)

---

## Architecture Summary

```
NIGHTSHIFT (10 PM - 5 AM)
  → Enriches contacts, calendar, tasks, emails
  → Pre-builds dossiers, follow-ups, digests
  → Stores everything in SQLite cache

CACHE (SQLite, refreshed every 5 min + overnight)
  → calendar:today, calendar:tomorrow
  → email:priority
  → tasks:dan, tasks:dashboard
  → contact:name (pre-built dossiers)
  → question:focus-today, question:fires

FAST-ANSWER (0.05 seconds)
  → Dan asks question → check cache → instant answer
  → Cache miss → "🔍 Looking into that..." → fall through to AI

EDGE SKILLS (10-24 seconds, AI pipeline)
  → email-priority, calendar-check, contact-lookup, fast-answer
  → Uses lib modules for intelligence

LIB MODULES (shared infrastructure)
  → learning, scheduling, travel, email-intel, task-intel
  → telegram, three-steps-ahead, design-system, cache, anticipate, formatter
```

---

## Quick Start for Next Session

```bash
# 1. Check what's running
launchctl list | grep com.edge

# 2. Check services
curl -sS http://localhost:8000/v1/models  # oMLX
curl -sS http://localhost:8100/health     # Graphiti KG
curl -sS http://localhost:18789/health    # OpenClaw gateway

# 3. Read the full session context
cat /Users/edge/.claude/projects/-Users-edge-ai/memory/session_april7_full.md

# 4. Check issues tracker
cat /Users/edge/edgebot-install/install-issues-tracker.md
```
