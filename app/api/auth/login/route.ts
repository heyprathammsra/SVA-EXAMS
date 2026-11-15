import { NextRequest, NextResponse } from 'next/server';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
  authenticateUserCredentials,
  checkLoginRateLimit,
  clearLoginFailures,
  createSessionToken,
  getStoredTeacherAccountsForBackup,
  recordLoginFailure,
  restoreTeacherAccountsFromBackup,
  shouldApplyCloudTeachersOnLogin,
} from '@/lib/auth';
import { getRequestClientKey, isHttpsRequest } from '@/lib/auth-server';
import { pullCloudBackupFromGoogleSheet } from '@/lib/sheets-cloud-store';

export const dynamic = 'force-dynamic';

const DATA_DIR = path.join(process.cwd(), '.data');
const STATE_FILE = path.join(DATA_DIR, 'erp-state.json');

export async function POST(req: NextRequest) {
  try {
    const clientKey = getRequestClientKey(req);
    const rateCheck = checkLoginRateLimit(clientKey);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          authenticated: false,
          error: `Too many failed sign-in attempts. Please wait ${Math.ceil(
            rateCheck.retryAfterSeconds / 60
          )} minute(s) before trying again.`,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rateCheck.retryAfterSeconds) },
        }
      );
    }

    const body = await req.json().catch(() => null);
    const username = typeof body?.username === 'string' ? body.username.trim() : '';
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!password) {
      return NextResponse.json(
        { authenticated: false, error: 'Please enter your username and password.' },
        { status: 400 }
      );
    }

    let authResult = authenticateUserCredentials(username, password);
    if (username.toLowerCase() !== 'admin') {
      let hasLocalState = false;
      try {
        const raw = await readFile(STATE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        hasLocalState = Boolean(parsed?.initialized);
      } catch {}

      if (!authResult.authenticated || !hasLocalState) {
        const cloud = await pullCloudBackupFromGoogleSheet({
          force: true,
        });
        if (
          cloud?.teachers &&
          cloud.teachers.length > 0 &&
          shouldApplyCloudTeachersOnLogin(getStoredTeacherAccountsForBackup(), cloud)
        ) {
          restoreTeacherAccountsFromBackup(cloud.teachers);
          authResult = authenticateUserCredentials(username, password);
        }

        if (!hasLocalState && cloud?.state?.initialized) {
          try {
            await mkdir(DATA_DIR, { recursive: true });
            const tmp = `${STATE_FILE}.${Date.now()}.tmp`;
            await writeFile(tmp, JSON.stringify(cloud.state), 'utf8');
            await rename(tmp, STATE_FILE);
          } catch {}
        }
      }
    }
    if (!authResult.authenticated || !authResult.role || !authResult.username) {
      const failure = recordLoginFailure(clientKey);
      if (failure.locked) {
        return NextResponse.json(
          {
            authenticated: false,
            error: 'Too many failed sign-in attempts. Access is temporarily locked for 5 minutes.',
          },
          {
            status: 429,
            headers: { 'Retry-After': String(failure.retryAfterSeconds) },
          }
        );
      }
      return NextResponse.json(
        { authenticated: false, error: 'Invalid username or password.' },
        { status: 401 }
      );
    }

    clearLoginFailures(clientKey);

    let initialErpState: any = null;
    try {
      const raw = await readFile(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.initialized) {
        initialErpState = parsed;
      }
    } catch {}

    const token = createSessionToken({
      username: authResult.username,
      role: authResult.role,
    });
    const res = NextResponse.json({
      authenticated: true,
      username: authResult.username,
      role: authResult.role,
      teacherProfile: authResult.teacherProfile || null,
      erpState: initialErpState,
      token,
    });
    const https = isHttpsRequest(req);

    res.cookies.set({
      name: ADMIN_SESSION_COOKIE_NAME,
      value: token,
      httpOnly: true,
      sameSite: https ? 'none' : 'lax',
      secure: https,
      path: '/',
      maxAge: ADMIN_SESSION_TTL_SECONDS,
    });

    return res;
  } catch {
    return NextResponse.json(
      { authenticated: false, error: 'Unable to sign in right now.' },
      { status: 500 }
    );
  }
}
