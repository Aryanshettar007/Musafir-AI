import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  BackHandler,
  Dimensions,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import MapView from 'react-native-maps';
import { File } from 'expo-file-system';
import * as Location from 'expo-location';
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  getTrip,
  postListens,
  Trip,
  TripItem,
  ListenEvent,
  saveOfflineTrip,
  loadOfflineTrip,
  savePendingListens,
  loadPendingListens,
  clearPendingListens,
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
import { PermissionModal } from '@/components/permission-modal';
import { ReportModal, ReportTargetInfo } from '@/components/trip/report-modal';
import { submitContentReport, CreateReportPayload } from '@/services/report-service';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const MIN_SHEET_HEIGHT = 160;
const COLLAPSED_SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.40, 320);
const EXPANDED_SHEET_HEIGHT = Math.min(SCREEN_HEIGHT * 0.82, 680);
// Testing and demos: any ready story can be played from its map pin, before the car reaches its geofence.
const UNLOCK_ALL_STORIES = process.env.EXPO_PUBLIC_UNLOCK_ALL_STORIES === 'true';

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
  const livePlayer = useAudioPlayer('');
  const livePlayerStatus = useAudioPlayerStatus(livePlayer);
  const listenQueueRef = useRef<ListenEvent[]>([]);
  const listenFlushTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const locationSubscription = useRef<Location.LocationSubscription | null>(null);

  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [downloads, setDownloads] = useState<DownloadState>({});
  const [played, setPlayed] = useState<PlayedSet>({});
  const [playingItem, setPlayingItem] = useState<TripItem | null>(null);
  const [lastPlayedItem, setLastPlayedItem] = useState<TripItem | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [queue, setQueue] = useState<string[]>([]);
  const audioQueueRef = useRef<TripAudioQueue>(new TripAudioQueue());
  const [polylineCoords, setPolylineCoords] = useState<{ latitude: number; longitude: number }[]>([]);
  const [, setDownloadedBytes] = useState(0);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [showBgLocationModal, setShowBgLocationModal] = useState(false);
  // Temporary developer fake GPS and faster audio (commented out)
  // const [isSimulating, setIsSimulating] = useState(false);
  // const isSimulatingRef = useRef(false);
  // const [audioMultiplier, setAudioMultiplier] = useState<number>(1);
  // const audioMultiplierRef = useRef(1);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Audio scrubbing and playback position
  const [currentPosition, setCurrentPosition] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  // Auto-end session when destination reached
  const hasDepartedForDestRef = useRef(false);
  const hasEndedSessionRef = useRef(false);

  // Audio system music interruption preference (false = duckOthers, true = doNotMix, defaults to true)
  const [pauseSystemMusic, setPauseSystemMusic] = useState(true);
  const pauseSystemMusicRef = useRef(true);

  // ─── Live Mode State & Player Synchronization ─────────────────────────────
  const [liveTranscript, setLiveTranscript] = useState<{ question?: string; answerText: string; audioUri?: string } | null>(null);
  const [isLivePlaying, setIsLivePlaying] = useState(false);
  const wasPlayingStoryRef = useRef(false);
  const liveDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const livePlaybackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── AI Moderation / Reporting State (Apple Guideline 1.2 & Google Play GenAI) ───
  const [reportTarget, setReportTarget] = useState<ReportTargetInfo | null>(null);
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);

  const handleOpenStoryReport = useCallback(
    (item?: TripItem | null) => {
      const firstAudioItem =
        trip?.items?.find((i) => i.status === 'ready' && i.audio?.url) ||
        trip?.items?.find((i) => i.audio?.url) ||
        trip?.items?.[0];
      const targetItem = item || playingItem || lastPlayedItem || firstAudioItem;
      setReportTarget({
        tripId: typeof tripId === 'string' ? tripId : undefined,
        itemId: targetItem?.id,
        itemTitle: targetItem?.title || 'Trip Audio Narration',
        transcriptSnippet: targetItem?.transcript,
        audioUrl: targetItem?.audio?.url,
        contentType: 'story',
      });
    },
    [tripId, trip?.items, playingItem, lastPlayedItem]
  );

  const handleOpenLiveTranscriptReport = useCallback(
    (data: { question?: string; answerText: string; audioUri?: string }) => {
      setReportTarget({
        tripId: typeof tripId === 'string' ? tripId : undefined,
        itemTitle: data.question ? `Q: ${data.question}` : 'Live Voice Answer',
        transcriptSnippet: data.answerText,
        audioUrl: data.audioUri || liveTranscript?.audioUri,
        contentType: 'live_qa',
      });
    },
    [tripId, liveTranscript]
  );

  const handleSubmitReport = useCallback(
    async (payload: CreateReportPayload) => {
      setIsSubmittingReport(true);
      try {
        await submitContentReport(payload);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert(
          'Report Submitted',
          'Thank you for reporting this content. Musafir AI maintains zero tolerance for objectionable material and our moderation team will review this report promptly.',
          [{ text: 'OK' }]
        );
        setReportTarget(null);
      } catch (err: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert(
          'Report Failed',
          err?.message ||
            'Unable to submit your report right now. Please check your connection and try again.',
          [{ text: 'OK' }]
        );
      } finally {
        setIsSubmittingReport(false);
      }
    },
    []
  );

  const handleLivePlaybackFinished = useCallback(() => {
    if (livePlaybackTimeoutRef.current) {
      clearTimeout(livePlaybackTimeoutRef.current);
      livePlaybackTimeoutRef.current = null;
    }
    setIsLivePlaying(false);

    // Resume interrupted story if one was playing before the live question
    if (wasPlayingStoryRef.current) {
      audioQueueRef.current.resume();
      wasPlayingStoryRef.current = false;
    } else {
      setIsAudioActiveAsync(false).catch(() => {});
    }

    // Auto-dismiss the temporary transcript card after reading grace period (3.5s)
    if (liveDismissTimerRef.current) clearTimeout(liveDismissTimerRef.current);
    liveDismissTimerRef.current = setTimeout(() => {
      setLiveTranscript(null);
    }, 3500);
  }, []);

  useEffect(() => {
    if (isLivePlaying && livePlayerStatus.didJustFinish) {
      handleLivePlaybackFinished();
    }
  }, [isLivePlaying, livePlayerStatus.didJustFinish, handleLivePlaybackFinished]);

  const handleLiveRecordingStart = useCallback(() => {
    // Duck / pause currently playing story during voice question
    if (isPlaying && !isPaused) {
      wasPlayingStoryRef.current = true;
      audioQueueRef.current.pause();
    }
    if (liveDismissTimerRef.current) {
      clearTimeout(liveDismissTimerRef.current);
      liveDismissTimerRef.current = null;
    }
  }, [isPlaying, isPaused]);

  const handleLiveResponse = useCallback(
    async (data: { transcript: string; answerText: string; audioUri: string; durationS: number }) => {
      // Ensure story is paused while Musafir answers
      if (isPlaying && !isPaused) {
        wasPlayingStoryRef.current = true;
        audioQueueRef.current.pause();
      }

      if (liveDismissTimerRef.current) {
        clearTimeout(liveDismissTimerRef.current);
        liveDismissTimerRef.current = null;
      }

      setLiveTranscript({
        question: data.transcript,
        answerText: data.answerText,
        audioUri: data.audioUri,
      });
      setIsLivePlaying(true);

      // Play spoken answer
      try {
        await setAudioModeAsync({
          allowsRecording: false,
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: pauseSystemMusicRef.current ? 'doNotMix' : 'duckOthers',
        }).catch(() => {});
        await setIsAudioActiveAsync(true).catch(() => {});
        livePlayer.replace({ uri: data.audioUri });
        livePlayer.play();
      } catch (err) {
        console.warn('Error playing live response audio:', err);
      }

      // Resilient fallback duration timeout in case player status didJustFinish is delayed
      if (livePlaybackTimeoutRef.current) clearTimeout(livePlaybackTimeoutRef.current);
      const fallbackMs = Math.max(3000, (data.durationS || 4) * 1000 + 1200);
      livePlaybackTimeoutRef.current = setTimeout(() => {
        handleLivePlaybackFinished();
      }, fallbackMs);
    },
    [isPlaying, isPaused, livePlayer, handleLivePlaybackFinished]
  );

  useEffect(() => {
    return () => {
      if (liveDismissTimerRef.current) clearTimeout(liveDismissTimerRef.current);
      if (livePlaybackTimeoutRef.current) clearTimeout(livePlaybackTimeoutRef.current);
      try {
        livePlayer.pause();
      } catch {}
    };
  }, [livePlayer]);

  useEffect(() => {
    if (!isPlaying || isPaused) return;
    const interval = setInterval(() => {
      try {
        if (player) {
          if (typeof (player as any).currentTime === 'number') {
            setCurrentPosition((player as any).currentTime);
          }
          if (typeof (player as any).duration === 'number' && (player as any).duration > 0) {
            setAudioDuration((player as any).duration);
          }
        }
      } catch {}
    }, 250);
    return () => clearInterval(interval);
  }, [isPlaying, isPaused, player]);

  useEffect(() => {
    setCurrentPosition(0);
    setAudioDuration(playingItem?.audio?.durationS ?? 0);
  }, [playingItem?.id]);

  const handleSeek = useCallback(
    (seconds: number) => {
      try {
        if (player && typeof (player as any).seekTo === 'function') {
          (player as any).seekTo(seconds);
          setCurrentPosition(seconds);
        }
      } catch (err) {
        console.warn('Error seeking player:', err);
      }
    },
    [player]
  );

  // Temporary developer simulation & fast-audio playback effects (commented out)
  // useEffect(() => {
  //   isSimulatingRef.current = isSimulating;
  // }, [isSimulating]);
  // useEffect(() => {
  //   audioMultiplierRef.current = audioMultiplier;
  //   audioQueueRef.current.setAudioMultiplier(audioMultiplier);
  // }, [audioMultiplier]);

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

  // ─── Configure background playback & audio interruption mode ───────────────
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('@musafir_pause_system_music');
        const shouldPause = stored === null ? true : stored === 'true';
        setPauseSystemMusic(shouldPause);
        pauseSystemMusicRef.current = shouldPause;
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: shouldPause ? 'doNotMix' : 'duckOthers',
        });
      } catch (err) {
        console.warn('Error configuring audio mode settings:', err);
      }
    })();
  }, []);

  const handleTogglePauseSystemMusic = useCallback(
    async (value: boolean) => {
      setPauseSystemMusic(value);
      pauseSystemMusicRef.current = value;
      try {
        await AsyncStorage.setItem('@musafir_pause_system_music', value ? 'true' : 'false');
        // Deactivate first so iOS AVFoundation flushes previous category options
        await setIsAudioActiveAsync(false).catch(() => {});
        await setAudioModeAsync({
          playsInSilentMode: true,
          shouldPlayInBackground: true,
          interruptionMode: value ? 'doNotMix' : 'duckOthers',
        });
        if (isPlaying) {
          await setIsAudioActiveAsync(true).catch(() => {});
        }
      } catch (err) {
        console.warn('Error updating audio interruption preference:', err);
      }
    },
    [isPlaying]
  );

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
      const ev: ListenEvent = {
        id: Crypto.randomUUID(),
        tripId,
        itemId,
        event,
        at: new Date().toISOString(),
      };
      listenQueueRef.current.push(ev);
      // Persist offline events to storage so they survive app closures
      savePendingListens(listenQueueRef.current);
    },
    [tripId]
  );

  const flushListens = useCallback(async () => {
    if (listenQueueRef.current.length === 0) return;
    const batch = [...listenQueueRef.current];
    listenQueueRef.current = [];
    try {
      await postListens(batch);
      await clearPendingListens();
    } catch {
      // Re-queue and persist to disk for next online attempt
      listenQueueRef.current = [...batch, ...listenQueueRef.current];
      await savePendingListens(listenQueueRef.current);
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
      onPlayItem: async (item: TripItem) => {
        try {
          let playUri: string | null = null;
          if (Platform.OS === 'web') {
            playUri = item.audio?.url || null;
          } else {
            const file = localFile(item.id);
            if (file && file.exists) {
              playUri = file.uri;
            } else if (item.audio?.url) {
              playUri = item.audio.url;
            }
          }

          if (!playUri) {
            throw new Error('Audio file not ready');
          }
          await setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: pauseSystemMusicRef.current ? 'doNotMix' : 'duckOthers',
          }).catch(() => {});
          await setIsAudioActiveAsync(true).catch(() => {});
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          player.replace({ uri: playUri });
          try {
            if (typeof (player as any).setPlaybackRate === 'function') {
              (player as any).setPlaybackRate(1);
            } else {
              player.playbackRate = 1;
            }
          } catch {}
          player.play();
        } catch (err) {
          console.warn('[TripAudioQueue] Error playing item:', err);
        }
      },
      onPauseItem: () => {
        try {
          if (player) {
            player.pause();
          }
        } catch (err) {
          console.warn('[TripAudioQueue] Error pausing item:', err);
        }
        setIsAudioActiveAsync(false).catch(() => {});
      },
      onResumeItem: async () => {
        try {
          await setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: true,
            interruptionMode: pauseSystemMusicRef.current ? 'doNotMix' : 'duckOthers',
          }).catch(() => {});
          await setIsAudioActiveAsync(true).catch(() => {});
          if (player) {
            player.play();
          }
        } catch (err) {
          console.warn('[TripAudioQueue] Error resuming item:', err);
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
        setIsAudioActiveAsync(false).catch(() => {});
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
      setLastPlayedItem(state.lastPlayedItem);
      setIsPlaying(state.isPlaying);
      setIsPaused(state.isPaused);
    });
    return unsub;
  }, []);

  // Update items in audio queue, seed initial first audio item, and start background geofencing when trip updates
  useEffect(() => {
    if (trip?.items && trip.items.length > 0) {
      audioQueueRef.current.setItems(trip.items);
      const firstAudioItem =
        trip.items.find((i) => i.status === 'ready' && i.audio?.url) ||
        trip.items.find((i) => i.audio?.url) ||
        trip.items[0];
      if (firstAudioItem) {
        audioQueueRef.current.setInitialItem(firstAudioItem);
      }
      (async () => {
        try {
          const fg = await Location.getForegroundPermissionsAsync();
          const bg = await Location.getBackgroundPermissionsAsync();
          if (fg.status === 'granted' && bg.status === 'granted') {
            startBackgroundGeofencing(trip.items);
          }
        } catch {}
      })();
    }
  }, [trip?.items]);

  const handleLocationUpdateRef = useRef<((coords: { latitude: number; longitude: number }) => void) | null>(null);

  // Subscribe to background geofence & background location events
  useEffect(() => {
    const unsubGeofence = subscribeToGeofence((itemId) => {
      if (Platform.OS === 'web') {
        audioQueueRef.current.enqueue(itemId);
        return;
      }
      const file = localFile(itemId);
      if (file && file.exists) {
        audioQueueRef.current.enqueue(itemId);
      }
    });

    const unsubBgLoc = subscribeToBackgroundLocation((coords) => {
      handleLocationUpdateRef.current?.(coords);
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

  // ─── Download an item's audio ──────────────────────────────────────────────
  const downloadItem = useCallback(
    async (item: TripItem, tripData: Trip) => {
      if (!item.audio?.url) return;

      // On Web, audio is streamed directly from remote URL; no offline file caching
      if (Platform.OS === 'web') {
        setDownloads((prev) => ({ ...prev, [item.id]: 'ready' }));
        setDownloadedBytes((b) => b + (item.audio?.bytes ?? 0));
        return;
      }

      const file = localFile(item.id);
      if (!file) return;

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
        // Ensure trip JSON is also persisted alongside downloaded audio
        await saveOfflineTrip(tripData);
      } catch (err: any) {
        if (err?.message?.includes('403') || err?.message?.includes('UnableToDownload')) {
          try {
            const fresh = await getTrip(tripData.id);
            const freshItem = fresh.items.find((i) => i.id === item.id);
            if (freshItem?.audio?.url) {
              await File.downloadFileAsync(freshItem.audio.url, file, { idempotent: true });
              setDownloads((prev) => ({ ...prev, [item.id]: 'ready' }));
              setDownloadedBytes((b) => b + (item.audio?.bytes ?? 0));
              await saveOfflineTrip(fresh);
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

  // ─── Initial offline hydration & restore pending listens ─────────────────
  useEffect(() => {
    let isMounted = true;
    (async () => {
      // 1. Restore any unsent offline listens
      try {
        const pending = await loadPendingListens();
        if (pending.length > 0 && isMounted) {
          listenQueueRef.current = [...pending, ...listenQueueRef.current];
        }
      } catch {}

      // 2. Pre-load offline trip immediately for instantaneous zero-network startup
      if (tripId && Platform.OS !== 'web') {
        try {
          const cached = await loadOfflineTrip(tripId);
          if (cached && isMounted) {
            setTrip((current) => current || cached);
            if (cached.route?.polyline) {
              setPolylineCoords(decodePolyline(cached.route.polyline));
            }
            for (const item of cached.items) {
              const file = localFile(item.id);
              if (file && file.exists) {
                setDownloads((prev) => ({ ...prev, [item.id]: 'ready' }));
              }
            }
          }
        } catch {}
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [tripId]);

  // ─── Poll trip ──────────────────────────────────────────────────────────────
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTrip = useCallback(async () => {
    if (!tripId) return;
    try {
      const data = await getTrip(tripId);
      setTrip(data);
      setIsOffline(false);
      setError(null);

      // Persist trip JSON to local storage for zero-network playback (native only)
      if (Platform.OS !== 'web') {
        await saveOfflineTrip(data);
      }

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
      if (Platform.OS !== 'web') {
        // Zero-network fallback: Load from device storage
        const offline = await loadOfflineTrip(tripId);
        if (offline) {
          setTrip(offline);
          setIsOffline(true);
          setError(null);
          if (offline.route?.polyline) {
            setPolylineCoords(decodePolyline(offline.route.polyline));
          }
          for (const item of offline.items) {
            const file = localFile(item.id);
            if (file && file.exists) {
              setDownloads((prev) => ({ ...prev, [item.id]: 'ready' }));
            }
          }
          if (offline.status !== 'building' && pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          return;
        }
      }
      console.warn('[Trip] Transient error polling trip:', e?.message);
      if (!trip) {
        setError(e?.message ?? 'Failed to load trip');
      }
    }
  }, [tripId, downloadItem]);

  useEffect(() => {
    fetchTrip();
    pollRef.current = setInterval(fetchTrip, 4000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchTrip]);

  // ─── Exit session action ───
  const exitTrip = useCallback(() => {
    if (hasEndedSessionRef.current) return;
    hasEndedSessionRef.current = true;
    try {
      player.pause();
    } catch {}
    audioQueueRef.current.stop();
    stopBackgroundGeofencing();
    locationSubscription.current?.remove();
    locationSubscription.current = null;
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    flushListens().catch(() => {});
    try {
      setIsAudioActiveAsync(false);
    } catch {}
    router.replace('/(tabs)');
  }, [player, router, flushListens]);

  // ─── Location & Geofencing handler (used by both real GPS and Simulator) ─
  const handleLocationUpdate = useCallback(
    (coords: { latitude: number; longitude: number }) => {
      setUserLocation(coords);

      if (!trip) return;

      // ─── Auto-end session when destination is reached ───
      const destLat =
        trip.destination.lat ??
        (polylineCoords.length > 0 ? polylineCoords[polylineCoords.length - 1].latitude : null);
      const destLng =
        trip.destination.lng ??
        (polylineCoords.length > 0 ? polylineCoords[polylineCoords.length - 1].longitude : null);

      if (destLat != null && destLng != null && !hasEndedSessionRef.current) {
        const distToDest = haversineDistanceM(coords.latitude, coords.longitude, destLat, destLng);

        // Determine span of route to calibrate departure threshold
        const originLat =
          trip.origin.lat ?? (polylineCoords.length > 0 ? polylineCoords[0].latitude : null);
        const originLng =
          trip.origin.lng ?? (polylineCoords.length > 0 ? polylineCoords[0].longitude : null);
        const totalTripSpan =
          originLat != null && originLng != null
            ? haversineDistanceM(originLat, originLng, destLat, destLng)
            : 1000;

        const departureThreshold = Math.min(200, Math.max(80, totalTripSpan * 0.4));
        const arrivalThreshold = 100; // 100 meters to destination

        if (distToDest > departureThreshold) {
          hasDepartedForDestRef.current = true;
        } else if (distToDest <= arrivalThreshold && hasDepartedForDestRef.current) {
          hasEndedSessionRef.current = true;
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          if (Platform.OS === 'web') {
            if (typeof window !== 'undefined' && typeof window.alert === 'function') {
              window.alert('Destination Reached! You have arrived at your destination.');
            }
            exitTrip();
          } else {
            Alert.alert(
              'Destination Reached',
              'You have arrived at your destination! Your trip session has ended.',
              [{ text: 'OK' }]
            );
            exitTrip();
          }
          return;
        }
      }

      if (!trip.items) return;
      for (const item of trip.items) {
        if (!item.trigger || item.status !== 'ready') continue;
        if (Platform.OS !== 'web') {
          const file = localFile(item.id);
          if (!file || !file.exists) continue;
        }
        const dist = haversineDistanceM(coords.latitude, coords.longitude, item.trigger.lat, item.trigger.lng);
        if (dist <= item.trigger.radiusM) {
          audioQueueRef.current.enqueue(item.id);
        }
      }
    },
    [trip, polylineCoords, exitTrip]
  );
  handleLocationUpdateRef.current = handleLocationUpdate;

  const startLocationWatcher = useCallback(async () => {
    try {
      const current = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      if (current) {
        handleLocationUpdate({
          latitude: current.coords.latitude,
          longitude: current.coords.longitude,
        });
      }

      locationSubscription.current?.remove();
      locationSubscription.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: 15 },
        (loc) => {
          handleLocationUpdate({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        }
      );
    } catch (err) {
      console.warn('Location tracking error:', err);
    }
  }, [handleLocationUpdate]);

  const checkBackgroundPermission = useCallback(async () => {
    if (Platform.OS === 'web') return;
    try {
      const { status } = await Location.getBackgroundPermissionsAsync();
      if (status !== 'granted') {
        setShowBgLocationModal(true);
      } else if (trip?.items && trip.items.length > 0) {
        startBackgroundGeofencing(trip.items);
      }
    } catch {
      // Background location might not be supported (e.g. Expo Go or simulator)
    }
  }, [trip?.items]);

  const handleConfirmLocationPermission = useCallback(async () => {
    setShowLocationModal(false);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        await startLocationWatcher();
        await checkBackgroundPermission();
      }
    } catch (err) {
      console.warn('Error requesting foreground location permission:', err);
    }
  }, [checkBackgroundPermission, startLocationWatcher]);

  const handleConfirmBgLocationPermission = useCallback(async () => {
    setShowBgLocationModal(false);
    try {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      if (status === 'granted' && trip?.items && trip.items.length > 0) {
        startBackgroundGeofencing(trip.items);
      }
    } catch (err) {
      console.warn('Error requesting background location permission:', err);
    }
  }, [trip?.items]);

  const handleResetToGPS = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        setShowLocationModal(true);
        return;
      }
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
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') {
          setShowLocationModal(true);
          return;
        }

        await startLocationWatcher();
        await checkBackgroundPermission();
      } catch (err) {
        console.warn('Location tracking error:', err);
      }
    })();

    return () => {
      locationSubscription.current?.remove();
    };
  }, [checkBackgroundPermission, startLocationWatcher]);

  // ─── Fit map to route ──────────────────────────────────────────────────────
  useEffect(() => {
    if (polylineCoords.length > 1 && mapRef.current) {
      mapRef.current.fitToCoordinates(polylineCoords, {
        edgePadding: { top: 60, right: 40, bottom: 40, left: 40 },
        animated: true,
      });
    }
  }, [polylineCoords]);


  // ─── Toggle Play / Pause Handler ──────────────────────────────────────────
  const handleTogglePlayPause = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isLivePlaying) {
      if (livePlayer.playing) {
        livePlayer.pause();
      } else {
        livePlayer.play();
      }
      return;
    }

    if (!trip) return;
    const firstAudio =
      trip.items.find((i) => i.status === 'ready' && i.audio?.url) ||
      trip.items.find((i) => i.audio?.url) ||
      trip.items[0];
    const targetId = playingItem?.id || lastPlayedItem?.id || firstAudio?.id;
    if (targetId) {
      audioQueueRef.current.togglePlayPause(targetId);
    }
  }, [isLivePlaying, livePlayer, trip, playingItem?.id, lastPlayedItem?.id]);

  // ─── Web Keyboard Shortcut: Space bar to toggle Play / Pause ──────────────
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ' || e.keyCode === 32) {
        // Do not intercept if user is typing in an input, textarea or contentEditable element
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        const isEditable =
          activeTag === 'input' ||
          activeTag === 'textarea' ||
          (document.activeElement as HTMLElement)?.isContentEditable;

        if (isEditable) return;

        // Prevent default browser scrolling when Space bar is pressed
        e.preventDefault();
        handleTogglePlayPause();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleTogglePlayPause]);

  // Ensure audio focus is cleanly released if screen unmounts
  useEffect(() => {
    return () => {
      try {
        setIsAudioActiveAsync(false);
      } catch {}
    };
  }, []);

  const handleExitSession = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'web') {
      const confirmed =
        typeof window !== 'undefined' && typeof window.confirm === 'function'
          ? window.confirm('Are you sure you want to exit this trip session?')
          : true;
      if (confirmed) {
        exitTrip();
      }
      return;
    }

    Alert.alert(
      'Exit Session',
      'Are you sure you want to exit this trip session?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Exit Session',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            exitTrip();
          },
        },
      ]
    );
  }, [exitTrip]);

  // Intercept hardware back button so users can only exit via 'Exit Session'
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      handleExitSession();
      return true;
    });
    return () => subscription.remove();
  }, [handleExitSession]);

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
      <Stack.Screen options={{ gestureEnabled: false, headerShown: false }} />

      {/* ── OFFLINE STATUS BADGE ── */}
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Ionicons name="cloud-offline" size={13} color="#FFF" />
          <Text style={styles.offlineBannerText}>Offline Mode · Playing from device storage</Text>
        </View>
      )}

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
        onRecenter={handleRecenter}
        // Temporary developer fake GPS & faster audio (commented out)
        // isSimulating={isSimulating}
        // onToggleSimulate={() => setIsSimulating((v) => !v)}
        // onSimLocationUpdate={handleLocationUpdate}
        // onResetToGPS={handleResetToGPS}
        // audioMultiplier={audioMultiplier}
        // onAudioMultiplierChange={setAudioMultiplier}
        items={trip.items}
        playingItem={playingItem}
        isPlaying={isPlaying}
        isPaused={isPaused}
        played={played}
        playingItemTitle={playingItem?.title}
        polylineCoords={polylineCoords}
        liveTranscript={liveTranscript}
        isLivePlaying={isLivePlaying}
        onDismissLiveTranscript={() => setLiveTranscript(null)}
        onReportLiveTranscript={handleOpenLiveTranscriptReport}
        onPlayItem={UNLOCK_ALL_STORIES ? (item) => audioQueueRef.current.playNow(item.id) : undefined}
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
        playingItem={playingItem}
        lastPlayedItem={lastPlayedItem}
        isPlaying={isPlaying}
        isPaused={isPaused}
        currentTime={currentPosition}
        duration={
          audioDuration > 0
            ? audioDuration
            : (playingItem?.audio?.durationS ??
               lastPlayedItem?.audio?.durationS ??
               trip.items.find((i) => i.audio?.durationS)?.audio?.durationS ??
               0)
        }
        onSeek={handleSeek}
        onTogglePlayPause={handleTogglePlayPause}
        onStopPlaying={() => {
          audioQueueRef.current.stop();
        }}
        queue={queue}
        onSkipPlaying={() => {
          audioQueueRef.current.skip();
        }}
        downloads={downloads}
        played={played}
        onExitSession={handleExitSession}
        userLocation={userLocation}
        onLiveRecordingStart={handleLiveRecordingStart}
        onLiveResponse={handleLiveResponse}
        isLivePlaying={isLivePlaying}
        onReportContent={handleOpenStoryReport}
        pauseSystemMusic={pauseSystemMusic}
        onTogglePauseSystemMusic={handleTogglePauseSystemMusic}
      />

      {/* FOREGROUND LOCATION PERMISSION MODAL */}
      <PermissionModal
        visible={showLocationModal}
        type="location"
        onConfirm={handleConfirmLocationPermission}
        onDismiss={() => setShowLocationModal(false)}
      />

      {/* BACKGROUND LOCATION PERMISSION MODAL */}
      <PermissionModal
        visible={showBgLocationModal}
        type="backgroundLocation"
        onConfirm={handleConfirmBgLocationPermission}
        onDismiss={() => setShowBgLocationModal(false)}
      />

      {/* AI CONTENT MODERATION / REPORTING MODAL (Apple Guideline 1.2 & Google Play GenAI) */}
      <ReportModal
        visible={Boolean(reportTarget)}
        target={reportTarget}
        isSubmitting={isSubmittingReport}
        onSubmit={handleSubmitReport}
        onDismiss={() => setReportTarget(null)}
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
  offlineBanner: {
    position: 'absolute',
    top: 52,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(28, 28, 30, 0.92)',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    zIndex: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 6,
  },
  offlineBannerText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
