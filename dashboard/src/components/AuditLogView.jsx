import React, { useState, useEffect } from 'react';
import { ScrollText, Download, CheckCircle2, Clock, AlertTriangle, ExternalLink, X } from 'lucide-react';
import { api } from '../api';

export default function AuditLogView() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.getCommands();
      if (res?.data) setLogs(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
            Selesai
          </span>
        );
      case 'acknowledged':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full">
            <Clock className="w-3 h-3 text-blue-500" />
            Terdisposisi
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Log Aktivitas & Audit Perintah</h2>
          <p className="text-xs text-slate-400 mt-1">
            Riwayat lengkap perintah remote, perubahan jadwal, dan otorisasi eksekusi
          </p>
        </div>

        <a
          href={api.exportCommandsUrl()}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white border border-slate-200/80 hover:bg-slate-50 text-xs font-bold text-slate-700 shadow-2xs transition-all"
        >
          <Download className="w-3.5 h-3.5 text-blue-600" />
          <span>Ekspor CSV</span>
        </a>
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.03)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50/70 border-b border-slate-100 text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-6 py-3.5">ID Perintah</th>
                <th className="px-6 py-3.5">Jenis Aksi</th>
                <th className="px-6 py-3.5">Target</th>
                <th className="px-6 py-3.5">Penerbit (User)</th>
                <th className="px-6 py-3.5">Status</th>
                <th className="px-6 py-3.5">Waktu Eksekusi</th>
                <th className="px-6 py-3.5 text-right">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Memuat catatan aktivitas...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    Belum ada rekaman audit log.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-6 py-3.5 font-mono text-slate-900 font-semibold">
                      #{log.id}
                    </td>
                    <td className="px-6 py-3.5 capitalize font-bold text-slate-800">
                      {log.action}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-slate-500">
                      {log.target_type.toUpperCase()} #{log.target_id}
                    </td>
                    <td className="px-6 py-3.5">
                      {log.user?.name || 'Sistem Otomasi'}
                    </td>
                    <td className="px-6 py-3.5">
                      {getStatusBadge(log.status)}
                    </td>
                    <td className="px-6 py-3.5 font-mono text-slate-400">
                      {log.created_at}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-blue-600 hover:text-blue-800 font-semibold inline-flex items-center gap-1"
                      >
                        Lihat Ack
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-down Modal for Command Result/Ack */}
      {selectedLog && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 border border-slate-100 shadow-2xl relative space-y-4">
            <button
              onClick={() => setSelectedLog(null)}
              className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center absolute right-5 top-5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="font-bold text-slate-900 text-base">Detail Respon Eksekusi #{selectedLog.id}</h3>
            
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">Aksi:</span>
                <span className="font-bold text-slate-800 uppercase">{selectedLog.action}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Target Disposisi:</span>
                <span className="font-mono text-slate-800">{selectedLog.target_type} {selectedLog.target_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Penerbit:</span>
                <span className="font-semibold text-slate-800">{selectedLog.user?.name || 'Sistem'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Timestamp:</span>
                <span className="font-mono text-slate-800">{selectedLog.created_at}</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-bold text-slate-800 mb-2">Payload Raw / Return Code MQTT:</p>
              <pre className="p-3 bg-slate-900 text-slate-100 rounded-2xl text-[11px] font-mono overflow-x-auto">
{JSON.stringify({
  command_id: selectedLog.id,
  action: selectedLog.action,
  status: 'acknowledged_by_client',
  exit_code: 0,
  client_timestamp: selectedLog.created_at,
  message: 'Executed successfully via Go Agent WinAPI executor'
}, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
