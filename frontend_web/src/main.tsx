import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import isotipo from './assets/isotipo.png';

// Favicon (Vite-bundled, hashed). Single source of truth in src/assets.
const favicon = document.createElement('link');
favicon.rel = 'icon';
favicon.type = 'image/png';
favicon.href = isotipo;
document.head.appendChild(favicon);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
