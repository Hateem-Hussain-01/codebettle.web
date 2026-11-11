import { connection } from 'next/server';
import { loadCommunicationsData } from './communications-data';
import CommunicationsClient from './communications-client';

/**
 * Admin communications dashboard (Phase 3, Module 14).
 *
 * Server wrapper: loads the read/aggregate view (announcements enriched
 * with author/course/recipient counts + admin-composed targeted
 * notifications) and hands it to the client component for tabs, search
 * and lazy receipt loading. The admin-area guard lives in
 * app/admin/layout.tsx ('communications' area) — this page adds no
 * second, weaker check. No send, no inbox, no new store: composing
 * lives on Worker B's page, the request queue on Worker C's.
 */
export default async function AdminCommunicationsPage() {
  await connection();
  const data = await loadCommunicationsData();
  return (
    <CommunicationsClient
      announcements={data.announcements}
      targeted={data.targeted}
      stats={data.stats}
    />
  );
}
