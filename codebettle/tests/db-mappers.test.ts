import test from 'node:test';
import assert from 'node:assert/strict';
import {
  announcementTypeFromStorage,
  announcementTypeToStorage,
  categoryFromStorage,
  categoryToStorage,
  dateToString,
  mapCourseRow,
  mapEnrollmentRow,
  mapUserRow,
  stringToDate,
  toMaterials,
  toSchedule,
  toSocialLinks,
} from '../lib/db/mappers';
import { parsePageParams, toPage } from '../lib/db/pagination';
import type { CourseRow, EnrollmentRow, LessonProgressRow, LessonRow, ModuleRow, UserRow } from '../lib/db/types';

/** Build a row from a partial (tests only — the real client returns full rows). */
function row<T>(partial: Record<string, unknown>): T {
  return partial as unknown as T;
}

test('category mapping round-trips; unknown values throw', () => {
  assert.equal(categoryToStorage('Web Development'), 'Web_Development');
  assert.equal(categoryFromStorage('Web_Development'), 'Web Development');
  assert.equal(categoryToStorage('DevOps'), 'DevOps');
  assert.equal(categoryFromStorage('UI_UX_Design'), 'UI/UX Design');
  assert.throws(() => categoryFromStorage('Nope'), /Unknown course category/);
});

test('announcement type mapping round-trips; unknown values throw', () => {
  assert.equal(announcementTypeToStorage('site-wide'), 'site_wide');
  assert.equal(announcementTypeFromStorage('site_wide'), 'site-wide');
  assert.equal(announcementTypeToStorage('course'), 'course');
  assert.throws(() => announcementTypeFromStorage('broadcast'), /Unknown announcement type/);
});

test('date helpers round-trip; invalid strings throw', () => {
  assert.equal(dateToString(new Date('2024-05-10T00:00:00Z')), '2024-05-10');
  assert.equal(dateToString(null), '');
  assert.equal(stringToDate('2024-05-10')?.toISOString().slice(0, 10), '2024-05-10');
  assert.equal(stringToDate(''), null);
  assert.throws(() => stringToDate('not-a-date'), /Invalid date string/);
});

test('social links / schedule / materials tolerate null and malformed Json', () => {
  // Prisma returns Json columns as parsed values, never strings — a
  // string is not a valid Json object here, so it reads as absent.
  assert.equal(toSocialLinks(null), undefined);
  assert.equal(toSocialLinks('{"github":"https://github.com/x"}'), undefined);
  assert.equal(toSocialLinks('not json'), undefined);
  assert.deepEqual(toSocialLinks({ linkedin: 'https://linkedin.com/in/x' }), {
    linkedin: 'https://linkedin.com/in/x',
  });
  assert.deepEqual(toSocialLinks({ github: 'https://github.com/x', bogus: 42 }), {
    github: 'https://github.com/x',
  });

  assert.equal(toSchedule(null), undefined);
  assert.deepEqual(
    toSchedule({
      scheduleType: 'weekends',
      classTime: '9:00 AM - 5:00 PM',
      classDuration: '8 hours',
      startDate: '2024-05-10',
    }),
    {
      scheduleType: 'weekends',
      classTime: '9:00 AM - 5:00 PM',
      classDuration: '8 hours',
      startDate: '2024-05-10',
      customDays: undefined,
      notes: undefined,
    },
  );
  assert.equal(toSchedule({ scheduleType: 'self-paced' }), undefined);
  assert.equal(toSchedule({ scheduleType: 'weekends' }), undefined);

  assert.deepEqual(toMaterials(null), []);
  assert.deepEqual(toMaterials('[{"name":"Slides","url":"/s.pdf"}]'), []);
  assert.deepEqual(toMaterials([{ name: 'Slides', url: '/s.pdf' }, 'junk']), [
    { name: 'Slides', url: '/s.pdf' },
  ]);
});

test('mapUserRow keeps the hash (internal) and maps dates; enrolledCourses come from the caller', () => {
  const user = mapUserRow(
    row<UserRow>({
      id: 'u1',
      name: 'Ali',
      email: 'ali@example.com',
      passwordHash: '$2b$12$hash',
      role: 'student',
      status: 'active',
      joinedAt: new Date('2024-05-01T00:00:00Z'),
    }),
    ['course-1', 'course-2'],
  );
  assert.equal(user.passwordHash, '$2b$12$hash');
  assert.equal(user.joinedAt, '2024-05-01');
  assert.deepEqual(user.enrolledCourses, ['course-1', 'course-2']);
  assert.deepEqual(user.wishlist, []);
});

test('mapCourseRow nests modules/lessons in position order and converts enums/dates', () => {
  const modules: Array<ModuleRow & { lessons: LessonRow[] }> = [
    row<ModuleRow & { lessons: LessonRow[] }>({
      id: 'm2',
      courseId: 'c1',
      title: 'Second',
      description: '',
      position: 2,
      lessons: [
        row({ id: 'l3', moduleId: 'm2', title: 'L3', description: '', durationMinutes: 10, position: 1, isFree: false }),
      ],
    }),
    row<ModuleRow & { lessons: LessonRow[] }>({
      id: 'm1',
      courseId: 'c1',
      title: 'First',
      description: '',
      position: 1,
      lessons: [
        row({ id: 'l2', moduleId: 'm1', title: 'L2', description: '', durationMinutes: 20, position: 2, isFree: false, date: new Date('2024-05-10') }),
        row({ id: 'l1', moduleId: 'm1', title: 'L1', description: '', durationMinutes: 15, position: 1, isFree: true }),
      ],
    }),
  ];
  const course = mapCourseRow(
    row<CourseRow>({
      id: 'c1',
      slug: 'web-101',
      title: 'Web 101',
      category: 'Web_Development',
      level: 'Beginner',
      pricePkr: 5000,
      isFree: false,
      instructorId: 'inst-1',
      status: 'published',
      createdAt: new Date('2024-04-01T00:00:00Z'),
      updatedAt: new Date('2024-04-02T00:00:00Z'),
    }),
    modules,
  );
  assert.equal(course.category, 'Web Development');
  assert.equal(course.price, 5000);
  assert.deepEqual(
    course.modules.map((m) => m.id),
    ['m1', 'm2'],
  );
  assert.deepEqual(
    course.modules[0].lessons.map((l) => l.id),
    ['l1', 'l2'],
  );
  assert.equal(course.modules[0].lessons[1].date, '2024-05-10');
});

test('mapEnrollmentRow assembles completedLessons and progress from LessonProgress rows', () => {
  const enrollment = mapEnrollmentRow(
    row<EnrollmentRow>({
      id: 'e1',
      studentId: 's1',
      courseId: 'c1',
      enrolledAt: new Date('2024-05-01T00:00:00Z'),
      isCompleted: false,
      paymentStatus: 'paid',
      amountPaid: 5000,
    }),
    [
      row<LessonProgressRow>({ enrollmentId: 'e1', lessonId: 'l1' }),
      row<LessonProgressRow>({ enrollmentId: 'e1', lessonId: 'l2' }),
      row<LessonProgressRow>({ enrollmentId: 'other', lessonId: 'l9' }),
    ],
  );
  assert.deepEqual(enrollment.completedLessons, ['l1', 'l2']);
  assert.equal(enrollment.amountPaid, 5000);
});

test('parsePageParams clamps page/limit; toPage reports total pages', () => {
  assert.deepEqual(parsePageParams({}), { page: 1, limit: 25, offset: 0 });
  assert.deepEqual(parsePageParams({ page: '0', limit: '500' }), { page: 1, limit: 100, offset: 0 });
  assert.deepEqual(parsePageParams({ page: '3', limit: '10' }), { page: 3, limit: 10, offset: 20 });
  assert.deepEqual(parsePageParams({ page: ['2'], limit: ['5'] }), { page: 2, limit: 5, offset: 5 });
  const page = toPage([1, 2], 45, { page: 2, limit: 25, offset: 25 });
  assert.equal(page.totalPages, 2);
  assert.equal(page.hasNext, false);
  assert.equal(page.hasPrev, true);
});
