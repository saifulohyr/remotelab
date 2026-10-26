// SIMLab WoL Relay — daemon that runs on an always-on device per lab,
// receives wake commands via MQTT and sends magic packets to PCs.
package main

import (
	"crypto/tls"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
	"gopkg.in/yaml.v3"

	"github.com/simlab/relay/internal/wol"
)

var configPath = flag.String("config", "config.yaml", "Path to configuration file")

// Config holds all relay configuration.
type Config struct {
	MQTT  MQTTConfig  `yaml:"mqtt"`
	Relay RelayConfig `yaml:"relay"`
}

type MQTTConfig struct {
	BrokerHost string `yaml:"broker_host"`
	BrokerPort int    `yaml:"broker_port"`
	Username   string `yaml:"username"`
	Password   string `yaml:"password"`
	UseTLS     bool   `yaml:"use_tls"`
}

type RelayConfig struct {
	LabID            string `yaml:"lab_id"`
	RetriesPerPC     int    `yaml:"retries_per_pc"`
	DelayBetweenPCMs int    `yaml:"delay_between_pc_ms"`
	HeartbeatSec     int    `yaml:"heartbeat_sec"`
}

// WakeCommand represents an incoming wake request from the server.
type WakeCommand struct {
	MACs      []string `json:"macs"`
	CommandID string   `json:"command_id"`
}

// RelayStatus represents the relay heartbeat message.
type RelayStatus struct {
	Status    string `json:"status"`
	LabID     string `json:"lab_id"`
	Timestamp int64  `json:"timestamp"`
}

func main() {
	flag.Parse()

	// Load config
	data, err := os.ReadFile(*configPath)
	if err != nil {
		log.Fatalf("[Relay] Failed to read config: %v", err)
	}

	cfg := Config{
		MQTT: MQTTConfig{BrokerPort: 8883, UseTLS: true},
		Relay: RelayConfig{
			RetriesPerPC:     3,
			DelayBetweenPCMs: 1500,
			HeartbeatSec:     30,
		},
	}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		log.Fatalf("[Relay] Failed to parse config: %v", err)
	}

	labID := cfg.Relay.LabID
	log.Printf("[Relay] Starting WoL relay for lab: %s", labID)

	// MQTT setup
	opts := mqtt.NewClientOptions()
	brokerURL := fmt.Sprintf("tcp://%s:%d", cfg.MQTT.BrokerHost, cfg.MQTT.BrokerPort)
	if cfg.MQTT.UseTLS {
		brokerURL = fmt.Sprintf("ssl://%s:%d", cfg.MQTT.BrokerHost, cfg.MQTT.BrokerPort)
		opts.SetTLSConfig(&tls.Config{MinVersion: tls.VersionTLS12})
	}

	clientID := fmt.Sprintf("simlab-relay-%s", labID)
	opts.AddBroker(brokerURL)
	opts.SetClientID(clientID)
	opts.SetUsername(cfg.MQTT.Username)
	opts.SetPassword(cfg.MQTT.Password)
	opts.SetKeepAlive(30 * time.Second)
	opts.SetAutoReconnect(true)
	opts.SetConnectRetry(true)

	// LWT for relay
	lwtPayload, _ := json.Marshal(RelayStatus{
		Status: "offline", LabID: labID, Timestamp: time.Now().Unix(),
	})
	opts.SetWill(fmt.Sprintf("simlab/%s/relay/status", labID), string(lwtPayload), 1, true)

	var client mqtt.Client

	opts.SetOnConnectHandler(func(c mqtt.Client) {
		log.Println("[Relay] Connected to MQTT broker")

		// Subscribe to wake commands
		wakeTopic := fmt.Sprintf("simlab/%s/relay/wake", labID)
		token := c.Subscribe(wakeTopic, 1, func(_ mqtt.Client, msg mqtt.Message) {
			handleWakeCommand(msg.Payload(), cfg.Relay, c, labID)
		})
		token.Wait()
		if token.Error() != nil {
			log.Printf("[Relay] Failed to subscribe: %v", token.Error())
		} else {
			log.Printf("[Relay] Subscribed to %s", wakeTopic)
		}

		// Publish online status
		publishRelayStatus(c, labID, "online")
	})

	client = mqtt.NewClient(opts)
	token := client.Connect()
	token.Wait()
	if token.Error() != nil {
		log.Fatalf("[Relay] Failed to connect: %v", token.Error())
	}

	// Start heartbeat
	go heartbeatLoop(client, labID, cfg.Relay.HeartbeatSec)

	// Wait for shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	log.Println("[Relay] Running. Press Ctrl+C to stop.")
	<-sigChan

	publishRelayStatus(client, labID, "offline")
	client.Disconnect(1000)
	log.Println("[Relay] Stopped.")
}

// handleWakeCommand processes an incoming wake request.
func handleWakeCommand(payload []byte, relayCfg RelayConfig, client mqtt.Client, labID string) {
	var cmd WakeCommand
	if err := json.Unmarshal(payload, &cmd); err != nil {
		log.Printf("[Relay] Failed to parse wake command: %v", err)
		return
	}

	log.Printf("[Relay] Wake command received: %d MACs, command_id=%s", len(cmd.MACs), cmd.CommandID)

	// Send magic packets with staggered delay
	delay := time.Duration(relayCfg.DelayBetweenPCMs) * time.Millisecond
	results := wol.WakePCs(cmd.MACs, relayCfg.RetriesPerPC, delay)

	// Report results
	successCount := 0
	for _, err := range results {
		if err == nil {
			successCount++
		}
	}

	log.Printf("[Relay] Wake complete: %d/%d MACs sent successfully", successCount, len(cmd.MACs))

	// Publish ack
	ack, _ := json.Marshal(map[string]interface{}{
		"command_id":    cmd.CommandID,
		"status":        "executed",
		"total":         len(cmd.MACs),
		"success_count": successCount,
		"timestamp":     time.Now().Unix(),
	})
	topic := fmt.Sprintf("simlab/%s/relay/ack", labID)
	client.Publish(topic, 1, false, ack)
}

// publishRelayStatus publishes the relay status (retained).
func publishRelayStatus(client mqtt.Client, labID, status string) {
	payload, _ := json.Marshal(RelayStatus{
		Status:    status,
		LabID:     labID,
		Timestamp: time.Now().Unix(),
	})
	topic := fmt.Sprintf("simlab/%s/relay/status", labID)
	client.Publish(topic, 1, true, payload)
}

// heartbeatLoop sends periodic heartbeat status messages.
func heartbeatLoop(client mqtt.Client, labID string, intervalSec int) {
	ticker := time.NewTicker(time.Duration(intervalSec) * time.Second)
	defer ticker.Stop()

	for range ticker.C {
		if client.IsConnected() {
			publishRelayStatus(client, labID, "online")
		}
	}
}
