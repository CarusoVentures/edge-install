# Deploy Backup & Recovery

## Compatibility
- **OpenClaw Version**: 2026.3.27+
- **Status**: DRAFT
- **Layer**: 5 (Dev Infrastructure) — runs as a Nightman task
- **Architecture**: Bash scripts + launchd. Local backups only (no cloud). Git autosync handles workspace files. This skill handles databases and system state.

## Purpose

Nightly backup of all databases, configs, and system state to a local backup directory. Plus an infrastructure-as-code playbook that can recreate Edge on a fresh Mac Mini from git + local backups.

**Why this exists:** Edge accumulates valuable data that isn't in git — SQLite CRM (20K+ contacts), Knowledge Graph (Neo4j), email feedback history, action item audit logs. If the Mac Mini dies, the workspace can be cloned from GitHub (git autosync covers that), but the databases are gone without backups.

**What this skill does:**
1. Nightly compressed, encrypted backup of all SQLite databases
2. Nightly Neo4j database dump
3. Config snapshot with hash verification
4. LaunchAgent inventory and health check
5. System state report (packages, versions, disk space)
6. Infrastructure-as-code playbook for fresh Mac Mini deployment
7. Backup rotation (keep 7 daily + 4 weekly + 3 monthly)

## Nightly Backup Tasks (Nightman, 3:30 AM)

### 1. SQLite Databases
- Find all .db and .sqlite files in workspace
- Compress each with gzip
- Encrypt with openssl aes-256-cbc (key stored in .env)
- Store in /Users/edge/backups/YYYY-MM-DD/sqlite/

Databases backed up: crm.db, email-intel.db, transcript-tracking.db, security-council.db, urgency-feedback.db, and any others discovered.

### 2. Neo4j Database Dump
- neo4j-admin dump from the Docker container
- Compress with gzip
- Store in /Users/edge/backups/YYYY-MM-DD/neo4j/

### 3. Config Snapshot
- Copy all config/*.json files
- Generate SHA-256 hash manifest for integrity verification
- Store in /Users/edge/backups/YYYY-MM-DD/config/

### 4. LaunchAgent Inventory
- List all registered non-Apple LaunchAgents with status
- Copy all com.edge.*, com.openclaw.*, com.openagent.* plist files
- Store in /Users/edge/backups/YYYY-MM-DD/

### 5. System State Report
- JSON report: hostname, OS version, uptime, disk usage, Node version, OpenClaw version, Homebrew packages, Docker status, Python version, database file sizes, LaunchAgent count, backup size
- Store in /Users/edge/backups/YYYY-MM-DD/system-state.json

## Backup Rotation

Keep backups manageable on local disk:

| Retention | What | Storage Estimate |
|-----------|------|-----------------|
| Daily | Last 7 days | ~700MB |
| Weekly | Last 4 Sundays | ~400MB |
| Monthly | Last 3 month-ends | ~300MB |
| **Total** | | **~1.4 GB** |

Rotation script runs after backup completes. Promotes Sunday backups to weekly, month-end to monthly, deletes the rest.

## Infrastructure-as-Code Playbook

A single script (deploy-edge.sh) that takes a fresh Mac Mini to fully deployed Edge:

1. Install Homebrew + packages (node, himalaya, docker, sqlite, jq)
2. Install OpenClaw
3. Clone workspace from GitHub
4. Install oMLX + pull models (mxbai-embed-large, qwen3-8b)
5. Start Docker + Neo4j
6. Restore SQLite databases from backup (decrypt + decompress)
7. Restore Neo4j from dump
8. Deploy all LaunchAgents from backup
9. Start OpenAgent Connect enrolled agent
10. Run verification checks

This playbook is version-controlled in the workspace — git autosync backs it up automatically.

## What Gets Installed

| Component | Path | Purpose |
|-----------|------|---------|
| Backup script | scripts/backup-nightly.sh | Runs all 5 backup tasks |
| Rotation script | scripts/backup-rotate.sh | Cleans old backups per retention policy |
| Playbook | scripts/deploy-edge.sh | Fresh Mac Mini to full Edge |
| Backup dir | /Users/edge/backups/ | Local backup storage |
| Config | config/backup.json | Encryption key ref, retention rules, paths |
| TOOLS.md | TOOLS.md | manual_backup, restore_database, backup_status |

## Cost

$0/month. Everything local. ~1.4 GB disk with rotation.

## Testing

| Phase | What | Target |
|-------|------|--------|
| T1 | test-backup topic in test group | Test group |
| T2 | Backup test SQLite DB, verify compressed + encrypted | Local |
| T3 | Restore from backup, verify data matches original | Local |
| T4 | Config hash verification, introduce change, verify detected | Local |
| T5 | LaunchAgent inventory, verify all expected plists | Local |
| T6 | System state report, verify JSON complete | Local |
| T7 | Rotation: 10 fake daily backups, verify only 7 kept | Local |
| T8 | Playbook dry-run: verify syntax, skip actual installs | Local |

## Dependencies

- Git Autosync (Layer 5) — handles workspace file backup
- Nightman — triggers nightly backup
- Docker (for Neo4j dump)
- openssl (macOS built-in, for encryption)
