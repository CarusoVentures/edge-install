# Architecture Decisions -- March 30, 2026

Decisions made by Ryan during planning session. These override any earlier assumptions.

## Confirmed

| Decision | Details |
|----------|---------|
| **oMLX over Ollama** | 2x faster, 50% less RAM on Apple Silicon. Native Metal acceleration. |
| **mxbai-embed-large** | Local embeddings. nomic-embed-text rejected (install failures on multiple systems). |
| **Lossless Claw** | LCM plugin for zero-loss context management. Complementary to embeddings. |
| **Qwen 3 8B** | Local chat model via oMLX for heartbeats. Free. |
| **Anthropic 3-Agent Pattern** | Generator + Evaluator separation for quality control on all subjective tasks. |
| **Outworked** | Office TV visualization. Pixel art agents in real-time. |
| **Tailscale mesh** | Networking between 4 Mac Minis. WireGuard encrypted. |
| **4 Mac Mini architecture** | Control plane + Edge + Team + Specialized/Display. Details TBD with team context. |
| **Knowledge Graph NOW** | Graphiti + Neo4j deployed in Week 1, not deferred to Month 2. |
| **Security Council in Layer 0** | Own Telegram group, not Dan's main chat. Part of foundation. |
| **Heartbeat memory auto-save** | Every 30 min via local model. Core persistence mechanism. |
| **Gas Town concept** | Dan likes the mayor metaphor. Keep the vision, implement the orchestration. |
| **No cost constraints** | VC firm, money is not the issue. Build for capability. |

| **Auto-login stays ON** | OpenClaw runs as LaunchAgent (user session required). Disabling auto-login would prevent restart after power outages. FileVault covers physical theft risk. Apple Silicon has no firmware password (Recovery Lock is MDM-only). Accepted risk. |

## Rejected / Deferred

| Decision | Reason |
|----------|--------|
| **Paperclip** | Stretch goal only. Ryan not confident it works well. Need reviews before adopting. |
| **nomic-embed-text** | Failed to install on multiple systems. Known Ollama bugs (crashes, 50/50 API failures). |
| **Gemini embeddings for Layer 0** | OAuth problems, data leaves machine. Keep for Layer 2 (non-confidential research only). |
| **30-min auto context reset** | Feels unnatural. Remove. Use standalone scripts + NOTES.md instead. |
| **Gas Town (implementation)** | Concept approved. Yegge's actual tool too complex and coding-focused for VC use. Build our own "town" using the metaphor. |

## Open Questions

| Question | Status |
|----------|--------|
| Operational dashboard (not Paperclip) | Researching alternatives now |
| Exact team roles on each Mac Mini | Need more context on Crusoe Ventures team structure |
| Which OAuth approach for Claude (subscription vs API) | TBD -- test both |
| Multi-machine agent communication pattern | Tailscale confirmed, communication protocol TBD |
| Multimodal RAG for pitch decks | Deferred to Layer 2 (privacy model needed first) |
