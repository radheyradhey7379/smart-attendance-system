import { Capacitor } from '@capacitor/core';

export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

const fetchWithTimeout = async (url: string, options: RequestInit = {}) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return res;
  } catch (err) {
    clearTimeout(id);
    throw err;
  }
};

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  // Standard Web/Server behavior
  if (!Capacitor.isNativePlatform()) {
    const url = `${API_BASE_URL}${path}`;
    options.credentials = 'include';
    return fetch(url, options);
  }

  // Capacitor/Android specific routing
  try {
    // 1. Try Local Office Network IP
    return await fetchWithTimeout('http://10.42.34.210:3000' + path, options);
  } catch (e) {
    try {
      // 2. Try Android Emulator Host IP
      return await fetchWithTimeout('http://10.0.2.2:3000' + path, options);
    } catch (innerE) {
      // 3. Final Fallback: Production Server (Render)
      const prodUrl = API_BASE_URL.replace(/\/$/, '');
      if (prodUrl) {
          return await fetchWithTimeout(prodUrl + path, options);
      }
      throw innerE;
    }
  }
};
