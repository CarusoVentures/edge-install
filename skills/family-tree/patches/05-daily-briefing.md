# Patch 05: daily-briefing.js — Family & Dates section (conditional)

**File:** `~/.openclaw/workspace/scripts/daily-briefing.js`

Adds a `buildFamilyBlock()` helper that reads from `family:upcoming-dates` cache (set by nightshift phase 9), pending family_facts (per owner_agent), and one featured "did you know" entry. Section is conditional — empty input → omitted from briefing entirely.

## Step 1: Add helper just before `function buildDanPrompt(...)`

```javascript
// Family data block — reads family:upcoming-dates from cache + pending facts from family.db.
// Returns a human-readable string (possibly empty). Empty string => briefing omits the section.
function buildFamilyBlock(owner_agent) {
  var lines = [];
  try {
    var cache = require('/Users/edge/.openclaw/workspace/lib/cache');
    var upcomingRaw = cache.get('family', 'upcoming-dates');
    if (upcomingRaw) {
      try {
        var upcoming = JSON.parse(upcomingRaw);
        var today = new Date();
        upcoming.slice(0, 5).forEach(function (u) {
          var d = new Date(u.date);
          var days = Math.round((d - today) / 86400000);
          var when = days === 0 ? 'today' : (days === 1 ? 'tomorrow' : 'in ' + days + ' days (' + u.date + ')');
          var suffix = u.family_relation ? ' (' + u.family_relation + ')' : '';
          var age = u.age_this_year ? ', turns ' + u.age_this_year : '';
          var mile = u.is_milestone ? ' MILESTONE' : '';
          lines.push('  🎂 ' + u.name + suffix + age + mile + ' — ' + when);
        });
      } catch (_) { /* ignore malformed cache */ }
    }
  } catch (_) { /* cache may not be available */ }

  // Pending fact confirmations for this owner_agent (from family.db)
  try {
    var fsMod = require('fs');
    var pathMod = require('path');
    var FAM_DB = pathMod.join(process.env.HOME, '.openclaw/workspace/family/data/family.db');
    if (fsMod.existsSync(FAM_DB)) {
      var Database = require(pathMod.join('/Users/edge/.openclaw/workspace', 'node_modules/better-sqlite3'));
      var db = new Database(FAM_DB, { readonly: true });
      db.pragma('query_only = ON');
      var pending = db.prepare(
        'SELECT ff.fact_text, ff.fact_type, fm.display_name ' +
        'FROM family_facts ff JOIN family_members fm ON fm.id = ff.family_member_id ' +
        'WHERE ff.confirmed_by_owner IS NULL AND ff.owner_agent = ? AND ff.superseded_by IS NULL ' +
        'ORDER BY ff.captured_at DESC LIMIT 3'
      ).all(owner_agent || 'dan-briefing');
      pending.forEach(function (p) {
        lines.push('  ❓ Heard: "' + p.display_name + ' ' + p.fact_text + '" — keep?');
      });
      db.close();
    }
  } catch (_) { /* family.db not available */ }

  try {
    var cache2 = require('/Users/edge/.openclaw/workspace/lib/cache');
    var featured = cache2.get('family', 'did-you-know:featured');
    if (featured) lines.push('  💡 ' + featured);
  } catch (_) {}

  return lines.join('\n');
}
```

## Step 2: Call it in `buildDanPrompt`

After the line `var emailData = emailIntel.formatForDan(emailAnalysis);`, add:
```javascript
  var familyData = buildFamilyBlock('dan-briefing');
```

In the prompt-building return statement, add the conditional section right after the existing `(edgeDid ? 'EDGE COMPLETED OVERNIGHT:\n' + edgeDid + '\n\n' : '') +` line:
```javascript
    (familyData ? 'FAMILY & DATES:\n' + familyData + '\n\n' : '') +
```

## Step 3: Tell the LLM how to render

In the FORMAT section of the prompt (after `'5. TASKS + EMAILS — one summary line each\n\n'`), add:
```javascript
    '6. FAMILY & DATES — only if non-empty in the input. ' +
    'Use emoji prefixes exactly as given (🎂 birthdays, ❓ pending fact confirmations, 💡 did-you-know). ' +
    'If the FAMILY & DATES section is empty or not present in the input, omit this section entirely — do not say "no family events today".\n\n' +
```

## Verification

```bash
cd ~/.openclaw/workspace && /opt/homebrew/opt/node@22/bin/node scripts/daily-briefing.js --dry-run
```

If nightshift phase 9 has run AND there are upcoming birthdays / pending facts / a featured did-you-know, the briefing will include a "Family & Dates" section. Otherwise, omitted.

## Important: do not enable daily-briefing LaunchAgent without explicit Dan authorization

The LaunchAgent `~/Library/LaunchAgents/_disabled/com.edge.daily-briefing.plist` should remain disabled until Dan explicitly opts in to proactive Telegram briefings.
