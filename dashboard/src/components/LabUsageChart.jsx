import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Calendar } from 'lucide-react';
import { barGrowVariant } from '../motion';

export default function LabUsageChart() {
  const [period, setPeriod] = useState('Bulan Ini');
  const [showDropdown, setShowDropdown] = useState(false);

  // 14 days usage stats (hours active)
  const data = [
    { day: 'Sen 12', hours: 8.5 },
    { day: 'Sel 13', hours: 9.0 },
    { day: 'Rab 14', hours: 7.8 },
    { day: 'Kam 15', hours: 9.5 },
    { day: 'Jum 16', hours: 8.0 },
    { day: 'Sab 17', hours: 4.5 },
    { day: 'Min 18', hours: 1.0 },
    { day: 'Sen 19', hours: 9.2 },
    { day: 'Sel 20', hours: 8.7 },
    { day: 'Rab 21', hours: 9.8 },
    { day: 'Kam 22', hours: 9.0 },
    { day: 'Jum 23', hours: 8.2 },
    { day: 'Sab 24', hours: 5.0 },
    { day: 'Min 25', hours: 0.8 },
  ];

  const maxHours = 12;

  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.03)]">
      {/* Header with Title and "Bulan Ini" Pill Dropdown */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h3 className="font-bold text-slate-900 text-base">Pemakaian Laboratorium per Hari</h3>
          <p className="text-xs text-slate-400 mt-0.5 font-medium">Akumulasi durasi operasional PC lab (jam/hari)</p>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/60 text-xs font-semibold text-slate-700 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5 text-blue-600" />
            <span>{period}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-1 w-36 bg-white border border-slate-100 rounded-2xl shadow-lg p-1.5 z-20">
              {['Minggu Ini', 'Bulan Ini', 'Semester Ganjil'].map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPeriod(p);
                    setShowDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 rounded-xl text-xs font-medium ${
                    period === p ? 'bg-blue-50 text-blue-600 font-semibold' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bar Chart Area */}
      <div className="h-56 flex items-end justify-between gap-2 pt-6 pb-2 px-2 border-b border-slate-100">
        {data.map((item, idx) => {
          const heightPercent = Math.min(100, Math.round((item.hours / maxHours) * 100));
          const delay = idx * 0.04; // sequential grow delay per bar
          return (
            <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
              {/* Tooltip on hover */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-slate-900 text-white text-[10px] font-mono py-1 px-2 rounded-lg pointer-events-none shadow-md z-10 whitespace-nowrap">
                {item.hours} jam
              </div>

              {/* Bar with gradient and motion */}
              <motion.div
                variants={barGrowVariant(delay)}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                style={{ height: `${heightPercent}%` }}
                className="w-full max-w-[28px] rounded-t-xl bg-gradient-to-t from-blue-600 to-indigo-400 group-hover:from-blue-500 group-hover:to-indigo-300 transition-colors shadow-xs"
              />
            </div>
          );
        })}
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between gap-2 px-2 mt-2">
        {data.map((item, idx) => (
          <div key={idx} className="flex-1 text-center">
            <span className="text-[10px] font-medium text-slate-400 block truncate">
              {item.day}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
