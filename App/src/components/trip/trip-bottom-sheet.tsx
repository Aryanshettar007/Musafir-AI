import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  Animated,
  PanResponderInstance,
  Platform,
  GestureResponderEvent,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Trip, TripItem } from '@/services/trip-service';
import { DownloadState, PlayedSet, itemTypeLabel, formatAudioDuration } from './trip-utils';
import { DownloadProgressIndicator } from './download-progress-indicator';
import { SpotifyScrubber } from './spotify-scrubber';
import { OscillatingText } from './oscillating-text';
import { VoiceRecordButton, LiveResponseData } from './voice-record-button';

export interface TripBottomSheetProps {
  sheetHeight: Animated.Value;
  panResponder: PanResponderInstance;
  toggleSheetExpansion: () => void;
  trip: Trip;
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
  pulseAnim: Animated.Value;
  readyItems: TripItem[];
  progressPct: number;
  playingItem: TripItem | null;
  lastPlayedItem: TripItem | null;
  isPlaying: boolean;
  isPaused: boolean;
  currentTime?: number;
  duration?: number;
  onSeek?: (seconds: number) => void;
  onTogglePlayPause: () => void;
  onStopPlaying: () => void;
  downloads: DownloadState;
  played: PlayedSet;
  queue?: string[];
  onSkipPlaying?: () => void;
  onExitSession?: () => void;
  onVoiceRecordingComplete?: (uri: string | null) => void;
  userLocation?: { latitude: number; longitude: number } | null;
  onLiveResponse?: (data: LiveResponseData) => void;
  onLiveRecordingStart?: () => void;
  isLiveLoading?: boolean;
  isLivePlaying?: boolean;
}

export function TripBottomSheet({
  sheetHeight,
  panResponder,
  toggleSheetExpansion,
  trip,
  colors,
  isDark,
  pulseAnim,
  readyItems,
  progressPct,
  playingItem,
  lastPlayedItem,
  isPlaying,
  isPaused,
  currentTime = 0,
  duration = 0,
  onSeek,
  onTogglePlayPause,
  onStopPlaying,
  downloads,
  queue = [],
  onSkipPlaying,
  onExitSession,
  onVoiceRecordingComplete,
  userLocation,
  onLiveResponse,
  onLiveRecordingStart,
  isLiveLoading = false,
  isLivePlaying = false,
}: TripBottomSheetProps) {
  const [isTranscriptOpen, setIsTranscriptOpen] = useState(false);

  const activeItem = playingItem || lastPlayedItem;
  const isPlayingActive = playingItem != null && isPlaying && !isPaused;

  const downloadedCount = readyItems.reduce(
    (count, item) => (downloads[item.id] === 'ready' ? count + 1 : count),
    0
  );

  // Total duration: prefer actual audio duration, fallback to item audio duration
  const totalDuration = duration > 0 ? duration : (activeItem?.audio?.durationS ?? 0);

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: sheetHeight,
          backgroundColor: colors.surface,
        },
      ]}>
      {/* DRAG HANDLE TOUCH ZONE */}
      <View {...panResponder.panHandlers} style={styles.dragHandleZone}>
        <Pressable onPress={toggleSheetExpansion} hitSlop={14} style={styles.handleBarTouch}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.sheetContent}>
        {/* Status header (Only shows active playback state or building status) */}
        {(trip.status === 'building' || playingItem) && (
          <View style={styles.headerRow}>
            <View style={styles.headerLeft}>
              {trip.status === 'building' ? (
                <Animated.View
                  style={[
                    styles.buildingPill,
                    { backgroundColor: colors.orange, transform: [{ scale: pulseAnim }] },
                  ]}>
                  <Text style={styles.buildingPillText}>
                    {trip.stage === 'discovering'
                      ? '⏳ Finding landmarks…'
                      : trip.stage === 'curating'
                      ? '⏳ Curating stories…'
                      : `⏳ Building… ${progressPct}%`}
                  </Text>
                </Animated.View>
              ) : isPlayingActive ? (
                <View style={styles.liveIndicatorRow}>
                  <View style={[styles.liveDot, { backgroundColor: colors.green }]} />
                  <Text style={[styles.liveText, { color: colors.textSecondary }]}>NOW PLAYING</Text>
                </View>
              ) : playingItem && isPaused ? (
                <View style={styles.liveIndicatorRow}>
                  <View style={[styles.liveDot, { backgroundColor: colors.textSecondary }]} />
                  <Text style={[styles.liveText, { color: colors.textSecondary }]}>PAUSED</Text>
                </View>
              ) : null}

              {queue.length > 0 && (
                <View style={[styles.queuePill, { backgroundColor: colors.surface2 }]}>
                  <Text style={[styles.queuePillText, { color: colors.textSecondary }]}>
                    +{queue.length} in queue
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Building Progress Bar */}
        {trip.status === 'building' && trip.progress.total > 0 && (
          <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressPct}%` as any, backgroundColor: colors.orange },
              ]}
            />
          </View>
        )}

        {/* ACTIVE / RECENT STORY DETAILS */}
        {activeItem ? (
          <View style={styles.playerContainer}>
            {/* Title Row: Oscillating Text (Spotify-style) + Download Status icon on right */}
            <View style={styles.titleRow}>
              <View style={styles.titleTextWrapper}>
                <OscillatingText
                  text={activeItem.title}
                  style={[styles.storyTitle, { color: colors.text }]}
                />
              </View>
              <DownloadProgressIndicator
                totalItems={readyItems.length}
                downloadedCount={downloadedCount}
                colors={colors}
              />
            </View>

            {/* Subtitle with duration and 'Recently Played' if applicable */}
            <View style={styles.metaRow}>
              <Text style={[styles.metaText, { color: colors.textSecondary }]}>
                {itemTypeLabel[activeItem.type] ?? activeItem.type}
                {activeItem.audio?.durationS ? ` · ${formatAudioDuration(activeItem.audio.durationS)}` : ''}
              </Text>
              {!isPlayingActive && lastPlayedItem?.id === activeItem.id && (
                <View style={[styles.recentlyPlayedBadge, { backgroundColor: colors.surface2 }]}>
                  <Text style={[styles.recentlyPlayedText, { color: colors.textSecondary }]}>
                    Recently Played
                  </Text>
                </View>
              )}
            </View>

            {/* SPOTIFY-STYLE AUDIO SCRUBBER */}
            <SpotifyScrubber
              currentTime={currentTime}
              duration={totalDuration}
              onSeek={(sec) => onSeek?.(sec)}
              colors={colors}
              isDark={isDark}
            />

            {/* CONTROLS ROW (Sleek Uber / Apple style) */}
            <View style={styles.controlsRow}>
              {/* Centered Primary Controls: Stop, Play/Pause (Center), Reset */}
              <View style={styles.centerControlsGroup}>
                {/* Stop button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.stopBtnCircle,
                    {
                      backgroundColor: colors.surface2,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onStopPlaying();
                  }}>
                  <Ionicons name="stop" size={17} color={colors.text} />
                </Pressable>

                {/* Main Play / Pause Circle (EXACT SCREEN CENTER) */}
                <Pressable
                  style={({ pressed }) => [
                    styles.playPauseBtnCircle,
                    {
                      backgroundColor: isDark ? '#FFFFFF' : '#000000',
                      opacity: pressed ? 0.85 : 1,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    onTogglePlayPause();
                  }}>
                  <Ionicons
                    name={isPlayingActive ? 'pause' : 'play'}
                    size={26}
                    color={isDark ? '#000000' : '#FFFFFF'}
                    style={{ marginLeft: isPlayingActive ? 0 : 2 }}
                  />
                </Pressable>

                {/* Reset / Replay / Skip button */}
                <Pressable
                  style={({ pressed }) => [
                    styles.stopBtnCircle,
                    {
                      backgroundColor: colors.surface2,
                      opacity: pressed ? 0.75 : 1,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (onSkipPlaying && queue.length > 0) {
                      onSkipPlaying();
                    } else {
                      onSeek?.(0);
                    }
                  }}>
                  <Ionicons
                    name={queue.length > 0 ? 'play-skip-forward' : 'refresh'}
                    size={17}
                    color={colors.text}
                  />
                </Pressable>
              </View>

              {/* Voice Record Button on the extreme right */}
              <View style={styles.extremeRightControl}>
                <VoiceRecordButton
                  colors={colors}
                  isDark={isDark}
                  size={44}
                  tripId={trip.id}
                  userLocation={userLocation}
                  fallbackCoords={
                    trip.origin.lat != null && trip.origin.lng != null
                      ? { latitude: trip.origin.lat, longitude: trip.origin.lng }
                      : null
                  }
                  onRecordingStart={() => {
                    onStopPlaying();
                    onLiveRecordingStart?.();
                  }}
                  onRecordingComplete={onVoiceRecordingComplete}
                  onLiveResponse={onLiveResponse}
                  isExternalLoading={isLiveLoading}
                  isExternalPlaying={isLivePlaying}
                />
              </View>
            </View>

            {/* SEPARATOR LINE */}
            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* TRANSCRIPT DROPDOWN */}
            <Pressable
              style={styles.transcriptDropdownHeader}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setIsTranscriptOpen((v) => !v);
              }}>
              <View style={styles.transcriptDropdownLeft}>
                <Ionicons name="document-text-outline" size={16} color={colors.text} />
                <Text style={[styles.transcriptDropdownTitle, { color: colors.text }]}>
                  Transcript
                </Text>
              </View>
              <Ionicons
                name={isTranscriptOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={colors.textSecondary}
              />
            </Pressable>

            {isTranscriptOpen && (
              <View style={styles.transcriptDropdownBody}>
                <Text style={[styles.transcriptBodyText, { color: colors.textSecondary }]}>
                  {activeItem.transcript ||
                    'Audio narration is ready. Live transcript text will appear as it plays along your route.'}
                </Text>
              </View>
            )}
          </View>
        ) : (
          /* Empty / Waiting state */
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIconCircle, { backgroundColor: colors.surface2 }]}>
              <Ionicons name="headset" size={24} color={colors.accent} />
            </View>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>
              Ready Along Your Route
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Audio stories play automatically as you arrive at each spot along your route.
            </Text>
          </View>
        )}

        {/* EXIT SESSION BUTTON */}
        <View style={styles.exitSessionWrapper}>
          <Pressable
            style={({ pressed }) => [
              styles.exitSessionBtn,
              {
                backgroundColor: colors.surface2,
                borderColor: colors.border,
                opacity: pressed ? 0.75 : 1,
                cursor: Platform.OS === 'web' ? 'pointer' : undefined,
              } as any,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Exit Session"
            onPress={onExitSession}>
            <Ionicons name="log-out-outline" size={17} color={colors.red} />
            <Text style={[styles.exitSessionBtnText, { color: colors.red }]}>
              Exit Session
            </Text>
          </Pressable>
        </View>

        <View style={{ height: Platform.OS === 'ios' ? 44 : 28 }} />
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 16,
    zIndex: 20,
  },
  dragHandleZone: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handleBarTouch: {
    paddingVertical: 4,
    paddingHorizontal: 20,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buildingPill: {
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  buildingPillText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 11,
  },
  liveIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  queuePill: {
    borderRadius: 8,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  queuePillText: {
    fontSize: 10,
    fontWeight: '600',
  },
  progressBar: {
    height: 3,
    borderRadius: 1.5,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 1.5,
  },
  playerContainer: {
    gap: 8,
    marginTop: 2,
  },
  storyTitle: {
    fontSize: 21,
    fontWeight: '700',
    letterSpacing: -0.4,
    lineHeight: 27,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontSize: 13,
  },
  recentlyPlayedBadge: {
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  recentlyPlayedText: {
    fontSize: 11,
    fontWeight: '600',
  },
  // Controls
  controlsRow: {
    position: 'relative',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    minHeight: 62,
  },
  centerControlsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  extremeRightControl: {
    position: 'absolute',
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopBtnCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playPauseBtnCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 4,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  // Transcript dropdown
  transcriptDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  transcriptDropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  transcriptDropdownTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  transcriptDropdownBody: {
    paddingVertical: 8,
    paddingBottom: 16,
  },
  transcriptBodyText: {
    fontSize: 14,
    lineHeight: 22,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleTextWrapper: {
    flex: 1,
    overflow: 'hidden',
  },
  exitSessionWrapper: {
    marginTop: 18,
    marginBottom: 6,
    width: '100%',
  },
  exitSessionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 14,
    borderWidth: 1,
    width: '100%',
  },
  exitSessionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
