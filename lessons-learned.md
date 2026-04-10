# Lessons Learned from Past Deployments

Compiled from 5 client installs (March 2026). These are real failures that cost 6+ hours of debugging. Don't repeat them.

## 1. OpenClaw Config Schema is Strict

**What happens:** Writing an unknown key to `~/.openclaw/openclaw.json` causes ALL `openclaw` CLI commands to fail with a validation error. Not just the one you changed — everything dies.

**How to avoid:**
- Always `cat ~/.openclaw/openclaw.json` and read the current schema before editing
- Run `openclaw doctor --fix` after any config change
- Make a backup before editing: `cp ~/.openclaw/openclaw.json ~/.openclaw/openclaw.json.bak`
- Test with a simple command after editing: `openclaw --version`

## 2. OpenClaw CLI Commands Are Limited

**What happens:** Deploy skills may reference CLI subcommands that don't exist (e.g., `openclaw telegram list-groups`, `openclaw config set messaging.*`). These were aspirational, never implemented.

**How to avoid:**
- Before running any `openclaw` command from a deploy skill, verify it exists: `openclaw help <subcommand>`
- If a command doesn't exist, use the raw equivalent (direct file edit, API call, Node.js script)
- `openclaw config set` cannot set array values — edit `openclaw.json` directly
- `openclaw skills list` — check what 51 bundled skills exist before building standalone equivalents

**Known nonexistent commands:**
- `openclaw telegram *` (list-groups, list-topics, create-topic, send, test-all-topics)
- `openclaw config set messaging.*`
- `openclaw config set` with arrays or nested objects

## 3. Use launchd, Never crontab

**What happens:** `crontab -e` hangs on macOS 15+. Even when it doesn't hang, macOS's cron implementation is unreliable for always-on services.

**How to avoid:**
- All scheduled tasks use launchd plists in `~/Library/LaunchAgents/`
- Naming convention: `com.edge.<skill-name>.plist`
- ALL paths in plists must be absolute (`/Users/edge/...`, never `~/...`)
- Validate every plist: `plutil -lint ~/Library/LaunchAgents/com.edge.<name>.plist`
- Load: `launchctl load ~/Library/LaunchAgents/com.edge.<name>.plist`
- Unload: `launchctl unload ~/Library/LaunchAgents/com.edge.<name>.plist`
- Check status: `launchctl list | grep com.edge`
- Restart: `launchctl kickstart -k gui/$(id -u)/com.edge.<name>`

**Plist template:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.edge.SKILLNAME</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/opt/node@22/bin/node</string>
        <string>/Users/edge/.openclaw/workspace/scripts/SCRIPTNAME.js</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>7</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/Users/edge/.openclaw/workspace/logs/SKILLNAME.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/edge/.openclaw/workspace/logs/SKILLNAME.stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/opt/homebrew/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>/Users/edge</string>
    </dict>
</dict>
</plist>
```

## 4. Telegram: Use Raw Bot API

**What happens:** There is no `openclaw telegram` CLI. The gateway handles Telegram internally via its own polling. If you call `getUpdates`, you get 0 results because the gateway already consumed them.

**How to avoid:**
- Use raw Telegram Bot API via `curl` or Node.js `fetch`
- Send messages: `curl -sS "https://api.telegram.org/bot<TOKEN>/sendMessage" -d "chat_id=<ID>&text=<TEXT>&message_thread_id=<TOPIC_ID>"`
- Get group/topic IDs from Ryan (not from `getUpdates`)
- Read gateway state files if needed: `~/.openclaw/credentials/telegram-pairing.json`, `telegram-default-allowFrom.json`
- For topic-based groups: always include `message_thread_id` parameter

## 5. File-Based Config Over CLI

**What happens:** The `openclaw config set` command is limited. It can't set arrays, can't set nested objects, and some keys it accepts silently but doesn't actually use.

**How to avoid:**
- Read config: `cat ~/.openclaw/openclaw.json | python3 -m json.tool`
- Edit config: use python3 to modify JSON safely:
```bash
python3 << 'PYEOF'
import json
with open('/Users/edge/.openclaw/openclaw.json', 'r') as f:
    config = json.load(f)
config['some']['nested']['key'] = 'value'
with open('/Users/edge/.openclaw/openclaw.json', 'w') as f:
    json.dump(config, f, indent=2)
PYEOF
```
- Always back up before editing
- Always run `openclaw doctor --fix` after editing

## 6. Gateway Token Must Be Real

**What happens:** The gateway auth token in `openclaw.json` is currently "REDACTED_ROTATE_THIS". This is a placeholder from initial setup. With this placeholder, the gateway may accept unauthenticated requests or behave unpredictably.

**How to fix:** Generate a real random token and set it in openclaw.json. See `layer-0/0.2-fix-config.md`.

## 7. SSL Issues with Python on macOS

**What happens:** Python's `urllib.request` fails with `ssl.SSLCertVerificationError` on macOS. The system Python (3.9.6) doesn't have the right CA bundle.

**How to avoid:**
- For HTTPS calls, always use `curl` or `subprocess.run(["curl", ...])`
- Never use `urllib.request` or `http.client` for HTTPS on this machine
- If you must use Python for HTTP, use `requests` library (install first: `pip3 install requests`)

## 8. Standalone Scripts, Not OpenClaw Sessions

**What happens:** Running scheduled tasks inside OpenClaw sessions causes context overflow. The session accumulates context over multiple runs and eventually hits the prompt size limit. Both current cron jobs (Morning Brief + EOD Summary) are broken this way.

**How to avoid:**
- All scheduled tasks must be standalone scripts (Node.js or bash)
- Scripts run via launchd, NOT via `openclaw` CLI
- Scripts use API keys directly (from environment variables or config files)
- Scripts handle their own logging (stdout/stderr to log files)
- Scripts have their own error handling and retry logic

## 9. Apple Silicon / Homebrew Paths

**What happens:** Homebrew on Apple Silicon uses `/opt/homebrew/` (not `/usr/local/`). Scripts and plists that hardcode `/usr/local/bin` will fail.

**Key paths:**
- Homebrew: `/opt/homebrew/bin/brew`
- Node.js: `/opt/homebrew/opt/node@22/bin/node`
- npm: `/opt/homebrew/opt/node@22/bin/npm`
- OpenClaw: `/opt/homebrew/bin/openclaw`
- System Python: `/usr/bin/python3`

## 10. Docker Not Installed

Docker is needed for Knowledge Graph (Neo4j, Phase 3). It's not currently installed.

**Install plan:**
```bash
brew install --cask docker
# Then open Docker.app to complete setup (requires GUI interaction)
# Or use colima for headless: brew install colima && colima start
```

Consider `colima` for headless Docker if we want to avoid the Docker Desktop GUI requirement.

## 11. Gatekeeper Quarantine

**What happens:** Downloaded binaries get quarantined by macOS Gatekeeper. First run shows "is damaged and can't be opened" dialog.

**How to fix:** `xattr -dr com.apple.quarantine /path/to/binary`

This may be needed for: oMLX, Docker, any downloaded tools.

## 12. Prevent Sleep on Always-On Mac Mini

The Mac Mini should never sleep. Verify:
```bash
# Check current settings
pmset -g

# Disable sleep on AC power
sudo pmset -c sleep 0

# Verify Amphetamine is running (already installed)
ps aux | grep -i amphetamine
```

## 13. Environment Variables in Scripts

Scripts run via launchd don't inherit the user's `.zshrc` environment. API keys set in `.zshrc` won't be available.

**How to handle:**
- Include `EnvironmentVariables` dict in launchd plists
- Or source `.zshrc` at the top of bash scripts: `source /Users/edge/.zshrc`
- Or read API keys from a dedicated config file that scripts load

## 14. requireMentions=false for Telegram Groups

Edge must ALWAYS have `requireMentions=false` in all Telegram groups. This gets reset on config changes and reboots. Verify after every deployment step that touches Telegram or OpenClaw config.

Check: look for `requireMentions` in `~/.openclaw/openclaw.json` under the Telegram channel config.

## 15. OpenClaw Embedding Provider: Use "openai" Adapter, NOT "ollama"

**What happens:** OpenClaw's "ollama" embedding adapter speaks Ollama's native API format (`/api/embeddings`), which oMLX does not serve. oMLX only speaks the OpenAI format (`/v1/embeddings`). Setting `provider: "ollama"` fails with "fetch failed" because oMLX returns 404 on `/api/embeddings`.

**What also doesn't work:**
- Setting `OPENAI_BASE_URL` as an env var — OpenClaw's embedding adapter ignores this entirely. It only reads `remote.baseUrl` from the JSON config.
- Adding `baseUrl` to the top-level memorySearch config — schema validation rejects it as an unknown key.

**How to fix:** Use `provider: "openai"` with `remote.baseUrl` and `remote.apiKey` inside the memorySearch config:
```json
"memorySearch": {
  "provider": "openai",
  "model": "mxbai-embed-large",
  "remote": {
    "baseUrl": "http://localhost:8000/v1",
    "apiKey": "dummy"
  },
  "chunking": { "tokens": 128, "overlap": 24 }
}
```

The "openai" here is just the API protocol — it connects to oMLX on localhost, NOT to api.openai.com. The `apiKey` is ignored by oMLX but required by the adapter.

**Also:** oMLX must have `skip_api_key_verification: true` in `~/.omlx/settings.json`, otherwise it rejects the dummy key with HTTP 401.

**Also:** mxbai-embed-large has a 512-token context. OpenClaw's default chunking (400 tokens × 4 = 1600 bytes) exceeds this. Set `chunking.tokens: 128` to keep chunks within limits.

## 16. oMLX Homebrew Tap Requires Full URL

**What happens:** `brew tap jundot/omlx` fails because Homebrew can't infer the repo URL.

**How to fix:** Use the full URL: `brew tap jundot/omlx https://github.com/jundot/omlx`

## 17. oMLX CLI Doesn't Match Deploy Script

**What happens:** The deploy skill references `omlx pull`, `omlx list`, `omlx --version` — none of these exist. oMLX v0.3.0 only has `omlx serve` and `omlx launch`.

**How to fix:** Download models using the HuggingFace CLI bundled with oMLX:
```bash
/opt/homebrew/opt/omlx/libexec/bin/hf download mlx-community/Qwen3-8B-4bit --local-dir ~/.omlx/models/qwen3-8b
/opt/homebrew/opt/omlx/libexec/bin/hf download mixedbread-ai/mxbai-embed-large-v1 --local-dir ~/.omlx/models/mxbai-embed-large
```
oMLX auto-discovers models from subdirectories of `~/.omlx/models/`.
