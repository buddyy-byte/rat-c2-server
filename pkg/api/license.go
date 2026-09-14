package api

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type licenseRow struct {
	ID        string  `db:"id"`
	KeyHash   string  `db:"key_hash"`
	KeyPlain  *string `db:"key_plain"`
	InvoiceID string  `db:"invoice_id"`
	Username  *string `db:"username"`
	CreatedAt string  `db:"created_at"`
	BoundAt   *string `db:"bound_at"`
}

func issueSecret() string {
	return strings.TrimSpace(os.Getenv("UMBRA_ISSUE_SECRET"))
}

func ensureLicenseTable() {
	if db == nil {
		return
	}
	_, _ = db.Exec(`
		CREATE TABLE IF NOT EXISTS licenses (
			id TEXT PRIMARY KEY,
			key_hash TEXT UNIQUE NOT NULL,
			key_plain TEXT,
			invoice_id TEXT UNIQUE,
			username TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			bound_at DATETIME
		)`)
	_, _ = db.Exec(`CREATE INDEX IF NOT EXISTS idx_licenses_hash ON licenses(key_hash)`)
}

func normalizeLicense(k string) string {
	k = strings.ToUpper(strings.TrimSpace(k))
	k = strings.ReplaceAll(k, " ", "")
	return k
}

func mintLicenseKey() (string, error) {
	b := make([]byte, 10)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	h := strings.ToUpper(hex.EncodeToString(b))
	return "UMBRA-" + h[0:4] + "-" + h[4:8] + "-" + h[8:12] + "-" + h[12:16] + "-" + h[16:20], nil
}

func requireIssueSecret(c *gin.Context) bool {
	want := issueSecret()
	got := strings.TrimSpace(c.GetHeader("X-Umbra-Issue"))
	if want == "" || got == "" || subtle.ConstantTimeCompare([]byte(want), []byte(got)) != 1 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "issue auth failed"})
		return false
	}
	return true
}

func invoiceRef(c *gin.Context) (string, bool) {
	var req struct {
		InvoiceID string `json:"invoice_id"`
		OrderID   string `json:"order_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return "", false
	}
	ref := strings.TrimSpace(req.InvoiceID)
	if ref == "" {
		ref = strings.TrimSpace(req.OrderID)
	}
	if ref == "" || len(ref) > 128 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invoice_id required"})
		return "", false
	}
	return ref, true
}

func lookupLicenseRow(ref string) (licenseRow, bool) {
	var row licenseRow
	err := db.Get(&row, `SELECT id, key_hash, key_plain, invoice_id, username, created_at, bound_at FROM licenses WHERE invoice_id = ?`, ref)
	return row, err == nil
}

func writeLicenseJSON(c *gin.Context, row licenseRow, ref string, reused bool) {
	if row.Username != nil && *row.Username != "" {
		c.JSON(http.StatusOK, gin.H{"bound": true, "username": *row.Username, "invoice_id": ref})
		return
	}
	key := ""
	if row.KeyPlain != nil {
		key = *row.KeyPlain
	}
	c.JSON(http.StatusOK, gin.H{"key": key, "bound": false, "invoice_id": ref, "reused": reused})
}

func issueLicenseHandler(c *gin.Context) {
	if !requireIssueSecret(c) {
		return
	}
	ref, ok := invoiceRef(c)
	if !ok {
		return
	}
	ensureAuthTables()
	ensureLicenseTable()
	if db == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no database"})
		return
	}
	row, found := lookupLicenseRow(ref)
	if !found {
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "payment not confirmed", "wait": true})
		return
	}
	writeLicenseJSON(c, row, ref, true)
}

func paidLicenseHandler(c *gin.Context) {
	if !requireIssueSecret(c) {
		return
	}
	ref, ok := invoiceRef(c)
	if !ok {
		return
	}
	ensureAuthTables()
	ensureLicenseTable()
	if db == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no database"})
		return
	}
	if !strings.HasPrefix(ref, "umbra-") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invoice_id required"})
		return
	}
	if row, found := lookupLicenseRow(ref); found {
		writeLicenseJSON(c, row, ref, true)
		return
	}
	plain, err := mintLicenseKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "key mint failed"})
		return
	}
	id := uuid.New().String()
	now := time.Now()
	_, err = db.Exec(`INSERT INTO licenses (id, key_hash, key_plain, invoice_id, created_at) VALUES (?, ?, ?, ?, ?)`,
		id, hashPass(plain), plain, ref, now)
	if err != nil {
		if row, found := lookupLicenseRow(ref); found {
			writeLicenseJSON(c, row, ref, true)
			return
		}
		c.JSON(http.StatusConflict, gin.H{"error": "license exists"})
		return
	}
	go persistSeats()
	c.JSON(http.StatusOK, gin.H{"key": plain, "bound": false, "invoice_id": ref, "reused": false})
}

func consumeLicense(plain, username string) error {
	ensureLicenseTable()
	k := normalizeLicense(plain)
	if k == "" {
		return errLicense("license key required")
	}
	var row licenseRow
	err := db.Get(&row, `SELECT id, key_hash, key_plain, invoice_id, username, created_at, bound_at FROM licenses WHERE key_hash = ?`, hashPass(k))
	if err != nil {
		return errLicense("invalid license key")
	}
	if row.Username != nil && *row.Username != "" {
		return errLicense("license already used")
	}
	now := time.Now()
	res, err := db.Exec(`UPDATE licenses SET username = ?, bound_at = ?, key_plain = NULL WHERE id = ? AND (username IS NULL OR username = '')`,
		username, now, row.ID)
	if err != nil {
		return errLicense("license bind failed")
	}
	n, _ := res.RowsAffected()
	if n != 1 {
		return errLicense("license already used")
	}
	go persistSeats()
	return nil
}

func licenseUsername(plain string) (string, bool) {
	ensureLicenseTable()
	k := normalizeLicense(plain)
	if k == "" || db == nil {
		return "", false
	}
	var row licenseRow
	err := db.Get(&row, `SELECT id, key_hash, key_plain, invoice_id, username, created_at, bound_at FROM licenses WHERE key_hash = ?`, hashPass(k))
	if err != nil || row.Username == nil || *row.Username == "" {
		return "", false
	}
	return *row.Username, true
}

type licenseError struct{ msg string }

func (e licenseError) Error() string { return e.msg }
func errLicense(m string) error      { return licenseError{m} }

func recoverHandler(c *gin.Context) {
	var req struct {
		License  string `json:"license" binding:"required"`
		Password string `json:"password" binding:"required"`
		Username string `json:"username"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if len(req.Password) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password >= 8"})
		return
	}
	ensureAuthTables()
	ensureLicenseTable()
	ip := clientIP(c)
	bound, ok := licenseUsername(req.License)
	if !ok {
		recordAuthFail(ip)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid license or not registered"})
		return
	}
	want := strings.TrimSpace(req.Username)
	if want != "" && !strings.EqualFold(want, bound) {
		recordAuthFail(ip)
		c.JSON(http.StatusUnauthorized, gin.H{"error": "license does not match username"})
		return
	}
	pw, err := hashPassword(req.Password)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "hash failed"})
		return
	}
	_, err = db.Exec(`UPDATE operators SET password = ? WHERE username = ?`, pw, bound)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "reset failed"})
		return
	}
	go persistSeats()
	recordAuthOK(ip)
	c.JSON(http.StatusOK, gin.H{
		"token": issueToken(bound),
		"user":  gin.H{"username": bound, "role": "operator"},
	})
}
