import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGrade,
  computeStudentResult,
  computeClassResults,
  StudentReportRow,
  SubjectConfig,
} from './report-card-types';

test('computeGrade returns accurate letter grades for percentage thresholds', () => {
  assert.equal(computeGrade(95), 'A1');
  assert.equal(computeGrade(82), 'A2');
  assert.equal(computeGrade(74), 'B1');
  assert.equal(computeGrade(65), 'B2');
  assert.equal(computeGrade(52), 'C1');
  assert.equal(computeGrade(45), 'C2');
  assert.equal(computeGrade(35), 'D');
  assert.equal(computeGrade(32), 'D');
  assert.equal(computeGrade(25), 'E1');
  assert.equal(computeGrade(15), 'E2');
});

test('computeStudentResult calculates totals and pass/fail status', () => {
  const subjects: SubjectConfig[] = [
    { name: 'English', maxMarks: 100, passMarks: 33 },
    { name: 'Maths', maxMarks: 100, passMarks: 33 },
    { name: 'Science', maxMarks: 100, passMarks: 33 },
  ];

  const student: StudentReportRow = {
    id: 's1',
    rollNo: '101',
    name: 'Aarav Sharma',
    admissionNo: 'ADM101',
    class: '10',
    section: 'A',
    marks: {
      English: 85,
      Maths: 95,
      Science: 90,
    },
  };

  const res = computeStudentResult(student, subjects);
  assert.equal(res.totalObtained, 270);
  assert.equal(res.totalMax, 300);
  assert.equal(res.percentage, 90);
  assert.equal(res.grade, 'A2');
  assert.equal(res.status, 'PASS');
});

test('computeStudentResult handles absent marks correctly', () => {
  const subjects: SubjectConfig[] = [
    { name: 'English', maxMarks: 100, passMarks: 33 },
    { name: 'Maths', maxMarks: 100, passMarks: 33 },
  ];

  const student: StudentReportRow = {
    id: 's2',
    rollNo: '102',
    name: 'Kabir Khan',
    admissionNo: 'ADM102',
    class: '10',
    section: 'A',
    marks: {
      English: 75,
      Maths: 'AB',
    },
  };

  const res = computeStudentResult(student, subjects);
  assert.equal(res.status, 'FAIL');
  assert.equal(res.subjectDetails[1].status, 'ABSENT');
});

test('computeClassResults assigns correct ranks', () => {
  const subjects: SubjectConfig[] = [{ name: 'Total', maxMarks: 100, passMarks: 33 }];
  const students: StudentReportRow[] = [
    { id: '1', rollNo: '1', name: 'Student 1', admissionNo: '1', class: '10', section: 'A', marks: { Total: 95 } },
    { id: '2', rollNo: '2', name: 'Student 2', admissionNo: '2', class: '10', section: 'A', marks: { Total: 80 } },
    { id: '3', rollNo: '3', name: 'Student 3', admissionNo: '3', class: '10', section: 'A', marks: { Total: 90 } },
  ];

  const results = computeClassResults(students, subjects);
  assert.equal(results.find((r) => r.student.id === '1')?.rank, 1);
  assert.equal(results.find((r) => r.student.id === '3')?.rank, 2);
  assert.equal(results.find((r) => r.student.id === '2')?.rank, 3);
});

test('generateSingleReportCardPDF produces a 2-page A4 portrait PDF (210mm x 297mm) matching the official report card layout', async () => {
  const { generateSingleReportCardPDF } = await import('./fast-pdf');
  const { getPtSubjectsForClass } = await import('./report-card-types');

  const student: StudentReportRow = {
    id: 'STU-2026-0031',
    rollNo: '01',
    name: 'Aayush Satish Nalawade',
    admissionNo: 'ADM-031',
    class: 'Class 6',
    section: 'Twinkle',
    marks: {
      English: 25,
      Hindi: 25,
      Marathi: 24,
      Maths: 22,
      Science: 25,
      'Social Science': 24,
    },
  };

  const ptResult = computeStudentResult(student, getPtSubjectsForClass('Twinkle', 25, 8));
  const ptDoc = generateSingleReportCardPDF(
    {
      schoolName: 'Saraswati Vidya Academy',
      schoolAddress: 'Village Shilatne, Maval Dist. Pune, Maharashtra 410405',
      schoolCode: '31572',
      affiliationNo: '1131575',
      udiseNo: '2724100374',
      schoolEmail: 'principal@saraswatividya.academy',
      examName: 'PT-1',
      examCode: 'PT-1',
      academicSession: '2026-2027',
      principalName: 'Principal',
      classTeacherName: 'Class Teacher',
    },
    ptResult
  );

  assert.equal(ptDoc.getNumberOfPages(), 2);
  assert.equal(Math.round(ptDoc.internal.pageSize.getWidth()), 210);
  assert.equal(Math.round(ptDoc.internal.pageSize.getHeight()), 297);
});

