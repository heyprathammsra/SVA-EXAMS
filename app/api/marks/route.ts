import { NextRequest, NextResponse } from 'next/server';
import {
  getAuthSessionSecret,
  getStoredTeacherAccountsForBackup,
  getTeacherProfileByUsername,
} from '@/lib/auth';
import { getRequestAuthSession } from '@/lib/auth-server';
import { PersistedErpState } from '@/lib/erp-persistence';
import { computeStateHmac } from '@/lib/erp-security';
import { applyMarkDeltasToState, MarkDeltaItem } from '@/lib/marks-delta';
import {
  hydrateServerStateIfCold,
  mirrorStateToFirestoreAdminIfAvailable,
  publishErpEvent,
  withServerStateLock,
  writeServerStateFile,
} from '@/lib/server-erp-store';
import { enqueueServerSheetSync } from '@/lib/server-sheet-sync';
import { primeCachedCloudSnapshot } from '@/lib/sheets-cloud-store';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const session = getRequestAuthSession(req);
  if (!session) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || !Array.isArray(body.deltas)) {
      return NextResponse.json(
        { success: false, error: 'Invalid mark delta payload' },
        { status: 400 }
      );
    }

    const deltas = body.deltas as MarkDeltaItem[];
    if (deltas.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No mark deltas provided' },
        { status: 400 }
      );
    }

    const gasUrl = typeof body.gasUrl === 'string' ? body.gasUrl : undefined;

    const outcome = await withServerStateLock(async () => {
      const existing = await hydrateServerStateIfCold();
      if (!existing || !existing.initialized) {
        return { missingState: true as const };
      }

      const teacherProfile =
        session.role === 'teacher' ? getTeacherProfileByUsername(session.sub) : null;

      const applied = applyMarkDeltasToState({
        existingState: existing,
        deltas,
        role: session.role,
        teacherProfile,
        nowMs: Date.now(),
      });

      if (applied.appliedCount === 0) {
        return {
          missingState: false as const,
          appliedCount: 0,
          rejectedCount: applied.rejectedCount,
          updatedAt: existing.updatedAt,
          dirtyExams: [] as string[],
        };
      }

      const stateToPersist = {
        ...applied.nextState,
        lastModifiedBy: session.sub,
        lastModifiedRole: session.role,
        integrityHmac: computeStateHmac(applied.nextState, getAuthSessionSecret()),
      };

      await writeServerStateFile(stateToPersist);

      const currentTeachers = getStoredTeacherAccountsForBackup();
      primeCachedCloudSnapshot({
        state: stateToPersist as PersistedErpState,
        teachers: currentTeachers,
        nowMs: stateToPersist.updatedAt,
      });

      void mirrorStateToFirestoreAdminIfAvailable(stateToPersist as PersistedErpState).catch(
        () => {}
      );

      return {
        missingState: false as const,
        appliedCount: applied.appliedCount,
        rejectedCount: applied.rejectedCount,
        updatedAt: stateToPersist.updatedAt,
        dirtyExams: applied.dirtyExams,
      };
    });

    if (outcome.missingState) {
      return NextResponse.json(
        { success: false, error: 'Server state not initialized yet', needsFullSync: true },
        { status: 409 }
      );
    }

    if (outcome.appliedCount === 0) {
      return NextResponse.json(
        {
          success: false,
          appliedCount: 0,
          rejectedCount: outcome.rejectedCount,
          error: 'No authorized changes in delta payload',
        },
        { status: 403 }
      );
    }

    publishErpEvent({
      type: 'erp_update',
      updatedAt: outcome.updatedAt,
      dirtyExams: outcome.dirtyExams,
      actor: session.sub,
    });

    const syncStatus = await enqueueServerSheetSync({
      examIds: outcome.dirtyExams,
      cloudBackup: true,
      gasUrl,
    });

    return NextResponse.json({
      success: true,
      updatedAt: outcome.updatedAt,
      appliedCount: outcome.appliedCount,
      rejectedCount: outcome.rejectedCount,
      dirtyExams: outcome.dirtyExams,
      syncStatus,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to persist mark delta' },
      { status: 500 }
    );
  }
}
