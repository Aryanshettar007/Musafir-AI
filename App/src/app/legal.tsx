import React, { useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/hooks/use-color-scheme';

interface LegalScreenProps {
  defaultType?: 'privacy' | 'terms';
}

export default function LegalScreen({ defaultType }: LegalScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ type?: 'privacy' | 'terms' }>();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const initialTab =
    params.type === 'terms' || defaultType === 'terms' ? 'terms' : 'privacy';
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms'>(initialTab);

  const colors = {
    bg: isDark ? '#000000' : '#F9F9FB',
    cardBg: isDark ? '#121214' : '#FFFFFF',
    cardBorder: isDark ? '#232326' : '#ECECF0',
    textPrimary: isDark ? '#FFFFFF' : '#111827',
    textSecondary: isDark ? '#9CA3AF' : '#6B7280',
    textMuted: isDark ? '#6B7280' : '#9CA3AF',
    tabBarBg: isDark ? '#1C1C1E' : '#EAEAEF',
    tabActiveBg: isDark ? '#2C2C2E' : '#FFFFFF',
    accent: '#3B82F6',
    warningBg: isDark ? '#2A1F0D' : '#FEF3C7',
    warningBorder: isDark ? '#4D3817' : '#FDE68A',
    warningText: isDark ? '#FCD34D' : '#92400E',
    divider: isDark ? '#1F2937' : '#E5E7EB',
    closeBtnBg: isDark ? '#1C1C1E' : '#EAEAEF',
  };

  const handleTabChange = (tab: 'privacy' | 'terms') => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore
    }
    setActiveTab(tab);
  };

  const handleClose = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      // Ignore
    }
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header Bar */}
      <View style={[styles.header, { borderBottomColor: colors.divider }]}>
        <View style={styles.headerTitleContainer}>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {activeTab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
          </Text>
          <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
            Musafir AI • Last updated October 2026
          </Text>
        </View>

        <Pressable
          onPress={handleClose}
          hitSlop={10}
          accessibilityLabel="Close"
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.closeButton,
            { backgroundColor: colors.closeBtnBg },
            pressed && styles.pressed,
          ]}>
          <Ionicons name="close" size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* Segmented Tab Switcher */}
      <View style={styles.tabContainer}>
        <View style={[styles.tabBar, { backgroundColor: colors.tabBarBg }]}>
          <Pressable
            onPress={() => handleTabChange('privacy')}
            style={[
              styles.tabButton,
              activeTab === 'privacy' && [
                styles.tabButtonActive,
                { backgroundColor: colors.tabActiveBg },
              ],
            ]}>
            <Ionicons
              name="shield-checkmark-outline"
              size={15}
              color={activeTab === 'privacy' ? colors.textPrimary : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabButtonText,
                {
                  color:
                    activeTab === 'privacy' ? colors.textPrimary : colors.textSecondary,
                  fontWeight: activeTab === 'privacy' ? '600' : '500',
                },
              ]}>
              Privacy Policy
            </Text>
          </Pressable>

          <Pressable
            onPress={() => handleTabChange('terms')}
            style={[
              styles.tabButton,
              activeTab === 'terms' && [
                styles.tabButtonActive,
                { backgroundColor: colors.tabActiveBg },
              ],
            ]}>
            <Ionicons
              name="document-text-outline"
              size={15}
              color={activeTab === 'terms' ? colors.textPrimary : colors.textSecondary}
            />
            <Text
              style={[
                styles.tabButtonText,
                {
                  color:
                    activeTab === 'terms' ? colors.textPrimary : colors.textSecondary,
                  fontWeight: activeTab === 'terms' ? '600' : '500',
                },
              ]}>
              Terms of Service
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Content Area */}
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: Math.max(insets.bottom, 24) + 32 },
        ]}
        showsVerticalScrollIndicator={false}>
        {activeTab === 'privacy' ? (
          <PrivacyPolicyContent colors={colors} />
        ) : (
          <TermsOfServiceContent colors={colors} />
        )}

        {/* Done / Dismiss Button */}
        <Pressable
          onPress={handleClose}
          style={({ pressed }) => [
            styles.doneButton,
            { backgroundColor: isDark ? '#FFFFFF' : '#000000' },
            pressed && { opacity: 0.85 },
          ]}>
          <Text
            style={[
              styles.doneButtonText,
              { color: isDark ? '#000000' : '#FFFFFF' },
            ]}>
            I Understand
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------
// PRIVACY POLICY CONTENT
// ---------------------------------------------------------
function PrivacyPolicyContent({ colors }: { colors: any }) {
  return (
    <View style={styles.sectionList}>
      {/* Overview Banner */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: colors.cardBg,
            borderColor: colors.cardBorder,
          },
        ]}>
        <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
          At <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Musafir AI</Text>, we
          respect your privacy and are committed to safeguarding your personal information.
          This Privacy Policy describes what information we collect, how it is used to enrich
          your travel and audio guide experience, and how you can exercise control over your
          data.
        </Text>
      </View>

      {/* Section 1 */}
      <SectionCard
        colors={colors}
        icon="person-outline"
        title="1. Information We Collect"
        content={[
          {
            label: 'Account Details:',
            text: 'Your email address, authentication provider identifiers, and name when you sign in via Email, Google, or Apple.',
          },
          {
            label: 'Travel Profile:',
            text: 'Preferences you configure including preferred audio narration language, selected narrator voice, age range, and travel interests.',
          },
          {
            label: 'Location Data:',
            text: 'Precise and approximate GPS location when the app is active, used strictly to provide real-time audio guidance, detect nearby attractions, and calculate itinerary distances.',
          },
          {
            label: 'Offline Storage:',
            text: 'Audio guide files and trip waypoints stored in your device’s local cache for offline listening during travel.',
          },
        ]}
      />

      {/* Section 2 */}
      <SectionCard
        colors={colors}
        icon="sparkles-outline"
        title="2. How We Use Your Information"
        content={[
          {
            label: 'Smart Audio Narration:',
            text: 'To dynamically generate and play context-aware audio stories about landmarks you approach.',
          },
          {
            label: 'Personalized Itineraries:',
            text: 'To tailor recommended stops, themes, and points of interest based on your selected interests and language.',
          },
          {
            label: 'Cross-Device Sync:',
            text: 'To save your profile and active trips securely across your devices.',
          },
          {
            label: 'Performance & Reliability:',
            text: 'To diagnose system errors, improve voice synthesis quality, and optimize routing efficiency.',
          },
        ]}
      />

      {/* Section 3 */}
      <SectionCard
        colors={colors}
        icon="git-network-outline"
        title="3. Third-Party Services & Integrations"
        content={[
          {
            label: 'Authentication:',
            text: 'Google Firebase Authentication handles encrypted credential storage and account verification.',
          },
          {
            label: 'Map & Geo Services:',
            text: 'Mapping data providers assist in rendering interactive routes and calculating travel waypoints.',
          },
          {
            label: 'Speech & AI Synthesis:',
            text: 'Cloud AI services are used to produce high-fidelity audio narration. Your personal identity is never sold or used for targeted commercial advertising.',
          },
        ]}
      />

      {/* Section 4 */}
      <SectionCard
        colors={colors}
        icon="lock-closed-outline"
        title="4. Data Storage, Security & Offline Cache"
        content={[
          {
            label: 'Encryption:',
            text: 'All communications between the Musafir AI app and our backend APIs are secured with HTTPS/TLS encryption.',
          },
          {
            label: 'Local Sandbox:',
            text: 'Offline audio files are saved directly in your device’s sandbox. You can clear this storage at any time from your Profile screen.',
          },
        ]}
      />

      {/* Section 5 */}
      <SectionCard
        colors={colors}
        icon="options-outline"
        title="5. Your Rights and Choices"
        content={[
          {
            label: 'Profile Editing:',
            text: 'You can update your name, travel interests, and voice preferences at any time from the Profile tab.',
          },
          {
            label: 'Location Permissions:',
            text: 'You may modify or revoke GPS location permissions via your device’s operating system settings.',
          },
          {
            label: 'Account & Data Deletion:',
            text: 'You can request permanent deletion of your account and associated profile records by contacting support@musafir.ai.',
          },
        ]}
      />

      {/* Section 6 */}
      <SectionCard
        colors={colors}
        icon="mail-outline"
        title="6. Contact Us"
        content={[
          {
            label: 'Support & Inquiries:',
            text: 'If you have questions or feedback regarding this Privacy Policy, please email us at privacy@musafir.ai.',
          },
        ]}
      />
    </View>
  );
}

// ---------------------------------------------------------
// TERMS OF SERVICE CONTENT
// ---------------------------------------------------------
function TermsOfServiceContent({ colors }: { colors: any }) {
  return (
    <View style={styles.sectionList}>
      {/* Important Travel Safety Notice */}
      <View
        style={[
          styles.warningCard,
          {
            backgroundColor: colors.warningBg,
            borderColor: colors.warningBorder,
          },
        ]}>
        <View style={styles.warningHeader}>
          <Ionicons name="warning-outline" size={18} color={colors.warningText} />
          <Text style={[styles.warningTitle, { color: colors.warningText }]}>
            AI Travel Guide & Safety Disclaimer
          </Text>
        </View>
        <Text style={[styles.warningBody, { color: colors.warningText }]}>
          Musafir AI is an informational and entertainment travel companion. Audio stories,
          points of interest, and routes are generated with the assistance of artificial
          intelligence. Always obey local traffic rules, trail warnings, road signs, and private
          property restrictions. Do not operate the app while driving or engaging in hazardous
          activities.
        </Text>
      </View>

      {/* Section 1 */}
      <SectionCard
        colors={colors}
        icon="checkmark-circle-outline"
        title="1. Acceptance of Terms"
        content={[
          {
            label: 'Agreement:',
            text: 'By downloading, installing, or using the Musafir AI mobile application, you agree to comply with and be bound by these Terms of Service. If you do not agree, please discontinue using the app.',
          },
          {
            label: 'Eligibility:',
            text: 'You must be at least 13 years of age (or the minimum legal age in your jurisdiction) to use Musafir AI.',
          },
        ]}
      />

      {/* Section 2 */}
      <SectionCard
        colors={colors}
        icon="compass-outline"
        title="2. Service Scope & AI Content"
        content={[
          {
            label: 'Informational Use:',
            text: 'Musafir AI provides curated itineraries, synthesized audio narration, and travel insights. We do not warrant the absolute accuracy, completeness, or timeliness of AI-generated content.',
          },
          {
            label: 'Not Official Navigation:',
            text: 'Musafir AI is not a certified emergency dispatch or official maritime/aviation/hazard navigation system. You are solely responsible for personal travel safety.',
          },
        ]}
      />

      {/* Section 3 */}
      <SectionCard
        colors={colors}
        icon="shield-outline"
        title="3. User Accounts & Responsibilities"
        content={[
          {
            label: 'Account Security:',
            text: 'You are responsible for maintaining the confidentiality of your login credentials and for all actions taken under your account.',
          },
          {
            label: 'Accurate Information:',
            text: 'You agree to provide true and accurate information during registration and profile setup.',
          },
        ]}
      />

      {/* Section 4 */}
      <SectionCard
        colors={colors}
        icon="bulb-outline"
        title="4. Intellectual Property"
        content={[
          {
            label: 'Proprietary Content:',
            text: 'All narration scripts, synthesized audio tracks, icons, graphics, and interface designs are owned by or licensed to Musafir AI.',
          },
          {
            label: 'Personal License:',
            text: 'You are granted a limited, non-exclusive, non-transferable license to access the content and download offline guides solely for personal, non-commercial travel use.',
          },
        ]}
      />

      {/* Section 5 */}
      <SectionCard
        colors={colors}
        icon="ban-outline"
        title="5. Prohibited Conduct"
        content={[
          {
            label: 'Restrictions:',
            text: 'You agree not to reverse-engineer, decompile, bulk-scrape, or systematically extract audio files, travel data, or backend API resources without prior written authorization.',
          },
          {
            label: 'Lawful Use:',
            text: 'You agree not to use the app in connection with any unlawful, fraudulent, or harmful activity.',
          },
        ]}
      />

      {/* Section 6 */}
      <SectionCard
        colors={colors}
        icon="scale-outline"
        title="6. Limitation of Liability"
        content={[
          {
            label: 'As-Is Basis:',
            text: 'Musafir AI is provided on an "as is" and "as available" basis without warranties of any kind.',
          },
          {
            label: 'Damages Disclaimer:',
            text: 'To the maximum extent permitted by law, Musafir AI and its creators shall not be liable for any indirect, incidental, punitive, or consequential damages resulting from your use of or inability to use the service.',
          },
        ]}
      />

      {/* Section 7 */}
      <SectionCard
        colors={colors}
        icon="mail-outline"
        title="7. Contact Information"
        content={[
          {
            label: 'Legal Questions:',
            text: 'For inquiries regarding these Terms of Service, please reach out to legal@musafir.ai.',
          },
        ]}
      />
    </View>
  );
}

// ---------------------------------------------------------
// REUSABLE SECTION CARD
// ---------------------------------------------------------
function SectionCard({
  colors,
  icon,
  title,
  content,
}: {
  colors: any;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  content: { label: string; text: string }[];
}) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.cardBg,
          borderColor: colors.cardBorder,
        },
      ]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIconBox, { backgroundColor: colors.tabBarBg }]}>
          <Ionicons name={icon} size={16} color={colors.textPrimary} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>{title}</Text>
      </View>

      <View style={styles.cardBody}>
        {content.map((item, index) => (
          <View key={index} style={styles.bulletRow}>
            <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
              <Text style={{ fontWeight: '600', color: colors.textPrimary }}>
                {item.label}{' '}
              </Text>
              {item.text}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------
// STYLES
// ---------------------------------------------------------
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleContainer: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  tabContainer: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  tabBar: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabButtonActive: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.12,
        shadowRadius: 2,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  tabButtonText: {
    fontSize: 13,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  sectionList: {
    gap: 14,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  cardIconBox: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  cardBody: {
    gap: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bodyText: {
    fontSize: 13,
    lineHeight: 20,
  },
  warningCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  warningHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  warningBody: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
  },
  doneButton: {
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  doneButtonText: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  pressed: {
    opacity: 0.7,
  },
});
