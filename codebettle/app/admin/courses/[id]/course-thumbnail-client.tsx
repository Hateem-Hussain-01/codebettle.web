'use client';
import Card from '@/components/ui/Card';
import FadeIn from '@/components/ui/FadeIn';
import CourseThumbnailUploader from '@/components/ui/CourseThumbnailUploader';

interface CourseThumbnailClientProps {
  courseId: string;
  thumbnail: string;
}

/**
 * Admin course thumbnail section (Phase 4, Module 2) on the admin
 * course detail page. Shows the live preview of the current thumbnail
 * and the upload control; uploading posts to
 * POST /api/admin/courses/[id]/thumbnail, which stores the image in
 * the public `course-images` bucket and saves the URL on the course,
 * so every render site shows the new thumbnail on the next load.
 * Nothing here invents an image: until the admin uploads one, the
 * course keeps whatever thumbnail it already has (seed Unsplash URLs
 * stay as-is until the user provides the new images).
 */
export default function CourseThumbnailClient({ courseId, thumbnail }: CourseThumbnailClientProps) {
  return (
    <FadeIn delay={0.05}>
      <Card>
        <h2 className="text-white font-bold mb-1 text-sm">Course Thumbnail</h2>
        <p className="text-muted text-xs mb-4">Upload a new thumbnail to replace the current one — it updates everywhere the course is shown.</p>
        <CourseThumbnailUploader
          uploadUrl={`/api/admin/courses/${courseId}/thumbnail`}
          initialUrl={thumbnail}
          onUploaded={() => {}}
        />
      </Card>
    </FadeIn>
  );
}
