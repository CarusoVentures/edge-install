# Notion Persons Directory Audit

**Date:** March 30, 2026
**Database:** Persons Directory (100bbced-0aa8-4135-9104-777c2f5e2e10)
**Total Properties:** 351
**Source:** Live API query via Edge device exec

## The Problem

Emily (Dan's EA) described this in the March 30 meeting: "It has so many fields that have just been compiled and compiled over the years. Every time we plan an event, we make five new properties." She wants to archive old event properties but keep the data.

## Property Breakdown by Type

| Type | Count | Examples |
|------|-------|---------|
| Checkbox | 90 | Avs Invite, Game Invite, Senator Bennett Dinner, CU Demo Day Invite, Zayo Party, etc. |
| Multi-select | 77 | BRMF Priority, Industry, Interests, Role Category, Newsletter distros, event categories |
| Select | 86 | Invite statuses, Dan approvals, funnel stages, VIP tiers, event-specific selects |
| Rich text | 42 | Dan Comments, Context, Exec Summary, event notes, next steps |
| Number | 25 | Guest counts, ticket allocations, sponsor amounts, raffle entries |
| Relation | 15 | Company, EA/Executive, Spouse, Board Member, Introduced By |
| Date | 6 | Last Touchpoint, Publish Date, Interview Scheduled |
| Email | 2 | *Email 1, Email 2 |
| Phone | 2 | *Phone 1, Phone 2 |
| URL | 1 | *LinkedIn or Bio |
| Title | 1 | Name |
| People | 3 | Owner, Invited by?, [Temp] Assigned to |
| Created time | 1 | Created time |

## Triage Categories

### CORE (Keep — map to CRM) — ~25 properties

These are the permanent contact fields that every other skill depends on:

- **Name** (title)
- ***Email 1**, **Email 2** (email)
- ***Phone 1**, **Phone 2** (phone)
- ***Company** (relation to Company Directory)
- ***LinkedIn or Bio** (url)
- ***Context** (rich_text — freeform contact context)
- ***Exec Summary** (rich_text)
- ***Interests** (multi_select — Sundance, music, politics, etc. This is Emily's interest tagging)
- ***Role Category** (multi_select — investor, tech entrepreneur, etc.)
- **Industry** (multi_select)
- **Dan Comments** (rich_text)
- **Dan Priority** (multi_select)
- **Last Touchpoint** (rich_text)
- **Last Touchpoint (date)** (date)
- **Next Touch Point** (rich_text)
- **CV Next Step** (rich_text)
- **Owner** (people)
- **Created time** (created_time)
- **EA / Executive** (relation — this is how they track who has an EA!)
- **Spouse / Sig Other** (relation)
- **Introduced By** (relation)
- **Board Member** (relation)
- **Board Observer** (relation)
- **Parent / Child** (relation)
- ***Dan LinkedIn Connection?** (multi_select)
- **Company Name** (rich_text — text version of company, may differ from relation)

### NEWSLETTER/OUTREACH (Keep — useful for email skill) — ~10 properties

- ***BRMF Founder Newsletter**, ***BRMF General Newsletter**, ***CV Newsletter** (multi_select)
- ***Engage Newsletter** (select)
- **Mail Chimp Priority** (select)
- **Pending BRMF Newsletter**, **Pending CV Newsletter**, **Pending Engage Newsletter** (checkbox)

### EVENT-SPECIFIC (Archive — 200+ properties)

These are one-time event properties that accumulate. Emily wants them archived, not deleted. Examples:

**Checkboxes (events attended/invited):**
- Avs Invite, Game Invite, July 24th Event, Senator Bennett Dinner Oct 13th
- CU Demo Day Invite (+ two duplicates), Colorado Road Show
- Howdy Partner Garts Event, Datacloud Panel, Polsky Center
- Zayo / LVLT Party, 60th BDay related, Cabo EOY
- Welcome Bag Delivered, Park at Hermosa, Bag Created

**Selects (invite/approval status per event):**
- Invite Status (BDT&MSD Wealth Transfer Dinner), Dan's Approval to Invite
- EQ RT 5/1 - Denver, EQ RT: 4/12 - Denver, EQ RT: 5/6 - Boulder
- OQF Attendance, OQF Category, OQF Dan approval, OQF Invite Tier
- Sundance Interest, VIP: Middle East Roadshow, Gaya Fundraiser
- Mayor Mike Event 6/3/2025, Priority - KPMG Games

**Numbers (event logistics):**
- # of Attendees to Opening Night, # of Full Access Passes
- # of Guest Passes, # of Parking Spaces, # of Raffle Entries
- Hat Coupons, Opening Night Guests, Number of Games

**Multi-selects (event categories):**
- CSW Panel, CSW Category, DEIB Hiring Event Priority
- Boulder BW Event, Bandwidth PR, Bennet Tech Dinner
- DEN AI, DEN AI Topic, KOH Priority, Women's Event Priority

### TEMP/CLEANUP (Delete or resolve) — ~10 properties

- [TEMP] Done (checkbox)
- [TEMP] Updated (checkbox)
- [TEMP] PD Task Nov '25 (multi_select)
- [Temp] Assigned to (people)
- BW Duplicate (checkbox)
- RocketReach Needed? (checkbox)
- Pending Tagging (checkbox)
- Pending Dan's Review (checkbox)
- Update Contact Info (checkbox)

## Key Findings

1. **~200 of 351 properties are event-specific** — accumulated over years, one-time use. These are the ones Emily wants archived.

2. **Core contact data is clean** — Name, Email, Phone, Company, LinkedIn, Context, Interests, Role Category are well-structured and consistently named (marked with * prefix for importance).

3. **EA/Executive relation exists** — This is how they track which contacts have an EA. Critical for the "always CC the EA" rule Emily mentioned.

4. **Interests multi-select exists** — This is the interest tagging system Emily manually maintains (Sundance, music, politics, etc.). The CRM should read these and the Contact Auto-Enrichment skill should write to them.

5. **Multiple "Dan Comments" fields** — Dan Comments (rich_text), Dan Comments BW Events, Dan's Feedback, Dec 30 2024, Dan Approved, Dan Priority. Context is scattered across multiple fields.

6. **10+ BRMF Directory duplicates** exist as separate databases — suggesting attempts to reorganize that were abandoned.

7. **Company Directory has 113 properties** — likely the same accumulation problem. Needs its own audit.

## Recommended Approach for CRM

1. **Map CORE properties** to SQLite schema (expand from 5 tables to handle relations)
2. **Preserve EVENT data** in a separate `event_participation` table or JSON blob — don't lose it, but don't pollute the clean CRM schema
3. **Handle the EA relation** — map to `ea_email` and `ea_name` fields in contacts table
4. **Sync Interests multi-select** bidirectionally — CRM reads tags from Notion, Contact Auto-Enrichment writes new tags back
5. **Consolidate Dan's comments** into a single `dan_notes` field in CRM, merging from multiple Notion sources
6. **Present EVENT properties to Emily** for triage — she decides what to archive vs. keep

## Related Databases

| Database | Properties | Notes |
|----------|-----------|-------|
| Persons Directory | 351 | Main contact database — this audit |
| Company Directory | 113 | Needs separate audit |
| BRMF Directory | 37 | Boulder Roots Music Fest specific |
| BRMF Directory (1) x10 | 32 each | Duplicates — cleanup needed |
| Task, Inquiry, Discuss | 10 | Clean, usable as-is |
| Newsletter imports | 3-22 | Bulk imports, may have contacts not in main DB |
| Creators at the Edge | 30 | Event-specific directory |
