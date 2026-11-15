import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthSessionSecret,
  getStoredTeacherAccountsForBackup,
  getTeacherProfileByUsername,
  hasLocalUsersFile,
  restoreTeacherAccountsFromBackup,
  shouldRestoreTeachersFromCloud,
} from '@/lib/auth';
import { getRequestAuthSession } from '@/lib/auth-server';
import { PersistedErpState } from '@/lib/erp-persistence';
import { computeStateHmac, sanitizeAndValidateErpState } from '@/lib/erp-security';
import {
  deleteServerStateFile,
  hydrateServerStateIfCold,
  mirrorStateToFirestoreAdminIfAvailable,
  publishErpEvent,
  withServerStateLock,
  writeServerStateFile,
} from '@/lib/server-erp-store';
import {
  enqueueServerSheetSync,
  getServerSyncStatusSnapshot,
} from '@/lib/server-sheet-sync';
import {
  primeCachedCloudSnapshot,
  pullCloudBackupFromGoogleSheet,
  pushCloudBackupToGoogleSheet,
} from '@/lib/sheets-cloud-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getRequestAuthSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    const localState = await hydrateServerStateIfCold();

    const teacherProfile =
      session.role === 'teacher' ? getTeacherProfileByUsername(session.sub) : null;
    const syncStatus = await getServerSyncStatusSnapshot();

    if (!localState) {
      return NextResponse.json({
        exists: false,
        state: null,
        role: session.role,
        teacherProfile,
        syncStatus,
      });
    }

    return NextResponse.json({
      exists: true,
      state: localState,
      role: session.role,
      teacherProfile,
      syncStatus,
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

    const gasUrl = typeof body.gasUrl === 'string' ? body.gasUrl : undefined;
    const dirtyExams = Array.isArray(body.dirtyExams)
      ? body.dirtyExams.filter((x: unknown): x is string => typeof x === 'string')
      : typeof incomingState.selectedExam === 'string'
      ? [incomingState.selectedExam]
      : [];
    const fullSheetSync = Boolean(body.fullSheetSync);

    const result = await withServerStateLock(async () => {
      let existingParsed = await hydrateServerStateIfCold();
      if (!existingParsed) {
        const cloudBackup = await pullCloudBackupFromGoogleSheet({
          force: true,
        }).catch(() => null);
        if (
          !hasLocalUsersFile() &&
          shouldRestoreTeachersFromCloud(getStoredTeacherAccountsForBackup(), cloudBackup)
        ) {
          restoreTeacherAccountsFromBackup(cloudBackup!.teachers);
        }
        if (cloudBackup?.state?.initialized) {
          existingParsed = cloudBackup.state;
        }
      }

      const teacherProfile =
        session.role === 'teacher' ? getTeacherProfileByUsername(session.sub) : null;

      const nowMs = Math.max(
        Date.now(),
        (existingParsed?.updatedAt || 0) + 1,
        typeof incomingState.updatedAt === 'number' ? incomingState.updatedAt : 0
      );

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

      await writeServerStateFile(stateToPersist);

      const currentTeachers = getStoredTeacherAccountsForBackup();
      primeCachedCloudSnapshot({
        state: stateToPersist as PersistedErpState,
        teachers: currentTeachers,
        nowMs,
      });

      void mirrorStateToFirestoreAdminIfAvailable(stateToPersist as PersistedErpState).catch(
        () => {}
      );

      return sanitizedState.updatedAt;
    });

    publishErpEvent({
      type: 'erp_update',
      updatedAt: result,
      dirtyExams,
      actor: session.sub,
    });

    const syncStatus = await enqueueServerSheetSync({
      examIds: dirtyExams,
      fullSync: fullSheetSync,
      cloudBackup: true,
      gasUrl,
    });

    return NextResponse.json({
      success: true,
      updatedAt: result,
      syncStatus,
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
    await deleteServerStateFile();
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to clear ERP state' },
      { status: 500 }
    );
  }
  const currentTeachers = getStoredTeacherAccountsForBackup();
  primeCachedCloudSnapshot({
    state: null,
    teachers: currentTeachers,
    nowMs: Date.now(),
  });
  publishErpEvent({
    type: 'erp_update',
    updatedAt: Date.now(),
    actor: session.sub,
  });
  void pushCloudBackupToGoogleSheet(null, currentTeachers, undefined, {
    allowNullState: true,
  }).catch(() => {});
  return NextResponse.json({ success: true });
}
