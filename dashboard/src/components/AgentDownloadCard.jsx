import React from 'react';
import { Download, Monitor, Terminal, FileCode, CheckCircle2 } from 'lucide-react';

export default function AgentDownloadCard() {
  return (
    <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)]">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5 max-w-xl">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-[11px] font-semibold tracking-wide">
            <Download className="w-3.5 h-3.5" />
            <span>Agent PC Klien</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 tracking-tight">
            Unduh SIMLab Agent untuk Workstation Lab
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Pasang agent ini di setiap komputer lab agar terhubung otomatis ke dashboard melalui MQTT broker.
            Mendukung pelaporan telemetri real-time (CPU/RAM), IP address, dan eksekusi perintah remote (Shutdown/Restart/Lock).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Windows Download */}
          <a
            href="/downloads/simlab-agent-windows.zip"
            download
            className="flex items-center gap-2.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-semibold shadow-sm transition-all shadow-blue-500/20 active:scale-95"
          >
            <Monitor className="w-4 h-4" />
            <div className="text-left">
              <span className="block leading-none">Windows 64-bit</span>
              <span className="text-[10px] text-blue-100 font-normal">.ZIP (Exe + Config)</span>
            </div>
          </a>

          {/* Linux Download */}
          <a
            href="/downloads/simlab-agent-linux.tar.gz"
            download
            className="flex items-center gap-2.5 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl text-xs font-semibold shadow-sm transition-all active:scale-95"
          >
            <Terminal className="w-4 h-4" />
            <div className="text-left">
              <span className="block leading-none">Linux 64-bit</span>
              <span className="text-[10px] text-slate-400 font-normal">.TAR.GZ</span>
            </div>
          </a>

          {/* Raw Config Download */}
          <a
            href="/downloads/config.yaml"
            download
            className="flex items-center gap-2 px-3.5 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80 rounded-2xl text-xs font-semibold transition-all"
            title="Unduh template config.yaml saja"
          >
            <FileCode className="w-4 h-4 text-slate-500" />
            <span>config.yaml</span>
          </a>
        </div>
      </div>

      {/* Mini Step Guide */}
      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-[11px] text-slate-600">
        <div className="flex items-start gap-2 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
          <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
          <span>Ekstrak ZIP di PC klien (mis. di <code className="text-slate-800 font-mono bg-white px-1 rounded">C:\SIMLab\</code>).</span>
        </div>
        <div className="flex items-start gap-2 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
          <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
          <span>Sesuaikan <code className="text-slate-800 font-mono bg-white px-1 rounded">pc_id</code> & <code className="text-slate-800 font-mono bg-white px-1 rounded">lab_id</code> pada config.yaml.</span>
        </div>
        <div className="flex items-start gap-2 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
          <span className="w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0 text-[10px]">3</span>
          <span>Jalankan <code className="text-slate-800 font-mono bg-white px-1 rounded">simlab-agent.exe</code> (otomatis muncul online).</span>
        </div>
      </div>
    </div>
  );
}
