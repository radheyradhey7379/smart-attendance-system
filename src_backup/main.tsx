import {StrictMode} from 'react';
import React from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Global Polyfill to fix 'React is not defined' error in production/WebView
if (typeof window !== 'undefined') {
  (window as any).React = React;
}

// Global Startup Logging for Android Debugging
console.log('MAIN: Application script starting... Polyfill Active.');

// Minimal entry point to prevent startup crashes
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
