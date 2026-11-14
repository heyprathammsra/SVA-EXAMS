/**
 * Google Apps Script Sync Service (v2.0)
 * Two-way sync with Google Sheets supporting:
 * - Multi-exam tabs (PT-1..4, SA-1..2, and custom exams created by Admin)
 * - Dynamic subjects, custom max marks, and internal assessment breakdowns
 * - Student particulars (Class/Grade, House, DOB, Attendance, Height, Weight, Parents) & Remarks
 * - Dedicated "Teachers & Mapping" tab and "ERP_System_State" cloud backup tab
 */

import { getAdminAuthHeaders } from './auth-client';
import { ClassDefinition, ExamConfig, StudentReportRow } from './report-card-types';
import { ExamBreakdownsStore, ExamMarksStore } from './erp-persistence';

export const LOCKED_SPREADSHEET_ID = '1EzodiIYrfqqNoLgkvBATIvZAlRo00-UlDFw2XJXW0s';
export const LOCKED_SPREADSHEET_URL =
  'https://docs.google.com/spreadsheets/d/1EzodiIYrfqqNoLgkvBATIvZAlRo00-UlDFw2XJXW0s/edit';
export const DEFAULT_GAS_URL =
  'https://script.google.com/macros/s/AKfycbxX9Bt6NGyVlhJ8LnsRbI47SrUrYdYfKBAMxfKaBOnnwjBSA7ok5VfrUnJ9ha7IPw37ZA/exec';

const GAS_URL_STORAGE_KEY = 'school_erp_gas_url';

export function getStoredGasUrl(): string {
  if (typeof window === 'undefined') return DEFAULT_GAS_URL;
  const stored = localStorage.getItem(GAS_URL_STORAGE_KEY);
  if (!stored || stored.includes('docs.google.com/spreadsheets')) {
    return DEFAULT_GAS_URL;
  }
  return stored.trim();
}

export function saveStoredGasUrl(url: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GAS_URL_STORAGE_KEY, url.trim());
}

export const GAS_SCRIPT_CODE = `/**
 * =========================================================================
 * GOOGLE APPS SCRIPT FOR SARASWATI VIDYA ACADEMY EXAM WEB APP (v2.0)
 * Target Sheet: SVA EXAM WEB APP (ID: 1EzodiIYrfqqNoLgkvBATIvZAlRo00-UlDFw2XJXW0s)
 * Supports:
 *  - Dynamic Subjects, Custom Max Marks, and Internal Assessment Breakdowns
 *  - Cleared Marks (blank cells stay blank, never overwritten with fake defaults)
 *  - Student Particulars (Class, House, DOB, Attendance, Height, Weight, Parents)
 *  - Class Teacher & Subject Remarks
 *  - Dedicated "Teachers & Mapping" Tab & "ERP_System_State" Cloud Sync Tab
 * =========================================================================
 *
 * HOW TO UPDATE / DEPLOY (Takes 1 minute):
 * 1. Open your Google Sheet:
 *    https://docs.google.com/spreadsheets/d/1EzodiIYrfqqNoLgkvBATIvZAlRo00-UlDFw2XJXW0s/edit
 * 2. In Google Sheets top menu, click Extensions > Apps Script.
 * 3. Replace all code in Code.gs with THIS ENTIRE SCRIPT and click Save.
 * 4. Click "Deploy" > "Manage deployments" > Edit (pencil icon) >
 *    Version: "New version" > Who has access: "Anyone" > Click "Deploy".
 */

var SPREADSHEET_ID = "1EzodiIYrfqqNoLgkvBATIvZAlRo00-UlDFw2XJXW0s";

function getTargetSheet(examName) {
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet() || SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  var tabName = (examName && String(examName).trim()) ? String(examName).trim() : "SA-1";
  var sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  }
  return sheet;
}

function parseCellMark(v) {
  if (v === "" || v === null || v === undefined) return null;
  if (String(v).trim().toUpperCase() === "AB") return "AB";
  var num = parseFloat(v);
  return isNaN(num) ? null : num;
}

function safeJsonParse(str, fallback) {
  if (!str || typeof str !== "string") return fallback;
  try {
    return JSON.parse(str);
  } catch (e) {
    return fallback;
  }
}

// 1. GET: Pulls exam tab rows, Teachers & Mapping, or ERP_System_State backup
function doGet(e) {
  try {
    var examName = (e && e.parameter && e.parameter.examName) ? e.parameter.examName : "SA-1";
    var sheet = getTargetSheet(examName);
    var data = sheet.getDataRange().getValues();

    if (!data || data.length < 2) {
      return jsonResponse({ success: true, count: 0, exam: examName, students: [] });
    }

    var headers = data[0].map(function(h) { return String(h || "").trim(); });

    // System Cloud Backup tab ("ERP_System_State")
    if (examName === "ERP_System_State") {
      var chunks = [];
      for (var c = 1; c < data.length; c++) {
        var cRow = data[c];
        if (!cRow || !cRow[1]) continue;
        chunks.push({
          id: "cloud-chunk-" + c,
          rollNo: String(cRow[0] || c),
          name: String(cRow[1] || ""),
          section: String(cRow[2] || "")
        });
      }
      return jsonResponse({ success: true, count: chunks.length, exam: examName, students: chunks });
    }

    var metaCols = {
      "roll no": true, "student name": true, "section": true, "class": true,
      "house": true, "dob": true, "attendance": true, "height (cm)": true,
      "weight (kg)": true, "father's name": true, "mother's name": true,
      "class teacher remark": true, "subject remarks json": true, "breakdowns json": true,
      "total": true, "percentage": true, "grade": true
    };

    var subjectCols = [];
    for (var colIdx = 3; colIdx < headers.length; colIdx++) {
      var rawH = headers[colIdx];
      if (!rawH) continue;
      var cleanH = rawH.replace(/\\s*\\(\\d+\\)\\s*$/, "").trim();
      var lowerH = cleanH.toLowerCase();
      if (metaCols[lowerH] || lowerH.indexOf("total") === 0) continue;
      subjectCols.push({ index: colIdx, name: cleanH });
    }

    var findCol = function(labelLower) {
      for (var m = 0; m < headers.length; m++) {
        if (headers[m].toLowerCase() === labelLower) return m;
      }
      return -1;
    };

    var colClass = findCol("class");
    var colHouse = findCol("house");
    var colDob = findCol("dob");
    var colAtt = findCol("attendance");
    var colHeight = findCol("height (cm)");
    var colWeight = findCol("weight (kg)");
    var colFather = findCol("father's name");
    var colMother = findCol("mother's name");
    var colRemark = findCol("class teacher remark");
    var colSubRemarks = findCol("subject remarks json");
    var colBreakdowns = findCol("breakdowns json");

    var students = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row || row.length === 0 || !row[1]) continue;

      var marks = {};
      if (subjectCols.length > 0) {
        for (var sIdx = 0; sIdx < subjectCols.length; sIdx++) {
          var sc = subjectCols[sIdx];
          marks[sc.name] = parseCellMark(row[sc.index]);
        }
      } else {
        marks = {
          "English": parseCellMark(row[3]),
          "Hindi": parseCellMark(row[4]),
          "Marathi": parseCellMark(row[5]),
          "Maths": parseCellMark(row[6]),
          "Science": parseCellMark(row[7]),
          "Social Science": parseCellMark(row[8]),
          "Computer Science": parseCellMark(row[9])
        };
      }

      var stuObj = {
        id: String("sva-" + (row[2] || "Sparkle") + "-" + (row[0] || i)),
        rollNo: String(row[0] || i),
        name: String(row[1] || ""),
        section: String(row[2] || "Sparkle"),
        marks: marks,
        breakdowns: colBreakdowns >= 0 ? safeJsonParse(String(row[colBreakdowns] || ""), {}) : {}
      };

      if (colClass >= 0 && row[colClass]) stuObj.class = String(row[colClass]);
      if (colHouse >= 0 && row[colHouse]) stuObj.house = String(row[colHouse]);
      if (colDob >= 0 && row[colDob]) stuObj.dob = String(row[colDob]);
      if (colAtt >= 0 && row[colAtt]) stuObj.attendance = String(row[colAtt]);
      if (colHeight >= 0 && row[colHeight]) stuObj.height = String(row[colHeight]);
      if (colWeight >= 0 && row[colWeight]) stuObj.weight = String(row[colWeight]);
      if (colFather >= 0 && row[colFather]) stuObj.fatherName = String(row[colFather]);
      if (colMother >= 0 && row[colMother]) stuObj.motherName = String(row[colMother]);
      if (colRemark >= 0 && row[colRemark]) {
        stuObj.remarks = String(row[colRemark]);
        stuObj.customRemarks = String(row[colRemark]);
      }
      if (colSubRemarks >= 0 && row[colSubRemarks]) {
        stuObj.subjectRemarks = safeJsonParse(String(row[colSubRemarks] || ""), {});
      }

      students.push(stuObj);
    }

    return jsonResponse({ success: true, count: students.length, exam: examName, students: students });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// 2. POST: Saves student marks, particulars, remarks, dynamic subjects, and Teacher Mappings
function doPost(e) {
  try {
    var payload = (e.postData && e.postData.contents) ? JSON.parse(e.postData.contents) : e.parameter;
    var students = payload.students || [];
    var examName = payload.examName || "SA-1";

    if (!Array.isArray(students) || students.length === 0) {
      return jsonResponse({ success: false, error: "No records provided" });
    }

    var sheet = getTargetSheet(examName);

    // Case A: System Cloud Backup or Teachers & Mapping Tab
    if (examName === "ERP_System_State" || examName === "Teachers & Mapping" || payload.isSystemBackup || payload.isTeachersTab) {
      var sysHeaders = examName === "Teachers & Mapping"
        ? ["Username", "Teacher Name & Role", "Mapped Classes"]
        : ["Chunk Index", "Compressed State Payload", "Metadata"];
      var sysRows = [sysHeaders];
      for (var idx = 0; idx < students.length; idx++) {
        var item = students[idx];
        sysRows.push([
          item.rollNo || (idx + 1),
          item.name || "",
          item.section || ""
        ]);
      }
      sheet.clearContents();
      sheet.getRange(1, 1, sysRows.length, sysHeaders.length).setValues(sysRows);
      return jsonResponse({
        success: true,
        exam: examName,
        sheetTab: sheet.getName(),
        updatedRows: sysRows.length - 1,
        timestamp: new Date().toISOString()
      });
    }

    // Case B: Exam Ledger Tab (Dynamic subjects + student particulars + remarks + breakdowns)
    var isPt = String(examName).toUpperCase().indexOf("PT") === 0;
    var defaultMax = isPt ? 25 : 100;
    var subjectList = [];

    if (payload.examConfig && Array.isArray(payload.examConfig.subjects) && payload.examConfig.subjects.length > 0) {
      subjectList = payload.examConfig.subjects.map(function(s) {
        return { name: String(s.name), maxMarks: Number(s.maxMarks) || defaultMax };
      });
    } else {
      var stdNames = isPt
        ? ["English", "Hindi", "Marathi", "Maths", "Science", "Social Science"]
        : ["English", "Hindi", "Marathi", "Maths", "Science", "Social Science", "Computer Science"];
      subjectList = stdNames.map(function(n) { return { name: n, maxMarks: defaultMax }; });
    }

    var totalMax = subjectList.reduce(function(acc, s) { return acc + s.maxMarks; }, 0);
    var headers = ["Roll No", "Student Name", "Section"];
    for (var hIdx = 0; hIdx < subjectList.length; hIdx++) {
      headers.push(subjectList[hIdx].name + " (" + subjectList[hIdx].maxMarks + ")");
    }
    headers.push(
      "Total (" + totalMax + ")", "Percentage", "Grade",
      "Class", "House", "DOB", "Attendance", "Height (cm)", "Weight (kg)",
      "Father's Name", "Mother's Name", "Class Teacher Remark",
      "Subject Remarks JSON", "Breakdowns JSON"
    );

    var rows = [headers];
    for (var i = 0; i < students.length; i++) {
      var s = students[i];
      var m = s.marks || {};
      var row = [
        s.rollNo || (i + 1),
        s.name || "",
        s.section || "Sparkle"
      ];

      var numericScores = [];
      for (var subIdx = 0; subIdx < subjectList.length; subIdx++) {
        var subName = subjectList[subIdx].name;
        var val = m[subName];
        if (val === undefined && subName === "Maths" && m["Mathematics"] !== undefined) {
          val = m["Mathematics"];
        }
        var cellVal = (val !== undefined && val !== null) ? val : "";
        row.push(cellVal);
        if (typeof val === "number") {
          numericScores.push(val);
        }
      }

      var total = numericScores.length > 0 ? numericScores.reduce(function(a, b) { return a + b; }, 0) : "";
      var pct = (numericScores.length > 0 && totalMax > 0) ? (total / totalMax) * 100 : 0;
      var pctStr = numericScores.length > 0 ? pct.toFixed(2) + "%" : "";

      var grade = "-";
      if (numericScores.length > 0) {
        var roundedPct = Math.round(pct);
        if (roundedPct >= 91) grade = "A1";
        else if (roundedPct >= 81) grade = "A2";
        else if (roundedPct >= 71) grade = "B1";
        else if (roundedPct >= 61) grade = "B2";
        else if (roundedPct >= 51) grade = "C1";
        else if (roundedPct >= 41) grade = "C2";
        else if (roundedPct >= 32) grade = "D";
        else if (roundedPct >= 20) grade = "E1";
        else grade = "E2";
      }

      row.push(
        total,
        pctStr,
        grade,
        s.class || "",
        s.house || "",
        s.dob || "",
        s.attendance || "",
        s.height || "",
        s.weight || "",
        s.fatherName || "",
        s.motherName || "",
        s.customRemarks || s.remarks || "",
        s.subjectRemarks ? JSON.stringify(s.subjectRemarks) : "",
        s.breakdowns ? JSON.stringify(s.breakdowns) : ""
      );
      rows.push(row);
    }

    sheet.clearContents();
    sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

    return jsonResponse({
      success: true,
      exam: examName,
      sheetTab: sheet.getName(),
      updatedRows: rows.length - 1,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

export interface GasSyncResponse {
  success: boolean;
  count?: number;
  students?: any[];
  updatedRows?: number;
  syncedExams?: string[];
  timestamp?: string;
  error?: string;
}

export class GasSyncService {
  /**
   * Pulls data from Google Sheet using Google Apps Script Web App
   */
  static async pullData(gasUrl?: string, examName = 'SA-1'): Promise<GasSyncResponse> {
    const url = (gasUrl || getStoredGasUrl()).trim();
    if (!url) {
      return { success: false, error: 'Google Apps Script Web App URL is not configured.' };
    }

    try {
      const res = await fetch(
        `/api/gas-sync?url=${encodeURIComponent(url)}&examName=${encodeURIComponent(examName)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...getAdminAuthHeaders(),
          },
        }
      );

      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to pull from Google Apps Script' };
    }
  }

  /**
   * Pushes a single exam's roster, marks, breakdowns, and config to Google Sheet
   */
  static async pushData(
    students: any[],
    examName = 'SA-1',
    gasUrl?: string,
    examConfig?: ExamConfig,
    classes?: ClassDefinition[]
  ): Promise<GasSyncResponse> {
    const url = (gasUrl || getStoredGasUrl()).trim();
    if (!url) {
      return { success: false, error: 'Google Apps Script Web App URL is not configured.' };
    }

    try {
      const res = await fetch('/api/gas-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({
          url,
          students,
          examName,
          examConfig,
          classes,
        }),
      });

      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to push to Google Apps Script' };
    }
  }

  /**
   * Pushes ALL configured exams, student particulars/remarks, teacher mappings,
   * and full ERP system state backup to Google Sheets in one coordinated sync.
   */
  static async pushAllExams(params: {
    students: StudentReportRow[];
    selectedExam: string;
    selectedClass?: string;
    examConfigs: Record<string, ExamConfig>;
    examMarksStore: ExamMarksStore;
    examBreakdownsStore: ExamBreakdownsStore;
    classes: ClassDefinition[];
    examIdsToPush?: string[];
    gasUrl?: string;
  }): Promise<GasSyncResponse> {
    const url = (params.gasUrl || getStoredGasUrl()).trim();
    if (!url) {
      return { success: false, error: 'Google Apps Script Web App URL is not configured.' };
    }

    try {
      const res = await fetch('/api/gas-sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAdminAuthHeaders(),
        },
        body: JSON.stringify({
          action: 'syncAll',
          url,
          students: params.students,
          selectedExam: params.selectedExam,
          selectedClass: params.selectedClass || 'Sparkle',
          examConfigs: params.examConfigs,
          examMarksStore: params.examMarksStore,
          examBreakdownsStore: params.examBreakdownsStore,
          classes: params.classes,
          examIdsToPush: params.examIdsToPush,
        }),
      });

      return await res.json();
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to sync all exams to Google Sheets' };
    }
  }

  /**
   * Tests connection to Google Apps Script Web App
   */
  static async testConnection(gasUrl: string): Promise<GasSyncResponse> {
    return this.pullData(gasUrl);
  }
}
