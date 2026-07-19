import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { config } from '../config';
import type { NovedadCreatedEvent } from '@futuragest/contracts';
import { tokenStore } from '../lib/auth/token-store';
import { showNovedadToast } from '../components/notifications/novedad-toast';

const NOVEDADES_KEY = 'novedades';
const MAX_BACKOFF_MS = 30_000;

export function useNovedadSse(enabled: boolean) {
  const qc = useQueryClient();
  const backoffRef = useRef(1000);
  const eventSourceRef = useRef<EventSource | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;

    const token = tokenStore.getAccessToken();
    if (!token) return;

    const connect = () => {
      if (!enabledRef.current) return;

      const url = `${config.apiBaseUrl}/notifications/stream?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        if (!event.data) return;

        try {
          const parsed = JSON.parse(event.data) as NovedadCreatedEvent;
          if (parsed.type === 'novedad-created') {
            qc.invalidateQueries({ queryKey: [NOVEDADES_KEY] });
            showNovedadToast(parsed.horasExtra);
          }
        } catch {
          // Non-JSON keepalive ping — ignore
        }
      };

      es.onopen = () => {
        backoffRef.current = 1000;
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;

        if (es.readyState === EventSource.CLOSED && enabledRef.current) {
          const delay = backoffRef.current;
          backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
          setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      enabledRef.current = false;
      backoffRef.current = 1000;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [enabled, qc]);
}
