package wol

import (
	"errors"
	"testing"
)

func TestBuildMagicPacket(t *testing.T) {
	const macAddr = "01:23:45:67:89:ab"
	packet, err := BuildMagicPacket(macAddr)
	if err != nil {
		t.Fatalf("BuildMagicPacket() error = %v", err)
	}
	if len(packet) != 102 {
		t.Fatalf("packet length = %d, want 102", len(packet))
	}
	for i := 0; i < 6; i++ {
		if packet[i] != 0xff {
			t.Fatalf("packet[%d] = %#x, want 0xff", i, packet[i])
		}
	}
	mac, _ := parseMAC(macAddr)
	for i := 0; i < 16; i++ {
		for j, b := range mac {
			if got := packet[6+i*6+j]; got != b {
				t.Fatalf("packet MAC repetition %d byte %d = %#x, want %#x", i, j, got, b)
			}
		}
	}

	if _, err := BuildMagicPacket("01-23-45-67-89-AB"); err != nil {
		t.Fatalf("BuildMagicPacket() rejected hyphenated MAC: %v", err)
	}
}

func TestBuildMagicPacketInvalidMAC(t *testing.T) {
	for _, macAddr := range []string{"", "01:23:45", "01:23:45:67:89:zz", "01:23:45:67:89:ab:cd"} {
		t.Run(macAddr, func(t *testing.T) {
			if _, err := BuildMagicPacket(macAddr); err == nil {
				t.Fatal("BuildMagicPacket() error = nil, want invalid MAC error")
			}
		})
	}
}

func TestWakePCRetriesUntilPacketIsSent(t *testing.T) {
	attempts := 0
	sendErr := errors.New("send failed")
	err := wakePC("01:23:45:67:89:ab", 3, func(string) error {
		attempts++
		if attempts < 3 {
			return sendErr
		}
		return nil
	})
	if err != nil {
		t.Fatalf("wakePC() error = %v", err)
	}
	if attempts != 3 {
		t.Fatalf("send attempts = %d, want 3", attempts)
	}
}

func TestWakePCReturnsErrorWhenAllAttemptsFail(t *testing.T) {
	attempts := 0
	sendErr := errors.New("send failed")
	err := wakePC("01:23:45:67:89:ab", 2, func(string) error {
		attempts++
		return sendErr
	})
	if !errors.Is(err, sendErr) {
		t.Fatalf("wakePC() error = %v, want %v", err, sendErr)
	}
	if attempts != 2 {
		t.Fatalf("send attempts = %d, want 2", attempts)
	}
}

func TestWakePCsPartialFailureAndEmptyTargets(t *testing.T) {
	const goodMAC = "01:23:45:67:89:ab"
	const badMAC = "10:23:45:67:89:ab"
	sendErr := errors.New("send failed")
	results := wakePCs([]string{goodMAC, badMAC}, 1, 0, func(mac string) error {
		if mac == badMAC {
			return sendErr
		}
		return nil
	})
	if results[goodMAC] != nil {
		t.Fatalf("good MAC result = %v, want nil", results[goodMAC])
	}
	if !errors.Is(results[badMAC], sendErr) {
		t.Fatalf("bad MAC result = %v, want %v", results[badMAC], sendErr)
	}

	calls := 0
	empty := wakePCs(nil, 3, 0, func(string) error {
		calls++
		return nil
	})
	if len(empty) != 0 || calls != 0 {
		t.Fatalf("empty wake results = %v, calls = %d; want no results or sends", empty, calls)
	}
}
