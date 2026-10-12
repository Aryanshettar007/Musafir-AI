import React from 'react';
import { StyleSheet, View, Text, Pressable, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

interface DownloadProgressIndicatorProps {
  totalItems: number;
  downloadedCount: number;
  colors: {
    accent: string;
    green: string;
    surface2: string;
    border: string;
    text: string;
    textSecondary: string;
    [key: string]: string;
  };
}

export function DownloadProgressIndicator({
  totalItems,
  downloadedCount,
  colors,
}: DownloadProgressIndicatorProps) {
  if (totalItems === 0) return null;

  const isComplete = totalItems > 0 && downloadedCount >= totalItems;
  const pct = Math.min(100, Math.round((downloadedCount / totalItems) * 100));

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isComplete) {
      Alert.alert(
        'Offline Audio Ready',
        'All audio stories along your route have been downloaded. They will play automatically as you drive, even without cellular reception.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert(
        'Downloading Stories',
        `${downloadedCount} of ${totalItems} stories downloaded (${pct}%).\nAudio stories are caching in the background for offline playback.`,
        [{ text: 'OK' }]
      );
    }
  };

  if (isComplete) {
    return (
      <Pressable
        onPress={handlePress}
        hitSlop={8}
        style={({ pressed }) => [
          styles.container,
          {
            backgroundColor: colors.surface2,
            borderColor: colors.border,
            opacity: pressed ? 0.75 : 1,
          },
        ]}>
        <Ionicons name="checkmark-circle" size={20} color={colors.green} />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.progressBadge,
        {
          backgroundColor: colors.surface2,
          borderColor: colors.accent,
          opacity: pressed ? 0.75 : 1,
        },
      ]}>
      <Text style={[styles.pctText, { color: colors.accent }]}>{pct}%</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBadge: {
    minWidth: 34,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pctText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
