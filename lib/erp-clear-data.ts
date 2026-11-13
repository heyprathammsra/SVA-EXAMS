import {
  ExamConfig,
  StudentReportRow,
  SubjectBreakdown,
} from './report-card-types';
import {
  ExamBreakdownsStore,
  ExamMarksStore,
  removeStudentFromErpStores,
} from './erp-persistence';

export interface ClearDataOptions {
  targetSection: string; // 'all' | specific section name
  targetExam: string; // 'ALL' | specific examId
  clearMarks: boolean;
  clearRemarks: boolean;
  clearAttendance: boolean;
  removeStudents: boolean;
}

export interface ClearDataImpact {
  matchedStudentsCount: number;
  affectedExamIds: string[];
}

export function countClearDataImpact(params: {
  students: StudentReportRow[];
  examConfigs: Record<string, ExamConfig>;
  targetSection: string;
  targetExam: string;
}): ClearDataImpact {
  const { students, examConfigs, targetSection, targetExam } = params;
  const isAllClasses = !targetSection || targetSection === 'all';
  const matchedStudentsCount = isAllClasses
    ? students.length
    : students.filter((s) => s.section === targetSection).length;

  const allExamIds = Object.keys(examConfigs);
  const affectedExamIds =
    !targetExam || targetExam === 'ALL'
      ? allExamIds
      : allExamIds.includes(targetExam)
      ? [targetExam]
      : [targetExam];

  return {
    matchedStudentsCount,
    affectedExamIds,
  };
}

export function applyClearErpData(params: {
  students: StudentReportRow[];
  activeExamId: string;
  examConfigs: Record<string, ExamConfig>;
  examMarksStore: ExamMarksStore;
  examBreakdownsStore: ExamBreakdownsStore;
  selectedStudentId: string;
  options: ClearDataOptions;
}): {
  students: StudentReportRow[];
  examMarksStore: ExamMarksStore;
  examBreakdownsStore: ExamBreakdownsStore;
  selectedStudentId: string;
  clearedStudentsCount: number;
  summaryMessage: string;
} {
  const {
    students,
    activeExamId,
    examConfigs,
    examMarksStore,
    examBreakdownsStore,
    selectedStudentId,
    options,
  } = params;

  const isAllClasses = !options.targetSection || options.targetSection === 'all';
  const isAllExams = !options.targetExam || options.targetExam === 'ALL';

  const matchesClass = (s: StudentReportRow): boolean =>
    isAllClasses || s.section === options.targetSection;

  const targetIds = new Set(students.filter(matchesClass).map((s) => s.id));

  if (targetIds.size === 0) {
    return {
      students,
      examMarksStore,
      examBreakdownsStore,
      selectedStudentId,
      clearedStudentsCount: 0,
      summaryMessage: 'No students matched the selected class.',
    };
  }

  // Case 1: Full student removal for the selected class scope (preserves classes & exam settings)
  if (options.removeStudents) {
    const nextStudents = isAllClasses
      ? []
      : students.filter((s) => !targetIds.has(s.id));

    let nextMarksStore: ExamMarksStore = examMarksStore;
    let nextBreakdownsStore: ExamBreakdownsStore = examBreakdownsStore;

    if (isAllClasses) {
      nextMarksStore = {};
      nextBreakdownsStore = {};
    } else {
      targetIds.forEach((stuId) => {
        const cleaned = removeStudentFromErpStores(
          nextMarksStore,
          nextBreakdownsStore,
          stuId
        );
        nextMarksStore = cleaned.examMarksStore;
        nextBreakdownsStore = cleaned.examBreakdownsStore;
      });
    }

    const stillExists = nextStudents.some((s) => s.id === selectedStudentId);
    const nextSelectedStudentId = stillExists
      ? selectedStudentId
      : nextStudents[0]?.id || '';

    const scopeText = isAllClasses ? 'all classes' : options.targetSection;
    return {
      students: nextStudents,
      examMarksStore: nextMarksStore,
      examBreakdownsStore: nextBreakdownsStore,
      selectedStudentId: nextSelectedStudentId,
      clearedStudentsCount: targetIds.size,
      summaryMessage: `Removed ${targetIds.size} student${targetIds.size === 1 ? '' : 's'} from ${scopeText} (classes & exam settings kept)`,
    };
  }

  // Case 2: Selective clearing (Marks / Remarks / Attendance) while preserving student roster
  const examIdsToClear = new Set<string>(
    isAllExams
      ? [
          ...Object.keys(examConfigs),
          ...Object.keys(examMarksStore),
          ...Object.keys(examBreakdownsStore),
          activeExamId,
        ]
      : [options.targetExam]
  );

  const shouldClearActiveExamMarks =
    options.clearMarks && examIdsToClear.has(activeExamId);

  const nextStudents = students.map((st) => {
    if (!targetIds.has(st.id)) return st;

    const nextMarks: Record<string, number | 'AB' | null> =
      shouldClearActiveExamMarks
        ? Object.fromEntries(Object.keys(st.marks || {}).map((k) => [k, null]))
        : st.marks;

    const nextBreakdowns: Record<string, SubjectBreakdown> | undefined =
      shouldClearActiveExamMarks ? {} : st.breakdowns;

    const nextCustomRemarks = options.clearRemarks ? '' : st.customRemarks;
    const nextSubjectRemarks = options.clearRemarks ? {} : st.subjectRemarks;
    const nextAttendance = options.clearAttendance ? '' : st.attendance;

    return {
      ...st,
      marks: nextMarks,
      breakdowns: nextBreakdowns,
      customRemarks: nextCustomRemarks,
      subjectRemarks: nextSubjectRemarks,
      attendance: nextAttendance,
    };
  });

  let nextMarksStore = examMarksStore;
  let nextBreakdownsStore = examBreakdownsStore;

  if (options.clearMarks) {
    nextMarksStore = { ...examMarksStore };
    nextBreakdownsStore = { ...examBreakdownsStore };

    examIdsToClear.forEach((exId) => {
      const existingMarksMap = examMarksStore[exId] || {};
      const updatedMarksMap: Record<
        string,
        Record<string, number | 'AB' | null>
      > = {};

      Object.entries(existingMarksMap).forEach(([stuId, stuMarks]) => {
        if (targetIds.has(stuId)) {
          updatedMarksMap[stuId] = Object.fromEntries(
            Object.keys(stuMarks || {}).map((subKey) => [subKey, null])
          );
        } else {
          updatedMarksMap[stuId] = stuMarks;
        }
      });

      // Ensure matched students missing from store also have explicit empty map so switchExamState never falls back
      targetIds.forEach((stuId) => {
        if (!(stuId in updatedMarksMap)) {
          updatedMarksMap[stuId] = {};
        }
      });

      nextMarksStore[exId] = updatedMarksMap;

      const existingBdsMap = examBreakdownsStore[exId] || {};
      const updatedBdsMap: Record<string, Record<string, SubjectBreakdown>> = {};
      Object.entries(existingBdsMap).forEach(([stuId, stuBds]) => {
        if (!targetIds.has(stuId)) {
          updatedBdsMap[stuId] = stuBds;
        }
      });
      nextBreakdownsStore[exId] = updatedBdsMap;
    });
  }

  const clearedParts: string[] = [];
  if (options.clearMarks) clearedParts.push('marks');
  if (options.clearRemarks) clearedParts.push('remarks');
  if (options.clearAttendance) clearedParts.push('attendance');

  const partsText =
    clearedParts.length > 0 ? clearedParts.join(' & ') : 'selected fields';
  const scopeText = isAllClasses
    ? `all ${targetIds.size} students`
    : `${targetIds.size} students in ${options.targetSection}`;
  const examText =
    options.clearMarks && isAllExams
      ? ' across all exams'
      : options.clearMarks
      ? ` for ${options.targetExam}`
      : '';

  return {
    students: nextStudents,
    examMarksStore: nextMarksStore,
    examBreakdownsStore: nextBreakdownsStore,
    selectedStudentId,
    clearedStudentsCount: targetIds.size,
    summaryMessage: `Cleared ${partsText} for ${scopeText}${examText}`,
  };
}
