/**
 * Application-stage repository (Phase 2, Module 22 — roles & recruitment).
 *
 * ApplicationStage is the admin-managed pipeline (e.g. Received,
 * Screening, Demo, Approved); ApplicationStageHistory is the
 * append-only audit trail of stage moves and review actions on one
 * application; ApplicationNote is an admin note on an application.
 * History keeps a denormalised stageName snapshot, so deleting or
 * renaming a stage never rewrites history. Notes are internal
 * (isInternal) by default — nothing exposes them to applicants.
 */
import { getDb } from './client';
import { dateToString } from './mappers';
import type {
  ApplicationNote,
  ApplicationNoteRow,
  ApplicationStage,
  ApplicationStageAction,
  ApplicationStageHistory,
  ApplicationStageHistoryRow,
  ApplicationStageRow,
} from './types';

export function mapStageRow(row: ApplicationStageRow): ApplicationStage {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    instructions: row.instructions ?? undefined,
    createdAt: dateToString(row.createdAt),
    updatedAt: dateToString(row.updatedAt),
  };
}

export function mapStageHistoryRow(row: ApplicationStageHistoryRow): ApplicationStageHistory {
  return {
    id: row.id,
    applicationId: row.applicationId,
    stageId: row.stageId ?? undefined,
    stageName: row.stageName,
    actorId: row.actorId ?? undefined,
    note: row.note ?? undefined,
    action: row.action as ApplicationStageAction,
    createdAt: dateToString(row.createdAt),
  };
}

export function mapApplicationNoteRow(row: ApplicationNoteRow): ApplicationNote {
  return {
    id: row.id,
    applicationId: row.applicationId,
    authorId: row.authorId,
    body: row.body,
    isInternal: row.isInternal,
    createdAt: dateToString(row.createdAt),
  };
}

/**
 * The default recruitment pipeline (Phase 2, Modules 19/20 — the
 * admin-configurable stage list ships with these eight). Seeded
 * idempotently by ensureDefaultStages when the stage table is empty;
 * an admin can rename, reorder, add or remove stages afterwards and
 * the seed never runs again (it only fires on an empty table).
 */
export const DEFAULT_APPLICATION_STAGES: ReadonlyArray<{ name: string; position: number }> = [
  { name: 'Submitted', position: 1 },
  { name: 'Under Review', position: 2 },
  { name: 'Interview Scheduled', position: 3 },
  { name: 'Teaching Demo', position: 4 },
  { name: 'Waiting for Approval', position: 5 },
  { name: 'Onboarding', position: 6 },
  { name: 'Successfully Onboarded', position: 7 },
  { name: 'Rejected', position: 8 },
];

/**
 * Seed the default pipeline when no stages exist yet. Returns the
 * stages in display order (the seeded defaults, or the existing list
 * when the table is non-empty). Never overwrites admin customisation.
 */
export async function ensureDefaultStages(): Promise<ApplicationStage[]> {
  const existing = await listStages();
  if (existing.length > 0) return existing;
  for (const stage of DEFAULT_APPLICATION_STAGES) {
    await createStage({ name: stage.name, position: stage.position });
  }
  return listStages();
}

/**
 * STAGE-COLUMN DECISION (Modules 19/20): the contract has NO stage
 * column on InstructorApplication and the contract must not be
 * modified by this worker — so the current stage is NOT a stored
 * column. It is derived from the append-only history: the latest
 * history entry's stageName snapshot (see listHistory, oldest first).
 * History survives stage renames/deletes (the snapshot), so the
 * current stage stays readable even after an admin edits the
 * pipeline. Returns null when the application has no history yet
 * (a fresh submission — callers treat that as 'Submitted').
 */
export async function getCurrentStage(
  applicationId: string,
): Promise<ApplicationStageHistory | null> {
  const history = await listHistory(applicationId);
  if (history.length === 0) return null;
  return history[history.length - 1];
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

/** All stages in display order. */
export async function listStages(): Promise<ApplicationStage[]> {
  const rows = await getDb()
    .orm.public.ApplicationStage.orderBy((s) => s.position.asc())
    .all();
  return rows.map(mapStageRow);
}

export async function getStageById(id: string): Promise<ApplicationStage | null> {
  const row = await getDb().orm.public.ApplicationStage.where({ id }).first();
  if (!row) return null;
  return mapStageRow(row);
}

export async function createStage(input: {
  name: string;
  position: number;
  instructions?: string;
}): Promise<ApplicationStage> {
  const row = await getDb().orm.public.ApplicationStage.create({
    name: input.name,
    position: input.position,
    instructions: input.instructions ?? null,
  });
  return mapStageRow(row);
}

export async function updateStage(
  id: string,
  input: { name?: string; position?: number; instructions?: string | null },
): Promise<ApplicationStage | null> {
  const row = await getDb()
    .orm.public.ApplicationStage.where({ id })
    .update({
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
      ...(input.instructions !== undefined ? { instructions: input.instructions } : {}),
    });
  if (!row) return null;
  return getStageById(id);
}

/**
 * Delete a stage. History rows survive: the stageId FK is ON DELETE
 * SET NULL, so their stageId becomes null and the denormalised
 * stageName snapshot stays readable. Returns false when the stage
 * does not exist.
 */
export async function deleteStage(id: string): Promise<boolean> {
  const row = await getDb().orm.public.ApplicationStage.where({ id }).delete();
  return row !== null;
}

/**
 * Reorder stages: applies each { id, position } in turn. Callers pass
 * the full ordered list; positions are stored as given (no
 * renumbering here — the admin UI owns the numbering).
 */
export async function reorderStages(order: Array<{ id: string; position: number }>): Promise<ApplicationStage[]> {
  for (const item of order) {
    await getDb().orm.public.ApplicationStage.where({ id: item.id }).update({ position: item.position });
  }
  return listStages();
}

// ---------------------------------------------------------------------------
// History (append-only)
// ---------------------------------------------------------------------------

/**
 * Append a history entry. `stageName` is snapshotted from the stage at
 * write time — pass the stage's current name, or a label such as
 * 'Approved' for non-stage actions (stageId null).
 */
export async function addHistory(input: {
  applicationId: string;
  stageId?: string | null;
  stageName: string;
  actorId?: string | null;
  note?: string;
  action: ApplicationStageAction;
}): Promise<ApplicationStageHistory> {
  const row = await getDb().orm.public.ApplicationStageHistory.create({
    applicationId: input.applicationId,
    stageId: input.stageId ?? null,
    stageName: input.stageName,
    actorId: input.actorId ?? null,
    note: input.note ?? null,
    action: input.action,
  });
  return mapStageHistoryRow(row);
}

/** One application's history, oldest first (chronological audit trail). */
export async function listHistory(applicationId: string): Promise<ApplicationStageHistory[]> {
  const rows = await getDb()
    .orm.public.ApplicationStageHistory.where({ applicationId })
    .orderBy((h) => h.createdAt.asc())
    .all();
  return rows.map(mapStageHistoryRow);
}

// ---------------------------------------------------------------------------
// Notes (admin-only)
// ---------------------------------------------------------------------------

export async function addNote(input: {
  applicationId: string;
  authorId: string;
  body: string;
  isInternal?: boolean;
}): Promise<ApplicationNote> {
  const row = await getDb().orm.public.ApplicationNote.create({
    applicationId: input.applicationId,
    authorId: input.authorId,
    body: input.body,
    isInternal: input.isInternal ?? true,
  });
  return mapApplicationNoteRow(row);
}

/** One application's notes, newest first. Admin-only to read — no applicant path exists. */
export async function listNotes(applicationId: string): Promise<ApplicationNote[]> {
  const rows = await getDb()
    .orm.public.ApplicationNote.where({ applicationId })
    .orderBy((n) => n.createdAt.desc())
    .all();
  return rows.map(mapApplicationNoteRow);
}
