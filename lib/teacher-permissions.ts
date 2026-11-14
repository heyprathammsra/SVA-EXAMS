export interface TeacherClassSubjectAssignment {
  section: string;
  subject: string;
}

export interface TeacherProfile {
  id: string;
  name: string;
  username: string;
  assignedSubject: string;
  assignedClasses: string[];
  classTeacherOf: string | null; // null = "Not a Class Teacher"
  assignments: TeacherClassSubjectAssignment[];
  createdAt?: number;
  updatedAt?: number;
}

export const NOT_A_CLASS_TEACHER_VALUE = '__NOT_CLASS_TEACHER__';

export const DEFAULT_TEACHER_PRATHAM_PROFILE: TeacherProfile = {
  id: 'teacher-pratham',
  name: 'Pratham',
  username: 'pratham',
  assignedSubject: 'Science',
  assignedClasses: [
    'Sparkle',
    'Twinkle',
    'Topaz',
    'Jade',
    'Garnet',
    'Emerald',
    'Ruby',
    'Diamond',
  ],
  classTeacherOf: null,
  assignments: [
    { section: 'Sparkle', subject: 'Science' },
    { section: 'Twinkle', subject: 'Science' },
    { section: 'Topaz', subject: 'Science' },
    { section: 'Jade', subject: 'Science' },
    { section: 'Garnet', subject: 'Science' },
    { section: 'Emerald', subject: 'Science' },
    { section: 'Ruby', subject: 'Science' },
    { section: 'Diamond', subject: 'Science' },
  ],
};

export function normalizeSubjectKey(subject: string): string {
  const trimmed = (subject || '').trim().toLowerCase();
  if (trimmed === 'mathematics' || trimmed === 'math') return 'maths';
  if (trimmed === 'cs') return 'computer science';
  if (trimmed === 'ss' || trimmed === 'sst') return 'social science';
  return trimmed;
}

export function subjectsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return normalizeSubjectKey(a) === normalizeSubjectKey(b);
}

export function sectionsMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export function normalizeClassTeacherValue(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (
    !trimmed ||
    trimmed === NOT_A_CLASS_TEACHER_VALUE ||
    trimmed.toLowerCase() === 'none' ||
    trimmed.toLowerCase() === 'not a class teacher' ||
    trimmed.toLowerCase() === 'null'
  ) {
    return null;
  }
  return trimmed;
}

export function normalizeTeacherProfile(
  input: {
    id?: string;
    name: string;
    username: string;
    assignedSubject: string;
    assignedClasses?: string[];
    classTeacherOf?: string | null;
    assignments?: TeacherClassSubjectAssignment[];
    createdAt?: number;
    updatedAt?: number;
  }
): TeacherProfile {
  const cleanUsername = (input.username || '').trim().toLowerCase();
  const cleanName = (input.name || '').trim() || cleanUsername;
  const cleanSubject = (input.assignedSubject || 'English').trim();
  const classTeacherOf = normalizeClassTeacherValue(input.classTeacherOf);

  const rawAssignedClasses = Array.isArray(input.assignedClasses)
    ? input.assignedClasses.map((c) => (typeof c === 'string' ? c.trim() : '')).filter(Boolean)
    : [];

  const rawAssignments = Array.isArray(input.assignments)
    ? input.assignments
        .filter(
          (a) =>
            a &&
            typeof a.section === 'string' &&
            a.section.trim() !== '' &&
            typeof a.subject === 'string' &&
            a.subject.trim() !== ''
        )
        .map((a) => ({
          section: a.section.trim(),
          subject: a.subject.trim(),
        }))
    : [];

  // Synchronize assignedClasses and assignments:
  // If assignedClasses is provided, ensure every class in assignedClasses is mapped to cleanSubject
  const assignmentMap = new Map<string, TeacherClassSubjectAssignment>();

  for (const cls of rawAssignedClasses) {
    const key = `${cls.toLowerCase()}::${normalizeSubjectKey(cleanSubject)}`;
    assignmentMap.set(key, { section: cls, subject: cleanSubject });
  }

  for (const assign of rawAssignments) {
    // Only keep assignments if rawAssignedClasses was empty OR if it matches rawAssignedClasses
    if (rawAssignedClasses.length === 0) {
      const key = `${assign.section.toLowerCase()}::${normalizeSubjectKey(assign.subject)}`;
      assignmentMap.set(key, assign);
    }
  }

  const normalizedAssignments = Array.from(assignmentMap.values());
  const derivedClasses = Array.from(
    new Set(
      normalizedAssignments
        .filter((a) => subjectsMatch(a.subject, cleanSubject))
        .map((a) => a.section)
    )
  );

  return {
    id: input.id || `teacher-${cleanUsername}`,
    name: cleanName,
    username: cleanUsername,
    assignedSubject: cleanSubject,
    assignedClasses: derivedClasses,
    classTeacherOf,
    assignments: normalizedAssignments,
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
  };
}

export function isClassTeacherForSection(
  section: string,
  role: 'admin' | 'teacher',
  profile?: TeacherProfile | null
): boolean {
  if (role !== 'teacher' || !profile || !profile.classTeacherOf || !section || section === 'all') {
    return false;
  }
  return sectionsMatch(profile.classTeacherOf, section);
}

export function getMappedSubjectsForSection(
  section: string,
  profile?: TeacherProfile | null
): string[] {
  if (!profile || !section || section === 'all') return [];
  const matched = new Set<string>();

  if (Array.isArray(profile.assignments)) {
    for (const a of profile.assignments) {
      if (sectionsMatch(a.section, section) && a.subject) {
        matched.add(a.subject);
      }
    }
  }

  if (
    Array.isArray(profile.assignedClasses) &&
    profile.assignedSubject &&
    profile.assignedClasses.some((c) => sectionsMatch(c, section))
  ) {
    matched.add(profile.assignedSubject);
  }

  return Array.from(matched);
}

/**
 * Returns the list of class sections visible to the current user.
 * - Admin sees all classes.
 * - A teacher ONLY sees classes where they are mapped for their subject OR assigned as Class Teacher.
 * - Unmapped classes are completely hidden from other teachers.
 */
export function getVisibleSectionsForUser(
  allSections: string[],
  role: 'admin' | 'teacher',
  profile?: TeacherProfile | null
): string[] {
  if (role === 'admin') {
    return allSections;
  }
  if (!profile) {
    return [];
  }
  return allSections.filter((sec) => {
    const hasSubjectMapping = getMappedSubjectsForSection(sec, profile).length > 0;
    const isClassTeacher = isClassTeacherForSection(sec, 'teacher', profile);
    return hasSubjectMapping || isClassTeacher;
  });
}

/**
 * Returns the list of subject names visible to the user in a given class section.
 * - Admin sees all subjects.
 * - Class Teacher of `section` sees ALL subjects in `section` (view-only for unmapped subjects).
 * - Subject Teacher (not Class Teacher of `section`) sees ONLY their mapped subject(s) in `section`.
 */
export function getVisibleSubjectsForClass(
  allSubjectNames: string[],
  section: string,
  role: 'admin' | 'teacher',
  profile?: TeacherProfile | null
): string[] {
  if (role === 'admin') {
    return allSubjectNames;
  }
  if (!profile || !section || section === 'all') {
    return [];
  }
  if (isClassTeacherForSection(section, 'teacher', profile)) {
    return allSubjectNames;
  }
  const mappedSubjects = getMappedSubjectsForSection(section, profile);
  return allSubjectNames.filter((subName) =>
    mappedSubjects.some((mapped) => subjectsMatch(mapped, subName))
  );
}

/**
 * Returns the list of subject names that the user is allowed to EDIT (marks & subject remarks) in `section`.
 * - Admin can edit all subjects.
 * - Teacher can ONLY edit subjects explicitly mapped to them in `section` (even if they are Class Teacher of `section`).
 * - Class Teacher has strictly view-only access ("just see, no modification") for all unmapped subjects in their class.
 */
export function getEditableSubjectsForClass(
  allSubjectNames: string[],
  section: string,
  role: 'admin' | 'teacher',
  profile?: TeacherProfile | null
): string[] {
  if (role === 'admin') {
    return allSubjectNames;
  }
  if (!profile || !section || section === 'all') {
    return [];
  }
  const mappedSubjects = getMappedSubjectsForSection(section, profile);
  return allSubjectNames.filter((subName) =>
    mappedSubjects.some((mapped) => subjectsMatch(mapped, subName))
  );
}

/**
 * Checks whether the current user can modify marks or subject remarks for `(section, subjectName)`.
 */
export function canUserEditSubjectInClass(
  section: string,
  subjectName: string,
  role: 'admin' | 'teacher',
  profile?: TeacherProfile | null
): boolean {
  if (role === 'admin') return true;
  if (!profile || !section || !subjectName || section === 'all') return false;
  const mappedSubjects = getMappedSubjectsForSection(section, profile);
  return mappedSubjects.some((mapped) => subjectsMatch(mapped, subjectName));
}

/**
 * Checks whether the current user can view a given class section.
 */
export function canUserViewSection(
  section: string,
  role: 'admin' | 'teacher',
  profile?: TeacherProfile | null
): boolean {
  if (role === 'admin') return true;
  if (!profile || !section || section === 'all') return false;
  return (
    getMappedSubjectsForSection(section, profile).length > 0 ||
    isClassTeacherForSection(section, 'teacher', profile)
  );
}

export function renameSectionInTeacherProfile(
  profile: TeacherProfile,
  oldSection: string,
  newSection: string
): TeacherProfile {
  const cleanOld = (oldSection || '').trim();
  const cleanNew = (newSection || '').trim();
  if (!cleanOld || !cleanNew || sectionsMatch(cleanOld, cleanNew)) {
    return profile;
  }

  let changed = false;
  const nextAssignedClasses: string[] = [];
  const seenClasses = new Set<string>();
  for (const cls of profile.assignedClasses || []) {
    const mapped = sectionsMatch(cls, cleanOld) ? cleanNew : cls;
    if (mapped !== cls) changed = true;
    const key = mapped.toLowerCase();
    if (!seenClasses.has(key)) {
      seenClasses.add(key);
      nextAssignedClasses.push(mapped);
    }
  }

  const nextAssignments: TeacherClassSubjectAssignment[] = [];
  const seenAssign = new Set<string>();
  for (const assign of profile.assignments || []) {
    const mappedSection = sectionsMatch(assign.section, cleanOld) ? cleanNew : assign.section;
    if (mappedSection !== assign.section) changed = true;
    const key = `${mappedSection.toLowerCase()}::${normalizeSubjectKey(assign.subject)}`;
    if (!seenAssign.has(key)) {
      seenAssign.add(key);
      nextAssignments.push({
        section: mappedSection,
        subject: assign.subject,
      });
    }
  }

  let nextClassTeacherOf = profile.classTeacherOf;
  if (profile.classTeacherOf && sectionsMatch(profile.classTeacherOf, cleanOld)) {
    nextClassTeacherOf = cleanNew;
    changed = true;
  }

  if (!changed) return profile;

  return {
    ...profile,
    assignedClasses: nextAssignedClasses,
    assignments: nextAssignments,
    classTeacherOf: nextClassTeacherOf,
    updatedAt: Date.now(),
  };
}

export function removeSectionFromTeacherProfile(
  profile: TeacherProfile,
  sectionToRemove: string
): TeacherProfile {
  const cleanTarget = (sectionToRemove || '').trim();
  if (!cleanTarget) return profile;

  const nextAssignedClasses = (profile.assignedClasses || []).filter(
    (cls) => !sectionsMatch(cls, cleanTarget)
  );
  const nextAssignments = (profile.assignments || []).filter(
    (assign) => !sectionsMatch(assign.section, cleanTarget)
  );
  const nextClassTeacherOf =
    profile.classTeacherOf && sectionsMatch(profile.classTeacherOf, cleanTarget)
      ? null
      : profile.classTeacherOf;

  const changed =
    nextAssignedClasses.length !== (profile.assignedClasses || []).length ||
    nextAssignments.length !== (profile.assignments || []).length ||
    nextClassTeacherOf !== profile.classTeacherOf;

  if (!changed) return profile;

  return {
    ...profile,
    assignedClasses: nextAssignedClasses,
    assignments: nextAssignments,
    classTeacherOf: nextClassTeacherOf,
    updatedAt: Date.now(),
  };
}

export function renameSubjectInTeacherProfile(
  profile: TeacherProfile,
  oldSubject: string,
  newSubject: string
): TeacherProfile {
  const cleanOld = (oldSubject || '').trim();
  const cleanNew = (newSubject || '').trim();
  if (!cleanOld || !cleanNew || cleanOld.toLowerCase() === cleanNew.toLowerCase()) {
    return profile;
  }

  let changed = false;
  let nextAssignedSubject = profile.assignedSubject;
  if (profile.assignedSubject.trim().toLowerCase() === cleanOld.toLowerCase()) {
    nextAssignedSubject = cleanNew;
    changed = true;
  }

  const nextAssignments: TeacherClassSubjectAssignment[] = [];
  const seenAssign = new Set<string>();
  for (const assign of profile.assignments || []) {
    const mappedSubject =
      assign.subject.trim().toLowerCase() === cleanOld.toLowerCase()
        ? cleanNew
        : assign.subject;
    if (mappedSubject !== assign.subject) changed = true;
    const key = `${assign.section.toLowerCase()}::${normalizeSubjectKey(mappedSubject)}`;
    if (!seenAssign.has(key)) {
      seenAssign.add(key);
      nextAssignments.push({
        section: assign.section,
        subject: mappedSubject,
      });
    }
  }

  if (!changed) return profile;

  return {
    ...profile,
    assignedSubject: nextAssignedSubject,
    assignments: nextAssignments,
    updatedAt: Date.now(),
  };
}

export interface StudentMarksShape {
  id: string;
  section: string;
  marks: Record<string, number | 'AB' | null>;
  breakdowns?: Record<string, Record<string, number | 'AB' | null | undefined>>;
}

/**
 * Ensures client-side bulk imports / pastes never mutate marks or breakdowns
 * for subjects/classes that the active teacher is not permitted to edit.
 */
export function filterImportedStudentsForRole<T extends StudentMarksShape>(params: {
  previousStudents: T[];
  candidateStudents: T[];
  role: 'admin' | 'teacher';
  teacherProfile?: TeacherProfile | null;
}): { students: T[]; appliedMarkUpdates: number; blockedUpdates: number } {
  const { previousStudents, candidateStudents, role, teacherProfile } = params;
  if (role === 'admin') {
    return {
      students: candidateStudents,
      appliedMarkUpdates: candidateStudents.length,
      blockedUpdates: 0,
    };
  }

  const candidateMap = new Map<string, T>();
  for (const stu of candidateStudents) {
    candidateMap.set(stu.id, stu);
  }

  let appliedMarkUpdates = 0;
  let blockedUpdates = 0;

  const students = previousStudents.map((prevStu) => {
    const incoming = candidateMap.get(prevStu.id);
    if (!incoming) return prevStu;

    const nextMarks: Record<string, number | 'AB' | null> = { ...prevStu.marks };
    const nextBreakdowns = prevStu.breakdowns ? { ...prevStu.breakdowns } : {};
    let rowChanged = false;

    const allSubjects = new Set([
      ...Object.keys(prevStu.marks || {}),
      ...Object.keys(incoming.marks || {}),
      ...Object.keys(prevStu.breakdowns || {}),
      ...Object.keys(incoming.breakdowns || {}),
    ]);

    for (const subName of allSubjects) {
      const incomingMark = incoming.marks?.[subName];
      const prevMark = prevStu.marks?.[subName];
      const incomingBd = incoming.breakdowns?.[subName];
      const prevBd = prevStu.breakdowns?.[subName];

      const markChanged = incomingMark !== prevMark;
      const bdChanged = JSON.stringify(incomingBd ?? null) !== JSON.stringify(prevBd ?? null);
      if (!markChanged && !bdChanged) continue;

      if (!canUserEditSubjectInClass(prevStu.section, subName, 'teacher', teacherProfile)) {
        blockedUpdates++;
        continue;
      }

      if (markChanged) {
        nextMarks[subName] = incomingMark ?? null;
        rowChanged = true;
      }
      if (bdChanged) {
        if (incomingBd) {
          nextBreakdowns[subName] = incomingBd;
        } else {
          delete nextBreakdowns[subName];
        }
        rowChanged = true;
      }
      appliedMarkUpdates++;
    }

    if (!rowChanged) return prevStu;
    return {
      ...prevStu,
      marks: nextMarks,
      breakdowns: Object.keys(nextBreakdowns).length > 0 ? nextBreakdowns : prevStu.breakdowns,
    };
  });

  return { students, appliedMarkUpdates, blockedUpdates };
}

/**
 * Resolves the initial class section for a teacher session:
 * 1. Keeps candidateSection if the teacher can edit at least one subject in it.
 * 2. Otherwise prefers the first section where the teacher has editable mapped subjects.
 * 3. Otherwise keeps candidateSection if viewable (Class Teacher view-only).
 * 4. Otherwise falls back to the first viewable section, or '__NONE__' if unmapped.
 */
export function resolveInitialTeacherSection(
  allSections: string[],
  candidateSection: string | null | undefined,
  profile: TeacherProfile | null | undefined,
  subjectNames: string[]
): string {
  const visible = getVisibleSectionsForUser(allSections, 'teacher', profile);
  if (visible.length === 0) return '__NONE__';

  const editable = visible.filter(
    (sec) => getEditableSubjectsForClass(subjectNames, sec, 'teacher', profile).length > 0
  );

  if (candidateSection && candidateSection !== 'all') {
    const matchingEditable = editable.find((sec) => sectionsMatch(sec, candidateSection));
    if (matchingEditable) return matchingEditable;
  }

  if (editable.length > 0) {
    return editable[0];
  }

  if (candidateSection && candidateSection !== 'all') {
    const matchingVisible = visible.find((sec) => sectionsMatch(sec, candidateSection));
    if (matchingVisible) return matchingVisible;
  }

  return visible[0];
}

/**
 * Computes default subject, remark, and export scopes for a teacher in a given class section.
 * - Class Teacher division -> defaults to 'all' / 'all_consolidated' (all-subject view).
 * - Subject Teacher division -> defaults to their first mapped visible subject name.
 */
export function getDefaultTeacherScopesForSection(params: {
  section: string;
  profile?: TeacherProfile | null;
  visibleSubjectNames: string[];
}): {
  selectedSubject: string;
  internalActiveSubject: string;
  selectedRemarkScope: string;
  exportSubjectScope: string;
} {
  const { section, profile, visibleSubjectNames } = params;
  const firstSub = visibleSubjectNames[0] || '';
  const isCt = isClassTeacherForSection(section, 'teacher', profile);

  if (isCt) {
    return {
      selectedSubject: 'all',
      internalActiveSubject: firstSub,
      selectedRemarkScope: 'all',
      exportSubjectScope: 'all_consolidated',
    };
  }

  return {
    selectedSubject: firstSub,
    internalActiveSubject: firstSub,
    selectedRemarkScope: firstSub,
    exportSubjectScope: firstSub,
  };
}
