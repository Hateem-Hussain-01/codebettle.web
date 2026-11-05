'use client';
import { use, useState } from 'react';
import { notFound } from 'next/navigation';
import { getCourseById } from '@/lib/data/courses';
import { getEnrollmentsByCourse } from '@/lib/data/enrollments';
import { getUserById } from '@/lib/data/users';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import StarRating from '@/components/ui/StarRating';
import {
  Video, ExternalLink, Save, Download, ChevronDown, ChevronUp,
  Users, BookOpen, Plus, Trash2, ArrowLeft, X, CheckCircle,
  AlertCircle, Clock, Calendar, CheckSquare, Square
} from 'lucide-react';
import { formatDateShort, formatPrice } from '@/lib/utils';
import toast from 'react-hot-toast';
import Link from 'next/link';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export default function InstructorCourseManagePage({ params }: PageProps<'/instructor/courses/[id]'>) {
  const { id } = use(params);
  const course = getCourseById(id);
  if (!course) notFound();

  const enrolledStudents = getEnrollmentsByCourse(id).map(e => ({
    enrollment: e,
    student: getUserById(e.studentId),
  })).filter(item => item.student);

  /* ── State ── */
  const [activeTab, setActiveTab] = useState<'recordings' | 'curriculum' | 'schedule'>('recordings');
  const [zoomLink, setZoomLink] = useState(course.zoomLink || '');
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({ [course.modules[0]?.id]: true });
  const [recordings, setRecordings] = useState<Record<string, string>>(
    Object.fromEntries(course.modules.flatMap(m => m.lessons.map(l => [l.id, l.driveRecordingUrl || ''])))
  );

  // Curriculum builder state (instructor edits)
  const [modules, setModules] = useState(course.modules.map(m => ({
    ...m,
    lessons: m.lessons.map(l => ({ ...l })),
  })));
  const [curriculumSaved, setCurriculumSaved] = useState(course.modules.length > 0);

  // Mark complete modal
  const [completeModal, setCompleteModal] = useState(false);
  const [privateReview, setPrivateReview] = useState({ rating: 5, comment: '' });
  const [classReview, setClassReview] = useState({ rating: 5, comment: '' });
  const [eligibleStudents, setEligibleStudents] = useState<Record<string, boolean>>(
    Object.fromEntries(enrolledStudents.map(s => [s.enrollment.id, true]))
  );
  const [completing, setCompleting] = useState(false);

  const totalSessions = modules.reduce((a, m) => a + m.lessons.length, 0);
  const uploadedCount = Object.values(recordings).filter(Boolean).length;

  /* ── Zoom ── */
  const handleSaveZoom = () => {
    if (!zoomLink.trim()) { toast.error('Zoom link cannot be empty'); return; }
    (course as any).zoomLink = zoomLink;
    toast.success('Zoom link updated!');
  };

  /* ── Recording ── */
  const handleSaveRecording = (sessionId: string, title: string) => {
    const url = recordings[sessionId];
    if (!url.trim()) { toast.error('Please enter a Google Drive link'); return; }
    course.modules.forEach(m => m.lessons.forEach(l => { if (l.id === sessionId) l.driveRecordingUrl = url; }));
    toast.success(`Recording saved for "${title}"!`);
  };

  /* ── Curriculum builder ── */
  const addModule = () => {
    const id = `m-${Date.now()}`;
    setModules(ms => [...ms, { id, title: `Module ${ms.length + 1}`, lessons: [] }]);
    setOpenModules(o => ({ ...o, [id]: true }));
  };
  const removeModule = (mid: string) => setModules(ms => ms.filter(m => m.id !== mid));
  const updateModuleTitle = (mid: string, val: string) => setModules(ms => ms.map(m => m.id === mid ? { ...m, title: val } : m));
  const addSession = (mid: string) => {
    const sid = `s-${Date.now()}`;
    setModules(ms => ms.map(m => m.id === mid
      ? { ...m, lessons: [...m.lessons, { id: sid, title: `Class ${m.lessons.length + 1}`, description: '', date: '', driveRecordingUrl: '', duration: '', materials: [] }] }
      : m));
  };
  const removeSession = (mid: string, sid: string) =>
    setModules(ms => ms.map(m => m.id === mid ? { ...m, lessons: m.lessons.filter(l => l.id !== sid) } : m));
  const updateSession = (mid: string, sid: string, field: string, val: string) =>
    setModules(ms => ms.map(m => m.id === mid ? { ...m, lessons: m.lessons.map(l => l.id === sid ? { ...l, [field]: val } : l) } : m));

  const handleSaveCurriculum = () => {
    if (modules.length === 0) { toast.error('Add at least one module'); return; }
    // Sync to course
    (course as any).modules = modules;
    // Also sync recording state
    const newRec: Record<string, string> = {};
    modules.forEach(m => m.lessons.forEach(l => { newRec[l.id] = recordings[l.id] || l.driveRecordingUrl || ''; }));
    setRecordings(newRec);
    setCurriculumSaved(true);
    toast.success('Curriculum saved! Admin can now publish the course.');
  };

  /* ── Mark Complete ── */
  const handleMarkComplete = async () => {
    if (!classReview.comment.trim()) { toast.error('Class review is required'); return; }
    setCompleting(true);
    await new Promise(r => setTimeout(r, 800));

    // Save reviews
    (course as any).isCompleted = true;
    (course as any).completedAt = new Date().toISOString().split('T')[0];
    (course as any).instructorPrivateReview = { ...privateReview, submittedAt: new Date().toISOString().split('T')[0] };
    (course as any).instructorClassReview = { ...classReview, submittedAt: new Date().toISOString().split('T')[0] };

    // Set certificate eligibility
    enrolledStudents.forEach(({ enrollment }) => {
      (enrollment as any).certificateEligible = eligibleStudents[enrollment.id] ?? false;
      (enrollment as any).isCompleted = true;
    });

    toast.success('Course marked as complete!');
    setCompleteModal(false);
    setCompleting(false);
    window.location.reload();
  };

  const scheduleLabel = () => {
    if (!course.schedule) return null;
    const s = course.schedule;
    const days = s.scheduleType === 'custom' ? (s.customDays || []) : { weekdays: ['Mon–Fri'], weekends: ['Sat–Sun'], 'whole-week': ['All 7 days'] }[s.scheduleType] || [];
    return `${days.join(', ')} at ${s.classTime}${s.classDuration ? ` · ${s.classDuration}` : ''}`;
  };

  const tabs = [
    { key: 'recordings', label: 'Recordings', count: `${uploadedCount}/${totalSessions}` },
    { key: 'curriculum', label: 'Curriculum', count: modules.length > 0 ? `${modules.length} modules` : 'Empty' },
    { key: 'schedule', label: 'Schedule & Details' },
  ] as const;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Link href="/instructor/courses"><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-xl font-black text-white leading-snug">{course.title}</h1>
            <div className="flex items-center gap-3 mt-1 flex-wrap">
              <Badge variant={course.status === 'published' ? 'success' : 'warning'}>{course.status}</Badge>
              {course.isCompleted && <Badge variant="info">Completed</Badge>}
              <span className="text-muted text-xs">{enrolledStudents.length} students enrolled</span>
              <span className="text-muted text-xs">{uploadedCount}/{totalSessions} recordings</span>
            </div>
          </div>
        </div>
        {!course.isCompleted && (
          <Button variant="secondary" onClick={() => setCompleteModal(true)} className="border-green-500/40 text-green-400 hover:bg-green-500/10">
            <CheckCircle className="w-4 h-4" />Mark as Complete
          </Button>
        )}
        {course.isCompleted && (
          <div className="flex items-center gap-2 text-green-400 text-sm bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-2">
            <CheckCircle className="w-4 h-4" />Course Completed
          </div>
        )}
      </div>

      {/* Zoom link */}
      <Card className="border-blue-500/20 p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Video className="w-4 h-4 text-blue-400 flex-shrink-0" />
          <span className="text-white text-sm font-medium">Zoom Link</span>
          <Input value={zoomLink} onChange={e => setZoomLink(e.target.value)} placeholder="https://zoom.us/j/..." className="flex-1 min-w-[200px]" />
          <Button size="sm" onClick={handleSaveZoom}><Save className="w-3.5 h-3.5" />Update</Button>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex gap-1 bg-dark-card border border-dark-border rounded-xl p-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-medium transition-all cursor-pointer ${activeTab === t.key ? 'bg-primary text-dark' : 'text-muted hover:text-white'}`}
          >
            {t.label}
            {'count' in t && t.count && <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === t.key ? 'bg-dark/20' : 'bg-dark-border'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* ── TAB: Recordings ── */}
      {activeTab === 'recordings' && (
        <div className="space-y-4">
          <p className="text-muted text-sm">After each live class, paste the Google Drive recording link below.</p>
          {modules.length === 0 ? (
            <Card className="py-10 text-center">
              <BookOpen className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-white font-semibold">No curriculum yet</p>
              <p className="text-muted text-xs mt-1">Add curriculum in the Curriculum tab first, then you can upload recordings here.</p>
            </Card>
          ) : modules.map(mod => (
            <Card key={mod.id} className="p-0 overflow-hidden">
              <button onClick={() => setOpenModules(o => ({ ...o, [mod.id]: !o[mod.id] }))} className="w-full flex items-center justify-between px-5 py-3 bg-dark-border/20 hover:bg-dark-border/40 cursor-pointer">
                <div className="flex items-center gap-3">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <span className="text-white font-semibold text-sm">{mod.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">{mod.lessons.filter(l => recordings[l.id]).length}/{mod.lessons.length} uploaded</span>
                  {openModules[mod.id] ? <ChevronUp className="w-4 h-4 text-muted" /> : <ChevronDown className="w-4 h-4 text-muted" />}
                </div>
              </button>
              {openModules[mod.id] && (
                <div className="divide-y divide-dark-border">
                  {mod.lessons.map((ses, si) => {
                    const hasRec = !!recordings[ses.id];
                    return (
                      <div key={ses.id} className="px-5 py-4">
                        <div className="flex items-center gap-3 mb-3">
                          <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${hasRec ? 'bg-green-500/20 text-green-400' : 'bg-dark-border text-muted'}`}>{si + 1}</span>
                          <div>
                            <p className="text-white text-sm font-medium">{ses.title}</p>
                            {ses.date && <p className="text-muted text-xs">{formatDateShort(ses.date)} {ses.duration && `· ${ses.duration}`}</p>}
                          </div>
                          {hasRec && <Badge variant="success" className="ml-auto">Uploaded</Badge>}
                        </div>
                        <div className="ml-10 flex gap-2">
                          <Input value={recordings[ses.id] || ''} onChange={e => setRecordings(r => ({ ...r, [ses.id]: e.target.value }))} placeholder="https://drive.google.com/file/d/..." className="flex-1 text-xs" />
                          <Button size="sm" variant={hasRec ? 'secondary' : 'primary'} onClick={() => handleSaveRecording(ses.id, ses.title)}><Save className="w-3.5 h-3.5" />{hasRec ? 'Update' : 'Save'}</Button>
                        </div>
                        {hasRec && <a href={recordings[ses.id]} target="_blank" rel="noopener noreferrer" className="ml-10 inline-flex items-center gap-1 text-xs text-green-400 hover:underline mt-1.5"><ExternalLink className="w-3 h-3" />View recording</a>}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* ── TAB: Curriculum ── */}
      {activeTab === 'curriculum' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-muted text-sm">Design the course curriculum. Once saved, the admin will be able to publish the course.</p>
              {curriculumSaved && <p className="text-green-400 text-xs mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Curriculum saved — admin can now publish</p>}
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={addModule}><Plus className="w-3.5 h-3.5" />Add Module</Button>
              <Button size="sm" onClick={handleSaveCurriculum}><Save className="w-3.5 h-3.5" />Save Curriculum</Button>
            </div>
          </div>

          {modules.length === 0 ? (
            <div className="border-2 border-dashed border-dark-border rounded-xl py-12 text-center">
              <BookOpen className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-white font-semibold mb-1">No modules yet</p>
              <p className="text-muted text-xs mb-4">Click "Add Module" to start building the curriculum</p>
              <Button size="sm" onClick={addModule}><Plus className="w-3.5 h-3.5" />Add First Module</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {modules.map((mod, mi) => (
                <div key={mod.id} className="border border-dark-border rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-dark-border/30">
                    <button onClick={() => setOpenModules(o => ({ ...o, [mod.id]: !o[mod.id] }))} className="text-muted cursor-pointer">
                      {openModules[mod.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <Input value={mod.title} onChange={e => updateModuleTitle(mod.id, e.target.value)} placeholder={`Module ${mi + 1}`} className="flex-1 text-sm" />
                    <span className="text-xs text-muted">{mod.lessons.length} classes</span>
                    {modules.length > 1 && <button onClick={() => removeModule(mod.id)} className="text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                  {openModules[mod.id] && (
                    <div className="p-4 space-y-3">
                      {mod.lessons.map((ses, si) => (
                        <div key={ses.id} className="bg-dark-border/20 rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <span className="text-primary text-xs font-semibold flex-shrink-0">Class {si + 1}</span>
                            {mod.lessons.length > 1 && <button onClick={() => removeSession(mod.id, ses.id)} className="ml-auto text-muted hover:text-red-400 cursor-pointer"><X className="w-3.5 h-3.5" /></button>}
                          </div>
                          <div className="grid sm:grid-cols-3 gap-2">
                            <Input value={ses.title} onChange={e => updateSession(mod.id, ses.id, 'title', e.target.value)} placeholder="Class title" className="sm:col-span-1" />
                            <Input type="date" value={ses.date} onChange={e => updateSession(mod.id, ses.id, 'date', e.target.value)} />
                            <Input value={ses.duration} onChange={e => updateSession(mod.id, ses.id, 'duration', e.target.value)} placeholder="e.g. 1h 30min" />
                          </div>
                          <Input value={ses.description} onChange={e => updateSession(mod.id, ses.id, 'description', e.target.value)} placeholder="Topics covered in this class" />
                        </div>
                      ))}
                      <button onClick={() => addSession(mod.id)} className="text-primary text-sm hover:underline cursor-pointer flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Add Class Session</button>
                    </div>
                  )}
                </div>
              ))}
              <div className="flex justify-between items-center">
                <button onClick={addModule} className="text-primary text-sm hover:underline cursor-pointer flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Add Module</button>
                <Button onClick={handleSaveCurriculum}><Save className="w-4 h-4" />Save Curriculum</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Schedule ── */}
      {activeTab === 'schedule' && (
        <div className="space-y-4">
          {course.schedule ? (
            <Card>
              <h2 className="text-white font-bold mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-green-400" />Class Schedule</h2>
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div className="space-y-3">
                  <div className="flex items-center gap-3 bg-dark-border/30 rounded-lg px-4 py-3">
                    <Clock className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-muted text-xs">Class Time</p>
                      <p className="text-white font-medium">{course.schedule.classTime || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-dark-border/30 rounded-lg px-4 py-3">
                    <BookOpen className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-muted text-xs">Duration per Class</p>
                      <p className="text-white font-medium">{course.schedule.classDuration || '—'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 bg-dark-border/30 rounded-lg px-4 py-3">
                    <Calendar className="w-4 h-4 text-primary" />
                    <div>
                      <p className="text-muted text-xs">Start Date</p>
                      <p className="text-white font-medium">{course.schedule.startDate ? formatDateShort(course.schedule.startDate) : '—'}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="bg-dark-border/30 rounded-lg px-4 py-3 mb-3">
                    <p className="text-muted text-xs mb-2">Schedule</p>
                    <p className="text-white font-medium capitalize">{course.schedule.scheduleType.replace('-', ' ')}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {(course.schedule.customDays || (course.schedule.scheduleType === 'weekdays' ? ['Monday','Tuesday','Wednesday','Thursday','Friday'] : course.schedule.scheduleType === 'weekends' ? ['Saturday','Sunday'] : DAYS)).map(day => (
                        <span key={day} className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">{day}</span>
                      ))}
                    </div>
                  </div>
                  {course.schedule.notes && (
                    <div className="bg-dark-border/30 rounded-lg px-4 py-3">
                      <p className="text-muted text-xs mb-1">Notes</p>
                      <p className="text-white text-sm">{course.schedule.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ) : (
            <Card className="py-10 text-center">
              <Calendar className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-white font-semibold">No schedule set</p>
              <p className="text-muted text-xs mt-1">The admin can add the class schedule when editing the course.</p>
            </Card>
          )}

          {/* Enrolled students list */}
          <Card>
            <h2 className="text-white font-bold mb-4 flex items-center gap-2"><Users className="w-5 h-5 text-primary" />Enrolled Students ({enrolledStudents.length})</h2>
            {enrolledStudents.length === 0 ? (
              <p className="text-muted text-sm text-center py-6">No students enrolled yet</p>
            ) : (
              <div className="space-y-2">
                {enrolledStudents.map(({ enrollment, student }) => (
                  <div key={enrollment.id} className="flex items-center gap-3 py-2 border-b border-dark-border/40 last:border-0">
                    <img src={student?.avatar || ''} alt={student?.name} className="w-8 h-8 rounded-full border border-primary/20" />
                    <div className="flex-1">
                      <p className="text-white text-sm font-medium">{student?.name}</p>
                      <p className="text-muted text-xs">Enrolled {formatDateShort(enrollment.enrolledAt)}</p>
                    </div>
                    {enrollment.certificateEligible === true && <Badge variant="success">Certificate Eligible</Badge>}
                    {enrollment.certificateEligible === false && <Badge variant="danger">Not Eligible</Badge>}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ── Mark Complete Modal ── */}
      <Modal isOpen={completeModal} onClose={() => setCompleteModal(false)} title="Mark Course as Complete" size="xl">
        <div className="space-y-5">
          {/* Warning */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 flex items-start gap-3">
            <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
            <p className="text-muted text-xs">This will mark the course as complete for all enrolled students. Please review student eligibility and submit your reviews before confirming.</p>
          </div>

          {/* Private review — admin only */}
          <div className="border border-dark-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-white font-semibold text-sm">Private Review <span className="text-xs text-muted font-normal">(admin only)</span></p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-dark-border text-muted">Admin only</span>
            </div>
            <div className="space-y-2">
              <StarRating rating={privateReview.rating} interactive onChange={r => setPrivateReview(p => ({ ...p, rating: r }))} size="md" />
              <Textarea value={privateReview.comment} onChange={e => setPrivateReview(p => ({ ...p, comment: e.target.value }))} placeholder="How did the course go overall? Suggestions?" rows={2} />
            </div>
          </div>

          {/* Class review — admin + students */}
          <div className="border border-primary/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-white font-semibold text-sm">Class Review * <span className="text-xs text-muted font-normal">(visible to students)</span></p>
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">Public</span>
            </div>
            <div className="space-y-2">
              <StarRating rating={classReview.rating} interactive onChange={r => setClassReview(p => ({ ...p, rating: r }))} size="md" />
              <Textarea value={classReview.comment} onChange={e => setClassReview(p => ({ ...p, comment: e.target.value }))} placeholder="A message to your students — highlights, achievements, final thoughts..." rows={2} />
            </div>
          </div>

          {/* Student certificate eligibility */}
          <div className="border border-dark-border rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-white font-semibold text-sm">Certificate Eligibility</p>
              <div className="flex gap-3 text-xs">
                <button onClick={() => setEligibleStudents(Object.fromEntries(enrolledStudents.map(s => [s.enrollment.id, true])))} className="text-primary hover:underline cursor-pointer">Select all</button>
                <button onClick={() => setEligibleStudents(Object.fromEntries(enrolledStudents.map(s => [s.enrollment.id, false])))} className="text-muted hover:text-white cursor-pointer">Clear all</button>
              </div>
            </div>
            <p className="text-muted text-xs mb-3">Unchecked students will be told to contact admin.</p>
            {enrolledStudents.length === 0 ? (
              <p className="text-muted text-sm text-center py-4">No enrolled students</p>
            ) : (
              <div className="space-y-1 max-h-40 overflow-y-auto pr-1">
                {enrolledStudents.map(({ enrollment, student }) => (
                  <label key={enrollment.id} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-dark-border/30 cursor-pointer transition-all">
                    <button onClick={() => setEligibleStudents(e => ({ ...e, [enrollment.id]: !e[enrollment.id] }))} className="flex-shrink-0 cursor-pointer">
                      {eligibleStudents[enrollment.id]
                        ? <CheckSquare className="w-5 h-5 text-primary" />
                        : <Square className="w-5 h-5 text-muted" />
                      }
                    </button>
                    <img src={student?.avatar || ''} alt={student?.name} className="w-7 h-7 rounded-full border border-dark-border" />
                    <p className="text-white text-sm font-medium flex-1">{student?.name}</p>
                    {eligibleStudents[enrollment.id]
                      ? <span className="text-xs text-green-400">✓ Eligible</span>
                      : <span className="text-xs text-red-400">✗ Not eligible</span>
                    }
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-muted mt-2 pt-2 border-t border-dark-border">
              {Object.values(eligibleStudents).filter(Boolean).length} eligible · {Object.values(eligibleStudents).filter(v => !v).length} not eligible
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <Button variant="secondary" fullWidth onClick={() => setCompleteModal(false)}>Cancel</Button>
            <Button fullWidth loading={completing} onClick={handleMarkComplete} className="bg-green-600 hover:bg-green-700 border-0">
              <CheckCircle className="w-4 h-4" />Confirm & Mark Complete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
