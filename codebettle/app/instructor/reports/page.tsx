import { connection } from 'next/server';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { getInstructorReport } from '@/lib/services/reporting-service';
import Card from '@/components/ui/Card';
import { Users, BookOpen, DollarSign, BarChart2, Star } from 'lucide-react';

/**
 * Instructor reports — server-rendered page (Phase 4).
 * Shows the signed-in instructor's own courses only, with enrolments,
 * revenue and completion per course (via getInstructorReport, which
 * enforces the ownership scope itself). The instructor layout already
 * restricts this segment to instructors.
 */
export default async function InstructorReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const session = await getSession();
  if (!session) redirect('/auth/login');
  const sp = await searchParams;
  const from = typeof sp.from === 'string' ? sp.from : undefined;
  const to = typeof sp.to === 'string' ? sp.to : undefined;
  const reportResult = await getInstructorReport(session.id, { from, to });
  if ('error' in reportResult) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-black text-white">Reports</h1>
        <Card>
          <p className="text-muted text-sm">{reportResult.error}</p>
        </Card>
      </div>
    );
  }
  const report = reportResult;
  const rangeLabel = report.from || report.to
    ? `${report.from ?? '…'} to ${report.to ?? '…'}`
    : 'All time';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Reports</h1>
        <p className="text-muted text-sm mt-1">Your courses at a glance · {rangeLabel}</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'My Courses', value: report.totalCourses, icon: <BookOpen className="w-6 h-6" />, color: 'text-primary bg-primary/10' },
          { label: 'Total Enrollments', value: report.enrollments, icon: <Users className="w-6 h-6" />, color: 'text-blue-400 bg-blue-400/10' },
          { label: 'Completion Rate', value: `${report.completionRate}%`, icon: <BarChart2 className="w-6 h-6" />, color: 'text-green-400 bg-green-400/10' },
          { label: 'Total Revenue', value: `PKR ${report.revenue.toLocaleString()}`, icon: <DollarSign className="w-6 h-6" />, color: 'text-purple-400 bg-purple-400/10' },
        ].map(s => (
          <Card key={s.label} hover>
            <div className="flex items-center gap-3">
              <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${s.color}`}>{s.icon}</div>
              <div>
                <p className="text-xl font-black text-white">{s.value}</p>
                <p className="text-muted text-xs">{s.label}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="text-white font-bold mb-4">Per-course breakdown</h2>
        {report.courses.length === 0 ? (
          <p className="text-muted text-sm text-center py-8">No courses yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted text-xs text-left border-b border-dark-border">
                  <th className="py-2 pr-4 font-medium">Course</th>
                  <th className="py-2 pr-4 font-medium">Enrollments</th>
                  <th className="py-2 pr-4 font-medium">Completions</th>
                  <th className="py-2 pr-4 font-medium">Revenue</th>
                  <th className="py-2 font-medium">Rating</th>
                </tr>
              </thead>
              <tbody>
                {report.courses.map(c => (
                  <tr key={c.courseId} className="border-b border-dark-border last:border-0">
                    <td className="py-3 pr-4">
                      <p className="text-white font-medium">{c.courseTitle}</p>
                      <p className="text-muted text-xs">{c.status}</p>
                    </td>
                    <td className="py-3 pr-4 text-white">{c.enrollments}</td>
                    <td className="py-3 pr-4 text-white">
                      {c.completions} ({c.completionRate}%)
                    </td>
                    <td className="py-3 pr-4 text-white">PKR {c.revenue.toLocaleString()}</td>
                    <td className="py-3 text-white">
                      <span className="inline-flex items-center gap-1">
                        <Star className="w-3.5 h-3.5 text-yellow-400" />
                        {c.averageRating === null ? '—' : `${c.averageRating} (${c.reviewCount})`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
