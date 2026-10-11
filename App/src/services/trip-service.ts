import { api } from './api';
import { auth } from '@/config/firebase';
import { buildApiUrl } from '@/config/api';

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
  progress: { ready: number; failed: number; total: number };
  origin: { label: string; lat?: number; lng?: number };
  destination: { label: string; lat?: number; lng?: number };
  prefs: {
    language: string;
    voice: string;
    voiceGender: string;
    interests: string[];
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
  progress: { ready: number; failed: number; total: number };
  origin: { label: string };
  destination: { label: string };
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
  prefs?: {
    language?: string;
    voice?: string;
    voiceGender?: string;
    interests?: string[];
    musicMode?: string;
  };
}

export async function startTrip(params: StartTripParams): Promise<{ tripId: string }> {
  const res = await api.post<any>('/trips', params);
  return res?.data ?? res;
}

// ─── Get Trip ──────────────────────────────────────────────────────────────────
export async function getTrip(tripId: string): Promise<Trip> {
  const res = await api.get<any>(`/trips/${tripId}`);
  return res?.data ?? res;
}

// ─── Get Recent Trips ──────────────────────────────────────────────────────────
export async function getRecentTrips(limit = 20): Promise<TripSummary[]> {
  const res = await api.get<any>(`/trips?limit=${limit}`);
  return res?.data ?? res ?? [];
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
  const token = await auth.currentUser?.getIdToken();

  const form = new FormData();

  if (params.audioUri) {
    // In React Native, FormData requires { uri, name, type }
    form.append('audio', {
      uri: params.audioUri,
      name: 'question.m4a',
      type: 'audio/mp4',
    } as any);
  } else if (params.text) {
    form.append('text', params.text.trim());
  }

  form.append('lat', String(params.lat));
  form.append('lng', String(params.lng));

  if (params.heading != null && !isNaN(params.heading)) {
    form.append('heading', String(Math.round(params.heading)));
  }

  // Only pass 24-character hex tripId if valid
  if (params.tripId && /^[0-9a-f]{24}$/i.test(params.tripId)) {
    form.append('tripId', params.tripId);
  }

  if (params.history && params.history.length > 0) {
    // Backend takes JSON string of last turns
    form.append('history', JSON.stringify(params.history.slice(-6)));
  }

  if (params.language) {
    form.append('language', params.language);
  }

  const endpoint = buildApiUrl('/ask');

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: form,
    });
  } catch (netErr: any) {
    const offlineErr: any = new Error("I'll answer once we're back in coverage");
    offlineErr.code = 'OFFLINE';
    throw offlineErr;
  }

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.success) {
    const code = json?.error?.code || `HTTP_${res.status}`;
    let message = json?.error?.message;

    if (code === 'NOTHING_HEARD') {
      message = "Sorry, I didn't catch that";
    } else if (code === 'RATE_LIMITED') {
      const retryAfter = json?.error?.details?.retryAfterS;
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
    }

    const err: any = new Error(message || 'Failed to process question');
    err.code = code;
    err.status = res.status;
    err.details = json?.error?.details;
    throw err;
  }

  return json.data as AskResult;
}
