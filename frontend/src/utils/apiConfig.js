/**
 * API configuration utility for GXML Web.
 * 
 * Supports running in:
 * - Browser (relative URLs to same origin)
 * - Electron (localhost:8765 via embedded Python server)
 */

let cachedApiUrl = null;

/**
 * Get the base URL for API calls.
 * In Electron, this returns the local Python server URL.
 * In browser, this returns empty string (relative URLs).
 */
export async function getApiBaseUrl() {
  if (cachedApiUrl !== null) {
    return cachedApiUrl;
  }
  
  // Check if we're in Electron
  if (window.electronAPI?.isElectron) {
    try {
      cachedApiUrl = await window.electronAPI.getApiUrl();
      console.log('Running in Electron, API URL:', cachedApiUrl);
      return cachedApiUrl;
    } catch (e) {
      console.warn('Failed to get Electron API URL:', e);
    }
  }
  
  // Check if GXML_API_URL was injected (Electron fallback)
  if (window.GXML_API_URL) {
    cachedApiUrl = window.GXML_API_URL;
    console.log('Using injected API URL:', cachedApiUrl);
    return cachedApiUrl;
  }
  
  // Default to relative URLs (browser mode)
  cachedApiUrl = '';
  return cachedApiUrl;
}

/**
 * Build a full API URL.
 * @param {string} path - API path (e.g., '/api/render/binary')
 * @returns {Promise<string>} Full URL
 */
export async function buildApiUrl(path) {
  const baseUrl = await getApiBaseUrl();
  return baseUrl + path;
}

/**
 * Check if running in Electron.
 */
export function isElectron() {
  return window.electronAPI?.isElectron || !!window.GXML_API_URL;
}
