/**
 * @file page.tsx
 * @module app/(auth)/login
 *
 * Login page. Renders the `LoginCard` component inside the `(auth)` split-screen
 * layout. No data fetching occurs here — all auth logic lives in `LoginCard`.
 */

import { LoginCard } from '../../../components/auth/LoginCard';

/**
 * Login page component.
 *
 * Entry point for the authentication flow. Renders the Student/Staff toggle,
 * identifier input, password input, and sign-in button via `LoginCard`.
 *
 * @returns The login page JSX element.
 */
export default function LoginPage(): React.JSX.Element {
  return <LoginCard />;
}
