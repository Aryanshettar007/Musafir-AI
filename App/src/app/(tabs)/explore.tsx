import React, { useState, useMemo } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { ThemedView } from '@/components/themed-view';
import { Colors, BottomTabInset } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  CREATOR_PACKS,
  CREATOR_PACK_CATEGORIES,
  CreatorPack,
} from '@/constants/creator-packs';

const ACCENT_BLUE = '#007AFF';

export default function ExploreScreen() {
  const router = useRouter();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activePackModal, setActivePackModal] = useState<CreatorPack | null>(null);

  // Filter packs based on category and search query
  const filteredPacks = useMemo(() => {
    return CREATOR_PACKS.filter((pack) => {
      const matchesCategory =
        selectedCategory === 'All' || pack.category === selectedCategory;
      const matchesQuery =
        !searchQuery.trim() ||
        pack.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pack.creatorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        pack.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesQuery;
    });
  }, [selectedCategory, searchQuery]);

  // Featured pack is the first pack
  const featuredPack = CREATOR_PACKS[0];

  const handlePackPress = (pack: CreatorPack) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActivePackModal(pack);
  };

  const handleStartPackTrip = (pack: CreatorPack) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setActivePackModal(null);
    Alert.alert(
      pack.title,
      `Starting audio trail curated by ${pack.creatorName}!\n\n${pack.storiesCount} geo-tagged audio stories will automatically narrate as you travel along the route.`,
      [
        {
          text: 'Go to Map',
          onPress: () => router.push('/(tabs)'),
        },
      ]
    );
  };

  const dynamicColors = {
    bg: colors.background,
    cardBg: isDark ? '#1C1C1E' : '#F4F4F6',
    border: isDark ? '#2C2C2E' : '#E5E5EA',
    textPrimary: colors.text,
    textSecondary: colors.textSecondary,
    searchBg: isDark ? '#1C1C1E' : '#F0F0F3',
    modalBg: isDark ? '#121214' : '#FFFFFF',
    chipSelected: isDark ? '#FFFFFF' : '#000000',
    chipSelectedText: isDark ? '#000000' : '#FFFFFF',
    chipUnselected: isDark ? '#212225' : '#ECECF0',
    chipUnselectedText: isDark ? '#B0B4BA' : '#555555',
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: dynamicColors.bg }]}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + BottomTabInset + 40 },
          ]}>
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={[styles.title, { color: dynamicColors.textPrimary }]}>
                Explore
              </Text>
              <Text style={[styles.subtitle, { color: dynamicColors.textSecondary }]}>
                Curated audio trails by local storytellers & experts
              </Text>
            </View>
          </View>

          {/* Search Bar */}
          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: dynamicColors.searchBg,
                borderColor: dynamicColors.border,
              },
            ]}>
            <Ionicons name="search" size={18} color={dynamicColors.textSecondary} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search trails, creators, stories..."
              placeholderTextColor={dynamicColors.textSecondary}
              style={[styles.searchInput, { color: dynamicColors.textPrimary }]}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <Pressable
                onPress={() => setSearchQuery('')}
                hitSlop={8}
                style={styles.clearBtn}>
                <Ionicons name="close-circle" size={18} color={dynamicColors.textSecondary} />
              </Pressable>
            )}
          </View>

          {/* Category Filter Chips */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryChipsContainer}>
            {CREATOR_PACK_CATEGORIES.map((category) => {
              const isSelected = selectedCategory === category;
              return (
                <Pressable
                  key={category}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSelectedCategory(category);
                  }}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: isSelected
                        ? dynamicColors.chipSelected
                        : dynamicColors.chipUnselected,
                    },
                  ]}>
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isSelected
                          ? dynamicColors.chipSelectedText
                          : dynamicColors.chipUnselectedText,
                        fontWeight: isSelected ? '700' : '500',
                      },
                    ]}>
                    {category}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* Spotlight Hero Banner (Shown when no search query and "All" category) */}
          {selectedCategory === 'All' && !searchQuery.trim() && (
            <Pressable
              style={({ pressed }) => [
                styles.spotlightCard,
                pressed && styles.cardPressed,
              ]}
              onPress={() => handlePackPress(featuredPack)}>
              <View style={styles.spotlightImageContainer}>
                <ExpoImage
                  source={{ uri: featuredPack.imageUrl }}
                  style={styles.spotlightImage}
                  contentFit="cover"
                  transition={300}
                />
                <View style={styles.spotlightBadge}>
                  <Ionicons name="sparkles" size={12} color="#FFFFFF" />
                  <Text style={styles.spotlightBadgeText}>Featured Trail</Text>
                </View>
                <View style={styles.spotlightCategoryPill}>
                  <Text style={styles.spotlightCategoryText}>{featuredPack.category}</Text>
                </View>
              </View>

              <View
                style={[
                  styles.spotlightContent,
                  {
                    backgroundColor: dynamicColors.cardBg,
                    borderColor: dynamicColors.border,
                  },
                ]}>
                <View style={styles.spotlightMetaRow}>
                  <View style={styles.ratingBadge}>
                    <Ionicons name="star" size={13} color="#FFB800" />
                    <Text style={[styles.ratingText, { color: dynamicColors.textPrimary }]}>
                      {featuredPack.rating}
                    </Text>
                    <Text style={[styles.reviewsCount, { color: dynamicColors.textSecondary }]}>
                      ({featuredPack.reviewsCount})
                    </Text>
                  </View>
                  <Text style={[styles.durationBadge, { color: dynamicColors.textSecondary }]}>
                    {featuredPack.storiesCount} stories • {featuredPack.duration}
                  </Text>
                </View>

                <Text style={[styles.spotlightTitle, { color: dynamicColors.textPrimary }]}>
                  {featuredPack.title}
                </Text>
                <Text
                  style={[styles.spotlightDesc, { color: dynamicColors.textSecondary }]}
                  numberOfLines={2}>
                  {featuredPack.description}
                </Text>

                <View style={styles.spotlightFooter}>
                  <View style={styles.creatorRow}>
                    <View style={styles.creatorAvatarSmall}>
                      <Ionicons name="person" size={12} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.creatorNameText, { color: dynamicColors.textPrimary }]}>
                      {featuredPack.creatorName}
                    </Text>
                  </View>

                  <View style={styles.listenButton}>
                    <Ionicons name="play" size={12} color="#FFFFFF" />
                    <Text style={styles.listenButtonText}>Explore Trail</Text>
                  </View>
                </View>
              </View>
            </Pressable>
          )}

          {/* CREATOR PACKS SECTION */}
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionTitle, { color: dynamicColors.textPrimary }]}>
                Creator Packs
              </Text>
              <Text style={[styles.sectionSub, { color: dynamicColors.textSecondary }]}>
                {filteredPacks.length} audio {filteredPacks.length === 1 ? 'pack' : 'packs'} available
              </Text>
            </View>
          </View>

          {filteredPacks.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="compass-outline" size={48} color={dynamicColors.textSecondary} />
              <Text style={[styles.emptyTitle, { color: dynamicColors.textPrimary }]}>
                No packs found
              </Text>
              <Text style={[styles.emptySubtitle, { color: dynamicColors.textSecondary }]}>
                Try selecting another category or adjusting your search keyword.
              </Text>
            </View>
          ) : (
            <View style={styles.packsGrid}>
              {filteredPacks.map((pack) => (
                <Pressable
                  key={pack.id}
                  style={({ pressed }) => [
                    styles.packCard,
                    {
                      backgroundColor: dynamicColors.cardBg,
                      borderColor: dynamicColors.border,
                    },
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() => handlePackPress(pack)}>
                  <View style={styles.packImageContainer}>
                    <ExpoImage
                      source={{ uri: pack.imageUrl }}
                      style={styles.packImage}
                      contentFit="cover"
                      transition={300}
                    />
                    <View style={styles.packCategoryTag}>
                      <Text style={styles.packCategoryTagText}>{pack.category}</Text>
                    </View>
                    <View style={styles.packDurationTag}>
                      <Ionicons name="headset" size={11} color="#FFFFFF" />
                      <Text style={styles.packDurationTagText}>{pack.duration}</Text>
                    </View>
                  </View>

                  <View style={styles.packContent}>
                    <View style={styles.packStatsRow}>
                      <View style={styles.packRatingBadge}>
                        <Ionicons name="star" size={11} color="#FFB800" />
                        <Text style={[styles.packRatingText, { color: dynamicColors.textPrimary }]}>
                          {pack.rating}
                        </Text>
                      </View>
                      <Text style={[styles.packStoriesCount, { color: dynamicColors.textSecondary }]}>
                        {pack.storiesCount} stories
                      </Text>
                    </View>

                    <Text
                      style={[styles.packTitle, { color: dynamicColors.textPrimary }]}
                      numberOfLines={2}>
                      {pack.title}
                    </Text>

                    <View style={styles.packCreatorFooter}>
                      <Text
                        style={[styles.packCreatorName, { color: dynamicColors.textSecondary }]}
                        numberOfLines={1}>
                        By {pack.creatorName}
                      </Text>
                      <MaterialIcons name="chevron-right" size={18} color={dynamicColors.textSecondary} />
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* DETAIL PREVIEW MODAL */}
      <Modal
        visible={!!activePackModal}
        animationType="slide"
        transparent
        onRequestClose={() => setActivePackModal(null)}>
        {activePackModal && (
          <View style={styles.modalOverlay}>
            <Pressable
              style={styles.modalBackdrop}
              onPress={() => setActivePackModal(null)}
            />
            <View
              style={[
                styles.modalSheet,
                {
                  backgroundColor: dynamicColors.modalBg,
                  borderTopColor: dynamicColors.border,
                  paddingBottom: Math.max(insets.bottom, 20) + 16,
                },
              ]}>
              <View style={styles.sheetHandle} />

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.sheetScrollContent}>
                {/* Modal Cover Image */}
                <View style={styles.modalImageContainer}>
                  <ExpoImage
                    source={{ uri: activePackModal.imageUrl }}
                    style={styles.modalImage}
                    contentFit="cover"
                  />
                  <Pressable
                    style={styles.modalCloseBtn}
                    onPress={() => setActivePackModal(null)}>
                    <Ionicons name="close" size={20} color="#FFFFFF" />
                  </Pressable>
                  <View style={styles.modalCategoryBadge}>
                    <Text style={styles.modalCategoryBadgeText}>
                      {activePackModal.category}
                    </Text>
                  </View>
                </View>

                {/* Title and Creator */}
                <View style={styles.modalHeaderInfo}>
                  <Text style={[styles.modalTitle, { color: dynamicColors.textPrimary }]}>
                    {activePackModal.title}
                  </Text>

                  <View style={styles.modalCreatorRow}>
                    <View style={styles.modalAvatar}>
                      <Ionicons name="person" size={14} color="#FFFFFF" />
                    </View>
                    <View>
                      <Text style={[styles.modalCreatorName, { color: dynamicColors.textPrimary }]}>
                        {activePackModal.creatorName}
                      </Text>
                      {activePackModal.creatorRole && (
                        <Text
                          style={[
                            styles.modalCreatorRole,
                            { color: dynamicColors.textSecondary },
                          ]}>
                          {activePackModal.creatorRole}
                        </Text>
                      )}
                    </View>
                  </View>

                  {/* Highlights Bar */}
                  <View
                    style={[
                      styles.modalMetaPills,
                      { backgroundColor: dynamicColors.cardBg },
                    ]}>
                    <View style={styles.modalPillItem}>
                      <Ionicons name="time-outline" size={16} color={ACCENT_BLUE} />
                      <Text style={[styles.modalPillText, { color: dynamicColors.textPrimary }]}>
                        {activePackModal.duration}
                      </Text>
                    </View>
                    <View style={styles.modalPillDivider} />
                    <View style={styles.modalPillItem}>
                      <Ionicons name="volume-high-outline" size={16} color={ACCENT_BLUE} />
                      <Text style={[styles.modalPillText, { color: dynamicColors.textPrimary }]}>
                        {activePackModal.storiesCount} stories
                      </Text>
                    </View>
                    <View style={styles.modalPillDivider} />
                    <View style={styles.modalPillItem}>
                      <Ionicons name="star" size={15} color="#FFB800" />
                      <Text style={[styles.modalPillText, { color: dynamicColors.textPrimary }]}>
                        {activePackModal.rating} ({activePackModal.reviewsCount})
                      </Text>
                    </View>
                  </View>

                  {/* Description */}
                  <Text
                    style={[
                      styles.modalDescription,
                      { color: dynamicColors.textSecondary },
                    ]}>
                    {activePackModal.description}
                  </Text>

                  {/* Included Audio Stories */}
                  <View style={styles.modalStoriesSection}>
                    <Text
                      style={[
                        styles.modalStoriesHeading,
                        { color: dynamicColors.textPrimary },
                      ]}>
                      Geo-Tagged Audio Stories
                    </Text>

                    {activePackModal.storiesList.map((story, index) => (
                      <View
                        key={story.id}
                        style={[
                          styles.storyItemRow,
                          {
                            backgroundColor: dynamicColors.cardBg,
                            borderColor: dynamicColors.border,
                          },
                        ]}>
                        <View style={styles.storyIndexBadge}>
                          <Text style={styles.storyIndexText}>{index + 1}</Text>
                        </View>
                        <View style={styles.storyItemInfo}>
                          <Text
                            style={[
                              styles.storyItemTitle,
                              { color: dynamicColors.textPrimary },
                            ]}>
                            {story.title}
                          </Text>
                          <Text
                            style={[
                              styles.storyItemDesc,
                              { color: dynamicColors.textSecondary },
                            ]}>
                            {story.description}
                          </Text>
                        </View>
                        <View style={styles.storyDurationPill}>
                          <Text style={styles.storyDurationText}>{story.duration}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </ScrollView>

              {/* Start Trail Action Button */}
              <View style={styles.modalActionContainer}>
                <Pressable
                  style={styles.modalPrimaryButton}
                  onPress={() => handleStartPackTrip(activePackModal)}>
                  <Ionicons name="navigate" size={18} color="#FFFFFF" />
                  <Text style={styles.modalPrimaryButtonText}>
                    Start Trail with Audio Stories
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginTop: 4,
    lineHeight: 19,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    padding: 0,
  },
  clearBtn: {
    padding: 2,
  },
  categoryChipsContainer: {
    gap: 8,
    paddingBottom: 16,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  chipText: {
    fontSize: 13,
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  spotlightCard: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 26,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
  },
  spotlightImageContainer: {
    width: '100%',
    height: 180,
    position: 'relative',
    backgroundColor: '#333',
  },
  spotlightImage: {
    width: '100%',
    height: '100%',
  },
  spotlightBadge: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  spotlightBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  spotlightCategoryPill: {
    position: 'absolute',
    bottom: 14,
    left: 14,
    backgroundColor: 'rgba(0,122,255,0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  spotlightCategoryText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  spotlightContent: {
    padding: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    borderWidth: 1,
    borderTopWidth: 0,
  },
  spotlightMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 13,
    fontWeight: '700',
  },
  reviewsCount: {
    fontSize: 12,
  },
  durationBadge: {
    fontSize: 12,
    fontWeight: '500',
  },
  spotlightTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    letterSpacing: -0.2,
  },
  spotlightDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 14,
  },
  spotlightFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  creatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  creatorAvatarSmall: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ACCENT_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  creatorNameText: {
    fontSize: 13,
    fontWeight: '600',
  },
  listenButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
    gap: 5,
  },
  listenButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionHeaderRow: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  sectionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  packsGrid: {
    gap: 14,
  },
  packCard: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  packImageContainer: {
    width: '100%',
    height: 140,
    position: 'relative',
    backgroundColor: '#E5E3DF',
  },
  packImage: {
    width: '100%',
    height: '100%',
  },
  packCategoryTag: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  packCategoryTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  packDurationTag: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  packDurationTagText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '600',
  },
  packContent: {
    padding: 14,
  },
  packStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  packRatingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  packRatingText: {
    fontSize: 12,
    fontWeight: '700',
  },
  packStoriesCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  packTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  packCreatorFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  packCreatorName: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 260,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    maxHeight: '90%',
    paddingTop: 12,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#8E8E93',
    alignSelf: 'center',
    marginBottom: 12,
  },
  sheetScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  modalImageContainer: {
    width: '100%',
    height: 200,
    borderRadius: 18,
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 16,
  },
  modalImage: {
    width: '100%',
    height: '100%',
  },
  modalCloseBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCategoryBadge: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    backgroundColor: ACCENT_BLUE,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  modalCategoryBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  modalHeaderInfo: {
    gap: 12,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  modalCreatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  modalAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: ACCENT_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCreatorName: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalCreatorRole: {
    fontSize: 12,
  },
  modalMetaPills: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    borderRadius: 14,
    marginVertical: 4,
  },
  modalPillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalPillDivider: {
    width: 1,
    height: 20,
    backgroundColor: '#8E8E93',
    opacity: 0.3,
  },
  modalPillText: {
    fontSize: 13,
    fontWeight: '600',
  },
  modalDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  modalStoriesSection: {
    marginTop: 8,
    gap: 10,
  },
  modalStoriesHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  storyItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
  },
  storyIndexBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: ACCENT_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyIndexText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  storyItemInfo: {
    flex: 1,
  },
  storyItemTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  storyItemDesc: {
    fontSize: 12,
    lineHeight: 16,
  },
  storyDurationPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(0,122,255,0.1)',
  },
  storyDurationText: {
    color: ACCENT_BLUE,
    fontSize: 11,
    fontWeight: '600',
  },
  modalActionContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  modalPrimaryButton: {
    backgroundColor: ACCENT_BLUE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    gap: 8,
  },
  modalPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
