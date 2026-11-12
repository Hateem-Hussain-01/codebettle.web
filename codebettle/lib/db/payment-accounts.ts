/**
 * Payment-account repository (Phase 0/1, Module 16).
 *
 * The published accounts students pay into (bank / Easypaisa /
 * JazzCash / wallet). Only active accounts are shown to students,
 * ordered by displayOrder (then oldest first). Deleting or
 * deactivating an account never damages history: every payment
 * submission carries a frozen snapshot of the account (see
 * buildAccountSnapshot / lib/db/payments.ts).
 */
import { getDb } from './client';
import { dateToString, stripUndefined } from './mappers';
import type {
  PaymentAccount,
  PaymentAccountRow,
  PaymentAccountSnapshot,
  PaymentMethod,
} from './types';
import { PAYMENT_METHODS } from './types';

export function mapPaymentAccountRow(row: PaymentAccountRow): PaymentAccount {
  return {
    id: row.id,
    label: row.label,
    method: row.method,
    accountHolder: row.accountHolder,
    bankName: row.bankName ?? undefined,
    accountNumber: row.accountNumber ?? undefined,
    iban: row.iban ?? undefined,
    walletNumber: row.walletNumber ?? undefined,
    instructions: row.instructions ?? undefined,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
    createdAt: dateToString(row.createdAt),
    updatedAt: dateToString(row.updatedAt),
  };
}

/**
 * Frozen copy of an account, taken at submit time and stored on the
 * payment submission. Only the fields a student needs to recognise
 * the account they paid into — never any credential.
 */
export function buildAccountSnapshot(account: PaymentAccount): PaymentAccountSnapshot {
  return {
    label: account.label,
    method: account.method,
    accountHolder: account.accountHolder,
    ...(account.bankName ? { bankName: account.bankName } : {}),
    ...(account.accountNumber ? { accountNumber: account.accountNumber } : {}),
    ...(account.iban ? { iban: account.iban } : {}),
    ...(account.walletNumber ? { walletNumber: account.walletNumber } : {}),
  };
}

/** Safely read the PaymentSubmission.accountSnapshot Json column. */
export function toPaymentAccountSnapshot(value: unknown): PaymentAccountSnapshot {
  const fallback: PaymentAccountSnapshot = { label: '', method: 'other', accountHolder: '' };
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }
  const v = value as Record<string, unknown>;
  const method =
    typeof v.method === 'string' && (PAYMENT_METHODS as readonly string[]).includes(v.method)
      ? (v.method as PaymentMethod)
      : 'other';
  return {
    label: typeof v.label === 'string' ? v.label : '',
    method,
    accountHolder: typeof v.accountHolder === 'string' ? v.accountHolder : '',
    ...(typeof v.bankName === 'string' ? { bankName: v.bankName } : {}),
    ...(typeof v.accountNumber === 'string' ? { accountNumber: v.accountNumber } : {}),
    ...(typeof v.iban === 'string' ? { iban: v.iban } : {}),
    ...(typeof v.walletNumber === 'string' ? { walletNumber: v.walletNumber } : {}),
  };
}

/** All accounts (admin), in display order. */
export async function listPaymentAccounts(): Promise<PaymentAccount[]> {
  const rows = await getDb()
    .orm.public.PaymentAccount.orderBy((a) => a.displayOrder.asc())
    .orderBy((a) => a.createdAt.asc())
    .all();
  return rows.map(mapPaymentAccountRow);
}

/** Active accounts only (what students see), in display order. */
export async function listActivePaymentAccounts(): Promise<PaymentAccount[]> {
  const rows = await getDb()
    .orm.public.PaymentAccount.where({ isActive: true })
    .orderBy((a) => a.displayOrder.asc())
    .orderBy((a) => a.createdAt.asc())
    .all();
  return rows.map(mapPaymentAccountRow);
}

export async function getPaymentAccountById(id: string): Promise<PaymentAccount | null> {
  const row = await getDb().orm.public.PaymentAccount.where({ id }).first();
  if (!row) return null;
  return mapPaymentAccountRow(row);
}

export interface CreatePaymentAccountInput {
  label: string;
  method: PaymentMethod;
  accountHolder: string;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  walletNumber?: string;
  instructions?: string;
  isActive?: boolean;
  displayOrder?: number;
}

export async function createPaymentAccount(
  input: CreatePaymentAccountInput,
): Promise<PaymentAccount> {
  const row = await getDb().orm.public.PaymentAccount.create({
    label: input.label,
    method: input.method,
    accountHolder: input.accountHolder,
    bankName: input.bankName ?? null,
    accountNumber: input.accountNumber ?? null,
    iban: input.iban ?? null,
    walletNumber: input.walletNumber ?? null,
    instructions: input.instructions ?? null,
    isActive: input.isActive ?? true,
    displayOrder: input.displayOrder ?? 0,
  });
  return mapPaymentAccountRow(row);
}

export interface UpdatePaymentAccountInput {
  label?: string;
  method?: PaymentMethod;
  accountHolder?: string;
  bankName?: string | null;
  accountNumber?: string | null;
  iban?: string | null;
  walletNumber?: string | null;
  instructions?: string | null;
  isActive?: boolean;
  displayOrder?: number;
}

/** Update an account. Null when not found. */
export async function updatePaymentAccount(
  id: string,
  input: UpdatePaymentAccountInput,
): Promise<PaymentAccount | null> {
  const row = await getDb()
    .orm.public.PaymentAccount.where({ id })
    .update(stripUndefined({ ...input }));
  if (!row) return null;
  return getPaymentAccountById(id);
}

/** (De)activate an account. Null when not found. */
export async function setPaymentAccountActive(
  id: string,
  isActive: boolean,
): Promise<PaymentAccount | null> {
  return updatePaymentAccount(id, { isActive });
}

/**
 * Detach a payment account from every submission that references it:
 * set their paymentAccountId to NULL. The frozen accountSnapshot on
 * each submission is NEVER touched, so payment history stays intact.
 * Required before deleting an account: the paymentAccountId FK has
 * no ON DELETE action, so deleting a referenced account fails live
 * with a foreign-key violation unless its submissions are detached
 * first. Returns the number of submissions detached.
 */
export async function detachPaymentSubmissionsFromAccount(accountId: string): Promise<number> {
  const rows = await getDb()
    .orm.public.PaymentSubmission.where({ paymentAccountId: accountId })
    .updateAll({ paymentAccountId: null });
  return rows.length;
}

/**
 * Delete an account. History is safe: submissions keep their
 * accountSnapshot, so deleting the account never rewrites a past
 * submission. Callers MUST detach referencing submissions first
 * (detachPaymentSubmissionsFromAccount) — the paymentAccountId FK
 * has no ON DELETE action. False when not found.
 */
export async function deletePaymentAccount(id: string): Promise<boolean> {
  const row = await getDb().orm.public.PaymentAccount.where({ id }).delete();
  return row !== null;
}
