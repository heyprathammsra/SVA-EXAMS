import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aoaToBulkStudentTsv,
  parseBulkStudentText,
} from './student-bulk-import';

test('parses plain lines with Roll No + Full Name in multiple punctuation styles', () => {
  const input = [
    '01 Ajinkya Balu Gurav',
    '2. Ankita Rangnath Ghige',
    '03) Anushka Balasaheb Jalhare',
    '4 - Rohit Verma',
  ].join('\n');

  const res = parseBulkStudentText({ rawText: input });
  assert.equal(res.students.length, 4);
  assert.deepEqual(res.students, [
    { rollNo: '01', name: 'Ajinkya Balu Gurav' },
    { rollNo: '02', name: 'Ankita Rangnath Ghige' },
    { rollNo: '03', name: 'Anushka Balasaheb Jalhare' },
    { rollNo: '04', name: 'Rohit Verma' },
  ]);
  assert.equal(res.skippedLines.length, 0);
});

test('auto-assigns sequential roll numbers when pasting names only', () => {
  const input = [
    'Aayush Nalawade',
    'Anita Tengse',
    'Bhakti Ingale',
  ].join('\n');

  const res = parseBulkStudentText({ rawText: input, existingMaxRoll: 5 });
  assert.equal(res.students.length, 3);
  assert.deepEqual(res.students, [
    { rollNo: '06', name: 'Aayush Nalawade' },
    { rollNo: '07', name: 'Anita Tengse' },
    { rollNo: '08', name: 'Bhakti Ingale' },
  ]);
});

test('parses Excel TSV with positional columns and normalizes DOB & House', () => {
  const input = [
    '01\tAarav Sharma\t15/08/2014\tRajesh Sharma\tSunita Sharma\traigad\t134\t28\t29\t31',
    '02\tDiya Patel\t2014-05-20\tVikram Patel\tMeera Patel\tSinhagad\t130\t25\t30\t31',
  ].join('\n');

  const res = parseBulkStudentText({ rawText: input });
  assert.equal(res.usedHeaderRow, false);
  assert.equal(res.students.length, 2);
  assert.deepEqual(res.students[0], {
    rollNo: '01',
    name: 'Aarav Sharma',
    dob: '2014-08-15',
    fatherName: 'Rajesh Sharma',
    motherName: 'Sunita Sharma',
    house: 'Raigad',
    height: '134',
    weight: '28',
    attendance: '29',
    attendanceOutOf: '31',
  });
});

test('parses reordered CSV/TSV columns when a header row is present', () => {
  const input = [
    "Student Name,Roll No,House,Father's Name,Height (cm)",
    'Kabir Joshi,12,shivneri,Manoj Joshi,142',
    'Meera Nair,13,Pratapgad,Suresh Nair,139',
  ].join('\n');

  const res = parseBulkStudentText({ rawText: input });
  assert.equal(res.usedHeaderRow, true);
  assert.equal(res.students.length, 2);
  assert.deepEqual(res.students[0], {
    rollNo: '12',
    name: 'Kabir Joshi',
    house: 'Shivneri',
    fatherName: 'Manoj Joshi',
    height: '142',
  });
});

test('converts Excel AOA sheets cleanly to bulk TSV string', () => {
  const tsv = aoaToBulkStudentTsv([
    ['Roll No', 'Student Name', 'House'],
    [1, 'Tanvi Deshmukh', 'Raigad'],
    ['', '', ''],
  ]);
  assert.equal(tsv, 'Roll No\tStudent Name\tHouse\n1\tTanvi Deshmukh\tRaigad');
});
