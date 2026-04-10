import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as weknoraAuth from "@/api/weknora/auth";
import { setAuthTokenGetter, setOnUnauthorized, setRefreshTokenHandlers } from "@/api/http";
import type { WeKnoraUserInfo } from "@/api/weknora/types";
import {
  readStoredRefreshToken,
  readStoredToken,
  writeStoredRefreshToken,
  writeStoredToken,
} from "./authStorage";

type AuthState = {
  token: string | null;
  user: WeKnoraUserInfo | null;
  ready: boolean;
  /** When true, unauthenticated users should see login. Set `VITE_AUTH_OPTIONAL=true` to allow browsing without login. */
  needLogin: boolean;
  /** Pass `refreshToken` to persist `weknora_refresh_token` (omit to leave existing). */
  setSession: (
    token: string | null,
    user: WeKnoraUserInfo | null,
    refreshToken?: string | null,
  ) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function authOptional(): boolean {
  return import.meta.env.VITE_AUTH_OPTIONAL === "true";
}

function clientRequiresAuth(): boolean {
  return import.meta.env.VITE_REQUIRE_AUTH === "true";
}

/** 401 时跳转登录页。不用 `useNavigate`，避免 Auth 与 Router 包裹顺序或双份 react-router 时运行期报错。 */
function redirectToLoginPage(): void {
  if (typeof window === "undefined") return;
  const path = "/login";
  if (window.location.pathname === path) return;
  window.location.replace(path);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => readStoredToken());
  const [user, setUser] = useState<WeKnoraUserInfo | null>(null);
  const [ready, setReady] = useState(false);
  const tokenRef = useRef<string | null>(readStoredToken());

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const setSession = useCallback(
    (t: string | null, u: WeKnoraUserInfo | null, refreshToken?: string | null) => {
      setToken(t);
      setUser(u);
      writeStoredToken(t);
      if (refreshToken !== undefined) writeStoredRefreshToken(refreshToken);
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      if (tokenRef.current) await weknoraAuth.logout();
    } catch {
      /* ignore */
    }
    setSession(null, null, null);
  }, [setSession]);

  const refreshUser = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) {
      setUser(null);
      return;
    }
    try {
      const u = await weknoraAuth.me();
      setUser(u);
    } catch {
      setSession(null, null, null);
    }
  }, [setSession]);

  useEffect(() => {
    setAuthTokenGetter(() => tokenRef.current);
  }, []);

  useEffect(() => {
    setRefreshTokenHandlers(
      () => readStoredRefreshToken(),
      (access, refresh) => {
        tokenRef.current = access;
        writeStoredToken(access);
        writeStoredRefreshToken(refresh);
        setToken(access);
      },
    );
    return () => setRefreshTokenHandlers(null, null);
  }, []);

  useEffect(() => {
    if (!ready) {
      setOnUnauthorized(null);
      return;
    }
    setOnUnauthorized(() => {
      tokenRef.current = null;
      writeStoredToken(null);
      writeStoredRefreshToken(null);
      setToken(null);
      setUser(null);
      redirectToLoginPage();
    });
    return () => setOnUnauthorized(null);
  }, [ready]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const t = readStoredToken();
        if (t) {
          tokenRef.current = t;
          setToken(t);
          try {
            const u = await weknoraAuth.me();
            if (!cancelled) setUser(u);
          } catch {
            if (!cancelled) setSession(null, null, null);
          }
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setSession]);

  const needLogin = clientRequiresAuth() || !authOptional();

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      ready,
      needLogin,
      setSession,
      logout,
      refreshUser,
    }),
    [token, user, ready, needLogin, setSession, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
