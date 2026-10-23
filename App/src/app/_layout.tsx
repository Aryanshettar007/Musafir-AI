import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/global.css';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AuthProvider } from '@/context/auth-context';
import { PreferencesProvider } from '@/context/preferences-context';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <PreferencesProvider>
            <AnimatedSplashOverlay />
            <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="trip/[id]"
              options={{ headerShown: false, presentation: 'card', gestureEnabled: false }}
            />
            <Stack.Screen
              name="privacy"
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <Stack.Screen
              name="terms"
              options={{ headerShown: false, presentation: 'modal' }}
            />
            <Stack.Screen name="support" options={{ headerShown: false }} />
            <Stack.Screen
              name="profile/delete-account"
              options={{ headerShown: false, presentation: 'card' }}
            />
          </Stack>
          </PreferencesProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
