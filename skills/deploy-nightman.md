# Deploy Nightman (Autonomous Overnight Workforce)

## Compatibility
- **OpenClaw Version**: 2026.3.27+
- **Status**: DRAFT
- **Layer**: 0 (Foundation) — runs all night, feeds every morning skill
- **Architecture**: Standalone Node.js orchestrator + 30-minute recursive trigger cycle via launchd. Claude Opus 4.6 for deep thinking and project advancement. State management via SQLite. GitHub integration for autonomous dev work (never pushes to main — dev branches + PRs only).
- **Updated**: 2026-03-30 based on Ryan's vision: "This is where the magic happens."

## Purpose

Deploy an autonomous overnight workforce that runs from 10 PM to 5 AM in 30-minute cycles. Each cycle, Nightman checks its task queue, picks up the highest-priority work, executes it, logs the results, and queues the next cycle. It's not a script that runs once — it's a **shift worker** that recursively processes work all night long.

**The vision (from Ryan):** "Imagine a PA who's in a different country and is awake when you're asleep. While Dan sleeps, it enriches contacts, researches new approaches, advances projects, improves websites, thinks about what could be better. Every 30 minutes, it triggers a new session where it thinks deeply about it, looks at what it made in the past, and says, 'I can make that a little better.'"

**What makes this different from a nightly batch job:**
- Batch jobs run once and exit. Nightman runs **14 cycles** (10 PM - 5 AM, every 30 min).
- Each cycle is a fresh process (no context accumulation) that reads the state from the previous cycle.
- It's autonomous — it decides what to work on based on priority, what's incomplete, and what opportunities it sees.
- It uses **Claude Opus 4.6** for deep thinking — not Haiku or Sonnet. This is where you invest in the best brain.
- It has rules (never push to main, always create PRs, never send emails without approval) so it can work unsupervised.

## Schedule

### Evening Planning Phase (6:00 PM)

Before the night shift starts, Nightman runs a **planning session:**

```
6:00 PM — EVENING PLANNING (via EOD Summary integration)

1. Inventory tonight's work:
   - What tasks are queued? (calendar enrichment, contact research, project work)
   - What projects have active goals?
   - What GitHub repos have open issues or improvement targets?

2. Identify gaps:
   - "I need Dan's priorities for the Boulder Roots website before I can advance it"
   - "The PortCo X metrics aren't in the system — can't draft the follow-up until they are"
   - "No goals defined for the Foundation website — should I research best practices?"

3. Send planning summary to Emily/Dan via Telegram:
   "Tonight's planned work:
    1. Calendar enrichment for tomorrow (3 meetings)
    2. Contact research: 5 unknown attendees
    3. Draft 2 overdue follow-up emails
    4. Boulder Roots website: improve sponsor page layout (PR to dev branch)
    5. KG maintenance + backup

    ⚠ Missing info:
    - No goals defined for Foundation website. Should I research approaches?
    - PortCo X metrics needed for John Smith follow-up.

    [Approve Plan] [Modify] [Add Tasks]"

4. Dan/Emily can:
   - Approve the plan as-is
   - Add tasks ("Also research competitive sponsor portals")
   - Remove tasks ("Skip the Foundation website tonight")
   - Provide missing info ("Here are the PortCo X metrics: ...")
   - If no response by 10 PM, Nightman works from what it has
```

### Night Shift (10:00 PM — 5:00 AM)

14 cycles, every 30 minutes. Each cycle is a fresh process.

```
10:00 PM — Cycle 1: High-priority operational tasks
10:30 PM — Cycle 2: Calendar enrichment + contact research
11:00 PM — Cycle 3: Draft follow-up emails
11:30 PM — Cycle 4: KG maintenance + consistency checks
12:00 AM — Cycle 5: Project work — GitHub repos (dev branch)
12:30 AM — Cycle 6: Project work continues
 1:00 AM — Cycle 7: Strategic thinking (Opus deep analysis)
 1:30 AM — Cycle 8: Project work — improvements and PRs
 2:00 AM — Cycle 9: Contact enrichment (LinkedIn research)
 2:30 AM — Cycle 10: Project work continues
 3:00 AM — Cycle 11: Embedding refresh + KG updates
 3:30 AM — Cycle 12: Security Council audit
 4:00 AM — Cycle 13: Backup + final project work
 4:30 AM — Cycle 14: Night summary + handoff preparation
```

**This schedule is a guideline, not rigid.** Nightman's orchestrator decides what to work on each cycle based on:
- Priority queue (operational tasks first, then enrichment, then projects)
- What completed in previous cycles
- What failed and needs retry
- Time remaining until morning briefing

## State Management

Nightman maintains state across cycles via SQLite:

### `nightman-state.db`

| Table | Purpose |
|-------|---------|
| `task_queue` | All tasks for tonight: task_type, priority, status (queued/in_progress/completed/failed/skipped), cycle_started, cycle_completed, result_path |
| `cycle_log` | Log per cycle: cycle_number, started_at, completed_at, tasks_worked, tokens_used, errors |
| `project_state` | Per-project tracking: repo_url, branch, last_commit, goals[], current_status, pr_url, notes |
| `nightly_plan` | Tonight's plan (from 6 PM planning phase): approved_tasks, missing_info, dan_additions |
| `ideas` | Ideas generated during deep thinking: idea, project, priority, rationale, created_cycle |

### State File Handoff

Each cycle reads the state from the previous cycle and writes updated state:

```
Cycle N starts:
  1. Read nightman-state.db → what's done, what's pending, what failed
  2. Pick highest-priority incomplete task
  3. Execute task (with appropriate model — Opus for thinking, Sonnet for execution)
  4. Write results to data/nightman/YYYY-MM-DD/
  5. Update nightman-state.db → mark task complete, queue follow-ups
  6. Exit cleanly

Cycle N+1 starts 30 min later:
  1. Read nightman-state.db → picks up where Cycle N left off
  ...
```

No context accumulation between cycles. Each is a fresh process. State lives in the database.

## Task Categories

### Category 1: Operational (Highest Priority — runs first)

| Task | What | Model |
|------|------|-------|
| Calendar enrichment | Missing links, travel time, parking for next 48 hours | Sonnet |
| Contact research | Unknown attendees for tomorrow's meetings | Sonnet + Tavily |
| Draft follow-ups | Overdue action items → emails in Dan's voice | Opus (voice quality) |
| KG maintenance | Edges, states, consistency, embeddings | Sonnet |
| Backup | Trigger Backup & Recovery skill | Script |

### Category 2: Project Work (GitHub Integration)

Nightman knows about the team's GitHub repos, what's being built, and what the goals are.

**How it works:**

```
For each project in project_state:

1. Read project goals (from config or Dan's instructions)
   "Boulder Roots website: improve sponsor page layout, add mobile responsiveness"

2. Check GitHub repo status:
   - git pull latest from main
   - Read open issues and PRs
   - Check last Nightman commit on dev branch

3. Create or checkout dev branch:
   nightman/YYYY-MM-DD-{project-name}

4. Use Claude Opus to analyze the codebase:
   "Given these goals, what specific improvements can I make tonight?"

5. Make changes (code, content, styling, structure)

6. Commit to dev branch with clear message:
   "[Nightman] Improve sponsor page mobile layout — responsive grid, touch targets"

7. Create PR (or update existing) via GitHub API:
   Title: "[Nightman] Sponsor page improvements — March 31"
   Body: What was changed, why, screenshots if applicable
   Labels: nightman, auto-generated
   Target: main (for human review)

8. NEVER merge. NEVER push to main. PR sits for human review.
```

**Rules for project work (hard, non-negotiable):**
1. **Never push to main.** Always dev branch → PR.
2. **Never merge PRs.** Humans merge after review.
3. **Never delete files.** Only add or modify.
4. **Always create PRs** with clear descriptions of what changed and why.
5. **Label everything** `nightman` + `auto-generated` so the team knows it's AI work.
6. **Respect .gitignore.** Never commit .env, credentials, or large files.
7. **If unsure, document instead of code.** Write a markdown file explaining the idea rather than making a risky code change.

**Project goals are defined by Dan/Emily** (via evening planning or config):

```json
// config/nightman-projects.json
{
  "projects": [
    {
      "name": "Boulder Roots Music Fest",
      "repo": "crusoe-ventures/boulder-roots-website",
      "branch_prefix": "nightman",
      "goals": [
        "Improve sponsor page layout for mobile",
        "Add sponsor tier descriptions",
        "Optimize images for page speed"
      ],
      "status": "active"
    },
    {
      "name": "Portfolio Dashboard",
      "repo": "crusoe-ventures/portfolio-dashboard",
      "branch_prefix": "nightman",
      "goals": [
        "Add quarterly performance charts",
        "Improve loading speed",
        "Fix responsive layout on tablet"
      ],
      "status": "active"
    }
  ]
}
```

### Category 3: Strategic Thinking (Opus Deep Analysis)

One or two cycles per night dedicated to **deep thinking** with Claude Opus 4.6:

**What Opus thinks about:**

| Topic | Prompt Pattern |
|-------|---------------|
| Project ideas | "Given the current state of {project}, what could we do next? What would make this 10x better? Think beyond the current goals." |
| Contact strategy | "Dan meets with {person} tomorrow. Given their relationship history and current deal state, what's the optimal approach? What should Dan ask? What should he offer?" |
| Competitive research | "The Boulder Roots Music Fest competes with {events}. What are they doing that we're not? What could we learn from their sponsor portals?" |
| Process improvement | "Looking at Edge's operational data from the last week: what's working? What's failing? What should we change?" |
| Proactive recommendations | "Based on Dan's calendar, email patterns, and current projects — what's he not seeing? What's falling through the cracks? What opportunity is he missing?" |

Ideas are stored in the `ideas` table and surfaced in the morning briefing:

```
"💡 Nightman Idea (generated 1:30 AM, Opus):
 The Boulder Roots sponsor page currently lists sponsors alphabetically.
 Competitor analysis of 5 music festivals shows tiered visual layouts
 (logos sized by tier) convert 23% more sponsor inquiries. I've created
 a PR with a tiered layout concept: nightman/2026-03-31-sponsor-tiers
 [View PR] [Dismiss Idea]"
```

### Category 4: Recursive Improvement

Even "done" projects get revisited. Nightman asks:

- "This project is marked complete. But what if we pushed it further?"
- "The sponsor page is deployed. What would make it world-class?"
- "The dashboard loads in 2.1 seconds. Can we get it under 1 second?"

This is controlled by Dan/Emily — they can mark a project as:
- `active` — Nightman works on defined goals
- `maintenance` — Nightman only fixes bugs and monitors
- `explore` — Nightman can explore improvements and create idea PRs
- `frozen` — Nightman doesn't touch it

## Evening Planning (6:00 PM) — Detailed

The planning phase ensures Nightman has what it needs before the shift starts.

**Sent to Emily/Dan via Telegram at 6:00 PM:**

```
🌙 Nightman Planning — Tonight's Shift

OPERATIONAL (auto-queued):
  ✓ Calendar enrichment (3 meetings tomorrow)
  ✓ Contact research (2 unknown attendees)
  ✓ 3 overdue follow-ups need draft emails
  ✓ KG maintenance + backup

PROJECTS:
  📁 Boulder Roots website
     Goal: Mobile sponsor page improvements
     Status: PR from last night merged. New goal: add tier descriptions.
     Ready to work ✓

  📁 Portfolio Dashboard
     Goal: Quarterly charts
     Status: No data source configured yet.
     ⚠ BLOCKED — need PortCo metrics API endpoint

STRATEGIC THINKING:
  🧠 1-2 cycles of Opus deep analysis on:
     - Sponsor acquisition strategy (competitive research)
     - Tomorrow's meeting prep: strategic angles for John Smith

⚠ MISSING INFO:
  - Portfolio Dashboard blocked on metrics API
  - No goals defined for Foundation website (should I research?)

[Approve Plan] [Add Tasks] [Modify] [Skip Projects Tonight]
```

**If Dan responds:** "Also look at the Sundance reception page. And yes, research Foundation website approaches."

**If no response by 10 PM:** Nightman works from what it has, skipping blocked tasks.

## Night Summary & Handoff (4:30 AM — Last Cycle)

The final cycle produces a summary of everything accomplished overnight:

```
data/nightman/YYYY-MM-DD/run-summary.json
{
  "nightDate": "2026-03-31",
  "cyclesRun": 14,
  "cyclesSuccessful": 13,
  "cyclesFailed": 1,
  "totalTokens": 245000,
  "totalCost": "$3.42",
  "tasks": {
    "calendarEnrichment": { "status": "complete", "meetingsEnriched": 3, "flagsRaised": 1 },
    "contactResearch": { "status": "complete", "contactsResearched": 2, "newCRMRecords": 1 },
    "draftFollowUps": { "status": "complete", "draftsCreated": 3 },
    "kgMaintenance": { "status": "complete", "edgesAdded": 12, "staleRefreshed": 5 },
    "backup": { "status": "complete" },
    "projectWork": {
      "boulderRoots": { "status": "complete", "prUrl": "github.com/.../pull/47", "changes": "Tiered sponsor layout + mobile responsive grid" },
      "portfolioDashboard": { "status": "blocked", "reason": "No metrics API endpoint" }
    },
    "strategicThinking": {
      "ideasGenerated": 3,
      "topIdea": "Sponsor page tiered layout (see PR #47)"
    }
  }
}
```

This is what the 5:30 AM Morning Briefing reads.

## What Gets Installed

| Component | Path | Purpose |
|-----------|------|---------|
| Orchestrator | `scripts/nightman.js` | Main loop: reads state, picks task, executes, updates state |
| Planning script | `scripts/nightman-plan.js` | 6 PM planning phase → Telegram |
| Calendar enrichment | `scripts/nightman-calendar.js` | Task 1: Missing links, travel, parking |
| Contact research | `scripts/nightman-contacts.js` | Task 2: Tavily + CRM enrichment |
| Draft follow-ups | `scripts/nightman-followups.js` | Task 3: Overdue items → Dan's voice |
| KG maintenance | `scripts/nightman-kg.js` | Task 4: Edges, states, consistency |
| Project worker | `scripts/nightman-project.js` | Task 5: GitHub repos, dev branches, PRs |
| Strategic thinker | `scripts/nightman-think.js` | Task 6: Opus deep analysis |
| Summary generator | `scripts/nightman-summary.js` | 4:30 AM: night summary + handoff |
| State DB | `data/nightman-state.db` | Task queue, cycle log, project state, ideas |
| Project config | `config/nightman-projects.json` | Repos, goals, branch rules |
| Config | `config/nightman.json` | Schedule, model selection, task priorities |
| Output dir | `data/nightman/YYYY-MM-DD/` | Nightly results (consumed by morning skills) |
| LaunchAgent (planner) | `~/Library/LaunchAgents/com.edge.nightman-plan.plist` | 6:00 PM daily |
| LaunchAgent (worker) | `~/Library/LaunchAgents/com.edge.nightman.plist` | Every 30 min, 10 PM - 5 AM |
| TOOLS.md | `TOOLS.md` | nightman_status, nightman_plan, add_project, nightman_ideas |

## Cost

| Component | Cost/Night |
|-----------|-----------|
| Claude Opus (strategic thinking, 2-3 cycles) | ~$1.50 |
| Claude Opus (draft follow-ups in Dan's voice) | ~$0.50 |
| Claude Sonnet (operational tasks, 8-10 cycles) | ~$1.00 |
| Claude Opus (project work analysis + code, 3-4 cycles) | ~$2.00 |
| Tavily research (~10 lookups) | ~$0.10 |
| Google Maps API | ~$0.03 |
| oMLX embeddings | $0 |
| **Nightly total** | **~$5.13** |
| **Monthly** | **~$154** |

More expensive than the original $28/month estimate because we're using Opus for deep thinking and running 14 cycles instead of 1 batch. For a VC firm: $154/month for an autonomous overnight workforce that advances projects, enriches contacts, and generates strategic ideas. That's less than one hour of a junior analyst's time.

## Testing

| Phase | What | Target |
|-------|------|--------|
| T1 | `#test-nightman` topic | Test group |
| T2 | Evening planning: generate plan from mock data → send to test topic | Test topic |
| T3 | Single cycle: operational task (calendar enrichment) → verify output file | Local |
| T4 | State management: run 3 cycles → verify state DB tracks progress across cycles | Check DB |
| T5 | Project work: mock GitHub repo → checkout dev branch → make change → create PR | GitHub test repo |
| T6 | PR rules: verify PR created with nightman label, NOT merged, NOT pushed to main | GitHub |
| T7 | Strategic thinking: run Opus deep analysis on mock project → review ideas | Test topic |
| T8 | Draft follow-up: mock overdue item → draft in Dan's voice → verify quality | Test topic |
| T9 | Failure handling: one task fails → verify other cycles continue | Check state DB |
| T10 | Summary generation: after 3 test cycles → verify run-summary.json | Local |
| T11 | Morning briefing integration: Nightman output → briefing reads it correctly | Test topic |
| T12 | Blocked task: project missing info → verify it's skipped, not attempted | Check log |
| T13 | Live dry run: real calendar + real CRM + test GitHub repo → full night (compressed to 1 hour for testing) | Review all output |
| T14 | Go-live: production 10 PM - 5 AM | Monitor first 3 nights |

**Go/no-go:**

| # | Check | Required? |
|---|-------|-----------|
| 1 | 30-minute cycle trigger works reliably | YES |
| 2 | State DB persists across cycles correctly | YES |
| 3 | Evening planning generates and sends plan | YES |
| 4 | Calendar enrichment produces correct output | YES |
| 5 | Contact research runs via Tavily | YES |
| 6 | Draft follow-ups use Dan's voice | YES |
| 7 | KG maintenance runs successfully | YES |
| 8 | Project work: dev branch created, PR opened, main untouched | YES |
| 9 | PR has nightman + auto-generated labels | YES |
| 10 | Strategic thinking produces actionable ideas | YES |
| 11 | One failed task doesn't kill other cycles | YES |
| 12 | Night summary is complete and accurate | YES |
| 13 | Morning briefing reads Nightman output | YES |
| 14 | Blocked tasks are skipped gracefully | YES |
| 15 | All test output to `#test-nightman` topic | YES |

## Dependencies

```
REQUIRED:
├── Google Calendar API ............... Calendar enrichment
├── Google Maps API ................... Travel time + parking
├── Personal CRM ...................... Contact data
├── Knowledge Graph ................... KG maintenance
├── Notion Workspace .................. Tasks DB (overdue items)
├── Anthropic API (Opus + Sonnet) ..... Deep thinking + execution
├── Tavily API ........................ Web research
├── oMLX .............................. Embedding refresh
├── GitHub API (gh CLI) ............... Project work (dev branches, PRs)
├── Voice Engine ...................... Draft follow-ups in Dan's voice
├── Backup & Recovery ................. Triggered during shift
└── Telegram .......................... Evening planning + alerts

FEEDS:
├── Daily Briefing (5:30 AM) .......... All Nightman output
├── Meeting Prep (5:00 AM) ............ Pre-researched attendees
├── Email Intelligence ................ Updated KG states
├── Emily's briefing .................. Draft follow-ups for review
└── GitHub repos ...................... PRs with improvements
```
