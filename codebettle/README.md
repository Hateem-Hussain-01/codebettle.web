# CodeBettle — Complete Management System

CodeBettle is a digital institute's learning platform: public course
catalogue and blog, student enrolments, instructor course/quiz
management, and an admin portal — built on Next.js 16 with a
PostgreSQL database (Supabase) and Prisma.

Live site: https://codebettle-web.vercel.app/

> **Status:** Phases 1–7 of the Complete Management System master
> prompt are implemented on the branch
> `feature/complete-management-system-upgrade` (see `RUNBOOK.md` for
> the phase log, known gaps and the live-database steps that are
> still the owner's job). Nothing is deployed from this branch until
> the owner approves — see `DEPLOYMENT.md`.

## Stack

- **Framework:** Next.js 16 (App Router, Turbopack), React 19,
  TypeScript, Tailwind CSS 4, framer-motion
- **Database:** PostgreSQL on Supabase, accessed through Prisma
  (Prisma 8 RC — see the note in `RUNBOOK.md` §6.3)
- **Auth:** custom — bcrypt password hashes + opaque server-side
  session tokens in a Postgres `Session` table. No Supabase Auth,
  no third-party auth provider.
- **File storage:** Supabase Storage buckets (`blog-pdfs`,
  `quiz-pdfs`)
- **Email:** not wired yet — password-reset and notification emails
  are inert until Resend is configured (see `RUNBOOK.md` §3.4)

## Quick start (local development)

```bash
cd codebettle
npm install
cp .env.example .env.local   # fill in real values — never commit .env.local
npm run dev                  # http://localhost:3000
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in the real values.
Only the variables listed there are read by the app:

| Variable | Required | What it is |
| --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string (Supabase pooled connection) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (used for Storage uploads) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes, for PDF uploads | Supabase service-role key — **server-only**, never expose it in the browser |
| `RESEND_API_KEY` | No (email not wired) | Resend API key; password-reset and notification emails stay inert until this is set |

Do **not** invent or add `SESSION_SECRET`, `DIRECT_URL`,
Upstash/Sentry/R2 variables — nothing in the code reads them.

## Database: migrations + seed

The schema is defined in `src/prisma/contract.prisma` and applied
with Prisma migrations in `migrations/app/` (5 migrations:
`20261109T1830_init`, `20261109T1926_add_lesson_date`,
`20261109T2032_add_application_message`,
`20261109T2055_add_user_notification_prefs`,
`20261109T2113_add_quiz_models`).

On a machine that can reach Postgres (this repository's CI/VM
cannot — see `RUNBOOK.md` §1), from the `codebettle/` folder:

```bash
# 1. Mark the already-applied init migration, then apply the rest.
npx prisma migrate resolve --applied 20261109T1830_init
npx prisma migrate deploy

# 2. Seed data (161 rows, one transaction) — Supabase SQL Editor, or:
psql "$DATABASE_URL" -f prisma/seed.sql

# 3. Read-only connection check:
DOTENV_CONFIG_PATH=.env.local npx prisma db verify
```

Seeded accounts share one bcrypt hash of a random unknown value —
**no seeded account can be signed into** (deliberate: the old demo
passwords were public in the repository). Real admins set their own
passwords through first-run setup — see `INITIAL_CREDENTIALS.txt`
and `RUNBOOK.md` §3.

## Tests

```bash
npm test            # tsx --test tests/*.test.ts (275 tests, offline fakes — no database needed)
npx tsc --noEmit    # type check
npm run build       # production build (Next.js, Turbopack)
```

Tests use an in-memory fake database (`tests/fake-db.ts`) and never
touch a real Postgres instance.

## Project layout

```
app/                 Next.js App Router pages + API routes
  (public pages: /, /courses, /blog, /about, /contact, /instructors)
  (portals: /admin, /instructor, /student — role-gated)
  api/               API routes (admin / instructor / student / public)
components/          UI components (layout, forms, quiz, portal)
lib/
  db/                Prisma repositories (one file per aggregate)
  services/          business logic (enrolment, reviews, quizzes, notifications)
  auth.ts            session handling (server-side opaque tokens)
  rbac.ts            role capabilities + ownership helpers
  sanitize.ts        blog HTML sanitization
  security.ts        CSP builder + nonce
  rate-limit.ts      in-memory rate limiting
prisma/
  seed.sql           161-row seed (one transaction)
src/prisma/
  contract.prisma    the data contract (21 models)
migrations/app/      the 5 Prisma migrations
tests/               275 tests (fake-db based)
```

## Key behaviours (what was built in Phases 1–7)

- **Security:** bcrypt passwords (cost 12), opaque server-side
  sessions, role-based access enforced server-side on every write
  API, rate limiting on auth routes (5 failures / 15 min), nonce
  Content-Security-Policy on every page, blog HTML sanitized on
  save and render, Zoom links stripped from public course payloads.
- **Students:** self-enrolment (free = instant, paid = pending
  until an admin confirms payment), timed quiz attempts with
  server-side grading, certificates with public verification at
  `/verify/<token>`, in-app notifications.
- **Instructors:** course/module/lesson management, quiz creation
  from an uploaded PDF with mandatory review-before-publish,
  announcements to their own courses only.
- **Admins:** students/teachers/courses/enrolments/certificates/
  applications/blogs management, reporting + CSV export, CSV user
  import, contact-message inbox, first-run admin setup.
- **SEO:** sitemap (`/sitemap.xml`, dynamic), robots
  (`/robots.txt`), per-course and per-post metadata.

## Docs

- `RUNBOOK.md` — live-database + Storage steps, first-run setup,
  known gaps and honest limitations, phase log
- `DEPLOYMENT.md` — Vercel settings, env vars, the push/merge
  sequence, post-deploy smoke tests (deployment needs the owner's
  approval first)
- `INITIAL_CREDENTIALS.txt` — first-run admin setup and the
  seed-account policy (contains no passwords)
- `Complete_Management_System_Master_Prompt.pdf` (in the workspace,
  not in this repo) — the brief this work implements

## House rule

This is **not** the Next.js you know — this version has breaking
changes. Before writing any code, read the relevant guide in
`node_modules/next/dist/docs/`. See `AGENTS.md`.
