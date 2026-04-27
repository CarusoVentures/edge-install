# Patch 03: dossier-builder.js — getFamilyProfile (5th source) + KG edge filter

**File:** `~/.openclaw/workspace/lib/dossier-builder.js` (CommonJS, runs under Node 22 / ABI 127)

## Step 1: Add path constants near top

After `var KG_URL = 'http://localhost:8100';` add:
```javascript
var FAMILY_DB_PATH = path.join(process.env.HOME, '.openclaw/workspace/family/data/family.db');
var FAMILY_RELATIONSHIPS_JSON = path.join(process.env.HOME, 'Documents/Ancestry Information/data/relationships.json');
```

## Step 2: Add `getFamilyProfile` function

Insert just BEFORE `function buildDossier(...)`:

```javascript
// === SOURCE 5: FAMILY (family.db, optional) ===
// Structurally separate from CRM. Returns null if family.db doesn't exist or no match.

var _familyDb = null;
var _familyRels = null;

function getFamilyProfile(name) {
  if (!fs.existsSync(FAMILY_DB_PATH)) return null;
  try {
    if (_familyDb === null) {
      var Database = require(path.join(WORKSPACE, 'node_modules/better-sqlite3'));
      _familyDb = new Database(FAMILY_DB_PATH, { readonly: true, fileMustExist: true });
      _familyDb.pragma('query_only = ON');
    }
    var row = _familyDb.prepare(
      'SELECT * FROM family_members WHERE LOWER(display_name) = LOWER(?) LIMIT 1'
    ).get(name);
    if (!row) {
      row = _familyDb.prepare(
        'SELECT * FROM family_members WHERE LOWER(display_name) LIKE ? ORDER BY family_closeness ASC NULLS LAST LIMIT 1'
      ).get('%' + String(name).toLowerCase() + '%');
    }
    if (!row) return null;

    if (_familyRels === null) {
      _familyRels = fs.existsSync(FAMILY_RELATIONSHIPS_JSON)
        ? JSON.parse(fs.readFileSync(FAMILY_RELATIONSHIPS_JSON, 'utf8'))
        : {};
    }
    var rels = _familyRels[row.gedcom_id] || {};
    function nameList(ids) {
      return (ids || []).map(function (gid) {
        var r = _familyDb.prepare(
          'SELECT display_name FROM family_members WHERE gedcom_id = ?'
        ).get(gid);
        return r ? r.display_name : gid;
      });
    }

    var facts = _familyDb.prepare(
      'SELECT fact_type, fact_subtype, fact_text, owner_agent, confirmed_by_owner ' +
      'FROM family_facts WHERE family_member_id = ? AND superseded_by IS NULL ' +
      'ORDER BY captured_at DESC LIMIT 8'
    ).all(row.id);

    return {
      gedcom_id: row.gedcom_id,
      relation: row.family_relation,
      closeness: row.family_closeness,
      priority: row.family_priority,
      birth_year: row.birth_year,
      death_year: row.death_year,
      is_living: row.is_living === 1,
      parents: nameList(rels.parents),
      spouses: nameList(rels.spouses),
      children: nameList(rels.children),
      siblings: nameList(rels.siblings),
      primary_media: row.primary_media,
      facts: facts,
    };
  } catch (e) {
    log('getFamilyProfile error: ' + e.message);
    return null;
  }
}
```

## Step 3: Update `buildDossier` signature + render Family section

Change:
```javascript
function buildDossier(name, crm, kg, emails, tasks) {
```
to:
```javascript
function buildDossier(name, crm, kg, emails, tasks, family) {
```

Just before the closing `return lines.join('\n'); }`, insert:
```javascript
  // === Family section (only if this person is in Dan's family tree) ===
  if (family) {
    lines.push('');
    lines.push('Family:');
    var famHeader = family.relation || 'family member';
    if (family.closeness != null) famHeader += ' (degree ' + family.closeness + ')';
    if (family.birth_year) {
      famHeader += ' — b.' + family.birth_year + (family.death_year ? ' d.' + family.death_year : '');
    }
    lines.push('  ' + famHeader);
    if (family.parents && family.parents.length) lines.push('  Parents: ' + family.parents.slice(0, 2).join(', '));
    if (family.spouses && family.spouses.length) lines.push('  Spouse: ' + family.spouses.slice(0, 2).join(', '));
    if (family.children && family.children.length) lines.push('  Children: ' + family.children.slice(0, 4).join(', '));
    if (family.siblings && family.siblings.length) lines.push('  Siblings: ' + family.siblings.slice(0, 4).join(', '));
    if (family.facts && family.facts.length) {
      var confirmed = family.facts.filter(function (f) { return f.confirmed_by_owner === 1; });
      if (confirmed.length) {
        lines.push('  Known: ' + confirmed.slice(0, 3).map(function (f) { return f.fact_text; }).join(' | '));
      }
    }
  }
```

## Step 4: Wire family into `buildOne`

Find `var crm = getCRMProfile(name); ...` block in `buildOne()`. Add after the existing 4 source calls:
```javascript
  var family = getFamilyProfile(name);
```

Update the buildDossier call:
```javascript
  var dossier = buildDossier(name, crm, kg, emails, tasks, family);
```

## Step 5: Filter family edges out of KG profile (forward-looking)

Inside `getKGProfile`, replace:
```javascript
return {
  state: state && state.length > 0 ? state[0] : null,
  relationships: rels || []
};
```
with:
```javascript
var businessRels = (rels || []).filter(function (r) {
  return !r || !r.type || String(r.type).indexOf('FAMILY_') !== 0;
});
return {
  state: state && state.length > 0 ? state[0] : null,
  relationships: businessRels
};
```

This prevents `:FAMILY_*` edges from polluting business-graph traversals when Neo4j eventually has both populated.

## Verification

```bash
cd ~/.openclaw/workspace && /opt/homebrew/opt/node@22/bin/node -e "
var d = require('./lib/dossier-builder');
d.buildOne('Rosario Caruso', { freshen: false }).then(out => console.log(out));
"
```

Should include a `Family:` section with parents, spouse, children, siblings.
