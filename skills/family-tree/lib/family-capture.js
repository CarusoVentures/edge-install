// family-capture.js — detect potential family-fact captures in a Dan-message.
// Returns candidate facts for confirmation; never auto-saves on its own.
// Wired via edge.family.capture_from_message MCP tool.

import * as family from './family.js';

// Patterns are deliberately conservative. False negatives are fine (missed facts can
// be captured via the explicit edge.family.facts.add tool or "Edge, remember..." path).
// False positives are worse — they flood the confirmation queue with junk.

const PATTERNS = [
  // "Uncle Joe loves X" / "Aunt Jane loves X" / "Mom/Dad/Grandma loves X"
  {
    regex: /\b((?:uncle|aunt|cousin|grandma|grandpa|grandmother|grandfather|mom|mother|dad|father|brother|sister|nephew|niece)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(loves?|likes?|enjoys?|adores?|is\s+obsessed\s+with)\s+(.{3,100}?)(?=[.!?\n]|$)/gi,
    extract: (m) => ({
      target_name: cleanName(m[1]),
      fact_type: 'preference',
      fact_subtype: guessSubtype(m[3]),
      fact_text: `${m[2]} ${m[3].trim()}`,
    }),
  },
  // "Uncle Joe hates X" / dislikes X
  {
    regex: /\b((?:uncle|aunt|cousin|grandma|grandpa|grandmother|grandfather|mom|mother|dad|father|brother|sister|nephew|niece)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(hates?|dislikes?|can't\s+stand|is\s+allergic\s+to)\s+(.{3,100}?)(?=[.!?\n]|$)/gi,
    extract: (m) => ({
      target_name: cleanName(m[1]),
      fact_type: 'dislike',
      fact_subtype: guessSubtype(m[3]),
      fact_text: `${m[2]} ${m[3].trim()}`,
    }),
  },
  // "Aunt Jane moved to Denver" / "is moving to" / "lives in"
  {
    regex: /\b((?:uncle|aunt|cousin|grandma|grandpa|grandmother|grandfather|mom|mother|dad|father|brother|sister|nephew|niece)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(moved\s+to|is\s+moving\s+to|lives\s+in|now\s+lives\s+in)\s+([A-Z][A-Za-z\s,]{2,60}?)(?=[.!?\n]|$)/gi,
    extract: (m) => ({
      target_name: cleanName(m[1]),
      fact_type: 'residence',
      fact_subtype: 'move',
      fact_text: `${m[2]} ${m[3].trim()}`,
    }),
  },
  // "Uncle Joe wants X for his birthday" / "mentioned wanting"
  {
    regex: /\b((?:uncle|aunt|cousin|grandma|grandpa|grandmother|grandfather|mom|mother|dad|father|brother|sister|nephew|niece)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(wants?|wanted|mentioned\s+wanting|would\s+love)\s+(.{3,120}?)(?=[.!?\n]|$)/gi,
    extract: (m) => ({
      target_name: cleanName(m[1]),
      fact_type: 'wish',
      fact_subtype: null,
      fact_text: `${m[2]} ${m[3].trim()}`,
    }),
  },
  // Bare-name variants: "Rosario loves espresso" (requires family-db match)
  {
    regex: /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(loves?|hates?|wants?|moved\s+to|lives\s+in)\s+(.{3,100}?)(?=[.!?\n]|$)/g,
    extract: (m) => {
      const verb = m[2].toLowerCase();
      let fact_type = 'preference';
      if (/hate/.test(verb)) fact_type = 'dislike';
      else if (/want/.test(verb)) fact_type = 'wish';
      else if (/move|live/.test(verb)) fact_type = 'residence';
      return {
        target_name: m[1].trim(),
        fact_type,
        fact_subtype: fact_type === 'residence' ? 'move' : guessSubtype(m[3]),
        fact_text: `${m[2]} ${m[3].trim()}`,
        bare_name: true,
      };
    },
  },
];

function cleanName(rel) {
  return String(rel).replace(/^\w+\s+/, '').trim();
}

function guessSubtype(text) {
  const t = text.toLowerCase();
  if (/\b(wine|beer|whisk(e)?y|scotch|bourbon|cocktail|drink|coffee|tea|espresso)\b/.test(t)) return 'drink';
  if (/\b(food|meal|cuisine|pizza|pasta|steak|dessert|chocolate|fruit|vegetable)\b/.test(t)) return 'food';
  if (/\b(book|novel|movie|film|show|music|song|album|band|artist)\b/.test(t)) return 'media';
  if (/\b(travel|vacation|trip|beach|mountain|skiing|hiking|golf|tennis)\b/.test(t)) return 'hobby';
  return null;
}

// Main entry — scan a message, resolve each candidate to a family member, return actionable captures.
// Does NOT write to DB. Caller decides whether to persist.
export function scan(message, { autoresolve_limit = 5 } = {}) {
  if (!message || typeof message !== 'string') return [];

  const captured = [];
  for (const patt of PATTERNS) {
    for (const m of message.matchAll(patt.regex)) {
      const c = patt.extract(m);
      if (!c || !c.target_name || !c.fact_text) continue;
      const limit = c.bare_name ? 1 : autoresolve_limit;
      const candidates = family.lookup({ query: c.target_name, limit });
      if (candidates.length === 0) continue;
      if (c.bare_name && candidates.length > 1) continue;
      const chosen = candidates[0];
      captured.push({
        gedcom_id: chosen.gedcom_id,
        person_name: chosen.display_name,
        family_relation: chosen.family_relation,
        family_closeness: chosen.family_closeness,
        target_mention: c.target_name,
        fact_type: c.fact_type,
        fact_subtype: c.fact_subtype,
        fact_text: c.fact_text,
      });
    }
  }
  const seen = new Set();
  return captured.filter(c => {
    const key = `${c.gedcom_id}|${c.fact_text.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Convenience: scan + auto-write each detected fact as pending (confirmed_by_owner=null).
export function scanAndQueue(message, { owner_agent, source_ref }) {
  if (!owner_agent) throw new Error('scanAndQueue requires owner_agent');
  const captures = scan(message);
  const persisted = [];
  for (const c of captures) {
    const row = family.factsAdd({
      gedcom_id: c.gedcom_id,
      fact_type: c.fact_type,
      fact_subtype: c.fact_subtype,
      fact_text: c.fact_text,
      source: 'trigger_phrase',
      source_ref,
      owner_agent,
      confirmed: false,
    });
    persisted.push({
      ...row,
      person_name: c.person_name,
      family_relation: c.family_relation,
      fact_text: c.fact_text,
    });
  }
  return persisted;
}
