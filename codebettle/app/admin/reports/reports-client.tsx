'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Download, BarChart2, Users, DollarSign, BookOpen, Award, Star, AlertTriangle, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';
import type { Course, SafeUser } from '@/lib/db/types';
import type {
  AdminOverview,
  CourseReport,
  DataIntegritySummary,
  StudentReport,
} from '@/lib/services/reporting-service';

interface ReportsClientProps {
  initialOverview: AdminOverview;
  integrity: DataIntegritySummary;
  students: SafeUser[];
  courses: Course[];
  initialFrom: string;
  initialTo: string;
}

function buildQuery(from: string, to: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

export default function ReportsClient({
  initialOverview,
  integrity,
  students,
  courses,
  initialFrom,
  initialTo,
}: ReportsClientProps) {
  const [overview, setOverview] = useState<AdminOverview>(initialOverview);
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [courseReport, setCourseReport] = useState<CourseReport | null>(null);
  const [studentReport, setStudentReport] = useState<StudentReport | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchJson = async (url: string) => {
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error ?? 'Failed to load report');
    return body;
  };

  const applyDateFilter = async () => {
    setLoading(true);
    try {
      const data = await fetchJson(`/api/admin/reports${buildQuery(from, to)}`);
      setOverview(data);
      setCourseReport(null);
      setStudentReport(null);
      setSelectedCourseId('');
      setSelectedStudentId('');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  };

  const selectCourse = async (courseId: string) => {
    setSelectedCourseId(courseId);
    setSelectedStudentId('');
    setStudentReport(null);
    if (!courseId) {
      setCourseReport(null);
      return;
    }
    setLoading(true);
    try {
      setCourseReport(await fetchJson(`/api/admin/reports${buildQuery(from, to, { courseId })}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load course report');
      setCourseReport(null);
    } finally {
      setLoading(false);
    }
  };

  const selectStudent = async (studentId: string) => {
    setSelectedStudentId(studentId);
    setSelectedCourseId('');
    setCourseReport(null);
    if (!studentId) {
      setStudentReport(null);
      return;
    }
    setLoading(true);
    try {
      setStudentReport(await fetchJson(`/api/admin/reports${buildQuery(from, to, { studentId })}`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load student report');
      setStudentReport(null);
    } finally {
      setLoading(false);
    }
  };

  const exportCsv = (type: 'enrollments' | 'students' | 'courses' | 'revenue') => {
    // Server-side export: the full dataset in range, not a capped page.
    window.location.href = `/api/admin/reports/export${buildQuery(from, to, { type })}`;
    toast.success(`Exporting ${type} CSV…`);
  };

  const rangeLabel = overview.from || overview.to
    ? `${overview.from ?? '…'} to ${overview.to ?? '…'}`
    : 'All time';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Reports</h1>
        <p className="text-muted text-sm mt-1">Platform analytics and CSV exports · {rangeLabel}</p>
      </div>

      {/* Date range filter */}
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="report-from" className="block text-muted text-xs mb-1">From</label>
            <input
              id="report-from"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="bg-dark border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          <div>
            <label htmlFor="report-to" className="block text-muted text-xs mb-1">To</label>
            <input
              id="report-to"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="bg-dark border border-dark-border rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
          <Button size="sm" onClick={applyDateFilter} loading={loading}>
            <Calendar className="w-3.5 h-3.5" />Apply filter
          </Button>
          {(from || to) && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setFrom(''); setTo(''); }}
            >
              Clear
            </Button>
          )}
        </div>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Students', value: overview.usersByRole.student, icon: <Users className="w-6 h-6" />, color: 'text-blue-400 bg-blue-400/10' },
          { label: 'Total Enrollments', value: overview.totalEnrollments, icon: <BookOpen className="w-6 h-6" />, color: 'text-primary bg-primary/10' },
          { label: 'Completion Rate', value: `${overview.completionRate}%`, icon: <BarChart2 className="w-6 h-6" />, color: 'text-green-400 bg-green-400/10' },
          { label: 'Total Revenue', value: `PKR ${overview.totalRevenue.toLocaleString()}`, icon: <DollarSign className="w-6 h-6" />, color: 'text-purple-400 bg-purple-400/10' },
          { label: 'Certificates Issued', value: overview.certificatesIssued, icon: <Award className="w-6 h-6" />, color: 'text-yellow-400 bg-yellow-400/10' },
          { label: 'Published Courses', value: overview.coursesPublished, icon: <BookOpen className="w-6 h-6" />, color: 'text-cyan-400 bg-cyan-400/10' },
          { label: 'Avg. Course Rating', value: overview.averageRating === null ? '—' : `${overview.averageRating} / 5`, icon: <Star className="w-6 h-6" />, color: 'text-orange-400 bg-orange-400/10' },
          { label: 'Completions', value: overview.completedEnrollments, icon: <BarChart2 className="w-6 h-6" />, color: 'text-green-400 bg-green-400/10' },
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

      {/* Per-course / per-student reports */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <h3 className="text-white font-bold mb-1">Course report</h3>
          <p className="text-muted text-xs mb-4">Enrolments, completions, revenue and ratings for one course.</p>
          <select
            value={selectedCourseId}
            onChange={(e) => selectCourse(e.target.value)}
            className="w-full bg-dark border border-dark-border rounded-lg px-3 py-2 text-white text-sm mb-4"
          >
            <option value="">Select a course…</option>
            {courses.map(c => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
          {courseReport && (
            <div className="space-y-2 text-sm">
              <p className="text-white font-bold">{courseReport.course.title}</p>
              {[
                ['Enrollments', courseReport.enrollments],
                ['Students enrolled', courseReport.enrolledStudents],
                ['Completions', `${courseReport.completions} (${courseReport.completionRate}%)`],
                ['Revenue', `PKR ${courseReport.revenue.toLocaleString()}`],
                ['Reviews', `${courseReport.reviewCount}${courseReport.averageRating === null ? '' : ` · avg ${courseReport.averageRating} / 5`}`],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between border-b border-dark-border last:border-0 py-1">
                  <span className="text-muted">{label}</span>
                  <span className="text-white font-medium">{value}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <h3 className="text-white font-bold mb-1">Student report</h3>
          <p className="text-muted text-xs mb-4">Enrolments, progress and certificates for one student.</p>
          <select
            value={selectedStudentId}
            onChange={(e) => selectStudent(e.target.value)}
            className="w-full bg-dark border border-dark-border rounded-lg px-3 py-2 text-white text-sm mb-4"
          >
            <option value="">Select a student…</option>
            {students.map(s => (
              <option key={s.id} value={s.id}>{s.name} ({s.email})</option>
            ))}
          </select>
          {studentReport && (
            <div className="space-y-2 text-sm">
              <p className="text-white font-bold">{studentReport.student.name}</p>
              {[
                ['Enrollments', studentReport.enrollments],
                ['Completed', studentReport.completed],
                ['Certificates', studentReport.certificates],
                ['Total paid', `PKR ${studentReport.totalAmountPaid.toLocaleString()}`],
              ].map(([label, value]) => (
                <div key={label as string} className="flex justify-between border-b border-dark-border last:border-0 py-1">
                  <span className="text-muted">{label}</span>
                  <span className="text-white font-medium">{value}</span>
                </div>
              ))}
              {studentReport.courses.map(c => (
                <div key={c.courseId} className="flex justify-between border-b border-dark-border last:border-0 py-1">
                  <span className="text-muted truncate pr-2">{c.courseTitle}</span>
                  <span className="text-white font-medium flex-shrink-0">
                    {c.completedLessons}/{c.totalLessons} lessons ({c.progressPercent}%)
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Export Options */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: 'Student List', desc: 'All registered students with status and enrollment count', type: 'students' as const, color: 'text-blue-400' },
          { title: 'Enrollment Report', desc: 'All enrollments in range with student, course, date, and payment info', type: 'enrollments' as const, color: 'text-primary' },
          { title: 'Course Report', desc: 'Every course with enrollments, completions and revenue', type: 'courses' as const, color: 'text-purple-400' },
          { title: 'Revenue Summary', desc: 'Revenue breakdown per course with enrollment counts', type: 'revenue' as const, color: 'text-green-400' },
        ].map(report => (
          <Card key={report.title} hover>
            <BarChart2 className={`w-8 h-8 ${report.color} mb-3`} />
            <h3 className="text-white font-bold mb-1">{report.title}</h3>
            <p className="text-muted text-xs mb-4 leading-relaxed">{report.desc}</p>
            <Button size="sm" variant="outline" onClick={() => exportCsv(report.type)} fullWidth>
              <Download className="w-3.5 h-3.5" />Export CSV
            </Button>
          </Card>
        ))}
      </div>

      {/* Data integrity (read-only diagnostics) */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400" />
          <h3 className="text-white font-bold">Data integrity</h3>
          <span className="text-muted text-xs">
            {integrity.totalIssues === 0 ? 'No issues found' : `${integrity.totalIssues} issue${integrity.totalIssues === 1 ? '' : 's'} found`}
          </span>
        </div>
        <div className="space-y-2 text-sm">
          {integrity.checks.map(check => (
            <div key={check.key} className="flex justify-between gap-4 border-b border-dark-border last:border-0 py-1">
              <span className="text-muted">{check.label}</span>
              <span className={`font-medium flex-shrink-0 ${check.count === 0 ? 'text-green-400' : 'text-yellow-400'}`}>
                {check.count}
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
