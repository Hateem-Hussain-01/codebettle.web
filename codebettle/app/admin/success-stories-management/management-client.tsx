'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import type { TeamMember } from '@/lib/db/types';
import type { SuccessStorySubmission } from '@/lib/db/types';
import type { VideoLayout, VideoOrientation, VideoPosition } from '@/lib/management';
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Eye,
  EyeOff,
  Link2,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Trophy,
  Upload,
  Users,
  Video,
} from 'lucide-react';

/**
 * Admin > Success Stories Management (PR #32) — the single management
 * surface for the whole /success-stories page:
 * - CEO Message: edited in Settings (linked, not duplicated here).
 * - Video & Vision: upload/replace the video (signed upload, 100 MB),
 *   layout (side-by-side / vertical), position swap, orientation.
 * - Team: CRUD + enable/disable + reorder.
 * - Stats: the four small stat cards.
 * - Stories: approved submissions + admin-created stories, with
 *   enable/disable + reorder + add-directly. Review workflow stays in
 *   Admin > Success Stories (linked).
 */

const VIDEO_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];

interface ConfigResponse {
  video: { videoUrl: string; videoLayout: VideoLayout; videoPosition: VideoPosition; videoOrientation: VideoOrientation };
  stats: { happyStudents: string; averageRating: string; recommendRate: string; hoursOfLearning: string };
  tablesReady: boolean;
}

interface TeamResponse {
  members: TeamMember[];
  tablesReady: boolean;
  error?: string;
}

interface StoriesResponse {
  submissions: SuccessStorySubmission[];
  total: number;
  tablesReady: boolean;
  error?: string;
}

const EMPTY_TEAM_FORM = {
  fullName: '',
  designation: '',
  bio: '',
  photoUrl: '',
  xUrl: '',
  linkedinUrl: '',
  githubUrl: '',
  websiteUrl: '',
  level: 1,
  orderInLevel: 0,
};

const EMPTY_STORY_FORM = {
  fullName: '',
  email: '',
  country: 'Pakistan',
  city: '',
  designation: '',
  courseTitle: '',
  batchNumber: '',
  skillsLearned: '',
  experience: '',
  story: '',
  linkedinUrl: '',
  featured: false,
};

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const json = (await res.json()) as { error?: string };
    return json.error ?? fallback;
  } catch {
    return fallback;
  }
}

export default function ManagementClient() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [team, setTeam] = useState<TeamMember[]>([]);
  const [stories, setStories] = useState<SuccessStorySubmission[]>([]);
  const [tablesReady, setTablesReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Video form
  const [videoBusy, setVideoBusy] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  // Stats form
  const [statsForm, setStatsForm] = useState({ happyStudents: '', averageRating: '', recommendRate: '', hoursOfLearning: '' });
  const [statsBusy, setStatsBusy] = useState(false);
  // Team form
  const [teamForm, setTeamForm] = useState(EMPTY_TEAM_FORM);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [teamBusy, setTeamBusy] = useState(false);
  const [teamPhotoBusy, setTeamPhotoBusy] = useState(false);
  const [showTeamForm, setShowTeamForm] = useState(false);
  // Story form
  const [storyForm, setStoryForm] = useState(EMPTY_STORY_FORM);
  const [storyBusy, setStoryBusy] = useState(false);
  const [showStoryForm, setShowStoryForm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [configRes, teamRes, storiesRes] = await Promise.all([
        fetch('/api/admin/success-stories-management/config'),
        fetch('/api/admin/success-stories-management/team'),
        fetch('/api/admin/success-stories-management/stories'),
      ]);
      const configJson = (await configRes.json()) as ConfigResponse & { error?: string };
      if (!configRes.ok) throw new Error(configJson.error ?? 'Could not load the page config');
      const teamJson = (await teamRes.json()) as TeamResponse;
      if (!teamRes.ok) throw new Error(teamJson.error ?? 'Could not load the team');
      const storiesJson = (await storiesRes.json()) as StoriesResponse;
      if (!storiesRes.ok) throw new Error(storiesJson.error ?? 'Could not load the stories');
      setConfig(configJson);
      setStatsForm(configJson.stats);
      setTeam(teamJson.members ?? []);
      setStories(storiesJson.submissions ?? []);
      setTablesReady(configJson.tablesReady !== false && teamJson.tablesReady !== false && storiesJson.tablesReady !== false);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Could not load the management page');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const flash = (message: string) => {
    setNotice(message);
    setError(null);
    window.setTimeout(() => setNotice(null), 4000);
  };
  const fail = (message: string) => {
    setError(message);
    setNotice(null);
  };

  // --- Video ---------------------------------------------------------------
  const saveVideoLayout = async (patch: { layout?: VideoLayout; position?: VideoPosition; orientation?: VideoOrientation }) => {
    setVideoBusy(true);
    try {
      const res = await fetch('/api/admin/success-stories-management/video', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not save the video layout'));
      const json = (await res.json()) as { video: ConfigResponse['video'] };
      setConfig((c) => (c ? { ...c, video: json.video } : c));
      flash('Video layout saved — the public page shows it now.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not save the video layout');
    } finally {
      setVideoBusy(false);
    }
  };

  const uploadVideo = async () => {
    if (!videoFile) return;
    if (!VIDEO_MIMES.includes(videoFile.type)) {
      fail('Only MP4, WebM or QuickTime videos are allowed');
      return;
    }
    if (videoFile.size > 100 * 1024 * 1024) {
      fail('Video must be 100 MB or smaller');
      return;
    }
    setVideoBusy(true);
    try {
      const urlRes = await fetch('/api/admin/success-stories-management/video-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime: videoFile.type, size: videoFile.size }),
      });
      if (!urlRes.ok) throw new Error(await readError(urlRes, 'Could not prepare the video upload'));
      const signed = (await urlRes.json()) as { signedUrl: string; path: string };
      const putRes = await fetch(signed.signedUrl, { method: 'PUT', headers: { 'Content-Type': videoFile.type }, body: videoFile });
      if (!putRes.ok) throw new Error('The video upload failed — please try again');
      const saveRes = await fetch('/api/admin/success-stories-management/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: signed.path }),
      });
      if (!saveRes.ok) throw new Error(await readError(saveRes, 'Could not save the video'));
      const json = (await saveRes.json()) as { videoUrl: string };
      setConfig((c) => (c ? { ...c, video: { ...c.video, videoUrl: json.videoUrl } } : c));
      setVideoFile(null);
      flash('Video uploaded — the public page shows it now.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Video upload failed');
    } finally {
      setVideoBusy(false);
    }
  };

  const removeVideo = async () => {
    if (!window.confirm('Remove the page video? The placeholder returns.')) return;
    setVideoBusy(true);
    try {
      const res = await fetch('/api/admin/success-stories-management/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: null }),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not remove the video'));
      setConfig((c) => (c ? { ...c, video: { ...c.video, videoUrl: '' } } : c));
      flash('Video removed.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not remove the video');
    } finally {
      setVideoBusy(false);
    }
  };

  // --- Stats ---------------------------------------------------------------
  const saveStats = async () => {
    setStatsBusy(true);
    try {
      const res = await fetch('/api/admin/success-stories-management/stats', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statsForm),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not save the stats'));
      flash('Stats saved — the public page shows them now.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not save the stats');
    } finally {
      setStatsBusy(false);
    }
  };

  // --- Team ----------------------------------------------------------------
  const uploadTeamPhoto = async (file: File) => {
    setTeamPhotoBusy(true);
    try {
      const form = new FormData();
      form.append('photo', file);
      const res = await fetch('/api/admin/success-stories-management/team/photo', { method: 'POST', body: form });
      if (!res.ok) throw new Error(await readError(res, 'Photo upload failed'));
      const json = (await res.json()) as { url: string };
      setTeamForm((f) => ({ ...f, photoUrl: json.url }));
      flash('Photo uploaded.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Photo upload failed');
    } finally {
      setTeamPhotoBusy(false);
    }
  };

  const saveTeamMember = async () => {
    setTeamBusy(true);
    try {
      const payload = {
        ...teamForm,
        level: Number(teamForm.level) || 1,
        orderInLevel: Number(teamForm.orderInLevel) || 0,
      };
      const res = await fetch(
        editingTeamId
          ? `/api/admin/success-stories-management/team/${editingTeamId}`
          : '/api/admin/success-stories-management/team',
        {
          method: editingTeamId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) throw new Error(await readError(res, 'Could not save the team member'));
      setTeamForm(EMPTY_TEAM_FORM);
      setEditingTeamId(null);
      setShowTeamForm(false);
      await load();
      flash(editingTeamId ? 'Team member updated.' : 'Team member added.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not save the team member');
    } finally {
      setTeamBusy(false);
    }
  };

  const toggleTeamMember = async (member: TeamMember) => {
    const res = await fetch(`/api/admin/success-stories-management/team/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !member.enabled }),
    });
    if (!res.ok) {
      fail(await readError(res, 'Could not update the team member'));
      return;
    }
    await load();
  };

  const moveTeamMember = async (member: TeamMember, direction: 'up' | 'down') => {
    const sorted = [...team].sort((a, b) => a.level - b.level || a.orderInLevel - b.orderInLevel);
    const idx = sorted.findIndex((m) => m.id === member.id);
    const other = direction === 'up' ? sorted[idx - 1] : sorted[idx + 1];
    if (!other) return;
    // Swap the (level, orderInLevel) pair — this reorders within a level
    // and moves across levels at the boundary.
    const a = { level: member.level, orderInLevel: member.orderInLevel };
    const b = { level: other.level, orderInLevel: other.orderInLevel };
    const [r1, r2] = await Promise.all([
      fetch(`/api/admin/success-stories-management/team/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
      }),
      fetch(`/api/admin/success-stories-management/team/${other.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(a),
      }),
    ]);
    if (!r1.ok || !r2.ok) {
      fail('Could not reorder the team member');
      return;
    }
    await load();
  };

  const deleteTeamMember = async (member: TeamMember) => {
    if (!window.confirm(`Delete ${member.fullName} from the team?`)) return;
    const res = await fetch(`/api/admin/success-stories-management/team/${member.id}`, { method: 'DELETE' });
    if (!res.ok) {
      fail(await readError(res, 'Could not delete the team member'));
      return;
    }
    await load();
    flash('Team member deleted.');
  };

  // --- Stories -------------------------------------------------------------
  const toggleStory = async (story: SuccessStorySubmission) => {
    const res = await fetch(`/api/admin/success-stories-management/stories/${story.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !story.enabled }),
    });
    if (!res.ok) {
      fail(await readError(res, 'Could not update the story'));
      return;
    }
    await load();
  };

  const moveStory = async (story: SuccessStorySubmission, direction: 'up' | 'down') => {
    const sorted = [...stories].sort((a, b) => a.displayOrder - b.displayOrder || b.submittedAt.localeCompare(a.submittedAt));
    const idx = sorted.findIndex((s) => s.id === story.id);
    const other = direction === 'up' ? sorted[idx - 1] : sorted[idx + 1];
    if (!other) return;
    const [r1, r2] = await Promise.all([
      fetch(`/api/admin/success-stories-management/stories/${story.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayOrder: other.displayOrder }),
      }),
      fetch(`/api/admin/success-stories-management/stories/${other.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayOrder: story.displayOrder }),
      }),
    ]);
    if (!r1.ok || !r2.ok) {
      fail('Could not reorder the story');
      return;
    }
    await load();
  };

  const deleteStory = async (story: SuccessStorySubmission) => {
    if (!window.confirm(`Delete ${story.fullName}'s story?`)) return;
    const res = await fetch(`/api/admin/success-stories-management/stories/${story.id}`, { method: 'DELETE' });
    if (!res.ok) {
      fail(await readError(res, 'Could not delete the story'));
      return;
    }
    await load();
    flash('Story deleted.');
  };

  const addStory = async () => {
    setStoryBusy(true);
    try {
      const payload = {
        ...storyForm,
        batchNumber: storyForm.batchNumber ? Number(storyForm.batchNumber) : null,
      };
      const res = await fetch('/api/admin/success-stories-management/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await readError(res, 'Could not add the story'));
      setStoryForm(EMPTY_STORY_FORM);
      setShowStoryForm(false);
      await load();
      flash('Story added — it is published on the Success Stories page now.');
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not add the story');
    } finally {
      setStoryBusy(false);
    }
  };

  if (loading) {
    return <p className="text-muted">Loading the management page…</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-foreground">Success Stories Management</h1>
        <p className="text-muted text-sm mt-1">
          One place for the whole Success Stories page — video &amp; vision, team, stats and story visibility. Changes show on the public page with no deploy.
        </p>
      </div>

      {notice && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 text-green-300 text-sm px-4 py-3">{notice}</div>
      )}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-4 py-3">{error}</div>
      )}
      {loadError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 text-sm px-4 py-3">{loadError}</div>
      )}
      {!tablesReady && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-yellow-300 text-sm px-4 py-3 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            The Success Stories Management tables are not set up yet — run{' '}
            <code className="font-mono">codebettle-success-stories-mgmt-migration.sql</code> in the Supabase SQL Editor first. The team, reviews and story controls below will not save until then.
          </span>
        </div>
      )}

      {/* CEO Message — kept in Settings, linked here (not duplicated). */}
      <section className="bg-dark-card border border-dark-border rounded-xl p-6">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Settings className="w-5 h-5 text-primary-text" /> CEO Message
        </h2>
        <p className="text-sm text-muted mt-2">
          The CEO message, vision text and CEO photo are edited in Admin &gt; Settings &gt; Success Stories — the same editor as before, so there is only one place to change them.
        </p>
        <div className="mt-4">
          <Link href="/admin/settings">
            <Button variant="secondary" size="sm">Open Settings — Success Stories</Button>
          </Link>
        </div>
      </section>

      {/* Video & Vision */}
      <section className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Video className="w-5 h-5 text-primary-text" /> Video &amp; Vision
        </h2>
        {config && (
          <>
            <p className="text-sm text-muted">
              Current video:{' '}
              {config.video.videoUrl ? (
                <a href={config.video.videoUrl} target="_blank" rel="noopener noreferrer" className="text-primary-text underline break-all">
                  {config.video.videoUrl}
                </a>
              ) : (
                <span>No video uploaded yet — the public page shows a placeholder.</span>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground/80">
                Layout
                <select
                  value={config.video.videoLayout}
                  disabled={videoBusy}
                  onChange={(e) => void saveVideoLayout({ layout: e.target.value as VideoLayout })}
                  className="w-full bg-background border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground"
                >
                  <option value="side-by-side">Side by side</option>
                  <option value="vertical">Vertical (stacked)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground/80">
                Position
                <select
                  value={config.video.videoPosition}
                  disabled={videoBusy}
                  onChange={(e) => void saveVideoLayout({ position: e.target.value as VideoPosition })}
                  className="w-full bg-background border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground"
                >
                  {config.video.videoLayout === 'vertical' ? (
                    <>
                      <option value="video-above">Video above vision</option>
                      <option value="video-below">Video below vision</option>
                    </>
                  ) : (
                    <>
                      <option value="video-left">Video left, vision right</option>
                      <option value="video-right">Vision left, video right</option>
                    </>
                  )}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground/80">
                Orientation
                <select
                  value={config.video.videoOrientation}
                  disabled={videoBusy}
                  onChange={(e) => void saveVideoLayout({ orientation: e.target.value as VideoOrientation })}
                  className="w-full bg-background border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground"
                >
                  <option value="portrait">Portrait 9:16</option>
                  <option value="landscape">Landscape 16:9</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-border text-foreground text-sm font-semibold cursor-pointer hover:opacity-90">
                <Upload className="w-4 h-4" />
                {videoFile ? videoFile.name : 'Choose a video (MP4 / WebM, max 100 MB)'}
                <input
                  type="file"
                  accept="video/mp4,video/webm,video/quicktime"
                  className="hidden"
                  onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                />
              </label>
              <Button variant="primary" size="sm" loading={videoBusy} disabled={!videoFile} onClick={() => void uploadVideo()}>
                Upload &amp; replace video
              </Button>
              {config.video.videoUrl && (
                <Button variant="danger" size="sm" loading={videoBusy} onClick={() => void removeVideo()}>
                  Remove video
                </Button>
              )}
            </div>
            <p className="text-xs text-muted">The video uploads directly to the public success-stories bucket — it never travels through this server, which is what makes the 100 MB limit work.</p>
          </>
        )}
      </section>

      {/* Team */}
      <section className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5 text-primary-text" /> Team ({team.length})
          </h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setTeamForm(EMPTY_TEAM_FORM);
              setEditingTeamId(null);
              setShowTeamForm((s) => !s);
            }}
          >
            <Plus className="w-4 h-4" /> Add team member
          </Button>
        </div>
        {team.length === 0 && (
          <p className="text-sm text-muted">No team members yet — add the real team here. Nothing is shown on the public page until you do.</p>
        )}
        {showTeamForm && (
          <div className="rounded-lg border border-dark-border bg-background p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Full name *" value={teamForm.fullName} onChange={(e) => setTeamForm({ ...teamForm, fullName: e.target.value })} placeholder="e.g. Ahmad Hassan" />
              <Input label="Designation *" value={teamForm.designation} onChange={(e) => setTeamForm({ ...teamForm, designation: e.target.value })} placeholder="e.g. Chief Executive Officer" />
              <Input label="Level (1 = top)" type="number" min={1} value={teamForm.level} onChange={(e) => setTeamForm({ ...teamForm, level: Number(e.target.value) })} />
              <Input label="Order within level" type="number" min={0} value={teamForm.orderInLevel} onChange={(e) => setTeamForm({ ...teamForm, orderInLevel: Number(e.target.value) })} />
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground/80">
              Short bio
              <textarea
                value={teamForm.bio}
                onChange={(e) => setTeamForm({ ...teamForm, bio: e.target.value })}
                rows={2}
                maxLength={500}
                className="w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground"
                placeholder="One or two lines about this person (optional)"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dark-border text-foreground text-sm font-semibold cursor-pointer hover:opacity-90">
                <Upload className="w-4 h-4" />
                {teamForm.photoUrl ? 'Photo uploaded ✓' : 'Upload photo (JPG/PNG/WebP, max 5 MB)'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadTeamPhoto(f);
                  }}
                />
              </label>
              {teamPhotoBusy && <span className="text-xs text-muted">Uploading…</span>}
              {teamForm.photoUrl && (
                <a href={teamForm.photoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary-text underline break-all">
                  View photo
                </a>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="X URL" value={teamForm.xUrl} onChange={(e) => setTeamForm({ ...teamForm, xUrl: e.target.value })} placeholder="https://x.com/…" />
              <Input label="LinkedIn URL" value={teamForm.linkedinUrl} onChange={(e) => setTeamForm({ ...teamForm, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/…" />
              <Input label="GitHub URL" value={teamForm.githubUrl} onChange={(e) => setTeamForm({ ...teamForm, githubUrl: e.target.value })} placeholder="https://github.com/…" />
              <Input label="Website URL" value={teamForm.websiteUrl} onChange={(e) => setTeamForm({ ...teamForm, websiteUrl: e.target.value })} placeholder="https://…" />
            </div>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" loading={teamBusy} onClick={() => void saveTeamMember()}>
                {editingTeamId ? 'Save changes' : 'Add team member'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { setShowTeamForm(false); setEditingTeamId(null); }}>Cancel</Button>
            </div>
          </div>
        )}
        <ul className="divide-y divide-dark-border">
          {team.map((member) => (
            <li key={member.id} className="py-3 flex items-center gap-3">
              {member.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={member.photoUrl} alt={member.fullName} className="w-10 h-10 rounded-full object-cover border border-dark-border shrink-0" />
              ) : (
                <span className="w-10 h-10 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center font-black text-primary-text shrink-0">
                  {member.fullName.charAt(0).toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">
                  {member.fullName} <span className="text-muted font-normal">· {member.designation}</span>
                </p>
                <p className="text-xs text-muted">Level {member.level} · Order {member.orderInLevel} · {member.enabled ? 'Shown on the public page' : 'Hidden from the public page'}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => void moveTeamMember(member, 'up')} aria-label="Move up" className="p-1.5 text-muted hover:text-foreground"><ArrowUp className="w-4 h-4" /></button>
                <button onClick={() => void moveTeamMember(member, 'down')} aria-label="Move down" className="p-1.5 text-muted hover:text-foreground"><ArrowDown className="w-4 h-4" /></button>
                <button
                  onClick={() => void toggleTeamMember(member)}
                  aria-label={member.enabled ? 'Hide from public page' : 'Show on public page'}
                  title={member.enabled ? 'Hide from public page' : 'Show on public page'}
                  className="p-1.5 text-muted hover:text-foreground"
                >
                  {member.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => {
                    setTeamForm({
                      fullName: member.fullName,
                      designation: member.designation,
                      bio: member.bio ?? '',
                      photoUrl: member.photoUrl ?? '',
                      xUrl: member.xUrl ?? '',
                      linkedinUrl: member.linkedinUrl ?? '',
                      githubUrl: member.githubUrl ?? '',
                      websiteUrl: member.websiteUrl ?? '',
                      level: member.level,
                      orderInLevel: member.orderInLevel,
                    });
                    setEditingTeamId(member.id);
                    setShowTeamForm(true);
                  }}
                  aria-label="Edit"
                  className="p-1.5 text-muted hover:text-foreground"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => void deleteTeamMember(member)} aria-label="Delete" className="p-1.5 text-red-400 hover:text-red-300">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Stats */}
      <section className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-bold text-foreground">Stats (small cards on the Success Stories page)</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Input label="Happy Students" value={statsForm.happyStudents} onChange={(e) => setStatsForm({ ...statsForm, happyStudents: e.target.value })} />
          <Input label="Average Rating" value={statsForm.averageRating} onChange={(e) => setStatsForm({ ...statsForm, averageRating: e.target.value })} />
          <Input label="Recommend Us" value={statsForm.recommendRate} onChange={(e) => setStatsForm({ ...statsForm, recommendRate: e.target.value })} />
          <Input label="Hours of Learning" value={statsForm.hoursOfLearning} onChange={(e) => setStatsForm({ ...statsForm, hoursOfLearning: e.target.value })} />
        </div>
        <Button variant="primary" size="sm" loading={statsBusy} onClick={() => void saveStats()}>Save stats</Button>
      </section>

      {/* Stories */}
      <section className="bg-dark-card border border-dark-border rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Trophy className="w-5 h-5 text-primary-text" /> Success Stories ({stories.length})
          </h2>
          <div className="flex items-center gap-2">
            <Link href="/admin/success-stories">
              <Button variant="secondary" size="sm">Review submissions</Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={() => { setStoryForm(EMPTY_STORY_FORM); setShowStoryForm((s) => !s); }}>
              <Plus className="w-4 h-4" /> Add a story directly
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted">
          Approved stories appear on the public page. The eye toggle hides a story from the public page without deleting it; the arrows change its display order. Reviewing student submissions (approve / reject / feature) stays in <Link href="/admin/success-stories" className="text-primary-text underline">Admin &gt; Success Stories</Link>.
        </p>
        {showStoryForm && (
          <div className="rounded-lg border border-dark-border bg-background p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Full name *" value={storyForm.fullName} onChange={(e) => setStoryForm({ ...storyForm, fullName: e.target.value })} />
              <Input label="Email *" type="email" value={storyForm.email} onChange={(e) => setStoryForm({ ...storyForm, email: e.target.value })} />
              <Input label="Country *" value={storyForm.country} onChange={(e) => setStoryForm({ ...storyForm, country: e.target.value })} />
              <Input label="City" value={storyForm.city} onChange={(e) => setStoryForm({ ...storyForm, city: e.target.value })} />
              <Input label="Designation" value={storyForm.designation} onChange={(e) => setStoryForm({ ...storyForm, designation: e.target.value })} placeholder="e.g. Junior Developer at …" />
              <Input label="Course *" value={storyForm.courseTitle} onChange={(e) => setStoryForm({ ...storyForm, courseTitle: e.target.value })} placeholder="e.g. Python" />
              <Input label="Batch number" type="number" value={storyForm.batchNumber} onChange={(e) => setStoryForm({ ...storyForm, batchNumber: e.target.value })} />
              <Input label="LinkedIn URL" value={storyForm.linkedinUrl} onChange={(e) => setStoryForm({ ...storyForm, linkedinUrl: e.target.value })} />
            </div>
            <Input label="Skills learned *" value={storyForm.skillsLearned} onChange={(e) => setStoryForm({ ...storyForm, skillsLearned: e.target.value })} placeholder="e.g. Python, Django, REST APIs" />
            <Input label="Experience *" value={storyForm.experience} onChange={(e) => setStoryForm({ ...storyForm, experience: e.target.value })} placeholder="One line about the learning experience" />
            <label className="flex flex-col gap-1.5 text-sm font-medium text-foreground/80">
              Story *
              <textarea
                value={storyForm.story}
                onChange={(e) => setStoryForm({ ...storyForm, story: e.target.value })}
                rows={4}
                className="w-full bg-dark-card border border-dark-border rounded-lg px-4 py-2.5 text-sm text-foreground"
                placeholder="The student's journey, in their own words"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-foreground/80">
              <input type="checkbox" checked={storyForm.featured} onChange={(e) => setStoryForm({ ...storyForm, featured: e.target.checked })} />
              Featured story
            </label>
            <div className="flex gap-2">
              <Button variant="primary" size="sm" loading={storyBusy} onClick={() => void addStory()}>Add story (published immediately)</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowStoryForm(false)}>Cancel</Button>
            </div>
          </div>
        )}
        {stories.length === 0 ? (
          <p className="text-sm text-muted">No stories yet — approved student submissions and admin-added stories will appear here.</p>
        ) : (
          <ul className="divide-y divide-dark-border">
            {[...stories]
              .sort((a, b) => a.displayOrder - b.displayOrder || b.submittedAt.localeCompare(a.submittedAt))
              .map((story) => (
                <li key={story.id} className="py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {story.fullName} <span className="text-muted font-normal">· {story.courseTitle}</span>
                      {story.adminCreated && (
                        <span className="ml-2 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary-text border border-primary/20">Admin-added</span>
                      )}
                      {story.featured && (
                        <span className="ml-2 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary-text border border-primary/30">Featured</span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {story.submissionNumber} · {story.status} · {story.enabled ? 'Shown on the public page' : 'Hidden from the public page'} · Order {story.displayOrder}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => void moveStory(story, 'up')} aria-label="Move up" className="p-1.5 text-muted hover:text-foreground"><ArrowUp className="w-4 h-4" /></button>
                    <button onClick={() => void moveStory(story, 'down')} aria-label="Move down" className="p-1.5 text-muted hover:text-foreground"><ArrowDown className="w-4 h-4" /></button>
                    <button
                      onClick={() => void toggleStory(story)}
                      aria-label={story.enabled ? 'Hide from public page' : 'Show on public page'}
                      title={story.enabled ? 'Hide from public page' : 'Show on public page'}
                      className="p-1.5 text-muted hover:text-foreground"
                    >
                      {story.enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <Link href={`/admin/success-stories/${story.id}`} aria-label="Open review" className="p-1.5 text-muted hover:text-foreground">
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <button onClick={() => void deleteStory(story)} aria-label="Delete" className="p-1.5 text-red-400 hover:text-red-300">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
          </ul>
        )}
        <p className="text-xs text-muted flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5" /> Story detail, photos, videos and evidence are managed in the submission review view (the arrow opens it).
        </p>
      </section>
    </div>
  );
}
