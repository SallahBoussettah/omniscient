# Omniscient

> An always-on AI assistant for Linux that listens to your conversations, captures your memories, and helps you stay on top of what matters — all running locally on your machine.

Omniscient is a desktop companion that records and transcribes what you say, extracts the meaningful bits (memories, action items, key topics), and lets you ask natural-language questions about anything you've captured. Everything runs offline on your own GPU. Your data never leaves your machine.

## What it does

- **Listens.** Hit a button, speak. Speech is transcribed locally using Whisper Large-v3-Turbo on your GPU.
- **Understands.** When you stop, a local LLM extracts a title, overview, action items, and memorable facts from what was said.
- **Remembers.** Memories and conversation summaries are embedded into a local vector store for semantic search.
- **Answers.** Chat with an AI that has full context of your captured data. Ask things like "what did Marcus tell me?" or "what do I need to do tomorrow?"
- **Acts.** The chat assistant has tools to actually create, update, complete tasks and edit memories — not just talk about them.
- **Speaks.** Hands-free voice mode (Jarvis-style): mic button → talk → pause → AI streams its reply through Kokoro TTS with karaoke-style word highlighting. Say "thanks, that's all" to close.

## Status

Early but functional. The core loop works end-to-end: record → transcribe → extract → embed → chat with retrieval and tool use.

| Phase | Status |
|---|---|
| 1. App shell, design system, SQLite schema | ✅ |
| 2. Audio capture, VAD, GPU-accelerated whisper | ✅ |
| 3. LLM pipeline (structure, action items, memories) | ✅ |
| 4. RAG chat with tool calling (create/edit/delete tasks and memories) | ✅ |
| 4.5. Voice mode — streaming chat, Kokoro TTS, karaoke highlight, end-on-intent | ✅ |
| 4.6. Polish — data export (JSON/MD), chat session rename + LLM auto-title, voice picker | ✅ |
| 5. Screen capture + OCR + rewind | planned |
| 6. Proactive assistants (focus tracking, distraction nudges) | planned |
| 7. Always-on-top floating bar | planned |
| 8. Knowledge graph + speaker diarization | planned |
| 9. MCP server (expose to Claude Desktop, Cursor, etc.) | planned |
| 10. Polish (auto-start, encryption, onboarding) | planned |

## Tech

| Layer | What |
|---|---|
| Frontend | React + TypeScript + plain CSS |
| Desktop shell | Tauri v2 (Rust) |
| Database | SQLite (WAL mode) + FTS5 |
| Audio capture | `cpal` (PipeWire/PulseAudio) |
| Voice activity | Silero VAD (ONNX) |
| Speech-to-text | `whisper-rs` 0.16 with `hipblas` feature → ROCm GPU |
| LLM | Ollama (qwen2.5:7b/14b, hot-swappable) |
| Embeddings | `nomic-embed-text` via Ollama |
| Text-to-speech | Kokoro-82M (PyTorch) via FastAPI sidecar — real per-word timings |
| Vector search | brute-force cosine in Rust over SQLite-stored f32 BLOBs |
| Icons + fonts | Material Symbols, Geist + Newsreader |

Designed for Linux with AMD GPUs (tested on RDNA 4 / RX 9070 XT). Should work on NVIDIA with the `cuda` feature instead of `hipblas`.

## Requirements

- **Linux** with PipeWire or PulseAudio
- **Rust** 1.77+
- **Node.js** 20+ and **pnpm**
- **Python** 3.11/3.12 + [`uv`](https://github.com/astral-sh/uv) — for the Kokoro TTS sidecar
- **Ollama** running locally (`systemctl start ollama`)
- For GPU transcription: **ROCm** with `hipBLAS` (or rebuild with `cuda` feature for NVIDIA)
- Tauri build deps: `webkit2gtk4.1-devel`, `gtk3-devel`, `libappindicator-gtk3-devel`

## Setup

```bash
# 1. Clone
git clone git@github.com:SallahBoussettah/omniscient.git
cd omniscient

# 2. Install JS dependencies
pnpm install

# 3. Pull the LLM models you want
ollama pull qwen2.5:7b           # default — fits comfortably alongside other GPU work
ollama pull qwen2.5:14b          # smarter, needs more VRAM
ollama pull nomic-embed-text     # required for chat retrieval (~270 MB)

# 4. Run in dev mode
# AMDGPU_TARGETS only needed for AMD — set to your gfx target (e.g. gfx1201 for RX 9070 XT)
AMDGPU_TARGETS=gfx1201 pnpm tauri dev
```

The first time you click the mic button, the Whisper model (Large-v3-Turbo, ~1.5 GB) downloads automatically.

## Usage

1. **Record a conversation** — press the mic button at the bottom-right and start talking. Pause briefly between thoughts; voice activity detection segments your speech.
2. **Stop** — the app processes the transcript with the LLM (structure → action items → memories) and embeds everything for chat.
3. **Browse** — go through Conversations, Memories, and Tasks pages. Click any item for details, edit, or delete.
4. **Chat** — ask questions in natural language. The assistant retrieves relevant context and can call tools to actually update your data ("change Marcus to Mark in that book memory" works).
5. **Voice mode** — click the waveform icon next to the chat input. Speak, pause, and the AI replies aloud while highlighting words as they're spoken. End the conversation by saying anything wrap-up like "thanks, talk later" — the model will deliver a brief farewell and the overlay closes.

## Configuration

Settings are stored in SQLite under `~/.local/share/omniscient/omniscient.db`.

The Settings page lets you:
- Switch between installed Ollama chat models (selection persists)
- See which embedding model is active
- Pick the speaking voice (5 curated Kokoro voices, with previews)
- Export everything as JSON (machine-readable) or Markdown (human-readable)
- View the audio and capture configuration

## Data location

Everything lives in `~/.local/share/omniscient/`:
- `omniscient.db` — conversations, memories, tasks, chat sessions, embeddings
- `models/` — downloaded Whisper model files

Nothing is ever sent to a remote server unless you explicitly configure a remote LLM provider (currently only local Ollama is wired up).

## License

MIT
