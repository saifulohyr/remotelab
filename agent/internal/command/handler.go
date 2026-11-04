// Package command handles incoming commands with whitelist validation,
// TTL expiry check, and replay protection for the SIMLab agent.
package command

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/simlab/agent/internal/wol"
)

// AllowedActions defines the whitelist of permitted actions.
var AllowedActions = map[string]bool{
	"shutdown":   true,
	"reboot":     true,
	"logoff":     true,
	"lock":       true,
	"message":    true,
	"run_script": true,
	"wake":       true,
}

// Command represents an incoming command from the server.
type Command struct {
	CommandID  string                 `json:"command_id"`
	Action     string                 `json:"action"`
	Params     map[string]interface{} `json:"params,omitempty"`
	IssuedAt   int64                  `json:"issued_at"`
	TTLSeconds int                    `json:"ttl_seconds"`
}

// UnmarshalJSON accepts both Unix integer and RFC3339 issued_at values.
func (c *Command) UnmarshalJSON(data []byte) error {
	var raw struct {
		CommandID  string                 `json:"command_id"`
		Action     string                 `json:"action"`
		Params     map[string]interface{} `json:"params,omitempty"`
		IssuedAt   json.RawMessage        `json:"issued_at"`
		TTLSeconds int                    `json:"ttl_seconds"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}

	issuedAt, err := parseIssuedAt(raw.IssuedAt)
	if err != nil {
		return err
	}
	*c = Command{
		CommandID:  raw.CommandID,
		Action:     raw.Action,
		Params:     raw.Params,
		IssuedAt:   issuedAt,
		TTLSeconds: raw.TTLSeconds,
	}
	return nil
}

func parseIssuedAt(raw json.RawMessage) (int64, error) {
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 || bytes.Equal(raw, []byte("null")) {
		return 0, nil
	}
	if raw[0] != '"' {
		issuedAt, err := strconv.ParseInt(string(raw), 10, 64)
		if err != nil {
			return 0, fmt.Errorf("issued_at must be a Unix integer or RFC3339 timestamp")
		}
		return issuedAt, nil
	}

	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return 0, fmt.Errorf("invalid issued_at: %w", err)
	}
	if issuedAt, err := strconv.ParseInt(value, 10, 64); err == nil {
		return issuedAt, nil
	}
	issuedAt, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return 0, fmt.Errorf("issued_at must be a Unix integer or RFC3339 timestamp")
	}
	return issuedAt.Unix(), nil
}

// AckPayload represents the acknowledgment sent back to the server.
type AckPayload struct {
	CommandID string `json:"command_id"`
	Status    string `json:"status"` // delivered, executed, failed, rejected_expired, rejected_invalid, rejected_unknown
	Message   string `json:"message,omitempty"`
	Output    string `json:"output,omitempty"`
	ExitCode  int    `json:"exit_code"`
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

type commandRecord struct {
	seenAt time.Time
	ready  chan struct{}
	ack    AckPayload
}

// Handler processes incoming commands with validation and deduplication.
type Handler struct {
	executor     Executor
	seenCommands map[string]*commandRecord
	mu           sync.Mutex
	publishAck   func(ack AckPayload)
	now          func() time.Time
}

// NewHandler creates a new command handler.
func NewHandler(executor Executor, publishAck func(ack AckPayload)) *Handler {
	h := &Handler{
		executor:     executor,
		seenCommands: make(map[string]*commandRecord),
		publishAck:   publishAck,
		now:          time.Now,
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

	if strings.TrimSpace(cmd.CommandID) == "" {
		return h.invalidAck(cmd.CommandID, "command_id is required")
	}
	if cmd.IssuedAt <= 0 {
		return h.invalidAck(cmd.CommandID, "issued_at must be greater than zero")
	}
	if cmd.TTLSeconds <= 0 {
		return h.invalidAck(cmd.CommandID, "ttl_seconds must be greater than zero")
	}
	if cmd.IssuedAt > h.now().Add(30*time.Second).Unix() {
		return h.invalidAck(cmd.CommandID, "issued_at is too far in the future")
	}
	if !AllowedActions[cmd.Action] {
		log.Printf("[Command] Rejected unknown action: %s", cmd.Action)
		return AckPayload{
			CommandID: cmd.CommandID,
			Status:    "rejected_unknown",
			Message:   fmt.Sprintf("unknown action: %s", cmd.Action),
			Timestamp: h.now().Unix(),
		}
	}

	// Claim the command ID before execution. Concurrent duplicates wait for and
	// replay the original result instead of executing or changing its status.
	h.mu.Lock()
	if record, seen := h.seenCommands[cmd.CommandID]; seen {
		h.mu.Unlock()
		<-record.ready
		log.Printf("[Command] Replaying acknowledgment: command_id=%s status=%s", cmd.CommandID, record.ack.Status)
		return record.ack
	}
	record := &commandRecord{seenAt: h.now(), ready: make(chan struct{})}
	h.seenCommands[cmd.CommandID] = record
	h.mu.Unlock()

	ack := h.executeValidated(cmd)
	record.ack = ack
	close(record.ready)
	return ack
}

func (h *Handler) invalidAck(commandID, message string) AckPayload {
	log.Printf("[Command] Rejected invalid command: command_id=%s reason=%s", commandID, message)
	return AckPayload{
		CommandID: commandID,
		Status:    "rejected_unknown",
		Message:   message,
		Timestamp: h.now().Unix(),
	}
}

func (h *Handler) executeValidated(cmd Command) AckPayload {
	// Check TTL expiry (with ±30 second clock drift tolerance).
	now := h.now().Unix()
	expiresAt := cmd.IssuedAt + int64(cmd.TTLSeconds)
	if cmd.TTLSeconds > 0 && now > expiresAt+30 {
		log.Printf("[Command] Rejected expired command: command_id=%s issued_at=%d ttl=%d now=%d",
			cmd.CommandID, cmd.IssuedAt, cmd.TTLSeconds, now)
		return AckPayload{
			CommandID: cmd.CommandID,
			Status:    "rejected_expired",
			Message:   "command expired",
			Timestamp: h.now().Unix(),
		}
	}

	output, err := h.execute(cmd)
	if err != nil {
		log.Printf("[Command] Execution failed: action=%s error=%v", cmd.Action, err)
		return AckPayload{
			CommandID: cmd.CommandID,
			Status:    "failed",
			Message:   err.Error(),
			Output:    output,
			ExitCode:  1,
			Timestamp: h.now().Unix(),
		}
	}

	log.Printf("[Command] Executed successfully: action=%s command_id=%s", cmd.Action, cmd.CommandID)
	return AckPayload{
		CommandID: cmd.CommandID,
		Status:    "executed",
		Output:    output,
		Timestamp: h.now().Unix(),
	}
}

// execute runs the command action via the system executor.
func (h *Handler) execute(cmd Command) (string, error) {
	delaySec := getParamInt(cmd.Params, "delay", 0)
	message := getParamString(cmd.Params, "message", "Perintah dari SIMLab admin")

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
		title := getParamString(cmd.Params, "title", "SIMLab")
		return "", h.executor.SendMessage(title, message)
	case "run_script":
		script := getParamString(cmd.Params, "script", "")
		shell := getParamString(cmd.Params, "shell", "powershell")
		if script == "" {
			return "", fmt.Errorf("script kosong")
		}
		return h.executor.RunScript(script, shell)
	case "wake":
		// WoL Relay: PC Guru menerima perintah ini dan memancarkan
		// Magic Packet ke MAC address target di jaringan LAN lokal.
		mac := getParamString(cmd.Params, "mac", "")
		if mac == "" {
			return "", fmt.Errorf("parameter 'mac' diperlukan untuk aksi wake")
		}
		// Kirim ke beberapa MAC jika dipisahkan koma
		macs := []string{}
		for _, m := range strings.Split(mac, ",") {
			m = strings.TrimSpace(m)
			if m != "" {
				macs = append(macs, m)
			}
		}
		return wol.SendMagicPackets(macs)
	default:
		return "", fmt.Errorf("unsupported action: %s", cmd.Action)
	}
}

func getParamString(params map[string]interface{}, key, defaultVal string) string {
	if params == nil {
		return defaultVal
	}
	val, ok := params[key]
	if !ok || val == nil {
		return defaultVal
	}
	switch v := val.(type) {
	case string:
		if v == "" {
			return defaultVal
		}
		return v
	default:
		return fmt.Sprintf("%v", v)
	}
}

func getParamInt(params map[string]interface{}, key string, defaultVal int) int {
	if params == nil {
		return defaultVal
	}
	val, ok := params[key]
	if !ok || val == nil {
		return defaultVal
	}
	switch v := val.(type) {
	case int:
		return v
	case int64:
		return int(v)
	case float64:
		return int(v)
	case string:
		var n int
		if _, err := fmt.Sscanf(v, "%d", &n); err == nil {
			return n
		}
	}
	return defaultVal
}

// cleanupLoop removes expired command IDs from the seen set every minute.
func (h *Handler) cleanupLoop() {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		h.mu.Lock()
		cutoff := h.now().Add(-2 * time.Hour)
		for id, record := range h.seenCommands {
			if record.seenAt.Before(cutoff) {
				delete(h.seenCommands, id)
			}
		}
		h.mu.Unlock()
	}
}
