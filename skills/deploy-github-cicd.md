# Deploy GitHub CI/CD with AI Code Review

## Compatibility
- **OpenClaw Version**: N/A (standalone skill -- no OpenClaw CLI dependencies)
- **Status**: READY
- **Blocked Commands**: None
- **Notes**: This skill uses only standard tools (git, ssh-keygen, gh CLI, GitHub API, file writes). Zero dependency on `openclaw cron`, `openclaw config set`, or any OpenClaw CLI subcommands.

## Purpose

Set up a production-grade GitHub CI/CD pipeline with AI-powered code review for a VC firm's development projects. This gives the client automated linting, type-checking, testing, security scanning, and five-pass Claude code review on every pull request -- with branch protection enforcing the workflow so nothing bypasses it.

**When to use:** When deploying development infrastructure for Crusoe Ventures projects. Run once per repository to establish the CI/CD pipeline, branch protection, and AI review workflow.

**What this skill does:**
1. Configures Git identity and SSH access on the Mac Mini
2. Clones target repositories and establishes branch structure (main + develop)
3. Enables branch protection rules via GitHub API
4. Creates CI workflow (lint, typecheck, test, build) on cloud-hosted runners
5. Creates security workflow (Semgrep SAST, npm audit, TruffleHog secret scanning)
6. Creates AI code review workflow (5-pass Claude review via anthropics/claude-code-action)
7. Configures deployment (Vercel preview/production, optional Railway backend)
8. Sets up GitHub secrets and environments with production approval gates

## How Commands Are Sent

This skill is executed by an operator who has an active remote session.
See `_deploy-common.md` -> "Command Delivery" for the full protocol.

- **Remote:** commands sent via `POST /api/sessions/${SESSION_ID}/commands` or `POST /api/devices/${DEVICE_ID}/exec`
- **Operator:** commands run on the operator's local terminal

## Variables

Resolve these before executing. Sources are listed for each.

| Variable | Source | Example |
|----------|--------|---------|
| `${WORKSPACE}` | Client profile: workspace path | `/Users/edge/.openclaw/workspace/` |
| `${SESSION_ID}` | Session polling: `GET /api/sessions/waiting` response | `sess_abc123` |
| `${DEVICE_ID}` | Device enrollment (preferred over session for enrolled devices) | `dev_xyz789` |
| `${BEARER}` | Operator login: `POST /api/operator/login` response `accessToken` | `eyJhbG...` |
| `${GITHUB_ORG}` | Client profile: GitHub org or username | `crusoe-ventures` |
| `${GITHUB_REPO}` | Client profile: repository name (repeat skill per repo if multiple) | `portfolio-dashboard` |
| `${DEV_EMAIL}` | Client profile: dev email for git/GitHub | `dev@crusoeventures.com` |
| `${GITHUB_PAT}` | Client or operator: GitHub Personal Access Token with `repo`, `admin:org`, `workflow` scopes | `ghp_xxxx...` |
| `${ANTHROPIC_API_KEY}` | Client profile: Anthropic API key for Claude code review action | `sk-ant-api03-...` |
| `${VERCEL_TOKEN}` | Client profile: Vercel deployment token | `vcel_xxxx...` |
| `${VERCEL_ORG_ID}` | Vercel dashboard: Settings -> General -> Vercel ID | `team_xxxx...` |
| `${VERCEL_PROJECT_ID}` | Vercel dashboard: Project Settings -> General -> Project ID | `prj_xxxx...` |
| `${RAILWAY_TOKEN}` | Client profile: Railway API token (optional, only if backend services exist) | `rlwy_xxxx...` |
| `${AGENT_USER}` | `whoami` on client machine | `edge` |
| `${CLOUDFLARE_ZONE_ID}` | Cloudflare dashboard: zone ID for the domain (optional) | `abc123...` |
| `${CLOUDFLARE_API_TOKEN}` | Cloudflare dashboard: API token with DNS edit permissions (optional) | `cf_xxxx...` |
| `${CUSTOM_DOMAIN}` | Client profile: custom domain for the project (optional) | `app.crusoeventures.com` |

## Before You Start

Follow the **Standard Deployment Protocol** in `_deploy-common.md`: read the client profile, check what exists, identify adaptations, and present a deployment plan before executing.

**Pre-flight checks for this skill:**

Check if Git is installed:

**Remote:**
```
git --version
```

Check if gh CLI is installed:

**Remote:**
```
gh --version 2>/dev/null || echo 'GH_NOT_INSTALLED'
```

Check if SSH key already exists for the dev email:

**Remote:**
```
ls ~/.ssh/id_ed25519.pub 2>/dev/null && cat ~/.ssh/id_ed25519.pub || echo 'NO_SSH_KEY'
```

Check if the repository is already cloned:

**Remote:**
```
test -d ${WORKSPACE}/${GITHUB_REPO} && echo 'REPO_EXISTS' || echo 'NOT_CLONED'
```

Check if GitHub CLI is authenticated:

**Remote:**
```
gh auth status 2>&1 || echo 'NOT_AUTHENTICATED'
```

Check if branch protection already exists:

**Operator:**
```
curl -sS -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/branches/main/protection" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('PROTECTED' if 'url' in d else 'UNPROTECTED')" 2>/dev/null || echo 'UNPROTECTED'
```

Check if CI workflows already exist:

**Remote:**
```
ls ${WORKSPACE}/${GITHUB_REPO}/.github/workflows/ci.yml 2>/dev/null && echo 'CI_EXISTS' || echo 'NO_CI'
```

**Decision points from pre-flight:**
- Is gh CLI installed? If not, install it before proceeding (Step 1.1).
- Does an SSH key already exist? If so, verify it is added to GitHub before generating a new one.
- Is the repo already cloned? If so, verify the remote URL matches expectations.
- Are branch protection rules already in place? If so, compare them against the desired config -- update only if different.
- Do workflow files already exist? If so, inspect them before overwriting.

## Adaptation Points

| Component | Default | Customize When... |
|-----------|---------|-------------------|
| CI runner | `ubuntu-latest` (GitHub-hosted) | Client requires specific runner labels or self-hosted runners |
| Node.js version | 20 | Project uses a different Node version |
| Package manager | `npm ci` | Project uses yarn (`yarn install --frozen-lockfile`) or pnpm (`pnpm install --frozen-lockfile`) |
| Branch names | `main` (production) + `develop` (staging) | Client uses different naming (e.g., `master`, `staging`) |
| Claude review model | Default model from claude-code-action | Client wants a specific model override |
| Deployment platform | Vercel (frontend) + Railway (backend, optional) | Client uses Netlify, Cloudflare Pages, or other platforms |
| Security scan tools | Semgrep + npm audit + TruffleHog | Client wants additional tools (e.g., Snyk, CodeQL) |
| AI review passes | 5 passes (security, performance, quality, architecture, tests) | Client wants fewer passes for speed, or additional passes |
| SSH key type | Ed25519 | Client requires RSA for compatibility with older systems |
| DNS provider | Cloudflare | Client uses Route53, Namecheap, or another DNS provider |

## Prerequisites

- Mac Mini M4 Pro accessible via remote session (enrolled device preferred)
- GitHub account with admin access to target repositories
- GitHub Personal Access Token with scopes: `repo`, `admin:org`, `workflow`
- Anthropic API key (`sk-ant-api03-...`) for Claude code review action
- Vercel account and project configured (for frontend deployment)
- Railway account (optional, only if backend services exist)
- Cloudflare account (optional, only for custom domain DNS)

## What Gets Installed

### Git Configuration
- Global git identity: `${DEV_EMAIL}` with appropriate user name
- Ed25519 SSH key generated and added to GitHub

### Branch Structure
- `main` branch: production, protected
- `develop` branch: staging, lighter protection

### GitHub Branch Protection Rules

**main:**
| Rule | Setting |
|------|---------|
| Require PRs before merging | Yes |
| Required approvals | 1 |
| Dismiss stale reviews on new pushes | Yes |
| Require status checks to pass | Yes (ci, security) |
| Prevent force pushes | Yes |
| Prevent branch deletion | Yes |

**develop:**
| Rule | Setting |
|------|---------|
| Require PRs before merging | Yes |
| Required approvals | 0 |
| Require status checks to pass | Yes (ci) |
| Prevent force pushes | Yes |

### Workflow Files

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | Lint, typecheck, test, build on every PR |
| `.github/workflows/security.yml` | Semgrep SAST, npm audit, TruffleHog secret scan |
| `.github/workflows/claude-review.yml` | 5-pass AI code review on every PR |

### GitHub Secrets

| Secret | Purpose |
|--------|---------|
| `ANTHROPIC_API_KEY` | Claude code review action |
| `VERCEL_TOKEN` | Vercel deployment |
| `VERCEL_ORG_ID` | Vercel org identification |
| `VERCEL_PROJECT_ID` | Vercel project identification |
| `RAILWAY_API_TOKEN` | Railway deployment (optional) |

### GitHub Environments

| Environment | Settings |
|-------------|----------|
| `staging` | Auto-deploy from develop |
| `production` | Requires manual approval before deploy |

## Steps

### Phase 1: Repository Setup

#### 1.1 Install Prerequisites `[GUIDED]`

Ensure git and gh CLI are available on the Mac Mini. The gh CLI is needed for authentication and secret management.

**Remote:**
```
git --version
```

Expected: Git version string (e.g., `git version 2.44.0`).

If git is not found, install Xcode Command Line Tools:

**Remote:**
```
xcode-select --install
```

Note: On a fresh Mac, this may trigger a GUI dialog the client must click "Install" on their screen. See `_deploy-common.md` -> "Platform Gotchas: macOS."

Check for gh CLI:

**Remote:**
```
gh --version 2>/dev/null || echo 'GH_NOT_INSTALLED'
```

If gh CLI is not installed:

**Remote:**
```
brew install gh
```

Note: If Homebrew is not installed, install it first. On macOS, `brew` is the standard approach. For Linux machines, use `conda install gh` or download from `https://cli.github.com/`.

#### 1.2 Configure Git Identity `[AUTO]`

Set the git user identity globally on the Mac Mini. All commits from this machine will use this identity.

**Remote:**
```
git config --global user.email "${DEV_EMAIL}" && git config --global user.name "Edge (Crusoe Ventures Dev)"
```

Expected: No output (silent success). Verify:

**Remote:**
```
git config --global user.email && git config --global user.name
```

Expected: Prints `dev@crusoeventures.com` and `Edge (Crusoe Ventures Dev)`.

If already exists: Compare the existing values. If they match, skip. If different, confirm with the operator before overwriting -- the machine may be used for multiple identities.

#### 1.3 Generate SSH Key `[GUIDED]`

Generate an Ed25519 SSH key for GitHub authentication. This key will be used for all git operations from the Mac Mini.

Check if a key already exists:

**Remote:**
```
test -f ~/.ssh/id_ed25519 && echo 'KEY_EXISTS' || echo 'NO_KEY'
```

If `KEY_EXISTS`: Read the public key and check if it is already added to GitHub. Do not generate a new key unless the existing one is not in GitHub.

**Remote:**
```
cat ~/.ssh/id_ed25519.pub
```

If `NO_KEY`: Generate a new key:

**Remote:**
```
ssh-keygen -t ed25519 -C "${DEV_EMAIL}" -f ~/.ssh/id_ed25519 -N ""
```

Expected: Key pair generated at `~/.ssh/id_ed25519` and `~/.ssh/id_ed25519.pub`.

If this fails: Check that `~/.ssh/` directory exists. Create it with `mkdir -p ~/.ssh && chmod 700 ~/.ssh`.

#### 1.4 Add SSH Key to GitHub `[GUIDED]`

Add the generated public key to GitHub so the Mac Mini can push/pull over SSH.

Read the public key:

**Remote:**
```
cat ~/.ssh/id_ed25519.pub
```

Add it to GitHub via gh CLI (preferred) or API:

**Remote:**
```
gh ssh-key add ~/.ssh/id_ed25519.pub --title "Edge Mac Mini - $(date +%Y-%m-%d)"
```

If gh CLI is not authenticated, authenticate first:

**Remote:**
```
gh auth login --with-token <<< "${GITHUB_PAT}"
```

Alternative -- add via API if gh CLI is unavailable:

**Operator:**
```
PUB_KEY=$(cat ~/.ssh/id_ed25519.pub)
curl -sS -X POST "https://api.github.com/user/keys" \
  -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  -d "{\"title\": \"Edge Mac Mini - $(date +%Y-%m-%d)\", \"key\": \"${PUB_KEY}\"}"
```

Verify SSH access:

**Remote:**
```
ssh -T git@github.com 2>&1 || true
```

Expected: Output contains "successfully authenticated as [username]".

If this fails: Check `~/.ssh/config` for conflicting Host entries. Ensure the ssh-agent has the key loaded: `eval "$(ssh-agent -s)" && ssh-add ~/.ssh/id_ed25519`.

If already exists: If `gh ssh-key add` reports the key already exists, that is fine -- skip this step.

#### 1.5 Clone Repository `[AUTO]`

Clone the target repository into the workspace directory.

**Remote:**
```
test -d ${WORKSPACE}/${GITHUB_REPO} && echo 'ALREADY_CLONED' || git clone git@github.com:${GITHUB_ORG}/${GITHUB_REPO}.git ${WORKSPACE}/${GITHUB_REPO}
```

Expected: Repository cloned to `${WORKSPACE}/${GITHUB_REPO}`, or already exists.

If this fails: Verify SSH access (Step 1.4). If the repo does not exist on GitHub yet, the operator must create it first.

If already exists: Verify the remote URL matches:

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && git remote get-url origin
```

Expected: `git@github.com:${GITHUB_ORG}/${GITHUB_REPO}.git`. If different, update with `git remote set-url origin git@github.com:${GITHUB_ORG}/${GITHUB_REPO}.git`.

#### 1.6 Set Up Branch Structure `[GUIDED]`

Establish the two-branch strategy: `main` for production deployments, `develop` for staging and integration.

Ensure main branch exists (it should be the default):

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && git branch -a | grep -E '(main|master)' || echo 'NO_MAIN_BRANCH'
```

Create develop branch if it does not exist:

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && git fetch origin && git checkout -b develop origin/develop 2>/dev/null || git checkout -b develop && git push -u origin develop
```

Expected: `develop` branch exists locally and on the remote.

If this fails: If `develop` already exists on the remote, the first part of the command succeeds. If the push fails, check push permissions.

If already exists: If develop branch already exists locally and remotely, skip.

### Phase 2: Branch Protection

#### 2.1 Protect Main Branch `[GUIDED]`

Enable strict branch protection on `main` to enforce the PR-based workflow. This is critical -- without protection, anyone can push directly to production.

**Operator:**
```
curl -sS -X PUT \
  "https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/branches/main/protection" \
  -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  -d '{
    "required_status_checks": {
      "strict": true,
      "contexts": ["ci", "security"]
    },
    "enforce_admins": false,
    "required_pull_request_reviews": {
      "required_approving_review_count": 1,
      "dismiss_stale_reviews": true,
      "require_code_owner_reviews": false
    },
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false
  }'
```

Expected: JSON response with `"url"` field containing the protection URL. This confirms the rules are active.

If this fails:
- **404 Not Found**: The branch does not exist on the remote, or the PAT lacks `repo` scope.
- **403 Forbidden**: The PAT does not have admin access to the repository.
- **422 Unprocessable**: The status check contexts may not exist yet (this is expected before the first CI run -- the checks will be recognized after the first workflow execution).

If already exists: Compare the existing protection rules against the desired config. Update only if they differ. To read existing rules:

**Operator:**
```
curl -sS -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/branches/main/protection"
```

#### 2.2 Protect Develop Branch `[GUIDED]`

Enable lighter branch protection on `develop`. This requires PRs and status checks but does not require approvals -- faster iteration for the development workflow.

**Operator:**
```
curl -sS -X PUT \
  "https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/branches/develop/protection" \
  -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  -d '{
    "required_status_checks": {
      "strict": false,
      "contexts": ["ci"]
    },
    "enforce_admins": false,
    "required_pull_request_reviews": null,
    "restrictions": null,
    "allow_force_pushes": false,
    "allow_deletions": false
  }'
```

Expected: JSON response with `"url"` field. Develop branch is now protected against force pushes and requires CI to pass.

If this fails: Same causes as Step 2.1. Additionally, ensure the `develop` branch was pushed in Step 1.6.

### Phase 3: CI Workflow

#### 3.1 Create CI Workflow File `[GUIDED]`

Create the CI workflow that runs lint, type-check, test, and build jobs in parallel on every pull request. This uses GitHub-hosted `ubuntu-latest` runners -- no self-hosted infrastructure required.

Create the workflow directory:

**Remote:**
```
mkdir -p ${WORKSPACE}/${GITHUB_REPO}/.github/workflows
```

Write the CI workflow. **Level 1 -- exact syntax required** (YAML structure is critical for GitHub Actions):

**Remote:**
```
cat > ${WORKSPACE}/${GITHUB_REPO}/.github/workflows/ci.yml << 'WORKFLOW_EOF'
name: CI

on:
  pull_request:
    branches: [main, develop]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    name: Lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint

  typecheck:
    name: Type Check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck

  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm test

  build:
    name: Build
    runs-on: ubuntu-latest
    needs: [lint, typecheck, test]
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
WORKFLOW_EOF
```

Expected: File exists at `${WORKSPACE}/${GITHUB_REPO}/.github/workflows/ci.yml`.

Verify:

**Remote:**
```
test -f ${WORKSPACE}/${GITHUB_REPO}/.github/workflows/ci.yml && echo 'CI_CREATED' || echo 'CI_MISSING'
```

If this fails: Check that the `.github/workflows/` directory was created. Verify the heredoc completed cleanly (look for stray quotes or encoding issues).

If already exists: Compare content. If unchanged, skip. If different, back up as `ci.yml.bak` and write the new version.

**Adaptation notes:**
- If the project uses yarn, replace `npm ci` with `yarn install --frozen-lockfile` and `cache: npm` with `cache: yarn`.
- If the project uses pnpm, replace `npm ci` with `pnpm install --frozen-lockfile` and `cache: npm` with `cache: pnpm`.
- If `npm run typecheck` does not exist in `package.json`, remove the typecheck job or replace with the relevant command.
- The `build` job depends on lint, typecheck, and test (`needs: [lint, typecheck, test]`). Lint, typecheck, and test run in parallel.

### Phase 4: Security Workflow

#### 4.1 Create Security Workflow File `[GUIDED]`

Create the security scanning workflow. This runs three complementary tools:
- **Semgrep**: Static Application Security Testing (SAST) -- finds code-level vulnerabilities
- **npm audit**: Checks for known vulnerabilities in dependencies
- **TruffleHog**: Scans for accidentally committed secrets (API keys, tokens, passwords)

All third-party actions are **pinned to full commit SHAs** to prevent supply chain attacks. The tj-actions (2025) and aquasecurity/trivy-action (2025-2026) compromises demonstrated this is not theoretical.

**Level 1 -- exact syntax required:**

**Remote:**
```
cat > ${WORKSPACE}/${GITHUB_REPO}/.github/workflows/security.yml << 'WORKFLOW_EOF'
name: Security

on:
  pull_request:
    branches: [main, develop]
  schedule:
    - cron: '0 6 * * 1'  # Weekly Monday 6am UTC

permissions:
  contents: read
  security-events: write

concurrency:
  group: security-${{ github.ref }}
  cancel-in-progress: true

jobs:
  semgrep:
    name: Semgrep SAST
    runs-on: ubuntu-latest
    container:
      image: semgrep/semgrep:latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - name: Run Semgrep
        run: semgrep scan --config auto --sarif --output semgrep-results.sarif .
      - name: Upload SARIF
        if: always()
        uses: github/codeql-action/upload-sarif@ce28f5bb42b7a9f2c824e633a3f6ee835bab0761 # v3.28.0
        with:
          sarif_file: semgrep-results.sarif

  npm-audit:
    name: Dependency Audit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - name: Audit dependencies
        run: npm audit --audit-level=high

  secret-scan:
    name: Secret Scanning
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
        with:
          fetch-depth: 0
      - name: TruffleHog Secret Scan
        uses: trufflesecurity/trufflehog@a]]]cd75d97a8b4ef3f891d9a01a62e1e5e4bae0b2e # v3.88.2
        with:
          extra_args: --results=verified,unverified
WORKFLOW_EOF
```

Expected: File exists at `${WORKSPACE}/${GITHUB_REPO}/.github/workflows/security.yml`.

Verify:

**Remote:**
```
test -f ${WORKSPACE}/${GITHUB_REPO}/.github/workflows/security.yml && echo 'SECURITY_CREATED' || echo 'SECURITY_MISSING'
```

If this fails: Same troubleshooting as Step 3.1.

If already exists: Compare content, back up if different before overwriting.

**CRITICAL -- SHA pinning:**
The commit SHAs above are reference values. Before deploying, the operator MUST verify each SHA is current by checking:
- `actions/checkout`: https://github.com/actions/checkout/releases
- `actions/setup-node`: https://github.com/actions/setup-node/releases
- `github/codeql-action`: https://github.com/github/codeql-action/releases
- `trufflesecurity/trufflehog`: https://github.com/trufflesecurity/trufflehog/releases

To get the commit SHA for a release tag:

**Operator:**
```
git ls-remote --tags https://github.com/actions/checkout.git | grep 'refs/tags/v4' | tail -1
```

Replace the SHAs if newer verified versions are available. Never use version tags (e.g., `@v4`) -- they are mutable and can be hijacked.

### Phase 5: AI Code Review

#### 5.1 Create Claude Review Workflow `[GUIDED]`

Create the AI code review workflow that runs five structured review passes on every pull request. Each pass focuses on a different dimension: security, performance, code quality, architecture, and test coverage.

This uses `anthropics/claude-code-action` which runs Claude to analyze the PR diff and post review comments.

**Level 1 -- exact syntax required:**

**Remote:**
```
cat > ${WORKSPACE}/${GITHUB_REPO}/.github/workflows/claude-review.yml << 'WORKFLOW_EOF'
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize]

permissions:
  contents: read
  pull-requests: write
  issues: write

concurrency:
  group: claude-review-${{ github.ref }}
  cancel-in-progress: true

jobs:
  security-review:
    name: "Claude Review: Security"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: anthropics/claude-code-action@4c7e7d12e16cbe84da2a1e12c86cd8e7e91a1193 # v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          direct_prompt: |
            You are a security-focused code reviewer. Review this pull request for:

            1. OWASP Top 10 vulnerabilities (injection, broken auth, XSS, CSRF, etc.)
            2. Authentication and authorization issues
            3. Input validation gaps
            4. Sensitive data exposure (hardcoded secrets, PII in logs)
            5. Insecure dependencies or import patterns
            6. Server-Side Request Forgery (SSRF)
            7. Insecure deserialization

            For each finding:
            - Rate severity: CRITICAL / HIGH / MEDIUM / LOW
            - Quote the specific code
            - Explain the attack vector
            - Provide a concrete fix

            If no security issues found, confirm the PR is clean with a brief summary of what you checked.

            Format your response as a clear, structured review comment.
          timeout_minutes: 10

  performance-review:
    name: "Claude Review: Performance"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: anthropics/claude-code-action@4c7e7d12e16cbe84da2a1e12c86cd8e7e91a1193 # v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          direct_prompt: |
            You are a performance-focused code reviewer. Review this pull request for:

            1. N+1 query patterns (database queries in loops)
            2. Memory leaks (unclosed connections, missing cleanup, event listener accumulation)
            3. Bundle size impact (unnecessary imports, tree-shaking blockers)
            4. Unnecessary re-renders (React) or recomputation
            5. Missing pagination or unbounded data fetches
            6. Blocking operations on the main thread
            7. Missing caching opportunities
            8. Inefficient algorithms (O(n^2) where O(n) is possible)

            For each finding:
            - Rate impact: HIGH / MEDIUM / LOW
            - Quote the specific code
            - Explain the performance impact with estimated magnitude
            - Provide an optimized alternative

            If no issues found, confirm the PR is performant with a brief summary.
          timeout_minutes: 10

  quality-review:
    name: "Claude Review: Code Quality"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: anthropics/claude-code-action@4c7e7d12e16cbe84da2a1e12c86cd8e7e91a1193 # v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          direct_prompt: |
            You are a code quality reviewer. Review this pull request for:

            1. DRY violations (duplicated logic that should be extracted)
            2. Naming clarity (variables, functions, types -- are they self-documenting?)
            3. Error handling (missing try/catch, swallowed errors, unhelpful error messages)
            4. Code complexity (functions over 30 lines, deeply nested conditionals)
            5. Type safety (missing types, `any` usage in TypeScript, implicit type coercion)
            6. Dead code or unused imports
            7. Missing or misleading comments
            8. Consistent patterns with the rest of the codebase

            For each finding:
            - Rate importance: HIGH / MEDIUM / LOW
            - Quote the specific code
            - Explain why it matters for maintainability
            - Provide a refactored alternative

            If code quality is solid, confirm with specific praise for well-written patterns.
          timeout_minutes: 10

  architecture-review:
    name: "Claude Review: Architecture"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: anthropics/claude-code-action@4c7e7d12e16cbe84da2a1e12c86cd8e7e91a1193 # v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          direct_prompt: |
            You are an architecture-focused code reviewer. Review this pull request for:

            1. Design pattern adherence (is the code consistent with the project's architecture?)
            2. Breaking changes (API contract changes, database schema changes, config format changes)
            3. Separation of concerns (business logic mixed with UI, data access scattered across layers)
            4. Scalability concerns (will this work with 10x/100x the current load?)
            5. Dependency direction (are dependencies pointing the right way?)
            6. API design quality (RESTful conventions, consistent response shapes, versioning)
            7. Migration safety (database migrations reversible? backward compatible?)

            For each finding:
            - Rate severity: CRITICAL / HIGH / MEDIUM / LOW
            - Explain the architectural concern
            - Describe the long-term impact if not addressed
            - Suggest an architectural alternative

            If architecture is sound, confirm with notes on good design decisions.
          timeout_minutes: 10

  test-coverage-review:
    name: "Claude Review: Test Coverage"
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683 # v4.2.2
      - uses: anthropics/claude-code-action@4c7e7d12e16cbe84da2a1e12c86cd8e7e91a1193 # v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          direct_prompt: |
            You are a test coverage reviewer. Review this pull request for:

            1. Missing unit tests for new functions/methods
            2. Missing integration tests for new API endpoints or data flows
            3. Edge cases not covered (null/undefined inputs, empty arrays, boundary values)
            4. Error path testing (what happens when dependencies fail?)
            5. Test quality (are tests actually asserting meaningful behavior, or just running code?)
            6. Flaky test patterns (timing dependencies, order dependencies, shared state)
            7. Missing mock/stub for external dependencies

            For each finding:
            - List the specific function/component missing tests
            - Describe which test cases should be added
            - Provide a skeleton test implementation

            If test coverage is adequate, confirm with a summary of what is well-tested.
          timeout_minutes: 10
WORKFLOW_EOF
```

Expected: File exists at `${WORKSPACE}/${GITHUB_REPO}/.github/workflows/claude-review.yml`.

Verify:

**Remote:**
```
test -f ${WORKSPACE}/${GITHUB_REPO}/.github/workflows/claude-review.yml && echo 'REVIEW_CREATED' || echo 'REVIEW_MISSING'
```

If this fails: Same troubleshooting as Step 3.1.

If already exists: Compare content, back up if different before overwriting.

**CRITICAL -- SHA pinning:**
The `anthropics/claude-code-action` SHA above is a reference value. Before deploying, verify the latest release SHA:

**Operator:**
```
git ls-remote --tags https://github.com/anthropics/claude-code-action.git | grep 'refs/tags/v1' | tail -1
```

Update the SHA if a newer version is available. The SHA must match an official release tag from Anthropic.

**Adaptation notes:**
- All five review jobs run in parallel. Each uses a separate API call to Claude.
- If API costs are a concern, reduce to three passes (security, quality, test-coverage) by removing the performance-review and architecture-review jobs.
- The `timeout_minutes: 10` prevents runaway reviews on very large PRs. Increase if the project has large PRs.
- The `concurrency` group cancels in-progress reviews when new commits are pushed, avoiding stale reviews.

### Phase 6: Deployment Configuration

#### 6.1 Configure Vercel Auto-Deploy `[GUIDED]`

Vercel auto-deploys are configured through the Vercel-GitHub integration, not through workflow files. This step verifies the integration is connected and configures the deploy behavior.

Check if Vercel is already connected to the repo:

**Operator:**
```
curl -sS -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}" \
  | python3 -c "
import sys, json
p = json.load(sys.stdin)
print('Project:', p.get('name', 'unknown'))
print('Git repo:', p.get('link', {}).get('repo', 'NOT_CONNECTED'))
print('Production branch:', p.get('link', {}).get('productionBranch', 'NOT_SET'))
"
```

Expected: Project name, connected git repo, and production branch (`main`) are shown.

If the repo is not connected, the operator must connect it through the Vercel dashboard or API:

**Operator:**
```
curl -sS -X PATCH "https://api.vercel.com/v9/projects/${VERCEL_PROJECT_ID}" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "gitRepository": {
      "repo": "${GITHUB_ORG}/${GITHUB_REPO}",
      "type": "github"
    },
    "productionBranch": "main"
  }'
```

Vercel auto-deploy behavior once connected:
- **PRs to main or develop**: Vercel creates preview deployments automatically
- **Merge to main**: Vercel triggers production deployment automatically
- **Merge to develop**: Vercel creates a preview deployment (staging)

No workflow file is needed -- Vercel's GitHub App handles this. The preview URL is posted as a PR comment automatically.

If this fails: The Vercel-GitHub integration may not be installed. The operator should install it from https://vercel.com/integrations/github and connect the repository.

#### 6.2 Configure Railway Backend (Optional) `[GUIDED]`

This step is only needed if the project has backend services deployed on Railway. Skip if the project is frontend-only.

Check if Railway is applicable:

**Operator:**
```
test -n "${RAILWAY_TOKEN}" && echo 'RAILWAY_CONFIGURED' || echo 'RAILWAY_NOT_NEEDED'
```

If Railway is configured, verify the project exists:

**Operator:**
```
curl -sS -X POST "https://backboard.railway.com/graphql/v2" \
  -H "Authorization: Bearer ${RAILWAY_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ me { projects { edges { node { id name } } } } }"}'
```

Railway auto-deploys from the connected GitHub branch. Configure via the Railway dashboard:
- Connect the repository to the Railway project
- Set `main` branch as the production deployment trigger
- Set `develop` branch for staging environment (if applicable)

No workflow file is needed -- Railway's GitHub integration handles deployments.

#### 6.3 Configure Cloudflare DNS (Optional) `[GUIDED]`

This step is only needed if the project uses a custom domain managed by Cloudflare. Skip if using default Vercel/Railway domains.

Check if Cloudflare is applicable:

**Operator:**
```
test -n "${CLOUDFLARE_ZONE_ID}" && echo 'CLOUDFLARE_CONFIGURED' || echo 'CLOUDFLARE_NOT_NEEDED'
```

If a custom domain is needed, add the CNAME record pointing to Vercel:

**Operator:**
```
curl -sS -X POST "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CNAME",
    "name": "${CUSTOM_DOMAIN}",
    "content": "cname.vercel-dns.com",
    "proxied": true,
    "ttl": 1
  }'
```

Expected: JSON response with the created DNS record.

Then add the custom domain to the Vercel project:

**Operator:**
```
curl -sS -X POST "https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/domains" \
  -H "Authorization: Bearer ${VERCEL_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name": "${CUSTOM_DOMAIN}"}'
```

Expected: Domain added and verification initiated. Vercel will auto-provision SSL.

If this fails: Check that the Cloudflare API token has DNS edit permissions for the zone. Verify the zone ID is correct.

### Phase 7: Secrets and Environments

#### 7.1 Set Up GitHub Repository Secrets `[HUMAN_INPUT]`

Configure the secrets that workflows need. These are stored encrypted in GitHub and injected into workflow runs as environment variables.

**CRITICAL: Never store secrets in workflow files, commit messages, or PR descriptions.**

The operator needs these values from the client before proceeding:
- `ANTHROPIC_API_KEY` -- must start with `sk-ant-api03-`
- `VERCEL_TOKEN` -- from Vercel dashboard
- `VERCEL_ORG_ID` -- from Vercel dashboard
- `VERCEL_PROJECT_ID` -- from Vercel dashboard
- `RAILWAY_API_TOKEN` -- from Railway dashboard (optional)

Set secrets using gh CLI (preferred -- avoids secrets in shell history):

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && gh secret set ANTHROPIC_API_KEY --body "${ANTHROPIC_API_KEY}"
```

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && gh secret set VERCEL_TOKEN --body "${VERCEL_TOKEN}"
```

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && gh secret set VERCEL_ORG_ID --body "${VERCEL_ORG_ID}"
```

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && gh secret set VERCEL_PROJECT_ID --body "${VERCEL_PROJECT_ID}"
```

If Railway is used:

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && gh secret set RAILWAY_API_TOKEN --body "${RAILWAY_TOKEN}"
```

Alternative -- set secrets via API if gh CLI is unavailable. This requires encrypting the secret value with the repository's public key (libsodium). It is significantly more complex; prefer gh CLI.

Verify secrets are set (gh CLI shows names, not values):

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && gh secret list
```

Expected: All configured secrets appear in the list.

If this fails: Verify gh CLI is authenticated with a token that has `repo` scope. Run `gh auth status` to check.

#### 7.2 Create GitHub Environments `[GUIDED]`

Create `staging` and `production` environments. The production environment requires manual approval before deployments execute -- this is the final gate preventing accidental production deploys.

Create staging environment:

**Operator:**
```
curl -sS -X PUT \
  "https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/environments/staging" \
  -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  -d '{}'
```

Expected: JSON response with the environment details.

Create production environment with protection rules:

**Operator:**
```
curl -sS -X PUT \
  "https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/environments/production" \
  -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  -d '{
    "deployment_branch_policy": {
      "protected_branches": true,
      "custom_branch_policies": false
    }
  }'
```

Expected: JSON response with the production environment details, restricted to protected branches only.

Add required reviewers to production (the person who must approve production deploys):

**Operator:**
```
curl -sS -X PUT \
  "https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/environments/production" \
  -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  -d '{
    "reviewers": [
      {
        "type": "User",
        "id": REVIEWER_USER_ID
      }
    ],
    "deployment_branch_policy": {
      "protected_branches": true,
      "custom_branch_policies": false
    }
  }'
```

Note: Replace `REVIEWER_USER_ID` with the GitHub user ID of the person who should approve production deploys. To find the user ID:

**Operator:**
```
curl -sS -H "Authorization: token ${GITHUB_PAT}" \
  "https://api.github.com/users/USERNAME" \
  | python3 -c "import sys,json; print('User ID:', json.load(sys.stdin)['id'])"
```

If this fails: Environment creation requires admin access. Verify the PAT has `repo` scope and the user has admin rights on the repository.

If already exists: Environments are idempotent -- PUT requests update existing environments.

### Phase 8: Commit and Push Workflows

#### 8.1 Commit Workflow Files `[GUIDED]`

Commit all three workflow files to the repository and push to the remote. This activates the CI/CD pipeline.

Stage the workflow files:

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && git add .github/workflows/ci.yml .github/workflows/security.yml .github/workflows/claude-review.yml
```

Verify what will be committed:

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && git status
```

Expected: Three new files staged under `.github/workflows/`.

Commit:

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && git commit -m "ci: add CI/CD pipeline with security scanning and AI code review

- CI workflow: lint, typecheck, test, build (parallel, cloud-hosted runners)
- Security workflow: Semgrep SAST, npm audit, TruffleHog secret scan
- AI review: 5-pass Claude review (security, performance, quality, architecture, tests)
- All third-party actions pinned to commit SHAs for supply chain safety"
```

Push to the current branch:

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && git push origin HEAD
```

Expected: Push succeeds. The workflows are now active on the remote.

If push fails due to branch protection: Create a temporary branch and PR:

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && git checkout -b ci/add-cicd-pipeline && git push -u origin ci/add-cicd-pipeline
```

Then create a PR to merge the workflows into the target branch:

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && gh pr create --title "ci: add CI/CD pipeline with AI code review" --body "Adds CI, security scanning, and 5-pass Claude AI code review workflows. All actions pinned to commit SHAs." --base develop
```

The PR itself will trigger the first CI run -- which is a nice self-test.

## Verification

Run these checks to confirm the CI/CD pipeline is fully operational.

**Workflow files exist:**

**Remote:**
```
ls -la ${WORKSPACE}/${GITHUB_REPO}/.github/workflows/
```

Expected: `ci.yml`, `security.yml`, `claude-review.yml` all present.

**Branch protection is active on main:**

**Operator:**
```
curl -sS -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/branches/main/protection" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
pr = d.get('required_pull_request_reviews', {})
sc = d.get('required_status_checks', {})
print('PR reviews required:', pr.get('required_approving_review_count', 'NOT SET'))
print('Dismiss stale reviews:', pr.get('dismiss_stale_reviews', 'NOT SET'))
print('Status checks:', sc.get('contexts', []))
print('Force push blocked:', not d.get('allow_force_pushes', {}).get('enabled', True))
"
```

Expected: 1 approval required, stale reviews dismissed, status checks include `ci` and `security`, force push blocked.

**Branch protection is active on develop:**

**Operator:**
```
curl -sS -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/branches/develop/protection" \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
sc = d.get('required_status_checks', {})
print('Status checks:', sc.get('contexts', []))
print('Force push blocked:', not d.get('allow_force_pushes', {}).get('enabled', True))
"
```

Expected: Status checks include `ci`, force push blocked.

**GitHub secrets are configured:**

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && gh secret list
```

Expected: `ANTHROPIC_API_KEY`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` all present. `RAILWAY_API_TOKEN` present if Railway is used.

**GitHub environments exist:**

**Operator:**
```
curl -sS -H "Authorization: token ${GITHUB_PAT}" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/${GITHUB_ORG}/${GITHUB_REPO}/environments" \
  | python3 -c "
import sys, json
envs = json.load(sys.stdin).get('environments', [])
for e in envs:
    protection = 'YES' if e.get('protection_rules') else 'NO'
    print(f\"{e['name']}: protection_rules={protection}\")
"
```

Expected: `staging` and `production` environments listed. Production has protection rules.

**End-to-end test -- create a test PR:**

Create a trivial change on a feature branch to trigger all workflows:

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && git checkout develop && git checkout -b test/cicd-verification && echo "// CI/CD verification test - $(date)" >> .github/.cicd-test && git add .github/.cicd-test && git commit -m "test: verify CI/CD pipeline" && git push -u origin test/cicd-verification
```

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && gh pr create --title "test: verify CI/CD pipeline" --body "Automated test to verify CI, security, and AI review workflows are functioning. Close after verification." --base develop
```

Then watch the workflow runs:

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && gh run list --limit 5
```

Expected: CI, Security, and AI Code Review workflows all appear and are running or completed.

After verification, close and clean up the test PR:

**Remote:**
```
cd ${WORKSPACE}/${GITHUB_REPO} && gh pr close test/cicd-verification --delete-branch
```

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Workflow not triggering | Workflow files not on default branch, or YAML syntax error | Verify files are pushed. Run `gh workflow list` to see if workflows are recognized. Check YAML with a linter. |
| Branch protection 404 | Branch does not exist on remote, or PAT lacks `repo` scope | Verify branch exists: `git ls-remote --heads origin`. Check PAT permissions. |
| `gh secret set` fails | gh CLI not authenticated or PAT lacks scope | Run `gh auth status`. Re-authenticate with `gh auth login --with-token`. |
| Semgrep container fails | Docker image pull rate limit or network issue | Retry. If persistent, pin to a specific Semgrep version tag instead of `latest`. |
| Claude review timeout | Very large PR exceeds `timeout_minutes` | Increase `timeout_minutes` in the workflow. Consider splitting large PRs. |
| Claude review empty | ANTHROPIC_API_KEY not set or invalid | Verify with `gh secret list`. Ensure the key starts with `sk-ant-api03-`. |
| npm audit fails (exit code 1) | Known high-severity vulnerability in dependencies | This is working as intended -- the audit found a real issue. Fix the dependency or use `npm audit fix`. |
| TruffleHog false positives | Test fixtures or example configs contain patterns that look like secrets | Add a `.trufflehog-ignore` file to exclude false-positive paths. |
| Push rejected to protected branch | Branch protection working correctly | Create a feature branch and use a PR instead of direct push. |
| Status checks not appearing | Checks have not run yet (first time) | Status check contexts are registered after their first workflow run. Protection rules will enforce them after the first execution. |
| SSH auth failure | Key not added to GitHub or agent not running | Verify: `ssh -T git@github.com`. Load key: `ssh-add ~/.ssh/id_ed25519`. |
| Vercel not deploying | GitHub integration not installed or repo not connected | Install from https://vercel.com/integrations/github. Verify via Vercel dashboard. |

## Autonomy Mode Behavior

| Step | Auto | Guided | Manual |
|------|------|--------|--------|
| 1.1 Install Prerequisites | Execute silently | Execute silently | Confirm each install |
| 1.2 Configure Git Identity | Execute silently | Execute silently | Confirm values |
| 1.3 Generate SSH Key | Execute silently | Confirm before generating | Confirm |
| 1.4 Add SSH Key to GitHub | Execute silently | Confirm before adding | Confirm |
| 1.5 Clone Repository | Execute silently | Execute silently | Confirm |
| 1.6 Set Up Branch Structure | Execute silently | Confirm before creating develop | Confirm each command |
| 2.1 Protect Main Branch | Execute silently | Confirm protection rules | Confirm each rule |
| 2.2 Protect Develop Branch | Execute silently | Confirm protection rules | Confirm each rule |
| 3.1 Create CI Workflow | Execute silently | Confirm workflow content | Confirm |
| 4.1 Create Security Workflow | Execute silently | Confirm workflow content | Confirm |
| 5.1 Create Claude Review Workflow | Execute silently | Confirm review passes | Confirm |
| 6.1 Configure Vercel | Execute silently | Confirm connection | Confirm |
| 6.2 Configure Railway | Skip if not needed | Confirm if applicable | Confirm |
| 6.3 Configure Cloudflare DNS | Skip if not needed | Confirm if applicable | Confirm |
| 7.1 Set Up Secrets | **Always requires human input** | **Always requires human input** | **Always requires human input** |
| 7.2 Create Environments | Execute silently | Confirm environment settings | Confirm each environment |
| 8.1 Commit and Push | Execute silently | Confirm before push | Confirm each command |

## Dependencies

- **Depends on:** Mac Mini accessible via remote session, GitHub account with admin access, Vercel account (for deployment)
- **Required by:** All future development work on the repository (CI/CD enforces quality gates)
- **Enhanced by:** Additional workflow files can be added for deployment notifications, release management, or changelog generation
- **Optional integrations:** Railway (`deploy-railway-backend.md` if applicable), Cloudflare DNS, Slack/Discord notifications for workflow results
