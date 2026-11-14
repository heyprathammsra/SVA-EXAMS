import { NextRequest, NextResponse } from 'next/server';
import { getStoredTeacherAccountsForBackup } from '@/lib/auth';
import { isRequestAuthenticated } from '@/lib/auth-server';
import { PersistedErpState } from '@/lib/erp-persistence';
import { pushCloudBackupToGoogleSheet } from '@/lib/sheets-cloud-store';

export const dynamic = 'force-dynamic';

function validateGasUrl(url: string): { valid: boolean; error?: string } {
  if (url.includes('docs.google.com/spreadsheets')) {
    return {
      valid: false,
      error:
        'You pasted a Google Sheets document link instead of a Web App URL. In Google Sheets, click Extensions > Apps Script > Deploy > New Deployment > Web App, and copy the Web App URL (ends with /exec).',
    };
  }
  if (url.includes('/edit') || url.includes('script.google.com/home/projects')) {
    return {
      valid: false,
      error:
        'You pasted the Google Apps Script code editor link. In Apps Script, click "Deploy" > "New deployment" (or "Manage deployments"), and copy the Web App URL ending in /exec.',
    };
  }
  if (url.endsWith('/dev') || url.includes('/dev?')) {
    return {
      valid: false,
      error:
        'You pasted a developer test URL ending in /dev (which requires Google login). Please copy the deployed production Web App URL ending in /exec.',
    };
  }
  if (!url.includes('script.google.com/macros/s/')) {
    return {
      valid: false,
      error:
        'Invalid Google Apps Script Web App URL format. The URL must start with: https://script.google.com/macros/s/... and end with /exec',
    };
  }
  return { valid: true };
}

function safeParseJsonResponse(rawText: string): { success: boolean; data?: any; error?: string } {
  const trimmed = rawText.trim();
  try {
    const parsed = JSON.parse(trimmed);
    const isSuccess =
      parsed.success === true ||
      parsed.status === 'success' ||
      parsed.status === 200 ||
      Array.isArray(parsed) ||
      Array.isArray(parsed.data) ||
      Array.isArray(parsed.students);
    return { success: isSuccess, data: parsed };
  } catch {
    const lower = trimmed.toLowerCase();
    if (
      lower.includes('servicelogin') ||
      lower.includes('accounts.google.com') ||
      lower.includes('google accounts') ||
      lower.includes('sign in') ||
      lower.includes('login')
    ) {
      return {
        success: false,
        error:
          "Google Apps Script redirected to Google Login (Access Restricted). Fix: In Google Apps Script, click Deploy > Manage deployments > Edit (pencil icon) > Set 'Who has access: Anyone' & Version: 'New version' > Click Deploy.",
      };
    }
    if (lower.includes('<html') || lower.includes('<!doctype')) {
      return {
        success: false,
        error:
          "Google Apps Script returned an HTML page instead of JSON. Fix: In Apps Script, click Deploy > Manage deployments > Edit (pencil icon) > Set 'Who has access: Anyone' & Version: 'New version' > Deploy.",
      };
    }
    return {
      success: false,
      error: `Invalid response format from Google Apps Script: ${trimmed.slice(0, 150)}`,
    };
  }
}

const META_COLUMN_KEYS = new Set([
  'id',
  'rollno',
  'roll no',
  'roll',
  'name',
  'student name',
  'name of the students',
  'studentname',
  'section',
  'class',
  'house',
  'dob',
  'attendance',
  'height',
  'height (cm)',
  'weight',
  'weight (kg)',
  'fathername',
  "father's name",
  'mothername',
  "mother's name",
  'remarks',
  'customremarks',
  'class teacher remark',
  'subjectremarks',
  'subject remarks json',
  'breakdowns',
  'breakdowns json',
  'marks',
  'total',
  'percentage',
  'grade',
  'admissionno',
]);

function normalizeStudentList(rawData: any): any[] {
  let list: any[] = [];
  if (Array.isArray(rawData)) {
    list = rawData;
  } else if (rawData && typeof rawData === 'object') {
    if (Array.isArray(rawData.students)) {
      list = rawData.students;
    } else if (Array.isArray(rawData.data)) {
      list = rawData.data;
    }
  }

  return list.map((item: any, idx: number) => {
    if (!item || typeof item !== 'object') return item;
    const rollNo =
      parseInt(
        String(
          item.rollNo ??
            item['Roll No'] ??
            item['Roll'] ??
            item['ROLL NO'] ??
            item['roll'] ??
            idx + 1
        ),
        10
      ) || idx + 1;

    const name = String(
      item.name ??
        item['Student Name'] ??
        item['Name'] ??
        item['NAME OF THE STUDENTS'] ??
        item['studentName'] ??
        ''
    ).trim();

    const section = String(
      item.section ?? item['Section'] ?? item['SECTION'] ?? item['Class'] ?? 'Sparkle'
    ).trim();

    const marks: Record<string, number | 'AB' | null> = {};
    if (item.marks && typeof item.marks === 'object') {
      for (const [subKey, rawVal] of Object.entries(item.marks)) {
        const targetSub = subKey === 'Mathematics' ? 'Maths' : subKey;
        if (rawVal === null || rawVal === undefined || rawVal === '') {
          marks[targetSub] = null;
        } else if (rawVal === 'AB' || String(rawVal).trim().toUpperCase() === 'AB') {
          marks[targetSub] = 'AB';
        } else {
          const num = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal));
          marks[targetSub] = !isNaN(num) ? num : null;
        }
      }
    }

    // Also parse any flat subject column (standard or custom Admin subjects)
    for (const [k, v] of Object.entries(item)) {
      const cleanKey = k.replace(/\s*\(\d+\)\s*$/g, '').trim();
      const lowerKey = cleanKey.toLowerCase();
      if (!cleanKey || META_COLUMN_KEYS.has(lowerKey) || lowerKey.startsWith('total')) {
        continue;
      }
      const targetSub = cleanKey === 'Mathematics' ? 'Maths' : cleanKey;
      if (marks[targetSub] === undefined) {
        if (v === null || v === undefined || v === '') {
          marks[targetSub] = null;
        } else if (v === 'AB' || String(v).trim().toUpperCase() === 'AB') {
          marks[targetSub] = 'AB';
        } else {
          const num = typeof v === 'number' ? v : parseFloat(String(v));
          if (!isNaN(num)) marks[targetSub] = num;
        }
      }
    }

    let breakdowns = item.breakdowns;
    if (typeof breakdowns === 'string') {
      try {
        breakdowns = JSON.parse(breakdowns);
      } catch {
        breakdowns = undefined;
      }
    }

    let subjectRemarks = item.subjectRemarks;
    if (typeof subjectRemarks === 'string') {
      try {
        subjectRemarks = JSON.parse(subjectRemarks);
      } catch {
        subjectRemarks = undefined;
      }
    }

    const remarksVal = item.customRemarks ?? item.remarks ?? item['Class Teacher Remark'];

    return {
      id: String(item.id || `sva-${section}-${rollNo}`),
      rollNo: String(rollNo).padStart(2, '0'),
      name,
      class: item.class ? String(item.class) : undefined,
      section,
      admissionNo: item.admissionNo ? String(item.admissionNo) : undefined,
      dob: item.dob ? String(item.dob) : undefined,
      fatherName: item.fatherName ? String(item.fatherName) : undefined,
      motherName: item.motherName ? String(item.motherName) : undefined,
      house: item.house ? String(item.house) : undefined,
      height: item.height ? String(item.height) : undefined,
      weight: item.weight ? String(item.weight) : undefined,
      attendance: item.attendance ? String(item.attendance) : undefined,
      remarks: remarksVal ? String(remarksVal) : undefined,
      customRemarks: remarksVal ? String(remarksVal) : undefined,
      marks,
      breakdowns: breakdowns && typeof breakdowns === 'object' ? breakdowns : undefined,
      subjectRemarks:
        subjectRemarks && typeof subjectRemarks === 'object' ? subjectRemarks : undefined,
    };
  });
}

export async function GET(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const gasUrl = searchParams.get('url')?.trim();
    const examName = searchParams.get('examName')?.trim() || 'SA-1';

    if (!gasUrl) {
      return NextResponse.json(
        { success: false, error: 'Google Apps Script Web App URL is not configured.' },
        { status: 200 }
      );
    }

    const validation = validateGasUrl(gasUrl);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 200 });
    }

    const targetUrl = gasUrl.includes('?')
      ? `${gasUrl}&examName=${encodeURIComponent(examName)}`
      : `${gasUrl}?examName=${encodeURIComponent(examName)}`;

    const gasRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    });

    const resText = await gasRes.text();
    const result = safeParseJsonResponse(resText);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to parse response from Google Apps Script',
        },
        { status: 200 }
      );
    }

    const normalizedStudents = normalizeStudentList(result.data);

    return NextResponse.json({
      success: true,
      status: 'success',
      count: normalizedStudents.length,
      students: normalizedStudents,
      data: normalizedStudents,
      raw: result.data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to communicate with Google Apps Script' },
      { status: 200 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthenticated(req)) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }
  try {
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Empty or invalid request body' },
        { status: 400 }
      );
    }

    const gasUrl = (body.url || '').trim();
    if (!gasUrl) {
      return NextResponse.json(
        { success: false, error: 'Google Apps Script Web App URL is not configured.' },
        { status: 200 }
      );
    }

    const validation = validateGasUrl(gasUrl);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 200 });
    }

    // Coordinated multi-exam + Teachers & Mapping + ERP_System_State sync
    if (body.action === 'syncAll') {
      const students = Array.isArray(body.students) ? body.students : [];
      const examConfigs = body.examConfigs && typeof body.examConfigs === 'object' ? body.examConfigs : {};
      const examMarksStore = body.examMarksStore && typeof body.examMarksStore === 'object' ? body.examMarksStore : {};
      const examBreakdownsStore =
        body.examBreakdownsStore && typeof body.examBreakdownsStore === 'object'
          ? body.examBreakdownsStore
          : {};
      const classes = Array.isArray(body.classes) ? body.classes : [];
      const selectedExam = body.selectedExam || 'SA-1';
      const selectedClass = body.selectedClass || 'Sparkle';
      const examIds: string[] = Array.isArray(body.examIdsToPush)
        ? body.examIdsToPush
        : Object.keys(examConfigs);

      const fullState: PersistedErpState = {
        version: 1,
        initialized: true,
        updatedAt: Date.now(),
        selectedClass,
        selectedExam,
        classes,
        examConfigs,
        students,
        examMarksStore,
        examBreakdownsStore,
      };

      const syncedExams: string[] = [];

      // 1. Push ERP_System_State + Teachers & Mapping tabs
      await pushCloudBackupToGoogleSheet(
        fullState,
        getStoredTeacherAccountsForBackup(),
        gasUrl
      );

      // 2. Push each requested exam tab with its exam-specific marks, breakdowns, and examConfig
      for (const examId of examIds) {
        const examCfg = examConfigs[examId];
        const storeMarksForExam = examMarksStore[examId] || {};
        const storeBdsForExam = examBreakdownsStore[examId] || {};
        const studentsForExam = students.map((st: any) => ({
          ...st,
          marks:
            examId === selectedExam
              ? st.marks || storeMarksForExam[st.id] || {}
              : storeMarksForExam[st.id] || {},
          breakdowns:
            examId === selectedExam
              ? st.breakdowns || storeBdsForExam[st.id] || {}
              : storeBdsForExam[st.id] || {},
        }));

        try {
          const examRes = await fetch(gasUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              students: studentsForExam,
              examName: examId,
              examConfig: examCfg,
              classes,
              timestamp: new Date().toISOString(),
            }),
            redirect: 'follow',
            signal: AbortSignal.timeout(12000),
          });
          if (examRes.ok) {
            syncedExams.push(examId);
          }
        } catch {}
      }

      return NextResponse.json({
        success: true,
        updatedRows: students.length,
        syncedExams,
        timestamp: new Date().toISOString(),
      });
    }

    const { students, examName, examConfig, classes } = body;

    const gasRes = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        students,
        examName,
        examConfig,
        classes,
        timestamp: new Date().toISOString(),
      }),
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });

    const resText = await gasRes.text();
    const result = safeParseJsonResponse(resText);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || 'Failed to parse response from Google Apps Script',
        },
        { status: 200 }
      );
    }

    return NextResponse.json(result.data);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to push to Google Apps Script' },
      { status: 200 }
    );
  }
}
