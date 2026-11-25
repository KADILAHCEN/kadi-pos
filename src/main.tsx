import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx';
import './index.css';

if (import.meta.env.PROD && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({ immediate: true });
}

if (import.meta.env.DEV && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker
    .getRegistrations()
    .then((registrations) => {
      registrations.forEach((reg) => {
        const scriptUrl =
          reg.active?.scriptURL ||
          reg.installing?.scriptURL ||
          reg.waiting?.scriptURL ||
          '';
        if (scriptUrl.includes('dev-sw.js')) {
          void reg.unregister();
        }
      });
    })
    .catch(() => {
      // Ignore cleanup errors
    });
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
