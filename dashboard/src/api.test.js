import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, DEMO_MODE, getStoredToken } from './api';

function response(status, body) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: vi.fn().mockResolvedValue(body),
  };
}

describe('production API behavior', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('does not enable demo fallback implicitly', () => {
    expect(DEMO_MODE).toBe(false);
  });

  it('rejects network and HTTP failures instead of returning mock data', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
    await expect(api.getLabs()).rejects.toThrow('network down');
    await expect(api.dispatchCommand({ action: 'lock', target_type: 'pc', target_id: 1 })).rejects.toThrow('network down');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(500, { message: 'backend failed' })));
    await expect(api.getLabs()).rejects.toThrow('backend failed');
  });

  it('never opens a session after failed or malformed login', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(401, { message: 'invalid credentials' })));
    await expect(api.login('user@test.local', 'bad')).rejects.toThrow('invalid credentials');
    expect(getStoredToken()).toBeNull();

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { message: 'OK', data: [] })));
    await expect(api.login('user@test.local', 'bad')).rejects.toThrow('token');
    expect(getStoredToken()).toBeNull();
  });

  it('stores only a valid server-issued session', async () => {
    const user = { id: 1, email: 'user@test.local', role: 'operator' };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(200, { token: 'server-token', user })));
    await expect(api.login('user@test.local', 'good')).resolves.toMatchObject({ user });
    expect(getStoredToken()).toBe('server-token');
  });

  it('deletes a PC with bearer authentication', async () => {
    localStorage.setItem('simlab_token', 'server-token');
    const fetchMock = vi.fn().mockResolvedValue(response(200, { message: 'PC berhasil dihapus.' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.deletePc(42)).resolves.toMatchObject({ message: 'PC berhasil dihapus.' });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/pcs/42');
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer server-token');
  });

  it('exports CSV with bearer authentication and propagates errors', async () => {
    localStorage.setItem('simlab_token', 'server-token');
    const blob = new Blob(['csv']);
    const success = { ...response(200, null), blob: vi.fn().mockResolvedValue(blob) };
    const fetchMock = vi.fn().mockResolvedValue(success);
    vi.stubGlobal('fetch', fetchMock);

    await expect(api.exportCommands()).resolves.toBe(blob);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer server-token');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(500, { message: 'export failed' })));
    await expect(api.exportCommands()).rejects.toThrow('export failed');
  });
});
