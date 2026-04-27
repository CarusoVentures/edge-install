# Patch 01: lib/notion.js — local-only privacy guard

**File:** `~/.openclaw/workspace/mcp/lib/notion.js`

Refuses Notion-writes for any Name that matches a `family_members` row lacking a `crm_link`. The override `allow_local_only=true` exists for the case where Dan promotes a family member to a business contact.

## Insert at top of file (after existing imports)

```javascript
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

// --- Privacy guard: refuse to write Notion pages for family-only people ---
const FAMILY_DB_PATH = path.join(os.homedir(), '.openclaw/workspace/family/data/family.db');
let _familyDb = null;
function getFamilyDb() {
  if (_familyDb !== null) return _familyDb;
  try {
    if (!fs.existsSync(FAMILY_DB_PATH)) { _familyDb = false; return false; }
    _familyDb = new Database(FAMILY_DB_PATH, { readonly: true, fileMustExist: true });
    _familyDb.pragma('query_only = ON');
    return _familyDb;
  } catch (_e) {
    _familyDb = false;
    return false;
  }
}

function extractNameFromProperties(properties) {
  if (!properties || typeof properties !== 'object') return null;
  const titleProp = properties.Name?.title || properties.Title?.title;
  if (!Array.isArray(titleProp) || !titleProp[0]?.text?.content) return null;
  return String(titleProp[0].text.content).trim();
}

function enforceLocalOnlyForPeople({ db, properties, allow_local_only }) {
  if (allow_local_only === true) return;
  if (db !== 'people' && db !== 'persons') return;
  const name = extractNameFromProperties(properties);
  if (!name) return;
  const famDb = getFamilyDb();
  if (!famDb) return;
  const row = famDb.prepare(`
    SELECT fm.id, fm.display_name, fm.family_relation
    FROM family_members fm
    LEFT JOIN crm_link cl ON cl.family_member_id = fm.id
    WHERE LOWER(fm.display_name) = LOWER(?) AND cl.crm_contact_id IS NULL
    LIMIT 1
  `).get(name);
  if (row) {
    throw new Error(
      `Refusing to create Notion page for "${name}" — matches family_members row ${row.id} ` +
      `(${row.family_relation || 'family'}) with no crm_link. This is private family data. ` +
      `Pass allow_local_only=true to override.`
    );
  }
}
```

## Modify createPage signature

Change:
```javascript
export async function createPage({ db, properties, body_text, as_agent, as_owner }) {
```
to:
```javascript
export async function createPage({ db, properties, body_text, as_agent, as_owner, allow_local_only }) {
```

Add right after the prop-validation block, before `notion.createPage(db, properties)`:
```javascript
enforceLocalOnlyForPeople({ db, properties, allow_local_only });
```

## Verification

```bash
EDGE_MCP_TOKEN=$(grep -A1 EDGE_MCP_TOKEN ~/Library/LaunchAgents/com.edge.mcp-server.plist | grep string | sed 's/[^>]*>\([^<]*\).*/\1/') \
/opt/homebrew/opt/node/bin/node --input-type=module -e "
import { createPage } from '/Users/edge/.openclaw/workspace/mcp/lib/notion.js';
try {
  await createPage({ db: 'people', properties: { Name: { title: [{ text: { content: 'Rosario Caruso' } }] } } });
  console.log('FAIL: should have thrown');
} catch (e) {
  console.log(e.message.includes('Refusing') ? 'OK guard fires' : 'FAIL: ' + e.message);
}
"
```

Expected: `OK guard fires`.
