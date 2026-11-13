import test from 'node:test';
import assert from 'node:assert/strict';
import {
  StudentReportRow,
  ExamConfig,
  SubjectBreakdown,
  getEffectiveExamConfigForClass,
  computeStudentResult,
  computeClassResults,
} from './report-card-types';

test('Student roster serialization and deserialization retains custom remarks, marks, and added students', () => {
  const customRoster: StudentReportRow[] = [
    {
      id: 'sva-diamond-custom-1',
      rollNo: '01',
      name: 'Aditya Sharad Kulkarni',
      admissionNo: 'SVA-2026-DIA-01',
      class: 'IX',
      section: 'Diamond',
      dob: '2011-04-12',
      fatherName: 'Sharad Kulkarni',
      motherName: 'Sunita Kulkarni',
      marks: { English: 88, Hindi: 92, Marathi: 85, Maths: 95, Science: 90, 'Social Science': 89, 'Computer Science': 94 },
      breakdowns: {},
      subjectRemarks: { English: 'Good vocabulary', Maths: 'Excellent problem solving' },
      customRemarks: 'Hardworking student with consistent performance throughout the year.',
    },
    {
      id: 'sva-diamond-custom-2',
      rollNo: '02',
      name: 'Bhakti Ramesh Shinde',
      admissionNo: 'SVA-2026-DIA-02',
      class: 'IX',
      section: 'Diamond',
      dob: '2011-08-20',
      fatherName: 'Ramesh Shinde',
      motherName: 'Pooja Shinde',
      marks: { English: 78, Hindi: 82, Marathi: 80, Maths: 74, Science: 76, 'Social Science': 81, 'Computer Science': 85 },
      breakdowns: {},
      subjectRemarks: { Science: 'Shows keen interest in experiments' },
      customRemarks: 'Polite and attentive in class.',
    },
  ];

  // Serialize to JSON (as stored in localStorage)
  const jsonStr = JSON.stringify(customRoster);
  const reloadedRoster: StudentReportRow[] = JSON.parse(jsonStr);

  assert.equal(reloadedRoster.length, 2);
  assert.equal(reloadedRoster[0].name, 'Aditya Sharad Kulkarni');
  assert.equal(reloadedRoster[0].marks.Maths, 95);
  assert.equal(reloadedRoster[0].subjectRemarks?.English, 'Good vocabulary');
  assert.equal(reloadedRoster[0].customRemarks, 'Hardworking student with consistent performance throughout the year.');
  assert.equal(reloadedRoster[1].fatherName, 'Ramesh Shinde');
});

test('Multi-exam marks store keeps marks isolated per exam without leakage', () => {
  const examMarksStore: Record<string, Record<string, Record<string, number | 'AB' | null>>> = {
    'SA-1': {
      'stu-1': { English: 85, Maths: 90 },
      'stu-2': { English: 70, Maths: 65 },
    },
    'PT-1': {
      'stu-1': { English: 22, Maths: 24 },
      'stu-2': { English: 18, Maths: 15 },
    },
    'PT-2': {
      'stu-1': { English: 25, Maths: 25 },
      'stu-2': { English: 20, Maths: 19 },
    },
  };

  const jsonStr = JSON.stringify(examMarksStore);
  const loadedStore = JSON.parse(jsonStr);

  // Marks in SA-1 must not leak into PT-1 or PT-2
  assert.equal(loadedStore['SA-1']['stu-1'].English, 85);
  assert.equal(loadedStore['PT-1']['stu-1'].English, 22);
  assert.equal(loadedStore['PT-2']['stu-1'].English, 25);

  // Student 2 marks must remain isolated
  assert.equal(loadedStore['SA-1']['stu-2'].Maths, 65);
  assert.equal(loadedStore['PT-1']['stu-2'].Maths, 15);
  assert.equal(loadedStore['PT-2']['stu-2'].Maths, 19);
});

test('Tab synchronization: changes in student remarks propagate to computeStudentResult for report cards', () => {
  const student: StudentReportRow = {
    id: 'stu-test-sync',
    rollNo: '15',
    name: 'Tanvi Dilip Patil',
    admissionNo: 'SVA-2026-TOP-15',
    class: 'VII',
    section: 'Topaz',
    dob: '2012-05-18',
    fatherName: 'Dilip',
    motherName: 'Swati',
    marks: { English: 75, Hindi: 80, Marathi: 82, Maths: 88, Science: 84, 'Social Science': 79 },
    subjectRemarks: { English: 'Great reading comprehension' },
    customRemarks: 'Very creative and punctual student.',
  };

  const sampleSubjects = [
    { id: '1', name: 'English', maxMarks: 100, passMarks: 32 },
    { id: '2', name: 'Hindi', maxMarks: 100, passMarks: 32 },
    { id: '3', name: 'Marathi', maxMarks: 100, passMarks: 32 },
    { id: '4', name: 'Maths', maxMarks: 100, passMarks: 32 },
    { id: '5', name: 'Science', maxMarks: 100, passMarks: 32 },
    { id: '6', name: 'Social Science', maxMarks: 100, passMarks: 32 },
  ];

  const resultBefore = computeStudentResult(student, sampleSubjects, 'SUM');
  assert.equal(resultBefore.student.customRemarks, 'Very creative and punctual student.');
  assert.equal(resultBefore.subjectDetails.find((s) => s.name === 'English')?.remark, 'Great reading comprehension');

  // Teacher updates remarks in Remarks Tab
  const updatedStudent: StudentReportRow = {
    ...student,
    customRemarks: 'Exceptional participation in Science exhibition and group tasks.',
    subjectRemarks: {
      ...student.subjectRemarks,
      Maths: 'Rapid mental arithmetic skills demonstrated.',
    },
  };

  const resultAfter = computeStudentResult(updatedStudent, sampleSubjects, 'SUM');
  assert.equal(
    resultAfter.student.customRemarks,
    'Exceptional participation in Science exhibition and group tasks.'
  );
  assert.equal(
    resultAfter.subjectDetails.find((s) => s.name === 'Maths')?.remark,
    'Rapid mental arithmetic skills demonstrated.'
  );
});

test('Student addition and deletion correctly recalculates class rank and counts', () => {
  const students: StudentReportRow[] = [
    {
      id: 'st-1',
      rollNo: '01',
      name: 'Student A',
      admissionNo: 'ADM-1',
      class: 'IX',
      section: 'Diamond',
      marks: { English: 90, Maths: 90 },
    },
    {
      id: 'st-2',
      rollNo: '02',
      name: 'Student B',
      admissionNo: 'ADM-2',
      class: 'IX',
      section: 'Diamond',
      marks: { English: 80, Maths: 80 },
    },
  ];

  const subjects = [
    { id: '1', name: 'English', maxMarks: 100, passMarks: 32 },
    { id: '2', name: 'Maths', maxMarks: 100, passMarks: 32 },
  ];

  const resultsInitial = computeClassResults(students, subjects, 'SUM');
  assert.equal(resultsInitial.length, 2);
  assert.equal(resultsInitial.find((r) => r.student.id === 'st-1')?.rank, 1);
  assert.equal(resultsInitial.find((r) => r.student.id === 'st-2')?.rank, 2);

  // Add high achiever
  const addedStudent: StudentReportRow = {
    id: 'st-3',
    rollNo: '03',
    name: 'Student C',
    admissionNo: 'ADM-3',
    class: 'IX',
    section: 'Diamond',
    marks: { English: 98, Maths: 98 },
  };

  const resultsAfterAdd = computeClassResults([...students, addedStudent], subjects, 'SUM');
  assert.equal(resultsAfterAdd.length, 3);
  assert.equal(resultsAfterAdd.find((r) => r.student.id === 'st-3')?.rank, 1);
  assert.equal(resultsAfterAdd.find((r) => r.student.id === 'st-1')?.rank, 2);
  assert.equal(resultsAfterAdd.find((r) => r.student.id === 'st-2')?.rank, 3);
});
