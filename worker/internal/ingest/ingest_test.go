package ingest

import (
	"database/sql"
	"errors"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestParseTelemetryIncludesSampleIDAndTimestamp(t *testing.T) {
	msg, err := ParseTelemetry([]byte(`{"sample_id":"sample-123","timestamp":1712345678,"cpu_percent":12.5}`))
	if err != nil {
		t.Fatalf("ParseTelemetry() error = %v", err)
	}
	if msg.SampleID != "sample-123" || msg.Timestamp != 1712345678 || msg.CPUPercent != 12.5 {
		t.Fatalf("ParseTelemetry() = %+v", msg)
	}
}

func TestInsertBatchDeduplicatesSamplesAndUsesInsertIgnore(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	batch := []TelemetryMessage{
		{PCID: 7, SampleID: "sample-1", CPUPercent: 10, Timestamp: 100},
		{PCID: 7, SampleID: "sample-1", CPUPercent: 99, Timestamp: 101},
		{PCID: 7, SampleID: "sample-2", CPUPercent: 20, Timestamp: 102},
	}
	mock.ExpectExec("INSERT IGNORE INTO metrics").
		WithArgs(
			7, "sample-1", 10.0, 0.0, 0.0, uint64(0), int64(100),
			7, "sample-2", 20.0, 0.0, 0.0, uint64(0), int64(102),
		).
		WillReturnResult(sqlmock.NewResult(0, 2))

	bi := &BatchIngestor{db: db}
	if err := bi.insertBatch(batch); err != nil {
		t.Fatalf("insertBatch() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestInsertBatchKeepsEmptySampleIDNullable(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectExec("INSERT IGNORE INTO metrics").
		WithArgs(7, nil, 10.0, 0.0, 0.0, uint64(0), int64(100)).
		WillReturnResult(sqlmock.NewResult(1, 1))
	bi := &BatchIngestor{db: db}
	if err := bi.insertBatch([]TelemetryMessage{{PCID: 7, CPUPercent: 10, Timestamp: 100}}); err != nil {
		t.Fatalf("insertBatch() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestParseAckIncludesOutputAndExitCode(t *testing.T) {
	ack, err := ParseAck([]byte(`{"command_id":"cmd-1","status":"failed","message":"command failed","output":"stderr text","exit_code":23}`))
	if err != nil {
		t.Fatalf("ParseAck() error = %v", err)
	}
	if ack.Output != "stderr text" || ack.ExitCode != 23 {
		t.Fatalf("ParseAck() = %+v", ack)
	}
}

func TestProcessAckPersistsOutputAndProtectsTerminalStatus(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectQuery("SELECT cl.id FROM command_logs").
		WithArgs("cmd-1", 7).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(42))
	mock.ExpectExec("UPDATE command_results SET").
		WithArgs("delivered", "delivered", "delivered", "late delivery", "delivered", "late output", sqlmock.AnyArg(), nil, 42, 7).
		WillReturnResult(sqlmock.NewResult(0, 1))

	su := NewStatusUpdater(db)
	ack := AckMessage{CommandID: "cmd-1", Status: "delivered", Message: "late delivery", Output: "late output"}
	if err := su.ProcessAck(7, ack); err != nil {
		t.Fatalf("ProcessAck() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestProcessRelayAckUpdatesExactPCTarget(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	ack := RelayAckMessage{
		CommandID: "cmd-1",
		Status:    "failed",
		Output:    "one packet failed",
		Results: []RelayAckResult{
			{MAC: "01:23:45:67:89:ab", Status: "executed"},
			{MAC: "10:23:45:67:89:ab", Status: "failed", Error: "send failed"},
		},
	}
	mock.ExpectQuery(regexp.QuoteMeta("SELECT id FROM command_logs WHERE command_id = ?")).
		WithArgs("cmd-1").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(42))
	for i, result := range ack.Results {
		pcID := i + 7
		mock.ExpectQuery("SELECT p.id FROM pcs p JOIN labs").
			WithArgs("lab1", result.MAC, 42).
			WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(pcID))
		mock.ExpectExec("UPDATE command_results").
			WithArgs(result.Status, result.Error, ack.Output, sqlmock.AnyArg(), 42, pcID).
			WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec("INSERT INTO power_events").
			WithArgs(pcID, sqlmock.AnyArg(), sqlmock.AnyArg()).
			WillReturnResult(sqlmock.NewResult(1, 1))
	}

	if err := NewStatusUpdater(db).ProcessRelayAck("lab1", ack); err != nil {
		t.Fatalf("ProcessRelayAck() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestProcessRelayAckUnknownTargetReturnsError(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectQuery(regexp.QuoteMeta("SELECT id FROM command_logs WHERE command_id = ?")).
		WithArgs("cmd-unknown-target").
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(42))
	mock.ExpectQuery("SELECT p.id FROM pcs p JOIN labs").
		WithArgs("lab1", "ff:ff:ff:ff:ff:ff", 42).
		WillReturnError(sql.ErrNoRows)

	ack := RelayAckMessage{CommandID: "cmd-unknown-target", Results: []RelayAckResult{{MAC: "ff:ff:ff:ff:ff:ff", Status: "failed"}}}
	err = NewStatusUpdater(db).ProcessRelayAck("lab1", ack)
	if err == nil || !strings.Contains(err.Error(), "PC not found") {
		t.Fatalf("ProcessRelayAck() error = %v, want unknown PC error", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestParseRelayAckValidation(t *testing.T) {
	valid, err := ParseRelayAck([]byte(`{"command_id":"cmd-1","status":"executed","results":[{"mac":"01:23:45:67:89:ab","status":"executed","error":""}]}`))
	if err != nil || len(valid.Results) != 1 {
		t.Fatalf("ParseRelayAck(valid) = %+v, %v", valid, err)
	}

	for _, payload := range []string{
		`{`,
		`{"command_id":"","results":[]}`,
		`{"command_id":"cmd-1"}`,
		`{"command_id":"cmd-1","results":[{"mac":"","status":"executed"}]}`,
		`{"command_id":"cmd-1","results":[{"mac":"01:23:45:67:89:ab","status":"delivered"}]}`,
	} {
		if _, err := ParseRelayAck([]byte(payload)); err == nil {
			t.Errorf("ParseRelayAck(%s) error = nil, want validation error", payload)
		}
	}
}

func TestProcessAckReturnsDatabaseErrors(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	queryErr := errors.New("database unavailable")
	mock.ExpectQuery("SELECT cl.id FROM command_logs").WillReturnError(queryErr)
	err = NewStatusUpdater(db).ProcessAck(7, AckMessage{CommandID: "cmd-1", Status: "executed"})
	if !errors.Is(err, queryErr) {
		t.Fatalf("ProcessAck() error = %v, want %v", err, queryErr)
	}
}

func TestUpdatePCStatusDoesNotDuplicatePowerEventForSameStatus(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectExec("UPDATE pcs SET status = ?").
		WithArgs("online", 7, "online").
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec("UPDATE pcs SET status = ?").
		WithArgs("online", int64(100), "", "", 7).
		WillReturnResult(sqlmock.NewResult(0, 1))

	if err := NewStatusUpdater(db).UpdatePCStatus(7, StatusMessage{Status: "online", Timestamp: 100}); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestUpdatePCTelemetryRejectsStaleSamples(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()

	mock.ExpectExec(`last_seen_at IS NULL OR last_seen_at <= CONVERT_TZ\(FROM_UNIXTIME`).
		WithArgs(int64(100), "10.0.0.1", "1.0.0", 7, int64(100)).
		WillReturnResult(sqlmock.NewResult(0, 0))
	if err := NewStatusUpdater(db).UpdatePCTelemetry(7, TelemetryMessage{Timestamp: 100, IPAddress: "10.0.0.1", AgentVersion: "1.0.0"}); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

var _ = time.Now
