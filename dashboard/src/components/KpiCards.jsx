import React from 'react';
import { motion } from 'framer-motion';
import { MonitorCheck, MonitorX, Zap, Activity, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { itemFadeUpVariant } from '../motion';

// SVG Blue Sparkline generator
function MiniSparkline({ color = '#2563eb' }) {
  return (
    <div className="w-20 h-8">
      <svg className="w-full h-full overflow-visible" viewBox="0 0 100 40">
        <defs>
          <linearGradient id={`grad-${color}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.25" />
            <stop offset="100%" stopColor={color} stopOpacity="0.0" />
          </linearGradient>
        </defs>
        <path
          d="M0,32 Q15,10 30,24 T60,12 T90,20 T100,6 L100,40 L0,40 Z"
          fill={`url(#grad-${color})`}
        />
        <path
          d="M0,32 Q15,10 30,24 T60,12 T90,20 T100,6"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function KpiCards({ totalPcs = 180, onlineCount = 166, offlineCount = 14 }) {
  const cards = [
    {
      title: 'PC Aktif (Online)',
      value: `${onlineCount}`,
      subtext: `dari ${totalPcs} total PC`,
      delta: '↑ 12.5%',
      isPositive: true,
      sparklineColor: '#2563eb', // primary blue
      icon: MonitorCheck,
      iconBg: 'bg-blue-50 text-blue-600',
    },
    {
      title: 'PC Nonaktif (Offline)',
      value: `${offlineCount}`,
      subtext: 'kondisi standby/mati',
      delta: '↓ 2.1%',
      isPositive: false,
      sparklineColor: '#64748b', // soft slate
      icon: MonitorX,
      iconBg: 'bg-slate-100 text-slate-600',
    },
    {
      title: 'Konsumsi Daya',
      value: '14.8 kW',
      subtext: 'beban aktual 6 lab',
      delta: '↑ 4.2%',
      isPositive: true,
      sparklineColor: '#8b5cf6', // purple accent
      icon: Zap,
      iconBg: 'bg-purple-50 text-purple-600',
    },
    {
      title: 'Rata-rata Uptime',
      value: '99.4%',
      subtext: 'siklus 30 hari terakhir',
      delta: '↑ 0.8%',
      isPositive: true,
      sparklineColor: '#10b981', // green
      icon: Activity,
      iconBg: 'bg-emerald-50 text-emerald-600',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {cards.map((c, i) => {
        const Icon = c.icon;
        return (
          <motion.div
            key={i}
            variants={itemFadeUpVariant}
            className="bg-white rounded-3xl p-5 border border-slate-100 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.03)] hover:shadow-md transition-shadow relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${c.iconBg} shadow-xs`}>
                <Icon className="w-5 h-5" />
              </div>
              <MiniSparkline color={c.sparklineColor} />
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{c.title}</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-2xl font-bold text-slate-900 font-mono tracking-tight">{c.value}</span>
                <span className="text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full inline-flex items-center gap-0.5">
                  <ArrowUpRight className="w-3 h-3" />
                  {c.delta}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 font-medium mt-1">{c.subtext}</p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
