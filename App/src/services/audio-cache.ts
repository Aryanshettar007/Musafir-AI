import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

// In-memory cache for ultra-fast replay lookup during the app session
const memoryCache = new Map<string, string>();

/**
 * Generate a deterministic local filename for an audio URL or key.
 */
function getCacheFilename(url: string, key?: string): string {
  // Strip query parameters
  const cleanUrl = url.split('?')[0];
  let hash = 0;
  for (let i = 0; i < cleanUrl.length; i++) {
    hash = (hash << 5) - hash + cleanUrl.charCodeAt(i);
    hash |= 0;
  }
  const hashStr = Math.abs(hash).toString(36);

  if (key) {
    const cleanKey = key.replace(/[^a-zA-Z0-9_-]/g, '_');
    return `voice_demo_${cleanKey}_${hashStr}.mp3`;
  }

  const filename = cleanUrl.split('/').pop()?.replace(/[^a-zA-Z0-9._-]/g, '_') || 'demo.mp3';
  return `voice_demo_${hashStr}_${filename.endsWith('.mp3') ? filename : `${filename}.mp3`}`;
}

/**
 * Returns a local file URI for the given audio URL.
 * If the file is not yet cached locally, downloads it into the temporary cache directory.
 * If downloading fails or on web, safely falls back to the original remote URL.
 */
export async function getCachedAudioUri(url: string, key?: string): Promise<string> {
  if (!url) return url;

  // On Web or if filesystem cache directory is unavailable, stream remote directly
  if (Platform.OS === 'web' || !FileSystem.cacheDirectory) {
    return url;
  }

  const memKey = key ? `${key}_${url}` : url;

  // 1. Check in-memory cache
  const cachedUri = memoryCache.get(memKey);
  if (cachedUri) {
    try {
      const fileInfo = await FileSystem.getInfoAsync(cachedUri);
      if (fileInfo.exists) {
        return cachedUri;
      }
    } catch {
      memoryCache.delete(memKey);
    }
  }

  const filename = getCacheFilename(url, key);
  const cacheDir = `${FileSystem.cacheDirectory}musafir_audio_cache/`;
  const localTargetUri = `${cacheDir}${filename}`;

  try {
    // 2. Ensure cache directory exists
    const dirInfo = await FileSystem.getInfoAsync(cacheDir);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true });
    }

    // 3. Check if file is already stored on disk
    const fileInfo = await FileSystem.getInfoAsync(localTargetUri);
    if (fileInfo.exists && (fileInfo as any).size > 0) {
      memoryCache.set(memKey, localTargetUri);
      return localTargetUri;
    }

    // 4. Download file temporarily to local cache
    const downloadResult = await FileSystem.downloadAsync(url, localTargetUri);
    if (downloadResult && downloadResult.status === 200 && downloadResult.uri) {
      memoryCache.set(memKey, downloadResult.uri);
      return downloadResult.uri;
    }
  } catch (error) {
    console.warn('[AudioCache] Failed to download or access cache, falling back to remote URL:', error);
  }

  // Fallback to remote URL
  return url;
}
