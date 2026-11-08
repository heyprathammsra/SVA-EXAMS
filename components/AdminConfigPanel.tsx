'use client';

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  Calculator,
  BookOpen,
  RotateCcw,
  SlidersHorizontal,
  FileSpreadsheet,
  Download,
  FileText,
  Printer,
  ExternalLink,
  RefreshCw,
  Info,
} from 'lucide-react';
import GoogleSheetsConnectCard from '@/components/GoogleSheetsConnectCard';
import {
  ExamConfig,
  SubjectConfig,
  ExamInfo,
  ComputedStudentResult,
  StudentReportRow,
} from '@/lib/report-card-types';

interface AdminConfigPanelProps {
  examConfigs: Record<string, ExamConfig>;
  activeExamId: string;
  onUpdateExamConfig: (examId: string, updated: ExamConfig) => void;
  onCreateNewExam: (newExam: ExamConfig) => void;
  onDeleteExam: (examId: string) => void;
  onSetActiveExam: (examId: string) => void;
  onResetDefaults: () => void;
  showToast: (msg: string) => void;
  spreadsheetId?: string;
  setSpreadsheetId?: (id: string) => void;
  sheetsSyncStatus?: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncTime?: string | null;
  onGoogleSheetsSync?: () => void;
  students?: StudentReportRow[];
}

const PRESET_SUBJECTS = [
  'English',
  'Hindi',
  'Marathi',
  'Maths',
  'Science',
  'Social Science',
  'Computer Science',
];

export default function AdminConfigPanel({
  examConfigs,
  activeExamId,
  onUpdateExamConfig,
  onCreateNewExam,
  onDeleteExam,
  onSetActiveExam,
  onResetDefaults,
  showToast,
  spreadsheetId = '',
  setSpreadsheetId,
  sheetsSyncStatus = 'idle',
  lastSyncTime = null,
  onGoogleSheetsSync,
  students = [],
}: AdminConfigPanelProps) {
  // Current exam being edited in admin
  const [editingExamId, setEditingExamId] = useState<string>(activeExamId);
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [newExamTitle, setNewExamTitle] = useState<string>('');
  const [newExamCode, setNewExamCode] = useState<string>('');
  const [newExamDefaultMax, setNewExamDefaultMax] = useState<number>(80);

  const currentConfig: ExamConfig =
    examConfigs[editingExamId] || examConfigs[activeExamId] || Object.values(examConfigs)[0];

  // Helper to update field in current exam
  const handleConfigChange = (updater: (prev: ExamConfig) => ExamConfig) => {
    const updated = updater(currentConfig);
    onUpdateExamConfig(currentConfig.id, updated);
  };

  // Update subject details
  const handleSubjectChange = (
    index: number,
    field: keyof SubjectConfig,
    value: any
  ) => {
    handleConfigChange((prev) => {
      const nextSubjects = [...prev.subjects];
      nextSubjects[index] = {
        ...nextSubjects[index],
        [field]: value,
      };
      if (field === 'maxMarks' && typeof value === 'number') {
        nextSubjects[index].passMarks = Math.round(value * 0.33);
      }
      return { ...prev, subjects: nextSubjects };
    });
  };

  // Add subject paper
  const handleAddSubject = (name: string = 'New Paper') => {
    handleConfigChange((prev) => ({
      ...prev,
      subjects: [
        ...prev.subjects,
        {
          name,
          maxMarks: 80,
          passMarks: 26,
          includedInTotal: true,
        },
      ],
    }));
    showToast(`Added paper: ${name}`);
  };

  // Remove subject paper
  const handleRemoveSubject = (index: number) => {
    if (currentConfig.subjects.length <= 1) {
      alert('An exam must have at least one paper.');
      return;
    }
    const removedName = currentConfig.subjects[index].name;
    handleConfigChange((prev) => ({
      ...prev,
      subjects: prev.subjects.filter((_, i) => i !== index),
    }));
    showToast(`Removed paper: ${removedName}`);
  };

  // Create new test (PT1, PT2, SA1, etc.)
  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExamTitle.trim()) {
      alert('Please enter exam name (e.g. PT-1, PT-2, SA-1, Term 1).');
      return;
    }

    const testCode = (newExamCode.trim() || newExamTitle.trim()).toUpperCase().replace(/\s+/g, '-');
    const testId = testCode || `TEST-${Date.now().toString().slice(-4)}`;
    const newConfig: ExamConfig = {
      id: testId,
      name: newExamTitle.trim(),
      code: testCode,
      totalFormula: 'CUSTOM',
      customFormula: '= p1 + p2 + p3 + p4 + p5 + p6 + p7',
      subjects: PRESET_SUBJECTS.map((name) => ({
        name,
        maxMarks: newExamDefaultMax,
        passMarks: Math.round(newExamDefaultMax * 0.33),
        includedInTotal: true,
      })),
    };

    onCreateNewExam(newConfig);
    setEditingExamId(testId);
    onSetActiveExam(testId);
    setIsCreatingNew(false);
    setNewExamTitle('');
    setNewExamCode('');
    showToast(`Created new exam: ${newConfig.name}`);
  };

  // Calculate default formula string if not set
  const currentFormula = currentConfig.customFormula || `= ${currentConfig.subjects.map((_, i) => `p${i + 1}`).join(' + ')}`;

  const totalMaxMarks = currentConfig.subjects.reduce(
    (acc, s) => (s.includedInTotal !== false ? acc + s.maxMarks : acc),
    0
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 font-sans">
      {/* Top Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Exam &amp; Grading Settings
          </h1>
          <p className="text-xs text-slate-500 mt-1 font-normal">
            Manage exams, set maximum and passing marks for each subject, and check your Google Sheets backup.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreatingNew(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Exam</span>
          </button>
          <button
            onClick={() => {
              if (confirm('Reset exam settings back to standard school defaults?')) {
                onResetDefaults();
                showToast('Reset all exam settings');
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            <span>Reset Defaults</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: List of Exams */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
              <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                Exams &amp; Tests ({Object.keys(examConfigs).length})
              </h2>
            </div>

            <div className="space-y-2">
              {Object.values(examConfigs).map((exam) => {
                const isSelected = exam.id === editingExamId;
                const isActiveInLedger = exam.id === activeExamId;
                const subjectsCount = exam.subjects.length;
                const totalPossible = exam.subjects.reduce((sum, s) => sum + s.maxMarks, 0);

                return (
                  <div
                    key={exam.id}
                    onClick={() => setEditingExamId(exam.id)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                      isSelected
                        ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500/20 shadow-xs'
                        : 'border-slate-200/90 hover:border-slate-300 hover:bg-slate-50/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-bold text-xs text-slate-900 flex items-center gap-1.5">
                        <span>{exam.name}</span>
                        <span className="font-mono text-[10px] text-slate-400 font-normal">({exam.code})</span>
                      </div>
                      {isActiveInLedger && (
                        <span className="shrink-0 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Active
                        </span>
                      )}
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                      <span>{subjectsCount} Subjects</span>
                      <span>Total Max: {totalPossible}m</span>
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                      {isActiveInLedger ? (
                        <span className="text-[10px] text-emerald-700 font-semibold">Currently Active</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSetActiveExam(exam.id);
                            showToast(`Active exam switched to ${exam.name}`);
                          }}
                          className="text-[10px] font-bold text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                        >
                          Set Active →
                        </button>
                      )}

                      {!['SA-1', 'SA-2', 'PT-1', 'PT-2', 'PT-3', 'PT-4'].includes(exam.id) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Delete exam "${exam.name}"?`)) {
                              onDeleteExam(exam.id);
                              showToast(`Deleted ${exam.name}`);
                            }
                          }}
                          title="Delete test"
                          className="text-slate-400 hover:text-rose-600 p-1 rounded cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column: Configure Marks & Manual Formula */}
        <div className="lg:col-span-8 space-y-6">
          {/* 1. Paper Marks & Pass Criteria */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-extrabold text-slate-900">
                    1. Subjects &amp; Passing Marks
                  </h2>
                  <span className="px-2 py-0.5 text-[11px] font-mono font-bold bg-blue-50 text-blue-800 rounded-md border border-blue-200">
                    {currentConfig.name}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Set the maximum marks and passing marks for each subject in this exam.
                </p>
              </div>

              {/* Set All Max Preset Buttons */}
              <div className="flex items-center gap-1 text-xs text-slate-500 shrink-0">
                <span className="font-semibold text-[11px] text-slate-600 mr-1">Set all to:</span>
                {[20, 40, 50, 80, 100].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => {
                      handleConfigChange((prev) => ({
                        ...prev,
                        subjects: prev.subjects.map((s) => ({
                          ...s,
                          maxMarks: val,
                          passMarks: Math.round(val * 0.33),
                        })),
                      }));
                      showToast(`Set all papers to ${val} marks`);
                    }}
                    className="px-2 py-1 text-[11px] font-mono font-bold bg-slate-50 border border-slate-200/90 hover:bg-slate-100 rounded-md text-slate-800 cursor-pointer transition-colors"
                  >
                    {val}m
                  </button>
                ))}
              </div>
            </div>

            {/* Papers Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 text-center w-12">Code</th>
                    <th className="py-2.5 px-3">Subject Name</th>
                    <th className="py-2.5 px-3 text-center w-28">Max Marks</th>
                    <th className="py-2.5 px-3 text-center w-28">Pass Marks</th>
                    <th className="py-2.5 px-3 text-center w-16">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentConfig.subjects.map((sub, idx) => {
                    const alias = `p${idx + 1}`;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2 px-3 text-center">
                          <span className="font-mono font-bold text-xs bg-blue-100/80 text-blue-900 border border-blue-300/80 px-2 py-0.5 rounded-md inline-block">
                            {alias}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            value={sub.name}
                            onChange={(e) => handleSubjectChange(idx, 'name', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-900 font-semibold focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={sub.maxMarks}
                            onChange={(e) =>
                              handleSubjectChange(idx, 'maxMarks', parseInt(e.target.value, 10) || 1)
                            }
                            className="w-20 px-2 py-1.5 text-center font-mono font-bold bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs mx-auto"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <input
                            type="number"
                            min={1}
                            max={sub.maxMarks}
                            value={sub.passMarks}
                            onChange={(e) =>
                              handleSubjectChange(idx, 'passMarks', parseInt(e.target.value, 10) || 1)
                            }
                            className="w-20 px-2 py-1.5 text-center font-mono font-bold bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500 text-xs mx-auto"
                          />
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveSubject(idx)}
                            title="Remove paper"
                            className="text-slate-400 hover:text-rose-600 p-1 rounded cursor-pointer transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Quick Add Subject */}
            <div className="flex items-center justify-between gap-2 pt-1">
              <span className="text-xs text-slate-500">
                Total Max Possible: <strong className="font-mono text-slate-900">{totalMaxMarks} Marks</strong>
              </span>
              <button
                type="button"
                onClick={() => handleAddSubject(`Subject ${currentConfig.subjects.length + 1}`)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-800 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-slate-600" />
                <span>Add Subject</span>
              </button>
            </div>
          </div>

          {/* 2. Manual Totaling Formula */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-blue-600" />
                  2. Total Marks Calculation
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choose how total marks are calculated using the subject codes (<code className="font-mono text-blue-700 bg-blue-50 px-1 rounded">p1, p2, p3...</code>) shown above.
                </p>
              </div>
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-slate-100 text-slate-700 rounded border border-slate-200 uppercase">
                Formula
              </span>
            </div>

            {/* Formula Bar Input */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-slate-900 text-white p-2.5 rounded-xl border border-slate-800 shadow-inner">
                <span className="font-mono font-extrabold text-amber-400 text-sm pl-2 shrink-0 select-none">
                  fx =
                </span>
                <input
                  type="text"
                  value={currentFormula}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleConfigChange((prev) => ({
                      ...prev,
                      totalFormula: 'CUSTOM',
                      customFormula: val,
                    }));
                  }}
                  placeholder="= p1 + p2 + p3 + p4 + p5 + p6 + p7"
                  className="w-full bg-transparent text-emerald-400 font-mono text-sm font-bold focus:outline-none tracking-wide"
                />
              </div>

              {/* Tokens for Papers */}
              <div className="space-y-1.5 bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                  <span>Select paper alias to insert:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const defaultStr = `= ${currentConfig.subjects.map((_, i) => `p${i + 1}`).join(' + ')}`;
                      handleConfigChange((prev) => ({
                        ...prev,
                        totalFormula: 'CUSTOM',
                        customFormula: defaultStr,
                      }));
                      showToast('Reset formula to sum all papers');
                    }}
                    className="text-[10px] text-blue-600 font-bold hover:underline cursor-pointer"
                  >
                    Reset Standard Sum
                  </button>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {currentConfig.subjects.map((sub, idx) => {
                    const alias = `p${idx + 1}`;
                    return (
                      <button
                        key={alias}
                        type="button"
                        onClick={() => {
                          const base = currentFormula.trim();
                          const updated = `${base} + ${alias}`;
                          handleConfigChange((prev) => ({
                            ...prev,
                            totalFormula: 'CUSTOM',
                            customFormula: updated,
                          }));
                        }}
                        className="px-2.5 py-1 bg-white border border-blue-200 hover:bg-blue-50 text-blue-900 rounded-lg font-mono text-xs font-bold cursor-pointer transition-colors shadow-2xs flex items-center gap-1"
                      >
                        <span className="text-blue-600">+</span>
                        <span className="bg-blue-100 px-1 text-[10px] rounded">{alias}</span>
                        <span className="text-[11px] font-normal text-slate-600">({sub.name})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Math Operators */}
                <div className="flex items-center gap-1 pt-1">
                  <span className="text-[10px] text-slate-500 font-semibold mr-1">Operators:</span>
                  {['+', '-', '*', '/', '(', ')'].map((op) => (
                    <button
                      key={op}
                      type="button"
                      onClick={() => {
                        const base = currentFormula.trim();
                        handleConfigChange((prev) => ({
                          ...prev,
                          totalFormula: 'CUSTOM',
                          customFormula: `${base} ${op} `,
                        }));
                      }}
                      className="px-2.5 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-800 rounded-md font-mono text-xs font-extrabold cursor-pointer"
                    >
                      {op}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Formula Status Card */}
            <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-950">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Current Formula:</div>
                  <div className="font-mono text-emerald-800 font-semibold mt-0.5">
                    {currentFormula}
                  </div>
                </div>
              </div>

              <div className="text-right font-mono text-[11px] shrink-0 bg-white px-3 py-1.5 rounded-lg border border-emerald-200">
                <div className="text-[10px] text-slate-400 font-sans uppercase font-bold">Status</div>
                <div className="font-bold text-emerald-700">Updates Automatically</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Create New Exam */}
      {isCreatingNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-xl w-full max-w-md p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-blue-600" />
                Create New Exam (e.g. PT1, PT2, SA1)
              </h3>
              <button
                type="button"
                onClick={() => setIsCreatingNew(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  Exam / Test Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. PT-1, PT-2, PT-3, SA-1, SA-2, Mid-Term"
                  value={newExamTitle}
                  onChange={(e) => setNewExamTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    Exam Code
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. PT1, SA1"
                    value={newExamCode}
                    onChange={(e) => setNewExamCode(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    Paper Max Marks
                  </label>
                  <select
                    value={newExamDefaultMax}
                    onChange={(e) => setNewExamDefaultMax(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-mono"
                  >
                    <option value={20}>20 Marks (PT Test)</option>
                    <option value={40}>40 Marks (Test)</option>
                    <option value={50}>50 Marks (Midterm)</option>
                    <option value={80}>80 Marks (SA Exam)</option>
                    <option value={100}>100 Marks (Full)</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold shadow-sm cursor-pointer"
                >
                  Create & Activate Exam
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Recreated Google Sheets Connection Card */}
      <div className="mt-6">
        <GoogleSheetsConnectCard
          students={students}
          selectedExam={activeExamId}
          onSyncSuccess={onGoogleSheetsSync}
          showToast={showToast}
          lastSyncTime={lastSyncTime}
          sheetsSyncStatus={sheetsSyncStatus}
        />
      </div>

      {/* Cloud Schema & Column Mapping Section */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-xs space-y-4 mt-6">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Google Sheet Column Layout
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Shows how student details and marks are arranged in the connected Google Sheet.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px] font-semibold">
              <tr>
                <th className="py-2.5 px-3">Column</th>
                <th className="py-2.5 px-3">What It Stores</th>
                <th className="py-2.5 px-3">Format</th>
                <th className="py-2.5 px-3">Example</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono text-[11px] text-slate-700">
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">A</td>
                <td className="py-2 px-3 font-sans">Roll Number</td>
                <td className="py-2 px-3 text-slate-500 font-sans">Number</td>
                <td className="py-2 px-3 text-slate-500">01</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">B</td>
                <td className="py-2 px-3 font-sans">Student Name</td>
                <td className="py-2 px-3 text-slate-500 font-sans">Text</td>
                <td className="py-2 px-3 text-slate-500">Ajinkya Balu Gurav</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">C</td>
                <td className="py-2 px-3 font-sans">Class &amp; Section</td>
                <td className="py-2 px-3 text-slate-500 font-sans">Class Name</td>
                <td className="py-2 px-3 text-slate-500">Sparkle</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">D–J</td>
                <td className="py-2 px-3 font-sans">7 Subject Marks</td>
                <td className="py-2 px-3 text-slate-500 font-sans">0–100 or &apos;AB&apos;</td>
                <td className="py-2 px-3 text-slate-500">Eng: 88, Math: 95, Sci: 92...</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">K</td>
                <td className="py-2 px-3 font-sans">Total Marks</td>
                <td className="py-2 px-3 text-slate-500">Formula (=SUM(D2:J2))</td>
                <td className="py-2 px-3 text-slate-500">634 / 700</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">L</td>
                <td className="py-2 px-3 font-sans">Percentage</td>
                <td className="py-2 px-3 text-slate-500">Formula (=K2/7)</td>
                <td className="py-2 px-3 text-slate-500">90.6%</td>
              </tr>
              <tr>
                <td className="py-2 px-3 font-semibold text-slate-900">M</td>
                <td className="py-2 px-3 font-sans">Overall Grade</td>
                <td className="py-2 px-3 text-slate-500 font-sans">CBSE Grade (A1–E)</td>
                <td className="py-2 px-3 text-emerald-700 font-semibold">A1</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
