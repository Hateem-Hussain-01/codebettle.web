'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Modal from '@/components/ui/Modal';
import { Search, Plus, Edit, Trash2, Eye, EyeOff, Star, Video } from 'lucide-react';
import { formatPrice } from '@/lib/utils';
import Link from 'next/link';
import toast from 'react-hot-toast';
import type { Course } from '@/lib/db/types';

interface CoursesClientProps {
  courses: Course[];
  instructorNames: Record<string, string>;
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

  const toggleStatus = (id: string) => {
    setCourseList(cs => cs.map(c => c.id === id ? { ...c, status: c.status === 'published' ? 'draft' : 'published' as any } : c));
    toast.success('Course status updated');
  };

  const toggleFeatured = (id: string) => {
    setCourseList(cs => cs.map(c => c.id === id ? { ...c, isFeatured: !c.isFeatured } : c));
    toast.success('Featured status updated');
  };

  const deleteCourse = (id: string) => {
    setCourseList(cs => cs.filter(c => c.id !== id));
    setDeleteTarget(null);
    toast.success('Course deleted');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Courses</h1>
          <p className="text-muted text-sm mt-1">{filtered.length} course{filtered.length !== 1 ? 's' : ''}</p>
        </div>
        <Link href="/admin/courses/new"><Button><Plus className="w-4 h-4" />Create Course</Button></Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input placeholder="Search courses..." value={search} onChange={e => setSearch(e.target.value)} icon={<Search className="w-4 h-4" />} className="max-w-xs" />
        <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} options={[{ value: 'all', label: 'All Status' }, { value: 'published', label: 'Published' }, { value: 'draft', label: 'Draft' }, { value: 'archived', label: 'Archived' }]} />
      </div>

      <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
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
                        <img src={course.thumbnail} alt={course.title} className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-white text-xs font-medium truncate max-w-[160px]">{course.title}</p>
                          {course.isFeatured && <span className="text-primary text-xs">★ Featured</span>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-muted text-xs">{instructorNames[course.instructorId]}</td>
                    <td className="py-3 px-4 text-muted text-xs">{course.category}</td>
                    <td className="py-3 px-4"><span className={`text-xs font-medium ${course.isFree ? 'text-green-400' : 'text-primary'}`}>{formatPrice(course.price)}</span></td>
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
                        <button onClick={() => toggleStatus(course.id)} title={course.status === 'published' ? 'Unpublish' : 'Publish'} className="text-muted hover:text-primary transition-colors p-1 cursor-pointer">
                          {course.status === 'published' ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                        <button onClick={() => toggleFeatured(course.id)} title="Toggle Featured" className={`p-1 cursor-pointer transition-colors ${course.isFeatured ? 'text-primary' : 'text-muted hover:text-primary'}`}>
                          <Star className="w-4 h-4" />
                        </button>
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
      </div>

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
