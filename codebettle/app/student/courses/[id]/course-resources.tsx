'use client';
import { ExternalLink, File, FileText, FolderOpen, Lock, Presentation } from 'lucide-react';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import {
  collectCourseResources,
  countCourseResources,
  resourceFileKind,
  type CourseResourceKind,
  type GatedLessonMaterials,
} from '@/lib/course-resources';
import type { PublicCourse } from '@/lib/db/types';

const KIND_ICON: Record<CourseResourceKind, typeof FileText> = {
  pdf: FileText,
  presentation: Presentation,
  other: File,
};

/**
 * Resources section for /student/courses/[id] — a distinct section below
 * the lesson list (the page has no tabs, so a section fits the existing
 * structure better than a tab switch).
 *
 * Reuses the gated content already fetched by StudentCourseContent — no
 * new fetch, no new API. Gating is strict: while the enrolment payment is
 * pending, only a locked notice renders — NO material names or URLs, even
 * though the endpoint returns the first 2 lessons' materials for the
 * lesson list. Once payment is verified, every material from every lesson
 * is listed, grouped by module, then lesson.
 */
interface CourseResourcesProps {
  modules: PublicCourse['modules'];
  /** Gated lesson materials — null while the gated content is still loading. */
  lessons: GatedLessonMaterials[] | null;
  /** True while the enrolment payment is pending — nothing leaks. */
  paymentPending: boolean;
}

export default function CourseResources({ modules, lessons, paymentPending }: CourseResourcesProps) {
  if (paymentPending) {
    return (
      <div>
        <h2 className="text-foreground font-bold mb-3">Resources</h2>
        <Card className="py-8 text-center">
          <Lock className="w-8 h-8 text-yellow-400 mx-auto mb-3" />
          <p className="text-foreground font-medium text-sm">Resources are locked</p>
          <p className="text-muted text-sm mt-1">Resources unlock once your payment is confirmed.</p>
        </Card>
      </div>
    );
  }

  if (lessons === null) {
    return (
      <div>
        <h2 className="text-foreground font-bold mb-3">Resources</h2>
        <Card className="py-8 text-center">
          <p className="text-muted text-sm">Loading resources…</p>
        </Card>
      </div>
    );
  }

  const groups = collectCourseResources(modules, lessons);
  const total = countCourseResources(groups);

  if (total === 0) {
    return (
      <div>
        <h2 className="text-foreground font-bold mb-3">Resources</h2>
        <Card className="py-8 text-center">
          <FolderOpen className="w-8 h-8 text-muted mx-auto mb-3" />
          <p className="text-muted text-sm">No resources shared yet</p>
          <p className="text-muted text-xs mt-1">Your teacher hasn&apos;t shared any files for this course yet.</p>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-foreground font-bold mb-3 flex items-center gap-2">
        Resources
        <Badge variant="primary">{total} file{total !== 1 ? 's' : ''}</Badge>
      </h2>
      <div className="space-y-4">
        {groups.map((group) => {
          const groupTotal = group.lessons.reduce((n, lesson) => n + lesson.materials.length, 0);
          return (
            <Card key={group.moduleId} className="p-0 overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3 bg-dark-border/30">
                <FolderOpen className="w-4 h-4 text-primary-text" />
                <h3 className="font-semibold text-foreground text-sm">{group.moduleTitle}</h3>
                <span className="text-xs text-muted ml-auto">{groupTotal} file{groupTotal !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-dark-border">
                {group.lessons.map((lesson) => (
                  <div key={lesson.lessonId} className="px-5 py-3">
                    <p className="text-muted text-xs mb-2">{lesson.lessonTitle}</p>
                    <div className="space-y-1.5">
                      {lesson.materials.map((mat, mi) => {
                        const Icon = KIND_ICON[resourceFileKind(mat.name, mat.url)];
                        return (
                          <a
                            key={`${mat.url}#${mi}`}
                            href={mat.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2.5 text-sm bg-dark-border/30 hover:bg-dark-border/60 border border-dark-border rounded-lg px-3 py-2 transition-colors"
                          >
                            <Icon className="w-4 h-4 text-primary-text shrink-0" />
                            <span className="text-foreground flex-1 truncate">{mat.name}</span>
                            <ExternalLink className="w-3.5 h-3.5 text-muted shrink-0" />
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
