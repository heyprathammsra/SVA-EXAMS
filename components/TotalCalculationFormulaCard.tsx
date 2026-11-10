'use client';

import React, { useState, useMemo } from 'react';
import {
  Layers,
  Check,
  Calculator,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  ChevronRight,
  Info,
} from 'lucide-react';
import {
  ExamConfig,
  TotalFormulaType,
  StudentReportRow,
  SubjectConfig,
  getEffectiveExamConfigForClass,
  evaluateCustomFormula,
  getClassGradeFromSection,
} from '@/lib/report-card-types';
import { SVA_ALL_CLASSES } from '@/lib/sva-students-data';

const SPECIFIC_CLASS_OPTIONS: { value: string; label: string; group: string }[] = [
  { value: 'Sparkle', label: '6 Sparkle', group: 'Classes (Sections)' },
  { value: 'Twinkle', label: '6 Twinkle', group: 'Classes (Sections)' },
  { value: 'Topaz', label: '7 Topaz', group: 'Classes (Sections)' },
  { value: 'Jade', label: '7 Jade', group: 'Classes (Sections)' },
  { value: 'Garnet', label: '8 Garnet', group: 'Classes (Sections)' },
  { value: 'Emerald', label: '8 Emerald', group: 'Classes (Sections)' },
  { value: 'Ruby', label: '9 Ruby', group: 'Classes (Sections)' },
  { value: 'Diamond', label: '9 Diamond', group: 'Classes (Sections)' },
  { value: 'Class 6', label: 'Class 6 (Sparkle & Twinkle)', group: 'Whole Grades' },
  { value: 'Class 7', label: 'Class 7 (Topaz & Jade)', group: 'Whole Grades' },
  { value: 'Class 8', label: 'Class 8 (Garnet & Emerald)', group: 'Whole Grades' },
  { value: 'Class 9', label: 'Class 9 (Ruby & Diamond)', group: 'Whole Grades' },
];

function getClassDisplayLabel(scope: string): string {
  if (!scope || scope === 'ALL' || scope === 'all') return 'All Classes';
  const found = SPECIFIC_CLASS_OPTIONS.find((o) => o.value === scope);
  return found ? found.label : scope;
}

interface TotalCalculationFormulaCardProps {
  baseExamConfig: ExamConfig;
  activeExamId: string;
  selectedClass?: string;
  students: StudentReportRow[];
  onUpdateExamConfig: (
    examId: string,
    updated: ExamConfig,
    classScope?: string
  ) => void;
  showToast?: (message: string) => void;
}

export default function TotalCalculationFormulaCard({
  baseExamConfig,
  activeExamId,
  selectedClass,
  students,
  onUpdateExamConfig,
  showToast,
}: TotalCalculationFormulaCardProps) {
  // Class Scope: 'ALL' vs 'SPECIFIC'
  const [classScopeMode, setClassScopeMode] = useState<'ALL' | 'SPECIFIC'>('ALL');
  const [selectedSpecificClass, setSelectedSpecificClass] = useState<string>(
    selectedClass && selectedClass !== 'all' ? selectedClass : 'Diamond'
  );

  const activeClassScope = classScopeMode === 'ALL' ? 'ALL' : selectedSpecificClass;

  // Effective config for currently selected scope
  const currentConfig: ExamConfig = useMemo(
    () => getEffectiveExamConfigForClass(baseExamConfig, activeClassScope),
    [baseExamConfig, activeClassScope]
  );

  const currentTotalFormula: TotalFormulaType =
    currentConfig.totalFormula === 'CUSTOM' ? 'CUSTOM' : 'SUM';
  const currentCustomFormula = currentConfig.customFormula || 'SUM_MAIN + SUM_INTERNAL';

  // Sample student for real-time live preview calculation
  const sampleStudent = useMemo(() => {
    if (!students || students.length === 0) return null;
    if (activeClassScope !== 'ALL') {
      const match = students.find(
        (s) =>
          s.section === activeClassScope ||
          s.class === activeClassScope ||
          getClassGradeFromSection(s.section) === activeClassScope
      );
      if (match) return match;
    }
    return students[0];
  }, [students, activeClassScope]);

  // Preview evaluation
  const previewEvaluation = useMemo(() => {
    if (!currentConfig.subjects || currentConfig.subjects.length === 0) return null;
    const formulaToTest =
      currentTotalFormula === 'CUSTOM' ? currentCustomFormula : currentTotalFormula;
    if (sampleStudent) {
      return evaluateCustomFormula(
        formulaToTest,
        sampleStudent.marks,
        currentConfig.subjects,
        sampleStudent.breakdowns
      );
    }
    const sampleMarks: Record<string, number> = {};
    currentConfig.subjects.forEach((s) => {
      sampleMarks[s.name] = Math.round(s.maxMarks * 0.82);
    });
    return evaluateCustomFormula(formulaToTest, sampleMarks, currentConfig.subjects);
  }, [currentTotalFormula, currentCustomFormula, sampleStudent, currentConfig.subjects]);

  // Handler to update config
  const handleConfigChange = (updater: (prev: ExamConfig) => ExamConfig) => {
    if (activeClassScope === 'ALL') {
      const updatedBase = updater(baseExamConfig);
      onUpdateExamConfig(
        baseExamConfig.id,
        {
          ...updatedBase,
          classOverrides: baseExamConfig.classOverrides,
        },
        'ALL'
      );
    } else {
      const updatedForClass = updater(currentConfig);
      const prevOverride = baseExamConfig.classOverrides?.[activeClassScope] || {};

      const nextClassOverride = {
        ...prevOverride,
        totalFormula: updatedForClass.totalFormula,
        customFormula: updatedForClass.customFormula,
      };

      const nextOverrides = {
        ...(baseExamConfig.classOverrides || {}),
        [activeClassScope]: nextClassOverride,
      };

      // If user edited a whole grade (e.g. 'Class 9'), sync constituent sections if they had overrides
      if (activeClassScope.startsWith('Class ')) {
        Object.keys(nextOverrides).forEach((k) => {
          if (k !== activeClassScope && getClassGradeFromSection(k) === activeClassScope) {
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
  };

  const handleSetTotalFormula = (formulaType: TotalFormulaType) => {
    handleConfigChange((prev) => ({
      ...prev,
      totalFormula: formulaType,
      customFormula:
        formulaType === 'CUSTOM' && !prev.customFormula
          ? 'SUM_MAIN + SUM_INTERNAL'
          : prev.customFormula,
    }));
    showToast?.(
      `Set formula to ${formulaType === 'CUSTOM' ? 'Custom Formula' : 'Standard Sum'} for ${getClassDisplayLabel(activeClassScope)}`
    );
  };

  const handleCustomFormulaChange = (newFormula: string) => {
    handleConfigChange((prev) => ({
      ...prev,
      customFormula: newFormula,
    }));
  };

  const handleInsertFormulaToken = (token: string) => {
    handleConfigChange((prev) => {
      const cur = (prev.customFormula || '').trim();
      let nextStr = '';
      if (!cur) {
        nextStr = token;
      } else if (
        ['+', '-', '*', '/', '(', ')'].includes(token) ||
        cur.endsWith('(') ||
        cur.endsWith('+') ||
        cur.endsWith('-') ||
        cur.endsWith('*') ||
        cur.endsWith('/') ||
        token.startsWith(')') ||
        token.startsWith('*')
      ) {
        nextStr = `${cur} ${token}`;
      } else {
        nextStr = `${cur} + ${token}`;
      }
      return {
        ...prev,
        customFormula: nextStr,
      };
    });
  };

  const handleResetClassOverride = (clsKey: string) => {
    if (!baseExamConfig.classOverrides?.[clsKey]) return;
    const nextOverrides = { ...baseExamConfig.classOverrides };
    delete nextOverrides[clsKey];
    onUpdateExamConfig(
      baseExamConfig.id,
      {
        ...baseExamConfig,
        classOverrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
      },
      clsKey
    );
    showToast?.(`Reset ${getClassDisplayLabel(clsKey)} to All Classes settings`);
  };

  const handleSelectClassFromOverview = (clsName: string) => {
    setClassScopeMode('SPECIFIC');
    setSelectedSpecificClass(clsName);
  };

  // Inspect formula applied to all 8 classes
  const classesFormulaSummary = useMemo(() => {
    return SVA_ALL_CLASSES.map((clsName) => {
      const effective = getEffectiveExamConfigForClass(baseExamConfig, clsName);
      const isCustomized = Boolean(
        baseExamConfig.classOverrides?.[clsName] ||
          baseExamConfig.classOverrides?.[getClassGradeFromSection(clsName)]
      );
      const isCurrentlySelected =
        classScopeMode === 'SPECIFIC' && selectedSpecificClass === clsName;

      return {
        clsName,
        displayLabel: getClassDisplayLabel(clsName),
        totalFormula: effective.totalFormula,
        customFormula: effective.customFormula,
        isCustomized,
        isCurrentlySelected,
      };
    });
  }, [baseExamConfig, classScopeMode, selectedSpecificClass]);

  const hasSpecificOverride =
    activeClassScope !== 'ALL' && Boolean(baseExamConfig.classOverrides?.[activeClassScope]);

  return (
    <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs space-y-4">
      {/* 1. Header: Total Calculation & Formula, Mode Badge, and Live Preview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">
              Total Calculation & Formula
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-medium">
              {currentTotalFormula === 'CUSTOM' ? 'Custom Formula' : 'Standard Sum'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure how student totals are computed across main exams and internal assessments
          </p>
        </div>

        {previewEvaluation && (
          <div className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg self-start sm:self-auto shadow-2xs">
            <span className="text-slate-400 text-[11px]">Preview:</span>
            <span className="font-mono font-semibold text-slate-800">
              {previewEvaluation.obtained}
            </span>
            <span className="text-slate-400">/</span>
            <span className="font-mono text-slate-600">
              {previewEvaluation.max}
            </span>
            <span className="text-[11px] font-medium text-emerald-600 ml-1">
              ({((previewEvaluation.obtained / (previewEvaluation.max || 1)) * 100).toFixed(2)}%)
            </span>
          </div>
        )}
      </div>

      {/* 2. Scope Bar: Apply Formula To: All Classes / Specific Class */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/70 border border-slate-200/70 rounded-lg px-3 py-2">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <Layers className="w-3.5 h-3.5 text-slate-400" />
          <span>Apply Formula To:</span>
          <strong className="text-slate-900 font-semibold">
            {getClassDisplayLabel(activeClassScope)}
          </strong>
          {hasSpecificOverride && (
            <span className="ml-1 text-[10px] bg-amber-50 text-amber-700 border border-amber-200/80 px-1.5 py-0.2 rounded font-medium">
              Custom Class Override
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {hasSpecificOverride && (
            <button
              type="button"
              onClick={() => handleResetClassOverride(activeClassScope)}
              className="text-[11px] text-rose-600 hover:text-rose-700 flex items-center gap-1 px-2 py-1 rounded hover:bg-rose-50 transition-colors cursor-pointer"
              title="Revert to All Classes default"
            >
              <RotateCcw className="w-3 h-3" />
              Reset to Default
            </button>
          )}

          <div className="inline-flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/80">
            <button
              type="button"
              onClick={() => setClassScopeMode('ALL')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                classScopeMode === 'ALL'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Classes
            </button>
            <button
              type="button"
              onClick={() => setClassScopeMode('SPECIFIC')}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                classScopeMode === 'SPECIFIC'
                  ? 'bg-white text-slate-900 font-semibold shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Specific Class
            </button>
          </div>

          {classScopeMode === 'SPECIFIC' && (
            <div className="flex items-center gap-1.5 animate-in fade-in duration-150">
              <select
                value={selectedSpecificClass}
                onChange={(e) => setSelectedSpecificClass(e.target.value)}
                aria-label="Select Specific Class"
                className="text-xs font-medium text-slate-800 bg-white border border-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-600 cursor-pointer shadow-xs"
              >
                <optgroup label="Classes (Sections)">
                  {SPECIFIC_CLASS_OPTIONS.filter((o) => o.group === 'Classes (Sections)').map(
                    (opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    )
                  )}
                </optgroup>
                <optgroup label="Whole Grades">
                  {SPECIFIC_CLASS_OPTIONS.filter((o) => o.group === 'Whole Grades').map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* 3. Formulas Applied on Every Class (Overview Matrix / Grid) */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700 flex items-center gap-1.5">
            <Calculator className="w-3.5 h-3.5 text-blue-600" />
            Formulas Applied on Every Class ({classesFormulaSummary.length} Classes)
          </span>
          <span className="text-[11px] text-slate-400">
            Click any class to edit or inspect its formula
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {classesFormulaSummary.map((cls) => {
            const isStandard = cls.totalFormula !== 'CUSTOM';
            return (
              <button
                key={cls.clsName}
                type="button"
                onClick={() => handleSelectClassFromOverview(cls.clsName)}
                className={`text-left p-2 rounded-lg border transition-all cursor-pointer relative group ${
                  cls.isCurrentlySelected
                    ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-600/30 shadow-xs'
                    : cls.isCustomized
                    ? 'border-purple-300 bg-purple-50/30 hover:border-purple-400'
                    : 'border-slate-200 bg-slate-50/40 hover:bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-semibold text-slate-900 truncate">
                    {cls.displayLabel}
                  </span>
                  {cls.isCustomized && (
                    <span
                      title="Custom Override"
                      className="w-1.5 h-1.5 rounded-full bg-purple-500 shrink-0"
                    />
                  )}
                </div>

                <div className="mt-1 flex items-center gap-1">
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded leading-tight truncate ${
                      isStandard
                        ? 'bg-slate-100 text-slate-700'
                        : 'bg-blue-100 text-blue-800 font-mono'
                    }`}
                  >
                    {isStandard ? 'Standard Sum' : 'Custom'}
                  </span>
                </div>

                <p className="text-[9px] text-slate-400 mt-1 truncate">
                  {cls.isCustomized ? 'Class Override' : 'All Classes'}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Formula Selection Cards: Standard Sum vs Custom Formula */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {[
          {
            id: 'SUM',
            label: 'Standard Sum',
            desc: 'Sum of all subject totals',
          },
          {
            id: 'CUSTOM',
            label: 'Custom Formula',
            desc: 'Integrate internals & main papers',
          },
        ].map((opt) => {
          const isSelected = currentTotalFormula === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleSetTotalFormula(opt.id as TotalFormulaType)}
              className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-blue-600 bg-blue-50/60 text-slate-900 ring-1 ring-blue-600/30 shadow-xs'
                  : 'border-slate-200 hover:border-slate-300 bg-white text-slate-800 hover:bg-slate-50/50'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">{opt.label}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-blue-600" />}
              </div>
              <p
                className={`text-[11px] mt-0.5 line-clamp-1 ${
                  isSelected ? 'text-blue-700/80 font-medium' : 'text-slate-400'
                }`}
              >
                {opt.desc}
              </p>
            </button>
          );
        })}
      </div>

      {/* 5. Custom Formula Editor (when CUSTOM is active) */}
      {currentTotalFormula === 'CUSTOM' && (
        <div className="p-4 bg-slate-50/70 border border-slate-200/90 rounded-xl space-y-3 animate-in fade-in duration-150">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-slate-800 flex items-center gap-1.5">
                <Calculator className="w-3.5 h-3.5 text-slate-500" />
                Custom Formula ({getClassDisplayLabel(activeClassScope)})
              </label>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleCustomFormulaChange('')}
                  className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handleCustomFormulaChange('SUM_MAIN + SUM_INTERNAL')}
                  className="text-[11px] text-blue-600 hover:text-blue-800 transition-colors font-medium cursor-pointer"
                >
                  Reset to Main + Internals
                </button>
              </div>
            </div>

            <input
              type="text"
              value={currentConfig.customFormula ?? 'SUM_MAIN + SUM_INTERNAL'}
              onChange={(e) => handleCustomFormulaChange(e.target.value)}
              placeholder="e.g. SUM_MAIN + SUM_INTERNAL or [English:Main] + [English:Internal]"
              className="w-full font-mono text-xs text-slate-900 bg-white border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600"
            />

            {previewEvaluation && (
              <div className="flex items-center justify-between text-[11px] pt-0.5">
                <span className="text-emerald-700 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Valid formula • Evaluates to <strong>{previewEvaluation.obtained}</strong> /{' '}
                  {previewEvaluation.max} marks
                  {sampleStudent
                    ? ` (${sampleStudent.name} · ${getClassDisplayLabel(sampleStudent.section)})`
                    : ''}
                </span>
                <span className="text-slate-500 font-mono">
                  {((previewEvaluation.obtained / (previewEvaluation.max || 1)) * 100).toFixed(2)}%
                </span>
              </div>
            )}
          </div>

          {/* Quick Presets */}
          <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
            <span className="text-[11px] font-medium text-slate-500 block">
              Quick Presets:
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                {
                  label: 'Main + Internals',
                  formula: 'SUM_MAIN + SUM_INTERNAL',
                },
                {
                  label: 'Main + 50% Internals',
                  formula: 'SUM_MAIN + (SUM_INTERNAL * 0.5)',
                },
                {
                  label: 'Internals Only',
                  formula: 'SUM_INTERNAL',
                },
                {
                  label: 'Main Exams Only',
                  formula: 'SUM_MAIN',
                },
                {
                  label: 'Best 5 Subjects',
                  formula: 'BEST(5)',
                },
                {
                  label: 'All Subjects (SUM)',
                  formula: 'SUM',
                },
              ].map((preset) => (
                <button
                  key={preset.formula}
                  type="button"
                  onClick={() => handleCustomFormulaChange(preset.formula)}
                  className={`text-[11px] px-2.5 py-1 rounded border transition-colors cursor-pointer ${
                    currentConfig.customFormula === preset.formula
                      ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold shadow-xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Token Insertion Buttons */}
          <div className="space-y-2 pt-2 border-t border-slate-200/60">
            <span className="text-[11px] font-medium text-slate-500 block">
              Click to insert tokens into formula:
            </span>

            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleInsertFormulaToken('SUM_MAIN')}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200/80 hover:bg-blue-100 transition-colors cursor-pointer"
              >
                + SUM_MAIN
              </button>
              <button
                type="button"
                onClick={() => handleInsertFormulaToken('SUM_INTERNAL')}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/80 hover:bg-amber-100 transition-colors cursor-pointer"
              >
                + SUM_INTERNAL
              </button>
              <button
                type="button"
                onClick={() => handleInsertFormulaToken('SUM')}
                className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
              >
                + SUM
              </button>

              {['+', '-', '*', '/', '(', ')', '* 0.5'].map((op) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => handleInsertFormulaToken(op)}
                  className="text-[11px] font-mono px-2 py-0.5 rounded bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  {op}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
