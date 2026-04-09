/** Primary key aligned with Vue frontend (`frontend/src/utils/request`). */
export const AUTH_TOKEN_KEY = "weknora_token";

/** Same key as Vue `frontend` refresh flow. */
export const AUTH_REFRESH_TOKEN_KEY = "weknora_refresh_token";

const LEGACY_AUTH_TOKEN_KEY = "chatclaw_auth_token";

export function readStoredToken(): string | null {
  try {
    return (
      localStorage.getItem(AUTH_TOKEN_KEY) ?? localStorage.getItem(LEGACY_AUTH_TOKEN_KEY)
    );
  } catch {
    return null;
  }
}

export function writeStoredToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(LEGACY_AUTH_TOKEN_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function readStoredRefreshToken(): string | null {
  try {
    return localStorage.getItem(AUTH_REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function writeStoredRefreshToken(token: string | null) {
  try {
    if (token) localStorage.setItem(AUTH_REFRESH_TOKEN_KEY, token);
    else localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
