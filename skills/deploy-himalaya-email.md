# Deploy Himalaya Email Integration

## Compatibility
- **OpenClaw Version**: 2026.2.26
- **Status**: READY
- **Blocked Commands**: (none -- uses Himalaya CLI, Node.js scripts, and launchd for scheduling)
- **Notes**: This skill does NOT reference any `openclaw` CLI subcommands. Uses Himalaya CLI for IMAP/SMTP email access with Gmail App Passwords (permanent credentials -- no OAuth token expiration). Replaces the broken `gog` OAuth email integration where tokens expire every 7 days.

## Purpose

Deploy permanent, reliable email access for the Edge AI executive assistant using Himalaya CLI with Gmail App Passwords. This replaces the `gog` OAuth email integration which requires re-authentication every 7 days due to token expiration. Himalaya uses IMAP/SMTP with a 16-character Gmail App Password that never expires, eliminating all OAuth maintenance overhead.

**When to use:** When deploying email capabilities for Edge on Dan's Mac Mini, or when replacing a broken/expired `gog` OAuth email setup.

**What this skill does:**
1. Installs Himalaya CLI via Homebrew
2. Configures IMAP/SMTP access to `edge@crusoeventures.com` with Gmail App Password
3. Verifies email read/send capabilities
4. Installs Node.js wrapper scripts for email check, draft, send, and forward detection
5. Schedules email checking every 15 minutes via launchd
6. Creates TOOLS.md entries for Edge's email interaction
7. Sets up auto-forward detection (Dan forwards emails to edge@ for processing)

## How Commands Are Sent

This skill is executed by an operator who has an active remote session.
See `_deploy-common.md` -> "Command Delivery" for the full protocol.

- **Remote:** commands sent via `POST /api/sessions/${SESSION_ID}/commands`
- **Operator:** commands run on the operator's local terminal

## Variables

| Variable | Source | Example |
|----------|--------|---------|
| `${WORKSPACE}` | Client profile: workspace path | `/Users/edge/.openclaw/workspace/` |
| `${SESSION_ID}` | Active session | `sess_abc123` |
| `${BEARER}` | Operator login | `eyJhbG...` |
| `${DEVICE_ID}` | Device enrollment | `dev_abc123` |
| `${EMAIL_ADDRESS}` | Client profile: Edge's email | `edge@crusoeventures.com` |
| `${GMAIL_APP_PASSWORD}` | `[HUMAN_INPUT]` Google Account > Security > App Passwords | `abcdefghijklmnop` |
| `${TIMEZONE}` | Client profile: timezone | `America/Denver` |
| `${AGENT_USER}` | `whoami` on client machine | `edge` |
| `${AGENT_HOME}` | Home directory of `${AGENT_USER}` | `/Users/edge` |
| `${TELEGRAM_BOT_TOKEN}` | Client profile: Edge's bot token | `7123456789:AAF...` |
| `${TELEGRAM_CHAT_ID}` | Client profile: Dan's Telegram ID | `123456789` |
| `${EMAIL_TOPIC_ID}` | Client profile: messaging config (Email topic in Telegram group) | `2150` |

## Before You Start

Follow the **Standard Deployment Protocol** in `_deploy-common.md`.

**Pre-flight checks for this skill:**

Detect platform and user:

**Remote:**
```
uname -s && uname -m && whoami && echo $HOME
```

Expected: `Darwin`, architecture, username, and home directory. This skill is macOS-only (Mac Mini).

Check if Homebrew is installed:

**Remote:**
```
which brew 2>/dev/null || echo 'NO_BREW'
```

Expected: Path to brew. If `NO_BREW`, install Homebrew first.

Check if Himalaya is already installed:

**Remote:**
```
which himalaya 2>/dev/null && himalaya --version || echo 'NOT_INSTALLED'
```

Expected: Either a version string (already installed) or `NOT_INSTALLED`.

Check if Node.js is available:

**Remote:**
```
which node 2>/dev/null && node --version || echo 'NO_NODE'
```

Expected: Node.js v18+ version string. If `NO_NODE`, install via `brew install node`.

Check if gog email is currently configured (what we are replacing):

**Remote:**
```
which gog 2>/dev/null && gog auth status 2>/dev/null || echo 'NO_GOG'
```

Expected: Note the status. If gog is authenticated, this skill replaces it. If gog auth is expired/broken, this is why we are here.

Check for existing email scripts:

**Remote:**
```
ls ${WORKSPACE}/scripts/email-*.js 2>/dev/null || echo 'NO_EMAIL_SCRIPTS'
```

Expected: Note any existing scripts that will be replaced.

Check for existing launchd email jobs:

**Remote:**
```
launchctl list 2>/dev/null | grep -i email || echo 'NO_EMAIL_JOBS'
```

Expected: Note any existing jobs that may conflict.

**Decision points from pre-flight:**
- Does Dan have 2-Step Verification enabled on the Google account for `edge@crusoeventures.com`? (Required for App Passwords)
- Has the Gmail App Password already been generated, or does Dan need to create one?
- Is there a Telegram topic already designated for email notifications?
- Should existing gog email scripts be backed up before replacement?

## Adaptation Points

| Component | Default | Customize When... |
|-----------|---------|-------------------|
| Email provider | Gmail IMAP/SMTP | Client uses Microsoft 365 or other IMAP provider (change host/port) |
| Check frequency | Every 15 minutes | Client wants more/less frequent checks |
| Auth method | Gmail App Password | Client uses OAuth2 XOAUTH2 (Himalaya supports it but adds complexity) |
| Notification channel | Telegram | Client uses Slack, Discord, or SMS |
| Forward detection | Checks `X-Forwarded-For` + `From` header patterns | Client has different forwarding patterns |
| Draft approval | All drafts require Dan's approval | Client wants auto-send for low-risk replies |
| Urgency classification | 3-tier (urgent/normal/low) | Client wants different classification levels |

## Prerequisites

- macOS machine (Mac Mini) with Homebrew installed
- Node.js v18+ installed
- Gmail account (`edge@crusoeventures.com`) with 2-Step Verification enabled
- Gmail App Password generated (16-character, from Google Account > Security > App Passwords)
- `deploy-messaging-setup.md` completed (Telegram for notifications)
- `deploy-identity.md` completed (Edge agent identity)
- Workspace directory (`${WORKSPACE}`) exists

## What Gets Installed

### CLI Tool

| Tool | Version | Purpose |
|------|---------|---------|
| `himalaya` | Latest via Homebrew | IMAP/SMTP email access from command line |

### Configuration

| File | Purpose |
|------|---------|
| `~/.config/himalaya/config.toml` | Himalaya IMAP/SMTP configuration (references env var for password) |
| `${WORKSPACE}/.env` | Gmail App Password stored as `GMAIL_APP_PASSWORD` (gitignored) |

### Scripts

| Script | Purpose |
|--------|---------|
| `${WORKSPACE}/scripts/email-check.js` | Check for new unread emails, classify urgency, notify via Telegram |
| `${WORKSPACE}/scripts/email-draft.js` | Draft a reply (saves to Drafts folder, notifies Dan for approval) |
| `${WORKSPACE}/scripts/email-send.js` | Send an approved draft |
| `${WORKSPACE}/scripts/email-forward-detect.js` | Detect emails forwarded from Dan for processing |

### Scheduled Jobs

| Job | Schedule | Mechanism |
|-----|----------|-----------|
| Email check | Every 15 minutes | launchd plist at `~/Library/LaunchAgents/com.edge.email-check.plist` |

### TOOLS.md Entries

| Tool | Description |
|------|-------------|
| `check_email` | Check inbox for new unread emails |
| `read_email` | Read a specific email by ID |
| `draft_reply` | Draft a reply to an email (requires approval) |
| `send_draft` | Send an approved draft |
| `search_email` | Search emails by query |
| `forward_email` | Forward an email to a recipient |

## Steps

### Phase 1: Install Himalaya CLI

#### 1.1 Install Himalaya via Homebrew `[AUTO]`

Install the Himalaya CLI email client. Himalaya provides IMAP/SMTP access from the command line with support for multiple accounts and TOML-based configuration.

**Remote:**
```
brew install himalaya
```

Expected: Installation completes successfully. Verify with `himalaya --version`.

If this fails: Check Homebrew is up to date (`brew update`). If the formula is not found, try `brew tap sostrovsky/made && brew install himalaya` or install from GitHub releases: `curl -sSL https://github.com/pimalaya/himalaya/releases/latest/download/himalaya-aarch64-apple-darwin.tar.gz | tar xz -C /usr/local/bin/`.

If already exists: Check version with `himalaya --version`. If reasonably recent, skip.

#### 1.2 Verify Himalaya Installation `[AUTO]`

Confirm Himalaya is accessible and working.

**Remote:**
```
himalaya --version
```

Expected: Version string (e.g., `himalaya 1.x.x`).

If this fails: Check PATH. Try `/opt/homebrew/bin/himalaya --version` (Apple Silicon) or `/usr/local/bin/himalaya --version` (Intel).

### Phase 2: Configure Email Access

#### 2.1 Store Gmail App Password `[HUMAN_INPUT]`

Store the Gmail App Password in the workspace `.env` file. This password is generated from Google Account > Security > App Passwords and is a permanent 16-character credential.

**IMPORTANT:** The human must provide the Gmail App Password. It cannot be generated programmatically.

**Instructions for Dan:**
1. Go to https://myaccount.google.com/security
2. Ensure 2-Step Verification is ON
3. Go to App Passwords (search "App Passwords" in the Security page)
4. Generate a new App Password for "Mail" on "Mac"
5. Copy the 16-character password (no spaces)

**Remote:**
```
grep -q 'GMAIL_APP_PASSWORD' ${WORKSPACE}/.env 2>/dev/null && echo 'ALREADY_SET' || echo 'GMAIL_APP_PASSWORD=${GMAIL_APP_PASSWORD}' >> ${WORKSPACE}/.env
```

Expected: The `.env` file contains `GMAIL_APP_PASSWORD=<16-char-password>`.

If this fails: Ensure `${WORKSPACE}/.env` exists. Create it with `touch ${WORKSPACE}/.env` if missing.

If already exists: Check if the value is correct. If updating, use `sed` to replace the existing line:
```
sed -i '' 's/^GMAIL_APP_PASSWORD=.*/GMAIL_APP_PASSWORD=${GMAIL_APP_PASSWORD}/' ${WORKSPACE}/.env
```

Verify `.env` is gitignored:

**Remote:**
```
grep -q '.env' ${WORKSPACE}/.gitignore 2>/dev/null || echo '.env' >> ${WORKSPACE}/.gitignore
```

#### 2.2 Write Himalaya Configuration `[GUIDED]`

Write the Himalaya TOML configuration file. The password is loaded from the `GMAIL_APP_PASSWORD` environment variable using Himalaya's command-based password source, keeping credentials out of the config file.

**Remote:**
```
mkdir -p ~/.config/himalaya
```

Then write the configuration file. **Level 1 -- exact syntax required** (TOML format is strict):

**Remote:**
```
cat > ~/.config/himalaya/config.toml << TOML_EOF
[accounts.edge]
default = true
email = "${EMAIL_ADDRESS}"
display-name = "Edge (AI Executive Assistant)"

[accounts.edge.imap]
host = "imap.gmail.com"
port = 993
login = "${EMAIL_ADDRESS}"
passwd.cmd = "cat ${WORKSPACE}/.env | grep GMAIL_APP_PASSWORD | cut -d= -f2"
encryption = "tls"

[accounts.edge.smtp]
host = "smtp.gmail.com"
port = 465
login = "${EMAIL_ADDRESS}"
passwd.cmd = "cat ${WORKSPACE}/.env | grep GMAIL_APP_PASSWORD | cut -d= -f2"
encryption = "tls"

[accounts.edge.folder.alias]
inbox = "INBOX"
sent = "[Gmail]/Sent Mail"
drafts = "[Gmail]/Drafts"
trash = "[Gmail]/Trash"
TOML_EOF
```

Expected: File exists at `~/.config/himalaya/config.toml` with correct IMAP/SMTP settings.

If this fails: Check that the directory was created. Verify the heredoc was not mangled by JSON transport -- if using the session API, use base64 encoding per `_deploy-common.md` File Transfer Standard.

If already exists: Compare content. If different, back up as `config.toml.bak` and write new version.

#### 2.3 Verify Email Access `[GUIDED]`

Test that Himalaya can connect to Gmail and list emails.

**Remote:**
```
himalaya envelope list --account edge --folder INBOX --max-width 120 2>&1 | head -20
```

Expected: A table of recent emails with columns for ID, flags, date, sender, and subject.

If this fails:
- `authentication failed`: Check the App Password is correct (16 chars, no spaces). Verify 2-Step Verification is enabled. Ensure "Less secure app access" is not the issue (App Passwords bypass this).
- `connection refused` or `timeout`: Check network connectivity. Verify IMAP is enabled in Gmail settings (Settings > Forwarding and POP/IMAP > Enable IMAP).
- `TLS handshake failed`: Check system certificates are up to date.

Test reading a specific message:

**Remote:**
```
LATEST_ID=$(himalaya envelope list --account edge --folder INBOX --max-width 200 2>/dev/null | tail -n +2 | head -1 | awk '{print $1}')
himalaya message read --account edge --folder INBOX "$LATEST_ID" 2>&1 | head -40
```

Expected: The body of the most recent email is displayed.

Test listing unread emails:

**Remote:**
```
himalaya envelope list --account edge --folder INBOX --query "is:unread" --max-width 120 2>&1 | head -20
```

Expected: List of unread emails, or empty output if no unread emails.

### Phase 3: Install Email Scripts

#### 3.1 Create Scripts Directory `[AUTO]`

Ensure the scripts directory exists.

**Remote:**
```
mkdir -p ${WORKSPACE}/scripts
```

Expected: Directory exists at `${WORKSPACE}/scripts`.

#### 3.2 Install email-check.js `[GUIDED]`

Install the email check script that scans for new unread emails, classifies urgency, and sends Telegram notifications for important messages.

Write `${WORKSPACE}/scripts/email-check.js` with the following structure. Use base64 encoding per the File Transfer Standard for delivery over the session API.

The script must:
- Load environment from `${WORKSPACE}/.env`
- Run `himalaya envelope list --account edge --folder INBOX --query "is:unread" --output json` to get unread emails
- For each unread email, run `himalaya message read --account edge --folder INBOX <id>` to get the body
- Track processed email IDs in `${WORKSPACE}/data/email-processed.json` to avoid duplicate notifications
- Classify urgency into 3 tiers: **urgent** (needs immediate attention), **normal** (informational), **low** (newsletter/automated)
- For urgent and normal emails: send a Telegram notification to `${TELEGRAM_CHAT_ID}` with subject, sender, and urgency
- For emails forwarded from Dan: flag as high-priority and process immediately (see email-forward-detect.js)
- Log activity to `${WORKSPACE}/logs/email-check.log`

**Reference implementation:**

```javascript
#!/usr/bin/env node
// email-check.js -- Check for new unread emails, classify urgency, notify via Telegram
//
// Usage: node email-check.js
// Scheduled: every 15 minutes via launchd

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE || path.join(process.env.HOME, '.openclaw/workspace');
const DATA_DIR = path.join(WORKSPACE, 'data');
const LOG_DIR = path.join(WORKSPACE, 'logs');
const PROCESSED_FILE = path.join(DATA_DIR, 'email-processed.json');
const ENV_FILE = path.join(WORKSPACE, '.env');

// Load .env
function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

function log(msg) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts = new Date().toISOString();
  fs.appendFileSync(path.join(LOG_DIR, 'email-check.log'), `[${ts}] ${msg}\n`);
}

function getProcessed() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(PROCESSED_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf8')); }
  catch { return {}; }
}

function saveProcessed(data) {
  // Keep only last 7 days of processed IDs
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const pruned = {};
  for (const [id, ts] of Object.entries(data)) {
    if (ts > cutoff) pruned[id] = ts;
  }
  fs.writeFileSync(PROCESSED_FILE, JSON.stringify(pruned, null, 2));
}

function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const topicId = process.env.EMAIL_TOPIC_ID;
  if (!token || !chatId) { log('ERROR: Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID'); return; }

  const payload = {
    chat_id: chatId,
    text: text,
    parse_mode: 'HTML'
  };
  if (topicId) payload.message_thread_id = parseInt(topicId, 10);

  try {
    execFileSync('curl', [
      '-sS', '-X', 'POST',
      `https://api.telegram.org/bot${token}/sendMessage`,
      '-H', 'content-type: application/json',
      '-d', JSON.stringify(payload)
    ], { timeout: 15000 });
  } catch (err) {
    log(`ERROR sending Telegram: ${err.message}`);
  }
}

function classifyUrgency(from, subject, body) {
  // Heuristic urgency classification
  const urgentPatterns = [
    /urgent/i, /asap/i, /emergency/i, /critical/i,
    /immediate(ly)?/i, /time.?sensitive/i, /deadline today/i,
    /need.*response/i, /please.*respond/i, /action required/i
  ];
  const lowPatterns = [
    /unsubscribe/i, /newsletter/i, /no-?reply/i, /noreply/i,
    /marketing/i, /promotion/i, /digest/i, /automated/i,
    /notification@/i, /updates@/i, /news@/i
  ];

  const text = `${subject} ${body.substring(0, 2000)}`;
  if (urgentPatterns.some(p => p.test(text))) return 'urgent';
  if (lowPatterns.some(p => p.test(from) || p.test(subject))) return 'low';
  return 'normal';
}

function isForwardedFromDan(headers, from) {
  // Detect emails forwarded from Dan
  const danPatterns = [/dan@crusoeventures\.com/i, /dan@/i];
  return danPatterns.some(p => p.test(from));
}

async function main() {
  loadEnv();
  log('Starting email check...');

  const processed = getProcessed();
  let envelopes;

  try {
    const raw = execFileSync('himalaya', [
      'envelope', 'list',
      '--account', 'edge',
      '--folder', 'INBOX',
      '--query', 'is:unread',
      '--output', 'json'
    ], { timeout: 30000, encoding: 'utf8' });
    envelopes = JSON.parse(raw);
  } catch (err) {
    log(`ERROR listing emails: ${err.message}`);
    return;
  }

  if (!Array.isArray(envelopes) || envelopes.length === 0) {
    log('No unread emails found.');
    return;
  }

  log(`Found ${envelopes.length} unread email(s).`);
  let notified = 0;

  for (const env of envelopes) {
    const id = String(env.id);
    if (processed[id]) continue;

    const from = env.from || 'Unknown';
    const subject = env.subject || '(no subject)';
    const date = env.date || '';

    // Read email body for classification
    let body = '';
    try {
      body = execFileSync('himalaya', [
        'message', 'read',
        '--account', 'edge',
        '--folder', 'INBOX',
        id
      ], { timeout: 15000, encoding: 'utf8' });
    } catch (err) {
      log(`WARN: Could not read message ${id}: ${err.message}`);
    }

    const forwarded = isForwardedFromDan('', from);
    const urgency = forwarded ? 'urgent' : classifyUrgency(from, subject, body);

    if (urgency === 'urgent' || urgency === 'normal') {
      const icon = urgency === 'urgent' ? '!!' : '--';
      const fwdTag = forwarded ? ' [FORWARDED FROM DAN]' : '';
      const msg = `<b>[${icon}] New Email${fwdTag}</b>\n\n` +
        `<b>From:</b> ${from}\n` +
        `<b>Subject:</b> ${subject}\n` +
        `<b>Date:</b> ${date}\n` +
        `<b>Urgency:</b> ${urgency}\n\n` +
        `<i>Reply with "read ${id}" to see full content</i>`;
      sendTelegram(msg);
      notified++;
    }

    processed[id] = Date.now();
  }

  saveProcessed(processed);
  log(`Check complete. ${notified} notification(s) sent.`);
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
```

Expected: File exists at `${WORKSPACE}/scripts/email-check.js`, is executable, and contains the reference implementation (adapted as needed).

If this fails: Ensure the file was transferred correctly (use base64 encoding). Check Node.js is available.

#### 3.3 Install email-draft.js `[GUIDED]`

Install the email draft script. Drafts a reply to a specified email, stores it in the Gmail Drafts folder, and notifies Dan for approval before sending.

Write `${WORKSPACE}/scripts/email-draft.js` with the following structure:

The script must:
- Accept arguments: `--id <email_id>` (email to reply to) and `--body <reply_text>`
- Use `himalaya message save --folder "[Gmail]/Drafts"` to save the reply body as a draft
- Send a Telegram notification to Dan: "Draft reply created for [subject]. Approve with 'send draft <id>'"
- Log activity to `${WORKSPACE}/logs/email-draft.log`

**Reference implementation:**

```javascript
#!/usr/bin/env node
// email-draft.js -- Draft a reply to an email (saves to Drafts, requires Dan's approval)
//
// Usage: node email-draft.js --id <email_id> --body "Reply text here"

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE || path.join(process.env.HOME, '.openclaw/workspace');
const ENV_FILE = path.join(WORKSPACE, '.env');
const LOG_DIR = path.join(WORKSPACE, 'logs');

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

function log(msg) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts = new Date().toISOString();
  fs.appendFileSync(path.join(LOG_DIR, 'email-draft.log'), `[${ts}] ${msg}\n`);
}

function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const topicId = process.env.EMAIL_TOPIC_ID;
  if (!token || !chatId) { log('ERROR: Missing Telegram credentials'); return; }

  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (topicId) payload.message_thread_id = parseInt(topicId, 10);

  try {
    execFileSync('curl', [
      '-sS', '-X', 'POST',
      `https://api.telegram.org/bot${token}/sendMessage`,
      '-H', 'content-type: application/json',
      '-d', JSON.stringify(payload)
    ], { timeout: 15000 });
  } catch (err) {
    log(`ERROR sending Telegram: ${err.message}`);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--id' && args[i + 1]) parsed.id = args[++i];
    if (args[i] === '--body' && args[i + 1]) parsed.body = args[++i];
  }
  return parsed;
}

async function main() {
  loadEnv();
  const { id, body } = parseArgs();

  if (!id || !body) {
    console.error('Usage: node email-draft.js --id <email_id> --body "Reply text"');
    process.exit(1);
  }

  log(`Drafting reply to email ${id}...`);

  // Get original email subject for the notification
  let subject = '(unknown)';
  try {
    const raw = execFileSync('himalaya', [
      'envelope', 'list',
      '--account', 'edge',
      '--folder', 'INBOX',
      '--output', 'json'
    ], { timeout: 15000, encoding: 'utf8' });
    const envelopes = JSON.parse(raw);
    const match = envelopes.find(e => String(e.id) === String(id));
    if (match) subject = match.subject || '(no subject)';
  } catch (err) {
    log(`WARN: Could not get subject for email ${id}`);
  }

  // Write draft body to temp file, then use himalaya to save as draft
  const tmpFile = path.join(WORKSPACE, 'data', `.draft-${id}.txt`);
  fs.mkdirSync(path.join(WORKSPACE, 'data'), { recursive: true });
  fs.writeFileSync(tmpFile, body);

  try {
    // Save the reply as a draft using himalaya
    const draftContent = fs.readFileSync(tmpFile, 'utf8');
    execFileSync('himalaya', [
      'message', 'save',
      '--account', 'edge',
      '--folder', '[Gmail]/Drafts'
    ], { input: draftContent, timeout: 15000 });

    log(`Draft saved for email ${id}`);

    // Notify Dan for approval
    sendTelegram(
      `<b>Draft Reply Created</b>\n\n` +
      `<b>Re:</b> ${subject}\n` +
      `<b>Email ID:</b> ${id}\n\n` +
      `<i>Review in Gmail Drafts. Reply "send draft ${id}" to approve sending.</i>`
    );

    console.log(`Draft saved. Dan notified for approval.`);
  } catch (err) {
    log(`ERROR saving draft: ${err.message}`);
    console.error(`Failed to save draft: ${err.message}`);
    process.exit(1);
  } finally {
    // Clean up temp file
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
```

Expected: File exists at `${WORKSPACE}/scripts/email-draft.js`.

#### 3.4 Install email-send.js `[GUIDED]`

Install the email send script. Sends an approved draft. This is only called after Dan explicitly approves a draft.

Write `${WORKSPACE}/scripts/email-send.js` with the following structure:

The script must:
- Accept argument: `--id <email_id>` (original email to reply to) and `--body <reply_text>`
- Use `himalaya message reply <id>` to send the reply
- Mark the original email as read after sending
- Send a Telegram confirmation: "Reply sent to [recipient] re: [subject]"
- Log activity to `${WORKSPACE}/logs/email-send.log`

**CRITICAL SAFETY:** This script sends real emails to real people. It must ONLY be invoked after explicit approval from Dan. The script itself should log a warning if called directly.

**Reference implementation:**

```javascript
#!/usr/bin/env node
// email-send.js -- Send an approved reply (REQUIRES DAN'S EXPLICIT APPROVAL)
//
// Usage: node email-send.js --id <email_id> --body "Approved reply text"

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE || path.join(process.env.HOME, '.openclaw/workspace');
const ENV_FILE = path.join(WORKSPACE, '.env');
const LOG_DIR = path.join(WORKSPACE, 'logs');

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

function log(msg) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts = new Date().toISOString();
  fs.appendFileSync(path.join(LOG_DIR, 'email-send.log'), `[${ts}] ${msg}\n`);
}

function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const topicId = process.env.EMAIL_TOPIC_ID;
  if (!token || !chatId) return;

  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (topicId) payload.message_thread_id = parseInt(topicId, 10);

  try {
    execFileSync('curl', [
      '-sS', '-X', 'POST',
      `https://api.telegram.org/bot${token}/sendMessage`,
      '-H', 'content-type: application/json',
      '-d', JSON.stringify(payload)
    ], { timeout: 15000 });
  } catch (err) {
    log(`ERROR sending Telegram: ${err.message}`);
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--id' && args[i + 1]) parsed.id = args[++i];
    if (args[i] === '--body' && args[i + 1]) parsed.body = args[++i];
  }
  return parsed;
}

async function main() {
  loadEnv();
  const { id, body } = parseArgs();

  if (!id || !body) {
    console.error('Usage: node email-send.js --id <email_id> --body "Reply text"');
    process.exit(1);
  }

  log(`SENDING reply to email ${id} (approved by Dan)`);
  console.log('WARNING: This sends a REAL email. Ensure Dan approved this.');

  // Get original email info
  let subject = '(unknown)';
  let to = '(unknown)';
  try {
    const raw = execFileSync('himalaya', [
      'envelope', 'list',
      '--account', 'edge',
      '--folder', 'INBOX',
      '--output', 'json'
    ], { timeout: 15000, encoding: 'utf8' });
    const envelopes = JSON.parse(raw);
    const match = envelopes.find(e => String(e.id) === String(id));
    if (match) {
      subject = match.subject || '(no subject)';
      to = match.from || '(unknown)';
    }
  } catch (err) {
    log(`WARN: Could not get envelope for email ${id}`);
  }

  // Send the reply using himalaya
  try {
    execFileSync('himalaya', [
      'message', 'reply',
      '--account', 'edge',
      '--folder', 'INBOX',
      id
    ], { input: body, timeout: 30000 });

    // Mark original as read
    try {
      execFileSync('himalaya', [
        'flag', 'add',
        '--account', 'edge',
        '--folder', 'INBOX',
        id, 'seen'
      ], { timeout: 10000 });
    } catch {}

    log(`Reply sent to ${to} re: ${subject}`);
    sendTelegram(
      `<b>Reply Sent</b>\n\n` +
      `<b>To:</b> ${to}\n` +
      `<b>Re:</b> ${subject}\n\n` +
      `<i>Reply delivered successfully.</i>`
    );

    console.log(`Reply sent to ${to}`);
  } catch (err) {
    log(`ERROR sending reply: ${err.message}`);
    sendTelegram(`<b>FAILED to send reply</b>\n\nEmail ${id}: ${err.message}`);
    console.error(`Failed to send: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
```

Expected: File exists at `${WORKSPACE}/scripts/email-send.js`.

#### 3.5 Install email-forward-detect.js `[GUIDED]`

Install the forward detection script. Detects emails forwarded from Dan to edge@crusoeventures.com for processing. These are high-priority items Dan wants Edge to act on.

Write `${WORKSPACE}/scripts/email-forward-detect.js` with the following structure:

The script must:
- Run as part of the email-check flow (called by email-check.js, or standalone)
- Check unread emails for forwarding indicators:
  - Subject starts with "Fwd:" or "Fw:"
  - `X-Forwarded-For` header contains Dan's email
  - Sender is Dan's email address
- When a forwarded email is detected:
  - Extract the original sender and content
  - Send a high-priority Telegram notification: "[FORWARDED] Dan forwarded an email from [original sender] re: [subject]"
  - Store in `${WORKSPACE}/data/forwarded-emails.json` for tracking
- Log activity to `${WORKSPACE}/logs/email-forward-detect.log`

**Reference implementation:**

```javascript
#!/usr/bin/env node
// email-forward-detect.js -- Detect emails forwarded from Dan for processing
//
// Usage: node email-forward-detect.js
// Also called by email-check.js for integrated scanning

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.WORKSPACE || path.join(process.env.HOME, '.openclaw/workspace');
const DATA_DIR = path.join(WORKSPACE, 'data');
const LOG_DIR = path.join(WORKSPACE, 'logs');
const FORWARDED_FILE = path.join(DATA_DIR, 'forwarded-emails.json');
const ENV_FILE = path.join(WORKSPACE, '.env');

// Dan's known email addresses (add more as needed)
const DAN_EMAILS = [
  'dan@crusoeventures.com'
];

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return;
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n');
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

function log(msg) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const ts = new Date().toISOString();
  fs.appendFileSync(path.join(LOG_DIR, 'email-forward-detect.log'), `[${ts}] ${msg}\n`);
}

function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const topicId = process.env.EMAIL_TOPIC_ID;
  if (!token || !chatId) return;

  const payload = { chat_id: chatId, text, parse_mode: 'HTML' };
  if (topicId) payload.message_thread_id = parseInt(topicId, 10);

  try {
    execFileSync('curl', [
      '-sS', '-X', 'POST',
      `https://api.telegram.org/bot${token}/sendMessage`,
      '-H', 'content-type: application/json',
      '-d', JSON.stringify(payload)
    ], { timeout: 15000 });
  } catch (err) {
    log(`ERROR sending Telegram: ${err.message}`);
  }
}

function getForwarded() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(FORWARDED_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(FORWARDED_FILE, 'utf8')); }
  catch { return {}; }
}

function saveForwarded(data) {
  fs.writeFileSync(FORWARDED_FILE, JSON.stringify(data, null, 2));
}

function isFromDan(from) {
  return DAN_EMAILS.some(email => from.toLowerCase().includes(email.toLowerCase()));
}

function isForwarded(subject) {
  return /^(Fwd?|Fw):/i.test(subject.trim());
}

async function main() {
  loadEnv();
  log('Scanning for forwarded emails from Dan...');

  const forwarded = getForwarded();
  let envelopes;

  try {
    const raw = execFileSync('himalaya', [
      'envelope', 'list',
      '--account', 'edge',
      '--folder', 'INBOX',
      '--query', 'is:unread',
      '--output', 'json'
    ], { timeout: 30000, encoding: 'utf8' });
    envelopes = JSON.parse(raw);
  } catch (err) {
    log(`ERROR listing emails: ${err.message}`);
    return;
  }

  if (!Array.isArray(envelopes) || envelopes.length === 0) {
    log('No unread emails.');
    return;
  }

  let detected = 0;

  for (const env of envelopes) {
    const id = String(env.id);
    if (forwarded[id]) continue;

    const from = env.from || '';
    const subject = env.subject || '';

    if (isFromDan(from) && isForwarded(subject)) {
      // Read the full email to extract original sender info
      let body = '';
      try {
        body = execFileSync('himalaya', [
          'message', 'read',
          '--account', 'edge',
          '--folder', 'INBOX',
          id
        ], { timeout: 15000, encoding: 'utf8' });
      } catch {}

      // Try to extract original sender from forwarded email body
      const origSenderMatch = body.match(/From:\s*(.+?)[\r\n]/);
      const origSender = origSenderMatch ? origSenderMatch[1].trim() : 'unknown';

      forwarded[id] = {
        timestamp: Date.now(),
        subject,
        originalSender: origSender,
        processedAt: new Date().toISOString()
      };

      log(`FORWARDED email detected: ${subject} (original sender: ${origSender})`);

      sendTelegram(
        `<b>[FORWARDED FROM DAN]</b>\n\n` +
        `<b>Subject:</b> ${subject}\n` +
        `<b>Original sender:</b> ${origSender}\n` +
        `<b>Email ID:</b> ${id}\n\n` +
        `<i>Dan forwarded this for processing. Reply with "read ${id}" to see full content.</i>`
      );

      detected++;
    }
  }

  saveForwarded(forwarded);
  log(`Scan complete. ${detected} forwarded email(s) detected.`);
}

main().catch(err => { log(`FATAL: ${err.message}`); process.exit(1); });
```

Expected: File exists at `${WORKSPACE}/scripts/email-forward-detect.js`.

### Phase 4: Schedule Email Checks

#### 4.1 Write Launchd Plist `[GUIDED]`

Create a launchd plist to run the email check every 15 minutes. **Level 1 -- exact syntax required** (launchd plists require absolute paths, no `~` or variable expansion).

First, resolve the absolute home directory and node path:

**Remote:**
```
echo $HOME
which node
```

Record the outputs as `${AGENT_HOME}` (e.g., `/Users/edge`) and `${NODE_PATH}` (e.g., `/opt/homebrew/bin/node`).

Then write the plist. The operator MUST substitute all values before writing -- launchd does not expand variables. Use an unquoted heredoc so the shell expands variables at write time:

**Remote:**
```
NODE_PATH=$(which node)
WORKSPACE_ABS=$(cd ${WORKSPACE} && pwd)

cat > ${AGENT_HOME}/Library/LaunchAgents/com.edge.email-check.plist << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.edge.email-check</string>

    <key>ProgramArguments</key>
    <array>
        <string>${NODE_PATH}</string>
        <string>${WORKSPACE_ABS}/scripts/email-check.js</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
        <key>WORKSPACE</key>
        <string>${WORKSPACE_ABS}</string>
        <key>HOME</key>
        <string>${AGENT_HOME}</string>
        <key>PATH</key>
        <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>StartInterval</key>
    <integer>900</integer>

    <key>StandardOutPath</key>
    <string>${WORKSPACE_ABS}/logs/email-check-stdout.log</string>
    <key>StandardErrorPath</key>
    <string>${WORKSPACE_ABS}/logs/email-check-stderr.log</string>

    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
PLIST_EOF
```

Expected: Plist file exists at `${AGENT_HOME}/Library/LaunchAgents/com.edge.email-check.plist` with all absolute paths substituted.

If this fails: Check that `~/Library/LaunchAgents/` exists (`mkdir -p ~/Library/LaunchAgents`). Verify plist syntax with `plutil -lint`.

If already exists: Compare content. If different, unload the existing job first, back up, write new version, then reload.

#### 4.2 Validate and Load the Plist `[GUIDED]`

Validate the plist syntax and load it into launchd.

**Remote:**
```
plutil -lint ${AGENT_HOME}/Library/LaunchAgents/com.edge.email-check.plist
```

Expected: `OK` output.

If validation fails: Check for XML syntax errors. Common issue: unescaped characters or missing closing tags.

Unload any existing job first (idempotency):

**Remote:**
```
launchctl bootout gui/$(id -u) ${AGENT_HOME}/Library/LaunchAgents/com.edge.email-check.plist 2>/dev/null; echo 'unloaded (or was not loaded)'
```

Load the new job:

**Remote:**
```
launchctl bootstrap gui/$(id -u) ${AGENT_HOME}/Library/LaunchAgents/com.edge.email-check.plist
```

Expected: No output (success is silent).

If this fails:
- `Bootstrap failed: 5: Input/output error`: Plist has invalid XML. Re-check with `plutil -lint`.
- `Bootstrap failed: 37: Operation already in progress`: Job is already loaded. Bootout first.
- `Bootstrap failed: 36: Operation now in progress`: Same as above.

Verify the job is loaded:

**Remote:**
```
launchctl list | grep com.edge.email-check
```

Expected: A line showing the job with PID (or `-` if waiting for next interval) and status `0`.

#### 4.3 Ensure Log Directory Exists `[AUTO]`

Create the log directory so the launchd job has somewhere to write.

**Remote:**
```
mkdir -p ${WORKSPACE}/logs
```

Expected: Directory exists.

### Phase 5: Configure TOOLS.md

#### 5.1 Add Email Tool Entries `[GUIDED]`

Add email tool entries to the Edge agent's TOOLS.md so Edge knows how to interact with email. These entries tell the AI agent what email capabilities are available and how to invoke them.

Append the following to `${WORKSPACE}/TOOLS.md`. If the file does not exist, create it.

**Remote (append to TOOLS.md):**
```
cat >> ${WORKSPACE}/TOOLS.md << 'TOOLS_EOF'

## Email (Himalaya CLI)

Email access via Himalaya CLI with IMAP/SMTP. Credentials: Gmail App Password (permanent, no OAuth refresh needed).

### check_email
Check inbox for new unread emails and classify urgency.
```
node ${WORKSPACE}/scripts/email-check.js
```
Runs automatically every 15 minutes. Manual invocation for on-demand checks.

### read_email
Read a specific email by ID.
```
himalaya message read --account edge --folder INBOX <id>
```

### list_emails
List recent emails in inbox.
```
himalaya envelope list --account edge --folder INBOX --max-width 120
```
Filter unread: add `--query "is:unread"`

### search_email
Search emails by query.
```
himalaya envelope list --account edge --folder INBOX --query "<search_query>" --max-width 120
```

### draft_reply
Draft a reply to an email. Saves to Drafts folder and notifies Dan for approval.
**NEVER sends directly -- always requires Dan's approval.**
```
node ${WORKSPACE}/scripts/email-draft.js --id <email_id> --body "Reply text"
```

### send_draft
Send an approved draft. **ONLY after Dan explicitly approves.**
```
node ${WORKSPACE}/scripts/email-send.js --id <email_id> --body "Approved reply text"
```

### forward_email
Forward an email to a recipient.
```
himalaya message forward --account edge --folder INBOX <id>
```

### mark_read
Mark an email as read.
```
himalaya flag add --account edge --folder INBOX <id> seen
```

### Email Safety Rules
- **NEVER** send emails to Dan's contacts without explicit approval
- **ALWAYS** save replies as drafts first
- **ALWAYS** notify Dan via Telegram before sending any email
- Forwarded emails from Dan are high-priority and should be processed immediately
- When in doubt, ask Dan before taking any email action
TOOLS_EOF
```

Expected: TOOLS.md exists and contains the email tool entries.

If already exists with email entries: Check if entries are from the old gog integration. If so, replace them with the Himalaya entries. Back up the old version first.

### Phase 6: Environment Configuration

#### 6.1 Ensure All Environment Variables Are Set `[GUIDED]`

Verify all required environment variables are in the workspace `.env` file. The email scripts read from this file.

**Remote:**
```
grep -c 'GMAIL_APP_PASSWORD' ${WORKSPACE}/.env && \
grep -c 'TELEGRAM_BOT_TOKEN' ${WORKSPACE}/.env && \
grep -c 'TELEGRAM_CHAT_ID' ${WORKSPACE}/.env && \
echo 'ALL_VARS_PRESENT' || echo 'MISSING_VARS'
```

If any variables are missing, add them:

**Remote:**
```
grep -q 'TELEGRAM_BOT_TOKEN' ${WORKSPACE}/.env || echo 'TELEGRAM_BOT_TOKEN=${TELEGRAM_BOT_TOKEN}' >> ${WORKSPACE}/.env
grep -q 'TELEGRAM_CHAT_ID' ${WORKSPACE}/.env || echo 'TELEGRAM_CHAT_ID=${TELEGRAM_CHAT_ID}' >> ${WORKSPACE}/.env
grep -q 'EMAIL_TOPIC_ID' ${WORKSPACE}/.env || echo 'EMAIL_TOPIC_ID=${EMAIL_TOPIC_ID}' >> ${WORKSPACE}/.env
grep -q 'WORKSPACE' ${WORKSPACE}/.env || echo 'WORKSPACE=${WORKSPACE}' >> ${WORKSPACE}/.env
```

Expected: All required variables present in `.env`.

#### 6.2 Remove or Disable Old gog Email Configuration `[GUIDED]`

If the old gog OAuth email integration exists, disable it to prevent conflicts. Do NOT delete gog entirely as it may still be used for Calendar and Drive.

**Remote:**
```
launchctl list 2>/dev/null | grep -i 'gog.*email\|email.*refresh\|gog.*gmail' || echo 'NO_GOG_EMAIL_JOBS'
```

If gog email-specific launchd jobs are found, unload them:

**Remote:**
```
# Only unload email-specific gog jobs, NOT calendar/drive jobs
# The operator must inspect the job names and only remove email-related ones
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/<gog-email-job>.plist 2>/dev/null
```

Expected: Old gog email jobs are disabled. Calendar and Drive gog jobs remain active if present.

If no gog email jobs: Skip this step.

## Verification

Run these checks after deployment to confirm everything works.

### 1. Himalaya Can List Emails

**Remote:**
```
himalaya envelope list --account edge --folder INBOX --max-width 120 | head -10
```

Expected: Table of recent emails.

### 2. Himalaya Can Read an Email

**Remote:**
```
LATEST=$(himalaya envelope list --account edge --folder INBOX --output json 2>/dev/null | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
himalaya message read --account edge --folder INBOX "$LATEST" | head -20
```

Expected: Email body content.

### 3. Email Check Script Runs

**Remote:**
```
cd ${WORKSPACE} && node scripts/email-check.js
```

Expected: Script runs, logs activity, sends Telegram notifications for urgent/normal unread emails (or logs "No unread emails").

### 4. Forward Detection Works

**Remote:**
```
cd ${WORKSPACE} && node scripts/email-forward-detect.js
```

Expected: Script runs, detects any forwarded emails from Dan (or logs "No unread emails").

### 5. Launchd Job Is Running

**Remote:**
```
launchctl list | grep com.edge.email-check
```

Expected: Job listed with status `0` (success) or `-` (not yet run).

### 6. Logs Are Being Written

**Remote:**
```
ls -la ${WORKSPACE}/logs/email-check*.log
tail -5 ${WORKSPACE}/logs/email-check.log
```

Expected: Log files exist with recent entries.

### 7. TOOLS.md Has Email Entries

**Remote:**
```
grep -c 'himalaya' ${WORKSPACE}/TOOLS.md
```

Expected: Multiple matches confirming email tool entries are present.

### 8. Environment Variables Are Set

**Remote:**
```
grep -c 'GMAIL_APP_PASSWORD\|TELEGRAM_BOT_TOKEN\|TELEGRAM_CHAT_ID\|EMAIL_TOPIC_ID' ${WORKSPACE}/.env
```

Expected: 4 (all variables present).

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `authentication failed` on Himalaya | Wrong App Password or 2-Step Verification not enabled | Verify the 16-char App Password. Ensure 2FA is ON in Google Account. |
| `connection refused` or `timeout` | IMAP not enabled in Gmail or network issue | Enable IMAP: Gmail Settings > Forwarding and POP/IMAP > Enable IMAP. Check firewall. |
| `TLS handshake failed` | Outdated system certificates | Run `brew install ca-certificates` or update macOS. |
| Launchd job not running | Plist has non-absolute paths or invalid XML | Check with `plutil -lint`. Ensure ALL paths are absolute (no `~`). |
| No Telegram notifications | Missing bot token or chat ID in `.env` | Verify `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `${WORKSPACE}/.env`. |
| Duplicate notifications | Processed file corrupted or missing | Delete `${WORKSPACE}/data/email-processed.json` and re-run. Will re-notify for current unread. |
| Scripts fail with "himalaya: command not found" | PATH not set in launchd environment | Check plist `EnvironmentVariables > PATH` includes `/opt/homebrew/bin`. |
| gog and Himalaya conflict | Both trying to manage email | Disable gog email jobs (Phase 6.2). Keep gog for Calendar/Drive only. |
| App Password stops working | Google revoked it (rare) or account security event | Generate a new App Password and update `${WORKSPACE}/.env`. |
| Draft not appearing in Gmail | Himalaya save-to-drafts format issue | Check Gmail Drafts folder directly. May need to adjust folder alias in config.toml. |
| email-check.js takes too long | Too many unread emails to process | Add `--page-size 50` to the envelope list command in the script to limit per-run processing. |

## Autonomy Mode Behavior

| Step | Auto | Guided | Manual |
|------|------|--------|--------|
| 1.1 Install Himalaya | Execute silently | Execute silently | Show brew output, confirm |
| 1.2 Verify installation | Execute silently | Execute silently | Show version |
| 2.1 Store App Password | **ALWAYS ask Dan** | **ALWAYS ask Dan** | **ALWAYS ask Dan** |
| 2.2 Write Himalaya config | Execute silently | Confirm before writing | Show config, confirm |
| 2.3 Verify email access | Execute, report result | Execute, review output together | Confirm each test |
| 3.1 Create scripts dir | Execute silently | Execute silently | Confirm |
| 3.2 Install email-check.js | Execute silently | Confirm before writing | Show script, confirm |
| 3.3 Install email-draft.js | Execute silently | Confirm before writing | Show script, confirm |
| 3.4 Install email-send.js | Execute silently | Confirm before writing | Show script, confirm |
| 3.5 Install email-forward-detect.js | Execute silently | Confirm before writing | Show script, confirm |
| 4.1 Write launchd plist | Execute silently | Confirm before writing | Show plist, confirm |
| 4.2 Load plist | Execute silently | Confirm before loading | Confirm command |
| 4.3 Ensure log dir | Execute silently | Execute silently | Confirm |
| 5.1 Add TOOLS.md entries | Execute silently | Confirm before appending | Show entries, confirm |
| 6.1 Check env vars | Execute silently | Report status | Show each var |
| 6.2 Disable old gog email | Execute silently | Confirm which jobs to remove | Confirm each removal |

## Dependencies

- **Depends on:** `deploy-identity.md` (Edge agent identity), `deploy-messaging-setup.md` (Telegram for notifications)
- **Replaces:** `deploy-google-workspace.md` email functionality (Gmail via `gog` OAuth). Calendar and Drive via `gog` remain unaffected.
- **Enhanced by:** `deploy-urgent-email.md` (can be adapted to use Himalaya instead of gog for email scanning), `deploy-daily-briefing.md` (can include email summary)
- **Required by:** Any downstream skill that needs email access (replaces gog email dependency)

## Migration Notes: gog -> Himalaya

This skill replaces the `gog` OAuth email integration. Key differences:

| Aspect | gog OAuth (old) | Himalaya IMAP/SMTP (new) |
|--------|----------------|--------------------------|
| Auth method | OAuth 2.0 tokens | Gmail App Password |
| Token lifetime | ~7 days (requires refresh) | Permanent (never expires) |
| Maintenance | High (re-auth every week) | Zero (set and forget) |
| CLI tool | `gog gmail messages list` | `himalaya envelope list` |
| Read email | `gog gmail messages get <id>` | `himalaya message read <id>` |
| Send email | `gog gmail messages send` | `himalaya message write` / `reply` |
| Configuration | OAuth client ID/secret + token | App Password in `.env` + TOML config |
| Calendar/Drive | Included | NOT included (keep gog for these) |

**Important:** This migration only covers email. If the client uses gog for Calendar or Drive, those integrations remain on gog. Only email-specific gog jobs should be disabled.
