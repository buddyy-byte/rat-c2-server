package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// settingsHandler backs the console Settings page: profile email and password
// changes persist to the operators table. Owner password lives in env, so
// changing it from the web UI is refused with a pointer instead of silently
// no-op'ing like the old client-side stub did.
func settingsHandler(c *gin.Context) {
	u := bearerUser(c)
	if u == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not logged in"})
		return
	}
	ensureAuthTables()
	if db == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "no database"})
		return
	}
	row, found := lookupOperator(u)
	if !found && isOwnerName(u) {
		ensureOwnerRow(clientIP(c))
		row, found = lookupOperator(u)
	}
	if !found {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "account not found"})
		return
	}

	var req struct {
		Email           *string `json:"email"`
		CurrentPassword *string `json:"current_password"`
		NewPassword     *string `json:"new_password"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	touched := false

	if req.Email != nil {
		email := strings.TrimSpace(*req.Email)
		if len(email) > 128 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "email too long"})
			return
		}
		if email != "" && !strings.Contains(email, "@") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid email"})
			return
		}
		if _, err := db.Exec(`UPDATE operators SET email = ? WHERE username = ?`, email, row.Username); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "profile update failed"})
			return
		}
		touched = true
	}

	if np := req.NewPassword; np != nil && strings.TrimSpace(*np) != "" {
		if isOwnerName(row.Username) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "owner password is set via RATC2_OWNER_PASSWORD env — rotate it on the server"})
			return
		}
		if len(*np) < 8 || len(*np) > 128 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "new password must be 8-128 chars"})
			return
		}
		// current password required (and must verify) whenever a hash exists
		cur := ""
		if req.CurrentPassword != nil {
			cur = *req.CurrentPassword
		}
		if strings.HasPrefix(row.Password, "$argon2id$") || len(row.Password) == 64 {
			if cur == "" || !checkPassword(row.Password, cur) {
				recordAuthFail(clientIP(c))
				c.JSON(http.StatusUnauthorized, gin.H{"error": "current password incorrect"})
				return
			}
		}
		hashed, err := hashPassword(*np)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "hash failed"})
			return
		}
		if _, err := db.Exec(`UPDATE operators SET password = ? WHERE username = ?`, hashed, row.Username); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "password update failed"})
			return
		}
		go persistSeats()
		touched = true
	}

	if !touched {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nothing to update"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
