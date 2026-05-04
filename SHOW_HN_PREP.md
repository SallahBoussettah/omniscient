# Show HN prep - Lumi

Everything needed to submit to Hacker News. Read top to bottom.

## Pre-flight checklist

Before submitting, make sure:

- [ ] `README.draft.md` merged into `README.md` (review the changes, adjust anything that doesn't sound like you, then `mv README.draft.md README.md && git add . && git commit -m "docs: README overhaul for HN" && git push`)
- [ ] Demo GIF dropped at `docs/demo.gif` and referenced in README hero (convert the 60s mp4 to a ~10MB GIF with `ffmpeg -i demo.mp4 -vf "fps=15,scale=720:-1" -loop 0 docs/demo.gif`)
- [ ] Run Lumi end-to-end once to confirm nothing regressed post-audit. Voice mode closes cleanly on "thanks that's all". Task creation via tool call works.
- [ ] Repo has a recent commit (shows activity)
- [ ] `AUDIT_CHECKLIST.md` remains in repo - HN audience loves seeing quality processes

## Timing

**Best submit day/time: Tuesday or Wednesday, 9-11am Pacific.**

For Marrakech (UTC+1), that's **17:00-19:00 your time on Tue/Wed**.

Why that window: HN traffic is heaviest during US working hours and weekdays. Morning Pacific = full US day ahead for your post to climb. Avoid Friday (traffic drops), avoid weekends (even lower).

## Title variants (pick one)

Titles with first-person + specific tech tend to land on HN. Start with "Show HN:" which X-es the algo into a different ranking pool with lower bar for front-page.

**A.** `Show HN: Lumi – an always-on AI assistant for Linux that runs entirely offline`

**B.** `Show HN: A local-first AI desktop for Linux (Tauri + Rust + Whisper + Kokoro)`

**C.** `Show HN: Lumi – voice-first AI assistant for Linux, no cloud`

**D.** `Show HN: I built a Linux AI assistant that runs on my GPU, not OpenAI's`

My pick: **A** - clearest positioning, names the product, leads with the hook "entirely offline". Title does 80% of the work on HN.

Don't put hyphens + brand names like `Show HN: Lumi - Linux AI - 100% Local - Tauri + Rust + Whisper` - reads like SEO spam. Keep it conversational.

## Opening comment (post as the first reply to your own submission, within 60s of submitting)

This sets the tone and answers the implicit "why should I care" question. Keep it personal, not marketing.

```
Builder here. I wanted an always-on assistant on my Linux desktop that didn't require an API key or send voice data to someone else's cloud. Spent a few weeks putting one together.

The stack is Tauri + Rust for the shell, Whisper Large-v3-Turbo on GPU via whisper-rs for transcription, Ollama (qwen2.5:7b by default) for chat and embeddings, Kokoro TTS for voice output. Everything runs on your machine. Your data lives in a SQLite file at ~/.local/share/lumi/.

The thing I'm most proud of is the voice mode: Kokoro emits per-word timestamps, so the UI highlights each word as it's spoken. Feels like Jarvis instead of a podcast. The chat has tool calling too - it can actually modify tasks and memories in the DB, not just suggest what to do.

It's rough. No Windows/Mac, no prebuilt binary yet, AMD support is the wild west (tested on RX 9070 XT, NVIDIA should work with the cuda feature flag but I haven't verified). Phases 5-10 of the roadmap are planned, not built. But the core loop works and I use it daily on my own Nobara machine.

Happy to answer questions about any of the tradeoffs.
```

Adjust wording to your voice if "wanted an always-on assistant" feels too clean. The pattern that works: first-person, specific tech, explicit tradeoffs, ask for feedback.

## FAQ bank (answers for likely HN comments)

### "Why not just use Claude Desktop / ChatGPT / Cursor?"

Cloud tools that know your project context, your conversations, your to-do list all need to see that data to work. I didn't want a third party to have a copy of my voice memos and internal notes. Lumi gives up "smartest model" to gain "runs entirely on my machine". For a daily-driver assistant, I think the tradeoff is worth it.

### "How does it compare to Rewind / Omi / Friend?"

Rewind is Mac-only and uses OpenAI's cloud. Omi is a pendant + phone app focused on always-listening conversations. Friend/Limitless are similar-hardware plays. Lumi is Linux desktop only, no hardware, no cloud. Different wedge.

### "Ollama is slow for production use."

qwen2.5:7b hits ~30 tok/s on a single 16GB card for me, which is fine for personal use. The harness is model-swappable; if you want to run llama.cpp directly or point at a remote inference server, the OpenAI-compatible endpoint config is one env var away.

### "Why Whisper and not faster-whisper / WhisperKit?"

whisper-rs gave me the cleanest path to a Rust binary with GPU acceleration and no Python runtime in the hot path. Large-v3-Turbo runs at ~6x realtime on the RX 9070 XT. Faster-whisper is excellent but adds a Python sidecar - I already have one for Kokoro, didn't want two.

### "Why a Python sidecar for Kokoro if the rest is Rust?"

Kokoro is a PyTorch model. Running it natively in Rust would mean porting the model or using ort+candle, both doable but neither trivial. FastAPI sidecar was the pragmatic choice. Open to a pure-Rust version if someone wants to PR it.

### "MCP support when?"

Phase 9. Once the core loop stabilizes I want Lumi to expose its memory + task store as an MCP server so Claude Desktop / Cursor / Claude Code can query it.

### "Is this just Omi for Linux?"

Conceptually yes, implementation-wise no. Omi's Flutter + Python backend + cloud graph RAG is a different architecture. Lumi is desktop-first, local-only, Rust-heavy. We share inspiration for the memory-extraction prompts (credited in `OMI-DESIGN.md`).

### "Show me a demo."

Demo GIF at top of README. Voice mode with tool calling is the feature to watch.

### "What about X on Mac/Windows?"

Tauri builds on both. The audio stack (cpal + PipeWire/PulseAudio) is Linux-specific though. Porting is Phase 10-ish. Not a priority yet because my daily driver is Linux.

### "Is it secure / private / safe to run always-on?"

Microphone access requires explicit click. No recording happens until you press the mic button. Nothing is sent over the network unless you explicitly configure a remote LLM. Data lives in a plain SQLite file - you can inspect or delete it any time.

### "How do you handle PII / sensitive conversations?"

Locally. That's the whole point. Encryption at rest is Phase 10; for now the data is as secure as anything else in your home directory.

## X announcement (post ~2 min after HN goes live, solo post)

Pinned demo video stays on the pin. This is a standalone post to drive HN upvotes from anyone following you on X.

```
just shipped Show HN for Lumi - the local-first AI desktop for Linux I've been building for a few weeks.

Tauri + Rust. Whisper on GPU. Ollama. Kokoro TTS with per-word karaoke highlight. Entirely offline.

kind comments + upvotes appreciated 🙏

[HN link]
```

(The emoji is intentional and on-brand for the "asking for support" moment. One emoji is fine, more isn't.)

## Cross-posts (within 30 min of HN hitting front page)

If the HN submission is climbing, cross-post to these. Don't do all at once, stagger over 1-2 hours so each post gets its own discovery window.

### r/LocalLLaMA

Title: `Lumi - open-source always-on AI desktop for Linux (Whisper + Ollama + Kokoro)`

Body: same as HN opening comment, but lead with "r/LocalLLaMA this is for you" and mention Ollama integration first. This sub will care most about model performance and local inference.

### r/rust

Title: `Lumi - Tauri + Rust desktop AI assistant (whisper-rs, Ollama, Kokoro TTS)`

Body: lead with the Rust angle. Mention whisper-rs integration, cpal audio capture, the DB service in Rust. This sub cares about the engineering, not the product.

### r/selfhosted

Title: `Lumi - a self-hosted AI desktop assistant for Linux, no cloud`

Body: lead with "no cloud, no API keys, runs entirely on your machine". This sub loves the local-first framing.

### HN submit itself

Form: https://news.ycombinator.com/submit

- Title: Show HN variant A
- URL: https://github.com/SallahBoussettah/lumi (GitHub repo URL is standard for Show HN)
- Text box: leave empty (your opening comment goes as the first reply to your own post, not in the submit form)

## The first 2 hours on HN are the whole game

Treat HN as a real-time thing. Reply to every comment within 10 minutes while the post is climbing. This is the single biggest factor in whether your post makes front page.

- Set a 2-hour window where you do nothing but monitor the HN post
- Every comment gets a reply. Thoughtful, not defensive.
- Downvotes happen. Don't address them. Address the valid criticisms.
- If someone suggests a feature, say "good idea, opened an issue" and actually open an issue.

## After

- Screenshot the front page if you hit it. This becomes social proof forever.
- Thank people who upvoted/shared (on X, not HN - HN discourages meta-conversation)
- The Lumi architecture thread (`originals.id=1` in dispatch) goes out when the HN post is peaking. Ride the wave.
