# Phase 2 — Page Conversion Guide

How to convert the remaining pages from the in-memory `lib/data/` arrays to
the Prisma-backed repositories in `lib/db/`. Worked examples are already
done — read them first:

- Server page: `app/blog/page.tsx` (import swap + `await`)
- Client split: `app/courses/page.tsx` (server wrapper) +
  `app/courses/courses-client.tsx` (the old client code, data as props)
- Server components: `components/sections/BlogPreview.tsx`,
  `components/sections/FeaturedCourses.tsx`
- Client component with props: `components/sections/TestimonialsSection.tsx`
  (fetched in `app/page.tsx`, passed as `testimonials`)

## Repository map (same function names, now async)

| Old (`@/lib/data/...`) | New (`@/lib/db/...`) |
|---|---|
| `users`, `getUserByEmail`, `getUserById`, `getStudents`, `getInstructors` | `lib/db/users` — same names, async. `getUserById` returns SafeUser (no hash) WITH enrolledCourses. `getUserByEmail` returns the hash (auth only, never from a page). `listUsers` is paginated. |
| `courses`, `getCourseBySlug`, `getCourseById`, `getPublishedCourses`, `getFeaturedCourses`, `getCoursesByInstructor` | `lib/db/courses` — same names, async. `getAllCourses`, `listCourses` (paginated, searchable) also exist. |
| `enrollments`, `getEnrollmentsByStudent`, `getEnrollmentsByCourse`, `isEnrolled`, `getCompletedEnrollments` | `lib/db/enrollments` — same names, async. `listEnrollments` (paginated) and `createEnrollment` / `markLessonComplete` also exist. |
| `certificates`, `getCertificatesByStudent`, `getCertificateByCourseAndStudent` | `lib/db/certificates` — same names, async. `issueCertificate` also exists. |
| `coupons`, `validateCoupon` | `lib/db/coupons` — `validateCoupon` is server-only. Pages must NOT import it: call `POST /api/coupons/validate` with `{ code }` instead (returns `{ valid, coupon }`). `listCoupons` exists for admin lists. |
| `announcements`, `getSiteWideAnnouncements`, `getCourseAnnouncements` | `lib/db/announcements` — same names, async. `listAnnouncements` also exists. |
| `reviews`, `getReviewsByCourse`, `getReviewsByStudent` | `lib/db/reviews` — same names, async. `listReviews` also exists. |
| `blogPosts`, `getPublishedPosts`, `getPostBySlug` | `lib/db/blog` — same names, async. `listBlogPosts` also exists. |
| `testimonials` | `lib/db/testimonials` — `listTestimonials()` (async). |

Types come from `@/lib/db/types` (same shapes as the old `lib/data` types:
`User`, `SafeUser`, `Course`, `Module`, `Lesson`, `Enrollment`,
`Certificate`, `Coupon`, `Announcement`, `Review`, `Testimonial`,
`BlogPost`, `CourseCategory`, `CourseLevel`, `CourseStatus`).

## Server pages (no `'use client'`)

1. Change the import path `@/lib/data/X` → `@/lib/db/X`.
2. Add `await` to every repository call. Make the component `async` if it
   is not already.
3. If the page does NOT already call `getSession()` (or `cookies()`),
   add `await connection()` from `next/server` at the top of the
   component — otherwise the build tries to prerender the page and hits
   the database at build time. (Next 16.2.7: prefer `await connection()`
   over `export const dynamic = 'force-dynamic'`.)
4. Raw array imports (`enrollments`, `reviews`, `courses`, `users`) do not
   exist any more — replace them with the matching repository call
   (e.g. `getEnrollmentsByCourse(courseId)` per course, `listEnrollments()`
   for an admin list, `listReviews()` for all reviews).
5. Per-item lookups (`getUserById` per course/enrolment) become a map
   built in the page: collect the distinct ids, await each lookup once,
   pass the map down. Do not call a repository function inside JSX.

## Client pages (`'use client'`)

1. Split the file: `page.tsx` becomes a thin async SERVER wrapper that
   fetches everything the page needs and renders the client component
   with the data as props. The old client code moves to a new file
   `<name>-client.tsx` in the same folder (same name pattern as
   `app/courses/courses-client.tsx`).
2. The wrapper needs the current user for student/instructor pages:
   call `getSession()` there (it reads cookies) and pass the user id
   down, or fetch with the id directly (e.g.
   `getCertificatesByStudent(session.id)`).
3. Per-item lookups become maps built in the wrapper, passed as props
   (see `app/courses/page.tsx`: `instructorNames: Record<string, string>`).
4. Admin pages that keep local state seeded from an array
   (`useState(initialPosts)`, `useState(allCourses)`, …) keep that exact
   behaviour — seed the state from the PROPS instead. Local add/edit/
   delete mutations stay local-only (they were fake saves before, and
   still are — Phase 3 builds the real write APIs). Do NOT invent a
   write API or a fetch call for them.
5. `validateCoupon` must NOT be imported in client code any more — call
   `POST /api/coupons/validate` with `fetch` (see `app/courses/[slug]`).
6. The client component keeps its existing UI, state and behaviour
   exactly — only the data source changes (props instead of imports).

## Rules

- NO behaviour change, NO new features, NO new UI controls.
- After converting, NO file may import from `@/lib/data` (or any
  relative `lib/data` path). The only exception is `lib/data/` itself,
  which is deleted centrally at the end of Phase 2.
- Never import `getUserByEmail` from a page (it returns the hash).
  Never return a password hash to the client.
- Do NOT run `next build` (central verification only — concurrent
  builds conflict). DO run `npx tsc --noEmit` inside `codebettle/`
  after your batch and fix every error in YOUR files.
- Do NOT commit anything. Report the files you changed and any place
  where the conversion could not preserve the old behaviour exactly.
- Do NOT touch files outside your assigned batch.
- Do NOT push, merge, or deploy. Do NOT touch `main`.
