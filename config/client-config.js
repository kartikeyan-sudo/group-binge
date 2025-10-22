// Client-side configuration
// This file contains frontend configuration that references backend endpoints

// Allow frontend to be told explicitly where the backend lives. This helps
// when the static site (Netlify) is hosted on a different origin than the
// API server. You can set `window.BINGE_BACKEND = 'https://your-backend.com'`
// before this script runs (for example in `index.html`) or add a
// <meta name="backend-url" content="https://your-backend.com"> tag.
function readBackendOverride() {
  if (window && window.BINGE_BACKEND) return window.BINGE_BACKEND;
  const meta = document.querySelector('meta[name="backend-url"]');
  if (meta && meta.content) return meta.content;
  return null;
}

const override = readBackendOverride();

// Determine apiHost and socketHost either from override or from current host
const apiHost = override ? override.replace(/\/+$/, '') : `${window.location.protocol}//${window.location.host}`;
const socketHost = override ? override.replace(/\/+$/, '') : `${window.location.protocol}//${window.location.host}`;

const ClientConfig = {
  // API Base URL - points to the REST API
  API_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:4001/api'
    : `${apiHost}/api`,

  // Socket.IO URL - points to the Socket.IO server root
  SOCKET_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:4001'
    : socketHost,

  // Debug mode (can be overridden via window.BINGE_DEBUG = true/false)
  DEBUG: (typeof window.BINGE_DEBUG !== 'undefined') ? !!window.BINGE_DEBUG : true,

  // Video sync settings
  SYNC_COOLDOWN: 10000, // 10 seconds between syncs
  TIME_SYNC_THRESHOLD: 2, // 2 seconds difference to trigger sync
  BUFFER_DURATION: 1000, // 1 second buffer for state changes
  MAX_SYNC_ATTEMPTS: 2 // Max consecutive syncs before breaking the loop
};

// Export for use in app (CommonJS for tests/builds)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ClientConfig;
}
