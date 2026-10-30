import type { WeatherData } from '../types';
import { WeatherIcon } from './WeatherIcon';

export function WeatherTimeline({
  weather,
  unavailable,
}: {
  weather: WeatherData | null;
  unavailable: boolean;
}) {
  if (!weather) {
    return (
      <div className="weather-timeline-bar is-loading">
        <span className="weather-loading-text">
          {unavailable
            ? 'Prognoza pogody chwilowo niedostępna'
            : 'Pobieranie prognozy pogody dla Gliwic…'}
        </span>
      </div>
    );
  }

  const { current, hourly, city } = weather;

  return (
    <div className="weather-timeline-bar" title={`Pogoda dla ${city}: ${current.condition}`}>
      <div className="weather-current">
        <WeatherIcon icon={current.icon} className="weather-icon-current" />
        <div className="weather-current-text">
          <span className="weather-current-temp">{current.temp}°C</span>
          <span className="weather-current-city">{city}</span>
        </div>
      </div>

      <div className="weather-divider" />

      <div className="weather-forecast-list">
        {hourly.map((item) => (
          <div key={item.time} className="weather-hour-slot">
            <span className="weather-hour-time">{item.time}</span>
            <span className="weather-hour-temp">{item.temp}°C</span>
            <WeatherIcon icon={item.icon} className="weather-icon-hourly" />
            {item.pop && item.pop >= 20 ? (
              <span className="weather-hour-pop" title={`Prawdopodobieństwo opadów: ${item.pop}%`}>
                {item.pop}%
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
