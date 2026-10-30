// Package winapi provides Windows system API calls for the SIMLab agent.
// This file contains the actual Windows implementations using syscall.
// On non-Windows platforms, it provides stub implementations for development/testing.
package winapi

import (
	"context"
	"fmt"
	"log"
	"os/exec"
	"runtime"
	"time"
)

// SystemExecutor implements the command.Executor interface using Windows APIs.
type SystemExecutor struct{}

// NewSystemExecutor creates a new system executor.
func NewSystemExecutor() *SystemExecutor {
	return &SystemExecutor{}
}

// Shutdown shuts down the PC with a delay and warning message.
func (e *SystemExecutor) Shutdown(delaySec int, message string) error {
	log.Printf("[WinAPI] Shutdown requested: delay=%d message=%s", delaySec, message)

	if runtime.GOOS == "windows" {
		// On Windows: shutdown /s /t <delay> /c "<message>" /f
		args := []string{"/s", "/t", fmt.Sprintf("%d", delaySec), "/f"}
		if message != "" {
			args = append(args, "/c", message)
		}
		cmd := exec.Command("shutdown", args...)
		return cmd.Run()
	}

	// Linux fallback for testing
	log.Printf("[WinAPI] SIMULATED shutdown (non-Windows): delay=%d", delaySec)
	return nil
}

// Reboot restarts the PC with a delay and warning message.
func (e *SystemExecutor) Reboot(delaySec int, message string) error {
	log.Printf("[WinAPI] Reboot requested: delay=%d message=%s", delaySec, message)

	if runtime.GOOS == "windows" {
		args := []string{"/r", "/t", fmt.Sprintf("%d", delaySec), "/f"}
		if message != "" {
			args = append(args, "/c", message)
		}
		cmd := exec.Command("shutdown", args...)
		return cmd.Run()
	}

	log.Printf("[WinAPI] SIMULATED reboot (non-Windows): delay=%d", delaySec)
	return nil
}

// Logoff logs off the current user session.
func (e *SystemExecutor) Logoff() error {
	log.Printf("[WinAPI] Logoff requested")

	if runtime.GOOS == "windows" {
		return logoffWindows()
	}

	log.Printf("[WinAPI] SIMULATED logoff (non-Windows)")
	return nil
}

// Lock locks the workstation.
func (e *SystemExecutor) Lock() error {
	log.Printf("[WinAPI] Lock requested")

	if runtime.GOOS == "windows" {
		return lockWindows()
	}

	log.Printf("[WinAPI] SIMULATED lock (non-Windows)")
	return nil
}

// SendMessage displays a message popup to all active user sessions.
func (e *SystemExecutor) SendMessage(title, message string) error {
	log.Printf("[WinAPI] Message requested: title=%s message=%s", title, message)

	if runtime.GOOS == "windows" {
		return sendMessageWindows(title, message)
	}

	log.Printf("[WinAPI] SIMULATED message (non-Windows): %s - %s", title, message)
	return nil
}

// RunScript executes a PowerShell or CMD script with timeout and returns output.
func (e *SystemExecutor) RunScript(script, shell string) (string, error) {
	log.Printf("[WinAPI] RunScript requested (shell=%s): %s", shell, script)
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		if shell == "cmd" {
			cmd = exec.CommandContext(ctx, "cmd.exe", "/c", script)
		} else {
			cmd = exec.CommandContext(ctx, "powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
		}
	} else {
		cmd = exec.CommandContext(ctx, "sh", "-c", script)
	}

	outputBytes, err := cmd.CombinedOutput()
	output := string(outputBytes)
	if ctx.Err() == context.DeadlineExceeded {
		return output, fmt.Errorf("eksekusi timeout (melebihi 30 detik)")
	}
	return output, err
}
