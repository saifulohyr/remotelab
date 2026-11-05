package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/simlab/agent/internal/command"
	"github.com/simlab/agent/internal/config"
	"github.com/simlab/agent/internal/telemetry"
)

func TestTelemetryResponseAcceptsObjectAndLegacyArrayParams(t *testing.T) {
	for _, params := range []string{`{}`, `[]`, `null`, `{"delay":0}`} {
		t.Run(params, func(t *testing.T) {
			payload := fmt.Sprintf(`{"status":"ok","pc_id":42,"commands":[{"command_id":"cmd-params","action":"shutdown","params":%s,"issued_at":1800000000,"ttl_seconds":120}]}`, params)
			var response telemetryResponse
			if err := json.Unmarshal([]byte(payload), &response); err != nil {
				t.Fatalf("telemetry response with params=%s: %v", params, err)
			}
			if len(response.Commands) != 1 || response.Commands[0].Action != "shutdown" {
				t.Fatalf("commands were not decoded: %+v", response.Commands)
			}
		})
	}
}

func TestSendHTTPTelemetryPreservesSampleAndUsesAgentToken(t *testing.T) {
	const token = "test-agent-token"
	data := telemetry.Data{
		SampleID:      "sample-123",
		Timestamp:     1_800_000_000,
		UptimeSeconds: 42,
		CPUPercent:    1.5,
	}

	var httpSample struct {
		SampleID      string `json:"sample_id"`
		Timestamp     int64  `json:"timestamp"`
		UptimeSeconds uint64 `json:"uptime_seconds"`
	}
	var ack struct {
		command.AckPayload
		PCID int `json:"pc_id"`
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if got := r.Header.Get("X-Agent-Token"); got != token {
			t.Errorf("X-Agent-Token = %q, want configured token", got)
		}
		switch r.URL.Path {
		case "/api/telemetry":
			if err := json.NewDecoder(r.Body).Decode(&httpSample); err != nil {
				t.Errorf("decode telemetry: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(telemetryResponse{
				Status: "ok",
				PCID:   42,
				Commands: []command.Command{{
					CommandID:  "expired-http-command",
					Action:     "lock",
					IssuedAt:   time.Now().Add(-2 * time.Minute).Unix(),
					TTLSeconds: 1,
				}},
			})
		case "/api/commands/ack":
			if err := json.NewDecoder(r.Body).Decode(&ack); err != nil {
				t.Errorf("decode ACK: %v", err)
			}
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"status":"ok"}`))
		default:
			http.NotFound(w, r)
		}
	}))
	defer server.Close()

	p := &program{
		cfg: &config.Config{
			Server: config.ServerConfig{URL: server.URL, Token: token},
			Lab:    config.LabConfig{LabID: "lab-test", PCID: "pc-test"},
		},
		httpClient: server.Client(),
	}
	p.cmdHandler = command.NewHandler(nil, nil)
	p.sendHTTPTelemetry(data)

	mqttPayload, err := json.Marshal(data)
	if err != nil {
		t.Fatal(err)
	}
	var mqttSample struct {
		SampleID      string `json:"sample_id"`
		Timestamp     int64  `json:"timestamp"`
		UptimeSeconds uint64 `json:"uptime_seconds"`
	}
	if err := json.Unmarshal(mqttPayload, &mqttSample); err != nil {
		t.Fatal(err)
	}
	if httpSample != mqttSample {
		t.Fatalf("HTTP sample = %+v, MQTT sample = %+v", httpSample, mqttSample)
	}
	if httpSample.SampleID == "" {
		t.Fatal("HTTP sample_id is empty")
	}
	if ack.Status != "rejected_expired" {
		t.Fatalf("HTTP ACK status = %q, want rejected_expired", ack.Status)
	}
	if ack.PCID != 42 {
		t.Fatalf("HTTP ACK pc_id = %d, want numeric database ID 42", ack.PCID)
	}
}
