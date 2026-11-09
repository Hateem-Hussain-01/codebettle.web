import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidBody, readJson, requireAdmin, serviceError } from '@/lib/api-helpers';
import {
  importUsers,
  previewUserImport,
  type ValidImportRow,
} from '@/lib/services/user-import-service';

/**
 * POST /api/admin/users/import — CSV user import (admin only).
 * Two steps: preview first, then confirm.
 * - { csv } (confirm omitted/false): preview only — validates every row
 *   and returns { totalRows, validCount, invalidCount, valid, invalid }.
 *   Nothing is written.
 * - { csv, confirm: true, valid: [...] }: imports ONLY the valid rows
 *   echoed back from the preview. Returns { importedCount, skippedCount,
 *   imported: [{ id, email }] }. confirm without a valid payload is 400.
 * Columns: name, email, role, phone (phone optional). role is student or
 * instructor only; admin is never importable. No password column exists.
 */
const validRowSchema = z.object({
  line: z.number().int().optional(),
  name: z.string(),
  email: z.string(),
  role: z.enum(['student', 'instructor']),
  phone: z.string().optional(),
});

const importSchema = z.object({
  csv: z.string(),
  confirm: z.boolean().optional(),
  valid: z.array(validRowSchema).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if ('error' in auth) return auth.error;

  const body = await readJson(request);
  if (body === null) return invalidBody();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'A CSV string is required' }, { status: 400 });
  }
  const { csv, confirm, valid } = parsed.data;

  if (confirm === true) {
    if (!valid || valid.length === 0) {
      return NextResponse.json(
        { error: 'Confirm requires the valid rows from a preview' },
        { status: 400 },
      );
    }
    const result = await importUsers(
      auth.session,
      valid as ValidImportRow[],
    );
    if ('error' in result) return serviceError(result);
    return NextResponse.json(result, { status: 201 });
  }

  const preview = await previewUserImport(auth.session, csv);
  if ('error' in preview) return serviceError(preview);
  return NextResponse.json(preview);
}
