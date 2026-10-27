// SIMLab API Client with Auth, Error handling & Mock Fallback

const BASE_URL = '/api';

export const getStoredToken = () => localStorage.getItem('simlab_token');
export const setStoredToken = (token) => {
  if (token) localStorage.setItem('simlab_token', token);
  else localStorage.removeItem('simlab_token');
};

export const getStoredUser = () => {
  try {
    return JSON.parse(localStorage.getItem('simlab_user') || 'null');
  } catch {
    return null;
  }
};

export const setStoredUser = (user) => {
  if (user) localStorage.setItem('simlab_user', JSON.stringify(user));
  else localStorage.removeItem('simlab_user');
};

// Generic request helper
async function request(endpoint, options = {}) {
  const token = getStoredToken();
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (res.status === 401) {
      setStoredToken(null);
      setStoredUser(null);
      window.dispatchEvent(new CustomEvent('simlab:unauthorized'));
    }

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(data?.message || `Request gagal dengan status ${res.status}`);
    }
    return data;
  } catch (err) {
    // If backend is unreachable or returns error, use mock fallback if mock is enabled
    if (shouldUseMock(err)) {
      return getMockData(endpoint, options);
    }
    throw err;
  }
}

function shouldUseMock(err) {
  return (
    err.message?.includes('Failed to fetch') ||
    err.message?.includes('NetworkError') ||
    err.message?.includes('404') ||
    !getStoredToken() // When using offline demo mode
  );
}

// ── API Methods ───────────────────────────────────────────
export const api = {
  // Auth
  login: async (email, password) => {
    try {
      const res = await request('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      if (res.token) {
        setStoredToken(res.token);
        setStoredUser(res.user);
      }
      return res;
    } catch (err) {
      if (shouldUseMock(err)) {
        const mockUser = {
          id: 1,
          name: email.includes('admin') ? 'Super Administrator' : 'Operator Lab',
          email,
          role: email.includes('admin') ? 'superadmin' : 'operator',
        };
        const mockToken = 'mock-simlab-token-12345';
        setStoredToken(mockToken);
        setStoredUser(mockUser);
        return { user: mockUser, token: mockToken };
      }
      throw err;
    }
  },

  logout: async () => {
    try {
      await request('/logout', { method: 'POST' });
    } catch {
      // ignore
    } finally {
      setStoredToken(null);
      setStoredUser(null);
    }
  },

  getMe: () => request('/me'),

  // Labs
  getLabs: () => request('/labs'),
  getLab: (id) => request(`/labs/${id}`),
  getLabPcs: (labId) => request(`/labs/${labId}/pcs`),

  // PCs
  getPc: (id) => request(`/pcs/${id}`),
  getPcMetrics: (id, range = '24h') => request(`/pcs/${id}/metrics?range=${range}`),
  getPcEvents: (id) => request(`/pcs/${id}/events`),

  // Commands
  getCommands: () => request('/commands'),
  getCommand: (id) => request(`/commands/${id}`),
  dispatchCommand: (payload) =>
    request('/commands', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  exportCommandsUrl: () => `${BASE_URL}/commands/export`,

  // Schedules
  getSchedules: (labId) => request(`/labs/${labId}/schedules`),
  saveSchedule: (labId, payload) =>
    request(`/labs/${labId}/schedules`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  deleteSchedule: (labId, scheduleId) =>
    request(`/labs/${labId}/schedules/${scheduleId}`, { method: 'DELETE' }),

  getScheduleExceptions: (labId) => request(`/labs/${labId}/schedule-exceptions`),
  saveScheduleException: (labId, payload) =>
    request(`/labs/${labId}/schedule-exceptions`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  // Notifications
  getNotifications: (unreadOnly = false) =>
    request(`/notifications${unreadOnly ? '?unread_only=1' : ''}`),
  getUnreadCount: () => request('/notifications/unread-count'),
  markNotificationRead: (id) =>
    request(`/notifications/${id}/read`, { method: 'POST' }),
  markAllNotificationsRead: () =>
    request('/notifications/read-all', { method: 'POST' }),
};

// ── Realistic Mock Data Generator (Matches 6 Labs, 180 PCs) ──────────
function getMockData(endpoint, options) {
  if (endpoint === '/me') {
    return (
      getStoredUser() || {
        id: 1,
        name: 'Saifuloh Yusuf',
        email: 'admin@simlab.local',
        role: 'superadmin',
      }
    );
  }

  if (endpoint === '/labs') {
    return {
      data: [
        { id: 1, name: 'LAB RPL 1', slug: 'lab-rpl-1', subnet: '192.168.1.0/24', pcs_count: 30, online_count: 0, offline_count: 30, booting_count: 0, wake_failed_count: 0 },
        { id: 2, name: 'LAB RPL 2', slug: 'lab-rpl-2', subnet: '192.168.2.0/24', pcs_count: 30, online_count: 0, offline_count: 30, booting_count: 0, wake_failed_count: 0 },
        { id: 3, name: 'LAB RPL 3', slug: 'lab-rpl-3', subnet: '192.168.3.0/24', pcs_count: 30, online_count: 0, offline_count: 30, booting_count: 0, wake_failed_count: 0 },
        { id: 4, name: 'LAB RPL 4', slug: 'lab-rpl-4', subnet: '192.168.4.0/24', pcs_count: 30, online_count: 0, offline_count: 30, booting_count: 0, wake_failed_count: 0 },
        { id: 5, name: 'LAB Bahasa', slug: 'lab-bahasa', subnet: '192.168.5.0/24', pcs_count: 30, online_count: 0, offline_count: 30, booting_count: 0, wake_failed_count: 0 },
        { id: 6, name: 'LAB RPS', slug: 'lab-rps', subnet: '192.168.6.0/24', pcs_count: 30, online_count: 0, offline_count: 30, booting_count: 0, wake_failed_count: 0 },
      ],
    };
  }

  const labMatch = endpoint.match(/\/labs\/(\d+)\/pcs/);
  if (labMatch) {
    const labId = parseInt(labMatch[1], 10);
    const prefixes = ['', 'RPL1', 'RPL2', 'RPL3', 'RPL4', 'BHS', 'RPS'];
    const pfx = prefixes[labId] || `LAB${labId}`;
    const pcs = Array.from({ length: 30 }, (_, i) => {
      const idx = i + 1;
      const numStr = String(idx).padStart(2, '0');
      const status = 'offline_normal';

      return {
        id: labId * 100 + idx,
        lab_id: labId,
        hostname: `${pfx}-PC${numStr}`,
        slug: `${pfx.toLowerCase()}-pc${numStr}`,
        ip_address: null,
        mac_address: `02:00:00:0${labId}:${numStr}:00`,
        status,
        agent_version: null,
        wol_enabled: true,
        cpu_percent: 0,
        ram_percent: 0,
        disk_percent: 0,
        current_user: null,
        uptime_hours: 0,
      };
    });
    return { data: pcs };
  }

  const pcMatch = endpoint.match(/\/pcs\/(\d+)$/);
  if (pcMatch) {
    const id = parseInt(pcMatch[1], 10);
    return {
      data: {
        id,
        hostname: `PC-NODE-${id}`,
        slug: `pc-node-${id}`,
        ip_address: `192.168.10.${id % 250}`,
        mac_address: '00:1B:44:11:3A:FF',
        status: 'online',
        agent_version: 'v1.2.4',
        wol_enabled: true,
        description: 'Workstation Core i5-12400, 16GB RAM, RTX 3050',
        latest_metrics: {
          cpu_percent: 28.5,
          ram_percent: 54.2,
          disk_percent: 61.8,
          active_user: 'praktikan_03',
          uptime_seconds: 24500,
        },
      },
    };
  }

  const pcEventsMatch = endpoint.match(/\/pcs\/(\d+)\/events/);
  if (pcEventsMatch) {
    return {
      data: [
        { id: 1, event_type: 'power_on', triggered_by: 'schedule_wol', created_at: '2026-10-26T07:30:00Z' },
        { id: 2, event_type: 'heartbeat_ok', triggered_by: 'agent', created_at: '2026-10-26T07:31:12Z' },
        { id: 3, event_type: 'user_login', triggered_by: 'praktikan_03', created_at: '2026-10-26T08:05:00Z' },
      ],
    };
  }

  const pcMetricsMatch = endpoint.match(/\/pcs\/(\d+)\/metrics/);
  if (pcMetricsMatch) {
    return {
      data: Array.from({ length: 12 }, (_, i) => ({
        timestamp: `${i * 2}:00`,
        cpu: Math.floor(20 + Math.random() * 50),
        ram: Math.floor(40 + Math.random() * 30),
      })),
    };
  }

  if (endpoint === '/commands') {
    if (options.method === 'POST') {
      return { message: 'Perintah berhasil dijadwalkan dan dikirim ke antrean MQTT.' };
    }
    return {
      data: [
        { id: 101, action: 'wake', target_type: 'lab', target_id: 1, status: 'completed', user: { name: 'Saifuloh Yusuf' }, created_at: '2026-10-26 07:30:00' },
        { id: 102, action: 'message', target_type: 'pc', target_id: 105, status: 'acknowledged', user: { name: 'Operator Lab' }, created_at: '2026-10-26 09:15:22' },
        { id: 103, action: 'lock', target_type: 'pc', target_id: 114, status: 'completed', user: { name: 'Operator Lab' }, created_at: '2026-10-26 10:02:10' },
        { id: 104, action: 'shutdown', target_type: 'lab', target_id: 6, status: 'completed', user: { name: 'Saifuloh Yusuf' }, created_at: '2026-10-25 17:00:00' },
      ],
    };
  }

  const schedMatch = endpoint.match(/\/labs\/(\d+)\/schedules/);
  if (schedMatch) {
    if (options.method === 'POST') {
      return { message: 'Jadwal lab berhasil diperbarui.' };
    }
    return {
      data: [
        { id: 1, day_of_week: 1, wake_time: '07:30', shutdown_time: '17:00', is_active: true },
        { id: 2, day_of_week: 2, wake_time: '07:30', shutdown_time: '17:00', is_active: true },
        { id: 3, day_of_week: 3, wake_time: '07:30', shutdown_time: '17:00', is_active: true },
        { id: 4, day_of_week: 4, wake_time: '07:30', shutdown_time: '17:00', is_active: true },
        { id: 5, day_of_week: 5, wake_time: '07:30', shutdown_time: '16:30', is_active: true },
        { id: 6, day_of_week: 6, wake_time: '08:00', shutdown_time: '13:00', is_active: false },
        { id: 7, day_of_week: 0, wake_time: null, shutdown_time: null, is_active: false },
      ],
    };
  }

  if (endpoint.includes('/schedule-exceptions')) {
    return {
      data: [
        { id: 1, exception_date: '2026-11-10', reason: 'Hari Pahlawan (Libur Nasional)', is_cancelled: true },
      ],
    };
  }

  if (endpoint.includes('/notifications/unread-count')) {
    return { unread_count: 3 };
  }

  if (endpoint.includes('/notifications')) {
    return {
      data: [
        { id: 1, type: 'unexpected_shutdown', title: 'PC Mati Tak Terduga', message: 'LAB2-PC14 terputus tanpa sinyal shutdown resmi.', is_read: false, created_at: '10 menit lalu' },
        { id: 2, type: 'wol_failure', title: 'Gagal Wake on LAN', message: 'LAB4-PC23 tidak merespon paket magic WoL.', is_read: false, created_at: '45 menit lalu' },
        { id: 3, type: 'high_load', title: 'Beban Komputasi Tinggi', message: 'LAB5-PC08 CPU mencapai 98% selama 15 menit.', is_read: false, created_at: '2 jam lalu' },
        { id: 4, type: 'scheduled_shutdown', title: 'Jadwal Pemadaman', message: 'Semua PC di Lab 6 telah dimatikan otomatis.', is_read: true, created_at: 'Kemarin' },
      ],
    };
  }

  return { message: 'OK', data: [] };
}
