'use client';

/**
 * @file page.tsx
 * @module app/(auth)/change-password
 *
 * Forced password change page for the KWASU AMS web application.
 *
 * Rendered when a user logs in for the first time (`mustChangePassword: true`)
 * or when redirected from the login flow. Wraps the {@link ChangePassword}
 * component inside the `(auth)` centred card layout.
 *
 * This is a Client Component because it reads the interim token from
 * in-memory auth flow state. The `mustChangePassword` flag defaults to `true`
 * here since this page is only reached via the first-login redirect path.
 */

import type { ReactElement } from 'react';
import { ChangePassword } from '@/components/auth/ChangePassword';

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Forced password change page component.
 *
 * A thin Client Component wrapper that renders {@link ChangePassword} with
 * `mustChangePassword` set to `true`, hiding the current-password field for
 * first-login resets. The interim token is managed internally by the component.
 *
 * @returns The rendered change-password page element.
 */
export default function ChangePasswordPage(): ReactElement {
  return <ChangePassword mustChangePassword />;
}
