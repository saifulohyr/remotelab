import React, { useState } from 'react';
import { X, Send, MessageSquare, AlertCircle } from 'lucide-react';
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
      },
      reason: 'Instruksi admin via Dashboard V14',
    };

    try {
      await api.dispatchCommand(payload);
      setStatusMsg({ type: 'success', text: 'Perintah berhasil dikirim ke antrean broker MQTT!' });
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1200);
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Gagal mengirim perintah' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-lg w-full p-6 border border-slate-100 shadow-2xl relative">
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center absolute right-5 top-5 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center">
            <MessageSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Kirim Perintah Remote</h3>
            <p className="text-xs text-slate-400">Target: {targetType.toUpperCase()} #{targetId}</p>
          </div>
        </div>

        {statusMsg && (
          <div className={`p-3 rounded-2xl text-xs font-semibold mb-4 flex items-center gap-2 ${
            statusMsg.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
          }`}>
            <AlertCircle className="w-4 h-4" />
            <span>{statusMsg.text}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Jenis Tindakan</label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200/60 rounded-2xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="message">Kirim Pesan Pop-up Layar</option>
              <option value="lock">Kunci Layar (Lock Screen)</option>
              <option value="logoff">Logoff Pengguna</option>
              <option value="reboot">Restart Komputer</option>
              <option value="shutdown">Matikan Komputer (Shutdown)</option>
              <option value="wake">Wake on LAN (WoL)</option>
            </select>
          </div>

          {action === 'message' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Judul Pop-up Pesan</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/60 rounded-2xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Isi Pesan Layar</label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/60 rounded-2xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  required
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Jeda Waktu Eksekusi (Detik)</label>
            <input
              type="number"
              min="0"
              max="3600"
              value={delay}
              onChange={(e) => setDelay(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200/60 rounded-2xl px-3.5 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">Beri waktu bagi pengguna untuk membaca atau menyimpan pekerjaan.</span>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-2xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-1.5 px-5 py-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'Mengirim...' : 'Kirim Sekarang'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
