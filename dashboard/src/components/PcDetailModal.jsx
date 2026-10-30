import React, { useState, useEffect } from 'react';
import { 
  X, 
  Monitor, 
  Cpu, 
  Layers, 
  HardDrive, 
  Activity,
  Terminal,
  Lock,
  RotateCw,
  Power
} from 'lucide-react';
import { api } from '../api';

export default function PcDetailModal({ pcId, onClose, onDispatchSingleCommand }) {
  const [pc, setPc] = useState(null);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pcId) return;
    let isMounted = true;
    setLoading(true);

    Promise.all([
      api.getPc(pcId).catch(() => null),
      api.getPcEvents(pcId).catch(() => null),
    ]).then(([pcRes, eventsRes]) => {
      if (!isMounted) return;
      if (pcRes?.data) setPc(pcRes.data);
      if (eventsRes?.data) setEvents(eventsRes.data);
      setLoading(false);
    });

    return () => { isMounted = false; };
  }, [pcId]);

  if (!pcId) return null;

  const cpuVal = pc?.latest_metrics?.cpu_percent != null ? `${pc.latest_metrics.cpu_percent}%` : '-';
  const ramVal = pc?.latest_metrics?.ram_percent != null ? `${pc.latest_metrics.ram_percent}%` : '-';
  const diskVal = pc?.latest_metrics?.disk_percent != null ? `${pc.latest_metrics.disk_percent}%` : '-';

  return (
    <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
      <div className="bg-white rounded-xl max-w-2xl w-full p-6 border border-zinc-200 shadow-xl relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg border border-zinc-200 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 flex items-center justify-center absolute right-5 top-5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {loading ? (
          <div className="py-20 text-center text-xs text-zinc-400 font-mono">Mengambil data telemetri PC #{pcId}...</div>
        ) : (
          <div className="space-y-6">
            {/* Header info */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center">
                <Monitor className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-zinc-900">{pc?.hostname || `PC #${pcId}`}</h3>
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded border uppercase ${
                    pc?.status === 'online'
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-zinc-100 text-zinc-600 border-zinc-200'
                  }`}>
                    {pc?.status || 'offline'}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 font-mono mt-0.5">
                  IP: {pc?.ip_address || '-'} • MAC: {pc?.mac_address || '-'}
                </p>
              </div>
            </div>

            {/* Gauges (CPU, RAM, DISK) */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-zinc-50 p-3.5 rounded-lg border border-zinc-200 text-center">
                <Cpu className="w-4 h-4 text-zinc-600 mx-auto mb-1" />
                <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Beban CPU</p>
                <p className="text-lg font-bold text-zinc-900 font-mono mt-0.5">{cpuVal}</p>
              </div>

              <div className="bg-zinc-50 p-3.5 rounded-lg border border-zinc-200 text-center">
                <Layers className="w-4 h-4 text-zinc-600 mx-auto mb-1" />
                <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Memori RAM</p>
                <p className="text-lg font-bold text-zinc-900 font-mono mt-0.5">{ramVal}</p>
              </div>

              <div className="bg-zinc-50 p-3.5 rounded-lg border border-zinc-200 text-center">
                <HardDrive className="w-4 h-4 text-zinc-600 mx-auto mb-1" />
                <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Kapasitas Disk</p>
                <p className="text-lg font-bold text-zinc-900 font-mono mt-0.5">{diskVal}</p>
              </div>
            </div>

            {/* System Info Details */}
            <div className="bg-zinc-50/70 p-4 rounded-lg border border-zinc-200 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-zinc-200/60">
                <span className="text-zinc-500">Laboratorium / Ruangan</span>
                <span className="font-semibold text-zinc-900">{pc?.lab?.name || `Lab #${pc?.lab_id || '-'}`}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-200/60">
                <span className="text-zinc-500">Versi Agent Terpasang</span>
                <span className="font-mono text-zinc-900">{pc?.agent_version || '-'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-zinc-200/60">
                <span className="text-zinc-500">Uptime Sistem</span>
                <span className="font-mono text-zinc-900">
                  {pc?.uptime_seconds ? `${Math.floor(pc.uptime_seconds / 3600)}j ${Math.floor((pc.uptime_seconds % 3600) / 60)}m` : '-'}
                </span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-zinc-500">Pengguna Login</span>
                <span className="font-medium text-zinc-900">{pc?.latest_metrics?.active_user || '-'}</span>
              </div>
            </div>

            {/* Power Events Table */}
            <div>
              <h4 className="text-xs font-semibold text-zinc-800 uppercase tracking-wider mb-2">Riwayat Event Mesin</h4>
              <div className="border border-zinc-200 rounded-lg overflow-hidden divide-y divide-zinc-100">
                {events.length === 0 ? (
                  <p className="text-xs text-zinc-400 p-3 text-center">Belum ada catatan event pada PC ini</p>
                ) : (
                  events.slice(0, 5).map((ev) => (
                    <div key={ev.id} className="p-2.5 px-3 flex items-center justify-between text-xs hover:bg-zinc-50">
                      <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-zinc-400" />
                        <span className="font-medium text-zinc-900 capitalize">{ev.event_type.replace('_', ' ')}</span>
                        <span className="text-zinc-400 text-[11px]">oleh {ev.triggered_by}</span>
                      </div>
                      <span className="font-mono text-[10px] text-zinc-400">{ev.created_at}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Single PC Action Bar */}
            <div className="pt-2 flex justify-end gap-2 border-t border-zinc-100">
              <button
                onClick={() => onDispatchSingleCommand(pcId, 'run_script')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
              >
                <Terminal className="w-3.5 h-3.5 text-zinc-600" />
                <span>Script Runner</span>
              </button>
              <button
                onClick={() => onDispatchSingleCommand(pcId, 'lock')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
              >
                <Lock className="w-3.5 h-3.5 text-zinc-600" />
                <span>Kunci Layar</span>
              </button>
              <button
                onClick={() => onDispatchSingleCommand(pcId, 'reboot')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-800 hover:bg-zinc-50"
              >
                <RotateCw className="w-3.5 h-3.5 text-zinc-600" />
                <span>Restart</span>
              </button>
              <button
                onClick={() => onDispatchSingleCommand(pcId, 'shutdown')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 text-xs font-medium text-zinc-900 hover:bg-zinc-100"
              >
                <Power className="w-3.5 h-3.5 text-zinc-600" />
                <span>Shutdown</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
