/**
 * @file query-keys.ts
 * @module lib/query-keys
 *
 * Centralised React Query key factory for the KWASU AMS web application.
 *
 * All query keys are defined here as factory functions so that:
 * - Keys are never inlined as strings in components or hooks.
 * - Partial invalidation is easy (e.g. invalidate all `['sessions']` entries).
 * - TypeScript narrows the key arrays correctly.
 *
 * Usage:
 * ```ts
 * useQuery({ queryKey: queryKeys.dashboard(user.role), queryFn: ... })
 * queryClient.invalidateQueries({ queryKey: queryKeys.sessions() })
 * ```
 */

/**
 * A React Query key — an array of strings and optional filter objects.
 * Using a readonly array satisfies `@tanstack/react-query`'s `QueryKey` type.
 */
type QueryKey = readonly (string | object | undefined)[];

/**
 * Centralised query key factory.
 *
 * Every key is an array beginning with a stable string identifier, followed
 * by any filter or ID parameters. This structure enables both exact-match
 * cache lookups and prefix-based invalidation.
 */
export const queryKeys = {
  /**
   * Dashboard aggregates, scoped by the current user's role.
   *
   * @param role - The authenticated user's role string (e.g. `'STUDENT'`).
   * @returns Query key array: `['dashboard', role]`.
   */
  dashboard: (role: string): QueryKey => ['dashboard', role],

  /**
   * Paginated session list, optionally filtered.
   *
   * @param filters - Optional filter object (e.g. `{ status: 'ACTIVE' }`).
   * @returns Query key array: `['sessions', filters?]`.
   */
  sessions: (filters?: object): QueryKey => ['sessions', filters],

  /**
   * Attendance records for a specific student or session.
   *
   * @param id - UUID of the student or session.
   * @returns Query key array: `['attendance', id]`.
   */
  attendance: (id: string): QueryKey => ['attendance', id],

  /**
   * Excuse letters, optionally filtered by status or course.
   *
   * @param filters - Optional filter object.
   * @returns Query key array: `['excuses', filters?]`.
   */
  excuses: (filters?: object): QueryKey => ['excuses', filters],

  /**
   * Exam eligibility records for a student.
   *
   * @param id - UUID of the student.
   * @returns Query key array: `['eligibility', id]`.
   */
  eligibility: (id: string): QueryKey => ['eligibility', id],

  /**
   * Course list, optionally filtered.
   *
   * @param filters - Optional filter object (e.g. `{ departmentId: '...' }`).
   * @returns Query key array: `['courses', filters?]`.
   */
  courses: (filters?: object): QueryKey => ['courses', filters],

  /**
   * User list, optionally filtered.
   *
   * @param filters - Optional filter object (e.g. `{ role: 'LECTURER' }`).
   * @returns Query key array: `['users', filters?]`.
   */
  users: (filters?: object): QueryKey => ['users', filters],

  /**
   * Notification list for the authenticated user.
   *
   * @returns Query key array: `['notifications']`.
   */
  notifications: (): QueryKey => ['notifications'],

  /**
   * Analytics data for a course section or student.
   *
   * @param id - UUID of the course section or student.
   * @returns Query key array: `['analytics', id]`.
   */
  analytics: (id: string): QueryKey => ['analytics', id],

  /**
   * Live venue check-in heatmap (cached 30 seconds).
   *
   * @returns Query key array: `['heatmap']`.
   */
  heatmap: (): QueryKey => ['heatmap'],

  /**
   * Anomaly flags, optionally filtered.
   *
   * @param filters - Optional filter object (e.g. `{ sessionId: '...' }`).
   * @returns Query key array: `['anomalies', filters?]`.
   */
  anomalies: (filters?: object): QueryKey => ['anomalies', filters],

  /**
   * Audit log entries, optionally filtered.
   *
   * @param filters - Optional filter object (e.g. `{ action: 'LOGIN_SUCCESS' }`).
   * @returns Query key array: `['audit-logs', filters?]`.
   */
  auditLogs: (filters?: object): QueryKey => ['audit-logs', filters],

  /**
   * Venue list, optionally filtered.
   *
   * @param filters - Optional filter object (e.g. `{ capacity: 100 }`).
   * @returns Query key array: `['venues', filters?]`.
   */
  venues: (filters?: object): QueryKey => ['venues', filters],

  /**
   * Timetable entry or list for a student or lecturer.
   *
   * @param id - UUID of the student, lecturer, or timetable entry.
   * @returns Query key array: `['timetable', id]`.
   */
  timetable: (id: string): QueryKey => ['timetable', id],

  /**
   * Report list or report job status, optionally filtered.
   *
   * @param filters - Optional filter object (e.g. `{ type: 'COURSE_ATTENDANCE' }`).
   * @returns Query key array: `['reports', filters?]`.
   */
  reports: (filters?: object): QueryKey => ['reports', filters],

  /**
   * Global search results for a query string.
   *
   * @param q - The search query string.
   * @returns Query key array: `['search', q]`.
   */
  search: (q: string): QueryKey => ['search', q],
} as const;
