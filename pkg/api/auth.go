package api

import (
	"crypto/subtle"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const operatorUser = "chemical"

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

func ownerUser() string {
	if v := strings.TrimSpace(os.Getenv("RATC2_OPERATOR_USER")); v != "" {
		return v
	}
	return operatorUser
}

func ownerPass() string {
	return strings.TrimSpace(os.Getenv("RATC2_OPERATOR_PASS"))
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
		)` )
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

func ownerEmail() string {
	if v := strings.TrimSpace(os.Getenv("RATC2_OPERATOR_EMAIL")); v != "" {
		return v
	}
	return "owner@chemical-umbra.local"
}

func ownerPublicRow() operatorPublic {
	ensureAuthTables()
	if db != nil {
		if row, ok := lookupOperator(ownerUser()); ok {
			return operatorPublic{
				ID:        row.ID,
				Username:  row.Username,
				Email:     row.Email,
				Role:      "owner",
				CreatedAt: row.CreatedAt,
				LastLogin: row.LastLogin,
				LastIP:    row.LastIP,
			}
		}
	}
	return operatorPublic{ID: "owner", Username: ownerUser(), Email: ownerEmail(), Role: "owner"}
}

func ensureOwnerRow(ip string) {
	if db == nil {
		return
	}
	ensureAuthTables()
	now := time.Now()
	u := ownerUser()
	if row, ok := lookupOperator(u); ok {
		_, _ = db.Exec(`UPDATE operators SET last_login = ?, last_ip = ?, email = COALESCE(NULLIF(email,''), ?) WHERE username = ?`,
			now, ip, ownerEmail(), u)
		_ = row
		return
	}
	_, _ = db.Exec(`INSERT INTO operators (id, username, password, email, created_at, last_login, last_ip)
		VALUES (?, ?, ?, ?, ?, ?, ?)`,
		"owner", u, "owner-env", ownerEmail(), now, now, ip)
}

func touchLogin(username, ip string) {
	if db == nil {
		return
	}
	now := time.Now()
	_, _ = db.Exec(`UPDATE operators SET last_login = ?, last_ip = ? WHERE username = ?`, now, ip, username)
	if isOwnerName(username) {
		go persistSeats()
	}
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
	ip := clientIP(c)
	u := strings.TrimSpace(req.Username)
	p := req.Password
	role := "operator"
	ok := false
	if isOwnerName(u) {
		want := []byte(ownerPass())
		got := []byte(p)
		if len(want) >= 8 && len(got) == len(want) && subtle.ConstantTimeCompare(got, want) == 1 {
			ok = true
			role = "owner"
			u = ownerUser()
			ensureOwnerRow(ip)
			touchLogin(u, ip)
		}
	}
	if !ok {
		if row, found := lookupOperator(u); found && checkPassword(row.Password, p) {
			ok = true
			u = row.Username
			touchLogin(u, ip)
			if needsRehash(row.Password) {
				if h, err := hashPassword(p); err == nil {
					_, _ = db.Exec(`UPDATE operators SET password = ? WHERE username = ?`, h, u)
					go persistSeats()
				}
			}
		}
	}
	if !ok {
		recordAuthFail(ip)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
		return
	}
	recordAuthOK(ip)
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
		License  string `json:"license"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	u := strings.TrimSpace(req.Username)
	if len(u) < 3 || len(u) > 32 || len(req.Password) < 8 || len(req.Password) > 128 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username 3-32, password 8-128"})
		return
	}
	for _, r := range u {
		ok := (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '.' || r == '-'
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"error": "username alphanumeric"})
			return
		}
	}
	if strings.EqualFold(u, "admin") || isOwnerName(u) {
		c.JSON(http.StatusConflict, gin.H{"error": "username taken"})
		return
	}
	ensureAuthTables()
	ensureLicenseTable()
	if db == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no database"})
		return
	}
	if strings.TrimSpace(req.License) == "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "license key required"})
		return
	}
	k := normalizeLicense(req.License)
	var lic licenseRow
	if err := db.Get(&lic, `SELECT id, key_hash, key_plain, invoice_id, username, created_at, bound_at FROM licenses WHERE key_hash = ?`, hashPass(k)); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "invalid license key"})
		return
	}
	if lic.Username != nil && *lic.Username != "" {
		c.JSON(http.StatusForbidden, gin.H{"error": "license already used"})
		return
	}
	pw, err := hashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "hash failed"})
		return
	}
	id := uuid.New().String()
	now := time.Now()
	ip := clientIP(c)
	_, err = db.Exec(`INSERT INTO operators (id, username, password, email, created_at, last_login, last_ip) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		id, u, pw, strings.TrimSpace(req.Email), now, now, ip)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username taken"})
		return
	}
	if err := consumeLicense(req.License, u); err != nil {
		_, _ = db.Exec(`DELETE FROM operators WHERE id = ?`, id)
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
		return
	}
	go persistSeats()
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
	seen := map[string]bool{}
	out := []operatorPublic{}
	own := ownerPublicRow()
	out = append(out, own)
	seen[strings.ToLower(own.Username)] = true
	if db != nil {
		var rows []operatorRow
		if err := db.Select(&rows, `SELECT id, username, COALESCE(email,'') as email, created_at, last_login, COALESCE(last_ip,'') as last_ip FROM operators ORDER BY created_at DESC`); err == nil {
			for _, r := range rows {
				if seen[strings.ToLower(r.Username)] {
					continue
				}
				role := "operator"
				if isOwnerName(r.Username) {
					role = "owner"
				}
				out = append(out, operatorPublic{
					ID:        r.ID,
					Username:  r.Username,
					Email:     r.Email,
					Role:      role,
					CreatedAt: r.CreatedAt,
					LastLogin: r.LastLogin,
					LastIP:    r.LastIP,
				})
				seen[strings.ToLower(r.Username)] = true
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
		c.JSON(http.StatusOK, ownerPublicRow())
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
