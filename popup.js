let vaultConfig = {};
let vaultToken = null;
let allSecrets = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.getElementById('open-settings').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });
  
  // Кнопки открытия/закрытия формы создания
  document.getElementById('open-create').addEventListener('click', showCreateForm);
  document.getElementById('cancel-create').addEventListener('click', hideCreateForm);
  document.getElementById('add-kv-row').addEventListener('click', addKvRow);
  document.getElementById('save-secret').addEventListener('click', saveSecret);

  document.getElementById('search').addEventListener('input', renderList);

  vaultConfig = await browser.storage.local.get(['vault_url', 'username', 'password', 'kv_engine', 'secret_path']);
  
  if (!vaultConfig.vault_url || !vaultConfig.username || !vaultConfig.password || !vaultConfig.kv_engine) {
    showMessage('Нет данных для подключения. Откройте настройки.', 'error');
    return;
  }

  await loadSecrets();
}

function showMessage(msg, type = 'neutral', elementId = 'message') {
  const msgEl = document.getElementById(elementId);
  msgEl.className = type;
  msgEl.textContent = msg;
}

async function authenticate() {
  showMessage('Авторизация...', 'neutral');
  const url = `${vaultConfig.vault_url}/v1/auth/userpass/login/${vaultConfig.username}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({ password: vaultConfig.password }),
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!res.ok) throw new Error(`Ошибка авторизации: ${res.status}`);
    
    const data = await res.json();
    vaultToken = data.auth.client_token;
    return true;
  } catch (err) {
    showMessage(err.message, 'error');
    return false;
  }
}

async function loadSecrets() {
  if (!vaultToken) {
    const isAuth = await authenticate();
    if (!isAuth) return;
  }

  showMessage('Загрузка списка секретов...', 'neutral');
  
  const dirPath = vaultConfig.secret_path ? `${vaultConfig.secret_path}/` : '';
  const url = `${vaultConfig.vault_url}/v1/${vaultConfig.kv_engine}/metadata/${dirPath}?list=true`;
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-Vault-Token': vaultToken }
    });

    if (res.status === 403 || res.status === 401) {
      vaultToken = null;
      showMessage('Токен устарел. Повторная попытка...', 'error');
      return;
    }

    if (res.status === 404) {
      // Если директория не найдена (например, пустая) — это не критичная ошибка
      allSecrets = [];
      renderList();
      showMessage(`Директория пуста.`, 'neutral');
      return;
    }

    if (!res.ok) throw new Error(`Ошибка загрузки: ${res.status}`);

    const data = await res.json();
    allSecrets = data.data.keys.filter(k => !k.endsWith('/'));
    renderList();
    showMessage(`Найдено секретов: ${allSecrets.length}`, 'success');
  } catch (err) {
    showMessage(err.message, 'error');
  }
}

function renderList() {
  const query = document.getElementById('search').value.toLowerCase();
  const listEl = document.getElementById('secrets-list');
  listEl.innerHTML = '';

  const filtered = allSecrets.filter(s => s.toLowerCase().includes(query));

  filtered.forEach(secret => {
    const itemDiv = document.createElement('div');
    itemDiv.className = 'secret-item';
    
    const headerDiv = document.createElement('div');
    headerDiv.className = 'secret-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'secret-name';
    nameSpan.textContent = secret;
    
    const copyAllBtn = document.createElement('button');
    copyAllBtn.textContent = 'Копировать секрет';
    copyAllBtn.onclick = () => copyFullSecret(secret, copyAllBtn);

    const keysDiv = document.createElement('div');
    keysDiv.className = 'keys-container';

    nameSpan.onclick = () => toggleSecretData(secret, keysDiv);

    headerDiv.appendChild(nameSpan);
    headerDiv.appendChild(copyAllBtn);
    
    itemDiv.appendChild(headerDiv);
    itemDiv.appendChild(keysDiv);
    listEl.appendChild(itemDiv);
  });

  // Добавляем кнопку создания секрета в самый конец списка
  const bottomCreateBtn = document.createElement('button');
  bottomCreateBtn.className = 'btn-create-bottom';
  bottomCreateBtn.textContent = '+ Создать новый секрет';
  bottomCreateBtn.onclick = showCreateForm;
  listEl.appendChild(bottomCreateBtn);
}

async function toggleSecretData(secretKey, keysDiv) {
  const isExpanded = keysDiv.style.display === 'block';
  if (isExpanded) {
    keysDiv.style.display = 'none';
    return;
  }

  keysDiv.style.display = 'block';
  
  if (keysDiv.innerHTML !== '') return;

  keysDiv.innerHTML = '<span class="neutral">Загрузка ключей...</span>';

  const dirPath = vaultConfig.secret_path ? `${vaultConfig.secret_path}/` : '';
  const url = `${vaultConfig.vault_url}/v1/${vaultConfig.kv_engine}/data/${dirPath}${secretKey}`;
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-Vault-Token': vaultToken }
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    const secretData = data.data.data;
    
    keysDiv.innerHTML = '';
    
    const keys = Object.keys(secretData);
    if (keys.length === 0) {
      keysDiv.innerHTML = '<span class="neutral">Секрет пуст</span>';
      return;
    }

    keys.forEach(k => {
      const keyItem = document.createElement('div');
      keyItem.className = 'key-item';
      
      // Имя ключа (кликабельное, копирует само имя ключа)
      const keyName = document.createElement('span');
      keyName.className = 'key-name';
      keyName.textContent = k;
      keyName.title = "Нажмите, чтобы скопировать имя ключа";
      keyName.onclick = async () => {
        await navigator.clipboard.writeText(k);
        const originalText = keyName.textContent;
        keyName.textContent = 'Скопировано';
        setTimeout(() => { keyName.textContent = originalText; }, 1000);
      };

      // Кнопка копирования значения ключа
      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Копировать';
      copyBtn.title = "Скопировать значение";
      copyBtn.onclick = async () => {
        await navigator.clipboard.writeText(secretData[k]);
        const originalText = copyBtn.textContent;
        copyBtn.textContent = 'Скопировано';
        setTimeout(() => { copyBtn.textContent = originalText; }, 1000);
      };

      keyItem.appendChild(keyName);
      keyItem.appendChild(copyBtn);
      keysDiv.appendChild(keyItem);
    });

  } catch (err) {
    keysDiv.innerHTML = `<span class="error">Ошибка: ${err.message}</span>`;
  }
}

async function copyFullSecret(secretKey, btnElement) {
  const dirPath = vaultConfig.secret_path ? `${vaultConfig.secret_path}/` : '';
  const url = `${vaultConfig.vault_url}/v1/${vaultConfig.kv_engine}/data/${dirPath}${secretKey}`;
  
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'X-Vault-Token': vaultToken }
    });
    
    if (!res.ok) throw new Error(`Ошибка получения данных: ${res.status}`);
    
    const data = await res.json();
    const secretValue = JSON.stringify(data.data.data, null, 2);
    
    await navigator.clipboard.writeText(secretValue);
    
    const originalText = btnElement.textContent;
    btnElement.textContent = 'Скопировано';
    setTimeout(() => {
      btnElement.textContent = originalText;
    }, 1000);

  } catch (err) {
    showMessage(err.message, 'error');
  }
}

// === Логика формы создания секрета ===

function showCreateForm() {
  document.getElementById('main-view').style.display = 'none';
  document.getElementById('create-view').style.display = 'block';
  document.getElementById('new-secret-name').value = '';
  document.getElementById('kv-rows').innerHTML = '';
  showMessage('Заполните данные нового секрета', 'neutral', 'create-message');
  addKvRow(); // Добавляем одну пустую строку по умолчанию
}

function hideCreateForm() {
  document.getElementById('create-view').style.display = 'none';
  document.getElementById('main-view').style.display = 'block';
}

function addKvRow() {
  const container = document.getElementById('kv-rows');
  const row = document.createElement('div');
  row.className = 'kv-row';
  
  row.innerHTML = `
    <input type="text" placeholder="Ключ" class="new-key">
    <input type="text" placeholder="Значение" class="new-val">
    <button class="btn-remove-row" title="Удалить">X</button>
  `;
  
  row.querySelector('.btn-remove-row').onclick = () => row.remove();
  container.appendChild(row);
}

async function saveSecret() {
  const nameInput = document.getElementById('new-secret-name');
  const secretName = nameInput.value.trim();
  
  if (!secretName) {
    showMessage('Укажите имя секрета.', 'error', 'create-message');
    return;
  }

  const rows = document.querySelectorAll('.kv-row');
  const secretData = {};
  
  rows.forEach(r => {
    const k = r.querySelector('.new-key').value.trim();
    const v = r.querySelector('.new-val').value;
    if (k) secretData[k] = v;
  });

  if (Object.keys(secretData).length === 0) {
    showMessage('Добавьте хотя бы один ключ.', 'error', 'create-message');
    return;
  }

  showMessage('Сохранение...', 'neutral', 'create-message');

  const dirPath = vaultConfig.secret_path ? `${vaultConfig.secret_path}/` : '';
  const url = `${vaultConfig.vault_url}/v1/${vaultConfig.kv_engine}/data/${dirPath}${secretName}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Vault-Token': vaultToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: secretData })
    });

    if (!res.ok) throw new Error(`Ошибка сохранения: HTTP ${res.status}`);

    // Добавляем новый секрет в локальный массив, если его там еще нет
    if (!allSecrets.includes(secretName)) {
      allSecrets.push(secretName);
      allSecrets.sort(); // Сортируем по алфавиту для красоты
    }
    
    hideCreateForm();
    renderList(); // Перерисует список, добавит новый элемент и кнопку в конец
    showMessage(`Секрет ${secretName} создан.`, 'success');

  } catch (err) {
    showMessage(err.message, 'error', 'create-message');
  }
}
