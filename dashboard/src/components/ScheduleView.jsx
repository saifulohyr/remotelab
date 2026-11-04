import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle2, ShieldAlert } from 'lucide-react';
import { api } from '../api';
import {
  WEEK_DAYS,
  createDefaultScheduleRows,
  normalizeScheduleRows,
  updateScheduleRow,
  buildScheduleExceptionPayload,
} from '../schedule';

const DAY_NAMES = [
  'Minggu',
  'Senin',
  'Selasa',
  'Rabu',
  'Kamis',
  'Jumat',
  'Sabtu',
];

export default function ScheduleView({ selectedLabId = 1, labs = [] }) {
  const [labId, setLabId] = useState(selectedLabId);
  const [schedules, setSchedules] = useState(createDefaultScheduleRows);
  const [exceptions, setExceptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // New exception form state
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newType, setNewType] = useState('skip');
  const [newWakeTime, setNewWakeTime] = useState('');
  const [newShutdownTime, setNewShutdownTime] = useState('');

  useEffect(() => {
    setLabId(selectedLabId);
  }, [selectedLabId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setSchedules(createDefaultScheduleRows());

    Promise.all([
      api.getSchedules(labId),
      api.getScheduleExceptions(labId),
    ])
      .then(([schedRes, exRes]) => {
        if (!active) return;
        setSchedules(normalizeScheduleRows(schedRes?.data || []));
        setExceptions(exRes?.data || []);
      })
      .catch((err) => {
        if (active) setError(err.message || 'Gagal memuat jadwal.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [labId, reloadKey]);

  const handleToggleDay = (dayIndex) => {
    setSchedules((prev) => {
      const current = normalizeScheduleRows(prev).find((row) => row.day_of_week === dayIndex);
      return updateScheduleRow(prev, dayIndex, { is_active: !current.is_active });
    });
  };

  const handleTimeChange = (dayIndex, field, value) => {
    setSchedules((prev) => updateScheduleRow(prev, dayIndex, { [field]: value }));
  };

  const handleSave = async (dayIndex) => {
    const sched = schedules.find((s) => s.day_of_week === dayIndex);
    if (!sched) return;
    try {
      await api.saveSchedule(labId, sched);
      setSaveStatus('Jadwal berhasil disimpan!');
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      alert(err.message || 'Gagal menyimpan');
    }
  };

  const handleAddException = async (e) => {
    e.preventDefault();
    if (!newDate || !newReason) return;
    try {
      await api.saveScheduleException(labId, buildScheduleExceptionPayload({
        exception_date: newDate,
        reason: newReason,
        type: newType,
        wake_time: newWakeTime,
        shutdown_time: newShutdownTime,
      }));
      setNewDate('');
      setNewReason('');
      setNewType('skip');
      setNewWakeTime('');
      setNewShutdownTime('');
      setReloadKey((value) => value + 1);
    } catch (err) {
      alert(err.message || 'Gagal menyimpan pengecualian');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Lab Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">Otomasi & Jadwal Daya (WoL)</h2>
          <p className="text-xs text-slate-400 mt-1">
            Konfigurasi waktu otomatis nyala (Wake on LAN) dan shutdown per lab
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600">Pilih Lab:</span>
          <select
            value={labId}
            onChange={(e) => setLabId(parseInt(e.target.value, 10))}
            className="bg-white border border-slate-200 rounded-2xl px-3 py-1.5 text-xs font-bold text-slate-800 shadow-2xs focus:outline-none"
          >
            {labs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {saveStatus && (
        <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-200/50 rounded-2xl text-xs font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{saveStatus}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="p-3 bg-rose-50 text-rose-700 border border-rose-200 rounded-2xl text-xs font-semibold">
          {error}
        </div>
      )}

      {/* Weekly Schedule Table */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.03)]">
        <h3 className="font-bold text-slate-900 text-sm mb-4">Jadwal Mingguan (Senin — Minggu)</h3>

        <div className="divide-y divide-slate-100">
          {WEEK_DAYS.map((dayIdx) => {
            const sched = schedules.find((s) => s.day_of_week === dayIdx);

            return (
              <div key={dayIdx} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3 w-36">
                  <span className={`w-2.5 h-2.5 rounded-full ${sched.is_active ? 'bg-blue-600' : 'bg-slate-300'}`} />
                  <span className="text-xs font-bold text-slate-800">{DAY_NAMES[dayIdx]}</span>
                </div>

                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-medium">WoL Bangun:</span>
                    <input
                      type="time"
                      value={sched.wake_time || '07:30'}
                      disabled={!sched.is_active}
                      onChange={(e) => handleTimeChange(dayIdx, 'wake_time', e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-mono font-semibold text-slate-800 disabled:opacity-40"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-medium">Shutdown:</span>
                    <input
                      type="time"
                      value={sched.shutdown_time || '17:00'}
                      disabled={!sched.is_active}
                      onChange={(e) => handleTimeChange(dayIdx, 'shutdown_time', e.target.value)}
                      className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-mono font-semibold text-slate-800 disabled:opacity-40"
                    />
                  </div>

                  {/* Active toggle */}
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={sched.is_active}
                      onChange={() => handleToggleDay(dayIdx)}
                      className="w-4 h-4 text-blue-600 rounded-md focus:ring-blue-500"
                    />
                    <span className="text-xs font-medium text-slate-600">Aktif</span>
                  </label>

                  <button
                    onClick={() => handleSave(dayIdx)}
                    className="px-3 py-1 rounded-xl bg-slate-100 hover:bg-blue-50 hover:text-blue-600 text-[11px] font-semibold text-slate-700 transition-colors"
                  >
                    Simpan
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Exception & Holiday Override Section */}
      <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-[0_4px_25px_-5px_rgba(0,0,0,0.03)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-slate-900 text-sm">Pengecualian Jadwal / Hari Libur</h3>
            <p className="text-xs text-slate-400 mt-0.5">Lewati booting otomatis pada hari libur nasional atau ujian khusus</p>
          </div>
        </div>

        {/* Add Exception Form */}
        <form onSubmit={handleAddException} className="flex flex-wrap items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-100">
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800"
            required
          />
          <input
            type="text"
            placeholder="Alasan (contoh: Libur Nasional / Cuti Bersama)"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
            className="flex-1 min-w-[200px] bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800"
            required
          />
          <select
            aria-label="Tipe pengecualian"
            value={newType}
            onChange={(e) => setNewType(e.target.value)}
            className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-800"
          >
            <option value="skip">Lewati jadwal</option>
            <option value="override">Override waktu</option>
          </select>
          {newType === 'override' && (
            <>
              <input aria-label="Jam wake override" type="time" required value={newWakeTime} onChange={(e) => setNewWakeTime(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs" />
              <input aria-label="Jam shutdown override" type="time" required value={newShutdownTime} onChange={(e) => setNewShutdownTime(e.target.value)} className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs" />
            </>
          )}
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Pengecualian</span>
          </button>
        </form>

        {/* Existing Exceptions List */}
        <div className="divide-y divide-slate-100">
          {exceptions.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">Tidak ada pengecualian jadwal aktif</p>
          ) : (
            exceptions.map((ex) => (
              <div key={ex.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="w-4 h-4 text-amber-500" />
                  <span className="font-mono font-bold text-slate-800">{ex.exception_date}</span>
                  <span className="text-slate-600">{ex.reason}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full">
                    {ex.type === 'override' ? 'Jadwal Override' : 'Lewati Booting Otomatis'}
                  </span>
                  <button
                    type="button"
                    aria-label={`Hapus pengecualian ${ex.exception_date}`}
                    onClick={async () => {
                      try {
                        await api.deleteScheduleException(labId, ex.id);
                        setReloadKey((value) => value + 1);
                      } catch (err) {
                        setError(err.message || 'Gagal menghapus pengecualian.');
                      }
                    }}
                    className="text-rose-600 text-[11px] font-semibold"
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
