package api

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"os"
	"strings"
	"sync"
	"time"
)

const tokenTTL = 7 * 24 * time.Hour

var (
	tokenMu   sync.Mutex
	tokens    = map[string]string{} // leftover uuid sessions + revoked HMAC
	tokenKey  []byte
	tokenOnce sync.Once
)

func sessionSecret() []byte {
	tokenOnce.Do(func() {
		s := strings.TrimSpace(os.Getenv("RATC2_SECURITY_JWT_SECRET"))
		if s == "" || s == "change-me-in-production" {
			s = strings.TrimSpace(os.Getenv("UMBRA_ISSUE_SECRET"))
		}
		if s == "" {
			b := make([]byte, 32)
			_, _ = rand.Read(b)
			tokenKey = b
			return
		}
		sum := sha256.Sum256([]byte(s))
		tokenKey = sum[:]
	})
	return tokenKey
}

func b64u(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}

func issueToken(username string) string {
	u := strings.TrimSpace(username)
	if u == "" {
		return ""
	}
	exp := time.Now().Add(tokenTTL).Unix()
	expb := make([]byte, 8)
	binary.BigEndian.PutUint64(expb, uint64(exp))
	nonce := make([]byte, 8)
	_, _ = rand.Read(nonce)
	payload := append(append(append([]byte{}, expb...), nonce...), []byte(u)...)
	mac := hmac.New(sha256.New, sessionSecret())
	mac.Write(payload)
	sig := mac.Sum(nil)
	tok := "u1." + b64u(payload) + "." + b64u(sig)
	tokenMu.Lock()
	tokens[tok] = u
	tokenMu.Unlock()
	return tok
}

func lookupToken(tok string) (string, bool) {
	tok = strings.TrimSpace(tok)
	if tok == "" {
		return "", false
	}
	tokenMu.Lock()
	if _, revoked := tokens["revoked:"+tok]; revoked {
		tokenMu.Unlock()
		return "", false
	}
	if u, ok := tokens[tok]; ok {
		tokenMu.Unlock()
		return u, true
	}
	tokenMu.Unlock()

	if strings.HasPrefix(tok, "u1.") {
		parts := strings.Split(tok, ".")
		if len(parts) != 3 {
			return "", false
		}
		payload, err := base64.RawURLEncoding.DecodeString(parts[1])
		if err != nil || len(payload) < 17 {
			return "", false
		}
		sig, err := base64.RawURLEncoding.DecodeString(parts[2])
		if err != nil {
			return "", false
		}
		mac := hmac.New(sha256.New, sessionSecret())
		mac.Write(payload)
		if !hmac.Equal(mac.Sum(nil), sig) {
			return "", false
		}
		exp := int64(binary.BigEndian.Uint64(payload[:8]))
		if time.Now().Unix() > exp {
			return "", false
		}
		u := string(payload[16:])
		if strings.TrimSpace(u) == "" {
			return "", false
		}
		tokenMu.Lock()
		tokens[tok] = u
		tokenMu.Unlock()
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

func revokeToken(tok string) {
	tok = strings.TrimSpace(tok)
	if tok == "" {
		return
	}
	tokenMu.Lock()
	delete(tokens, tok)
	tokens["revoked:"+tok] = "1"
	tokenMu.Unlock()
	if db != nil {
		_, _ = db.Exec(`DELETE FROM sessions WHERE token = ?`, tok)
	}
}
