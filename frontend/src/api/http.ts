import { getTenantIdHeader } from "@/lib/weknoraTenant";

/** Dev: Vite proxy. Prod: set `VITE_BACKEND_ORIGIN`. */
export function apiOrigin(): string {
  if (import.meta.env.DEV) return "";
  return import.meta.env.VITE_BACKEND_ORIGIN ?? "";
}

let authTokenGetter: () => string | null = () => null;
let refreshTokenGetter: () => string | null = () => null;
let persistRefreshedTokens: ((access: string, refresh: string) => void) | null = null;
let onUnauthorized: (() => void) | null = null;

/** Called from AuthProvider so apiFetch can attach Bearer tokens. */
export function setAuthTokenGetter(fn: () => string | null) {
  authTokenGetter = fn;
}

/**
 * Aligns with Vue `frontend`: persist `weknora_refresh_token` and refresh on 401.
 * Pass `null` getters to disable.
 */
export function setRefreshTokenHandlers(
  getRefresh: (() => string | null) | null,
  persist: ((access: string, refresh: string) => void) | null,
) {
  refreshTokenGetter = getRefresh ?? (() => null);
  persistRefreshedTokens = persist;
}

/** Optional: clear session and redirect when API returns 401 with a token sent. */
export function setOnUnauthorized(fn: (() => void) | null) {
  onUnauthorized = fn;
}

const AUTH_PATHS_NO_REFRESH = ["/api/v1/auth/login", "/api/v1/auth/register", "/api/v1/auth/refresh"];

function shouldAttemptRefresh401(path: string): boolean {
  return !AUTH_PATHS_NO_REFRESH.some((p) => path === p || path.startsWith(`${p}?`));
}

async function tryRefreshAccessToken(): Promise<boolean> {
  const rt = refreshTokenGetter();
  if (!rt || !persistRefreshedTokens) return false;
  const url = `${apiOrigin()}/api/v1/auth/refresh`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ refreshToken: rt }),
    });
    const text = await res.text();
    let data: Record<string, unknown> | null = null;
    if (text) {
      try {
        data = JSON.parse(text) as Record<string, unknown>;
      } catch {
        return false;
      }
    }
    if (!res.ok) return false;
    const access = data?.access_token;
    const nextRefresh = data?.refresh_token;
    if (typeof access !== "string" || typeof nextRefresh !== "string") return false;
    persistRefreshedTokens(access, nextRefresh);
    return true;
  } catch {
    return false;
  }
}

type ApiFetchInit = RequestInit & { _skipRefresh?: boolean };

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Matches Vue `frontend/src/utils/request.ts`: backend uses
 * `{ success:false, error:{ code, message, details } }` or panic recovery `{ error, message }`.
 */
export function parseWeKnoraErrorMessage(data: unknown): string {
  if (data == null || typeof data !== "object") return "";
  const o = data as Record<string, unknown>;
  if (typeof o.error === "string") return o.error;
  if (o.error && typeof o.error === "object" && "message" in o.error) {
    const m = (o.error as { message?: unknown }).message;
    if (typeof m === "string") return m;
  }
  if (typeof o.message === "string") return o.message;
  return "";
}

/** Merge optional headers with Bearer auth (for fetch/SSE outside apiFetch). */
export function mergeAuthHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const tok = authTokenGetter();
  if (tok) headers.set("Authorization", `Bearer ${tok}`);
  if (!headers.has("Accept-Language")) {
    try {
      const fromI18n =
        typeof document !== "undefined"
          ? document.documentElement.getAttribute("lang")
          : null;
      headers.set("Accept-Language", fromI18n || navigator.language || "zh-CN");
    } catch {
      headers.set("Accept-Language", "zh-CN");
    }
  }
  const tid = getTenantIdHeader();
  if (tid && !headers.has("X-Tenant-ID")) headers.set("X-Tenant-ID", tid);
  if (!headers.has("X-Request-ID")) {
    headers.set("X-Request-ID", `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  }
  return headers;
}

export async function apiFetch<T>(path: string, init?: ApiFetchInit): Promise<T> {
  const url = `${apiOrigin()}${path}`;
  const headers = mergeAuthHeaders(init?.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");

  const { _skipRefresh, ...fetchInit } = init ?? {};
  const res = await fetch(url, {
    ...fetchInit,
    headers,
  });
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    if (
      res.status === 401 &&
      !_skipRefresh &&
      shouldAttemptRefresh401(path) &&
      refreshTokenGetter()
    ) {
      const refreshed = await tryRefreshAccessToken();
      if (refreshed) {
        return apiFetch<T>(path, { ...init, _skipRefresh: true });
      }
    }
    if (res.status === 401 && authTokenGetter()) {
      onUnauthorized?.();
    }
    const parsed = parseWeKnoraErrorMessage(data);
    const msg = parsed || (typeof text === "string" && text.trim() ? text : res.statusText);
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

/**
 * Multipart POST (e.g. knowledge file upload). Does not set `Content-Type` so the boundary is set automatically.
 * Handles 401 refresh like `apiFetch`. Pass a factory so the body can be rebuilt after token refresh.
 */
export async function apiFetchForm<T>(
  path: string,
  formData: FormData | (() => FormData),
  init?: ApiFetchInit,
): Promise<T> {
  const url = `${apiOrigin()}${path}`;
  const { _skipRefresh, ...rest } = init ?? {};

  async function doFetch(): Promise<Response> {
    const headers = mergeAuthHeaders(rest.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    const body = typeof formData === "function" ? formData() : formData;
    return fetch(url, {
      ...rest,
      method: rest.method ?? "POST",
      body,
      headers,
    });
  }

  let res = await doFetch();
  if (
    !res.ok &&
    res.status === 401 &&
    !_skipRefresh &&
    shouldAttemptRefresh401(path) &&
    refreshTokenGetter()
  ) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    }
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    if (res.status === 401 && authTokenGetter()) {
      onUnauthorized?.();
    }
    const parsed = parseWeKnoraErrorMessage(data);
    const msg = parsed || (typeof text === "string" && text.trim() ? text : res.statusText);
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

/** Authenticated binary GET (e.g. `/files?file_path=…`). Handles 401 refresh like `apiFetch`. */
export async function apiFetchBlob(path: string, init?: ApiFetchInit): Promise<Blob> {
  const url = `${apiOrigin()}${path}`;
  const { _skipRefresh, ...fetchInit } = init ?? {};

  async function doFetch(): Promise<Response> {
    const headers = mergeAuthHeaders(fetchInit.headers);
    if (!headers.has("Accept")) headers.set("Accept", "*/*");
    return fetch(url, { ...fetchInit, headers });
  }

  let res = await doFetch();
  if (
    !res.ok &&
    res.status === 401 &&
    !_skipRefresh &&
    shouldAttemptRefresh401(path) &&
    refreshTokenGetter()
  ) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      res = await doFetch();
    }
  }
  if (!res.ok) {
    if (res.status === 401 && authTokenGetter()) {
      onUnauthorized?.();
    }
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text) as unknown;
      } catch {
        data = text;
      }
    }
    const parsed = parseWeKnoraErrorMessage(data);
    const msg = parsed || (typeof text === "string" && text.trim() ? text : res.statusText);
    throw new ApiError(msg, res.status, data);
  }
  return res.blob();
}
