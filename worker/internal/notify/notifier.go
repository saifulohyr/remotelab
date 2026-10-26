// Package notify handles HTTP notifications to the Laravel backend for broadcasting events.
package notify

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
)

// Notifier sends events to the Laravel backend API for real-time broadcasting via Reverb.
type Notifier struct {
	baseURL    string
	apiToken   string
	httpClient *http.Client
}

// Event represents a notification event to send to Laravel.
type Event struct {
	Type    string      `json:"type"`    // pc_status_updated, pc_metrics_updated, command_status_updated, notification
	Channel string      `json:"channel"` // lab.{labId}
	Data    interface{} `json:"data"`
}

// NewNotifier creates a new notifier.
func NewNotifier(baseURL, apiToken string) *Notifier {
	return &Notifier{
		baseURL:  baseURL,
		apiToken: apiToken,
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// Send sends an event to the Laravel backend for broadcasting.
func (n *Notifier) Send(event Event) error {
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	req, err := http.NewRequest("POST", n.baseURL+"/api/internal/broadcast", bytes.NewReader(payload))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+n.apiToken)
	req.Header.Set("X-Internal-Token", n.apiToken)

	resp, err := n.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send event: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusNoContent {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	return nil
}

// SendAsync sends an event asynchronously (fire-and-forget with logging).
func (n *Notifier) SendAsync(event Event) {
	go func() {
		if err := n.Send(event); err != nil {
			log.Printf("[Notify] Failed to send event %s: %v", event.Type, err)
		}
	}()
}
