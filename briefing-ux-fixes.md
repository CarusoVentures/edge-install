# Briefing UX Fixes Needed

Based on Ryan's review of the test group output (April 6, 2026).

## Screenshot Feedback

### Dan's Brief
- Too short and compressed — the glanceable status is good as a HEADER but the full enriched briefing needs to be below it
- Needs the project-grouped meeting context we saw in the v4 dry-run
- Should include a visual calendar view of the day (timeline format)
- The glance + AI insight approach is right but the AI needs to produce more substance (the v4 output was better than v5)

### Emily's Brief
- Still arrives as one massive text block — the hub-and-spoke design was discussed but NOT implemented
- Need to implement: hub message with summary + drill-down buttons
- Each drill-down (calendar, tasks, emails) should be a SEPARATE message Emily can navigate
- Calendar should show a visual timeline, not just a text list
- Follow-ups and suggestions have no "do it" buttons — Emily can't tell Edge to act
- Needs: [Edge, follow up] [Edge, fix this] [Edge, schedule this] buttons

### Task Cards
- Too many individual cards (7 sent) — overwhelming
- Gray buttons are hard to distinguish — need emoji in button text for visual weight
- "Forward to Dan" on every card adds noise
- Need: [✅ Edge: Do it] [✏️ Edit] [⏭️ Skip] [📤 Dan] as the action set

### Button Styling (Telegram Limitation)
- All buttons are gray — can't change colors
- Fix: Use emoji prefixes to create visual distinction:
  - ✅ for approve/confirm actions
  - 📤 for forward actions
  - ✏️ for edit actions
  - ⏭️ for skip
  - 🔴 for urgent/reject
  - 📅📋📧 for drill-down sections

## Implementation Plan

### Phase 1: Emily Hub Message
Replace the 6000-char text with a short hub:
```
Good morning, Emily. Monday, April 6.
━━━━━━━━━━━━━━━━━━━━
📅  5 meetings  ·  3 QA issues
☑️  8 tasks  ·  1 due today  ·  2 stale
📬  No new threads
━━━━━━━━━━━━━━━━━━━━
⚠️  4 items need attention

[📅 Calendar (3)]  [☑️ Tasks (1 due)]
[📬 Email]         [🌙 Overnight]
[✅ Looks good — send to Dan]
```

### Phase 2: Drill-Down Spokes
Each button sends a NEW message with that section's detail + action buttons.
Emily controls pace. She can skip sections.

### Phase 3: Dan's Full Briefing
Combine glance header + full AI briefing (like v4 produced) + visual calendar:
```
🟡 Monday, April 6 — 4 items need attention

📅 TODAY'S SCHEDULE
━━━━━━━━━━━━━━━━━━
 9:00  HBOT (22 min drive)
12:00  Sina Simantob lunch (Highland City Club)
 3:00  Danny weekly (Video)
 4:30  Chris Erickson - Ensuring CO (Zoom)
 7:00  Nuggets vs Blazers (Ball Arena, 34 min drive)

[AI enriched context — 2-3 paragraphs connecting
meetings, tasks, emails by project]

☑️  8 tasks · 1 due today
📬  Inbox clear
━━━━━━━━━━━━━━━━━━━━
Prepared by Emily · 5:34 AM MT
```

### Phase 4: Actionable Task Cards
Replace current "Forward to Dan" only cards with:
```
📋 Ade Patton Follow Up
Priority: High | Owner: Joe Hovancak
No deadline set

[✅ Edge: Follow up] [✏️ Edit draft] [⏭️ Skip]
[📤 Forward to Dan]  [🗑️ Close task]
```
"Edge: Follow up" = Edge drafts and sends the follow-up email.
