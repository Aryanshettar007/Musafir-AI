import React, { useState, useEffect } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { INTERESTS, DEFAULT_INTERESTS } from '@/constants/onboarding';

export interface MoodItem {
  id: string;
  label: string;
  emoji: string;
}

export const MOOD_ITEMS: MoodItem[] = [
  { id: 'history', label: 'History & Heritage', emoji: '🏛️' },
  { id: 'architecture', label: 'Forts & Architecture', emoji: '🏰' },
  { id: 'spirituality', label: 'Temples & Spirituality', emoji: '🛕' },
  { id: 'food', label: 'Food & Local Eats', emoji: '🍲' },
  { id: 'nature', label: 'Nature & Wildlife', emoji: '🌿' },
  { id: 'adventure', label: 'Adventure & Trekking', emoji: '🧗' },
  { id: 'art-culture', label: 'Art, Crafts & Museums', emoji: '🎨' },
  { id: 'legends', label: 'Myths & Legends', emoji: '📜' },
  { id: 'cinema', label: 'Cinema & Pop Culture', emoji: '🎬' },
];

export interface MoodSelectSheetModalProps {
  visible: boolean;
  onClose: () => void;
  selectedMoods: string[];
  onApply: (moods: string[]) => void;
}

export function MoodSelectSheetModal({
  visible,
  onClose,
  selectedMoods,
  onApply,
}: MoodSelectSheetModalProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [localSelected, setLocalSelected] = useState<string[]>(selectedMoods);

  useEffect(() => {
    if (visible) {
      setLocalSelected(selectedMoods && selectedMoods.length > 0 ? selectedMoods : [...DEFAULT_INTERESTS]);
    }
  }, [visible, selectedMoods]);

  const colors = {
    bg: isDark ? '#121214' : '#FFFFFF',
    overlay: 'rgba(0,0,0,0.6)',
    cardBg: isDark ? '#1C1C1E' : '#F6F6F8',
    itemActiveBg: isDark ? '#23252A' : '#EFEFF4',
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#8E8E93' : '#6E6E6E',
    divider: isDark ? '#1C1C1E' : '#EEEEEE',
    handle: isDark ? '#2E3036' : '#D0D0D6',
    activePillBg: isDark ? '#FFFFFF' : '#000000',
    activePillText: isDark ? '#000000' : '#FFFFFF',
    inactivePillBg: isDark ? '#1E1E22' : '#F0F0F0',
    inactivePillText: isDark ? '#A0A0A0' : '#555555',
    checkboxBorder: isDark ? '#444852' : '#C7C7CC',
  };

  const handleToggle = (id: string) => {
    Haptics.selectionAsync();
    setLocalSelected((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleSelectAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocalSelected(MOOD_ITEMS.map((m) => m.id));
  };

  const handleResetDefaults = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLocalSelected([...DEFAULT_INTERESTS]);
  };

  const handleApply = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onApply(localSelected.length > 0 ? localSelected : [...DEFAULT_INTERESTS]);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}>
      <Pressable style={[styles.overlay, { backgroundColor: colors.overlay }]} onPress={onClose}>
        <Pressable style={[styles.sheet, { backgroundColor: colors.bg }]} onPress={(e) => e.stopPropagation()}>
          {/* DRAG HANDLE */}
          <View style={styles.handleContainer}>
            <View style={[styles.dragHandle, { backgroundColor: colors.handle }]} />
          </View>

          {/* HEADER */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: colors.textPrimary }]}>Trip Mood</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {localSelected.length} {localSelected.length === 1 ? 'mood' : 'moods'} selected • steers highway stories
              </Text>
            </View>
            <Pressable hitSlop={12} onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>

          {/* QUICK ACTIONS */}
          <View style={styles.quickActionsRow}>
            <Pressable
              hitSlop={6}
              onPress={handleSelectAll}
              style={[styles.quickActionChip, { backgroundColor: colors.inactivePillBg }]}>
              <Text style={[styles.quickActionText, { color: colors.textSecondary }]}>Select all</Text>
            </Pressable>
            <Pressable
              hitSlop={6}
              onPress={handleResetDefaults}
              style={[styles.quickActionChip, { backgroundColor: colors.inactivePillBg }]}>
              <Text style={[styles.quickActionText, { color: colors.textSecondary }]}>Reset default</Text>
            </Pressable>
          </View>

          {/* MOOD OPTIONS LIST */}
          <ScrollView
            style={styles.optionsList}
            contentContainerStyle={styles.optionsContent}
            showsVerticalScrollIndicator={false}>
            {MOOD_ITEMS.map((mood) => {
              const isSelected = localSelected.includes(mood.id);
              return (
                <Pressable
                  key={mood.id}
                  onPress={() => handleToggle(mood.id)}
                  style={({ pressed }) => [
                    styles.moodRow,
                    {
                      backgroundColor: isSelected ? colors.itemActiveBg : 'transparent',
                    },
                    pressed && styles.pressed,
                  ]}>
                  <View style={styles.moodLabelContainer}>
                    <Text style={styles.moodEmoji}>{mood.emoji}</Text>
                    <Text
                      style={[
                        styles.moodLabel,
                        {
                          color: colors.textPrimary,
                          fontWeight: isSelected ? '600' : '400',
                        },
                      ]}>
                      {mood.label}
                    </Text>
                  </View>

                  <View
                    style={[
                      styles.checkbox,
                      {
                        borderColor: isSelected ? colors.activePillBg : colors.checkboxBorder,
                        backgroundColor: isSelected ? colors.activePillBg : 'transparent',
                      },
                    ]}>
                    {isSelected && (
                      <Ionicons name="checkmark" size={13} color={colors.activePillText} />
                    )}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* FOOTER */}
          <View style={[styles.footer, { borderTopColor: colors.divider }]}>
            <Pressable
              onPress={handleApply}
              style={({ pressed }) => [
                styles.applyBtn,
                { backgroundColor: colors.activePillBg },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.applyBtnText, { color: colors.activePillText }]}>
                Apply ({localSelected.length} Selected)
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export interface MoodSelectRowProps {
  label?: string;
  selectedMoods: string[];
  onApply: (moods: string[]) => void;
  disabled?: boolean;
  hideDivider?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function MoodSelectRow({
  label = 'Mood',
  selectedMoods = [],
  onApply,
  disabled = false,
  hideDivider = false,
  style,
}: MoodSelectRowProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [isOpen, setIsOpen] = useState(false);

  const colors = {
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#A0A0A0' : '#6E6E6E',
    divider: isDark ? '#1C1C1E' : '#EEEEEE',
  };

  const count = selectedMoods.length;
  const displayText = count === 0 ? 'Select mood' : `${count} mood selected`;

  return (
    <>
      <Pressable
        disabled={disabled}
        onPress={() => setIsOpen(true)}
        style={({ pressed }) => [
          styles.row,
          !hideDivider && { borderBottomColor: colors.divider },
          { opacity: disabled ? 0.5 : pressed ? 0.7 : 1 },
          style,
        ]}>
        <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
        <View style={styles.rowInteractiveValue}>
          <Text
            style={[
              styles.rowValueText,
              { color: count > 0 ? colors.textPrimary : colors.textSecondary },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail">
            {displayText}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </View>
      </Pressable>

      <MoodSelectSheetModal
        visible={isOpen}
        onClose={() => setIsOpen(false)}
        selectedMoods={selectedMoods}
        onApply={(moods) => {
          onApply(moods);
          setIsOpen(false);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: {
    fontSize: 15,
    fontWeight: '500',
    width: 125,
    flexShrink: 0,
  },
  rowInteractiveValue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    minWidth: 0,
    marginLeft: 8,
  },
  rowValueText: {
    fontSize: 15,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    paddingBottom: 24,
  },
  handleContainer: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 16,
  },
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  quickActionChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '500',
  },
  optionsList: {
    paddingHorizontal: 16,
    maxHeight: 380,
  },
  optionsContent: {
    paddingVertical: 4,
    gap: 4,
  },
  moodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
  },
  moodLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  moodEmoji: {
    fontSize: 18,
  },
  moodLabel: {
    fontSize: 15,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  applyBtn: {
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
