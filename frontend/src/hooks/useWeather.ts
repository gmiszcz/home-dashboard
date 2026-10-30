import { useEffect, useState } from 'react';

import { fetchWeather } from '../api';
import type { WeatherData } from '../types';

const WEATHER_REFRESH_MS = 10 * 60 * 1000; // every 10 minutes

export function useWeather(): WeatherData | null {
  const [data, setData] = useState<WeatherData | null>(null);

  useEffect(() => {
    let stopped = false;

    const load = async () => {
      try {
        const w = await fetchWeather();
        if (!stopped) setData(w);
      } catch {
        // Ignore transient network errors
      }
    };

    void load();
    const interval = window.setInterval(() => void load(), WEATHER_REFRESH_MS);
    return () => {
      stopped = true;
      window.clearInterval(interval);
    };
  }, []);

  return data;
}
