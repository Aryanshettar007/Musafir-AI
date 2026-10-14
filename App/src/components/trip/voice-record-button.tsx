import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Pressable,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';

import { askMusafir, AskHistoryTurn } from '@/services/trip-service';

export interface LiveResponseData {
  transcript: string;
  answerText: string;
  audioUri: string;
  durationS: number;
}

export interface VoiceRecordButtonProps {
  colors?: {
    surface?: string;
    surface2?: string;
    border?: string;
    text?: string;
    accent?: string;
    [key: string]: any;
  };
  isDark?: boolean;
  size?: number;
  tripId?: string;
  userLocation?: { latitude: number; longitude: number } | null;
  fallbackCoords?: { latitude: number; longitude: number } | null;
  onRecordingStart?: () => void;
  onRecordingComplete?: (uri: string | null) => void;
  onLiveResponse?: (data: LiveResponseData) => void;
  onLiveStateChange?: (state: 'idle' | 'recording' | 'loading' | 'playing') => void;
  isExternalLoading?: boolean;
  isExternalPlaying?: boolean;
  disabled?: boolean;
}

const BAR_COUNT = 5;
const BELL_CURVE = [0.55, 0.85, 1.0, 0.85, 0.55];

// Backend enforces MAX_QUESTION_S = 25s (AUDIO_TOO_LONG 422).
// We set client safe ceiling to 22s so network + audio headers never exceed 25s.
const MAX_RECORDING_SECONDS = 22;
const MAX_RECORDING_DURATION_MS = MAX_RECORDING_SECONDS * 1000;

export function VoiceRecordButton({
  colors,
  isDark = true,
  size = 44,
  tripId,
  userLocation,
  fallbackCoords,
  onRecordingStart,
  onRecordingComplete,
  onLiveResponse,
  onLiveStateChange,
  isExternalLoading = false,
  isExternalPlaying = false,
  disabled = false,
}: VoiceRecordButtonProps) {
  // Recorder from expo-audio (high-quality m4a/aac)
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  // States: 'idle' | 'recording' | 'loading' | 'playing'
  const [buttonState, setButtonState] = useState<'idle' | 'recording' | 'loading' | 'playing'>('idle');
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // Refs for tracking recording lifecycle and history turns (in memory only, per Step 6)
  const isRecordingRef = useRef(false);
  const recorderReadyRef = useRef(false);
  const recordStartTimeRef = useRef(0);
  const maxDurationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const historyTurnsRef = useRef<AskHistoryTurn[]>([]);

  // Sync external state changes
  useEffect(() => {
    if (isExternalLoading) {
      setButtonState('loading');
    } else if (isExternalPlaying) {
      setButtonState('playing');
    } else if (buttonState !== 'recording') {
      setButtonState('idle');
    }
  }, [isExternalLoading, isExternalPlaying]);

  useEffect(() => {
    onLiveStateChange?.(buttonState);
  }, [buttonState, onLiveStateChange]);

  // Transitions
  const pressScaleAnim = useRef(new Animated.Value(1)).current;
  const pulseRingAnim = useRef(new Animated.Value(0)).current;
  const micOpacityAnim = useRef(new Animated.Value(1)).current;
  const waveOpacityAnim = useRef(new Animated.Value(0)).current;
  const loadingOpacityAnim = useRef(new Animated.Value(0)).current;
  const playingOpacityAnim = useRef(new Animated.Value(0)).current;

  // 5 Waveform bars
  const barScales = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.24))
  ).current;

  // Loading spinner rotation
  const spinAnim = useRef(new Animated.Value(0)).current;
  const spinLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Playing breathing glow
  const playingPulseAnim = useRef(new Animated.Value(1)).current;
  const playingLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const animationLoopRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wavePhaseRef = useRef(0);

  // ─── Loading Spinner Animation ──────────────────────────────────────────
  useEffect(() => {
    if (buttonState === 'loading') {
      Animated.timing(loadingOpacityAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: true,
      }).start();

      spinAnim.setValue(0);
      spinLoopRef.current = Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 900,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      spinLoopRef.current.start();
    } else {
      Animated.timing(loadingOpacityAnim, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }).start();

      if (spinLoopRef.current) {
        spinLoopRef.current.stop();
        spinLoopRef.current = null;
      }
      spinAnim.setValue(0);
    }
  }, [buttonState, loadingOpacityAnim, spinAnim]);

  // ─── Playing Pulsing Glow Animation ─────────────────────────────────────
  useEffect(() => {
    if (buttonState === 'playing') {
      Animated.timing(playingOpacityAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();

      playingPulseAnim.setValue(1);
      playingLoopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(playingPulseAnim, {
            toValue: 1.18,
            duration: 650,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(playingPulseAnim, {
            toValue: 1,
            duration: 650,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      playingLoopRef.current.start();
    } else {
      Animated.timing(playingOpacityAnim, {
        toValue: 0,
        duration: 120,
        useNativeDriver: true,
      }).start();

      if (playingLoopRef.current) {
        playingLoopRef.current.stop();
        playingLoopRef.current = null;
      }
      playingPulseAnim.setValue(1);
    }
  }, [buttonState, playingOpacityAnim, playingPulseAnim]);

  // ─── Waveform Animation ─────────────────────────────────────────────────
  const startWaveMotion = useCallback(() => {
    wavePhaseRef.current = 0;
    barScales.forEach((scale) => scale.setValue(0.24));

    // Outer aura pulse
    pulseRingAnim.setValue(0);
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseRingAnim, {
          toValue: 1,
          duration: 850,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulseRingAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Rhythmic waveform loop
    if (animationLoopRef.current) {
      clearInterval(animationLoopRef.current);
    }
    animationLoopRef.current = setInterval(() => {
      wavePhaseRef.current += 0.42;

      barScales.forEach((barScale, i) => {
        const phase = wavePhaseRef.current + i * 0.95;
        const sineFactor = (Math.sin(phase) + 1) * 0.5;
        const bell = BELL_CURVE[i];

        const targetScale = Math.max(
          0.22,
          Math.min(1.2, 0.2 + bell * (0.35 + 0.55 * sineFactor))
        );

        Animated.timing(barScale, {
          toValue: targetScale,
          duration: 32,
          useNativeDriver: true,
        }).start();
      });
    }, 34);
  }, [barScales, pulseRingAnim]);

  const stopWaveMotion = useCallback(() => {
    if (animationLoopRef.current) {
      clearInterval(animationLoopRef.current);
      animationLoopRef.current = null;
    }
    pulseRingAnim.stopAnimation();
    pulseRingAnim.setValue(0);
    barScales.forEach((scale) => {
      scale.stopAnimation();
      scale.setValue(0.24);
    });
  }, [barScales, pulseRingAnim]);

  // ─── Reset State Helper ──────────────────────────────────────────────────
  const resetToIdle = useCallback(() => {
    isRecordingRef.current = false;
    recorderReadyRef.current = false;
    setRemainingSeconds(null);

    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    stopWaveMotion();

    Animated.parallel([
      Animated.spring(pressScaleAnim, { toValue: 1, useNativeDriver: true, friction: 6 }),
      Animated.timing(micOpacityAnim, { toValue: 1, duration: 150, useNativeDriver: true }),
      Animated.timing(waveOpacityAnim, { toValue: 0, duration: 100, useNativeDriver: true }),
    ]).start();

    setButtonState('idle');
  }, [micOpacityAnim, pressScaleAnim, stopWaveMotion, waveOpacityAnim]);

  // ─── Stop Recording & Send to Backend (/ask) ─────────────────────────────
  const stopRecordingAndSubmit = useCallback(async () => {
    if (!isRecordingRef.current && buttonState !== 'recording') return;
    isRecordingRef.current = false;

    // Clear timers
    if (maxDurationTimerRef.current) {
      clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setRemainingSeconds(null);

    // IMMEDIATELY enter LOADING state: mic is hidden, wave is stopped, spinner is active
    setButtonState('loading');
    stopWaveMotion();

    Animated.parallel([
      Animated.spring(pressScaleAnim, { toValue: 1, useNativeDriver: true, friction: 6 }),
      Animated.timing(waveOpacityAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
      Animated.timing(loadingOpacityAnim, { toValue: 1, duration: 100, useNativeDriver: true }),
    ]).start();

    try {
      // Ensure recorder finished preparing before stopping
      if (!recorderReadyRef.current) {
        let waited = 0;
        while (!recorderReadyRef.current && waited < 400) {
          await new Promise((r) => setTimeout(r, 40));
          waited += 40;
        }
      }

      await recorder.stop();
      // Brief pause for native AVFoundation audio file to finalize
      await new Promise((resolve) => setTimeout(resolve, 120));

      const recordedUri = recorder.uri;

      // Reset audio session mode to normal playback
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'duckOthers',
      });

      const recordDurationMs = recordStartTimeRef.current ? Date.now() - recordStartTimeRef.current : 0;
      if (recordDurationMs < 350) {
        Alert.alert('Musafir Live', 'Tap once to speak, and tap again when finished.');
        resetToIdle();
        return;
      }

      onRecordingComplete?.(recordedUri);

      if (!recordedUri) {
        resetToIdle();
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Determine GPS location coordinates
      const effectiveLat = userLocation?.latitude ?? fallbackCoords?.latitude ?? 12.9716;
      const effectiveLng = userLocation?.longitude ?? fallbackCoords?.longitude ?? 77.5946;

      // Send to Backend POST /ask
      const result = await askMusafir({
        audioUri: recordedUri,
        lat: effectiveLat,
        lng: effectiveLng,
        tripId: tripId,
        history: historyTurnsRef.current,
      });

      // Update in-memory history turns (last 6 turns as per API spec)
      historyTurnsRef.current = [
        ...historyTurnsRef.current.slice(-5),
        { q: result.transcript, a: result.answerText },
      ];

      // Save audio response base64 to local cache (.mp3) on native, or use data URI on web
      let responseFileUri: string;
      if (Platform.OS === 'web') {
        responseFileUri = `data:audio/mp3;base64,${result.audio.base64}`;
      } else {
        const cacheDir = FileSystem.cacheDirectory?.endsWith('/')
          ? FileSystem.cacheDirectory
          : `${FileSystem.cacheDirectory}/`;
        responseFileUri = `${cacheDir}musafir_live_${Date.now()}.mp3`;

        await FileSystem.writeAsStringAsync(responseFileUri, result.audio.base64, {
          encoding: FileSystem.EncodingType.Base64,
        });
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Set PLAYING State — Button remains disabled during response playback
      setButtonState('playing');

      // Hand off to parent for playback and top-of-map transcript overlay
      onLiveResponse?.({
        transcript: result.transcript,
        answerText: result.answerText,
        audioUri: responseFileUri,
        durationS: result.audio.durationS || 4,
      });
    } catch (err: any) {
      console.warn('[VoiceRecordButton] Live mode error:', err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      const userMessage = err?.message || "Sorry, I didn't catch that. Please try again.";
      Alert.alert('Musafir Live', userMessage);
      resetToIdle();
    }
  }, [
    buttonState,
    fallbackCoords?.latitude,
    fallbackCoords?.longitude,
    loadingOpacityAnim,
    onLiveResponse,
    onRecordingComplete,
    pressScaleAnim,
    recorder,
    resetToIdle,
    stopWaveMotion,
    tripId,
    userLocation?.latitude,
    userLocation?.longitude,
    waveOpacityAnim,
  ]);

  // ─── Start Audio Recording ──────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    // 1. Instantly switch visual state: mic symbol disappears, wave animates
    isRecordingRef.current = true;
    recorderReadyRef.current = false;
    recordStartTimeRef.current = Date.now();
    setButtonState('recording');
    setRemainingSeconds(null);

    Animated.parallel([
      Animated.spring(pressScaleAnim, { toValue: 1.08, useNativeDriver: true, friction: 6 }),
      Animated.timing(micOpacityAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
      Animated.timing(waveOpacityAnim, { toValue: 1, duration: 120, useNativeDriver: true }),
    ]).start();

    startWaveMotion();

    try {
      // 2. Permission check
      const { status } = await getRecordingPermissionsAsync();
      let granted = status === 'granted';
      if (!granted) {
        const perm = await requestRecordingPermissionsAsync();
        granted = perm.granted;
      }
      if (!granted) {
        Alert.alert(
          'Microphone Permission',
          'Please allow microphone access in settings to speak with Musafir.'
        );
        resetToIdle();
        return;
      }

      // 3. Pause/duck active story playback
      onRecordingStart?.();

      // 4. Audio session config for recording
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      // 5. Prepare and begin recording
      await recorder.prepareToRecordAsync();
      recorder.record();
      recorderReadyRef.current = true;

      // 6. Max Duration Safety Timer (22s limit, with respect to backend 25s ceiling)
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = setTimeout(() => {
        if (isRecordingRef.current) {
          stopRecordingAndSubmit();
        }
      }, MAX_RECORDING_DURATION_MS);

      // 7. Periodic timer to update countdown badge in final 5 seconds
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = setInterval(() => {
        if (!isRecordingRef.current) return;
        const elapsedS = Math.floor((Date.now() - recordStartTimeRef.current) / 1000);
        const remS = Math.max(0, MAX_RECORDING_SECONDS - elapsedS);
        if (remS <= 5) {
          setRemainingSeconds(remS);
        }
        if (remS <= 0) {
          stopRecordingAndSubmit();
        }
      }, 500);
    } catch (err) {
      console.warn('[VoiceRecordButton] Error starting recording:', err);
      resetToIdle();
    }
  }, [
    micOpacityAnim,
    onRecordingStart,
    pressScaleAnim,
    recorder,
    resetToIdle,
    startWaveMotion,
    stopRecordingAndSubmit,
    waveOpacityAnim,
  ]);

  // ─── Interaction Handlers (Pure Single-Press Toggle: press to record, press to stop) ─
  const isInteractionDisabled =
    disabled ||
    buttonState === 'loading' ||
    buttonState === 'playing' ||
    isExternalLoading ||
    isExternalPlaying;

  const handlePress = useCallback(() => {
    if (isInteractionDisabled) return;

    if (buttonState === 'recording') {
      // Second press: Stop recording & send to backend immediately
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      stopRecordingAndSubmit();
      return;
    }

    if (buttonState === 'idle') {
      // First press: Start recording & fluid waveform animations immediately
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      startRecording();
    }
  }, [buttonState, isInteractionDisabled, startRecording, stopRecordingAndSubmit]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationLoopRef.current) clearInterval(animationLoopRef.current);
      if (maxDurationTimerRef.current) clearTimeout(maxDurationTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, []);

  const buttonBg =
    buttonState === 'recording'
      ? '#EF4444' // Vibrant recording red
      : buttonState === 'loading'
      ? '#1E293B' // Deep slate while waiting for backend
      : buttonState === 'playing'
      ? '#0F291E' // Emerald dark background during answer
      : isDark
      ? '#0A0A0C'
      : '#000000';

  const borderColor =
    buttonState === 'recording'
      ? '#DC2626'
      : buttonState === 'loading'
      ? '#3B82F6'
      : buttonState === 'playing'
      ? '#34C759'
      : isDark
      ? '#2C2C2E'
      : '#333333';

  const spinRotate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.container, { width: size + 16, height: size + 16 }]}>
      {/* ── Remaining Time Warning Pill (Shown when <= 5s remaining) ── */}
      {buttonState === 'recording' && remainingSeconds != null && remainingSeconds <= 5 && (
        <View style={styles.countdownBadge}>
          <Text style={styles.countdownText}>{remainingSeconds}s</Text>
        </View>
      )}

      {/* ── Outer Live Pulsing Halo Ring (Active only when recording) ── */}
      {buttonState === 'recording' && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulsingRing,
            {
              width: size + 16,
              height: size + 16,
              borderRadius: (size + 16) / 2,
              borderColor: '#EF4444',
              opacity: pulseRingAnim.interpolate({
                inputRange: [0, 0.4, 1],
                outputRange: [0.75, 0.4, 0],
              }),
              transform: [
                {
                  scale: pulseRingAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.92, 1.28],
                  }),
                },
              ],
            },
          ]}
        />
      )}

      {/* ── Outer Loading Rotating Ring (Active only when waiting for server) ── */}
      {buttonState === 'loading' && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.loadingSpinRing,
            {
              width: size + 12,
              height: size + 12,
              borderRadius: (size + 12) / 2,
              borderColor: 'transparent',
              borderTopColor: '#3B82F6',
              borderRightColor: 'rgba(59, 130, 246, 0.4)',
              transform: [{ rotate: spinRotate }],
            },
          ]}
        />
      )}

      {/* ── Outer Playing Breathing Ring (Active only when response audio plays) ── */}
      {buttonState === 'playing' && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.playingBreathingRing,
            {
              width: size + 12,
              height: size + 12,
              borderRadius: (size + 12) / 2,
              borderColor: isDark ? 'rgba(52, 199, 89, 0.45)' : 'rgba(52, 199, 89, 0.35)',
              transform: [{ scale: playingPulseAnim }],
            },
          ]}
        />
      )}

      {/* ── Main Circular Button ── */}
      <Pressable
        onPress={handlePress}
        disabled={isInteractionDisabled}
        hitSlop={15}
        style={styles.pressableArea}>
        <Animated.View
          style={[
            styles.buttonBase,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              backgroundColor: buttonBg,
              borderColor,
              transform: [{ scale: pressScaleAnim }],
              opacity: isInteractionDisabled && buttonState === 'idle' ? 0.45 : 1,
            },
          ]}>
          {/* IDLE: White Mic Icon ONLY when idle */}
          {buttonState === 'idle' && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                styles.centerContent,
                { opacity: micOpacityAnim },
              ]}>
              <Ionicons name="mic" size={size * 0.44} color="#FFFFFF" />
            </Animated.View>
          )}

          {/* ACTIVE RECORDING: Fluid Voice Waveform Bars (Mic symbol is completely gone) */}
          {buttonState === 'recording' && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                styles.waveContainer,
                { opacity: waveOpacityAnim },
              ]}>
              {barScales.map((scaleY, index) => (
                <Animated.View
                  key={`wave_bar_${index}`}
                  style={[
                    styles.waveBar,
                    {
                      transform: [{ scaleY }],
                    },
                  ]}
                />
              ))}
            </Animated.View>
          )}

          {/* LOADING: Crisp Circular Loading Icon (Mic symbol is completely gone) */}
          {buttonState === 'loading' && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                styles.centerContent,
                { opacity: loadingOpacityAnim },
              ]}>
              <ActivityIndicator size="small" color="#FFFFFF" />
            </Animated.View>
          )}

          {/* PLAYING: Spoken Speaker Indicator (Mic symbol is completely gone) */}
          {buttonState === 'playing' && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                styles.centerContent,
                { opacity: playingOpacityAnim },
              ]}>
              <Ionicons name="volume-medium" size={size * 0.44} color="#34C759" />
            </Animated.View>
          )}
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pressableArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonBase: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 6,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulsingRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  loadingSpinRing: {
    position: 'absolute',
    borderWidth: 2,
  },
  playingBreathingRing: {
    position: 'absolute',
    borderWidth: 1.5,
  },
  waveContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  waveBar: {
    width: 3.5,
    height: 22,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 3,
    elevation: 3,
  },
  countdownBadge: {
    position: 'absolute',
    top: -24,
    backgroundColor: 'rgba(239, 68, 68, 0.95)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 5,
  },
  countdownText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
