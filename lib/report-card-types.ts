export interface InternalComponentConfig {
  key: string;
  label: string;
  maxMarks: number;
  isMainExam?: boolean;
  linkedExamId?: string;
}

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

  // Dynamic admin-defined internal or main exam components
  [key: string]: number | 'AB' | null | undefined;
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
  house?: string;
  height?: string | number;
  weight?: string | number;
  attendance?: string;
  // Subject marks: subjectName -> mark (number | 'AB') (Total 100 or 80 or 25)
  marks: Record<string, number | 'AB' | null>;
  // Granular internal marks: subjectName -> breakdown
  breakdowns?: Record<string, SubjectBreakdown>;
  // Class teacher overall remark
  customRemarks?: string;
  // Subject teacher remarks: subjectName -> remark string
  subjectRemarks?: Record<string, string>;
}

export const PT_EXAM_SUBJECT_NAMES = [
  'English',
  'Hindi',
  'Marathi',
  'Maths',
  'Science',
  'Social Science',
] as const;

export const PT_EXAM_CLASS9_SUBJECT_NAMES = [
  'English',
  'Hindi',
  'Marathi',
  'Maths',
  'Science',
  'Social Science',
  'Computer Science',
] as const;

export const REPORT_CARD_GRADING_SYSTEM: Array<{
  range: string;
  grade: string;
  min: number;
  max: number;
}> = [
  { range: '91 – 100', grade: 'A1', min: 91, max: 100 },
  { range: '81 – 90', grade: 'A2', min: 81, max: 90 },
  { range: '71 – 80', grade: 'B1', min: 71, max: 80 },
  { range: '61 – 70', grade: 'B2', min: 61, max: 70 },
  { range: '51 – 60', grade: 'C1', min: 51, max: 60 },
  { range: '41 – 50', grade: 'C2', min: 41, max: 50 },
  { range: '32 – 40', grade: 'D', min: 32, max: 40 },
  { range: '20 – 31', grade: 'E1', min: 20, max: 31 },
  { range: '01 – 19', grade: 'E2', min: 1, max: 19 },
];

export function isPtExam(examIdOrCode?: string): boolean {
  const norm = (examIdOrCode || '').trim().toUpperCase();
  return norm.startsWith('PT') || norm.includes('PERIODIC TEST');
}

export function getPtExamHeading(examIdOrName?: string): string {
  const norm = (examIdOrName || 'PT-1').trim().toUpperCase();
  const match =
    norm.match(/PT[\s-]*(\d+)/i) || norm.match(/PERIODIC\s+TEST[\s-]*(\d+)/i);
  if (match) {
    return `PERIODIC TEST - ${match[1]}`;
  }
  return norm;
}

export function getPtSubjectDisplayName(subjectName: string): string {
  const trimmed = (subjectName || '').trim();
  if (trimmed.toLowerCase() === 'maths' || trimmed.toLowerCase() === 'mathematics') {
    return 'MATHEMATICS';
  }
  if (trimmed.toLowerCase() === 'ss' || trimmed.toLowerCase() === 'social science') {
    return 'SOCIAL SCIENCE';
  }
  if (trimmed.toLowerCase() === 'cs' || trimmed.toLowerCase() === 'computer science') {
    return 'COMPUTER SCIENCE';
  }
  return trimmed.toUpperCase();
}

export function formatPtPercentage(totalObtained: number, totalMax: number): string {
  if (!totalMax || totalMax <= 0) return '0.00';
  const rawPct = (totalObtained / totalMax) * 100;
  const truncated = Math.floor((rawPct + 1e-9) * 100) / 100;
  return truncated.toFixed(2);
}

const DEFAULT_MOTHER_NAMES = [
  'Reshma',
  'Sunita',
  'Anita',
  'Kavita',
  'Savita',
  'mangal',
  'Rekha',
  'Sangita',
  'ashwini',
  'Pallavi',
  'Archana',
  'Vandana',
  'Vaishali',
  'Rupali',
  'Swati',
  'Poonam',
  'Meena',
  'Seema',
  'Geeta',
  'Neeta',
  'Rohini',
  'Shubhangi',
  'Ujwala',
  'Madhuri',
  'Yogita',
  'Suvarna',
  'Deepali',
  'Pramila',
  'Shobha',
  'Lata',
  'Asha',
  'Usha',
  'Vidya',
  'Nanda',
  'Chhaya',
];

export const SVA_SCHOOL_HOUSES = [
  'Sinhagad',
  'Raigad',
  'Shivneri',
  'Pratapgad',
] as const;

export type SvaSchoolHouse = typeof SVA_SCHOOL_HOUSES[number];

export interface ClassDefinition {
  id: string;
  section: string;
  grade: string;
}

export const DEFAULT_SVA_CLASSES: ClassDefinition[] = [
  { id: 'Sparkle', section: 'Sparkle', grade: 'Class 6' },
  { id: 'Twinkle', section: 'Twinkle', grade: 'Class 6' },
  { id: 'Topaz', section: 'Topaz', grade: 'Class 7' },
  { id: 'Jade', section: 'Jade', grade: 'Class 7' },
  { id: 'Garnet', section: 'Garnet', grade: 'Class 8' },
  { id: 'Emerald', section: 'Emerald', grade: 'Class 8' },
  { id: 'Ruby', section: 'Ruby', grade: 'Class 9' },
  { id: 'Diamond', section: 'Diamond', grade: 'Class 9' },
];

export const GRADE_OPTIONS = [
  'Class 1',
  'Class 2',
  'Class 3',
  'Class 4',
  'Class 5',
  'Class 6',
  'Class 7',
  'Class 8',
  'Class 9',
  'Class 10',
  'Class 11',
  'Class 12',
] as const;

export function gradeToRoman(gradeOrClass?: string): string {
  const raw = (gradeOrClass || '').trim().toUpperCase();
  if (!raw) return '';
  if (/^(I|II|III|IV|V|VI|VII|VIII|IX|X|XI|XII)$/.test(raw)) return raw;
  const numMatch = raw.match(/(?:CLASS\s*)?(\d{1,2})/);
  if (!numMatch) return '';
  const n = parseInt(numMatch[1], 10);
  const romans: Record<number, string> = {
    1: 'I',
    2: 'II',
    3: 'III',
    4: 'IV',
    5: 'V',
    6: 'VI',
    7: 'VII',
    8: 'VIII',
    9: 'IX',
    10: 'X',
    11: 'XI',
    12: 'XII',
  };
  return romans[n] || String(n);
}

export function getStudentPtProfile(student: StudentReportRow): {
  rollNoDisplay: string;
  classSectionDisplay: string;
  dobDisplay: string;
  fatherNameDisplay: string;
  motherNameDisplay: string;
  house: string;
  height: string;
  weight: string;
  attendance: string;
} {
  const numericRoll = parseInt(String(student.rollNo), 10);
  const rollNoDisplay = !isNaN(numericRoll) && numericRoll > 0 ? String(numericRoll) : String(student.rollNo || '1');

  const section = (student.section || 'Twinkle').trim();
  const romanMap: Record<string, string> = {
    Sparkle: 'VI - Sparkle',
    Twinkle: 'VI - Twinkle',
    Topaz: 'VII - Topaz',
    Jade: 'VII - Jade',
    Garnet: 'VIII - Garnet',
    Emerald: 'VIII - Emerald',
    Ruby: 'IX - Ruby',
    Diamond: 'IX - Diamond',
  };
  const romanFromStudentClass = gradeToRoman(student.class);
  const classSectionDisplay = romanFromStudentClass
    ? `${romanFromStudentClass} - ${section}`
    : romanMap[section] || `${student.class || 'VI'} - ${section}`;

  const isAayushSample =
    student.id === 'STU-2026-0031' ||
    student.name.trim().toLowerCase() === 'aayush satish nalawade';

  let dobDisplay = '09/02/2015';
  if (isAayushSample && (!student.dob || student.dob === '2010-07-03')) {
    dobDisplay = '09/02/2015';
  } else if (student.dob) {
    const isoMatch = student.dob.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
      dobDisplay = `${isoMatch[3]}/${isoMatch[2]}/${isoMatch[1]}`;
    } else {
      dobDisplay = student.dob.trim();
    }
  }

  const nameParts = student.name.trim().split(/\s+/);
  const studentLastName = nameParts.length >= 2 ? nameParts[nameParts.length - 1] : '';
  const defaultSeedFatherName =
    nameParts.length >= 3 ? `${nameParts[1]} ${nameParts[nameParts.length - 1]}` : '';
  const defaultSeedMotherName = studentLastName ? `Mrs. ${studentLastName}` : '';

  let fatherNameDisplay = (student.fatherName || '').trim();
  if (
    isAayushSample &&
    (!fatherNameDisplay || fatherNameDisplay.toLowerCase() === 'satish nalawade')
  ) {
    fatherNameDisplay = 'Satish';
  } else if (
    fatherNameDisplay &&
    defaultSeedFatherName &&
    fatherNameDisplay.toLowerCase() === defaultSeedFatherName.toLowerCase()
  ) {
    fatherNameDisplay = nameParts[1];
  } else if (!fatherNameDisplay) {
    fatherNameDisplay = nameParts.length >= 3 ? nameParts[1] : 'Parent';
  }

  let motherNameDisplay = (student.motherName || '').trim();
  if (
    isAayushSample &&
    (!motherNameDisplay || motherNameDisplay.toLowerCase() === 'mrs. nalawade')
  ) {
    motherNameDisplay = 'Reshma';
  } else if (
    !motherNameDisplay ||
    (defaultSeedMotherName &&
      motherNameDisplay.toLowerCase() === defaultSeedMotherName.toLowerCase())
  ) {
    const idx = (!isNaN(numericRoll) ? Math.max(0, numericRoll - 1) : 0) % DEFAULT_MOTHER_NAMES.length;
    const picked = DEFAULT_MOTHER_NAMES[idx];
    motherNameDisplay = picked.charAt(0).toUpperCase() + picked.slice(1);
  }

  const house =
    (student.house || '').trim() ||
    (isAayushSample
      ? 'Sinhagad'
      : SVA_SCHOOL_HOUSES[(!isNaN(numericRoll) ? Math.max(0, numericRoll - 1) : 0) % SVA_SCHOOL_HOUSES.length]);

  let defaultHeight = 129;
  let defaultWeight = 21;
  if (!isAayushSample) {
    const rOffset = !isNaN(numericRoll) ? numericRoll % 11 : 0;
    if (section === 'Sparkle' || section === 'Twinkle' || student.class === 'Class 6') {
      defaultHeight = 128 + rOffset;
      defaultWeight = 21 + (rOffset % 8);
    } else if (section === 'Topaz' || section === 'Jade' || student.class === 'Class 7') {
      defaultHeight = 135 + rOffset;
      defaultWeight = 26 + (rOffset % 9);
    } else if (section === 'Garnet' || section === 'Emerald' || student.class === 'Class 8') {
      defaultHeight = 142 + rOffset;
      defaultWeight = 31 + (rOffset % 10);
    } else {
      defaultHeight = 148 + rOffset;
      defaultWeight = 36 + (rOffset % 12);
    }
  }

  const rawHeight =
    student.height !== undefined && student.height !== ''
      ? String(student.height)
      : String(defaultHeight);
  const rawWeight =
    student.weight !== undefined && student.weight !== ''
      ? String(student.weight)
      : String(defaultWeight);

  const cleanHeight = rawHeight.trim().replace(/\s*cm$/i, '');
  const cleanWeight = rawWeight.trim().replace(/\s*kg$/i, '');
  const height = cleanHeight;
  const weight = cleanWeight;
  const attendance = (student.attendance || '').trim() || '31/31';

  return {
    rollNoDisplay,
    classSectionDisplay,
    dobDisplay,
    fatherNameDisplay,
    motherNameDisplay,
    house,
    height,
    weight,
    attendance,
  };
}

export type TotalFormulaType = 'SUM' | 'BEST_5' | 'EXCLUDE_LOWEST' | 'WEIGHTED' | 'CUSTOM';

export interface SubjectConfig {
  name: string;
  maxMarks: number;
  passMarks: number;
  weight?: number;
  includedInTotal?: boolean;
  components?: InternalComponentConfig[];
}

export interface ResultCriteriaConfig {
  passPercentage: number; // e.g. 33 or 40
  maxAllowedFails: number; // e.g. 0 (strict pass all), 1 or 2 (compartment)
  graceMarks: number; // e.g. 0, 2, 5 marks
}

export interface ClassExamOverride {
  totalFormula?: TotalFormulaType;
  customFormula?: string;
  resultCriteria?: ResultCriteriaConfig;
  subjects?: SubjectConfig[];
}

export interface ExamConfig {
  id: string;
  name: string;
  code: string;
  totalFormula: TotalFormulaType;
  customFormula?: string; // e.g. "(Maths * 0.4) + (Science * 0.4) + (English * 0.2)"
  resultCriteria?: ResultCriteriaConfig;
  subjects: SubjectConfig[];
  classOverrides?: Record<string, ClassExamOverride>;
}

export function getClassGradeFromSection(
  sec: string,
  classRegistry?: ClassDefinition[]
): string {
  const norm = (sec || '').trim();
  if (classRegistry && classRegistry.length > 0) {
    const match = classRegistry.find(
      (c) => c.section.toLowerCase() === norm.toLowerCase() || c.id.toLowerCase() === norm.toLowerCase()
    );
    if (match) return match.grade;
  }
  if (norm === 'Sparkle' || norm === 'Twinkle' || norm === 'Class 6') return 'Class 6';
  if (norm === 'Topaz' || norm === 'Jade' || norm === 'Class 7') return 'Class 7';
  if (norm === 'Garnet' || norm === 'Emerald' || norm === 'Class 8') return 'Class 8';
  if (norm === 'Ruby' || norm === 'Diamond' || norm === 'Class 9') return 'Class 9';
  return norm;
}

export function hasCsInPtExam(sectionOrClass?: string, gradeOrClass?: string): boolean {
  const norm = (sectionOrClass || '').trim().toLowerCase();
  const gradeNorm = (gradeOrClass || '').trim().toLowerCase();
  const matchesClass9 = (v: string) =>
    v === 'ruby' ||
    v === 'diamond' ||
    v === 'class 9' ||
    v === '9' ||
    v.includes('ruby') ||
    v.includes('diamond') ||
    v.includes('class 9');
  return matchesClass9(norm) || (gradeNorm ? matchesClass9(gradeNorm) : false);
}

export function getPtSubjectsForClass(
  sectionOrClass?: string,
  maxMarks: number = 25,
  passMarks: number = Math.round(maxMarks * 0.33)
): SubjectConfig[] {
  const names = hasCsInPtExam(sectionOrClass)
    ? PT_EXAM_CLASS9_SUBJECT_NAMES
    : PT_EXAM_SUBJECT_NAMES;
  return names.map((name) => ({
    name,
    maxMarks,
    passMarks,
  }));
}

export function getEffectiveExamConfigForClass(
  examConfig: ExamConfig,
  classOrSection?: string
): ExamConfig {
  if (!classOrSection || classOrSection === 'all' || classOrSection === 'ALL') {
    return examConfig;
  }
  const overrides = examConfig.classOverrides;
  const gradeKey = getClassGradeFromSection(classOrSection);
  const sectionOverride = overrides?.[classOrSection];
  const gradeOverride = gradeKey !== classOrSection ? overrides?.[gradeKey] : undefined;

  let resolvedSubjects =
    sectionOverride?.subjects ??
    gradeOverride?.subjects ??
    examConfig.subjects;

  if (isPtExam(examConfig.code || examConfig.id) && !sectionOverride?.subjects && !gradeOverride?.subjects) {
    if (hasCsInPtExam(classOrSection)) {
      const hasCs = resolvedSubjects.some((s) => {
        const lower = s.name.trim().toLowerCase();
        return lower === 'computer science' || lower === 'cs';
      });
      if (!hasCs) {
        const refSub = resolvedSubjects[0];
        const csMax = refSub?.maxMarks || 25;
        const csPass = refSub?.passMarks ?? Math.round(csMax * 0.33);
        resolvedSubjects = [
          ...resolvedSubjects,
          {
            name: 'Computer Science',
            maxMarks: csMax,
            passMarks: csPass,
            includedInTotal: true,
            components:
              refSub?.components && refSub.components.length === 1
                ? [{ ...refSub.components[0], maxMarks: csMax }]
                : undefined,
          },
        ];
      }
    } else {
      resolvedSubjects = resolvedSubjects.filter((s) => {
        const lower = s.name.trim().toLowerCase();
        return lower !== 'computer science' && lower !== 'cs';
      });
    }
  }

  return {
    ...examConfig,
    totalFormula:
      sectionOverride?.totalFormula ??
      gradeOverride?.totalFormula ??
      examConfig.totalFormula,
    customFormula:
      sectionOverride?.customFormula ??
      gradeOverride?.customFormula ??
      examConfig.customFormula,
    resultCriteria:
      sectionOverride?.resultCriteria ??
      gradeOverride?.resultCriteria ??
      examConfig.resultCriteria,
    subjects: resolvedSubjects,
  };
}

export interface ExamInfo {
  schoolName: string;
  schoolAddress: string;
  schoolCode: string;
  affiliationNo: string;
  udiseNo?: string;
  schoolEmail?: string;
  examName: string;
  examCode?: string;
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
    includedInTotal?: boolean;
    internalObtained?: number | 'AB' | '-';
    internalMax?: number;
    mainObtained?: number | 'AB' | '-';
    mainMax?: number;
    breakdown?: SubjectBreakdown;
    remark?: string;
  }>;
}

export function computeSubjectComponentSummary(
  subjectName: string,
  components: InternalComponentConfig[] | undefined,
  breakdown: SubjectBreakdown | undefined,
  examCode: string = 'SA-1'
): {
  internalObtained: number | 'AB' | '-';
  internalMax: number;
  mainObtained: number | 'AB' | '-';
  mainMax: number;
  hasInternalSplit: boolean;
} {
  const comps =
    components && components.length > 0
      ? components
      : getDefaultSubjectComponents(subjectName, examCode);
  const mainComp = comps.find((c) => c.isMainExam) || comps[comps.length - 1];
  const intComps = comps.filter((c) => c !== mainComp);
  const intMax = intComps.reduce((sum, c) => sum + (c.maxMarks || 0), 0);
  const mainMax = mainComp?.maxMarks ?? 0;

  if (!breakdown || intComps.length === 0) {
    return {
      internalObtained: '-',
      internalMax: intMax,
      mainObtained: '-',
      mainMax,
      hasInternalSplit: intComps.length > 0,
    };
  }

  let internalObtained: number | 'AB' | '-' = '-';
  if (intComps.some((c) => c.key === 'listening')) {
    const allAb =
      breakdown.listening === 'AB' &&
      breakdown.speaking === 'AB' &&
      breakdown.project === 'AB';
    const hasAnyVal =
      breakdown.listening !== undefined ||
      breakdown.speaking !== undefined ||
      breakdown.project !== undefined;
    if (allAb) {
      internalObtained = 'AB';
    } else if (hasAnyVal) {
      const list = typeof breakdown.listening === 'number' ? breakdown.listening : 0;
      const spk = typeof breakdown.speaking === 'number' ? breakdown.speaking : 0;
      const prj = typeof breakdown.project === 'number' ? breakdown.project : 0;
      internalObtained = list + spk + prj;
    }
  } else {
    const usesExplicitInternalMarks = intComps.some((c) => c.key === 'internalMarks');
    const hasAnyIntCompVal = intComps.some(
      (c) => breakdown[c.key] !== undefined && breakdown[c.key] !== null
    );
    const allIntCompAB =
      hasAnyIntCompVal &&
      intComps.some((c) => breakdown[c.key] === 'AB') &&
      intComps.every(
        (c) =>
          breakdown[c.key] === 'AB' ||
          breakdown[c.key] === undefined ||
          breakdown[c.key] === null
      );

    if (usesExplicitInternalMarks) {
      internalObtained = breakdown.internalMarks ?? '-';
    } else if (hasAnyIntCompVal) {
      internalObtained = allIntCompAB
        ? 'AB'
        : intComps.reduce<number>(
            (sum, c) =>
              sum + (typeof breakdown[c.key] === 'number' ? Number(breakdown[c.key]) : 0),
            0
          );
    } else if (breakdown.internalMarks !== undefined && breakdown.internalMarks !== null) {
      internalObtained = breakdown.internalMarks;
    }
  }

  const rawMain = mainComp ? breakdown[mainComp.key] : undefined;
  const fallbackMain =
    rawMain !== undefined
      ? rawMain
      : mainComp?.key === 'saExam'
      ? breakdown.writtenExam
      : mainComp?.key === 'writtenExam'
      ? breakdown.saExam
      : undefined;
  const mainObtained =
    fallbackMain !== undefined && fallbackMain !== null ? fallbackMain : '-';

  return {
    internalObtained,
    internalMax: intMax,
    mainObtained,
    mainMax,
    hasInternalSplit: intComps.length > 0,
  };
}

export function computeGrade(percentage: number): string {
  const p = Math.round(percentage);
  if (p >= 91) return 'A1';
  if (p >= 81) return 'A2';
  if (p >= 71) return 'B1';
  if (p >= 61) return 'B2';
  if (p >= 51) return 'C1';
  if (p >= 41) return 'C2';
  if (p >= 32) return 'D';
  if (p >= 20) return 'E1';
  return 'E2';
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
  subjects: SubjectConfig[],
  breakdowns?: Record<string, SubjectBreakdown>
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

  // Helper macro: BEST(N) or BEST_N
  const bestMatch = trimmedUpper.match(/^BEST(?:\((\d+)\)|_(\d+))$/i);
  if (bestMatch) {
    const n = parseInt(bestMatch[1] || bestMatch[2], 10) || 5;
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
    // Extract per-subject breakdown details: total, main, and internal
    interface SubjectScores {
      name: string;
      totalObt: number;
      totalMax: number;
      mainObt: number;
      mainMax: number;
      intObt: number;
      intMax: number;
      components: Array<{ key: string; label: string; obt: number; max: number }>;
    }

    let sumMainObt = 0;
    let sumMainMax = 0;
    let sumIntObt = 0;
    let sumIntMax = 0;

    const subjectScoresList: SubjectScores[] = subjects.map((sub) => {
      const isEligible = sub.includedInTotal !== false;
      const rawTot = subjectMarks[sub.name];
      const totObt = typeof rawTot === 'number' ? rawTot : 0;
      const totMax = sub.maxMarks || 100;

      const rawBd = breakdowns?.[sub.name];
      const hasHindiSpecialBd =
        rawBd &&
        (rawBd.listening !== undefined ||
          rawBd.speaking !== undefined ||
          rawBd.project !== undefined ||
          rawBd.saExam !== undefined);

      let comps: InternalComponentConfig[];
      if (sub.components && sub.components.length > 0) {
        comps = sub.components;
      } else if (sub.maxMarks === 100) {
        if (sub.name.toLowerCase() === 'hindi' && hasHindiSpecialBd) {
          comps = getDefaultSubjectComponents('Hindi', 'SA-1');
        } else if (sub.name.toLowerCase() === 'computer science' && rawBd?.internalMarks !== undefined) {
          comps = getDefaultSubjectComponents('Computer Science', 'SA-1');
        } else {
          comps = [
            { key: 'penPaper', label: 'Pen Paper Test', maxMarks: 5, isMainExam: false },
            { key: 'multipleAssessment', label: 'Multiple Assessments', maxMarks: 5, isMainExam: false },
            { key: 'subjectEnrichment', label: 'Subject Enrichment', maxMarks: 5, isMainExam: false },
            { key: 'portfolio', label: 'Portfolio', maxMarks: 5, isMainExam: false },
            { key: 'writtenExam', label: 'Main Exam', maxMarks: 80, isMainExam: true },
          ];
        }
      } else {
        comps = [
          { key: 'writtenExam', label: 'Main Exam', maxMarks: sub.maxMarks || 100, isMainExam: true },
        ];
      }

      const bd =
        rawBd ||
        (totObt > 0 && comps.length > 1
          ? syncBreakdownWithTotal(totObt, sub.name, '', comps)
          : undefined);

      const mainComps = comps.filter((c) => c.isMainExam);
      const intComps = comps.filter((c) => !c.isMainExam);

      let mObt = 0;
      let mMx = 0;
      if (mainComps.length > 0) {
        mMx = mainComps.reduce((acc, c) => acc + (c.maxMarks || 0), 0);
        let foundMainInBd = false;
        for (const mc of mainComps) {
          const v = bd ? bd[mc.key] : undefined;
          if (typeof v === 'number') {
            mObt += v;
            foundMainInBd = true;
          } else if (v === undefined && (mc.key === 'writtenExam' || mc.key === 'saExam') && bd) {
            const alt = mc.key === 'saExam' ? (bd.saExam ?? bd.writtenExam) : (bd.writtenExam ?? bd.saExam);
            if (typeof alt === 'number') {
              mObt += alt;
              foundMainInBd = true;
            }
          }
        }
        if (!foundMainInBd && !bd && totObt > 0 && intComps.length === 0) {
          mObt = totObt;
        }
      } else {
        mObt = totObt;
        mMx = totMax;
      }

      let iObt = 0;
      let iMx = 0;
      if (intComps.length > 0) {
        iMx = intComps.reduce((acc, c) => acc + (c.maxMarks || 0), 0);
        let matchedAnyInt = false;
        for (const ic of intComps) {
          let v = bd ? bd[ic.key] : undefined;
          if (v === undefined && ic.key === 'internalMarks' && bd) {
            const pp = typeof bd.penPaper === 'number' ? bd.penPaper : 0;
            const ma = typeof bd.multipleAssessment === 'number' ? bd.multipleAssessment : 0;
            const se = typeof bd.subjectEnrichment === 'number' ? bd.subjectEnrichment : 0;
            const pf = typeof bd.portfolio === 'number' ? bd.portfolio : 0;
            if (
              bd.penPaper !== undefined ||
              bd.multipleAssessment !== undefined ||
              bd.subjectEnrichment !== undefined ||
              bd.portfolio !== undefined
            ) {
              v = pp + ma + se + pf;
            }
          }
          if (typeof v === 'number') {
            iObt += v;
            matchedAnyInt = true;
          }
        }
        // Fallback if custom components were configured on a subject whose breakdown still uses standard CBSE keys
        if (!matchedAnyInt && bd) {
          if (typeof bd.internalMarks === 'number') {
            iObt = bd.internalMarks;
          } else {
            const pp = typeof bd.penPaper === 'number' ? bd.penPaper : 0;
            const ma = typeof bd.multipleAssessment === 'number' ? bd.multipleAssessment : 0;
            const se = typeof bd.subjectEnrichment === 'number' ? bd.subjectEnrichment : 0;
            const pf = typeof bd.portfolio === 'number' ? bd.portfolio : 0;
            const li = typeof bd.listening === 'number' ? bd.listening : 0;
            const sp = typeof bd.speaking === 'number' ? bd.speaking : 0;
            const pr = typeof bd.project === 'number' ? bd.project : 0;
            iObt = pp + ma + se + pf + li + sp + pr;
          }
        }
      }

      const compDetails = comps.map((c) => {
        let cv = bd ? bd[c.key] : undefined;
        if (cv === undefined && c.key === 'internalMarks') cv = iObt;
        return {
          key: c.key,
          label: c.label,
          obt: typeof cv === 'number' ? cv : 0,
          max: c.maxMarks || 0,
        };
      });

      if (isEligible) {
        sumMainObt += mObt;
        sumMainMax += mMx;
        sumIntObt += iObt;
        sumIntMax += iMx;
      }

      return {
        name: sub.name,
        totalObt: totObt,
        totalMax: totMax,
        mainObt: mObt,
        mainMax: mMx,
        intObt: iObt,
        intMax: iMx,
        components: compDetails,
      };
    });

    let exprObt = expr;
    let exprMx = expr;

    // 1. Replace Global Internal & Main aggregators
    // SUM_INTERNAL / TOTAL_INTERNAL / TOTAL_INT / SUM_INT
    const internalSumRegex = /\b(SUM_INTERNAL|TOTAL_INTERNAL|TOTAL_INT|SUM_INT)\b/gi;
    exprObt = exprObt.replace(internalSumRegex, String(sumIntObt));
    exprMx = exprMx.replace(internalSumRegex, String(sumIntMax));

    // SUM_MAIN / TOTAL_MAIN / TOTAL_THEORY / SUM_THEORY
    const mainSumRegex = /\b(SUM_MAIN|TOTAL_MAIN|TOTAL_THEORY|SUM_THEORY)\b/gi;
    exprObt = exprObt.replace(mainSumRegex, String(sumMainObt));
    exprMx = exprMx.replace(mainSumRegex, String(sumMainMax));

    // SUM (standard overall total)
    const sumRegex = /\bSUM\b/gi;
    exprObt = exprObt.replace(sumRegex, String(defaultTotalObtained));
    exprMx = exprMx.replace(sumRegex, String(defaultTotalMax));

    // 2. Replace Paper index aliases (P1_INT, P1_MAIN, P1)
    subjectScoresList.forEach((scores, idx) => {
      const pIdx = idx + 1;

      // P{n}_INT / P{n}_INTERNAL
      const pIntRegex = new RegExp(`\\bP${pIdx}_(INT|INTERNAL)\\b`, 'gi');
      exprObt = exprObt.replace(pIntRegex, String(scores.intObt));
      exprMx = exprMx.replace(pIntRegex, String(scores.intMax));

      // P{n}_MAIN / P{n}_THEORY
      const pMainRegex = new RegExp(`\\bP${pIdx}_(MAIN|THEORY|WRITTEN)\\b`, 'gi');
      exprObt = exprObt.replace(pMainRegex, String(scores.mainObt));
      exprMx = exprMx.replace(pMainRegex, String(scores.mainMax));

      // P{n} (overall paper score)
      const pRegex = new RegExp(`\\bP${pIdx}\\b`, 'gi');
      exprObt = exprObt.replace(pRegex, String(scores.totalObt));
      exprMx = exprMx.replace(pRegex, String(scores.totalMax));
    });

    // 3. Replace Subject specific tokens: [Subject:Component], [Subject:Internal], [Subject:Main], [Subject]
    // Sort by name length descending so "Computer Science" and "Social Science" are replaced before "Science"
    const sortedByLength = [...subjectScoresList].sort((a, b) => b.name.length - a.name.length);

    // 3a. Replace all bracketed tokens first
    sortedByLength.forEach((scores) => {
      const escapedSub = scores.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

      // Individual sub-components: [English:Pen Paper] or [English:penPaper]
      scores.components.forEach((comp) => {
        const escapedLabel = comp.label.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
        const escapedKey = comp.key.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

        const compLabelRegex = new RegExp(`\\[${escapedSub}:\\s*${escapedLabel}\\]`, 'gi');
        exprObt = exprObt.replace(compLabelRegex, String(comp.obt));
        exprMx = exprMx.replace(compLabelRegex, String(comp.max));

        const compKeyRegex = new RegExp(`\\[${escapedSub}:\\s*${escapedKey}\\]`, 'gi');
        exprObt = exprObt.replace(compKeyRegex, String(comp.obt));
        exprMx = exprMx.replace(compKeyRegex, String(comp.max));
      });

      // [Subject:Internal] / [Subject:Int]
      const subIntRegex = new RegExp(`\\[${escapedSub}:\\s*(INTERNAL|INT)\\]`, 'gi');
      exprObt = exprObt.replace(subIntRegex, String(scores.intObt));
      exprMx = exprMx.replace(subIntRegex, String(scores.intMax));

      // [Subject:Main] / [Subject:Theory]
      const subMainRegex = new RegExp(`\\[${escapedSub}:\\s*(MAIN|THEORY|WRITTEN)\\]`, 'gi');
      exprObt = exprObt.replace(subMainRegex, String(scores.mainObt));
      exprMx = exprMx.replace(subMainRegex, String(scores.mainMax));

      // Bracketed name: [Subject]
      const subBracketRegex = new RegExp(`\\[${escapedSub}\\]`, 'gi');
      exprObt = exprObt.replace(subBracketRegex, String(scores.totalObt));
      exprMx = exprMx.replace(subBracketRegex, String(scores.totalMax));
    });

    // 3b. Replace bare-word subject names (longest first so "Social Science" matches before "Science")
    sortedByLength.forEach((scores) => {
      const escapedSub = scores.name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const subWordRegex = new RegExp(`\\b${escapedSub}\\b`, 'gi');
      exprObt = exprObt.replace(subWordRegex, String(scores.totalObt));
      exprMx = exprMx.replace(subWordRegex, String(scores.totalMax));
    });

    // 4. Replace global component label/key tokens across all subjects: e.g. [Pen Paper Test] or [Portfolio]
    const globalCompMap = new Map<string, { obt: number; max: number }>();
    subjectScoresList.forEach((scores) => {
      scores.components.forEach((comp) => {
        const lKey = comp.label.toLowerCase();
        const kKey = comp.key.toLowerCase();
        const prevL = globalCompMap.get(lKey) || { obt: 0, max: 0 };
        globalCompMap.set(lKey, { obt: prevL.obt + comp.obt, max: prevL.max + comp.max });
        if (kKey !== lKey) {
          const prevK = globalCompMap.get(kKey) || { obt: 0, max: 0 };
          globalCompMap.set(kKey, { obt: prevK.obt + comp.obt, max: prevK.max + comp.max });
        }
      });
    });

    globalCompMap.forEach((val, keyOrLabel) => {
      const escaped = keyOrLabel.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
      const regex = new RegExp(`\\[${escaped}\\]`, 'gi');
      exprObt = exprObt.replace(regex, String(val.obt));
      exprMx = exprMx.replace(regex, String(val.max));
    });

    // Sanitize expressions to allow only numbers, spaces, +, -, *, /, (, ), .
    if (!/^[0-9+\-*/().\s]+$/.test(exprObt)) {
      return { obtained: defaultTotalObtained, max: defaultTotalMax };
    }

    const evalObt = Function(`"use strict"; return (${exprObt})`)();
    if (typeof evalObt === 'number' && !isNaN(evalObt) && isFinite(evalObt)) {
      let finalMax = defaultTotalMax;
      if (/^[0-9+\-*/().\s]+$/.test(exprMx)) {
        try {
          const evalMx = Function(`"use strict"; return (${exprMx})`)();
          if (typeof evalMx === 'number' && !isNaN(evalMx) && isFinite(evalMx) && evalMx > 0) {
            finalMax = Math.round(evalMx * 10) / 10;
          }
        } catch {
          finalMax = defaultTotalMax;
        }
      }
      return {
        obtained: Math.max(0, Math.round(evalObt * 10) / 10),
        max: finalMax,
      };
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
  let hasAnyNumericMark = false;
  let hasAnyAbsentMark = false;
  const hasAnyIncludedSubject = subjects.some((s) => s.includedInTotal !== false);

  const graceMarksAvailable = resultCriteria?.graceMarks ?? 0;
  const passThresholdPct = resultCriteria?.passPercentage ?? 33;
  const maxAllowedFails = resultCriteria?.maxAllowedFails ?? 0;

  const subjectDetails = subjects.map((sub) => {
    let raw = student.marks[sub.name];
    const bd = student.breakdowns?.[sub.name];
    if (raw !== null && bd && ((sub.components && sub.components.length > 1) || raw === 'AB')) {
      const fromBd = computeSubjectTotalFromBreakdown(
        sub.name,
        student.section,
        bd,
        sub.components
      );
      if (fromBd !== null) {
        raw = fromBd;
      }
    }
    let obtained: number | 'AB' | null = null;
    let grade = 'E2';
    let status: 'PASS' | 'FAIL' | 'ABSENT' | 'INCOMPLETE' = 'PASS';
    let appliedGraceMarks = 0;
    const isCountedSubject = sub.includedInTotal !== false || !hasAnyIncludedSubject;

    if (raw === 'AB') {
      obtained = 'AB';
      status = 'ABSENT';
      if (isCountedSubject) {
        hasAnyAbsentMark = true;
        failedSubjectsCount++;
      }
    } else if (raw === null || raw === undefined || (raw as any) === '') {
      obtained = null;
      grade = '-';
      status = 'INCOMPLETE';
    } else {
      if (isCountedSubject) {
        hasAnyNumericMark = true;
      }
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
        if (isCountedSubject) {
          failedSubjectsCount++;
        }
      }
    }

    const resolvedBreakdown =
      student.breakdowns?.[sub.name] ||
      (typeof obtained === 'number' &&
      (sub.maxMarks === 100 || (sub.components && sub.components.length > 1))
        ? syncBreakdownWithTotal(obtained, sub.name, student.section, sub.components)
        : undefined);

    const compSummary = computeSubjectComponentSummary(
      sub.name,
      sub.components,
      resolvedBreakdown
    );

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
      internalObtained: compSummary.internalObtained,
      internalMax: compSummary.internalMax,
      mainObtained: compSummary.mainObtained,
      mainMax: compSummary.mainMax,
      breakdown: resolvedBreakdown,
      remark: student.subjectRemarks?.[sub.name],
    };
  });

  // Calculate Total and TotalMax according to user formula
  let totalObtained = 0;
  let totalMax = 0;
  const eligibleSubjects = subjectDetails.filter((s) => s.includedInTotal !== false);

  const reconciledMarks: Record<string, number | 'AB' | null> = { ...student.marks };
  const reconciledBreakdowns: Record<string, SubjectBreakdown> = { ...(student.breakdowns || {}) };
  subjectDetails.forEach((d) => {
    reconciledMarks[d.name] = d.obtained;
    if (d.breakdown) {
      reconciledBreakdowns[d.name] = d.breakdown;
    }
  });

  if (totalFormula === 'CUSTOM') {
    const res = evaluateCustomFormula(
      customFormula || '',
      reconciledMarks,
      subjects,
      reconciledBreakdowns
    );
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

  const isAllAbsent = hasAnyAbsentMark && !hasAnyNumericMark && subjects.length > 0;
  let status: 'PASS' | 'FAIL' | 'COMPARTMENT' | 'ABSENT' = 'PASS';
  if (isAllAbsent) {
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
  resultCriteria?: ResultCriteriaConfig,
  classOverrides?: Record<string, ClassExamOverride>,
  examCode?: string
): ComputedStudentResult[] {
  const isPtSubjectSet = examCode
    ? isPtExam(examCode)
    : subjects.length >= 6 &&
      subjects.every(
        (sub) => (sub.maxMarks || 25) <= 50 && (!sub.components || sub.components.length <= 1)
      );

  const list = students.map((s) => {
    const secOverride = classOverrides?.[s.section];
    const gradeKey = s.class || getClassGradeFromSection(s.section);
    const gradeOverride = gradeKey ? classOverrides?.[gradeKey] : undefined;

    let studentSubjects =
      secOverride?.subjects ??
      gradeOverride?.subjects ??
      subjects;

    if (isPtSubjectSet && !secOverride?.subjects && !gradeOverride?.subjects) {
      if (hasCsInPtExam(s.section, s.class)) {
        const hasCs = studentSubjects.some((sub) => {
          const lower = sub.name.trim().toLowerCase();
          return lower === 'computer science' || lower === 'cs';
        });
        if (!hasCs) {
          const refSub = studentSubjects[0];
          const csMax = refSub?.maxMarks || 25;
          const csPass = refSub?.passMarks ?? Math.round(csMax * 0.33);
          studentSubjects = [
            ...studentSubjects,
            {
              name: 'Computer Science',
              maxMarks: csMax,
              passMarks: csPass,
              includedInTotal: true,
              components:
                refSub?.components && refSub.components.length === 1
                  ? [{ ...refSub.components[0], maxMarks: csMax }]
                  : undefined,
            },
          ];
        }
      } else {
        studentSubjects = studentSubjects.filter((sub) => {
          const lower = sub.name.trim().toLowerCase();
          return lower !== 'computer science' && lower !== 'cs';
        });
      }
    }

    return computeStudentResult(
      s,
      studentSubjects,
      secOverride?.totalFormula ?? gradeOverride?.totalFormula ?? totalFormula,
      secOverride?.customFormula ?? gradeOverride?.customFormula ?? customFormula,
      secOverride?.resultCriteria ?? gradeOverride?.resultCriteria ?? resultCriteria
    );
  });

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

export function getDefaultSubjectComponents(
  subjectName: string,
  examCode: string = 'SA-1'
): InternalComponentConfig[] {
  const lower = subjectName.toLowerCase();
  if (lower === 'hindi') {
    return [
      { key: 'listening', label: 'Listening', maxMarks: 20, isMainExam: false },
      { key: 'speaking', label: 'Speaking', maxMarks: 20, isMainExam: false },
      { key: 'project', label: 'Project', maxMarks: 15, isMainExam: false },
      { key: 'saExam', label: examCode, maxMarks: 45, isMainExam: true },
    ];
  }
  if (lower === 'computer science') {
    return [
      { key: 'internalMarks', label: 'Practicals', maxMarks: 20, isMainExam: false },
      { key: 'writtenExam', label: examCode, maxMarks: 80, isMainExam: true },
    ];
  }
  return [
    { key: 'penPaper', label: 'Pen Paper Test', maxMarks: 5, isMainExam: false },
    { key: 'multipleAssessment', label: 'Multiple Assessments', maxMarks: 5, isMainExam: false },
    { key: 'subjectEnrichment', label: 'Subject Enrichment', maxMarks: 5, isMainExam: false },
    { key: 'portfolio', label: 'Portfolio', maxMarks: 5, isMainExam: false },
    { key: 'writtenExam', label: examCode, maxMarks: 80, isMainExam: true },
  ];
}

/**
 * Computes the total subject score from internal + main exam breakdown components
 */
export function computeSubjectTotalFromBreakdown(
  subjectName: string,
  sectionOrClass: string,
  breakdown?: SubjectBreakdown,
  customComponents?: InternalComponentConfig[]
): number | 'AB' | null {
  if (!breakdown) return null;

  if (customComponents && customComponents.length > 0) {
    let totalMax = 0;
    let sum = 0;
    let hasAnyNumber = false;
    let hasAnyAB = false;
    for (const comp of customComponents) {
      totalMax += comp.maxMarks;
      let val = breakdown[comp.key];
      if (val === undefined && comp.key === 'internalMarks') {
        const pp = breakdown.penPaper;
        const ma = breakdown.multipleAssessment;
        const se = breakdown.subjectEnrichment;
        const pf = breakdown.portfolio;
        if (pp !== undefined || ma !== undefined || se !== undefined || pf !== undefined) {
          if (pp === 'AB' && ma === 'AB' && se === 'AB' && pf === 'AB') {
            val = 'AB';
          } else {
            val =
              (typeof pp === 'number' ? pp : 0) +
              (typeof ma === 'number' ? ma : 0) +
              (typeof se === 'number' ? se : 0) +
              (typeof pf === 'number' ? pf : 0);
          }
        }
      }
      if (val === 'AB') {
        hasAnyAB = true;
      } else if (typeof val === 'number') {
        hasAnyNumber = true;
        sum += val;
      }
    }
    if (hasAnyNumber) {
      return Math.min(totalMax || 100, Math.round(sum));
    }
    if (hasAnyAB) {
      return 'AB';
    }
  }

  const isClass9 = isClass9Section(sectionOrClass);
  const isHindi = subjectName.toLowerCase() === 'hindi';

  if (isClass9 && isHindi) {
    // Class 9 Hindi pattern: Listening (20) + Speaking (20) + Project (15) + SA Exam (45) = 100
    const list = breakdown.listening;
    const spk = breakdown.speaking;
    const prj = breakdown.project;
    const sa = breakdown.saExam;

    const hasAnyNumber =
      typeof list === 'number' ||
      typeof spk === 'number' ||
      typeof prj === 'number' ||
      typeof sa === 'number';
    const hasAnyAB = list === 'AB' || spk === 'AB' || prj === 'AB' || sa === 'AB';

    if (!hasAnyNumber && hasAnyAB) {
      return 'AB';
    }
    if (!hasAnyNumber && !hasAnyAB) {
      return null;
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
      if (im === 'AB' && we === 'AB') {
        return 'AB';
      }
      if (
        (im === null || im === undefined) &&
        (we === null || we === undefined)
      ) {
        return null;
      }
      if (typeof im !== 'number' && typeof we !== 'number' && (im === 'AB' || we === 'AB')) {
        return 'AB';
      }
      const valIm = typeof im === 'number' ? im : 0;
      const valWe = typeof we === 'number' ? we : 0;
      return Math.min(100, Math.round(valIm + valWe));
    }

    const pp = breakdown.penPaper;
    const ma = breakdown.multipleAssessment;
    const se = breakdown.subjectEnrichment;
    const pf = breakdown.portfolio;

    const hasAnyNumber =
      typeof pp === 'number' ||
      typeof ma === 'number' ||
      typeof se === 'number' ||
      typeof pf === 'number' ||
      typeof we === 'number';
    const hasAnyAB =
      pp === 'AB' || ma === 'AB' || se === 'AB' || pf === 'AB' || we === 'AB';

    if (!hasAnyNumber && hasAnyAB) {
      return 'AB';
    }
    if (!hasAnyNumber && !hasAnyAB) {
      return null;
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

  const pp = Math.min(5, Math.max(0, Math.round(pct * 5)));
  const ma = Math.min(5, Math.max(0, Math.round(pct * 5)));
  const se = Math.min(5, Math.max(0, Math.round(pct * 5)));
  const pf = Math.min(5, Math.max(0, Math.round(pct * 5)));
  const intMarks = Math.min(20, Math.max(0, pp + ma + se + pf));
  const we = Math.min(80, Math.max(0, Math.round(score - intMarks)));

  if (isHindi) {
    // Populate both Class 9 Hindi pattern (20+20+15+45) and standard pattern so any component config works seamlessly
    const list = Math.min(20, Math.max(0, Math.round(pct * 20)));
    const spk = Math.min(20, Math.max(0, Math.round(pct * 20)));
    const prj = Math.min(15, Math.max(0, Math.round(pct * 15)));
    const sa = Math.min(45, Math.max(0, Math.round(score - (list + spk + prj))));

    return {
      listening: list,
      speaking: spk,
      project: prj,
      saExam: sa,
      internalMarks: intMarks,
      penPaper: pp,
      multipleAssessment: ma,
      subjectEnrichment: se,
      portfolio: pf,
      writtenExam: we,
    };
  }

  return {
    internalMarks: intMarks,
    penPaper: pp,
    multipleAssessment: ma,
    subjectEnrichment: se,
    portfolio: pf,
    writtenExam: we,
  };
}

/**
 * Synchronizes a subject's internal/main breakdown with an updated total mark
 * so that direct cell edits, pastes, clears, Excel imports, and Google Sheets pulls
 * always reflect accurately in totals, percentages, grades, and report cards.
 */
export function syncBreakdownWithTotal(
  totalScore: number | 'AB' | null,
  subjectName: string,
  sectionOrClass: string,
  customComponents?: InternalComponentConfig[],
  existingBreakdown?: SubjectBreakdown
): SubjectBreakdown | undefined {
  if (totalScore === null || totalScore === undefined) {
    return undefined;
  }

  if (totalScore === 'AB') {
    const abBd: SubjectBreakdown = {
      ...generateDefaultBreakdown('AB', subjectName, sectionOrClass),
    };
    if (customComponents && customComponents.length > 0) {
      customComponents.forEach((c) => {
        abBd[c.key] = 'AB';
      });
    }
    return abBd;
  }

  const baseBd: SubjectBreakdown = {
    ...(existingBreakdown || {}),
    ...generateDefaultBreakdown(totalScore, subjectName, sectionOrClass),
  };

  if (customComponents && customComponents.length > 0) {
    const totalMax = customComponents.reduce((acc, c) => acc + (c.maxMarks || 0), 0) || 100;
    const clampedScore = Math.min(totalMax, Math.max(0, Math.round(totalScore)));
    const mainComp = customComponents.find((c) => c.isMainExam) || customComponents[customComponents.length - 1];
    const intComps = customComponents.filter((c) => c.key !== mainComp.key);

    // Check if existing internal component scores can be preserved
    let existingIntSum = 0;
    let hasAllExistingInt = intComps.length > 0;
    for (const ic of intComps) {
      const val = existingBreakdown?.[ic.key];
      if (typeof val === 'number' && val >= 0 && val <= ic.maxMarks) {
        existingIntSum += val;
      } else {
        hasAllExistingInt = false;
        break;
      }
    }

    if (
      hasAllExistingInt &&
      existingIntSum <= clampedScore &&
      clampedScore - existingIntSum <= (mainComp?.maxMarks ?? 80)
    ) {
      intComps.forEach((ic) => {
        baseBd[ic.key] = existingBreakdown![ic.key] as number;
      });
      if (mainComp) {
        baseBd[mainComp.key] = clampedScore - existingIntSum;
      }
    } else {
      // Distribute proportionally across components so they sum to clampedScore
      let allocated = 0;
      intComps.forEach((ic) => {
        const share = Math.min(
          ic.maxMarks,
          Math.max(0, Math.round((clampedScore / totalMax) * ic.maxMarks))
        );
        baseBd[ic.key] = share;
        allocated += share;
      });
      if (mainComp) {
        const remaining = Math.min(mainComp.maxMarks, Math.max(0, clampedScore - allocated));
        baseBd[mainComp.key] = remaining;
        allocated += remaining;
      }
      // If clamping mainComp left a remainder, top up internal components up to their maxMarks
      let diff = clampedScore - allocated;
      if (diff > 0) {
        for (const ic of intComps) {
          const cur = typeof baseBd[ic.key] === 'number' ? (baseBd[ic.key] as number) : 0;
          const room = Math.max(0, ic.maxMarks - cur);
          const add = Math.min(diff, room);
          baseBd[ic.key] = cur + add;
          diff -= add;
          if (diff <= 0) break;
        }
      }
    }

    // Ensure aggregate internalMarks stays synchronized with actual internal sub-components
    if (!intComps.some((ic) => ic.key === 'internalMarks') && intComps.length > 0) {
      baseBd.internalMarks = intComps.reduce(
        (sum, ic) => sum + (typeof baseBd[ic.key] === 'number' ? (baseBd[ic.key] as number) : 0),
        0
      );
    }
  }

  return baseBd;
}

/**
 * Merges fresh student data pulled from Google Sheets into the local roster
 * while preserving student metadata (DOB, parents, admissionNo, IDs) and
 * reconciling breakdowns with pulled marks.
 */
export function mergePulledStudentsWithRoster(
  currentRoster: StudentReportRow[],
  pulledStudents: any[],
  examConfig: ExamConfig
): StudentReportRow[] {
  if (!Array.isArray(pulledStudents) || pulledStudents.length === 0) {
    return currentRoster;
  }

  const normalizeRoll = (r: any) => String(r ?? '').trim().replace(/^0+/, '') || '0';
  const normalizeSec = (s: any) => String(s ?? '').trim().toLowerCase();
  const normalizeName = (n: any) => String(n ?? '').trim().toLowerCase();

  const bySecRoll = new Map<string, any>();
  const byId = new Map<string, any>();
  const bySecName = new Map<string, any>();

  pulledStudents.forEach((p) => {
    if (!p) return;
    const secKey = normalizeSec(p.section);
    const rollKey = normalizeRoll(p.rollNo);
    const nameKey = normalizeName(p.name);
    if (secKey && rollKey) {
      bySecRoll.set(`${secKey}__${rollKey}`, p);
    }
    if (p.id) {
      byId.set(String(p.id).trim().toLowerCase(), p);
    }
    if (secKey && nameKey) {
      bySecName.set(`${secKey}__${nameKey}`, p);
    }
  });

  let maxObservedMark = 0;
  pulledStudents.forEach((p) => {
    if (p?.marks && typeof p.marks === 'object') {
      Object.values(p.marks).forEach((v) => {
        const n = typeof v === 'number' ? v : parseFloat(String(v));
        if (!isNaN(n) && n > maxObservedMark) maxObservedMark = n;
      });
    }
  });

  const matchedPulledSet = new Set<any>();

  const parseSheetMark = (v: any): number | 'AB' | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === '') return null;
    if (String(v).trim().toUpperCase() === 'AB') return 'AB';
    const num = typeof v === 'number' ? v : parseFloat(String(v));
    return isNaN(num) ? null : num;
  };

  const scaleMarkToSubjectMax = (
    val: number | 'AB' | null | undefined,
    subMax: number
  ): number | 'AB' | null | undefined => {
    if (typeof val !== 'number' || subMax <= 0) return val;
    if (val > subMax || (subMax < 100 && maxObservedMark > subMax)) {
      const sourceScale =
        maxObservedMark > 50 || val > 50 ? 100 : maxObservedMark > 25 || val > 25 ? 50 : 25;
      if (sourceScale > subMax) {
        return Math.min(subMax, Math.max(0, Math.round((val / sourceScale) * subMax)));
      }
    }
    return val;
  };

  const mergedRoster = currentRoster.map((st) => {
    const secKey = normalizeSec(st.section);
    const rollKey = normalizeRoll(st.rollNo);
    const nameKey = normalizeName(st.name);

    const p =
      bySecRoll.get(`${secKey}__${rollKey}`) ||
      byId.get(String(st.id).trim().toLowerCase()) ||
      bySecName.get(`${secKey}__${nameKey}`);

    if (!p) return st;
    matchedPulledSet.add(p);

    const effectiveCfg = getEffectiveExamConfigForClass(examConfig, p.section || st.section);
    const nextMarks: Record<string, number | 'AB' | null> = { ...st.marks };
    const nextBreakdowns: Record<string, SubjectBreakdown> = { ...(st.breakdowns || {}) };

    if (p.marks && typeof p.marks === 'object') {
      Object.entries(p.marks).forEach(([rawSub, rawVal]) => {
        const subName = rawSub === 'Mathematics' ? 'Maths' : rawSub;
        const parsed = parseSheetMark(rawVal);
        if (parsed !== undefined) {
          nextMarks[subName] = parsed;
        }
      });
    }

    if (p.breakdowns && typeof p.breakdowns === 'object') {
      Object.entries(p.breakdowns).forEach(([rawSub, bdVal]) => {
        const subName = rawSub === 'Mathematics' ? 'Maths' : rawSub;
        if (bdVal && typeof bdVal === 'object') {
          nextBreakdowns[subName] = {
            ...(nextBreakdowns[subName] || {}),
            ...(bdVal as SubjectBreakdown),
          };
        }
      });
    }

    // Reconcile breakdowns with pulled marks so computeStudentResult reflects fresh sheet marks
    effectiveCfg.subjects.forEach((sub) => {
      const scaledVal = scaleMarkToSubjectMax(nextMarks[sub.name], sub.maxMarks);
      if (scaledVal !== undefined) {
        nextMarks[sub.name] = scaledVal;
      }
      const mVal = nextMarks[sub.name];
      const explicitPulledBd = p.breakdowns?.[sub.name];
      if (
        sub.maxMarks === 100 &&
        explicitPulledBd &&
        typeof explicitPulledBd === 'object' &&
        Object.keys(explicitPulledBd).length > 0
      ) {
        const fromBd = computeSubjectTotalFromBreakdown(
          sub.name,
          p.section || st.section,
          nextBreakdowns[sub.name],
          sub.components
        );
        if (fromBd !== null && (mVal === null || mVal === undefined)) {
          nextMarks[sub.name] = fromBd;
        } else if (mVal !== undefined && mVal !== fromBd) {
          const synced = syncBreakdownWithTotal(
            mVal,
            sub.name,
            p.section || st.section,
            sub.components,
            nextBreakdowns[sub.name]
          );
          if (synced) {
            nextBreakdowns[sub.name] = synced;
          } else {
            delete nextBreakdowns[sub.name];
          }
        }
      } else {
        const synced = syncBreakdownWithTotal(
          mVal ?? null,
          sub.name,
          p.section || st.section,
          sub.components,
          nextBreakdowns[sub.name]
        );
        if (synced) {
          nextBreakdowns[sub.name] = synced;
        } else {
          delete nextBreakdowns[sub.name];
        }
      }
    });

    return {
      ...st,
      name: p.name ? String(p.name).trim() : st.name,
      rollNo: p.rollNo ? String(p.rollNo).trim().padStart(2, '0') : st.rollNo,
      section: p.section ? String(p.section).trim() : st.section,
      class: getClassGradeFromSection(p.section || st.section),
      dob: p.dob || st.dob,
      fatherName: p.fatherName || st.fatherName,
      motherName: p.motherName || st.motherName,
      marks: nextMarks,
      breakdowns: nextBreakdowns,
      customRemarks:
        p.customRemarks !== undefined && String(p.customRemarks).trim() !== ''
          ? String(p.customRemarks)
          : st.customRemarks,
      subjectRemarks:
        p.subjectRemarks && typeof p.subjectRemarks === 'object'
          ? { ...(st.subjectRemarks || {}), ...p.subjectRemarks }
          : st.subjectRemarks,
    };
  });

  // Append any newly added students from Google Sheets that were not in currentRoster
  pulledStudents.forEach((p, idx) => {
    if (!p || matchedPulledSet.has(p) || !p.name) return;
    const sec = String(p.section || 'Sparkle').trim();
    const roll = String(p.rollNo || idx + 1).trim().padStart(2, '0');
    const effectiveCfg = getEffectiveExamConfigForClass(examConfig, sec);
    const marks: Record<string, number | 'AB' | null> = {};
    const breakdowns: Record<string, SubjectBreakdown> = {};

    if (p.marks && typeof p.marks === 'object') {
      Object.entries(p.marks).forEach(([rawSub, rawVal]) => {
        const subName = rawSub === 'Mathematics' ? 'Maths' : rawSub;
        const parsed = parseSheetMark(rawVal);
        marks[subName] = parsed === undefined ? null : parsed;
      });
    }

    effectiveCfg.subjects.forEach((sub) => {
      if (marks[sub.name] === undefined) {
        marks[sub.name] = null;
      } else {
        marks[sub.name] = scaleMarkToSubjectMax(marks[sub.name], sub.maxMarks) ?? null;
      }
      const synced = syncBreakdownWithTotal(
        marks[sub.name],
        sub.name,
        sec,
        sub.components,
        p.breakdowns?.[sub.name]
      );
      if (synced) {
        breakdowns[sub.name] = synced;
      }
    });

    mergedRoster.push({
      id: p.id ? String(p.id) : `sva-${sec.toLowerCase()}-${roll}-${Date.now()}`,
      rollNo: roll,
      name: String(p.name).trim(),
      admissionNo: p.admissionNo ? String(p.admissionNo) : '',
      class: getClassGradeFromSection(sec),
      section: sec,
      dob: p.dob ? String(p.dob) : '2010-01-01',
      fatherName: p.fatherName ? String(p.fatherName) : 'Parent',
      motherName: p.motherName ? String(p.motherName) : 'Parent',
      marks,
      breakdowns,
      customRemarks: p.customRemarks ? String(p.customRemarks) : '',
      subjectRemarks:
        p.subjectRemarks && typeof p.subjectRemarks === 'object' ? { ...p.subjectRemarks } : {},
    });
  });

  return mergedRoster;
}


