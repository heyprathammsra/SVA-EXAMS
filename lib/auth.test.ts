import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  authenticateUserCredentials,
  checkLoginRateLimit,
  clearLoginFailures,
  createSessionToken,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_TEACHER_PASSWORD,
  deleteTeacherUser,
  extractBearerToken,
  getConfiguredAdminPassword,
  getConfiguredTeacherPassword,
  getTeacherProfileByUsername,
  recordLoginFailure,
  resetAllLoginRateLimits,
  syncTeacherMappingsOnClassDelete,
  syncTeacherMappingsOnClassRename,
  syncTeacherMappingsOnSubjectRename,
  upsertTeacherUser,
  verifyAdminPassword,
  verifySessionToken,
} from './auth';
import {
  computeStateHmac,
  sanitizeAndValidateErpState,
  sanitizeMarkValue,
  verifyStateHmac,
} from './erp-security';
import { PersistedErpState } from './erp-persistence';

test('configured passwords default to sva0pass for admin and sva#2026 for pratham', () => {
  assert.equal(getConfiguredAdminPassword({}), 'sva0pass');
  assert.equal(DEFAULT_ADMIN_PASSWORD, 'sva0pass');
  assert.equal(getConfiguredTeacherPassword({}), 'sva#2026');
  assert.equal(DEFAULT_TEACHER_PASSWORD, 'sva#2026');
});

test('authenticateUserCredentials authenticates admin and teacher pratham with exact passwords and roles', () => {
  // Admin login
  const adminRes = authenticateUserCredentials('admin', 'sva0pass', {});
  assert.equal(adminRes.authenticated, true);
  assert.equal(adminRes.role, 'admin');
  assert.equal(adminRes.username, 'admin');

  // Admin case-insensitive username
  const adminUpper = authenticateUserCredentials('ADMIN', 'sva0pass', {});
  assert.equal(adminUpper.authenticated, true);
  assert.equal(adminUpper.role, 'admin');

  // Teacher pratham login
  const teacherRes = authenticateUserCredentials('pratham', 'sva#2026', {});
  assert.equal(teacherRes.authenticated, true);
  assert.equal(teacherRes.role, 'teacher');
  assert.equal(teacherRes.username, 'pratham');

  const teacherUpper = authenticateUserCredentials('Pratham', 'sva#2026', {});
  assert.equal(teacherUpper.authenticated, true);
  assert.equal(teacherUpper.role, 'teacher');

  // Cross-credential or wrong password attempts fail
  assert.equal(authenticateUserCredentials('pratham', 'sva0pass', {}).authenticated, false);
  assert.equal(authenticateUserCredentials('admin', 'sva#2026', {}).authenticated, false);
  assert.equal(authenticateUserCredentials('student', 'sva#2026', {}).authenticated, false);
  assert.equal(authenticateUserCredentials('pratham', 'SVA#2026', {}).authenticated, false);
  assert.equal(authenticateUserCredentials('admin', 'wrong', {}).authenticated, false);
});

test('verifyAdminPassword validates exact password in constant time', () => {
  assert.equal(verifyAdminPassword('sva0pass', 'sva0pass'), true);
  assert.equal(verifyAdminPassword('SVA0PASS', 'sva0pass'), false);
  assert.equal(verifyAdminPassword('', 'sva0pass'), false);
});

test('createSessionToken and verifySessionToken preserve role and reject tampering', () => {
  const now = 1_760_000_000_000;
  const secret = 'unit-test-hmac-secret-key-123456';

  const teacherToken = createSessionToken({
    username: 'pratham',
    role: 'teacher',
    nowMs: now,
    ttlSeconds: 3600,
    secret,
  });

  const verifiedTeacher = verifySessionToken(teacherToken, { nowMs: now + 1000, secret });
  assert.ok(verifiedTeacher);
  assert.equal(verifiedTeacher.role, 'teacher');
  assert.equal(verifiedTeacher.sub, 'pratham');

  // Attempt to tamper payload to escalate role from teacher to admin
  const [, sig] = teacherToken.split('.');
  const forgedPayload = Buffer.from(
    JSON.stringify({ sub: 'pratham', role: 'admin', iat: now / 1000, exp: now / 1000 + 3600 })
  ).toString('base64url');
  assert.equal(verifySessionToken(`${forgedPayload}.${sig}`, { nowMs: now, secret }), null);
});

test('login rate limiter locks out client after 5 failed attempts and resets on clear', () => {
  resetAllLoginRateLimits();
  const now = 1_760_000_000_000;
  const ip = '192.0.2.55';

  for (let i = 1; i <= 4; i++) {
    const res = recordLoginFailure(ip, now);
    assert.equal(res.locked, false);
    assert.equal(checkLoginRateLimit(ip, now).allowed, true);
  }

  const fifth = recordLoginFailure(ip, now);
  assert.equal(fifth.locked, true);
  const checkBlocked = checkLoginRateLimit(ip, now + 1000);
  assert.equal(checkBlocked.allowed, false);
  assert.ok(checkBlocked.retryAfterSeconds > 200);

  // Unlocks after lockout window expires
  assert.equal(checkLoginRateLimit(ip, now + 6 * 60 * 1000).allowed, true);

  clearLoginFailures(ip);
  resetAllLoginRateLimits();
});

test('sanitizeAndValidateErpState clamps out-of-range marks and prevents teacher from altering examConfigs or deleting students', () => {
  const existingState: PersistedErpState = {
    version: 1,
    initialized: true,
    updatedAt: 1000,
    selectedClass: 'Diamond',
    selectedExam: 'PT-1',
    classes: [{ id: 'c1', section: 'Diamond', grade: '9' }],
    examConfigs: {
      'PT-1': {
        id: 'PT-1',
        name: 'PT-1',
        code: 'PT-1',
        totalFormula: 'SUM',
        subjects: [{ name: 'Maths', maxMarks: 25, passMarks: 8 }],
      },
    },
    students: [
      {
        id: 'stu-1',
        rollNo: '01',
        name: 'Aarav Sharma',
        class: '9',
        section: 'Diamond',
        marks: { Maths: 18 },
      },
      {
        id: 'stu-2',
        rollNo: '02',
        name: 'Vivaan Verma',
        class: '9',
        section: 'Diamond',
        marks: { Maths: 20 },
      },
    ],
    examMarksStore: {
      'PT-1': {
        'stu-1': { Maths: 18 },
        'stu-2': { Maths: 20 },
      },
    },
    examBreakdownsStore: {},
  };

  // Simulated tampered payload from a non-admin session trying to:
  // 1) Change PT-1 maxMarks to 100
  // 2) Set stu-1 Maths mark to 999 (above 25 max)
  // 3) Delete stu-2 from roster
  // 4) Spoof updatedAt to year 2099
  const tamperedIncoming: PersistedErpState = {
    ...existingState,
    updatedAt: 9999999999999,
    examConfigs: {
      'PT-1': {
        id: 'PT-1',
        name: 'Hacked PT-1',
        code: 'PT-1',
        totalFormula: 'SUM',
        subjects: [{ name: 'Maths', maxMarks: 100, passMarks: 1 }],
      },
    },
    students: [
      {
        id: 'stu-1',
        rollNo: '01',
        name: '<script>alert(1)</script>Hacked Name',
        class: '9',
        section: 'Diamond',
        marks: { Maths: 999 },
      },
    ],
    examMarksStore: {
      'PT-1': {
        'stu-1': { Maths: 999 },
      },
    },
  };

  const sanitized = sanitizeAndValidateErpState(
    tamperedIncoming,
    existingState,
    'teacher',
    5000
  );

  // 1. Server timestamp enforced
  assert.equal(sanitized.updatedAt, 5000);
  // 2. Teacher cannot overwrite examConfigs maxMarks
  assert.equal(sanitized.examConfigs['PT-1'].subjects[0].maxMarks, 25);
  // 3. Marks clamped to authoritative maxMarks (25)
  assert.equal(sanitized.students[0].marks.Maths, 25);
  assert.equal(sanitized.examMarksStore['PT-1']['stu-1'].Maths, 25);
  // 4. Student name protected & stu-2 preserved
  assert.equal(sanitized.students[0].name, 'Aarav Sharma');
  assert.equal(sanitized.students.length, 2);
});

test('sanitizeMarkValue and state HMAC integrity verification work accurately', () => {
  assert.equal(sanitizeMarkValue(120, 100), 100);
  assert.equal(sanitizeMarkValue(-15, 100), 0);
  assert.equal(sanitizeMarkValue('ab', 100), 'AB');
  assert.equal(sanitizeMarkValue('', 100), null);

  assert.equal(extractBearerToken('Bearer my-token'), 'my-token');

  const dummyState: PersistedErpState = {
    version: 1,
    initialized: true,
    updatedAt: 12345,
    selectedClass: 'Diamond',
    selectedExam: 'SA-1',
    classes: [],
    examConfigs: {},
    students: [],
    examMarksStore: {},
    examBreakdownsStore: {},
  };
  const sig = computeStateHmac(dummyState, 'secret-123');
  assert.equal(verifyStateHmac(dummyState, sig, 'secret-123'), true);
  assert.equal(verifyStateHmac({ ...dummyState, updatedAt: 99999 }, sig, 'secret-123'), false);
});

test('sanitizeAndValidateErpState enforces per-class subject mapping and Class Teacher read-only rule on server', () => {
  const existingState: PersistedErpState = {
    version: 1,
    initialized: true,
    updatedAt: 1000,
    selectedClass: 'Sparkle',
    selectedExam: 'PT-1',
    classes: [
      { id: 'c1', section: 'Sparkle', grade: '6' },
      { id: 'c2', section: 'Twinkle', grade: '6' },
    ],
    examConfigs: {
      'PT-1': {
        id: 'PT-1',
        name: 'PT-1',
        code: 'PT-1',
        totalFormula: 'SUM',
        subjects: [
          { name: 'Science', maxMarks: 25, passMarks: 8 },
          { name: 'Maths', maxMarks: 25, passMarks: 8 },
        ],
      },
    },
    students: [
      {
        id: 's-sparkle',
        rollNo: '01',
        name: 'Aarav Sparkle',
        class: '6',
        section: 'Sparkle',
        marks: { Science: 15, Maths: 20 },
        subjectRemarks: { Science: 'Old Sci', Maths: 'Old Maths' },
        remarks: 'Old CT Remark Sparkle',
      },
      {
        id: 's-twinkle',
        rollNo: '01',
        name: 'Diya Twinkle',
        class: '6',
        section: 'Twinkle',
        marks: { Science: 18, Maths: 22 },
        subjectRemarks: { Science: 'Twinkle Sci', Maths: 'Twinkle Maths' },
        remarks: 'Twinkle CT Remark',
      },
    ],
    examMarksStore: {
      'PT-1': {
        's-sparkle': { Science: 15, Maths: 20 },
        's-twinkle': { Science: 18, Maths: 22 },
      },
    },
    examBreakdownsStore: {},
  };

  // Teacher mapped ONLY to Science in Sparkle, and Class Teacher of Twinkle (view-only in Twinkle)
  const teacherProfile = {
    username: 'anita',
    name: 'Anita Teacher',
    assignedSubject: 'Science',
    assignedClasses: ['Sparkle'],
    classTeacherOf: 'Twinkle',
    assignments: [{ section: 'Sparkle', subject: 'Science' }],
    createdAt: 1000,
    updatedAt: 1000,
  };

  // Teacher attempts to modify:
  // - Sparkle Science -> 24 & 'Updated Sci' (ALLOWED)
  // - Sparkle Maths -> 25 & 'Hacked Maths' (BLOCKED)
  // - Twinkle Science & Maths -> 25 & 'Hacked Twinkle' (BLOCKED: Class Teacher is view-only)
  const incomingAttempt: PersistedErpState = {
    ...existingState,
    students: [
      {
        ...existingState.students[0],
        marks: { Science: 24, Maths: 25 },
        subjectRemarks: { Science: 'Updated Sci', Maths: 'Hacked Maths' },
        remarks: 'Hacked CT Remark Sparkle',
      },
      {
        ...existingState.students[1],
        marks: { Science: 25, Maths: 25 },
        subjectRemarks: { Science: 'Hacked Twinkle Sci', Maths: 'Hacked Twinkle Maths' },
        remarks: 'Hacked Twinkle CT Remark',
      },
    ],
    examMarksStore: {
      'PT-1': {
        's-sparkle': { Science: 24, Maths: 25 },
        's-twinkle': { Science: 25, Maths: 25 },
      },
    },
  };

  const result = sanitizeAndValidateErpState(
    incomingAttempt,
    existingState,
    'teacher',
    2000,
    teacherProfile
  );

  // Sparkle Science was updated, Maths & overall remarks stayed untouched
  assert.equal(result.students[0].marks.Science, 24);
  assert.equal(result.students[0].marks.Maths, 20);
  assert.equal(result.students[0].subjectRemarks?.Science, 'Updated Sci');
  assert.equal(result.students[0].subjectRemarks?.Maths, 'Old Maths');
  assert.equal(result.students[0].remarks, 'Old CT Remark Sparkle');

  // Twinkle (Class Teacher view-only) marks and remarks stayed 100% untouched
  assert.equal(result.students[1].marks.Science, 18);
  assert.equal(result.students[1].marks.Maths, 22);
  assert.equal(result.students[1].subjectRemarks?.Science, 'Twinkle Sci');
  assert.equal(result.students[1].remarks, 'Twinkle CT Remark');
});

test('upsertTeacherUser, deleteTeacherUser, and Admin class/subject rename/delete sync persist cleanly', () => {
  const usersFile = path.join(process.cwd(), '.data', 'erp-users.json');
  const hadBackup = fs.existsSync(usersFile);
  const backupContent = hadBackup ? fs.readFileSync(usersFile, 'utf8') : null;

  try {
    const created = upsertTeacherUser({
      name: 'Temp Teacher',
      username: 'tempteacher_unit',
      password: 'temp#2026',
      assignedSubject: 'Maths',
      assignedClasses: ['Sparkle', 'Topaz'],
      classTeacherOf: 'Sparkle',
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    assert.equal(created.teacher.classTeacherOf, 'Sparkle');
    assert.deepEqual(created.teacher.assignedClasses, ['Sparkle', 'Topaz']);

    const renamedClass = syncTeacherMappingsOnClassRename('Sparkle', 'LotusTemp');
    const updated1 = renamedClass.find((t) => t.username === 'tempteacher_unit');
    assert.ok(updated1);
    assert.equal(updated1.classTeacherOf, 'LotusTemp');
    assert.deepEqual(updated1.assignedClasses, ['LotusTemp', 'Topaz']);

    const renamedSub = syncTeacherMappingsOnSubjectRename('Maths', 'Mathematics');
    const updated2 = renamedSub.find((t) => t.username === 'tempteacher_unit');
    assert.ok(updated2);
    assert.equal(updated2.assignedSubject, 'Mathematics');

    const deletedClass = syncTeacherMappingsOnClassDelete('LotusTemp');
    const updated3 = deletedClass.find((t) => t.username === 'tempteacher_unit');
    assert.ok(updated3);
    assert.equal(updated3.classTeacherOf, null);
    assert.deepEqual(updated3.assignedClasses, ['Topaz']);

    const removed = deleteTeacherUser('tempteacher_unit');
    assert.equal(removed.ok, true);
    assert.equal(getTeacherProfileByUsername('tempteacher_unit'), null);
  } finally {
    if (hadBackup && backupContent !== null) {
      fs.writeFileSync(usersFile, backupContent, 'utf8');
    } else if (fs.existsSync(usersFile)) {
      fs.unlinkSync(usersFile);
    }
  }
});

test('sanitizeAndValidateErpState preserves server SA-1 marks when teacher saves PT-1 marks and keeps server selectedExam/selectedClass', () => {
  const existingState: PersistedErpState = {
    version: 1,
    initialized: true,
    updatedAt: 1000,
    selectedClass: 'Diamond',
    selectedExam: 'SA-1',
    classes: [
      { id: 'c1', section: 'Sparkle', grade: '6' },
      { id: 'c2', section: 'Diamond', grade: '9' },
    ],
    examConfigs: {
      'SA-1': {
        id: 'SA-1',
        name: 'SA-1',
        code: 'SA-1',
        totalFormula: 'SUM',
        subjects: [{ name: 'Science', maxMarks: 100, passMarks: 33 }],
      },
      'PT-1': {
        id: 'PT-1',
        name: 'PT-1',
        code: 'PT-1',
        totalFormula: 'SUM',
        subjects: [{ name: 'Science', maxMarks: 25, passMarks: 8 }],
      },
    },
    students: [
      {
        id: 's-1',
        rollNo: '01',
        name: 'Aarav Sparkle',
        class: '6',
        section: 'Sparkle',
        marks: { Science: 88 },
      },
    ],
    examMarksStore: {
      'SA-1': { 's-1': { Science: 88 } },
      'PT-1': { 's-1': { Science: 14 } },
    },
    examBreakdownsStore: {},
  };

  const teacherProfile = {
    username: 'pratham',
    name: 'Pratham',
    assignedSubject: 'Science',
    assignedClasses: ['Sparkle'],
    classTeacherOf: null,
    assignments: [{ section: 'Sparkle', subject: 'Science' }],
    createdAt: 1000,
    updatedAt: 1000,
  };

  // Teacher switches to PT-1 in Sparkle and saves 23/25 for Science
  const incomingFromTeacher: PersistedErpState = {
    ...existingState,
    selectedClass: 'Sparkle',
    selectedExam: 'PT-1',
    students: [
      {
        ...existingState.students[0],
        marks: { Science: 23 },
      },
    ],
    examMarksStore: {
      'SA-1': { 's-1': { Science: 88 } },
      'PT-1': { 's-1': { Science: 23 } },
    },
  };

  const sanitized = sanitizeAndValidateErpState(
    incomingFromTeacher,
    existingState,
    'teacher',
    3000,
    teacherProfile
  );

  // Server selectedExam and selectedClass remain Admin's ('SA-1' and 'Diamond')
  assert.equal(sanitized.selectedExam, 'SA-1');
  assert.equal(sanitized.selectedClass, 'Diamond');
  // PT-1 store has the teacher's new mark (23)
  assert.equal(sanitized.examMarksStore['PT-1']['s-1'].Science, 23);
  // SA-1 store and active SA-1 students array retain 88 (never overwritten by PT-1's 23!)
  assert.equal(sanitized.examMarksStore['SA-1']['s-1'].Science, 88);
  assert.equal(sanitized.students[0].marks.Science, 88);
});


