# Edge System Profile

Current state of the Mac Mini as of 2026-03-23 (last full mapping).

## Hardware

- **Model:** Mac Mini M4 Pro (Mac16,11)
- **CPU:** Apple M4 Pro (12 cores: 8P + 4E)
- **RAM:** 24 GB
- **Disk:** 460 GB SSD (381 GB free at last check)
- **Architecture:** arm64 (Apple Silicon)
- **Memory bandwidth:** ~273 GB/s (good for local inference)

## Software

- **OS:** macOS 15.6 Sequoia (Build 24G84)
- **Shell:** zsh 5.9
- **User:** edge (uid=501, admin group)
- **Home:** /Users/edge
- **Hostname:** Edge's Mac mini (Edges-Mac-mini)

### Installed Tools

| Tool | Version | Path |
|------|---------|------|
| Node.js | v22.22.1 | /opt/homebrew/opt/node@22/bin/node |
| npm | 10.9.4 | (via Node.js) |
| Python | 3.9.6 (system) | /usr/bin/python3 |
| Git | 2.39.5 (Apple Git-154) | /usr/bin/git |
| OpenClaw | 2026.3.22 (4dcc39c) | /opt/homebrew/bin/openclaw |
| Codex | @openai/codex@0.116.0 | /opt/homebrew/bin/codex |
| Homebrew | latest | /opt/homebrew/bin/brew |
| gh (GitHub CLI) | installed | /opt/homebrew/bin/gh |
| Xcode CLT | installed | /Library/Developer/CommandLineTools |

### NOT Installed (Needed)

| Tool | Needed For | Phase |
|------|-----------|-------|
| Docker | Knowledge Graph (Neo4j) | Phase 3 |
| oMLX | Local inference | Phase 1 (Layer 0.5) |
| Himalaya | Email (IMAP/SMTP) | Phase 2 |
| SSH keys | Git autosync, CI/CD | Phase 1 (Layer 0.2) |

### Homebrew Packages

brotli, c-ares, ca-certificates, curl, gh, gogcli, icu4c@78, libnghttp2, libnghttp3, libngtcp2, libssh2, libuv, lz4, node@22, openssl@3, readline, simdjson, simdutf, sqlite, uvwasi, xz, zstd

### Installed Applications

1Password 7, Amphetamine, Claude, Codex, Telegram, Visual Studio Code, Warp, Zoom

## OpenClaw Configuration

- **Primary model:** Claude Opus 4.6 (anthropic/claude-opus-4-6)
- **Heartbeat:** Claude Haiku 4.5 via OpenRouter, every 30min, 07:00-21:00 MT
- **Fallback chain:** Opus 4.6 -> Haiku 4.5 -> GPT-5.4 Pro -> GPT-5.4 -> ... -> OpenRouter Auto
- **Providers:** Anthropic (token), OpenRouter (API key), OpenAI Codex (OAuth)
- **Channels:** Telegram (enabled, DM pairing, streaming=partial)
- **Agent name:** Edge
- **Gateway:** Local on port 18789 (loopback only)
- **Max concurrent:** 4 agents, 8 subagents
- **Compaction:** safeguard mode
- **Tools profile:** full (browser denied)

## Directory Map

```
/Users/edge/
├── .openclaw/                  # MAIN OPENCLAW INSTALLATION
│   ├── config.json             # OpenAgent Connect enrollment
│   ├── credentials/
│   │   ├── telegram-default-allowFrom.json
│   │   └── telegram-pairing.json
│   ├── cron/
│   │   └── jobs.json           # 2 cron jobs (BROKEN — context overflow)
│   ├── exec-approvals.json     # 23 allowlisted commands
│   ├── memory/
│   │   └── main.sqlite         # Session memory DB
│   ├── openclaw.json           # MAIN CONFIG
│   └── workspace/              # AGENT WORKSPACE (git repo)
│       ├── AGENTS.md
│       ├── BOOTSTRAP.md
│       ├── HEARTBEAT.md
│       ├── IDENTITY.md
│       ├── MEMORY.md
│       ├── SOUL.md
│       ├── TOOLS.md
│       ├── USER.md
│       ├── memory/             # 10 files (3 are error dumps)
│       ├── config/
│       │   ├── content-sanitizer.json   # 13 patterns (Layer 0.1)
│       │   └── secret-redaction.json    # 14 patterns (Layer 0.1)
│       └── skills/
│           └── linkedin/
├── .claude/                    # Claude Code config
├── .codex/                     # OpenAI Codex config
├── .ssh/                       # DOES NOT EXIST YET
└── Library/
    └── LaunchAgents/
        └── com.openagent.agent.plist   # OAC enrolled device agent
```

## Listening Ports

| Port | Process | Purpose |
|------|---------|---------|
| 5000 | ControlCenter | AirPlay Receiver |
| 7000 | ControlCenter | AirPlay Receiver |
| 18789 | node (OpenClaw) | Gateway (loopback only) |
| 18791 | node (OpenClaw) | Internal |

## Environment Variables (in .zshrc)

- NOTION_API_KEY: configured
- TAVILY_API_KEY: configured
- PATH includes: /opt/homebrew/bin, /opt/homebrew/opt/node@22/bin, ~/.local/bin

## Known Issues

1. **Gateway token placeholder** — "REDACTED_ROTATE_THIS" (fix in Layer 0.2)
2. **Timezone mismatch** — USER.md says Mazatlan, should be Denver (fix in Layer 0.2)
3. **Cron jobs broken** — Context overflow on Morning Brief + EOD Summary (fix in Layer 0.2)
4. **Memory file clutter** — 3 of 10 are error logs (clean in Layer 0.2)
5. **No SSH keys** — ~/.ssh doesn't exist (generate in Layer 0.2)
6. **Google OAuth** — gog tool works. Also deploying Himalaya (app password) + Service Account for permanent access.
