'use client';

import React, { useMemo, useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  X,
  Users,
  UserPlus,
  FileSpreadsheet,
} from 'lucide-react';
import CustomSelect from '@/components/CustomSelect';
import {
  ClassDefinition,
  GRADE_OPTIONS,
  SVA_SCHOOL_HOUSES,
  StudentReportRow,
} from '@/lib/report-card-types';
import { formatClassGradeShortLabel } from '@/lib/erp-persistence';

interface ClassesStudentsManagerProps {
  classes: ClassDefinition[];
  students: StudentReportRow[];
  onOpenClassSheet: (section: string) => void;
  onAddClass: (grade: string, section: string) => boolean;
  onEditClass: (classId: string, nextGrade: string, nextSection: string) => boolean;
  onDeleteClass: (classId: string) => boolean;
  onAddStudent: (input: {
    name: string;
    rollNo: string;
    section: string;
    dob?: string;
    fatherName?: string;
    motherName?: string;
    house?: string;
    height?: string;
    weight?: string;
    attendance?: string;
    attendanceOutOf?: string;
  }) => void;
}

export default function ClassesStudentsManager({
  classes,
  students,
  onOpenClassSheet,
  onAddClass,
  onEditClass,
  onDeleteClass,
  onAddStudent,
}: ClassesStudentsManagerProps) {
  // Selected class in the roster dropdown
  const [selectedSection, setSelectedSection] = useState<string>(
    classes[0]?.section || ''
  );

  // Add Class modal
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [addGrade, setAddGrade] = useState('Class 6');
  const [addSection, setAddSection] = useState('');

  // Edit Class modal
  const [editingClass, setEditingClass] = useState<ClassDefinition | null>(null);
  const [editGrade, setEditGrade] = useState('Class 6');
  const [editSection, setEditSection] = useState('');

  // Delete Class confirmation modal
  const [deletingClass, setDeletingClass] = useState<ClassDefinition | null>(null);

  // Add Student modal
  const [isAddStudentOpen, setIsAddStudentOpen] = useState(false);
  const [stuSection, setStuSection] = useState<string>(classes[0]?.section || 'Sparkle');
  const [stuName, setStuName] = useState('');
  const [stuRoll, setStuRoll] = useState('');
  const [stuDob, setStuDob] = useState('2014-01-01');
  const [stuFather, setStuFather] = useState('');
  const [stuMother, setStuMother] = useState('');
  const [stuHouse, setStuHouse] = useState<string>(SVA_SCHOOL_HOUSES[0]);
  const [stuHeight, setStuHeight] = useState('');
  const [stuWeight, setStuWeight] = useState('');
  const [stuAttPresent, setStuAttPresent] = useState('31');
  const [stuAttOutOf, setStuAttOutOf] = useState('31');

  const countBySection = useMemo(() => {
    const map: Record<string, number> = {};
    classes.forEach((c) => {
      map[c.section] = 0;
    });
    students.forEach((s) => {
      map[s.section] = (map[s.section] || 0) + 1;
    });
    return map;
  }, [classes, students]);

  const activeClass = useMemo(() => {
    return classes.find((c) => c.section === selectedSection) || classes[0] || null;
  }, [classes, selectedSection]);

  const classDropdownOptions = useMemo(() => {
    return classes.map((cls) => {
      const count = countBySection[cls.section] || 0;
      const label = formatClassGradeShortLabel(classes, cls.section);
      return {
        value: cls.section,
        label,
        meta: `${count} ${count === 1 ? 'student' : 'students'}`,
      };
    });
  }, [classes, countBySection]);

  const handleOpenAddStudent = (preferredSection?: string) => {
    const targetSec = preferredSection || activeClass?.section || classes[0]?.section || 'Sparkle';
    const maxRoll = students
      .filter((s) => s.section === targetSec)
      .reduce((max, s) => Math.max(max, parseInt(s.rollNo, 10) || 0), 0);
    setStuSection(targetSec);
    setStuRoll(String(maxRoll + 1).padStart(2, '0'));
    setStuName('');
    setStuDob('2014-01-01');
    setStuFather('');
    setStuMother('');
    setStuHouse(SVA_SCHOOL_HOUSES[0]);
    setStuHeight('');
    setStuWeight('');
    setStuAttPresent('31');
    setStuAttOutOf('31');
    setIsAddStudentOpen(true);
  };

  const handleCreateClassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = addSection.trim();
    const ok = onAddClass(addGrade, addSection);
    if (ok) {
      if (trimmed) setSelectedSection(trimmed);
      setIsAddClassOpen(false);
      setAddSection('');
    }
  };

  const handleEditClassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass) return;
    const trimmed = editSection.trim();
    const ok = onEditClass(editingClass.id, editGrade, editSection);
    if (ok) {
      if (trimmed && activeClass?.id === editingClass.id) {
        setSelectedSection(trimmed);
      }
      setEditingClass(null);
    }
  };

  const handleAddStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!stuName.trim() || !stuRoll.trim()) return;
    onAddStudent({
      name: stuName.trim(),
      rollNo: stuRoll.trim(),
      section: stuSection,
      dob: stuDob,
      fatherName: stuFather.trim(),
      motherName: stuMother.trim(),
      house: stuHouse,
      height: stuHeight.trim(),
      weight: stuWeight.trim(),
      attendance: stuAttPresent.trim(),
      attendanceOutOf: stuAttOutOf.trim(),
    });
    setIsAddStudentOpen(false);
  };

  return (
    <div className="bg-white border border-slate-200/85 rounded-2xl px-4 py-2.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 lg:gap-4">
        {/* Identity + Active Class Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between lg:justify-start gap-2.5 lg:gap-3.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2 min-w-0 lg:flex-nowrap lg:shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-blue-50/90 border border-blue-100/80 text-blue-600 flex items-center justify-center shrink-0">
                <Users className="w-3.5 h-3.5" />
              </div>
              <div className="flex items-baseline gap-1.5 min-w-0">
                <h2 className="text-[13px] font-semibold tracking-[-0.01em] text-slate-900 whitespace-nowrap">
                  Classes & Roster
                </h2>
                <span className="text-xs text-slate-300 shrink-0" aria-hidden="true">·</span>
                <span className="text-xs font-medium text-slate-500 tabular-nums whitespace-nowrap">
                  {classes.length}
                  <span className="hidden xl:inline"> classes</span>
                  <span className="mx-1 text-slate-300">·</span>
                  {students.length}
                  <span className="hidden sm:inline"> students</span>
                </span>
              </div>
            </div>

            {/* Mobile/Tablet Quick Add Buttons */}
            <div className="flex lg:hidden items-center gap-1.5 shrink-0 ml-auto">
              <button
                type="button"
                aria-label="Add Class"
                onClick={() => {
                  setAddGrade('Class 6');
                  setAddSection('');
                  setIsAddClassOpen(true);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200/90 hover:bg-slate-50 hover:border-slate-300 rounded-xl shadow-[0_1px_1px_rgba(15,23,42,0.03)] transition-all duration-150 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 text-slate-500" />
                <span>Class</span>
              </button>
              <button
                type="button"
                aria-label="Add Student"
                onClick={() => handleOpenAddStudent(activeClass?.section)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-[0_1px_2px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.16)] transition-all duration-150 cursor-pointer whitespace-nowrap"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Student</span>
              </button>
            </div>
          </div>

          <span className="hidden lg:block h-5 w-px bg-slate-200/80 shrink-0" aria-hidden="true" />

          {activeClass ? (
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 min-w-0 flex-1 lg:flex-initial">
              <CustomSelect
                id="roster-class-select"
                value={activeClass.section}
                onChange={(val) => setSelectedSection(val)}
                options={classDropdownOptions}
                matchTriggerWidth
                containerClassName="flex items-center justify-between gap-2 bg-slate-50/75 hover:bg-white border border-slate-200/90 hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15 rounded-xl px-3 py-1.5 shadow-[0_1px_1px_rgba(15,23,42,0.02)] transition-all duration-150 w-full sm:w-[242px] min-w-0"
                triggerClassName="text-xs font-semibold text-slate-900 flex-1 min-w-0"
                menuClassName=""
                renderFooter={(closeMenu) => (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeMenu();
                      setAddGrade('Class 6');
                      setAddSection('');
                      setIsAddClassOpen(true);
                    }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50/80 rounded-lg transition-colors cursor-pointer text-left"
                  >
                    <Plus className="w-3.5 h-3.5 shrink-0" />
                    <span>Add new class</span>
                  </button>
                )}
              />

              <button
                type="button"
                onClick={() => onOpenClassSheet(activeClass.section)}
                aria-label={`Open Student Info Sheet for ${formatClassGradeShortLabel(classes, activeClass.section)}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200/90 hover:border-slate-300 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-blue-600" />
                <span>Open Sheet</span>
              </button>

              <div className="inline-flex items-center bg-slate-50/85 border border-slate-200/80 rounded-xl p-0.5 ml-auto sm:ml-0 shrink-0">
                <button
                  type="button"
                  aria-label={`Edit class ${activeClass.section}`}
                  title={`Edit ${formatClassGradeShortLabel(classes, activeClass.section)}`}
                  onClick={() => {
                    setEditingClass(activeClass);
                    setEditGrade(activeClass.grade);
                    setEditSection(activeClass.section);
                  }}
                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-white hover:shadow-2xs rounded-lg transition-all duration-150 cursor-pointer shrink-0"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>

                {classes.length > 1 && (
                  <>
                    <span className="w-px h-3.5 bg-slate-200/80 mx-0.5" aria-hidden="true" />
                    <button
                      type="button"
                      aria-label={`Delete class ${activeClass.section}`}
                      title={`Delete ${formatClassGradeShortLabel(classes, activeClass.section)}`}
                      onClick={() => setDeletingClass(activeClass)}
                      className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-white hover:shadow-2xs rounded-lg transition-all duration-150 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <span className="text-xs text-slate-500">
              No classes yet.
            </span>
          )}
        </div>

        {/* Desktop Add Actions */}
        <div className="hidden lg:flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setAddGrade('Class 6');
              setAddSection('');
              setIsAddClassOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 bg-white border border-slate-200/90 hover:bg-slate-50 hover:border-slate-300 rounded-xl shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-150 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-3.5 h-3.5 text-slate-500" />
            <span>Add Class</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenAddStudent(activeClass?.section)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-all duration-150 cursor-pointer shadow-[0_1px_2px_rgba(37,99,235,0.28),inset_0_1px_0_rgba(255,255,255,0.16)] active:scale-[0.99] whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Add Student</span>
          </button>
        </div>
      </div>

      {/* Add Class Modal */}
      {isAddClassOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddClassOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_24px_60px_-15px_rgba(15,23,42,0.22)] w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Add New Class</h3>
              <button
                type="button"
                aria-label="Close Add Class modal"
                onClick={() => setIsAddClassOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateClassSubmit} className="space-y-3 text-xs">
              <div>
                <label
                  htmlFor="add-class-grade"
                  className="text-slate-600 block mb-1 font-medium"
                >
                  Grade / Class Level
                </label>
                <select
                  id="add-class-grade"
                  value={addGrade}
                  onChange={(e) => setAddGrade(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                >
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="add-class-section"
                  className="text-slate-600 block mb-1 font-medium"
                >
                  Section / Division Name *
                </label>
                <input
                  id="add-class-section"
                  type="text"
                  required
                  value={addSection}
                  onChange={(e) => setAddSection(e.target.value)}
                  placeholder="e.g. Lotus"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddClassOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs cursor-pointer"
                >
                  Create Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Class Modal */}
      {editingClass && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setEditingClass(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_24px_60px_-15px_rgba(15,23,42,0.22)] w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">
                Edit Class ({editingClass.section})
              </h3>
              <button
                type="button"
                aria-label="Close Edit Class modal"
                onClick={() => setEditingClass(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditClassSubmit} className="space-y-3 text-xs">
              <div>
                <label
                  htmlFor="edit-class-grade"
                  className="text-slate-600 block mb-1 font-medium"
                >
                  Grade / Class Level
                </label>
                <select
                  id="edit-class-grade"
                  value={editGrade}
                  onChange={(e) => setEditGrade(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                >
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="edit-class-section"
                  className="text-slate-600 block mb-1 font-medium"
                >
                  Section / Division Name *
                </label>
                <input
                  id="edit-class-section"
                  type="text"
                  required
                  value={editSection}
                  onChange={(e) => setEditSection(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Updates this class across all {countBySection[editingClass.section] || 0} students, tabs, and report cards.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingClass(null)}
                  className="px-3 py-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs cursor-pointer"
                >
                  Save Class
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Class Confirmation Modal */}
      {deletingClass && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setDeletingClass(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_24px_60px_-15px_rgba(15,23,42,0.22)] w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">
                Delete Class {formatClassGradeShortLabel(classes, deletingClass.section)}?
              </h3>
              <button
                type="button"
                aria-label="Close Delete Class modal"
                onClick={() => setDeletingClass(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              This removes <strong>{deletingClass.section}</strong> ({deletingClass.grade})
              {(countBySection[deletingClass.section] || 0) > 0
                ? ` along with its ${countBySection[deletingClass.section]} students.`
                : '.'}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setDeletingClass(null)}
                className="px-3 py-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteClass(deletingClass.id);
                  setDeletingClass(null);
                }}
                className="px-3.5 py-1.5 font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg shadow-xs cursor-pointer"
              >
                Delete Class
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {isAddStudentOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsAddStudentOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/35 backdrop-blur-[2px] p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-[0_24px_60px_-15px_rgba(15,23,42,0.22)] w-full max-w-md p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">Add Student</h3>
              <button
                type="button"
                aria-label="Close Add Student modal"
                onClick={() => setIsAddStudentOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddStudentSubmit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-slate-600 block mb-1 font-medium">
                    Class / Section *
                  </label>
                  <select
                    aria-label="Student Class"
                    value={stuSection}
                    onChange={(e) => {
                      const nextSec = e.target.value;
                      setStuSection(nextSec);
                      const maxRoll = students
                        .filter((s) => s.section === nextSec)
                        .reduce((m, s) => Math.max(m, parseInt(s.rollNo, 10) || 0), 0);
                      setStuRoll(String(maxRoll + 1).padStart(2, '0'));
                    }}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  >
                    {classes.map((c) => (
                      <option key={c.id} value={c.section}>
                        {formatClassGradeShortLabel(classes, c.section)} ({c.grade})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-slate-600 block mb-1 font-medium">
                    Roll Number *
                  </label>
                  <input
                    type="text"
                    required
                    aria-label="Student Roll Number"
                    value={stuRoll}
                    onChange={(e) => setStuRoll(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-600 block mb-1 font-medium">
                  Student Full Name *
                </label>
                <input
                  type="text"
                  required
                  aria-label="Student Full Name"
                  value={stuName}
                  onChange={(e) => setStuName(e.target.value)}
                  placeholder="e.g. Aarav Rajesh Kulkarni"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-slate-600 block mb-1 font-medium">DOB</label>
                  <input
                    type="date"
                    aria-label="Date of Birth"
                    value={stuDob}
                    onChange={(e) => setStuDob(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1 font-medium">House</label>
                  <select
                    aria-label="Student House"
                    value={stuHouse}
                    onChange={(e) => setStuHouse(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  >
                    {SVA_SCHOOL_HOUSES.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-slate-600 block mb-1 font-medium">
                    Father&apos;s Name
                  </label>
                  <input
                    type="text"
                    aria-label="Father Name"
                    value={stuFather}
                    onChange={(e) => setStuFather(e.target.value)}
                    placeholder="Father's name"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1 font-medium">
                    Mother&apos;s Name
                  </label>
                  <input
                    type="text"
                    aria-label="Mother Name"
                    value={stuMother}
                    onChange={(e) => setStuMother(e.target.value)}
                    placeholder="Mother's name"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="text-slate-600 block mb-1 font-medium">Height (cm)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label="Height cm"
                    placeholder="132"
                    value={stuHeight}
                    onChange={(e) => setStuHeight(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1 font-medium">Weight (kg)</label>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label="Weight kg"
                    placeholder="25"
                    value={stuWeight}
                    onChange={(e) => setStuWeight(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1 font-medium">Attendance</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Attendance days"
                    value={stuAttPresent}
                    onChange={(e) => setStuAttPresent(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="text-slate-600 block mb-1 font-medium">Out Of</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    aria-label="Attendance out of"
                    value={stuAttOutOf}
                    onChange={(e) => setStuAttOutOf(e.target.value)}
                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-slate-900 focus:outline-none focus:bg-white focus:border-blue-600"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddStudentOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs cursor-pointer"
                >
                  Save Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
