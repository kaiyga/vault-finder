/**
 * Configuration controller for handling Vault connectivity credentials,
 * authentication methods (UserPass, LDAP, Token), local persistence, and custom CSS injections.
 */

// Cross-browser storage API wrapper support (Firefox / Chrome / Edge)
const extensionStorage = globalThis.browser?.storage?.local || globalThis.chrome?.storage?.local;

document.addEventListener('DOMContentLoaded', () => {
  restoreOptions();
  
  document.getElementById('auth_type')?.addEventListener('change', handleAuthTypeChange);
  document.getElementById('save')?.addEventListener('click', saveAndCheckConnection);
  document.getElementById('add-directory-btn')?.addEventListener('click', () => addDirectoryRow());
  
  initCssEditor();
});

/**
 * Toggles input fields visibility based on selected authentication method.
 */
function handleAuthTypeChange() {
  const authType = document.getElementById('auth_type').value;
  const credsGroup = document.getElementById('credentials-group');
  const tokenGroup = document.getElementById('token-group');

  if (authType === 'token') {
    credsGroup?.classList.add('hidden');
    tokenGroup?.classList.remove('hidden');
  } else {
    credsGroup?.classList.remove('hidden');
    tokenGroup?.classList.add('hidden');
  }
}

/**
 * Creates and appends a new directory input row to the settings UI using safe DOM methods.
 */
function addDirectoryRow(dirData = { name: '', kv_engine: 'kv', secret_path: '' }) {
  const container = document.getElementById('directories-container');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'directory-row';
  row.style.display = 'flex';
  row.style.gap = '5px';
  row.style.marginBottom = '10px';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'dir-name';
  nameInput.placeholder = 'Name (e.g. Prod)';
  nameInput.value = dirData.name || '';
  nameInput.style.flex = '1';

  const kvInput = document.createElement('input');
  kvInput.type = 'text';
  kvInput.className = 'dir-kv';
  kvInput.placeholder = 'Engine (kv)';
  kvInput.value = dirData.kv_engine || 'kv';
  kvInput.style.flex = '1';

  const pathInput = document.createElement('input');
  pathInput.type = 'text';
  pathInput.className = 'dir-path';
  pathInput.placeholder = 'Path (e.g. app/)';
  pathInput.value = dirData.secret_path || '';
  pathInput.style.flex = '2';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn-remove-row btn-secondary';
  removeBtn.style.marginTop = '0px';
  removeBtn.style.width = 'auto';
  removeBtn.title = 'Remove';
  removeBtn.textContent = 'X';
  removeBtn.addEventListener('click', () => row.remove());

  row.appendChild(nameInput);
  row.appendChild(kvInput);
  row.appendChild(pathInput);
  row.appendChild(removeBtn);

  container.appendChild(row);
}

/**
 * Persists current settings to local storage and executes a test authentication request against Vault.
 */
async function saveAndCheckConnection() {
  const status = document.getElementById('status');
  if (status) {
    status.textContent = 'Saving configuration and testing connection...';
    status.className = 'neutral';
  }

  const url = document.getElementById('vault_url').value.trim().replace(/\/$/, "");
  const authType = document.getElementById('auth_type').value;
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const vaultToken = document.getElementById('vault_token').value.trim();

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
    auth_type: authType,
    username: username,
    password: password,
    vault_token: vaultToken,
    directories: directories
  };

  try {
    if (extensionStorage) {
      await extensionStorage.set(configurationPayload);
    }

    if (!configurationPayload.vault_url) {
      throw new Error("Vault URL is required.");
    }

    if (authType === 'token' && !vaultToken) {
      throw new Error("Vault Token is required for token authentication mode.");
    }

    if ((authType === 'userpass' || authType === 'ldap') && (!username || !password)) {
      throw new Error("Username and Password are required for UserPass/LDAP authentication.");
    }

    if (directories.length === 0) {
      throw new Error("Please add at least one valid directory (Name and Engine are required).");
    }

    // Verify authentication based on selected strategy
    if (authType === 'token') {
      const lookupEndpoint = `${configurationPayload.vault_url}/v1/auth/token/lookup-self`;
      const response = await fetch(lookupEndpoint, {
        method: 'GET',
        headers: { 'X-Vault-Token': vaultToken }
      });
      if (!response.ok) throw new Error(`Token verification failed: HTTP status ${response.status}`);
    } else {
      const endpointPath = authType === 'ldap' ? `auth/ldap/login/${username}` : `auth/userpass/login/${username}`;
      const loginEndpoint = `${configurationPayload.vault_url}/v1/${endpointPath}`;
      
      const response = await fetch(loginEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: password })
      });

      if (!response.ok) throw new Error(`Authentication failure: HTTP status ${response.status}`);
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
      'auth_type',
      'username',
      'password',
      'vault_token',
      'directories',
      'custom_css_payload'
    ]);

    if (storedData.vault_url) document.getElementById('vault_url').value = storedData.vault_url;
    if (storedData.auth_type) document.getElementById('auth_type').value = storedData.auth_type;
    if (storedData.username) document.getElementById('username').value = storedData.username;
    if (storedData.password) document.getElementById('password').value = storedData.password;
    if (storedData.vault_token) document.getElementById('vault_token').value = storedData.vault_token;

    handleAuthTypeChange();

    const container = document.getElementById('directories-container');
    if (container) {
      container.replaceChildren(); // Clear existing
      
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
