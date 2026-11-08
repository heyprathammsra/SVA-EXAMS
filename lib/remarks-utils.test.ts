import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultSubjectRemark,
  getDefaultClassTeacherRemark,
  updateStudentClassRemark,
  updateStudentSubjectRemark,
  applyAutoRemarksToStudents,
  computeDragScrollLeft,
} from './remarks-utils';
import { StudentReportRow, SubjectConfig, computeStudentResult } from './report-card-types';

const mockSubjects: SubjectConfig[] = [
  { name: 'English', maxMarks: 100, passMarks: 33 },
  { name: 'Maths', maxMarks: 100, passMarks: 33 },
];

const mockStudent: StudentReportRow = {
  id: 'STU-1',
  rollNo: '01',
  name: 'Anjali Sandip Chavan',
  admissionNo: 'ADM-1',
  class: 'Class 9',
  section: 'Diamond',
  marks: {
    English: 92,
    Maths: 78,
  },
  customRemarks: '',
  subjectRemarks: {},
};

test('updateStudentClassRemark immutably updates customRemarks', () => {
  const updated = updateStudentClassRemark(mockStudent, 'Very sincere and disciplined.');
  assert.equal(updated.customRemarks, 'Very sincere and disciplined.');
  assert.equal(mockStudent.customRemarks, '');
});

test('updateStudentSubjectRemark immutably updates subjectRemarks for a subject', () => {
  const updated = updateStudentSubjectRemark(mockStudent, 'English', 'Fluent expression.');
  assert.equal(updated.subjectRemarks?.['English'], 'Fluent expression.');
  assert.equal(mockStudent.subjectRemarks?.['English'], undefined);
});

test('computeStudentResult includes subject remark in subjectDetails', () => {
  const withSubRemark = updateStudentSubjectRemark(mockStudent, 'English', 'Great essay skills.');
  const result = computeStudentResult(withSubRemark, mockSubjects);
  const engDetail = result.subjectDetails.find((d) => d.name === 'English');
  assert.equal(engDetail?.remark, 'Great essay skills.');
});

test('getDefaultSubjectRemark and getDefaultClassTeacherRemark return tier-appropriate remarks', () => {
  assert.match(getDefaultSubjectRemark(95, 100), /Excellent/);
  assert.match(getDefaultSubjectRemark('AB', 100), /Absent/);
  assert.match(getDefaultClassTeacherRemark(92, 'PASS'), /Exemplary/);
  assert.match(getDefaultClassTeacherRemark(45, 'FAIL'), /Requires targeted practice/);
});

test('applyAutoRemarksToStudents populates empty subject and class teacher remarks', () => {
  const filled = applyAutoRemarksToStudents(
    [mockStudent],
    mockSubjects,
    'Diamond',
    'all',
    false
  );
  assert.ok(filled[0].customRemarks && filled[0].customRemarks.length > 5);
  assert.ok(filled[0].subjectRemarks?.['English'] && filled[0].subjectRemarks['English'].length > 5);
  assert.ok(filled[0].subjectRemarks?.['Maths'] && filled[0].subjectRemarks['Maths'].length > 5);
});

test('computeDragScrollLeft calculates clamped horizontal scroll and drag threshold', () => {
  // Dragging mouse left by 100px scrolls container right
  const resRight = computeDragScrollLeft(0, 500, 400, 1000, 1.25);
  assert.equal(resRight.nextScrollLeft, 125);
  assert.equal(resRight.hasDragged, true);

  // Small jitter <= 3px does not mark hasDragged
  const resSmall = computeDragScrollLeft(100, 300, 298, 1000, 1.25);
  assert.equal(resSmall.hasDragged, false);

  // Clamping at 0 and maxScrollLeft
  const resClampLow = computeDragScrollLeft(50, 200, 400, 1000, 1.25);
  assert.equal(resClampLow.nextScrollLeft, 0);
  const resClampHigh = computeDragScrollLeft(950, 400, 200, 1000, 1.25);
  assert.equal(resClampHigh.nextScrollLeft, 1000);
});

