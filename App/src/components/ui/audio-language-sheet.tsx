import React, { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { Image } from 'expo-image';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  CatalogLanguage,
  VoiceModel,
  fetchCatalog,
  fetchVoices,
  FALLBACK_LANGUAGES,
  VOICE_AVATAR_MAP,
  getVoiceAvatarSource,
} from '@/services/catalog-service';
import { mapLanguageToLabel, mapLanguage } from '@/services/user-service';
import { getCachedAudioUri } from '@/services/audio-cache';

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_PALETTE = [
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#10B981',
  '#F59E0B',
  '#6366F1',
  '#06B6D4',
  '#F97316',
];

function getAvatarColor(name: string): string {
  if (!name) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export interface AudioLanguageSelection {
  language: string; // e.g. 'en-IN' or 'English'
  languageId: string; // e.g. 'en-IN'
  voiceGender: 'male' | 'female';
  voice: string; // e.g. 'Nalini' or 'Deepak'
}

export interface AudioLanguageRowProps {
  label?: string;
  language?: string; // language label or id
  voiceGender?: 'male' | 'female';
  voice?: string;
  placeholder?: string;
  onConfirm: (selection: AudioLanguageSelection) => void;
  disabled?: boolean;
  hideDivider?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AudioLanguageRow({
  label = 'Audio Language',
  language,
  voiceGender,
  voice,
  placeholder = 'Select language & voice',
  onConfirm,
  disabled = false,
  hideDivider = false,
  style,
}: AudioLanguageRowProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const [isOpen, setIsOpen] = useState(false);

  // Formatted display text: e.g. "English • Nalini" or placeholder
  const rawLang = language ? mapLanguageToLabel(language) : '';
  const displayLang = rawLang.replace(/\s*\([^)]*\)/g, '').trim() || rawLang;
  const hasSelection = Boolean(displayLang && voice);
  const displayText = hasSelection
    ? `${displayLang} • ${voice}`
    : placeholder;

  const colors = {
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#A0A0A0' : '#6E6E6E',
    divider: isDark ? '#1C1C1E' : '#EEEEEE',
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
              { color: hasSelection ? colors.textPrimary : colors.textSecondary },
            ]}
            numberOfLines={1}
            ellipsizeMode="tail">
            {displayText}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
        </View>
      </Pressable>

      <AudioLanguageSheetModal
        visible={isOpen}
        onClose={() => setIsOpen(false)}
        initialLanguage={language}
        initialGender={voiceGender}
        initialVoice={voice}
        onApply={(sel) => {
          onConfirm(sel);
          setIsOpen(false);
        }}
      />
    </>
  );
}

export interface AudioLanguageSheetModalProps {
  visible: boolean;
  onClose: () => void;
  initialLanguage?: string;
  initialGender?: 'male' | 'female';
  initialVoice?: string;
  onApply: (selection: AudioLanguageSelection) => void;
}

export function AudioLanguageSheetModal({
  visible,
  onClose,
  initialLanguage,
  initialGender,
  initialVoice = '',
  onApply,
}: AudioLanguageSheetModalProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Selected State inside modal
  const [selectedGender, setSelectedGender] = useState<'male' | 'female'>(
    initialGender || 'female'
  );
  const [selectedLangId, setSelectedLangId] = useState<string>(() =>
    initialLanguage ? mapLanguage(initialLanguage) : 'en-IN'
  );
  const [selectedVoice, setSelectedVoice] = useState<string>(initialVoice || '');

  // Backend Catalog & Voices State
  const [languages, setLanguages] = useState<CatalogLanguage[]>(FALLBACK_LANGUAGES);
  const [voices, setVoices] = useState<VoiceModel[]>([]);
  const [loadingVoices, setLoadingVoices] = useState<boolean>(false);

  // Audio preview playback state
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const [loadingVoice, setLoadingVoice] = useState<string | null>(null);
  const activePlayerRef = useRef<any>(null);
  const activeSubscriptionRef = useRef<any>(null);
  const playRequestIdRef = useRef<number>(0);

  const colors = {
    bg: isDark ? '#121214' : '#FFFFFF',
    cardBg: isDark ? '#1C1C1E' : '#F6F6F6',
    activePillBg: isDark ? '#FFFFFF' : '#000000',
    activePillText: isDark ? '#000000' : '#FFFFFF',
    inactivePillBg: isDark ? '#1E1E22' : '#F0F0F0',
    inactivePillText: isDark ? '#A0A0A0' : '#555555',
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#8E8E93' : '#6E6E6E',
    divider: isDark ? '#1C1C1E' : '#EEEEEE',
    accent: isDark ? '#FFFFFF' : '#000000',
    recommendedBadgeBg: isDark ? '#2C2C2E' : '#E8E8E8',
    recommendedBadgeText: isDark ? '#E5E5EA' : '#1C1C1E',
    playButtonBg: isDark ? '#2A2A2D' : '#EAEAEA',
    playButtonActiveBg: isDark ? '#FFFFFF' : '#000000',
    playButtonActiveIcon: isDark ? '#000000' : '#FFFFFF',
  };

  // Cleanup audio preview on unmount
  useEffect(() => {
    return () => {
      stopAudioPreview();
    };
  }, []);

  // Sync state when modal opens
  useEffect(() => {
    if (visible) {
      const targetLangId = initialLanguage ? mapLanguage(initialLanguage) : 'en-IN';
      setSelectedGender(initialGender || 'female');
      setSelectedLangId(targetLangId);
      setSelectedVoice(initialVoice || '');
    } else {
      stopAudioPreview();
    }
  }, [visible, initialLanguage, initialGender, initialVoice]);

  // Load languages from backend /catalog on mount
  useEffect(() => {
    let isMounted = true;
    async function loadCatalog() {
      const data = await fetchCatalog();
      if (isMounted && data.languages.length > 0) {
        setLanguages(data.languages);
      }
    }
    loadCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch available models from backend /voices whenever language or gender changes
  useEffect(() => {
    if (!visible) return;

    let isMounted = true;
    async function loadVoices() {
      setLoadingVoices(true);
      stopAudioPreview();

      const list = await fetchVoices(selectedLangId, selectedGender);
      if (!isMounted) return;

      setVoices(list);
      setLoadingVoices(false);

      // If current selected voice is not in the new list, auto-select only if a voice was already chosen
      if (list.length > 0 && selectedVoice) {
        const stillValid = list.some((v) => v.name === selectedVoice && (v.isCustom || v.gender === selectedGender));
        if (!stillValid) {
          const recommended = list.find((v) => v.recommended) || list[0];
          setSelectedVoice(recommended.name);
        }
      }
    }

    loadVoices();
    return () => {
      isMounted = false;
    };
  }, [visible, selectedLangId, selectedGender]);

  // Stop any active audio player
  const stopAudioPreview = () => {
    playRequestIdRef.current += 1;

    if (activeSubscriptionRef.current) {
      try {
        activeSubscriptionRef.current.remove();
      } catch (err) {
        // Subscription cleanup
      }
      activeSubscriptionRef.current = null;
    }

    if (activePlayerRef.current) {
      try {
        activePlayerRef.current.pause();
        if (typeof activePlayerRef.current.remove === 'function') {
          activePlayerRef.current.remove();
        }
      } catch (err) {
        // Player cleanup
      }
      activePlayerRef.current = null;
    }
    setPlayingVoice(null);
    setLoadingVoice(null);
  };

  // Play / Toggle voice demo preview
  const handleTogglePlay = async (voiceModel: VoiceModel) => {
    if (!voiceModel.demoUrl) return;

    if (playingVoice === voiceModel.name || loadingVoice === voiceModel.name) {
      stopAudioPreview();
      return;
    }

    stopAudioPreview();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const currentRequestId = ++playRequestIdRef.current;
    setLoadingVoice(voiceModel.name);

    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      const cacheKey = `${selectedLangId}_${voiceModel.name}`;
      const sourceUri = await getCachedAudioUri(voiceModel.demoUrl, cacheKey);

      // Guard against race conditions if user stopped or selected another voice
      if (playRequestIdRef.current !== currentRequestId) {
        return;
      }

      setLoadingVoice(null);

      const player = createAudioPlayer(sourceUri);
      activePlayerRef.current = player;
      setPlayingVoice(voiceModel.name);

      const sub = player.addListener('playbackStatusUpdate', (status: any) => {
        if (
          status.didJustFinish ||
          (!status.playing &&
            status.isLoaded &&
            status.duration > 0 &&
            Math.abs(status.currentTime - status.duration) < 0.2)
        ) {
          stopAudioPreview();
        }
      });
      activeSubscriptionRef.current = sub;

      player.play();
    } catch (err) {
      console.warn('[AudioLanguageSheet] Failed to play demo clip:', err);
      if (playRequestIdRef.current === currentRequestId) {
        stopAudioPreview();
      }
    }
  };

  // Gender toggle handler
  const handleGenderSelect = (gender: 'male' | 'female') => {
    if (gender === selectedGender) return;
    Haptics.selectionAsync();
    setSelectedGender(gender);
  };

  // Language selection handler
  const handleLanguageSelect = (langId: string) => {
    if (langId === selectedLangId) return;
    Haptics.selectionAsync();
    setSelectedLangId(langId);
  };

  // Voice model selection handler
  const handleVoiceSelect = (voiceName: string) => {
    Haptics.selectionAsync();
    setSelectedVoice(voiceName);
  };

  // Apply changes
  const handleApply = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    stopAudioPreview();

    const currentLangObj = languages.find((l) => l.id === selectedLangId);
    const langLabel = currentLangObj ? currentLangObj.label : mapLanguageToLabel(selectedLangId);

    onApply({
      language: langLabel,
      languageId: selectedLangId,
      voiceGender: selectedGender,
      voice: selectedVoice,
    });
  };

  const currentLangLabel =
    languages.find((l) => l.id === selectedLangId)?.label ||
    mapLanguageToLabel(selectedLangId);

  const isCustomVoiceSelected = Boolean(
    voices.find((v) => v.name === selectedVoice)?.isCustom
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        stopAudioPreview();
        onClose();
      }}>
      <Pressable
        style={styles.modalOverlay}
        onPress={() => {
          stopAudioPreview();
          onClose();
        }}>
        <Pressable
          style={[styles.modalSheet, { backgroundColor: colors.bg }]}
          onPress={(e) => e.stopPropagation()}>
          {/* Header */}
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
              Audio Language
            </Text>
            <Pressable
              hitSlop={12}
              onPress={() => {
                stopAudioPreview();
                onClose();
              }}
              style={styles.closeButton}>
              <Ionicons name="close" size={20} color={colors.textPrimary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}>
            {/* GENDER */}
            <View style={styles.section}>
              <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                GENDER
              </Text>
              <View style={styles.genderRow}>
                <Pressable
                  disabled={isCustomVoiceSelected}
                  onPress={() => handleGenderSelect('male')}
                  style={[
                    styles.genderPill,
                    {
                      backgroundColor:
                        selectedGender === 'male'
                          ? colors.activePillBg
                          : colors.inactivePillBg,
                      opacity: isCustomVoiceSelected ? 0.4 : 1,
                    },
                  ]}>
                  <Ionicons
                    name="man"
                    size={16}
                    color={
                      selectedGender === 'male'
                        ? colors.activePillText
                        : colors.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.genderPillText,
                      {
                        color:
                          selectedGender === 'male'
                            ? colors.activePillText
                            : colors.inactivePillText,
                      },
                    ]}>
                    Male
                  </Text>
                  {isCustomVoiceSelected && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.diagonalStrike,
                        { backgroundColor: isDark ? '#E4E4E7' : '#52525B' },
                      ]}
                    />
                  )}
                </Pressable>

                <Pressable
                  disabled={isCustomVoiceSelected}
                  onPress={() => handleGenderSelect('female')}
                  style={[
                    styles.genderPill,
                    {
                      backgroundColor:
                        selectedGender === 'female'
                          ? colors.activePillBg
                          : colors.inactivePillBg,
                      opacity: isCustomVoiceSelected ? 0.4 : 1,
                    },
                  ]}>
                  <Ionicons
                    name="woman"
                    size={16}
                    color={
                      selectedGender === 'female'
                        ? colors.activePillText
                        : colors.textSecondary
                    }
                  />
                  <Text
                    style={[
                      styles.genderPillText,
                      {
                        color:
                          selectedGender === 'female'
                            ? colors.activePillText
                            : colors.inactivePillText,
                      },
                    ]}>
                    Female
                  </Text>
                  {isCustomVoiceSelected && (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.diagonalStrike,
                        { backgroundColor: isDark ? '#E4E4E7' : '#52525B' },
                      ]}
                    />
                  )}
                </Pressable>
              </View>
            </View>

            {/* LANGUAGE */}
            <View style={styles.section}>
              <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                LANGUAGE
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.languageScrollContainer}>
                {languages.map((lang) => {
                  const isSelected = lang.id === selectedLangId;
                  return (
                    <Pressable
                      key={lang.id}
                      onPress={() => handleLanguageSelect(lang.id)}
                      style={[
                        styles.langPill,
                        {
                          backgroundColor: isSelected
                            ? colors.activePillBg
                            : colors.inactivePillBg,
                        },
                      ]}>
                      <Text
                        style={[
                          styles.langPillText,
                          {
                            color: isSelected
                              ? colors.activePillText
                              : colors.inactivePillText,
                            fontWeight: isSelected ? '600' : '400',
                          },
                        ]}>
                        {lang.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>

            {/* AVAILABLE VOICE MODELS */}
            <View style={styles.section}>
              <View style={styles.modelsHeaderRow}>
                <Text style={[styles.sectionHeading, { color: colors.textSecondary }]}>
                  AVAILABLE MODELS ({voices.length})
                </Text>
                {loadingVoices && (
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                )}
              </View>

              {loadingVoices && voices.length === 0 ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator size="small" color={colors.textPrimary} />
                  <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
                    Fetching models from backend...
                  </Text>
                </View>
              ) : voices.length === 0 ? (
                <View style={styles.emptyBox}>
                  <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                    No models available for this combination.
                  </Text>
                </View>
              ) : (
                <View style={styles.voicesList}>
                  {voices.map((v) => {
                    const isSelected = selectedVoice === v.name;
                    const isPlaying = playingVoice === v.name;
                    const isLoading = loadingVoice === v.name;

                    return (
                      <Pressable
                        key={v.name}
                        onPress={() => handleVoiceSelect(v.name)}
                        style={({ pressed }) => [
                          styles.voiceCard,
                          {
                            backgroundColor: isSelected
                              ? colors.cardBg
                              : 'transparent',
                            borderColor: isSelected
                              ? colors.textPrimary
                              : colors.divider,
                          },
                          pressed && { opacity: 0.8 },
                        ]}>
                        {/* Voice Avatar Image */}
                        <View
                          style={[
                            styles.avatarContainer,
                            {
                              borderColor: isSelected
                                ? colors.textPrimary
                                : 'transparent',
                            },
                          ]}>
                          {v.isCustom && !v.avatarUrl ? (
                            <View
                              style={[
                                styles.avatarImage,
                                {
                                  backgroundColor: getAvatarColor(v.name),
                                  justifyContent: 'center',
                                  alignItems: 'center',
                                },
                              ]}>
                              <Text
                                style={{
                                  color: '#FFFFFF',
                                  fontWeight: '700',
                                  fontSize: 16,
                                }}>
                                {getInitials(v.name)}
                              </Text>
                            </View>
                          ) : (
                            <Image
                              source={
                                v.isCustom && v.avatarUrl
                                  ? { uri: v.avatarUrl }
                                  : getVoiceAvatarSource(v.name)
                              }
                              style={styles.avatarImage}
                              contentFit="cover"
                              transition={150}
                            />
                          )}
                          {isSelected && (
                            <View
                              style={[
                                styles.avatarCheckBadge,
                                {
                                  backgroundColor: colors.activePillBg,
                                  borderColor: colors.bg,
                                },
                              ]}>
                              <Ionicons
                                name="checkmark"
                                size={10}
                                color={colors.activePillText}
                              />
                            </View>
                          )}
                        </View>

                        {/* Voice info */}
                        <View style={styles.voiceMeta}>
                          <View style={styles.voiceTitleRow}>
                            <Text
                              style={[
                                styles.voiceName,
                                {
                                  color: colors.textPrimary,
                                  fontWeight: isSelected ? '700' : '500',
                                },
                              ]}>
                              {v.name}
                            </Text>

                            {v.recommended && !v.isCustom && (
                              <View
                                style={[
                                  styles.recommendedBadge,
                                  { backgroundColor: colors.recommendedBadgeBg },
                                ]}>
                                <Ionicons
                                  name="star"
                                  size={10}
                                  color={colors.recommendedBadgeText}
                                />
                                <Text
                                  style={[
                                    styles.recommendedBadgeText,
                                    { color: colors.recommendedBadgeText },
                                  ]}>
                                  Recommended
                                </Text>
                              </View>
                            )}
                          </View>

                          <Text
                            style={[
                              styles.voiceSub,
                              { color: colors.textSecondary },
                            ]}>
                            {v.isCustom
                              ? 'Custom Voice'
                              : `${currentLangLabel} • ${
                                  v.gender === 'male' ? 'Male Voice' : 'Female Voice'
                                }`}
                          </Text>
                        </View>

                        {/* Demo audio play button if demoUrl exists */}
                        {v.demoUrl ? (
                          <Pressable
                            hitSlop={8}
                            onPress={() => handleTogglePlay(v)}
                            accessibilityRole="button"
                            accessibilityLabel={
                              isPlaying
                                ? `Pause ${v.name} voice preview`
                                : isLoading
                                ? `Loading ${v.name} voice preview`
                                : `Play ${v.name} voice preview`
                            }
                            style={[
                              styles.playButton,
                              {
                                backgroundColor: isPlaying
                                  ? colors.playButtonActiveBg
                                  : colors.playButtonBg,
                              },
                            ]}>
                            {isLoading ? (
                              <ActivityIndicator
                                size={12}
                                color={colors.textPrimary}
                              />
                            ) : (
                              <Ionicons
                                name={isPlaying ? 'pause' : 'volume-medium'}
                                size={15}
                                color={
                                  isPlaying
                                    ? colors.playButtonActiveIcon
                                    : colors.textPrimary
                                }
                              />
                            )}
                          </Pressable>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              )}
            </View>
          </ScrollView>

          {/* Footer Action */}
          <View style={[styles.modalFooter, { borderTopColor: colors.divider }]}>
            <Pressable
              onPress={handleApply}
              disabled={!selectedVoice}
              style={({ pressed }) => [
                styles.applyButton,
                {
                  backgroundColor: colors.activePillBg,
                  opacity: !selectedVoice ? 0.4 : pressed ? 0.85 : 1,
                },
              ]}>
              <Text
                style={[
                  styles.applyButtonText,
                  { color: colors.activePillText },
                ]}
                numberOfLines={1}
                ellipsizeMode="tail">
                Select {selectedVoice ? `${selectedVoice} (${currentLangLabel.replace(/\s*\([^)]*\)/g, '').trim() || currentLangLabel})` : 'Voice'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    minHeight: '65%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  modalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeButton: {
    padding: 4,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  section: {
    marginTop: 18,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  genderRow: {
    flexDirection: 'row',
    gap: 12,
  },
  genderPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: 10,
    position: 'relative',
    overflow: 'hidden',
  },
  diagonalStrike: {
    position: 'absolute',
    top: '50%',
    left: '-20%',
    right: '-20%',
    height: 2,
    marginTop: -1,
    transform: [{ rotate: '-15deg' }],
    zIndex: 10,
  },
  genderPillText: {
    fontSize: 14,
    fontWeight: '600',
  },
  languageScrollContainer: {
    gap: 8,
    paddingVertical: 2,
  },
  langPill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
  },
  langPillText: {
    fontSize: 13,
  },
  modelsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  loadingBox: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
  },
  emptyBox: {
    paddingVertical: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
  voicesList: {
    gap: 8,
    marginTop: 4,
  },
  voiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A2A2D',
  },
  avatarCheckBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  voiceMeta: {
    flex: 1,
  },
  voiceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  voiceName: {
    fontSize: 15,
  },

  recommendedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  recommendedBadgeText: {
    fontSize: 10,
    fontWeight: '600',
  },
  voiceSub: {
    fontSize: 12,
    marginTop: 2,
  },
  playButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  applyButton: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
