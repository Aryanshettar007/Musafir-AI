import React from 'react';
import { Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useColorScheme } from '@/hooks/use-color-scheme';

const SUPPORT_EMAIL = 'rishitpadagatti@gmail.com';

// Public screen (no auth needed): its web URL is the App Store "Support URL".
export default function SupportScreen() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';

  const colors = {
    bg: isDark ? '#000000' : '#FFFFFF',
    card: isDark ? '#1C1C1E' : '#F3F4F6',
    textPrimary: isDark ? '#EDEDED' : '#1A1A1A',
    textSecondary: isDark ? '#9CA3AF' : '#6B7280',
    accent: isDark ? '#E08A55' : '#B4521F',
  };

  const rows = [
    {
      icon: 'mail-outline' as const,
      label: 'Email us',
      detail: SUPPORT_EMAIL,
      onPress: () => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Musafir%20AI%20Support`),
    },
    {
      icon: 'shield-checkmark-outline' as const,
      label: 'Privacy Policy',
      onPress: () => router.push('/privacy'),
    },
    {
      icon: 'document-text-outline' as const,
      label: 'Terms of Service',
      onPress: () => router.push('/terms'),
    },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>Musafir AI Support</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Questions, feedback or a problem on the road? Email us with your device, app version and what
          happened, and we will get back to you.
        </Text>

        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {rows.map((row, i) => (
            <Pressable
              key={row.label}
              onPress={row.onPress}
              accessibilityRole="link"
              style={[styles.row, i > 0 && styles.rowDivider]}
            >
              <Ionicons name={row.icon} size={22} color={colors.accent} />
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>{row.label}</Text>
                {row.detail ? (
                  <Text style={[styles.rowDetail, { color: colors.textSecondary }]}>{row.detail}</Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: {
    padding: 20,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
    paddingTop: Platform.OS === 'web' ? 48 : 20,
  },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 8 },
  subtitle: { fontSize: 15, lineHeight: 22, marginBottom: 24 },
  card: { borderRadius: 14, paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(128,128,128,0.35)' },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  rowDetail: { fontSize: 13, marginTop: 2 },
});
