/**
 * Shared service-result helpers (Phase 3).
 *
 * New services return `{ ... } | ServiceError` instead of a bare
 * `{ error: string }` so routes can map to the right HTTP status without
 * matching on message text (401/403/404/400). Older services
 * (admin-service create/suspend/delete) keep their original shape.
 */
import type { UserRole } from '../db/types';

export interface Actor {
  id: string;
  role: UserRole;
  name?: string;
}

export interface ServiceError {
  error: string;
  status: number;
}

export function notFound(what: string): ServiceError {
  return { error: `${what} not found`, status: 404 };
}

export function forbidden(message: string): ServiceError {
  return { error: message, status: 403 };
}

export function badRequest(message: string): ServiceError {
  return { error: message, status: 400 };
}
