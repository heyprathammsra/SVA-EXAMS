export interface SubjectBreakdown {
  // Standard 80 + 20 Pattern (Classes 6-8 all subjects, Class 9 non-Hindi)
  internalMarks?: number | 'AB' | null; // Direct Internal Marks (Max 20)
  penPaper?: number | 'AB' | null; // Max 5
  multipleAssessment?: number | 'AB' | null; // Max 5
  subjectEnrichment?: number | 'AB' | null; // Max 5
  portfolio?: number | 'AB' | null; // Max 5
  writtenExam?: number | 'AB' | null; // Max 80 (or 45 for Class 9 Hindi)

  // Class 9 Hindi Pattern (Listening 20, Speaking 20, Project 15, SA 45)
  listening?: number | 'AB' | null; // Max 20
  speaking?: number | 'AB' | null; // Max 20
  project?: number | 'AB' | null; // Max 15
  saExam?: number | 'AB' | null; // Max 45
}

export interface StudentReportRow {
  id: string;
  rollNo: string;
  name: string;
  admissionNo: string;
  class: string;
  section: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  // Subject marks: subjectName -> mark (number | 'AB') (Total 100 or 80)
  marks: Record<string, number | 'AB' | null>;
  // Granular internal marks: subjectName -> breakdown
  breakdowns?: Record<string, SubjectBreakdown>;
  // Class teacher overall remark
  customRemarks?: string;
  // Subject teacher remarks: subjectName -> remark string
  subjectRemarks?: Record<string, string>;
}

export type TotalFormulaType = 'SUM' | 'BEST_5' | 'EXCLUDE_LOWEST' | 'WEIGHTED' | 'CUSTOM';

export interface SubjectConfig {
  name: string;
  maxMarks: number;
  passMarks: number;
  weight?: number;
  includedInTotal?: boolean;
}

export interface ResultCriteriaConfig {
  passPercentage: number; // e.g. 33 or 40
  maxAllowedFails: number; // e.g. 0 (strict pass all), 1 or 2 (compartment)
  graceMarks: number; // e.g. 0, 2, 5 marks
}

export interface ExamConfig {
  id: string;
  name: string;
  code: string;
  totalFormula: TotalFormulaType;
  customFormula?: string; // e.g. "(Maths * 0.4) + (Science * 0.4) + (English * 0.2)"
  resultCriteria?: ResultCriteriaConfig;
  subjects: SubjectConfig[];
}

export interface ExamInfo {
  schoolName: string;
  schoolAddress: string;
  schoolCode: string;
  affiliationNo: string;
  examName: string;
  academicSession: string;
  principalName: string;
  classTeacherName: string;
}

export interface ComputedStudentResult {
  student: StudentReportRow;
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  status: 'PASS' | 'FAIL' | 'COMPARTMENT' | 'ABSENT';
  rank?: number;
  subjectDetails: Array<{
    name: string;
    maxMarks: number;
    passMarks: number;
    obtained: number | 'AB' | null;
    grade: string;
    status: 'PASS' | 'FAIL' | 'ABSENT' | 'INCOMPLETE';
    appliedGraceMarks?: number;
    breakdown?: SubjectBreakdown;
    remark?: string;
  }>;
}

export function computeGrade(percentage: number): string {
  if (percentage >= 90) return 'A1';
  if (percentage >= 80) return 'A2';
  if (percentage >= 70) return 'B1';
  if (percentage >= 60) return 'B2';
  if (percentage >= 50) return 'C1';
  if (percentage >= 40) return 'C2';
  if (percentage >= 33) return 'D';
  return 'E';
}

/**
 * Safely evaluates a custom math formula string for a student's marks.
 * Example expressions:
 * - "(Maths * 0.4) + (Science * 0.4) + (English * 0.2)"
 * - "BEST(4)"
 * - "SUM - MIN"
 * - "(English + Maths + Science) / 3"
 */
export function evaluateCustomFormula(
  formulaStr: string,
  subjectMarks: Record<string, number | 'AB' | null>,
  subjects: SubjectConfig[]
): { obtained: number; max: number } {
  const eligible = subjects.filter((s) => s.includedInTotal !== false);
  let defaultTotalMax = 0;
  let defaultTotalObtained = 0;

  eligible.forEach((s) => {
    const raw = subjectMarks[s.name];
    const val = typeof raw === 'number' ? raw : 0;
    defaultTotalMax += s.maxMarks;
    defaultTotalObtained += val;
  });

  if (!formulaStr || !formulaStr.trim()) {
    return { obtained: defaultTotalObtained, max: defaultTotalMax };
  }

  // Strip leading '=' if user typed formula like Excel '=p1+p2+p3'
  let expr = formulaStr.trim();
  if (expr.startsWith('=')) {
    expr = expr.substring(1).trim();
  }

  const trimmedUpper = expr.toUpperCase();

  // Helper macro: BEST(N)
  const bestMatch = trimmedUpper.match(/^BEST\((\d+)\)$/i);
  if (bestMatch) {
    const n = parseInt(bestMatch[1], 10) || 5;
    const sorted = [...eligible].sort((a, b) => {
      const scoreA = typeof subjectMarks[a.name] === 'number' && a.maxMarks > 0 ? (subjectMarks[a.name] as number) / a.maxMarks : -1;
      const scoreB = typeof subjectMarks[b.name] === 'number' && b.maxMarks > 0 ? (subjectMarks[b.name] as number) / b.maxMarks : -1;
      return scoreB - scoreA;
    });
    const topN = sorted.slice(0, n);
    let ob = 0;
    let mx = 0;
    topN.forEach((s) => {
      const raw = subjectMarks[s.name];
      if (typeof raw === 'number') ob += raw;
      mx += s.maxMarks;
    });
    return { obtained: ob, max: mx };
  }

  // Helper macro: AVG
  if (trimmedUpper === 'AVG' || trimmedUpper === 'AVERAGE') {
    const avg = eligible.length > 0 ? defaultTotalObtained / eligible.length : 0;
    return { obtained: Math.round(avg * 10) / 10, max: 100 };
  }

  try {
    let customTotalMax = 0;
    const referencedMaxes: number[] = [];

    // Replace p1, p2, p3... paper aliases (1-indexed based on subject list)
    subjects.forEach((s, idx) => {
      const pAlias = `P${idx + 1}`;
      const val = typeof subjectMarks[s.name] === 'number' ? (subjectMarks[s.name] as number) : 0;

      // Check if pAlias is referenced in formula
      const pRegex = new RegExp(`\\b${pAlias}\\b`, 'gi');
      if (pRegex.test(expr)) {
        referencedMaxes.push(s.maxMarks);
      }

      expr = expr.replace(pRegex, String(val));
    });

    // Replace subject names (e.g. Maths, Science)
    subjects.forEach((s) => {
      const val = typeof subjectMarks[s.name] === 'number' ? (subjectMarks[s.name] as number) : 0;

      // Replace bracketed name [Maths]
      const bracketRegex = new RegExp(`\\[${s.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\]`, 'gi');
      expr = expr.replace(bracketRegex, String(val));

      // Replace bare word Maths
      const wordRegex = new RegExp(`\\b${s.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\b`, 'gi');
      expr = expr.replace(wordRegex, String(val));
    });

    // Replace keywords
    expr = expr.replace(/\bSUM\b/gi, String(defaultTotalObtained));

    // Sanitize expression to allow only numbers, spaces, +, -, *, /, (, ), .
    if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
      return { obtained: defaultTotalObtained, max: defaultTotalMax };
    }

    const evaluated = Function(`"use strict"; return (${expr})`)();
    if (typeof evaluated === 'number' && !isNaN(evaluated) && isFinite(evaluated)) {
      const ob = Math.max(0, Math.round(evaluated * 10) / 10);
      if (referencedMaxes.length > 0) {
        customTotalMax = referencedMaxes.reduce((a, b) => a + b, 0);
      } else {
        customTotalMax = defaultTotalMax;
      }
      return { obtained: ob, max: customTotalMax };
    }
  } catch {
    // Fallback on standard sum on expression syntax error
  }

  return { obtained: defaultTotalObtained, max: defaultTotalMax };
}

export function computeStudentResult(
  student: StudentReportRow,
  subjects: SubjectConfig[],
  totalFormula: TotalFormulaType = 'SUM',
  customFormula?: string,
  resultCriteria?: ResultCriteriaConfig
): ComputedStudentResult {
  let failedSubjectsCount = 0;
  let isAllAbsent = true;

  const graceMarksAvailable = resultCriteria?.graceMarks ?? 0;
  const passThresholdPct = resultCriteria?.passPercentage ?? 33;
  const maxAllowedFails = resultCriteria?.maxAllowedFails ?? 0;

  const subjectDetails = subjects.map((sub) => {
    const raw = student.marks[sub.name];
    let obtained: number | 'AB' | null = null;
    let grade = 'E';
    let status: 'PASS' | 'FAIL' | 'ABSENT' | 'INCOMPLETE' = 'PASS';
    let appliedGraceMarks = 0;

    if (raw === 'AB') {
      obtained = 'AB';
      status = 'ABSENT';
      failedSubjectsCount++;
    } else if (raw === null || raw === undefined || (raw as any) === '') {
      obtained = null;
      status = 'INCOMPLETE';
    } else {
      isAllAbsent = false;
      let num = Number(raw);

      // Check if grace marks can save a borderline fail
      if (num < sub.passMarks && graceMarksAvailable > 0) {
        const needed = sub.passMarks - num;
        if (needed <= graceMarksAvailable) {
          num += needed;
          appliedGraceMarks = needed;
        }
      }

      obtained = typeof raw === 'number' ? raw : num;
      const pct = sub.maxMarks > 0 ? (num / sub.maxMarks) * 100 : 0;
      grade = computeGrade(pct);

      if (num < sub.passMarks) {
        status = 'FAIL';
        failedSubjectsCount++;
      }
    }

    return {
      name: sub.name,
      maxMarks: sub.maxMarks,
      passMarks: sub.passMarks,
      obtained,
      grade,
      status,
      weight: sub.weight ?? 1,
      includedInTotal: sub.includedInTotal !== false,
      appliedGraceMarks,
      breakdown: student.breakdowns?.[sub.name],
      remark: student.subjectRemarks?.[sub.name],
    };
  });

  // Calculate Total and TotalMax according to user formula
  let totalObtained = 0;
  let totalMax = 0;
  const eligibleSubjects = subjectDetails.filter((s) => s.includedInTotal !== false);

  if (totalFormula === 'CUSTOM') {
    const res = evaluateCustomFormula(customFormula || '', student.marks, subjects);
    totalObtained = res.obtained;
    totalMax = res.max;
  } else if (totalFormula === 'BEST_5') {
    // Sort by percentage score descending
    const sorted = [...eligibleSubjects].sort((a, b) => {
      const scoreA = typeof a.obtained === 'number' && a.maxMarks > 0 ? a.obtained / a.maxMarks : -1;
      const scoreB = typeof b.obtained === 'number' && b.maxMarks > 0 ? b.obtained / b.maxMarks : -1;
      return scoreB - scoreA;
    });
    const top5 = sorted.slice(0, 5);
    top5.forEach((s) => {
      if (typeof s.obtained === 'number') totalObtained += s.obtained;
      totalMax += s.maxMarks;
    });
  } else if (totalFormula === 'EXCLUDE_LOWEST') {
    if (eligibleSubjects.length > 1) {
      const sorted = [...eligibleSubjects].sort((a, b) => {
        const scoreA = typeof a.obtained === 'number' && a.maxMarks > 0 ? a.obtained / a.maxMarks : -1;
        const scoreB = typeof b.obtained === 'number' && b.maxMarks > 0 ? b.obtained / b.maxMarks : -1;
        return scoreA - scoreB;
      });
      // Skip the lowest scoring paper
      sorted.slice(1).forEach((s) => {
        if (typeof s.obtained === 'number') totalObtained += s.obtained;
        totalMax += s.maxMarks;
      });
    } else {
      eligibleSubjects.forEach((s) => {
        if (typeof s.obtained === 'number') totalObtained += s.obtained;
        totalMax += s.maxMarks;
      });
    }
  } else if (totalFormula === 'WEIGHTED') {
    eligibleSubjects.forEach((s) => {
      const w = s.weight || 1;
      if (typeof s.obtained === 'number') totalObtained += s.obtained * w;
      totalMax += s.maxMarks * w;
    });
    totalObtained = Math.round(totalObtained * 10) / 10;
    totalMax = Math.round(totalMax * 10) / 10;
  } else {
    // Standard SUM
    eligibleSubjects.forEach((s) => {
      if (typeof s.obtained === 'number') totalObtained += s.obtained;
      totalMax += s.maxMarks;
    });
  }

  const percentage = totalMax > 0 ? (totalObtained / totalMax) * 100 : 0;
  const overallGrade = computeGrade(percentage);

  let status: 'PASS' | 'FAIL' | 'COMPARTMENT' | 'ABSENT' = 'PASS';
  if (isAllAbsent && subjects.length > 0) {
    status = 'ABSENT';
  } else if (failedSubjectsCount > 0) {
    if (failedSubjectsCount <= maxAllowedFails && maxAllowedFails > 0) {
      status = 'COMPARTMENT';
    } else {
      status = 'FAIL';
    }
  } else if (percentage < passThresholdPct) {
    status = 'FAIL';
  }

  return {
    student,
    totalObtained,
    totalMax,
    percentage: Math.round(percentage * 100) / 100,
    grade: overallGrade,
    status,
    subjectDetails,
  };
}

export function computeClassResults(
  students: StudentReportRow[],
  subjects: SubjectConfig[],
  totalFormula: TotalFormulaType = 'SUM',
  customFormula?: string,
  resultCriteria?: ResultCriteriaConfig
): ComputedStudentResult[] {
  const list = students.map((s) =>
    computeStudentResult(s, subjects, totalFormula, customFormula, resultCriteria)
  );

  // Group by student's class (section / class) so rank is counted as per class, not from the whole school
  const classGroups = new Map<string, ComputedStudentResult[]>();
  for (const item of list) {
    const classKey = item.student.section || item.student.class || 'Default';
    if (!classGroups.has(classKey)) {
      classGroups.set(classKey, []);
    }
    classGroups.get(classKey)!.push(item);
  }

  // Compute rank independently within each class
  for (const group of classGroups.values()) {
    const sorted = [...group].sort((a, b) => {
      if (b.percentage !== a.percentage) {
        return b.percentage - a.percentage;
      }
      return b.totalObtained - a.totalObtained;
    });

    let currentRank = 1;
    sorted.forEach((item, idx) => {
      if (idx > 0 && sorted[idx - 1].percentage !== item.percentage) {
        currentRank = idx + 1;
      }
      item.rank = currentRank;
    });
  }

  return list;
}

export interface SubjectStatistics {
  name: string;
  average: number;
  highest: number;
  lowest: number;
  passedCount: number;
  totalCount: number;
  passRate: number;
}

export interface ClassSummaryMetrics {
  totalStudents: number;
  totalSubjects: number;
  classAverage: number;
  topScore: number;
  topStudentName: string;
  passCount: number;
  failCount: number;
  passRate: number;
}

export function computeSubjectStatistics(
  students: StudentReportRow[],
  subjects: SubjectConfig[]
): Record<string, SubjectStatistics> {
  const stats: Record<string, SubjectStatistics> = {};

  subjects.forEach((sub) => {
    let sum = 0;
    let count = 0;
    let passed = 0;
    let max = -Infinity;
    let min = Infinity;

    students.forEach((s) => {
      const mark = s.marks[sub.name];
      if (typeof mark === 'number') {
        sum += mark;
        count++;
        if (mark >= sub.passMarks) passed++;
        if (mark > max) max = mark;
        if (mark < min) min = mark;
      }
    });

    stats[sub.name] = {
      name: sub.name,
      average: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
      highest: max === -Infinity ? 0 : max,
      lowest: min === Infinity ? 0 : min,
      passedCount: passed,
      totalCount: count,
      passRate: count > 0 ? Math.round((passed / count) * 100) : 0,
    };
  });

  return stats;
}

export const SMART_REMARKS_PRESETS = [
  {
    category: 'Exemplary (90%+)',
    remarks: [
      'Exemplary academic effort. Outstanding performance in Science and Math.',
      'Brilliant conceptual clarity, discipline, and consistent scholastic leadership.',
      'Exceptional performance with outstanding analytical and language skills.',
    ],
  },
  {
    category: 'High Achiever (75% - 89%)',
    remarks: [
      'Consistent high achiever. Excellent linguistic fluency and discipline.',
      'Very diligent and sincere student. Participates actively in discussions.',
      'Balanced grasp across all academic subjects and exemplary conduct.',
    ],
  },
  {
    category: 'Steady Progress (50% - 74%)',
    remarks: [
      'Good overall progress. Regular revision in mathematics recommended.',
      'Capable student with good potential. Focused practice will boost performance.',
      'Shows steady engagement. Recommended to practice written answer drafting.',
    ],
  },
  {
    category: 'Need Support / Re-test',
    remarks: [
      'Capable student. Appeared absent in test, needs scheduled re-evaluation.',
      'Requires targeted practice and conceptual revision in weak areas.',
      'Parent-teacher meeting recommended to structure study schedule.',
    ],
  },
];

export function isClass9Section(sectionOrClass: string): boolean {
  const norm = (sectionOrClass || '').toLowerCase();
  return norm.includes('ruby') || norm.includes('diamond') || norm.includes('class 9') || norm.includes('9');
}

/**
 * Computes the total subject score (out of 100) from internal breakdown components
 */
export function computeSubjectTotalFromBreakdown(
  subjectName: string,
  sectionOrClass: string,
  breakdown?: SubjectBreakdown
): number | 'AB' | null {
  if (!breakdown) return null;

  const isClass9 = isClass9Section(sectionOrClass);
  const isHindi = subjectName.toLowerCase() === 'hindi';

  if (isClass9 && isHindi) {
    // Class 9 Hindi pattern: Listening (20) + Speaking (20) + Project (15) + SA Exam (45) = 100
    const list = breakdown.listening;
    const spk = breakdown.speaking;
    const prj = breakdown.project;
    const sa = breakdown.saExam;

    if (list === 'AB' || spk === 'AB' || prj === 'AB' || sa === 'AB') {
      return 'AB';
    }

    const valList = typeof list === 'number' ? list : 0;
    const valSpk = typeof spk === 'number' ? spk : 0;
    const valPrj = typeof prj === 'number' ? prj : 0;
    const valSa = typeof sa === 'number' ? sa : 0;

    return Math.min(100, Math.round(valList + valSpk + valPrj + valSa));
  } else {
    // Standard CBSE 80 + 20 pattern: Internal (20) + Written Exam (80) = 100
    const we = breakdown.writtenExam;
    if (breakdown.internalMarks !== undefined) {
      const im = breakdown.internalMarks;
      if (im === 'AB' || we === 'AB') {
        return 'AB';
      }
      if (im === null && (we === null || we === undefined)) {
        return null;
      }
      const valIm = typeof im === 'number' ? im : 0;
      const valWe = typeof we === 'number' ? we : 0;
      return Math.min(100, Math.round(valIm + valWe));
    }

    const pp = breakdown.penPaper;
    const ma = breakdown.multipleAssessment;
    const se = breakdown.subjectEnrichment;
    const pf = breakdown.portfolio;

    if (pp === 'AB' || ma === 'AB' || se === 'AB' || pf === 'AB' || we === 'AB') {
      return 'AB';
    }

    const valPp = typeof pp === 'number' ? pp : 0;
    const valMa = typeof ma === 'number' ? ma : 0;
    const valSe = typeof se === 'number' ? se : 0;
    const valPf = typeof pf === 'number' ? pf : 0;
    const valWe = typeof we === 'number' ? we : 0;

    return Math.min(100, Math.round(valPp + valMa + valSe + valPf + valWe));
  }
}

/**
 * Generates an initial realistic breakdown from a total subject score (out of 80 or 100)
 */
export function generateDefaultBreakdown(
  totalScore: number | 'AB' | null,
  subjectName: string,
  sectionOrClass: string
): SubjectBreakdown {
  if (totalScore === 'AB') {
    return {
      internalMarks: 'AB',
      penPaper: 'AB',
      multipleAssessment: 'AB',
      subjectEnrichment: 'AB',
      portfolio: 'AB',
      writtenExam: 'AB',
      listening: 'AB',
      speaking: 'AB',
      project: 'AB',
      saExam: 'AB',
    };
  }

  const score = typeof totalScore === 'number' ? totalScore : 75;
  const pct = Math.min(1, Math.max(0, score / 100));
  const isClass9 = isClass9Section(sectionOrClass);
  const isHindi = subjectName.toLowerCase() === 'hindi';

  if (isClass9 && isHindi) {
    // Class 9 Hindi pattern: Listening (20), Speaking (20), Project (15), SA-1 (45) = 100
    const list = Math.min(20, Math.max(0, Math.round(pct * 20)));
    const spk = Math.min(20, Math.max(0, Math.round(pct * 20)));
    const prj = Math.min(15, Math.max(0, Math.round(pct * 15)));
    const sa = Math.min(45, Math.max(0, Math.round(score - (list + spk + prj))));

    return {
      listening: list,
      speaking: spk,
      project: prj,
      saExam: sa,
    };
  } else {
    // Standard 80 + 20 pattern: Internal Marks (20) + Exam Paper (80) = 100
    const pp = Math.min(5, Math.max(0, Math.round(pct * 5)));
    const ma = Math.min(5, Math.max(0, Math.round(pct * 5)));
    const se = Math.min(5, Math.max(0, Math.round(pct * 5)));
    const pf = Math.min(5, Math.max(0, Math.round(pct * 5)));
    const intMarks = Math.min(20, Math.max(0, pp + ma + se + pf));
    const we = Math.min(80, Math.max(0, Math.round(score - intMarks)));

    return {
      internalMarks: intMarks,
      penPaper: pp,
      multipleAssessment: ma,
      subjectEnrichment: se,
      portfolio: pf,
      writtenExam: we,
    };
  }
}

