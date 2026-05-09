# Graph Report - .  (2026-05-08)

## Corpus Check
- Corpus is ~21,214 words - fits in a single context window. You may not need a graph.

## Summary
- 202 nodes · 251 edges · 16 communities (13 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Backend Core|Backend Core]]
- [[_COMMUNITY_Legacy Backend Core|Legacy Backend Core]]
- [[_COMMUNITY_AI Bot and TTS|AI Bot and TTS]]
- [[_COMMUNITY_Frontend Bot Lector|Frontend Bot Lector]]
- [[_COMMUNITY_Account Pool System|Account Pool System]]
- [[_COMMUNITY_Account Pool Implementation|Account Pool Implementation]]
- [[_COMMUNITY_AI Bot Filtering|AI Bot Filtering]]
- [[_COMMUNITY_Connection Orchestration|Connection Orchestration]]
- [[_COMMUNITY_TTS Queue System|TTS Queue System]]

## God Nodes (most connected - your core abstractions)
1. `AccountPool` - 19 edges
2. `TtsQueue` - 13 edges
3. `ConnectionOrchestrator` - 12 edges
4. `reduceGift()` - 7 edges
5. `getRoomState()` - 5 edges
6. `getRoomState()` - 5 edges
7. `AccountStatus` - 4 edges
8. `AudioQueue` - 4 edges
9. `reduceChat()` - 4 edges
10. `addToQueue()` - 3 edges

## Surprising Connections (you probably didn't know these)
- None detected - all connections are within the same source files.

## Communities (16 total, 3 thin omitted)

### Community 0 - "Backend Core"
Cohesion: 0.06
Nodes (37): acc, accountPool, { AccountPool, AccountStatus }, activeTikTokConnections, addToQueue(), app, _cerr, clients (+29 more)

### Community 1 - "Legacy Backend Core"
Cohesion: 0.07
Nodes (30): activeTikTokConnections, addToQueue(), app, _cerr, clients, _clog, CONFIG_FILE, conn (+22 more)

### Community 2 - "AI Bot and TTS"
Cohesion: 0.1
Nodes (19): chatHistory, { GEMINI_API_KEY }, genAI, generateResponse(), { GoogleGenerativeAI }, model, fs, playAudio() (+11 more)

### Community 3 - "Frontend Bot Lector"
Cohesion: 0.14
Nodes (11): createDefaultViewerState(), getViewerKey(), isVipActivation(), matchesName(), reduceChat(), reduceGift(), refillBlock(), DEFAULT_BOT_CONFIG (+3 more)

### Community 4 - "Account Pool System"
Cohesion: 0.13
Nodes (11): Account, ACCOUNTS_FILE, AccountStatus, crypto, fs, path, POOL_CONFIG_FILE, { AccountPool, AccountStatus } (+3 more)

### Community 6 - "AI Bot Filtering"
Cohesion: 0.18
Nodes (10): isSpam(), { MAX_MESSAGE_LENGTH, COOLDOWN_MS }, recentMessages, userCooldowns, audioQueue, { isSpam }, targetRoom, { TIKTOK_USERNAME } (+2 more)

## Knowledge Gaps
- **85 isolated node(s):** `{ WebcastPushConnection }`, `express`, `http`, `{ Server }`, `cors` (+80 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `AccountPool` connect `Account Pool Implementation` to `Backend Core`, `Account Pool System`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `ConnectionOrchestrator` connect `Connection Orchestration` to `Account Pool System`?**
  _High betweenness centrality (0.043) - this node is a cross-community bridge._
- **Why does `TtsQueue` connect `TTS Queue System` to `Frontend Bot Lector`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **What connects `{ WebcastPushConnection }`, `express`, `http` to the rest of the system?**
  _85 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Backend Core` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Legacy Backend Core` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `AI Bot and TTS` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._