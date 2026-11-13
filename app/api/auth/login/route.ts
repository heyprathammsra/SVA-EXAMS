import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_SESSION_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
  authenticateUserCredentials,
  checkLoginRateLimit,
  clearLoginFailures,
  createSessionToken,
  recordLoginFailure,
} from '@/lib/auth';
import { getRequestClientKey, isHttpsRequest } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

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

    const authResult = authenticateUserCredentials(username, password);
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

    const token = createSessionToken({
      username: authResult.username,
      role: authResult.role,
    });
    const res = NextResponse.json({
      authenticated: true,
      username: authResult.username,
      role: authResult.role,
      teacherProfile: authResult.teacherProfile || null,
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
