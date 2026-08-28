# Vault Finder

**Vault Finder** is a browser extension for searching, viewing, and managing secrets in **HashiCorp Vault** (supporting KV v1/v2 engines via `userpass` authentication).

---

## Security & Data Privacy

* All Vault connection configurations (URL, credentials, and paths) are stored locally using `browser.storage.local`.
* Requests are sent directly to your configured Vault instance over standard HTTP/HTTPS REST API endpoints (`/v1/auth/userpass/login/`).
* No third-party analytics, tracking, or external telemetry services are used.

---

## Local Development & Installation

The source code is shared across all supported platforms, but **separate manifest files must be used** depending on your target browser:

* **Chromium (Chrome / Brave / Edge):** Use `manifests/manifest.chrome.json`.
* **Mozilla Firefox:** Use `manifests/manifest.firefox.json` (includes `browser_specific_settings.gecko`).

Before loading the unpacked extension into your browser, copy the appropriate manifest file to the root directory as `manifest.json`:

```bash
# For Chromium browsers
cp manifests/manifest.chrome.json ./manifest.json

# For Firefox
cp manifests/manifest.firefox.json ./manifest.json

```

---

## Build & Release Pipeline

Release zip archives are generated automatically via GitHub Actions (`.github/workflows/build.yml`).

Pushing a version tag (e.g., `git tag v1.0.0 && git push origin v1.0.0`) or triggering the workflow manually produces two distinct build targets attached to the release:

* `vault-finder-chrome.zip`
* `vault-finder-firefox.zip`

---

## Custom Styling & CSS API

The application uses a CSS Variable system defined in `style.css`. 

You can customize the look and feel of exstension by overriding these variables in the **Custom Appearance Styles (CSS)** editor inside the options page.

Theme for example: [Cattpuccin Mocha Blue](./style-cattpuccin-mocha.css) 
