import { connection } from 'next/server';
import SuccessStoryDetailClient from './success-story-detail-client';

/**
 * Admin success story submission detail.
 * Server wrapper only: the submission is loaded client-side from
 * GET /api/admin/success-stories/[id]. The admin layout enforces the
 * 'success-stories' area server-side.
 */
export default async function AdminSuccessStoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  return <SuccessStoryDetailClient id={id} />;
}
