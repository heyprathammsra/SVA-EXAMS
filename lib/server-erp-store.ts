import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  getStoredTeacherAccountsForBackup,
  hasLocalUsersFile,
  restoreTeacherAccountsFromBackup,
  shouldRestoreTeachersFromCloud,
} from './auth';
import { PersistedErpState } from './erp-persistence';
import { pullCloudBackupFromGoogleSheet } from './sheets-cloud-store';

const DATA_DIR = path.join(process.cwd(), '.data');
export const SERVER_STATE_FILE = path.join(DATA_DIR, 'erp-state.json');

let stateFileLock: Promise<unknown> = Promise.resolve();

export function withServerStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const next = stateFileLock.then(fn, fn);
  stateFileLock = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function readServerStateFile(): Promise<PersistedErpState | null> {
  try {
    const raw = await readFile(SERVER_STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.initialized) {
      return parsed as PersistedErpState;
    }
    return null;
  } catch {
    return null;
  }
}

export async function writeServerStateFile(stateToPersist: any): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const nowMs = Date.now();
  const tmpFile = `${SERVER_STATE_FILE}.${nowMs}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmpFile, JSON.stringify(stateToPersist), 'utf8');
  await rename(tmpFile, SERVER_STATE_FILE);
}

export async function deleteServerStateFile(): Promise<void> {
  try {
    await unlink(SERVER_STATE_FILE);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') throw err;
  }
}

export async function hydrateServerStateIfCold(): Promise<PersistedErpState | null> {
  let localState = await readServerStateFile();
  if (localState) return localState;

  const cloudBackup = await pullCloudBackupFromGoogleSheet({
    force: true,
  }).catch(() => null);

  if (
    !hasLocalUsersFile() &&
    shouldRestoreTeachersFromCloud(getStoredTeacherAccountsForBackup(), cloudBackup)
  ) {
    restoreTeacherAccountsFromBackup(cloudBackup!.teachers);
  }

  if (cloudBackup?.state && cloudBackup.state.initialized) {
    localState = cloudBackup.state;
    await writeServerStateFile(localState).catch(() => {});
  }
  return localState;
}

// ============================================================================
// Optional Server-Side Firestore Admin Mirror (auto-enabled when IAM exists)
// ============================================================================
let firestoreAdminDisabled = false;

export async function mirrorStateToFirestoreAdminIfAvailable(
  state: PersistedErpState
): Promise<void> {
  if (firestoreAdminDisabled) return;
  try {
    const [{ initializeApp, getApps }, { getFirestore }, cfgModule] = await Promise.all([
      import('firebase-admin/app'),
      import('firebase-admin/firestore'),
      import('../firebase-applet-config.json'),
    ]);
    const cfg = (cfgModule as any).default || cfgModule;
    if (!cfg?.projectId || !cfg?.firestoreDatabaseId) {
      firestoreAdminDisabled = true;
      return;
    }
    const app = getApps().length > 0 ? getApps()[0] : initializeApp({ projectId: cfg.projectId });
    const db = getFirestore(app, cfg.firestoreDatabaseId);
    await db
      .collection('erp_meta')
      .doc('config')
      .set(
        {
          id: 'config',
          selectedClass: state.selectedClass,
          selectedExam: state.selectedExam,
          classes: state.classes,
          examConfigs: state.examConfigs,
          updatedByUid: 'server',
          updatedAt: new Date(state.updatedAt || Date.now()),
        },
        { merge: true }
      );
  } catch (err: any) {
    if (err?.code === 7 || String(err?.message || '').includes('PERMISSION_DENIED')) {
      firestoreAdminDisabled = true;
    }
  }
}

// ============================================================================
// Real-Time In-Process SSE Event Bus
// ============================================================================
export type ErpServerEvent =
  | { type: 'erp_update'; updatedAt: number; dirtyExams?: string[]; actor?: string }
  | {
      type: 'sheet_sync';
      status: 'syncing' | 'synced' | 'error';
      pendingExams: string[];
      lastSyncedAt: string | null;
      lastError: string | null;
    }
  | { type: 'users_update'; updatedAt: number };

type EventListener = (event: ErpServerEvent) => void;

const globalForSse = globalThis as unknown as {
  __svaErpEventListeners?: Set<EventListener>;
};

function getListenerSet(): Set<EventListener> {
  if (!globalForSse.__svaErpEventListeners) {
    globalForSse.__svaErpEventListeners = new Set<EventListener>();
  }
  return globalForSse.__svaErpEventListeners;
}

export function subscribeErpEvents(listener: EventListener): () => void {
  const listeners = getListenerSet();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function publishErpEvent(event: ErpServerEvent): void {
  const listeners = getListenerSet();
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {}
  }
}
