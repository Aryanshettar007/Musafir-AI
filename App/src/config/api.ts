import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Resolves the backend base URL for all testing environments:
 * - iOS Simulator
 * - Android Emulator
 * - Physical iPhone/Android devices connected over local Wi-Fi
 *
 * Precedence:
 * 1. Explicit EXPO_PUBLIC_BACKEND_URL in .env
 * 2. Constants.expoConfig?.extra?.backendUrl in app.json
 * 3. Dynamic Metro hostUri IP (auto-detected when developing on Wi-Fi)
 * 4. Fallback: http://192.168.1.30:3000
 */
function resolveBackendUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
  const extraUrl = Constants.expoConfig?.extra?.backendUrl?.trim();
  let candidate = envUrl || extraUrl || '';

  // If candidate is missing or points to localhost, attempt to extract the Metro host IP
  // so that physical devices and emulators can reach the development machine.
  const isLocalhost =
    !candidate ||
    candidate.includes('localhost') ||
    candidate.includes('127.0.0.1');

  if (isLocalhost) {
    const hostUri = Constants.expoConfig?.hostUri; // e.g. "192.168.1.30:8081"
    const metroIp = hostUri ? hostUri.split(':')[0] : null;

    if (metroIp && metroIp !== 'localhost' && metroIp !== '127.0.0.1') {
      candidate = `http://${metroIp}:3000`;
    } else if (Platform.OS === 'android' && candidate.includes('localhost')) {
      // Android emulator fallback loopback
      candidate = 'http://10.0.2.2:3000';
    } else if (!candidate) {
      candidate = 'http://192.168.1.30:3000';
    }
  }

  return candidate.replace(/\/+$/, '');
}

export const BACKEND_URL = resolveBackendUrl();

/**
 * Helper to construct full backend API endpoint URLs
 * Example: buildApiUrl('/health') -> 'http://192.168.1.30:3000/health'
 */
export function buildApiUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${BACKEND_URL}${cleanPath}`;
}

export default {
  BACKEND_URL,
  buildApiUrl,
};
