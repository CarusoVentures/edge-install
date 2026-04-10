# Edge Install Day — Issues Tracker
**Date:** March 31, 2026
**Last updated:** April 3, 2026
**Status:** 24/28 steps deployed + 20 issues resolved total + 5 deferred (need external input)

---

## OPEN — Critical (Must Fix Before Go-Live)

### ISS-001: Git workspace commit blocked by security hook
- **Step:** 22 (Git Autosync)
- **What:** The pre-commit security hook (from Layer 0.1 Security Hardening) blocks `git commit` in the workspace. The hook detects potential secrets in staged files.
- **Impact:** Git autosync cannot push to `CarusoVentures/edge-workspace` (repo created but empty). No remote backup of scripts/configs.
- **Fix needed:** Either configure the hook to allowlist specific files, or ensure all secrets are in `.gitignore` and not staged. May need `git commit --no-verify` for initial commit, then proper secret exclusion going forward.
- **Blocked by:** Also needs GitHub repo structure decision from Ryan.

### ISS-002: GitHub repo structure not defined
- **Step:** 23 (GitHub CI/CD)
- **What:** Ryan has multiple repos at `github.com/CarusoVentures` that Edge needs access to for Dev Team orchestration. Ryan wants to explain each repo's purpose before configuring access.
- **Impact:** Steps 22 (Git Autosync push), 23 (CI/CD), 28 (Dev Team Orchestration) are blocked.
- **Fix needed:** Ryan to walk through CarusoVentures repos, define which ones Edge works on, and how project topics in Telegram map to repos.

### ISS-003: Email intelligence is basic polling, not full contextual engine
- **Step:** 17 (Contextual Email Intelligence v3)
- **What:** The deploy skill specifies dual-classification with two Opus classifiers, thread reconstruction, KG integration, ask extraction, multi-level feedback loop, urgency scoring with SQLite feedback DB. The deployed `email-check.js` is a basic urgency classifier via a single `openclaw agent` call.
- **Impact:** Emily's primary workflow depends on accurate urgency scoring. False positives/negatives will erode trust.
- **Fix needed:** Build out the full email intelligence engine per `deploy-urgent-email-v2.md`. Add `urgency-feedback.db`, thread reconstruction, KG relationship context.

### ISS-004: Graphiti not installed — KG has no temporal query layer
- **Step:** 13 (Knowledge Graph)
- **What:** Neo4j is running with 10,190 nodes seeded, but the Graphiti Python library (temporal abstraction layer) was never installed. No Flask REST wrapper on port 8100. The KG can answer "who is John?" but NOT "when did John change companies?" or "has this contact gone dormant?"
- **Impact:** Email intelligence, meeting prep, and contact enrichment all depend on KG for temporal relationship context. Without Graphiti, the KG is a static directory, not a temporal graph.
- **Fix needed:** `pip3 install graphiti-core flask neo4j`, create `kg/graphiti-api.py` REST wrapper, create `com.edge.kg-api` LaunchAgent on port 8100.

### ISS-005: goplaces CLI not installed
- **Step:** 15-16 (Meeting Prep + Scheduling Intelligence)
- **What:** The `goplaces` CLI for travel time, parking, and GPS directions is not installed. Emily named this as her #1 pain point.
- **Impact:** Meeting dossiers lack travel logistics. Scheduling intelligence can't calculate buffer time between in-person meetings.
- **Fix needed:** Install goplaces, configure Google Places API key (Ryan confirmed he has this key).

---

## OPEN — Important (Should Fix Soon)

### ISS-006: Phase 0 Notion audit was skipped
- **Step:** 12 (Personal CRM)
- **What:** Emily was supposed to triage 351 Notion properties before CRM sync. Ryan approved all fields for now, deferring Emily's review. The `crm-audit-notion.js` script was never created.
- **Impact:** CRM may contain noise from 200+ event-specific fields. Search quality could be degraded.
- **Fix needed:** Build `crm-audit-notion.js`, run audit, present results to Emily via Telegram for triage. Update `field_mappings` table with her decisions.

### ISS-007: Scripts are simplified single-file versions
- **What:** Many skills were deployed as single consolidated scripts instead of the multi-file architectures specified in the deploy skills. Specifically:
  - **Security Council:** 4KB single file vs planned 4 persona prompts + SQLite + baseline collector + HTML renderer
  - **Action Item Router:** 1 file vs planned 4-script pipeline (extract, route, approval-flow, process-meeting)
  - **Transcript Pipeline:** basic vs planned 3-source adapter system (Gemini/Drive, Fathom, Notion)
  - **Contact Enrichment:** basic vs planned confidence scoring + Emily morning batch approval with feedback loop
- **Impact:** Scripts work but may not implement the full logic, edge cases, and quality controls specified in the deploy skills.
- **Fix needed:** Iteratively enhance each script against its deploy skill specification. Prioritize email intelligence (ISS-003) and Security Council.

### ISS-008: Mock test data not created
- **Step:** 7 (Testing Suite)
- **What:** `data/test-fixtures/` directory exists but is empty. The deploy skill specifies 9 mock data files: contacts.json, calendar-events.json, emails.json, action-items.json, transcripts.json, nightman-results.json, notion-databases.json, security-baseline.txt, accuracy-stress-test.json. Also `run-tests.js` (test runner) was never created.
- **Impact:** Cannot run automated tests. Manual testing only.
- **Fix needed:** Create mock data fixtures and test runner script.

### ISS-009: Telegram forward-to-Dan workflow missing
- **Step:** 8 (Telegram Strategy)
- **What:** `telegram-forward-to-dan.js` was not created. This is the script that enables Emily to tap [Forward to Dan] on urgent items, which reformats them for Dan's concise style and posts to his #dan-approvals topic.
- **Impact:** Emily's core UX feature for the dual-group architecture is missing. She'd have to manually copy/paste between groups.
- **Fix needed:** Create `telegram-forward-to-dan.js` per deploy skill spec. Wire to Telegram inline keyboard callbacks.

### ISS-010: No TOOLS.md entries for Telegram operations
- **Step:** 8 (Telegram Strategy)
- **What:** TOOLS.md was populated with general capabilities but missing Telegram-specific tool entries: `create_project`, `list_topics`, `post_to_topic`, `forward_to_dan`.
- **Fix needed:** Add Telegram tool entries to TOOLS.md.

---

## OPEN — Deferred (Needs External Input)

### ISS-011: Voice & Tone Engine (Step 18)
- **What:** Needs Dan's sent email corpus (500+ emails) for Opus analysis to generate STYLE.md.
- **Blocked by:** Access to Dan's sent folder, or Emily providing representative email samples.
- **Deliverables:** STYLE.md, EXAMPLES.md, RECIPIENTS.md

### ISS-012: Voice Cloning Phone Calls (Step 27)
- **What:** Needs Dan's voice consent + 3-5 min conversational audio sample (MP3/WAV/M4A, clear, minimal background noise). Also needs Vapi account created.
- **Blocked by:** Dan's consent and audio recording, Vapi account setup.
- **Deliverables:** ElevenLabs voice clone, Vapi + Twilio integration, MCP server.

### ISS-013: Dev Team Orchestration (Step 28)
- **What:** Needs GitHub CI/CD (Step 23) deployed first, plus Nightman (Step 25) fully operational.
- **Blocked by:** ISS-002 (GitHub repo structure), ISS-001 (git commit hook).
- **Deliverables:** PM/Architect/Builder/Reviewer/Sanitizer agent prompts, project config.

---

## RESOLVED

### RES-001: Dual embedding provider gap
- **What:** OpenClaw used Ollama for memory search, custom scripts used oMLX. Two systems producing different vectors.
- **Resolution:** Unified to single oMLX provider via `provider: "openai"` with `remote.baseUrl`. Ollama removed. See lessons-learned.md #15.

### RES-002: oMLX Homebrew tap URL wrong
- **Resolution:** Use `brew tap jundot/omlx https://github.com/jundot/omlx` (full URL). See lessons-learned.md #16.

### RES-003: oMLX CLI doesn't match deploy script
- **Resolution:** `omlx pull`/`omlx list` don't exist. Use bundled `hf` CLI for model downloads. See lessons-learned.md #17.

### RES-004: mxbai-embed-large context overflow
- **Resolution:** Set `chunking.tokens: 128` (default 400 was too large for 512-token context).

### RES-005: Himalaya config syntax changed in v1.2
- **Resolution:** `encryption.type` (not `encryption`), `auth.type` + `auth.cmd` (not `passwd.cmd`).

### RES-006: Gmail regular password rejected
- **Resolution:** Generated Gmail App Password (16-char). Stored at `.env.email` with 600 perms.

### RES-007: Anthropic API 529 overloads
- **What:** Claude API returned 529 Overloaded errors multiple times during install.
- **Resolution:** Transient, not our infrastructure. Scripts handle with timeouts. Retries work.

### RES-008: File permissions on sensitive configs
- **Resolution:** All config files with API keys/tokens set to chmod 600.

### RES-009: Stale third Telegram group
- **Resolution:** Removed `-5227182655` (old non-forum Edge HQ) from openclaw.json.

### RES-010: TOOLS.md was empty
- **Resolution:** Populated with all 56 lines documenting Edge's capabilities.

### RES-011: EOD Summary missing
- **Resolution:** Created `eod-summary.js` + LaunchAgent at 7 PM weekdays.

### RES-012: Nightman single-fire
- **Resolution:** Changed LaunchAgent to `StartInterval: 1800` (every 30 min). Added time guard in script (only runs 10 PM - 5:30 AM).

### RES-013: First backup never run
- **Resolution:** Ran first backup (16 files to `data/backups/backup-2026-03-31`).

### RES-014: ISS-004 — Graphiti not installed
- **Resolution:** Installed graphiti-core + flask + neo4j Python libs. Created `kg/graphiti-api.py` REST wrapper on port 8100. LaunchAgent `com.edge.kg-api` running. Endpoints: /api/person, /api/relationships, /api/dormant, /api/relationship-state, /api/interaction/log, /api/cypher.

### RES-015: ISS-003 — Email intelligence basic
- **Resolution:** Rewrote `email-check.js` with dual-classification, KG context enrichment, ask extraction, CRM lookup, and urgency-feedback.db SQLite for feedback loop.

### RES-016: ISS-005 — goplaces not installed
- **Resolution:** `goplaces` CLI doesn't exist as a standard package. Built `tools/travel-lookup.js` using Google Maps Directions + Places + NearbySearch APIs directly. Travel time, parking, and Maps links working. Google Maps API key: configured.

### RES-017: ISS-009 — Telegram forward-to-Dan workflow
- **Resolution:** Created `scripts/telegram-forward-to-dan.js`. Reformats Emily's urgent items for Dan's concise style, posts to specified topic, logs all forwarding actions.

### RES-018: ISS-010 — TOOLS.md Telegram entries
- **Resolution:** Added Telegram operations, travel/logistics tools, and Graphiti KG API entries to TOOLS.md.

### RES-019: EOD Summary + Nightman scheduling
- **Resolution:** Created `scripts/eod-summary.js` + LaunchAgent at 7 PM weekdays. Fixed Nightman from single-fire to every 30 min with time guard (10 PM - 5:30 AM only).

---

## Priority Order for Remaining Work

1. **ISS-002** — GitHub repo structure (unblocks ISS-001, ISS-013)
2. **ISS-001** — Git commit hook fix (unblocks autosync + remote backup)
3. **ISS-004** — Graphiti install (unblocks temporal KG queries)
4. **ISS-003** — Email intelligence engine (Emily's primary workflow)
5. **ISS-005** — goplaces install (Emily's #1 pain point)
6. **ISS-009** — Telegram forward workflow (Emily's UX)
7. **ISS-006** — Notion audit with Emily
8. **ISS-007** — Script enhancement (iterative)
9. **ISS-008** — Mock test data
10. **ISS-010** — TOOLS.md Telegram entries
11. **ISS-011** — Voice & Tone (when email corpus available)
12. **ISS-012** — Voice Cloning (when Dan consents)
13. **ISS-013** — Dev Team (when GitHub CI/CD ready)
