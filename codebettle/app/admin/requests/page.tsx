import { connection } from 'next/server';
import { listSupportRequestsForAdmin } from '@/lib/db/support-requests';
import { getCourseById } from '@/lib/db/courses';
import { getUserById } from '@/lib/db/users';
import type { AdminRequest } from '@/components/requests/request-types';
import RequestsClient from './requests-client';

const PAGE_SIZE = 20;
/** Cap for the search path: search loads this many rows, enriches, then filters. */
const SEARCH_WINDOW = 500;

/**
 * Admin support-request queue — server wrapper (Phase 3, Worker C).
 * Admin-only: the admin layout enforces the new 'requests' area
 * server-side (lib/admin-access.ts). This inbox is deliberately
 * SEPARATE from the public contact-message inbox at /admin/messages.
 *
 * The API returns BARE SupportRequest rows (studentId + courseId
 * only — no name, email or course title), so this page enriches each
 * row server-side with the student (name/email) and the course title
 * before handing it to the client. Search by student name/email/
 * subject therefore runs here too: with `q` set, the newest 500 rows
 * are loaded, enriched and filtered, then paginated in memory.
 */
export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; q?: string; page?: string }>;
}) {
  await connection();
  const params = await searchParams;
  const status = params.status || '';
  const category = params.category || '';
  const q = (params.q || '').trim();
  const page = Math.max(1, Number(params.page) || 1);

  const enrich = async (rows: Awaited<ReturnType<typeof listSupportRequestsForAdmin>>['items']): Promise<AdminRequest[]> => {
    const studentIds = [...new Set(rows.map((r) => r.studentId))];
    const courseIds = [...new Set(rows.map((r) => r.courseId).filter((c): c is string => Boolean(c)))];
    const students = new Map<string, { name: string; email: string }>();
    const courses = new Map<string, string>();
    await Promise.all([
      ...studentIds.map(async (id) => {
        const user = await getUserById(id);
        if (user) students.set(id, { name: user.name, email: user.email });
      }),
      ...courseIds.map(async (id) => {
        const course = await getCourseById(id);
        if (course) courses.set(id, course.title);
      }),
    ]);
    return rows.map((r) => ({
      ...r,
      studentName: students.get(r.studentId)?.name ?? 'Unknown student',
      studentEmail: students.get(r.studentId)?.email ?? '',
      courseTitle: r.courseId ? (courses.get(r.courseId) ?? null) : null,
    }));
  };

  let requests: AdminRequest[];
  let total: number;
  let totalPages: number;

  if (q) {
    const needle = q.toLowerCase();
    const window = await listSupportRequestsForAdmin({ status: status || undefined, category: category || undefined, limit: String(SEARCH_WINDOW) });
    const enriched = await enrich(window.items);
    const filtered = enriched.filter(
      (r) =>
        r.studentName.toLowerCase().includes(needle) ||
        r.studentEmail.toLowerCase().includes(needle) ||
        r.subject.toLowerCase().includes(needle),
    );
    total = filtered.length;
    totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    requests = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  } else {
    const pageData = await listSupportRequestsForAdmin({
      status: status || undefined,
      category: category || undefined,
      page: String(page),
      limit: String(PAGE_SIZE),
    });
    requests = await enrich(pageData.items);
    total = pageData.total;
    totalPages = pageData.totalPages;
  }

  return (
    <RequestsClient
      initialRequests={requests}
      total={total}
      totalPages={totalPages}
      page={page}
      statusFilter={status}
      categoryFilter={category}
      search={q}
    />
  );
}
