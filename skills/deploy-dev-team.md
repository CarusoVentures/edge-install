# Deploy Dev Team Orchestration

## Compatibility
- **OpenClaw Version**: 2026.3.27+
- **Status**: DRAFT
- **Layer**: 5 (Dev Infrastructure)
- **Architecture**: Claude Code Agent Teams (built-in) + Git Worktrees + Pipeline pattern. Orchestrator (Opus) + Workers (Sonnet). Per-project self-contained Telegram topics. Research: `docs/research/2026-03-30-multi-agent-dev-teams-research.md`

## Purpose

Deploy a multi-agent development team that builds websites, dashboards, and tools for Crusoe Ventures. Non-technical users (Dan, Emily) describe what they want in Telegram. Agent teams break it down, build it, review it, and create PRs for human approval.

Each project is self-contained — its own Telegram topic (`#dev-{project}`), its own agent team, its own PRs and reviews. No cross-project noise. Dan opens `#dev-boulder-roots`, scrolls once, sees the full lifecycle: what was planned, what was built, the PR, the review, the deploy.

**Key research finding:** Claude Code already has built-in Agent Teams with shared task lists, worktree isolation, and peer-to-peer messaging. Anthropic's Orchestrator (Opus) + Workers (Sonnet) outperformed single-agent Opus by 90.2%. We configure what exists, not build from scratch.

## Per-Project Telegram Topics

NO unified PR/review/deploy channels. Each project is its own world:

```
#dev-overview         — High-level: what's active, shipped, blocked across all projects

#dev-boulder-roots    — EVERYTHING for Boulder Roots
#dev-portfolio-dash   — EVERYTHING for Portfolio Dashboard
#dev-foundation       — EVERYTHING for Foundation website
#dev-sponsor-portal   — EVERYTHING for Sponsor Portal
#dev-{new-project}    — Edge creates new topics as projects start
```

Inside each project topic, the full lifecycle plays out in chronological order:

```
#dev-boulder-roots:

📋 TASK: Add sponsor tier section
  PM: Breaking into 3 subtasks. Builder 1 (frontend), Builder 2 (data).
  [View Plan] [Modify]

⚙️ IN PROGRESS: Builder 1 working on TierCard component (worktree: boulder-roots-tier)
  Builder 2 working on tier data config

✅ BUILT: Both builders complete. Sanitizer cleaning up.

🔍 REVIEW: 5-pass code review (Reviewer agent, fresh context)
  Pass 1 Correctness: ✓
  Pass 2 Security: ✓
  Pass 3 Performance: ✓ (images could be optimized — noted)
  Pass 4 Architecture: ✓
  Pass 5 UX: ✓ (responsive on mobile/tablet/desktop)

🔀 PR #48: Sponsor tier section
  ✓ All 5 review passes passed
  ✓ Security clean
  ✓ Tests 4/4
  Preview: https://preview-pr-48.vercel.app/sponsors
  [Approve + Merge] [Request Changes]

🚀 DEPLOYED: Sponsor tier section live
  https://boulderroots.com/sponsors
```

Dan sees the whole story in one scroll. No jumping between channels.

## Agent Team Structure (Per Project)

3-5 agents per active project:

| Agent | Model | Role | Rules |
|-------|-------|------|-------|
| **Project Manager (PM)** | Opus | The human's advocate. Asks discovery questions before building. Generates visual mockups (Stitch). Breaks into tasks. Assigns builders. Walks humans through PRs. Nudges on stale work. Drives the entire experience for non-technical users. | Never writes code. Asks questions first, always. Rejects vague specs. Proactively suggests improvements. |
| **Architect** | Opus | Designs the technical stack for new projects. Decides: Vercel vs Railway vs Supabase vs Cloudflare. Defines the middleware, APIs, database schema. Makes infrastructure decisions the PM can't. | Proposes architecture for human approval. Doesn't build — designs. Works with PM to ensure the plan is sound before builders start. |
| **Frontend Builder** (1-2) | Sonnet | Builds UI components, pages, styling in isolated git worktree. Owns frontend file domain (components, pages, styles). | Never touches backend files. Never pushes to main. Includes tests. |
| **Backend Builder** (1-2) | Sonnet | Builds APIs, data layers, server logic in isolated worktree. Owns backend file domain (api, data, config, server). Connects to Supabase, Railway, external APIs. | Never touches frontend files. Never pushes to main. Includes tests. |
| **Sanitizer** | Sonnet | Cleans ALL builder output before review. Formatting, debug removal, .gitignore compliance, secrets check, consistent style. | Never changes logic. If something looks wrong logically, flags for reviewer. |
| **Reviewer** | Opus | Reviews with FRESH context (zero builder knowledge). 5-pass review. Posts findings. The quality gate. | Read-only. Cannot modify code. Separate Claude session. Finds problems, doesn't validate. |

### Why Reviewer Has Fresh Context

The research found that agents reviewing their own work (or work they watched being built) "confidently praise it — even when quality is obviously mediocre." The reviewer agent:
- Gets a NEW Claude session with NO history of the build process
- Only sees: the diff, the requirements, and the test results
- Has a system prompt focused on finding problems, not validating decisions
- Cannot modify code — can only comment

This prevents rubber-stamp reviews.

## The Pipeline

```
1. Dan/Emily posts in #dev-{project}:
   "Add sponsor tier section to the homepage"
         ↓
2. PM (Opus) breaks it down:
   → Task 1: TierCard component (Builder 1, frontend domain)
   → Task 2: Tier data config (Builder 2, data domain)
   → Task 3: Responsive grid layout (Builder 1, frontend)
   → Posts plan to #dev-{project}: [Approve Plan] [Modify]
         ↓
3. Dan/Emily approves plan
         ↓
4. Builders work in parallel git worktrees:
   → Builder 1: worktree/boulder-roots-tier-frontend
   → Builder 2: worktree/boulder-roots-tier-data
   → Each commit to their own branch
         ↓
5. Sanitizer cleans up:
   → Remove console.logs, fix formatting
   → Check .gitignore compliance, no secrets
   → Merge builder branches into single PR branch
         ↓
6. Reviewer (Opus, fresh context):
   → Pass 1: Correctness
   → Pass 2: Security
   → Pass 3: Performance
   → Pass 4: Architecture
   → Pass 5: UX/Accessibility
   → Posts results to #dev-{project}
         ↓
7. PR created:
   → Description: what changed, why, review results
   → Labels: dev-team, auto-generated, {project-name}
   → Preview URL (Vercel preview deploy)
   → Posted to #dev-{project}: [Approve + Merge] [Request Changes]
         ↓
8. Human reviews + merges
   → Dan/Emily/Liam clicks preview, checks it
   → Approves → merged to main → production deploy
```

## How the PM Handles Non-Technical Users

Dan and Emily are not developers. They're passionate product people who know WHAT they want but not HOW to describe it technically. The PM agent's #1 job is to bridge that gap.

### Discovery Conversation (Before Building)

When Dan says "add sponsor tiers to the homepage," the PM doesn't immediately break it into tasks. It asks questions first:

```
Dan: "Add sponsor tiers to the homepage — gold, silver, bronze"

PM: "Love it. A few questions before I plan this:

1. VISUAL: Should gold sponsors get bigger logos? Or a different
   color/background? Or a separate section entirely?

2. DATA: Are the sponsor tiers + logos already somewhere
   (spreadsheet, Notion, email)? Or do we need to create the
   sponsor list from scratch?

3. PRIORITY: Should gold sponsors appear first (top of page)?
   Or should all tiers be visible at once in a grid?

4. INTERACTION: Should clicking a sponsor logo go to their
   website? Or show more info about them?

5. SCOPE: Is this just the main BRMF page, or also the
   dedicated /sponsors page?

Quick answers are fine — just need enough to build it right
the first time. 🎯"
```

Dan responds casually: "Big logos for gold at top, smaller for bronze. Get the list from Emily. Link to their websites. Just the /sponsors page for now."

NOW the PM has clear specs. NOW it breaks into tasks.

### Visual Mockups (Google Stitch Integration)

Before builders write code, the PM can generate a visual mockup so Dan sees what he's getting BEFORE it's built:

```
PM: "Here's what the sponsor tier page would look like:

[Visual mockup generated via Google Stitch API]

Gold tier: 3 large logos (200px), top row, dark background
Silver tier: 5 medium logos (140px), middle row
Bronze tier: 8 small logos (80px), bottom row, subtle gray

Does this match what you're imagining?
[Looks Good — Build It] [Change Layout] [Show Another Option]"
```

**Google Stitch API** generates quick visual prototypes. Not pixel-perfect — just enough for Dan to say "yes that's it" or "no, make the bronze bigger." Saves a full overnight build cycle on something Dan doesn't want.

**Config:** `GOOGLE_STITCH_API_KEY` in `.env`. PM generates mockups for any UI task before assigning to builders.

### Proactive PM Behavior

The PM doesn't wait for Dan to ask. It:
- **Suggests improvements:** "The current sponsor page has no mobile layout. Want me to add responsive design while we're updating tiers?"
- **Flags risks:** "Adding sponsor logos without lazy loading will slow the page. I'll include that in the plan."
- **Connects dots:** "Emily mentioned sponsor data is in a spreadsheet. I can pull it in automatically if she shares the link."
- **Checks understanding:** "Just to confirm — gold sponsors get the largest logos AND appear first. Silver is medium size in the middle. Bronze smallest at the bottom. Correct?"

## Agents Merge After Human Approval

**The human approves. The agent executes.** Dan and Emily are not going to open GitHub and click merge. They approve in Telegram, and Edge handles the technical side.

### The Flow

```
PR #48 posted to #boulder-roots:

🔀 PR #48: Sponsor tier section
  ✓ All 5 review passes passed
  ✓ Tests: 4/4 passing
  ✓ Security: clean
  Preview: https://preview-pr-48.vercel.app/sponsors

  This is NOT live yet. It's a preview.
  If you approve, I'll merge it and deploy to production.

  [✅ Approve — Merge & Deploy] [🔄 Request Changes] [❌ Close PR]
```

**Dan taps [Approve — Merge & Deploy]:**
```
Edge:
  ✓ Merging PR #48 to main...
  ✓ Merged successfully
  ✓ Production deploy triggered via Vercel
  ✓ Live in ~60 seconds

  🚀 DEPLOYED: boulderroots.com/sponsors
  Sponsor tier section is live.
```

**The agent merged.** But ONLY because Dan explicitly approved. The approval button is the gate, not the merge button in GitHub.

### What's Explicitly Clear in the PR Message

Every PR message makes these things unmistakable:

| Element | Why |
|---------|-----|
| **"This is NOT live yet"** | Dan knows the preview is safe to explore. Nothing changes until he approves. |
| **"If you approve, I'll merge and deploy"** | Crystal clear what [Approve] does. No ambiguity. |
| **Preview URL** | Dan taps, sees it on his phone. Visual confirmation. |
| **Review results** | 5-pass summary gives confidence. |
| **[Request Changes]** | Dan can say "make the bronze bigger" and the cycle repeats. |
| **[Close PR]** | Dan can reject entirely. PR is closed, branch cleaned up. |

### File Deletion With Approval

Agents CAN delete files, but only with explicit human approval:

```
PM: "To implement the new sponsor tier layout, I need to:
  ✓ Create: src/components/TierCard.jsx (new)
  ✓ Modify: src/pages/sponsors.jsx (update layout)
  ⚠ Delete: src/components/OldSponsorGrid.jsx (replaced by TierCard)

  The old OldSponsorGrid.jsx is completely replaced by the new
  component. Safe to remove?
  [Approve All Including Delete] [Keep Old File] [Let Me See Both]"
```

Deletion requires explicit approval in the task plan, not just the PR merge.

## Proactive PR and Branch Management

The Dev Team doesn't just build — it manages the full lifecycle and nudges humans when things stall.

### Stale PR Detection (Daily Check)

```
Every morning, PM checks for stale work:

#boulder-roots:
"📋 Dev Status:

  ✅ Merged this week: PR #47 (hero section), PR #46 (nav update)

  ⚠️ STALE PRs (waiting for your review):
  • PR #48: Sponsor tier section — ready 3 days ago
    Preview: https://preview-pr-48.vercel.app/sponsors
    [Review Now] [Remind Me Tomorrow] [Close PR]

  • PR #45: Footer redesign — ready 5 days ago
    Preview: https://preview-pr-45.vercel.app
    [Review Now] [Close PR]

  No orphaned branches detected. All clean. ✓"
```

### Orphan Branch Cleanup (Weekly via Nightman)

```
Nightman weekly check:

"🔧 Branch Cleanup Report:

  Active branches (linked to open PRs): 2
  Merged branches (safe to delete): 4
  Orphan branches (no PR, no recent commits): 1
    • nightman/2026-03-25-footer-experiment — last commit 6 days ago
      This was an experimental branch that never became a PR.
      [Delete Branch] [Create PR From It] [Keep It]"
```

### Walkthrough Mode

When Dan has multiple PRs to review, PM offers to walk him through:

```
PM: "You have 3 PRs waiting. Want me to walk you through them?
  [Yes — Walk Me Through] [I'll Review Myself] [Approve All]"

If Dan taps [Walk Me Through]:

PM: "PR #48: Sponsor Tiers
  This adds gold/silver/bronze sponsor logos to /sponsors.
  Preview: [link]

  What I changed:
  • New TierCard component with 3 sizes
  • Pulled sponsor data from the config Emily provided
  • Responsive grid: large on desktop, stacked on mobile
  • All logos link to sponsor websites

  The reviewer flagged one note: images could use lazy loading
  for faster page load. Not blocking — works great as-is.
  We can add lazy loading in a follow-up.

  [Approve — Merge & Deploy] [Request Changes] [Skip — Next PR]"
```

## Infrastructure Connections

The Dev Team works with the full stack Dan's team uses:

| Service | How Dev Team Uses It |
|---------|---------------------|
| **GitHub** | Repos, branches, PRs, branch protection |
| **Vercel** | Preview deploys on every PR. Production deploy on merge. |
| **Railway** | Backend services, databases, API hosting |
| **Supabase** | Database, auth, storage for web apps |
| **Cloudflare** | DNS, CDN, edge functions |

The PM and architect agents understand these services. When Dan says "I need a dashboard that shows portfolio performance," the architect designs the stack:

```
Architect: "For the portfolio dashboard, I'd suggest:

Frontend: Next.js on Vercel (fast, preview deploys work great)
Database: Supabase (stores portfolio data, real-time updates)
API: Railway (connects to data sources, runs scheduled syncs)
CDN: Cloudflare (already configured)

This gives you:
• Live preview URLs for every change
• Real-time data updates on the dashboard
• Scheduled data sync from your portfolio sources
• Fast global loading via Cloudflare

[Approve Architecture] [Simplify It] [Different Approach]"
```

## Rules (Updated)

| Rule | Detail |
|------|--------|
| **All work on dev branches** | Builders never commit directly to main. Always a branch → PR. |
| **Agents merge AFTER human approval** | Dan/Emily tap [Approve — Merge & Deploy] in Telegram. Agent handles the git merge + deploy. |
| **File deletion requires explicit approval** | PM shows what will be deleted in the task plan. Human approves before any file is removed. |
| **Reviewer has fresh context** | Zero knowledge of builder's reasoning. Separate Claude session. |
| **All PRs labeled** | `dev-team` + `auto-generated` + `{project-name}` |
| **Tests required** | Hooks block PR creation if tests fail |
| **One file domain per builder** | No two builders editing the same files |
| **PM asks questions first** | Never builds from vague specs. Discovery conversation before task breakdown. |
| **Visual mockups before building** | PM uses Google Stitch to show Dan what he'll get before code is written. |
| **Stale PR nudges** | Daily check for PRs waiting >2 days. Weekly orphan branch cleanup. |
| **PM walks through PRs** | Non-technical humans get a guided tour of what changed and why. |
| **Each project is self-contained** | Own topic, own agents, own PRs. No cross-project noise. |
| **If unsure, document don't code** | PM writes a markdown proposal for risky/unclear changes. |

## Where the Dev Team Lives: Inside Project Topics

The Dev Team is NOT a separate group or set of topics. It's **invisible infrastructure inside the project topics Dan already uses.** Every project topic in Edge HQ (`#boulder-roots`, `#foundation`, `#portfolio`) has a dev team behind it.

Dan doesn't think "I need to talk to the dev team." He thinks "I want to change the sponsor page." He posts in `#boulder-roots`. The PM responds. Builders build. Dan sees the result. The dev machinery is hidden.

### How a Project Topic Works (Dan's View)

`#boulder-roots` is three things in one:
1. **DISCUSSION** — Dan posts ideas, Emily coordinates
2. **DEV WORK** — PM plans, agents build, PRs appear with previews
3. **OPERATIONS** — Event logistics, sponsor outreach, content

Dan doesn't switch contexts. He just talks in `#boulder-roots`. Edge figures out whether it's a dev task, an email task, or a discussion.

### First Time: Onboarding a Project for Dev

When a project first needs dev work, Edge explains the process:

```
Dan: "I want to build a website for the Foundation"

Edge: "Great! Here's how this works:

1. You describe what you want (like you just did)
2. I'll ask a few questions to make sure I understand
3. I'll show you a visual mockup before we build anything
4. Once you approve, my team builds it overnight
5. In the morning, you get a preview link to check on your phone
6. If it looks good, tap [Approve] and it goes live

You never touch code, GitHub, or any technical tools.
Just chat here in #foundation and I handle everything.

Tell me more — what should the Foundation website do? 🏛️"
```

Dan now understands the pattern. Next time he just posts what he wants.

## Guiding the Human Through Every Step

The PM doesn't just post updates — it **explains what's happening, why, and what the human needs to do next.** Every message has a clear expected action labeled with "YOUR ACTION."

### When PM Posts a Plan

```
📋 Here's my plan for the sponsor tier section.

I'll build this overnight. Tomorrow morning you'll get a
preview link to check on your phone before anything goes live.

[Plan details...]

👉 YOUR ACTION: Review the plan. Tap one button.
[Approve Plan] [Modify] [Add More Details]
```

### When a PR Is Ready

```
🔀 The sponsor tier section is built!

What happened:
• My team built it overnight
• A separate reviewer checked for bugs + security
• All 5 quality checks passed ✓

👉 WHAT TO DO NOW:
1. Tap the preview link below (opens on your phone)
2. Scroll around — check it looks right
3. Tap [Approve] if good, or [Request Changes] if not

Preview: https://preview-pr-48.vercel.app/sponsors

⚠️ This is a TEST version — NOT live on your real site yet.
Safe to explore. Nothing changes until you approve.

[✅ Approve — Merge & Deploy] [🔄 Request Changes] [❌ Scrap It]
```

### When Dan Approves

```
🚀 Done! Sponsor tier section is now LIVE.

See it: boulderroots.com/sponsors

What happened:
• Your approval triggered the merge and deploy
• The preview URL will stop working (that's normal)
• The real site now has your gold/silver/bronze tiers 🎉

Anything else you want to change on this page?
```

### When Dan Requests Changes

```
🔄 No problem! What would you like changed?

Just describe it naturally:
• "Make the bronze logos bigger"
• "Change the background color"
• "Add a link to the sponsor application form"

I'll fix it tonight and have an updated preview by morning.
```

### Proactive Nudges for Stale PRs

```
👋 Hey Dan, quick heads up —

You have 2 updates waiting for your review:

1. 📱 Sponsor tiers (ready 3 days ago)
   Preview: https://preview-pr-48.vercel.app/sponsors
   Takes 30 seconds to check on your phone.

2. 🎨 Updated nav bar (ready yesterday)
   Preview: https://preview-pr-49.vercel.app

👉 Want me to walk you through them?
[Walk Me Through] [I'll Look Now] [Remind Me Tomorrow]
```

### When Something Is Confusing

```
Dan: "What's a PR?"

Edge: "Good question! Think of it like a draft email:
• I write it → you review it → you approve → it goes live
• Or you request changes → I fix it

You just tap the preview, check if it looks right,
and tap [Approve]. That's it! 👍"
```

### Walkthrough Mode

```
PM: "Let me walk you through PR #48.

This adds gold/silver/bronze sponsor logos to /sponsors.

What I changed:
• New component that shows logos in 3 sizes
• Gold sponsors get the biggest logos at the top
• Silver in the middle, bronze at the bottom
• Everything responsive — looks good on phone too

The reviewer found one note: images could load faster
with lazy loading. Not blocking — works great now.
We can optimize in a follow-up.

Preview: [link]

[Approve — Merge & Deploy] [Request Changes] [Next PR →]"
```

## How Dan/Emily Interact

Non-technical. Telegram only:

**Dan posts in `#dev-boulder-roots`:**
```
"Make the sponsor page show logos in tiers —
gold big, silver medium, bronze small.
Make it look professional."
```

**PM responds in same topic:**
```
📋 Breaking this down:
1. TierCard component (3 sizes)
2. Sponsor data structure (gold/silver/bronze)
3. Responsive grid layout
4. Mobile + tablet testing

Building tonight (Nightman). Preview URL in the morning.
[Approve Plan] [Modify] [Add Details]
```

**Next morning, same topic:**
```
🔀 PR #48: Sponsor tier section
  ✓ 5-pass review passed
  Preview: https://preview-pr-48.vercel.app/sponsors
  [Approve + Merge] [Request Changes]
```

Dan taps the preview. Looks good. Taps [Approve + Merge]. Done.

## Nightman Integration

Nightman's project work cycles ARE the Dev Team at work:

| Time | What |
|------|------|
| 6:00 PM | Evening planning: PM reads project goals + Dan's Telegram requests |
| 10:00 PM | PM breaks requirements into tasks |
| 10:30 PM - 2:00 AM | Builders work in parallel worktrees |
| 2:30 AM | Sanitizer cleans up |
| 3:00 AM | Reviewer does 5-pass review |
| 3:30 AM | PR created, posted to `#dev-{project}` |
| 5:30 AM | Morning briefing: "PR #48 ready for review in #dev-boulder-roots" |

## Project Configuration

```json
// config/dev-projects.json
{
  "projects": [
    {
      "name": "Boulder Roots Music Fest",
      "slug": "boulder-roots",
      "repo": "crusoe-ventures/boulder-roots-website",
      "telegramTopic": "#dev-boulder-roots",
      "status": "active",
      "agents": {
        "pm": { "model": "opus", "prompt": "agents/dev-pm.md" },
        "builders": [
          { "name": "frontend", "model": "sonnet", "domain": ["src/components/", "src/pages/", "src/styles/"] },
          { "name": "data", "model": "sonnet", "domain": ["src/data/", "src/config/", "src/api/"] }
        ],
        "reviewer": { "model": "opus", "prompt": "agents/dev-reviewer.md" },
        "sanitizer": { "model": "sonnet", "prompt": "agents/dev-sanitizer.md" }
      },
      "goals": [
        "Sponsor tier section",
        "Mobile responsiveness",
        "Page speed optimization"
      ]
    }
  ]
}
```

New projects: Dan says "I want to build a Foundation website." Edge creates the repo, the topic, the agent team config, and starts the PM planning.

## What Gets Installed

| Component | Path | Purpose |
|-----------|------|---------|
| Agent Teams config | Edge settings.json | Enable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` |
| PM prompt | `agents/dev-pm.md` | Project Manager system prompt |
| Builder prompt | `agents/dev-builder.md` | Builder rules: worktree, domain, tests |
| Reviewer prompt | `agents/dev-reviewer.md` | 5-pass review, fresh context |
| Sanitizer prompt | `agents/dev-sanitizer.md` | Cleanup: formatting, debug, secrets |
| Project config | `config/dev-projects.json` | Per-project: repo, topic, agents, goals |
| Quality hooks | `.claude/hooks/` | Test enforcement, file domain checks |
| TOOLS.md | `TOOLS.md` | new_project, dev_status, request_feature |

## Cost

| Component | Per Project Per Night |
|-----------|---------------------|
| PM (Opus, 2-3 cycles) | ~$1.00 |
| Builders (Sonnet, 4-6 cycles) | ~$1.50 |
| Reviewer (Opus, 1-2 cycles) | ~$0.75 |
| Sanitizer (Sonnet, 1 cycle) | ~$0.25 |
| **Per project** | **~$3.50/night** |
| **3 active projects, monthly** | **~$315/month** |

## Testing

| Phase | What | Target |
|-------|------|--------|
| T1 | `#test-dev` topic | Test group |
| T2 | Enable Agent Teams on Edge | Edge config |
| T3 | Create test repo → PM breaks "add hero section" into tasks | Test topic |
| T4 | Builder creates component in worktree | GitHub test repo |
| T5 | Sanitizer cleans up | Check diff |
| T6 | Reviewer does 5-pass in fresh context | Check comments |
| T7 | PR created with labels + preview URL | GitHub |
| T8 | File domain enforcement: builder tries outside domain → blocked | Check hooks |
| T9 | Dan/Emily interaction: post requirement → PM responds with plan | Test topic |
| T10 | Nightman integration: overnight build produces PR | Monitor |
| T11 | Go-live: Boulder Roots as first real project | Monitor first week |

## Dependencies

```
REQUIRED:
├── Claude Code Agent Teams ........... Enable experimental flag
├── Git + GitHub ...................... For repos, worktrees, PRs
├── GitHub CI/CD (approved) ........... Branch protection + review workflows
├── Nightman (approved) ............... Overnight build cycles
├── Telegram .......................... #dev-{project} topics
└── Vercel ............................ Preview deploys for PRs

INTEGRATES WITH:
├── Security Council .................. Audits new code nightly
├── Git Autosync ...................... Workspace changes tracked
├── Backup & Recovery ................. Repos included in backup
└── Daily Briefing .................... "PR #48 ready for review"
```
