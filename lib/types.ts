export interface Student {
  id: string; // Permanent Student ID e.g. "STU2026001"
  admissionNo: string;
  name: string;
  rollNo: string;
  class: string;
  section: string;
  dob: string; // YYYY-MM-DD
  gender: 'Male' | 'Female' | 'Other';
  fatherName: string;
  motherName: string;
  contactNo: string;
  address: string;
  academicSession: string; // e.g. "2025-2026"
  photoUrl?: string;
  createdAt: string;
}

export interface ClassSection {
  id: string;
  className: string;
  section: string;
}

export interface Subject {
  id: string;
  code: string;
  name: string;
  category: 'Core' | 'Elective' | 'Language' | 'Vocational' | 'Activity';
}

export interface ExamSubject {
  subjectId: string;
  subjectName: string;
  maxMarks: number;
  passMarks: number;
}

export interface Examination {
  id: string;
  name: string; // e.g. "PT1", "PT2", "Half-Yearly", "Annual Examination"
  academicSession: string;
  className: string;
  section?: string;
  startDate: string;
  endDate: string;
  status: 'Draft' | 'Ongoing' | 'Completed' | 'Published';
  subjects: ExamSubject[];
  calculationSettingId?: string; // Links specific calculation version
}

export interface MarkItem {
  subjectId: string;
  subjectName: string;
  obtained: number | 'AB' | null; // number or 'AB' (Absent) or null (incomplete/blank)
  isAbsent?: boolean;
}

export interface MarksRecord {
  id: string; // unique ID
  studentId: string; // Permanent Student ID
  studentName: string;
  admissionNo: string;
  rollNo: string;
  examId: string;
  examName: string;
  className: string;
  section: string;
  academicSession: string;
  marks: Record<string, number | 'AB' | null>; // subjectId -> mark value
  lastUpdatedBy?: string;
  updatedAt: string;
}

export interface MarksHistoryItem {
  id: string;
  studentId: string;
  examId: string;
  subjectId: string;
  subjectName: string;
  previousMark: number | 'AB' | null;
  updatedMark: number | 'AB' | null;
  changeDate: string;
  source: 'Manual Entry' | 'Excel Import' | 'System Sync';
  updatedBy: string;
  remarks?: string;
}

export interface GradeCategory {
  id: string;
  grade: string;
  minPercent: number;
  maxPercent: number;
  gradePoint?: number;
  description: string;
}

export interface GradeConfig {
  id: string;
  name: string; // e.g. "CBSE Standard Grading", "Primary Grading"
  applicableClasses: string[];
  categories: GradeCategory[];
}

export interface PassFailRules {
  subjectWisePassRequired: boolean;
  minSubjectPassPercent: number;
  overallAggregatePassRequired: boolean;
  minAggregatePercent: number;
  absentAsFail: boolean;
  allowGraceMarks: boolean;
}

export interface CalculationSetting {
  id: string;
  name: string;
  examType?: string; // Applicable exam type or "All"
  className?: string; // Applicable class or "All"
  mode: 'formula' | 'rules';
  // Formula mode configuration:
  customFormula: string; // e.g. "(English + Mathematics + Science) / 3" or "(TOTAL_OBTAINED / TOTAL_MAX) * 100"
  formulaDescription?: string;
  // Rule-based mode configuration:
  ruleIncludedSubjectIds: string[];
  ruleSubjectWeights: Record<string, number>; // subjectId -> weight (1.0 default)
  // General:
  gradeConfigId: string;
  passFailRules: PassFailRules;
  enableRanking: boolean;
  rankingMetric: 'percentage' | 'totalMarks';
  updatedAt: string;
}

export interface SchoolSettings {
  schoolName: string;
  schoolAddress: string;
  schoolContact: string;
  schoolEmail: string;
  schoolWebsite: string;
  schoolLogoUrl: string;
  principalName: string;
  currentAcademicSession: string;
  affiliationNo: string;
  schoolCode: string;
}

export interface GoogleSheetsConfig {
  spreadsheetId: string;
  apiKey: string;
  autoSync: boolean;
  lastSyncedAt?: string;
  isConnected: boolean;
}

export interface ReportCardGenerationItem {
  student: Student;
  exam: Examination;
  marksRecord?: MarksRecord;
  calculatedResult?: CalculatedStudentResult;
}

export interface CalculatedStudentResult {
  totalObtained: number;
  totalMax: number;
  percentage: number;
  grade: string;
  resultStatus: 'PASS' | 'FAIL' | 'COMPARTMENT' | 'ABSENT';
  rank?: number;
  subjectResults: Array<{
    subjectId: string;
    subjectName: string;
    maxMarks: number;
    passMarks: number;
    obtainedMarks: number | 'AB' | null;
    percentage: number | null;
    grade: string;
    status: 'PASS' | 'FAIL' | 'ABSENT' | 'INCOMPLETE';
  }>;
  formulaUsed: string;
  calculationBreakdown: string[];
}
