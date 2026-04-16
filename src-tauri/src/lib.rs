mod audio;
mod db;
mod llm;

use audio::capture::SpeechBuffer;
use audio::transcribe::{self, TranscriptSegment, Transcriber};
use audio::vad::Vad;
use audio::AudioState;
use cpal::Stream;
use db::Database;
use llm::client::{ChatMessage, LlmClient};
use llm::embed::Embedder;
use llm::rag::{self, SearchHit};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconEvent},
    Emitter, Manager,
};

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
async fn start_recording(
    audio_state: tauri::State<'_, Arc<AudioState>>,
    stream_holder: tauri::State<'_, StreamHolder>,
    vad_state: tauri::State<'_, Arc<Mutex<Vad>>>,
    speech_buf: tauri::State<'_, Arc<Mutex<SpeechBuffer>>>,
    transcriber: tauri::State<'_, TranscriberHolder>,
    db: tauri::State<'_, Arc<Database>>,
    current_conv: tauri::State<'_, Arc<Mutex<Option<String>>>>,
) -> Result<String, String> {
    if audio_state.is_recording() {
        return Err("Already recording".to_string());
    }

    // Ensure the transcriber is initialized — idempotent, cheap if already loaded.
    // Without this, transcription silently no-ops when the user never explicitly
    // calls init_transcriber (e.g., the model file already existed at app start).
    {
        let needs_init = transcriber.0.lock().map_err(|e| e.to_string())?.is_none();
        if needs_init {
            log::info!("Transcriber not initialized — loading model...");
            let model_path = transcribe::ensure_model().await?;
            let t = Transcriber::new(&model_path)?;
            *transcriber.0.lock().map_err(|e| e.to_string())? = Some(t);
            log::info!("Transcriber ready");
        }
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

/// Stop recording WITHOUT triggering processing. Discards the in-progress
/// conversation, drains the speech buffer, and removes the conversation row.
#[tauri::command]
fn cancel_recording(
    audio_state: tauri::State<'_, Arc<AudioState>>,
    stream_holder: tauri::State<'_, StreamHolder>,
    speech_buf: tauri::State<'_, Arc<Mutex<SpeechBuffer>>>,
    db: tauri::State<'_, Arc<Database>>,
    current_conv: tauri::State<'_, Arc<Mutex<Option<String>>>>,
) -> Result<(), String> {
    // Stop audio capture
    *stream_holder.0.lock().map_err(|e| e.to_string())? = None;
    audio_state.set_recording(false);
    audio_state.set_level(0.0);

    // Drain the speech buffer so leftover segments don't transcribe later
    {
        let mut buf = speech_buf.lock().map_err(|e| e.to_string())?;
        let _ = buf.take_segments();
        buf.samples.clear();
    }

    // Delete the in-progress conversation (CASCADE drops transcript_segments)
    let conv_id = current_conv.lock().map_err(|e| e.to_string())?.take();
    if let Some(id) = conv_id {
        let conn = db.conn();
        let _ = conn.execute("DELETE FROM conversations WHERE id = ?1", [&id]);
        log::info!("Cancelled and deleted conversation {}", id);
    }

    Ok(())
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

#[derive(serde::Serialize)]
struct RecordingStatus {
    is_recording: bool,
    audio_level: u32,
    silence_ms: u64,
    recording_ms: u64,
}

/// Combined recording status — used by the frontend to poll once instead of
/// hitting three commands. Also drives auto-stop on prolonged silence.
#[tauri::command]
fn get_recording_status(audio_state: tauri::State<'_, Arc<AudioState>>) -> RecordingStatus {
    RecordingStatus {
        is_recording: audio_state.is_recording(),
        audio_level: audio_state.get_level(),
        silence_ms: audio_state.silence_ms(),
        recording_ms: audio_state.recording_ms(),
    }
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

/// Search conversations by title, overview, and full-text transcript.
/// Returns conversations matching the query, ranked roughly by recency.
#[tauri::command]
fn search_conversations(
    query: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<serde_json::Value, String> {
    let q = query.trim();
    if q.is_empty() {
        return get_conversations(db);
    }

    let conn = db.conn();

    // Find conversation_ids whose transcript matches via FTS5
    let fts_ids: Vec<String> = {
        let mut stmt = match conn.prepare(
            "SELECT DISTINCT s.conversation_id FROM transcripts_fts f
             JOIN transcript_segments s ON s.rowid = f.rowid
             WHERE transcripts_fts MATCH ?1
             LIMIT 200",
        ) {
            Ok(s) => s,
            Err(_) => return Err("FTS query failed".to_string()),
        };
        let collected: Vec<String> = stmt
            .query_map([q], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        collected
    };

    let pattern = format!("%{}%", q.to_lowercase());

    // Combine: title/overview LIKE OR FTS-found id
    let mut sql = String::from(
        "SELECT id, title, overview, emoji, category, status, started_at, finished_at
         FROM conversations
         WHERE discarded = 0 AND (
             LOWER(IFNULL(title, '')) LIKE ?1
             OR LOWER(IFNULL(overview, '')) LIKE ?1",
    );
    if !fts_ids.is_empty() {
        sql.push_str(" OR id IN (");
        for (i, _) in fts_ids.iter().enumerate() {
            if i > 0 {
                sql.push(',');
            }
            sql.push('?');
            // we'll bind by position below — compute index 2..2+N
        }
        sql.push(')');
    }
    sql.push_str(") ORDER BY started_at DESC LIMIT 100");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    // Bind: ?1 = pattern, then each id
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    params.push(Box::new(pattern));
    for id in &fts_ids {
        params.push(Box::new(id.clone()));
    }
    let param_refs: Vec<&dyn rusqlite::ToSql> =
        params.iter().map(|p| p.as_ref() as &dyn rusqlite::ToSql).collect();

    let rows: Vec<serde_json::Value> = stmt
        .query_map(&*param_refs, |row| {
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
            "SELECT id, description, completed, priority, due_at, conversation_id, created_at
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
                "due_at": row.get::<_, Option<String>>(4)?,
                "conversation_id": row.get::<_, Option<String>>(5)?,
                "created_at": row.get::<_, String>(6)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(serde_json::json!(rows))
}

/// Get full details for a single conversation: metadata, transcript segments,
/// extracted memories, and action items. Used by the detail view.
#[tauri::command]
fn get_conversation_detail(
    id: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<serde_json::Value, String> {
    let conn = db.conn();

    let conv: serde_json::Value = conn
        .query_row(
            "SELECT id, title, overview, emoji, category, status, started_at, finished_at
             FROM conversations WHERE id = ?1",
            [&id],
            |row| {
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
            },
        )
        .map_err(|e| format!("Conversation not found: {}", e))?;

    let mut seg_stmt = conn
        .prepare(
            "SELECT id, text, speaker, start_time, end_time
             FROM transcript_segments WHERE conversation_id = ?1 ORDER BY start_time",
        )
        .map_err(|e| e.to_string())?;
    let segments: Vec<serde_json::Value> = seg_stmt
        .query_map([&id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "text": row.get::<_, String>(1)?,
                "speaker": row.get::<_, Option<String>>(2)?,
                "start_time": row.get::<_, f64>(3)?,
                "end_time": row.get::<_, f64>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut mem_stmt = conn
        .prepare(
            "SELECT id, content, category, created_at FROM memories
             WHERE conversation_id = ?1 ORDER BY created_at",
        )
        .map_err(|e| e.to_string())?;
    let memories: Vec<serde_json::Value> = mem_stmt
        .query_map([&id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "content": row.get::<_, String>(1)?,
                "category": row.get::<_, String>(2)?,
                "created_at": row.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    let mut task_stmt = conn
        .prepare(
            "SELECT id, description, completed, priority, created_at FROM action_items
             WHERE conversation_id = ?1 ORDER BY completed, created_at",
        )
        .map_err(|e| e.to_string())?;
    let tasks: Vec<serde_json::Value> = task_stmt
        .query_map([&id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "description": row.get::<_, String>(1)?,
                "completed": row.get::<_, bool>(2)?,
                "priority": row.get::<_, String>(3)?,
                "created_at": row.get::<_, String>(4)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();

    Ok(serde_json::json!({
        "conversation": conv,
        "segments": segments,
        "memories": memories,
        "tasks": tasks,
    }))
}

/// Reprocess a conversation through the LLM (re-runs structure/tasks/memories).
/// Useful if the LLM was offline when first stopped, or to regenerate with a different model.
#[tauri::command]
async fn reprocess_conversation(
    conversation_id: String,
    llm: tauri::State<'_, Arc<LlmClient>>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<String, String> {
    let transcript = {
        let conn = db.conn();
        let mut stmt = conn
            .prepare(
                "SELECT text FROM transcript_segments
                 WHERE conversation_id = ?1 ORDER BY start_time",
            )
            .map_err(|e| e.to_string())?;
        let texts: Vec<String> = stmt
            .query_map([&conversation_id], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        texts.join(" ")
    };

    if transcript.trim().is_empty() {
        return Err("No transcript segments found".to_string());
    }

    // Clear previously extracted items for clean reprocessing
    {
        let conn = db.conn();
        let _ = conn.execute(
            "DELETE FROM memories WHERE conversation_id = ?1",
            [&conversation_id],
        );
        let _ = conn.execute(
            "DELETE FROM action_items WHERE conversation_id = ?1",
            [&conversation_id],
        );
    }

    llm::processor::process_conversation(&llm, &db.inner().clone(), &conversation_id, &transcript)
        .await?;
    Ok(format!("Reprocessed {}", conversation_id))
}

// =====================================================
// CHAT (RAG)
// =====================================================

#[derive(serde::Serialize)]
struct ChatTurnResult {
    answer: String,
    sources: Vec<SearchHit>,
    session_id: String,
    user_message_id: String,
    assistant_message_id: String,
}

/// Backfill embeddings for memories and conversations that don't have one yet.
/// Returns counts of newly embedded items.
#[tauri::command]
async fn reindex_embeddings(
    embedder: tauri::State<'_, Arc<Embedder>>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<serde_json::Value, String> {
    // Find memories without embeddings (scope all borrows so they drop before await)
    let memories_to_embed: Vec<(String, String)> = {
        let conn = db.conn();
        let mut stmt = match conn.prepare(
            "SELECT m.id, m.content FROM memories m
             LEFT JOIN embeddings e ON e.entity_type = 'memory' AND e.entity_id = m.id
             WHERE e.id IS NULL AND m.is_dismissed = 0",
        ) {
            Ok(s) => s,
            Err(e) => return Err(e.to_string()),
        };
        let rows: Vec<(String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    let conversations_to_embed: Vec<(String, String, String)> = {
        let conn = db.conn();
        let mut stmt = match conn.prepare(
            "SELECT c.id, c.title, c.overview FROM conversations c
             LEFT JOIN embeddings e ON e.entity_type = 'conversation' AND e.entity_id = c.id
             WHERE e.id IS NULL
               AND c.title IS NOT NULL AND c.overview IS NOT NULL
               AND c.discarded = 0",
        ) {
            Ok(s) => s,
            Err(e) => return Err(e.to_string()),
        };
        let rows: Vec<(String, String, String)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    let mut mem_count = 0;
    let mut conv_count = 0;

    let db_arc = db.inner().clone();

    for (id, content) in &memories_to_embed {
        match rag::store_embedding(&embedder, &db_arc, "memory", id, content).await {
            Ok(_) => mem_count += 1,
            Err(e) => log::warn!("Failed to embed memory {}: {}", id, e),
        }
    }

    for (id, title, overview) in &conversations_to_embed {
        let combined = format!("{}\n{}", title, overview);
        match rag::store_embedding(&embedder, &db_arc, "conversation", id, &combined).await {
            Ok(_) => conv_count += 1,
            Err(e) => log::warn!("Failed to embed conversation {}: {}", id, e),
        }
    }

    log::info!(
        "Reindex complete: {} memories, {} conversations",
        mem_count,
        conv_count
    );

    Ok(serde_json::json!({
        "memories_indexed": mem_count,
        "conversations_indexed": conv_count,
        "total": mem_count + conv_count,
    }))
}

#[tauri::command]
async fn chat_send(
    message: String,
    session_id: Option<String>,
    llm: tauri::State<'_, Arc<LlmClient>>,
    embedder: tauri::State<'_, Arc<Embedder>>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<ChatTurnResult, String> {
    if message.trim().is_empty() {
        return Err("Empty message".to_string());
    }

    // Resolve or create session
    let session_id = match session_id {
        Some(s) => s,
        None => {
            let id = uuid::Uuid::new_v4().to_string();
            let conn = db.conn();
            conn.execute(
                "INSERT INTO chat_sessions (id, title) VALUES (?1, ?2)",
                rusqlite::params![id, &message.chars().take(60).collect::<String>()],
            )
            .map_err(|e| e.to_string())?;
            id
        }
    };

    // Load history (excluding the new message we're about to add)
    let history: Vec<ChatMessage> = {
        let conn = db.conn();
        let mut stmt = conn
            .prepare(
                "SELECT sender, text FROM messages WHERE session_id = ?1 ORDER BY created_at",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([&session_id], |row| {
                let sender = row.get::<_, String>(0)?;
                let text = row.get::<_, String>(1)?;
                Ok(if sender == "user" {
                    ChatMessage::user(text)
                } else {
                    ChatMessage::assistant(text)
                })
            })
            .map_err(|e| e.to_string())?;
        iter.filter_map(|r| r.ok()).collect()
    };

    // Persist user message
    let user_msg_id = uuid::Uuid::new_v4().to_string();
    {
        let conn = db.conn();
        conn.execute(
            "INSERT INTO messages (id, session_id, text, sender) VALUES (?1, ?2, ?3, 'user')",
            rusqlite::params![user_msg_id, session_id, message],
        )
        .map_err(|e| e.to_string())?;
    }

    // Run RAG chat
    let (answer, sources) = rag::chat_with_context(&llm, &embedder, &db.inner().clone(), &history, &message).await?;

    // Persist assistant message
    let asst_msg_id = uuid::Uuid::new_v4().to_string();
    {
        let conn = db.conn();
        conn.execute(
            "INSERT INTO messages (id, session_id, text, sender) VALUES (?1, ?2, ?3, 'assistant')",
            rusqlite::params![asst_msg_id, session_id, answer],
        )
        .map_err(|e| e.to_string())?;
        // Bump session updated_at
        let _ = conn.execute(
            "UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = ?1",
            [&session_id],
        );
    }

    Ok(ChatTurnResult {
        answer: {
            // We just inserted the assistant message; pull it back to ensure consistency
            let conn = db.conn();
            conn.query_row(
                "SELECT text FROM messages WHERE id = ?1",
                [&asst_msg_id],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_default()
        },
        sources,
        session_id,
        user_message_id: user_msg_id,
        assistant_message_id: asst_msg_id,
    })
}

#[tauri::command]
fn list_chat_sessions(db: tauri::State<'_, Arc<Database>>) -> Result<serde_json::Value, String> {
    let conn = db.conn();
    let mut stmt = conn
        .prepare(
            "SELECT id, title, updated_at FROM chat_sessions ORDER BY updated_at DESC LIMIT 50",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "title": row.get::<_, Option<String>>(1)?,
                "updated_at": row.get::<_, String>(2)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(serde_json::json!(rows))
}

#[tauri::command]
fn get_chat_messages(
    session_id: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<serde_json::Value, String> {
    let conn = db.conn();
    let mut stmt = conn
        .prepare(
            "SELECT id, sender, text, created_at FROM messages
             WHERE session_id = ?1 ORDER BY created_at",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<serde_json::Value> = stmt
        .query_map([&session_id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "sender": row.get::<_, String>(1)?,
                "text": row.get::<_, String>(2)?,
                "created_at": row.get::<_, String>(3)?,
            }))
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    Ok(serde_json::json!(rows))
}

#[tauri::command]
fn delete_chat_session(
    session_id: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<String, String> {
    let conn = db.conn();
    conn.execute("DELETE FROM chat_sessions WHERE id = ?1", [&session_id])
        .map_err(|e| e.to_string())?;
    Ok("Deleted".to_string())
}

#[tauri::command]
fn delete_conversation(
    id: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<String, String> {
    let conn = db.conn();
    conn.execute("DELETE FROM conversations WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok("Deleted".to_string())
}

// =====================================================
// MEMORY MANAGEMENT
// =====================================================

/// Get a single memory with its source conversation (if any).
#[tauri::command]
fn get_memory_detail(
    id: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<serde_json::Value, String> {
    let conn = db.conn();

    let mem: serde_json::Value = conn
        .query_row(
            "SELECT id, content, category, conversation_id, manually_added, created_at, updated_at, is_dismissed
             FROM memories WHERE id = ?1",
            [&id],
            |row| {
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0)?,
                    "content": row.get::<_, String>(1)?,
                    "category": row.get::<_, String>(2)?,
                    "conversation_id": row.get::<_, Option<String>>(3)?,
                    "manually_added": row.get::<_, bool>(4)?,
                    "created_at": row.get::<_, String>(5)?,
                    "updated_at": row.get::<_, String>(6)?,
                    "is_dismissed": row.get::<_, bool>(7)?,
                }))
            },
        )
        .map_err(|e| format!("Memory not found: {}", e))?;

    let source_conv: Option<serde_json::Value> = mem
        .get("conversation_id")
        .and_then(|v| v.as_str())
        .and_then(|cid| {
            conn.query_row(
                "SELECT id, title, overview, emoji, category, started_at FROM conversations WHERE id = ?1",
                [cid],
                |row| {
                    Ok(serde_json::json!({
                        "id": row.get::<_, String>(0)?,
                        "title": row.get::<_, Option<String>>(1)?,
                        "overview": row.get::<_, Option<String>>(2)?,
                        "emoji": row.get::<_, Option<String>>(3)?,
                        "category": row.get::<_, Option<String>>(4)?,
                        "started_at": row.get::<_, String>(5)?,
                    }))
                },
            )
            .ok()
        });

    Ok(serde_json::json!({
        "memory": mem,
        "source_conversation": source_conv,
    }))
}

/// Update a memory's content and/or category. Re-embeds for RAG search.
#[tauri::command]
async fn update_memory(
    id: String,
    content: Option<String>,
    category: Option<String>,
    db: tauri::State<'_, Arc<Database>>,
    embedder: tauri::State<'_, Arc<Embedder>>,
) -> Result<String, String> {
    if content.is_none() && category.is_none() {
        return Err("Nothing to update".to_string());
    }

    {
        let conn = db.conn();
        if let Some(c) = &content {
            conn.execute(
                "UPDATE memories SET content = ?1, updated_at = datetime('now') WHERE id = ?2",
                rusqlite::params![c, id],
            )
            .map_err(|e| e.to_string())?;
        }
        if let Some(cat) = &category {
            conn.execute(
                "UPDATE memories SET category = ?1, updated_at = datetime('now') WHERE id = ?2",
                rusqlite::params![cat, id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    // Re-embed if content changed
    if let Some(c) = content {
        let _ = llm::rag::store_embedding(&embedder, &db.inner().clone(), "memory", &id, &c).await;
    }

    Ok("Updated".to_string())
}

/// Delete (dismiss) a memory. Hides it from views but keeps the row.
#[tauri::command]
fn dismiss_memory(
    id: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<String, String> {
    let conn = db.conn();
    conn.execute(
        "UPDATE memories SET is_dismissed = 1, updated_at = datetime('now') WHERE id = ?1",
        [&id],
    )
    .map_err(|e| e.to_string())?;
    // Also remove from embeddings so chat doesn't surface it
    let _ = conn.execute(
        "DELETE FROM embeddings WHERE entity_type = 'memory' AND entity_id = ?1",
        [&id],
    );
    Ok("Dismissed".to_string())
}

/// Permanently delete a memory.
#[tauri::command]
fn delete_memory(
    id: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<String, String> {
    let conn = db.conn();
    conn.execute("DELETE FROM memories WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    let _ = conn.execute(
        "DELETE FROM embeddings WHERE entity_type = 'memory' AND entity_id = ?1",
        [&id],
    );
    Ok("Deleted".to_string())
}

#[tauri::command]
fn delete_action_item(
    id: String,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<String, String> {
    let conn = db.conn();
    conn.execute("DELETE FROM action_items WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok("Deleted".to_string())
}

#[tauri::command]
fn clear_completed_tasks(db: tauri::State<'_, Arc<Database>>) -> Result<usize, String> {
    let conn = db.conn();
    let count = conn
        .execute("DELETE FROM action_items WHERE completed = 1", [])
        .map_err(|e| e.to_string())?;
    Ok(count)
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

/// Get the active LLM model name
#[tauri::command]
fn get_active_model(llm: tauri::State<'_, Arc<LlmClient>>) -> String {
    llm.model()
}

/// Set the active LLM model and persist to settings
#[tauri::command]
fn set_active_model(
    model: String,
    llm: tauri::State<'_, Arc<LlmClient>>,
    db: tauri::State<'_, Arc<Database>>,
) -> Result<String, String> {
    llm.set_model(&model);
    let conn = db.conn();
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('active_llm_model', ?1)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        rusqlite::params![model],
    )
    .map_err(|e| e.to_string())?;
    Ok(model)
}

/// List installed Ollama models
#[tauri::command]
async fn list_ollama_models() -> Result<Vec<serde_json::Value>, String> {
    let resp = reqwest::get("http://localhost:11434/api/tags")
        .await
        .map_err(|e| format!("Ollama unreachable: {}", e))?;
    let data: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama models: {}", e))?;
    let models = data
        .get("models")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(models)
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

// =====================================================
// FLOATING BAR
// =====================================================

#[tauri::command]
fn toggle_floating_bar(app: tauri::AppHandle) -> Result<bool, String> {
    let window = app
        .get_webview_window("floating")
        .ok_or("Floating window not found")?;

    let visible = window.is_visible().map_err(|e| e.to_string())?;
    if visible {
        window.hide().map_err(|e| e.to_string())?;
        Ok(false)
    } else {
        window.show().map_err(|e| e.to_string())?;
        // Note: focus is intentionally not called — we want it always-on-top but non-stealing
        Ok(true)
    }
}

#[tauri::command]
fn show_floating_bar(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("floating")
        .ok_or("Floating window not found")?;
    window.show().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn hide_floating_bar(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("floating")
        .ok_or("Floating window not found")?;
    window.hide().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn floating_bar_resize(
    app: tauri::AppHandle,
    width: u32,
    height: u32,
) -> Result<(), String> {
    let window = app
        .get_webview_window("floating")
        .ok_or("Floating window not found")?;
    window
        .set_size(tauri::LogicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn show_main_window(app: tauri::AppHandle) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    // Order matters on Linux/Wayland: unminimize first, then show, then focus
    let _ = window.unminimize();
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_focus();
    Ok(())
}

/// Show main window AND emit an event the frontend listens for to navigate
/// somewhere specific. Used by the floating bar's "open in main" button.
#[tauri::command]
fn show_main_window_with_chat(
    app: tauri::AppHandle,
    session_id: Option<String>,
) -> Result<(), String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window not found")?;
    let _ = window.unminimize();
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_focus();
    // Tell the main window to open the chat page (and the specific session if given)
    let _ = window.emit("open-chat-session", session_id);
    Ok(())
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

    // Load saved model preference from DB, default to 7b (safe while gaming)
    let saved_model: Option<String> = {
        let conn = database.conn();
        conn.query_row(
            "SELECT value FROM settings WHERE key = 'active_llm_model'",
            [],
            |row| row.get(0),
        )
        .ok()
    };
    let initial_model = saved_model.unwrap_or_else(|| "qwen2.5:7b".to_string());
    log::info!("Initial LLM model: {}", initial_model);
    let llm_client = Arc::new(LlmClient::ollama(&initial_model));

    // Tracks the currently active conversation_id while recording
    let current_conversation: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));

    let embedder = Arc::new(Embedder::new());

    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Build a tray context menu — most Linux desktops (incl. KDE)
            // route both clicks through the menu rather than firing raw events.
            let toggle_bar = MenuItem::with_id(app, "toggle_bar", "Toggle Floating Bar", true, None::<&str>)?;
            let open_main = MenuItem::with_id(app, "open_main", "Open Main Window", true, None::<&str>)?;
            let separator = tauri::menu::PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Quit Omniscient", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&toggle_bar, &open_main, &separator, &quit])?;

            if let Some(tray) = app.tray_by_id("main") {
                tray.set_menu(Some(menu)).ok();
                tray.set_show_menu_on_left_click(false).ok();

                // Menu item click handler
                tray.on_menu_event(|app, event| {
                    match event.id.as_ref() {
                        "toggle_bar" => {
                            if let Some(window) = app.get_webview_window("floating") {
                                let visible = window.is_visible().unwrap_or(false);
                                if visible {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                }
                            }
                        }
                        "open_main" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                });

                // Direct click handler — works on platforms that fire it (mainly macOS/Windows)
                tray.on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button,
                        button_state,
                        ..
                    } = event
                    {
                        if button_state != MouseButtonState::Up {
                            return;
                        }
                        let app = tray.app_handle();
                        match button {
                            MouseButton::Left => {
                                if let Some(window) = app.get_webview_window("floating") {
                                    let visible = window.is_visible().unwrap_or(false);
                                    if visible {
                                        let _ = window.hide();
                                    } else {
                                        let _ = window.show();
                                    }
                                }
                            }
                            MouseButton::Middle => {
                                if let Some(window) = app.get_webview_window("main") {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                            _ => {}
                        }
                    }
                });
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
        .manage(embedder)
        .invoke_handler(tauri::generate_handler![
            get_db_stats,
            list_audio_devices,
            start_recording,
            stop_recording,
            cancel_recording,
            get_audio_level,
            is_recording,
            get_recording_status,
            init_transcriber,
            transcribe_pending,
            has_whisper_model,
            check_llm_status,
            get_active_model,
            set_active_model,
            list_ollama_models,
            process_conversation_cmd,
            get_conversations,
            search_conversations,
            get_conversation_detail,
            reprocess_conversation,
            delete_conversation,
            get_memories,
            get_action_items,
            toggle_action_item,
            delete_action_item,
            clear_completed_tasks,
            toggle_floating_bar,
            show_floating_bar,
            hide_floating_bar,
            floating_bar_resize,
            show_main_window,
            show_main_window_with_chat,
            chat_send,
            list_chat_sessions,
            get_chat_messages,
            delete_chat_session,
            reindex_embeddings,
            get_memory_detail,
            update_memory,
            dismiss_memory,
            delete_memory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
