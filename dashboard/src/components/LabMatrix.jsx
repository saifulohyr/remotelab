import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Square, 
  CheckSquare, 
  Activity, 
  Terminal 
} from 'lucide-react';
import { itemFadeUpVariant } from '../motion';

export default function LabMatrix({ 
  labs = [], 
  selectedLabId, 
  onSelectLab, 
  pcs = [], 
  onOpenPcDetail,
  selectedPcIds = [],
  onToggleSelectPc,
  onSelectAllPcs,
  onClearSelectPcs,
  onOpenCommandModal
}) {
  const [filterStatus, setFilterStatus] = useState('all');

  const filteredPcs = pcs.filter((pc) => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'online') return pc.status === 'online';
    if (filterStatus === 'offline') return pc.status?.startsWith('offline');
    if (filterStatus === 'warning') return pc.status === 'booting' || pc.status === 'wake_failed';
    return true;
  });

  const allSelected = filteredPcs.length > 0 && filteredPcs.every(p => selectedPcIds.includes(p.id));

  const getStatusBadge = (status) => {
    switch (status) {
      case 'online':
        return {
          label: 'ONLINE',
          indicator: 'bg-emerald-500',
          badge: 'bg-emerald-50/80 text-emerald-700 border-emerald-200/60',
        };
      case 'booting':
        return {
          label: 'BOOTING',
          indicator: 'bg-amber-500 animate-pulse',
          badge: 'bg-amber-50 text-amber-800 border-amber-200/60',
        };
      case 'wake_failed':
        return {
          label: 'FAIL WoL',
          indicator: 'bg-rose-500',
          badge: 'bg-rose-50 text-rose-700 border-rose-200/60',
        };
      case 'offline_normal':
      case 'offline_abnormal':
      default:
        return {
          label: 'STANDBY',
          indicator: 'bg-zinc-300',
          badge: 'bg-zinc-100 text-zinc-500 border-zinc-200/60',
        };
    }
  };

  return (
    <div className="bg-white rounded-xl p-6 border border-zinc-200/90 shadow-2xs space-y-6">
      {/* Top Bar of Lab Matrix */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-zinc-100 pb-5">
        {/* Lab Switcher Tabs */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
          {labs.map((lab) => {
            const isSelected = selectedLabId === lab.id;
            return (
              <button
                key={lab.id}
                onClick={() => onSelectLab(lab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors whitespace-nowrap ${
                  isSelected
                    ? 'bg-zinc-900 text-white font-medium shadow-2xs'
                    : 'bg-zinc-100/70 text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                }`}
              >
                {lab.name.replace(/Laboratorium /, 'LAB-')}
              </button>
            );
          })}
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 text-xs font-mono">
          <span className="text-zinc-400 mr-1 text-[11px]">FILTER:</span>
          {[
            { id: 'all', label: 'SEMUA' },
            { id: 'online', label: 'ONLINE' },
            { id: 'offline', label: 'OFFLINE' },
            { id: 'warning', label: 'PERIKSA' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilterStatus(f.id)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-mono transition-colors ${
                filterStatus === f.id
                  ? 'bg-zinc-200 text-zinc-900 font-semibold'
                  : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Bulk Selection Actions */}
      <div className="flex items-center justify-between text-xs text-zinc-500 border-b border-zinc-100 pb-3 font-mono">
        <div className="flex items-center gap-2">
          <button
            onClick={() => allSelected ? onClearSelectPcs() : onSelectAllPcs(filteredPcs.map(p => p.id))}
            className="flex items-center gap-1.5 text-zinc-700 hover:text-zinc-950 font-medium"
          >
            {allSelected ? (
              <CheckSquare className="w-4 h-4 text-zinc-900" />
            ) : (
              <Square className="w-4 h-4 text-zinc-400" />
            )}
            <span>{allSelected ? 'Batal Pilih Semua' : 'Pilih Semua Node Terfilter'}</span>
          </button>
          <span className="text-zinc-300">|</span>
          <span>{filteredPcs.length} Node Ditemukan</span>
        </div>

        {selectedPcIds.length > 0 && (
          <div className="flex items-center gap-3">
            <span className="text-zinc-900 font-medium">
              {selectedPcIds.length} node terpilih
            </span>
            <button
              onClick={() => onOpenCommandModal && onOpenCommandModal()}
              className="px-2.5 py-1 rounded bg-zinc-900 text-white text-[11px] font-medium hover:bg-zinc-800 transition-colors flex items-center gap-1"
            >
              <Terminal className="w-3 h-3" />
              <span>Kirim Batch Perintah</span>
            </button>
          </div>
        )}
      </div>

      {/* Matrix Grid (Node Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3.5">
        {filteredPcs.map((pc) => {
          const isSelected = selectedPcIds.includes(pc.id);
          const st = getStatusBadge(pc.status);
          const isOnline = pc.status === 'online';

          return (
            <motion.div
              key={pc.id}
              variants={itemFadeUpVariant}
              onClick={() => onOpenPcDetail(pc.id)}
              className={`rounded-lg border p-3.5 transition-all cursor-pointer relative bg-white hover:border-zinc-400 ${
                isSelected ? 'border-zinc-900 ring-1 ring-zinc-900 bg-zinc-50/40' : 'border-zinc-200'
              }`}
            >
              {/* Checkbox selector */}
              <div 
                className="absolute top-3 right-3 z-10"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelectPc(pc.id);
                }}
              >
                {isSelected ? (
                  <CheckSquare className="w-4 h-4 text-zinc-900" />
                ) : (
                  <Square className="w-4 h-4 text-zinc-300 hover:text-zinc-500" />
                )}
              </div>

              {/* Node Header */}
              <div className="flex items-center gap-2 mb-2 pr-6">
                <span className={`w-2 h-2 rounded-full ${st.indicator} shrink-0`} />
                <h5 className="font-mono font-semibold text-xs text-zinc-900 truncate">
                  {pc.hostname || pc.pc_code}
                </h5>
              </div>

              {/* Network specs in mono */}
              <div className="space-y-1 my-2.5 font-mono text-[11px] text-zinc-600 bg-zinc-50 p-2 rounded border border-zinc-100">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">IP:</span>
                  <span className="text-zinc-800">{pc.ip_address || '—'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">MAC:</span>
                  <span className="text-zinc-500 text-[10px]">{pc.mac_address || '—'}</span>
                </div>
              </div>

              {/* Status pill & metrics */}
              <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-[10px] font-mono">
                <span className={`px-1.5 py-0.5 rounded border ${st.badge}`}>
                  {st.label}
                </span>

                {isOnline && pc.cpu_usage !== undefined ? (
                  <span className="text-zinc-600 flex items-center gap-1">
                    <Activity className="w-3 h-3 text-zinc-400" />
                    CPU {pc.cpu_usage}%
                  </span>
                ) : (
                  <span className="text-zinc-400">
                    {pc.seat_number ? `Seat #${pc.seat_number}` : 'Node Standby'}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
