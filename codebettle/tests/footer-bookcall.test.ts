import test from 'node:test';
import assert from 'node:assert/strict';
import { __resetDbClient, __setDbClient, type DbClient } from '../lib/db/client';
import { createFakeDb, type FakeDb } from './fake-db';
import {
  adminUrl,
  dashboardUrlForRole,
  getAdminBasePath,
  isAdminPath,
  isAdminSigninPath,
  isLegacyAdminPath,
  toExternalAdminPath,
  toInternalAdminPath,
} from '../lib/admin-url';
import { createSubscriber, deleteSubscriber, listSubscribers } from '../lib/db/subscribers';
import {
  createBookACall,
  deleteBookACall,
  getBookACallById,
  listBookACalls,
  updateBookACallStatus,
} from '../lib/db/book-a-call';
import {
  createAmbassadorApplication,
  deleteAmbassadorApplication,
  getAmbassadorApplicationById,
  listAmbassadorApplications,
  updateAmbassadorApplicationStatus,
} from '../lib/db/ambassador-applications';
import {
  ambassadorApplicationStatusFromStorage,
  bookACallStatusFromStorage,
  mapAmbassadorApplicationRow,
  mapBookACallRow,
  mapSubscriberRow,
} from '../lib/db/mappers';
import { adminInvitationEmail, bookACallEmail } from '../lib/email/templates';
import { getPortalSwitch, portalFromPathname, primaryPortalDashboard } from '../lib/portal-switch';
import { portalMenuLinks } from '../lib/user-menu';

// ---------------------------------------------------------------------------
// Admin base path (PR #33) — secret admin URL helpers
// ---------------------------------------------------------------------------

const ORIGINAL_ADMIN_BASE_PATH = process.env.ADMIN_BASE_PATH;

function setBasePath(value: string | undefined) {
  if (value === undefined) delete process.env.ADMIN_BASE_PATH;
  else process.env.ADMIN_BASE_PATH = value;
}

test('admin-url: dev default is admin when ADMIN_BASE_PATH is unset', () => {
  setBasePath(undefined);
  assert.equal(getAdminBasePath(), 'admin');
  assert.equal(adminUrl('/dashboard'), '/admin/dashboard');
  assert.equal(adminUrl(), '/admin');
  assert.equal(isAdminPath('/admin/dashboard'), true);
  assert.equal(isAdminPath('/admin'), true);
  assert.equal(isAdminPath('/student/dashboard'), false);
  assert.equal(isLegacyAdminPath('/admin/dashboard'), true);
  assert.equal(isAdminSigninPath('/admin/signin'), true);
  assert.equal(isAdminSigninPath('/admin/dashboard'), false);
  assert.equal(toInternalAdminPath('/admin/book-a-call'), '/admin/book-a-call');
  assert.equal(toExternalAdminPath('/admin/book-a-call'), '/admin/book-a-call');
  assert.equal(dashboardUrlForRole('admin'), '/admin/dashboard');
  assert.equal(dashboardUrlForRole('student'), '/student/dashboard');
  assert.equal(dashboardUrlForRole('instructor'), '/instructor/dashboard');
});

test('admin-url: secret base path converts both ways, old /admin is legacy', () => {
  setBasePath('portal-AbC123xYz');
  try {
    assert.equal(getAdminBasePath(), 'portal-AbC123xYz');
    assert.equal(adminUrl('/dashboard'), '/portal-AbC123xYz/dashboard');
    assert.equal(adminUrl('/signin'), '/portal-AbC123xYz/signin');
    assert.equal(isAdminPath('/portal-AbC123xYz/dashboard'), true);
    assert.equal(isAdminPath('/portal-AbC123xYz'), true);
    assert.equal(isAdminPath('/admin/dashboard'), false);
    assert.equal(isAdminPath('/portal-AbC123xYz-malicious'), false);
    assert.equal(isLegacyAdminPath('/admin/dashboard'), true);
    assert.equal(isLegacyAdminPath('/portal-AbC123xYz/dashboard'), false);
    assert.equal(isAdminSigninPath('/portal-AbC123xYz/signin'), true);
    assert.equal(isAdminSigninPath('/portal-AbC123xYz/dashboard'), false);
    assert.equal(toInternalAdminPath('/portal-AbC123xYz/book-a-call'), '/admin/book-a-call');
    assert.equal(toInternalAdminPath('/portal-AbC123xYz'), '/admin');
    assert.equal(toInternalAdminPath('/student/dashboard'), '/student/dashboard');
    assert.equal(toExternalAdminPath('/admin/book-a-call'), '/portal-AbC123xYz/book-a-call');
    assert.equal(toExternalAdminPath('/admin'), '/portal-AbC123xYz');
    assert.equal(toExternalAdminPath('/student/dashboard'), '/student/dashboard');
    assert.equal(dashboardUrlForRole('admin'), '/portal-AbC123xYz/dashboard');
  } finally {
    setBasePath(ORIGINAL_ADMIN_BASE_PATH);
  }
});

test('admin-url: invalid base path values fall back to the dev default', () => {
  setBasePath('has spaces');
  assert.equal(getAdminBasePath(), 'admin');
  setBasePath('/admin/');
  assert.equal(getAdminBasePath(), 'admin');
  setBasePath('');
  assert.equal(getAdminBasePath(), 'admin');
  setBasePath(ORIGINAL_ADMIN_BASE_PATH);
});

test('portal-switch and user-menu honour the secret admin base path', () => {
  const adminUser = { role: 'admin' as const, isAdmin: true, isTeacher: true };
  const teacherUser = { role: 'instructor' as const, isAdmin: true, isTeacher: true };
  assert.equal(portalFromPathname('/portal-Xyz/dashboard', 'portal-Xyz'), 'admin');
  assert.equal(portalFromPathname('/admin/dashboard', 'portal-Xyz'), null);
  assert.equal(portalFromPathname('/portal-Xyz/dashboard'), null);
  const switched = getPortalSwitch(teacherUser, '/instructor/dashboard', 'portal-Xyz');
  assert.equal(switched?.href, '/portal-Xyz/dashboard');
  assert.equal(switched?.label, 'Switch to Admin Panel');
  assert.equal(getPortalSwitch(adminUser, '/portal-Xyz/dashboard', 'portal-Xyz')?.href, '/instructor/dashboard');
  assert.equal(primaryPortalDashboard({ role: 'admin' }, 'portal-Xyz'), '/portal-Xyz/dashboard');
  assert.equal(primaryPortalDashboard({ role: 'student' }, 'portal-Xyz'), '/student/dashboard');
  assert.deepEqual(portalMenuLinks('/portal-Xyz/courses', 'admin', 'portal-Xyz'), {
    profileHref: '/portal-Xyz/profile',
    settingsHref: '/portal-Xyz/settings',
  });
  assert.deepEqual(portalMenuLinks(null, 'admin', 'portal-Xyz'), {
    profileHref: '/portal-Xyz/profile',
    settingsHref: '/portal-Xyz/settings',
  });
});

// ---------------------------------------------------------------------------
// Repositories (PR #33) — fake DB
// ---------------------------------------------------------------------------

let fake: FakeDb;

test.beforeEach(() => {
  fake = createFakeDb();
  __setDbClient(fake.asClient() as unknown as DbClient);
});

test.afterEach(() => {
  __resetDbClient();
});

test('subscribers: create is idempotent, list newest first, delete unsubscribes', async () => {
  const first = await createSubscriber('  ALI@Example.com ');
  assert.equal(first.email, 'ali@example.com');
  const again = await createSubscriber('ali@example.com');
  assert.equal(again.id, first.id);
  const second = await createSubscriber('b@example.com');
  assert.notEqual(second.id, first.id);
  const page = await listSubscribers({});
  assert.equal(page.total, 2);
  assert.equal(page.items[0].email, 'b@example.com');
  assert.equal(await deleteSubscriber(first.id), true);
  assert.equal(await deleteSubscriber(first.id), false);
  assert.equal((await listSubscribers({})).total, 1);
});

test('book-a-call: create, list with status filter, update status, delete', async () => {
  const booking = await createBookACall({
    fullName: 'Ali Khan',
    email: 'ali@example.com',
    phone: '+92 300 1234567',
    currentStatus: 'student',
    courseInterest: 'Python',
    guidanceNeeded: 'Which course should I start with?',
    preferredContact: 'Evenings, WhatsApp',
  });
  assert.equal(booking.status, 'new');
  assert.equal(booking.currentStatus, 'student');
  assert.equal(booking.courseInterest, 'Python');
  assert.equal((await listBookACalls({})).total, 1);
  assert.equal((await listBookACalls({ status: 'new' })).total, 1);
  assert.equal((await listBookACalls({ status: 'done' })).total, 0);
  const contacted = await updateBookACallStatus(booking.id, 'contacted');
  assert.equal(contacted?.status, 'contacted');
  const done = await updateBookACallStatus(booking.id, 'done');
  assert.equal(done?.status, 'done');
  assert.deepEqual(await getBookACallById(booking.id), done);
  assert.equal(await getBookACallById('missing'), null);
  assert.equal(await updateBookACallStatus('missing', 'done'), null);
  assert.equal(await deleteBookACall(booking.id), true);
  assert.equal((await listBookACalls({})).total, 0);
});

test('ambassador applications: exact Google Form fields, approve/reject, delete', async () => {
  const application = await createAmbassadorApplication({
    fullName: 'Sara Ahmed',
    whatsapp: '+92 321 7654321',
    email: 'sara@example.com',
    university: 'University of Agriculture, Faisalabad',
    departmentSemester: 'Computer Science, 5th Semester',
    leadershipPosition: 'Class Representative (CR)',
    promotionPlan: 'I will share CodeBettle courses in my class groups and arrange a demo session.',
    priorAmbassadorExperience: 'No',
  });
  assert.equal(application.status, 'pending');
  assert.equal(application.whatsapp, '+92 321 7654321');
  assert.equal(application.departmentSemester, 'Computer Science, 5th Semester');
  assert.equal(application.leadershipPosition, 'Class Representative (CR)');
  assert.equal(application.priorAmbassadorExperience, 'No');
  assert.equal((await listAmbassadorApplications({})).total, 1);
  assert.equal((await listAmbassadorApplications({ status: 'pending' })).total, 1);
  const approved = await updateAmbassadorApplicationStatus(application.id, 'approved');
  assert.equal(approved?.status, 'approved');
  const rejected = await updateAmbassadorApplicationStatus(application.id, 'rejected');
  assert.equal(rejected?.status, 'rejected');
  assert.deepEqual(await getAmbassadorApplicationById(application.id), rejected);
  assert.equal(await deleteAmbassadorApplication(application.id), true);
  assert.equal((await listAmbassadorApplications({})).total, 0);
});

test('mappers: the three new rows map to domain shapes', () => {
  const subscriber = mapSubscriberRow({ id: 's1', email: 'a@b.com', createdAt: new Date('2026-11-13') });
  assert.equal(subscriber.email, 'a@b.com');
  assert.equal(subscriber.createdAt, '2026-11-13');
  const booking = mapBookACallRow({
    id: 'b1', fullName: 'Ali', email: 'a@b.com', phone: null, currentStatus: 'student',
    courseInterest: null, guidanceNeeded: 'Help?', preferredContact: null, status: 'new',
    createdAt: new Date('2026-11-13'), updatedAt: new Date('2026-11-13'),
  });
  assert.equal(booking.status, 'new');
  assert.equal(booking.phone, undefined);
  assert.throws(() => bookACallStatusFromStorage('bogus'), /Unknown book-a-call status/);
  const application = mapAmbassadorApplicationRow({
    id: 'a1', fullName: 'Sara', whatsapp: '+92 321 0000000', email: 's@b.com',
    university: 'UAF', departmentSemester: 'CS, 5th', leadershipPosition: 'None / General Student',
    promotionPlan: 'Share in groups.', priorAmbassadorExperience: 'Yes', status: 'pending',
    createdAt: new Date('2026-11-13'), updatedAt: new Date('2026-11-13'),
  });
  assert.equal(application.leadershipPosition, 'None / General Student');
  assert.equal(application.priorAmbassadorExperience, 'Yes');
  assert.throws(() => ambassadorApplicationStatusFromStorage('bogus'), /Unknown ambassador application status/);
});

// ---------------------------------------------------------------------------
// Email templates (PR #33)
// ---------------------------------------------------------------------------

test('book-a-call email carries the booking, never a fee', () => {
  const template = bookACallEmail({
    fullName: 'Ali Khan',
    email: 'ali@example.com',
    phone: '+92 300 1234567',
    currentStatus: 'student',
    courseInterest: 'Python',
    guidanceNeeded: 'Which course should I start with?',
    preferredContact: 'Evenings, WhatsApp',
    adminUrl: 'https://codebettle-web.vercel.app/admin/book-a-call',
    siteUrl: 'https://codebettle-web.vercel.app',
  });
  assert.match(template.subject, /Ali Khan/);
  assert.match(template.html, /Ali Khan/);
  assert.match(template.html, /Which course should I start with/);
  assert.match(template.html, /Evenings, WhatsApp/);
  assert.match(template.text, /ali@example\.com/);
  for (const forbidden of ['fee', 'price', 'pkr', '1500', 'amount', 'paid']) {
    assert.equal(template.html.toLowerCase().includes(forbidden), false, `html must not mention ${forbidden}`);
    assert.equal(template.text.toLowerCase().includes(forbidden), false, `text must not mention ${forbidden}`);
  }
});

test('admin invitation email carries the secret portal link only when given', () => {
  const withPortal = adminInvitationEmail({
    name: 'Ahmad',
    inviteUrl: 'https://codebettle-web.vercel.app/auth/accept-invitation?token=abc',
    expiresInDays: 7,
    portalUrl: 'https://codebettle-web.vercel.app/portal-Xyz/signin',
  });
  assert.match(withPortal.html, /portal-Xyz\/signin/);
  assert.match(withPortal.html, /cannot be found by searching/);
  assert.match(withPortal.html, /Download the link/);
  assert.match(withPortal.text, /portal-Xyz\/signin/);
  const withoutPortal = adminInvitationEmail({
    name: 'Ahmad',
    inviteUrl: 'https://codebettle-web.vercel.app/auth/accept-invitation?token=abc',
    expiresInDays: 7,
  });
  assert.equal(withoutPortal.html.includes('portal-'), false);
  assert.equal(withoutPortal.html.includes('cannot be found by searching'), false);
});
