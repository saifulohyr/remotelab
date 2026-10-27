import React, { useState } from 'react';
import { api } from '../api';

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

  const handleQuickFill = (demoEmail, demoPass) => {
    setEmail(demoEmail);
    setPassword(demoPass);
  };

  return (
    <div className="min-h-screen w-full bg-[#f8fafc] flex flex-col justify-between p-6 sm:p-10 font-sans selection:bg-slate-900 selection:text-white">
      {/* Header bar */}
      <div className="w-full max-w-5xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center font-bold text-sm tracking-tight">
            S
          </div>
          <span className="text-sm font-semibold text-slate-900 tracking-tight">SIMLab</span>
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Lab Remote System v1.0
        </div>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-sm mx-auto my-auto py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Masuk</h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Gunakan akun administrator atau operator untuk mengelola workstation lab.
          </p>
        </div>

        {error && (
          <div className="mb-6 p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs font-medium text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@simlab.local"
              required
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg shadow-sm placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-colors"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-medium text-slate-700">
                Kata sandi
              </label>
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg shadow-sm placeholder:text-slate-400 focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 transition-colors"
            />
          </div>

          <div className="flex items-center pt-1">
            <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-900"
              />
              <span>Ingat saya</span>
            </label>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium shadow-sm transition-colors disabled:opacity-50"
          >
            {loading ? 'Memverifikasi...' : 'Masuk ke sistem'}
          </button>
        </form>

        {/* Demo credentials box: simple, neutral table */}
        <div className="mt-8 pt-6 border-t border-slate-200">
          <p className="text-xs font-medium text-slate-500 mb-3">Akun pengujian bawaan:</p>
          <div className="space-y-2 text-xs">
            <div 
              onClick={() => handleQuickFill('admin@simlab.local', 'Admin123!')}
              className="p-2.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white cursor-pointer flex items-center justify-between transition-colors group"
            >
              <div>
                <span className="font-medium text-slate-900 block">Superadmin</span>
                <span className="font-mono text-[11px] text-slate-500">admin@simlab.local</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400 group-hover:text-slate-700">Admin123!</span>
            </div>

            <div 
              onClick={() => handleQuickFill('operator1@simlab.local', 'Operator123!')}
              className="p-2.5 rounded-lg border border-slate-200 hover:border-slate-300 bg-white cursor-pointer flex items-center justify-between transition-colors group"
            >
              <div>
                <span className="font-medium text-slate-900 block">Operator</span>
                <span className="font-mono text-[11px] text-slate-500">operator1@simlab.local</span>
              </div>
              <span className="text-[11px] font-mono text-slate-400 group-hover:text-slate-700">Operator123!</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="w-full max-w-5xl mx-auto text-center text-xs text-slate-400">
        &copy; {new Date().getFullYear()} SIMLab Remote Management System.
      </div>
    </div>
  );
}
