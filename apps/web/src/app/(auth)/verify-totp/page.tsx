'use client';

/**
 * @file page.tsx
 * @module app/(auth)/verify-totp
 *
 * TOTP verification page for the KWASU AMS web application.
 *
 * Renders the {@link TotpVerify} component inside the `(auth)` split-panel
 * layout. The interim token is read from {@link AuthFlowProvider} context —
 * if absent, `TotpVerify` redirects back to `/login`.
 */

import type { ReactElement } from 'react';
import { TotpVerify } from '@/components/auth/TotpVerify';

/**
 * TOTP verification page component.
 *
 * Thin Client Component wrapper that renders {@link TotpVerify}.
 * Token handling and redirect logic are managed inside the component.
 *
 * @returns The rendered TOTP verification page element.
 */
export default function VerifyTotpPage(): ReactElement {
  return <TotpVerify />;
}
