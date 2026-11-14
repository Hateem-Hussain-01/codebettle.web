'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminUrl } from '@/components/admin/AdminBasePathContext';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import Select from '@/components/ui/Select';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import CourseThumbnailUploader from '@/components/ui/CourseThumbnailUploader';
import { isValidThumbnailUrl } from '@/lib/thumbnail';
import { Save, ArrowLeft, Video, Plus, Trash2, ChevronDown, ChevronUp, X, Calendar, Clock, Info } from 'lucide-react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import type { SafeUser } from '@/lib/db/types';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const SCHEDULE_PRESETS: Record<string, string[]> = {
  'weekdays': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
  'weekends': ['Saturday', 'Sunday'],
  'whole-week': ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
  'custom': [],
};

interface ClassSession { id: string; title: string; description: string; date: string; duration: string; }
interface Module { id: string; title: string; lessons: ClassSession[]; }

interface NewCourseClientProps {
  instructors: SafeUser[];
}

export default function NewCourseClient({ instructors: allInstructors }: NewCourseClientProps) {
  const router = useRouter();
  const adminUrl = useAdminUrl();
  const instructors = allInstructors.filter(i => i.status === 'active');
  const [saving, setSaving] = useState(false);
  const [thumbnailUploading, setThumbnailUploading] = useState(false);
  const [showCurriculum, setShowCurriculum] = useState(false);

  const [form, setForm] = useState({
    title: '', description: '', longDescription: '',
    category: 'Web Development', level: 'beginner',
    price: '', isFree: false,
    instructorId: instructors[0]?.id || '',
    zoomLink: '', thumbnail: '',
    requirements: [''], whatYouLearn: [''],
    // Optional certificate HTML template for this course (Phase 2).
    // Empty = the course uses the default Python certificate design;
    // a template can be attached later from the course page.
    certificateTemplateHtml: '',
    // Optional public course outline PDF URL. Empty = no outline
    // attached; an outline can be added later from the course page.
    outlineUrl: '',
  });

  const [schedule, setSchedule] = useState({
    classTime: '', classDuration: '', scheduleType: 'weekdays' as string,
    customDays: [] as string[], startDate: '', notes: '',
  });

  const [modules, setModules] = useState<Module[]>([]);
  const [openModules, setOpenModules] = useState<Record<string, boolean>>({});

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [field]: e.target.value }));
  const setScheduleField = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const val = e.target.value;
    setSchedule(s => {
      const next = { ...s, [field]: val };
      if (field === 'scheduleType' && val !== 'custom') next.customDays = SCHEDULE_PRESETS[val] || [];
      return next;
    });
  };
  const toggleDay = (day: string) => {
    setSchedule(s => ({
      ...s,
      customDays: s.customDays.includes(day) ? s.customDays.filter(d => d !== day) : [...s.customDays, day],
    }));
  };

  const addModule = () => {
    const id = Date.now().toString();
    setModules(m => [...m, { id, title: `Module ${m.length + 1}`, lessons: [{ id: `${id}-1`, title: 'Class 1', description: '', date: '', duration: '' }] }]);
    setOpenModules(o => ({ ...o, [id]: true }));
  };
  const removeModule = (id: string) => setModules(ms => ms.filter(m => m.id !== id));
  const addSession = (modId: string) => {
    setModules(ms => ms.map(m => m.id === modId
      ? { ...m, lessons: [...m.lessons, { id: Date.now().toString(), title: `Class ${m.lessons.length + 1}`, description: '', date: '', duration: '' }] }
      : m));
  };
  const removeSession = (modId: string, sesId: string) =>
    setModules(ms => ms.map(m => m.id === modId ? { ...m, lessons: m.lessons.filter(l => l.id !== sesId) } : m));
  const updateModule = (id: string, val: string) => setModules(ms => ms.map(m => m.id === id ? { ...m, title: val } : m));
  const updateSession = (modId: string, sesId: string, field: string, val: string) =>
    setModules(ms => ms.map(m => m.id === modId ? { ...m, lessons: m.lessons.map(l => l.id === sesId ? { ...l, [field]: val } : l) } : m));

  const getActiveDays = () => schedule.scheduleType === 'custom' ? schedule.customDays : SCHEDULE_PRESETS[schedule.scheduleType] || [];

  const handleSave = async (publish = false) => {
    if (!form.title.trim()) { toast.error('Course title is required'); return; }
    if (!form.instructorId) { toast.error('Please assign an instructor'); return; }
    if (!form.zoomLink.trim()) { toast.error('Zoom link is required'); return; }
    if (thumbnailUploading) { toast.error('Wait for the thumbnail upload to finish'); return; }
    // The thumbnail is required at create and comes from the upload
    // control above — no silent stock-image fallback. The uploaded URL
    // is a https Supabase Storage URL; anything else is rejected here.
    if (!isValidThumbnailUrl(form.thumbnail)) { toast.error('Upload a course thumbnail image first'); return; }
    setSaving(true);
    try {
      // The create API requires description, longDescription and thumbnail,
      // so the form's optional fields fall back to the title.
      const slug = form.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
      const res = await fetch('/api/admin/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          title: form.title,
          description: form.description.trim() || form.title,
          longDescription: form.longDescription.trim() || form.description.trim() || form.title,
          thumbnail: form.thumbnail.trim(),
          category: form.category,
          level: form.level,
          price: form.isFree ? 0 : Math.floor(Number(form.price) || 0),
          isFree: form.isFree,
          instructorId: form.instructorId,
          zoomLink: form.zoomLink,
          // Schedule is saved only when class time + start date are set;
          // otherwise the course simply has no schedule yet.
          ...(schedule.classTime && schedule.startDate
            ? {
                schedule: {
                  classTime: schedule.classTime,
                  classDuration: schedule.classDuration || '',
                  scheduleType: schedule.scheduleType,
                  customDays: schedule.scheduleType === 'custom' ? schedule.customDays : undefined,
                  startDate: schedule.startDate,
                  notes: schedule.notes || undefined,
                },
              }
            : {}),
          requirements: form.requirements.filter(Boolean),
          whatYouLearn: form.whatYouLearn.filter(Boolean),
          // Optional: attach a per-course certificate HTML template now,
          // or leave it empty (default Python design) and attach it later.
          ...(form.certificateTemplateHtml.trim()
            ? { certificateTemplateHtml: form.certificateTemplateHtml }
            : {}),
          // Optional: public course outline PDF URL (e.g. a Supabase
          // Storage public URL). Leave empty for no outline.
          ...(form.outlineUrl.trim()
            ? { outlineUrl: form.outlineUrl.trim() }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not create course'); return; }
      const courseId = (data.course as { id: string }).id;

      // Persist any curriculum the admin built, via the module/lesson APIs.
      let curriculumFailed = false;
      for (const mod of modules) {
        const modRes = await fetch(`/api/admin/courses/${courseId}/modules`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: mod.title }),
        });
        const modData = await modRes.json();
        if (!modRes.ok) { curriculumFailed = true; continue; }
        for (const lesson of mod.lessons) {
          const lessonRes = await fetch(`/api/admin/courses/${courseId}/modules/${modData.module.id}/lessons`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: lesson.title,
              description: lesson.description || undefined,
              duration: lesson.duration || undefined,
              date: lesson.date || undefined,
            }),
          });
          if (!lessonRes.ok) curriculumFailed = true;
        }
      }

      if (publish) {
        const pubRes = await fetch(`/api/admin/courses/${courseId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'published' }),
        });
        const pubData = await pubRes.json();
        if (!pubRes.ok) { toast.error(pubData.error || 'Course created but could not be published'); return; }
      }

      toast.success(publish
        ? 'Course published!'
        : 'Course saved as draft — instructor can now add curriculum!');
      if (curriculumFailed) toast.error('Course saved, but some curriculum items could not be saved');
      router.push(adminUrl(`/courses/${courseId}`));
    } finally {
      setSaving(false);
    }
  };

  const activeDays = getActiveDays();

  // Certificate template placeholders a per-course HTML template is
  // expected to carry (same list as CERTIFICATE_PLACEHOLDERS in
  // lib/certificates/template.ts — duplicated here so this client
  // component does not pull the server QR/PDF modules into the browser
  // bundle). Missing ones only warn; they never block saving.
  const CERTIFICATE_PLACEHOLDERS = ['{{STUDENT_NAME}}', '{{COURSE_NAME}}', '{{COURSE_ICON}}', '{{BATCH}}', '{{CERTIFICATE_NUMBER}}', '{{SIGNATURE_NAME}}', '{{SIGNATURE_TITLE}}', '{{QR_CODE}}'];
  const missingTemplatePlaceholders = form.certificateTemplateHtml.trim()
    ? CERTIFICATE_PLACEHOLDERS.filter(p => !form.certificateTemplateHtml.includes(p))
    : [];

  const onTemplateFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setForm(f => ({ ...f, certificateTemplateHtml: text }));
    e.target.value = '';
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <FadeIn className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={adminUrl("/courses")}><Button variant="ghost" size="sm"><ArrowLeft className="w-4 h-4" /></Button></Link>
          <div>
            <h1 className="text-2xl font-black text-foreground">Create New Course</h1>
            <p className="text-muted text-sm mt-0.5">Save as draft — instructor will add curriculum, then you publish</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => handleSave(false)} loading={saving}><Save className="w-4 h-4" />Save Draft</Button>
          <Button onClick={() => handleSave(true)} loading={saving}>Publish Course</Button>
        </div>
      </FadeIn>

      {/* Draft flow info */}
      <FadeIn delay={0.05} className="bg-primary/5 border border-primary/20 rounded-xl p-4 flex items-start gap-3">
        <Info className="w-5 h-5 text-primary-text flex-shrink-0 mt-0.5" />
        <div className="text-sm">
          <p className="text-foreground font-medium">Recommended Workflow</p>
          <p className="text-muted mt-0.5">Save as <span className="text-primary-text">Draft</span> → Instructor adds curriculum → You <span className="text-primary-text">Publish</span>. You can also publish without curriculum — instructor can add it anytime later.</p>
        </div>
      </FadeIn>

      {/* Basic Info */}
      <FadeIn delay={0.08}>
      <Card>
        <h2 className="text-foreground font-bold mb-4">Course Details</h2>
        <div className="space-y-4">
          <Input label="Course Title *" placeholder="e.g., Complete React & Next.js Course" value={form.title} onChange={set('title')} />
          <Textarea label="Short Description" placeholder="Shown on course cards (1–2 sentences)" value={form.description} onChange={set('description')} rows={2} />
          <Textarea label="Full Description" placeholder="Detailed course overview" value={form.longDescription} onChange={set('longDescription')} rows={4} />
          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-2">Thumbnail *</label>
            <CourseThumbnailUploader
              uploadUrl="/api/admin/courses/thumbnail-upload"
              initialUrl={form.thumbnail}
              onUploaded={(url) => setForm(f => ({ ...f, thumbnail: url }))}
              onUploadingChange={setThumbnailUploading}
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <Select label="Category" value={form.category} onChange={set('category')} options={['Web Development','Mobile Development','Data Science','UI/UX Design','DevOps','Programming'].map(c => ({ value: c, label: c }))} />
            <Select label="Level" value={form.level} onChange={set('level')} options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'advanced', label: 'Advanced' }]} />
            <div className="flex flex-col gap-1.5">
              <Input label="Price (PKR)" type="number" placeholder="0" value={form.price} onChange={set('price')} disabled={form.isFree} />
              <label className="flex items-center gap-2 cursor-pointer mt-1">
                <input type="checkbox" checked={form.isFree} onChange={e => setForm(f => ({ ...f, isFree: e.target.checked }))} className="w-4 h-4 accent-primary" />
                <span className="text-xs text-muted">Free Course</span>
              </label>
            </div>
          </div>
        </div>
      </Card>
      </FadeIn>

      {/* Instructor & Zoom */}
      <FadeIn delay={0.12}>
      <Card className="border-blue-500/20">
        <h2 className="text-foreground font-bold mb-4 flex items-center gap-2"><Video className="w-5 h-5 text-blue-400" />Instructor & Zoom</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <Select label="Assign Instructor *" value={form.instructorId} onChange={set('instructorId')} options={instructors.map(i => ({ value: i.id, label: i.name }))} />
            {form.instructorId && (
              <div className="mt-2 flex items-center gap-2 bg-dark-border/30 rounded-lg px-3 py-2">
                <img src={instructors.find(i => i.id === form.instructorId)?.avatar || ''} className="w-7 h-7 rounded-full border border-primary/30" alt="" />
                <div>
                  <p className="text-foreground text-xs font-medium">{instructors.find(i => i.id === form.instructorId)?.name}</p>
                  <p className="text-muted text-xs">{instructors.find(i => i.id === form.instructorId)?.expertise?.slice(0, 2).join(' · ')}</p>
                </div>
              </div>
            )}
          </div>
          <div>
            <Input label="Zoom Meeting Link *" placeholder="https://zoom.us/j/your-meeting-id" value={form.zoomLink} onChange={set('zoomLink')} />
            <p className="text-muted text-xs mt-1.5">Students use this to join live classes.</p>
          </div>
        </div>
      </Card>
      </FadeIn>

      {/* Schedule */}
      <FadeIn delay={0.16}>
      <Card className="border-green-500/20">
        <h2 className="text-foreground font-bold mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-green-400" />Class Schedule</h2>
        <div className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <Input label="Class Time" type="time" value={schedule.classTime} onChange={setScheduleField('classTime')} />
            <Input label="Class Duration" placeholder="e.g. 1.5 hours" value={schedule.classDuration} onChange={setScheduleField('classDuration')} />
            <Input label="Start Date" type="date" value={schedule.startDate} onChange={setScheduleField('startDate')} />
          </div>
          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-2">Schedule Type</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
              {[{ value: 'weekdays', label: 'Mon – Fri' }, { value: 'weekends', label: 'Weekends' }, { value: 'whole-week', label: 'All 7 Days' }, { value: 'custom', label: 'Custom Days' }].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { setSchedule(s => ({ ...s, scheduleType: opt.value, customDays: opt.value !== 'custom' ? SCHEDULE_PRESETS[opt.value] : s.customDays })); }}
                  className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all cursor-pointer ${schedule.scheduleType === opt.value ? 'bg-primary text-ink border-primary' : 'border-dark-border text-muted hover:border-primary/40'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {schedule.scheduleType === 'custom' && (
              <div className="flex flex-wrap gap-2 mb-3">
                {DAYS.map(day => (
                  <button
                    key={day}
                    onClick={() => toggleDay(day)}
                    className={`py-1.5 px-3 rounded-lg border text-xs font-medium transition-all cursor-pointer ${schedule.customDays.includes(day) ? 'bg-primary/20 text-primary-text border-primary/40' : 'border-dark-border text-muted hover:border-primary/30'}`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}
            {activeDays.length > 0 && (
              <div className="flex items-center gap-2 text-xs text-muted bg-dark-border/30 rounded-lg px-3 py-2">
                <Clock className="w-3.5 h-3.5 text-green-400" />
                <span className="text-green-400 font-medium">Classes on:</span>
                <span>{activeDays.join(', ')} {schedule.classTime && `at ${schedule.classTime}`}</span>
              </div>
            )}
          </div>
          <Input label="Additional Notes" placeholder="e.g. Public holidays excluded, extra sessions on request..." value={schedule.notes} onChange={setScheduleField('notes')} />
        </div>
      </Card>
      </FadeIn>

      {/* Requirements & Outcomes */}
      <FadeIn delay={0.2}>
      <Card>
        <h2 className="text-foreground font-bold mb-4">Requirements & Outcomes</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-2">Requirements</label>
            {form.requirements.map((req, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input value={req} onChange={e => { const r = [...form.requirements]; r[i] = e.target.value; setForm(f => ({ ...f, requirements: r })); }} placeholder={`Requirement ${i + 1}`} />
                {form.requirements.length > 1 && <button onClick={() => setForm(f => ({ ...f, requirements: f.requirements.filter((_, j) => j !== i) }))} className="text-muted hover:text-red-400 cursor-pointer"><X className="w-4 h-4" /></button>}
              </div>
            ))}
            <button onClick={() => setForm(f => ({ ...f, requirements: [...f.requirements, ''] }))} className="text-primary-text text-xs hover:underline cursor-pointer">+ Add</button>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-2">What Students Will Learn</label>
            {form.whatYouLearn.map((item, i) => (
              <div key={i} className="flex gap-2 mb-2">
                <Input value={item} onChange={e => { const w = [...form.whatYouLearn]; w[i] = e.target.value; setForm(f => ({ ...f, whatYouLearn: w })); }} placeholder={`Outcome ${i + 1}`} />
                {form.whatYouLearn.length > 1 && <button onClick={() => setForm(f => ({ ...f, whatYouLearn: f.whatYouLearn.filter((_, j) => j !== i) }))} className="text-muted hover:text-red-400 cursor-pointer"><X className="w-4 h-4" /></button>}
              </div>
            ))}
            <button onClick={() => setForm(f => ({ ...f, whatYouLearn: [...f.whatYouLearn, ''] }))} className="text-primary-text text-xs hover:underline cursor-pointer">+ Add</button>
          </div>
        </div>
      </Card>
      </FadeIn>

      {/* Certificate Template — optional */}
      <FadeIn delay={0.22}>
      <Card>
        <h2 className="text-foreground font-bold mb-1">Certificate Template <span className="text-muted text-sm font-normal">(Optional)</span></h2>
        <p className="text-muted text-xs mb-4">This course&apos;s own certificate design (full HTML). Leave empty to use the default CodeBettle certificate — you can attach a template later from the course page.</p>
        <div className="space-y-3">
          <Textarea
            label="Certificate HTML"
            placeholder="Paste the full certificate HTML template here…"
            value={form.certificateTemplateHtml}
            onChange={set('certificateTemplateHtml')}
            rows={6}
          />
          <div>
            <label className="text-sm font-medium text-foreground/80 block mb-2">Or upload a .html file</label>
            <input
              type="file"
              accept=".html,text/html"
              onChange={onTemplateFile}
              className="text-sm text-muted file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-dark-border file:bg-dark-border/30 file:text-foreground file:text-xs file:cursor-pointer cursor-pointer"
            />
          </div>
          {form.certificateTemplateHtml.trim() && (
            <p className="text-xs text-muted">
              {form.certificateTemplateHtml.length.toLocaleString()} characters.
              {missingTemplatePlaceholders.length > 0 && (
                <span className="text-amber-400"> Missing placeholders (the PDF will leave those parts blank): {missingTemplatePlaceholders.join(', ')}</span>
              )}
            </p>
          )}
        </div>
      </Card>
      </FadeIn>

      {/* Course Outline — optional */}
      <FadeIn delay={0.23}>
      <Card>
        <h2 className="text-foreground font-bold mb-1">Course Outline <span className="text-muted text-sm font-normal">(Optional)</span></h2>
        <p className="text-muted text-xs mb-4">Public outline PDF for this course (a URL, e.g. a Supabase Storage public link). It shows as a &ldquo;Download Course Outline (PDF)&rdquo; button on the public course page for everyone to see. Leave empty for no outline — you can add one later from the course page.</p>
        <Input
          label="Outline PDF URL"
          placeholder="https://…/course-outline.pdf"
          value={form.outlineUrl}
          onChange={set('outlineUrl')}
        />
      </Card>
      </FadeIn>

      {/* Curriculum — optional */}
      <FadeIn delay={0.24}>
      <Card>
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-foreground font-bold">Curriculum <span className="text-muted text-sm font-normal">(Optional)</span></h2>
            <p className="text-muted text-xs mt-0.5">Leave empty — instructor will design the curriculum. Or add modules now if you prefer.</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => { setShowCurriculum(true); addModule(); }}>
            <Plus className="w-3.5 h-3.5" />Add Module
          </Button>
        </div>

        {modules.length === 0 ? (
          <div className="border-2 border-dashed border-dark-border rounded-xl py-8 text-center">
            <p className="text-muted text-sm">No curriculum added yet</p>
            <p className="text-muted text-xs mt-1">The instructor will add class sessions after the course is saved as draft.</p>
          </div>
        ) : (
          <div className="space-y-4 mt-4">
            {modules.map((mod, mi) => (
              <div key={mod.id} className="border border-dark-border rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-3 bg-dark-border/30">
                  <button onClick={() => setOpenModules(o => ({ ...o, [mod.id]: !o[mod.id] }))} className="text-muted cursor-pointer">
                    {openModules[mod.id] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                  <Input value={mod.title} onChange={e => updateModule(mod.id, e.target.value)} placeholder={`Module ${mi + 1}`} className="flex-1 text-sm" />
                  <button onClick={() => removeModule(mod.id)} className="text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                </div>
                {openModules[mod.id] && (
                  <div className="p-4 space-y-3">
                    {mod.lessons.map((ses, si) => (
                      <div key={ses.id} className="bg-dark-border/20 rounded-lg p-3 grid sm:grid-cols-2 gap-3">
                        <Input value={ses.title} onChange={e => updateSession(mod.id, ses.id, 'title', e.target.value)} placeholder={`Class ${si + 1} title`} />
                        <div className="flex gap-2">
                          <Input type="date" value={ses.date} onChange={e => updateSession(mod.id, ses.id, 'date', e.target.value)} />
                          <Input value={ses.duration} onChange={e => updateSession(mod.id, ses.id, 'duration', e.target.value)} placeholder="Duration" />
                          {mod.lessons.length > 1 && <button onClick={() => removeSession(mod.id, ses.id)} className="text-muted hover:text-red-400 cursor-pointer"><X className="w-4 h-4" /></button>}
                        </div>
                        <Input value={ses.description} onChange={e => updateSession(mod.id, ses.id, 'description', e.target.value)} placeholder="Description" className="sm:col-span-2" />
                      </div>
                    ))}
                    <button onClick={() => addSession(mod.id)} className="text-primary-text text-sm hover:underline cursor-pointer flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Add Class</button>
                  </div>
                )}
              </div>
            ))}
            <button onClick={addModule} className="text-primary-text text-sm hover:underline cursor-pointer flex items-center gap-1"><Plus className="w-3.5 h-3.5" />Add Module</button>
          </div>
        )}
      </Card>
      </FadeIn>

      <div className="flex justify-end gap-3 pb-8">
        <Link href={adminUrl("/courses")}><Button variant="secondary">Cancel</Button></Link>
        <Button variant="outline" onClick={() => handleSave(false)} loading={saving}><Save className="w-4 h-4" />Save Draft</Button>
        <Button onClick={() => handleSave(true)} loading={saving}>Publish Course</Button>
      </div>
    </div>
  );
}
