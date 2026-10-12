import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';
import { TripItem } from './trip-service';

export const MUSAFIR_GEOFENCE_TASK = 'musafir-geofence-task';
export const MUSAFIR_LOCATION_TASK = 'musafir-location-task';

type GeofenceTriggerCallback = (itemId: string) => void;
type LocationUpdateCallback = (loc: { latitude: number; longitude: number }) => void;

// Active listeners and memory store
const geofenceListeners = new Set<GeofenceTriggerCallback>();
const locationListeners = new Set<LocationUpdateCallback>();
let registeredItemsCache: TripItem[] = [];

/**
 * Register global background TaskManager tasks once at file load.
 */
if (!TaskManager.isTaskDefined(MUSAFIR_GEOFENCE_TASK)) {
  TaskManager.defineTask(MUSAFIR_GEOFENCE_TASK, async ({ data, error }) => {
    if (error) {
      console.warn('[GeofenceTask] Geofencing error:', error);
      return;
    }

    if (data) {
      const { eventType, region } = data as {
        eventType: Location.LocationGeofencingEventType;
        region: Location.LocationRegion;
      };

      // Native Geofence Enter event
      if (
        eventType === Location.LocationGeofencingEventType.Enter ||
        eventType === (1 as any)
      ) {
        const itemId = region?.identifier;
        if (itemId) {
          notifyGeofenceEnter(itemId);
        }
      }
    }
  });
}

if (!TaskManager.isTaskDefined(MUSAFIR_LOCATION_TASK)) {
  TaskManager.defineTask(MUSAFIR_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.warn('[LocationTask] Background location error:', error);
      return;
    }

    if (data) {
      const { locations } = data as { locations: Location.LocationObject[] };
      if (locations && locations.length > 0) {
        const latest = locations[locations.length - 1];
        const coords = {
          latitude: latest.coords.latitude,
          longitude: latest.coords.longitude,
        };

        // Notify location listeners
        for (const listener of locationListeners) {
          try {
            listener(coords);
          } catch (err) {
            console.warn('[LocationTask] Error in listener:', err);
          }
        }

        // Cross-check proximity with registered items in background
        checkProximityAgainstItems(coords.latitude, coords.longitude);
      }
    }
  });
}

function notifyGeofenceEnter(itemId: string) {
  for (const listener of geofenceListeners) {
    try {
      listener(itemId);
    } catch (err) {
      console.warn('[GeofenceService] Error dispatching geofence trigger:', err);
    }
  }
}

function checkProximityAgainstItems(lat: number, lng: number) {
  if (!registeredItemsCache || registeredItemsCache.length === 0) return;

  for (const item of registeredItemsCache) {
    if (!item.trigger || item.status !== 'ready') continue;
    const trigLat = item.trigger.lat;
    const trigLng = item.trigger.lng;
    const radiusM = item.trigger.radiusM || 250;

    // Fast distance calculation
    const dLat = ((trigLat - lat) * Math.PI) / 180;
    const dLng = ((trigLng - lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((trigLat * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    const distM = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    if (distM <= radiusM) {
      notifyGeofenceEnter(item.id);
    }
  }
}

/**
 * Subscribe to geofence enter triggers (invoked by background geofence or location task)
 */
export function subscribeToGeofence(callback: GeofenceTriggerCallback): () => void {
  geofenceListeners.add(callback);
  return () => {
    geofenceListeners.delete(callback);
  };
}

/**
 * Subscribe to background GPS location updates
 */
export function subscribeToBackgroundLocation(callback: LocationUpdateCallback): () => void {
  locationListeners.add(callback);
  return () => {
    locationListeners.delete(callback);
  };
}

/**
 * Register native background geofences and background location monitoring for a trip.
 * Automatically ducks music only when narration is playing, allowing users to listen
 * to their songs without interference or fake silent audio streams.
 */
export async function startBackgroundGeofencing(items: TripItem[]): Promise<void> {
  registeredItemsCache = items;

  try {
    // 1. Request foreground & background permissions
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== 'granted') {
      console.warn('[GeofenceService] Foreground location permission not granted');
      return;
    }

    let hasBgPermission = false;
    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      hasBgPermission = bg.status === 'granted';
    } catch {
      // Background location permissions might not be available in Expo Go or Web
    }

    // 2. Prepare native geofencing regions (up to max 20 regions for iOS limit)
    const readyItemsWithTriggers = items
      .filter((i) => i.trigger && i.status === 'ready')
      .slice(0, 20);

    const regions: Location.LocationRegion[] = readyItemsWithTriggers.map((item) => ({
      identifier: item.id,
      latitude: item.trigger!.lat,
      longitude: item.trigger!.lng,
      radius: Math.max(100, Math.min(1000, item.trigger!.radiusM || 250)),
      notifyOnEnter: true,
      notifyOnExit: false,
    }));

    // 3. Start native geofencing if supported and permissions granted
    if (regions.length > 0 && hasBgPermission && Platform.OS !== 'web') {
      try {
        const isAvailable = typeof (Location as any).isGeofencingAvailableAsync === 'function'
          ? await (Location as any).isGeofencingAvailableAsync()
          : true;

        if (isAvailable) {
          const isGeofenceStarted = await Location.hasStartedGeofencingAsync(MUSAFIR_GEOFENCE_TASK);
          if (isGeofenceStarted) {
            await Location.stopGeofencingAsync(MUSAFIR_GEOFENCE_TASK);
          }
          await Location.startGeofencingAsync(MUSAFIR_GEOFENCE_TASK, regions);
          console.log(`[GeofenceService] Registered ${regions.length} native geofences.`);
        } else {
          console.log('[GeofenceService] Native geofencing not available on this device/simulator; using background GPS tracking.');
        }
      } catch (geoErr) {
        console.log('[GeofenceService] Native geofencing skipped (using background GPS updates):', geoErr);
      }
    }

    // 4. Start background location service on iOS/Android
    if (hasBgPermission && Platform.OS !== 'web') {
      try {
        const isLocStarted = await Location.hasStartedLocationUpdatesAsync(MUSAFIR_LOCATION_TASK);
        if (isLocStarted) {
          await Location.stopLocationUpdatesAsync(MUSAFIR_LOCATION_TASK);
        }
        await Location.startLocationUpdatesAsync(MUSAFIR_LOCATION_TASK, {
          accuracy: Location.Accuracy.High,
          distanceInterval: 15,
          timeInterval: 3000,
          showsBackgroundLocationIndicator: true,
          foregroundService: {
            notificationTitle: 'Musafir AI',
            notificationBody: 'Automatic travel story geofencing active along route',
            notificationColor: '#007AFF',
          },
        });
        console.log('[GeofenceService] Background location tracking started.');
      } catch (locErr) {
        console.log('[GeofenceService] Background location updates skipped:', locErr);
      }
    }
  } catch (err) {
    console.warn('[GeofenceService] Background setup note:', err);
  }
}

/**
 * Stop background geofences and background location updates.
 */
export async function stopBackgroundGeofencing(): Promise<void> {
  registeredItemsCache = [];
  try {
    if (Platform.OS !== 'web') {
      const hasGeofence = await Location.hasStartedGeofencingAsync(MUSAFIR_GEOFENCE_TASK);
      if (hasGeofence) {
        await Location.stopGeofencingAsync(MUSAFIR_GEOFENCE_TASK);
      }
      const hasLoc = await Location.hasStartedLocationUpdatesAsync(MUSAFIR_LOCATION_TASK);
      if (hasLoc) {
        await Location.stopLocationUpdatesAsync(MUSAFIR_LOCATION_TASK);
      }
    }
  } catch (err) {
    console.warn('[GeofenceService] Error stopping geofencing:', err);
  }
}
