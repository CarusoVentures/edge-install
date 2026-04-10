# Edge Mac Mini Setup Guide
## Complete Deployment Reference for a New Mac Mini M4 Pro

**Last updated:** 2026-04-10
**Target machine:** Mac Mini M4 Pro, 24 GB RAM, macOS 15.6+, arm64
**User:** `edge` (home: `/Users/edge`)

---

## Overview

Edge is an AI executive assistant for Dan Caruso (Managing Director, Crusoe Ventures). It runs on OpenClaw, uses oMLX for local inference, and connects to Telegram, Gmail, Google Calendar, Notion, and a Neo4j knowledge graph.

**Two repos:**
- `CarusoVentures/edge-install` — deployment docs and skill guides (clone to `/Users/edge/edgebot-install/`)
- `CarusoVentures/edge-workspace` — Edge's brain (clone to `/Users/edge/.openclaw/workspace/`)

**Credentials:** `edge-credentials-mac-mini-2.zip` — transferred manually, never committed to git.

---

## Prerequisites

### Required macOS Version
macOS 15.4 Sequoia or later (arm64). Verify:
```bash
sw_vers
# ProductVersion: 15.x.x
# BuildVersion: arm64
uname -m
# arm64
```

### System Preferences
Before starting:
1. **Auto-login:** Enable for `edge` user (System Settings > General > Login Items & Extensions > Automatic Login). LaunchAgents require a user session to survive reboots.
2. **FileVault:** Should already be enabled (Layer 0.1).
3. **Sleep/screensaver:** Set display sleep to "Never" or a long interval. Disk sleep should allow wake.

---

## Step 1: Install Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Add to PATH for arm64 Mac
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

# Verify
brew --version
# Homebrew 4.x.x
```

---

## Step 2: Install Required Brew Packages

```bash
# Core tools
brew install node@22 gh git

# Google Calendar CLI
brew install gogcli

# Email CLI
brew install himalaya

# oMLX (local AI inference — tap required)
brew tap jundot/omlx
brew install omlx

# Global npm packages
npm install -g @openai/codex

# Add Node.js 22 to PATH
echo 'export PATH="/opt/homebrew/opt/node@22/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verify
node --version    # v22.x.x
npm --version     # 10.x.x
gh --version      # gh version x.x.x
himalaya --version  # himalaya v1.2.0+
which omlx        # /opt/homebrew/bin/omlx
```

---

## Step 3: Configure Shell Environment

```bash
# Write .zshrc (complete version — replace if exists)
cat > ~/.zshrc << 'EOF'
export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
export NOTION_API_KEY=<FROM_CREDENTIALS_ZIP_zshrc>
export TAVILY_API_KEY=<FROM_CREDENTIALS_ZIP_zshrc>
export GOOGLE_MAPS_API_KEY=<FROM_CREDENTIALS_ZIP_zshrc>

# OpenClaw shell completion (add after OpenClaw is installed)
# source "/Users/edge/.openclaw/completions/openclaw.zsh"
export PATH="$HOME/.local/bin:$PATH"

# Claude Code — skip permissions prompt (Edge is a trusted deployment machine)
alias claude='claude --dangerously-skip-permissions'

# Codex
alias codex='codex --dangerously-bypass-approvals-and-sandbox'
EOF

source ~/.zshrc
```

**Note:** The NOTION_API_KEY and TAVILY_API_KEY above are Edge's actual keys. They are also present in the credentials zip.

---

## Step 4: Install Xcode Command Line Tools

```bash
xcode-select --install
# Follow the GUI prompt if it appears
# Or verify already installed:
xcode-select -p
# /Library/Developer/CommandLineTools
```

---

## Step 5: GitHub Authentication

```bash
# Authenticate with GitHub CLI using the Edge GitHub account
# Ryan will provide the PAT or SSH key
gh auth login
# Choose: GitHub.com > SSH > Generate new SSH key (or use existing from credentials zip)

# Verify
gh auth status
# github.com: Logged in as <edge-account>
```

---

## Step 6: Install OpenClaw

OpenClaw is the agent runtime that hosts Edge. Install via Homebrew (if the tap is available) or from the release binary.

```bash
# Option A: Homebrew tap (preferred)
brew tap openagent/openclaw
brew install openclaw

# Option B: Direct binary install
# Download from OpenClaw releases — arm64 binary
# Place at /opt/homebrew/bin/openclaw
# chmod +x /opt/homebrew/bin/openclaw

# Verify
openclaw --version
# 2026.x.x

# Add completion to .zshrc (if not already there)
echo 'source "/Users/edge/.openclaw/completions/openclaw.zsh"' >> ~/.zshrc
```

**Initial setup:** After first install, OpenClaw creates `~/.openclaw/` directory. We will overwrite its config with the credentials zip in the next step.

---

## Step 7: Install Docker Desktop

Docker is required for the Neo4j knowledge graph container.

```bash
# Download Docker Desktop for Mac (Apple Silicon)
# From: https://www.docker.com/products/docker-desktop/
# Install the .dmg — drag to Applications

# After install, launch Docker Desktop from Applications
# Accept license, complete setup

# Verify (may need to open Docker Desktop first)
docker --version
# Docker version 27.x.x

docker ps
# Should return empty list (no containers yet)
```

---

## Step 8: Restore Credentials from Zip

**Requires:** `edge-credentials-mac-mini-2.zip` — transferred manually (USB drive or AirDrop from old Mac).

```bash
# Place zip on Desktop or in Downloads, then:
cd ~/Desktop   # or ~/Downloads

# Extract
unzip edge-credentials-mac-mini-2.zip -d edge-credentials-extracted
cd edge-credentials-extracted

# Create required directories
mkdir -p ~/.openclaw/credentials
mkdir -p ~/.openclaw/identity
mkdir -p ~/.openclaw/nodes
mkdir -p ~/.config/himalaya
mkdir -p ~/.config/gog
mkdir -p ~/.omlx
mkdir -p ~/.ssh
mkdir -p ~/.openclaw/workspace/logs

# --- OpenClaw Config ---
cp openclaw-config/openclaw.json ~/.openclaw/
cp openclaw-config/config.json ~/.openclaw/
cp openclaw-config/exec-approvals.json ~/.openclaw/
cp -r openclaw-config/nodes/ ~/.openclaw/nodes/     # Paired devices (Telegram, etc.)
cp -r openclaw-config/agents/ ~/.openclaw/agents/   # Model configuration

# --- OpenClaw Identity ---
cp -r openclaw-identity/* ~/.openclaw/identity/

# --- Telegram Credentials ---
cp openclaw-credentials/telegram-default-allowFrom.json ~/.openclaw/credentials/
cp openclaw-credentials/telegram-pairing.json ~/.openclaw/credentials/

# --- Email Environment ---
cp openclaw-workspace-env/.env.email ~/.openclaw/workspace/
cp openclaw-workspace-env/.env.openrouter ~/.openclaw/workspace/

# --- Google Service Account + OAuth ---
cp google/edge-service-account.json ~/.config/
chmod 600 ~/.config/edge-service-account.json
cp google/client_secret.json ~/.config/gog/

# --- Himalaya Email Config ---
cp himalaya/config.toml ~/.config/himalaya/

# --- oMLX Settings ---
cp omlx/settings.json ~/.omlx/

# --- SSH Keys ---
cp ssh/id_ed25519 ~/.ssh/
cp ssh/id_ed25519.pub ~/.ssh/
chmod 700 ~/.ssh
chmod 600 ~/.ssh/id_ed25519
chmod 644 ~/.ssh/id_ed25519.pub

# Create SSH config
cat > ~/.ssh/config << 'SSHEOF'
Host github.com
  IdentityFile ~/.ssh/id_ed25519
  AddKeysToAgent yes
SSHEOF
chmod 600 ~/.ssh/config

# Test SSH to GitHub
ssh -T git@github.com
# "Hi <username>! You've successfully authenticated..."

# --- Agents/Skills (if present) ---
if [ -d agents-skills ]; then
  mkdir -p ~/.agents
  cp -r agents-skills/ ~/.agents/
fi

# --- Shell configs (optional — may overwrite your .zshrc) ---
# Review before copying:
# cat shell-configs/.zshrc
# cp shell-configs/.zshrc ~/.zshrc
# cp shell-configs/.zprofile ~/.zprofile
```

**Verify key files are in place:**
```bash
ls ~/.openclaw/openclaw.json       # Main OpenClaw config
ls ~/.openclaw/credentials/        # telegram-pairing.json, telegram-default-allowFrom.json
ls ~/.config/edge-service-account.json  # Google service account
ls ~/.config/himalaya/config.toml  # Email config
ls ~/.omlx/settings.json           # oMLX settings
ls ~/.ssh/id_ed25519               # SSH private key
ls ~/.openclaw/workspace/.env.email  # Gmail app password
```

---

## Step 9: Clone the Git Repos

```bash
# Install repo (deploy docs)
git clone git@github.com:CarusoVentures/edge-install.git \
  -b deploy/mac-mini-2 \
  /Users/edge/edgebot-install

# Workspace repo (Edge's brain)
# IMPORTANT: Clone into the workspace directory that OpenClaw already created
# If the directory exists from OpenClaw's initial setup, move it first:
mv ~/.openclaw/workspace ~/.openclaw/workspace.initial-backup 2>/dev/null

git clone git@github.com:CarusoVentures/edge-workspace.git \
  -b deploy/mac-mini-2 \
  ~/.openclaw/workspace

# If workspace already has content from OpenClaw init, merge carefully:
# cp ~/.openclaw/workspace.initial-backup/some-file ~/.openclaw/workspace/
```

**Verify:**
```bash
ls ~/.openclaw/workspace/SOUL.md
ls ~/.openclaw/workspace/AGENTS.md
ls ~/.openclaw/workspace/package.json
ls /Users/edge/edgebot-install/CLAUDE.md
```

---

## Step 10: Install Node.js Workspace Dependencies

```bash
cd ~/.openclaw/workspace
npm install

# Verify key packages installed
ls node_modules/better-sqlite3/
ls node_modules/googleapis/
ls node_modules/neo4j-driver/
ls node_modules/google-auth-library/

# Expected packages (from package.json):
# better-sqlite3 ^12.8.0
# google-auth-library ^10.6.2
# googleapis ^171.4.0
# neo4j-driver ^6.0.1
```

**Note:** `better-sqlite3` is a native module that compiles against the local Node.js version. If you see node-gyp errors, ensure Xcode CLT is installed and run `npm rebuild`.

---

## Step 11: Configure OpenClaw

### Run Doctor
```bash
openclaw doctor --fix
# Should report no errors
```

### Verify Key Config Values
```bash
# Check gateway token is not placeholder
python3 -c "
import json
c = json.load(open('/Users/edge/.openclaw/openclaw.json'))
t = c.get('gateway', {}).get('auth', {}).get('token', 'NOT FOUND')
if t == 'REDACTED_ROTATE_THIS':
    print('ERROR: Gateway token is still placeholder!')
elif t == 'NOT FOUND':
    print('ERROR: No gateway token configured')
else:
    print('OK: Gateway token is', t[:10] + '...')
"

# Check primary model
python3 -c "
import json
c = json.load(open('/Users/edge/.openclaw/openclaw.json'))
print('Model config present:', 'agents' in c or 'model' in c)
"

# Check embedding config (oMLX via openai adapter)
python3 -c "
import json
c = json.load(open('/Users/edge/.openclaw/openclaw.json'))
ms = c.get('agents', {}).get('defaults', {}).get('memorySearch', {})
print('Embedding provider:', ms.get('provider', 'NOT SET'))
print('Embedding model:', ms.get('model', 'NOT SET'))
print('Remote baseUrl:', ms.get('remote', {}).get('baseUrl', 'NOT SET'))
"
# Expected:
# Embedding provider: openai
# Embedding model: mxbai-embed-large
# Remote baseUrl: http://localhost:8000/v1
```

### Verify Telegram Config
```bash
# Check Telegram pairing
cat ~/.openclaw/credentials/telegram-pairing.json
# Should contain bot token and pairing info

cat ~/.openclaw/credentials/telegram-default-allowFrom.json
# Should contain Dan's and Emily's Telegram user IDs
```

### Verify requireMentions is false for all groups
```bash
python3 -c "
import json
c = json.load(open('/Users/edge/.openclaw/openclaw.json'))
# Find telegram channel config
telegram = c.get('channels', {}).get('telegram', c.get('telegram', {}))
print(json.dumps(telegram, indent=2))
"
# requireMentions MUST be false — Edge must respond in all groups without being @mentioned
```

---

## Step 12: Set Up oMLX (Local Inference)

### Start oMLX Temporarily
```bash
# Check if oMLX server is already configured in credentials
cat ~/.omlx/settings.json | python3 -m json.tool | head -20

# Start temporarily to pull models
omlx serve &
OMLX_PID=$!

# Wait for startup
sleep 5

# Verify server is up
curl -sS http://localhost:8000/v1/models | python3 -m json.tool
```

### Pull Models (~9.3GB total — will take time)
```bash
# Chat model (Qwen 3 8B, Q4 quantization, ~5GB)
omlx pull qwen3-8b

# Embedding model (mxbai-embed-large, ~1.2GB, 1024 dims)
omlx pull mxbai-embed-large

# Verify both are available
omlx list
# Should show: qwen3-8b, mxbai-embed-large

# Stop the temporary server
kill $OMLX_PID 2>/dev/null
sleep 2
```

**If Gatekeeper blocks omlx:**
```bash
xattr -dr com.apple.quarantine $(which omlx)
```

### Create oMLX LaunchAgent
```bash
mkdir -p ~/.openclaw/workspace/logs

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

# Validate and load
plutil -lint ~/Library/LaunchAgents/com.edge.omlx.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.edge.omlx.plist

# Wait and verify
sleep 5
launchctl list | grep com.edge.omlx
curl -sS http://localhost:8000/v1/models | python3 -m json.tool
```

### Verify oMLX End-to-End
```bash
# Test chat
curl -sS http://localhost:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-8b",
    "messages": [{"role": "user", "content": "Say OK in one word."}],
    "max_tokens": 10
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['choices'][0]['message']['content'])"

# Test embeddings
curl -sS http://localhost:8000/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model": "mxbai-embed-large", "input": "test"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['data'][0]['embedding']; print(f'OK: {len(d)} dims')"
# Expected: OK: 1024 dims
```

**Note on embedding config:** OpenClaw uses the `"openai"` provider adapter pointing at `http://localhost:8000/v1`. This is NOT the OpenAI API — it's the oMLX server using the OpenAI-compatible API format. The `"ollama"` adapter will NOT work with oMLX. Do not change this.

---

## Step 13: Deploy Neo4j (Knowledge Graph)

### Start Docker and Deploy Container
```bash
# Ensure Docker Desktop is running (open from Applications if needed)
docker info > /dev/null 2>&1 || open /Applications/Docker.app && sleep 10

# Create Neo4j container with persistent volume, APOC plugin, and heap settings
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

# Wait for startup (~30 seconds)
sleep 30

# Verify
docker ps | grep edge-neo4j
curl -sS http://localhost:7474 | head -5
```

### Restore Neo4j Data from Zip
```bash
# Data is in the credentials zip under docker-neo4j/data/
cd ~/Desktop/edge-credentials-extracted  # or wherever you unzipped

# Copy database dump into container
docker cp docker-neo4j/data/. edge-neo4j:/data/

# Restart container to load the restored data
docker restart edge-neo4j
sleep 30

# Verify data is loaded
docker exec edge-neo4j cypher-shell -u neo4j -p "" "MATCH (n) RETURN count(n) as total_nodes;" 2>/dev/null || \
docker exec edge-neo4j cypher-shell "MATCH (n) RETURN count(n) as total_nodes;"
# Should return a non-zero count if data was restored
```

### Install Python Dependencies for Graphiti API
```bash
# Install pip if not available
python3 -m ensurepip --upgrade 2>/dev/null || true

# Install Graphiti and Flask
pip3 install graphiti-core flask neo4j

# Verify
python3 -c "import graphiti_core; print('graphiti-core OK')"
python3 -c "import flask; print('flask OK')"
python3 -c "import neo4j; print('neo4j driver OK')"
```

### Deploy Graphiti LaunchAgent
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

# Also ensure Neo4j container restarts with Docker
cat > ~/Library/LaunchAgents/com.edge.neo4j.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>com.edge.neo4j</string>
    <key>ProgramArguments</key><array>
        <string>/usr/local/bin/docker</string>
        <string>start</string>
        <string>edge-neo4j</string>
    </array>
    <key>RunAtLoad</key><true/>
    <key>StandardOutPath</key><string>/Users/edge/.openclaw/workspace/logs/neo4j-restart.stdout.log</string>
    <key>StandardErrorPath</key><string>/Users/edge/.openclaw/workspace/logs/neo4j-restart.stderr.log</string>
    <key>EnvironmentVariables</key><dict>
        <key>HOME</key><string>/Users/edge</string>
        <key>PATH</key><string>/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict></plist>
EOF

plutil -lint ~/Library/LaunchAgents/com.edge.kg-api.plist
plutil -lint ~/Library/LaunchAgents/com.edge.neo4j.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.edge.kg-api.plist

# Verify Graphiti API
sleep 5
curl -sS http://localhost:8100/api/health 2>/dev/null || curl -sS http://localhost:8100/ 2>/dev/null
```

---

## Step 14: Verify Email (Himalaya)

```bash
# Himalaya config should already be in place from Step 8
cat ~/.config/himalaya/config.toml

# Verify the email password file exists
cat ~/.openclaw/workspace/.env.email
# Should print the Gmail App Password (16-char string)

# Test IMAP connection
himalaya envelope list --account edge -f INBOX -s 5
# Should list 5 recent emails from edge@carusoventures.com

# Test a specific email read
himalaya message read 1 --account edge
```

**Himalaya config reference:**
- IMAP: `imap.gmail.com:993` (TLS)
- SMTP: `smtp.gmail.com:465` (TLS)
- Auth: reads password from `~/.openclaw/workspace/.env.email` via `cat` command
- Account name: `edge` (or `default`)

---

## Step 15: Verify Google Calendar (Service Account)

```bash
# Verify service account key is in place
ls -la ~/.config/edge-service-account.json
# -rw------- (600 permissions)

# Test calendar access
cd ~/.openclaw/workspace
node tools/quick-calendar.js
# Should list Dan's upcoming events

# Manual API test
node -e "
const { google } = require('googleapis');
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.HOME + '/.config/edge-service-account.json',
  scopes: ['https://www.googleapis.com/auth/calendar.readonly']
});
const cal = google.calendar({ version: 'v3', auth });
cal.calendarList.list().then(r => {
  console.log('Calendars accessible:', r.data.items?.length || 0);
  r.data.items?.forEach(c => console.log(' -', c.summary));
}).catch(e => console.error('Error:', e.message));
"
```

---

## Step 16: Deploy All LaunchAgents (Scheduled Services)

The workspace has these scheduled services. Load them all:

```bash
LAUNCHD_DIR=~/Library/LaunchAgents
WORKSPACE=/Users/edge/.openclaw/workspace
NODE=/opt/homebrew/opt/node@22/bin/node

# Create all LaunchAgent plists
# (These should already exist in the LaunchAgents directory if restoring from backup,
#  or need to be created fresh as below)

# --- Notion Sync (hourly at :00) ---
cat > $LAUNCHD_DIR/com.edge.notion-sync.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>com.edge.notion-sync</string>
    <key>ProgramArguments</key><array>
        <string>/opt/homebrew/opt/node@22/bin/node</string>
        <string>/Users/edge/.openclaw/workspace/tools/notion-sync.js</string>
    </array>
    <key>StartCalendarInterval</key><dict><key>Minute</key><integer>0</integer></dict>
    <key>StandardOutPath</key><string>/Users/edge/.openclaw/workspace/logs/notion-sync.stdout.log</string>
    <key>StandardErrorPath</key><string>/Users/edge/.openclaw/workspace/logs/notion-sync.stderr.log</string>
    <key>EnvironmentVariables</key><dict>
        <key>PATH</key><string>/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
        <key>HOME</key><string>/Users/edge</string>
    </dict>
    <key>WorkingDirectory</key><string>/Users/edge/.openclaw/workspace</string>
</dict></plist>
EOF

# --- CRM Sync (hourly at :15) ---
cat > $LAUNCHD_DIR/com.edge.crm-sync.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>com.edge.crm-sync</string>
    <key>ProgramArguments</key><array>
        <string>/opt/homebrew/opt/node@22/bin/node</string>
        <string>/Users/edge/.openclaw/workspace/crm/scripts/crm-sync.js</string>
    </array>
    <key>StartCalendarInterval</key><dict><key>Minute</key><integer>15</integer></dict>
    <key>StandardOutPath</key><string>/Users/edge/.openclaw/workspace/crm/logs/crm-sync.stdout.log</string>
    <key>StandardErrorPath</key><string>/Users/edge/.openclaw/workspace/crm/logs/crm-sync.stderr.log</string>
    <key>EnvironmentVariables</key><dict>
        <key>PATH</key><string>/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
        <key>HOME</key><string>/Users/edge</string>
    </dict>
    <key>WorkingDirectory</key><string>/Users/edge/.openclaw/workspace</string>
</dict></plist>
EOF

# --- Git Autosync (hourly at :45) ---
cat > $LAUNCHD_DIR/com.edge.git-autosync.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>com.edge.git-autosync</string>
    <key>ProgramArguments</key><array>
        <string>/opt/homebrew/opt/node@22/bin/node</string>
        <string>/Users/edge/.openclaw/workspace/scripts/git-autosync.js</string>
    </array>
    <key>StartCalendarInterval</key><dict><key>Minute</key><integer>45</integer></dict>
    <key>StandardOutPath</key><string>/Users/edge/.openclaw/workspace/logs/git-autosync.stdout.log</string>
    <key>StandardErrorPath</key><string>/Users/edge/.openclaw/workspace/logs/git-autosync.stderr.log</string>
    <key>EnvironmentVariables</key><dict>
        <key>PATH</key><string>/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
        <key>HOME</key><string>/Users/edge</string>
    </dict>
    <key>WorkingDirectory</key><string>/Users/edge/.openclaw/workspace</string>
</dict></plist>
EOF

# --- Nightly Backup (2:00 AM) ---
cat > $LAUNCHD_DIR/com.edge.backup.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>com.edge.backup</string>
    <key>ProgramArguments</key><array>
        <string>/opt/homebrew/opt/node@22/bin/node</string>
        <string>/Users/edge/.openclaw/workspace/scripts/backup.js</string>
    </array>
    <key>StartCalendarInterval</key><dict><key>Hour</key><integer>2</integer><key>Minute</key><integer>0</integer></dict>
    <key>StandardOutPath</key><string>/Users/edge/.openclaw/workspace/logs/backup.stdout.log</string>
    <key>StandardErrorPath</key><string>/Users/edge/.openclaw/workspace/logs/backup.stderr.log</string>
    <key>EnvironmentVariables</key><dict>
        <key>PATH</key><string>/opt/homebrew/opt/node@22/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
        <key>HOME</key><string>/Users/edge</string>
    </dict>
    <key>WorkingDirectory</key><string>/Users/edge/.openclaw/workspace</string>
</dict></plist>
EOF

# --- Cost Monitor (hourly) ---
cat > $LAUNCHD_DIR/com.edge.cost-monitor.plist << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
    <key>Label</key><string>com.edge.cost-monitor</string>
    <key>ProgramArguments</key><array>
        <string>/opt/homebrew/opt/node@22/bin/node</string>
        <string>/Users/edge/.openclaw/workspace/scripts/cost-monitor.js</string>
    </array>
    <key>StartInterval</key><integer>3600</integer>
    <key>RunAtLoad</key><true/>
    <key>StandardOutPath</key><string>/Users/edge/.openclaw/workspace/logs/cost-monitor.stdout.log</string>
    <key>StandardErrorPath</key><string>/Users/edge/.openclaw/workspace/logs/cost-monitor.stderr.log</string>
    <key>EnvironmentVariables</key><dict>
        <key>HOME</key><string>/Users/edge</string>
        <key>PATH</key><string>/opt/homebrew/bin:/opt/homebrew/opt/node@22/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>
</dict></plist>
EOF

# Validate all plists
for plist in $LAUNCHD_DIR/com.edge.*.plist; do
  plutil -lint "$plist" && echo "OK: $(basename $plist)" || echo "FAIL: $(basename $plist)"
done

# Load all (skip omlx and kg-api — loaded earlier)
for plist in \
  $LAUNCHD_DIR/com.edge.notion-sync.plist \
  $LAUNCHD_DIR/com.edge.crm-sync.plist \
  $LAUNCHD_DIR/com.edge.git-autosync.plist \
  $LAUNCHD_DIR/com.edge.backup.plist \
  $LAUNCHD_DIR/com.edge.cost-monitor.plist; do
  launchctl bootstrap gui/$(id -u) "$plist" 2>/dev/null && echo "Loaded: $(basename $plist)" || echo "Already loaded or error: $(basename $plist)"
done

# Verify all running
launchctl list | grep com.edge
```

**Scheduled service summary:**

| Service | Schedule | Script |
|---------|----------|--------|
| Daily Briefing | 5:30 AM weekdays | `scripts/daily-briefing.js` |
| Meeting Prep | 6:30 AM daily | `scripts/meeting-prep.js` |
| Email Check | Every 15 min | `scripts/email-check.js` |
| Scheduling Heartbeat | Every 30 min | `scripts/scheduling-heartbeat.js` |
| Notion Sync | Hourly at :00 | `tools/notion-sync.js` |
| CRM Sync | Hourly at :15 | `crm/scripts/crm-sync.js` |
| Git Autosync | Hourly at :45 | `scripts/git-autosync.js` |
| Transcript Pipeline | Every 2 hours | `scripts/transcript-pipeline.js` |
| Contact Enrichment | 5:00 AM daily | `scripts/contact-enrichment.js` |
| Nightman | 10:00 PM nightly | `scripts/nightshift.js` |
| Backup | 2:00 AM nightly | `scripts/backup.js` |
| Security Council | 3:30 AM nightly | `scripts/security-council.js` |
| KG API | Always-on | `kg/graphiti-api.py` |
| oMLX Server | Always-on | `omlx serve` |
| Cost Monitor | Hourly | `scripts/cost-monitor.js` |

---

## Step 17: Configure OpenClaw for New Machine

The credentials zip contains `openclaw.json` from the old machine. Some values may need updating for the new machine:

```bash
# Generate a new gateway token (good practice on new machine)
python3 << 'PYEOF'
import json, secrets

with open('/Users/edge/.openclaw/openclaw.json', 'r') as f:
    config = json.load(f)

# Check current token
current = config.get('gateway', {}).get('auth', {}).get('token', '')
if current == 'REDACTED_ROTATE_THIS' or not current:
    # Generate new token
    token = secrets.token_urlsafe(32)
    config.setdefault('gateway', {}).setdefault('auth', {})['token'] = token
    with open('/Users/edge/.openclaw/openclaw.json', 'w') as f:
        json.dump(config, f, indent=2)
    print(f'New gateway token: {token[:10]}...')
else:
    print(f'Gateway token already set: {current[:10]}...')
PYEOF

# Verify config is healthy
openclaw doctor --fix
```

**CRITICAL: Never write unknown JSON keys to openclaw.json.** Unknown keys cause ALL OpenClaw CLI commands to fail. Always read the schema first, edit carefully with Python's json module, and run `openclaw doctor --fix` after every change.

---

## Step 18: Verify Telegram Connectivity

```bash
# Get bot token from credentials
BOT_TOKEN=$(python3 -c "
import json
try:
    c = json.load(open('/Users/edge/.openclaw/credentials/telegram-pairing.json'))
    # Key structure depends on OpenClaw version
    print(c.get('token') or c.get('botToken') or list(c.values())[0])
except Exception as e:
    print('ERROR reading token:', e)
")

# Test bot connectivity
curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/getMe" | python3 -m json.tool
# Should return bot info: username @edgeventures1000

# Send test message to Ryan (ID: 7191564227) to verify connectivity
# (Ask Ryan to confirm receipt)
curl -sS "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
  -d "chat_id=7191564227&text=Edge+is+back+online+on+new+Mac+Mini."
```

**Important:** Do NOT use `openclaw telegram` commands — they don't exist. Always use raw Bot API via curl.
Do NOT use `getUpdates` to discover groups — the gateway consumes updates. Group IDs are in `~/.openclaw/workspace/config/telegram-topics.json`.

**Known group IDs:**
- Edge HQ (Dan's group): `-1003782657480`
- Emily x Edge HQ: `-1003833891427`

---

## Step 19: Set Up CLAUDE.md for Workspace

Ensure the workspace has the proper CLAUDE.md so Claude Code has full context when working in it.

```bash
# Check if CLAUDE.md exists in workspace
ls ~/.openclaw/workspace/CLAUDE.md 2>/dev/null || echo "No CLAUDE.md — see edgebot-install/CLAUDE.md"

# The install repo CLAUDE.md is the authoritative context file
# It should be symlinked or copied:
cp /Users/edge/edgebot-install/CLAUDE.md ~/.openclaw/workspace/CLAUDE.md

# Or create a workspace CLAUDE.md that points to the full context
cat ~/.openclaw/workspace/CLAUDE.md | head -5
```

---

## Step 20: Final Verification Checklist

Run each check in order. All must pass before Edge is considered operational.

```bash
echo "=== EDGE SYSTEM VERIFICATION ==="
echo ""

echo "--- 1. Core Tools ---"
node --version && echo "OK: Node.js" || echo "FAIL: Node.js"
npm --version && echo "OK: npm" || echo "FAIL: npm"
which himalaya && echo "OK: himalaya" || echo "FAIL: himalaya"
which omlx && echo "OK: omlx" || echo "FAIL: omlx"
openclaw --version && echo "OK: OpenClaw" || echo "FAIL: OpenClaw"
docker --version && echo "OK: Docker" || echo "FAIL: Docker"
gh --version && echo "OK: GitHub CLI" || echo "FAIL: gh"

echo ""
echo "--- 2. OpenClaw Config ---"
openclaw doctor --fix && echo "OK: openclaw doctor" || echo "FAIL: openclaw doctor"

echo ""
echo "--- 3. oMLX Server ---"
curl -sS http://localhost:8000/v1/models > /dev/null 2>&1 && echo "OK: oMLX server up" || echo "FAIL: oMLX server down"
curl -sS http://localhost:8000/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"mxbai-embed-large","input":"test"}' 2>/dev/null \
  | python3 -c "import sys,json; d=json.load(sys.stdin)['data'][0]['embedding']; print(f'OK: embeddings ({len(d)} dims)')" \
  || echo "FAIL: embeddings"

echo ""
echo "--- 4. Neo4j / Knowledge Graph ---"
docker ps | grep -q edge-neo4j && echo "OK: Neo4j container running" || echo "FAIL: Neo4j container not running"
curl -sS http://localhost:7474 > /dev/null 2>&1 && echo "OK: Neo4j browser port" || echo "FAIL: Neo4j browser port"
curl -sS http://localhost:8100/api/health > /dev/null 2>&1 && echo "OK: Graphiti API" || echo "WARN: Graphiti API (check logs)"

echo ""
echo "--- 5. Email ---"
himalaya envelope list -f INBOX -s 3 > /dev/null 2>&1 && echo "OK: IMAP email" || echo "FAIL: IMAP email"

echo ""
echo "--- 6. Google Calendar ---"
node /Users/edge/.openclaw/workspace/tools/quick-calendar.js > /dev/null 2>&1 && echo "OK: Calendar" || echo "FAIL: Calendar"

echo ""
echo "--- 7. Workspace ---"
test -f ~/.openclaw/workspace/SOUL.md && echo "OK: SOUL.md" || echo "FAIL: SOUL.md"
test -f ~/.openclaw/workspace/AGENTS.md && echo "OK: AGENTS.md" || echo "FAIL: AGENTS.md"
test -d ~/.openclaw/workspace/node_modules && echo "OK: node_modules" || echo "FAIL: node_modules (run npm install)"

echo ""
echo "--- 8. Credentials ---"
test -f ~/.config/edge-service-account.json && echo "OK: Google service account" || echo "FAIL: service account"
test -f ~/.config/himalaya/config.toml && echo "OK: himalaya config" || echo "FAIL: himalaya config"
test -f ~/.openclaw/workspace/.env.email && echo "OK: email password" || echo "FAIL: email password"
test -f ~/.ssh/id_ed25519 && echo "OK: SSH key" || echo "FAIL: SSH key"

echo ""
echo "--- 9. LaunchAgents ---"
launchctl list | grep com.edge | awk '{print "LaunchAgent:", $3}'

echo ""
echo "=== VERIFICATION COMPLETE ==="
```

---

## Troubleshooting

### OpenClaw won't start / all CLI commands fail
Unknown JSON keys in `openclaw.json` cause total CLI failure. Fix:
```bash
# Restore last known-good backup
cp ~/.openclaw/openclaw.json.bak ~/.openclaw/openclaw.json
openclaw doctor --fix
```

### oMLX: port 8000 already in use
```bash
lsof -i :8000
kill <PID>
launchctl kickstart -k gui/$(id -u)/com.edge.omlx
```

### Neo4j won't start
```bash
docker logs edge-neo4j --tail 50
# If "data directory already in use":
docker stop edge-neo4j && docker start edge-neo4j
```

### Email auth fails (himalaya)
```bash
# Verify password file
cat ~/.openclaw/workspace/.env.email
# Should contain 16-char Gmail App Password
# If expired, generate a new one in Google Account > Security > App Passwords
```

### LaunchAgent not loading
```bash
# Always validate plist first
plutil -lint ~/Library/LaunchAgents/com.edge.AGENT.plist
# Never use ~ or $HOME in plist paths — use /Users/edge/
# Check logs
tail -f ~/.openclaw/workspace/logs/AGENT.stderr.log
```

### GitHub SSH auth fails
```bash
# Verify key is added to GitHub
ssh -T git@github.com
# If fails:
cat ~/.ssh/id_ed25519.pub
# Add this public key to GitHub account settings
```

### `npm install` fails for better-sqlite3
```bash
# Ensure Xcode CLT is installed
xcode-select --install
# Then rebuild:
cd ~/.openclaw/workspace && npm rebuild better-sqlite3
```

---

## Architecture Notes

- **No Ollama** — oMLX is the ONLY local inference provider. Do not install Ollama.
- **Embedding config:** Must use `provider: "openai"` with `remote.baseUrl: http://localhost:8000/v1` in OpenClaw config. The "openai" here is the API protocol, not the company.
- **launchd only** — Never use crontab on macOS. All scheduled tasks use launchd plists in `~/Library/LaunchAgents/`.
- **Absolute paths only** in plists — no `~` or `$HOME`.
- **Human-in-the-loop** — Edge never sends emails, posts to contacts, or modifies external systems without Emily or Dan approval.
- **Auto-login must be ON** — LaunchAgents require a user session to survive power outages.
- **No ClawHub skills** — custom-built or OpenClaw built-in only.
