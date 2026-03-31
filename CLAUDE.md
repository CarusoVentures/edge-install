# Edge Install Day — March 31, 2026

You are Claude Code running locally on Edge's Mac Mini M4 Pro. Ryan (the consultant) is sitting next to you. Your job is to deploy Edge's full AI assistant stack across 28 steps in 7 phases.

## What's Already Done

- Layer 0.1 Security Hardening: DEPLOYED (FileVault, gateway lockdown, exec-approvals, content sanitizer, secret redaction, pre-commit hook)
- OAC enrolled device agent + LaunchAgent: INSTALLED
- All 22 skills: APPROVED with full deploy drafts in `skills/`

## Start Here

Read `deployment-plan.md` for the full 28-step deployment order. Start at **Phase 1, Step 1 — Layer 0.2: Fix Known Config**.

Layer 0.2-0.7 instructions are in `layer-0/`. Steps 7-28 have full deploy skill drafts in `skills/`.

## System Info

- **Machine:** Mac Mini M4 Pro, 24 GB RAM, macOS 15.6, arm64
- **User:** `edge` / Home: `/Users/edge`
- **OpenClaw:** 2026.3.22 at `/opt/homebrew/bin/openclaw`
- **Workspace:** `/Users/edge/.openclaw/workspace/`
- **Config:** `/Users/edge/.openclaw/openclaw.json`
- **Node.js:** v22.22.1 at `/opt/homebrew/opt/node@22/bin/node`
- **Python:** 3.9.6 (system) at `/usr/bin/python3`
- **Homebrew:** `/opt/homebrew/bin/brew`
- **Warp terminal** is default terminal + login item
- **No Docker, Go, Rust, Java installed** (Docker needed for Phase 3 Knowledge Graph)
- **No SSH keys** (needed for Phase 6 Git Autosync)
- **Telegram bot:** 8784533237, user 8730867387

Full system profile: `system-profile.md`

## Critical Rules

1. **Verify every step.** If a step can fail silently, add a verification command. Never assume success.
2. **Run `openclaw doctor --fix` before starting.** This catches config schema issues early.
3. **Config schema is strict.** Writing unknown JSON keys to `openclaw.json` kills ALL CLI commands. Read the current schema first, edit carefully.
4. **Edit `openclaw.json` directly** for complex config. `openclaw config set` can't handle arrays or nested objects.
5. **Use launchd for scheduling, not crontab.** macOS `crontab` hangs. All scheduled tasks go in `~/Library/LaunchAgents/` as plists.
6. **Launchd plists require absolute paths.** No `~` or `$HOME` — use `/Users/edge/...` everywhere.
7. **Validate plists with `plutil -lint`** before loading.
8. **Use raw Telegram Bot API** via curl or Node.js scripts. Do NOT use `openclaw telegram` commands (they don't exist).
9. **Do NOT use `getUpdates`** to discover Telegram groups. The gateway consumes updates. Read state files at `~/.openclaw/credentials/` or ask Ryan for group IDs.
10. **Standalone scripts via launchd** for all scheduled tasks. NOT inside OpenClaw sessions.
11. **Check OpenClaw's bundled skills first** (`openclaw skills list`) before deploying standalone equivalents.
12. **Use `curl` for HTTPS calls**, not Python's `urllib` (SSL cert issues on macOS).
13. **No cost constraints.** VC firm — build for capability, not savings.
14. **Human-in-the-loop.** Edge never messages Dan's contacts or modifies external systems without approval.
15. **After any deployment, tell Ryan** so he can update the client profile.

## Telegram Setup (IMPORTANT)

Two groups are created:

- **Edge HQ** (Dan's group): Topics for briefings, meetings, approvals, projects, nightman
- **Emily Edge HQ** (Emily's group): Topics for urgent emails, scheduling, drafts, contacts, actions, security, system health

Edge must ALWAYS have `requireMentions=false` in all groups. Verify after every config change or reboot.

Ryan has the group IDs and topic IDs. Ask him when you need them.

## Known Issues on This Machine

1. **Gateway token is placeholder** — `gateway.auth.token` in openclaw.json is "REDACTED_ROTATE_THIS". Fix in Layer 0.2.
2. **Timezone wrong** — USER.md says America/Mazatlan, should be America/Denver. Fix in Layer 0.2.
3. **Cron jobs broken** — Morning Brief + EOD Summary failing with context overflow. Fix in Layer 0.2.
4. **3 memory files are error logs** — Context overflow error dumps in workspace/memory/. Clean in Layer 0.2.
5. **No SSH keys** — `~/.ssh` doesn't exist. Generate in Layer 0.2.
6. **Google OAuth** — `gog` tool works. Also deploying Himalaya (app password) + Service Account for permanent access.

## Key People

- **Dan Caruso** — Managing Director, Crusoe Ventures. Non-technical. Client/end-user.
- **Emily** — Dan's EA. Remote (CA). Filters urgent emails, manages calendar/contacts/scheduling. Key approval gate.
- **Connor** — Analyst. Initial contact point.
- **Cody** — Tech lead. Notion API scope manager.
- **Ryan** — Consultant (Proletariat Consulting). The person sitting next to you right now.

People profiles: `people/`

## Architecture Decisions (Confirmed)

- **oMLX** over Ollama (2x faster, 50% less RAM on Apple Silicon)
- **mxbai-embed-large** for local embeddings (NOT Gemini for confidential data)
- **Lossless Claw** for context management
- **Qwen 3 8B** for local chat/heartbeats via oMLX
- **Neo4j + Graphiti** for knowledge graph (deploy in Phase 3)
- **Anthropic 3-Agent Pattern** (Generator + Evaluator) for quality control
- **Auto-login stays ON** (LaunchAgent requires user session for restart after power outages)
- **No ClawHub skills** — custom-built or built-in only (supply chain risk)

Full decisions: `docs/architecture-decisions.md`

## File Map

```
edge-install/
  CLAUDE.md                  -- You are here
  deployment-plan.md         -- 28 steps, 7 phases, dependency order
  system-profile.md          -- Edge hardware, software, directory map
  lessons-learned.md         -- Gotchas from 5 past client installs (READ THIS)
  layer-0/                   -- Foundation config (Layers 0.2-0.7)
    0.2-fix-config.md        -- Gateway token, timezone, SSH keys, cleanup
    0.3-identity.md          -- SOUL.md, HEARTBEAT.md, Identity skill
    0.4-humanizer.md         -- 24+ AI pattern removal
    0.5-omlx.md              -- Install oMLX, pull models
    0.6-memory.md            -- Persistent memory + embeddings
    0.7-lossless-claw.md     -- Context management plugin
  skills/                    -- 22 deploy skill drafts (full instructions)
    _common.md               -- Standard deployment protocol
    deploy-*.md              -- One per skill
  docs/                      -- Reference documents
    architecture-decisions.md
    emily-meeting.md
    notion-audit.md
    edge-architecture-plan.md
    google-workspace-setup.md -- Calendar + Drive via Service Account, Email via Himalaya
  people/                    -- Team member profiles
    dan-caruso.md, emily.md, connor.md, ...
```

## Workspace Path

The workspace on this machine is `/Users/edge/.openclaw/workspace/`. This is the standard modern OpenClaw path. The legacy path `~/clawd/` (from when the project was called Clawdbot) should NOT be used. All skill drafts in this repo have been updated to use the correct path.

Custom scripts, configs, and databases go under the workspace:
- Scripts: `/Users/edge/.openclaw/workspace/scripts/`
- Config: `/Users/edge/.openclaw/workspace/config/`
- Data/DBs: `/Users/edge/.openclaw/workspace/data/`
- Logs: `/Users/edge/.openclaw/workspace/logs/`

## Lessons Learned (Summary)

Read `lessons-learned.md` for full details. Top 5:

1. **OpenClaw config is fragile.** Read current config before editing. Unknown keys = total CLI failure.
2. **59% of generic deploy skills reference commands that don't exist.** Our skills were written after this lesson, but ALWAYS verify a command exists before running it.
3. **launchd, not cron.** Every Mac client has had crontab issues. Use launchd exclusively.
4. **File-based config, not CLI.** Edit JSON files directly. The CLI is limited.
5. **Test in isolation first.** Use test Telegram groups/topics before going live.
