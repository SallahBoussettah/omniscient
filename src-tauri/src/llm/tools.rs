use super::client::{ToolDef, ToolFunction};
use super::embed::Embedder;
use super::rag;
use crate::db::Database;
use serde_json::{json, Value};
use std::sync::Arc;

/// Returns the tool definitions exposed to the LLM during chat.
pub fn tool_definitions() -> Vec<ToolDef> {
    vec![
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "create_task".into(),
                description: "Create a new task (action item) for the user. Use this when the user explicitly asks you to add, create, or remember a task.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "description": {
                            "type": "string",
                            "description": "Short description of the task, starts with a verb (e.g. 'Read The Overstory', 'Email Marcus about Q4 plan')"
                        },
                        "priority": {
                            "type": "string",
                            "enum": ["high", "medium", "low"],
                            "description": "Task priority. Use 'high' for urgent or due-today items, 'medium' for this-week, 'low' for no specific deadline."
                        },
                        "due_at": {
                            "type": "string",
                            "description": "Optional due date in ISO 8601 format (e.g. '2026-04-22T09:00:00Z'). Omit if no due date was specified."
                        }
                    },
                    "required": ["description", "priority"]
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "complete_task".into(),
                description: "Mark a task as completed. Search by keywords from the task description.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "search": {
                            "type": "string",
                            "description": "Keywords to find the task by description (case-insensitive substring match)"
                        }
                    },
                    "required": ["search"]
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "update_task".into(),
                description: "Update an existing task's description, priority, or due date. Search to find the task first.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "search": {
                            "type": "string",
                            "description": "Keywords to find the task to update"
                        },
                        "new_description": { "type": "string" },
                        "new_priority": { "type": "string", "enum": ["high", "medium", "low"] },
                        "new_due_at": { "type": "string", "description": "ISO 8601 timestamp" }
                    },
                    "required": ["search"]
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "list_tasks".into(),
                description: "List the user's tasks. Use this when the user asks what's on their plate, what tasks they have, etc.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "filter": {
                            "type": "string",
                            "enum": ["all", "pending", "completed"],
                            "description": "Which tasks to show. Defaults to 'pending'."
                        }
                    }
                }),
            },
        },
        ToolDef {
            kind: "function".into(),
            function: ToolFunction {
                name: "create_memory".into(),
                description: "Save a fact or piece of knowledge for future reference. Use sparingly — only when the user explicitly asks you to remember something.".into(),
                parameters: json!({
                    "type": "object",
                    "properties": {
                        "content": {
                            "type": "string",
                            "description": "The fact or memory, max 15 words, specific and concrete"
                        },
                        "category": {
                            "type": "string",
                            "enum": ["system", "interesting"],
                            "description": "'system' = fact about the user. 'interesting' = external knowledge or recommendation."
                        }
                    },
                    "required": ["content", "category"]
                }),
            },
        },
    ]
}

/// Execute a tool call against the database. Returns a string that gets fed
/// back to the model as the tool result.
pub async fn execute_tool(
    name: &str,
    arguments: &str,
    db: &Arc<Database>,
    embedder: &Embedder,
) -> Result<String, String> {
    let args: Value = serde_json::from_str(arguments)
        .map_err(|e| format!("Invalid tool arguments JSON: {} (raw: {})", e, arguments))?;

    match name {
        "create_task" => create_task(&args, db).await,
        "complete_task" => complete_task(&args, db).await,
        "update_task" => update_task(&args, db).await,
        "list_tasks" => list_tasks(&args, db).await,
        "create_memory" => create_memory(&args, db, embedder).await,
        _ => Err(format!("Unknown tool: {}", name)),
    }
}

async fn create_task(args: &Value, db: &Arc<Database>) -> Result<String, String> {
    let description = args
        .get("description")
        .and_then(Value::as_str)
        .ok_or("Missing 'description'")?;
    let priority = args
        .get("priority")
        .and_then(Value::as_str)
        .unwrap_or("medium");
    let due_at = args.get("due_at").and_then(Value::as_str);

    let id = uuid::Uuid::new_v4().to_string();
    let conn = db.conn();
    conn.execute(
        "INSERT INTO action_items (id, description, priority, due_at, confidence)
         VALUES (?1, ?2, ?3, ?4, 1.0)",
        rusqlite::params![id, description, priority, due_at],
    )
    .map_err(|e| format!("DB insert failed: {}", e))?;

    Ok(format!(
        "Task created (id={}): \"{}\" [{}{}]",
        id,
        description,
        priority,
        due_at.map(|d| format!(", due {}", d)).unwrap_or_default()
    ))
}

async fn complete_task(args: &Value, db: &Arc<Database>) -> Result<String, String> {
    let search = args
        .get("search")
        .and_then(Value::as_str)
        .ok_or("Missing 'search'")?;

    let pattern = format!("%{}%", search.to_lowercase());

    // Find matching pending task
    let row: Option<(String, String)> = {
        let conn = db.conn();
        conn.query_row(
            "SELECT id, description FROM action_items
             WHERE completed = 0 AND LOWER(description) LIKE ?1
             ORDER BY created_at DESC LIMIT 1",
            [&pattern],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .ok()
    };

    let Some((id, description)) = row else {
        return Ok(format!("No pending task matching '{}' found.", search));
    };

    {
        let conn = db.conn();
        conn.execute(
            "UPDATE action_items SET completed = 1, updated_at = datetime('now') WHERE id = ?1",
            [&id],
        )
        .map_err(|e| format!("DB update failed: {}", e))?;
    }

    Ok(format!("Marked as complete: \"{}\"", description))
}

async fn update_task(args: &Value, db: &Arc<Database>) -> Result<String, String> {
    let search = args
        .get("search")
        .and_then(Value::as_str)
        .ok_or("Missing 'search'")?;
    let new_description = args.get("new_description").and_then(Value::as_str);
    let new_priority = args.get("new_priority").and_then(Value::as_str);
    let new_due_at = args.get("new_due_at").and_then(Value::as_str);

    if new_description.is_none() && new_priority.is_none() && new_due_at.is_none() {
        return Err("No fields to update".into());
    }

    let pattern = format!("%{}%", search.to_lowercase());
    let row: Option<(String, String)> = {
        let conn = db.conn();
        conn.query_row(
            "SELECT id, description FROM action_items
             WHERE LOWER(description) LIKE ?1
             ORDER BY completed ASC, created_at DESC LIMIT 1",
            [&pattern],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .ok()
    };

    let Some((id, original)) = row else {
        return Ok(format!("No task matching '{}' found.", search));
    };

    let conn = db.conn();
    if let Some(d) = new_description {
        conn.execute(
            "UPDATE action_items SET description = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![d, id],
        ).map_err(|e| e.to_string())?;
    }
    if let Some(p) = new_priority {
        conn.execute(
            "UPDATE action_items SET priority = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![p, id],
        ).map_err(|e| e.to_string())?;
    }
    if let Some(d) = new_due_at {
        conn.execute(
            "UPDATE action_items SET due_at = ?1, updated_at = datetime('now') WHERE id = ?2",
            rusqlite::params![d, id],
        ).map_err(|e| e.to_string())?;
    }

    Ok(format!("Updated task \"{}\"", original))
}

async fn list_tasks(args: &Value, db: &Arc<Database>) -> Result<String, String> {
    let filter = args
        .get("filter")
        .and_then(Value::as_str)
        .unwrap_or("pending");

    let where_clause = match filter {
        "all" => "",
        "completed" => "WHERE completed = 1",
        _ => "WHERE completed = 0",
    };

    let rows: Vec<(String, String, bool, Option<String>)> = {
        let conn = db.conn();
        let sql = format!(
            "SELECT id, description, completed, priority FROM action_items {}
             ORDER BY completed ASC, created_at DESC LIMIT 30",
            where_clause
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows: Vec<(String, String, bool, Option<String>)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, bool>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    if rows.is_empty() {
        return Ok(format!("No {} tasks found.", filter));
    }

    let mut out = format!("{} {} task(s):\n", rows.len(), filter);
    for (_, desc, done, prio) in &rows {
        let mark = if *done { "[x]" } else { "[ ]" };
        let p = prio.as_deref().unwrap_or("medium");
        out.push_str(&format!("  {} ({}) {}\n", mark, p, desc));
    }
    Ok(out)
}

async fn create_memory(
    args: &Value,
    db: &Arc<Database>,
    embedder: &Embedder,
) -> Result<String, String> {
    let content = args
        .get("content")
        .and_then(Value::as_str)
        .ok_or("Missing 'content'")?;
    let category = args
        .get("category")
        .and_then(Value::as_str)
        .unwrap_or("system");

    let id = uuid::Uuid::new_v4().to_string();
    {
        let conn = db.conn();
        conn.execute(
            "INSERT INTO memories (id, content, category, manually_added) VALUES (?1, ?2, ?3, 1)",
            rusqlite::params![id, content, category],
        )
        .map_err(|e| format!("DB insert failed: {}", e))?;
    }

    // Embed it for future RAG retrieval (best-effort)
    let _ = rag::store_embedding(embedder, db, "memory", &id, content).await;

    Ok(format!("Memory saved: \"{}\"", content))
}
