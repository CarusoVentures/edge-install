# Patch 04: nightshift.js — phase 9 (family research + upcoming dates)

**File:** `~/.openclaw/workspace/scripts/nightshift.js`

Adds a new phase that runs after the existing 8 phases. Picks one closeness ≤ 3 family member per night via weighted round-robin, generates a "did you know" cache entry, and precomputes the next 30 days of upcoming birthdays.

## Step 1: Add phase 9 function

Insert just BEFORE `// === PHASE 7: THREE STEPS AHEAD ===`:

```javascript
// === PHASE 9: FAMILY RESEARCH + UPCOMING DATES ===
// Only runs if family.db exists. Weighted round-robin: pick the person with the highest
// (days_since_last_research / refresh_interval_days) ratio.

function phase9_familyResearch(date, isDryRun) {
  log('Phase 9: Family research + upcoming dates');
  var results = { researched: null, upcoming_count: 0 };
  var FAMILY_DB_PATH = path.join(process.env.HOME, '.openclaw/workspace/family/data/family.db');
  if (!fs.existsSync(FAMILY_DB_PATH)) {
    log('  family.db not present — skipping (Phase 9 no-op)');
    return results;
  }
  var Database;
  try { Database = require(path.join(WORKSPACE, 'node_modules/better-sqlite3')); }
  catch (_) { log('  better-sqlite3 not loadable — skipping'); return results; }

  var db = new Database(FAMILY_DB_PATH, { readonly: false });
  db.pragma('foreign_keys = ON');

  // (a) Upcoming dates precompute: next 30 days, closeness <= 3
  var today = new Date();
  var thisYear = today.getFullYear();
  var endMs = today.getTime() + 30 * 86400000;
  var rows = db.prepare(
    'SELECT gedcom_id, display_name, birth_date, birth_year, ' +
    '  family_closeness, family_relation, family_priority, primary_media ' +
    'FROM family_members WHERE is_living = 1 AND birth_date IS NOT NULL ' +
    '  AND family_closeness IS NOT NULL AND family_closeness <= 3'
  ).all();
  var upcoming = [];
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var m = String(r.birth_date).match(/^\d{4}-(\d{2})-(\d{2})/);
    if (!m) continue;
    var mm = parseInt(m[1], 10), dd = parseInt(m[2], 10);
    if (!mm || !dd) continue;
    var cand = new Date(thisYear, mm - 1, dd, 12, 0, 0);
    if (cand.getTime() < today.getTime() - 86400000) cand = new Date(thisYear + 1, mm - 1, dd, 12, 0, 0);
    if (cand.getTime() > endMs) continue;
    var age = r.birth_year ? cand.getFullYear() - r.birth_year : null;
    if (r.family_closeness === 3 && age && (age % 5) !== 0) continue;
    upcoming.push({
      gedcom_id: r.gedcom_id, name: r.display_name,
      family_relation: r.family_relation, family_closeness: r.family_closeness,
      date: cand.toISOString().slice(0, 10), age_this_year: age,
      is_milestone: age && (age % 10 === 0), primary_media: r.primary_media,
    });
  }
  upcoming.sort(function (a, b) { return a.date.localeCompare(b.date); });
  if (!isDryRun) {
    cache.set('family', 'upcoming-dates', JSON.stringify(upcoming), 86400, 'nightshift');
  }
  results.upcoming_count = upcoming.length;
  log('  Upcoming dates cached: ' + upcoming.length + ' entries (next 30 days, closeness <= 3)');

  // (b) Weighted round-robin research target
  var targets = db.prepare(
    'SELECT fm.id, fm.gedcom_id, fm.display_name, fm.family_relation, fm.family_closeness, ' +
    '  fm.birth_year, fm.death_year, fm.birth_place, fm.notes, fm.is_living, ' +
    '  rcm.last_researched, rcm.refresh_interval_days ' +
    'FROM family_members fm ' +
    'JOIN research_cache_meta rcm ON rcm.family_member_id = fm.id ' +
    'WHERE fm.family_closeness IS NOT NULL AND fm.family_closeness <= 3'
  ).all();

  var now = Math.floor(Date.now() / 1000);
  var best = null;
  var bestScore = -1;
  for (var j = 0; j < targets.length; j++) {
    var t = targets[j];
    var daysSince = t.last_researched ? (now - t.last_researched) / 86400 : 10000;
    var score = daysSince / Math.max(1, t.refresh_interval_days);
    if (score >= 1 && score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  if (!best) { log('  No family member due for research right now'); db.close(); return results; }

  log('  Researching: ' + best.display_name + ' (' + best.family_relation +
      ', closeness=' + best.family_closeness + ', score=' + bestScore.toFixed(2) + ')');

  if (isDryRun) { db.close(); return results; }

  var ctx =
    'Family member: ' + best.display_name + ' (' + (best.family_relation || 'relative') + ', degree ' + best.family_closeness + ')\n' +
    (best.birth_year ? 'Born ' + best.birth_year + (best.birth_place ? ' in ' + best.birth_place : '') + '\n' : '') +
    (best.death_year ? 'Died ' + best.death_year + '\n' : '') +
    (best.notes ? 'GEDCOM notes: ' + String(best.notes).substring(0, 800) + '\n' : '') +
    'Living: ' + (best.is_living === 1 ? 'yes' : 'no') + '\n';

  var prompt =
    'You are helping Dan Caruso understand his family tree. Below is what we know ' +
    'about one relative. Write a short "did you know" paragraph (2-4 sentences, under 350 chars) ' +
    'with interesting context — connections, historical context for the place/date, ' +
    'notable facts drawn only from what is below. Do not invent specifics.\n\n' + ctx;

  var answer = clawAgent(prompt);
  if (answer && answer.length > 10) {
    cache.set('family', 'did-you-know:' + best.gedcom_id, answer, 30 * 86400, 'nightshift');
    db.prepare('UPDATE research_cache_meta SET last_researched = ? WHERE family_member_id = ?').run(now, best.id);
    results.researched = { gedcom_id: best.gedcom_id, name: best.display_name, chars: answer.length };
    log('  Cached did-you-know (' + answer.length + ' chars)');
  } else {
    log('  AI returned no content — skipping');
  }
  db.close();
  return results;
}
```

## Step 2: Wire phase 9 into main()

After the existing `// Phase 8: Morning summary` block, add:
```javascript
  // Phase 9: Family research + upcoming dates (added for family module)
  if (!phaseOnly || phaseOnly === 9) {
    try { phaseResults.family = phase9_familyResearch(date, isDryRun); }
    catch (e) { errors.push({ phase: 9, error: e.message }); log('Phase 9 ERROR: ' + e.message); }
  }
```

## Verification

```bash
cd ~/.openclaw/workspace && /opt/homebrew/opt/node@22/bin/node scripts/nightshift.js --phase 9 --dry-run --force
```

Expected: logs "Phase 9: Family research + upcoming dates" and lists a candidate to research (assuming family.db is populated).

## Important: do not enable nightshift LaunchAgent without explicit Dan authorization

The LaunchAgent `~/Library/LaunchAgents/_disabled/com.edge.nightman.plist` should remain disabled until Dan explicitly opts in to proactive overnight processing. Code is dormant when the agent isn't loaded.
