/**
 * @file Tabs.tsx
 * @module components/ui/Tabs
 *
 * Horizontal tab bar with an animated active underline. Keyboard-navigable
 * (left/right arrows move focus between tabs). The active tab panel fades in
 * using the `fadeIn` keyframe defined in `globals.css`.
 */

'use client';

import { useRef, useCallback } from 'react';
import styles from './Tabs.module.css';

/**
 * A single tab entry.
 */
export interface TabItem {
  /** Unique key used as the tab identifier. */
  key: string;
  /** Label displayed in the tab button. */
  label: string;
  /** Optional icon rendered to the left of the label. */
  icon?: React.ReactNode;
  /** Content rendered in the tab panel when this tab is active. */
  content: React.ReactNode;
}

/**
 * Props accepted by the `Tabs` component.
 */
export interface TabsProps {
  /** Ordered list of tab definitions. */
  tabs: TabItem[];
  /** Key of the currently active tab (controlled). */
  activeKey: string;
  /**
   * Called when the user selects a different tab.
   *
   * @param key - The `key` of the newly selected tab.
   */
  onChange: (key: string) => void;
  /** Additional class names applied to the root wrapper `<div>`. */
  className?: string;
}

/**
 * Horizontal tab navigation component.
 *
 * Implements the ARIA `tablist` / `tab` / `tabpanel` pattern. Arrow key
 * navigation cycles through tabs without requiring a mouse click, meeting
 * WCAG 2.1 keyboard accessibility requirements.
 *
 * @param props - `TabsProps` with `tabs`, `activeKey`, `onChange`, and optional `className`.
 * @returns The tab list and the active tab's content panel.
 */
export function Tabs({ tabs, activeKey, onChange, className = '' }: TabsProps): React.JSX.Element {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  /** Handles left/right arrow key navigation between tab buttons. */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, idx: number): void => {
      let next = idx;
      if (e.key === 'ArrowRight') next = (idx + 1) % tabs.length;
      else if (e.key === 'ArrowLeft') next = (idx - 1 + tabs.length) % tabs.length;
      else return;

      e.preventDefault();
      tabRefs.current[next]?.focus();
      const nextTab = tabs[next];
      if (nextTab) onChange(nextTab.key);
    },
    [tabs, onChange],
  );

  const activeTab = tabs.find((t) => t.key === activeKey);

  return (
    <div className={`${styles.tabsRoot} ${className}`}>
      <div role="tablist" className={styles.tabList} aria-label="Page sections">
        {tabs.map((tab, idx) => {
          const isActive = tab.key === activeKey;
          return (
            <button
              key={tab.key}
              ref={(el) => {
                tabRefs.current[idx] = el;
              }}
              role="tab"
              type="button"
              id={`tab-${tab.key}`}
              aria-controls={`tabpanel-${tab.key}`}
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={`${styles.tab} ${isActive ? styles.tabActive : ''}`}
              onClick={() => onChange(tab.key)}
              onKeyDown={(e) => handleKeyDown(e, idx)}
            >
              {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab && (
        <div
          key={activeKey}
          role="tabpanel"
          id={`tabpanel-${activeKey}`}
          aria-labelledby={`tab-${activeKey}`}
          className={styles.tabPanel}
          tabIndex={0}
        >
          {activeTab.content}
        </div>
      )}
    </div>
  );
}
