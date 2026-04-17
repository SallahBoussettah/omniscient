//! Full-database export to JSON or Markdown.
//!
//! Walks every conversation, transcript, memory, task, and chat session,
//! and writes a single self-contained file the user can keep as a backup
//! or browse in any text editor.

use crate::db::Database;
use serde::Serialize;
use std::fs;
use std::path::Path;
use std::sync::Arc;

#[derive(Serialize)]
pub struct ExportBundle {
    pub exported_at: String,
    pub conversations: Vec<ConvExport>,
    pub memories: Vec<MemoryExport>,
    pub tasks: Vec<TaskExport>,
    pub chat_sessions: Vec<ChatSessionExport>,
}

#[derive(Serialize)]
pub struct ConvExport {
    pub id: String,
    pub title: Option<String>,
    pub overview: Option<String>,
    pub emoji: Option<String>,
    pub category: Option<String>,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub segments: Vec<SegmentExport>,
}

#[derive(Serialize)]
pub struct SegmentExport {
    pub text: String,
    pub start_time: f64,
    pub end_time: f64,
}

#[derive(Serialize)]
pub struct MemoryExport {
    pub id: String,
    pub content: String,
    pub category: String,
    pub conversation_id: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct TaskExport {
    pub id: String,
    pub description: String,
    pub completed: bool,
    pub priority: String,
    pub due_at: Option<String>,
    pub created_at: String,
}

#[derive(Serialize)]
pub struct ChatSessionExport {
    pub id: String,
    pub title: Option<String>,
    pub created_at: String,
    pub messages: Vec<ChatMessageExport>,
}

#[derive(Serialize)]
pub struct ChatMessageExport {
    pub sender: String,
    pub text: String,
    pub created_at: String,
}

pub fn build_bundle(db: &Arc<Database>) -> Result<ExportBundle, String> {
    let conn = db.conn();

    let conversations: Vec<ConvExport> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, overview, emoji, category, status, started_at, finished_at
                 FROM conversations WHERE discarded = 0 ORDER BY started_at",
            )
            .map_err(|e| e.to_string())?;
        let convs: Vec<(String, Option<String>, Option<String>, Option<String>, Option<String>, String, String, Option<String>)> = stmt
            .query_map([], |row| {
                Ok((
                    row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                    row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?,
                ))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let mut out = Vec::with_capacity(convs.len());
        for (id, title, overview, emoji, category, status, started_at, finished_at) in convs {
            let mut seg_stmt = conn
                .prepare(
                    "SELECT text, start_time, end_time FROM transcript_segments
                     WHERE conversation_id = ?1 ORDER BY start_time",
                )
                .map_err(|e| e.to_string())?;
            let segments: Vec<SegmentExport> = seg_stmt
                .query_map([&id], |row| {
                    Ok(SegmentExport {
                        text: row.get(0)?,
                        start_time: row.get(1)?,
                        end_time: row.get(2)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            out.push(ConvExport {
                id, title, overview, emoji, category, status, started_at, finished_at,
                segments,
            });
        }
        out
    };

    let memories: Vec<MemoryExport> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, content, category, conversation_id, created_at
                 FROM memories WHERE is_dismissed = 0 ORDER BY created_at",
            )
            .map_err(|e| e.to_string())?;
        let collected: Vec<MemoryExport> = stmt
            .query_map([], |row| {
                Ok(MemoryExport {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    category: row.get(2)?,
                    conversation_id: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        collected
    };

    let tasks: Vec<TaskExport> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, description, completed, priority, due_at, created_at
                 FROM action_items ORDER BY created_at",
            )
            .map_err(|e| e.to_string())?;
        let collected: Vec<TaskExport> = stmt
            .query_map([], |row| {
                Ok(TaskExport {
                    id: row.get(0)?,
                    description: row.get(1)?,
                    completed: row.get(2)?,
                    priority: row.get(3)?,
                    due_at: row.get(4)?,
                    created_at: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        collected
    };

    let chat_sessions: Vec<ChatSessionExport> = {
        let mut stmt = conn
            .prepare(
                "SELECT id, title, created_at FROM chat_sessions ORDER BY created_at",
            )
            .map_err(|e| e.to_string())?;
        let rows: Vec<(String, Option<String>, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        let mut out = Vec::with_capacity(rows.len());
        for (id, title, created_at) in rows {
            let mut msg_stmt = conn
                .prepare(
                    "SELECT sender, text, created_at FROM messages
                     WHERE session_id = ?1 ORDER BY created_at",
                )
                .map_err(|e| e.to_string())?;
            let messages: Vec<ChatMessageExport> = msg_stmt
                .query_map([&id], |row| {
                    Ok(ChatMessageExport {
                        sender: row.get(0)?,
                        text: row.get(1)?,
                        created_at: row.get(2)?,
                    })
                })
                .map_err(|e| e.to_string())?
                .filter_map(|r| r.ok())
                .collect();
            out.push(ChatSessionExport { id, title, created_at, messages });
        }
        out
    };

    Ok(ExportBundle {
        exported_at: chrono::Utc::now().to_rfc3339(),
        conversations,
        memories,
        tasks,
        chat_sessions,
    })
}

pub fn render_markdown(b: &ExportBundle) -> String {
    let mut s = String::new();
    s.push_str(&format!("# Omniscient Export\n\nExported at {}\n\n", b.exported_at));

    s.push_str(&format!("## Conversations ({})\n\n", b.conversations.len()));
    for c in &b.conversations {
        let emoji = c.emoji.as_deref().unwrap_or("");
        let title = c.title.as_deref().unwrap_or("Untitled");
        s.push_str(&format!("### {} {}\n\n", emoji, title));
        s.push_str(&format!("- Started: {}\n", c.started_at));
        if let Some(f) = &c.finished_at {
            s.push_str(&format!("- Finished: {}\n", f));
        }
        if let Some(cat) = &c.category {
            s.push_str(&format!("- Category: {}\n", cat));
        }
        s.push_str(&format!("- Status: {}\n\n", c.status));
        if let Some(o) = &c.overview {
            s.push_str(&format!("**Overview:** {}\n\n", o));
        }
        if !c.segments.is_empty() {
            s.push_str("**Transcript:**\n\n");
            for seg in &c.segments {
                s.push_str(&format!("> {}\n>\n", seg.text.trim()));
            }
            s.push('\n');
        }
        s.push_str("---\n\n");
    }

    s.push_str(&format!("## Memories ({})\n\n", b.memories.len()));
    for m in &b.memories {
        s.push_str(&format!("- [{}] {} _({})_\n", m.category, m.content, m.created_at));
    }
    s.push('\n');

    s.push_str(&format!("## Tasks ({})\n\n", b.tasks.len()));
    for t in &b.tasks {
        let mark = if t.completed { "x" } else { " " };
        let due = t.due_at.as_deref().map(|d| format!(" — due {}", d)).unwrap_or_default();
        s.push_str(&format!("- [{}] ({}) {}{}\n", mark, t.priority, t.description, due));
    }
    s.push('\n');

    s.push_str(&format!("## Chat Sessions ({})\n\n", b.chat_sessions.len()));
    for sess in &b.chat_sessions {
        s.push_str(&format!("### {}\n\n", sess.title.as_deref().unwrap_or("Untitled chat")));
        for m in &sess.messages {
            let who = if m.sender == "user" { "**You**" } else { "**Omniscient**" };
            s.push_str(&format!("{}: {}\n\n", who, m.text));
        }
        s.push_str("---\n\n");
    }

    s
}

/// Write either JSON or Markdown to the given path. Format is inferred
/// from the path's extension.
pub fn write_to_path(db: &Arc<Database>, path: &Path) -> Result<usize, String> {
    let bundle = build_bundle(db)?;
    let payload = match path.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase()) {
        Some(ref ext) if ext == "md" || ext == "markdown" => render_markdown(&bundle),
        _ => serde_json::to_string_pretty(&bundle)
            .map_err(|e| format!("Failed to serialize: {}", e))?,
    };
    fs::write(path, &payload).map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;
    Ok(payload.len())
}
