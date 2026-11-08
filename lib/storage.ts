import {
  Student,
  Examination,
  Subject,
  ClassSection,
  GradeConfig,
  CalculationSetting,
  SchoolSettings,
  MarksRecord,
  MarksHistoryItem,
  GoogleSheetsConfig,
} from './types';
import { LOCKED_SPREADSHEET_ID } from './gas-sync';
import {
  DEFAULT_SCHOOL_SETTINGS,
  DEFAULT_CLASSES,
  DEFAULT_SUBJECTS,
  DEFAULT_GRADE_CONFIG,
  DEFAULT_CALCULATION_SETTING,
  INITIAL_STUDENTS,
  INITIAL_EXAMINATIONS,
  INITIAL_MARKS_RECORDS,
  INITIAL_MARKS_HISTORY,
} from './sample-data';

const STORAGE_KEYS = {
  SCHOOL_SETTINGS: 'school_erp_settings',
  CLASSES: 'school_erp_classes',
  SUBJECTS: 'school_erp_subjects',
  GRADE_CONFIG: 'school_erp_grade_config',
  CALC_SETTING: 'school_erp_calc_setting',
  STUDENTS: 'school_erp_students',
  EXAMINATIONS: 'school_erp_examinations',
  MARKS: 'school_erp_marks',
  MARKS_HISTORY: 'school_erp_marks_history',
  GSHEETS_CONFIG: 'school_erp_gsheets_config',
};

// Helper to safely read from localStorage
function getStored<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (err) {
    console.error(`Error reading storage key ${key}:`, err);
    return defaultValue;
  }
}

// Helper to safely write to localStorage
function setStored<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Error writing storage key ${key}:`, err);
  }
}

export class StorageService {
  // Initialize storage if empty
  static initializeDefaults(): void {
    if (typeof window === 'undefined') return;

    if (!localStorage.getItem(STORAGE_KEYS.STUDENTS)) {
      setStored(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.SCHOOL_SETTINGS)) {
      setStored(STORAGE_KEYS.SCHOOL_SETTINGS, DEFAULT_SCHOOL_SETTINGS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.CLASSES)) {
      setStored(STORAGE_KEYS.CLASSES, DEFAULT_CLASSES);
    }
    if (!localStorage.getItem(STORAGE_KEYS.SUBJECTS)) {
      setStored(STORAGE_KEYS.SUBJECTS, DEFAULT_SUBJECTS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.GRADE_CONFIG)) {
      setStored(STORAGE_KEYS.GRADE_CONFIG, DEFAULT_GRADE_CONFIG);
    }
    if (!localStorage.getItem(STORAGE_KEYS.CALC_SETTING)) {
      setStored(STORAGE_KEYS.CALC_SETTING, DEFAULT_CALCULATION_SETTING);
    }
    if (!localStorage.getItem(STORAGE_KEYS.EXAMINATIONS)) {
      setStored(STORAGE_KEYS.EXAMINATIONS, INITIAL_EXAMINATIONS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.MARKS)) {
      setStored(STORAGE_KEYS.MARKS, INITIAL_MARKS_RECORDS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.MARKS_HISTORY)) {
      setStored(STORAGE_KEYS.MARKS_HISTORY, INITIAL_MARKS_HISTORY);
    }
  }

  // School Settings
  static getSchoolSettings(): SchoolSettings {
    return getStored(STORAGE_KEYS.SCHOOL_SETTINGS, DEFAULT_SCHOOL_SETTINGS);
  }

  static saveSchoolSettings(settings: SchoolSettings): void {
    setStored(STORAGE_KEYS.SCHOOL_SETTINGS, settings);
  }

  // Classes
  static getClasses(): ClassSection[] {
    return getStored(STORAGE_KEYS.CLASSES, DEFAULT_CLASSES);
  }

  static saveClasses(classes: ClassSection[]): void {
    setStored(STORAGE_KEYS.CLASSES, classes);
  }

  // Subjects
  static getSubjects(): Subject[] {
    return getStored(STORAGE_KEYS.SUBJECTS, DEFAULT_SUBJECTS);
  }

  static saveSubjects(subjects: Subject[]): void {
    setStored(STORAGE_KEYS.SUBJECTS, subjects);
  }

  // Grade Configuration
  static getGradeConfig(): GradeConfig {
    return getStored(STORAGE_KEYS.GRADE_CONFIG, DEFAULT_GRADE_CONFIG);
  }

  static saveGradeConfig(config: GradeConfig): void {
    setStored(STORAGE_KEYS.GRADE_CONFIG, config);
  }

  // Calculation Setting
  static getCalculationSetting(): CalculationSetting {
    return getStored(STORAGE_KEYS.CALC_SETTING, DEFAULT_CALCULATION_SETTING);
  }

  static saveCalculationSetting(setting: CalculationSetting): void {
    setStored(STORAGE_KEYS.CALC_SETTING, setting);
  }

  // Students
  static getStudents(): Student[] {
    return getStored(STORAGE_KEYS.STUDENTS, INITIAL_STUDENTS);
  }

  static saveStudents(students: Student[]): void {
    setStored(STORAGE_KEYS.STUDENTS, students);
  }

  static generateNextStudentID(): string {
    const students = this.getStudents();
    const currentYear = new Date().getFullYear();
    const prefix = `STU${currentYear}`;
    
    // Find highest numeric suffix
    let maxNum = 0;
    students.forEach((s) => {
      if (s.id.startsWith(prefix)) {
        const numPart = parseInt(s.id.replace(prefix, ''), 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    });

    const nextNum = (maxNum + 1).toString().padStart(3, '0');
    return `${prefix}${nextNum}`;
  }

  static addStudent(student: Omit<Student, 'id' | 'createdAt'>): Student {
    const students = this.getStudents();
    const newStudent: Student = {
      ...student,
      id: this.generateNextStudentID(),
      createdAt: new Date().toISOString(),
    };
    students.push(newStudent);
    this.saveStudents(students);
    return newStudent;
  }

  static updateStudent(id: string, updatedFields: Partial<Student>): Student | null {
    const students = this.getStudents();
    const index = students.findIndex((s) => s.id === id);
    if (index === -1) return null;

    // Permanent Student ID rule: ID must NEVER change
    const existing = students[index];
    const updated: Student = {
      ...existing,
      ...updatedFields,
      id: existing.id, // Preserve permanent ID
    };

    students[index] = updated;
    this.saveStudents(students);
    return updated;
  }

  // Examinations
  static getExaminations(): Examination[] {
    return getStored(STORAGE_KEYS.EXAMINATIONS, INITIAL_EXAMINATIONS);
  }

  static saveExaminations(exams: Examination[]): void {
    setStored(STORAGE_KEYS.EXAMINATIONS, exams);
  }

  static addExamination(exam: Omit<Examination, 'id'>): Examination {
    const exams = this.getExaminations();
    const newExam: Examination = {
      ...exam,
      id: `exam_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    };
    exams.push(newExam);
    this.saveExaminations(exams);
    return newExam;
  }

  static updateExamination(id: string, fields: Partial<Examination>): Examination | null {
    const exams = this.getExaminations();
    const idx = exams.findIndex((e) => e.id === id);
    if (idx === -1) return null;
    exams[idx] = { ...exams[idx], ...fields };
    this.saveExaminations(exams);
    return exams[idx];
  }

  // Marks Records
  static getMarksRecords(): MarksRecord[] {
    return getStored(STORAGE_KEYS.MARKS, INITIAL_MARKS_RECORDS);
  }

  static saveMarksRecords(records: MarksRecord[]): void {
    setStored(STORAGE_KEYS.MARKS, records);
  }

  static saveSingleMark(
    studentId: string,
    examId: string,
    subjectId: string,
    subjectName: string,
    value: number | 'AB' | null,
    updatedBy: string = 'Administrator',
    source: 'Manual Entry' | 'Excel Import' = 'Manual Entry'
  ): void {
    const records = this.getMarksRecords();
    const students = this.getStudents();
    const exams = this.getExaminations();

    const student = students.find((s) => s.id === studentId);
    const exam = exams.find((e) => e.id === examId);

    if (!student || !exam) return;

    let recordIdx = records.findIndex((r) => r.studentId === studentId && r.examId === examId);
    let record: MarksRecord;

    const historyItems = this.getMarksHistory();

    if (recordIdx === -1) {
      record = {
        id: `mr_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        studentId: student.id,
        studentName: student.name,
        admissionNo: student.admissionNo,
        rollNo: student.rollNo,
        examId: exam.id,
        examName: exam.name,
        className: exam.className,
        section: student.section,
        academicSession: exam.academicSession,
        marks: { [subjectId]: value },
        updatedAt: new Date().toISOString(),
        lastUpdatedBy: updatedBy,
      };
      records.push(record);

      // Audit history item
      historyItems.unshift({
        id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        studentId,
        examId,
        subjectId,
        subjectName,
        previousMark: null,
        updatedMark: value,
        changeDate: new Date().toISOString(),
        source,
        updatedBy,
        remarks: 'Initial mark entry',
      });
    } else {
      record = records[recordIdx];
      const previousValue = record.marks[subjectId] ?? null;

      if (previousValue !== value) {
        record.marks[subjectId] = value;
        record.updatedAt = new Date().toISOString();
        record.lastUpdatedBy = updatedBy;

        // Audit log entry
        historyItems.unshift({
          id: `hist_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
          studentId,
          examId,
          subjectId,
          subjectName,
          previousMark: previousValue,
          updatedMark: value,
          changeDate: new Date().toISOString(),
          source,
          updatedBy,
          remarks: `Updated from ${previousValue ?? 'empty'} to ${value ?? 'empty'}`,
        });
      }
    }

    this.saveMarksRecords(records);
    this.saveMarksHistory(historyItems);
  }

  // Marks History
  static getMarksHistory(): MarksHistoryItem[] {
    return getStored(STORAGE_KEYS.MARKS_HISTORY, INITIAL_MARKS_HISTORY);
  }

  static saveMarksHistory(items: MarksHistoryItem[]): void {
    setStored(STORAGE_KEYS.MARKS_HISTORY, items);
  }

  // Google Sheets Config (Permanently locked to official School Database Sheet)
  static getGoogleSheetsConfig(): GoogleSheetsConfig {
    const stored = getStored<Partial<GoogleSheetsConfig>>(STORAGE_KEYS.GSHEETS_CONFIG, {});
    return {
      spreadsheetId: LOCKED_SPREADSHEET_ID,
      apiKey: stored.apiKey || '',
      autoSync: true,
      isConnected: true,
      lastSyncedAt: stored.lastSyncedAt,
    };
  }

  static saveGoogleSheetsConfig(config: GoogleSheetsConfig): void {
    setStored(STORAGE_KEYS.GSHEETS_CONFIG, {
      ...config,
      spreadsheetId: LOCKED_SPREADSHEET_ID,
      isConnected: true,
      autoSync: true,
    });
  }

  // Export & Import full database
  static exportFullBackup() {
    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      schoolSettings: this.getSchoolSettings(),
      classes: this.getClasses(),
      subjects: this.getSubjects(),
      gradeConfig: this.getGradeConfig(),
      calcSetting: this.getCalculationSetting(),
      students: this.getStudents(),
      examinations: this.getExaminations(),
      marksRecords: this.getMarksRecords(),
      marksHistory: this.getMarksHistory(),
    };
  }

  static importFullBackup(data: any): boolean {
    try {
      if (data.students) this.saveStudents(data.students);
      if (data.examinations) this.saveExaminations(data.examinations);
      if (data.marksRecords) this.saveMarksRecords(data.marksRecords);
      if (data.schoolSettings) this.saveSchoolSettings(data.schoolSettings);
      if (data.classes) this.saveClasses(data.classes);
      if (data.subjects) this.saveSubjects(data.subjects);
      if (data.gradeConfig) this.saveGradeConfig(data.gradeConfig);
      if (data.calcSetting) this.saveCalculationSetting(data.calcSetting);
      if (data.marksHistory) this.saveMarksHistory(data.marksHistory);
      return true;
    } catch (e) {
      console.error('Failed to import backup:', e);
      return false;
    }
  }
}
