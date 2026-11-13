import { NextRequest, NextResponse } from 'next/server';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getAuthSessionSecret, getTeacherProfileByUsername } from '@/lib/auth';
import { getRequestAuthSession } from '@/lib/auth-server';
import { PersistedErpState } from '@/lib/erp-persistence';
import { computeStateHmac, sanitizeAndValidateErpState } from '@/lib/erp-security';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'erp-state.json');

export async function GET(req: NextRequest) {
  const session = getRequestAuthSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const teacherProfile =
    session.role === 'teacher' ? getTeacherProfileByUsername(session.sub) : null;
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.initialized) {
      return NextResponse.json({ exists: false, state: null, role: session.role, teacherProfile });
    }
    return NextResponse.json({
      exists: true,
      state: parsed,
      role: session.role,
      teacherProfile,
    });
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return NextResponse.json({ exists: false, state: null, role: session.role, teacherProfile });
    }
    return NextResponse.json(
      { exists: false, state: null, error: 'Failed to read persisted ERP state' },
      { status: 500 }
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

    let existingParsed: PersistedErpState | null = null;
    try {
      const existingRaw = await readFile(STATE_FILE, 'utf8');
      const parsed = JSON.parse(existingRaw);
      if (parsed && typeof parsed === 'object' && parsed.initialized) {
        existingParsed = parsed as PersistedErpState;
      }
    } catch {
      // File may not exist yet; proceed with initial write
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

    await mkdir(DATA_DIR, { recursive: true });
    const tmpFile = `${STATE_FILE}.${nowMs}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmpFile, JSON.stringify(stateToPersist), 'utf8');
    await rename(tmpFile, STATE_FILE);

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
