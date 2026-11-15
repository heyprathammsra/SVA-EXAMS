import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { createSessionToken, getTeacherProfileByUsername } from '@/lib/auth';
import { getRequestAuthSession } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

const STATE_FILE = path.join(process.cwd(), '.data', 'erp-state.json');

export async function GET(req: NextRequest) {
  const session = getRequestAuthSession(req);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  let initialErpState: any = null;
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.initialized) {
      initialErpState = parsed;
    }
  } catch {}

  const token = createSessionToken({
    username: session.sub,
    role: session.role,
  });
  return NextResponse.json({
    authenticated: true,
    username: session.sub,
    role: session.role,
    teacherProfile:
      session.role === 'teacher' ? getTeacherProfileByUsername(session.sub) : null,
    erpState: initialErpState,
    token,
  });
}
