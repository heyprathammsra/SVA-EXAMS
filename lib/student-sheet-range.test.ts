import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHEET_COLUMNS,
  applyTsvPasteToStudents,
  clearSheetRange,
  fillDownSheetRange,
  getSheetCellDisplayValue,
  normalizeSheetDateValue,
  normalizeSheetHouseValue,
  normalizeSheetRange,
  parseTsvClipboardMatrix,
  serializeSheetRangeToTsv,
} from './student-sheet-range';
import { StudentReportRow } from './report-card-types';

const SAMPLE_STUDENTS: StudentReportRow[] = [
  {
    id: 's1',
    rollNo: '01',
    name: 'Aarav Patil',
    section: 'Sparkle',
    class: 'Class 6',
    dob: '2014-05-12',
    fatherName: 'Rajesh Patil',
    motherName: 'Sneha Patil',
    house: 'Sinhagad',
    height: '142',
    weight: '34',
    attendance: '29/31',
    marks: {},
  },
  {
    id: 's2',
    rollNo: '02',
    name: 'Diya Kulkarni',
    section: 'Sparkle',
    class: 'Class 6',
    dob: '2014-08-21',
    fatherName: 'Amit Kulkarni',
    motherName: 'Pooja Kulkarni',
    house: 'Raigad',
    height: '138',
    weight: '31',
    attendance: '30/31',
    marks: {},
  },
  {
    id: 's3',
    rollNo: '03',
    name: 'Kabir Joshi',
    section: 'Sparkle',
    class: 'Class 6',
    dob: '2014-11-04',
    fatherName: 'Suresh Joshi',
    motherName: 'Meera Joshi',
    house: 'Shivneri',
    height: '145',
    weight: '36',
    attendance: '28/31',
    marks: {},
  },
];

test('normalizeSheetRange clamps reversed and out-of-bounds coordinates', () => {
  const norm = normalizeSheetRange(
    { start: { rowIdx: 5, colIdx: 9 }, end: { rowIdx: 0, colIdx: -2 } },
    2,
    SHEET_COLUMNS.length - 1
  );
  assert.deepEqual(norm, {
    minRow: 0,
    maxRow: 2,
    minCol: 0,
    maxCol: 9,
    rowCount: 3,
    colCount: 10,
    cellCount: 30,
  });
  assert.equal(normalizeSheetRange(null, 2), null);
  assert.equal(
    normalizeSheetRange({ start: { rowIdx: 0, colIdx: 0 }, end: { rowIdx: 0, colIdx: 0 } }, -1),
    null
  );
});

test('normalizeSheetDateValue supports ISO, DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY', () => {
  assert.equal(normalizeSheetDateValue('2014-05-12'), '2014-05-12');
  assert.equal(normalizeSheetDateValue('12/05/2014'), '2014-05-12');
  assert.equal(normalizeSheetDateValue('5-9-2014'), '2014-09-05');
  assert.equal(normalizeSheetDateValue('21.08.2014'), '2014-08-21');
  assert.equal(normalizeSheetDateValue('not-a-date'), '');
});

test('normalizeSheetHouseValue handles case-insensitive & unique prefixes safely', () => {
  assert.equal(normalizeSheetHouseValue('raigad'), 'Raigad');
  assert.equal(normalizeSheetHouseValue('SHIVNERI'), 'Shivneri');
  assert.equal(normalizeSheetHouseValue('sin'), 'Sinhagad');
  assert.equal(normalizeSheetHouseValue('sh'), 'Shivneri');
  assert.equal(normalizeSheetHouseValue('pratap'), 'Pratapgad');
  // Ambiguous prefix 's' matches Sinhagad & Shivneri -> null
  assert.equal(normalizeSheetHouseValue('s'), null);
  assert.equal(normalizeSheetHouseValue('Unknown'), null);
});

test('serializeSheetRangeToTsv exports rectangular student range faithfully', () => {
  const range = normalizeSheetRange(
    { start: { rowIdx: 0, colIdx: 5 }, end: { rowIdx: 1, colIdx: 9 } },
    SAMPLE_STUDENTS.length - 1
  )!;
  const tsv = serializeSheetRangeToTsv(SAMPLE_STUDENTS, range);
  assert.equal(
    tsv,
    'Sinhagad\t142\t34\t29\t31\nRaigad\t138\t31\t30\t31'
  );
  assert.equal(getSheetCellDisplayValue(SAMPLE_STUDENTS[2], 'attendancePresent'), '28');
});

test('parseTsvClipboardMatrix handles Windows CRLF and trailing Excel newline', () => {
  const parsed = parseTsvClipboardMatrix('A\tB\r\nC\tD\r\n');
  assert.deepEqual(parsed, [
    ['A', 'B'],
    ['C', 'D'],
  ]);
  assert.deepEqual(parseTsvClipboardMatrix(''), []);
});

test('applyTsvPasteToStudents updates multi-row multi-col range & merges both attendance columns atomically', () => {
  const res = applyTsvPasteToStudents({
    classStudents: SAMPLE_STUDENTS,
    targetRange: normalizeSheetRange(
      { start: { rowIdx: 0, colIdx: 2 }, end: { rowIdx: 0, colIdx: 2 } },
      2
    ),
    startRow: 0,
    startCol: 2,
    tsvText:
      '14/06/2014\tVijay Patil\tAsha Patil\tpratapgad\t150\t40\t35\t36\n15-07-2014\tNitin K\tRina K\tshiv\t149\t39\t34\t36\n',
  });

  assert.equal(res.updatedRowCount, 2);
  assert.equal(res.updatedCellCount, 16);
  assert.deepEqual(res.patchesByStudentId['s1'], {
    dob: '2014-06-14',
    fatherName: 'Vijay Patil',
    motherName: 'Asha Patil',
    house: 'Pratapgad',
    height: '150',
    weight: '40',
    attendance: '35/36',
  });
  assert.deepEqual(res.patchesByStudentId['s2'], {
    dob: '2014-07-15',
    fatherName: 'Nitin K',
    motherName: 'Rina K',
    house: 'Shivneri',
    height: '149',
    weight: '39',
    attendance: '34/36',
  });
});

test('applyTsvPasteToStudents broadcasts single 1x1 value across multi-cell selected range', () => {
  const targetRange = normalizeSheetRange(
    { start: { rowIdx: 0, colIdx: 5 }, end: { rowIdx: 2, colIdx: 5 } },
    2
  );
  const res = applyTsvPasteToStudents({
    classStudents: SAMPLE_STUDENTS,
    targetRange,
    startRow: 0,
    startCol: 5,
    tsvText: 'Raigad',
  });

  assert.equal(res.updatedRowCount, 3);
  assert.equal(res.updatedCellCount, 3);
  assert.equal(res.patchesByStudentId['s1'].house, 'Raigad');
  assert.equal(res.patchesByStudentId['s2'].house, 'Raigad');
  assert.equal(res.patchesByStudentId['s3'].house, 'Raigad');
});

test('applyTsvPasteToStudents appends missing student rows when allowAppendRows=true and name present', () => {
  const res = applyTsvPasteToStudents({
    classStudents: [],
    targetRange: null,
    startRow: 0,
    startCol: 0,
    allowAppendRows: true,
    tsvText: '01\tNeha More\t10/03/2015\tAnil More\tSeema More\tSinhagad\t135\t30\t30\t31\n02\tRohan Mane\t11/04/2015\tDeepak Mane\tKiran Mane\tRaigad\t137\t32\t31\t31',
  });

  assert.equal(Object.keys(res.patchesByStudentId).length, 0);
  assert.equal(res.studentsToAppend.length, 2);
  assert.deepEqual(res.studentsToAppend[0], {
    rollNo: '01',
    name: 'Neha More',
    dob: '2015-03-10',
    fatherName: 'Anil More',
    motherName: 'Seema More',
    house: 'Sinhagad',
    height: '135',
    weight: '30',
    attendance: '30',
    attendanceOutOf: '31',
  });
  assert.equal(res.studentsToAppend[1].house, 'Raigad');
});

test('fillDownSheetRange copies top row values down through selected rows', () => {
  const range = normalizeSheetRange(
    { start: { rowIdx: 0, colIdx: 5 }, end: { rowIdx: 2, colIdx: 6 } },
    2
  );
  const res = fillDownSheetRange({ classStudents: SAMPLE_STUDENTS, range });

  assert.equal(res.updatedRowCount, 2);
  assert.equal(res.updatedCellCount, 4);
  assert.deepEqual(res.patchesByStudentId['s2'], { house: 'Sinhagad', height: '142' });
  assert.deepEqual(res.patchesByStudentId['s3'], { house: 'Sinhagad', height: '142' });
});

test('clearSheetRange clears optional info cells while protecting Roll No, Name, and House', () => {
  const range = normalizeSheetRange(
    { start: { rowIdx: 0, colIdx: 0 }, end: { rowIdx: 1, colIdx: 9 } },
    2
  );
  const res = clearSheetRange({ classStudents: SAMPLE_STUDENTS, range });

  assert.equal(res.protectedCount, 6); // 2 rows * (rollNo, name, house)
  assert.equal(res.clearedCellCount, 14); // 2 rows * 7 clearable columns
  assert.deepEqual(res.patchesByStudentId['s1'], {
    dob: '',
    fatherName: '',
    motherName: '',
    height: '',
    weight: '',
    attendance: '',
  });
  const clearedStudent = { ...SAMPLE_STUDENTS[0], ...res.patchesByStudentId['s1'] };
  assert.equal(getSheetCellDisplayValue(clearedStudent, 'height'), '');
  assert.equal(getSheetCellDisplayValue(clearedStudent, 'weight'), '');
  assert.equal(getSheetCellDisplayValue(clearedStudent, 'dob'), '');
  assert.equal(getSheetCellDisplayValue(clearedStudent, 'attendancePresent'), '');
  assert.equal(getSheetCellDisplayValue(clearedStudent, 'attendanceOutOf'), '');
});
