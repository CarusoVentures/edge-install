# Deploy Testing Suite

## Compatibility
- **OpenClaw Version**: 2026.3.27+
- **Status**: READY
- **Layer**: 0 (Foundation) -- deployed before or alongside any skill that sends external messages
- **Architecture**: Shared test infrastructure used by all skills

## Purpose

Install a shared testing framework that every skill uses for safe validation before going live. This ensures no skill ever accidentally sends messages to Dan, Emily, or any external contact during testing. All test delivery goes to Ryan (operator, Telegram ID: 7191564227).

**Why this exists:** We're deploying to a VC firm where a misfired email, wrong Telegram message, or inaccurate briefing would damage the consulting relationship and Dan's professional reputation. Every skill must be provably correct on mock data and dry-run live data before production delivery.

**What this skill does:**
1. Creates a shared test configuration framework (`config/test-defaults.json`)
2. Installs test utilities (`scripts/test-utils.js`) used by all skill test modes
3. Creates a mock data library (`data/test-fixtures/`) with sample contacts, calendar events, emails, and action items
4. Installs a test runner (`scripts/run-tests.js`) that executes all skill tests in sequence and produces a report
5. Configures Ryan's Telegram as the safe delivery target for all test modes

## Shared Test Configuration

### Test Group Architecture

Instead of sending test messages to Ryan's personal Telegram, we create a **dedicated test Telegram group** that mirrors the production topic structure. Each skill gets its own test topic — a clone of the production topic where testing happens.

This means:
- Test output is organized the same way production will be (by topic)
- Multiple people can observe tests (Ryan, Emily during onboarding, etc.)
- Test messages don't clutter anyone's personal DMs
- The test group is a live preview of what production will look like

### Test Group Setup

**Step 1:** Create a Telegram group called "Edge Testing" (or use an existing Rel HQ test group)
**Step 2:** Create topics that mirror production:

| Test Topic | Mirrors Production | What Gets Tested Here |
|------------|-------------------|----------------------|
| `#test-daily-briefing` | Dan's briefing + Emily's briefing | Morning briefing, EOD summary |
| `#test-email` | Email notifications | Email check, triage, draft approvals |
| `#test-meeting-prep` | Meeting prep delivery | Dossiers, scheduling context |
| `#test-security-council` | Security Council alerts | Nightly security review |
| `#test-action-items` | Action item approvals | Transcript → extraction → approval flow |
| `#test-transcript-pipeline` | Transcript processing notifications | Pipeline status, new transcripts processed |
| `#test-crm` | CRM update notifications | Contact discovery, sync status |
| `#test-scheduling` | Scheduling recommendations | Conflict detection, move recommendations |
| `#test-nightman` | Overnight processing reports | Enrichment results, draft follow-ups |
| `#test-errors` | Error notifications | All skill errors during testing |

**Step 3:** Record the group ID and each topic's thread ID in `test-defaults.json`

### `config/test-defaults.json`

```json
{
  "version": 1,
  "description": "Shared test configuration for all Edge skills. All delivery goes to the Edge Testing group with mirrored topics.",
  "testDelivery": {
    "telegram": {
      "groupChatId": "TBD_TEST_GROUP_ID",
      "groupName": "Edge Testing",
      "note": "Dedicated test group mirroring production topic structure. NEVER deliver tests to Dan or Emily's production channels.",
      "topics": {
        "dailyBriefing": { "threadId": "TBD", "name": "#test-daily-briefing" },
        "email": { "threadId": "TBD", "name": "#test-email" },
        "meetingPrep": { "threadId": "TBD", "name": "#test-meeting-prep" },
        "securityCouncil": { "threadId": "TBD", "name": "#test-security-council" },
        "actionItems": { "threadId": "TBD", "name": "#test-action-items" },
        "transcriptPipeline": { "threadId": "TBD", "name": "#test-transcript-pipeline" },
        "crm": { "threadId": "TBD", "name": "#test-crm" },
        "scheduling": { "threadId": "TBD", "name": "#test-scheduling" },
        "nightman": { "threadId": "TBD", "name": "#test-nightman" },
        "errors": { "threadId": "TBD", "name": "#test-errors" }
      }
    },
    "operatorDM": {
      "chatId": "7191564227",
      "username": "@ryanshuken",
      "note": "Ryan's DM — only for critical test failures and go-live approval requests, not regular test output."
    }
  },
  "testFlags": {
    "envVar": "EDGE_TEST_MODE",
    "cliFlag": "--test",
    "messagePrefix": "[TEST]"
  },
  "productionTargets": {
    "dan": { "chatId": "8730867387", "note": "Dan Caruso - client. Production only." },
    "emily": { "chatId": "TBD", "note": "Emily - EA. Production only." },
    "securityCouncil": { "chatId": "TBD", "note": "Security Council group. Production only." }
  },
  "mockDataPath": "${WORKSPACE}/data/test-fixtures",
  "testLogPath": "${WORKSPACE}/logs/test-runs"
}
```

### Mock Data Library (`data/test-fixtures/`)

Pre-built test data that exercises all code paths:

| File | Contents | Used By |
|------|----------|---------|
| `contacts.json` | 10 sample contacts with titles, companies, tags, preferred emails, EA info | Briefing, CRM, Meeting Prep, Action Items |
| `calendar-events.json` | 5 sample events: internal (moveable), external, virtual, in-person, conflict | Briefing, Meeting Prep, Scheduling |
| `emails.json` | 10 sample emails across all urgency tiers + a forwarded-from-Dan email | Briefing, Email Triage, Himalaya |
| `action-items.json` | 5 sample items: overdue, due today, waiting on, completed, future | Briefing, Action Items |
| `transcripts.json` | 2 sample meeting transcripts with action items embedded | Transcript Pipeline, Action Items |
| `nightman-results.json` | Sample overnight processing output | Briefing |
| `notion-databases.json` | Sample Notion People/Companies/Tasks query responses | All Notion-dependent skills |
| `security-baseline.txt` | Sample system baseline output | Security Council |
| `accuracy-stress-test.json` | Deliberately wrong data for accuracy agent testing | Briefing, any skill with accuracy checks |

### Test Utilities (`scripts/test-utils.js`)

Shared functions for test mode:

```javascript
// test-utils.js -- Shared test infrastructure for all Edge skills
module.exports = {
  isTestMode: () => process.env.EDGE_TEST_MODE === 'true' || process.argv.includes('--test'),
  getTestConfig: (workspace) => JSON.parse(fs.readFileSync(path.join(workspace, 'config/test-defaults.json'), 'utf8')),
  getTestTarget: (workspace) => { const cfg = module.exports.getTestConfig(workspace); return cfg.testDelivery.telegram.chatId; },
  loadMockData: (workspace, fixture) => JSON.parse(fs.readFileSync(path.join(workspace, 'data/test-fixtures', fixture), 'utf8')),
  prefixMessage: (text) => '[TEST MODE] ' + text,
  assertDeliveryTarget: (chatId) => {
    if (chatId === '8730867387' && module.exports.isTestMode()) {
      throw new Error('SAFETY: Attempted to deliver to Dan (production target) while in test mode. Aborting.');
    }
  }
};
```

The `assertDeliveryTarget` function is a safety net -- if any skill accidentally tries to send to Dan while in test mode, it throws an error instead of delivering.

### Test Runner (`scripts/run-tests.js`)

Executes all registered skill tests and produces a report:

```bash
# Run all skill tests
node scripts/run-tests.js

# Run a specific skill's test
node scripts/run-tests.js --skill briefing
node scripts/run-tests.js --skill security-council
node scripts/run-tests.js --skill email
```

Output: JSON report at `${WORKSPACE}/logs/test-runs/YYYY-MM-DD-test-report.json` with per-skill pass/fail, timing, and any errors.

## Testing Protocol (applies to ALL skills)

Every skill follows this 5-phase testing protocol:

### Phase T1: Test Group Setup & Connectivity
- Create the "Edge Testing" Telegram group (if not exists)
- Create all test topics (mirroring production topics)
- Record group ID and topic thread IDs in `test-defaults.json`
- Send a test message to each topic to verify delivery
- If any topic fails, fix before proceeding

### Phase T2: Mock Data Test
- Run the skill in test mode with mock data from `data/test-fixtures/`
- Full pipeline execution (including evaluators, accuracy agents, etc.)
- All delivery to the skill's test topic with [TEST] prefix
- Verify output matches expected results for mock data
- Check structured logs are created

### Phase T3: Live Data Dry Run
- Run the skill with REAL data sources (calendar, email, Notion)
- Deliver to the skill's test topic (not production channels)
- Operator reviews the output in the test topic for accuracy, formatting, and completeness
- This catches issues that mock data can't: API auth problems, data format changes, rate limits

### Phase T4: Stress / Edge Case Tests
- Accuracy stress test (bad data → verify corrections caught)
- Empty data test (no calendar events, no emails → verify graceful handling)
- Large data test (50 emails, 20 calendar events → verify it stays within char limits)
- Error injection test (invalid API key → verify error handling and no crash)

### Phase T5: Go-Live Approval
- All T1-T4 phases passed
- Ryan has reviewed actual output
- Go-live checklist completed (skill-specific)
- Ryan explicitly approves switching delivery targets to production
- Update config with production Telegram IDs
- Monitor first 3 production runs for any issues

## Skills That Need Testing Added (Retroactive)

| Skill | Testing Status | What Needs Adding |
|-------|---------------|-------------------|
| Security Council v2 | No test mode | Add `--test` flag that delivers to Ryan's Telegram, uses sample baseline |
| Himalaya Email | No test mode | Add `--test` flag that uses mock emails, delivers notifications to Ryan |
| Daily Briefing v3 | Testing added (this update) | Complete |
| Personal CRM v2 | No test mode | Add test Notion queries with mock data |
| Notion Workspace | No test mode | Add read/write verification with test database |
| Meeting Prep | No test mode | Add mock calendar + mock attendees |
| Transcript Pipeline | No test mode | Add sample transcript processing |
| Action Items | No test mode | Add mock transcript → extraction → approval flow |
| Urgent Email v2 | No test mode | Add mock emails with urgency classification verification |
| GitHub CI/CD | Has built-in test (PR review on test branch) | Adequate |
| Linear Integration | No test mode | Add mock GraphQL responses |
| Git Autosync v2 | No test mode | Add dry-run that commits to test branch only |

## Deployment

Deploy the testing suite as one of the first skills (Layer 0), before or alongside any skill that sends external messages. All other skills depend on `test-defaults.json` and `test-utils.js` existing.

```
mkdir -p ${WORKSPACE}/config ${WORKSPACE}/scripts ${WORKSPACE}/data/test-fixtures ${WORKSPACE}/logs/test-runs
```

Then deploy `test-defaults.json`, `test-utils.js`, mock data fixtures, and `run-tests.js` via base64 encoding.
