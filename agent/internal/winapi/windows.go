//go:build windows
// +build windows

package winapi

import (
	"fmt"
	"syscall"
	"unsafe"
)

var (
	user32              = syscall.NewLazyDLL("user32.dll")
	kernel32            = syscall.NewLazyDLL("kernel32.dll")
	wtsapi32            = syscall.NewLazyDLL("wtsapi32.dll")

	procLockWorkStation = user32.NewProc("LockWorkStation")
	procMessageBoxW     = user32.NewProc("MessageBoxW")

	procWTSEnumerateSessions = wtsapi32.NewProc("WTSEnumerateSessionsW")
	procWTSFreeMemory        = wtsapi32.NewProc("WTSFreeMemory")
	procWTSSendMessage       = wtsapi32.NewProc("WTSSendMessageW")
	procWTSLogoffSession     = wtsapi32.NewProc("WTSLogoffSession")
)

const (
	WTS_CURRENT_SERVER_HANDLE = 0
	WTSActive                 = 0
	MB_OK                     = 0x00000000
	MB_ICONINFORMATION        = 0x00000040
)

// WTS_SESSION_INFO represents a Windows Terminal Services session.
type WTS_SESSION_INFO struct {
	SessionId   uint32
	WinStationName *uint16
	State       uint32
}

// lockWindows locks the workstation using the Win32 LockWorkStation API.
func lockWindows() error {
	ret, _, err := procLockWorkStation.Call()
	if ret == 0 {
		return fmt.Errorf("LockWorkStation failed: %v", err)
	}
	return nil
}

// logoffWindows logs off all active user sessions using WTS API.
func logoffWindows() error {
	sessions, err := getActiveSessions()
	if err != nil {
		return fmt.Errorf("failed to enumerate sessions: %w", err)
	}

	for _, sessionID := range sessions {
		ret, _, callErr := procWTSLogoffSession.Call(
			WTS_CURRENT_SERVER_HANDLE,
			uintptr(sessionID),
			0, // bWait = FALSE
		)
		if ret == 0 {
			return fmt.Errorf("WTSLogoffSession failed for session %d: %v", sessionID, callErr)
		}
	}
	return nil
}

// sendMessageWindows sends a message popup to all active user sessions via WTS API.
func sendMessageWindows(title, message string) error {
	sessions, err := getActiveSessions()
	if err != nil {
		return fmt.Errorf("failed to enumerate sessions: %w", err)
	}

	titleUTF16, _ := syscall.UTF16PtrFromString(title)
	messageUTF16, _ := syscall.UTF16PtrFromString(message)
	titleLen := uint32(len(title) * 2)
	messageLen := uint32(len(message) * 2)

	for _, sessionID := range sessions {
		var response uint32
		ret, _, callErr := procWTSSendMessage.Call(
			WTS_CURRENT_SERVER_HANDLE,
			uintptr(sessionID),
			uintptr(unsafe.Pointer(titleUTF16)),
			uintptr(titleLen),
			uintptr(unsafe.Pointer(messageUTF16)),
			uintptr(messageLen),
			MB_OK|MB_ICONINFORMATION,
			0,     // timeout (0 = no timeout)
			uintptr(unsafe.Pointer(&response)),
			0, // bWait = FALSE (don't block)
		)
		if ret == 0 {
			return fmt.Errorf("WTSSendMessage failed for session %d: %v", sessionID, callErr)
		}
	}
	return nil
}

// getActiveSessions returns a list of active user session IDs.
func getActiveSessions() ([]uint32, error) {
	var sessionInfo uintptr
	var count uint32

	ret, _, err := procWTSEnumerateSessions.Call(
		WTS_CURRENT_SERVER_HANDLE,
		0, // Reserved
		1, // Version
		uintptr(unsafe.Pointer(&sessionInfo)),
		uintptr(unsafe.Pointer(&count)),
	)
	if ret == 0 {
		return nil, fmt.Errorf("WTSEnumerateSessions failed: %v", err)
	}
	defer procWTSFreeMemory.Call(sessionInfo)

	var sessions []uint32
	sessionSize := unsafe.Sizeof(WTS_SESSION_INFO{})
	for i := uint32(0); i < count; i++ {
		session := (*WTS_SESSION_INFO)(unsafe.Pointer(sessionInfo + uintptr(i)*sessionSize))
		// Only include active sessions (not Session 0 which is the service session)
		if session.State == WTSActive && session.SessionId > 0 {
			sessions = append(sessions, session.SessionId)
		}
	}

	return sessions, nil
}
