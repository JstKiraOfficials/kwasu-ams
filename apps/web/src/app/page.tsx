/**
 * @file page.tsx
 * @module app
 *
 * Public landing page for KWASU AMS at the root route `/`.
 *
 * Multi-section scrollable layout:
 * - Hero section: full-viewport KWASU branding with CTA.
 * - Features section: six key capabilities on a light background.
 * - Roles section: cards for each stakeholder type.
 * - Footer: university address and sign-in link.
 *
 * Static Server Component — no auth checks, no client hooks.
 */

import type { Metadata } from 'next';
import type { ReactElement } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import styles from './landing.module.css';

// ── Metadata ──────────────────────────────────────────────────────────────────

/**
 * Next.js page metadata for the landing route.
 */
export const metadata: Metadata = {
  title: 'KWASU AMS — Attendance Management System',
  description:
    'Kwara State University mobile-first, hardware-free attendance management system. Real-time data for every stakeholder.',
};

// ── Data ──────────────────────────────────────────────────────────────────────

/**
 * Feature card data displayed in the features section.
 */
const FEATURES: Array<{ title: string; description: string; emoji: string }> = [
  {
    emoji: '📍',
    title: 'GPS Check-In',
    description: 'Students check in from within the lecture venue geofence. No hardware required.',
  },
  {
    emoji: '📱',
    title: 'QR & Code Check-In',
    description:
      'Lecturer displays a QR code or alphanumeric code — students scan or type to attend.',
  },
  {
    emoji: '🔒',
    title: 'Proxy-Free',
    description:
      'Device binding, spoofing detection, and concurrent session checks eliminate proxy attendance.',
  },
  {
    emoji: '📊',
    title: 'Live Dashboards',
    description:
      'Every role sees real-time attendance data — from students to the Vice-Chancellor.',
  },
  {
    emoji: '🎓',
    title: 'Exam Eligibility',
    description:
      'Automatic eligibility computation with NUC 75% threshold, excuse letters, and HOD overrides.',
  },
  {
    emoji: '📴',
    title: 'Offline Support',
    description: 'Check-ins queue locally when offline and sync automatically on reconnection.',
  },
];

/**
 * Role card data displayed in the roles section.
 */
const ROLES: Array<{ role: string; description: string }> = [
  {
    role: 'Students',
    description:
      'Check in to lectures, track attendance health, and submit excuse letters from the mobile app.',
  },
  {
    role: 'Lecturers',
    description:
      'Open sessions, display QR codes, monitor live check-ins, and manage at-risk students.',
  },
  {
    role: 'HODs',
    description:
      'Oversee department attendance, review escalated excuses, and track course performance.',
  },
  {
    role: 'Deans',
    description: 'Faculty-wide analytics, department breakdowns, and eligibility oversight.',
  },
  {
    role: 'Exam Officers',
    description:
      'University-wide eligibility summary with faculty breakdown and barred student reports.',
  },
  {
    role: 'Vice-Chancellor',
    description: 'University overview — live sessions, faculty chart, and flagged course alerts.',
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Public landing page component.
 *
 * Renders a scrollable multi-section page with a full-viewport hero,
 * features grid, stakeholder roles grid, and a site footer.
 *
 * @returns The rendered landing page element.
 */
export default function LandingPage(): ReactElement {
  return (
    <div className={styles.page}>
      {/* ── Hero ── */}
      <section className={styles.hero} aria-label="Hero">
        {/* Background image fixed behind hero */}
        <div className={styles.heroBgWrapper} aria-hidden="true">
          <Image
            src="/background.jpg"
            alt=""
            fill
            className={styles.heroBgImage}
            priority
            sizes="100vw"
          />
          <div className={styles.heroBgScrim} />
        </div>

        {/* Nav bar */}
        <nav className={styles.nav} aria-label="Site navigation">
          <div className={styles.navLogo}>
            <Image
              src="/kwasuLogo.png"
              alt="KWASU logo"
              width={36}
              height={36}
              className={styles.navLogoImage}
              priority
            />
            <span className={styles.navLogoText}>KWASU AMS</span>
          </div>
          <Link href="/login" className={styles.navSignIn}>
            Sign in
          </Link>
        </nav>

        {/* Hero content */}
        <div className={styles.heroContent}>
          <h1 className={styles.heroHeadline}>
            Attendance,
            <br />
            Simplified.
          </h1>
          <p className={styles.heroSubtext}>
            Kwara State University&apos;s mobile-first, hardware-free attendance management system —
            real-time, proxy-free, and built for every stakeholder.
          </p>

          <ul className={styles.heroPills} aria-label="Key features">
            <li className={styles.heroPill}>GPS check-in</li>
            <li className={styles.heroPill}>QR &amp; code check-in</li>
            <li className={styles.heroPill}>Live dashboards</li>
            <li className={styles.heroPill}>Exam eligibility</li>
            <li className={styles.heroPill}>Proxy-free</li>
          </ul>

          <Link href="/login" className={styles.heroCta}>
            Sign in to your account
          </Link>

          {/* Scroll hint */}
          <div className={styles.scrollHint} aria-hidden="true">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className={styles.featuresSection} aria-labelledby="features-heading">
        <div className={styles.sectionInner}>
          <h2 id="features-heading" className={styles.sectionHeading}>
            Everything you need
          </h2>
          <p className={styles.sectionSubtext}>
            Six attendance methods, real-time analytics, and automatic exam eligibility — all in one
            system.
          </p>
          <ul className={styles.featuresGrid} aria-label="Feature list">
            {FEATURES.map((f) => (
              <li key={f.title} className={styles.featureCard}>
                <span className={styles.featureEmoji} aria-hidden="true">
                  {f.emoji}
                </span>
                <h3 className={styles.featureTitle}>{f.title}</h3>
                <p className={styles.featureDesc}>{f.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Roles ── */}
      <section className={styles.rolesSection} aria-labelledby="roles-heading">
        <div className={styles.sectionInner}>
          <h2 id="roles-heading" className={styles.sectionHeading}>
            Built for every stakeholder
          </h2>
          <p className={styles.sectionSubtext}>
            Each role has a tailored dashboard and workflow — from students checking in to the
            Vice-Chancellor monitoring the university.
          </p>
          <ul className={styles.rolesGrid} aria-label="Stakeholder roles">
            {ROLES.map((r) => (
              <li key={r.role} className={styles.roleCard}>
                <h3 className={styles.roleTitle}>{r.role}</h3>
                <p className={styles.roleDesc}>{r.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerLogo}>
            <Image src="/kwasuLogo.png" alt="KWASU logo" width={28} height={28} />
            <span className={styles.footerLogoText}>KWASU AMS</span>
          </div>
          <p className={styles.footerAddress}>
            Kwara State University &mdash; Malete, Kwara State, Nigeria
          </p>
          <Link href="/login" className={styles.footerSignIn}>
            Sign in →
          </Link>
        </div>
      </footer>
    </div>
  );
}
