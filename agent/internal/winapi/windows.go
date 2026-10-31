//go:build windows
// +build windows

package winapi

import (
	"fmt"
	"os/exec"
	"strings"
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

// sendMessageWindows sends a message popup to active user sessions.
func sendMessageWindows(title, message string) error {
	sessions, err := getActiveSessions()
	if err == nil && len(sessions) > 0 {
		titleUTF16, _ := syscall.UTF16PtrFromString(title)
		messageUTF16, _ := syscall.UTF16PtrFromString(message)
		titleLen := uint32(len(title) * 2)
		messageLen := uint32(len(message) * 2)

		success := false
		for _, sessionID := range sessions {
			var response uint32
			ret, _, _ := procWTSSendMessage.Call(
				WTS_CURRENT_SERVER_HANDLE,
				uintptr(sessionID),
				uintptr(unsafe.Pointer(titleUTF16)),
				uintptr(titleLen),
				uintptr(unsafe.Pointer(messageUTF16)),
				uintptr(messageLen),
				MB_OK|MB_ICONINFORMATION,
				0, // timeout
				uintptr(unsafe.Pointer(&response)),
				0, // bWait = FALSE
			)
			if ret != 0 {
				success = true
			}
		}
		if success {
			return nil
		}
	}

	// Fallback 1: msg.exe (standard Windows notification)
	if err := exec.Command("msg", "*", "/time:60", fmt.Sprintf("[%s]\n%s", title, message)).Run(); err == nil {
		return nil
	}

	// Fallback 2: PowerShell MessageBox popup
	cleanMsg := strings.ReplaceAll(message, "'", "''")
	cleanTitle := strings.ReplaceAll(title, "'", "''")
	psCmd := fmt.Sprintf(`Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('%s', '%s')`, cleanMsg, cleanTitle)
	return exec.Command("powershell.exe", "-NoProfile", "-WindowStyle", "Hidden", "-Command", psCmd).Start()
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
		if session.State == WTSActive {
			sessions = append(sessions, session.SessionId)
		}
	}

	// If no active session found via WTS, check console session
	procConsole := kernel32.NewProc("WTSGetActiveConsoleSessionId")
	if procConsole.Find() == nil {
		cSession, _, _ := procConsole.Call()
		if cSession != 0xFFFFFFFF {
			found := false
			for _, s := range sessions {
				if s == uint32(cSession) {
					found = true
					break
				}
			}
			if !found {
				sessions = append(sessions, uint32(cSession))
			}
		}
	}

	return sessions, nil
}
