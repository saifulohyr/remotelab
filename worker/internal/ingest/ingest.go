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

// unixToUTCWall converts a Unix timestamp to a UTC wall-clock string that is
// independent of the MySQL session time zone. Laravel stores UTC wall-clock
// values in TIMESTAMP columns, so writing FROM_UNIXTIME() directly would make
// MQTT metrics five hours off on a host running in EST.
const unixToUTCWall = "CONVERT_TZ(FROM_UNIXTIME(?), @@session.time_zone, '+00:00')"

// TelemetryMessage represents incoming telemetry from an agent.
type TelemetryMessage struct {
	PCID          int     `json:"-"`
	SampleID      string  `json:"sample_id"`
	CPUPercent    float64 `json:"cpu_percent"`
	RAMPercent    float64 `json:"ram_percent"`
	DiskPercent   float64 `json:"disk_percent"`
	UptimeSeconds uint64  `json:"uptime_seconds"`
	Hostname      string  `json:"hostname"`
	IPAddress     string  `json:"ip_address"`
	AgentVersion  string  `json:"agent_version"`
	Timestamp     int64   `json:"timestamp"`
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
	Output    string `json:"output"`
	ExitCode  int    `json:"exit_code"`
	Timestamp int64  `json:"timestamp"`
}

// RelayAckMessage represents a Wake-on-LAN acknowledgment from a relay.
type RelayAckMessage struct {
	CommandID    string           `json:"command_id"`
	Status       string           `json:"status"`
	Total        int              `json:"total"`
	SuccessCount int              `json:"success_count"`
	FailedCount  int              `json:"failed_count"`
	Results      []RelayAckResult `json:"results"`
	Output       string           `json:"output"`
	Timestamp    int64            `json:"timestamp"`
}

// RelayAckResult reports the packet-send result for one target MAC address.
type RelayAckResult struct {
	MAC    string `json:"mac"`
	Status string `json:"status"`
	Error  string `json:"error"`
}

// RelayStatusMessage represents a relay heartbeat message.
type RelayStatusMessage struct {
	Status    string `json:"status"`
	LabID     string `json:"lab_id"`
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

	query := "INSERT IGNORE INTO metrics (pc_id, sample_id, cpu_percent, ram_percent, disk_percent, uptime_seconds, recorded_at) VALUES "
	valueStrings := make([]string, 0, len(batch))
	valueArgs := make([]interface{}, 0, len(batch)*7)
	seen := make(map[string]struct{}, len(batch))
	inserted := 0

	for _, msg := range batch {
		var sampleID interface{}
		if msg.SampleID != "" {
			sampleID = msg.SampleID
			key := fmt.Sprintf("%d:%s", msg.PCID, msg.SampleID)
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
		}

		valueStrings = append(valueStrings, "(?, ?, ?, ?, ?, ?, "+unixToUTCWall+")")
		valueArgs = append(valueArgs, msg.PCID, sampleID, msg.CPUPercent, msg.RAMPercent, msg.DiskPercent, msg.UptimeSeconds, msg.Timestamp)
		inserted++
	}

	if inserted == 0 {
		return nil
	}

	query += strings.Join(valueStrings, ", ")
	_, err := bi.db.Exec(query, valueArgs...)
	if err != nil {
		return fmt.Errorf("batch insert failed: %w", err)
	}

	log.Printf("[Ingest] Inserted %d metric records", inserted)
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
	changed, err := su.db.Exec("UPDATE pcs SET status = ?, updated_at = UTC_TIMESTAMP() WHERE id = ? AND status <> ?", status.Status, pcID, status.Status)
	if err != nil {
		return fmt.Errorf("failed to compare PC status: %w", err)
	}
	changedRows, err := changed.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to inspect PC status change: %w", err)
	}

	query := `UPDATE pcs SET status = ?, last_seen_at = ` + unixToUTCWall + `, ip_address = ?,
	          agent_version = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`
	_, err = su.db.Exec(query, status.Status, status.Timestamp, status.IP, status.Version, pcID)
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

	if eventType != "" && changedRows > 0 {
		_, err = su.db.Exec(
			`INSERT INTO power_events (pc_id, event_type, source, created_at) VALUES (?, ?, 'agent', UTC_TIMESTAMP())`,
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
	query := `UPDATE pcs SET last_seen_at = ` + unixToUTCWall + `, ip_address = ?,
	          agent_version = ?, status = 'online', updated_at = UTC_TIMESTAMP()
	          WHERE id = ? AND (last_seen_at IS NULL OR last_seen_at <= ` + unixToUTCWall + `)`
	_, err := su.db.Exec(query, msg.Timestamp, msg.IPAddress, msg.AgentVersion, pcID, msg.Timestamp)
	return err
}

// ProcessAck processes a command acknowledgment and updates command_results.
func (su *StatusUpdater) ProcessAck(pcID int, ack AckMessage) error {
	// Resolve an existing target only; an ACK must never attach a new PC to a command.
	var commandLogID int
	err := su.db.QueryRow(`SELECT cl.id FROM command_logs cl
		JOIN command_results cr ON cr.command_log_id = cl.id
		WHERE cl.command_id = ? AND cr.pc_id = ?`, ack.CommandID, pcID).Scan(&commandLogID)
	if err != nil {
		return fmt.Errorf("command target not found for command_id %s and pc_id %d: %w", ack.CommandID, pcID, err)
	}

	// Upsert command_result. Late delivery and duplicate ACKs must not replace
	// a terminal execution result or its output.
	query := `UPDATE command_results SET
	          status = IF(status IN ('executed', 'failed', 'rejected_expired', 'rejected_duplicate', 'rejected_unknown', 'timeout') AND ? IN ('delivered', 'rejected_duplicate'), status, ?),
	          error_message = IF(status IN ('executed', 'failed', 'rejected_expired', 'rejected_duplicate', 'rejected_unknown', 'timeout') AND ? IN ('delivered', 'rejected_duplicate'), error_message, ?),
	          output = IF(status IN ('executed', 'failed', 'rejected_expired', 'rejected_duplicate', 'rejected_unknown', 'timeout') AND ? IN ('delivered', 'rejected_duplicate'), output, ?),
	          delivered_at = COALESCE(delivered_at, ?),
	          executed_at = COALESCE(executed_at, ?)
	          WHERE command_log_id = ? AND pc_id = ?`

	var deliveredAt, executedAt *time.Time
	now := time.Now()
	switch ack.Status {
	case "delivered":
		deliveredAt = &now
	case "executed", "failed", "rejected_expired", "rejected_duplicate", "rejected_unknown":
		executedAt = &now
	}

	_, err = su.db.Exec(query,
		ack.Status, ack.Status,
		ack.Status, ack.Message,
		ack.Status, ack.Output,
		deliveredAt, executedAt, commandLogID, pcID)
	if err != nil {
		return fmt.Errorf("failed to upsert command_result: %w", err)
	}

	return nil
}

// ProcessRelayAck updates only the command result matching each target's MAC.
func (su *StatusUpdater) ProcessRelayAck(labID string, ack RelayAckMessage) error {
	if err := validateRelayAck(ack); err != nil {
		return err
	}

	var commandLogID int
	if err := su.db.QueryRow("SELECT id FROM command_logs WHERE command_id = ?", ack.CommandID).Scan(&commandLogID); err != nil {
		return fmt.Errorf("command_log not found for command_id %s: %w", ack.CommandID, err)
	}

	for _, result := range ack.Results {
		var pcID int
		if err := su.db.QueryRow(`SELECT p.id FROM pcs p JOIN labs l ON p.lab_id = l.id
			WHERE l.slug = ? AND p.mac_address = ? AND EXISTS
			(SELECT 1 FROM command_results cr WHERE cr.command_log_id = ? AND cr.pc_id = p.id)`, labID, result.MAC, commandLogID).Scan(&pcID); err != nil {
			return fmt.Errorf("PC not found for MAC %s: %w", result.MAC, err)
		}

		now := time.Now()
		resultRow, err := su.db.Exec(`UPDATE command_results SET status = ?, error_message = ?, output = ?, executed_at = ?
			WHERE command_log_id = ? AND pc_id = ?`, result.Status, result.Error, ack.Output, now, commandLogID, pcID)
		if err != nil {
			return fmt.Errorf("failed to update relay command_result for MAC %s: %w", result.MAC, err)
		}
		affected, err := resultRow.RowsAffected()
		if err != nil {
			return fmt.Errorf("failed to inspect relay result update: %w", err)
		}
		if affected == 0 {
			continue // Identical relay ACK: already persisted, do not duplicate events.
		}
		eventType := "wake_success"
		if result.Status == "failed" {
			eventType = "wake_failed"
		}
		if _, err := su.db.Exec(`INSERT INTO power_events (pc_id, event_type, source, created_at)
			VALUES (?, ?, 'relay', ?)`, pcID, eventType, now); err != nil {
			return fmt.Errorf("failed to record relay power event: %w", err)
		}
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

// ParseRelayAck parses and validates a JSON relay ack payload.
func ParseRelayAck(payload []byte) (*RelayAckMessage, error) {
	var msg RelayAckMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		return nil, err
	}
	if err := validateRelayAck(msg); err != nil {
		return nil, err
	}
	return &msg, nil
}

func validateRelayAck(msg RelayAckMessage) error {
	if msg.CommandID == "" {
		return fmt.Errorf("relay ack command_id is required")
	}
	if msg.Results == nil {
		return fmt.Errorf("relay ack results are required")
	}
	for _, result := range msg.Results {
		if result.MAC == "" {
			return fmt.Errorf("relay ack result MAC is required")
		}
		if result.Status != "executed" && result.Status != "failed" {
			return fmt.Errorf("invalid relay result status %q for MAC %s", result.Status, result.MAC)
		}
	}
	return nil
}

// ParseRelayStatus parses a JSON relay status payload.
func ParseRelayStatus(payload []byte) (*RelayStatusMessage, error) {
	var msg RelayStatusMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		return nil, err
	}
	return &msg, nil
}
