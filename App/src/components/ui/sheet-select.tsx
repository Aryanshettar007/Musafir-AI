import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/hooks/use-color-scheme';

export interface SelectOption {
  label: string;
  value: string;
}

// Helper to normalize options
const formatOptions = (
  options: readonly string[] | readonly SelectOption[]
): SelectOption[] => {
  return options.map((opt) =>
    typeof opt === 'string' ? { label: opt, value: opt } : opt
  );
};

// ==========================================
// 1. SELECT ROW (Single Select Bottom Sheet)
// ==========================================
export interface SelectRowProps {
  label: string;
  value?: string;
  placeholder?: string;
  options: readonly string[] | readonly SelectOption[];
  onSelect: (value: string) => void;
  title?: string;
  disabled?: boolean;
  hideDivider?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function SelectRow({
  label,
  value,
  placeholder = 'Select',
  options,
  onSelect,
  title,
  disabled = false,
  hideDivider = false,
  style,
}: SelectRowProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [isOpen, setIsOpen] = useState(false);

  const formatted = formatOptions(options);
  const current = formatted.find((opt) => opt.value === value);

  const colors = {
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#A0A0A0' : '#6E6E6E',
    divider: isDark ? '#1C1C1E' : '#EEEEEE',
    modalBg: isDark ? '#121214' : '#FFFFFF',
    selectedBg: isDark ? '#1E1E22' : '#F3F3F3',
  };

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
              { color: current ? colors.textPrimary : colors.textSecondary },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail">
            {current ? current.label : placeholder}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </View>
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsOpen(false)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: colors.modalBg }]}
            onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {title || label}
              </Text>
              <Pressable hitSlop={12} onPress={() => setIsOpen(false)}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {formatted.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      Haptics.selectionAsync();
                      onSelect(opt.value);
                      setIsOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.modalOptionRow,
                      isSelected && { backgroundColor: colors.selectedBg },
                      pressed && { opacity: 0.7 },
                    ]}>
                    <Text
                      style={[
                        styles.modalOptionText,
                        {
                          color: colors.textPrimary,
                          fontWeight: isSelected ? '600' : '400',
                        },
                      ]}>
                      {opt.label}
                    </Text>
                    {isSelected && (
                      <Ionicons name="checkmark" size={18} color={colors.textPrimary} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ===============================================
// 2. MULTI SELECT ROW (Multi-Choice Bottom Sheet)
// ===============================================
export interface MultiSelectRowProps {
  label: string;
  values: string[];
  placeholder?: string;
  options: readonly string[] | readonly SelectOption[];
  onToggle: (value: string) => void;
  onChangeValues?: (values: string[]) => void;
  title?: string;
  disabled?: boolean;
  showPills?: boolean;
  hideDivider?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function MultiSelectRow({
  label,
  values,
  placeholder = 'Select',
  options,
  onToggle,
  onChangeValues,
  title,
  disabled = false,
  showPills = true,
  hideDivider = false,
  style,
}: MultiSelectRowProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [isOpen, setIsOpen] = useState(false);

  const formatted = formatOptions(options);

  const colors = {
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#A0A0A0' : '#6E6E6E',
    divider: isDark ? '#1C1C1E' : '#EEEEEE',
    pillBg: isDark ? '#1A1A1C' : '#F3F3F3',
    modalBg: isDark ? '#121214' : '#FFFFFF',
    selectedBg: isDark ? '#1E1E22' : '#F3F3F3',
    primaryButtonBg: isDark ? '#FFFFFF' : '#000000',
    primaryButtonText: isDark ? '#000000' : '#FFFFFF',
  };

  const allOptionValues = formatted.map((opt) => opt.value);
  const isAllSelected =
    formatted.length > 0 && allOptionValues.every((val) => values.includes(val));

  const handleToggleSelectAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isAllSelected) {
      if (onChangeValues) {
        onChangeValues([]);
      } else {
        values.forEach((v) => onToggle(v));
      }
    } else {
      if (onChangeValues) {
        onChangeValues([...allOptionValues]);
      } else {
        allOptionValues.forEach((val) => {
          if (!values.includes(val)) {
            onToggle(val);
          }
        });
      }
    }
  };

  const handleClearAll = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onChangeValues) {
      onChangeValues([]);
    } else {
      values.forEach((v) => onToggle(v));
    }
  };

  const displayText =
    values.length === 0
      ? placeholder
      : isAllSelected
      ? `All selected (${values.length})`
      : `${values.length} selected`;

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
              { color: values.length > 0 ? colors.textPrimary : colors.textSecondary },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail">
            {displayText}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </View>
      </Pressable>

      {/* Pill tags preview */}
      {showPills && values.length > 0 && (
        <View style={[styles.pillsContainer, !hideDivider && { borderBottomColor: colors.divider }]}>
          {values.map((val) => {
            const match = formatted.find((o) => o.value === val);
            const displayLabel = match ? match.label : val;
            return (
              <View key={val} style={[styles.pill, { backgroundColor: colors.pillBg }]}>
                <Text style={[styles.pillText, { color: colors.textPrimary }]}>
                  {displayLabel}
                </Text>
                <Pressable
                  hitSlop={8}
                  onPress={() => {
                    Haptics.selectionAsync();
                    onToggle(val);
                  }}>
                  <Ionicons name="close" size={13} color={colors.textSecondary} />
                </Pressable>
              </View>
            );
          })}
        </View>
      )}

      {/* Multi-Select Modal */}
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsOpen(false)}>
          <Pressable
            style={[styles.modalSheet, { backgroundColor: colors.modalBg }]}
            onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  {title || label}
                </Text>
                <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                  {isAllSelected
                    ? `All ${formatted.length} selected`
                    : values.length === 0
                    ? `Choose your preferences`
                    : `${values.length} of ${formatted.length} selected`}
                </Text>
              </View>
              <Pressable hitSlop={12} onPress={() => setIsOpen(false)}>
                <Ionicons name="close" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>

            {/* Quick Actions: Select All / Clear */}
            <View
              style={[
                styles.modalActionBar,
                { borderBottomColor: colors.divider },
              ]}>
              <Pressable
                onPress={handleToggleSelectAll}
                hitSlop={6}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isAllSelected }}
                style={({ pressed }) => [
                  styles.selectAllRow,
                  pressed && { opacity: 0.65 },
                ]}>
                <View
                  style={[
                    styles.checkbox,
                    {
                      borderColor: isAllSelected
                        ? colors.textPrimary
                        : colors.textSecondary,
                      backgroundColor: isAllSelected
                        ? colors.textPrimary
                        : 'transparent',
                    },
                  ]}>
                  {isAllSelected && (
                    <Ionicons
                      name="checkmark"
                      size={13}
                      color={colors.primaryButtonText}
                    />
                  )}
                </View>
                <Text
                  style={[
                    styles.selectAllText,
                    {
                      color: colors.textPrimary,
                      fontWeight: isAllSelected ? '600' : '500',
                    },
                  ]}>
                  {isAllSelected ? 'Deselect All' : `Select All (${formatted.length})`}
                </Text>
              </Pressable>

              {values.length > 0 && !isAllSelected && (
                <Pressable
                  onPress={handleClearAll}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.clearButton,
                    pressed && { opacity: 0.65 },
                  ]}>
                  <Text style={[styles.clearButtonText, { color: colors.textSecondary }]}>
                    Clear
                  </Text>
                </Pressable>
              )}
            </View>

            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {formatted.map((opt) => {
                const isSelected = values.includes(opt.value);
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      Haptics.selectionAsync();
                      onToggle(opt.value);
                    }}
                    style={({ pressed }) => [
                      styles.modalOptionRow,
                      isSelected && { backgroundColor: colors.selectedBg },
                      pressed && { opacity: 0.7 },
                    ]}>
                    <Text
                      style={[
                        styles.modalOptionText,
                        {
                          color: colors.textPrimary,
                          fontWeight: isSelected ? '600' : '400',
                        },
                      ]}>
                      {opt.label}
                    </Text>
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: isSelected ? colors.textPrimary : colors.textSecondary,
                          backgroundColor: isSelected ? colors.textPrimary : 'transparent',
                        },
                      ]}>
                      {isSelected && (
                        <Ionicons
                          name="checkmark"
                          size={13}
                          color={colors.primaryButtonText}
                        />
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={[styles.modalFooter, { borderTopColor: colors.divider }]}>
              <Pressable
                onPress={() => setIsOpen(false)}
                style={[styles.modalDoneButton, { backgroundColor: colors.primaryButtonBg }]}>
                <Text style={[styles.modalDoneButtonText, { color: colors.primaryButtonText }]}>
                  {isAllSelected
                    ? `Done (All ${values.length})`
                    : `Done (${values.length})`}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

// ==========================================
// 3. INPUT ROW (Minimalist Uber-Style Input)
// ==========================================
export interface InputRowProps extends TextInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  hideDivider?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
}

export function InputRow({
  label,
  value,
  onChangeText,
  placeholder,
  hideDivider = false,
  containerStyle,
  style,
  ...props
}: InputRowProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const colors = {
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#A0A0A0' : '#6E6E6E',
    divider: isDark ? '#1C1C1E' : '#EEEEEE',
  };

  return (
    <View
      style={[
        styles.row,
        !hideDivider && { borderBottomColor: colors.divider },
        containerStyle,
      ]}>
      <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        style={[styles.rowInput, { color: colors.textPrimary }, style]}
        {...props}
      />
    </View>
  );
}

// ==========================================
// 4. PILL LIST (Standalone Removable Tags)
// ==========================================
export interface PillListProps {
  items: string[];
  onRemove: (item: string) => void;
  hideDivider?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function PillList({ items, onRemove, hideDivider = false, style }: PillListProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const colors = {
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#A0A0A0' : '#6E6E6E',
    divider: isDark ? '#1C1C1E' : '#EEEEEE',
    pillBg: isDark ? '#1A1A1C' : '#F3F3F3',
  };

  if (items.length === 0) return null;

  return (
    <View style={[styles.pillsContainer, !hideDivider && { borderBottomColor: colors.divider }, style]}>
      {items.map((item) => (
        <View key={item} style={[styles.pill, { backgroundColor: colors.pillBg }]}>
          <Text style={[styles.pillText, { color: colors.textPrimary }]}>{item}</Text>
          <Pressable
            hitSlop={8}
            onPress={() => {
              Haptics.selectionAsync();
              onRemove(item);
            }}>
            <Ionicons name="close" size={13} color={colors.textSecondary} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

// Convenient Aliases
export const SheetSelect = SelectRow;
export const SheetMultiSelect = MultiSelectRow;

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
  rowInput: {
    flex: 1,
    fontSize: 15,
    textAlign: 'right',
    paddingVertical: 0,
    fontWeight: '500',
    minWidth: 0,
    marginLeft: 8,
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
  pillsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  pillText: {
    fontSize: 12,
    fontWeight: '500',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '75%',
    paddingBottom: 24,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  modalList: {
    paddingHorizontal: 12,
  },
  modalOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 8,
    marginVertical: 1,
  },
  modalOptionText: {
    fontSize: 15,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  modalActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  selectAllText: {
    fontSize: 14,
    letterSpacing: -0.1,
  },
  clearButton: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearButtonText: {
    fontSize: 13,
    fontWeight: '500',
  },
  modalDoneButton: {
    height: 48,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDoneButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
