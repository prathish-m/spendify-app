# Cloud build → APK on your phone (no Android Studio, no local SDK)

A GitHub Actions workflow (`.github/workflows/android-build.yml`) builds a
**debug APK** on a free Ubuntu runner and uploads it as a downloadable
artifact. You install nothing locally except `git` to push the code.

---

## One-time setup

### 1. Create a GitHub repo
Create a new (private is fine) repo on github.com, e.g. `spendify-android`.
Don't add a README/`.gitignore` from the UI (this folder already has them).

### 2. Push this folder to it
From `spendify-android/`:

```powershell
git init
git add .
git commit -m "Spendify Android (Capacitor) + cloud APK build"
git branch -M main
git remote add origin https://github.com/<your-username>/spendify-android.git
git push -u origin main
```

> `.env`, `node_modules/`, `dist/`, and the generated `android/` folder are
> git-ignored on purpose. The backend URL is provided to CI via a repo variable
> (next step), not committed.

### 3. Set the backend URL as a repo variable
In the repo: **Settings → Secrets and variables → Actions → Variables tab →
New repository variable**

- **Name:** `VITE_API_URL`
- **Value:** `https://spendify-api.cfapps.eu10.hana.ondemand.com`

> If you skip this, the workflow falls back to that same public URL by default
> (it's hardcoded as the fallback in the workflow), so this step is optional but
> recommended so you can change the URL without editing the workflow.

---

## Build the APK

The workflow runs automatically on every push to `main`. To run it on demand:

**Actions tab → "Android APK" → Run workflow → Run workflow**

When the run finishes (green check, ~3–6 min), open the run and scroll to
**Artifacts → `spendify-debug-apk`** and download it (it's a zip containing
`app-debug.apk`).

---

## Install on your phone

1. Download `spendify-debug-apk` (you can do this directly in your phone's
   browser while signed into GitHub, or download on PC and transfer the APK).
2. Unzip if needed, so you have `app-debug.apk`.
3. Tap the APK. Android will ask to allow installing from this source — enable
   **"Install unknown apps"** for your browser/file manager, then install.
4. Open **Spendify**. It will call your backend at the configured `VITE_API_URL`.

---

## Troubleshooting

- **Network/login fails in the app:** the phone must reach the backend URL.
  A public `https://` URL (like the SAP BTP one) works from any network. Confirm
  the URL is reachable from the phone's browser.
- **CORS errors:** the app's WebView origin on Android is `https://localhost`
  (Capacitor). If the backend rejects it, add `https://localhost` (and
  `capacitor://localhost`) to the server's allowed CORS origins.
- **Cleartext (only if you ever switch to a plain `http://` URL):** add
  `android:usesCleartextTraffic="true"` to the `<application>` tag in
  `android/app/src/main/AndroidManifest.xml`. Not needed for `https://`.
- **Want a release (signed) APK later:** debug APKs are fine for personal
  testing. A release build needs a signing keystore + Gradle signing config —
  ask and I'll add it.
