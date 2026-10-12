import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/hooks/use-color-scheme';

export interface MoodPreferenceBadgeProps {
  selectedMoods?: string[];
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function MoodPreferenceBadge({
  selectedMoods = [],
  onPress,
  style,
}: MoodPreferenceBadgeProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const count = selectedMoods.length;
  // Keep it short and simple: '4 mood selected' or 'Select mood'
  const displayMoodText = count === 0 ? 'Select mood' : `${count} mood selected`;

  const colors = {
    bg: isDark ? '#272930' : '#E8E8EE',
    text: isDark ? '#FFFFFF' : '#000000',
    chevron: isDark ? '#8A8D95' : '#8E8E93',
    iconBg: isDark ? '#363942' : '#DCDCE4',
    iconColor: isDark ? '#F5A623' : '#D97706',
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  return (
    <View style={[styles.container, style]}>
      <Pressable
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel={`Mood selector, ${displayMoodText}`}
        style={({ pressed }) => [
          styles.badge,
          { backgroundColor: colors.bg },
          pressed && styles.pressed,
        ]}
        onPress={handlePress}>
        <View style={[styles.iconCircle, { backgroundColor: colors.iconBg }]}>
          <Ionicons name="sparkles" size={10} color={colors.iconColor} />
        </View>
        <Text style={[styles.text, { color: colors.text }]} numberOfLines={1}>
          {displayMoodText}
        </Text>
        <Ionicons name="chevron-forward" size={11} color={colors.chevron} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 4,
    paddingRight: 7,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  iconCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    fontSize: 11.5,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
