import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import App from './App.tsx';
import './index.css';

// Automatically route API requests to the developer machine when running on phone
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  let [resource, config] = args;
  if (typeof resource === 'string' && resource.startsWith('/api/')) {
    if (!Capacitor.isNativePlatform()) {
      return originalFetch(resource, config);
    }

    const fetchWithTimeout = async (url: string) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await originalFetch(url, { ...(config as any), signal: controller.signal });
        clearTimeout(id);
        return res;
      } catch (err) {
        clearTimeout(id);
        throw err;
      }
    };

    try {
      // 1. Try Local Office Network IP
      return await fetchWithTimeout('http://10.42.34.210:3000' + resource);
    } catch (e) {
      try {
        // 2. Try Android Emulator Host IP
        return await fetchWithTimeout('http://10.0.2.2:3000' + resource);
      } catch (innerE) {
        // 3. Final Fallback: Production Server
        const prodUrl = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
        if (prodUrl) {
            return await fetchWithTimeout(prodUrl + resource);
        }
        throw innerE;
      }
    }
  }
  return originalFetch(resource, config);
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
