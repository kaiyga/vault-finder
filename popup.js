let vaultConfig = {};
let vaultToken = null;
let allSecrets = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  document.getElementById('open-settings').addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

  document.getElementById('search').addEventListener('input', renderList);

  vaultConfig = await browser.storage.local.get(['vault_url', 'username', 'password', 'kv_engine', 'secret_path']);
  
  if (!vaultConfig.vault_url || !vaultConfig.username || !vaultConfig.password || !vaultConfig.kv_engine) {
    showMessage('Нет данных для подключения. Откройте настройки.', 'error');
    return;
  }

  await loadSecrets();
}

function showMessage(msg, type = 'neutral') {
  const msgEl = document.getElementById('message');
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
      throw new Error(`Директория ${dirPath} не найдена (HTTP 404).`);
    }

    if (!res.ok) throw new Error(`Ошибка загрузки ключей: ${res.status}`);

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
    // Основной контейнер секрета
    const itemDiv = document.createElement('div');
    itemDiv.className = 'secret-item';
    
    // Заголовок секрета (Имя + Кнопка полного копирования)
    const headerDiv = document.createElement('div');
    headerDiv.className = 'secret-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'secret-name';
    nameSpan.textContent = secret;
    
    const copyAllBtn = document.createElement('button');
    copyAllBtn.textContent = 'Копировать секрет';
    copyAllBtn.onclick = () => copyFullSecret(secret, copyAllBtn);

    // Контейнер для вложенных ключей (изначально скрыт)
    const keysDiv = document.createElement('div');
    keysDiv.className = 'keys-container';

    // Событие раскрытия секрета
    nameSpan.onclick = () => toggleSecretData(secret, keysDiv);

    headerDiv.appendChild(nameSpan);
    headerDiv.appendChild(copyAllBtn);
    
    itemDiv.appendChild(headerDiv);
    itemDiv.appendChild(keysDiv);
    listEl.appendChild(itemDiv);
  });
}

// Загрузка и раскрытие внутренностей секрета
async function toggleSecretData(secretKey, keysDiv) {
  const isExpanded = keysDiv.style.display === 'block';
  if (isExpanded) {
    keysDiv.style.display = 'none';
    return;
  }

  keysDiv.style.display = 'block';
  
  // Если ключи уже загружены, просто показываем их
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
      
      const keyName = document.createElement('span');
      keyName.className = 'key-name';
      keyName.textContent = k;

      const copyBtn = document.createElement('button');
      copyBtn.textContent = 'Копировать';
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

// Копирование всего секрета целиком (JSON)
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
