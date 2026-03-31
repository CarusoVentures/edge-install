# Deploy Telegram Communication Strategy

## Compatibility
- **OpenClaw Version**: 2026.3.27+
- **Status**: APPROVED
- **Layer**: 0 (Foundation) — deployed FIRST, before any skill that sends messages
- **Architecture**: Two Telegram supergroups. Edge is admin. requireMentions: false always. Topics created via Bot API with welcome/example messages.
- **Approved**: 2026-03-30 by Ryan, with Emily's input on group structure and urgent email routing.

## Purpose

Deploy the messaging infrastructure for all Edge skills. Two groups: Edge HQ (Dan's project-based group) and Emily Edge HQ (Emily's operations group). Every topic gets a welcome message with examples explaining what it's for, how to use it, and what to expect.

Emily filters urgent emails before they reach Dan. Dan's group is clean and project-focused. Emily's group handles all operational approvals. requireMentions: false everywhere — just type naturally.

## Topic Welcome Messages

When each topic is created, Edge posts a pinned welcome message explaining the topic. These serve as onboarding — when Dan or Emily open a topic for the first time, they immediately understand what it's for.

### Edge HQ (Dan's Group) — Welcome Messages

#### #edge (General)
```
👋 Welcome to Edge

This is your main chat with me. Just type naturally — no @mentions needed.

Things you can say here:
• "Book dinner at Frasca for 2 at 7 PM Friday"
• "What's John Smith's email?"
• "Move my 3 PM to tomorrow"
• "What's on my calendar Thursday?"
• "Hey Edge, make a new project for the Foundation website"
• "Research that fintech company from Austin"

I'll figure out the right skill and respond. If I need clarification, I'll ask.

For project-specific work, use the project topics below.
For personal stuff (dinner, golf, travel), use #personal.
```

#### #dan-briefing
```
📋 Dan's Daily Briefing

Every morning at 5:30 AM and every evening at 7 PM, you'll get a concise summary here.

Morning brief includes:
• Today's calendar with attendee context (who they are, why you're meeting)
• Items that need your attention today
• Overdue follow-ups
• Urgent email count

Evening summary includes:
• What was accomplished today
• Meetings attended
• New action items created
• Tomorrow's preview

Target: under 2,000 characters. Scannable in 60 seconds.

Example:
"Good morning, Dan. Here's your Tuesday brief.

CALENDAR (3 meetings)
• 9:00 AM — John Smith, Sequoia (Series B for PortCo X)
  Last spoke Mar 15. Interested in Sundance.
• 2:00 PM — Founder intro via Connor (research attached)
• 4:00 PM — Cody sync (moveable)

NEEDS ATTENTION
• LP capital call response overdue (3 days)

3 urgent emails (Emily reviewing). 12 total unread."
```

#### #dan-meetings
```
📅 Meeting Prep

Before your meetings, you'll see dossiers here with everything you need to know.

Each dossier includes:
• Who you're meeting (title, company, relationship history)
• WHY you're meeting (email thread that led to this)
• Their interests (Sundance, politics, music — for conversation)
• Travel time + parking + GPS link (for in-person meetings)
• Suggested talking points

Only external attendees get full research. Internal team is excluded.

Example:
"9:00 AM — Series B Discussion (📹 Zoom)
WHY: Inbound from Sequoia. Connor intro'd Mar 15.
John Smith (MD, Sequoia) — 12 meetings since 2024
Interests: Sundance, politics
Talking points: Series B terms, PortCo X traction"

You can also say: "Prep my next meeting" anytime in #edge.
```

#### #dan-approvals
```
✅ Dan's Approvals

Items that only you can decide show up here. Tap a button to approve or reject.

Types of approvals:
• Investment decisions (deal terms, commitments)
• Major commitments (partnerships, sponsorships)
• Items Emily forwards from urgent email triage

Example:
"📋 Investment Decision
PortCo X Series B — Sequoia proposing $50M pre-money.
Connor's analysis attached. Board meeting Thursday.
[Approve] [Reject] [Need More Info]"

You won't see operational approvals here — Emily handles those in her group.
```

#### #boulder-roots (example project topic)
```
🎵 Boulder Roots Music Fest

Everything for BRMF lives here: planning, sponsor outreach, website development, event logistics.

What you'll see:
• 📋 TASK — Agent team breaking down your request
• ⚙️ IN PROGRESS — Builders working on it
• 🔍 REVIEW — Code review results
• 🔀 PR — Preview link + approve/merge button
• 🚀 DEPLOYED — Live on the website

Things you can say here:
• "Add sponsor tiers to the homepage — gold, silver, bronze"
• "Update the event schedule for June dates"
• "Make the mobile version look better"

I'll break it into tasks, build it overnight, and have a preview ready by morning.

[View Current Goals] [Add New Goal]
```

#### #investments
```
💰 Investments

Active deal flow, term sheets, due diligence tracking.

What you'll see:
• Deal updates and status changes
• Due diligence research from Nightman
• Meeting prep for investor meetings (cross-posted from #dan-meetings when relevant)
• Action items related to active deals

Things you can say:
• "What's the status on the PortCo X deal?"
• "Research this new company that pitched us"
• "Draft a follow-up to the Series A conversation"
```

#### #portfolio
```
📊 Portfolio

30+ portfolio company monitoring, LP reporting, dashboard updates.

What you'll see:
• Portfolio company updates and news
• Quarterly reporting status
• Dashboard improvements (dev work)
• LP communication drafts

Things you can say:
• "How is PortCo X performing this quarter?"
• "Draft the LP quarterly update"
• "Add a new chart to the dashboard showing ARR growth"
```

#### #contacts-vip
```
👥 Contacts & VIP Lists

Your persons directory and VIP management.

What you'll see:
• Notable contact updates (job changes, new ventures)
• VIP list curation for events
• Contact research results you requested

Things you can say:
• "Who do we know at Andreessen?"
• "Build a VIP list for the next Sundance reception"
• "Find me the fintech guy from Austin"
• "What's Sarah Chen's preferred email?"
```

#### #ensuring-colorado
```
🏔️ Ensuring Colorado's Innovation Future

Policy, events, stakeholder management for this initiative.

What you'll see:
• Project updates and milestones
• Stakeholder research
• Event planning
• Website/content development

Things you can say:
• "Draft a stakeholder update email"
• "Research Colorado tech policy developments"
• "Build a landing page for the initiative"
```

#### #creators-edge
```
🎨 Creators at the Edge

Community building, directory management, events.

What you'll see:
• Community updates
• Creator directory changes
• Event planning and coordination
• Content and outreach

Things you can say:
• "Add a new creator to the directory"
• "Plan the next community event"
• "Update the Creators at the Edge website"
```

#### #foundation
```
🏛️ Caruso Foundation

Grant tracking, nonprofit operations, quarterly board decks.

What you'll see:
• Grant applications and tracking
• Board deck drafts (narrative format)
• Foundation event planning
• Donor communications

Things you can say:
• "What grants are pending review?"
• "Draft the Q2 board deck"
• "Track this new grant application from [org]"
```

#### #bear-roars
```
🎙️ The Bear Roars Podcast

Guest coordination, episode scheduling, show notes.

What you'll see:
• Upcoming guest research and dossiers
• Episode scheduling and logistics
• Show notes drafts
• Listener engagement ideas

Things you can say:
• "Research [person] as a potential guest"
• "Schedule a recording for next week"
• "Draft show notes for the latest episode"
```

#### #personal
```
❤️ Personal

Dinner reservations, golf, Beaver Creek/Cabo houses, family calendar, travel, NetJets.

What you'll see:
• Reservation confirmations ("Frasca booked, 7 PM Friday")
• Travel logistics (NetJets hours, Fly1200 bookings)
• House reservation management
• Golf tournament registrations
• Family calendar updates

Things you can say:
• "Book dinner at Frasca for 2 at 7 PM Friday"
• "Check availability at the Beaver Creek house for July 4th weekend"
• "Register me for the Arrowhead golf tournament"
• "Book a NetJets flight to Cabo for Thursday"
• "What's on the family calendar this weekend?"

I can make calls in your voice for restaurant reservations. 🔊
```

#### #nightman-report
```
🌙 Nightman Report

Edge's overnight workforce runs from 10 PM to 5 AM. This is where you see what happened.

What you'll see:
• 6:00 PM — Tonight's plan: what will be worked on, what's missing
  [Approve Plan] [Add Tasks] [Modify]
• 5:00 AM — Night summary: what was accomplished, PRs created, ideas generated

Example evening plan:
"🌙 Tonight's Shift:
1. Calendar enrichment (3 meetings tomorrow)
2. Contact research (2 unknown attendees)
3. Boulder Roots: mobile sponsor page improvements
4. Draft 2 overdue follow-up emails

💡 Strategic thinking: sponsor acquisition strategy

⚠ Missing: no goals for Foundation website
[Approve Plan] [Add Tasks]"

Example morning summary:
"🌙 Nightman Complete — 14 cycles, $3.42
✓ Calendar enriched, ✓ 2 contacts researched
✓ PR #48: Sponsor tiers (preview ready)
💡 Idea: Tiered sponsor layout converts 23% more inquiries
[View PR] [View Idea]"
```

### Emily Edge HQ — Welcome Messages

#### #edge (Emily's General)
```
👋 Welcome to Edge — Emily's workspace

This is your main chat with me. Just type naturally.

Things you can say:
• "Research Sarah Chen for Dan's meeting tomorrow"
• "What's on Dan's calendar Thursday?"
• "Draft a follow-up to the LP from last week"
• "Check if John Smith's contact info is up to date"
• "What emails came in overnight?"

I handle the request and respond here. Automated outputs go to the specific topics below.
```

#### #emily-briefing
```
📋 Emily's Operational Briefing

Every morning at 5:30 AM and evening at 7 PM, you'll get the full operational picture.

Morning brief includes:
• Calendar integrity report (missing links, travel time gaps)
• Scheduling intelligence (moveable vs. fixed meetings, conflicts)
• Draft follow-up emails awaiting your review
• Contact updates pending approval
• Full email digest (all urgency tiers)
• Action items (complete list with priorities)

This is more detailed than Dan's version (~6,000 chars vs his ~2,000). You see everything. He sees need-to-know only.

Tip: Review #emily-contacts (enrichment batch) BEFORE reading this briefing — the briefing references enrichment data.
```

#### #emily-urgent
```
🔴 Urgent Email Triage

ALL emails Edge classifies as urgent (score 70+) come here FIRST. You decide what reaches Dan.

For each urgent email, you'll see:
• Sender and subject
• Urgency score + why it's urgent
• The actual ASK (not just "urgent from Sequoia" but "John wants the metrics you promised")
• Thread summary (full conversation context)
• Relationship context from Knowledge Graph

Your options:
[Forward to Dan] — appears in his #dan-approvals
[Handle It] — you respond directly
[Dismiss] — logged but not forwarded

Example:
"🔴 URGENT — Score: 87
From: John Smith (MD, Sequoia)
Subject: Re: PortCo X Metrics
THE ASK: Send remaining metrics. Committee Tuesday.
CONTEXT: Dan promised Mar 28. 7-message thread over 3 weeks.
[Forward to Dan] [Handle It] [Dismiss]"

Dan never sees false positives. You're the filter.
```

#### #emily-scheduling
```
📅 Calendar Heartbeat

Every 30 minutes, I scan Dan's calendar for changes. New or modified events show up here for your review.

What you'll see:
• New events Emily or Dan added → I suggest enrichment (travel time, parking, links)
• Missing video links on virtual meetings → I flag them
• Scheduling conflicts → I recommend which meeting to move (based on your ranking rules)
• Travel time calculations with GPS directions

Example:
"📅 New event detected:
'Lunch with Sarah Chen' — Tuesday 12:00 PM
📍 Frasca Food & Wine, Boulder

I can add:
✓ Travel time: 15 min from office
✓ Parking: Street parking on Pine St
✓ Return travel: 15 min block
[Approve All] [Modify] [Skip]"

If I don't have enough info, I'll ask instead of guessing.
```

#### #emily-drafts
```
✉️ Email Drafts

When Edge drafts emails in Dan's voice, they show up here for your review before sending.

Sources:
• Nightman overnight draft follow-ups (overdue items)
• Dan's requests ("draft a reply to John")
• Action item follow-ups

For each draft you'll see:
• Who it's to (preferred email + EA CC if applicable)
• The draft text in Dan's voice
• Why it was drafted (context)

Your options:
[Approve — Send] [Edit] [Reject]

Hyperlinks are always included. Formatting is always full-width. EA is always CC'd when known. These are Dan's rules from your meeting.
```

#### #emily-contacts
```
👥 Contact Enrichment

Every morning at 5:00 AM (30 min before your briefing), overnight enrichment results land here.

Grouped by confidence:
• HIGH (90%+): title changes, new tags — likely correct
  [Approve All High] [Review Each]
• MEDIUM (70-89%): worth a look
  [Approve] [Reject] per item
• NEEDS INPUT (<50%): I'm not sure
  [Answer] or [Skip]

Example:
"HIGH CONFIDENCE (5 items):
✓ John Smith: title Partner → MD (LinkedIn, 0.94)
✓ Sarah Chen: added 'climate tech' interest (transcript, 0.91)
[Approve All High-Confidence]

NEEDS INPUT (1 item):
❓ 'J. Smith' — same as John Smith? 0.45 confident
[Yes — Merge] [No — Keep Separate]"

This system learns. Eventually high-confidence items will auto-approve (you control when).
```

#### #emily-actions
```
📋 Action Items & Approvals

After meetings are processed, action items show up here. Also: Notion write approvals and operational tasks.

What you'll see:
• Extracted action items with owners (who should do this?)
• Items Edge is confident about: [Approve] [Edit] [Reject]
• Items Edge is NOT confident about: ownership unclear, needs your input
• Notion write approval requests (from oversight agent)

Example:
"📋 3 items from 'Series B Discussion':

1/3: Send PortCo X metrics to John
  Owner: Dan ✓ (confidence 0.95)
  Due: Fri Apr 4 | Priority: High
  [Approve] [Edit] [Reject]

2/3: Prepare board deck scenarios
  Owner: Connor ✓ (confidence 0.92)
  [Approve] [Edit] [Reject]

3/3: Pull comparative market data
  Owner: ❓ UNCLEAR (confidence 0.30)
  Connor or Gibson could do this.
  [Assign Connor] [Assign Gibson] [Assign Dan]"
```

#### #security-council
```
🛡️ Security Council

Every night at 3:30 AM, four AI security personas audit Edge's system. Results posted here.

Personas:
1. Offensive Security — thinks like an attacker
2. Defensive Security — checks protection controls
3. Data Privacy — hunts for PII exposure
4. Operational Realism — filters false positives

You'll see: severity counts, new findings, and critical alerts (critical alerts are IMMEDIATE — not batched).

Example:
"🛡️ Security Council Report #47
🔴 Critical: 0 | 🟠 High: 1 | 🟡 Medium: 3 | 🔵 Low: 2
New findings: 2 | Dismissed: 4

🟠 HIGH: npm package 'lodash' has CVE-2026-1234
  Recommendation: Update to 4.17.22
  [View Details]"
```

#### #system-health
```
⚙️ System Health

Errors, failures, and operational status for Edge's infrastructure.

What posts here:
• LaunchAgent failures (any scheduled task that crashes)
• Git sync conflicts
• Backup completion/failure
• Knowledge Graph errors (Docker, Neo4j)
• Transcript pipeline status
• API connectivity issues
• Disk space warnings

This is the "something went wrong" channel. If everything is working, it's quiet.

Example:
"⚠️ LaunchAgent failure: com.edge.email-intel
Exit code: 1 | Error: ANTHROPIC_API_KEY invalid
Last success: 2 hours ago
[View Logs] [Restart]"
```

#### #nightman-emily
```
🌙 Nightman — Emily's View

Your view of what Nightman worked on overnight, specifically items that need your action.

What you'll see:
• Draft follow-up emails awaiting your review (overdue items)
• Contact enrichment results pending approval
• Calendar enrichment applied (travel time, parking added)
• Items that are blocked and need your input

This arrives ~5:00 AM, 30 min before your briefing.

Example:
"🌙 Items for your review:

DRAFTS (3 follow-ups):
1. LP capital call — Dan hasn't responded in 3 days [Review Draft]
2. Sarah @ Foundation — Sundance invite [Review Draft]
3. Vendor invoice — needs signature [Review Draft]

CALENDAR:
✓ Added travel time to 2:00 PM meeting (25 min)
✓ All virtual meetings have Meet links

CONTACTS:
5 enrichments pending your review in #emily-contacts"
```

### Emily's Forwarding to Dan

When Emily taps [Forward to Dan] on any item, Edge:
1. Reformats for Dan's concise style (strips operational details)
2. Posts to the appropriate Dan topic (#dan-approvals or project topic)
3. Adds Emily's note if she typed one
4. Logs the forwarding action

Example — Emily forwards an urgent email:
```
In #emily-urgent, Emily taps [Forward to Dan] on John's email.

In Dan's #dan-approvals:
"📧 Forwarded by Emily:
From: John Smith (Sequoia)
Emily's note: "This is real — committee is Tuesday. He needs the metrics."
THE ASK: Send remaining PortCo X metrics
[Reply] [Remind Me Tomorrow] [Emily — Handle It]"
```

## What Gets Installed

| Component | Path | Purpose |
|-----------|------|---------|
| Group setup guide | `docs/telegram-setup-guide.md` | Create both groups, add Edge as admin |
| Topic creation + welcome messages | `scripts/telegram-setup-topics.js` | Creates all topics, posts + pins welcome messages |
| Welcome message templates | `config/telegram-welcome-messages.json` | All welcome messages above, templated for variable substitution |
| Project creator | `scripts/telegram-new-project.js` | "Hey Edge, new project" → topic + welcome message + agent team |
| Topic registry | `config/telegram-topics.json` | All topic thread IDs |
| Routing config | `config/telegram-notifications.json` | Skill → topic mapping |
| Forwarding handler | `scripts/telegram-forward-to-dan.js` | Emily taps [Forward to Dan] → reformats + posts to Dan's topic |
| Reboot check | Nightman system health | Verify requireMentions=false every cycle |
| TOOLS.md | `TOOLS.md` | create_project, list_topics, post_to_topic, forward_to_dan |

## Cost

$0/month.

## Testing

| Phase | What | Target |
|-------|------|--------|
| T1 | Create both supergroups | Telegram |
| T2 | Edge bot admin in both | Telegram |
| T3 | Run topic creation → verify all topics + welcome messages pinned | Both groups |
| T4 | Read every welcome message → verify examples are accurate and helpful | Manual review |
| T5 | Post test message to every topic → verify delivery | Both groups |
| T6 | Inline keyboard → tap approve → verify callback | Test topic |
| T7 | Urgent email → #emily-urgent → Emily taps [Forward to Dan] → verify appears in #dan-approvals | Both groups |
| T8 | New project creation → topic + welcome message | Dan's group |
| T9 | requireMentions: false → type without @Edge → Edge responds | Both groups |
| T10 | Full routing audit: every skill → correct topic | Cross-check |
| T11 | Dan notification check | Dan's phone |
| T12 | Emily notification check | Emily's phone |

## Dependencies

Deploys FIRST. Every messaging skill depends on this.
