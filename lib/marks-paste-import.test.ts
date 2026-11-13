import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parsePastedMarksText } from './marks-paste-import';
import { ALL_SVA_STUDENTS } from './sva-students-data';
import {
  ExamConfig,
  PT_EXAM_SUBJECT_NAMES,
  getDefaultSubjectComponents,
} from './report-card-types';

const SA1_CONFIG: ExamConfig = {
  id: 'SA-1',
  name: 'SA-1 (Summative Assessment 1)',
  code: 'SA-1',
  totalFormula: 'SUM',
  subjects: [
    'English',
    'Hindi',
    'Marathi',
    'Maths',
    'Science',
    'Social Science',
    'Computer Science',
  ].map((name) => ({
    name,
    maxMarks: 100,
    passMarks: 32,
    components: getDefaultSubjectComponents(name, 'SA-1'),
  })),
};

const PT1_CONFIG: ExamConfig = {
  id: 'PT-1',
  name: 'PT-1 (Periodic Test 1)',
  code: 'PT-1',
  totalFormula: 'SUM',
  subjects: PT_EXAM_SUBJECT_NAMES.map((name) => ({
    name,
    maxMarks: 25,
    passMarks: 8,
  })),
};

function getClassNumberForSection(sec: string): string {
  return sec === 'Diamond' || sec === 'Ruby'
    ? 'Class 9'
    : sec === 'Emerald' || sec === 'Garnet'
    ? 'Class 8'
    : sec === 'Jade' || sec === 'Topaz'
    ? 'Class 7'
    : 'Class 6';
}

describe('Pasted Marks Text Parser', () => {
  it('parses single-subject plain text lines (Roll+Name+Mark, punctuation variants, AB, roll-only, clamping)', () => {
    const rawText = [
      '01 Anjali Sandip Chavan 96',
      '2. Arohi Mahesh Pawar AB',
      '03 145', // clamps to 100
      '99 NonExistent Student 50',
    ].join('\n');

    const result = parsePastedMarksText({
      rawText,
      targetClass: 'Diamond',
      targetSubject: 'English',
      replaceExisting: false,
      currentStudents: ALL_SVA_STUDENTS,
      baseExamConfig: SA1_CONFIG,
      getClassNumberForSection,
    });

    assert.equal(result.matchedStudentCount, 3);
    assert.equal(result.matchedMarksCount, 3);
    assert.equal(result.unmatchedLines.length, 1);

    const s1 = result.updatedStudents.find((s) => s.rollNo === '01' && s.section === 'Diamond');
    const s2 = result.updatedStudents.find((s) => s.rollNo === '02' && s.section === 'Diamond');
    const s3 = result.updatedStudents.find((s) => s.rollNo === '03' && s.section === 'Diamond');
    assert.equal(s1?.marks.English, 96);
    assert.equal(s1?.breakdowns?.English?.writtenExam !== undefined, true);
    assert.equal(s2?.marks.English, 'AB');
    assert.equal(s3?.marks.English, 100);
  });

  it('parses headerless TSV multi-subject rows from Excel in All Subjects mode', () => {
    const rawText = [
      '01\tAnjali Sandip Chavan\t24\t22\t21\t25\t23\t20',
      '02\tArohi Mahesh Pawar\t19\tAB\t20\t22\t21\t18',
    ].join('\n');

    const result = parsePastedMarksText({
      rawText,
      targetClass: 'Diamond',
      targetSubject: '__ALL__',
      replaceExisting: false,
      currentStudents: ALL_SVA_STUDENTS,
      baseExamConfig: PT1_CONFIG,
      getClassNumberForSection,
    });

    assert.equal(result.matchedStudentCount, 2);
    assert.equal(result.matchedMarksCount, 12);
    const s1 = result.updatedStudents.find((s) => s.rollNo === '01' && s.section === 'Diamond');
    const s2 = result.updatedStudents.find((s) => s.rollNo === '02' && s.section === 'Diamond');
    assert.equal(s1?.marks.English, 24);
    assert.equal(s1?.marks.Maths, 25);
    assert.equal(s2?.marks.Hindi, 'AB');
    assert.equal(s2?.marks['Social Science'], 18);
  });

  it('parses headered TSV copy-pasted directly from consolidated table', () => {
    const rawText = [
      'Roll No\tStudent Name\tEnglish\tScience',
      '01\tAnjali Sandip Chavan\t91\t93',
      '02\tArohi Mahesh Pawar\t84\t89',
    ].join('\n');

    const result = parsePastedMarksText({
      rawText,
      targetClass: 'Diamond',
      targetSubject: '__ALL__',
      replaceExisting: false,
      currentStudents: ALL_SVA_STUDENTS,
      baseExamConfig: SA1_CONFIG,
      getClassNumberForSection,
    });

    assert.equal(result.matchedStudentCount, 2);
    const s1 = result.updatedStudents.find((s) => s.rollNo === '01' && s.section === 'Diamond');
    const s2 = result.updatedStudents.find((s) => s.rollNo === '02' && s.section === 'Diamond');
    assert.equal(s1?.marks.English, 91);
    assert.equal(s1?.marks.Science, 93);
    assert.equal(s2?.marks.English, 84);
    assert.equal(s2?.marks.Science, 89);
  });

  it('replaceExisting clears marks ONLY in targeted class and subject for unlisted students', () => {
    const rawText = '01 Anjali Sandip Chavan 88';
    const diamondCount = ALL_SVA_STUDENTS.filter((s) => s.section === 'Diamond').length;

    const result = parsePastedMarksText({
      rawText,
      targetClass: 'Diamond',
      targetSubject: 'English',
      replaceExisting: true,
      currentStudents: ALL_SVA_STUDENTS,
      baseExamConfig: SA1_CONFIG,
      getClassNumberForSection,
    });

    assert.equal(result.matchedStudentCount, 1);
    const s1 = result.updatedStudents.find((s) => s.rollNo === '01' && s.section === 'Diamond');
    const s2 = result.updatedStudents.find((s) => s.rollNo === '02' && s.section === 'Diamond');
    const sparkleS1 = result.updatedStudents.find(
      (s) => s.rollNo === '01' && s.section === 'Sparkle'
    );

    assert.equal(diamondCount > 1, true);
    assert.equal(s1?.marks.English, 88);
    assert.equal(s2?.marks.English, null);
    // Other subject of s2 and other class remain intact
    assert.notEqual(s2?.marks.Maths, null);
    assert.notEqual(sparkleS1?.marks.English, null);
  });
});
