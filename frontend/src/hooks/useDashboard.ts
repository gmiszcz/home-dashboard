import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  ApiError,
  fetchAcks,
  fetchFavorites,
  fetchHealth,
  fetchLatest,
  removeAck,
  removeFavorite,
  sendAck,
  sendFavorite,
  socketUrl,
} from '../api';
import { isAckedInFamily } from '../aiAck';
import { isStarredInFamily, mergeFamilyFavorites } from '../aiFavorites';
import {
  ACK_KIND,
  markKey,
  marksFromAcks,
  SEEN_KIND,
  SEEN_SECTION,
  seenFromMarks,
  seenItemIdsForSection,
  seenItemId,
} from '../marks';
import { ackFamilySections } from '../sections';
import type { ConnectionMode, DashboardItem, FavoriteRecord, SectionUpdate, SocketMessage } from '../types';
import { type DashboardState, applySocketMessage, sortSections, withFavorite, withMark, withMarks } from './socketMessage';

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
  /** Undefined until the server marks are loaded, so nothing is judged on an empty mark list. */
  isItemAcked: ((section: string, itemId: string) => boolean) | undefined;
  ackItem: (section: string, itemId: string) => Promise<void>;
  unackItem: (section: string, itemId: string) => Promise<void>;
  getItemMark: (section: string, itemId: string) => string | undefined;
  markItem: (section: string, itemId: string, kind: string) => Promise<void>;
  isItemStarred: (section: string, itemId: string) => boolean;
  starItem: (section: string, itemId: string, itemData: DashboardItem) => Promise<void>;
  unstarItem: (section: string, itemId: string) => Promise<void>;
  getSectionFavorites: (section: string) => FavoriteRecord[];
  seenMap: Record<string, string>;
  acknowledgeSeen: (section: string, fingerprint: string) => Promise<void>;
  unacknowledgeSeen: (section: string, fingerprint: string) => Promise<void>;
} {
  const [mode, setMode] = useState<ConnectionMode>('connecting');
  const [unauthorized, setUnauthorized] = useState(false);
  // marks: "section:id" -> kind ("ack" = read, "skipped" = not interested)
  const [state, setState] = useState<DashboardState>({
    sections: [],
    marks: new Map(),
    favorites: new Map(),
  });
  const { sections, marks, favorites } = state;
  // Latest marks for the rollback of a failed request
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const favoritesRef = useRef(favorites);
  favoritesRef.current = favorites;

  const initialServerId = useRef<string | null>(null);
  const [acksLoaded, setAcksLoaded] = useState(false);

  const ackedItems = useMemo(
    () => new Set([...marks].filter(([, kind]) => kind === ACK_KIND).map(([key]) => key)),
    [marks]
  );

  const isItemAcked = useCallback(
    (section: string, itemId: string) => isAckedInFamily(section, itemId, (key) => ackedItems.has(key)),
    [ackedItems]
  );

  // Acknowledged "Ogarnięte" content fingerprint per section, from the shared marks.
  const seenMap = useMemo(() => seenFromMarks(marks), [marks]);

  const getItemMark = useCallback(
    (section: string, itemId: string) => marks.get(markKey(section, itemId)),
    [marks]
  );

  // AI favorites fan out across the AI family (ai_daily + ai_weekly share an id),
  // so a starred article shows in both sections and the "Ulubione" list is the same.
  // Non-AI sections have a single family member, so their behaviour is unchanged.
  const isItemStarred = useCallback(
    (section: string, itemId: string) => isStarredInFamily(section, itemId, (key) => favorites.has(key)),
    [favorites]
  );

  const getSectionFavorites = useCallback(
    (section: string) => mergeFamilyFavorites(section, favorites.values()),
    [favorites]
  );

  // Optimistic: the mark shows at once and is rolled back when the server rejects it
  const setMark = useCallback((key: string, kind: string | undefined) => {
    setState((prev) => ({ ...prev, marks: withMark(prev.marks, key, kind) }));
  }, []);

  // Several keys in one state update, so an AI family fan-out renders once, not once per section.
  const setMarks = useCallback((keys: readonly string[], kind: string | undefined) => {
    setState((prev) => ({ ...prev, marks: withMarks(prev.marks, keys, kind) }));
  }, []);

  const setFavoriteState = useCallback((key: string, record: FavoriteRecord | undefined) => {
    setState((prev) => ({ ...prev, favorites: withFavorite(prev.favorites, key, record) }));
  }, []);

  const starOne = useCallback(
    async (section: string, itemId: string, itemData: DashboardItem) => {
      const key = markKey(section, itemId);
      const previous = favoritesRef.current.get(key);
      const optimistic: FavoriteRecord = {
        section,
        item_id: itemId,
        saved_at: new Date().toISOString(),
        item_data: itemData,
      };
      setFavoriteState(key, optimistic);
      try {
        const stored = await sendFavorite(section, itemId, itemData);
        setFavoriteState(key, stored);
      } catch (err) {
        console.error('Failed to save favorite:', err);
        setFavoriteState(key, previous);
      }
    },
    [setFavoriteState]
  );

  const unstarOne = useCallback(
    async (section: string, itemId: string) => {
      const key = markKey(section, itemId);
      const previous = favoritesRef.current.get(key);
      setFavoriteState(key, undefined);
      try {
        await removeFavorite(section, itemId);
      } catch (err) {
        console.error('Failed to remove favorite:', err);
        setFavoriteState(key, previous);
      }
    },
    [setFavoriteState]
  );

  // AI favorites fan out across the AI family (ai_daily + ai_weekly share an id),
  // so a star in one AI section saves the same article in both and converges across
  // devices. Non-AI sections have a single family member, so their behaviour is unchanged.
  const starItem = useCallback(
    async (section: string, itemId: string, itemData: DashboardItem) => {
      await Promise.all(
        ackFamilySections(section).map((member) => starOne(member, itemId, itemData))
      );
    },
    [starOne]
  );

  const unstarItem = useCallback(
    async (section: string, itemId: string) => {
      await Promise.all(ackFamilySections(section).map((member) => unstarOne(member, itemId)));
    },
    [unstarOne]
  );

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

  // AI ack/unack fan out across the ack family (ai_daily + ai_weekly share an id),
  // so the same article converges in both sections and across devices. Non-AI
  // sections have a single family member, so their behaviour is unchanged.
  const ackItem = useCallback(
    async (section: string, itemId: string) => {
      const members = ackFamilySections(section);
      const keys = members.map((member) => markKey(member, itemId));
      const previous = keys.map((key) => marksRef.current.get(key));
      setMarks(keys, ACK_KIND); // one optimistic update for the whole family, so the tile renders once
      try {
        await Promise.all(members.map((member) => sendAck(member, itemId, ACK_KIND)));
      } catch (err) {
        console.error('Failed to send mark:', err);
        setState((prev) => {
          let marks = prev.marks;
          keys.forEach((key, i) => (marks = withMark(marks, key, previous[i])));
          return { ...prev, marks };
        });
      }
    },
    [setMarks]
  );

  const unackItem = useCallback(
    async (section: string, itemId: string) => {
      const members = ackFamilySections(section);
      const keys = members.map((member) => markKey(member, itemId));
      const previous = keys.map((key) => marksRef.current.get(key));
      setMarks(keys, undefined); // one optimistic update for the whole family
      try {
        await Promise.all(members.map((member) => removeAck(member, itemId)));
      } catch (err) {
        console.error('Failed to remove ack:', err);
        setState((prev) => {
          let marks = prev.marks;
          keys.forEach((key, i) => (marks = withMark(marks, key, previous[i])));
          return { ...prev, marks };
        });
      }
    },
    [setMarks]
  );

  // "Ogarnięte" persistence. The seen row only exists after a real click, never on
  // first load, so the DB is not flooded. A click replaces every older seen row of the
  // section, so exactly one row per section remains and the latest click always wins.
  const acknowledgeSeen = useCallback(
    async (section: string, fingerprint: string) => {
      const itemId = seenItemId(section, fingerprint);
      const stale = seenItemIdsForSection(marksRef.current, section).filter((id) => id !== itemId);
      const newKey = markKey(SEEN_SECTION, itemId);
      const staleKeys = stale.map((id) => markKey(SEEN_SECTION, id));
      const previous = new Map([newKey, ...staleKeys].map((key) => [key, marksRef.current.get(key)]));
      setState((prev) => ({
        ...prev,
        marks: withMark(withMarks(prev.marks, staleKeys, undefined), newKey, SEEN_KIND),
      }));
      try {
        await Promise.all([
          sendAck(SEEN_SECTION, itemId, SEEN_KIND),
          ...stale.map((id) => removeAck(SEEN_SECTION, id)),
        ]);
      } catch (err) {
        console.error('Failed to save seen mark:', err);
        setState((prev) => {
          let marks = prev.marks;
          previous.forEach((kind, key) => (marks = withMark(marks, key, kind)));
          return { ...prev, marks };
        });
      }
    },
    []
  );

  const unacknowledgeSeen = useCallback(
    async (section: string, fingerprint: string) => {
      const itemId = seenItemId(section, fingerprint);
      const key = markKey(SEEN_SECTION, itemId);
      const previous = marksRef.current.get(key);
      setMark(key, undefined);
      try {
        await removeAck(SEEN_SECTION, itemId);
      } catch (err) {
        console.error('Failed to remove seen mark:', err);
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
        if (!stopped && res?.acks) {
          setState((prev) => ({ ...prev, marks: marksFromAcks(res.acks) }));
          setAcksLoaded(true);
        }
      } catch {
        // ignore background acks error
      }
    };

    const refreshFavorites = async () => {
      try {
        const res = await fetchFavorites();
        if (!stopped && res?.favorites) {
          const map = new Map<string, FavoriteRecord>();
          for (const fav of res.favorites) {
            map.set(markKey(fav.section, fav.item_id), fav);
          }
          setState((prev) => ({ ...prev, favorites: map }));
        }
      } catch {
        // ignore background favorites error
      }
    };

    const pollOnce = async () => {
      try {
        const [payload] = await Promise.all([fetchLatest(), refreshAcks(), refreshFavorites()]);
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
        void refreshFavorites();
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
    isItemAcked: acksLoaded ? isItemAcked : undefined,
    ackItem,
    unackItem,
    getItemMark,
    markItem,
    isItemStarred,
    starItem,
    unstarItem,
    getSectionFavorites,
    seenMap,
    acknowledgeSeen,
    unacknowledgeSeen,
  };
}
