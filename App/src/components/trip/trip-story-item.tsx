import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TripItem } from '@/services/trip-service';
import {
  haversineDistanceM,
  formatDist,
  formatDuration,
  itemTypeLabel,
  sideIcon,
} from './trip-utils';

export interface TripStoryItemProps {
  item: TripItem;
  isDownloaded: boolean;
  isDownloading: boolean;
  isPlaying: boolean;
  hasBeenPlayed: boolean;
  userLocation: { latitude: number; longitude: number } | null;
  colors: {
    surface: string;
    surface2: string;
    border: string;
    text: string;
    textSecondary: string;
    accent: string;
    green: string;
    red: string;
    sponsoredBorder: string;
    [key: string]: string;
  };
  isQueued?: boolean;
  onPlay: (item: TripItem) => void;
}

export function TripStoryItem({
  item,
  isDownloaded,
  isDownloading,
  isPlaying,
  hasBeenPlayed,
  isQueued,
  userLocation,
  colors,
  onPlay,
}: TripStoryItemProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.itemCard,
        { backgroundColor: colors.surface2, borderColor: colors.border },
        isPlaying && { borderColor: colors.accent },
        isQueued && { borderColor: colors.orange || '#FF9500' },
        item.type === 'sponsored' && { borderColor: colors.sponsoredBorder },
        pressed && styles.cardPressed,
        item.status === 'failed' && { opacity: 0.5 },
      ]}
      onPress={() => {
        if (isDownloaded && item.status === 'ready') {
          onPlay(item);
        }
      }}
      disabled={!isDownloaded || item.status === 'failed'}>
      {/* Sponsored badge */}
      {item.type === 'sponsored' && (
        <View style={styles.sponsoredBadge}>
          <Text style={styles.sponsoredBadgeText}>
            SPONSORED · {item.sponsor?.name?.toUpperCase()}
          </Text>
        </View>
      )}

      <View style={styles.itemRow}>
        {/* Status icon */}
        <View
          style={[
            styles.itemIconCircle,
            {
              backgroundColor: isPlaying
                ? colors.accent
                : isQueued
                ? colors.orange || '#FF9500'
                : hasBeenPlayed
                ? colors.green + '30'
                : colors.surface,
            },
          ]}>
          {isPlaying ? (
            <Ionicons name="pause" size={14} color="#FFF" />
          ) : isQueued ? (
            <Ionicons name="time" size={14} color="#FFF" />
          ) : isDownloaded ? (
            <Ionicons
              name={hasBeenPlayed ? 'checkmark' : 'play'}
              size={14}
              color={hasBeenPlayed ? colors.green : colors.accent}
            />
          ) : isDownloading ? (
            <ActivityIndicator size="small" color={colors.textSecondary} />
          ) : item.status === 'failed' ? (
            <Ionicons name="close" size={14} color={colors.red} />
          ) : (
            <Ionicons name="hourglass-outline" size={14} color={colors.textSecondary} />
          )}
        </View>

        {/* Text */}
        <View style={styles.itemText}>
          <Text style={[styles.itemTitle, { color: colors.text }]} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={[styles.itemMeta, { color: colors.textSecondary }]}>
            {itemTypeLabel[item.type] ?? item.type}
            {item.side !== 'none' ? `  ${sideIcon(item.side)}` : ''}
            {item.audio?.durationS ? `  ${formatDuration(item.audio.durationS)}` : ''}
          </Text>
        </View>

        {/* Trigger distance */}
        {item.trigger && userLocation && (
          <Text style={[styles.itemDist, { color: colors.textSecondary }]}>
            {formatDist(
              haversineDistanceM(
                userLocation.latitude,
                userLocation.longitude,
                item.trigger.lat,
                item.trigger.lng
              )
            )}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  itemCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.99 }],
  },
  sponsoredBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FF9500',
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 7,
    marginBottom: 8,
  },
  sponsoredBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  itemIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  itemMeta: {
    fontSize: 12,
    marginTop: 2,
  },
  itemDist: {
    fontSize: 12,
    fontWeight: '500',
  },
});
