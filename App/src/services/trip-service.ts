import { Platform } from 'react-native';
import * as Location from 'expo-location';
import { api } from './api';
import { auth } from '@/config/firebase';
import { buildApiUrl } from '@/config/api';
import * as FileSystem from 'expo-file-system/legacy';

// ─── Autocomplete ──────────────────────────────────────────────────────────────
export interface PlaceSuggestion {
  placeId: string;
  primaryText: string;
  secondaryText: string;
}

export async function getPlaceAutocomplete(params: {
  q: string;
  lat?: number;
  lng?: number;
  sessionToken?: string;
}): Promise<PlaceSuggestion[]> {
  const search = new URLSearchParams({ q: params.q });
  if (params.lat != null) search.set('lat', String(params.lat));
  if (params.lng != null) search.set('lng', String(params.lng));
  if (params.sessionToken) search.set('sessionToken', params.sessionToken);
  const res = await api.get<any>(`/places/autocomplete?${search.toString()}`);
  return res?.data?.suggestions ?? res?.suggestions ?? [];
}

// ─── Decode Google Encoded Polyline ────────────────────────────────────────────
export function decodePolyline(encoded: string): { latitude: number; longitude: number }[] {
  const points: { latitude: number; longitude: number }[] = [];
  let idx = 0;
  let lat = 0;
  let lng = 0;
  while (idx < encoded.length) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(idx++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lat += result & 1 ? ~(result >> 1) : result >> 1;
    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(idx++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    lng += result & 1 ? ~(result >> 1) : result >> 1;
    points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
  }
  return points;
}

// ─── Trip Types ────────────────────────────────────────────────────────────────
export type TripStatus = 'building' | 'ready' | 'failed';
export type ItemStatus = 'pending' | 'ready' | 'failed';
export type ItemType =
  | 'trip-intro'
  | 'story'
  | 'food'
  | 'town-welcome'
  | 'episode'
  | 'long-form'
  | 'sponsored';
export type ItemSide = 'left' | 'right' | 'none';

export interface TripItem {
  id: string;
  type: ItemType;
  status: ItemStatus;
  title: string;
  side: ItemSide;
  sponsor?: { name: string };
  trigger?: {
    lat: number;
    lng: number;
    radiusM: number;
    routeDistanceM: number;
  };
  audio?: {
    url: string;
    durationS: number;
    bytes: number;
  };
  transcript?: string;
  failure?: { code: string; message: string };
}

export interface Trip {
  id: string;
  status: TripStatus;
  stage?: 'discovering' | 'curating' | 'producing' | 'done';
  progress: { ready: number; failed: number; total: number };
  origin: { label: string; lat?: number; lng?: number };
  destination: { label: string; lat?: number; lng?: number };
  moods?: string[];
  prefs: {
    language: string;
    voice: string;
    voiceGender: string;
    interests: string[];
    moods?: string[];
    musicMode: string;
  };
  route?: {
    polyline: string;
    distanceM: number;
    durationS: number;
  };
  items: TripItem[];
  totalBytes?: number;
  createdAt: string;
  builtAt?: string;
  failure?: { code: string; message: string };
}

export interface TripSummary {
  id: string;
  status: TripStatus;
  stage?: 'discovering' | 'curating' | 'producing' | 'done';
  progress: { ready: number; failed: number; total: number };
  origin: { label: string; lat?: number; lng?: number };
  destination: { label: string; lat?: number; lng?: number };
  route?: { distanceM: number; durationS: number };
  createdAt: string;
}

// ─── Route Options & Preview ──────────────────────────────────────────────────
export interface RouteOption {
  id: string;
  distanceM: number;
  durationS: number;
  description: string;
  polyline: string;
}

export async function previewRoutes(params: {
  origin: { lat: number; lng: number } | { placeId: string };
  destination: { placeId: string };
}): Promise<RouteOption[]> {
  const res = await api.post<any>('/trips/preview', params);
  return res?.data ?? res ?? [];
}

// ─── Start Trip ────────────────────────────────────────────────────────────────
export interface StartTripParams {
  origin: { lat: number; lng: number; label?: string } | { placeId: string; label: string };
  destination: { placeId: string; label: string };
  selectedRoute?: {
    polyline: string;
    distanceM?: number;
    durationS?: number;
    description?: string;
  };
  moods?: string[];
  prefs?: {
    language?: string;
    voice?: string;
    voiceGender?: string;
    interests?: string[];
    moods?: string[];
    musicMode?: string;
  };
}

export async function startTrip(params: StartTripParams): Promise<{ tripId: string }> {
  const res = await api.post<any>('/trips', params);
  return res?.data ?? res;
}

/**
 * Formats a reverse-geocoded address into a human-readable, full location name.
 * Avoids raw street numbers, "Current Location", "Unnamed Road", and duplicate names.
 * Example: "100 Feet Rd, Indiranagar, Bengaluru" or "Indiranagar, Bengaluru"
 */
export function formatAddressFromGeocode(item: Location.LocationGeocodedAddress): string {
  const parts: string[] = [];

  const add = (val?: string | null) => {
    if (!val) return;
    const trimmed = val.trim();
    if (
      trimmed &&
      !parts.some((p) => p.toLowerCase() === trimmed.toLowerCase()) &&
      !/current location/i.test(trimmed) &&
      !/unnamed/i.test(trimmed)
    ) {
      parts.push(trimmed);
    }
  };

  // 1. Landmark or POI name
  if (item.name && item.name !== item.street && isNaN(Number(item.name))) {
    add(item.name);
  }

  // 2. Street (with street number if present)
  if (item.street) {
    const streetName = item.streetNumber ? `${item.streetNumber} ${item.street}` : item.street;
    add(streetName);
  } else if (item.name && isNaN(Number(item.name))) {
    add(item.name);
  }

  // 3. District / Subregion / Neighborhood
  add(item.district || item.subregion);

  // 4. City / Town
  add(item.city);

  // 5. Region (state/province) if city wasn't available
  if (!item.city && item.region) {
    add(item.region);
  }

  return parts.join(', ');
}

/**
 * Resolves a coordinate pair into a full human-readable address name using device reverse geocoding.
 */
export async function resolveLocationName(coords: { latitude: number; longitude: number }): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const results = await Location.reverseGeocodeAsync(coords);
    if (results && results.length > 0) {
      const formatted = formatAddressFromGeocode(results[0]);
      if (formatted) return formatted;
    }
  } catch (err) {
    console.warn('[resolveLocationName] Error reverse geocoding:', err);
  }
  return null;
}

/**
 * Sanitizes recent trips by resolving any "Current location" labels to full location names.
 */
export async function sanitizeTripSummaries(trips: TripSummary[]): Promise<TripSummary[]> {
  if (!Array.isArray(trips)) return [];
  const updated = await Promise.all(
    trips.map(async (trip) => {
      if (/current location/i.test(trip.origin?.label?.trim() || '')) {
        const lat = trip.origin?.lat;
        const lng = trip.origin?.lng;
        if (lat != null && lng != null) {
          const resolved = await resolveLocationName({ latitude: lat, longitude: lng });
          if (resolved) {
            return {
              ...trip,
              origin: { ...trip.origin, label: resolved },
            };
          }
        }
      }
      return trip;
    })
  );
  return updated;
}

// ─── Get Trip ──────────────────────────────────────────────────────────────────
export async function getTrip(tripId: string): Promise<Trip> {
  const res = await api.get<any>(`/trips/${tripId}`);
  const trip = res?.data ?? res;
  if (trip && /current location/i.test(trip.origin?.label?.trim() || '')) {
    const lat = trip.origin?.lat;
    const lng = trip.origin?.lng;
    if (lat != null && lng != null) {
      const resolved = await resolveLocationName({ latitude: lat, longitude: lng });
      if (resolved) {
        trip.origin.label = resolved;
      }
    }
  }
  return trip;
}

// ─── Get Recent Trips ──────────────────────────────────────────────────────────
export async function getRecentTrips(limit = 20): Promise<TripSummary[]> {
  const res = await api.get<any>(`/trips?limit=${limit}`);
  const list = res?.data ?? res ?? [];
  return sanitizeTripSummaries(list);
}

// ─── Post Listens ──────────────────────────────────────────────────────────────
export interface ListenEvent {
  id: string;
  tripId: string;
  itemId: string;
  event: 'started' | 'completed' | 'skipped';
  at: string;
}

export async function postListens(events: ListenEvent[]): Promise<void> {
  await api.post('/listens', { events });
}

// ─── Live Mode: Ask Musafir (/ask) ─────────────────────────────────────────────
export interface AskHistoryTurn {
  q: string;
  a: string;
}

export interface AskParams {
  audioUri?: string;
  audioBase64?: string;
  text?: string;
  lat: number;
  lng: number;
  heading?: number;
  tripId?: string;
  history?: AskHistoryTurn[];
  language?: string;
}

export interface AskResult {
  transcript: string;
  answerText: string;
  language: string;
  voice: string;
  audio: {
    mimeType: string;
    base64: string;
    durationS: number;
  };
  timingsMs?: {
    stt: number;
    llm: number;
    tts: number;
    total: number;
  };
}

export async function askMusafir(params: AskParams): Promise<AskResult> {
  let audioBase64 = params.audioBase64;

  if (!audioBase64 && params.audioUri) {
    try {
      if (Platform.OS === 'web') {
        const res = await fetch(params.audioUri);
        const blob = await res.blob();
        if (blob.size === 0) {
          throw new Error("Recorded audio was empty. Please speak again.");
        }
        audioBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            const base64 = result.includes(',') ? result.split(',')[1] : result;
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } else {
        const fileInfo = await FileSystem.getInfoAsync(params.audioUri);
        if (!fileInfo.exists || fileInfo.size === 0) {
          throw new Error("Recorded audio was empty. Please speak again.");
        }
        audioBase64 = await FileSystem.readAsStringAsync(params.audioUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }
    } catch (readErr: any) {
      console.warn('[askMusafir] Error reading audio file:', readErr);
      throw new Error(readErr?.message || "Could not read recorded audio file.");
    }
  }

  const payload: Record<string, any> = {
    lat: params.lat,
    lng: params.lng,
  };

  if (audioBase64) {
    payload.audioBase64 = audioBase64;
  } else if (params.text) {
    payload.text = params.text.trim();
  }

  if (params.heading != null && !isNaN(params.heading)) {
    payload.heading = Math.round(params.heading);
  }

  if (params.tripId && /^[0-9a-f]{24}$/i.test(params.tripId)) {
    payload.tripId = params.tripId;
  }

  if (params.history && params.history.length > 0) {
    payload.history = params.history.slice(-6);
  }

  if (params.language) {
    payload.language = params.language;
  }

  try {
    const res = await api.post<any>('/ask', payload, { timeout: 40000 }); // the LLM step alone can take 13 s+ on the free tier
    const data = res?.data ?? res;
    if (!data || !data.audio?.base64) {
      throw new Error('Invalid response from Musafir voice assistant');
    }
    return data as AskResult;
  } catch (err: any) {
    const code = err?.code || (err?.status ? `HTTP_${err.status}` : undefined);
    let message = err?.message;

    if (code === 'NOTHING_HEARD') {
      message = "Sorry, I didn't catch that. Please speak again.";
    } else if (code === 'RATE_LIMITED') {
      const retryAfter = err?.details?.retryAfterS;
      message = retryAfter
        ? `Too many questions. Please try again in ${retryAfter}s.`
        : 'Too many questions. Please try again in a few minutes.';
    } else if (code === 'AUDIO_TOO_LONG') {
      message = 'Question was too long (maximum 25 seconds).';
    } else if (code === 'AUDIO_TOO_LARGE') {
      message = 'Audio was too large (maximum 2 MB).';
    } else if (code === 'UNSUPPORTED_AUDIO') {
      message = 'Unsupported audio format.';
    } else if (code === 'UPSTREAM_UNAVAILABLE') {
      message = 'Speech or maps service temporarily unavailable. Please try again.';
    } else if (code === 'UNAUTHORIZED') {
      message = 'Please sign in to ask questions.';
    } else if (
      !err.status &&
      (err.message?.includes('Network Error') || err.message?.includes('network'))
    ) {
      message = "I'll answer once we're back in coverage";
    }

    const friendlyErr: any = new Error(message || 'Failed to process question');
    friendlyErr.code = code;
    friendlyErr.status = err?.status;
    friendlyErr.details = err?.details;
    throw friendlyErr;
  }
}

// ─── Offline Storage & Playback Re-exports ─────────────────────────────────────
export {
  saveOfflineTrip,
  loadOfflineTrip,
  loadCachedRecentTrips,
  saveCachedRecentTrips,
  savePendingListens,
  loadPendingListens,
  clearPendingListens,
  clearAllOfflineTripData,
  getOfflineStorageUsage,
} from './offline-trip-service';

