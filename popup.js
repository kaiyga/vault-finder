/**
 * Popup application script managing secret enumeration, interactive search filtering,
 * key-value expansion/copy operations, and CRUD routines against the Vault KV v2 API.
 */

let vaultConfig = {};
let vaultToken = null;
let allSecrets = [];

document.addEventListener('DOMContentLoaded', init);

/**
 * Initializes DOM element event handlers, loads stored connection configurations,
 * populates the directory selector, and executes initial remote secret index discovery.
 */
async function init() {
  document.getElementById('open-settings').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });
  
  document.getElementById('cancel-create').addEventListener('click', hideCreateForm);
  document.getElementById('add-kv-row').addEventListener('click', () => addKvRow());
  document.getElementById('save-secret').addEventListener('click', saveSecret);
  document.getElementById('search').addEventListener('input', renderList);

  const directorySelector = document.getElementById('directory-selector');
  if (directorySelector) {
    directorySelector.addEventListener('change', () => {
      allSecrets = [];
      renderList();
      loadSecrets();
    });
  }

  // Retrieve user settings and custom CSS overrides simultaneously
  vaultConfig = await browser.storage.local.get([
    'vault_url',
    'username',
    'password',
    'directories',
    'custom_css_payload'
  ]);
  
  if (vaultConfig.custom_css_payload) {
    document.getElementById('dynamic-custom-style').textContent = vaultConfig.custom_css_payload;
  }
  
  if (!vaultConfig.vault_url || !vaultConfig.username || !vaultConfig.password || !vaultConfig.directories || vaultConfig.directories.length === 0) {
    showMessage('Missing connection configuration or directories. Please open settings.', 'error');
    return;
  }

  populateDirectorySelector();
  await loadSecrets();
}

/**
 * Fills the directory selection dropdown with stored directory configurations.
 */
function populateDirectorySelector() {
  const selector = document.getElementById('directory-selector');
  if (!selector) return;

  selector.innerHTML = '';
  
  vaultConfig.directories.forEach((directory, index) => {
    const optionElement = document.createElement('option');
    optionElement.value = index;
    optionElement.textContent = directory.name;
    selector.appendChild(optionElement);
  });
}

/**
 * Helper to retrieve the directory configuration object currently selected by the user.
 */
function getActiveDirectory() {
  const selector = document.getElementById('directory-selector');
  if (!selector || !vaultConfig.directories) return null;
  
  const selectedIndex = parseInt(selector.value, 10);
  return vaultConfig.directories[selectedIndex] || vaultConfig.directories[0];
}

/**
 * Updates application status messages in the designated UI feedback container.
 */
function showMessage(messageText, messageType = 'neutral', targetElementId = 'message') {
  const messageElement = document.getElementById(targetElementId);
  if (messageElement) {
    messageElement.className = messageType;
    messageElement.textContent = messageText;
  }
}

/**
 * Authenticates against the Vault userpass auth backend and caches the client token.
 */
async function authenticate() {
  showMessage('Authenticating session...', 'neutral');
  const loginUrl = `${vaultConfig.vault_url}/v1/auth/userpass/login/${vaultConfig.username}`;
  
  try {
    const response = await fetch(loginUrl, {
      method: 'POST',
      body: JSON.stringify({ password: vaultConfig.password }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) throw new Error(`Authentication failure: HTTP status ${response.status}`);
    
    const responseData = await response.json();
    vaultToken = responseData.auth.client_token;
    return true;
  } catch (authError) {
    showMessage(authError.message, 'error');
    return false;
  }
}

/**
 * Fetches the metadata list of available keys under the active target directory path.
 */
async function loadSecrets() {
  if (!vaultToken) {
    const isAuthenticated = await authenticate();
    if (!isAuthenticated) return;
  }

  const activeDirectory = getActiveDirectory();
  if (!activeDirectory) {
    showMessage('No valid directory selected.', 'error');
    return;
  }

  showMessage(`Fetching secret index for ${activeDirectory.name}...`, 'neutral');
  
  const directoryPath = activeDirectory.secret_path ? `${activeDirectory.secret_path}/` : '';
  const listUrl = `${vaultConfig.vault_url}/v1/${activeDirectory.kv_engine}/metadata/${directoryPath}?list=true`;
  
  try {
    const response = await fetch(listUrl, {
      method: 'GET',
      headers: { 'X-Vault-Token': vaultToken }
    });

    if (response.status === 403 || response.status === 401) {
      vaultToken = null;
      showMessage('Token session expired. Retrying operation...', 'error');
      return;
    }

    if (response.status === 404) {
      allSecrets = [];
      renderList();
      showMessage('Target directory path is empty or not found.', 'neutral');
      return;
    }

    if (!response.ok) throw new Error(`Failed to load keys: HTTP status ${response.status}`);

    const payloadData = await response.json();
    allSecrets = payloadData.data.keys.filter(key => !key.endsWith('/'));
    renderList();
    showMessage(allSecrets.length > 0 ? `Successfully indexed ${allSecrets.length} secrets.` : 'Directory is clean.', 'success');
  } catch (fetchingError) {
    showMessage(fetchingError.message, 'error');
  }
}

/**
 * Renders the filtered list of secrets into the UI, appending a creation trigger element at the bottom.
 */
function renderList() {
  const searchQuery = document.getElementById('search').value.toLowerCase();
  const listContainer = document.getElementById('secrets-list');
  listContainer.innerHTML = '';

  const filteredSecrets = allSecrets.filter(secretName => secretName.toLowerCase().includes(searchQuery));

  filteredSecrets.forEach(secretKey => {
    const itemWrapper = document.createElement('div');
    itemWrapper.className = 'secret-item';
    
    const headerRow = document.createElement('div');
    headerRow.className = 'secret-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'secret-name';
    nameSpan.textContent = secretKey;
    nameSpan.onclick = () => toggleSecretData(secretKey, keysContainer);

    const actionsGroup = document.createElement('div');
    actionsGroup.className = 'secret-actions';
    
    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.onclick = () => editSecret(secretKey);

    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy';
    copyButton.onclick = () => copyFullSecret(secretKey, copyButton);

    actionsGroup.appendChild(editButton);
    actionsGroup.appendChild(copyButton);

    const keysContainer = document.createElement('div');
    keysContainer.className = 'keys-container';

    headerRow.appendChild(nameSpan);
    headerRow.appendChild(actionsGroup);
    
    itemWrapper.appendChild(headerRow);
    itemWrapper.appendChild(keysContainer);
    listContainer.appendChild(itemWrapper);
  });

  const bottomCreateButton = document.createElement('button');
  bottomCreateButton.className = 'btn-create-bottom';
  bottomCreateButton.textContent = '+ Create New Secret';
  bottomCreateButton.onclick = showCreateForm;
  listContainer.appendChild(bottomCreateButton);
}

/**
 * Expands or collapses a secret entry, lazily fetching its underlying key-value payload from the server.
 */
async function toggleSecretData(secretKey, keysContainerElement) {
  const isExpanded = keysContainerElement.style.display === 'block';
  if (isExpanded) {
    keysContainerElement.style.display = 'none';
    return;
  }

  keysContainerElement.style.display = 'block';
  if (keysContainerElement.innerHTML !== '') return;

  keysContainerElement.innerHTML = '<span class="neutral">Retrieving internal keys...</span>';

  const activeDirectory = getActiveDirectory();
  if (!activeDirectory) {
    keysContainerElement.innerHTML = '<span class="error">No active directory selection</span>';
    return;
  }

  const directoryPath = activeDirectory.secret_path ? `${activeDirectory.secret_path}/` : '';
  const dataUrl = `${vaultConfig.vault_url}/v1/${activeDirectory.kv_engine}/data/${directoryPath}${secretKey}`;
  
  try {
    const response = await fetch(dataUrl, {
      method: 'GET',
      headers: { 'X-Vault-Token': vaultToken }
    });
    
    if (!response.ok) throw new Error(`HTTP status ${response.status}`);
    
    const responseData = await response.json();
    const secretPayload = responseData.data.data;
    
    keysContainerElement.innerHTML = '';
    
    const payloadKeys = Object.keys(secretPayload);
    if (payloadKeys.length === 0) {
      keysContainerElement.innerHTML = '<span class="neutral">Secret payload is empty</span>';
      return;
    }

    payloadKeys.forEach(objectKey => {
      const keyRowItem = document.createElement('div');
      keyRowItem.className = 'key-item';
      
      const keyNameSpan = document.createElement('span');
      keyNameSpan.className = 'key-name';
      keyNameSpan.textContent = objectKey;
      keyNameSpan.title = "Click to copy property name";
      keyNameSpan.onclick = async () => {
        await navigator.clipboard.writeText(objectKey);
        const originalText = keyNameSpan.textContent;
        keyNameSpan.textContent = 'Copied';
        setTimeout(() => { keyNameSpan.textContent = originalText; }, 1000);
      };

      const copyValueButton = document.createElement('button');
      copyValueButton.textContent = 'Copy';
      copyValueButton.title = "Copy property value";
      copyValueButton.onclick = async () => {
        await navigator.clipboard.writeText(secretPayload[objectKey]);
        const originalText = copyValueButton.textContent;
        copyValueButton.textContent = 'Copied';
        setTimeout(() => { copyValueButton.textContent = originalText; }, 1000);
      };

      keyRowItem.appendChild(keyNameSpan);
      keyRowItem.appendChild(copyValueButton);
      keysContainerElement.appendChild(keyRowItem);
    });

  } catch (fetchingError) {
    keysContainerElement.innerHTML = `<span class="error">Error: ${fetchingError.message}</span>`;
  }
}

/**
 * Serializes the entire secret payload object into JSON format and copies it to the clipboard.
 */
async function copyFullSecret(secretKey, buttonElement) {
  const activeDirectory = getActiveDirectory();
  if (!activeDirectory) {
    showMessage('No active directory selection.', 'error');
    return;
  }

  const directoryPath = activeDirectory.secret_path ? `${activeDirectory.secret_path}/` : '';
  const dataUrl = `${vaultConfig.vault_url}/v1/${activeDirectory.kv_engine}/data/${directoryPath}${secretKey}`;
  
  try {
    const response = await fetch(dataUrl, {
      method: 'GET',
      headers: { 'X-Vault-Token': vaultToken }
    });
    
    if (!response.ok) throw new Error(`Failed to fetch secret: HTTP status ${response.status}`);
    
    const responseData = await response.json();
    const formattedJsonString = JSON.stringify(responseData.data.data, null, 2);
    
    await navigator.clipboard.writeText(formattedJsonString);
    
    const originalText = buttonElement.textContent;
    buttonElement.textContent = 'Copied';
    setTimeout(() => {
      buttonElement.textContent = originalText;
    }, 1000);

  } catch (copyError) {
    showMessage(copyError.message, 'error');
  }
}

/**
 * Transitions the UI into the blank creation form layout.
 */
function showCreateForm() {
  document.getElementById('main-view').style.display = 'none';
  document.getElementById('create-view').style.display = 'block';
  
  const nameInput = document.getElementById('new-secret-name');
  nameInput.value = '';
  nameInput.readOnly = false;
  
  document.getElementById('kv-rows').innerHTML = '';
  showMessage('Fill in new secret parameters', 'neutral', 'create-message');
  addKvRow();
}

/**
 * Loads an existing secret's payload into the form view for modification.
 */
async function editSecret(secretKey) {
  showMessage('Loading secret attributes for editing...', 'neutral');
  
  const activeDirectory = getActiveDirectory();
  if (!activeDirectory) {
    showMessage('No active directory selection.', 'error');
    return;
  }

  const directoryPath = activeDirectory.secret_path ? `${activeDirectory.secret_path}/` : '';
  const dataUrl = `${vaultConfig.vault_url}/v1/${activeDirectory.kv_engine}/data/${directoryPath}${secretKey}`;
  
  try {
    const response = await fetch(dataUrl, {
      method: 'GET',
      headers: { 'X-Vault-Token': vaultToken }
    });
    
    if (!response.ok) throw new Error(`Load failure: HTTP status ${response.status}`);
    
    const responseData = await response.json();
    const secretDataPayload = responseData.data.data;
    
    document.getElementById('main-view').style.display = 'none';
    document.getElementById('create-view').style.display = 'block';
    
    const nameInput = document.getElementById('new-secret-name');
    nameInput.value = secretKey;
    nameInput.readOnly = true; // Lock secret identifier name during modification updates
    
    document.getElementById('kv-rows').innerHTML = '';
    showMessage(`Editing secret entry: ${secretKey}`, 'neutral', 'create-message');

    const keysArray = Object.keys(secretDataPayload);
    if (keysArray.length === 0) {
      addKvRow();
    } else {
      keysArray.forEach(keyName => addKvRow(keyName, secretDataPayload[keyName]));
    }
    
    showMessage('', 'neutral');
  } catch (loadError) {
    showMessage(loadError.message, 'error');
  }
}

/**
 * Restores the primary search and list navigation view.
 */
function hideCreateForm() {
  document.getElementById('create-view').style.display = 'none';
  document.getElementById('main-view').style.display = 'block';
}

/**
 * Programmatically appends a new key-value input row to the creation/editing form workspace.
 */
function addKvRow(initialKey = '', initialValue = '') {
  const containerElement = document.getElementById('kv-rows');
  const rowWrapper = document.createElement('div');
  rowWrapper.className = 'kv-row';
  
  const keyInputField = document.createElement('input');
  keyInputField.type = 'text';
  keyInputField.placeholder = 'Key';
  keyInputField.className = 'new-key';
  keyInputField.value = initialKey;

  const valueInputField = document.createElement('input');
  valueInputField.type = 'text';
  valueInputField.placeholder = 'Value';
  valueInputField.className = 'new-val';
  valueInputField.value = initialValue;

  const removeRowButton = document.createElement('button');
  removeRowButton.className = 'btn-remove-row';
  removeRowButton.title = 'Remove row';
  removeRowButton.textContent = 'X';
  removeRowButton.onclick = () => rowWrapper.remove();

  rowWrapper.appendChild(keyInputField);
  rowWrapper.appendChild(valueInputField);
  rowWrapper.appendChild(removeRowButton);
  
  containerElement.appendChild(rowWrapper);
}

/**
 * Submits the structured key-value dataset payload via POST request to the Vault server.
 */
async function saveSecret() {
  const nameInput = document.getElementById('new-secret-name');
  const secretIdentifier = nameInput.value.trim();
  
  if (!secretIdentifier) {
    showMessage('Secret identifier name is required.', 'error', 'create-message');
    return;
  }

  const rowElements = document.querySelectorAll('.kv-row');
  const accumulatedDataMap = {};
  
  rowElements.forEach(rowElement => {
    const keyString = rowElement.querySelector('.new-key').value.trim();
    const valueString = rowElement.querySelector('.new-val').value;
    if (keyString) accumulatedDataMap[keyString] = valueString;
  });

  if (Object.keys(accumulatedDataMap).length === 0) {
    showMessage('Please include at least one valid key-value attribute.', 'error', 'create-message');
    return;
  }

  const activeDirectory = getActiveDirectory();
  if (!activeDirectory) {
    showMessage('No active directory selection.', 'error', 'create-message');
    return;
  }

  showMessage('Persisting changes...', 'neutral', 'create-message');

  const directoryPath = activeDirectory.secret_path ? `${activeDirectory.secret_path}/` : '';
  const writeUrl = `${vaultConfig.vault_url}/v1/${activeDirectory.kv_engine}/data/${directoryPath}${secretIdentifier}`;

  try {
    const response = await fetch(writeUrl, {
      method: 'POST',
      headers: {
        'X-Vault-Token': vaultToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: accumulatedDataMap })
    });

    if (!response.ok) throw new Error(`Persistence error: HTTP status ${response.status}`);

    if (!allSecrets.includes(secretIdentifier)) {
      allSecrets.push(secretIdentifier);
      allSecrets.sort();
    }
    
    hideCreateForm();
    renderList();
    showMessage(`Secret entry '${secretIdentifier}' saved successfully.`, 'success');

  } catch (savingError) {
    showMessage(savingError.message, 'error', 'create-message');
  }
}
