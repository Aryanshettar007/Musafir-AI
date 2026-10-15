import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
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
import { Image as ExpoImage } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  getRecordingPermissionsAsync,
  setAudioModeAsync,
  createAudioPlayer,
  type RecordingOptions,
} from 'expo-audio';

const VOICE_RECORDING_PRESET: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1, // Mono channel to match phone/hardware mic
};

import { useColorScheme } from '@/hooks/use-color-scheme';
import { VoiceModel } from '@/services/catalog-service';
import {
  createCustomVoice,
  fetchUserCustomVoices,
  deleteCustomVoice,
} from '@/services/custom-voice-service';

const MIN_RECORDING_SECONDS = 5;
const MAX_RECORDING_SECONDS = 30;

function getInitials(name: string): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_PALETTE = [
  '#3B82F6', // Blue
  '#8B5CF6', // Violet
  '#EC4899', // Pink
  '#10B981', // Emerald
  '#F59E0B', // Amber
  '#6366F1', // Indigo
  '#06B6D4', // Cyan
  '#F97316', // Orange
];

function getAvatarColor(name: string): string {
  if (!name) return AVATAR_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

export interface VoiceCloneSectionProps {
  onVoiceCreated?: (voice: VoiceModel) => void;
}

export function VoiceCloneSection({ onVoiceCreated }: VoiceCloneSectionProps) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Custom voices list
  const [customVoices, setCustomVoices] = useState<VoiceModel[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(true);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states inside modal
  const [activeTab, setActiveTab] = useState<'record' | 'upload'>('record');
  const [voiceName, setVoiceName] = useState('');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);

  // Audio source states
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [uploadedUri, setUploadedUri] = useState<string | null>(null);
  const [uploadedFilename, setUploadedFilename] = useState<string | null>(null);
  const [uploadedMimeType, setUploadedMimeType] = useState<string | null>(null);

  // Recording lifecycle (high-quality mono)
  const recorder = useAudioRecorder(VOICE_RECORDING_PRESET);
  const [isRecording, setIsRecording] = useState(false);
  const [recordDurationSeconds, setRecordDurationSeconds] = useState(0);
  const recordIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Demo audio preview playback
  const [previewPlayer, setPreviewPlayer] = useState<any>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
  const activeVoicePlayerRef = useRef<any>(null);

  // Submitting state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitProgressText, setSubmitProgressText] = useState('');

  // Form validity (name >= 2 chars, reference audio provided; profile pic is optional)
  const hasAudioSample = activeTab === 'record' ? Boolean(recordedUri) : Boolean(uploadedUri);
  const isFormValid = voiceName.trim().length >= 2 && hasAudioSample;
  const isCreateDisabled = isSubmitting || !isFormValid;

  // Pulse animation for recording
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Load user's custom voices on mount
  const loadVoices = useCallback(async () => {
    try {
      setLoadingVoices(true);
      const list = await fetchUserCustomVoices();
      setCustomVoices(list);
    } catch (err) {
      console.warn('[VoiceCloneSection] Failed to load custom voices:', err);
    } finally {
      setLoadingVoices(false);
    }
  }, []);

  useEffect(() => {
    loadVoices();
  }, [loadVoices]);

  // Clean up audio playback on unmount
  useEffect(() => {
    return () => {
      if (previewPlayer) {
        try {
          previewPlayer.pause();
          previewPlayer.release();
        } catch {}
      }
      if (activeVoicePlayerRef.current) {
        try {
          activeVoicePlayerRef.current.pause();
          activeVoicePlayerRef.current.release();
        } catch {}
      }
    };
  }, [previewPlayer]);

  // Pulsing mic animation
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording, pulseAnim]);

  // ─── Recording Handlers ──────────────────────────────────────────────────
  const startRecording = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const perm = await getRecordingPermissionsAsync();
      if (!perm.granted) {
        const req = await requestRecordingPermissionsAsync();
        if (!req.granted) {
          Alert.alert(
            'Microphone Permission Required',
            'Musafir needs microphone access so you can record reference audio for your custom voice clone.'
          );
          return;
        }
      }

      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
      });

      // Stop any existing preview player
      if (previewPlayer) {
        previewPlayer.pause();
        previewPlayer.release();
        setPreviewPlayer(null);
        setIsPlayingPreview(false);
      }

      setRecordedUri(null);
      setRecordDurationSeconds(0);
      setIsRecording(true);

      // Prepare native audio engine then start recording
      try {
        await recorder.prepareToRecordAsync(VOICE_RECORDING_PRESET);
      } catch (e) {
        await recorder.prepareToRecordAsync();
      }
      recorder.record();

      const startTime = Date.now();
      recordIntervalRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setRecordDurationSeconds(elapsed);
      }, 250);

      // Auto-stop at MAX_RECORDING_SECONDS (30s)
      maxTimerRef.current = setTimeout(() => {
        stopRecording(true);
      }, MAX_RECORDING_SECONDS * 1000);
    } catch (err: any) {
      console.warn('[VoiceCloneSection] Error starting recording:', err);
      Alert.alert('Recording Error', err?.message || 'Could not access microphone.');
      setIsRecording(false);
    }
  };

  const stopRecording = async (isAutoMax = false) => {
    if (!isRecording) return;
    setIsRecording(false);

    if (recordIntervalRef.current) {
      clearInterval(recordIntervalRef.current);
      recordIntervalRef.current = null;
    }
    if (maxTimerRef.current) {
      clearTimeout(maxTimerRef.current);
      maxTimerRef.current = null;
    }

    try {
      await recorder.stop();
      // Brief pause to allow native AVFoundation file buffer to flush to disk
      await new Promise((resolve) => setTimeout(resolve, 150));

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      const uri = recorder.uri;
      if (!uri) {
        throw new Error('No audio file was generated. Please try recording again.');
      }

      const fileInfo = await FileSystem.getInfoAsync(uri);
      if (!fileInfo.exists || fileInfo.size === 0) {
        throw new Error('Recorded audio file is empty. Please speak again.');
      }

      if (recordDurationSeconds < MIN_RECORDING_SECONDS && !isAutoMax) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        Alert.alert(
          'Sample Too Short',
          `Please record at least ${MIN_RECORDING_SECONDS} seconds of clean audio. (Recorded: ${recordDurationSeconds}s)`
        );
        setRecordedUri(null);
        return;
      }

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setRecordedUri(uri);
    } catch (err: any) {
      console.warn('[VoiceCloneSection] Error stopping recording:', err);
      Alert.alert('Recording Error', err?.message || 'Failed to save recorded audio.');
    }
  };

  // ─── Document / Audio Picker ─────────────────────────────────────────────
  const pickAudioFile = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const res = await DocumentPicker.getDocumentAsync({
        type: ['audio/*'],
        copyToCacheDirectory: true,
      });

      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setUploadedUri(asset.uri);
        setUploadedFilename(asset.name || 'reference_audio.mp3');
        setUploadedMimeType(asset.mimeType || 'audio/mpeg');
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (err: any) {
      console.warn('[VoiceCloneSection] Error picking audio:', err);
      Alert.alert('File Picker Error', err?.message || 'Could not select audio file.');
    }
  };

  // ─── Image Picker with Compression ───────────────────────────────────────
  const pickProfilePicture = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6, // Compressed to ~50-120KB JPEG
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setAvatarUri(result.assets[0].uri);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch (err: any) {
      console.warn('[VoiceCloneSection] Error picking avatar:', err);
      Alert.alert('Image Error', err?.message || 'Could not pick image.');
    }
  };

  // ─── Preview Audio Playback ──────────────────────────────────────────────
  const togglePreviewPlay = async (uri: string) => {
    try {
      if (isPlayingPreview && previewPlayer) {
        try {
          previewPlayer.pause();
        } catch {}
        setIsPlayingPreview(false);
        return;
      }

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Clean up previous instance
      if (previewPlayer) {
        try {
          previewPlayer.pause();
          previewPlayer.release();
        } catch {}
        setPreviewPlayer(null);
      }

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      const player = createAudioPlayer(uri);
      setPreviewPlayer(player);
      setIsPlayingPreview(true);
      player.play();

      player.addListener('playbackStatusUpdate', (status: any) => {
        if (
          status.didJustFinish ||
          (!status.playing &&
            status.isLoaded &&
            status.duration > 0 &&
            Math.abs(status.currentTime - status.duration) < 0.2)
        ) {
          setIsPlayingPreview(false);
        }
      });
    } catch (err) {
      console.warn('[VoiceCloneSection] Error playing preview:', err);
      setIsPlayingPreview(false);
    }
  };

  // ─── Play Saved Voice Demo ───────────────────────────────────────────────
  const handleToggleVoiceDemo = async (voice: VoiceModel) => {
    if (!voice.demoUrl) {
      Alert.alert('No Demo Available', 'This cloned voice does not have a preview clip yet.');
      return;
    }

    if (playingVoiceId === voice.name && activeVoicePlayerRef.current) {
      try {
        activeVoicePlayerRef.current.pause();
        activeVoicePlayerRef.current.release();
      } catch {}
      activeVoicePlayerRef.current = null;
      setPlayingVoiceId(null);
      return;
    }

    try {
      if (activeVoicePlayerRef.current) {
        try {
          activeVoicePlayerRef.current.pause();
          activeVoicePlayerRef.current.release();
        } catch {}
        activeVoicePlayerRef.current = null;
      }

      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
      });

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setPlayingVoiceId(voice.name);

      const player = createAudioPlayer(voice.demoUrl);
      activeVoicePlayerRef.current = player;
      player.play();

      player.addListener('playbackStatusUpdate', (status: any) => {
        if (
          status.didJustFinish ||
          (!status.playing &&
            status.isLoaded &&
            status.duration > 0 &&
            Math.abs(status.currentTime - status.duration) < 0.2)
        ) {
          setPlayingVoiceId(null);
        }
      });
    } catch (err) {
      console.warn('[VoiceCloneSection] Error playing voice demo:', err);
      setPlayingVoiceId(null);
    }
  };

  // ─── Delete Voice ────────────────────────────────────────────────────────
  const handleDeleteVoice = (voice: VoiceModel) => {
    if (!voice.id) return;
    Alert.alert(
      'Delete Voice Clone',
      `Are you sure you want to delete "${voice.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCustomVoice(voice.id!);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setCustomVoices((prev) => prev.filter((v) => v.id !== voice.id));
            } catch (err: any) {
              Alert.alert('Error', err?.message || 'Failed to delete voice.');
            }
          },
        },
      ]
    );
  };

  // ─── Submit Creation ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    const trimmedName = voiceName.trim();
    if (!trimmedName) {
      Alert.alert('Voice Name Required', 'Please enter a name for your custom voice.');
      return;
    }

    const targetAudioUri = activeTab === 'record' ? recordedUri : uploadedUri;
    if (!targetAudioUri) {
      Alert.alert(
        'Audio Sample Required',
        activeTab === 'record'
          ? 'Please record an audio sample of your voice (5–30s).'
          : 'Please select an audio file from your device.'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      setSubmitProgressText('Creating your custom voice...');

      const newVoice = await createCustomVoice({
        name: trimmedName,
        audioUri: targetAudioUri,
        audioFilename: activeTab === 'upload' ? uploadedFilename || undefined : undefined,
        audioMimeType: activeTab === 'upload' ? uploadedMimeType || undefined : undefined,
        avatarUri: avatarUri || undefined,
      });

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        'Voice Cloned Successfully! 🎉',
        `"${newVoice.name}" is now ready! You can select it in the Voice Model Selector when planning trips.`
      );

      // Reset modal state
      setIsModalOpen(false);
      setVoiceName('');
      setAvatarUri(null);
      setRecordedUri(null);
      setUploadedUri(null);
      setUploadedFilename(null);

      // Refresh list
      loadVoices();
      onVoiceCreated?.(newVoice);
    } catch (err: any) {
      console.warn('[VoiceCloneSection] Failed to create voice:', err);
      Alert.alert('Cloning Failed', err?.message || 'Could not create custom voice. Please try again.');
    } finally {
      setIsSubmitting(false);
      setSubmitProgressText('');
    }
  };

  // Shadcn theme colors
  const theme = {
    cardBg: isDark ? '#141416' : '#FAFAFC',
    cardBorder: isDark ? '#26262B' : '#E5E5EB',
    textPrimary: isDark ? '#FFFFFF' : '#09090B',
    textSecondary: isDark ? '#A1A1AA' : '#71717A',
    badgeBg: isDark ? '#27272A' : '#F4F4F5',
    badgeText: isDark ? '#F4F4F5' : '#18181B',
    btnPrimaryBg: isDark ? '#FFFFFF' : '#18181B',
    btnPrimaryText: isDark ? '#000000' : '#FFFFFF',
    btnSecondaryBg: isDark ? '#27272A' : '#F4F4F5',
    btnSecondaryText: isDark ? '#FAFAFA' : '#18181B',
    inputBg: isDark ? '#18181B' : '#FFFFFF',
    inputBorder: isDark ? '#27272A' : '#E4E4E7',
    activeTabBg: isDark ? '#27272A' : '#FFFFFF',
    activeTabText: isDark ? '#FFFFFF' : '#09090B',
    inactiveTabText: isDark ? '#A1A1AA' : '#71717A',
    modalOverlay: isDark ? 'rgba(0,0,0,0.75)' : 'rgba(0,0,0,0.5)',
  };

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
          Custom Voices
        </Text>
      </View>

      {/* ─── Instagram Stories Tray ────────────────────────────────────────── */}
      <View style={styles.storiesContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.storiesScroll}>
          {/* Story 1: Add New Voice (+) */}
          <Pressable
            style={({ pressed }) => [
              styles.storyItem,
              pressed && { opacity: 0.8, transform: [{ scale: 0.96 }] },
            ]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsModalOpen(true);
            }}>
            <View
              style={[
                styles.addStoryRing,
                {
                  borderColor: isDark ? '#3F3F46' : '#D4D4D8',
                  backgroundColor: isDark ? '#1C1C1F' : '#F4F4F5',
                },
              ]}>
              <Ionicons name="add" size={26} color={theme.textPrimary} />
            </View>
            <Text
              numberOfLines={1}
              style={[styles.storyName, { color: theme.textSecondary }]}>
              Add Voice
            </Text>
          </Pressable>

          {/* Stories 2..N: Custom Cloned Voices */}
          {customVoices.map((cv) => {
            const isPlaying = playingVoiceId === cv.name;
            return (
              <Pressable
                key={cv.id || cv.name}
                style={({ pressed }) => [
                  styles.storyItem,
                  pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
                ]}
                onPress={() => handleToggleVoiceDemo(cv)}
                onLongPress={() => handleDeleteVoice(cv)}
                delayLongPress={500}>
                {/* Outer Ring */}
                <View
                  style={[
                    styles.storyRing,
                    isPlaying
                      ? styles.storyRingActive
                      : { borderColor: isDark ? '#27272A' : '#E4E4E7' },
                  ]}>
                  {/* Inner Avatar Container */}
                  <View
                    style={[
                      styles.storyAvatarWrap,
                      { backgroundColor: isDark ? '#18181B' : '#E5E5EB' },
                    ]}>
                    {cv.avatarUrl ? (
                      <ExpoImage
                        source={{ uri: cv.avatarUrl }}
                        style={styles.storyAvatarImg}
                        contentFit="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.textAvatarContainer,
                          { backgroundColor: getAvatarColor(cv.name) },
                        ]}>
                        <Text style={styles.textAvatarInitials}>
                          {getInitials(cv.name)}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>

                {/* Name Label */}
                <Text
                  numberOfLines={1}
                  style={[
                    styles.storyName,
                    {
                      color: isPlaying ? theme.textPrimary : theme.textSecondary,
                      fontWeight: isPlaying ? '700' : '500',
                    },
                  ]}>
                  {cv.name}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ─── Modal / Dialog Sheet ────────────────────────────────────────── */}
      <Modal
        visible={isModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => !isSubmitting && setIsModalOpen(false)}>
        <View style={[styles.modalOverlay, { backgroundColor: theme.modalOverlay }]}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: isDark ? '#121214' : '#FFFFFF',
                borderColor: theme.cardBorder,
              },
            ]}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                  Clone Custom Voice
                </Text>
              </View>
              <Pressable
                disabled={isSubmitting}
                hitSlop={12}
                onPress={() => setIsModalOpen(false)}
                style={styles.closeBtn}>
                <Ionicons name="close" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}>
              {/* Step 1: Input Name & Profile Picture */}
              <View style={styles.formSection}>
                <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
                  Profile Picture & Name
                </Text>

                <View style={styles.profileRow}>
                  {/* Avatar Picker */}
                  <Pressable
                    disabled={isSubmitting}
                    onPress={pickProfilePicture}
                    style={[
                      styles.avatarPicker,
                      {
                        backgroundColor: isDark ? '#212225' : '#F0F0F3',
                        borderColor: theme.inputBorder,
                      },
                    ]}>
                    {avatarUri ? (
                      <>
                        <ExpoImage
                          source={{ uri: avatarUri }}
                          style={styles.avatarPickerImg}
                          contentFit="cover"
                        />
                        <View
                          style={[
                            styles.avatarEditBadge,
                            {
                              backgroundColor: theme.textPrimary,
                              borderColor: isDark ? '#121214' : '#FFFFFF',
                            },
                          ]}>
                          <Ionicons
                            name="arrow-up"
                            size={10}
                            color={isDark ? '#000000' : '#FFFFFF'}
                          />
                        </View>
                      </>
                    ) : voiceName.trim() ? (
                      <View
                        style={[
                          styles.textAvatarContainer,
                          { backgroundColor: getAvatarColor(voiceName) },
                        ]}>
                        <Text style={styles.modalTextAvatarInitials}>
                          {getInitials(voiceName)}
                        </Text>
                        <View
                          style={[
                            styles.avatarEditBadge,
                            {
                              backgroundColor: theme.textPrimary,
                              borderColor: isDark ? '#121214' : '#FFFFFF',
                            },
                          ]}>
                          <Ionicons
                            name="arrow-up"
                            size={10}
                            color={isDark ? '#000000' : '#FFFFFF'}
                          />
                        </View>
                      </View>
                    ) : (
                      <View style={styles.avatarPickerPlaceholder}>
                        <Ionicons
                          name="arrow-up"
                          size={20}
                          color={theme.textPrimary}
                        />
                        <Text
                          style={[
                            styles.avatarPickerText,
                            { color: theme.textSecondary },
                          ]}>
                          Upload
                        </Text>
                      </View>
                    )}
                  </Pressable>

                  {/* Name Input */}
                  <View style={styles.nameInputBlock}>
                    <TextInput
                      editable={!isSubmitting}
                      value={voiceName}
                      onChangeText={setVoiceName}
                      placeholder="e.g. My Voice, Storyteller"
                      placeholderTextColor={theme.textSecondary}
                      style={[
                        styles.shadcnInput,
                        {
                          backgroundColor: theme.inputBg,
                          borderColor: theme.inputBorder,
                          color: theme.textPrimary,
                        },
                      ]}
                      maxLength={40}
                    />
                  </View>
                </View>
              </View>

              {/* Step 2: Audio Source Tabs */}
              <View style={styles.formSection}>
                <Text style={[styles.fieldLabel, { color: theme.textPrimary }]}>
                  Reference Audio Sample
                </Text>

                {/* Segmented Control */}
                <View
                  style={[
                    styles.tabSegmentContainer,
                    {
                      backgroundColor: isDark ? '#1C1C1F' : '#F0F0F3',
                      borderColor: theme.cardBorder,
                    },
                  ]}>
                  <Pressable
                    disabled={isSubmitting || isRecording}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setActiveTab('record');
                    }}
                    style={[
                      styles.tabSegment,
                      activeTab === 'record' && [
                        styles.tabSegmentActive,
                        { backgroundColor: theme.activeTabBg },
                      ],
                    ]}>
                    <Ionicons
                      name="mic-outline"
                      size={15}
                      color={
                        activeTab === 'record'
                          ? theme.activeTabText
                          : theme.inactiveTabText
                      }
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.tabSegmentText,
                        {
                          color:
                            activeTab === 'record'
                              ? theme.activeTabText
                              : theme.inactiveTabText,
                          fontWeight: activeTab === 'record' ? '700' : '500',
                        },
                      ]}>
                      Record Speech
                    </Text>
                  </Pressable>

                  <Pressable
                    disabled={isSubmitting || isRecording}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setActiveTab('upload');
                    }}
                    style={[
                      styles.tabSegment,
                      activeTab === 'upload' && [
                        styles.tabSegmentActive,
                        { backgroundColor: theme.activeTabBg },
                      ],
                    ]}>
                    <Ionicons
                      name="cloud-upload-outline"
                      size={15}
                      color={
                        activeTab === 'upload'
                          ? theme.activeTabText
                          : theme.inactiveTabText
                      }
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.tabSegmentText,
                        {
                          color:
                            activeTab === 'upload'
                              ? theme.activeTabText
                              : theme.inactiveTabText,
                          fontWeight: activeTab === 'upload' ? '700' : '500',
                        },
                      ]}>
                      Upload Audio File
                    </Text>
                  </Pressable>
                </View>

                {/* Tab Content: Record Mode */}
                {activeTab === 'record' ? (
                  <View
                    style={[
                      styles.recorderBox,
                      {
                        backgroundColor: isDark ? '#18181B' : '#FAFAFA',
                        borderColor: theme.inputBorder,
                      },
                    ]}>
                    {/* Timer and limits */}
                    <View style={styles.recorderTimerRow}>
                      <Text
                        style={[
                          styles.recorderTimerText,
                          {
                            color: isRecording
                              ? '#EF4444'
                              : recordedUri
                              ? '#10B981'
                              : theme.textPrimary,
                          },
                        ]}>
                        {isRecording
                          ? `00:${recordDurationSeconds < 10 ? '0' : ''}${recordDurationSeconds}`
                          : recordedUri
                          ? `Recorded: ${recordDurationSeconds}s`
                          : '00:00'}
                      </Text>
                      <Text
                        style={[
                          styles.recorderLimitHint,
                          { color: theme.textSecondary },
                        ]}>
                        Limit: 5s – 30s
                      </Text>
                    </View>

                    {/* Progress Bar (0 to 30s) */}
                    <View
                      style={[
                        styles.progressBarBg,
                        { backgroundColor: isDark ? '#27272A' : '#E4E4E7' },
                      ]}>
                      <View
                        style={[
                          styles.progressBarFill,
                          {
                            width: `${Math.min(
                              100,
                              (recordDurationSeconds / MAX_RECORDING_SECONDS) * 100
                            )}%`,
                            backgroundColor:
                              recordDurationSeconds >= MIN_RECORDING_SECONDS
                                ? '#10B981'
                                : '#F59E0B',
                          },
                        ]}
                      />
                    </View>

                    {/* Central Action Button */}
                    <View style={styles.micButtonContainer}>
                      <Animated.View
                        style={[
                          styles.pulseRing,
                          {
                            transform: [{ scale: pulseAnim }],
                            opacity: isRecording ? 0.35 : 0,
                            backgroundColor: '#EF4444',
                          },
                        ]}
                      />
                      <Pressable
                        onPress={isRecording ? () => stopRecording(false) : startRecording}
                        style={({ pressed }) => [
                          styles.bigMicButton,
                          {
                            backgroundColor: isRecording
                              ? '#EF4444'
                              : theme.textPrimary,
                          },
                          pressed && { opacity: 0.8 },
                        ]}>
                        <Ionicons
                          name={isRecording ? 'stop' : 'mic'}
                          size={28}
                          color={isRecording ? '#FFFFFF' : isDark ? '#000000' : '#FFFFFF'}
                        />
                      </Pressable>
                    </View>

                    <Text
                      style={[
                        styles.micInstructionText,
                        { color: theme.textSecondary },
                      ]}>
                      {isRecording
                        ? 'Recording in progress... Tap to finish'
                        : recordedUri
                        ? 'Audio captured! You can preview below or tap mic to re-record.'
                        : 'Tap the microphone to speak a sample (5–30s)'}
                    </Text>

                    {/* Preview Player if recorded */}
                    {recordedUri && !isRecording && (
                      <View
                        style={[
                          styles.previewPlayerBox,
                          {
                            backgroundColor: isDark ? '#27272A' : '#F4F4F5',
                            borderColor: theme.cardBorder,
                          },
                        ]}>
                        <Pressable
                          hitSlop={8}
                          onPress={() => togglePreviewPlay(recordedUri)}
                          style={[
                            styles.previewPlayBtn,
                            { backgroundColor: theme.textPrimary },
                          ]}>
                          <Ionicons
                            name={isPlayingPreview ? 'pause' : 'play'}
                            size={16}
                            color={isDark ? '#000000' : '#FFFFFF'}
                          />
                        </Pressable>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              styles.previewPlayerTitle,
                              { color: theme.textPrimary },
                            ]}>
                            Voice Reference Clip
                          </Text>
                          <Text
                            style={[
                              styles.previewPlayerSub,
                              { color: theme.textSecondary },
                            ]}>
                            High-quality M4A • {recordDurationSeconds} seconds
                          </Text>
                        </View>
                        <Ionicons
                          name="checkmark-circle"
                          size={22}
                          color="#10B981"
                        />
                      </View>
                    )}
                  </View>
                ) : (
                  /* Tab Content: Upload File Mode */
                  <View
                    style={[
                      styles.uploadBox,
                      {
                        backgroundColor: isDark ? '#18181B' : '#FAFAFA',
                        borderColor: theme.inputBorder,
                      },
                    ]}>
                    {uploadedUri ? (
                      <View style={styles.uploadedFileContent}>
                        <View
                          style={[
                            styles.fileIconBadge,
                            { backgroundColor: isDark ? '#27272A' : '#F4F4F5' },
                          ]}>
                          <Ionicons
                            name="musical-notes"
                            size={28}
                            color={theme.textPrimary}
                          />
                        </View>
                        <Text
                          style={[
                            styles.uploadedFileName,
                            { color: theme.textPrimary },
                          ]}
                          numberOfLines={1}>
                          {uploadedFilename || 'Reference audio file'}
                        </Text>
                        <Text
                          style={[
                            styles.uploadedFileSub,
                            { color: theme.textSecondary },
                          ]}>
                          Ready for Voice Cloning
                        </Text>

                        {/* Preview play button */}
                        <View style={styles.uploadActionsRow}>
                          <Pressable
                            onPress={() => togglePreviewPlay(uploadedUri)}
                            style={[
                              styles.fileActionBtn,
                              { backgroundColor: theme.textPrimary },
                            ]}>
                            <Ionicons
                              name={isPlayingPreview ? 'pause' : 'play'}
                              size={14}
                              color={isDark ? '#000000' : '#FFFFFF'}
                              style={{ marginRight: 6 }}
                            />
                            <Text
                              style={[
                                styles.fileActionBtnText,
                                { color: isDark ? '#000000' : '#FFFFFF' },
                              ]}>
                              {isPlayingPreview ? 'Pause' : 'Play Audio'}
                            </Text>
                          </Pressable>

                          <Pressable
                            onPress={pickAudioFile}
                            style={[
                              styles.fileActionBtn,
                              {
                                backgroundColor: isDark ? '#27272A' : '#E4E4E7',
                              },
                            ]}>
                            <Text
                              style={[
                                styles.fileActionBtnText,
                                { color: theme.textPrimary },
                              ]}>
                              Change File
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : (
                      <Pressable
                        onPress={pickAudioFile}
                        style={({ pressed }) => [
                          styles.uploadDropzone,
                          pressed && { opacity: 0.75 },
                        ]}>
                        <View
                          style={[
                            styles.uploadIconCircle,
                            { backgroundColor: isDark ? '#27272A' : '#E4E4E7' },
                          ]}>
                          <Ionicons
                            name="cloud-upload"
                            size={28}
                            color={theme.textPrimary}
                          />
                        </View>
                        <Text
                          style={[
                            styles.uploadPromptTitle,
                            { color: theme.textPrimary },
                          ]}>
                          Choose Audio File
                        </Text>
                        <Text
                          style={[
                            styles.uploadPromptSub,
                            { color: theme.textSecondary },
                          ]}>
                          Upload an audio sample
                        </Text>
                        <Text
                          style={[
                            styles.uploadPromptHint,
                            { color: theme.textSecondary },
                          ]}>
                          5 to 30 seconds of clean audio works best.
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>

              {/* Submit Button & Progress */}
              <View style={styles.modalSubmitContainer}>
                {isSubmitting ? (
                  <View style={styles.submittingBlock}>
                    <ActivityIndicator size="small" color={theme.textPrimary} />
                    <Text
                      style={[
                        styles.submittingText,
                        { color: theme.textSecondary },
                      ]}>
                      {submitProgressText || 'Creating custom voice...'}
                    </Text>
                  </View>
                ) : (
                  <Pressable
                    disabled={isCreateDisabled}
                    onPress={handleSubmit}
                    style={({ pressed }) => [
                      styles.modalSubmitBtn,
                      { backgroundColor: theme.btnPrimaryBg },
                      isCreateDisabled && { opacity: 0.4 },
                      pressed && !isCreateDisabled && { opacity: 0.85 },
                    ]}>
                    <Text
                      style={[
                        styles.modalSubmitBtnText,
                        { color: theme.btnPrimaryText },
                      ]}>
                      Create Cloned Voice
                    </Text>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  sectionHeader: {
    paddingVertical: 10,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  // Instagram Stories Tray
  storiesContainer: {
    marginHorizontal: -20,
    marginBottom: 6,
  },
  storiesScroll: {
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  storyItem: {
    alignItems: 'center',
    width: 68,
  },
  addStoryRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  storyRing: {
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 2,
    padding: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
  },
  storyRingActive: {
    borderColor: '#8B5CF6',
  },
  storyAvatarWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  storyAvatarImg: {
    width: '100%',
    height: '100%',
  },
  textAvatarContainer: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textAvatarInitials: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  modalTextAvatarInitials: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  storyName: {
    fontSize: 11,
    textAlign: 'center',
    width: '100%',
  },
  // Modal Sheet
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(150,150,150,0.15)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  closeBtn: {
    padding: 6,
  },
  modalScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  formSection: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarPicker: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarPickerImg: {
    width: '100%',
    height: '100%',
  },
  avatarPickerPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarPickerText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 2,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameInputBlock: {
    flex: 1,
  },
  shadcnInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  // Tab segments
  tabSegmentContainer: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  tabSegment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabSegmentActive: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabSegmentText: {
    fontSize: 12,
  },
  // Recorder box
  recorderBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    alignItems: 'center',
  },
  recorderTimerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 8,
  },
  recorderTimerText: {
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  recorderLimitHint: {
    fontSize: 11,
  },
  progressBarBg: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 16,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  micButtonContainer: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  pulseRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  bigMicButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  micInstructionText: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  previewPlayerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginTop: 16,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  previewPlayBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewPlayerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  previewPlayerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  // Upload dropzone
  uploadBox: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
  },
  uploadDropzone: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  uploadIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  uploadPromptTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
  },
  uploadPromptSub: {
    fontSize: 12,
    marginBottom: 4,
  },
  uploadPromptHint: {
    fontSize: 11,
    textAlign: 'center',
  },
  uploadedFileContent: {
    alignItems: 'center',
    width: '100%',
  },
  fileIconBadge: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  uploadedFileName: {
    fontSize: 14,
    fontWeight: '700',
    maxWidth: '85%',
  },
  uploadedFileSub: {
    fontSize: 11,
    marginTop: 2,
    marginBottom: 14,
  },
  uploadActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fileActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  fileActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  modalSubmitContainer: {
    marginTop: 8,
    marginBottom: 16,
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  modalSubmitBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  submittingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  submittingText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
