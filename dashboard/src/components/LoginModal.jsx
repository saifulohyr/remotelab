import React, { useState } from 'react';
import { Lock, Mail, Server, AlertCircle } from 'lucide-react';
import { api } from '../api';

export default function LoginModal({ isOpen, onLoginSuccess }) {
  const [email, setEmail] = useState('admin@simlab.local');
  const [password, setPassword] = useState('Admin123!');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.login(email, password);
      if (onLoginSuccess) onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Gagal masuk. Periksa email dan password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-md w-full p-8 border border-slate-100 shadow-2xl space-y-6">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-500 flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-blue-500/25">
            <Server className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">SIMLab Remote Dashboard</h2>
          <p className="text-xs text-slate-400 mt-1">Masuk dengan kredensial administrator atau operator</p>
        </div>

        {error && (
          <div className="p-3.5 bg-rose-50 border border-rose-200/60 rounded-2xl text-xs font-semibold text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Email Akun</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nama@simlab.local"
                className="w-full bg-slate-50 border border-slate-200/70 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Kata Sandi</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-50 border border-slate-200/70 rounded-2xl pl-10 pr-4 py-2.5 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-slate-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-blue-600 rounded-md focus:ring-blue-500"
              />
              <span>Ingat saya di perangkat ini</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-xs font-bold transition-all shadow-md shadow-blue-500/25 disabled:opacity-50 mt-2"
          >
            {loading ? 'Memverifikasi...' : 'Masuk ke Dashboard'}
          </button>
        </form>

        <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-[11px] text-slate-500 space-y-1">
          <p className="font-semibold text-slate-700">Akun Pengujian Demo (Seeded):</p>
          <div className="flex justify-between">
            <span>Superadmin:</span>
            <span className="font-mono text-slate-700">admin@simlab.local / Admin123!</span>
          </div>
          <div className="flex justify-between">
            <span>Operator:</span>
            <span className="font-mono text-slate-700">operator1@simlab.local / Operator123!</span>
          </div>
        </div>
      </div>
    </div>
  );
}
