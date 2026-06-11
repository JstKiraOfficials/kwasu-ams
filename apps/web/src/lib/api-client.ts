/**
 * @file api-client.ts
 * @module lib/api-client
 *
 * Typed fetch wrapper for the KWASU AMS REST API.
 *
 * - Reads the base URL from `NEXT_PUBLIC_API_URL`.
 * - Attaches `Authorization: Bearer <token>` on every request.
 * - On a `401` response, attempts a single token refresh via
 *   `POST /auth/refresh` (using the HttpOnly refresh-token cookie),
 *   then retries the original request once.
 * - Throws `ApiError` for any non-2xx response after the retry cycle.
 */

import { getAccessToken, setTokens, clearTokens } from './auth';

const API_URL = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001';

/**
 * Stores the access token in memory. Alias for `setTokens(token, '')` provided
 * for compatibility with auth flow components that call `setAccessToken` directly.
 *
 * @param token - JWT access token to store in memory.
 */
export function setAccessToken(token: string): void {
  setTokens(token, '');
}

// ── Error type ─────────────────────────────────────────────────────────────

/**
 * Structured error thrown by all `api*` helpers on non-2xx responses.
 */
export class ApiError extends Error {
  /** HTTP status code returned by the server. */
  readonly status: number;
  /** Machine-readable error code from the API body (e.g. `'NOT_FOUND'`). */
  readonly code: string;

  /**
   * @param status  - HTTP status code.
   * @param code    - Machine-readable error code from the API response body.
   * @param message - Human-readable error message.
   */
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

// ── Internal helpers ───────────────────────────────────────────────────────

/**
 * Builds common request headers, injecting the Bearer token when available.
 *
 * @param extra - Additional headers to merge in (e.g. `Content-Type`).
 * @returns A `Headers` object ready for a `fetch` call.
 */
function buildHeaders(extra?: Record<string, string>): Headers {
  const headers = new Headers(extra);
  const token = getAccessToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

/**
 * Attempts to refresh the access token using the HttpOnly refresh-token cookie.
 *
 * On success, stores the new access token in memory via `setTokens`.
 * On failure, clears all tokens and throws.
 *
 * @returns A promise that resolves when the refresh succeeds.
 * @throws {ApiError} If the refresh endpoint returns a non-2xx status.
 */
async function refreshAccessToken(): Promise<void> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include', // send the HttpOnly refresh-token cookie
    headers: { 'Content-Type': 'application/json' },
    body: '{}', // Fastify rejects empty body when Content-Type is application/json
  });

  if (!res.ok) {
    clearTokens();
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new ApiError(
      res.status,
      body.error ?? 'REFRESH_FAILED',
      body.message ?? 'Session expired',
    );
  }

  const data = (await res.json()) as { accessToken: string; refreshToken?: string };
  setTokens(data.accessToken, data.refreshToken ?? '');
}

/**
 * Core fetch executor with automatic 401 → refresh → retry logic.
 *
 * @param input   - URL or Request object.
 * @param init    - Fetch init options.
 * @param isRetry - When `true`, skips the refresh retry to prevent loops.
 * @returns The parsed JSON response body cast to `T`.
 * @throws {ApiError} On non-2xx responses after the retry cycle.
 */
async function execute<T>(input: string, init: RequestInit, isRetry = false): Promise<T> {
  const res = await fetch(input, { ...init, credentials: 'include' });

  if (res.status === 401 && !isRetry) {
    await refreshAccessToken();
    // Rebuild headers with the new token and retry once
    const retryInit: RequestInit = {
      ...init,
      headers: buildHeaders(
        init.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : (init.headers as Record<string, string> | undefined),
      ),
    };
    return execute<T>(input, retryInit, true);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new ApiError(res.status, body.error ?? 'API_ERROR', body.message ?? res.statusText);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Performs a `GET` request and returns the parsed JSON response.
 *
 * @param path - API path relative to `NEXT_PUBLIC_API_URL` (e.g. `/users/me`).
 * @returns A promise resolving to the response body typed as `T`.
 * @throws {ApiError} On non-2xx responses.
 */
export async function apiGet<T>(path: string): Promise<T> {
  return execute<T>(`${API_URL}${path}`, {
    method: 'GET',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
  });
}

/**
 * Performs a `POST` request with a JSON body and returns the parsed response.
 *
 * @param path - API path relative to `NEXT_PUBLIC_API_URL`.
 * @param body - Request payload, serialised as JSON.
 * @returns A promise resolving to the response body typed as `T`.
 * @throws {ApiError} On non-2xx responses.
 */
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  return execute<T>(`${API_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

/**
 * Performs a `PATCH` request with a JSON body and returns the parsed response.
 *
 * @param path - API path relative to `NEXT_PUBLIC_API_URL`.
 * @param body - Partial update payload, serialised as JSON.
 * @returns A promise resolving to the updated resource typed as `T`.
 * @throws {ApiError} On non-2xx responses.
 */
export async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return execute<T>(`${API_URL}${path}`, {
    method: 'PATCH',
    headers: buildHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
}

/**
 * Performs a `DELETE` request. Returns `void` on success (expects `204`).
 *
 * @param path - API path relative to `NEXT_PUBLIC_API_URL`.
 * @returns A promise that resolves when the deletion is confirmed.
 * @throws {ApiError} On non-2xx responses.
 */
export async function apiDelete(path: string): Promise<void> {
  return execute<void>(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  });
}

/**
 * Performs a `POST` request with a `multipart/form-data` body (file uploads).
 *
 * Does NOT set `Content-Type` — the browser sets it automatically with the
 * correct `boundary` parameter for multipart payloads.
 *
 * @param path - API path relative to `NEXT_PUBLIC_API_URL`.
 * @param form - `FormData` instance containing the file(s) and metadata fields.
 * @returns A promise resolving to the response body typed as `T`.
 * @throws {ApiError} On non-2xx responses.
 */
export async function apiPostForm<T>(path: string, form: FormData): Promise<T> {
  return execute<T>(`${API_URL}${path}`, {
    method: 'POST',
    headers: buildHeaders(), // no Content-Type — browser sets it for multipart
    body: form,
  });
}
