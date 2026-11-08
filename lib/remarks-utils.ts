import { StudentReportRow, SubjectConfig, computeStudentResult } from './report-card-types';

export const SUBJECT_REMARK_PRESETS: string[] = [
  'Excellent conceptual clarity and active participation.',
  'Very good grasp of concepts; consistent performance.',
  'Good effort; regular practice will improve accuracy.',
  'Satisfactory progress; needs more attention to detail.',
  'Requires focused revision and extra practice.',
];

export const CLASS_TEACHER_REMARK_PRESETS: string[] = [
  'Exemplary academic effort and outstanding discipline.',
  'Consistent high achiever with excellent analytical skills.',
  'Very diligent and sincere student; participates actively.',
  'Good overall progress; regular revision recommended.',
  'Capable student; focused practice will boost performance.',
];

/**
 * Generates a sensible default subject teacher remark based on marks obtained.
 */
export function getDefaultSubjectRemark(
  obtained: number | 'AB' | null | undefined,
  maxMarks: number = 100
): string {
  if (obtained === 'AB') {
    return 'Absent for examination; re-test recommended.';
  }
  if (obtained === null || obtained === undefined) {
    return '';
  }
  const pct = maxMarks > 0 ? (obtained / maxMarks) * 100 : 0;
  if (pct >= 90) return 'Excellent conceptual clarity and outstanding command.';
  if (pct >= 75) return 'Very good understanding and consistent class work.';
  if (pct >= 60) return 'Good progress; regular practice will yield higher scores.';
  if (pct >= 40) return 'Satisfactory effort; needs more written practice.';
  if (pct >= 33) return 'Needs regular revision to strengthen core concepts.';
  return 'Requires focused remedial support and daily practice.';
}

/**
 * Generates a sensible default class teacher remark based on overall percentage and status.
 */
export function getDefaultClassTeacherRemark(
  percentage: number,
  status: 'PASS' | 'FAIL' | 'COMPARTMENT' | 'ABSENT'
): string {
  if (status === 'ABSENT') {
    return 'Appeared absent in examination; scheduled for re-evaluation.';
  }
  if (status === 'FAIL' || status === 'COMPARTMENT') {
    return 'Requires targeted practice and regular revision in core subjects.';
  }
  if (percentage >= 90) {
    return 'Exemplary academic effort and outstanding discipline.';
  }
  if (percentage >= 75) {
    return 'Consistent high achiever with sincere academic dedication.';
  }
  if (percentage >= 60) {
    return 'Good overall progress; active participation in class activities.';
  }
  return 'Satisfactory progress; regular study schedule recommended.';
}

/**
 * Immutably updates a student's Class Teacher remark (`customRemarks`).
 */
export function updateStudentClassRemark(
  student: StudentReportRow,
  remark: string
): StudentReportRow {
  return {
    ...student,
    customRemarks: remark,
  };
}

/**
 * Immutably updates a student's Subject Teacher remark (`subjectRemarks[subjectName]`).
 */
export function updateStudentSubjectRemark(
  student: StudentReportRow,
  subjectName: string,
  remark: string
): StudentReportRow {
  return {
    ...student,
    subjectRemarks: {
      ...(student.subjectRemarks || {}),
      [subjectName]: remark,
    },
  };
}

/**
 * Populates smart default remarks for students matching the selected class and remark scope.
 * Only fills empty remarks unless `overwrite` is true.
 */
export function applyAutoRemarksToStudents(
  students: StudentReportRow[],
  subjects: SubjectConfig[],
  selectedClass: string,
  remarkScope: string, // 'all' | 'class_teacher' | subjectName
  overwrite: boolean = false
): StudentReportRow[] {
  return students.map((st) => {
    if (selectedClass !== 'all' && st.section !== selectedClass) {
      return st;
    }

    const res = computeStudentResult(st, subjects);
    let nextCustomRemarks = st.customRemarks || '';
    const nextSubjectRemarks: Record<string, string> = { ...(st.subjectRemarks || {}) };

    if (remarkScope === 'all' || remarkScope === 'class_teacher') {
      if (overwrite || !nextCustomRemarks.trim()) {
        nextCustomRemarks = getDefaultClassTeacherRemark(res.percentage, res.status);
      }
    }

    if (remarkScope === 'all') {
      subjects.forEach((sub) => {
        const currentSubRem = nextSubjectRemarks[sub.name] || '';
        if (overwrite || !currentSubRem.trim()) {
          nextSubjectRemarks[sub.name] = getDefaultSubjectRemark(
            st.marks[sub.name],
            sub.maxMarks
          );
        }
      });
    } else if (remarkScope !== 'class_teacher') {
      const targetSub = subjects.find(
        (s) => s.name.toLowerCase() === remarkScope.toLowerCase()
      );
      if (targetSub) {
        const currentSubRem = nextSubjectRemarks[targetSub.name] || '';
        if (overwrite || !currentSubRem.trim()) {
          nextSubjectRemarks[targetSub.name] = getDefaultSubjectRemark(
            st.marks[targetSub.name],
            targetSub.maxMarks
          );
        }
      }
    }

    return {
      ...st,
      customRemarks: nextCustomRemarks,
      subjectRemarks: nextSubjectRemarks,
    };
  });
}

/**
 * Pure helper to calculate horizontal scroll position during header click-and-drag scrolling.
 */
export function computeDragScrollLeft(
  startScrollLeft: number,
  startX: number,
  currentX: number,
  maxScrollLeft: number = Number.POSITIVE_INFINITY,
  multiplier: number = 1.25
): { nextScrollLeft: number; hasDragged: boolean } {
  const dx = currentX - startX;
  const hasDragged = Math.abs(dx) > 3;
  const rawScroll = startScrollLeft - dx * multiplier;
  const clamped = Math.max(0, Math.min(maxScrollLeft, Math.round(rawScroll)));
  return {
    nextScrollLeft: clamped,
    hasDragged,
  };
}

