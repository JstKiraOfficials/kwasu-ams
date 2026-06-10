/**
 * @file layout.tsx
 * @module app/layout
 *
 * Root Next.js App Router layout. Wraps the entire application with the
 * global provider stack (React Query → Auth → Theme), loads the Inter
 * typeface via `next/font/google`, imports global CSS tokens, and sets
 * the HTML `lang` attribute and page-level metadata defaults.
 *
 * All other layouts (auth group, app group) are nested inside this root
 * layout and inherit its providers automatically.
 */

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '../styles/globals.css';
import { QueryProvider } from '../providers/query-provider';
import { AuthProvider } from '../providers/auth-provider';
import { ThemeProvider } from '../providers/theme-provider';

/**
 * Inter font configuration loaded via `next/font/google`.
 *
 * Weights 400–700 cover every token in `--fw-regular` through `--fw-bold`.
 * `display: 'swap'` prevents invisible text during font load.
 */
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

/**
 * Default metadata applied to every page unless overridden by a nested layout
 * or `generateMetadata` export.
 */
export const metadata: Metadata = {
  title: 'KWASU AMS',
  description: 'Kwara State University Attendance Management System',
};

/**
 * Props accepted by `RootLayout`.
 */
interface RootLayoutProps {
  /** Page or nested layout content rendered inside the `<body>`. */
  children: React.ReactNode;
}

/**
 * Root application layout.
 *
 * Renders the `<html>` and `<body>` elements exactly once. Wraps all
 * children with the global provider stack in this order:
 * 1. `QueryProvider` — React Query client context.
 * 2. `AuthProvider` — JWT session recovery and user profile context.
 * 3. `ThemeProvider` — Light/dark theme toggle and `data-theme` injection.
 *
 * @param props - `RootLayoutProps` containing the nested `children`.
 * @returns The root HTML document structure with providers.
 */
export default function RootLayout({ children }: RootLayoutProps): React.JSX.Element {
  return (
    <html lang="en" className={inter.className}>
      <body suppressHydrationWarning>
        <QueryProvider>
          <AuthProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
