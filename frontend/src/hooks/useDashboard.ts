import { useEffect, useState } from 'react';

import { ApiError, fetchHealth, fetchLatest, socketUrl } from '../api';
import { sectionRank } from '../sections';
import type { ConnectionMode, SectionUpdate, SocketMessage } from '../types';

const POLL_MS = 20_000;

function sortSections(rows: SectionUpdate[]): SectionUpdate[] {
  return [...rows].sort((left, right) => {
    const rank = sectionRank(left.section) - sectionRank(right.section);
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
  staleMinutes: number;
  unauthorized: boolean;
} {
  const [sections, setSections] = useState<SectionUpdate[]>([]);
  const [mode, setMode] = useState<ConnectionMode>('connecting');
  const [staleMinutes, setStaleMinutes] = useState(360);
  const [unauthorized, setUnauthorized] = useState(false);

  useEffect(() => {
    let stopped = false;
    let socket: WebSocket | null = null;
    let retry = 0;
    let pollTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let live = false;

    const stopPoll = () => {
      if (pollTimer !== null) window.clearInterval(pollTimer);
      pollTimer = null;
    };

    const apply = (rows: SectionUpdate[]) => {
      if (!stopped) setSections(sortSections(rows));
    };

    const pollOnce = async () => {
      try {
        const payload = await fetchLatest();
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
      };
      socket.onerror = () => {
        socket?.close();
      };
      socket.onclose = () => {
        live = false;
        if (stopped) return;
        startPoll();
        const delay = Math.min(30_000, 1000 * 2 ** retry);
        retry += 1;
        reconnectTimer = window.setTimeout(connect, delay);
      };
    };

    void fetchHealth()
      .then((health) => {
        if (!stopped && health.stale_after_minutes) setStaleMinutes(health.stale_after_minutes);
      })
      .catch(() => undefined);

    connect();
    return () => {
      stopped = true;
      live = false;
      stopPoll();
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return { sections, mode, staleMinutes, unauthorized };
}
