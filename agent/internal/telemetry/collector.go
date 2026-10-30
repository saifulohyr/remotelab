// Package telemetry collects system metrics (CPU, RAM, disk, uptime) for the SIMLab agent.
package telemetry

import (
	"log"
	"net"
	"os"
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v4/cpu"
	"github.com/shirou/gopsutil/v4/disk"
	"github.com/shirou/gopsutil/v4/host"
	"github.com/shirou/gopsutil/v4/mem"
)

// Data holds a snapshot of system telemetry.
type Data struct {
	CPUPercent    float64 `json:"cpu_percent"`
	RAMPercent    float64 `json:"ram_percent"`
	DiskPercent   float64 `json:"disk_percent"`
	UptimeSeconds uint64  `json:"uptime_seconds"`
	Hostname      string  `json:"hostname"`
	IPAddress     string  `json:"ip_address"`
	MACAddress    string  `json:"mac_address"`
	AgentVersion  string  `json:"agent_version"`
	OS            string  `json:"os"`
	Timestamp     int64   `json:"timestamp"`
}

// Collect gathers current system metrics and returns a Data snapshot.
func Collect(agentVersion string) Data {
	data := Data{
		AgentVersion: agentVersion,
		OS:           runtime.GOOS,
		Timestamp:    time.Now().Unix(),
	}

	// Hostname
	hostname, err := os.Hostname()
	if err != nil {
		log.Printf("[Telemetry] Failed to get hostname: %v", err)
	}
	data.Hostname = hostname

	// CPU usage (average across all cores over 1 second)
	cpuPercents, err := cpu.Percent(time.Second, false)
	if err != nil {
		log.Printf("[Telemetry] Failed to get CPU: %v", err)
	} else if len(cpuPercents) > 0 {
		data.CPUPercent = roundTo2(cpuPercents[0])
	}

	// Memory usage
	vmStat, err := mem.VirtualMemory()
	if err != nil {
		log.Printf("[Telemetry] Failed to get RAM: %v", err)
	} else {
		data.RAMPercent = roundTo2(vmStat.UsedPercent)
	}

	// Disk usage (root partition)
	rootPath := "/"
	if runtime.GOOS == "windows" {
		rootPath = "C:\\"
	}
	diskStat, err := disk.Usage(rootPath)
	if err != nil {
		log.Printf("[Telemetry] Failed to get disk: %v", err)
	} else {
		data.DiskPercent = roundTo2(diskStat.UsedPercent)
	}

	// Uptime
	uptime, err := host.Uptime()
	if err != nil {
		log.Printf("[Telemetry] Failed to get uptime: %v", err)
	}
	data.UptimeSeconds = uptime

	// Primary IP address
	data.IPAddress = getPrimaryIP()

	// MAC address of primary network interface
	data.MACAddress = getPrimaryMAC()

	return data
}

// getPrimaryIP returns the primary non-loopback IP address.
func getPrimaryIP() string {
	conn, err := net.Dial("udp", "8.8.8.8:80")
	if err != nil {
		// Fallback: iterate interfaces
		addrs, err := net.InterfaceAddrs()
		if err != nil {
			return "unknown"
		}
		for _, addr := range addrs {
			if ipnet, ok := addr.(*net.IPNet); ok && !ipnet.IP.IsLoopback() && ipnet.IP.To4() != nil {
				return ipnet.IP.String()
			}
		}
		return "unknown"
	}
	defer conn.Close()
	localAddr := conn.LocalAddr().(*net.UDPAddr)
	return localAddr.IP.String()
}

// roundTo2 rounds a float64 to 2 decimal places.
func roundTo2(val float64) float64 {
	return float64(int(val*100)) / 100
}

// getPrimaryMAC returns the MAC address of the primary active network interface.
func getPrimaryMAC() string {
	// Try to find MAC of the interface that has the primary IP
	primaryIP := getPrimaryIP()
	if primaryIP != "" && primaryIP != "unknown" {
		ifaces, err := net.Interfaces()
		if err == nil {
			for _, iface := range ifaces {
				if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
					continue
				}
				if len(iface.HardwareAddr) == 0 {
					continue
				}
				addrs, err := iface.Addrs()
				if err != nil {
					continue
				}
				for _, addr := range addrs {
					if ipnet, ok := addr.(*net.IPNet); ok && ipnet.IP.String() == primaryIP {
						return iface.HardwareAddr.String()
					}
				}
			}
		}
	}

	// Fallback: return first non-loopback interface with a MAC
	ifaces, err := net.Interfaces()
	if err != nil {
		return ""
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp != 0 && iface.Flags&net.FlagLoopback == 0 && len(iface.HardwareAddr) > 0 {
			return iface.HardwareAddr.String()
		}
	}
	return ""
}
