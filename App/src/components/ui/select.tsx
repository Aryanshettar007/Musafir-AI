import React, { useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { useColorScheme } from '@/hooks/use-color-scheme';

export interface SelectOption {
  label: string;
  value: string;
}

export interface SelectProps {
  label?: string;
  placeholder?: string;
  value?: string;
  options: readonly string[] | readonly SelectOption[];
  onSelect: (value: string) => void;
  title?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function Select({
  label,
  placeholder = 'Select an option',
  value,
  options,
  onSelect,
  title,
  containerStyle,
}: SelectProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [isOpen, setIsOpen] = useState(false);

  const formattedOptions: SelectOption[] = options.map((opt) =>
    typeof opt === 'string' ? { label: opt, value: opt } : opt
  );

  const selectedOption = formattedOptions.find((opt) => opt.value === value);

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <ThemedText type="small" style={styles.label}>
          {label}
        </ThemedText>
      )}

      {/* Trigger */}
      <Pressable
        onPress={() => setIsOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: isDark ? '#09090b' : '#ffffff',
            borderColor: isDark ? '#27272a' : '#e4e4e7',
            opacity: pressed ? 0.8 : 1,
          },
        ]}>
        <Text
          numberOfLines={1}
          style={[
            styles.triggerText,
            {
              color: selectedOption
                ? isDark
                  ? '#fafafa'
                  : '#09090b'
                : isDark
                ? '#71717a'
                : '#a1a1aa',
            },
          ]}>
          {selectedOption ? selectedOption.label : placeholder}
        </Text>
        <Text style={[styles.chevron, { color: isDark ? '#71717a' : '#a1a1aa' }]}>
          ▼
        </Text>
      </Pressable>

      {/* Dropdown Modal */}
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsOpen(false)}>
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: isDark ? '#121215' : '#ffffff',
                borderColor: isDark ? '#27272a' : '#e4e4e7',
              },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <ThemedText type="default" style={styles.modalTitle}>
                {title || label || 'Select Option'}
              </ThemedText>
              <Pressable
                hitSlop={16}
                onPress={() => setIsOpen(false)}
                style={[
                  styles.closeButton,
                  { backgroundColor: isDark ? '#27272a' : '#f4f4f5' },
                ]}>
                <Text style={[styles.closeIcon, { color: isDark ? '#e4e4e7' : '#52525b' }]}>
                  ✕
                </Text>
              </Pressable>
            </View>

            <ScrollView style={styles.optionsList} showsVerticalScrollIndicator>
              {formattedOptions.map((opt) => {
                const isSelected = opt.value === value;
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => {
                      onSelect(opt.value);
                      setIsOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.optionItem,
                      isSelected && {
                        backgroundColor: isDark ? '#27272a' : '#f4f4f5',
                      },
                      pressed && { opacity: 0.7 },
                    ]}>
                    <Text
                      style={[
                        styles.optionLabel,
                        {
                          color: isSelected
                            ? isDark
                              ? '#fafafa'
                              : '#09090b'
                            : isDark
                            ? '#d4d4d8'
                            : '#3f3f46',
                          fontWeight: isSelected ? '600' : '400',
                        },
                      ]}>
                      {opt.label}
                    </Text>
                    {isSelected && (
                      <Text
                        style={[
                          styles.checkMark,
                          { color: isDark ? '#fafafa' : '#09090b' },
                        ]}>
                        ✓
                      </Text>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export interface MultiSelectProps {
  label?: string;
  placeholder?: string;
  values: string[];
  options: readonly string[] | readonly SelectOption[];
  onToggle: (value: string) => void;
  title?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export function MultiSelect({
  label,
  placeholder = 'Select options',
  values,
  options,
  onToggle,
  title,
  containerStyle,
}: MultiSelectProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [isOpen, setIsOpen] = useState(false);

  const formattedOptions: SelectOption[] = options.map((opt) =>
    typeof opt === 'string' ? { label: opt, value: opt } : opt
  );

  const selectedLabels = formattedOptions
    .filter((opt) => values.includes(opt.value))
    .map((opt) => opt.label);

  const triggerDisplayText =
    selectedLabels.length === 0
      ? placeholder
      : selectedLabels.length <= 2
      ? selectedLabels.join(', ')
      : `${selectedLabels.length} interests selected`;

  return (
    <View style={[styles.container, containerStyle]}>
      {label && (
        <ThemedText type="small" style={styles.label}>
          {label}
        </ThemedText>
      )}

      {/* Trigger */}
      <Pressable
        onPress={() => setIsOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          {
            backgroundColor: isDark ? '#09090b' : '#ffffff',
            borderColor: isDark ? '#27272a' : '#e4e4e7',
            opacity: pressed ? 0.8 : 1,
          },
        ]}>
        <Text
          numberOfLines={1}
          style={[
            styles.triggerText,
            {
              color: values.length > 0
                ? isDark
                  ? '#fafafa'
                  : '#09090b'
                : isDark
                ? '#71717a'
                : '#a1a1aa',
            },
          ]}>
          {triggerDisplayText}
        </Text>
        <Text style={[styles.chevron, { color: isDark ? '#71717a' : '#a1a1aa' }]}>
          ▼
        </Text>
      </Pressable>

      {/* Selected tags preview */}
      {values.length > 0 && (
        <View style={styles.tagsContainer}>
          {values.map((val) => (
            <View
              key={val}
              style={[
                styles.tag,
                {
                  backgroundColor: isDark ? '#1f2024' : '#f4f4f5',
                  borderColor: isDark ? '#2e3036' : '#e4e4e7',
                },
              ]}>
              <Text
                style={[
                  styles.tagText,
                  { color: isDark ? '#d4d4d8' : '#3f3f46' },
                ]}>
                {val}
              </Text>
              <Pressable hitSlop={14} onPress={() => onToggle(val)}>
                <Text
                  style={[
                    styles.tagRemove,
                    { color: isDark ? '#a1a1aa' : '#71717a' },
                  ]}>
                  ✕
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {/* Multi-select Modal */}
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setIsOpen(false)}>
          <Pressable
            style={[
              styles.modalCard,
              {
                backgroundColor: isDark ? '#121215' : '#ffffff',
                borderColor: isDark ? '#27272a' : '#e4e4e7',
              },
            ]}
            onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View>
                <ThemedText type="default" style={styles.modalTitle}>
                  {title || label || 'Select Options'}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.modalSubtitle}>
                  {values.length} selected
                </ThemedText>
              </View>
              <Pressable
                hitSlop={16}
                onPress={() => setIsOpen(false)}
                style={[
                  styles.closeButton,
                  { backgroundColor: isDark ? '#27272a' : '#f4f4f5' },
                ]}>
                <Text style={[styles.closeIcon, { color: isDark ? '#e4e4e7' : '#52525b' }]}>
                  ✕
                </Text>
              </Pressable>
            </View>

            <ScrollView style={styles.optionsList} showsVerticalScrollIndicator>
              {formattedOptions.map((opt) => {
                const isSelected = values.includes(opt.value);
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => onToggle(opt.value)}
                    style={({ pressed }) => [
                      styles.optionItem,
                      isSelected && {
                        backgroundColor: isDark ? '#27272a' : '#f4f4f5',
                      },
                      pressed && { opacity: 0.7 },
                    ]}>
                    <Text
                      style={[
                        styles.optionLabel,
                        {
                          color: isSelected
                            ? isDark
                              ? '#fafafa'
                              : '#09090b'
                            : isDark
                            ? '#d4d4d8'
                            : '#3f3f46',
                          fontWeight: isSelected ? '600' : '400',
                        },
                      ]}>
                      {opt.label}
                    </Text>
                    <View
                      style={[
                        styles.checkbox,
                        {
                          borderColor: isSelected
                            ? isDark
                              ? '#fafafa'
                              : '#09090b'
                            : isDark
                            ? '#52525b'
                            : '#d4d4d8',
                          backgroundColor: isSelected
                            ? isDark
                              ? '#fafafa'
                              : '#09090b'
                            : 'transparent',
                        },
                      ]}>
                      {isSelected && (
                        <Text
                          style={[
                            styles.checkboxTick,
                            { color: isDark ? '#09090b' : '#fafafa' },
                          ]}>
                          ✓
                        </Text>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalFooter}>
              <Button
                variant="default"
                size="default"
                onPress={() => setIsOpen(false)}
                style={styles.doneButton}>
                Done ({values.length} Selected)
              </Button>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
    width: '100%',
  },
  label: {
    fontWeight: '500',
    fontSize: 14,
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 14,
    height: 44,
  },
  triggerText: {
    fontSize: 14,
    flex: 1,
    marginRight: 8,
  },
  chevron: {
    fontSize: 10,
    opacity: 0.7,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '500',
  },
  tagRemove: {
    fontSize: 10,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '75%',
    borderRadius: 14,
    borderWidth: 1,
    paddingTop: 18,
    paddingBottom: 16,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#71717a33',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: {
    fontSize: 16,
    fontWeight: '700',
    lineHeight: 18,
  },
  optionsList: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 2,
  },
  optionLabel: {
    fontSize: 14,
    flex: 1,
    marginRight: 10,
  },
  checkMark: {
    fontSize: 14,
    fontWeight: '700',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxTick: {
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 14,
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#71717a33',
  },
  doneButton: {
    width: '100%',
  },
});
