import React from 'react';
import { 
  Boxes, 
  Cpu, 
  Calendar, 
  Terminal, 
  ChevronRight,
  Shield,
  Layers
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, selectedLabId, setSelectedLabId, labs = [] }) {
  const navItems = [
    { id: 'overview', label: 'Ringkasan', icon: Boxes },
    { id: 'devices', label: 'Node Perangkat', icon: Cpu },
    { id: 'schedules', label: 'Jadwal Daya', icon: Calendar },
    { id: 'logs', label: 'Audit Trail', icon: Terminal },
  ];

  return (
    <aside className="w-64 bg-[#fafafa] border-r border-zinc-200/80 flex flex-col justify-between p-5 min-h-screen shrink-0 sticky top-0 h-screen select-none font-sans">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-3 py-3 mb-6 border-b border-zinc-200/60 pb-5">
          <div className="w-8 h-8 rounded-lg bg-zinc-950 flex items-center justify-center text-zinc-100 shadow-xs">
            <Layers className="w-4 h-4 text-zinc-200" />
          </div>
          <div>
            <h1 className="font-semibold text-zinc-900 text-sm tracking-tight leading-none flex items-center gap-1.5">
              SIMLab
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-200/70 text-zinc-700 font-normal">v14</span>
            </h1>
            <p className="text-[11px] text-zinc-400 mt-1 font-mono tracking-tight">labmuma.xyz/simlab</p>
          </div>
        </div>

        {/* Main Navigation */}
        <div className="space-y-1">
          <p className="px-3 text-[10px] font-mono font-medium text-zinc-400 uppercase tracking-wider mb-2">Navigasi</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-zinc-900 text-white font-medium shadow-2xs'
                    : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-zinc-200' : 'text-zinc-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Labs Quick Navigation */}
        <div className="mt-8">
          <div className="flex items-center justify-between px-3 mb-2">
            <p className="text-[10px] font-mono font-medium text-zinc-400 uppercase tracking-wider">Klaster Lab</p>
            <span className="text-[10px] font-mono text-zinc-500">01–06</span>
          </div>
          <div className="space-y-0.5">
            {labs.map((lab) => {
              const isSelected = activeTab === 'lab_detail' && selectedLabId === lab.id;
              return (
                <button
                  key={lab.id}
                  onClick={() => {
                    setSelectedLabId(lab.id);
                    setActiveTab('lab_detail');
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors text-left font-mono ${
                    isSelected
                      ? 'bg-zinc-200/80 text-zinc-950 font-semibold'
                      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-zinc-950' : 'bg-zinc-300'}`} />
                    <span className="truncate">{lab.name.replace(/Laboratorium /, 'LAB-')}</span>
                  </div>
                  <ChevronRight className={`w-3.5 h-3.5 ${isSelected ? 'text-zinc-800' : 'text-zinc-300'}`} />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* System Status Panel */}
      <div className="border-t border-zinc-200/70 pt-4 px-2 space-y-3">
        <div className="p-3 bg-white rounded-lg border border-zinc-200/80">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Gateway
            </span>
            <span className="text-[10px] font-mono text-zinc-400">MQTT :8883</span>
          </div>
          <p className="text-xs font-mono font-medium text-zinc-800">TLS 1.3 Aktif</p>
        </div>

        <div className="flex items-center gap-2 px-1 text-[11px] text-zinc-400 font-mono">
          <Shield className="w-3.5 h-3.5 text-zinc-400" />
          <span>RBAC Mode: Enforced</span>
        </div>
      </div>
    </aside>
  );
}
