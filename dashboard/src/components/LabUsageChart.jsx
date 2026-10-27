import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronDown, Calendar, BarChart2 } from 'lucide-react';

export default function LabUsageChart() {
  const [period, setPeriod] = useState('Bulan Ini');
  const [showDropdown, setShowDropdown] = useState(false);

  const data = [
    { day: '12', hours: 8.5 },
    { day: '13', hours: 9.0 },
    { day: '14', hours: 7.8 },
    { day: '15', hours: 9.5 },
    { day: '16', hours: 8.0 },
    { day: '17', hours: 4.5 },
    { day: '18', hours: 1.0 },
    { day: '19', hours: 9.2 },
    { day: '20', hours: 8.7 },
    { day: '21', hours: 9.8 },
    { day: '22', hours: 9.0 },
    { day: '23', hours: 8.2 },
    { day: '24', hours: 5.0 },
    { day: '25', hours: 0.8 },
  ];

  const maxHours = 12;

  return (
    <div className="bg-white rounded-xl p-6 border border-zinc-200/90 shadow-2xs font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-zinc-900 text-sm">UTILISASI OPERASIONAL WORKSTATION</h3>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600">
              AGGREGATE (JAM/HARI)
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1 font-mono">Total durasi komputasi aktif seluruh workstation per tanggal</p>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-50 hover:bg-zinc-100 border border-zinc-200 text-xs font-mono text-zinc-700 transition-colors"
          >
            <Calendar className="w-3.5 h-3.5 text-zinc-500" />
            <span>{period}</span>
            <ChevronDown className="w-3 h-3 text-zinc-400" />
          </button>

          {showDropdown && (
            <div className="absolute right-0 mt-1.5 w-36 bg-white border border-zinc-200 rounded-lg shadow-lg p-1 z-20">
              {['Minggu Ini', 'Bulan Ini', 'Semester Ganjil'].map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    setPeriod(p);
                    setShowDropdown(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded text-xs font-mono ${
                    period === p ? 'bg-zinc-900 text-white font-medium' : 'text-zinc-600 hover:bg-zinc-100'
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
      <div className="h-48 flex items-end justify-between gap-2 pt-6 pb-2 px-1 border-b border-zinc-100">
        {data.map((item, idx) => {
          const heightPercent = Math.min(100, Math.round((item.hours / maxHours) * 100));
          return (
            <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end group relative">
              {/* Tooltip on hover */}
              <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -top-8 bg-zinc-900 text-white text-[10px] font-mono py-1 px-2 rounded pointer-events-none shadow-md z-10 whitespace-nowrap">
                {item.hours} jam
              </div>

              {/* Bar */}
              <div className="w-full max-w-[28px] bg-zinc-100 rounded-t flex flex-col justify-end h-full overflow-hidden">
                <div
                  style={{ height: `${heightPercent}%` }}
                  className="w-full bg-zinc-800 group-hover:bg-zinc-950 transition-all rounded-t"
                />
              </div>

              {/* X Axis Label */}
              <span className="text-[10px] text-zinc-400 font-mono mt-2">{item.day}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between pt-3 text-[11px] font-mono text-zinc-400">
        <span>Rata-rata: 7.2 jam / hari</span>
        <span>Peak: 9.8 jam (Tgl 21)</span>
      </div>
    </div>
  );
}
