/**
 * @file use-debounce.ts
 * @module hooks/use-debounce
 *
 * Generic debounce hook that delays updating a value until the input has
 * stopped changing for the specified delay period.
 *
 * Useful for search inputs — prevents a new API call on every keystroke.
 */

import { useEffect, useState } from 'react';

/**
 * Returns a debounced version of `value` that only updates after `delay` ms
 * of inactivity.
 *
 * @param value - The value to debounce (typically a search string).
 * @param delay - Debounce delay in milliseconds. Defaults to `300`.
 * @returns The debounced value, which lags behind `value` by up to `delay` ms.
 *
 * @example
 * ```ts
 * const debouncedSearch = useDebounce(searchInput, 400);
 * useEffect(() => { fetchResults(debouncedSearch); }, [debouncedSearch]);
 * ```
 */
export function useDebounce<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);

  return debouncedValue;
}
