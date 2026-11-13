import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseImportedSpreadsheetRows } from './excel-import';
import {
  generateReferenceFormatWorkbookBytes,
  generateConsolidatedWorkbookBytes,
} from './excel-export';
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

function workbookBytesToSheetsMap(bytes: Uint8Array): {
  sheetNames: string[];
  sheetsAoa: Record<string, any[][]>;
} {
  const wb = XLSX.read(bytes, { type: 'array' });
  const sheetsAoa: Record<string, any[][]> = {};
  wb.SheetNames.forEach((name) => {
    sheetsAoa[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], {
      header: 1,
      defval: '',
    }) as any[][];
  });
  return { sheetNames: wb.SheetNames, sheetsAoa };
}

describe('Spreadsheet Import Parser (Round-Trip & Multi-Format Compatibility)', () => {
  it('round-trips multi-tab Reference Workbook (ENGLISH..CS) in consolidated mode including component breakdowns', async () => {
    const editedRoster = ALL_SVA_STUDENTS.map((s) =>
      s.id === 'STU-2026-0246'
        ? {
            ...s,
            marks: { ...s.marks, English: 99, Hindi: 97, 'Computer Science': 95 },
            breakdowns: {
              ...s.breakdowns,
              English: {
                penPaper: 5,
                multipleAssessment: 5,
                subjectEnrichment: 5,
                portfolio: 5,
                internalMarks: 20,
                writtenExam: 79,
              },
              Hindi: {
                listening: 20,
                speaking: 20,
                project: 15,
                saExam: 42,
              },
              'Computer Science': {
                internalMarks: 20,
                writtenExam: 75,
              },
            },
          }
        : s
    );

    const { bytes } = await generateReferenceFormatWorkbookBytes({
      students: editedRoster,
      examConfig: SA1_CONFIG,
      examId: 'SA-1',
      classScope: 'Diamond',
      subjectScope: 'all_consolidated',
    });

    const { sheetNames, sheetsAoa } = workbookBytesToSheetsMap(bytes);
    const parsed = parseImportedSpreadsheetRows({
      sheetNames,
      sheetsAoa,
      uploadMode: 'consolidated',
      uploadTargetSubject: 'English',
      selectedClass: 'Diamond',
      baseExamConfig: SA1_CONFIG,
      currentStudents: ALL_SVA_STUDENTS,
      getClassNumberForSection,
    });

    assert.ok(parsed.success);
    assert.ok(parsed.importedCount >= 35);
    const updatedAnjali = parsed.updatedStudents.find((s) => s.id === 'STU-2026-0246');
    assert.ok(updatedAnjali);
    assert.equal(updatedAnjali.marks.English, 99);
    assert.equal(updatedAnjali.breakdowns?.English?.writtenExam, 79);
    assert.equal(updatedAnjali.marks.Hindi, 97);
    assert.equal(updatedAnjali.breakdowns?.Hindi?.saExam, 42);
    assert.equal(updatedAnjali.marks['Computer Science'], 95);
    assert.equal(updatedAnjali.breakdowns?.['Computer Science']?.writtenExam, 75);
  });

  it('round-trips Consolidated SA 2-row merged sheet with NAME OF THE STUDENTS headers', async () => {
    const { bytes } = await generateConsolidatedWorkbookBytes({
      students: ALL_SVA_STUDENTS.map((s) =>
        s.id === 'STU-2026-0246'
          ? {
              ...s,
              marks: { ...s.marks, Science: 94 },
              breakdowns: {
                ...s.breakdowns,
                Science: {
                  penPaper: 5,
                  multipleAssessment: 4,
                  subjectEnrichment: 5,
                  portfolio: 5,
                  internalMarks: 19,
                  writtenExam: 75,
                },
              },
            }
          : s
      ),
      examConfig: SA1_CONFIG,
      examId: 'SA-1',
      classScope: 'Diamond',
    });

    const { sheetNames, sheetsAoa } = workbookBytesToSheetsMap(bytes);
    const parsed = parseImportedSpreadsheetRows({
      sheetNames,
      sheetsAoa,
      uploadMode: 'consolidated',
      uploadTargetSubject: 'English',
      selectedClass: 'Diamond',
      baseExamConfig: SA1_CONFIG,
      currentStudents: ALL_SVA_STUDENTS,
      getClassNumberForSection,
    });

    assert.ok(parsed.success);
    assert.ok(parsed.importedCount >= 35);
    const updatedAnjali = parsed.updatedStudents.find((s) => s.id === 'STU-2026-0246');
    assert.equal(updatedAnjali?.marks.Science, 94);
    assert.equal(updatedAnjali?.breakdowns?.Science?.writtenExam, 75);
    assert.equal(updatedAnjali?.breakdowns?.Science?.multipleAssessment, 4);
  });

  it('round-trips PT Consolidated single-row parenthetical headers like ENGLISH (25) including Class 9 CS', async () => {
    const ptDiamondRoster = ALL_SVA_STUDENTS.map((s) => ({
      ...s,
      marks: {
        English: 22,
        Hindi: 21,
        Marathi: 23,
        Maths: s.id === 'STU-2026-0246' ? 25 : 20,
        Science: 19,
        'Social Science': 20,
        'Computer Science': 24,
      },
    }));

    const { bytes } = await generateConsolidatedWorkbookBytes({
      students: ptDiamondRoster,
      examConfig: PT1_CONFIG,
      examId: 'PT-1',
      classScope: 'Diamond',
    });

    const { sheetNames, sheetsAoa } = workbookBytesToSheetsMap(bytes);
    const parsed = parseImportedSpreadsheetRows({
      sheetNames,
      sheetsAoa,
      uploadMode: 'consolidated',
      uploadTargetSubject: 'English',
      selectedClass: 'Diamond',
      baseExamConfig: PT1_CONFIG,
      currentStudents: ALL_SVA_STUDENTS,
      getClassNumberForSection,
    });

    assert.ok(parsed.success);
    assert.ok(parsed.importedCount >= 35);
    const updatedAnjali = parsed.updatedStudents.find((s) => s.id === 'STU-2026-0246');
    assert.equal(updatedAnjali?.marks.Maths, 25);
    assert.equal(updatedAnjali?.marks['Computer Science'], 24);
  });

  it('imports single-subject upload templates with Marks Obtained, AB, and custom renamed subjects', () => {
    const customConfig: ExamConfig = {
      ...SA1_CONFIG,
      subjects: SA1_CONFIG.subjects.map((s) =>
        s.name === 'Maths' ? { ...s, name: 'Mathematics' } : s
      ),
    };
    const sheetsAoa: Record<string, any[][]> = {
      Mathematics_Marks: [
        ['SARASWATI VIDYA ACADEMY'],
        ['EXAM: SA-1'],
        ['SUBJECT: Mathematics'],
        ['CLASS: Class 9 - Diamond'],
        [],
        ['Roll No', 'Student Name', 'Class', 'Section', 'Marks Obtained'],
        ['01', 'Anjali Sandip Chavan', 'Class 9', 'Diamond', 97],
        ['02', 'Arohi Mahesh Pawar', 'Class 9', 'Diamond', 'AB'],
      ],
    };

    const parsed = parseImportedSpreadsheetRows({
      sheetNames: ['Mathematics_Marks'],
      sheetsAoa,
      uploadMode: 'subject',
      uploadTargetSubject: 'Mathematics',
      selectedClass: 'Diamond',
      baseExamConfig: customConfig,
      currentStudents: ALL_SVA_STUDENTS,
      getClassNumberForSection,
    });

    assert.ok(parsed.success);
    assert.equal(parsed.importedCount, 2);
    const s1 = parsed.updatedStudents.find((s) => s.rollNo === '01' && s.section === 'Diamond');
    const s2 = parsed.updatedStudents.find((s) => s.rollNo === '02' && s.section === 'Diamond');
    assert.equal(s1?.marks.Mathematics, 97);
    assert.equal(s2?.marks.Mathematics, 'AB');
  });
});
