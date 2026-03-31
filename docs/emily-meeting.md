# Meeting: Emily (Dan's EA)
**Date:** March 30, 2026, 11:32 AM – 12:27 PM MDT
**Location:** Coffee shop near Crusoe Ventures office, Boulder
**Attendees:** Ryan Shuken, Emily (Dan's executive assistant)
**Format:** In-person working session

## Purpose
Gather detailed requirements from Dan's EA for AI automation. Emily manages Dan's calendar, scheduling, email drafting, contact management, and personal admin. She's the human-in-the-middle who filters noise before it reaches Dan.

## Key Insights

### Emily's Role as Human Filter
- Emily currently reviews everything before Dan sees it
- She catches errors in AI-drafted emails (formatting, wrong email addresses, missing CCs)
- She knows which meetings can be moved and which can't
- She knows preferred email addresses and EA CC rules for contacts
- **For the AI system: Emily should be an approval layer between Edge and Dan for operational items**

### Contact Enrichment (Top Pain Point)
- Every meeting requires contact updates — new ventures, interests, tags
- Tags needed: investor, tech entrepreneur, interests (Sundance, music, politics, etc.)
- Currently fights with ChatGPT/Claude to do LinkedIn lookups — they can't access LinkedIn
- Needs to happen automatically after every meeting, not manually
- Not just new people — existing contacts need updates every time they're met

### Email Drafting Problems
- Dan uses Claude directly to draft emails but:
  - No hyperlinks in emails that need them
  - Formatting is "shit" — narrow column width, looks bad
  - Sends to wrong email when contact has multiple addresses
  - Doesn't CC the contact's EA (which is basically always needed)
- Need: preferred email selection per contact, auto-CC EA rules, proper HTML formatting
- Long-term: train the system to learn Dan's writing voice and stances

### Scheduling Intelligence
- Internal meetings can be moved; external cannot
- Meeting hierarchy: Dan + Sabrina (moveable) vs. external investor meeting (fixed)
- When booking over a moveable meeting, system should auto-reschedule it
- Need live traffic-based travel time blocks before/after in-person meetings
- Need parking info added to travel time blocks
- Can't have overlapping events on Dan's calendar

### Nightly "Nightman" Processing
- Overnight enrichment runs: LinkedIn, contacts, calendar events, projects
- Calendar integrity check every night: Google Meet links, travel time, parking info
- Research and proactive recommendations while Dan sleeps
- Cheaper API tokens at night

### Reporting/Briefings (Critical for Daily Briefing skill)
- Dan wants: SHORT, CONCISE, NEED-TO-KNOW ONLY
- Action items for things that didn't happen / need follow-up
- "Here's a draft email to follow up" is high value
- Emily does NOT need to see investment team briefings
- Emily SHOULD review emails, scheduling, and operational items before Dan

### Personal/Stretch Goals
- House reservation management (Beaver Creek, Cabo) — calendar, approvals, comms
- Golf tournament registration + partner matching
- Family integration events with Crusoe team
- Caruso Foundation grant tracking (manual today, should be automated)
- Quarterly board decks in narrative format (both NextGen and Foundation)
- Estate planning (less defined, Kylie who handled it left last week)
- Dinner reservations (voice cloning discussed)
- Travel booking: NetJets hours tracking + Fly1200 fallback via James Lovett

### Notion Concern
- Dan shifting from Notion to web portals for some workflows (e.g., Boulder Roots Music Fest sponsor portal)
- Emily worried about investing time in Notion if Dan moves away from it
- AI system needs flexibility to work with both Notion and web portals

## Impact on Existing Skills

| Skill | Change Needed |
|-------|--------------|
| Daily Briefing | Add Emily as approval layer. Dan only gets concise need-to-know. Follow-up drafts are high value. |
| Email (Himalaya) | Add preferred email + EA CC rules per contact. Proper HTML formatting. |
| Personal CRM | Add interest tags, auto-enrichment after meetings, LinkedIn research capability |
| Meeting Prep | Already aligned — but add scheduling intelligence (moveable vs. fixed meetings) |
| Action Items | Already aligned — Emily should review before Dan for operational items |
| NEW: Nightman | Overnight processing system for enrichment, research, proactive recommendations |
| NEW: Scheduling | Intelligent scheduling with meeting hierarchy, travel time, parking info |

## Action Items from Meeting
- [ ] Set up Emily on Telegram for bot interaction and approvals
- [ ] Deploy meeting prep with Notion enrichment + transcript integration
- [ ] Build contact auto-tagging system (replace manual LinkedIn research)
- [ ] Create intelligent scheduling with moveable vs. fixed meeting classification
- [ ] Implement nightly "Nightman" enrichment for calendar and contacts
- [ ] Design concise, action-oriented reporting format (noise reduction)
- [ ] Add travel booking integration (NetJets hours + Fly1200 fallback)
- [ ] Document stretch goals: house reservations, golf, foundation, board decks
- [ ] Schedule follow-up with Dan to confirm priorities

## Quotes
- Emily: "I'm so excited about it — it's going to completely change the way we do everything"
- Emily on reports: "Make it as short and concise as possible, really only the need to know"
- Emily on email: "The formatting is shit... he'll email the wrong email, or not CC their EA"
- Emily on contacts: "A dummy could do it, but it takes time and needs to be done"
- Ryan: "We're not going to trust it at all... everything is human-in-the-middle to start"
