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

const root = document.getElementById('root');
if (!root) throw new Error('Brak elementu #root');

createRoot(root).render(
  <StrictMode>
    <PrimeReactProvider value={{ ripple: false, hideOverlaysOnDocumentScrolling: true }}>
      <App />
    </PrimeReactProvider>
  </StrictMode>,
);
