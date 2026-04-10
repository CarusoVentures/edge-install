# Notion Persons Directory — Priority & VIP Column Audit

**For Emily & Dan to review**
**Date:** April 7, 2026
**Purpose:** Edge needs to know which columns determine how important a contact is. There are 71 priority/VIP-related columns. We need your help understanding which ones matter for Dan's day-to-day priority ranking.

**The problem:** When Dan asks "show me emails from high priority people," Edge currently only checks the `Dan Priority` column. But only 9% of contacts have that field set. Many important people (like Steve Cohen) have priority signals in OTHER columns (e.g., `Very High Net Worth`) but not in `Dan Priority`.

**What we need from you:**
1. Which columns should Edge use to determine a contact's importance to Dan?
2. Are some of these columns outdated or no longer relevant?
3. Should Edge compute an "overall priority" from multiple columns?

---

## GROUP 1: GENERAL PRIORITY (8 columns)
*These seem most relevant for Dan's day-to-day priority ranking*

| Column | Type | Possible Values | Edge's Question |
|--------|------|-----------------|-----------------|
| **Dan Priority** | multi_select | 1. Very High, 2. High, 3. Medium, 4. Low | This is our primary source. Only 9% of contacts have it set. Should we try to fill it from other signals? |
| **Meeting Priority** | multi_select | P1, P2, P3 | What do P1/P2/P3 mean? Is P1 = Very High? |
| **Ecosystem Priority** | multi_select | Very High ($25-50k Target), High ($15k Target), Medium-High ($10k Target), Medium ($5k Target), Low (Longshot $5k), N/A, Very High - Ecosystem Partner, High - Ecosystem Partner | Is this BRMF/fundraising specific, or general importance? |
| **ME Delegation Priority** | select | Very High, High, Medium, Low, TBD | What is "ME Delegation"? Middle East? Is this still active? |
| **Category** | multi_select | Tech (Other), University/Education, Quantum, Space, Elevate Quantum, Gaming, Endeavor, Misc, + more | Does category indicate importance, or just classification? |
| **Connection** | multi_select | Wendy Lea, Marc Lewis, Gaya Party Invite, Existing Relationship, Kevin O'Hara | Who introduced this person? Does the introducer affect priority? |
| ***Role Category** | multi_select | Tech Entrepreneur, Investor, Family Office, Business Executive, Civic Leader, Small/Local Business Owner, Journalist, Attorney, + more | Should "Investor" automatically be higher priority than "Journalist"? |
| ***Interests** | multi_select | Quantum, Space Tech, Sundance, BRMF, Colorado Politics, Boulder Politics, + more | Do interests affect priority? (e.g., "Sundance" = Dan cares) |

---

## GROUP 2: VIP / NET WORTH FLAGS (14 columns)
*These directly indicate high-value contacts*

| Column | Type | Possible Values | Edge's Question |
|--------|------|-----------------|-----------------|
| **Investor VIP** | select | 1. Very High, 2. High, 3. Medium, 4. Low, 5. Unclear, 6. Very Low | Should this feed into overall priority? Seems very relevant. |
| **High Net Worth** | checkbox | Yes / No | Does HNW = automatically High priority? |
| **Very High Net Worth** | checkbox | Yes / No | Does VHNW = automatically Very High priority? (Currently we treat it this way) |
| **High Net-worth Individuals** | multi_select | High Net-worth Low Priority Target, High Net-worth Not Previously in CV's Database, High Net-worth High Priority Target | "High Priority Target" seems important — should this override? |
| **HNW Classification** | select | 1. Ultra High (>$100m), 2. Very High (>$10m), 3. High (~$10m), 4. Not Assessed | Should Ultra High ($100m+) = Very High priority? |
| **VIP Type** | select | HNW Individual, Venue Partner, Corp Sponsor, Influencer, Creative Partner, Other, Festival/Music Professional, HNW/Corporate, + more | Does VIP Type indicate general importance or just BRMF context? |
| **Tiers** | select | 1. High (Golden/Platinum), 2. Medium (Gold/Silver), 3. Smaller (Silver/Bronze), 4. Committed, 5. Not a Donor, 6. TBD | Is this donor tier? Does it affect Dan's priority? |
| **2025/2026 Founder Tier** | select | Visionary ($50k), Champion ($25k), Luminary ($15k), Ambassador ($10k), Collaborator ($5k), Connector ($2.5k), + more | Are Founder Tier contributors automatically VIP? |
| **2025 VIP Outreach** | select | Committed $50k, Committed $35k, + many more | Is this BRMF-specific or general? |
| **2025 Funnel Stage** | select | Founder Confirmed, Special Guest, CV Attendee, + many more | BRMF funnel or general? |

---

## GROUP 3: EVENT-SPECIFIC PRIORITY (24 columns)
*These are tied to specific events — may be relevant seasonally*

| Column | Type | Values Example | Event |
|--------|------|---------------|-------|
| **BRMF Priority** | multi_select | Very High → Very Low | Boulder Roots Music Festival |
| **BRMF Ecosystem Priority** | multi_select | Very High → Very Low | BRMF ecosystem partners |
| **2026 BRMF Priority** | multi_select | Very High ($25-50k Target) → Low | BRMF 2026 specifically |
| **Game Priority** | select | 1. Very High → 5. Very Low | Nuggets/sports games |
| **Dinner Priority** | multi_select | P1, P2, P3 | Dinner events |
| **KOH Priority** | multi_select | 1. Very High → 4. Low | Kevin O'Hara events? |
| **Priority - Sundance Reception** | multi_select | Priority 1A (CV) → Plus One | Sundance Film Festival |
| **Priority - KPMG Games** | select | Very High → Low | KPMG games event |
| **Women's Event Priority** | multi_select | 1. Very High → 5. Very Low | Women's events |
| **Young Leaders Priority** | multi_select | Very High → Very Low | Young leaders program |
| **DEN AI VIP** | select | 1. Very High → 5. Very Low | Denver AI event |
| **CSW VIP** | select | Tier tiers (01: Top ~10 → Tier Eight) | CSW event |
| **EO Priority** | select | Very High, High | Entrepreneurs' Organization |
| + 11 more event-specific columns | | | Various events |

**Question for Emily:** Should event-specific priorities affect Dan's GENERAL priority ranking? For example, if someone is "Very High" for BRMF but not tagged elsewhere — does Dan consider them important overall?

---

## GROUP 4: DAN'S APPROVALS & NOTES (19 columns)
*These track Dan's direct input on contacts*

| Column | Type | Notes |
|--------|------|-------|
| **Dan Approved** | checkbox | Dan personally approved this contact |
| **Dan Approved VIP Priority** | checkbox | Dan approved their VIP status |
| **Dan Comments** | rich_text | Dan's personal notes about the person |
| **Dan Reachout** | multi_select | Track Dan's outreach (Note Sent, RSVPd, etc.) |
| **Dan's Approval to Invite** | select | 10. Preferred Invite → 50. Don't Invite |
| + 14 more approval columns | | Various approval tracking |

**Question:** If Dan has personally approved someone (`Dan Approved: Yes`) or written comments about them, should that boost their priority?

---

## GROUP 5: NEWSLETTER / EMAIL LIST (6 columns)
*Probably not relevant for priority ranking*

| Column | Type | Notes |
|--------|------|-------|
| Mail Chimp Priority | select | Very High → Low, Already Have Email |
| VIP Newsletter 1/2 | select | Newsletter subscription status |
| Dan Approved Newsletter | checkbox | Dan approved newsletter inclusion |

---

## What Edge Currently Uses

Edge computes an "effective priority" from:
- `Dan Priority` (explicit — most authoritative)
- `Very High Net Worth` checkbox
- `High Net Worth` checkbox
- `Investor VIP` rating
- `Meeting Priority` rating
- `Ecosystem Priority` rating
- `VIP Type`

**What's missing that might matter:**
- `HNW Classification` (Ultra High >$100m)
- `Game Priority` (if Dan uses games for relationship building)
- `Dan Approved` checkbox
- `Dan Comments` (if Dan wrote about them, they matter)
- Event-specific priorities (BRMF, Sundance, etc.)

---

## Action Items

1. Emily/Dan: Review the 5 groups above and tell Edge which columns matter for GENERAL priority
2. Emily/Dan: Are there contacts that Dan considers "Very High" but aren't tagged anywhere? Edge should proactively ask about untagged contacts.
3. Emily: Which of these 71 columns are outdated and can be ignored?
