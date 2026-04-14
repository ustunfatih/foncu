import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import './styles.css';

const rootElement = document.getElementById('root');
const THEME_STORAGE_KEY = 'foncu_theme';

if (!rootElement) {
  throw new Error('Root element not found');
}

try {
  const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  document.documentElement.dataset.theme = savedTheme === 'dark' ? 'dark' : 'light';
} catch {
  document.documentElement.dataset.theme = 'light';
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
