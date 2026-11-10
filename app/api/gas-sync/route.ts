import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Server-side proxy for Google Apps Script Web App.
 * Automatically follows 302 redirects from script.google.com to script.googleusercontent.com
 * and avoids all browser CORS / authorization limitations.
 */

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

  const knownSubjects = [
    'English',
    'Hindi',
    'Marathi',
    'Maths',
    'Mathematics',
    'Science',
    'Social Science',
    'Computer Science',
  ];

  return list.map((item: any, idx: number) => {
    if (!item || typeof item !== 'object') return item;
    const rollNo = parseInt(
      String(
        item.rollNo ??
          item['Roll No'] ??
          item['Roll'] ??
          item['ROLL NO'] ??
          item['roll'] ??
          idx + 1
      ),
      10
    ) || (idx + 1);

    const name = String(
      item.name ??
        item['Student Name'] ??
        item['Name'] ??
        item['NAME OF THE STUDENTS'] ??
        item['studentName'] ??
        ''
    ).trim();

    const section = String(
      item.section ??
        item['Section'] ??
        item['SECTION'] ??
        item['Class'] ??
        '9 Diamond'
    ).trim();

    const marks: Record<string, number | 'AB' | null> = {};
    if (item.marks && typeof item.marks === 'object') {
      Object.assign(marks, item.marks);
    }

    for (const [k, v] of Object.entries(item)) {
      const cleanKey = k.replace(/\s*\(\d+\)/g, '').trim();
      for (const sub of knownSubjects) {
        if (cleanKey.toLowerCase() === sub.toLowerCase()) {
          const targetSub = sub === 'Mathematics' ? 'Maths' : sub;
          if (marks[targetSub] === undefined) {
            if (v === 'AB' || String(v).trim().toUpperCase() === 'AB') {
              marks[targetSub] = 'AB';
            } else if (v !== null && v !== undefined && v !== '') {
              const num = typeof v === 'number' ? v : parseFloat(String(v));
              if (!isNaN(num)) marks[targetSub] = num;
            }
          }
        }
      }
    }

    return {
      id: String(item.id || `sheet_${section}_${rollNo}`),
      rollNo,
      name,
      section,
      marks,
      breakdowns: item.breakdowns || undefined,
      subjectRemarks: item.subjectRemarks || undefined,
    };
  });
}

export async function GET(req: NextRequest) {
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
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 200 }
      );
    }

    const targetUrl = gasUrl.includes('?') 
      ? `${gasUrl}&examName=${encodeURIComponent(examName)}`
      : `${gasUrl}?examName=${encodeURIComponent(examName)}`;

    const gasRes = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      redirect: 'follow',
      cache: 'no-store',
    });

    const resText = await gasRes.text();
    const result = safeParseJsonResponse(resText);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to parse response from Google Apps Script' },
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
    const { url, students, examName } = body;
    const gasUrl = (url || '').trim();

    if (!gasUrl) {
      return NextResponse.json(
        { success: false, error: 'Google Apps Script Web App URL is not configured.' },
        { status: 200 }
      );
    }

    const validation = validateGasUrl(gasUrl);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 200 }
      );
    }

    const gasRes = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        students,
        examName,
        timestamp: new Date().toISOString(),
      }),
      redirect: 'follow',
    });

    const resText = await gasRes.text();
    const result = safeParseJsonResponse(resText);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || 'Failed to parse response from Google Apps Script' },
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

