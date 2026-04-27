# Patch 06: Research enrichment batch (parallel ancestry research)

**File:** `~/.openclaw/workspace/family/scripts/research_batch.js` (new — copy from `family-tree/scripts/research_batch.js`)

Bulk-enriches every closeness ≤ 3 family member with a structured research profile (story, era context, place context, open questions, links, confidence) using parallel `claude -p` calls. Place context is cached (`place_research` table) so 64 Castel di Sangro descendants share one research call.

## What it produces

For each person, a `family_research` row containing:
- **story** (2-3 paragraph narrative grounded in family data + general history)
- **era_context** (1 paragraph about their lifetime — what was happening)
- **place_context** (1 paragraph about their location)
- **open_questions** (JSON array — gaps Dan can fill)
- **links** (JSON array of Wikipedia / reference URLs)
- **confidence** (0..1 self-rated)
- **model**, **generated_at**, **tokens** (provenance)

For each unique birth_place, a `place_research` row with cached era+place context (avoids re-researching Castel di Sangro 64 times).

## Strict grounding

The system prompt instructs Claude to:
- Write only **personal claims** that are explicit in the data (parents, kids, dates, places, occupation, GEDCOM notes)
- Use **general historical/cultural knowledge** for era and place context
- Write LESS rather than invent specifics
- Self-rate confidence honestly

## Architecture

```
Phase A: per-place research (parallel, Tavily web search optional)
   ↓
   place_research table (cached)
   ↓
Phase B: per-person research (parallel, uses cached place context)
   ↓
   family_research table
   ↓
edge.family.get returns the research field automatically (lib/family.js)
```

## CLI

```bash
# Dry-run (preview 5 outputs to a file, no DB writes)
node ~/.openclaw/workspace/family/scripts/research_batch.js --dry-run --limit 5

# Commit (full closeness ≤ 3, ~100 people)
node ~/.openclaw/workspace/family/scripts/research_batch.js --closeness 3 --concurrency 5

# Other flags:
#   --limit N         cap people processed
#   --closeness N     max closeness degree (default 3)
#   --concurrency N   parallel claude calls (default 3, up to 5 safe)
#   --no-web          disable Tavily place search (LLM-only)
#   --model NAME      override claude model (default 'sonnet')
#   --include-dan     include closeness=0 (Dan himself)
```

## Auth

Uses the user's Claude Code OAuth session (`claude -p`). No API key needed.
- Tavily key auto-loaded from `~/.openclaw/openclaw.json` (`channels.tavily.env.TAVILY_API_KEY` or wherever it's nested) — script searches recursively. Skip web with `--no-web` if absent.

## Cost

Approximate (Sonnet 4.6, OAuth pricing):
- Per-place research: ~$0.05 each × ~30 unique places ≈ $1.50
- Per-person research: ~$0.10-0.20 each × ~100 people ≈ $10-20
- **Full closeness ≤ 3 batch: ~$15-25**, ~5-10 minutes wall time

Scales linearly. For all 1,114 (use `--closeness 99 --limit 9999`): ~$150, ~1 hour.

## Surfaces in `edge.family.get`

After running, calling `edge.family.get({name: 'Rosario Caruso', as_agent: 'dan-primary'})` includes a `research` field:

```json
{
  "research": {
    "story": "Rosario Caruso was born in 1886 in...",
    "era_context": "Italy in the late 19th century...",
    "place_context": "Cook County, Illinois encompasses...",
    "open_questions": ["Where exactly within Cook County did Rosario settle?", ...],
    "links": [{"url": "...", "title": "Italian Americans in Chicago", "kind": "wikipedia"}],
    "confidence": 0.72,
    "model": "claude-sonnet-4-6",
    "generated_at": 1777309000
  }
}
```

The `family` skill (`~/.agents/skills/family/SKILL.md`) instructs the agent to use these fields directly when answering "tell me about X" / "who was X" — they're pre-grounded.

## Re-running

Idempotent at table level: each run writes a new row keyed on `(family_member_id, model)`. Re-running with the same model creates duplicates; re-running with a new model adds a parallel row. Only the latest row is surfaced via `edge.family.get`.

To wipe and re-research:
```sql
DELETE FROM family_research;
DELETE FROM place_research;
```
Then re-run the batch.

## Failure handling

Failures (typically JSON parse errors when the model wraps the response or truncates) are logged to `research-report.json` under `errors`. Re-run with `--limit` to retry — the script skips people who already have research rows... actually wait, the current script does NOT skip already-researched people. To retry only the failures, query by missing IDs first or wipe + redo. (TODO for v2: add `--skip-existing`.)

## Verification

```bash
sqlite3 ~/.openclaw/workspace/family/data/family.db "
  SELECT COUNT(*) AS researched FROM family_research;
  SELECT COUNT(*) AS places FROM place_research;
  SELECT ROUND(AVG(confidence), 3) FROM family_research;
"
```

Expected after closeness ≤ 3 run: ~99 researched, ~30 places, avg confidence ~0.7.
