package config

import (
	"strings"
	"testing"
)

func TestDSNFormatsTimeValuesAsUTC(t *testing.T) {
	db := DatabaseConfig{
		Host:     "127.0.0.1",
		Port:     3306,
		Name:     "simlab",
		Username: "simlab",
		Password: "secret",
	}

	dsn := db.DSN()

	if !strings.Contains(dsn, "loc=UTC") {
		t.Fatalf("DSN must format time.Time values as UTC: %s", dsn)
	}
	if strings.Contains(dsn, "loc=Local") {
		t.Fatalf("DSN must not depend on the host time zone: %s", dsn)
	}
}
