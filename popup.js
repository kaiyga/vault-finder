/**
 * Popup Application Shell & View Router.
 * Manages global application state, active configurations, session storage, and view rendering.
 */
const extensionStorage = globalThis.browser?.storage?.local || globalThis.chrome?.storage?.local;
const extensionSession = globalThis.browser?.storage?.session || globalThis.chrome?.storage?.session || extensionStorage;

const app = {
  vaultConfig: {},
  vaultToken: null,
  allSecrets: [],
  selectedDirectoryIndex: 0,
  searchQuery: '',
  unwrappedCache: null,

  // Registry of available popup sub-views
  views: {
    secretManager: secretManager,
    secretEditor: secretEditor,
    secretUnwrapper: secretUnwrapper
  },

  /**
   * Application entry point. Loads configurations, restores active session, and decides initial view.
   */
  async init() {
    document.getElementById('open-settings')?.addEventListener('click', () => {
      if (globalThis.browser?.runtime?.openOptionsPage) {
        globalThis.browser.runtime.openOptionsPage();
      } else {
        globalThis.chrome.runtime.openOptionsPage();
      }
    });

    if (!extensionStorage) return;

    this.vaultConfig = await extensionStorage.get([
      'vault_url',
      'auth_type',
      'username',
      'password',
      'vault_token',
      'directories',
      'custom_css_payload'
    ]);

    if (this.vaultConfig.custom_css_payload) {
      const styleTag = document.getElementById('dynamic-custom-style');
      if (styleTag) styleTag.textContent = this.vaultConfig.custom_css_payload;
    }

    const appContent = document.getElementById('app-content');
    const authType = this.vaultConfig.auth_type || 'userpass';

    const isTokenMissing = authType === 'token' && !this.vaultConfig.vault_token;
    const isCredsMissing = (authType === 'userpass' || authType === 'ldap') && (!this.vaultConfig.username || !this.vaultConfig.password);

    if (!this.vaultConfig.vault_url || isTokenMissing || isCredsMissing || !this.vaultConfig.directories || this.vaultConfig.directories.length === 0) {
      appContent.replaceChildren();
      const errBox = document.createElement('div');
      errBox.className = 'error';
      errBox.textContent = 'Missing configuration. Please open extension settings.';
      appContent.appendChild(errBox);
      return;
    }

    // Restore cached unwrapped payload from session storage if present
    this.unwrappedCache = await this.getUnwrappedCache();

    // Auto-route: If an active unwrapped secret exists in memory, display it immediately
    if (this.unwrappedCache !== null) {
      this.renderView('secretUnwrapper');
    } else {
      this.renderView('secretManager');
    }
  },

  /**
   * Main Router: Dynamically swaps sub-view content within the main container.
   */
  renderView(viewName, params = {}) {
    const appContent = document.getElementById('app-content');
    const targetView = this.views[viewName];

    if (!targetView) {
      console.error(`View menu '${viewName}' not found in registry.`);
      return;
    }

    const viewElement = targetView.render(this, params);
    appContent.replaceChildren(viewElement);
  },

  /**
   * Session Storage Abstraction: Fetches cached unwrapped secret payload.
   */
  async getUnwrappedCache() {
    try {
      if (!extensionSession) return null;
      const res = await extensionSession.get('vault_unwrapped_cache');
      return res?.vault_unwrapped_cache || null;
    } catch (err) {
      console.error('Failed to read session cache:', err);
      return null;
    }
  },

  /**
   * Session Storage Abstraction: Persists unwrapped secret payload to browser session.
   */
  async setUnwrappedCache(payload) {
    this.unwrappedCache = payload;
    try {
      if (extensionSession) {
        await extensionSession.set({ vault_unwrapped_cache: payload });
      }
    } catch (err) {
      console.error('Failed to set session cache:', err);
    }
  },

  /**
   * Session Storage Abstraction: Clears active unwrapped secret payload.
   */
  async clearUnwrappedCache() {
    this.unwrappedCache = null;
    try {
      if (extensionSession) {
        await extensionSession.remove('vault_unwrapped_cache');
      }
    } catch (err) {
      console.error('Failed to clear session cache:', err);
    }
  },

  /**
   * Returns active directory configuration object.
   */
  getActiveDirectory() {
    if (!this.vaultConfig.directories) return null;
    return this.vaultConfig.directories[this.selectedDirectoryIndex] || this.vaultConfig.directories[0];
  },

  /**
   * Formats and returns full secret directory path.
   */
  getActiveDirPath() {
    const activeDir = this.getActiveDirectory();
    if (!activeDir) return '';
    return activeDir.secret_path ? `${activeDir.secret_path}/` : '';
  },

  /**
   * Utility helper to update status/error message elements.
   */
  showMessage(element, text, className) {
    if (!element) return;
    element.className = className;
    element.textContent = text;
  },

  /**
   * Authenticates against Vault based on the configured auth_type.
   */
async authenticate() {
    const authType = this.vaultConfig.auth_type || 'userpass';

    if (authType === 'token') {
      this.vaultToken = this.vaultConfig.vault_token;
      return true;
    }

    const endpoint = authType === 'ldap' 
      ? `auth/ldap/login/${this.vaultConfig.username}`
      : `auth/userpass/login/${this.vaultConfig.username}`;

    const loginUrl = `${this.vaultConfig.vault_url}/v1/${endpoint}`;
    try {
      const res = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: this.vaultConfig.password })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this.vaultToken = data.auth.client_token;
      return true;
    } catch (err) {
      console.error('Authentication error:', err);
      return false;
    }
  }
};

document.addEventListener('DOMContentLoaded', () => app.init());
