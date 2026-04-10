# CLAUDE-SETUP-INSTRUCTIONS.md
## Instructions for Claude Code: Setting Up Edge on a New Mac Mini

**You are Claude Code running locally on a new Mac Mini M4 Pro.** Ryan (the consultant, Proletariat Consulting) is sitting next to you. Your job is to set up Edge — an AI executive assistant for Dan Caruso — from scratch on this machine.

Read this file completely before taking any action. Then work through the steps in order, verifying each step before proceeding.

---

## What You're Deploying

Edge is a 24/7 AI executive assistant that:
- Runs on OpenClaw (agent runtime), primary model Claude Opus 4.6
- Uses oMLX for local inference (Qwen 3 8B for chat, mxbai-embed-large for embeddings)
- Communicates via Telegram (bot @edgeventures1000)
- Reads email via Himalaya (IMAP/SMTP, edge@carusoventures.com)
- Accesses Google Calendar + Drive via Service Account
- Uses Notion as task/CRM data source
- Has a Neo4j knowledge graph for relationship tracking
- Has 16 lib modules, 21 scripts, 12 tools, and a full CRM system

**Workspace:** `~/.openclaw/workspace/` (git repo: CarusoVentures/edge-workspace)
**Install docs:** `/Users/edge/edgebot-install/` (git repo: CarusoVentures/edge-install)
**SETUP.md:** `/Users/edge/edgebot-install/SETUP.md` — the human-readable companion to this file

---

## Ground Rules (Non-Negotiable)

1. **Verify every step.** If a command can fail silently, add a verification command.
2. **OpenClaw config is fragile.** Never write unknown JSON keys to `openclaw.json`. Unknown keys break ALL OpenClaw CLI commands. Always read before editing. Edit with Python's json module. Run `openclaw doctor --fix` after every change.
3. **Use launchd, not crontab.** macOS crontab is unreliable. All scheduled tasks go in `~/Library/LaunchAgents/` as plists.
4. **Absolute paths only in plists.** Never use `~` or `$HOME` in plist files — use `/Users/edge/`.
5. **Validate plists before loading.** Always run `plutil -lint <file>` before `launchctl bootstrap`.
6. **No raw Telegram commands via openclaw.** Use raw Bot API via curl. `openclaw telegram` commands don't exist.
7. **Do not use `getUpdates` to discover groups.** The gateway consumes updates. Group IDs are in config files.
8. **oMLX is the ONLY embedding provider.** Do not install Ollama. Do not use `provider: "ollama"` for embeddings — it uses a different API format. Use `provider: "openai"` with `remote.baseUrl: http://localhost:8000/v1`.
9. **Tell Ryan after completing each major phase.** He needs to confirm things look right from the outside (Telegram, email receipts, etc.).
10. **Standalone scripts via launchd** for scheduled tasks. NOT inside OpenClaw sessions.

---

## Before You Start

### Check What's Already Done
```bash
# Check if OpenClaw is installed
openclaw --version 2>/dev/null && echo "OpenClaw installed" || echo "Need to install OpenClaw"

# Check if oMLX is installed
which omlx 2>/dev/null && echo "oMLX installed" || echo "Need to install oMLX"

# Check if workspace exists
ls ~/.openclaw/workspace/SOUL.md 2>/dev/null && echo "Workspace cloned" || echo "Need to clone workspace"

# Check if credentials zip has been extracted
ls ~/Desktop/edge-credentials-extracted 2>/dev/null || ls ~/Downloads/edge-credentials-extracted 2>/dev/null && echo "Credentials extracted" || echo "Need to extract credentials zip"

# Check if Docker is installed
docker --version 2>/dev/null && echo "Docker installed" || echo "Need to install Docker"

# Check if Homebrew is installed
brew --version 2>/dev/null && echo "Homebrew installed" || echo "Need to install Homebrew"
```

Run this first and report the status to Ryan. Skip steps for things already done.

---

## Phase 1: Foundation (Steps 1–5)

### Step 1: Install Homebrew and Core Tools

**Why:** Everything depends on Homebrew. Node.js, oMLX, himalaya, gh all come through brew.

```bash
# Install Homebrew if not present
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"

# Install core packages
brew install node@22 gh himalaya

# Install oMLX (local inference — Apple Silicon optimized)
brew tap jundot/omlx
brew install omlx

# Add to PATH
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

**Verify:**
```bash
node --version     # v22.x.x
npm --version      # 10.x.x
gh --version       # gh version x.x.x
himalaya --version # himalaya v1.2.0+
which omlx         # /opt/homebrew/bin/omlx
```

**Troubleshooting:**
- If `omlx` is blocked by Gatekeeper: `xattr -dr com.apple.quarantine $(which omlx)`
- If node@22 not in PATH: `echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc`

---

### Step 2: Install Docker Desktop

**Why:** Neo4j knowledge graph runs in Docker.

```bash
# Download Docker Desktop from https://www.docker.com/products/docker-desktop/
# Install the arm64 .dmg. Open Docker Desktop after install and complete setup.
# Then verify:
docker --version
docker ps
# Should show empty container list
```

**Troubleshooting:** Docker Desktop must be open/running before `docker` CLI commands work. If it's not running: `open /Applications/Docker.app && sleep 20`

---

### Step 3: Configure Shell Environment

**Why:** Environment variables and aliases must be correct for all scripts to work.

```bash
cat > ~/.zshrc << 'EOF'
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
export NOTION_API_KEY=<FROM_CREDENTIALS_ZIP_zshrc>
export TAVILY_API_KEY=<FROM_CREDENTIALS_ZIP_zshrc>
export GOOGLE_MAPS_API_KEY=<FROM_CREDENTIALS_ZIP_zshrc>
# source "/Users/edge/.openclaw/completions/openclaw.zsh"   # uncomment after OpenClaw install
export PATH="$HOME/.local/bin:$PATH"
alias claude='claude --dangerously-skip-permissions'
alias codex='codex --dangerously-bypass-approvals-and-sandbox'
EOF

source ~/.zshrc
```

**Verify:**
```bash
echo $NOTION_API_KEY | head -c 10
# ntn_XXXXXX (first 10 chars of your Notion key)
```

---

### Step 4: Install OpenClaw

**Why:** OpenClaw is the agent runtime. Everything runs inside it.

```bash
# Try Homebrew tap first
brew tap openagent/openclaw && brew install openclaw 2>/dev/null

# If that fails, ask Ryan for the binary or download URL
# Place binary at /opt/homebrew/bin/openclaw and chmod +x

# Verify
openclaw --version

# Add shell completion
echo 'source "/Users/edge/.openclaw/completions/openclaw.zsh"' >> ~/.zshrc
```

**After install, run doctor:**
```bash
openclaw doctor --fix
```

---

### Step 5: Restore Credentials from Zip

**Why:** All secrets — API keys, auth tokens, SSH key, email password, Google service account — are in the zip. No credential is committed to git.

**Prerequisites:** Ryan has transferred `edge-credentials-mac-mini-2.zip` to this machine (USB, AirDrop, or similar).

```bash
# Find and extract the zip
cd ~/Desktop  # or ~/Downloads
ls edge-credentials-mac-mini-2.zip 2>/dev/null || ls ~/Downloads/edge-credentials-mac-mini-2.zip

unzip edge-credentials-mac-mini-2.zip -d edge-credentials-extracted
cd edge-credentials-extracted

# Create all destination directories
mkdir -p ~/.openclaw/{credentials,identity,nodes,agents}
mkdir -p ~/.config/{himalaya,gog}
mkdir -p ~/.omlx
mkdir -p ~/.ssh
mkdir -p ~/.openclaw/workspace/logs

# OpenClaw config
cp openclaw-config/openclaw.json ~/.openclaw/
cp openclaw-config/config.json ~/.openclaw/
cp openclaw-config/exec-approvals.json ~/.openclaw/
cp -r openclaw-config/nodes/ ~/.openclaw/nodes/
cp -r openclaw-config/agents/ ~/.openclaw/agents/ 2>/dev/null || true

# OpenClaw identity
cp -r openclaw-identity/* ~/.openclaw/identity/

# Telegram credentials
cp openclaw-credentials/telegram-default-allowFrom.json ~/.openclaw/credentials/
cp openclaw-credentials/telegram-pairing.json ~/.openclaw/credentials/

# Workspace env files (email password, OpenRouter key)
# NOTE: workspace must exist first — these go INTO the workspace
# If workspace not cloned yet, hold these until after Step 6
cp openclaw-workspace-env/.env.email ~/.openclaw/workspace/ 2>/dev/null || echo "Will copy after workspace clone"
cp openclaw-workspace-env/.env.openrouter ~/.openclaw/workspace/ 2>/dev/null || echo "Will copy after workspace clone"

# Google credentials
cp google/edge-service-account.json ~/.config/
chmod 600 ~/.config/edge-service-account.json
cp google/client_secret.json ~/.config/gog/

# Himalaya email config
cp himalaya/config.toml ~/.config/himalaya/

# oMLX settings
cp omlx/settings.json ~/.omlx/

# SSH keys
cp ssh/id_ed25519 ~/.ssh/
cp ssh/id_ed25519.pub ~/.ssh/
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub

cat > ~/.ssh/config << 'SSHEOF'
Host github.com
  IdentityFile ~/.ssh/id_ed25519
  AddKeysToAgent yes
SSHEOF
chmod 600 ~/.ssh/config
```

**Verify:**
```bash
# All critical files must exist
test -f ~/.openclaw/openclaw.json && echo "OK: openclaw.json"
test -f ~/.openclaw/credentials/telegram-pairing.json && echo "OK: telegram creds"
test -f ~/.config/edge-service-account.json && echo "OK: google SA"
test -f ~/.config/himalaya/config.toml && echo "OK: himalaya"
test -f ~/.omlx/settings.json && echo "OK: omlx settings"
test -f ~/.ssh/id_ed25519 && echo "OK: SSH key"

# Verify SSH works for GitHub
ssh -T git@github.com
# "Hi <username>! You've successfully authenticated..."
```

**Troubleshooting:**
- If any file is missing from the zip, stop and ask Ryan. Do not proceed without credentials.
- SSH "Host key verification failed": `ssh-keyscan github.com >> ~/.ssh/known_hosts`

---

## Phase 2: Repos and Workspace (Steps 6–7)

### Step 6: Clone Git Repos

**Why:** The install docs and Edge's workspace brain come from these two repos.

```bash
# Clone the install docs repo
git clone git@github.com:CarusoVentures/edge-install.git \
  -b deploy/mac-mini-2 \
  /Users/edge/edgebot-install

# Clone the workspace (Edge's brain)
# If ~/.openclaw/workspace/ already exists from OpenClaw's initial setup:
mv ~/.openclaw/workspace ~/.openclaw/workspace.initial-backup 2>/dev/null

git clone git@github.com:CarusoVentures/edge-workspace.git \
  -b deploy/mac-mini-2 \
  ~/.openclaw/workspace
```

**After cloning workspace, copy any env files that weren't placed yet:**
```bash
# Check if .env files need copying from extracted zip
ls ~/Desktop/edge-credentials-extracted/openclaw-workspace-env/ 2>/dev/null && \
  cp ~/Desktop/edge-credentials-extracted/openclaw-workspace-env/.env.* ~/.openclaw/workspace/
```

**Verify:**
```bash
ls ~/.openclaw/workspace/SOUL.md      # OK
ls ~/.openclaw/workspace/AGENTS.md    # OK
ls ~/.openclaw/workspace/package.json # OK
ls ~/.openclaw/workspace/.env.email   # OK (email password)
ls /Users/edge/edgebot-install/CLAUDE.md  # OK
```

---

### Step 7: Install Node.js Dependencies

**Why:** Scripts depend on `better-sqlite3`, `googleapis`, `neo4j-driver`, and `google-auth-library`.

```bash
cd ~/.openclaw/workspace
npm install
```

**Verify:**
```bash
node -e "require('better-sqlite3'); console.log('OK: better-sqlite3')"
node -e "require('googleapis'); console.log('OK: googleapis')"
node -e "require('neo4j-driver'); console.log('OK: neo4j-driver')"
node -e "require('google-auth-library'); console.log('OK: google-auth-library')"
```

**Troubleshooting:**
- `node-gyp` errors for `better-sqlite3`: `xcode-select --install && cd ~/.openclaw/workspace && npm rebuild better-sqlite3`
- Wrong Node version: ensure `/opt/homebrew/opt/node@22/bin` is first in PATH

---

## Phase 3: OpenClaw Configuration (Step 8)

### Step 8: Verify and Fix OpenClaw Config

**Why:** The openclaw.json from the old machine needs verification on the new machine. The gateway token may be a placeholder, and the embedding config must be correct.

```bash
# Run doctor first
openclaw doctor --fix

# Check gateway token
python3 -c "
import json
c = json.load(open('/Users/edge/.openclaw/openclaw.json'))
t = c.get('gateway', {}).get('auth', {}).get('token', 'NOT FOUND')
if t in ('REDACTED_ROTATE_THIS', '', 'NOT FOUND'):
    print('PROBLEM: Gateway token is', t)
else:
    print('OK: Gateway token set:', t[:10] + '...')
"

# If gateway token is placeholder, generate a real one:
python3 << 'PYEOF'
import json, secrets
with open('/Users/edge/.openclaw/openclaw.json', 'r') as f:
    config = json.load(f)
token = secrets.token_urlsafe(32)
config.setdefault('gateway', {}).setdefault('auth', {})['token'] = token
with open('/Users/edge/.openclaw/openclaw.json', 'w') as f:
    json.dump(config, f, indent=2)
print('New token:', token[:10] + '...')
PYEOF

# Check embedding config — MUST use "openai" provider pointing at localhost:8000
python3 -c "
import json
c = json.load(open('/Users/edge/.openclaw/openclaw.json'))
ms = c.get('agents', {}).get('defaults', {}).get('memorySearch', {})
provider = ms.get('provider', 'NOT SET')
baseUrl = ms.get('remote', {}).get('baseUrl', 'NOT SET')
print('Embedding provider:', provider, '(must be openai)')
print('Base URL:', baseUrl, '(must be http://localhost:8000/v1)')
if provider != 'openai':
    print('WARNING: Wrong provider! Must be openai, not', provider)
if baseUrl != 'http://localhost:8000/v1':
    print('WARNING: Wrong URL!')
"

# If embedding config is wrong, fix it:
python3 << 'PYEOF'
import json
with open('/Users/edge/.openclaw/openclaw.json', 'r') as f:
    config = json.load(f)
ms = config.setdefault('agents', {}).setdefault('defaults', {}).setdefault('memorySearch', {})
ms['provider'] = 'openai'
ms['model'] = 'mxbai-embed-large'
ms['enabled'] = True
ms['remote'] = {'baseUrl': 'http://localhost:8000/v1', 'apiKey': 'dummy'}
ms['chunking'] = {'tokens': 128, 'overlap': 24}
ms['query'] = {'hybrid': {'enabled': True, 'vectorWeight': 0.7, 'textWeight': 0.3}}
with open('/Users/edge/.openclaw/openclaw.json', 'w') as f:
    json.dump(config, f, indent=2)
print('Embedding config fixed')
PYEOF

openclaw doctor --fix
```

**Verify requireMentions=false in Telegram config:**
```bash
python3 -c "
import json
c = json.load(open('/Users/edge/.openclaw/openclaw.json'))
# Print full telegram/channel config for inspection
print(json.dumps(c.get('channels', c.get('telegram', {})), indent=2))
"
# requireMentions MUST be false — Edge must respond without being @mentioned
```

---

## Phase 4: oMLX Local Inference (Step 9)

### Step 9: Set Up oMLX and Pull Models

**Why:** oMLX provides the local models that run heartbeats (qwen3-8b) and embeddings (mxbai-embed-large). This is the ONLY local inference provider — no Ollama.

**Disk space needed:** ~9.3 GB. Time needed: 20–40 minutes on fast internet.

```bash
# Verify oMLX settings are in place
cat ~/.omlx/settings.json | python3 -c "import sys,json; s=json.load(sys.stdin); print('skip_api_key_verification:', s['auth']['skip_api_key_verification'])"
# Must be: True

# Start oMLX temporarily
omlx serve &
OMLX_PID=$!
sleep 5

# Verify server is up
curl -sS http://localhost:8000/v1/models && echo "oMLX server is up"

# Pull models (this takes a while)
omlx pull qwen3-8b
omlx pull mxbai-embed-large

# Verify both downloaded
omlx list
# Should show: qwen3-8b, mxbai-embed-large

# Test chat model
curl -sS http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"qwen3-8b","messages":[{"role":"user","content":"Say OK"}],"max_tokens":10}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['choices'][0]['message']['content'])"

# Test embedding model (CRITICAL — must return 1024 dims)
curl -sS http://localhost:8000/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"mxbai-embed-large","input":"test"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['data'][0]['embedding']; print(f'Embedding dims: {len(d)}')"
# Expected: Embedding dims: 1024

# Stop temporary instance
kill $OMLX_PID 2>/dev/null
sleep 2
```

**Create LaunchAgent (persistent oMLX service):**
```bash
cat > ~/Library/LaunchAgents/com.edge.omlx.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.edge.omlx</string>
    <key>ProgramArguments</key>
    <array>
        <string>/opt/homebrew/bin/omlx</string>
        <string>serve</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Users/edge/.openclaw/workspace/logs/omlx.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/edge/.openclaw/workspace/logs/omlx.stderr.log</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>HOME</key>
        <string>/Users/edge</string>
    </dict>
</dict>
</plist>
EOF

plutil -lint ~/Library/LaunchAgents/com.edge.omlx.plist && echo "Plist valid"
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.edge.omlx.plist
sleep 5
launchctl list | grep com.edge.omlx
curl -sS http://localhost:8000/v1/models > /dev/null && echo "OK: oMLX running as LaunchAgent"
```

**Troubleshooting:**
- Port 8000 in use: `lsof -i :8000` → kill conflicting process → retry
- LaunchAgent exits immediately: check `tail -20 ~/.openclaw/workspace/logs/omlx.stderr.log`
- Model pull hangs: use `omlx pull --verbose qwen3-8b` to see progress

---

## Phase 5: Neo4j Knowledge Graph (Step 10)

### Step 10: Deploy Neo4j Container and Restore Data

**Why:** Neo4j stores the temporal relationship graph that drives email urgency, meeting prep, and relationship state detection.

```bash
# Ensure Docker is running
docker info > /dev/null 2>&1 || (open /Applications/Docker.app && sleep 20)

# Create Neo4j container (APOC plugin required for KG queries)
docker run -d \
  --name edge-neo4j \
  -p 7474:7474 \
  -p 7687:7687 \
  --restart unless-stopped \
  -e NEO4J_AUTH=none \
  -e 'NEO4J_PLUGINS=["apoc"]' \
  -e NEO4J_server_memory_heap_initial__size=512m \
  -e NEO4J_server_memory_heap_max__size=1g \
  -v edge-neo4j-data:/data \
  neo4j:5-community

echo "Waiting for Neo4j to start (~30 seconds)..."
sleep 30

# Verify
docker ps | grep edge-neo4j && echo "Container running"
curl -sS http://localhost:7474 > /dev/null && echo "Neo4j browser port up"
```

**Restore knowledge graph data from zip:**
```bash
# Data is in: ~/Desktop/edge-credentials-extracted/docker-neo4j/data/
cd ~/Desktop/edge-credentials-extracted

# Stop container before data restore
docker stop edge-neo4j

# Copy data dump
docker cp docker-neo4j/data/. edge-neo4j:/data/

# Restart with restored data
docker start edge-neo4j
sleep 30

# Verify data loaded
docker exec edge-neo4j cypher-shell "MATCH (n) RETURN count(n) as total LIMIT 1;" 2>/dev/null
# Should return a number > 0 if data was restored
```

**Install Python dependencies for Graphiti API:**
```bash
pip3 install graphiti-core flask neo4j

python3 -c "import graphiti_core; print('graphiti-core OK')"
python3 -c "from flask import Flask; print('flask OK')"
python3 -c "from neo4j import GraphDatabase; print('neo4j OK')"
```

**Load Graphiti LaunchAgent:**
```bash
cat > ~/Library/LaunchAgents/com.edge.kg-api.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>com.edge.kg-api</string>
    <key>ProgramArguments</key><array>
        <string>/opt/homebrew/bin/python3</string>
        <string>/Users/edge/.openclaw/workspace/kg/graphiti-api.py</string>
        <string>--port</string>
        <string>8100</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>StandardOutPath</key><string>/Users/edge/.openclaw/workspace/logs/kg-api.stdout.log</string>
    <key>StandardErrorPath</key><string>/Users/edge/.openclaw/workspace/logs/kg-api.stderr.log</string>
    <key>EnvironmentVariables</key><dict>
        <key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key><string>/Users/edge</string>
    </dict>
</dict></plist>
EOF

plutil -lint ~/Library/LaunchAgents/com.edge.kg-api.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.edge.kg-api.plist
sleep 5
curl -sS http://localhost:8100/ 2>/dev/null && echo "Graphiti API up" || echo "Graphiti API starting (check logs)"
```

---

## Phase 6: Communications (Steps 11–13)

### Step 11: Verify Email (Himalaya)

**Why:** Email is Edge's primary data feed. Must be working before scheduled tasks start.

```bash
# Config is already in place from credentials zip
cat ~/.config/himalaya/config.toml

# Verify the email password file exists and has content
wc -c ~/.openclaw/workspace/.env.email
# Should be 17 bytes (16-char password + newline)

# Test IMAP
himalaya envelope list -f INBOX -s 5
# Should list 5 recent emails from edge@carusoventures.com
```

**Expected config:**
- Account: `edge` or `default`
- Email: `edge@carusoventures.com`
- IMAP: `imap.gmail.com:993` (TLS)
- SMTP: `smtp.gmail.com:465` (TLS)
- Auth: reads from `~/.openclaw/workspace/.env.email` via `cat` command

**Troubleshooting:**
- "Authentication failed": verify the Gmail App Password in `.env.email` is current. If expired, generate a new one in Google Account > Security > App Passwords, then update `.env.email`.
- "TLS error": ensure `encryption.type = "tls"` in config (not starttls)

---

### Step 12: Verify Google Calendar

**Why:** Meeting prep, scheduling, and daily briefing all depend on calendar access.

```bash
# Service account key should be in place
ls -la ~/.config/edge-service-account.json
# -rw------- (must be 600)

# Test calendar access
cd ~/.openclaw/workspace
node tools/quick-calendar.js
# Should list Dan's upcoming events

# If quick-calendar.js fails, test the auth directly
node -e "
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.HOME + '/.config/edge-service-account.json',
  scopes: ['https://www.googleapis.com/auth/calendar.readonly']
});
const cal = google.calendar({ version: 'v3', auth });
cal.calendarList.list().then(r => {
  console.log('OK: Calendar access working');
  console.log('Calendars:', r.data.items?.map(c => c.summary).join(', '));
}).catch(e => console.error('FAIL:', e.message));
"
```

**Troubleshooting:**
- "PERMISSION_DENIED": The service account may not be shared on Dan's calendar. Check Google Workspace admin that `edge-agent@edge-agent-491917.iam.gserviceaccount.com` has calendar access.
- "DECODER_ERROR" in key file: chmod 600 the file and verify the JSON is not corrupted.

---

### Step 13: Verify Telegram

**Why:** Telegram is Edge's primary communication channel with Dan and Emily.

```bash
# Get bot token from credentials
python3 -c "
import json, os
try:
    c = json.load(open(os.path.expanduser('~/.openclaw/credentials/telegram-pairing.json')))
    print(json.dumps(c, indent=2))
except Exception as e:
    print('Error:', e)
"

# Once you have the bot token, test it (replace BOT_TOKEN)
BOT_TOKEN="<token from above>"

curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/getMe" | python3 -m json.tool
# Should show: username: edgeventures1000, id: 8784533237

# Send a verification message to Ryan (ID: 7191564227)
curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d "chat_id=7191564227&text=Edge+setup+in+progress+on+new+Mac+Mini.+Telegram+verified."
```

**Ask Ryan:** Did you receive the Telegram message? If yes, Telegram is working.

**Known group IDs (from workspace config):**
```bash
cat ~/.openclaw/workspace/config/telegram-topics.json | python3 -m json.tool | head -20
# Edge HQ: -1003782657480
# Emily x Edge HQ: -1003833891427
```

---

## Phase 7: Scheduled Services (Step 14)

### Step 14: Deploy All LaunchAgents

**Why:** All scheduled tasks (briefings, email checks, CRM sync, etc.) run as launchd services.

**First, ensure all log directories exist:**
```bash
mkdir -p ~/.openclaw/workspace/logs
mkdir -p ~/.openclaw/workspace/crm/logs
```

**Check for existing plists from the workspace repo:**
```bash
# The workspace repo may include plist files in a launchagents/ directory
ls ~/.openclaw/workspace/launchagents/ 2>/dev/null
ls /Users/edge/edgebot-install/launchagents/ 2>/dev/null
```

If plist files exist in the repo, copy and load them:
```bash
# Copy from repo if present
cp ~/.openclaw/workspace/launchagents/*.plist ~/Library/LaunchAgents/ 2>/dev/null

# Otherwise create them (refer to SETUP.md Step 16 for full plist content)
```

**Load all LaunchAgents:**
```bash
LAUNCHD_DIR=~/Library/LaunchAgents

# Validate all
for plist in $LAUNCHD_DIR/com.edge.*.plist; do
  plutil -lint "$plist" && echo "Valid: $(basename $plist)" || echo "INVALID: $(basename $plist) — FIX BEFORE LOADING"
done

# Load each one (skip already-running services)
for plist in $LAUNCHD_DIR/com.edge.*.plist; do
  label=$(basename "$plist" .plist)
  if launchctl list | grep -q "$label"; then
    echo "Already loaded: $label"
  else
    launchctl bootstrap gui/$(id -u) "$plist" && echo "Loaded: $label" || echo "Failed: $label"
  fi
done
```

**Full scheduled services list:**

| Label | Schedule | Script |
|-------|----------|--------|
| `com.edge.omlx` | Always-on (KeepAlive) | omlx serve |
| `com.edge.kg-api` | Always-on (KeepAlive) | kg/graphiti-api.py |
| `com.edge.notion-sync` | Hourly at :00 | tools/notion-sync.js |
| `com.edge.crm-sync` | Hourly at :15 | crm/scripts/crm-sync.js |
| `com.edge.git-autosync` | Hourly at :45 | scripts/git-autosync.js |
| `com.edge.backup` | 2:00 AM daily | scripts/backup.js |
| `com.edge.cost-monitor` | Hourly (RunAtLoad) | scripts/cost-monitor.js |

Additional services (may need manual plist creation — see SETUP.md):
- Daily Briefing: 5:30 AM weekdays
- Meeting Prep: 6:30 AM daily
- Email Check: every 15 min
- Scheduling Heartbeat: every 30 min
- Nightman: 10:00 PM nightly
- Security Council: 3:30 AM nightly

**Verify all running:**
```bash
launchctl list | grep com.edge
# All should show with PID (not just exit code) for always-on services
```

---

## Phase 8: Final Verification (Step 15)

### Step 15: Full System Check

Run this complete verification. Every line should print "OK" or a meaningful result. Fix anything that prints "FAIL" before declaring setup complete.

```bash
echo "=============================="
echo "EDGE SYSTEM VERIFICATION"
echo "=============================="

fail=0

check() {
  local label="$1"
  shift
  if eval "$@" > /dev/null 2>&1; then
    echo "OK: $label"
  else
    echo "FAIL: $label"
    fail=$((fail + 1))
  fi
}

echo ""
echo "--- Tools ---"
check "Node.js v22" "node --version | grep -q v22"
check "npm" "npm --version"
check "OpenClaw" "openclaw --version"
check "himalaya" "himalaya --version"
check "omlx binary" "which omlx"
check "Docker" "docker --version"
check "gh CLI" "gh --version"
check "git" "git --version"
check "Python3" "python3 --version"

echo ""
echo "--- OpenClaw ---"
check "openclaw doctor" "openclaw doctor --fix 2>&1 | grep -v WARNING"
check "Gateway token set" "python3 -c \"import json; t=json.load(open('/Users/edge/.openclaw/openclaw.json')).get('gateway',{}).get('auth',{}).get('token',''); exit(0 if t and t != 'REDACTED_ROTATE_THIS' else 1)\""
check "Embedding config" "python3 -c \"import json; c=json.load(open('/Users/edge/.openclaw/openclaw.json')); ms=c.get('agents',{}).get('defaults',{}).get('memorySearch',{}); exit(0 if ms.get('provider')=='openai' else 1)\""

echo ""
echo "--- oMLX ---"
check "oMLX server up" "curl -sS http://localhost:8000/v1/models"
check "Chat model" "curl -sS http://localhost:8000/v1/chat/completions -H 'Content-Type: application/json' -d '{\"model\":\"qwen3-8b\",\"messages\":[{\"role\":\"user\",\"content\":\"OK\"}],\"max_tokens\":5}'"
check "Embeddings (1024 dims)" "curl -sS http://localhost:8000/v1/embeddings -H 'Content-Type: application/json' -d '{\"model\":\"mxbai-embed-large\",\"input\":\"test\"}' | python3 -c \"import sys,json; d=json.load(sys.stdin)['data'][0]['embedding']; exit(0 if len(d)==1024 else 1)\""

echo ""
echo "--- Neo4j ---"
check "Neo4j container running" "docker ps | grep -q edge-neo4j"
check "Neo4j browser port" "curl -sS http://localhost:7474"
check "Neo4j bolt port" "docker exec edge-neo4j cypher-shell 'RETURN 1;' 2>/dev/null"

echo ""
echo "--- Graphiti API ---"
check "Graphiti API" "curl -sS http://localhost:8100/ 2>/dev/null | head -1"

echo ""
echo "--- Email ---"
check "Email password file" "test -s ~/.openclaw/workspace/.env.email"
check "Himalaya config" "test -f ~/.config/himalaya/config.toml"
check "IMAP connection" "himalaya envelope list -f INBOX -s 1 2>/dev/null"

echo ""
echo "--- Google Services ---"
check "Service account key" "test -f ~/.config/edge-service-account.json"
check "Calendar access" "cd ~/.openclaw/workspace && node tools/quick-calendar.js 2>/dev/null"

echo ""
echo "--- Workspace ---"
check "SOUL.md" "test -f ~/.openclaw/workspace/SOUL.md"
check "AGENTS.md" "test -f ~/.openclaw/workspace/AGENTS.md"
check "TOOLS.md" "test -f ~/.openclaw/workspace/TOOLS.md"
check "MEMORY.md" "test -f ~/.openclaw/workspace/MEMORY.md"
check "node_modules" "test -d ~/.openclaw/workspace/node_modules"
check "better-sqlite3" "node -e \"require('better-sqlite3')\" 2>/dev/null"
check "googleapis" "node -e \"require('googleapis')\" 2>/dev/null"

echo ""
echo "--- LaunchAgents ---"
for label in com.edge.omlx com.edge.kg-api com.edge.notion-sync com.edge.crm-sync com.edge.git-autosync com.edge.backup; do
  if launchctl list | grep -q "$label"; then
    echo "OK: $label"
  else
    echo "FAIL: $label (not loaded)"
    fail=$((fail + 1))
  fi
done

echo ""
echo "--- SSH ---"
check "SSH key exists" "test -f ~/.ssh/id_ed25519"
check "SSH key permissions" "test $(stat -f %Lp ~/.ssh/id_ed25519) = '600'"

echo ""
echo "=============================="
if [ $fail -eq 0 ]; then
  echo "ALL CHECKS PASSED. Edge is ready."
else
  echo "$fail CHECK(S) FAILED. Fix before declaring setup complete."
fi
echo "=============================="
```

---

## Common Issues and Fixes

### OpenClaw crashes / all commands fail
```bash
# Unknown JSON key in openclaw.json
python3 -m json.tool ~/.openclaw/openclaw.json > /dev/null && echo "Valid JSON" || echo "Invalid JSON"
# If invalid: restore backup
cp ~/.openclaw/openclaw.json.bak ~/.openclaw/openclaw.json
```

### Embedding provider error
```bash
# Must be provider: "openai" NOT "ollama"
# The "openai" provider speaks /v1/embeddings format — compatible with oMLX
# The "ollama" provider speaks /api/embeddings format — NOT compatible with oMLX
# Fix: run the embedding config block in Step 8
```

### LaunchAgent loads but immediately exits
```bash
# Check stderr log
tail -20 ~/.openclaw/workspace/logs/AGENT.stderr.log
# Most common cause: wrong path in ProgramArguments
# Remember: no ~ in plist files. Must be /Users/edge/
# Validate: plutil -lint ~/Library/LaunchAgents/com.edge.AGENT.plist
```

### `npm install` fails (native module error)
```bash
xcode-select --install
cd ~/.openclaw/workspace
npm rebuild better-sqlite3
```

### Himalaya authentication error
```bash
# Check password
cat ~/.openclaw/workspace/.env.email
# Must be a 16-char Gmail App Password
# If expired: new app password from Google Account > Security > App Passwords
```

### Neo4j data not loaded after restore
```bash
# Verify the data copy location
docker exec edge-neo4j ls /data/
# Neo4j data goes in /data/databases/ and /data/transactions/
# After docker cp, restart is required: docker restart edge-neo4j
```

### Telegram bot not responding
```bash
# 1. Verify OpenClaw is running
openclaw status

# 2. Verify requireMentions=false in openclaw.json
python3 -c "import json; print(json.dumps(json.load(open('/Users/edge/.openclaw/openclaw.json')).get('channels', {}), indent=2))"

# 3. Verify bot token in credentials
cat ~/.openclaw/credentials/telegram-pairing.json

# 4. Test raw API
curl -sS "https://api.telegram.org/bot<TOKEN>/getMe"
```

---

## Key System Facts

| Item | Value |
|------|-------|
| Machine | Mac Mini M4 Pro, 24 GB RAM, arm64 |
| OS | macOS 15.6 Sequoia |
| User | edge, /Users/edge |
| OpenClaw path | /opt/homebrew/bin/openclaw |
| Workspace | /Users/edge/.openclaw/workspace/ |
| Node.js | v22.x.x at /opt/homebrew/opt/node@22/bin/node |
| Python | 3.9.6 at /usr/bin/python3 (also /opt/homebrew/bin/python3) |
| oMLX endpoint | http://localhost:8000 |
| Neo4j bolt | bolt://localhost:7687 |
| Neo4j browser | http://localhost:7474 |
| Graphiti API | http://localhost:8100 |
| Telegram bot | @edgeventures1000, ID 8784533237 |
| Edge HQ chat ID | -1003782657480 |
| Emily HQ chat ID | -1003833891427 |
| Email | edge@carusoventures.com (Gmail, App Password) |
| Service account | edge-agent@edge-agent-491917.iam.gserviceaccount.com |
| Timezone | America/Denver (Mountain Time) |

---

## After Setup: Tell Ryan

When all verification checks pass:
1. Tell Ryan "Setup complete — all checks green."
2. Have Ryan message Edge on Telegram to verify the bot responds.
3. Have Ryan or Dan check that the next Daily Briefing arrives at 5:30 AM MT.
4. Update the client profile in the install repo to reflect the new machine.
5. Make sure Dan knows Edge is back online.
