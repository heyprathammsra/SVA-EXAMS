'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Edit2,
  Eye,
  EyeOff,
  Layers,
  Plus,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import CustomSelect from './CustomSelect';
import { ClassDefinition } from '@/lib/report-card-types';
import { formatClassGradeShortLabel } from '@/lib/erp-persistence';
import { getAdminAuthHeaders } from '@/lib/auth-client';
import {
  DEFAULT_TEACHER_PRATHAM_PROFILE,
  NOT_A_CLASS_TEACHER_VALUE,
  TeacherProfile,
} from '@/lib/teacher-permissions';

interface TeacherAccessManagerProps {
  classes: ClassDefinition[];
  subjects: string[];
  showToast?: (msg: string) => void;
}

const DEFAULT_SUBJECT_LIST = [
  'English',
  'Hindi',
  'Marathi',
  'Maths',
  'Science',
  'Social Science',
  'Computer Science',
];

export default function TeacherAccessManager({
  classes,
  subjects,
  showToast,
}: TeacherAccessManagerProps) {
  const subjectOptions = useMemo(() => {
    const merged = Array.from(new Set([...DEFAULT_SUBJECT_LIST, ...subjects])).filter(Boolean);
    return merged.length > 0 ? merged : DEFAULT_SUBJECT_LIST;
  }, [subjects]);

  const [teachers, setTeachers] = useState<TeacherProfile[]>([
    DEFAULT_TEACHER_PRATHAM_PROFILE,
  ]);
  const [selectedUsername, setSelectedUsername] = useState<string>(
    DEFAULT_TEACHER_PRATHAM_PROFILE.username
  );
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Create / Edit User Modal state
  const [userModalMode, setUserModalMode] = useState<'create' | 'edit' | null>(null);
  const [editingTeacherId, setEditingTeacherId] = useState<string | undefined>(undefined);
  const [nameInput, setNameInput] = useState<string>('');
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [passwordInput, setPasswordInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [subjectInput, setSubjectInput] = useState<string>('Science');
  const [assignedClassesInput, setAssignedClassesInput] = useState<string[]>([]);
  const [classTeacherInput, setClassTeacherInput] = useState<string>(
    NOT_A_CLASS_TEACHER_VALUE
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Dedicated "Map Teacher with Assigned Classes (Just Their Subject)" Modal state
  const [isMapModalOpen, setIsMapModalOpen] = useState<boolean>(false);
  const [mapTargetUsername, setMapTargetUsername] = useState<string>('');
  const [mapSubject, setMapSubject] = useState<string>('Science');
  const [mapClasses, setMapClasses] = useState<string[]>([]);
  const [mapClassTeacher, setMapClassTeacher] = useState<string>(NOT_A_CLASS_TEACHER_VALUE);
  const [mapError, setMapError] = useState<string | null>(null);

  // Delete confirmation modal state
  const [confirmDeleteTeacher, setConfirmDeleteTeacher] = useState<TeacherProfile | null>(
    null
  );

  const fetchTeachers = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/users', {
        cache: 'no-store',
        headers: { ...getAdminAuthHeaders() },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.teachers) && data.teachers.length > 0) {
          setTeachers(data.teachers);
          setSelectedUsername((prev) =>
            data.teachers.some((t: TeacherProfile) => t.username === prev)
              ? prev
              : data.teachers[0].username
          );
        }
      }
    } catch {
      // Keep fallback seed state
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/users', {
          cache: 'no-store',
          headers: { ...getAdminAuthHeaders() },
        });
        if (!active || !res.ok) return;
        const data = await res.json();
        if (active && Array.isArray(data?.teachers) && data.teachers.length > 0) {
          setTeachers(data.teachers);
          setSelectedUsername((prev) =>
            data.teachers.some((t: TeacherProfile) => t.username === prev)
              ? prev
              : data.teachers[0].username
          );
        }
      } catch {
        // Keep fallback seed state
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const activeTeacher = useMemo(
    () =>
      teachers.find((t) => t.username === selectedUsername) ||
      teachers[0] ||
      DEFAULT_TEACHER_PRATHAM_PROFILE,
    [teachers, selectedUsername]
  );

  const classTeacherSelectOptions = useMemo(
    () => [
      { value: NOT_A_CLASS_TEACHER_VALUE, label: 'Not a Class Teacher' },
      ...classes.map((cls) => ({
        value: cls.section,
        label: `Class Teacher · ${formatClassGradeShortLabel(classes, cls.section)}`,
      })),
    ],
    [classes]
  );

  const openCreateModal = () => {
    setUserModalMode('create');
    setEditingTeacherId(undefined);
    setNameInput('');
    setUsernameInput('');
    setPasswordInput('');
    setShowPassword(false);
    setSubjectInput(subjectOptions[0] || 'English');
    setAssignedClassesInput(classes[0] ? [classes[0].section] : []);
    setClassTeacherInput(NOT_A_CLASS_TEACHER_VALUE);
    setFormError(null);
  };

  const openEditModal = (teacher: TeacherProfile) => {
    setUserModalMode('edit');
    setEditingTeacherId(teacher.id);
    setNameInput(teacher.name);
    setUsernameInput(teacher.username);
    setPasswordInput('');
    setShowPassword(false);
    setSubjectInput(teacher.assignedSubject || subjectOptions[0] || 'Science');
    setAssignedClassesInput(teacher.assignedClasses || []);
    setClassTeacherInput(teacher.classTeacherOf || NOT_A_CLASS_TEACHER_VALUE);
    setFormError(null);
  };

  const openMapModalForTeacher = (teacher: TeacherProfile) => {
    setMapTargetUsername(teacher.username);
    setMapSubject(teacher.assignedSubject || subjectOptions[0] || 'Science');
    setMapClasses(teacher.assignedClasses || []);
    setMapClassTeacher(teacher.classTeacherOf || NOT_A_CLASS_TEACHER_VALUE);
    setMapError(null);
    setIsMapModalOpen(true);
  };

  const handleSwitchMapTargetTeacher = (username: string) => {
    setMapTargetUsername(username);
    const target = teachers.find((t) => t.username === username);
    if (target) {
      setMapSubject(target.assignedSubject || subjectOptions[0] || 'Science');
      setMapClasses(target.assignedClasses || []);
      setMapClassTeacher(target.classTeacherOf || NOT_A_CLASS_TEACHER_VALUE);
      setMapError(null);
    }
  };

  const toggleClassInList = (
    section: string,
    list: string[],
    setter: React.Dispatch<React.SetStateAction<string[]>>
  ) => {
    if (list.some((c) => c.toLowerCase() === section.toLowerCase())) {
      setter(list.filter((c) => c.toLowerCase() !== section.toLowerCase()));
    } else {
      setter([...list, section]);
    }
  };

  const handleSaveUserForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const cleanName = nameInput.trim();
    const cleanUsername = usernameInput.trim().toLowerCase();
    const cleanPass = passwordInput.trim();
    const resolvedClassTeacher =
      classTeacherInput === NOT_A_CLASS_TEACHER_VALUE ? null : classTeacherInput;

    if (!cleanName) {
      setFormError('Please enter the teacher name.');
      return;
    }
    if (!cleanUsername) {
      setFormError('Please enter a username.');
      return;
    }
    if (userModalMode === 'create' && !cleanPass) {
      setFormError('Please enter a password for the new user.');
      return;
    }
    if (assignedClassesInput.length === 0 && !resolvedClassTeacher) {
      setFormError('Assign at least one class for their subject or select a Class Teacher class.');
      return;
    }

    setIsSaving(true);
    setFormError(null);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({
          id: editingTeacherId,
          name: cleanName,
          username: cleanUsername,
          password: cleanPass || undefined,
          assignedSubject: subjectInput,
          assignedClasses: assignedClassesInput,
          classTeacherOf: resolvedClassTeacher,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        setFormError(payload?.error || 'Could not save teacher user.');
        setIsSaving(false);
        return;
      }

      if (Array.isArray(payload.teachers)) {
        setTeachers(payload.teachers);
      }
      if (payload.teacher?.username) {
        setSelectedUsername(payload.teacher.username);
      }
      setUserModalMode(null);
      setIsSaving(false);
      showToast?.(
        userModalMode === 'create'
          ? `Created user ${cleanName} (@${cleanUsername})`
          : `Updated user ${cleanName} (@${cleanUsername})`
      );
    } catch {
      setFormError('Network error while saving teacher user.');
      setIsSaving(false);
    }
  };

  const handleSaveClassMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;

    const targetTeacher = teachers.find((t) => t.username === mapTargetUsername);
    if (!targetTeacher) {
      setMapError('Please select a teacher.');
      return;
    }

    const resolvedClassTeacher =
      mapClassTeacher === NOT_A_CLASS_TEACHER_VALUE ? null : mapClassTeacher;

    if (mapClasses.length === 0 && !resolvedClassTeacher) {
      setMapError('Select at least one class for their subject or assign as Class Teacher.');
      return;
    }

    setIsSaving(true);
    setMapError(null);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({
          id: targetTeacher.id,
          name: targetTeacher.name,
          username: targetTeacher.username,
          assignedSubject: mapSubject,
          assignedClasses: mapClasses,
          classTeacherOf: resolvedClassTeacher,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        setMapError(payload?.error || 'Could not update class mapping.');
        setIsSaving(false);
        return;
      }

      if (Array.isArray(payload.teachers)) {
        setTeachers(payload.teachers);
      }
      setSelectedUsername(targetTeacher.username);
      setIsMapModalOpen(false);
      setIsSaving(false);
      showToast?.(
        `Mapped ${targetTeacher.name} (${mapSubject}) to ${mapClasses.length} class${
          mapClasses.length === 1 ? '' : 'es'
        }`
      );
    } catch {
      setMapError('Network error while updating class mapping.');
      setIsSaving(false);
    }
  };

  const handleDeleteTeacherConfirm = async () => {
    if (!confirmDeleteTeacher || isSaving) return;
    setIsSaving(true);
    try {
      const res = await fetch(
        `/api/users?username=${encodeURIComponent(confirmDeleteTeacher.username)}`,
        {
          method: 'DELETE',
          headers: { ...getAdminAuthHeaders() },
        }
      );
      const payload = await res.json().catch(() => null);
      if (res.ok && Array.isArray(payload?.teachers)) {
        setTeachers(payload.teachers);
        if (selectedUsername === confirmDeleteTeacher.username && payload.teachers[0]) {
          setSelectedUsername(payload.teachers[0].username);
        }
        showToast?.(`Removed teacher user ${confirmDeleteTeacher.name}`);
      }
    } catch {
      showToast?.('Could not delete teacher user');
    } finally {
      setIsSaving(false);
      setConfirmDeleteTeacher(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200/85 rounded-2xl px-4 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        {/* Left: Compact Section Identity & Active Teacher Summary */}
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <Users className="w-4 h-4 text-blue-600 shrink-0" />
          <h2 className="text-xs sm:text-sm font-semibold text-slate-900 tracking-tight">
            Teachers &amp; Class Mapping
          </h2>
          <span className="text-xs font-mono text-slate-400">
            {isLoading ? '...' : teachers.length}
          </span>
          {activeTeacher && (
            <>
              <span className="text-slate-200">·</span>
              <span className="text-xs text-slate-600 font-medium truncate">
                {activeTeacher.assignedSubject} (
                {activeTeacher.assignedClasses.length > 0
                  ? activeTeacher.assignedClasses
                      .map((sec) => formatClassGradeShortLabel(classes, sec))
                      .join(', ')
                  : 'No subject classes'}
                )
              </span>
              <span className="text-slate-200">·</span>
              <span className="text-xs text-slate-500">
                {activeTeacher.classTeacherOf
                  ? `Class Teacher: ${formatClassGradeShortLabel(
                      classes,
                      activeTeacher.classTeacherOf
                    )}`
                  : 'Not a Class Teacher'}
              </span>
            </>
          )}
        </div>

        {/* Right: Teacher Selector + Map Classes + Edit/Delete + Create User */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Teacher Selector Dropdown */}
          <div className="min-w-[200px]">
            <CustomSelect
              id="settings-teacher-select"
              fullWidth
              value={activeTeacher?.username || ''}
              onChange={(val) => setSelectedUsername(val)}
              options={teachers.map((t) => ({
                value: t.username,
                label: `${t.name} (@${t.username}) · ${t.assignedSubject}`,
              }))}
            />
          </div>

          {/* Map Teacher with Assigned Classes (Just Their Subject) */}
          {activeTeacher && (
            <button
              type="button"
              data-testid="open-map-teacher-classes-btn"
              onClick={() => openMapModalForTeacher(activeTeacher)}
              className="px-3 py-1.5 text-xs font-semibold text-blue-700 hover:text-blue-800 bg-blue-50/70 hover:bg-blue-100/80 border border-blue-200/80 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Layers className="w-3.5 h-3.5 text-blue-600" />
              <span>Map Classes</span>
            </button>
          )}

          {/* Edit Selected Teacher */}
          {activeTeacher && (
            <button
              type="button"
              onClick={() => openEditModal(activeTeacher)}
              title={`Edit ${activeTeacher.name}`}
              aria-label={`Edit ${activeTeacher.name}`}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Delete Selected Teacher (if more than 1 teacher exists) */}
          {activeTeacher && teachers.length > 1 && (
            <button
              type="button"
              onClick={() => setConfirmDeleteTeacher(activeTeacher)}
              title={`Delete ${activeTeacher.name}`}
              aria-label={`Delete ${activeTeacher.name}`}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          <div className="hidden sm:block w-px h-4 bg-slate-200 mx-0.5" />

          {/* Create New User Button */}
          <button
            type="button"
            data-testid="open-create-teacher-btn"
            onClick={openCreateModal}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {/* ========================================================================
          MODAL 1: CREATE NEW USER / EDIT TEACHER USER
         ======================================================================== */}
      {userModalMode && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setUserModalMode(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {userModalMode === 'create' ? 'Create New Teacher User' : 'Edit Teacher User'}
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Teachers can only see and edit marks/remarks for their mapped classes and subject. Class teachers can view all subjects in their class (view-only).
                </p>
              </div>
              <button
                type="button"
                onClick={() => setUserModalMode(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUserForm} className="space-y-3.5">
              {/* Row 1: Name + Username */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="teacher-name-input"
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    Teacher Name
                  </label>
                  <input
                    id="teacher-name-input"
                    type="text"
                    value={nameInput}
                    onChange={(e) => {
                      setNameInput(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    placeholder="e.g. Anita Sharma"
                    autoFocus
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200/90 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                  />
                </div>

                <div>
                  <label
                    htmlFor="teacher-username-input"
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    Username
                  </label>
                  <input
                    id="teacher-username-input"
                    type="text"
                    value={usernameInput}
                    onChange={(e) => {
                      setUsernameInput(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    placeholder="e.g. anita"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200/90 rounded-lg text-slate-900 font-mono focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                  />
                </div>
              </div>

              {/* Row 2: Password + Assigned Subject */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="teacher-password-input"
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    {userModalMode === 'create' ? 'Password' : 'New Password (optional)'}
                  </label>
                  <div className="relative">
                    <input
                      id="teacher-password-input"
                      type={showPassword ? 'text' : 'password'}
                      value={passwordInput}
                      onChange={(e) => {
                        setPasswordInput(e.target.value);
                        if (formError) setFormError(null);
                      }}
                      placeholder={
                        userModalMode === 'create'
                          ? 'Enter password'
                          : 'Leave blank to keep current'
                      }
                      className="w-full pl-3 pr-8 py-1.5 text-xs bg-white border border-slate-200/90 rounded-lg text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                    >
                      {showPassword ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Assigned Subject
                  </label>
                  <CustomSelect
                    id="teacher-subject-select"
                    fullWidth
                    value={subjectInput}
                    onChange={(val) => setSubjectInput(val)}
                    options={subjectOptions.map((sub) => ({
                      value: sub,
                      label: sub,
                    }))}
                  />
                </div>
              </div>

              {/* Row 3: Class Teacher Option (with explicit "Not a Class Teacher" option) */}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Class Teacher (View-Only Access to All Subjects of Selected Class)
                </label>
                <CustomSelect
                  id="teacher-classteacher-select"
                  fullWidth
                  value={classTeacherInput}
                  onChange={(val) => setClassTeacherInput(val)}
                  options={classTeacherSelectOptions}
                />
              </div>

              {/* Row 4: Assigned Classes Mapped to Subject */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-medium text-slate-600">
                    Assigned Classes for <span className="font-semibold text-slate-900">{subjectInput}</span> (Can Fill &amp; Edit Marks/Remarks)
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setAssignedClassesInput(classes.map((c) => c.section))}
                      className="text-blue-600 hover:underline font-medium cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => setAssignedClassesInput([])}
                      className="text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
                  {classes.map((cls) => {
                    const checked = assignedClassesInput.some(
                      (c) => c.toLowerCase() === cls.section.toLowerCase()
                    );
                    const label = formatClassGradeShortLabel(classes, cls.section);
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        data-testid={`create-user-class-${cls.section}`}
                        onClick={() =>
                          toggleClassInList(
                            cls.section,
                            assignedClassesInput,
                            setAssignedClassesInput
                          )
                        }
                        className={`flex items-center justify-between px-2.5 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                          checked
                            ? 'bg-blue-50/90 border-blue-500 text-blue-900 shadow-2xs'
                            : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{label}</span>
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                            checked
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 stroke-[2.5]" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {formError && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200/80 rounded-lg px-2.5 py-1.5">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUserModalMode(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="submit-teacher-user-btn"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg shadow-2xs cursor-pointer"
                >
                  {isSaving
                    ? 'Saving...'
                    : userModalMode === 'create'
                    ? 'Create User'
                    : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 2: MAP TEACHER WITH ASSIGNED CLASSES (JUST THEIR SUBJECT)
         ======================================================================== */}
      {isMapModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMapModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Map Teacher with Assigned Classes
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Assign which classes this teacher teaches for their subject. They will only see and fill marks &amp; remarks for their mapped classes and subject.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsMapModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClassMapping} className="space-y-3.5">
              {/* Row 1: Select Teacher + Their Subject */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Teacher
                  </label>
                  <CustomSelect
                    id="map-teacher-select"
                    fullWidth
                    value={mapTargetUsername}
                    onChange={(val) => handleSwitchMapTargetTeacher(val)}
                    options={teachers.map((t) => ({
                      value: t.username,
                      label: `${t.name} (@${t.username})`,
                    }))}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Assigned Subject (Just Their Subject)
                  </label>
                  <CustomSelect
                    id="map-subject-select"
                    fullWidth
                    value={mapSubject}
                    onChange={(val) => setMapSubject(val)}
                    options={subjectOptions.map((sub) => ({
                      value: sub,
                      label: sub,
                    }))}
                  />
                </div>
              </div>

              {/* Row 2: Mapped Classes Checkboxes */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-medium text-slate-600">
                    Mapped Classes for <span className="font-semibold text-slate-900">{mapSubject}</span>
                  </label>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setMapClasses(classes.map((c) => c.section))}
                      className="text-blue-600 hover:underline font-medium cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => setMapClasses([])}
                      className="text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-0.5">
                  {classes.map((cls) => {
                    const checked = mapClasses.some(
                      (c) => c.toLowerCase() === cls.section.toLowerCase()
                    );
                    const label = formatClassGradeShortLabel(classes, cls.section);
                    return (
                      <button
                        key={cls.id}
                        type="button"
                        data-testid={`map-class-toggle-${cls.section}`}
                        onClick={() =>
                          toggleClassInList(cls.section, mapClasses, setMapClasses)
                        }
                        className={`flex items-center justify-between px-2.5 py-2 rounded-xl border text-xs font-medium transition-all cursor-pointer ${
                          checked
                            ? 'bg-blue-50/90 border-blue-500 text-blue-900 shadow-2xs'
                            : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="truncate">{label}</span>
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                            checked
                              ? 'bg-blue-600 border-blue-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3 stroke-[2.5]" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 3: Class Teacher Option */}
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Class Teacher Assignment
                </label>
                <CustomSelect
                  id="map-classteacher-select"
                  fullWidth
                  value={mapClassTeacher}
                  onChange={(val) => setMapClassTeacher(val)}
                  options={classTeacherSelectOptions}
                />
              </div>

              {mapError && (
                <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200/80 rounded-lg px-2.5 py-1.5">
                  {mapError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMapModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-class-mapping-btn"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg shadow-2xs cursor-pointer"
                >
                  {isSaving ? 'Saving...' : 'Save Mapping'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================
          MODAL 3: DELETE TEACHER CONFIRMATION
         ======================================================================== */}
      {confirmDeleteTeacher && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setConfirmDeleteTeacher(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Remove Teacher User</h3>
              <button
                type="button"
                onClick={() => setConfirmDeleteTeacher(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Remove user{' '}
              <strong className="text-slate-900">{confirmDeleteTeacher.name}</strong> (@
              {confirmDeleteTeacher.username})? They will no longer be able to sign in.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setConfirmDeleteTeacher(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteTeacherConfirm}
                disabled={isSaving}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-2xs cursor-pointer"
              >
                Remove User
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
