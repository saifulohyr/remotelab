import React, { useState } from 'react';
import { api } from '../api';
import { Lock, Shield } from 'lucide-react';

export default function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await api.login(email, password);
      if (onLoginSuccess) onLoginSuccess(res.user);
    } catch (err) {
      setError(err.message || 'Email atau kata sandi tidak valid.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#fafafa] flex flex-col justify-between p-6 sm:p-10 font-sans selection:bg-zinc-900 selection:text-white">
      {/* Header bar */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md bg-zinc-950 text-white flex items-center justify-center font-mono font-semibold text-xs tracking-tight">
            S
          </div>
          <span className="text-xs font-semibold text-zinc-900 tracking-tight font-mono">SIMLab</span>
        </div>
        <div className="text-[11px] text-zinc-400 font-mono">
          SMK Muhammadiyah 1 Cilacap
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-sm mx-auto my-auto py-12">
        <div className="mb-8">
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Autentikasi Akses</h1>
          <p className="text-xs text-zinc-500 mt-1.5 font-mono">
            Masuk dengan akun terverifikasi untuk mengelola node laboratorium.
          </p>
        </div>

        {error && (
          <div className="mb-5 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-mono text-rose-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-700 mb-1.5 font-mono">
              Email Pengguna
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@domain.com"
              required
              autoFocus
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-zinc-300 rounded-lg shadow-2xs placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-zinc-700 font-mono">
                Kata Sandi
              </label>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2 text-xs font-mono bg-white border border-zinc-300 rounded-lg shadow-2xs placeholder:text-zinc-400 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-colors"
            />
          </div>

          <div className="flex items-center pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              <span className="font-mono text-[11px]">Pertahankan sesi</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 bg-zinc-900 hover:bg-zinc-800 text-white rounded-lg text-xs font-medium font-mono shadow-2xs transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Lock className="w-3 h-3" />
            <span>{loading ? 'MEMVERIFIKASI...' : 'MASUK KE KONSOL'}</span>
          </button>
        </form>

        <div className="mt-8 pt-4 border-t border-zinc-200/80 flex items-center justify-center gap-2 text-[11px] font-mono text-zinc-400">
          <Shield className="w-3.5 h-3.5 text-zinc-400" />
          <span>Sesi terenkripsi HMAC SHA-256</span>
        </div>
      </div>

      {/* Footer */}
      <div className="w-full max-w-5xl mx-auto text-center text-[11px] font-mono text-zinc-400">
        &copy; {new Date().getFullYear()} SIMLab &bull; SMK Muhammadiyah 1 Cilacap
      </div>
    </div>
  );
}
