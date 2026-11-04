package main

import (
	"encoding/json"
	"errors"
	"testing"
	"time"
)

func TestProcessWakeCommandAllTargetsSent(t *testing.T) {
	payload := []byte(`{"command_id":"cmd-1","macs":["01:23:45:67:89:ab","10:23:45:67:89:ab"]}`)
	ack, err := processWakeCommand(payload, RelayConfig{RetriesPerPC: 2}, func(macs []string, retries int, delay time.Duration) map[string]error {
		if len(macs) != 2 || retries != 2 {
			t.Fatalf("wakePCs args = %v, %d", macs, retries)
		}
		return map[string]error{macs[0]: nil, macs[1]: nil}
	})
	if err != nil {
		t.Fatalf("processWakeCommand() error = %v", err)
	}
	if ack.Status != "executed" || ack.Total != 2 || ack.SuccessCount != 2 || ack.FailedCount != 0 {
		t.Fatalf("ack counts/status = %+v", ack)
	}
	for _, result := range ack.Results {
		if result.Status != "executed" || result.Error != "" {
			t.Fatalf("target result = %+v, want executed without error", result)
		}
	}
}

func TestProcessWakeCommandPartialFailure(t *testing.T) {
	const goodMAC = "01:23:45:67:89:ab"
	const badMAC = "10:23:45:67:89:ab"
	payload := []byte(`{"command_id":"cmd-2","macs":["` + goodMAC + `","` + badMAC + `"]}`)
	ack, err := processWakeCommand(payload, RelayConfig{}, func(macs []string, _ int, _ time.Duration) map[string]error {
		return map[string]error{goodMAC: nil, badMAC: errors.New("UDP unavailable")}
	})
	if err != nil {
		t.Fatalf("processWakeCommand() error = %v", err)
	}
	if ack.Status != "failed" || ack.Total != 2 || ack.SuccessCount != 1 || ack.FailedCount != 1 {
		t.Fatalf("ack counts/status = %+v", ack)
	}
	if ack.Results[0].Status != "executed" {
		t.Fatalf("successful target = %+v", ack.Results[0])
	}
	if ack.Results[1].Status != "failed" || ack.Results[1].Error != "UDP unavailable" {
		t.Fatalf("failed target = %+v", ack.Results[1])
	}

	encoded, err := json.Marshal(ack)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]interface{}
	if err := json.Unmarshal(encoded, &fields); err != nil {
		t.Fatal(err)
	}
	if _, ok := fields["results"]; !ok {
		t.Fatal("ack does not contain per-target results")
	}
}

func TestProcessWakeCommandAllFailuresAndEmptyTargets(t *testing.T) {
	payload := []byte(`{"command_id":"cmd-3","macs":["01:23:45:67:89:ab"]}`)
	ack, err := processWakeCommand(payload, RelayConfig{}, func(macs []string, _ int, _ time.Duration) map[string]error {
		return map[string]error{macs[0]: errors.New("send failed")}
	})
	if err != nil {
		t.Fatalf("processWakeCommand() error = %v", err)
	}
	if ack.Status != "failed" || ack.SuccessCount != 0 || ack.FailedCount != 1 {
		t.Fatalf("all-failed ack = %+v", ack)
	}

	ack, err = processWakeCommand([]byte(`{"command_id":"cmd-4","macs":[]}`), RelayConfig{}, func(macs []string, _ int, _ time.Duration) map[string]error {
		if len(macs) != 0 {
			t.Fatalf("MACs = %v, want empty", macs)
		}
		return map[string]error{}
	})
	if err != nil {
		t.Fatalf("processWakeCommand(empty) error = %v", err)
	}
	if ack.Status != "failed" || ack.Total != 0 || ack.SuccessCount != 0 || ack.FailedCount != 0 || len(ack.Results) != 0 {
		t.Fatalf("empty-target ack = %+v", ack)
	}
}

func TestProcessWakeCommandMalformedJSON(t *testing.T) {
	if _, err := processWakeCommand([]byte(`{`), RelayConfig{}, nil); err == nil {
		t.Fatal("processWakeCommand() error = nil, want JSON error")
	}
}
