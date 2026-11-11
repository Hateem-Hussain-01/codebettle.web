'use client';
import { useEffect, useState } from 'react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import Textarea from '@/components/ui/Textarea';
import FadeIn from '@/components/ui/FadeIn';
import { UserCheck, Check, X, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, FileText, Video, ExternalLink, Eye, GraduationCap, MessageSquare, Plus, Trash2, ArrowUp, ArrowDown, Pencil } from 'lucide-react';
import { LinkedInIcon } from '@/components/auth/BrandIcons';
import { formatDateShort } from '@/lib/utils';
import toast from 'react-hot-toast';

interface Application {
  id: string;
  name: string;
  email: string;
  phone?: string;
  expertise?: string;
  experience?: string;
  message?: string;
  additionalInfo?: string;
  whyGoodFit?: string;
  userId?: string;
  cvUrl?: string;
  linkedinUrl?: string;
  githubUrl?: string;
  demoRecordingUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedByName?: string | null;
  createdAt: string;
}

interface Stage {
  id: string;
  name: string;
  position: number;
  instructions?: string;
}

interface HistoryEntry {
  id: string;
  stageName: string;
  action: string;
  note?: string;
  createdAt: string;
}

interface AppNote {
  id: string;
  authorId: string;
  body: string;
  createdAt: string;
}

interface AppDetail {
  application: Application;
  history: HistoryEntry[];
  notes: AppNote[];
  currentStageName: string | null;
  stages: Stage[];
}

type StatusFilter = 'all' | 'pending' | 'approved' | 'rejected';

const PAGE_LIMIT = 10;

/**
 * Admin applications — backed by the real API routes (Phase 3 + Phase 2
 * recruitment). GET /api/admin/applications?status=&page=&limit= on
 * mount and whenever the status filter or page changes;
 * PATCH /api/admin/applications/[id] to approve or reject (only a
 * pending application can be reviewed — the server returns 400 on a
 * re-review); POST .../stage to move a pending application through
 * the pipeline, POST .../request-info to ask for more information,
 * POST .../onboard for the final "Approve & Onboard as Teacher" step,
 * and the stages manager below for the admin-configurable pipeline.
 * Internal notes are admin-only (never shown to applicants).
 */
export default function AdminApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [openingFile, setOpeningFile] = useState<string | null>(null);

  // Pipeline stages (admin-managed).
  const [stages, setStages] = useState<Stage[]>([]);
  const [newStageName, setNewStageName] = useState('');
  const [newStageInstructions, setNewStageInstructions] = useState('');
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [savingStage, setSavingStage] = useState(false);

  // Per-application recruitment controls.
  const [assignStageId, setAssignStageId] = useState<Record<string, string>>({});
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [infoNote, setInfoNote] = useState<Record<string, string>>({});
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [onboardingId, setOnboardingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);

  // Expanded detail (history + internal notes).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AppDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  /**
   * Open an applicant's CV or demo recording. The files live in the
   * PRIVATE `application-files` bucket, so the stored cvUrl /
   * demoRecordingUrl is a storage path, not a public URL — this mints a
   * short-lived signed URL (admin only) and opens it in a new tab.
   */
  const openApplicationFile = async (id: string, kind: 'cv' | 'demo') => {
    const key = `${id}:${kind}`;
    setOpeningFile(key);
    try {
      const res = await fetch(`/api/admin/applications/${id}/file?kind=${kind}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not open the file'); return; }
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Could not open the file');
    } finally {
      setOpeningFile(null);
    }
  };

  const loadApplications = async (status: StatusFilter, pageToLoad: number) => {
    setLoading(true);
    setLoadError('');
    try {
      const params = new URLSearchParams({ page: String(pageToLoad), limit: String(PAGE_LIMIT) });
      if (status !== 'all') params.set('status', status);
      const res = await fetch(`/api/admin/applications?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load applications');
      setApps(data.applications);
      setPage(data.page ?? pageToLoad);
      setTotalPages(data.totalPages ?? 1);
      setTotal(data.total ?? data.applications.length);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const loadStages = async () => {
    try {
      const res = await fetch('/api/admin/recruitment/stages');
      const data = await res.json();
      if (res.ok) setStages(data.stages ?? []);
    } catch {
      // Stages are a secondary panel — the applications list is the priority.
    }
  };

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadApplications(statusFilter, 1);
    loadStages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const changePage = (next: number) => {
    const clamped = Math.min(Math.max(1, next), totalPages);
    if (clamped !== page) loadApplications(statusFilter, clamped);
  };

  const handleAction = async (id: string, status: 'approved' | 'rejected') => {
    setReviewingId(id);
    try {
      const res = await fetch(`/api/admin/applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not review application'); return; }
      setApps(a => a.map(app => app.id === id ? { ...app, ...data.application } : app));
      toast.success(`Application ${status}!`);
    } finally {
      setReviewingId(null);
    }
  };

  const handleAssignStage = async (id: string) => {
    const stageId = assignStageId[id];
    if (!stageId) { toast.error('Pick a stage first'); return; }
    setAssigningId(id);
    try {
      const res = await fetch(`/api/admin/applications/${id}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not move the application'); return; }
      toast.success(`Moved to ${data.stage.name}`);
      if (expandedId === id) loadDetail(id);
    } finally {
      setAssigningId(null);
    }
  };

  const handleRequestInfo = async (id: string) => {
    const note = (infoNote[id] ?? '').trim();
    if (!note) { toast.error('Write what you need from the applicant'); return; }
    setRequestingId(id);
    try {
      const res = await fetch(`/api/admin/applications/${id}/request-info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not send the request'); return; }
      toast.success('Information requested — the applicant has been notified');
      setInfoNote((m) => ({ ...m, [id]: '' }));
      if (expandedId === id) loadDetail(id);
    } finally {
      setRequestingId(null);
    }
  };

  const handleOnboard = async (id: string) => {
    setOnboardingId(id);
    try {
      const res = await fetch(`/api/admin/applications/${id}/onboard`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not onboard the applicant'); return; }
      toast.success(`${data.application.email} is now a teacher — same account, same credentials`);
      if (expandedId === id) loadDetail(id);
    } finally {
      setOnboardingId(null);
    }
  };

  /** Admin-assisted view-as (Module 21.4): open the teacher's actual Teacher Portal, view-only. */
  const handleViewAs = async (teacherId: string) => {
    setViewingId(teacherId);
    try {
      const res = await fetch('/api/admin/view-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not open the teacher portal'); return; }
      window.location.href = '/instructor/dashboard';
    } finally {
      setViewingId(null);
    }
  };

  const loadDetail = async (id: string) => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/admin/applications/${id}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not load the application'); return; }
      setDetail(data);
      setExpandedId(id);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleDetail = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
    } else {
      loadDetail(id);
    }
  };

  const handleAddNote = async (id: string) => {
    if (!noteBody.trim()) { toast.error('Write a note first'); return; }
    setSavingNote(true);
    try {
      const res = await fetch(`/api/admin/applications/${id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: noteBody.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not save the note'); return; }
      setNoteBody('');
      toast.success('Internal note saved (applicants never see notes)');
      loadDetail(id);
    } finally {
      setSavingNote(false);
    }
  };

  const handleAddStage = async () => {
    if (!newStageName.trim()) { toast.error('Stage name is required'); return; }
    setSavingStage(true);
    try {
      const res = await fetch('/api/admin/recruitment/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newStageName.trim(), instructions: newStageInstructions.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not create the stage'); return; }
      setStages((s) => [...s, data.stage]);
      setNewStageName('');
      setNewStageInstructions('');
      toast.success(`Stage “${data.stage.name}” created`);
    } finally {
      setSavingStage(false);
    }
  };

  const handleSaveStage = async () => {
    if (!editingStage || !editingStage.name.trim()) { toast.error('Stage name is required'); return; }
    setSavingStage(true);
    try {
      const res = await fetch(`/api/admin/recruitment/stages/${editingStage.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editingStage.name.trim(), instructions: editingStage.instructions?.trim() || null }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'Could not save the stage'); return; }
      setStages((s) => s.map((st) => (st.id === data.stage.id ? data.stage : st)));
      setEditingStage(null);
      toast.success('Stage updated');
    } finally {
      setSavingStage(false);
    }
  };

  const handleDeleteStage = async (stage: Stage) => {
    if (!window.confirm(`Delete the “${stage.name}” stage? History entries keep the stage name, so past progress stays readable.`)) return;
    const res = await fetch(`/api/admin/recruitment/stages/${stage.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Could not delete the stage'); return; }
    setStages((s) => s.filter((st) => st.id !== stage.id));
    toast.success('Stage deleted');
  };

  const handleMoveStage = async (stage: Stage, direction: -1 | 1) => {
    const idx = stages.findIndex((s) => s.id === stage.id);
    const next = idx + direction;
    if (idx < 0 || next < 0 || next >= stages.length) return;
    const ids = stages.map((s) => s.id);
    [ids[idx], ids[next]] = [ids[next], ids[idx]];
    const res = await fetch('/api/admin/recruitment/stages/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Could not reorder stages'); return; }
    setStages(data.stages ?? stages);
  };

  const pending = apps.filter(a => a.status === 'pending');
  const reviewed = apps.filter(a => a.status !== 'pending');
  // Terminal stages are never assigned by hand — they are reached via
  // Reject / Approve & Onboard. The assign dropdown hides them.
  const assignableStages = stages.filter((s) => s.name !== 'Successfully Onboarded' && s.name !== 'Rejected');

  const renderDetail = (app: Application) => {
    if (expandedId !== app.id) return null;
    return (
      <div className="mt-4 border-t border-dark-border pt-4 space-y-4">
        {detailLoading && <p className="text-muted text-xs">Loading history…</p>}
        {detail && (
          <>
            <div>
              <h3 className="text-white text-sm font-semibold mb-2">Stage history {detail.currentStageName ? `— current: ${detail.currentStageName}` : ''}</h3>
              {detail.history.length === 0 ? (
                <p className="text-muted text-xs">No stage moves yet.</p>
              ) : (
                <ol className="space-y-1.5">
                  {detail.history.map((h) => (
                    <li key={h.id} className="text-xs text-muted">
                      <span className="text-white">{h.stageName}</span> — {h.action.replaceAll('_', ' ')}
                      {h.note ? ` — “${h.note}”` : ''} · {formatDateShort(h.createdAt)}
                    </li>
                  ))}
                </ol>
              )}
              {app.whyGoodFit && <p className="text-muted text-xs mt-3"><span className="text-white">Why a good fit:</span> {app.whyGoodFit}</p>}
              {app.additionalInfo && <p className="text-muted text-xs mt-1"><span className="text-white">Additional info:</span> {app.additionalInfo}</p>}
            </div>
            <div>
              <h3 className="text-white text-sm font-semibold mb-2">Internal notes <span className="text-muted font-normal">(admin-only — applicants never see these)</span></h3>
              {detail.notes.length === 0 ? (
                <p className="text-muted text-xs">No notes yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {detail.notes.map((n) => (
                    <li key={n.id} className="text-xs text-muted">
                      <span className="text-white">{n.body}</span> · {formatDateShort(n.createdAt)}
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex gap-2 mt-2">
                <Input value={noteBody} onChange={(e) => setNoteBody(e.target.value)} placeholder="Add an internal note…" />
                <Button size="sm" onClick={() => handleAddNote(app.id)} loading={savingNote}><MessageSquare className="w-3.5 h-3.5" />Add note</Button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  };

  const renderLinks = (app: Application) => (
    <div className="flex flex-wrap items-center gap-2 mt-3">
      {app.linkedinUrl && (
        <a href={app.linkedinUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><LinkedInIcon className="w-3.5 h-3.5" />LinkedIn<ExternalLink className="w-3 h-3" /></a>
      )}
      {app.githubUrl && (
        <a href={app.githubUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">GitHub<ExternalLink className="w-3 h-3" /></a>
      )}
      {app.cvUrl && (
        <button onClick={() => openApplicationFile(app.id, 'cv')} disabled={openingFile === `${app.id}:cv`} className="inline-flex items-center gap-1 text-xs bg-dark-border hover:bg-primary hover:text-black text-white rounded-md px-2 py-1 cursor-pointer disabled:opacity-50 transition-colors"><FileText className="w-3.5 h-3.5" />{openingFile === `${app.id}:cv` ? 'Opening…' : 'View CV'}</button>
      )}
      {app.demoRecordingUrl && (
        <button onClick={() => openApplicationFile(app.id, 'demo')} disabled={openingFile === `${app.id}:demo`} className="inline-flex items-center gap-1 text-xs bg-dark-border hover:bg-primary hover:text-black text-white rounded-md px-2 py-1 cursor-pointer disabled:opacity-50 transition-colors"><Video className="w-3.5 h-3.5" />{openingFile === `${app.id}:demo` ? 'Opening…' : 'Watch Demo Lecture'}</button>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <FadeIn>
        <h1 className="text-2xl font-black text-white">Instructor Applications</h1>
        <p className="text-muted text-sm mt-1">{total} total · {apps.filter(a => a.status === 'approved').length} approved on this page</p>
      </FadeIn>

      {/* Pipeline stages — admin-managed (Module 20). */}
      <FadeIn delay={0.03}>
        <Card>
          <h2 className="text-white font-semibold mb-1">Recruitment pipeline</h2>
          <p className="text-muted text-xs mb-3">Applicants see only their current stage, completed stages and the next step — never this full list. Deleting a stage keeps its history (the stage name stays on past entries).</p>
          {stages.length === 0 ? (
            <p className="text-muted text-sm">Loading stages…</p>
          ) : (
            <ol className="space-y-2 mb-4">
              {stages.map((stage, i) => (
                <li key={stage.id} className="flex items-center gap-2 text-sm">
                  <span className="text-muted text-xs w-5">{i + 1}.</span>
                  {editingStage?.id === stage.id ? (
                    <>
                      <Input value={editingStage.name} onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })} placeholder="Stage name" />
                      <Input value={editingStage.instructions ?? ''} onChange={(e) => setEditingStage({ ...editingStage, instructions: e.target.value })} placeholder="Instructions for this stage (shown to the applicant)" />
                      <Button size="sm" onClick={handleSaveStage} loading={savingStage}>Save</Button>
                      <Button size="sm" variant="secondary" onClick={() => setEditingStage(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <span className="text-white flex-1">{stage.name}{stage.instructions ? <span className="text-muted text-xs block">{stage.instructions}</span> : null}</span>
                      <button onClick={() => handleMoveStage(stage, -1)} disabled={i === 0} aria-label={`Move ${stage.name} up`} className="text-muted hover:text-white disabled:opacity-30 cursor-pointer"><ArrowUp className="w-4 h-4" /></button>
                      <button onClick={() => handleMoveStage(stage, 1)} disabled={i === stages.length - 1} aria-label={`Move ${stage.name} down`} className="text-muted hover:text-white disabled:opacity-30 cursor-pointer"><ArrowDown className="w-4 h-4" /></button>
                      <button onClick={() => setEditingStage(stage)} aria-label={`Edit ${stage.name}`} className="text-muted hover:text-white cursor-pointer"><Pencil className="w-4 h-4" /></button>
                      <button onClick={() => handleDeleteStage(stage)} aria-label={`Delete ${stage.name}`} className="text-muted hover:text-red-400 cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
          <div className="flex gap-2 flex-wrap">
            <Input value={newStageName} onChange={(e) => setNewStageName(e.target.value)} placeholder="New stage name" />
            <Input value={newStageInstructions} onChange={(e) => setNewStageInstructions(e.target.value)} placeholder="Instructions for this stage (optional)" />
            <Button size="sm" onClick={handleAddStage} loading={savingStage}><Plus className="w-4 h-4" />Add stage</Button>
          </div>
        </Card>
      </FadeIn>

      <FadeIn delay={0.05} className="flex gap-1 bg-dark-card border border-dark-border rounded-lg p-1 w-fit">
        {(['all', 'pending', 'approved', 'rejected'] as StatusFilter[]).map(f => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize cursor-pointer transition-colors ${statusFilter === f ? 'bg-primary text-black' : 'text-muted hover:text-white'}`}
          >
            {f}
          </button>
        ))}
      </FadeIn>

      {loading && <p className="text-muted text-sm">Loading applications…</p>}
      {loadError && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-400">
          {loadError} <button onClick={() => loadApplications(statusFilter, page)} className="underline cursor-pointer ml-2">Retry</button>
        </div>
      )}

      {!loading && !loadError && apps.length === 0 && (
        <p className="text-muted text-sm">No applications found.</p>
      )}

      {!loading && !loadError && pending.length > 0 && (
        <FadeIn delay={0.08}>
        <div>
          <h2 className="text-white font-semibold mb-3 flex items-center gap-2"><UserCheck className="w-4 h-4 text-primary" />Pending Review ({pending.length})</h2>
          <div className="space-y-4">
            {pending.map((app, i) => (
              <FadeIn key={app.id} delay={Math.min(i, 3) * 0.05}>
              <Card hover>
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">{app.name.charAt(0)}</div>
                      <div>
                        <p className="text-white font-semibold text-sm">{app.name}</p>
                        <p className="text-muted text-xs">{app.email}{app.phone ? ` · ${app.phone}` : ''}</p>
                      </div>
                    </div>
                    {app.expertise && <p className="text-muted text-xs mb-1"><span className="text-white">Expertise:</span> {app.expertise}</p>}
                    {app.experience && <p className="text-muted text-xs mb-2"><span className="text-white">Experience:</span> {app.experience}</p>}
                    {app.message && <p className="text-muted text-xs italic">"{app.message}"</p>}
                    {renderLinks(app)}
                    <p className="text-muted text-xs mt-2">Submitted {formatDateShort(app.createdAt)}</p>

                    {/* Stage controls (Module 20). */}
                    <div className="flex gap-2 mt-3 flex-wrap items-center">
                      <select
                        value={assignStageId[app.id] ?? ''}
                        onChange={(e) => setAssignStageId((m) => ({ ...m, [app.id]: e.target.value }))}
                        aria-label="Move to stage"
                        className="bg-dark-card border border-dark-border rounded-md px-2 py-1.5 text-xs text-white cursor-pointer"
                      >
                        <option value="">Move to stage…</option>
                        {assignableStages.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                      <Button size="sm" variant="secondary" onClick={() => handleAssignStage(app.id)} loading={assigningId === app.id}>Assign stage</Button>
                      <button onClick={() => toggleDetail(app.id)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer">
                        {expandedId === app.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        {expandedId === app.id ? 'Hide details' : 'History & notes'}
                      </button>
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap items-center">
                      <Input
                        value={infoNote[app.id] ?? ''}
                        onChange={(e) => setInfoNote((m) => ({ ...m, [app.id]: e.target.value }))}
                        placeholder="Ask the applicant for more info…"
                      />
                      <Button size="sm" variant="secondary" onClick={() => handleRequestInfo(app.id)} loading={requestingId === app.id}>Request info</Button>
                    </div>
                    {renderDetail(app)}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button size="sm" variant="danger" onClick={() => handleAction(app.id, 'rejected')} loading={reviewingId === app.id}><X className="w-3.5 h-3.5" />Reject</Button>
                    <Button size="sm" onClick={() => handleAction(app.id, 'approved')} loading={reviewingId === app.id}><Check className="w-3.5 h-3.5" />Approve</Button>
                  </div>
                </div>
              </Card>
              </FadeIn>
            ))}
          </div>
        </div>
        </FadeIn>
      )}

      {!loading && !loadError && reviewed.length > 0 && (
        <FadeIn delay={0.1}>
        <div>
          <h2 className="text-white font-semibold mb-3">Reviewed ({reviewed.length})</h2>
          <div className="space-y-3">
            {reviewed.map((app, i) => (
              <FadeIn key={app.id} delay={Math.min(i, 3) * 0.05}>
              <Card>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="w-9 h-9 rounded-full bg-dark-border text-muted flex items-center justify-center font-bold text-sm">{app.name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{app.name}</p>
                    <p className="text-muted text-xs">{app.email} · {app.expertise}</p>
                    {renderLinks(app)}
                    {app.reviewedBy && <p className="text-muted text-xs mt-0.5">Reviewed by {app.reviewedByName ?? app.reviewedBy}</p>}
                    <button onClick={() => toggleDetail(app.id)} className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer mt-1">
                      {expandedId === app.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      {expandedId === app.id ? 'Hide details' : 'History & notes'}
                    </button>
                    {renderDetail(app)}
                  </div>
                  <Badge variant={app.status === 'approved' ? 'success' : 'danger'}>{app.status}</Badge>
                  {app.status === 'approved' && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <Button size="sm" onClick={() => handleOnboard(app.id)} loading={onboardingId === app.id}>
                        <GraduationCap className="w-3.5 h-3.5" />Approve & Onboard as Teacher
                      </Button>
                      {app.userId && (
                        <Button size="sm" variant="secondary" onClick={() => handleViewAs(app.userId!)} loading={viewingId === app.userId}>
                          <Eye className="w-3.5 h-3.5" />Switch to Teacher Portal
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
              </FadeIn>
            ))}
          </div>
        </div>
        </FadeIn>
      )}

      {!loading && !loadError && totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => changePage(page - 1)} disabled={page <= 1}><ChevronLeft className="w-4 h-4" />Prev</Button>
          <span className="text-muted text-xs">Page {page} of {totalPages}</span>
          <Button size="sm" variant="secondary" onClick={() => changePage(page + 1)} disabled={page >= totalPages}>Next<ChevronRight className="w-4 h-4" /></Button>
        </div>
      )}
    </div>
  );
}
