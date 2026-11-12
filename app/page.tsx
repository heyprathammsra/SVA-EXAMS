'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import Image from 'next/image';
import {
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
  Printer,
  Archive,
  Plus,
  Trash2,
  CheckCircle2,
  Search,
  X,
  Database,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  BarChart3,
  Settings,
  Info,
  Award,
  Check,
  UserCheck,
  BookOpen,
  QrCode,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Edit2,
  Filter,
  Layers,
  Copy,
  MousePointer,
  Keyboard,
  HelpCircle,
  Undo2,
  Redo2,
  Users,
  TrendingUp,
  Trophy,
  GraduationCap,
  MessageSquareText,
} from 'lucide-react';
import {
  StudentReportRow,
  SubjectConfig,
  ExamInfo,
  computeClassResults,
  ComputedStudentResult,
  SMART_REMARKS_PRESETS,
  computeSubjectStatistics,
  ExamConfig,
  TotalFormulaType,
  computeGrade,
  SubjectBreakdown,
  generateDefaultBreakdown,
  computeSubjectTotalFromBreakdown,
  isClass9Section,
  InternalComponentConfig,
  getDefaultSubjectComponents,
  getEffectiveExamConfigForClass,
  getClassGradeFromSection,
  syncBreakdownWithTotal,
  mergePulledStudentsWithRoster,
  PT_EXAM_SUBJECT_NAMES,
  PT_EXAM_CLASS9_SUBJECT_NAMES,
  REPORT_CARD_GRADING_SYSTEM,
  isPtExam,
  hasCsInPtExam,
  getPtExamHeading,
  getPtSubjectDisplayName,
  formatPtPercentage,
  getStudentPtProfile,
} from '@/lib/report-card-types';
import CustomSelect from '@/components/CustomSelect';
import {
  getDefaultSubjectRemark,
  getDefaultClassTeacherRemark,
  updateStudentClassRemark,
  updateStudentSubjectRemark,
  applyAutoRemarksToStudents,
  computeDragScrollLeft,
  SUBJECT_REMARK_PRESETS,
  CLASS_TEACHER_REMARK_PRESETS,
} from '@/lib/remarks-utils';
import AdminConfigPanel from '@/components/AdminConfigPanel';
import TotalCalculationFormulaCard from '@/components/TotalCalculationFormulaCard';
import GoogleSheetsConnectCard from '@/components/GoogleSheetsConnectCard';
import {
  downloadSinglePDF,
  downloadAllPDFsAsZip,
  downloadAllReportCardsSinglePDF,
} from '@/lib/fast-pdf';
import {
  GasSyncService,
  LOCKED_SPREADSHEET_ID,
  LOCKED_SPREADSHEET_URL,
  getStoredGasUrl,
  saveStoredGasUrl,
  GAS_SCRIPT_CODE,
} from '@/lib/gas-sync';
import { StorageService } from '@/lib/storage';
import { copyToClipboard } from '@/lib/utils';
import { ALL_SVA_STUDENTS, SVA_ALL_CLASSES, SvaClassName } from '@/lib/sva-students-data';
import {
  downloadReferenceFormatExcel,
  downloadConsolidatedFormatExcel,
  orderSubjectsForConsolidated,
  resolveSubjectComponentsForExport,
  formatComponentColumnHeader,
  computeCbseGrade,
} from '@/lib/excel-export';
import ReferenceSheetPreviewCard from '@/components/ReferenceSheetPreviewCard';

// Official School Crest Logo
const SCHOOL_LOGO_SRC = '/school_logo.png';

const SVA_EXAM_INFO: ExamInfo = {
  schoolName: 'Saraswati Vidya Academy',
  schoolAddress: 'Village Shilatne, Maval Dist. Pune, Maharashtra 410405',
  schoolCode: '31572',
  affiliationNo: '1131575',
  udiseNo: '2724100374',
  schoolEmail: 'principal@saraswatividya.academy',
  examName: 'Annual Examination',
  academicSession: '2025-2026',
  principalName: 'Dr. Ramesh Chandra Sharma',
  classTeacherName: 'Mrs. S. Sen',
};

// Exact 7 subjects for SA exams: English, Hindi, Marathi, Maths, Science, Social Science, Computer Science
const SVA_SUBJECTS: SubjectConfig[] = [
  { name: 'English', maxMarks: 100, passMarks: 32 },
  { name: 'Hindi', maxMarks: 100, passMarks: 32 },
  { name: 'Marathi', maxMarks: 100, passMarks: 32 },
  { name: 'Maths', maxMarks: 100, passMarks: 32 },
  { name: 'Science', maxMarks: 100, passMarks: 32 },
  { name: 'Social Science', maxMarks: 100, passMarks: 32 },
  { name: 'Computer Science', maxMarks: 100, passMarks: 32 },
];

// Exact 6 subjects for PT exams in Classes 6-8 (no CS paper)
const SVA_PT_SUBJECTS: SubjectConfig[] = PT_EXAM_SUBJECT_NAMES.map((name) => ({
  name,
  maxMarks: 25,
  passMarks: 8,
}));

const INITIAL_EXAM_CONFIGS: Record<string, ExamConfig> = {
  'PT-1': {
    id: 'PT-1',
    name: 'PT-1 (Periodic Test 1)',
    code: 'PT-1',
    totalFormula: 'SUM',
    subjects: SVA_PT_SUBJECTS.map((s) => ({ ...s })),
  },
  'PT-2': {
    id: 'PT-2',
    name: 'PT-2 (Periodic Test 2)',
    code: 'PT-2',
    totalFormula: 'SUM',
    subjects: SVA_PT_SUBJECTS.map((s) => ({ ...s })),
  },
  'PT-3': {
    id: 'PT-3',
    name: 'PT-3 (Periodic Test 3)',
    code: 'PT-3',
    totalFormula: 'SUM',
    subjects: SVA_PT_SUBJECTS.map((s) => ({ ...s })),
  },
  'PT-4': {
    id: 'PT-4',
    name: 'PT-4 (Periodic Test 4)',
    code: 'PT-4',
    totalFormula: 'SUM',
    subjects: SVA_PT_SUBJECTS.map((s) => ({ ...s })),
  },
  'SA-1': {
    id: 'SA-1',
    name: 'SA-1 (Summative Assessment 1)',
    code: 'SA-1',
    totalFormula: 'SUM',
    subjects: SVA_SUBJECTS.map((s) => ({
      ...s,
      maxMarks: 100,
      passMarks: 32,
      components: getDefaultSubjectComponents(s.name, 'SA-1'),
    })),
  },
  'SA-2': {
    id: 'SA-2',
    name: 'SA-2 (Summative Assessment 2)',
    code: 'SA-2',
    totalFormula: 'SUM',
    subjects: SVA_SUBJECTS.map((s) => ({
      ...s,
      maxMarks: 100,
      passMarks: 32,
      components: getDefaultSubjectComponents(s.name, 'SA-2'),
    })),
  },
};

function sanitizePtExamConfigs(configs: Record<string, ExamConfig>): Record<string, ExamConfig> {
  const cleaned: Record<string, ExamConfig> = {};
  Object.entries(configs).forEach(([key, cfg]) => {
    if (isPtExam(cfg.code || key)) {
      const filteredSubjects = (cfg.subjects || [])
        .filter((s) => {
          const lower = s.name.trim().toLowerCase();
          return lower !== 'computer science' && lower !== 'cs';
        })
        .map((s) => {
          const max = s.maxMarks || 25;
          const pass = s.passMarks || Math.round(max * 0.33);
          return {
            ...s,
            maxMarks: max,
            passMarks: pass,
          };
        });
      const baseMax = filteredSubjects[0]?.maxMarks || 25;
      let nextOverrides = cfg.classOverrides ? { ...cfg.classOverrides } : undefined;
      if (nextOverrides) {
        // Remove legacy hardcoded Class 9 / Ruby / Diamond 25m overrides that conflict with base subjects
        ['Class 9', 'Ruby', 'Diamond'].forEach((clsKey) => {
          const ov = nextOverrides?.[clsKey];
          if (ov?.subjects && ov.subjects.every((s) => s.maxMarks === 25) && baseMax !== 25) {
            delete nextOverrides![clsKey];
          } else if (
            ov &&
            Object.keys(ov).length === 1 &&
            ov.subjects &&
            ov.subjects.length === 7 &&
            ov.subjects.every((s) => s.maxMarks === baseMax)
          ) {
            delete nextOverrides![clsKey];
          }
        });
        if (Object.keys(nextOverrides).length === 0) {
          nextOverrides = undefined;
        }
      }
      cleaned[key] = {
        ...cfg,
        subjects:
          filteredSubjects.length > 0 ? filteredSubjects : SVA_PT_SUBJECTS.map((s) => ({ ...s })),
        classOverrides: nextOverrides,
      };
    } else {
      cleaned[key] = cfg;
    }
  });
  return cleaned;
}

type ActiveTab = 'spreadsheet' | 'remarks' | 'reportcards' | 'export' | 'admin';
type FilterStatus = 'all' | 'passed' | 'review';
type SortField = 'rollNo' | 'name' | 'section' | 'total' | 'percentage' | 'rank' | string;

interface ContextMenuState {
  x: number;
  y: number;
  student: StudentReportRow;
}

interface CellCoordinate {
  rowIdx: number;
  colIdx: number;
}

interface SelectionRange {
  start: CellCoordinate;
  end: CellCoordinate;
}

const getClassNumberForSection = (sec: string): string => {
  if (sec === 'Sparkle' || sec === 'Twinkle') return 'Class 6';
  if (sec === 'Topaz' || sec === 'Jade') return 'Class 7';
  if (sec === 'Garnet' || sec === 'Emerald') return 'Class 8';
  if (sec === 'Ruby' || sec === 'Diamond') return 'Class 9';
  return 'Class 6';
};

const getClassGradeLabel = (clsName: string): string => {
  if (clsName === 'Sparkle' || clsName === 'Twinkle') return `6 ${clsName}`;
  if (clsName === 'Topaz' || clsName === 'Jade') return `7 ${clsName}`;
  if (clsName === 'Garnet' || clsName === 'Emerald') return `8 ${clsName}`;
  if (clsName === 'Ruby' || clsName === 'Diamond') return `9 ${clsName}`;
  if (clsName.startsWith('Class ')) {
    return clsName.replace('Class ', '');
  }
  return clsName;
};

const getSubjectHeaderLabel = (subName: string): string => {
  if (subName === 'Mathematics' || subName === 'Maths') return 'Maths';
  if (subName === 'Social Science') return 'SS';
  if (subName === 'Computer Science') return 'CS';
  return subName;
};

interface InternalAssessmentModalProps {
  data: {
    student: StudentReportRow;
    subjectName: string;
  };
  selectedExam: string;
  components?: InternalComponentConfig[];
  onClose: () => void;
  onSave: (studentId: string, subjectName: string, updatedBd: SubjectBreakdown) => void;
}

function InternalAssessmentModal({
  data,
  selectedExam,
  components,
  onClose,
  onSave,
}: InternalAssessmentModalProps) {
  const { student, subjectName } = data;
  const activeComponents =
    components && components.length > 0
      ? components
      : getDefaultSubjectComponents(subjectName, selectedExam);
  const totalMaxMarks = activeComponents.reduce((sum, c) => sum + (c.maxMarks || 0), 0);
  const currentBd =
    student.breakdowns?.[subjectName] ||
    generateDefaultBreakdown(student.marks[subjectName], subjectName, student.section);

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4 animate-in fade-in duration-150"
    >
      <div className="bg-white border border-slate-200/90 rounded-xl shadow-xl w-full max-w-md overflow-hidden p-5 flex flex-col gap-4 animate-in zoom-in-95 duration-150 relative">
        <div className="flex items-start justify-between pb-3 border-b border-slate-200/80">
          <div>
            <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wide">
              Internal + Main Exam Breakdown · {selectedExam}
            </div>
            <h3 className="text-base font-semibold text-slate-900 mt-0.5">
              {student.name} · {subjectName}
            </h3>
            <p className="text-xs text-slate-500">
              Roll {student.rollNo} · {getClassGradeLabel(student.section)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            const parseField = (val: string, max: number): number | 'AB' => {
              const t = (val || '').trim();
              if (t.toUpperCase() === 'AB') return 'AB';
              const num = parseFloat(t);
              return isNaN(num) ? 0 : Math.min(max, Math.max(0, num));
            };
            const updated: SubjectBreakdown = { ...currentBd };
            activeComponents.forEach((comp) => {
              updated[comp.key] = parseField(
                formData.get(comp.key) as string,
                comp.maxMarks
              );
            });
            onSave(student.id, subjectName, updated);
          }}
          className="space-y-3.5"
        >
          <div className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-lg text-xs text-slate-700">
            <span className="font-medium text-slate-900">{subjectName} ({selectedExam}) Blueprint:</span>{' '}
            {activeComponents.map((c) => `${c.label} (${c.maxMarks})`).join(' + ')} ={' '}
            <strong className="font-semibold text-slate-900">Total {totalMaxMarks} Marks</strong>
          </div>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            {activeComponents.map((comp) => {
              const rawDefault = currentBd[comp.key];
              const fallbackVal =
                rawDefault !== undefined && rawDefault !== null
                  ? rawDefault
                  : comp.isMainExam && typeof student.marks[subjectName] === 'number'
                  ? Math.min(comp.maxMarks, Math.round(Number(student.marks[subjectName]) * (comp.maxMarks / (totalMaxMarks || 100))))
                  : Math.round(comp.maxMarks * 0.8);
              return (
                <div
                  key={comp.key}
                  className={`space-y-1 ${
                    comp.isMainExam && activeComponents.length % 2 === 1
                      ? 'col-span-2 pt-1 border-t border-slate-100'
                      : ''
                  }`}
                >
                  <label className="font-medium text-slate-700 flex justify-between">
                    <span>
                      {comp.label}
                      {comp.linkedExamId ? ` (Linked: ${comp.linkedExamId})` : ''}
                    </span>
                    <span className="text-slate-400 font-mono text-[11px]">Max {comp.maxMarks}</span>
                  </label>
                  <input
                    type="text"
                    name={comp.key}
                    defaultValue={fallbackVal}
                    className={`w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono text-slate-900 focus:outline-none focus:border-slate-900 bg-white text-xs ${
                      comp.isMainExam ? 'font-semibold text-sm' : ''
                    }`}
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200/80">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              Save Marks (Total {totalMaxMarks})
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SchoolErpPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('spreadsheet');
  
  // Class / Section filter: defaults to 'Diamond' (Class IX Diamond 2026-2027)
  const [selectedClass, setSelectedClass] = useState<string>('Diamond');
  
  // Exam selection & Exam Configuration Store
  const [selectedExam, setSelectedExam] = useState<string>('SA-1');
  const [examConfigs, setExamConfigs] = useState<Record<string, ExamConfig>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sva_exam_configs_v1');
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
            return sanitizePtExamConfigs({ ...INITIAL_EXAM_CONFIGS, ...parsed });
          }
        }
      } catch {}
    }
    return INITIAL_EXAM_CONFIGS;
  });

  // Base exam config (global across classes, including classOverrides)
  const baseExamConfig: ExamConfig = useMemo(() => {
    const raw =
      examConfigs[selectedExam] || {
        id: selectedExam,
        name: selectedExam,
        code: selectedExam,
        totalFormula: 'SUM',
        subjects: isPtExam(selectedExam)
          ? SVA_PT_SUBJECTS.map((s) => ({ ...s }))
          : SVA_SUBJECTS.map((s) => ({ ...s, maxMarks: 80, passMarks: 26 })),
      };
    if (isPtExam(raw.code || selectedExam)) {
      return {
        ...raw,
        subjects: raw.subjects.filter((s) => {
          const lower = s.name.trim().toLowerCase();
          return lower !== 'computer science' && lower !== 'cs';
        }),
      };
    }
    return raw;
  }, [examConfigs, selectedExam]);

  // Effective exam config for currently selected class filter
  const currentExamConfig: ExamConfig = useMemo(() => {
    return getEffectiveExamConfigForClass(baseExamConfig, selectedClass);
  }, [baseExamConfig, selectedClass]);

  // Dynamic subjects based on active exam config
  const activeSubjects: SubjectConfig[] = useMemo(() => {
    return currentExamConfig.subjects;
  }, [currentExamConfig]);



  // Initial student roster with marks, internal breakdowns, and remarks for SA-1 exam
  const [students, setStudents] = useState<StudentReportRow[]>(() => {
    return ALL_SVA_STUDENTS.map((st) => {
      const normalizedMarks: Record<string, number | 'AB' | null> = {};
      const breakdowns: Record<string, SubjectBreakdown> = {};
      const subjectRemarks: Record<string, string> = { ...(st.subjectRemarks || {}) };
      Object.entries(st.marks).forEach(([sub, val]) => {
        const normSub = sub === 'Mathematics' ? 'Maths' : sub;
        const total = typeof val === 'number' ? Math.round(val) : val;
        normalizedMarks[normSub] = total;
        breakdowns[normSub] =
          st.breakdowns?.[normSub] || generateDefaultBreakdown(total, normSub, st.section);
        if (!subjectRemarks[normSub]) {
          subjectRemarks[normSub] = getDefaultSubjectRemark(total, 100);
        }
      });

      const isAayushSample =
        st.id === 'STU-2026-0031' ||
        st.name.trim().toLowerCase() === 'aayush satish nalawade';

      if (isAayushSample) {
        subjectRemarks['English'] = 'Outstanding! Strong command of language.';
        subjectRemarks['Hindi'] = 'Excellent performance keep it up.';
        subjectRemarks['Marathi'] = 'Excellent Performance';
        subjectRemarks['Maths'] = 'Outstanding! Strong conceptual understanding.';
        subjectRemarks['Science'] = 'Outstanding! Strong conceptual understanding.';
        subjectRemarks['Social Science'] = 'Good.Keep it up!';
      }

      return {
        ...st,
        class: getClassNumberForSection(st.section),
        marks: normalizedMarks,
        breakdowns,
        subjectRemarks,
        customRemarks: isAayushSample
          ? 'Excellent and consistent performance with strong understanding and commendable effort.'
          : st.customRemarks,
      };
    });
  });

  // Scope filter for the dedicated Teacher Remarks Entry page ('all' | 'class_teacher' | subjectName)
  const [selectedRemarkScope, setSelectedRemarkScope] = useState<string>('all');
  const remarkInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Horizontal scroll container refs & header click-and-drag scrolling state
  const marksScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const remarksScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isHeaderDragging, setIsHeaderDragging] = useState<boolean>(false);
  const headerDragRef = useRef<{
    isDragging: boolean;
    startX: number;
    startScrollLeft: number;
    container: HTMLDivElement | null;
    hasDragged: boolean;
  }>({
    isDragging: false,
    startX: 0,
    startScrollLeft: 0,
    container: null,
    hasDragged: false,
  });

  const handleHeaderDragStart = useCallback(
    (e: React.MouseEvent<HTMLTableSectionElement>, fallbackContainer: HTMLDivElement | null) => {
      if (e.button !== 0) return;
      const container =
        (e.currentTarget.closest('.excel-grid-container') as HTMLDivElement | null) ||
        fallbackContainer;
      if (!container) return;
      // Stop any ongoing smooth scroll animation so direct drag assignment works immediately
      container.scrollTo({ left: container.scrollLeft, behavior: 'auto' });
      headerDragRef.current = {
        isDragging: true,
        startX: e.clientX,
        startScrollLeft: container.scrollLeft,
        container,
        hasDragged: false,
      };
      setIsHeaderDragging(true);
    },
    []
  );

  const [isHorizontalScrollActive, setIsHorizontalScrollActive] = useState(false);
  const horizontalScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scrollHorizontalBy = useCallback(
    (container: HTMLDivElement | null, direction: 'left' | 'right') => {
      if (!container) return;
      setIsHorizontalScrollActive(true);
      if (horizontalScrollTimeoutRef.current) {
        clearTimeout(horizontalScrollTimeoutRef.current);
      }
      horizontalScrollTimeoutRef.current = setTimeout(() => {
        setIsHorizontalScrollActive(false);
      }, 450);
      const step = 360;
      const delta = direction === 'left' ? -step : step;
      container.scrollBy({ left: delta, behavior: 'smooth' });
    },
    []
  );

  // Multi-exam marks & breakdowns stores so marks and internal components are preserved and isolated per exam
  const [examMarksStore, setExamMarksStore] = useState<Record<string, Record<string, Record<string, number | 'AB' | null>>>>(() => {
    const store: Record<string, Record<string, Record<string, number | 'AB' | null>>> = {
      'PT-1': {},
      'PT-2': {},
      'PT-3': {},
      'PT-4': {},
      'SA-1': {},
      'SA-2': {},
    };
    const exams: string[] = ['PT-1', 'PT-2', 'PT-3', 'PT-4', 'SA-1', 'SA-2'];
    exams.forEach((ex) => {
      const isPt = isPtExam(ex);
      const cfgForEx = examConfigs[ex] || INITIAL_EXAM_CONFIGS[ex];
      ALL_SVA_STUDENTS.forEach((st) => {
        const effCfg = cfgForEx ? getEffectiveExamConfigForClass(cfgForEx, st.section) : undefined;
        const defaultMax = effCfg?.subjects[0]?.maxMarks || (isPt ? 25 : 100);
        const isAayushSample =
          st.id === 'STU-2026-0031' ||
          st.name.trim().toLowerCase() === 'aayush satish nalawade';

        if (ex === 'PT-1' && isAayushSample && defaultMax === 25) {
          store[ex][st.id] = {
            English: 25,
            Hindi: 25,
            Marathi: 24,
            Maths: 22,
            Science: 25,
            'Social Science': 24,
          };
          return;
        }

        const scaled: Record<string, number | 'AB' | null> = {};
        Object.entries(st.marks).forEach(([sub, val]) => {
          const normSub = sub === 'Mathematics' ? 'Maths' : sub;
          if (
            isPt &&
            !hasCsInPtExam(st.section) &&
            (normSub.toLowerCase() === 'computer science' || normSub.toLowerCase() === 'cs')
          ) {
            return;
          }
          const subMax =
            effCfg?.subjects.find((s) => s.name.toLowerCase() === normSub.toLowerCase())?.maxMarks ||
            defaultMax;
          scaled[normSub] =
            typeof val === 'number'
              ? Math.min(subMax, Math.max(0, Math.round((val / 100) * subMax)))
              : val;
        });
        store[ex][st.id] = scaled;
      });
    });
    return store;
  });

  const [examBreakdownsStore, setExamBreakdownsStore] = useState<
    Record<string, Record<string, Record<string, SubjectBreakdown>>>
  >(() => {
    const bdStore: Record<string, Record<string, Record<string, SubjectBreakdown>>> = {
      'PT-1': {},
      'PT-2': {},
      'PT-3': {},
      'PT-4': {},
      'SA-1': {},
      'SA-2': {},
    };
    ['SA-1', 'SA-2'].forEach((ex) => {
      ALL_SVA_STUDENTS.forEach((st) => {
        const bds: Record<string, SubjectBreakdown> = {};
        Object.entries(st.marks).forEach(([sub, val]) => {
          const normSub = sub === 'Mathematics' ? 'Maths' : sub;
          const total = typeof val === 'number' ? Math.round(val) : val;
          bds[normSub] =
            st.breakdowns?.[normSub] || generateDefaultBreakdown(total, normSub, st.section);
        });
        bdStore[ex][st.id] = bds;
      });
    });
    return bdStore;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('STU-2026-0246');
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>('rollNo');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Modals & Panels
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadMode, setUploadMode] = useState<'consolidated' | 'subject'>('subject');
  const [uploadTargetSubject, setUploadTargetSubject] = useState<string>('Science');
  const [ledgerViewMode, setLedgerViewMode] = useState<'consolidated' | 'internal'>('internal');
  const [internalActiveSubject, setInternalActiveSubject] = useState<string>('English');
  const [isAddStudentModalOpen, setIsAddStudentModalOpen] = useState(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<StudentReportRow | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<string>('all');

  const displayedSubjects = useMemo(() => {
    if (selectedSubject === 'all' || selectedSubject === 'consolidated') return activeSubjects;
    return activeSubjects.filter((s) => s.name.toLowerCase() === selectedSubject.toLowerCase());
  }, [activeSubjects, selectedSubject]);

  const activeInternalSubject =
    selectedSubject !== 'all' && selectedSubject !== 'consolidated'
      ? selectedSubject
      : internalActiveSubject;
  const activeSubConfig = useMemo(
    () =>
      activeSubjects.find(
        (s) => s.name.toLowerCase() === activeInternalSubject.toLowerCase()
      ),
    [activeSubjects, activeInternalSubject]
  );

  const internalFields = useMemo(() => {
    const customComps = activeSubConfig?.components;
    if (customComps && customComps.length > 0) {
      return customComps.map((comp) => ({
        key: comp.key,
        label: comp.label.toUpperCase(),
        max: comp.maxMarks,
        subLabel: String(comp.maxMarks),
        colWidth:
          comp.label.length > 14
            ? 'w-[130px] min-w-[130px]'
            : 'w-[105px] min-w-[105px]',
        linkedExamId: comp.linkedExamId,
        isMainExam: comp.isMainExam,
      }));
    }
    if (selectedExam === 'SA-1' || selectedExam === 'SA-2') {
      return getDefaultSubjectComponents(activeInternalSubject, selectedExam).map(
        (comp) => ({
          key: comp.key,
          label: comp.label.toUpperCase(),
          max: comp.maxMarks,
          subLabel: String(comp.maxMarks),
          colWidth:
            comp.label.length > 14
              ? 'w-[130px] min-w-[130px]'
              : 'w-[105px] min-w-[105px]',
          linkedExamId: comp.linkedExamId,
          isMainExam: comp.isMainExam,
        })
      );
    }
    return [];
  }, [activeSubConfig, activeInternalSubject, selectedExam]);

  const internalFieldKeys = useMemo(
    () => internalFields.map((f) => f.key as string),
    [internalFields]
  );

  const isSubjectWiseTable =
    selectedSubject !== 'all' &&
    selectedSubject !== 'consolidated' &&
    internalFields.length > 1;
  const activeGridColumnKeys = useMemo(() => {
    if (isSubjectWiseTable) {
      return internalFieldKeys;
    }
    return displayedSubjects.map((s) => s.name);
  }, [isSubjectWiseTable, internalFieldKeys, displayedSubjects]);

  const consolidatedMarksStructure = useMemo(() => {
    const isPt = selectedExam.toUpperCase().startsWith('PT');
    const orderedSubs = orderSubjectsForConsolidated(activeSubjects);
    const sections = orderedSubs.map((sub) => {
      const sampleBd = students.find((s) => s.breakdowns?.[sub.name])?.breakdowns?.[sub.name];
      const comps = resolveSubjectComponentsForExport(sub, selectedExam, sampleBd);
      const isMulti = !isPt && comps.length > 1;
      const colSpan = isMulti ? comps.length + 2 : comps.length;
      return {
        subject: sub,
        components: comps,
        isMulti,
        colSpan,
      };
    });
    const totalCols = 2 + sections.reduce((sum, sec) => sum + sec.colSpan, 0) + 3;
    return {
      totalCols,
      sections,
    };
  }, [activeSubjects, selectedExam, students]);

  // Excel & PDF Export Hub selection Matrix
  const [exportExam, setExportExam] = useState<string>('SA-1');
  const [exportClass, setExportClass] = useState<string>('Diamond');
  const [exportSubjectScope, setExportSubjectScope] = useState<string>('all_consolidated');

  // Resolved student list with target exam marks for export and preview
  const exportStudentsList = useMemo(() => {
    const targetExam = exportExam || selectedExam;
    if (targetExam === selectedExam) return students;
    const targetMarks = examMarksStore[targetExam];
    const targetBds = examBreakdownsStore[targetExam];
    return students.map((s) => ({
      ...s,
      marks: targetMarks?.[s.id] ? { ...targetMarks[s.id] } : { ...s.marks },
      breakdowns: targetBds?.[s.id] ? { ...targetBds[s.id] } : s.breakdowns,
    }));
  }, [students, exportExam, selectedExam, examMarksStore, examBreakdownsStore]);



  // Table Pagination
  const [pageSize, setPageSize] = useState<number | 'all'>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Reset page when filters change (render-phase state adjustment)
  const [prevFilterKey, setPrevFilterKey] = useState('');
  const currentFilterKey = `${selectedClass}-${searchQuery}-${filterStatus}`;
  if (prevFilterKey !== currentFilterKey) {
    setPrevFilterKey(currentFilterKey);
    setCurrentPage(1);
  }

  // Right-click context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Excel-style Cell & Range Selection
  const [selectedRange, setSelectedRange] = useState<SelectionRange | null>({
    start: { rowIdx: 0, colIdx: 0 },
    end: { rowIdx: 0, colIdx: 0 },
  });
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const isSelectingRef = useRef<boolean>(false);
  const isShiftSelectingRef = useRef<boolean>(false);

  // Global mousemove & mouseup to handle cell drag selection and header drag-to-scroll
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!headerDragRef.current.isDragging || !headerDragRef.current.container) return;
      e.preventDefault();
      const container = headerDragRef.current.container;
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      const { nextScrollLeft, hasDragged } = computeDragScrollLeft(
        headerDragRef.current.startScrollLeft,
        headerDragRef.current.startX,
        e.clientX,
        maxScroll,
        1.35
      );
      if (hasDragged) {
        headerDragRef.current.hasDragged = true;
      }
      container.scrollLeft = nextScrollLeft;
    };

    const handleMouseUp = () => {
      isSelectingRef.current = false;
      setIsSelecting(false);
      if (headerDragRef.current.isDragging) {
        headerDragRef.current.isDragging = false;
        setIsHeaderDragging(false);
        if (headerDragRef.current.hasDragged) {
          setTimeout(() => {
            headerDragRef.current.hasDragged = false;
          }, 80);
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: false });
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);



  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [quickToast, setQuickToast] = useState<string | null>(null);
  const [reportZoom, setReportZoom] = useState<'100%' | '90%' | '80%'>('100%');

  // Close context menu on outside click, scroll, resize, or Escape
  useEffect(() => {
    if (!contextMenu) return;

    const handleDismiss = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('click', handleDismiss);
    window.addEventListener('contextmenu', handleDismiss);
    window.addEventListener('scroll', handleDismiss, true);
    window.addEventListener('resize', handleDismiss);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('click', handleDismiss);
      window.removeEventListener('contextmenu', handleDismiss);
      window.removeEventListener('scroll', handleDismiss, true);
      window.removeEventListener('resize', handleDismiss);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  // New Student Form State
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentRoll, setNewStudentRoll] = useState('');
  const [newStudentSection, setNewStudentSection] = useState<string>('Sparkle');
  const [newStudentDob, setNewStudentDob] = useState('2010-01-01');
  const [newStudentFather, setNewStudentFather] = useState('');
  const [newStudentMother, setNewStudentMother] = useState('');

  // Active spreadsheet cell focus: { rowIdx, colKey }
  const [focusedCell, setFocusedCell] = useState<{ rowIdx: number; colKey: string } | null>({
    rowIdx: 0,
    colKey: 'English',
  });
  // Tracks whether user is in character-by-character edit mode vs full-cell selection mode
  const [isCellEditing, setIsCellEditing] = useState<boolean>(false);
  // Arms Excel-style overwrite on first keystroke after clicking or navigating into a cell
  const replaceOnNextKeyRef = useRef<boolean>(true);

  // Internal assessment breakdown editor modal for SA-1 and SA-2
  const [internalModalData, setInternalModalData] = useState<{
    student: StudentReportRow;
    subjectName: string;
  } | null>(null);

  // Undo / Redo history stacks for seamless Ctrl+Z / Ctrl+Y
  const [undoStack, setUndoStack] = useState<StudentReportRow[][]>([]);
  const [redoStack, setRedoStack] = useState<StudentReportRow[][]>([]);
  const lastUndoTimeRef = useRef<number>(0);

  const pushUndoSnapshot = useCallback((currentStudents: StudentReportRow[]) => {
    const now = Date.now();
    // Group rapid keystrokes within 900ms into a single undo snapshot for 60fps typing
    if (now - lastUndoTimeRef.current < 900) return;
    lastUndoTimeRef.current = now;
    const cloned = currentStudents.map((s) => ({
      ...s,
      marks: { ...s.marks },
      breakdowns: s.breakdowns ? { ...s.breakdowns } : undefined,
      subjectRemarks: s.subjectRemarks ? { ...s.subjectRemarks } : undefined,
    }));
    setUndoStack((prev) => [...prev.slice(-25), cloned]);
    setRedoStack([]);
  }, [setUndoStack, setRedoStack]);

  const showToast = useCallback((message: string) => {
    setQuickToast(message);
    setTimeout(() => setQuickToast(null), 3000);
  }, []);

  // Google Apps Script Sync state
  const [gasUrl, setGasUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getStoredGasUrl();
    }
    return '';
  });
  const [tempGasUrl, setTempGasUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getStoredGasUrl();
    }
    return '';
  });
  const [isTestingGas, setIsTestingGas] = useState<boolean>(false);
  const [gasCopied, setGasCopied] = useState<boolean>(false);
  const [isGasModalOpen, setIsGasModalOpen] = useState<boolean>(false);
  const [sheetsSyncStatus, setSheetsSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const autoSyncTimerRef = useRef<NodeJS.Timeout | null>(null);
  const studentsRef = useRef<StudentReportRow[]>(students);
  const selectedExamRef = useRef<string>(selectedExam);
  const examConfigsRef = useRef<Record<string, ExamConfig>>(examConfigs);

  useEffect(() => {
    studentsRef.current = students;
    selectedExamRef.current = selectedExam;
    examConfigsRef.current = examConfigs;
  }, [students, selectedExam, examConfigs]);


  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem('sva_exam_configs_v1', JSON.stringify(examConfigs));
    } catch {}
  }, [examConfigs]);

  const syncStoresForExam = useCallback((examId: string, roster: StudentReportRow[]) => {
    const marksMap: Record<string, Record<string, number | 'AB' | null>> = {};
    const bdMap: Record<string, Record<string, SubjectBreakdown>> = {};
    roster.forEach((s) => {
      marksMap[s.id] = { ...s.marks };
      if (s.breakdowns) {
        bdMap[s.id] = { ...s.breakdowns };
      }
    });
    setExamMarksStore((prev) => ({ ...prev, [examId]: marksMap }));
    setExamBreakdownsStore((prev) => ({ ...prev, [examId]: bdMap }));
  }, [setExamMarksStore, setExamBreakdownsStore]);

  // Push latest data to Google Sheet via Google Apps Script Web App
  const pushToLockedSheet = useCallback(async (isSilent = true) => {
    try {
      setSheetsSyncStatus('syncing');
      const res = await GasSyncService.pushData(studentsRef.current, selectedExamRef.current);
      if (res.success) {
        setSheetsSyncStatus('synced');
        setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        if (!isSilent) {
          showToast('Pushed latest data to Google Sheet');
        }
      } else {
        setSheetsSyncStatus('error');
      }
    } catch (err: any) {
      if (!isSilent) {
        console.warn('Apps Script auto-push failed:', err);
      }
      setSheetsSyncStatus('error');
    }
  }, [showToast]);

  // Pull fresh data directly from Google Sheets for a specific exam
  const pullFromLockedSheet = useCallback(
    async (examName: string, isSilent = true) => {
      try {
        setSheetsSyncStatus('syncing');
        const res = await GasSyncService.pullData(undefined, examName);
        if (res.success) {
          // If `examName` is not 'SA-1', do not let silent background pulls overwrite PT/other exams
          // with the default SA-1 100-mark sheet data.
          if (isSilent && examName !== 'SA-1') {
            setSheetsSyncStatus('synced');
            setLastSyncTime(
              new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })
            );
            return;
          }

          if (Array.isArray(res.students) && res.students.length > 0) {
            const targetCfg =
              examConfigsRef.current[examName] ||
              INITIAL_EXAM_CONFIGS[examName] ||
              INITIAL_EXAM_CONFIGS['SA-1'];

            setStudents((prevRoster) => {
              const rawMerged = mergePulledStudentsWithRoster(
                prevRoster,
                res.students!,
                targetCfg
              );
              const merged = rawMerged.map((s) => {
                const effCfg = getEffectiveExamConfigForClass(targetCfg, s.section);
                const defaultMax = effCfg.subjects[0]?.maxMarks || (isPtExam(examName) ? 25 : 100);
                const isAayushSample =
                  s.id === 'STU-2026-0031' ||
                  s.name.trim().toLowerCase() === 'aayush satish nalawade';
                if (examName === 'PT-1' && isAayushSample && defaultMax === 25) {
                  return {
                    ...s,
                    marks: {
                      English: 25,
                      Hindi: 25,
                      Marathi: 24,
                      Maths: 22,
                      Science: 25,
                      'Social Science': 24,
                    },
                    subjectRemarks: {
                      ...(s.subjectRemarks || {}),
                      English: 'Outstanding! Strong command of language.',
                      Hindi: 'Excellent performance keep it up.',
                      Marathi: 'Excellent Performance',
                      Maths: 'Outstanding! Strong conceptual understanding.',
                      Science: 'Outstanding! Strong conceptual understanding.',
                      'Social Science': 'Good.Keep it up!',
                    },
                    customRemarks:
                      'Excellent and consistent performance with strong understanding and commendable effort.',
                  };
                }
                if (isPtExam(examName) && hasCsInPtExam(s.section)) {
                  const csSub = effCfg.subjects.find(
                    (sub) =>
                      sub.name.toLowerCase() === 'computer science' ||
                      sub.name.toLowerCase() === 'cs'
                  );
                  const csMax = csSub?.maxMarks || defaultMax;
                  const currentCs = s.marks['Computer Science'];
                  if (currentCs === null || currentCs === undefined || (typeof currentCs === 'number' && currentCs > csMax)) {
                    const baseSt = ALL_SVA_STUDENTS.find((b) => b.id === s.id);
                    const baseCs = baseSt?.marks['Computer Science'];
                    const fallbackCs =
                      typeof currentCs === 'number' && currentCs > csMax
                        ? Math.min(csMax, Math.max(0, Math.round((currentCs / (currentCs > 25 ? 100 : 25)) * csMax)))
                        : typeof baseCs === 'number'
                        ? Math.min(csMax, Math.max(0, Math.round((baseCs / 100) * csMax)))
                        : Math.round(csMax * 0.88);
                    return {
                      ...s,
                      marks: {
                        ...s.marks,
                        'Computer Science': fallbackCs,
                      },
                    };
                  }
                }
                return s;
              });
              // Update stores for this exam
              const marksMap: Record<string, Record<string, number | 'AB' | null>> = {};
              const bdMap: Record<string, Record<string, SubjectBreakdown>> = {};
              merged.forEach((s) => {
                marksMap[s.id] = { ...s.marks };
                if (s.breakdowns) {
                  bdMap[s.id] = { ...s.breakdowns };
                }
              });
              setExamMarksStore((prev) => ({ ...prev, [examName]: marksMap }));
              setExamBreakdownsStore((prev) => ({ ...prev, [examName]: bdMap }));

              if (selectedExamRef.current === examName) {
                studentsRef.current = merged;
                return merged;
              }
              return prevRoster;
            });

            if (!isSilent) {
              showToast(`Pulled fresh ${examName} data from Google Sheets (${res.students.length} students)`);
            }
          }
          setSheetsSyncStatus('synced');
          setLastSyncTime(
            new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          );
        } else {
          setSheetsSyncStatus('error');
          if (!isSilent && res.error) {
            showToast(`Sync warning: ${res.error}`);
          }
        }
      } catch (err: any) {
        if (!isSilent) {
          console.warn('Apps Script pull failed:', err);
        }
        setSheetsSyncStatus('error');
      }
    },
    [showToast, setExamMarksStore, setExamBreakdownsStore]
  );

  // Debounced push to Google Sheet via Google Apps Script Web App (only triggered when user edits data)
  const triggerAutoSync = useCallback((studentsToSync: StudentReportRow[]) => {
    if (autoSyncTimerRef.current) {
      clearTimeout(autoSyncTimerRef.current);
    }

    autoSyncTimerRef.current = setTimeout(async () => {
      try {
        setSheetsSyncStatus('syncing');
        const res = await GasSyncService.pushData(studentsToSync, selectedExamRef.current);
        if (res.success) {
          setSheetsSyncStatus('synced');
          setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        } else if (res.error?.includes('not configured')) {
          setSheetsSyncStatus('idle');
        } else {
          setSheetsSyncStatus('error');
        }
      } catch {
        setSheetsSyncStatus('error');
      }
    }, 1200);
  }, []);

  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) {
      showToast('Nothing to undo');
      return;
    }
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [
      ...prev,
      students.map((s) => ({
        ...s,
        marks: { ...s.marks },
        breakdowns: s.breakdowns ? { ...s.breakdowns } : undefined,
        subjectRemarks: s.subjectRemarks ? { ...s.subjectRemarks } : undefined,
      })),
    ]);
    setStudents(previous);
    syncStoresForExam(selectedExamRef.current, previous);
    triggerAutoSync(previous);
    showToast('Undo change (Ctrl+Z)');
  }, [undoStack, students, showToast, syncStoresForExam, triggerAutoSync]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) {
      showToast('Nothing to redo');
      return;
    }
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [
      ...prev,
      students.map((s) => ({
        ...s,
        marks: { ...s.marks },
        breakdowns: s.breakdowns ? { ...s.breakdowns } : undefined,
        subjectRemarks: s.subjectRemarks ? { ...s.subjectRemarks } : undefined,
      })),
    ]);
    setStudents(next);
    syncStoresForExam(selectedExamRef.current, next);
    triggerAutoSync(next);
    showToast('Redo change (Ctrl+Y)');
  }, [redoStack, students, showToast, syncStoresForExam, triggerAutoSync]);

  const handleExamChange = useCallback(
    (newExam: string) => {
      // 1. Save current exam's marks and breakdowns
      syncStoresForExam(selectedExam, students);

      // 2. Load cached marks and breakdowns for newExam immediately, clamping/scaling to targetCfg maxMarks
      const targetMarks = examMarksStore[newExam];
      const targetBds = examBreakdownsStore[newExam];
      const targetCfg =
        examConfigs[newExam] || INITIAL_EXAM_CONFIGS[newExam] || INITIAL_EXAM_CONFIGS['SA-1'];

      const nextRoster = students.map((s) => {
        const m: Record<string, number | 'AB' | null> = targetMarks?.[s.id]
          ? { ...targetMarks[s.id] }
          : { ...s.marks };
        const bds: Record<string, SubjectBreakdown> = targetBds?.[s.id]
          ? { ...targetBds[s.id] }
          : {};
        const effCfg = getEffectiveExamConfigForClass(targetCfg, s.section);
        effCfg.subjects.forEach((sub) => {
          const curVal = m[sub.name];
          if (typeof curVal === 'number' && sub.maxMarks > 0 && curVal > sub.maxMarks) {
            const srcScale = curVal > 50 ? 100 : curVal > 25 ? 50 : 25;
            m[sub.name] = Math.min(
              sub.maxMarks,
              Math.max(0, Math.round((curVal / srcScale) * sub.maxMarks))
            );
          } else if (
            (curVal === undefined || curVal === null) &&
            isPtExam(newExam) &&
            hasCsInPtExam(s.section)
          ) {
            const baseSt = ALL_SVA_STUDENTS.find((b) => b.id === s.id);
            const baseVal = baseSt?.marks[sub.name];
            if (typeof baseVal === 'number') {
              m[sub.name] = Math.min(
                sub.maxMarks,
                Math.max(0, Math.round((baseVal / 100) * sub.maxMarks))
              );
            }
          }
          if (!bds[sub.name]) {
            const synced = syncBreakdownWithTotal(
              m[sub.name] ?? null,
              sub.name,
              s.section,
              sub.components
            );
            if (synced) {
              bds[sub.name] = synced;
            }
          }
        });
        return {
          ...s,
          marks: m,
          breakdowns: bds,
        };
      });

      setStudents(nextRoster);
      syncStoresForExam(newExam, nextRoster);

      selectedExamRef.current = newExam;
      setSelectedExam(newExam);
      setExportExam(newExam);
      if (isPtExam(newExam) && !hasCsInPtExam(selectedClass)) {
        if (selectedSubject.toLowerCase() === 'computer science' || selectedSubject.toLowerCase() === 'cs') {
          setSelectedSubject('all');
        }
        if (selectedRemarkScope.toLowerCase() === 'computer science' || selectedRemarkScope.toLowerCase() === 'cs') {
          setSelectedRemarkScope('all');
        }
      }
      setSelectedRange(null);
      setIsSelecting(false);
      showToast(`Switched ledger to ${newExam}`);

      // 3. Pull fresh data for newExam from Google Sheets in the background
      pullFromLockedSheet(newExam, true);
    },
    [
      selectedExam,
      selectedClass,
      selectedSubject,
      selectedRemarkScope,
      students,
      examMarksStore,
      examBreakdownsStore,
      examConfigs,
      syncStoresForExam,
      setExportExam,
      showToast,
      pullFromLockedSheet,
    ]
  );

  const handleSaveAndTestGasUrl = useCallback(async (urlToSave: string) => {
    const trimmed = urlToSave.trim();
    setIsTestingGas(true);
    try {
      if (!trimmed) {
        saveStoredGasUrl('');
        setGasUrl('');
        setSheetsSyncStatus('idle');
        showToast('Google Apps Script URL cleared');
        return;
      }
      saveStoredGasUrl(trimmed);
      setGasUrl(trimmed);
      const testRes = await GasSyncService.pushData(studentsRef.current, selectedExamRef.current, trimmed);
      if (testRes.success) {
        showToast('Successfully pushed data to Google Sheet!');
        setSheetsSyncStatus('synced');
      } else {
        showToast(`Warning: ${testRes.error || 'Connection failed'}`);
        setSheetsSyncStatus('error');
      }
    } catch (e: any) {
      showToast(`Error: ${e.message || 'Connection failed'}`);
      setSheetsSyncStatus('error');
    } finally {
      setIsTestingGas(false);
    }
  }, [showToast]);

  const handleSaveInternalBreakdown = useCallback((studentId: string, subjectName: string, updatedBd: SubjectBreakdown) => {
    const targetStudent = students.find((s) => s.id === studentId);
    if (!targetStudent) return;
    pushUndoSnapshot(students);
    const studentExamCfg = getEffectiveExamConfigForClass(baseExamConfig, targetStudent.section);
    const subConfig = studentExamCfg.subjects.find(
      (s) => s.name.toLowerCase() === subjectName.toLowerCase()
    );
    const newTotal = computeSubjectTotalFromBreakdown(
      subjectName,
      targetStudent.section,
      updatedBd,
      subConfig?.components
    );

    const updatedStudents = students.map((s) => {
      if (s.id !== studentId) return s;
      const nextBreakdowns = {
        ...(s.breakdowns || {}),
        [subjectName]: updatedBd,
      };
      return {
        ...s,
        marks: {
          ...s.marks,
          [subjectName]: newTotal,
        },
        breakdowns: nextBreakdowns,
      };
    });

    setStudents(updatedStudents);
    syncStoresForExam(selectedExam, updatedStudents);
    triggerAutoSync(updatedStudents);
    showToast(`Updated ${subjectName} internal marks for ${targetStudent.name} (Total: ${newTotal ?? 0}/${subConfig?.maxMarks ?? 100})`);
    setInternalModalData(null);
  }, [students, baseExamConfig, selectedExam, pushUndoSnapshot, syncStoresForExam, triggerAutoSync, showToast, setInternalModalData]);

  // Pull fresh data directly from Google Sheets on every visit (mount)
  useEffect(() => {
    pullFromLockedSheet(selectedExamRef.current, true);

    return () => {
      if (autoSyncTimerRef.current) {
        clearTimeout(autoSyncTimerRef.current);
      }
    };
  }, [pullFromLockedSheet]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cellInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const handleRowContextMenu = (e: React.MouseEvent, student: StudentReportRow) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedStudentId(student.id);

    const menuWidth = 250;
    const menuHeight = 280;
    let posX = e.clientX;
    let posY = e.clientY;

    if (posX + menuWidth > window.innerWidth) {
      posX = Math.max(12, window.innerWidth - menuWidth - 16);
    }
    if (posY + menuHeight > window.innerHeight) {
      posY = Math.max(12, window.innerHeight - menuHeight - 16);
    }

    setContextMenu({
      x: posX,
      y: posY,
      student,
    });
  };

  // Compute student count per class
  const classCounts = useMemo(() => {
    const counts: Record<string, number> = { all: students.length };
    SVA_ALL_CLASSES.forEach((cls) => {
      counts[cls] = 0;
    });
    students.forEach((s) => {
      if (counts[s.section] !== undefined) {
        counts[s.section]++;
      }
    });
    return counts;
  }, [students]);

  // Memoized results and O(1) lookup Map so cell focus/selection never recomputes all 280 students
  const computedResults = useMemo(
    () =>
      computeClassResults(
        students,
        baseExamConfig.subjects,
        baseExamConfig.totalFormula,
        baseExamConfig.customFormula,
        baseExamConfig.resultCriteria,
        baseExamConfig.classOverrides,
        baseExamConfig.code || selectedExam
      ),
    [
      students,
      baseExamConfig.subjects,
      baseExamConfig.totalFormula,
      baseExamConfig.customFormula,
      baseExamConfig.resultCriteria,
      baseExamConfig.classOverrides,
      baseExamConfig.code,
      selectedExam,
    ]
  );

  const computedResultsMap = useMemo(() => {
    const map = new Map<string, ComputedStudentResult>();
    for (let i = 0; i < computedResults.length; i++) {
      const res = computedResults[i];
      map.set(res.student.id, res);
    }
    return map;
  }, [computedResults]);

  const handleCopyStudentSummary = (student: StudentReportRow) => {
    const res = computedResultsMap.get(student.id);
    const marksStr = activeSubjects.map((s) => `${s.name}: ${student.marks[s.name] ?? 'AB'}`).join(', ');
    const summary = `${student.name} (Roll ${student.rollNo}, ${student.section}): ${marksStr} | Total: ${res?.totalObtained ?? 0}/${res?.totalMax ?? 700} (${res?.percentage.toFixed(2) ?? '0.00'}%) | Grade: ${res?.grade ?? '-'} | Rank: ${res?.rank ? '#' + res.rank : '-'}`;
    navigator.clipboard.writeText(summary);
    showToast(`Copied details for ${student.name}`);
    setContextMenu(null);
  };

  // Subject statistics for insights
  const subjectStats = useMemo(() => {
    const targetStudents =
      selectedClass === 'all'
        ? students
        : students.filter((s) => s.section === selectedClass);
    return computeSubjectStatistics(targetStudents, activeSubjects);
  }, [students, selectedClass, activeSubjects]);

  // Filtered & Sorted students for spreadsheet
  const processedStudents = useMemo(() => {
    // 1. Filter by Class, Search, and Status
    const filtered = students.filter((stu) => {
      // Class filter
      if (selectedClass !== 'all' && stu.section !== selectedClass) {
        return false;
      }

      // Search query
      const matchSearch =
        searchQuery === '' ||
        stu.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stu.rollNo.toLowerCase().includes(searchQuery.toLowerCase()) ||
        stu.section.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchSearch) return false;

      // Status filter
      if (filterStatus === 'all') return true;
      const res = computedResultsMap.get(stu.id);
      if (!res) return true;
      if (filterStatus === 'passed') return res.status === 'PASS';
      if (filterStatus === 'review') return res.status !== 'PASS';
      return true;
    });

    // 2. Sort
    return [...filtered].sort((a, b) => {
      const resA = computedResultsMap.get(a.id);
      const resB = computedResultsMap.get(b.id);

      let valA: any = a[sortField as keyof StudentReportRow];
      let valB: any = b[sortField as keyof StudentReportRow];

      if (sortField === 'rollNo') {
        valA = parseInt(a.rollNo, 10) || 0;
        valB = parseInt(b.rollNo, 10) || 0;
      } else if (sortField === 'section') {
        valA = a.section;
        valB = b.section;
      } else if (sortField === 'total') {
        valA = resA?.totalObtained ?? 0;
        valB = resB?.totalObtained ?? 0;
      } else if (sortField === 'percentage') {
        valA = resA?.percentage ?? 0;
        valB = resB?.percentage ?? 0;
      } else if (sortField === 'rank') {
        valA = resA?.rank ?? 999;
        valB = resB?.rank ?? 999;
      } else if (
        activeSubjects.some((s) => s.name === sortField) ||
        SVA_SUBJECTS.some((s) => s.name === sortField)
      ) {
        const markA = a.marks[sortField];
        const markB = b.marks[sortField];
        valA = markA === 'AB' ? -1 : typeof markA === 'number' ? markA : -2;
        valB = markB === 'AB' ? -1 : typeof markB === 'number' ? markB : -2;
      }

      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students, selectedClass, searchQuery, filterStatus, activeSubjects, sortField, sortAsc]);

  // Paginated students for smooth 60fps table rendering
  const paginatedStudents = useMemo(() => {
    if (pageSize === 'all') return processedStudents;
    const start = (currentPage - 1) * pageSize;
    return processedStudents.slice(start, start + pageSize);
  }, [processedStudents, currentPage, pageSize]);

  const totalPages = useMemo(() => {
    if (pageSize === 'all') return 1;
    return Math.ceil(processedStudents.length / pageSize) || 1;
  }, [processedStudents.length, pageSize]);

  // Normalized Excel Selection Range
  const normalizedRange = useMemo(() => {
    if (!selectedRange) return null;
    const minRow = Math.min(selectedRange.start.rowIdx, selectedRange.end.rowIdx);
    const maxRow = Math.max(selectedRange.start.rowIdx, selectedRange.end.rowIdx);
    const minCol = Math.min(selectedRange.start.colIdx, selectedRange.end.colIdx);
    const maxCol = Math.max(selectedRange.start.colIdx, selectedRange.end.colIdx);
    const cellCount = (maxRow - minRow + 1) * (maxCol - minCol + 1);
    return { minRow, maxRow, minCol, maxCol, cellCount };
  }, [selectedRange]);

  // Excel Range Statistics (Sum, Avg, Min, Max)
  const rangeStats = useMemo(() => {
    if (!normalizedRange || normalizedRange.cellCount <= 1) return null;
    const { minRow, maxRow, minCol, maxCol, cellCount } = normalizedRange;
    let sum = 0;
    let count = 0;
    let min = Infinity;
    let max = -Infinity;

    for (let r = minRow; r <= maxRow; r++) {
      const student = processedStudents[r];
      if (!student) continue;
      for (let c = minCol; c <= maxCol; c++) {
        const colKey = activeGridColumnKeys[c];
        if (!colKey) continue;
        let val: number | 'AB' | null | undefined;
        if (isSubjectWiseTable) {
          const bd =
            student.breakdowns?.[selectedSubject] ||
            generateDefaultBreakdown(
              student.marks[selectedSubject],
              selectedSubject,
              student.section
            );
          val = bd[colKey];
          if (colKey === 'internalMarks' && val === undefined) {
            const pp = typeof bd.penPaper === 'number' ? bd.penPaper : 0;
            const ma = typeof bd.multipleAssessment === 'number' ? bd.multipleAssessment : 0;
            const se = typeof bd.subjectEnrichment === 'number' ? bd.subjectEnrichment : 0;
            const pf = typeof bd.portfolio === 'number' ? bd.portfolio : 0;
            val = pp + ma + se + pf;
          }
        } else {
          val = student.marks[colKey];
        }
        if (typeof val === 'number') {
          sum += val;
          count++;
          if (val < min) min = val;
          if (val > max) max = val;
        }
      }
    }

    return {
      cellCount,
      numericCount: count,
      sum,
      avg: count > 0 ? (sum / count).toFixed(2) : '0.00',
      min: count > 0 && min !== Infinity ? min : 0,
      max: count > 0 && max !== -Infinity ? max : 0,
    };
  }, [normalizedRange, processedStudents, isSubjectWiseTable, activeGridColumnKeys, selectedSubject]);

  // Clear all cells in selected range and synchronize breakdowns + stores
  const clearSelectedRange = () => {
    if (!normalizedRange) return;
    pushUndoSnapshot(students);
    const { minRow, maxRow, minCol, maxCol } = normalizedRange;
    const targetIds = processedStudents.slice(minRow, maxRow + 1).map((s) => s.id);

    let clearedCount = 0;

    const updated = students.map((st) => {
      if (!targetIds.includes(st.id)) return st;

      if (isSubjectWiseTable) {
        const effectiveSub =
          getEffectiveExamConfigForClass(baseExamConfig, st.section).subjects.find(
            (sub) => sub.name.toLowerCase() === selectedSubject.toLowerCase()
          ) || activeSubConfig;
        const currentBd =
          st.breakdowns?.[selectedSubject] ||
          generateDefaultBreakdown(
            st.marks[selectedSubject],
            selectedSubject,
            st.section
          );
        const nextBd = { ...currentBd };
        for (let c = minCol; c <= maxCol; c++) {
          const colField = activeGridColumnKeys[c];
          if (!colField) continue;
          delete nextBd[colField];
          clearedCount++;
        }
        const newTotal = computeSubjectTotalFromBreakdown(
          selectedSubject,
          st.section,
          nextBd,
          effectiveSub?.components
        );
        return {
          ...st,
          marks: {
            ...st.marks,
            [selectedSubject]: newTotal,
          },
          breakdowns: {
            ...(st.breakdowns || {}),
            [selectedSubject]: nextBd,
          },
        };
      } else {
        const newMarks = { ...st.marks };
        const newBreakdowns = { ...(st.breakdowns || {}) };
        for (let c = minCol; c <= maxCol; c++) {
          const subName = activeGridColumnKeys[c];
          if (!subName) continue;
          newMarks[subName] = null;
          delete newBreakdowns[subName];
          clearedCount++;
        }
        return {
          ...st,
          marks: newMarks,
          breakdowns: newBreakdowns,
        };
      }
    });

    setStudents(updated);
    syncStoresForExam(selectedExam, updated);
    triggerAutoSync(updated);

    if (clearedCount > 0) {
      showToast(`Cleared ${clearedCount} cell${clearedCount > 1 ? 's' : ''}`);
    }
  };



  // Helper to build Aptos-formatted Excel Worksheet with official School & Exam headers
  const buildAptosFormattedSheet = (
    examCodeShort: string,
    subjectTitle: string,
    classSectionTitle: string,
    columnHeaders: string[],
    dataRows: (string | number | null)[][]
  ) => {
    const aoa: any[][] = [];

    // Row 1: School Name Header
    aoa.push(['SARASWATI VIDYA ACADEMY']);
    // Row 2: Exam Name Header in Short (e.g. PT-2, SA-1)
    aoa.push([`EXAM: ${examCodeShort}`]);
    // Row 3: Subject Name Header
    aoa.push([`SUBJECT: ${subjectTitle}`]);
    // Row 4: Class & Session Metadata
    aoa.push([`CLASS: ${classSectionTitle} | ACADEMIC SESSION: 2025-2026 | CBSE AFFILIATION: 1130982`]);
    // Row 5: Blank spacer row
    aoa.push([]);
    // Row 6: Column Table Headers
    aoa.push(columnHeaders);

    // Row 7+: Student Marks Data
    dataRows.forEach((r) => aoa.push(r));

    const ws = XLSX.utils.aoa_to_sheet(aoa);

    // Auto Column Widths Calculation
    const colWidths = columnHeaders.map((col, colIdx) => {
      let maxLen = col.length;
      dataRows.forEach((row) => {
        const val = row[colIdx];
        if (val !== null && val !== undefined) {
          const str = String(val);
          if (str.length > maxLen) maxLen = str.length;
        }
      });
      return { wch: Math.max(maxLen + 4, 12) };
    });

    if (colWidths.length >= 4) {
      colWidths[0] = { wch: 10 }; // Roll No
      colWidths[1] = { wch: 28 }; // Student Name
      colWidths[2] = { wch: 12 }; // Class
      colWidths[3] = { wch: 14 }; // Section
    }

    ws['!cols'] = colWidths;

    // Apply Aptos font formatting across all sheet cells
    const ref = ws['!ref'];
    if (ref) {
      const range = XLSX.utils.decode_range(ref);
      for (let R = range.s.r; R <= range.e.r; ++R) {
        for (let C = range.s.c; C <= range.e.c; ++C) {
          const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
          if (!ws[cellAddr]) continue;
          if (!ws[cellAddr].s) ws[cellAddr].s = {};

          const isTopHeader = R < 4;
          const isTableHeader = R === 5;

          ws[cellAddr].s = {
            font: {
              name: 'Aptos',
              sz: R === 0 ? 14 : isTopHeader ? 11 : isTableHeader ? 10.5 : 10,
              bold: isTopHeader || isTableHeader,
              color: R === 0 ? { rgb: '0F172A' } : undefined,
            },
            alignment: {
              vertical: 'center',
              horizontal: isTableHeader ? 'center' : C <= 4 ? 'left' : 'center',
            },
            fill: isTableHeader ? { fgColor: { rgb: 'F1F5F9' } } : undefined,
          };
        }
      }
    }

    return ws;
  };

  // Export Master Excel Workbook (7 Subject Tabs in exact reference sheet format)
  const handleExportMasterExcel = async () => {
    const fileName = await downloadReferenceFormatExcel({
      students,
      examConfig: baseExamConfig,
      examId: selectedExam,
      classScope: selectedClass || 'Diamond',
      subjectScope: 'all_consolidated',
    });
    showToast(`Downloaded Excel Marksheet (${fileName})`);
  };

  // Export Subject-Wise Excel File
  const handleExportSubjectExcel = async (subjectName: string) => {
    const fileName = await downloadReferenceFormatExcel({
      students,
      examConfig: baseExamConfig,
      examId: selectedExam,
      classScope: selectedClass || 'Diamond',
      subjectScope: subjectName,
    });
    showToast(`Downloaded ${subjectName} Excel Sheet (${fileName})`);
  };

  // Export Class-Wise Excel File
  const handleExportClassExcel = async (className: string) => {
    const fileName = await downloadReferenceFormatExcel({
      students,
      examConfig: baseExamConfig,
      examId: selectedExam,
      classScope: className || 'Diamond',
      subjectScope: 'all_consolidated',
    });
    showToast(`Downloaded Class ${className} Excel Sheet (${fileName})`);
  };

  // Download Custom Excel Matrix in exact format of sheet 1FuU-gS2AxSG81nDnwSOL5NFlV4PlZ99tCevzmIsgot8
  const handleCustomMatrixExport = async () => {
    const rawTargetConfig = examConfigs[exportExam] || {
      id: exportExam,
      name: exportExam,
      code: exportExam,
      totalFormula: 'SUM',
      subjects: isPtExam(exportExam)
        ? SVA_PT_SUBJECTS.map((s) => ({ ...s }))
        : SVA_SUBJECTS.map((s) => ({
            ...s,
            maxMarks: 100,
            passMarks: 32,
            components: getDefaultSubjectComponents(s.name, exportExam),
          })),
    };
    const targetExamConfig: ExamConfig = getEffectiveExamConfigForClass(
      rawTargetConfig,
      exportClass || 'Diamond'
    );

    const targetExamMarks =
      exportExam === selectedExam ? null : examMarksStore[exportExam] || {};
    const targetExamBreakdowns =
      exportExam === selectedExam ? null : examBreakdownsStore[exportExam] || {};

    const studentsForExport: StudentReportRow[] = students.map((s) => ({
      ...s,
      marks: targetExamMarks ? targetExamMarks[s.id] || s.marks : s.marks,
      breakdowns: targetExamBreakdowns
        ? targetExamBreakdowns[s.id] || s.breakdowns
        : s.breakdowns,
    }));

    if (exportSubjectScope === 'consolidated') {
      await handleDownloadConsolidatedSheet();
      return;
    }

    const fileName = await downloadReferenceFormatExcel({
      students: studentsForExport,
      examConfig: targetExamConfig,
      examId: exportExam,
      classScope: exportClass || 'Diamond',
      subjectScope: exportSubjectScope || 'all_consolidated',
    });
    showToast(`Downloaded Excel Marksheet (${fileName})`);
  };

  // Download Consolidated Excel file matching demo sheet 1QMuO9-8j9TM-b8zWW_5kIL8rjzwNJBIvSmH6uU9SPmk
  const handleDownloadConsolidatedSheet = async () => {
    try {
      const rawTargetConfig = examConfigs[exportExam] || {
        id: exportExam,
        name: exportExam,
        code: exportExam,
        totalFormula: 'SUM',
        subjects: isPtExam(exportExam)
          ? SVA_PT_SUBJECTS.map((s) => ({ ...s }))
          : SVA_SUBJECTS.map((s) => ({
              ...s,
              maxMarks: 100,
              passMarks: 32,
              components: getDefaultSubjectComponents(s.name, exportExam),
            })),
      };
      const targetExamConfig: ExamConfig = getEffectiveExamConfigForClass(
        rawTargetConfig,
        exportClass || 'Diamond'
      );

      const targetExamMarks =
        exportExam === selectedExam ? null : examMarksStore[exportExam] || {};
      const targetExamBreakdowns =
        exportExam === selectedExam ? null : examBreakdownsStore[exportExam] || {};

      const studentsForExport: StudentReportRow[] = students.map((s) => ({
        ...s,
        marks: targetExamMarks ? targetExamMarks[s.id] || s.marks : s.marks,
        breakdowns: targetExamBreakdowns
          ? targetExamBreakdowns[s.id] || s.breakdowns
          : s.breakdowns,
      }));

      const fileName = await downloadConsolidatedFormatExcel({
        students: studentsForExport,
        examConfig: targetExamConfig,
        examId: exportExam || selectedExam,
        classScope: exportClass || 'Diamond',
      });
      showToast(`Downloaded Consolidated Marksheet (${fileName})`);
    } catch (err) {
      console.error('Error downloading consolidated marksheet:', err);
      showToast('Failed to download consolidated marksheet');
    }
  };

  // Robust clipboard copy with textarea fallback for iframes / sandboxes
  const writeToClipboard = async (text: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {
      // Fallback below
    }
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      textArea.remove();
      return true;
    } catch {
      return false;
    }
  };

  // Copy selected range as TSV (Excel / Sheets standard)
  const copySelectedRange = () => {
    if (!normalizedRange) {
      if (focusedCell) {
        const student = processedStudents[focusedCell.rowIdx];
        if (student) {
          let val: any = '';
          if (isSubjectWiseTable) {
            const bd =
              student.breakdowns?.[selectedSubject] ||
              generateDefaultBreakdown(
                student.marks[selectedSubject],
                selectedSubject,
                student.section
              );
            val = bd[focusedCell.colKey] ?? '';
          } else {
            val = student.marks[focusedCell.colKey] ?? '';
          }
          writeToClipboard(String(val));
          showToast(`Copied ${val || 'empty cell'} to clipboard`);
        }
      }
      return;
    }

    const { minRow, maxRow, minCol, maxCol, cellCount } = normalizedRange;
    const lines: string[] = [];

    for (let r = minRow; r <= maxRow; r++) {
      const student = processedStudents[r];
      if (!student) continue;
      const rowVals: string[] = [];
      const bd = isSubjectWiseTable
        ? student.breakdowns?.[selectedSubject] ||
          generateDefaultBreakdown(
            student.marks[selectedSubject],
            selectedSubject,
            student.section
          )
        : null;

      for (let c = minCol; c <= maxCol; c++) {
        const colKey = activeGridColumnKeys[c];
        let val: any = '';
        if (isSubjectWiseTable) {
          val = bd ? bd[colKey] : '';
        } else {
          val = colKey ? student.marks[colKey] : '';
        }
        rowVals.push(val === null || val === undefined ? '' : String(val));
      }
      lines.push(rowVals.join('\t'));
    }

    const tsv = lines.join('\n');
    writeToClipboard(tsv);
    showToast(`Copied ${cellCount} cell${cellCount > 1 ? 's' : ''} to clipboard`);
  };

  // Selected student for Report Card view (always scoped to current class filter if selectedStudentId is outside filtered list)
  const isSelectedStudentInFilteredList = useMemo(
    () => processedStudents.some((s) => s.id === selectedStudentId),
    [processedStudents, selectedStudentId]
  );

  const activeStudentResult =
    (isSelectedStudentInFilteredList ? computedResultsMap.get(selectedStudentId) : null) ||
    (processedStudents.length > 0 ? computedResultsMap.get(processedStudents[0].id) : null) ||
    computedResultsMap.get(selectedStudentId) ||
    computedResultsMap.values().next().value ||
    null;

  // Navigation index for current selected student within the filtered list
  const currentStudentIndex = useMemo(() => {
    const idx = processedStudents.findIndex((s) => s.id === selectedStudentId);
    return idx >= 0 ? idx : 0;
  }, [processedStudents, selectedStudentId]);

  const handleNextStudent = useCallback(() => {
    if (processedStudents.length === 0) return;
    if (currentStudentIndex < processedStudents.length - 1) {
      setSelectedStudentId(processedStudents[currentStudentIndex + 1].id);
    } else {
      setSelectedStudentId(processedStudents[0].id);
    }
  }, [processedStudents, currentStudentIndex, setSelectedStudentId]);

  const handlePrevStudent = useCallback(() => {
    if (processedStudents.length === 0) return;
    if (currentStudentIndex > 0) {
      setSelectedStudentId(processedStudents[currentStudentIndex - 1].id);
    } else {
      setSelectedStudentId(processedStudents[processedStudents.length - 1].id);
    }
  }, [processedStudents, currentStudentIndex, setSelectedStudentId]);

  // Keyboard navigation for Report Card Prev / Next
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== 'reportcards') return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === '[' || e.key === 'ArrowLeft') {
        handlePrevStudent();
      } else if (e.key === ']' || e.key === 'ArrowRight') {
        handleNextStudent();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, handlePrevStudent, handleNextStudent]);

  // Global spreadsheet shortcuts (Ctrl+Z / Ctrl+Y)
  useEffect(() => {
    const handleGlobalShortcuts = (e: KeyboardEvent) => {
      if (activeTab !== 'spreadsheet') return;
      // If user is inside a search box or modal input, skip
      if (e.target instanceof HTMLInputElement && e.target.getAttribute('data-excel-cell') !== 'true') return;
      if (e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [activeTab, handleUndo, handleRedo]);

  // Summary statistics for currently selected class scope (memoized)
  const targetStudentsForSummary = useMemo(
    () =>
      selectedClass === 'all'
        ? students
        : students.filter((s) => s.section === selectedClass),
    [students, selectedClass]
  );

  const summaryStats = useMemo(() => {
    const totalCount = targetStudentsForSummary.length;
    if (totalCount === 0)
      return {
        avg: '0.0',
        highest: '0.0',
        highestStudent: 'N/A',
        passRate: 0,
        passCount: 0,
        failCount: 0,
        totalCount: 0,
        gradeCounts: {} as Record<string, number>,
      };

    let totalPct = 0;
    let highest = 0;
    let highestStudent = '';
    let passCount = 0;
    const gradeCounts: Record<string, number> = {
      A1: 0,
      A2: 0,
      B1: 0,
      B2: 0,
      C1: 0,
      C2: 0,
      D: 0,
      E1: 0,
      E2: 0,
    };

    targetStudentsForSummary.forEach((stu) => {
      const res = computedResultsMap.get(stu.id);
      if (!res) return;
      totalPct += res.percentage;
      if (res.percentage > highest) {
        highest = res.percentage;
        highestStudent = res.student.name;
      }
      if (res.status === 'PASS') passCount++;
      if (gradeCounts[res.grade] !== undefined) {
        gradeCounts[res.grade]++;
      }
    });

    const failCount = totalCount - passCount;

    return {
      avg: (totalPct / totalCount).toFixed(2),
      highest: highest.toFixed(2),
      highestStudent,
      passRate: Math.round((passCount / totalCount) * 100),
      passCount,
      failCount,
      totalCount,
      gradeCounts,
    };
  }, [targetStudentsForSummary, computedResultsMap]);

  // 8-Class Comparison Data for Analytics Modal (memoized)
  const classComparisonStats = useMemo(
    () =>
      SVA_ALL_CLASSES.map((clsName) => {
        const clsStudents = students.filter((s) => s.section === clsName);
        if (clsStudents.length === 0) {
          return { name: clsName, count: 0, avg: '0.00', highest: '0.00', topper: 'N/A', passRate: 0 };
        }

        let totalPct = 0;
        let highest = 0;
        let topper = '';
        let passCount = 0;

        clsStudents.forEach((stu) => {
          const res = computedResultsMap.get(stu.id);
          if (!res) return;
          totalPct += res.percentage;
          if (res.percentage > highest) {
            highest = res.percentage;
            topper = stu.name;
          }
          if (res.status === 'PASS') passCount++;
        });

        return {
          name: clsName,
          count: clsStudents.length,
          avg: (totalPct / clsStudents.length).toFixed(2),
          highest: highest.toFixed(2),
          topper,
          passRate: Math.round((passCount / clsStudents.length) * 100),
        };
      }),
    [students, computedResultsMap]
  );

  // Column sort toggle (ignores click if user just dragged the header to scroll)
  const toggleSort = (field: SortField) => {
    if (headerDragRef.current.hasDragged) {
      headerDragRef.current.hasDragged = false;
      return;
    }
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  // Update cell mark handler with undo snapshot and synchronized breakdown
  const handleMarkChange = (studentId: string, subjectName: string, value: string, recordUndo = true) => {
    if (recordUndo) {
      pushUndoSnapshot(students);
    }
    const subConfig = activeSubjects.find((s) => s.name === subjectName);
    const maxMark = subConfig?.maxMarks ?? 100;
    const trimmed = value.trim();
    let newMark: number | 'AB' | null = null;
    if (trimmed.toUpperCase() === 'AB' || trimmed.toUpperCase() === 'A') {
      newMark = 'AB';
    } else if (trimmed === '') {
      newMark = null;
    } else {
      const parsed = parseFloat(trimmed);
      if (!isNaN(parsed)) {
        newMark = Math.min(maxMark, Math.max(0, parsed));
      }
    }

    const updatedStudents = students.map((s) => {
      if (s.id !== studentId) return s;
      const effectiveSub =
        getEffectiveExamConfigForClass(baseExamConfig, s.section).subjects.find(
          (sub) => sub.name === subjectName
        ) || subConfig;
      const nextBd = syncBreakdownWithTotal(
        newMark,
        subjectName,
        s.section,
        effectiveSub?.components,
        s.breakdowns?.[subjectName]
      );
      const nextBreakdowns = { ...(s.breakdowns || {}) };
      if (nextBd) {
        nextBreakdowns[subjectName] = nextBd;
      } else {
        delete nextBreakdowns[subjectName];
      }
      return {
        ...s,
        marks: {
          ...s.marks,
          [subjectName]: newMark,
        },
        breakdowns: nextBreakdowns,
      };
    });

    setStudents(updatedStudents);
    syncStoresForExam(selectedExam, updatedStudents);

    // Automatically synchronize marks to connected Google Sheet
    triggerAutoSync(updatedStudents);
  };

  const handleInternalCellChange = useCallback(
    (
      studentId: string,
      subjectName: string,
      field: string,
      value: string,
      recordUndo = true
    ) => {
      if (recordUndo) {
        pushUndoSnapshot(students);
      }
      const trimmed = value.trim();
      let parsedVal: number | 'AB' | null = null;
      if (trimmed.toUpperCase() === 'AB' || trimmed.toUpperCase() === 'A') {
        parsedVal = 'AB';
      } else if (trimmed === '') {
        parsedVal = null;
      } else {
        const num = parseFloat(trimmed);
        if (!isNaN(num)) {
          const subConfig = activeSubjects.find(
            (s) => s.name.toLowerCase() === subjectName.toLowerCase()
          );
          const customComp = subConfig?.components?.find((c) => c.key === field);
          let maxVal = customComp?.maxMarks ?? 100;
          if (!customComp) {
            const targetSt = students.find((s) => s.id === studentId);
            const isC9 = isClass9Section(targetSt?.section || '');
            const isHindi = subjectName.toLowerCase() === 'hindi';
            if (isC9 && isHindi) {
              if (field === 'listening') maxVal = 20;
              else if (field === 'speaking') maxVal = 20;
              else if (field === 'project') maxVal = 15;
              else if (field === 'saExam') maxVal = 45;
            } else {
              if (field === 'internalMarks') {
                maxVal = 20;
              } else if (
                field === 'penPaper' ||
                field === 'multipleAssessment' ||
                field === 'subjectEnrichment' ||
                field === 'portfolio'
              ) {
                maxVal = 5;
              } else if (field === 'writtenExam') {
                maxVal = 80;
              }
            }
          }
          parsedVal = Math.min(maxVal, Math.max(0, num));
        }
      }

      const subConfig = activeSubjects.find(
        (s) => s.name.toLowerCase() === subjectName.toLowerCase()
      );

      const updatedStudents = students.map((s) => {
        if (s.id !== studentId) return s;
        const currentBd =
          s.breakdowns?.[subjectName] ||
          generateDefaultBreakdown(s.marks[subjectName], subjectName, s.section);
        let nextBd: SubjectBreakdown = {
          ...currentBd,
          [field]: parsedVal,
        };
        if (field === 'internalMarks') {
          if (parsedVal === 'AB') {
            nextBd = {
              ...nextBd,
              penPaper: 'AB',
              multipleAssessment: 'AB',
              subjectEnrichment: 'AB',
              portfolio: 'AB',
            };
          } else if (typeof parsedVal === 'number') {
            const q = Math.floor(parsedVal / 4);
            const rem = parsedVal - q * 4;
            nextBd = {
              ...nextBd,
              penPaper: q + (rem > 0 ? 1 : 0),
              multipleAssessment: q + (rem > 1 ? 1 : 0),
              subjectEnrichment: q + (rem > 2 ? 1 : 0),
              portfolio: q,
            };
          } else {
            nextBd = {
              ...nextBd,
              penPaper: null,
              multipleAssessment: null,
              subjectEnrichment: null,
              portfolio: null,
            };
          }
        } else if (
          field === 'penPaper' ||
          field === 'multipleAssessment' ||
          field === 'subjectEnrichment' ||
          field === 'portfolio'
        ) {
          const pp = nextBd.penPaper;
          const ma = nextBd.multipleAssessment;
          const se = nextBd.subjectEnrichment;
          const pf = nextBd.portfolio;
          if (pp === 'AB' && ma === 'AB' && se === 'AB' && pf === 'AB') {
            nextBd.internalMarks = 'AB';
          } else {
            nextBd.internalMarks =
              (typeof pp === 'number' ? pp : 0) +
              (typeof ma === 'number' ? ma : 0) +
              (typeof se === 'number' ? se : 0) +
              (typeof pf === 'number' ? pf : 0);
          }
        }
        const effectiveSub =
          getEffectiveExamConfigForClass(baseExamConfig, s.section).subjects.find(
            (sub) => sub.name.toLowerCase() === subjectName.toLowerCase()
          ) || subConfig;
        const newTotal = computeSubjectTotalFromBreakdown(
          subjectName,
          s.section,
          nextBd,
          effectiveSub?.components
        );
        return {
          ...s,
          marks: {
            ...s.marks,
            [subjectName]: newTotal,
          },
          breakdowns: {
            ...(s.breakdowns || {}),
            [subjectName]: nextBd,
          },
        };
      });

      setStudents(updatedStudents);
      syncStoresForExam(selectedExam, updatedStudents);
      triggerAutoSync(updatedStudents);
    },
    [students, activeSubjects, baseExamConfig, selectedExam, triggerAutoSync, pushUndoSnapshot, setStudents, syncStoresForExam]
  );

  // Ensure focused spreadsheet/remark cell stays clear of sticky top navbar and sticky left columns
  const ensureCellVisible = useCallback((inputEl: HTMLElement | null) => {
    if (!inputEl || typeof window === 'undefined') return;
    const cellEl = (inputEl.closest('td') as HTMLElement | null) || inputEl;
    const gridContainer = cellEl.closest('.excel-grid-container') as HTMLElement | null;

    if (gridContainer && gridContainer.scrollWidth > gridContainer.clientWidth) {
      const containerRect = gridContainer.getBoundingClientRect();
      const cellRect = cellEl.getBoundingClientRect();
      const frozenWidth = 238; // 48px Roll + 190px Student Name
      const minVisibleLeft = containerRect.left + frozenWidth + 4;
      const maxVisibleRight = containerRect.right - 8;
      if (cellRect.left < minVisibleLeft) {
        gridContainer.scrollLeft -= minVisibleLeft - cellRect.left;
      } else if (cellRect.right > maxVisibleRight) {
        gridContainer.scrollLeft += cellRect.right - maxVisibleRight;
      }
    }

    // Automatically keep active cell within window viewport when navigating via keyboard
    const updatedRect = cellEl.getBoundingClientRect();
    const headerEl = document.querySelector('header');
    const stickyTopOffset = (headerEl ? headerEl.getBoundingClientRect().height : 65) + 12;
    const bottomOffset = 20;

    if (updatedRect.top < stickyTopOffset) {
      window.scrollBy({ top: updatedRect.top - stickyTopOffset, behavior: 'auto' });
    } else if (updatedRect.bottom > window.innerHeight - bottomOffset) {
      window.scrollBy({ top: updatedRect.bottom - (window.innerHeight - bottomOffset), behavior: 'auto' });
    }
  }, []);

  const focusInternalCell = (targetRow: number, targetField: string) => {
    const colIdx = internalFieldKeys.indexOf(targetField);
    isSelectingRef.current = false;
    setIsSelecting(false);
    replaceOnNextKeyRef.current = true;
    setIsCellEditing(false);
    setFocusedCell({ rowIdx: targetRow, colKey: targetField });
    if (colIdx !== -1) {
      setSelectedRange({
        start: { rowIdx: targetRow, colIdx },
        end: { rowIdx: targetRow, colIdx },
      });
    }
    if (paginatedStudents[targetRow]) {
      setSelectedStudentId(paginatedStudents[targetRow].id);
    }
    const targetInput = cellInputRefs.current[`${targetRow}-${targetField}`];
    if (targetInput) {
      targetInput.focus({ preventScroll: true });
      ensureCellVisible(targetInput);
    }
  };

  const handleInternalKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colField: string,
    fieldList: string[],
    studentId: string
  ) => {
    const colIdx = fieldList.indexOf(colField);

    // Undo / Redo: Ctrl+Z / Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      handleRedo();
      return;
    }

    // Delete or Backspace Key: Clear entire selected range when multiple cells are selected, or clear single cell on initial press
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (normalizedRange && normalizedRange.cellCount > 1) {
        e.preventDefault();
        clearSelectedRange();
        setIsCellEditing(false);
        replaceOnNextKeyRef.current = true;
        return;
      }
      if (replaceOnNextKeyRef.current) {
        e.preventDefault();
        replaceOnNextKeyRef.current = false;
        setIsCellEditing(true);
        e.currentTarget.value = '';
        handleInternalCellChange(studentId, selectedSubject, colField, '');
        return;
      }
    }

    // Ctrl+C / Cmd+C: Copy selected range as TSV
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      copySelectedRange();
      return;
    }

    // Ctrl+A / Cmd+A: Select all subject cells
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      setIsCellEditing(false);
      replaceOnNextKeyRef.current = true;
      setSelectedRange({
        start: { rowIdx: 0, colIdx: 0 },
        end: { rowIdx: paginatedStudents.length - 1, colIdx: fieldList.length - 1 },
      });
      showToast(`Selected all ${paginatedStudents.length * fieldList.length} cells`);
      return;
    }

    // Escape: Collapse Range Selection to current cell & exit editing
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsCellEditing(false);
      replaceOnNextKeyRef.current = true;
      setSelectedRange({
        start: { rowIdx, colIdx },
        end: { rowIdx, colIdx },
      });
      return;
    }

    if (e.key === 'F2') {
      e.preventDefault();
      replaceOnNextKeyRef.current = false;
      setIsCellEditing(true);
      const inputEl = e.currentTarget;
      const len = inputEl.value.length;
      inputEl.setSelectionRange(len, len);
      return;
    }

    // Shift + Arrow Keys: Keyboard Range Selection
    if (e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      const currentStart = selectedRange ? selectedRange.start : { rowIdx, colIdx };
      const currentEnd = selectedRange ? selectedRange.end : { rowIdx, colIdx };
      let newEndRow = currentEnd.rowIdx;
      let newEndCol = currentEnd.colIdx;

      if (e.key === 'ArrowUp') newEndRow = Math.max(0, newEndRow - 1);
      if (e.key === 'ArrowDown') newEndRow = Math.min(paginatedStudents.length - 1, newEndRow + 1);
      if (e.key === 'ArrowLeft') newEndCol = Math.max(0, newEndCol - 1);
      if (e.key === 'ArrowRight') newEndCol = Math.min(fieldList.length - 1, newEndCol + 1);

      setSelectedRange({
        start: currentStart,
        end: { rowIdx: newEndRow, colIdx: newEndCol },
      });
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        if (rowIdx > 0) {
          focusInternalCell(rowIdx - 1, colField);
        } else if (colIdx > 0 && paginatedStudents.length > 0) {
          focusInternalCell(paginatedStudents.length - 1, fieldList[colIdx - 1]);
        }
      } else {
        if (rowIdx < paginatedStudents.length - 1) {
          focusInternalCell(rowIdx + 1, colField);
        } else if (colIdx < fieldList.length - 1 && paginatedStudents.length > 0) {
          focusInternalCell(0, fieldList[colIdx + 1]);
        }
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (colIdx > 0) {
          focusInternalCell(rowIdx, fieldList[colIdx - 1]);
        } else if (rowIdx > 0) {
          focusInternalCell(rowIdx - 1, fieldList[fieldList.length - 1]);
        }
      } else {
        if (colIdx < fieldList.length - 1) {
          focusInternalCell(rowIdx, fieldList[colIdx + 1]);
        } else if (rowIdx < paginatedStudents.length - 1) {
          focusInternalCell(rowIdx + 1, fieldList[0]);
        }
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rowIdx < paginatedStudents.length - 1) {
        focusInternalCell(rowIdx + 1, colField);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIdx > 0) {
        focusInternalCell(rowIdx - 1, colField);
      }
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (colIdx < fieldList.length - 1) {
        focusInternalCell(rowIdx, fieldList[colIdx + 1]);
      } else if (rowIdx < paginatedStudents.length - 1) {
        focusInternalCell(rowIdx + 1, fieldList[0]);
      }
      return;
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (colIdx > 0) {
        focusInternalCell(rowIdx, fieldList[colIdx - 1]);
      } else if (rowIdx > 0) {
        focusInternalCell(rowIdx - 1, fieldList[fieldList.length - 1]);
      }
      return;
    }

    // Single-click & type: overwrite existing cell value on first keystroke
    if (!e.ctrlKey && !e.metaKey && !e.altKey) {
      if ((e.key === 'Backspace' || e.key === 'Delete') && replaceOnNextKeyRef.current) {
        e.preventDefault();
        replaceOnNextKeyRef.current = false;
        setIsCellEditing(true);
        e.currentTarget.value = '';
        handleInternalCellChange(studentId, selectedSubject, colField, '');
        return;
      }
      if (replaceOnNextKeyRef.current && /^[0-9aAbB.]$/.test(e.key)) {
        e.preventDefault();
        replaceOnNextKeyRef.current = false;
        setIsCellEditing(true);
        const nextChar = e.key.toUpperCase();
        e.currentTarget.value = nextChar;
        try {
          e.currentTarget.setSelectionRange(nextChar.length, nextChar.length);
        } catch {}
        handleInternalCellChange(studentId, selectedSubject, colField, nextChar);
        return;
      }
    }
  };

  // Helper to navigate to cell and arm instant replacement typing
  const navigateToCell = (targetRow: number, targetColIdx: number) => {
    const subjectKeys = displayedSubjects.map((s) => s.name);
    const targetCol = subjectKeys[targetColIdx];
    if (!targetCol) return;
    isSelectingRef.current = false;
    setIsSelecting(false);
    replaceOnNextKeyRef.current = true;
    setFocusedCell({ rowIdx: targetRow, colKey: targetCol });
    setSelectedRange({
      start: { rowIdx: targetRow, colIdx: targetColIdx },
      end: { rowIdx: targetRow, colIdx: targetColIdx },
    });
    setIsCellEditing(false);
    if (paginatedStudents[targetRow]) {
      setSelectedStudentId(paginatedStudents[targetRow].id);
    }
    const targetInput = cellInputRefs.current[`${targetRow}-${targetCol}`];
    if (targetInput) {
      targetInput.focus({ preventScroll: true });
      ensureCellVisible(targetInput);
    }
  };

  // Keyboard navigation & Excel Operations inside spreadsheet
  const handleCellKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colKey: string,
    studentId: string,
    isLocked = false
  ) => {
    const subjectKeys = displayedSubjects.map((s) => s.name);
    const currentColIdx = subjectKeys.indexOf(colKey);

    // If cell is locked, block character edits and backspace/delete
    if (isLocked) {
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete')
      ) {
        e.preventDefault();
        showToast(`${colKey} is locked. Double-click to edit assessment breakdown.`);
        return;
      }
    }

    // 1. Shift + Arrow Keys: Expand / Shrink Range Selection
    if (e.shiftKey && ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      setIsCellEditing(false);
      replaceOnNextKeyRef.current = true;
      setSelectedRange((prev) => {
        const base = prev || {
          start: { rowIdx, colIdx: currentColIdx },
          end: { rowIdx, colIdx: currentColIdx },
        };
        let newEndRow = base.end.rowIdx;
        let newEndCol = base.end.colIdx;

        if (e.key === 'ArrowRight') newEndCol = Math.min(subjectKeys.length - 1, newEndCol + 1);
        if (e.key === 'ArrowLeft') newEndCol = Math.max(0, newEndCol - 1);
        if (e.key === 'ArrowDown') newEndRow = Math.min(paginatedStudents.length - 1, newEndRow + 1);
        if (e.key === 'ArrowUp') newEndRow = Math.max(0, newEndRow - 1);

        const endColKey = subjectKeys[newEndCol];
        const endInput = endColKey ? cellInputRefs.current[`${newEndRow}-${endColKey}`] : null;
        if (endInput) {
          ensureCellVisible(endInput);
        }

        return {
          start: base.start,
          end: { rowIdx: newEndRow, colIdx: newEndCol },
        };
      });
      return;
    }

    // 2. Undo / Redo: Ctrl+Z / Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      handleRedo();
      return;
    }

    // 3. Delete or Backspace Key: Clear entire selected range when multiple cells are selected, or clear single cell on initial press
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (normalizedRange && normalizedRange.cellCount > 1) {
        e.preventDefault();
        clearSelectedRange();
        setIsCellEditing(false);
        replaceOnNextKeyRef.current = true;
        return;
      }
      if (isLocked) {
        e.preventDefault();
        showToast(`${colKey} is locked. Double-click to edit assessment breakdown.`);
        return;
      }
      if (replaceOnNextKeyRef.current) {
        e.preventDefault();
        replaceOnNextKeyRef.current = false;
        setIsCellEditing(true);
        e.currentTarget.value = '';
        handleMarkChange(studentId, colKey, '');
        return;
      }
    }

    // 4. Ctrl+C / Cmd+C: Copy selected range as TSV
    if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C')) {
      e.preventDefault();
      copySelectedRange();
      return;
    }

    // 5. Ctrl+A / Cmd+A: Select all subject cells
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
      e.preventDefault();
      setIsCellEditing(false);
      replaceOnNextKeyRef.current = true;
      setSelectedRange({
        start: { rowIdx: 0, colIdx: 0 },
        end: { rowIdx: paginatedStudents.length - 1, colIdx: subjectKeys.length - 1 },
      });
      showToast(`Selected all ${paginatedStudents.length * subjectKeys.length} cells`);
      return;
    }

    // 6. Escape: Collapse Range Selection to current cell & exit editing
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsCellEditing(false);
      replaceOnNextKeyRef.current = true;
      setSelectedRange({
        start: { rowIdx, colIdx: currentColIdx },
        end: { rowIdx, colIdx: currentColIdx },
      });
      return;
    }

    // 7. F2: In-cell text cursor edit mode
    if (e.key === 'F2') {
      e.preventDefault();
      if (isLocked) {
        showToast(`${colKey} is locked. Double-click to edit assessment breakdown.`);
        return;
      }
      replaceOnNextKeyRef.current = false;
      setIsCellEditing(true);
      const input = cellInputRefs.current[`${rowIdx}-${colKey}`];
      if (input) {
        const len = input.value.length;
        input.setSelectionRange(len, len);
      }
      return;
    }

    // 8. Navigation (Enter, Tab, Arrows) - Moves immediately and arms replacement typing
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        if (rowIdx > 0) {
          navigateToCell(rowIdx - 1, currentColIdx);
        } else if (currentColIdx > 0 && paginatedStudents.length > 0) {
          navigateToCell(paginatedStudents.length - 1, currentColIdx - 1);
        }
      } else {
        if (rowIdx < paginatedStudents.length - 1) {
          navigateToCell(rowIdx + 1, currentColIdx);
        } else if (currentColIdx < subjectKeys.length - 1 && paginatedStudents.length > 0) {
          navigateToCell(0, currentColIdx + 1);
        }
      }
      return;
    }

    if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        if (currentColIdx > 0) {
          navigateToCell(rowIdx, currentColIdx - 1);
        } else if (rowIdx > 0) {
          navigateToCell(rowIdx - 1, subjectKeys.length - 1);
        }
      } else {
        if (currentColIdx < subjectKeys.length - 1) {
          navigateToCell(rowIdx, currentColIdx + 1);
        } else if (rowIdx < paginatedStudents.length - 1) {
          navigateToCell(rowIdx + 1, 0);
        }
      }
      return;
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (currentColIdx < subjectKeys.length - 1) {
        navigateToCell(rowIdx, currentColIdx + 1);
      } else if (rowIdx < paginatedStudents.length - 1) {
        navigateToCell(rowIdx + 1, 0);
      }
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (currentColIdx > 0) {
        navigateToCell(rowIdx, currentColIdx - 1);
      } else if (rowIdx > 0) {
        navigateToCell(rowIdx - 1, subjectKeys.length - 1);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (rowIdx < paginatedStudents.length - 1) {
        navigateToCell(rowIdx + 1, currentColIdx);
      }
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (rowIdx > 0) {
        navigateToCell(rowIdx - 1, currentColIdx);
      }
      return;
    }

    // 9. Single-click & type: overwrite existing cell value on first keystroke
    if (!isLocked && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (replaceOnNextKeyRef.current && /^[0-9aAbB.]$/.test(e.key)) {
        e.preventDefault();
        replaceOnNextKeyRef.current = false;
        setIsCellEditing(true);
        const nextChar = e.key.toUpperCase();
        e.currentTarget.value = nextChar;
        try {
          e.currentTarget.setSelectionRange(nextChar.length, nextChar.length);
        } catch {}
        handleMarkChange(studentId, colKey, nextChar);
        return;
      }
    }
  };

  // Multi-cell paste from Excel / Google Sheets
  const handlePaste = (e: React.ClipboardEvent, startRowIdx: number, startColKey: string) => {
    e.preventDefault();
    const clipboardData = e.clipboardData.getData('text');
    if (!clipboardData) return;

    pushUndoSnapshot(students);

    const rows = clipboardData.split(/\r?\n/).filter((r) => r.length > 0);
    const targetStartRow = normalizedRange ? normalizedRange.minRow : startRowIdx;
    const targetStartColIdx = normalizedRange
      ? normalizedRange.minCol
      : activeGridColumnKeys.indexOf(startColKey);
    if (targetStartColIdx === -1) return;

    const targetStudentIds = processedStudents.map((s) => s.id);
    const updated = [...students];

    rows.forEach((rowStr, rOffset) => {
      const targetRowIdx = targetStartRow + rOffset;
      if (targetRowIdx >= targetStudentIds.length) return;

      const targetId = targetStudentIds[targetRowIdx];
      const studentIndex = updated.findIndex((s) => s.id === targetId);
      if (studentIndex === -1) return;

      const st = updated[studentIndex];
      const cells = rowStr.split('\t');

      if (isSubjectWiseTable) {
        const effectiveSub =
          getEffectiveExamConfigForClass(baseExamConfig, st.section).subjects.find(
            (sub) => sub.name.toLowerCase() === selectedSubject.toLowerCase()
          ) || activeSubConfig;
        const currentBd =
          st.breakdowns?.[selectedSubject] ||
          generateDefaultBreakdown(
            st.marks[selectedSubject],
            selectedSubject,
            st.section
          );
        const nextBd = { ...currentBd };

        cells.forEach((cellVal, cOffset) => {
          const targetColIdx = targetStartColIdx + cOffset;
          if (targetColIdx >= activeGridColumnKeys.length) return;
          const colField = activeGridColumnKeys[targetColIdx];
          const fieldDef = internalFields.find((f) => f.key === colField);
          const maxMark = fieldDef?.max ?? 20;

          const trimmed = cellVal.trim();
          let newVal: number | 'AB' | null = null;
          if (trimmed.toUpperCase() === 'AB' || trimmed.toUpperCase() === 'A') {
            newVal = 'AB';
          } else if (trimmed === '') {
            newVal = null;
          } else {
            const parsed = parseFloat(trimmed);
            if (!isNaN(parsed)) {
              newVal = Math.min(maxMark, Math.max(0, parsed));
            }
          }
          if (newVal !== null) {
            nextBd[colField] = newVal;
          } else {
            delete nextBd[colField];
          }
        });

        const newTotal = computeSubjectTotalFromBreakdown(
          selectedSubject,
          st.section,
          nextBd,
          effectiveSub?.components
        );

        updated[studentIndex] = {
          ...st,
          marks: {
            ...st.marks,
            [selectedSubject]: newTotal,
          },
          breakdowns: {
            ...(st.breakdowns || {}),
            [selectedSubject]: nextBd,
          },
        };
      } else {
        const nextMarks = { ...st.marks };
        const nextBreakdowns = { ...(st.breakdowns || {}) };

        cells.forEach((cellVal, cOffset) => {
          const targetColIdx = targetStartColIdx + cOffset;
          if (targetColIdx >= activeGridColumnKeys.length) return;

          const subName = activeGridColumnKeys[targetColIdx];
          const subConfig = activeSubjects.find((s) => s.name === subName);
          const maxMark = subConfig?.maxMarks ?? 100;
          const trimmed = cellVal.trim();
          let newMark: number | 'AB' | null = null;
          if (trimmed.toUpperCase() === 'AB' || trimmed.toUpperCase() === 'A') {
            newMark = 'AB';
          } else if (trimmed === '') {
            newMark = null;
          } else {
            const parsed = parseFloat(trimmed);
            if (!isNaN(parsed)) {
              newMark = Math.min(maxMark, Math.max(0, parsed));
            }
          }

          nextMarks[subName] = newMark;
          const effectiveSub =
            getEffectiveExamConfigForClass(baseExamConfig, st.section).subjects.find(
              (sub) => sub.name === subName
            ) || subConfig;
          const nextBd = syncBreakdownWithTotal(
            newMark,
            subName,
            st.section,
            effectiveSub?.components,
            nextBreakdowns[subName]
          );
          if (nextBd) {
            nextBreakdowns[subName] = nextBd;
          } else {
            delete nextBreakdowns[subName];
          }
        });

        updated[studentIndex] = {
          ...st,
          marks: nextMarks,
          breakdowns: nextBreakdowns,
        };
      }
    });

    setStudents(updated);
    syncStoresForExam(selectedExam, updated);
    triggerAutoSync(updated);

    showToast(`Pasted ${rows.length} row${rows.length > 1 ? 's' : ''} of marks successfully`);
  };

  // Add new student
  const handleAddStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !newStudentRoll.trim()) {
      showToast('Please enter both student name and roll number');
      return;
    }

    pushUndoSnapshot(students);
    const targetSection = newStudentSection || (selectedClass !== 'all' ? selectedClass : 'Sparkle');
    const newId = `sva-${targetSection.toLowerCase()}-${Date.now().toString(36)}`;

    const defaultMarks: Record<string, number | 'AB' | null> = {};
    const defaultBreakdowns: Record<string, SubjectBreakdown> = {};
    const effectiveCfg = getEffectiveExamConfigForClass(baseExamConfig, targetSection);
    effectiveCfg.subjects.forEach((sub) => {
      const defMark = Math.round((sub.maxMarks || 100) * 0.8);
      defaultMarks[sub.name] = defMark;
      const bd = syncBreakdownWithTotal(defMark, sub.name, targetSection, sub.components);
      if (bd) {
        defaultBreakdowns[sub.name] = bd;
      }
    });

    const newStudent: StudentReportRow = {
      id: newId,
      rollNo: newStudentRoll.trim().padStart(2, '0'),
      name: newStudentName.trim(),
      admissionNo: `SVA-2026-${targetSection.substring(0, 3).toUpperCase()}-${newStudentRoll.trim().padStart(2, '0')}`,
      class: getClassNumberForSection(targetSection),
      section: targetSection,
      dob: newStudentDob || '2010-01-01',
      fatherName: newStudentFather.trim() || 'Parent',
      motherName: newStudentMother.trim() || 'Parent',
      marks: defaultMarks,
      breakdowns: defaultBreakdowns,
      subjectRemarks: {},
      customRemarks: 'Diligent student with regular academic participation.',
    };

    const updated = [...students, newStudent];
    setStudents(updated);
    syncStoresForExam(selectedExam, updated);
    triggerAutoSync(updated);
    setIsAddStudentModalOpen(false);
    setNewStudentName('');
    setNewStudentRoll('');
    setNewStudentFather('');
    setNewStudentMother('');
    showToast(`Added ${newStudent.name} (Roll ${newStudent.rollNo}) to ${targetSection}`);
  };

  // Delete student (supports instant Ctrl+Z undo without iframe-blocked confirm dialog)
  const handleDeleteStudent = (studentId: string, studentName: string) => {
    pushUndoSnapshot(students);
    const updated = students.filter((s) => s.id !== studentId);
    setStudents(updated);
    syncStoresForExam(selectedExam, updated);
    triggerAutoSync(updated);
    showToast(`Removed ${studentName} (Press Ctrl+Z to undo)`);
  };

  // Update remarks for a student
  const handleUpdateRemarks = (studentId: string, remarks: string) => {
    pushUndoSnapshot(students);
    const updated = students.map((s) =>
      s.id === studentId ? updateStudentClassRemark(s, remarks) : s
    );
    setStudents(updated);
    triggerAutoSync(updated);
  };

  // Auto-Generate Smart Remarks for All Students based on actual performance
  const handleAutoGenerateRemarksForAll = () => {
    pushUndoSnapshot(students);
    const updated = students.map((s) => {
      const res = computedResults.find((r) => r.student.id === s.id);
      if (!res) return s;

      let generatedRemark = '';
      if (res.percentage >= 90) {
        generatedRemark = `Outstanding academic leadership with exceptional scores in Mathematics and Science. Keep excelling!`;
      } else if (res.percentage >= 80) {
        generatedRemark = `Consistent high achiever with commendable conceptual understanding and regular attendance.`;
      } else if (res.percentage >= 70) {
        generatedRemark = `Good scholastic progress across all disciplines. Consistent practice will elevate to top grades.`;
      } else if (res.percentage >= 50) {
        generatedRemark = `Capable student. Regular revision in written exams and active classroom focus will yield better scores.`;
      } else if (res.status === 'FAIL' || res.status === 'ABSENT') {
        generatedRemark = `Requires dedicated remedial revision and parent-teacher collaboration for upcoming evaluations.`;
      } else {
        generatedRemark = `Regular academic effort demonstrated. Continued perseverance recommended.`;
      }

      return { ...s, customRemarks: generatedRemark };
    });
    setStudents(updated);
    triggerAutoSync(updated);
    showToast('Auto-generated tailored academic remarks for all students');
  };

  // Export to Excel file (in exact format of reference sheet)
  const handleExportExcel = async () => {
    if (selectedSubject === 'consolidated') {
      const fileName = await downloadConsolidatedFormatExcel({
        students,
        examConfig: baseExamConfig,
        examId: selectedExam,
        classScope: selectedClass || 'Diamond',
      });
      showToast(`Downloaded Consolidated Marksheet (${fileName})`);
      return;
    }
    const fileName = await downloadReferenceFormatExcel({
      students,
      examConfig: baseExamConfig,
      examId: selectedExam,
      classScope: selectedClass || 'Diamond',
      subjectScope: selectedSubject === 'all' ? 'all_consolidated' : selectedSubject,
    });
    showToast(`Downloaded Excel Marksheet (${fileName})`);
  };

  // Download Sample Template
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Roll No': '01',
        'Student Name': 'Sample Student',
        Class: 'Class 6',
        Section: 'Sparkle',
        DOB: '2010-01-15',
        'Father Name': 'Mr. Sample',
        'Mother Name': 'Mrs. Sample',
        English: 85,
        Hindi: 88,
        Marathi: 90,
        Maths: 92,
        Science: 89,
        'Social Science': 86,
        'Computer Science': 95,
      },
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Marks_Template');
    XLSX.writeFile(wb, 'SVA_Marks_Entry_Template.xlsx');
    showToast('Downloaded sample Excel template');
  };

  // Helper to download subject-wise upload template
  const handleDownloadSubjectTemplate = (subjectName: string) => {
    const targetStudents =
      selectedClass === 'all'
        ? students.slice(0, 35)
        : students.filter((s) => s.section === selectedClass);

    const cols = ['Roll No', 'Student Name', 'Class', 'Section', 'Marks Obtained'];
    const rows = targetStudents.map((s) => [
      s.rollNo,
      s.name,
      getClassNumberForSection(s.section),
      s.section,
      s.marks[subjectName] ?? 75,
    ]);

    const displayTitle = selectedClass === 'all' ? 'All Classes (Grade 6 to 9)' : `${getClassNumberForSection(selectedClass)} - ${selectedClass}`;

    const wb = XLSX.utils.book_new();
    const ws = buildAptosFormattedSheet(
      selectedExam,
      `${subjectName} Marks Upload Template`,
      displayTitle,
      cols,
      rows
    );
    XLSX.utils.book_append_sheet(wb, ws, `${subjectName}_Marks`);
    XLSX.writeFile(wb, `SVA_Upload_Template_${selectedExam}_${subjectName.replace(/\s+/g, '_')}.xlsx`);
    showToast(`Downloaded ${subjectName} Upload Template (.xlsx)`);
  };

  // Excel / CSV file upload handler (Supports Consolidated & Subject-Wise modes + Aptos template header detection)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // Detect header row (handles both plain sheets and Aptos-formatted templates with 5 title rows)
        const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(12, aoa.length); i++) {
          const rowCells = (aoa[i] || []).map((c) => String(c).trim().toLowerCase());
          if (
            rowCells.includes('roll no') ||
            rowCells.includes('roll_number') ||
            rowCells.includes('student name') ||
            rowCells.includes('full_name')
          ) {
            headerRowIdx = i;
            break;
          }
        }

        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          defval: '',
          range: headerRowIdx,
        }) as any[];

        if (!jsonData || jsonData.length === 0) {
          setUploadError('The uploaded file contains no readable student rows.');
          return;
        }

        pushUndoSnapshot(students);

        if (uploadMode === 'subject') {
          // ==========================================
          // SUBJECT-WISE MARKS UPLOAD MODE
          // ==========================================
          let updatedCount = 0;
          const updated = [...students];
          const subConfig = activeSubjects.find((s) => s.name === uploadTargetSubject);

          jsonData.forEach((row) => {
            const studentId = String(
              row['student_id'] || row['Student ID'] || row['Admission No'] || row['AdmNo'] || ''
            ).trim();
            const rawRoll = String(
              row['roll_number'] || row['Roll No'] || row['Roll'] || row['RollNo'] || ''
            ).trim();
            const rollNo = rawRoll ? rawRoll.padStart(2, '0') : '';
            const rowSection = String(row['section'] || row['Section'] || '').trim();
            const name = String(
              row['full_name'] || row['Student Name'] || row['Name'] || row['StudentName'] || ''
            )
              .trim()
              .toLowerCase();

            if (!studentId && !rollNo && !name) return;

            const rawVal =
              row['Marks Obtained'] ??
              row['Marks'] ??
              row['Mark'] ??
              row[uploadTargetSubject] ??
              row[uploadTargetSubject.toLowerCase()] ??
              row['Obtained'] ??
              row['Score'];

            let parsedMark: number | 'AB' | null = null;
            if (
              String(rawVal).trim().toUpperCase() === 'AB' ||
              String(rawVal).trim().toUpperCase() === 'ABSENT'
            ) {
              parsedMark = 'AB';
            } else if (
              rawVal !== '' &&
              rawVal !== null &&
              rawVal !== undefined &&
              !isNaN(Number(rawVal))
            ) {
              const maxVal = subConfig?.maxMarks ?? 100;
              parsedMark = Math.min(maxVal, Math.max(0, Number(rawVal)));
            }

            // Match student in existing roster by Admission No, Roll No (+ Section), or Name
            const matchIdx = updated.findIndex(
              (st) =>
                (studentId && st.admissionNo.toLowerCase() === studentId.toLowerCase()) ||
                (name && st.name.toLowerCase() === name) ||
                (rollNo &&
                  st.rollNo.padStart(2, '0') === rollNo &&
                  (rowSection
                    ? st.section.toLowerCase() === rowSection.toLowerCase()
                    : selectedClass === 'all' || st.section === selectedClass))
            );

            if (matchIdx !== -1) {
              updatedCount++;
              const st = updated[matchIdx];
              const effectiveSub =
                getEffectiveExamConfigForClass(baseExamConfig, st.section).subjects.find(
                  (sub) => sub.name === uploadTargetSubject
                ) || subConfig;
              const nextBd = syncBreakdownWithTotal(
                parsedMark,
                uploadTargetSubject,
                st.section,
                effectiveSub?.components,
                st.breakdowns?.[uploadTargetSubject]
              );
              const nextBreakdowns = { ...(st.breakdowns || {}) };
              if (nextBd) {
                nextBreakdowns[uploadTargetSubject] = nextBd;
              } else {
                delete nextBreakdowns[uploadTargetSubject];
              }
              updated[matchIdx] = {
                ...st,
                marks: {
                  ...st.marks,
                  [uploadTargetSubject]: parsedMark,
                },
                breakdowns: nextBreakdowns,
              };
            }
          });

          setStudents(updated);
          syncStoresForExam(selectedExam, updated);
          triggerAutoSync(updated);

          setIsUploadModalOpen(false);
          showToast(
            `Successfully updated ${uploadTargetSubject} marks for ${updatedCount} students`
          );
          return;
        }

        // ==========================================
        // CONSOLIDATED MULTI-SUBJECT MARKS UPLOAD MODE
        // ==========================================
        const incomingStudents: StudentReportRow[] = [];
        jsonData.forEach((row, idx) => {
          const rawRoll = String(
            row['roll_number'] || row['Roll No'] || row['Roll'] || row['RollNo'] || ''
          ).trim();
          const rawName = String(
            row['full_name'] || row['Student Name'] || row['Name'] || row['StudentName'] || ''
          ).trim();
          if (!rawRoll && !rawName) return;

          const rollNo = (rawRoll || String(idx + 1)).padStart(2, '0');
          const name = rawName || `Student ${rollNo}`;
          const section = String(
            row['section'] ||
              row['Section'] ||
              (selectedClass !== 'all' ? selectedClass : 'Sparkle')
          ).trim();
          const studentId = String(
            row['student_id'] ||
              row['Student ID'] ||
              row['Admission No'] ||
              row['AdmNo'] ||
              `sva-${section.toLowerCase()}-${rollNo}`
          ).trim();

          const effectiveCfg = getEffectiveExamConfigForClass(baseExamConfig, section);
          const marks: Record<string, number | 'AB' | null> = {};
          const breakdowns: Record<string, SubjectBreakdown> = {};

          effectiveCfg.subjects.forEach((sub) => {
            const rawVal =
              row[sub.name] ??
              row[sub.name.toLowerCase()] ??
              (sub.name === 'Maths' ? row['Mathematics'] ?? row['mathematics'] : undefined) ??
              row[sub.name.substring(0, 3)] ??
              row[sub.name.substring(0, 3).toLowerCase()];

            const trimmedVal = String(rawVal ?? '').trim();
            if (trimmedVal.toUpperCase() === 'AB' || trimmedVal.toUpperCase() === 'ABSENT') {
              marks[sub.name] = 'AB';
            } else if (trimmedVal !== '' && trimmedVal !== '-' && !isNaN(Number(trimmedVal))) {
              marks[sub.name] = Math.min(sub.maxMarks || 100, Math.max(0, Number(trimmedVal)));
            } else {
              marks[sub.name] = null;
            }

            const bd = syncBreakdownWithTotal(marks[sub.name], sub.name, section, sub.components);
            if (bd) {
              breakdowns[sub.name] = bd;
            }
          });

          incomingStudents.push({
            id: studentId,
            rollNo,
            name,
            admissionNo: studentId,
            class: getClassNumberForSection(section),
            section,
            dob: String(row['DOB'] || row['dob'] || '2010-01-01'),
            fatherName: String(row['Father Name'] || row["Father's Name"] || 'Parent'),
            motherName: String(row['Mother Name'] || row["Mother's Name"] || 'Parent'),
            marks,
            breakdowns,
            customRemarks: String(
              row['Remarks'] ||
                row['Class Teacher Remark'] ||
                'Imported from official student record.'
            ),
          });
        });

        const mergedRoster = mergePulledStudentsWithRoster(
          students,
          incomingStudents,
          baseExamConfig
        );

        setStudents(mergedRoster);
        syncStoresForExam(selectedExam, mergedRoster);
        triggerAutoSync(mergedRoster);
        setIsUploadModalOpen(false);
        showToast(`Successfully imported ${incomingStudents.length} students across sections`);
      } catch (err: any) {
        setUploadError(`Failed to parse file: ${err.message || 'Invalid format'}`);
      }
    };

    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // PDF Single Download
  const handleDownloadPDF = async () => {
    if (!activeStudentResult) return;
    setIsExporting(true);
    try {
      downloadSinglePDF(
        { ...SVA_EXAM_INFO, examName: currentExamConfig.name, examCode: selectedExam },
        activeStudentResult
      );
      showToast(`Downloaded PDF for ${activeStudentResult.student.name}`);
    } catch {
      showToast('Failed to generate PDF. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // PDF Batch ZIP Download for current scope
  const handleDownloadClassZip = async (isAll8Classes: boolean = false) => {
    setIsExporting(true);
    try {
      const targetResults =
        isAll8Classes || selectedClass === 'all'
          ? computedResults
          : computedResults.filter((r) => r.student.section === selectedClass);

      const zipName = isAll8Classes
        ? `SVA_ReportCards_All_8_Classes_${selectedExam}_${targetResults.length}_Students`
        : `SVA_ReportCards_${selectedClass}_${selectedExam}_${targetResults.length}_Students`;

      await downloadAllPDFsAsZip(
        { ...SVA_EXAM_INFO, examName: currentExamConfig.name, examCode: selectedExam },
        targetResults,
        zipName
      );
      showToast(`Generated ZIP with ${targetResults.length} report cards`);
    } catch {
      showToast('Failed to create ZIP package. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  // Google Apps Script Cloud Sync
  const handleGoogleSheetsSync = async () => {
    setSheetsSyncStatus('syncing');
    try {
      const res = await GasSyncService.pushData(students, selectedExam);
      if (res.success) {
        setSheetsSyncStatus('synced');
        setLastSyncTime(new Date().toLocaleTimeString());
        showToast(`Successfully synced ${res.updatedRows || students.length} students via Google Apps Script!`);
      } else {
        setSheetsSyncStatus('error');
        showToast(`Sync error: ${res.error || 'Check Google Apps Script Web App URL'}`);
      }
    } catch (err: any) {
      console.error('GAS Sync Error:', err);
      setSheetsSyncStatus('error');
      showToast(`Sync error: ${err.message || 'Check connection'}`);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col">
      {/* Toast Notification */}
      {quickToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white text-xs font-medium px-4 py-2.5 rounded-lg shadow-xl flex items-center gap-2 border border-slate-800 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{quickToast}</span>
        </div>
      )}

      {/* TOP BAR: Clean, Minimal Brand & Segmented Navigation */}
      <header className="bg-white/95 backdrop-blur-xs border-b border-slate-200/80 sticky top-0 z-50 px-5 sm:px-8 py-2.5">
        <div className="max-w-[1400px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 sm:gap-6">
          {/* Brand Wordmark with Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <Image
              src={SCHOOL_LOGO_SRC}
              alt="Saraswati Vidya Academy Crest"
              width={32}
              height={32}
              className="w-7 h-7 sm:w-8 sm:h-8 object-contain shrink-0"
              priority
            />
            <span className="text-sm sm:text-base font-semibold text-slate-900 tracking-tight whitespace-nowrap">
              Saraswati Vidya Academy
            </span>
          </div>

          {/* Navigation Links (Minimal Segmented Tabs) */}
          <div className="overflow-x-auto no-scrollbar -mx-1 px-1 py-0.5">
            <nav className="flex items-center gap-0.5 bg-slate-100/80 p-0.5 rounded-lg border border-slate-200/60 text-xs font-medium w-max">
              <button
                onClick={() => setActiveTab('spreadsheet')}
                className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'spreadsheet'
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-slate-500" />
                <span>Marks Entry</span>
              </button>
              <button
                onClick={() => setActiveTab('remarks')}
                className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'remarks'
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <MessageSquareText className="w-3.5 h-3.5 text-slate-500" />
                <span>Remarks Entry</span>
              </button>
              <button
                onClick={() => setActiveTab('reportcards')}
                className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'reportcards'
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                <span>Report Cards</span>
              </button>

              <button
                onClick={() => setActiveTab('export')}
                className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'export'
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export Marks</span>
              </button>

              <button
                onClick={() => setActiveTab('admin')}
                className={`px-3 py-1.5 rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'admin'
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Settings className="w-3.5 h-3.5 text-slate-500" />
                <span>Settings</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* MAIN VIEWPORT */}
      <main className="max-w-[1440px] mx-auto w-full px-5 sm:px-8 py-4 sm:py-5 flex-1 flex flex-col">
        {/* ========================================================
            VIEW 1: MARKS SPREADSHEET (Apple Numbers / Linear Style)
           ======================================================== */}
        {activeTab === 'spreadsheet' && (
          <div className="flex-1 flex flex-col gap-4">
            {/* Page Header Strip */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Student Marks
                </h1>
                <p className="text-xs text-slate-500 mt-0.5 font-normal">
                  Pick a class, exam, and subject to enter or update marks. Press Enter to move down to the next student, or type &quot;AB&quot; if a student was absent.
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center flex-wrap gap-2">
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200/80 rounded-lg hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  <span>Import Marks</span>
                </button>
                <button
                  onClick={() => setIsAddStudentModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Student</span>
                </button>
              </div>
            </div>

            {/* Class, Exam & Subject Unified Control Bar */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* 1. Class Dropdown */}
                <CustomSelect
                  id="class-select"
                  icon={<Layers className="w-3.5 h-3.5 text-slate-400" />}
                  prefixLabel="Class:"
                  value={selectedClass}
                  onChange={(val) => {
                    setSelectedClass(val);
                    setExportClass(val);
                    setCurrentPage(1);
                    if (isPtExam(selectedExam) && !hasCsInPtExam(val)) {
                      if (
                        selectedSubject.toLowerCase() === 'computer science' ||
                        selectedSubject.toLowerCase() === 'cs'
                      ) {
                        setSelectedSubject('all');
                      }
                    }
                  }}
                  options={[
                    { value: 'all', label: `All Classes (${students.length})` },
                    ...SVA_ALL_CLASSES.map((cls) => ({
                      value: cls,
                      label: `${getClassGradeLabel(cls)} (${classCounts[cls] || 0})`,
                    })),
                  ]}
                />

                {/* 2. Exam Dropdown */}
                <CustomSelect
                  id="exam-select"
                  icon={<BookOpen className="w-3.5 h-3.5 text-slate-400" />}
                  prefixLabel="Exam:"
                  value={selectedExam}
                  onChange={(val) => handleExamChange(val)}
                  options={Object.values(examConfigs).map((ex) => ({
                    value: ex.id,
                    label: ex.code || ex.id,
                  }))}
                />

                {/* 3. Subject Dropdown */}
                <CustomSelect
                  id="subject-filter-select"
                  icon={<Award className="w-3.5 h-3.5 text-slate-400" />}
                  prefixLabel="Subject:"
                  value={selectedSubject}
                  onChange={(val) => {
                    setSelectedSubject(val);
                    setSelectedRange(null);
                    setIsSelecting(false);
                    if (val !== 'all' && val !== 'consolidated') {
                      setInternalActiveSubject(val);
                    }
                  }}
                  options={[
                    { value: 'all', label: `All Subjects (${activeSubjects.length})` },
                    { value: 'consolidated', label: 'Consolidated Sheet' },
                    ...activeSubjects.map((sub) => ({
                      value: sub.name,
                      label: sub.name,
                    })),
                  ]}
                />
              </div>

              {/* 4. Search Input */}
              <div className="relative w-full sm:w-64 lg:ml-auto">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name or roll no..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50/60 border border-slate-200/80 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Main Spreadsheet Card */}
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-2xs flex flex-col overflow-hidden relative isolate z-10">

              {/* The Spreadsheet Grid */}
              <div
                ref={marksScrollContainerRef}
                className="overflow-x-auto excel-grid-container relative w-full"
              >
                {selectedSubject !== 'all' && selectedSubject !== 'consolidated' && internalFields.length > 1 ? (
                  /* =====================================================================
                     SUBJECT INTERNAL + PAPER MARKS ENTRY TABLE (When a Subject is selected)
                     - Dynamically reflects any Internal + Main Exam components configured by Admin
                     ===================================================================== */
                  <table className="w-full text-center text-xs border-separate border-spacing-0">
                    <thead
                      onMouseDown={(e) => handleHeaderDragStart(e, marksScrollContainerRef.current)}
                      title="Click and drag header to scroll horizontally"
                      className={isHeaderDragging ? 'cursor-grabbing select-none' : 'cursor-grab select-none'}
                    >
                      <tr className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[11px] select-none h-11">
                        {/* Frozen Roll Header */}
                        <th
                          onClick={() => toggleSort('rollNo')}
                          className="sticky left-0 z-30 bg-slate-50 py-2.5 px-1 w-12 min-w-[48px] max-w-[48px] text-center hover:bg-slate-100 transition-colors border-b border-r border-slate-200"
                        >
                          <div className="text-center font-bold">Roll</div>
                        </th>

                        {/* Frozen Student Name Header */}
                        <th
                          onClick={() => toggleSort('name')}
                          className="sticky left-[48px] z-30 bg-slate-50 py-2.5 px-3 w-[190px] min-w-[190px] max-w-[210px] text-center hover:bg-slate-100 transition-colors border-b border-r border-slate-200"
                        >
                          <div className="text-center font-bold">Student Name</div>
                        </th>

                        {/* Dynamic Internal & Paper Columns */}
                        {internalFields.map((field) => (
                          <th
                            key={field.key}
                            className={`py-2 px-2 text-center ${field.colWidth} bg-slate-50 border-b border-l border-slate-200 text-slate-700`}
                          >
                            <div className="font-bold text-slate-800">{field.label}</div>
                            <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                              {field.subLabel}
                            </div>
                          </th>
                        ))}

                        {/* TOTAL (Locked) */}
                        <th
                          onClick={() => toggleSort(selectedSubject)}
                          className="py-2 px-2 text-center w-[90px] min-w-[90px] bg-slate-50 border-b border-l border-slate-200 hover:bg-slate-100 transition-colors"
                          title={`Total (${activeSubConfig?.maxMarks ?? 100} Marks) • Locked and auto-calculated from breakdown components`}
                        >
                          <div className="text-center font-bold text-slate-800">Total</div>
                          <div className="text-[10px] font-normal text-slate-400 text-center mt-0.5">
                            {activeSubConfig?.maxMarks ?? 100}
                          </div>
                        </th>

                        {/* GRADE */}
                        <th className="py-2 px-2 text-center w-[75px] min-w-[75px] bg-slate-50 border-b border-l border-slate-200">
                          <div className="text-center font-bold text-slate-800">Grade</div>
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {paginatedStudents.length === 0 ? (
                        <tr>
                          <td
                            colSpan={internalFields.length + 4}
                            className="py-12 text-center text-slate-400 text-sm border-b border-slate-100"
                          >
                            No students matching your search criteria.
                          </td>
                        </tr>
                      ) : (
                        paginatedStudents.map((student, rowIdx) => {
                          const isSelectedForReport = student.id === selectedStudentId;
                          const isRowActive = focusedCell?.rowIdx === rowIdx || isSelectedForReport;
                          const bd =
                            student.breakdowns?.[selectedSubject] ||
                            generateDefaultBreakdown(
                              student.marks[selectedSubject],
                              selectedSubject,
                              student.section
                            );
                          const liveTotalFromBd = computeSubjectTotalFromBreakdown(
                            selectedSubject,
                            student.section,
                            bd,
                            activeSubConfig?.components
                          );
                          const totalMark =
                            liveTotalFromBd !== null
                              ? liveTotalFromBd
                              : student.marks[selectedSubject];
                          const numTotal = typeof totalMark === 'number' ? totalMark : 0;
                          const subMaxMarks = activeSubConfig?.maxMarks ?? 100;
                          const subPassMarks = activeSubConfig?.passMarks ?? 33;
                          const subPct = subMaxMarks > 0 ? (numTotal / subMaxMarks) * 100 : 0;
                          const subGrade =
                            totalMark === 'AB'
                              ? 'E'
                              : totalMark !== null && totalMark !== undefined
                              ? computeGrade(subPct)
                              : '-';
                          const isFailed =
                            totalMark !== null &&
                            totalMark !== undefined &&
                            (totalMark === 'AB' || numTotal < subPassMarks);

                          return (
                            <tr
                              key={student.id}
                              onClick={() => setSelectedStudentId(student.id)}
                              onContextMenu={(e) => handleRowContextMenu(e, student)}
                              className={`group/row transition-colors cursor-pointer h-10 min-h-10 max-h-10 ${
                                isRowActive
                                  ? 'bg-blue-50/70 text-slate-900'
                                  : 'hover:bg-slate-100/70 text-slate-800'
                              }`}
                            >
                              {/* Frozen Roll Number */}
                              <td
                                className={`sticky left-0 z-10 h-10 p-0 text-center font-mono text-xs text-slate-700 w-12 min-w-[48px] max-w-[48px] border-b border-r border-slate-200 transition-colors select-none cursor-default ${
                                  isRowActive
                                    ? 'bg-blue-100 font-bold text-blue-950'
                                    : 'bg-white group-hover/row:bg-slate-100'
                                }`}
                              >
                                {student.rollNo}
                              </td>

                              {/* Frozen Student Name */}
                              <td
                                className={`sticky left-[48px] z-10 h-10 px-3 w-[190px] min-w-[190px] max-w-[210px] border-b border-r border-slate-200 transition-colors ${
                                  isRowActive
                                    ? 'bg-blue-100 font-semibold text-blue-950'
                                    : 'bg-white group-hover/row:bg-slate-100'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1.5 w-full group/name">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedStudentId(student.id);
                                      setActiveTab('reportcards');
                                    }}
                                    title="View official report card"
                                    className="font-medium text-slate-900 hover:text-blue-600 transition-colors text-left flex items-center gap-1 truncate flex-1"
                                  >
                                    <span className="truncate">{student.name}</span>
                                    <ChevronRight className="w-3 h-3 text-slate-400 opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
                                  </button>
                                </div>
                              </td>

                              {/* Editable Internal & Paper Marks Cells */}
                              {internalFields.map((field, fieldIdx) => {
                                let rawVal = bd[field.key];
                                if (field.key === 'internalMarks' && rawVal === undefined) {
                                  const pp = typeof bd.penPaper === 'number' ? bd.penPaper : 0;
                                  const ma =
                                    typeof bd.multipleAssessment === 'number'
                                      ? bd.multipleAssessment
                                      : 0;
                                  const se =
                                    typeof bd.subjectEnrichment === 'number'
                                      ? bd.subjectEnrichment
                                      : 0;
                                  const pf = typeof bd.portfolio === 'number' ? bd.portfolio : 0;
                                  if (
                                    bd.penPaper !== undefined ||
                                    bd.multipleAssessment !== undefined ||
                                    bd.subjectEnrichment !== undefined ||
                                    bd.portfolio !== undefined
                                  ) {
                                    rawVal = pp + ma + se + pf;
                                  }
                                }
                                const displayVal =
                                  rawVal === null || rawVal === undefined ? '' : String(rawVal);
                                const cellKey = `${rowIdx}-${field.key}`;
                                const isCellFocused =
                                  focusedCell?.rowIdx === rowIdx &&
                                  focusedCell?.colKey === field.key;

                                const isInRange =
                                  normalizedRange !== null &&
                                  rowIdx >= normalizedRange.minRow &&
                                  rowIdx <= normalizedRange.maxRow &&
                                  fieldIdx >= normalizedRange.minCol &&
                                  fieldIdx <= normalizedRange.maxCol;

                                const isRangeTop = isInRange && rowIdx === normalizedRange.minRow;
                                const isRangeBottom = isInRange && rowIdx === normalizedRange.maxRow;
                                const isRangeLeft = isInRange && fieldIdx === normalizedRange.minCol;
                                const isRangeRight = isInRange && fieldIdx === normalizedRange.maxCol;

                                const rangeShadows: string[] = [];
                                if (isInRange && normalizedRange && normalizedRange.cellCount > 1) {
                                  if (isRangeTop) rangeShadows.push('inset 0 2px 0 0 #1d4ed8');
                                  if (isRangeBottom) rangeShadows.push('inset 0 -2px 0 0 #1d4ed8');
                                  if (isRangeLeft) rangeShadows.push('inset 2px 0 0 0 #1d4ed8');
                                  if (isRangeRight) rangeShadows.push('inset -2px 0 0 0 #1d4ed8');
                                }
                                const compoundBoxShadow = rangeShadows.length > 0 ? rangeShadows.join(', ') : undefined;

                                const isInsideActiveRange =
                                  normalizedRange !== null &&
                                  normalizedRange.cellCount > 1 &&
                                  rowIdx >= normalizedRange.minRow &&
                                  rowIdx <= normalizedRange.maxRow &&
                                  fieldIdx >= normalizedRange.minCol &&
                                  fieldIdx <= normalizedRange.maxCol;

                                return (
                                  <td
                                    key={field.key}
                                    onClick={() => {
                                      const targetInput = cellInputRefs.current[cellKey];
                                      if (targetInput) {
                                        targetInput.focus();
                                      }
                                    }}
                                    onDoubleClick={() => {
                                      replaceOnNextKeyRef.current = false;
                                      setIsCellEditing(true);
                                    }}
                                    onMouseDown={(e) => {
                                      if (e.button !== 0) return;
                                      replaceOnNextKeyRef.current = true;
                                      setIsCellEditing(false);
                                      if (e.shiftKey) {
                                        isShiftSelectingRef.current = true;
                                        setSelectedRange((prev) => {
                                          const start = prev ? prev.start : { rowIdx, colIdx: fieldIdx };
                                          return { start, end: { rowIdx, colIdx: fieldIdx } };
                                        });
                                      } else {
                                        if (!isInsideActiveRange) {
                                          isSelectingRef.current = true;
                                          setIsSelecting(true);
                                          setSelectedRange({
                                            start: { rowIdx, colIdx: fieldIdx },
                                            end: { rowIdx, colIdx: fieldIdx },
                                          });
                                        }
                                        setFocusedCell({ rowIdx, colKey: field.key });
                                        setSelectedStudentId(student.id);
                                      }
                                      const targetInput = cellInputRefs.current[cellKey];
                                      if (targetInput) {
                                        targetInput.focus();
                                      }
                                    }}
                                    onMouseEnter={() => {
                                      if (isSelectingRef.current || isSelecting) {
                                        setSelectedRange((prev) =>
                                          prev
                                            ? { start: prev.start, end: { rowIdx, colIdx: fieldIdx } }
                                            : { start: { rowIdx, colIdx: fieldIdx }, end: { rowIdx, colIdx: fieldIdx } }
                                        );
                                      }
                                    }}
                                    style={{ boxShadow: compoundBoxShadow }}
                                    className={`${field.colWidth} h-10 p-0 border-b border-l border-slate-200 relative transition-colors box-border ${
                                      isInRange && normalizedRange && normalizedRange.cellCount > 1
                                        ? 'bg-blue-500/15'
                                        : isCellFocused
                                        ? 'bg-white shadow-xs'
                                        : isRowActive
                                        ? 'bg-blue-50/80'
                                        : 'bg-transparent group-hover/row:bg-slate-100/70'
                                    } ${
                                      isCellFocused && (!normalizedRange || normalizedRange.cellCount <= 1)
                                        ? 'ring-2 ring-inset ring-blue-600 z-10'
                                        : ''
                                    } cursor-cell`}
                                  >
                                    <input
                                      ref={(el) => {
                                        cellInputRefs.current[cellKey] = el;
                                      }}
                                      data-excel-cell="true"
                                      type="text"
                                      value={displayVal}
                                      placeholder={`/${field.max}`}
                                      onFocus={() => {
                                        replaceOnNextKeyRef.current = true;
                                        setIsCellEditing(false);
                                        setFocusedCell({ rowIdx, colKey: field.key });
                                        setSelectedStudentId(student.id);
                                        if (!isSelectingRef.current && !isSelecting && !isShiftSelectingRef.current && !isInsideActiveRange) {
                                          setSelectedRange({
                                            start: { rowIdx, colIdx: fieldIdx },
                                            end: { rowIdx, colIdx: fieldIdx },
                                          });
                                        }
                                        isShiftSelectingRef.current = false;
                                      }}
                                      onMouseDown={(e) => {
                                        if (e.button !== 0) return;
                                        replaceOnNextKeyRef.current = true;
                                        setIsCellEditing(false);
                                        if (e.shiftKey) {
                                          isShiftSelectingRef.current = true;
                                          setSelectedRange((prev) => {
                                            const start = prev ? prev.start : { rowIdx, colIdx: fieldIdx };
                                            return { start, end: { rowIdx, colIdx: fieldIdx } };
                                          });
                                        } else if (!isInsideActiveRange) {
                                          isSelectingRef.current = true;
                                          setIsSelecting(true);
                                          setSelectedRange({
                                            start: { rowIdx, colIdx: fieldIdx },
                                            end: { rowIdx, colIdx: fieldIdx },
                                          });
                                          setFocusedCell({ rowIdx, colKey: field.key });
                                          setSelectedStudentId(student.id);
                                        }
                                      }}
                                      onMouseEnter={() => {
                                        if (isSelectingRef.current || isSelecting) {
                                          setSelectedRange((prev) =>
                                            prev
                                              ? { start: prev.start, end: { rowIdx, colIdx: fieldIdx } }
                                              : { start: { rowIdx, colIdx: fieldIdx }, end: { rowIdx, colIdx: fieldIdx } }
                                          );
                                        }
                                      }}
                                      onDoubleClick={() => {
                                        replaceOnNextKeyRef.current = false;
                                        setIsCellEditing(true);
                                      }}
                                      onMouseUp={() => {
                                        isSelectingRef.current = false;
                                        setIsSelecting(false);
                                      }}
                                      onDragStart={(e) => e.preventDefault()}
                                      onChange={(e) =>
                                        handleInternalCellChange(
                                          student.id,
                                          selectedSubject,
                                          field.key,
                                          e.target.value
                                        )
                                      }
                                      onKeyDown={(e) =>
                                        handleInternalKeyDown(
                                          e,
                                          rowIdx,
                                          field.key,
                                          internalFieldKeys,
                                          student.id
                                        )
                                      }
                                      onPaste={(e) => {
                                        handlePaste(e, rowIdx, field.key);
                                      }}
                                      className={`w-full h-10 px-1 text-center font-mono tabular-nums text-xs font-semibold bg-transparent focus:outline-none transition-none select-text cursor-cell selection:bg-transparent selection:text-slate-900 ${
                                        isCellFocused
                                          ? 'text-slate-950 font-semibold'
                                          : 'text-slate-800'
                                      }`}
                                    />
                                  </td>
                                );
                              })}

                              {/* Auto-Calculated Total (Out of 100) - Locked */}
                              <td
                                title="100 Marks Total (Locked • Calculated from components)"
                                className={`w-[95px] min-w-[95px] h-10 p-0 text-center font-mono tabular-nums text-xs font-extrabold border-b border-l border-slate-200 select-none cursor-default ${
                                  isFailed
                                    ? 'bg-rose-50 text-rose-700'
                                    : isRowActive
                                    ? 'bg-blue-100/70 text-blue-950'
                                    : 'bg-slate-50/80 text-slate-900'
                                }`}
                              >
                                {totalMark === null || totalMark === undefined ? '-' : totalMark}
                              </td>

                              {/* Auto-Calculated CBSE Grade */}
                              <td
                                className={`w-[80px] min-w-[80px] h-10 p-0 text-center font-mono tabular-nums text-xs font-bold border-b border-l border-slate-200 select-none cursor-default ${
                                  isFailed
                                    ? 'bg-rose-50 text-rose-700'
                                    : isRowActive
                                    ? 'bg-blue-100/70 text-blue-950'
                                    : 'bg-slate-50/80 text-slate-800'
                                }`}
                              >
                                {subGrade}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                ) : selectedSubject === 'consolidated' ? (
                  /* =====================================================================
                     CONSOLIDATED SHEET MARKS ENTRY TABLE (All 7 Subjects + Components)
                     ===================================================================== */
                  <table className="w-full text-center text-xs border-separate border-spacing-0">
                    <thead
                      onMouseDown={(e) => handleHeaderDragStart(e, marksScrollContainerRef.current)}
                      title="Click and drag header to scroll horizontally"
                      className={isHeaderDragging ? 'cursor-grabbing select-none' : 'cursor-grab select-none'}
                    >
                      {/* Row 1: Group Headers */}
                      <tr className="bg-slate-100 text-slate-800 font-bold uppercase tracking-wider text-[11px] select-none h-9">
                        <th
                          rowSpan={2}
                          onClick={() => toggleSort('rollNo')}
                          className="sticky left-0 z-30 bg-slate-50 py-2 px-1 w-12 min-w-[48px] max-w-[48px] text-center hover:bg-slate-100 transition-colors border-b border-r border-slate-200 cursor-pointer align-middle"
                        >
                          <div className="text-center font-bold">Roll</div>
                        </th>
                        <th
                          rowSpan={2}
                          onClick={() => toggleSort('name')}
                          className="sticky left-[48px] z-30 bg-slate-50 py-2 px-3 w-[190px] min-w-[190px] max-w-[210px] text-center hover:bg-slate-100 transition-colors border-b border-r border-slate-200 cursor-pointer align-middle"
                        >
                          <div className="text-center font-bold">Student Name</div>
                        </th>
                        {consolidatedMarksStructure.sections.map((sec) => (
                          <th
                            key={`group-${sec.subject.name}`}
                            colSpan={sec.colSpan}
                            className="py-1.5 px-2 text-center bg-slate-100 border-b border-l border-slate-300 text-slate-900 font-bold"
                          >
                            {sec.subject.name.toUpperCase()}
                          </th>
                        ))}
                        <th
                          colSpan={3}
                          className="py-1.5 px-2 text-center bg-emerald-50 border-b border-l border-slate-300 text-emerald-900 font-bold"
                        >
                          OVERALL PERFORMANCE
                        </th>
                      </tr>

                      {/* Row 2: Component & Total Sub-Headers */}
                      <tr className="bg-slate-50 text-slate-700 font-semibold uppercase tracking-wider text-[10px] select-none h-11">
                        {consolidatedMarksStructure.sections.map((sec) => (
                          <React.Fragment key={`sub-${sec.subject.name}`}>
                            {sec.components.map((comp) => {
                              let headerLabel = comp.label.toUpperCase();
                              if (comp.isMainExam) {
                                headerLabel = `${selectedExam} ${sec.subject.name.toUpperCase()}`;
                              }
                              return (
                                <th
                                  key={`${sec.subject.name}-${comp.key}`}
                                  className="py-1.5 px-1.5 text-center min-w-[92px] bg-slate-50 border-b border-l border-slate-200 text-slate-700"
                                >
                                  <div className="font-bold text-slate-800 leading-tight">{headerLabel}</div>
                                  <div className="text-[10px] font-normal text-slate-400 mt-0.5">{comp.maxMarks}</div>
                                </th>
                              );
                            })}
                            {sec.isMulti && (
                              <>
                                <th
                                  onClick={() => toggleSort(sec.subject.name)}
                                  className="py-1.5 px-1.5 text-center min-w-[78px] bg-slate-100/80 border-b border-l border-slate-200 text-slate-900 cursor-pointer hover:bg-slate-200/60"
                                >
                                  <div className="font-bold">TOTAL</div>
                                  <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                                    {sec.subject.maxMarks || 100}
                                  </div>
                                </th>
                                <th className="py-1.5 px-1.5 text-center min-w-[64px] bg-slate-100/80 border-b border-l border-slate-200 text-slate-900">
                                  <div className="font-bold">GRADE</div>
                                </th>
                              </>
                            )}
                          </React.Fragment>
                        ))}
                        <th
                          onClick={() => toggleSort('total')}
                          className="py-1.5 px-2 text-center min-w-[92px] bg-emerald-50/70 border-b border-l border-slate-300 text-emerald-950 cursor-pointer"
                        >
                          <div className="font-bold">GRAND TOTAL</div>
                          <div className="text-[10px] font-normal text-emerald-700 mt-0.5">
                            {(processedStudents[0]
                              ? computedResultsMap.get(processedStudents[0].id)?.totalMax
                              : computedResults[0]?.totalMax) ??
                              consolidatedMarksStructure.sections.reduce(
                                (acc, s) => acc + (s.subject.maxMarks || 100),
                                0
                              )}
                          </div>
                        </th>
                        <th
                          onClick={() => toggleSort('percentage')}
                          className="py-1.5 px-2 text-center min-w-[82px] bg-emerald-50/70 border-b border-l border-slate-200 text-emerald-950 cursor-pointer"
                        >
                          <div className="font-bold">PERCENTAGE</div>
                          <div className="text-[10px] font-normal text-emerald-700 mt-0.5">%</div>
                        </th>
                        <th className="py-1.5 px-2 text-center min-w-[64px] bg-emerald-50/70 border-b border-l border-slate-200 text-emerald-950">
                          <div className="font-bold">GRADE</div>
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {paginatedStudents.length === 0 ? (
                        <tr>
                          <td
                            colSpan={consolidatedMarksStructure.totalCols}
                            className="py-12 text-center text-slate-400 text-sm border-b border-slate-100"
                          >
                            No students matching your search criteria.
                          </td>
                        </tr>
                      ) : (
                        paginatedStudents.map((student, rowIdx) => {
                          const isSelectedForReport = student.id === selectedStudentId;
                          const isRowActive = focusedCell?.rowIdx === rowIdx || isSelectedForReport;
                          const computedRes = computedResultsMap.get(student.id);
                          const totalMaxAll =
                            computedRes?.totalMax ??
                            consolidatedMarksStructure.sections.reduce(
                              (acc, s) => acc + (s.subject.maxMarks || 100),
                              0
                            );
                          const grandTotal =
                            computedRes?.totalObtained ??
                            consolidatedMarksStructure.sections.reduce(
                              (sum, sec) => {
                                const subName = sec.subject.name;
                                const bd =
                                  student.breakdowns?.[subName] ||
                                  generateDefaultBreakdown(
                                    student.marks[subName],
                                    subName,
                                    student.section
                                  );
                                const liveTotal = computeSubjectTotalFromBreakdown(
                                  subName,
                                  student.section,
                                  bd,
                                  sec.subject.components
                                );
                                const mark = sec.isMulti
                                  ? liveTotal !== null
                                    ? liveTotal
                                    : student.marks[subName]
                                  : student.marks[subName];
                                return sum + (typeof mark === 'number' ? mark : 0);
                              },
                              0
                            );

                          return (
                            <tr
                              key={student.id}
                              onClick={() => setSelectedStudentId(student.id)}
                              onContextMenu={(e) => handleRowContextMenu(e, student)}
                              className={`group/row transition-colors cursor-pointer h-10 min-h-10 max-h-10 ${
                                isRowActive
                                  ? 'bg-blue-50/70 text-slate-900'
                                  : 'hover:bg-slate-100/70 text-slate-800'
                              }`}
                            >
                              {/* Frozen Roll Number */}
                              <td
                                className={`sticky left-0 z-10 h-10 p-0 text-center font-mono text-xs text-slate-700 w-12 min-w-[48px] max-w-[48px] border-b border-r border-slate-200 transition-colors select-none cursor-default ${
                                  isRowActive
                                    ? 'bg-blue-100 font-bold text-blue-950'
                                    : 'bg-white group-hover/row:bg-slate-100'
                                }`}
                              >
                                {student.rollNo}
                              </td>

                              {/* Frozen Student Name */}
                              <td
                                className={`sticky left-[48px] z-10 h-10 px-3 w-[190px] min-w-[190px] max-w-[210px] border-b border-r border-slate-200 transition-colors ${
                                  isRowActive
                                    ? 'bg-blue-100 font-semibold text-blue-950'
                                    : 'bg-white group-hover/row:bg-slate-100'
                                }`}
                              >
                                <div className="flex items-center justify-between gap-1.5 w-full group/name">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedStudentId(student.id);
                                      setActiveTab('reportcards');
                                    }}
                                    title="View official report card"
                                    className="font-medium text-slate-900 hover:text-blue-600 transition-colors text-left flex items-center gap-1 truncate flex-1"
                                  >
                                    <span className="truncate">{student.name}</span>
                                    <ChevronRight className="w-3 h-3 text-slate-400 opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
                                  </button>
                                </div>
                              </td>

                              {/* Subject Component & Total Cells */}
                              {consolidatedMarksStructure.sections.map((sec) => {
                                const subName = sec.subject.name;
                                const bd =
                                  student.breakdowns?.[subName] ||
                                  generateDefaultBreakdown(
                                    student.marks[subName],
                                    subName,
                                    student.section
                                  );
                                const liveTotalFromBd = computeSubjectTotalFromBreakdown(
                                  subName,
                                  student.section,
                                  bd,
                                  sec.subject.components
                                );
                                const totalMark = sec.isMulti
                                  ? liveTotalFromBd !== null
                                    ? liveTotalFromBd
                                    : student.marks[subName]
                                  : student.marks[subName];

                                const subMax = sec.subject.maxMarks || 100;
                                const subPct =
                                  typeof totalMark === 'number' && subMax > 0
                                    ? (totalMark / subMax) * 100
                                    : 0;
                                const subGrade =
                                  totalMark === 'AB'
                                    ? 'AB'
                                    : typeof totalMark === 'number'
                                    ? computeCbseGrade(subPct)
                                    : '-';

                                return (
                                  <React.Fragment key={`cells-${student.id}-${subName}`}>
                                    {sec.components.map((comp) => {
                                      const rawVal = sec.isMulti ? bd[comp.key] : student.marks[subName];
                                      const displayVal =
                                        rawVal === null || rawVal === undefined ? '' : String(rawVal);
                                      return (
                                        <td
                                          key={`${student.id}-${subName}-${comp.key}`}
                                          className="min-w-[92px] h-10 p-0 border-b border-l border-slate-200 relative transition-colors"
                                        >
                                          <input
                                            type="text"
                                            value={displayVal}
                                            placeholder={`/${comp.maxMarks}`}
                                            onChange={(e) => {
                                              if (sec.isMulti) {
                                                handleInternalCellChange(
                                                  student.id,
                                                  subName,
                                                  comp.key,
                                                  e.target.value
                                                );
                                              } else {
                                                handleMarkChange(student.id, subName, e.target.value);
                                              }
                                            }}
                                            className="w-full h-10 px-1 text-center font-mono tabular-nums text-xs font-semibold bg-transparent text-slate-800 focus:bg-white focus:ring-2 focus:ring-inset focus:ring-blue-600 focus:outline-none"
                                          />
                                        </td>
                                      );
                                    })}
                                    {sec.isMulti && (
                                      <>
                                        <td className="min-w-[78px] h-10 p-0 text-center font-mono tabular-nums text-xs font-extrabold border-b border-l border-slate-200 bg-slate-50/90 text-slate-900 select-none">
                                          {totalMark === null || totalMark === undefined ? '-' : totalMark}
                                        </td>
                                        <td className="min-w-[64px] h-10 p-0 text-center font-mono tabular-nums text-xs font-bold border-b border-l border-slate-200 bg-slate-50/90 text-slate-800 select-none">
                                          {subGrade}
                                        </td>
                                      </>
                                    )}
                                  </React.Fragment>
                                );
                              })}

                              {/* Overall Performance Cells */}
                              <td className="min-w-[92px] h-10 p-0 text-center font-mono tabular-nums text-xs font-extrabold border-b border-l border-slate-300 bg-emerald-50/40 text-emerald-950 select-none">
                                {grandTotal}
                              </td>
                              <td className="min-w-[82px] h-10 p-0 text-center font-mono tabular-nums text-xs font-bold border-b border-l border-slate-200 bg-emerald-50/40 text-emerald-950 select-none">
                                {computedRes
                                  ? computedRes.percentage.toFixed(2)
                                  : totalMaxAll > 0
                                  ? ((grandTotal / totalMaxAll) * 100).toFixed(2)
                                  : '0.00'}
                                %
                              </td>
                              <td className="min-w-[64px] h-10 p-0 text-center font-mono tabular-nums text-xs font-bold border-b border-l border-slate-200 bg-emerald-50/40 text-emerald-950 select-none">
                                {computedRes
                                  ? computedRes.grade
                                  : computeCbseGrade(totalMaxAll > 0 ? (grandTotal / totalMaxAll) * 100 : 0)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                ) : (
                  /* All 7 Subjects Consolidated Summary Grid */
                  <table className="w-full text-center text-xs border-separate border-spacing-0">
                    <thead
                      onMouseDown={(e) => handleHeaderDragStart(e, marksScrollContainerRef.current)}
                      title="Click and drag header to scroll horizontally"
                      className={isHeaderDragging ? 'cursor-grabbing select-none' : 'cursor-grab select-none'}
                    >
                      <tr className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[11px] select-none h-11">
                        {/* Frozen Roll Header */}
                        <th
                          onClick={() => toggleSort('rollNo')}
                          className="sticky left-0 z-30 bg-slate-50 py-2.5 px-1 w-12 min-w-[48px] max-w-[48px] text-center hover:bg-slate-100 transition-colors border-b border-r border-slate-200"
                        >
                          <div className="text-center font-bold">Roll</div>
                        </th>

                        {/* Frozen Student Name Header */}
                        <th
                          onClick={() => toggleSort('name')}
                          className="sticky left-[48px] z-30 bg-slate-50 py-2.5 px-3 w-[190px] min-w-[190px] max-w-[210px] text-center hover:bg-slate-100 transition-colors border-b border-r border-slate-200"
                        >
                          <div className="text-center font-bold">Student Name</div>
                        </th>

                        {/* 7 Subjects with Centered Headers & Direct Switch Icon */}
                        {displayedSubjects.map((sub) => {
                          const isColActive = focusedCell?.colKey === sub.name;
                          const isLocked = false;

                          return (
                            <th
                              key={sub.name}
                              onClick={() => toggleSort(sub.name)}
                              className={`py-2 px-1 text-center w-[74px] min-w-[74px] max-w-[74px] bg-slate-50 border-b border-l border-slate-200 transition-colors relative group cursor-pointer ${
                                isColActive
                                  ? 'bg-blue-50 text-blue-900 font-bold border-blue-200'
                                  : 'hover:bg-slate-100 text-slate-700'
                              }`}
                              title={`${sub.name} (Max: ${sub.maxMarks}) | Click to sort`}
                            >
                              <div className="flex items-center justify-center">
                                <span className="font-bold text-slate-800">{getSubjectHeaderLabel(sub.name).toUpperCase()}</span>
                              </div>
                              <div className="text-[10px] font-normal text-slate-400 text-center mt-0.5">
                                {sub.maxMarks}
                              </div>
                            </th>
                          );
                        })}

                        {/* Total Sortable */}
                        <th
                          onClick={() => toggleSort('total')}
                          className="py-2 px-1 text-center w-[70px] min-w-[70px] bg-slate-50 border-b border-l border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <div className="text-center font-bold text-slate-800">TOTAL</div>
                          <div className="text-[10px] font-normal text-slate-400 text-center mt-0.5">
                            {(processedStudents[0]
                              ? computedResultsMap.get(processedStudents[0].id)?.totalMax
                              : computedResults[0]?.totalMax) ??
                              displayedSubjects.reduce((sum, s) => sum + (s.maxMarks || 0), 0)}
                          </div>
                        </th>

                        {/* Percentage Sortable */}
                        <th
                          onClick={() => toggleSort('percentage')}
                          className="py-2 px-1 text-center w-[72px] min-w-[72px] bg-slate-50 border-b border-l border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <div className="text-center font-bold text-slate-800">PCT (%)</div>
                          <div className="text-[10px] font-normal text-slate-400 text-center mt-0.5">%</div>
                        </th>

                        {/* Grade */}
                        <th className="py-2 px-1 text-center w-[58px] min-w-[58px] bg-slate-50 border-b border-l border-slate-200">
                          <div className="text-center font-bold text-slate-800">GRADE</div>
                        </th>

                        {/* Rank Sortable */}
                        <th
                          onClick={() => toggleSort('rank')}
                          className="py-2 px-1 text-center w-[54px] min-w-[54px] bg-slate-50 border-b border-l border-slate-200 hover:bg-slate-100 transition-colors cursor-pointer"
                        >
                          <div className="text-center font-bold text-slate-800">RANK</div>
                          <div className="text-[10px] font-normal text-slate-400 text-center mt-0.5">CLASS</div>
                        </th>
                      </tr>
                    </thead>

                    <tbody>
                      {paginatedStudents.length === 0 ? (
                        <tr>
                          <td
                            colSpan={12}
                            className="py-12 text-center text-slate-400 text-sm border-b border-slate-100"
                          >
                            No students matching your search criteria.
                          </td>
                        </tr>
                      ) : (
                        paginatedStudents.map((student, rowIdx) => {
                          const result = computedResultsMap.get(student.id);
                          const isSelectedForReport = student.id === selectedStudentId;
                          const isRowActive = focusedCell?.rowIdx === rowIdx || isSelectedForReport;

                          return (
                            <tr
                              key={student.id}
                              onClick={() => {
                                setSelectedStudentId(student.id);
                                setFocusedCell((prev) => ({ rowIdx, colKey: prev?.colKey || activeSubjects[0]?.name || 'English' }));
                              }}
                              onContextMenu={(e) => handleRowContextMenu(e, student)}
                              className={`group/row transition-colors cursor-pointer h-10 min-h-10 max-h-10 ${
                                isRowActive
                                  ? 'bg-blue-50/70 text-slate-900'
                                  : 'hover:bg-slate-100/70 text-slate-800'
                              }`}
                            >
                              {/* Frozen Roll Number */}
                              <td className={`sticky left-0 z-10 h-10 p-0 text-center font-mono text-xs text-slate-700 w-12 min-w-[48px] max-w-[48px] border-b border-r border-slate-200 transition-colors select-none cursor-default ${
                                isRowActive
                                  ? 'bg-blue-100 font-bold text-blue-950'
                                  : 'bg-white group-hover/row:bg-slate-100'
                              }`}>
                                {student.rollNo}
                              </td>

                              {/* Frozen Student Name */}
                              <td className={`sticky left-[48px] z-10 h-10 px-3 w-[190px] min-w-[190px] max-w-[210px] border-b border-r border-slate-200 transition-colors ${
                                isRowActive
                                  ? 'bg-blue-100 font-semibold text-blue-950'
                                  : 'bg-white group-hover/row:bg-slate-100'
                              }`}>
                                <div className="flex items-center justify-between gap-1.5 w-full group/name">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedStudentId(student.id);
                                      setActiveTab('reportcards');
                                    }}
                                    title="View official report card"
                                    className="font-medium text-slate-900 hover:text-blue-600 transition-colors text-left flex items-center gap-1 truncate flex-1"
                                  >
                                    <span className="truncate">{student.name}</span>
                                    <ChevronRight className="w-3 h-3 text-slate-400 opacity-0 group-hover/name:opacity-100 transition-opacity shrink-0" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedStudentId(student.id);
                                      setEditingStudent(student);
                                    }}
                                    title={`Edit details for ${student.name}`}
                                    className="opacity-0 group-hover/name:opacity-100 p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-200/70 rounded transition-all shrink-0"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </td>

                              {/* Subject Marks Editable Cells */}
                              {displayedSubjects.map((sub, subIdx) => {
                                const isLocked = false;
                                const markVal = student.marks[sub.name];
                                const isFocused =
                                  focusedCell?.rowIdx === rowIdx &&
                                  focusedCell?.colKey === sub.name;
                                const displayVal =
                                  markVal === null || markVal === undefined
                                    ? ''
                                    : markVal === 'AB'
                                    ? 'AB'
                                    : markVal;

                                const isFailed =
                                  markVal !== null &&
                                  markVal !== undefined &&
                                  (markVal === 'AB' || Number(markVal) < sub.passMarks);

                                const isInRange =
                                  normalizedRange !== null &&
                                  rowIdx >= normalizedRange.minRow &&
                                  rowIdx <= normalizedRange.maxRow &&
                                  subIdx >= normalizedRange.minCol &&
                                  subIdx <= normalizedRange.maxCol;

                                const isRangeTop = isInRange && rowIdx === normalizedRange.minRow;
                                const isRangeBottom = isInRange && rowIdx === normalizedRange.maxRow;
                                const isRangeLeft = isInRange && subIdx === normalizedRange.minCol;
                                const isRangeRight = isInRange && subIdx === normalizedRange.maxCol;

                                const rangeShadows: string[] = [];
                                if (isInRange && normalizedRange && normalizedRange.cellCount > 1) {
                                  if (isRangeTop) rangeShadows.push('inset 0 2px 0 0 #1d4ed8');
                                  if (isRangeBottom) rangeShadows.push('inset 0 -2px 0 0 #1d4ed8');
                                  if (isRangeLeft) rangeShadows.push('inset 2px 0 0 0 #1d4ed8');
                                  if (isRangeRight) rangeShadows.push('inset -2px 0 0 0 #1d4ed8');
                                }
                                const compoundBoxShadow = rangeShadows.length > 0 ? rangeShadows.join(', ') : undefined;

                                const isInsideActiveRange =
                                  normalizedRange !== null &&
                                  normalizedRange.cellCount > 1 &&
                                  rowIdx >= normalizedRange.minRow &&
                                  rowIdx <= normalizedRange.maxRow &&
                                  subIdx >= normalizedRange.minCol &&
                                  subIdx <= normalizedRange.maxCol;

                                return (
                                  <td
                                    key={sub.name}
                                    onClick={() => {
                                      const targetInput = cellInputRefs.current[`${rowIdx}-${sub.name}`];
                                      if (targetInput) {
                                        targetInput.focus();
                                      }
                                    }}
                                    onDoubleClick={(e) => {
                                      if (e.altKey && sub.components && sub.components.length > 1) {
                                        setInternalModalData({ student, subjectName: sub.name });
                                      } else {
                                        replaceOnNextKeyRef.current = false;
                                        setIsCellEditing(true);
                                      }
                                    }}
                                    onMouseDown={(e) => {
                                      if (e.button !== 0) return;
                                      replaceOnNextKeyRef.current = true;
                                      setIsCellEditing(false);
                                      if (e.shiftKey) {
                                        isShiftSelectingRef.current = true;
                                        setSelectedRange((prev) => {
                                          const start = prev ? prev.start : { rowIdx, colIdx: subIdx };
                                          return { start, end: { rowIdx, colIdx: subIdx } };
                                        });
                                      } else {
                                        if (!isInsideActiveRange) {
                                          isSelectingRef.current = true;
                                          setIsSelecting(true);
                                          setSelectedRange({
                                            start: { rowIdx, colIdx: subIdx },
                                            end: { rowIdx, colIdx: subIdx },
                                          });
                                        }
                                        setFocusedCell({ rowIdx, colKey: sub.name });
                                        setSelectedStudentId(student.id);
                                      }
                                      const targetInput = cellInputRefs.current[`${rowIdx}-${sub.name}`];
                                      if (targetInput) {
                                        targetInput.focus();
                                      }
                                    }}
                                    onMouseEnter={() => {
                                      if (isSelectingRef.current || isSelecting) {
                                        setSelectedRange((prev) =>
                                          prev
                                            ? { start: prev.start, end: { rowIdx, colIdx: subIdx } }
                                            : { start: { rowIdx, colIdx: subIdx }, end: { rowIdx, colIdx: subIdx } }
                                        );
                                      }
                                    }}
                                    style={{ boxShadow: compoundBoxShadow }}
                                    className={`w-[74px] min-w-[74px] max-w-[74px] h-10 p-0 border-b border-l border-slate-200 relative transition-colors box-border ${
                                      isInRange && normalizedRange && normalizedRange.cellCount > 1
                                        ? 'bg-blue-500/15'
                                        : isFocused
                                        ? 'bg-white shadow-xs'
                                        : isFailed
                                        ? isRowActive ? 'bg-rose-100/60' : 'bg-rose-50/60 group-hover/row:bg-rose-100/40'
                                        : isRowActive
                                        ? 'bg-blue-50/80'
                                        : 'bg-transparent group-hover/row:bg-slate-100/70'
                                    } ${
                                      isFocused && (!normalizedRange || normalizedRange.cellCount <= 1)
                                        ? 'ring-2 ring-inset ring-blue-600 z-10'
                                        : ''
                                    } cursor-cell`}
                                  >
                                    <input
                                      ref={(el) => {
                                        cellInputRefs.current[`${rowIdx}-${sub.name}`] = el;
                                      }}
                                      data-excel-cell="true"
                                      type="text"
                                      readOnly={isLocked}
                                      value={displayVal}
                                      onFocus={() => {
                                        replaceOnNextKeyRef.current = true;
                                        setIsCellEditing(false);
                                        setFocusedCell({ rowIdx, colKey: sub.name });
                                        setSelectedStudentId(student.id);
                                        if (!isSelectingRef.current && !isSelecting && !isShiftSelectingRef.current && !isInsideActiveRange) {
                                          setSelectedRange({
                                            start: { rowIdx, colIdx: subIdx },
                                            end: { rowIdx, colIdx: subIdx },
                                          });
                                        }
                                        isShiftSelectingRef.current = false;
                                      }}
                                      onMouseDown={(e) => {
                                        if (e.button !== 0) return;
                                        replaceOnNextKeyRef.current = true;
                                        setIsCellEditing(false);
                                        if (e.shiftKey) {
                                          isShiftSelectingRef.current = true;
                                          setSelectedRange((prev) => {
                                            const start = prev ? prev.start : { rowIdx, colIdx: subIdx };
                                            return { start, end: { rowIdx, colIdx: subIdx } };
                                          });
                                        } else if (!isInsideActiveRange) {
                                          isSelectingRef.current = true;
                                          setIsSelecting(true);
                                          setSelectedRange({
                                            start: { rowIdx, colIdx: subIdx },
                                            end: { rowIdx, colIdx: subIdx },
                                          });
                                          setFocusedCell({ rowIdx, colKey: sub.name });
                                          setSelectedStudentId(student.id);
                                        }
                                      }}
                                      onMouseEnter={() => {
                                        if (isSelectingRef.current || isSelecting) {
                                          setSelectedRange((prev) =>
                                            prev
                                              ? { start: prev.start, end: { rowIdx, colIdx: subIdx } }
                                              : { start: { rowIdx, colIdx: subIdx }, end: { rowIdx, colIdx: subIdx } }
                                          );
                                        }
                                      }}
                                      onDoubleClick={(e) => {
                                        if (e.altKey && sub.components && sub.components.length > 1) {
                                          setInternalModalData({ student, subjectName: sub.name });
                                        } else {
                                          replaceOnNextKeyRef.current = false;
                                          setIsCellEditing(true);
                                        }
                                      }}
                                      onMouseUp={() => {
                                        isSelectingRef.current = false;
                                        setIsSelecting(false);
                                      }}
                                      onDragStart={(e) => e.preventDefault()}
                                      onChange={(e) => {
                                        handleMarkChange(student.id, sub.name, e.target.value);
                                      }}
                                      onKeyDown={(e) =>
                                        handleCellKeyDown(e, rowIdx, sub.name, student.id, isLocked)
                                      }
                                      onPaste={(e) => {
                                        handlePaste(e, rowIdx, sub.name);
                                      }}
                                      className={`w-full h-10 px-1 text-center font-mono tabular-nums text-xs font-semibold bg-transparent focus:outline-none transition-none ${
                                        isLocked
                                          ? 'caret-transparent select-none cursor-default selection:bg-transparent'
                                          : 'select-text cursor-cell selection:bg-transparent selection:text-slate-900'
                                      } ${
                                        isFocused
                                          ? 'text-slate-950 font-semibold'
                                          : 'text-slate-800'
                                      } ${isFailed ? 'text-rose-700 font-bold' : ''}`}
                                    />
                                  </td>
                                );
                              })}

                              {/* Total Marks */}
                              <td className={`w-[70px] min-w-[70px] h-10 p-0 text-center font-mono tabular-nums font-semibold border-b border-l border-slate-200 transition-colors select-none cursor-default ${
                                isRowActive ? 'bg-blue-50/90 text-blue-950 font-bold' : 'text-slate-900 group-hover/row:bg-slate-100/70'
                              }`}>
                                {result?.totalObtained ?? 0}
                              </td>

                              {/* Percentage */}
                              <td className={`w-[72px] min-w-[72px] h-10 p-0 text-center font-mono tabular-nums text-xs font-semibold border-b border-l border-slate-200 transition-colors select-none cursor-default ${
                                isRowActive ? 'bg-blue-50/90 text-blue-950 font-bold' : 'text-slate-800 group-hover/row:bg-slate-100/70'
                              }`}>
                                {result ? `${result.percentage.toFixed(1)}%` : '0.0%'}
                              </td>

                              {/* Grade */}
                              <td className={`w-[58px] min-w-[58px] h-10 p-0 text-center font-mono tabular-nums text-xs font-semibold border-b border-l border-slate-200 transition-colors select-none cursor-default ${
                                isRowActive ? 'bg-blue-50/90 text-blue-950 font-bold' : 'text-slate-800 group-hover/row:bg-slate-100/70'
                              }`}>
                                {result?.grade ?? 'E2'}
                              </td>

                              {/* Rank */}
                              <td className={`w-[54px] min-w-[54px] h-10 p-0 text-center font-mono text-xs border-b border-l border-slate-200 transition-colors select-none cursor-default ${
                                isRowActive ? 'bg-blue-50/90' : 'group-hover/row:bg-slate-100/70'
                              }`}>
                                {result?.rank ? (
                                  <span className="text-slate-900 font-bold">
                                    #{result.rank}
                                  </span>
                                ) : '-'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}
              </div>



              {/* Card Footer: Summary Metrics */}
              <div className="border-t border-slate-200 bg-slate-50/80 px-5 py-2.5 flex items-center justify-between text-xs text-slate-500">
                {/* Roster Metrics */}
                <div className="flex items-center flex-wrap gap-2.5">
                  <span>
                    Class Avg: <strong className="font-semibold font-mono text-slate-800">{summaryStats.avg}%</strong>
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span>
                    Highest: <strong className="font-semibold font-mono text-slate-800">{summaryStats.highest}%</strong> ({summaryStats.highestStudent})
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span>
                    Pass Rate: <strong className="font-semibold font-mono text-emerald-700">{summaryStats.passRate}%</strong>
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span>
                    Passed: <strong className="font-semibold font-mono text-emerald-700">{summaryStats.passCount}</strong>
                  </span>
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span>
                    Failed: <strong className="font-semibold font-mono text-rose-600">{summaryStats.failCount}</strong>
                  </span>
                </div>

                {/* Range Selection Stats Indicator */}
                {rangeStats && rangeStats.cellCount > 1 && (
                  <div className="flex items-center gap-2 bg-blue-50/90 border border-blue-200/80 text-blue-800 px-2.5 py-1 rounded-md text-[11px] font-medium shrink-0 animate-in fade-in duration-100">
                    <span className="font-semibold text-blue-900">Selected: {rangeStats.cellCount} cells</span>
                    <span className="text-blue-300">|</span>
                    <span>Count: <strong className="font-mono text-blue-900">{rangeStats.numericCount}</strong></span>
                    <span className="text-blue-300">|</span>
                    <span>Sum: <strong className="font-mono text-blue-900">{rangeStats.sum}</strong></span>
                    <span className="text-blue-300">|</span>
                    <span>Avg: <strong className="font-mono text-blue-900">{rangeStats.avg}</strong></span>
                    <span className="text-blue-300">|</span>
                    <span>Min: <strong className="font-mono text-blue-900">{rangeStats.min}</strong></span>
                    <span className="text-blue-300">|</span>
                    <span>Max: <strong className="font-mono text-blue-900">{rangeStats.max}</strong></span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      {/* SPREADSHEET RIGHT-CLICK CONTEXT MENU */}
      {contextMenu && (() => {
        const res = computedResults.find((r) => r.student.id === contextMenu.student.id);
        return (
          <div
            style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
            className="fixed z-50 w-64 bg-white border border-slate-200/90 rounded-xl shadow-2xl p-1.5 text-xs text-slate-800 select-none animate-in fade-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Context Menu Header */}
            <div className="px-3 py-2 bg-slate-50 rounded-lg border border-slate-100 mb-1">
              <div className="font-bold text-slate-900 truncate text-[13px]">
                {contextMenu.student.name}
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-mono mt-0.5">
                <span>Roll {contextMenu.student.rollNo}</span>
                <span>·</span>
                <span className="font-medium text-slate-700">{contextMenu.student.section}</span>
                {res?.rank && (
                  <>
                    <span>·</span>
                    <span className="text-emerald-700 font-semibold">Rank #{res.rank}</span>
                  </>
                )}
              </div>
              {res && (
                <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                  Total {res.totalObtained}/{res.totalMax} ({res.percentage.toFixed(2)}%) · {res.status}
                </div>
              )}
            </div>

            {/* Menu Actions */}
            <div className="flex flex-col gap-0.5">
              {/* Range Actions if multi-cell selection active */}
              {normalizedRange && normalizedRange.cellCount > 1 && (
                <>
                  <button
                    onClick={() => {
                      copySelectedRange();
                      setContextMenu(null);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-blue-700 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer text-left group"
                  >
                    <div className="flex items-center gap-2">
                      <Copy className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                      <span className="font-semibold">Copy Range ({normalizedRange.cellCount} cells)</span>
                    </div>
                    <span className="text-[10px] text-blue-500 font-mono">⌘C</span>
                  </button>

                  <button
                    onClick={() => {
                      clearSelectedRange();
                      setContextMenu(null);
                    }}
                    className="w-full flex items-center justify-between px-2.5 py-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer text-left group"
                  >
                    <div className="flex items-center gap-2">
                      <Trash2 className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span className="font-semibold">Delete Range ({normalizedRange.cellCount} cells)</span>
                    </div>
                    <span className="text-[10px] text-rose-500 font-mono">Del</span>
                  </button>
                  <div className="h-px bg-slate-100 my-1" />
                </>
              )}

              <button
                onClick={() => {
                  setSelectedStudentId(contextMenu.student.id);
                  setActiveTab('reportcards');
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  <span className="font-medium">View Report Card</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">Enter</span>
              </button>

              <button
                onClick={() => {
                  setSelectedStudentId(contextMenu.student.id);
                  setEditingStudent(contextMenu.student);
                  setContextMenu(null);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <Edit2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Edit Student Details</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono">E</span>
              </button>

              {activeSubjects.some((s) => s.components && s.components.length > 1) && (
                <button
                  onClick={() => {
                    const targetSubName =
                      focusedCell && activeSubjects.some((s) => s.name === focusedCell.colKey)
                        ? focusedCell.colKey
                        : activeSubjects[0]?.name || 'English';
                    setInternalModalData({
                      student: contextMenu.student,
                      subjectName: targetSubName,
                    });
                    setContextMenu(null);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-left group"
                >
                  <div className="flex items-center gap-2">
                    <Award className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                    <span>Edit Assessment Breakdown</span>
                  </div>
                </button>
              )}

              <button
                onClick={() => handleCopyStudentSummary(contextMenu.student)}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <Copy className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Copy Student Summary</span>
                </div>
              </button>

              <button
                onClick={() => {
                  setSelectedStudentId(contextMenu.student.id);
                  setActiveTab('reportcards');
                  setContextMenu(null);
                  setTimeout(() => {
                    window.print();
                  }, 400);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <Printer className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Print Report Card</span>
                </div>
              </button>

              {selectedClass !== contextMenu.student.section && (
                <button
                  onClick={() => {
                    setSelectedClass(contextMenu.student.section);
                    setContextMenu(null);
                    showToast(`Filtered to ${contextMenu.student.section} Division`);
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer text-left group"
                >
                  <div className="flex items-center gap-2">
                    <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>Filter: {contextMenu.student.section}</span>
                  </div>
                </button>
              )}

              <div className="h-px bg-slate-100 my-1" />

              <button
                onClick={() => {
                  const stu = contextMenu.student;
                  setContextMenu(null);
                  handleDeleteStudent(stu.id, stu.name);
                }}
                className="w-full flex items-center justify-between px-2.5 py-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer text-left group"
              >
                <div className="flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                  <span className="font-medium">Remove Student</span>
                </div>
              </button>
            </div>
          </div>
        );
      })()}

        {/* ========================================================
            VIEW 1B: TEACHER REMARKS ENTRY LEDGER (Subject & Class Teacher)
           ======================================================== */}
        {activeTab === 'remarks' && (
          <div className="flex-1 flex flex-col gap-4">
            {/* Page Header Strip */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Teacher Remarks
                </h1>
                <p className="text-xs text-slate-500 mt-0.5 font-normal">
                  Write subject feedback or overall class teacher remarks for each student. Anything you type here is automatically added to their report card.
                </p>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('reportcards')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5 text-white" />
                  <span>View Report Cards</span>
                </button>
              </div>
            </div>

            {/* Unified Control Bar (Identical styling to Marks Entry) */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                {/* 1. Class Dropdown */}
                <CustomSelect
                  id="remarks-class-select"
                  icon={<Layers className="w-3.5 h-3.5 text-slate-400" />}
                  prefixLabel="Class:"
                  value={selectedClass}
                  onChange={(val) => {
                    setSelectedClass(val);
                    setExportClass(val);
                    setCurrentPage(1);
                  }}
                  options={[
                    { value: 'all', label: `All Classes (${students.length})` },
                    ...SVA_ALL_CLASSES.map((cls) => ({
                      value: cls,
                      label: `${getClassGradeLabel(cls)} (${classCounts[cls] || 0})`,
                    })),
                  ]}
                />

                {/* 2. Exam Dropdown */}
                <CustomSelect
                  id="remarks-exam-select"
                  icon={<BookOpen className="w-3.5 h-3.5 text-slate-400" />}
                  prefixLabel="Exam:"
                  value={selectedExam}
                  onChange={(val) => handleExamChange(val)}
                  options={Object.values(examConfigs).map((ex) => ({
                    value: ex.id,
                    label: ex.code || ex.id,
                  }))}
                />

                {/* 3. Subject / Remark Scope Dropdown */}
                <CustomSelect
                  id="remarks-scope-select"
                  icon={<Award className="w-3.5 h-3.5 text-slate-400" />}
                  prefixLabel="Subject:"
                  value={selectedRemarkScope}
                  onChange={(val) => setSelectedRemarkScope(val)}
                  options={[
                    { value: 'all', label: 'All Remarks' },
                    { value: 'class_teacher', label: 'Class Teacher Remarks' },
                    ...activeSubjects.map((sub) => ({
                      value: sub.name,
                      label: sub.name,
                    })),
                  ]}
                />
              </div>

              {/* 4. Search Input */}
              <div className="relative w-full sm:w-64 lg:ml-auto">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name or roll no..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder-slate-400 focus:outline-none focus:bg-white focus:border-slate-900 transition-colors"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Remarks Spreadsheet Card with Left & Right Horizontal Scroll Buttons & Drag-to-Scroll Headers */}
            <div className="bg-white border border-slate-200/80 rounded-xl shadow-xs flex flex-col overflow-hidden relative isolate z-10">
              {/* Left & Right Horizontal Scroll Paddles: only shown in All Remarks view, transparent when not in use */}
              {selectedRemarkScope === 'all' && (
                <div className="fixed top-1/2 -translate-y-1/2 inset-x-0 z-30 pointer-events-none">
                  <div className="max-w-[1440px] mx-auto w-full px-1.5 sm:px-2 flex items-center justify-between">
                    <button
                      type="button"
                      data-testid="remarks-scroll-left"
                      aria-label="Scroll remarks table left"
                      title="Scroll remarks columns left"
                      onClick={() => scrollHorizontalBy(remarksScrollContainerRef.current, 'left')}
                      className={`pointer-events-auto w-8 h-8 rounded-full border transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 ${
                        isHorizontalScrollActive
                          ? 'bg-white border-slate-200/90 text-slate-900 opacity-100 shadow-[0_4px_12px_rgba(15,23,42,0.12)]'
                          : 'bg-transparent border-slate-300/40 text-slate-500 opacity-30 shadow-none hover:opacity-100 hover:bg-white hover:border-slate-200/90 hover:text-slate-900 hover:shadow-[0_4px_12px_rgba(15,23,42,0.12)] focus-visible:opacity-100 focus-visible:bg-white'
                      }`}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      data-testid="remarks-scroll-right"
                      aria-label="Scroll remarks table right"
                      title="Scroll remarks columns right"
                      onClick={() => scrollHorizontalBy(remarksScrollContainerRef.current, 'right')}
                      className={`pointer-events-auto w-8 h-8 rounded-full border transition-all duration-200 flex items-center justify-center cursor-pointer active:scale-95 ${
                        isHorizontalScrollActive
                          ? 'bg-white border-slate-200/90 text-slate-900 opacity-100 shadow-[0_4px_12px_rgba(15,23,42,0.12)]'
                          : 'bg-transparent border-slate-300/40 text-slate-500 opacity-30 shadow-none hover:opacity-100 hover:bg-white hover:border-slate-200/90 hover:text-slate-900 hover:shadow-[0_4px_12px_rgba(15,23,42,0.12)] focus-visible:opacity-100 focus-visible:bg-white'
                      }`}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              <div
                ref={remarksScrollContainerRef}
                className="overflow-x-auto excel-grid-container relative w-full"
              >
                {selectedRemarkScope === 'class_teacher' ? (
                  /* CLASS TEACHER REMARKS ONLY VIEW */
                  <table className="w-full text-center text-xs border-separate border-spacing-0">
                    <thead
                      onMouseDown={(e) => handleHeaderDragStart(e, remarksScrollContainerRef.current)}
                      title="Click and drag header to scroll horizontally"
                      className={isHeaderDragging ? 'cursor-grabbing select-none' : 'cursor-grab select-none'}
                    >
                      <tr className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[11px] select-none h-11">
                        <th
                          onClick={() => toggleSort('rollNo')}
                          className="sticky left-0 z-30 bg-slate-50 py-2.5 px-1 w-12 min-w-[48px] max-w-[48px] text-center hover:bg-slate-100 transition-colors border-b border-r border-slate-200"
                        >
                          <div className="text-center font-bold">Roll</div>
                        </th>
                        <th
                          onClick={() => toggleSort('name')}
                          className="sticky left-[48px] z-30 bg-slate-50 py-2.5 px-3 w-[190px] min-w-[190px] max-w-[210px] text-center hover:bg-slate-100 transition-colors border-b border-r border-slate-200"
                        >
                          <div className="text-center font-bold">Student Name</div>
                        </th>
                        <th
                          onClick={() => toggleSort('total')}
                          className="py-2 px-2 text-center w-[75px] min-w-[75px] bg-slate-50 border-b border-l border-slate-200 hover:bg-slate-100 transition-colors"
                        >
                          <div className="text-center font-bold text-slate-800">Total</div>
                          <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                            {(processedStudents[0]
                              ? computedResultsMap.get(processedStudents[0].id)?.totalMax
                              : computedResults[0]?.totalMax) ??
                              activeSubjects.reduce((sum, s) => sum + (s.maxMarks || 0), 0)}
                          </div>
                        </th>
                        <th
                          onClick={() => toggleSort('percentage')}
                          className="py-2 px-2 text-center w-[75px] min-w-[75px] bg-slate-50 border-b border-l border-slate-200 hover:bg-slate-100 transition-colors"
                        >
                          <div className="text-center font-bold text-slate-800">Pct (%)</div>
                        </th>
                        <th className="py-2 px-2 text-center w-[65px] min-w-[65px] bg-slate-50 border-b border-l border-slate-200">
                          <div className="text-center font-bold text-slate-800">Grade</div>
                        </th>
                        <th className="py-2.5 px-3 text-center w-full min-w-[420px] bg-slate-50 border-b border-l border-slate-200">
                          <div className="text-center font-bold text-slate-800">Class Teacher Remark</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedStudents.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-slate-400 text-sm border-b border-slate-100">
                            No students matching your search criteria.
                          </td>
                        </tr>
                      ) : (
                        paginatedStudents.map((student, rowIdx) => {
                          const result = computedResultsMap.get(student.id);
                          const isSelectedForReport = student.id === selectedStudentId;
                          const cellKey = `rem-ct-${rowIdx}`;

                          return (
                            <tr
                              key={student.id}
                              onClick={() => setSelectedStudentId(student.id)}
                              className={`group/row transition-colors h-10 min-h-10 max-h-10 ${
                                isSelectedForReport
                                  ? 'bg-blue-50/70 text-slate-900'
                                  : 'hover:bg-slate-100/70 text-slate-800'
                              }`}
                            >
                              <td
                                className={`sticky left-0 z-10 h-10 p-0 text-center font-mono text-xs text-slate-700 w-12 min-w-[48px] max-w-[48px] border-b border-r border-slate-200 select-none cursor-default ${
                                  isSelectedForReport
                                    ? 'bg-blue-100 font-bold text-blue-950'
                                    : 'bg-white group-hover/row:bg-slate-100'
                                }`}
                              >
                                {student.rollNo}
                              </td>
                              <td
                                className={`sticky left-[48px] z-10 h-10 px-3 w-[190px] min-w-[190px] max-w-[210px] border-b border-r border-slate-200 ${
                                  isSelectedForReport
                                    ? 'bg-blue-100 font-semibold text-blue-950'
                                    : 'bg-white group-hover/row:bg-slate-100'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedStudentId(student.id);
                                    setActiveTab('reportcards');
                                  }}
                                  className="font-medium text-slate-900 hover:text-blue-600 transition-colors text-left flex items-center gap-1 truncate w-full cursor-pointer"
                                >
                                  <span className="truncate">{student.name}</span>
                                </button>
                              </td>
                              <td className="w-[75px] min-w-[75px] h-10 p-0 text-center font-mono tabular-nums text-xs font-semibold border-b border-l border-slate-200 bg-slate-50/60 select-none cursor-default">
                                {result?.totalObtained ?? 0}
                              </td>
                              <td className="w-[75px] min-w-[75px] h-10 p-0 text-center font-mono tabular-nums text-xs font-semibold border-b border-l border-slate-200 bg-slate-50/60 select-none cursor-default">
                                {result ? `${result.percentage.toFixed(2)}%` : '0.00%'}
                              </td>
                              <td className="w-[65px] min-w-[65px] h-10 p-0 text-center font-mono tabular-nums text-xs font-bold border-b border-l border-slate-200 bg-slate-50/60 select-none cursor-default">
                                {result?.grade ?? 'E2'}
                              </td>
                              <td className="h-10 p-0 border-b border-l border-slate-200 bg-white focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-600 focus-within:z-10">
                                <div className="flex items-center h-10 w-full">
                                  <input
                                    ref={(el) => {
                                      remarkInputRefs.current[cellKey] = el;
                                    }}
                                    type="text"
                                    aria-label={`Class Teacher Remark for ${student.name}`}
                                    value={student.customRemarks || ''}
                                    placeholder="Enter class teacher remark..."
                                    onFocus={(e) => {
                                      setSelectedStudentId(student.id);
                                      ensureCellVisible(e.currentTarget);
                                    }}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      pushUndoSnapshot(students);
                                      const updated = students.map((s) =>
                                        s.id === student.id ? updateStudentClassRemark(s, val) : s
                                      );
                                      setStudents(updated);
                                      triggerAutoSync(updated);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const nextEl = remarkInputRefs.current[`rem-ct-${rowIdx + 1}`];
                                        if (nextEl) {
                                          nextEl.focus({ preventScroll: true });
                                          ensureCellVisible(nextEl);
                                        }
                                      } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        const prevEl = remarkInputRefs.current[`rem-ct-${rowIdx - 1}`];
                                        if (prevEl) {
                                          prevEl.focus({ preventScroll: true });
                                          ensureCellVisible(prevEl);
                                        }
                                      }
                                    }}
                                    className="flex-1 min-w-0 h-10 px-3 text-left text-xs text-slate-900 placeholder-slate-300 bg-transparent focus:outline-none"
                                  />
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                ) : selectedRemarkScope !== 'all' ? (
                  /* SINGLE SUBJECT TEACHER + CLASS TEACHER REMARKS VIEW */
                  <table className="w-full text-center text-xs border-separate border-spacing-0">
                    <thead
                      onMouseDown={(e) => handleHeaderDragStart(e, remarksScrollContainerRef.current)}
                      title="Click and drag header to scroll horizontally"
                      className={isHeaderDragging ? 'cursor-grabbing select-none' : 'cursor-grab select-none'}
                    >
                      <tr className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[11px] select-none h-11">
                        <th
                          onClick={() => toggleSort('rollNo')}
                          className="sticky left-0 z-30 bg-slate-50 py-2.5 px-1 w-12 min-w-[48px] max-w-[48px] text-center hover:bg-slate-100 transition-colors border-b border-r border-slate-200"
                        >
                          <div className="text-center font-bold">Roll</div>
                        </th>
                        <th
                          onClick={() => toggleSort('name')}
                          className="sticky left-[48px] z-30 bg-slate-50 py-2.5 px-3 w-[190px] min-w-[190px] max-w-[210px] text-center hover:bg-slate-100 transition-colors border-b border-r border-slate-200"
                        >
                          <div className="text-center font-bold">Student Name</div>
                        </th>
                        <th
                          onClick={() => toggleSort(selectedRemarkScope)}
                          className="py-2 px-2 text-center w-[80px] min-w-[80px] bg-slate-50 border-b border-l border-slate-200 hover:bg-slate-100 transition-colors"
                        >
                          <div className="text-center font-bold text-slate-800">{getSubjectHeaderLabel(selectedRemarkScope)}</div>
                          <div className="text-[10px] font-normal text-slate-400 mt-0.5">
                            {activeSubjects.find((s) => s.name === selectedRemarkScope)?.maxMarks ?? 100}
                          </div>
                        </th>
                        <th className="py-2 px-2 text-center w-[65px] min-w-[65px] bg-slate-50 border-b border-l border-slate-200">
                          <div className="text-center font-bold text-slate-800">Grade</div>
                        </th>
                        <th className="py-2.5 px-3 text-center w-full bg-slate-50 border-b border-l border-slate-200">
                          <div className="text-center font-bold text-slate-800">{getSubjectHeaderLabel(selectedRemarkScope)} Remark</div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedStudents.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-400 text-sm border-b border-slate-100">
                            No students matching your search criteria.
                          </td>
                        </tr>
                      ) : (
                        paginatedStudents.map((student, rowIdx) => {
                          const isSelectedForReport = student.id === selectedStudentId;
                          const markVal = student.marks[selectedRemarkScope];
                          const numMark = typeof markVal === 'number' ? markVal : 0;
                          const subMax =
                            activeSubjects.find((s) => s.name === selectedRemarkScope)?.maxMarks || 100;
                          const subGrade =
                            markVal === 'AB'
                              ? 'E2'
                              : markVal !== null && markVal !== undefined
                              ? computeGrade((numMark / subMax) * 100)
                              : '-';
                          const subCellKey = `rem-sub-${rowIdx}-${selectedRemarkScope}`;

                          return (
                            <tr
                              key={student.id}
                              onClick={() => setSelectedStudentId(student.id)}
                              className={`group/row transition-colors h-10 min-h-10 max-h-10 ${
                                isSelectedForReport
                                  ? 'bg-blue-50/70 text-slate-900'
                                  : 'hover:bg-slate-100/70 text-slate-800'
                              }`}
                            >
                              <td
                                className={`sticky left-0 z-10 h-10 p-0 text-center font-mono text-xs text-slate-700 w-12 min-w-[48px] max-w-[48px] border-b border-r border-slate-200 select-none cursor-default ${
                                  isSelectedForReport
                                    ? 'bg-blue-100 font-bold text-blue-950'
                                    : 'bg-white group-hover/row:bg-slate-100'
                                }`}
                              >
                                {student.rollNo}
                              </td>
                              <td
                                className={`sticky left-[48px] z-10 h-10 px-3 w-[190px] min-w-[190px] max-w-[210px] border-b border-r border-slate-200 ${
                                  isSelectedForReport
                                    ? 'bg-blue-100 font-semibold text-blue-950'
                                    : 'bg-white group-hover/row:bg-slate-100'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedStudentId(student.id);
                                    setActiveTab('reportcards');
                                  }}
                                  className="font-medium text-slate-900 hover:text-blue-600 transition-colors text-left flex items-center gap-1 truncate w-full cursor-pointer"
                                >
                                  <span className="truncate">{student.name}</span>
                                </button>
                              </td>
                              <td className="w-[80px] min-w-[80px] h-10 p-0 text-center font-mono tabular-nums text-xs font-bold border-b border-l border-slate-200 bg-slate-50/60 select-none cursor-default">
                                {markVal === null || markVal === undefined ? '-' : markVal}
                              </td>
                              <td className="w-[65px] min-w-[65px] h-10 p-0 text-center font-mono tabular-nums text-xs font-bold border-b border-l border-slate-200 bg-slate-50/60 select-none cursor-default">
                                {subGrade}
                              </td>
                              <td className="h-10 p-0 border-b border-l border-slate-200 bg-white focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-600 focus-within:z-10">
                                <div className="flex items-center h-10 w-full">
                                  <input
                                    ref={(el) => {
                                      remarkInputRefs.current[subCellKey] = el;
                                    }}
                                    type="text"
                                    aria-label={`${selectedRemarkScope} Teacher Remark for ${student.name}`}
                                    value={student.subjectRemarks?.[selectedRemarkScope] ?? ''}
                                    placeholder={`Enter ${selectedRemarkScope} remark...`}
                                    onFocus={(e) => {
                                      setSelectedStudentId(student.id);
                                      ensureCellVisible(e.currentTarget);
                                    }}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      pushUndoSnapshot(students);
                                      const updated = students.map((s) =>
                                        s.id === student.id
                                          ? updateStudentSubjectRemark(s, selectedRemarkScope, val)
                                          : s
                                      );
                                      setStudents(updated);
                                      triggerAutoSync(updated);
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                        e.preventDefault();
                                        const nextEl =
                                          remarkInputRefs.current[
                                            `rem-sub-${rowIdx + 1}-${selectedRemarkScope}`
                                          ];
                                        if (nextEl) {
                                          nextEl.focus({ preventScroll: true });
                                          ensureCellVisible(nextEl);
                                        }
                                      } else if (e.key === 'ArrowUp') {
                                        e.preventDefault();
                                        const prevEl =
                                          remarkInputRefs.current[
                                            `rem-sub-${rowIdx - 1}-${selectedRemarkScope}`
                                          ];
                                        if (prevEl) {
                                          prevEl.focus({ preventScroll: true });
                                          ensureCellVisible(prevEl);
                                        }
                                      }
                                    }}
                                    className="flex-1 min-w-0 h-10 px-3 text-left text-xs text-slate-900 placeholder-slate-300 bg-transparent focus:outline-none"
                                  />
                                </div>
                              </td>
                             </tr>
                           );
                         })
                      )}
                    </tbody>
                  </table>
                ) : (
                  /* ALL REMARKS CONSOLIDATED LEDGER (Class Teacher + All 7 Subjects) */
                  <table className="w-full text-center text-xs border-separate border-spacing-0">
                    <thead
                      onMouseDown={(e) => handleHeaderDragStart(e, remarksScrollContainerRef.current)}
                      title="Click and drag header to scroll horizontally"
                      className={isHeaderDragging ? 'cursor-grabbing select-none' : 'cursor-grab select-none'}
                    >
                      <tr className="sticky top-0 z-20 bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[11px] select-none h-11">
                        <th
                          onClick={() => toggleSort('rollNo')}
                          className="sticky left-0 z-30 bg-slate-50 py-2.5 px-1 w-12 min-w-[48px] max-w-[48px] text-center hover:bg-slate-100 transition-colors border-b border-r border-slate-200"
                        >
                          <div className="text-center font-bold">Roll</div>
                        </th>
                        <th
                          onClick={() => toggleSort('name')}
                          className="sticky left-[48px] z-30 bg-slate-50 py-2.5 px-3 w-[190px] min-w-[190px] max-w-[210px] text-center hover:bg-slate-100 transition-colors border-b border-r border-slate-200"
                        >
                          <div className="text-center font-bold">Student Name</div>
                        </th>
                        <th className="py-2.5 px-3 text-center min-w-[340px] bg-slate-50 border-b border-l border-slate-200">
                          <div className="text-center font-bold text-slate-800">Class Teacher Remark</div>
                        </th>
                        {activeSubjects.map((sub) => (
                          <th
                            key={sub.name}
                            className="py-2.5 px-3 text-center min-w-[310px] bg-slate-50 border-b border-l border-slate-200"
                          >
                            <div className="text-center font-bold text-slate-800">{getSubjectHeaderLabel(sub.name)} Remark</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedStudents.length === 0 ? (
                        <tr>
                          <td colSpan={activeSubjects.length + 3} className="py-12 text-center text-slate-400 text-sm border-b border-slate-100">
                            No students matching your search criteria.
                          </td>
                        </tr>
                      ) : (
                        paginatedStudents.map((student, rowIdx) => {
                          const isSelectedForReport = student.id === selectedStudentId;
                          const ctCellKey = `rem-all-ct-${rowIdx}`;

                          return (
                            <tr
                              key={student.id}
                              onClick={() => setSelectedStudentId(student.id)}
                              className={`group/row transition-colors h-10 min-h-10 max-h-10 ${
                                isSelectedForReport
                                  ? 'bg-blue-50/70 text-slate-900'
                                  : 'hover:bg-slate-100/70 text-slate-800'
                              }`}
                            >
                              <td
                                className={`sticky left-0 z-10 h-10 p-0 text-center font-mono text-xs text-slate-700 w-12 min-w-[48px] max-w-[48px] border-b border-r border-slate-200 select-none cursor-default ${
                                  isSelectedForReport
                                    ? 'bg-blue-100 font-bold text-blue-950'
                                    : 'bg-white group-hover/row:bg-slate-100'
                                }`}
                              >
                                {student.rollNo}
                              </td>
                              <td
                                className={`sticky left-[48px] z-10 h-10 px-3 w-[190px] min-w-[190px] max-w-[210px] border-b border-r border-slate-200 ${
                                  isSelectedForReport
                                    ? 'bg-blue-100 font-semibold text-blue-950'
                                    : 'bg-white group-hover/row:bg-slate-100'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedStudentId(student.id);
                                    setActiveTab('reportcards');
                                  }}
                                  className="font-medium text-slate-900 hover:text-blue-600 transition-colors text-left flex items-center gap-1 truncate w-full cursor-pointer"
                                >
                                  <span className="truncate">{student.name}</span>
                                </button>
                              </td>
                              {/* Class Teacher Remark Cell */}
                              <td className="min-w-[340px] h-10 p-0 border-b border-l border-slate-200 bg-white focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-600 focus-within:z-10">
                                <input
                                  ref={(el) => {
                                    remarkInputRefs.current[ctCellKey] = el;
                                  }}
                                  type="text"
                                  aria-label={`Class Teacher Remark for ${student.name}`}
                                  value={student.customRemarks || ''}
                                  placeholder="Class teacher remark..."
                                  onFocus={(e) => {
                                    setSelectedStudentId(student.id);
                                    ensureCellVisible(e.currentTarget);
                                  }}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    pushUndoSnapshot(students);
                                    const updated = students.map((s) =>
                                      s.id === student.id ? updateStudentClassRemark(s, val) : s
                                    );
                                    setStudents(updated);
                                    triggerAutoSync(updated);
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                      e.preventDefault();
                                      const nextEl = remarkInputRefs.current[`rem-all-ct-${rowIdx + 1}`];
                                      if (nextEl) {
                                        nextEl.focus({ preventScroll: true });
                                        ensureCellVisible(nextEl);
                                      }
                                    } else if (e.key === 'ArrowUp') {
                                      e.preventDefault();
                                      const prevEl = remarkInputRefs.current[`rem-all-ct-${rowIdx - 1}`];
                                      if (prevEl) {
                                        prevEl.focus({ preventScroll: true });
                                        ensureCellVisible(prevEl);
                                      }
                                    } else if (
                                      e.key === 'ArrowRight' &&
                                      e.currentTarget.selectionStart === e.currentTarget.value.length &&
                                      activeSubjects[0]
                                    ) {
                                      e.preventDefault();
                                      const rightEl =
                                        remarkInputRefs.current[`rem-all-${rowIdx}-${activeSubjects[0].name}`];
                                      if (rightEl) {
                                        rightEl.focus({ preventScroll: true });
                                        ensureCellVisible(rightEl);
                                      }
                                    }
                                  }}
                                  className="w-full h-10 px-2.5 text-left text-xs text-slate-900 placeholder-slate-300 bg-transparent focus:outline-none"
                                />
                              </td>
                              {/* 7 Subject Teacher Remark Cells */}
                              {activeSubjects.map((sub, subIdx) => {
                                const subKey = `rem-all-${rowIdx}-${sub.name}`;
                                const markVal = student.marks[sub.name];
                                return (
                                  <td
                                    key={sub.name}
                                    className="min-w-[310px] h-10 p-0 border-b border-l border-slate-200 bg-white focus-within:ring-2 focus-within:ring-inset focus-within:ring-blue-600 focus-within:z-10"
                                  >
                                    <div className="flex items-center h-10 w-full">
                                      <span className="ml-2 px-1.5 py-0.5 rounded bg-slate-100 font-mono text-[10px] font-semibold text-slate-600 shrink-0 select-none">
                                        {markVal ?? '-'}
                                      </span>
                                      <input
                                        ref={(el) => {
                                          remarkInputRefs.current[subKey] = el;
                                        }}
                                        type="text"
                                        aria-label={`${sub.name} Teacher Remark for ${student.name}`}
                                        value={student.subjectRemarks?.[sub.name] ?? ''}
                                        placeholder={`${getSubjectHeaderLabel(sub.name)} remark...`}
                                        onFocus={(e) => {
                                          setSelectedStudentId(student.id);
                                          ensureCellVisible(e.currentTarget);
                                        }}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          pushUndoSnapshot(students);
                                          const updated = students.map((s) =>
                                            s.id === student.id
                                              ? updateStudentSubjectRemark(s, sub.name, val)
                                              : s
                                          );
                                          setStudents(updated);
                                          triggerAutoSync(updated);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === 'ArrowDown') {
                                            e.preventDefault();
                                            const nextEl =
                                              remarkInputRefs.current[`rem-all-${rowIdx + 1}-${sub.name}`];
                                            if (nextEl) {
                                              nextEl.focus({ preventScroll: true });
                                              ensureCellVisible(nextEl);
                                            }
                                          } else if (e.key === 'ArrowUp') {
                                            e.preventDefault();
                                            const prevEl =
                                              remarkInputRefs.current[`rem-all-${rowIdx - 1}-${sub.name}`];
                                            if (prevEl) {
                                              prevEl.focus({ preventScroll: true });
                                              ensureCellVisible(prevEl);
                                            }
                                          } else if (
                                            e.key === 'ArrowLeft' &&
                                            e.currentTarget.selectionStart === 0
                                          ) {
                                            e.preventDefault();
                                            const leftEl =
                                              subIdx === 0
                                                ? remarkInputRefs.current[`rem-all-ct-${rowIdx}`]
                                                : remarkInputRefs.current[
                                                    `rem-all-${rowIdx}-${activeSubjects[subIdx - 1].name}`
                                                  ];
                                            if (leftEl) {
                                              leftEl.focus({ preventScroll: true });
                                              ensureCellVisible(leftEl);
                                            }
                                          } else if (
                                            e.key === 'ArrowRight' &&
                                            e.currentTarget.selectionStart === e.currentTarget.value.length &&
                                            subIdx < activeSubjects.length - 1
                                          ) {
                                            e.preventDefault();
                                            const rightEl =
                                              remarkInputRefs.current[
                                                `rem-all-${rowIdx}-${activeSubjects[subIdx + 1].name}`
                                              ];
                                            if (rightEl) {
                                              rightEl.focus({ preventScroll: true });
                                              ensureCellVisible(rightEl);
                                            }
                                          }
                                        }}
                                        className="flex-1 h-10 px-2 text-left text-xs text-slate-900 placeholder-slate-300 bg-transparent focus:outline-none"
                                      />
                                    </div>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            VIEW 2: REPORT CARD GENERATION (Official Luxury Certificate)
           ======================================================== */}
        {activeTab === 'reportcards' && (
          <div className="flex-1 flex flex-col gap-4">
            {/* Page Header Strip */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Student Report Cards
                </h1>
                <p className="text-xs text-slate-500 mt-0.5 font-normal">
                  Preview each student&apos;s report card before printing, or download PDFs for a single student, a whole class, or the entire school.
                </p>
              </div>

              {/* Actions & Zoom Controls */}
              <div className="flex items-center flex-wrap gap-2">
                {/* Zoom Buttons */}
                <div className="hidden md:flex items-center bg-slate-100/90 p-0.5 rounded-lg border border-slate-200/60 text-xs">
                  <button
                    onClick={() => setReportZoom('80%')}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      reportZoom === '80%' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    80%
                  </button>
                  <button
                    onClick={() => setReportZoom('90%')}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      reportZoom === '90%' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    90%
                  </button>
                  <button
                    onClick={() => setReportZoom('100%')}
                    className={`px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                      reportZoom === '100%' ? 'bg-white text-slate-900 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    100%
                  </button>
                </div>

                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-2xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Print</span>
                </button>
                <button
                  onClick={handleDownloadPDF}
                  disabled={isExporting}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Single Student PDF</span>
                </button>
                <button
                  onClick={() => {
                    setIsExporting(true);
                    showToast(`Generating Class PDF for ${processedStudents.length} student report cards...`);
                    setTimeout(() => {
                      const filteredResults = computedResults
                        .filter((r) => (selectedClass === 'all' ? true : r.student.section === selectedClass))
                        .sort((a, b) => (parseInt(a.student.rollNo, 10) || 0) - (parseInt(b.student.rollNo, 10) || 0));
                      downloadAllReportCardsSinglePDF(
                        { ...SVA_EXAM_INFO, examName: currentExamConfig.name, examCode: selectedExam },
                        filteredResults,
                        `Class_PDF_${selectedClass === 'all' ? 'AllClasses' : selectedClass}_${selectedExam}`
                      );
                      setIsExporting(false);
                      showToast(`Downloaded Class PDF for ${filteredResults.length} students!`);
                    }, 100);
                  }}
                  disabled={isExporting}
                  title="Download all student report cards in ONE multi-page PDF document for current class division"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Class PDF</span>
                </button>
                <button
                  onClick={() => {
                    setIsExporting(true);
                    showToast('Generating School PDF for all 280 student report cards...');
                    setTimeout(() => {
                      downloadAllReportCardsSinglePDF(
                        { ...SVA_EXAM_INFO, examName: currentExamConfig.name, examCode: selectedExam },
                        computedResults,
                        `SVA_School_All_Report_Cards_${selectedExam}.pdf`
                      );
                      setIsExporting(false);
                      showToast('Downloaded School PDF for all students!');
                    }, 100);
                  }}
                  disabled={isExporting}
                  title="Download report cards for ALL 280 students across all 8 classes in 1 combined multi-page PDF"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>{isExporting ? 'Compiling School PDF...' : 'School PDF'}</span>
                </button>
                <button
                  onClick={() => handleDownloadClassZip(false)}
                  disabled={isExporting}
                  title="Download report cards as individual PDFs in a ZIP archive"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5 text-slate-500" />
                  <span>Download ZIP</span>
                </button>
              </div>
            </div>

            {/* Two-Column Studio Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left Column: Exam & Class Filter, Student Selector (3 columns) */}
              <div className="lg:col-span-3 flex flex-col gap-4">
                {/* Exam, Class & Student Selector Card */}
                <div className="bg-white border border-slate-200/80 rounded-xl shadow-2xs p-3.5 flex flex-col gap-3">
                  {/* Exam Selector Dropdown */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide block mb-1">
                      Select Examination:
                    </label>
                    <CustomSelect
                      id="reportcard-exam-select"
                      fullWidth
                      icon={<BookOpen className="w-3.5 h-3.5 text-slate-400" />}
                      prefixLabel="Exam:"
                      value={selectedExam}
                      onChange={(val) => handleExamChange(val)}
                      options={Object.values(examConfigs).map((ex) => ({
                        value: ex.id,
                        label: ex.code || ex.id,
                      }))}
                    />
                  </div>

                  {/* Class Filter Dropdown */}
                  <div>
                    <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wide block mb-1">
                      Filter by Class ({SVA_ALL_CLASSES.length} Classes):
                    </label>
                    <CustomSelect
                      id="reportcard-class-select"
                      fullWidth
                      icon={<Layers className="w-3.5 h-3.5 text-slate-400" />}
                      prefixLabel="Class:"
                      value={selectedClass}
                      onChange={(val) => {
                        setSelectedClass(val);
                        setExportClass(val);
                      }}
                      options={[
                        { value: 'all', label: `All Classes (${students.length} Students)` },
                        ...SVA_ALL_CLASSES.map((cls) => ({
                          value: cls,
                          label: `${getClassGradeLabel(cls)} (${classCounts[cls] || 0} Students)`,
                        })),
                      ]}
                    />
                  </div>

                  {/* Student Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Filter student..."
                      className="w-full pl-8 pr-7 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-900"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100">
                    <span className="text-xs font-semibold text-slate-900 uppercase tracking-wide">
                      Select Student ({processedStudents.length})
                    </span>
                    <button
                      onClick={() => setActiveTab('spreadsheet')}
                      className="text-xs text-blue-600 hover:underline cursor-pointer"
                    >
                      Edit marks →
                    </button>
                  </div>

                  {/* Student List - Strictly Roll Number Wise */}
                  <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1">
                    {[...processedStudents]
                      .sort((a, b) => (parseInt(a.rollNo, 10) || 0) - (parseInt(b.rollNo, 10) || 0))
                      .map((stu) => {
                        const res = computedResultsMap.get(stu.id);
                        const isSelected = stu.id === selectedStudentId;

                        return (
                          <button
                            key={stu.id}
                            onClick={() => setSelectedStudentId(stu.id)}
                            className={`w-full text-left p-2 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer ${
                              isSelected
                                ? 'bg-blue-50 text-slate-900 font-semibold border border-blue-200/80 shadow-2xs'
                                : 'hover:bg-slate-100 text-slate-800 border border-transparent'
                            }`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span
                                className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] shrink-0 ${
                                  isSelected
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {stu.rollNo}
                              </span>
                              <div className="truncate font-medium">{stu.name}</div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] opacity-70">
                                {getClassGradeLabel(stu.section)}
                              </span>
                              <span
                                className={`font-mono tabular-nums text-[11px] ${
                                  isSelected ? 'text-blue-700 font-semibold' : 'text-slate-500'
                                }`}
                              >
                                {res ? `${res.percentage.toFixed(2)}%` : '-'}
                              </span>
                              <span
                                className={`font-semibold font-mono text-[11px] ${
                                  isSelected ? 'text-emerald-700' : 'text-emerald-700'
                                }`}
                              >
                                {res?.grade ?? ''}
                              </span>
                            </div>
                          </button>
                        );
                      })}
                  </div>

                  {/* Keyboard hint */}
                  <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-100 text-center">
                    Use <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">[</kbd> and <kbd className="px-1 py-0.5 bg-slate-100 rounded text-slate-600 font-mono">]</kbd> keys to cycle through students
                  </div>
                </div>

              </div>

              {/* Right Column: Report Card Preview (9 columns) */}
              <div className="lg:col-span-9 flex flex-col items-center">
                {/* Navigation Bar Above Report Card */}
                <div className="w-full max-w-[794px] flex items-center justify-between pb-3 text-xs text-slate-500">
                  <button
                    onClick={handlePrevStudent}
                    className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>
                  <span className="text-slate-700 font-medium">
                    Student {currentStudentIndex + 1} of {processedStudents.length} ({activeStudentResult?.student.section}) · {selectedExam}
                  </span>
                  <button
                    onClick={handleNextStudent}
                    className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors"
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {activeStudentResult && isPtExam(selectedExam) ? (() => {
                  const ptProfile = getStudentPtProfile(activeStudentResult.student);
                  const includeCsInPt = hasCsInPtExam(
                    activeStudentResult.student.section || activeStudentResult.student.class
                  );
                  const ptSubjects = activeStudentResult.subjectDetails.filter((d) => {
                    if (includeCsInPt) return true;
                    const lower = d.name.trim().toLowerCase();
                    return lower !== 'computer science' && lower !== 'cs';
                  });
                  const ptHeading = getPtExamHeading(selectedExam);
                  const ptPctStr = formatPtPercentage(
                    activeStudentResult.totalObtained,
                    activeStudentResult.totalMax
                  );
                  const ctRemark =
                    activeStudentResult.student.customRemarks ||
                    getDefaultClassTeacherRemark(
                      activeStudentResult.percentage,
                      activeStudentResult.status
                    );

                  return (
                    <div
                      style={{
                        transform:
                          reportZoom === '80%'
                            ? 'scale(0.8)'
                            : reportZoom === '90%'
                            ? 'scale(0.9)'
                            : 'scale(1)',
                        transformOrigin: 'top center',
                        transition: 'transform 0.2s ease',
                        fontFamily: "'Aptos', 'Calibri', 'Segoe UI', sans-serif",
                      }}
                      id="report-card-print-area"
                      className="printable-report-card w-full max-w-[794px] flex flex-col gap-6 font-aptos text-black"
                    >
                      {/* =========================================================
                          PAGE 1: EXACT PT REPORT CARD (MATCHING SAMPLE PDF)
                         ========================================================= */}
                      <div
                        data-testid="pt-report-card-page-1"
                        className="w-full bg-white border border-slate-300 shadow-xl px-12 pt-8 pb-14 text-black font-aptos"
                        style={{ minHeight: '1040px' }}
                      >
                        {/* Header with Crest on Left and School Identity Centered */}
                        <div className="relative pb-2.5 border-b-[1.5px] border-black text-center">
                          <div className="absolute left-4 top-0.5">
                            <Image
                              src={SCHOOL_LOGO_SRC}
                              alt="Saraswati Vidya Academy Crest"
                              width={68}
                              height={68}
                              className="w-[54px] h-[54px] object-contain"
                              priority
                            />
                          </div>
                          <div className="pl-10">
                            <h2
                              data-testid="pt-school-name-heading"
                              className="font-rockwell-eb text-[33.5px] leading-[1.12] tracking-normal text-[#27457B] whitespace-nowrap"
                              style={{
                                fontFamily: "'Rockwell Extra Bold', 'Rockwell', Georgia, serif",
                                fontWeight: 800,
                                fontSynthesis: 'none',
                              }}
                            >
                              {SVA_EXAM_INFO.schoolName}
                            </h2>
                            <p
                              className="text-[11.25px] font-bold text-black mt-0.5 leading-snug"
                              style={{
                                fontFamily: "'Montserrat', 'Aptos', 'Calibri', sans-serif",
                                fontWeight: 700,
                              }}
                            >
                              CBSE Affiliation No. {SVA_EXAM_INFO.affiliationNo}, School Code. {SVA_EXAM_INFO.schoolCode}, UDISE No. {SVA_EXAM_INFO.udiseNo}
                            </p>
                            <p
                              className="text-[14.5px] font-normal text-black leading-snug"
                              style={{
                                fontFamily: "'Calibri', 'Aptos', sans-serif",
                              }}
                            >
                              Address: {SVA_EXAM_INFO.schoolAddress}
                            </p>
                            <p
                              className="text-[14.5px] font-normal text-black leading-snug"
                              style={{
                                fontFamily: "'Calibri', 'Aptos', sans-serif",
                              }}
                            >
                              Email Id:{' '}
                              <a
                                href={`mailto:${SVA_EXAM_INFO.schoolEmail}`}
                                className="text-[#0000FF] underline"
                              >
                                {SVA_EXAM_INFO.schoolEmail}
                              </a>
                            </p>
                          </div>
                        </div>

                        {/* REPORT CARD BODY BELOW HEADER: APTOS FONT SIZE 12 */}
                        <div
                          data-testid="pt-report-card-body"
                          className="font-aptos text-[12px] text-black"
                          style={{
                            fontFamily: "'Aptos', 'Carlito', 'Calibri', 'Segoe UI', sans-serif",
                            fontSize: '12px',
                            fontWeight: 400,
                            WebkitTextStroke: '0.35px currentColor',
                          }}
                        >
                          {/* REPORT CARD & PERIODIC TEST - X Titles */}
                          <div className="text-center mt-2.5 mb-2.5">
                            <div className="text-[12px] font-bold font-aptos uppercase tracking-normal text-black leading-snug">
                              REPORT CARD
                            </div>
                            <div
                              data-testid="pt-report-card-heading"
                              className="text-[12px] font-bold font-aptos uppercase tracking-normal text-black leading-snug mt-0.5"
                            >
                              {ptHeading}
                            </div>
                          </div>

                          {/* Table 1: Student Particulars Box (10-column double-bordered framed table) */}
                          <table
                            data-testid="pt-student-particulars-table"
                            className="w-full text-[12px] font-bold font-aptos text-black border border-black mb-5"
                            style={{
                              borderCollapse: 'separate',
                              borderSpacing: '1.5px',
                              fontFamily: "'Aptos', 'Carlito', 'Calibri', 'Segoe UI', sans-serif",
                              fontSize: '12px',
                            }}
                          >
                            <colgroup>
                              <col style={{ width: '11.5%' }} />
                              <col style={{ width: '14.0%' }} />
                              <col style={{ width: '15.0%' }} />
                              <col style={{ width: '3.0%' }} />
                              <col style={{ width: '11.0%' }} />
                              <col style={{ width: '8.0%' }} />
                              <col style={{ width: '7.0%' }} />
                              <col style={{ width: '6.0%' }} />
                              <col style={{ width: '8.0%' }} />
                              <col style={{ width: '16.5%' }} />
                            </colgroup>
                            <tbody>
                              <tr>
                                <td className="border border-black px-2 py-1 text-left whitespace-nowrap">
                                  Roll No.
                                </td>
                                <td className="border border-black px-2 py-1 text-left">
                                  {ptProfile.rollNoDisplay}
                                </td>
                                <td
                                  colSpan={2}
                                  className="border border-black px-2 py-1 text-left whitespace-nowrap"
                                >
                                  Class &amp; Section:
                                </td>
                                <td
                                  colSpan={3}
                                  className="border border-black px-2 py-1 text-left whitespace-nowrap"
                                >
                                  {ptProfile.classSectionDisplay}
                                </td>
                                <td
                                  colSpan={2}
                                  className="border border-black px-2 py-1 text-left whitespace-nowrap"
                                >
                                  DOB:
                                </td>
                                <td className="border border-black px-2 py-1 text-left whitespace-nowrap">
                                  {ptProfile.dobDisplay}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  colSpan={2}
                                  className="border border-black px-2 py-1 text-left whitespace-nowrap"
                                >
                                  Name of the Student:
                                </td>
                                <td colSpan={8} className="border border-black px-2 py-1 text-left">
                                  {activeStudentResult.student.name}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  colSpan={2}
                                  className="border border-black px-2 py-1 text-left whitespace-nowrap"
                                >
                                  Father’s Name:
                                </td>
                                <td colSpan={8} className="border border-black px-2 py-1 text-left">
                                  {ptProfile.fatherNameDisplay}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  colSpan={2}
                                  className="border border-black px-2 py-1 text-left whitespace-nowrap"
                                >
                                  Mother’s Name:
                                </td>
                                <td colSpan={8} className="border border-black px-2 py-1 text-left">
                                  {ptProfile.motherNameDisplay}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  colSpan={2}
                                  className="border border-black px-2 py-1 text-left whitespace-nowrap"
                                >
                                  House:
                                </td>
                                <td className="border border-black px-2 py-1 text-left whitespace-nowrap">
                                  {ptProfile.house}
                                </td>
                                <td
                                  colSpan={2}
                                  className="border border-black px-2 py-1 text-left whitespace-nowrap"
                                >
                                  Height:
                                </td>
                                <td
                                  colSpan={2}
                                  className="border border-black px-2 py-1 text-left whitespace-nowrap"
                                >
                                  {ptProfile.height}
                                </td>
                                <td
                                  colSpan={2}
                                  className="border border-black px-2 py-1 text-left whitespace-nowrap"
                                >
                                  Weight:
                                </td>
                                <td className="border border-black px-2 py-1 text-left whitespace-nowrap">
                                  {ptProfile.weight}
                                </td>
                              </tr>
                              <tr>
                                <td
                                  colSpan={2}
                                  className="border border-black px-2 py-1 text-left whitespace-nowrap"
                                >
                                  Attendance:
                                </td>
                                <td colSpan={8} className="border border-black px-4 py-1 text-left">
                                  {ptProfile.attendance}
                                </td>
                              </tr>
                            </tbody>
                          </table>

                          {/* Table 2: Subject Marks Table (6 subjects for Classes 6-8; 7 subjects with CS for Class 9) */}
                          <table
                            data-testid="pt-subjects-table"
                            className="w-full text-[12px] font-bold font-aptos text-black border border-black mb-7"
                            style={{
                              borderCollapse: 'separate',
                              borderSpacing: '1.5px',
                              fontFamily: "'Aptos', 'Carlito', 'Calibri', 'Segoe UI', sans-serif",
                              fontSize: '12px',
                            }}
                          >
                            <colgroup>
                              <col style={{ width: '10%' }} />
                              <col style={{ width: '26%' }} />
                              <col style={{ width: '14%' }} />
                              <col style={{ width: '50%' }} />
                            </colgroup>
                            <thead>
                              <tr>
                                <th className="border border-black px-2 py-1 text-center align-middle leading-tight whitespace-nowrap">
                                  <div>SL.</div>
                                  <div>NO.</div>
                                </th>
                                <th className="border border-black px-2 py-1.5 text-center align-middle whitespace-nowrap">
                                  NAME OF THE SUBJECT
                                </th>
                                <th className="border border-black px-2 py-1 text-center align-middle leading-tight whitespace-nowrap">
                                  <div>MARKS</div>
                                  <div>OBTAINED</div>
                                </th>
                                <th className="border border-black px-2 py-1.5 text-center align-top whitespace-nowrap">
                                  REMARKS
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {ptSubjects.map((detail, idx) => {
                                const markStr =
                                  detail.obtained === 'AB'
                                    ? 'AB'
                                    : detail.obtained !== null && detail.obtained !== undefined
                                    ? String(detail.obtained)
                                    : '-';
                                const remarkText =
                                  detail.remark ||
                                  getDefaultSubjectRemark(detail.obtained, detail.maxMarks);

                                return (
                                  <tr key={detail.name}>
                                    <td className="border border-black px-2 py-1.5 text-center align-middle font-bold">
                                      {idx + 1}
                                    </td>
                                    <td className="border border-black px-2 py-1.5 text-center align-middle whitespace-nowrap font-bold">
                                      {getPtSubjectDisplayName(detail.name)}
                                    </td>
                                    <td className="border border-black px-2 py-1.5 text-center align-middle font-bold">
                                      {markStr}
                                    </td>
                                    <td className="border border-black px-2.5 py-1.5 text-left align-middle font-bold">
                                      {remarkText}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>

                          {/* Table 3: Summary Strip (TOTAL, PERCENTAGE, GRADE) */}
                          <table
                            data-testid="pt-summary-table"
                            className="w-full text-[12px] font-bold font-aptos text-black border border-black mb-6"
                            style={{
                              borderCollapse: 'separate',
                              borderSpacing: '1.5px',
                              fontFamily: "'Aptos', 'Carlito', 'Calibri', 'Segoe UI', sans-serif",
                              fontSize: '12px',
                            }}
                          >
                            <colgroup>
                              <col style={{ width: '14%' }} />
                              <col style={{ width: '13%' }} />
                              <col style={{ width: '19%' }} />
                              <col style={{ width: '24%' }} />
                              <col style={{ width: '16%' }} />
                              <col style={{ width: '14%' }} />
                            </colgroup>
                            <tbody>
                              <tr>
                                <td className="border border-black px-2 py-1 text-left whitespace-nowrap">
                                  TOTAL:
                                </td>
                                <td className="border border-black px-2 py-1 text-center whitespace-nowrap">
                                  {activeStudentResult.totalObtained}/{activeStudentResult.totalMax}
                                </td>
                                <td className="border border-black px-2 py-1 text-center whitespace-nowrap">
                                  PERCENTAGE:
                                </td>
                                <td className="border border-black px-2 py-1 text-center whitespace-nowrap">
                                  {ptPctStr}
                                </td>
                                <td className="border border-black px-2 py-1 text-left whitespace-nowrap">
                                  GRADE:
                                </td>
                                <td className="border border-black px-2 py-1 text-center whitespace-nowrap">
                                  {activeStudentResult.grade}
                                </td>
                              </tr>
                            </tbody>
                          </table>

                          {/* Table 4: Class Teacher's Remarks Box */}
                          <table
                            data-testid="pt-remarks-table"
                            className="w-full text-[12px] font-bold font-aptos text-black border border-black"
                            style={{
                              borderCollapse: 'separate',
                              borderSpacing: '1.5px',
                              fontFamily: "'Aptos', 'Carlito', 'Calibri', 'Segoe UI', sans-serif",
                              fontSize: '12px',
                            }}
                          >
                            <colgroup>
                              <col style={{ width: '33%' }} />
                              <col style={{ width: '67%' }} />
                            </colgroup>
                            <tbody>
                              <tr>
                                <td className="border border-black px-2 py-2.5 text-left align-middle whitespace-nowrap">
                                  CLASS TEACHER’S REMARKS:
                                </td>
                                <td className="border border-black px-2.5 py-1.5 text-left align-middle leading-snug">
                                  {ctRemark}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* =========================================================
                          PAGE 2: GRADING SYSTEM & SIGNATURES (MATCHING SAMPLE PDF)
                         ========================================================= */}
                      <div
                        data-testid="pt-report-card-page-2"
                        className="w-full bg-white border border-slate-300 shadow-xl px-12 pt-11 pb-20 text-black font-aptos text-[12px]"
                        style={{
                          minHeight: '960px',
                          pageBreakBefore: 'always',
                          fontFamily: "'Aptos', 'Carlito', 'Calibri', 'Segoe UI', sans-serif",
                          fontSize: '12px',
                          fontWeight: 400,
                          WebkitTextStroke: '0.35px currentColor',
                        }}
                      >
                        {/* Centered Grading System Table */}
                        <div className="flex justify-center">
                          <table
                            data-testid="pt-grading-system-table"
                            className="w-[310px] text-[12px] font-bold font-aptos text-black border border-black"
                            style={{
                              borderCollapse: 'separate',
                              borderSpacing: '1.5px',
                              fontFamily: "'Aptos', 'Carlito', 'Calibri', 'Segoe UI', sans-serif",
                              fontSize: '12px',
                            }}
                          >
                            <colgroup>
                              <col style={{ width: '58%' }} />
                              <col style={{ width: '42%' }} />
                            </colgroup>
                            <thead>
                              <tr>
                                <th colSpan={2} className="border border-black px-2 py-0.5 text-center">
                                  Grading System
                                </th>
                              </tr>
                              <tr>
                                <th className="border border-black px-2 py-0.5 text-center">
                                  Range of Marks
                                </th>
                                <th className="border border-black px-2 py-0.5 text-center">
                                  Grade
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {REPORT_CARD_GRADING_SYSTEM.map((row) => (
                                <tr key={row.grade}>
                                  <td className="border border-black px-2 py-0.5 text-center">
                                    {row.range}
                                  </td>
                                  <td className="border border-black px-2 py-0.5 text-center">
                                    {row.grade}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Signatures Row - Symmetrically spaced across left, exact center, and right margins */}
                        <div
                          data-testid="pt-signatures-row"
                          className="grid grid-cols-3 items-start w-full px-5 mt-32 text-center text-[12px] font-bold font-aptos text-black leading-snug"
                          style={{
                            fontFamily: "'Aptos', 'Carlito', 'Calibri', 'Segoe UI', sans-serif",
                            fontSize: '12px',
                          }}
                        >
                          <div className="justify-self-start text-center">
                            <div>Signature of</div>
                            <div>Class Teacher</div>
                          </div>
                          <div className="justify-self-center text-center">
                            <div>Signature of</div>
                            <div>Principal with Seal</div>
                          </div>
                          <div className="justify-self-end text-center">
                            <div>Signature of</div>
                            <div>Parent / Guardian</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })() : activeStudentResult ? (
                  <div
                    style={{
                      transform: reportZoom === '80%' ? 'scale(0.8)' : reportZoom === '90%' ? 'scale(0.9)' : 'scale(1)',
                      transformOrigin: 'top center',
                      transition: 'transform 0.2s ease',
                      fontFamily: "'Aptos', 'Carlito', 'Calibri', 'Segoe UI', sans-serif",
                    }}
                    id="report-card-print-area"
                    className="printable-report-card w-full max-w-[780px] bg-white border-2 border-slate-900 p-8 shadow-xl rounded-sm font-aptos text-slate-900 relative"
                  >
                    {/* Official SVA Header - Direct Image without enclosing div */}
                    <div className="flex flex-col items-center text-center pb-4 border-b border-slate-200">
                      <Image
                        src={SCHOOL_LOGO_SRC}
                        alt="Saraswati Vidya Academy Crest"
                        width={72}
                        height={72}
                        className="w-[72px] h-[72px] object-contain mb-2"
                        priority
                      />
                      <h2
                        className="font-rockwell-eb text-[33.5px] leading-[1.12] tracking-normal text-[#27457B]"
                        style={{
                          fontFamily: "'Rockwell Extra Bold', 'Rockwell', Georgia, serif",
                          fontWeight: 800,
                          fontSynthesis: 'none',
                        }}
                      >
                        {SVA_EXAM_INFO.schoolName}
                      </h2>
                      <p className="text-[11px] text-slate-500 max-w-md mt-0.5">
                        {SVA_EXAM_INFO.schoolAddress}
                      </p>
                      <div className="text-[11px] text-slate-500 mt-1 flex items-center justify-center gap-2">
                        <span>CBSE Affiliation No. {SVA_EXAM_INFO.affiliationNo}</span>
                        <span>·</span>
                        <span>School Code. {SVA_EXAM_INFO.schoolCode}</span>
                        <span>·</span>
                        <span>UDISE No. {SVA_EXAM_INFO.udiseNo}</span>
                      </div>
                      <div className="mt-2.5 inline-flex items-center gap-2 border-y border-slate-900/30 py-1 px-5 text-xs font-semibold tracking-widest uppercase text-slate-800">
                        <span>{currentExamConfig.name || 'Progress Report Card'}</span>
                        <span>·</span>
                        <span className="font-normal text-slate-600">Session {SVA_EXAM_INFO.academicSession}</span>
                      </div>
                    </div>

                    {/* SA Report Card Body Below Header: Aptos Font Size 12 */}
                    <div
                      data-testid="sa-report-card-body"
                      className="font-aptos text-[12px]"
                      style={{
                        fontFamily: "'Aptos', 'Carlito', 'Calibri', 'Segoe UI', sans-serif",
                        fontSize: '12px',
                      }}
                    >
                      {/* Student Particulars Grid with Avatar Placeholder */}
                      <div className="flex items-center gap-4 py-4 border-b border-slate-200 text-[12px]">
                        {/* Avatar / Photo Box */}
                        <div className="w-16 h-20 border border-slate-300 rounded bg-slate-50 flex flex-col items-center justify-center shrink-0 text-slate-400">
                          <div className="text-[12px] font-bold text-slate-700">
                            {activeStudentResult.student.rollNo}
                          </div>
                          <div className="text-[12px] text-slate-400">Photo</div>
                        </div>

                        {/* Information Columns */}
                        <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1 text-[12px]">
                          <div>
                            <span className="text-slate-500 font-medium">Student Name:</span>{' '}
                            <strong className="font-bold text-slate-900">
                              {activeStudentResult.student.name}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-500 font-medium">Class &amp; Section:</span>{' '}
                            <strong className="font-semibold text-slate-900">
                              {activeStudentResult.student.class} - {activeStudentResult.student.section}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-500 font-medium">Roll Number:</span>{' '}
                            <span className="font-bold text-slate-900">
                              {activeStudentResult.student.rollNo}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-medium">Date of Birth:</span>{' '}
                            <span className="text-slate-800">
                              {activeStudentResult.student.dob || '2010-01-01'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-500 font-medium">Parents:</span>{' '}
                            <span className="text-slate-800">
                              {activeStudentResult.student.fatherName} &amp; {activeStudentResult.student.motherName}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Scholastic Marks Table */}
                      <div className="pt-4">
                        <div className="text-[12px] font-bold text-slate-900 uppercase tracking-wide mb-2 flex items-center justify-between">
                          <span>Part 1: Scholastic Assessment</span>
                          <span className="text-[12px] font-normal text-slate-500">
                            Internal Assessment + Written Examination (Max 100)
                          </span>
                        </div>
                        <table className="w-full text-[12px] border border-slate-300 border-collapse font-aptos">
                          <thead>
                            <tr className="bg-slate-100 text-slate-800 font-semibold border-b border-slate-300">
                              <th className="py-2 px-2.5 text-left">Subject</th>
                              {(selectedExam === 'SA-1' || selectedExam === 'SA-2') && (
                                <>
                                  <th className="py-2 px-2 text-center w-24 bg-blue-50/50">Internal</th>
                                  <th className="py-2 px-2 text-center w-20">Exam</th>
                                </>
                              )}
                              <th className="py-2 px-1.5 text-center w-14">Max</th>
                              <th className="py-2 px-1.5 text-center w-14">Pass</th>
                              <th className="py-2 px-2 text-center w-20">Obtained</th>
                              <th className="py-2 px-1.5 text-center w-14">Grade</th>
                              <th className="py-2 px-2.5 text-center">Remark</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {activeStudentResult.subjectDetails.map((detail) => {
                              const bd = detail.breakdown;
                              const isClass9 = isClass9Section(activeStudentResult.student.section);
                              const isHindi = detail.name.toLowerCase() === 'hindi';

                              let internalLabel = '-';
                              let writtenLabel = '-';

                              if (bd) {
                                if (isClass9 && isHindi) {
                                  const list = typeof bd.listening === 'number' ? bd.listening : 0;
                                  const spk = typeof bd.speaking === 'number' ? bd.speaking : 0;
                                  const prj = typeof bd.project === 'number' ? bd.project : 0;
                                  const intTot = list + spk + prj;
                                  internalLabel = `${intTot}/55`;
                                  writtenLabel = `${bd.saExam ?? '-'}/45`;
                                } else {
                                  const pp = typeof bd.penPaper === 'number' ? bd.penPaper : 0;
                                  const ma = typeof bd.multipleAssessment === 'number' ? bd.multipleAssessment : 0;
                                  const se = typeof bd.subjectEnrichment === 'number' ? bd.subjectEnrichment : 0;
                                  const pf = typeof bd.portfolio === 'number' ? bd.portfolio : 0;
                                  const intTot =
                                    bd.internalMarks !== undefined && bd.internalMarks !== null
                                      ? bd.internalMarks
                                      : pp + ma + se + pf;
                                  internalLabel = `${intTot}/20`;
                                  writtenLabel = `${bd.writtenExam ?? '-'}/80`;
                                }
                              }

                              return (
                                <tr key={detail.name} className="hover:bg-slate-50/50">
                                  <td className="py-1.5 px-2.5 font-medium text-slate-900">
                                    {detail.name}
                                    {isClass9 && isHindi && (
                                      <span className="ml-1 text-[12px] text-blue-700 bg-blue-50 px-1 py-0.2 rounded font-normal">
                                        L+S+P+SA
                                      </span>
                                    )}
                                  </td>
                                  {(selectedExam === 'SA-1' || selectedExam === 'SA-2') && (
                                    <>
                                      <td className="py-1.5 px-2 text-center text-[12px] text-slate-700 bg-blue-50/30">
                                        {internalLabel}
                                      </td>
                                      <td className="py-1.5 px-2 text-center text-[12px] text-slate-700">
                                        {writtenLabel}
                                      </td>
                                    </>
                                  )}
                                  <td className="py-1.5 px-1.5 text-center text-slate-600">
                                    {detail.maxMarks}
                                  </td>
                                  <td className="py-1.5 px-1.5 text-center text-slate-600">
                                    {detail.passMarks}
                                  </td>
                                  <td className="py-1.5 px-2 text-center font-bold text-slate-900">
                                    {detail.obtained === 'AB' ? (
                                      <span className="text-rose-600">AB</span>
                                    ) : detail.obtained !== null ? (
                                      detail.obtained
                                    ) : (
                                      '-'
                                    )}
                                  </td>
                                  <td className="py-1.5 px-1.5 text-center font-semibold text-slate-800">
                                    {detail.grade}
                                  </td>
                                  <td className="py-1.5 px-2.5 text-left text-[12px] text-slate-600 italic">
                                    {detail.remark || getDefaultSubjectRemark(detail.obtained, detail.maxMarks)}
                                  </td>
                                </tr>
                              );
                            })}

                            {/* Grand Total Row */}
                            <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                              <td className="py-2 px-2.5 text-slate-900">Grand Total</td>
                              {(selectedExam === 'SA-1' || selectedExam === 'SA-2') && (
                                <>
                                  <td className="py-2 px-2 text-center text-[12px] text-slate-600 bg-blue-50/50">
                                    Internal
                                  </td>
                                  <td className="py-2 px-2 text-center text-[12px] text-slate-600">
                                    Written
                                  </td>
                                </>
                              )}
                              <td className="py-2 px-1.5 text-center">
                                {activeStudentResult.totalMax}
                              </td>
                              <td className="py-2 px-1.5 text-center">
                                {Math.round(activeStudentResult.totalMax * 0.32)}
                              </td>
                              <td className="py-2 px-2 text-center text-slate-900">
                                {activeStudentResult.totalObtained}
                              </td>
                              <td className="py-2 px-1.5 text-center text-emerald-800">
                                {activeStudentResult.grade}
                              </td>
                              <td className="py-2 px-2.5 text-left text-[12px] font-medium text-slate-600">
                                Overall Result: {activeStudentResult.status === 'PASS' ? 'Passed' : 'Needs Improvement'}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Performance Summary Metrics */}
                      <div className="grid grid-cols-4 gap-3 my-4 p-3 bg-slate-50 border border-slate-200 rounded text-center text-[12px]">
                        <div>
                          <div className="text-[12px] text-slate-500 font-medium">Percentage</div>
                          <div className="text-[12px] font-bold text-slate-900">
                            {activeStudentResult.percentage.toFixed(2)}%
                          </div>
                        </div>
                        <div>
                          <div className="text-[12px] text-slate-500 font-medium">Overall Grade</div>
                          <div className="text-[12px] font-bold text-emerald-700">
                            {activeStudentResult.grade}
                          </div>
                        </div>
                        <div>
                          <div className="text-[12px] text-slate-500 font-medium">Class Rank</div>
                          <div className="text-[12px] font-bold text-slate-900">
                            {activeStudentResult.rank ? `#${activeStudentResult.rank}` : '-'}
                          </div>
                        </div>
                        <div>
                          <div className="text-[12px] text-slate-500 font-medium">Final Result</div>
                          <div
                            className={`text-[12px] font-bold ${
                              activeStudentResult.status === 'PASS'
                                ? 'text-emerald-700'
                                : 'text-rose-600'
                            }`}
                          >
                            {activeStudentResult.status === 'PASS' ? 'PASSED' : 'NEEDS RE-EXAM'}
                          </div>
                        </div>
                      </div>

                      {/* Part 2: Co-Scholastic & Life Skills Assessment */}
                      <div className="mb-4">
                        <div className="text-[12px] font-bold text-slate-900 uppercase tracking-wide mb-1.5">
                          Part 2: Co-Scholastic &amp; Personality Assessment
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-[12px]">
                          <div className="p-2 border border-slate-200 rounded bg-slate-50/50">
                            <div className="text-[12px] text-slate-500">Work Education &amp; ICT</div>
                            <div className="font-bold text-slate-800">Grade A</div>
                          </div>
                          <div className="p-2 border border-slate-200 rounded bg-slate-50/50">
                            <div className="text-[12px] text-slate-500">Art &amp; Expression</div>
                            <div className="font-bold text-slate-800">Grade A</div>
                          </div>
                          <div className="p-2 border border-slate-200 rounded bg-slate-50/50">
                            <div className="text-[12px] text-slate-500">Health &amp; Physical</div>
                            <div className="font-bold text-slate-800">Grade A</div>
                          </div>
                          <div className="p-2 border border-slate-200 rounded bg-slate-50/50">
                            <div className="text-[12px] text-slate-500">Discipline &amp; Ethics</div>
                            <div className="font-bold text-slate-800">Grade A</div>
                          </div>
                        </div>
                      </div>

                      {/* Teacher Remarks Display */}
                      <div className="p-3 bg-white border border-slate-200 rounded text-[12px] mb-4 flex items-center justify-between gap-3">
                        <div>
                          <span className="font-bold text-slate-900">Class Teacher&apos;s Remark: </span>
                          <span className="text-slate-700 italic">
                            &ldquo;{activeStudentResult.student.customRemarks || getDefaultClassTeacherRemark(activeStudentResult.percentage, activeStudentResult.status)}&rdquo;
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setActiveTab('remarks')}
                          className="shrink-0 text-[12px] font-medium text-blue-600 hover:text-blue-700 hover:underline print:hidden"
                        >
                          Edit Remarks →
                        </button>
                      </div>

                      {/* Sitewide 9-Point Grading Scale Reference */}
                      <div className="p-2 bg-slate-50 border border-slate-200 rounded text-[12px] text-slate-600 flex flex-wrap items-center justify-between gap-1 mb-6">
                        <span><strong>Grading System:</strong> A1 (91–100)</span>
                        <span>·</span>
                        <span>A2 (81–90)</span>
                        <span>·</span>
                        <span>B1 (71–80)</span>
                        <span>·</span>
                        <span>B2 (61–70)</span>
                        <span>·</span>
                        <span>C1 (51–60)</span>
                        <span>·</span>
                        <span>C2 (41–50)</span>
                        <span>·</span>
                        <span>D (32–40)</span>
                        <span>·</span>
                        <span>E1 (20–31)</span>
                        <span>·</span>
                        <span>E2 (01–19)</span>
                      </div>

                      {/* Official Signatures Section - Evenly spaced across left, center, and right */}
                      <div
                        data-testid="sa-signatures-row"
                        className="flex items-end justify-between w-full px-4 pt-6 border-t border-slate-200 text-center text-[12px] font-bold font-aptos text-slate-900"
                        style={{
                          fontFamily: "'Aptos', 'Carlito', 'Calibri', 'Segoe UI', sans-serif",
                          fontSize: '12px',
                        }}
                      >
                        <div className="w-44 text-center">
                          <div className="h-10" />
                          <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-900">
                            Signature of Class Teacher
                          </div>
                        </div>
                        <div className="w-48 text-center">
                          <div className="h-10" />
                          <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-900">
                            Signature of Principal with Seal
                          </div>
                        </div>
                        <div className="w-44 text-center">
                          <div className="h-10" />
                          <div className="border-t border-slate-400 pt-1.5 font-bold text-slate-900">
                            Signature of Parent / Guardian
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        )}



        {/* ========================================================
            VIEW 4: EXPORT MARKS TAB
           ======================================================== */}
        {activeTab === 'export' && (
          <div className="max-w-4xl mx-auto w-full space-y-6 pb-16">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                  Export Marks
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5 font-normal">
                  Download formatted Excel marksheets (.xlsx) for any exam, class, or subject.
                </p>
              </div>
            </div>

            {/* Main 3-Step Excel Marksheets Export Card */}
            <div className="bg-white border border-slate-200/80 rounded-xl p-5 shadow-xs space-y-5">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                  Download Excel Marksheets
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choose the exam, class, and subjects you want in your Excel file.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {/* Step 1: Choose Exam */}
                <div className="bg-slate-50/60 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                  <label className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] flex items-center justify-center font-bold">
                      1
                    </span>
                    Choose Exam
                  </label>
                  <CustomSelect
                    fullWidth
                    icon={<BookOpen className="w-3.5 h-3.5 text-slate-400" />}
                    value={exportExam || selectedExam}
                    onChange={(val) => {
                      setExportExam(val);
                      if (val !== selectedExam) {
                        handleExamChange(val);
                      }
                    }}
                    options={Object.values(examConfigs).map((ex) => ({
                      value: ex.id,
                      label: ex.code || ex.id,
                    }))}
                  />
                </div>

                {/* Step 2: Choose Class */}
                <div className="bg-slate-50/60 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                  <label className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] flex items-center justify-center font-bold">
                      2
                    </span>
                    Choose Class
                  </label>
                  <CustomSelect
                    fullWidth
                    icon={<Layers className="w-3.5 h-3.5 text-slate-400" />}
                    value={exportClass || 'all'}
                    onChange={(val) => {
                      setExportClass(val);
                      setSelectedClass(val);
                    }}
                    options={[
                      { value: 'all', label: 'All Classes (Grade 6 to 9)' },
                      ...SVA_ALL_CLASSES.map((c) => ({
                        value: c,
                        label: getClassGradeLabel(c),
                      })),
                    ]}
                  />
                </div>

                {/* Step 3: Choose Subjects */}
                <div className="bg-slate-50/60 p-3.5 rounded-xl border border-slate-200/80 space-y-2">
                  <label className="text-xs font-semibold text-slate-900 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-600 text-white text-[11px] flex items-center justify-center font-bold">
                      3
                    </span>
                    Choose Subjects
                  </label>
                  <CustomSelect
                    fullWidth
                    icon={<Award className="w-3.5 h-3.5 text-slate-400" />}
                    value={exportSubjectScope || 'all_consolidated'}
                    onChange={(val) => setExportSubjectScope(val)}
                    options={[
                      { value: 'all_consolidated', label: 'All Subjects' },
                      { value: 'consolidated', label: 'Consolidated Sheet' },
                      ...getEffectiveExamConfigForClass(
                        examConfigs[exportExam || selectedExam] || baseExamConfig,
                        exportClass || 'Diamond'
                      ).subjects.map((s) => ({
                        value: s.name,
                        label: s.name,
                      })),
                    ]}
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs text-slate-500">
                  Ready to export:{' '}
                  <strong className="text-slate-800">
                    {exportExam || selectedExam}
                  </strong>{' '}
                  ·{' '}
                  <strong className="text-slate-800">
                    {exportClass === 'all' || !exportClass
                      ? 'All 8 Classes'
                      : getClassGradeLabel(exportClass)}
                  </strong>{' '}
                  ·{' '}
                  <strong className="text-slate-800">
                    {exportSubjectScope === 'consolidated'
                      ? 'Consolidated Sheet'
                      : exportSubjectScope === 'all_consolidated' || !exportSubjectScope
                      ? `All ${
                          getEffectiveExamConfigForClass(
                            examConfigs[exportExam || selectedExam] || baseExamConfig,
                            exportClass || 'Diamond'
                          ).subjects.length
                        } Subjects`
                      : exportSubjectScope}
                  </strong>
                </div>

                <button
                  type="button"
                  onClick={handleCustomMatrixExport}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Excel File (.xlsx)</span>
                </button>
              </div>
            </div>

            <ReferenceSheetPreviewCard
              students={exportStudentsList}
              examConfig={examConfigs[exportExam || selectedExam] || baseExamConfig}
              examId={exportExam || selectedExam}
              classScope={exportClass || 'Diamond'}
              subjectScope={exportSubjectScope || 'all_consolidated'}
              onSubjectScopeChange={(val) => setExportSubjectScope(val)}
            />
          </div>
        )}

        {/* ========================================================
            VIEW 5: ADMIN CONFIGURATION PANEL (SETTINGS)
           ======================================================== */}
        {activeTab === 'admin' && (
          <AdminConfigPanel
            examConfigs={examConfigs}
            activeExamId={selectedExam}
            selectedClass={selectedClass}
            onUpdateExamConfig={(examId, updated, classScope) => {
              const prevExamCfg = examConfigs[examId] || INITIAL_EXAM_CONFIGS[examId];
              setExamConfigs((prev) => ({
                ...prev,
                [examId]: updated,
              }));

              const currentStoreMarks = examMarksStore[examId] || {};
              const currentStoreBds = examBreakdownsStore[examId] || {};
              const updatedForStore = students.map((st) => {
                const stSourceMarks =
                  examId === selectedExam
                    ? { ...st.marks }
                    : currentStoreMarks[st.id]
                    ? { ...currentStoreMarks[st.id] }
                    : { ...st.marks };
                const stSourceBds =
                  examId === selectedExam
                    ? { ...(st.breakdowns || {}) }
                    : currentStoreBds[st.id]
                    ? { ...currentStoreBds[st.id] }
                    : { ...(st.breakdowns || {}) };

                if (
                  classScope &&
                  classScope !== 'ALL' &&
                  st.section !== classScope &&
                  st.class !== classScope &&
                  getClassGradeFromSection(st.section) !== classScope
                ) {
                  return {
                    ...st,
                    marks: stSourceMarks,
                    breakdowns: stSourceBds,
                  };
                }

                const prevEffCfg = prevExamCfg
                  ? getEffectiveExamConfigForClass(prevExamCfg, st.section)
                  : undefined;
                const effectiveCfg = getEffectiveExamConfigForClass(updated, st.section);
                const nextMarks = { ...stSourceMarks };
                const nextBreakdowns = { ...stSourceBds };

                effectiveCfg.subjects.forEach((sub) => {
                  const prevSub = prevEffCfg?.subjects.find(
                    (ps) => ps.name.toLowerCase() === sub.name.toLowerCase()
                  );
                  const oldMax = prevSub?.maxMarks || (isPtExam(examId) ? 25 : 100);
                  const newMax = sub.maxMarks || (isPtExam(examId) ? 25 : 100);

                  if (sub.components && sub.components.length > 1) {
                    const bd =
                      nextBreakdowns[sub.name] ||
                      generateDefaultBreakdown(
                        nextMarks[sub.name],
                        sub.name,
                        st.section
                      );
                    nextBreakdowns[sub.name] = bd;
                    nextMarks[sub.name] = computeSubjectTotalFromBreakdown(
                      sub.name,
                      st.section,
                      bd,
                      sub.components
                    );
                  } else {
                    const curVal = nextMarks[sub.name];
                    if (typeof curVal === 'number' && newMax > 0 && (oldMax !== newMax || curVal > newMax)) {
                      const srcMax =
                        curVal > oldMax
                          ? curVal > 50
                            ? 100
                            : curVal > 25
                            ? 50
                            : 25
                          : oldMax;
                      nextMarks[sub.name] = Math.min(
                        newMax,
                        Math.max(0, Math.round((curVal / srcMax) * newMax))
                      );
                    } else if (
                      (curVal === undefined || curVal === null) &&
                      isPtExam(examId) &&
                      hasCsInPtExam(st.section)
                    ) {
                      const baseSt = ALL_SVA_STUDENTS.find((b) => b.id === st.id);
                      const baseVal = baseSt?.marks[sub.name];
                      if (typeof baseVal === 'number') {
                        nextMarks[sub.name] = Math.min(
                          newMax,
                          Math.max(0, Math.round((baseVal / 100) * newMax))
                        );
                      }
                    }
                  }
                });

                return {
                  ...st,
                  marks: nextMarks,
                  breakdowns: nextBreakdowns,
                };
              });

              syncStoresForExam(examId, updatedForStore);

              if (examId === selectedExam) {
                setStudents(updatedForStore);
                triggerAutoSync(updatedForStore);
              }
              showToast(
                `Updated ${updated.name}${
                  classScope && classScope !== 'ALL' ? ` (${classScope})` : ' (All Classes)'
                }`
              );
            }}
            onApplyLinkedInternalExam={(targetExamId, targetSubjectScope, component, classScope) => {
              const linkedExamId = component.linkedExamId;
              if (!linkedExamId) return;
              const maxMarks = component.maxMarks;
              const compKey = component.key;
              const sourceStore = examMarksStore[linkedExamId] || {};
              const sourceExamCfg = examConfigs[linkedExamId];
              const baseTargetCfg = examConfigs[targetExamId];
              const targetSubNames =
                targetSubjectScope === 'ALL' || targetSubjectScope === '__ALL__'
                  ? (baseTargetCfg?.subjects || []).map((s) => s.name)
                  : [targetSubjectScope];

              const updatedStudents = students.map((st) => {
                if (
                  classScope &&
                  classScope !== 'ALL' &&
                  st.section !== classScope &&
                  st.class !== classScope &&
                  getClassGradeFromSection(st.section) !== classScope
                ) {
                  return st;
                }
                const stSourceMarks = sourceStore[st.id] || {};
                const nextBreakdowns = { ...(st.breakdowns || {}) };
                const nextMarks = { ...st.marks };
                const effectiveTargetCfg = baseTargetCfg
                  ? getEffectiveExamConfigForClass(baseTargetCfg, st.section)
                  : undefined;

                targetSubNames.forEach((subName) => {
                  const srcMax =
                    sourceExamCfg?.subjects.find((s) => s.name === subName)?.maxMarks || 20;
                  const rawSrcMark = stSourceMarks[subName];
                  const scaledVal: number | 'AB' | null =
                    rawSrcMark === 'AB'
                      ? 'AB'
                      : typeof rawSrcMark === 'number'
                      ? Math.min(maxMarks, Math.max(0, Math.round((rawSrcMark / srcMax) * maxMarks)))
                      : Math.round(maxMarks * 0.8);

                  const currentBd =
                    nextBreakdowns[subName] ||
                    generateDefaultBreakdown(nextMarks[subName], subName, st.section);
                  const updatedBd: SubjectBreakdown = {
                    ...currentBd,
                    [compKey]: scaledVal,
                  };
                  nextBreakdowns[subName] = updatedBd;
                  const subCfg = effectiveTargetCfg?.subjects.find(
                    (s) => s.name === subName
                  );
                  nextMarks[subName] = computeSubjectTotalFromBreakdown(
                    subName,
                    st.section,
                    updatedBd,
                    subCfg?.components
                  );
                });

                return {
                  ...st,
                  marks: nextMarks,
                  breakdowns: nextBreakdowns,
                };
              });

              setStudents(updatedStudents);
              syncStoresForExam(targetExamId, updatedStudents);
              triggerAutoSync(updatedStudents);
            }}
            onCreateNewExam={(newExam) => {
              setExamConfigs((prev) => ({
                ...prev,
                [newExam.id]: newExam,
              }));
              handleExamChange(newExam.id);
              showToast(`Created new test ${newExam.name}`);
            }}
            onDeleteExam={(examId) => {
              setExamConfigs((prev) => {
                const next = { ...prev };
                delete next[examId];
                return next;
              });
              if (selectedExam === examId) {
                handleExamChange('SA-1');
              }
              showToast(`Deleted test ${examId}`);
            }}
            onSetActiveExam={(examId) => {
              handleExamChange(examId);
              showToast(`Activated test ${examId}`);
            }}
            onResetDefaults={() => {
              setExamConfigs(INITIAL_EXAM_CONFIGS);
              handleExamChange('SA-1');
              showToast('Reset exam configurations to default CBSE structure');
            }}
            showToast={showToast}
            spreadsheetId={LOCKED_SPREADSHEET_ID}
            sheetsSyncStatus={sheetsSyncStatus}
            lastSyncTime={lastSyncTime}
            onGoogleSheetsSync={handleGoogleSheetsSync}
            students={students}
            exportExam={exportExam}
            setExportExam={setExportExam}
            exportClass={exportClass}
            setExportClass={setExportClass}
            exportSubjectScope={exportSubjectScope}
            setExportSubjectScope={setExportSubjectScope}
            onCustomMatrixExport={handleCustomMatrixExport}
            svaAllClasses={SVA_ALL_CLASSES}
            svaSubjects={SVA_SUBJECTS}
            getClassGradeLabel={getClassGradeLabel}
          />
        )}
      </main>

      {/* EDIT STUDENT PARTICULAR DRAWER / MODAL */}
      {editingStudent && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setEditingStudent(null); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-xl shadow-xl w-full max-w-md p-5 flex flex-col gap-3.5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80">
              <h3 className="text-sm font-semibold text-slate-900">Edit Student Details</h3>
              <button
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3 text-xs">
              <div>
                <label className="font-medium text-slate-700 block mb-1">Student Name</label>
                <input
                  type="text"
                  value={editingStudent.name}
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, name: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">Roll No</label>
                  <input
                    type="text"
                    value={editingStudent.rollNo}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, rollNo: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 block mb-1">Class / Section</label>
                  <CustomSelect
                    fullWidth
                    value={editingStudent.section}
                    onChange={(val) =>
                      setEditingStudent({ ...editingStudent, section: val })
                    }
                    options={SVA_ALL_CLASSES.map((cls) => ({
                      value: cls,
                      label: getClassGradeLabel(cls),
                    }))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="font-medium text-slate-700 block mb-1">Father&apos;s Name</label>
                  <input
                    type="text"
                    value={editingStudent.fatherName || ''}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, fatherName: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900 text-xs"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 block mb-1">Mother&apos;s Name</label>
                  <input
                    type="text"
                    value={editingStudent.motherName || ''}
                    onChange={(e) =>
                      setEditingStudent({ ...editingStudent, motherName: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900 text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 block mb-1">Teacher Remarks</label>
                <textarea
                  rows={2}
                  value={editingStudent.customRemarks || ''}
                  onChange={(e) =>
                    setEditingStudent({ ...editingStudent, customRemarks: e.target.value })
                  }
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900 resize-none text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2.5 border-t border-slate-200/80 mt-1">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-3 py-1.5 font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    pushUndoSnapshot(students);
                    const updatedStudent: StudentReportRow = {
                      ...editingStudent,
                      class: getClassNumberForSection(editingStudent.section),
                    };
                    const updated = students.map((s) =>
                      s.id === updatedStudent.id ? updatedStudent : s
                    );
                    setStudents(updated);
                    syncStoresForExam(selectedExam, updated);
                    triggerAutoSync(updated);
                    setEditingStudent(null);
                    showToast(`Updated details for ${updatedStudent.name}`);
                  }}
                  className="px-3.5 py-1.5 font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EXCEL / CSV UPLOAD MODAL */}
      {isUploadModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsUploadModalOpen(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-xl shadow-xl w-full max-w-md p-5 flex flex-col gap-3.5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Import Marks from Excel or CSV</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Upload a spreadsheet to import marks.
                </p>
              </div>
              <button
                onClick={() => setIsUploadModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mode Switcher: Minimal Segmented Control */}
            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 text-xs font-medium">
              <button
                type="button"
                onClick={() => setUploadMode('subject')}
                className={`flex-1 py-1.5 rounded-md transition-colors text-center cursor-pointer ${
                  uploadMode === 'subject'
                    ? 'bg-white text-slate-900 shadow-2xs font-medium'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Single Subject
              </button>
              <button
                type="button"
                onClick={() => setUploadMode('consolidated')}
                className={`flex-1 py-1.5 rounded-md transition-colors text-center cursor-pointer ${
                  uploadMode === 'consolidated'
                    ? 'bg-white text-slate-900 shadow-2xs font-medium'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Subjects
              </button>
            </div>

            {uploadMode === 'subject' ? (
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 space-y-2 text-xs">
                <div className="font-medium text-slate-900 flex items-center justify-between">
                  <span>Choose Subject:</span>
                  <span className="text-[10px] font-mono text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded">
                    Exam: {selectedExam}
                  </span>
                </div>
                <CustomSelect
                  fullWidth
                  icon={<Award className="w-3.5 h-3.5 text-slate-400" />}
                  value={uploadTargetSubject}
                  onChange={(val) => setUploadTargetSubject(val)}
                  options={activeSubjects.map((s) => ({
                    value: s.name,
                    label: `${s.name} (${s.maxMarks} Marks)`,
                  }))}
                />
                <p className="text-[11px] text-slate-500">
                  Updates marks only for <strong className="text-slate-700">{uploadTargetSubject}</strong> using Roll No or Student Name.
                </p>
                <button
                  type="button"
                  onClick={() => handleDownloadSubjectTemplate(uploadTargetSubject)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 underline cursor-pointer pt-0.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download {uploadTargetSubject} Sample Sheet (.xlsx)
                </button>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 space-y-2 text-xs">
                <p className="text-slate-600">
                  Upload an Excel or CSV file containing marks for all 7 subjects.
                </p>
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 underline cursor-pointer pt-0.5"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  Download All-Subjects Sample Sheet (.xlsx)
                </button>
              </div>
            )}

            {uploadError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}

            {/* Dropzone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-200 hover:border-slate-400 bg-slate-50/50 hover:bg-slate-100/60 transition-colors rounded-lg p-5 flex flex-col items-center justify-center text-center cursor-pointer"
            >
              <Upload className="w-6 h-6 text-slate-400 mb-1.5" />
              <div className="text-xs font-medium text-slate-900">
                Click to browse or drop {uploadMode === 'subject' ? `${uploadTargetSubject} marks` : 'marks file'} here
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5 font-mono">
                Supports .xlsx, .xls, and .csv
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-200/80">
              <button
                type="button"
                onClick={() => setIsUploadModalOpen(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD STUDENT MODAL */}
      {isAddStudentModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsAddStudentModalOpen(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 backdrop-blur-xs p-4 animate-in fade-in duration-150"
        >
          <div className="bg-white border border-slate-200/90 rounded-xl shadow-xl w-full max-w-md p-5 flex flex-col gap-3.5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200/80">
              <h3 className="text-sm font-semibold text-slate-900">Add New Student</h3>
              <button
                onClick={() => setIsAddStudentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddStudent} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">
                  Student Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="e.g. Rohan Sandeep Joshi"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">
                    Class / Division *
                  </label>
                  <CustomSelect
                    fullWidth
                    value={newStudentSection}
                    onChange={(val) => setNewStudentSection(val)}
                    options={SVA_ALL_CLASSES.map((cls) => ({
                      value: cls,
                      label: getClassGradeLabel(cls),
                    }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">
                    Roll Number *
                  </label>
                  <input
                    type="text"
                    required
                    value={newStudentRoll}
                    onChange={(e) => setNewStudentRoll(e.target.value)}
                    placeholder="e.g. 31"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">
                    Father&apos;s Name
                  </label>
                  <input
                    type="text"
                    value={newStudentFather}
                    onChange={(e) => setNewStudentFather(e.target.value)}
                    placeholder="Father's full name"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-1 block">
                    Mother&apos;s Name
                  </label>
                  <input
                    type="text"
                    value={newStudentMother}
                    onChange={(e) => setNewStudentMother(e.target.value)}
                    placeholder="Mother's full name"
                    className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-700 mb-1 block">
                  Date of Birth
                </label>
                <input
                  type="date"
                  value={newStudentDob}
                  onChange={(e) => setNewStudentDob(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-200/80 mt-1">
                <button
                  type="button"
                  onClick={() => setIsAddStudentModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Save Student
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* KEYBOARD SHORTCUTS HELP MODAL */}
      {isShortcutsModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsShortcutsModalOpen(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-md p-4 animate-in fade-in duration-200"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xl shadow-slate-950/10 w-full max-w-lg p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-slate-800" />
                <h3 className="text-base font-bold text-slate-900">Excel Keyboard & Mouse Shortcuts</h3>
              </div>
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> Direct Cell Entry
                </div>
                <p className="text-slate-600 text-[11px]">Click cell & type to overwrite marks instantly.</p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" /> Cursor Editing
                </div>
                <p className="text-slate-600 text-[11px]">Click inside an active cell to place cursor & edit.</p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                <div className="font-semibold text-slate-900 flex items-center justify-between">
                  <span>Move Down / Up</span>
                  <kbd className="px-1.5 py-0.5 bg-white border rounded font-mono text-[10px]">Enter / Shift+Enter</kbd>
                </div>
                <p className="text-slate-600 text-[11px]">Save mark and move to adjacent student row.</p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                <div className="font-semibold text-slate-900 flex items-center justify-between">
                  <span>Move Right / Left</span>
                  <kbd className="px-1.5 py-0.5 bg-white border rounded font-mono text-[10px]">Tab / Shift+Tab</kbd>
                </div>
                <p className="text-slate-600 text-[11px]">Save mark and move to adjacent subject column.</p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                <div className="font-semibold text-slate-900 flex items-center justify-between">
                  <span>Range Selection</span>
                  <kbd className="px-1.5 py-0.5 bg-white border rounded font-mono text-[10px]">Shift + Arrows / Drag</kbd>
                </div>
                <p className="text-slate-600 text-[11px]">Select a block of cells for live stats & batch ops.</p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                <div className="font-semibold text-slate-900 flex items-center justify-between">
                  <span>Clear Cells</span>
                  <kbd className="px-1.5 py-0.5 bg-white border rounded font-mono text-[10px]">Del / Backspace</kbd>
                </div>
                <p className="text-slate-600 text-[11px]">Clear mark in current cell or entire range.</p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                <div className="font-semibold text-slate-900 flex items-center justify-between">
                  <span>Copy Range</span>
                  <kbd className="px-1.5 py-0.5 bg-white border rounded font-mono text-[10px]">Ctrl + C</kbd>
                </div>
                <p className="text-slate-600 text-[11px]">Copy selected range as TSV for Excel/Sheets.</p>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                <div className="font-semibold text-slate-900 flex items-center justify-between">
                  <span>Context Menu</span>
                  <kbd className="px-1.5 py-0.5 bg-white border rounded font-mono text-[10px]">Right Click</kbd>
                </div>
                <p className="text-slate-600 text-[11px]">Open quick action menu for student report & details.</p>
              </div>
            </div>

            <div className="flex items-center justify-end pt-2 border-t border-slate-200">
              <button
                onClick={() => setIsShortcutsModalOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GOOGLE APPS SCRIPT 2-WAY SYNC MODAL */}
      {isGasModalOpen && (
        <div 
          onClick={(e) => { if (e.target === e.currentTarget) setIsGasModalOpen(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-md p-4 animate-in fade-in duration-200"
        >
          <div className="bg-white border border-slate-200/90 rounded-2xl shadow-2xl shadow-slate-950/10 w-full max-w-2xl overflow-hidden p-6 flex flex-col gap-4 animate-in zoom-in-95 duration-200 relative">
            <button
              onClick={() => setIsGasModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer z-10"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <GoogleSheetsConnectCard
              students={students}
              selectedExam={selectedExam}
              onSyncSuccess={() => {
                pushToLockedSheet(false);
              }}
              showToast={showToast}
              lastSyncTime={lastSyncTime}
              sheetsSyncStatus={sheetsSyncStatus}
            />
          </div>
        </div>
      )}
      {/* INTERNAL ASSESSMENT BREAKDOWN MODAL (Supports CBSE 80+20 and Class 9 Hindi Listening/Speaking/Project/SA) */}
      {internalModalData && (
        <InternalAssessmentModal
          data={internalModalData}
          selectedExam={selectedExam}
          components={
            getEffectiveExamConfigForClass(
              baseExamConfig,
              internalModalData.student.section
            ).subjects.find(
              (s) => s.name.toLowerCase() === internalModalData.subjectName.toLowerCase()
            )?.components
          }
          onClose={() => setInternalModalData(null)}
          onSave={handleSaveInternalBreakdown}
        />
      )}
    </div>
  );
}
