/**
 * Configuration controller for handling Vault connectivity credentials,
 * local persistence, validation checks, and runtime custom CSS injections.
 */

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  
  document.getElementById('save').addEventListener('click', saveAndCheckConnection);
  
  // Initialize collapsible CSS editor bindings
  initCssEditor();
});

/**
 * Persists current credential fields to browser local storage
 * and executes a test authentication request against the Vault server.
 */
async function saveAndCheckConnection() {
  const status = document.getElementById('status');
  
  let url = document.getElementById('vault_url').value.trim().replace(/\/$/, "");
  let kvEngine = document.getElementById('kv_engine').value.trim().replace(/^\/+|\/+$/g, "");
  let secretPath = document.getElementById('secret_path').value.trim().replace(/^\/+|\/+$/g, "");

  const configurationPayload = {
    vault_url: url,
    username: document.getElementById('username').value.trim(),
    password: document.getElementById('password').value,
    kv_engine: kvEngine,
    secret_path: secretPath
  };

  status.textContent = 'Saving configuration and testing connection...';
  status.className = 'neutral';

  try {
    await browser.storage.local.set(configurationPayload);

    if (!configurationPayload.vault_url || !configurationPayload.username || !configurationPayload.password || !configurationPayload.kv_engine) {
      throw new Error("Missing required fields: URL, Username, Password, or KV Engine.");
    }

    const loginEndpoint = `${configurationPayload.vault_url}/v1/auth/userpass/login/${configurationPayload.username}`;
    
    const response = await fetch(loginEndpoint, {
      method: 'POST',
      body: JSON.stringify({ password: configurationPayload.password }),
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      let diagnosticDetails = `HTTP status ${response.status}`;
      try {
        const errorResponseBody = await response.json();
        if (errorResponseBody.errors && errorResponseBody.errors.length > 0) {
          diagnosticDetails += ` - ${errorResponseBody.errors.join(', ')}`;
        }
      } catch (parsingError) {
        // Fallback gracefully if error payload is not structured JSON
      }
      throw new Error(`Authentication failure: ${diagnosticDetails}`);
    }

    status.textContent = 'Settings saved successfully. Connection verified.';
    status.className = 'success';
    
  } catch (connectionError) {
    status.textContent = `Settings saved, but connection failed:\n${connectionError.message}`;
    status.className = 'error';
  }
}

/**
 * Restores previously stored configuration options and custom CSS styles from storage.
 */
function restoreOptions() {
  browser.storage.local.get([
    'vault_url',
    'username',
    'password',
    'kv_engine',
    'secret_path',
    'custom_css_payload'
  ]).then((storedData) => {
    if (storedData.vault_url) document.getElementById('vault_url').value = storedData.vault_url;
    if (storedData.username) document.getElementById('username').value = storedData.username;
    if (storedData.password) document.getElementById('password').value = storedData.password;
    if (storedData.kv_engine) document.getElementById('kv_engine').value = storedData.kv_engine;
    if (storedData.secret_path !== undefined) document.getElementById('secret_path').value = storedData.secret_path;
    
    if (storedData.custom_css_payload) {
      document.getElementById('custom-css-editor').value = storedData.custom_css_payload;
      document.getElementById('dynamic-custom-style').textContent = storedData.custom_css_payload;
    }
  });
}

/**
 * Manages the collapsible behavior and runtime injection of user-defined CSS rules.
 */
function initCssEditor() {
  const toggleBtn = document.getElementById('toggle-editor-btn');
  const editorWrapper = document.getElementById('css-editor-wrapper');
  const cssTextarea = document.getElementById('custom-css-editor');
  const applyBtn = document.getElementById('apply-css-btn');
  const styleContainer = document.getElementById('dynamic-custom-style');

  // Toggle editor visibility state on demand
  toggleBtn.addEventListener('click', () => {
    const isHidden = editorWrapper.classList.contains('hidden');
    if (isHidden) {
      editorWrapper.classList.remove('hidden');
      toggleBtn.textContent = 'Close CSS Editor';
    } else {
      editorWrapper.classList.add('hidden');
      toggleBtn.textContent = 'Open CSS Editor';
    }
  });

  // Save and apply custom style rules dynamically to the DOM
  applyBtn.addEventListener('click', async () => {
    const cssRules = cssTextarea.value;
    styleContainer.textContent = cssRules;
    
    await browser.storage.local.set({ custom_css_payload: cssRules });
    
    const originalLabel = applyBtn.textContent;
    applyBtn.textContent = 'Styles Applied';
    setTimeout(() => {
      applyBtn.textContent = originalLabel;
    }, 1200);
  });
}
