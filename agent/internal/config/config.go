// Package config handles YAML configuration loading for the SIMLab agent.
package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Config holds all configuration for the SIMLab agent.
type Config struct {
	Agent  AgentConfig  `yaml:"agent"`
	MQTT   MQTTConfig   `yaml:"mqtt"`
	Lab    LabConfig    `yaml:"lab"`
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

	if cfg.MQTT.BrokerHost == "" {
		return nil, fmt.Errorf("mqtt.broker_host is required")
	}
	if cfg.Lab.LabID == "" {
		return nil, fmt.Errorf("lab.lab_id is required")
	}
	if cfg.Lab.PCID == "" {
		return nil, fmt.Errorf("lab.pc_id is required")
	}

	return cfg, nil
}

// TopicPrefix returns the MQTT topic prefix for this agent.
func (c *Config) TopicPrefix() string {
	return fmt.Sprintf("simlab/%s/%s", c.Lab.LabID, c.Lab.PCID)
}
