use std::path::PathBuf;
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Wrapper around whisper.cpp for local speech-to-text
pub struct Transcriber {
    ctx: WhisperContext,
}

/// A single transcription result
#[derive(Debug, Clone, serde::Serialize)]
pub struct TranscriptSegment {
    pub text: String,
    pub start_ms: i64,
    pub end_ms: i64,
}

impl Transcriber {
    /// Load a whisper model from the given path
    pub fn new(model_path: &PathBuf) -> Result<Self, String> {
        if !model_path.exists() {
            return Err(format!("Whisper model not found at {:?}", model_path));
        }

        let ctx = WhisperContext::new_with_params(
            model_path.to_str().ok_or("Invalid model path")?,
            WhisperContextParameters::default(),
        )
        .map_err(|e| format!("Failed to load whisper model: {}", e))?;

        log::info!("Whisper model loaded from {:?}", model_path);
        Ok(Self { ctx })
    }

    /// Transcribe 16kHz mono f32 audio samples
    pub fn transcribe(&self, samples: &[f32]) -> Result<Vec<TranscriptSegment>, String> {
        let mut state = self
            .ctx
            .create_state()
            .map_err(|e| format!("Failed to create whisper state: {}", e))?;

        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some("en"));
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        params.set_suppress_nst(true);
        // Vocabulary bias — Whisper conditions on this text as if it were
        // the previous segment, nudging the decoder toward these words for
        // ambiguous audio. Otherwise it tends to produce the most-likely
        // dictionary word ("Tory box" instead of "Tauri docs").
        params.set_initial_prompt(
            "Lumi, Tauri, JavaScript, TypeScript, React, Rust, Python, GitHub, \
             Linux, Wayland, KDE, Plasma, Ollama, Whisper, Kokoro, qwen, \
             nomic-embed-text, Salah, Boussettah, Marcus, Hisab, ROCm, RDNA.",
        );
        // Single segment mode for short utterances
        params.set_single_segment(samples.len() < 16000 * 10); // < 10 seconds

        state
            .full(params, samples)
            .map_err(|e| format!("Whisper transcription failed: {}", e))?;

        let num_segments = state.full_n_segments();
        let mut results = Vec::new();

        for i in 0..num_segments {
            let segment = match state.get_segment(i) {
                Some(s) => s,
                None => continue,
            };

            let text = segment
                .to_str()
                .map_err(|e| format!("Failed to get segment text: {}", e))?
                .trim()
                .to_string();
            if text.is_empty() {
                continue;
            }

            // Whisper timestamps are in centiseconds; convert to ms
            let start_ms = segment.start_timestamp() * 10;
            let end_ms = segment.end_timestamp() * 10;

            results.push(TranscriptSegment {
                text,
                start_ms,
                end_ms,
            });
        }

        Ok(results)
    }
}

/// Get the default model directory
pub fn models_dir() -> PathBuf {
    let data_dir = crate::db::data_dir();
    data_dir.join("models")
}

/// Get the path to the default whisper model.
/// Using Large-v3-Turbo (1.5GB) — distilled from large-v3, ~6x faster but
/// matches large-v2 accuracy. Best balance of accuracy and speed for our use case.
pub fn default_model_path() -> PathBuf {
    models_dir().join("ggml-large-v3-turbo.bin")
}

/// Process-wide guard: only one model download in flight at a time. Without
/// this, a user re-clicking "Set up listening" while a download is already
/// running spawns a second stream that writes to the same `.part` file and
/// the progress counter visibly thrashes. The lock is held for the whole
/// download — second callers wait, then see the model already exists and
/// return immediately.
static DOWNLOAD_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

/// Download the whisper large-v3-turbo model if not present.
///
/// Streams chunks to disk so the 1.5GB model doesn't sit in memory, and
/// invokes `on_progress(downloaded_bytes, total_bytes_or_zero)` after each
/// chunk so the caller can emit UI events. `total_bytes` is 0 if the
/// server didn't send a Content-Length header.
pub async fn ensure_model<F>(mut on_progress: F) -> Result<PathBuf, String>
where
    F: FnMut(u64, u64),
{
    // Block any concurrent downloads; second-callers re-check existence below
    // and bail immediately if the first download finished while they waited.
    let _guard = DOWNLOAD_LOCK.lock().await;

    let path = default_model_path();
    if path.exists() {
        log::info!("Whisper model already exists at {:?}", path);
        return Ok(path);
    }

    let dir = models_dir();
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create models dir: {}", e))?;

    let url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin";
    log::info!("Downloading whisper model from {}...", url);

    let resp = reqwest::get(url)
        .await
        .map_err(|e| format!("Failed to download model: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Download failed with status: {}", resp.status()));
    }

    let total = resp.content_length().unwrap_or(0);

    // Write to a `.part` file first; rename on success so a partial file
    // never appears valid to a future startup check.
    let tmp = path.with_extension("bin.part");
    use std::io::Write;
    use futures_util::StreamExt;
    let mut file = std::fs::File::create(&tmp)
        .map_err(|e| format!("Failed to create model file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = resp.bytes_stream();
    on_progress(0, total);
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;
        on_progress(downloaded, total);
    }
    drop(file);

    std::fs::rename(&tmp, &path)
        .map_err(|e| format!("Failed to finalize model file: {}", e))?;

    log::info!(
        "Whisper model downloaded ({} MB)",
        downloaded / 1024 / 1024
    );
    Ok(path)
}
