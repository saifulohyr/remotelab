//go:build !windows
// +build !windows

package winapi

// lockWindows is a stub for non-Windows platforms.
func lockWindows() error {
	return nil
}

// logoffWindows is a stub for non-Windows platforms.
func logoffWindows() error {
	return nil
}

// sendMessageWindows is a stub for non-Windows platforms.
func sendMessageWindows(title, message string) error {
	return nil
}
