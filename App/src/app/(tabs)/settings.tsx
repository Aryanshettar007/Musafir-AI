import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

export default function SettingsScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title">Settings Screen</ThemedText>
          <ThemedText themeColor="textSecondary">
            Manage your preferences & profile (Dummy Content)
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText type="default">Account Settings: [Dummy Option]</ThemedText>
          <ThemedText type="default">Notification Preferences: [Dummy Toggle]</ThemedText>
          <ThemedText type="default">Language & Currency: [Dummy Option]</ThemedText>
          <ThemedText type="default">Privacy & Security: [Dummy Option]</ThemedText>
        </View>

        <View style={styles.navigationSection}>
          <Pressable
            style={styles.navButton}
            onPress={() => router.push('/(tabs)')}>
            <ThemedText type="default">← Back to Home</ThemedText>
          </Pressable>

          <Pressable
            style={styles.logoutButton}
            onPress={() => router.replace('/(auth)/login')}>
            <ThemedText type="default" style={styles.logoutText}>
              Log Out (Back to Login)
            </ThemedText>
          </Pressable>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    maxWidth: MaxContentWidth,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  card: {
    padding: Spacing.four,
    borderRadius: Spacing.three,
    gap: Spacing.three,
    borderWidth: 1,
    borderColor: '#33333333',
  },
  navigationSection: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  navButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  logoutButton: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    marginTop: Spacing.two,
  },
  logoutText: {
    color: '#FF3B30',
    fontWeight: '600',
  },
});
