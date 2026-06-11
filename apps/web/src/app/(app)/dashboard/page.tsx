'use client';

/**
 * @file page.tsx
 * @module app/(app)/dashboard
 *
 * Role-based dashboard route at `/dashboard`.
 *
 * A single route serves all 8 roles. The correct dashboard component is
 * selected by looking up `user.role` in the `dashboards` map. No redirects
 * to role-specific sub-routes are used — all roles share `/dashboard`.
 *
 * Authenticated by the `(app)` layout guard — this page only renders when
 * `user` is present.
 */

import type { ReactElement } from 'react';
import { Role } from '@kwasu-ams/types';
import { useAuth } from '../../../hooks/use-auth';
import { StudentDashboard } from '../../../components/dashboard/StudentDashboard';
import { LecturerDashboard } from '../../../components/dashboard/LecturerDashboard';
import { HodDashboard } from '../../../components/dashboard/HodDashboard';
import { DeanDashboard } from '../../../components/dashboard/DeanDashboard';
import { ExamOfficerDashboard } from '../../../components/dashboard/ExamOfficerDashboard';
import { AcademicAffairsDashboard } from '../../../components/dashboard/AcademicAffairsDashboard';
import { ViceChancellorDashboard } from '../../../components/dashboard/ViceChancellorDashboard';
import { SuperAdminDashboard } from '../../../components/dashboard/SuperAdminDashboard';

// ── Role → component map ──────────────────────────────────────────────────────

/**
 * Maps each {@link Role} value to its corresponding dashboard component.
 * Components are rendered with no props — each one reads from `useDashboard`.
 */
const DASHBOARDS: Record<Role, () => ReactElement> = {
  [Role.STUDENT]: StudentDashboard,
  [Role.LECTURER]: LecturerDashboard,
  [Role.HOD]: HodDashboard,
  [Role.DEAN]: DeanDashboard,
  [Role.EXAM_OFFICER]: ExamOfficerDashboard,
  [Role.ACADEMIC_AFFAIRS]: AcademicAffairsDashboard,
  [Role.VICE_CHANCELLOR]: ViceChancellorDashboard,
  [Role.SUPER_ADMIN]: SuperAdminDashboard,
};

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Dashboard page component.
 *
 * Reads the authenticated user's role from `AuthContext` and renders the
 * matching dashboard. Falls back to a neutral message for unrecognised roles.
 * The `(app)` layout guarantees `user` is non-null before this renders.
 *
 * @returns The role-matched dashboard element, or a fallback message.
 */
export default function DashboardPage(): ReactElement {
  const { user } = useAuth();
  const role = user?.role as Role | undefined;
  const Dashboard = role ? DASHBOARDS[role] : undefined;

  if (!Dashboard) {
    return (
      <p style={{ padding: '2rem', color: 'var(--color-text-secondary)' }}>
        No dashboard available for your role.
      </p>
    );
  }

  return <Dashboard />;
}
