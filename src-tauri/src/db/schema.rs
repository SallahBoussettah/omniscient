use rusqlite::Connection;

pub fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            source TEXT NOT NULL DEFAULT 'mic',
            language TEXT DEFAULT 'en',
            title TEXT,
            overview TEXT,
            emoji TEXT,
            category TEXT,
            status TEXT NOT NULL DEFAULT 'in_progress',
            discarded INTEGER NOT NULL DEFAULT 0,
            starred INTEGER NOT NULL DEFAULT 0,
            folder_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS transcript_segments (
            id TEXT PRIMARY KEY,
            conversation_id TEXT NOT NULL,
            text TEXT NOT NULL,
            speaker TEXT,
            speaker_id INTEGER,
            is_user INTEGER NOT NULL DEFAULT 0,
            person_id TEXT,
            start_time REAL NOT NULL,
            end_time REAL NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS memories (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'system',
            conversation_id TEXT,
            reviewed INTEGER NOT NULL DEFAULT 0,
            user_review INTEGER,
            manually_added INTEGER NOT NULL DEFAULT 0,
            confidence REAL,
            is_read INTEGER NOT NULL DEFAULT 0,
            is_dismissed INTEGER NOT NULL DEFAULT 0,
            tags TEXT DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS action_items (
            id TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            completed INTEGER NOT NULL DEFAULT 0,
            due_at TEXT,
            confidence REAL,
            priority TEXT NOT NULL DEFAULT 'medium',
            conversation_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS staged_tasks (
            id TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            due_at TEXT,
            priority TEXT NOT NULL DEFAULT 'medium',
            confidence REAL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS chat_sessions (
            id TEXT PRIMARY KEY,
            title TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            session_id TEXT NOT NULL,
            text TEXT NOT NULL,
            sender TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (session_id) REFERENCES chat_sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS focus_sessions (
            id TEXT PRIMARY KEY,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            distraction_count INTEGER NOT NULL DEFAULT 0,
            stats TEXT DEFAULT '{}',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS folders (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            is_default INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS goals (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT,
            goal_type TEXT NOT NULL DEFAULT 'general',
            target TEXT,
            progress REAL NOT NULL DEFAULT 0.0,
            history TEXT DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS knowledge_nodes (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            node_type TEXT NOT NULL,
            aliases TEXT DEFAULT '[]',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS knowledge_edges (
            id TEXT PRIMARY KEY,
            source_id TEXT NOT NULL,
            target_id TEXT NOT NULL,
            relationship TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (source_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE,
            FOREIGN KEY (target_id) REFERENCES knowledge_nodes(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS people (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS screenshots (
            id TEXT PRIMARY KEY,
            timestamp TEXT NOT NULL,
            image BLOB,
            ocr_text TEXT,
            dhash TEXT,
            app_name TEXT,
            window_title TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        -- Full-text search for OCR text
        CREATE VIRTUAL TABLE IF NOT EXISTS screenshots_fts USING fts5(
            ocr_text,
            content='screenshots',
            content_rowid='rowid'
        );

        -- Full-text search for memories
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
            content,
            content='memories',
            content_rowid='rowid'
        );

        -- Full-text search for transcript segments
        CREATE VIRTUAL TABLE IF NOT EXISTS transcripts_fts USING fts5(
            text,
            content='transcript_segments',
            content_rowid='rowid'
        );

        -- Embeddings for RAG. Vector stored as BLOB (f32 little-endian).
        -- entity_type: 'memory' | 'conversation' | 'segment'
        CREATE TABLE IF NOT EXISTS embeddings (
            id TEXT PRIMARY KEY,
            entity_type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            text TEXT NOT NULL,
            vector BLOB NOT NULL,
            dim INTEGER NOT NULL,
            model TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(entity_type, entity_id)
        );
        CREATE INDEX IF NOT EXISTS idx_embeddings_entity ON embeddings(entity_type, entity_id);

        -- Triggers to keep FTS5 indexes in sync with their source tables
        CREATE TRIGGER IF NOT EXISTS transcripts_fts_insert
            AFTER INSERT ON transcript_segments
            BEGIN
                INSERT INTO transcripts_fts(rowid, text) VALUES (new.rowid, new.text);
            END;
        CREATE TRIGGER IF NOT EXISTS transcripts_fts_delete
            AFTER DELETE ON transcript_segments
            BEGIN
                INSERT INTO transcripts_fts(transcripts_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
            END;
        CREATE TRIGGER IF NOT EXISTS transcripts_fts_update
            AFTER UPDATE ON transcript_segments
            BEGIN
                INSERT INTO transcripts_fts(transcripts_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
                INSERT INTO transcripts_fts(rowid, text) VALUES (new.rowid, new.text);
            END;

        CREATE TRIGGER IF NOT EXISTS memories_fts_insert
            AFTER INSERT ON memories
            BEGIN
                INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
            END;
        CREATE TRIGGER IF NOT EXISTS memories_fts_delete
            AFTER DELETE ON memories
            BEGIN
                INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
            END;
        CREATE TRIGGER IF NOT EXISTS memories_fts_update
            AFTER UPDATE ON memories
            BEGIN
                INSERT INTO memories_fts(memories_fts, rowid, content) VALUES ('delete', old.rowid, old.content);
                INSERT INTO memories_fts(rowid, content) VALUES (new.rowid, new.content);
            END;

        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
        CREATE INDEX IF NOT EXISTS idx_conversations_started ON conversations(started_at);
        CREATE INDEX IF NOT EXISTS idx_segments_conversation ON transcript_segments(conversation_id);
        CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(category);
        CREATE INDEX IF NOT EXISTS idx_action_items_completed ON action_items(completed);
        CREATE INDEX IF NOT EXISTS idx_action_items_priority ON action_items(priority);
        CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
        CREATE INDEX IF NOT EXISTS idx_screenshots_timestamp ON screenshots(timestamp);
        ",
    )?;

    // Backfill FTS5 indexes for any existing rows that aren't indexed yet.
    // This handles migration from versions that didn't have triggers.
    let transcript_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM transcript_segments", [], |r| r.get(0))
        .unwrap_or(0);
    let transcript_fts_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM transcripts_fts", [], |r| r.get(0))
        .unwrap_or(0);
    if transcript_count > transcript_fts_count {
        let _ = conn.execute(
            "INSERT INTO transcripts_fts(rowid, text) SELECT rowid, text FROM transcript_segments
             WHERE rowid NOT IN (SELECT rowid FROM transcripts_fts)",
            [],
        );
    }

    let memory_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM memories", [], |r| r.get(0))
        .unwrap_or(0);
    let memory_fts_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM memories_fts", [], |r| r.get(0))
        .unwrap_or(0);
    if memory_count > memory_fts_count {
        let _ = conn.execute(
            "INSERT INTO memories_fts(rowid, content) SELECT rowid, content FROM memories
             WHERE rowid NOT IN (SELECT rowid FROM memories_fts)",
            [],
        );
    }

    Ok(())
}
