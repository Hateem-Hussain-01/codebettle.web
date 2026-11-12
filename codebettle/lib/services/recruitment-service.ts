/**
 * Recruitment service (Phase 2, Modules 19/20/21 — teacher recruitment
 * portal, multi-stage tracking, applicant→teacher onboarding, and
 * admin-assisted view-as).
 *
 * No Next.js imports — unit-testable with the fake db. Every function
 * re-checks the actor's capability from the passed Actor (routes gate
 * too; the service is the second line of defence).
 *
 * STAGE-COLUMN DECISION: the contract has NO stage column on
 * InstructorApplication (and this worker must not modify the contract),
 * so the current stage is derived from the append-only history — the
 * latest history entry's stageName snapshot (see getCurrentStage in
 * lib/db/application-stages.ts). `status` (pending/approved/rejected)
 * stays a SEPARATE column: it is the review decision, while the stage
 * is the pipeline position. The two never overwrite each other.
 *
 * DUPLICATE-APPLICATION RULE: one PENDING application at a time (per
 * account, mirroring the Module 3 submit-path rule of one pending
 * application per email). A new application is allowed once the
 * previous one is decided (approved or rejected) — including
 * approved-but-not-yet-onboarded, so the portal and the public form
 * answer the same way. An approved applicant who has not been
 * onboarded yet may therefore file again, but the earlier application
 * stays the onboarding record.
 *
 * ONBOARDING SEMANTICS: "Approve & Onboard as Teacher" sets
 * isTeacher=true on the SAME account and moves the PRIMARY role
 * student→instructor (so login lands on the normal Teacher Portal).
 * A primary role of instructor or admin is left untouched — the flag
 * alone confers the teacher capability and the home portal stays what
 * it was. No new account is created, no password is set or changed,
 * sessions are NOT revoked (the session rebuilds role/flags from the
 * user record on the next request, so the same credentials keep
 * working). Application history and profile are preserved as-is.
 */
import { getApplicationById, getApplicationsByUserId } from '../db/applications';
import {
  addHistory,
  addNote,
  createStage,
  deleteStage,
  ensureDefaultStages,
  getCurrentStage,
  getStageById,
  listHistory,
  listNotes,
  listStages,
  reorderStages,
  updateStage,
} from '../db/application-stages';
import { getUserById, updateUser } from '../db/users';
import { listNotificationsForUser } from '../db/notifications';
import { logAudit } from '../db/audit';
import { hasAdminCapability, hasTeacherCapability } from '../rbac';
import { mintViewAsToken } from '../view-as';
import {
  notifyApplicantInfoRequested,
  notifyApplicantOnboarded,
  notifyApplicantStageChanged,
} from './notification-service';
import { submitApplication, type SubmitApplicationInput } from './application-service';
import { badRequest, conflict, forbidden, notFound, type Actor, type ServiceError } from './errors';
import type {
  ApplicationNote,
  ApplicationStage,
  ApplicationStageHistory,
  InstructorApplication,
  Notification,
} from '../db/types';

type Result<T> = T | ServiceError;

function requireAdmin(actor: Actor): ServiceError | null {
  if (!hasAdminCapability(actor)) return forbidden('Only admins can manage recruitment');
  return null;
}

/** The two terminal pipeline names — reached only via review / onboard, never via assignStage. */
const ONBOARDED_STAGE_NAME = 'Successfully Onboarded';
const REJECTED_STAGE_NAME = 'Rejected';

/** Terminal names are reserved: a custom stage with one of these names could never be assigned (assignStage refuses them), and a duplicate of one would confuse name-based tracking. Compared case-insensitively. */
function isReservedStageName(name: string): boolean {
  const lower = name.toLowerCase();
  return lower === ONBOARDED_STAGE_NAME.toLowerCase() || lower === REJECTED_STAGE_NAME.toLowerCase();
}

// ---------------------------------------------------------------------------
// Admin: pipeline stage CRUD
// ---------------------------------------------------------------------------

export async function listStagesService(actor: Actor): Promise<Result<{ stages: ApplicationStage[] }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  // Seeds the eight defaults on a fresh install (no-op once customised).
  return { stages: await ensureDefaultStages() };
}

export async function createStageService(
  actor: Actor,
  input: { name: string; instructions?: string },
): Promise<Result<{ stage: ApplicationStage }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  const name = input.name.trim();
  if (!name) return badRequest('Stage name is required');
  // Phase 7 (Caveat #B8): a custom stage named like a terminal stage
  // could never be assigned, and a duplicate name confuses
  // name-based tracking — reject both (case-insensitive).
  if (isReservedStageName(name)) {
    return badRequest(
      `"${name}" is a terminal stage — it is reached by approving / rejecting or onboarding, and cannot be created as a custom stage`,
    );
  }
  const existing = await listStages();
  if (existing.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
    return conflict(`A stage named "${name}" already exists`);
  }
  const position = existing.reduce((max, s) => Math.max(max, s.position), 0) + 1;
  const stage = await createStage({ name, position, instructions: input.instructions?.trim() || undefined });
  await logAudit({ actorId: actor.id, action: 'recruitment.stage.create', entity: 'application_stage', entityId: stage.id, detail: name });
  return { stage };
}

export async function updateStageService(
  actor: Actor,
  id: string,
  input: { name?: string; instructions?: string | null },
): Promise<Result<{ stage: ApplicationStage }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  if (input.name !== undefined && !input.name.trim()) return badRequest('Stage name is required');
  const existingStage = await getStageById(id);
  if (!existingStage) return notFound('Stage');
  if (input.name !== undefined) {
    const name = input.name.trim();
    // Renaming a stage to its own current name is a no-op — allow it.
    // Any other rename gets the same guards as creation (Caveat #B8):
    // terminal names are reserved and names must stay unique.
    if (name.toLowerCase() !== existingStage.name.toLowerCase()) {
      if (isReservedStageName(name)) {
        return badRequest(
          `"${name}" is a terminal stage — it is reached by approving / rejecting or onboarding, and cannot be used as a custom stage name`,
        );
      }
      const stages = await listStages();
      if (stages.some((s) => s.id !== id && s.name.toLowerCase() === name.toLowerCase())) {
        return conflict(`A stage named "${name}" already exists`);
      }
    }
  }
  const stage = await updateStage(id, {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.instructions !== undefined
      ? { instructions: input.instructions === null ? null : input.instructions.trim() || null }
      : {}),
  });
  if (!stage) return notFound('Stage');
  await logAudit({ actorId: actor.id, action: 'recruitment.stage.update', entity: 'application_stage', entityId: id, detail: stage.name });
  return { stage };
}

export async function deleteStageService(actor: Actor, id: string): Promise<Result<{ deleted: true }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  const stage = await getStageById(id);
  if (!stage) return notFound('Stage');
  // History survives: stageId is ON DELETE SET NULL and the stageName
  // snapshot stays readable (see application-stages.ts).
  await deleteStage(id);
  await logAudit({ actorId: actor.id, action: 'recruitment.stage.delete', entity: 'application_stage', entityId: id, detail: stage.name });
  return { deleted: true };
}

export async function reorderStagesService(
  actor: Actor,
  ids: string[],
): Promise<Result<{ stages: ApplicationStage[] }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  if (ids.length === 0) return badRequest('At least one stage is required');
  const existing = await listStages();
  const known = new Set(existing.map((s) => s.id));
  if (ids.some((id) => !known.has(id))) return notFound('Stage');
  const stages = await reorderStages(ids.map((id, i) => ({ id, position: i + 1 })));
  await logAudit({ actorId: actor.id, action: 'recruitment.stage.reorder', entity: 'application_stage', detail: ids.join(',') });
  return { stages };
}

// ---------------------------------------------------------------------------
// Admin: stage assignment / request-info / onboarding
// ---------------------------------------------------------------------------

export async function assignStage(
  actor: Actor,
  applicationId: string,
  stageId: string,
  note?: string,
): Promise<Result<{ application: InstructorApplication; stage: ApplicationStage; history: ApplicationStageHistory }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  const application = await getApplicationById(applicationId);
  if (!application) return notFound('Application');
  if (application.status !== 'pending') {
    return badRequest('Only a pending application can move stages');
  }
  const stage = await getStageById(stageId);
  if (!stage) return notFound('Stage');
  if (stage.name === ONBOARDED_STAGE_NAME) {
    return badRequest('Use Approve & Onboard to onboard an applicant');
  }
  if (stage.name === REJECTED_STAGE_NAME) {
    return badRequest('Use Reject to reject an application');
  }
  const history = await addHistory({
    applicationId,
    stageId: stage.id,
    stageName: stage.name,
    actorId: actor.id,
    note: note?.trim() || undefined,
    action: 'stage_assigned',
  });
  await logAudit({
    actorId: actor.id,
    action: 'application.stage',
    entity: 'application',
    entityId: applicationId,
    detail: `stage -> ${stage.name}`,
  });
  // Best-effort: no account yet (userId null) means nobody to notify.
  await notifyApplicantStageChanged(application, stage.name, stage.instructions);
  return { application, stage, history };
}

export async function requestInfo(
  actor: Actor,
  applicationId: string,
  note: string,
): Promise<Result<{ application: InstructorApplication; history: ApplicationStageHistory }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  if (!note.trim()) return badRequest('Tell the applicant what you need from them');
  const application = await getApplicationById(applicationId);
  if (!application) return notFound('Application');
  if (application.status !== 'pending') {
    return badRequest('Only a pending application can have information requested');
  }
  const current = await getCurrentStage(applicationId);
  const history = await addHistory({
    applicationId,
    stageId: current?.stageId ?? null,
    stageName: current?.stageName ?? 'Submitted',
    actorId: actor.id,
    note: note.trim(),
    action: 'info_requested',
  });
  await logAudit({
    actorId: actor.id,
    action: 'application.info_requested',
    entity: 'application',
    entityId: applicationId,
    detail: note.trim().slice(0, 200),
  });
  await notifyApplicantInfoRequested(application, note.trim());
  return { application, history };
}

export async function onboardApplication(
  actor: Actor,
  applicationId: string,
): Promise<Result<{ application: InstructorApplication; user: { id: string; role: string; isTeacher: boolean } }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  const application = await getApplicationById(applicationId);
  if (!application) return notFound('Application');
  if (application.status !== 'approved') {
    return badRequest('Only an approved application can be onboarded as a teacher');
  }
  if (!application.userId) {
    // Phase 7 (GAP #B6): signup now links a pre-existing unlinked
    // application automatically, so this only happens while the
    // applicant has not signed up yet — say so, and what happens next.
    return badRequest(
      'This applicant has no account yet — once they sign up with the same email, their application links automatically and you can onboard them',
    );
  }
  const history = await listHistory(applicationId);
  if (history.some((h) => h.action === 'onboarded')) {
    return conflict('Application has already been onboarded');
  }
  const user = await getUserById(application.userId);
  if (!user) return notFound('Applicant account');
  if (user.status !== 'active') {
    return badRequest('Only an active account can be onboarded as a teacher');
  }
  // Same account, same credentials: set the teacher flag and move the
  // primary role student -> instructor so login lands on the Teacher
  // Portal. An instructor/admin primary role is left untouched. The
  // password hash is never read or written here, and no session is
  // revoked — the next request rebuilds the session from this record.
  const updated = await updateUser(user.id, {
    isTeacher: true,
    role: user.role === 'student' ? 'instructor' : user.role,
  });
  if (!updated) return notFound('Applicant account');
  const stages = await ensureDefaultStages();
  const onboardStage = stages.find((s) => s.name === ONBOARDED_STAGE_NAME);
  await addHistory({
    applicationId,
    stageId: onboardStage?.id ?? null,
    stageName: ONBOARDED_STAGE_NAME,
    actorId: actor.id,
    action: 'onboarded',
  });
  await logAudit({
    actorId: actor.id,
    action: 'application.onboard',
    entity: 'application',
    entityId: applicationId,
    detail: `${application.email} onboarded as teacher (user ${user.id})`,
  });
  await notifyApplicantOnboarded(application);
  return {
    application,
    user: { id: updated.id, role: updated.role, isTeacher: updated.isTeacher },
  };
}

// ---------------------------------------------------------------------------
// Admin: application detail + internal notes (admin-only, never applicants)
// ---------------------------------------------------------------------------

export async function getApplicationDetailService(
  actor: Actor,
  applicationId: string,
): Promise<
  Result<{
    application: InstructorApplication;
    history: ApplicationStageHistory[];
    notes: ApplicationNote[];
    currentStageName: string | null;
    stages: ApplicationStage[];
  }>
> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  const application = await getApplicationById(applicationId);
  if (!application) return notFound('Application');
  const [history, notes, current, stages] = await Promise.all([
    listHistory(applicationId),
    listNotes(applicationId),
    getCurrentStage(applicationId),
    ensureDefaultStages(),
  ]);
  return { application, history, notes, currentStageName: current?.stageName ?? null, stages };
}

export async function addApplicationNoteService(
  actor: Actor,
  applicationId: string,
  body: string,
): Promise<Result<{ note: ApplicationNote }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  if (!body.trim()) return badRequest('Note text is required');
  const application = await getApplicationById(applicationId);
  if (!application) return notFound('Application');
  // isInternal is always true here: internal notes are NEVER shown to
  // applicants — there is no applicant read path for notes at all.
  const note = await addNote({ applicationId, authorId: actor.id, body: body.trim(), isInternal: true });
  await logAudit({ actorId: actor.id, action: 'application.note', entity: 'application', entityId: applicationId });
  return { note };
}

export async function listApplicationNotesService(
  actor: Actor,
  applicationId: string,
): Promise<Result<{ notes: ApplicationNote[] }>> {
  const denied = requireAdmin(actor);
  if (denied) return denied;
  const application = await getApplicationById(applicationId);
  if (!application) return notFound('Application');
  return { notes: await listNotes(applicationId) };
}

// ---------------------------------------------------------------------------
// Applicant tracking — the ONLY shape an applicant ever sees.
// ---------------------------------------------------------------------------

export interface ApplicantTrackingView {
  /** The applicant's own application (full row — it is theirs). */
  application: InstructorApplication;
  /** Current stage (latest history snapshot; 'Submitted' when untouched). */
  currentStage: { name: string; instructions?: string };
  /** Stages completed so far, in pipeline order. Never the full pipeline. */
  completedStages: string[];
  /** The immediate next stage, or null at a terminal step. Never more. */
  nextStage: { name: string; instructions?: string } | null;
  /** The latest history entry (action + note + time), or null. */
  latestUpdate: { action: string; stageName: string; note?: string; createdAt: string } | null;
  /** The applicant's own application notifications, newest first (max 5). */
  notifications: Array<{ id: string; title: string; body: string; createdAt: string; readAt?: string | null }>;
}

/**
 * Build the applicant-safe tracking view. ENFORCEMENT LIVES HERE, not
 * in the UI: the return value contains no stage list, no notes, no
 * other application and no stage beyond the immediate next one — so
 * even a caller that renders everything it receives cannot leak the
 * future pipeline.
 */
export function buildApplicantTrackingView(input: {
  application: InstructorApplication;
  history: ApplicationStageHistory[];
  stages: ApplicationStage[];
  notifications: Notification[];
}): ApplicantTrackingView {
  const { application, history, stages } = input;
  const ordered = [...stages].sort((a, b) => a.position - b.position);
  const latest = history.length > 0 ? history[history.length - 1] : null;
  const currentName =
    latest?.stageName ??
    (application.status === 'approved' ? 'Approved' : application.status === 'rejected' ? 'Rejected' : 'Submitted');
  const currentStageEntry = ordered.find((s) => s.name === currentName);

  // Completed = 'Submitted' plus every assigned stage, in pipeline order.
  const assignedNames = history.filter((h) => h.action === 'stage_assigned').map((h) => h.stageName);
  const completedStages: string[] = ['Submitted'];
  for (const stage of ordered) {
    if (assignedNames.includes(stage.name) && !completedStages.includes(stage.name)) {
      completedStages.push(stage.name);
    }
  }
  for (const name of assignedNames) {
    if (!completedStages.includes(name)) completedStages.push(name);
  }

  // Next = the single stage after the current one, or null at a
  // terminal step (rejected / onboarded). Nothing beyond it is exposed.
  let nextStage: ApplicantTrackingView['nextStage'] = null;
  const terminal = application.status === 'rejected' || latest?.action === 'onboarded';
  if (!terminal) {
    const idx = ordered.findIndex((s) => s.name === currentName);
    if (idx >= 0) {
      const next = ordered[idx + 1];
      if (next) nextStage = { name: next.name, instructions: next.instructions };
    } else {
      // Current stage is a decision snapshot (e.g. 'Approved'), not a
      // pipeline stage — the next step is onboarding.
      const onboarding = ordered.find((s) => s.name === 'Onboarding');
      if (onboarding) nextStage = { name: onboarding.name, instructions: onboarding.instructions };
    }
  }

  return {
    application,
    currentStage: { name: currentName, instructions: currentStageEntry?.instructions },
    completedStages,
    nextStage,
    latestUpdate: latest
      ? { action: latest.action, stageName: latest.stageName, note: latest.note, createdAt: latest.createdAt }
      : null,
    notifications: input.notifications.slice(0, 5).map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt,
      readAt: n.readAt ?? null,
    })),
  };
}

async function buildTrackingFor(
  application: InstructorApplication,
  userId: string,
): Promise<ApplicantTrackingView> {
  const [history, stages, page] = await Promise.all([
    listHistory(application.id),
    ensureDefaultStages(),
    listNotificationsForUser(userId, { limit: '20' }),
  ]);
  const notifications = page.items.filter((n) => n.type === 'application');
  return buildApplicantTrackingView({ application, history, stages, notifications });
}

/**
 * One applicant's tracking view. Ownership is enforced here: the
 * application must be linked to the caller's account, otherwise 404
 * (not 403 — the existence of someone else's application is not
 * disclosed). Internal notes are never included.
 */
export async function getApplicantTracking(
  actor: Actor,
  applicationId: string,
): Promise<Result<{ tracking: ApplicantTrackingView }>> {
  const application = await getApplicationById(applicationId);
  if (!application || application.userId !== actor.id) return notFound('Application');
  return { tracking: await buildTrackingFor(application, actor.id) };
}

export interface MyApplicationSummary {
  id: string;
  status: InstructorApplication['status'];
  createdAt: string;
  currentStageName: string;
  nextStageName: string | null;
  latestUpdateAt: string | null;
}

/** The caller's own applications, newest first, with tracking summaries. */
export async function listMyApplications(actor: Actor): Promise<{ applications: MyApplicationSummary[] }> {
  const applications = await getApplicationsByUserId(actor.id);
  const stages = await ensureDefaultStages();
  const items: MyApplicationSummary[] = [];
  for (const application of applications) {
    const history = await listHistory(application.id);
    const view = buildApplicantTrackingView({ application, history, stages, notifications: [] });
    items.push({
      id: application.id,
      status: application.status,
      createdAt: application.createdAt,
      currentStageName: view.currentStage.name,
      nextStageName: view.nextStage?.name ?? null,
      latestUpdateAt: view.latestUpdate?.createdAt ?? null,
    });
  }
  return { applications: items };
}

// ---------------------------------------------------------------------------
// Applicant: create a new application (portal path)
// ---------------------------------------------------------------------------

/**
 * Duplicate rule (see the file header): one PENDING application at a
 * time. A decided application (approved or rejected) does not block a
 * fresh one — this mirrors the Module 3 submit-path rule (one pending
 * per email), so the portal and the public form answer the same way.
 */
export async function canCreateNewApplication(
  userId: string,
): Promise<{ allowed: boolean; blockingApplicationId?: string }> {
  const applications = await getApplicationsByUserId(userId);
  for (const application of applications) {
    if (application.status === 'pending') {
      return { allowed: false, blockingApplicationId: application.id };
    }
  }
  return { allowed: true };
}

export async function createApplicantApplication(
  actor: Actor,
  input: SubmitApplicationInput,
): Promise<Result<{ application: InstructorApplication }>> {
  const user = await getUserById(actor.id);
  if (!user) return notFound('Account');
  // The portal files as yourself: the form email must be your account
  // email, so nobody files an application in someone else's name.
  if (input.email.trim().toLowerCase() !== user.email.toLowerCase()) {
    return forbidden('Applications can only be filed with your own account email');
  }
  const gate = await canCreateNewApplication(actor.id);
  if (!gate.allowed) {
    return conflict('You already have an active application — you can file a new one once it is decided');
  }
  // Reuses the public submit validation + account linking (owned by
  // another worker — called, not modified). userId links by email.
  const result = await submitApplication(input);
  if ('error' in result) return result;
  // First history entry: the application enters the pipeline at
  // 'Submitted' (the stage column does not exist — history IS the
  // stage record, see the file header).
  const stages = await ensureDefaultStages();
  const submitted = stages.find((s) => s.name === 'Submitted');
  await addHistory({
    applicationId: result.application.id,
    stageId: submitted?.id ?? null,
    stageName: 'Submitted',
    actorId: actor.id,
    action: 'stage_assigned',
  });
  return { application: result.application };
}

// ---------------------------------------------------------------------------
// Admin-assisted view-as (Module 21.4)
// ---------------------------------------------------------------------------

export async function startViewAs(
  actor: Actor,
  teacherId: string,
): Promise<
  Result<{ token: string; expiresAt: number | null; teacher: { id: string; name: string; email: string; role: string } }>
> {
  if (!hasAdminCapability(actor)) return forbidden('Only admins can view a teacher portal');
  if (teacherId === actor.id) return badRequest('You cannot view your own portal as a teacher');
  const teacher = await getUserById(teacherId);
  if (!teacher) return notFound('Teacher');
  // Teacher Portals ONLY — a student (no teacher flag / legacy role)
  // is refused here, and getSession re-checks the flag on every
  // request, so a revoked teacher loses view-as immediately.
  if (!hasTeacherCapability(teacher)) {
    return forbidden('Only a teacher portal can be viewed — student portals are never opened this way');
  }
  if (teacher.status !== 'active') return badRequest('Only an active teacher account can be viewed');
  // No expiry: the viewing session lasts until the admin clicks Exit,
  // signs out, or closes the browser.
  const { token } = mintViewAsToken(actor.id, teacherId);
  await logAudit({
    actorId: actor.id,
    action: 'admin.view_as.start',
    entity: 'user',
    entityId: teacherId,
    detail: `viewing teacher ${teacher.email}`,
  });
  return {
    token,
    expiresAt: null,
    teacher: { id: teacher.id, name: teacher.name, email: teacher.email, role: teacher.role },
  };
}

/** Audit the end of a viewing session. Called by the exit route (which uses the real admin session). */
export async function endViewAs(actor: Actor): Promise<{ ok: true }> {
  await logAudit({ actorId: actor.id, action: 'admin.view_as.end', entity: 'user', detail: 'returned to Admin Panel' });
  return { ok: true };
}
