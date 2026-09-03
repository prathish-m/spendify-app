import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor configuration for the Spendify Android app.
 *
 * `webDir` points at Vite's production build output (`dist`). Run
 * `npm run build` first, then `npx cap sync android` to copy the web assets
 * into the native Android project.
 *
 * The app talks to the backend over the network via `VITE_API_URL` (see
 * `.env`). A device/emulator cannot reach your PC's `localhost`, so set that
 * to a reachable URL before building the release APK:
 *   - Android emulator → your machine's loopback: http://10.0.2.2:4000
 *   - Real phone on same Wi-Fi → your PC's LAN IP: http://192.168.x.x:4000
 *   - Production        → your deployed https URL
 */
const config: CapacitorConfig = {
  appId: 'com.spendify.app',
  appName: 'Spendify',
  webDir: 'dist',
}

export default config
