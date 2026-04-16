mod audio;
mod db;
mod llm;

use audio::capture::SpeechBuffer;
use audio::transcribe::{self, TranscriptSegment, Transcriber};
use audio::vad::Vad;
use audio::AudioState;
use cpal::Stream;
use db::Database;
use llm::client::LlmClient;
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
    db: tauri::State<'_, Arc<Database>>,
    current_conv: tauri::State<'_, Arc<Mutex<Option<String>>>>,
) -> Result<String, String> {
    if audio_state.is_recording() {
        return Err("Already recording".to_string());
    }

    // Create a new conversation row for this session
    let conv_id = uuid::Uuid::new_v4().to_string();
    {
        let conn = db.conn();
        conn.execute(
            "INSERT INTO conversations (id, started_at, source, status) VALUES (?1, datetime('now'), 'mic', 'in_progress')",
            rusqlite::params![conv_id],
        )
        .map_err(|e| e.to_string())?;
    }

    {
        let mut current = current_conv.lock().map_err(|e| e.to_string())?;
        *current = Some(conv_id.clone());
    }

    let stream = audio::capture::start_capture(
        audio_state.inner().clone(),
        vad_state.inner().clone(),
        speech_buf.inner().clone(),
    )?;

    let mut holder = stream_holder.0.lock().map_err(|e| e.to_string())?;
    *holder = Some(stream);

    log::info!("Started recording conversation {}", conv_id);
    Ok(conv_id)
}

#[tauri::command]
fn stop_recording(
    audio_state: tauri::State<'_, Arc<AudioState>>,
    stream_holder: tauri::State<'_, StreamHolder>,
    db: tauri::State<'_, Arc<Database>>,
    current_conv: tauri::State<'_, Arc<Mutex<Option<String>>>>,
) -> Result<Option<String>, String> {
    let mut holder = stream_holder.0.lock().map_err(|e| e.to_string())?;
    *holder = None;
    audio_state.set_recording(false);
    audio_state.set_level(0.0);

    // Mark conversation as finished
    let conv_id = {
        let mut current = current_conv.lock().map_err(|e| e.to_string())?;
        current.take()
    };

    if let Some(ref id) = conv_id {
        let conn = db.conn();
        let _ = conn.execute(
            "UPDATE conversations SET finished_at = datetime('now'), status = 'processing' WHERE id = ?1",
            rusqlite::params![id],
        );
        log::info!("Stopped recording conversation {}", id);
    }

    Ok(conv_id)
}

#[tauri::command]
fn get_audio_level(audio_state: tauri::State<'_, Arc<AudioState>>) -> u32 {
    audio_state.get_level()
}

#[tauri::command]
fn is_recording(audio_state: tauri::State<'_, Arc<AudioState>>) -> bool {
    audio_state.is_recording()
}

/// Download the whisper model if needed, then initialize the transcriber.
/// Async so the download doesn't block the Tauri IPC thread.
#[tauri::command]
async fn init_transcriber(
    transcriber: tauri::State<'_, TranscriberHolder>,
) -> Result<String, String> {
    let model_path = transcribe::ensure_model().await?;

    // Loading the model itself is sync but fast (~1-2s)
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
    current_conv: tauri::State<'_, Arc<Mutex<Option<String>>>>,
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

    // Get the current conversation_id (or fall back to "live")
    let conv_id = {
        let current = current_conv.lock().map_err(|e| e.to_string())?;
        current.clone().unwrap_or_else(|| "live".to_string())
    };

    let mut all_results = Vec::new();

    for (i, audio) in segments.iter().enumerate() {
        let duration = audio.len() as f32 / 16000.0;
        log::info!("Transcribing segment {} ({:.1}s)...", i, duration);

        match t.transcribe(audio) {
            Ok(results) => {
                for seg in &results {
                    log::info!("  [{}-{}ms] {}", seg.start_ms, seg.end_ms, seg.text);

                    let conn = db.conn();
                    let id = uuid::Uuid::new_v4().to_string();
                    let _ = conn.execute(
                        "INSERT INTO transcript_segments (id, conversation_id, text, start_time, end_time)
                         VALUES (?1, ?2, ?3, ?4, ?5)",
                        rusqlite::params![
                            id,
                            conv_id,
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

#[tauri::command]
fn get_conversations(db: tauri::State<'_, Arc<Database>>) -> Result<serde_json::Value, String> {
    let conn = db.conn();
    let mut stmt = conn
        .prepare(
            "SELECT id, title, overview, emoji, category, status, started_at, finished_at
             FROM conversations WHERE discarded = 0 ORDER BY started_at DESC LIMIT 50",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "title": row.get::<_, Option<String>>(1)?,
                "overview": row.get::<_, Option<String>>(2)?,
                "emoji": row.get::<_, Option<String>>(3)?,
                "category": row.get::<_, Option<String>>(4)?,
                "status": row.get::<_, String>(5)?,
                "started_at": row.get::<_, String>(6)?,
                "finished_at": row.get::<_, Option<String>>(7)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(serde_json::json!(rows))
}

#[tauri::command]
fn get_memories(db: tauri::State<'_, Arc<Database>>) -> Result<serde_json::Value, String> {
    let conn = db.conn();
    let mut stmt = conn
        .prepare(
            "SELECT id, content, category, conversation_id, created_at
             FROM memories WHERE is_dismissed = 0 ORDER BY created_at DESC LIMIT 100",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "content": row.get::<_, String>(1)?,
                "category": row.get::<_, String>(2)?,
                "conversation_id": row.get::<_, Option<String>>(3)?,
                "created_at": row.get::<_, String>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(serde_json::json!(rows))
}

#[tauri::command]
fn get_action_items(db: tauri::State<'_, Arc<Database>>) -> Result<serde_json::Value, String> {
    let conn = db.conn();
    let mut stmt = conn
        .prepare(
            "SELECT id, description, completed, priority, conversation_id, created_at
             FROM action_items ORDER BY completed ASC, created_at DESC LIMIT 100",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "description": row.get::<_, String>(1)?,
                "completed": row.get::<_, bool>(2)?,
                "priority": row.get::<_, String>(3)?,
                "conversation_id": row.get::<_, Option<String>>(4)?,
                "created_at": row.get::<_, String>(5)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(serde_json::json!(rows))
}

#[tauri::command]
fn toggle_action_item(
    id: String,
    completed: bool,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<String, String> {
    let conn = db.conn();
    conn.execute(
        "UPDATE action_items SET completed = ?1, updated_at = datetime('now') WHERE id = ?2",
        rusqlite::params![completed, id],
    )
    .map_err(|e| e.to_string())?;
    Ok("Updated".to_string())
}

/// Check if the whisper model is downloaded
#[tauri::command]
fn has_whisper_model() -> bool {
    transcribe::default_model_path().exists()
}

/// Check if Ollama is reachable
#[tauri::command]
async fn check_llm_status(
    llm: tauri::State<'_, Arc<LlmClient>>,
) -> Result<bool, String> {
    llm.health_check().await
}

/// Process a conversation through the LLM pipeline (extract structure, tasks, memories)
#[tauri::command]
async fn process_conversation_cmd(
    conversation_id: String,
    llm: tauri::State<'_, Arc<LlmClient>>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<String, String> {
    // Gather transcript text from segments
    let transcript = {
        let conn = db.conn();
        let mut stmt = conn
            .prepare("SELECT text FROM transcript_segments WHERE conversation_id = ?1 ORDER BY start_time")
            .map_err(|e| e.to_string())?;
        let texts: Vec<String> = stmt
            .query_map([&conversation_id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        texts.join(" ")
    };

    if transcript.trim().is_empty() {
        return Err("No transcript segments found for this conversation".to_string());
    }

    llm::processor::process_conversation(&llm, &db.inner().clone(), &conversation_id, &transcript).await?;

    Ok(format!("Processed conversation {}", conversation_id))
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

    // Default to Ollama with qwen2.5:14b (instruct version, best for our 16GB GPU)
    let llm_client = Arc::new(LlmClient::ollama("qwen2.5:14b"));

    // Tracks the currently active conversation_id while recording
    let current_conversation: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

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
        .manage(llm_client)
        .manage(current_conversation)
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
            check_llm_status,
            process_conversation_cmd,
            get_conversations,
            get_memories,
            get_action_items,
            toggle_action_item,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
