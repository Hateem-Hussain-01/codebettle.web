'use client';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Download, BarChart2, Users, DollarSign, BookOpen } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';
import type { Course, Enrollment, SafeUser } from '@/lib/db/types';

const downloadCSV = (data: string[][], filename: string) => {
  const csv = data.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
  toast.success(`${filename} downloaded!`);
};

interface ReportsClientProps {
  students: SafeUser[];
  users: SafeUser[];
  courses: Course[];
  enrollments: Enrollment[];
}

export default function ReportsClient({ students, users, courses, enrollments }: ReportsClientProps) {
  const totalRevenue = enrollments.reduce((acc, e) => acc + e.amountPaid, 0);
  const completedCount = enrollments.filter(e => e.isCompleted).length;

  const exportStudents = () => {
    const data = [['Name', 'Email', 'Status', 'Joined', 'Enrolled Courses'], ...students.map(s => [s.name, s.email, s.status, s.joinedAt, String(s.enrolledCourses?.length || 0)])];
    downloadCSV(data, 'codebettle-students.csv');
  };

  const exportEnrollments = () => {
    const data = [['Student', 'Course', 'Enrolled Date', 'Completed', 'Amount Paid'], ...enrollments.map(e => {
      const student = users.find(u => u.id === e.studentId);
      const course = courses.find(c => c.id === e.courseId);
      return [student?.name || '', course?.title || '', e.enrolledAt, e.isCompleted ? 'Yes' : 'No', String(e.amountPaid)];
    })];
    downloadCSV(data, 'codebettle-enrollments.csv');
  };

  const exportRevenue = () => {
    const data = [['Course', 'Category', 'Enrollments', 'Revenue (PKR)'], ...courses.map(c => {
      const courseEnr = enrollments.filter(e => e.courseId === c.id);
      const revenue = courseEnr.reduce((a, e) => a + e.amountPaid, 0);
      return [c.title, c.category, String(courseEnr.length), String(revenue)];
    })];
    downloadCSV(data, 'codebettle-revenue.csv');
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Reports</h1>
        <p className="text-muted text-sm mt-1">Export platform data as CSV</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Students', value: students.length, icon: <Users className="w-6 h-6" />, color: 'text-blue-400 bg-blue-400/10' },
          { label: 'Total Enrollments', value: enrollments.length, icon: <BookOpen className="w-6 h-6" />, color: 'text-primary bg-primary/10' },
          { label: 'Completions', value: completedCount, icon: <BarChart2 className="w-6 h-6" />, color: 'text-green-400 bg-green-400/10' },
          { label: 'Total Revenue', value: `PKR ${(totalRevenue / 1000).toFixed(0)}K`, icon: <DollarSign className="w-6 h-6" />, color: 'text-purple-400 bg-purple-400/10' },
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

      {/* Export Options */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { title: 'Student List', desc: 'All registered students with status and enrollment count', action: exportStudents, color: 'text-blue-400' },
          { title: 'Enrollment Report', desc: 'All enrollments with student, course, date, and payment info', action: exportEnrollments, color: 'text-primary' },
          { title: 'Revenue Summary', desc: 'Revenue breakdown per course with enrollment counts', action: exportRevenue, color: 'text-green-400' },
        ].map(report => (
          <Card key={report.title} hover>
            <BarChart2 className={`w-8 h-8 ${report.color} mb-3`} />
            <h3 className="text-white font-bold mb-1">{report.title}</h3>
            <p className="text-muted text-xs mb-4 leading-relaxed">{report.desc}</p>
            <Button size="sm" variant="outline" onClick={report.action} fullWidth>
              <Download className="w-3.5 h-3.5" />Export CSV
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
