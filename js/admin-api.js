/**
 * Admin API client
 * Talks to the Apps Script web app that writes to the Google Sheet.
 * The PIN is checked by the script; this file never contains it.
 */

const AdminAPI = (function() {
  // Apps Script web app (/exec) URL - see apps-script/README.md
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbyTYPDR4QXFdDvUFisMAHEP5GJrivcDTZdlwKAEprsPJl1Z8USa31gjN-CE84b46mQ2/exec';
  const PIN_KEY = 'manzel_admin_pin';
  const ADMIN_KEY = 'manzel_admin';

  /**
   * POST a request to the web app
   * No custom headers, so the browser sends a simple request (no CORS preflight)
   * @param {Object} body - Request body
   * @returns {Promise<Object>} Parsed response, or a network error result
   */
  async function post(body) {
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', body: JSON.stringify(body) });
      return await response.json();
    } catch (error) {
      return { ok: false, error: 'network', message: String(error && error.message || error) };
    }
  }

  /**
   * Check a PIN and turn admin mode on if it is right
   * @param {string} pin - PIN typed by the admin
   * @returns {Promise<Object>} Web app response
   */
  async function login(pin) {
    const result = await post({ pin, action: 'verify' });
    if (result.ok) {
      sessionStorage.setItem(PIN_KEY, pin);
      localStorage.setItem(ADMIN_KEY, 'true');
    }
    return result;
  }

  /**
   * Run an admin action with the stored PIN
   * @param {string} action - monthly | project | expense
   * @param {Object} payload - Action fields
   * @returns {Promise<Object>} Web app response
   */
  async function call(action, payload) {
    const result = await post({ ...payload, pin: sessionStorage.getItem(PIN_KEY), action });
    if (result.ok && typeof SheetsAPI !== 'undefined') {
      SheetsAPI.clearCache();
    }
    return result;
  }

  /**
   * Turn admin mode off
   */
  function logout() {
    sessionStorage.removeItem(PIN_KEY);
    localStorage.removeItem(ADMIN_KEY);
  }

  /**
   * Is admin mode on with a PIN for this session?
   * @returns {boolean} True if logged in
   */
  function isLoggedIn() {
    return localStorage.getItem(ADMIN_KEY) === 'true' && Boolean(sessionStorage.getItem(PIN_KEY));
  }

  // Public API
  return {
    ENDPOINT,
    login,
    call,
    logout,
    isLoggedIn
  };
})();

if (typeof module !== 'undefined') {
  module.exports = AdminAPI;
}
