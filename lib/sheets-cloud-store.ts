import { gzipSync, gunzipSync } from 'node:zlib';
import { PersistedErpState } from './erp-persistence';
import { StoredTeacherAccount } from './auth';
import { TeacherProfile } from './teacher-permissions';
import { DEFAULT_GAS_URL } from './gas-sync';

export const CLOUD_STATE_SHEET_TAB = 'ERP_System_State';
export const TEACHERS_MAPPING_SHEET_TAB = 'Teachers & Mapping';
export const CLASSES_ROSTER_SHEET_TAB = 'Classes & Roster';

const CHUNK_CHAR_LIMIT = 30000;
const CLOUD_HEADER_PREFIX = 'SVA_CLOUD_V1';

export interface CloudBackupPayload {
  v: 1;
  updatedAt: number;
  state: PersistedErpState | null;
  teachers: StoredTeacherAccount[];
}

export interface SheetRowPayload {
  id: string;
  rollNo: string;
  name: string;
  section: string;
  marks: Record<string, number | 'AB' | null>;
}

/**
 * Encodes the full ERP state (classes, exams, subjects, internal breakdowns, remarks, marks)
 * and teacher user accounts into gzipped base64 rows compatible with both v1 and v2 Google Apps Script.
 */
export function encodeCloudBackupRows(
  state: PersistedErpState | null,
  teachers: StoredTeacherAccount[],
  nowMs: number = Date.now()
): SheetRowPayload[] {
  const updatedAt = Math.max(
    state?.updatedAt || 0,
    ...teachers.map((t) => t.updatedAt || 0),
    nowMs
  );
  const payload: CloudBackupPayload = {
    v: 1,
    updatedAt,
    state,
    teachers,
  };
  const json = JSON.stringify(payload);
  const compressedB64 = gzipSync(Buffer.from(json, 'utf8')).toString('base64');

  const chunks: string[] = [];
  for (let i = 0; i < compressedB64.length; i += CHUNK_CHAR_LIMIT) {
    chunks.push(compressedB64.slice(i, i + CHUNK_CHAR_LIMIT));
  }
  if (chunks.length === 0) {
    chunks.push('');
  }

  return chunks.map((chunk, idx) => ({
    id: `cloud-chunk-${idx + 1}`,
    rollNo: String(idx + 1),
    name: chunk,
    section:
      idx === 0
        ? `${CLOUD_HEADER_PREFIX}:${chunks.length}:${updatedAt}`
        : `CHUNK_${idx + 1}_OF_${chunks.length}`,
    marks: {
      English: state ? state.students.length : 0,
      Hindi: state ? Object.keys(state.examConfigs || {}).length : 0,
      Marathi: state ? (state.classes || []).length : 0,
      Maths: teachers.length,
      Science: null,
      'Social Science': null,
      'Computer Science': null,
    },
  }));
}

/**
 * Decodes gzipped base64 rows retrieved from the `ERP_System_State` tab in Google Sheets.
 */
export function decodeCloudBackupRows(
  rows: Array<{ rollNo?: any; name?: any; section?: any }>
): CloudBackupPayload | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const sorted = [...rows].sort((a, b) => {
    const ra = parseInt(String(a?.rollNo ?? 0), 10) || 0;
    const rb = parseInt(String(b?.rollNo ?? 0), 10) || 0;
    return ra - rb;
  });

  const firstSection = String(sorted[0]?.section || '').trim();
  if (!firstSection.startsWith(`${CLOUD_HEADER_PREFIX}:`)) {
    return null;
  }

  const parts = firstSection.split(':');
  const expectedChunks = parseInt(parts[1] || '1', 10) || 1;
  if (sorted.length < expectedChunks) {
    return null;
  }

  const combinedB64 = sorted
    .slice(0, expectedChunks)
    .map((r) => String(r?.name || '').trim())
    .join('');

  if (!combinedB64) return null;

  try {
    const decompressed = gunzipSync(Buffer.from(combinedB64, 'base64')).toString('utf8');
    const parsed = JSON.parse(decompressed);
    if (!parsed || typeof parsed !== 'object' || parsed.v !== 1) {
      return null;
    }
    return {
      v: 1,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
      state: parsed.state && typeof parsed.state === 'object' ? parsed.state : null,
      teachers: Array.isArray(parsed.teachers) ? parsed.teachers : [],
    };
  } catch {
    return null;
  }
}

/**
 * Builds human-readable rows for the `Teachers & Mapping` tab in Google Sheets
 * so administrators inspecting the Google Sheet directly can see all teacher accounts,
 * their assigned subject, mapped classes, and Class Teacher status.
 */
export function buildTeachersMappingSheetRows(
  teachers: TeacherProfile[]
): SheetRowPayload[] {
  return teachers.map((t, idx) => {
    const classTeacherLabel = t.classTeacherOf
      ? `Class Teacher: ${t.classTeacherOf} (View-Only All Subjects)`
      : 'Not a Class Teacher';
    const assignedList =
      Array.isArray(t.assignedClasses) && t.assignedClasses.length > 0
        ? t.assignedClasses.join(', ')
        : 'None';
    return {
      id: t.id || `teacher-${t.username}-${idx + 1}`,
      rollNo: `@${t.username}`,
      name: `${t.name} | Subject: ${t.assignedSubject} | ${classTeacherLabel}`,
      section: `Mapped Classes (${t.assignedSubject}): ${assignedList}`,
      marks: {
        English: (t.assignedClasses || []).length,
        Hindi: t.classTeacherOf ? 1 : 0,
        Marathi: null,
        Maths: null,
        Science: null,
        'Social Science': null,
        'Computer Science': null,
      },
    };
  });
}

let lastCloudPullMs = 0;
let cachedCloudPayload: CloudBackupPayload | null = null;

/**
 * Pushes the compressed ERP state & teacher accounts to `ERP_System_State`
 * and human-readable teacher mappings to `Teachers & Mapping` in Google Sheets.
 */
export async function pushCloudBackupToGoogleSheet(
  state: PersistedErpState | null,
  teachers: StoredTeacherAccount[],
  gasUrl: string = DEFAULT_GAS_URL
): Promise<{ success: boolean; error?: string }> {
  const cleanUrl = (gasUrl || DEFAULT_GAS_URL).trim();
  if (!cleanUrl || !cleanUrl.includes('script.google.com/macros/s/')) {
    return { success: false, error: 'Invalid GAS URL' };
  }

  try {
    const nowMs = Date.now();
    const stateRows = encodeCloudBackupRows(state, teachers, nowMs);
    const teacherProfiles: TeacherProfile[] = teachers.map(
      ({ passwordHashHex: _ignored, ...rest }) => rest
    );
    const teacherSheetRows = buildTeachersMappingSheetRows(teacherProfiles);

    cachedCloudPayload = {
      v: 1,
      updatedAt: Math.max(
        state?.updatedAt || 0,
        ...teachers.map((t) => t.updatedAt || 0),
        nowMs
      ),
      state,
      teachers,
    };
    lastCloudPullMs = nowMs;

    const [stateRes] = await Promise.all([
      fetch(cleanUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          examName: CLOUD_STATE_SHEET_TAB,
          students: stateRows,
          isSystemBackup: true,
          timestamp: new Date(nowMs).toISOString(),
        }),
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
      }),
      teacherSheetRows.length > 0
        ? fetch(cleanUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            body: JSON.stringify({
              examName: TEACHERS_MAPPING_SHEET_TAB,
              students: teacherSheetRows,
              isTeachersTab: true,
              teachers: teacherProfiles,
              timestamp: new Date(nowMs).toISOString(),
            }),
            redirect: 'follow',
            signal: AbortSignal.timeout(10000),
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    if (!stateRes.ok) {
      return { success: false, error: `HTTP ${stateRes.status}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Cloud backup push failed' };
  }
}

/**
 * Pulls the latest ERP state & teacher accounts from `ERP_System_State` in Google Sheets.
 * Uses a short 4-second cooldown cache so repeated API calls remain fast.
 */
export async function pullCloudBackupFromGoogleSheet(
  options: { force?: boolean; gasUrl?: string } = {}
): Promise<CloudBackupPayload | null> {
  const nowMs = Date.now();
  if (!options.force && cachedCloudPayload && nowMs - lastCloudPullMs < 4000) {
    return cachedCloudPayload;
  }

  const cleanUrl = (options.gasUrl || DEFAULT_GAS_URL).trim();
  if (!cleanUrl || !cleanUrl.includes('script.google.com/macros/s/')) {
    return cachedCloudPayload;
  }

  try {
    const targetUrl = cleanUrl.includes('?')
      ? `${cleanUrl}&examName=${encodeURIComponent(CLOUD_STATE_SHEET_TAB)}`
      : `${cleanUrl}?examName=${encodeURIComponent(CLOUD_STATE_SHEET_TAB)}`;

    const res = await fetch(targetUrl, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return cachedCloudPayload;

    const parsed = await res.json().catch(() => null);
    const rows = Array.isArray(parsed?.students)
      ? parsed.students
      : Array.isArray(parsed?.data)
      ? parsed.data
      : [];

    const decoded = decodeCloudBackupRows(rows);
    lastCloudPullMs = Date.now();
    if (decoded) {
      cachedCloudPayload = decoded;
    }
    return decoded;
  } catch {
    return cachedCloudPayload;
  }
}
