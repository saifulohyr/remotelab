import React, { useState } from 'react';
import { 
  Zap, 
  Lock, 
  MessageSquare, 
  RotateCw, 
  Power, 
  AlertTriangle 
} from 'lucide-react';

export default function QuickActions({ onTriggerAction, selectedCount = 0, onlineCount = 0 }) {
  const [confirmModal, setConfirmModal] = useState(null); // { action, label, isDangerous }
  const [countdown, setCountdown] = useState(5);
  const [timerId, setTimerId] = useState(null);

  const actions = [
    { id: 'wake', label: 'Wake-on-LAN', icon: Zap, isDangerous: false },
    { id: 'lock', label: 'Kunci Sesi', icon: Lock, isDangerous: false },
    { id: 'message', label: 'Broadcast Pesan', icon: MessageSquare, isDangerous: false },
    { id: 'reboot', label: 'Restart Node', icon: RotateCw, isDangerous: true },
    { id: 'shutdown', label: 'Matikan Daya', icon: Power, isDangerous: true },
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
      <div className="bg-white rounded-xl p-4 border border-zinc-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-4 font-sans">
        <div className="flex items-center gap-3">
          <div className="h-8 w-1 bg-zinc-900 rounded-full" />
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold text-zinc-900 tracking-tight">KONTROL DISPATCHER</h4>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 border border-zinc-200/60">
                MQTT TOPIC /cmd
              </span>
            </div>
            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
              {selectedCount > 0 ? `Target terpilih: ${selectedCount} node spesifik` : 'Target broadcast: Seluruh node di lab aktif'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {actions.map((act) => {
            const Icon = act.icon;
            const isTargetOffline = selectedCount > 0 ? false : (onlineCount === 0 && act.id !== 'wake');
            return (
              <button
                key={act.id}
                disabled={isTargetOffline}
                onClick={() => handleActionClick(act)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  isTargetOffline
                    ? 'border-zinc-200 text-zinc-300 bg-zinc-50 cursor-not-allowed opacity-60'
                    : act.isDangerous
                    ? 'border-zinc-300 text-zinc-700 hover:border-zinc-900 hover:text-zinc-950 hover:bg-zinc-50'
                    : 'border-zinc-200 text-zinc-800 bg-white hover:bg-zinc-50 hover:border-zinc-300'
                }`}
              >
                <Icon className="w-3.5 h-3.5 text-zinc-500" />
                <span>{act.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl border border-zinc-200 shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center gap-3 text-zinc-900">
              <div className="w-9 h-9 rounded-lg bg-zinc-100 flex items-center justify-center text-zinc-900 border border-zinc-200">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-zinc-900">Konfirmasi Eksekusi Perintah</h3>
                <p className="text-xs text-zinc-500 font-mono">Aksi: {confirmModal.label}</p>
              </div>
            </div>

            <p className="text-xs text-zinc-600 leading-relaxed">
              Perintah ini akan dikirimkan ke agen yang aktif. Proses aktif yang belum tersimpan di workstation tujuan dapat terhenti secara paksa.
            </p>

            <div className="bg-zinc-50 p-3 rounded-lg border border-zinc-200/80 text-xs font-mono text-zinc-600">
              Payload: <span className="font-semibold text-zinc-900">{`cmd/${confirmModal.id}`}</span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={handleCancel}
                className="px-3.5 py-1.5 rounded-lg border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                Batalkan
              </button>
              <button
                disabled={countdown > 0}
                onClick={handleConfirm}
                className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  countdown > 0
                    ? 'bg-zinc-200 text-zinc-400 cursor-not-allowed font-mono'
                    : 'bg-zinc-900 hover:bg-zinc-800 text-white'
                }`}
              >
                {countdown > 0 ? `Menunggu (${countdown}s)` : 'Eksekusi Sekarang'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
