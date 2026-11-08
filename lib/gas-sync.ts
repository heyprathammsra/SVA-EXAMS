/**
 * Google Apps Script Sync Service
 * Seamless two-way continuous sync (every 10 seconds) with Google Sheets
 * without complex OAuth popups, 403 permission errors, or token expirations.
 */

export const LOCKED_SPREADSHEET_ID = '1EzodiIYrfqqNoLgkvBATIvZAlRo00-UlDFw2XJXW0s';
export const LOCKED_SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1EzodiIYrfqqNoLgkvBATIvZAlRo00-UlDFw2XJXW0s/edit';
export const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbxX9Bt6NGyVlhJ8LnsRbI47SrUrYdYfKBAMxfKaBOnnwjBSA7ok5VfrUnJ9ha7IPw37ZA/exec';

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
 * GOOGLE APPS SCRIPT FOR SARASWATI VIDYA ACADEMY EXAM WEB APP
 * Target Sheet: SVA EXAM WEB APP (ID: 1EzodiIYrfqqNoLgkvBATIvZAlRo00-UlDFw2XJXW0s)
 * =========================================================================
 *
 * HOW TO DEPLOY (Takes 1 minute):
 * 1. Open your Google Sheet:
 *    https://docs.google.com/spreadsheets/d/1EzodiIYrfqqNoLgkvBATIvZAlRo00-UlDFw2XJXW0s/edit
 * 2. In Google Sheets top menu, click Extensions > Apps Script.
 * 3. Delete any code in Code.gs and paste THIS ENTIRE SCRIPT.
 * 4. Click the Save icon (floppy disk).
 * 5. Click "Deploy" (top right) > "New deployment".
 * 6. Click the gear icon next to "Select type" and choose "Web app".
 * 7. Set:
 *    - Description: "SVA Exam Sync API"
 *    - Execute as: "Me" (your Google account)
 *    - Who has access: "Anyone" (CRITICAL for instant sync)
 * 8. Click "Deploy", authorize access with your Google account, and copy the Web App URL.
 * 9. Paste the Web App URL into the SVA Web App Settings.
 */

var SPREADSHEET_ID = "1EzodiIYrfqqNoLgkvBATIvZAlRo00-UlDFw2XJXW0s";

/**
 * Gets or automatically creates the dedicated tab for a specific exam
 * Ensures each exam (PT-1, PT-2, PT-3, PT-4, SA-1, SA-2) has its own separate tab
 */
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

// 1. GET: Pulls all student marks from Google Sheet for the requested exam tab
function doGet(e) {
  try {
    var examName = (e && e.parameter && e.parameter.examName) ? e.parameter.examName : "SA-1";
    var sheet = getTargetSheet(examName);
    var data = sheet.getDataRange().getValues();

    if (!data || data.length < 2) {
      return jsonResponse({ success: true, count: 0, exam: examName, students: [] });
    }

    var students = [];
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      if (!row || row.length === 0 || !row[1]) continue;

      var parseVal = function(v) {
        if (v === "" || v === null || v === undefined) return null;
        if (String(v).toUpperCase() === "AB") return "AB";
        var num = parseFloat(v);
        return isNaN(num) ? null : num;
      };

      students.push({
        id: String('sva-' + (row[2] || 'Sparkle') + '-' + (row[0] || i)),
        rollNo: String(row[0] || i),
        name: String(row[1] || ""),
        section: String(row[2] || "Sparkle"),
        marks: {
          "English": parseVal(row[3]),
          "Hindi": parseVal(row[4]),
          "Marathi": parseVal(row[5]),
          "Maths": parseVal(row[6]),
          "Science": parseVal(row[7]),
          "Social Science": parseVal(row[8]),
          "Computer Science": parseVal(row[9])
        },
        breakdowns: {}
      });
    }

    // Check if dedicated Class 9 Hindi tab exists to pull internal assessment components
    try {
      var ss = sheet.getParent();
      var hindiSheet = ss.getSheetByName(examName + " - Class 9 Hindi");
      if (hindiSheet) {
        var hData = hindiSheet.getDataRange().getValues();
        if (hData && hData.length > 1) {
          for (var k = 1; k < hData.length; k++) {
            var hRow = hData[k];
            var hRoll = String(hRow[0] || "");
            var hSec = String(hRow[2] || "").toLowerCase();
            var targetStudent = students.find(function(s) {
              return String(s.rollNo) === hRoll && String(s.section).toLowerCase() === hSec;
            });
            if (targetStudent) {
              targetStudent.breakdowns = targetStudent.breakdowns || {};
              targetStudent.breakdowns["Hindi"] = {
                listening: parseVal(hRow[3]),
                speaking: parseVal(hRow[4]),
                project: parseVal(hRow[5]),
                saExam: parseVal(hRow[6])
              };
            }
          }
        }
      }
    } catch (hErr) {}

    return jsonResponse({ success: true, count: students.length, exam: examName, students: students });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  }
}

// 2. POST: Saves and pushes student marks to Google Sheet under its dedicated exam tab
function doPost(e) {
  try {
    var payload;
    if (e.postData && e.postData.contents) {
      payload = JSON.parse(e.postData.contents);
    } else {
      payload = e.parameter;
    }

    var students = payload.students || [];
    var examName = payload.examName || "SA-1";

    if (!Array.isArray(students) || students.length === 0) {
      return jsonResponse({ success: false, error: "No student records provided" });
    }

    // Open or create the separate tab specifically for this exam (e.g. SA-1, PT-1)
    var sheet = getTargetSheet(examName);
    var isPt = String(examName).toUpperCase().indexOf("PT") === 0;
    var maxPerSubject = isPt ? 20 : 100;
    var totalMax = 7 * maxPerSubject;

    var headers = [
      "Roll No", "Student Name", "Section",
      "English (" + maxPerSubject + ")", "Hindi (" + maxPerSubject + ")", "Marathi (" + maxPerSubject + ")",
      "Maths (" + maxPerSubject + ")", "Science (" + maxPerSubject + ")", "Social Science (" + maxPerSubject + ")",
      "Computer Science (" + maxPerSubject + ")",
      "Total (" + totalMax + ")", "Percentage", "Grade"
    ];

    var rows = [headers];
    for (var i = 0; i < students.length; i++) {
      var s = students[i];
      var m = s.marks || {};
      var eng = m["English"] !== undefined && m["English"] !== null ? m["English"] : "";
      var hin = m["Hindi"] !== undefined && m["Hindi"] !== null ? m["Hindi"] : "";
      var mar = m["Marathi"] !== undefined && m["Marathi"] !== null ? m["Marathi"] : "";
      var mat = (m["Maths"] !== undefined && m["Maths"] !== null ? m["Maths"] : (m["Mathematics"] !== undefined ? m["Mathematics"] : ""));
      var sci = m["Science"] !== undefined && m["Science"] !== null ? m["Science"] : "";
      var soc = m["Social Science"] !== undefined && m["Social Science"] !== null ? m["Social Science"] : "";
      var comp = m["Computer Science"] !== undefined && m["Computer Science"] !== null ? m["Computer Science"] : "";

      var scores = [eng, hin, mar, mat, sci, soc, comp].filter(function(v) { return typeof v === "number"; });
      var total = scores.length > 0 ? scores.reduce(function(a, b) { return a + b; }, 0) : "";
      var pct = scores.length > 0 ? (total / totalMax) * 100 : 0;
      var pctStr = scores.length > 0 ? pct.toFixed(1) + "%" : "";

      var grade = "-";
      if (scores.length > 0) {
        if (pct >= 91) grade = "A1";
        else if (pct >= 81) grade = "A2";
        else if (pct >= 71) grade = "B1";
        else if (pct >= 61) grade = "B2";
        else if (pct >= 51) grade = "C1";
        else if (pct >= 41) grade = "C2";
        else if (pct >= 33) grade = "D";
        else grade = "E";
      }

      rows.push([
        s.rollNo || (i + 1),
        s.name || "",
        s.section || "Sparkle",
        eng,
        hin,
        mar,
        mat,
        sci,
        soc,
        comp,
        total,
        pctStr,
        grade
      ]);
    }

    sheet.clearContents();
    sheet.getRange(1, 1, rows.length, headers.length).setValues(rows);

    // If SA-1 or SA-2: also generate dedicated Class 9 Hindi Internal Assessment tab
    if (!isPt) {
      try {
        var ss = sheet.getParent();
        var hindiTabName = examName + " - Class 9 Hindi";
        var hindiSheet = ss.getSheetByName(hindiTabName) || ss.insertSheet(hindiTabName);
        var hindiHeaders = [
          "ROLL NO", "NAME OF THE STUDENTS", "SECTION",
          "LISTENING 20", "SPEAKING 20", "PROJECT 15", examName + " 45",
          "TOTAL 100", "GRADE"
        ];
        var hindiRows = [hindiHeaders];

        for (var j = 0; j < students.length; j++) {
          var st = students[j];
          var sec = String(st.section || "").toLowerCase();
          var isC9 = sec.indexOf("ruby") !== -1 || sec.indexOf("diamond") !== -1 || sec.indexOf("9") !== -1;
          if (!isC9) continue;

          var bds = st.breakdowns || {};
          var hBd = bds["Hindi"] || {};
          var markHin = (st.marks && st.marks["Hindi"] !== undefined) ? st.marks["Hindi"] : 80;
          var numHin = typeof markHin === "number" ? markHin : 80;

          var listening = hBd.listening !== undefined && hBd.listening !== null ? hBd.listening : Math.min(20, Math.round((numHin / 100) * 20));
          var speaking = hBd.speaking !== undefined && hBd.speaking !== null ? hBd.speaking : Math.min(20, Math.round((numHin / 100) * 20));
          var project = hBd.project !== undefined && hBd.project !== null ? hBd.project : Math.min(15, Math.round((numHin / 100) * 15));
          var saExam = hBd.saExam !== undefined && hBd.saExam !== null ? hBd.saExam : Math.min(45, Math.round((numHin / 100) * 45));

          var hTotal = (typeof listening === "number" ? listening : 0) +
                       (typeof speaking === "number" ? speaking : 0) +
                       (typeof project === "number" ? project : 0) +
                       (typeof saExam === "number" ? saExam : 0);

          var hGrade = "E";
          if (hTotal >= 91) hGrade = "A1";
          else if (hTotal >= 81) hGrade = "A2";
          else if (hTotal >= 71) hGrade = "B1";
          else if (hTotal >= 61) hGrade = "B2";
          else if (hTotal >= 51) hGrade = "C1";
          else if (hTotal >= 41) hGrade = "C2";
          else if (hTotal >= 33) hGrade = "D";

          hindiRows.push([
            st.rollNo || (j + 1),
            st.name || "",
            st.section || "Ruby",
            listening,
            speaking,
            project,
            saExam,
            hTotal,
            hGrade
          ]);
        }

        hindiSheet.clearContents();
        hindiSheet.getRange(1, 1, hindiRows.length, hindiHeaders.length).setValues(hindiRows);
      } catch (subErr) {
        // Continue even if sub-tab creation encounters quota
      }
    }

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
      const res = await fetch(`/api/gas-sync?url=${encodeURIComponent(url)}&examName=${encodeURIComponent(examName)}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to pull from Google Apps Script' };
    }
  }

  /**
   * Pushes data to Google Sheet using Google Apps Script Web App
   */
  static async pushData(students: any[], examName = 'SA-1', gasUrl?: string): Promise<GasSyncResponse> {
    const url = (gasUrl || getStoredGasUrl()).trim();
    if (!url) {
      return { success: false, error: 'Google Apps Script Web App URL is not configured.' };
    }

    try {
      const res = await fetch('/api/gas-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          students,
          examName,
        }),
      });

      const data = await res.json();
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to push to Google Apps Script' };
    }
  }

  /**
   * Tests connection to Google Apps Script Web App
   */
  static async testConnection(gasUrl: string): Promise<GasSyncResponse> {
    return this.pullData(gasUrl);
  }
}
