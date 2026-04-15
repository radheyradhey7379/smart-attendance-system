export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  // Ensure we don't double up on slashes
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_BASE_URL}${path}`;
  
  // Ensure credentials for cookie-based auth
  options.credentials = 'include';
  
  return fetch(url, options);
};
