'use client';

import React, { useState } from 'react';
import {
  Plus,
  Trash2,
  CheckCircle2,
  RotateCcw,
  Layers,
  BookOpen,
  Link2,
  X,
  SlidersHorizontal,
  Calculator,
  Check,
  FileSpreadsheet,
  Award,
  Download,
} from 'lucide-react';
import GoogleSheetsConnectCard from '@/components/GoogleSheetsConnectCard';
import CustomSelect from '@/components/CustomSelect';
import {
  ExamConfig,
  SubjectConfig,
  InternalComponentConfig,
  StudentReportRow,
  TotalFormulaType,
  getDefaultSubjectComponents,
  evaluateCustomFormula,
  getEffectiveExamConfigForClass,
  getClassGradeFromSection,
} from '@/lib/report-card-types';

interface AdminConfigPanelProps {
  examConfigs: Record<string, ExamConfig>;
  activeExamId: string;
  selectedClass?: string;
  onUpdateExamConfig: (examId: string, updated: ExamConfig, classScope?: string) => void;
  onCreateNewExam: (newExam: ExamConfig) => void;
  onDeleteExam: (examId: string) => void;
  onSetActiveExam: (examId: string) => void;
  onResetDefaults: () => void;
  onApplyLinkedInternalExam?: (
    targetExamId: string,
    targetSubjectScope: string,
    component: InternalComponentConfig,
    classScope?: string
  ) => void;
  showToast: (msg: string) => void;
  spreadsheetId?: string;
  setSpreadsheetId?: (id: string) => void;
  sheetsSyncStatus?: 'idle' | 'syncing' | 'synced' | 'error';
  lastSyncTime?: string | null;
  onGoogleSheetsSync?: () => void;
  students?: StudentReportRow[];
  exportExam?: string;
  setExportExam?: (val: string) => void;
  exportClass?: string;
  setExportClass?: (val: string) => void;
  exportSubjectScope?: string;
  setExportSubjectScope?: (val: string) => void;
  onCustomMatrixExport?: () => void;
  svaAllClasses?: readonly string[] | string[];
  svaSubjects?: SubjectConfig[];
  getClassGradeLabel?: (clsName: string) => string;
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

export default function AdminConfigPanel({
  examConfigs,
  activeExamId,
  selectedClass,
  onUpdateExamConfig,
  onCreateNewExam,
  onDeleteExam,
  onSetActiveExam,
  onResetDefaults,
  onApplyLinkedInternalExam,
  showToast,
  sheetsSyncStatus = 'idle',
  lastSyncTime = null,
  students = [],
  exportExam,
  setExportExam,
  exportClass,
  setExportClass,
  exportSubjectScope,
  setExportSubjectScope,
  onCustomMatrixExport,
  svaAllClasses = [],
  svaSubjects = [],
  getClassGradeLabel = (c) => c,
}: AdminConfigPanelProps) {
  const [editingExamId, setEditingExamId] = useState<string>(activeExamId);
  const [selectedSplitSubject, setSelectedSplitSubject] = useState<string>('ALL');

  // Class Scope state: 'ALL' (All Classes) vs 'SPECIFIC' (Specific Class)
  const [classScopeMode, setClassScopeMode] = useState<'ALL' | 'SPECIFIC'>('ALL');
  const [selectedSpecificClass, setSelectedSpecificClass] = useState<string>(
    selectedClass && selectedClass !== 'all' ? selectedClass : 'Diamond'
  );
  const activeClassScope = classScopeMode === 'ALL' ? 'ALL' : selectedSpecificClass;

  // Create New Exam Modal state
  const [isCreatingNew, setIsCreatingNew] = useState<boolean>(false);
  const [newExamTitle, setNewExamTitle] = useState<string>('');
  const [newExamCode, setNewExamCode] = useState<string>('');
  const [newExamDefaultMax, setNewExamDefaultMax] = useState<number>(100);
  const [newExamWithInternals, setNewExamWithInternals] = useState<boolean>(true);

  const baseConfig: ExamConfig =
    examConfigs[editingExamId] || examConfigs[activeExamId] || Object.values(examConfigs)[0];

  const currentConfig: ExamConfig = React.useMemo(
    () => getEffectiveExamConfigForClass(baseConfig, activeClassScope),
    [baseConfig, activeClassScope]
  );

  const handleSelectExamToEdit = (examId: string) => {
    setEditingExamId(examId);
    onSetActiveExam(examId);
  };

  const handleConfigChange = (updater: (prev: ExamConfig) => ExamConfig) => {
    if (activeClassScope === 'ALL') {
      const updatedBase = updater(baseConfig);
      onUpdateExamConfig(
        baseConfig.id,
        {
          ...updatedBase,
          classOverrides: baseConfig.classOverrides,
        },
        'ALL'
      );
    } else {
      const updatedForClass = updater(currentConfig);
      const prevOverride = baseConfig.classOverrides?.[activeClassScope] || {};
      const formulaChanged =
        updatedForClass.totalFormula !== currentConfig.totalFormula ||
        updatedForClass.customFormula !== currentConfig.customFormula;
      const subjectsChanged = updatedForClass.subjects !== currentConfig.subjects;
      const criteriaChanged = updatedForClass.resultCriteria !== currentConfig.resultCriteria;

      const nextClassOverride = {
        ...prevOverride,
        ...(formulaChanged
          ? {
              totalFormula: updatedForClass.totalFormula,
              customFormula: updatedForClass.customFormula,
            }
          : {}),
        ...(subjectsChanged
          ? {
              subjects: updatedForClass.subjects.map((s) => ({
                ...s,
                components: s.components ? s.components.map((c) => ({ ...c })) : undefined,
              })),
            }
          : {}),
        ...(criteriaChanged
          ? {
              resultCriteria: updatedForClass.resultCriteria,
            }
          : {}),
      };

      const nextOverrides = {
        ...(baseConfig.classOverrides || {}),
        [activeClassScope]: nextClassOverride,
      };

      // If user edited a whole grade (e.g. 'Class 9'), also sync its constituent sections if they had overrides
      if (activeClassScope.startsWith('Class ')) {
        Object.keys(nextOverrides).forEach((k) => {
          if (k !== activeClassScope && getClassGradeFromSection(k) === activeClassScope) {
            delete nextOverrides[k];
          }
        });
      }
      onUpdateExamConfig(
        baseConfig.id,
        {
          ...baseConfig,
          name: updatedForClass.name,
          classOverrides: nextOverrides,
        },
        activeClassScope
      );
    }
  };

  const handleResetClassOverride = (clsKey: string) => {
    if (!baseConfig.classOverrides?.[clsKey]) return;
    const nextOverrides = { ...baseConfig.classOverrides };
    delete nextOverrides[clsKey];
    onUpdateExamConfig(
      baseConfig.id,
      {
        ...baseConfig,
        classOverrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
      },
      clsKey
    );
    showToast(`Reset ${getClassDisplayLabel(clsKey)} to All Classes settings`);
  };

  const [selectedTokenSubject, setSelectedTokenSubject] = useState<string>('English');

  const handleSetTotalFormula = (formulaType: TotalFormulaType) => {
    handleConfigChange((prev) => ({
      ...prev,
      totalFormula: formulaType,
      customFormula:
        formulaType === 'CUSTOM' && !prev.customFormula
          ? 'SUM_MAIN + SUM_INTERNAL'
          : prev.customFormula,
    }));
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

  const currentTotalFormula: TotalFormulaType =
    currentConfig.totalFormula === 'CUSTOM' ? 'CUSTOM' : 'SUM';
  const currentCustomFormula = currentConfig.customFormula || 'SUM_MAIN + SUM_INTERNAL';

  const sampleStudent = React.useMemo(() => {
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

  const previewEvaluation = React.useMemo(() => {
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

  // Get components for a subject
  const getSubjectComponents = (sub: SubjectConfig): InternalComponentConfig[] => {
    if (sub.components && sub.components.length > 0) {
      return sub.components;
    }
    if (
      currentConfig.id === 'SA-1' ||
      currentConfig.id === 'SA-2' ||
      sub.maxMarks === 100
    ) {
      return getDefaultSubjectComponents(sub.name, currentConfig.code || currentConfig.id);
    }
    return [
      {
        key: 'writtenExam',
        label: `${currentConfig.code || currentConfig.id} Main Exam`,
        maxMarks: sub.maxMarks,
        isMainExam: true,
      },
    ];
  };

  const activeSplitSubjectObj: SubjectConfig =
    (selectedSplitSubject !== 'ALL'
      ? currentConfig.subjects.find((s) => s.name === selectedSplitSubject)
      : currentConfig.subjects[0]) ||
    currentConfig.subjects[0] || {
      name: 'English',
      maxMarks: 100,
      passMarks: 33,
    };

  const activeComponents = getSubjectComponents(activeSplitSubjectObj);
  const activeSplitTotal = activeComponents.reduce(
    (sum, c) => sum + (Number(c.maxMarks) || 0),
    0
  );

  const updateComponentsForScope = (
    updater: (
      currentComps: InternalComponentConfig[],
      sub: SubjectConfig
    ) => InternalComponentConfig[]
  ) => {
    handleConfigChange((prev) => {
      const nextSubjects = prev.subjects.map((sub) => {
        if (selectedSplitSubject !== 'ALL' && sub.name !== selectedSplitSubject) {
          return sub;
        }
        const currentComps = [...getSubjectComponents(sub)];
        const updatedComps = updater(currentComps, sub);
        const newTotal = updatedComps.reduce(
          (sum, c) => sum + (Number(c.maxMarks) || 0),
          0
        );
        return {
          ...sub,
          components: updatedComps,
          maxMarks: newTotal > 0 ? newTotal : sub.maxMarks,
          passMarks:
            newTotal > 0 ? Math.round(newTotal * 0.33) : sub.passMarks,
        };
      });
      return { ...prev, subjects: nextSubjects };
    });
  };

  const handleEditSplitRow = (
    compIndex: number,
    updates: Partial<InternalComponentConfig>
  ) => {
    const targetComp = activeComponents[compIndex];
    if (!targetComp) return;

    updateComponentsForScope((comps) => {
      const idx =
        compIndex < comps.length
          ? compIndex
          : comps.findIndex((c) => c.key === targetComp.key);
      if (idx === -1) return comps;
      const next = [...comps];
      next[idx] = { ...next[idx], ...updates };
      return next;
    });

    if (updates.linkedExamId && updates.linkedExamId !== 'manual' && onApplyLinkedInternalExam) {
      const updatedComp: InternalComponentConfig = {
        ...targetComp,
        ...updates,
      };
      onApplyLinkedInternalExam(
        currentConfig.id,
        selectedSplitSubject === 'ALL' ? 'ALL' : selectedSplitSubject,
        updatedComp,
        activeClassScope
      );
      showToast(`Linked "${updatedComp.label}" to ${updates.linkedExamId}`);
    }
  };

  const handleAddInternalColumn = () => {
    const newKey = `internal_col_${activeComponents.length + 1}`;
    const newComp: InternalComponentConfig = {
      key: newKey,
      label: 'Internal Assessment',
      maxMarks: 10,
      isMainExam: false,
    };

    updateComponentsForScope((comps) => {
      const mainIdx = comps.findIndex((c) => c.isMainExam);
      if (mainIdx === -1) {
        return [...comps, newComp];
      }
      const next = [...comps];
      next.splice(mainIdx, 0, newComp);
      return next;
    });

    showToast('Added internal column');
  };

  const handleQuickAddExistingExam = (sourceExamId: string) => {
    if (!sourceExamId || sourceExamId === 'none') return;
    const newKey = `linked_${sourceExamId.toLowerCase().replace(/[^a-z0-9]/g, '')}_${
      activeComponents.length + 1
    }`;
    const newComp: InternalComponentConfig = {
      key: newKey,
      label: sourceExamId,
      maxMarks: 10,
      isMainExam: false,
      linkedExamId: sourceExamId,
    };

    updateComponentsForScope((comps) => {
      const mainIdx = comps.findIndex((c) => c.isMainExam);
      const next = [...comps];
      if (mainIdx !== -1 && next[mainIdx].maxMarks > 20) {
        next[mainIdx] = {
          ...next[mainIdx],
          maxMarks: next[mainIdx].maxMarks - 10,
        };
      }
      if (mainIdx === -1) {
        next.push(newComp);
      } else {
        next.splice(mainIdx, 0, newComp);
      }
      return next;
    });

    if (onApplyLinkedInternalExam) {
      onApplyLinkedInternalExam(
        currentConfig.id,
        selectedSplitSubject === 'ALL' ? 'ALL' : selectedSplitSubject,
        newComp,
        activeClassScope
      );
    }

    showToast(`Linked and combined ${sourceExamId}`);
  };

  const handleDeleteSplitRow = (compIndex: number) => {
    if (activeComponents.length <= 1) {
      showToast('At least 1 exam column is required');
      return;
    }
    const targetComp = activeComponents[compIndex];
    updateComponentsForScope((comps) => {
      if (comps.length <= 1) return comps;
      const idx =
        compIndex < comps.length
          ? compIndex
          : comps.findIndex((c) => c.key === targetComp?.key);
      if (idx === -1) return comps;
      return comps.filter((_, i) => i !== idx);
    });
    showToast(`Removed "${targetComp?.label || 'Column'}"`);
  };

  const handleSetSplitMode = (mode: 'single' | 'split') => {
    if (mode === 'single') {
      handleConfigChange((prev) => ({
        ...prev,
        subjects: prev.subjects.map((sub) => ({
          ...sub,
          components: [
            {
              key: 'writtenExam',
              label: `${prev.code || prev.id} Exam`,
              maxMarks: sub.maxMarks,
              isMainExam: true,
            },
          ],
        })),
      }));
      showToast('Switched to single mark mode');
    } else {
      handleConfigChange((prev) => ({
        ...prev,
        subjects: prev.subjects.map((sub) => ({
          ...sub,
          maxMarks: 100,
          passMarks: 33,
          components: getDefaultSubjectComponents(
            sub.name,
            prev.code || prev.id
          ),
        })),
      }));
      showToast('Switched to internal + main exam split');
    }
  };

  const handleSubjectChange = (
    index: number,
    field: keyof SubjectConfig,
    value: any
  ) => {
    handleConfigChange((prev) => {
      const nextSubjects = [...prev.subjects];
      const currentSub = { ...nextSubjects[index], [field]: value };

      if (field === 'maxMarks' && typeof value === 'number') {
        currentSub.passMarks = Math.round(value * 0.33);
        if (currentSub.components && currentSub.components.length === 1) {
          currentSub.components = [
            { ...currentSub.components[0], maxMarks: value },
          ];
        }
      }
      nextSubjects[index] = currentSub;
      return { ...prev, subjects: nextSubjects };
    });
  };

  const handleAddSubject = () => {
    handleConfigChange((prev) => {
      const existingNames = new Set(prev.subjects.map((s) => s.name.toLowerCase()));
      const nextPreset =
        PRESET_SUBJECTS.find((p) => !existingNames.has(p.toLowerCase())) ||
        `Subject ${prev.subjects.length + 1}`;
      const defaultMax = prev.subjects[0]?.maxMarks || 100;
      const defaultPass = Math.round(defaultMax * 0.33);
      return {
        ...prev,
        subjects: [
          ...prev.subjects,
          {
            name: nextPreset,
            maxMarks: defaultMax,
            passMarks: defaultPass,
            includedInTotal: true,
            components:
              defaultMax === 100
                ? getDefaultSubjectComponents(nextPreset, prev.code || prev.id)
                : [
                    {
                      key: 'writtenExam',
                      label: `${prev.code || prev.id} Main Exam`,
                      maxMarks: defaultMax,
                      isMainExam: true,
                    },
                  ],
          },
        ],
      };
    });
    showToast('Added subject');
  };

  const handleRemoveSubject = (index: number) => {
    if (currentConfig.subjects.length <= 1) {
      showToast('Exam must have at least one subject');
      return;
    }
    handleConfigChange((prev) => ({
      ...prev,
      subjects: prev.subjects.filter((_, idx) => idx !== index),
    }));
  };

  const applyAllSubjectMaxMarks = (maxMarks: number) => {
    const passMarks = Math.round(maxMarks * 0.33);
    handleConfigChange((prev) => ({
      ...prev,
      subjects: prev.subjects.map((s) => ({
        ...s,
        maxMarks,
        passMarks,
        components:
          maxMarks === 100
            ? getDefaultSubjectComponents(s.name, prev.code || prev.id)
            : [
                {
                  key: 'writtenExam',
                  label: `${prev.code || prev.id} Main Exam`,
                  maxMarks,
                  isMainExam: true,
                },
              ],
      })),
    }));
    showToast(`Set all subjects to ${maxMarks} marks`);
  };

  const handleCreateExamSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = newExamCode.trim().toUpperCase();
    const title = newExamTitle.trim() || code;
    if (!code) {
      showToast('Please enter an exam code');
      return;
    }
    if (examConfigs[code]) {
      showToast(`Exam "${code}" already exists`);
      return;
    }

    const pass = Math.round(newExamDefaultMax * 0.33);
    const newExam: ExamConfig = {
      id: code,
      code,
      name: title.includes(code) ? title : `${code} (${title})`,
      totalFormula: 'SUM',
      subjects: PRESET_SUBJECTS.map((name) => ({
        name,
        maxMarks: newExamDefaultMax,
        passMarks: pass,
        includedInTotal: true,
        components: newExamWithInternals
          ? getDefaultSubjectComponents(name, code)
          : [
              {
                key: 'writtenExam',
                label: `${code} Main Exam`,
                maxMarks: newExamDefaultMax,
                isMainExam: true,
              },
            ],
      })),
    };

    onCreateNewExam(newExam);
    setEditingExamId(code);
    setIsCreatingNew(false);
    setNewExamTitle('');
    setNewExamCode('');
  };

  const otherExams = Object.values(examConfigs).filter(
    (ex) => ex.id !== currentConfig.id
  );
  const hasInternalSplit = activeComponents.length > 1;
  const customizedClassKeys = Object.keys(baseConfig.classOverrides || {});
  const hasActiveClassOverride =
    activeClassScope !== 'ALL' && Boolean(baseConfig.classOverrides?.[activeClassScope]);

  const renderClassScopeControl = () => (
    <div className="flex flex-wrap items-center gap-2">
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

          {hasActiveClassOverride && (
            <button
              type="button"
              onClick={() => handleResetClassOverride(activeClassScope)}
              title="Reset this class back to All Classes settings"
              className="text-[11px] text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 px-2 py-1 rounded-md transition-colors cursor-pointer whitespace-nowrap"
            >
              Reset Class
            </button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20">
      {/* Page Header Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Exam Settings
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 font-normal">
            Manage exams, assessment breakdowns, and passing rules for all classes or a specific class.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsCreatingNew(true)}
            className="px-3.5 py-1.5 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            New Exam
          </button>

          <button
            type="button"
            onClick={onResetDefaults}
            title="Reset all settings to CBSE defaults"
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer border border-slate-200"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Grid: Left Navigation + Right Content */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Minimal Sidebar: Exams */}
        <div className="md:col-span-3 space-y-1">
          <div className="text-[11px] font-medium text-slate-400 uppercase tracking-wider px-2 py-1">
            Exams
          </div>
          <div className="space-y-0.5">
            {Object.values(examConfigs).map((ex) => {
              const isSelected = ex.id === currentConfig.id;
              const canDelete = Object.keys(examConfigs).length > 1;
              const subMax = ex.subjects[0]?.maxMarks || 100;

              return (
                <div
                  key={ex.id}
                  onClick={() => handleSelectExamToEdit(ex.id)}
                  className={`group flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-blue-50/80 text-blue-700 font-semibold border border-blue-100'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 border border-transparent'
                  }`}
                >
                  <div className="min-w-0 flex items-baseline gap-2">
                    <span className="truncate">{ex.code || ex.id}</span>
                    <span className="text-[11px] font-normal text-slate-400 truncate">
                      {subMax}m
                    </span>
                  </div>

                  {canDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteExam(ex.id);
                        if (editingExamId === ex.id) {
                          const remaining = Object.keys(examConfigs).filter(
                            (k) => k !== ex.id
                          );
                          setEditingExamId(remaining[0] || 'SA-1');
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-rose-600 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Content */}
        <div className="md:col-span-9 space-y-6">
          {/* Section: Exam Header, Class Scope & Mode */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 space-y-3 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1">
                <label className="text-[11px] font-medium text-slate-400 block mb-0.5">Exam Name</label>
                <input
                  type="text"
                  value={currentConfig.name}
                  onChange={(e) =>
                    handleConfigChange((prev) => ({
                      ...prev,
                      name: e.target.value,
                    }))
                  }
                  className="w-full max-w-sm text-sm font-semibold text-slate-900 bg-transparent focus:outline-none focus:ring-0 border-b border-transparent hover:border-slate-300 focus:border-slate-900 py-0.5 transition-colors"
                />
              </div>

              {/* Segmented Control */}
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg self-start sm:self-auto">
                <button
                  type="button"
                  onClick={() => handleSetSplitMode('single')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    !hasInternalSplit
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Single Mark
                </button>
                <button
                  type="button"
                  onClick={() => handleSetSplitMode('split')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                    hasInternalSplit
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  Internal + Main Exam
                </button>
              </div>
            </div>

            {/* Class Scope Selector Bar (All Classes vs Specific Class) */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-600">Apply Settings To:</span>
                <span className="text-[11px] font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                  {getClassDisplayLabel(activeClassScope)}
                </span>
              </div>

              {renderClassScopeControl()}
            </div>

            {customizedClassKeys.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-500">
                <span>Class-specific overrides:</span>
                {customizedClassKeys.map((clsKey) => (
                  <span
                    key={clsKey}
                    onClick={() => {
                      setClassScopeMode('SPECIFIC');
                      setSelectedSpecificClass(clsKey);
                    }}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border cursor-pointer transition-colors ${
                      activeClassScope === clsKey
                        ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{getClassDisplayLabel(clsKey)}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleResetClassOverride(clsKey);
                      }}
                      className="hover:text-rose-500 ml-0.5"
                      title={`Remove custom override for ${getClassDisplayLabel(clsKey)}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Section 1: Assessment Breakdown */}
          {hasInternalSplit && (
            <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold text-slate-900">
                      Assessment Breakdown
                    </h2>
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {getClassDisplayLabel(activeClassScope)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Columns configured for marks entry ({activeSplitTotal} marks total)
                  </p>
                </div>

                <div className="text-xs text-slate-500 font-mono">
                  Total: <strong className="text-slate-900">{activeSplitTotal}</strong>
                </div>
              </div>

              {/* Minimal Subject Pill Strip */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                <button
                  type="button"
                  onClick={() => setSelectedSplitSubject('ALL')}
                  className={`px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                    selectedSplitSubject === 'ALL'
                      ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                      : 'border-transparent text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  All Subjects
                </button>
                {currentConfig.subjects.map((sub) => (
                  <button
                    key={sub.name}
                    type="button"
                    onClick={() => setSelectedSplitSubject(sub.name)}
                    className={`px-2.5 py-1 rounded-md border transition-colors whitespace-nowrap cursor-pointer ${
                      selectedSplitSubject === sub.name
                        ? 'bg-blue-50 text-blue-700 border-blue-200 font-semibold'
                        : 'border-transparent text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {sub.name}
                  </button>
                ))}
              </div>

              {/* Minimal Component Table */}
              <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                {activeComponents.map((comp, idx) => (
                  <div
                    key={comp.key || idx}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                          comp.isMainExam
                            ? 'bg-blue-50 text-blue-700 font-semibold'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {comp.isMainExam ? 'Main' : `Int`}
                      </span>
                      <input
                        type="text"
                        value={comp.label}
                        onChange={(e) =>
                          handleEditSplitRow(idx, { label: e.target.value })
                        }
                        className="font-medium text-slate-900 bg-transparent focus:outline-none focus:bg-white px-1.5 py-1 rounded border border-transparent focus:border-slate-300 w-full max-w-[200px]"
                      />
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        max={200}
                        value={comp.maxMarks}
                        onChange={(e) =>
                          handleEditSplitRow(idx, {
                            maxMarks: Math.max(1, parseInt(e.target.value, 10) || 0),
                          })
                        }
                        className="w-14 px-1.5 py-1 text-center font-mono font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:bg-white focus:border-slate-400"
                      />
                      <span className="text-[11px] text-slate-400">m</span>
                    </div>

                    {/* Source Selector */}
                    <div className="w-36">
                      {!comp.isMainExam ? (
                        <select
                          value={comp.linkedExamId || 'manual'}
                          onChange={(e) =>
                            handleEditSplitRow(idx, {
                              linkedExamId: e.target.value === 'manual' ? undefined : e.target.value,
                            })
                          }
                          className="w-full text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2 py-1 focus:outline-none focus:bg-white"
                        >
                          <option value="manual">Manual Entry</option>
                          {otherExams.map((ex) => (
                            <option key={ex.id} value={ex.id}>
                              Pull from {ex.code || ex.id}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-slate-400 px-2 block">
                          Main Paper
                        </span>
                      )}
                    </div>

                    {/* Remove */}
                    <div className="w-6 flex justify-end">
                      {!comp.isMainExam && activeComponents.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleDeleteSplitRow(idx)}
                          className="text-slate-300 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Quick Actions */}
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={handleAddInternalColumn}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-900 font-medium px-2 py-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Internal Column
                </button>

                {otherExams.length > 0 && (
                  <div className="flex items-center gap-1 text-xs text-slate-500">
                    <span>Link test:</span>
                    <select
                      defaultValue="none"
                      onChange={(e) => {
                        handleQuickAddExistingExam(e.target.value);
                        e.target.value = 'none';
                      }}
                      className="text-xs bg-slate-50 border border-slate-200 rounded px-2 py-1 text-slate-700 focus:outline-none cursor-pointer"
                    >
                      <option value="none">Choose test...</option>
                      {otherExams.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          + Combine {ex.code || ex.id}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 2: Subjects & Passing Marks */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900">
                    Subjects & Passing Marks
                  </h2>
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    {getClassDisplayLabel(activeClassScope)}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Set subject maximum and pass requirements
                </p>
              </div>

              {/* Mini Quick-set */}
              <div className="flex items-center gap-1">
                <span className="text-[11px] text-slate-400 mr-1">Set all:</span>
                {[20, 50, 80, 100].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => applyAllSubjectMaxMarks(m)}
                    className="text-[11px] font-mono px-1.5 py-0.5 text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>

            {/* Clean Subjects Table */}
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/50 text-[11px] font-medium text-slate-400">
                <span className="flex-1">Subject</span>
                <span className="w-20 text-center">Max</span>
                <span className="w-20 text-center">Pass</span>
                <span className="w-6" />
              </div>

              {currentConfig.subjects.map((sub, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-slate-50/40 transition-colors"
                >
                  <input
                    type="text"
                    value={sub.name}
                    onChange={(e) =>
                      handleSubjectChange(idx, 'name', e.target.value)
                    }
                    className="flex-1 font-medium text-slate-900 bg-transparent focus:outline-none focus:bg-white px-1.5 py-1 rounded border border-transparent focus:border-slate-300"
                  />

                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={sub.maxMarks}
                    onChange={(e) =>
                      handleSubjectChange(
                        idx,
                        'maxMarks',
                        parseInt(e.target.value, 10) || 0
                      )
                    }
                    className="w-16 px-1.5 py-1 text-center font-mono font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:bg-white"
                  />

                  <input
                    type="number"
                    min={0}
                    max={sub.maxMarks}
                    value={sub.passMarks}
                    onChange={(e) =>
                      handleSubjectChange(
                        idx,
                        'passMarks',
                        parseInt(e.target.value, 10) || 0
                      )
                    }
                    className="w-16 px-1.5 py-1 text-center font-mono font-medium text-slate-900 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:bg-white"
                  />

                  <div className="w-6 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleRemoveSubject(idx)}
                      className="text-slate-300 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <button
                type="button"
                onClick={handleAddSubject}
                className="inline-flex items-center gap-1.5 text-xs text-slate-700 hover:text-slate-900 font-medium px-2 py-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Subject
              </button>

              <span className="text-[11px] text-slate-400 font-mono">
                Total max possible:{' '}
                <strong className="text-slate-700">
                  {currentConfig.subjects.reduce((s, c) => s + (c.maxMarks || 0), 0)}
                </strong>
              </span>
            </div>
          </div>

          {/* Section 3: Total Calculation & Formula */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs space-y-4">
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
                <div className="flex items-center gap-1.5 text-xs bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-lg self-start sm:self-auto">
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

            {/* Class Scope Bar inside Total Calculation & Formula */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/70 border border-slate-200/70 rounded-lg px-3 py-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Layers className="w-3.5 h-3.5 text-slate-400" />
                <span>Apply Formula To:</span>
                <strong className="text-slate-900 font-semibold">
                  {getClassDisplayLabel(activeClassScope)}
                </strong>
              </div>
              {renderClassScopeControl()}
            </div>

            {/* Only Standard Sum & Custom Formula */}
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

            {/* Custom Formula Editor */}
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
                        Valid formula • Evaluates to{' '}
                        <strong>{previewEvaluation.obtained}</strong> / {previewEvaluation.max} marks
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

                {/* Click to insert tokens into formula */}
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

                  {/* Per Subject & Internal Component Tokens */}
                  {(() => {
                    const tokenSubObj =
                      currentConfig.subjects.find((s) => s.name === selectedTokenSubject) ||
                      currentConfig.subjects[0];
                    const subComps = tokenSubObj
                      ? getSubjectComponents(tokenSubObj).filter((c) => !c.isMainExam)
                      : [];
                    return (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <span className="text-[11px] text-slate-500 mr-0.5">
                          Insert Subject:
                        </span>
                        <select
                          value={selectedTokenSubject}
                          onChange={(e) => setSelectedTokenSubject(e.target.value)}
                          className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-700 focus:outline-none cursor-pointer"
                        >
                          {currentConfig.subjects.map((sub) => (
                            <option key={sub.name} value={sub.name}>
                              {sub.name}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            handleInsertFormulaToken(`[${selectedTokenSubject}:Main]`)
                          }
                          className="text-[11px] font-mono px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-200/80 hover:bg-blue-100 transition-colors cursor-pointer"
                        >
                          + [{selectedTokenSubject}:Main]
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleInsertFormulaToken(`[${selectedTokenSubject}:Internal]`)
                          }
                          className="text-[11px] font-mono px-2 py-1 rounded bg-amber-50 text-amber-700 border border-amber-200/80 hover:bg-amber-100 transition-colors cursor-pointer"
                        >
                          + [{selectedTokenSubject}:Internal]
                        </button>
                        {subComps.map((ic) => (
                          <button
                            key={ic.key}
                            type="button"
                            onClick={() =>
                              handleInsertFormulaToken(
                                `[${selectedTokenSubject}:${ic.label}]`
                              )
                            }
                            className="text-[11px] font-mono px-2 py-1 rounded bg-white text-slate-700 border border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                          >
                            + [{selectedTokenSubject}:{ic.label}]
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          {/* Section 4: Excel Marksheets Export */}
          <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-slate-500" />
                Download Excel Marksheets
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Choose the exam, class, and subjects you want in your Excel file.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Step 1: Choose Exam */}
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-2 shadow-2xs">
                <label className="text-xs font-medium text-slate-900 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] flex items-center justify-center font-mono font-semibold">1</span>
                  Choose Exam
                </label>
                <CustomSelect
                  fullWidth
                  icon={<BookOpen className="w-3.5 h-3.5 text-slate-400" />}
                  value={exportExam || activeExamId}
                  onChange={(val) => setExportExam && setExportExam(val)}
                  options={Object.values(examConfigs).map((ex) => ({
                    value: ex.id,
                    label: `${ex.name} (${ex.id})`,
                  }))}
                />
                <p className="text-[10px] text-slate-500">
                  Selected: <strong className="text-slate-700 font-medium">{exportExam || activeExamId}</strong>
                </p>
              </div>

              {/* Step 2: Choose Class */}
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-2 shadow-2xs">
                <label className="text-xs font-medium text-slate-900 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] flex items-center justify-center font-mono font-semibold">2</span>
                  Choose Class
                </label>
                <CustomSelect
                  fullWidth
                  icon={<Layers className="w-3.5 h-3.5 text-slate-400" />}
                  value={exportClass || 'all'}
                  onChange={(val) => setExportClass && setExportClass(val)}
                  options={[
                    { value: 'all', label: 'All Classes (Grade 6 to 9)' },
                    ...svaAllClasses.map((c) => ({
                      value: c,
                      label: getClassGradeLabel(c),
                    })),
                  ]}
                />
                <p className="text-[10px] text-slate-500">
                  Selected: <strong className="text-slate-700 font-medium">{exportClass === 'all' || !exportClass ? 'All 8 Classes' : getClassGradeLabel(exportClass)}</strong>
                </p>
              </div>

              {/* Step 3: Choose Subjects */}
              <div className="bg-white p-3 rounded-lg border border-slate-200/80 space-y-2 shadow-2xs">
                <label className="text-xs font-medium text-slate-900 flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[10px] flex items-center justify-center font-mono font-semibold">3</span>
                  Choose Subjects
                </label>
                <CustomSelect
                  fullWidth
                  icon={<Award className="w-3.5 h-3.5 text-slate-400" />}
                  value={exportSubjectScope || 'all_consolidated'}
                  onChange={(val) => setExportSubjectScope && setExportSubjectScope(val)}
                  options={[
                    { value: 'all_consolidated', label: 'All Subjects (Full Class Marksheet)' },
                    ...svaSubjects.map((s) => ({
                      value: s.name,
                      label: `Only ${s.name}`,
                    })),
                  ]}
                />
                <p className="text-[10px] text-slate-500">
                  Includes: <strong className="text-slate-700 font-medium">{exportSubjectScope === 'all_consolidated' || !exportSubjectScope ? 'Full Marksheet + Subject Tabs' : `${exportSubjectScope} Only`}</strong>
                </p>
              </div>
            </div>

            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={onCustomMatrixExport}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download Excel File (.xlsx)</span>
              </button>
            </div>
          </div>

          {/* Section 5: Google Sheets Sync */}
          <GoogleSheetsConnectCard
            students={students}
            selectedExam={currentConfig.id}
            showToast={showToast}
            lastSyncTime={lastSyncTime}
            sheetsSyncStatus={sheetsSyncStatus}
          />
        </div>
      </div>

      {/* Minimal Create Exam Modal */}
      {isCreatingNew && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsCreatingNew(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200 rounded-xl shadow-xl w-full max-w-sm p-5 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">
                New Exam
              </h3>
              <button
                type="button"
                onClick={() => setIsCreatingNew(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateExamSubmit} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-600 block mb-1 font-medium">Exam Code (e.g. UT-1)</label>
                <input
                  type="text"
                  required
                  value={newExamCode}
                  onChange={(e) => setNewExamCode(e.target.value.toUpperCase())}
                  placeholder="e.g. UT-1"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-slate-900"
                />
              </div>

              <div>
                <label className="text-slate-600 block mb-1 font-medium">Full Name</label>
                <input
                  type="text"
                  value={newExamTitle}
                  onChange={(e) => setNewExamTitle(e.target.value)}
                  placeholder="e.g. Unit Test 1"
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:bg-white focus:border-slate-900"
                />
              </div>

              <div>
                <label className="text-slate-600 block mb-1 font-medium">Marks per Subject</label>
                <input
                  type="number"
                  min={5}
                  max={500}
                  value={newExamDefaultMax}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10) || 100;
                    setNewExamDefaultMax(val);
                    setNewExamWithInternals(val === 100);
                  }}
                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono font-medium text-slate-900 focus:outline-none focus:bg-white focus:border-slate-900"
                />
              </div>

              <label className="flex items-center gap-2 pt-1 text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={newExamWithInternals}
                  onChange={(e) => setNewExamWithInternals(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900"
                />
                <span>Include internal assessment breakdown</span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreatingNew(false)}
                  className="px-3 py-1.5 text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs cursor-pointer"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
