import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import 'katex/dist/katex.min.css';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';

// Clean-slate purge of all legacy test attempts and mock stations from browser storage
try {
  const PURGE_KEY = 'codedna_clean_slate_2026_10_28_v3';
  if (localStorage.getItem(PURGE_KEY) !== 'true') {
    localStorage.removeItem('codedna_mcq_attempts');
    localStorage.removeItem('codedna_college_50_labs_workstations');
    localStorage.removeItem('codedna_codespark_shortlist');
    localStorage.removeItem('codedna_codespark_candidates');
    localStorage.removeItem('codedna_codespark_active_candidate');
    localStorage.removeItem('codedna_student_profile');
    sessionStorage.removeItem('codedna_mcq_session_attempt');
    sessionStorage.removeItem('codedna_mcq_last_finished_attempt');
    sessionStorage.removeItem('codedna_mcq_active_attempt_backup');
    localStorage.removeItem('codedna_mcq_active_attempt_backup');
    localStorage.removeItem('codedna_mcq_active_attempt');
    localStorage.setItem(PURGE_KEY, 'true');
  }
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


