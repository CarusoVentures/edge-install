---
name: family
description: Look up information about Dan's family tree — relatives, ancestors, birthdays, photos, captured preferences. Use whenever Dan asks about his family, a relative by name, who someone is related to, upcoming family birthdays, or anything genealogical.
tools:
  - exec
triggers:
  - family
  - family tree
  - relative
  - relatives
  - ancestor
  - ancestors
  - genealogy
  - cousin
  - uncle
  - aunt
  - grandfather
  - grandmother
  - grandparent
  - great-grandfather
  - great-grandmother
  - great-grandparent
  - my dad
  - my mom
  - my mother
  - my father
  - my sister
  - my brother
  - my niece
  - my nephew
  - who is my
  - whose birthday
  - family birthday
  - Caruso family
  - Lale family
---

# Family Tree

Use this skill whenever Dan asks about his family. The 1,114-person tree was loaded from his Ancestry.com export. Data lives in `family.db` (separate from business CRM) and is reachable via the `edge.family.*` MCP tools.

## When to use

- "Who is my great-grandfather Rosario?" / "Who is Aunt Mary?" → `edge.family.lookup` then `edge.family.get`
- "Whose birthday is coming up?" → `edge.family.upcoming_dates`. **If empty for `days=30`, ALWAYS retry with `days=90`** and report the next upcoming as "in N days". Don't tell Dan "no birthdays" without checking the wider window.
- "How am I related to Joe Caruso?" / "Who connects me to Federico Balzano?" → `edge.family.relationship`
- "Show me what I know about my grandfather" → `edge.family.get`
- **"Where are we from?" / "What's my ancestry?" / "What are my origins?" / "Are we Italian?" → `edge.family.origins` (NOT a guess from the surname).** Caruso is from Abruzzo (specifically Castel di Sangro), NOT Sicily — common assumption is wrong. Always check the data.
- "Remember that Aunt Mary moved to Denver" / "Uncle Joe loves single-malt" → `edge.family.facts.add` (or capture_from_message)
- "I gave Mom a cashmere throw last Christmas" → `edge.family.gift.log`

## Critical rules

- **`as_agent` is required.** Pass your agent identifier — typically `dan-primary` (Dan's main agent), `dan-mobile`, `dan-briefing`, `ryan-primary`, or `ryan-testing`. The tools refuse calls without a valid `as_agent` (out_of_scope).
- **Do NOT call `edge.contacts.lookup` for family questions.** That hits the business CRM (Notion-sourced contacts). Family is its own database.
- **Do NOT push family records to Notion.** The Notion write guard will refuse, but don't try in the first place. Family data is private to Dan's household.
- **For lookups by relation ("my dad"), translate to a name first.** Dan = Daniel Phillip Caruso (gedcom_id `I46106454245`). His parents are Robert Mario Caruso + Penelope Louise Lale Caruso. Use `edge.family.lookup` if unsure of exact name spelling.

## Tool quick reference

| Tool | Use when |
|---|---|
| `edge.family.lookup(query, limit?, as_agent)` | Fuzzy name search → list of candidates with closeness + relation |
| `edge.family.get(gedcom_id OR name, as_agent)` | Full dossier — vitals, parents/spouse/children/siblings, captured facts, photos |
| `edge.family.upcoming_dates(days?, max_closeness?, as_agent)` | Birthdays in next N days, closeness-gated. Default days=30, max_closeness=3. **If empty, retry with days=90 before reporting "no birthdays".** |
| `edge.family.relationship(person_a, person_b, as_agent)` | Shortest path between two relatives |
| `edge.family.origins(min_count?, max_closeness?, as_agent)` | Ancestral place aggregation — answers "where are we from" / ancestry origin questions. Returns by_country breakdown + raw places. |
| `edge.family.facts.add(gedcom_id, fact_type, fact_text, ..., as_agent)` | Save a captured preference / life event / wish |
| `edge.family.gift.log(gedcom_id, occasion, year, item, as_agent)` | Record a gift to prevent repeats |
| `edge.family.capture_from_message(message, queue?, as_agent)` | Run trigger-phrase classifier on a message |

## Closeness degree → priority

| Degree | Relationship | Priority |
|---|---|---|
| 0 | Dan himself | n/a |
| 1 | Parents, spouse, children, siblings | Very High |
| 2 | Grandparents, in-laws, grandchildren, nieces/nephews, aunts/uncles | High |
| 3 | Great-grandparents, 1st cousins, great-aunts/uncles | Medium |
| 4+ | More distant ancestors / cousins | Low / null |

## What this skill does NOT do

- Cannot send messages to family members (no contact info — GEDCOM doesn't carry email/phone)
- Cannot push family records to Notion (privacy guard refuses)
- Does not auto-message Dan about family events yet — proactive briefing currently disabled
