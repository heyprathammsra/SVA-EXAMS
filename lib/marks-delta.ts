import { UserRole } from './auth';
import { PersistedErpState } from './erp-persistence';
import { sanitizeMarkValue } from './erp-security';
import {
  ExamConfig,
  getEffectiveExamConfigForClass,
  isPtExam,
  StudentReportRow,
  SubjectBreakdown,
  syncBreakdownWithTotal,
} from './report-card-types';
import {
  canUserEditSubjectInClass,
  isClassTeacherForSection,
  TeacherProfile,
} from './teacher-permissions';

export type MarkDeltaItem =
  | {
      kind: 'subject_mark';
      studentId: string;
      examId: string;
      subject: string;
      value: number | 'AB' | null;
      breakdown?: SubjectBreakdown;
    }
  | {
      kind: 'internal_breakdown';
      studentId: string;
      examId: string;
      subject: string;
      breakdown: SubjectBreakdown;
      total: number | 'AB' | null;
    }
  | {
      kind: 'student_remark';
      studentId: string;
      subject?: string;
      remark: string;
    }
  | {
      kind: 'student_patch';
      studentId: string;
      patch: {
        rollNo?: string;
        name?: string;
        dob?: string;
        fatherName?: string;
        motherName?: string;
        house?: string;
        height?: string | number;
        weight?: string | number;
        attendance?: string;
      };
    };

export interface ApplyDeltasResult {
  nextState: PersistedErpState;
  dirtyExams: string[];
  appliedCount: number;
  rejectedCount: number;
}

function sanitizeText(value: unknown, maxLen = 300): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/[<>]/g, '')
    .slice(0, maxLen);
}

function resolveSubjectConfig(
  examConfigs: Record<string, ExamConfig>,
  examId: string,
  section: string,
  subjectName: string
) {
  const cfg = examConfigs[examId];
  const defaultMax = isPtExam(cfg?.code || examId) ? 25 : 100;
  if (!cfg) {
    return { maxMarks: defaultMax, components: undefined };
  }
  const effective = getEffectiveExamConfigForClass(cfg, section);
  const sub = effective.subjects.find(
    (s) => s.name.trim().toLowerCase() === subjectName.trim().toLowerCase()
  );
  return {
    maxMarks:
      sub?.maxMarks && Number.isFinite(sub.maxMarks) && sub.maxMarks > 0
        ? sub.maxMarks
        : defaultMax,
    components: sub?.components,
    canonicalName: sub?.name || subjectName,
  };
}

function sanitizeDeltaBreakdown(
  rawBd: SubjectBreakdown | undefined,
  maxMarks: number
): SubjectBreakdown | undefined {
  if (!rawBd || typeof rawBd !== 'object') return undefined;
  const cleaned: SubjectBreakdown = {};
  for (const [key, val] of Object.entries(rawBd)) {
    const cleanKey = sanitizeText(key, 60);
    if (!cleanKey) continue;
    if (val === 'AB') {
      cleaned[cleanKey] = 'AB';
    } else if (typeof val === 'number' && Number.isFinite(val)) {
      cleaned[cleanKey] = Math.min(maxMarks, Math.max(0, Math.round(val * 100) / 100));
    } else if (val === null) {
      cleaned[cleanKey] = null;
    }
  }
  return cleaned;
}

export function applyMarkDeltasToState(params: {
  existingState: PersistedErpState;
  deltas: MarkDeltaItem[];
  role: UserRole;
  teacherProfile?: TeacherProfile | null;
  nowMs?: number;
}): ApplyDeltasResult {
  const {
    existingState,
    deltas,
    role,
    teacherProfile,
    nowMs = Date.now(),
  } = params;

  const isTeacher = role === 'teacher';
  const enforceTeacherScope = isTeacher && Boolean(teacherProfile);

  const nextStudents: StudentReportRow[] = existingState.students.map((st) => ({
    ...st,
    marks: { ...(st.marks || {}) },
    breakdowns: st.breakdowns ? { ...st.breakdowns } : {},
    subjectRemarks: st.subjectRemarks ? { ...st.subjectRemarks } : {},
  }));
  const studentIndexById = new Map<string, number>();
  nextStudents.forEach((st, idx) => {
    studentIndexById.set(st.id, idx);
  });

  const nextMarksStore: PersistedErpState['examMarksStore'] = {};
  for (const [exId, byStu] of Object.entries(existingState.examMarksStore || {})) {
    nextMarksStore[exId] = {};
    for (const [stuId, marks] of Object.entries(byStu || {})) {
      nextMarksStore[exId][stuId] = { ...(marks || {}) };
    }
  }

  const nextBreakdownsStore: PersistedErpState['examBreakdownsStore'] = {};
  for (const [exId, byStu] of Object.entries(existingState.examBreakdownsStore || {})) {
    nextBreakdownsStore[exId] = {};
    for (const [stuId, bds] of Object.entries(byStu || {})) {
      nextBreakdownsStore[exId][stuId] = { ...(bds || {}) };
    }
  }

  const dirtyExamSet = new Set<string>();
  let appliedCount = 0;
  let rejectedCount = 0;

  for (const delta of deltas || []) {
    if (!delta || typeof delta !== 'object') {
      rejectedCount += 1;
      continue;
    }

    const stuIdx = studentIndexById.get(delta.studentId);
    if (stuIdx === undefined) {
      rejectedCount += 1;
      continue;
    }
    const student = nextStudents[stuIdx];

    if (delta.kind === 'subject_mark' || delta.kind === 'internal_breakdown') {
      const examId = sanitizeText(delta.examId, 60);
      if (!examId || !existingState.examConfigs?.[examId]) {
        rejectedCount += 1;
        continue;
      }

      const subInfo = resolveSubjectConfig(
        existingState.examConfigs,
        examId,
        student.section,
        sanitizeText(delta.subject, 60)
      );
      const subjectName = subInfo.canonicalName || sanitizeText(delta.subject, 60);
      if (!subjectName) {
        rejectedCount += 1;
        continue;
      }

      if (
        enforceTeacherScope &&
        !canUserEditSubjectInClass(student.section, subjectName, 'teacher', teacherProfile)
      ) {
        rejectedCount += 1;
        continue;
      }

      const rawMark =
        delta.kind === 'subject_mark' ? delta.value : delta.total;
      const cleanMark = sanitizeMarkValue(rawMark, subInfo.maxMarks);

      const cleanBdInput = sanitizeDeltaBreakdown(delta.breakdown, subInfo.maxMarks);
      const resolvedBd =
        cleanMark === null && delta.kind === 'subject_mark'
          ? undefined
          : cleanBdInput ||
            syncBreakdownWithTotal(
              cleanMark,
              subjectName,
              student.section,
              subInfo.components,
              nextBreakdownsStore[examId]?.[student.id]?.[subjectName] ||
                student.breakdowns?.[subjectName]
            );

      if (!nextMarksStore[examId]) nextMarksStore[examId] = {};
      if (!nextMarksStore[examId][student.id]) nextMarksStore[examId][student.id] = {};
      nextMarksStore[examId][student.id][subjectName] = cleanMark;

      if (!nextBreakdownsStore[examId]) nextBreakdownsStore[examId] = {};
      if (!nextBreakdownsStore[examId][student.id]) {
        nextBreakdownsStore[examId][student.id] = {};
      }
      if (resolvedBd && cleanMark !== null) {
        nextBreakdownsStore[examId][student.id][subjectName] = resolvedBd;
      } else {
        delete nextBreakdownsStore[examId][student.id][subjectName];
      }

      // If editing the currently active server exam, also keep student row synced
      if (examId === existingState.selectedExam) {
        student.marks[subjectName] = cleanMark;
        if (!student.breakdowns) student.breakdowns = {};
        if (resolvedBd && cleanMark !== null) {
          student.breakdowns[subjectName] = resolvedBd;
        } else {
          delete student.breakdowns[subjectName];
        }
      }

      dirtyExamSet.add(examId);
      appliedCount += 1;
      continue;
    }

    if (delta.kind === 'student_remark') {
      const cleanRemark = sanitizeText(delta.remark, 500);
      if (delta.subject) {
        const subjectName = sanitizeText(delta.subject, 60);
        if (
          enforceTeacherScope &&
          !canUserEditSubjectInClass(student.section, subjectName, 'teacher', teacherProfile)
        ) {
          rejectedCount += 1;
          continue;
        }
        if (!student.subjectRemarks) student.subjectRemarks = {};
        student.subjectRemarks[subjectName] = cleanRemark;
      } else {
        // Class teacher remark (admin only, preserving existing security rules)
        if (isTeacher) {
          rejectedCount += 1;
          continue;
        }
        student.customRemarks = cleanRemark;
      }
      if (existingState.selectedExam) {
        dirtyExamSet.add(existingState.selectedExam);
      }
      appliedCount += 1;
      continue;
    }

    if (delta.kind === 'student_patch') {
      const canManage =
        role === 'admin' ||
        (enforceTeacherScope &&
          isClassTeacherForSection(student.section, 'teacher', teacherProfile));
      if (!canManage || !delta.patch || typeof delta.patch !== 'object') {
        rejectedCount += 1;
        continue;
      }
      const p = delta.patch;
      if (p.rollNo !== undefined) student.rollNo = sanitizeText(p.rollNo, 20);
      if (p.name !== undefined) student.name = sanitizeText(p.name, 120);
      if (p.dob !== undefined) student.dob = sanitizeText(p.dob, 40);
      if (p.fatherName !== undefined) student.fatherName = sanitizeText(p.fatherName, 120);
      if (p.motherName !== undefined) student.motherName = sanitizeText(p.motherName, 120);
      if (p.house !== undefined) student.house = sanitizeText(p.house, 60);
      if (p.height !== undefined) {
        student.height = sanitizeText(typeof p.height === 'number' ? String(p.height) : p.height, 20);
      }
      if (p.weight !== undefined) {
        student.weight = sanitizeText(typeof p.weight === 'number' ? String(p.weight) : p.weight, 20);
      }
      if (p.attendance !== undefined) student.attendance = sanitizeText(p.attendance, 30);

      if (existingState.selectedExam) {
        dirtyExamSet.add(existingState.selectedExam);
      }
      appliedCount += 1;
    }
  }

  const nextUpdatedAt = Math.max(nowMs, (existingState.updatedAt || 0) + 1);

  return {
    nextState: {
      ...existingState,
      version: 1,
      initialized: true,
      updatedAt: nextUpdatedAt,
      students: nextStudents,
      examMarksStore: nextMarksStore,
      examBreakdownsStore: nextBreakdownsStore,
    },
    dirtyExams: Array.from(dirtyExamSet),
    appliedCount,
    rejectedCount,
  };
}
