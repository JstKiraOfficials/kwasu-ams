/**
 * @file DataTable.tsx
 * @module components/ui/DataTable
 *
 * Sortable, paginated data table with optional per-column search filtering.
 * On viewports below 768 px the table scrolls horizontally inside a
 * wrapper — no data is hidden or truncated. All interactive column headers
 * are keyboard-navigable and announce sort direction via `aria-sort`.
 */

'use client';

import { useState, useMemo, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { useDebounce } from '../../hooks/use-debounce';
import styles from './DataTable.module.css';

// ── Column definition ──────────────────────────────────────────────────────

/**
 * Definition for a single table column.
 *
 * @typeParam T - The row data object type.
 */
export interface ColumnDef<T> {
  /** Unique column identifier (used as React key and sort key). */
  key: string;
  /** Header label displayed in `<th>`. */
  header: string;
  /**
   * Extracts the cell value from a row object.
   *
   * @param row - The row data object.
   * @returns The primitive or JSX to render in the cell.
   */
  accessor: (row: T) => React.ReactNode;
  /**
   * When `true`, the column header is interactive and clicking it toggles
   * the sort direction.
   * @defaultValue `false`
   */
  sortable?: boolean;
  /**
   * Returns the raw string/number used for sorting and filtering.
   * Required when `sortable` is `true` or `searchable` is `true`.
   *
   * @param row - The row data object.
   * @returns A comparable primitive value.
   */
  sortValue?: (row: T) => string | number;
  /**
   * When `true`, a search input is shown below the column header.
   * @defaultValue `false`
   */
  searchable?: boolean;
  /** Optional CSS width applied to the `<col>` element (e.g. `'120px'`). */
  width?: string;
}

/**
 * Sort direction state for a single column.
 */
type SortDirection = 'asc' | 'desc' | null;

/**
 * Props accepted by the `DataTable` component.
 *
 * @typeParam T - The row data object type.
 */
export interface DataTableProps<T> {
  /** Column definitions in display order. */
  columns: ColumnDef<T>[];
  /** Full dataset. Sorting, filtering, and pagination are applied client-side. */
  data: T[];
  /**
   * Function that returns a unique string key for each row, used as the
   * React `key` prop.
   *
   * @param row - The row data object.
   * @returns A unique string identifier.
   */
  rowKey: (row: T) => string;
  /**
   * Number of rows per page.
   * @defaultValue `20`
   */
  pageSize?: number;
  /** Message displayed when no rows match the current filter. */
  emptyMessage?: string;
  /** Additional class names applied to the outer wrapper `<div>`. */
  className?: string;
}

/**
 * Sortable, paginated, filterable data table.
 *
 * All processing (sort, filter, paginate) runs client-side on the `data` prop.
 * For server-side pagination, pass the current page slice as `data` and manage
 * page state externally.
 *
 * Table horizontally scrolls below 768 px — no data is dropped on small screens.
 *
 * @typeParam T - The row data object type.
 * @param props - `DataTableProps` with columns, data, rowKey, and optional page config.
 * @returns The data table JSX element with pagination controls.
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  pageSize = 20,
  emptyMessage = 'No records found.',
  className = '',
}: DataTableProps<T>): React.JSX.Element {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDirection>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(1);

  // Debounce filter inputs to avoid filtering on every keystroke
  const debouncedFilters = useDebounce(columnFilters, 300);

  /**
   * Toggles the sort column/direction. Cycles: none → asc → desc → none.
   *
   * @param key - The column key to sort by.
   */
  const handleSort = useCallback((key: string): void => {
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDir('asc');
        return key;
      }
      setSortDir((d) => {
        if (d === 'asc') return 'desc';
        if (d === 'desc') {
          setSortKey(null);
          return null;
        }
        return 'asc';
      });
      return key;
    });
    setPage(1);
  }, []);

  /**
   * Updates the filter value for a column.
   *
   * @param key   - Column key to filter.
   * @param value - The filter string typed by the user.
   */
  const handleFilter = useCallback((key: string, value: string): void => {
    setColumnFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  }, []);

  // Apply column filters
  const filtered = useMemo(() => {
    let rows = data;
    for (const [key, filterValue] of Object.entries(debouncedFilters)) {
      if (!filterValue.trim()) continue;
      const col = columns.find((c) => c.key === key);
      if (!col?.sortValue) continue;
      const lower = filterValue.toLowerCase();
      rows = rows.filter((row) => String(col.sortValue!(row)).toLowerCase().includes(lower));
    }
    return rows;
  }, [data, debouncedFilters, columns]);

  // Apply sort
  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return filtered;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sortValue) return filtered;
    return [...filtered].sort((a, b) => {
      const av = col.sortValue!(a);
      const bv = col.sortValue!(b);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, columns]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);

  /**
   * Returns the `aria-sort` attribute value for a column header.
   *
   * @param key - The column key.
   * @returns The ARIA sort value string or `undefined`.
   */
  function ariaSortValue(key: string): 'ascending' | 'descending' | 'none' | undefined {
    if (sortKey !== key) return 'none';
    if (sortDir === 'asc') return 'ascending';
    if (sortDir === 'desc') return 'descending';
    return 'none';
  }

  return (
    <div className={`${styles.wrapper} ${className}`}>
      {/* Horizontal scroll container for mobile */}
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} style={col.width ? { width: col.width } : undefined} />
            ))}
          </colgroup>

          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${styles.th} ${col.sortable ? styles.thSortable : ''}`}
                  aria-sort={col.sortable ? ariaSortValue(col.key) : undefined}
                  onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  onKeyDown={
                    col.sortable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') handleSort(col.key);
                        }
                      : undefined
                  }
                  tabIndex={col.sortable ? 0 : undefined}
                >
                  <div className={styles.thContent}>
                    <span>{col.header}</span>
                    {col.sortable && (
                      <span className={styles.sortIcon} aria-hidden="true">
                        {sortKey === col.key && sortDir === 'asc' ? (
                          <ChevronUp size={14} strokeWidth={2} />
                        ) : sortKey === col.key && sortDir === 'desc' ? (
                          <ChevronDown size={14} strokeWidth={2} />
                        ) : (
                          <ChevronsUpDown size={14} strokeWidth={2} />
                        )}
                      </span>
                    )}
                  </div>
                  {col.searchable && (
                    <input
                      type="search"
                      className={styles.columnSearch}
                      placeholder={`Filter ${col.header.toLowerCase()}…`}
                      value={columnFilters[col.key] ?? ''}
                      onChange={(e) => handleFilter(col.key, e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Filter by ${col.header}`}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className={styles.empty}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginated.map((row) => (
                <tr key={rowKey(row)} className={styles.tr}>
                  {columns.map((col) => (
                    <td key={col.key} className={styles.td}>
                      {col.accessor(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination controls */}
      {totalPages > 1 && (
        <div className={styles.pagination} role="navigation" aria-label="Table pagination">
          <span className={styles.paginationInfo}>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, sorted.length)} of{' '}
            {sorted.length}
          </span>
          <div className={styles.paginationBtns}>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              aria-label="Previous page"
            >
              ‹
            </button>
            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
              .reduce<(number | 'ellipsis')[]>((acc, p, idx, arr) => {
                if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('ellipsis');
                acc.push(p);
                return acc;
              }, [])
              .map((p, idx) =>
                p === 'ellipsis' ? (
                  <span key={`ellipsis-${idx}`} className={styles.ellipsis}>
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={`${styles.pageBtn} ${p === page ? styles.pageBtnActive : ''}`}
                    onClick={() => setPage(p)}
                    aria-label={`Page ${p}`}
                    aria-current={p === page ? 'page' : undefined}
                  >
                    {p}
                  </button>
                ),
              )}
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              aria-label="Next page"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
