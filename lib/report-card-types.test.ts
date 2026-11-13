import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeGrade,
  evaluateCustomFormula,
  computeStudentResult,
  computeClassResults,
  SubjectConfig,
  StudentReportRow,
  getDefaultSubjectComponents,
  computeSubjectTotalFromBreakdown,
  InternalComponentConfig,
  syncBreakdownWithTotal,
  mergePulledStudentsWithRoster,
  PT_EXAM_SUBJECT_NAMES,
  PT_EXAM_CLASS9_SUBJECT_NAMES,
  REPORT_CARD_GRADING_SYSTEM,
  isPtExam,
  hasCsInPtExam,
  getPtSubjectsForClass,
  getEffectiveExamConfigForClass,
  getPtExamHeading,
  getPtSubjectDisplayName,
  formatPtPercentage,
  getStudentPtProfile,
} from './report-card-types';

const SAMPLE_SUBJECTS: SubjectConfig[] = [
  { name: 'English', maxMarks: 80, passMarks: 26 },
  { name: 'Hindi', maxMarks: 80, passMarks: 26 },
  { name: 'Maths', maxMarks: 80, passMarks: 26 },
  { name: 'Science', maxMarks: 80, passMarks: 26 },
];

test('computeGrade maps percentage to the 9-point report card grading system', () => {
  assert.equal(computeGrade(95), 'A1');
  assert.equal(computeGrade(85), 'A2');
  assert.equal(computeGrade(75), 'B1');
  assert.equal(computeGrade(65), 'B2');
  assert.equal(computeGrade(55), 'C1');
  assert.equal(computeGrade(45), 'C2');
  assert.equal(computeGrade(35), 'D');
  assert.equal(computeGrade(32), 'D');
  assert.equal(computeGrade(25), 'E1');
  assert.equal(computeGrade(20), 'E1');
  assert.equal(computeGrade(19), 'E2');
  assert.equal(computeGrade(10), 'E2');
});

test('PT report card helpers format PT exams, Class 6-8 (6 subjects) vs Class 9 (7 subjects with CS), truncated percentage, and student profile', () => {
  assert.deepEqual(PT_EXAM_SUBJECT_NAMES, [
    'English',
    'Hindi',
    'Marathi',
    'Maths',
    'Science',
    'Social Science',
  ]);
  assert.deepEqual(PT_EXAM_CLASS9_SUBJECT_NAMES, [
    'English',
    'Hindi',
    'Marathi',
    'Maths',
    'Science',
    'Social Science',
    'Computer Science',
  ]);
  assert.equal(hasCsInPtExam('Twinkle'), false);
  assert.equal(hasCsInPtExam('Sparkle'), false);
  assert.equal(hasCsInPtExam('Topaz'), false);
  assert.equal(hasCsInPtExam('Garnet'), false);
  assert.equal(hasCsInPtExam('Diamond'), true);
  assert.equal(hasCsInPtExam('Ruby'), true);
  assert.equal(hasCsInPtExam('Class 9'), true);
  assert.equal(getPtSubjectsForClass('Twinkle').length, 6);
  assert.equal(getPtSubjectsForClass('Diamond').length, 7);
  assert.equal(getPtSubjectsForClass('Ruby')[6].name, 'Computer Science');

  const pt1Base = {
    id: 'PT-1',
    name: 'PT-1 (Periodic Test 1)',
    code: 'PT-1',
    totalFormula: 'SUM' as const,
    subjects: getPtSubjectsForClass('Twinkle'),
  };
  assert.equal(getEffectiveExamConfigForClass(pt1Base, 'Twinkle').subjects.length, 6);
  assert.equal(getEffectiveExamConfigForClass(pt1Base, 'Diamond').subjects.length, 7);
  assert.equal(getEffectiveExamConfigForClass(pt1Base, 'Ruby').subjects.length, 7);

  assert.equal(REPORT_CARD_GRADING_SYSTEM.length, 9);
  assert.equal(isPtExam('PT-1'), true);
  assert.equal(isPtExam('PT-4'), true);
  assert.equal(isPtExam('SA-1'), false);
  assert.equal(getPtExamHeading('PT-1'), 'PERIODIC TEST - 1');
  assert.equal(getPtExamHeading('PT-3'), 'PERIODIC TEST - 3');
  assert.equal(getPtSubjectDisplayName('Maths'), 'MATHEMATICS');
  assert.equal(getPtSubjectDisplayName('Social Science'), 'SOCIAL SCIENCE');
  assert.equal(getPtSubjectDisplayName('Computer Science'), 'COMPUTER SCIENCE');
  assert.equal(formatPtPercentage(145, 150), '96.66');

  const profile = getStudentPtProfile({
    id: 'STU-2026-0031',
    rollNo: '01',
    name: 'Aayush Satish Nalawade',
    admissionNo: 'ADM-031',
    class: 'Class 6',
    section: 'Twinkle',
    marks: {},
  });
  assert.equal(profile.rollNoDisplay, '1');
  assert.equal(profile.classSectionDisplay, 'VI - Twinkle');
  assert.equal(profile.dobDisplay, '09/02/2015');
  assert.equal(profile.fatherNameDisplay, 'Satish');
  assert.equal(profile.motherNameDisplay, 'Reshma');
  assert.equal(profile.house, 'Sinhagad');
  assert.equal(profile.height, '129');
  assert.equal(profile.weight, '21');
  assert.equal(profile.attendance, '31/31');

  // Verify user-edited fatherName and motherName (even starting with Mrs.) are preserved on the report card
  const editedProfile = getStudentPtProfile({
    id: 'STU-2026-0031',
    rollNo: '01',
    name: 'Aayush Satish Nalawade',
    admissionNo: 'ADM-031',
    class: 'Class 6',
    section: 'Twinkle',
    fatherName: 'Ramesh Nalawade',
    motherName: 'Mrs. Sunita Nalawade',
    dob: '2014-08-15',
    marks: {},
  });
  assert.equal(editedProfile.fatherNameDisplay, 'Ramesh Nalawade');
  assert.equal(editedProfile.motherNameDisplay, 'Mrs. Sunita Nalawade');
  assert.equal(editedProfile.dobDisplay, '15/08/2014');
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

test('getDefaultSubjectComponents and computeSubjectTotalFromBreakdown support custom internal exams combined with main exam', () => {
  const defaultEng = getDefaultSubjectComponents('English', 'SA-1');
  assert.equal(defaultEng.length, 5);
  assert.equal(defaultEng.reduce((sum, c) => sum + c.maxMarks, 0), 100);

  const customComponents: InternalComponentConfig[] = [
    { key: 'unitTest1', label: 'Unit Test 1', maxMarks: 10, isMainExam: false, linkedExamId: 'PT-1' },
    { key: 'oralExam', label: 'Oral Exam', maxMarks: 10, isMainExam: false },
    { key: 'writtenExam', label: 'SA-1', maxMarks: 80, isMainExam: true },
  ];

  const total = computeSubjectTotalFromBreakdown(
    'English',
    'Diamond',
    { unitTest1: 9, oralExam: 8, writtenExam: 71 },
    customComponents
  );
  assert.equal(total, 88);

  const partialAbsentTotal = computeSubjectTotalFromBreakdown(
    'English',
    'Diamond',
    { unitTest1: 9, oralExam: 'AB', writtenExam: 71 },
    customComponents
  );
  assert.equal(partialAbsentTotal, 80);

  const hindiPartialAbsent = computeSubjectTotalFromBreakdown(
    'Hindi',
    'Diamond',
    { listening: 17, speaking: 'AB', project: 13, saExam: 33 }
  );
  assert.equal(hindiPartialAbsent, 63);

  const allAbsentTotal = computeSubjectTotalFromBreakdown(
    'English',
    'Diamond',
    { unitTest1: 'AB', oralExam: 'AB', writtenExam: 'AB' },
    customComponents
  );
  assert.equal(allAbsentTotal, 'AB');
});

test('evaluateCustomFormula handles internal component integration (SUM_INTERNAL, SUM_MAIN, [Subject:Internal], and weights)', () => {
  const subjects: SubjectConfig[] = [
    {
      name: 'English',
      maxMarks: 100,
      passMarks: 33,
      components: [
        { key: 'penPaper', label: 'Pen Paper', maxMarks: 5, isMainExam: false },
        { key: 'multipleAssessment', label: 'Multiple Assessment', maxMarks: 5, isMainExam: false },
        { key: 'writtenExam', label: 'Main SA-1', maxMarks: 90, isMainExam: true },
      ],
    },
    {
      name: 'Maths',
      maxMarks: 100,
      passMarks: 33,
      components: [
        { key: 'penPaper', label: 'Pen Paper', maxMarks: 10, isMainExam: false },
        { key: 'writtenExam', label: 'Main SA-1', maxMarks: 90, isMainExam: true },
      ],
    },
  ];

  const marks = { English: 88, Maths: 92 };
  const breakdowns = {
    English: { penPaper: 4, multipleAssessment: 4, writtenExam: 80 },
    Maths: { penPaper: 9, writtenExam: 83 },
  };

  // 1. SUM_MAIN + SUM_INTERNAL: 80 + 83 = 163 main, 8 + 9 = 17 internal => 180 / 200
  const res1 = evaluateCustomFormula('SUM_MAIN + SUM_INTERNAL', marks, subjects, breakdowns);
  assert.equal(res1.obtained, 180);
  assert.equal(res1.max, 200);

  // 2. SUM_MAIN + (SUM_INTERNAL * 0.5): 163 + (17 * 0.5) = 171.5, max 180 + (20 * 0.5) = 190
  const res2 = evaluateCustomFormula('SUM_MAIN + (SUM_INTERNAL * 0.5)', marks, subjects, breakdowns);
  assert.equal(res2.obtained, 171.5);
  assert.equal(res2.max, 190);

  // 3. Subject specific tokens: [English:Internal] + [English:Main] => 8 + 80 = 88 / 100
  const res3 = evaluateCustomFormula('[English:Internal] + [English:Main]', marks, subjects, breakdowns);
  assert.equal(res3.obtained, 88);
  assert.equal(res3.max, 100);

  // 4. Paper aliases: P1_MAIN + P1_INT => 80 + 8 = 88 / 100
  const res4 = evaluateCustomFormula('P1_MAIN + P1_INT', marks, subjects, breakdowns);
  assert.equal(res4.obtained, 88);
  assert.equal(res4.max, 100);

  // 5. Direct internal component: [English:Pen Paper] => 4 / 5
  const res5 = evaluateCustomFormula('[English:Pen Paper]', marks, subjects, breakdowns);
  assert.equal(res5.obtained, 4);
  assert.equal(res5.max, 5);
});

test('computeClassResults and getEffectiveExamConfigForClass support All Classes vs Specific Class overrides', () => {
  const students: StudentReportRow[] = [
    {
      id: 'STU-SPARKLE',
      rollNo: '01',
      name: 'Sparkle Student',
      admissionNo: 'ADM-S1',
      class: 'Class 6',
      section: 'Sparkle',
      marks: { English: 90, Hindi: 80, Maths: 90, Science: 80 },
      breakdowns: {
        English: { penPaper: 5, multipleAssessment: 5, subjectEnrichment: 5, portfolio: 5, writtenExam: 70 },
        Hindi: { penPaper: 4, multipleAssessment: 4, subjectEnrichment: 4, portfolio: 4, writtenExam: 64 },
        Maths: { penPaper: 5, multipleAssessment: 5, subjectEnrichment: 5, portfolio: 5, writtenExam: 70 },
        Science: { penPaper: 4, multipleAssessment: 4, subjectEnrichment: 4, portfolio: 4, writtenExam: 64 },
      },
    },
    {
      id: 'STU-DIAMOND',
      rollNo: '01',
      name: 'Diamond Student',
      admissionNo: 'ADM-D1',
      class: 'Class 9',
      section: 'Diamond',
      marks: { English: 90, Hindi: 80, Maths: 90, Science: 80 },
      breakdowns: {
        English: { penPaper: 5, multipleAssessment: 5, subjectEnrichment: 5, portfolio: 5, writtenExam: 70 },
        Hindi: { penPaper: 4, multipleAssessment: 4, subjectEnrichment: 4, portfolio: 4, writtenExam: 64 },
        Maths: { penPaper: 5, multipleAssessment: 5, subjectEnrichment: 5, portfolio: 5, writtenExam: 70 },
        Science: { penPaper: 4, multipleAssessment: 4, subjectEnrichment: 4, portfolio: 4, writtenExam: 64 },
      },
    },
  ];

  const subjects100: SubjectConfig[] = [
    { name: 'English', maxMarks: 100, passMarks: 33 },
    { name: 'Hindi', maxMarks: 100, passMarks: 33 },
    { name: 'Maths', maxMarks: 100, passMarks: 33 },
    { name: 'Science', maxMarks: 100, passMarks: 33 },
  ];

  // All Classes default is SUM (340/400), but Diamond has Specific Class override SUM_MAIN (268/320)
  const results = computeClassResults(students, subjects100, 'SUM', undefined, undefined, {
    Diamond: {
      totalFormula: 'CUSTOM',
      customFormula: 'SUM_MAIN',
    },
  });

  const sparkleRes = results.find((r) => r.student.id === 'STU-SPARKLE');
  const diamondRes = results.find((r) => r.student.id === 'STU-DIAMOND');

  assert.equal(sparkleRes?.totalObtained, 340);
  assert.equal(sparkleRes?.totalMax, 400);

  assert.equal(diamondRes?.totalObtained, 268);
  assert.equal(diamondRes?.totalMax, 320);
});

test('syncBreakdownWithTotal and mergePulledStudentsWithRoster keep marks and breakdowns synchronized', () => {
  const subjectNames = ['English', 'Hindi', 'Marathi', 'Maths', 'Science', 'Social Science', 'Computer Science'];
  const sa1Config = {
    id: 'SA-1',
    name: 'SA-1',
    code: 'SA-1',
    totalFormula: 'SUM' as const,
    subjects: subjectNames.map((name) => ({
      name,
      maxMarks: 100,
      passMarks: 33,
      components: getDefaultSubjectComponents(name, 'SA-1'),
    })),
  };
  const engComponents = sa1Config.subjects.find((s) => s.name === 'English')?.components;

  // 1. Syncing a new total mark updates breakdown so computeSubjectTotalFromBreakdown matches exact mark
  const bd94 = syncBreakdownWithTotal(94, 'English', 'Sparkle', engComponents);
  assert.ok(bd94);
  assert.equal(
    computeSubjectTotalFromBreakdown('English', 'Sparkle', bd94, engComponents),
    94
  );

  // 2. Syncing null returns undefined so cleared cells stay cleared
  const bdNull = syncBreakdownWithTotal(null, 'English', 'Sparkle', engComponents, bd94);
  assert.equal(bdNull, undefined);

  // 3. Merging pulled students from Google Sheets updates marks and reconciles breakdowns while preserving metadata
  const existingRoster: StudentReportRow[] = [
    {
      id: 'sva-sparkle-1',
      rollNo: '01',
      name: 'Aarav Sharma',
      admissionNo: 'SVA-2026-SPA-01',
      class: 'Class 6',
      section: 'Sparkle',
      dob: '2012-05-14',
      fatherName: 'Rajesh Sharma',
      motherName: 'Sunita Sharma',
      marks: { English: 75, Hindi: 70, Marathi: 80, Maths: 85, Science: 78, 'Social Science': 82, 'Computer Science': 90 },
    },
  ];

  const pulledFromSheets: StudentReportRow[] = [
    {
      id: 'sheet-row-1',
      rollNo: '1',
      name: 'Aarav Sharma',
      admissionNo: 'sheet-row-1',
      class: 'Class 6',
      section: 'Sparkle',
      marks: { English: 96, Hindi: 88, Marathi: 91, Maths: 99, Science: 94, 'Social Science': 90, 'Computer Science': 98 },
      customRemarks: 'Synced from Google Sheets',
    },
  ];

  const merged = mergePulledStudentsWithRoster(existingRoster, pulledFromSheets, sa1Config);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, 'sva-sparkle-1');
  assert.equal(merged[0].fatherName, 'Rajesh Sharma');
  assert.equal(merged[0].marks.English, 96);
  assert.equal(merged[0].marks.Maths, 99);

  // Compute result for merged student in SA-1 and verify the pulled marks are reflected in totalObtained
  const computed = computeStudentResult(merged[0], sa1Config.subjects, 'SUM');
  assert.equal(computed.totalObtained, 96 + 88 + 91 + 99 + 94 + 90 + 98);
});

test('PT exam configured to 20m sets Computer Science to 20m for Class 9 (Total 140) and scales 100m pulled sheet marks into <= 20', () => {
  const pt2Config20m = {
    id: 'PT-2',
    name: 'PT-2 (Periodic Test 2)',
    code: 'PT-2',
    totalFormula: 'SUM' as const,
    subjects: PT_EXAM_SUBJECT_NAMES.map((name) => ({
      name,
      maxMarks: 20,
      passMarks: 7,
      components: [{ key: 'writtenExam', label: 'PT-2 Main Exam', maxMarks: 20, isMainExam: true }],
    })),
  };

  // 1. Effective config for 9 Diamond has 7 subjects all with maxMarks = 20, passMarks = 7
  const diamondCfg = getEffectiveExamConfigForClass(pt2Config20m, 'Diamond');
  assert.equal(diamondCfg.subjects.length, 7);
  diamondCfg.subjects.forEach((sub) => {
    assert.equal(sub.maxMarks, 20, `${sub.name} should have maxMarks 20`);
    assert.equal(sub.passMarks, 7, `${sub.name} should have passMarks 7`);
  });

  // 2. Merging 100-mark sheet scores (86, 96, 98, 96, 88, 89, 92) into PT-2 (20m) scales them to <= 20
  const roster: StudentReportRow[] = [
    {
      id: 'STU-2026-0246',
      rollNo: '01',
      name: 'Anjali Sandip Chavan',
      admissionNo: 'ADM-246',
      class: 'Class 9',
      section: 'Diamond',
      marks: {
        English: 17,
        Hindi: 12,
        Marathi: 20,
        Maths: 19,
        Science: 18,
        'Social Science': 18,
        'Computer Science': 18,
      },
    },
  ];

  const pulled100m = [
    {
      id: 'STU-2026-0246',
      rollNo: '01',
      name: 'Anjali Sandip Chavan',
      section: 'Diamond',
      marks: {
        English: 86,
        Hindi: 96,
        Marathi: 98,
        Maths: 96,
        Science: 88,
        'Social Science': 89,
        'Computer Science': 92,
      },
    },
  ];

  const merged = mergePulledStudentsWithRoster(roster, pulled100m, pt2Config20m);
  assert.equal(merged[0].marks.English, 17);
  assert.equal(merged[0].marks.Hindi, 19);
  assert.equal(merged[0].marks.Marathi, 20);
  assert.equal(merged[0].marks.Maths, 19);
  assert.equal(merged[0].marks.Science, 18);
  assert.equal(merged[0].marks['Social Science'], 18);
  assert.equal(merged[0].marks['Computer Science'], 18);

  // 3. computeClassResults for 9 Diamond in PT-2 (20m) yields totalMax = 140 and percentage <= 100%
  const classResults = computeClassResults(
    merged,
    pt2Config20m.subjects,
    'SUM',
    undefined,
    undefined,
    undefined,
    'PT-2'
  );
  assert.equal(classResults[0].totalMax, 140);
  assert.equal(classResults[0].totalObtained, 17 + 19 + 20 + 19 + 18 + 18 + 18);
  assert.ok(classResults[0].percentage <= 100);
});

test('all formula presets (SUM, BEST_5, BEST(5), BEST(6), SUM_MAIN, excluded subject) stay 100% synchronized across computeStudentResult and evaluateCustomFormula', () => {
  const subjects7: SubjectConfig[] = [
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
    passMarks: 33,
    components: getDefaultSubjectComponents(name, 'SA-1'),
  }));

  const student: StudentReportRow = {
    id: 'STU-SYNC-1',
    rollNo: '01',
    name: 'Anjali Sandip Chavan',
    admissionNo: 'ADM-246',
    class: 'Class 9',
    section: 'Diamond',
    marks: {
      English: 86,
      Hindi: 96,
      Marathi: 98,
      Maths: 96,
      Science: 88,
      'Social Science': 89,
      'Computer Science': 92,
    },
  };

  // 1. All 7 subjects (SUM) -> 645 / 700
  const resSum = computeStudentResult(student, subjects7, 'SUM');
  assert.equal(resSum.totalObtained, 645);
  assert.equal(resSum.totalMax, 700);
  assert.equal(resSum.grade, 'A1');

  // 2. Best 5 subjects via BEST_5 or CUSTOM BEST(5) -> top 5 are 98, 96, 96, 92, 89 = 471 / 500
  const resBest5Enum = computeStudentResult(student, subjects7, 'BEST_5');
  const resBest5Custom = computeStudentResult(student, subjects7, 'CUSTOM', 'BEST(5)');
  assert.equal(resBest5Enum.totalObtained, 471);
  assert.equal(resBest5Enum.totalMax, 500);
  assert.equal(resBest5Custom.totalObtained, 471);
  assert.equal(resBest5Custom.totalMax, 500);
  assert.equal(resBest5Enum.percentage, resBest5Custom.percentage);

  // 3. Best 6 subjects via CUSTOM BEST(6) -> top 6 are 98, 96, 96, 92, 89, 88 = 559 / 600
  const resBest6 = computeStudentResult(student, subjects7, 'CUSTOM', 'BEST(6)');
  assert.equal(resBest6.totalObtained, 559);
  assert.equal(resBest6.totalMax, 600);

  // 4. Written Exam Only (SUM_MAIN) works even when student.breakdowns was initially undefined
  const resWrittenOnly = computeStudentResult(student, subjects7, 'CUSTOM', 'SUM_MAIN');
  const resInternalOnly = computeStudentResult(student, subjects7, 'CUSTOM', 'SUM_INTERNAL');
  assert.ok(resWrittenOnly.totalObtained > 0);
  assert.ok(resInternalOnly.totalObtained > 0);
  // Written + Internal equals full 645 / 700
  assert.equal(resWrittenOnly.totalObtained + resInternalOnly.totalObtained, 645);
  assert.equal(resWrittenOnly.totalMax + resInternalOnly.totalMax, 700);

  // 5. Excluding Computer Science via bracket formula [English] + [Hindi] + [Marathi] + [Maths] + [Science] + [Social Science]
  const res6Sub = computeStudentResult(
    student,
    subjects7,
    'CUSTOM',
    '[English] + [Hindi] + [Marathi] + [Maths] + [Science] + [Social Science]'
  );
  assert.equal(res6Sub.totalObtained, 645 - 92);
  assert.equal(res6Sub.totalMax, 600);
});

test('excluded subject fails or AB do not mark student FAIL/ABSENT, and component summaries compute dynamic denominators', async () => {
  const { computeSubjectComponentSummary } = await import('./report-card-types');
  const subjects: SubjectConfig[] = [
    { name: 'English', maxMarks: 50, passMarks: 17, includedInTotal: true, components: [
      { key: 'internalMarks', label: 'Internal', maxMarks: 15, isMainExam: false },
      { key: 'writtenExam', label: 'Written', maxMarks: 35, isMainExam: true },
    ]},
    { name: 'Optional GK', maxMarks: 50, passMarks: 17, includedInTotal: false },
  ];
  const student: StudentReportRow = {
    id: 'STU-EX-1',
    rollNo: '01',
    name: 'Test Student',
    admissionNo: 'ADM-EX',
    class: 'Class 6',
    section: 'Sparkle',
    marks: { English: 42, 'Optional GK': 'AB' },
    breakdowns: { English: { internalMarks: 13, writtenExam: 29 } },
  };
  const res = computeStudentResult(student, subjects, 'SUM');
  assert.equal(res.status, 'PASS');
  assert.equal(res.totalObtained, 42);
  assert.equal(res.totalMax, 50);
  assert.equal(res.subjectDetails[0].internalObtained, 13);
  assert.equal(res.subjectDetails[0].internalMax, 15);
  assert.equal(res.subjectDetails[0].mainObtained, 29);
  assert.equal(res.subjectDetails[0].mainMax, 35);

  const summary = computeSubjectComponentSummary('English', subjects[0].components, student.breakdowns?.English);
  assert.deepEqual(summary, {
    internalObtained: 13,
    internalMax: 15,
    mainObtained: 29,
    mainMax: 35,
    hasInternalSplit: true,
  });
});




