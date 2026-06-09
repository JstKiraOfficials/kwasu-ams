/**
 * @file auth.ts
 * @module lib/auth
 *
 * In-memory access token store and auth utility helpers.
 *
 * Access tokens are kept in a module-level variable (never localStorage) to
 * prevent XSS token theft. Refresh tokens are stored in HttpOnly cookies by
 * the API and are never accessible from JavaScript.
 *
 * On page reload, `AuthProvider` calls `POST /auth/refresh` using the
 * HttpOnly cookie to recover the session and repopulate `_accessToken`.
 */

/** Module-level access token. Cleared on logout or 401 after refresh. */
let _accessToken: string | null = null;

/**
 * Returns the current in-memory access token, or `null` if not set.
 *
 * @returns The JWT access token string, or `null`.
 */
export function getAccessToken(): string | null {
  return _accessToken;
}

/**
 * Stores the access token in memory.
 *
 * The refresh token is handled exclusively via HttpOnly cookie set by the API
 * — this function does not store it in any client-accessible location.
 *
 * @param access  - JWT access token (30-minute lifetime).
 * @param _refresh - Refresh token — accepted but intentionally ignored here;
 *                   the API sets it as an HttpOnly cookie on `/auth/verify-totp`
 *                   and `/auth/refresh`.
 */
export function setTokens(access: string, _refresh: string): void {
  _accessToken = access;
}

/**
 * Clears the in-memory access token.
 *
 * Called on logout or when a token refresh attempt fails. The HttpOnly
 * refresh token cookie is cleared by the API on `POST /auth/logout`.
 */
export function clearTokens(): void {
  _accessToken = null;
}

/**
 * Returns `true` when an access token is currently held in memory.
 *
 * This does not validate the token — it only checks presence. The token may
 * still be expired; API calls will trigger a refresh cycle if so.
 *
 * @returns `true` if an access token is set, `false` otherwise.
 */
export function isAuthenticated(): boolean {
  return _accessToken !== null;
}
