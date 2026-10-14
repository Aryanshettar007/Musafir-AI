import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  CreateReportPayload,
  ReportContentType,
  ReportReason,
} from '@/services/report-service';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface ReportTargetInfo {
  tripId?: string;
  itemId?: string;
  itemTitle?: string;
  transcriptSnippet?: string;
  audioUrl?: string;
  contentType: ReportContentType;
}

export interface ReportModalProps {
  visible: boolean;
  target: ReportTargetInfo | null;
  isSubmitting?: boolean;
  onSubmit: (payload: CreateReportPayload) => void;
  onDismiss: () => void;
}

const REASON_OPTIONS: { id: ReportReason; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { id: 'inappropriate', label: 'Inappropriate or offensive', icon: 'warning-outline' },
  { id: 'inaccurate', label: 'Inaccurate or misleading', icon: 'alert-circle-outline' },
  { id: 'harmful', label: 'Harmful or unsafe', icon: 'shield-outline' },
  { id: 'hate_speech', label: 'Hate speech or harassment', icon: 'hand-left-outline' },
  { id: 'other', label: 'Other issue', icon: 'help-circle-outline' },
];

export function ReportModal({
  visible,
  target,
  isSubmitting = false,
  onSubmit,
  onDismiss,
}: ReportModalProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [selectedReason, setSelectedReason] = useState<ReportReason>('inappropriate');
  const [details, setDetails] = useState('');

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(50)).current;

  useEffect(() => {
    if (visible) {
      setSelectedReason('inappropriate');
      setDetails('');
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.spring(slideAnim, {
          toValue: 0,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 50,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, fadeAnim, slideAnim]);

  const colors = {
    backdrop: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.5)',
    card: isDark ? '#1C1C1E' : '#FFFFFF',
    border: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)',
    text: isDark ? '#FFFFFF' : '#111827',
    textSecondary: isDark ? '#9CA3AF' : '#6B7280',
    primary: '#FF3B30',
    primaryMuted: isDark ? 'rgba(255, 59, 48, 0.18)' : '#FEE2E2',
    inputBg: isDark ? '#2C2C2E' : '#F3F4F6',
    cancelBg: isDark ? '#2C2C2E' : '#F3F4F6',
    chipSelected: isDark ? '#FF453A' : '#DC2626',
    chipSelectedBg: isDark ? 'rgba(255, 69, 58, 0.16)' : 'rgba(220, 38, 38, 0.08)',
    chipUnselectedBg: isDark ? '#2C2C2E' : '#F3F4F6',
  };

  const handleSubmit = () => {
    if (isSubmitting) return;
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    onSubmit({
      tripId: target?.tripId,
      itemId: target?.itemId,
      itemTitle: target?.itemTitle,
      contentType: target?.contentType ?? 'story',
      reason: selectedReason,
      details: details.trim() || undefined,
      transcriptSnippet: target?.transcriptSnippet,
      audioUrl: target?.audioUrl,
    });
  };

  const handleSelectReason = (reason: ReportReason) => {
    try {
      Haptics.selectionAsync();
    } catch {}
    setSelectedReason(reason);
  };

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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}>
        {/* Backdrop */}
        <Animated.View
          style={[
            styles.backdrop,
            { backgroundColor: colors.backdrop, opacity: fadeAnim },
          ]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        </Animated.View>

        {/* Modal Card */}
        <Animated.View
          style={[
            styles.cardWrapper,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.headerIconCircle, { backgroundColor: colors.primaryMuted }]}>
                <Ionicons name="flag" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.text }]}>
                  Report AI Content
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Flag inappropriate or inaccurate narration
                </Text>
              </View>
              <Pressable
                onPress={onDismiss}
                hitSlop={12}
                style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.5 }]}>
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={styles.scrollBody}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            {/* Target Item Preview */}
            {(target?.itemTitle || target?.transcriptSnippet) && (
              <View
                style={[
                  styles.previewBox,
                  { backgroundColor: colors.inputBg, borderColor: colors.border },
                ]}>
                <View style={styles.previewHeader}>
                  <Text style={[styles.previewBadge, { color: colors.textSecondary }]}>
                    {target?.contentType === 'live_qa'
                      ? 'MUSAFIR LIVE ANSWER'
                      : 'AI GENERATED STORY'}
                  </Text>
                </View>
                {Boolean(target?.itemTitle) && (
                  <Text
                    style={[styles.previewTitle, { color: colors.text }]}
                    numberOfLines={1}>
                    {target?.itemTitle}
                  </Text>
                )}
                {Boolean(target?.transcriptSnippet) && (
                  <Text
                    style={[styles.previewSnippet, { color: colors.textSecondary }]}
                    numberOfLines={3}>
                    "{target?.transcriptSnippet}"
                  </Text>
                )}
              </View>
            )}

            {/* Reason Selection */}
            <Text style={[styles.sectionLabel, { color: colors.text }]}>
              Why are you reporting this?
            </Text>
            <View style={styles.reasonsList}>
              {REASON_OPTIONS.map((opt) => {
                const isSelected = selectedReason === opt.id;
                return (
                  <Pressable
                    key={opt.id}
                    onPress={() => handleSelectReason(opt.id)}
                    style={({ pressed }) => [
                      styles.reasonOption,
                      {
                        backgroundColor: isSelected
                          ? colors.chipSelectedBg
                          : colors.chipUnselectedBg,
                        borderColor: isSelected ? colors.chipSelected : colors.border,
                        opacity: pressed ? 0.8 : 1,
                      },
                    ]}>
                    <Ionicons
                      name={opt.icon}
                      size={16}
                      color={isSelected ? colors.chipSelected : colors.textSecondary}
                    />
                    <Text
                      style={[
                        styles.reasonLabel,
                        {
                          color: isSelected ? colors.chipSelected : colors.text,
                          fontWeight: isSelected ? '600' : '500',
                        },
                      ]}>
                      {opt.label}
                    </Text>
                    {isSelected && (
                      <Ionicons
                        name="checkmark-circle"
                        size={18}
                        color={colors.chipSelected}
                        style={{ marginLeft: 'auto' }}
                      />
                    )}
                  </Pressable>
                );
              })}
            </View>

            {/* Optional Details Input */}
            <Text style={[styles.sectionLabel, { color: colors.text, marginTop: 14 }]}>
              Additional details (optional)
            </Text>
            <TextInput
              style={[
                styles.detailsInput,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              placeholder="Tell us what was objectionable or incorrect..."
              placeholderTextColor={colors.textSecondary}
              multiline
              numberOfLines={3}
              value={details}
              onChangeText={setDetails}
              maxLength={500}
            />

            {/* Zero Tolerance Policy Notice (Apple & Google Play Compliance) */}
            <View style={[styles.policyBox, { borderColor: colors.border }]}>
              <Ionicons name="shield-checkmark" size={14} color="#34C759" />
              <Text style={[styles.policyText, { color: colors.textSecondary }]}>
                Musafir AI enforces zero tolerance for objectionable or abusive content. Reports are reviewed by human moderators within 24 hours.
              </Text>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
            <Pressable
              onPress={onDismiss}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.cancelButton,
                { backgroundColor: colors.cancelBg, opacity: pressed ? 0.7 : 1 },
              ]}>
              <Text style={[styles.cancelButtonText, { color: colors.text }]}>Cancel</Text>
            </Pressable>

            <Pressable
              onPress={handleSubmit}
              disabled={isSubmitting}
              style={({ pressed }) => [
                styles.submitButton,
                {
                  backgroundColor: colors.primary,
                  opacity: isSubmitting || pressed ? 0.75 : 1,
                },
              ]}>
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Submit Report</Text>
              )}
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  cardWrapper: {
    width: '100%',
    maxHeight: SCREEN_HEIGHT * 0.88,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 20,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12.5,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
  },
  scrollBody: {
    maxHeight: SCREEN_HEIGHT * 0.55,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  previewBox: {
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 14,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  previewBadge: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  previewTitle: {
    fontSize: 13.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  previewSnippet: {
    fontSize: 12,
    lineHeight: 16,
    fontStyle: 'italic',
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  reasonsList: {
    gap: 7,
  },
  reasonOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  reasonLabel: {
    fontSize: 13.5,
  },
  detailsInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    textAlignVertical: 'top',
    minHeight: 70,
  },
  policyBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 14,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  policyText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 15,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  cancelButton: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  submitButton: {
    flex: 1.6,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
