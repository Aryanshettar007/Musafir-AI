import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Switch,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export interface AudioSettingsModalProps {
  visible: boolean;
  onDismiss: () => void;
  pauseSystemMusic: boolean;
  onTogglePauseSystemMusic: (val: boolean) => void;
  colors: {
    surface: string;
    surface2: string;
    border: string;
    text: string;
    textSecondary: string;
    accent: string;
    [key: string]: string;
  };
  isDark: boolean;
}

export function AudioSettingsModal({
  visible,
  onDismiss,
  pauseSystemMusic,
  onTogglePauseSystemMusic,
  colors,
  isDark,
}: AudioSettingsModalProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(60)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 9,
          tension: 70,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 60,
          duration: 140,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, slideAnim]);

  if (!visible && (fadeAnim as any)._value === 0) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        {/* Semi-transparent backdrop */}
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        </Animated.View>

        {/* Bottom sheet card */}
        <Animated.View
          style={[
            styles.sheetCard,
            {
              backgroundColor: isDark ? '#1C1C1E' : '#FFFFFF',
              borderColor: colors.border,
              transform: [{ translateY: slideAnim }],
            },
          ]}>
          {/* Drag Handle Bar */}
          <View style={styles.handleBarWrapper}>
            <View style={[styles.handleBar, { backgroundColor: colors.border }]} />
          </View>

          {/* Simple Header */}
          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, { color: isDark ? '#FFFFFF' : '#000000' }]}>
              Audio Settings
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onDismiss();
              }}
              hitSlop={12}
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: colors.surface2, opacity: pressed ? 0.6 : 1 },
              ]}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Toggle Option Card without blue accent or extra description */}
          <View
            style={[
              styles.settingCard,
              {
                backgroundColor: colors.surface2,
                borderColor: colors.border,
              },
            ]}>
            <Text
              style={[
                styles.settingTitle,
                { color: isDark ? '#FFFFFF' : '#000000' },
              ]}>
              Pause background music instead of lowering volume
            </Text>

            <Switch
              value={pauseSystemMusic}
              onValueChange={(val) => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onTogglePauseSystemMusic(val);
              }}
              trackColor={{
                false: isDark ? '#3A3A3C' : '#E5E5EA',
                true: isDark ? '#FFFFFF' : '#000000',
              }}
              thumbColor={
                isDark
                  ? pauseSystemMusic
                    ? '#000000'
                    : '#FFFFFF'
                  : '#FFFFFF'
              }
              ios_backgroundColor={isDark ? '#3A3A3C' : '#E5E5EA'}
            />
          </View>

          {/* Monochrome Done Button */}
          <Pressable
            style={({ pressed }) => [
              styles.doneButton,
              {
                backgroundColor: isDark ? '#FFFFFF' : '#000000',
                opacity: pressed ? 0.85 : 1,
              },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onDismiss();
            }}>
            <Text
              style={[
                styles.doneButtonText,
                { color: isDark ? '#000000' : '#FFFFFF' },
              ]}>
              Done
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheetCard: {
    width: '100%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
    gap: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 20,
  },
  handleBarWrapper: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  handleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 16,
  },
  settingTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 21,
  },
  doneButton: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  doneButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
