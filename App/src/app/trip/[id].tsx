import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView from 'react-native-maps';
import { File } from 'expo-file-system';
import * as Location from 'expo-location';
import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getTrip,
  postListens,
  Trip,
  TripItem,
  ListenEvent,
} from '@/services/trip-service';
import {
  DownloadState,
  PlayedSet,
  decodePolyline,
  splitRouteAtUserLocation,
  haversineDistanceM,
  localFile,
} from '@/components/trip/trip-utils';
import { TripMap } from '@/components/trip/trip-map';
import { TripBottomSheet } from '@/components/trip/trip-bottom-sheet';
import { TripAudioQueue } from '@/services/trip-audio-queue';
import {
  startBackgroundGeofencing,
  stopBackgroundGeofencing,
  subscribeToGeofence,
  subscribeToBackgroundLocation,
} from '@/services/geofence-service';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MIN_SHEET_HEIGHT = 160;
const COLLAPSED_SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.40, 320);
const EXPANDED_SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.82, 680);

export default function TripScreen() {
  const { id: tripId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const colors = useMemo(() => ({
    background: isDark ? '#0A0A0B' : '#F2F2F7',
    surface: isDark ? '#1C1C1E' : '#FFFFFF',
    surface2: isDark ? '#2C2C2E' : '#F2F2F7',
    border: isDark ? '#3A3A3C' : '#E5E5EA',
    text: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#8E8E93' : '#6C6C70',
    accent: '#007AFF',
    traveledRoute: isDark ? '#555558' : '#9E9E9E',
    green: '#34C759',
    orange: '#FF9500',
    red: '#FF3B30',
    sponsored: isDark ? '#3A2600' : '#FFF3CD',
    sponsoredBorder: '#FF9500',
  }), [isDark]);

  const mapRef = useRef<MapView>(null);
  const player = useAudioPlayer('');
  const listenQueueRef = useRef<ListenEvent[]>([]);
  const listenFlushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloads, setDownloads] = useState<DownloadState>({});
  const [played, setPlayed] = useState<PlayedSet>({});
  const [playingItem, setPlayingItem] = useState<TripItem | null>(null);
  const [queue, setQueue] = useState<string[]>([]);
  const audioQueueRef = useRef<TripAudioQueue>(new TripAudioQueue());
  const [polylineCoords, setPolylineCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [, setDownloadedBytes] = useState(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const isSimulatingRef = useRef(false);
  const [audioMultiplier, setAudioMultiplier] = useState<number>(2);
  const audioMultiplierRef = useRef(2);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    isSimulatingRef.current = isSimulating;
  }, [isSimulating]);

  useEffect(() => {
    audioMultiplierRef.current = audioMultiplier;
    audioQueueRef.current.setAudioMultiplier(audioMultiplier);
    if (player) {
      try {
        if (typeof (player as any).setPlaybackRate === 'function') {
          (player as any).setPlaybackRate(audioMultiplier);
        } else {
          player.playbackRate = audioMultiplier;
        }
      } catch (err) {
        console.warn('Error setting playback rate:', err);
      }
    }
  }, [player, audioMultiplier]);

  // Split polyline into traveled (greyed-out) and remaining (blue) based on GPS location
  const { traveledCoords, remainingCoords } = useMemo(() => {
    if (!userLocation || polylineCoords.length < 2) {
      return { traveledCoords: [], remainingCoords: polylineCoords };
    }
    return splitRouteAtUserLocation(polylineCoords, userLocation);
  }, [polylineCoords, userLocation]);

  // ─── Draggable Bottom Sheet Animation & PanResponder ──────────────────────
  const sheetHeight = useRef(new Animated.Value(COLLAPSED_SHEET_HEIGHT)).current;
  const currentHeightRef = useRef<number>(COLLAPSED_SHEET_HEIGHT);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 4,
      onPanResponderGrant: () => {
        sheetHeight.stopAnimation((val) => {
          currentHeightRef.current = val;
        });
      },
      onPanResponderMove: (_, gestureState) => {
        const newHeight = currentHeightRef.current - gestureState.dy;
        if (newHeight >= MIN_SHEET_HEIGHT - 30 && newHeight <= EXPANDED_SHEET_HEIGHT + 30) {
          sheetHeight.setValue(newHeight);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const finalHeight = currentHeightRef.current - gestureState.dy;
        let targetHeight = COLLAPSED_SHEET_HEIGHT;

        if (gestureState.vy < -0.5) {
          targetHeight = EXPANDED_SHEET_HEIGHT;
        } else if (gestureState.vy > 0.5) {
          targetHeight = finalHeight < COLLAPSED_SHEET_HEIGHT ? MIN_SHEET_HEIGHT : COLLAPSED_SHEET_HEIGHT;
        } else {
          if (finalHeight > (COLLAPSED_SHEET_HEIGHT + EXPANDED_SHEET_HEIGHT) / 2) {
            targetHeight = EXPANDED_SHEET_HEIGHT;
          } else if (finalHeight < (MIN_SHEET_HEIGHT + COLLAPSED_SHEET_HEIGHT) / 2) {
            targetHeight = MIN_SHEET_HEIGHT;
          } else {
            targetHeight = COLLAPSED_SHEET_HEIGHT;
          }
        }

        Haptics.selectionAsync();
        currentHeightRef.current = targetHeight;
        Animated.spring(sheetHeight, {
          toValue: targetHeight,
          useNativeDriver: false,
          friction: 8,
          tension: 48,
        }).start();
      },
    })
  ).current;

  const toggleSheetExpansion = () => {
    Haptics.selectionAsync();
    const target =
      currentHeightRef.current <= MIN_SHEET_HEIGHT + 30
        ? COLLAPSED_SHEET_HEIGHT
        : currentHeightRef.current >= EXPANDED_SHEET_HEIGHT - 40
        ? MIN_SHEET_HEIGHT
        : EXPANDED_SHEET_HEIGHT;
    currentHeightRef.current = target;
    Animated.spring(sheetHeight, {
      toValue: target,
      useNativeDriver: false,
      friction: 8,
      tension: 48,
    }).start();
  };

  const handleRecenter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (userLocation && mapRef.current) {
      mapRef.current.animateToRegion(
        {
          latitude: userLocation.latitude,
          longitude: userLocation.longitude,
          latitudeDelta: 0.012,
          longitudeDelta: 0.012,
        },
        700
      );
    } else if (polylineCoords.length > 1 && mapRef.current) {
      mapRef.current.fitToCoordinates(polylineCoords, {
        edgePadding: { top: 90, right: 40, bottom: 220, left: 40 },
        animated: true,
      });
    }
  };

  // ─── Configure background playback & audio ducking ─────────────────────────
  useEffect(() => {
    (async () => {
      try {
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: 'duckOthers',
        });
      } catch (err) {
        console.warn('Error setting audio mode:', err);
      }
    })();
  }, []);

  // ─── Pulse animation for building state ────────────────────────────────────
  useEffect(() => {
    if (trip?.status === 'building') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.06, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [trip?.status, pulseAnim]);

  // ─── Queue & flush listen events ───────────────────────────────────────────
  const queueListen = useCallback(
    (itemId: string, event: 'started' | 'completed' | 'skipped') => {
      if (!tripId) return;
      listenQueueRef.current.push({
        id: Crypto.randomUUID(),
        tripId,
        itemId,
        event,
        at: new Date().toISOString(),
      });
    },
    [tripId]
  );

  const flushListens = useCallback(async () => {
    if (listenQueueRef.current.length === 0) return;
    const batch = [...listenQueueRef.current];
    listenQueueRef.current = [];
    try {
      await postListens(batch);
    } catch {
      listenQueueRef.current = [...batch, ...listenQueueRef.current];
    }
  }, []);

  useEffect(() => {
    listenFlushTimer.current = setInterval(flushListens, 60_000);
    return () => {
      if (listenFlushTimer.current) clearInterval(listenFlushTimer.current);
      flushListens();
    };
  }, [flushListens]);

  // ─── Configure Audio Queue callbacks & subscription ───────────────────────
  useEffect(() => {
    audioQueueRef.current.setCallbacks({
      onPlayItem: async (item: TripItem, multiplier: number) => {
        try {
          const file = localFile(item.id);
          if (!file.exists) {
            throw new Error('Audio file not ready');
          }
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          player.replace({ uri: file.uri });
          try {
            if (typeof (player as any).setPlaybackRate === 'function') {
              (player as any).setPlaybackRate(multiplier);
            } else {
              player.playbackRate = multiplier;
            }
          } catch {}
          player.play();
        } catch (err) {
          console.warn('[TripAudioQueue] Error playing item:', err);
        }
      },
      onStopItem: () => {
        try {
          if (player) {
            player.pause();
          }
        } catch (err) {
          // Native shared object may not be initialized or already released
        }
      },
      onListenEvent: (itemId, event) => {
        queueListen(itemId, event);
      },
    });
  }, [player, queueListen]);

  useEffect(() => {
    const unsub = audioQueueRef.current.subscribe((state) => {
      setQueue(state.queue);
      setPlayed(state.played);
      setPlayingItem(state.playingItem);
    });
    return unsub;
  }, []);

  // Update items in audio queue and start background geofencing when trip updates
  useEffect(() => {
    if (trip?.items && trip.items.length > 0) {
      audioQueueRef.current.setItems(trip.items);
      startBackgroundGeofencing(trip.items);
    }
  }, [trip?.items]);

  // Subscribe to background geofence & background location events
  useEffect(() => {
    const unsubGeofence = subscribeToGeofence((itemId) => {
      const file = localFile(itemId);
      if (file.exists) {
        audioQueueRef.current.enqueue(itemId);
      }
    });

    const unsubBgLoc = subscribeToBackgroundLocation((coords) => {
      if (!isSimulatingRef.current) {
        setUserLocation(coords);
      }
    });

    return () => {
      unsubGeofence();
      unsubBgLoc();
    };
  }, []);

  // Cleanup geofences and audio queue on unmount
  useEffect(() => {
    return () => {
      stopBackgroundGeofencing();
      audioQueueRef.current.stop();
    };
  }, []);

  const playItem = useCallback((item: TripItem) => {
    audioQueueRef.current.enqueue(item.id, true);
  }, []);

  // ─── Download an item's audio ──────────────────────────────────────────────
  const downloadItem = useCallback(
    async (item: TripItem, tripData: Trip) => {
      if (!item.audio?.url) return;
      const file = localFile(item.id);

      if (file.exists) {
        setDownloads((prev) => ({ ...prev, [item.id]: 'ready' }));
        setDownloadedBytes((b) => b + (item.audio?.bytes ?? 0));
        return;
      }

      setDownloads((prev) => ({ ...prev, [item.id]: 'downloading' }));
      try {
        await File.downloadFileAsync(item.audio.url, file, { idempotent: true });
        setDownloads((prev) => ({ ...prev, [item.id]: 'ready' }));
        setDownloadedBytes((b) => b + (item.audio?.bytes ?? 0));
      } catch (err: any) {
        if (err?.message?.includes('403') || err?.message?.includes('UnableToDownload')) {
          try {
            const fresh = await getTrip(tripData.id);
            const freshItem = fresh.items.find((i) => i.id === item.id);
            if (freshItem?.audio?.url) {
              await File.downloadFileAsync(freshItem.audio.url, file, { idempotent: true });
              setDownloads((prev) => ({ ...prev, [item.id]: 'ready' }));
              setDownloadedBytes((b) => b + (item.audio?.bytes ?? 0));
              return;
            }
          } catch {
            // fall through
          }
        }
        setDownloads((prev) => ({ ...prev, [item.id]: 'error' }));
      }
    },
    []
  );

  // ─── Poll trip ──────────────────────────────────────────────────────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTrip = useCallback(async () => {
    if (!tripId) return;
    try {
      const data = await getTrip(tripId);
      setTrip(data);

      if (data.route?.polyline) {
        setPolylineCoords(decodePolyline(data.route.polyline));
      }

      // Kick off downloads for newly ready items
      for (const item of data.items) {
        if (item.status === 'ready' && item.audio?.url) {
          setDownloads((prev) => {
            if (prev[item.id]) return prev;
            downloadItem(item, data);
            return { ...prev, [item.id]: 'idle' };
          });
        }
      }

      if (data.status !== 'building' && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load trip');
      if (pollRef.current) clearInterval(pollRef.current);
    }
  }, [tripId, downloadItem]);

  useEffect(() => {
    fetchTrip();
    pollRef.current = setInterval(fetchTrip, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchTrip]);

  // ─── Location & Geofencing handler (used by both real GPS and Simulator) ─
  const handleLocationUpdate = useCallback(
    (coords: { latitude: number; longitude: number }) => {
      setUserLocation(coords);

      if (!trip || !trip.items) return;
      for (const item of trip.items) {
        if (!item.trigger || item.status !== 'ready') continue;
        const file = localFile(item.id);
        if (!file.exists) continue;
        const dist = haversineDistanceM(coords.latitude, coords.longitude, item.trigger.lat, item.trigger.lng);
        if (dist <= item.trigger.radiusM) {
          audioQueueRef.current.enqueue(item.id);
        }
      }
    },
    [trip]
  );

  const handleResetToGPS = useCallback(async () => {
    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (current) {
        handleLocationUpdate({ latitude: current.coords.latitude, longitude: current.coords.longitude });
      }
    } catch (err) {
      console.warn('Error resetting to GPS:', err);
    }
  }, [handleLocationUpdate]);

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (current && !isSimulatingRef.current) {
          handleLocationUpdate({
            latitude: current.coords.latitude,
            longitude: current.coords.longitude,
          });
        }

        locationSubscription.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 15 },
          (loc) => {
            // Only update from real GPS if simulation is not currently running
            if (!isSimulatingRef.current) {
              handleLocationUpdate({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
            }
          }
        );
      } catch (err) {
        console.warn('Location tracking error:', err);
      }
    })();

    return () => {
      locationSubscription.current?.remove();
    };
  }, [handleLocationUpdate]);

  // ─── Fit map to route ──────────────────────────────────────────────────────
  useEffect(() => {
    if (polylineCoords.length > 1 && mapRef.current) {
      mapRef.current.fitToCoordinates(polylineCoords, {
        edgePadding: { top: 60, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }
  }, [polylineCoords]);

  if (error) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <Ionicons name="warning-outline" size={48} color={colors.red} />
        <Text style={[styles.errorTitle, { color: colors.text }]}>Trip Unavailable</Text>
        <Text style={[styles.errorMsg, { color: colors.textSecondary }]}>{error}</Text>
        <Pressable style={[styles.backBtn, { backgroundColor: colors.accent }]} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (!trip) {
    return (
      <SafeAreaView style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading trip…</Text>
      </SafeAreaView>
    );
  }

  const readyItems = trip.items.filter((i) => i.status === 'ready');
  const progressPct =
    trip.progress.total > 0
      ? Math.round((trip.progress.ready / trip.progress.total) * 100)
      : 0;
  const totalDownloadedBytes = trip.items
    .filter((i) => i.status === 'ready' && downloads[i.id] === 'ready')
    .reduce((sum, i) => sum + (i.audio?.bytes ?? 0), 0);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* ── FULL SCREEN MAP & HEADER OVERLAY ── */}
      <TripMap
        mapRef={mapRef}
        trip={trip}
        traveledCoords={traveledCoords}
        remainingCoords={remainingCoords}
        userLocation={userLocation}
        sheetHeight={sheetHeight}
        colors={colors}
        isDark={isDark}
        onBack={() => router.back()}
        onRecenter={handleRecenter}
        isSimulating={isSimulating}
        onToggleSimulate={() => setIsSimulating((v) => !v)}
        items={trip.items}
        isPlaying={!!playingItem}
        playingItemTitle={playingItem?.title}
        onSimLocationUpdate={handleLocationUpdate}
        onResetToGPS={handleResetToGPS}
        polylineCoords={polylineCoords}
        audioMultiplier={audioMultiplier}
        onAudioMultiplierChange={setAudioMultiplier}
      />

      {/* ── DRAGGABLE BOTTOM SHEET ── */}
      <TripBottomSheet
        sheetHeight={sheetHeight}
        panResponder={panResponder}
        toggleSheetExpansion={toggleSheetExpansion}
        trip={trip}
        colors={colors}
        isDark={isDark}
        pulseAnim={pulseAnim}
        readyItems={readyItems}
        progressPct={progressPct}
        totalDownloadedBytes={totalDownloadedBytes}
        playingItem={playingItem}
        showTranscript={showTranscript}
        onToggleTranscript={() => setShowTranscript((v) => !v)}
        onStopPlaying={() => {
          audioQueueRef.current.stop();
        }}
        queue={queue}
        onSkipPlaying={() => {
          audioQueueRef.current.skip();
        }}
        downloads={downloads}
        played={played}
        userLocation={userLocation}
        onPlayItem={playItem}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
  },
  errorMsg: {
    fontSize: 14,
    textAlign: 'center',
  },
  backBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  backBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  loadingText: {
    fontSize: 15,
    marginTop: 12,
  },
});
