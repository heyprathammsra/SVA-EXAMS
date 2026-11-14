import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTeachersMappingSheetRows,
  decodeCloudBackupRows,
  encodeCloudBackupRows,
} from './sheets-cloud-store';
import { PersistedErpState } from './erp-persistence';
import { StoredTeacherAccount } from './auth';

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
