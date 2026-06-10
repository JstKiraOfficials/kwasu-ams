'use client';

/**
 * @file page.tsx
 * @module app/(auth)/forgot-password
 *
 * Forgot password page for the KWASU AMS web application.
 *
 * Renders the {@link ForgotPassword} component inside the `(auth)` centred
 * card layout. The user arrives here by clicking "Forgot password?" on the
 * login form. Always shows a success message after submission regardless of
 * whether the account exists, preventing user enumeration.
 *
 * This is a Client Component because it requires interactive form state.
 */

import type { ReactElement } from 'react';
import { ForgotPassword } from '@/components/auth/ForgotPassword';

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Forgot password page component.
 *
 * A thin Client Component wrapper that renders {@link ForgotPassword}.
 * On submission the component always transitions to a success state to
 * prevent user enumeration.
 *
 * @returns The rendered forgot-password page element.
 */
export default function ForgotPasswordPage(): ReactElement {
  return <ForgotPassword />;
}
