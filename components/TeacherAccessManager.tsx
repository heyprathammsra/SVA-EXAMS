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

const MODAL_SELECT_CONTAINER_CLASS =
  'flex items-center justify-between gap-2 w-full h-9 bg-slate-50/70 hover:bg-slate-50 focus-within:bg-white border border-slate-200/90 hover:border-slate-300 focus-within:border-blue-600 focus-within:ring-2 focus-within:ring-blue-500/15 rounded-lg px-3 transition-all duration-150';

const MODAL_INPUT_CLASS =
  'w-full h-9 px-3 text-xs bg-slate-50/70 hover:bg-slate-50 focus:bg-white border border-slate-200/90 rounded-lg text-slate-900 placeholder:text-slate-400 transition-all duration-150 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-500/15';

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

  const teacherDropdownOptions = useMemo(
    () =>
      teachers.map((t) => ({
        value: t.username,
        label: `${t.name} (@${t.username}) · ${t.assignedSubject}`,
        meta: `${t.assignedClasses.length} ${
          t.assignedClasses.length === 1 ? 'class' : 'classes'
        }`,
      })),
    [teachers]
  );

  const activeTeacherSummary = useMemo(() => {
    if (!activeTeacher) return '';
    const count = activeTeacher.assignedClasses.length;
    const classSummary =
      count === 0
        ? 'No subject classes'
        : count <= 2
        ? activeTeacher.assignedClasses
            .map((sec) => formatClassGradeShortLabel(classes, sec))
            .join(', ')
        : `${count} classes`;
    const ctSummary = activeTeacher.classTeacherOf
      ? `CT: ${formatClassGradeShortLabel(classes, activeTeacher.classTeacherOf)}`
      : 'Not a Class Teacher';
    return `${activeTeacher.assignedSubject} (${classSummary}) · ${ctSummary}`;
  }, [activeTeacher, classes]);

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
    if (!cleanUsername || !/^[a-z0-9._-]{2,40}$/.test(cleanUsername)) {
      setFormError('Username must be 2–40 characters (letters, numbers, . _ -).');
      return;
    }
    if (cleanUsername === 'admin') {
      setFormError('Username "admin" is reserved.');
      return;
    }
    if (userModalMode === 'create' && cleanPass.length < 4) {
      setFormError('Password must be at least 4 characters.');
      return;
    }
    if (userModalMode === 'edit' && cleanPass.length > 0 && cleanPass.length < 4) {
      setFormError('New password must be at least 4 characters.');
      return;
    }
    if (assignedClassesInput.length === 0 && !resolvedClassTeacher) {
      setFormError(
        'Assign at least one class for their subject or select a Class Teacher class.'
      );
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
          ...(cleanPass ? { password: cleanPass } : {}),
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
      } else {
        await fetchTeachers();
      }
      setSelectedUsername(cleanUsername);
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
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 lg:gap-4">
        {/* Left + Center: Section Identity & Active Teacher Controls (Single-Line Rhythm matching Classes & Roster) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between lg:justify-start gap-2.5 lg:gap-3.5 min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 min-w-0 lg:shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-blue-50/90 border border-blue-100/80 text-blue-600 flex items-center justify-center shrink-0">
                <Users className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-baseline gap-1.5 min-w-0">
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-slate-900 whitespace-nowrap">
                  Teachers &amp; Class Mapping
                </h2>
                <span className="text-xs text-slate-300 shrink-0" aria-hidden="true">
                  ·
                </span>
                <span className="text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap">
                  {isLoading ? '...' : teachers.length}
                  <span className="hidden xl:inline">
                    {' '}
                    {teachers.length === 1 ? 'teacher' : 'teachers'}
                  </span>
                </span>
              </div>
            </div>

            {/* Mobile Quick Create Button */}
            <div className="flex lg:hidden items-center gap-1.5 shrink-0 ml-auto">
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-[0_1px_2px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.16)] transition-all duration-150 cursor-pointer whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Create User</span>
              </button>
            </div>
          </div>

          <span
            className="hidden lg:block h-5 w-px bg-slate-200/80 shrink-0"
            aria-hidden="true"
          />

          {/* Active Teacher Dropdown + Map Classes + Edit/Delete Group + Quiet Summary */}
          {activeTeacher && (
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 min-w-0 flex-1">
              <CustomSelect
                id="settings-teacher-select"
                value={activeTeacher.username}
                onChange={(val) => setSelectedUsername(val)}
                options={teacherDropdownOptions}
                matchTriggerWidth
                containerClassName="flex items-center justify-between gap-2 bg-slate-50/75 hover:bg-white border border-slate-200/90 hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 rounded-xl px-3 py-1.5 shadow-[0_1px_1px_rgba(15,23,42,0.02)] transition-all duration-150 w-full sm:w-[242px] min-w-0"
                triggerClassName="text-xs font-semibold text-slate-900 flex-1 min-w-0"
                renderFooter={(closeMenu) => (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeMenu();
                      openCreateModal();
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50/80 rounded-lg transition-colors cursor-pointer text-left"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Create new teacher</span>
                  </button>
                )}
              />

              <button
                type="button"
                data-testid="open-map-teacher-classes-btn"
                onClick={() => openMapModalForTeacher(activeTeacher)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>Map Classes</span>
              </button>

              <div className="inline-flex items-center bg-slate-50/85 border border-slate-200/80 rounded-xl p-0.5 ml-auto sm:ml-0 shrink-0">
                <button
                  type="button"
                  onClick={() => openEditModal(activeTeacher)}
                  title={`Edit ${activeTeacher.name}`}
                  aria-label={`Edit ${activeTeacher.name}`}
                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white hover:shadow-2xs rounded-lg transition-all duration-150 cursor-pointer shrink-0"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                {teachers.length > 1 && (
                  <>
                    <span
                      className="w-px h-3.5 bg-slate-200/80 mx-0.5"
                      aria-hidden="true"
                    />
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteTeacher(activeTeacher)}
                      title={`Delete ${activeTeacher.name}`}
                      aria-label={`Delete ${activeTeacher.name}`}
                      className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-white hover:shadow-2xs rounded-lg transition-all duration-150 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>

              <span
                title={activeTeacherSummary}
                className="hidden xl:inline-block text-xs text-slate-400 truncate min-w-0 max-w-[280px] pl-1"
              >
                {activeTeacherSummary}
              </span>
            </div>
          )}
        </div>

        {/* Right: Desktop Primary Action */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="open-create-teacher-btn"
            onClick={openCreateModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all duration-150 cursor-pointer shadow-[0_1px_2px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.16)] active:scale-[0.99] whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Create User</span>
          </button>
        </div>
      </div>

      {/* ========================================================================
          MODAL 1: CREATE NEW USER / EDIT TEACHER USER (Minimalist & Clean)
         ======================================================================== */}
      {userModalMode && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setUserModalMode(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_24px_60px_-15px_rgba(15,23,42,0.22)] w-full max-w-[440px] p-5 space-y-4 animate-in zoom-in-95 duration-150">
            {/* Minimal Header */}
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                {userModalMode === 'create' ? 'New Teacher User' : 'Edit Teacher User'}
              </h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setUserModalMode(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveUserForm} className="space-y-3.5 text-xs">
              {/* Row 1: Name + Username */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="teacher-name-input"
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    Name
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
                    className={MODAL_INPUT_CLASS}
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
                    className={`${MODAL_INPUT_CLASS} font-mono`}
                  />
                </div>
              </div>

              {/* Row 2: Password + Assigned Subject */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label
                    htmlFor="teacher-password-input"
                    className="block text-[11px] font-medium text-slate-600 mb-1"
                  >
                    {userModalMode === 'create' ? 'Password' : 'New Password'}
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
                        userModalMode === 'create' ? 'Enter password' : 'Unchanged'
                      }
                      className={`${MODAL_INPUT_CLASS} pr-8`}
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
                    Subject
                  </label>
                  <CustomSelect
                    id="teacher-subject-select"
                    fullWidth
                    matchTriggerWidth
                    containerClassName={MODAL_SELECT_CONTAINER_CLASS}
                    triggerClassName="text-xs font-medium text-slate-900 flex-1 min-w-0"
                    value={subjectInput}
                    onChange={(val) => setSubjectInput(val)}
                    options={subjectOptions.map((sub) => ({
                      value: sub,
                      label: sub,
                    }))}
                  />
                </div>
              </div>

              {/* Row 3: Class Teacher Option */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-slate-600">
                    Class Teacher
                  </label>
                  <span className="text-[11px] text-slate-400">
                    View-only all subjects
                  </span>
                </div>
                <CustomSelect
                  id="teacher-classteacher-select"
                  fullWidth
                  matchTriggerWidth
                  containerClassName={MODAL_SELECT_CONTAINER_CLASS}
                  triggerClassName="text-xs font-medium text-slate-900 flex-1 min-w-0"
                  value={classTeacherInput}
                  onChange={(val) => setClassTeacherInput(val)}
                  options={classTeacherSelectOptions}
                />
              </div>

              {/* Row 4: Sleek Assigned Classes Tile Grid */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[11px] font-medium text-slate-600">
                      Assigned Classes ({subjectInput})
                    </label>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      · {assignedClassesInput.length}/{classes.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setAssignedClassesInput(classes.map((c) => c.section))}
                      className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => setAssignedClassesInput([])}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-[168px] overflow-y-auto pr-0.5">
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
                        className={`h-8 px-2.5 rounded-lg border text-xs flex items-center justify-between gap-1.5 transition-all duration-120 cursor-pointer ${
                          checked
                            ? 'bg-blue-50/90 border-blue-500/90 text-blue-700 font-semibold shadow-[0_1px_2px_rgba(37,99,235,0.08)]'
                            : 'bg-slate-50/60 hover:bg-slate-100/75 border-slate-200/80 text-slate-600 hover:text-slate-900 font-medium'
                        }`}
                      >
                        <span className="truncate">{label}</span>
                        {checked && (
                          <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 stroke-[2.5]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {formError && (
                <p className="text-xs text-rose-600 bg-rose-50/90 border border-rose-200/80 rounded-lg px-2.5 py-1.5">
                  {formError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setUserModalMode(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="submit-teacher-user-btn"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg shadow-xs transition-colors cursor-pointer"
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
          MODAL 2: MAP TEACHER WITH ASSIGNED CLASSES (Minimalist & Clean)
         ======================================================================== */}
      {isMapModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsMapModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_24px_60px_-15px_rgba(15,23,42,0.22)] w-full max-w-[440px] p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900 tracking-tight">
                Map Teacher with Assigned Classes
              </h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setIsMapModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClassMapping} className="space-y-3.5 text-xs">
              {/* Row 1: Select Teacher + Subject */}
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Teacher
                  </label>
                  <CustomSelect
                    id="map-teacher-select"
                    fullWidth
                    matchTriggerWidth
                    containerClassName={MODAL_SELECT_CONTAINER_CLASS}
                    triggerClassName="text-xs font-medium text-slate-900 flex-1 min-w-0"
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
                    Assigned Subject
                  </label>
                  <CustomSelect
                    id="map-subject-select"
                    fullWidth
                    matchTriggerWidth
                    containerClassName={MODAL_SELECT_CONTAINER_CLASS}
                    triggerClassName="text-xs font-medium text-slate-900 flex-1 min-w-0"
                    value={mapSubject}
                    onChange={(val) => setMapSubject(val)}
                    options={subjectOptions.map((sub) => ({
                      value: sub,
                      label: sub,
                    }))}
                  />
                </div>
              </div>

              {/* Row 2: Mapped Classes Tile Grid */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <label className="text-[11px] font-medium text-slate-600">
                      Mapped Classes ({mapSubject})
                    </label>
                    <span className="text-[11px] text-slate-400 tabular-nums">
                      · {mapClasses.length}/{classes.length}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setMapClasses(classes.map((c) => c.section))}
                      className="text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
                    >
                      Select All
                    </button>
                    <span className="text-slate-300">·</span>
                    <button
                      type="button"
                      onClick={() => setMapClasses([])}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-[168px] overflow-y-auto pr-0.5">
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
                        className={`h-8 px-2.5 rounded-lg border text-xs flex items-center justify-between gap-1.5 transition-all duration-120 cursor-pointer ${
                          checked
                            ? 'bg-blue-50/90 border-blue-500/90 text-blue-700 font-semibold shadow-[0_1px_2px_rgba(37,99,235,0.08)]'
                            : 'bg-slate-50/60 hover:bg-slate-100/75 border-slate-200/80 text-slate-600 hover:text-slate-900 font-medium'
                        }`}
                      >
                        <span className="truncate">{label}</span>
                        {checked && (
                          <Check className="w-3.5 h-3.5 text-blue-600 shrink-0 stroke-[2.5]" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 3: Class Teacher Assignment */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-slate-600">
                    Class Teacher
                  </label>
                  <span className="text-[11px] text-slate-400">
                    View-only all subjects
                  </span>
                </div>
                <CustomSelect
                  id="map-classteacher-select"
                  fullWidth
                  matchTriggerWidth
                  containerClassName={MODAL_SELECT_CONTAINER_CLASS}
                  triggerClassName="text-xs font-medium text-slate-900 flex-1 min-w-0"
                  value={mapClassTeacher}
                  onChange={(val) => setMapClassTeacher(val)}
                  options={classTeacherSelectOptions}
                />
              </div>

              {mapError && (
                <p className="text-xs text-rose-600 bg-rose-50/90 border border-rose-200/80 rounded-lg px-2.5 py-1.5">
                  {mapError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsMapModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-class-mapping-btn"
                  disabled={isSaving}
                  className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg shadow-xs transition-colors cursor-pointer"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_24px_60px_-15px_rgba(15,23,42,0.22)] w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Remove Teacher User</h3>
              <button
                type="button"
                aria-label="Close modal"
                onClick={() => setConfirmDeleteTeacher(null)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
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
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs cursor-pointer"
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
