import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  DEFAULT_PAGE_STATS,
  DEFAULT_VIDEO_CONFIG,
  groupTeamByLevel,
  moveItem,
  orderValuesAfterMove,
  parsePageStats,
  parseVideoConfig,
  resolveNavItems,
  validateNavItem,
  validateStudentReview,
  validateTeamMember,
  visibleCount,
} from '../lib/management';
import {
  createTeamMember,
  deleteTeamMember,
  getTeamMemberById,
  listEnabledTeamMembers,
  listTeamMembers,
  updateTeamMember,
} from '../lib/db/team-members';
import {
  createStudentReview,
  deleteStudentReview,
  listEnabledStudentReviews,
  listStudentReviews,
  updateStudentReview,
} from '../lib/db/student-reviews';
import {
  createNavItem,
  deleteNavItem,
  listNavItems,
  seedDefaultNavItems,
  updateNavItem,
} from '../lib/db/nav-items';
import { DEFAULT_SETTINGS } from '../lib/services/settings-service';
import {
  createAdminSuccessStory,
  listPublicSuccessStories,
} from '../lib/services/success-story-service';
import { updateSuccessStorySubmission } from '../lib/db/success-stories';

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
});

test.afterEach(() => {
  __resetDbClient();
});

// ---------------------------------------------------------------------------
// Video config (pure)
// ---------------------------------------------------------------------------

test('video config: defaults when nothing is stored', () => {
  assert.deepEqual(parseVideoConfig(null), DEFAULT_VIDEO_CONFIG);
  assert.deepEqual(parseVideoConfig({}), DEFAULT_VIDEO_CONFIG);
});

test('video config: invalid values fall back to defaults, position is corrected to its layout', () => {
  const parsed = parseVideoConfig({
    videoUrl: 'https://example.com/video.mp4',
    layout: 'side-by-side',
    position: 'video-above',
    orientation: 'bogus',
  });
  assert.equal(parsed.videoUrl, 'https://example.com/video.mp4');
  assert.equal(parsed.layout, 'side-by-side');
  // A side-by-side layout cannot have a vertical position.
  assert.equal(parsed.position, 'video-left');
  assert.equal(parsed.orientation, 'portrait');
  const vertical = parseVideoConfig({ layout: 'vertical', position: 'video-right' });
  assert.equal(vertical.position, 'video-above');
});

test('video config: a valid vertical landscape config survives', () => {
  const parsed = parseVideoConfig({
    layout: 'vertical',
    position: 'video-below',
    orientation: 'landscape',
  });
  assert.deepEqual(parsed, {
    videoUrl: '',
    layout: 'vertical',
    position: 'video-below',
    orientation: 'landscape',
  });
});

// ---------------------------------------------------------------------------
// Stats (pure)
// ---------------------------------------------------------------------------

test('stats: defaults are Eman\'s numbers; blank stored values fall back', () => {
  assert.deepEqual(DEFAULT_PAGE_STATS, {
    happyStudents: '1500+',
    averageRating: '4.9/5',
    recommendRate: '98%',
    hoursOfLearning: '5000+',
  });
  assert.deepEqual(parsePageStats({ happyStudents: '  ', averageRating: '5/5' }), {
    happyStudents: '1500+',
    averageRating: '5/5',
    recommendRate: '98%',
    hoursOfLearning: '5000+',
  });
});

// ---------------------------------------------------------------------------
// Team grouping + Load More + reorder (pure)
// ---------------------------------------------------------------------------

test('team grouping: enabled only, levels top-to-bottom, ordered within a level', () => {
  const groups = groupTeamByLevel([
    { id: 'b', level: 2, orderInLevel: 1, enabled: true },
    { id: 'a', level: 1, orderInLevel: 0, enabled: true },
    { id: 'c', level: 2, orderInLevel: 0, enabled: true },
    { id: 'd', level: 1, orderInLevel: 0, enabled: false },
  ]);
  assert.deepEqual(
    groups.map((g) => ({ level: g.level, ids: g.members.map((m) => m.id) })),
    [
      { level: 1, ids: ['a'] },
      { level: 2, ids: ['c', 'b'] },
    ],
  );
});

test('load more: first 5, then 5 more per click, never past the total', () => {
  assert.equal(visibleCount(12, 5, 0), 5);
  assert.equal(visibleCount(12, 5, 1), 10);
  assert.equal(visibleCount(12, 5, 2), 12);
  assert.equal(visibleCount(0, 5, 0), 0);
});

test('reorder: up/down moves one step, edges return null', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  assert.deepEqual(moveItem(items, 'b', 'up')?.map((i) => i.id), ['b', 'a', 'c']);
  assert.deepEqual(moveItem(items, 'b', 'down')?.map((i) => i.id), ['a', 'c', 'b']);
  assert.equal(moveItem(items, 'a', 'up'), null);
  assert.equal(moveItem(items, 'c', 'down'), null);
  assert.equal(moveItem(items, 'zzz', 'up'), null);
  assert.deepEqual(orderValuesAfterMove(items, 'b', 'up'), [
    { id: 'b', order: 0 },
    { id: 'a', order: 1 },
    { id: 'c', order: 2 },
  ]);
});

// ---------------------------------------------------------------------------
// Validation (pure)
// ---------------------------------------------------------------------------

test('team validation: name + designation required, bad URLs rejected', () => {
  assert.equal(validateTeamMember({ fullName: '', designation: 'CEO' }), 'Full name is required');
  assert.equal(validateTeamMember({ fullName: 'Ahmad', designation: '' }), 'Designation is required');
  assert.equal(
    validateTeamMember({ fullName: 'Ahmad', designation: 'CEO', linkedinUrl: 'not-a-url' }),
    'LinkedIn URL must be a valid http(s) URL',
  );
  assert.equal(validateTeamMember({ fullName: 'Ahmad', designation: 'CEO', level: 0 }), 'Level must be a whole number of 1 or more');
  assert.equal(validateTeamMember({ fullName: 'Ahmad', designation: 'CEO' }), null);
});

test('review validation: rating 1-5, text required', () => {
  assert.equal(
    validateStudentReview({ fullName: 'Ali', role: 'Student', reviewText: 'Great', rating: 6 }),
    'Rating must be a whole number from 1 to 5',
  );
  assert.equal(
    validateStudentReview({ fullName: 'Ali', role: 'Student', reviewText: '  ' }),
    'Review text is required',
  );
  assert.equal(
    validateStudentReview({ fullName: 'Ali', role: 'Student', reviewText: 'Great', rating: 5 }),
    null,
  );
});

test('nav validation: label required, destination must be a path or http(s) URL', () => {
  assert.equal(validateNavItem({ label: '', href: '/courses' }), 'Label is required');
  assert.equal(validateNavItem({ label: 'X', href: 'notaurl' }), 'Destination must be a site path (starting with /) or a full http(s) URL');
  assert.equal(validateNavItem({ label: 'Spotlight', href: '/success-stories' }), null);
  assert.equal(validateNavItem({ label: 'External', href: 'https://example.com' }), null);
});

// ---------------------------------------------------------------------------
// Nav fallback (pure)
// ---------------------------------------------------------------------------

test('nav fallback: empty DB config renders the hardcoded nav with Spotlight', () => {
  const items = resolveNavItems([]);
  assert.deepEqual(items, [
    { label: 'Courses', href: '/courses' },
    { label: 'Instructors', href: '/instructors' },
    { label: 'Blog', href: '/blog' },
    { label: 'Spotlight', href: '/success-stories' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' },
  ]);
  assert.deepEqual(resolveNavItems(null), resolveNavItems([]));
});

test('nav resolve: enabled DB items in order; disabled hidden', () => {
  const items = resolveNavItems([
    { id: '2', label: 'Blog', href: '/blog', order: 1, enabled: true },
    { id: '1', label: 'Courses', href: '/courses', order: 0, enabled: true },
    { id: '3', label: 'Hidden', href: '/hidden', order: 2, enabled: false },
  ]);
  assert.deepEqual(items, [
    { label: 'Courses', href: '/courses' },
    { label: 'Blog', href: '/blog' },
  ]);
});

// ---------------------------------------------------------------------------
// Team members (fake DB)
// ---------------------------------------------------------------------------

test('team: CRUD + enabled visibility (disabled stays in admin, hidden publicly)', async () => {
  const member = await createTeamMember({
    fullName: 'Ahmad Hassan',
    designation: 'Chief Executive Officer',
    bio: 'Founder',
    level: 1,
    orderInLevel: 0,
  });
  assert.equal(member.fullName, 'Ahmad Hassan');
  assert.equal(member.enabled, true);
  assert.equal((await listEnabledTeamMembers()).length, 1);
  assert.equal((await listTeamMembers()).length, 1);

  const updated = await updateTeamMember(member.id, { enabled: false });
  assert.equal(updated?.enabled, false);
  assert.equal((await listEnabledTeamMembers()).length, 0);
  // Still in the admin list.
  assert.equal((await listTeamMembers()).length, 1);
  assert.equal((await getTeamMemberById(member.id))?.fullName, 'Ahmad Hassan');

  assert.equal(await deleteTeamMember(member.id), true);
  assert.equal((await listTeamMembers()).length, 0);
  assert.equal(await deleteTeamMember(member.id), false);
});

// ---------------------------------------------------------------------------
// Student reviews (fake DB)
// ---------------------------------------------------------------------------

test('reviews: CRUD + enabled visibility (disabled stays in admin, hidden from the carousel)', async () => {
  const review = await createStudentReview({
    fullName: 'Ali Raza',
    role: 'Python Student',
    rating: 5,
    reviewText: 'Great course.',
    order: 0,
  });
  assert.equal(review.enabled, true);
  assert.equal((await listEnabledStudentReviews()).length, 1);

  await updateStudentReview(review.id, { enabled: false });
  assert.equal((await listEnabledStudentReviews()).length, 0);
  assert.equal((await listStudentReviews()).length, 1);

  await updateStudentReview(review.id, { enabled: true, rating: 4 });
  const enabled = await listEnabledStudentReviews();
  assert.equal(enabled.length, 1);
  assert.equal(enabled[0].rating, 4);

  assert.equal(await deleteStudentReview(review.id), true);
  assert.equal((await listStudentReviews()).length, 0);
});

// ---------------------------------------------------------------------------
// Nav items (fake DB)
// ---------------------------------------------------------------------------

test('nav items: CRUD + seed defaults is idempotent and uses Spotlight', async () => {
  const seeded = await seedDefaultNavItems();
  assert.equal(seeded.length, 6);
  assert.equal(seeded.find((i) => i.href === '/success-stories')?.label, 'Spotlight');
  assert.deepEqual(
    seeded.map((i) => i.order),
    [0, 1, 2, 3, 4, 5],
  );

  // A second seed does not duplicate.
  const reseeded = await seedDefaultNavItems();
  assert.equal(reseeded.length, 6);
  assert.equal((await listNavItems()).length, 6);

  const custom = await createNavItem({ label: 'Custom', href: '/custom', order: 6 });
  assert.equal(custom.enabled, true);
  await updateNavItem(custom.id, { enabled: false, label: 'Custom Renamed' });
  const items = await listNavItems();
  assert.equal(items.find((i) => i.id === custom.id)?.label, 'Custom Renamed');
  assert.equal(await deleteNavItem(custom.id), true);
  assert.equal((await listNavItems()).length, 6);
});

// ---------------------------------------------------------------------------
// Admin-created stories + story visibility (fake DB)
// ---------------------------------------------------------------------------

test('admin-created story: published immediately, hidden when disabled', async () => {
  const story = await createAdminSuccessStory({
    fullName: 'Sara Khan',
    email: 'sara@example.com',
    country: 'Pakistan',
    courseTitle: 'Python',
    skillsLearned: 'Python, Django',
    experience: 'Great experience.',
    story: 'My journey.',
  });
  assert.equal(story.status, 'approved');
  assert.equal(story.adminCreated, true);
  assert.equal(story.enabled, true);

  const publicStories = await listPublicSuccessStories();
  assert.equal(publicStories.length, 1);
  assert.equal(publicStories[0].fullName, 'Sara Khan');

  await updateSuccessStorySubmission(story.id, { enabled: false });
  assert.equal((await listPublicSuccessStories()).length, 0);

  await updateSuccessStorySubmission(story.id, { enabled: true, displayOrder: 2 });
  assert.equal((await listPublicSuccessStories()).length, 1);
});

// ---------------------------------------------------------------------------
// Settings defaults (PR #32)
// ---------------------------------------------------------------------------

test('settings defaults: no video yet, Eman\'s stats, navbar logo URL', () => {
  assert.equal(DEFAULT_SETTINGS.videoUrl, '');
  assert.equal(DEFAULT_SETTINGS.videoLayout, 'side-by-side');
  assert.equal(DEFAULT_SETTINGS.videoPosition, 'video-left');
  assert.equal(DEFAULT_SETTINGS.videoOrientation, 'portrait');
  assert.equal(DEFAULT_SETTINGS.statsHappyStudents, '1500+');
  assert.equal(DEFAULT_SETTINGS.statsAverageRating, '4.9/5');
  assert.equal(DEFAULT_SETTINGS.statsRecommendRate, '98%');
  assert.equal(DEFAULT_SETTINGS.statsHoursOfLearning, '5000+');
  assert.equal(
    DEFAULT_SETTINGS.navbarLogoUrl,
    'https://phuzoxshzdfzjvephlhq.supabase.co/storage/v1/object/public/course-images/brand/navbar-logo.png',
  );
});
