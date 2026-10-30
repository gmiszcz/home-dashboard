import { useEffect, useState } from 'react';

import { fetchWeather } from '../api';
import type { WeatherData } from '../types';

const WEATHER_REFRESH_MS = 10 * 60 * 1000; // every 10 minutes

export function useWeather(): { weather: WeatherData | null; unavailable: boolean } {
  const [data, setData] = useState<WeatherData | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let stopped = false;

    const load = async () => {
      try {
        const w = await fetchWeather();
        if (stopped) return;
        setData(w);
        setUnavailable(false);
      } catch {
        // Keep the last forecast on screen, only flag the failure
        if (!stopped) setUnavailable(true);
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), WEATHER_REFRESH_MS);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, []);

  return { weather: data, unavailable };
}
