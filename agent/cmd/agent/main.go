// SIMLab Agent — Windows Service for PC monitoring and remote control.
//
// Usage:
//
//	simlab-agent                     Run in foreground (debug mode)
//	simlab-agent install             Install as Windows Service
//	simlab-agent uninstall           Remove Windows Service
//	simlab-agent start               Start the service
//	simlab-agent stop                Stop the service
//	simlab-agent --config path.yaml  Use custom config file
package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/kardianos/service"

	"github.com/simlab/agent/internal/command"
	"github.com/simlab/agent/internal/config"
	mqttclient "github.com/simlab/agent/internal/mqtt"
	"github.com/simlab/agent/internal/telemetry"
	"github.com/simlab/agent/internal/winapi"
)

var configPath = flag.String("config", "config.yaml", "Path to configuration file")

// program implements the kardianos/service interface.
type program struct {
	cfg        *config.Config
	mqttClient *mqttclient.Client
	cmdHandler *command.Handler
	stopChan   chan struct{}
}

func (p *program) Start(s service.Service) error {
	p.stopChan = make(chan struct{})
	go p.run()
	return nil
}

func (p *program) run() {
	log.Println("[Agent] Starting SIMLab Agent v" + p.cfg.Agent.Version)

	// Initialize MQTT client
	client, err := mqttclient.NewClient(p.cfg)
	if err != nil {
		log.Fatalf("[Agent] Failed to create MQTT client: %v", err)
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

	// Connect to MQTT broker
	if err := p.mqttClient.Connect(); err != nil {
		log.Printf("[Agent] Failed to connect to broker: %v (will retry)", err)
	}

	// Start telemetry loop
	ticker := time.NewTicker(time.Duration(p.cfg.Agent.TelemetryInterval) * time.Second)
	defer ticker.Stop()

	log.Printf("[Agent] Telemetry interval: %d seconds", p.cfg.Agent.TelemetryInterval)
	log.Printf("[Agent] Lab: %s, PC: %s", p.cfg.Lab.LabID, p.cfg.Lab.PCID)

	// Send initial telemetry immediately
	data := telemetry.Collect(p.cfg.Agent.Version)
	p.mqttClient.PublishTelemetry(data)

	for {
		select {
		case <-ticker.C:
			if p.mqttClient.IsConnected() {
				data := telemetry.Collect(p.cfg.Agent.Version)
				p.mqttClient.PublishTelemetry(data)
			}
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
		// Publish offline_normal status before disconnecting
		p.mqttClient.PublishStatus("offline_normal", "agent_stopped")
		time.Sleep(500 * time.Millisecond)
		p.mqttClient.Disconnect()
	}

	return nil
}

func main() {
	flag.Parse()

	// Load configuration
	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("[Agent] Failed to load config: %v", err)
	}

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

	prg := &program{cfg: cfg}
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
