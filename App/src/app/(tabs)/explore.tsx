import { useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Image as ExpoImage } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { ThemedView } from '@/components/themed-view';
import { Colors, BottomTabInset } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  CREATOR_PACKS,
  CREATOR_PACKS_INFO_MESSAGE,
  CREATOR_PACKS_INFO_TITLE,
  CreatorPack,
} from '@/constants/creator-packs';
import { VoiceCloneSection } from '@/components/explore/voice-clone-section';
import { CreatorPackModal } from '@/components/explore/creator-pack-modal';
import { PartnerExperiencesSection } from '@/components/explore/partner-experiences-section';

export default function ExploreScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();

  const [selectedPack, setSelectedPack] = useState<CreatorPack | null>(null);

  const handleCreatorPackPress = (pack: CreatorPack) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedPack(pack);
  };

  const handleInfoPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS === 'web') {
      window.alert(`${CREATOR_PACKS_INFO_TITLE}\n\n${CREATOR_PACKS_INFO_MESSAGE}`);
    } else {
      Alert.alert(CREATOR_PACKS_INFO_TITLE, CREATOR_PACKS_INFO_MESSAGE);
    }
  };

  return (
    <ThemedView style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + BottomTabInset + 32 },
          ]}>
          {/* Header Title */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Explore</Text>
          </View>

          {/* CUSTOM VOICE CLONE SECTION */}
          <VoiceCloneSection />

          {/* PARTNER TRAILS / BRAND EXPERIENCES (From DB with Map) */}
          <PartnerExperiencesSection />

          {/* CREATOR PACKS SECTION (exact original design from Home) */}
          <View style={styles.creatorSection}>
            <View style={styles.creatorSectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                Creator Packs
              </Text>
              <Pressable
                onPress={handleInfoPress}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="About Creator Packs">
                <Ionicons name="information-circle-outline" size={20} color={colors.text} />
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.creatorCardsScroll}>
              {CREATOR_PACKS.map((pack) => (
                <Pressable
                  key={pack.id}
                  style={({ pressed }) => [
                    styles.creatorCard,
                    pressed && styles.cardPressed,
                  ]}
                  onPress={() => handleCreatorPackPress(pack)}>
                  <View style={styles.imageContainer}>
                    <ExpoImage
                      source={{ uri: pack.imageUrl }}
                      style={styles.creatorImage}
                      contentFit="cover"
                      transition={300}
                    />
                  </View>
                  <View style={styles.creatorInfoBlock}>
                    <Text
                      style={[styles.creatorPackTitle, { color: colors.text }]}
                      numberOfLines={1}>
                      {pack.title}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      </SafeAreaView>
      <CreatorPackModal pack={selectedPack} onClose={() => setSelectedPack(null)} />
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
    paddingVertical: 14,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  // Creator Packs Section (matching original Home styling)
  creatorSection: {
    marginTop: 12,
    marginBottom: 16,
  },
  creatorSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  creatorCardsScroll: {
    paddingRight: 16,
    gap: 14,
  },
  creatorCard: {
    width: 200,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  imageContainer: {
    width: '100%',
    height: 130,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#E5E3DF',
  },
  creatorImage: {
    width: '100%',
    height: '100%',
  },
  creatorInfoBlock: {
    marginTop: 8,
  },
  creatorPackTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
