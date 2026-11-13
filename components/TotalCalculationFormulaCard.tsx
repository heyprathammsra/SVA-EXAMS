'use client';

import React, { useState, useMemo } from 'react';
import {
  Check,
  Calculator,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  ClassDefinition,
  DEFAULT_SVA_CLASSES,
  ExamConfig,
  TotalFormulaType,
  StudentReportRow,
  getEffectiveExamConfigForClass,
  evaluateCustomFormula,
  computeStudentResult,
  getClassGradeFromSection,
} from '@/lib/report-card-types';
import { formatClassGradeShortLabel, getGradeForSection } from '@/lib/erp-persistence';

function buildSpecificClassOptions(
  classes: ClassDefinition[]
): { value: string; label: string }[] {
  const byGrade = new Map<string, string[]>();
  classes.forEach((c) => {
    const arr = byGrade.get(c.grade) || [];
    arr.push(c.section);
    byGrade.set(c.grade, arr);
  });
  return [
    { value: 'ALL', label: 'All Classes' },
    ...classes.map((c) => ({
      value: c.section,
      label: formatClassGradeShortLabel(classes, c.section),
    })),
    ...Array.from(byGrade.entries()).map(([grade, sections]) => ({
      value: grade,
      label: `${grade} (${sections.join(' & ')})`,
    })),
  ];
}

function getClassDisplayLabel(
  scope: string,
  options: { value: string; label: string }[]
): string {
  if (!scope || scope === 'ALL' || scope === 'all') return 'All Classes';
  const found = options.find((o) => o.value === scope);
  return found ? found.label : scope;
}

type SimplePresetId = 'ALL_SUBJECTS' | 'BEST_5' | 'BEST_6' | 'WRITTEN_ONLY' | 'CUSTOM';

function getActiveSimplePreset(
  totalFormula?: TotalFormulaType,
  customFormula?: string,
  totalSubjectsCount: number = 7
): SimplePresetId {
  if (!totalFormula || totalFormula === 'SUM') return 'ALL_SUBJECTS';
  if (totalFormula === 'BEST_5') return 'BEST_5';

  const raw = (customFormula || '').trim();
  const upper = raw.toUpperCase().replace(/\s+/g, '');

  if (!raw || upper === 'SUM' || upper === 'SUM_MAIN+SUM_INTERNAL') {
    return 'ALL_SUBJECTS';
  }
  if (upper === 'BEST(5)') return 'BEST_5';
  if (upper === 'BEST(6)') return 'BEST_6';
  if (upper === 'SUM_MAIN') return 'WRITTEN_ONLY';

  // If it's a pure additive subject list like [English] + [Hindi] ...
  if (/^\s*\[[^\]:]+\](\s*\+\s*\[[^\]:]+\])*\s*$/.test(raw)) {
    return 'ALL_SUBJECTS';
  }

  void totalSubjectsCount;
  return 'CUSTOM';
}

interface TotalCalculationFormulaCardProps {
  baseExamConfig: ExamConfig;
  activeExamId: string;
  selectedClass?: string;
  onSelectClassScope?: (scope: string) => void;
  students: StudentReportRow[];
  classes?: ClassDefinition[];
  onUpdateExamConfig: (
    examId: string,
    updated: ExamConfig,
    classScope?: string
  ) => void;
  showToast?: (message: string) => void;
}

export default function TotalCalculationFormulaCard({
  baseExamConfig,
  selectedClass = 'ALL',
  onSelectClassScope,
  students,
  classes = DEFAULT_SVA_CLASSES,
  onUpdateExamConfig,
  showToast,
}: TotalCalculationFormulaCardProps) {
  const [localScope, setLocalScope] = useState<string>('ALL');
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);

  const specificClassOptions = useMemo(
    () => buildSpecificClassOptions(classes),
    [classes]
  );

  const activeClassScope =
    selectedClass && selectedClass !== 'all' ? selectedClass : localScope;

  const handleScopeChange = (newScope: string) => {
    setLocalScope(newScope);
    onSelectClassScope?.(newScope);
  };

  const currentConfig: ExamConfig = useMemo(
    () => getEffectiveExamConfigForClass(baseExamConfig, activeClassScope),
    [baseExamConfig, activeClassScope]
  );

  const currentTotalFormula: TotalFormulaType = currentConfig.totalFormula || 'SUM';
  const currentCustomFormula = currentConfig.customFormula ?? 'SUM_MAIN + SUM_INTERNAL';

  const activePreset = useMemo(
    () =>
      getActiveSimplePreset(
        currentConfig.totalFormula,
        currentConfig.customFormula,
        currentConfig.subjects.length
      ),
    [currentConfig.totalFormula, currentConfig.customFormula, currentConfig.subjects.length]
  );

  // Sample student for live total preview
  const sampleStudent = useMemo(() => {
    if (!students || students.length === 0) return null;
    if (activeClassScope !== 'ALL') {
      const match = students.find(
        (s) =>
          s.section === activeClassScope ||
          s.class === activeClassScope ||
          getGradeForSection(classes, s.section) === activeClassScope ||
          getClassGradeFromSection(s.section, classes) === activeClassScope
      );
      if (match) return match;
    }
    return students[0];
  }, [students, activeClassScope, classes]);

  const previewEvaluation = useMemo(() => {
    if (!currentConfig.subjects || currentConfig.subjects.length === 0) return null;
    if (sampleStudent) {
      const effectiveSubjects =
        activeClassScope === 'ALL'
          ? getEffectiveExamConfigForClass(baseExamConfig, sampleStudent.section).subjects
          : currentConfig.subjects;
      const res = computeStudentResult(
        sampleStudent,
        effectiveSubjects,
        currentTotalFormula,
        currentCustomFormula,
        currentConfig.resultCriteria
      );
      return { obtained: res.totalObtained, max: res.totalMax };
    }
    const sampleMarks: Record<string, number> = {};
    currentConfig.subjects.forEach((s) => {
      sampleMarks[s.name] = Math.round(s.maxMarks * 0.82);
    });
    const formulaToTest =
      currentTotalFormula === 'CUSTOM' ? currentCustomFormula : currentTotalFormula;
    return evaluateCustomFormula(formulaToTest, sampleMarks, currentConfig.subjects);
  }, [
    currentTotalFormula,
    currentCustomFormula,
    sampleStudent,
    currentConfig.subjects,
    currentConfig.resultCriteria,
    activeClassScope,
    baseExamConfig,
  ]);

  const updateFormulaConfig = (
    formulaType: TotalFormulaType,
    customStr?: string,
    toastLabel?: string
  ) => {
    const resolvedCustom = customStr ?? baseExamConfig.customFormula ?? 'SUM_MAIN + SUM_INTERNAL';
    if (activeClassScope === 'ALL') {
      let syncedOverrides = baseExamConfig.classOverrides;
      if (syncedOverrides && Object.keys(syncedOverrides).length > 0) {
        const nextOverrides: NonNullable<ExamConfig['classOverrides']> = {};
        Object.entries(syncedOverrides).forEach(([clsKey, ov]) => {
          nextOverrides[clsKey] = {
            ...ov,
            totalFormula: formulaType,
            customFormula: resolvedCustom,
          };
        });
        syncedOverrides = nextOverrides;
      }
      onUpdateExamConfig(
        baseExamConfig.id,
        {
          ...baseExamConfig,
          totalFormula: formulaType,
          customFormula: resolvedCustom,
          classOverrides: syncedOverrides,
        },
        'ALL'
      );
    } else {
      const prevOverride = baseExamConfig.classOverrides?.[activeClassScope] || {};
      const nextOverrides = {
        ...(baseExamConfig.classOverrides || {}),
        [activeClassScope]: {
          ...prevOverride,
          totalFormula: formulaType,
          customFormula: customStr ?? currentConfig.customFormula ?? 'SUM_MAIN + SUM_INTERNAL',
        },
      };

      if (activeClassScope.startsWith('Class ')) {
        Object.keys(nextOverrides).forEach((k) => {
          if (
            k !== activeClassScope &&
            getGradeForSection(classes, k) === activeClassScope
          ) {
            delete nextOverrides[k];
          }
        });
      }

      onUpdateExamConfig(
        baseExamConfig.id,
        {
          ...baseExamConfig,
          classOverrides: nextOverrides,
        },
        activeClassScope
      );
    }

    if (toastLabel) {
      showToast?.(
        `${toastLabel} applied to ${getClassDisplayLabel(activeClassScope, specificClassOptions)}`
      );
    }
  };

  // Which subjects are checked when "All Subjects" is active
  const includedSubjects = useMemo(() => {
    const allNames = currentConfig.subjects.map((s) => s.name);
    if (
      currentTotalFormula === 'CUSTOM' &&
      currentCustomFormula.includes('[') &&
      !currentCustomFormula.includes(':')
    ) {
      const matches = allNames.filter((name) =>
        currentCustomFormula.toLowerCase().includes(`[${name.toLowerCase()}]`)
      );
      if (matches.length > 0) return matches;
    }
    return allNames;
  }, [currentConfig.subjects, currentTotalFormula, currentCustomFormula]);

  const handleToggleSubject = (subjectName: string) => {
    const isChecked = includedSubjects.includes(subjectName);
    let nextSelected: string[];

    if (isChecked) {
      if (includedSubjects.length <= 1) {
        showToast?.('At least 1 subject must stay selected');
        return;
      }
      nextSelected = includedSubjects.filter((s) => s !== subjectName);
    } else {
      nextSelected = currentConfig.subjects
        .map((s) => s.name)
        .filter((name) => includedSubjects.includes(name) || name === subjectName);
    }

    if (nextSelected.length === currentConfig.subjects.length) {
      updateFormulaConfig('SUM', undefined, 'All Subjects Included');
    } else {
      const formula = nextSelected.map((name) => `[${name}]`).join(' + ');
      updateFormulaConfig(
        'CUSTOM',
        formula,
        `${nextSelected.length} of ${currentConfig.subjects.length} Subjects Included`
      );
    }
  };

  const singleSubMax = currentConfig.subjects[0]?.maxMarks || 100;
  const allSubMax = currentConfig.subjects.reduce((acc, s) => acc + (s.maxMarks || 0), 0);

  return (
    <div className="bg-white border border-slate-200/85 rounded-2xl p-5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] space-y-4">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Total Calculation
            </h2>
            <select
              value={activeClassScope}
              onChange={(e) => handleScopeChange(e.target.value)}
              aria-label="Apply Total Calculation Rule To"
              className="text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-slate-200/70 border border-slate-200/80 rounded-md px-2 py-0.5 focus:outline-none focus:border-blue-600 cursor-pointer"
            >
              {specificClassOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Choose how total marks and percentage are calculated
          </p>
        </div>

        {previewEvaluation && (
          <div className="text-xs text-slate-500 font-mono flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-200/70 self-start sm:self-auto">
            <span className="text-slate-400 font-sans text-[11px]">Sample Total:</span>
            <strong className="text-slate-900 font-bold">{previewEvaluation.obtained}</strong>
            <span className="text-slate-400">/</span>
            <span className="text-slate-600">{previewEvaluation.max}</span>
            <span className="text-emerald-700 font-semibold">
              ({((previewEvaluation.obtained / (previewEvaluation.max || 1)) * 100).toFixed(1)}%)
            </span>
          </div>
        )}
      </div>

      {/* Simple 4-Option Selector */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          {
            id: 'ALL_SUBJECTS' as const,
            title: 'All Subjects',
            subtitle: `${allSubMax} Marks Total`,
            onClick: () => updateFormulaConfig('SUM', undefined, 'All Subjects'),
          },
          {
            id: 'BEST_5' as const,
            title: 'Best 5 Subjects',
            subtitle: `Top 5 (${singleSubMax * 5}m)`,
            onClick: () => updateFormulaConfig('CUSTOM', 'BEST(5)', 'Best 5 Subjects'),
          },
          {
            id: 'BEST_6' as const,
            title: 'Best 6 Subjects',
            subtitle: `Top 6 (${singleSubMax * 6}m)`,
            onClick: () => updateFormulaConfig('CUSTOM', 'BEST(6)', 'Best 6 Subjects'),
          },
          {
            id: 'WRITTEN_ONLY' as const,
            title: 'Written Exam Only',
            subtitle: 'Ignore Internals',
            onClick: () => updateFormulaConfig('CUSTOM', 'SUM_MAIN', 'Written Exam Only'),
          },
        ].map((item) => {
          const isSelected = activePreset === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-blue-600 bg-blue-50/70 ring-1 ring-blue-600/20'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span
                  className={`text-xs font-semibold ${
                    isSelected ? 'text-blue-700' : 'text-slate-900'
                  }`}
                >
                  {item.title}
                </span>
                {isSelected && (
                  <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{item.subtitle}</div>
            </button>
          );
        })}
      </div>

      {/* Subject Checkboxes (Only shown when "All Subjects" is active so user can easily uncheck extra subjects like Computer Science) */}
      {activePreset === 'ALL_SUBJECTS' && (
        <div className="pt-2 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-600 font-medium">
              Subjects counted in Grand Total ({includedSubjects.length} of{' '}
              {currentConfig.subjects.length}):
            </span>
            {includedSubjects.length < currentConfig.subjects.length && (
              <button
                type="button"
                onClick={() => updateFormulaConfig('SUM', undefined, 'All Subjects Included')}
                className="text-[11px] font-medium text-blue-600 hover:underline cursor-pointer"
              >
                Select All
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {currentConfig.subjects.map((sub) => {
              const isChecked = includedSubjects.includes(sub.name);
              return (
                <button
                  key={sub.name}
                  type="button"
                  onClick={() => handleToggleSubject(sub.name)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs transition-all cursor-pointer ${
                    isChecked
                      ? 'bg-blue-50/60 border-blue-200 text-slate-900 font-medium'
                      : 'bg-slate-50 border-slate-200 text-slate-400 line-through'
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded flex items-center justify-center ${
                      isChecked
                        ? 'bg-blue-600 text-white'
                        : 'border border-slate-300 bg-white'
                    }`}
                  >
                    {isChecked && <Check className="w-2.5 h-2.5" />}
                  </span>
                  <span>{sub.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Minimal Custom Formula Toggle */}
      <div className="pt-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowCustomInput((v) => !v)}
          className="text-[11px] text-slate-400 hover:text-slate-600 flex items-center gap-1 cursor-pointer"
        >
          <Calculator className="w-3 h-3" />
          <span>{showCustomInput ? 'Hide custom formula' : 'Custom formula'}</span>
          {showCustomInput ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </div>

      {showCustomInput && (
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={currentTotalFormula === 'SUM' ? 'SUM' : currentCustomFormula}
              onChange={(e) => updateFormulaConfig('CUSTOM', e.target.value)}
              placeholder="e.g. BEST(5) or (SUM_MAIN * 0.8) + (SUM_INTERNAL * 0.2)"
              className="flex-1 font-mono text-xs text-slate-900 bg-white border border-slate-300 rounded-md px-2.5 py-1.5 focus:outline-none focus:border-blue-600"
            />
            <button
              type="button"
              onClick={() => updateFormulaConfig('SUM', undefined, 'Reset to All Subjects')}
              className="px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-md cursor-pointer"
            >
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
