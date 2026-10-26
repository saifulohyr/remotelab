import React, { useState, useEffect } from 'react';
import { 
  X, 
  Monitor, 
  Cpu, 
  Layers, 
  HardDrive, 
  Clock, 
  Shield, 
  Network, 
  Terminal,
  Activity
} from 'lucide-react';
import { api } from '../api';

export default function PcDetailModal({ pcId, onClose, onDispatchSingleCommand }) {
  const [pc, setPc] = useState(null);
  const [events, setEvents] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pcId) return;
    let isMounted = true;
    setLoading(true);

    Promise.all([
      api.getPc(pcId).catch(() => null),
      api.getPcEvents(pcId).catch(() => null),
      api.getPcMetrics(pcId).catch(() => null),
    ]).then(([pcRes, eventsRes, metricsRes]) => {
      if (!isMounted) return;
      if (pcRes?.data) setPc(pcRes.data);
      if (eventsRes?.data) setEvents(eventsRes.data);
      if (metricsRes?.data) setMetrics(metricsRes.data);
      setLoading(false);
    });

    return () => { isMounted = false; };
  }, [pcId]);

  if (!pcId) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-2xl w-full p-6 border border-slate-100 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center absolute right-5 top-5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {loading ? (
          <div className="py-20 text-center text-xs text-slate-400">Memuat telemetri PC...</div>
        ) : (
          <div className="space-y-6">
            {/* Header info */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
                <Monitor className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold text-slate-900">{pc?.hostname || `PC #${pcId}`}</h3>
                  <span className="text-[10px] font-bold bg-emerald-50 text-emerald-600 px-2.5 py-0.5 rounded-full uppercase">
                    {pc?.status || 'Online'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 font-mono mt-0.5">{pc?.ip_address} • {pc?.mac_address}</p>
              </div>
            </div>

            {/* Gauges (CPU, RAM, DISK) */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <Cpu className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">CPU Load</p>
                <p className="text-xl font-bold text-slate-900 font-mono mt-0.5">
                  {pc?.latest_metrics?.cpu_percent ?? 24}%
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <Layers className="w-4 h-4 text-purple-600 mx-auto mb-1" />
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">RAM Usage</p>
                <p className="text-xl font-bold text-slate-900 font-mono mt.0.5">
                  {pc?.latest_metrics?.ram_percent ?? 54}%
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-center">
                <HardDrive className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Disk Storage</p>
                <p className="text-xl font-bold text-slate-900 font-mono mt-0.5">
                  {pc?.latest_metrics?.disk_percent ?? 61}%
                </p>
              </div>
            </div>

            {/* System Info Details */}
            <div className="bg-slate-50/70 p-4 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Deskripsi / Spek</span>
                <span className="font-semibold text-slate-800">{pc?.description || 'Workstation Intel i5-12400'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Versi Agent Go</span>
                <span className="font-mono text-slate-800">{pc?.agent_version || 'v1.2.4 (winapi)'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">WoL Status</span>
                <span className="font-semibold text-emerald-600">Didukung (Magic Packet Enabled)</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-400">Pengguna Aktif</span>
                <span className="font-medium text-slate-800">{pc?.latest_metrics?.active_user || 'None (Standby)'}</span>
              </div>
            </div>

            {/* Power Events Table */}
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Riwayat Power & Booting</h4>
              <div className="border border-slate-100 rounded-2xl overflow-hidden divide-y divide-slate-50">
                {events.length === 0 ? (
                  <p className="text-xs text-slate-400 p-3 text-center">Belum ada catatan event</p>
                ) : (
                  events.map((ev) => (
                    <div key={ev.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50">
                      <div className="flex items-center gap-2">
                        <Activity className="w-3.5 h-3.5 text-blue-600" />
                        <span className="font-semibold text-slate-800 capitalize">{ev.event_type.replace('_', ' ')}</span>
                        <span className="text-slate-400 text-[11px]">oleh {ev.triggered_by}</span>
                      </div>
                      <span className="font-mono text-[10px] text-slate-400">{ev.created_at}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Single PC Action Bar */}
            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => onDispatchSingleCommand(pcId, 'lock')}
                className="px-3.5 py-2 rounded-2xl border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Kunci PC
              </button>
              <button
                onClick={() => onDispatchSingleCommand(pcId, 'reboot')}
                className="px-3.5 py-2 rounded-2xl border border-amber-200 text-xs font-semibold text-amber-700 hover:bg-amber-50"
              >
                Restart
              </button>
              <button
                onClick={() => onDispatchSingleCommand(pcId, 'shutdown')}
                className="px-3.5 py-2 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 hover:bg-rose-100"
              >
                Shutdown
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
