import { createHmac, timingSafeEqual } from 'node:crypto';
import { UserRole } from './auth';
import { PersistedErpState } from './erp-persistence';
import {
  ExamConfig,
  getEffectiveExamConfigForClass,
  isPtExam,
  StudentReportRow,
  SubjectBreakdown,
} from './report-card-types';
import { canUserEditSubjectInClass, TeacherProfile } from './teacher-permissions';

function sanitizeText(value: unknown, maxLen = 300): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/[<>]/g, '')
    .slice(0, maxLen);
}

function resolveSubjectMaxMarks(
  examConfigs: Record<string, ExamConfig>,
  examId: string,
  section: string,
  subjectName: string
): number {
  const cfg = examConfigs[examId];
  const defaultMax = isPtExam(cfg?.code || examId) ? 25 : 100;
  if (!cfg) return defaultMax;
  const effective = getEffectiveExamConfigForClass(cfg, section);
  const sub = effective.subjects.find(
    (s) => s.name.trim().toLowerCase() === subjectName.trim().toLowerCase()
  );
  return sub?.maxMarks && Number.isFinite(sub.maxMarks) && sub.maxMarks > 0
    ? sub.maxMarks
    : defaultMax;
}

export function sanitizeMarkValue(
  raw: unknown,
  maxMarks: number
): number | 'AB' | null {
  if (raw === null || raw === undefined || raw === '') {
    return null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim().toUpperCase();
    if (trimmed === 'AB') return 'AB';
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return Math.min(maxMarks, Math.max(0, Math.round(parsed * 100) / 100));
  }
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    return Math.min(maxMarks, Math.max(0, Math.round(raw * 100) / 100));
  }
  return null;
}

function sanitizeBreakdown(
  rawBd: SubjectBreakdown | undefined,
  maxMarks: number
): SubjectBreakdown | undefined {
  if (!rawBd || typeof rawBd !== 'object') return undefined;
  const cleaned: SubjectBreakdown = {};
  for (const [key, val] of Object.entries(rawBd)) {
    if (val === 'AB') {
      cleaned[key] = 'AB';
    } else if (typeof val === 'number' && Number.isFinite(val)) {
      cleaned[key] = Math.min(maxMarks, Math.max(0, Math.round(val * 100) / 100));
    } else if (val === null) {
      cleaned[key] = null;
    }
  }
  return cleaned;
}

/**
 * Enforces role-based permissions, class-subject teacher mappings, Class Teacher view-only rules,
 * and strict mark bounds on incoming ERP state payloads so that tampered client requests or
 * DevTools scripts cannot inflate marks beyond maxMarks, inject scripts, or modify unmapped subjects/classes.
 */
export function sanitizeAndValidateErpState(
  incoming: PersistedErpState,
  existingServerState: PersistedErpState | null,
  role: UserRole,
  nowMs: number = Date.now(),
  teacherProfile?: TeacherProfile | null
): PersistedErpState {
  const isTeacher = role === 'teacher';
  const enforceTeacherScope = isTeacher && Boolean(teacherProfile) && Boolean(existingServerState);

  // Teachers cannot alter exam configurations or class definitions if server state exists
  const authoritativeExamConfigs: Record<string, ExamConfig> =
    isTeacher && existingServerState?.examConfigs
      ? existingServerState.examConfigs
      : incoming.examConfigs;

  const authoritativeClasses =
    isTeacher && existingServerState?.classes && existingServerState.classes.length > 0
      ? existingServerState.classes
      : incoming.classes;

  // The exam that incoming.students[].marks and incoming.students[].breakdowns belong to
  const incomingExamId =
    typeof incoming.selectedExam === 'string' && authoritativeExamConfigs[incoming.selectedExam]
      ? incoming.selectedExam
      : Object.keys(authoritativeExamConfigs)[0] || 'SA-1';

  // Preserve Admin's active exam and class on the server when a teacher saves marks in any exam/class
  const serverExamId =
    enforceTeacherScope &&
    existingServerState?.selectedExam &&
    authoritativeExamConfigs[existingServerState.selectedExam]
      ? existingServerState.selectedExam
      : incomingExamId;

  const serverSelectedClass =
    enforceTeacherScope && existingServerState?.selectedClass
      ? sanitizeText(existingServerState.selectedClass, 60)
      : sanitizeText(incoming.selectedClass || 'Diamond', 60);

  // Map existing students by ID so teachers cannot delete the roster or spoof student identities
  const existingStudentsById = new Map<string, StudentReportRow>();
  if (existingServerState?.students) {
    for (const st of existingServerState.students) {
      if (st && typeof st.id === 'string') {
        existingStudentsById.set(st.id, st);
      }
    }
  }

  const sourceStudents: StudentReportRow[] = Array.isArray(incoming.students)
    ? incoming.students
    : [];

  // Build student section map for mark bound validation
  const studentSectionMap = new Map<string, string>();
  for (const st of sourceStudents) {
    if (st && typeof st === 'object' && typeof st.id === 'string') {
      const existingStu = existingStudentsById.get(st.id);
      const sec =
        isTeacher && existingStu ? existingStu.section : sanitizeText(st.section, 60);
      studentSectionMap.set(sanitizeText(st.id, 80), sec);
    }
  }
  if (isTeacher && existingServerState?.students) {
    for (const existingStu of existingServerState.students) {
      if (!studentSectionMap.has(existingStu.id)) {
        studentSectionMap.set(existingStu.id, existingStu.section);
      }
    }
  }

  // 1. Sanitize examMarksStore across all exams first
  const cleanExamMarksStore: PersistedErpState['examMarksStore'] = {};
  if (enforceTeacherScope && existingServerState) {
    if (existingServerState.examMarksStore) {
      for (const [exId, byStu] of Object.entries(existingServerState.examMarksStore)) {
        cleanExamMarksStore[exId] = {};
        for (const [stuId, marks] of Object.entries(byStu || {})) {
          cleanExamMarksStore[exId][stuId] = { ...marks };
        }
      }
    }
    // Also ensure existingServerState.selectedExam marks from existingServerState.students are seeded
    const prevServerExam = existingServerState.selectedExam;
    if (prevServerExam && Array.isArray(existingServerState.students)) {
      if (!cleanExamMarksStore[prevServerExam]) cleanExamMarksStore[prevServerExam] = {};
      for (const existingStu of existingServerState.students) {
        if (!existingStu?.id) continue;
        cleanExamMarksStore[prevServerExam][existingStu.id] = {
          ...(cleanExamMarksStore[prevServerExam][existingStu.id] || {}),
          ...(existingStu.marks || {}),
        };
      }
    }
  }

  if (incoming.examMarksStore && typeof incoming.examMarksStore === 'object') {
    for (const [examId, byStudent] of Object.entries(incoming.examMarksStore)) {
      if (!byStudent || typeof byStudent !== 'object') continue;
      if (!cleanExamMarksStore[examId]) cleanExamMarksStore[examId] = {};
      for (const [studentId, subjectMarks] of Object.entries(byStudent)) {
        if (!subjectMarks || typeof subjectMarks !== 'object') continue;
        const cleanStuId = sanitizeText(studentId, 80);
        const section = studentSectionMap.get(cleanStuId) || 'Diamond';
        if (!cleanExamMarksStore[examId][cleanStuId]) {
          cleanExamMarksStore[examId][cleanStuId] = {};
        }
        for (const [subName, markVal] of Object.entries(subjectMarks)) {
          const cleanSub = sanitizeText(subName, 60);
          if (
            enforceTeacherScope &&
            !canUserEditSubjectInClass(section, cleanSub, 'teacher', teacherProfile)
          ) {
            continue;
          }
          const maxMarks = resolveSubjectMaxMarks(
            authoritativeExamConfigs,
            examId,
            section,
            cleanSub
          );
          cleanExamMarksStore[examId][cleanStuId][cleanSub] =
            sanitizeMarkValue(markVal, maxMarks);
        }
      }
    }
  }

  // 2. Sanitize examBreakdownsStore across all exams
  const cleanExamBreakdownsStore: PersistedErpState['examBreakdownsStore'] = {};
  if (enforceTeacherScope && existingServerState) {
    if (existingServerState.examBreakdownsStore) {
      for (const [exId, byStu] of Object.entries(existingServerState.examBreakdownsStore)) {
        cleanExamBreakdownsStore[exId] = {};
        for (const [stuId, bds] of Object.entries(byStu || {})) {
          cleanExamBreakdownsStore[exId][stuId] = { ...bds };
        }
      }
    }
    const prevServerExam = existingServerState.selectedExam;
    if (prevServerExam && Array.isArray(existingServerState.students)) {
      if (!cleanExamBreakdownsStore[prevServerExam]) {
        cleanExamBreakdownsStore[prevServerExam] = {};
      }
      for (const existingStu of existingServerState.students) {
        if (!existingStu?.id || !existingStu.breakdowns) continue;
        cleanExamBreakdownsStore[prevServerExam][existingStu.id] = {
          ...(cleanExamBreakdownsStore[prevServerExam][existingStu.id] || {}),
          ...existingStu.breakdowns,
        };
      }
    }
  }

  if (incoming.examBreakdownsStore && typeof incoming.examBreakdownsStore === 'object') {
    for (const [examId, byStudent] of Object.entries(incoming.examBreakdownsStore)) {
      if (!byStudent || typeof byStudent !== 'object') continue;
      if (!cleanExamBreakdownsStore[examId]) cleanExamBreakdownsStore[examId] = {};
      for (const [studentId, subjectBds] of Object.entries(byStudent)) {
        if (!subjectBds || typeof subjectBds !== 'object') continue;
        const cleanStuId = sanitizeText(studentId, 80);
        const section = studentSectionMap.get(cleanStuId) || 'Diamond';
        if (!cleanExamBreakdownsStore[examId][cleanStuId]) {
          cleanExamBreakdownsStore[examId][cleanStuId] = {};
        }
        for (const [subName, bd] of Object.entries(subjectBds)) {
          const cleanSub = sanitizeText(subName, 60);
          if (
            enforceTeacherScope &&
            !canUserEditSubjectInClass(section, cleanSub, 'teacher', teacherProfile)
          ) {
            continue;
          }
          const maxMarks = resolveSubjectMaxMarks(
            authoritativeExamConfigs,
            examId,
            section,
            cleanSub
          );
          const cleanedBd = sanitizeBreakdown(bd, maxMarks);
          if (cleanedBd) {
            cleanExamBreakdownsStore[examId][cleanStuId][cleanSub] = cleanedBd;
          } else {
            delete cleanExamBreakdownsStore[examId][cleanStuId][cleanSub];
          }
        }
      }
    }
  }

  // 3. Merge incoming.students marks/breakdowns into cleanExamMarksStore[incomingExamId] & cleanExamBreakdownsStore[incomingExamId]
  if (!cleanExamMarksStore[incomingExamId]) cleanExamMarksStore[incomingExamId] = {};
  if (!cleanExamBreakdownsStore[incomingExamId]) cleanExamBreakdownsStore[incomingExamId] = {};

  for (const st of sourceStudents) {
    if (!st || typeof st !== 'object' || typeof st.id !== 'string') continue;
    const cleanStuId = sanitizeText(st.id, 80);
    const existingStu = existingStudentsById.get(st.id);
    const section =
      isTeacher && existingStu ? existingStu.section : sanitizeText(st.section, 60);

    if (!cleanExamMarksStore[incomingExamId][cleanStuId]) {
      cleanExamMarksStore[incomingExamId][cleanStuId] = {};
    }
    if (st.marks && typeof st.marks === 'object') {
      for (const [subjectName, markVal] of Object.entries(st.marks)) {
        const cleanSub = sanitizeText(subjectName, 60);
        if (
          enforceTeacherScope &&
          !canUserEditSubjectInClass(section, cleanSub, 'teacher', teacherProfile)
        ) {
          continue;
        }
        const maxMarks = resolveSubjectMaxMarks(
          authoritativeExamConfigs,
          incomingExamId,
          section,
          cleanSub
        );
        cleanExamMarksStore[incomingExamId][cleanStuId][cleanSub] = sanitizeMarkValue(
          markVal,
          maxMarks
        );
      }
    }

    if (!cleanExamBreakdownsStore[incomingExamId][cleanStuId]) {
      cleanExamBreakdownsStore[incomingExamId][cleanStuId] = {};
    }
    if (st.breakdowns && typeof st.breakdowns === 'object') {
      for (const [subjectName, bd] of Object.entries(st.breakdowns)) {
        const cleanSub = sanitizeText(subjectName, 60);
        if (
          enforceTeacherScope &&
          !canUserEditSubjectInClass(section, cleanSub, 'teacher', teacherProfile)
        ) {
          continue;
        }
        const maxMarks = resolveSubjectMaxMarks(
          authoritativeExamConfigs,
          incomingExamId,
          section,
          cleanSub
        );
        const sanitizedBd = sanitizeBreakdown(bd, maxMarks);
        if (sanitizedBd) {
          cleanExamBreakdownsStore[incomingExamId][cleanStuId][cleanSub] = sanitizedBd;
        } else {
          delete cleanExamBreakdownsStore[incomingExamId][cleanStuId][cleanSub];
        }
      }
    }
  }

  // 4. Construct sanitizedStudents whose .marks and .breakdowns correspond to serverExamId
  const sanitizedStudents: StudentReportRow[] = sourceStudents
    .filter((st) => st && typeof st === 'object' && typeof st.id === 'string')
    .map((st) => {
      const cleanStuId = sanitizeText(st.id, 80);
      const existingStu = existingStudentsById.get(st.id);
      const section =
        isTeacher && existingStu ? existingStu.section : sanitizeText(st.section, 60);
      const name =
        isTeacher && existingStu ? existingStu.name : sanitizeText(st.name, 120);
      const rollNo =
        isTeacher && existingStu ? existingStu.rollNo : sanitizeText(st.rollNo, 20);

      let cleanMarks: Record<string, number | 'AB' | null>;
      let cleanBreakdowns: Record<string, SubjectBreakdown>;

      if (enforceTeacherScope && incomingExamId !== serverExamId) {
        // Teacher edited a different exam than serverExamId: keep serverExamId's marks on student rows
        cleanMarks = {
          ...(existingStu?.marks || {}),
          ...(cleanExamMarksStore[serverExamId]?.[cleanStuId] || {}),
        };
        cleanBreakdowns = {
          ...(existingStu?.breakdowns || {}),
          ...(cleanExamBreakdownsStore[serverExamId]?.[cleanStuId] || {}),
        };
      } else {
        cleanMarks =
          enforceTeacherScope && existingStu?.marks ? { ...existingStu.marks } : {};
        const storeMarksForActive = cleanExamMarksStore[serverExamId]?.[cleanStuId];
        if (storeMarksForActive) {
          Object.assign(cleanMarks, storeMarksForActive);
        }

        cleanBreakdowns =
          enforceTeacherScope && existingStu?.breakdowns
            ? { ...existingStu.breakdowns }
            : {};
        if (st.breakdowns && typeof st.breakdowns === 'object') {
          for (const [subjectName, bd] of Object.entries(st.breakdowns)) {
            const cleanSub = sanitizeText(subjectName, 60);
            if (
              enforceTeacherScope &&
              !canUserEditSubjectInClass(section, cleanSub, 'teacher', teacherProfile)
            ) {
              continue;
            }
            const maxMarks = resolveSubjectMaxMarks(
              authoritativeExamConfigs,
              serverExamId,
              section,
              cleanSub
            );
            const sanitizedBd = sanitizeBreakdown(bd, maxMarks);
            if (sanitizedBd) {
              cleanBreakdowns[cleanSub] = sanitizedBd;
            } else {
              delete cleanBreakdowns[cleanSub];
            }
          }
        }
      }

      const cleanSubjectRemarks: Record<string, string> =
        enforceTeacherScope && existingStu?.subjectRemarks
          ? { ...existingStu.subjectRemarks }
          : {};

      if (st.subjectRemarks && typeof st.subjectRemarks === 'object') {
        for (const [subName, rem] of Object.entries(st.subjectRemarks)) {
          const cleanSub = sanitizeText(subName, 60);
          if (
            enforceTeacherScope &&
            !canUserEditSubjectInClass(section, cleanSub, 'teacher', teacherProfile)
          ) {
            continue;
          }
          if (typeof rem === 'string') {
            cleanSubjectRemarks[cleanSub] = sanitizeText(rem, 400);
          }
        }
      }

      const resolvedCustomRemarks =
        enforceTeacherScope && existingStu
          ? existingStu.customRemarks
          : typeof st.customRemarks === 'string'
          ? sanitizeText(st.customRemarks, 500)
          : undefined;

      const existingRemarksProp = (existingStu as { remarks?: string } | undefined)?.remarks;
      const incomingRemarksProp = (st as { remarks?: string }).remarks;
      const resolvedRemarksProp =
        enforceTeacherScope && existingStu
          ? existingRemarksProp
          : typeof incomingRemarksProp === 'string'
          ? sanitizeText(incomingRemarksProp, 500)
          : undefined;

      return {
        ...st,
        id: cleanStuId,
        rollNo,
        name,
        section,
        class: isTeacher && existingStu ? existingStu.class : sanitizeText(st.class, 20),
        dob:
          isTeacher && existingStu
            ? existingStu.dob
            : st.dob
            ? sanitizeText(st.dob, 40)
            : undefined,
        fatherName:
          isTeacher && existingStu
            ? existingStu.fatherName
            : st.fatherName
            ? sanitizeText(st.fatherName, 120)
            : undefined,
        motherName:
          isTeacher && existingStu
            ? existingStu.motherName
            : st.motherName
            ? sanitizeText(st.motherName, 120)
            : undefined,
        house:
          isTeacher && existingStu
            ? existingStu.house
            : st.house
            ? sanitizeText(st.house, 60)
            : undefined,
        height:
          isTeacher && existingStu
            ? existingStu.height
            : st.height
            ? sanitizeText(st.height, 20)
            : undefined,
        weight:
          isTeacher && existingStu
            ? existingStu.weight
            : st.weight
            ? sanitizeText(st.weight, 20)
            : undefined,
        attendance:
          isTeacher && existingStu
            ? existingStu.attendance
            : st.attendance
            ? sanitizeText(st.attendance, 30)
            : undefined,
        customRemarks: resolvedCustomRemarks,
        ...(resolvedRemarksProp !== undefined ? { remarks: resolvedRemarksProp } : {}),
        marks: cleanMarks,
        breakdowns: cleanBreakdowns,
        subjectRemarks: cleanSubjectRemarks,
      };
    });

  // If a teacher request omitted existing students (e.g. attempted roster wipe), restore missing students
  if (isTeacher && existingServerState?.students) {
    const presentIds = new Set(sanitizedStudents.map((s) => s.id));
    for (const existingStu of existingServerState.students) {
      if (!presentIds.has(existingStu.id)) {
        const restoredMarks = {
          ...(existingStu.marks || {}),
          ...(cleanExamMarksStore[serverExamId]?.[existingStu.id] || {}),
        };
        const restoredBds = {
          ...(existingStu.breakdowns || {}),
          ...(cleanExamBreakdownsStore[serverExamId]?.[existingStu.id] || {}),
        };
        sanitizedStudents.push({
          ...existingStu,
          marks: restoredMarks,
          breakdowns: restoredBds,
        });
      }
    }
  }

  return {
    version: 1,
    initialized: true,
    updatedAt: nowMs,
    selectedClass: serverSelectedClass,
    selectedExam: serverExamId,
    classes: authoritativeClasses,
    examConfigs: authoritativeExamConfigs,
    students: sanitizedStudents,
    examMarksStore: cleanExamMarksStore,
    examBreakdownsStore: cleanExamBreakdownsStore,
  };
}

export function computeStateHmac(state: PersistedErpState, secret: string): string {
  const canonical = JSON.stringify({
    version: state.version,
    updatedAt: state.updatedAt,
    classes: state.classes,
    examConfigs: state.examConfigs,
    students: state.students,
    examMarksStore: state.examMarksStore,
  });
  return createHmac('sha256', secret).update(canonical).digest('hex');
}

export function verifyStateHmac(
  state: PersistedErpState,
  signature: string | undefined,
  secret: string
): boolean {
  if (typeof signature !== 'string' || signature.length === 0) return false;
  const expected = computeStateHmac(state, secret);
  const a = Buffer.from(signature, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
