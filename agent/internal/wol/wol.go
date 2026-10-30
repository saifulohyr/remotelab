// Package wol sends Wake-on-LAN magic packets on the local network.
package wol

import (
	"encoding/hex"
	"fmt"
	"net"
	"strings"
)

// SendMagicPacket broadcasts a WoL magic packet for the given MAC address
// on the local LAN (255.255.255.255:9). This works when the agent is on
// the same physical switch/subnet as the target PC.
func SendMagicPacket(macAddr string) error {
	mac, err := parseMAC(macAddr)
	if err != nil {
		return fmt.Errorf("invalid MAC address '%s': %w", macAddr, err)
	}

	// Build magic packet: 6 bytes of 0xFF + MAC repeated 16 times
	var packet [102]byte
	for i := 0; i < 6; i++ {
		packet[i] = 0xFF
	}
	for i := 0; i < 16; i++ {
		copy(packet[6+i*6:], mac)
	}

	// Send via UDP broadcast
	conn, err := net.DialUDP("udp4", nil, &net.UDPAddr{
		IP:   net.IPv4bcast,
		Port: 9,
	})
	if err != nil {
		return fmt.Errorf("failed to open UDP socket: %w", err)
	}
	defer conn.Close()

	_, err = conn.Write(packet[:])
	if err != nil {
		return fmt.Errorf("failed to send magic packet: %w", err)
	}

	return nil
}

// SendMagicPackets sends WoL packets for multiple MAC addresses.
// Returns a summary of results.
func SendMagicPackets(macAddrs []string) (string, error) {
	if len(macAddrs) == 0 {
		return "", fmt.Errorf("no MAC addresses provided")
	}

	var results []string
	var lastErr error
	successCount := 0

	for _, mac := range macAddrs {
		if err := SendMagicPacket(mac); err != nil {
			results = append(results, fmt.Sprintf("GAGAL %s: %v", mac, err))
			lastErr = err
		} else {
			results = append(results, fmt.Sprintf("OK    %s: Magic Packet terkirim", mac))
			successCount++
		}
	}

	summary := fmt.Sprintf("WoL Relay: %d/%d berhasil dikirim.\n%s",
		successCount, len(macAddrs), strings.Join(results, "\n"))

	if successCount == 0 {
		return summary, lastErr
	}
	return summary, nil
}

// parseMAC normalizes various MAC formats (aa:bb:cc:dd:ee:ff, aa-bb-cc-dd-ee-ff, aabbccddeeff)
func parseMAC(s string) ([]byte, error) {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "-", "")
	s = strings.ReplaceAll(s, ":", "")
	s = strings.ToLower(s)

	if len(s) != 12 {
		return nil, fmt.Errorf("MAC must be 12 hex chars, got %d", len(s))
	}

	b, err := hex.DecodeString(s)
	if err != nil {
		return nil, err
	}
	return b, nil
}
