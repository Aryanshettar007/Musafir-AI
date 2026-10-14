import React, { useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/hooks/use-color-scheme';

export type PermissionType = 'location' | 'backgroundLocation' | 'microphone' | 'custom';

export interface PermissionModalProps {
  visible: boolean;
  type?: PermissionType;
  title?: string;
  description?: string;
  benefits?: string[];
  privacyNote?: string;
  primaryButtonText?: string;
  secondaryButtonText?: string;
  isLoading?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

interface PermissionPreset {
  iconName: keyof typeof Ionicons.glyphMap;
  defaultTitle: string;
  defaultDescription: string;
  defaultBenefits: string[];
  defaultPrimaryText: string;
  defaultPrivacyNote: string;
}

const PRESETS: Record<Exclude<PermissionType, 'custom'>, PermissionPreset> = {
  location: {
    iconName: 'location-outline',
    defaultTitle: 'Enable Location Access',
    defaultDescription:
      'Musafir AI uses your location while you travel to play real-time audio stories and highlight landmarks along your route.',
    defaultBenefits: [
      'Audio stories timed to your route',
      'Discover nearby monuments and hidden spots',
    ],
    defaultPrimaryText: 'Allow Access',
    defaultPrivacyNote: 'Used only while navigating. Never shared or sold.',
  },
  backgroundLocation: {
    iconName: 'navigate-outline',
    defaultTitle: 'Background Location',
    defaultDescription:
      'Allow Musafir AI to run while your phone is locked or in your pocket so tour stories continue playing seamlessly while driving.',
    defaultBenefits: [
      'Uninterrupted audio when screen is locked',
      'Hands-free landmark triggers as you drive',
    ],
    defaultPrimaryText: 'Allow in Background',
    defaultPrivacyNote: 'Only active during an ongoing trip.',
  },
  microphone: {
    iconName: 'mic-outline',
    defaultTitle: 'Enable Microphone',
    defaultDescription:
      'Musafir AI uses your microphone to let you ask questions about monuments and request stories hands-free while driving.',
    defaultBenefits: [
      'Ask questions about passing landmarks',
      'Hands-free voice assistant while driving',
    ],
    defaultPrimaryText: 'Allow Microphone',
    defaultPrivacyNote: 'Audio is only processed when you tap to speak.',
  },
};

export function PermissionModal({
  visible,
  type = 'location',
  title,
  description,
  benefits,
  privacyNote,
  primaryButtonText,
  secondaryButtonText = 'Not now',
  isLoading = false,
  onConfirm,
  onDismiss,
}: PermissionModalProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.96)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 160,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 9,
          tension: 90,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.96,
          duration: 120,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible]);

  if (!visible) return null;

  const preset = type !== 'custom' ? PRESETS[type] : null;

  const resolvedTitle = title ?? preset?.defaultTitle ?? 'Permission Request';
  const resolvedDesc = description ?? preset?.defaultDescription ?? 'Please grant access to continue.';
  const resolvedBenefits = benefits ?? preset?.defaultBenefits ?? [];
  const resolvedPrimaryText = primaryButtonText ?? preset?.defaultPrimaryText ?? 'Continue';
  const resolvedPrivacyNote = privacyNote ?? preset?.defaultPrivacyNote;
  const iconName = preset?.iconName ?? 'shield-checkmark-outline';

  // shadcn zinc tokens
  const colors = {
    backdrop: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.45)',
    cardBg: isDark ? '#09090B' : '#FFFFFF',
    cardBorder: isDark ? '#27272A' : '#E4E4E7',
    textPrimary: isDark ? '#FAFAFA' : '#09090B',
    textSecondary: isDark ? '#A1A1AA' : '#71717A',
    textMuted: isDark ? '#71717A' : '#A1A1AA',
    iconBg: isDark ? '#18181B' : '#F4F4F5',
    iconBorder: isDark ? '#27272A' : '#E4E4E7',
    iconColor: isDark ? '#FAFAFA' : '#18181B',
    primaryButtonBg: isDark ? '#FAFAFA' : '#18181B',
    primaryButtonText: isDark ? '#09090B' : '#FAFAFA',
    secondaryButtonBg: isDark ? 'transparent' : '#FFFFFF',
    secondaryButtonBorder: isDark ? '#27272A' : '#E4E4E7',
    secondaryButtonText: isDark ? '#FAFAFA' : '#09090B',
    closeIcon: isDark ? '#71717A' : '#A1A1AA',
  };

  const handleConfirm = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    onConfirm();
  };

  const handleDismiss = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    onDismiss();
  };

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={handleDismiss}>
      <Animated.View style={[styles.backdrop, { backgroundColor: colors.backdrop, opacity: fadeAnim }]}>
        <Pressable style={styles.backdropPressable} onPress={handleDismiss} />

        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: colors.cardBg,
              borderColor: colors.cardBorder,
              transform: [{ scale: scaleAnim }],
              opacity: fadeAnim,
            },
          ]}>
          {/* Top Row: Icon badge & Close button */}
          <View style={styles.topRow}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: colors.iconBg, borderColor: colors.iconBorder },
              ]}>
              <Ionicons name={iconName} size={20} color={colors.iconColor} />
            </View>

            <Pressable
              hitSlop={12}
              onPress={handleDismiss}
              accessibilityLabel="Close"
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.pressed,
              ]}>
              <Ionicons name="close" size={18} color={colors.closeIcon} />
            </Pressable>
          </View>

          {/* Title & Description */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {resolvedTitle}
            </Text>
            <Text style={[styles.description, { color: colors.textSecondary }]}>
              {resolvedDesc}
            </Text>
          </View>

          {/* Subtle Key Points */}
          {resolvedBenefits.length > 0 && (
            <View style={styles.benefitsContainer}>
              {resolvedBenefits.map((benefit, index) => (
                <View key={index} style={styles.benefitRow}>
                  <Ionicons name="checkmark" size={13} color={colors.textSecondary} style={styles.checkIcon} />
                  <Text style={[styles.benefitText, { color: colors.textSecondary }]}>
                    {benefit}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Privacy Note */}
          {resolvedPrivacyNote && (
            <View style={styles.privacyRow}>
              <Ionicons name="shield-checkmark-outline" size={12} color={colors.textMuted} />
              <Text style={[styles.privacyText, { color: colors.textMuted }]}>
                {resolvedPrivacyNote}
              </Text>
            </View>
          )}

          {/* Actions: Side-by-side shadcn AlertDialog buttons */}
          <View style={styles.actions}>
            <Pressable
              disabled={isLoading}
              onPress={handleDismiss}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.secondaryButton,
                {
                  backgroundColor: colors.secondaryButtonBg,
                  borderColor: colors.secondaryButtonBorder,
                },
                pressed && styles.pressed,
                isLoading && styles.disabled,
              ]}>
              <Text style={[styles.secondaryButtonText, { color: colors.secondaryButtonText }]}>
                {secondaryButtonText}
              </Text>
            </Pressable>

            <Pressable
              disabled={isLoading}
              onPress={handleConfirm}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.primaryButton,
                { backgroundColor: colors.primaryButtonBg },
                pressed && styles.pressedPrimary,
                isLoading && styles.disabled,
              ]}>
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.primaryButtonText} />
              ) : (
                <Text style={[styles.primaryButtonText, { color: colors.primaryButtonText }]}>
                  {resolvedPrimaryText}
                </Text>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = Math.min(SCREEN_WIDTH - 44, 360);

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 22,
  },
  backdropPressable: {
    ...StyleSheet.absoluteFill,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.14,
        shadowRadius: 18,
      },
      android: {
        elevation: 6,
      },
    }),
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -2,
    marginRight: -4,
  },
  header: {
    marginBottom: 14,
    gap: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  description: {
    fontSize: 13.5,
    lineHeight: 19.5,
  },
  benefitsContainer: {
    gap: 7,
    marginBottom: 14,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  checkIcon: {
    marginTop: 1,
  },
  benefitText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
    fontWeight: '400',
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 18,
    marginTop: 2,
  },
  privacyText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 15,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    height: 40,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 13.5,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  primaryButton: {
    flex: 1,
    height: 40,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontSize: 13.5,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  pressed: {
    opacity: 0.6,
  },
  pressedPrimary: {
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.5,
  },
});
