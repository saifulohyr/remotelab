import React from 'react';
import { Activity } from 'lucide-react';

export default function LabUsageChart({ onlineCount = 0 }) {
  // If zero real telemetry has been recorded yet, show genuine awaiting-telemetry state
  const hasTelemetry = false;

  return (
    <div className="bg-white rounded-xl p-6 border border-zinc-200/90 shadow-2xs font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-zinc-900 text-sm">UTILISASI OPERASIONAL WORKSTATION</h3>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">
              AGGREGATE (JAM/HARI)
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 font-mono">
            Histori durasi komputasi aktif seluruh node workstation di laboratorium
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-xs font-mono text-zinc-500">
          <Activity className="w-3.5 h-3.5 text-zinc-400" />
          <span>Periode: 14 Hari Terakhir</span>
        </div>
      </div>

      {/* Chart Area */}
      <div className="h-44 border border-dashed border-zinc-200 rounded-lg flex flex-col items-center justify-center p-6 text-center bg-zinc-50/40">
        <div className="w-9 h-9 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-400 mb-2.5">
          <Activity className="w-4 h-4" />
        </div>
        <p className="text-xs font-medium text-zinc-700">Belum Ada Riwayat Metrik Komputasi</p>
        <p className="text-[11px] text-zinc-400 font-mono mt-1 max-w-md">
          Grafik akan terisi otomatis setelah agen klien fisik aktif mengirimkan denyut telemetri CPU & RAM via MQTT broker.
        </p>
      </div>

      <div className="flex items-center justify-between pt-3 text-[11px] font-mono text-zinc-400">
        <span>Node online saat ini: {onlineCount} unit</span>
        <span>Sampling interval: 30 detik (cron aggregator)</span>
      </div>
    </div>
  );
}
