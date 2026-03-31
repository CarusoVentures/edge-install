# Research: Google Workspace Setup for edge@carusoventures.com

**Date:** 2026-03-24 through 2026-03-27
**Status:** Plan finalized, ready to execute
**Account:** edge@carusoventures.com (Google Workspace under carusoventures.com domain)

---

## Decision: Hybrid Approach

| Service | Method | Why |
|---------|--------|-----|
| **Email** | Himalaya (IMAP/SMTP with app password) | Gmail doesn't allow service account access without domain-wide delegation. Himalaya works permanently, no admin needed. Already installed on Edge (v1.2.0). |
| **Calendar** | Google Service Account (shared directly) | Share Edge's calendar with service account email. No delegation needed. Permanent. |
| **Drive** | Google Service Account (shared directly) | Share Edge's Drive folder with service account email. No delegation needed. Permanent. |

### Why NOT domain-wide delegation
- Edge only needs access to its own email, calendar, and drive — not the whole company
- Domain-wide delegation allows impersonating any user on the domain — unnecessary risk
- Direct sharing is simpler, more secure, and doesn't require admin console configuration

### Why NOT OAuth (what we had before)
- The previous setup used a GCP OAuth app in test mode
- Test mode tokens expire after 7 days
- The token expired and broke all Google access (Gmail, Calendar, Drive all returned "invalid_grant")
- Publishing the OAuth app to production is an option but requires Google verification for sensitive scopes (Gmail)
- Service account + Himalaya is faster and more permanent

---

## Part A: Himalaya for Email

### Status: Himalaya installed, needs app password configuration

**What's done:**
- Himalaya v1.2.0 installed on Edge at `/opt/homebrew/bin/himalaya`
- Supports IMAP + SMTP + sendmail + maildir + wizard + pgp

**What's needed from Ryan (browser tasks):**

**A1. Enable 2-Step Verification on edge@carusoventures.com**
1. Go to `myaccount.google.com` → sign in as `edge@carusoventures.com`
2. Left sidebar → Security
3. Under "How you sign in to Google" → 2-Step Verification → Get started
4. Follow prompts with a phone number
5. Confirm "2-Step Verification: On"

**A2. Generate App Password**
1. Still at `myaccount.google.com` → Security
2. 2-Step Verification → scroll to bottom → App passwords
3. Name: `himalaya` → Create
4. Copy the 16-character password (like `abcd efgh ijkl mnop`)
5. Save it — can't see it again

**A3. Configure Himalaya on Edge (remote — Claude does this)**
```bash
mkdir -p ~/.config/himalaya

cat > ~/.config/himalaya/config.toml << 'EOF'
[accounts.edge]
default = true
email = "edge@carusoventures.com"
display-name = "Edge Assistant"
downloads-dir = "/tmp/himalaya-downloads"

backend.type = "imap"
backend.host = "imap.gmail.com"
backend.port = 993
backend.encryption = "tls"
backend.login = "edge@carusoventures.com"
backend.passwd.cmd = "echo 'THE_APP_PASSWORD'"

message.send.backend.type = "smtp"
message.send.backend.host = "smtp.gmail.com"
message.send.backend.port = 465
message.send.backend.encryption = "tls"
message.send.backend.login = "edge@carusoventures.com"
message.send.backend.passwd.cmd = "echo 'THE_APP_PASSWORD'"
EOF

chmod 600 ~/.config/himalaya/config.toml
```

**A4. Test Email (remote — Claude does this)**
```bash
himalaya envelope list -w 120
himalaya message read <ID>
echo "Test from Edge" | himalaya message write --to "ryanshuken@gmail.com" --subject "Edge Email Test"
```

**A5. Set Up Email Forwarding from Dan**
- Sign in as Dan (dan@carusoventures.com) or have admin do it
- Gmail Settings → Forwarding and POP/IMAP → Add forwarding address: `edge@carusoventures.com`
- Confirm the verification email sent to edge@
- Select "Forward a copy" → keep Dan's copy in inbox → Save

---

## Part B: Service Account for Calendar & Drive

### Status: Not yet created

**What's needed from Ryan (browser + GCP Console):**

**B1. Open Google Cloud Console**
- Go to `console.cloud.google.com`
- Sign in (can be edge@carusoventures.com)

**B2. Create or Select a Project**
- Top bar → project dropdown → New Project
- Name: `edge-agent`
- Organization: carusoventures.com if it appears
- Create

**B3. Enable APIs**
- Left sidebar → APIs & Services → Library
- Search "Google Calendar API" → Enable
- Search "Google Drive API" → Enable
- Do NOT need Gmail API (Himalaya handles email)

**B4. Create Service Account**
- Left sidebar → IAM & Admin → Service Accounts
- Click "+ Create Service Account"
- Name: `edge-agent`
- ID: auto-fills to `edge-agent`
- Description: `Edge AI assistant - calendar and drive access for edge@carusoventures.com`
- Create and Continue → Skip role → Skip user access → Done

**B5. Create JSON Key File**
- Click on `edge-agent` in the list
- Keys tab → Add Key → Create new key → JSON → Create
- File downloads — this is the permanent credential
- Note the `client_email` field in the JSON (like `edge-agent@edge-agent-123456.iam.gserviceaccount.com`)

**B6. Share Edge's Calendar with Service Account**
- Open Google Calendar as edge@carusoventures.com
- Find Edge's calendar → three dots → Settings and sharing
- Share with specific people → Add
- Paste: `edge-agent@your-project.iam.gserviceaccount.com` (client_email from JSON)
- Permission: Make changes to events → Send

**B6b. Share Dan's Calendar (needs Dan or admin)**
- Open Calendar as Dan → Settings → Share with specific people
- Add the service account email
- Permission: See all event details (read-only)
- Send

**B7. Share Drive Folder with Service Account**
- Open Drive as edge@carusoventures.com
- Create folder "Edge Agent" (or use existing)
- Right-click → Share → add service account email → Editor → Send (uncheck notify)

**B8. Send Key File to Claude**
- Share the JSON key file path or paste contents
- Claude puts it at `~/.config/edge-service-account.json` on Edge with chmod 600

**B9. Install Python Libraries (remote — Claude does this)**
```bash
pip3 install google-auth google-api-python-client
```

**B10. Test Calendar (remote — Claude does this)**
```python
from google.oauth2 import service_account
from googleapiclient.discovery import build
import datetime

creds = service_account.Credentials.from_service_account_file(
    '/Users/edge/.config/edge-service-account.json',
    scopes=['https://www.googleapis.com/auth/calendar.readonly']
)

service = build('calendar', 'v3', credentials=creds)

now = datetime.datetime.utcnow().isoformat() + 'Z'
end = (datetime.datetime.utcnow() + datetime.timedelta(days=1)).isoformat() + 'Z'

events = service.events().list(
    calendarId='edge@carusoventures.com',
    timeMin=now, timeMax=end,
    singleEvents=True, orderBy='startTime'
).execute()

for event in events.get('items', []):
    start = event['start'].get('dateTime', event['start'].get('date'))
    print(f"{start}: {event.get('summary', 'No title')}")
```

**B11. Test Drive (remote — Claude does this)**
```python
from google.oauth2 import service_account
from googleapiclient.discovery import build

creds = service_account.Credentials.from_service_account_file(
    '/Users/edge/.config/edge-service-account.json',
    scopes=['https://www.googleapis.com/auth/drive.readonly']
)

service = build('drive', 'v3', credentials=creds)
results = service.files().list(pageSize=10, fields="files(id, name, mimeType)").execute()

for f in results.get('files', []):
    print(f"{f['name']} ({f['mimeType']})")
```

---

## Security Practices

- **No domain-wide delegation** — service account only sees what's explicitly shared with it
- **Key file permissions:** `chmod 600` — only edge user can read
- **Key file location:** `~/.config/edge-service-account.json` — not in .zshrc, not in git
- **Minimum scopes:** calendar.readonly, calendar.events, drive, drive.file — no Gmail
- **Audit logging:** Available in admin.google.com → Reporting → Audit
- **Key rotation:** Every 90 days — create new key, deploy, delete old key. Can have 2 active keys during rotation.
- **Revocation:** Delete key in Cloud Console → immediate. Or remove calendar/drive sharing.
- **Himalaya app password:** Stored in config file with chmod 600. Revocable from myaccount.google.com.

---

## Who Does What

| Step | Who | Time |
|------|-----|------|
| A1 — Enable 2FA on edge@ | Ryan (browser) | 3 min |
| A2 — Generate app password | Ryan (browser) | 2 min |
| A3 — Configure Himalaya | Claude (remote on Edge) | 2 min |
| A4 — Test email | Claude (remote on Edge) | 3 min |
| A5 — Email forwarding from Dan | Ryan + Dan/admin (browser) | 5 min |
| B1-B2 — GCP project | Ryan (browser) | 2 min |
| B3 — Enable APIs | Ryan (browser) | 2 min |
| B4 — Create service account | Ryan (browser) | 3 min |
| B5 — Download key file | Ryan (browser) | 1 min |
| B6 — Share calendars | Ryan + Dan/admin (browser) | 3 min |
| B7 — Share Drive folder | Ryan (browser) | 2 min |
| B8 — Send key file | Ryan | 1 min |
| B9 — Install Python libs | Claude (remote on Edge) | 2 min |
| B10-B11 — Test Calendar + Drive | Claude (remote on Edge) | 5 min |
