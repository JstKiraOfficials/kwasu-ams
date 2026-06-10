'use client';

/**
 * @file auth-flow-provider.tsx
 * @module providers
 *
 * Auth flow context for the KWASU AMS web application.
 *
 * Holds the short-lived interim token returned by `POST /auth/login` in
 * React state so it can be read by subsequent auth flow steps
 * (change-password → setup-totp → verify-totp) without being written to
 * localStorage, sessionStorage, or URL params.
 *
 * Security model:
 * - The interim token lives only in React state.
 * - It is cleared automatically when the user completes the flow or refreshes.
 * - A page refresh drops the token and redirects the user back to `/login`.
 *   This is intentional — the interim token is a one-time-use credential.
 */

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

/**
 * Value exposed by {@link AuthFlowContext} to all consumers.
 */
interface AuthFlowContextValue {
  /**
   * The short-lived interim token returned by `POST /auth/login`.
   * `null` if the user has not completed the first login step or has refreshed.
   */
  interimToken: string | null;

  /**
   * Stores the interim token in context after a successful `POST /auth/login`.
   *
   * @param token - The interim token string returned by the API.
   */
  setInterimToken: (token: string) => void;

  /**
   * Clears the interim token from context. Called after the auth flow
   * completes or on error.
   */
  clearInterimToken: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthFlowContext = createContext<AuthFlowContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

/**
 * Props for the {@link AuthFlowProvider} component.
 */
interface AuthFlowProviderProps {
  /** Child components that will have access to {@link AuthFlowContext}. */
  children: ReactNode;
}

/**
 * Provides the interim token context for the multi-step auth flow.
 *
 * Mount this inside the `(auth)` route group layout so it wraps all auth
 * pages. The token is stored in React state and is automatically lost on
 * hard refresh, which is the desired security behaviour.
 *
 * @param props - {@link AuthFlowProviderProps}
 * @returns The `AuthFlowContext.Provider` wrapping the given children.
 */
export function AuthFlowProvider({ children }: AuthFlowProviderProps): ReactElement {
  const [interimToken, setInterimTokenState] = useState<string | null>(null);

  /**
   * Stores the interim token returned by `POST /auth/login`.
   *
   * @param token - The interim token string.
   */
  const setInterimToken = useCallback((token: string): void => {
    setInterimTokenState(token);
  }, []);

  /**
   * Clears the interim token after the auth flow completes or on error.
   */
  const clearInterimToken = useCallback((): void => {
    setInterimTokenState(null);
  }, []);

  return (
    <AuthFlowContext.Provider value={{ interimToken, setInterimToken, clearInterimToken }}>
      {children}
    </AuthFlowContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the current {@link AuthFlowContextValue} from the nearest
 * {@link AuthFlowProvider}.
 *
 * @throws {Error} If called outside of an `AuthFlowProvider` tree.
 * @returns The current auth flow context value.
 */
export function useAuthFlow(): AuthFlowContextValue {
  const ctx = useContext(AuthFlowContext);
  if (!ctx) throw new Error('useAuthFlow must be used inside AuthFlowProvider');
  return ctx;
}
