// SIMLab MQTT Worker — subscribes to all agent topics, ingests telemetry into MySQL,
// updates PC status, processes command acks, and notifies Laravel for real-time broadcasting.
package main

import (
	"crypto/tls"
	"database/sql"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	_ "github.com/go-sql-driver/mysql"

	"github.com/simlab/worker/internal/config"
	"github.com/simlab/worker/internal/ingest"
	"github.com/simlab/worker/internal/notify"
)

var configPath = flag.String("config", "config.yaml", "Path to configuration file")

// pcCache caches lab_id+pc_id → database PC ID mappings.
type pcCache struct {
	mu    sync.RWMutex
	cache map[string]int // "lab_id:pc_id" → db id
}

func newPCCache() *pcCache {
	return &pcCache{cache: make(map[string]int)}
}

func (c *pcCache) Get(labID, pcID string) (int, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	id, ok := c.cache[labID+":"+pcID]
	return id, ok
}

func (c *pcCache) Set(labID, pcID string, id int) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.cache[labID+":"+pcID] = id
}

func main() {
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("[Worker] Failed to load config: %v", err)
	}

	// Connect to MySQL
	db, err := sql.Open("mysql", cfg.Database.DSN())
	if err != nil {
		log.Fatalf("[Worker] Failed to open database: %v", err)
	}
	defer db.Close()

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)

	if err := db.Ping(); err != nil {
		log.Fatalf("[Worker] Failed to connect to database: %v", err)
	}
	log.Println("[Worker] Connected to MySQL")

	// Initialize components
	cache := newPCCache()
	batchIngestor := ingest.NewBatchIngestor(db, cfg.Worker.BatchSize, cfg.Worker.FlushInterval)
	statusUpdater := ingest.NewStatusUpdater(db)
	notifier := notify.NewNotifier(cfg.Laravel.BaseURL, cfg.Laravel.APIToken)

	// Preload PC cache
	loadPCCache(db, cache)

	// MQTT client setup
	opts := mqtt.NewClientOptions()
	brokerURL := fmt.Sprintf("tcp://%s:%d", cfg.MQTT.BrokerHost, cfg.MQTT.BrokerPort)
	if cfg.MQTT.UseTLS {
		brokerURL = fmt.Sprintf("ssl://%s:%d", cfg.MQTT.BrokerHost, cfg.MQTT.BrokerPort)
		opts.SetTLSConfig(&tls.Config{MinVersion: tls.VersionTLS12})
	}

	opts.AddBroker(brokerURL)
	opts.SetClientID("simlab-worker")
	opts.SetUsername(cfg.MQTT.Username)
	opts.SetPassword(cfg.MQTT.Password)
	opts.SetKeepAlive(30 * time.Second)
	opts.SetAutoReconnect(true)
	opts.SetCleanSession(true)

	opts.SetOnConnectHandler(func(client mqtt.Client) {
		log.Println("[Worker] Connected to MQTT broker")
		// Subscribe to all simlab topics
		token := client.Subscribe("simlab/#", 1, func(client mqtt.Client, msg mqtt.Message) {
			handleMessage(msg, cache, db, batchIngestor, statusUpdater, notifier)
		})
		token.Wait()
		if token.Error() != nil {
			log.Printf("[Worker] Subscribe failed: %v", token.Error())
		} else {
			log.Println("[Worker] Subscribed to simlab/#")
		}
	})

	opts.SetConnectionLostHandler(func(client mqtt.Client, err error) {
		log.Printf("[Worker] Connection lost: %v", err)
	})

	client := mqtt.NewClient(opts)
	token := client.Connect()
	token.Wait()
	if token.Error() != nil {
		log.Fatalf("[Worker] Failed to connect to MQTT: %v", token.Error())
	}

	// Start offline detection loop
	go offlineDetectionLoop(db, cfg.Worker.OfflineThreshold, notifier)

	// Wait for shutdown signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	log.Println("[Worker] Running. Press Ctrl+C to stop.")
	<-sigChan

	log.Println("[Worker] Shutting down...")
	batchIngestor.Stop()
	client.Disconnect(1000)
	log.Println("[Worker] Stopped.")
}

// handleMessage routes incoming MQTT messages to the appropriate handler.
func handleMessage(msg mqtt.Message, cache *pcCache, db *sql.DB,
	bi *ingest.BatchIngestor, su *ingest.StatusUpdater, notifier *notify.Notifier) {

	topic := msg.Topic()
	parts := strings.Split(topic, "/")
	// Expected: simlab/{lab_id}/{pc_id}/{type}
	// or: simlab/{lab_id}/relay/{type}
	if len(parts) < 4 {
		return
	}

	labID := parts[1]
	pcID := parts[2]
	msgType := parts[3]

	// Skip relay messages for now (handled separately)
	if pcID == "relay" {
		return
	}

	// Resolve PC database ID
	dbID, ok := cache.Get(labID, pcID)
	if !ok {
		// Try to look up from DB
		var id int
		err := db.QueryRow(
			"SELECT p.id FROM pcs p JOIN labs l ON p.lab_id = l.id WHERE l.slug = ? AND p.slug = ?",
			labID, pcID,
		).Scan(&id)
		if err != nil {
			log.Printf("[Worker] Unknown PC: lab=%s pc=%s", labID, pcID)
			return
		}
		cache.Set(labID, pcID, id)
		dbID = id
	}

	switch msgType {
	case "telemetry":
		handleTelemetry(msg.Payload(), dbID, labID, bi, su, notifier)
	case "status":
		handleStatus(msg.Payload(), dbID, labID, pcID, su, notifier)
	case "ack":
		handleAck(msg.Payload(), dbID, labID, su, notifier)
	}
}

func handleTelemetry(payload []byte, pcID int, labID string,
	bi *ingest.BatchIngestor, su *ingest.StatusUpdater, notifier *notify.Notifier) {

	msg, err := ingest.ParseTelemetry(payload)
	if err != nil {
		log.Printf("[Worker] Failed to parse telemetry: %v", err)
		return
	}
	msg.PCID = pcID

	// Add to batch insert buffer
	bi.Add(*msg)

	// Update PC last_seen
	su.UpdatePCTelemetry(pcID, *msg)

	// Notify Laravel for real-time broadcast (throttled)
	notifier.SendAsync(notify.Event{
		Type:    "pc_metrics_updated",
		Channel: "lab." + labID,
		Data:    msg,
	})
}

func handleStatus(payload []byte, pcID int, labID, pcSlug string,
	su *ingest.StatusUpdater, notifier *notify.Notifier) {

	msg, err := ingest.ParseStatus(payload)
	if err != nil {
		log.Printf("[Worker] Failed to parse status: %v", err)
		return
	}

	log.Printf("[Worker] Status update: pc=%d status=%s reason=%s", pcID, msg.Status, msg.Reason)

	if err := su.UpdatePCStatus(pcID, *msg); err != nil {
		log.Printf("[Worker] Failed to update PC status: %v", err)
	}

	// Notify Laravel for real-time broadcast
	notifier.SendAsync(notify.Event{
		Type:    "pc_status_updated",
		Channel: "lab." + labID,
		Data: map[string]interface{}{
			"pc_id":  pcID,
			"pc_slug": pcSlug,
			"status": msg.Status,
			"reason": msg.Reason,
		},
	})

	// Create notification for abnormal events
	if msg.Status == "offline_lwt" || msg.Status == "offline_abnormal" {
		notifier.SendAsync(notify.Event{
			Type:    "notification",
			Channel: "lab." + labID,
			Data: map[string]interface{}{
				"type":    "offline_abnormal",
				"pc_id":   pcID,
				"message": fmt.Sprintf("PC %s terputus secara abnormal", pcSlug),
			},
		})
	}
}

func handleAck(payload []byte, pcID int, labID string,
	su *ingest.StatusUpdater, notifier *notify.Notifier) {

	msg, err := ingest.ParseAck(payload)
	if err != nil {
		log.Printf("[Worker] Failed to parse ack: %v", err)
		return
	}

	log.Printf("[Worker] Ack received: pc=%d command=%s status=%s", pcID, msg.CommandID, msg.Status)

	if err := su.ProcessAck(pcID, *msg); err != nil {
		log.Printf("[Worker] Failed to process ack: %v", err)
	}

	notifier.SendAsync(notify.Event{
		Type:    "command_status_updated",
		Channel: "lab." + labID,
		Data: map[string]interface{}{
			"pc_id":      pcID,
			"command_id": msg.CommandID,
			"status":     msg.Status,
		},
	})
}

// offlineDetectionLoop runs every minute to detect PCs that stopped sending telemetry.
func offlineDetectionLoop(db *sql.DB, thresholdSec int, notifier *notify.Notifier) {
	ticker := time.NewTicker(1 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		query := `UPDATE pcs SET status = 'offline_abnormal', updated_at = NOW()
		          WHERE status IN ('online', 'booting') 
		          AND last_seen_at < DATE_SUB(NOW(), INTERVAL ? SECOND)`
		result, err := db.Exec(query, thresholdSec)
		if err != nil {
			log.Printf("[Worker] Offline detection failed: %v", err)
			continue
		}
		affected, _ := result.RowsAffected()
		if affected > 0 {
			log.Printf("[Worker] Marked %d PCs as offline_abnormal (no data > %ds)", affected, thresholdSec)

			// Record power events for affected PCs
			db.Exec(`INSERT INTO power_events (pc_id, event_type, source, created_at)
			         SELECT id, 'shutdown_abnormal', 'server_detection', NOW() FROM pcs
			         WHERE status = 'offline_abnormal' AND updated_at >= DATE_SUB(NOW(), INTERVAL 2 SECOND)`)
		}
	}
}

// loadPCCache preloads the lab_id:pc_id → database ID mapping.
func loadPCCache(db *sql.DB, cache *pcCache) {
	rows, err := db.Query("SELECT p.id, l.slug, p.slug FROM pcs p JOIN labs l ON p.lab_id = l.id")
	if err != nil {
		log.Printf("[Worker] Failed to preload PC cache: %v", err)
		return
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var id int
		var labSlug, pcSlug string
		if err := rows.Scan(&id, &labSlug, &pcSlug); err != nil {
			continue
		}
		cache.Set(labSlug, pcSlug, id)
		count++
	}
	log.Printf("[Worker] Loaded %d PCs into cache", count)
}

// Helper to format with strconv
var _ = strconv.Itoa
var _ = json.Marshal
