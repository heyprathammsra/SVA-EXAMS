import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  deleteTeacherUser,
  getStoredTeacherAccountsForBackup,
  listTeacherUsers,
  restoreTeacherAccountsFromBackup,
  syncTeacherMappingsOnClassDelete,
  syncTeacherMappingsOnClassRename,
  syncTeacherMappingsOnSubjectRename,
  upsertTeacherUser,
} from '@/lib/auth';
import { getRequestAuthSession } from '@/lib/auth-server';
import { PersistedErpState } from '@/lib/erp-persistence';
import {
  pullCloudBackupFromGoogleSheet,
  pushCloudBackupToGoogleSheet,
} from '@/lib/sheets-cloud-store';

export const dynamic = 'force-dynamic';

const STATE_FILE = path.join(process.cwd(), '.data', 'erp-state.json');

async function readCurrentStateForCloud(): Promise<PersistedErpState | null> {
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

async function mirrorTeachersToGoogleSheet(): Promise<void> {
  try {
    const currentState = await readCurrentStateForCloud();
    await pushCloudBackupToGoogleSheet(
      currentState,
      getStoredTeacherAccountsForBackup()
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
    const cloud = await pullCloudBackupFromGoogleSheet();
    if (cloud?.teachers && cloud.teachers.length > 0) {
      const localMax = Math.max(
        0,
        ...getStoredTeacherAccountsForBackup().map((t) => t.updatedAt || 0)
      );
      const cloudMax = Math.max(0, ...cloud.teachers.map((t) => t.updatedAt || 0));
      if (cloudMax > localMax) {
        restoreTeacherAccountsFromBackup(cloud.teachers);
      }
    }
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

    mirrorTeachersToGoogleSheet().catch(() => {});

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

    const res = deleteTeacherUser(String(target));
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    mirrorTeachersToGoogleSheet().catch(() => {});

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

    if (body.action === 'renameClass') {
      const oldSection = typeof body.oldSection === 'string' ? body.oldSection : '';
      const newSection = typeof body.newSection === 'string' ? body.newSection : '';
      const teachers = syncTeacherMappingsOnClassRename(oldSection, newSection);
      mirrorTeachersToGoogleSheet().catch(() => {});
      return NextResponse.json({ success: true, teachers });
    }

    if (body.action === 'deleteClass') {
      const section = typeof body.section === 'string' ? body.section : '';
      const teachers = syncTeacherMappingsOnClassDelete(section);
      mirrorTeachersToGoogleSheet().catch(() => {});
      return NextResponse.json({ success: true, teachers });
    }

    if (body.action === 'renameSubject') {
      const oldSubject = typeof body.oldSubject === 'string' ? body.oldSubject : '';
      const newSubject = typeof body.newSubject === 'string' ? body.newSubject : '';
      const teachers = syncTeacherMappingsOnSubjectRename(oldSubject, newSubject);
      mirrorTeachersToGoogleSheet().catch(() => {});
      return NextResponse.json({ success: true, teachers });
    }

    return NextResponse.json({ error: 'Unsupported sync action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Failed to sync teacher mappings' }, { status: 500 });
  }
}
