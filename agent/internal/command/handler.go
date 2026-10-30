// Package command handles incoming commands with whitelist validation,
// TTL expiry check, and replay protection for the SIMLab agent.
package command

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
)

// AllowedActions defines the whitelist of permitted actions.
var AllowedActions = map[string]bool{
	"shutdown":   true,
	"reboot":     true,
	"logoff":     true,
	"lock":       true,
	"message":    true,
	"run_script": true,
}

// Command represents an incoming command from the server.
type Command struct {
	CommandID  string            `json:"command_id"`
	Action     string            `json:"action"`
	Params     map[string]string `json:"params,omitempty"`
	IssuedAt   int64             `json:"issued_at"`
	TTLSeconds int               `json:"ttl_seconds"`
}

// AckPayload represents the acknowledgment sent back to the server.
type AckPayload struct {
	CommandID string `json:"command_id"`
	Status    string `json:"status"` // delivered, executed, failed, rejected_expired, rejected_duplicate, rejected_unknown
	Message   string `json:"message,omitempty"`
	Output    string `json:"output,omitempty"`
	Timestamp int64  `json:"timestamp"`
}

// Executor defines the interface for executing system commands.
type Executor interface {
	Shutdown(delaySec int, message string) error
	Reboot(delaySec int, message string) error
	Logoff() error
	Lock() error
	SendMessage(title, message string) error
	RunScript(script, shell string) (string, error)
}

// Handler processes incoming commands with validation and deduplication.
type Handler struct {
	executor     Executor
	seenCommands map[string]time.Time
	mu           sync.Mutex
	publishAck   func(ack AckPayload)
}

// NewHandler creates a new command handler.
func NewHandler(executor Executor, publishAck func(ack AckPayload)) *Handler {
	h := &Handler{
		executor:     executor,
		seenCommands: make(map[string]time.Time),
		publishAck:   publishAck,
	}

	// Start cleanup goroutine to remove old command IDs
	go h.cleanupLoop()

	return h
}

// Handle processes a raw command message payload from MQTT.
func (h *Handler) Handle(payload []byte) {
	var cmd Command
	if err := json.Unmarshal(payload, &cmd); err != nil {
		log.Printf("[Command] Failed to parse command: %v", err)
		return
	}

	ack := h.ExecuteDirect(cmd)
	if h.publishAck != nil {
		h.publishAck(ack)
	}
}

// ExecuteDirect validates and executes a command, returning the AckPayload.
func (h *Handler) ExecuteDirect(cmd Command) AckPayload {
	log.Printf("[Command] Received: action=%s command_id=%s", cmd.Action, cmd.CommandID)

	// Validate action is in whitelist
	if !AllowedActions[cmd.Action] {
		log.Printf("[Command] Rejected unknown action: %s", cmd.Action)
		return AckPayload{
			CommandID: cmd.CommandID,
			Status:    "rejected_unknown",
			Message:   fmt.Sprintf("unknown action: %s", cmd.Action),
			Timestamp: time.Now().Unix(),
		}
	}

	// Check TTL expiry (with ±30 second clock drift tolerance)
	now := time.Now().Unix()
	expiresAt := cmd.IssuedAt + int64(cmd.TTLSeconds)
	if cmd.TTLSeconds > 0 && now > expiresAt+30 {
		log.Printf("[Command] Rejected expired command: command_id=%s issued_at=%d ttl=%d now=%d",
			cmd.CommandID, cmd.IssuedAt, cmd.TTLSeconds, now)
		return AckPayload{
			CommandID: cmd.CommandID,
			Status:    "rejected_expired",
			Message:   "command expired",
			Timestamp: time.Now().Unix(),
		}
	}

	// Check replay protection
	h.mu.Lock()
	if _, seen := h.seenCommands[cmd.CommandID]; seen {
		h.mu.Unlock()
		log.Printf("[Command] Rejected duplicate command: command_id=%s", cmd.CommandID)
		return AckPayload{
			CommandID: cmd.CommandID,
			Status:    "rejected_duplicate",
			Message:   "duplicate command_id",
			Timestamp: time.Now().Unix(),
		}
	}
	h.seenCommands[cmd.CommandID] = time.Now()
	h.mu.Unlock()

	// Execute the command
	output, err := h.execute(cmd)
	if err != nil {
		log.Printf("[Command] Execution failed: action=%s error=%v", cmd.Action, err)
		return AckPayload{
			CommandID: cmd.CommandID,
			Status:    "failed",
			Message:   err.Error(),
			Output:    output,
			Timestamp: time.Now().Unix(),
		}
	}

	log.Printf("[Command] Executed successfully: action=%s command_id=%s", cmd.Action, cmd.CommandID)
	return AckPayload{
		CommandID: cmd.CommandID,
		Status:    "executed",
		Output:    output,
		Timestamp: time.Now().Unix(),
	}
}

// execute runs the command action via the system executor.
func (h *Handler) execute(cmd Command) (string, error) {
	delaySec := 30 // default delay for shutdown/reboot
	if d, ok := cmd.Params["delay"]; ok {
		fmt.Sscanf(d, "%d", &delaySec)
	}
	message := cmd.Params["message"]
	if message == "" {
		message = "Perintah dari SIMLab admin"
	}

	switch cmd.Action {
	case "shutdown":
		return "", h.executor.Shutdown(delaySec, message)
	case "reboot":
		return "", h.executor.Reboot(delaySec, message)
	case "logoff":
		return "", h.executor.Logoff()
	case "lock":
		return "", h.executor.Lock()
	case "message":
		title := cmd.Params["title"]
		if title == "" {
			title = "SIMLab"
		}
		return "", h.executor.SendMessage(title, message)
	case "run_script":
		script := cmd.Params["script"]
		shell := cmd.Params["shell"]
		if shell == "" {
			shell = "powershell"
		}
		return h.executor.RunScript(script, shell)
	default:
		return "", fmt.Errorf("unsupported action: %s", cmd.Action)
	}
}

// cleanupLoop removes expired command IDs from the seen set every minute.
func (h *Handler) cleanupLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		h.mu.Lock()
		cutoff := time.Now().Add(-10 * time.Minute)
		for id, seen := range h.seenCommands {
			if seen.Before(cutoff) {
				delete(h.seenCommands, id)
			}
		}
		h.mu.Unlock()
	}
}
