import { NextRequest, NextResponse } from 'next/server';
import { getRequestAuthSession } from '@/lib/auth-server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getRequestAuthSession(req);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }
  return NextResponse.json({
    authenticated: true,
    username: session.sub,
    role: session.role,
  });
}
