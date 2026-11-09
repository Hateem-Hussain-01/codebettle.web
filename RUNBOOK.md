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
