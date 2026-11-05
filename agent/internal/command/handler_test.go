package command

import (
	"encoding/json"
	"fmt"
	"reflect"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type fakeExecutor struct {
	runCalls atomic.Int32
	started  chan struct{}
	release  chan struct{}
	output   string
	err      error
}

func (f *fakeExecutor) Shutdown(int, string) error       { return nil }
func (f *fakeExecutor) Reboot(int, string) error         { return nil }
func (f *fakeExecutor) Logoff() error                    { return nil }
func (f *fakeExecutor) Lock() error                      { return nil }
func (f *fakeExecutor) SendMessage(string, string) error { return nil }

func (f *fakeExecutor) RunScript(string, string) (string, error) {
	f.runCalls.Add(1)
	if f.started != nil {
		close(f.started)
	}
	if f.release != nil {
		<-f.release
	}
	return f.output, f.err
}

func newTestHandler(executor Executor) *Handler {
	h := NewHandler(executor, nil)
	h.now = func() time.Time { return time.Unix(1_800_000_000, 0) }
	return h
}

func scriptCommand(id string, issuedAt int64) Command {
	return Command{
		CommandID:  id,
		Action:     "run_script",
		Params:     json.RawMessage(`{"script":"Write-Output test"}`),
		IssuedAt:   issuedAt,
		TTLSeconds: 60,
	}
}

func TestHandleIssuedAtFormats(t *testing.T) {
	now := time.Unix(1_800_000_000, 0)
	tests := []struct {
		name     string
		issuedAt string
	}{
		{name: "manual Unix integer", issuedAt: fmt.Sprintf("%d", now.Unix())},
		{name: "scheduler RFC3339", issuedAt: strconvQuote(now.UTC().Format(time.RFC3339))},
		{name: "scheduler RFC3339 fractional", issuedAt: strconvQuote(now.UTC().Format(time.RFC3339Nano))},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			executor := &fakeExecutor{output: "command output"}
			h := newTestHandler(executor)
			var ack AckPayload
			h.publishAck = func(a AckPayload) { ack = a }
			payload := fmt.Sprintf(`{"command_id":"cmd-1","action":"run_script","params":{"script":"test"},"issued_at":%s,"ttl_seconds":60}`, tt.issuedAt)

			h.Handle([]byte(payload))

			if ack.Status != "executed" {
				t.Fatalf("status = %q, want executed (ack: %+v)", ack.Status, ack)
			}
			if ack.Output != "command output" {
				t.Fatalf("output = %q, want command output", ack.Output)
			}
			if got := executor.runCalls.Load(); got != 1 {
				t.Fatalf("RunScript calls = %d, want 1", got)
			}
		})
	}
}

func strconvQuote(value string) string {
	encoded, _ := json.Marshal(value)
	return string(encoded)
}

func TestExecuteDirectRejectsInvalidIdentityAndTimestamp(t *testing.T) {
	executor := &fakeExecutor{}
	h := newTestHandler(executor)
	tests := []struct {
		name string
		cmd  Command
	}{
		{name: "empty command ID", cmd: scriptCommand("", h.now().Unix())},
		{name: "zero issued_at", cmd: scriptCommand("cmd-zero", 0)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ack := h.ExecuteDirect(tt.cmd)
			if ack.Status != "rejected_unknown" {
				t.Fatalf("status = %q, want rejected_invalid", ack.Status)
			}
		})
	}
	if got := executor.runCalls.Load(); got != 0 {
		t.Fatalf("RunScript calls = %d, want 0", got)
	}
}

func TestExecuteDirectRejectsExpiredAndReplaysAck(t *testing.T) {
	executor := &fakeExecutor{}
	h := newTestHandler(executor)
	cmd := scriptCommand("cmd-expired", h.now().Add(-2*time.Minute).Unix())
	cmd.TTLSeconds = 30

	first := h.ExecuteDirect(cmd)
	second := h.ExecuteDirect(cmd)

	if first.Status != "rejected_expired" {
		t.Fatalf("status = %q, want rejected_expired", first.Status)
	}
	if !reflect.DeepEqual(second, first) {
		t.Fatalf("duplicate ack = %+v, want original %+v", second, first)
	}
	if got := executor.runCalls.Load(); got != 0 {
		t.Fatalf("RunScript calls = %d, want 0", got)
	}
}

func TestExecuteDirectDuplicateReplaysOriginalOutput(t *testing.T) {
	executor := &fakeExecutor{output: "preserved output"}
	h := newTestHandler(executor)
	cmd := scriptCommand("cmd-duplicate", h.now().Unix())

	first := h.ExecuteDirect(cmd)
	second := h.ExecuteDirect(cmd)

	if first.Status != "executed" || first.Output != "preserved output" {
		t.Fatalf("unexpected first ack: %+v", first)
	}
	if !reflect.DeepEqual(second, first) {
		t.Fatalf("duplicate ack = %+v, want original %+v", second, first)
	}
	if got := executor.runCalls.Load(); got != 1 {
		t.Fatalf("RunScript calls = %d, want 1", got)
	}
}

func TestExecuteDirectConcurrentDuplicatesExecuteOnce(t *testing.T) {
	executor := &fakeExecutor{
		output:  "concurrent output",
		started: make(chan struct{}),
		release: make(chan struct{}),
	}
	h := newTestHandler(executor)
	cmd := scriptCommand("cmd-concurrent", h.now().Unix())

	const callers = 24
	acks := make(chan AckPayload, callers)
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		acks <- h.ExecuteDirect(cmd)
	}()
	<-executor.started

	for i := 1; i < callers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			acks <- h.ExecuteDirect(cmd)
		}()
	}
	close(executor.release)
	wg.Wait()
	close(acks)

	var first AckPayload
	for ack := range acks {
		if first.CommandID == "" {
			first = ack
		}
		if !reflect.DeepEqual(ack, first) {
			t.Fatalf("ack = %+v, want identical original %+v", ack, first)
		}
	}
	if first.Status != "executed" || first.Output != "concurrent output" {
		t.Fatalf("unexpected original ack: %+v", first)
	}
	if got := executor.runCalls.Load(); got != 1 {
		t.Fatalf("RunScript calls = %d, want 1", got)
	}
}
