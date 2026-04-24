import { Capacitor } from '@capacitor/core';

// Hardcoded fallback to ensure production works even if env variables fail
const FALLBACK_URL = 'https://smart-attendance-system-backend-k1o1.onrender.com';
export const API_BASE_URL = (import.meta.env.VITE_API_URL || FALLBACK_URL).replace(/\/$/, '');

/**
 * Super-Resilient Fetch
 * Handles timeouts and cold starts with a single, high-patience attempt.
 */
export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const isNative = Capacitor.isNativePlatform();
  
  // 1. Determine Target URL
  let targetUrl = `${API_BASE_URL}${path}`;
  
  // 2. Local Fallback only for DEV on Native
  if (isNative && !import.meta.env.PROD) {
    // If we're in dev mode on a phone, we prioritize localhost/emulator
    // but the user wants production to work "permanently", so we'll 
    // stick to the configured API_BASE_URL which is likely production.
  }

  console.log(`[API] Connection to: ${targetUrl}`);

  // 3. Robust Execution
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s patience for Render

  try {
    const res = await fetch(targetUrl, {
      ...options,
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...options.headers
      },
      // Important for cookies/sessions in some environments
      credentials: isNative ? undefined : 'include'
    });
    
    clearTimeout(timeoutId);
    return res;
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error(`[API] Critical failure: ${err.message}`);
    throw err;
  }
};
