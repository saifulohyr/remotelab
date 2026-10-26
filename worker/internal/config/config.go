// Package config handles configuration loading for the SIMLab MQTT Worker.
package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

// Config holds all worker configuration.
type Config struct {
	MQTT     MQTTConfig     `yaml:"mqtt"`
	Database DatabaseConfig `yaml:"database"`
	Worker   WorkerConfig   `yaml:"worker"`
	Laravel  LaravelConfig  `yaml:"laravel"`
}

// MQTTConfig holds MQTT broker connection settings.
type MQTTConfig struct {
	BrokerHost string `yaml:"broker_host"`
	BrokerPort int    `yaml:"broker_port"`
	Username   string `yaml:"username"`
	Password   string `yaml:"password"`
	UseTLS     bool   `yaml:"use_tls"`
	CACertPath string `yaml:"ca_cert_path"`
}

// DatabaseConfig holds MySQL connection settings.
type DatabaseConfig struct {
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Name     string `yaml:"name"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

// WorkerConfig holds worker-specific settings.
type WorkerConfig struct {
	BatchSize     int `yaml:"batch_size"`      // max rows per batch insert
	FlushInterval int `yaml:"flush_interval"`  // milliseconds between flushes
	OfflineThreshold int `yaml:"offline_threshold"` // seconds before marking PC offline
}

// LaravelConfig holds Laravel API settings for broadcasting events.
type LaravelConfig struct {
	BaseURL  string `yaml:"base_url"`
	APIToken string `yaml:"api_token"`
}

// DSN returns the MySQL Data Source Name.
func (c *DatabaseConfig) DSN() string {
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?parseTime=true&loc=Local",
		c.Username, c.Password, c.Host, c.Port, c.Name)
}

// Load reads and parses the YAML configuration file.
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read config file: %w", err)
	}

	cfg := &Config{
		MQTT: MQTTConfig{
			BrokerPort: 8883,
			UseTLS:     true,
		},
		Database: DatabaseConfig{
			Host: "127.0.0.1",
			Port: 3306,
			Name: "simlab",
		},
		Worker: WorkerConfig{
			BatchSize:     100,
			FlushInterval: 2000,
			OfflineThreshold: 45,
		},
		Laravel: LaravelConfig{
			BaseURL: "http://127.0.0.1:8000",
		},
	}

	if err := yaml.Unmarshal(data, cfg); err != nil {
		return nil, fmt.Errorf("failed to parse config: %w", err)
	}

	return cfg, nil
}
