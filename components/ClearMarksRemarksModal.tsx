'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CustomSelect from '@/components/CustomSelect';
import { ClassDefinition, ExamConfig, StudentReportRow } from '@/lib/report-card-types';
import { formatClassGradeShortLabel } from '@/lib/erp-persistence';
import { ClearDataOptions, countClearDataImpact } from '@/lib/erp-clear-data';

export type ClearModalPreset = 'all' | 'marks' | 'remarks';

interface ClearMarksRemarksModalProps {
  isOpen: boolean;
  preset: ClearModalPreset;
  classes: ClassDefinition[];
  students: StudentReportRow[];
  examConfigs: Record<string, ExamConfig>;
  initialSection: string;
  initialExam: string;
  onClose: () => void;
  onConfirm: (options: ClearDataOptions) => void;
}

export default function ClearMarksRemarksModal({
  isOpen,
  preset,
  classes,
  students,
  examConfigs,
  initialSection,
  initialExam,
  onClose,
  onConfirm,
}: ClearMarksRemarksModalProps) {
  const [targetSection, setTargetSection] = useState<string>(initialSection);
  const [targetExam, setTargetExam] = useState<string>(initialExam);
  const [clearMarks, setClearMarks] = useState<boolean>(preset !== 'remarks');
  const [clearRemarks, setClearRemarks] = useState<boolean>(preset !== 'marks');
  const [clearAttendance, setClearAttendance] = useState<boolean>(false);
  const [removeStudents, setRemoveStudents] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const classCounts = useMemo(() => {
    const map: Record<string, number> = {};
    students.forEach((s) => {
      map[s.section] = (map[s.section] || 0) + 1;
    });
    return map;
  }, [students]);

  const impact = useMemo(
    () =>
      countClearDataImpact({
        students,
        examConfigs,
        targetSection,
        targetExam,
      }),
    [students, examConfigs, targetSection, targetExam]
  );

  if (!isOpen) return null;

  const classOptions = [
    {
      value: 'all',
      label: 'All Classes',
      meta: `${students.length}`,
    },
    ...classes.map((c) => ({
      value: c.section,
      label: formatClassGradeShortLabel(classes, c.section),
      meta: `${classCounts[c.section] || 0}`,
    })),
  ];

  const examList = Object.values(examConfigs);
  const examOptions = [
    {
      value: 'ALL',
      label: 'All Exams',
      meta: `${examList.length}`,
    },
    ...examList.map((ex) => ({
      value: ex.id,
      label: ex.code || ex.id,
      meta: ex.subjects[0]?.maxMarks ? `${ex.subjects[0].maxMarks}m` : undefined,
    })),
  ];

  const hasActionSelected =
    removeStudents || clearMarks || clearRemarks || clearAttendance;
  const canConfirm = hasActionSelected && impact.matchedStudentsCount > 0;

  const confirmLabel = (() => {
    if (removeStudents) {
      return `Remove ${impact.matchedStudentsCount} Student${
        impact.matchedStudentsCount === 1 ? '' : 's'
      }`;
    }
    const labels: string[] = [];
    if (clearMarks) labels.push('Marks');
    if (clearRemarks) labels.push('Remarks');
    if (clearAttendance && labels.length === 0) labels.push('Attendance');
    if (labels.length === 0) return 'Select Data to Clear';
    return `Clear ${labels.join(' & ')}`;
  })();

  const examScopeApplies = clearMarks && !removeStudents;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="clear-data-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xl w-full max-w-lg p-6 sm:p-7 flex flex-col gap-5 animate-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="clear-data-modal-title"
              className="text-lg font-bold tracking-tight text-slate-900"
            >
              Clear Marks & Remarks
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Remove test or old academic year data while keeping classes, subjects, and formulas intact.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 px-2 py-1 -mr-2 rounded-lg hover:bg-slate-100/80 transition-colors cursor-pointer shrink-0"
          >
            Cancel
          </button>
        </div>

        {/* Scope Selectors */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-slate-700 mb-1.5 block">
              Class Scope
            </label>
            <CustomSelect
              id="clear-data-class-select"
              fullWidth
              matchTriggerWidth
              value={targetSection}
              onChange={(val) => setTargetSection(val)}
              containerClassName="flex items-center justify-between gap-2 bg-white border border-slate-200/90 rounded-lg px-3 py-2 hover:border-slate-300 transition-colors"
              triggerClassName="text-xs font-semibold text-slate-800"
              options={classOptions}
            />
          </div>

          <div className={examScopeApplies ? '' : 'opacity-50 pointer-events-none'}>
            <label className="text-xs font-medium text-slate-700 mb-1.5 block">
              Exam Scope (Marks)
            </label>
            <CustomSelect
              id="clear-data-exam-select"
              fullWidth
              matchTriggerWidth
              value={targetExam}
              onChange={(val) => setTargetExam(val)}
              containerClassName="flex items-center justify-between gap-2 bg-white border border-slate-200/90 rounded-lg px-3 py-2 hover:border-slate-300 transition-colors"
              triggerClassName="text-xs font-semibold text-slate-800"
              options={examOptions}
            />
          </div>
        </div>

        {/* Data Types Checklist */}
        <div className="rounded-xl border border-slate-200/85 divide-y divide-slate-100 overflow-hidden bg-white">
          <label
            className={`flex items-start gap-3 px-3.5 py-3 transition-colors ${
              removeStudents
                ? 'opacity-50 cursor-not-allowed bg-slate-50/40'
                : 'cursor-pointer hover:bg-slate-50/70'
            }`}
          >
            <input
              type="checkbox"
              checked={removeStudents || clearMarks}
              disabled={removeStudents}
              onChange={(e) => setClearMarks(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900">
                Exam Marks & Internal Breakdowns
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Blanks out all subject scores and internal assessments; keeps exam setup.
              </div>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 px-3.5 py-3 transition-colors ${
              removeStudents
                ? 'opacity-50 cursor-not-allowed bg-slate-50/40'
                : 'cursor-pointer hover:bg-slate-50/70'
            }`}
          >
            <input
              type="checkbox"
              checked={removeStudents || clearRemarks}
              disabled={removeStudents}
              onChange={(e) => setClearRemarks(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900">
                Subject & Class Teacher Remarks
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Removes all custom subject comments and overall class teacher remarks.
              </div>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 px-3.5 py-3 transition-colors ${
              removeStudents
                ? 'opacity-50 cursor-not-allowed bg-slate-50/40'
                : 'cursor-pointer hover:bg-slate-50/70'
            }`}
          >
            <input
              type="checkbox"
              checked={removeStudents || clearAttendance}
              disabled={removeStudents}
              onChange={(e) => setClearAttendance(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900">
                Attendance Entries
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Clears recorded attendance days while preserving student names, roll numbers, and info.
              </div>
            </div>
          </label>

          <label
            className={`flex items-start gap-3 px-3.5 py-3 cursor-pointer transition-colors ${
              removeStudents ? 'bg-rose-50/50' : 'hover:bg-slate-50/70'
            }`}
          >
            <input
              type="checkbox"
              checked={removeStudents}
              onChange={(e) => setRemoveStudents(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
            />
            <div className="min-w-0">
              <div
                className={`text-xs font-semibold ${
                  removeStudents ? 'text-rose-700' : 'text-slate-900'
                }`}
              >
                Remove Students Completely (Fresh Batch for Next Year)
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Deletes student rows in the chosen class scope so you can bulk-import a new roster.
              </div>
            </div>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
          <div className="text-xs text-slate-500 tabular-nums flex items-center gap-1.5 flex-wrap">
            <span>
              <strong className="font-semibold text-slate-800">
                {impact.matchedStudentsCount}
              </strong>{' '}
              student{impact.matchedStudentsCount === 1 ? '' : 's'}
            </span>
            {examScopeApplies && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="font-semibold text-slate-800">
                    {impact.affectedExamIds.length}
                  </strong>{' '}
                  exam{impact.affectedExamIds.length === 1 ? '' : 's'}
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            disabled={!canConfirm}
            onClick={() =>
              onConfirm({
                targetSection,
                targetExam,
                clearMarks: removeStudents ? true : clearMarks,
                clearRemarks: removeStudents ? true : clearRemarks,
                clearAttendance: removeStudents ? true : clearAttendance,
                removeStudents,
              })
            }
            className={`px-5 py-2.5 text-xs font-semibold rounded-full transition-colors whitespace-nowrap ${
              !canConfirm
                ? 'bg-slate-400/75 text-white cursor-not-allowed'
                : removeStudents
                ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs cursor-pointer'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
