# Deploy Family Tree (Dan's private genealogy module)

## Compatibility
- **OpenClaw Version**: 2026.4.15+
- **Status**: SHIPPED 2026-04-24 (test posture: route to Ryan first, Dan opt-in later)
- **Layer**: Application — depends on layer-0 + edge-mcp + CRM
- **Architecture**: Structurally-separate SQLite (`family.db`) + reserved Neo4j label namespace (`:FamilyPerson`) + as_agent-scoped MCP tools. Privacy is structural, not flag-based.
- **Updated**: 2026-04-27 with skill-loading correction (`~/.agents/skills/<name>/SKILL.md`, NOT `~/.openclaw/workspace/skills/`)

## Purpose

Turn Dan's Ancestry.com GEDCOM (1,114 individuals) into Edge's executive-assistant-grade family knowledge that responds when Dan asks. Dossiers carry family context, agents answer "who is my great-grandfather Rosario?" instantly. **Family is reactive-only by design** — never auto-pushed into briefings or any proactive surface. Privacy is structural: family data physically never enters the business CRM or Notion.

**Vision (paraphrased Ryan):** "This is a life-improvement tool. As Dan adds gift preferences, life events, residence updates, Edge grows the knowledge base. It can help book trips because it knows who's close, ages, locations. There's a lot of extra information that gets added to help Edge manage Dan's family connections."

**Scope discipline (locked-in v1):**
- ✅ Reactive queries Dan asks for (lookups, relationships, birthdays)
- ✅ Conditional surfacing on external events (birthday today/this-week, milestone, did-you-know)
- ✅ Capture facts Dan mentions ("Uncle Joe loves single-malt") — queued for Dan-confirmed addition
- ❌ **No** behavioral monitoring (silence-nudges, contact-cadence). Opt-in only on explicit Dan request.
- ❌ **No** Notion sync (structural — guard refuses)
- ❌ **Family content NEVER appears in Dan's morning briefing or any proactive channel** — by design, locked policy 2026-04-28. Even if there's a milestone birthday or fresh research, it stays in the database until Dan asks.

## Architecture

```
                                 GEDCOM (Daniel Caruso family tree.ged)
                                            │
                                            ▼
                                   parse_gedcom.py
                                            │
                                ┌───────────┼───────────┐
                                ▼           ▼           ▼
                         data/*.json   relationships  audit
                                            │
                                            ▼
                                ingest_to_edge.js (dry-run → commit)
                                            │
                          ┌─────────────────┴─────────────────┐
                          ▼                                   ▼
              ┌────────────────────────┐         ┌─────────────────────────┐
              │  family.db (SEPARATE)  │         │ Neo4j (label-isolated)  │
              │  • family_members       │         │ • :FamilyPerson         │
              │  • crm_link             │         │ • :FAMILY_PARENT_OF     │
              │  • family_facts         │         │ • :FAMILY_SPOUSE_OF     │
              │  • family_gifts         │         │ • :FAMILY_SIBLING_OF    │
              │  • research_cache_meta  │         │   (DEFERRED — no docker)│
              └────────────┬────────────┘         └─────────────┬───────────┘
                           │                                    │
                           └────────────┬───────────────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              ▼                         ▼                         ▼
      mcp/lib/family.js        dossier-builder.js        research_batch.js
      (8 MCP tools)            (5th source)              (one-shot bulk)
              │                         │                         │
              │                         │                         ▼
              │                         │              family.db tables:
              │                         │              family_research
              │                         │              place_research
              ▼                         ▼
        Max gateway               Briefing dossiers (only for CRM-linked
        (SSH tunnel)              business contacts who are also family)
              │
              ▼
        Dan/Ryan agents (REACTIVE — answer when asked)
              │
              ▼
   No proactive surface for family content. Ever.

  PRIVACY GUARD (single chokepoint covering all paths):
  ┌──────────────────────────────────────────────────────────┐
  │  lib/notion.js::createPage  ➜  enforceLocalOnlyForPeople  │
  │  Refuses Notion-writes for names matching family_members  │
  │  rows lacking a crm_link.  Override: allow_local_only=true│
  └──────────────────────────────────────────────────────────┘
```

## Data structure

### Closeness algorithm

BFS from Dan's INDI node over parent/spouse/child/sibling edges (with full vs half-sibling detection from shared FAM.CHIL). `closeness_degree` = min hops from Dan.

| Degree | Relationship | `family_priority` | Briefing |
|---|---|---|---|
| 0 | Dan himself | n/a | n/a |
| 1 | Parents, spouse, children, siblings | Very High | Always |
| 2 | Grandparents, in-laws, grandchildren, nieces/nephews, aunts/uncles | High | Always |
| 3 | Great-grandparents, 1st cousins, great-aunts/uncles | Medium | Milestones only |
| 4+ | More distant | Low / null | Explicit query only |

### Privacy: as_agent allowlist

Env var `EDGE_FAMILY_AGENTS` on `com.edge.mcp-server.plist`. Default: `dan-primary,dan-mobile,dan-briefing,ryan-primary,ryan-testing`. Calls without a listed `as_agent` return `out_of_scope` error. **Tool scoping, not access control** — Cody/Sabrina's agents see the family tools in their menu but their calls cleanly reject.

### Multi-user attribution

`family_facts.owner_agent` and `family_gifts.owner_agent` columns attribute writes per-agent. Dan and Danny (if added later) share `family_members` reads but have separate fact-confirmation queues and gift ledgers.

## Deployment steps

Run in order. Each step is idempotent.

### Step 1 — Folder scaffolding

```bash
mkdir -p "$HOME/Documents/Ancestry Information/scripts" \
         "$HOME/Documents/Ancestry Information/data" \
         "$HOME/.openclaw/workspace/family/data" \
         "$HOME/.openclaw/workspace/family/scripts"
```

Place Dan's GEDCOM at `~/Documents/Ancestry Information/Daniel Caruso family tree.ged` and any media in `~/Documents/Ancestry Information/media/`.

### Step 2 — Parser

Copy `family-tree/scripts/parse_gedcom.py` to `~/Documents/Ancestry Information/scripts/parse_gedcom.py`.

```bash
# First run prints candidate "Daniel Caruso" INDI ids w/ birth+spouse+parents context:
python3 ~/Documents/Ancestry\ Information/scripts/parse_gedcom.py \
  --gedcom "$HOME/Documents/Ancestry Information/Daniel Caruso family tree.ged" \
  --media-dir "$HOME/Documents/Ancestry Information/media" \
  --out-dir "$HOME/Documents/Ancestry Information/data"

# Pick Dan's id from the output, then:
python3 ~/Documents/Ancestry\ Information/scripts/parse_gedcom.py \
  --gedcom "$HOME/Documents/Ancestry Information/Daniel Caruso family tree.ged" \
  --media-dir "$HOME/Documents/Ancestry Information/media" \
  --out-dir "$HOME/Documents/Ancestry Information/data" \
  --dan-gedcom-id <ID>
```

Produces 5 JSON files in `data/`. For Dan's current install: ID is `I46106454245`.

### Step 3 — family.db schema

Copy `family-tree/schema.sql` to `~/.openclaw/workspace/family/data/schema.sql` then:

```bash
sqlite3 ~/.openclaw/workspace/family/data/family.db < ~/.openclaw/workspace/family/data/schema.sql
sqlite3 ~/.openclaw/workspace/family/data/family.db "PRAGMA integrity_check;"  # → ok
```

### Step 4 — Family workspace package + ingester

Copy `family-tree/package.json` to `~/.openclaw/workspace/family/package.json` and install local deps (Node 22 ABI 127, separate from mcp's Node 25 ABI 141):

```bash
cd ~/.openclaw/workspace/family && npm install
```

Copy `family-tree/scripts/ingest_to_edge.js` to `~/.openclaw/workspace/family/scripts/ingest_to_edge.js`.

```bash
node ~/.openclaw/workspace/family/scripts/ingest_to_edge.js --dry-run
# Review ~/.openclaw/workspace/family/data/ingest-report.json (especially needs_manual_disambig)
node ~/.openclaw/workspace/family/scripts/ingest_to_edge.js   # commit
```

For Dan's current install: 1,114 inserted, 13 CRM-linked, 10 needed manual disambig (multiple INDI ↔ same CRM contact).

### Step 5 — MCP server library

Copy `family-tree/lib/family.js` and `family-tree/lib/family-capture.js` to `~/.openclaw/workspace/mcp/lib/`.

### Step 6 — Apply patches to existing files

Apply each patch in order (each contains exact diff instructions):

1. `family-tree/patches/01-lib-notion-guard.md` — adds privacy guard to `lib/notion.js::createPage`
2. `family-tree/patches/02-edge-mcp-tools.md` — registers 7 `edge.family.*` tools + `scopeToFamily` wrapper + `EDGE_FAMILY_AGENTS` plist env
3. `family-tree/patches/03-dossier-builder.md` — `getFamilyProfile` 5th source + `:FAMILY_*` edge filter
~~4. `family-tree/patches/04-nightshift-phase9.md`~~ — REMOVED. Family content is reactive-only; no nightshift integration.
~~5. `family-tree/patches/05-daily-briefing.md`~~ — REMOVED. Family content never appears in the briefing.

### Step 7 — Skill registration

Copy `family-tree/SKILL.md` to `~/.agents/skills/family/SKILL.md`:
```bash
mkdir -p ~/.agents/skills/family
cp family-tree/SKILL.md ~/.agents/skills/family/SKILL.md
openclaw skills info family   # → ✓ Ready
```

**IMPORTANT:** Skills load from `~/.agents/skills/<name>/SKILL.md`, NOT from `~/.openclaw/workspace/skills/<name>.md`. Bare .md files at the workspace skills root are ignored. Folder-skills (`~/.openclaw/workspace/skills/<name>/SKILL.md`) work too but are sourced as `openclaw-workspace`.

Also apply the local-only addendum to the active notion skill at `~/.agents/skills/notion/SKILL.md`:
```markdown
## 🚫 Privacy rule — never push family-tree data to Notion

Dan's family members live in a separate database (`~/.openclaw/workspace/family/data/family.db`)
and must NOT be added to Notion. The `lib/notion.js::createPage` guard refuses such writes...
```

### Step 8 — Restart edge-mcp

```bash
launchctl unload ~/Library/LaunchAgents/com.edge.mcp-server.plist
launchctl load   ~/Library/LaunchAgents/com.edge.mcp-server.plist
sleep 3 && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/healthz   # → 200
```

### Step 9 — Register edge-mcp on Edge's local agent (CRITICAL)

This is the step everyone forgets. `edge-mcp` runs on this machine, but **Edge's local agent (`main`, the one Dan talks to via Telegram or the OpenClaw app) must have edge-mcp registered as an MCP server in its config**, or the agent has zero awareness of any `edge.*` tool — including family. (Max's gateway has its own registration; Edge's local agent is separate.)

```bash
TOKEN=$(grep -A1 EDGE_MCP_TOKEN ~/Library/LaunchAgents/com.edge.mcp-server.plist | grep string | sed 's/[^>]*>\([^<]*\).*/\1/')

openclaw mcp set edge "$(jq -nc \
  --arg url "http://127.0.0.1:8765/mcp" \
  --arg auth "Bearer $TOKEN" \
  '{url: $url, headers: {Authorization: $auth}, transport: "streamable-http"}')"

# Verify
openclaw mcp list   # should include 'edge'
openclaw mcp show edge
```

**Symptom this prevents:** Edge replies *"I don't have access to a family database tool"* even though `openclaw skills info family` shows ✓ Ready and edge-mcp is healthy. Skills are advisory text; MCP tool availability comes from `mcpServers` config — these are two separate registries.

After registering, Dan starts a fresh conversation (the agent re-reads MCP config on session start) and the 22+ `edge.*` tools (contacts, family, notion, brief, etc.) become available.

## Verification

```bash
TOKEN=$(grep -A1 EDGE_MCP_TOKEN ~/Library/LaunchAgents/com.edge.mcp-server.plist | grep string | sed 's/[^>]*>\([^<]*\).*/\1/')

# 1. 7 family tools registered
curl -sS -X POST http://127.0.0.1:8765/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | sed -n 's/^data: //p' | python3 -c "
import sys,json; d=json.loads(sys.stdin.read())
fam=[t['name'] for t in d['result']['tools'] if 'family' in t['name']]
print('family tools:', len(fam))
for t in fam: print(' ', t)"

# 2. Lookup works
curl -sS -X POST http://127.0.0.1:8765/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"edge.family.lookup","arguments":{"query":"rosario","as_agent":"ryan-primary"}}}'

# 3. Skill registered
openclaw skills info family

# 4. Notion guard fires (Rosario is in family, not in CRM)
EDGE_MCP_TOKEN=$TOKEN /opt/homebrew/opt/node/bin/node --input-type=module -e "
import { createPage } from '/Users/edge/.openclaw/workspace/mcp/lib/notion.js';
try { await createPage({ db: 'people', properties: { Name: { title: [{ text: { content: 'Rosario Caruso' } }] } } }); console.log('FAIL'); }
catch (e) { console.log(e.message.includes('Refusing') ? 'OK guard fires' : 'FAIL: ' + e.message); }
"
```

## Operational runbook

### Re-ingest after Dan re-exports the GEDCOM

```bash
# (1) Replace the .ged file in ~/Documents/Ancestry Information/
# (2) Re-run parser with same Dan-id
python3 ~/Documents/Ancestry\ Information/scripts/parse_gedcom.py \
  --gedcom "$HOME/Documents/Ancestry Information/Daniel Caruso family tree.ged" \
  --media-dir "$HOME/Documents/Ancestry Information/media" \
  --out-dir "$HOME/Documents/Ancestry Information/data" \
  --dan-gedcom-id I46106454245

# (3) Dry-run — review ingest-report.json
node ~/.openclaw/workspace/family/scripts/ingest_to_edge.js --dry-run

# (4) Commit
node ~/.openclaw/workspace/family/scripts/ingest_to_edge.js

# (5) If records were DELETED in the new GEDCOM:
node ~/.openclaw/workspace/family/scripts/ingest_to_edge.js --prune-deleted
```

No edge-mcp restart needed — `family.js` reads the DB live.

### Add another family agent (e.g. Danny)

```bash
# Edit ~/Library/LaunchAgents/com.edge.mcp-server.plist:
# Append 'danny-primary,danny-mobile' to the EDGE_FAMILY_AGENTS string value.
launchctl unload ~/Library/LaunchAgents/com.edge.mcp-server.plist
launchctl load   ~/Library/LaunchAgents/com.edge.mcp-server.plist
```

Danny's agents now see and can call `edge.family.*` tools. Their writes (`facts.add`, `gift.log`) attribute as `owner_agent='danny-primary'`. Their confirmation queue is separate from Dan's.

### Family in proactive briefings — locked OFF

Family content is **never** included in the morning briefing or any proactive Edge surface, by design (policy locked 2026-04-28). The briefing/nightshift LaunchAgents may be enabled or disabled for OTHER reasons (e.g. business briefings) but those services contain no family code paths. If you find yourself adding a `buildFamilyBlock` or a `phase9_family*` function, stop — re-read this file.

Reactive queries via the `edge.family.*` MCP tools work fine regardless.

### Wire trigger-phrase auto-scan into Dan's chat receive (optional)

`edge.family.capture_from_message` is exposed as an MCP tool. To make it auto-fire on every Dan message, add to whatever script processes Dan's Telegram inbound:
```javascript
await mcp.call('edge.family.capture_from_message', {
  message: msg.text, queue: true, as_agent: 'dan-primary',
  source_ref: 'tg-' + msg.message_id,
});
```
Located: scan whichever script handles Telegram receive. The hook is one line; identification is the only work.

### Rollback

```bash
# Family data only (CRM/Neo4j business untouched)
node ~/.openclaw/workspace/family/scripts/ingest_to_edge.js --rollback
rm -rf ~/.openclaw/workspace/family/

# Revert in-place patches (if using git)
cd ~/.openclaw/workspace
git checkout mcp/lib/notion.js mcp/edge-mcp.js lib/dossier-builder.js

# Remove launchd env var manually from com.edge.mcp-server.plist + reload
```

## Privacy invariants (load-bearing — read before changing)

1. **family.db lives in its own SQLite file**, separate from crm.db. NEVER add a migration to crm.db for family data.
2. **All Notion writes funnel through `lib/notion.js::createPage`** which is the single chokepoint with the local-only guard. Verified: Max's gateway is a pure SSH tunnel; no duplicate notion code on Max.
3. **Tool scoping via `as_agent` is hygiene, not security.** A malicious agent can spoof `as_agent='dan-primary'`. The defense against malicious actors is filesystem permissions on Max's gateway config + tunnel auth, not this allowlist.
4. **Family data physically never touches Notion.** Even if the guard is bypassed (`allow_local_only=true`), don't push family records as a default behavior. Promotion to a business contact is a deliberate user action, never an automatic one.

## Test posture (current)

- **Through Ryan first.** `EDGE_FAMILY_AGENTS` includes `ryan-primary,ryan-testing`. All initial automation testing routes to Ryan's DM.
- **Dan stays reactive — permanently.** Dan can ask Edge family questions and get answers. He does NOT receive proactive briefings about family. Ever. This is policy, not a phase-1 limitation.
- **No silence-nudging.** Behavioral monitoring features are opt-in only (per `feedback_no_surveillance_defaults.md` rule).

## Files in this deployment package

```
family-tree/
├── README.md                            # this guide is at ../deploy-family-tree.md
├── schema.sql                           # → ~/.openclaw/workspace/family/data/schema.sql
├── package.json                         # → ~/.openclaw/workspace/family/package.json
├── SKILL.md                             # → ~/.agents/skills/family/SKILL.md
├── family-workspace-README.md           # → ~/.openclaw/workspace/family/README.md
├── scripts/
│   ├── parse_gedcom.py                  # → ~/Documents/Ancestry Information/scripts/parse_gedcom.py
│   └── ingest_to_edge.js                # → ~/.openclaw/workspace/family/scripts/ingest_to_edge.js
├── lib/
│   ├── family.js                        # → ~/.openclaw/workspace/mcp/lib/family.js
│   └── family-capture.js                # → ~/.openclaw/workspace/mcp/lib/family-capture.js
└── patches/
    ├── 01-lib-notion-guard.md           # patches mcp/lib/notion.js
    ├── 02-edge-mcp-tools.md             # patches mcp/edge-mcp.js + plist
    ├── 03-dossier-builder.md            # patches lib/dossier-builder.js
    └── 06-research-batch.md             # describes one-shot bulk research enrichment
```

## Future work (out of v1 scope)

- **Photo rendering in Telegram** — `edge.family.get` returns `media_paths`. Wire `sendPhoto(absolute_path)` to Telegram for "show me a photo of great-grandma" flows.
- **Neo4j subgraph** — when edge-neo4j docker container is provisioned, re-run ingester with `--neo4j` (currently a stub; needs real Cypher write code).
- **Trip planning** — `family_members.residence_*` columns are present but unpopulated. Capture via trigger-phrase ("Aunt Jane moved to Denver") + reactive confirmation when Dan next asks about that person.
- **Gift idea generator** — read `family_facts` (preferences) + `family_gifts` (ledger) + occasion + budget, LLM composes 3 ideas. Trivial to add as `edge.family.gift.suggest`.
- **Health tracking** — separate sensitive table (`family_health`) for closeness-1 only. Not in v1.
- **Correspondence drafting** — holiday cards / condolences grounded in captured facts.
- **Silence-nudging (opt-in)** — only when Dan explicitly asks. Default = off forever.
