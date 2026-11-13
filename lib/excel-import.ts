import {
  ExamConfig,
  StudentReportRow,
  SubjectBreakdown,
  getClassGradeFromSection,
  getEffectiveExamConfigForClass,
  mergePulledStudentsWithRoster,
  syncBreakdownWithTotal,
  computeSubjectTotalFromBreakdown,
} from './report-card-types';

const SECTION_KEYWORDS = [
  'Sparkle',
  'Twinkle',
  'Topaz',
  'Jade',
  'Garnet',
  'Emerald',
  'Ruby',
  'Diamond',
] as const;

const SUBJECT_ALIAS_MAP: Record<string, string> = {
  english: 'English',
  eng: 'English',
  hindi: 'Hindi',
  hin: 'Hindi',
  marathi: 'Marathi',
  mar: 'Marathi',
  maths: 'Maths',
  math: 'Maths',
  mathematics: 'Maths',
  mat: 'Maths',
  science: 'Science',
  sci: 'Science',
  'social science': 'Social Science',
  'social studies': 'Social Science',
  ss: 'Social Science',
  sst: 'Social Science',
  soc: 'Social Science',
  'computer science': 'Computer Science',
  'computer': 'Computer Science',
  'comp sci': 'Computer Science',
  cs: 'Computer Science',
  com: 'Computer Science',
};

function cleanHeaderToken(raw: string): string {
  return String(raw || '')
    .replace(/\r?\n/g, ' ')
    .replace(/\(\s*\d+\s*(?:marks?|m)?\s*\)/gi, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeSubjectHeaderName(
  rawHeader: string,
  candidateSubjects: string[] = []
): string | null {
  const cleaned = cleanHeaderToken(rawHeader);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();

  // Exact match against configured subject names first
  const exactCfg = candidateSubjects.find((s) => s.trim().toLowerCase() === lower);
  if (exactCfg) return exactCfg;

  // Known canonical alias match (resolve to matching configured name if present)
  const aliasCanonical = SUBJECT_ALIAS_MAP[lower];
  if (aliasCanonical) {
    const matchedCfg = candidateSubjects.find(
      (s) => s.trim().toLowerCase() === aliasCanonical.toLowerCase()
    );
    return matchedCfg || aliasCanonical;
  }

  // Strip trailing max-mark number like "ENGLISH 25" or "SUBJECT - MATH"
  const strippedTrailingNum = lower
    .replace(/^subject\s*[-:]\s*/i, '')
    .replace(/\s+\d+$/, '')
    .trim();

  const exactStripped = candidateSubjects.find(
    (s) => s.trim().toLowerCase() === strippedTrailingNum
  );
  if (exactStripped) return exactStripped;

  const aliasStripped = SUBJECT_ALIAS_MAP[strippedTrailingNum];
  if (aliasStripped) {
    const matchedCfg = candidateSubjects.find(
      (s) => s.trim().toLowerCase() === aliasStripped.toLowerCase()
    );
    return matchedCfg || aliasStripped;
  }

  // 3-char prefix fallback ONLY when unambiguous against configured subjects
  if (strippedTrailingNum.length >= 3) {
    const prefixMatches = candidateSubjects.filter((s) =>
      s.trim().toLowerCase().startsWith(strippedTrailingNum.slice(0, 3))
    );
    if (prefixMatches.length === 1 && strippedTrailingNum.length <= 5) {
      return prefixMatches[0];
    }
  }

  return null;
}

function detectSectionFromBanner(aoa: any[][], headerRowIdx: number): string | null {
  for (let r = 0; r < headerRowIdx; r++) {
    const line = (aoa[r] || []).map((c) => String(c ?? '')).join(' ');
    for (const sec of SECTION_KEYWORDS) {
      if (new RegExp(`\\b${sec}\\b`, 'i').test(line)) {
        return sec;
      }
    }
  }
  return null;
}

function findHeaderRowIndex(aoa: any[][]): number {
  const limit = Math.min(14, aoa.length);
  for (let i = 0; i < limit; i++) {
    const cells = (aoa[i] || []).map((c) => cleanHeaderToken(String(c ?? '')).toLowerCase());
    const hasRoll = cells.some(
      (c) =>
        c === 'roll no' ||
        c === 'roll no.' ||
        c === 'roll_number' ||
        c === 'rollno' ||
        c === 'roll'
    );
    const hasName = cells.some(
      (c) =>
        c === 'name of the students' ||
        c === 'name of the student' ||
        c === 'student name' ||
        c === 'full_name' ||
        c === 'full name' ||
        c === 'studentname' ||
        c === "student's name" ||
        c === 'name'
    );
    if (hasRoll || hasName) {
      return i;
    }
  }
  return 0;
}

function isTwoRowConsolidatedSubheader(row: any[], nextRow: any[] | undefined): boolean {
  if (!nextRow || nextRow.length === 0) return false;
  const nextCells = nextRow.map((c) => cleanHeaderToken(String(c ?? '')).toUpperCase());
  const firstTwoEmpty = !nextCells[0] && !nextCells[1];
  const hasKnownSubheader = nextCells.some(
    (c) =>
      c.startsWith('TOTAL') ||
      c === 'GRADE' ||
      c === 'PERCENTAGE' ||
      c === 'PCT (%)' ||
      c.startsWith('PEN PAPER') ||
      c.startsWith('PORTFOLIO') ||
      c.startsWith('LISTENING') ||
      c.startsWith('SPEAKING') ||
      c.startsWith('SA ') ||
      c.startsWith('SA-')
  );
  // Ensure nextRow is not already a student data row (numeric roll in col 0)
  const col0Num = Number(String(nextRow[0] ?? '').trim());
  const looksLikeDataRow =
    String(nextRow[0] ?? '').trim() !== '' && Number.isFinite(col0Num);
  return !looksLikeDataRow && (firstTwoEmpty || hasKnownSubheader) && row.length >= 2;
}

function parseMarkValue(
  rawVal: any,
  maxMarks: number
): number | 'AB' | null | undefined {
  if (rawVal === undefined) return undefined;
  const trimmed = String(rawVal ?? '').trim();
  if (trimmed === '' || trimmed === '-') return null;
  const upper = trimmed.toUpperCase();
  if (upper === 'AB' || upper === 'A' || upper === 'ABSENT') {
    return 'AB';
  }
  const num = Number(trimmed);
  if (Number.isFinite(num)) {
    return Math.min(maxMarks || 100, Math.max(0, num));
  }
  return undefined;
}

function mapComponentSubheaderToKey(subHeader: string): string | null {
  const upper = cleanHeaderToken(subHeader).toUpperCase();
  if (!upper) return null;
  if (upper.startsWith('PEN PAPER')) return 'penPaper';
  if (upper.startsWith('MULTIPLE ASSESS')) return 'multipleAssessment';
  if (upper.startsWith('SUBJECT ENRICH')) return 'subjectEnrichment';
  if (upper.startsWith('PORTFOLIO')) return 'portfolio';
  if (upper.startsWith('LISTENING')) return 'listening';
  if (upper.startsWith('SPEAKING')) return 'speaking';
  if (upper.startsWith('PROJECT')) return 'project';
  if (upper.startsWith('PRACTICAL') || upper.startsWith('INTERNAL')) return 'internalMarks';
  if (upper.startsWith('SA') || upper.includes('MAIN') || upper.includes('WRITTEN')) {
    return 'writtenExam';
  }
  return null;
}

function extractFlatRowsFromAoa(
  aoa: any[][],
  candidateSubjects: string[]
): {
  headerRowIdx: number;
  bannerSection: string | null;
  rows: Array<{
    rollNo: string;
    name: string;
    admissionNo: string;
    section: string;
    dob: string;
    fatherName: string;
    motherName: string;
    customRemarks: string;
    directMark?: any;
    subjectMarks: Record<string, any>;
    subjectBreakdowns: Record<string, SubjectBreakdown>;
  }>;
} {
  if (!aoa || aoa.length === 0) {
    return { headerRowIdx: 0, bannerSection: null, rows: [] };
  }

  const headerRowIdx = findHeaderRowIndex(aoa);
  const bannerSection = detectSectionFromBanner(aoa, headerRowIdx);
  const topRow = aoa[headerRowIdx] || [];
  const subRow = aoa[headerRowIdx + 1];
  const hasTwoRowHeader = isTwoRowConsolidatedSubheader(topRow, subRow);
  const dataStartIdx = hasTwoRowHeader ? headerRowIdx + 2 : headerRowIdx + 1;

  // Build resolved column descriptors
  interface ColMeta {
    index: number;
    role:
      | 'roll'
      | 'name'
      | 'studentId'
      | 'section'
      | 'dob'
      | 'father'
      | 'mother'
      | 'remarks'
      | 'directMark'
      | 'subjectTotal'
      | 'subjectComp'
      | 'ignore';
    subjectName?: string;
    compKey?: string;
  }

  const colMetas: ColMeta[] = [];
  let currentGroup = '';

  const maxCols = Math.max(topRow.length, hasTwoRowHeader ? subRow.length : 0);
  for (let c = 0; c < maxCols; c++) {
    const rawTop = String(topRow[c] ?? '').trim();
    if (rawTop) currentGroup = rawTop;
    const effectiveTop = rawTop || (hasTwoRowHeader ? currentGroup : '');
    const rawSub = hasTwoRowHeader ? String(subRow[c] ?? '').trim() : '';

    const cleanTop = cleanHeaderToken(effectiveTop).toLowerCase();
    const cleanSub = cleanHeaderToken(rawSub).toLowerCase();

    if (
      cleanTop === 'roll no' ||
      cleanTop === 'roll no.' ||
      cleanTop === 'roll_number' ||
      cleanTop === 'rollno' ||
      cleanTop === 'roll'
    ) {
      colMetas.push({ index: c, role: 'roll' });
      continue;
    }

    if (
      cleanTop === 'name of the students' ||
      cleanTop === 'name of the student' ||
      cleanTop === 'student name' ||
      cleanTop === 'full_name' ||
      cleanTop === 'full name' ||
      cleanTop === 'studentname' ||
      cleanTop === "student's name" ||
      cleanTop === 'name'
    ) {
      colMetas.push({ index: c, role: 'name' });
      continue;
    }

    if (
      cleanTop === 'student_id' ||
      cleanTop === 'student id' ||
      cleanTop === 'admission no' ||
      cleanTop === 'admission no.' ||
      cleanTop === 'admno'
    ) {
      colMetas.push({ index: c, role: 'studentId' });
      continue;
    }

    if (cleanTop === 'section' || cleanTop === 'sec' || cleanTop === 'division') {
      colMetas.push({ index: c, role: 'section' });
      continue;
    }

    if (cleanTop === 'dob' || cleanTop === 'date of birth') {
      colMetas.push({ index: c, role: 'dob' });
      continue;
    }

    if (cleanTop === 'father name' || cleanTop === "father's name") {
      colMetas.push({ index: c, role: 'father' });
      continue;
    }

    if (cleanTop === 'mother name' || cleanTop === "mother's name") {
      colMetas.push({ index: c, role: 'mother' });
      continue;
    }

    if (
      cleanTop === 'remarks' ||
      cleanTop === 'class teacher remark' ||
      cleanTop === 'remark'
    ) {
      colMetas.push({ index: c, role: 'remarks' });
      continue;
    }

    if (
      cleanTop === 'marks obtained' ||
      cleanTop === 'marks' ||
      cleanTop === 'mark' ||
      cleanTop === 'obtained' ||
      cleanTop === 'score' ||
      cleanTop.startsWith('total ') ||
      cleanTop === 'total'
    ) {
      // Distinguish summary GRAND TOTAL columns on multi-subject sheets from single-subject TOTAL N / Marks Obtained
      if (cleanTop.includes('grand total') || cleanTop === 'total' || cleanTop === 'overall performance') {
        if (cleanTop.includes('grand') || cleanTop === 'overall performance' || !hasTwoRowHeader) {
          // On a template with only 1 mark column named 'Marks Obtained' / 'Obtained' vs consolidated 'TOTAL (175)'
          if (cleanTop === 'marks obtained' || cleanTop === 'marks' || cleanTop === 'mark' || cleanTop === 'obtained' || cleanTop === 'score') {
            colMetas.push({ index: c, role: 'directMark' });
          } else {
            colMetas.push({ index: c, role: 'ignore' });
          }
        } else {
          colMetas.push({ index: c, role: 'ignore' });
        }
      } else {
        colMetas.push({ index: c, role: 'directMark' });
      }
      continue;
    }

    if (cleanTop.startsWith('pt-') || cleanTop.startsWith('pt ')) {
      colMetas.push({ index: c, role: 'directMark' });
      continue;
    }

    // Subject columns (1-row or 2-row headers)
    if (cleanTop === 'overall performance' || cleanTop === 'percentage' || cleanTop === 'pct' || cleanTop === 'grade') {
      colMetas.push({ index: c, role: 'ignore' });
      continue;
    }

    const matchedSub = normalizeSubjectHeaderName(effectiveTop, candidateSubjects);
    if (matchedSub) {
      if (hasTwoRowHeader) {
        if (cleanSub.startsWith('total')) {
          colMetas.push({ index: c, role: 'subjectTotal', subjectName: matchedSub });
        } else if (cleanSub === 'grade') {
          colMetas.push({ index: c, role: 'ignore' });
        } else {
          const compKey = mapComponentSubheaderToKey(rawSub);
          if (compKey) {
            colMetas.push({
              index: c,
              role: 'subjectComp',
              subjectName: matchedSub,
              compKey:
                compKey === 'writtenExam' && matchedSub.toLowerCase() === 'hindi'
                  ? 'saExam'
                  : compKey,
            });
          } else {
            colMetas.push({ index: c, role: 'ignore' });
          }
        }
      } else {
        colMetas.push({ index: c, role: 'subjectTotal', subjectName: matchedSub });
      }
      continue;
    }

    // Single-subject Reference sheet component columns (e.g. PEN PAPER TEST 5, SA -1 80, TOTAL 100)
    const compKeySingle = mapComponentSubheaderToKey(effectiveTop);
    if (compKeySingle) {
      colMetas.push({ index: c, role: 'subjectComp', compKey: compKeySingle });
      continue;
    }

    colMetas.push({ index: c, role: 'ignore' });
  }

  const parsedRows: Array<{
    rollNo: string;
    name: string;
    admissionNo: string;
    section: string;
    dob: string;
    fatherName: string;
    motherName: string;
    customRemarks: string;
    directMark?: any;
    subjectMarks: Record<string, any>;
    subjectBreakdowns: Record<string, SubjectBreakdown>;
  }> = [];

  for (let r = dataStartIdx; r < aoa.length; r++) {
    const row = aoa[r] || [];
    let rollNo = '';
    let name = '';
    let admissionNo = '';
    let section = '';
    let dob = '';
    let fatherName = '';
    let motherName = '';
    let customRemarks = '';
    let directMark: any = undefined;
    const subjectMarks: Record<string, any> = {};
    const subjectBreakdowns: Record<string, SubjectBreakdown> = {};

    colMetas.forEach((meta) => {
      const cell = row[meta.index];
      if (cell === undefined) return;
      const str = String(cell ?? '').trim();

      switch (meta.role) {
        case 'roll':
          rollNo = str;
          break;
        case 'name':
          name = str;
          break;
        case 'studentId':
          admissionNo = str;
          break;
        case 'section':
          section = str;
          break;
        case 'dob':
          dob = str;
          break;
        case 'father':
          fatherName = str;
          break;
        case 'mother':
          motherName = str;
          break;
        case 'remarks':
          customRemarks = str;
          break;
        case 'directMark':
          directMark = cell;
          break;
        case 'subjectTotal':
          if (meta.subjectName) {
            subjectMarks[meta.subjectName] = cell;
          }
          break;
        case 'subjectComp':
          if (meta.compKey) {
            const subKey = meta.subjectName || '__SINGLE__';
            if (!subjectBreakdowns[subKey]) subjectBreakdowns[subKey] = {};
            const upper = str.toUpperCase();
            if (upper === 'AB' || upper === 'A' || upper === 'ABSENT') {
              subjectBreakdowns[subKey][meta.compKey] = 'AB';
            } else if (str !== '' && Number.isFinite(Number(str))) {
              subjectBreakdowns[subKey][meta.compKey] = Number(str);
            }
          }
          break;
      }
    });

    if (!rollNo && !name && !admissionNo) continue;

    parsedRows.push({
      rollNo,
      name,
      admissionNo,
      section,
      dob,
      fatherName,
      motherName,
      customRemarks,
      directMark,
      subjectMarks,
      subjectBreakdowns,
    });
  }

  return { headerRowIdx, bannerSection, rows: parsedRows };
}

export interface ExcelImportResult {
  success: boolean;
  error?: string;
  updatedStudents: StudentReportRow[];
  importedCount: number;
}

export function parseImportedSpreadsheetRows(params: {
  sheetNames: string[];
  sheetsAoa: Record<string, any[][]>;
  uploadMode: 'subject' | 'consolidated';
  uploadTargetSubject: string;
  currentStudents: StudentReportRow[];
  baseExamConfig: ExamConfig;
  selectedClass: string;
  getClassNumberForSection: (sec: string) => string;
}): ExcelImportResult {
  const {
    sheetNames,
    sheetsAoa,
    uploadMode,
    uploadTargetSubject,
    currentStudents,
    baseExamConfig,
    selectedClass,
    getClassNumberForSection,
  } = params;

  if (!sheetNames || sheetNames.length === 0) {
    return {
      success: false,
      error: 'The uploaded workbook has no worksheets.',
      updatedStudents: currentStudents,
      importedCount: 0,
    };
  }

  const candidateSubjectNames = Array.from(
    new Set([
      ...baseExamConfig.subjects.map((s) => s.name),
      ...Object.values(baseExamConfig.classOverrides || {}).flatMap((ov) =>
        (ov.subjects || []).map((s) => s.name)
      ),
      'Computer Science',
    ])
  );

  // ==========================================
  // SUBJECT-WISE MARKS UPLOAD MODE
  // ==========================================
  if (uploadMode === 'subject') {
    const matchingTabName =
      sheetNames.find(
        (sn) =>
          normalizeSubjectHeaderName(sn, candidateSubjectNames)?.toLowerCase() ===
          uploadTargetSubject.toLowerCase()
      ) || sheetNames[0];

    const aoa = sheetsAoa[matchingTabName] || [];
    const extracted = extractFlatRowsFromAoa(aoa, candidateSubjectNames);

    if (extracted.rows.length === 0) {
      return {
        success: false,
        error: 'The uploaded file contains no readable student rows.',
        updatedStudents: currentStudents,
        importedCount: 0,
      };
    }

    const updated = [...currentStudents];
    let updatedCount = 0;

    extracted.rows.forEach((row) => {
      const studentId = row.admissionNo.trim();
      const rollNo = row.rollNo ? row.rollNo.padStart(2, '0') : '';
      const rowSection = row.section || extracted.bannerSection || '';
      const lowerName = row.name.trim().toLowerCase();

      if (!studentId && !rollNo && !lowerName) return;

      const matchIdx = updated.findIndex(
        (st) =>
          (studentId && st.admissionNo.toLowerCase() === studentId.toLowerCase()) ||
          (lowerName && st.name.toLowerCase() === lowerName) ||
          (rollNo &&
            st.rollNo.padStart(2, '0') === rollNo &&
            (rowSection
              ? st.section.toLowerCase() === rowSection.toLowerCase()
              : selectedClass === 'all' || st.section === selectedClass))
      );

      if (matchIdx === -1) return;

      const st = updated[matchIdx];
      const effectiveSub =
        getEffectiveExamConfigForClass(baseExamConfig, st.section).subjects.find(
          (sub) => sub.name.toLowerCase() === uploadTargetSubject.toLowerCase()
        ) || baseExamConfig.subjects.find((s) => s.name === uploadTargetSubject);

      const maxVal = effectiveSub?.maxMarks ?? 100;
      const singleCompBd = row.subjectBreakdowns['__SINGLE__'];

      let parsedMark: number | 'AB' | null = null;
      const rawCandidate =
        row.subjectMarks[uploadTargetSubject] ?? row.directMark;

      if (singleCompBd && Object.keys(singleCompBd).length > 0) {
        const mappedBd: SubjectBreakdown = { ...(st.breakdowns?.[uploadTargetSubject] || {}), ...singleCompBd };
        if (uploadTargetSubject.toLowerCase() === 'hindi' && mappedBd.writtenExam !== undefined && mappedBd.saExam === undefined) {
          mappedBd.saExam = mappedBd.writtenExam;
        }
        const computedFromBd = computeSubjectTotalFromBreakdown(
          uploadTargetSubject,
          st.section,
          mappedBd,
          effectiveSub?.components
        );
        if (computedFromBd !== null) {
          parsedMark = computedFromBd;
          updatedCount++;
          updated[matchIdx] = {
            ...st,
            marks: {
              ...st.marks,
              [uploadTargetSubject]: parsedMark,
            },
            breakdowns: {
              ...(st.breakdowns || {}),
              [uploadTargetSubject]: mappedBd,
            },
          };
          return;
        }
      }

      const parsed = parseMarkValue(rawCandidate, maxVal);
      if (parsed === undefined) return;
      parsedMark = parsed;

      updatedCount++;
      const nextBd = syncBreakdownWithTotal(
        parsedMark,
        uploadTargetSubject,
        st.section,
        effectiveSub?.components,
        st.breakdowns?.[uploadTargetSubject]
      );
      const nextBreakdowns = { ...(st.breakdowns || {}) };
      if (nextBd) {
        nextBreakdowns[uploadTargetSubject] = nextBd;
      } else {
        delete nextBreakdowns[uploadTargetSubject];
      }

      updated[matchIdx] = {
        ...st,
        marks: {
          ...st.marks,
          [uploadTargetSubject]: parsedMark,
        },
        breakdowns: nextBreakdowns,
      };
    });

    return {
      success: true,
      updatedStudents: updated,
      importedCount: updatedCount,
    };
  }

  // ==========================================
  // CONSOLIDATED MULTI-SUBJECT MARKS UPLOAD MODE
  // Supports:
  // A) Consolidated workbook tab ('Consolidated') or flat multi-subject sheet
  // B) Multi-tab reference workbooks (ENGLISH, HINDI, MARATHI, MATHS, SCIENCE, SS, CS)
  // ==========================================
  const consolidatedSheetName =
    sheetNames.find((n) => n.toLowerCase() === 'consolidated') ||
    sheetNames.find((n) => n.toLowerCase() === 'result analysis') ||
    sheetNames[0];

  const subjectTabSheets = sheetNames.filter(
    (sn) => normalizeSubjectHeaderName(sn, candidateSubjectNames) !== null
  );

  // Use multi-tab aggregation ONLY when there is no explicit Consolidated sheet and >= 2 tabs map to subjects
  const useMultiSubjectTabs =
    !sheetNames.some((n) => n.toLowerCase() === 'consolidated' || n.toLowerCase() === 'result analysis') &&
    subjectTabSheets.length >= 2;

  const incomingStudentsMap = new Map<string, StudentReportRow>();

  const sheetsToProcess = useMultiSubjectTabs ? subjectTabSheets : [consolidatedSheetName];

  sheetsToProcess.forEach((sheetName) => {
    const aoa = sheetsAoa[sheetName] || [];
    const extracted = extractFlatRowsFromAoa(aoa, candidateSubjectNames);
    const sheetSubject = useMultiSubjectTabs
      ? normalizeSubjectHeaderName(sheetName, candidateSubjectNames)
      : null;

    extracted.rows.forEach((row, idx) => {
      const rollNo = (row.rollNo || String(idx + 1)).padStart(2, '0');
      const section = (
        row.section ||
        extracted.bannerSection ||
        (selectedClass !== 'all' ? selectedClass : 'Sparkle')
      ).trim();
      const name = row.name || `Student ${rollNo}`;
      const admissionNo =
        row.admissionNo || `sva-${section.toLowerCase()}-${rollNo}`;
      const mapKey = `${section.toLowerCase()}__${rollNo}__${name.toLowerCase()}`;

      const effectiveCfg = getEffectiveExamConfigForClass(baseExamConfig, section);
      const existing = incomingStudentsMap.get(mapKey);
      const marks: Record<string, number | 'AB' | null> = existing
        ? { ...existing.marks }
        : {};
      const breakdowns: Record<string, SubjectBreakdown> = existing
        ? { ...(existing.breakdowns || {}) }
        : {};

      if (useMultiSubjectTabs && sheetSubject) {
        const subCfg = effectiveCfg.subjects.find(
          (s) => s.name.toLowerCase() === sheetSubject.toLowerCase()
        );
        const maxM = subCfg?.maxMarks ?? 100;
        const singleBd = row.subjectBreakdowns['__SINGLE__'];
        if (singleBd && Object.keys(singleBd).length > 0) {
          const mappedBd: SubjectBreakdown = { ...singleBd };
          if (sheetSubject.toLowerCase() === 'hindi' && mappedBd.writtenExam !== undefined && mappedBd.saExam === undefined) {
            mappedBd.saExam = mappedBd.writtenExam;
          }
          breakdowns[sheetSubject] = mappedBd;
          const totalVal =
            row.directMark !== undefined
              ? parseMarkValue(row.directMark, maxM)
              : computeSubjectTotalFromBreakdown(
                  sheetSubject,
                  section,
                  mappedBd,
                  subCfg?.components
                );
          if (totalVal !== undefined) {
            marks[sheetSubject] = totalVal;
          }
        } else {
          const rawVal = row.subjectMarks[sheetSubject] ?? row.directMark;
          const parsed = parseMarkValue(rawVal, maxM);
          if (parsed !== undefined) {
            marks[sheetSubject] = parsed;
            const bd = syncBreakdownWithTotal(parsed, sheetSubject, section, subCfg?.components);
            if (bd) breakdowns[sheetSubject] = bd;
          }
        }
      } else {
        effectiveCfg.subjects.forEach((sub) => {
          const rawVal = row.subjectMarks[sub.name];
          const compBd = row.subjectBreakdowns[sub.name];
          const parsed = parseMarkValue(rawVal, sub.maxMarks || 100);

          if (compBd && Object.keys(compBd).length > 0) {
            breakdowns[sub.name] = compBd;
            if (parsed !== undefined) {
              marks[sub.name] = parsed;
            } else {
              const fromBd = computeSubjectTotalFromBreakdown(
                sub.name,
                section,
                compBd,
                sub.components
              );
              if (fromBd !== null) marks[sub.name] = fromBd;
            }
          } else if (parsed !== undefined) {
            marks[sub.name] = parsed;
            const bd = syncBreakdownWithTotal(parsed, sub.name, section, sub.components);
            if (bd) breakdowns[sub.name] = bd;
          }
        });
      }

      incomingStudentsMap.set(mapKey, {
        id: existing?.id || admissionNo,
        rollNo,
        name,
        admissionNo: existing?.admissionNo || admissionNo,
        class: getClassNumberForSection(section),
        section,
        dob: row.dob || existing?.dob || '2010-01-01',
        fatherName: row.fatherName || existing?.fatherName || 'Parent',
        motherName: row.motherName || existing?.motherName || 'Parent',
        marks,
        breakdowns,
        customRemarks:
          row.customRemarks ||
          existing?.customRemarks ||
          'Imported from official student record.',
      });
    });
  });

  const incomingStudents = Array.from(incomingStudentsMap.values());
  if (incomingStudents.length === 0) {
    return {
      success: false,
      error: 'The uploaded file contains no readable student rows.',
      updatedStudents: currentStudents,
      importedCount: 0,
    };
  }

  const mergedRoster = mergePulledStudentsWithRoster(
    currentStudents,
    incomingStudents,
    baseExamConfig
  );

  return {
    success: true,
    updatedStudents: mergedRoster,
    importedCount: incomingStudents.length,
  };
}
