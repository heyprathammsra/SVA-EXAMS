import test from 'node:test';
import assert from 'node:assert/strict';
import { applyClearErpData, countClearDataImpact } from './erp-clear-data';
import type { ExamConfig, StudentReportRow } from './report-card-types';
import type { ExamBreakdownsStore, ExamMarksStore } from './erp-persistence';

const SAMPLE_CONFIGS: Record<string, ExamConfig> = {
  'PT-1': {
    id: 'PT-1',
    name: 'PT-1',
    code: 'PT-1',
    totalFormula: 'SUM',
    subjects: [{ name: 'English', maxMarks: 25, passMarks: 8 }],
  },
  'SA-1': {
    id: 'SA-1',
    name: 'SA-1',
    code: 'SA-1',
    totalFormula: 'SUM',
    subjects: [{ name: 'English', maxMarks: 100, passMarks: 32 }],
  },
};

function makeFixture(): {
  students: StudentReportRow[];
  examMarksStore: ExamMarksStore;
  examBreakdownsStore: ExamBreakdownsStore;
} {
  const students: StudentReportRow[] = [
    {
      id: 'stu-1',
      rollNo: '01',
      name: 'Aarav Patil',
      admissionNo: 'SVA-1',
      class: 'Class 6',
      section: 'Sparkle',
      attendance: '29/31',
      marks: { English: 92, Maths: 88 },
      breakdowns: { English: { mainExam: 74, internalMarks: 18 } },
      customRemarks: 'Excellent performance.',
      subjectRemarks: { English: 'Great fluency' },
    },
    {
      id: 'stu-2',
      rollNo: '01',
      name: 'Meera Joshi',
      admissionNo: 'SVA-2',
      class: 'Class 6',
      section: 'Twinkle',
      attendance: '30/31',
      marks: { English: 85, Maths: 90 },
      breakdowns: { English: { mainExam: 68, internalMarks: 17 } },
      customRemarks: 'Very consistent.',
      subjectRemarks: { English: 'Strong writing' },
    },
  ];

  const examMarksStore: ExamMarksStore = {
    'PT-1': {
      'stu-1': { English: 22 },
      'stu-2': { English: 20 },
    },
    'SA-1': {
      'stu-1': { English: 92, Maths: 88 },
      'stu-2': { English: 85, Maths: 90 },
    },
  };

  const examBreakdownsStore: ExamBreakdownsStore = {
    'SA-1': {
      'stu-1': { English: { mainExam: 74, internalMarks: 18 } },
      'stu-2': { English: { mainExam: 68, internalMarks: 17 } },
    },
  };

  return { students, examMarksStore, examBreakdownsStore };
}

test('countClearDataImpact accurately computes student and exam counts', () => {
  const { students } = makeFixture();
  const allImpact = countClearDataImpact({
    students,
    examConfigs: SAMPLE_CONFIGS,
    targetSection: 'all',
    targetExam: 'ALL',
  });
  assert.equal(allImpact.matchedStudentsCount, 2);
  assert.deepEqual(allImpact.affectedExamIds, ['PT-1', 'SA-1']);

  const singleImpact = countClearDataImpact({
    students,
    examConfigs: SAMPLE_CONFIGS,
    targetSection: 'Sparkle',
    targetExam: 'SA-1',
  });
  assert.equal(singleImpact.matchedStudentsCount, 1);
  assert.deepEqual(singleImpact.affectedExamIds, ['SA-1']);
});

test('clears marks and remarks across all classes and all exams for new academic year', () => {
  const { students, examMarksStore, examBreakdownsStore } = makeFixture();
  const res = applyClearErpData({
    students,
    activeExamId: 'SA-1',
    examConfigs: SAMPLE_CONFIGS,
    examMarksStore,
    examBreakdownsStore,
    selectedStudentId: 'stu-1',
    options: {
      targetSection: 'all',
      targetExam: 'ALL',
      clearMarks: true,
      clearRemarks: true,
      clearAttendance: false,
      removeStudents: false,
    },
  });

  assert.equal(res.clearedStudentsCount, 2);
  assert.equal(res.students[0].name, 'Aarav Patil');
  assert.equal(res.students[0].marks.English, null);
  assert.equal(res.students[0].marks.Maths, null);
  assert.deepEqual(res.students[0].breakdowns, {});
  assert.equal(res.students[0].customRemarks, '');
  assert.deepEqual(res.students[0].subjectRemarks, {});
  assert.equal(res.students[0].attendance, '29/31');

  assert.equal(res.examMarksStore['PT-1']['stu-1'].English, null);
  assert.equal(res.examMarksStore['SA-1']['stu-2'].English, null);
  assert.deepEqual(res.examBreakdownsStore['SA-1'], {});
});

test('clears only targeted class and exam when scoped, preserving other classes and exams', () => {
  const { students, examMarksStore, examBreakdownsStore } = makeFixture();
  const res = applyClearErpData({
    students,
    activeExamId: 'SA-1',
    examConfigs: SAMPLE_CONFIGS,
    examMarksStore,
    examBreakdownsStore,
    selectedStudentId: 'stu-1',
    options: {
      targetSection: 'Sparkle',
      targetExam: 'SA-1',
      clearMarks: true,
      clearRemarks: false,
      clearAttendance: false,
      removeStudents: false,
    },
  });

  // stu-1 (Sparkle) active SA-1 marks cleared; remarks preserved
  assert.equal(res.students[0].marks.English, null);
  assert.equal(res.students[0].customRemarks, 'Excellent performance.');
  assert.equal(res.students[0].subjectRemarks?.English, 'Great fluency');
  // PT-1 preserved for stu-1
  assert.equal(res.examMarksStore['PT-1']['stu-1'].English, 22);
  // stu-2 (Twinkle) completely untouched
  assert.equal(res.students[1].marks.English, 85);
  assert.equal(res.examMarksStore['SA-1']['stu-2'].English, 85);
  assert.equal(res.examBreakdownsStore['SA-1']['stu-2'].English.mainExam, 68);
});

test('clears only remarks and optional attendance without erasing marks', () => {
  const { students, examMarksStore, examBreakdownsStore } = makeFixture();
  const res = applyClearErpData({
    students,
    activeExamId: 'SA-1',
    examConfigs: SAMPLE_CONFIGS,
    examMarksStore,
    examBreakdownsStore,
    selectedStudentId: 'stu-1',
    options: {
      targetSection: 'all',
      targetExam: 'ALL',
      clearMarks: false,
      clearRemarks: true,
      clearAttendance: true,
      removeStudents: false,
    },
  });

  assert.equal(res.students[0].marks.English, 92);
  assert.equal(res.students[0].customRemarks, '');
  assert.deepEqual(res.students[0].subjectRemarks, {});
  assert.equal(res.students[0].attendance, '');
  assert.equal(res.students[1].customRemarks, '');
  assert.equal(res.students[1].attendance, '');
});

test('removes students for selected class scope and cleans exam stores', () => {
  const { students, examMarksStore, examBreakdownsStore } = makeFixture();
  const res = applyClearErpData({
    students,
    activeExamId: 'SA-1',
    examConfigs: SAMPLE_CONFIGS,
    examMarksStore,
    examBreakdownsStore,
    selectedStudentId: 'stu-1',
    options: {
      targetSection: 'Sparkle',
      targetExam: 'ALL',
      clearMarks: true,
      clearRemarks: true,
      clearAttendance: false,
      removeStudents: true,
    },
  });

  assert.equal(res.students.length, 1);
  assert.equal(res.students[0].id, 'stu-2');
  assert.equal(res.selectedStudentId, 'stu-2');
  assert.equal('stu-1' in res.examMarksStore['SA-1'], false);
  assert.equal('stu-1' in res.examBreakdownsStore['SA-1'], false);
  assert.equal(res.examMarksStore['SA-1']['stu-2'].English, 85);
});
