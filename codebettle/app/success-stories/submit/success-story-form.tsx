'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Textarea from '@/components/ui/Textarea';
import FadeIn from '@/components/ui/FadeIn';
import {
  SUCCESS_STORY_CATEGORIES,
  successStoryCategoryLabel,
} from '@/lib/success-story-categories';
import {
  EVIDENCE_MIMES,
  MAX_EVIDENCE_BYTES,
  MAX_PROFILE_PICTURE_BYTES,
  MAX_VIDEO_BYTES,
  PROFILE_PICTURE_MIMES,
  VIDEO_MIMES,
  extensionForMime,
  validateSuccessStoryStep,
  type SuccessStoryAchievementInput,
  type SuccessStoryEvidenceInput,
  type SuccessStorySubmitInput,
} from '@/lib/success-story-validation';
import {
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  ImagePlus,
  Link2,
  Loader2,
  PartyPopper,
  Plus,
  Send,
  Trophy,
  Upload,
  Video,
  X,
} from 'lucide-react';

const STEPS = [
  { title: 'Personal Information', description: 'Tell us who you are.' },
  { title: 'Learning Experience', description: 'Your journey with CodeBettle.' },
  { title: 'Success Story', description: 'Your story, in your words.' },
  { title: 'Achievements & Category', description: 'What did you achieve?' },
  { title: 'Professional & Social Profiles', description: 'Where can people find you? (optional)' },
  { title: 'Video Testimonial', description: 'Show your story on camera (optional).' },
  { title: 'Permissions, Consent & Review', description: 'Check everything, then submit.' },
] as const;

const CONSENT_TEXT = {
  publication:
    'I give CodeBettle permission to publish my success story on its official website, including my name, profile picture, learning journey and achievement details.',
  media: 'I authorize CodeBettle to use my submitted photographs, videos and achievement details for its official promotional and educational purposes.',
  accuracy:
    'I confirm that all the information and supporting documents provided by me are accurate and authentic to the best of my knowledge.',
  contact:
    'I allow CodeBettle to contact me if additional information or verification of my achievements is required.',
} as const;

const CONSENT_LABELS = {
  publication: 'Publication Permission',
  media: 'Media Usage Permission',
  accuracy: 'Information Accuracy',
  contact: 'Contact Permission',
} as const;

interface CourseOption {
  id: string;
  title: string;
  slug: string;
  batches: { id: string; batchNumber: number; status: string }[];
}

interface UploadState {
  progress: number | null;
  error: string | null;
}

const EMPTY_UPLOAD: UploadState = { progress: null, error: null };

function orNull(value?: string | null): string | null {
  return value && value.trim() !== '' ? value.trim() : null;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/**
 * Upload one file through a signed URL: the API mints the URL (after
 * checking kind + MIME + size), the browser PUTs the file directly to
 * Supabase Storage, and only the storage path is ever sent with the
 * submission. Progress is reported via XMLHttpRequest.
 */
async function uploadFile(
  kind: 'profile' | 'evidence' | 'video',
  file: File,
  onProgress: (percent: number) => void,
): Promise<string> {
  const res = await fetch('/api/success-stories/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, mime: file.type, size: file.size }),
  });
  const json = (await res.json()) as { signedUrl?: string; path?: string; error?: string };
  if (!res.ok || !json.signedUrl || !json.path) {
    throw new Error(json.error ?? 'Could not prepare the upload. Please try again.');
  }
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', json.signedUrl as string);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error('Upload failed. Please try again.'));
    };
    xhr.onerror = () => reject(new Error('Upload failed. Please check your connection and try again.'));
    xhr.send(file);
  });
  return json.path;
}

function checkFile(
  file: File,
  kind: 'profile' | 'evidence' | 'video',
  allowedMimes: readonly string[],
  maxBytes: number,
  label: string,
): string | null {
  if (!allowedMimes.includes(file.type)) {
    return `${label}: this file type is not supported. Please choose a supported file.`;
  }
  if (file.size > maxBytes) {
    return `${label}: the file is ${formatBytes(file.size)} — the limit is ${formatBytes(maxBytes)}.`;
  }
  if (!extensionForMime(file.type, kind)) {
    return `${label}: this file type is not supported.`;
  }
  return null;
}

export default function SuccessStoryForm() {
  const [step, setStep] = useState(0);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [data, setData] = useState<Partial<SuccessStorySubmitInput>>({
    achievements: [],
    consentPublication: false,
    consentMedia: false,
    consentAccuracy: false,
    consentContact: false,
  });
  const [errors, setErrors] = useState<string[]>([]);
  const [options, setOptions] = useState<CourseOption[] | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [profilePreview, setProfilePreview] = useState<string | null>(null);
  const [profileUpload, setProfileUpload] = useState<UploadState>(EMPTY_UPLOAD);
  const [videoUpload, setVideoUpload] = useState<UploadState>(EMPTY_UPLOAD);
  const [evidenceUpload, setEvidenceUpload] = useState<UploadState>(EMPTY_UPLOAD);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{ submissionNumber: string; submittedAt: string } | null>(null);
  const [dirty, setDirty] = useState(false);

  // Course + batch options for the step-2 dropdowns.
  useEffect(() => {
    fetch('/api/success-stories/options')
      .then((r) => r.json())
      .then((j) => setOptions((j.courses ?? []) as CourseOption[]))
      .catch(() => setOptionsError('Could not load the course list — please type your course name instead.'));
  }, []);

  // Confirm before leaving with unsaved input.
  useEffect(() => {
    if (!dirty || submitted) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, submitted]);

  const selectedCourse = options?.find((c) => c.id === data.courseId) ?? null;

  function setField<K extends keyof SuccessStorySubmitInput>(key: K, value: SuccessStorySubmitInput[K]) {
    setDirty(true);
    setData((prev) => ({ ...prev, [key]: value }));
  }

  function buildPayload(): SuccessStorySubmitInput {
    const d = data;
    return {
      fullName: (d.fullName ?? '').trim(),
      email: (d.email ?? '').trim(),
      profilePicturePath: d.profilePicturePath ?? null,
      country: (d.country ?? '').trim(),
      city: orNull(d.city),
      designation: orNull(d.designation),
      linkedinUrl: orNull(d.linkedinUrl),
      courseId: d.courseId ?? null,
      courseTitle: (d.courseTitle ?? '').trim(),
      batchId: d.batchId ?? null,
      batchNumber: d.batchNumber ?? null,
      joinedAt: orNull(d.joinedAt),
      instructorName: orNull(d.instructorName),
      skillsLearned: (d.skillsLearned ?? '').trim(),
      experience: (d.experience ?? '').trim(),
      story: (d.story ?? '').trim(),
      beforeJoining: orNull(d.beforeJoining),
      challenges: orNull(d.challenges),
      howHelped: orNull(d.howHelped),
      achievementsAfter: orNull(d.achievementsAfter),
      biggestAchievement: orNull(d.biggestAchievement),
      advice: orNull(d.advice),
      githubUrl: orNull(d.githubUrl),
      instagramUrl: orNull(d.instagramUrl),
      youtubeUrl: orNull(d.youtubeUrl),
      portfolioUrl: orNull(d.portfolioUrl),
      lablabUrl: orNull(d.lablabUrl),
      leetcodeUrl: orNull(d.leetcodeUrl),
      hackerrankUrl: orNull(d.hackerrankUrl),
      otherProfileUrl: orNull(d.otherProfileUrl),
      videoPath: d.videoPath ?? null,
      videoUrl: orNull(d.videoUrl),
      videoDescription: orNull(d.videoDescription),
      consentPublication: d.consentPublication ?? false,
      consentMedia: d.consentMedia ?? false,
      consentAccuracy: d.consentAccuracy ?? false,
      consentContact: d.consentContact ?? false,
      achievements: (d.achievements ?? []).map((a) => ({
        category: a.category,
        title: a.title.trim(),
        organization: orNull(a.organization),
        description: orNull(a.description),
        achievedAt: orNull(a.achievedAt),
        evidence: (a.evidence ?? []).map((e) => ({
          kind: e.kind,
          url: e.url,
          label: orNull(e.label),
          fileName: e.fileName ?? null,
          mime: e.mime ?? null,
          size: e.size ?? null,
        })),
      })),
      idempotencyKey,
    };
  }

  function validateStep(stepIndex: number): string[] {
    const stepErrors = validateSuccessStoryStep(stepIndex + 1, buildPayload());
    // Batch is required when the chosen course actually has batches.
    // (Courses without any Batch records accept a submission without one.)
    if (stepIndex === 1 && selectedCourse && selectedCourse.batches.length > 0 && !data.batchId) {
      stepErrors.push('Please choose your batch');
    }
    return stepErrors;
  }

  function goNext() {
    const stepErrors = validateStep(step);
    if (stepErrors.length > 0) {
      setErrors(stepErrors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setErrors([]);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goBack() {
    setErrors([]);
    setStep((s) => Math.max(s - 1, 0));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleProfileFile(file: File) {
    const problem = checkFile(file, 'profile', PROFILE_PICTURE_MIMES, MAX_PROFILE_PICTURE_BYTES, 'Profile picture');
    if (problem) {
      setProfileUpload({ progress: null, error: problem });
      return;
    }
    setProfileUpload({ progress: 0, error: null });
    try {
      const path = await uploadFile('profile', file, (p) => setProfileUpload({ progress: p, error: null }));
      setField('profilePicturePath', path);
      setProfilePreview(URL.createObjectURL(file));
      setProfileUpload(EMPTY_UPLOAD);
    } catch (error) {
      setProfileUpload({ progress: null, error: error instanceof Error ? error.message : 'Upload failed' });
    }
  }

  async function handleVideoFile(file: File) {
    const problem = checkFile(file, 'video', VIDEO_MIMES, MAX_VIDEO_BYTES, 'Video');
    if (problem) {
      setVideoUpload({ progress: null, error: problem });
      return;
    }
    setVideoUpload({ progress: 0, error: null });
    try {
      const path = await uploadFile('video', file, (p) => setVideoUpload({ progress: p, error: null }));
      setField('videoPath', path);
      setField('videoUrl', null);
      setVideoUpload(EMPTY_UPLOAD);
    } catch (error) {
      setVideoUpload({ progress: null, error: error instanceof Error ? error.message : 'Upload failed' });
    }
  }

  function updateAchievement(index: number, patch: Partial<SuccessStoryAchievementInput>) {
    setDirty(true);
    setData((prev) => ({
      ...prev,
      achievements: (prev.achievements ?? []).map((a, i) => (i === index ? { ...a, ...patch } : a)),
    }));
  }

  function addAchievement() {
    setDirty(true);
    setData((prev) => ({
      ...prev,
      achievements: [
        ...(prev.achievements ?? []),
        { category: '', title: '', organization: '', description: '', achievedAt: '', evidence: [] },
      ],
    }));
  }

  function removeAchievement(index: number) {
    setDirty(true);
    setData((prev) => ({
      ...prev,
      achievements: (prev.achievements ?? []).filter((_, i) => i !== index),
    }));
  }

  function addEvidence(index: number, evidence: SuccessStoryEvidenceInput) {
    setDirty(true);
    setData((prev) => ({
      ...prev,
      achievements: (prev.achievements ?? []).map((a, i) =>
        i === index ? { ...a, evidence: [...(a.evidence ?? []), evidence] } : a,
      ),
    }));
  }

  function removeEvidence(achievementIndex: number, evidenceIndex: number) {
    setDirty(true);
    setData((prev) => ({
      ...prev,
      achievements: (prev.achievements ?? []).map((a, i) =>
        i === achievementIndex
          ? { ...a, evidence: (a.evidence ?? []).filter((_, j) => j !== evidenceIndex) }
          : a,
      ),
    }));
  }

  async function handleEvidenceFile(achievementIndex: number, file: File) {
    const problem = checkFile(file, 'evidence', EVIDENCE_MIMES, MAX_EVIDENCE_BYTES, 'Evidence file');
    if (problem) {
      setEvidenceUpload({ progress: null, error: problem });
      return;
    }
    setEvidenceUpload({ progress: 0, error: null });
    try {
      const path = await uploadFile('evidence', file, (p) => setEvidenceUpload({ progress: p, error: null }));
      addEvidence(achievementIndex, {
        kind: 'file',
        url: path,
        label: file.name.replace(/\.[^.]+$/, ''),
        fileName: file.name,
        mime: file.type,
        size: file.size,
      });
      setEvidenceUpload(EMPTY_UPLOAD);
    } catch (error) {
      setEvidenceUpload({ progress: null, error: error instanceof Error ? error.message : 'Upload failed' });
    }
  }

  async function submit() {
    const stepErrors = validateStep(6);
    if (stepErrors.length > 0) {
      setErrors(stepErrors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setErrors([]);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/success-stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const json = (await res.json()) as { submissionNumber?: string; submittedAt?: string; error?: string };
      if (!res.ok) {
        setSubmitError(json.error ?? 'Something went wrong. Please try again.');
        setSubmitting(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      setSubmitted({
        submissionNumber: json.submissionNumber ?? '',
        submittedAt: json.submittedAt ?? new Date().toISOString(),
      });
      setDirty(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setSubmitError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Confirmation screen (after a successful submission).
  // -------------------------------------------------------------------------
  if (submitted) {
    return (
      <FadeIn>
        <div className="bg-dark-card border border-primary/30 rounded-2xl p-8 sm:p-12 text-center shadow-[0_0_60px_-16px_rgba(250,204,21,0.4)]">
          <div className="w-20 h-20 mx-auto rounded-full bg-primary/15 border border-primary/40 flex items-center justify-center mb-6">
            <PartyPopper className="w-10 h-10 text-primary-text" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-foreground mb-3">
            Your Success Story Has Been Submitted!
          </h1>
          <p className="text-muted max-w-lg mx-auto leading-relaxed">
            Thank you for sharing your journey with CodeBettle. Your story has been received and
            will be reviewed by our team. Once approved, it may be featured on our official Success
            Stories page.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl mx-auto mt-8 text-left">
            <div className="bg-background border border-dark-border rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">Submission ID</p>
              <p className="font-bold text-foreground">{submitted.submissionNumber}</p>
            </div>
            <div className="bg-background border border-dark-border rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">Submitted on</p>
              <p className="font-bold text-foreground">
                {new Date(submitted.submittedAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
            <div className="bg-background border border-dark-border rounded-xl p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted mb-1">Status</p>
              <p className="font-bold text-primary-text inline-flex items-center gap-1.5">
                <Loader2 className="w-4 h-4" /> Pending Review
              </p>
            </div>
          </div>
          <p className="text-xs text-muted mt-6">
            Keep your Submission ID safe — you can quote it if you ever contact us about this story.
          </p>
          <div className="mt-8">
            <Link href="/">
              <Button variant="primary" size="lg">
                Back to CodeBettle Website
              </Button>
            </Link>
          </div>
        </div>
      </FadeIn>
    );
  }

  const achievements = data.achievements ?? [];
  const payload = buildPayload();

  return (
    <FadeIn>
      {/* Header */}
      <div className="text-center mb-8">
        <span className="inline-flex items-center gap-2 text-primary-text text-sm font-semibold uppercase tracking-wider">
          <Trophy className="w-4 h-4" /> Share Your Journey
        </span>
        <h1 className="text-3xl sm:text-4xl font-black text-foreground mt-2 mb-2">
          Submit Your <span className="gradient-text">Success Story</span>
        </h1>
        <p className="text-muted max-w-xl mx-auto">
          Got a job, won a hackathon, started freelancing or launched a business after learning
          with CodeBettle? Tell us — your story can inspire the next student.
        </p>
      </div>

      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs font-medium text-muted mb-2">
          <span>
            Step {step + 1} of {STEPS.length} — {STEPS[step].title}
          </span>
          <span>{Math.round(((step + 1) / STEPS.length) * 100)}%</span>
        </div>
        <div className="h-2 rounded-full bg-dark-border overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="hidden md:flex justify-between mt-4">
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              type="button"
              onClick={() => {
                // Allow going back to any earlier step; forward only via Next.
                if (i < step) {
                  setErrors([]);
                  setStep(i);
                }
              }}
              className={`flex flex-col items-center gap-1.5 w-16 ${i < step ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-colors ${
                  i < step
                    ? 'bg-primary text-ink border-primary'
                    : i === step
                      ? 'bg-primary/15 text-primary-text border-primary'
                      : 'bg-dark-card text-muted border-dark-border'
                }`}
              >
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </span>
              <span className={`text-[10px] leading-tight text-center ${i === step ? 'text-foreground font-semibold' : 'text-muted'}`}>
                {s.title.split(' ')[0]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Step errors */}
      {errors.length > 0 && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 mb-6">
          <p className="text-sm font-bold text-red-400 mb-2">Please fix the following:</p>
          <ul className="list-disc list-inside text-sm text-red-300 space-y-1">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {submitError && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-xl p-4 mb-6">
          <p className="text-sm font-bold text-red-400">{submitError}</p>
        </div>
      )}

      <div className="bg-dark-card border border-dark-border rounded-2xl p-6 sm:p-8">
        <h2 className="text-xl font-bold text-foreground">{STEPS[step].title}</h2>
        <p className="text-sm text-muted mb-6">{STEPS[step].description}</p>

        {/* ------------------------------------------------ Step 1: Personal */}
        {step === 0 && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Input
                label="Full Name *"
                value={data.fullName ?? ''}
                onChange={(e) => setField('fullName', e.target.value)}
                placeholder="e.g. Muhammad Hateem Hussain"
              />
              <Input
                label="Email Address *"
                type="email"
                value={data.email ?? ''}
                onChange={(e) => setField('email', e.target.value)}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="text-sm font-medium text-foreground/80 block mb-1.5">
                Profile Picture * <span className="text-muted font-normal">(JPG, PNG or WebP — max 5 MB)</span>
              </label>
              <div className="flex items-center gap-4">
                {profilePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profilePreview} alt="Profile preview" className="w-20 h-20 rounded-full object-cover border-2 border-primary/40" />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary/10 border-2 border-dashed border-primary/40 flex items-center justify-center">
                    <ImagePlus className="w-8 h-8 text-primary-text" />
                  </div>
                )}
                <div className="flex-1">
                  <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary/10 border border-primary/30 text-sm font-semibold text-primary-text cursor-pointer hover:bg-primary/20 transition-colors">
                    <Upload className="w-4 h-4" />
                    {data.profilePicturePath ? 'Change picture' : 'Upload picture'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleProfileFile(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {profileUpload.progress !== null && (
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full bg-dark-border overflow-hidden">
                        <div className="h-full bg-primary transition-all" style={{ width: `${profileUpload.progress}%` }} />
                      </div>
                      <p className="text-xs text-muted mt-1">Uploading… {profileUpload.progress}%</p>
                    </div>
                  )}
                  {data.profilePicturePath && (
                    <p className="text-xs text-green-400 mt-2 inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Picture uploaded
                    </p>
                  )}
                </div>
              </div>
              {profileUpload.error && <p className="text-xs text-red-400 mt-2">{profileUpload.error}</p>}
              <p className="text-xs text-muted mt-2">
                This photo will appear next to your story once it is published. Choose a clear, professional photo.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Input
                label="Country *"
                value={data.country ?? ''}
                onChange={(e) => setField('country', e.target.value)}
                placeholder="e.g. Pakistan"
              />
              <Input
                label="City"
                value={data.city ?? ''}
                onChange={(e) => setField('city', e.target.value)}
                placeholder="e.g. Faisalabad"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Input
                label="Designation"
                value={data.designation ?? ''}
                onChange={(e) => setField('designation', e.target.value)}
                placeholder="e.g. Junior Software Engineer at XYZ"
              />
              <Input
                label="LinkedIn Profile URL"
                value={data.linkedinUrl ?? ''}
                onChange={(e) => setField('linkedinUrl', e.target.value)}
                placeholder="https://www.linkedin.com/in/your-name"
              />
            </div>
          </div>
        )}

        {/* --------------------------------------------- Step 2: Learning */}
        {step === 1 && (
          <div className="space-y-5">
            {optionsError ? (
              <Input
                label="Course *"
                value={data.courseTitle ?? ''}
                onChange={(e) => {
                  setField('courseTitle', e.target.value);
                  setField('courseId', null);
                  setField('batchId', null);
                  setField('batchNumber', null);
                }}
                placeholder="Type your course name"
              />
            ) : (
              <Select
                label="Course *"
                value={data.courseId ?? ''}
                options={[
                  { value: '', label: options === null ? 'Loading courses…' : 'Select your course' },
                  ...(options ?? []).map((c) => ({ value: c.id, label: c.title })),
                ]}
                onChange={(e) => {
                  const course = options?.find((c) => c.id === e.target.value);
                  setField('courseId', course ? course.id : null);
                  setField('courseTitle', course ? course.title : '');
                  setField('batchId', null);
                  setField('batchNumber', null);
                }}
              />
            )}
            {optionsError && <p className="text-xs text-red-400 -mt-3">{optionsError}</p>}

            {selectedCourse && (
              <>
                {selectedCourse.batches.length > 0 ? (
                  <Select
                    label="Batch *"
                    value={data.batchId ?? ''}
                    options={[
                      { value: '', label: 'Select your batch' },
                      ...selectedCourse.batches.map((b) => ({
                        value: b.id,
                        label: `Batch ${b.batchNumber} (${b.status === 'ongoing' ? 'Ongoing' : b.status === 'upcoming' ? 'Upcoming' : 'Completed'})`,
                      })),
                    ]}
                    onChange={(e) => {
                      const batch = selectedCourse.batches.find((b) => b.id === e.target.value);
                      setField('batchId', batch ? batch.id : null);
                      setField('batchNumber', batch ? batch.batchNumber : null);
                    }}
                  />
                ) : (
                  <p className="text-sm text-muted bg-background border border-dark-border rounded-lg px-4 py-3">
                    This course has no batches recorded yet — you can continue without choosing one.
                  </p>
                )}
              </>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Input
                label="Join Date"
                type="date"
                value={data.joinedAt ?? ''}
                onChange={(e) => setField('joinedAt', e.target.value)}
              />
              <Input
                label="Instructor Name"
                value={data.instructorName ?? ''}
                onChange={(e) => setField('instructorName', e.target.value)}
                placeholder="e.g. Ahmad Hassan"
              />
            </div>
            <Input
              label="Skills Learned *"
              value={data.skillsLearned ?? ''}
              onChange={(e) => setField('skillsLearned', e.target.value)}
              placeholder="e.g. Python, Django, React, PostgreSQL — separate with commas"
            />
            <Textarea
              label="Learning Experience *"
              rows={5}
              value={data.experience ?? ''}
              onChange={(e) => setField('experience', e.target.value)}
              placeholder="How was your learning experience at CodeBettle? What stood out — the teaching, the projects, the community?"
            />
          </div>
        )}

        {/* ---------------------------------------------- Step 3: The story */}
        {step === 2 && (
          <div className="space-y-5">
            <Textarea
              label="Your Success Story *"
              rows={7}
              value={data.story ?? ''}
              onChange={(e) => setField('story', e.target.value)}
              placeholder="Tell your story from start to finish — where you started, what you learned at CodeBettle, and where you are now. (This is the main story shown on the website.)"
            />
            <Textarea
              label="Before Joining CodeBettle"
              rows={4}
              value={data.beforeJoining ?? ''}
              onChange={(e) => setField('beforeJoining', e.target.value)}
              placeholder="What were you doing before joining? e.g. 'I was a university student with no programming background…'"
            />
            <Textarea
              label="Challenges You Faced"
              rows={4}
              value={data.challenges ?? ''}
              onChange={(e) => setField('challenges', e.target.value)}
              placeholder="What was hard along the way? e.g. 'Balancing university with the course, and my first month of coding felt impossible…'"
            />
            <Textarea
              label="How CodeBettle Helped"
              rows={4}
              value={data.howHelped ?? ''}
              onChange={(e) => setField('howHelped', e.target.value)}
              placeholder="What made the difference? e.g. 'The hands-on projects and my instructor's feedback gave me the confidence to apply for jobs…'"
            />
            <Textarea
              label="Achievements After Joining"
              rows={4}
              value={data.achievementsAfter ?? ''}
              onChange={(e) => setField('achievementsAfter', e.target.value)}
              placeholder="What changed after the course? e.g. 'Within two months I got my first internship, then a full-time offer…'"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Textarea
                label="Biggest Achievement"
                rows={3}
                value={data.biggestAchievement ?? ''}
                onChange={(e) => setField('biggestAchievement', e.target.value)}
                placeholder="e.g. 'Landing my first software job'"
              />
              <Textarea
                label="Advice for Other Learners"
                rows={3}
                value={data.advice ?? ''}
                onChange={(e) => setField('advice', e.target.value)}
                placeholder="e.g. 'Be consistent — even one hour a day adds up.'"
              />
            </div>
          </div>
        )}

        {/* ----------------------------------------- Step 4: Achievements */}
        {step === 3 && (
          <div className="space-y-6">
            <p className="text-sm text-muted">
              Add the achievements you are proud of. Each achievement picks one of the 10 success
              categories — add as many as you like. This step is optional, but achievements with
              evidence make your story much stronger.
            </p>
            {achievements.map((a, i) => (
              <div key={i} className="border border-dark-border rounded-xl p-5 space-y-4 bg-background/50">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-foreground">Achievement {i + 1}</h3>
                  <button
                    type="button"
                    onClick={() => removeAchievement(i)}
                    className="text-xs font-medium text-red-400 hover:text-red-300 inline-flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> Remove
                  </button>
                </div>
                <Select
                  label="Success Category *"
                  value={a.category}
                  options={[
                    { value: '', label: 'Choose a category' },
                    ...SUCCESS_STORY_CATEGORIES.map((c) => ({ value: c.value, label: `${c.label} — ${c.hint}` })),
                  ]}
                  onChange={(e) => updateAchievement(i, { category: e.target.value })}
                />
                <Input
                  label="Title *"
                  value={a.title}
                  onChange={(e) => updateAchievement(i, { title: e.target.value })}
                  placeholder="e.g. Junior Software Engineer at TechCorp"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <Input
                    label="Organization"
                    value={a.organization ?? ''}
                    onChange={(e) => updateAchievement(i, { organization: e.target.value })}
                    placeholder="e.g. TechCorp Pvt Ltd"
                  />
                  <Input
                    label="Date Achieved"
                    type="date"
                    value={a.achievedAt ?? ''}
                    onChange={(e) => updateAchievement(i, { achievedAt: e.target.value })}
                  />
                </div>
                <Textarea
                  label="Description"
                  rows={3}
                  value={a.description ?? ''}
                  onChange={(e) => updateAchievement(i, { description: e.target.value })}
                  placeholder="A short description of what you achieved."
                />

                {/* Evidence */}
                <div>
                  <label className="text-sm font-medium text-foreground/80 block mb-2">
                    Supporting Evidence <span className="text-muted font-normal">(optional)</span>
                  </label>
                  {(a.evidence ?? []).length > 0 && (
                    <ul className="space-y-2 mb-3">
                      {(a.evidence ?? []).map((ev, j) => (
                        <li key={j} className="flex items-center gap-2 text-sm bg-dark-card border border-dark-border rounded-lg px-3 py-2">
                          {ev.kind === 'file' ? <FileText className="w-4 h-4 text-primary-text shrink-0" /> : <Link2 className="w-4 h-4 text-primary-text shrink-0" />}
                          <span className="flex-1 truncate text-foreground">{ev.label || ev.url}</span>
                          <button
                            type="button"
                            onClick={() => removeEvidence(i, j)}
                            className="text-red-400 hover:text-red-300"
                            aria-label="Remove evidence"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-primary/10 border border-primary/30 text-xs font-semibold text-primary-text cursor-pointer hover:bg-primary/20 transition-colors">
                      <Upload className="w-3.5 h-3.5" /> Upload file (max 10 MB)
                      <input
                        type="file"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleEvidenceFile(i, file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <span className="text-xs text-muted">or add a link below</span>
                  </div>
                  <EvidenceLinkForm
                    onAdd={(label, url) => addEvidence(i, { kind: 'link', url, label })}
                  />
                  {evidenceUpload.error && <p className="text-xs text-red-400 mt-2">{evidenceUpload.error}</p>}
                  {evidenceUpload.progress !== null && (
                    <p className="text-xs text-muted mt-2">Uploading evidence… {evidenceUpload.progress}%</p>
                  )}
                  <p className="text-xs text-muted mt-2">
                    Certificate images/PDFs, offer letters, project links, GitHub repos, hackathon
                    results, LinkedIn posts or competition results.
                  </p>
                </div>
              </div>
            ))}
            <Button variant="outline" onClick={addAchievement} disabled={achievements.length >= 20}>
              <Plus className="w-4 h-4" /> Add Another Achievement
            </Button>
            {achievements.length === 0 && (
              <p className="text-sm text-muted">
                No achievements added yet — you can skip this step, or add at least one to make
                your story stand out.
              </p>
            )}
          </div>
        )}

        {/* ------------------------------------------- Step 5: Social links */}
        {step === 4 && (
          <div className="space-y-5">
            <p className="text-sm text-muted">
              All fields are optional. Add the profiles you want shown publicly with your story —
              leave the rest blank.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Input label="LinkedIn" value={data.linkedinUrl ?? ''} onChange={(e) => setField('linkedinUrl', e.target.value)} placeholder="https://www.linkedin.com/in/your-name" />
              <Input label="GitHub" value={data.githubUrl ?? ''} onChange={(e) => setField('githubUrl', e.target.value)} placeholder="https://github.com/your-name" />
              <Input label="Instagram" value={data.instagramUrl ?? ''} onChange={(e) => setField('instagramUrl', e.target.value)} placeholder="https://www.instagram.com/your-name" />
              <Input label="YouTube" value={data.youtubeUrl ?? ''} onChange={(e) => setField('youtubeUrl', e.target.value)} placeholder="https://www.youtube.com/@your-channel" />
              <Input label="Personal Portfolio" value={data.portfolioUrl ?? ''} onChange={(e) => setField('portfolioUrl', e.target.value)} placeholder="https://your-portfolio.com" />
              <Input label="LabLab.ai" value={data.lablabUrl ?? ''} onChange={(e) => setField('lablabUrl', e.target.value)} placeholder="https://lablab.ai/u/your-name" />
              <Input label="LeetCode" value={data.leetcodeUrl ?? ''} onChange={(e) => setField('leetcodeUrl', e.target.value)} placeholder="https://leetcode.com/u/your-name" />
              <Input label="HackerRank" value={data.hackerrankUrl ?? ''} onChange={(e) => setField('hackerrankUrl', e.target.value)} placeholder="https://www.hackerrank.com/profile/your-name" />
            </div>
            <Input label="Other Profile" value={data.otherProfileUrl ?? ''} onChange={(e) => setField('otherProfileUrl', e.target.value)} placeholder="https://any-other-profile.com/your-name" />
          </div>
        )}

        {/* ---------------------------------------------- Step 6: Video */}
        {step === 5 && (
          <div className="space-y-5">
            <h3 className="text-base font-bold text-foreground">Share Your Experience With CodeBettle</h3>
            <p className="text-sm text-muted">
              Optional — upload a short video testimonial <strong className="text-foreground">or</strong> paste
              a YouTube link. Recommended length: <strong className="text-foreground">30–90 seconds</strong>.
              Supported formats: MP4, WebM, MOV — max 100 MB.
            </p>
            <div>
              <label className="text-sm font-medium text-foreground/80 block mb-1.5">Upload a Video</label>
              <div className="border-2 border-dashed border-dark-border rounded-xl p-6 text-center">
                {data.videoPath ? (
                  <p className="text-sm text-green-400 inline-flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Video uploaded
                    <button
                      type="button"
                      onClick={() => setField('videoPath', null)}
                      className="text-red-400 hover:text-red-300 ml-2 inline-flex items-center gap-1"
                    >
                      <X className="w-3.5 h-3.5" /> Remove
                    </button>
                  </p>
                ) : (
                  <>
                    <Video className="w-8 h-8 text-primary-text mx-auto mb-2" />
                    <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-ink text-sm font-bold cursor-pointer hover:opacity-90 transition-opacity">
                      <Upload className="w-4 h-4" /> Choose a video file
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleVideoFile(file);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    <p className="text-xs text-muted mt-2">MP4, WebM or MOV — max 100 MB</p>
                  </>
                )}
                {videoUpload.progress !== null && (
                  <div className="mt-3 max-w-xs mx-auto">
                    <div className="h-1.5 rounded-full bg-dark-border overflow-hidden">
                      <div className="h-full bg-primary transition-all" style={{ width: `${videoUpload.progress}%` }} />
                    </div>
                    <p className="text-xs text-muted mt-1">Uploading… {videoUpload.progress}%</p>
                  </div>
                )}
                {videoUpload.error && <p className="text-xs text-red-400 mt-2">{videoUpload.error}</p>}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-px bg-dark-border flex-1" />
              <span className="text-xs font-semibold text-muted uppercase tracking-wider">or</span>
              <div className="h-px bg-dark-border flex-1" />
            </div>
            <Input
              label="YouTube Video Link"
              value={data.videoUrl ?? ''}
              onChange={(e) => {
                setField('videoUrl', e.target.value);
                if (e.target.value.trim() !== '') setField('videoPath', null);
              }}
              placeholder="https://www.youtube.com/watch?v=…"
            />
            <Textarea
              label="Video Description"
              rows={3}
              value={data.videoDescription ?? ''}
              onChange={(e) => setField('videoDescription', e.target.value)}
              placeholder="A short description of what you talk about in the video. (optional)"
            />
          </div>
        )}

        {/* --------------------------------------- Step 7: Consent + review */}
        {step === 6 && (
          <div className="space-y-6">
            <div className="space-y-4">
              <ConsentCheckbox
                required
                label={`1. ${CONSENT_LABELS.publication}`}
                checked={data.consentPublication ?? false}
                onChange={(v) => setField('consentPublication', v)}
                text={CONSENT_TEXT.publication}
              />
              <ConsentCheckbox
                required
                label={`2. ${CONSENT_LABELS.media}`}
                checked={data.consentMedia ?? false}
                onChange={(v) => setField('consentMedia', v)}
                text={CONSENT_TEXT.media}
              />
              <ConsentCheckbox
                required
                label={`3. ${CONSENT_LABELS.accuracy}`}
                checked={data.consentAccuracy ?? false}
                onChange={(v) => setField('consentAccuracy', v)}
                text={CONSENT_TEXT.accuracy}
              />
              <ConsentCheckbox
                label={`4. ${CONSENT_LABELS.contact}`}
                checked={data.consentContact ?? false}
                onChange={(v) => setField('consentContact', v)}
                text={CONSENT_TEXT.contact}
              />
            </div>

            <div>
              <h3 className="text-base font-bold text-foreground mb-3">Review Your Submission</h3>
              <ReviewSection title="Personal Information" stepIndex={0} onEdit={() => setStep(0)}>
                <ReviewRow label="Name" value={payload.fullName} />
                <ReviewRow label="Email" value={payload.email} />
                <ReviewRow label="Country" value={payload.country} />
                <ReviewRow label="City" value={payload.city ?? undefined} />
                <ReviewRow label="Designation" value={payload.designation ?? undefined} />
                <ReviewRow label="LinkedIn" value={payload.linkedinUrl ?? undefined} />
                <ReviewRow label="Profile picture" value={payload.profilePicturePath ? 'Uploaded ✓' : undefined} />
              </ReviewSection>
              <ReviewSection title="Learning Experience" stepIndex={1} onEdit={() => setStep(1)}>
                <ReviewRow label="Course" value={payload.courseTitle} />
                <ReviewRow label="Batch" value={payload.batchNumber ? `Batch ${payload.batchNumber}` : undefined} />
                <ReviewRow label="Joined" value={payload.joinedAt ?? undefined} />
                <ReviewRow label="Instructor" value={payload.instructorName ?? undefined} />
                <ReviewRow label="Skills" value={payload.skillsLearned} />
                <ReviewRow label="Experience" value={payload.experience} />
              </ReviewSection>
              <ReviewSection title="Success Story" stepIndex={2} onEdit={() => setStep(2)}>
                <ReviewRow label="Story" value={payload.story} />
                <ReviewRow label="Before joining" value={payload.beforeJoining ?? undefined} />
                <ReviewRow label="Challenges" value={payload.challenges ?? undefined} />
                <ReviewRow label="How CodeBettle helped" value={payload.howHelped ?? undefined} />
                <ReviewRow label="Achievements after joining" value={payload.achievementsAfter ?? undefined} />
                <ReviewRow label="Biggest achievement" value={payload.biggestAchievement ?? undefined} />
                <ReviewRow label="Advice" value={payload.advice ?? undefined} />
              </ReviewSection>
              <ReviewSection title="Achievements" stepIndex={3} onEdit={() => setStep(3)}>
                {(payload.achievements ?? []).length === 0 ? (
                  <p className="text-sm text-muted">No achievements added.</p>
                ) : (
                  (payload.achievements ?? []).map((a, i) => (
                    <div key={i} className="text-sm mb-3 last:mb-0">
                      <p className="font-semibold text-foreground">
                        {a.title}{' '}
                        <span className="text-primary-text font-medium">({successStoryCategoryLabel(a.category)})</span>
                      </p>
                      {a.organization && <p className="text-muted">{a.organization}</p>}
                      {(a.evidence ?? []).length > 0 && (
                        <p className="text-muted">{(a.evidence ?? []).length} supporting item(s)</p>
                      )}
                    </div>
                  ))
                )}
              </ReviewSection>
              <ReviewSection title="Social Profiles" stepIndex={4} onEdit={() => setStep(4)}>
                <ReviewRow label="GitHub" value={payload.githubUrl ?? undefined} />
                <ReviewRow label="Instagram" value={payload.instagramUrl ?? undefined} />
                <ReviewRow label="YouTube" value={payload.youtubeUrl ?? undefined} />
                <ReviewRow label="Portfolio" value={payload.portfolioUrl ?? undefined} />
                <ReviewRow label="LabLab.ai" value={payload.lablabUrl ?? undefined} />
                <ReviewRow label="LeetCode" value={payload.leetcodeUrl ?? undefined} />
                <ReviewRow label="HackerRank" value={payload.hackerrankUrl ?? undefined} />
                <ReviewRow label="Other" value={payload.otherProfileUrl ?? undefined} />
              </ReviewSection>
              <ReviewSection title="Video Testimonial" stepIndex={5} onEdit={() => setStep(5)}>
                <ReviewRow label="Video" value={payload.videoPath ? 'Video uploaded ✓' : payload.videoUrl ?? undefined} />
                <ReviewRow label="Description" value={payload.videoDescription ?? undefined} />
              </ReviewSection>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-dark-border">
          {step > 0 ? (
            <Button variant="outline" onClick={goBack} disabled={submitting}>
              <ChevronLeft className="w-4 h-4" /> Previous
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 ? (
            <Button variant="primary" onClick={goNext}>
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={() => void submit()} loading={submitting} disabled={submitting}>
              <Send className="w-4 h-4" /> Submit My Success Story
            </Button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted text-center mt-4">
        Your email is never published. Only approved stories appear on the website, and only the
        fields meant for publication.
      </p>
    </FadeIn>
  );
}

function ConsentCheckbox({
  required,
  label,
  checked,
  onChange,
  text,
}: {
  required?: boolean;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  text: string;
}) {
  return (
    <label className="block bg-background border border-dark-border rounded-xl p-4 cursor-pointer hover:border-primary/30 transition-colors">
      <span className="block text-sm font-bold text-foreground mb-2">
        {label}
        {required && <span className="text-primary-text"> (Required)</span>}
      </span>
      <span className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 w-5 h-5 accent-yellow-400 shrink-0 cursor-pointer"
        />
        <span className="text-sm text-foreground leading-relaxed">
          {text}
          {required && <span className="text-primary-text font-bold"> *</span>}
        </span>
      </span>
    </label>
  );
}

function ReviewSection({
  title,
  stepIndex,
  onEdit,
  children,
}: {
  title: string;
  stepIndex: number;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-dark-border rounded-xl p-4 mb-3 bg-background/50">
      <div className="flex items-center justify-between mb-2">
        <h4 className="font-bold text-foreground text-sm">{title}</h4>
        <button
          type="button"
          onClick={onEdit}
          className="text-xs font-semibold text-primary-text hover:underline"
        >
          Edit (Step {stepIndex + 1})
        </button>
      </div>
      {children}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <p className="text-sm mb-1.5 last:mb-0">
      <span className="font-medium text-muted">{label}: </span>
      <span className="text-foreground break-words">{value.length > 300 ? `${value.slice(0, 300)}…` : value}</span>
    </p>
  );
}

function EvidenceLinkForm({ onAdd }: { onAdd: (label: string, url: string) => void }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_auto] gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (e.g. Offer letter)"
          className="w-full bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… (GitHub repo, LinkedIn post, certificate link)"
          className="w-full bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (url.trim() === '') {
              setError('Paste a link first.');
              return;
            }
            if (!/^https?:\/\/.+\..+/.test(url.trim())) {
              setError('The link must start with http:// or https://');
              return;
            }
            setError(null);
            onAdd(label.trim(), url.trim());
            setLabel('');
            setUrl('');
          }}
        >
          <Link2 className="w-3.5 h-3.5" /> Add Link
        </Button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
