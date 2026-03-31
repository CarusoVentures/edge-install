# Deploy Security Council v2

## Compatibility
- **OpenClaw Version**: 2026.2.26+
- **Status**: READY
- **Architecture**: Standalone (no OpenClaw CLI dependencies for scheduling, config, or model routing)
- **Platform**: macOS (launchd). Adaptable to Linux (systemd timers) or Windows (schtasks).
- **Replaces**: `deploy-security-council.md` (BLOCKED -- referenced 6 nonexistent CLI commands and required a separate API key through the wrong mechanism)

## Purpose

Install a nightly 4-perspective AI security review that runs as a standalone system on the client's machine. Four specialized security personas analyze the system baseline independently, an operational realism filter removes false positives, and findings are deduplicated against the last 7 days before delivery via Telegram (summary) and optionally email (full HTML report).

This is a **standalone script architecture** -- it does NOT run inside an OpenClaw session. Running inside a session would cause context overflow on large baselines. Instead, `security-council.js` calls the Anthropic API directly using the client's API key stored in a local `.env` file.

**When to use:** After the core workspace is set up on any machine with a codebase to protect. Provides ongoing, multi-perspective security oversight without manual effort.

**What this skill does:**
1. Creates security-council config and data directories
2. Stores API keys (Anthropic for Claude analysis) and Telegram credentials
3. Installs 4 security persona prompt files
4. Installs baseline collection script (`collect-baseline.sh`)
5. Installs orchestrator script (`security-council.js`) -- standalone, calls Claude API directly
6. Installs HTML report renderer (`render-security-email.js`)
7. Initializes SQLite database (runs, findings, persona_outputs)
8. Schedules nightly execution at 3:30 AM via launchd
9. Runs verification: test review, SQLite storage, Telegram delivery, dedup confirmation

## How Commands Are Sent

This skill is executed by an operator who has an active remote session.
See `_deploy-common.md` -> "Command Delivery" for the full protocol.

- **Remote:** commands sent via `POST /api/sessions/${SESSION_ID}/commands` or device exec API
- **Operator:** commands run on the operator's local terminal

## Variables

Resolve these before executing. Sources are listed for each.

| Variable | Source | Example |
|----------|--------|---------|
| `${WORKSPACE}` | Client profile: workspace path | `/Users/edge/.openclaw/workspace/` |
| `${SESSION_ID}` | Session polling or creation | `sess_abc123` |
| `${DEVICE_ID}` | Device enrollment | `dev_xyz789` |
| `${BEARER}` | Operator login response | `eyJhbG...` |
| `${ANTHROPIC_API_KEY}` | Operator: client's Anthropic API key | `sk-ant-api03-...` |
| `${TELEGRAM_BOT_TOKEN}` | Client profile: agent bot token | `7123456789:AAF...` |
| `${TELEGRAM_CHAT_ID}` | Client profile: client's Telegram user ID | `8730867387` |
| `${TIMEZONE}` | Client profile: timezone | `America/Denver` |
| `${AGENT_USER}` | `whoami` on client machine | `edge` |
| `${AGENT_HOME}` | Home directory resolved from `${AGENT_USER}` | `/Users/edge` |
| `${EMAIL_RECIPIENT}` | Client profile: email for HTML reports (optional) | `dan@example.com` |

## Before You Start

Follow the **Standard Deployment Protocol** in `_deploy-common.md`: read the client profile, check what exists, identify adaptations, and present a deployment plan before executing.

**Pre-flight checks for this skill:**

Check if the security council is already deployed:

**Remote:**
```
ls ${WORKSPACE}/security-council/ 2>/dev/null && echo 'EXISTS' || echo 'NOT_DEPLOYED'
```

Check if Node.js is available and verify version:

**Remote:**
```
node --version && npm --version
```

Expected: Node.js v18+ and npm. If not installed, install Node.js first.

Check if SQLite3 is available (needed by better-sqlite3 npm package):

**Remote:**
```
which sqlite3 && sqlite3 --version
```

Check if himalaya is available for optional HTML email delivery:

**Remote:**
```
which himalaya 2>/dev/null && echo 'AVAILABLE' || echo 'NOT_INSTALLED'
```

Check if the Anthropic API key is valid:

**Remote:**
```
curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: ${ANTHROPIC_API_KEY}" -H "anthropic-version: 2023-06-01" -H "content-type: application/json" -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"Say OK"}]}' https://api.anthropic.com/v1/messages
```

Expected: `200`. If `401`, the key is invalid. If `429`, rate limited (try again).

**Decision points from pre-flight:**
- Is the security council already deployed? If so, decide whether to update or skip.
- Is himalaya available? If not, email delivery will be skipped (Telegram-only).
- Is the Anthropic API key a standard key (`sk-ant-api03-`)? OAuth tokens (`sk-ant-oat01-`) do NOT work for direct API calls.

## Adaptation Points

| Component | Default | Customize When... |
|-----------|---------|-------------------|
| Base directory | `${WORKSPACE}/security-council/` | Client wants a different location |
| Database path | `${WORKSPACE}/security-council/data/security-council.db` | Client wants DBs in a shared location |
| Schedule | 3:30 AM local time | Client prefers different time |
| Dedup window | 7 days | Client wants longer/shorter memory |
| Personas | All 4 (offensive, defensive, data-privacy, operational-realism) | Simpler system may not need all |
| Email delivery | Disabled (Telegram only) unless himalaya is present | Client wants full HTML email reports |
| Model | `claude-sonnet-4-20250514` | Client has Opus access or prefers a different model |
| Baseline checks | Full suite | Some checks may not apply (e.g., no gateway) |

## Prerequisites

- Node.js v18+ and npm installed
- Anthropic API key (`sk-ant-api03-` prefix -- NOT an OAuth token)
- Telegram bot token and chat ID configured
- `${WORKSPACE}` directory exists
- macOS (for launchd scheduling -- adapt for Linux/Windows per `_deploy-common.md`)

## Steps

### Phase 1: Configuration

#### 1.1 Create Directory Structure `[AUTO]`

Create the security council directory tree for scripts, data, personas, and logs.

**Remote:**
```
mkdir -p ${WORKSPACE}/security-council/{scripts,data,personas,logs}
```

Expected: Four directories created under `${WORKSPACE}/security-council/`.

If already exists: Safe to re-run. `mkdir -p` is idempotent.

#### 1.2 Create Environment File with API Keys `[HUMAN_INPUT]`

Store the Anthropic API key and Telegram credentials in a `.env` file. This file is read by the standalone security-council.js script at runtime.

**Important:** Validate the API key format before writing. It MUST start with `sk-ant-api03-`. OAuth tokens (`sk-ant-oat01-`) will NOT work for direct API calls.

**Remote:**
```
cat > ${WORKSPACE}/security-council/.env << ENV_EOF
# Security Council Configuration
# Generated by deploy-security-council-v2

# Anthropic API Key (required -- must be sk-ant-api03-* format)
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}

# Model selection
ANTHROPIC_MODEL=claude-sonnet-4-20250514

# Telegram alerts
TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}
TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}

# Email (optional -- requires himalaya)
EMAIL_RECIPIENT=${EMAIL_RECIPIENT}

# Dedup window in days
DEDUP_WINDOW_DAYS=7

# Timezone
TZ=${TIMEZONE}
ENV_EOF
```

**Note:** This heredoc uses an UNQUOTED delimiter so `${VARIABLES}` are expanded by the operator's shell before sending. The operator must substitute literal values into the command string before sending via the API.

Expected: File exists at `${WORKSPACE}/security-council/.env` with all values populated.

If this fails: Check that the parent directory exists. Verify variable substitution happened correctly.

If already exists: Back up as `.env.bak` and write new version.

#### 1.3 Restrict .env File Permissions `[AUTO]`

Lock down the `.env` file so only the owner can read it. This file contains API keys.

**Remote:**
```
chmod 600 ${WORKSPACE}/security-council/.env
```

Expected: File permissions are `-rw-------`.

#### 1.4 Add .env to .gitignore `[AUTO]`

Ensure the `.env` file is not tracked by git. Check the workspace-level `.gitignore` and the security-council-level `.gitignore`.

**Remote:**
```
grep -q 'security-council/.env' ${WORKSPACE}/.gitignore 2>/dev/null || echo 'security-council/.env' >> ${WORKSPACE}/.gitignore
```

**Remote:**
```
printf '.env\ndata/\nlogs/\nnode_modules/\n' > ${WORKSPACE}/security-council/.gitignore
```

Expected: `.env`, `data/`, `logs/`, and `node_modules/` are gitignored.

If already exists: Idempotent -- grep prevents duplicate entries.

### Phase 2: Persona Installation

#### 2.1 Install Offensive Security Persona `[AUTO]`

Write the offensive security expert persona prompt file. This persona thinks like an attacker and looks for exploitable weaknesses.

**Remote:**

Write the following content to `${WORKSPACE}/security-council/personas/offensive-security.md`:

```
# Offensive Security Analyst

You are a senior penetration tester and red team operator. Your job is to find exploitable vulnerabilities in this system before a real attacker does.

## Your Mindset
- Think like an attacker with network access to this machine
- Assume the attacker knows the system is running OpenClaw/AI agent software
- Look for the easiest path to compromise, not the most exotic

## What You Analyze
Given the system baseline data, examine:

1. **Exposed Ports & Services**: Any port bound to 0.0.0.0 instead of 127.0.0.1 is internet-reachable. Identify services that should be loopback-only.
2. **Weak Authentication**: Default credentials, missing auth on APIs, tokens in environment variables without rotation policy.
3. **Prompt Injection Vectors**: AI agent configs that accept untrusted input. System prompts that can be overridden. Tool calls that execute arbitrary commands.
4. **Credential Leaks**: API keys in git history, .env files with overly broad permissions, tokens logged to stdout, secrets in process arguments visible via `ps`.
5. **Privilege Escalation**: Writable scripts that run as cron/launchd jobs, SUID binaries, npm packages with postinstall scripts.
6. **Supply Chain**: Outdated npm packages with known CVEs, unverified dependencies, missing lockfile integrity.

## Output Format
Return a JSON array of findings. Each finding:
{
  "severity": "critical|high|medium|low",
  "title": "Short descriptive title",
  "description": "What the vulnerability is and why it matters",
  "evidence": "Specific line/config/output that proves this finding",
  "recommendation": "Concrete fix action"
}

Be specific. Reference exact file paths, port numbers, package names. No vague warnings.
Only report findings you can support with evidence from the baseline data.
```

Expected: File exists at `${WORKSPACE}/security-council/personas/offensive-security.md`.

If already exists: Compare content. If unchanged, skip. If different, back up as `.bak` and write new version.

#### 2.2 Install Defensive Security Persona `[AUTO]`

Write the defensive security expert persona prompt file. This persona reviews protection mechanisms and hardening status.

**Remote:**

Write the following content to `${WORKSPACE}/security-council/personas/defensive-security.md`:

```
# Defensive Security Analyst

You are a systems hardening specialist and security architect. Your job is to verify that protective controls are properly configured and comprehensive.

## Your Mindset
- Defense in depth: no single control should be the only barrier
- Compliance-aware but practical -- focus on real protection, not checkbox security
- Assume attackers will find exposed services; verify controls limit blast radius

## What You Analyze
Given the system baseline data, examine:

1. **Firewall Status**: Is the macOS firewall enabled? Are rules appropriate? Any unnecessary exceptions?
2. **Disk Encryption**: Is FileVault enabled? Are database files on encrypted volumes?
3. **Access Controls**: File permissions on sensitive directories (~/.openclaw, workspace, .env files). Are they owner-only (600/700)?
4. **Update Status**: Are OS, Node.js, npm packages current? Are there pending security updates?
5. **Backup Integrity**: Do backups exist? Are they encrypted? Are they stored off-machine?
6. **Network Segmentation**: Is the gateway bound to loopback? Are services properly isolated?
7. **Logging & Monitoring**: Are security-relevant events logged? Are logs protected from tampering?
8. **TLS/Encryption**: Are API calls using HTTPS? Are any connections unencrypted?

## Output Format
Return a JSON array of findings. Each finding:
{
  "severity": "critical|high|medium|low",
  "title": "Short descriptive title",
  "description": "What control is missing or misconfigured",
  "evidence": "Specific configuration, permission, or status that proves this finding",
  "recommendation": "Concrete remediation step"
}

Be thorough but avoid duplicating offensive findings. Focus on what protections SHOULD exist but are missing or weak.
```

Expected: File exists at `${WORKSPACE}/security-council/personas/defensive-security.md`.

If already exists: Compare content. If unchanged, skip. If different, back up as `.bak` and write new version.

#### 2.3 Install Data Privacy Persona `[AUTO]`

Write the data privacy expert persona prompt file. This persona focuses on PII exposure, data retention, and scoping.

**Remote:**

Write the following content to `${WORKSPACE}/security-council/personas/data-privacy.md`:

```
# Data Privacy Analyst

You are a data privacy specialist focused on PII protection, data minimization, and regulatory compliance. Your job is to find places where sensitive data is exposed, retained too long, or scoped too broadly.

## Your Mindset
- Every piece of PII is a liability if exposed
- Logs are the #1 source of accidental data leaks
- AI systems are especially prone to ingesting and storing data they should not have access to
- Think GDPR/CCPA principles even if not legally required -- they represent good practice

## What You Analyze
Given the system baseline data, examine:

1. **PII in Logs**: Are names, emails, phone numbers, or addresses appearing in log files? Check application logs, cron logs, and system logs.
2. **Credential Files**: .env files, API key files, OAuth tokens. Are they properly scoped (minimal permissions)? Are there stale credentials that should be rotated?
3. **Memory & Context Dumps**: AI memory/context files that may contain conversation data with PII. Are these encrypted at rest?
4. **Data Retention**: How long are logs, database records, and cached data kept? Is there an automatic cleanup policy?
5. **Notion/Email Scoping**: If the agent has access to Notion or email, is it scoped to specific workspaces/labels or does it have broad access?
6. **Git History**: Are there commits that accidentally included secrets or PII that were later removed but remain in history?
7. **Database Content**: SQLite databases that store contact info, meeting notes, or personal data. Are they encrypted? Who can access them?
8. **Process Arguments**: Are API keys or tokens visible in `ps` output via command-line arguments?

## Output Format
Return a JSON array of findings. Each finding:
{
  "severity": "critical|high|medium|low",
  "title": "Short descriptive title",
  "description": "What data privacy issue exists and its impact",
  "evidence": "Specific file, log entry, or configuration that proves this finding",
  "recommendation": "Concrete remediation step with data minimization focus"
}

Severity guide for privacy:
- critical: Active PII exposure (keys in logs, unencrypted PII databases accessible remotely)
- high: PII stored without encryption or with excessive retention
- medium: Overly broad data access scoping, missing cleanup policies
- low: Minor scoping improvements, documentation gaps
```

Expected: File exists at `${WORKSPACE}/security-council/personas/data-privacy.md`.

If already exists: Compare content. If unchanged, skip. If different, back up as `.bak` and write new version.

#### 2.4 Install Operational Realism Persona `[AUTO]`

Write the operational realism persona prompt file. This is the false-positive filter -- it assesses practical impact and blast radius.

**Remote:**

Write the following content to `${WORKSPACE}/security-council/personas/operational-realism.md`:

```
# Operational Realism Analyst

You are a pragmatic security operations lead. Your job is to take the raw findings from other security analysts and filter them through the lens of practical reality. You eliminate false positives, assess actual blast radius, and prioritize what matters for THIS specific system.

## Your Mindset
- Not every finding is actionable or important
- Context matters: a "critical" finding on a loopback-only service is medium at best
- The client is a single developer or small team -- security advice must be proportional
- A Mac Mini behind a home/office router has a different threat model than a cloud server
- Time spent fixing low-value findings is time not spent on high-value ones

## What You Analyze
You receive the combined findings from the offensive, defensive, and data privacy analysts, along with the original baseline data. For each finding, assess:

1. **Is this a real risk for THIS system?** A Mac Mini on a private network is not the same as a public cloud server. Adjust severity accordingly.
2. **What is the actual blast radius?** If this vulnerability were exploited, what exactly would an attacker gain? Access to the whole machine? Just one API key? A read-only database?
3. **Is this a false positive?** Sometimes baseline data is ambiguous. A port showing as LISTEN on 0.0.0.0 might actually be filtered by the OS firewall. A file permission of 644 on a non-sensitive file is not a finding.
4. **What is the effort-to-impact ratio?** A 5-minute fix for a high-impact issue should be prioritized. A 2-hour fix for a cosmetic issue should not.
5. **Are there duplicate or overlapping findings?** Multiple analysts may flag the same underlying issue from different angles. Consolidate.

## Output Format
Return a JSON object with two sections:

{
  "validated_findings": [
    {
      "original_severity": "high",
      "adjusted_severity": "medium",
      "title": "Original finding title",
      "rationale": "Why severity was adjusted (or kept)",
      "blast_radius": "What an attacker actually gains",
      "effort_to_fix": "low|medium|high",
      "recommendation": "Practical, proportional fix"
    }
  ],
  "dismissed_findings": [
    {
      "title": "Finding that was dismissed",
      "rationale": "Why this is a false positive or not actionable for this system"
    }
  ]
}

Be honest. If the other analysts found real problems, validate them. But do not let noise crowd out signal.
```

Expected: File exists at `${WORKSPACE}/security-council/personas/operational-realism.md`.

If already exists: Compare content. If unchanged, skip. If different, back up as `.bak` and write new version.

### Phase 3: Script Installation

#### 3.1 Install Baseline Collection Script `[GUIDED]`

Write the `collect-baseline.sh` script that gathers system state for the security personas to analyze. This script runs locally and outputs a structured text report.

**Remote:**

Write the following content to `${WORKSPACE}/security-council/scripts/collect-baseline.sh`:

```bash
#!/bin/bash
# collect-baseline.sh -- Gather system security baseline for AI analysis
# Part of Security Council v2
# Runs locally, outputs structured text to stdout

set -euo pipefail

WORKSPACE="${WORKSPACE_DIR:-$HOME/.openclaw/workspace}"
DIVIDER="================================================================"

echo "SECURITY BASELINE COLLECTION"
echo "Timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
echo "Hostname: $(hostname)"
echo "User: $(whoami)"
echo "OS: $(sw_vers -productName 2>/dev/null || uname -s) $(sw_vers -productVersion 2>/dev/null || uname -r)"
echo "$DIVIDER"

# --- Section 1: File Permissions on Sensitive Directories ---
echo ""
echo "=== FILE PERMISSIONS: SENSITIVE DIRECTORIES ==="
for dir in "$HOME/.openclaw" "$WORKSPACE" "$HOME/.ssh" "$HOME/.gnupg"; do
  if [ -d "$dir" ]; then
    echo "--- $dir ---"
    ls -la "$dir" 2>/dev/null | head -30
  else
    echo "--- $dir --- NOT FOUND"
  fi
done

echo ""
echo "=== FILE PERMISSIONS: ENV AND SECRET FILES ==="
find "$WORKSPACE" -maxdepth 3 \( -name '.env' -o -name '.env.*' -o -name '*.key' -o -name '*.pem' -o -name 'auth-profiles.json' -o -name 'credentials.json' \) -ls 2>/dev/null || echo "No secret files found"

echo "$DIVIDER"

# --- Section 2: Gateway Binding ---
echo ""
echo "=== GATEWAY BINDING CHECK ==="
if pgrep -f 'openclaw' > /dev/null 2>&1; then
  echo "OpenClaw processes found:"
  lsof -i -P -n 2>/dev/null | grep -i openclaw || echo "No network sockets for openclaw"
else
  echo "No OpenClaw processes running"
fi

echo "$DIVIDER"

# --- Section 3: Open Ports ---
echo ""
echo "=== OPEN PORTS (LISTENING) ==="
lsof -i -P -n 2>/dev/null | grep LISTEN | head -50 || echo "No listening ports found (or insufficient permissions)"

echo "$DIVIDER"

# --- Section 4: .gitignore Coverage ---
echo ""
echo "=== GITIGNORE COVERAGE ==="
if [ -f "$WORKSPACE/.gitignore" ]; then
  echo "Contents of $WORKSPACE/.gitignore:"
  cat "$WORKSPACE/.gitignore"
  echo ""
  echo "Checking for unignored sensitive patterns:"
  for pattern in '.env' '*.db' '*.sqlite' 'node_modules' '.DS_Store' 'auth-profiles.json'; do
    if grep -q "$pattern" "$WORKSPACE/.gitignore" 2>/dev/null; then
      echo "  [OK] $pattern is gitignored"
    else
      echo "  [WARN] $pattern is NOT in .gitignore"
    fi
  done
else
  echo "[WARN] No .gitignore found at $WORKSPACE/.gitignore"
fi

echo "$DIVIDER"

# --- Section 5: Recent Git Log ---
echo ""
echo "=== RECENT GIT HISTORY (last 20 commits) ==="
if [ -d "$WORKSPACE/.git" ]; then
  git -C "$WORKSPACE" log --oneline --no-decorate -20 2>/dev/null || echo "git log failed"
  echo ""
  echo "=== GIT STATUS (untracked/modified) ==="
  git -C "$WORKSPACE" status --short 2>/dev/null | head -30 || echo "git status failed"
else
  echo "No git repository at $WORKSPACE"
fi

echo "$DIVIDER"

# --- Section 6: Scheduled Jobs ---
echo ""
echo "=== LAUNCHD JOBS (user agents) ==="
ls -la "$HOME/Library/LaunchAgents/" 2>/dev/null || echo "No LaunchAgents directory"
echo ""
echo "=== LAUNCHD LOADED JOBS ==="
launchctl list 2>/dev/null | grep -v 'com.apple' | head -30 || echo "launchctl list failed"
echo ""
echo "=== CRONTAB ==="
crontab -l 2>/dev/null || echo "No crontab entries"

echo "$DIVIDER"

# --- Section 7: Disk Usage ---
echo ""
echo "=== DISK USAGE ==="
df -h / 2>/dev/null | tail -1
echo ""
echo "Workspace size:"
du -sh "$WORKSPACE" 2>/dev/null || echo "Could not determine workspace size"
echo ""
echo "Database sizes:"
find "$WORKSPACE" -name '*.db' -o -name '*.sqlite' 2>/dev/null | while IFS= read -r db; do
  ls -lh "$db" 2>/dev/null
done

echo "$DIVIDER"

# --- Section 8: Running Processes ---
echo ""
echo "=== RUNNING PROCESSES (relevant) ==="
ps aux 2>/dev/null | grep -iE 'node|python|openclaw|gateway|agent|claude|anthropic' | grep -v grep | head -20 || echo "No relevant processes found"

echo "$DIVIDER"

# --- Section 9: npm Audit ---
echo ""
echo "=== NPM AUDIT ==="
if [ -f "$WORKSPACE/package-lock.json" ]; then
  cd "$WORKSPACE" && npm audit --json 2>/dev/null | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    vuln = data.get('metadata', {}).get('vulnerabilities', {})
    print(f'Critical: {vuln.get(\"critical\", 0)}, High: {vuln.get(\"high\", 0)}, Moderate: {vuln.get(\"moderate\", 0)}, Low: {vuln.get(\"low\", 0)}')
    total = sum(vuln.values())
    if total > 0:
        for pkg, info in list(data.get('vulnerabilities', {}).items())[:10]:
            sev = info.get('severity', '?')
            title = info.get('title', info.get('name', pkg))
            via_list = info.get('via', [])
            via_str = ''
            if via_list and isinstance(via_list[0], dict):
                via_str = via_list[0].get('title', '')
            print(f'  [{sev}] {pkg}: {via_str or title}')
except Exception as e:
    print(f'npm audit parse error: {e}')
" 2>/dev/null || echo "npm audit failed or no package-lock.json"
else
  echo "No package-lock.json found at $WORKSPACE"
fi

echo "$DIVIDER"

# --- Section 10: FileVault Status ---
echo ""
echo "=== FILEVAULT STATUS ==="
fdesetup status 2>/dev/null || echo "fdesetup not available (may need sudo)"

echo "$DIVIDER"

# --- Section 11: Firewall Status ---
echo ""
echo "=== FIREWALL STATUS ==="
/usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate 2>/dev/null || echo "Firewall status check not available"
/usr/libexec/ApplicationFirewall/socketfilterfw --getstealthmode 2>/dev/null || true
/usr/libexec/ApplicationFirewall/socketfilterfw --getblockall 2>/dev/null || true

echo "$DIVIDER"
echo ""
echo "BASELINE COLLECTION COMPLETE"
echo "Timestamp: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
```

Make it executable:

**Remote:**
```
chmod +x ${WORKSPACE}/security-council/scripts/collect-baseline.sh
```

Expected: Script exists and is executable at `${WORKSPACE}/security-council/scripts/collect-baseline.sh`.

If this fails: Check that the scripts directory exists (Phase 1.1).

If already exists: Compare content. If unchanged, skip. If different, back up as `.bak` and write new version.

#### 3.2 Install Security Council Orchestrator `[GUIDED]`

Write the `security-council.js` orchestrator script. This is the core of the system.

**Critical design decisions:**
- **STANDALONE**: Does NOT use `openclaw agent` or any OpenClaw CLI. Calls the Anthropic API directly via `fetch`.
- **Sequential persona execution**: Each persona runs one at a time to manage API rate limits and keep context clear. The operational realism persona runs LAST because it needs the other three personas' findings as input.
- **SQLite dedup**: Findings are compared against the last 7 days by title + description hash. Only new findings are reported.
- **Immediate critical alerts**: Any `critical` severity finding triggers an immediate Telegram message, not batched with the rest.

**Remote:**

Write the following content to `${WORKSPACE}/security-council/scripts/security-council.js`:

```javascript
#!/usr/bin/env node
// security-council.js -- Standalone 4-Perspective Security Review Orchestrator
// Part of Security Council v2
// Runs WITHOUT OpenClaw session to avoid context overflow

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const BASE_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(BASE_DIR, 'data');
const PERSONAS_DIR = path.join(BASE_DIR, 'personas');
const LOGS_DIR = path.join(BASE_DIR, 'logs');
const ENV_PATH = path.join(BASE_DIR, '.env');

// Parse .env
function loadEnv() {
  const env = {};
  if (fs.existsSync(ENV_PATH)) {
    const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      env[key] = val;
    }
  }
  return env;
}

const ENV = loadEnv();
const ANTHROPIC_API_KEY = ENV.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY;
const ANTHROPIC_MODEL = ENV.ANTHROPIC_MODEL || process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';
const TELEGRAM_BOT_TOKEN = ENV.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = ENV.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID;
const EMAIL_RECIPIENT = ENV.EMAIL_RECIPIENT || process.env.EMAIL_RECIPIENT || '';
const DEDUP_WINDOW_DAYS = parseInt(ENV.DEDUP_WINDOW_DAYS || '7', 10);

// CLI flags
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const JSON_OUTPUT = args.includes('--json');
const VERBOSE = args.includes('--verbose');

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.error('ERROR: better-sqlite3 not installed. Run: cd ' + BASE_DIR + ' && npm install');
  process.exit(1);
}

const DB_PATH = path.join(DATA_DIR, 'security-council.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ensure tables exist
db.exec(`
  CREATE TABLE IF NOT EXISTS runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    status TEXT DEFAULT 'running',
    baseline_hash TEXT,
    total_findings INTEGER DEFAULT 0,
    new_findings INTEGER DEFAULT 0,
    critical_count INTEGER DEFAULT 0,
    high_count INTEGER DEFAULT 0,
    medium_count INTEGER DEFAULT 0,
    low_count INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS findings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs(id),
    persona TEXT NOT NULL,
    severity TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    evidence TEXT,
    recommendation TEXT,
    content_hash TEXT NOT NULL,
    is_new INTEGER DEFAULT 1,
    adjusted_severity TEXT,
    blast_radius TEXT,
    effort_to_fix TEXT,
    dismissed INTEGER DEFAULT 0,
    dismiss_rationale TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(run_id, content_hash)
  );

  CREATE TABLE IF NOT EXISTS persona_outputs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id INTEGER NOT NULL REFERENCES runs(id),
    persona TEXT NOT NULL,
    raw_response TEXT,
    parsed_findings_count INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_findings_hash ON findings(content_hash);
  CREATE INDEX IF NOT EXISTS idx_findings_run ON findings(run_id);
  CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);
`);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function log(msg) {
  const ts = new Date().toISOString();
  const line = '[' + ts + '] ' + msg;
  if (!JSON_OUTPUT) console.log(line);
  fs.appendFileSync(path.join(LOGS_DIR, 'security-council.log'), line + '\n');
}

function hashContent(title, description) {
  return crypto.createHash('sha256').update(title + '||' + description).digest('hex').slice(0, 16);
}

function isNewFinding(contentHash) {
  const cutoff = new Date(Date.now() - DEDUP_WINDOW_DAYS * 86400000).toISOString();
  const existing = db.prepare(
    'SELECT id FROM findings WHERE content_hash = ? AND created_at > ? AND dismissed = 0'
  ).get(contentHash, cutoff);
  return !existing;
}

// ---------------------------------------------------------------------------
// Anthropic API
// ---------------------------------------------------------------------------

async function callClaude(systemPrompt, userMessage) {
  if (!ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not set. Check ' + ENV_PATH);
  }

  const body = {
    model: ANTHROPIC_MODEL,
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }]
  };

  const startTime = Date.now();

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const duration = Date.now() - startTime;

  if (!response.ok) {
    const errText = await response.text();
    throw new Error('Anthropic API error ' + response.status + ': ' + errText);
  }

  const data = await response.json();
  const text = data.content && data.content[0] ? data.content[0].text : '';
  const tokensUsed = ((data.usage && data.usage.input_tokens) || 0) + ((data.usage && data.usage.output_tokens) || 0);

  return { text, tokensUsed, durationMs: duration };
}

function parseFindings(text) {
  // Try to extract JSON array from the response
  // The model may wrap it in markdown code blocks
  let cleaned = text;

  // Strip markdown code fences
  const jsonMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    cleaned = jsonMatch[1].trim();
  }

  // Try parsing as JSON array
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.validated_findings) return parsed; // operational realism format
    if (parsed.findings) return parsed.findings;
    return [parsed];
  } catch {
    // Try to find a JSON array in the text
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        // fall through
      }
    }
    // Try to find a JSON object (operational realism)
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        const obj = JSON.parse(objMatch[0]);
        if (obj.validated_findings) return obj;
        return [obj];
      } catch {
        // fall through
      }
    }
    log('WARNING: Could not parse findings from response. Raw text length: ' + text.length);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

async function sendTelegram(message, parseMode) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    log('Telegram not configured, skipping notification');
    return;
  }
  if (DRY_RUN) {
    log('[DRY RUN] Would send Telegram: ' + message.slice(0, 100) + '...');
    return;
  }

  const body = {
    chat_id: TELEGRAM_CHAT_ID,
    text: message,
  };
  if (parseMode) body.parse_mode = parseMode;

  try {
    const resp = await fetch('https://api.telegram.org/bot' + TELEGRAM_BOT_TOKEN + '/sendMessage', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!resp.ok) {
      const errText = await resp.text();
      log('Telegram send failed: ' + resp.status + ' ' + errText);
    }
  } catch (err) {
    log('Telegram send error: ' + err.message);
  }
}

async function sendCriticalAlert(finding) {
  const msg = [
    '\u{1F6A8} CRITICAL SECURITY FINDING',
    '',
    'Title: ' + finding.title,
    'Severity: ' + (finding.severity || 'CRITICAL').toUpperCase(),
    '',
    finding.description,
    '',
    'Evidence: ' + (finding.evidence || 'See full report'),
    '',
    'Recommendation: ' + (finding.recommendation || 'Investigate immediately'),
    '',
    'Detected: ' + new Date().toISOString()
  ].join('\n');

  await sendTelegram(msg);
}

// ---------------------------------------------------------------------------
// Email (optional, via himalaya)
// ---------------------------------------------------------------------------

function sendEmail(htmlContent, subject) {
  if (!EMAIL_RECIPIENT || DRY_RUN) return;

  try {
    let himalayaPath;
    try {
      himalayaPath = execFileSync('which', ['himalaya']).toString().trim();
    } catch {
      return; // himalaya not installed
    }
    if (!himalayaPath) return;

    const tmpFile = path.join(LOGS_DIR, 'report-email.html');
    fs.writeFileSync(tmpFile, htmlContent);

    execFileSync(himalayaPath, [
      'send', '--to', EMAIL_RECIPIENT,
      '--subject', subject,
      '--attachment', tmpFile
    ], { timeout: 30000, input: '' });
    log('Email sent to ' + EMAIL_RECIPIENT);
  } catch {
    log('Email delivery skipped (himalaya not available or send failed)');
  }
}

// ---------------------------------------------------------------------------
// Main Orchestration
// ---------------------------------------------------------------------------

async function collectBaseline() {
  log('Collecting system baseline...');
  const scriptPath = path.join(BASE_DIR, 'scripts', 'collect-baseline.sh');

  if (!fs.existsSync(scriptPath)) {
    throw new Error('collect-baseline.sh not found at ' + scriptPath);
  }

  const baseline = execFileSync('bash', [scriptPath], {
    timeout: 120000,
    encoding: 'utf8',
    env: Object.assign({}, process.env, {
      WORKSPACE_DIR: process.env.WORKSPACE_DIR || path.resolve(BASE_DIR, '..')
    })
  });

  log('Baseline collected: ' + baseline.length + ' characters');
  return baseline;
}

async function runPersona(personaName, baseline, extraContext) {
  const promptPath = path.join(PERSONAS_DIR, personaName + '.md');
  if (!fs.existsSync(promptPath)) {
    throw new Error('Persona prompt not found: ' + promptPath);
  }

  const systemPrompt = fs.readFileSync(promptPath, 'utf8');
  let userMessage = 'Analyze the following system security baseline and return your findings as specified in your instructions.\n\n' + baseline;

  if (extraContext) {
    userMessage += '\n\n--- ADDITIONAL CONTEXT: OTHER ANALYSTS\u2019 FINDINGS ---\n' + extraContext;
  }

  log('Running persona: ' + personaName + '...');
  const result = await callClaude(systemPrompt, userMessage);
  log('Persona ' + personaName + ' complete: ' + result.tokensUsed + ' tokens, ' + result.durationMs + 'ms');

  return result;
}

async function main() {
  const startedAt = new Date().toISOString();
  log('=== Security Council v2 Starting ===');
  log('Mode: ' + (DRY_RUN ? 'DRY RUN' : 'LIVE'));
  log('Model: ' + ANTHROPIC_MODEL);
  log('Dedup window: ' + DEDUP_WINDOW_DAYS + ' days');

  // Create run record
  const runResult = db.prepare(
    'INSERT INTO runs (started_at, status) VALUES (?, ?)'
  ).run(startedAt, 'running');
  const runId = Number(runResult.lastInsertRowid);

  try {
    // Step 1: Collect baseline
    const baseline = await collectBaseline();
    const baselineHash = crypto.createHash('sha256').update(baseline).digest('hex').slice(0, 16);
    db.prepare('UPDATE runs SET baseline_hash = ? WHERE id = ?').run(baselineHash, runId);

    // Step 2: Run analysis personas sequentially
    const personaNames = ['offensive-security', 'defensive-security', 'data-privacy'];
    const allFindings = [];
    const personaFindings = {};

    for (const persona of personaNames) {
      try {
        const result = await runPersona(persona, baseline);
        const findings = parseFindings(result.text);
        const findingsList = Array.isArray(findings) ? findings : [];

        db.prepare(
          'INSERT INTO persona_outputs (run_id, persona, raw_response, parsed_findings_count, tokens_used, duration_ms) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(runId, persona, result.text, findingsList.length, result.tokensUsed, result.durationMs);

        personaFindings[persona] = findingsList;
        for (const f of findingsList) {
          allFindings.push(Object.assign({}, f, { persona: persona }));
        }

        log('Persona ' + persona + ': ' + findingsList.length + ' findings');
      } catch (err) {
        log('ERROR running persona ' + persona + ': ' + err.message);
        db.prepare(
          'INSERT INTO persona_outputs (run_id, persona, error) VALUES (?, ?, ?)'
        ).run(runId, persona, err.message);
      }
    }

    // Step 3: Run operational realism filter
    log('Running operational realism filter...');
    const findingsSummary = JSON.stringify(allFindings, null, 2);
    try {
      const realismResult = await runPersona('operational-realism', baseline, findingsSummary);
      const realismOutput = parseFindings(realismResult.text);

      db.prepare(
        'INSERT INTO persona_outputs (run_id, persona, raw_response, parsed_findings_count, tokens_used, duration_ms) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(runId, 'operational-realism', realismResult.text,
        (realismOutput.validated_findings || []).length,
        realismResult.tokensUsed, realismResult.durationMs);

      // Apply operational realism adjustments
      if (realismOutput && realismOutput.validated_findings) {
        for (const vf of realismOutput.validated_findings) {
          // Find matching finding and update severity
          const match = allFindings.find(function(f) { return f.title === vf.title; });
          if (match) {
            match.adjusted_severity = vf.adjusted_severity || match.severity;
            match.blast_radius = vf.blast_radius || '';
            match.effort_to_fix = vf.effort_to_fix || '';
            if (vf.recommendation) match.recommendation = vf.recommendation;
          }
        }
      }
      if (realismOutput && realismOutput.dismissed_findings) {
        for (const df of realismOutput.dismissed_findings) {
          const match = allFindings.find(function(f) { return f.title === df.title; });
          if (match) {
            match.dismissed = true;
            match.dismiss_rationale = df.rationale || '';
          }
        }
      }

      log('Realism filter: ' + (realismOutput.validated_findings || []).length + ' validated, ' + (realismOutput.dismissed_findings || []).length + ' dismissed');
    } catch (err) {
      log('ERROR running operational realism: ' + err.message);
      db.prepare(
        'INSERT INTO persona_outputs (run_id, persona, error) VALUES (?, ?, ?)'
      ).run(runId, 'operational-realism', err.message);
    }

    // Step 4: Dedup and store findings
    const insertFinding = db.prepare(
      'INSERT OR IGNORE INTO findings' +
      ' (run_id, persona, severity, title, description, evidence, recommendation,' +
      ' content_hash, is_new, adjusted_severity, blast_radius, effort_to_fix,' +
      ' dismissed, dismiss_rationale)' +
      ' VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    let newCount = 0;
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    const criticalFindings = [];

    const activeFindings = allFindings.filter(function(f) { return !f.dismissed; });

    for (const f of activeFindings) {
      const effectiveSeverity = f.adjusted_severity || f.severity || 'low';
      const hash = hashContent(f.title || '', f.description || '');
      const isNew = isNewFinding(hash) ? 1 : 0;

      insertFinding.run(
        runId, f.persona || 'unknown', effectiveSeverity,
        f.title || 'Untitled', f.description || '',
        f.evidence || '', f.recommendation || '',
        hash, isNew, f.adjusted_severity || null,
        f.blast_radius || null, f.effort_to_fix || null,
        0, null
      );

      if (isNew) newCount++;
      switch (effectiveSeverity) {
        case 'critical': criticalCount++; break;
        case 'high': highCount++; break;
        case 'medium': mediumCount++; break;
        case 'low': lowCount++; break;
      }

      if (effectiveSeverity === 'critical' && isNew) {
        criticalFindings.push(f);
      }
    }

    // Update run record
    db.prepare(
      'UPDATE runs SET' +
      ' completed_at = ?,' +
      ' status = \'completed\',' +
      ' total_findings = ?,' +
      ' new_findings = ?,' +
      ' critical_count = ?,' +
      ' high_count = ?,' +
      ' medium_count = ?,' +
      ' low_count = ?' +
      ' WHERE id = ?'
    ).run(
      new Date().toISOString(),
      activeFindings.length, newCount,
      criticalCount, highCount, mediumCount, lowCount,
      runId
    );

    log('Results: ' + activeFindings.length + ' total, ' + newCount + ' new, ' + (allFindings.length - activeFindings.length) + ' dismissed');
    log('Severity: ' + criticalCount + ' critical, ' + highCount + ' high, ' + mediumCount + ' medium, ' + lowCount + ' low');

    // Step 5: Send critical alerts immediately
    for (const cf of criticalFindings) {
      await sendCriticalAlert(cf);
    }

    // Step 6: Generate and send reports
    const reportData = {
      runId: runId,
      startedAt: startedAt,
      completedAt: new Date().toISOString(),
      model: ANTHROPIC_MODEL,
      totalFindings: activeFindings.length,
      newFindings: newCount,
      dismissed: allFindings.length - activeFindings.length,
      criticalCount: criticalCount,
      highCount: highCount,
      mediumCount: mediumCount,
      lowCount: lowCount,
      findings: activeFindings.map(function(f) {
        return Object.assign({}, f, {
          effective_severity: f.adjusted_severity || f.severity,
          is_new: isNewFinding(hashContent(f.title || '', f.description || ''))
        });
      }),
      dismissedFindings: allFindings.filter(function(f) { return f.dismissed; })
    };

    // Render HTML report
    try {
      const renderPath = path.join(BASE_DIR, 'scripts', 'render-security-email.js');
      if (fs.existsSync(renderPath)) {
        const render = require(renderPath);
        const html = render(reportData);
        const htmlPath = path.join(LOGS_DIR, 'report-' + runId + '.html');
        fs.writeFileSync(htmlPath, html);
        log('HTML report saved: ' + htmlPath);

        // Send email if configured
        sendEmail(html, 'Security Council Report #' + runId + ' - ' + criticalCount + ' critical, ' + highCount + ' high');
      }
    } catch (err) {
      log('HTML report error: ' + err.message);
    }

    // Send Telegram summary
    const severityEmoji = { critical: '\u{1F534}', high: '\u{1F7E0}', medium: '\u{1F7E1}', low: '\u{1F535}' };
    const summaryLines = [
      '\u{1F6E1}\u{FE0F} Security Council Report #' + runId,
      '',
      severityEmoji.critical + ' Critical: ' + criticalCount + '  ' + severityEmoji.high + ' High: ' + highCount + '  ' + severityEmoji.medium + ' Medium: ' + mediumCount + '  ' + severityEmoji.low + ' Low: ' + lowCount,
      'New findings: ' + newCount + ' | Dismissed: ' + (allFindings.length - activeFindings.length),
      ''
    ];

    // Top findings summary
    const sortOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    const sorted = activeFindings.slice()
      .filter(function(f) { return f.adjusted_severity || f.severity; })
      .sort(function(a, b) {
        var sa = sortOrder[a.adjusted_severity || a.severity];
        var sb = sortOrder[b.adjusted_severity || b.severity];
        if (sa === undefined) sa = 3;
        if (sb === undefined) sb = 3;
        return sa - sb;
      })
      .slice(0, 10);

    for (var i = 0; i < sorted.length; i++) {
      var f = sorted[i];
      var sev = (f.adjusted_severity || f.severity || 'low').toUpperCase();
      var emoji = severityEmoji[f.adjusted_severity || f.severity] || '\u{2B1C}';
      summaryLines.push((i + 1) + '. ' + emoji + ' [' + sev + '] ' + f.title);
    }

    if (activeFindings.length > 10) {
      summaryLines.push('... and ' + (activeFindings.length - 10) + ' more');
    }

    summaryLines.push('');
    summaryLines.push('Model: ' + ANTHROPIC_MODEL);
    summaryLines.push('Run: ' + startedAt);

    await sendTelegram(summaryLines.join('\n'));

    // JSON output mode
    if (JSON_OUTPUT) {
      console.log(JSON.stringify(reportData, null, 2));
    }

    log('=== Security Council v2 Complete ===');

  } catch (err) {
    log('FATAL ERROR: ' + err.message);
    db.prepare("UPDATE runs SET status = 'error', completed_at = ? WHERE id = ?")
      .run(new Date().toISOString(), runId);

    // Alert on fatal errors
    await sendTelegram('\u{26A0}\u{FE0F} Security Council FAILED\n\nError: ' + err.message + '\n\nRun ID: ' + runId);

    if (JSON_OUTPUT) {
      console.log(JSON.stringify({ error: err.message, runId: runId }, null, 2));
    }
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch(function(err) {
  console.error('Unhandled error:', err);
  process.exit(1);
});
```

Make it executable:

**Remote:**
```
chmod +x ${WORKSPACE}/security-council/scripts/security-council.js
```

Expected: Script exists and is executable at `${WORKSPACE}/security-council/scripts/security-council.js`.

If this fails: Check that the scripts directory exists (Phase 1.1).

If already exists: Compare content. If unchanged, skip. If different, back up as `.bak` and write new version.

#### 3.3 Install HTML Report Renderer `[AUTO]`

Write the `render-security-email.js` template module. This produces a self-contained HTML report with color-coded severity badges, executive summary, detailed findings, and trend analysis.

**Remote:**

Write the following content to `${WORKSPACE}/security-council/scripts/render-security-email.js`:

```javascript
// render-security-email.js -- HTML report renderer for Security Council v2
// Exported as a function: module.exports = function(reportData) => htmlString

module.exports = function renderSecurityEmail(data) {
  var runId = data.runId;
  var startedAt = data.startedAt;
  var completedAt = data.completedAt;
  var model = data.model;
  var totalFindings = data.totalFindings;
  var newFindings = data.newFindings;
  var dismissed = data.dismissed;
  var criticalCount = data.criticalCount;
  var highCount = data.highCount;
  var mediumCount = data.mediumCount;
  var lowCount = data.lowCount;
  var findings = data.findings || [];
  var dismissedFindings = data.dismissedFindings || [];

  var severityColors = {
    critical: { bg: '#DC2626', text: '#FFFFFF', light: '#FEE2E2' },
    high:     { bg: '#EA580C', text: '#FFFFFF', light: '#FED7AA' },
    medium:   { bg: '#CA8A04', text: '#FFFFFF', light: '#FEF3C7' },
    low:      { bg: '#2563EB', text: '#FFFFFF', light: '#DBEAFE' }
  };

  function badge(severity) {
    var colors = severityColors[severity] || severityColors.low;
    return '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;background:' + colors.bg + ';color:' + colors.text + ';text-transform:uppercase;">' + severity + '</span>';
  }

  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Sort findings by severity
  var sortOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  var sortedFindings = findings.slice().sort(function(a, b) {
    var sa = sortOrder[a.effective_severity || a.severity];
    var sb = sortOrder[b.effective_severity || b.severity];
    if (sa === undefined) sa = 3;
    if (sb === undefined) sb = 3;
    return sa - sb;
  });

  // Count new vs recurring
  var newCount = findings.filter(function(f) { return f.is_new; }).length;
  var recurringCount = findings.filter(function(f) { return !f.is_new; }).length;

  // Build findings HTML
  var findingsHtml = '';
  for (var i = 0; i < sortedFindings.length; i++) {
    var f = sortedFindings[i];
    var sev = f.effective_severity || f.severity || 'low';
    var colors = severityColors[sev] || severityColors.low;
    var newTag = f.is_new
      ? ' <span style="color:#059669;font-size:11px;font-weight:600;">NEW</span>'
      : ' <span style="color:#6B7280;font-size:11px;">RECURRING</span>';

    findingsHtml += ''
      + '<div style="margin-bottom:16px;border:1px solid #E5E7EB;border-radius:8px;border-left:4px solid ' + colors.bg + ';overflow:hidden;">'
      + '<div style="padding:12px 16px;background:' + colors.light + ';">'
      + '<div style="display:flex;align-items:center;gap:8px;">'
      + badge(sev) + newTag
      + ' <strong style="font-size:14px;color:#111827;">#' + (i + 1) + ': ' + escapeHtml(f.title) + '</strong>'
      + '</div>'
      + '<div style="margin-top:4px;font-size:12px;color:#6B7280;">Persona: ' + escapeHtml(f.persona || 'unknown')
      + (f.blast_radius ? ' | Blast radius: ' + escapeHtml(f.blast_radius) : '')
      + (f.effort_to_fix ? ' | Effort: ' + escapeHtml(f.effort_to_fix) : '')
      + '</div>'
      + '</div>'
      + '<div style="padding:12px 16px;">'
      + '<p style="margin:0 0 8px;font-size:13px;color:#374151;">' + escapeHtml(f.description) + '</p>'
      + (f.evidence ? '<div style="margin:8px 0;padding:8px 12px;background:#F3F4F6;border-radius:4px;font-family:monospace;font-size:12px;color:#4B5563;white-space:pre-wrap;">' + escapeHtml(f.evidence) + '</div>' : '')
      + (f.recommendation ? '<p style="margin:8px 0 0;font-size:13px;color:#059669;"><strong>Recommendation:</strong> ' + escapeHtml(f.recommendation) + '</p>' : '')
      + '</div>'
      + '</div>';
  }

  // Build dismissed findings section
  var dismissedHtml = '';
  if (dismissedFindings.length > 0) {
    dismissedHtml = '<h2 style="font-size:16px;color:#6B7280;margin:24px 0 12px;border-top:1px solid #E5E7EB;padding-top:16px;">Dismissed Findings (' + dismissedFindings.length + ')</h2>'
      + '<div style="background:#F9FAFB;border-radius:8px;padding:12px 16px;">';
    for (var j = 0; j < dismissedFindings.length; j++) {
      var df = dismissedFindings[j];
      dismissedHtml += '<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #E5E7EB;">'
        + '<span style="font-size:13px;color:#374151;"><s>' + escapeHtml(df.title) + '</s></span>'
        + ' <span style="font-size:12px;color:#9CA3AF;">' + escapeHtml(df.dismiss_rationale || 'False positive') + '</span>'
        + '</div>';
    }
    dismissedHtml += '</div>';
  }

  // Date formatting
  var dateStr = '';
  try {
    dateStr = new Date(startedAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    dateStr = startedAt;
  }
  var completedStr = '';
  try {
    completedStr = completedAt ? new Date(completedAt).toLocaleString() : 'N/A';
  } catch (e) {
    completedStr = completedAt || 'N/A';
  }

  // Full HTML
  return '<!DOCTYPE html>\n'
    + '<html>\n'
    + '<head>\n'
    + '  <meta charset="utf-8">\n'
    + '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    + '  <title>Security Council Report #' + runId + '</title>\n'
    + '</head>\n'
    + '<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;">\n'
    + '  <div style="max-width:680px;margin:0 auto;padding:24px;">\n'
    + '\n'
    + '    <!-- Header -->\n'
    + '    <div style="background:linear-gradient(135deg,#1E293B,#334155);color:#FFFFFF;padding:24px;border-radius:12px 12px 0 0;">\n'
    + '      <h1 style="margin:0;font-size:22px;font-weight:700;">Security Council Report</h1>\n'
    + '      <p style="margin:8px 0 0;font-size:13px;opacity:0.8;">Run #' + runId + ' | ' + escapeHtml(dateStr) + '</p>\n'
    + '    </div>\n'
    + '\n'
    + '    <!-- Executive Summary -->\n'
    + '    <div style="background:#FFFFFF;padding:20px 24px;border-bottom:1px solid #E5E7EB;">\n'
    + '      <h2 style="margin:0 0 12px;font-size:16px;color:#111827;">Executive Summary</h2>\n'
    + '      <div style="display:flex;gap:12px;flex-wrap:wrap;">\n'
    + '        <div style="flex:1;min-width:80px;text-align:center;padding:12px;background:' + (criticalCount > 0 ? '#FEE2E2' : '#F0FDF4') + ';border-radius:8px;">\n'
    + '          <div style="font-size:28px;font-weight:700;color:' + (criticalCount > 0 ? '#DC2626' : '#16A34A') + ';">' + criticalCount + '</div>\n'
    + '          <div style="font-size:11px;color:#6B7280;text-transform:uppercase;">Critical</div>\n'
    + '        </div>\n'
    + '        <div style="flex:1;min-width:80px;text-align:center;padding:12px;background:' + (highCount > 0 ? '#FED7AA' : '#F0FDF4') + ';border-radius:8px;">\n'
    + '          <div style="font-size:28px;font-weight:700;color:' + (highCount > 0 ? '#EA580C' : '#16A34A') + ';">' + highCount + '</div>\n'
    + '          <div style="font-size:11px;color:#6B7280;text-transform:uppercase;">High</div>\n'
    + '        </div>\n'
    + '        <div style="flex:1;min-width:80px;text-align:center;padding:12px;background:#F3F4F6;border-radius:8px;">\n'
    + '          <div style="font-size:28px;font-weight:700;color:#CA8A04;">' + mediumCount + '</div>\n'
    + '          <div style="font-size:11px;color:#6B7280;text-transform:uppercase;">Medium</div>\n'
    + '        </div>\n'
    + '        <div style="flex:1;min-width:80px;text-align:center;padding:12px;background:#F3F4F6;border-radius:8px;">\n'
    + '          <div style="font-size:28px;font-weight:700;color:#2563EB;">' + lowCount + '</div>\n'
    + '          <div style="font-size:11px;color:#6B7280;text-transform:uppercase;">Low</div>\n'
    + '        </div>\n'
    + '      </div>\n'
    + '\n'
    + '      <!-- Trend -->\n'
    + '      <div style="margin-top:16px;padding:12px;background:#F9FAFB;border-radius:8px;">\n'
    + '        <div style="font-size:13px;color:#374151;">\n'
    + '          <strong>New findings:</strong> ' + newCount + ' | '
    + '          <strong>Recurring:</strong> ' + recurringCount + ' | '
    + '          <strong>Dismissed:</strong> ' + dismissed + '\n'
    + '        </div>\n'
    + '      </div>\n'
    + '    </div>\n'
    + '\n'
    + '    <!-- Findings -->\n'
    + '    <div style="background:#FFFFFF;padding:20px 24px;border-radius:0 0 12px 12px;">\n'
    + '      <h2 style="margin:0 0 16px;font-size:16px;color:#111827;">Findings (' + totalFindings + ')</h2>\n'
    + (findingsHtml || '<p style="color:#6B7280;">No findings to report.</p>')
    + dismissedHtml
    + '    </div>\n'
    + '\n'
    + '    <!-- Footer -->\n'
    + '    <div style="text-align:center;padding:16px;font-size:11px;color:#9CA3AF;">\n'
    + '      Security Council v2 | Model: ' + escapeHtml(model) + ' | Completed: ' + escapeHtml(completedStr) + '\n'
    + '    </div>\n'
    + '\n'
    + '  </div>\n'
    + '</body>\n'
    + '</html>';
};
```

Expected: File exists at `${WORKSPACE}/security-council/scripts/render-security-email.js`.

If already exists: Compare content. If unchanged, skip. If different, back up as `.bak` and write new version.

#### 3.4 Install package.json and Dependencies `[GUIDED]`

Create the `package.json` for the security council project and install dependencies.

**Remote:**

Write the following content to `${WORKSPACE}/security-council/package.json`:

```json
{
  "name": "security-council",
  "version": "2.0.0",
  "private": true,
  "description": "Nightly 4-perspective AI security review system",
  "scripts": {
    "review": "node scripts/security-council.js",
    "review:dry": "node scripts/security-council.js --dry-run --json",
    "baseline": "bash scripts/collect-baseline.sh"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0"
  }
}
```

Install dependencies:

**Remote:**
```
cd ${WORKSPACE}/security-council && npm install
```

Expected: `node_modules/` directory created with `better-sqlite3` compiled. No errors.

If this fails: `better-sqlite3` requires a C++ compiler (Xcode Command Line Tools on macOS). If the build fails:
- Check: `xcode-select -p` -- if it returns an error, the client must install Xcode CLT
- On macOS: `xcode-select --install` (requires GUI interaction from the client)
- Alternative: Try `npm install better-sqlite3 --build-from-source`

If already exists: `npm install` is safe to re-run. It updates packages if needed.

### Phase 4: Database Setup

#### 4.1 Initialize SQLite Database `[AUTO]`

The database is auto-created when `security-council.js` first runs (the schema is embedded in the script). However, we verify it initializes correctly by running a quick test.

**Remote:**
```
cd ${WORKSPACE}/security-council && node -e "
  var Database = require('better-sqlite3');
  var path = require('path');
  var db = new Database(path.join('data', 'security-council.db'));
  db.pragma('journal_mode = WAL');
  db.exec(
    'CREATE TABLE IF NOT EXISTS runs (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  started_at TEXT NOT NULL,' +
    '  completed_at TEXT,' +
    '  status TEXT DEFAULT \'running\',' +
    '  baseline_hash TEXT,' +
    '  total_findings INTEGER DEFAULT 0,' +
    '  new_findings INTEGER DEFAULT 0,' +
    '  critical_count INTEGER DEFAULT 0,' +
    '  high_count INTEGER DEFAULT 0,' +
    '  medium_count INTEGER DEFAULT 0,' +
    '  low_count INTEGER DEFAULT 0' +
    ');' +
    'CREATE TABLE IF NOT EXISTS findings (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  run_id INTEGER NOT NULL REFERENCES runs(id),' +
    '  persona TEXT NOT NULL,' +
    '  severity TEXT NOT NULL,' +
    '  title TEXT NOT NULL,' +
    '  description TEXT NOT NULL,' +
    '  evidence TEXT,' +
    '  recommendation TEXT,' +
    '  content_hash TEXT NOT NULL,' +
    '  is_new INTEGER DEFAULT 1,' +
    '  adjusted_severity TEXT,' +
    '  blast_radius TEXT,' +
    '  effort_to_fix TEXT,' +
    '  dismissed INTEGER DEFAULT 0,' +
    '  dismiss_rationale TEXT,' +
    '  created_at TEXT DEFAULT (datetime(\'now\')),' +
    '  UNIQUE(run_id, content_hash)' +
    ');' +
    'CREATE TABLE IF NOT EXISTS persona_outputs (' +
    '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
    '  run_id INTEGER NOT NULL REFERENCES runs(id),' +
    '  persona TEXT NOT NULL,' +
    '  raw_response TEXT,' +
    '  parsed_findings_count INTEGER DEFAULT 0,' +
    '  tokens_used INTEGER DEFAULT 0,' +
    '  duration_ms INTEGER DEFAULT 0,' +
    '  error TEXT,' +
    '  created_at TEXT DEFAULT (datetime(\'now\'))' +
    ');' +
    'CREATE INDEX IF NOT EXISTS idx_findings_hash ON findings(content_hash);' +
    'CREATE INDEX IF NOT EXISTS idx_findings_run ON findings(run_id);' +
    'CREATE INDEX IF NOT EXISTS idx_findings_severity ON findings(severity);'
  );
  var tables = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\'').all();
  console.log('Tables: ' + tables.map(function(t) { return t.name; }).join(', '));
  db.close();
  console.log('Database initialized successfully.');
"
```

Expected: Output shows `Tables: runs, findings, persona_outputs` and `Database initialized successfully.`

If this fails: Check that `better-sqlite3` is installed and the `data/` directory exists.

### Phase 5: Scheduling

#### 5.1 Create launchd Plist for Nightly Execution `[GUIDED]`

Schedule the security council to run nightly at 3:30 AM local time using launchd. **Level 1 -- exact syntax required** because launchd plists must be precise and `~` is not expanded.

**Important:** launchd requires absolute paths. `~` and `$HOME` are NOT expanded in plist files. Use `/Users/${AGENT_USER}/...` for all paths.

**Remote:**

Write the following content to `${AGENT_HOME}/Library/LaunchAgents/com.rel.security-council.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.rel.security-council</string>

    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/node</string>
        <string>${AGENT_HOME}/.openclaw/workspace/security-council/scripts/security-council.js</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${AGENT_HOME}/.openclaw/workspace/security-council</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
        <key>HOME</key>
        <string>${AGENT_HOME}</string>
        <key>WORKSPACE_DIR</key>
        <string>${AGENT_HOME}/.openclaw/workspace</string>
    </dict>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>3</integer>
        <key>Minute</key>
        <integer>30</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>${AGENT_HOME}/.openclaw/workspace/security-council/logs/launchd-stdout.log</string>

    <key>StandardErrorPath</key>
    <string>${AGENT_HOME}/.openclaw/workspace/security-council/logs/launchd-stderr.log</string>

    <key>RunAtLoad</key>
    <false/>

    <key>Nice</key>
    <integer>10</integer>
</dict>
</plist>
```

**Critical Notes:**
- Replace `${AGENT_HOME}` with the actual absolute path (e.g., `/Users/edge`) in the plist. The operator MUST substitute this before sending.
- The `node` path may differ. Check with `which node` on the target machine. On Mac Mini M4 Pro with Homebrew, it is typically `/opt/homebrew/bin/node`. Adjust the `ProgramArguments` accordingly.
- `StartCalendarInterval` uses local time (respects the system timezone). No UTC conversion needed.
- `Nice` value of 10 gives it lower priority so it does not interfere with interactive use.

#### 5.2 Verify Node Path and Adjust Plist `[AUTO]`

Before loading the plist, verify the node binary path on the target machine.

**Remote:**
```
which node
```

Expected: Path to node binary (e.g., `/opt/homebrew/bin/node` on Apple Silicon, `/usr/local/bin/node` on Intel). If it differs from what is in the plist, update the plist before loading.

#### 5.3 Load the LaunchAgent `[GUIDED]`

Register the launchd agent. **Level 1 -- exact syntax required.**

First check if already loaded:

**Remote:**
```
launchctl list 2>/dev/null | grep com.rel.security-council && echo 'ALREADY_LOADED' || echo 'NOT_LOADED'
```

If `NOT_LOADED`:

**Remote:**
```
launchctl bootstrap gui/$(id -u) ${AGENT_HOME}/Library/LaunchAgents/com.rel.security-council.plist
```

If `ALREADY_LOADED` and the plist was updated:

**Remote:**
```
launchctl bootout gui/$(id -u)/com.rel.security-council
launchctl bootstrap gui/$(id -u) ${AGENT_HOME}/Library/LaunchAgents/com.rel.security-council.plist
```

Expected: No error output. The agent is registered and will run at 3:30 AM daily.

If this fails:
- `Operation already in progress`: The agent is already loaded. Use bootout/bootstrap to reload.
- `Path had bad ownership/permissions`: The plist file must be owned by the user. Check `ls -la` on the plist file.
- `No such file or directory`: The plist path is wrong. Check `${AGENT_HOME}/Library/LaunchAgents/` exists.

#### 5.4 Verify LaunchAgent Registration `[AUTO]`

Confirm the agent is registered and will fire at the expected time.

**Remote:**
```
launchctl list | grep com.rel.security-council
```

Expected: A line showing the agent label with a PID of `-` (not currently running) and exit status `0` (or `-` if never run).

### Phase 6: Verification

#### 6.1 Run a Test Security Review `[GUIDED]`

Execute a full security review in dry-run mode to validate the entire pipeline: baseline collection, persona analysis, dedup, and report generation.

**Remote:**
```
cd ${WORKSPACE}/security-council && node scripts/security-council.js --dry-run --json 2>&1
```

Expected: JSON output containing findings from all four perspectives with severity, title, description, evidence, and recommendation fields. The run should complete in 2-10 minutes depending on baseline size and API response times.

If this fails:
- `ANTHROPIC_API_KEY not set`: Check the `.env` file exists and has the correct key
- `better-sqlite3 not installed`: Run `npm install` in the security-council directory
- `collect-baseline.sh not found`: Verify the script exists and is executable
- API timeout: The model may be slow. Try again or increase the timeout
- Parse errors: Check the logs at `${WORKSPACE}/security-council/logs/security-council.log` for raw API responses

#### 6.2 Verify SQLite Storage `[AUTO]`

Confirm that the test run was stored correctly in the database.

**Remote:**
```
cd ${WORKSPACE}/security-council && node -e "
  var Database = require('better-sqlite3');
  var db = new Database('data/security-council.db');
  var runs = db.prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').get();
  var findings = db.prepare('SELECT COUNT(*) as count FROM findings WHERE run_id = ?').get(runs.id);
  var personas = db.prepare('SELECT persona, parsed_findings_count, duration_ms FROM persona_outputs WHERE run_id = ?').all(runs.id);
  console.log('Latest run:', JSON.stringify(runs, null, 2));
  console.log('Findings count:', findings.count);
  console.log('Persona outputs:', JSON.stringify(personas, null, 2));
  db.close();
"
```

Expected: Run record shows `status: 'completed'` with finding counts. Persona outputs show all 4 personas with non-zero `parsed_findings_count`.

If this fails: Check the run status. If `status: 'error'`, check the logs for the error message.

#### 6.3 Verify Telegram Alert Delivery `[GUIDED]`

Run a live (non-dry-run) test to verify Telegram delivery works. This sends a real summary message.

**Remote:**
```
cd ${WORKSPACE}/security-council && node scripts/security-council.js --json 2>&1
```

Expected: Telegram message received with the security council report summary. If there are critical findings, a separate critical alert should have been sent immediately.

If this fails:
- Check `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in the `.env` file
- Test the bot directly: `curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" -d "chat_id=${TELEGRAM_CHAT_ID}&text=Security Council test"`
- Verify the bot has permission to send messages to the chat ID

If DRY_RUN was used in 6.1 and you want to avoid running the full pipeline again, test Telegram separately:

**Remote:**
```
curl -s -X POST "https://api.telegram.org/bot$(grep TELEGRAM_BOT_TOKEN ${WORKSPACE}/security-council/.env | cut -d= -f2)/sendMessage" \
  -H "content-type: application/json" \
  -d "{\"chat_id\": \"$(grep TELEGRAM_CHAT_ID ${WORKSPACE}/security-council/.env | cut -d= -f2)\", \"text\": \"Security Council v2 test - Telegram delivery verified\"}"
```

#### 6.4 Verify Dedup Works `[AUTO]`

Run a second review and confirm that previously-seen findings are marked as recurring (not new).

**Remote:**
```
cd ${WORKSPACE}/security-council && node scripts/security-council.js --dry-run --json 2>&1 | python3 -c "
import sys, json
data = json.load(sys.stdin)
total = data.get('totalFindings', 0)
new_f = data.get('newFindings', 0)
print(f'Total findings: {total}')
print(f'New findings: {new_f}')
print(f'Recurring: {total - new_f}')
if total > 0 and new_f < total:
    print('DEDUP WORKING: Some findings correctly identified as recurring')
elif total > 0 and new_f == total:
    print('WARNING: All findings marked as new. Dedup may not be working if this is a re-run.')
else:
    print('No findings to evaluate dedup')
"
```

Expected: The second run should show fewer `newFindings` than `totalFindings`, with some findings marked as recurring. This confirms the SQLite dedup is working against the 7-day window.

If this fails: Check that the first run's findings were stored correctly (Step 6.2). The dedup compares by content hash (SHA-256 of title + description), so findings must have consistent titles.

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `ANTHROPIC_API_KEY not set` | Missing or malformed `.env` file | Check `${WORKSPACE}/security-council/.env` exists with `ANTHROPIC_API_KEY=sk-ant-api03-...` |
| `better-sqlite3 not installed` | npm install failed | Run `cd ${WORKSPACE}/security-council && npm install`. May need Xcode CLT on macOS. |
| `collect-baseline.sh not found` | Script not installed or not executable | Check file exists and run `chmod +x` on it |
| API 401 error | Invalid API key | Verify key starts with `sk-ant-api03-`. OAuth tokens (`sk-ant-oat01-`) do NOT work for direct calls. |
| API 429 error | Rate limited | Wait and retry. Consider using a lower-tier model or adding delay between persona calls. |
| Empty findings from a persona | Model returned unparseable output | Check `persona_outputs` table for raw response. The parser tries multiple JSON extraction strategies. |
| Telegram not sending | Bot token or chat ID wrong | Test manually: `curl "https://api.telegram.org/bot<TOKEN>/sendMessage" -d "chat_id=<ID>&text=test"` |
| launchd not firing | Plist not loaded or path wrong | Check `launchctl list \| grep security-council`. Verify all paths in plist are absolute. |
| launchd fires but script fails | Node path wrong in plist | Check `which node` and update the plist's ProgramArguments. Check stderr log at `${WORKSPACE}/security-council/logs/launchd-stderr.log`. |
| All findings always "new" | Dedup hash mismatch | Findings are hashed by title+description. If the AI generates slightly different text each run, dedup will not match. This is expected for AI-generated content -- the dedup catches identical findings. |
| HTML report not generated | `render-security-email.js` missing or has errors | Check file exists and run `node -e "require('./scripts/render-security-email.js')"` to verify no syntax errors. |
| Script crashes with ENOMEM | Baseline too large | The baseline is passed as a string to the API. If it exceeds model context, truncate in `collect-baseline.sh` (reduce `head` limits). |

## Autonomy Mode Behavior

| Step | Auto | Guided | Manual |
|------|------|--------|--------|
| 1.1 Create directories | Execute silently | Execute silently | Confirm before creating |
| 1.2 Create .env file | Prompt for API key | Prompt for API key, show file content | Prompt for API key, show file content |
| 1.3-1.4 Permissions and gitignore | Execute silently | Execute silently | Confirm each |
| 2.1-2.4 Install personas | Execute silently | Execute silently | Show each persona, confirm |
| 3.1 Install baseline script | Execute silently | Confirm before writing | Show script content, confirm |
| 3.2 Install orchestrator | Execute silently | Confirm before writing | Show script content, confirm |
| 3.3 Install renderer | Execute silently | Execute silently | Confirm |
| 3.4 Install dependencies | Execute silently | Confirm before npm install | Confirm each command |
| 4.1 Initialize database | Execute silently | Execute silently | Confirm |
| 5.1-5.4 Schedule via launchd | Execute silently | Confirm schedule, show plist | Show plist, confirm each launchctl command |
| 6.1 Test review | Execute, report results | Confirm before running, review output | Confirm, review output step by step |
| 6.2 Verify storage | Execute silently | Execute, show results | Confirm, show results |
| 6.3 Verify Telegram | Execute silently | Confirm before sending live message | Confirm, review message before sending |
| 6.4 Verify dedup | Execute silently | Execute, show results | Confirm, review results |

## Dependencies

- **Depends on:** Node.js v18+, Anthropic API key, Telegram bot setup
- **Optionally enhanced by:** `deploy-himalaya-email.md` (for full HTML email reports), `deploy-security-safety.md` (provides additional baseline context)
- **Required by:** Nothing directly, but security findings can feed into `deploy-daily-briefing.md` if included in morning briefings
- **Replaces:** `deploy-security-council.md` (BLOCKED)

## Architecture Notes

### Why Standalone (Not OpenClaw Session)

The security council runs as a standalone Node.js script instead of inside an OpenClaw session because:

1. **Context overflow**: The baseline data alone can be 10-20KB of text. Running 4 persona analyses inside an OpenClaw session would consume the entire context window and cause degraded responses.
2. **Reliability**: Standalone scripts do not depend on the OpenClaw gateway being up. If the gateway crashes, security reviews still run.
3. **API key isolation**: The script uses its own `.env` file. No coupling to OpenClaw's auth-profiles.json or OAuth token refresh.
4. **Simpler debugging**: Logs are in a known location. No session state to reason about.

### Why Sequential (Not Parallel) Persona Execution

Unlike the advisory council which runs 8 personas in parallel, the security council runs its 3 analysis personas sequentially and then the operational realism filter last:

1. **API rate limits**: 4 simultaneous Claude API calls may hit rate limits on some API key tiers.
2. **Operational realism needs context**: The 4th persona MUST see the other 3 personas' findings to do its job (false positive filtering, blast radius assessment). It cannot run in parallel.
3. **Cost predictability**: Sequential execution gives clear per-persona cost attribution in the `persona_outputs` table.
4. **Error isolation**: If persona 2 hits an API error, personas 3 and 4 still run. With `Promise.all`, one failure rejects all.

### 7-Day Dedup Window (vs Advisory Council's 30 Days)

Security findings change faster than business insights. A 7-day window means:
- Fixed issues stop appearing after 1 week
- New variants of recurring issues are flagged
- The database stays smaller and queries stay fast
