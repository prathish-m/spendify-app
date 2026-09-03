# Spendify — Android (Capacitor)

This folder is a **standalone copy** of the Spendify React/Vite app, wrapped as a
native **Android** app using [Capacitor](https://capacitorjs.com/). The original
web project in `../expense-splitter/` is left completely untouched.

The React source in `src/` is identical to the web app — only Capacitor tooling
and a relative-asset Vite `base` were added. The app runs inside a native
Android WebView and talks to your backend over the network via `VITE_API_URL`.

---

## Prerequisites (one-time, on your machine)

Building an actual `.apk`/`.aab` requires the native Android toolchain, which is
**not** installed in this workspace. Install these first:

1. **JDK 17** (e.g. Temurin/Adoptium) — `java -version` should work.
2. **Android Studio** (includes the Android SDK + platform tools).
3. Set `JAVA_HOME` and `ANDROID_HOME` (Android Studio can configure these).

Node.js + npm are already required for the web build.

---

## 1. Configure the backend URL

A phone/emulator **cannot** reach your PC's `localhost`. Copy the example env
file and set a reachable URL:

```powershell
copy .env.example .env
```

Then edit `.env` and set one of:

| Scenario                    | VITE_API_URL                          |
| --------------------------- | ------------------------------------- |
| Android emulator            | `http://10.0.2.2:4000`                |
| Real phone (same Wi-Fi)     | `http://192.168.x.x:4000`             |
| Deployed backend            | `https://your-backend.example.com`    |

> This value is baked into the JS bundle at build time, so re-run the build +
> sync after changing it.
>
> If you use a plain `http://` URL (not `https`), Android blocks cleartext by
> default. Either use `https`, or add
> `android:usesCleartextTraffic="true"` to the `<application>` tag in
> `android/app/src/main/AndroidManifest.xml` after the project is generated.

---

## 2. Install dependencies

```powershell
npm install
```

## 3. Generate the native Android project (one-time)

```powershell
npm run build          # produces dist/
npm run cap:add        # creates the android/ native project
```

## 4. Build / run

```powershell
npm run android:build  # build web + sync assets into android/
npm run cap:open       # open in Android Studio to run / build the APK
```

Or run straight onto a connected device/emulator:

```powershell
npm run android:run
```

To produce a distributable APK, use Android Studio
(**Build → Build Bundle(s) / APK(s) → Build APK(s)**), or from the `android/`
folder: `./gradlew assembleDebug` (output under
`android/app/build/outputs/apk/`).

---

## Available scripts

| Script                  | What it does                                        |
| ----------------------- | --------------------------------------------------- |
| `npm run dev`           | Vite dev server (plain web, for quick iteration)    |
| `npm run build`         | Type-check + production web build → `dist/`         |
| `npm run cap:add`       | `cap add android` — scaffold the native project     |
| `npm run cap:sync`      | `cap sync android` — copy web assets + plugins      |
| `npm run android:build` | `build` then `cap sync android`                     |
| `npm run android:run`   | `build` then run on a device/emulator               |
| `npm run cap:open`      | Open the Android project in Android Studio          |

---

## App identity

Configured in `capacitor.config.ts`:

- **App ID:** `com.spendify.app`
- **App name:** `Spendify`
- **Web dir:** `dist`

Change these before your first `cap add android` if you want a different
package name.
