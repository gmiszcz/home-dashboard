import { PrimeReactProvider } from 'primereact/api';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import 'primereact/resources/themes/lara-dark-blue/theme.css';
import 'primereact/resources/primereact.min.css';
import 'primeicons/primeicons.css';
import 'primeflex/primeflex.css';

import App from './App';
import { captureReadToken } from './api';
import './index.css';

captureReadToken();

// Zablokuj gesty powiekszania / pomniejszania (pinch-to-zoom) na urzadzeniach dotykowych
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) {
      e.preventDefault();
    }
  },
  { passive: false }
);

const root = document.getElementById('root');
if (!root) throw new Error('Brak elementu #root');

createRoot(root).render(
  <StrictMode>
    <PrimeReactProvider value={{ ripple: false, hideOverlaysOnDocumentScrolling: true }}>
      <App />
    </PrimeReactProvider>
  </StrictMode>,
);
