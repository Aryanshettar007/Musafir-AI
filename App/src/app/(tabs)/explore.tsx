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
import * as Haptics from 'expo-haptics';

import { ThemedView } from '@/components/themed-view';
import { Colors, BottomTabInset } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { CREATOR_PACKS, CreatorPack } from '@/constants/creator-packs';
import { VoiceCloneSection } from '@/components/explore/voice-clone-section';
import { PartnerExperiencesSection } from '@/components/explore/partner-experiences-section';

export default function ExploreScreen() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];
  const insets = useSafeAreaInsets();

  // Handle Creator Pack preview tap
  const handleCreatorPackPress = (pack: CreatorPack) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const title = pack.title;
    const message =
      'Creator Economy & Voice Localization:\n\n' +
      'Why this is important: Local creators, historians, and guides can publish and share their unique stories and heritage walks with road-trippers.\n\n' +
      'Monetization: Musafir earns revenue through creator listing fees and story subscription revenue share.\n\n' +
      'Multilingual AI Voice: Musafir translates and narrates the story in the user\'s preferred language, while cloning and maintaining the creator\'s own authentic voice.\n\n' +
      '(Audio preview is currently locked pending creator voice licensing and publishing permissions.)';

    if (Platform.OS === 'web') {
      window.alert(`${title}\n\n${message}`);
    } else {
      Alert.alert(title, message);
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
