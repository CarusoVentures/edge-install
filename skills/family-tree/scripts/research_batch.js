#!/usr/bin/env node
// research_batch.js — bulk-research the family tree.
//
// Two phases:
//   Phase A: place_research — for each unique birth_place, generate a one-time
//            place+era context block (Tavily web-search optional, then LLM).
//   Phase B: family_research — per-person research (parallel) using cached
//            place context + person record. Writes JSON to family_research.
//
// Strict grounding: prompt instructs the LLM to never invent personal facts;
// historical/cultural context only from general knowledge.
//
// Inputs:  family.db (read+write), Tavily API (optional), OpenRouter API.
// Output:  family_research + place_research rows. Dry-run writes to JSON file.
//
// Flags:
//   --dry-run         Process N people, save outputs to a JSON file, do NOT write to DB.
//   --limit N         Cap people processed (default unlimited; dry-run defaults to 5)
//   --closeness N     Max closeness degree (default 3)
//   --no-web          Skip Tavily — LLM-only place context.
//   --concurrency N   Parallel LLM calls (default 5).
//   --model NAME      OpenRouter model (default anthropic/claude-sonnet-4.7 with fallback)
//   --include-dan     Include closeness=0 (Dan himself). Default: skip.

import Database from '../node_modules/better-sqlite3/lib/index.js';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const HOME = process.env.HOME;
const FAMILY_DB = path.join(HOME, '.openclaw/workspace/family/data/family.db');
const OPENCLAW_CONF = path.join(HOME, '.openclaw/openclaw.json');
const REPORT_PATH = path.join(HOME, '.openclaw/workspace/family/data/research-report.json');
const DRY_RUN_OUT = path.join(HOME, '.openclaw/workspace/family/data/research-dry-run.json');

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const NO_WEB = args.includes('--no-web');
const INCLUDE_DAN = args.includes('--include-dan');
function intArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? parseInt(args[i + 1], 10) : def;
}
function strArg(name, def) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const LIMIT = intArg('--limit', DRY_RUN ? 5 : 9999);
const MAX_CLOSENESS = intArg('--closeness', 3);
const CONCURRENCY = intArg('--concurrency', 3);
const MODEL = strArg('--model', 'sonnet');  // 'sonnet' alias = latest Sonnet (4.7)

// ---------- Tavily key (web search for places only) ----------
const openclaw = JSON.parse(fs.readFileSync(OPENCLAW_CONF, 'utf8'));
let TAVILY_KEY = null;
function findTavilyKey(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (typeof obj.TAVILY_API_KEY === 'string') return obj.TAVILY_API_KEY;
  for (const v of Object.values(obj)) {
    const r = findTavilyKey(v);
    if (r) return r;
  }
  return null;
}
TAVILY_KEY = findTavilyKey(openclaw);

console.error(`research_batch ${DRY_RUN ? '(DRY-RUN)' : '(COMMIT)'} — ` +
              `closeness<=${MAX_CLOSENESS}, limit=${LIMIT}, concurrency=${CONCURRENCY}, ` +
              `model=${MODEL}, web=${NO_WEB ? 'OFF' : (TAVILY_KEY ? 'ON' : 'NO_KEY')}`);

// ---------- DB ----------
const db = new Database(FAMILY_DB);
db.pragma('foreign_keys = ON');

// ---------- Helpers: claude CLI invocation ----------
// Uses `claude -p` (Claude Code CLI) with no tools, JSON output, optional model override.
// OAuth-authenticated through user's existing Claude Code login.

function callLLM({ system, user, json = false, model = MODEL, timeoutMs = 120000 }) {
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--tools', '',
      '--output-format', 'json',
      '--no-session-persistence',
      '--model', model,
      '--system-prompt', system,
      user,
    ];
    const child = spawn('claude', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    let timer = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_) {}
      reject(new Error(`claude CLI timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', e => { clearTimeout(timer); reject(e); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${stderr.slice(0, 300)}`));
      let parsed;
      try { parsed = JSON.parse(stdout); }
      catch (e) { return reject(new Error('claude output not JSON: ' + stdout.slice(0, 300))); }
      if (parsed.is_error || parsed.subtype !== 'success') {
        return reject(new Error(`claude reported error: ${parsed.result || JSON.stringify(parsed).slice(0, 300)}`));
      }
      const content = parsed.result;
      const usage = parsed.usage || {};
      const modelUsed = Object.keys(parsed.modelUsage || {})[0] || model;
      resolve({
        content,
        model: modelUsed,
        prompt_tokens: usage.input_tokens,
        completion_tokens: usage.output_tokens,
        cost_usd: parsed.total_cost_usd,
      });
    });
  });
}

async function tavilySearch(query, { maxResults = 5 } = {}) {
  if (!TAVILY_KEY || NO_WEB) return null;
  try {
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_KEY,
        query,
        search_depth: 'basic',
        max_results: maxResults,
        include_raw_content: false,
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data.results || []).map(r => ({
      url: r.url,
      title: r.title,
      snippet: (r.content || '').slice(0, 400),
    }));
  } catch (e) {
    console.error(`  [Tavily] error: ${e.message.slice(0, 100)}`);
    return null;
  }
}

// ---------- Phase A: place research ----------

function normalizePlace(p) {
  if (!p) return null;
  return p.trim().replace(/\s+/g, ' ');
}

async function researchPlace(place, eraWindow) {
  // Check cache
  const cached = db.prepare('SELECT * FROM place_research WHERE place = ?').get(place);
  if (cached && cached.context) {
    return { fromCache: true, context: cached.context };
  }

  // Web search (places only — never names)
  let searchResults = null;
  if (!NO_WEB && TAVILY_KEY) {
    searchResults = await tavilySearch(`${place} history ${eraWindow} immigration emigration culture`);
  }

  const system = `You are a careful historical-context researcher. Given a place and an era window, write a single concise paragraph (3-5 sentences, ~120 words) describing what life was like there for ordinary people during that period. Cover only general historical/cultural facts — emigration patterns, economy, language, major events. Do NOT mention specific individuals. If you don't have reliable knowledge, say less. Output plain prose only, no headings.`;

  let user = `Place: ${place}\nEra window: ${eraWindow}`;
  if (searchResults && searchResults.length) {
    user += `\n\nWeb search results (use as context, cite implicitly):\n` +
      searchResults.map((r, i) => `[${i+1}] ${r.title}\n${r.snippet}`).join('\n\n');
  }

  const result = await callLLM({ system, user });
  if (!DRY_RUN) {
    db.prepare(`
      INSERT INTO place_research (place, era_window, context, model, generated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(place) DO UPDATE SET
        era_window = excluded.era_window,
        context    = excluded.context,
        model      = excluded.model,
        generated_at = excluded.generated_at
    `).run(place, eraWindow, result.content, result.model, Math.floor(Date.now() / 1000));
  }
  return { fromCache: false, context: result.content, model: result.model };
}

// ---------- Phase B: per-person research ----------

function buildPersonPrompt(person, kin, placeContexts) {
  const facts = [];
  facts.push(`Name: ${person.display_name}`);
  if (person.birth_year) facts.push(`Born: ${person.birth_year}${person.birth_place ? ' in ' + person.birth_place : ''}`);
  if (person.death_year) facts.push(`Died: ${person.death_year}${person.death_place ? ' in ' + person.death_place : ''}`);
  if (person.is_living === 1) facts.push('Living: yes');
  else facts.push('Living: no');
  if (person.sex) facts.push(`Sex: ${person.sex}`);
  if (person.occupation) facts.push(`Occupation: ${person.occupation}`);
  if (person.family_relation) facts.push(`Relation to Dan: ${person.family_relation} (degree ${person.family_closeness})`);
  if (person.notes) facts.push(`GEDCOM notes: ${String(person.notes).slice(0, 600)}`);
  if (kin.parents.length) facts.push(`Parents: ${kin.parents.map(k => k.name).join(', ')}`);
  if (kin.spouses.length) facts.push(`Spouse(s): ${kin.spouses.map(k => k.name).join(', ')}`);
  if (kin.children.length) facts.push(`Children: ${kin.children.map(k => k.name).join(', ')}`);
  if (kin.siblings.length) facts.push(`Siblings: ${kin.siblings.map(k => k.name).join(', ')}`);

  let placeBlock = '';
  for (const [place, ctx] of Object.entries(placeContexts)) {
    placeBlock += `\n\nPlace context — ${place}:\n${ctx}`;
  }

  return facts.join('\n') + (placeBlock || '');
}

async function researchPerson(person, kin, placeContexts) {
  const system = `You are a careful family historian writing a brief, well-grounded profile of one person from a private family tree. Strict grounding rules:
- For PERSONAL claims (what they did, felt, said, achieved as an individual): write ONLY what is explicitly in the data given. Never invent.
- For HISTORICAL/CULTURAL context (what life was like in their time and place): draw from general knowledge.
- For ERA context: tie events of their lifetime to the wider historical record.
- If data is sparse, write less. Three honest sentences beat a hallucinated paragraph.
- Tone: warm and curious, not reverent. The reader is the subject's relative — write as a thoughtful researcher briefing them.

Output ONLY a JSON object with these keys:
- story (string, 2-3 paragraphs of grounded narrative; markdown OK)
- era_context (string, 1 paragraph specifically about THEIR era — what was happening when they were alive)
- place_context (string, 1 paragraph specifically about THEIR place — adapted from the place context if provided)
- open_questions (array of 2-5 strings; specific gaps Dan could fill, like "Did Rosario travel back to Italy after settling?")
- links (array of {url, title, kind} — only well-known places/topics; e.g. Wikipedia for "Castel di Sangro". Empty if uncertain.)
- confidence (number 0-1, your honest self-rating of factual reliability)

Return ONLY the JSON. No prose around it.`;

  const user = buildPersonPrompt(person, kin, placeContexts);
  const result = await callLLM({ system, user, json: true });

  let parsed;
  try {
    parsed = JSON.parse(result.content);
  } catch (_) {
    // Try to extract JSON from possibly-wrapped content
    const m = result.content.match(/\{[\s\S]*\}/);
    if (m) parsed = JSON.parse(m[0]);
    else throw new Error('LLM did not return valid JSON: ' + result.content.slice(0, 200));
  }
  return { ...result, parsed };
}

// ---------- Helpers ----------

function getKin(personId) {
  // Look up parents/spouses/children/siblings via gedcom adjacency stored in
  // family_members + the JSON relationships.json. Use the JSON for speed.
  const RELS_JSON = path.join(HOME, 'Documents/Ancestry Information/data/relationships.json');
  const rels = fs.existsSync(RELS_JSON) ? JSON.parse(fs.readFileSync(RELS_JSON, 'utf8')) : {};
  const person = db.prepare('SELECT id, gedcom_id, display_name FROM family_members WHERE id = ?').get(personId);
  const adj = rels[person.gedcom_id] || {};
  const resolve = (ids) => (ids || []).map(gid => {
    const r = db.prepare('SELECT gedcom_id, display_name FROM family_members WHERE gedcom_id = ?').get(gid);
    return { gedcom_id: gid, name: r ? r.display_name : gid };
  });
  return {
    parents: resolve(adj.parents),
    spouses: resolve(adj.spouses),
    children: resolve(adj.children),
    siblings: resolve(adj.siblings),
  };
}

async function withConcurrency(items, limit, fn) {
  const results = [];
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      try {
        results[idx] = { ok: true, value: await fn(items[idx], idx) };
      } catch (e) {
        results[idx] = { ok: false, error: e.message };
      }
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// ---------- Main ----------

async function main() {
  // Select people
  const closenessFloor = INCLUDE_DAN ? 0 : 1;
  const people = db.prepare(`
    SELECT id, gedcom_id, display_name, sex, birth_year, birth_place, death_year, death_place,
           occupation, is_living, family_closeness, family_relation, notes
    FROM family_members
    WHERE family_closeness IS NOT NULL
      AND family_closeness >= ?
      AND family_closeness <= ?
    ORDER BY family_closeness ASC, display_name ASC
    LIMIT ?
  `).all(closenessFloor, MAX_CLOSENESS, LIMIT);

  console.error(`Selected ${people.length} people for research.`);

  if (people.length === 0) {
    console.error('Nothing to do.');
    return;
  }

  // -------- Phase A: place context --------
  // Collect all unique normalized places + era window
  const placeMap = new Map(); // place -> { years: [] }
  for (const p of people) {
    const normPlace = normalizePlace(p.birth_place);
    if (!normPlace) continue;
    if (!placeMap.has(normPlace)) placeMap.set(normPlace, { years: [] });
    if (p.birth_year) placeMap.get(normPlace).years.push(p.birth_year);
  }
  console.error(`Phase A: ${placeMap.size} unique places to research.`);

  const placeJobs = [...placeMap.entries()].map(([place, info]) => ({ place, info }));
  await withConcurrency(placeJobs, CONCURRENCY, async (job) => {
    const years = job.info.years.length ? [Math.min(...job.info.years), Math.max(...job.info.years)] : null;
    const eraWindow = years ? `${years[0]}-${years[1]}` : 'historical';
    const r = await researchPlace(job.place, eraWindow);
    process.stderr.write('.');
    return { place: job.place, era: eraWindow, fromCache: r.fromCache };
  });
  console.error(`\n  Phase A complete.`);

  // Build place context lookup for Phase B
  const placeContexts = {};
  for (const place of placeMap.keys()) {
    const row = db.prepare('SELECT context FROM place_research WHERE place = ?').get(place);
    if (row) placeContexts[place] = row.context;
  }

  // -------- Phase B: per-person research --------
  console.error(`Phase B: researching ${people.length} people (concurrency=${CONCURRENCY})...`);
  const dryRunOutput = [];
  let succeeded = 0, failed = 0;
  const personResults = await withConcurrency(people, CONCURRENCY, async (person) => {
    const kin = getKin(person.id);
    const personPlaces = {};
    if (person.birth_place && placeContexts[normalizePlace(person.birth_place)]) {
      personPlaces[person.birth_place] = placeContexts[normalizePlace(person.birth_place)];
    }
    const result = await researchPerson(person, kin, personPlaces);
    process.stderr.write('.');

    if (DRY_RUN) {
      dryRunOutput.push({
        gedcom_id: person.gedcom_id,
        name: person.display_name,
        relation: person.family_relation,
        closeness: person.family_closeness,
        birth_year: person.birth_year,
        birth_place: person.birth_place,
        is_living: person.is_living === 1,
        research: result.parsed,
        model: result.model,
        tokens: { prompt: result.prompt_tokens, completion: result.completion_tokens },
      });
    } else {
      db.prepare(`
        INSERT INTO family_research (
          family_member_id, model, story, era_context, place_context,
          open_questions, links, confidence, generated_at, prompt_tokens, completion_tokens
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        person.id,
        result.model,
        result.parsed.story || null,
        result.parsed.era_context || null,
        result.parsed.place_context || null,
        JSON.stringify(result.parsed.open_questions || []),
        JSON.stringify(result.parsed.links || []),
        typeof result.parsed.confidence === 'number' ? result.parsed.confidence : null,
        Math.floor(Date.now() / 1000),
        result.prompt_tokens || null,
        result.completion_tokens || null
      );
    }
    return person.gedcom_id;
  });
  console.error('');

  for (const r of personResults) (r.ok ? succeeded++ : failed++);
  console.error(`Phase B: ${succeeded} succeeded, ${failed} failed.`);

  if (DRY_RUN) {
    fs.writeFileSync(DRY_RUN_OUT, JSON.stringify({
      generated_at: new Date().toISOString(),
      model: MODEL,
      mode: 'dry-run',
      closeness: MAX_CLOSENESS,
      web_enabled: !NO_WEB && !!TAVILY_KEY,
      results: dryRunOutput,
    }, null, 2));
    console.error(`\nDRY RUN output → ${DRY_RUN_OUT}`);
    console.error(`Inspect with: jq '.results[].research.story' ${DRY_RUN_OUT} | head`);
  } else {
    const errors = personResults.filter(r => !r.ok).slice(0, 10).map((r, i) => ({
      idx: i, error: r.error?.slice(0, 200),
    }));
    fs.writeFileSync(REPORT_PATH, JSON.stringify({
      generated_at: new Date().toISOString(),
      model: MODEL,
      mode: 'commit',
      closeness: MAX_CLOSENESS,
      web_enabled: !NO_WEB && !!TAVILY_KEY,
      summary: { selected: people.length, succeeded, failed },
      errors,
    }, null, 2));
    console.error(`\nCOMMIT report → ${REPORT_PATH}`);
  }

  db.close();
}

main().catch(e => {
  console.error('FATAL:', e.stack || e.message);
  process.exit(1);
});
