import { NextRequest, NextResponse } from 'next/server';
import {
  deleteTeacherUser,
  getStoredTeacherAccountsForBackup,
  hasLocalUsersFile,
  listTeacherUsers,
  syncTeacherMappingsOnClassDelete,
  syncTeacherMappingsOnClassRename,
  syncTeacherMappingsOnSubjectRename,
  upsertTeacherUser,
} from '@/lib/auth';
import { getRequestAuthSession } from '@/lib/auth-server';
import {
  hydrateServerStateIfCold,
  publishErpEvent,
} from '@/lib/server-erp-store';
import { enqueueServerSheetSync } from '@/lib/server-sheet-sync';
import { primeCachedCloudSnapshot } from '@/lib/sheets-cloud-store';

export const dynamic = 'force-dynamic';

async function hydrateTeachersFromCloudIfCold(): Promise<void> {
  if (hasLocalUsersFile()) {
    return;
  }
  await hydrateServerStateIfCold();
}

function syncTeachersToGoogleSheet(): void {
  const currentTeachers = getStoredTeacherAccountsForBackup();
  primeCachedCloudSnapshot({ teachers: currentTeachers });
  publishErpEvent({ type: 'users_update', updatedAt: Date.now() });
  void hydrateServerStateIfCold()
    .catch(() => null)
    .then(() =>
      enqueueServerSheetSync({
        cloudBackup: true,
        teachersAuthoritative: true,
      })
    )
    .catch(() => null);
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
    await hydrateTeachersFromCloudIfCold();
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

    await hydrateTeachersFromCloudIfCold().catch(() => null);

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

    syncTeachersToGoogleSheet();

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

    await hydrateTeachersFromCloudIfCold().catch(() => null);

    const res = deleteTeacherUser(String(target));
    if (!res.ok) {
      return NextResponse.json({ error: res.error }, { status: 400 });
    }

    syncTeachersToGoogleSheet();

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

    await hydrateTeachersFromCloudIfCold().catch(() => null);

    if (body.action === 'renameClass') {
      const oldSection = typeof body.oldSection === 'string' ? body.oldSection : '';
      const newSection = typeof body.newSection === 'string' ? body.newSection : '';
      const teachers = syncTeacherMappingsOnClassRename(oldSection, newSection);
      syncTeachersToGoogleSheet();
      return NextResponse.json({ success: true, teachers });
    }

    if (body.action === 'deleteClass') {
      const section = typeof body.section === 'string' ? body.section : '';
      const teachers = syncTeacherMappingsOnClassDelete(section);
      syncTeachersToGoogleSheet();
      return NextResponse.json({ success: true, teachers });
    }

    if (body.action === 'renameSubject') {
      const oldSubject = typeof body.oldSubject === 'string' ? body.oldSubject : '';
      const newSubject = typeof body.newSubject === 'string' ? body.newSubject : '';
      const teachers = syncTeacherMappingsOnSubjectRename(oldSubject, newSubject);
      syncTeachersToGoogleSheet();
      return NextResponse.json({ success: true, teachers });
    }

    return NextResponse.json({ error: 'Unsupported sync action' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Failed to sync teacher mappings' }, { status: 500 });
  }
}
