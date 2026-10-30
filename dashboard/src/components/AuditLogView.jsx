import React, { useState, useEffect } from 'react';
import { Download, CheckCircle2, Clock, AlertTriangle, X, Terminal, ChevronRight } from 'lucide-react';
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
      if (res?.data) {
        // If paginated response (data.data) or array (data)
        const items = Array.isArray(res.data) ? res.data : (res.data.data || []);
        setLogs(items);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
      case 'executed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Selesai
          </span>
        );
      case 'acknowledged':
      case 'delivered':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-700 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded">
            <Clock className="w-3 h-3 text-zinc-500" />
            Terkirim
          </span>
        );
      case 'failed':
      case 'rejected_expired':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-700 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded">
            <AlertTriangle className="w-3 h-3 text-rose-600" />
            Gagal
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-600 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded">
            {status || 'pending'}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-900 tracking-tight">Audit Log & Riwayat Eksekusi</h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Riwayat lengkap perintah dispatcher, status delivery, dan output terminal node klien
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchLogs}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-colors"
          >
            Refresh
          </button>
          <a
            href={api.exportCommandsUrl()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-colors"
          >
            <Download className="w-3.5 h-3.5 text-zinc-600" />
            <span>Ekspor CSV</span>
          </a>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-50/70 border-b border-zinc-200 text-zinc-500 font-semibold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-4 py-3">ID / Ref</th>
                <th className="px-4 py-3">Aksi</th>
                <th className="px-4 py-3">Target</th>
                <th className="px-4 py-3">Penerbit</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Waktu</th>
                <th className="px-4 py-3 text-right">Hasil Node</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 font-normal text-zinc-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-zinc-400 font-mono">
                    Memuat riwayat eksekusi...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-zinc-400">
                    Belum ada rekaman eksekusi perintah.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-zinc-50/70 transition-colors">
                    <td className="px-4 py-3 font-mono text-zinc-900 font-medium">
                      #{log.id}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-900">
                      <span className="font-mono bg-zinc-100 text-zinc-800 px-1.5 py-0.5 rounded border border-zinc-200">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-600 text-[11px]">
                      {log.target_type?.toUpperCase()} #{log.target_id}
                    </td>
                    <td className="px-4 py-3 text-zinc-800">
                      {log.user?.name || 'Otomasi Sistem'}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(log.status)}
                    </td>
                    <td className="px-4 py-3 font-mono text-zinc-400 text-[11px]">
                      {log.created_at}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-zinc-900 hover:text-zinc-600 font-medium inline-flex items-center gap-1 border border-zinc-200 bg-white hover:bg-zinc-50 px-2.5 py-1 rounded text-xs transition-colors"
                      >
                        <span>Lihat Output</span>
                        <ChevronRight className="w-3 h-3 text-zinc-400" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Drill-down Modal for Command Execution Results */}
      {selectedLog && (
        <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
          <div className="bg-white rounded-xl max-w-xl w-full p-6 border border-zinc-200 shadow-xl relative space-y-4 max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setSelectedLog(null)}
              className="w-8 h-8 rounded-lg border border-zinc-200 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 flex items-center justify-center absolute right-5 top-5 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div>
              <h3 className="font-semibold text-zinc-900 text-sm">Hasil Eksekusi Perintah #{selectedLog.id}</h3>
              <p className="text-xs text-zinc-500 font-mono mt-0.5">Command ID: {selectedLog.command_id || '-'}</p>
            </div>
            
            <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-zinc-500">Aksi:</span>
                <span className="font-mono font-semibold text-zinc-900">{selectedLog.action}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Target Disposisi:</span>
                <span className="font-mono text-zinc-800">{selectedLog.target_type} #{selectedLog.target_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Penerbit:</span>
                <span className="text-zinc-800">{selectedLog.user?.name || 'Sistem'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">Waktu Dikeluarkan:</span>
                <span className="font-mono text-zinc-700">{selectedLog.created_at}</span>
              </div>
              {selectedLog.params && Object.keys(selectedLog.params).length > 0 && (
                <div className="pt-1 border-t border-zinc-200/60">
                  <span className="text-zinc-500 block mb-1">Parameter:</span>
                  <pre className="font-mono text-[11px] bg-white p-2 rounded border border-zinc-200 text-zinc-800 overflow-x-auto">
                    {JSON.stringify(selectedLog.params, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold text-zinc-800 mb-2">Laporan Respon Node Klien:</p>
              {(!selectedLog.results || selectedLog.results.length === 0) ? (
                <div className="p-4 rounded-lg bg-zinc-50 border border-zinc-200 text-center text-xs text-zinc-500">
                  Belum ada laporan ACK yang diterima dari node target.
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedLog.results.map((res) => (
                    <div key={res.id} className="border border-zinc-200 rounded-lg p-3 space-y-2 bg-white">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-zinc-900 font-mono">
                          {res.pc?.hostname || `Node #${res.pc_id}`}
                        </span>
                        {getStatusBadge(res.status)}
                      </div>

                      {res.executed_at && (
                        <p className="text-[11px] text-zinc-500 font-mono">
                          Dieksekusi pada: {res.executed_at}
                        </p>
                      )}

                      {res.error_message && (
                        <div className="text-[11px] font-mono text-rose-700 bg-rose-50 p-2 rounded border border-rose-200">
                          {res.error_message}
                        </div>
                      )}

                      {res.output && (
                        <div>
                          <span className="text-[10px] font-medium text-zinc-500 block mb-1">Terminal Output (stdout/stderr):</span>
                          <pre className="p-2.5 bg-zinc-900 text-zinc-100 rounded-lg text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                            {res.output}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
