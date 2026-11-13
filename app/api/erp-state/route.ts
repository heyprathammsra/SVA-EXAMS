import { NextRequest, NextResponse } from 'next/server';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'erp-state.json');

export async function GET() {
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.initialized) {
      return NextResponse.json({ exists: false, state: null });
    }
    return NextResponse.json({ exists: true, state: parsed });
  } catch (err: any) {
    if (err?.code === 'ENOENT') {
      return NextResponse.json({ exists: false, state: null });
    }
    return NextResponse.json(
      { exists: false, state: null, error: 'Failed to read persisted ERP state' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid ERP state payload' },
        { status: 400 }
      );
    }

    const incomingState = body.state && typeof body.state === 'object' ? body.state : body;
    const force = Boolean(body.force);

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

    const incomingUpdatedAt =
      typeof incomingState.updatedAt === 'number' && Number.isFinite(incomingState.updatedAt)
        ? incomingState.updatedAt
        : Date.now();

    if (!force) {
      try {
        const existingRaw = await readFile(STATE_FILE, 'utf8');
        const existingParsed = JSON.parse(existingRaw);
        if (
          existingParsed &&
          typeof existingParsed.updatedAt === 'number' &&
          existingParsed.updatedAt > incomingUpdatedAt
        ) {
          return NextResponse.json({
            success: true,
            skipped: true,
            updatedAt: existingParsed.updatedAt,
          });
        }
      } catch {
        // File may not exist yet or be unreadable; proceed with write
      }
    }

    const stateToPersist = {
      ...incomingState,
      version: 1,
      initialized: true,
      updatedAt: incomingUpdatedAt,
    };

    await mkdir(DATA_DIR, { recursive: true });
    const tmpFile = `${STATE_FILE}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    await writeFile(tmpFile, JSON.stringify(stateToPersist), 'utf8');
    await rename(tmpFile, STATE_FILE);

    return NextResponse.json({
      success: true,
      updatedAt: stateToPersist.updatedAt,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to persist ERP state' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
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
