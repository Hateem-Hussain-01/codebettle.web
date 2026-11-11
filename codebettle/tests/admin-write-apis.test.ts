import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { __resetDbClient, __setDbClient } from '../lib/db/client';
import { __resetTestSession, __setTestSession } from '../lib/api-helpers';
import { createFakeDb, type FakeDb } from './fake-db';
import type { SessionUser } from '../lib/services/auth-service';

const D = (s: string) => new Date(s);

const ADMIN: SessionUser = { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', role: 'admin' };
const INST1: SessionUser = { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', role: 'instructor' };
const INST2: SessionUser = { id: 'inst-2', name: 'Sara', email: 'sara@codebettle.com', role: 'instructor' };
const STU1: SessionUser = { id: 'stu-1', name: 'Ali', email: 'ali@example.com', role: 'student' };

let fake: FakeDb;

function jsonReq(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient());
  fake.seed('User', [
    { id: 'admin-1', name: 'Admin', email: 'admin@codebettle.com', passwordHash: '$2b$12$hash', role: 'admin', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-1', name: 'Usman', email: 'usman@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'inst-2', name: 'Sara', email: 'sara@codebettle.com', passwordHash: '$2b$12$hash', role: 'instructor', status: 'active', joinedAt: D('2024-01-01') },
    { id: 'stu-1', name: 'Ali', email: 'ali@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-02') },
    { id: 'stu-2', name: 'Sara S', email: 'sara@example.com', passwordHash: '$2b$12$hash', role: 'student', status: 'active', joinedAt: D('2024-01-03') },
  ]);
  fake.seed('Course', [
    {
      id: 'course-1', slug: 'web-101', title: 'Web 101', description: 'Intro', longDescription: 'Long',
      thumbnail: '/t.png', category: 'Web_Development', level: 'beginner', pricePkr: 5000, isFree: false,
      instructorId: 'inst-1', zoomLink: null, schedule: null, status: 'draft',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 1, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
    {
      id: 'course-2', slug: 'other-101', title: 'Other 101', description: 'Other', longDescription: 'Other',
      thumbnail: '/t.png', category: 'Programming', level: 'beginner', pricePkr: 0, isFree: true,
      instructorId: 'inst-2', zoomLink: null, schedule: null, status: 'published',
      isFeatured: false, isCompleted: false, completedAt: null, requirements: [], whatYouLearn: [],
      tags: [], enrolledCount: 0, rating: 0, reviewCount: 0,
      createdAt: D('2024-04-01'), updatedAt: D('2024-04-01'),
    },
  ]);
  fake.seed('Module', [{ id: 'mod-1', courseId: 'course-1', title: 'Basics', position: 1 }]);
  fake.seed('Lesson', [
    { id: 'les-1', moduleId: 'mod-1', title: 'L1', description: '', position: 1, recordingUrl: null, materials: [], duration: '10m', date: null },
  ]);
  fake.seed('Enrollment', [
    { id: 'enr-1', studentId: 'stu-1', courseId: 'course-1', enrolledAt: D('2024-05-01'), isCompleted: true, completedAt: D('2024-06-01'), paymentStatus: 'paid', amountPaid: 5000, couponUsed: null, deletedAt: null },
  ]);
  fake.seed('BlogPost', [
    {
      id: 'post-1', slug: 'first-post', title: 'First', excerpt: 'E', content: 'C', pdfUrl: null,
      thumbnail: '/t.png', category: 'General', authorId: 'inst-1', authorName: 'Usman',
      publishedAt: D('2024-05-01'), isPublished: true, readTime: '3 min read', tags: [],
      createdAt: D('2024-05-01'), updatedAt: D('2024-05-01'),
    },
  ]);
});

test.afterEach(() => {
  __resetDbClient();
  __resetTestSession();
});

// ---------------------------------------------------------------------------
// PUT /api/admin/users/[id]
// ---------------------------------------------------------------------------

test('PUT user: admin edits details; hash never returned; validation + RBAC enforced', async () => {
  const { PUT } = await import('../app/api/admin/users/[id]/route');

  __setTestSession(ADMIN);
  const ok = await PUT(jsonReq('http://localhost/api/admin/users/stu-1', 'PUT', { name: 'Ali Updated' }), {
    params: Promise.resolve({ id: 'stu-1' }),
  });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.user.name, 'Ali Updated');
  assert.equal('passwordHash' in body.user, false);

  const empty = await PUT(jsonReq('http://localhost/api/admin/users/stu-1', 'PUT', {}), {
    params: Promise.resolve({ id: 'stu-1' }),
  });
  assert.equal(empty.status, 400);

  const toAdmin = await PUT(jsonReq('http://localhost/api/admin/users/stu-1', 'PUT', { role: 'admin' }), {
    params: Promise.resolve({ id: 'stu-1' }),
  });
  assert.equal(toAdmin.status, 400);

  const selfRole = await PUT(jsonReq('http://localhost/api/admin/users/admin-1', 'PUT', { role: 'instructor' }), {
    params: Promise.resolve({ id: 'admin-1' }),
  });
  assert.equal(selfRole.status, 403);

  const dupeEmail = await PUT(jsonReq('http://localhost/api/admin/users/stu-1', 'PUT', { email: 'sara@example.com' }), {
    params: Promise.resolve({ id: 'stu-1' }),
  });
  assert.equal(dupeEmail.status, 400);

  const missing = await PUT(jsonReq('http://localhost/api/admin/users/ghost', 'PUT', { name: 'x' }), {
    params: Promise.resolve({ id: 'ghost' }),
  });
  assert.equal(missing.status, 404);

  __setTestSession(STU1);
  const asStudent = await PUT(jsonReq('http://localhost/api/admin/users/stu-1', 'PUT', { name: 'x' }), {
    params: Promise.resolve({ id: 'stu-1' }),
  });
  assert.equal(asStudent.status, 403);

  __setTestSession(null);
  const anon = await PUT(jsonReq('http://localhost/api/admin/users/stu-1', 'PUT', { name: 'x' }), {
    params: Promise.resolve({ id: 'stu-1' }),
  });
  assert.equal(anon.status, 401);
});

// ---------------------------------------------------------------------------
// Applications: public POST + admin PATCH
// ---------------------------------------------------------------------------

test('applications: public submit works without a session; admin review works; student cannot review', async () => {
  const list = await import('../app/api/admin/applications/route');
  const review = await import('../app/api/admin/applications/[id]/route');

  __setTestSession(null);
  const created = await list.POST(jsonReq('http://localhost/api/admin/applications', 'POST', {
    name: 'New Teacher', email: 'teacher@example.com', expertise: 'Python', experience: '4 years',
    // Module 3: LinkedIn/CV/demo/whyGoodFit are required by the schema now.
    linkedinUrl: 'https://linkedin.com/in/new-teacher',
    cvUrl: 'cvs/11111111-1111-1111-1111-111111111111.pdf',
    demoRecordingUrl: 'demos/22222222-2222-2222-2222-222222222222.mp4',
    whyGoodFit: 'I love teaching.',
  }));
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.application.status, 'pending');
  const appId = createdBody.application.id as string;

  const bad = await list.POST(jsonReq('http://localhost/api/admin/applications', 'POST', { name: '', email: 'x' }));
  assert.equal(bad.status, 400);

  __setTestSession(STU1);
  const asStudent = await review.PATCH(jsonReq(`http://localhost/api/admin/applications/${appId}`, 'PATCH', { status: 'approved' }), {
    params: Promise.resolve({ id: appId }),
  });
  assert.equal(asStudent.status, 403);

  __setTestSession(ADMIN);
  const approved = await review.PATCH(jsonReq(`http://localhost/api/admin/applications/${appId}`, 'PATCH', { status: 'approved' }), {
    params: Promise.resolve({ id: appId }),
  });
  assert.equal(approved.status, 200);
  assert.equal((await approved.json()).application.status, 'approved');

  const listed = await list.GET(new NextRequest('http://localhost/api/admin/applications?status=approved'));
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).total, 1);
});

// ---------------------------------------------------------------------------
// Courses: admin create/list, instructor edit + ownership, module/lesson
// ---------------------------------------------------------------------------

test('admin courses: create + list; instructor cannot use admin routes', async () => {
  const adminCourses = await import('../app/api/admin/courses/route');

  __setTestSession(INST1);
  const asInstructor = await adminCourses.POST(jsonReq('http://localhost/api/admin/courses', 'POST', {}));
  assert.equal(asInstructor.status, 403);

  __setTestSession(ADMIN);
  const bad = await adminCourses.POST(jsonReq('http://localhost/api/admin/courses', 'POST', { title: 'x' }));
  assert.equal(bad.status, 400);

  const created = await adminCourses.POST(jsonReq('http://localhost/api/admin/courses', 'POST', {
    slug: 'react-101', title: 'React 101', description: 'D', longDescription: 'LD',
    thumbnail: '/t.png', category: 'Web Development', level: 'beginner', price: 3000, instructorId: 'inst-1',
  }));
  assert.equal(created.status, 201);
  assert.equal((await created.json()).course.slug, 'react-101');

  const listed = await adminCourses.GET(new NextRequest('http://localhost/api/admin/courses?search=React'));
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.equal(listedBody.total, 1);
  assert.equal(listedBody.courses[0].slug, 'react-101');
});

test('instructor courses: own course editable, status change 403, other course 403', async () => {
  const instructorCourse = await import('../app/api/instructor/courses/[id]/route');

  __setTestSession(INST1);
  const own = await instructorCourse.PATCH(jsonReq('http://localhost/api/instructor/courses/course-1', 'PATCH', { title: 'Web 101 v2' }), {
    params: Promise.resolve({ id: 'course-1' }),
  });
  assert.equal(own.status, 200);
  assert.equal((await own.json()).course.title, 'Web 101 v2');

  const status = await instructorCourse.PATCH(jsonReq('http://localhost/api/instructor/courses/course-1', 'PATCH', { status: 'published' }), {
    params: Promise.resolve({ id: 'course-1' }),
  });
  assert.equal(status.status, 403);

  const others = await instructorCourse.PATCH(jsonReq('http://localhost/api/instructor/courses/course-2', 'PATCH', { title: 'Hijack' }), {
    params: Promise.resolve({ id: 'course-2' }),
  });
  assert.equal(others.status, 403);

  __setTestSession(STU1);
  const asStudent = await instructorCourse.PATCH(jsonReq('http://localhost/api/instructor/courses/course-1', 'PATCH', { title: 'x' }), {
    params: Promise.resolve({ id: 'course-1' }),
  });
  assert.equal(asStudent.status, 403);

  __setTestSession(null);
  const anon = await instructorCourse.PATCH(jsonReq('http://localhost/api/instructor/courses/course-1', 'PATCH', { title: 'x' }), {
    params: Promise.resolve({ id: 'course-1' }),
  });
  assert.equal(anon.status, 401);
});

test('modules/lessons: admin and instructor create; ownership enforced', async () => {
  const adminModules = await import('../app/api/admin/courses/[id]/modules/route');
  const instructorLessons = await import('../app/api/instructor/courses/[id]/modules/[moduleId]/lessons/route');

  __setTestSession(ADMIN);
  const created = await adminModules.POST(jsonReq('http://localhost/api/admin/courses/course-1/modules', 'POST', { title: 'Second' }), {
    params: Promise.resolve({ id: 'course-1' }),
  });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).module.title, 'Second');

  __setTestSession(INST2);
  const others = await instructorLessons.POST(
    jsonReq('http://localhost/api/instructor/courses/course-1/modules/mod-1/lessons', 'POST', { title: 'Nope' }),
    { params: Promise.resolve({ id: 'course-1', moduleId: 'mod-1' }) },
  );
  assert.equal(others.status, 403);

  __setTestSession(INST1);
  const own = await instructorLessons.POST(
    jsonReq('http://localhost/api/instructor/courses/course-1/modules/mod-1/lessons', 'POST', { title: 'L2' }),
    { params: Promise.resolve({ id: 'course-1', moduleId: 'mod-1' }) },
  );
  assert.equal(own.status, 201);
  assert.equal((await own.json()).lesson.title, 'L2');
});

// ---------------------------------------------------------------------------
// Enrollments + certificates
// ---------------------------------------------------------------------------

test('enrollments: admin create/list; duplicate 400; certificates issue with generated number', async () => {
  const enrollments = await import('../app/api/admin/enrollments/route');
  const certificates = await import('../app/api/admin/certificates/route');

  __setTestSession(STU1);
  const asStudent = await enrollments.POST(jsonReq('http://localhost/api/admin/enrollments', 'POST', {
    studentId: 'stu-2', courseId: 'course-1', paymentStatus: 'free', amountPaid: 0,
  }));
  assert.equal(asStudent.status, 403);

  __setTestSession(ADMIN);
  const dupe = await enrollments.POST(jsonReq('http://localhost/api/admin/enrollments', 'POST', {
    studentId: 'stu-1', courseId: 'course-1', paymentStatus: 'paid', amountPaid: 5000,
  }));
  assert.equal(dupe.status, 400);

  const created = await enrollments.POST(jsonReq('http://localhost/api/admin/enrollments', 'POST', {
    studentId: 'stu-2', courseId: 'course-1', paymentStatus: 'free', amountPaid: 0,
  }));
  assert.equal(created.status, 201);

  const listed = await enrollments.GET(new NextRequest('http://localhost/api/admin/enrollments?courseId=course-1'));
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).total, 2);

  const issued = await certificates.POST(jsonReq('http://localhost/api/admin/certificates', 'POST', {
    studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1',
  }));
  assert.equal(issued.status, 201);
  const certBody = await issued.json();
  assert.equal(certBody.certificate.certificateNumber, `CB-${new Date().getFullYear()}-001`);

  const again = await certificates.POST(jsonReq('http://localhost/api/admin/certificates', 'POST', {
    studentId: 'stu-1', courseId: 'course-1', enrollmentId: 'enr-1', certificateNumber: 'CB-2099-999',
  }));
  assert.equal(again.status, 400);

  const certListed = await certificates.GET(new NextRequest('http://localhost/api/admin/certificates'));
  assert.equal(certListed.status, 200);
  assert.equal((await certListed.json()).total, 1);
});

// ---------------------------------------------------------------------------
// Blog: create / edit / delete + upload validation + missing-key 503
// ---------------------------------------------------------------------------

test('blog: instructor creates own post, cannot edit another’s; admin deletes', async () => {
  const blog = await import('../app/api/admin/blog/route');
  const blogById = await import('../app/api/admin/blog/[id]/route');

  __setTestSession(INST2);
  const other = await blogById.PATCH(jsonReq('http://localhost/api/admin/blog/post-1', 'PATCH', { title: 'Hijack' }), {
    params: Promise.resolve({ id: 'post-1' }),
  });
  assert.equal(other.status, 403);

  __setTestSession(INST1);
  const created = await blog.POST(jsonReq('http://localhost/api/admin/blog', 'POST', {
    slug: 'mine', title: 'Mine', excerpt: 'E', content: 'C', thumbnail: '/t.png', category: 'General', readTime: '2 min read',
  }));
  assert.equal(created.status, 201);
  assert.equal((await created.json()).post.authorId, 'inst-1');

  __setTestSession(ADMIN);
  const deleted = await blogById.DELETE(jsonReq('http://localhost/api/admin/blog/post-1', 'DELETE'), {
    params: Promise.resolve({ id: 'post-1' }),
  });
  assert.equal(deleted.status, 200);
});

test('blog upload: non-PDF is 400; PDF without a service-role key is 503', async () => {
  const upload = await import('../app/api/admin/blog/upload/route');
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  try {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    __setTestSession(ADMIN);

    const txt = new FormData();
    txt.append('file', new File(['hello'], 'notes.txt', { type: 'text/plain' }));
    const badType = await upload.POST(new NextRequest('http://localhost/api/admin/blog/upload', { method: 'POST', body: txt }));
    assert.equal(badType.status, 400);

    const pdf = new FormData();
    pdf.append('file', new File(['%PDF-1.4'], 'notes.pdf', { type: 'application/pdf' }));
    const noKey = await upload.POST(new NextRequest('http://localhost/api/admin/blog/upload', { method: 'POST', body: pdf }));
    assert.equal(noKey.status, 503);
    const noKeyBody = await noKey.json();
    assert.match(noKeyBody.error, /not configured/);
    assert.equal('stack' in noKeyBody, false);
  } finally {
    if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
  }
});
