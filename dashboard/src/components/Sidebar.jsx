import React from 'react';
import { 
  LayoutDashboard, 
  Monitor, 
  CalendarClock, 
  HardDrive, 
  ScrollText, 
  ChevronRight,
  ShieldCheck,
  Server
} from 'lucide-react';

export default function Sidebar({ activeTab, setActiveTab, selectedLabId, setSelectedLabId, labs = [] }) {
  const navItems = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'devices', label: 'Perangkat', icon: HardDrive },
    { id: 'schedules', label: 'Jadwal Daya', icon: CalendarClock },
    { id: 'logs', label: 'Log Aktivitas', icon: ScrollText },
  ];

  return (
    <aside className="w-64 bg-white/90 backdrop-blur-md border-r border-slate-100 flex flex-col justify-between p-5 min-h-screen shrink-0 sticky top-0 h-screen select-none">
      <div>
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-3 py-2 mb-8">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-900 text-lg tracking-tight leading-none">SIMLab</h1>
            <p className="text-[11px] font-medium text-slate-400 mt-1 uppercase tracking-wider">Remote Lab V14</p>
          </div>
        </div>

        {/* Main Navigation */}
        <div className="space-y-1.5">
          <p className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Menu Utama</p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-medium transition-all duration-200 text-left ${
                  isActive
                    ? 'bg-blue-50 text-blue-600 font-semibold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 transition-colors ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Labs Quick Navigation */}
        <div className="mt-8">
          <div className="flex items-center justify-between px-3 mb-2">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ruang Lab (1–6)</p>
            <span className="text-[10px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">6 Lab</span>
          </div>
          <div className="space-y-1">
            {labs.map((lab) => {
              const isSelected = activeTab === 'lab_detail' && selectedLabId === lab.id;
              return (
                <button
                  key={lab.id}
                  onClick={() => {
                    setSelectedLabId(lab.id);
                    setActiveTab('lab_detail');
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2 rounded-2xl text-xs font-medium transition-all text-left ${
                    isSelected
                      ? 'bg-blue-50 text-blue-600 font-semibold'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className={`w-2 h-2 rounded-full ${lab.online_count > 25 ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    <span className="truncate">{lab.name.replace(/Laboratorium \d+ /, '') || `Lab ${lab.id}`}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">
                    {lab.online_count ?? 28}/30
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100/80">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-700">
          <ShieldCheck className="w-4 h-4 text-emerald-500" />
          <span>Broker MQTT Aktif</span>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">1883 TCP • Latensi: 8ms</p>
      </div>
    </aside>
  );
}
