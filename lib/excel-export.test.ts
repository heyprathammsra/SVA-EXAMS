import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { ALL_SVA_STUDENTS } from './sva-students-data';
import { getDefaultSubjectComponents, ExamConfig } from './report-card-types';
import {
  generateReferenceFormatWorkbookBytes,
  formatReferenceClassHeader,
  getReferenceSubjectTabName,
  getReferenceSubjectHeaderTitle,
} from './excel-export';

const TEST_EXAM_CONFIG: ExamConfig = {
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
    passMarks: 33,
    components: getDefaultSubjectComponents(name, 'SA-1'),
  })),
};

describe('Reference Sheet Format Excel Export (1FuU-gS2AxSG81nDnwSOL5NFlV4PlZ99tCevzmIsgot8)', () => {
  it('formats class and subject headers identically to the reference Google Sheet', () => {
    assert.equal(formatReferenceClassHeader('Diamond'), 'CLASS - IX Diamond 2026 -2027');
    assert.equal(formatReferenceClassHeader('Sparkle'), 'CLASS - VI Sparkle 2026 -2027');
    assert.equal(getReferenceSubjectTabName('Social Science'), 'SS');
    assert.equal(getReferenceSubjectTabName('Computer Science'), 'CS');
    assert.equal(getReferenceSubjectHeaderTitle('Maths'), 'SUBJECT - MATH');
    assert.equal(getReferenceSubjectHeaderTitle('Social Science'), 'SUBJECT - SOCIAL SCIENCE');
    assert.equal(getReferenceSubjectHeaderTitle('Computer Science'), 'SUBJECT - CS');
  });

  it('generates all 7 subject tabs in the exact order and format of the reference sheet', async () => {
    const { bytes, fileName } = await generateReferenceFormatWorkbookBytes({
      students: ALL_SVA_STUDENTS,
      examConfig: TEST_EXAM_CONFIG,
      examId: 'SA-1',
      classScope: 'Diamond',
      subjectScope: 'all_consolidated',
    });

    assert.ok(fileName.includes('IX_Diamond'));
    const wb = XLSX.read(bytes, { type: 'array', cellFormula: true });

    // Exact 7 tab names in exact order
    assert.deepEqual(wb.SheetNames, [
      'ENGLISH',
      'MARATHI',
      'HINDI',
      'MATHS',
      'SCIENCE',
      'SS',
      'CS',
    ]);

    // Check ENGLISH sheet rows
    const engWs = wb.Sheets['ENGLISH'];
    const engAoa = XLSX.utils.sheet_to_json(engWs, { header: 1, defval: '' }) as (string | number)[][];

    assert.equal(engAoa[0][0], 'SARASWATI VIDYA ACADEMY, LONAVALA');
    assert.equal(engAoa[1][0], 'CLASS - IX Diamond 2026 -2027 (SA-1)');
    assert.equal(engAoa[2][0], 'SUBJECT - ENGLISH');
    assert.deepEqual(engAoa[3], [
      'ROLL NO',
      'NAME OF THE STUDENTS',
      'PEN PAPER TEST 5',
      'MULTIPLE ASSESSMENTS 5',
      'SUBJECT ENRICHMENT 5',
      'PORTFOLIO 5',
      'SA -1 80',
      'TOTAL 100',
    ]);

    // Row 5 (index 4): Anjali Sandip Chavan -> 1, Anjali Sandip Chavan, 4, 5, 5, 5, 67, 86
    assert.deepEqual(engAoa[4], [1, 'Anjali Sandip Chavan', 4, 5, 5, 5, 67, 86]);
    assert.equal(engWs['H5']?.f, 'SUM(C5:G5)');

    // Check HINDI sheet rows (Listening 20, Speaking 20, Project 15, SA-1 45, Total 100)
    const hinWs = wb.Sheets['HINDI'];
    const hinAoa = XLSX.utils.sheet_to_json(hinWs, { header: 1, defval: '' }) as (string | number)[][];
    assert.equal(hinAoa[2][0], 'SUBJECT - HINDI');
    assert.deepEqual(hinAoa[4], [1, 'Anjali Sandip Chavan', 20, 20, 15, 41, 96]);
    assert.equal(hinWs['G5']?.f, 'SUM(C5:F5)');

    // Check CS sheet rows (Practicals 20, SA-1 80, Total 100)
    const csWs = wb.Sheets['CS'];
    const csAoa = XLSX.utils.sheet_to_json(csWs, { header: 1, defval: '' }) as (string | number)[][];
    assert.equal(csAoa[2][0], 'SUBJECT - CS');
    assert.deepEqual(csAoa[4], [1, 'Anjali Sandip Chavan', 20, 72, 92]);
    assert.equal(csWs['E5']?.f, 'SUM(C5:D5)');

    // Verify XML borders and row heights in zip
    const zip = await JSZip.loadAsync(bytes);
    const stylesXml = await zip.file('xl/styles.xml')!.async('string');
    assert.ok(stylesXml.includes('<left style="thin"><color rgb="FF000000"/></left>'));
    const sheet1Xml = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    assert.ok(sheet1Xml.includes('ht="24" customHeight="1"'));
  });

  it('omits the duplicate TOTAL column in PT tests (e.g. PT-3 20)', async () => {
    const ptExamConfig: ExamConfig = {
      id: 'PT-3',
      name: 'PT-3 (Periodic Test 3)',
      code: 'PT-3',
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
        maxMarks: 20,
        passMarks: 7,
      })),
    };

    const { bytes } = await generateReferenceFormatWorkbookBytes({
      students: ALL_SVA_STUDENTS,
      examConfig: ptExamConfig,
      examId: 'PT-3',
      classScope: 'Diamond',
      subjectScope: 'all_consolidated',
    });

    const wb = XLSX.read(bytes, { type: 'array' });
    const engWs = wb.Sheets['ENGLISH'];
    const engAoa = XLSX.utils.sheet_to_json(engWs, { header: 1, defval: '' }) as (string | number)[][];

    assert.equal(engAoa[0][0], 'SARASWATI VIDYA ACADEMY, LONAVALA');
    assert.equal(engAoa[1][0], 'CLASS - IX Diamond 2026 -2027 (PT-3)');
    assert.equal(engAoa[2][0], 'SUBJECT - ENGLISH');
    // Row 4 should ONLY have ROLL NO, NAME OF THE STUDENTS, and PT-3 20 (NO duplicate TOTAL 20!)
    assert.deepEqual(engAoa[3], ['ROLL NO', 'NAME OF THE STUDENTS', 'PT-3 20']);
    // Student row has 3 elements: roll, name, mark (<= 20)
    assert.equal(engAoa[4].length, 3);
    assert.equal(engAoa[4][0], 1);
    assert.equal(engAoa[4][1], 'Anjali Sandip Chavan');
    assert.ok(Number(engAoa[4][2]) <= 20);
  });

  it('generates Consolidated Workbook matching demo sheet 1QMuO9-8j9TM-b8zWW_5kIL8rjzwNJBIvSmH6uU9SPmk', async () => {
    const { generateConsolidatedWorkbookBytes } = await import('./excel-export');
    const { bytes, fileName } = await generateConsolidatedWorkbookBytes({
      students: ALL_SVA_STUDENTS,
      examConfig: TEST_EXAM_CONFIG,
      examId: 'SA-1',
      classScope: 'Diamond',
    });

    assert.ok(fileName.includes('Consolidated'));
    assert.ok(fileName.includes('IX_Diamond'));
    assert.ok(fileName.includes('SA-1'));

    const wb = XLSX.read(bytes, { type: 'array', cellFormula: true });
    assert.deepEqual(wb.SheetNames, ['Consolidated', 'Result Analysis']);

    const conWs = wb.Sheets['Consolidated'];
    const conAoa = XLSX.utils.sheet_to_json(conWs, { header: 1, defval: '' }) as (string | number)[][];

    // Check title rows
    assert.equal(conAoa[0][2], 'SARASWATI VIDYA ACADEMY, LONAVALA');
    assert.equal(conAoa[1][2], 'CLASS - IX Diamond 2026 -2027 (SA-1)');
    assert.equal(conAoa[2][2], 'CONSOLIDATED SHEET');

    // Row 4: Group headers
    assert.equal(conAoa[3][0], 'ROLL NO');
    assert.equal(conAoa[3][1], 'NAME OF THE STUDENTS');
    assert.equal(conAoa[3][2], 'ENGLISH');
    assert.equal(conAoa[3][9], 'HINDI');
    assert.equal(conAoa[3][15], 'MARATHI');
    assert.equal(conAoa[3][22], 'MATHS');
    assert.equal(conAoa[3][29], 'SCIENCE');
    assert.equal(conAoa[3][36], 'SOCIAL SCIENCE');
    assert.equal(conAoa[3][43], 'COMPUTER SCIENCE');
    assert.equal(conAoa[3][47], 'OVERALL PERFORMANCE');

    // Row 5: Total 50 columns
    assert.equal(conAoa[4].length, 50);
    assert.equal(conAoa[4][7], 'TOTAL 100');
    assert.equal(conAoa[4][8], 'GRADE');
    assert.equal(conAoa[4][47], 'GRAND TOTAL 700');
    assert.equal(conAoa[4][48], 'PERCENTAGE');
    assert.equal(conAoa[4][49], 'GRADE');

    // Row 6: First student
    assert.equal(conAoa[5][0], 1);
    assert.equal(conAoa[5][1], 'Anjali Sandip Chavan');
    // Active formulas
    assert.equal(conWs['H6']?.f, 'SUM(C6:G6)');
    assert.ok(conWs['I6']?.f?.includes('IF(H6>=91,"A1"'));
    assert.equal(conWs['AV6']?.f, 'SUM(H6,N6,U6,AB6,AI6,AP6,AT6)');
    assert.equal(conWs['AW6']?.f, 'AV6/7');
    assert.ok(conWs['AX6']?.f?.includes('IF(AW6>=91,"A1"'));

    // Check Result Analysis sheet
    const resWs = wb.Sheets['Result Analysis'];
    const resAoa = XLSX.utils.sheet_to_json(resWs, { header: 1, defval: '' }) as (string | number)[][];
    assert.deepEqual(resAoa[0], [
      'ROLL NO',
      'NAME OF THE STUDENT',
      'ENGLISH',
      'HINDI',
      'MARATHI',
      'MATHS',
      'SCIENCE',
      'SS',
      'CS',
      'TOTAL',
      'PERCENTAGE',
    ]);
    assert.equal(resAoa[1][0], 1);
    assert.equal(resAoa[1][1], 'Anjali Sandip Chavan');
    assert.equal(resWs['J2']?.f, 'SUM(C2:I2)');
    assert.equal(resWs['K2']?.f, 'ROUND(J2/700*100,2)');

    // Verify XML styles
    const zip = await JSZip.loadAsync(bytes);
    const stylesXml = await zip.file('xl/styles.xml')!.async('string');
    assert.ok(stylesXml.includes('<left style="thin"><color rgb="FF000000"/></left>'));
  });
});

