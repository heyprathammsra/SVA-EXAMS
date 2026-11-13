import { NextRequest, NextResponse } from 'next/server';
import {
  deleteTeacherUser,
  listTeacherUsers,
  upsertTeacherUser,
} from '@/lib/auth';
import { getRequestAuthSession } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

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

    return NextResponse.json({
      success: true,
      teachers: res.teachers,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to delete teacher user' }, { status: 500 });
  }
}
