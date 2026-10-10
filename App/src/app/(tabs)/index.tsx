import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

export default function HomeScreen() {
  const router = useRouter();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <ThemedText type="title">Home Screen</ThemedText>
          <ThemedText themeColor="textSecondary">
            Welcome to Musafir AI - Main Dashboard (Dummy Content)
          </ThemedText>
        </View>

        <View style={styles.card}>
          <ThemedText type="subtitle">Featured Trips / Activities</ThemedText>
          <ThemedText themeColor="textSecondary">
            [Dummy trip suggestions, weather, itinerary overview]
          </ThemedText>
        </View>

        <View style={styles.navigationSection}>
          <Pressable
            style={styles.navButton}
            onPress={() => router.push('/(tabs)/settings')}>
            <ThemedText type="default">Go to Settings →</ThemedText>
          </Pressable>
          <Pressable
            style={styles.navButtonSecondary}
            onPress={() => router.replace('/(auth)/login')}>
            <ThemedText type="small" themeColor="textSecondary">
              Switch Account / Log out
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
    gap: Spacing.two,
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
  navButtonSecondary: {
    padding: Spacing.two,
  },
});
