/**
 * Popup Application Shell & View Router.
 */
const extensionStorage = globalThis.browser?.storage?.local || globalThis.chrome?.storage?.local;
const sessionStorageApi = globalThis.browser?.storage?.session || globalThis.chrome?.storage?.session || extensionStorage;

const app = {
  vaultConfig: {},
  vaultToken: null,
  allSecrets: [],
  selectedDirectoryIndex: 0,
  searchQuery: '',
  unwrappedCache: null,

  // Registry of available popup sub-menus
  views: {
    secretManager: secretManager,
    secretEditor: secretEditor,
    secretUnwrapper: secretUnwrapper
  },

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
      'username',
      'password',
      'directories',
      'custom_css_payload'
    ]);

    if (this.vaultConfig.custom_css_payload) {
      const styleTag = document.getElementById('dynamic-custom-style');
      if (styleTag) styleTag.textContent = this.vaultConfig.custom_css_payload;
    }

    const appContent = document.getElementById('app-content');

    if (!this.vaultConfig.vault_url || !this.vaultConfig.username || !this.vaultConfig.password || !this.vaultConfig.directories || this.vaultConfig.directories.length === 0) {
      appContent.replaceChildren();
      const errBox = document.createElement('div');
      errBox.className = 'error';
      errBox.textContent = 'Missing configuration. Please open extension settings.';
      appContent.appendChild(errBox);
      return;
    }

    try {
      const sessionData = await sessionStorageApi.get('vault_unwrapped_cache');
      if (sessionData && sessionData.vault_unwrapped_cache) {
        this.unwrappedCache = sessionData.vault_unwrapped_cache;
      }
    } catch (e) {
      console.error('Failed to restore unwrapped cache from session:', e);
    }

    if (this.unwrappedCache !== null) {
      this.renderView('secretUnwrapper');
    } else {
      this.renderView('secretManager');
    }
  },

  /**
   * Main Router function: Swaps current view container content dynamically.
   */
  renderView(viewName, params = {}) {
    const appContent = document.getElementById('app-content');
    const targetView = this.views[viewName];

    if (!targetView) {
      console.error(`View menu '${viewName}' not found in registry.`);
      return;
    }

    // Swap node safely
    const viewElement = targetView.render(this, params);
    appContent.replaceChildren(viewElement);
  },

  getActiveDirectory() {
    if (!this.vaultConfig.directories) return null;
    return this.vaultConfig.directories[this.selectedDirectoryIndex] || this.vaultConfig.directories[0];
  },

  showMessage(element, text, className) {
    if (!element) return;
    element.className = className;
    element.textContent = text;
  },

  async authenticate() {
    const loginUrl = `${this.vaultConfig.vault_url}/v1/auth/userpass/login/${this.vaultConfig.username}`;
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
