/**
 * Admin user management — thin compatibility wrapper (Phase 2).
 * The real logic lives in lib/services/admin-service.ts (Prisma-backed,
 * soft deletes). This module re-exports it so existing import sites
 * (routes, tests) keep working unchanged.
 */
export { createManagedUser, deleteManagedUser, setUserStatus } from './services/admin-service';
export type { CreateManagedUserInput, ManagedRole, SafeUser } from './services/admin-service';
