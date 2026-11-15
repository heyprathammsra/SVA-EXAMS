import test from 'node:test';
import assert from 'node:assert/strict';
import { PersistedErpState } from './erp-persistence';
import { applyMarkDeltasToState } from './marks-delta';
import { mergeSyncQueueState, PersistedSyncQueue } from './server-sheet-sync';
import { TeacherProfile } from './teacher-permissions';

function buildFixtureState(): PersistedErpState {
  return {
    version: 1,
    initialized: true,
    updatedAt: 1000,
    selectedClass: 'Sparkle',
    selectedExam: 'SA-1',
    classes: [{ id: 'Sparkle', section: 'Sparkle', grade: 'Class 6' }],
    examConfigs: {
      'PT-1': {
        id: 'PT-1',
        name: 'Periodic Test 1',
        code: 'PT-1',
        totalFormula: 'SUM',
        subjects: [
          { name: 'English', maxMarks: 25, passMarks: 8 },
          { name: 'Science', maxMarks: 25, passMarks: 8 },
          { name: 'Maths', maxMarks: 25, passMarks: 8 },
        ],
      },
      'SA-1': {
        id: 'SA-1',
        name: 'Summative Assessment 1',
        code: 'SA-1',
        totalFormula: 'SUM',
        subjects: [
          { name: 'English', maxMarks: 100, passMarks: 33 },
          { name: 'Science', maxMarks: 100, passMarks: 33 },
          { name: 'Maths', maxMarks: 100, passMarks: 33 },
        ],
      },
    },
    students: [
      {
        id: 'stu-1',
        rollNo: '01',
        name: 'Ajinkya',
        section: 'Sparkle',
        class: 'Class 6',
        height: '129',
        marks: { English: 80, Science: 85, Maths: 90 },
        breakdowns: {},
        subjectRemarks: {},
      },
    ],
    examMarksStore: {
      'PT-1': { 'stu-1': { English: 20, Science: 21, Maths: 22 } },
      'SA-1': { 'stu-1': { English: 80, Science: 85, Maths: 90 } },
    },
    examBreakdownsStore: {
      'PT-1': {},
      'SA-1': {},
    },
  };
}

const prathamTeacher: TeacherProfile = {
  id: 't-pratham',
  name: 'Pratham',
  username: 'pratham',
  assignedSubject: 'Science',
  assignedClasses: ['Sparkle'],
  classTeacherOf: 'Sparkle',
  assignments: [{ section: 'Sparkle', subject: 'Science' }],
  createdAt: 100,
  updatedAt: 100,
};

test('applyMarkDeltasToState applies authorized subject mark immediately and clamps to maxMarks', () => {
  const base = buildFixtureState();
  const res = applyMarkDeltasToState({
    existingState: base,
    role: 'teacher',
    teacherProfile: prathamTeacher,
    nowMs: 2000,
    deltas: [
      {
        kind: 'subject_mark',
        studentId: 'stu-1',
        examId: 'PT-1',
        subject: 'Science',
        value: 99, // exceeds PT-1 max 25 -> clamps to 25
      },
    ],
  });

  assert.equal(res.appliedCount, 1);
  assert.equal(res.rejectedCount, 0);
  assert.deepEqual(res.dirtyExams, ['PT-1']);
  assert.equal(res.nextState.examMarksStore['PT-1']['stu-1'].Science, 25);
  // Active exam SA-1 on student row stays untouched when editing PT-1
  assert.equal(res.nextState.students[0].marks.Science, 85);
});

test('applyMarkDeltasToState rejects unauthorized subject mark for teacher while preserving other subjects', () => {
  const base = buildFixtureState();
  const res = applyMarkDeltasToState({
    existingState: base,
    role: 'teacher',
    teacherProfile: prathamTeacher,
    nowMs: 2000,
    deltas: [
      {
        kind: 'subject_mark',
        studentId: 'stu-1',
        examId: 'SA-1',
        subject: 'Maths', // pratham only teaches Science
        value: 12,
      },
      {
        kind: 'subject_mark',
        studentId: 'stu-1',
        examId: 'SA-1',
        subject: 'Science',
        value: 'AB',
      },
    ],
  });

  assert.equal(res.appliedCount, 1);
  assert.equal(res.rejectedCount, 1);
  assert.equal(res.nextState.students[0].marks.Maths, 90);
  assert.equal(res.nextState.students[0].marks.Science, 'AB');
  assert.equal(res.nextState.examMarksStore['SA-1']['stu-1'].Science, 'AB');
});

test('applyMarkDeltasToState merges sequential updates from different users without overwriting', () => {
  const base = buildFixtureState();
  const step1 = applyMarkDeltasToState({
    existingState: base,
    role: 'teacher',
    teacherProfile: prathamTeacher,
    nowMs: 2000,
    deltas: [
      {
        kind: 'subject_mark',
        studentId: 'stu-1',
        examId: 'SA-1',
        subject: 'Science',
        value: 94,
      },
    ],
  });

  const step2 = applyMarkDeltasToState({
    existingState: step1.nextState,
    role: 'admin',
    nowMs: 2005,
    deltas: [
      {
        kind: 'subject_mark',
        studentId: 'stu-1',
        examId: 'SA-1',
        subject: 'Maths',
        value: 96,
      },
    ],
  });

  assert.equal(step2.nextState.students[0].marks.Science, 94);
  assert.equal(step2.nextState.students[0].marks.Maths, 96);
  assert.equal(step2.nextState.examMarksStore['SA-1']['stu-1'].Science, 94);
  assert.equal(step2.nextState.examMarksStore['SA-1']['stu-1'].Maths, 96);
});

test('applyMarkDeltasToState allows Class Teacher student_patch only for their section and clears zombie breakdown on null mark', () => {
  const base = buildFixtureState();
  base.students[0].breakdowns = { Science: { penPaper: 5, writtenExam: 80 } };
  base.examBreakdownsStore['SA-1'] = { 'stu-1': { Science: { penPaper: 5, writtenExam: 80 } } };

  const res = applyMarkDeltasToState({
    existingState: base,
    role: 'teacher',
    teacherProfile: prathamTeacher,
    nowMs: 3000,
    deltas: [
      {
        kind: 'student_patch',
        studentId: 'stu-1',
        patch: { height: '132' },
      },
      {
        kind: 'subject_mark',
        studentId: 'stu-1',
        examId: 'SA-1',
        subject: 'Science',
        value: null,
      },
    ],
  });

  assert.equal(res.appliedCount, 2);
  assert.equal(res.nextState.students[0].height, '132');
  assert.equal(res.nextState.students[0].marks.Science, null);
  assert.equal(res.nextState.students[0].breakdowns?.Science, undefined);
  assert.equal(res.nextState.examBreakdownsStore['SA-1']['stu-1']?.Science, undefined);
});

test('mergeSyncQueueState coalesces dirty exams cleanly without duplicates', () => {
  const initial: PersistedSyncQueue = {
    pendingExams: ['SA-1'],
    needsFullSync: false,
    cloudBackupPending: false,
    teachersAuthoritative: false,
    gasUrl: 'https://script.google.com/macros/s/abc/exec',
    lastEnqueuedAt: 100,
    lastAttemptAt: 0,
    lastSyncedAt: null,
    lastError: null,
    retryCount: 2,
  };

  const merged = mergeSyncQueueState(initial, {
    examIds: ['SA-1', 'PT-1'],
    cloudBackup: true,
    nowMs: 500,
  });

  assert.deepEqual(merged.pendingExams, ['SA-1', 'PT-1']);
  assert.equal(merged.cloudBackupPending, true);
  assert.equal(merged.retryCount, 0);
  assert.equal(merged.lastEnqueuedAt, 500);
});
