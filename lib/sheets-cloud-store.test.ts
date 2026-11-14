import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTeachersMappingSheetRows,
  decodeCloudBackupRows,
  encodeCloudBackupRows,
  mergeCloudBackupForPush,
} from './sheets-cloud-store';
import { PersistedErpState } from './erp-persistence';
import { StoredTeacherAccount } from './auth';
import { GAS_SCRIPT_CODE } from './gas-sync';

test('encodeCloudBackupRows and decodeCloudBackupRows round-trip full ERP state and teacher accounts losslessly', () => {
  const sampleState: PersistedErpState = {
    version: 1,
    initialized: true,
    updatedAt: 1763100000000,
    selectedClass: 'Sparkle',
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
        subjects: [
          { name: 'Science', maxMarks: 100, passMarks: 33 },
          { name: 'Robotics', maxMarks: 50, passMarks: 17 },
        ],
      },
    },
    students: [
      {
        id: 's-1',
        rollNo: '01',
        name: 'Ajinkya Balu Gurav',
        class: '6',
        section: 'Sparkle',
        marks: { Science: null, Robotics: 45 },
        subjectRemarks: { Robotics: 'Excellent innovation' },
      },
    ],
    examMarksStore: {
      'SA-1': { 's-1': { Science: null, Robotics: 45 } },
      'PT-1': { 's-1': { Science: 22 } },
    },
    examBreakdownsStore: {},
  };

  const sampleTeachers: StoredTeacherAccount[] = [
    {
      id: 't-1',
      name: 'Pratham',
      username: 'pratham',
      passwordHashHex: 'deadbeef1234',
      assignedSubject: 'Science',
      assignedClasses: ['Sparkle', 'Diamond'],
      classTeacherOf: null,
      assignments: [
        { section: 'Sparkle', subject: 'Science' },
        { section: 'Diamond', subject: 'Science' },
      ],
      createdAt: 1763000000000,
      updatedAt: 1763100000000,
    },
  ];

  const rows = encodeCloudBackupRows(sampleState, sampleTeachers, 1763100000000);
  assert.ok(rows.length >= 1);
  assert.ok(rows[0].section.startsWith('SVA_CLOUD_V1:'));

  const decoded = decodeCloudBackupRows(rows);
  assert.ok(decoded);
  assert.equal(decoded.updatedAt, 1763100000000);
  assert.equal(decoded.state?.students[0].marks.Science, null);
  assert.equal(decoded.state?.students[0].marks.Robotics, 45);
  assert.equal(decoded.state?.examMarksStore['PT-1']['s-1'].Science, 22);
  assert.equal(decoded.teachers.length, 1);
  assert.equal(decoded.teachers[0].username, 'pratham');
  assert.deepEqual(decoded.teachers[0].assignedClasses, ['Sparkle', 'Diamond']);
});

test('buildTeachersMappingSheetRows formats readable rows for Teachers & Mapping tab', () => {
  const rows = buildTeachersMappingSheetRows([
    {
      id: 't-1',
      name: 'Pratham',
      username: 'pratham',
      assignedSubject: 'Science',
      assignedClasses: ['Sparkle', 'Twinkle'],
      classTeacherOf: null,
      assignments: [
        { section: 'Sparkle', subject: 'Science' },
        { section: 'Twinkle', subject: 'Science' },
      ],
      createdAt: 1000,
      updatedAt: 2000,
    },
    {
      id: 't-2',
      name: 'Anita Sharma',
      username: 'anita',
      assignedSubject: 'English',
      assignedClasses: ['Diamond'],
      classTeacherOf: 'Ruby',
      assignments: [{ section: 'Diamond', subject: 'English' }],
      createdAt: 1000,
      updatedAt: 2000,
    },
  ]);

  assert.equal(rows.length, 2);
  assert.equal(rows[0].rollNo, '@pratham');
  assert.ok(rows[0].name.includes('Not a Class Teacher'));
  assert.ok(rows[0].section.includes('Sparkle, Twinkle'));
  assert.equal(rows[1].rollNo, '@anita');
  assert.ok(rows[1].name.includes('Class Teacher: Ruby'));
});

test('mergeCloudBackupForPush never clobbers non-null cloud state, keeps newer state, and protects teacher edits/deletions', () => {
  const cloudState: PersistedErpState = {
    version: 1,
    initialized: true,
    updatedAt: 5000,
    selectedClass: 'Sparkle',
    selectedExam: 'SA-1',
    classes: [{ id: 'c1', section: 'Sparkle', grade: '6' }],
    examConfigs: {},
    students: [],
    examMarksStore: {},
    examBreakdownsStore: {},
  };

  const olderTeacher: StoredTeacherAccount = {
    id: 't-1',
    name: 'Pratham',
    username: 'pratham',
    passwordHashHex: 'hash1',
    assignedSubject: 'Science',
    assignedClasses: ['Diamond'],
    classTeacherOf: null,
    assignments: [{ section: 'Diamond', subject: 'Science' }],
    createdAt: 1000,
    updatedAt: 1000,
  };

  const newerTeacher: StoredTeacherAccount = {
    ...olderTeacher,
    assignedSubject: 'Computer Science',
    assignedClasses: ['Sparkle', 'Twinkle'],
    assignments: [
      { section: 'Sparkle', subject: 'Computer Science' },
      { section: 'Twinkle', subject: 'Computer Science' },
    ],
    updatedAt: 6000,
  };

  const existingCloud = {
    v: 1 as const,
    updatedAt: 6000,
    state: cloudState,
    teachers: [newerTeacher],
  };

  // 1. Incoming null state (e.g., teacher mutation on cold container) preserves existing cloud state
  const preserveStateRes = mergeCloudBackupForPush({
    incomingState: null,
    incomingTeachers: [newerTeacher],
    existingCloud,
    nowMs: 5500,
    authoritativeTeachers: true,
  });
  assert.equal(preserveStateRes.state?.updatedAt, 5000);
  // Also guarantees strictly increasing updatedAt over existingCloud.updatedAt (6000)
  assert.equal(preserveStateRes.updatedAt, 6001);

  // 2. Non-authoritative state push with stale teachers keeps newer cloud teachers
  const clearedState: PersistedErpState = { ...cloudState, updatedAt: 7000 };
  const protectTeachersRes = mergeCloudBackupForPush({
    incomingState: clearedState,
    incomingTeachers: [olderTeacher],
    existingCloud,
    nowMs: 7000,
    authoritativeTeachers: false,
  });
  assert.equal(protectTeachersRes.state?.updatedAt, 7000);
  assert.equal(protectTeachersRes.teachers[0].assignedSubject, 'Computer Science');

  // 3. Stale incoming state cannot regress newer cloud state
  const staleStateRes = mergeCloudBackupForPush({
    incomingState: { ...cloudState, updatedAt: 4000, selectedClass: 'Ruby' },
    incomingTeachers: [newerTeacher],
    existingCloud,
    nowMs: 7000,
    authoritativeTeachers: false,
  });
  assert.equal(staleStateRes.state?.selectedClass, 'Sparkle');
  assert.equal(staleStateRes.state?.updatedAt, 5000);

  // 4. Authoritative teacher deletion replaces existing cloud roster even with smaller list
  const deleteTeacherRes = mergeCloudBackupForPush({
    incomingState: cloudState,
    incomingTeachers: [olderTeacher],
    existingCloud: {
      ...existingCloud,
      teachers: [olderTeacher, newerTeacher],
    },
    nowMs: 8000,
    authoritativeTeachers: true,
  });
  assert.equal(deleteTeacherRes.teachers.length, 1);
  assert.equal(deleteTeacherRes.updatedAt, 8000);
});

test('decodeCloudBackupRows strips leading apostrophes escaped by Google Sheets and GAS_SCRIPT_CODE v3.0 includes locking/escaping', () => {
  const sampleState: PersistedErpState = {
    version: 1,
    initialized: true,
    updatedAt: 1763200000000,
    selectedClass: 'Sparkle',
    selectedExam: 'SA-1',
    classes: [{ id: 'c1', section: 'Sparkle', grade: '6' }],
    examConfigs: {},
    students: [],
    examMarksStore: {},
    examBreakdownsStore: {},
  };
  const encoded = encodeCloudBackupRows(sampleState, [], 1763200000000);
  const apostrophePrefixed = encoded.map((row) => ({
    ...row,
    name: `'${row.name}`,
  }));

  const decoded = decodeCloudBackupRows(apostrophePrefixed);
  assert.ok(decoded);
  assert.equal(decoded.updatedAt, 1763200000000);
  assert.equal(decoded.state?.selectedClass, 'Sparkle');

  // Verify v3.0 Apps Script invariants
  assert.ok(GAS_SCRIPT_CODE.includes('v3.0'));
  assert.ok(GAS_SCRIPT_CODE.includes('LockService.getScriptLock()'));
  assert.ok(GAS_SCRIPT_CODE.includes('SpreadsheetApp.flush()'));
  assert.ok(GAS_SCRIPT_CODE.includes('safeSheetTextValue'));
  assert.ok(GAS_SCRIPT_CODE.includes('setNumberFormat("@")'));
  assert.ok(GAS_SCRIPT_CODE.includes('"Teachers & Mapping"'));
  assert.ok(GAS_SCRIPT_CODE.includes('"Mapped Classes"'));
});
