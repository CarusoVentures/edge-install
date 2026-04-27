#!/usr/bin/env python3
"""
parse_gedcom.py — Ancestry.com GEDCOM 5.5.1 → structured JSON for Edge's family module.

Produces 5 files in --out-dir:
  people.json         full per-person records, enriched with closeness_degree + family_relation
  birthdays.json      living people only, sorted by (month, day)
  relationships.json  adjacency map (parents/spouses/children/siblings incl. full vs half)
  media_index.json    OBJE records reconciled against disk files via title↔filename matching
  audit.json          data-quality report

Requires: Python 3.10+ stdlib only.
"""

import argparse
import json
import re
import sys
from collections import defaultdict, deque
from datetime import date
from pathlib import Path

GEDCOM_LINE = re.compile(r"^(\d+)\s+(@[^@]+@)?\s*(\S+)?\s*(.*)$")
MONTHS = {"JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
          "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12}


# -------- GEDCOM parsing (generic tree, lossless within our needs) --------

def parse_gedcom_file(path: Path) -> list[dict]:
    """Parse a GEDCOM file into a list of top-level records, each a nested dict tree."""
    records = []
    stack: list[dict] = []  # stack[level] = current node at that level

    for raw_line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw_line.rstrip("\r")
        if not line.strip():
            continue
        m = GEDCOM_LINE.match(line)
        if not m:
            continue
        level = int(m.group(1))
        xref = m.group(2)       # may be None; only on level-0 INDI/FAM/OBJE records
        tag = m.group(3) or ""
        value = m.group(4) or ""

        # GEDCOM quirk: sometimes level 0 is "0 @I1@ INDI" (xref then tag)
        # and sometimes xref lives in the tag position "0 HEAD" (no xref).
        # Our regex handles both cases: xref is optional.
        node = {"tag": tag, "value": value, "xref": xref, "children": []}

        if level == 0:
            records.append(node)
            stack = [node]
        else:
            # attach to stack[level-1]
            while len(stack) > level:
                stack.pop()
            parent = stack[-1]
            parent["children"].append(node)
            if len(stack) == level:
                stack.append(node)
            else:
                stack[level] = node
    return records


def find_child(node: dict, tag: str) -> dict | None:
    for c in node["children"]:
        if c["tag"] == tag:
            return c
    return None


def find_children(node: dict, tag: str) -> list[dict]:
    return [c for c in node["children"] if c["tag"] == tag]


def gather_values(node: dict, tag: str) -> list[str]:
    return [c["value"] for c in node["children"] if c["tag"] == tag and c["value"]]


# -------- Date + name normalization --------

DATE_RE = re.compile(r"(?:(\d{1,2})\s+)?(?:([A-Z]{3})\s+)?(\d{3,4})")

def parse_gedcom_date(raw: str) -> dict:
    """Parse GEDCOM date into {raw, iso, year, month, day}. Handles ABT/BEF/AFT/BET prefixes and partial dates."""
    out = {"date_raw": raw, "date_iso": None, "year": None, "month": None, "day": None}
    if not raw:
        return out
    cleaned = re.sub(r"^(ABT|BEF|AFT|BET|EST|CAL|FROM|TO|CIR)\b\.?\s*", "", raw.upper()).strip()
    # "BET 1820 AND 1825" → take the first year
    cleaned = cleaned.split(" AND ")[0].strip()
    m = DATE_RE.search(cleaned)
    if not m:
        return out
    d, mon, y = m.group(1), m.group(2), m.group(3)
    if y:
        out["year"] = int(y)
    if mon and mon in MONTHS:
        out["month"] = MONTHS[mon]
    if d:
        out["day"] = int(d)
    if out["year"]:
        mm = f"{out['month']:02d}" if out["month"] else "00"
        dd = f"{out['day']:02d}" if out["day"] else "00"
        out["date_iso"] = f"{out['year']:04d}-{mm}-{dd}"
    return out


NAME_RE = re.compile(r"^(.*?)/([^/]*)/(.*)$")

def parse_gedcom_name(raw: str) -> dict:
    """Parse '/Surname/' embedded name format."""
    raw = (raw or "").strip()
    m = NAME_RE.match(raw)
    if m:
        given = m.group(1).strip()
        surname = m.group(2).strip()
        suffix = m.group(3).strip()
        display = " ".join(p for p in (given, surname, suffix) if p)
        return {"full": raw, "given": given, "surname": surname, "suffix": suffix, "display": display}
    return {"full": raw, "given": raw, "surname": "", "suffix": "", "display": raw}


# -------- Extractors --------

def extract_event(record: dict, tag: str) -> dict | None:
    """Extract BIRT/DEAT/etc. — returns {date_raw, date_iso, year, month, day, place} or None."""
    ev = find_child(record, tag)
    if not ev:
        return None
    date_node = find_child(ev, "DATE")
    place_node = find_child(ev, "PLAC")
    out = {"date_raw": None, "date_iso": None, "year": None, "month": None, "day": None, "place": None}
    if date_node:
        out.update(parse_gedcom_date(date_node["value"]))
    if place_node:
        out["place"] = place_node["value"]
    if out["date_raw"] is None and out["place"] is None:
        return None
    return out


def extract_notes(record: dict) -> list[str]:
    notes = []
    for n in find_children(record, "NOTE"):
        txt = n["value"] or ""
        for cont in n["children"]:
            if cont["tag"] == "CONT":
                txt += "\n" + cont["value"]
            elif cont["tag"] == "CONC":
                txt += cont["value"]
        if txt.strip():
            notes.append(txt.strip())
    return notes


def extract_media_refs(record: dict) -> tuple[list[str], str | None]:
    """Return (list of OBJE xrefs without @ wrappers, primary xref if marked _PRIM Y)."""
    refs = []
    primary = None
    for o in find_children(record, "OBJE"):
        if not o["value"]:
            continue
        xref = o["value"].strip().strip("@")  # normalize to match keys in objects dict
        if not xref:
            continue
        refs.append(xref)
        prim = find_child(o, "_PRIM")
        if prim and prim["value"].strip().upper() == "Y":
            primary = xref
    return refs, primary


# -------- Primary build: INDI, FAM, OBJE --------

def build_people(indi_records: list[dict]) -> dict[str, dict]:
    people = {}
    for rec in indi_records:
        xref = (rec["xref"] or "").strip("@")
        if not xref:
            continue
        name_node = find_child(rec, "NAME")
        name = parse_gedcom_name(name_node["value"] if name_node else "")
        sex_node = find_child(rec, "SEX")
        birth = extract_event(rec, "BIRT")
        death = extract_event(rec, "DEAT")
        famc = [c["value"].strip("@") for c in find_children(rec, "FAMC") if c["value"]]
        fams = [c["value"].strip("@") for c in find_children(rec, "FAMS") if c["value"]]
        occu_node = find_child(rec, "OCCU")
        media_refs, primary_media = extract_media_refs(rec)
        notes = extract_notes(rec)
        sources_count = len(find_children(rec, "SOUR"))

        people[xref] = {
            "id": xref,
            "name": name,
            "sex": (sex_node["value"].strip().upper() if sex_node else "U") or "U",
            "birth": birth,
            "death": death,
            "occupation": (occu_node["value"] if occu_node else None),
            "famc": famc,            # family where this person is a child
            "fams": fams,            # families where this person is a spouse
            "media_refs": media_refs,
            "primary_media": primary_media,
            "notes": notes,
            "sources_count": sources_count,
            # to be filled later:
            "parents": [], "spouses": [], "children": [], "siblings": [], "half_siblings": [],
            "is_living": None,
            "closeness_degree": None,
            "family_relation": None,
            "family_priority": None,
        }
    return people


def build_families(fam_records: list[dict]) -> dict[str, dict]:
    families = {}
    for rec in fam_records:
        xref = (rec["xref"] or "").strip("@")
        if not xref:
            continue
        husb = find_child(rec, "HUSB")
        wife = find_child(rec, "WIFE")
        children = [c["value"].strip("@") for c in find_children(rec, "CHIL") if c["value"]]
        families[xref] = {
            "id": xref,
            "husband": husb["value"].strip("@") if husb and husb["value"] else None,
            "wife": wife["value"].strip("@") if wife and wife["value"] else None,
            "children": children,
        }
    return families


def build_objects(obje_records: list[dict]) -> dict[str, dict]:
    objs = {}
    for rec in obje_records:
        xref = (rec["xref"] or "").strip("@")
        if not xref:
            continue
        # Ancestry GEDCOM nests TITL/FORM under FILE at level 2, not as direct OBJE children.
        # Also tolerate the level-1 location (spec-compliant).
        file_node = find_child(rec, "FILE")
        titl = find_child(rec, "TITL") or (find_child(file_node, "TITL") if file_node else None)
        form = find_child(rec, "FORM") or (find_child(file_node, "FORM") if file_node else None)
        objs[xref] = {
            "id": xref,
            "title": (titl["value"] if titl and titl["value"] else None),
            "form": (form["value"] if form and form["value"] else None),
            "file_raw": (file_node["value"] if file_node and file_node["value"] else None),
        }
    return objs


# -------- Wire up parents/spouses/children/siblings (including half-siblings) --------

def wire_relationships(people: dict, families: dict) -> None:
    # Parents + children come directly from FAM records.
    for fam in families.values():
        h, w = fam["husband"], fam["wife"]
        for child_id in fam["children"]:
            if child_id in people:
                if h and h in people:
                    people[child_id]["parents"].append(h)
                if w and w in people:
                    people[child_id]["parents"].append(w)
        if h and w and h in people and w in people:
            if w not in people[h]["spouses"]:
                people[h]["spouses"].append(w)
            if h not in people[w]["spouses"]:
                people[w]["spouses"].append(h)
        # Children (for each parent)
        for pid in (h, w):
            if pid and pid in people:
                for c in fam["children"]:
                    if c in people and c not in people[pid]["children"]:
                        people[pid]["children"].append(c)

    # Siblings: for each FAM, all CHIL are siblings of each other.
    # Full sibling = same HUSB AND same WIFE. Half sibling = shares only one of (HUSB, WIFE).
    for fam in families.values():
        h, w = fam["husband"], fam["wife"]
        kids = fam["children"]
        for i, a in enumerate(kids):
            if a not in people:
                continue
            for b in kids[i + 1:]:
                if b not in people or a == b:
                    continue
                # We'll compare via shared-parent analysis: two children share a FAM → sibling.
                # Type depends on the *union* of parents across all FAMs containing both.
                pa = set(people[a]["parents"])
                pb = set(people[b]["parents"])
                shared = pa & pb
                if len(shared) >= 2:
                    if b not in people[a]["siblings"]:
                        people[a]["siblings"].append(b)
                    if a not in people[b]["siblings"]:
                        people[b]["siblings"].append(a)
                elif len(shared) == 1:
                    if b not in people[a]["half_siblings"]:
                        people[a]["half_siblings"].append(b)
                    if a not in people[b]["half_siblings"]:
                        people[b]["half_siblings"].append(a)


# -------- Dan's ID disambiguation helper --------

def find_daniel_candidates(people: dict) -> list[dict]:
    """Return possible Daniel Caruso INDI records with disambiguating context."""
    cands = []
    for pid, p in people.items():
        disp = p["name"]["display"].lower()
        if "daniel" in disp and "caruso" in disp:
            parents_str = ", ".join(people[x]["name"]["display"] for x in p["parents"] if x in people) or "—"
            spouses_str = ", ".join(people[x]["name"]["display"] for x in p["spouses"] if x in people) or "—"
            cands.append({
                "id": pid,
                "display": p["name"]["display"],
                "birth_year": (p["birth"] or {}).get("year"),
                "death_year": (p["death"] or {}).get("year"),
                "parents": parents_str,
                "spouses": spouses_str,
            })
    cands.sort(key=lambda c: (c["birth_year"] or 9999))
    return cands


def print_candidate_report(candidates: list[dict]) -> None:
    print("\nMultiple 'Daniel Caruso' INDI records found. Rerun with --dan-gedcom-id=<id>:\n", file=sys.stderr)
    for c in candidates:
        bd = f"b.{c['birth_year']}" if c["birth_year"] else "b.?"
        dd = f" d.{c['death_year']}" if c["death_year"] else ""
        print(f"  {c['id']:6s}  {c['display']:35s}  {bd}{dd}", file=sys.stderr)
        print(f"           parents: {c['parents']}", file=sys.stderr)
        print(f"           spouses: {c['spouses']}\n", file=sys.stderr)


# -------- BFS for closeness + relation labels --------

def bfs_closeness(people: dict, start_id: str) -> dict[str, int]:
    """Return {person_id: min hops from start over parent/child/spouse/sibling/half-sibling edges}."""
    if start_id not in people:
        raise SystemExit(f"Dan's GEDCOM id '{start_id}' not found in people")
    dist: dict[str, int] = {start_id: 0}
    q = deque([start_id])
    while q:
        cur = q.popleft()
        p = people[cur]
        neighbors = set(p["parents"]) | set(p["children"]) | set(p["spouses"]) | set(p["siblings"]) | set(p["half_siblings"])
        for n in neighbors:
            if n not in dist and n in people:
                dist[n] = dist[cur] + 1
                q.append(n)
    return dist


RELATION_BY_PATH = {
    # Will be filled by structural inference below; this is a fallback map for small degrees.
}

def label_relations(people: dict, dan_id: str) -> None:
    """Assign family_relation labels for closeness ≤ 3 using direct graph inspection."""
    if dan_id not in people:
        return
    dan = people[dan_id]
    parents = set(dan["parents"])
    spouses = set(dan["spouses"])
    children = set(dan["children"])
    siblings = set(dan["siblings"])
    half_siblings = set(dan["half_siblings"])

    # Degree 2 sets (grandparents, in-laws, grandchildren, nieces/nephews, aunts/uncles)
    grandparents = set()
    for pid in parents:
        grandparents.update(people[pid].get("parents", []))
    grandchildren = set()
    for cid in children:
        grandchildren.update(people[cid].get("children", []))
    # Aunts/uncles = parents' siblings (incl. half)
    aunts_uncles = set()
    aunts_uncles_half = set()
    for pid in parents:
        aunts_uncles.update(people[pid].get("siblings", []))
        aunts_uncles_half.update(people[pid].get("half_siblings", []))
    # Nieces/nephews = siblings' children
    nieces_nephews = set()
    for sid in siblings | half_siblings:
        nieces_nephews.update(people[sid].get("children", []))
    # In-laws = parents of spouses
    parents_in_law = set()
    for sp in spouses:
        parents_in_law.update(people[sp].get("parents", []))
    # Siblings-in-law = spouses' siblings + siblings' spouses
    siblings_in_law = set()
    for sp in spouses:
        siblings_in_law.update(people[sp].get("siblings", []))
        siblings_in_law.update(people[sp].get("half_siblings", []))
    for s in siblings | half_siblings:
        siblings_in_law.update(people[s].get("spouses", []))

    # Degree 3 (first cousins, great-grandparents)
    first_cousins = set()
    for au in aunts_uncles | aunts_uncles_half:
        first_cousins.update(people[au].get("children", []))
    great_grandparents = set()
    for gp in grandparents:
        great_grandparents.update(people[gp].get("parents", []))
    great_aunts_uncles = set()
    for gp in grandparents:
        great_aunts_uncles.update(people[gp].get("siblings", []))

    labels: list[tuple[set[str], str]] = [
        (parents, "parent"),
        (spouses, "spouse"),
        (children, "child"),
        (siblings, "sibling"),
        (half_siblings, "half-sibling"),
        (grandparents, "grandparent"),
        (grandchildren, "grandchild"),
        (aunts_uncles, "aunt/uncle"),
        (aunts_uncles_half, "half-aunt/uncle"),
        (nieces_nephews, "niece/nephew"),
        (parents_in_law, "parent-in-law"),
        (siblings_in_law, "sibling-in-law"),
        (first_cousins, "first cousin"),
        (great_grandparents, "great-grandparent"),
        (great_aunts_uncles, "great-aunt/uncle"),
    ]
    for pid in people:
        if pid == dan_id:
            people[pid]["family_relation"] = "self"
    for s, lbl in labels:
        for pid in s:
            if pid in people and people[pid]["family_relation"] is None:
                people[pid]["family_relation"] = lbl


def priority_for_degree(d: int | None) -> str | None:
    if d is None:
        return None
    return {1: "Very High", 2: "High", 3: "Medium", 4: "Low"}.get(d) or None


def mark_living(people: dict, cutoff_years: int, today: date) -> None:
    current_year = today.year
    for p in people.values():
        has_death = p["death"] is not None and (p["death"].get("date_raw") or p["death"].get("place"))
        birth_year = (p["birth"] or {}).get("year")
        if has_death:
            p["is_living"] = False
        elif birth_year is None:
            p["is_living"] = False  # safer: don't surface unknowns as living
        elif birth_year >= current_year - cutoff_years:
            p["is_living"] = True
        else:
            p["is_living"] = False


# -------- Media reconciliation --------

TOKEN_RE = re.compile(r"[a-z0-9]+")

def tokenize(s: str) -> set[str]:
    return set(TOKEN_RE.findall((s or "").lower()))


def reconcile_media(objects: dict, media_dir: Path) -> dict:
    disk_files = []
    if media_dir.exists():
        for f in sorted(media_dir.iterdir()):
            if f.is_file() and f.suffix.lower() in {".jpg", ".jpeg", ".png"}:
                disk_files.append({
                    "filename": f.name,
                    "absolute_path": str(f.resolve()),
                    "size_bytes": f.stat().st_size,
                    "matched_obje_id": None,
                    "match_confidence": "none",
                })

    # Best-match each disk file to an OBJE by token overlap against TITL.
    for df in disk_files:
        best_id = None
        best_score = 0.0
        f_tokens = tokenize(df["filename"].rsplit(".", 1)[0])
        for ox, o in objects.items():
            o_tokens = tokenize(o.get("title"))
            if not o_tokens or not f_tokens:
                continue
            inter = len(f_tokens & o_tokens)
            union = len(f_tokens | o_tokens)
            if union == 0:
                continue
            jaccard = inter / union
            if jaccard > best_score:
                best_score = jaccard
                best_id = ox
        if best_id and best_score >= 0.8:
            df["matched_obje_id"] = best_id
            df["match_confidence"] = "high"
        elif best_id and best_score >= 0.5:
            df["matched_obje_id"] = best_id
            df["match_confidence"] = "medium"
        elif best_id and best_score >= 0.3:
            df["matched_obje_id"] = best_id
            df["match_confidence"] = "low"

    # Annotate OBJE records with resolved disk paths.
    resolved_by_obje = defaultdict(list)
    for df in disk_files:
        if df["matched_obje_id"]:
            resolved_by_obje[df["matched_obje_id"]].append(df["absolute_path"])
    objects_out = []
    matched_obje_ids = set()
    for ox, o in objects.items():
        paths = resolved_by_obje.get(ox, [])
        if paths:
            matched_obje_ids.add(ox)
        objects_out.append({
            "id": ox,
            "title": o.get("title"),
            "form": o.get("form"),
            "file_on_disk": paths[0] if paths else None,
            "all_disk_matches": paths,
        })
    stats = {
        "obje_total": len(objects),
        "disk_total": len(disk_files),
        "matched": len(matched_obje_ids),
        "unmatched_obje": len(objects) - len(matched_obje_ids),
        "unmatched_disk": sum(1 for df in disk_files if df["matched_obje_id"] is None),
    }
    return {"objects": objects_out, "disk_files": disk_files, "stats": stats}


# -------- Audit --------

def build_audit(people: dict, families: dict, objects: dict, media_report: dict,
                source_file: str, gedcom_version: str) -> dict:
    issues = {
        "missing_birth_date": [],
        "missing_death_for_likely_deceased": [],
        "malformed_dates": [],
        "broken_media_refs": [],
        "orphan_individuals": [],
        "duplicate_name_warnings": [],
    }
    for pid, p in people.items():
        if not (p["birth"] and p["birth"].get("date_raw")):
            issues["missing_birth_date"].append({"id": pid, "name": p["name"]["display"]})
        birth_year = (p["birth"] or {}).get("year")
        has_death = p["death"] is not None and (p["death"].get("date_raw") or p["death"].get("place"))
        if birth_year and birth_year < 1900 and not has_death:
            issues["missing_death_for_likely_deceased"].append({
                "id": pid, "name": p["name"]["display"], "birth_year": birth_year,
            })
        for ev_name, ev in (("birth", p["birth"]), ("death", p["death"])):
            if ev and ev.get("date_raw") and not ev.get("year"):
                issues["malformed_dates"].append({
                    "id": pid, "field": ev_name, "raw": ev["date_raw"],
                })
        for obje_id in p["media_refs"]:
            obj = objects.get(obje_id)
            # resolve via media_report
            resolved = next((o for o in media_report["objects"] if o["id"] == obje_id), None)
            if resolved and not resolved["file_on_disk"]:
                issues["broken_media_refs"].append({
                    "indi_id": pid, "obje_id": obje_id,
                    "title": obj.get("title") if obj else None,
                    "reason": "no disk file matched",
                })
        if not p["parents"] and not p["spouses"] and not p["children"]:
            issues["orphan_individuals"].append({"id": pid, "name": p["name"]["display"]})

    # duplicate names
    by_name = defaultdict(list)
    for pid, p in people.items():
        by_name[p["name"]["display"].lower()].append(pid)
    for disp, ids in by_name.items():
        if len(ids) > 1:
            issues["duplicate_name_warnings"].append({"display": disp, "ids": ids})

    living_count = sum(1 for p in people.values() if p["is_living"])
    deceased_count = sum(1 for p in people.values() if not p["is_living"])
    complete = sum(
        1 for p in people.values()
        if (p["birth"] and p["birth"].get("year")) and (p["sex"] in ("M", "F"))
    )
    summary = {
        "living_count": living_count,
        "deceased_count": deceased_count,
        "complete_records_pct": round(100.0 * complete / max(len(people), 1), 1),
    }
    return {
        "generated_at": date.today().isoformat(),
        "source_gedcom": source_file,
        "gedcom_version": gedcom_version,
        "counts": {
            "individuals": len(people),
            "families": len(families),
            "media_objects": len(objects),
        },
        "issues": issues,
        "summary": summary,
    }


# -------- Main --------

def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--gedcom", required=True, type=Path)
    ap.add_argument("--media-dir", required=True, type=Path)
    ap.add_argument("--out-dir", required=True, type=Path)
    ap.add_argument("--dan-gedcom-id", default=None,
                    help="Dan's INDI id like I487; if omitted, prints candidates and exits")
    ap.add_argument("--living-cutoff-years", type=int, default=100)
    args = ap.parse_args()

    if not args.gedcom.exists():
        print(f"ERROR: GEDCOM file not found: {args.gedcom}", file=sys.stderr)
        return 2

    args.out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[1/7] Parsing GEDCOM {args.gedcom} ...", file=sys.stderr)
    records = parse_gedcom_file(args.gedcom)
    head = next((r for r in records if r["tag"] == "HEAD"), None)
    gedcom_version = "unknown"
    if head:
        gedc = find_child(head, "GEDC")
        if gedc:
            vers = find_child(gedc, "VERS")
            if vers:
                gedcom_version = vers["value"]

    indi_records = [r for r in records if r["tag"] == "INDI"]
    fam_records = [r for r in records if r["tag"] == "FAM"]
    obje_records = [r for r in records if r["tag"] == "OBJE"]
    print(f"      {len(indi_records)} INDI, {len(fam_records)} FAM, {len(obje_records)} OBJE records", file=sys.stderr)

    print("[2/7] Building people/families/objects ...", file=sys.stderr)
    people = build_people(indi_records)
    families = build_families(fam_records)
    objects = build_objects(obje_records)

    print("[3/7] Wiring relationships (incl. full vs half-sibling detection) ...", file=sys.stderr)
    wire_relationships(people, families)

    if not args.dan_gedcom_id:
        candidates = find_daniel_candidates(people)
        if not candidates:
            print("\nNo 'Daniel Caruso' candidates found — is the spelling exact in the GEDCOM?", file=sys.stderr)
            return 3
        print_candidate_report(candidates)
        return 3

    dan_id = args.dan_gedcom_id.strip()
    if dan_id not in people:
        print(f"\nERROR: --dan-gedcom-id '{dan_id}' not found in GEDCOM.", file=sys.stderr)
        candidates = find_daniel_candidates(people)
        if candidates:
            print_candidate_report(candidates)
        return 2

    print(f"[4/7] BFS closeness from Dan ({dan_id}) ...", file=sys.stderr)
    dist = bfs_closeness(people, dan_id)
    for pid, p in people.items():
        p["closeness_degree"] = dist.get(pid)
        p["family_priority"] = priority_for_degree(p["closeness_degree"])

    print("[5/7] Labeling relations for closeness ≤ 3 ...", file=sys.stderr)
    label_relations(people, dan_id)

    print(f"[6/7] Marking living with cutoff {args.living_cutoff_years}y ...", file=sys.stderr)
    mark_living(people, args.living_cutoff_years, date.today())

    print("[7/7] Reconciling media ...", file=sys.stderr)
    media_report = reconcile_media(objects, args.media_dir)

    # ---- Write outputs ----
    people_out = []
    for pid in sorted(people):
        p = people[pid]
        people_out.append({
            "id": pid,
            "name": p["name"],
            "sex": p["sex"],
            "birth": p["birth"],
            "death": p["death"],
            "occupation": p["occupation"],
            "is_living": p["is_living"],
            "closeness_degree": p["closeness_degree"],
            "family_relation": p["family_relation"],
            "family_priority": p["family_priority"],
            "parents": p["parents"],
            "spouses": p["spouses"],
            "children": p["children"],
            "siblings": p["siblings"],
            "half_siblings": p["half_siblings"],
            "media_refs": p["media_refs"],
            "primary_media": p["primary_media"],
            "notes": p["notes"],
            "sources_count": p["sources_count"],
        })

    (args.out_dir / "people.json").write_text(json.dumps(people_out, indent=2, ensure_ascii=False), encoding="utf-8")

    # birthdays.json — living only, sorted by mmdd
    now = date.today()
    birthdays = []
    for p in people_out:
        if not p["is_living"] or not p["birth"]:
            continue
        m, d, y = p["birth"].get("month"), p["birth"].get("day"), p["birth"].get("year")
        if not (m and d):
            continue
        age_this_year = (now.year - y) if y else None
        birthdays.append({
            "id": p["id"],
            "name": p["name"]["display"],
            "month": m, "day": d,
            "birth_year": y,
            "age_this_year": age_this_year,
            "mmdd": f"{m:02d}-{d:02d}",
            "closeness_degree": p["closeness_degree"],
            "family_relation": p["family_relation"],
            "family_priority": p["family_priority"],
        })
    birthdays.sort(key=lambda b: (b["month"], b["day"]))
    (args.out_dir / "birthdays.json").write_text(json.dumps({
        "generated_at": now.isoformat(),
        "cutoff_years": args.living_cutoff_years,
        "count": len(birthdays),
        "entries": birthdays,
    }, indent=2, ensure_ascii=False), encoding="utf-8")

    # relationships.json
    rels = {}
    for p in people_out:
        rels[p["id"]] = {
            "parents": p["parents"],
            "spouses": p["spouses"],
            "children": p["children"],
            "siblings": p["siblings"],
            "half_siblings": p["half_siblings"],
        }
    (args.out_dir / "relationships.json").write_text(json.dumps(rels, indent=2, ensure_ascii=False), encoding="utf-8")

    # media_index.json — reconciled
    (args.out_dir / "media_index.json").write_text(json.dumps(media_report, indent=2, ensure_ascii=False), encoding="utf-8")

    # audit.json
    audit = build_audit(people, families, objects, media_report,
                        source_file=args.gedcom.name, gedcom_version=gedcom_version)
    (args.out_dir / "audit.json").write_text(json.dumps(audit, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"\nOK: wrote 5 files to {args.out_dir}", file=sys.stderr)
    print(f"  people.json         {len(people_out)} records", file=sys.stderr)
    print(f"  birthdays.json      {len(birthdays)} living w/ birthday", file=sys.stderr)
    print(f"  relationships.json  {len(rels)} adjacency rows", file=sys.stderr)
    print(f"  media_index.json    {media_report['stats']}", file=sys.stderr)
    print(f"  audit.json          living={audit['summary']['living_count']} "
          f"deceased={audit['summary']['deceased_count']} "
          f"complete={audit['summary']['complete_records_pct']}%", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
