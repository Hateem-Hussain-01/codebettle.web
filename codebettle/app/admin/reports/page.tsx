import { connection } from 'next/server';
import { getAllUsers, getStudents } from '@/lib/db/users';
import { getAllCourses } from '@/lib/db/courses';
import { getAdminOverview, getDataIntegritySummary } from '@/lib/services/reporting-service';
import ReportsClient from './reports-client';

/**
 * Admin reports — server wrapper (Phase 4).
 * Fetches the overview, integrity summary, students and courses on the
 * server. The client re-fetches through /api/admin/reports when the
 * date filter or a per-course / per-student selector changes, and
 * exports hit the server export endpoint (uncapped) instead of
 * building a CSV from a capped page in the browser.
 */
export default async function AdminReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const sp = await searchParams;
  const from = typeof sp.from === 'string' ? sp.from : undefined;
  const to = typeof sp.to === 'string' ? sp.to : undefined;
  const [overviewResult, integrity, students, courses] = await Promise.all([
    getAdminOverview({ from, to }),
    getDataIntegritySummary(),
    getStudents(),
    getAllCourses(),
  ]);
  // Bad dates in the URL fall back to the all-time overview.
  const overview = 'error' in overviewResult ? await getAdminOverview({}) : overviewResult;
  if ('error' in overview) {
    // Unreachable in practice (an empty range always validates), but
    // keep the type checker honest.
    throw new Error(overview.error);
  }
  return (
    <ReportsClient
      initialOverview={overview}
      integrity={integrity}
      students={students}
      courses={courses}
      initialFrom={from ?? ''}
      initialTo={to ?? ''}
    />
  );
}
