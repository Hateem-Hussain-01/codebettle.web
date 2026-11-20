# Ambassador referral + credits redesign — PROGRESS

- Branch: `feature/ambassador-credits-coupon`, base main @ `52c4208` (PRs #82, #83, #84 merged; rebased 20 Nov ~20:58 PKT from 926914b — clean, no conflicts).
- Predecessor lost in daemon restart; NO prior work found (clean tree, no commits, no evidence). Fresh start 20 Nov ~20:37 PKT.
- Evidence dir: `~/workspace/your_files/ambassador-credits-evidence/`

## Design decisions (resolved, to report in final handoff)
- (a) Code entry: ONE optional "Referral code" field on the REGISTER form (server-validated, resolves ambassador code first, then team code — codes are unique across both namespaces already). The `?ref=` proxy capture + `cb_ref` cookie + `/api/referral/track` + click counting are removed ENTIRELY — including for team codes, which keep working through the same register field (otherwise removing the proxy capture would silently break team referral attribution from PR #66). Client-sent code is safe: it is only a lookup key, validated server-side (exists / active / not self-referral / one attribution per user) — same trust model as the already client-sent coupon code at enrollment.
- Credits: 100 per referred STUDENT (Eman's number, const `AMBASSADOR_CREDITS_PER_REFERRAL = 100`), awarded on the referred student's FIRST enrollment (idempotent via (kind, referenceId=userId) — one award per student ever, not per enrollment). Rationale: mirrors team-credit earn-on-enrollment (abuse-resistant; signup-only awards are farmable). If Eman wants signup-time award instead, it is a one-line trigger change — flag in report.
- Discount: ambassador code IS a Coupon row (type fixed, value 200, auto-created/ensured when admin assigns a code) — reuses existing P-3 server-side machinery (`validateCouponForCourse`, `expectedDiscountedPrice`). At enrollment creation, if the student has an ambassador attribution and no other coupon was entered, `couponUsed` is auto-set to the ambassador's code server-side.
- Dashboard: 4 stages → 3 (signups, enrollments, payments); `clicks` removed from ReferralStats + UI.
- Admin: new 33rd area "Referral Codes" (`/admin/referral-codes`): code, owner, uses, credits awarded, discounts given; create/assign/deactivate.
- Migration: new `AmbassadorCreditLedger` table; DROP `ReferralClick` (dead after click-counting removal).

## Status
- [x] Read: proxy.ts, lib/referral.ts, lib/db/ambassadors.ts, lib/db/coupons.ts, lib/db/team-credits.ts, lib/services/payment-service.ts, enrollment-service coupon parts, auth referral flow.
- [x] Read (4th coordinator, 20 Nov ~21:00 PKT): lib/services/auth-service.ts, app/api/auth/route.ts, components/auth/RegisterForm.tsx, lib/admin-access.ts, app/admin/ambassadors/page.tsx + ambassadors-client.tsx, app/api/admin/ambassadors/grant + [id] routes, app/student/ambassador/page.tsx + ambassador-dashboard-client.tsx, lib/services/enrollment-service.ts, lib/db/types.ts (Coupon/Ambassador/ReferralStats), lib/db/mappers.ts, src/prisma/contract.prisma (Coupon/Ambassador/ReferralClick/TeamCreditLedger), migrations/app/20261115T2118 + 20261116T2324 pattern, SQL twins (team-credits + ambassador-referral), tests/ambassador-referral.test.ts (head), tests/fake-db.ts tables, scope guards (website-intro, dashboard-v32, dashboard-followup, theme-light-audit, security-group-b).
- [x] Rebased onto main 52c4208 (PR #84 sidebar merged) — clean; pushed (remote tree == local tree 82daf4b1…).
- [ ] Implement (increments, commit + push often).
- [ ] Tests (targeted then full suite in chunks) + tsc + build; CI as authoritative gate.
- [ ] Evidence screenshots (code-entry field, admin referral-codes section, dashboard 100-credit award, payment Rs 200 discount).
- [ ] Open PR, report to Huffy (do NOT merge).

## Implementation plan (4th coordinator)
- Guards: V32 guard arms (ambassador-dashboard-client.tsx is a V32 source file) AND follow-up guard arms (lib/admin-access.ts is a follow-up source file). Both require EVERY changed file in their allowlist → add the feature file list to BOTH guards with a comment naming the feature (repo pattern, PRs #79/#81/#84). Intro guard does NOT arm (no intro files touched). Theme audit scans all files — new UI must use theme tokens only, no hex/bare colours.
- `usedCount` is NEVER incremented anywhere (only read + displayed) → "discounts given" in the admin section = count of enrollments whose couponUsed equals the ambassador's code (new repo helper).
- Admin coupons client is local-state-only (create/toggle/delete never persist) — pre-existing gap, NOT in scope. Ambassador coupon is created server-side in the repo (new `createCoupon` in lib/db/coupons.ts).
- Approve/grant UX: admin supplies the code at approve time (PATCH [id] gains optional `referralCode`) and at grant time (grant form + route gain `referralCode`, required). Backfill of legacy approved rows keeps random generation (no admin present to choose) — documented exception.
- Migration: edit src/prisma/contract.prisma (add AmbassadorCreditLedger, DROP ReferralClick) → `npm run contract:emit` → generate migration via prisma CLI (migration create) → hand-written SQL twin in ~/workspace/your_files/codebettle-ambassador-credits-migration.sql. Start snapshot = 4e2766c530b45f219045ef0168d29c2a04d2500c26ecdd9ff05c1d596b4af9cc (end of 20261116T2324).
- npm ci running (pid 13209, started 20 Nov ~21:02 PKT) — node_modules was a broken partial install (.bin missing); tsc/tests/build/contract:emit wait on it.
