/**
 * Secret Manager View Component.
 * Handles rendering of directory selector, live search, key navigation, and secret actions.
 */
const secretManager = {
  render(context) {
    const container = document.createElement('div');
    container.id = 'main-view';

    // Directory Selector Dropdown
    const select = document.createElement('select');
    select.id = 'directory-selector';
    context.vaultConfig.directories.forEach((dir, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = dir.name;
      if (idx === context.selectedDirectoryIndex) opt.selected = true;
      select.appendChild(opt);
    });

    select.addEventListener('change', (e) => {
      context.selectedDirectoryIndex = parseInt(e.target.value, 10);
      context.allSecrets = [];
      secretManager.loadSecrets(context, container);
    });

    // Real-time Search Input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.id = 'search';
    searchInput.placeholder = 'Search secret...';
    searchInput.value = context.searchQuery || '';
    searchInput.addEventListener('input', (e) => {
      context.searchQuery = e.target.value;
      secretManager.renderList(context, container);
    });

    // Status Message Element
    const messageBox = document.createElement('div');
    messageBox.id = 'message';
    messageBox.className = 'neutral';

    // Top Navigation & Action Panel
    const actionGroup = document.createElement('div');
    actionGroup.style.display = 'flex';
    actionGroup.style.gap = 'var(--vault-spacing-sm)';
    actionGroup.style.marginBottom = 'var(--vault-spacing-md)';

    const unwrapNavBtn = document.createElement('button');
    unwrapNavBtn.type = 'button';
    unwrapNavBtn.className = 'btn-secondary';
    unwrapNavBtn.textContent = '🔓 Unwrap';
    unwrapNavBtn.title = 'Unwrap temporary secret token';
    unwrapNavBtn.style.flex = '1';
    unwrapNavBtn.onclick = () => context.renderView('secretUnwrapper');

    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'btn-secondary';
    createBtn.textContent = '+ Create Secret';
    createBtn.style.flex = '1';
    createBtn.onclick = () => context.renderView('secretEditor', { isEditMode: false });

    actionGroup.appendChild(unwrapNavBtn);
    actionGroup.appendChild(createBtn);

    // Dynamic Secrets Index List
    const secretsList = document.createElement('div');
    secretsList.id = 'secrets-list';

    container.appendChild(select);
    container.appendChild(searchInput);
    container.appendChild(messageBox);
    container.appendChild(secretsList);
    container.appendChild(actionGroup);

    // Initial Data Fetching
    secretManager.loadSecrets(context, container);

    return container;
  },

  /**
   * Fetches key metadata list for the currently selected active directory.
   */
  async loadSecrets(context, container) {
    const messageBox = container.querySelector('#message');
    
    if (!context.vaultToken) {
      const ok = await context.authenticate();
      if (!ok) return;
    }

    const activeDirectory = context.getActiveDirectory();
    if (!activeDirectory) {
      context.showMessage(messageBox, 'No valid directory selected.', 'error');
      return;
    }

    context.showMessage(messageBox, `Fetching index for ${activeDirectory.name}...`, 'neutral');
    
    const directoryPath = context.getActiveDirPath();
    const listUrl = `${context.vaultConfig.vault_url}/v1/${activeDirectory.kv_engine}/metadata/${directoryPath}?list=true`;

    try {
      const response = await fetch(listUrl, {
        method: 'GET',
        headers: { 'X-Vault-Token': context.vaultToken }
      });

      if (response.status === 401 || response.status === 403) {
        context.vaultToken = null;
        context.showMessage(messageBox, 'Token session expired. Retrying...', 'error');
        return;
      }

      if (response.status === 404) {
        context.allSecrets = [];
        secretManager.renderList(context, container);
        context.showMessage(messageBox, 'Target directory path is empty or not found.', 'neutral');
        return;
      }

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const payload = await response.json();
      context.allSecrets = (payload.data.keys || []).filter(k => !k.endsWith('/'));
      secretManager.renderList(context, container);
      context.showMessage(messageBox, context.allSecrets.length > 0 ? `Indexed ${context.allSecrets.length} secrets.` : 'Directory clean.', 'success');
    } catch (err) {
      context.showMessage(messageBox, err.message, 'error');
    }
  },

  /**
   * Filters and renders indexed secret entries into the DOM.
   */
  renderList(context, container) {
    const query = (context.searchQuery || '').toLowerCase();
    const listContainer = container.querySelector('#secrets-list');
    listContainer.replaceChildren();

    const filtered = context.allSecrets.filter(s => s.toLowerCase().includes(query));

    filtered.forEach(secretKey => {
      const itemWrapper = document.createElement('div');
      itemWrapper.className = 'secret-item';

      const headerRow = document.createElement('div');
      headerRow.className = 'secret-header';

      const nameSpan = document.createElement('span');
      nameSpan.className = 'secret-name';
      nameSpan.textContent = secretKey;
      nameSpan.onclick = () => secretManager.toggleSecretData(context, secretKey, keysContainer);

      const actions = document.createElement('div');
      actions.className = 'secret-actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.textContent = 'Edit';
      editBtn.onclick = () => context.renderView('secretEditor', { secretKey, isEditMode: true });

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.textContent = 'Copy';
      copyBtn.onclick = () => secretManager.copyFullSecret(context, secretKey, copyBtn, container);

      actions.appendChild(editBtn);
      actions.appendChild(copyBtn);

      const keysContainer = document.createElement('div');
      keysContainer.className = 'keys-container';

      headerRow.appendChild(nameSpan);
      headerRow.appendChild(actions);

      itemWrapper.appendChild(headerRow);
      itemWrapper.appendChild(keysContainer);
      listContainer.appendChild(itemWrapper);
    });
  },

  /**
   * Toggles inline accordion view to show/hide individual key-value pairs of a secret.
   */
  async toggleSecretData(context, secretKey, keysContainer) {
    if (keysContainer.style.display === 'block') {
      keysContainer.style.display = 'none';
      return;
    }

    keysContainer.style.display = 'block';
    if (keysContainer.hasChildNodes()) return;

    secretManager.setKeysStatus(keysContainer, 'Retrieving keys...', 'neutral');
    const activeDir = context.getActiveDirectory();
    const dirPath = context.getActiveDirPath();
    const dataUrl = `${context.vaultConfig.vault_url}/v1/${activeDir.kv_engine}/data/${dirPath}${secretKey}`;

    try {
      const res = await fetch(dataUrl, { headers: { 'X-Vault-Token': context.vaultToken } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData = await res.json();
      const payload = resData.data.data;

      keysContainer.replaceChildren();
      const keys = Object.keys(payload);
      if (keys.length === 0) {
        secretManager.setKeysStatus(keysContainer, 'Payload empty', 'neutral');
        return;
      }

      keys.forEach(k => {
        const row = document.createElement('div');
        row.className = 'key-item';

        const kSpan = document.createElement('span');
        kSpan.className = 'key-name';
        kSpan.textContent = k;
        kSpan.title = 'Click to copy property name';
        kSpan.onclick = async () => {
          await navigator.clipboard.writeText(k);
          kSpan.textContent = 'Copied';
          setTimeout(() => { kSpan.textContent = k; }, 1000);
        };

        const copyValBtn = document.createElement('button');
        copyValBtn.type = 'button';
        copyValBtn.textContent = 'Copy';
        copyValBtn.onclick = async () => {
          await navigator.clipboard.writeText(payload[k]);
          copyValBtn.textContent = 'Copied';
          setTimeout(() => { copyValBtn.textContent = 'Copy'; }, 1000);
        };

        row.appendChild(kSpan);
        row.appendChild(copyValBtn);
        keysContainer.appendChild(row);
      });
    } catch (err) {
      secretManager.setKeysStatus(keysContainer, err.message, 'error');
    }
  },

  /**
   * Helper to set temporary loading or status messages inside key accordion containers.
   */
  setKeysStatus(container, text, className) {
    container.replaceChildren();
    const span = document.createElement('span');
    span.className = className;
    span.textContent = text;
    container.appendChild(span);
  },

  /**
   * Fetches full secret payload and copies raw JSON string representation to system clipboard.
   */
  async copyFullSecret(context, secretKey, btn, container) {
    const activeDir = context.getActiveDirectory();
    const dirPath = context.getActiveDirPath();
    const dataUrl = `${context.vaultConfig.vault_url}/v1/${activeDir.kv_engine}/data/${dirPath}${secretKey}`;

    try {
      const res = await fetch(dataUrl, { headers: { 'X-Vault-Token': context.vaultToken } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const resData = await res.json();
      await navigator.clipboard.writeText(JSON.stringify(resData.data.data, null, 2));

      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1000);
    } catch (err) {
      const msgBox = container.querySelector('#message');
      context.showMessage(msgBox, err.message, 'error');
    }
  }
};
