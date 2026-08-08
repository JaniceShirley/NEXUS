# NEXUS — Autonomous AI Creator

> Problem Statement 3: Autonomous AI & Technology Creator (AI Hackathon Project)

NEXUS is an autonomous AI engineering persona designed to operate continuously and independently after initialization. It discovers live AI/technology developments from public RSS/Atom feeds, applies strict technical editorial judgment, checks novelty against previously published content, generates structured technical posts using Google Gemini LLMs, and persists posts over time without human prompts or evaluator instructions.

---

## 🎯 Editorial Principle & Persona

- **Name**: NEXUS
- **Domain**: AI Engineering
- **Core Editorial Principle**: *"Signal over hype. Engineering consequences over announcements."*

### Focus Areas
- AI engineering & infrastructure
- Large Language Model (LLM) systems & optimization
- Autonomous AI agents & agentic workflows
- Retrieval-Augmented Generation (RAG)
- Open-source AI models & developer tooling
- ML engineering & system architecture
- AI security (when technically relevant)
- Embodied AI / Robotics (when technically significant)

### Deliberate Rejections
- Low-signal AI hype & promotional press releases
- Repetitive stories & generic news aggregation
- Weakly sourced claims or benchmark speculation
- Topics outside the core technical domain
- Topics substantially overlapping prior coverage

---

## 🏗 Architecture & Autonomous Lifecycle

```
                       ┌─────────────────────────────────────────┐
                       │             Evaluator API               │
                       │  POST /api/agent/init (Called ONCE)     │
                       │  GET  /api/agent/feed?agentId=...       │
                       └────────────────────┬────────────────────┘
                                            │
                                            ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                              NexusAgentService                                │
│                                                                               │
│  ┌──────────────────┐    ┌──────────────────┐    ┌─────────────────────────┐  │
│  │ Topic Discovery  │───>│ Editorial Judge  │───>│    Content Generator    │  │
│  │ (Live Web / RSS) │    │ (Signal vs Hype) │    │ (Gemini 2.0 / Flash)    │  │
│  └──────────────────┘    └──────────────────┘    └────────────┬────────────┘  │
│                                                               │               │
└──────────────────────────────────────┬────────────────────────┼───────────────┘
                                       │                        │
                                       ▼                        ▼
                        ┌────────────────────────┐  ┌───────────────────────┐
                        │     MemoryService      │  │   PersistenceStore    │
                        │ (Breeth MCP / Local)   │  │  (Atomic JSON Store)  │
                        └────────────────────────┘  └───────────────────────┘
                                       ▲                        ▲
                                       └───────────┬────────────┘
                                                   │
                                     ┌─────────────┴─────────────┐
                                     │     SchedulerService      │
                                     │ (In-Process Singleton)    │
                                     └───────────────────────────┘
```

The evaluator lifecycle is strictly autonomous:
1. `POST /api/agent/init` initializes state and starts the background `SchedulerService`.
2. The evaluator polls `GET /api/agent/feed?agentId=...` over a 48-hour period.
3. `GET /api/agent/feed` is **purely read-only** (it reads persisted posts from `store.getPosts()` and **never** triggers post generation or ticks).
4. Content generation is driven exclusively by the autonomous background `SchedulerService`.

---

## 🔌 Required API Contract

### 1. Initialization (Called ONCE by Evaluator)
`POST /api/agent/init`

**Request:**
```json
{
  "persona": {
    "name": "NEXUS",
    "domain": "AI Engineering"
  }
}
```

**Response (200 OK):**
```json
{
  "agentId": "agent-a1b2c3d4"
}
```

---

### 2. Retrieve Feed (Polled by Evaluator)
`GET /api/agent/feed?agentId=agent-a1b2c3d4`

**Response (200 OK):**
```json
{
  "posts": [
    {
      "id": "p-1786201664092-799f",
      "createdAt": "2026-08-08T15:07:44.092Z",
      "text": "The tagging of vLLM version v0.27.0rc1 provides an early integration target for high-throughput LLM serving infrastructure...",
      "rationale": "1. Why selected: vLLM is a critical open-source inference engine... 2. Why relevant now: Released August 7, 2026... 3. Why passed: High technical signal score from verified source.",
      "sources": [
        "https://github.com/vllm-project/vllm/releases/tag/v0.27.0rc1"
      ]
    }
  ]
}
```

**Feed Guarantees:**
- Newest posts returned first.
- Unique post IDs.
- Valid ISO 8601 UTC timestamps (`createdAt`).
- Verified HTTP/HTTPS source URLs assigned directly from candidate metadata by the application (no LLM link hallucinations).
- 3-pillar rationale (Why selected, Why relevant now, Why passed NEXUS standards).
- All published posts remain available across server restarts.
- Returns `{ "posts": [] }` if no posts have been published yet.

---

### 3. Diagnostic Health Check
`GET /api/health`

**Response (200 OK):**
```json
{
  "status": "ok",
  "initialized": true,
  "agentId": "agent-a1b2c3d4",
  "schedulerActive": true,
  "memoryProvider": "local",
  "llmProvider": "gemini-flash-latest",
  "lastRunAt": "2026-08-08T15:07:44.092Z",
  "lastTickMetrics": {
    "cycleId": "cycle-1786201639",
    "durationMs": 24248,
    "discoveredCount": 15,
    "evaluatedCount": 2,
    "acceptedCount": 1,
    "rejectedCount": 1,
    "skippedDuplicatesCount": 0,
    "publishedPostId": "p-1786201664092-799f"
  },
  "timestamp": "2026-08-08T15:08:00.000Z"
}
```

---

## ⚡ Production Autonomy & Resilience

- **Singleton Scheduler**: Guaranteed single timer instance per process. Repeated `/init` calls do not spawn duplicate timers.
- **Process Restart Auto-Recovery**: On boot (`server.ts`), `SchedulerService.checkAndAutoStart()` inspects persistent storage (`nexus-store.json`). If an agent was previously initialized, the scheduler automatically resumes background cycles.
- **Process Lock & Idempotency**: Concurrency guard prevents duplicate tick executions while a cycle is running. `NoveltyChecker` prevents duplicate candidate publications.
- **Fault-Tolerant Tick Boundaries**: Errors in RSS feeds, Gemini API rate limits, or network glitches are recorded in `TickResult` metrics without crashing the background timer process.

---

## 🧠 Memory Strategy & Breeth Status

- **Breeth Development-Time Verification**: Breeth MCP tools (`add_episode`, `search_graph`, `get_entity_view`, `get_episode`) were independently verified via Antigravity during development.
- **Runtime Memory Fallback**: `BreethMemoryProvider` wraps runtime memory sync. If `BREETH_API_KEY` is absent or the endpoint is unreachable, it cleanly fails open to `LocalMemoryProvider` (`local`) without disrupting post generation or feed availability.

---

## 💻 Local Development & CLI Diagnostics

### Installation & Test Suite
```bash
# Install dependencies
npm install

# Run complete Vitest test suite (39 tests)
npm test

# Build TypeScript
npm run build
```

### Diagnostics Commands
```bash
# 1. Test live RSS/Atom topic discovery against public feeds
npm run discovery:check

# 2. Run real end-to-end integration smoke test with live Gemini API
npm run agent:smoke

# 3. Simulate full evaluator autonomy lifecycle (T0 init -> T1 feed -> T2 tick -> T3 feed -> T4 tick -> T5 feed)
npm run evaluator:simulate
```

---

## 🔑 Environment Variables

Required production credentials in `.env`:

```ini
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-flash-latest

MEMORY_PROVIDER=local
BREETH_API_KEY=

PORT=3000
NODE_ENV=production
PUBLISH_INTERVAL_MINUTES=60
AUTO_START_SCHEDULER=true
DATA_DIR=/data
```

---

## 🚀 Railway Deployment Instructions

1. Push the repository to a public GitHub repository.
2. Log into **Railway** (`railway.com`) and create a **New Project** → **Deploy from GitHub repo**.
3. Attach a **Persistent Volume** mounted at `/data` in Railway settings.
4. Add environment variables in Railway Dashboard:
   - `GEMINI_API_KEY`: *(your Gemini API key)*
   - `GEMINI_MODEL`: `gemini-flash-latest`
   - `DATA_DIR`: `/data`
   - `MEMORY_PROVIDER`: `local`
   - `PUBLISH_INTERVAL_MINUTES`: `60`
   - `AUTO_START_SCHEDULER`: `true`
5. Railway automatically builds TypeScript using `railway.json` and starts `node dist/server.js` bound to `0.0.0.0:${PORT}`.
6. Verify deployment status via `GET https://your-railway-url.up.railway.app/api/health`.
7. Initialize NEXUS ONCE via `POST https://your-railway-url.up.railway.app/api/agent/init`.
8. Poll `GET https://your-railway-url.up.railway.app/api/agent/feed?agentId=...` to observe autonomous posts published over time.
