# Deploy Voice Cloning Phone Calls

## Compatibility
- **OpenClaw Version**: 2026.3.27+
- **Status**: APPROVED
- **Layer**: 1 (Communication) — killer feature
- **Architecture**: Vapi.ai (MCP server + telephony orchestration) + ElevenLabs (voice cloning) + Claude Opus (conversation logic) + Twilio (phone line) + Deepgram (speech-to-text)
- **Created**: 2026-03-30. Research: `docs/research/2026-03-30-voice-cloning-phone-calls.md`

## Purpose

Enable Edge to make phone calls in Dan's cloned voice — restaurant reservations, travel bookings, venue inquiries. Vapi's MCP server connects directly to Claude/OpenClaw so Dan or Emily can say "book a table at Frasca for 7 PM Friday" and Edge handles the entire call autonomously.

**Stack: Vapi + ElevenLabs + Claude (production approach, not MVP)**

## Setup

### Step 1: Clone Dan's Voice (One-Time, 15 min)
- Record 1-2 minutes of Dan speaking naturally (or extract from podcast/meeting recording)
- Upload to ElevenLabs via API or dashboard → get voice_id
- Dan must consent (ElevenLabs requires explicit permission)
- ElevenLabs Starter plan: $5/mo

### Step 2: Vapi Account + Phone Number
- Create Vapi account at vapi.ai
- Import or buy a Twilio phone number ($1.15/mo)
- Create a Vapi assistant:
  - LLM: Anthropic Claude (bring your own API key)
  - TTS: ElevenLabs with Dan's cloned voice_id
  - STT: Deepgram (best latency)
  - System prompt: conversation rules (polite, natural, Dan's style)

### Step 3: Install Vapi MCP Server
```json
{
  "mcpServers": {
    "vapi": {
      "command": "npx",
      "args": ["-y", "@vapi-ai/mcp-server"],
      "env": {
        "VAPI_TOKEN": "<vapi_token>"
      }
    }
  }
}
```

### Step 4: Edge Can Make Calls
"Call Frasca and book a table for 2 at 7 PM Friday" → Edge handles the entire call.

## Call Flow

```
Dan/Emily via Telegram: "Book a table at Frasca for 2 at 7 PM Friday"
         ↓
Edge parses request + looks up phone number (goplaces)
         ↓
Edge generates conversation script via Claude:
  "Request table for 2, 7 PM Friday April 4.
   If unavailable, try 6:30-8 PM range.
   If fully booked, ask about Saturday."
         ↓
Emily approves: [Confirm Call] [Modify] [Cancel]
         ↓
Vapi places the call using Dan's cloned voice
  Claude handles real-time conversation with restaurant
         ↓
Call complete → result reported:
  "✓ Frasca, 2 people, 7 PM Friday. Table by the window.
   [Add to Calendar] [Send Confirmation to Emily]"
```

## Approval Flow

| Call Type | Who Approves |
|-----------|-------------|
| Restaurant reservation | Emily or auto if Dan says "book it" |
| Travel booking (NetJets/Fly1200) | Emily always |
| Venue inquiry (no commitment) | Auto — just asking questions |
| Any call making a commitment | Emily or Dan must approve |

## Safety Rules

1. Dan must consent to voice cloning (legal requirement)
2. Never auto-call without human approval
3. Never call Dan's business contacts without explicit instruction
4. Log every call (transcript, duration, result in SQLite)
5. Call hours: 9 AM - 9 PM only
6. Restaurant/travel calls: no disclosure needed (personal, low risk)
7. Business calls: disclose "AI assistant calling on behalf of Dan Caruso"

## What Gets Installed

| Component | Path | Purpose |
|-----------|------|---------|
| Vapi MCP server | OpenClaw MCP config | Claude triggers calls natively |
| Call handler | scripts/voice-call.js | Parse request, build script, initiate call |
| Call log DB | data/voice-calls.db | History: who, when, result, transcript |
| Config | config/voice-calling.json | ElevenLabs voice_id, Vapi token, Twilio number, rules |
| TOOLS.md | TOOLS.md | make_call, call_history, call_status |

## Cost

| Component | Cost |
|-----------|------|
| ElevenLabs Starter | $5/mo |
| Vapi pay-as-you-go | ~$2-5/mo |
| Twilio phone number | $1.15/mo |
| Claude API (conversation) | ~$1-3/mo |
| **Total** | **~$10-15/month** |

## Testing

| Phase | What | Target |
|-------|------|--------|
| T1 | #test-voice-calls topic | Test group |
| T2 | Clone Ryan's voice (NOT Dan's) → verify quality | Local |
| T3 | Test call to Ryan's phone → verify sounds natural | Ryan's phone |
| T4 | Conversation test: "book a table for 2" → verify Claude handles back-and-forth | Ryan plays host |
| T5 | Call logging → verify transcript in SQLite | Check DB |
| T6 | Calendar integration: confirmed reservation → event created | Test calendar |
| T7 | Approval flow: Edge proposes → Emily approves → call placed | Test topic |
| T8 | Safety: attempt call without approval → verify blocked | Check logs |
| T9 | Clone Dan's voice (with consent) → verify quality | Dan listens |
| T10 | Live test: call a real restaurant | Dan approves |
| T11 | Go-live | Monitor |

## Dependencies

- ElevenLabs account + Dan's voice consent
- Vapi account + Twilio phone number
- Claude API (conversation logic)
- goplaces (phone number lookup)
- Google Calendar API (auto-add reservations)
- Voice Engine (Dan's conversation tone)
