import {
  normalizeSheetDateValue,
  normalizeSheetHouseValue,
} from './student-sheet-range';

export interface BulkStudentCandidate {
  rollNo: string;
  name: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  house?: string;
  height?: string;
  weight?: string;
  attendance?: string;
  attendanceOutOf?: string;
}

export interface ParseBulkStudentResult {
  students: BulkStudentCandidate[];
  skippedLines: { lineNumber: number; text: string; reason: string }[];
  detectedColumns: string[];
  usedHeaderRow: boolean;
}

export interface ParseBulkStudentParams {
  rawText: string;
  existingMaxRoll?: number;
  defaultOutOf?: string;
}

type ColumnRole =
  | 'rollNo'
  | 'name'
  | 'dob'
  | 'fatherName'
  | 'motherName'
  | 'house'
  | 'height'
  | 'weight'
  | 'attendancePresent'
  | 'attendanceOutOf';

const ROLE_DISPLAY_NAMES: Record<ColumnRole, string> = {
  rollNo: 'Roll No',
  name: 'Student Name',
  dob: 'DOB',
  fatherName: "Father's Name",
  motherName: "Mother's Name",
  house: 'House',
  height: 'Height (cm)',
  weight: 'Weight (kg)',
  attendancePresent: 'Attendance',
  attendanceOutOf: 'Attendance Out Of',
};

const POSITIONAL_ROLES: ColumnRole[] = [
  'rollNo',
  'name',
  'dob',
  'fatherName',
  'motherName',
  'house',
  'height',
  'weight',
  'attendancePresent',
  'attendanceOutOf',
];

function splitCsvRow(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function normalizeHeaderToken(header: string): ColumnRole | null {
  const h = header
    .trim()
    .toLowerCase()
    .replace(/[()'’._-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!h) return null;
  if (/^(roll|roll no|roll number|r no|sr|sr no|s no|serial)$/.test(h)) {
    return 'rollNo';
  }
  if (/^(name|student name|full name|student|candidate name)$/.test(h)) {
    return 'name';
  }
  if (/^(dob|date of birth|birth date|birthdate)$/.test(h)) {
    return 'dob';
  }
  if (/^(father|father name|fathers name|father s name)$/.test(h)) {
    return 'fatherName';
  }
  if (/^(mother|mother name|mothers name|mother s name)$/.test(h)) {
    return 'motherName';
  }
  if (/^(house|school house)$/.test(h)) {
    return 'house';
  }
  if (/^(height|height cm)$/.test(h)) {
    return 'height';
  }
  if (/^(weight|weight kg)$/.test(h)) {
    return 'weight';
  }
  if (/^(att out of|attendance out of|out of|total days|working days)$/.test(h)) {
    return 'attendanceOutOf';
  }
  if (/^(att|attendance|present|days present)$/.test(h)) {
    return 'attendancePresent';
  }
  return null;
}

function isRollLikeToken(token: string): boolean {
  const trimmed = token.trim();
  if (!trimmed) return false;
  return /^\d{1,4}$/.test(trimmed);
}

function normalizeRollNo(rawRoll: string): string {
  const digitsOnly = rawRoll.trim();
  if (/^\d+$/.test(digitsOnly)) {
    return String(Number(digitsOnly)).padStart(2, '0');
  }
  return digitsOnly;
}

export function parseBulkStudentText({
  rawText,
  existingMaxRoll = 0,
  defaultOutOf = '31',
}: ParseBulkStudentParams): ParseBulkStudentResult {
  const rawLines = rawText
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line, idx) => ({ lineNumber: idx + 1, text: line.trim() }))
    .filter((entry) => entry.text.length > 0);

  if (rawLines.length === 0) {
    return {
      students: [],
      skippedLines: [],
      detectedColumns: [],
      usedHeaderRow: false,
    };
  }

  const useTsv = rawLines.some((l) => l.text.includes('\t'));
  const useCsv = !useTsv && rawLines.some((l) => splitCsvRow(l.text).length >= 2);

  const splitRow = (text: string): string[] => {
    if (useTsv) return text.split('\t').map((c) => c.trim());
    if (useCsv) return splitCsvRow(text);
    return [text];
  };

  let columnMap: (ColumnRole | null)[] | null = null;
  let usedHeaderRow = false;
  let startIndex = 0;

  // Check if first non-empty line is a header row
  const firstCells = splitRow(rawLines[0].text);
  if (firstCells.length >= 2 || normalizeHeaderToken(firstCells[0]) !== null) {
    const mapped = firstCells.map((cell) => normalizeHeaderToken(cell));
    const recognizedCount = mapped.filter(Boolean).length;
    if (recognizedCount >= 2 || (firstCells.length === 1 && mapped[0] === 'name')) {
      columnMap = mapped;
      usedHeaderRow = true;
      startIndex = 1;
    }
  }

  let nextAutoRoll = Math.max(0, existingMaxRoll) + 1;
  const students: BulkStudentCandidate[] = [];
  const skippedLines: { lineNumber: number; text: string; reason: string }[] = [];
  const usedRolesSet = new Set<ColumnRole>();

  for (let i = startIndex; i < rawLines.length; i++) {
    const { lineNumber, text } = rawLines[i];
    const cells = splitRow(text);

    let candidate: BulkStudentCandidate | null = null;

    if (useTsv || useCsv) {
      if (columnMap) {
        const record: Partial<Record<ColumnRole, string>> = {};
        columnMap.forEach((role, colIdx) => {
          if (role && cells[colIdx] !== undefined) {
            record[role] = cells[colIdx].trim();
          }
        });
        const cleanName = (record.name || '').trim();
        if (!cleanName) {
          skippedLines.push({
            lineNumber,
            text,
            reason: 'Missing student name',
          });
          continue;
        }
        const roll = record.rollNo?.trim()
          ? normalizeRollNo(record.rollNo)
          : String(nextAutoRoll++).padStart(2, '0');
        usedRolesSet.add('rollNo');
        usedRolesSet.add('name');
        candidate = buildCandidateFromRecord({ ...record, rollNo: roll, name: cleanName }, defaultOutOf, usedRolesSet);
      } else {
        // No header row: infer whether Col 0 is Roll No or Name
        const c0 = (cells[0] || '').trim();
        const c1 = (cells[1] || '').trim();

        if (isRollLikeToken(c0) && c1) {
          const record: Partial<Record<ColumnRole, string>> = {};
          POSITIONAL_ROLES.forEach((role, colIdx) => {
            if (cells[colIdx] !== undefined && cells[colIdx].trim() !== '') {
              record[role] = cells[colIdx].trim();
            }
          });
          record.rollNo = normalizeRollNo(c0);
          usedRolesSet.add('rollNo');
          usedRolesSet.add('name');
          candidate = buildCandidateFromRecord(record, defaultOutOf, usedRolesSet);
        } else {
          // Col 0 is Student Name without Roll No
          const cleanName = c0;
          if (!cleanName || /^[-=_*]+$/.test(cleanName)) {
            skippedLines.push({ lineNumber, text, reason: 'Empty or decorative line' });
            continue;
          }
          const roll = String(nextAutoRoll++).padStart(2, '0');
          usedRolesSet.add('rollNo');
          usedRolesSet.add('name');
          candidate = { rollNo: roll, name: cleanName };
        }
      }
    } else {
      // Single-column plain text line:
      // Supports "01 Ajinkya Balu Gurav", "1. Ankita Ghige", "03) Anushka", "04 - Rohit", or "Ajinkya Balu Gurav"
      const prefixed = text.match(/^(\d{1,4})(?:\s*[.):\-–—]\s*|\s+)(.+)$/);
      if (prefixed) {
        const cleanName = prefixed[2].trim();
        if (!cleanName || /^[\d\s.\-–—]+$/.test(cleanName)) {
          skippedLines.push({ lineNumber, text, reason: 'Missing student name after roll number' });
          continue;
        }
        const roll = normalizeRollNo(prefixed[1]);
        const numericRoll = parseInt(prefixed[1], 10);
        if (Number.isFinite(numericRoll)) {
          nextAutoRoll = Math.max(nextAutoRoll, numericRoll + 1);
        }
        usedRolesSet.add('rollNo');
        usedRolesSet.add('name');
        candidate = { rollNo: roll, name: cleanName };
      } else {
        if (/^[-=_*\d\s.]+$/.test(text)) {
          skippedLines.push({ lineNumber, text, reason: 'No student name detected' });
          continue;
        }
        const roll = String(nextAutoRoll++).padStart(2, '0');
        usedRolesSet.add('rollNo');
        usedRolesSet.add('name');
        candidate = { rollNo: roll, name: text };
      }
    }

    if (candidate) {
      students.push(candidate);
    }
  }

  return {
    students,
    skippedLines,
    detectedColumns: Array.from(usedRolesSet).map((r) => ROLE_DISPLAY_NAMES[r]),
    usedHeaderRow,
  };
}

function buildCandidateFromRecord(
  record: Partial<Record<ColumnRole, string>>,
  defaultOutOf: string,
  usedRolesSet: Set<ColumnRole>
): BulkStudentCandidate {
  const out: BulkStudentCandidate = {
    rollNo: record.rollNo || '01',
    name: (record.name || '').trim(),
  };

  if (record.dob) {
    const normDob = normalizeSheetDateValue(record.dob);
    if (normDob) {
      out.dob = normDob;
      usedRolesSet.add('dob');
    }
  }
  if (record.fatherName) {
    out.fatherName = record.fatherName;
    usedRolesSet.add('fatherName');
  }
  if (record.motherName) {
    out.motherName = record.motherName;
    usedRolesSet.add('motherName');
  }
  if (record.house) {
    const normHouse = normalizeSheetHouseValue(record.house);
    if (normHouse) {
      out.house = normHouse;
      usedRolesSet.add('house');
    }
  }
  if (record.height) {
    out.height = record.height;
    usedRolesSet.add('height');
  }
  if (record.weight) {
    out.weight = record.weight;
    usedRolesSet.add('weight');
  }
  if (record.attendancePresent || record.attendanceOutOf) {
    if (record.attendancePresent && record.attendancePresent.includes('/')) {
      const [p, o] = record.attendancePresent.split('/');
      out.attendance = p.trim();
      out.attendanceOutOf = (o || defaultOutOf).trim();
    } else {
      if (record.attendancePresent) out.attendance = record.attendancePresent;
      out.attendanceOutOf = record.attendanceOutOf || defaultOutOf;
    }
    usedRolesSet.add('attendancePresent');
    if (record.attendanceOutOf) usedRolesSet.add('attendanceOutOf');
  }

  return out;
}

export function aoaToBulkStudentTsv(aoa: unknown[][]): string {
  return aoa
    .map((row) =>
      row
        .map((cell) => (cell === null || cell === undefined ? '' : String(cell).trim()))
        .join('\t')
    )
    .filter((line) => line.replace(/\t/g, '').trim().length > 0)
    .join('\n');
}
