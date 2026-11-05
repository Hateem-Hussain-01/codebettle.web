'use client';
import { useState } from 'react';
import { enrollments as allEnrollments } from '@/lib/data/enrollments';
import { getUserById } from '@/lib/data/users';
import { getCourseById } from '@/lib/data/courses';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import { Search, ClipboardList } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';

export default function AdminEnrollmentsPage() {
  const [search, setSearch] = useState('');

  const items = allEnrollments.map(e => ({
    enrollment: e,
    student: getUserById(e.studentId),
    course: getCourseById(e.courseId),
  }));

  const filtered = items.filter(i =>
    (i.student?.name.toLowerCase().includes(search.toLowerCase()) ||
    i.course?.title.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Enrollments</h1>
        <p className="text-muted text-sm mt-1">{allEnrollments.length} total enrollments</p>
      </div>

      <Input placeholder="Search by student or course..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} className="max-w-sm" />

      <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border bg-dark-border/20">
                {['Student', 'Course', 'Enrolled', 'Lessons', 'Payment', 'Status'].map(h => (
                  <th key={h} className="text-left text-muted text-xs py-3 px-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ enrollment, student, course }) => (
                <tr key={enrollment.id} className="border-b border-dark-border/40 last:border-0 hover:bg-dark-border/10 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <img src={student?.avatar || ''} alt={student?.name} className="w-7 h-7 rounded-full" />
                      <span className="text-white text-xs font-medium">{student?.name}</span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-muted text-xs max-w-[160px] truncate">{course?.title}</td>
                  <td className="py-3 px-4 text-muted text-xs">{formatDateShort(enrollment.enrolledAt)}</td>
                  <td className="py-3 px-4 text-muted text-xs">{enrollment.completedLessons.length}</td>
                  <td className="py-3 px-4">
                    <Badge variant={enrollment.paymentStatus === 'free' ? 'muted' : 'success'}>
                      {enrollment.paymentStatus === 'free' ? 'Free' : `PKR ${enrollment.amountPaid.toLocaleString()}`}
                    </Badge>
                  </td>
                  <td className="py-3 px-4">
                    <Badge variant={enrollment.isCompleted ? 'success' : 'info'}>
                      {enrollment.isCompleted ? 'Completed' : 'Active'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
