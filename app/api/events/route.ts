import { NextRequest } from 'next/server';
import { getRequestAuthSession } from '@/lib/auth-server';
import { ErpServerEvent, subscribeErpEvents } from '@/lib/server-erp-store';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = getRequestAuthSession(req);
  if (!session) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let keepaliveTimer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (payload: ErpServerEvent | { type: 'connected'; ts: number }) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {}
      };

      sendEvent({ type: 'connected', ts: Date.now() });

      unsubscribe = subscribeErpEvents((event) => {
        sendEvent(event);
      });

      keepaliveTimer = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {}
      }, 20000);
    },
    cancel() {
      if (keepaliveTimer) {
        clearInterval(keepaliveTimer);
        keepaliveTimer = null;
      }
      if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
      }
    },
  });

  req.signal.addEventListener('abort', () => {
    if (keepaliveTimer) {
      clearInterval(keepaliveTimer);
      keepaliveTimer = null;
    }
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
