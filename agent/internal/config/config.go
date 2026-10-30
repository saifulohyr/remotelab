// Package config handles YAML configuration loading for the SIMLab agent.
package config

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

// Config holds all configuration for the SIMLab agent.
type Config struct {
	Agent  AgentConfig  `yaml:"agent"`
	MQTT   MQTTConfig   `yaml:"mqtt"`
	Lab    LabConfig    `yaml:"lab"`
	Server ServerConfig `yaml:"server"`
}

// ServerConfig holds HTTP API fallback settings.
type ServerConfig struct {
	URL string `yaml:"url"`
}

// AgentConfig holds agent-specific settings.
type AgentConfig struct {
	Version          string `yaml:"version"`
	TelemetryInterval int    `yaml:"telemetry_interval"` // seconds
	LogLevel         string `yaml:"log_level"`
}

// MQTTConfig holds MQTT broker connection settings.
type MQTTConfig struct {
	BrokerHost string `yaml:"broker_host"`
	BrokerPort int    `yaml:"broker_port"`
	Username   string `yaml:"username"`
	Password   string `yaml:"password"`
	UseTLS     bool   `yaml:"use_tls"`
	CACertPath string `yaml:"ca_cert_path"`
	KeepAlive  int    `yaml:"keep_alive"` // seconds
}

// LabConfig holds lab/PC identification settings.
type LabConfig struct {
	LabID string `yaml:"lab_id"`
	PCID  string `yaml:"pc_id"`
}

// Load reads and parses the YAML configuration file.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file %s: %w", path, err)
	}

	cfg := &Config{
		Agent: AgentConfig{
			Version:          "1.0.0",
			TelemetryInterval: 15,
			LogLevel:         "info",
		},
		MQTT: MQTTConfig{
			BrokerPort: 8883,
			UseTLS:     true,
			KeepAlive:  10,
		},
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config file %s: %w", path, err)
	}

	// Auto-detect PC and Lab identity from Hostname if omitted or set to auto
	hostname, _ := os.Hostname()
	cleanHostname := strings.ToLower(strings.TrimSpace(hostname))

	if cfg.Lab.PCID == "" || cfg.Lab.PCID == "auto" {
		if cleanHostname != "" {
			cfg.Lab.PCID = cleanHostname
		} else {
			cfg.Lab.PCID = "pc01"
		}
	}

	if cfg.Lab.LabID == "" || cfg.Lab.LabID == "auto" {
		// Infer lab_id from PC hostname prefix (e.g., rpl1-pc01 -> lab-rpl-1, bhs-pc02 -> lab-bahasa)
		lower := strings.ToLower(cfg.Lab.PCID)
		switch {
		case strings.HasPrefix(lower, "rpl1"):
			cfg.Lab.LabID = "lab-rpl-1"
		case strings.HasPrefix(lower, "rpl2"):
			cfg.Lab.LabID = "lab-rpl-2"
		case strings.HasPrefix(lower, "rpl3"):
			cfg.Lab.LabID = "lab-rpl-3"
		case strings.HasPrefix(lower, "rpl4"):
			cfg.Lab.LabID = "lab-rpl-4"
		case strings.HasPrefix(lower, "bhs") || strings.HasPrefix(lower, "bahasa"):
			cfg.Lab.LabID = "lab-bahasa"
		case strings.HasPrefix(lower, "rps"):
			cfg.Lab.LabID = "lab-rps"
		default:
			// Fallback: if lab_id still not resolved, default to lab-rpl-1
			cfg.Lab.LabID = "lab-rpl-1"
		}
	}

	if cfg.MQTT.BrokerHost == "" {
		return nil, fmt.Errorf("mqtt.broker_host is required")
	}

	return cfg, nil
}

// TopicPrefix returns the MQTT topic prefix for this agent.
func (c *Config) TopicPrefix() string {
	return fmt.Sprintf("simlab/%s/%s", c.Lab.LabID, c.Lab.PCID)
}
