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
        rusqlite::params![
            id,
            entity_type,
            entity_id,
            text,
            blob,
            dim,
            embedder.model_name()
        ],
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
            .prepare("SELECT entity_type, entity_id, text, vector, created_at FROM embeddings")
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

    scored.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
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

const CHAT_SYSTEM_PROMPT_TEMPLATE: &str = r#"You are Omniscient, the user's personal AI assistant. You have access to their captured conversations and memories.

CURRENT DATE: {today} ({weekday})
Use this date as today, NOT your training cutoff. When creating tasks with due_at, use year {year}.

# CRITICAL TOOL USAGE RULES

You have these tools — they are the ONLY way to actually change anything:
- create_task / update_task / complete_task / list_tasks
- create_memory / update_memory / delete_memory / list_memories

You MUST call a tool when the user asks you to:
- "add a task / remind me / I need to" → create_task
- "mark X done / I finished" → complete_task
- "change/fix/update/correct/edit memory X" → update_memory
- "forget/delete/remove memory X" → delete_memory
- "what do you remember about X / show my memories" → list_memories
- "what's on my list / show tasks" → list_tasks

NEVER fabricate that you did something. If you didn't call the tool, you didn't do it.
NEVER write 'I've updated...', 'I've added...', 'Done!' WITHOUT first calling the corresponding tool.

After a tool returns, write ONE short sentence confirming what happened, using the tool's actual return as truth.

# DEDUPLICATION
- Before create_memory: if context already shows a similar memory, do NOT recreate it.
- Before create_task: if context shows a near-identical pending task, do NOT recreate it.

# STYLE
- One sentence per turn unless asked for detail.
- No "is there anything else?" filler.
- Speak in first person ("I").
- For general knowledge questions unrelated to captured data, answer normally without tools.

# EXAMPLES

User: "Change Martos to Marcus in the Overstory memory"
You: → call update_memory(search="Martos Overstory", new_content="Marcus recommended The Overstory book")
You (after tool): "Done — fixed Martos to Marcus."

User: "What did Marcus tell me?"
You: (no tool needed, answer from context)
You: "Marcus recommended the book The Overstory."

User: "Forget the bit about the movie at 10am"
You: → call delete_memory(search="movie 10am")
You: "Removed."
"#;

fn current_system_prompt() -> String {
    let now = chrono::Local::now();
    CHAT_SYSTEM_PROMPT_TEMPLATE
        .replace("{today}", &now.format("%Y-%m-%d").to_string())
        .replace("{weekday}", &now.format("%A").to_string())
        .replace("{year}", &now.format("%Y").to_string())
}

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
    let hits = search(embedder, db, user_message, 6)
        .await
        .unwrap_or_default();
    let context = format_context(&hits);

    let mut messages: Vec<ChatMessage> = Vec::new();
    messages.push(ChatMessage::system(format!(
        "{}\n\n---\n\n{}",
        current_system_prompt(),
        context
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

        log::info!(
            "Chat iter {}: content_len={}, tool_calls={}",
            iteration,
            response.content.len(),
            calls.len()
        );

        if calls.is_empty() {
            // Final answer
            return Ok((response.content, hits));
        }

        log::info!("Tool-call loop iter {}: {} call(s)", iteration, calls.len());

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
        "I tried multiple actions but didn't reach a final answer. Please rephrase or try again."
            .to_string(),
        hits,
    ))
}
