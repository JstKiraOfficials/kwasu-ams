'use client';

/**
 * @file auth-provider.tsx
 * @module providers/auth-provider
 *
 * Authentication context provider for the KWASU AMS web application.
 *
 * Responsibilities:
 * - On mount: calls `POST /auth/refresh` to recover an existing session.
 * - Exposes `user`, `login()`, `logout()`, `isLoading` via `AuthContext`.
 * - Holds a short-lived `interimToken` used between the login step and the
 *   TOTP / change-password / setup-totp steps. Cleared on full authentication
 *   or explicit `clearInterimToken()`.
 * - `useAuth()` is the consumer hook — throws if used outside `AuthProvider`.
 */

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { IUserPublic } from '@kwasu-ams/types';
import { apiGet, apiPost } from '../lib/api-client';
import { setTokens, clearTokens } from '../lib/auth';

// ── Context shape ──────────────────────────────────────────────────────────

/**
 * Shape of the authentication context value.
 */
export interface AuthContextValue {
  /** The authenticated user's public profile, or `null` when unauthenticated. */
  user: IUserPublic | null;
  /** `true` while the initial session-recovery or login request is in flight. */
  isLoading: boolean;
  /**
   * Short-lived interim token returned by `POST /auth/login`.
   * Used only to call TOTP, change-password, and setup-totp endpoints.
   * Never stored in `localStorage`.
   */
  interimToken: string | null;
  /**
   * Stores the interim token received from `POST /auth/login`.
   *
   * @param token - The short-lived interim JWT from the login response.
   */
  setInterimToken: (token: string) => void;
  /**
   * Clears the interim token without completing authentication.
   * Called when navigating away from the auth flow.
   */
  clearInterimToken: () => void;
  /**
   * Stores the full token pair in memory and fetches the user profile.
   * Clears `interimToken` on success.
   *
   * Call this after a successful `POST /auth/verify-totp` response.
   *
   * @param accessToken  - JWT access token (30-minute lifetime).
   * @param refreshToken - Refresh token (stored as HttpOnly cookie by the API).
   * @returns A promise that resolves once the user profile is loaded.
   */
  login: (accessToken: string, refreshToken: string) => Promise<void>;
  /**
   * Clears the in-memory token, calls `POST /auth/logout`, and resets user state.
   *
   * @returns A promise that resolves once logout is complete.
   */
  logout: () => Promise<void>;
}

// ── Context ────────────────────────────────────────────────────────────────

/** @internal */
const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

/**
 * Props for `AuthProvider`.
 */
interface AuthProviderProps {
  /** Child components that will have access to the auth context. */
  children: React.ReactNode;
}

/**
 * Application-level authentication provider.
 *
 * On mount, attempts to restore an existing session by calling
 * `POST /auth/refresh`. If the HttpOnly refresh-token cookie is present and
 * valid, the access token is stored in memory and `GET /users/me` is fetched
 * to populate the user profile.
 *
 * Must be placed inside `QueryProvider` in the component tree.
 *
 * @param props - `AuthProviderProps` containing `children`.
 * @returns The `AuthContext.Provider` wrapping the given children.
 */
export function AuthProvider({ children }: AuthProviderProps): React.JSX.Element {
  const [user, setUser] = useState<IUserPublic | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [interimToken, setInterimTokenState] = useState<string | null>(null);

  /**
   * Fetches `GET /users/me` and populates the user state.
   *
   * @returns A promise that resolves once the profile is loaded.
   */
  const fetchMe = useCallback(async (): Promise<void> => {
    const me = await apiGet<IUserPublic>('/users/me');
    setUser(me);
  }, []);

  // ── Session recovery on mount ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function recoverSession(): Promise<void> {
      try {
        const data = await apiPost<{ accessToken: string; refreshToken?: string }>(
          '/auth/refresh',
          {},
        );
        if (cancelled) return;
        setTokens(data.accessToken, data.refreshToken ?? '');
        await fetchMe();
      } catch {
        clearTokens();
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void recoverSession();
    return () => {
      cancelled = true;
    };
  }, [fetchMe]);

  // ── Interim token helpers ──────────────────────────────────────────────
  const setInterimToken = useCallback((token: string): void => {
    setInterimTokenState(token);
  }, []);

  const clearInterimToken = useCallback((): void => {
    setInterimTokenState(null);
  }, []);

  // ── login ──────────────────────────────────────────────────────────────
  const login = useCallback(
    async (accessToken: string, refreshToken: string): Promise<void> => {
      setIsLoading(true);
      try {
        setTokens(accessToken, refreshToken);
        await fetchMe();
        // Clear interim token now that full authentication is complete
        setInterimTokenState(null);
      } finally {
        setIsLoading(false);
      }
    },
    [fetchMe],
  );

  // ── logout ─────────────────────────────────────────────────────────────
  const logout = useCallback(async (): Promise<void> => {
    try {
      await apiPost('/auth/logout', {});
    } catch {
      // Ignore — clear client state regardless
    } finally {
      clearTokens();
      setUser(null);
      setInterimTokenState(null);
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        interimToken,
        setInterimToken,
        clearInterimToken,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Consumer hook ──────────────────────────────────────────────────────────

/**
 * Returns the current authentication context.
 *
 * Must be called inside a component tree wrapped by `AuthProvider`.
 *
 * @returns The `AuthContextValue` with `user`, `isLoading`, `interimToken`,
 *   `setInterimToken`, `clearInterimToken`, `login`, and `logout`.
 * @throws {Error} If called outside of an `AuthProvider`.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
