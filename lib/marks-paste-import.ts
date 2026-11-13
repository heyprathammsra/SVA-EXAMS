import {
  ExamConfig,
  StudentReportRow,
  SubjectBreakdown,
  getEffectiveExamConfigForClass,
  syncBreakdownWithTotal,
} from './report-card-types';
import {
  normalizeSubjectHeaderName,
  parseImportedSpreadsheetRows,
} from './excel-import';

export interface UnmatchedPasteLine {
  lineNumber: number;
  raw: string;
  reason: string;
}

export interface PastedMarksPreviewResult {
  matchedStudentCount: number;
  matchedMarksCount: number;
  unmatchedLines: UnmatchedPasteLine[];
  updatedStudents: StudentReportRow[];
  detectedSubjects: string[];
}

function normalizeText(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normalizeRoll(value: string): string {
  const digits = String(value || '')
    .trim()
    .replace(/^[#.)\-\s]+|[.)\-\s]+$/g, '');
  if (!digits) return '';
  if (/^\d+$/.test(digits)) {
    return String(Number(digits)).padStart(2, '0');
  }
  return digits.toLowerCase();
}

function parseSingleMarkToken(
  token: string,
  maxMarks: number
): number | 'AB' | null | undefined {
  const trimmed = String(token ?? '').trim();
  if (!trimmed) return undefined;
  if (trimmed === '-' || trimmed === '—') return null;
  const upper = trimmed.toUpperCase();
  if (upper === 'AB' || upper === 'A' || upper === 'ABSENT') {
    return 'AB';
  }
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const num = Number(trimmed);
    if (Number.isFinite(num)) {
      return Math.min(maxMarks || 100, Math.max(0, num));
    }
  }
  return undefined;
}

function isMarkLikeToken(token: string): boolean {
  const trimmed = String(token ?? '').trim();
  if (!trimmed) return false;
  if (trimmed === '-' || trimmed === '—') return true;
  const upper = trimmed.toUpperCase();
  if (upper === 'AB' || upper === 'A' || upper === 'ABSENT') return true;
  return /^\d+(?:\.\d+)?$/.test(trimmed);
}

function looksLikeHeaderRow(cells: string[], candidateSubjects: string[]): boolean {
  const normalizedCells = cells.map((c) => normalizeText(c));
  const hasRollOrName = normalizedCells.some(
    (c) =>
      c === 'roll no' ||
      c === 'roll no.' ||
      c === 'roll_no' ||
      c === 'rollno' ||
      c === 'roll' ||
      c === 'student name' ||
      c === 'name of the students' ||
      c === 'name of the student' ||
      c === 'full name' ||
      c === 'name' ||
      c === 'admission no' ||
      c === 'student id'
  );
  if (hasRollOrName) return true;
  const matchedSubjectCount = normalizedCells.filter(
    (c) => normalizeSubjectHeaderName(c, candidateSubjects) !== null
  ).length;
  return matchedSubjectCount >= 2;
}

function splitDelimitedLine(line: string, delimiter: '\t' | ','): string[] {
  if (delimiter === '\t') {
    return line.split('\t').map((cell) => cell.trim());
  }
  const result: string[] = [];
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
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function resolveStudentMatch(params: {
  rollNo: string;
  name: string;
  admissionNo: string;
  targetClass: string;
  currentStudents: StudentReportRow[];
}): number {
  const { rollNo, name, admissionNo, targetClass, currentStudents } = params;
  const normAdm = normalizeText(admissionNo);
  const normRoll = normalizeRoll(rollNo);
  const normName = normalizeText(name);
  const isClassScoped = Boolean(targetClass && targetClass !== 'all');

  const isInScope = (st: StudentReportRow) =>
    !isClassScoped || st.section.toLowerCase() === targetClass.toLowerCase();

  // 1. Exact admission number
  if (normAdm) {
    const idx = currentStudents.findIndex(
      (st) => isInScope(st) && normalizeText(st.admissionNo) === normAdm
    );
    if (idx !== -1) return idx;
  }

  // 2. Exact normalized name inside scope
  if (normName) {
    const idx = currentStudents.findIndex(
      (st) => isInScope(st) && normalizeText(st.name) === normName
    );
    if (idx !== -1) return idx;
  }

  // 3. Roll number match inside class scope
  if (normRoll && isClassScoped) {
    const idx = currentStudents.findIndex(
      (st) => isInScope(st) && normalizeRoll(st.rollNo) === normRoll
    );
    if (idx !== -1) return idx;
  }

  // 4. Unique prefix/partial name match when no exact match found
  if (normName && normName.length >= 3) {
    const partialIndices: number[] = [];
    currentStudents.forEach((st, i) => {
      if (!isInScope(st)) return;
      const stName = normalizeText(st.name);
      if (stName.startsWith(normName) || stName.includes(normName)) {
        partialIndices.push(i);
      }
    });
    if (partialIndices.length === 1) return partialIndices[0];
  }

  return -1;
}

function applyMarkToStudent(params: {
  student: StudentReportRow;
  subjectName: string;
  markValue: number | 'AB' | null;
  baseExamConfig: ExamConfig;
}): StudentReportRow {
  const { student, subjectName, markValue, baseExamConfig } = params;
  const effectiveCfg = getEffectiveExamConfigForClass(baseExamConfig, student.section);
  const subCfg =
    effectiveCfg.subjects.find(
      (s) => s.name.toLowerCase() === subjectName.toLowerCase()
    ) || baseExamConfig.subjects.find((s) => s.name.toLowerCase() === subjectName.toLowerCase());

  const resolvedName = subCfg?.name || subjectName;
  const nextBd = syncBreakdownWithTotal(
    markValue,
    resolvedName,
    student.section,
    subCfg?.components,
    student.breakdowns?.[resolvedName]
  );
  const nextBreakdowns = { ...(student.breakdowns || {}) };
  if (nextBd) {
    nextBreakdowns[resolvedName] = nextBd;
  } else {
    delete nextBreakdowns[resolvedName];
  }

  return {
    ...student,
    marks: {
      ...student.marks,
      [resolvedName]: markValue,
    },
    breakdowns: nextBreakdowns,
  };
}

export function parsePastedMarksText(params: {
  rawText: string;
  targetClass: string; // specific section name or 'all'
  targetSubject: string; // '__ALL__' or subject name
  replaceExisting: boolean;
  currentStudents: StudentReportRow[];
  baseExamConfig: ExamConfig;
  getClassNumberForSection: (sec: string) => string;
}): PastedMarksPreviewResult {
  const {
    rawText,
    targetClass,
    targetSubject,
    replaceExisting,
    currentStudents,
    baseExamConfig,
    getClassNumberForSection,
  } = params;

  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line, index) => ({ raw: line, trimmed: line.trim(), lineNumber: index + 1 }))
    .filter((entry) => entry.trimmed.length > 0);

  if (lines.length === 0) {
    return {
      matchedStudentCount: 0,
      matchedMarksCount: 0,
      unmatchedLines: [],
      updatedStudents: currentStudents,
      detectedSubjects: [],
    };
  }

  const candidateSubjects = Array.from(
    new Set([
      ...baseExamConfig.subjects.map((s) => s.name),
      ...Object.values(baseExamConfig.classOverrides || {}).flatMap((ov) =>
        (ov.subjects || []).map((s) => s.name)
      ),
      'Computer Science',
    ])
  );

  const hasTabs = lines.some((l) => l.trimmed.includes('\t'));
  const hasCommas = !hasTabs && lines.every((l) => l.trimmed.includes(','));

  // Path A: Tabular TSV / CSV paste that begins with a recognizable header row
  if (hasTabs || hasCommas) {
    const delimiter: '\t' | ',' = hasTabs ? '\t' : ',';
    const aoa = lines.map((l) => splitDelimitedLine(l.trimmed, delimiter));
    if (looksLikeHeaderRow(aoa[0], candidateSubjects)) {
      const mode: 'subject' | 'consolidated' =
        targetSubject === '__ALL__' ? 'consolidated' : 'subject';
      const fallbackSub =
        targetSubject === '__ALL__'
          ? baseExamConfig.subjects[0]?.name || 'English'
          : targetSubject;

      // Track baseline before applying spreadsheet parser
      const sheetImport = parseImportedSpreadsheetRows({
        sheetNames: ['PastedMarks'],
        sheetsAoa: { PastedMarks: aoa },
        uploadMode: mode,
        uploadTargetSubject: fallbackSub,
        currentStudents,
        baseExamConfig,
        selectedClass: targetClass,
        getClassNumberForSection,
      });

      if (sheetImport.success && sheetImport.importedCount > 0) {
        const matchedIds = new Set<string>();
        const touchedSubjects = new Set<string>();
        let marksChangedOrParsed = 0;

        const scopedIds = new Set(
          currentStudents
            .filter(
              (st) =>
                targetClass === 'all' ||
                st.section.toLowerCase() === targetClass.toLowerCase()
            )
            .map((st) => st.id)
        );

        // Compute which rows matched from the extracted sheet rows
        const headerCols = aoa[0].map((c) => normalizeText(c));
        const headerSubjectMatches = headerCols
          .map((c) => normalizeSubjectHeaderName(c, candidateSubjects))
          .filter((v): v is string => Boolean(v));

        sheetImport.updatedStudents.forEach((nextSt, idx) => {
          const prevSt = currentStudents[idx];
          if (!prevSt) {
            matchedIds.add(nextSt.id);
            Object.keys(nextSt.marks).forEach((sub) => {
              if (nextSt.marks[sub] !== undefined && nextSt.marks[sub] !== null) {
                touchedSubjects.add(sub);
                marksChangedOrParsed++;
              }
            });
            return;
          }
          // Check if student's roll/name/adm matched any row in aoa[1..]
          const rollIdx = headerCols.findIndex((c) => c.includes('roll'));
          const nameIdx = headerCols.findIndex((c) => c.includes('name'));
          const admIdx = headerCols.findIndex((c) => c.includes('adm') || c.includes('id'));
          const matchedDataRow = aoa.slice(1).find((row) => {
            const adm = admIdx >= 0 ? normalizeText(row[admIdx]) : '';
            const nm = nameIdx >= 0 ? normalizeText(row[nameIdx]) : '';
            const rl = rollIdx >= 0 ? normalizeRoll(row[rollIdx]) : '';
            if (adm && normalizeText(prevSt.admissionNo) === adm) return true;
            if (nm && normalizeText(prevSt.name) === nm && scopedIds.has(prevSt.id)) return true;
            if (
              rl &&
              targetClass !== 'all' &&
              normalizeRoll(prevSt.rollNo) === rl &&
              scopedIds.has(prevSt.id)
            ) {
              return true;
            }
            return false;
          });

          if (matchedDataRow) {
            matchedIds.add(prevSt.id);
            if (mode === 'subject') {
              touchedSubjects.add(fallbackSub);
              marksChangedOrParsed++;
            } else {
              const effSubjects = getEffectiveExamConfigForClass(
                baseExamConfig,
                prevSt.section
              ).subjects;
              const subsToCount =
                headerSubjectMatches.length > 0
                  ? headerSubjectMatches
                  : effSubjects.map((s) => s.name);
              subsToCount.forEach((sName) => {
                if (nextSt.marks[sName] !== undefined) {
                  touchedSubjects.add(sName);
                  marksChangedOrParsed++;
                }
              });
            }
          }
        });

        let finalStudents = sheetImport.updatedStudents;
        if (replaceExisting && matchedIds.size > 0) {
          finalStudents = finalStudents.map((st) => {
            if (!scopedIds.has(st.id) || matchedIds.has(st.id)) return st;
            const nextMarks = { ...st.marks };
            const nextBreakdowns: Record<string, SubjectBreakdown> = {
              ...(st.breakdowns || {}),
            };
            if (mode === 'subject') {
              nextMarks[fallbackSub] = null;
              delete nextBreakdowns[fallbackSub];
            } else {
              getEffectiveExamConfigForClass(baseExamConfig, st.section).subjects.forEach(
                (sub) => {
                  nextMarks[sub.name] = null;
                  delete nextBreakdowns[sub.name];
                }
              );
            }
            return { ...st, marks: nextMarks, breakdowns: nextBreakdowns };
          });
        }

        return {
          matchedStudentCount: matchedIds.size,
          matchedMarksCount: marksChangedOrParsed,
          unmatchedLines: [],
          updatedStudents: finalStudents,
          detectedSubjects: Array.from(touchedSubjects),
        };
      }
    }
  }

  // Path B: Headerless lines (plain text like `01 Ajinkya Balu Gurav 85`, TSV, or CSV)
  const workingStudents = [...currentStudents];
  const matchedStudentIds = new Set<string>();
  const detectedSubjects = new Set<string>();
  const unmatchedLines: UnmatchedPasteLine[] = [];
  let matchedMarksCount = 0;

  for (const entry of lines) {
    let rollNo = '';
    let name = '';
    let admissionNo = '';
    let markTokens: string[] = [];

    if (hasTabs || hasCommas) {
      const delimiter: '\t' | ',' = hasTabs ? '\t' : ',';
      const cells = splitDelimitedLine(entry.trimmed, delimiter).filter(
        (c, idx, arr) => idx < arr.length - 1 || c !== ''
      );

      if (targetSubject === '__ALL__') {
        // Scan right-to-left for contiguous mark tokens
        let splitIdx = cells.length;
        while (splitIdx > 1 && isMarkLikeToken(cells[splitIdx - 1])) {
          splitIdx--;
        }
        markTokens = cells.slice(splitIdx);
        const leftCells = cells.slice(0, splitIdx);
        if (leftCells.length >= 2) {
          if (/^[a-z]+-\d+/i.test(leftCells[0])) {
            admissionNo = leftCells[0];
            name = leftCells.slice(1).join(' ');
          } else if (normalizeRoll(leftCells[0]) && /^\d+$/.test(leftCells[0].replace(/[^\d]/g, ''))) {
            rollNo = leftCells[0];
            name = leftCells.slice(1).join(' ');
          } else {
            name = leftCells.join(' ');
          }
        } else if (leftCells.length === 1) {
          if (/^\d+$/.test(leftCells[0].replace(/[^\d]/g, ''))) {
            rollNo = leftCells[0];
          } else {
            name = leftCells[0];
          }
        }
      } else {
        // Single subject TSV/CSV: find the rightmost mark-like cell (or col 2 if [roll, name, mark])
        const lastCell = cells[cells.length - 1] ?? '';
        if (cells.length >= 2 && isMarkLikeToken(lastCell)) {
          markTokens = [lastCell];
          const leftCells = cells.slice(0, cells.length - 1);
          if (leftCells.length >= 2) {
            rollNo = leftCells[0];
            name = leftCells[1];
          } else if (leftCells.length === 1) {
            if (/^\d+$/.test(leftCells[0].replace(/[^\d]/g, ''))) {
              rollNo = leftCells[0];
            } else {
              name = leftCells[0];
            }
          }
        }
      }
    } else {
      // Plain space / separator delimited line:
      // Examples:
      //   01 Ajinkya Balu Gurav 85
      //   01 - Ajinkya Balu Gurav - 85
      //   01. Ajinkya Balu Gurav: AB
      //   01 85
      //   Ajinkya Balu Gurav 85
      //   01 Ajinkya Balu Gurav 22 24 21 25 23 20
      const cleanedLine = entry.trimmed
        .replace(/^(\d+)\s*[.)\-:]\s+/, '$1 ')
        .replace(/\s+[-–—:]\s+(?=[0-9]+(?:\.[0-9]+)?$|ab$|absent$|a$)/i, ' ');
      const tokens = cleanedLine.split(/\s+/).filter(Boolean);

      if (tokens.length >= 2) {
        if (targetSubject === '__ALL__') {
          let splitIdx = tokens.length;
          while (splitIdx > 1 && isMarkLikeToken(tokens[splitIdx - 1])) {
            splitIdx--;
          }
          // Avoid consuming a trailing house/class word; marks must be at least 1 token
          markTokens = tokens.slice(splitIdx);
          const idTokens = tokens.slice(0, splitIdx);
          if (idTokens.length > 0 && /^\d{1,3}$/.test(idTokens[0])) {
            rollNo = idTokens[0];
            name = idTokens.slice(1).join(' ');
          } else {
            name = idTokens.join(' ');
          }
        } else {
          const lastTok = tokens[tokens.length - 1];
          if (isMarkLikeToken(lastTok)) {
            markTokens = [lastTok];
            const idTokens = tokens.slice(0, -1);
            if (idTokens.length > 0 && /^\d{1,3}$/.test(idTokens[0])) {
              rollNo = idTokens[0];
              name = idTokens.slice(1).join(' ');
            } else {
              name = idTokens.join(' ');
            }
          }
        }
      }
    }

    if (markTokens.length === 0) {
      unmatchedLines.push({
        lineNumber: entry.lineNumber,
        raw: entry.trimmed,
        reason: 'Missing mark value',
      });
      continue;
    }

    const matchIdx = resolveStudentMatch({
      rollNo,
      name,
      admissionNo,
      targetClass,
      currentStudents: workingStudents,
    });

    if (matchIdx === -1) {
      unmatchedLines.push({
        lineNumber: entry.lineNumber,
        raw: entry.trimmed,
        reason: 'Student not found in selected class',
      });
      continue;
    }

    let targetStudent = workingStudents[matchIdx];
    const effectiveCfg = getEffectiveExamConfigForClass(
      baseExamConfig,
      targetStudent.section
    );

    if (targetSubject === '__ALL__') {
      const subjectsForStudent = effectiveCfg.subjects;
      let appliedForStudent = 0;
      markTokens.slice(0, subjectsForStudent.length).forEach((tok, subIdx) => {
        const subCfg = subjectsForStudent[subIdx];
        const parsed = parseSingleMarkToken(tok, subCfg.maxMarks || 100);
        if (parsed !== undefined) {
          targetStudent = applyMarkToStudent({
            student: targetStudent,
            subjectName: subCfg.name,
            markValue: parsed,
            baseExamConfig,
          });
          detectedSubjects.add(subCfg.name);
          appliedForStudent++;
          matchedMarksCount++;
        }
      });

      if (appliedForStudent > 0) {
        workingStudents[matchIdx] = targetStudent;
        matchedStudentIds.add(targetStudent.id);
      } else {
        unmatchedLines.push({
          lineNumber: entry.lineNumber,
          raw: entry.trimmed,
          reason: 'No valid subject marks found',
        });
      }
    } else {
      const subCfg =
        effectiveCfg.subjects.find(
          (s) => s.name.toLowerCase() === targetSubject.toLowerCase()
        ) ||
        baseExamConfig.subjects.find(
          (s) => s.name.toLowerCase() === targetSubject.toLowerCase()
        );
      const maxVal = subCfg?.maxMarks ?? 100;
      const parsed = parseSingleMarkToken(markTokens[0], maxVal);
      if (parsed === undefined) {
        unmatchedLines.push({
          lineNumber: entry.lineNumber,
          raw: entry.trimmed,
          reason: 'Invalid mark value',
        });
        continue;
      }

      const subjectName = subCfg?.name || targetSubject;
      workingStudents[matchIdx] = applyMarkToStudent({
        student: targetStudent,
        subjectName,
        markValue: parsed,
        baseExamConfig,
      });
      matchedStudentIds.add(targetStudent.id);
      detectedSubjects.add(subjectName);
      matchedMarksCount++;
    }
  }

  // Optional replacement: clear non-pasted marks inside selected class + subject scope
  let finalStudents = workingStudents;
  if (replaceExisting && matchedStudentIds.size > 0) {
    finalStudents = workingStudents.map((st) => {
      const inTargetClass =
        targetClass === 'all' ||
        st.section.toLowerCase() === targetClass.toLowerCase();
      if (!inTargetClass || matchedStudentIds.has(st.id)) return st;

      const nextMarks = { ...st.marks };
      const nextBreakdowns: Record<string, SubjectBreakdown> = {
        ...(st.breakdowns || {}),
      };
      if (targetSubject === '__ALL__') {
        getEffectiveExamConfigForClass(baseExamConfig, st.section).subjects.forEach(
          (sub) => {
            nextMarks[sub.name] = null;
            delete nextBreakdowns[sub.name];
          }
        );
      } else {
        const subCfg = getEffectiveExamConfigForClass(
          baseExamConfig,
          st.section
        ).subjects.find((s) => s.name.toLowerCase() === targetSubject.toLowerCase());
        const resolvedName = subCfg?.name || targetSubject;
        nextMarks[resolvedName] = null;
        delete nextBreakdowns[resolvedName];
      }
      return {
        ...st,
        marks: nextMarks,
        breakdowns: nextBreakdowns,
      };
    });
  }

  return {
    matchedStudentCount: matchedStudentIds.size,
    matchedMarksCount,
    unmatchedLines,
    updatedStudents: finalStudents,
    detectedSubjects: Array.from(detectedSubjects),
  };
}
