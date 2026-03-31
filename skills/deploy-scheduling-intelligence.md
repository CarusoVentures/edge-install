# Deploy Scheduling Intelligence

## Compatibility
- **OpenClaw Version**: 2026.3.27+
- **Status**: DRAFT
- **Layer**: 1 (Communication) — works alongside Calendar integration
- **Architecture**: Standalone Node.js + `gog` CLI (built-in OpenClaw calendar tool) + `goplaces` CLI (built-in OpenClaw places tool) + Google Maps Directions API + launchd 30-min heartbeat. Leverages existing OpenClaw tooling instead of building from scratch.

## Purpose

Install an intelligent scheduling engine that understands the difference between moveable and fixed meetings, automatically reschedules internal meetings when externals are booked, calculates travel time with live traffic data, and adds parking information to calendar events.

**Why this exists:** Emily's #1 pain point (2026-03-30 meeting). Current tools (Calendly, etc.) only see blank spots. Emily manually classifies which meetings can be moved, calculates drive times, looks up parking, and juggles overlapping requests. This is hours of manual work per week that follows clear rules an AI can learn.

**Why it's needed by other skills:**
- **Daily Briefing** reports scheduling status (moveable vs. fixed meetings, conflicts)
- **Nightman** uses the scheduling rules for overnight calendar enrichment
- **Meeting Prep** needs to know meeting types for dossier depth (external = full prep, internal = light)
- **Emily's approval flow** — scheduling changes route through Emily's Telegram for approval

**Core scheduling rules (from Emily):**
1. **Internal meetings** (Dan + Sabrina, Dan + Cody, Dan + Connor) — MOVEABLE unless explicitly marked time-sensitive
2. **External meetings** (anyone outside Crusoe Ventures) — FIXED, never auto-move
3. **When booking over a moveable meeting**: System must find a new time for the displaced meeting on both attendees' calendars, send the reschedule, and only then confirm the new external meeting
4. **Travel time**: Every in-person meeting needs a travel block before AND after. Use Google Maps Directions API with departure_time set to the actual meeting time for traffic-aware estimates. Use the more conservative estimate.
5. **Parking info**: For known locations, auto-add parking details to the travel time block description
6. **No overlapping events**: Dan's calendar must never show two events at the same time after scheduling completes

## What Gets Installed

1. **Meeting classification engine**: Rules-based + ML classifier for moveable vs. fixed. Reads attendee list, checks if all attendees are internal (Crusoe Ventures domain), checks for "time-sensitive" flag.
2. **Travel time calculator**: Google Maps Directions API integration. Calculates drive time for in-person meetings with traffic estimates. Caches common routes.
3. **Parking database**: JSON file of known venue parking info (manually seeded, enriched over time by Nightman).
4. **Rescheduling engine**: When a moveable meeting needs to move, finds the next available slot on all attendees' calendars and proposes the move to Emily for approval.
5. **Emily approval flow**: Telegram inline keyboard for scheduling changes. Emily approves → calendar updated. Emily rejects → operator notified.

## Shared Scheduling Rules

This skill shares `config/scheduling-rules.json` with Meeting Prep. Emily owns and approves the rules. The file contains:
- Internal people list with ranks (Dan=10, Sabrina=9, Cody=7, etc.)
- Meeting type rankings (external=100, internal time-sensitive=90, Dan+team=40, focus block=10)
- Topic-based overrides (closing=95, board=90, sync=30, etc.)
- Non-moveable hard rules (external attendees, [TS] flag, within 2 hours, already rescheduled)
- Conflict resolution: lower-ranked meeting moves, tie-break by later-scheduled

See `deploy-meeting-prep.md` for the full rules specification and Emily's approval flow.

## Built-in OpenClaw Tools Leveraged

| Tool | What | How We Use It |
|------|------|--------------|
| **`gog` CLI** | Google Calendar read/write via OAuth/Service Account | Read events, create travel blocks, detect conflicts, update events |
| **`goplaces` CLI** | Google Places API — location search | Parking lookup near meeting venues, restaurant search, venue details |
| **Google Maps Directions API** | Travel time with traffic | Time-of-day estimates, conservative routing, departure time calculation |
| **launchd** | Native macOS scheduling | 30-minute heartbeat to monitor calendar changes |

`gog` is already installed on Edge. `goplaces` needs installation: `brew install goplaces` + set `GOOGLE_PLACES_API_KEY` in .env.

## Calendar Heartbeat (30-Minute Monitor)

Every 30 minutes, Edge scans Dan's calendar for changes and enriches new/modified events:

```
Every 30 min via launchd:

1. Pull current calendar state via `gog calendar events list`
2. Compare against last-known state (SQLite cache)
3. For each NEW or MODIFIED event:
   a. Classify: internal vs. external (from scheduling-rules.json)
   b. Check: virtual? Has Meet/Zoom link? If not → flag Emily
   c. Check: in-person? Has travel block? If not → calculate + recommend
   d. Check: conflicts with existing events? → recommend resolution
   e. Send enrichment to Emily via Telegram:

      "📅 New event detected (added by Emily):
       'Lunch with Sarah Chen' — Tuesday 12:00 PM
       📍 Frasca Food & Wine, Boulder

       I can add:
       ✓ Travel time: 15 min from office (11:40 AM departure)
       ✓ Parking: Street parking on Pine St or Frasca valet
       ✓ Return travel: 15 min (1:30 PM block)

       [Approve All] [Modify] [Skip — I'll handle it]"

4. If Emily approves → create travel blocks + add parking to description
5. Update calendar state cache
```

**Key principle:** Edge enriches, Emily approves. Edge never modifies events without Emily's OK.

### What Triggers Enrichment

| Trigger | What Edge Does |
|---------|---------------|
| Emily creates a new event | Detect via heartbeat → classify → enrich → ask Emily to approve |
| Dan adds an event via Telegram | Same flow — detect, enrich, approve |
| Event location changes | Recalculate travel time + parking |
| Event time changes | Recalculate travel time (traffic changes by time of day) |
| New attendee added | Check if internal/external, update classification |
| Conflict detected | Recommend resolution using scheduling rules |

### What Edge Says When It Doesn't Know

```
"📅 New event: 'Meeting with TBD' — Wednesday 3:00 PM
 📍 No location specified

 I'm not sure about this one:
 ⚠ No location — is this virtual or in-person?
 ⚠ No attendees listed — can't classify internal/external
 ⚠ Can't calculate travel time without a location

 Emily, can you fill in the details?
 [Add Location] [It's Virtual — Add Meet Link] [I'll Handle It]"
```

Edge asks instead of guessing. If it doesn't have enough info, it flags and waits.

## Dependencies

- `gog` CLI (built-in OpenClaw tool — already installed on Edge)
- `goplaces` CLI (built-in OpenClaw tool — needs install + API key)
- Google Maps Directions API (for travel time with traffic — needs API key)
- Notion People DB (to determine if attendees are internal vs. external)
- Emily on Telegram (for approval flow)
- `config/scheduling-rules.json` (shared with Meeting Prep, approved by Emily)
- Notion Oversight Agent (for calendar write operations)

## Status

DRAFT — needs full implementation. High priority per Emily meeting. This is the scheduling system Emily has been doing manually.
