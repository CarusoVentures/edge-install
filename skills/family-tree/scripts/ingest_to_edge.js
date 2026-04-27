#!/usr/bin/env node
// ingest_to_edge.js — load parsed GEDCOM JSON into family.db. No child_process used; pure DB writes.
//
// Inputs:  ~/Documents/Ancestry Information/data/{people,relationships,media_index,birthdays,audit}.json
// Output:  ~/.openclaw/workspace/family/data/family.db (writes)
// Readonly:~/.openclaw/workspace/crm/data/crm.db (dedup lookups only; never modified)
//
// Dedup policy:
//   - 0 CRM matches  → plain INSERT into family_members
//   - 1 CRM match    → INSERT + crm_link row (confidence high|medium)
//   - >1 CRM matches → never auto-merge; report under needs_manual_disambig
//
// Flags:
//   --dry-run       Preview only (writes ingest-report.json, no DB changes).
//   (default)       Commit.
//   --prune-deleted Also delete family_members whose gedcom_id disappeared from current GEDCOM.
//   --rollback      Wipe all rows from family.db tables. Nuclear.
//   --manual-link=  "I142:127,I487:845" — force gedcom_id → crm.contact.id links
//   --neo4j         Stub; will write :FamilyPerson subgraph when container is provisioned
//
// Runs on Node 22 + better-sqlite3 shared from ~/.openclaw/workspace/mcp/node_modules.

import Database from '../node_modules/better-sqlite3/lib/index.js';
import fs from 'node:fs';
import path from 'node:path';

const HOME = process.env.HOME;
const DATA_DIR = path.join(HOME, 'Documents', 'Ancestry Information', 'data');
const FAMILY_DB = path.join(HOME, '.openclaw/workspace/family/data/family.db');
const CRM_DB = path.join(HOME, '.openclaw/workspace/crm/data/crm.db');
const REPORT_PATH = path.join(HOME, '.openclaw/workspace/family/data/ingest-report.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PRUNE_DELETED = args.includes('--prune-deleted');
const ROLLBACK = args.includes('--rollback');
const WRITE_NEO4J = args.includes('--neo4j');
const manualLinkArg = args.find(a => a.startsWith('--manual-link='));
const MANUAL_LINKS = parseManualLinks(manualLinkArg);

function parseManualLinks(arg) {
  if (!arg) return {};
  const out = {};
  const pairs = (arg.split('=')[1] || '').split(',');
  for (const p of pairs) {
    const [gid, cid] = p.split(':');
    if (gid && cid) out[gid.trim()] = parseInt(cid.trim(), 10);
  }
  return out;
}

// ---------------- Rollback ----------------
if (ROLLBACK) {
  console.log('ROLLBACK: deleting all rows from family.db tables...');
  const db = new Database(FAMILY_DB);
  db.pragma('foreign_keys = ON');
  db.exec(`
    DELETE FROM family_gifts;
    DELETE FROM family_facts;
    DELETE FROM crm_link;
    DELETE FROM research_cache_meta;
    DELETE FROM family_members;
    DELETE FROM sqlite_sequence WHERE name IN ('family_members','family_facts','family_gifts');
  `);
  const remain = db.prepare('SELECT COUNT(*) AS n FROM family_members').get().n;
  console.log(`  family_members rows remaining: ${remain}`);
  db.close();
  console.log('Rollback complete. Neo4j rollback (if previously written) is a separate Cypher: MATCH (p:FamilyPerson) DETACH DELETE p');
  process.exit(0);
}

// ---------------- Load inputs ----------------
function loadJson(name) {
  const p = path.join(DATA_DIR, name);
  if (!fs.existsSync(p)) {
    console.error(`FATAL: missing ${p}. Run parse_gedcom.py first.`);
    process.exit(2);
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

const people = loadJson('people.json');
const relationships = loadJson('relationships.json');
const mediaIndex = loadJson('media_index.json');

const objeDisk = new Map();
for (const o of mediaIndex.objects) objeDisk.set(o.id, o.file_on_disk);

// ---------------- Open DBs ----------------
if (!fs.existsSync(FAMILY_DB)) {
  console.error(`FATAL: family.db not found at ${FAMILY_DB}. Run schema.sql first.`);
  process.exit(2);
}
const famDb = new Database(FAMILY_DB);
famDb.pragma('foreign_keys = ON');
famDb.pragma('journal_mode = WAL');

let crmDb = null;
try {
  crmDb = new Database(CRM_DB, { readonly: true, fileMustExist: true });
  crmDb.pragma('query_only = ON');
} catch (e) {
  console.warn(`WARN: could not open CRM for dedup (${e.message}). Proceeding without CRM linking.`);
}

// ---------------- Helpers ----------------
function refreshIntervalFor(closeness) {
  if (closeness === 1) return 14;
  if (closeness === 2) return 30;
  if (closeness === 3) return 90;
  return 180;
}

function resolveMediaList(mediaRefs) {
  const paths = [];
  for (const r of mediaRefs || []) {
    const p = objeDisk.get(r);
    if (p) paths.push(p);
  }
  return paths;
}

function normName(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function firstGivenToken(display) {
  // "Kailey Ann /Caruso/" style is already stripped; display might be "Kailey Ann Caruso".
  // Take the first token (skip 2-letter initials) as the "called name".
  const tokens = normName(display).split(' ').filter(t => t.length > 1);
  return tokens[0] || '';
}

function findCrmMatches(person) {
  if (!crmDb) return [];
  const surname = person.name.surname || '';
  if (!surname) return [];
  const displayNorm = normName(person.name.display);
  const givenFirst = firstGivenToken(person.name.given || person.name.display);

  const candidates = crmDb.prepare(`
    SELECT id, name, notion_page_id
    FROM contacts
    WHERE LOWER(name) LIKE ?
  `).all(`%${surname.toLowerCase()}%`);

  const matches = [];
  for (const c of candidates) {
    const cNorm = normName(c.name);
    const cGivenFirst = firstGivenToken(c.name);

    // Hard requirements: first-given-name token AND surname must both appear in BOTH records.
    // This prevents "Robert Mario Caruso" (INDI) matching "Mario Caruso" (CRM) just because
    // "Mario Caruso" is a subset — the called name differs.
    if (!givenFirst || !cGivenFirst) continue;
    if (givenFirst !== cGivenFirst) continue;
    if (!cNorm.includes(surname.toLowerCase())) continue;

    const tokensA = new Set(displayNorm.split(' ').filter(t => t.length > 1));
    const tokensB = new Set(cNorm.split(' ').filter(t => t.length > 1));
    const inter = [...tokensA].filter(t => tokensB.has(t)).length;
    const union = new Set([...tokensA, ...tokensB]).size;
    if (union === 0) continue;
    const jaccard = inter / union;                          // inter / union, symmetric
    const overlapMin = inter / Math.min(tokensA.size, tokensB.size);

    // Accept if Jaccard is strong OR if overlap-min is strong AND first-given matches (looser middle-name case).
    if (jaccard >= 0.6 || (overlapMin >= 0.8 && jaccard >= 0.4)) {
      matches.push({
        id: c.id, name: c.name, notion_page_id: c.notion_page_id,
        jaccard: +jaccard.toFixed(2), overlap: +overlapMin.toFixed(2),
      });
    }
  }
  return matches;
}

// ---------------- Plan ----------------
const toInsert = [];
const needsManualDisambig = [];
const gedcomIds = new Set();

for (const p of people) {
  gedcomIds.add(p.id);
  if (p.id in MANUAL_LINKS) {
    toInsert.push({
      person: p,
      crmLink: { crm_contact_id: MANUAL_LINKS[p.id], matched_by: 'manual', confidence: 'manual' },
    });
    continue;
  }
  const surnameLower = (p.name.surname || '').toLowerCase();
  const interesting = surnameLower.includes('caruso') || (p.closeness_degree !== null && p.closeness_degree <= 3);
  if (!interesting) {
    toInsert.push({ person: p });
    continue;
  }
  const cands = findCrmMatches(p);
  if (cands.length === 0) {
    toInsert.push({ person: p });
  } else if (cands.length === 1) {
    const conf = cands[0].jaccard >= 0.9 ? 'high' : 'medium';
    toInsert.push({
      person: p,
      crmLink: { crm_contact_id: cands[0].id, matched_by: 'name_token_overlap', confidence: conf },
    });
  } else {
    needsManualDisambig.push({
      person: { id: p.id, name: p.name.display, birth_year: p.birth?.year, closeness: p.closeness_degree },
      candidates: cands,
    });
    toInsert.push({ person: p });
  }
}

// Inverse-conflict dedup: if multiple INDI records all link to the same CRM contact,
// none can auto-link safely. Move all such links to needs_manual_disambig.
const crmIdToIndis = new Map();  // crm_contact_id → [gedcom_id, ...]
for (const entry of toInsert) {
  if (!entry.crmLink) continue;
  const cid = entry.crmLink.crm_contact_id;
  if (!crmIdToIndis.has(cid)) crmIdToIndis.set(cid, []);
  crmIdToIndis.get(cid).push(entry.person.id);
}
for (const [cid, indiIds] of crmIdToIndis) {
  if (indiIds.length > 1) {
    // Collect the INDIs that pointed here
    const conflicting = toInsert.filter(x => x.crmLink?.crm_contact_id === cid);
    // Strip their links and record for manual disambig
    for (const entry of conflicting) {
      const p = entry.person;
      needsManualDisambig.push({
        reason: 'multiple_indis_to_one_crm',
        person: {
          id: p.id,
          name: p.name.display,
          birth_year: p.birth?.year,
          closeness: p.closeness_degree,
        },
        candidates: [{ id: cid, name: entry.crmLink.crm_contact_id, overlap: entry.crmLink.confidence }],
      });
      entry.crmLink = null;
    }
  }
}

const existingRows = famDb.prepare('SELECT gedcom_id FROM family_members').all();
const existing = new Set(existingRows.map(r => r.gedcom_id));
const orphans = [...existing].filter(g => !gedcomIds.has(g));

// ---------------- Report ----------------
const report = {
  generated_at: new Date().toISOString(),
  dry_run: DRY_RUN,
  source_counts: {
    people_json: people.length,
    relationships_json_keys: Object.keys(relationships).length,
    media_index_objects: mediaIndex.objects.length,
  },
  planned: {
    insert_or_update: toInsert.length,
    with_crm_link: toInsert.filter(x => x.crmLink).length,
    needs_manual_disambig: needsManualDisambig.length,
    orphans_previously_ingested: orphans.length,
    will_prune_deleted: PRUNE_DELETED ? orphans.length : 0,
  },
  needs_manual_disambig: needsManualDisambig,
  orphans,
};

if (DRY_RUN) {
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`DRY RUN — wrote preview to ${REPORT_PATH}`);
  console.log('Summary:');
  console.log(`  would upsert:            ${report.planned.insert_or_update}`);
  console.log(`  with CRM link:           ${report.planned.with_crm_link}`);
  console.log(`  need manual disambig:    ${report.planned.needs_manual_disambig}`);
  console.log(`  orphans (would prune):   ${report.planned.will_prune_deleted} / ${orphans.length}`);
  famDb.close();
  if (crmDb) crmDb.close();
  process.exit(0);
}

// ---------------- Commit ----------------
console.log('COMMITTING ingest to family.db...');

const upsertMember = famDb.prepare(`
  INSERT INTO family_members (
    gedcom_id, display_name, given_name, surname, suffix, sex,
    birth_date, birth_year, birth_place, death_date, death_year, death_place,
    occupation, is_living, family_closeness, family_relation, family_priority,
    media_refs, primary_media, notes, sources_count
  ) VALUES (
    @gedcom_id, @display_name, @given_name, @surname, @suffix, @sex,
    @birth_date, @birth_year, @birth_place, @death_date, @death_year, @death_place,
    @occupation, @is_living, @family_closeness, @family_relation, @family_priority,
    @media_refs, @primary_media, @notes, @sources_count
  )
  ON CONFLICT(gedcom_id) DO UPDATE SET
    display_name=excluded.display_name, given_name=excluded.given_name,
    surname=excluded.surname, suffix=excluded.suffix, sex=excluded.sex,
    birth_date=excluded.birth_date, birth_year=excluded.birth_year, birth_place=excluded.birth_place,
    death_date=excluded.death_date, death_year=excluded.death_year, death_place=excluded.death_place,
    occupation=excluded.occupation, is_living=excluded.is_living,
    family_closeness=excluded.family_closeness, family_relation=excluded.family_relation,
    family_priority=excluded.family_priority,
    media_refs=excluded.media_refs, primary_media=excluded.primary_media,
    notes=excluded.notes, sources_count=excluded.sources_count
`);
const insertLink = famDb.prepare(`
  INSERT OR REPLACE INTO crm_link (family_member_id, crm_contact_id, matched_by, confidence)
  VALUES (?, ?, ?, ?)
`);
const upsertResearchMeta = famDb.prepare(`
  INSERT INTO research_cache_meta (family_member_id, refresh_interval_days)
  VALUES (?, ?)
  ON CONFLICT(family_member_id) DO UPDATE SET refresh_interval_days = excluded.refresh_interval_days
`);
const getMemberIdByGedcom = famDb.prepare('SELECT id FROM family_members WHERE gedcom_id = ?');
const deleteMember = famDb.prepare('DELETE FROM family_members WHERE gedcom_id = ?');

let inserted = 0, updated = 0, linked = 0, pruned = 0;

const tx = famDb.transaction(() => {
  for (const { person: p, crmLink } of toInsert) {
    const existed = existing.has(p.id);
    const mediaList = resolveMediaList(p.media_refs);
    const primaryMedia = p.primary_media && objeDisk.get(p.primary_media)
      ? objeDisk.get(p.primary_media)
      : (mediaList[0] || null);

    upsertMember.run({
      gedcom_id: p.id,
      display_name: p.name.display,
      given_name: p.name.given || null,
      surname: p.name.surname || null,
      suffix: p.name.suffix || null,
      sex: p.sex || 'U',
      birth_date: p.birth?.date_iso || null,
      birth_year: p.birth?.year || null,
      birth_place: p.birth?.place || null,
      death_date: p.death?.date_iso || null,
      death_year: p.death?.year || null,
      death_place: p.death?.place || null,
      occupation: p.occupation || null,
      is_living: p.is_living ? 1 : 0,
      family_closeness: p.closeness_degree,
      family_relation: p.family_relation,
      family_priority: p.family_priority,
      media_refs: JSON.stringify(mediaList),
      primary_media: primaryMedia,
      notes: (p.notes || []).join('\n') || null,
      sources_count: p.sources_count || 0,
    });
    if (existed) updated++; else inserted++;

    const row = getMemberIdByGedcom.get(p.id);
    const memberId = row.id;
    upsertResearchMeta.run(memberId, refreshIntervalFor(p.closeness_degree));
    if (crmLink) {
      insertLink.run(memberId, crmLink.crm_contact_id, crmLink.matched_by, crmLink.confidence);
      linked++;
    }
  }
  if (PRUNE_DELETED) {
    for (const g of orphans) {
      deleteMember.run(g);
      pruned++;
    }
  }
});
tx();

report.committed = { inserted, updated, linked, pruned };
fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));

console.log('COMMIT complete.');
console.log(`  inserted:   ${inserted}`);
console.log(`  updated:    ${updated}`);
console.log(`  crm-linked: ${linked}`);
console.log(`  pruned:     ${pruned}${PRUNE_DELETED ? '' : '  (orphans left; run with --prune-deleted to remove)'}`);
console.log(`Report:      ${REPORT_PATH}`);
if (needsManualDisambig.length > 0) {
  console.log(`\n[!]  ${needsManualDisambig.length} family members have >1 CRM match and were NOT auto-linked.`);
  console.log('    Review ingest-report.json.needs_manual_disambig, then re-run with:');
  console.log('    node ingest_to_edge.js --manual-link="I123:45,I456:78"');
}
if (WRITE_NEO4J) {
  console.log('\n[!]  --neo4j flag set but Neo4j write path deferred (container not provisioned).');
}

famDb.close();
if (crmDb) crmDb.close();
