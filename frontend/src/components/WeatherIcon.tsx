export function WeatherIcon({ icon, className = '' }: { icon: string; className?: string }) {
  switch (icon) {
    case 'sun':
      return (
        <svg className={`weather-svg icon-sun ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" fill="#fbbf24" stroke="#f59e0b" />
          <line x1="12" y1="2" x2="12" y2="4" stroke="#fbbf24" />
          <line x1="12" y1="20" x2="12" y2="22" stroke="#fbbf24" />
          <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" stroke="#fbbf24" />
          <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" stroke="#fbbf24" />
          <line x1="2" y1="12" x2="4" y2="12" stroke="#fbbf24" />
          <line x1="20" y1="12" x2="22" y2="12" stroke="#fbbf24" />
          <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" stroke="#fbbf24" />
          <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" stroke="#fbbf24" />
        </svg>
      );
    case 'cloud-sun':
      return (
        <svg className={`weather-svg icon-cloud-sun ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="9" r="3" fill="#fbbf24" stroke="#f59e0b" />
          <path d="M17 18a5 5 0 0 0-3-9.14 5.96 5.96 0 0 0-5.7 3.65A4 4 0 0 0 4 16a4 4 0 0 0 4 4h9a4 4 0 0 0 0-8z" fill="#94a3b8" stroke="#cbd5e1" />
        </svg>
      );
    case 'cloud':
    case 'fog':
      return (
        <svg className={`weather-svg icon-cloud ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" fill="#64748b" stroke="#94a3b8" />
        </svg>
      );
    case 'drizzle':
    case 'rain':
    case 'rain-showers':
      return (
        <svg className={`weather-svg icon-rain ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.5 14H9a5 5 0 1 1 4.71-6.7h1.79a3.5 3.5 0 1 1 2 6.7Z" fill="#64748b" stroke="#94a3b8" />
          <line x1="8" y1="16" x2="7" y2="19" stroke="#60a5fa" strokeWidth="2.5" />
          <line x1="12" y1="16" x2="11" y2="19" stroke="#60a5fa" strokeWidth="2.5" />
          <line x1="16" y1="16" x2="15" y2="19" stroke="#60a5fa" strokeWidth="2.5" />
        </svg>
      );
    case 'snow':
    case 'sleet':
      return (
        <svg className={`weather-svg icon-snow ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.5 14H9a5 5 0 1 1 4.71-6.7h1.79a3.5 3.5 0 1 1 2 6.7Z" fill="#64748b" stroke="#94a3b8" />
          <circle cx="8" cy="18" r="1" fill="#e2e8f0" />
          <circle cx="12" cy="18" r="1" fill="#e2e8f0" />
          <circle cx="16" cy="18" r="1" fill="#e2e8f0" />
        </svg>
      );
    case 'thunderstorm':
      return (
        <svg className={`weather-svg icon-thunder ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.5 14H9a5 5 0 1 1 4.71-6.7h1.79a3.5 3.5 0 1 1 2 6.7Z" fill="#475569" stroke="#64748b" />
          <polygon points="13 13 9 18 12 18 10 22 15 16 12 16 13 13" fill="#facc15" stroke="#eab308" />
        </svg>
      );
    default:
      return (
        <svg className={`weather-svg icon-cloud-sun ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="4" fill="#fbbf24" stroke="#f59e0b" />
        </svg>
      );
  }
}
