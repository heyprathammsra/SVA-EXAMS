import { cookies } from 'next/headers';
import { NextRequest } from 'next/server';
import {
  ADMIN_SESSION_COOKIE_NAME,
  AuthSessionPayload,
  extractBearerToken,
  verifySessionToken,
} from './auth';

export function getRequestAuthSession(req: NextRequest): AuthSessionPayload | null {
  const bearerToken = extractBearerToken(req.headers.get('authorization'));
  if (bearerToken) {
    const bearerSession = verifySessionToken(bearerToken);
    if (bearerSession) return bearerSession;
  }
  const cookieToken = req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (cookieToken) {
    const cookieSession = verifySessionToken(cookieToken);
    if (cookieSession) return cookieSession;
  }
  return null;
}

export function isRequestAuthenticated(req: NextRequest): boolean {
  return Boolean(getRequestAuthSession(req));
}

export async function getServerComponentAuthSession(): Promise<AuthSessionPayload | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
    return verifySessionToken(token);
  } catch {
    return null;
  }
}

export function getRequestClientKey(req: NextRequest): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const firstIp = forwardedFor.split(',')[0].trim();
    if (firstIp) return firstIp;
  }
  const realIp = req.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return 'local-client';
}

export function isHttpsRequest(req: NextRequest): boolean {
  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (forwardedProto) {
    return forwardedProto.split(',')[0].trim().toLowerCase() === 'https';
  }
  return req.nextUrl.protocol === 'https:';
}
