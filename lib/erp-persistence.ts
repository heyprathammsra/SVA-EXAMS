import {
  ClassDefinition,
  DEFAULT_SVA_CLASSES,
  ExamConfig,
  InternalComponentConfig,
  StudentReportRow,
  SubjectBreakdown,
  SubjectConfig,
  generateDefaultBreakdown,
  getClassGradeFromSection,
  getEffectiveExamConfigForClass,
  hasCsInPtExam,
  isPtExam,
  PT_EXAM_SUBJECT_NAMES,
  syncBreakdownWithTotal,
} from './report-card-types';
import { getDefaultSubjectRemark } from './remarks-utils';

export const SVA_STORAGE_KEYS = {
  INIT_FLAG: 'sva_initialized_v1',
  CLASSES: 'sva_classes_v1',
  STUDENTS: 'sva_students_roster_v1',
  EXAM_MARKS_STORE: 'sva_exam_marks_store_v1',
  EXAM_BREAKDOWNS_STORE: 'sva_exam_breakdowns_store_v1',
  EXAM_CONFIGS: 'sva_exam_configs_v1',
  SELECTED_EXAM: 'sva_selected_exam_v1',
  SELECTED_CLASS: 'sva_selected_class_v1',
  UPDATED_AT: 'sva_state_updated_at_v1',
} as const;

export type ExamMarksStore = Record<
  string,
  Record<string, Record<string, number | 'AB' | null>>
>;

export type ExamBreakdownsStore = Record<
  string,
  Record<string, Record<string, SubjectBreakdown>>
>;

export interface PersistedErpState {
  version: 1;
  initialized: boolean;
  updatedAt: number;
  selectedClass: string;
  selectedExam: string;
  classes: ClassDefinition[];
  examConfigs: Record<string, ExamConfig>;
  students: StudentReportRow[];
  examMarksStore: ExamMarksStore;
  examBreakdownsStore: ExamBreakdownsStore;
}

export function getDefaultClasses(): ClassDefinition[] {
  return DEFAULT_SVA_CLASSES.map((c) => ({ ...c }));
}

export function sanitizePtExamConfigs(
  configs: Record<string, ExamConfig>
): Record<string, ExamConfig> {
  const defaultPtSubjects: SubjectConfig[] = PT_EXAM_SUBJECT_NAMES.map((name) => ({
    name,
    maxMarks: 25,
    passMarks: 8,
  }));

  const cleaned: Record<string, ExamConfig> = {};
  Object.entries(configs).forEach(([key, cfg]) => {
    if (!cfg || typeof cfg !== 'object') return;
    if (isPtExam(cfg.code || key)) {
      const filteredSubjects = (cfg.subjects || [])
        .filter((s) => {
          const lower = s.name.trim().toLowerCase();
          return lower !== 'computer science' && lower !== 'cs';
        })
        .map((s) => {
          const max = s.maxMarks || 25;
          const pass = s.passMarks ?? Math.round(max * 0.33);
          return {
            ...s,
            maxMarks: max,
            passMarks: pass,
          };
        });
      const baseMax = filteredSubjects[0]?.maxMarks || 25;
      let nextOverrides = cfg.classOverrides ? { ...cfg.classOverrides } : undefined;
      if (nextOverrides) {
        ['Class 9', 'Ruby', 'Diamond'].forEach((clsKey) => {
          const ov = nextOverrides?.[clsKey];
          if (ov?.subjects && ov.subjects.every((s) => s.maxMarks === 25) && baseMax !== 25) {
            delete nextOverrides![clsKey];
          } else if (
            ov &&
            Object.keys(ov).length === 1 &&
            ov.subjects &&
            ov.subjects.length === 7 &&
            ov.subjects.every((s) => s.maxMarks === baseMax)
          ) {
            delete nextOverrides![clsKey];
          }
        });
        if (Object.keys(nextOverrides).length === 0) {
          nextOverrides = undefined;
        }
      }
      cleaned[key] = {
        ...cfg,
        subjects:
          filteredSubjects.length > 0
            ? filteredSubjects
            : defaultPtSubjects.map((s) => ({ ...s })),
        classOverrides: nextOverrides,
      };
    } else {
      cleaned[key] = cfg;
    }
  });
  return cleaned;
}

export function cloneExamConfigs(
  configs: Record<string, ExamConfig>
): Record<string, ExamConfig> {
  const cloned: Record<string, ExamConfig> = {};
  Object.entries(configs).forEach(([k, cfg]) => {
    cloned[k] = {
      ...cfg,
      subjects: (cfg.subjects || []).map((s) => ({
        ...s,
        components: s.components ? s.components.map((c) => ({ ...c })) : undefined,
      })),
      resultCriteria: cfg.resultCriteria ? { ...cfg.resultCriteria } : undefined,
      classOverrides: cfg.classOverrides
        ? Object.fromEntries(
            Object.entries(cfg.classOverrides).map(([cls, ov]) => [
              cls,
              {
                ...ov,
                subjects: ov.subjects
                  ? ov.subjects.map((s) => ({
                      ...s,
                      components: s.components
                        ? s.components.map((c) => ({ ...c }))
                        : undefined,
                    }))
                  : undefined,
                resultCriteria: ov.resultCriteria ? { ...ov.resultCriteria } : undefined,
              },
            ])
          )
        : undefined,
    };
  });
  return cloned;
}

export function createDefaultErpState(
  initialConfigs: Record<string, ExamConfig>,
  allStudents: StudentReportRow[],
  getClassNumberForSection: (sec: string) => string
): PersistedErpState {
  const examConfigs = cloneExamConfigs(initialConfigs);

  const students: StudentReportRow[] = allStudents.map((st) => {
    const normalizedMarks: Record<string, number | 'AB' | null> = {};
    const breakdowns: Record<string, SubjectBreakdown> = {};
    const subjectRemarks: Record<string, string> = { ...(st.subjectRemarks || {}) };

    Object.entries(st.marks || {}).forEach(([sub, val]) => {
      const normSub = sub === 'Mathematics' ? 'Maths' : sub;
      const total = typeof val === 'number' ? Math.round(val) : val;
      normalizedMarks[normSub] = total;
      breakdowns[normSub] =
        st.breakdowns?.[normSub] ||
        generateDefaultBreakdown(total, normSub, st.section);
      if (!subjectRemarks[normSub]) {
        subjectRemarks[normSub] = getDefaultSubjectRemark(total, 100);
      }
    });

    const isAayushSample =
      st.id === 'STU-2026-0031' ||
      st.name.trim().toLowerCase() === 'aayush satish nalawade';

    if (isAayushSample) {
      subjectRemarks['English'] = 'Outstanding! Strong command of language.';
      subjectRemarks['Hindi'] = 'Excellent performance keep it up.';
      subjectRemarks['Marathi'] = 'Excellent Performance';
      subjectRemarks['Maths'] = 'Outstanding! Strong conceptual understanding.';
      subjectRemarks['Science'] = 'Outstanding! Strong conceptual understanding.';
      subjectRemarks['Social Science'] = 'Good.Keep it up!';
    }

    return {
      ...st,
      class: getClassNumberForSection(st.section),
      marks: normalizedMarks,
      breakdowns,
      subjectRemarks,
      customRemarks: isAayushSample
        ? 'Excellent and consistent performance with strong understanding and commendable effort.'
        : st.customRemarks,
    };
  });

  const examMarksStore: ExamMarksStore = {};
  const examIds = Object.keys(examConfigs);
  examIds.forEach((ex) => {
    examMarksStore[ex] = {};
    const isPt = isPtExam(ex);
    const cfgForEx = examConfigs[ex];

    allStudents.forEach((st) => {
      const effCfg = cfgForEx
        ? getEffectiveExamConfigForClass(cfgForEx, st.section)
        : undefined;
      const defaultMax = effCfg?.subjects[0]?.maxMarks || (isPt ? 25 : 100);
      const isAayushSample =
        st.id === 'STU-2026-0031' ||
        st.name.trim().toLowerCase() === 'aayush satish nalawade';

      if (ex === 'PT-1' && isAayushSample && defaultMax === 25) {
        examMarksStore[ex][st.id] = {
          English: 25,
          Hindi: 25,
          Marathi: 24,
          Maths: 22,
          Science: 25,
          'Social Science': 24,
        };
        return;
      }

      const scaled: Record<string, number | 'AB' | null> = {};
      Object.entries(st.marks || {}).forEach(([sub, val]) => {
        const normSub = sub === 'Mathematics' ? 'Maths' : sub;
        if (
          isPt &&
          !hasCsInPtExam(st.section) &&
          (normSub.toLowerCase() === 'computer science' ||
            normSub.toLowerCase() === 'cs')
        ) {
          return;
        }
        const subMax =
          effCfg?.subjects.find((s) => s.name.toLowerCase() === normSub.toLowerCase())
            ?.maxMarks || defaultMax;
        scaled[normSub] =
          typeof val === 'number'
            ? Math.min(subMax, Math.max(0, Math.round((val / 100) * subMax)))
            : val;
      });
      examMarksStore[ex][st.id] = scaled;
    });
  });

  const examBreakdownsStore: ExamBreakdownsStore = {};
  examIds.forEach((ex) => {
    examBreakdownsStore[ex] = {};
    if (ex === 'SA-1' || ex === 'SA-2') {
      allStudents.forEach((st) => {
        const bds: Record<string, SubjectBreakdown> = {};
        Object.entries(st.marks || {}).forEach(([sub, val]) => {
          const normSub = sub === 'Mathematics' ? 'Maths' : sub;
          const total = typeof val === 'number' ? Math.round(val) : val;
          bds[normSub] =
            st.breakdowns?.[normSub] ||
            generateDefaultBreakdown(total, normSub, st.section);
        });
        examBreakdownsStore[ex][st.id] = bds;
      });
    }
  });

  return {
    version: 1,
    initialized: false,
    updatedAt: 0,
    selectedClass: 'Diamond',
    selectedExam: 'SA-1',
    classes: getDefaultClasses(),
    examConfigs,
    students,
    examMarksStore,
    examBreakdownsStore,
  };
}

export function parseStoredErpState(
  rawStorage: Record<string, string | null | undefined>,
  defaultState: PersistedErpState,
  validClasses: readonly string[]
): { state: PersistedErpState | null; hasSavedData: boolean } {
  const initFlag = rawStorage[SVA_STORAGE_KEYS.INIT_FLAG];
  const rawClasses = rawStorage[SVA_STORAGE_KEYS.CLASSES];
  const rawConfigs = rawStorage[SVA_STORAGE_KEYS.EXAM_CONFIGS];
  const rawStudents = rawStorage[SVA_STORAGE_KEYS.STUDENTS];
  const rawMarksStore = rawStorage[SVA_STORAGE_KEYS.EXAM_MARKS_STORE];
  const rawBreakdownsStore = rawStorage[SVA_STORAGE_KEYS.EXAM_BREAKDOWNS_STORE];
  const rawSelectedExam = rawStorage[SVA_STORAGE_KEYS.SELECTED_EXAM];
  const rawSelectedClass = rawStorage[SVA_STORAGE_KEYS.SELECTED_CLASS];
  const rawUpdatedAt = rawStorage[SVA_STORAGE_KEYS.UPDATED_AT];

  const hasSavedData = Boolean(
    initFlag === '1' ||
      rawClasses ||
      rawConfigs ||
      rawStudents ||
      rawMarksStore ||
      rawBreakdownsStore ||
      rawSelectedExam ||
      rawSelectedClass
  );

  if (!hasSavedData) {
    return { state: null, hasSavedData: false };
  }

  let classes: ClassDefinition[] = defaultState.classes || getDefaultClasses();
  if (rawClasses) {
    try {
      const parsed = JSON.parse(rawClasses);
      if (Array.isArray(parsed)) {
        const sanitized = parsed
          .filter(
            (c): c is ClassDefinition =>
              Boolean(c && typeof c === 'object' && typeof c.section === 'string' && c.section.trim())
          )
          .map((c) => ({
            id: typeof c.id === 'string' && c.id.trim() ? c.id.trim() : c.section.trim(),
            section: c.section.trim(),
            grade: typeof c.grade === 'string' && c.grade.trim() ? c.grade.trim() : getClassGradeFromSection(c.section),
          }));
        if (sanitized.length > 0) {
          classes = sanitized;
        }
      }
    } catch {}
  }

  let examConfigs = defaultState.examConfigs;
  if (rawConfigs) {
    try {
      const parsed = JSON.parse(rawConfigs);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        // Respect user deletions of default exams — never re-merge INITIAL_EXAM_CONFIGS
        examConfigs = sanitizePtExamConfigs(parsed);
      }
    } catch {}
  }

  let students = defaultState.students;
  if (rawStudents) {
    try {
      const parsed = JSON.parse(rawStudents);
      // Respect an explicitly saved empty array [] too
      if (Array.isArray(parsed)) {
        students = parsed;
      }
    } catch {}
  }

  let examMarksStore = defaultState.examMarksStore;
  if (rawMarksStore) {
    try {
      const parsed = JSON.parse(rawMarksStore);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        examMarksStore = parsed;
      }
    } catch {}
  }

  let examBreakdownsStore = defaultState.examBreakdownsStore;
  if (rawBreakdownsStore) {
    try {
      const parsed = JSON.parse(rawBreakdownsStore);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        examBreakdownsStore = parsed;
      }
    } catch {}
  }

  const availableExamIds = Object.keys(examConfigs);
  let selectedExam = defaultState.selectedExam;
  if (rawSelectedExam && rawSelectedExam.trim()) {
    const trimmed = rawSelectedExam.trim();
    if (availableExamIds.length === 0 || availableExamIds.includes(trimmed)) {
      selectedExam = trimmed;
    } else {
      selectedExam = availableExamIds[0];
    }
  } else if (availableExamIds.length > 0 && !availableExamIds.includes(selectedExam)) {
    selectedExam = availableExamIds[0];
  }

  const knownSections = new Set<string>([
    ...validClasses,
    ...classes.map((c) => c.section),
    ...students.map((s) => s.section),
  ]);
  let selectedClass = defaultState.selectedClass;
  if (rawSelectedClass && rawSelectedClass.trim()) {
    const trimmedCls = rawSelectedClass.trim();
    if (trimmedCls === 'all' || knownSections.has(trimmedCls)) {
      selectedClass = trimmedCls;
    } else if (classes.length > 0) {
      selectedClass = classes[0].section;
    }
  } else if (selectedClass !== 'all' && classes.length > 0 && !knownSections.has(selectedClass)) {
    selectedClass = classes[0].section;
  }

  const updatedAtNum = rawUpdatedAt ? Number(rawUpdatedAt) : 1;
  const updatedAt = Number.isFinite(updatedAtNum) && updatedAtNum > 0 ? updatedAtNum : 1;

  return {
    hasSavedData: true,
    state: {
      version: 1,
      initialized: true,
      updatedAt,
      selectedClass,
      selectedExam,
      classes,
      examConfigs,
      students,
      examMarksStore,
      examBreakdownsStore,
    },
  };
}

export function pickAuthoritativeState(
  localState: PersistedErpState | null,
  remoteState: PersistedErpState | null
): PersistedErpState | null {
  const localValid = Boolean(localState && localState.initialized);
  const remoteValid = Boolean(remoteState && remoteState.initialized);

  if (localValid && remoteValid && localState && remoteState) {
    return remoteState.updatedAt > localState.updatedAt ? remoteState : localState;
  }
  if (localValid && localState) return localState;
  if (remoteValid && remoteState) return remoteState;
  return null;
}

export function switchExamState(params: {
  students: StudentReportRow[];
  currentExam: string;
  targetExam: string;
  examConfigs: Record<string, ExamConfig>;
  initialConfigs: Record<string, ExamConfig>;
  examMarksStore: ExamMarksStore;
  examBreakdownsStore: ExamBreakdownsStore;
  overrideTargetConfig?: ExamConfig;
}): {
  nextRoster: StudentReportRow[];
  nextMarksStore: ExamMarksStore;
  nextBreakdownsStore: ExamBreakdownsStore;
} {
  const {
    students,
    currentExam,
    targetExam,
    examConfigs,
    initialConfigs,
    examMarksStore,
    examBreakdownsStore,
    overrideTargetConfig,
  } = params;

  // 1. Save current exam's marks & breakdowns into stores
  const currentMarksSnapshot: Record<string, Record<string, number | 'AB' | null>> = {};
  const currentBdsSnapshot: Record<string, Record<string, SubjectBreakdown>> = {};
  students.forEach((s) => {
    currentMarksSnapshot[s.id] = { ...s.marks };
    if (s.breakdowns) {
      currentBdsSnapshot[s.id] = { ...s.breakdowns };
    }
  });

  const updatedMarksStore: ExamMarksStore = {
    ...examMarksStore,
    [currentExam]: currentMarksSnapshot,
  };
  const updatedBreakdownsStore: ExamBreakdownsStore = {
    ...examBreakdownsStore,
    [currentExam]: currentBdsSnapshot,
  };

  if (targetExam === currentExam) {
    return {
      nextRoster: students,
      nextMarksStore: updatedMarksStore,
      nextBreakdownsStore: updatedBreakdownsStore,
    };
  }

  // 2. Load target exam marks & breakdowns WITHOUT leaking marks from currentExam
  const targetMarks = updatedMarksStore[targetExam] || {};
  const targetBds = updatedBreakdownsStore[targetExam] || {};
  const targetCfg =
    overrideTargetConfig ||
    examConfigs[targetExam] ||
    initialConfigs[targetExam] || {
      id: targetExam,
      name: targetExam,
      code: targetExam,
      totalFormula: 'SUM',
      subjects: [],
    };

  const nextMarksForTarget: Record<string, Record<string, number | 'AB' | null>> = {};
  const nextBdsForTarget: Record<string, Record<string, SubjectBreakdown>> = {};

  const nextRoster = students.map((s) => {
    const existingMarks = targetMarks[s.id];
    const m: Record<string, number | 'AB' | null> = existingMarks
      ? { ...existingMarks }
      : {};
    const bds: Record<string, SubjectBreakdown> = targetBds[s.id]
      ? { ...targetBds[s.id] }
      : {};

    const effCfg = getEffectiveExamConfigForClass(targetCfg, s.section);
    effCfg.subjects.forEach((sub) => {
      if (!(sub.name in m)) {
        m[sub.name] = null;
      }
      const curVal = m[sub.name];
      if (typeof curVal === 'number' && sub.maxMarks > 0 && curVal > sub.maxMarks) {
        m[sub.name] = sub.maxMarks;
      }

      if (!bds[sub.name] && sub.components && sub.components.length > 1) {
        const synced = syncBreakdownWithTotal(
          m[sub.name] ?? null,
          sub.name,
          s.section,
          sub.components
        );
        if (synced) {
          bds[sub.name] = synced;
        }
      }
    });

    nextMarksForTarget[s.id] = { ...m };
    if (Object.keys(bds).length > 0) {
      nextBdsForTarget[s.id] = { ...bds };
    }

    return {
      ...s,
      marks: m,
      breakdowns: bds,
    };
  });

  return {
    nextRoster,
    nextMarksStore: {
      ...updatedMarksStore,
      [targetExam]: nextMarksForTarget,
    },
    nextBreakdownsStore: {
      ...updatedBreakdownsStore,
      [targetExam]: nextBdsForTarget,
    },
  };
}

export function parseSpreadsheetMarkInput(
  value: string,
  maxMark: number,
  previousValue?: number | 'AB' | null
): { valid: boolean; value: number | 'AB' | null } {
  const trimmed = (value || '').trim();
  if (trimmed === '') {
    return { valid: true, value: null };
  }
  const upper = trimmed.toUpperCase();
  if (upper === 'A' || upper === 'AB') {
    return { valid: true, value: 'AB' };
  }
  // Handle user typing 'A' (auto-expanded to 'AB') then immediately typing 'B' -> 'ABB'
  if (upper === 'ABB' && previousValue === 'AB') {
    return { valid: true, value: 'AB' };
  }
  const parsed = Number(trimmed);
  if (Number.isFinite(parsed)) {
    const clamped = Math.min(maxMark, Math.max(0, parsed));
    return { valid: true, value: clamped };
  }
  return { valid: false, value: previousValue ?? null };
}

export function scaleComponentsToMaxMarks(
  components: InternalComponentConfig[] | undefined,
  newMaxMarks: number
): InternalComponentConfig[] | undefined {
  if (!components || components.length === 0) return components;
  if (components.length === 1) {
    return [{ ...components[0], maxMarks: newMaxMarks }];
  }
  const oldTotal = components.reduce((sum, c) => sum + (c.maxMarks || 0), 0);
  if (oldTotal <= 0 || newMaxMarks <= 0) return components;
  if (oldTotal === newMaxMarks) return components.map((c) => ({ ...c }));

  const scaled = components.map((c) => ({
    ...c,
    maxMarks: Math.max(1, Math.round(((c.maxMarks || 0) / oldTotal) * newMaxMarks)),
  }));
  const sumScaled = scaled.reduce((sum, c) => sum + c.maxMarks, 0);
  const diff = newMaxMarks - sumScaled;
  if (diff !== 0) {
    const mainIdx = scaled.findIndex((c) => c.isMainExam);
    const adjustIdx = mainIdx >= 0 ? mainIdx : scaled.length - 1;
    scaled[adjustIdx] = {
      ...scaled[adjustIdx],
      maxMarks: Math.max(1, scaled[adjustIdx].maxMarks + diff),
    };
  }
  return scaled;
}

export function migrateRenamedSubjectInStudents(params: {
  students: StudentReportRow[];
  examMarksStore: ExamMarksStore;
  examBreakdownsStore: ExamBreakdownsStore;
  examId: string;
  activeExamId: string;
  oldName: string;
  newName: string;
}): {
  students: StudentReportRow[];
  examMarksStore: ExamMarksStore;
  examBreakdownsStore: ExamBreakdownsStore;
} {
  const {
    students,
    examMarksStore,
    examBreakdownsStore,
    examId,
    activeExamId,
    oldName,
    newName,
  } = params;

  const trimmedOld = oldName.trim();
  const trimmedNew = newName.trim();
  if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) {
    return { students, examMarksStore, examBreakdownsStore };
  }

  const renameRecordKey = <T>(rec: Record<string, T> | undefined): Record<string, T> | undefined => {
    if (!rec) return rec;
    if (!(trimmedOld in rec)) return rec;
    const next = { ...rec };
    if (!(trimmedNew in next) || next[trimmedNew] === undefined || next[trimmedNew] === null) {
      next[trimmedNew] = next[trimmedOld];
    }
    delete next[trimmedOld];
    return next;
  };

  const nextStudents =
    examId === activeExamId
      ? students.map((st) => ({
          ...st,
          marks: renameRecordKey(st.marks) || st.marks,
          breakdowns: renameRecordKey(st.breakdowns),
          subjectRemarks: renameRecordKey(st.subjectRemarks),
        }))
      : students.map((st) => ({
          ...st,
          subjectRemarks: renameRecordKey(st.subjectRemarks),
        }));

  const nextMarksForExam: Record<string, Record<string, number | 'AB' | null>> = {};
  const existingExamMarks = examMarksStore[examId] || {};
  Object.entries(existingExamMarks).forEach(([stuId, m]) => {
    nextMarksForExam[stuId] = renameRecordKey(m) || m;
  });

  const nextBdsForExam: Record<string, Record<string, SubjectBreakdown>> = {};
  const existingExamBds = examBreakdownsStore[examId] || {};
  Object.entries(existingExamBds).forEach(([stuId, bd]) => {
    nextBdsForExam[stuId] = renameRecordKey(bd) || bd;
  });

  return {
    students: nextStudents,
    examMarksStore: {
      ...examMarksStore,
      [examId]: nextMarksForExam,
    },
    examBreakdownsStore: {
      ...examBreakdownsStore,
      [examId]: nextBdsForExam,
    },
  };
}

export function removeStudentFromErpStores(
  examMarksStore: ExamMarksStore,
  examBreakdownsStore: ExamBreakdownsStore,
  studentId: string
): {
  examMarksStore: ExamMarksStore;
  examBreakdownsStore: ExamBreakdownsStore;
} {
  const nextMarksStore: ExamMarksStore = {};
  Object.entries(examMarksStore || {}).forEach(([exId, examMap]) => {
    if (examMap && studentId in examMap) {
      const copied = { ...examMap };
      delete copied[studentId];
      nextMarksStore[exId] = copied;
    } else {
      nextMarksStore[exId] = examMap;
    }
  });

  const nextBreakdownsStore: ExamBreakdownsStore = {};
  Object.entries(examBreakdownsStore || {}).forEach(([exId, bdMap]) => {
    if (bdMap && studentId in bdMap) {
      const copied = { ...bdMap };
      delete copied[studentId];
      nextBreakdownsStore[exId] = copied;
    } else {
      nextBreakdownsStore[exId] = bdMap;
    }
  });

  return {
    examMarksStore: nextMarksStore,
    examBreakdownsStore: nextBreakdownsStore,
  };
}

export function getSectionNames(classes: ClassDefinition[]): string[] {
  return classes.map((c) => c.section);
}

export function getGradeForSection(
  classes: ClassDefinition[],
  sectionOrClass: string
): string {
  const trimmed = (sectionOrClass || '').trim();
  const match = classes.find(
    (c) =>
      c.section.toLowerCase() === trimmed.toLowerCase() ||
      c.id.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) return match.grade;
  return getClassGradeFromSection(trimmed);
}

export function formatClassGradeShortLabel(
  classes: ClassDefinition[],
  clsName: string
): string {
  const trimmed = (clsName || '').trim();
  const match = classes.find(
    (c) =>
      c.section.toLowerCase() === trimmed.toLowerCase() ||
      c.id.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) {
    const gradeNum = match.grade.replace(/^Class\s+/i, '').trim();
    return `${gradeNum} ${match.section}`;
  }
  if (trimmed === 'Sparkle' || trimmed === 'Twinkle') return `6 ${trimmed}`;
  if (trimmed === 'Topaz' || trimmed === 'Jade') return `7 ${trimmed}`;
  if (trimmed === 'Garnet' || trimmed === 'Emerald') return `8 ${trimmed}`;
  if (trimmed === 'Ruby' || trimmed === 'Diamond') return `9 ${trimmed}`;
  if (/^Class\s+/i.test(trimmed)) {
    return trimmed.replace(/^Class\s+/i, '');
  }
  return trimmed;
}

export function addClassDefinition(
  classes: ClassDefinition[],
  grade: string,
  section: string
): { classes: ClassDefinition[]; created?: ClassDefinition; error?: string } {
  const cleanSection = section.trim();
  const cleanGrade = grade.trim() || 'Class 6';
  if (!cleanSection) {
    return { classes, error: 'Please enter a class/section name' };
  }
  if (
    classes.some(
      (c) => c.section.toLowerCase() === cleanSection.toLowerCase()
    )
  ) {
    return {
      classes,
      error: `Class "${cleanSection}" already exists`,
    };
  }
  const id = cleanSection;
  const created: ClassDefinition = {
    id,
    section: cleanSection,
    grade: cleanGrade,
  };
  return {
    classes: [...classes, created],
    created,
  };
}

export function updateClassDefinition(params: {
  classes: ClassDefinition[];
  students: StudentReportRow[];
  examConfigs: Record<string, ExamConfig>;
  selectedClass: string;
  exportClass: string;
  classId: string;
  nextGrade: string;
  nextSection: string;
}): {
  classes: ClassDefinition[];
  students: StudentReportRow[];
  examConfigs: Record<string, ExamConfig>;
  selectedClass: string;
  exportClass: string;
  error?: string;
} {
  const {
    classes,
    students,
    examConfigs,
    selectedClass,
    exportClass,
    classId,
    nextGrade,
    nextSection,
  } = params;

  const target = classes.find((c) => c.id === classId || c.section === classId);
  if (!target) {
    return {
      classes,
      students,
      examConfigs,
      selectedClass,
      exportClass,
      error: 'Class not found',
    };
  }

  const cleanSection = nextSection.trim();
  const cleanGrade = nextGrade.trim() || target.grade;
  if (!cleanSection) {
    return {
      classes,
      students,
      examConfigs,
      selectedClass,
      exportClass,
      error: 'Class/section name cannot be empty',
    };
  }

  const duplicate = classes.find(
    (c) =>
      c.id !== target.id &&
      c.section.toLowerCase() === cleanSection.toLowerCase()
  );
  if (duplicate) {
    return {
      classes,
      students,
      examConfigs,
      selectedClass,
      exportClass,
      error: `Another class named "${cleanSection}" already exists`,
    };
  }

  const oldSection = target.section;
  const nextClasses = classes.map((c) =>
    c.id === target.id
      ? { ...c, section: cleanSection, grade: cleanGrade }
      : c
  );

  const nextStudents = students.map((st) =>
    st.section === oldSection
      ? { ...st, section: cleanSection, class: cleanGrade }
      : st
  );

  let nextExamConfigs = examConfigs;
  if (oldSection !== cleanSection) {
    nextExamConfigs = {};
    Object.entries(examConfigs).forEach(([exId, cfg]) => {
      if (cfg.classOverrides && oldSection in cfg.classOverrides) {
        const nextOverrides = { ...cfg.classOverrides };
        nextOverrides[cleanSection] = nextOverrides[oldSection];
        delete nextOverrides[oldSection];
        nextExamConfigs[exId] = { ...cfg, classOverrides: nextOverrides };
      } else {
        nextExamConfigs[exId] = cfg;
      }
    });
  }

  return {
    classes: nextClasses,
    students: nextStudents,
    examConfigs: nextExamConfigs,
    selectedClass: selectedClass === oldSection ? cleanSection : selectedClass,
    exportClass: exportClass === oldSection ? cleanSection : exportClass,
  };
}

export function deleteClassDefinition(params: {
  classes: ClassDefinition[];
  students: StudentReportRow[];
  examConfigs: Record<string, ExamConfig>;
  examMarksStore: ExamMarksStore;
  examBreakdownsStore: ExamBreakdownsStore;
  selectedClass: string;
  exportClass: string;
  classId: string;
}): {
  classes: ClassDefinition[];
  students: StudentReportRow[];
  examConfigs: Record<string, ExamConfig>;
  examMarksStore: ExamMarksStore;
  examBreakdownsStore: ExamBreakdownsStore;
  selectedClass: string;
  exportClass: string;
  removedStudentsCount: number;
  error?: string;
} {
  const {
    classes,
    students,
    examConfigs,
    examMarksStore,
    examBreakdownsStore,
    selectedClass,
    exportClass,
    classId,
  } = params;

  if (classes.length <= 1) {
    return {
      classes,
      students,
      examConfigs,
      examMarksStore,
      examBreakdownsStore,
      selectedClass,
      exportClass,
      removedStudentsCount: 0,
      error: 'At least one class must remain configured',
    };
  }

  const target = classes.find((c) => c.id === classId || c.section === classId);
  if (!target) {
    return {
      classes,
      students,
      examConfigs,
      examMarksStore,
      examBreakdownsStore,
      selectedClass,
      exportClass,
      removedStudentsCount: 0,
      error: 'Class not found',
    };
  }

  const nextClasses = classes.filter((c) => c.id !== target.id);
  const removedStudentIds = new Set(
    students.filter((s) => s.section === target.section).map((s) => s.id)
  );
  const nextStudents = students.filter((s) => s.section !== target.section);

  let nextMarksStore = examMarksStore;
  let nextBreakdownsStore = examBreakdownsStore;
  if (removedStudentIds.size > 0) {
    removedStudentIds.forEach((stuId) => {
      const cleaned = removeStudentFromErpStores(
        nextMarksStore,
        nextBreakdownsStore,
        stuId
      );
      nextMarksStore = cleaned.examMarksStore;
      nextBreakdownsStore = cleaned.examBreakdownsStore;
    });
  }

  const nextExamConfigs: Record<string, ExamConfig> = {};
  Object.entries(examConfigs).forEach(([exId, cfg]) => {
    if (cfg.classOverrides && target.section in cfg.classOverrides) {
      const nextOverrides = { ...cfg.classOverrides };
      delete nextOverrides[target.section];
      nextExamConfigs[exId] = {
        ...cfg,
        classOverrides:
          Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
      };
    } else {
      nextExamConfigs[exId] = cfg;
    }
  });

  const fallbackClass = nextClasses[0]?.section || 'all';
  return {
    classes: nextClasses,
    students: nextStudents,
    examConfigs: nextExamConfigs,
    examMarksStore: nextMarksStore,
    examBreakdownsStore: nextBreakdownsStore,
    selectedClass:
      selectedClass === target.section ? fallbackClass : selectedClass,
    exportClass: exportClass === target.section ? fallbackClass : exportClass,
    removedStudentsCount: removedStudentIds.size,
  };
}

export function parseAttendanceParts(
  attendance?: string,
  defaultOutOf: string = '31'
): { present: string; outOf: string } {
  const raw = (attendance || '').trim();
  if (!raw) {
    return { present: '', outOf: '' };
  }
  const slashIdx = raw.indexOf('/');
  if (slashIdx === -1) {
    return { present: raw, outOf: defaultOutOf };
  }
  return {
    present: raw.slice(0, slashIdx).trim(),
    outOf: raw.slice(slashIdx + 1).trim(),
  };
}

export function formatAttendanceParts(present: string, outOf: string): string {
  const cleanPresent = (present || '').trim();
  const cleanOutOf = (outOf || '').trim();
  if (!cleanPresent && !cleanOutOf) return '';
  if (cleanPresent && cleanOutOf) return `${cleanPresent}/${cleanOutOf}`;
  if (cleanPresent) return cleanPresent;
  return `0/${cleanOutOf}`;
}

export function createStudentRecord(params: {
  students: StudentReportRow[];
  examConfigs: Record<string, ExamConfig>;
  activeExamId: string;
  classes: ClassDefinition[];
  name: string;
  rollNo: string;
  section: string;
  dob?: string;
  fatherName?: string;
  motherName?: string;
  house?: string;
  height?: string | number;
  weight?: string | number;
  attendance?: string;
  attendanceOutOf?: string;
}): {
  createdStudent: StudentReportRow;
  nextStudents: StudentReportRow[];
  examMarksStoreUpdates: Record<string, Record<string, number | 'AB' | null>>;
  examBreakdownsStoreUpdates: Record<string, Record<string, SubjectBreakdown>>;
} {
  const {
    students,
    examConfigs,
    activeExamId,
    classes,
    name,
    rollNo,
    section,
    dob,
    fatherName,
    motherName,
    house,
    height,
    weight,
    attendance,
    attendanceOutOf,
  } = params;

  const targetSection = section.trim() || classes[0]?.section || 'Sparkle';
  const grade = getGradeForSection(classes, targetSection);
  const cleanRoll = rollNo.trim().padStart(2, '0');
  const newId = `sva-${targetSection.toLowerCase().replace(/[^a-z0-9]/g, '')}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const activeCfg = examConfigs[activeExamId] || Object.values(examConfigs)[0];
  const defaultMarks: Record<string, number | 'AB' | null> = {};
  const defaultBreakdowns: Record<string, SubjectBreakdown> = {};

  if (activeCfg) {
    const eff = getEffectiveExamConfigForClass(activeCfg, targetSection);
    eff.subjects.forEach((sub) => {
      const defMark = Math.round((sub.maxMarks || 100) * 0.8);
      defaultMarks[sub.name] = defMark;
      const bd = syncBreakdownWithTotal(defMark, sub.name, targetSection, sub.components);
      if (bd) {
        defaultBreakdowns[sub.name] = bd;
      }
    });
  }

  const combinedAttendance =
    attendanceOutOf !== undefined
      ? formatAttendanceParts(attendance || '', attendanceOutOf)
      : (attendance || '').trim();

  const createdStudent: StudentReportRow = {
    id: newId,
    rollNo: cleanRoll,
    name: name.trim(),
    admissionNo: `SVA-2026-${targetSection.substring(0, 3).toUpperCase()}-${cleanRoll}`,
    class: grade,
    section: targetSection,
    dob: (dob || '').trim() || '2014-01-01',
    fatherName: (fatherName || '').trim() || 'Parent',
    motherName: (motherName || '').trim() || 'Parent',
    ...(house && house.trim() ? { house: house.trim() } : {}),
    ...(height !== undefined && String(height).trim() !== '' ? { height: String(height).trim() } : {}),
    ...(weight !== undefined && String(weight).trim() !== '' ? { weight: String(weight).trim() } : {}),
    ...(combinedAttendance ? { attendance: combinedAttendance } : {}),
    marks: defaultMarks,
    breakdowns: defaultBreakdowns,
    subjectRemarks: {},
    customRemarks: 'Diligent student with regular academic participation.',
  };

  const examMarksStoreUpdates: Record<string, Record<string, number | 'AB' | null>> = {};
  const examBreakdownsStoreUpdates: Record<string, Record<string, SubjectBreakdown>> = {};

  Object.entries(examConfigs).forEach(([exId, exCfg]) => {
    const eff = getEffectiveExamConfigForClass(exCfg, targetSection);
    const exMarks: Record<string, number | 'AB' | null> = {};
    const exBds: Record<string, SubjectBreakdown> = {};
    eff.subjects.forEach((sub) => {
      const defMark =
        exId === activeExamId
          ? (defaultMarks[sub.name] ?? Math.round((sub.maxMarks || 100) * 0.8))
          : Math.round((sub.maxMarks || 100) * 0.8);
      exMarks[sub.name] = defMark;
      const bd = syncBreakdownWithTotal(defMark, sub.name, targetSection, sub.components);
      if (bd) {
        exBds[sub.name] = bd;
      }
    });
    examMarksStoreUpdates[exId] = exMarks;
    examBreakdownsStoreUpdates[exId] = exId === activeExamId ? defaultBreakdowns : exBds;
  });

  return {
    createdStudent,
    nextStudents: [...students, createdStudent],
    examMarksStoreUpdates,
    examBreakdownsStoreUpdates,
  };
}

