mod audio;
mod db;

use audio::capture::SpeechBuffer;
use audio::transcribe::{self, TranscriptSegment, Transcriber};
use audio::vad::Vad;
use audio::AudioState;
use cpal::Stream;
use db::Database;
use std::sync::{Arc, Mutex};

/// Wrapper to make cpal::Stream usable in Tauri state (Send + Sync)
struct StreamHolder(Mutex<Option<Stream>>);
unsafe impl Send for StreamHolder {}
unsafe impl Sync for StreamHolder {}

/// Wrapper for Transcriber (not Send by default due to whisper internals)
struct TranscriberHolder(Mutex<Option<Transcriber>>);
unsafe impl Send for TranscriberHolder {}
unsafe impl Sync for TranscriberHolder {}

#[tauri::command]
fn get_db_stats(db: tauri::State<'_, Arc<Database>>) -> Result<serde_json::Value, String> {
    let conn = db.conn();
    let conversations: i64 = conn
        .query_row("SELECT COUNT(*) FROM conversations", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let memories: i64 = conn
        .query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let action_items: i64 = conn
        .query_row("SELECT COUNT(*) FROM action_items", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let screenshots: i64 = conn
        .query_row("SELECT COUNT(*) FROM screenshots", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({
        "conversations": conversations,
        "memories": memories,
        "action_items": action_items,
        "screenshots": screenshots,
    }))
}

#[tauri::command]
fn list_audio_devices() -> Vec<String> {
    audio::capture::list_input_devices()
}

#[tauri::command]
fn start_recording(
    audio_state: tauri::State<'_, Arc<AudioState>>,
    stream_holder: tauri::State<'_, StreamHolder>,
    vad_state: tauri::State<'_, Arc<Mutex<Vad>>>,
    speech_buf: tauri::State<'_, Arc<Mutex<SpeechBuffer>>>,
) -> Result<String, String> {
    if audio_state.is_recording() {
        return Err("Already recording".to_string());
    }

    let stream = audio::capture::start_capture(
        audio_state.inner().clone(),
        vad_state.inner().clone(),
        speech_buf.inner().clone(),
    )?;

    let mut holder = stream_holder.0.lock().map_err(|e| e.to_string())?;
    *holder = Some(stream);

    Ok("Recording started".to_string())
}

#[tauri::command]
fn stop_recording(
    audio_state: tauri::State<'_, Arc<AudioState>>,
    stream_holder: tauri::State<'_, StreamHolder>,
) -> Result<String, String> {
    let mut holder = stream_holder.0.lock().map_err(|e| e.to_string())?;
    *holder = None;
    audio_state.set_recording(false);
    audio_state.set_level(0.0);
    log::info!("Audio capture stopped");
    Ok("Recording stopped".to_string())
}

#[tauri::command]
fn get_audio_level(audio_state: tauri::State<'_, Arc<AudioState>>) -> u32 {
    audio_state.get_level()
}

#[tauri::command]
fn is_recording(audio_state: tauri::State<'_, Arc<AudioState>>) -> bool {
    audio_state.is_recording()
}

/// Download the whisper model if needed, then initialize the transcriber
#[tauri::command]
fn init_transcriber(
    transcriber: tauri::State<'_, TranscriberHolder>,
) -> Result<String, String> {
    let model_path = transcribe::ensure_model()?;
    let t = Transcriber::new(&model_path)?;

    let mut holder = transcriber.0.lock().map_err(|e| e.to_string())?;
    *holder = Some(t);

    Ok(format!("Transcriber ready (model: {:?})", model_path))
}

/// Drain speech segments from the buffer and transcribe them
#[tauri::command]
fn transcribe_pending(
    speech_buf: tauri::State<'_, Arc<Mutex<SpeechBuffer>>>,
    transcriber: tauri::State<'_, TranscriberHolder>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<Vec<TranscriptSegment>, String> {
    let segments = {
        let mut buf = speech_buf.lock().map_err(|e| e.to_string())?;
        buf.take_segments()
    };

    if segments.is_empty() {
        return Ok(vec![]);
    }

    let t_guard = transcriber.0.lock().map_err(|e| e.to_string())?;
    let t = t_guard
        .as_ref()
        .ok_or("Transcriber not initialized. Call init_transcriber first.")?;

    let mut all_results = Vec::new();

    for (i, audio) in segments.iter().enumerate() {
        let duration = audio.len() as f32 / 16000.0;
        log::info!("Transcribing segment {} ({:.1}s)...", i, duration);

        match t.transcribe(audio) {
            Ok(results) => {
                for seg in &results {
                    log::info!("  [{}-{}ms] {}", seg.start_ms, seg.end_ms, seg.text);

                    // Store in database
                    let conn = db.conn();
                    let id = uuid::Uuid::new_v4().to_string();
                    let _ = conn.execute(
                        "INSERT INTO transcript_segments (id, conversation_id, text, start_time, end_time)
                         VALUES (?1, 'live', ?2, ?3, ?4)",
                        rusqlite::params![
                            id,
                            seg.text,
                            seg.start_ms as f64 / 1000.0,
                            seg.end_ms as f64 / 1000.0,
                        ],
                    );
                }
                all_results.extend(results);
            }
            Err(e) => {
                log::error!("Transcription error for segment {}: {}", i, e);
            }
        }
    }

    Ok(all_results)
}

/// Check if the whisper model is downloaded
#[tauri::command]
fn has_whisper_model() -> bool {
    transcribe::default_model_path().exists()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let db_path = db::db_path();
    let database = Arc::new(Database::open(&db_path).expect("failed to open database"));
    let audio_state = Arc::new(AudioState::new());
    let stream_holder = StreamHolder(Mutex::new(None));
    let transcriber_holder = TranscriberHolder(Mutex::new(None));

    let vad = Arc::new(Mutex::new(
        Vad::new().expect("failed to initialize Silero VAD"),
    ));
    let speech_buffer = Arc::new(Mutex::new(SpeechBuffer::new()));

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .manage(database)
        .manage(audio_state)
        .manage(stream_holder)
        .manage(transcriber_holder)
        .manage(vad)
        .manage(speech_buffer)
        .invoke_handler(tauri::generate_handler![
            get_db_stats,
            list_audio_devices,
            start_recording,
            stop_recording,
            get_audio_level,
            is_recording,
            init_transcriber,
            transcribe_pending,
            has_whisper_model,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
