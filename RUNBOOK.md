# CodeBettle Phase 2 — Live-Database Runbook

Everything in this file needs a machine whose network can reach Postgres
(Eman's laptop, the Vultr VM, or CI). **This VM cannot run any of it:**
its egress proxy resets Postgres-protocol connections (`ECONNRESET`
during the handshake, verified twice). All commands run from the
`codebettle/` folder of the `feature/complete-management-system-upgrade`
branch, with `DATABASE_URL` already in the gitignored `.env.local`.

## 0. Prerequisites

- Node 20+ and npm. `git clone` the branch (or pull it once pushed).
- `.env.local` holds `DATABASE_URL` (Supabase, direct port 5432) plus the
  Supabase URL + publishable key. Never commit it, never paste it in chat.
- The Supabase project already has all 21 tables — Eman ran
  `codebettle-init-tables.sql` in the SQL Editor on 9 Nov 2026. The seed
  has NOT been run yet.

## 1. Apply migration 2 (Lesson.date)

Migration 1 (`20261109T1830_init`, 89 ops) is already in effect on the
live database (the tables exist), but Prisma has no record of it. Mark
it applied without re-running it, then deploy migration 2:

```bash
cd codebettle
npx prisma migrate resolve --applied 20261109T1830_init
npx prisma migrate deploy
```

Migration 2 (`20261109T1926_add_lesson_date`) is exactly one operation:

```sql
ALTER TABLE "public"."Lesson" ADD COLUMN "date" timestamptz(3);
```

Fallback (if `migrate resolve` is unavailable in the installed Prisma
version): run that single `ALTER TABLE` in the Supabase SQL Editor, and
record both migrations as applied afterwards. Do NOT re-run the init
SQL — the tables already exist.

Verify the column exists:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'Lesson' AND column_name = 'date';
-- expected: 1 row
```

## 2. Run the seed (161 rows, one transaction)

Run `codebettle/prisma/seed.sql` in the Supabase SQL Editor (or with
`psql "$DATABASE_URL" -f prisma/seed.sql`). It is a single transaction:
either all 161 rows land or none do. The file is identical to
`~/workspace/your_files/codebettle-seed-data.sql` (the user-facing copy).

Verify — expected values in brackets:

```sql
SELECT 'User', COUNT(*) FROM "public"."User";            -- 27
SELECT 'Course', COUNT(*) FROM "public"."Course";        -- 8
SELECT 'Module', COUNT(*) FROM "public"."Module";        -- 13
SELECT 'Lesson', COUNT(*) FROM "public"."Lesson";        -- 25
SELECT 'Enrollment', COUNT(*) FROM "public"."Enrollment";-- 15
SELECT 'LessonProgress', COUNT(*) FROM "public"."LessonProgress"; -- 42
SELECT 'Certificate', COUNT(*) FROM "public"."Certificate";       -- 6
SELECT 'Coupon', COUNT(*) FROM "public"."Coupon";        -- 4
SELECT 'Announcement', COUNT(*) FROM "public"."Announcement";    -- 5
SELECT 'Review', COUNT(*) FROM "public"."Review";        -- 6
SELECT 'Testimonial', COUNT(*) FROM "public"."Testimonial";      -- 6
SELECT 'BlogPost', COUNT(*) FROM "public"."BlogPost";    -- 4
SELECT SUM("amountPaid") FROM "public"."Enrollment";     -- 57489
SELECT COUNT(*) FROM "public"."Lesson" WHERE "date" IS NULL;    -- 0
SELECT COUNT(DISTINCT "passwordHash") FROM "public"."User";      -- 1
```

The single password hash is intentional: every seeded user shares one
bcrypt hash of a random unknown value, so NO seeded account can be
signed into (the old demo passwords were public in the repo). Seeded
accounts are data, not logins.

Offline equivalent (already passing on the VM): `npm test` runs
`tests/seed-validation.test.ts` against the same file.

## 3. Verify the Prisma client and the app

```bash
cd codebettle
DOTENV_CONFIG_PATH=.env.local npx prisma db verify   # read-only connection check
npm run build                                        # must exit 0
npm test                                             # 49 tests must pass
```

Then start the dev server and smoke-test the auth flow against the live DB:
register a student at `/auth/register`, sign in, sign out, change the
password (old sessions must die), and run the first-run setup below.

## 4. First-run admin setup (the two official admins)

1. Open `/auth/setup` (locally `http://localhost:3000/auth/setup`, or the
   deployed URL + `/auth/setup`).
2. Each admin picks their identity — Muhammad Hateem Hussain (COO,
   mhateemjutt1412@gmail.com) or Ahmad Hassan (CEO,
   ahmad.hassan.hnd@gmail.com) — and chooses their own password
   (min 8 characters). The password is bcrypt-hashed before storage.
3. Once both accounts exist, `/auth/setup` redirects to `/auth/login`
   and setup is closed. `GET /api/auth/setup` shows which accounts are
   claimed (no sensitive data).

Do NOT create admin accounts any other way (never via the seed, never
by hand in the database, never with an invented password).

## 5. Deploy checklist (Vercel)

- Set `DATABASE_URL` in the Vercel project environment variables
  (Production + Preview). The app reads it at runtime, never at build
  time — `next build` must succeed with no database present.
- Push the branch to GitHub FIRST (the GitHub App `meta-muse-ai` needs
  write access to `codebettle.web` — see the purge report), then merge
  only with Eman's approval. Pushing `main` redeploys the live site.
- After deploy: run the first-run setup on the live URL, then verify
  sign-in, the course catalogue, and one enrolment flow.

## 6. Known gaps (not done in Phase 2 — do not mistake them for bugs)

- **Password-reset email is not configured.** The token machinery is
  complete (`POST /api/auth/reset`), but no email is sent: Resend +
  Eman's domain are pending. Until then a requested reset token is
  created and expires unused. Plug delivery in at
  `app/api/auth/reset/route.ts` (pass a `deliver` callback to
  `requestPasswordReset` in `lib/services/password-reset-service.ts`).
- **Rate limiting is still in-memory** (`lib/rate-limit.ts`). It works
  for one server instance and resets on restart. The plan calls for
  Upstash Redis; there are no Upstash credentials yet and no rate-limit
  table in the contract. Add Upstash credentials, then swap the store.
- **Prisma 8 is a release candidate (8.0.0-rc.33).** The stable 7.10.1
  swap is NOT a drop-in `npm install`: Prisma 7 uses a different
  generated-client API (`@prisma/client`, no `db.orm.public.*` fluent
  chains), so switching means re-generating the client and adapting
  `src/prisma/db.ts` plus every repository. Recommended: stay on the
  Prisma 8 RC until 8 stable lands, and re-run `prisma contract emit`
  + `prisma migration check` after any upgrade. Only switch to 7 if a
  specific RC bug blocks deployment.
- **Write APIs are intentionally thin.** Phase 2 built read repositories
  for every aggregate plus the auth/admin write paths. Per-resource
  write APIs (courses, enrolments, certificates, coupons, …) belong
  with the Phase 3 features that use them. Admin pages currently keep
  their local-state edits (fake saves, as before) — Phase 3 wires them
  to real endpoints.
- **No live-DB verification was possible from the VM.** Everything
  above (migrations, seed, `db verify`, live smoke test) is unverified
  until run on a machine with open network. The offline evidence is:
  `prisma migration check` passes (2 migrations, 3 contracts),
  `prisma/seed.sql` validates (counts + FKs + amountPaid 57489, 0 errors),
  `tsc --noEmit` clean, 49/49 tests pass, `npm run build` exit 0.

## 7. Rollback reference

- Pre-purge backup bundle (original history incl. the leaked password):
  `~/workspace/codebettle-web-backup/codebettle-web-pre-purge.bundle`.
  Do NOT delete it until the rewritten history is pushed and verified
  on GitHub.
- To restore the old in-memory data layer for reference:
  `git checkout <old-commit> -- codebettle/lib/data`
  (the purge report `~/workspace/your_files/codebettle-purge-report.txt`
  lists the commits). The app will not run from it without reverting
  the Phase 2 page conversions.

---

# Phase 3 — Live-Database & Storage Runbook

Same rule as above: everything here needs a machine whose network can
reach Postgres (Eman's laptop, the Vultr VM, or CI). This VM cannot run
any of it (egress proxy resets Postgres-protocol connections). All
commands run from the `codebettle/` folder of the
`feature/complete-management-system-upgrade` branch, with `DATABASE_URL`
already in the gitignored `.env.local`.

## 3.1. Apply migration 3 (`20261109T2032_add_application_message`)

Phase 3 adds one schema change: a nullable `message` column on
`InstructorApplication` (the become-instructor form's "Why do you want
to teach?" answer). Migration 3 is exactly one operation:

```sql
ALTER TABLE "public"."InstructorApplication" ADD COLUMN "message" text;
```

Apply migrations 2 and 3 together on a machine with DB access (after
marking migration 1 applied, §1 above):

```bash
cd codebettle
npx prisma migrate deploy
```

SQL Editor fallback (run by hand, then record both migrations applied —
see §1 for the `migrate resolve` note):

```sql
ALTER TABLE "public"."Lesson" ADD COLUMN "date" timestamptz(3);
ALTER TABLE "public"."InstructorApplication" ADD COLUMN "message" text;
```

Then verify the column exists:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'InstructorApplication' AND column_name = 'message';
-- expected: 1 row
```

Existing applications (if any) get `message = NULL` — no data migration
is needed.

## 3.2. Create the `blog-pdfs` bucket (private)

In the Supabase dashboard: **Storage → New bucket → name `blog-pdfs`
→ Private** (leave "Public bucket" off). Uploads and deletes go through
the server-side service-role key, so a private bucket is correct — the
upload route returns a public URL for each file, and readers open that
URL directly. Do NOT make the bucket public: the URLs are per-file and
unguessable (UUID paths), and a public bucket would list nothing extra
but invites misuse.

Verify in the dashboard that the bucket exists and is private before
testing uploads — a missing bucket surfaces as a 500 ("Blog PDF upload
failed") from `/api/admin/blog/upload`.

## 3.3. Set SUPABASE_SERVICE_ROLE_KEY

Supabase dashboard → **Project Settings → API → `service_role` key**
(the `service_role` secret, NOT the publishable/anon key). Add it to:

- `.env.local` (local dev / live-DB runs): `SUPABASE_SERVICE_ROLE_KEY=<key>`
- Vercel project → Settings → Environment Variables (Production +
  Preview): same name and value. Redeploy after adding it.

Never commit the key, never paste it in chat, never put it in a
`NEXT_PUBLIC_` variable — it bypasses storage policies and must stay
server-side. Without it, PDF uploads return **503** with a plain
message ("Blog PDF uploads are not configured yet"); everything else
in the app keeps working.

## 3.4. Verify (live machine only)

1. Sign in as an admin (first-run setup, §4 above).
2. Open the admin blog page, create an article: fill in the rich-text
   editor, then upload a small PDF via the "Upload PDF" button →
   expect the upload to return **200** and the stored file link to
   open the PDF in a new tab. Save the article, then open it on the
   public `/blog/<slug>` page: the PDF button and the in-page preview
   must both show.
3. Edit the same article (change the title), save, and confirm the
   change on the public page.
4. Unpublish it from the admin list (eye icon) → it must disappear
   from `/blog`; publish it again → it returns.
5. Delete it → the article disappears and its stored PDF is removed
   from the `blog-pdfs` bucket (check Storage → `blog-pdfs` → `blogs/`
   in the dashboard; the file should be gone).
6. End-to-end write flows (other Phase 3 workers' areas — verify them
   together): create/edit/publish a course, enrol a student, mark a
   lesson complete, issue a certificate. Each step must persist after a
   page reload (no more local-only saves).

## 3.5. Known gaps (not done in Phase 3 — do not mistake them for bugs)

- **Certificate numbers are count-based.** Two simultaneous
  certificate issues can compute the same number; the second fails
  with 400. In practice this is rare (an admin issues one at a time),
  but a true fix needs a database sequence or a unique-constraint
  retry loop.
- **Password-reset email is still not configured** (Resend + Eman's
  domain pending — see §6). Tokens are created and expire unused.
- **Rate limiting is still in-memory** (`lib/rate-limit.ts`): works for
  one server instance, resets on restart. Upstash Redis is the planned
  swap; no credentials yet.
- **A post delete only removes the stored PDF when its `pdfUrl` still
  points at the `blog-pdfs` bucket.** An external PDF link (or a URL
  edited by hand) is left alone, and a storage failure is logged but
  never blocks the delete — a leftover file in that case must be
  removed by hand from Storage → `blog-pdfs`.
- **No live-DB verification was possible from the VM.** Migrations,
  seed, bucket creation, uploads and the §3.4 smoke test are all
  unverified until run on a machine with open network. The offline
  evidence is: `npx tsc --noEmit` clean, `npm test` all passing
  (including `tests/blog-pdf-delete.test.ts`, which covers the storage
  path derivation and the delete-then-cleanup flow with a mocked
  storage client).

---

# Phase 4 — Live-Database Runbook

Same rule as above: everything here needs a machine whose network can
reach Postgres (Eman's laptop, the Vultr VM, or CI). This VM cannot run
any of it (egress proxy resets Postgres-protocol connections). All
commands run from the `codebettle/` folder of the
`feature/complete-management-system-upgrade` branch, with `DATABASE_URL`
already in the gitignored `.env.local`.

## 4.1. Apply migration 4 (`20261109T2055_add_user_notification_prefs`)

Phase 4 adds one schema change: a nullable `notificationPrefs` JSON
column on `User` (in-app/email toggles + per-event toggles; NULL means
"all defaults": in-app on, email off, every event on). Migration 4 is
exactly one operation:

```sql
ALTER TABLE "public"."User" ADD COLUMN "notificationPrefs" json;
```

Apply migrations 2–4 together on a machine with DB access (after
marking migration 1 applied, §1 above):

```bash
cd codebettle
npx prisma migrate deploy
```

SQL Editor fallback (run by hand, then record the migrations applied):

```sql
ALTER TABLE "public"."Lesson" ADD COLUMN "date" timestamptz(3);
ALTER TABLE "public"."InstructorApplication" ADD COLUMN "message" text;
ALTER TABLE "public"."User" ADD COLUMN "notificationPrefs" json;
```

Verify:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'User' AND column_name = 'notificationPrefs';
-- expected: 1 row
```

Existing users get `notificationPrefs = NULL` — no data migration is
needed; the app treats NULL as defaults.

## 4.2. Backup and restore

**Backup (run on a machine with DB access, or in the Supabase
dashboard → Database → Backups):**

```bash
# Full logical backup (schema + data) — keep the file somewhere safe, never in the repo:
pg_dump "$DATABASE_URL" -F c -f codebettle-backup-$(date +%Y%m%d).dump

# Or plain SQL (readable, restorable in the SQL Editor):
pg_dump "$DATABASE_URL" -f codebettle-backup-$(date +%Y%m%d).sql
```

**Restore:**

```bash
pg_restore -d "$DATABASE_URL" codebettle-backup-YYYYMMDD.dump
# or for the plain-SQL file:
psql "$DATABASE_URL" -f codebettle-backup-YYYYMMDD.sql
```

**Data-only restore reference:** `codebettle/prisma/seed.sql` re-creates
the original 161 demo rows (27 users / 8 courses / 15 enrolments / 6
certificates, amountPaid PKR 57,489). It is NOT a backup — it only
restores the seed data, never real users or enrolments created since.
Re-running it on a database that already has those rows fails on
duplicate keys (by design); to start over, truncate the seeded tables
first (see the header comment in seed.sql).

**Storage backup:** the `blog-pdfs` bucket is not covered by `pg_dump`.
In the Supabase dashboard → Storage → `blog-pdfs`, download the
`blogs/` folder periodically, or use the Supabase CLI
(`supabase storage` commands) from a machine with the project ref.

## 4.3. Verify (live machine only)

1. Sign in as an admin (first-run setup, §4 above). Migrations 2–4
   applied and the seed run (§2) must already be done.
2. **Reports:** open `/admin/reports` — overview cards show real
   totals (revenue = SUM(amountPaid), completion rate, certificates).
   Pick a date range that excludes all enrolments → totals drop to 0
   (proves the filter works, not fabricated numbers). Open one course
   report and one student report; export each list as CSV and open the
   file — it must contain every row in range, not just the first 100.
3. **Notifications:** enrol a student (admin) → the student sees an
   "You're enrolled" notification on `/student/notifications`. Mark a
   course complete + eligible → the student gets a completion
   notification AND a certificate notification (certificate number in
   the body). Review an instructor application → every admin sees an
   application notification. Mark all read, delete one — both must
   persist after reload.
4. **Auto-issue:** with a complete + eligible enrolment, the
   certificate appears in `/admin/certificates` without anyone issuing
   it by hand. Issue two certificates at the same time (two browser
   tabs, same second) — both must succeed with different numbers
   (CB-YYYY-NNN); the old count-collision failure is fixed.
5. **CSV import:** `/admin/students/import` — paste a CSV with one
   good row and one bad row (bad email): preview shows 1 valid + 1
   invalid with the reason; Confirm imports only the good row. The
   imported student cannot sign in (unusable password, same as the
   seed) until a password is set via reset/setup.
6. **Integrity:** `GET /api/admin/integrity` (admin session) returns
   zero counts on a healthy database. The admin reports page also
   shows the integrity card.

## 4.4. Known gaps (not done in Phase 4 — do not mistake them for bugs)

- **Email notifications are still not configured.** The in-app
  notifications work; the email hook
  (`lib/services/email-notifications.ts`) is deliberately inert:
  without `RESEND_API_KEY` it logs once and returns
  `email-not-configured`; even with a key it does not send (no Resend
  SDK, no domain). Wire the real Resend send into that one file when
  the domain arrives — no other code changes. Until then, users who
  turn email notifications on in preferences get in-app only.
- **Announcement notifications are wired (closed in Phase 5).**
  `POST /api/admin/announcements` (admin only) creates the announcement
  and calls `onAnnouncementPublished` right after it (course
  announcements -> enrolled students, site-wide -> every user). The
  hook is best-effort — a notification failure never blocks the
  announcement. The admin announcements page itself still keeps state
  locally (pre-existing); wiring its create button to the new API is a
  small fetch swap, not done yet.
- **Two integrity summaries exist** (`lib/services/reporting-service.ts`
  `getDataIntegritySummary` for the reports page, and
  `lib/services/data-integrity-service.ts` `getIntegritySummary` for
  `/api/admin/integrity`). They check the same four things; check (d)
  differs slightly (reviews with no enrolment vs reviews with missing
  student/course). Harmless duplication; consolidate only if one of
  them changes.
- **Rate limiting is still in-memory** (`lib/rate-limit.ts`); Upstash
  Redis is the planned swap; no credentials yet.
- **Password-reset email is still not configured** (Resend + Eman's
  domain pending — see §6).
- **No live-DB verification was possible from the VM.** Migration 4,
  backup/restore, and the §4.3 smoke test are all unverified until run
  on a machine with open network. The offline evidence is: `npx tsc
  --noEmit` clean, `npm test` **165/165 pass** (108 in Phase 3 + 57
  new: 12 reporting, 13 notifications, 27 automation/data, 5 Phase 4
  integration), `npm run build` exit 0, `npx prisma migration check`
  passes (4 migrations, 5 contracts).

---

## 5. Phase 5 — PDF quiz workflow (10 Nov 2026)

### 5.1. What Phase 5 adds

- **Quiz models** (migration 5, `20261109T2113_add_quiz_models`, 28 ops):
  `Quiz`, `QuizQuestion`, `QuizOption`, `QuizAttempt`, `QuizAnswer`.
  No quiz seed data — quizzes are teacher-created content, never invented.
- **Sample template:** `GET /api/quizzes/sample` downloads a generated
  PDF (`codebettle-sample-quiz.pdf`, 11 questions: MCQ x3, fill-blank x2,
  checkbox x2, Choose Two x2, Choose Three x2) that shows the exact
  format the parser expects. It is generated in code
  (`lib/services/quiz-sample-pdf.ts`), so the format and the parser
  always agree.
- **Teacher flow:** create a draft quiz for your own course
  (`/instructor/quizzes`), upload an externally-AI-generated PDF
  (any AI tool — the app never calls an AI provider), review and edit
  every parsed question, then publish. Publish is blocked until every
  question is reviewed and has a valid answer key.
- **Student flow:** `/student/quizzes` lists published quizzes for
  enrolled courses; attempt UI has a server-enforced timer, question
  navigation, and exact-selection enforcement (Choose Two needs exactly
  two). Auto-submit on timeout. Grading is automatic (exact and partial
  policies); results follow the quiz's show/hide settings.
- **Answer-key security:** students only ever receive the public quiz
  shape (no `isCorrect`, `correctText`, `acceptedAnswers`). Verified by
  route tests that fetch the start-attempt and resume payloads as a
  student and assert the key is absent.
- **Announcements API (Phase 4 gap, closed):** `POST /api/admin/announcements`
  + hook wired (see §4.4).

### 5.2. Apply migration 5

On a machine with DB access (same place as §1–§4):

```bash
cd codebettle
npx prisma migrate deploy
```

Then verify the five tables exist:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('Quiz', 'QuizQuestion', 'QuizOption', 'QuizAttempt', 'QuizAnswer');
-- expected: 5 rows
```

Record migration 5 applied the same way as migrations 2–4 (§1).
Migration 5 is a TypeScript Prisma migration (no plain-SQL file to paste
into the SQL Editor); if `migrate deploy` cannot run, generate the SQL
with `npx prisma migrate diff --from-migrations --to-migrations` on a
machine with the repo and apply that output by hand.

### 5.3. Create the `quiz-pdfs` bucket (private)

Same as §3.2, but bucket name **`quiz-pdfs`**, Private. Uploaded quiz
PDFs live at `quizzes/<uuid>.pdf`. The `SUPABASE_SERVICE_ROLE_KEY`
from §3.3 is shared with `blog-pdfs` — no new key. A missing bucket
surfaces as 503 ("Quiz PDF uploads are not configured yet") from the
upload route when the key is missing, or 500 ("Quiz PDF import failed")
when the bucket is missing.

### 5.4. Live verification (do this once, on the live site)

1. Log in as an instructor, open **Quizzes**, download the sample PDF,
   create a draft quiz, upload the sample PDF. Expect: 11 questions,
   0 warnings, all marked reviewed.
2. Publish it. Then log in as an enrolled student, open **Quizzes**,
   start the quiz, answer all 11 questions (the key is in the sample
   PDF's Answer Key section), submit. Expect: score 11/11 (or the
   sample's total points), result shown.
3. Open the instructor **Analytics** for the quiz. Expect: 1 submitted
   attempt, per-question accuracy 100% for answered questions.
4. As a student, open the browser devtools Network tab while starting
   a quiz and confirm the attempt response contains no `isCorrect`,
   `correctText`, or `acceptedAnswers` fields.
5. Upload a scanned/image PDF (no text) to a draft quiz. Expect: a
   clear "no readable text" message and 0 questions — the teacher adds
   questions manually.

### 5.5. Known gaps and honest limitations (Phase 5)

- **No live-DB / live-Storage verification was possible from the VM.**
  Migration 5, the `quiz-pdfs` bucket, PDF upload to real Storage, and
  the §5.4 live flow are all unverified until run on a machine with
  open network. The offline evidence is: `npx tsc --noEmit` clean,
  `npm test` **208/208 pass** (165 in Phase 4 + 43 new: 14 parser,
  7 grading, 16 service, 6 API), `npm run build` exit 0,
  `npx prisma migration check` passes (5 migrations). PDF parsing of a
  *real teacher file* is also unverified — only the generated sample
  PDF round-trips in tests; a teacher PDF in a different layout will
  produce parse warnings (by design) and needs manual review.
- **No OCR.** Scanned/image PDFs have no extractable text, so the
  parser reports them as scanned and imports nothing. The teacher adds
  questions manually in the review editor. Do not claim OCR exists.
- **The admin announcements page still keeps state locally** (see §4.4)
  — the new API exists, the page is not wired to it yet.
- **Attempt answers are only saved at submit time.** A student who
  closes the browser mid-attempt keeps the in-progress attempt and can
  resume it, but answers typed before closing are not persisted until
  submit. (Per-question autosave is a Phase 7 hardening item if wanted.)
- **The instructor portal layout is instructor-only.** Admins can use
  the quiz API routes (role check allows admin), but the
  `/instructor/quizzes` pages redirect non-instructors to login — same
  as every other instructor page.

---

## 6. Phase 6 — Selective neon + subtle 3D (10 Nov 2026)

### 6.1. What Phase 6 adds (no behaviour, data, API, route, or schema change)

- **Neon, exactly five buttons** — a thin gold arc travelling around
  the border (conic-gradient ring, 3.5s loop) plus a soft gold glow,
  via the opt-in `neon` prop on the shared `Button` component
  (`components/ui/Button.tsx`, `.neon-btn` in `app/globals.css`):
  1. Homepage hero — "Explore Courses"
  2. Course page — "Enroll Now" / "Enroll for Free"
  3. Student quiz start — "Start quiz"
  4. Instructor quiz review — "Publish quiz"
  5. Quiz attempt — "Submit quiz"
  Every other button is unchanged. A test
  (`tests/phase6-design.test.ts`) fails if a sixth neon button is
  added — adding neon is a deliberate design decision, not a drive-by.
  Disabled neon buttons show a dim static arc, no motion; keyboard
  focus gets a visible gold outline.
- **Subtle 3D** — elevation tokens (`--shadow-elev-1/2/3`) in
  `app/globals.css`; hoverable `Card`s and `CourseCard`s lift 2px with
  a layered shadow on hover and settle back on press; modals use the
  deep `elev-3` shadow. Dark + gold identity is untouched.
- **Reduced motion** — `@media (prefers-reduced-motion: reduce)` in
  `globals.css` collapses all animations/transitions and turns off
  smooth scrolling (the neon arc stays as a static gold arc);
  framer-motion is wrapped in `<MotionConfig reducedMotion="user">`
  in `app/layout.tsx` so entrance/floating animations also stop when
  the user prefers it.

### 6.2. Live verification (do this once, on the live site)

1. Open the homepage — the "Explore Courses" button shows the gold
   arc travelling around its border. The neighbouring "How It Works"
   button has no arc.
2. Open a course page — "Enroll Now" has the arc. Hover any course
   card on `/courses` — it lifts slightly with a soft shadow.
3. As a student, open a quiz start page — "Start quiz" has the arc;
   submit an attempt — "Submit quiz" has the arc.
4. As an instructor, open a draft quiz review — "Publish quiz" has
   the arc (only while publish is enabled; a disabled Publish shows
   a dim static arc).
5. Turn on reduced motion in the OS/browser and reload — all arcs
   are static, floating hero icons stop moving, and no hover lift
   animates.

### 6.3. Known gaps and honest limitations (Phase 6)

- **No pixel screenshots were possible from the VM.** The system
  Chromium refuses CLI startup (Hatch WebGL domain policy), the
  Playwright browser download is blocked by the same egress proxy
  that blocks Postgres, and the homepage returns 500 here without a
  database — so the hero CTA could not be rendered on this machine
  at all. What WAS verified here: the production-built CSS contains
  every Phase 6 rule intact (keyframes, conic ring, mask, reduced-
  motion block — extracted and inspected from `.next/static/chunks`);
  the components render the exact classes (`renderToStaticMarkup`:
  7/7 checks — neon present only when the prop is set, disabled
  state kept, `card-lift` on hover Cards, `elev-3` on modals); the
  production server renders the login page 200 with the new CSS;
  `npx tsc --noEmit` clean, `npm test` **219/219 pass** (208 in
  Phase 5 + 11 new), `npm run build` exit 0. The travelling motion
  itself and the final look on a real screen are unverified until
  someone opens the live site — do the §6.2 checks there, and treat
  a user screenshot as the result if it disagrees with this report.
- **The typewriter in the hero still types under reduced motion.**
  It changes text content on a timer (pre-existing behaviour), not
  a CSS/framer animation, so the reduced-motion rules do not touch
  it. Freezing it is a small follow-up if wanted — it was left
  alone deliberately to avoid a behaviour change in a polish pass.
- **No schema, migration, or seed change in Phase 6.** Migrations
  2–5 and the seed are still the user's steps from §§1–5 above.
