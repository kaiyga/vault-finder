/**
 * Secret Editor View Component.
 * Handles creating, editing, and single-use ephemeral Wrapping of secrets.
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
    addRowBtn.className = 'btn-block';
    addRowBtn.textContent = '+ Add Key Pair';
    addRowBtn.onclick = () => secretEditor.addKvRow(kvRowsContainer);

    const actionGroup = document.createElement('div');
    actionGroup.className = 'btn-action-group';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.onclick = () => context.renderView('secretManager');

    const wrapBtn = document.createElement('button');
    wrapBtn.className = 'btn-warning';
    wrapBtn.textContent = 'Wrap to Clipboard';
    wrapBtn.title = 'Create disposable one-time token without saving secret';
    wrapBtn.onclick = () => secretEditor.wrapSecret(context, container, params);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-success';
    saveBtn.textContent = 'Save';
    saveBtn.onclick = () => secretEditor.saveSecret(context, container, params);

    actionGroup.appendChild(cancelBtn);
    actionGroup.appendChild(wrapBtn);
    actionGroup.appendChild(saveBtn);

    container.appendChild(messageBox);
    container.appendChild(nameInput);
    container.appendChild(kvRowsContainer);
    container.appendChild(addRowBtn);
    container.appendChild(actionGroup);

    queueMicrotask(() => {
      if (params.isEditMode) {
        secretEditor.loadExistingPayload(context, container, params.secretKey);
      } else {
        secretEditor.addKvRow(kvRowsContainer);
      }
    });

    return container;
  },

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
    toggleVisibilityBtn.textContent = '👁';
    toggleVisibilityBtn.title = 'Toggle visibility';
    toggleVisibilityBtn.style.padding = '4px 8px';
    toggleVisibilityBtn.onclick = () => {
      const isPassword = vInput.type === 'password';
      vInput.type = isPassword ? 'text' : 'password';
      toggleVisibilityBtn.textContent = isPassword ? '🙈' : '👁';
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

  async loadExistingPayload(context, container, secretKey) {
    const msgBox = container.querySelector('#create-message');
    const kvRowsContainer = container.querySelector('#kv-rows');
    context.showMessage(msgBox, 'Loading secret attributes...', 'neutral');

    const activeDir = context.getActiveDirectory();
    if (!activeDir) {
      context.showMessage(msgBox, 'No active directory selected.', 'error');
      return;
    }

    const dirPath = activeDir.secret_path ? `${activeDir.secret_path}/` : '';
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
   * Generates disposable response wrapping token for current input attributes.
   * Vault intercepts the payload in memory and returns wrap token without persisting to KV backend.
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

    const dirPath = activeDir.secret_path ? `${activeDir.secret_path}/` : '';
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
  }
};
