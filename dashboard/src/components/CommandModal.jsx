import React, { useState } from 'react';
import { X, Send, Terminal, AlertCircle, CheckCircle2, BookOpen, Sparkles, ChevronDown } from 'lucide-react';
import { api } from '../api';

const SCRIPT_TEMPLATES = [
  {
    id: 'open_exambro',
    category: 'Aplikasi CBT / Ujian',
    name: 'Buka ExamBrowser (CBT / ANBK)',
    shell: 'powershell',
    description: 'Mencari file ExamBrowser di drive C/D dan menjalankannya secara interaktif ke layar monitor siswa.',
    script: `$path = (Get-ChildItem -Path "C:\\", "D:\\" -Filter "ExamBrowser*.exe" -Recurse -Depth 3 -ErrorAction SilentlyContinue | Select-Object -First 1).FullName
if ($path) {
  schtasks /create /tn "RunExam" /tr ('"' + $path + '"') /sc once /st 00:00 /it /f
  schtasks /run /tn "RunExam"
  Start-Sleep -Seconds 2
  schtasks /delete /tn "RunExam" /f
  Write-Output "Berhasil membuka ExamBrowser: $path"
} else {
  Write-Error "File ExamBrowser*.exe tidak ditemukan di drive C: atau D:"
}`
  },
  {
    id: 'close_exambro',
    category: 'Aplikasi CBT / Ujian',
    name: 'Tutup Paksa ExamBrowser',
    shell: 'cmd',
    description: 'Menghentikan paksa seluruh proses ExamBrowser.exe dan ExamBrowserClient.exe yang berjalan.',
    script: `taskkill /F /IM ExamBrowser.exe /T
taskkill /F /IM ExamBrowserClient.exe /T`
  },
  {
    id: 'reset_ip',
    category: 'Jaringan & Koneksi',
    name: 'Reset IP Address & Flush DNS',
    shell: 'cmd',
    description: 'Membersihkan cache DNS Windows, melepaskan alamat IP DHCP lama, dan meminta IP baru dari router.',
    script: `ipconfig /flushdns
ipconfig /release
ipconfig /renew`
  },
  {
    id: 'test_connection',
    category: 'Jaringan & Koneksi',
    name: 'Diagnosa Jaringan (Ping Gateway & Internet)',
    shell: 'powershell',
    description: 'Menguji latensi dan status koneksi ke Gateway LAN (192.168.1.1) dan DNS Publik (1.1.1.1).',
    script: `Write-Output "--- PING LOCAL GATEWAY (192.168.1.1) ---"
Test-Connection -ComputerName 192.168.1.1 -Count 2 | Select-Object Address, IPv4Address, ResponseTime
Write-Output "--- PING INTERNET CLOUDFLARE (1.1.1.1) ---"
Test-Connection -ComputerName 1.1.1.1 -Count 2 | Select-Object Address, IPv4Address, ResponseTime`
  },
  {
    id: 'clean_temp',
    category: 'Pemeliharaan Sistem',
    name: 'Bersihkan File Sampah & Cache Temp',
    shell: 'cmd',
    description: 'Menghapus file temporary Windows, user cache, dan mengosongkan Recycle Bin untuk melegakan disk.',
    script: `del /s /f /q %temp%\\*.* 2>nul
del /s /f /q C:\\Windows\\Temp\\*.* 2>nul
PowerShell -Command "Clear-RecycleBin -Force -ErrorAction SilentlyContinue"
echo Pembersihan cache dan file temporary selesai.`
  },
  {
    id: 'top_processes',
    category: 'Pemeliharaan Sistem',
    name: 'Daftar 10 Proses CPU & RAM Tertinggi',
    shell: 'powershell',
    description: 'Menampilkan 10 aplikasi atau background process yang paling banyak memakan CPU dan memori.',
    script: `Get-Process | Sort-Object WorkingSet -Descending | Select-Object -First 10 -Property Id, ProcessName, @{Name="RAM(MB)";Expression={[math]::Round($_.WorkingSet/1MB,1)}}, @{Name="CPU(s)";Expression={[math]::Round($_.CPU,1)}} | Format-Table -AutoSize`
  },
  {
    id: 'restart_veyon',
    category: 'Layanan Lab',
    name: 'Restart Layanan Veyon Service',
    shell: 'cmd',
    description: 'Merestart service Veyon agar PC klien kembali terhubung ke Veyon Master guru/lab.',
    script: `net stop VeyonService
net start VeyonService`
  },
  {
    id: 'disk_space',
    category: 'Pemeliharaan Sistem',
    name: 'Cek Sisa Kapasitas Harddisk (C: & D:)',
    shell: 'powershell',
    description: 'Mengecek ukuran total, ruang kosong, dan persentase kapasitas drive C dan D.',
    script: `Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{Name="Free(GB)";Expression={[math]::Round($_.Free/1GB,2)}}, @{Name="Total(GB)";Expression={[math]::Round(($_.Used + $_.Free)/1GB,2)}} | Format-Table -AutoSize`
  },
  {
    id: 'custom',
    category: 'Kustom',
    name: 'Kustom (Tulis Skrip Sendiri)',
    shell: 'powershell',
    description: 'Ketik baris perintah PowerShell atau CMD sendiri sesuai kebutuhan spesifik.',
    script: ''
  }
];

export default function CommandModal({ 
  isOpen, 
  onClose, 
  targetType = 'lab', 
  targetId = 1, 
  initialAction = 'run_script',
  onSuccess 
}) {
  const [action, setAction] = useState(initialAction);
  const [selectedTemplateId, setSelectedTemplateId] = useState('open_exambro');
  const [title, setTitle] = useState('Pemberitahuan Laboratorium');
  const [message, setMessage] = useState('Praktikum akan segera berakhir dalam 15 menit. Harap simpan semua pekerjaan.');
  const [script, setScript] = useState(SCRIPT_TEMPLATES[0].script);
  const [shell, setShell] = useState(SCRIPT_TEMPLATES[0].shell);
  const [delay, setDelay] = useState(0);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  if (!isOpen) return null;

  const handleTemplateChange = (templateId) => {
    setSelectedTemplateId(templateId);
    const tmpl = SCRIPT_TEMPLATES.find((t) => t.id === templateId);
    if (tmpl) {
      setShell(tmpl.shell);
      if (tmpl.id !== 'custom') {
        setScript(tmpl.script);
      }
    }
  };

  const currentTemplate = SCRIPT_TEMPLATES.find((t) => t.id === selectedTemplateId) || SCRIPT_TEMPLATES[0];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setStatusMsg(null);

    const payload = {
      action,
      target_type: targetType,
      target_id: targetId,
      params: {
        delay: parseInt(delay, 10) || 0,
        title: action === 'message' ? title : undefined,
        message: action === 'message' ? message : undefined,
        script: action === 'run_script' ? script : undefined,
        shell: action === 'run_script' ? shell : undefined,
      },
      reason: `Instruksi admin via Dashboard Web Console (${action === 'run_script' ? currentTemplate.name : action})`,
    };

    try {
      await api.dispatchCommand(payload);
      setStatusMsg({ type: 'success', text: 'Perintah berhasil dikirim ke antrean node workstation!' });
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 1000);
    } catch (err) {
      setStatusMsg({ type: 'error', text: err.message || 'Gagal mengirim perintah' });
    } finally {
      setLoading(false);
    }
  };

  // Group templates by category
  const categories = Array.from(new Set(SCRIPT_TEMPLATES.map((t) => t.category)));

  return (
    <div className="fixed inset-0 bg-zinc-950/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 font-sans overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full p-5 sm:p-6 border border-zinc-200/90 shadow-2xl relative my-auto max-h-[92vh] flex flex-col">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-8 h-8 rounded-lg border border-zinc-200 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-50 flex items-center justify-center absolute right-4 top-4 transition-colors z-10"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 shrink-0 pr-8">
          <div className="w-9 h-9 rounded-xl bg-zinc-900 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 leading-tight">Remote Command & Automation</h3>
            <p className="text-[11px] text-zinc-500 font-mono mt-0.5">
              Target: <span className="font-semibold text-zinc-800">{targetType.toUpperCase()} #{targetId}</span>
            </p>
          </div>
        </div>

        {statusMsg && (
          <div className={`p-3 rounded-lg text-xs font-medium mb-3 flex items-center gap-2 border shrink-0 ${
            statusMsg.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            {statusMsg.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
            <span>{statusMsg.text}</span>
          </div>
        )}

        {/* Body Form */}
        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1">
          {/* Action Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-700 uppercase tracking-wider mb-1.5 font-mono">
              Pilih Aksi
            </label>
            <select
              value={action}
              onChange={(e) => setAction(e.target.value)}
              className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            >
              <option value="run_script">⚡ Remote Script Runner & Automations (Action1 Style)</option>
              <option value="message">💬 Kirim Pesan Pop-up Layar Siswa</option>
              <option value="lock">🔒 Kunci Layar (Lock Screen)</option>
              <option value="logoff">🚪 Logoff Pengguna Aktif</option>
              <option value="reboot">🔄 Restart Node</option>
              <option value="shutdown">⏻ Matikan Daya (Shutdown)</option>
              <option value="wake">📡 Wake-on-LAN (WoL Magic Packet)</option>
            </select>
          </div>

          {action === 'run_script' && (
            <div className="space-y-3.5 pt-1">
              {/* Template Selector Dropdown */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 uppercase tracking-wider mb-1.5 font-mono flex items-center justify-between">
                  <span>Template Skrip Siap Pakai</span>
                  <span className="text-[10px] text-zinc-400 font-normal lowercase">library otomatisasi</span>
                </label>
                <div className="relative">
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => handleTemplateChange(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2.5 text-xs font-medium text-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 appearance-none pr-8 cursor-pointer"
                  >
                    {categories.map((category) => (
                      <optgroup key={category} label={category} className="font-semibold text-zinc-900">
                        {SCRIPT_TEMPLATES.filter((t) => t.category === category).map((tmpl) => (
                          <option key={tmpl.id} value={tmpl.id} className="font-normal text-zinc-800 py-1">
                            {tmpl.name}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-zinc-400 absolute right-3 top-3 pointer-events-none" />
                </div>
              </div>

              {/* Template Description Card */}
              {currentTemplate && currentTemplate.id !== 'custom' && (
                <div className="p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 text-xs text-zinc-600 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-zinc-900 text-[11px]">{currentTemplate.name}</span>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-zinc-200/80 text-zinc-700 uppercase">
                      {currentTemplate.shell}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    {currentTemplate.description}
                  </p>
                </div>
              )}

              {/* Shell Selector */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 uppercase tracking-wider mb-1.5 font-mono">
                  Interpreter CLI
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-xs cursor-pointer font-mono transition-colors ${
                    shell === 'powershell' 
                      ? 'border-zinc-900 bg-zinc-900 text-white font-medium' 
                      : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
                  }`}>
                    <input 
                      type="radio" 
                      name="shell" 
                      value="powershell" 
                      checked={shell === 'powershell'} 
                      onChange={() => setShell('powershell')} 
                      className="hidden"
                    />
                    <span>PowerShell</span>
                  </label>
                  <label className={`flex items-center justify-center gap-2 p-2 rounded-lg border text-xs cursor-pointer font-mono transition-colors ${
                    shell === 'cmd' 
                      ? 'border-zinc-900 bg-zinc-900 text-white font-medium' 
                      : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100'
                  }`}>
                    <input 
                      type="radio" 
                      name="shell" 
                      value="cmd" 
                      checked={shell === 'cmd'} 
                      onChange={() => setShell('cmd')} 
                      className="hidden"
                    />
                    <span>Command Prompt (CMD)</span>
                  </label>
                </div>
              </div>

              {/* Script Editor */}
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 uppercase tracking-wider mb-1.5 font-mono flex items-center justify-between">
                  <span>Pratinjau / Edit Skrip</span>
                  <span className="text-[10px] text-zinc-400 font-normal lowercase">dapat diedit sebelum kirim</span>
                </label>
                <textarea
                  rows={4}
                  value={script}
                  onChange={(e) => {
                    setScript(e.target.value);
                    if (selectedTemplateId !== 'custom') {
                      setSelectedTemplateId('custom');
                    }
                  }}
                  placeholder="Ketik baris perintah CLI di sini..."
                  className="w-full font-mono bg-zinc-900 text-zinc-100 rounded-xl p-3 text-xs focus:outline-none focus:ring-1 focus:ring-zinc-700 leading-relaxed selection:bg-zinc-700 resize-y"
                  required
                />
                <span className="text-[10px] text-zinc-400 mt-1 block font-mono">
                  Hasil keluaran stdout/stderr akan otomatis terekam di menu Riwayat Audit.
                </span>
              </div>
            </div>
          )}

          {action === 'message' && (
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 uppercase tracking-wider mb-1 font-mono">
                  Judul Pesan
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-zinc-700 uppercase tracking-wider mb-1 font-mono">
                  Isi Pesan Layar Siswa
                </label>
                <textarea
                  rows={3}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  required
                />
              </div>
            </div>
          )}

          {['shutdown', 'reboot', 'message'].includes(action) && (
            <div>
              <label className="block text-[11px] font-semibold text-zinc-700 uppercase tracking-wider mb-1 font-mono">
                Jeda Waktu Eksekusi (Detik)
              </label>
              <input
                type="number"
                min="0"
                max="3600"
                value={delay}
                onChange={(e) => setDelay(e.target.value)}
                className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 text-xs font-medium text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
              <span className="text-[10px] text-zinc-400 mt-1 block font-mono">
                Waktu hitung mundur sebelum instruksi dijalankan di layar klien.
              </span>
            </div>
          )}

          {/* Footer Submit Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-zinc-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-zinc-200 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 px-5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium transition-colors disabled:opacity-50 shadow-sm"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{loading ? 'Mengirim...' : 'Eksekusi Perintah'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
