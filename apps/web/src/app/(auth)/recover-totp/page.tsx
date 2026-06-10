'use client';

/**
 * @file page.tsx
 * @module app/(auth)/recover-totp
 *
 * TOTP recovery page for the KWASU AMS web application.
 *
 * Renders the {@link RecoverTotp} component inside the `(auth)` centred card
 * layout. The user arrives here by clicking "Use a recovery code instead" on
 * the TOTP verify page. Allows login using one of the eight single-use backup
 * codes generated during TOTP setup.
 *
 * This is a Client Component because it requires interactive form state.
 */

import type { ReactElement } from 'react';
import { RecoverTotp } from '@/components/auth/RecoverTotp';

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * TOTP recovery page component.
 *
 * A thin Client Component wrapper that renders {@link RecoverTotp}.
 * On successful recovery the user is redirected to `/dashboard`.
 *
 * @returns The rendered TOTP recovery page element.
 */
export default function RecoverTotpPage(): ReactElement {
  return <RecoverTotp />;
}
