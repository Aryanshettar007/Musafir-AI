import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { TripItem } from '@/services/trip-service';
import { itemTypeLabel, sideIcon } from './trip-utils';

export interface NowPlayingCardProps {
  item: TripItem;
  colors: {
    accent: string;
    text: string;
    textSecondary: string;
    surface2: string;
    sponsored: string;
    sponsoredBorder: string;
    orange: string;
    [key: string]: string;
  };
  isDark: boolean;
  showTranscript: boolean;
  onToggleTranscript: () => void;
  onStop: () => void;
  onSkip?: () => void;
  queuedCount?: number;
}

export function NowPlayingCard({
  item,
  colors,
  isDark,
  showTranscript,
  onToggleTranscript,
  onStop,
  onSkip,
  queuedCount = 0,
}: NowPlayingCardProps) {
  return (
    <View
      style={[
        styles.nowPlaying,
        {
          backgroundColor: isDark ? '#1A2A3A' : '#EAF4FF',
          borderColor: colors.accent,
        },
        item.type === 'sponsored' && {
          backgroundColor: colors.sponsored,
          borderColor: colors.sponsoredBorder,
        },
      ]}>
      {item.type === 'sponsored' && (
        <View style={styles.sponsoredLabel}>
          <Ionicons name="megaphone-outline" size={13} color={colors.orange} />
          <Text style={[styles.sponsoredText, { color: colors.orange }]}>
            Sponsored · {item.sponsor?.name}
          </Text>
        </View>
      )}

      <View style={styles.nowPlayingHeader}>
        <Text style={[styles.nowPlayingLabel, { color: colors.accent }]}>▶ Now Playing</Text>
        {queuedCount > 0 && (
          <View style={[styles.queueBadge, { backgroundColor: isDark ? '#272930' : '#E0E8F5' }]}>
            <Ionicons name="list" size={11} color={colors.accent} />
            <Text style={[styles.queueBadgeText, { color: colors.accent }]}>
              +{queuedCount} in queue
            </Text>
          </View>
        )}
      </View>
      <Text style={[styles.nowPlayingTitle, { color: colors.text }]}>{item.title}</Text>
      <Text style={[styles.nowPlayingMeta, { color: colors.textSecondary }]}>
        {itemTypeLabel[item.type] ?? item.type}
        {item.side !== 'none' ? `  ${sideIcon(item.side)}` : ''}
      </Text>

      {item.transcript && (
        <Pressable onPress={onToggleTranscript} style={styles.transcriptToggle}>
          <Text style={[styles.transcriptToggleText, { color: colors.accent }]}>
            {showTranscript ? 'Hide transcript' : 'Show transcript'}
          </Text>
        </Pressable>
      )}

      {showTranscript && item.transcript && (
        <Text style={[styles.transcriptText, { color: colors.textSecondary }]}>
          {item.transcript}
        </Text>
      )}

      <View style={styles.btnRow}>
        <Pressable
          style={[styles.stopBtn, { backgroundColor: colors.surface2 }]}
          onPress={onStop}>
          <Ionicons name="stop" size={14} color={colors.text} />
          <Text style={[styles.stopBtnText, { color: colors.text }]}>Stop</Text>
        </Pressable>
        {onSkip && queuedCount > 0 && (
          <Pressable
            style={[styles.stopBtn, { backgroundColor: colors.surface2 }]}
            onPress={onSkip}>
            <Ionicons name="play-skip-forward" size={14} color={colors.text} />
            <Text style={[styles.stopBtnText, { color: colors.text }]}>Next Story</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nowPlaying: {
    borderWidth: 1.5,
    borderRadius: 16,
    padding: 14,
    gap: 4,
  },
  sponsoredLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sponsoredText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  nowPlayingLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  nowPlayingTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginTop: 2,
  },
  nowPlayingMeta: {
    fontSize: 13,
  },
  transcriptToggle: {
    marginTop: 6,
  },
  transcriptToggleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  transcriptText: {
    fontSize: 13,
    lineHeight: 20,
    marginTop: 4,
  },
  nowPlayingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  queueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  queueBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  btnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 8,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  stopBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
