import { NextRequest, NextResponse } from 'next/server';
import { getRequestAuthSession } from '@/lib/auth-server';
import {
  enqueueServerSheetSync,
  flushServerSheetSyncNow,
  getServerSyncStatusSnapshot,
} from '@/lib/server-sheet-sync';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getRequestAuthSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const snapshot = await getServerSyncStatusSnapshot();
  return NextResponse.json(snapshot);
}

export async function POST(req: NextRequest) {
  const session = getRequestAuthSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const gasUrl = typeof body?.gasUrl === 'string' ? body.gasUrl : undefined;
  const examIds = Array.isArray(body?.examIds)
    ? body.examIds.filter((x: unknown): x is string => typeof x === 'string')
    : undefined;
  const fullSync = Boolean(body?.fullSync);

  if ((examIds && examIds.length > 0) || fullSync) {
    const snapshot = await enqueueServerSheetSync({
      examIds,
      fullSync,
      cloudBackup: true,
      gasUrl,
      awaitResult: body?.awaitResult !== false,
    });
    return NextResponse.json(snapshot);
  }

  const snapshot = await flushServerSheetSyncNow(gasUrl);
  return NextResponse.json(snapshot);
}
