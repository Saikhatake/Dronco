/**
 * api.js — Centralized API Client for Dr. Onco
 *
 * Features:
 * - Auto attaches Authorization header
 * - Silently refreshes expired access tokens using refresh_token
 * - Redirects to login on full auth failure (both tokens expired)
 * - Single source of truth for API_URL
 */

export const API_URL = 'http://127.0.0.1:8000';

// ─── Token Storage Helpers ───────────────────────────────────────────────────

export const TokenStore = {
  getAccess:   () => localStorage.getItem('access_token'),
  getRefresh:  () => localStorage.getItem('refresh_token'),
  getUser:     () => { try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch { return null; } },

  set(accessToken, refreshToken, user) {
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    localStorage.setItem('user', JSON.stringify(user));
  },

  clear() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
  },

  hasSession() {
    return !!(this.getAccess() && this.getRefresh());
  }
};

// ─── Global logout callback (set by App.jsx) ────────────────────────────────
let _onSessionExpired = () => {
  TokenStore.clear();
  window.location.href = '/';
};

export function setSessionExpiredCallback(fn) {
  _onSessionExpired = fn;
}

// ─── Token Refresh Logic ─────────────────────────────────────────────────────
let _refreshPromise = null; // deduplicate concurrent refresh calls

async function tryRefreshToken() {
  if (_refreshPromise) return _refreshPromise; // reuse in-flight refresh

  _refreshPromise = (async () => {
    const refreshToken = TokenStore.getRefresh();
    if (!refreshToken) return false;

    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (res.ok) {
        const data = await res.json();
        // Update only access token; keep existing refresh token and user
        localStorage.setItem('access_token', data.access_token);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      _refreshPromise = null;
    }
  })();

  return _refreshPromise;
}

// ─── Core Fetch Wrapper ──────────────────────────────────────────────────────

/**
 * apiRequest(path, options)
 *
 * Usage:
 *   const data = await apiRequest('/api/predict', { method: 'POST', body: JSON.stringify({...}) });
 *
 * Automatically:
 *   - Adds Authorization: Bearer <token>
 *   - Retries once after token refresh on 401
 *   - Calls _onSessionExpired if refresh also fails
 */
export async function apiRequest(path, options = {}) {
  const makeHeaders = () => ({
    'Content-Type': 'application/json',
    ...options.headers,
    ...(TokenStore.getAccess() ? { Authorization: `Bearer ${TokenStore.getAccess()}` } : {}),
  });

  // Remove Content-Type for FormData (browser sets it with boundary automatically)
  const isFormData = options.body instanceof FormData;

  const buildOptions = () => ({
    ...options,
    headers: isFormData
      ? { Authorization: `Bearer ${TokenStore.getAccess()}` }
      : makeHeaders(),
  });

  let response = await fetch(`${API_URL}${path}`, buildOptions());

  // ── 401: attempt token refresh then retry once ──
  if (response.status === 401) {
    const refreshed = await tryRefreshToken();
    if (refreshed) {
      response = await fetch(`${API_URL}${path}`, buildOptions());
    } else {
      _onSessionExpired();
      throw new ApiError('Session expired. Please log in again.', 401);
    }
  }

  // ── Parse response ──
  let data;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const message = data?.detail || data?.message || `Request failed (${response.status})`;
    throw new ApiError(message, response.status, data);
  }

  return data;
}

// ─── Typed Error Class ───────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

// ─── Auth API ────────────────────────────────────────────────────────────────

export const AuthAPI = {
  async signup(email, password, fullName, dateOfBirth) {
    return apiRequest('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, full_name: fullName, date_of_birth: dateOfBirth }),
    });
  },

  async login(email, password) {
    return apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  async logout() {
    try {
      await apiRequest('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: TokenStore.getRefresh() }),
      });
    } catch {
      // Best-effort — clear locally regardless
    } finally {
      TokenStore.clear();
    }
  },

  async getMe() {
    return apiRequest('/api/auth/me');
  },

  async changePassword(currentPassword, newPassword) {
    return apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  },
};

// ─── Other API helpers ───────────────────────────────────────────────────────

export const PredictionAPI = {
  predict: (data) => apiRequest('/api/predict', { method: 'POST', body: JSON.stringify(data) }),
  history: () => apiRequest('/api/predictions/history'),
};

export const ReportAPI = {
  upload: (formData) => apiRequest('/api/summarize/upload', { method: 'POST', body: formData }),
  summarizeText: (text) => apiRequest('/api/summarize/text', { method: 'POST', body: JSON.stringify({ text }) }),
  history: () => apiRequest('/api/reports/history'),
};

export const ChatAPI = {
  createSession: () => apiRequest('/api/chat/sessions', { method: 'POST' }),
  listSessions: () => apiRequest('/api/chat/sessions'),
  getSession: (id) => apiRequest(`/api/chat/sessions/${id}`),
  deleteSession: (id) => apiRequest(`/api/chat/sessions/${id}`, { method: 'DELETE' }),
  renameSession: (id, title) => apiRequest(`/api/chat/sessions/${id}/rename`, { method: 'PATCH', body: JSON.stringify({ title }) }),
  sendMessage: (sessionId, message) => apiRequest('/api/chat/message', { method: 'POST', body: JSON.stringify({ session_id: sessionId, message }) }),
};
