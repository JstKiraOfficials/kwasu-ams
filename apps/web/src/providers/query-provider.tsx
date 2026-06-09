'use client';

/**
 * @file query-provider.tsx
 * @module providers/query-provider
 *
 * React Query (`@tanstack/react-query`) provider for the KWASU AMS web app.
 *
 * Wraps the entire application with `QueryClientProvider`. The client is
 * created once per browser session (not per render) using `useState` so that
 * it survives React StrictMode double-invocations without creating duplicate
 * instances.
 *
 * Configuration:
 * - `staleTime: 60_000` — data is considered fresh for 60 seconds.
 * - `retry: 1` — failed queries are retried once before surfacing the error.
 * - `refetchOnWindowFocus: false` — avoids surprise refetches during dev.
 */

import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Props for `QueryProvider`.
 */
interface QueryProviderProps {
  /** Child components that will have access to the React Query context. */
  children: React.ReactNode;
}

/**
 * Application-level React Query provider.
 *
 * Creates a stable `QueryClient` instance and wraps children in
 * `QueryClientProvider`. Must be placed near the root of the component tree,
 * above any component that calls `useQuery`, `useMutation`, etc.
 *
 * @param props - `QueryProviderProps` containing `children`.
 * @returns The `QueryClientProvider` wrapping the given children.
 */
export function QueryProvider({ children }: QueryProviderProps): React.JSX.Element {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
