/**
 * Secret Editor View Component.
 * Handles creation, edition, ephemeral response wrapping, and metadata deletion of KV secrets.
 */
const secretEditor = {
  render(context, params = {}) {
    const container = document.createElement('div');
    container.id = 'create-view';
    container.style.display = 'block';

    const messageBox = document.createElement('div');
    messageBox.id = 'create-message';
    messageBox.className = 'neutral';
    messageBox.textContent = params.isEditMode 
      ? `Editing secret: ${params.secretKey}` 
      : 'Fill in secret payload details';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'new-secret-name';
    nameInput.placeholder = 'Secret name (e.g. my_app)';
    nameInput.value = params.secretKey || '';
    nameInput.readOnly = Boolean(params.isEditMode);

    const kvRowsContainer = document.createElement('div');
    kvRowsContainer.id = 'kv-rows';

    const addRowBtn = document.createElement('button');
    addRowBtn.type = 'button';
    addRowBtn.className = 'btn-block';
    addRowBtn.textContent = '+ Add Key Pair';
    addRowBtn.onclick = () => secretEditor.addKvRow(kvRowsContainer);

    const actionGroup = document.createElement('div');
    actionGroup.className = 'btn-action-group';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => context.renderView('secretManager');

    // Ephemeral wrap token creation (does not persist secret to KV backend)
    const wrapBtn = document.createElement('button');
    wrapBtn.type = 'button';
    wrapBtn.textContent = 'Wrap Secret';
    wrapBtn.title = 'Create disposable one-time token without saving secret';
    wrapBtn.onclick = () => secretEditor.wrapSecret(context, container);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'btn-success';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = () => secretEditor.saveSecret(context, container);

    actionGroup.appendChild(wrapBtn);
    actionGroup.appendChild(saveBtn);
    actionGroup.appendChild(cancelBtn);

    // Display Delete button only when editing an existing secret
    if (params.isEditMode) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-danger';
      deleteBtn.textContent = 'Delete';
      deleteBtn.title = 'Permanently delete secret metadata and all versions';
      deleteBtn.onclick = () => secretEditor.deleteSecret(context, container, params.secretKey);
      actionGroup.appendChild(deleteBtn);
    }

    container.appendChild(messageBox);
    container.appendChild(nameInput);
    container.appendChild(kvRowsContainer);
    container.appendChild(addRowBtn);
    container.appendChild(actionGroup);

    // Initial load: edit existing payload or insert initial empty row
    if (params.isEditMode) {
      secretEditor.loadExistingPayload(context, container, params.secretKey);
    } else {
      secretEditor.addKvRow(kvRowsContainer);
    }

    return container;
  },

  /**
   * Appends an editable key-value input row to the editor DOM container.
   */
  addKvRow(container, key = '', val = '') {
    if (!container) return;
    
    const row = document.createElement('div');
    row.className = 'kv-row';
    row.style.display = 'flex';
    row.style.gap = 'var(--vault-spacing-sm)';

    const kInput = document.createElement('input');
    kInput.type = 'text';
    kInput.placeholder = 'Key';
    kInput.className = 'new-key';
    kInput.value = key;
    kInput.style.flex = '1';

    const vInput = document.createElement('input');
    vInput.type = 'password';
    vInput.placeholder = 'Value';
    vInput.className = 'new-val';
    vInput.value = val;
    vInput.style.flex = '1';

    const toggleVisibilityBtn = document.createElement('button');
    toggleVisibilityBtn.type = 'button';
    toggleVisibilityBtn.className = 'btn-secondary';
    toggleVisibilityBtn.textContent = 'S';
    toggleVisibilityBtn.title = 'Toggle visibility';
    toggleVisibilityBtn.style.padding = '4px 8px';
    toggleVisibilityBtn.onclick = (e) => {
      e.preventDefault();
      const isPassword = vInput.type === 'password';
      vInput.type = isPassword ? 'text' : 'password';
      toggleVisibilityBtn.textContent = isPassword ? 'H' : 'S';
    };

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-danger';
    removeBtn.textContent = 'X';
    removeBtn.title = 'Remove row';
    removeBtn.onclick = () => row.remove();

    row.appendChild(kInput);
    row.appendChild(vInput);
    row.appendChild(toggleVisibilityBtn);
    row.appendChild(removeBtn);
    
    container.appendChild(row);
  },

  /**
   * Loads attributes of an existing secret payload into editor fields.
   */
  async loadExistingPayload(context, container, secretKey) {
    const msgBox = container.querySelector('#create-message');
    const kvRowsContainer = container.querySelector('#kv-rows');
    context.showMessage(msgBox, 'Loading secret attributes...', 'neutral');

    const activeDir = context.getActiveDirectory();
    if (!activeDir) {
      context.showMessage(msgBox, 'No active directory selected.', 'error');
      return;
    }

    const dirPath = context.getActiveDirPath();
    const dataUrl = `${context.vaultConfig.vault_url}/v1/${activeDir.kv_engine}/data/${dirPath}${secretKey}`;

    try {
      const res = await fetch(dataUrl, { headers: { 'X-Vault-Token': context.vaultToken } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const resData = await res.json();
      const payload = resData.data.data;
      const keys = Object.keys(payload);

      kvRowsContainer.replaceChildren();
      if (keys.length === 0) {
        secretEditor.addKvRow(kvRowsContainer);
      } else {
        keys.forEach(k => secretEditor.addKvRow(kvRowsContainer, k, payload[k]));
      }
      context.showMessage(msgBox, `Editing secret: ${secretKey}`, 'neutral');
    } catch (err) {
      context.showMessage(msgBox, err.message, 'error');
    }
  },

  /**
   * Requests disposable wrapping token for current form attributes and copies token to clipboard.
   */
  async wrapSecret(context, container) {
    const msgBox = container.querySelector('#create-message');
    const rows = container.querySelectorAll('.kv-row');
    const payloadMap = {};

    rows.forEach(r => {
      const k = r.querySelector('.new-key').value.trim();
      const v = r.querySelector('.new-val').value;
      if (k) payloadMap[k] = v;
    });

    if (Object.keys(payloadMap).length === 0) {
      context.showMessage(msgBox, 'Include at least one key-value pair to wrap.', 'error');
      return;
    }

    context.showMessage(msgBox, 'Requesting wrapping token...', 'neutral');

    const wrapUrl = `${context.vaultConfig.vault_url}/v1/sys/wrapping/wrap`;

    try {
      const res = await fetch(wrapUrl, {
        method: 'POST',
        headers: {
          'X-Vault-Token': context.vaultToken,
          'X-Vault-Wrap-TTL': '1h', 
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payloadMap)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const resData = await res.json();
      const wrapToken = resData.wrap_info?.token;

      if (!wrapToken) {
        throw new Error('Vault did not return a valid wrap_info token.');
      }

      await navigator.clipboard.writeText(wrapToken);
      context.showMessage(msgBox, 'Wrap token copied to clipboard! Secret was NOT saved.', 'success');
    } catch (err) {
      context.showMessage(msgBox, `Wrap failed: ${err.message}`, 'error');
    }
  },

  /**
   * Persists currently configured secret fields back to Vault KV storage backend.
   */
  async saveSecret(context, container) {
    const msgBox = container.querySelector('#create-message');
    const nameInput = container.querySelector('#new-secret-name');
    const secretId = nameInput.value.trim();

    if (!secretId) {
      context.showMessage(msgBox, 'Secret identifier is required.', 'error');
      return;
    }

    const rows = container.querySelectorAll('.kv-row');
    const payloadMap = {};
    rows.forEach(r => {
      const k = r.querySelector('.new-key').value.trim();
      const v = r.querySelector('.new-val').value;
      if (k) payloadMap[k] = v;
    });

    if (Object.keys(payloadMap).length === 0) {
      context.showMessage(msgBox, 'Include at least one key-value pair.', 'error');
      return;
    }

    const activeDir = context.getActiveDirectory();
    if (!activeDir) {
      context.showMessage(msgBox, 'No active directory selected.', 'error');
      return;
    }

    context.showMessage(msgBox, 'Saving changes...', 'neutral');

    const dirPath = context.getActiveDirPath();
    const writeUrl = `${context.vaultConfig.vault_url}/v1/${activeDir.kv_engine}/data/${dirPath}${secretId}`;

    try {
      const res = await fetch(writeUrl, {
        method: 'POST',
        headers: {
          'X-Vault-Token': context.vaultToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ data: payloadMap })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (!context.allSecrets.includes(secretId)) {
        context.allSecrets.push(secretId);
        context.allSecrets.sort();
      }

      context.renderView('secretManager');
    } catch (err) {
      context.showMessage(msgBox, err.message, 'error');
    }
  },

  /**
   * Permanently deletes secret metadata and all historical versions from Vault KV backend.
   */
  async deleteSecret(context, container, secretKey) {
    if (!confirm(`Are you sure you want to permanently delete secret "${secretKey}"?`)) {
      return;
    }

    const msgBox = container.querySelector('#create-message');
    const activeDir = context.getActiveDirectory();
    
    if (!activeDir) {
      context.showMessage(msgBox, 'No active directory selected.', 'error');
      return;
    }

    context.showMessage(msgBox, `Deleting secret ${secretKey}...`, 'neutral');

    const dirPath = context.getActiveDirPath();
    // Uses /metadata/ endpoint to delete secret key completely (all versions & metadata)
    const deleteUrl = `${context.vaultConfig.vault_url}/v1/${activeDir.kv_engine}/metadata/${dirPath}${secretKey}`;

    try {
      const res = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: { 'X-Vault-Token': context.vaultToken }
      });

      if (!res.ok && res.status !== 204) {
        throw new Error(`HTTP ${res.status}`);
      }

      // Remove from local cache array
      context.allSecrets = context.allSecrets.filter(s => s !== secretKey);
      
      context.renderView('secretManager');
    } catch (err) {
      context.showMessage(msgBox, `Delete failed: ${err.message}`, 'error');
    }
  }
};
