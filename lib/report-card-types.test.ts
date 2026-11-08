import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGrade,
  evaluateCustomFormula,
  computeStudentResult,
  computeClassResults,
  SubjectConfig,
  StudentReportRow,
} from './report-card-types';

const SAMPLE_SUBJECTS: SubjectConfig[] = [
  { name: 'English', maxMarks: 80, passMarks: 26 },
  { name: 'Hindi', maxMarks: 80, passMarks: 26 },
  { name: 'Maths', maxMarks: 80, passMarks: 26 },
  { name: 'Science', maxMarks: 80, passMarks: 26 },
];

test('computeGrade maps percentage to CBSE grades', () => {
  assert.equal(computeGrade(95), 'A1');
  assert.equal(computeGrade(85), 'A2');
  assert.equal(computeGrade(75), 'B1');
  assert.equal(computeGrade(65), 'B2');
  assert.equal(computeGrade(55), 'C1');
  assert.equal(computeGrade(45), 'C2');
  assert.equal(computeGrade(35), 'D');
  assert.equal(computeGrade(20), 'E');
});

test('evaluateCustomFormula handles standard SUM and custom alias expressions', () => {
  const marks = { English: 70, Hindi: 60, Maths: 80, Science: 75 };

  // 1. Alias formula: =p1+p2+p3+p4
  const res1 = evaluateCustomFormula('=p1+p2+p3+p4', marks, SAMPLE_SUBJECTS);
  assert.equal(res1.obtained, 285);
  assert.equal(res1.max, 320);

  // 2. Custom formula: =p1 + p3 * 0.5
  const res2 = evaluateCustomFormula('=p1 + p3 * 0.5', marks, SAMPLE_SUBJECTS);
  assert.equal(res2.obtained, 110); // 70 + (80 * 0.5)

  // 3. Macro BEST(2)
  const res3 = evaluateCustomFormula('BEST(2)', marks, SAMPLE_SUBJECTS);
  assert.equal(res3.obtained, 155); // 80 (Maths) + 75 (Science)
  assert.equal(res3.max, 160);
});

test('computeStudentResult calculates totals, grades, and pass/fail status', () => {
  const student: StudentReportRow = {
    id: 'STU-1',
    rollNo: '01',
    name: 'Aarav Sharma',
    admissionNo: 'ADM-001',
    class: 'Class 6',
    section: 'Sparkle',
    marks: { English: 72, Hindi: 68, Maths: 76, Science: 80 },
  };

  const result = computeStudentResult(student, SAMPLE_SUBJECTS, 'SUM');
  assert.equal(result.totalObtained, 296);
  assert.equal(result.totalMax, 320);
  assert.equal(result.percentage, 92.5);
  assert.equal(result.grade, 'A1');
  assert.equal(result.status, 'PASS');
});

test('computeClassResults assigns correct ranks per class group', () => {
  const students: StudentReportRow[] = [
    {
      id: 'STU-1',
      rollNo: '01',
      name: 'Aarav',
      admissionNo: 'ADM-1',
      class: 'Class 6',
      section: 'Sparkle',
      marks: { English: 70, Hindi: 70, Maths: 70, Science: 70 }, // 280 marks -> 87.5%
    },
    {
      id: 'STU-2',
      rollNo: '02',
      name: 'Bhavna',
      admissionNo: 'ADM-2',
      class: 'Class 6',
      section: 'Sparkle',
      marks: { English: 80, Hindi: 80, Maths: 80, Science: 80 }, // 320 marks -> 100%
    },
  ];

  const results = computeClassResults(students, SAMPLE_SUBJECTS, 'SUM');
  const bhavnaRes = results.find((r) => r.student.id === 'STU-2');
  const aaravRes = results.find((r) => r.student.id === 'STU-1');

  assert.equal(bhavnaRes?.rank, 1);
  assert.equal(aaravRes?.rank, 2);
});
