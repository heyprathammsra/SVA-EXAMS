import {
  SVA_SCHOOL_HOUSES,
  StudentReportRow,
  getStudentPtProfile,
} from './report-card-types';
import {
  formatAttendanceParts,
  parseAttendanceParts,
} from './erp-persistence';

export const SHEET_COLUMNS = [
  { key: 'rollNo', label: 'Roll No', clearable: false },
  { key: 'name', label: 'Student Name', clearable: false },
  { key: 'dob', label: 'DOB', clearable: true },
  { key: 'fatherName', label: "Father's Name", clearable: true },
  { key: 'motherName', label: "Mother's Name", clearable: true },
  { key: 'house', label: 'House', clearable: false },
  { key: 'height', label: 'Height (cm)', clearable: true },
  { key: 'weight', label: 'Weight (kg)', clearable: true },
  { key: 'attendancePresent', label: 'Attendance', clearable: true },
  { key: 'attendanceOutOf', label: 'Attendance Out Of', clearable: true },
] as const;

export type SheetColKey = (typeof SHEET_COLUMNS)[number]['key'];

export interface SheetCellCoord {
  rowIdx: number;
  colIdx: number;
}

export interface SheetSelectionRange {
  start: SheetCellCoord;
  end: SheetCellCoord;
}

export interface NormalizedSheetRange {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
  rowCount: number;
  colCount: number;
  cellCount: number;
}

export interface NewStudentFromPasteInput {
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

export function normalizeSheetRange(
  range: SheetSelectionRange | null,
  maxRowIdx: number,
  maxColIdx: number = SHEET_COLUMNS.length - 1
): NormalizedSheetRange | null {
  if (!range || maxRowIdx < 0 || maxColIdx < 0) return null;
  const minRow = Math.max(0, Math.min(maxRowIdx, Math.min(range.start.rowIdx, range.end.rowIdx)));
  const maxRow = Math.max(0, Math.min(maxRowIdx, Math.max(range.start.rowIdx, range.end.rowIdx)));
  const minCol = Math.max(0, Math.min(maxColIdx, Math.min(range.start.colIdx, range.end.colIdx)));
  const maxCol = Math.max(0, Math.min(maxColIdx, Math.max(range.start.colIdx, range.end.colIdx)));
  const rowCount = maxRow - minRow + 1;
  const colCount = maxCol - minCol + 1;
  return {
    minRow,
    maxRow,
    minCol,
    maxCol,
    rowCount,
    colCount,
    cellCount: rowCount * colCount,
  };
}

export function normalizeSheetDateValue(raw?: string): string {
  const val = (raw || '').trim();
  if (!val) return '';

  const isoMatch = val.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    const mNum = Number(mm);
    const dNum = Number(dd);
    if (mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    }
    return '';
  }

  const dmyMatch = val.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (dmyMatch) {
    const [, first, second, yyyy] = dmyMatch;
    const p1 = Number(first);
    const p2 = Number(second);
    // Treat as DD/MM/YYYY by default unless second > 12 (MM/DD/YYYY fallback)
    let dd = p1;
    let mm = p2;
    if (p2 > 12 && p1 <= 12) {
      mm = p1;
      dd = p2;
    }
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    }
    return '';
  }

  return '';
}

export function normalizeSheetHouseValue(raw?: string): string | null {
  const cleaned = (raw || '').trim().toLowerCase();
  if (!cleaned) return null;
  const exact = SVA_SCHOOL_HOUSES.find((h) => h.toLowerCase() === cleaned);
  if (exact) return exact;
  const prefixMatches = SVA_SCHOOL_HOUSES.filter((h) =>
    h.toLowerCase().startsWith(cleaned)
  );
  if (prefixMatches.length === 1) return prefixMatches[0];
  return null;
}

export function getSheetCellDisplayValue(
  student: StudentReportRow,
  colKey: SheetColKey,
  defaultOutOf: string = '31'
): string {
  const profile = getStudentPtProfile(student);
  const effectiveAttendance =
    student.attendance !== undefined ? student.attendance : profile.attendance;
  const attParts = parseAttendanceParts(effectiveAttendance, defaultOutOf);

  switch (colKey) {
    case 'rollNo':
      return student.rollNo ?? '';
    case 'name':
      return student.name ?? '';
    case 'dob':
      return student.dob !== undefined
        ? normalizeSheetDateValue(student.dob)
        : normalizeSheetDateValue(profile.dobDisplay);
    case 'fatherName':
      return student.fatherName !== undefined
        ? student.fatherName
        : profile.fatherNameDisplay;
    case 'motherName':
      return student.motherName !== undefined
        ? student.motherName
        : profile.motherNameDisplay;
    case 'house':
      return (student.house || '').trim() || profile.house;
    case 'height':
      return student.height !== undefined ? String(student.height) : profile.height;
    case 'weight':
      return student.weight !== undefined ? String(student.weight) : profile.weight;
    case 'attendancePresent':
      return attParts.present;
    case 'attendanceOutOf':
      return attParts.outOf;
  }
}

export function serializeSheetRangeToTsv(
  classStudents: StudentReportRow[],
  range: NormalizedSheetRange,
  defaultOutOf: string = '31'
): string {
  const lines: string[] = [];
  for (let r = range.minRow; r <= range.maxRow; r++) {
    const stu = classStudents[r];
    if (!stu) continue;
    const rowCells: string[] = [];
    for (let c = range.minCol; c <= range.maxCol; c++) {
      const col = SHEET_COLUMNS[c];
      rowCells.push(col ? getSheetCellDisplayValue(stu, col.key, defaultOutOf) : '');
    }
    lines.push(rowCells.join('\t'));
  }
  return lines.join('\n');
}

export function parseTsvClipboardMatrix(tsvText: string): string[][] {
  if (!tsvText) return [];
  const normalized = tsvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawLines = normalized.split('\n');
  // Strip trailing empty line typically appended by Excel / Sheets clipboard copy
  if (rawLines.length > 1 && rawLines[rawLines.length - 1] === '') {
    rawLines.pop();
  }
  if (rawLines.length === 0 || (rawLines.length === 1 && rawLines[0] === '')) {
    return [];
  }
  return rawLines.map((line) => line.split('\t'));
}

function applyColumnValueToRowState(params: {
  colKey: SheetColKey;
  rawValue: string;
  patch: Partial<StudentReportRow>;
  nextPresent: string;
  nextOutOf: string;
  attendanceTouched: boolean;
  defaultOutOf: string;
}): {
  applied: boolean;
  skippedInvalid: boolean;
  nextPresent: string;
  nextOutOf: string;
  attendanceTouched: boolean;
} {
  const { colKey, rawValue, patch, defaultOutOf } = params;
  let { nextPresent, nextOutOf, attendanceTouched } = params;
  const trimmed = rawValue.trim();

  switch (colKey) {
    case 'rollNo':
      if (!trimmed) {
        return { applied: false, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };
      }
      patch.rollNo = trimmed;
      return { applied: true, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };

    case 'name':
      if (!trimmed) {
        return { applied: false, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };
      }
      patch.name = trimmed;
      return { applied: true, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };

    case 'dob': {
      if (!trimmed) {
        patch.dob = '';
        return { applied: true, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };
      }
      const iso = normalizeSheetDateValue(trimmed);
      if (!iso) {
        return { applied: false, skippedInvalid: true, nextPresent, nextOutOf, attendanceTouched };
      }
      patch.dob = iso;
      return { applied: true, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };
    }

    case 'fatherName':
      patch.fatherName = trimmed;
      return { applied: true, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };

    case 'motherName':
      patch.motherName = trimmed;
      return { applied: true, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };

    case 'house': {
      if (!trimmed) {
        return { applied: false, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };
      }
      const matched = normalizeSheetHouseValue(trimmed);
      if (!matched) {
        return { applied: false, skippedInvalid: true, nextPresent, nextOutOf, attendanceTouched };
      }
      patch.house = matched;
      return { applied: true, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };
    }

    case 'height':
      patch.height = trimmed;
      return { applied: true, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };

    case 'weight':
      patch.weight = trimmed;
      return { applied: true, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };

    case 'attendancePresent': {
      nextPresent = trimmed;
      if (trimmed && !nextOutOf) {
        nextOutOf = defaultOutOf;
      }
      attendanceTouched = true;
      return { applied: true, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };
    }

    case 'attendanceOutOf': {
      nextOutOf = trimmed;
      attendanceTouched = true;
      return { applied: true, skippedInvalid: false, nextPresent, nextOutOf, attendanceTouched };
    }
  }
}

export function applyTsvPasteToStudents(params: {
  classStudents: StudentReportRow[];
  targetRange: NormalizedSheetRange | null;
  startRow: number;
  startCol: number;
  tsvText: string;
  allowAppendRows?: boolean;
  defaultOutOf?: string;
}): {
  patchesByStudentId: Record<string, Partial<StudentReportRow>>;
  studentsToAppend: NewStudentFromPasteInput[];
  updatedCellCount: number;
  updatedRowCount: number;
  skippedInvalidCount: number;
  appliedRange: SheetSelectionRange | null;
} {
  const {
    classStudents,
    targetRange,
    startRow,
    startCol,
    tsvText,
    allowAppendRows = false,
    defaultOutOf = '31',
  } = params;

  const matrix = parseTsvClipboardMatrix(tsvText);
  if (matrix.length === 0) {
    return {
      patchesByStudentId: {},
      studentsToAppend: [],
      updatedCellCount: 0,
      updatedRowCount: 0,
      skippedInvalidCount: 0,
      appliedRange: null,
    };
  }

  const patchesByStudentId: Record<string, Partial<StudentReportRow>> = {};
  const studentsToAppend: NewStudentFromPasteInput[] = [];
  let updatedCellCount = 0;
  let updatedRowCount = 0;
  let skippedInvalidCount = 0;

  const isSingleCellBroadcast =
    matrix.length === 1 &&
    matrix[0].length === 1 &&
    targetRange !== null &&
    targetRange.cellCount > 1;

  if (isSingleCellBroadcast && targetRange) {
    const broadcastVal = matrix[0][0];
    for (let r = targetRange.minRow; r <= targetRange.maxRow; r++) {
      const stu = classStudents[r];
      if (!stu) continue;
      const profile = getStudentPtProfile(stu);
      const attParts = parseAttendanceParts(
        stu.attendance || profile.attendance,
        defaultOutOf
      );
      const patch: Partial<StudentReportRow> = {};
      let nextPresent = attParts.present;
      let nextOutOf = attParts.outOf;
      let attendanceTouched = false;
      let rowCellsUpdated = 0;

      for (let c = targetRange.minCol; c <= targetRange.maxCol; c++) {
        const col = SHEET_COLUMNS[c];
        if (!col) continue;
        const step = applyColumnValueToRowState({
          colKey: col.key,
          rawValue: broadcastVal,
          patch,
          nextPresent,
          nextOutOf,
          attendanceTouched,
          defaultOutOf,
        });
        nextPresent = step.nextPresent;
        nextOutOf = step.nextOutOf;
        attendanceTouched = step.attendanceTouched;
        if (step.applied) {
          updatedCellCount++;
          rowCellsUpdated++;
        }
        if (step.skippedInvalid) {
          skippedInvalidCount++;
        }
      }

      if (attendanceTouched) {
        patch.attendance = formatAttendanceParts(nextPresent, nextOutOf);
      }
      if (Object.keys(patch).length > 0 && rowCellsUpdated > 0) {
        patchesByStudentId[stu.id] = patch;
        updatedRowCount++;
      }
    }

    return {
      patchesByStudentId,
      studentsToAppend: [],
      updatedCellCount,
      updatedRowCount,
      skippedInvalidCount,
      appliedRange: {
        start: { rowIdx: targetRange.minRow, colIdx: targetRange.minCol },
        end: { rowIdx: targetRange.maxRow, colIdx: targetRange.maxCol },
      },
    };
  }

  const originRow = targetRange ? targetRange.minRow : Math.max(0, startRow);
  const originCol = targetRange ? targetRange.minCol : Math.max(0, startCol);
  let maxAffectedRow = originRow;
  let maxAffectedCol = originCol;
  let maxExistingRoll = classStudents.reduce(
    (max, s) => Math.max(max, parseInt(s.rollNo, 10) || 0),
    0
  );

  matrix.forEach((rowCells, rOffset) => {
    const targetRowIdx = originRow + rOffset;
    if (targetRowIdx < classStudents.length) {
      const stu = classStudents[targetRowIdx];
      const profile = getStudentPtProfile(stu);
      const attParts = parseAttendanceParts(
        stu.attendance || profile.attendance,
        defaultOutOf
      );
      const patch: Partial<StudentReportRow> = {};
      let nextPresent = attParts.present;
      let nextOutOf = attParts.outOf;
      let attendanceTouched = false;
      let rowCellsUpdated = 0;

      rowCells.forEach((rawValue, cOffset) => {
        const targetColIdx = originCol + cOffset;
        if (targetColIdx < 0 || targetColIdx >= SHEET_COLUMNS.length) return;
        const col = SHEET_COLUMNS[targetColIdx];
        const step = applyColumnValueToRowState({
          colKey: col.key,
          rawValue,
          patch,
          nextPresent,
          nextOutOf,
          attendanceTouched,
          defaultOutOf,
        });
        nextPresent = step.nextPresent;
        nextOutOf = step.nextOutOf;
        attendanceTouched = step.attendanceTouched;
        if (step.applied) {
          updatedCellCount++;
          rowCellsUpdated++;
          maxAffectedRow = Math.max(maxAffectedRow, targetRowIdx);
          maxAffectedCol = Math.max(maxAffectedCol, targetColIdx);
        }
        if (step.skippedInvalid) {
          skippedInvalidCount++;
        }
      });

      if (attendanceTouched) {
        patch.attendance = formatAttendanceParts(nextPresent, nextOutOf);
      }
      if (Object.keys(patch).length > 0 && rowCellsUpdated > 0) {
        patchesByStudentId[stu.id] = patch;
        updatedRowCount++;
      }
    } else if (allowAppendRows) {
      const tempPatch: Partial<StudentReportRow> = {};
      let nextPresent = '';
      let nextOutOf = defaultOutOf;
      let attendanceTouched = false;
      let rowCellsApplied = 0;

      rowCells.forEach((rawValue, cOffset) => {
        const targetColIdx = originCol + cOffset;
        if (targetColIdx < 0 || targetColIdx >= SHEET_COLUMNS.length) return;
        const col = SHEET_COLUMNS[targetColIdx];
        const step = applyColumnValueToRowState({
          colKey: col.key,
          rawValue,
          patch: tempPatch,
          nextPresent,
          nextOutOf,
          attendanceTouched,
          defaultOutOf,
        });
        nextPresent = step.nextPresent;
        nextOutOf = step.nextOutOf;
        attendanceTouched = step.attendanceTouched;
        if (step.applied) {
          rowCellsApplied++;
          maxAffectedCol = Math.max(maxAffectedCol, targetColIdx);
        }
        if (step.skippedInvalid) {
          skippedInvalidCount++;
        }
      });

      // Only append a new student if the pasted row includes a non-empty student name
      if (tempPatch.name && tempPatch.name.trim()) {
        maxExistingRoll += 1;
        const assignedRoll =
          tempPatch.rollNo && tempPatch.rollNo.trim()
            ? tempPatch.rollNo.trim()
            : String(maxExistingRoll).padStart(2, '0');
        const rollNum = parseInt(assignedRoll, 10);
        if (!Number.isNaN(rollNum)) {
          maxExistingRoll = Math.max(maxExistingRoll, rollNum);
        }
        studentsToAppend.push({
          rollNo: assignedRoll,
          name: tempPatch.name.trim(),
          dob: tempPatch.dob || '2014-01-01',
          fatherName: tempPatch.fatherName || '',
          motherName: tempPatch.motherName || '',
          house: tempPatch.house || SVA_SCHOOL_HOUSES[0],
          height: tempPatch.height !== undefined ? String(tempPatch.height) : '',
          weight: tempPatch.weight !== undefined ? String(tempPatch.weight) : '',
          attendance: attendanceTouched ? nextPresent : defaultOutOf,
          attendanceOutOf: attendanceTouched ? nextOutOf : defaultOutOf,
        });
        updatedCellCount += rowCellsApplied;
        updatedRowCount++;
        maxAffectedRow = Math.max(maxAffectedRow, targetRowIdx);
      }
    }
  });

  const hasChanges =
    updatedCellCount > 0 ||
    Object.keys(patchesByStudentId).length > 0 ||
    studentsToAppend.length > 0;

  return {
    patchesByStudentId,
    studentsToAppend,
    updatedCellCount,
    updatedRowCount,
    skippedInvalidCount,
    appliedRange: hasChanges
      ? {
          start: { rowIdx: originRow, colIdx: originCol },
          end: { rowIdx: maxAffectedRow, colIdx: maxAffectedCol },
        }
      : null,
  };
}

export function fillDownSheetRange(params: {
  classStudents: StudentReportRow[];
  range: NormalizedSheetRange | null;
  defaultOutOf?: string;
}): {
  patchesByStudentId: Record<string, Partial<StudentReportRow>>;
  updatedCellCount: number;
  updatedRowCount: number;
} {
  const { classStudents, range, defaultOutOf = '31' } = params;
  if (!range || range.minRow >= range.maxRow) {
    return { patchesByStudentId: {}, updatedCellCount: 0, updatedRowCount: 0 };
  }

  const sourceStudent = classStudents[range.minRow];
  if (!sourceStudent) {
    return { patchesByStudentId: {}, updatedCellCount: 0, updatedRowCount: 0 };
  }

  const sourceValues: Record<number, string> = {};
  for (let c = range.minCol; c <= range.maxCol; c++) {
    const col = SHEET_COLUMNS[c];
    if (col) {
      sourceValues[c] = getSheetCellDisplayValue(sourceStudent, col.key, defaultOutOf);
    }
  }

  const patchesByStudentId: Record<string, Partial<StudentReportRow>> = {};
  let updatedCellCount = 0;
  let updatedRowCount = 0;

  for (let r = range.minRow + 1; r <= range.maxRow; r++) {
    const stu = classStudents[r];
    if (!stu) continue;
    const profile = getStudentPtProfile(stu);
    const attParts = parseAttendanceParts(
      stu.attendance || profile.attendance,
      defaultOutOf
    );
    const patch: Partial<StudentReportRow> = {};
    let nextPresent = attParts.present;
    let nextOutOf = attParts.outOf;
    let attendanceTouched = false;
    let rowCells = 0;

    for (let c = range.minCol; c <= range.maxCol; c++) {
      const col = SHEET_COLUMNS[c];
      if (!col) continue;
      const step = applyColumnValueToRowState({
        colKey: col.key,
        rawValue: sourceValues[c] ?? '',
        patch,
        nextPresent,
        nextOutOf,
        attendanceTouched,
        defaultOutOf,
      });
      nextPresent = step.nextPresent;
      nextOutOf = step.nextOutOf;
      attendanceTouched = step.attendanceTouched;
      if (step.applied) {
        updatedCellCount++;
        rowCells++;
      }
    }

    if (attendanceTouched) {
      patch.attendance = formatAttendanceParts(nextPresent, nextOutOf);
    }
    if (Object.keys(patch).length > 0 && rowCells > 0) {
      patchesByStudentId[stu.id] = patch;
      updatedRowCount++;
    }
  }

  return { patchesByStudentId, updatedCellCount, updatedRowCount };
}

export function clearSheetRange(params: {
  classStudents: StudentReportRow[];
  range: NormalizedSheetRange | null;
  defaultOutOf?: string;
}): {
  patchesByStudentId: Record<string, Partial<StudentReportRow>>;
  clearedCellCount: number;
  protectedCount: number;
} {
  const { classStudents, range, defaultOutOf = '31' } = params;
  if (!range) {
    return { patchesByStudentId: {}, clearedCellCount: 0, protectedCount: 0 };
  }

  const patchesByStudentId: Record<string, Partial<StudentReportRow>> = {};
  let clearedCellCount = 0;
  let protectedCount = 0;

  for (let r = range.minRow; r <= range.maxRow; r++) {
    const stu = classStudents[r];
    if (!stu) continue;
    const profile = getStudentPtProfile(stu);
    const attParts = parseAttendanceParts(
      stu.attendance || profile.attendance,
      defaultOutOf
    );
    const patch: Partial<StudentReportRow> = {};
    let nextPresent = attParts.present;
    let nextOutOf = attParts.outOf;
    let attendanceTouched = false;

    for (let c = range.minCol; c <= range.maxCol; c++) {
      const col = SHEET_COLUMNS[c];
      if (!col) continue;
      if (!col.clearable) {
        protectedCount++;
        continue;
      }
      switch (col.key) {
        case 'dob':
          patch.dob = '';
          clearedCellCount++;
          break;
        case 'fatherName':
          patch.fatherName = '';
          clearedCellCount++;
          break;
        case 'motherName':
          patch.motherName = '';
          clearedCellCount++;
          break;
        case 'height':
          patch.height = '';
          clearedCellCount++;
          break;
        case 'weight':
          patch.weight = '';
          clearedCellCount++;
          break;
        case 'attendancePresent':
          nextPresent = '';
          attendanceTouched = true;
          clearedCellCount++;
          break;
        case 'attendanceOutOf':
          nextOutOf = '';
          attendanceTouched = true;
          clearedCellCount++;
          break;
      }
    }

    if (attendanceTouched) {
      patch.attendance = formatAttendanceParts(nextPresent, nextOutOf);
    }
    if (Object.keys(patch).length > 0) {
      patchesByStudentId[stu.id] = patch;
    }
  }

  return { patchesByStudentId, clearedCellCount, protectedCount };
}
