import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SVA_STORAGE_KEYS,
  PersistedErpState,
  createDefaultErpState,
  parseStoredErpState,
  pickAuthoritativeState,
  switchExamState,
  parseSpreadsheetMarkInput,
  scaleComponentsToMaxMarks,
  migrateRenamedSubjectInStudents,
  sanitizePtExamConfigs,
} from './erp-persistence';
import {
  ExamConfig,
  StudentReportRow,
  getDefaultSubjectComponents,
  syncBreakdownWithTotal,
} from './report-card-types';

const SAMPLE_CONFIGS: Record<string, ExamConfig> = {
  'SA-1': {
    id: 'SA-1',
    name: 'Summative Assessment 1',
    code: 'SA-1',
    totalFormula: 'SUM',
    subjects: [
      {
        name: 'English',
        maxMarks: 100,
        passMarks: 32,
        components: [
          { key: 'writtenExam', label: 'SA Exam', maxMarks: 80, isMainExam: true },
          { key: 'internalMarks', label: 'Internal', maxMarks: 20, isMainExam: false },
        ],
      },
      {
        name: 'Maths',
        maxMarks: 100,
        passMarks: 32,
        components: [
          { key: 'writtenExam', label: 'SA Exam', maxMarks: 80, isMainExam: true },
          { key: 'internalMarks', label: 'Internal', maxMarks: 20, isMainExam: false },
        ],
      },
    ],
  },
  'PT-1': {
    id: 'PT-1',
    name: 'Periodic Test 1',
    code: 'PT-1',
    totalFormula: 'SUM',
    subjects: [
      { name: 'English', maxMarks: 25, passMarks: 8 },
      { name: 'Maths', maxMarks: 25, passMarks: 8 },
    ],
  },
  'PT-4': {
    id: 'PT-4',
    name: 'Periodic Test 4',
    code: 'PT-4',
    totalFormula: 'SUM',
    subjects: [
      { name: 'English', maxMarks: 25, passMarks: 8 },
      { name: 'Maths', maxMarks: 25, passMarks: 8 },
    ],
  },
};

const SAMPLE_STUDENTS: StudentReportRow[] = [
  {
    id: 'STU-1',
    rollNo: '01',
    name: 'Aarav Sharma',
    admissionNo: 'ADM-001',
    class: 'IX',
    section: 'Diamond',
    marks: { English: 88, Maths: 92 },
  },
  {
    id: 'STU-2',
    rollNo: '02',
    name: 'Diya Kulkarni',
    admissionNo: 'ADM-002',
    class: 'VIII',
    section: 'Coral',
    marks: { English: 76, Maths: 84 },
  },
];

const getClassNumber = (sec: string) => (sec === 'Diamond' ? 'IX' : 'VIII');

test('createDefaultErpState builds isolated per-exam stores and preserves sample structure', () => {
  const state = createDefaultErpState(SAMPLE_CONFIGS, SAMPLE_STUDENTS, getClassNumber);
  assert.equal(state.initialized, false);
  assert.equal(state.updatedAt, 0);
  assert.equal(state.selectedClass, 'Diamond');
  assert.equal(state.selectedExam, 'SA-1');
  assert.equal(state.students.length, 2);
  assert.equal(state.examMarksStore['SA-1']['STU-1'].English, 88);
  // Scaled to 25 for PT-1
  assert.equal(state.examMarksStore['PT-1']['STU-1'].English, 22);
});

test('parseStoredErpState preserves empty student roster [] and deleted default exams without resurrection', () => {
  const defaultState = createDefaultErpState(SAMPLE_CONFIGS, SAMPLE_STUDENTS, getClassNumber);

  // User deleted all students and deleted PT-4, added UT-CUSTOM, and switched to UT-CUSTOM
  const customConfigs: Record<string, ExamConfig> = {
    'SA-1': SAMPLE_CONFIGS['SA-1'],
    'PT-1': SAMPLE_CONFIGS['PT-1'],
    'UT-CUSTOM': {
      id: 'UT-CUSTOM',
      name: 'Unit Test Custom',
      code: 'UT-CUSTOM',
      totalFormula: 'BEST_5',
      subjects: [{ name: 'English', maxMarks: 50, passMarks: 17 }],
    },
  };

  const rawStorage: Record<string, string> = {
    [SVA_STORAGE_KEYS.INIT_FLAG]: '1',
    [SVA_STORAGE_KEYS.STUDENTS]: JSON.stringify([]),
    [SVA_STORAGE_KEYS.EXAM_CONFIGS]: JSON.stringify(customConfigs),
    [SVA_STORAGE_KEYS.SELECTED_EXAM]: 'UT-CUSTOM',
    [SVA_STORAGE_KEYS.SELECTED_CLASS]: 'Coral',
    [SVA_STORAGE_KEYS.UPDATED_AT]: '1700000123456',
    [SVA_STORAGE_KEYS.EXAM_MARKS_STORE]: JSON.stringify({ 'SA-1': {}, 'PT-1': {}, 'UT-CUSTOM': {} }),
    [SVA_STORAGE_KEYS.EXAM_BREAKDOWNS_STORE]: JSON.stringify({}),
  };

  const parsed = parseStoredErpState(rawStorage, defaultState, ['Diamond', 'Coral']);
  assert.equal(parsed.hasSavedData, true);
  assert.ok(parsed.state);
  assert.equal(parsed.state.students.length, 0);
  assert.equal('PT-4' in parsed.state.examConfigs, false);
  assert.equal('UT-CUSTOM' in parsed.state.examConfigs, true);
  assert.equal(parsed.state.selectedExam, 'UT-CUSTOM');
  assert.equal(parsed.state.selectedClass, 'Coral');
  assert.equal(parsed.state.updatedAt, 1700000123456);
});

test('parseStoredErpState handles corrupt JSON gracefully without losing valid siblings', () => {
  const defaultState = createDefaultErpState(SAMPLE_CONFIGS, SAMPLE_STUDENTS, getClassNumber);
  const customStudents: StudentReportRow[] = [
    { ...SAMPLE_STUDENTS[0], name: 'Saved Name Preserved' },
  ];

  const parsed = parseStoredErpState(
    {
      [SVA_STORAGE_KEYS.INIT_FLAG]: '1',
      [SVA_STORAGE_KEYS.STUDENTS]: JSON.stringify(customStudents),
      [SVA_STORAGE_KEYS.EXAM_CONFIGS]: '{bad json',
      [SVA_STORAGE_KEYS.SELECTED_EXAM]: 'SA-1',
      [SVA_STORAGE_KEYS.SELECTED_CLASS]: 'Diamond',
    },
    defaultState,
    ['Diamond', 'Coral']
  );

  assert.equal(parsed.hasSavedData, true);
  assert.ok(parsed.state);
  assert.equal(parsed.state.students[0].name, 'Saved Name Preserved');
  assert.deepEqual(Object.keys(parsed.state.examConfigs), ['SA-1', 'PT-1', 'PT-4']);
});

test('pickAuthoritativeState chooses initialized state with newer updatedAt', () => {
  const defaultState = createDefaultErpState(SAMPLE_CONFIGS, SAMPLE_STUDENTS, getClassNumber);
  const older: PersistedErpState = { ...defaultState, initialized: true, updatedAt: 1000 };
  const newer: PersistedErpState = {
    ...defaultState,
    initialized: true,
    updatedAt: 2000,
    selectedClass: 'Coral',
  };
  const uninitialized: PersistedErpState = { ...defaultState, initialized: false, updatedAt: 999999 };

  assert.equal(pickAuthoritativeState(older, newer)?.selectedClass, 'Coral');
  assert.equal(pickAuthoritativeState(newer, older)?.selectedClass, 'Coral');
  assert.equal(pickAuthoritativeState(older, uninitialized)?.updatedAt, 1000);
  assert.equal(pickAuthoritativeState(uninitialized, null), null);
});

test('switchExamState isolates custom exams and new students without cross-exam mark leakage', () => {
  const defaultState = createDefaultErpState(SAMPLE_CONFIGS, SAMPLE_STUDENTS, getClassNumber);
  const customExam: ExamConfig = {
    id: 'CUSTOM-TEST',
    name: 'Custom Test',
    code: 'CUSTOM-TEST',
    totalFormula: 'SUM',
    subjects: [
      { name: 'English', maxMarks: 50, passMarks: 17 },
      { name: 'Maths', maxMarks: 50, passMarks: 17 },
    ],
  };

  // Add a brand new student while on SA-1 with marks 95
  const newStu: StudentReportRow = {
    id: 'STU-NEW',
    rollNo: '03',
    name: 'New Student',
    admissionNo: 'ADM-003',
    class: 'IX',
    section: 'Diamond',
    marks: { English: 95, Maths: 96 },
  };
  const activeRoster = [...defaultState.students, newStu];

  const switched = switchExamState({
    students: activeRoster,
    currentExam: 'SA-1',
    targetExam: 'CUSTOM-TEST',
    examConfigs: { ...defaultState.examConfigs, 'CUSTOM-TEST': customExam },
    initialConfigs: SAMPLE_CONFIGS,
    examMarksStore: defaultState.examMarksStore,
    examBreakdownsStore: defaultState.examBreakdownsStore,
    overrideTargetConfig: customExam,
  });

  // SA-1 marks were snapshot-saved before switching
  assert.equal(switched.nextMarksStore['SA-1']['STU-NEW'].English, 95);
  // Target CUSTOM-TEST must NOT inherit 95 or 88 from SA-1; must start null
  const stu1Custom = switched.nextRoster.find((s) => s.id === 'STU-1');
  const stuNewCustom = switched.nextRoster.find((s) => s.id === 'STU-NEW');
  assert.equal(stu1Custom?.marks.English, null);
  assert.equal(stuNewCustom?.marks.English, null);

  // Now enter marks on CUSTOM-TEST and switch back to SA-1
  const editedCustomRoster = switched.nextRoster.map((s) =>
    s.id === 'STU-NEW' ? { ...s, marks: { ...s.marks, English: 45, Maths: 'AB' as const } } : s
  );
  const switchedBack = switchExamState({
    students: editedCustomRoster,
    currentExam: 'CUSTOM-TEST',
    targetExam: 'SA-1',
    examConfigs: { ...defaultState.examConfigs, 'CUSTOM-TEST': customExam },
    initialConfigs: SAMPLE_CONFIGS,
    examMarksStore: switched.nextMarksStore,
    examBreakdownsStore: switched.nextBreakdownsStore,
  });

  const stuNewSa1 = switchedBack.nextRoster.find((s) => s.id === 'STU-NEW');
  assert.equal(stuNewSa1?.marks.English, 95);
  assert.equal(switchedBack.nextMarksStore['CUSTOM-TEST']['STU-NEW'].Maths, 'AB');
});

test('parseSpreadsheetMarkInput handles AB typing, clamping, blank, and ignores stray invalid text', () => {
  assert.deepEqual(parseSpreadsheetMarkInput('', 100, 80), { valid: true, value: null });
  assert.deepEqual(parseSpreadsheetMarkInput('a', 100, null), { valid: true, value: 'AB' });
  assert.deepEqual(parseSpreadsheetMarkInput('ab', 100, null), { valid: true, value: 'AB' });
  assert.deepEqual(parseSpreadsheetMarkInput('ABb', 100, 'AB'), { valid: true, value: 'AB' });
  assert.deepEqual(parseSpreadsheetMarkInput('120', 80, 50), { valid: true, value: 80 });
  assert.deepEqual(parseSpreadsheetMarkInput('-5', 100, 50), { valid: true, value: 0 });
  assert.deepEqual(parseSpreadsheetMarkInput('abc', 100, 72), { valid: false, value: 72 });
});

test('scaleComponentsToMaxMarks scales multi-component weights proportionally to new total', () => {
  const scaled = scaleComponentsToMaxMarks(
    [
      { key: 'writtenExam', label: 'SA Exam', maxMarks: 80, isMainExam: true },
      { key: 'internalMarks', label: 'Internal', maxMarks: 20, isMainExam: false },
    ],
    50
  );
  assert.ok(scaled);
  assert.equal(scaled.reduce((s, c) => s + c.maxMarks, 0), 50);
  assert.equal(scaled[0].maxMarks, 40);
  assert.equal(scaled[1].maxMarks, 10);
});

test('migrateRenamedSubjectInStudents migrates marks, breakdowns, remarks, and store entries', () => {
  const students: StudentReportRow[] = [
    {
      ...SAMPLE_STUDENTS[0],
      marks: { English: 88, Maths: 92 },
      breakdowns: { Maths: { writtenExam: 74, internalMarks: 18 } },
      subjectRemarks: { Maths: 'Strong algebra' },
    },
  ];
  const migrated = migrateRenamedSubjectInStudents({
    students,
    examMarksStore: {
      'SA-1': { 'STU-1': { English: 88, Maths: 92 } },
      'PT-1': { 'STU-1': { English: 22, Maths: 24 } },
    },
    examBreakdownsStore: {
      'SA-1': { 'STU-1': { Maths: { writtenExam: 74, internalMarks: 18 } } },
    },
    examId: 'SA-1',
    activeExamId: 'SA-1',
    oldName: 'Maths',
    newName: 'Mathematics',
  });

  assert.equal(migrated.students[0].marks.Mathematics, 92);
  assert.equal('Maths' in migrated.students[0].marks, false);
  assert.equal(migrated.students[0].breakdowns?.Mathematics?.writtenExam, 74);
  assert.equal(migrated.students[0].subjectRemarks?.Mathematics, 'Strong algebra');
  assert.equal(migrated.examMarksStore['SA-1']['STU-1'].Mathematics, 92);
  // Other exams untouched
  assert.equal(migrated.examMarksStore['PT-1']['STU-1'].Maths, 24);
});

test('sanitizePtExamConfigs removes Computer Science from base PT subjects without breaking custom max marks', () => {
  const cleaned = sanitizePtExamConfigs({
    'PT-1': {
      id: 'PT-1',
      name: 'Periodic Test 1',
      code: 'PT-1',
      totalFormula: 'SUM',
      subjects: [
        { name: 'English', maxMarks: 30, passMarks: 10 },
        { name: 'Computer Science', maxMarks: 30, passMarks: 10 },
      ],
    },
  });
  assert.equal(cleaned['PT-1'].subjects.length, 1);
  assert.equal(cleaned['PT-1'].subjects[0].maxMarks, 30);
});

test('syncBreakdownWithTotal keeps internalMarks aligned with 4-part internal sub-components when total changes', () => {
  const englishComps = getDefaultSubjectComponents('English', 'SA-1');
  const existing = {
    penPaper: 4,
    multipleAssessment: 5,
    subjectEnrichment: 5,
    portfolio: 5,
    internalMarks: 19,
    writtenExam: 67,
  };
  const updated = syncBreakdownWithTotal(95, 'English', 'Diamond', englishComps, existing);
  assert.ok(updated);
  assert.equal(updated.penPaper, 4);
  assert.equal(updated.multipleAssessment, 5);
  assert.equal(updated.subjectEnrichment, 5);
  assert.equal(updated.portfolio, 5);
  assert.equal(updated.internalMarks, 19);
  assert.equal(updated.writtenExam, 76);
  assert.equal(Number(updated.internalMarks) + Number(updated.writtenExam), 95);
});

test('removeStudentFromErpStores removes deleted student entries across all exam stores', async () => {
  const { removeStudentFromErpStores } = await import('./erp-persistence');
  const marksStore = {
    'SA-1': { 'STU-1': { English: 90 }, 'STU-2': { English: 80 } },
    'PT-1': { 'STU-1': { English: 22 }, 'STU-2': { English: 20 } },
  };
  const bdsStore = {
    'SA-1': {
      'STU-1': { English: { writtenExam: 70, internalMarks: 20 } },
      'STU-2': { English: { writtenExam: 64, internalMarks: 16 } },
    },
  };
  const cleaned = removeStudentFromErpStores(marksStore, bdsStore, 'STU-1');
  assert.equal('STU-1' in cleaned.examMarksStore['SA-1'], false);
  assert.equal('STU-1' in cleaned.examMarksStore['PT-1'], false);
  assert.equal('STU-1' in cleaned.examBreakdownsStore['SA-1'], false);
  assert.equal(cleaned.examMarksStore['SA-1']['STU-2'].English, 80);
  assert.equal(cleaned.examMarksStore['PT-1']['STU-2'].English, 20);
});

test('addClassDefinition, updateClassDefinition, and deleteClassDefinition maintain class, student, and override consistency', async () => {
  const {
    getDefaultClasses,
    addClassDefinition,
    updateClassDefinition,
    deleteClassDefinition,
    formatClassGradeShortLabel,
    createStudentRecord,
    parseAttendanceParts,
    formatAttendanceParts,
  } = await import('./erp-persistence');

  let classes = getDefaultClasses();
  assert.equal(classes.length, 8);

  const dup = addClassDefinition(classes, 'Class 6', 'Sparkle');
  assert.ok(dup.error);
  assert.equal(dup.classes.length, 8);

  const added = addClassDefinition(classes, 'Class 10', 'Lotus');
  assert.equal(added.error, undefined);
  assert.equal(added.classes.length, 9);
  assert.equal(formatClassGradeShortLabel(added.classes, 'Lotus'), '10 Lotus');

  classes = added.classes;

  const createdRes = createStudentRecord({
    students: SAMPLE_STUDENTS,
    examConfigs: SAMPLE_CONFIGS,
    activeExamId: 'SA-1',
    classes,
    name: 'Meera Patil',
    rollNo: '5',
    section: 'Lotus',
    dob: '2011-05-14',
    fatherName: 'Suresh Patil',
    motherName: 'Kavita Patil',
    house: 'Pratapgad',
    height: '154',
    weight: '44',
    attendance: '29',
    attendanceOutOf: '32',
  });
  assert.equal(createdRes.createdStudent.class, 'Class 10');
  assert.equal(createdRes.createdStudent.section, 'Lotus');
  assert.equal(createdRes.createdStudent.house, 'Pratapgad');
  assert.equal(createdRes.createdStudent.attendance, '29/32');
  assert.deepEqual(parseAttendanceParts(createdRes.createdStudent.attendance), {
    present: '29',
    outOf: '32',
  });
  assert.equal(formatAttendanceParts('30', '35'), '30/35');

  const configsWithOverride: Record<string, ExamConfig> = {
    'SA-1': {
      ...SAMPLE_CONFIGS['SA-1'],
      classOverrides: {
        Lotus: { totalFormula: 'BEST_5' },
      },
    },
  };

  const edited = updateClassDefinition({
    classes,
    students: createdRes.nextStudents,
    examConfigs: configsWithOverride,
    selectedClass: 'Lotus',
    exportClass: 'Lotus',
    classId: 'Lotus',
    nextGrade: 'Class 8',
    nextSection: 'Aster',
  });
  assert.equal(edited.error, undefined);
  assert.equal(edited.selectedClass, 'Aster');
  assert.equal(edited.exportClass, 'Aster');
  const migratedStu = edited.students.find((s) => s.id === createdRes.createdStudent.id);
  assert.equal(migratedStu?.section, 'Aster');
  assert.equal(migratedStu?.class, 'Class 8');
  assert.ok(edited.examConfigs['SA-1'].classOverrides?.Aster);
  assert.equal(edited.examConfigs['SA-1'].classOverrides?.Lotus, undefined);

  const deleted = deleteClassDefinition({
    classes: edited.classes,
    students: edited.students,
    examConfigs: edited.examConfigs,
    examMarksStore: { 'SA-1': { [createdRes.createdStudent.id]: { English: 80 } } },
    examBreakdownsStore: {},
    selectedClass: edited.selectedClass,
    exportClass: edited.exportClass,
    classId: 'Aster',
  });
  assert.equal(deleted.error, undefined);
  assert.equal(deleted.classes.length, 8);
  assert.equal(deleted.removedStudentsCount, 1);
  assert.equal(
    deleted.students.some((s) => s.section === 'Aster'),
    false
  );
  assert.equal(deleted.selectedClass, 'Sparkle');
});

test('parseStoredErpState persists custom classes list across reloads', () => {
  const defaultState = createDefaultErpState(SAMPLE_CONFIGS, SAMPLE_STUDENTS, getClassNumber);
  const customClasses = [
    ...defaultState.classes,
    { id: 'Lotus', section: 'Lotus', grade: 'Class 10' },
  ];
  const parsed = parseStoredErpState(
    {
      [SVA_STORAGE_KEYS.INIT_FLAG]: '1',
      [SVA_STORAGE_KEYS.CLASSES]: JSON.stringify(customClasses),
      [SVA_STORAGE_KEYS.SELECTED_CLASS]: 'Lotus',
      [SVA_STORAGE_KEYS.SELECTED_EXAM]: 'SA-1',
    },
    defaultState,
    defaultState.classes.map((c) => c.section)
  );
  assert.equal(parsed.hasSavedData, true);
  assert.ok(parsed.state);
  assert.equal(parsed.state.classes.length, 9);
  assert.equal(parsed.state.selectedClass, 'Lotus');
});


