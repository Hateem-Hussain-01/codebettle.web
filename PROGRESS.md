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
- [ ] Read: register form client, ambassador dashboard page/client, admin ambassadors page/client + API routes, lib/admin-access.ts, admin coupons page, migrations + SQL file pattern, existing tests.
- [ ] Implement (increments, commit + push often).
- [ ] Tests (targeted then full suite in chunks) + tsc + build; CI as authoritative gate.
- [ ] Evidence screenshots (code-entry field, admin referral-codes section, dashboard 100-credit award, payment Rs 200 discount).
- [ ] Open PR, report to Huffy (do NOT merge).
