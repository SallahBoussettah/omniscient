# Pinned X post - caption options for the Lumi demo video

Once the demo video is recorded and saved locally, pick one of the caption options below and the dispatch poster + Playwright will upload, post, and pin it. The post goes up BEFORE the Show HN submission (which is scheduled for Tue/Wed) so it's live when HN traffic starts landing on the profile.

## What the post does

This is the conversion surface. Every profile visit from dispatch replies + the HN submission + the cross-posts will see this first. It has to sell the product in 3 seconds.

## Video specs for X

- **Aspect ratio**: 16:9 landscape recommended (X autoplay sizes well). 1:1 square also fine. Avoid portrait unless your demo is visibly mobile-framed.
- **Length**: 30-60s. Anything longer and autoplay cuts at 2m10s anyway.
- **File**: mp4, h.264. X max 512MB, 2m20s.
- **Audio**: native in the video. X starts muted; a good demo has to read WITHOUT audio too.

## Caption options (pick A/B/C)

### A. Straight pitch (my pick)

```
built Lumi - an always-on AI assistant for Linux that runs entirely offline.

Tauri + Rust shell. Whisper on your GPU. Ollama chat with tool calling. Kokoro TTS with per-word karaoke highlight.

no cloud. no API keys. open source.

github.com/SallahBoussettah/lumi
```

**Char count**: ~250. Within X limit.  
**Why this**: direct, names the stack (techies stop to read), explicit "no cloud" positioning, link to repo at the bottom.

### B. Personal / builder voice

```
spent 3 weeks building an AI desktop for Linux that does not phone home.

Whisper on my GPU for speech. Ollama for chat. Kokoro for voice output. everything local.

the thing I am most proud of: voice mode highlights each word as the TTS speaks it. feels like Jarvis.

open source: github.com/SallahBoussettah/lumi
```

**Char count**: ~310. Slightly long, still fits.  
**Why this**: sounds like a builder talking, not a brochure. The "Jarvis" callback is memorable.

### C. Cold hook

```
every AI desktop app I tried wanted an API key and a subscription.

so I built one that does not.

local Whisper. local Ollama. local Kokoro TTS. everything on my machine.

open source: github.com/SallahBoussettah/lumi
```

**Char count**: ~250.  
**Why this**: contrarian hook opens strong, "I built one that does not" is a mini-thesis. Names the three local components in parallel for memorability.

## My recommendation

Go with **A**. It's the clearest, most linkable, and fits your editorial voice. The "Tauri + Rust" mention pulls engineers who care about the stack; "no cloud, no API keys" pulls the privacy crowd; the github link at the end is the CTA.

## Hashtags

None. Research showed >1-2 hashtags = -40% reach in Grok-era. Skip them.

## Mentions

Consider tagging 2-3 relevant accounts in the body only if they're genuinely connected:

- `@AnthropicAI` only if the post sets up an MCP narrative, which this one doesn't. Skip.
- `@tauri_apps` - fair, since you're using Tauri. Risk: looks like farming.
- Skip all mentions. Let the organic discovery happen.

## Pinning it

Via dispatch: once posted, pin manually (2 clicks on X). We haven't automated pinning because it's a one-time action; not worth the Playwright brittleness.

Or I can pin via automation if you want - say the word and I'll add a `pnpm x:pin <tweet-url>` command.
