import React from 'react';
import { motion } from 'framer-motion';
import { 
  Cpu, 
  CheckCircle2, 
  AlertCircle, 
  PowerOff 
} from 'lucide-react';
import { itemFadeUpVariant } from '../motion';

export default function KpiCards({ totalPcs = 0, onlineCount = 0, offlineCount = 0, warningCount = 0 }) {
  const cards = [
    {
      title: 'Total Node',
      value: totalPcs,
      code: 'NODE_ALL',
      subtext: 'Terdaftar di 6 Lab',
      icon: Cpu,
      accent: 'border-zinc-200 bg-white text-zinc-900',
      badge: 'bg-zinc-100 text-zinc-700',
      status: 'TERDAFTAR'
    },
    {
      title: 'Online Aktif',
      value: onlineCount,
      code: 'STATUS_RUN',
      subtext: `${totalPcs > 0 ? Math.round((onlineCount / totalPcs) * 100) : 0}% kapasitas aktif`,
      icon: CheckCircle2,
      accent: 'border-zinc-200 bg-white text-zinc-900',
      badge: 'bg-emerald-50 text-emerald-700 border border-emerald-200/50',
      status: 'NORMAL'
    },
    {
      title: 'Offline / Standby',
      value: offlineCount,
      code: 'STATUS_OFF',
      subtext: 'Siap menerima WoL',
      icon: PowerOff,
      accent: 'border-zinc-200 bg-white text-zinc-900',
      badge: 'bg-zinc-100 text-zinc-600',
      status: 'STANDBY'
    },
    {
      title: 'Insiden / Booting',
      value: warningCount,
      code: 'STATUS_WARN',
      subtext: warningCount > 0 ? 'Perlu pengecekan node' : 'Kondisi node stabil',
      icon: AlertCircle,
      accent: 'border-zinc-200 bg-white text-zinc-900',
      badge: warningCount > 0 ? 'bg-amber-50 text-amber-800 border border-amber-200/60' : 'bg-zinc-100 text-zinc-500',
      status: warningCount > 0 ? 'PERIKSA' : 'AMAN'
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <motion.div
            key={i}
            variants={itemFadeUpVariant}
            className="bg-white rounded-xl p-5 border border-zinc-200/90 shadow-2xs hover:border-zinc-300 transition-colors"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono text-zinc-400 tracking-wider uppercase">{c.code}</span>
              <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded ${c.badge}`}>
                {c.status}
              </span>
            </div>

            <div className="flex items-baseline justify-between mt-2">
              <div>
                <p className="text-xs font-medium text-zinc-500">{c.title}</p>
                <div className="text-3xl font-semibold text-zinc-900 font-mono tracking-tight mt-0.5">
                  {c.value}
                </div>
              </div>
              <div className="w-9 h-9 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-600 bg-zinc-50/50">
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div className="mt-3 pt-3 border-t border-zinc-100 text-[11px] text-zinc-400 font-mono flex items-center justify-between">
              <span>{c.subtext}</span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
