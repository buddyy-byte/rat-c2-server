package filetransfer

import (
	"bytes"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jmoiron/sqlx"
)

// Durable file storage for a serverless host.
//
// Chunks used to be appended to a file under /tmp, which exists per instance and
// disappears when the instance recycles — so a transfer completed one second and
// 404'd the next. When a Vercel Blob store is connected (BLOB_READ_WRITE_TOKEN),
// each chunk goes to Blob at a deterministic path and the download streams the
// chunk objects back in order. The transfer metadata is mirrored to Edge Config
// so the row survives too — otherwise the instance answering the download has
// never heard of the transfer.

const (
	blobPrefix    = "umbra/files"
	blobAPIVer    = "7"
	blobAccessHdr = "x-vercel-blob-access"

	metaKey     = "umbra_file_meta"
	metaKeep    = 300
	blobMarker  = "blob:"
	chunkSuffix = ".chunk"
)

var blobHTTP = &http.Client{Timeout: 30 * time.Second}

func blobToken() string { return strings.TrimSpace(os.Getenv("BLOB_READ_WRITE_TOKEN")) }

// BlobEnabled reports whether transfers will be stored durably.
func BlobEnabled() bool { return blobToken() != "" }

func edgeID() string { return strings.TrimSpace(os.Getenv("EDGE_CONFIG_ID")) }

func edgeReadTok() string { return strings.TrimSpace(os.Getenv("EDGE_CONFIG_TOKEN")) }

func vercelTok() string {
	if v := strings.TrimSpace(os.Getenv("VERCEL_API_TOKEN")); v != "" {
		return v
	}
	return strings.TrimSpace(os.Getenv("VERCEL_TOKEN"))
}

func edgeTeam() string {
	if v := strings.TrimSpace(os.Getenv("VERCEL_TEAM_ID")); v != "" {
		return v
	}
	return "team_zlN2xv2clMT8RNMeyAOMbWOT"
}

// metaDurable reports whether transfer metadata can be mirrored.
func metaDurable() bool { return edgeID() != "" && vercelTok() != "" }

func blobPath(id string, idx int) string {
	return fmt.Sprintf("%s/%s/%08d%s", blobPrefix, id, idx, chunkSuffix)
}

// blobRef builds the marker stored in files.temp_path.
func blobRef(host, id string) string { return blobMarker + host + "|" + id }

// parseBlobRef reads the marker back. A PRIVATE blob store does not serve reads
// from blob.vercel-storage.com — the PUT response names a store-specific host, so
// the host has to travel with the transfer or a later instance cannot fetch it.
func parseBlobRef(tempPath string) (host, id string, ok bool) {
	if !strings.HasPrefix(tempPath, blobMarker) {
		return "", "", false
	}
	parts := strings.SplitN(strings.TrimPrefix(tempPath, blobMarker), "|", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

// putChunk stores one chunk and returns the host that will serve it back.
func putChunk(id string, idx int, data []byte) (string, error) {
	tok := blobToken()
	if tok == "" {
		return "", fmt.Errorf("blob not configured")
	}
	putURL := "https://blob.vercel-storage.com/" + blobPath(id, idx)
	req, err := http.NewRequest(http.MethodPut, putURL, bytes.NewReader(data))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("x-api-version", blobAPIVer)
	req.Header.Set("x-content-type", "application/octet-stream")
	req.Header.Set("x-add-random-suffix", "0")
	req.Header.Set(blobAccessHdr, "private")
	req.Header.Set("x-allow-overwrite", "1")
	res, err := blobHTTP.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(res.Body, 8192))
	if res.StatusCode >= 300 {
		return "", fmt.Errorf("blob put %d: %s", res.StatusCode, bytes.TrimSpace(body))
	}
	var out struct {
		URL string `json:"url"`
	}
	if json.Unmarshal(body, &out) == nil && out.URL != "" {
		if u, perr := url.Parse(out.URL); perr == nil && u.Host != "" {
			return u.Host, nil
		}
	}
	return "blob.vercel-storage.com", nil
}

// getChunk returns the chunk body, or ok=false once the index runs past the end.
func getChunk(host, id string, idx int) (io.ReadCloser, bool, error) {
	tok := blobToken()
	if tok == "" {
		return nil, false, fmt.Errorf("blob not configured")
	}
	if host == "" {
		host = "blob.vercel-storage.com"
	}
	getURL := "https://" + host + "/" + blobPath(id, idx)
	req, err := http.NewRequest(http.MethodGet, getURL, nil)
	if err != nil {
		return nil, false, err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("x-api-version", blobAPIVer)
	req.Header.Set(blobAccessHdr, "private")
	res, err := blobHTTP.Do(req)
	if err != nil {
		return nil, false, err
	}
	if res.StatusCode == http.StatusNotFound {
		res.Body.Close()
		return nil, false, nil
	}
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 300))
		res.Body.Close()
		return nil, false, fmt.Errorf("blob get %d: %s", res.StatusCode, bytes.TrimSpace(b))
	}
	return res.Body, true, nil
}

func deleteTransferBlobs(host, id string) {
	tok := blobToken()
	if tok == "" {
		return
	}
	if host == "" {
		host = "blob.vercel-storage.com"
	}
	// Walk until the first gap; this only runs on an explicit operator delete, so
	// a couple of trailing 404s is cheaper than a LIST round trip.
	var urls []string
	for i := 0; i < 65536; i++ {
		_, found, err := getChunk(host, id, i)
		if err != nil || !found {
			break
		}
		urls = append(urls, "https://"+host+"/"+blobPath(id, i))
		if len(urls) >= 200 {
			postBlobDelete(urls)
			urls = urls[:0]
		}
	}
	if len(urls) > 0 {
		postBlobDelete(urls)
	}
}

func postBlobDelete(urls []string) {
	body, _ := json.Marshal(map[string]any{"urls": urls})
	req, err := http.NewRequest(http.MethodPost, "https://blob.vercel-storage.com/delete", bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+blobToken())
	req.Header.Set("x-api-version", blobAPIVer)
	req.Header.Set("Content-Type", "application/json")
	res, err := blobHTTP.Do(req)
	if err != nil {
		return
	}
	defer res.Body.Close()
	io.Copy(io.Discard, io.LimitReader(res.Body, 4096))
}

// Serve streams a completed transfer to w. Blob-backed transfers are copied chunk
// by chunk so a large file never has to be held in memory on the function.
func (m *Manager) Serve(ft *FileTransfer, w io.Writer) (int64, error) {
	if host, id, isBlob := parseBlobRef(ft.TempPath); isBlob {
		var total int64
		for i := 0; ; i++ {
			rc, ok, err := getChunk(host, id, i)
			if err != nil {
				return total, err
			}
			if !ok {
				break
			}
			n, cerr := io.Copy(w, rc)
			rc.Close()
			total += n
			if cerr != nil {
				return total, cerr
			}
			if i > 65535 {
				break
			}
		}
		if total == 0 {
			return 0, fmt.Errorf("no stored chunks for %s", id)
		}
		return total, nil
	}
	f, err := os.Open(ft.TempPath)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	return io.Copy(w, f)
}

func sha256OfBlob(host, id string) (string, error) {
	h := sha256.New()
	for i := 0; ; i++ {
		rc, ok, err := getChunk(host, id, i)
		if err != nil {
			return "", err
		}
		if !ok {
			break
		}
		_, cerr := io.Copy(h, rc)
		rc.Close()
		if cerr != nil {
			return "", cerr
		}
		if i > 65535 {
			break
		}
	}
	return fmt.Sprintf("%x", h.Sum(nil)), nil
}

// Delete also clears the blob chunks.
func (m *Manager) DeleteTransfer(id string) error {
	var ft FileTransfer
	err := m.db.Get(&ft, "SELECT "+fileCols+" FROM files WHERE id = ?", id)
	if err == nil {
		if host, blobID, isBlob := parseBlobRef(ft.TempPath); isBlob {
			go deleteTransferBlobs(host, blobID)
		}
	}
	return m.Delete(id)
}

// PurgeAgentTransfers removes every transfer row for an agent and the blobs
// behind them. Deleting an agent cascades its rows away via the FK, so without
// this the chunk objects stayed in Blob forever with nothing pointing at them.
func (m *Manager) PurgeAgentTransfers(agentID string) int {
	if m.db == nil || strings.TrimSpace(agentID) == "" {
		return 0
	}
	var rows []FileTransfer
	if err := m.db.Select(&rows, "SELECT "+fileCols+" FROM files WHERE agent_id = ?", agentID); err != nil {
		return 0
	}
	n := 0
	for _, r := range rows {
		if host, id, ok := parseBlobRef(r.TempPath); ok {
			deleteTransferBlobs(host, id)
		}
		n++
	}
	_, _ = m.db.Exec("DELETE FROM files WHERE agent_id = ?", agentID)
	go m.persistFileMeta(true)
	return n
}

// ---- metadata mirror -------------------------------------------------------

var metaMu sync.Mutex
var lastMetaSave time.Time

type fileMetaSnapshot struct {
	Files   []map[string]any `json:"files"`
	SavedAt time.Time        `json:"saved_at"`
}

// persistFileMeta mirrors the newest transfer rows to Edge Config. Without it a
// cold instance has no row for a transfer whose bytes are safely in Blob, and the
// download endpoint answers 404 for a file that exists.
func (m *Manager) persistFileMeta(force bool) {
	if m.db == nil || !metaDurable() {
		return
	}
	metaMu.Lock()
	if !force && time.Since(lastMetaSave) < 5*time.Second {
		metaMu.Unlock()
		return
	}
	lastMetaSave = time.Now()
	metaMu.Unlock()

	var rows []FileTransfer
	if err := m.db.Select(&rows, "SELECT "+fileCols+" FROM files ORDER BY created_at DESC LIMIT ?", metaKeep); err != nil {
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, r := range rows {
		out = append(out, map[string]any{
			"id": r.ID, "agent_id": r.AgentID, "filename": r.Filename, "path": r.Path,
			"size": r.Size, "checksum": r.Checksum, "mime_type": r.MimeType,
			"operation": r.Operation, "status": r.Status, "progress": r.Progress,
			"chunks_total": r.ChunksTotal, "chunks_received": r.ChunksReceived,
			"temp_path": r.TempPath, "created_at": r.CreatedAt, "completed_at": r.CompletedAt,
			"error": r.Error,
		})
	}
	payload, err := json.Marshal(fileMetaSnapshot{Files: out, SavedAt: time.Now()})
	if err != nil {
		return
	}
	body, _ := json.Marshal(map[string]any{
		"items": []map[string]any{{"operation": "upsert", "key": metaKey, "value": json.RawMessage(payload)}},
	})
	url := "https://api.vercel.com/v1/edge-config/" + edgeID() + "/items?teamId=" + edgeTeam()
	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+vercelTok())
	req.Header.Set("Content-Type", "application/json")
	res, err := blobHTTP.Do(req)
	if err != nil {
		log.Printf("[file] meta persist: %v", err)
		return
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 200))
		log.Printf("[file] meta persist %d %s", res.StatusCode, b)
	}
}

// HydrateFileMeta restores transfer rows from the mirror at boot.
func HydrateFileMeta(db *sqlx.DB) {
	if db == nil || edgeID() == "" || edgeReadTok() == "" {
		return
	}
	res, err := blobHTTP.Get("https://edge-config.vercel.com/" + edgeID() + "/item/" + metaKey + "?token=" + edgeReadTok())
	if err != nil || res.StatusCode >= 300 {
		if res != nil {
			res.Body.Close()
		}
		return
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	var snap fileMetaSnapshot
	if json.Unmarshal(raw, &snap) != nil {
		return
	}
	n := 0
	for _, f := range snap.Files {
		id := str(f["id"])
		agentID := str(f["agent_id"])
		if id == "" || agentID == "" {
			continue
		}
		_, err := db.Exec(`
			INSERT INTO files (id, agent_id, filename, path, size, checksum, mime_type, operation,
				status, progress, chunks_total, chunks_received, temp_path, created_at, completed_at, error)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				status=excluded.status, progress=excluded.progress, size=excluded.size,
				checksum=excluded.checksum, chunks_received=excluded.chunks_received,
				temp_path=excluded.temp_path, completed_at=excluded.completed_at, error=excluded.error`,
			id, agentID, str(f["filename"]), str(f["path"]), int64(num(f["size"])), str(f["checksum"]),
			str(f["mime_type"]), str(f["operation"]), str(f["status"]), num(f["progress"]),
			int(num(f["chunks_total"])), int(num(f["chunks_received"])), str(f["temp_path"]),
			str(f["created_at"]), nil, str(f["error"]))
		if err == nil {
			n++
		}
	}
	if n > 0 {
		log.Printf("[file] hydrated %d transfers from the durable mirror", n)
	}
}

func str(v any) string {
	if v == nil {
		return ""
	}
	if s, ok := v.(string); ok {
		return s
	}
	return fmt.Sprintf("%v", v)
}

func num(v any) float64 {
	switch t := v.(type) {
	case float64:
		return t
	case int:
		return float64(t)
	case int64:
		return float64(t)
	case string:
		f, _ := strconv.ParseFloat(t, 64)
		return f
	}
	return 0
}
