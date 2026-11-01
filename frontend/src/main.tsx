import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import 'katex/dist/katex.min.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

// Unconditional purge: No domain data in localStorage. Everything is cloud-first.
try {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k !== 'codedna_theme' && (k.startsWith('codedna_') || k.startsWith('codespark_') || k.startsWith('mcq_') || k.startsWith('spark_') || k.startsWith('axent_'))) {
      keysToRemove.push(k);
    }
  }
  keysToRemove.forEach((k) => localStorage.removeItem(k));
  sessionStorage.clear();
} catch {}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>
  );
}

// Register Progressive Web App Service Worker
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.debug('Axent ServiceWorker active with scope:', reg.scope);
      })
      .catch((err) => {
        console.debug('ServiceWorker registration skipped:', err);
      });
  });
}


