package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

type seatLicense struct {
	ID        string  `db:"id" json:"id"`
	KeyHash   string  `db:"key_hash" json:"key_hash"`
	KeyPlain  *string `db:"key_plain" json:"key_plain,omitempty"`
	InvoiceID string  `db:"invoice_id" json:"invoice_id"`
	Username  *string `db:"username" json:"username,omitempty"`
	CreatedAt string  `db:"created_at" json:"created_at"`
	BoundAt   *string `db:"bound_at" json:"bound_at,omitempty"`
}

type seatOperator struct {
	ID        string  `db:"id" json:"id"`
	Username  string  `db:"username" json:"username"`
	Password  string  `db:"password" json:"password"`
	Email     string  `db:"email" json:"email"`
	CreatedAt string  `db:"created_at" json:"created_at"`
	LastLogin *string `db:"last_login" json:"last_login,omitempty"`
	LastIP    string  `db:"last_ip" json:"last_ip,omitempty"`
}

type seatSnapshot struct {
	Licenses  []seatLicense  `json:"licenses"`
	Operators []seatOperator `json:"operators"`
}

var seatMu sync.Mutex

func edgeConfigID() string {
	return strings.TrimSpace(os.Getenv("EDGE_CONFIG_ID"))
}

func edgeReadToken() string {
	return strings.TrimSpace(os.Getenv("EDGE_CONFIG_TOKEN"))
}

func vercelAPIToken() string {
	if v := strings.TrimSpace(os.Getenv("VERCEL_API_TOKEN")); v != "" {
		return v
	}
	return strings.TrimSpace(os.Getenv("VERCEL_TOKEN"))
}

func vercelTeamID() string {
	if v := strings.TrimSpace(os.Getenv("VERCEL_TEAM_ID")); v != "" {
		return v
	}
	return "team_luaR5KmdxOJMquGNWzrgy0wi"
}

func persistSeats() {
	if db == nil || edgeConfigID() == "" || vercelAPIToken() == "" {
		return
	}
	seatMu.Lock()
	defer seatMu.Unlock()
	ensureAuthTables()
	ensureLicenseTable()
	var lics []seatLicense
	_ = db.Select(&lics, `SELECT id, key_hash, key_plain, invoice_id, username, created_at, bound_at FROM licenses`)
	var ops []seatOperator
	_ = db.Select(&ops, `SELECT id, username, password, COALESCE(email,'') as email, created_at, last_login, COALESCE(last_ip,'') as last_ip FROM operators`)
	if lics == nil {
		lics = []seatLicense{}
	}
	if ops == nil {
		ops = []seatOperator{}
	}
	body, err := json.Marshal(map[string]any{
		"items": []map[string]any{{
			"operation": "upsert",
			"key":       "umbra_seats",
			"value":     seatSnapshot{Licenses: lics, Operators: ops},
		}},
	})
	if err != nil {
		log.Printf("[seats] marshal: %v", err)
		return
	}
	url := fmt.Sprintf("https://api.vercel.com/v1/edge-config/%s/items?teamId=%s", edgeConfigID(), vercelTeamID())
	req, err := http.NewRequest(http.MethodPatch, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+vercelAPIToken())
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 8 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		log.Printf("[seats] persist: %v", err)
		return
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 400))
		log.Printf("[seats] persist %d %s", res.StatusCode, b)
	}
}

func hydrateSeats() {
	if db == nil || edgeConfigID() == "" || edgeReadToken() == "" {
		return
	}
	seatMu.Lock()
	defer seatMu.Unlock()
	url := fmt.Sprintf("https://edge-config.vercel.com/%s/item/umbra_seats?token=%s", edgeConfigID(), edgeReadToken())
	client := &http.Client{Timeout: 8 * time.Second}
	res, err := client.Get(url)
	if err != nil {
		log.Printf("[seats] hydrate: %v", err)
		return
	}
	defer res.Body.Close()
	if res.StatusCode == http.StatusNotFound {
		return
	}
	if res.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(res.Body, 400))
		log.Printf("[seats] hydrate %d %s", res.StatusCode, b)
		return
	}
	raw, err := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if err != nil {
		return
	}
	var snap seatSnapshot
	if err := json.Unmarshal(raw, &snap); err != nil {
		log.Printf("[seats] decode: %v", err)
		return
	}
	ensureAuthTables()
	ensureLicenseTable()
	for _, l := range snap.Licenses {
		if l.ID == "" || l.KeyHash == "" || l.InvoiceID == "" {
			continue
		}
		_, _ = db.Exec(`INSERT INTO licenses (id, key_hash, key_plain, invoice_id, username, created_at, bound_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(invoice_id) DO UPDATE SET
				key_hash=excluded.key_hash,
				key_plain=excluded.key_plain,
				username=excluded.username,
				bound_at=excluded.bound_at`,
			l.ID, l.KeyHash, l.KeyPlain, l.InvoiceID, l.Username, l.CreatedAt, l.BoundAt)
	}
	for _, o := range snap.Operators {
		if o.ID == "" || o.Username == "" || o.Password == "" {
			continue
		}
		_, _ = db.Exec(`INSERT INTO operators (id, username, password, email, created_at, last_login, last_ip)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT(username) DO UPDATE SET
				password=excluded.password,
				email=excluded.email,
				last_login=COALESCE(excluded.last_login, operators.last_login),
				last_ip=COALESCE(NULLIF(excluded.last_ip,''), operators.last_ip)`,
			o.ID, o.Username, o.Password, o.Email, o.CreatedAt, o.LastLogin, o.LastIP)
	}
}
