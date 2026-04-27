# Edge Family Module

Structurally-separated personal-family storage for the Edge agent. Loaded from Dan's Ancestry.com GEDCOM; extended organically as Edge captures facts from conversation (gift preferences, life events, residence updates).

## Invariants (load-bearing)

1. **Separate from business CRM.** Data lives in `~/.openclaw/workspace/family/data/family.db`. The business CRM at `~/.openclaw/workspace/crm/data/crm.db` is NEVER modified by this module. Linking to business-CRM rows (for the few family members who are also in Notion) happens via the `crm_link` table here.

2. **Never synced to Notion.** The defense is structural: no code path from `family.db` to Notion exists. Belt-and-suspenders: `lib/notion.js::enforceLocalOnly()` would refuse a write anyway. If you find yourself writing code that reads from `family.db` and calls a Notion API, stop — reconsider.

3. **Neo4j label namespace.** Family nodes are `:FamilyPerson` (NOT `:Person`). Relationships are `:FAMILY_PARENT_OF`, `:FAMILY_SPOUSE_OF`, `:FAMILY_SIBLING_OF`. Business-graph queries over `:Person` / `:KNOWS` / `:MET_AT` never cross into family data.

4. **Access gated by `as_agent` allowlist.** The `EDGE_FAMILY_AGENTS` env var on `com.edge.mcp-server.plist` lists which agent identifiers can call `edge.family.*` tools. Default: `dan-primary,dan-mobile,dan-briefing`. Add more family agents by appending to this list and restarting edge-mcp. This is tool-scope, not security.

## Layout

```
family/
├── data/
│   ├── schema.sql            # Source of truth for the schema
│   └── family.db             # SQLite (created by applying schema.sql)
├── scripts/
│   └── ingest_to_edge.js     # GEDCOM JSON → family.db + Neo4j
└── README.md                 # (this file)
```

Related code elsewhere:
- `~/.openclaw/workspace/mcp/edge-mcp.js` — registers `edge.family.*` MCP tools
- `~/.openclaw/workspace/mcp/lib/family.js` — backs those tools (queries family.db + Neo4j)
- `~/.openclaw/workspace/lib/family-intel.js` — briefing + nightshift helpers
- `~/.openclaw/workspace/lib/family-capture.js` — trigger-phrase classifier for fact capture
- `~/.openclaw/workspace/lib/dossier-builder.js` — includes family profile as 5th source

## Tables (see `data/schema.sql` for full DDL)

- **`family_members`** — one row per person from GEDCOM. Shared across all family agents.
- **`crm_link`** — maps `family_members.id` → `crm.db:contacts.id` for dedup (the few family members also in Notion). Read-only from the family side; crm.db is not modified.
- **`family_facts`** — captured preferences/life events/wishes, with `owner_agent` attribution. Shared reads on a person's dossier; confirmation queue filters to owner.
- **`family_gifts`** — gift ledger, `owner_agent`-scoped (each family member has their own ledger by default).
- **`research_cache_meta`** — tracks last-researched timestamp per person for nightshift weighted round-robin.

## Operational runbook

**Re-ingest after GEDCOM re-export:**
```bash
# (1) Re-run parser in ~/Documents/Ancestry Information/
python3 scripts/parse_gedcom.py --gedcom "../Daniel Caruso family tree.ged" \
  --media-dir "../media" --out-dir "../data" --dan-gedcom-id <ID>

# (2) Dry-run ingest
node ~/.openclaw/workspace/family/scripts/ingest_to_edge.js --dry-run

# (3) Review data/ingest-report.json, then commit
node ~/.openclaw/workspace/family/scripts/ingest_to_edge.js

# (4) If records were DELETED in the new GEDCOM:
node ~/.openclaw/workspace/family/scripts/ingest_to_edge.js --prune-deleted
```

**Add a new family agent (e.g. Danny):**
```bash
# Edit ~/Library/LaunchAgents/com.edge.mcp-server.plist
# Add 'danny-primary,danny-mobile' to EDGE_FAMILY_AGENTS
launchctl unload ~/Library/LaunchAgents/com.edge.mcp-server.plist
launchctl load   ~/Library/LaunchAgents/com.edge.mcp-server.plist
```

**Full rollback (nuclear):**
```bash
node ~/.openclaw/workspace/family/scripts/ingest_to_edge.js --rollback
# crm.db is NEVER touched, so no business-side restore needed
```
