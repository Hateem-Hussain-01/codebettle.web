/**
 * Team card social links (Eman, 16 Nov 2026).
 *
 * Only TWO social icons show on the About page team card, at the
 * BOTTOM-RIGHT, in the order Eman picks per member in admin ("Show on
 * card"). Nothing picked = the first 2 filled links in GitHub,
 * LinkedIn, X, Website order. Fewer than 2 filled links = show what
 * exists (1 or 0) — with 0 the icons row is not rendered at all.
 *
 * These tests cover the pure selection logic, the API validation, the
 * mapper, the repository round-trip on the fake DB, the card/admin
 * wiring (by source inspection, following the Phase 6 design-test
 * pattern), and the migration + SQL twin.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAX_VISIBLE_SOCIALS,
  normalizeVisibleSocials,
  parseVisibleSocials,
  resolveTeamSocials,
  serializeVisibleSocials,
  validateTeamMember,
} from '../lib/management';
import { mapTeamMemberRow } from '../lib/db/mappers';
import { isMissingColumnError } from '../lib/db/certificates';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb } from './fake-db';
import { createTeamMember, listTeamMembers, updateTeamMember } from '../lib/db/team-members';
import type { TeamMemberRow } from '../lib/db/types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

const ALL_LINKS = {
  xUrl: 'https://x.com/ahmad',
  linkedinUrl: 'https://linkedin.com/in/ahmad',
  githubUrl: 'https://github.com/ahmad',
  websiteUrl: 'https://ahmad.example.com',
};

const baseMember = {
  id: 'm1',
  fullName: 'Ahmad Hassan',
  designation: 'Chief Executive Officer',
  level: 'management' as const,
  sortOrder: 0,
  enabled: true,
  createdAt: new Date('2026-11-16T00:00:00.000Z'),
  updatedAt: new Date('2026-11-16T00:00:00.000Z'),
};

// ------------------------------------------------------- selection logic

test('chosen 2 render, in the chosen order', () => {
  const links = resolveTeamSocials({ ...ALL_LINKS, visibleSocials: 'website,github' });
  assert.deepEqual(
    links.map((l) => l.platform),
    ['website', 'github'],
  );
  assert.equal(links[0].url, 'https://ahmad.example.com');
  assert.equal(links[1].url, 'https://github.com/ahmad');
  assert.equal(links.length, 2, 'never more than 2 icons');
});

test('chosen 2 with one URL empty renders only the filled one', () => {
  const links = resolveTeamSocials({ ...ALL_LINKS, xUrl: '', visibleSocials: 'x,linkedin' });
  assert.deepEqual(
    links.map((l) => l.platform),
    ['linkedin'],
  );
});

test('fallback (null choice): first 2 filled links in GitHub, LinkedIn, X, Website order', () => {
  assert.deepEqual(
    resolveTeamSocials({ ...ALL_LINKS, visibleSocials: null }).map((l) => l.platform),
    ['github', 'linkedin'],
  );
  assert.deepEqual(
    resolveTeamSocials({ ...ALL_LINKS, visibleSocials: '' }).map((l) => l.platform),
    ['github', 'linkedin'],
  );
  // Website-only member falls back to just the website.
  assert.deepEqual(
    resolveTeamSocials({ websiteUrl: 'https://ahmad.example.com', visibleSocials: undefined }).map((l) => l.platform),
    ['website'],
  );
});

test('1-link and 0-link members render without an empty icons row', () => {
  assert.equal(resolveTeamSocials({ linkedinUrl: 'https://linkedin.com/in/ahmad' }).length, 1);
  assert.deepEqual(resolveTeamSocials({ visibleSocials: 'github,linkedin' }), [], 'chosen but nothing filled = no icons');
  assert.deepEqual(resolveTeamSocials({}), [], 'nothing filled = no icons');
});

test('stored choice is parsed leniently: bad keys dropped, duplicates removed, capped at 2', () => {
  assert.deepEqual(parseVisibleSocials('github,github,tiktok,linkedin,x'), ['github', 'linkedin']);
  assert.deepEqual(parseVisibleSocials('  website , x  '), ['website', 'x']);
  assert.deepEqual(parseVisibleSocials(null), []);
  assert.deepEqual(parseVisibleSocials('nonsense'), []);
});

// ------------------------------------------------------------- validation

test('API validation rejects 3+ selections and unknown keys', () => {
  assert.equal(normalizeVisibleSocials(['x', 'linkedin', 'github']).error, 'Pick at most 2 social links to show on the card');
  assert.match(normalizeVisibleSocials(['x', 'tiktok']).error ?? '', /Unknown social platform: tiktok/);
  assert.match(normalizeVisibleSocials('x,linkedin,github,website').error ?? '', /at most 2/);
  const ok = normalizeVisibleSocials(['linkedin', 'github', 'linkedin']);
  assert.equal(ok.error, null, 'duplicates are removed, not rejected');
  assert.deepEqual(ok.socials, ['linkedin', 'github']);
  assert.deepEqual(normalizeVisibleSocials([]).socials, []);
  assert.deepEqual(normalizeVisibleSocials(undefined).socials, []);
});

test('serialize: empty choice stores null, a choice stores the comma-joined order', () => {
  assert.equal(serializeVisibleSocials([]), null);
  assert.equal(serializeVisibleSocials(['github', 'linkedin']), 'github,linkedin');
  assert.equal(MAX_VISIBLE_SOCIALS, 2);
});

test('validateTeamMember rejects an invalid social choice', () => {
  const error = validateTeamMember({
    fullName: 'Ahmad Hassan',
    designation: 'Chief Executive Officer',
    visibleSocials: ['x', 'linkedin', 'github'],
  });
  assert.equal(error, 'Pick at most 2 social links to show on the card');
  const ok = validateTeamMember({
    fullName: 'Ahmad Hassan',
    designation: 'Chief Executive Officer',
    visibleSocials: ['github', 'website'],
  });
  assert.equal(ok, null);
});

// ------------------------------------------------------------------ mapper

test('mapper passes visibleSocials through, and tolerates a pre-migration row without it', () => {
  const row = { ...baseMember, ...ALL_LINKS, visibleSocials: 'github,linkedin' } as TeamMemberRow;
  assert.equal(mapTeamMemberRow(row).visibleSocials, 'github,linkedin');
  const legacy = { ...baseMember, ...ALL_LINKS } as unknown as TeamMemberRow;
  assert.equal(mapTeamMemberRow(legacy).visibleSocials, undefined);
});

// ------------------------------------------------------- repository (fake DB)

test('repository round-trip: create + list + update keep the choice, clearing stores null', async () => {
  const fake = createFakeDb();
  __setDbClient(fake as never);
  try {
    const created = await createTeamMember({
      fullName: 'Ahmad Hassan',
      designation: 'Chief Executive Officer',
      xUrl: 'https://x.com/ahmad',
      linkedinUrl: 'https://linkedin.com/in/ahmad',
      githubUrl: 'https://github.com/ahmad',
      websiteUrl: 'https://ahmad.example.com',
      visibleSocials: 'website,github',
    });
    assert.equal(created.visibleSocials, 'website,github');
    const listed = await listTeamMembers();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].visibleSocials, 'website,github');
    const cleared = await updateTeamMember(created.id, { visibleSocials: null });
    assert.equal(cleared?.visibleSocials, undefined, 'cleared choice reads back as no choice (fallback applies)');
  } finally {
    __resetDbClient();
  }
});

test('the 42703 detector recognises a missing visibleSocials column', () => {
  const error = Object.assign(new Error('column "visibleSocials" does not exist'), { code: '42703' });
  assert.equal(isMissingColumnError(error, ['visibleSocials']), true);
  assert.equal(isMissingColumnError(error, ['otherColumn']), false);
  assert.equal(isMissingColumnError(new Error('boom'), ['visibleSocials']), false);
});

// ------------------------------------------------------------- card wiring

test('TeamSection: icons live at the bottom-right and render only when at least 1 exists', () => {
  const section = read('components/sections/TeamSection.tsx');
  assert.ok(section.includes('resolveTeamSocials'), 'card resolves the chosen/fallback links');
  assert.ok(section.includes('socials.length > 0'), 'icons row renders only when at least 1 link exists');
  assert.ok(
    section.includes('mt-auto flex items-center justify-end'),
    'icons row is pinned to the bottom-right of the card',
  );
  assert.ok(!section.includes('flex items-start justify-between gap-3'), 'icons are no longer in the top-right name row');
  assert.ok(!section.includes('member.xUrl &&'), 'card never renders raw URL fields directly');
  assert.ok(!section.includes('member.linkedinUrl &&'), 'card never renders raw URL fields directly');
  assert.ok(!section.includes('member.githubUrl &&'), 'card never renders raw URL fields directly');
  assert.ok(!section.includes('member.websiteUrl &&'), 'card never renders raw URL fields directly');
  // The rest of the card is untouched: photo, name, designation, bio.
  assert.ok(section.includes('{member.fullName}'), 'name must stay');
  assert.ok(section.includes('{member.designation}'), 'designation must stay');
  assert.ok(section.includes('{member.bio}'), 'bio must stay');
  assert.ok(section.includes('aspect-[4/3]'), 'photo ratio must stay');
});

// -------------------------------------------------------- admin form wiring

test('admin form caps the "Show on card" choice at 2 and prefills the stored choice', () => {
  const form = read('app/admin/success-stories-management/management-client.tsx');
  assert.ok(form.includes('Show on card (pick up to'), 'the picker exists');
  assert.ok(form.includes('TEAM_SOCIAL_PLATFORMS.map'), 'all 4 platforms are offered');
  assert.ok(
    form.includes('visibleSocials.length >= MAX_VISIBLE_SOCIALS'),
    'once 2 are picked the remaining boxes are disabled',
  );
  assert.ok(form.includes('disabled={disabled}'), 'the disabled state is wired to the checkbox');
  assert.ok(form.includes('2 picked — unpick one'), 'a hint explains the cap');
  assert.ok(
    form.includes('visibleSocials: parseVisibleSocials(member.visibleSocials)'),
    'editing a member prefills the stored choice',
  );
  assert.ok(form.includes('visibleSocials: []'), 'a new member starts with no choice (fallback)');
});

// -------------------------------------------------------------- API wiring

test('team APIs accept visibleSocials, validate it, and only send it when provided', () => {
  const post = read('app/api/admin/success-stories-management/team/route.ts');
  assert.ok(post.includes('normalizeVisibleSocials(v.visibleSocials)'), 'POST validates the choice');
  assert.ok(post.includes("status: 400"), 'POST rejects an invalid choice with 400');
  assert.ok(post.includes('serializeVisibleSocials(socials)'), 'POST stores the normalized choice');
  const patch = read('app/api/admin/success-stories-management/team/[id]/route.ts');
  assert.ok(patch.includes('visibleSocials: v.visibleSocials !== undefined'), 'PATCH merges the body choice over the stored one');
  assert.ok(patch.includes('delete patch.visibleSocials'), 'toggle/reorder PATCHes never touch the column');
  const repo = read('lib/db/team-members.ts');
  assert.ok(
    repo.includes('TEAM_MEMBER_VISIBLE_SOCIALS_MISSING_MESSAGE'),
    'a missing-column write fails with a clear message',
  );
  assert.ok(
    repo.includes('codebettle-team-visible-socials-migration.sql'),
    'the message names the SQL file to run',
  );
  assert.ok(repo.includes('withTeamMemberColumnFallback'), 'reads fall back to pre-migration columns');
});

// ------------------------------------------------- migration + SQL twin

test('migration adds the nullable visibleSocials column (twin verified by read-back, see note)', () => {
  const migration = JSON.parse(read('migrations/app/20261116T2324_add_team_member_visible_socials/migration.json')) as {
    from: string;
    to: string;
  };
  assert.equal(migration.from, 'd8be1c164f74f3a1c55e61d91de477d2ab5ef1233f41a0d0c621e4a3faff7794', 'from = team-credits migration end snapshot');
  const ops = JSON.parse(read('migrations/app/20261116T2324_add_team_member_visible_socials/ops.json')) as {
    execute: { sql: string }[];
  }[];
  assert.equal(ops.length, 1, 'exactly one operation');
  assert.equal(ops[0].execute[0].sql, 'ALTER TABLE "public"."TeamMember" ADD COLUMN "visibleSocials" text');
  // NOTE: the SQL twin for Eman (~/workspace/your_files/
  // codebettle-team-visible-socials-migration.sql) carries the same
  // ALTER with IF NOT EXISTS for idempotency. It lives OUTSIDE the
  // repo by convention, so this test deliberately does NOT read it —
  // a test that reads it would pass locally and fail in CI (ENOENT),
  // where the file does not exist. The twin was verified by read-back
  // against this ops SQL before handoff; keep the two in sync by hand.
  const endSnapshot = JSON.parse(
    read(`migrations/snapshots/${migration.to}/contract.json`),
  ) as { domain: { namespaces: { public: { models: { TeamMember: { fields: { visibleSocials: { nullable: boolean } } } } } } } };
  assert.equal(endSnapshot.domain.namespaces.public.models.TeamMember.fields.visibleSocials.nullable, true, 'end snapshot has the nullable column');
  const startSnapshot = JSON.parse(
    read(`migrations/snapshots/${migration.from}/contract.json`),
  ) as { domain: { namespaces: { public: { models: { TeamMember: { fields: Record<string, unknown> } } } } } };
  assert.equal(
    'visibleSocials' in startSnapshot.domain.namespaces.public.models.TeamMember.fields,
    false,
    'start snapshot has no visibleSocials column',
  );
});
