import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Monitor, CheckSquare, Square, Cpu, HardDrive, User, Info } from 'lucide-react';
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

  // Status badge styling helper
  const getStatusBadge = (status) => {
    switch (status) {
      case 'online':
        return {
          label: 'Online',
          dot: 'bg-emerald-500 ring-4 ring-emerald-50',
          badge: 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
        };
      case 'booting':
        return {
          label: 'Booting',
          dot: 'bg-amber-500 animate-pulse ring-4 ring-amber-50',
          badge: 'bg-amber-50 text-amber-700 border-amber-200/50',
        };
      case 'wake_failed':
        return {
          label: 'Gagal WoL',
          dot: 'bg-rose-500 ring-4 ring-rose-50',
          badge: 'bg-rose-50 text-rose-700 border-rose-200/50',
        };
      case 'offline_normal':
      case 'offline_abnormal':
      default:
        return {
          label: 'Offline',
          dot: 'bg-slate-300 ring-4 ring-slate-100',
          badge: 'bg-slate-50 text-slate-500 border-slate-200/50',
        };
    }
  };

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.03)] space-y-6">
      {/* Top Bar of Lab Matrix */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Lab Switcher Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          {labs.map((lab) => {
            const isSelected = selectedLabId === lab.id;
            return (
              <button
                key={lab.id}
                onClick={() => onSelectLab(lab.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-blue-600 text-white shadow-xs shadow-blue-500/30'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {lab.name.replace(/Laboratorium /, 'Lab ')}
              </button>
            );
          })}
        </div>

        {/* Status Filters & Selection Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Status filters */}
          <div className="flex items-center bg-slate-50 p-1 rounded-2xl border border-slate-100 text-xs">
            {[
              { id: 'all', label: 'Semua' },
              { id: 'online', label: 'Online' },
              { id: 'offline', label: 'Offline' },
              { id: 'warning', label: 'Bermasalah' },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilterStatus(f.id)}
                className={`px-2.5 py-1 rounded-xl font-medium transition-all ${
                  filterStatus === f.id
                    ? 'bg-white text-slate-900 shadow-xs font-semibold'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Bulk Select Button */}
          <button
            onClick={() => (allSelected ? onClearSelectPcs() : onSelectAllPcs(filteredPcs.map(p => p.id)))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl border border-slate-200/60 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            {allSelected ? (
              <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
            ) : (
              <Square className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>Pilih Semua</span>
          </button>

          {/* Action Trigger for Selected */}
          {selectedPcIds.length > 0 && (
            <button
              onClick={() => onOpenCommandModal('selected')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-blue-50 text-blue-700 border border-blue-200/60 text-xs font-semibold hover:bg-blue-100 transition-colors"
            >
              <span>Aksi Terpilih ({selectedPcIds.length})</span>
            </button>
          )}
        </div>
      </div>

      {/* Grid of 30 PCs in Lab Layout */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-6 gap-3.5">
        {filteredPcs.map((pc) => {
          const badge = getStatusBadge(pc.status);
          const isSelected = selectedPcIds.includes(pc.id);
          const isOnline = pc.status === 'online';

          return (
            <div
              key={pc.id}
              className={`group relative p-3.5 rounded-2xl border transition-all text-left flex flex-col justify-between h-32 select-none ${
                isSelected
                  ? 'bg-blue-50/60 border-blue-400 ring-2 ring-blue-500/20 shadow-xs'
                  : 'bg-white border-slate-100/90 hover:border-slate-300 hover:shadow-xs'
              }`}
            >
              {/* Card Header: Checkbox + Status Dot */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSelectPc(pc.id);
                  }}
                  className="p-1 -m-1 text-slate-400 hover:text-slate-600"
                >
                  {isSelected ? (
                    <CheckSquare className="w-4 h-4 text-blue-600" />
                  ) : (
                    <Square className="w-4 h-4 opacity-40 group-hover:opacity-100" />
                  )}
                </button>

                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${badge.dot}`} />
                  <span className="text-[10px] font-semibold text-slate-500 capitalize">{badge.label}</span>
                </div>
              </div>

              {/* PC Hostname & IP */}
              <div 
                className="cursor-pointer"
                onClick={() => onOpenPcDetail(pc.id)}
              >
                <div className="flex items-center gap-1.5">
                  <Monitor className={`w-3.5 h-3.5 ${isOnline ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                    {pc.hostname}
                  </span>
                </div>
                <p className="text-[10px] font-mono text-slate-400 mt-0.5 truncate">{pc.ip_address}</p>
              </div>

              {/* Bottom Quick Metrics / Active user */}
              <div 
                className="pt-2 border-t border-slate-50 flex items-center justify-between text-[10px] font-mono text-slate-500 cursor-pointer"
                onClick={() => onOpenPcDetail(pc.id)}
              >
                {isOnline ? (
                  <>
                    <span className="flex items-center gap-1 text-slate-600">
                      <Cpu className="w-3 h-3 text-slate-400" />
                      {pc.cpu_percent ?? 24}%
                    </span>
                    <span className="text-slate-400 truncate max-w-[60px]">
                      {pc.current_user || 'Standby'}
                    </span>
                  </>
                ) : (
                  <span className="text-slate-400 italic">Off</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
