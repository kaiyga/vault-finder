/**
 * Secret Unwrapper View Component.
 * Automatically presents active cached unwrapped secrets, bypassing token input screens.
 */
const secretUnwrapper = {
  render(context) {
    const container = document.createElement('div');
    container.id = 'unwrap-view';
    container.style.display = 'block';

    const messageBox = document.createElement('div');
    messageBox.id = 'unwrap-message';
    messageBox.className = 'neutral';

    // Wrapping Token Input Control Group
    const tokenInputGroup = document.createElement('div');
    tokenInputGroup.id = 'token-input-group';

    const tokenInput = document.createElement('input');
    tokenInput.type = 'text';
    tokenInput.id = 'wrap-token-input';
    tokenInput.placeholder = 'Wrap Token (e.g. hvs.CAES...)';

    const unwrapBtn = document.createElement('button');
    unwrapBtn.type = 'button';
    unwrapBtn.className = 'btn-block btn-success';
    unwrapBtn.textContent = 'Unwrap Token';
    unwrapBtn.onclick = (e) => {
      e.preventDefault();
      secretUnwrapper.unwrap(context, container);
    };

    tokenInputGroup.appendChild(tokenInput);
    tokenInputGroup.appendChild(unwrapBtn);

    // Payload display container
    const payloadContainer = document.createElement('div');
    payloadContainer.id = 'unwrapped-payload';
    payloadContainer.style.display = 'none';

    const kvRowsContainer = document.createElement('div');
    kvRowsContainer.id = 'kv-rows';

    payloadContainer.appendChild(kvRowsContainer);

    // Bottom Action Bar
    const actionGroup = document.createElement('div');
    actionGroup.className = 'btn-action-group';

    const clearAndBackBtn = document.createElement('button');
    clearAndBackBtn.type = 'button';
    clearAndBackBtn.className = 'btn-danger btn-block';
    clearAndBackBtn.textContent = 'Burn & Back to Manager';
    clearAndBackBtn.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();

      // Clear session memory cache and navigate back to manager view
      await context.clearUnwrappedCache();
      context.renderView('secretManager');
    };

    actionGroup.appendChild(clearAndBackBtn);

    container.appendChild(messageBox);
    container.appendChild(tokenInputGroup);
    container.appendChild(payloadContainer);
    container.appendChild(actionGroup);

    // Synchronous execution: Render cached secret immediately if available
    if (context.unwrappedCache !== null) {
      secretUnwrapper.displayPayload(context, container, context.unwrappedCache);
    } else {
      messageBox.textContent = 'Paste a Vault wrap token to extract secret payload';
    }

    return container;
  },

  /**
   * Sends unwrap request to Vault backend and stores result into memory session.
   */
  async unwrap(context, container) {
    const msgBox = container.querySelector('#unwrap-message');
    const tokenInput = container.querySelector('#wrap-token-input');
    const wrapToken = tokenInput.value.trim();

    if (!wrapToken) {
      context.showMessage(msgBox, 'Please enter a valid wrap token.', 'error');
      return;
    }

    context.showMessage(msgBox, 'Unwrapping secret payload...', 'neutral');

    const unwrapUrl = `${context.vaultConfig.vault_url}/v1/sys/wrapping/unwrap`;

    try {
      const res = await fetch(unwrapUrl, {
        method: 'POST',
        headers: {
          'X-Vault-Token': wrapToken,
          'Content-Type': 'application/json'
        }
      });

      if (res.status === 400 || res.status === 404) {
        throw new Error('Token is invalid, expired, or has already been unwrapped.');
      }

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const resData = await res.json();
      const payload = resData.data?.data || resData.data || {};

      if (Object.keys(payload).length === 0) {
        context.showMessage(msgBox, 'Token unwrapped successfully, but payload is empty.', 'neutral');
        return;
      }

      // Save payload to session abstraction
      await context.setUnwrappedCache(payload);
      secretUnwrapper.displayPayload(context, container, payload);
    } catch (err) {
      context.showMessage(msgBox, `Unwrap failed: ${err.message}`, 'error');
    }
  },

  /**
   * Modifies DOM view to display unwrapped key-value pairs and hide input prompt.
   */
  displayPayload(context, container, payload) {
    const msgBox = container.querySelector('#unwrap-message');
    const tokenGroup = container.querySelector('#token-input-group');
    const payloadContainer = container.querySelector('#unwrapped-payload');
    const kvRowsContainer = container.querySelector('#kv-rows');

    if (tokenGroup) tokenGroup.style.display = 'none';

    kvRowsContainer.replaceChildren();
    payloadContainer.style.display = 'block';

    const keys = Object.keys(payload);
    keys.forEach(k => secretUnwrapper.addKvRow(kvRowsContainer, k, payload[k]));

    context.showMessage(msgBox, 'Unwrapped Secret (Active in memory)', 'success');
  },

  /**
   * Renders read-only key-value pair rows with visibility toggle and quick copy buttons.
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
    kInput.readOnly = true;
    kInput.style.flex = '1';

    const vInput = document.createElement('input');
    vInput.type = 'password';
    vInput.placeholder = 'Value';
    vInput.className = 'new-val';
    vInput.value = val;
    vInput.readOnly = true;
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

    const copyValBtn = document.createElement('button');
    copyValBtn.type = 'button';
    copyValBtn.className = 'btn-secondary';
    copyValBtn.textContent = 'Copy';
    copyValBtn.title = 'Copy value';
    copyValBtn.onclick = async (e) => {
      e.preventDefault();
      await navigator.clipboard.writeText(val);
      copyValBtn.textContent = 'Copied';
      setTimeout(() => { copyValBtn.textContent = 'Copy'; }, 1000);
    };

    row.appendChild(kInput);
    row.appendChild(vInput);
    row.appendChild(toggleVisibilityBtn);
    row.appendChild(copyValBtn);

    container.appendChild(row);
  }
};
