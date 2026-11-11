/**
 * Payment-proof storage (Phase 1b) — Supabase Storage, server-side only.
 *
 * Same pattern as lib/services/application-storage.ts
 * (application-files), lib/services/blog-storage.ts (blog-pdfs) and
 * lib/services/quiz-storage.ts (quiz-pdfs): the service-role key
 * (server-only) builds the client; a missing key throws naming the env
 * var, and the upload route maps that to HTTP 503.
 *
 * The `payment-proofs` bucket must be PRIVATE, like `application-files`:
 * transaction screenshots/receipts are personal financial documents —
 * they must never be reachable from a plain public URL. What gets
 * stored on the PaymentSubmission is the storage PATH
 * (e.g. `payment-proofs/<uuid>.png`), not a URL; an admin mints a
 * short-lived signed URL for it through createPaymentProofSignedUrl
 * (see app/api/admin/payments/[id]/proof/route.ts).
 *
 * NO live upload happens here or in tests: the key is not available on
 * this VM. Tests pass a mock client instead of calling the getter.
 * Live setup: create the `payment-proofs` bucket in the Supabase
 * dashboard (Storage -> New bucket, PRIVATE) and set
 * SUPABASE_SERVICE_ROLE_KEY in .env.local / Vercel env vars.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

export const PAYMENT_PROOFS_BUCKET = 'payment-proofs';
export const MAX_PAYMENT_PROOF_BYTES = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_PAYMENT_PROOF_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
] as const;

const PROOF_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

export interface PaymentProofFile {
  name: string;
  type: string;
  size: number;
  /** Raw bytes, or a function returning them (like File.arrayBuffer). */
  arrayBuffer: ArrayBuffer | Buffer | (() => Promise<ArrayBuffer>);
}

/** Build the service-role storage client. Throws naming the missing env var. */
export function getPaymentProofStorageClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  if (!url) {
    throw new Error('Supabase URL is not set (expected NEXT_PUBLIC_SUPABASE_URL)');
  }
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set — payment proof uploads need the Supabase service-role key (server-only env var)',
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readBytes(file: PaymentProofFile): Promise<Buffer> {
  const bytes = typeof file.arrayBuffer === 'function' ? await file.arrayBuffer() : file.arrayBuffer;
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
}

/**
 * Upload one transaction screenshot/receipt to
 * `payment-proofs/payment-proofs/<uuid>.<ext>`. Returns the storage
 * path — that is what gets saved to PaymentSubmission.proofUrl.
 * Validation runs before the client is built, so a bad file is a 400
 * even when the service-role key is missing.
 */
export async function uploadPaymentProof(
  file: PaymentProofFile,
  client?: SupabaseClient,
): Promise<{ path: string }> {
  if (!(ALLOWED_PAYMENT_PROOF_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('Only PNG, JPEG, WebP images or PDF files are allowed for the payment proof');
  }
  if (file.size > MAX_PAYMENT_PROOF_BYTES) {
    throw new Error('Payment proof must be 5 MB or smaller');
  }
  const body = await readBytes(file);
  if (body.byteLength > MAX_PAYMENT_PROOF_BYTES) {
    throw new Error('Payment proof must be 5 MB or smaller');
  }
  const storage = client ?? getPaymentProofStorageClient();
  const path = `payment-proofs/${randomUUID()}.${PROOF_EXTENSIONS[file.type]}`;
  const { data, error } = await storage.storage
    .from(PAYMENT_PROOFS_BUCKET)
    .upload(path, body, { contentType: file.type, upsert: false });
  if (error || !data) {
    throw new Error(`Payment proof upload failed: ${error?.message ?? 'unknown error'}`);
  }
  return { path: data.path };
}

/**
 * Mint a short-lived signed URL for a stored payment proof, so an
 * admin can view/download a screenshot from the private bucket.
 * `expiresInSeconds` defaults to 1 hour.
 */
export async function createPaymentProofSignedUrl(
  path: string,
  expiresInSeconds = 3600,
  client?: SupabaseClient,
): Promise<string> {
  const storage = client ?? getPaymentProofStorageClient();
  const { data, error } = await storage.storage
    .from(PAYMENT_PROOFS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    throw new Error(`Could not open the file: ${error?.message ?? 'unknown error'}`);
  }
  return data.signedUrl;
}

/** Delete a previously uploaded payment proof by its storage path. */
export async function deletePaymentProof(path: string, client?: SupabaseClient): Promise<void> {
  const storage = client ?? getPaymentProofStorageClient();
  const { error } = await storage.storage.from(PAYMENT_PROOFS_BUCKET).remove([path]);
  if (error) {
    throw new Error(`Payment proof delete failed: ${error.message}`);
  }
}
