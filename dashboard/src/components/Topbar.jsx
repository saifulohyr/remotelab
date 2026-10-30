import React, { useState, useRef, useEffect } from 'react';
import { 
  Search, 
  Bell, 
  LogOut, 
  CheckCheck
} from 'lucide-react';
import { api } from '../api';

export default function Topbar({ 
  user, 
  onLogout, 
  notifications = [], 
  unreadCount = 0, 
  onRefreshNotifications,
  searchQuery,
  onSearchChange,
  isAutoSync = true,
  onToggleAutoSync
}) {
  const [showBellDropdown, setShowBellDropdown] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);
  const bellRef = useRef(null);
  const profileRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setShowBellDropdown(false);
      }
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setShowProfileDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAllRead = async () => {
    try {
      await api.markAllNotificationsRead();
      if (onRefreshNotifications) onRefreshNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <header className="h-16 bg-white border-b border-zinc-200/80 px-8 flex items-center justify-between sticky top-0 z-30 font-sans">
      {/* Search Bar */}
      <div className="relative w-80">
        <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery || ''}
          onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
          placeholder="Cari hostname, IP, MAC address..."
          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg pl-9 pr-3 py-1.5 text-xs font-mono text-zinc-800 placeholder-zinc-400 focus:outline-none focus:border-zinc-900 focus:bg-white transition-colors"
        />
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Realtime Sync Status Button */}
        <button
          onClick={() => onToggleAutoSync && onToggleAutoSync(!isAutoSync)}
          title={isAutoSync ? "Auto-sync aktif (4s). Klik untuk jeda." : "Sync dijeda. Klik aktifkan."}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-mono border transition-colors ${
            isAutoSync 
              ? 'bg-zinc-50 text-zinc-800 border-zinc-200' 
              : 'bg-zinc-100 text-zinc-400 border-zinc-200'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isAutoSync ? 'bg-emerald-500' : 'bg-zinc-400'}`} />
          <span>{isAutoSync ? 'SYNC: 4s' : 'PAUSED'}</span>
        </button>

        {/* Notifications Dropdown */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setShowBellDropdown(!showBellDropdown)}
            className="w-9 h-9 rounded-lg border border-zinc-200 flex items-center justify-center text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-colors relative"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-zinc-900 ring-2 ring-white" />
            )}
          </button>

          {showBellDropdown && (
            <div className="absolute right-0 mt-2 w-80 bg-white border border-zinc-200 rounded-xl shadow-lg p-3 z-50">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-100">
                <span className="text-xs font-semibold text-zinc-900">Notifikasi</span>
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[10px] text-zinc-500 hover:text-zinc-900 flex items-center gap-1 font-mono"
                  >
                    <CheckCheck className="w-3 h-3" />
                    Tandai dibaca
                  </button>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto space-y-1.5">
                {notifications.length === 0 ? (
                  <p className="text-xs text-zinc-400 text-center py-4 font-mono">Tidak ada log notifikasi</p>
                ) : (
                  notifications.map((n) => (
                    <div key={n.id} className="p-2 rounded bg-zinc-50 border border-zinc-100 text-xs">
                      <p className="font-medium text-zinc-800">{n.title || n.message}</p>
                      <p className="text-[10px] font-mono text-zinc-400 mt-1">{n.created_at || 'Baru saja'}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Profile Dropdown */}
        <div className="relative" ref={profileRef}>
          <button
            onClick={() => setShowProfileDropdown(!showProfileDropdown)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 transition-colors"
          >
            <div className="w-6 h-6 rounded bg-zinc-900 text-white flex items-center justify-center text-xs font-mono font-medium">
              {(user?.name || 'A')[0].toUpperCase()}
            </div>
            <div className="text-left hidden sm:block">
              <p className="text-xs font-semibold text-zinc-900 leading-none">{user?.name || 'Operator'}</p>
              <p className="text-[10px] text-zinc-400 font-mono mt-0.5">{user?.role || 'operator'}</p>
            </div>
          </button>

          {showProfileDropdown && (
            <div className="absolute right-0 mt-2 w-48 bg-white border border-zinc-200 rounded-xl shadow-lg p-1.5 z-50 font-sans">
              <div className="px-3 py-2 border-b border-zinc-100 mb-1">
                <p className="text-xs font-medium text-zinc-900">{user?.email || 'admin@simlab.local'}</p>
                <p className="text-[10px] font-mono text-zinc-400 capitalize">{user?.role || 'admin'}</p>
              </div>
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-xs text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Keluar Sesi</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
