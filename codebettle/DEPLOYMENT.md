# CodeBettle — Deployment Checklist

Deployment needs the owner's explicit approval. Nothing in this
file deploys anything by itself — it is the checklist for the day
the owner says go.

## Current state (10 Nov 2026)

- **Branch:** `feature/complete-management-system-upgrade`
  (Phase 7 complete: 275/275 tests pass, tsc clean, build exit 0).
  **Nothing is pushed.** Confirm the tip with
  `git log --oneline -1` before deploying — the hash in this file
  is intentionally not pinned, because the docs commit itself
  moves the tip.
- **Main:** local `d3b7070` (rewritten history, leak purged).
  Remote `origin/main` is still the old `7a255fe` — the old
  history (with the rotated, dead password) is still visible on
  GitHub until the push below succeeds.
- **Vercel project:** `codebettle-web`
  (`prj_qnRsceT9fINDdACHuoy0gWWl0jNf`), live at
  https://codebettle-web.vercel.app/. A push to `main` triggers an
  automatic Vercel build (~1–2 min).

## 0. Preconditions (owner only)

1. **Grant the GitHub App write access.** The app is named
   `meta-muse-ai` (not "Muse" — searching for "Muse" finds
   nothing). Install link:
   https://github.com/apps/meta-muse-ai/installations/new
   — choose "Only select repositories", add `codebettle.web`, save.
   Without this, no push from this machine works (GitHub App 403).
2. **Live database is ready** (RUNBOOK.md §1–§2): all 21 tables
   exist, migrations 2–5 applied (`npx prisma migrate deploy`),
   seed run (161 rows), verification SQL passed
   (counts + `SUM(amountPaid) = 57489`).
3. **Storage buckets created** in Supabase: `blog-pdfs` and
   `quiz-pdfs` (private; the app uploads with the service-role key
   server-side).
4. **Environment variables set in Vercel** (Project Settings →
   Environment Variables, Production). See the table below.

## 1. Vercel project settings

| Setting | Value |
| --- | --- |
| Framework preset | Next.js |
| Root directory | `codebettle/` |
| Build command | `npm run build` (default) |
| Install command | `npm install` (default) |
| Node version | 24 (the build was verified locally with Node 24) |
| Production branch | `main` |

## 2. Required environment variables (Vercel, Production)

| Variable | Value source |
| --- | --- |
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string (URI, pooled) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role key (**server-only secret** — never put it in a public variable or in code) |
| `RESEND_API_KEY` | Optional — email is NOT wired yet; password-reset and notification emails stay inert without it. Add it only when Resend + the sending domain are set up. |

Do **not** add `SESSION_SECRET`, `DIRECT_URL`, Upstash, Sentry or
R2 variables — nothing in the code reads them.

## 3. Push / merge sequence

Run from `~/workspace/codebettle-web`, branch
`feature/complete-management-system-upgrade`:

```bash
git status        # must be clean, on the feature branch
git log --oneline -3   # note the tip; it must match the Phase 7 completion report
```

1. **Push the rewritten main — the ONE approved force-push.**
   Approved by the owner 9 Nov 2026 23:17 PKT for the history
   purge; still unconsumed. This is the only force-push that is
   approved — never force-push again after this.
   ```bash
   git push origin main --force-with-lease
   ```
   Verify on GitHub that `main` is now `d3b7070` and the old commit
   `7a255fe` no longer appears in the history.
2. **Push the feature branch.**
   ```bash
   git push origin feature/complete-management-system-upgrade
   ```
3. **Merge to main.** Open a pull request from the feature branch
   to `main` on GitHub and merge it (owner's call — squash or
   merge commit; do not rebase onto main first, the branch is
   already based on the rewritten main). Vercel auto-deploys `main`
   on merge.
4. **Verify the deployment** (below) before announcing it.

> Do not delete the local backup bundle
> `~/workspace/codebettle-web-backup/codebettle-web-pre-purge.bundle`
> until both pushes are verified on GitHub.

## 4. First-run setup (after the first deploy)

1. Open `https://codebettle-web.vercel.app/auth/setup`.
2. Muhammad Hateem Hussain (COO, `mhateemjutt1412@gmail.com`)
   claims his admin account and sets his password (min 8 chars).
3. Ahmad Hassan (CEO, `ahmad.hassan.hnd@gmail.com`) does the same.
4. Once both accounts exist, setup closes and `/auth/setup`
   redirects to sign-in. Full detail: `INITIAL_CREDENTIALS.txt`.

## 5. Post-deploy smoke tests

Run these against the live URL, in order. Any failure blocks
announcing the deploy.

1. `GET /` — 200, homepage renders (hero, featured courses).
2. `GET /courses` — 200, published courses listed; a course
   detail page renders with its title.
3. `GET /sitemap.xml` — 200, valid XML, lists public pages +
   published courses/posts.
4. `GET /robots.txt` — 200, disallows `/admin/`, `/student/`,
   `/instructor/`, `/auth/`, `/api/`, `/verify/`.
5. `GET /auth/login` — 200, no demo-login buttons, no demo
   credentials anywhere on the page.
6. Response headers on any page include `content-security-policy`
   with a `nonce-…` value, and the HTML contains the same nonce.
7. Sign in as an admin → `/admin` dashboard loads; admin
   Students page lists seeded students.
8. Register a new student account → sign in → enrol in a free
   course from its detail page → "Continue Learning" appears;
   the course page shows lessons.
9. `GET /verify` — enter a seeded certificate token → the
   verified card shows student name, course title, certificate
   number, issued date (and nothing else).
10. Admin blog: create a post with bold text and a link → the
    public post renders the formatting, and a `<script>` typed
    into the editor does **not** execute (stored-XSS check).
11. `GET /api/courses` — 200; no `zoomLink` anywhere in the
    response body.

## 6. What is still NOT ready (do not promise it)

- **Email:** password-reset and notification emails are inert
  until Resend + a sending domain are configured. The reset flow
  works end-to-end only after that.
- **Rate limiting** is in-memory (single process, lost on
  restart, not shared across Vercel instances) until Upstash
  Redis is configured.
- **Prisma 8 RC** (`8.0.0-rc.33`) — a release candidate, not a
  stable release. See RUNBOOK.md §6.3.
- **No pixel screenshots** of the Phase 6 neon/3D polish were
  possible from the build VM — check the live site visually
  (RUNBOOK.md §6.2).
- The admin content manager, instructor resources page and
  wishlist are still local-only/hardcoded (documented gaps in
  RUNBOOK.md §6.3) — they are not part of this deploy's scope.
