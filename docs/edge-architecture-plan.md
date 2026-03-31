# Edge Architecture Plan: Dan Caruso's AI Executive Assistant

**Date:** 2026-03-27
**Client:** Dan Caruso, Managing Director, Crusoe Ventures (Boulder, CO)
**System Name:** Edge
**Hardware:** Mac Mini M4 Pro (12 cores, 24GB RAM, 460GB SSD)
**OpenClaw Version:** 2026.3.22
**Agent Name:** Edge (per SOUL.md)

---

## Executive Summary

This document synthesizes findings from 11 research agents analyzing the existing skills system, Dan's deployment docs, REL platform architecture, consulting transcripts, OpenClaw ecosystem, community best practices, Notion API patterns, GitHub CI/CD patterns, security edge cases, email/calendar integration, and frontline AI researcher recommendations.

**Bottom line:** 59% of existing skills are BLOCKED due to OpenClaw CLI commands that don't exist. We need to build 7 new custom skills using the **working pattern** (file-based config + platform-native scheduling + raw API calls) and fix 5 broken skills to deliver Edge.

---

## Current State of Edge (as of 2026-03-27)

### Working
- Identity/Soul configured ("Edge" personality)
- Telegram bot paired (ID 8784533237, Dan's user ID 8730867387)
- Notion API key configured (read access to People & Companies dashboards)
- Tavily Search API key configured
- LinkedIn skill deployed
- OpenClaw memory subsystem available

### Broken
- **Daily Briefing crons** -- "Context overflow: prompt too large" for 3+ runs
- **Google OAuth** -- tokens expire every 7 days (GCP app in test mode)
- **Gateway token** -- still set to "REDACTED_ROTATE_THIS"

### Not Deployed (needed)
- Security & Safety (Phases 1-4 work, Phase 5 needs platform-native cron)
- Google Workspace replacement (Himalaya for email, Service Account for Calendar)
- Personal CRM (blocked -- needs rewrite)
- Daily Briefing (blocked -- needs rewrite)
- Fathom Pipeline (blocked -- needs rewrite)
- Notion bidirectional sync (doesn't exist -- needs creation)
- GitHub CI/CD (doesn't exist -- needs creation)
- Linear integration (doesn't exist -- needs creation)
- Meeting Prep engine (doesn't exist -- needs creation)
- Action Item engine with approval flow (doesn't exist -- needs creation)

---

## The Working Pattern

All new and rewritten skills MUST use this pattern (proven working):

| Component | Approach | Why |
|-----------|----------|-----|
| **Configuration** | Files in workspace (`${WORKSPACE}/config/*.json`) | `openclaw config set` doesn't exist |
| **Scheduling** | `launchd` plists in `~/Library/LaunchAgents/` | `openclaw cron` doesn't exist; `crontab` hangs on macOS 15 |
| **API calls** | Raw `curl` or Node.js scripts | `openclaw telegram`, `openclaw slack` don't exist |
| **Credentials** | `.env` files in workspace + `auth-profiles.json` | Standard pattern that works |
| **File transfer** | Base64 encoding via device exec API | Heredocs get mangled through JSON API |
| **Service restart** | `launchctl bootout/bootstrap` | `openclaw restart` doesn't exist |

---

## Skills Inventory: What To Build

### Tier 1: Fix Broken (rewrite using working pattern)

| # | Skill | Priority | Est. Hours | Status |
|---|-------|----------|------------|--------|
| 1 | `deploy-daily-briefing-v2.md` | CRITICAL | 3h | Daily report + meeting prep |
| 2 | `deploy-personal-crm-v2.md` | CRITICAL | 4h | 20-table SQLite CRM |
| 3 | `deploy-fathom-pipeline-v2.md` | HIGH | 3h | Transcript processing |
| 4 | `deploy-urgent-email-v2.md` | HIGH | 2h | Email urgency detection |
| 5 | `deploy-security-council-v2.md` | HIGH | 3h | Nightly security review |

### Tier 2: Build New (custom for Edge/Crusoe Ventures)

| # | Skill | Priority | Est. Hours | Status |
|---|-------|----------|------------|--------|
| 6 | `deploy-notion-workspace.md` | CRITICAL | 4h | Bidirectional Notion sync |
| 7 | `deploy-meeting-prep.md` | CRITICAL | 3h | Attendee research + briefing |
| 8 | `deploy-action-items.md` | CRITICAL | 3h | Extract, approve, track in Notion |
| 9 | `deploy-transcript-pipeline.md` | HIGH | 3h | Multi-source: Gemini + Fathom + Notion |
| 10 | `deploy-github-cicd.md` | HIGH | 4h | PR reviews, branch protection, deploy |
| 11 | `deploy-linear-integration.md` | MEDIUM | 2h | Ticket sync, auto-pull for dev work |
| 12 | `deploy-himalaya-email.md` | HIGH | 2h | Permanent email via IMAP (replaces gog) |

### Tier 3: Deploy Existing (already working)

| # | Skill | Priority | Notes |
|---|-------|----------|-------|
| 13 | `deploy-memory.md` | HIGH | Enable cross-session memory with embeddings |
| 14 | `deploy-security-safety.md` | HIGH | Phases 1-4 only, use launchd for Phase 5 |
| 15 | `deploy-identity.md` | DONE | Already deployed |
| 16 | `deploy-git-autosync.md` (rewrite) | MEDIUM | Needs platform-native cron |

---

## Architecture: How Edge's Systems Connect

```
                    ┌─────────────────────────────────────────┐
                    │           DAN'S TELEGRAM                │
                    │  (Approval interface, daily reports)     │
                    └────────────────┬────────────────────────┘
                                     │
                    ┌────────────────▼────────────────────────┐
                    │              EDGE (OpenClaw)             │
                    │         Mac Mini M4 Pro 24GB             │
                    │                                          │
                    │  ┌──────────┐  ┌──────────┐  ┌────────┐│
                    │  │  SOUL.md │  │AGENTS.md │  │TOOLS.md││
                    │  └──────────┘  └──────────┘  └────────┘│
                    └────────────────┬────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
┌─────────▼─────────┐  ┌────────────▼──────────┐  ┌───────────▼──────────┐
│   DAILY ENGINE     │  │   TRANSCRIPT ENGINE   │  │    DEV ENGINE        │
│                    │  │                        │  │                      │
│ • Morning Brief    │  │ • Gemini transcripts   │  │ • GitHub CI/CD       │
│ • Meeting Prep     │  │ • Fathom transcripts   │  │ • Linear tickets     │
│ • Calendar scan    │  │ • Notion transcripts   │  │ • PR code reviews    │
│ • People research  │  │ • Action item extract  │  │ • Deploy pipelines   │
│ • Email triage     │  │ • Notion board update  │  │ • Security scans     │
│ • EOD summary      │  │ • Human approval flow  │  │ • Git autosync       │
└─────────┬─────────┘  └────────────┬──────────┘  └───────────┬──────────┘
          │                          │                          │
          └──────────────────────────┼──────────────────────────┘
                                     │
          ┌──────────────────────────┼──────────────────────────┐
          │                          │                          │
┌─────────▼─────────┐  ┌────────────▼──────────┐  ┌───────────▼──────────┐
│   DATA LAYER       │  │   INTEGRATION LAYER   │  │   SECURITY LAYER     │
│                    │  │                        │  │                      │
│ • SQLite CRM      │  │ • Notion API           │  │ • Security Council   │
│ • OpenClaw Memory  │  │ • Google Calendar      │  │ • Secret redaction   │
│ • Knowledge Base   │  │ • Himalaya (email)     │  │ • Pre-commit hooks   │
│ • Meeting history  │  │ • Telegram Bot API     │  │ • Approval gates     │
│                    │  │ • GitHub API           │  │ • Nightly drift scan │
│                    │  │ • Linear API           │  │ • Audit logging      │
└────────────────────┘  └───────────────────────┘  └──────────────────────┘
```

---

## Credential Inventory (Edge)

| Service | Account | Auth Method | Status |
|---------|---------|-------------|--------|
| Telegram | Bot 8784533237 | Bot token | Working |
| Notion | OpenClawFirstPass bot | API key (ntn_...) | Working (read) |
| Google Calendar | edge@crusoeventures.com | Service Account (planned) | Not deployed |
| Gmail | edge@crusoeventures.com | Himalaya + App Password | Not deployed |
| GitHub | dev@crusoeventures.com | PAT or SSH key | Not deployed |
| Supabase | dev@crusoeventures.com | Auth via GitHub | Available |
| Vercel | dev@crusoeventures.com | Magic link | Available |
| Railway | dev@crusoeventures.com | Auth token | Not deployed |
| Cloudflare | dev@crusoeventures.com | API key | Not deployed |
| Linear | TBD | API key | Not configured |
| Anthropic | API key | sk-ant-api03-... | Working |
| Tavily | API key | Configured | Working |

---

## Review 1: Technical Feasibility

| Capability | Feasible? | Approach | Risk |
|------------|-----------|----------|------|
| Daily briefing at 7am | YES | launchd plist + Node.js script | Context overflow (fix: use standalone script, not OpenClaw session) |
| Meeting prep with people research | YES | Calendar API + Notion API + Tavily search | Rate limits on Notion (3 req/s) |
| Notion People & Companies sync | YES | Notion API with workspace-level bot | Write access needs testing |
| Multi-source transcript processing | YES | Fathom API + Gemini API + Notion API | Gemini transcript format may vary |
| Action items with approval flow | YES | Telegram inline keyboards + Notion tasks | Webhook vs polling for Telegram |
| Email via Himalaya | YES | IMAP/SMTP with app password | Permanent (no OAuth expiry) |
| Calendar via Service Account | YES | Google Service Account shared to edge@ | No domain-wide delegation needed |
| GitHub CI/CD | YES | claude-code-action@v1 + branch protection | Pin actions to SHA (supply chain risk) |
| Linear integration | YES | Linear API (GraphQL) | Simple REST-like queries |
| Security Council | YES | Standalone scripts + launchd + Telegram alerts | Must NOT use OpenClaw session (context overflow) |

**Key technical decision:** All nightly/scheduled tasks must run as **standalone Node.js scripts** invoked by launchd, NOT as OpenClaw conversations. The context overflow bug proves that long-running OpenClaw sessions accumulate too much context. Scripts should be self-contained with their own Anthropic API calls.

---

## Review 2: Functional Completeness

| Dan's Need | Covered By | Gap? |
|------------|-----------|------|
| "What's on my calendar today?" | deploy-daily-briefing-v2 | None |
| "Who am I meeting with and what should I know?" | deploy-meeting-prep | None |
| "Triage my email" | deploy-himalaya-email + deploy-urgent-email-v2 | None |
| "Draft a reply to this email" | Himalaya + OpenClaw conversation | None |
| "What happened in that meeting?" | deploy-transcript-pipeline | None |
| "Create action items from the meeting" | deploy-action-items | None |
| "Update the People database" | deploy-notion-workspace | None |
| "Review this PR before I merge" | deploy-github-cicd | None |
| "What tickets need work?" | deploy-linear-integration | None |
| "Is our code secure?" | deploy-security-council-v2 | None |
| "Approve these tasks" (human-in-loop) | Telegram approval flow in deploy-action-items | None |
| Portfolio monitoring | Phase 2 (not in initial scope) | Deferred |
| Investment inbox automation | Phase 2 | Deferred |

---

## Review 3: Integration Architecture

### Data Flow: Meeting → Action Items → Notion

```
Google Meet (Gemini transcript)
    ↓ [Gemini API or Notion page scrape]
Transcript Pipeline
    ↓ [Claude API: extract attendees, topics, decisions, action items]
Action Item Engine
    ↓ [Match attendees to Notion People DB]
    ↓ [Create draft tasks in Notion]
    ↓ [Send approval request to Dan via Telegram]
Dan approves/rejects via Telegram
    ↓ [Update Notion task status]
    ↓ [Optionally create Linear ticket for dev work]
Done
```

### Data Flow: Daily Briefing

```
7:00 AM launchd trigger
    ↓
Gather: Calendar events (next 24h)
    ↓
Gather: Unread emails (Himalaya IMAP)
    ↓
Gather: Pending action items (Notion)
    ↓
Research: Meeting attendees (Notion People DB + Tavily web search)
    ↓
Synthesize: Claude API generates briefing
    ↓
Deliver: Telegram message to Dan
    ↓
Optional: HTML email to Dan via Himalaya SMTP
```

### Data Flow: PR Code Review

```
Developer pushes to branch → Creates PR
    ↓
GitHub Actions triggers:
    ├── ci.yml (lint + typecheck + test + build)
    ├── security.yml (Semgrep SAST + npm audit)
    └── claude-review.yml (5-pass AI review)
        ├── Pass 1: Security (OWASP Top 10)
        ├── Pass 2: Performance
        ├── Pass 3: Code Quality
        ├── Pass 4: Architecture
        └── Pass 5: Test Coverage
    ↓
All checks pass → Ready for human approval
    ↓
Merge to main → Auto-deploy to production (Vercel/Railway)
```

---

## Review 4: Security Assessment

### Critical Security Requirements

| Area | Requirement | Implementation |
|------|-------------|----------------|
| Credential isolation | Edge's credentials scoped to edge@ only | Separate Google account, scoped Notion bot |
| Physical security | Mac Mini theft = full access | FileVault encryption MANDATORY |
| Prompt injection | Malicious email/transcript content | Content sanitizer (13 regex patterns) |
| Secret redaction | API keys in logs/output | Auto-redact patterns in all output |
| Outbound messaging | Never message Dan's contacts without approval | AGENTS.md policy + approval gates |
| Nightly drift detection | Configuration changes, new dependencies | Security Council 4-persona review |
| Pre-commit hooks | Block .env, credentials, large files | Git hook in workspace |
| API key rotation | Compromised key recovery | Document rotation procedure per service |
| Network isolation | Restrict outbound domains | macOS firewall rules (recommended) |
| Audit trail | All actions logged | Telegram message history + local logs |

### Security Risks Specific to VC Context

| Risk | Severity | Mitigation |
|------|----------|------------|
| MNPI in transcripts processed by AI | HIGH | All processing local on Mac Mini; no cloud transcript storage |
| Investor communications leaked via email draft | HIGH | Himalaya stores locally; drafts require approval |
| AI hallucinating meeting commitments | MEDIUM | Human-in-the-loop for ALL action items |
| Compromised Notion bot writing bad data | MEDIUM | Notion bot scoped to specific databases only |
| GitHub token with write access | MEDIUM | Use fine-grained PAT scoped to specific repos |
| Linear ticket containing sensitive deal info | LOW | Linear workspace permissions + team scoping |

---

## Review 5: Scalability (Edge → Gas Town)

### Phase 1: Edge Only (current)
- Single Mac Mini for Dan
- All skills deployed locally
- Telegram as sole interface

### Phase 2: Team Rollout (Week 2+)
- Each team member gets own Mac Mini + OpenClaw
- **Repeatable skill deployment**: Same skills, different client profiles
- **Shared Notion workspace**: All bots read/write to same databases
- **Individual Telegram groups**: Each person has own bot channel

### Phase 3: Gas Town (Multi-Agent Orchestration)
- Multiple Mac Minis coordinating
- **Shared CRM**: One SQLite CRM replicated or one Notion source of truth
- **Agent specialization**: Edge (Dan's PA), DevBot (CI/CD), ResearchBot (deal flow)
- **Inter-agent communication**: Via Notion databases or Telegram bot-to-bot
- **Resource coordination**: launchd schedules staggered to avoid API rate limits

### Scalability Design Decisions (make now, benefit later)

| Decision | Choice | Why |
|----------|--------|-----|
| CRM location | Notion (not local SQLite) | Shared across all agents in Gas Town |
| Action items | Notion boards | Visible to all team members |
| Transcript storage | Notion pages | Searchable, shared |
| Dev tickets | Linear (not Notion) | Better for engineering workflow |
| Credentials | Per-agent .env files | Isolated, rotatable |
| Scheduling | launchd per machine | No central scheduler needed |
| Communication | Telegram (individual groups) | Scales naturally |

---

## Deployment Order

### Day 1: Foundation
1. Fix gateway token (generate real one)
2. Fix timezone (America/Denver, not Mazatlan)
3. Deploy `deploy-security-safety.md` (Phases 1-4 + launchd for Phase 5)
4. Deploy `deploy-memory.md`
5. Deploy `deploy-himalaya-email.md` (NEW)
6. Set up Google Service Account for Calendar

### Day 2: Core Intelligence
7. Deploy `deploy-notion-workspace.md` (NEW)
8. Deploy `deploy-personal-crm-v2.md` (REWRITE)
9. Deploy `deploy-daily-briefing-v2.md` (REWRITE)
10. Deploy `deploy-meeting-prep.md` (NEW)

### Day 3: Transcript & Action Items
11. Deploy `deploy-transcript-pipeline.md` (NEW)
12. Deploy `deploy-action-items.md` (NEW)
13. Deploy `deploy-urgent-email-v2.md` (REWRITE)

### Day 4: Dev Infrastructure
14. Deploy `deploy-github-cicd.md` (NEW)
15. Deploy `deploy-linear-integration.md` (NEW)
16. Deploy `deploy-git-autosync.md` (REWRITE with launchd)

### Day 5: Security & Verification
17. Deploy `deploy-security-council-v2.md` (REWRITE)
18. Full system integration test
19. Documentation wiki for Crusoe Ventures team
20. Handoff meeting with Connor

---

## New Skills to Create (Priority Order)

### 1. deploy-notion-workspace.md
**Purpose:** Bidirectional sync with Notion People, Companies, and Task databases
**APIs:** Notion API v1 (workspace bot integration)
**Key features:**
- Read People & Companies for meeting prep
- Write action items to Task/Inquiry/Discuss database
- Update contact records from meeting notes
- Query database with filters for briefing data
- Rate limit handling (3 req/s with exponential backoff)

### 2. deploy-himalaya-email.md
**Purpose:** Permanent email access that never expires (replaces broken gog OAuth)
**APIs:** Gmail IMAP/SMTP via Himalaya CLI
**Key features:**
- Read inbox, sent, drafts
- Send emails (with approval gate)
- Draft emails for Dan's review
- Forward detection (emails forwarded from Dan)
- App password auth (permanent, no OAuth refresh needed)

### 3. deploy-meeting-prep.md
**Purpose:** Research attendees before meetings, build context briefings
**APIs:** Google Calendar + Notion + Tavily Search
**Key features:**
- Scan next 24h calendar events
- Extract attendee emails/names
- Match against Notion People & Companies
- Web search for unknown attendees
- Generate per-meeting briefing with context
- Deliver via Telegram + optional Notion page

### 4. deploy-action-items.md
**Purpose:** Extract action items from meetings, get approval, track in Notion
**APIs:** Claude API + Notion + Telegram
**Key features:**
- Parse transcript for decisions, commitments, follow-ups
- Match mentioned people to Notion database
- Create draft tasks in Notion (marked "pending approval")
- Send Telegram message with inline approve/reject buttons
- On approval: mark task active, assign to relevant person
- On reject: archive with reason

### 5. deploy-transcript-pipeline.md
**Purpose:** Ingest transcripts from multiple sources into unified format
**APIs:** Gemini API + Fathom API + Notion API
**Key features:**
- Gemini: Pull Google Meet transcripts via API
- Fathom: Pull meeting recordings/transcripts via Fathom API
- Notion: Scrape transcript pages from Notion meeting notes
- Normalize all transcripts to common format
- Feed into Action Item engine and CRM enrichment
- Store in local SQLite for search + Notion for sharing

### 6. deploy-github-cicd.md
**Purpose:** Set up CI/CD with AI-powered code review for all Crusoe repos
**APIs:** GitHub API + GitHub Actions + Claude Code Action
**Key features:**
- Branch protection on main (require PRs, 1 approval, status checks)
- CI workflow: lint + typecheck + test + build
- Security workflow: Semgrep SAST + npm audit
- AI review workflow: 5-pass Claude review (security, performance, quality, architecture, tests)
- Vercel auto-deploy (preview on PRs, production on main merge)
- All third-party actions pinned to commit SHAs

### 7. deploy-linear-integration.md
**Purpose:** Connect Linear for dev ticket management
**APIs:** Linear GraphQL API
**Key features:**
- Sync tickets to local state for briefing
- Create tickets from action items (with approval)
- Link PRs to tickets
- Status updates in Telegram
- Sprint/cycle visibility in daily briefing
