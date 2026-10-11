import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ScrollView,
  Animated,
  PanResponderInstance,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Trip, TripItem } from '@/services/trip-service';
import { DownloadState, PlayedSet, formatBytes } from './trip-utils';
import { NowPlayingCard } from './now-playing-card';
import { TripStoryItem } from './trip-story-item';

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
    sponsored: string;
    sponsoredBorder: string;
    [key: string]: string;
  };
  isDark: boolean;
  pulseAnim: Animated.Value;
  readyItems: TripItem[];
  progressPct: number;
  totalDownloadedBytes: number;
  playingItem: TripItem | null;
  showTranscript: boolean;
  onToggleTranscript: () => void;
  onStopPlaying: () => void;
  downloads: DownloadState;
  played: PlayedSet;
  userLocation: { latitude: number; longitude: number } | null;
  onPlayItem: (item: TripItem) => void;
  queue?: string[];
  onSkipPlaying?: () => void;
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
  totalDownloadedBytes,
  playingItem,
  showTranscript,
  onToggleTranscript,
  onStopPlaying,
  downloads,
  played,
  userLocation,
  onPlayItem,
  queue = [],
  onSkipPlaying,
}: TripBottomSheetProps) {
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

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetContent}>
        {/* Status + Progress */}
        <View style={styles.statusRow}>
          <Animated.View
            style={[
              styles.statusPill,
              {
                backgroundColor:
                  trip.status === 'ready'
                    ? colors.green
                    : trip.status === 'building'
                    ? colors.orange
                    : colors.red,
                transform: [{ scale: pulseAnim }],
              },
            ]}>
            <Text style={styles.statusPillText}>
              {trip.status === 'ready'
                ? '✓ Ready'
                : trip.status === 'building'
                ? '⏳ Building…'
                : '✕ Failed'}
            </Text>
          </Animated.View>

          {trip.status === 'building' && trip.progress.total > 0 && (
            <Text style={[styles.progressText, { color: colors.textSecondary }]}>
              {trip.progress.ready}/{trip.progress.total} stories · {progressPct}%
            </Text>
          )}
        </View>

        {/* Progress bar */}
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

        {/* Failed state */}
        {trip.status === 'failed' && (
          <View style={[styles.failedCard, { backgroundColor: colors.surface2, borderColor: colors.red }]}>
            <Ionicons name="alert-circle-outline" size={24} color={colors.red} />
            <Text style={[styles.failedText, { color: colors.text }]}>
              {trip.failure?.message ?? "Couldn't build this trip. Please try again."}
            </Text>
          </View>
        )}

        {/* Download status */}
        {trip.status !== 'failed' && readyItems.length > 0 && (
          <View style={[styles.downloadRow, { backgroundColor: colors.surface2 }]}>
            <Ionicons
              name={totalDownloadedBytes >= (trip.totalBytes ?? 1) ? 'checkmark-circle' : 'cloud-download-outline'}
              size={16}
              color={totalDownloadedBytes >= (trip.totalBytes ?? 1) ? colors.green : colors.accent}
            />
            <Text style={[styles.downloadText, { color: colors.textSecondary }]}>
              {formatBytes(totalDownloadedBytes)} of {formatBytes(trip.totalBytes ?? 0)} downloaded
            </Text>
          </View>
        )}

        {/* Now Playing Card */}
        {playingItem && (
          <NowPlayingCard
            item={playingItem}
            colors={colors}
            isDark={isDark}
            showTranscript={showTranscript}
            onToggleTranscript={onToggleTranscript}
            onStop={onStopPlaying}
            queuedCount={queue.length}
            onSkip={onSkipPlaying}
          />
        )}

        {/* Items list header */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Stories ({readyItems.length}/{trip.progress.total})
        </Text>

        {trip.items.length === 0 && trip.status === 'building' && (
          <View style={styles.buildingPlaceholder}>
            <ActivityIndicator color={colors.orange} />
            <Text style={[styles.buildingText, { color: colors.textSecondary }]}>
              AI is writing your stories…
            </Text>
          </View>
        )}

        {/* Story items */}
        {trip.items.map((item) => {
          const dlState = downloads[item.id];
          const isDownloaded = dlState === 'ready';
          const isDownloading = dlState === 'downloading';
          const isPlaying = playingItem?.id === item.id;
          const hasBeenPlayed = played[item.id];
          const isQueued = queue.includes(item.id);

          return (
            <TripStoryItem
              key={item.id}
              item={item}
              isDownloaded={isDownloaded}
              isDownloading={isDownloading}
              isPlaying={isPlaying}
              hasBeenPlayed={hasBeenPlayed}
              isQueued={isQueued}
              userLocation={userLocation}
              colors={colors}
              onPlay={onPlayItem}
            />
          );
        })}

        {/* Bottom scroll padding */}
        <View style={{ height: Platform.OS === 'ios' ? 36 : 24 }} />
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
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 16,
    zIndex: 20,
  },
  dragHandleZone: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
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
    padding: 16,
    gap: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusPill: {
    borderRadius: 12,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  statusPillText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  progressText: {
    fontSize: 13,
    fontWeight: '500',
  },
  progressBar: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  failedCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  failedText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
  downloadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  downloadText: {
    fontSize: 13,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 4,
  },
  buildingPlaceholder: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 20,
  },
  buildingText: {
    fontSize: 14,
  },
});
