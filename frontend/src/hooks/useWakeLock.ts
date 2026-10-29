import { useEffect, useState } from 'react';

export function useWakeLock(): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let stopped = false;
    let sentinel: WakeLockSentinel | null = null;

    const request = async () => {
      if (stopped || !('wakeLock' in navigator)) return;
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (stopped) {
          await sentinel.release();
          return;
        }
        setActive(true);
        sentinel.addEventListener('release', () => {
          if (!stopped) setActive(false);
        });
      } catch {
        if (!stopped) setActive(false);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };

    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release();
    };
  }, []);

  return active;
}
