/**
 * Authentication core — thin compatibility wrapper (Phase 2).
 * The real logic lives in lib/services/auth-service.ts (Prisma-backed).
 * This module re-exports it so existing import sites (routes, pages,
 * tests) keep working unchanged.
 */
export { changePassword, login, registerUser, toSafeUser, toSessionUser } from './services/auth-service';
export type { RegisterInput, SessionUser } from './services/auth-service';
