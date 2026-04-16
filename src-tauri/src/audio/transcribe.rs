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
        // Single segment mode for short utterances
        params.set_single_segment(samples.len() < 16000 * 10); // < 10 seconds

        state
            .full(params, samples)
            .map_err(|e| format!("Whisper transcription failed: {}", e))?;

        let num_segments = state.full_n_segments().unwrap_or(0);
        let mut results = Vec::new();

        for i in 0..num_segments {
            let text = state
                .full_get_segment_text(i)
                .map_err(|e| format!("Failed to get segment text: {}", e))?;

            let text = text.trim().to_string();
            if text.is_empty() {
                continue;
            }

            let start_ms = state
                .full_get_segment_t0(i)
                .map_err(|e| format!("Failed to get segment start: {}", e))?
                as i64
                * 10; // whisper uses centiseconds

            let end_ms = state
                .full_get_segment_t1(i)
                .map_err(|e| format!("Failed to get segment end: {}", e))?
                as i64
                * 10;

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

/// Get the path to the default whisper model
pub fn default_model_path() -> PathBuf {
    models_dir().join("ggml-base.en.bin")
}

/// Download the whisper base.en model if not present
pub fn ensure_model() -> Result<PathBuf, String> {
    let path = default_model_path();
    if path.exists() {
        log::info!("Whisper model already exists at {:?}", path);
        return Ok(path);
    }

    let dir = models_dir();
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create models dir: {}", e))?;

    let url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin";
    log::info!("Downloading whisper model from {}...", url);

    let resp = reqwest::blocking::get(url)
        .map_err(|e| format!("Failed to download model: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("Download failed with status: {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .map_err(|e| format!("Failed to read model bytes: {}", e))?;

    std::fs::write(&path, &bytes)
        .map_err(|e| format!("Failed to write model file: {}", e))?;

    log::info!("Whisper model downloaded ({} MB)", bytes.len() / 1024 / 1024);
    Ok(path)
}
