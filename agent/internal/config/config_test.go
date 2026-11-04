package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadRejectsUnresolvableLabInsteadOfUsingFirstLab(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	content := []byte("mqtt:\n  broker_host: localhost\nlab:\n  lab_id: auto\n  pc_id: unmapped-host\n")
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := Load(path); err == nil {
		t.Fatal("Load() error = nil, want explicit lab identity error")
	}
}

func TestLoadInfersKnownLab(t *testing.T) {
	path := filepath.Join(t.TempDir(), "config.yaml")
	content := []byte("mqtt:\n  broker_host: localhost\nlab:\n  lab_id: auto\n  pc_id: rpl1-pc01\n")
	if err := os.WriteFile(path, content, 0o600); err != nil {
		t.Fatal(err)
	}
	cfg, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Lab.LabID != "lab-rpl-1" {
		t.Fatalf("lab_id = %q", cfg.Lab.LabID)
	}
}
