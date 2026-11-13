'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { AlertCircle, Download, Upload } from 'lucide-react';
import CustomSelect from '@/components/CustomSelect';
import { ClassDefinition, StudentReportRow } from '@/lib/report-card-types';
import { formatClassGradeShortLabel } from '@/lib/erp-persistence';
import {
  BulkStudentCandidate,
  aoaToBulkStudentTsv,
  parseBulkStudentText,
} from '@/lib/student-bulk-import';

interface BulkAddStudentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassDefinition[];
  students: StudentReportRow[];
  initialSection: string;
  defaultOutOf: string;
  onImport: (params: {
    targetSection: string;
    replaceExisting: boolean;
    candidates: BulkStudentCandidate[];
  }) => void;
}

export default function BulkAddStudentsModal({
  isOpen,
  onClose,
  classes,
  students,
  initialSection,
  defaultOutOf,
  onImport,
}: BulkAddStudentsModalProps) {
  const [targetSection, setTargetSection] = useState<string>(initialSection);
  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [rawText, setRawText] = useState<string>('');
  const [fileError, setFileError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const classCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    students.forEach((s) => {
      counts[s.section] = (counts[s.section] || 0) + 1;
    });
    return counts;
  }, [students]);

  const existingMaxRoll = useMemo(() => {
    if (replaceExisting) return 0;
    return students
      .filter((s) => s.section === targetSection)
      .reduce((max, s) => Math.max(max, parseInt(s.rollNo, 10) || 0), 0);
  }, [students, targetSection, replaceExisting]);

  const parsed = useMemo(() => {
    if (!rawText.trim()) {
      return {
        students: [],
        skippedLines: [],
        detectedColumns: [],
        usedHeaderRow: false,
      };
    }
    return parseBulkStudentText({
      rawText,
      existingMaxRoll,
      defaultOutOf: defaultOutOf || '31',
    });
  }, [rawText, existingMaxRoll, defaultOutOf]);

  if (!isOpen) return null;

  const classOptions = classes.map((c) => {
    const count = classCounts[c.section] || 0;
    return {
      value: c.section,
      label: formatClassGradeShortLabel(classes, c.section),
      meta: `${count}`,
    };
  });

  const handleLoadSpreadsheetFile = async (file: File) => {
    setFileError(null);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setFileError('No worksheet found inside that file.');
        return;
      }
      const ws = workbook.Sheets[firstSheetName];
      const aoa = XLSX.utils.sheet_to_json(ws, {
        header: 1,
        defval: '',
        raw: false,
      }) as unknown[][];
      const tsv = aoaToBulkStudentTsv(aoa);
      if (!tsv.trim()) {
        setFileError('The uploaded worksheet appears to be empty.');
        return;
      }
      setRawText(tsv);
    } catch {
      setFileError('Could not read that file. Please upload a valid .xlsx or .csv file.');
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleLoadSpreadsheetFile(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    const file = e.dataTransfer.files?.[0];
    if (file && /\.(xlsx|xls|csv)$/i.test(file.name)) {
      void handleLoadSpreadsheetFile(file);
    }
  };

  const handleDownloadSample = () => {
    const outOf = defaultOutOf || '31';
    const sampleRows = [
      [
        'Roll No',
        'Student Name',
        'DOB',
        "Father's Name",
        "Mother's Name",
        'House',
        'Height (cm)',
        'Weight (kg)',
        'Attendance',
        'Attendance Out Of',
      ],
      ['01', 'Ajinkya Balu Gurav', '2014-05-12', 'Balu Gurav', 'Sunita Gurav', 'Sinhagad', '132', '26', outOf, outOf],
      ['02', 'Ankita Rangnath Ghige', '2014-08-21', 'Rangnath Ghige', 'Meera Ghige', 'Raigad', '130', '24', outOf, outOf],
      ['03', 'Anushka Balasaheb Jalhare', '2014-03-14', 'Balasaheb Jalhare', 'Kavita Jalhare', 'Shivneri', '134', '27', outOf, outOf],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sampleRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students_Template');
    const safeClass = targetSection.replace(/[^a-z0-9_-]/gi, '_');
    XLSX.writeFile(wb, `Student_Roster_Template_${safeClass}.xlsx`);
  };

  const handleSubmit = () => {
    if (parsed.students.length === 0) return;
    onImport({
      targetSection,
      replaceExisting,
      candidates: parsed.students,
    });
  };

  const detectedCount = parsed.students.length;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-add-students-title"
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
              id="bulk-add-students-title"
              className="text-lg font-bold tracking-tight text-slate-900"
            >
              Bulk Add Students
            </h2>
            <span className="text-xs font-medium text-slate-400 truncate">
              · {formatClassGradeShortLabel(classes, targetSection)}
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

        {/* Scope & Replace Option */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5 items-end">
          <div className="sm:col-span-6">
            <label className="text-xs font-medium text-slate-700 mb-1.5 block">
              Class / Section Name
            </label>
            <CustomSelect
              id="bulk-students-class-select"
              fullWidth
              matchTriggerWidth
              value={targetSection}
              onChange={(val) => setTargetSection(val)}
              containerClassName="flex items-center justify-between gap-2 bg-white border border-slate-200/90 rounded-lg px-3 py-2 hover:border-slate-300 transition-colors"
              triggerClassName="text-xs font-semibold text-slate-800"
              options={classOptions}
            />
          </div>

          <div className="sm:col-span-6 sm:pb-2 pt-1 sm:pt-0">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Replace current roster with pasted list</span>
            </label>
          </div>
        </div>

        {/* Paste Textarea Section */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label
              htmlFor="bulk-add-students-textarea"
              className="text-xs font-medium text-slate-700"
            >
              Paste lines (Roll No + Full Name, names list, or Excel columns)
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
                onClick={handleDownloadSample}
                className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800 hover:underline cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Sample .xlsx</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileInputChange}
                className="hidden"
              />
            </div>
          </div>

          <textarea
            ref={textareaRef}
            id="bulk-add-students-textarea"
            rows={8}
            value={rawText}
            onChange={(e) => {
              setFileError(null);
              setRawText(e.target.value);
            }}
            placeholder={
              '01 Ajinkya Balu Gurav\n02 Ankita Rangnath Ghige\n03 Anushka Balasaheb Jalhare'
            }
            className="w-full min-h-[205px] px-3.5 py-3 rounded-xl border border-slate-200 bg-white font-mono text-xs leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 resize-y tabular-nums"
          />
        </div>

        {fileError && (
          <div className="px-3 py-2.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{fileError}</span>
          </div>
        )}

        {/* Footer Row */}
        <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
          <div className="text-xs text-slate-500 tabular-nums flex items-center gap-1.5 flex-wrap">
            <span>
              Detected{' '}
              <strong className="font-semibold text-slate-800">{detectedCount}</strong>{' '}
              student{detectedCount === 1 ? '' : 's'}
            </span>
            {parsed.detectedColumns.length > 2 && (
              <>
                <span aria-hidden="true">·</span>
                <span>{parsed.detectedColumns.length} fields mapped</span>
              </>
            )}
            {parsed.skippedLines.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-amber-600 font-medium">
                  {parsed.skippedLines.length} skipped
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            disabled={detectedCount === 0}
            onClick={handleSubmit}
            className={`px-5 py-2.5 text-xs font-semibold rounded-full transition-colors whitespace-nowrap ${
              detectedCount === 0
                ? 'bg-slate-400/75 text-white cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs cursor-pointer'
            }`}
          >
            {detectedCount === 0
              ? 'Import 0 Students'
              : replaceExisting
              ? `Replace with ${detectedCount} Student${detectedCount === 1 ? '' : 's'}`
              : `Import ${detectedCount} Student${detectedCount === 1 ? '' : 's'}`}
          </button>
        </div>
      </div>
    </div>
  );
}
