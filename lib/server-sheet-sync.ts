import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getStoredTeacherAccountsForBackup } from './auth';
import { PersistedErpState } from './erp-persistence';
import { DEFAULT_GAS_URL } from './gas-sync';
import {
  publishErpEvent,
  readServerStateFile,
} from './server-erp-store';
import { pushCloudBackupToGoogleSheet } from './sheets-cloud-store';

const DATA_DIR = path.join(process.cwd(), '.data');
const SYNC_QUEUE_FILE = path.join(DATA_DIR, 'erp-sync-queue.json');

export interface PersistedSyncQueue {
  pendingExams: string[];
  needsFullSync: boolean;
  cloudBackupPending: boolean;
  teachersAuthoritative: boolean;
  gasUrl: string;
  lastEnqueuedAt: number;
  lastAttemptAt: number;
  lastSyncedAt: string | null;
  lastError: string | null;
  retryCount: number;
}

export interface ServerSyncStatusSnapshot {
  status: 'idle' | 'syncing' | 'synced' | 'error';
  pendingExams: string[];
  needsFullSync: boolean;
  cloudBackupPending: boolean;
  lastSyncedAt: string | null;
  lastError: string | null;
}

const DEFAULT_QUEUE: PersistedSyncQueue = {
  pendingExams: [],
  needsFullSync: false,
  cloudBackupPending: false,
  teachersAuthoritative: false,
  gasUrl: DEFAULT_GAS_URL,
  lastEnqueuedAt: 0,
  lastAttemptAt: 0,
  lastSyncedAt: null,
  lastError: null,
  retryCount: 0,
};

let queueLock: Promise<unknown> = Promise.resolve();
let activeWorkerPromise: Promise<ServerSyncStatusSnapshot> | null = null;
let scheduledWorkerTimer: ReturnType<typeof setTimeout> | null = null;
let rerunRequested = false;

function withQueueLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = queueLock.then(fn, fn);
  queueLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

function isValidGasExecUrl(url: string | undefined): url is string {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return (
    trimmed.includes('script.google.com/macros/s/') &&
    !trimmed.endsWith('/dev') &&
    !trimmed.includes('/dev?')
  );
}

export function mergeSyncQueueState(
  existing: PersistedSyncQueue,
  update: {
    examIds?: string[];
    fullSync?: boolean;
    cloudBackup?: boolean;
    teachersAuthoritative?: boolean;
    gasUrl?: string;
    nowMs?: number;
  }
): PersistedSyncQueue {
  const nextExams = new Set(existing.pendingExams || []);
  for (const id of update.examIds || []) {
    if (typeof id === 'string' && id.trim()) {
      nextExams.add(id.trim());
    }
  }
  const nextGasUrl = isValidGasExecUrl(update.gasUrl)
    ? update.gasUrl.trim()
    : isValidGasExecUrl(existing.gasUrl)
    ? existing.gasUrl
    : DEFAULT_GAS_URL;

  return {
    ...existing,
    pendingExams: Array.from(nextExams),
    needsFullSync: Boolean(existing.needsFullSync || update.fullSync),
    cloudBackupPending: Boolean(
      existing.cloudBackupPending || update.cloudBackup !== false
    ),
    teachersAuthoritative: Boolean(
      existing.teachersAuthoritative || update.teachersAuthoritative
    ),
    gasUrl: nextGasUrl,
    lastEnqueuedAt: update.nowMs ?? Date.now(),
    retryCount: 0,
  };
}

async function readQueueFile(): Promise<PersistedSyncQueue> {
  try {
    const raw = await readFile(SYNC_QUEUE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return {
        ...DEFAULT_QUEUE,
        ...parsed,
        pendingExams: Array.isArray(parsed.pendingExams) ? parsed.pendingExams : [],
      };
    }
  } catch {}
  return { ...DEFAULT_QUEUE };
}

async function writeQueueFile(queue: PersistedSyncQueue): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = `${SYNC_QUEUE_FILE}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(queue), 'utf8');
  await rename(tmp, SYNC_QUEUE_FILE);
}

function toStatusSnapshot(
  queue: PersistedSyncQueue,
  isRunning: boolean
): ServerSyncStatusSnapshot {
  const hasPending =
    queue.needsFullSync || queue.cloudBackupPending || queue.pendingExams.length > 0;
  const status: ServerSyncStatusSnapshot['status'] = isRunning
    ? 'syncing'
    : queue.lastError && hasPending
    ? 'error'
    : hasPending
    ? 'syncing'
    : queue.lastSyncedAt
    ? 'synced'
    : 'idle';

  return {
    status,
    pendingExams: [...queue.pendingExams],
    needsFullSync: queue.needsFullSync,
    cloudBackupPending: queue.cloudBackupPending,
    lastSyncedAt: queue.lastSyncedAt,
    lastError: queue.lastError,
  };
}

function emitSheetStatus(snapshot: ServerSyncStatusSnapshot): void {
  publishErpEvent({
    type: 'sheet_sync',
    status: snapshot.status === 'idle' ? 'synced' : snapshot.status,
    pendingExams: snapshot.pendingExams,
    lastSyncedAt: snapshot.lastSyncedAt,
    lastError: snapshot.lastError,
  });
}

async function pushExamTabToGas(
  state: PersistedErpState,
  examId: string,
  gasUrl: string
): Promise<{ ok: boolean; error?: string }> {
  const examCfg = state.examConfigs?.[examId];
  const storeMarksForExam = state.examMarksStore?.[examId] || {};
  const storeBdsForExam = state.examBreakdownsStore?.[examId] || {};

  const studentsForExam = (state.students || []).map((st) => ({
    ...st,
    marks:
      examId === state.selectedExam
        ? st.marks || storeMarksForExam[st.id] || {}
        : storeMarksForExam[st.id] || {},
    breakdowns:
      examId === state.selectedExam
        ? st.breakdowns || storeBdsForExam[st.id] || {}
        : storeBdsForExam[st.id] || {},
  }));

  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        students: studentsForExam,
        examName: examId,
        examConfig: examCfg,
        classes: state.classes || [],
        timestamp: new Date().toISOString(),
      }),
      redirect: 'follow',
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    try {
      const parsed = JSON.parse(text);
      const ok =
        parsed?.success === true ||
        parsed?.status === 'success' ||
        parsed?.status === 200;
      return ok
        ? { ok: true }
        : { ok: false, error: parsed?.error || 'Google Apps Script returned failure' };
    } catch {
      return { ok: false, error: 'Non-JSON response from Google Apps Script' };
    }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Network error pushing to Google Sheets' };
  }
}

async function runSyncWorkerOnce(): Promise<ServerSyncStatusSnapshot> {
  const snapshotQueue = await withQueueLock(() => readQueueFile());
  const nothingToDo =
    !snapshotQueue.cloudBackupPending &&
    !snapshotQueue.needsFullSync &&
    snapshotQueue.pendingExams.length === 0;

  if (nothingToDo) {
    return toStatusSnapshot(snapshotQueue, false);
  }

  emitSheetStatus(toStatusSnapshot(snapshotQueue, true));

  const state = await readServerStateFile();
  const teachers = getStoredTeacherAccountsForBackup();
  const gasUrl = isValidGasExecUrl(snapshotQueue.gasUrl)
    ? snapshotQueue.gasUrl
    : DEFAULT_GAS_URL;

  const targetExams = snapshotQueue.needsFullSync
    ? Object.keys(state?.examConfigs || {})
    : [...snapshotQueue.pendingExams];

  let cloudOk = true;
  let lastError: string | null = null;

  if (snapshotQueue.cloudBackupPending) {
    const cloudRes = await pushCloudBackupToGoogleSheet(state, teachers, gasUrl, {
      authoritativeTeachers: snapshotQueue.teachersAuthoritative,
      allowNullState: false,
    });
    cloudOk = Boolean(cloudRes.success);
    if (!cloudOk) {
      lastError = cloudRes.error || 'Cloud backup sync failed';
    }
  }

  const failedExams: string[] = [];
  if (state && targetExams.length > 0) {
    for (const examId of targetExams) {
      const pushRes = await pushExamTabToGas(state, examId, gasUrl);
      if (!pushRes.ok) {
        failedExams.push(examId);
        lastError = pushRes.error || lastError;
      }
    }
  }

  const nowIso = new Date().toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const updatedQueue = await withQueueLock(async () => {
    const current = await readQueueFile();
    // Preserve any newly-arrived examIds enqueued while this worker run was in flight
    const newlyEnqueued = current.pendingExams.filter(
      (id) => !targetExams.includes(id)
    );
    const mergedFailed = Array.from(new Set([...failedExams, ...newlyEnqueued]));

    const allDone = cloudOk && mergedFailed.length === 0 && !rerunRequested;
    const nextQueue: PersistedSyncQueue = {
      ...current,
      pendingExams: mergedFailed,
      needsFullSync:
        snapshotQueue.needsFullSync && failedExams.length > 0 ? true : false,
      cloudBackupPending: !cloudOk || rerunRequested,
      teachersAuthoritative: !cloudOk ? current.teachersAuthoritative : false,
      lastAttemptAt: Date.now(),
      lastSyncedAt: allDone ? nowIso : current.lastSyncedAt,
      lastError: lastError,
      retryCount: allDone ? 0 : Math.min(5, (current.retryCount || 0) + 1),
    };
    await writeQueueFile(nextQueue);
    return nextQueue;
  });

  const snap = toStatusSnapshot(updatedQueue, false);
  emitSheetStatus(snap);

  // Schedule bounded server-side retry if anything failed or new edits arrived mid-flight
  const hasRemaining =
    updatedQueue.cloudBackupPending ||
    updatedQueue.needsFullSync ||
    updatedQueue.pendingExams.length > 0;
  if (hasRemaining && updatedQueue.retryCount <= 4) {
    const delayMs = rerunRequested ? 250 : Math.min(12000, 2500 * updatedQueue.retryCount);
    rerunRequested = false;
    scheduleWorker(delayMs);
  } else {
    rerunRequested = false;
  }

  return snap;
}

function scheduleWorker(delayMs = 50): void {
  if (scheduledWorkerTimer) {
    clearTimeout(scheduledWorkerTimer);
    scheduledWorkerTimer = null;
  }
  scheduledWorkerTimer = setTimeout(() => {
    scheduledWorkerTimer = null;
    void triggerWorkerExecution();
  }, delayMs);
}

function triggerWorkerExecution(): Promise<ServerSyncStatusSnapshot> {
  if (activeWorkerPromise) {
    rerunRequested = true;
    return activeWorkerPromise;
  }
  activeWorkerPromise = runSyncWorkerOnce().finally(() => {
    activeWorkerPromise = null;
    if (rerunRequested) {
      rerunRequested = false;
      scheduleWorker(150);
    }
  });
  return activeWorkerPromise;
}

export async function enqueueServerSheetSync(params: {
  examIds?: string[];
  fullSync?: boolean;
  cloudBackup?: boolean;
  teachersAuthoritative?: boolean;
  gasUrl?: string;
  awaitResult?: boolean;
}): Promise<ServerSyncStatusSnapshot> {
  const nextQueue = await withQueueLock(async () => {
    const existing = await readQueueFile();
    const merged = mergeSyncQueueState(existing, {
      examIds: params.examIds,
      fullSync: params.fullSync,
      cloudBackup: params.cloudBackup,
      teachersAuthoritative: params.teachersAuthoritative,
      gasUrl: params.gasUrl,
    });
    await writeQueueFile(merged);
    return merged;
  });

  if (params.awaitResult) {
    return triggerWorkerExecution();
  }

  // Kick off immediately in Node.js server background (0ms–50ms coalesce)
  scheduleWorker(50);
  return toStatusSnapshot(nextQueue, true);
}

export async function getServerSyncStatusSnapshot(): Promise<ServerSyncStatusSnapshot> {
  const queue = await withQueueLock(() => readQueueFile());
  return toStatusSnapshot(queue, Boolean(activeWorkerPromise));
}

export async function flushServerSheetSyncNow(
  gasUrl?: string
): Promise<ServerSyncStatusSnapshot> {
  if (isValidGasExecUrl(gasUrl)) {
    await withQueueLock(async () => {
      const existing = await readQueueFile();
      await writeQueueFile({ ...existing, gasUrl: gasUrl.trim() });
    });
  }
  return triggerWorkerExecution();
}
