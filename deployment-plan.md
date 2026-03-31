# Deployment Plan — March 31, 2026 (Install Day)

## Starting Point

Layer 0.1 Security Hardening is DEPLOYED. OAC connection is live (enrolled device agent + LaunchAgent). All 22 skills are approved with full drafts in `skills/`.

## Connection to Edge

**Not needed for local install.** Claude Code is running directly on this machine.

If you ever need remote access: credentials are NOT in this repo. Ask Ryan for the OAC access code and device ID.

## Deployment Order

Deploy in dependency order. Each layer builds on the previous.

### Phase 1: Complete Layer 0 Foundation

| # | Skill | What to Do | Depends On |
|---|-------|-----------|-----------|
| 1 | **Layer 0.2: Fix Known Config** | Generate gateway token, fix timezone to America/Denver, clean context overflow files, generate SSH keys | Layer 0.1 (done) |
| 2 | **Layer 0.3: Identity / Soul / Heartbeat** | Update SOUL.md, configure HEARTBEAT.md, set heartbeat to oMLX, deploy Identity skill | Ryan's example files |
| 3 | **Layer 0.4: Humanizer** | Deploy humanizer skill (24+ AI pattern removal) | SOUL.md (0.3) |
| 4 | **Layer 0.5: oMLX** | Install oMLX, pull Qwen 3 8B + mxbai-embed-large, configure endpoint | None |
| 5 | **Layer 0.6: Persistent Memory** | Deploy memory skill, configure embeddings via oMLX, hybrid search, memory tiers | oMLX (0.5) |
| 6 | **Layer 0.7: Lossless Claw** | Install plugin, configure context management | oMLX (0.5) |
| 7 | **Testing Suite** | Create test Telegram groups + topics, deploy test config + mock data | Telegram groups created |
| 8 | **Telegram Strategy** | Create Edge HQ + Emily Edge HQ groups, create all topics, post welcome messages | Edge bot admin |

### Phase 2: Communication Layer

| # | Skill | What to Do | Depends On |
|---|-------|-----------|-----------|
| 9 | **Himalaya Email** | Install himalaya, configure IMAP/SMTP with Gmail app password, test inbox read | Gmail app password (Ryan has) |
| 10 | **Google Calendar** (Service Account) | Deploy service account JSON, configure calendar access | Google Service Account key (Ryan has) |

### Phase 3: Data Layer

| # | Skill | What to Do | Depends On |
|---|-------|-----------|-----------|
| 11 | **Notion Workspace** | Configure API connection, discover databases, write config. Deploy read/write/sync scripts. Deploy Oversight Agent. | Notion API key (already configured) |
| 12 | **Personal CRM v3** | Run Phase 0 Notion audit, Emily triages properties, generate field mapping, create 7-table SQLite DB, deploy all scripts | Notion Workspace (11), Emily on Telegram |
| 13 | **Knowledge Graph** | Install Docker, deploy Neo4j, install Graphiti wrapper, seed from CRM | Docker install, CRM (12), oMLX (4) |

### Phase 4: Intelligence Layer

| # | Skill | What to Do | Depends On |
|---|-------|-----------|-----------|
| 14 | **Daily Briefing v3** | Deploy briefing + EOD scripts, configure two-tier delivery, deploy accuracy agent, schedule launchd | Email (9), Calendar (10), Notion (11), CRM (12) |
| 15 | **Meeting Prep** | Deploy meeting prep scripts, configure scheduling rules (Emily approves), install goplaces | Calendar (10), CRM (12), Tavily (already configured) |
| 16 | **Scheduling Intelligence** | Install goplaces, deploy calendar heartbeat (30 min), configure Emily approval flow | Calendar (10), goplaces, scheduling-rules.json (15) |
| 17 | **Contextual Email Intelligence v3** | Deploy dual-classification, thread reconstruction, KG integration, ask extraction, feedback loop | Email (9), CRM (12), KG (13) |
| 18 | **Voice & Tone Engine** | Collect sent email corpus, run Opus analysis, generate STYLE.md, Dan/Emily review | Email (9), Anthropic API |

### Phase 5: Automation Layer

| # | Skill | What to Do | Depends On |
|---|-------|-----------|-----------|
| 19 | **Transcript Pipeline** | Deploy 3 source adapters, processing orchestrator, SQLite tracking DB, schedule launchd | Notion (11), Google Service Account (10) |
| 20 | **Action Item Routing Engine** | Deploy extraction, routing, approval flow, Edge Kanban board in Notion | Transcript Pipeline (19), CRM (12), Telegram |
| 21 | **Contact Auto-Enrichment** | Deploy enrichment engine, configure Emily morning batch, confidence scoring | CRM (12), Tavily, KG (13) |

### Phase 6: Dev Infrastructure

| # | Skill | What to Do | Depends On |
|---|-------|-----------|-----------|
| 22 | **Git Autosync v2** | Deploy sync + preflight scripts, schedule hourly launchd | SSH keys (Layer 0.2) |
| 23 | **GitHub CI/CD** | Configure branch protection, deploy 3 workflows, set GitHub secrets | SSH keys, GitHub PAT |
| 24 | **Backup & Recovery** | Deploy nightly backup script, rotation, deploy-edge.sh playbook | All databases deployed |
| 25 | **Nightman** | Deploy orchestrator + all task scripts, configure 14-cycle schedule, evening planning | Everything above |

### Phase 7: Advanced Features

| # | Skill | What to Do | Depends On |
|---|-------|-----------|-----------|
| 26 | **Security Council v2** | Deploy 4 personas, baseline collection, orchestrator, schedule 3:30 AM | Anthropic API, Telegram |
| 27 | **Voice Cloning Phone Calls** | Clone Dan's voice (ElevenLabs), set up Vapi + Twilio, install MCP server | Dan's voice consent, Vapi account |
| 28 | **Dev Team Orchestration** | Enable Agent Teams, deploy PM/Architect/Builder/Reviewer/Sanitizer prompts, configure projects | GitHub CI/CD (23), Nightman (25) |

## What Ryan Needs to Have Ready

- [x] Soul/Identity/Heartbeat example files
- [x] Gmail app password for edge@crusoeventures.com
- [x] Google Service Account JSON key
- [ ] Dan's voice consent + 3-5 min conversational audio (MP3/WAV/M4A, clear, minimal bg noise)
- [ ] Vapi account created (buy number through Vapi directly — skip Twilio)
- [ ] Google Stitch API key (for dev team mockups)
- [x] Google Places API key (for goplaces/parking)
- [x] Emily set up on Telegram
- [x] Edge HQ Telegram group created with topics enabled
- [x] Emily Edge HQ Telegram group created with topics enabled

## Key References

- CLAUDE.md: `clients/dan-caruso/CLAUDE.md`
- Connection protocol: `clients/dan-caruso/skills/deploy/_common.md`
- Credentials: `clients/dan-caruso/credentials.md`
- All skill drafts: `clients/dan-caruso/skills/deploy/drafts/`
- Architecture decisions: `clients/dan-caruso/docs/decisions/2026-03-30-architecture-decisions.md`
- Emily meeting notes: `clients/dan-caruso/docs/meetings/2026-03-30-emily-ea-meeting.md`
- Notion audit: `clients/dan-caruso/docs/research/2026-03-30-notion-people-db-audit.md`
