import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { Provider } from './components/ui/provider';
import { Toaster } from './components/ui/toaster';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  const register = () => {
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(error => {
      console.warn('Service worker registration failed:', error);
    });
  };
  if (document.readyState === 'complete') register();
  else window.addEventListener('load', register, { once: true });
} else if (import.meta.env.DEV) {
  // A previous production build may have controlled this development origin.
  // Retire only this app's worker and caches; preserve other local applications.
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => Promise.all(
      registrations.filter(registration => [registration.active, registration.waiting, registration.installing].some(worker => {
        if (!worker) return false;
        const url = new URL(worker.scriptURL);
        return url.origin === window.location.origin && url.pathname === '/sw.js';
      })).map(registration => registration.unregister()),
    )).catch(error => console.warn('Could not retire the development service worker:', error));
  }
  if ('caches' in window) {
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('aa-')).map(key => caches.delete(key))))
      .catch(error => console.warn('Could not clear development app caches:', error));
  }
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);
root.render(
  <React.StrictMode>
    <Provider defaultTheme="dark">
      <App />
      <Toaster />
    </Provider>
  </React.StrictMode>
);
