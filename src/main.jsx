import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.jsx';
import '@fontsource/inter/latin-300.css';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './styles.css';

const mountApp = () => {
  const container = document.getElementById('root');
  if (container) {
    if (!container._reactRoot) {
      const root = ReactDOM.createRoot(container);
      container._reactRoot = root;
      root.render(<App />);
    }
  } else {
    console.error('Target container #root not found');
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp);
} else {
  mountApp();
}
