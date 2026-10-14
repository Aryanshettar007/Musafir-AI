import React from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/hooks/use-color-scheme';

export interface LegalLinksProps {
  /**
   * 'compact': "Privacy Policy ↗  •  Terms of Service ↗"
   * 'agreement': "By continuing, you agree to our Terms of Service ↗ and Privacy Policy ↗"
   * 'inline': Single line with customizable separator
   */
  variant?: 'compact' | 'agreement' | 'inline';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  showIcon?: boolean;
}

export function LegalLinks({
  variant = 'compact',
  style,
  textStyle,
  showIcon = true,
}: LegalLinksProps) {
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const colors = {
    text: isDark ? '#8E8E93' : '#6E6E73',
    link: isDark ? '#D1D1D6' : '#2C2C2E',
    icon: isDark ? '#8E8E93' : '#8E8E93',
    bullet: isDark ? '#48484A' : '#C7C7CC',
  };

  const openLegal = (type: 'privacy' | 'terms') => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore if haptics fail
    }
    router.push(type === 'privacy' ? '/privacy' : '/terms');
  };

  if (variant === 'agreement') {
    return (
      <View style={[styles.agreementContainer, style]}>
        <Text style={[styles.agreementText, { color: colors.text }, textStyle]}>
          By continuing, you agree to our{' '}
          <Text
            onPress={() => openLegal('terms')}
            style={[styles.linkText, { color: colors.link }]}>
            Terms of Service
          </Text>
          {showIcon && (
            <Text style={{ color: colors.icon, fontSize: 10 }}> ↗</Text>
          )}{' '}
          and{' '}
          <Text
            onPress={() => openLegal('privacy')}
            style={[styles.linkText, { color: colors.link }]}>
            Privacy Policy
          </Text>
          {showIcon && (
            <Text style={{ color: colors.icon, fontSize: 10 }}> ↗</Text>
          )}
        </Text>
      </View>
    );
  }

  // Default 'compact' or 'inline'
  return (
    <View style={[styles.compactContainer, style]}>
      <Pressable
        onPress={() => openLegal('privacy')}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
        <Text style={[styles.compactLinkText, { color: colors.link }, textStyle]}>
          Privacy Policy
        </Text>
        {showIcon && (
          <Ionicons
            name="open-outline"
            size={11}
            color={colors.icon}
            style={styles.icon}
          />
        )}
      </Pressable>

      <Text style={[styles.bullet, { color: colors.bullet }]}>•</Text>

      <Pressable
        onPress={() => openLegal('terms')}
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}>
        <Text style={[styles.compactLinkText, { color: colors.link }, textStyle]}>
          Terms of Service
        </Text>
        {showIcon && (
          <Ionicons
            name="open-outline"
            size={11}
            color={colors.icon}
            style={styles.icon}
          />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  agreementContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  agreementText: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    fontWeight: '400',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  compactLinkText: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  linkText: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  bullet: {
    fontSize: 12,
    fontWeight: '600',
  },
  icon: {
    opacity: 0.8,
  },
  pressed: {
    opacity: 0.6,
  },
});
