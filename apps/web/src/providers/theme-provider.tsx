'use client';

/**
 * @file theme-provider.tsx
 * @module providers/theme-provider
 *
 * Light/dark theme provider for the KWASU AMS web application.
 *
 * - Reads the persisted theme from `localStorage('kwasu-theme')` on mount.
 * - Applies `data-theme="dark"` on the `<html>` element to trigger the CSS
 *   custom property overrides defined in `globals.css`.
 * - Defaults to `'light'` when no preference is stored.
 * - Exposes `theme` and `toggleTheme()` via `ThemeContext`.
 * - `useTheme()` is the consumer hook — throws if used outside `ThemeProvider`.
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

/** Allowed theme values. */
export type Theme = 'light' | 'dark';

/** localStorage key used to persist the user's theme preference. */
const STORAGE_KEY = 'kwasu-theme';

// ── Context shape ──────────────────────────────────────────────────────────

/**
 * Shape of the theme context value.
 */
interface ThemeContextValue {
  /** The currently active theme. */
  theme: Theme;
  /**
   * Toggles between `'light'` and `'dark'` and persists the choice to
   * `localStorage`.
   */
  toggleTheme: () => void;
}

/** @internal */
const ThemeContext = createContext<ThemeContextValue | null>(null);

// ── Provider ───────────────────────────────────────────────────────────────

/**
 * Props for `ThemeProvider`.
 */
interface ThemeProviderProps {
  /** Child components that will have access to the theme context. */
  children: React.ReactNode;
}

/**
 * Application-level theme provider.
 *
 * On mount, reads `localStorage('kwasu-theme')` and sets `data-theme` on the
 * `<html>` element. Subsequent calls to `toggleTheme()` update both the DOM
 * attribute and localStorage.
 *
 * @param props - `ThemeProviderProps` containing `children`.
 * @returns The `ThemeContext.Provider` wrapping the given children.
 */
export function ThemeProvider({ children }: ThemeProviderProps): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>('light');

  // ── Read persisted preference on mount ────────────────────────────────
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    const initial: Theme = stored === 'dark' ? 'dark' : 'light';
    setTheme(initial);
    document.documentElement.setAttribute('data-theme', initial);
  }, []);

  // ── Apply data-theme to <html> whenever theme changes ─────────────────
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const toggleTheme = useCallback((): void => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

// ── Consumer hook ──────────────────────────────────────────────────────────

/**
 * Returns the current theme context.
 *
 * Must be called inside a component tree wrapped by `ThemeProvider`.
 *
 * @returns The `ThemeContextValue` containing `theme` and `toggleTheme`.
 * @throws {Error} If called outside of a `ThemeProvider`.
 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
