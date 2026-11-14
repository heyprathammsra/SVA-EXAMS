import { NextRequest, NextResponse } from 'next/server';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  deleteTeacherUser,
  getStoredTeacherAccountsForBackup,
  listTeacherUsers,
  restoreTeacherAccountsFromBackup,
  shouldRestoreTeachersFromCloud,
  syncTeacherMappingsOnClassDelete,
  syncTeacherMappingsOnClassRename,
  syncTeacherMappingsOnSubjectRename,
  upsertTeacherUser,
} from '@/lib/auth';
import { getRequestAuthSession } from '@/lib/auth-server';
import { PersistedErpState } from '@/lib/erp-persistence';
import {
  getCachedCloudPayload,
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
    return parsed && typeof parsed === 'object' && parsed.initialized
      ? (parsed as PersistedErpState)
      : null;
  } catch {
    return null;
  }
}

async function writeLocalStateFile(state: PersistedErpState): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmpFile = `${STATE_FILE}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmpFile, JSON.stringify(state), 'utf8');
  await rename(tmpFile, STATE_FILE);
}

async function syncTeachersFromCloud(forcePull: boolean): Promise<PersistedErpState | null> {
  const localState = await readLocalStateFile();
  const cloud = await pullCloudBackupFromGoogleSheet({ force: forcePull });
  if (shouldRestoreTeachersFromCloud(getStoredTeacherAccountsForBackup(), cloud)) {
    restoreTeacherAccountsFromBackup(cloud!.teachers);
  }
  if (
    cloud?.state?.initialized &&
    (cloud.state.updatedAt || 0) > (localState?.updatedAt || 0)
  ) {
    await writeLocalStateFile(cloud.state).catch(() => {});
    return cloud.state;
  }
  return localState ?? cloud?.state ?? null;
}

async function readAuthoritativeStateForCloud(): Promise<PersistedErpState | null> {
  const localState = await readLocalStateFile();
  let cloudState = getCachedCloudPayload()?.state ?? null;
  if (!localState || !cloudState) {
    const cloud = await pullCloudBackupFromGoogleSheet({ force: !localState });
    cloudState = cloud?.state ?? cloudState;
  }
  if (
    cloudState?.initialized &&
    (cloudState.updatedAt || 0) > (localState?.updatedAt || 0)
  ) {
    await writeLocalStateFile(cloudState).catch(() => {});
    return cloudState;
  }
  return localState ?? cloudState ?? null;
}

async function mirrorTeachersToGoogleSheet(): Promise<void> {
  try {
    const currentState = await readAuthoritativeStateForCloud();
    await pushCloudBackupToGoogleSheet(
      currentState,
      getStoredTeacherAccountsForBackup(),
      undefined,
      { authoritativeTeachers: true }
    );
  } catch {}
}

function requireAdmin(req: NextRequest) {
  const session = getRequestAuthSession(req);
  if (!session) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
    };
  }
  if (session.role !== 'admin') {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: 'Administrator privileges required' },
        { status: 403 }
      ),
    };
  }
  return { ok: true as const, session };
}

export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    await syncTeachersFromCloud(true);
  } catch {}

  const teachers = listTeacherUsers();
  return NextResponse.json({
    teachers,
  });
}

export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
    }

    await syncTeachersFromCloud(false).catch(() => null);

    const res = upsertTeacherUser({
      id: typeof body.id === 'string' ? body.id : undefined,
      name: typeof body.name === 'string' ? body.name : '',
      username: typeof body.username === 'string' ? body.username : '',
      password: typeof body.password === 'string' ? body.password : undefined,
      assignedSubject: typeof body.assignedSubject === 'string' ? body.assignedSubject : '',
      assignedClasses: Array.isArray(body.assignedClasses) ? body.assignedClasses : [],
      classTeacherOf:
        body.classTeacherOf === null || typeof body.classTeacherOf === 'string'
          ? body.classTeacherOf
          : null,
      assignments: Array.isArray(body.assignments) ? body.assignments : undefined,
    });

    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    await mirrorTeachersToGoogleSheet();

    return NextResponse.json({
      success: true,
      teacher: res.teacher,
      teachers: res.teachers,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to save teacher user' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  return POST(req);
}

export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const url = new URL(req.url);
    const queryUsername = url.searchParams.get('username') || url.searchParams.get('id') || '';
    const body = await req.json().catch(() => null);
    const target = queryUsername || body?.username || body?.id || '';

    await syncTeachersFromCloud(false).catch(() => null);

    const res = deleteTeacherUser(String(target));
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    await mirrorTeachersToGoogleSheet();

    return NextResponse.json({
      success: true,
      teachers: res.teachers,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to delete teacher user' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = requireAdmin(req);
  if (!auth.ok) return auth.response;

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid sync payload' }, { status: 400 });
    }

    await syncTeachersFromCloud(false).catch(() => null);

    if (body.action === 'renameClass') {
      const oldSection = typeof body.oldSection === 'string' ? body.oldSection : '';
      const newSection = typeof body.newSection === 'string' ? body.newSection : '';
      const teachers = syncTeacherMappingsOnClassRename(oldSection, newSection);
      await mirrorTeachersToGoogleSheet();
      return NextResponse.json({ success: true, teachers });
    }

    if (body.action === 'deleteClass') {
      const section = typeof body.section === 'string' ? body.section : '';
      const teachers = syncTeacherMappingsOnClassDelete(section);
      await mirrorTeachersToGoogleSheet();
      return NextResponse.json({ success: true, teachers });
    }

    if (body.action === 'renameSubject') {
      const oldSubject = typeof body.oldSubject === 'string' ? body.oldSubject : '';
      const newSubject = typeof body.newSubject === 'string' ? body.newSubject : '';
      const teachers = syncTeacherMappingsOnSubjectRename(oldSubject, newSubject);
      await mirrorTeachersToGoogleSheet();
      return NextResponse.json({ success: true, teachers });
    }

    return NextResponse.json({ error: 'Unsupported sync action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Failed to sync teacher mappings' }, { status: 500 });
  }
}
