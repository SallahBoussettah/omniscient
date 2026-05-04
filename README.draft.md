# Lumi

> An always-on AI assistant for Linux. Listens, remembers, answers, acts. Everything runs locally on your machine. Nothing phones home.

<!-- HERO DEMO GIF GOES HERE. Drop a 60s voice-mode clip at docs/demo.gif
     and reference it as: ![Lumi voice mode demo](docs/demo.gif) -->

## Why local?

Because cloud AI is a rental agreement on your own thoughts. Voice transcripts, project context, the things you tell an assistant to remember - that should live on your machine, not on someone's S3 bucket.

Lumi is the bet that a desktop AI can be fast enough, good enough, and useful enough that you don't miss the cloud. Tauri + Rust for the shell, Whisper on your GPU for speech, Ollama for chat, Kokoro for voice output. Your data never leaves.

## What it does

- **Listens.** Click the mic, speak. Whisper Large-v3-Turbo transcribes on your GPU (ROCm or CUDA).
- **Understands.** When you stop, a local LLM extracts a title, action items, and memorable facts from what you said.
- **Remembers.** Memories and conversation summaries embed into a local vector store. Semantic search works offline.
- **Answers.** Chat with an AI that has full context of your captured data. *"What did Marcus tell me?"* *"What do I need to do tomorrow?"*
- **Acts.** The chat assistant has tool calls: create, update, complete tasks, edit memories. Not just talk about them.
- **Speaks.** Hands-free voice mode with karaoke-style word highlighting. Tap the orb, talk, pause, and the AI replies aloud. Say "thanks, that's all" to close.

## Status

Early but functional. The core loop works end-to-end: record -> transcribe -> extract -> embed -> chat with retrieval and tool use.

| Phase | Status |
|---|---|
| 1. App shell, design system, SQLite schema | done |
| 2. Audio capture, VAD, GPU-accelerated whisper | done |
| 3. LLM pipeline (structure, action items, memories) | done |
| 4. RAG chat with tool calling (create/edit/delete tasks and memories) | done |
| 4.5. Voice mode - streaming chat, Kokoro TTS, karaoke highlight, end-on-intent | done |
| 4.6. Polish - data export (JSON/MD), chat session rename, voice picker | done |
| 5. Screen capture + OCR + rewind | planned |
| 6. Proactive assistants (focus tracking, distraction nudges) | planned |
| 7. Always-on-top floating bar | planned |
| 8. Knowledge graph + speaker diarization | planned |
| 9. MCP server (expose to Claude Desktop, Cursor, etc.) | planned |
| 10. Polish (auto-start, encryption, onboarding) | planned |

A 4-specialist code audit passed in April 2026 (5 critical + 8 high-severity issues resolved). See `AUDIT_CHECKLIST.md`.

## What's NOT here yet

Being upfront so the Show HN crowd doesn't find out the hard way:

- **No prebuilt binary.** You build from source for now. AppImage in v0.1 release.
- **No Windows or macOS.** Linux first. Cross-platform is a Phase 10 problem, not today.
- **No screen capture / rewind.** The "Rewind"-style feature is Phase 5, planned not built.
- **No MCP server yet.** Phase 9.
- **AMD support is the wild west.** Tested on RX 9070 XT (RDNA 4, gfx1201). NVIDIA should work by swapping `hipblas` for `cuda` in the whisper feature flags; untested on my side.
- **No encryption at rest.** Data is plain SQLite. Encryption is Phase 10.
- **Speaker diarization**: not yet. Single-speaker transcripts for now.

## Tech

| Layer | What |
|---|---|
| Frontend | React + TypeScript + plain CSS |
| Desktop shell | Tauri v2 (Rust) |
| Database | SQLite (WAL mode) + FTS5 |
| Audio capture | `cpal` (PipeWire/PulseAudio) |
| Voice activity | Silero VAD (ONNX) |
| Speech-to-text | `whisper-rs` 0.16 with `hipblas` feature -> ROCm GPU |
| LLM | Ollama (qwen2.5:7b/14b, hot-swappable) |
| Embeddings | `nomic-embed-text` via Ollama |
| Text-to-speech | Kokoro-82M (PyTorch) via FastAPI sidecar, real per-word timings |
| Vector search | brute-force cosine in Rust over SQLite-stored f32 BLOBs |
| Icons + fonts | Material Symbols, Geist + Newsreader |

Designed for Linux with AMD GPUs (tested on RDNA 4 / RX 9070 XT). Should work on NVIDIA with the `cuda` feature instead of `hipblas`.

## Quickstart (3 commands)

```bash
git clone https://github.com/SallahBoussettah/lumi && cd lumi
pnpm install && ollama pull qwen2.5:7b && ollama pull nomic-embed-text
AMDGPU_TARGETS=gfx1201 pnpm tauri dev
```

(Replace `gfx1201` with your AMD gfx target, or drop the env var entirely on NVIDIA.)

First time you click the mic button, Whisper Large-v3-Turbo downloads (~1.5 GB) automatically.

## Full install requirements

- Linux with PipeWire or PulseAudio
- Rust 1.77+
- Node.js 20+ and pnpm
- Python 3.11/3.12 + [uv](https://github.com/astral-sh/uv) for the Kokoro TTS sidecar
- Ollama running locally (`systemctl start ollama`)
- For GPU transcription: ROCm with hipBLAS (or rebuild with `cuda` feature for NVIDIA)
- Tauri build deps: `webkit2gtk4.1-devel`, `gtk3-devel`, `libappindicator-gtk3-devel`

## Usage

1. **Record a conversation** - press the mic button (bottom-right) and start talking. Pause briefly between thoughts; voice activity detection segments your speech.
2. **Stop** - the app processes the transcript (structure -> action items -> memories) and embeds everything for chat.
3. **Browse** - Conversations, Memories, and Tasks pages. Click any item for details, edit, or delete.
4. **Chat** - ask questions in natural language. The assistant retrieves relevant context and can call tools to actually update your data ("change Marcus to Mark in that book memory" works).
5. **Voice mode** - click the waveform icon next to the chat input. Speak, pause, and the AI replies aloud with word-level karaoke highlighting. Say "thanks, talk later" to close.

## Configuration

Settings are stored in SQLite at `~/.local/share/lumi/lumi.db`. The Settings page lets you:

- Switch between installed Ollama chat models
- See which embedding model is active
- Pick the speaking voice (5 curated Kokoro voices, with previews)
- Export everything as JSON (machine-readable) or Markdown (human-readable)
- View the audio and capture configuration

## Data location

Everything lives in `~/.local/share/lumi/`:

- `lumi.db` - conversations, memories, tasks, chat sessions, embeddings
- `models/` - downloaded Whisper model files

Nothing is ever sent to a remote server unless you explicitly configure a remote LLM provider. Only local Ollama is wired up today.

## Contributing

Issues and PRs welcome. The ROADMAP.md file has the phased build plan; if you want to work on a planned phase, open an issue first so we don't collide.

## License

MIT. Build whatever.

## Author

[Salah Eddine Boussettah](https://github.com/SallahBoussettah) - Marrakech. Also building [Hisab](https://hisab.ma), a Moroccan e-invoicing SaaS.
