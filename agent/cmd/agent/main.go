// SIMLab Agent — Windows Service for PC monitoring and remote control.
package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"io"
	"log"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/kardianos/service"

	"github.com/simlab/agent/internal/command"
	"github.com/simlab/agent/internal/config"
	mqttclient "github.com/simlab/agent/internal/mqtt"
	"github.com/simlab/agent/internal/telemetry"
	"github.com/simlab/agent/internal/winapi"
)

var configPath = flag.String("config", "", "Path to configuration file")

// resolveConfigPath returns absolute path to config.yaml in exe directory if not passed
func resolveConfigPath(path string) string {
	if path != "" {
		return path
	}
	exePath, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(exePath)
		return filepath.Join(dir, "config.yaml")
	}
	return "config.yaml"
}

// program implements the kardianos/service interface.
type program struct {
	cfg        *config.Config
	mqttClient *mqttclient.Client
	cmdHandler *command.Handler
	stopChan   chan struct{}
	httpClient *http.Client
}

func (p *program) Start(s service.Service) error {
	p.stopChan = make(chan struct{})
	go p.run()
	return nil
}

type telemetryResponse struct {
	Status   string            `json:"status"`
	Commands []command.Command `json:"commands,omitempty"`
}

func (p *program) sendHTTPTelemetry(data telemetry.Data) {
	serverURL := p.cfg.Server.URL
	if serverURL == "" {
		serverURL = "http://192.168.1.2:8000"
	}
	telemetryURL := strings.TrimRight(serverURL, "/") + "/api/telemetry"
	ackURL := strings.TrimRight(serverURL, "/") + "/api/commands/ack"

	hostname, _ := os.Hostname()

	payload := map[string]interface{}{
		"lab_id":   p.cfg.Lab.LabID,
		"pc_id":    p.cfg.Lab.PCID,
		"hostname": hostname,
		"status":   "online",
		"version":  p.cfg.Agent.Version,
		"metrics": map[string]interface{}{
			"cpu_percent":  data.CPUPercent,
			"ram_percent":  data.RAMPercent,
			"disk_percent": data.DiskPercent,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return
	}

	req, err := http.NewRequest("POST", telemetryURL, bytes.NewBuffer(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := p.httpClient.Do(req)
	if err != nil {
		return
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return
	}

	var tr telemetryResponse
	if err := json.Unmarshal(respBytes, &tr); err != nil {
		return
	}

	// Process any commands delivered via HTTP
	for _, cmd := range tr.Commands {
		ack := p.cmdHandler.ExecuteDirect(cmd)

		// Send ACK back via HTTP
		ackPayload := map[string]interface{}{
			"command_id": ack.CommandID,
			"pc_id":      p.cfg.Lab.PCID,
			"hostname":   hostname,
			"status":     ack.Status,
			"message":    ack.Message,
			"output":     ack.Output,
		}
		ackBody, err := json.Marshal(ackPayload)
		if err == nil {
			ackReq, err := http.NewRequest("POST", ackURL, bytes.NewBuffer(ackBody))
			if err == nil {
				ackReq.Header.Set("Content-Type", "application/json")
				ackResp, err := p.httpClient.Do(ackReq)
				if err == nil {
					ackResp.Body.Close()
				}
			}
		}
	}
}

func (p *program) run() {
	realConfigPath := resolveConfigPath(*configPath)
	cfg, err := config.Load(realConfigPath)
	if err != nil {
		log.Printf("[Agent] FATAL: Failed to load config from %s: %v", realConfigPath, err)
		return
	}
	p.cfg = cfg
	p.httpClient = &http.Client{Timeout: 10 * time.Second}

	log.Println("[Agent] Starting SIMLab Agent v" + p.cfg.Agent.Version)

	// Initialize MQTT client
	client, err := mqttclient.NewClient(p.cfg)
	if err != nil {
		log.Printf("[Agent] Failed to create MQTT client: %v", err)
		return
	}
	p.mqttClient = client

	// Initialize system executor for commands
	executor := winapi.NewSystemExecutor()

	// Initialize command handler with ack publisher
	p.cmdHandler = command.NewHandler(executor, func(ack command.AckPayload) {
		p.mqttClient.PublishAck(ack)
	})

	// Set command handler on MQTT client
	p.mqttClient.SetCommandHandler(func(payload []byte) {
		p.cmdHandler.Handle(payload)
	})

	// Connect to MQTT broker (with background retry, don't block service)
	go func() {
		if err := p.mqttClient.Connect(); err != nil {
			log.Printf("[Agent] MQTT initial connect failed: %v (client will auto-reconnect)", err)
		}
	}()

	// Start telemetry loop
	ticker := time.NewTicker(time.Duration(p.cfg.Agent.TelemetryInterval) * time.Second)
	defer ticker.Stop()

	log.Printf("[Agent] Telemetry interval: %d seconds", p.cfg.Agent.TelemetryInterval)
	log.Printf("[Agent] Lab: %s, PC: %s", p.cfg.Lab.LabID, p.cfg.Lab.PCID)

	// Send initial telemetry immediately
	initialData := telemetry.Collect(p.cfg.Agent.Version)
	p.mqttClient.PublishTelemetry(initialData)
	go p.sendHTTPTelemetry(initialData)

	for {
		select {
		case <-ticker.C:
			data := telemetry.Collect(p.cfg.Agent.Version)
			if p.mqttClient.IsConnected() {
				p.mqttClient.PublishTelemetry(data)
			}
			go p.sendHTTPTelemetry(data)
		case <-p.stopChan:
			log.Println("[Agent] Stopping telemetry loop")
			return
		}
	}
}

func (p *program) Stop(s service.Service) error {
	log.Println("[Agent] Stopping SIMLab Agent")
	close(p.stopChan)

	if p.mqttClient != nil {
		p.mqttClient.PublishStatus("offline_normal", "agent_stopped")
		time.Sleep(500 * time.Millisecond)
		p.mqttClient.Disconnect()
	}

	return nil
}

func main() {
	flag.Parse()

	// Configure the service
	svcConfig := &service.Config{
		Name:        "SIMLab",
		DisplayName: "SIMLab Agent",
		Description: "SIMLab PC Monitoring and Remote Control Agent",
		Option: service.KeyValue{
			"StartType":       "automatic",
			"OnFailure":       "restart",
			"OnFailureDelayMs": "5000",
		},
	}

	prg := &program{}
	s, err := service.New(prg, svcConfig)
	if err != nil {
		log.Fatalf("[Agent] Failed to create service: %v", err)
	}

	// Handle service control commands (install, uninstall, start, stop)
	if len(os.Args) > 1 {
		cmd := os.Args[len(os.Args)-1]
		switch cmd {
		case "install":
			if err := s.Install(); err != nil {
				log.Fatalf("[Agent] Install failed: %v", err)
			}
			log.Println("[Agent] Service installed successfully")
			return
		case "uninstall":
			if err := s.Uninstall(); err != nil {
				log.Fatalf("[Agent] Uninstall failed: %v", err)
			}
			log.Println("[Agent] Service uninstalled successfully")
			return
		case "start":
			if err := s.Start(); err != nil {
				log.Fatalf("[Agent] Start failed: %v", err)
			}
			log.Println("[Agent] Service started")
			return
		case "stop":
			if err := s.Stop(); err != nil {
				log.Fatalf("[Agent] Stop failed: %v", err)
			}
			log.Println("[Agent] Service stopped")
			return
		}
	}

	// If running interactively (not as service), handle Ctrl+C
	if service.Interactive() {
		log.Println("[Agent] Running in interactive mode (Ctrl+C to stop)")
		go func() {
			sigChan := make(chan os.Signal, 1)
			signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
			<-sigChan
			s.Stop()
		}()
	}

	// Run the service
	if err := s.Run(); err != nil {
		log.Fatalf("[Agent] Service failed: %v", err)
	}
}
