/**
 * @file page.tsx
 * @module app/(auth)/login
 *
 * Login page for the KWASU AMS web application.
 *
 * Renders the {@link LoginForm} component inside the `(auth)` centred card
 * layout. The form handles Student/Staff tab selection, identifier and
 * password input, client-side validation, and post-login redirection.
 */

import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

// ── Metadata ──────────────────────────────────────────────────────────────────

/**
 * Next.js page metadata for the login route.
 */
export const metadata: Metadata = {
  title: 'Sign In — KWASU AMS',
  description: 'Sign in to the Kwara State University Attendance Management System.',
};

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Login page component.
 *
 * A thin Server Component wrapper that renders the client-side
 * {@link LoginForm} inside the `(auth)` layout card.
 *
 * @returns The rendered login page element.
 */
export default function LoginPage(): ReactElement {
  return <LoginForm />;
}
