import './index.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { isAiosHost, isBrowserRuntime } from './runtime';

async function main() {
  // Same color-scheme as the host page, or the browser paints the iframe opaque.
  if (isAiosHost) document.documentElement.style.colorScheme = 'dark';
  // browserMock is for Vite dev mode only (UI prototyping without a server).
  // In standalone server mode, assets are loaded server-side and sent over WebSocket.
  if (isBrowserRuntime && import.meta.env.DEV) {
    const { initBrowserMock } = await import('./browserMock.js');
    await initBrowserMock();
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

main().catch(console.error);
