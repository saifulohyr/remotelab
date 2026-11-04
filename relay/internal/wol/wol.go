// Package wol sends Wake-on-LAN magic packets to wake up PCs.
package wol

import (
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"time"
)

// BuildMagicPacket builds a 102-byte Wake-on-LAN magic packet.
func BuildMagicPacket(macAddr string) ([]byte, error) {
	mac, err := parseMAC(macAddr)
	if err != nil {
		return nil, fmt.Errorf("invalid MAC address %s: %w", macAddr, err)
	}

	// Six bytes of 0xFF followed by the MAC repeated 16 times.
	packet := make([]byte, 102)
	for i := 0; i < 6; i++ {
		packet[i] = 0xFF
	}
	for i := 0; i < 16; i++ {
		copy(packet[6+i*6:], mac)
	}
	return packet, nil
}

// SendMagicPacket sends a WoL magic packet to the specified MAC address.
// The magic packet is sent as a UDP broadcast on port 9.
func SendMagicPacket(macAddr string) error {
	packet, err := BuildMagicPacket(macAddr)
	if err != nil {
		return err
	}

	addr, err := net.ResolveUDPAddr("udp", "255.255.255.255:9")
	if err != nil {
		return fmt.Errorf("failed to resolve broadcast address: %w", err)
	}

	conn, err := net.DialUDP("udp", nil, addr)
	if err != nil {
		return fmt.Errorf("failed to open UDP socket: %w", err)
	}
	defer conn.Close()

	n, err := conn.Write(packet)
	if err != nil {
		return fmt.Errorf("failed to send magic packet: %w", err)
	}
	if n != len(packet) {
		return fmt.Errorf("failed to send magic packet: %w", io.ErrShortWrite)
	}

	return nil
}

type senderFunc func(macAddr string) error

// WakePC sends magic packets to a single MAC address with retries.
func WakePC(macAddr string, retries int) error {
	return wakePC(macAddr, retries, SendMagicPacket)
}

func wakePC(macAddr string, retries int, send senderFunc) error {
	if retries <= 0 {
		return fmt.Errorf("retries must be greater than zero")
	}

	var lastErr error
	for i := 0; i < retries; i++ {
		if err := send(macAddr); err != nil {
			lastErr = err
		} else {
			log.Printf("[WoL] Sent magic packet to %s on attempt %d/%d", macAddr, i+1, retries)
			return nil
		}
		if i < retries-1 {
			time.Sleep(500 * time.Millisecond)
		}
	}
	return lastErr
}

// WakePCs sends magic packets to multiple MACs with staggered delay.
func WakePCs(macs []string, retriesPerPC int, delayBetweenPCs time.Duration) map[string]error {
	return wakePCs(macs, retriesPerPC, delayBetweenPCs, SendMagicPacket)
}

func wakePCs(macs []string, retriesPerPC int, delayBetweenPCs time.Duration, send senderFunc) map[string]error {
	results := make(map[string]error, len(macs))
	for i, mac := range macs {
		err := wakePC(mac, retriesPerPC, send)
		results[mac] = err
		if err != nil {
			log.Printf("[WoL] Failed to wake %s: %v", mac, err)
		}
		// Stagger to avoid power surge.
		if i < len(macs)-1 {
			time.Sleep(delayBetweenPCs)
		}
	}
	return results
}

// parseMAC parses a MAC address string (accepts : or - separators).
func parseMAC(macAddr string) ([]byte, error) {
	macAddr = strings.ReplaceAll(macAddr, ":", "")
	macAddr = strings.ReplaceAll(macAddr, "-", "")
	macAddr = strings.ToLower(macAddr)

	if len(macAddr) != 12 {
		return nil, fmt.Errorf("MAC address must be 12 hex characters, got %d", len(macAddr))
	}

	mac, err := hex.DecodeString(macAddr)
	if err != nil {
		return nil, fmt.Errorf("invalid hex in MAC address: %w", err)
	}

	return mac, nil
}
