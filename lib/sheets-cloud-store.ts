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
    .map((r) => String(r?.name || '').trim().replace(/^'+/, ''))
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

export interface CloudPushOptions {
  authoritativeTeachers?: boolean;
  allowNullState?: boolean;
}

function getTeachersSnapshotSignature(teachers: StoredTeacherAccount[]): string {
  return JSON.stringify(
    [...teachers]
      .sort((a, b) => a.username.localeCompare(b.username))
      .map((t) => ({
        id: t.id,
        username: t.username,
        name: t.name,
        assignedSubject: t.assignedSubject,
        assignedClasses: [...(t.assignedClasses || [])].sort(),
        classTeacherOf: t.classTeacherOf ?? null,
        assignments: [...(t.assignments || [])].sort((a, b) =>
          `${a.section}::${a.subject}`.localeCompare(`${b.section}::${b.subject}`)
        ),
        passwordHashHex: t.passwordHashHex,
        updatedAt: t.updatedAt || 0,
      }))
  );
}

export function mergeCloudBackupForPush(params: {
  incomingState: PersistedErpState | null;
  incomingTeachers: StoredTeacherAccount[];
  existingCloud: CloudBackupPayload | null;
  nowMs?: number;
  authoritativeTeachers?: boolean;
  allowNullState?: boolean;
}): {
  state: PersistedErpState | null;
  teachers: StoredTeacherAccount[];
  updatedAt: number;
} {
  const {
    incomingState,
    incomingTeachers,
    existingCloud,
    nowMs = Date.now(),
    authoritativeTeachers = false,
    allowNullState = false,
  } = params;

  let mergedState: PersistedErpState | null = incomingState;
  if (!mergedState) {
    mergedState = allowNullState ? null : existingCloud?.state ?? null;
  } else if (
    existingCloud?.state?.initialized &&
    (existingCloud.state.updatedAt || 0) > (mergedState.updatedAt || 0)
  ) {
    mergedState = existingCloud.state;
  }

  let mergedTeachers: StoredTeacherAccount[] = Array.isArray(incomingTeachers)
    ? incomingTeachers
    : [];

  if (!authoritativeTeachers && existingCloud?.teachers && existingCloud.teachers.length > 0) {
    const incomingMax = Math.max(0, ...mergedTeachers.map((t) => t.updatedAt || 0));
    const existingMax = Math.max(0, ...existingCloud.teachers.map((t) => t.updatedAt || 0));
    const cloudIsNewer = existingMax > incomingMax;

    if (mergedTeachers.length === 0 || cloudIsNewer) {
      mergedTeachers = existingCloud.teachers;
    }
  }

  const baseTs = Math.max(
    nowMs,
    mergedState?.updatedAt || 0,
    ...mergedTeachers.map((t) => t.updatedAt || 0)
  );
  const updatedAt =
    existingCloud && baseTs <= (existingCloud.updatedAt || 0)
      ? existingCloud.updatedAt + 1
      : baseTs;

  return {
    state: mergedState,
    teachers: mergedTeachers,
    updatedAt,
  };
}

let lastCloudPullMs = 0;
let cachedCloudPayload: CloudBackupPayload | null = null;
let cloudPushQueue: Promise<unknown> = Promise.resolve();

export function getCachedCloudPayload(): CloudBackupPayload | null {
  return cachedCloudPayload;
}

export function primeCachedCloudSnapshot(params: {
  state?: PersistedErpState | null;
  teachers?: StoredTeacherAccount[];
  nowMs?: number;
}): void {
  const nowMs = params.nowMs ?? Date.now();
  const nextState =
    params.state !== undefined ? params.state : cachedCloudPayload?.state ?? null;
  const nextTeachers =
    params.teachers !== undefined ? params.teachers : cachedCloudPayload?.teachers ?? [];
  const updatedAt = Math.max(
    nowMs,
    cachedCloudPayload?.updatedAt || 0,
    nextState?.updatedAt || 0,
    ...nextTeachers.map((t) => t.updatedAt || 0)
  );
  cachedCloudPayload = {
    v: 1,
    updatedAt,
    state: nextState,
    teachers: nextTeachers,
  };
  lastCloudPullMs = nowMs;
}

/**
 * Pushes the compressed ERP state & teacher accounts to `ERP_System_State`
 * and human-readable teacher mappings to `Teachers & Mapping` in Google Sheets.
 * Pushes are serialized via an async queue so concurrent mutations never arrive out-of-order.
 */
export async function pushCloudBackupToGoogleSheet(
  state: PersistedErpState | null,
  teachers: StoredTeacherAccount[],
  gasUrl: string = DEFAULT_GAS_URL,
  options: CloudPushOptions = {}
): Promise<{ success: boolean; error?: string; updatedAt?: number }> {
  const cleanUrl = (gasUrl || DEFAULT_GAS_URL).trim();
  if (!cleanUrl || !cleanUrl.includes('script.google.com/macros/s/')) {
    return { success: false, error: 'Invalid GAS URL' };
  }

  const runPush = async (): Promise<{ success: boolean; error?: string; updatedAt?: number }> => {
    try {
      // If local state or teachers might lag behind another container on cold start, inspect cloud first
      if (!cachedCloudPayload && (!state || !options.authoritativeTeachers)) {
        await pullCloudBackupFromGoogleSheet({ force: true, gasUrl: cleanUrl }).catch(() => null);
      }

      const nowMs = Date.now();
      const merged = mergeCloudBackupForPush({
        incomingState: state,
        incomingTeachers: teachers,
        existingCloud: cachedCloudPayload,
        nowMs,
        authoritativeTeachers: options.authoritativeTeachers,
        allowNullState: options.allowNullState,
      });

      const stateRows = encodeCloudBackupRows(merged.state, merged.teachers, merged.updatedAt);
      const teacherProfiles: TeacherProfile[] = merged.teachers.map(
        ({ passwordHashHex: _ignored, ...rest }) => rest
      );
      const teacherSheetRows = buildTeachersMappingSheetRows(teacherProfiles);

      const nextPayload: CloudBackupPayload = {
        v: 1,
        updatedAt: merged.updatedAt,
        state: merged.state,
        teachers: merged.teachers,
      };
      cachedCloudPayload = nextPayload;
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
        fetch(cleanUrl, {
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
        }).catch(() => null),
      ]);

      if (!stateRes.ok) {
        return { success: false, error: `HTTP ${stateRes.status}` };
      }
      lastCloudPullMs = Date.now();
      return { success: true, updatedAt: merged.updatedAt };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Cloud backup push failed' };
    }
  };

  activeCloudPushCount += 1;
  const task = cloudPushQueue.then(runPush, runPush).finally(() => {
    activeCloudPushCount = Math.max(0, activeCloudPushCount - 1);
  });
  cloudPushQueue = task.then(
    () => undefined,
    () => undefined
  );
  return task;
}

let activeCloudPushCount = 0;

/**
 * Pulls the latest ERP state & teacher accounts from `ERP_System_State` in Google Sheets.
 * Uses a short 4-second cooldown cache unless `force: true` is specified.
 */
export async function pullCloudBackupFromGoogleSheet(
  options: { force?: boolean; gasUrl?: string; timeoutMs?: number } = {}
): Promise<CloudBackupPayload | null> {
  const nowMs = Date.now();
  if (activeCloudPushCount > 0 && cachedCloudPayload) {
    return cachedCloudPayload;
  }
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
      signal: AbortSignal.timeout(options.timeoutMs ?? 6000),
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
      if (
        !cachedCloudPayload ||
        decoded.updatedAt >= (cachedCloudPayload.updatedAt || 0)
      ) {
        cachedCloudPayload = decoded;
      }
    }
    return cachedCloudPayload || decoded;
  } catch {
    return cachedCloudPayload;
  }
}
