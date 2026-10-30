import React, { useState } from 'react';
import { X, Send, Terminal, AlertCircle, CheckCircle2 } from 'lucide-react';
import { api } from '../api';

export default function CommandModal({ 
  isOpen, 
  onClose, 
  targetType = 'lab', 
  targetId = 1, 
  initialAction = 'message',
  onSuccess 
}) {
  const [action, setAction] = useState(initialAction);
  const [title, setTitle] = useState('Pemberitahuan Laboratorium');
  const [message, setMessage] = useState('Praktikum akan segera berakhir dalam 15 menit. Harap simpan semua pekerjaan.');
  const [script, setScript] = useState('ipconfig /flushdns');
  const [shell, setShell] = useState('powershell');
  const [delay, setDelay] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);

    const payload = {
      action,
      target_type: targetType,
      target_id: targetId,
      params: {
        delay: parseInt(delay, 10) || 0,
        title: action === 'message' ? title : undefined,
        message: action === 'message' ? message : undefined,
        script: action === 'run_script' ? script : undefined,
        shell: action === 'run_script' ? shell : undefined,
      },
      reason: 'Instruksi admin via Dashboard Web Console',
    };

    try {
      await api.dispatchCommand(payload);
      setStatusMsg({ type: 'success', text: 'Perintah berhasil didispatch ke antrean node!' });
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1000);
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Gagal mengirim perintah' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-zinc-950/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans">
      <div className="bg-white rounded-xl max-w-lg w-full p-6 border border-zinc-200 shadow-xl relative">
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg border border-zinc-200 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 flex items-center justify-center absolute right-5 top-5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-zinc-100 text-zinc-900 border border-zinc-200 flex items-center justify-center">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Dispatcher Perintah Remote</h3>
            <p className="text-xs text-zinc-500 font-mono">Target: {targetType.toUpperCase()} #{targetId}</p>
          </div>
        </div>

        {statusMsg && (
          <div className={`p-3 rounded-lg text-xs font-medium mb-4 flex items-center gap-2 border ${
            statusMsg.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1">Aksi Perintah</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            >
              <option value="run_script">Remote Script Runner (PowerShell / CMD)</option>
              <option value="message">Kirim Pesan Pop-up Layar</option>
              <option value="lock">Kunci Layar (Lock Screen)</option>
              <option value="logoff">Logoff Pengguna Aktif</option>
              <option value="reboot">Restart Node</option>
              <option value="shutdown">Matikan Daya (Shutdown)</option>
              <option value="wake">Wake-on-LAN (WoL Magic Packet)</option>
            </select>
          </div>

          {action === 'run_script' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Shell Interpreter</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
                    <input 
                      type="radio" 
                      name="shell" 
                      value="powershell" 
                      checked={shell === 'powershell'} 
                      onChange={() => setShell('powershell')} 
                      className="accent-zinc-900"
                    />
                    PowerShell
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-700 cursor-pointer">
                    <input 
                      type="radio" 
                      name="shell" 
                      value="cmd" 
                      checked={shell === 'cmd'} 
                      onChange={() => setShell('cmd')} 
                      className="accent-zinc-900"
                    />
                    Command Prompt (cmd.exe)
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Skrip / Perintah CLI</label>
                <textarea
                  rows={4}
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                  placeholder="e.g. ipconfig /flushdns&#10;Get-Process | Sort-Object CPU -Descending | Select-Object -First 10"
                  className="w-full font-mono bg-zinc-900 text-zinc-100 rounded-lg p-3 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-700"
                  required
                />
                <span className="text-[10px] text-zinc-500 mt-1 block">Output eksekusi (stdout/stderr) tersimpan di tab Riwayat Audit.</span>
              </div>
            </>
          )}

          {action === 'message' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Judul Pesan</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1">Isi Pesan Layar</label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  required
                />
              </div>
            </>
          )}

          {['shutdown', 'reboot', 'message'].includes(action) && (
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">Jeda Waktu Eksekusi (Detik)</label>
              <input
                type="number"
                min="0"
                max="3600"
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
              <span className="text-[10px] text-zinc-500 mt-1 block">Waktu jeda sebelum proses dieksekusi di workstation.</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'Mengirim...' : 'Eksekusi Perintah'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
