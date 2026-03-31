# Deploy Git Auto-Sync v2

## Compatibility
- **Status**: READY
- **Platform**: macOS (Apple Silicon / Intel)
- **Dependencies**: git, ssh, launchd, bash, curl
- **Replaces**: `deploy-git-autosync.md` (BLOCKED -- referenced 7 nonexistent OpenClaw CLI commands)
- **Pattern**: Standalone scripts + file-based config + launchd scheduling. Zero OpenClaw CLI dependency.

## Purpose

Keep Edge's workspace and any managed repositories automatically synced to GitHub with hourly commits and pushes. This prevents work loss, provides change history, and ensures the remote always has a recent snapshot. Includes pre-commit safety checks that block secrets, credentials, and oversized files from ever reaching the remote.

**When to use:** After initial workspace setup on a Mac Mini. Deploy this early so all subsequent changes are version-controlled from day one.

**What this skill does:**
1. Configures the list of repos to sync, SSH keys, and git identity
2. Writes a pre-flight script that blocks dangerous files before any commit
3. Writes a sync script that commits tracked changes, pulls with rebase, pushes, and reports conflicts via Telegram
4. Schedules hourly execution via launchd
5. Registers manual sync and status check tools in TOOLS.md

## How Commands Are Sent

This skill is executed by an operator who has an active remote session.
See `_deploy-common.md` -> "Command Delivery" for the full protocol.

- **Remote:** commands sent via `POST /api/sessions/${SESSION_ID}/commands` or device exec
- **Operator:** commands run on the operator's local terminal

## Variables

Resolve these before executing. Sources are listed for each.

| Variable | Source | Example |
|----------|--------|---------|
| `${WORKSPACE}` | Client profile: workspace path | `/Users/edge/.openclaw/workspace` |
| `${GIT_REPOS}` | Client profile: comma-separated absolute paths of repos to sync | `/Users/edge/.openclaw/workspace,/Users/edge/projects/app` |
| `${GIT_REMOTE}` | Client profile: git remote name (default: `origin`) | `origin` |
| `${GIT_BRANCH}` | Client profile: branch to sync (default: `main`) | `main` |
| `${SSH_KEY_PATH}` | Client profile: path to SSH private key for GitHub | `/Users/edge/.ssh/id_ed25519` |
| `${TELEGRAM_BOT_TOKEN}` | Client profile: Telegram bot token for alerts | `7123456789:AAF...` |
| `${TELEGRAM_CHAT_ID}` | Client profile: Telegram chat/group ID for alerts | `-1001234567890` |
| `${AGENT_USER}` | Pre-flight: `whoami` on client machine | `edge` |

## Before You Start

Follow the **Standard Deployment Protocol** in `_deploy-common.md`: read the client profile, check what exists, identify adaptations, and present a deployment plan before executing.

**Pre-flight checks for this skill:**

Verify git is installed and identity is configured:

**Remote:**
```
git --version && git config --global user.name && git config --global user.email
```

Expected: Git version, user name, and email all printed.

Verify SSH access to GitHub:

**Remote:**
```
ssh -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=accept-new -T git@github.com 2>&1 || true
```

Expected: Output contains "successfully authenticated" (returns non-zero because GitHub does not provide shell access -- that is normal).

Check each repo has a remote and is on the correct branch:

**Remote:**
```
for repo in $(echo "${GIT_REPOS}" | tr ',' ' '); do
  printf "=== %s ===\n" "$repo"
  git -C "$repo" remote -v 2>/dev/null | head -2
  git -C "$repo" branch --show-current 2>/dev/null
done
```

Expected: Each repo shows an `origin` remote with a push URL and is on `${GIT_BRANCH}`.

Check if this skill is already deployed (launchd plist exists):

**Remote:**
```
ls ~/Library/LaunchAgents/com.rel.git-sync.plist 2>/dev/null && echo 'ALREADY_DEPLOYED' || echo 'NOT_DEPLOYED'
```

Expected: `NOT_DEPLOYED` for first-time setup. If `ALREADY_DEPLOYED`, this is a re-deployment -- inspect the existing config before overwriting.

**Decision points from pre-flight:**
- Is git identity configured? If not, set it before proceeding.
- Does SSH auth work? If not, generate or add a key before proceeding.
- Do all repos have remotes? If not, the operator needs remote URLs from the client profile.
- Is the launchd job already loaded? If so, unload before replacing.

## Adaptation Points

| Component | Default | Customize When... |
|-----------|---------|-------------------|
| Repos synced | `${GIT_REPOS}` (comma-separated list) | Client adds or removes repositories |
| Sync frequency | Hourly (on the hour) | Client wants more frequent (every 15 min) or less frequent (every 6h, daily) |
| Remote name | `origin` | Client uses a different remote name |
| Branch | `main` | Client works on a different branch |
| Conflict handling | Stash, pull, pop, report via Telegram | Client wants auto-merge or hard-stop behavior |
| Pre-commit blocks | `.env`, credentials, >5MB, Chrome profiles | Client has additional patterns to block or wants to relax rules |
| Alert channel | Telegram | Client uses Discord, Slack, or another channel |
| SSH key | `${SSH_KEY_PATH}` | Client uses HTTPS auth or a deploy key |

## Prerequisites

- macOS with git installed (comes with Xcode CLT)
- SSH key configured and added to GitHub
- Remote repositories created for all repos in `${GIT_REPOS}`
- Telegram bot token and chat ID for conflict alerts (optional but recommended)

## What Gets Installed

| Component | Location | Purpose |
|-----------|----------|---------|
| Sync config | `${WORKSPACE}/scripts/git-sync.conf` | List of repos, remote, branch, alert settings |
| Pre-flight script | `${WORKSPACE}/scripts/git-preflight.sh` | Block secrets, credentials, large files before commit |
| Sync script | `${WORKSPACE}/scripts/git-sync.sh` | Commit tracked changes, pull with rebase, push, alert on conflict |
| LaunchAgent plist | `~/Library/LaunchAgents/com.rel.git-sync.plist` | Hourly launchd schedule |
| Log file | `${WORKSPACE}/logs/git-sync.log` | Append-only log of every sync run |
| TOOLS.md entries | `${WORKSPACE}/TOOLS.md` | Manual sync trigger and status check tools |

## Steps

### Phase 1: Configuration

#### 1.1 Create Script and Log Directories `[AUTO]`

Ensure the directories for scripts and logs exist.

**Remote:**
```
mkdir -p ${WORKSPACE}/scripts ${WORKSPACE}/logs
```

Expected: Both directories exist.

If already exists: `mkdir -p` is idempotent. No action needed.

#### 1.2 Write the Sync Configuration File `[GUIDED]`

Write a plain-text configuration file that the sync and pre-flight scripts source. This keeps all tunables in one place -- no values are hardcoded in the scripts themselves.

**Remote:**
```
cat > ${WORKSPACE}/scripts/git-sync.conf << CONF_EOF
# Git Auto-Sync Configuration
# Generated by deploy-git-autosync-v2

# Comma-separated absolute paths of repos to sync
GIT_REPOS="${GIT_REPOS}"

# Git remote name and branch
GIT_REMOTE="${GIT_REMOTE}"
GIT_BRANCH="${GIT_BRANCH}"

# SSH key for authentication
SSH_KEY_PATH="${SSH_KEY_PATH}"
GIT_SSH_COMMAND="ssh -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=accept-new"

# Telegram alerts (leave empty to disable)
TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN}"
TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID}"

# Pre-flight settings
MAX_FILE_SIZE_BYTES=5242880

# Log file
SYNC_LOG="${WORKSPACE}/logs/git-sync.log"
CONF_EOF
```

> **Important:** The operator MUST substitute all `${...}` variables with literal values before sending this command. Use an unquoted heredoc so the shell expands variables on the operator side.

Expected: File exists at `${WORKSPACE}/scripts/git-sync.conf` with all values filled in.

If this fails: Check that `${WORKSPACE}/scripts/` directory exists.

If already exists: Compare content. If values have changed, back up as `.conf.bak` and write the new version.

#### 1.3 Verify Git Identity `[AUTO]`

Confirm git has a user name and email configured globally. Required for commits.

**Remote:**
```
git config --global user.name && git config --global user.email
```

Expected: Both values printed (e.g., `Edge` and `edge@example.com`).

If this fails: Configure it using the client's actual name and email:

**Remote:**
```
git config --global user.name "Edge" && git config --global user.email "edge@example.com"
```

#### 1.4 Verify Push Access `[AUTO]`

Verify the SSH key can authenticate to GitHub.

**Remote:**
```
GIT_SSH_COMMAND="ssh -i ${SSH_KEY_PATH} -o StrictHostKeyChecking=accept-new" git ls-remote --exit-code ${GIT_REMOTE} HEAD 2>&1 | head -3
```

Run this against the first repo in `${GIT_REPOS}` to confirm push credentials work.

Expected: A commit hash and `HEAD` ref printed, or a `refs/heads/main` line. Exit code 0.

If this fails: SSH key may not be added to GitHub, or the remote URL is wrong. Check `ssh -i ${SSH_KEY_PATH} -T git@github.com 2>&1`. If it says "Permission denied," the key needs to be added to the GitHub account.

### Phase 2: Scripts

#### 2.1 Write the Pre-Flight Script `[GUIDED]`

Write the pre-commit safety checks script. This runs before every commit to block dangerous files from being staged. It is called by `git-sync.sh` -- it is NOT installed as a git hook (the sync script calls it explicitly so it works across all repos without per-repo hook installation).

The script checks the staged diff for:
1. `.env` files (any path matching `.env` or `*.env*`)
2. Credential patterns (`*credentials*`, `*secret*`, `*token*`, `*password*`, `*.pem`, `*.key`)
3. Files larger than 5MB
4. Chrome/Chromium profile directories (Cookies, Login Data, Web Data, History)

**Remote:**
```
cat > ${WORKSPACE}/scripts/git-preflight.sh << 'PREFLIGHT_EOF'
#!/bin/bash
# git-preflight.sh -- Pre-commit safety checks for git-sync
# Blocks secrets, credentials, large files, and browser profile data.
# Exit 0 = safe to commit. Exit 1 = blocked files found.
#
# Usage: git-preflight.sh /path/to/repo

set -euo pipefail

REPO_DIR="${1:?Usage: git-preflight.sh /path/to/repo}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Source config for MAX_FILE_SIZE_BYTES
if [ -f "${SCRIPT_DIR}/git-sync.conf" ]; then
    source "${SCRIPT_DIR}/git-sync.conf"
fi
MAX_SIZE="${MAX_FILE_SIZE_BYTES:-5242880}"

BLOCKED=()

# Get list of staged files (only tracked files that have changes)
STAGED_FILES=$(git -C "${REPO_DIR}" diff --cached --name-only --diff-filter=ACMR 2>/dev/null || true)

# If nothing staged, also check unstaged tracked changes (sync script stages before calling this)
if [ -z "${STAGED_FILES}" ]; then
    STAGED_FILES=$(git -C "${REPO_DIR}" diff --name-only --diff-filter=ACMR 2>/dev/null || true)
fi

if [ -z "${STAGED_FILES}" ]; then
    exit 0
fi

while IFS= read -r file; do
    [ -z "${file}" ] && continue
    full_path="${REPO_DIR}/${file}"

    # Skip if file no longer exists (deleted)
    [ -f "${full_path}" ] || continue

    basename_lower=$(printf '%s' "$(basename "${file}")" | tr '[:upper:]' '[:lower:]')
    dirname_lower=$(printf '%s' "${file}" | tr '[:upper:]' '[:lower:]')

    # Check 1: .env files
    case "${basename_lower}" in
        .env|.env.*|*.env)
            BLOCKED+=("ENV_FILE: ${file}")
            continue
            ;;
    esac

    # Check 2: Credential patterns
    case "${basename_lower}" in
        *credential*|*secret*|*token*|*password*|*.pem|*.key|*.p12|*.pfx|*.keystore)
            BLOCKED+=("CREDENTIAL: ${file}")
            continue
            ;;
    esac

    # Check 3: Chrome / Chromium profile data
    case "${basename_lower}" in
        cookies|cookies-journal|"login data"|"login data-journal"|"web data"|"web data-journal"|history|history-journal)
            BLOCKED+=("CHROME_PROFILE: ${file}")
            continue
            ;;
    esac
    # Also block anything under a Chrome profile directory path
    case "${dirname_lower}" in
        *"google/chrome"*|*"chromium"*|*"chrome/default"*|*"brave-browser"*)
            BLOCKED+=("CHROME_DIR: ${file}")
            continue
            ;;
    esac

    # Check 4: File size
    file_size=$(stat -f%z "${full_path}" 2>/dev/null || echo "0")
    if [ "${file_size}" -gt "${MAX_SIZE}" ]; then
        size_mb=$(( file_size / 1048576 ))
        BLOCKED+=("TOO_LARGE(${size_mb}MB): ${file}")
        continue
    fi

done <<< "${STAGED_FILES}"

if [ ${#BLOCKED[@]} -gt 0 ]; then
    printf '[git-preflight] BLOCKED %d file(s):\n' "${#BLOCKED[@]}" >&2
    for entry in "${BLOCKED[@]}"; do
        printf '  - %s\n' "${entry}" >&2
    done
    exit 1
fi

exit 0
PREFLIGHT_EOF
chmod +x ${WORKSPACE}/scripts/git-preflight.sh
```

Expected: Script exists at `${WORKSPACE}/scripts/git-preflight.sh` and is executable.

If this fails: Check that `${WORKSPACE}/scripts/` exists.

If already exists: Compare content. If different, back up as `.bak` and write the new version.

#### 2.2 Write the Sync Script `[GUIDED]`

Write the main sync script. For each configured repo, it:
1. Checks for tracked changes (skips repos with no changes)
2. Runs pre-flight checks on changed files
3. Stages only tracked files (`git add -u` -- never `git add .` to avoid catching untracked secrets)
4. Commits with a timestamp message
5. Pulls with rebase to incorporate remote changes
6. Pushes to the remote
7. On conflict: stashes local changes, pulls, attempts to pop stash, and reports via Telegram if unresolved

**Remote:**
```
cat > ${WORKSPACE}/scripts/git-sync.sh << 'SYNC_EOF'
#!/bin/bash
# git-sync.sh -- Hourly auto-commit and push for configured repos
# Sources config from git-sync.conf. Sends Telegram alerts on conflict.
#
# Usage: git-sync.sh [--dry-run]

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CONF_FILE="${SCRIPT_DIR}/git-sync.conf"

if [ ! -f "${CONF_FILE}" ]; then
    printf '[git-sync] ERROR: Config not found at %s\n' "${CONF_FILE}" >&2
    exit 1
fi

source "${CONF_FILE}"

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

TIMESTAMP=$(date -u +"%Y-%m-%d %H:%M UTC")
TIMESTAMP_SHORT=$(date -u +"%Y%m%d-%H%M")
EXIT_CODE=0

# --- Logging ---

log() {
    local level="$1"; shift
    local msg="$*"
    local line="[$(date -u +"%Y-%m-%d %H:%M:%S")] [${level}] ${msg}"
    printf '%s\n' "${line}"
    if [ -n "${SYNC_LOG:-}" ]; then
        printf '%s\n' "${line}" >> "${SYNC_LOG}"
    fi
}

# --- Telegram alert ---

send_alert() {
    local message="$1"
    if [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ]; then
        log "WARN" "Telegram not configured -- alert not sent: ${message}"
        return 0
    fi

    local escaped
    escaped=$(printf '%s' "${message}" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read()))" 2>/dev/null || printf '"%s"' "${message}")

    curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -H "Content-Type: application/json" \
        -d "{\"chat_id\": \"${TELEGRAM_CHAT_ID}\", \"text\": ${escaped}, \"parse_mode\": \"HTML\"}" \
        > /dev/null 2>&1 || log "WARN" "Telegram send failed"
}

# --- Sync one repo ---

sync_repo() {
    local repo_path="$1"
    local repo_name
    repo_name=$(basename "${repo_path}")

    log "INFO" "--- Syncing: ${repo_name} (${repo_path}) ---"

    # Validate repo exists and is a git repo
    if [ ! -d "${repo_path}/.git" ]; then
        log "ERROR" "${repo_path} is not a git repository"
        return 1
    fi

    # Set SSH command for this repo
    export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh}"

    # Check we are on the correct branch
    local current_branch
    current_branch=$(git -C "${repo_path}" branch --show-current 2>/dev/null)
    if [ "${current_branch}" != "${GIT_BRANCH}" ]; then
        log "WARN" "${repo_name}: on branch '${current_branch}', expected '${GIT_BRANCH}'. Skipping."
        return 0
    fi

    # Check for tracked changes (staged or unstaged)
    local has_changes
    has_changes=$(git -C "${repo_path}" status --porcelain 2>/dev/null | grep -c '^.\S' || true)
    local has_staged
    has_staged=$(git -C "${repo_path}" diff --cached --name-only 2>/dev/null | head -1)

    if [ "${has_changes}" = "0" ] && [ -z "${has_staged}" ]; then
        log "INFO" "${repo_name}: No tracked changes. Pull-only."

        # Still pull to stay current
        if [ "${DRY_RUN}" = false ]; then
            git -C "${repo_path}" pull --rebase "${GIT_REMOTE}" "${GIT_BRANCH}" 2>&1 || true
        fi
        return 0
    fi

    log "INFO" "${repo_name}: Changes detected. Running pre-flight checks."

    # Stage tracked files only (never auto-add untracked)
    git -C "${repo_path}" add -u 2>/dev/null

    # Run pre-flight checks
    if ! "${SCRIPT_DIR}/git-preflight.sh" "${repo_path}"; then
        log "WARN" "${repo_name}: Pre-flight blocked commit. Unstaging."
        git -C "${repo_path}" reset HEAD 2>/dev/null || true
        send_alert "<b>Git Sync - Pre-flight Block</b>
Repo: <code>${repo_name}</code>
Pre-flight checks blocked the commit. Check the log for details."
        return 1
    fi

    if [ "${DRY_RUN}" = true ]; then
        log "INFO" "${repo_name}: [DRY RUN] Would commit and push."
        git -C "${repo_path}" reset HEAD 2>/dev/null || true
        return 0
    fi

    # Commit
    local commit_msg="auto-sync: ${TIMESTAMP_SHORT}"
    git -C "${repo_path}" commit -m "${commit_msg}" 2>&1 || {
        log "INFO" "${repo_name}: Nothing to commit after staging."
        return 0
    }

    log "INFO" "${repo_name}: Committed: ${commit_msg}"

    # Pull with rebase
    local pull_output
    pull_output=$(git -C "${repo_path}" pull --rebase "${GIT_REMOTE}" "${GIT_BRANCH}" 2>&1) || {
        local pull_exit=$?
        log "ERROR" "${repo_name}: Pull --rebase failed (exit ${pull_exit})"
        log "ERROR" "${pull_output}"

        # Abort rebase if in progress
        git -C "${repo_path}" rebase --abort 2>/dev/null || true

        # Attempt stash-based recovery
        log "INFO" "${repo_name}: Attempting stash-based recovery..."
        git -C "${repo_path}" stash 2>/dev/null || true
        git -C "${repo_path}" pull "${GIT_REMOTE}" "${GIT_BRANCH}" 2>/dev/null || true

        local pop_output
        pop_output=$(git -C "${repo_path}" stash pop 2>&1) || {
            log "ERROR" "${repo_name}: Stash pop failed -- CONFLICT"
            send_alert "<b>Git Sync - CONFLICT</b>
Repo: <code>${repo_name}</code>
Pull with rebase failed and stash pop has conflicts.
Manual resolution required on the machine.

<code>${pop_output}</code>"
            EXIT_CODE=1
            return 1
        }

        # If stash pop succeeded, re-stage and commit
        git -C "${repo_path}" add -u 2>/dev/null
        git -C "${repo_path}" commit -m "auto-sync: merge after stash recovery ${TIMESTAMP_SHORT}" 2>/dev/null || true
    }

    # Push
    local push_output
    push_output=$(git -C "${repo_path}" push "${GIT_REMOTE}" "${GIT_BRANCH}" 2>&1) || {
        local push_exit=$?
        log "ERROR" "${repo_name}: Push failed (exit ${push_exit})"
        log "ERROR" "${push_output}"
        send_alert "<b>Git Sync - Push Failed</b>
Repo: <code>${repo_name}</code>
Push to ${GIT_REMOTE}/${GIT_BRANCH} failed.

<code>${push_output}</code>"
        EXIT_CODE=1
        return 1
    }

    log "INFO" "${repo_name}: Pushed to ${GIT_REMOTE}/${GIT_BRANCH}"
    return 0
}

# --- Main ---

log "INFO" "=== Git Auto-Sync started at ${TIMESTAMP} ==="

IFS=',' read -ra REPO_LIST <<< "${GIT_REPOS}"

for repo in "${REPO_LIST[@]}"; do
    # Trim whitespace
    repo=$(printf '%s' "${repo}" | xargs)
    [ -z "${repo}" ] && continue

    sync_repo "${repo}" || {
        log "ERROR" "Failed to sync ${repo}"
        EXIT_CODE=1
    }
done

if [ "${EXIT_CODE}" -eq 0 ]; then
    log "INFO" "=== Git Auto-Sync completed successfully ==="
else
    log "WARN" "=== Git Auto-Sync completed with errors ==="
fi

exit ${EXIT_CODE}
SYNC_EOF
chmod +x ${WORKSPACE}/scripts/git-sync.sh
```

Expected: Script exists at `${WORKSPACE}/scripts/git-sync.sh` and is executable.

If this fails: Check that `${WORKSPACE}/scripts/` directory exists.

If already exists: Compare content. If different, back up as `.bak` and write the new version.

### Phase 3: Scheduling

#### 3.1 Write the LaunchAgent Plist `[GUIDED]`

Create a launchd plist that runs the sync script hourly. Launchd is the correct scheduling mechanism on macOS -- do NOT use crontab (it hangs on macOS Sequoia via remote PTY).

**Level 1 -- exact syntax required.** Launchd plists require absolute paths. `~` and `${HOME}` are NOT expanded in plist files.

The operator MUST substitute `WORKSPACE_ABSOLUTE_PATH` and `AGENT_USER_VALUE` with literal values before sending.

**Remote:**
```
cat > ~/Library/LaunchAgents/com.rel.git-sync.plist << PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.rel.git-sync</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>WORKSPACE_ABSOLUTE_PATH/scripts/git-sync.sh</string>
    </array>

    <key>StartCalendarInterval</key>
    <dict>
        <key>Minute</key>
        <integer>0</integer>
    </dict>

    <key>StandardOutPath</key>
    <string>WORKSPACE_ABSOLUTE_PATH/logs/git-sync.log</string>

    <key>StandardErrorPath</key>
    <string>WORKSPACE_ABSOLUTE_PATH/logs/git-sync.log</string>

    <key>UserName</key>
    <string>AGENT_USER_VALUE</string>

    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/usr/bin:/bin:/opt/homebrew/bin</string>
        <key>HOME</key>
        <string>/Users/AGENT_USER_VALUE</string>
    </dict>

    <key>RunAtLoad</key>
    <false/>

    <key>Nice</key>
    <integer>10</integer>
</dict>
</plist>
PLIST_EOF
```

> **Critical substitutions before sending:**
> - `WORKSPACE_ABSOLUTE_PATH` -> the fully expanded workspace path (e.g., `/Users/edge/.openclaw/workspace`)
> - `AGENT_USER_VALUE` -> the macOS username (e.g., `edge`)
>
> These MUST be absolute paths. Launchd does not expand `~` or `$HOME`.

Expected: Plist file exists at `~/Library/LaunchAgents/com.rel.git-sync.plist`.

If this fails: Check that `~/Library/LaunchAgents/` exists. Create with `mkdir -p ~/Library/LaunchAgents`.

If already exists: Unload the existing job first (Step 3.2), then overwrite. The new plist takes effect on the next load.

#### 3.2 Load the LaunchAgent `[GUIDED]`

Register the plist with launchd. If a previous version is loaded, unload it first.

**Level 1 -- exact syntax required.**

Check if already loaded:

**Remote:**
```
launchctl list 2>/dev/null | grep 'com.rel.git-sync' && echo 'LOADED' || echo 'NOT_LOADED'
```

If `LOADED`, unload first:

**Remote:**
```
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.rel.git-sync.plist 2>/dev/null || true
```

Load the new plist:

**Remote:**
```
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.rel.git-sync.plist
```

Expected: No error output. The job is now registered and will fire at the top of every hour.

If this fails:
- **"Path not valid"**: The plist has a syntax error. Validate with `plutil ~/Library/LaunchAgents/com.rel.git-sync.plist`.
- **"Service already loaded"**: Unload first with the bootout command above, then retry.
- **"Could not find specified service"**: Check the Label in the plist matches `com.rel.git-sync`.

Verify the job is loaded:

**Remote:**
```
launchctl list | grep 'com.rel.git-sync'
```

Expected: A line showing the job with PID `-` (not yet run) or a PID number (currently running). Exit status `0` in the second column means the last run succeeded.

### Phase 4: TOOLS.md Entries

#### 4.1 Add Manual Sync and Status Check Tools `[GUIDED]`

Append tool entries to `${WORKSPACE}/TOOLS.md` so the agent can trigger a manual sync or check sync status on demand.

Check if TOOLS.md exists and whether git-sync entries are already present:

**Remote:**
```
test -f ${WORKSPACE}/TOOLS.md && grep -c 'git-sync' ${WORKSPACE}/TOOLS.md 2>/dev/null || echo '0'
```

If entries do not exist, append them:

**Remote:**
```
cat >> ${WORKSPACE}/TOOLS.md << 'TOOLS_EOF'

## Git Auto-Sync

### Manual Sync Trigger
Run an immediate git sync across all configured repos without waiting for the hourly schedule.
```bash
${WORKSPACE}/scripts/git-sync.sh
```
Use `--dry-run` to preview what would be committed without actually pushing.

### Sync Status Check
View the recent sync log to check if syncs are succeeding.
```bash
tail -30 ${WORKSPACE}/logs/git-sync.log
```

### Check launchd Job Status
Verify the hourly schedule is active.
```bash
launchctl list | grep com.rel.git-sync
```
Exit status 0 in the second column = last run succeeded. A PID in the first column = currently running.

TOOLS_EOF
```

> **Note:** The `${WORKSPACE}` references inside the TOOLS.md code blocks are literal documentation -- they should appear as `${WORKSPACE}` in the file so the agent knows to substitute the workspace path when running them. Use a single-quoted heredoc (`'TOOLS_EOF'`) to prevent expansion.

Expected: TOOLS.md exists at `${WORKSPACE}/TOOLS.md` with the git sync tool entries appended.

If this fails: Check that `${WORKSPACE}/TOOLS.md` exists. If not, create it with these entries as the initial content.

If already exists (the git-sync entries): Skip. Do not create duplicate entries.

### Phase 5: Verification

#### 5.1 Run a Dry-Run Sync `[GUIDED]`

Execute the sync script in dry-run mode to verify it reads the config, discovers repos, runs pre-flight, and reports what it would do -- without actually committing or pushing.

**Remote:**
```
${WORKSPACE}/scripts/git-sync.sh --dry-run
```

Expected: Output shows each repo being checked, pre-flight passing, and "[DRY RUN] Would commit and push" for repos with changes. No actual commits or pushes.

If this fails:
- **"Config not found"**: Check that `${WORKSPACE}/scripts/git-sync.conf` exists and the `SCRIPT_DIR` detection works. Run `cat ${WORKSPACE}/scripts/git-sync.conf` to verify.
- **"not a git repository"**: A repo path in `GIT_REPOS` is wrong. Verify with `ls -d /path/to/repo/.git`.
- **"Pre-flight blocked commit"**: The pre-flight script caught something. Check the log output for which files were blocked. Either fix the issue or update the pre-flight rules.

#### 5.2 Run a Live Sync `[GUIDED]`

Execute the sync script for real. This will commit any pending tracked changes and push.

**Remote:**
```
${WORKSPACE}/scripts/git-sync.sh
```

Expected: For each repo, one of:
- "No tracked changes. Pull-only." followed by a successful pull
- A commit message like "auto-sync: 20260327-1400" followed by a successful push

Verify recent commits:

**Remote:**
```
for repo in $(echo "${GIT_REPOS}" | tr ',' ' '); do
  printf "=== %s ===\n" "$(basename "$repo")"
  git -C "$repo" log --oneline -3
  git -C "$repo" status -sb
done
```

Expected: Recent auto-sync commits visible. Branch shows `## main...origin/main` (up to date with remote).

#### 5.3 Verify LaunchAgent is Scheduled `[AUTO]`

Confirm the launchd job is registered and will fire on schedule.

**Remote:**
```
launchctl list | grep 'com.rel.git-sync'
```

Expected: Job listed. The second column (exit status) should be `0` or `-` (not yet run).

#### 5.4 Test Telegram Alerts (Optional) `[GUIDED]`

If Telegram is configured, send a test alert to verify the notification path works.

**Remote:**
```
curl -sS -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
  -H "Content-Type: application/json" \
  -d "{\"chat_id\": \"${TELEGRAM_CHAT_ID}\", \"text\": \"Git Auto-Sync test alert -- deployment verified.\"}" \
  | python3 -c "import json,sys; r=json.load(sys.stdin); print('OK' if r.get('ok') else f'ERROR: {r}')"
```

Expected: `OK` -- message appears in the configured Telegram chat.

If this fails: Check bot token and chat ID. Verify the bot is a member of the group/chat.

## Verification

Run these checks to confirm the auto-sync system is fully operational:

**Config exists and is valid:**

**Remote:**
```
test -f ${WORKSPACE}/scripts/git-sync.conf && echo 'CONF_OK' || echo 'CONF_MISSING'
```

**Scripts are executable:**

**Remote:**
```
test -x ${WORKSPACE}/scripts/git-sync.sh && test -x ${WORKSPACE}/scripts/git-preflight.sh && echo 'SCRIPTS_OK' || echo 'SCRIPT_MISSING'
```

**LaunchAgent is loaded:**

**Remote:**
```
launchctl list | grep 'com.rel.git-sync' && echo 'LAUNCHD_OK' || echo 'LAUNCHD_MISSING'
```

**Sync script runs without errors:**

**Remote:**
```
${WORKSPACE}/scripts/git-sync.sh --dry-run 2>&1 | tail -5
```

Expected: Ends with "Git Auto-Sync completed successfully."

**All repos are in sync with remote:**

**Remote:**
```
for repo in $(echo "${GIT_REPOS}" | tr ',' ' '); do
  printf '%s: ' "$(basename "$repo")"
  git -C "$repo" status -sb | head -1
done
```

Expected: Each repo shows `## main...origin/main` (in sync).

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Push rejected (non-fast-forward) | Remote has commits not in local | The script pulls with rebase before pushing. If it still fails, someone force-pushed the remote. Manual `git pull --rebase` and resolve. |
| Pre-flight blocks commit | Sensitive or oversized file detected | Intentional. Check which file was blocked in the log. Add it to `.gitignore` if it should never be committed, or adjust `MAX_FILE_SIZE_BYTES` in the config. |
| Conflict alert on Telegram | Two machines edited the same tracked file | Manual intervention required. SSH in, resolve the conflict, commit, push. Do NOT force push. |
| LaunchAgent not firing | Machine was asleep at the scheduled time, or plist has errors | Launchd fires the job as soon as the machine wakes if it missed a window. Validate the plist: `plutil ~/Library/LaunchAgents/com.rel.git-sync.plist`. Check launchd list: `launchctl list \| grep com.rel.git-sync`. |
| "Config not found" error | Script cannot find `git-sync.conf` relative to its own location | Verify the conf file is in the same directory as the script: `ls ${WORKSPACE}/scripts/git-sync.conf`. |
| SSH auth failure during push | SSH key not loaded, wrong key, or GitHub revoked access | Test: `ssh -i ${SSH_KEY_PATH} -T git@github.com 2>&1`. Re-add key if needed. |
| Untracked files not committed | By design -- `git add -u` only stages tracked files | This is intentional to prevent accidentally committing secrets. To include a new file: `git add <file>` manually first, then the next sync will track it. |
| Log file growing too large | Months of hourly sync logs accumulating | Add log rotation: `tail -1000 ${WORKSPACE}/logs/git-sync.log > ${WORKSPACE}/logs/git-sync.log.tmp && mv ${WORKSPACE}/logs/git-sync.log.tmp ${WORKSPACE}/logs/git-sync.log` |
| Telegram alert not sent | Bot token or chat ID wrong, or bot not in the group | Test manually with `curl`. Verify bot membership in the group. Check token validity. |

## Autonomy Mode Behavior

| Step | Auto | Guided | Manual |
|------|------|--------|--------|
| 1.1 Create directories | Execute silently | Execute silently | Confirm |
| 1.2 Write config file | Execute silently | Show config values, confirm | Show config, confirm |
| 1.3 Verify git identity | Execute silently | Execute silently | Confirm |
| 1.4 Verify push access | Execute silently | Execute silently | Confirm |
| 2.1 Write pre-flight script | Execute silently | Show script purpose, confirm | Show full script, confirm |
| 2.2 Write sync script | Execute silently | Show script purpose, confirm | Show full script, confirm |
| 3.1 Write launchd plist | Execute silently | Show schedule and paths, confirm | Show full plist, confirm |
| 3.2 Load LaunchAgent | Execute silently | Confirm before loading | Confirm |
| 4.1 Add TOOLS.md entries | Execute silently | Show entries, confirm | Show entries, confirm |
| 5.1 Dry-run sync | Execute silently | Review output | Review output, confirm |
| 5.2 Live sync | Execute silently | Confirm before running | Confirm, review output |
| 5.3 Verify launchd | Execute silently | Execute silently | Review output |
| 5.4 Test Telegram | Skip | Confirm before sending | Confirm |

## Dependencies

- **Depends on:** Git + SSH configured on the machine, remote GitHub repositories created
- **Optional dependency:** Telegram bot (for conflict alerts) -- the sync works without Telegram, it just cannot send alerts
- **Replaces:** `deploy-git-autosync.md` (BLOCKED)
- **Required by:** None directly, but provides version control safety for all workspace content and managed repos
- **Related:** `deploy-db-backups.md` (backs up binary database files that git cannot handle well; this skill backs up code and config)
