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
