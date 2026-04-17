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

const CHAT_SYSTEM_PROMPT_TEMPLATE: &str = r#"You are Lumi, the user's personal AI assistant. You have access to their captured conversations and memories. Your name is Lumi (pronounced LOO-mee), from the word 'lumen' — light. If asked what your name is, you answer 'Lumi'.

CURRENT DATE: {today} ({weekday})
Use this date as today, NOT your training cutoff. When creating tasks with due_at, use year {year}.

# CRITICAL TOOL USAGE RULES

You have these tools — they are the ONLY way to actually change anything:
- create_task / update_task / complete_task / list_tasks
- create_memory / update_memory / delete_memory / list_memories
- end_voice_session — call ONLY when the user clearly signals they're wrapping up the voice conversation ("thanks, that's all", "talk later", "I'm done", "goodbye"). Always pair with a brief warm farewell in your text reply (one short sentence). Never call this just because their question was answered.

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

User: "Thanks, that's all."
You: → call end_voice_session
You: "Anytime — talk soon."

User: "Thank you, that's everything."
You: → call end_voice_session
You: "You got it. Catch you later."

User: "I'm done, bye."
You: → call end_voice_session
You: "Bye, Salah."
"#;

fn current_system_prompt() -> String {
    let now = chrono::Local::now();
    CHAT_SYSTEM_PROMPT_TEMPLATE
        .replace("{today}", &now.format("%Y-%m-%d").to_string())
        .replace("{weekday}", &now.format("%A").to_string())
        .replace("{year}", &now.format("%Y").to_string())
}

/// Result of a chat turn — text answer, retrieval hits, and the list of
/// tool names invoked during the turn (in call order, with duplicates).
/// Tool names let the caller react to side-effecting calls like
/// `end_voice_session` without parsing the answer text.
pub type ChatTurn = (String, Vec<SearchHit>, Vec<String>);

/// Tools that actually mutate user data. Used by the post-response
/// verification check below to detect "claim without action" hallucinations.
const MUTATING_TOOLS: &[&str] = &[
    "create_task",
    "update_task",
    "complete_task",
    "create_memory",
    "update_memory",
    "delete_memory",
];

/// Heuristic: does the assistant's text claim it performed a side-effecting
/// action? Small LLMs sometimes say "I've updated…" or "Done!" without
/// actually invoking the tool, so we cross-check this against `tools_called`
/// and force a re-prompt when they disagree.
fn assistant_claims_action(text: &str) -> bool {
    let t = text.to_lowercase();
    const PHRASES: &[&str] = &[
        "i've updated",
        "i have updated",
        "updated it",
        "updated the",
        "i've added",
        "i have added",
        "added it",
        "added the",
        "i've created",
        "i have created",
        "created it",
        "i've removed",
        "i have removed",
        "removed it",
        "removed the",
        "i've deleted",
        "i have deleted",
        "deleted it",
        "i've saved",
        "i have saved",
        "saved it",
        "i've marked",
        "i have marked",
        "marked as complete",
        "marked it as",
        "i've completed",
        "completed it",
        "i've forgotten",
        "forgot it",
        "i've changed",
        "i have changed",
        "changed it",
        "i've fixed",
        "i have fixed",
        "fixed it",
        "i've corrected",
        "corrected it",
        "all done",
        "got it done",
    ];
    PHRASES.iter().any(|p| t.contains(p))
}

fn called_mutating_tool(tools: &[String]) -> bool {
    tools.iter().any(|t| MUTATING_TOOLS.contains(&t.as_str()))
}

/// System message we inject when the model claims an action without calling
/// any mutating tool. Forces it to actually perform the operation.
const VERIFY_SYSTEM_MSG: &str = "VERIFY — Your previous reply claimed you performed an action \
    (e.g. 'I've updated…', 'Done', 'changed it') but you did NOT call any of the mutating tools \
    (create_task / update_task / complete_task / create_memory / update_memory / delete_memory). \
    The user's data is UNCHANGED. Call the correct tool NOW with the user's exact requested values, \
    then respond with ONE short confirmation sentence describing what the tool actually returned.";

/// Run a RAG-augmented chat turn with tool-calling support.
/// Loops up to 5 times executing tool calls and feeding results back until
/// the model returns a final text response.
pub async fn chat_with_context(
    llm: &LlmClient,
    embedder: &Embedder,
    db: &Arc<Database>,
    history: &[ChatMessage],
    user_message: &str,
) -> Result<ChatTurn, String> {
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
    let mut tools_called: Vec<String> = Vec::new();
    let mut verify_used = false;

    // Tool-call loop — bounded to prevent infinite loops
    for iteration in 0..6 {
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
            // Possible final answer — verify the model didn't claim an action
            // it never actually performed. One retry max.
            if !verify_used
                && assistant_claims_action(&response.content)
                && !called_mutating_tool(&tools_called)
            {
                log::warn!(
                    "Action claimed without tool call — forcing verification retry. \
                     Reply: {:?}",
                    response.content.chars().take(120).collect::<String>()
                );
                verify_used = true;
                messages.push(response);
                messages.push(ChatMessage::system(VERIFY_SYSTEM_MSG));
                continue;
            }
            return Ok((response.content, hits, tools_called));
        }

        log::info!("Tool-call loop iter {}: {} call(s)", iteration, calls.len());

        // Push the assistant message containing the tool_calls
        messages.push(response);

        // Execute each tool and append results
        for call in &calls {
            tools_called.push(call.function.name.clone());
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
        tools_called,
    ))
}

/// Streaming version: calls `on_token` for every text delta from the model.
/// Tool-calling iterations are silent — only the FINAL text response streams
/// to the user, so they don't see partial tool-aware output.
pub async fn chat_with_context_stream<F, R>(
    llm: &LlmClient,
    embedder: &Embedder,
    db: &Arc<Database>,
    history: &[ChatMessage],
    user_message: &str,
    mut on_token: F,
    mut on_retry: R,
) -> Result<ChatTurn, String>
where
    F: FnMut(&str) + Send,
    R: FnMut() + Send,
{
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

    let tool_defs = tools::tool_definitions();
    let mut tools_called: Vec<String> = Vec::new();
    let mut verify_used = false;

    let mut accumulated = String::new();

    for iteration in 0..6 {
        let mut iteration_text = String::new();
        let response = llm
            .chat_messages_stream(&messages, Some(&tool_defs), |t| {
                iteration_text.push_str(t);
                // Stream live: every token immediately emitted
                on_token(t);
            })
            .await?;

        accumulated.push_str(&iteration_text);
        let calls = response.tool_calls.clone().unwrap_or_default();
        log::info!(
            "Stream iter {}: text_len={}, tool_calls={}",
            iteration,
            iteration_text.len(),
            calls.len()
        );

        if calls.is_empty() {
            // Verify the model didn't claim an action it never performed.
            // The first attempt was already streamed live to the user. We
            // signal the caller (via on_retry) so it can wipe what was
            // emitted before — voice mode resets the karaoke + cancels TTS,
            // chat replaces the displayed bubble. The retried response
            // streams cleanly through on_token afterward.
            if !verify_used
                && assistant_claims_action(&response.content)
                && !called_mutating_tool(&tools_called)
            {
                log::warn!(
                    "Stream: action claimed without tool call — forcing verification retry."
                );
                verify_used = true;
                on_retry();
                accumulated.clear();
                messages.push(response);
                messages.push(ChatMessage::system(VERIFY_SYSTEM_MSG));
                continue;
            }
            return Ok((accumulated, hits, tools_called));
        }

        // Tool-calling iteration: execute, then continue. The text we just
        // streamed was the model's preamble (e.g. "I'll do that for you").
        // Add a small separator before the next iteration's text starts.
        if !iteration_text.is_empty() {
            on_token("\n\n");
            accumulated.push_str("\n\n");
        }
        messages.push(response);
        for call in &calls {
            tools_called.push(call.function.name.clone());
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

    let fallback = "I tried multiple actions but didn't reach a final answer.";
    on_token(fallback);
    Ok((accumulated + fallback, hits, tools_called))
}
