import { NextRequest, NextResponse } from 'next/server';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  getAuthSessionSecret,
  getStoredTeacherAccountsForBackup,
  getTeacherProfileByUsername,
  restoreTeacherAccountsFromBackup,
} from '@/lib/auth';
import { getRequestAuthSession } from '@/lib/auth-server';
import { PersistedErpState } from '@/lib/erp-persistence';
import { computeStateHmac, sanitizeAndValidateErpState } from '@/lib/erp-security';
import {
  pullCloudBackupFromGoogleSheet,
  pushCloudBackupToGoogleSheet,
} from '@/lib/sheets-cloud-store';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'erp-state.json');

async function readLocalStateFile(): Promise<PersistedErpState | null> {
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.initialized) {
      return parsed as PersistedErpState;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeLocalStateFile(stateToPersist: any): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const nowMs = Date.now();
  const tmpFile = `${STATE_FILE}.${nowMs}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmpFile, JSON.stringify(stateToPersist), 'utf8');
  await rename(tmpFile, STATE_FILE);
}

export async function GET(req: NextRequest) {
  const session = getRequestAuthSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    let localState = await readLocalStateFile();

    // Check Google Sheets cloud store when local disk is empty (e.g., fresh Cloud Run container) or to pull newer updates
    const cloudBackup = await pullCloudBackupFromGoogleSheet({
      force: !localState,
    });

    if (cloudBackup?.teachers && cloudBackup.teachers.length > 0) {
      const localMaxTeacherUpdate = Math.max(
        0,
        ...getStoredTeacherAccountsForBackup().map((t) => t.updatedAt || 0)
      );
      const cloudMaxTeacherUpdate = Math.max(
        0,
        ...cloudBackup.teachers.map((t) => t.updatedAt || 0)
      );
      if (cloudMaxTeacherUpdate > localMaxTeacherUpdate) {
        restoreTeacherAccountsFromBackup(cloudBackup.teachers);
      }
    }

    if (
      cloudBackup?.state &&
      cloudBackup.state.initialized &&
      (cloudBackup.state.updatedAt || 0) > (localState?.updatedAt || 0)
    ) {
      localState = cloudBackup.state;
      await writeLocalStateFile(localState).catch(() => {});
    }

    const teacherProfile =
      session.role === 'teacher' ? getTeacherProfileByUsername(session.sub) : null;

    if (!localState) {
      return NextResponse.json({
        exists: false,
        state: null,
        role: session.role,
        teacherProfile,
      });
    }

    return NextResponse.json({
      exists: true,
      state: localState,
      role: session.role,
      teacherProfile,
    });
  } catch {
    const teacherProfile =
      session.role === 'teacher' ? getTeacherProfileByUsername(session.sub) : null;
    return NextResponse.json(
      { exists: false, state: null, role: session.role, teacherProfile },
      { status: 200 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = getRequestAuthSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid ERP state payload' },
        { status: 400 }
      );
    }

    const incomingState = body.state && typeof body.state === 'object' ? body.state : body;

    if (
      !incomingState ||
      typeof incomingState.examConfigs !== 'object' ||
      !Array.isArray(incomingState.students) ||
      typeof incomingState.examMarksStore !== 'object' ||
      typeof incomingState.examBreakdownsStore !== 'object'
    ) {
      return NextResponse.json(
        { success: false, error: 'Malformed ERP state structure' },
        { status: 400 }
      );
    }

    let existingParsed = await readLocalStateFile();
    if (!existingParsed) {
      const cloudBackup = await pullCloudBackupFromGoogleSheet({ force: true });
      if (cloudBackup?.teachers && cloudBackup.teachers.length > 0) {
        restoreTeacherAccountsFromBackup(cloudBackup.teachers);
      }
      if (cloudBackup?.state && cloudBackup.state.initialized) {
        existingParsed = cloudBackup.state;
      }
    }

    const teacherProfile =
      session.role === 'teacher' ? getTeacherProfileByUsername(session.sub) : null;

    const nowMs = Date.now();
    const sanitizedState = sanitizeAndValidateErpState(
      incomingState as PersistedErpState,
      existingParsed,
      session.role,
      nowMs,
      teacherProfile
    );

    const stateToPersist = {
      ...sanitizedState,
      lastModifiedBy: session.sub,
      lastModifiedRole: session.role,
      integrityHmac: computeStateHmac(sanitizedState, getAuthSessionSecret()),
    };

    await writeLocalStateFile(stateToPersist);

    // Mirror state + teacher accounts to Google Sheets cloud store
    pushCloudBackupToGoogleSheet(
      stateToPersist as PersistedErpState,
      getStoredTeacherAccountsForBackup()
    ).catch(() => {});

    return NextResponse.json({
      success: true,
      updatedAt: sanitizedState.updatedAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to persist ERP state' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = getRequestAuthSession(req);
  if (!session) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
  }
  if (session.role !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Administrator privileges required to reset storage' },
      { status: 403 }
    );
  }
  try {
    await unlink(STATE_FILE);
  } catch (err: any) {
    if (err?.code !== 'ENOENT') {
      return NextResponse.json(
        { success: false, error: err?.message || 'Failed to clear ERP state' },
        { status: 500 }
      );
    }
  }
  return NextResponse.json({ success: true });
}
