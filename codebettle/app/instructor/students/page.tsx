import { getSession } from '@/lib/auth';
import { getCoursesByInstructor } from '@/lib/data/courses';
import { enrollments } from '@/lib/data/enrollments';
import { getUserById } from '@/lib/data/users';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import { Users, Award } from 'lucide-react';
import { formatDateShort } from '@/lib/utils';

export default async function InstructorStudentsPage() {
  const session = await getSession();
  const myCourses = getCoursesByInstructor(session!.id);
  const courseIds = myCourses.map(c => c.id);
  const myEnrollments = enrollments.filter(e => courseIds.includes(e.courseId));

  const uniqueStudentIds = [...new Set(myEnrollments.map(e => e.studentId))];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white">Students</h1>
        <p className="text-muted text-sm mt-1">{uniqueStudentIds.length} unique student{uniqueStudentIds.length !== 1 ? 's' : ''} across {myCourses.length} course{myCourses.length !== 1 ? 's' : ''}</p>
      </div>

      {myCourses.map(course => {
        const courseEnrollments = myEnrollments.filter(e => e.courseId === course.id);
        if (courseEnrollments.length === 0) return null;
        return (
          <Card key={course.id}>
            <div className="flex items-center gap-3 mb-4">
              <img src={course.thumbnail} alt={course.title} className="w-12 h-12 rounded-lg object-cover" />
              <div>
                <h3 className="text-white font-semibold text-sm">{course.title}</h3>
                <p className="text-muted text-xs">{courseEnrollments.length} enrolled</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dark-border">
                    <th className="text-left text-muted text-xs py-2 pr-4">Student</th>
                    <th className="text-left text-muted text-xs py-2 pr-4">Enrolled</th>
                    <th className="text-left text-muted text-xs py-2 pr-4">Lessons Accessed</th>
                    <th className="text-left text-muted text-xs py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {courseEnrollments.map(enr => {
                    const student = getUserById(enr.studentId);
                    return (
                      <tr key={enr.id} className="border-b border-dark-border/40 last:border-0">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-2">
                            <img src={student?.avatar || ''} alt={student?.name} className="w-7 h-7 rounded-full" />
                            <span className="text-white text-xs font-medium">{student?.name}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-muted text-xs">{formatDateShort(enr.enrolledAt)}</td>
                        <td className="py-3 pr-4 text-muted text-xs">{enr.completedLessons.length}</td>
                        <td className="py-3">
                          {enr.isCompleted
                            ? <Badge variant="success"><Award className="w-3 h-3 mr-1" />Completed</Badge>
                            : <Badge variant="info">In Progress</Badge>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
