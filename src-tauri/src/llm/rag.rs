use super::client::{ChatMessage, LlmClient};
use super::embed::{blob_to_vec, cosine, vec_to_blob, Embedder};
use super::tools;
use crate::db::Database;
use std::sync::Arc;

#[derive(Debug, serde::Serialize, Clone)]
pub struct SearchHit {
    pub entity_type: String,
    pub entity_id: String,
    pub text: String,
    pub score: f32,
    pub created_at: String,
}

/// Embed and store a single text into the embeddings table.
/// Replaces any existing embedding for the same (entity_type, entity_id).
pub async fn store_embedding(
    embedder: &Embedder,
    db: &Arc<Database>,
    entity_type: &str,
    entity_id: &str,
    text: &str,
) -> Result<(), String> {
    if text.trim().is_empty() {
        return Ok(());
    }

    let vector = embedder.embed(text).await?;
    let dim = vector.len();
    let blob = vec_to_blob(&vector);

    let conn = db.conn();
    let id = uuid::Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO embeddings (id, entity_type, entity_id, text, vector, dim, model)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(entity_type, entity_id) DO UPDATE SET
           text = excluded.text, vector = excluded.vector, dim = excluded.dim,
           model = excluded.model, created_at = datetime('now')",
        rusqlite::params![id, entity_type, entity_id, text, blob, dim, embedder.model_name()],
    )
    .map_err(|e| format!("Failed to store embedding: {}", e))?;

    Ok(())
}

/// Search the embeddings table for the top-K most similar entries to `query`.
/// Brute-force cosine similarity — fine up to ~10k entries.
pub async fn search(
    embedder: &Embedder,
    db: &Arc<Database>,
    query: &str,
    top_k: usize,
) -> Result<Vec<SearchHit>, String> {
    let qvec = embedder.embed(query).await?;

    let rows: Vec<(String, String, String, Vec<u8>, String)> = {
        let conn = db.conn();
        let mut stmt = conn
            .prepare(
                "SELECT entity_type, entity_id, text, vector, created_at FROM embeddings",
            )
            .map_err(|e| e.to_string())?;
        let iter = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Vec<u8>>(3)?,
                    row.get::<_, String>(4)?,
                ))
            })
            .map_err(|e| e.to_string())?;
        iter.filter_map(|r| r.ok()).collect()
    };

    let mut scored: Vec<SearchHit> = rows
        .into_iter()
        .map(|(et, eid, text, blob, created_at)| {
            let v = blob_to_vec(&blob);
            let score = cosine(&qvec, &v);
            SearchHit {
                entity_type: et,
                entity_id: eid,
                text,
                score,
                created_at,
            }
        })
        .collect();

    scored.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);
    Ok(scored)
}

/// Format retrieved hits as context for the LLM.
pub fn format_context(hits: &[SearchHit]) -> String {
    if hits.is_empty() {
        return "No relevant context found in your captured data.".to_string();
    }

    let mut out = String::from("Relevant context from your past activity:\n\n");
    for (i, hit) in hits.iter().enumerate() {
        let kind = match hit.entity_type.as_str() {
            "memory" => "Memory",
            "conversation" => "Conversation",
            "segment" => "Transcript snippet",
            other => other,
        };
        out.push_str(&format!(
            "[{}] {} (relevance {:.0}%):\n{}\n\n",
            i + 1,
            kind,
            hit.score * 100.0,
            hit.text.trim()
        ));
    }
    out
}

const CHAT_SYSTEM_PROMPT: &str = r#"You are Omniscient, the user's personal AI assistant. You have access to their captured conversations, extracted memories, and notes. When answering, ground your response in the provided context. If the context doesn't contain the answer, say so honestly — don't fabricate details.

You have tools to actually create, update, and complete tasks, and to save memories. WHEN THE USER ASKS YOU TO DO SOMETHING (add a task, mark something done, save a note, list tasks), USE THE TOOLS. Do not just say you'll do it — actually call the function. After the tool runs, briefly confirm what you did in natural language.

Be concise and conversational. Refer to specific memories or conversations naturally (e.g., "From your conversation about X..."). Use first person when speaking as the assistant.

For general knowledge, math, code, or things unrelated to the user's captured data, answer normally without using tools."#;

/// Run a RAG-augmented chat turn with tool-calling support.
/// Loops up to 5 times executing tool calls and feeding results back until
/// the model returns a final text response.
pub async fn chat_with_context(
    llm: &LlmClient,
    embedder: &Embedder,
    db: &Arc<Database>,
    history: &[ChatMessage],
    user_message: &str,
) -> Result<(String, Vec<SearchHit>), String> {
    let hits = search(embedder, db, user_message, 6).await.unwrap_or_default();
    let context = format_context(&hits);

    let mut messages: Vec<ChatMessage> = Vec::new();
    messages.push(ChatMessage::system(format!(
        "{}\n\n---\n\n{}",
        CHAT_SYSTEM_PROMPT, context
    )));
    messages.extend_from_slice(history);
    messages.push(ChatMessage::user(user_message));

    let tools = tools::tool_definitions();

    // Tool-call loop — bounded to prevent infinite loops
    for iteration in 0..5 {
        let response = llm
            .chat_messages_with_tools(&messages, Some(&tools))
            .await?;

        let calls = response.tool_calls.clone().unwrap_or_default();

        if calls.is_empty() {
            // Final answer
            return Ok((response.content, hits));
        }

        log::info!(
            "Tool-call loop iter {}: {} call(s)",
            iteration,
            calls.len()
        );

        // Push the assistant message containing the tool_calls
        messages.push(response);

        // Execute each tool and append results
        for call in &calls {
            let result = match tools::execute_tool(
                &call.function.name,
                &call.function.arguments,
                db,
                embedder,
            )
            .await
            {
                Ok(s) => s,
                Err(e) => format!("Error: {}", e),
            };
            log::info!("  -> {}: {}", call.function.name, result);
            messages.push(ChatMessage::tool_result(
                &call.id,
                &call.function.name,
                result,
            ));
        }
    }

    // If we exhausted iterations, return whatever the last text was (or a fallback)
    Ok((
        "I tried multiple actions but didn't reach a final answer. Please rephrase or try again.".to_string(),
        hits,
    ))
}
