# Stat cards same size — PROGRESS

- Branch: `feature/stat-cards-equal-height`, base main @ `52c4208` (PRs #82, #83, #84 merged).
- Brief (Eman, 20 Nov ~21:03 PKT): "ye cards ka size same kro" — admin Communications page 6 stat cards have unequal heights, bottoms don't line up.
- Evidence dir: `~/workspace/your_files/stat-cards-evidence/`

## Diagnosis (confirmed by reading source)
- Stat row is `components/admin/CommunicationsStats.tsx`: 6 `StatCard`s in `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4`.
- Root cause (two parts, both in shared `components/ui/StatCard.tsx`):
  1. The grid item is the `motion.div` wrapper; it stretches to the row height, but the inner `Card` has no `h-full`, so each card sizes to its own content height.
  2. Content height varies per card: "Teacher-authored" title wraps to 2 lines at 6-col width; "Targeted sent" has a subtitle line ("1 read (2%)"); "Open requests" has a subtitle only when the queue isn't loaded. So taller cards stick out below the rest.
- Fix (shared level, StatCard only — no Communications page change needed):
  - `motion.div` + `Card` get `h-full` → outer boxes equal via grid stretch.
  - Title gets `min-h-10` (2 text-sm lines) → numbers start at the same y in every card.
  - Subtitle slot always rendered (empty `&nbsp;` when absent) with `min-h-4` → subtext line reserved on all cards.
  - No label text changes, no number/data changes, no new/removed cards. PR #84's StatCard href + Card glass-card untouched.

## Status
- [x] Worktree created at 52c4208, branch feature/stat-cards-equal-height.
- [x] Diagnosis done (CommunicationsStats, StatCard, Card read).
- [x] Check existing tests pinning StatCard/V32 + other StatCard call sites (V32 guard allowlists StatCard.tsx; follow-up guard too — diff stays to StatCard + its test).
- [x] Implement fix in StatCard.tsx (h-full wrapper + Card, min-h-10 title, always-rendered subtitle slot).
- [x] Tests: new equal-height assertions in tests/dashboard-v32.test.ts; targeted run 15/15 pass incl. scope guard.
- [x] Checkpoint pushed: local 6af631c == remote tree 5d27d588… (verified).
- [ ] Visual evidence: temp repro page, 6 cards dark + light, measure heights; check one other dashboard stat row.
- [ ] Full suite in chunks + tsc + build; CI as authoritative gate.
- [ ] Push (commit + push often), open PR, report to Huffy (do NOT merge).

## Resume — Huffy (20 Nov ~21:30 PKT, direct finish)
- 2nd coordinator died in daemon restart ~21:28 PKT. Huffy is finishing the task directly (no more spawns — the restart storm kills subagents within ~10 min; the main agent survives).
- Visual evidence DONE (probe ~/workspace/stat-cards-probe.cjs, dev server port 3105, headless Chromium): Communications 6 cards ALL 150px, same top/bottom, dark AND light; student row 3 cards ALL 177px, same top/bottom, dark AND light. Screenshots in ~/workspace/your_files/stat-cards-evidence/ (dark.png, light.png). Values correct (8/4/4/2/42 + "1 read (2%)" / 0; student 6/2/1). First probe run caught dark at opacity 0 + light mid-count-up (cold Turbopack compile) — re-ran with a settle wait (value == 8 && opacity == 1) and both shots are settled.
- [slug] route restored byte-identical from origin/main (sha256 14ad4c38… verified); temp repro page removed; dev server stopped.
- [ ] Rebase onto main 590c756 (PR #85 intro merged ~21:20 PKT; intro files only, no overlap).
- [ ] Full suite in chunks + tsc; CI as authoritative gate.
- [ ] Push, open PR, verify + merge (Huffy).
