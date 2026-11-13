'use client';

import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Upload, Download, AlertCircle } from 'lucide-react';
import CustomSelect from './CustomSelect';
import {
  ExamConfig,
  SubjectConfig,
  StudentReportRow,
} from '@/lib/report-card-types';
import { parsePastedMarksText } from '@/lib/marks-paste-import';

interface ImportMarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedExam: string;
  initialClass: string;
  initialSubject: string;
  classSections: string[];
  classCounts: Record<string, number>;
  getClassGradeLabel: (sec: string) => string;
  getClassNumberForSection: (sec: string) => string;
  activeSubjects: SubjectConfig[];
  students: StudentReportRow[];
  baseExamConfig: ExamConfig;
  uploadError: string | null;
  onClearError: () => void;
  onApplyPastedMarks: (params: {
    updatedStudents: StudentReportRow[];
    matchedStudentCount: number;
    matchedMarksCount: number;
    targetClass: string;
    targetSubject: string;
  }) => void;
  onUploadFile: (
    file: File,
    mode: 'subject' | 'consolidated',
    subjectName: string,
    targetClass: string
  ) => void;
  onDownloadTemplate: (subjectName: string | null) => void;
}

export default function ImportMarksModal({
  isOpen,
  onClose,
  selectedExam,
  initialClass,
  initialSubject,
  classSections,
  classCounts,
  getClassGradeLabel,
  getClassNumberForSection,
  activeSubjects,
  students,
  baseExamConfig,
  uploadError,
  onClearError,
  onApplyPastedMarks,
  onUploadFile,
  onDownloadTemplate,
}: ImportMarksModalProps) {
  const defaultClass =
    initialClass && initialClass !== 'all'
      ? initialClass
      : classSections[0] || 'all';
  const defaultSubject =
    initialSubject &&
    initialSubject !== 'all' &&
    initialSubject !== 'consolidated'
      ? initialSubject
      : '__ALL__';

  const [targetClass, setTargetClass] = useState<string>(defaultClass);
  const [targetSubject, setTargetSubject] = useState<string>(defaultSubject);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [rawText, setRawText] = useState<string>('');
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      textareaRef.current?.focus();
    }, 50);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const preview = useMemo(() => {
    if (!rawText.trim()) {
      return {
        matchedStudentCount: 0,
        matchedMarksCount: 0,
        unmatchedLines: [],
        updatedStudents: students,
        detectedSubjects: [],
      };
    }
    return parsePastedMarksText({
      rawText,
      targetClass,
      targetSubject,
      replaceExisting,
      currentStudents: students,
      baseExamConfig,
      getClassNumberForSection,
    });
  }, [
    rawText,
    targetClass,
    targetSubject,
    replaceExisting,
    students,
    baseExamConfig,
    getClassNumberForSection,
  ]);

  const placeholderText = useMemo(() => {
    const sampleRoster = (
      targetClass === 'all'
        ? students
        : students.filter(
            (s) => s.section.toLowerCase() === targetClass.toLowerCase()
          )
    ).slice(0, 3);

    const names =
      sampleRoster.length >= 3
        ? sampleRoster.map((s) => ({ roll: s.rollNo, name: s.name }))
        : [
            { roll: '01', name: 'Ajinkya Balu Gurav' },
            { roll: '02', name: 'Ankita Rangnath Ghige' },
            { roll: '03', name: 'Anushka Balasaheb Jalhare' },
          ];

    const subCfg = activeSubjects.find(
      (s) => s.name.toLowerCase() === targetSubject.toLowerCase()
    );
    const maxM = subCfg?.maxMarks ?? (activeSubjects[0]?.maxMarks || 100);
    const s1Mark = Math.round(maxM * 0.88);
    const s3Mark = Math.round(maxM * 0.92);

    if (targetSubject === '__ALL__') {
      const m1 = Math.round((activeSubjects[0]?.maxMarks || 100) * 0.88);
      const m2 = Math.round((activeSubjects[1]?.maxMarks || 100) * 0.84);
      const m3 = Math.round((activeSubjects[2]?.maxMarks || 100) * 0.92);
      return [
        `${names[0].roll}\t${names[0].name}\t${m1}\t${m2}\t${m3}`,
        `${names[1].roll}\t${names[1].name}\t${m2}\tAB\t${m1}`,
        `${names[2].roll}\t${names[2].name}\t${m3}\t${m1}\t${m2}`,
      ].join('\n');
    }

    return [
      `${names[0].roll} ${names[0].name} ${s1Mark}`,
      `${names[1].roll} ${names[1].name} AB`,
      `${names[2].roll} ${names[2].name} ${s3Mark}`,
    ].join('\n');
  }, [students, targetClass, targetSubject, activeSubjects]);

  if (!isOpen) return null;

  const classOptions = [
    {
      value: 'all',
      label: 'All Classes',
      meta: `${students.length}`,
    },
    ...classSections.map((cls) => ({
      value: cls,
      label: getClassGradeLabel(cls),
      meta: `${classCounts[cls] || 0}`,
    })),
  ];

  const subjectOptions = [
    {
      value: '__ALL__',
      label: 'All Subjects',
      meta: `${activeSubjects.length} subs`,
    },
    ...activeSubjects.map((sub) => ({
      value: sub.name,
      label: sub.name,
      meta: `${sub.maxMarks}m`,
    })),
  ];

  const handleImportSubmit = () => {
    if (preview.matchedMarksCount === 0) return;
    onApplyPastedMarks({
      updatedStudents: preview.updatedStudents,
      matchedStudentCount: preview.matchedStudentCount,
      matchedMarksCount: preview.matchedMarksCount,
      targetClass,
      targetSubject,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onUploadFile(
      file,
      targetSubject === '__ALL__' ? 'consolidated' : 'subject',
      targetSubject === '__ALL__'
        ? activeSubjects[0]?.name || 'English'
        : targetSubject,
      targetClass
    );
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (/\.(xlsx|xls|csv)$/i.test(file.name)) {
      onUploadFile(
        file,
        targetSubject === '__ALL__' ? 'consolidated' : 'subject',
        targetSubject === '__ALL__'
          ? activeSubjects[0]?.name || 'English'
          : targetSubject,
        targetClass
      );
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-marks-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingFile(true);
        }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={handleDrop}
        className={`bg-white border rounded-2xl shadow-xl w-full max-w-2xl p-6 sm:p-7 flex flex-col gap-5 animate-in zoom-in-95 duration-150 transition-colors ${
          isDraggingFile ? 'border-blue-400 ring-2 ring-blue-500/20' : 'border-slate-200/90'
        }`}
      >
        {/* Header Row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-2 min-w-0">
            <h2
              id="import-marks-title"
              className="text-lg font-bold tracking-tight text-slate-900"
            >
              Import Marks
            </h2>
            <span className="text-xs font-medium text-slate-400 tabular-nums">
              · {selectedExam}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-slate-500 hover:text-slate-900 px-2 py-1 -mr-2 rounded-lg hover:bg-slate-100/80 transition-colors cursor-pointer"
          >
            Cancel
          </button>
        </div>

        {/* Scope Controls Row */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-end">
          <div className="sm:col-span-4">
            <label className="text-xs font-medium text-slate-700 mb-1.5 block">
              Class / Section
            </label>
            <CustomSelect
              id="import-marks-class-select"
              fullWidth
              matchTriggerWidth
              value={targetClass}
              onChange={(val) => {
                onClearError();
                setTargetClass(val);
              }}
              containerClassName="flex items-center justify-between gap-2 bg-white border border-slate-200/90 rounded-lg px-3 py-2 hover:border-slate-300 transition-colors"
              triggerClassName="text-xs font-semibold text-slate-800"
              options={classOptions}
            />
          </div>

          <div className="sm:col-span-4">
            <label className="text-xs font-medium text-slate-700 mb-1.5 block">
              Subject Scope
            </label>
            <CustomSelect
              id="import-marks-subject-select"
              fullWidth
              matchTriggerWidth
              value={targetSubject}
              onChange={(val) => {
                onClearError();
                setTargetSubject(val);
              }}
              containerClassName="flex items-center justify-between gap-2 bg-white border border-slate-200/90 rounded-lg px-3 py-2 hover:border-slate-300 transition-colors"
              triggerClassName="text-xs font-semibold text-slate-800"
              options={subjectOptions}
            />
          </div>

          <div className="sm:col-span-4 sm:pb-2 pt-1 sm:pt-0">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Replace current marks</span>
            </label>
          </div>
        </div>

        {/* Paste Textarea Section */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label
              htmlFor="import-marks-textarea"
              className="text-xs font-medium text-slate-700"
            >
              {targetSubject === '__ALL__'
                ? 'Paste lines (Roll No + Full Name + Subject Marks)'
                : `Paste lines (Roll No + Full Name + ${targetSubject} Marks)`}
            </label>

            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload .xlsx / .csv</span>
              </button>
              <span className="text-slate-300" aria-hidden="true">
                ·
              </span>
              <button
                type="button"
                onClick={() =>
                  onDownloadTemplate(targetSubject === '__ALL__' ? null : targetSubject)
                }
                className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Sample .xlsx</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          </div>

          <textarea
            ref={textareaRef}
            id="import-marks-textarea"
            rows={8}
            value={rawText}
            onChange={(e) => {
              onClearError();
              setRawText(e.target.value);
            }}
            placeholder={placeholderText}
            className="w-full min-h-[205px] px-3.5 py-3 rounded-xl border border-slate-200 bg-white font-mono text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 resize-y tabular-nums"
          />
        </div>

        {uploadError && (
          <div className="px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{uploadError}</span>
          </div>
        )}

        {/* Footer Row */}
        <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
          <div className="text-xs text-slate-500 tabular-nums flex items-center gap-1.5 flex-wrap">
            {preview.matchedMarksCount === 0 ? (
              <span>
                {preview.unmatchedLines.length > 0
                  ? `Detected 0 marks · ${preview.unmatchedLines.length} unmatched line${preview.unmatchedLines.length === 1 ? '' : 's'}`
                  : 'Detected 0 marks'}
              </span>
            ) : (
              <>
                <span>
                  Detected{' '}
                  <strong className="font-semibold text-slate-800">
                    {preview.matchedStudentCount}
                  </strong>{' '}
                  student{preview.matchedStudentCount === 1 ? '' : 's'}
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  <strong className="font-semibold text-slate-800">
                    {preview.matchedMarksCount}
                  </strong>{' '}
                  mark{preview.matchedMarksCount === 1 ? '' : 's'}
                  {targetSubject === '__ALL__' && preview.detectedSubjects.length > 0
                    ? ` across ${preview.detectedSubjects.length} subject${preview.detectedSubjects.length === 1 ? '' : 's'}`
                    : ''}
                </span>
                {preview.unmatchedLines.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span
                      className="text-amber-600 font-medium"
                      title={preview.unmatchedLines
                        .slice(0, 3)
                        .map((u) => `Line ${u.lineNumber}: ${u.reason}`)
                        .join('\n')}
                    >
                      {preview.unmatchedLines.length} unmatched
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          <button
            type="button"
            disabled={preview.matchedMarksCount === 0}
            onClick={handleImportSubmit}
            className={`px-5 py-2.5 text-xs font-semibold rounded-full transition-colors whitespace-nowrap ${
              preview.matchedMarksCount === 0
                ? 'bg-slate-400/75 text-white cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer'
            }`}
          >
            {preview.matchedMarksCount === 0
              ? 'Import 0 Marks'
              : `Import ${preview.matchedMarksCount} Mark${preview.matchedMarksCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
