# Patch 02: edge-mcp.js — register `edge.family.*` tools + `scopeToFamily` wrapper

**File:** `~/.openclaw/workspace/mcp/edge-mcp.js`

Registers 7 new MCP tools for Dan's family tree, all gated by an `as_agent` allowlist (env var `EDGE_FAMILY_AGENTS`).

## Step 1: Add imports near the top

After existing imports (around line 15):
```javascript
import * as family from './lib/family.js';
import * as familyCapture from './lib/family-capture.js';
```

## Step 2: Add `scopeToFamily` + tool registrations near end of `createServer()`

Just before `return server;` in `createServer()`, paste:

```javascript
// ---- family (scoped by as_agent allowlist) ----

const FAMILY_AGENTS = (process.env.EDGE_FAMILY_AGENTS || 'dan-primary,dan-mobile,dan-briefing')
  .split(',').map(s => s.trim()).filter(Boolean);

function scopeToFamily(fn) {
  return async (input) => {
    const agent = input?.as_agent || '';
    if (!FAMILY_AGENTS.includes(agent)) {
      return err(
        'out_of_scope',
        `This tool is scoped to Dan's family agents. Pass as_agent = one of [${FAMILY_AGENTS.join(', ')}].`,
        'Tool-scope check (not security). Family data is private to Dan\'s household agents.'
      );
    }
    return fn(input);
  };
}

  server.registerTool(
  'edge.family.lookup',
  {
    title: 'Fuzzy search Dan\'s family tree',
    description:
      `Fast fuzzy name search over Dan's private family tree (${FAMILY_AGENTS.join('/')} only — pass as_agent). Returns up to ` +
      '`limit` candidates with closeness degree, relation, and primary photo. Use when the user asks about relatives, ancestors, cousins, or anyone in the family. Not for business contacts — use edge.contacts.lookup for those.',
    inputSchema: {
      query: z.string().min(1),
      limit: z.number().int().positive().max(20).optional(),
      as_agent: z.string().min(1),
    },
  },
  scopeToFamily(async (input) => wrap('family.lookup', async () => ok(family.lookup(input))))
);

  server.registerTool(
  'edge.family.get',
  {
    title: 'Full dossier on a family member',
    description:
      'Returns the full record for one family member — vitals, closeness, relation to Dan, parents/spouses/children/siblings (resolved), captured facts, media paths, CRM link if any. Identify by gedcom_id (preferred) OR name (fuzzy). Scoped — pass as_agent.',
    inputSchema: {
      gedcom_id: z.string().optional(),
      name: z.string().optional(),
      as_agent: z.string().min(1),
    },
  },
  scopeToFamily(async (input) => wrap('family.get', async () => ok(family.get(input))))
);

  server.registerTool(
  'edge.family.upcoming_dates',
  {
    title: 'Upcoming family birthdays (closeness-gated)',
    description:
      'Birthdays of living family members in the next `days` (default 30). Filtered by max_closeness (default 3): closeness 1-2 always shown, closeness 3 only on milestones (multiples of 5). Scoped — pass as_agent.',
    inputSchema: {
      days: z.number().int().positive().max(365).optional(),
      max_closeness: z.number().int().positive().max(5).optional(),
      as_agent: z.string().min(1),
    },
  },
  scopeToFamily(async (input) => wrap('family.upcoming_dates', async () => ok(family.upcomingDates(input))))
);

  server.registerTool(
  'edge.family.relationship',
  {
    title: 'Shortest family-tree path between two people',
    description:
      'Computes the shortest path between two family members via parent/child/spouse/sibling edges. Useful for "how am I related to X" or tracing ancestry chains. Each argument can be a gedcom_id or a name. Scoped — pass as_agent.',
    inputSchema: {
      person_a: z.string().min(1),
      person_b: z.string().min(1),
      as_agent: z.string().min(1),
    },
  },
  scopeToFamily(async (input) => wrap('family.relationship', async () => ok(family.relationship(input))))
);

  server.registerTool(
  'edge.family.facts.add',
  {
    title: 'Capture a fact about a family member',
    description:
      'Write to family.db — records a preference/life_event/wish/dislike/trivia/residence about a family member. Defaults to queued-for-confirmation (confirmed=false); the owning agent reviews in the next briefing. Pass confirmed=true only when the user explicitly says "remember that...". Attribution is owner_agent (auto-derived from as_agent). Scoped — pass as_agent.',
    inputSchema: {
      gedcom_id: z.string().min(1),
      fact_type: z.enum(['preference', 'life_event', 'wish', 'dislike', 'trivia', 'residence']),
      fact_subtype: z.string().optional(),
      fact_text: z.string().min(1),
      source: z.enum(['trigger_phrase', 'explicit', 'nightshift_distill']).optional(),
      source_ref: z.string().optional(),
      confirmed: z.boolean().optional(),
      as_agent: z.string().min(1),
    },
  },
  scopeToFamily(async (input) => wrap('family.facts.add', async () =>
    ok(family.factsAdd({ ...input, owner_agent: input.as_agent }))))
);

  server.registerTool(
  'edge.family.gift.log',
  {
    title: 'Log a gift given to a family member',
    description:
      'Records that the calling agent\'s owner gave a specific gift to a family member. Prevents repeat-gift suggestions. Each agent has its own ledger (filtered by owner_agent). Scoped — pass as_agent.',
    inputSchema: {
      gedcom_id: z.string().min(1),
      occasion: z.enum(['birthday', 'christmas', 'anniversary', 'other']),
      year: z.number().int().min(1900).max(2200),
      item: z.string().min(1),
      notes: z.string().optional(),
      as_agent: z.string().min(1),
    },
  },
  scopeToFamily(async (input) => wrap('family.gift.log', async () =>
    ok(family.giftLog({ ...input, owner_agent: input.as_agent }))))
);

  server.registerTool(
  'edge.family.capture_from_message',
  {
    title: 'Scan a Dan-message for family-fact captures',
    description:
      'Runs the family-fact trigger-phrase classifier on a single message. Detects patterns like "Uncle Joe loves X", "Aunt Jane moved to Y". Returns {captures: [...]} by default (preview only). Pass queue=true to also persist each capture as a pending row in family_facts (owner_agent = as_agent). Dan reviews the pending queue in the next morning briefing. Scoped — pass as_agent.',
    inputSchema: {
      message: z.string().min(3),
      source_ref: z.string().optional(),
      queue: z.boolean().optional(),
      as_agent: z.string().min(1),
    },
  },
  scopeToFamily(async (input) => wrap('family.capture_from_message', async () => {
    if (input.queue === true) {
      const rows = familyCapture.scanAndQueue(input.message, {
        owner_agent: input.as_agent,
        source_ref: input.source_ref,
      });
      return ok({ queued: rows.length, captures: rows });
    }
    const captures = familyCapture.scan(input.message);
    return ok({ queued: 0, captures });
  }))
);
```

## Step 3: Add env var to launchd plist

`~/Library/LaunchAgents/com.edge.mcp-server.plist`, inside `EnvironmentVariables` dict:
```xml
<key>EDGE_FAMILY_AGENTS</key>
<string>dan-primary,dan-mobile,dan-briefing,ryan-primary,ryan-testing</string>
```

## Step 4: Restart edge-mcp

```bash
launchctl unload ~/Library/LaunchAgents/com.edge.mcp-server.plist
launchctl load   ~/Library/LaunchAgents/com.edge.mcp-server.plist
sleep 3 && curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8765/healthz
```

Expected: `200`.

## Verification

```bash
TOKEN=$(grep -A1 EDGE_MCP_TOKEN ~/Library/LaunchAgents/com.edge.mcp-server.plist | grep string | sed 's/[^>]*>\([^<]*\).*/\1/')
curl -sS -X POST http://127.0.0.1:8765/mcp \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | sed -n 's/^data: //p' | python3 -c "
import sys, json
d = json.loads(sys.stdin.read())
fam = [t['name'] for t in d['result']['tools'] if 'family' in t['name']]
print(f'family tools registered: {len(fam)}')
for t in fam: print(' ', t)
"
```

Expected: 7 family tools listed.
