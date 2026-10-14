import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { auth } from '@/config/firebase';
import { Trip, TripSummary, ListenEvent } from '@/services/trip-service';

const STORAGE_KEY_PREFIX = '@musafir_offline_trip_';
const OFFLINE_TRIP_IDS_KEY = '@musafir_offline_trip_ids';
const CACHED_RECENT_TRIPS_KEY = '@musafir_cached_recent_trips';
const PENDING_LISTENS_KEY = '@musafir_pending_listens';

function getTripJsonPath(tripId: string): string {
  const docDir = FileSystem.documentDirectory || '';
  return `${docDir}musafir_trip_${tripId}.json`;
}

/**
 * Persists a trip JSON locally to disk and AsyncStorage for zero-network offline playback.
 */
export async function saveOfflineTrip(trip: Trip): Promise<void> {
  if (!trip?.id || Platform.OS === 'web') return;

  const jsonStr = JSON.stringify(trip);

  // 1. Save to AsyncStorage for instant memory-mapped access
  try {
    await AsyncStorage.setItem(`${STORAGE_KEY_PREFIX}${trip.id}`, jsonStr);
  } catch (err) {
    console.warn('[OfflineTripService] Error saving to AsyncStorage:', err);
  }

  // 2. Save to document directory file for durable file-system storage
  try {
    const filePath = getTripJsonPath(trip.id);
    await FileSystem.writeAsStringAsync(filePath, jsonStr, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    console.warn('[OfflineTripService] Error saving to FileSystem:', err);
  }

  // 3. Track offline trip ID in index
  try {
    const rawIds = await AsyncStorage.getItem(OFFLINE_TRIP_IDS_KEY);
    const ids: string[] = rawIds ? JSON.parse(rawIds) : [];
    if (!ids.includes(trip.id)) {
      ids.unshift(trip.id);
      await AsyncStorage.setItem(OFFLINE_TRIP_IDS_KEY, JSON.stringify(ids.slice(0, 30)));
    }
  } catch (err) {
    console.warn('[OfflineTripService] Error updating offline trip IDs index:', err);
  }

  // 4. Update cached recent trips list
  try {
    const summary: TripSummary = {
      id: trip.id,
      status: trip.status,
      progress: trip.progress,
      origin: trip.origin,
      destination: trip.destination,
      route: trip.route ? { distanceM: trip.route.distanceM, durationS: trip.route.durationS } : undefined,
      createdAt: trip.createdAt,
    };
    const rawRecents = await AsyncStorage.getItem(CACHED_RECENT_TRIPS_KEY);
    let recents: TripSummary[] = rawRecents ? JSON.parse(rawRecents) : [];
    recents = [summary, ...recents.filter((r) => r.id !== trip.id)].slice(0, 20);
    await AsyncStorage.setItem(CACHED_RECENT_TRIPS_KEY, JSON.stringify(recents));
  } catch (err) {
    console.warn('[OfflineTripService] Error updating cached recent trips:', err);
  }
}

/**
 * Loads a cached trip JSON from local storage / disk.
 */
export async function loadOfflineTrip(tripId: string): Promise<Trip | null> {
  if (!tripId || Platform.OS === 'web') return null;

  // 1. Try AsyncStorage first
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_KEY_PREFIX}${tripId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Trip;
      if (parsed && parsed.id === tripId) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[OfflineTripService] AsyncStorage read failed, trying FileSystem:', err);
  }

  // 2. Fallback to FileSystem file
  try {
    const filePath = getTripJsonPath(tripId);
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(filePath, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      if (content) {
        return JSON.parse(content) as Trip;
      }
    }
  } catch (err) {
    console.warn('[OfflineTripService] FileSystem read error:', err);
  }

  return null;
}

function getCachedRecentTripsKey(userId?: string): string {
  const uid = userId || auth.currentUser?.uid;
  return uid ? `${CACHED_RECENT_TRIPS_KEY}_${uid}` : CACHED_RECENT_TRIPS_KEY;
}

/**
 * Retrieves the cached list of recent trips for offline display on Home screen.
 */
export async function loadCachedRecentTrips(userId?: string): Promise<TripSummary[]> {
  try {
    const key = getCachedRecentTripsKey(userId);
    let raw = await AsyncStorage.getItem(key);
    if (!raw && key !== CACHED_RECENT_TRIPS_KEY) {
      raw = await AsyncStorage.getItem(CACHED_RECENT_TRIPS_KEY);
    }
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[OfflineTripService] Error loading cached recent trips:', err);
  }
  return [];
}

/**
 * Saves a fresh list of recent trips to offline storage.
 */
export async function saveCachedRecentTrips(trips: TripSummary[], userId?: string): Promise<void> {
  try {
    if (Array.isArray(trips)) {
      const key = getCachedRecentTripsKey(userId);
      const val = JSON.stringify(trips.slice(0, 20));
      await AsyncStorage.setItem(key, val);
      await AsyncStorage.setItem(CACHED_RECENT_TRIPS_KEY, val);
    }
  } catch (err) {
    console.warn('[OfflineTripService] Error saving cached recent trips:', err);
  }
}

/**
 * Persists pending listen events so offline events survive app closures.
 */
export async function savePendingListens(events: ListenEvent[]): Promise<void> {
  try {
    await AsyncStorage.setItem(PENDING_LISTENS_KEY, JSON.stringify(events));
  } catch (err) {
    console.warn('[OfflineTripService] Error saving pending listens:', err);
  }
}

/**
 * Loads previously queued pending listen events.
 */
export async function loadPendingListens(): Promise<ListenEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_LISTENS_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[OfflineTripService] Error loading pending listens:', err);
  }
  return [];
}

/**
 * Clears pending listen events from storage after a successful server flush.
 */
export async function clearPendingListens(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_LISTENS_KEY);
  } catch {}
}

/**
 * Completely clears all offline trip data, audio downloads, caches, and storage.
 * Called on user logout or when manually clearing cache.
 */
export async function clearAllOfflineTripData(): Promise<void> {
  console.log('[OfflineTripService] Clearing all offline trip data...');

  if (Platform.OS === 'web') {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const tripKeysToRemove = allKeys.filter(
        (key) =>
          key.startsWith(STORAGE_KEY_PREFIX) ||
          key === OFFLINE_TRIP_IDS_KEY ||
          key === CACHED_RECENT_TRIPS_KEY ||
          key === PENDING_LISTENS_KEY
      );
      if (tripKeysToRemove.length > 0) {
        await AsyncStorage.multiRemove(tripKeysToRemove);
      }
    } catch {}
    return;
  }

  // 1. Delete all audio files (.mp3) and trip json (.json) in FileSystem.documentDirectory
  try {
    const docDir = FileSystem.documentDirectory;
    if (docDir) {
      const files = await FileSystem.readDirectoryAsync(docDir);
      for (const file of files) {
        if (
          file.startsWith('musafir_audio_') ||
          file.startsWith('musafir_trip_') ||
          file.startsWith('musafir_')
        ) {
          try {
            await FileSystem.deleteAsync(`${docDir}${file}`, { idempotent: true });
          } catch (delErr) {
            console.warn(`[OfflineTripService] Error deleting file ${file}:`, delErr);
          }
        }
      }
    }
  } catch (err) {
    console.warn('[OfflineTripService] Error reading document directory:', err);
  }

  // 2. Delete temporary cache files in FileSystem.cacheDirectory
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (cacheDir) {
      // Delete musafir_audio_cache subfolder
      const audioCacheDir = `${cacheDir}musafir_audio_cache`;
      const audioDirInfo = await FileSystem.getInfoAsync(audioCacheDir);
      if (audioDirInfo.exists) {
        await FileSystem.deleteAsync(audioCacheDir, { idempotent: true });
      }

      // Delete any musafir_live_*.mp3
      const cacheFiles = await FileSystem.readDirectoryAsync(cacheDir);
      for (const file of cacheFiles) {
        if (file.startsWith('musafir_live_') || file.startsWith('musafir_')) {
          try {
            await FileSystem.deleteAsync(`${cacheDir}${file}`, { idempotent: true });
          } catch {}
        }
      }
    }
  } catch (err) {
    console.warn('[OfflineTripService] Error clearing cache directory:', err);
  }

  // 3. Remove all AsyncStorage offline trip keys
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const tripKeysToRemove = allKeys.filter(
      (key) =>
        key.startsWith(STORAGE_KEY_PREFIX) ||
        key === OFFLINE_TRIP_IDS_KEY ||
        key === CACHED_RECENT_TRIPS_KEY ||
        key === PENDING_LISTENS_KEY
    );

    if (tripKeysToRemove.length > 0) {
      await AsyncStorage.multiRemove(tripKeysToRemove);
    }
  } catch (err) {
    console.warn('[OfflineTripService] Error clearing AsyncStorage keys:', err);
  }

  console.log('[OfflineTripService] Successfully cleared all offline trip data.');
}

export function formatStorageBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Calculates total storage used by offline trips, downloads, and audio files.
 */
export async function getOfflineStorageUsage(): Promise<{
  bytes: number;
  formatted: string;
  fileCount: number;
}> {
  if (Platform.OS === 'web') {
    return {
      bytes: 0,
      formatted: '0 B',
      fileCount: 0,
    };
  }

  let totalBytes = 0;
  let fileCount = 0;

  // 1. Check document directory files (saved trips and downloaded audio)
  try {
    const docDir = FileSystem.documentDirectory;
    if (docDir) {
      const files = await FileSystem.readDirectoryAsync(docDir);
      for (const file of files) {
        if (
          file.startsWith('musafir_audio_') ||
          file.startsWith('musafir_trip_') ||
          file.startsWith('musafir_')
        ) {
          try {
            const info = await FileSystem.getInfoAsync(`${docDir}${file}`);
            if (info.exists && typeof (info as any).size === 'number') {
              totalBytes += (info as any).size;
              fileCount += 1;
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    console.warn('[OfflineTripService] Error calculating document directory usage:', err);
  }

  // 2. Check cache directory files (voice demo cache and live assistant responses)
  try {
    const cacheDir = FileSystem.cacheDirectory;
    if (cacheDir) {
      const audioCacheDir = `${cacheDir}musafir_audio_cache`;
      const audioDirInfo = await FileSystem.getInfoAsync(audioCacheDir);
      if (audioDirInfo.exists) {
        const cacheSubFiles = await FileSystem.readDirectoryAsync(audioCacheDir);
        for (const subFile of cacheSubFiles) {
          try {
            const info = await FileSystem.getInfoAsync(`${audioCacheDir}/${subFile}`);
            if (info.exists && typeof (info as any).size === 'number') {
              totalBytes += (info as any).size;
              fileCount += 1;
            }
          } catch {}
        }
      }

      const cacheFiles = await FileSystem.readDirectoryAsync(cacheDir);
      for (const file of cacheFiles) {
        if (file.startsWith('musafir_live_') || file.startsWith('musafir_')) {
          try {
            const info = await FileSystem.getInfoAsync(`${cacheDir}${file}`);
            if (info.exists && typeof (info as any).size === 'number') {
              totalBytes += (info as any).size;
              fileCount += 1;
            }
          } catch {}
        }
      }
    }
  } catch (err) {
    console.warn('[OfflineTripService] Error calculating cache directory usage:', err);
  }

  return {
    bytes: totalBytes,
    formatted: formatStorageBytes(totalBytes),
    fileCount,
  };
}

