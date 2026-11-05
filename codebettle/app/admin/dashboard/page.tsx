'use client';
import { users, getStudents, getInstructors } from '@/lib/data/users';
import { courses } from '@/lib/data/courses';
import { enrollments } from '@/lib/data/enrollments';
import StatCard from '@/components/ui/StatCard';
import Card from '@/components/ui/Card';
import { Users, BookOpen, GraduationCap, DollarSign, TrendingUp, Clock } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const MONTH_DATA = [
  { month: 'Jan', enrollments: 42 }, { month: 'Feb', enrollments: 58 },
  { month: 'Mar', enrollments: 75 }, { month: 'Apr', enrollments: 91 },
  { month: 'May', enrollments: 112 }, { month: 'Jun', enrollments: 134 },
];

const CATEGORY_DATA = [
  { name: 'Web Dev', value: 35, color: '#3B82F6' },
  { name: 'Mobile', value: 22, color: '#8B5CF6' },
  { name: 'Data Science', value: 20, color: '#10B981' },
  { name: 'UI/UX', value: 15, color: '#EC4899' },
  { name: 'DevOps', value: 8, color: '#F59E0B' },
];

const totalRevenue = enrollments.reduce((acc, e) => acc + e.amountPaid, 0);
const publishedCount = courses.filter(c => c.status === 'published').length;
const recentEnrollments = enrollments.slice(-6).reverse();

export default function AdminDashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-black text-white">Admin Dashboard</h1>
        <p className="text-muted text-sm mt-1">Platform overview and analytics</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Students" value={getStudents().length} icon={<Users className="w-6 h-6" />} color="blue" trend={{ value: 12, label: 'this month' }} />
        <StatCard title="Total Courses" value={publishedCount} icon={<BookOpen className="w-6 h-6" />} color="yellow" />
        <StatCard title="Instructors" value={getInstructors().length} icon={<GraduationCap className="w-6 h-6" />} color="green" />
        <StatCard title="Total Revenue" value={`PKR ${(totalRevenue / 1000).toFixed(0)}K`} icon={<DollarSign className="w-6 h-6" />} color="purple" trend={{ value: 8, label: 'this month' }} />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2"><TrendingUp className="w-4 h-4 text-primary" />Enrollments (2024)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={MONTH_DATA}>
              <XAxis dataKey="month" stroke="#6B7280" tick={{ fontSize: 12 }} />
              <YAxis stroke="#6B7280" tick={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ backgroundColor: '#1C1C1C', border: '1px solid #2A2A2A', borderRadius: '8px', color: '#fff' }} />
              <Bar dataKey="enrollments" fill="#F5C518" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <h3 className="text-white font-bold mb-4">Course Categories</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={CATEGORY_DATA} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value">
                {CATEGORY_DATA.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip contentStyle={{ backgroundColor: '#1C1C1C', border: '1px solid #2A2A2A', borderRadius: '8px', color: '#fff' }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            {CATEGORY_DATA.map(d => (
              <div key={d.name} className="flex items-center gap-1.5 text-xs text-muted">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                {d.name}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <h3 className="text-white font-bold mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-primary" />Recent Enrollments</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border">
                {['Student', 'Course', 'Date', 'Status', 'Amount'].map(h => (
                  <th key={h} className="text-left text-muted text-xs py-2 pr-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentEnrollments.map(enr => {
                const student = users.find(u => u.id === enr.studentId);
                const course = courses.find(c => c.id === enr.courseId);
                return (
                  <tr key={enr.id} className="border-b border-dark-border/40 last:border-0">
                    <td className="py-3 pr-4 text-white text-xs">{student?.name}</td>
                    <td className="py-3 pr-4 text-muted text-xs max-w-[160px] truncate">{course?.title}</td>
                    <td className="py-3 pr-4 text-muted text-xs">{formatDateShort(enr.enrolledAt)}</td>
                    <td className="py-3 pr-4"><span className={`text-xs px-2 py-0.5 rounded-full ${enr.isCompleted ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400'}`}>{enr.isCompleted ? 'Completed' : 'Active'}</span></td>
                    <td className="py-3 text-muted text-xs">{enr.amountPaid === 0 ? 'Free' : `PKR ${enr.amountPaid.toLocaleString()}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
