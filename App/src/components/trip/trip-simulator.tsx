import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import MapView from 'react-native-maps';
import { TripItem } from '@/services/trip-service';
import { haversineDistanceM } from './trip-utils';

export interface TripSimulatorProps {
  polylineCoords: { latitude: number; longitude: number }[];
  items: TripItem[];
  isPlaying: boolean;
  playingItemTitle?: string;
  onLocationUpdate: (loc: { latitude: number; longitude: number }) => void;
  onResetToGPS: () => void;
  mapRef: React.RefObject<MapView | null>;
  colors: {
    surface: string;
    surface2: string;
    border: string;
    text: string;
    textSecondary: string;
    accent: string;
    green: string;
    orange: string;
    red: string;
    [key: string]: string;
  };
  isDark: boolean;
  isActive: boolean;
  onToggleActive: () => void;
  audioMultiplier: number;
  onAudioMultiplierChange: (mult: number) => void;
}

export function TripSimulator({
  polylineCoords,
  items,
  isPlaying,
  playingItemTitle,
  onLocationUpdate,
  onResetToGPS,
  mapRef,
  colors,
  isDark,
  isActive,
  onToggleActive,
  audioMultiplier,
  onAudioMultiplierChange,
}: TripSimulatorProps) {
  const [isDriving, setIsDriving] = useState(true);
  const [driveMultiplier, setDriveMultiplier] = useState<25 | 40 | 50>(40);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [followMap, setFollowMap] = useState(true);

  const floatIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pulse animation when audio is playing
  const pulseAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (isPlaying) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isPlaying, pulseAnim]);

  // Keep float ref in sync if index reset
  useEffect(() => {
    floatIndexRef.current = currentIndex;
  }, [currentIndex]);

  // ─── Driving Step Engine ────────────────────────────────────────────────
  // While audio is NOT playing: cruise fast at driveMultiplier (25x, 40x, 50x)
  // While audio IS playing: drive normally with respect to audioMultiplier (2x, 3x, 5x)
  const advanceDrive = useCallback(() => {
    if (polylineCoords.length === 0) return;

    const currFloat = floatIndexRef.current;
    if (currFloat >= polylineCoords.length - 1) {
      setIsDriving(false);
      return;
    }

    // Normal base step (represents normal driving ~60-80 km/h in 250ms ticks)
    const baseNormalPointsPerTick = Math.max(0.12, polylineCoords.length / 2200);

    // Calculate effective step:
    // If audio is playing: move normally scaled by audio multiplier!
    // If audio is not playing: move fast at driveMultiplier!
    const effectiveSpeed = isPlaying ? audioMultiplier : driveMultiplier;
    const rawStep = Math.max(0.1, baseNormalPointsPerTick * effectiveSpeed);

    let nextFloat = Math.min(polylineCoords.length - 1, currFloat + rawStep);
    let targetIndex = Math.min(polylineCoords.length - 1, Math.floor(nextFloat));

    // When fast-cruising (audio NOT playing), check if upcoming step will cross
    // any unplayed story trigger radius. If so, land directly at the trigger!
    if (!isPlaying) {
      const fromIdx = Math.floor(currFloat);
      for (const item of items) {
        if (item.trigger && item.status === 'ready') {
          const trigLat = item.trigger.lat;
          const trigLng = item.trigger.lng;
          const radius = item.trigger.radiusM || 300;

          for (let i = fromIdx + 1; i <= targetIndex; i++) {
            const pt = polylineCoords[i];
            if (pt && haversineDistanceM(pt.latitude, pt.longitude, trigLat, trigLng) <= radius) {
              targetIndex = i;
              nextFloat = i;
              break;
            }
          }
        }
      }
    }

    floatIndexRef.current = nextFloat;
    setCurrentIndex(targetIndex);

    const nextCoord = polylineCoords[targetIndex];
    if (nextCoord) {
      onLocationUpdate(nextCoord);

      if (followMap && mapRef.current) {
        mapRef.current.animateToRegion(
          {
            latitude: nextCoord.latitude,
            longitude: nextCoord.longitude,
            latitudeDelta: 0.018,
            longitudeDelta: 0.018,
          },
          250
        );
      }
    }
  }, [
    polylineCoords,
    items,
    isPlaying,
    audioMultiplier,
    driveMultiplier,
    followMap,
    mapRef,
    onLocationUpdate,
  ]);

  // ─── Timer Interval ─────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    if (isActive && isDriving && polylineCoords.length > 0) {
      timerRef.current = setInterval(advanceDrive, 250);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isActive, isDriving, polylineCoords, advanceDrive]);

  // Start at route origin when activated
  const handleToggle = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!isActive) {
      if (polylineCoords.length > 0) {
        const startIdx = floatIndexRef.current >= polylineCoords.length - 1 ? 0 : Math.floor(floatIndexRef.current);
        floatIndexRef.current = startIdx;
        setCurrentIndex(startIdx);
        onLocationUpdate(polylineCoords[startIdx]);
      }
      setIsDriving(true);
      onToggleActive();
    } else {
      onToggleActive();
      onResetToGPS();
    }
  };

  const handleRestart = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (polylineCoords.length > 0) {
      floatIndexRef.current = 0;
      setCurrentIndex(0);
      onLocationUpdate(polylineCoords[0]);
      setIsDriving(true);
    }
  };

  const handlePlayPause = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setIsDriving((prev) => !prev);
  };

  const handleSetDriveSpeed = (sp: 25 | 40 | 50) => {
    Haptics.selectionAsync();
    setDriveMultiplier(sp);
  };

  const handleSetAudioSpeed = (sp: number) => {
    Haptics.selectionAsync();
    onAudioMultiplierChange(sp);
  };

  const percentComplete =
    polylineCoords.length > 0
      ? Math.round((currentIndex / (polylineCoords.length - 1)) * 100)
      : 0;

  if (!isActive) {
    return null;
  }

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: isDark ? 'rgba(28, 28, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          borderColor: isDark ? '#3A3A3C' : '#E5E5EA',
        },
      ]}>
      {/* Header Row: Status badge & close button */}
      <View style={styles.headerRow}>
        <View style={styles.statusBadge}>
          {isPlaying ? (
            <Animated.View style={{ transform: [{ scale: pulseAnim }], flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="volume-high" size={13} color={colors.orange} />
              <Text style={[styles.statusText, { color: colors.orange }]}>
                Story Playing · Driving at {audioMultiplier}x normal
              </Text>
            </Animated.View>
          ) : isDriving ? (
            <View style={styles.statusLive}>
              <View style={[styles.liveDot, { backgroundColor: colors.green }]} />
              <Text style={[styles.statusText, { color: colors.green }]}>
                Fast Cruising · {driveMultiplier}x Speed
              </Text>
            </View>
          ) : (
            <View style={styles.statusLive}>
              <Ionicons name="pause-circle" size={13} color={colors.textSecondary} />
              <Text style={[styles.statusText, { color: colors.textSecondary }]}>
                Simulation Paused
              </Text>
            </View>
          )}
        </View>

        <Pressable
          style={styles.closeBtn}
          hitSlop={10}
          onPress={handleToggle}>
          <Ionicons name="close" size={16} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Story title banner if audio is currently playing */}
      {isPlaying && playingItemTitle && (
        <Text style={[styles.playingSubtitle, { color: colors.text }]} numberOfLines={1}>
          ▶ {playingItemTitle}
        </Text>
      )}

      {/* Speed Selectors Row */}
      <View style={styles.multipliersRow}>
        {/* Drive Speed Group */}
        <View style={styles.selectorColumn}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            DRIVE ({driveMultiplier}x)
          </Text>
          <View style={[styles.speedGroup, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            {([25, 40, 50] as const).map((sp) => {
              const isSelected = driveMultiplier === sp;
              return (
                <Pressable
                  key={sp}
                  style={[
                    styles.speedPill,
                    isSelected && { backgroundColor: colors.accent },
                  ]}
                  onPress={() => handleSetDriveSpeed(sp)}>
                  <Text
                    style={[
                      styles.speedText,
                      { color: isSelected ? '#FFF' : colors.textSecondary },
                    ]}>
                    {sp}x
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Audio Speed Group */}
        <View style={styles.selectorColumn}>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            AUDIO ({audioMultiplier}x)
          </Text>
          <View style={[styles.speedGroup, { backgroundColor: colors.surface2, borderColor: colors.border }]}>
            {([2, 3, 5] as const).map((sp) => {
              const isSelected = audioMultiplier === sp;
              return (
                <Pressable
                  key={sp}
                  style={[
                    styles.speedPill,
                    isSelected && { backgroundColor: colors.orange },
                  ]}
                  onPress={() => handleSetAudioSpeed(sp)}>
                  <Text
                    style={[
                      styles.speedText,
                      { color: isSelected ? '#FFF' : colors.textSecondary },
                    ]}>
                    {sp}x
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>

      {/* Controls & Progress Row */}
      <View style={styles.controlsRow}>
        {/* Play/Pause */}
        <Pressable
          style={[
            styles.playBtn,
            { backgroundColor: isDriving ? colors.surface2 : colors.accent },
          ]}
          onPress={handlePlayPause}>
          <Ionicons
            name={isDriving ? 'pause' : 'play'}
            size={16}
            color={isDriving ? colors.text : '#FFF'}
          />
        </Pressable>

        {/* Restart from beginning */}
        <Pressable
          style={[styles.iconActionBtn, { backgroundColor: colors.surface2, borderColor: colors.border }]}
          onPress={handleRestart}>
          <Ionicons name="refresh" size={15} color={colors.text} />
        </Pressable>

        {/* Follow Map toggle */}
        <Pressable
          style={[
            styles.iconActionBtn,
            {
              backgroundColor: followMap ? colors.accent : colors.surface2,
              borderColor: colors.border,
            },
          ]}
          onPress={() => setFollowMap((v) => !v)}>
          <Ionicons name="locate" size={15} color={followMap ? '#FFF' : colors.text} />
        </Pressable>

        {/* Route percentage */}
        <Text style={[styles.progressText, { color: colors.textSecondary }]}>
          {percentComplete}% of route
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 72,
    left: 14,
    right: 14,
    zIndex: 40,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 8,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusLive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  closeBtn: {
    padding: 3,
  },
  playingSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: -2,
  },
  multipliersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectorColumn: {
    flex: 1,
    gap: 3,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  speedGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 0.5,
    padding: 2,
    gap: 2,
  },
  speedPill: {
    flex: 1,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  speedText: {
    fontSize: 11,
    fontWeight: '700',
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 2,
  },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 'auto',
  },
});
