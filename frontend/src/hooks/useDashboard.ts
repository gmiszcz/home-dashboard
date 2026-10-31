import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, fetchAcks, fetchHealth, fetchLatest, sendAck, socketUrl } from '../api';
import { sectionRank } from '../sections';
import type { ConnectionMode, SectionUpdate, SocketMessage } from '../types';

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

function sortSections(rows: SectionUpdate[]): SectionUpdate[] {
  return [...rows].sort((left, right) => {
    const rank = sectionRank(left.section, left) - sectionRank(right.section, right);
    if (rank !== 0) return rank;
    return left.section.localeCompare(right.section, 'pl');
  });
}

function upsert(current: SectionUpdate[], row: SectionUpdate): SectionUpdate[] {
  const next = current.filter((item) => item.section !== row.section);
  next.push(row);
  return sortSections(next);
}

export function useDashboard(): {
  sections: SectionUpdate[];
  mode: ConnectionMode;
  unauthorized: boolean;
  ackedItems: Set<string>;
  isItemAcked: (section: string, itemId: string) => boolean;
  ackItem: (section: string, itemId: string) => Promise<void>;
} {
  const [sections, setSections] = useState<SectionUpdate[]>([]);
  const [mode, setMode] = useState<ConnectionMode>('connecting');
  const [unauthorized, setUnauthorized] = useState(false);
  const [ackedItems, setAckedItems] = useState<Set<string>>(new Set());

  const initialServerId = useRef<string | null>(null);

  const isItemAcked = useCallback(
    (section: string, itemId: string) => ackedItems.has(`${section}:${itemId}`),
    [ackedItems]
  );

  const ackItem = useCallback(async (section: string, itemId: string) => {
    const key = `${section}:${itemId}`;
    setAckedItems((prev) => {
      const next = new Set(prev);
      next.add(key);
      return next;
    });
    try {
      await sendAck(section, itemId);
    } catch (err) {
      console.error('Failed to send ack:', err);
    }
  }, []);

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
      if (!stopped) setSections(sortSections(rows));
    };

    const refreshAcks = async () => {
      try {
        const res = await fetchAcks();
        if (!stopped && res?.acks) {
          setAckedItems(new Set(res.acks.map((a) => `${a.section}:${a.item_id}`)));
        }
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
        if (message.type === 'snapshot') apply(message.data);
        if (message.type === 'update') setSections((current) => upsert(current, message.data));
        if (message.type === 'ack') {
          const item = message.data;
          setAckedItems((prev) => {
            const next = new Set(prev);
            next.add(`${item.section}:${item.item_id}`);
            return next;
          });
        }
        if ((message as { type: string }).type === 'reload') {
          window.location.reload();
        }
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

  return { sections, mode, unauthorized, ackedItems, isItemAcked, ackItem };
}
