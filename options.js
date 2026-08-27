document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveAndCheckConnection);

async function saveAndCheckConnection() {
  const status = document.getElementById('status');
  
  // Очистка от лишних слешей
  let url = document.getElementById('vault_url').value.trim().replace(/\/$/, "");
  let kvEngine = document.getElementById('kv_engine').value.trim().replace(/^\/+|\/+$/g, "");
  let secretPath = document.getElementById('secret_path').value.trim().replace(/^\/+|\/+$/g, "");

  const data = {
    vault_url: url,
    username: document.getElementById('username').value.trim(),
    password: document.getElementById('password').value,
    kv_engine: kvEngine,
    secret_path: secretPath
  };

  status.textContent = 'Сохранение и проверка подключения...';
  status.className = 'neutral';

  try {
    await browser.storage.local.set(data);

    if (!data.vault_url || !data.username || !data.password || !data.kv_engine) {
      throw new Error("Заполните URL, Username, Password и KV Engine.");
    }

    const loginUrl = `${data.vault_url}/v1/auth/userpass/login/${data.username}`;
    
    const res = await fetch(loginUrl, {
      method: 'POST',
      body: JSON.stringify({ password: data.password }),
      headers: { 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      let errorText = `HTTP ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson.errors && errJson.errors.length > 0) {
          errorText += ` - ${errJson.errors.join(', ')}`;
        }
      } catch (e) {
        // Игнорируем если не JSON
      }
      throw new Error(`Ошибка авторизации: ${errorText}`);
    }

    status.textContent = 'Настройки сохранены. Подключение успешно.';
    status.className = 'success';
    
  } catch (err) {
    status.textContent = `Настройки сохранены, но нет подключения:\n${err.message}`;
    status.className = 'error';
  }
}

function restoreOptions() {
  browser.storage.local.get(['vault_url', 'username', 'password', 'kv_engine', 'secret_path']).then((res) => {
    if (res.vault_url) document.getElementById('vault_url').value = res.vault_url;
    if (res.username) document.getElementById('username').value = res.username;
    if (res.password) document.getElementById('password').value = res.password;
    if (res.kv_engine) document.getElementById('kv_engine').value = res.kv_engine;
    if (res.secret_path !== undefined) document.getElementById('secret_path').value = res.secret_path;
  });
}
