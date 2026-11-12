'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import CourseThumbnail from '@/components/ui/CourseThumbnail';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import FadeIn from '@/components/ui/FadeIn';
import { Search, Plus, Edit, Trash2, Eye, EyeOff, Star, Video, Archive } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import Link from 'next/link';
import toast from 'react-hot-toast';
import type { Course } from '@/lib/db/types';

interface CoursesClientProps {
  courses: Course[];
  instructorNames: Record<string, string>;
}

/** PATCH one course field via the admin API; returns the updated course or null. */
async function patchCourse(id: string, body: Record<string, unknown>): Promise<Course | null> {
  const res = await fetch(`/api/admin/courses/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) { toast.error(data.error || 'Could not update course'); return null; }
  return data.course as Course;
}

export default function CoursesClient({ courses: allCourses, instructorNames }: CoursesClientProps) {
  const [courseList, setCourseList] = useState(allCourses);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const filtered = courseList.filter(c => {
    const matchSearch = c.title.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const toggleStatus = async (id: string) => {
    const course = courseList.find(c => c.id === id);
    if (!course) return;
    // Publish <-> draft. An archived course publishes again from here.
    const nextStatus = course.status === 'published' ? 'draft' : 'published';
    const updated = await patchCourse(id, { status: nextStatus });
    if (!updated) return;
    setCourseList(cs => cs.map(c => c.id === id ? updated : c));
    toast.success(nextStatus === 'published' ? 'Course published' : 'Course moved to draft');
  };

  const archiveCourse = async (id: string) => {
    const updated = await patchCourse(id, { status: 'archived' });
    if (!updated) return;
    setCourseList(cs => cs.map(c => c.id === id ? updated : c));
    toast.success('Course archived');
  };

  const toggleFeatured = async (id: string) => {
    const course = courseList.find(c => c.id === id);
    if (!course) return;
    const updated = await patchCourse(id, { isFeatured: !course.isFeatured });
    if (!updated) return;
    setCourseList(cs => cs.map(c => c.id === id ? updated : c));
    toast.success(updated.isFeatured ? 'Course featured' : 'Course unfeatured');
  };

  const deleteCourse = async (id: string) => {
    const res = await fetch(`/api/admin/courses/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { toast.error(data.error || 'Could not delete course'); return; }
    setCourseList(cs => cs.filter(c => c.id !== id));
    setDeleteTarget(null);
    toast.success('Course deleted');
  };

  return (
    <div className="space-y-6">
      <FadeIn className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-foreground">Courses</h1>
          <p className="text-muted text-sm mt-1">{filtered.length} course{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/admin/courses/new"><Button><Plus className="w-4 h-4" />Create Course</Button></Link>
      </FadeIn>

      {/* Filters */}
      <FadeIn delay={0.05} className="flex flex-wrap gap-3">
        <Input placeholder="Search courses..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} className="max-w-xs" />
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} options={[{ value: 'all', label: 'All Status' }, { value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived' }]} />
      </FadeIn>

      <FadeIn delay={0.1} className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-border bg-dark-border/20">
                {['Course', 'Instructor', 'Category', 'Price', 'Students', 'Status', 'Actions'].map(h => (
                  <th key={h} className="text-left text-muted text-xs py-3 px-4 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(course => {
                return (
                  <tr key={course.id} className="border-b border-dark-border/40 last:border-0 hover:bg-dark-border/10 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <CourseThumbnail src={course.thumbnail} alt={course.title} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-foreground text-xs font-medium truncate max-w-[160px]">{course.title}</p>
                          {course.isFeatured && <span className="text-primary-text text-xs">★ Featured</span>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted text-xs">{instructorNames[course.instructorId]}</td>
                    <td className="py-3 px-4 text-muted text-xs">{course.category}</td>
                    <td className="py-3 px-4"><span className={`text-xs font-medium ${course.isFree ? 'text-green-400' : 'text-primary-text'}`}>{formatPrice(course.price)}</span></td>
                    <td className="py-3 px-4 text-muted text-xs">{course.enrolledCount}</td>
                    <td className="py-3 px-4">
                      <Badge variant={course.status === 'published' ? 'success' : course.status === 'draft' ? 'warning' : 'muted'}>
                        {course.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1">
                        <Link href={`/admin/courses/${course.id}`} title="View Details" className="text-muted hover:text-blue-400 transition-colors p-1">
                          <Edit className="w-4 h-4" />
                        </Link>
                        <button onClick={() => toggleStatus(course.id)} title={course.status === 'published' ? 'Unpublish' : 'Publish'} className="text-muted hover:text-primary-text transition-colors p-1 cursor-pointer">
                          {course.status === 'published' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button onClick={() => toggleFeatured(course.id)} title="Toggle Featured" className={`p-1 cursor-pointer transition-colors ${course.isFeatured ? 'text-primary-text' : 'text-muted hover:text-primary-text'}`}>
                          <Star className="w-4 h-4" />
                        </button>
                        {course.status !== 'archived' && (
                          <button onClick={() => archiveCourse(course.id)} title="Archive" className="text-muted hover:text-yellow-400 transition-colors p-1 cursor-pointer">
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => setDeleteTarget(course.id)} className="text-muted hover:text-red-400 transition-colors p-1 cursor-pointer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </FadeIn>

      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Course" size="sm">
        <p className="text-muted text-sm mb-6">Are you sure you want to delete this course? This action cannot be undone.</p>
        <div className="flex gap-3">
          <Button variant="secondary" fullWidth onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" fullWidth onClick={() => deleteCourse(deleteTarget!)}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
