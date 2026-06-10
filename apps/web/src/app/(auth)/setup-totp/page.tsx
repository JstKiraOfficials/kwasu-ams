'use client';

/**
 * @file page.tsx
 * @module app/(auth)/setup-totp
 *
 * TOTP enrollment page for the KWASU AMS web application.
 *
 * Renders the {@link TotpSetup} three-step wizard inside the `(auth)` centred
 * card layout. The user arrives here after a successful first login when
 * `totpEnrolled` is `false`. Steps: scan QR → confirm code → save backup codes.
 *
 * This is a Client Component because the TOTP setup wizard requires interactive
 * state management across three steps.
 */

import type { ReactElement } from 'react';
import { TotpSetup } from '@/components/auth/TotpSetup';

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * TOTP enrollment page component.
 *
 * A thin Client Component wrapper that renders the {@link TotpSetup} wizard.
 * The interim token is managed internally by the component, which redirects
 * to `/login` if no token is present.
 *
 * @returns The rendered TOTP setup page element.
 */
export default function SetupTotpPage(): ReactElement {
  return <TotpSetup />;
}
