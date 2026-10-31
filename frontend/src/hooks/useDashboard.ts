import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ApiError,
  fetchAcks,
  fetchHealth,
  fetchLatest,
  removeAck,
  sendAck,
  socketUrl,
} from '../api';
import { ACK_KIND, markKey, marksFromAcks } from '../marks';
import type { ConnectionMode, SectionUpdate, SocketMessage } from '../types';
import { type DashboardState, applySocketMessage, sortSections, withMark } from './socketMessage';

const POLL_MS = 20_000;
const HEALTH_CHECK_MS = 30_000;
const NIGHTLY_RELOAD_HOUR = 4;

// Set once per page load, so a reload at 04:00 cannot trigger another one.
const PAGE_LOADED_AT = new Date();

/** True when the page was loaded before the most recent local 04:00. */
export function shouldNightlyReload(loadedAt: Date, now: Date): boolean {
  const boundary = new Date(now);
  boundary.setHours(NIGHTLY_RELOAD_HOUR, 0, 0, 0);
  if (now < boundary) boundary.setDate(boundary.getDate() - 1);
  return loadedAt < boundary;
}

export function useDashboard(): {
  sections: SectionUpdate[];
  mode: ConnectionMode;
  unauthorized: boolean;
  isItemAcked: (section: string, itemId: string) => boolean;
  ackItem: (section: string, itemId: string) => Promise<void>;
  unackItem: (section: string, itemId: string) => Promise<void>;
  getItemMark: (section: string, itemId: string) => string | undefined;
  markItem: (section: string, itemId: string, kind: string) => Promise<void>;
} {
  const [mode, setMode] = useState<ConnectionMode>('connecting');
  const [unauthorized, setUnauthorized] = useState(false);
  // marks: "section:id" -> kind ("ack" = read, "skipped" = not interested)
  const [state, setState] = useState<DashboardState>({ sections: [], marks: new Map() });
  const { sections, marks } = state;
  // Latest marks for the rollback of a failed request
  const marksRef = useRef(marks);
  marksRef.current = marks;

  const initialServerId = useRef<string | null>(null);

  const ackedItems = useMemo(
    () => new Set([...marks].filter(([, kind]) => kind === ACK_KIND).map(([key]) => key)),
    [marks]
  );

  const isItemAcked = useCallback(
    (section: string, itemId: string) => ackedItems.has(markKey(section, itemId)),
    [ackedItems]
  );

  const getItemMark = useCallback(
    (section: string, itemId: string) => marks.get(markKey(section, itemId)),
    [marks]
  );

  // Optimistic: the mark shows at once and is rolled back when the server rejects it
  const setMark = useCallback((key: string, kind: string | undefined) => {
    setState((prev) => ({ ...prev, marks: withMark(prev.marks, key, kind) }));
  }, []);

  const markItem = useCallback(
    async (section: string, itemId: string, kind: string) => {
      const key = markKey(section, itemId);
      const previous = marksRef.current.get(key);
      setMark(key, kind);
      try {
        await sendAck(section, itemId, kind);
      } catch (err) {
        console.error('Failed to send mark:', err);
        setMark(key, previous);
      }
    },
    [setMark]
  );

  const ackItem = useCallback(
    (section: string, itemId: string) => markItem(section, itemId, ACK_KIND),
    [markItem]
  );

  const unackItem = useCallback(
    async (section: string, itemId: string) => {
      const key = markKey(section, itemId);
      const previous = marksRef.current.get(key);
      setMark(key, undefined);
      try {
        await removeAck(section, itemId);
      } catch (err) {
        console.error('Failed to remove ack:', err);
        setMark(key, previous);
      }
    },
    [setMark]
  );
  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry = 0;
    let pollTimer: number | null = null;
    let healthTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let live = false;

    const checkServerHealth = async () => {
      try {
        const health = await fetchHealth();
        if (stopped) return;

        if (health.server_id) {
          if (initialServerId.current === null) {
            initialServerId.current = health.server_id;
          } else if (initialServerId.current !== health.server_id) {
            console.info('Server restart or update detected, reloading the page');
            window.location.reload();
            return;
          }
        }

        if (shouldNightlyReload(PAGE_LOADED_AT, new Date())) {
          console.info('Nightly reload to free memory and refresh the dashboard');
          window.location.reload();
        }
      } catch {
        // Ignore background network errors
      }
    };

    const stopPoll = () => {
      if (pollTimer !== null) window.clearInterval(pollTimer);
      pollTimer = null;
    };

    const apply = (rows: SectionUpdate[]) => {
      if (!stopped) setState((prev) => ({ ...prev, sections: sortSections(rows) }));
    };

    const refreshAcks = async () => {
      try {
        const res = await fetchAcks();
        if (!stopped && res?.acks) setState((prev) => ({ ...prev, marks: marksFromAcks(res.acks) }));
      } catch {
        // ignore background acks error
      }
    };

    const pollOnce = async () => {
      try {
        const [payload] = await Promise.all([fetchLatest(), refreshAcks()]);
        if (stopped || live) return;
        apply(payload.sections);
        setUnauthorized(false);
        setMode('polling');
      } catch (error) {
        if (stopped || live) return;
        setMode('offline');
        setUnauthorized(error instanceof ApiError && error.status === 401);
      }
    };

    const startPoll = () => {
      if (pollTimer !== null || stopped) return;
      void pollOnce();
      pollTimer = window.setInterval(() => void pollOnce(), POLL_MS);
    };

    const connect = () => {
      if (stopped) return;
      live = false;
      socket = new WebSocket(socketUrl());
      socket.onopen = () => {
        if (stopped) return;
        retry = 0;
        live = true;
        stopPoll();
        setMode('live');
        setUnauthorized(false);
        void checkServerHealth();
        void refreshAcks();
      };
      socket.onmessage = (event) => {
        if (stopped) return;
        let message: SocketMessage;
        try {
          message = JSON.parse(String(event.data)) as SocketMessage;
        } catch {
          return;
        }
        if (message.type === 'reload') {
          window.location.reload();
          return;
        }
        setState((current) => applySocketMessage(current, message));
      };
      socket.onerror = () => {
        socket?.close();
      };
      socket.onclose = () => {
        live = false;
        if (stopped) return;
        startPoll();
        void checkServerHealth();
        const delay = Math.min(30_000, 1000 * 2 ** retry);
        retry += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    void checkServerHealth();
    healthTimer = window.setInterval(() => void checkServerHealth(), HEALTH_CHECK_MS);

    connect();
    return () => {
      stopped = true;
      live = false;
      stopPoll();
      if (healthTimer !== null) window.clearInterval(healthTimer);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return {
    sections,
    mode,
    unauthorized,
    isItemAcked,
    ackItem,
    unackItem,
    getItemMark,
    markItem,
  };
}
