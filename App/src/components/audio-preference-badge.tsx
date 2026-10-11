import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  Pressable,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { mapLanguageToLabel } from '@/services/user-service';
import { getVoiceAvatarSource } from '@/services/catalog-service';

export interface AudioPreferenceBadgeProps {
  preferredAudio?: string;
  voice?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function AudioPreferenceBadge({
  preferredAudio = 'English',
  voice = 'Nalini',
  onPress,
  style,
}: AudioPreferenceBadgeProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const rawLang = mapLanguageToLabel(preferredAudio);
  const displayLang = rawLang.replace(/\s*\([^)]*\)/g, '').trim() || rawLang;
  const displayAudioText = voice ? `${displayLang} • ${voice}` : displayLang;

  const colors = {
    bg: isDark ? '#272930' : '#E8E8EE',
    text: isDark ? '#FFFFFF' : '#000000',
    chevron: isDark ? '#8A8D95' : '#8E8E93',
  };

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  };

  return (
    <View style={[styles.container, style]}>
      <Pressable
        hitSlop={6}
        style={({ pressed }) => [
          styles.badge,
          { backgroundColor: colors.bg },
          pressed && styles.pressed,
        ]}
        onPress={handlePress}>
        <Image
          source={getVoiceAvatarSource(voice)}
          style={styles.avatarImage}
          contentFit="cover"
          transition={100}
        />
        <Text style={[styles.text, { color: colors.text }]} numberOfLines={1}>
          {displayAudioText}
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
    paddingTop: 4,
    paddingBottom: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 4,
    paddingRight: 8,
    paddingVertical: 3.5,
    borderRadius: 12,
  },
  avatarImage: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#3A3D45',
  },
  pressed: {
    opacity: 0.7,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
