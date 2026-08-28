/**
 * Configuration controller for handling Vault connectivity credentials,
 * local persistence, validation checks, and runtime custom CSS injections.
 */

// Cross-browser storage API wrapper support (Firefox / Chrome / Edge)
const extensionStorage = globalThis.browser?.storage?.local || globalThis.chrome?.storage?.local;

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  
  document.getElementById('save').addEventListener('click', saveAndCheckConnection);
  document.getElementById('add-directory-btn').addEventListener('click', () => addDirectoryRow());
  
  initCssEditor();
});

/**
 * Creates and appends a new directory input row to the settings UI.
 */
function addDirectoryRow(dirData = { name: '', kv_engine: 'kv', secret_path: '' }) {
  const container = document.getElementById('directories-container');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'directory-row';
  row.style.display = 'flex';
  row.style.gap = '5px';
  row.style.marginBottom = '10px';

  row.innerHTML = `
    <input type="text" class="dir-name" placeholder="Name (e.g. Prod)" value="${dirData.name || ''}" style="flex: 1;">
    <input type="text" class="dir-kv" placeholder="Engine (kv)" value="${dirData.kv_engine || 'kv'}" style="flex: 1;">
    <input type="text" class="dir-path" placeholder="Path (e.g. app/)" value="${dirData.secret_path || ''}" style="flex: 2;">
    <button class="btn-remove-row btn-secondary" style="margin-top: 0px; width: auto;" title="Remove">X</button>
  `;

  row.querySelector('.btn-remove-row').addEventListener('click', () => row.remove());
  container.appendChild(row);
}

/**
 * Persists current credential fields to browser local storage
 * and executes a test authentication request against the Vault server.
 */
async function saveAndCheckConnection() {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = 'Saving configuration and testing connection...';
    status.className = 'neutral';
  }

  let url = document.getElementById('vault_url').value.trim().replace(/\/$/, "");
  
  // Gather all directories from the UI
  const directoryRows = document.querySelectorAll('.directory-row');
  const directories = [];
  directoryRows.forEach(row => {
    const name = row.querySelector('.dir-name').value.trim();
    const kv_engine = row.querySelector('.dir-kv').value.trim().replace(/^\/+|\/+$/g, "");
    const secret_path = row.querySelector('.dir-path').value.trim().replace(/^\/+|\/+$/g, "");
    
    if (name && kv_engine) {
      directories.push({ name, kv_engine, secret_path });
    }
  });

  const configurationPayload = {
    vault_url: url,
    username: document.getElementById('username').value.trim(),
    password: document.getElementById('password').value,
    directories: directories
  };

  try {
    if (extensionStorage) {
      await extensionStorage.set(configurationPayload);
    }

    if (!configurationPayload.vault_url || !configurationPayload.username || !configurationPayload.password) {
      throw new Error("Missing required global fields: URL, Username, or Password.");
    }

    if (directories.length === 0) {
      throw new Error("Please add at least one valid directory (Name and Engine are required).");
    }

    const loginEndpoint = `${configurationPayload.vault_url}/v1/auth/userpass/login/${configurationPayload.username}`;
    
    const response = await fetch(loginEndpoint, {
      method: 'POST',
      body: JSON.stringify({ password: configurationPayload.password }),
      headers: { 'Content-Type': 'application/json' }
    });

    if (!response.ok) {
      throw new Error(`Authentication failure: HTTP status ${response.status}`);
    }

    if (status) {
      status.textContent = 'Settings saved successfully. Connection verified.';
      status.className = 'success';
    }
  } catch (connectionError) {
    if (status) {
      status.textContent = `Settings saved, but connection failed:\n${connectionError.message}`;
      status.className = 'error';
    }
  }
}

/**
 * Restores previously stored configuration options.
 */
async function restoreOptions() {
  if (!extensionStorage) return;

  try {
    const storedData = await extensionStorage.get([
      'vault_url',
      'username',
      'password',
      'directories',
      'custom_css_payload'
    ]);

    if (storedData.vault_url) document.getElementById('vault_url').value = storedData.vault_url;
    if (storedData.username) document.getElementById('username').value = storedData.username;
    if (storedData.password) document.getElementById('password').value = storedData.password;
    
    const container = document.getElementById('directories-container');
    if (container) {
      container.innerHTML = ''; // Clear existing
      
      if (storedData.directories && storedData.directories.length > 0) {
        storedData.directories.forEach(dir => addDirectoryRow(dir));
      } else {
        addDirectoryRow(); // Add one empty row by default
      }
    }
    
    if (storedData.custom_css_payload) {
      const editor = document.getElementById('custom-css-editor');
      const styleTag = document.getElementById('dynamic-custom-style');
      if (editor) editor.value = storedData.custom_css_payload;
      if (styleTag) styleTag.textContent = storedData.custom_css_payload;
    }
  } catch (restoreError) {
    console.error('Failed to restore options:', restoreError);
  }
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

  if (!toggleBtn || !editorWrapper || !applyBtn) return;

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
    if (styleContainer) styleContainer.textContent = cssRules;
    
    if (extensionStorage) {
      await extensionStorage.set({ custom_css_payload: cssRules });
    }
    
    const originalLabel = applyBtn.textContent;
    applyBtn.textContent = 'Styles Applied';
    setTimeout(() => {
      applyBtn.textContent = originalLabel;
    }, 1200);
  });
}
