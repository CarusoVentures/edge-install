# Deploy Knowledge Graph (Neo4j + Graphiti)

## Compatibility
- **OpenClaw Version**: 2026.3.27+
- **Status**: DRAFT — needs full implementation
- **Layer**: 0 (Foundation) — multiple skills depend on this for temporal relationship queries
- **Architecture**: Neo4j Community Edition via Docker + Graphiti Python REST wrapper + oMLX embeddings
- **Updated**: 2026-03-30. Elevated from "Month 2-3" to "Week 1" per architecture decision. Email urgency review confirmed KG is required, not optional.

## Purpose

Deploy a temporal knowledge graph that tracks relationships, interactions, deal states, commitments, and context changes over time. This is the deep memory layer that gives every skill contextual richness beyond what a flat CRM can provide.

**Why this exists:** The CRM stores current state ("John Smith is at Sequoia"). The Knowledge Graph stores temporal state ("John was a Partner at Sequoia 2023-2025, became MD in 2025. He's been involved in 3 deals with us. Last interaction was Mar 15 about a Series B. He mentioned Sundance."). Every skill that needs to understand the HISTORY of a relationship — not just its current snapshot — depends on the KG.

**What the Knowledge Graph answers that the CRM cannot:**
- "When did John change from Partner to MD?" (temporal edge tracking)
- "Has Sarah gone dormant? When did we last interact?" (relationship state)
- "What commitments did Dan make in the last meeting with Sequoia?" (commitment tracking)
- "Is this email from someone who went dark 8 months ago and is now reactivating?" (dormancy detection)
- "What's the full deal timeline for PortCo X's Series B?" (deal state progression)
- "Who introduced us to this person and through what chain?" (network path)

**What this skill does:**
1. Installs Docker on the Mac Mini (if not present)
2. Deploys Neo4j Community Edition as a Docker container with persistent volume
3. Installs the Graphiti Python library and a thin REST API wrapper (Flask)
4. Configures the Graphiti REST wrapper as a launchd service
5. Integrates oMLX embeddings (mxbai-embed-large) for graph node similarity search
6. Seeds initial data from Notion People/Companies (20K+ records) via CRM
7. Schedules nightly consistency checks and embedding refresh via Nightman
8. Creates TOOLS.md entries for graph queries
9. Verifies end-to-end: temporal queries, relationship state detection, embedding search

## Architecture

### Components

| Component | What | Where |
|-----------|------|-------|
| **Neo4j Community Edition** | Graph database engine | Docker container on Mac Mini, port 7687 (bolt) + 7474 (browser) |
| **Graphiti Python wrapper** | Temporal graph API with REST interface | Python Flask service on Mac Mini, port 8100 |
| **oMLX** | Embedding generation for graph nodes | Already running at localhost:8000 (mxbai-embed-large) |
| **neo4j-driver (Node.js)** | Direct Cypher queries from Node.js skills | npm package in workspace |
| **Persistent volume** | Neo4j data survives container restarts | Docker volume: edge-neo4j-data |

### Why Both Graphiti AND neo4j-driver?

- **Graphiti (Python)** provides temporal abstractions: "add a relationship that started on DATE" → automatically handles start/end dates, temporal edges, history preservation. Used for writes and complex temporal queries.
- **neo4j-driver (Node.js)** provides direct Cypher access from Node.js skills. Used for fast reads in real-time skills (email classification, meeting prep, briefing).
- Both talk to the same Neo4j instance. No data duplication.

### Graph Schema

**Nodes:**

| Label | Properties | Source |
|-------|-----------|--------|
| Person | name, email, email_secondary, title, role_category, interests[], notion_page_id, embedding | CRM + Notion |
| Company | name, industry, stage, website, relationship_status, notion_page_id, embedding | CRM + Notion |
| Meeting | title, date, duration, source (gemini/fathom/notion), summary, transcript_id | Transcript Pipeline |
| Email | subject, date, thread_id, urgency_score, asks[] | Email Urgency skill |
| Deal | name, stage, valuation, company_id, start_date, status | Manual + Transcript extraction |
| ActionItem | description, owner, due_date, priority, status, source_meeting_id | Action Items skill |

**Edges (all temporal — have start_date, end_date, and metadata):**

| Edge Type | From → To | Tracks |
|-----------|-----------|--------|
| WORKS_AT | Person → Company | Employment with temporal tracking (job changes) |
| ATTENDED | Person → Meeting | Who was in each meeting |
| KNOWS | Person → Person | Relationship with strength score and intro source |
| INTRODUCED_BY | Person → Person | Who introduced who (via which meeting/email) |
| SENT_EMAIL | Person → Email | Email communication |
| RECEIVED_EMAIL | Person → Email | Email communication |
| COMMITTED_TO | Person → ActionItem | "Dan promised to send metrics" |
| PART_OF_DEAL | Person → Deal | Involvement in a deal |
| HAS_INTEREST | Person → Interest | Interest tags with detection source and date |
| EA_FOR | Person → Person | EA/Executive relationship |

### Relationship State Machine

Every Person-to-Person edge has a computed `relationship_state`:

```
COLD → WARM → ACTIVE → DEEP → DORMANT → REACTIVATING
                ↑                              │
                └──────────────────────────────┘
```

| State | How Detected | Transition Trigger |
|-------|-------------|-------------------|
| COLD | No prior interaction | Default for new contacts |
| WARM | 1-2 interactions in last 90 days | First meeting or email exchange |
| ACTIVE | 3+ interactions in last 90 days | Regular meetings/emails |
| DEEP | 10+ interactions total, recent activity | Long-term relationship with ongoing engagement |
| DORMANT | No interaction in 90+ days | Time-based decay |
| REACTIVATING | New interaction after 90+ day gap | Email or meeting after dormancy |

State is recomputed nightly by Nightman. Real-time state queries use cached values.

## Embedding Integration

### How Embeddings Work with the KG

Every Person and Company node has an `embedding` property — a 1024-dim vector from mxbai-embed-large via oMLX.

**What gets embedded per person:**
```
"{name}, {title} at {company}. Interests: {interests}.
 Recent: {last_3_interactions_summary}.
 Relationship state: {state}. Known since: {first_interaction_date}."
```

**When embeddings are updated:**

| Trigger | What Gets Re-embedded | When |
|---------|----------------------|------|
| New contact created | New person node | Immediately |
| CRM data changed (title, company) | Affected person node | Immediately |
| New interaction logged | Person node (summary changes) | Within 30 min (next pipeline run) |
| Interest tag added | Person node (interests change) | Within 30 min |
| Nightly re-embed | All nodes changed in last 24 hours | Nightman (3:30-5:30 AM) |
| Bulk re-embed | All 20K+ nodes | Manual trigger or weekly scheduled |

**Embedding storage:** Stored as a node property in Neo4j. Queryable via Cypher cosine similarity functions or via the Graphiti REST API.

## Nightly KG Maintenance (Nightman Integration)

Nightman runs these KG tasks at 3:30-5:30 AM:

1. **New interaction edges**: Process all meetings and emails from the day → add interaction edges
2. **Relationship state recompute**: Recalculate state for all active relationships (time-decay check)
3. **Dormancy detection**: Flag contacts with no interaction in 90+ days
4. **Consistency check**: Compare KG nodes against CRM and Notion
   - Title mismatches → flag
   - Company mismatches → flag (possible job change)
   - Missing nodes (in CRM but not KG) → create
   - Orphan nodes (in KG but not CRM) → flag
5. **Stale embedding refresh**: Re-embed all nodes whose data changed since last embed
6. **Report**: Write results to `data/nightman/YYYY-MM-DD/kg-maintenance.json`

## Accuracy & Trust

### How We Know the KG Is Correct

| Check | How | When |
|-------|-----|------|
| **Source consistency** | KG vs CRM vs Notion: title, company, email should match | Nightly (Nightman) |
| **Temporal validity** | "works_at" edges: check if still current via recent interaction context | Nightly |
| **Dormancy accuracy** | Compare computed dormancy against actual last interaction dates | Nightly |
| **Embedding freshness** | Check embed timestamp vs last data change timestamp | Nightly |
| **Human corrections** | Dan/Emily's corrections feed back into KG as highest-priority source | Real-time |
| **Query accuracy** | Sample queries verified against known ground truth during testing | Weekly spot-check |

### What Happens When KG Disagrees with CRM

```
KG says: John Smith → works_at → Sequoia (since 2023)
CRM says: John Smith → company: "a16z"

→ INCONSISTENCY DETECTED
→ Check: which was updated more recently?
→ If CRM newer: update KG (CRM is closer to Notion source of truth)
→ If KG has evidence (email from john@sequoia.com yesterday): flag for human review
→ Don't auto-resolve ambiguous cases. Put on Edge's board.
```

## Skills That Depend on KG

| Skill | What It Queries | Priority |
|-------|----------------|----------|
| **Email Urgency** | Relationship state, deal context, commitment history, dormancy detection | REQUIRED (per this review) |
| **Daily Briefing** | Accuracy agent verifies "last interaction" claims against KG | REQUIRED |
| **Meeting Prep** | Full relationship timeline, deal state, network path | REQUIRED |
| **Action Items** | Commitment tracking ("Dan promised to...") | RECOMMENDED |
| **Contact Enrichment** | Job change detection, interest history | RECOMMENDED |
| **Transcript Pipeline** | Attendee relationship context for summary generation | RECOMMENDED |
| **CRM** | Temporal data that flat tables can't represent | RECOMMENDED |

## What Gets Installed

| Component | Path/Location | Purpose |
|-----------|--------------|---------|
| Docker | System-wide | Container runtime for Neo4j |
| Neo4j container | Docker: edge-neo4j | Graph database |
| Neo4j volume | Docker: edge-neo4j-data | Persistent data |
| Graphiti wrapper | `${WORKSPACE}/kg/graphiti-api.py` | Python REST API |
| Graphiti requirements | `${WORKSPACE}/kg/requirements.txt` | graphiti-core, flask, neo4j |
| Graphiti LaunchAgent | `~/Library/LaunchAgents/com.edge.kg-api.plist` | Keep wrapper running |
| Neo4j LaunchAgent | `~/Library/LaunchAgents/com.edge.neo4j.plist` | Keep Docker container running |
| KG config | `${WORKSPACE}/config/knowledge-graph.json` | Neo4j connection, Graphiti endpoint, embedding config |
| Seed script | `${WORKSPACE}/kg/seed-from-crm.js` | Initial load from CRM/Notion |
| Query tools | `${WORKSPACE}/tools/kg-query.js` | Node.js tool for skills to query KG |
| TOOLS.md entries | `${WORKSPACE}/TOOLS.md` | kg_query, kg_relationship, kg_timeline |

## Cost

| Component | Cost |
|-----------|------|
| Neo4j Community Edition | $0 (open source, local Docker) |
| Docker | $0 (Docker Desktop free for small business) |
| Graphiti | $0 (open source Python library) |
| oMLX embeddings | $0 (local) |
| Disk space (~1GB for 20K contacts + relationships) | Negligible |
| **Monthly total** | **$0** |

## Testing & Validation

| Phase | What | Target |
|-------|------|--------|
| T1 | Docker installs and Neo4j container starts | Local |
| T2 | Neo4j responds to Cypher query via bolt protocol | Local |
| T3 | Graphiti REST wrapper starts and responds to health check | Local |
| T4 | Seed 10 test contacts with 20 interactions from mock data | `#test-knowledge-graph` topic |
| T5 | Temporal query: "Who is John at NOW?" vs "Who was John at in 2024?" | Verify correct answers |
| T6 | Job change: add new works_at edge, verify old one preserved with end_date | Verify history |
| T7 | Relationship state: verify COLD→WARM→ACTIVE transitions | Check computed states |
| T8 | Dormancy: contact with no interaction in 91 days → DORMANT | Verify detection |
| T9 | Embedding: embed 10 contacts, semantic search "fintech Austin" | Verify relevant results |
| T10 | Consistency check: introduce CRM/KG mismatch → verify flagged | Check report |
| T11 | Scale: load 1,000 contacts, 5,000 interactions. Query time < 100ms. | Performance |
| T12 | Email integration: mock email from dormant contact → KG provides context → urgency boosted | End-to-end |
| T13 | Full seed: load 20K+ contacts from Notion/CRM (batched). Verify complete. | Monitor |

## Dependencies

- Docker (needs install on Mac Mini — not currently installed per client profile)
- Python 3.9+ (system Python on Mac Mini)
- pip for Graphiti installation
- oMLX running at localhost:8000 (Layer 0.5)
- CRM deployed (Layer 2.2) for seed data
- Notion Workspace deployed (Layer 2.1) for source of truth

## Status

DRAFT — needs Docker installation on Edge Mac Mini first. Docker is NOT currently installed (confirmed in client profile: "No Docker, Go, Rust, Java installed"). This is the first skill that requires Docker.
