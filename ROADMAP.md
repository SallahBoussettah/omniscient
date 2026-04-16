# Omniscient — Phased Build Roadmap

An always-on AI assistant for Linux that sees your screen, hears your conversations, extracts memories and tasks, and keeps you focused. Inspired by Omi. Built with Tauri + React + Rust.

---

## Phase 1: Foundation — Tauri App Shell + SQLite ✓

- [x] Initialize Tauri v2 + React + TypeScript + Tailwind project
- [x] Design and implement SQLite schema (14 tables + 3 FTS5 indexes)
- [x] Build Rust database service with CRUD
- [x] Create React UI — redesigned with labeled sidebar, responsive clamp() layout, plain CSS
- [x] Conversations page: greeting, stats, conversation list with icons/tags, insight cards, listening indicator, mic FAB
- [x] System tray icon
- [x] Settings page (placeholder)
- [x] All pages: consistent styling, empty states, Material Symbols icons

---

## Phase 2: Audio Capture + Local Transcription

- [x] PipeWire/PulseAudio mic capture in Rust via cpal (auto-resample to 16kHz mono)
- [x] Integrate Silero VAD (voice_activity_detector crate, bundled ONNX model)
- [x] Integrate whisper.cpp (whisper-rs crate) for local STT — auto-downloads ggml-base.en model
- [x] Buffer speech segments between VAD boundaries (~480ms silence = end of speech)
- [x] Store transcript segments in SQLite with timestamps
- [x] Frontend recording controls (FAB toggle, listening indicator, audio level)
- [x] Live transcription view in React UI (auto-polls every 2s, shows segments)
- [ ] System audio capture via PipeWire monitor source (deferred — mic capture covers primary use case)

---

## Phase 3: Conversation Processing + LLM Pipeline

- [x] Set up Ollama integration (OpenAI-compatible API client, works with any provider)
- [x] Port conversation processing pipeline from Omi:
  - Structure extraction (title, overview, emoji, category)
  - Action item extraction (confidence scoring, priority, 0.7 threshold)
  - Memory extraction (system + interesting, 15-word max)
- [x] Prompt templates adapted from Omi's battle-tested prompts
- [x] Conversation lifecycle: transcript -> LLM processing -> completed with metadata in SQLite
- [x] Conversations list view with real data from DB
- [x] Memories list view with filter tabs (all/system/interesting)
- [x] Action items view with completion toggle, priority badges, pending/completed sections

---

## Phase 4: AI Chat with Context

- [ ] Local embeddings (sentence-transformers or ONNX model)
- [ ] Vector storage (sqlite-vss or FAISS)
- [ ] RAG pipeline: query -> embed -> find relevant context -> inject
- [ ] Chat UI with message history, sessions
- [ ] Support both local Ollama and external APIs as provider options

---

## Phase 5: Screen Capture + OCR + Rewind

- [ ] PipeWire XDG Desktop Portal screen capture
- [ ] Capture every ~1-3 seconds (event-driven or timer)
- [ ] Perceptual dedup with dHash
- [ ] Tesseract OCR on captured frames
- [ ] FTS5 index over OCR text
- [ ] Rewind/timeline view: scroll through screen history
- [ ] Search across screen history

---

## Phase 6: Proactive Assistants (Focus + Tasks + Memory)

- [ ] Window/app focus change detection via D-Bus
- [ ] FocusAssistant: detect distraction, show nudge notifications
- [ ] TaskAssistant: extract action items on context switch
- [ ] MemoryAssistant: extract facts from screen content
- [ ] Focus session tracking (start/end, distraction count, stats)
- [ ] Daily productivity score

---

## Phase 7: Floating Control Bar

- [ ] Secondary Tauri window (always-on-top, frameless)
- [ ] Text input for quick AI questions
- [ ] Push-to-talk for voice queries
- [ ] Global keyboard shortcut to toggle

---

## Phase 8: Knowledge Graph + People

- [ ] Knowledge graph extraction from conversations
- [ ] People management with speaker profiles
- [ ] Speaker diarization with pyannote
- [ ] Knowledge graph visualization

---

## Phase 9: MCP Server + Integrations

- [ ] MCP server (stdio) querying local SQLite
- [ ] Tools: get_memories, create_memory, get_conversations, search
- [ ] Integration with Claude Desktop / Cursor / Claude Code

---

## Phase 10: Polish

- [ ] Auto-start on login
- [ ] Data export/import
- [ ] Encryption at rest (AES-256-GCM)
- [ ] Performance optimization
- [ ] Onboarding flow

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React + TypeScript + Tailwind CSS |
| Desktop | Tauri v2 (Rust) |
| Database | SQLite (WAL) + FTS5 |
| Icons | Lucide React |
| Audio | PipeWire / PulseAudio |
| Screen | PipeWire XDG Portal |
| STT | faster-whisper / whisper.cpp |
| VAD | Silero ONNX |
| OCR | Tesseract |
| LLM | Ollama (local) + optional cloud |
| Embeddings | sentence-transformers / ONNX |
