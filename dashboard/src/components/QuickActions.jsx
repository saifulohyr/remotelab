import React, { useState } from 'react';
import { 
  Power, 
  RotateCcw, 
  Lock, 
  MessageSquare, 
  Zap, 
  AlertTriangle 
} from 'lucide-react';

export default function QuickActions({ onTriggerAction, selectedCount = 0 }) {
  const [confirmModal, setConfirmModal] = useState(null); // { action, label, isDangerous }
  const [countdown, setCountdown] = useState(5);
  const [timerId, setTimerId] = useState(null);

  const actions = [
    { id: 'wake', label: 'Nyalakan (WoL)', icon: Zap, color: 'hover:border-emerald-300 hover:text-emerald-700', isDangerous: false },
    { id: 'lock', label: 'Kunci Layar', icon: Lock, color: 'hover:border-purple-300 hover:text-purple-700', isDangerous: false },
    { id: 'message', label: 'Kirim Pesan', icon: MessageSquare, color: 'hover:border-blue-300 hover:text-blue-700', isDangerous: false },
    { id: 'reboot', label: 'Restart', icon: RotateCcw, color: 'hover:border-amber-300 hover:text-amber-700', isDangerous: true },
    { id: 'shutdown', label: 'Matikan (Shutdown)', icon: Power, color: 'hover:border-rose-300 hover:text-rose-700', isDangerous: true },
  ];

  const handleActionClick = (act) => {
    if (act.isDangerous) {
      setConfirmModal(act);
      setCountdown(5);
      const interval = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(interval);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      setTimerId(interval);
    } else {
      onTriggerAction(act.id);
    }
  };

  const handleConfirm = () => {
    if (timerId) clearInterval(timerId);
    if (confirmModal) {
      onTriggerAction(confirmModal.id);
      setConfirmModal(null);
    }
  };

  const handleCancel = () => {
    if (timerId) clearInterval(timerId);
    setConfirmModal(null);
  };

  return (
    <>
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.03)] flex flex-wrap items-center justify-between gap-4">
        <div>
          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Aksi Cepat Remote</h4>
          <p className="text-[11px] text-slate-400 mt-0.5">
            {selectedCount > 0 ? `Target: ${selectedCount} PC terpilih` : 'Target: Seluruh PC di lab aktif'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.id}
                onClick={() => handleActionClick(act)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border border-slate-200/70 text-xs font-semibold text-slate-700 bg-white shadow-2xs hover:shadow-xs transition-all ${act.color}`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{act.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Safety Safeguard Modal: 5-Second Countdown */}
      {confirmModal && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-2xl bg-rose-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Konfirmasi Tindakan Kritis</h3>
                <p className="text-xs text-slate-500">Aksi massal memerlukan verifikasi keselamatan</p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl text-xs text-slate-600 border border-slate-100">
              Anda akan mengeksekusi <span className="font-bold text-slate-900">{confirmModal.label}</span> pada{' '}
              <span className="font-bold text-slate-900">
                {selectedCount > 0 ? `${selectedCount} PC terpilih` : 'seluruh PC lab'}
              </span>
              . Praktikan yang sedang bekerja dapat kehilangan data sesi jika belum disimpan.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={handleCancel}
                className="px-4 py-2 rounded-2xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Batal
              </button>
              <button
                disabled={countdown > 0}
                onClick={handleConfirm}
                className={`px-5 py-2 rounded-2xl text-xs font-bold text-white transition-all ${
                  countdown > 0
                    ? 'bg-rose-300 cursor-not-allowed'
                    : 'bg-rose-600 hover:bg-rose-700 shadow-md shadow-rose-500/20'
                }`}
              >
                {countdown > 0 ? `Tunggu (${countdown}s)` : 'Lanjutkan Eksekusi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
