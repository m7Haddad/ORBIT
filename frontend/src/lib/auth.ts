/* Token management: access token in memory (module state), refresh token in
 * localStorage. Refresh is single-flight; a proactive timer renews before
 * expiry so the WebSocket can always grab a fresh token. */

const REFRESH_KEY = "orbit-refresh-token";

let accessToken: string | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshInFlight: Promise<boolean> | null = null;

interface TokenPair {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function hasStoredSession(): boolean {
  return typeof window !== "undefined" && !!window.localStorage.getItem(REFRESH_KEY);
}

function storeTokens(pair: TokenPair) {
  accessToken = pair.access_token;
  window.localStorage.setItem(REFRESH_KEY, pair.refresh_token);
  if (refreshTimer) clearTimeout(refreshTimer);
  // Renew at 80% of the access token's lifetime.
  refreshTimer = setTimeout(() => void refreshSession(), pair.expires_in * 800);
}

export async function login(email: string, password: string): Promise<void> {
  const response = await fetch("/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error?.message ?? `login failed (${response.status})`);
  }
  storeTokens(await response.json());
}

export async function refreshSession(): Promise<boolean> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refresh = window.localStorage.getItem(REFRESH_KEY);
    if (!refresh) return false;
    const response = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refresh }),
    });
    if (!response.ok) {
      clearSession();
      return false;
    }
    storeTokens(await response.json());
    return true;
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function logout(): Promise<void> {
  const refresh = window.localStorage.getItem(REFRESH_KEY);
  if (refresh && accessToken) {
    await fetch("/api/v1/auth/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ refresh_token: refresh }),
    }).catch(() => undefined);
  }
  clearSession();
}

export function clearSession() {
  accessToken = null;
  if (refreshTimer) clearTimeout(refreshTimer);
  window.localStorage.removeItem(REFRESH_KEY);
}

/** Ensure there is a usable access token (used by the auth guard on load). */
export async function ensureSession(): Promise<boolean> {
  if (accessToken) return true;
  if (!hasStoredSession()) return false;
  return refreshSession();
}
