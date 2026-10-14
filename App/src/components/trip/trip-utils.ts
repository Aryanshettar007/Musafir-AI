import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';

export interface DownloadState {
  [itemId: string]: 'idle' | 'downloading' | 'ready' | 'error';
}

export interface PlayedSet {
  [itemId: string]: boolean;
}

export interface SplitPolyline {
  traveledCoords: { latitude: number; longitude: number }[];
  remainingCoords: { latitude: number; longitude: number }[];
}

export function haversineDistanceM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

export function formatDuration(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${(s / 3600).toFixed(1)} h`;
}

export function formatAudioDuration(s: number): string {
  if (!s || isNaN(s) || s <= 0) return '0s';
  const totalSecs = Math.round(s);
  const hrs = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  if (hrs > 0) {
    if (mins === 0 && secs === 0) return `${hrs} h`;
    if (secs === 0) return `${hrs} h ${mins} min`;
    return `${hrs} h ${mins} min ${secs}s`;
  }

  if (mins === 0) return `${secs}s`;
  if (secs === 0) return `${mins} min`;
  return `${mins} min ${secs}s`;
}

export function formatBytes(b: number): string {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export function localFile(itemId: string): File | null {
  if (Platform.OS === 'web' || !Paths?.document) return null;
  try {
    return new File(Paths.document, `musafir_audio_${itemId}.mp3`);
  } catch {
    return null;
  }
}

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

export function splitRouteAtUserLocation(
  points: { latitude: number; longitude: number }[],
  userLoc: { latitude: number; longitude: number }
): SplitPolyline {
  if (points.length < 2) {
    return { traveledCoords: [], remainingCoords: points };
  }

  let bestDist = Infinity;
  let bestSegIndex = 0;
  let bestProj = points[0];

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];

    const dx = b.longitude - a.longitude;
    const dy = b.latitude - a.latitude;
    const lenSq = dx * dx + dy * dy;

    let t = 0;
    if (lenSq > 0) {
      t = ((userLoc.longitude - a.longitude) * dx + (userLoc.latitude - a.latitude) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));
    }

    const proj = {
      latitude: a.latitude + t * dy,
      longitude: a.longitude + t * dx,
    };

    const d = haversineDistanceM(userLoc.latitude, userLoc.longitude, proj.latitude, proj.longitude);
    if (d < bestDist) {
      bestDist = d;
      bestSegIndex = i;
      bestProj = proj;
    }
  }

  // If closest point is near the start of the first segment (within 25m of origin)
  if (
    bestSegIndex === 0 &&
    haversineDistanceM(points[0].latitude, points[0].longitude, bestProj.latitude, bestProj.longitude) < 25
  ) {
    return { traveledCoords: [], remainingCoords: points };
  }

  const traveledCoords = [...points.slice(0, bestSegIndex + 1), bestProj];
  const remainingCoords = [bestProj, ...points.slice(bestSegIndex + 1)];

  return { traveledCoords, remainingCoords };
}

export const itemTypeLabel: Record<string, string> = {
  'trip-intro': '🗺️ Intro',
  story: '📖 Story',
  food: '🍽️ Food',
  'town-welcome': '🏘️ Town',
  episode: '🎙️ Episode',
  'long-form': '📚 Deep Dive',
  sponsored: '⭐ Sponsored',
};

export const sideIcon = (side: string): string => {
  if (side === 'left') return '←';
  if (side === 'right') return '→';
  return '';
};
