import React, { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';

import { ThemedText } from '@/components/themed-text';
import { useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { syncUserSignIn } from '@/services/user-service';
import { useRouter } from 'expo-router';

export interface SocialAuthButtonsProps {
  onError?: (errorMessage: string) => void;
  disabled?: boolean;
}

export function SocialAuthButtons({ onError, disabled }: SocialAuthButtonsProps) {
  const router = useRouter();
  const { signInWithGoogle, signInWithApple } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const isBusy = disabled || appleLoading || googleLoading;
  const isIOS = Platform.OS === 'ios';

  const handlePostAuth = async () => {
    try {
      const syncResult = await syncUserSignIn();
      if (syncResult.hasProfile) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(onboarding)');
      }
    } catch {
      router.replace('/(onboarding)');
    }
  };

  const handleApplePress = async () => {
    if (isBusy) return;
    try {
      setAppleLoading(true);
      await signInWithApple();
      await handlePostAuth();
    } catch (err: any) {
      if (err?.message && err.message !== 'Sign-in cancelled.') {
        onError?.(err.message);
      }
    } finally {
      setAppleLoading(false);
    }
  };

  const handleGooglePress = async () => {
    if (isBusy) return;
    try {
      setGoogleLoading(true);
      await signInWithGoogle();
      await handlePostAuth();
    } catch (err: any) {
      if (err?.message && err.message !== 'Sign-in cancelled.') {
        onError?.(err.message);
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.dividerRow}>
        <View
          style={[
            styles.dividerLine,
            { backgroundColor: isDark ? '#27272a' : '#e4e4e7' },
          ]}
        />
        <ThemedText
          themeColor="textSecondary"
          type="small"
          style={styles.dividerText}>
          OR
        </ThemedText>
        <View
          style={[
            styles.dividerLine,
            { backgroundColor: isDark ? '#27272a' : '#e4e4e7' },
          ]}
        />
      </View>

      <View style={styles.buttonsContainer}>
        {isIOS && (
          <Pressable
            disabled={isBusy}
            onPress={handleApplePress}
            accessibilityRole="button"
            accessibilityLabel="Continue with Apple"
            style={({ pressed }) => [
              styles.socialButton,
              {
                backgroundColor: isDark ? '#ffffff' : '#000000',
                opacity: isBusy ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}>
            {appleLoading ? (
              <ActivityIndicator
                size="small"
                color={isDark ? '#000000' : '#ffffff'}
              />
            ) : (
              <View style={styles.buttonContent}>
                <Ionicons
                  name="logo-apple"
                  size={19}
                  color={isDark ? '#000000' : '#ffffff'}
                  style={styles.icon}
                />
                <Text
                  style={[
                    styles.buttonText,
                    { color: isDark ? '#000000' : '#ffffff' },
                  ]}>
                  Continue with Apple
                </Text>
              </View>
            )}
          </Pressable>
        )}

        <Pressable
          disabled={isBusy}
          onPress={handleGooglePress}
          accessibilityRole="button"
          accessibilityLabel="Continue with Google"
          style={({ pressed }) => [
            styles.socialButton,
            {
              backgroundColor: isDark ? '#18181b' : '#ffffff',
              borderColor: isDark ? '#27272a' : '#e4e4e7',
              borderWidth: 1,
              opacity: isBusy ? 0.6 : pressed ? 0.85 : 1,
            },
          ]}
        >
          {googleLoading ? (
            <ActivityIndicator
              size="small"
              color={isDark ? '#ffffff' : '#09090b'}
            />
          ) : (
            <View style={styles.buttonContent}>
              <Image
                source={require('@/assets/images/google-logo.png')}
                style={styles.googleIcon}
                contentFit="contain"
                accessibilityLabel="Google logo"
              />
              <Text
                style={[
                  styles.buttonText,
                  { color: isDark ? '#fafafa' : '#09090b' },
                ]}>
                Continue with Google
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    gap: 16,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 4,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  buttonsContainer: {
    gap: 10,
    width: '100%',
  },
  socialButton: {
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    width: '100%',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  icon: {
    marginTop: -1,
  },
  googleIcon: {
    width: 18,
    height: 18,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
