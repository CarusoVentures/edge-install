// lib/family.js — backing module for edge.family.* MCP tools.
// Reads/writes family.db (separate from crm.db). No Notion access.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

const FAMILY_DB_PATH = path.join(os.homedir(), '.openclaw/workspace/family/data/family.db');
const RELATIONSHIPS_JSON = path.join(os.homedir(), 'Documents/Ancestry Information/data/relationships.json');

let _db = null;
let _relsCache = null;

export function getDb() {
  if (_db) return _db;
  if (!fs.existsSync(FAMILY_DB_PATH)) {
    throw new Error(`family.db missing at ${FAMILY_DB_PATH} — run ingest_to_edge.js first`);
  }
  _db = new Database(FAMILY_DB_PATH);
  _db.pragma('foreign_keys = ON');
  return _db;
}

function getRelationships() {
  if (_relsCache) return _relsCache;
  if (!fs.existsSync(RELATIONSHIPS_JSON)) {
    _relsCache = {};
    return _relsCache;
  }
  _relsCache = JSON.parse(fs.readFileSync(RELATIONSHIPS_JSON, 'utf8'));
  return _relsCache;
}

// -------------------- LOOKUP --------------------

export function lookup({ query, limit = 5 }) {
  const db = getDb();
  const q = (query || '').trim();
  if (!q) return [];
  const likePattern = `%${q.toLowerCase()}%`;
  const rows = db.prepare(`
    SELECT id, gedcom_id, display_name, given_name, surname,
           birth_year, death_year, is_living,
           family_closeness, family_relation, family_priority,
           primary_media
    FROM family_members
    WHERE LOWER(display_name) LIKE ?
       OR LOWER(given_name) LIKE ?
       OR LOWER(surname) LIKE ?
    ORDER BY
      CASE WHEN LOWER(display_name) = LOWER(?) THEN 0
           WHEN LOWER(display_name) LIKE ? THEN 1
           ELSE 2 END,
      family_closeness ASC NULLS LAST,
      display_name
    LIMIT ?
  `).all(likePattern, likePattern, likePattern, q, `${q.toLowerCase()}%`, Math.min(limit, 50));
  return rows;
}

// -------------------- GET --------------------

export function get({ gedcom_id, name }) {
  const db = getDb();
  let row;
  if (gedcom_id) {
    row = db.prepare(`SELECT * FROM family_members WHERE gedcom_id = ?`).get(gedcom_id);
  } else if (name) {
    row = db.prepare(`SELECT * FROM family_members WHERE LOWER(display_name) = LOWER(?) LIMIT 1`).get(name);
    if (!row) {
      const cands = lookup({ query: name, limit: 1 });
      if (cands.length) {
        row = db.prepare(`SELECT * FROM family_members WHERE id = ?`).get(cands[0].id);
      }
    }
  } else {
    throw new Error('get requires gedcom_id or name');
  }
  if (!row) return null;

  const rels = getRelationships()[row.gedcom_id] || {};
  const resolveNames = (ids) => (ids || []).map(gid => {
    const r = db.prepare(`SELECT gedcom_id, display_name, family_relation, birth_year, is_living FROM family_members WHERE gedcom_id = ?`).get(gid);
    return r || { gedcom_id: gid, display_name: '(missing)' };
  });
  row.parents = resolveNames(rels.parents);
  row.spouses = resolveNames(rels.spouses);
  row.children = resolveNames(rels.children);
  row.siblings = resolveNames(rels.siblings);
  row.half_siblings = resolveNames(rels.half_siblings);

  row.facts = db.prepare(`
    SELECT fact_type, fact_subtype, fact_text, owner_agent, source,
           captured_at, confirmed_by_owner
    FROM family_facts
    WHERE family_member_id = ? AND (superseded_by IS NULL)
    ORDER BY captured_at DESC
  `).all(row.id);

  try { row.media_paths = JSON.parse(row.media_refs || '[]'); } catch { row.media_paths = []; }

  row.crm_link = db.prepare(`SELECT * FROM crm_link WHERE family_member_id = ?`).get(row.id) || null;

  return row;
}

// -------------------- UPCOMING DATES --------------------

export function upcomingDates({ days = 30, max_closeness = 3 }) {
  const db = getDb();
  const rows = db.prepare(`
    SELECT gedcom_id, display_name, birth_date, birth_year,
           family_closeness, family_relation, family_priority, is_living, primary_media
    FROM family_members
    WHERE is_living = 1
      AND family_closeness IS NOT NULL
      AND family_closeness <= ?
      AND birth_date IS NOT NULL
  `).all(Math.max(1, max_closeness));

  const today = new Date();
  const thisYear = today.getFullYear();
  const endMs = today.getTime() + days * 24 * 60 * 60 * 1000;
  const out = [];
  for (const r of rows) {
    const m = /^\d{4}-(\d{2})-(\d{2})/.exec(r.birth_date || '');
    if (!m) continue;
    const mm = parseInt(m[1], 10);
    const dd = parseInt(m[2], 10);
    if (!mm || !dd) continue;
    let cand = new Date(thisYear, mm - 1, dd, 12, 0, 0);
    if (cand.getTime() < today.getTime() - 24 * 60 * 60 * 1000) {
      cand = new Date(thisYear + 1, mm - 1, dd, 12, 0, 0);
    }
    if (cand.getTime() > endMs) continue;
    const ageThisYear = r.birth_year ? cand.getFullYear() - r.birth_year : null;
    if (r.family_closeness === 3 && ageThisYear && !(ageThisYear % 5 === 0)) continue;
    out.push({
      gedcom_id: r.gedcom_id,
      name: r.display_name,
      family_relation: r.family_relation,
      family_closeness: r.family_closeness,
      date: cand.toISOString().slice(0, 10),
      age_this_year: ageThisYear,
      is_milestone: ageThisYear && ageThisYear % 10 === 0,
      primary_media: r.primary_media,
    });
  }
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

// -------------------- RELATIONSHIP SHORTEST PATH --------------------

export function relationship({ person_a, person_b }) {
  const db = getDb();
  const resolve = (x) => {
    let r = db.prepare(`SELECT gedcom_id, display_name, family_relation, family_closeness FROM family_members WHERE gedcom_id = ?`).get(x);
    if (r) return r;
    const cands = lookup({ query: x, limit: 1 });
    if (cands.length) {
      r = db.prepare(`SELECT gedcom_id, display_name, family_relation, family_closeness FROM family_members WHERE id = ?`).get(cands[0].id);
    }
    return r || null;
  };
  const a = resolve(person_a);
  const b = resolve(person_b);
  if (!a || !b) return { ok: false, error: 'one or both people not found', a, b };

  const rels = getRelationships();
  const start = a.gedcom_id, goal = b.gedcom_id;
  if (start === goal) return { ok: true, a, b, degree: 0, path: [a] };

  const prev = new Map([[start, null]]);
  const q = [start];
  let found = false;
  while (q.length) {
    const cur = q.shift();
    if (cur === goal) { found = true; break; }
    const adj = rels[cur] || {};
    const neighbors = new Set([
      ...(adj.parents || []),
      ...(adj.children || []),
      ...(adj.spouses || []),
      ...(adj.siblings || []),
      ...(adj.half_siblings || []),
    ]);
    for (const n of neighbors) {
      if (!prev.has(n)) {
        prev.set(n, cur);
        q.push(n);
      }
    }
  }
  if (!found) return { ok: false, error: 'no path found', a, b };

  const pathIds = [];
  let cur = goal;
  while (cur != null) { pathIds.push(cur); cur = prev.get(cur); }
  pathIds.reverse();
  const pathEnriched = pathIds.map(gid =>
    db.prepare(`SELECT gedcom_id, display_name, family_relation FROM family_members WHERE gedcom_id = ?`).get(gid)
  );
  return { ok: true, a, b, degree: pathIds.length - 1, path: pathEnriched };
}

// -------------------- ORIGINS (ancestral places) --------------------

export function origins({ min_count = 1, max_closeness = null }) {
  const db = getDb();
  let where = "WHERE birth_place IS NOT NULL AND birth_place != ''";
  const params = [];
  if (max_closeness !== null && max_closeness !== undefined) {
    where += ' AND family_closeness IS NOT NULL AND family_closeness <= ?';
    params.push(max_closeness);
  }
  const rows = db.prepare(`
    SELECT birth_place, COUNT(*) AS count,
           MIN(birth_year) AS earliest_year,
           MAX(birth_year) AS latest_year
    FROM family_members
    ${where}
    GROUP BY birth_place
    HAVING COUNT(*) >= ?
    ORDER BY count DESC
  `).all(...params, min_count);

  // Group by country/region heuristically
  const byCountry = new Map();
  for (const r of rows) {
    const place = r.birth_place;
    let country = 'Unknown';
    if (/\b(italy|italia)\b/i.test(place)) country = 'Italy';
    else if (/\busa\b|\bunited states\b|, [A-Z]{2}\b|illinois|ohio|colorado|new hampshire|new york|california|massachusetts|pennsylvania|texas|florida|virginia/i.test(place)) country = 'USA';
    else if (/\bcanada\b/i.test(place)) country = 'Canada';
    else if (/\bgermany\b|\bdeutschland\b/i.test(place)) country = 'Germany';
    else if (/\bireland\b/i.test(place)) country = 'Ireland';
    else if (/\bengland\b|\bbritain\b|\buk\b/i.test(place)) country = 'England/UK';
    if (!byCountry.has(country)) byCountry.set(country, { count: 0, earliest: 9999, places: [] });
    const c = byCountry.get(country);
    c.count += r.count;
    if (r.earliest_year && r.earliest_year < c.earliest) c.earliest = r.earliest_year;
    c.places.push({ place, count: r.count });
  }

  return {
    by_country: [...byCountry.entries()].map(([country, info]) => ({
      country,
      total_individuals: info.count,
      earliest_year: info.earliest === 9999 ? null : info.earliest,
      top_places: info.places.slice(0, 5),
    })).sort((a, b) => b.total_individuals - a.total_individuals),
    raw_places: rows,
  };
}

// -------------------- FACTS.ADD --------------------

export function factsAdd({ gedcom_id, fact_type, fact_text, fact_subtype, source = 'explicit', source_ref, owner_agent, confirmed = false }) {
  if (!gedcom_id) throw new Error('factsAdd requires gedcom_id');
  if (!fact_type || !fact_text) throw new Error('factsAdd requires fact_type and fact_text');
  if (!owner_agent) throw new Error('factsAdd requires owner_agent');
  const db = getDb();
  const member = db.prepare(`SELECT id FROM family_members WHERE gedcom_id = ?`).get(gedcom_id);
  if (!member) throw new Error(`no family_members row for gedcom_id=${gedcom_id}`);
  const now = Math.floor(Date.now() / 1000);
  const confirmedVal = confirmed === true ? 1 : null;
  const result = db.prepare(`
    INSERT INTO family_facts
      (family_member_id, owner_agent, fact_type, fact_subtype, fact_text, source, source_ref, captured_at, confirmed_by_owner)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(member.id, owner_agent, fact_type, fact_subtype || null, fact_text, source, source_ref || null, now, confirmedVal);
  return {
    id: result.lastInsertRowid,
    gedcom_id,
    family_member_id: member.id,
    owner_agent,
    confirmed: confirmed === true,
    message: confirmed ? 'fact saved' : 'fact queued for confirmation in next briefing',
  };
}

// -------------------- GIFT.LOG --------------------

export function giftLog({ gedcom_id, occasion, year, item, notes, owner_agent }) {
  if (!gedcom_id) throw new Error('giftLog requires gedcom_id');
  if (!occasion) throw new Error('giftLog requires occasion');
  if (!year || !Number.isInteger(year)) throw new Error('giftLog requires integer year');
  if (!item) throw new Error('giftLog requires item');
  if (!owner_agent) throw new Error('giftLog requires owner_agent');
  const db = getDb();
  const member = db.prepare(`SELECT id FROM family_members WHERE gedcom_id = ?`).get(gedcom_id);
  if (!member) throw new Error(`no family_members row for gedcom_id=${gedcom_id}`);
  const result = db.prepare(`
    INSERT INTO family_gifts (family_member_id, owner_agent, occasion, year, item, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(member.id, owner_agent, occasion, year, item, notes || null);
  return { id: result.lastInsertRowid, gedcom_id, owner_agent };
}
