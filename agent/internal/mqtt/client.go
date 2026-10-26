// Package mqtt handles MQTT client connection, publish, and subscribe for the SIMLab agent.
package mqtt

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"os"
	"sync"
	"time"

	"github.com/simlab/agent/internal/config"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

// Client wraps the MQTT client with SIMLab-specific functionality.
type Client struct {
	client      mqtt.Client
	cfg         *config.Config
	topicPrefix string
	mu          sync.Mutex
	connected   bool
	onCommand   func(payload []byte)
}

// StatusPayload represents a status message published to the status topic.
type StatusPayload struct {
	Status    string `json:"status"`
	Reason    string `json:"reason,omitempty"`
	Timestamp int64  `json:"timestamp"`
	Hostname  string `json:"hostname,omitempty"`
	IP        string `json:"ip,omitempty"`
	Version   string `json:"version,omitempty"`
}

// NewClient creates a new MQTT client for the SIMLab agent.
func NewClient(cfg *config.Config) (*Client, error) {
	c := &Client{
		cfg:         cfg,
		topicPrefix: cfg.TopicPrefix(),
	}

	hostname, _ := os.Hostname()

	opts := mqtt.NewClientOptions()
	brokerURL := fmt.Sprintf("tcp://%s:%d", cfg.MQTT.BrokerHost, cfg.MQTT.BrokerPort)
	if cfg.MQTT.UseTLS {
		brokerURL = fmt.Sprintf("ssl://%s:%d", cfg.MQTT.BrokerHost, cfg.MQTT.BrokerPort)

		tlsConfig := &tls.Config{
			MinVersion: tls.VersionTLS12,
		}

		// Load CA certificate if provided
		if cfg.MQTT.CACertPath != "" {
			caCert, err := os.ReadFile(cfg.MQTT.CACertPath)
			if err != nil {
				return nil, fmt.Errorf("failed to read CA cert: %w", err)
			}
			caCertPool := x509.NewCertPool()
			if !caCertPool.AppendCertsFromPEM(caCert) {
				return nil, fmt.Errorf("failed to parse CA cert")
			}
			tlsConfig.RootCAs = caCertPool
		}

		opts.SetTLSConfig(tlsConfig)
	}

	clientID := fmt.Sprintf("simlab-agent-%s-%s", cfg.Lab.LabID, cfg.Lab.PCID)

	opts.AddBroker(brokerURL)
	opts.SetClientID(clientID)
	opts.SetUsername(cfg.MQTT.Username)
	opts.SetPassword(cfg.MQTT.Password)
	opts.SetKeepAlive(time.Duration(cfg.MQTT.KeepAlive) * time.Second)
	opts.SetCleanSession(true)
	opts.SetAutoReconnect(true)
	opts.SetMaxReconnectInterval(30 * time.Second)

	// Reconnect with jitter to avoid thundering herd
	opts.SetConnectRetryInterval(time.Duration(2+rand.Intn(5)) * time.Second)
	opts.SetConnectRetry(true)

	// Last Will and Testament — broker publishes this when agent disconnects unexpectedly
	lwtPayload, _ := json.Marshal(StatusPayload{
		Status:    "offline_lwt",
		Timestamp: time.Now().Unix(),
		Hostname:  hostname,
	})
	opts.SetWill(c.topicPrefix+"/status", string(lwtPayload), 1, true)

	opts.SetOnConnectHandler(func(client mqtt.Client) {
		log.Println("[MQTT] Connected to broker")
		c.mu.Lock()
		c.connected = true
		c.mu.Unlock()

		// Subscribe to command topic on (re)connect
		c.subscribeCommands()

		// Publish online status
		c.PublishStatus("online", "")
	})

	opts.SetConnectionLostHandler(func(client mqtt.Client, err error) {
		log.Printf("[MQTT] Connection lost: %v", err)
		c.mu.Lock()
		c.connected = false
		c.mu.Unlock()
	})

	c.client = mqtt.NewClient(opts)

	return c, nil
}

// Connect establishes the MQTT connection.
func (c *Client) Connect() error {
	token := c.client.Connect()
	token.Wait()
	if token.Error() != nil {
		return fmt.Errorf("failed to connect to MQTT broker: %w", token.Error())
	}
	return nil
}

// Disconnect gracefully disconnects from the MQTT broker.
func (c *Client) Disconnect() {
	// Publish offline_normal status before disconnecting
	c.PublishStatus("offline_normal", "agent_shutdown")
	time.Sleep(500 * time.Millisecond)
	c.client.Disconnect(1000)
}

// IsConnected returns whether the client is currently connected.
func (c *Client) IsConnected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.connected
}

// SetCommandHandler sets the callback for incoming commands.
func (c *Client) SetCommandHandler(handler func(payload []byte)) {
	c.onCommand = handler
}

// subscribeCommands subscribes to the command topics for this PC.
func (c *Client) subscribeCommands() {
	topics := map[string]byte{
		c.topicPrefix + "/command":                                                   1,
		fmt.Sprintf("simlab/%s/all/command", c.cfg.Lab.LabID):                        1,
	}

	token := c.client.SubscribeMultiple(topics, func(client mqtt.Client, msg mqtt.Message) {
		log.Printf("[MQTT] Command received on topic: %s", msg.Topic())
		if c.onCommand != nil {
			c.onCommand(msg.Payload())
		}
	})
	token.Wait()
	if token.Error() != nil {
		log.Printf("[MQTT] Failed to subscribe to commands: %v", token.Error())
	} else {
		log.Println("[MQTT] Subscribed to command topics")
	}
}

// PublishTelemetry publishes telemetry data to the telemetry topic (QoS 0, not retained).
func (c *Client) PublishTelemetry(data interface{}) {
	payload, err := json.Marshal(data)
	if err != nil {
		log.Printf("[MQTT] Failed to marshal telemetry: %v", err)
		return
	}

	topic := c.topicPrefix + "/telemetry"
	token := c.client.Publish(topic, 0, false, payload)
	go func() {
		token.Wait()
		if token.Error() != nil {
			log.Printf("[MQTT] Failed to publish telemetry: %v", token.Error())
		}
	}()
}

// PublishStatus publishes a status message (QoS 1, retained).
func (c *Client) PublishStatus(status, reason string) {
	hostname, _ := os.Hostname()
	payload, _ := json.Marshal(StatusPayload{
		Status:    status,
		Reason:    reason,
		Timestamp: time.Now().Unix(),
		Hostname:  hostname,
		Version:   c.cfg.Agent.Version,
	})

	topic := c.topicPrefix + "/status"
	token := c.client.Publish(topic, 1, true, payload)
	token.Wait()
	if token.Error() != nil {
		log.Printf("[MQTT] Failed to publish status: %v", token.Error())
	}
}

// PublishAck publishes a command acknowledgment (QoS 1, not retained).
func (c *Client) PublishAck(ack interface{}) {
	payload, err := json.Marshal(ack)
	if err != nil {
		log.Printf("[MQTT] Failed to marshal ack: %v", err)
		return
	}

	topic := c.topicPrefix + "/ack"
	token := c.client.Publish(topic, 1, false, payload)
	token.Wait()
	if token.Error() != nil {
		log.Printf("[MQTT] Failed to publish ack: %v", token.Error())
	}
}
