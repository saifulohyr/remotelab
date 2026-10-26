// Package ingest handles batch insertion of telemetry data and PC status updates into MySQL.
package ingest

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"
)

// TelemetryMessage represents incoming telemetry from an agent.
type TelemetryMessage struct {
	PCID         int     `json:"-"`
	CPUPercent   float64 `json:"cpu_percent"`
	RAMPercent   float64 `json:"ram_percent"`
	DiskPercent  float64 `json:"disk_percent"`
	UptimeSeconds uint64 `json:"uptime_seconds"`
	Hostname     string  `json:"hostname"`
	IPAddress    string  `json:"ip_address"`
	AgentVersion string  `json:"agent_version"`
	Timestamp    int64   `json:"timestamp"`
}

// StatusMessage represents a status update from an agent.
type StatusMessage struct {
	Status    string `json:"status"`
	Reason    string `json:"reason"`
	Timestamp int64  `json:"timestamp"`
	Hostname  string `json:"hostname"`
	IP        string `json:"ip"`
	Version   string `json:"version"`
}

// AckMessage represents a command acknowledgment from an agent.
type AckMessage struct {
	CommandID string `json:"command_id"`
	Status    string `json:"status"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
}

// BatchIngestor collects telemetry messages and flushes them in batch to MySQL.
type BatchIngestor struct {
	db            *sql.DB
	buffer        []TelemetryMessage
	mu            sync.Mutex
	batchSize     int
	flushInterval time.Duration
	stopChan      chan struct{}
}

// NewBatchIngestor creates a new batch ingestor.
func NewBatchIngestor(db *sql.DB, batchSize int, flushIntervalMs int) *BatchIngestor {
	bi := &BatchIngestor{
		db:            db,
		buffer:        make([]TelemetryMessage, 0, batchSize),
		batchSize:     batchSize,
		flushInterval: time.Duration(flushIntervalMs) * time.Millisecond,
		stopChan:      make(chan struct{}),
	}

	go bi.flushLoop()
	return bi
}

// Add adds a telemetry message to the buffer. Flushes automatically when batch size is reached.
func (bi *BatchIngestor) Add(msg TelemetryMessage) {
	bi.mu.Lock()
	bi.buffer = append(bi.buffer, msg)
	shouldFlush := len(bi.buffer) >= bi.batchSize
	bi.mu.Unlock()

	if shouldFlush {
		bi.Flush()
	}
}

// Flush writes all buffered telemetry to the database.
func (bi *BatchIngestor) Flush() {
	bi.mu.Lock()
	if len(bi.buffer) == 0 {
		bi.mu.Unlock()
		return
	}
	batch := bi.buffer
	bi.buffer = make([]TelemetryMessage, 0, bi.batchSize)
	bi.mu.Unlock()

	if err := bi.insertBatch(batch); err != nil {
		log.Printf("[Ingest] Failed to insert batch of %d records: %v", len(batch), err)
	}
}

// insertBatch performs a multi-row INSERT for efficiency.
func (bi *BatchIngestor) insertBatch(batch []TelemetryMessage) error {
	if len(batch) == 0 {
		return nil
	}

	query := "INSERT INTO metrics (pc_id, cpu_percent, ram_percent, disk_percent, uptime_seconds, recorded_at) VALUES "
	valueStrings := make([]string, 0, len(batch))
	valueArgs := make([]interface{}, 0, len(batch)*6)

	for _, msg := range batch {
		valueStrings = append(valueStrings, "(?, ?, ?, ?, ?, FROM_UNIXTIME(?))")
		valueArgs = append(valueArgs, msg.PCID, msg.CPUPercent, msg.RAMPercent, msg.DiskPercent, msg.UptimeSeconds, msg.Timestamp)
	}

	query += strings.Join(valueStrings, ", ")
	_, err := bi.db.Exec(query, valueArgs...)
	if err != nil {
		return fmt.Errorf("batch insert failed: %w", err)
	}

	log.Printf("[Ingest] Inserted %d metric records", len(batch))
	return nil
}

// flushLoop periodically flushes the buffer.
func (bi *BatchIngestor) flushLoop() {
	ticker := time.NewTicker(bi.flushInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			bi.Flush()
		case <-bi.stopChan:
			bi.Flush() // Final flush
			return
		}
	}
}

// Stop stops the batch ingestor and flushes remaining data.
func (bi *BatchIngestor) Stop() {
	close(bi.stopChan)
}

// StatusUpdater handles PC status updates in the database.
type StatusUpdater struct {
	db *sql.DB
}

// NewStatusUpdater creates a new status updater.
func NewStatusUpdater(db *sql.DB) *StatusUpdater {
	return &StatusUpdater{db: db}
}

// UpdatePCStatus updates the PC status and related fields in the database.
func (su *StatusUpdater) UpdatePCStatus(pcID int, status StatusMessage) error {
	query := `UPDATE pcs SET status = ?, last_seen_at = FROM_UNIXTIME(?), ip_address = ?, 
	          agent_version = ?, updated_at = NOW() WHERE id = ?`
	_, err := su.db.Exec(query, status.Status, status.Timestamp, status.IP, status.Version, pcID)
	if err != nil {
		return fmt.Errorf("failed to update PC status: %w", err)
	}

	// Record power event if status indicates a state change
	eventType := ""
	switch status.Status {
	case "online":
		eventType = "boot"
	case "offline_normal":
		eventType = "shutdown_normal"
	case "offline_lwt":
		eventType = "shutdown_abnormal"
	}

	if eventType != "" {
		_, err = su.db.Exec(
			`INSERT INTO power_events (pc_id, event_type, source, created_at) VALUES (?, ?, 'agent', NOW())`,
			pcID, eventType,
		)
		if err != nil {
			log.Printf("[Ingest] Failed to record power event: %v", err)
		}
	}

	return nil
}

// UpdatePCTelemetry updates the PC's last_seen timestamp and live metrics.
func (su *StatusUpdater) UpdatePCTelemetry(pcID int, msg TelemetryMessage) error {
	query := `UPDATE pcs SET last_seen_at = FROM_UNIXTIME(?), ip_address = ?, 
	          agent_version = ?, status = 'online', updated_at = NOW() WHERE id = ?`
	_, err := su.db.Exec(query, msg.Timestamp, msg.IPAddress, msg.AgentVersion, pcID)
	return err
}

// ProcessAck processes a command acknowledgment and updates command_results.
func (su *StatusUpdater) ProcessAck(pcID int, ack AckMessage) error {
	// Find the command_log by command_id
	var commandLogID int
	err := su.db.QueryRow("SELECT id FROM command_logs WHERE command_id = ?", ack.CommandID).Scan(&commandLogID)
	if err != nil {
		return fmt.Errorf("command_log not found for command_id %s: %w", ack.CommandID, err)
	}

	// Upsert command_result
	query := `INSERT INTO command_results (command_log_id, pc_id, status, error_message, delivered_at, executed_at)
	          VALUES (?, ?, ?, ?, ?, ?)
	          ON DUPLICATE KEY UPDATE status = VALUES(status), error_message = VALUES(error_message),
	          delivered_at = COALESCE(delivered_at, VALUES(delivered_at)),
	          executed_at = VALUES(executed_at)`

	var deliveredAt, executedAt *time.Time
	now := time.Now()
	switch ack.Status {
	case "delivered":
		deliveredAt = &now
	case "executed", "failed", "rejected_expired", "rejected_duplicate", "rejected_unknown":
		executedAt = &now
	}

	_, err = su.db.Exec(query, commandLogID, pcID, ack.Status, ack.Message, deliveredAt, executedAt)
	if err != nil {
		return fmt.Errorf("failed to upsert command_result: %w", err)
	}

	return nil
}

// ParseTelemetry parses a JSON telemetry payload.
func ParseTelemetry(payload []byte) (*TelemetryMessage, error) {
	var msg TelemetryMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		return nil, err
	}
	return &msg, nil
}

// ParseStatus parses a JSON status payload.
func ParseStatus(payload []byte) (*StatusMessage, error) {
	var msg StatusMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		return nil, err
	}
	return &msg, nil
}

// ParseAck parses a JSON ack payload.
func ParseAck(payload []byte) (*AckMessage, error) {
	var msg AckMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		return nil, err
	}
	return &msg, nil
}
