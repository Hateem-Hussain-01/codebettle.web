/**
 * Orphaned application-file cleanup (Module 3, Phase 2).
 *
 * The become-instructor form uploads the CV and demo recording BEFORE
 * the final application POST. If that POST fails (or the demo upload
 * fails after the CV uploaded), the already-uploaded files would sit
 * orphaned in the private `application-files` bucket. The form calls
 * this helper with every uploaded storage path on any such failure.
 *
 * Best-effort by design: a cleanup failure is swallowed, never thrown
 * — it must never mask the real submit error shown to the applicant.
 * The server only deletes paths the upload route itself returned
 * (see isApplicationFilePath), so a bad path here is a harmless 400.
 */
export async function cleanupUploadedApplicationFiles(paths: string[]): Promise<void> {
  await Promise.all(
    paths.map(async (path) => {
      try {
        await fetch(`/api/applications/upload?path=${encodeURIComponent(path)}`, {
          method: 'DELETE',
        });
      } catch {
        // Best-effort cleanup — never surface to the applicant.
      }
    }),
  );
}
