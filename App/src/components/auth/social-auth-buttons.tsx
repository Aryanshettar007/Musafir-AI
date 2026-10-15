import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

import { ThemedText } from '@/components/themed-text';
import { auth } from '@/config/firebase';
import { useAuth } from '@/context/auth-context';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { syncUserSignIn } from '@/services/user-service';

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
  const [isAppleAvailable, setIsAppleAvailable] = useState(Platform.OS === 'ios');

  useEffect(() => {
    if (Platform.OS === 'ios') {
      AppleAuthentication.isAvailableAsync()
        .then((available) => setIsAppleAvailable(available))
        .catch(() => setIsAppleAvailable(false));
    }
  }, []);

  const isBusy = disabled || appleLoading || googleLoading;
  const showApple = Platform.OS === 'ios' && isAppleAvailable;

  const handlePostAuth = async (authedUser?: any) => {
    try {
      const syncResult = await syncUserSignIn();
      if (syncResult.hasProfile) {
        router.replace('/(tabs)');
      } else {
        const cachedName = await AsyncStorage.getItem('@musafir_social_name');
        const resolvedName =
          authedUser?.displayName ||
          auth.currentUser?.displayName ||
          cachedName ||
          '';

        if (resolvedName && resolvedName.trim()) {
          router.replace({
            pathname: '/(onboarding)',
            params: { name: resolvedName.trim() },
          });
        } else {
          router.replace('/(onboarding)');
        }
      }
    } catch {
      router.replace('/(onboarding)');
    }
  };

  const handleApplePress = async () => {
    if (isBusy) return;
    try {
      setAppleLoading(true);
      const user = await signInWithApple();
      await handlePostAuth(user);
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
      const user = await signInWithGoogle();
      await handlePostAuth(user);
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
        {showApple && (
          <View
            style={[
              styles.appleButtonWrapper,
              isBusy && styles.buttonDisabled,
            ]}
            pointerEvents={isBusy ? 'none' : 'auto'}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={
                isDark
                  ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
                  : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={8}
              style={styles.appleButton}
              onPress={handleApplePress}
            />
            {appleLoading && (
              <View
                style={[
                  styles.loadingOverlay,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255, 255, 255, 0.85)'
                      : 'rgba(0, 0, 0, 0.75)',
                  },
                ]}>
                <ActivityIndicator
                  size="small"
                  color={isDark ? '#000000' : '#ffffff'}
                />
              </View>
            )}
          </View>
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
                numberOfLines={1}
                style={[
                  styles.buttonText,
                  { color: isDark ? '#ffffff' : '#000000' },
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
  appleButtonWrapper: {
    width: '100%',
    height: 44,
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
  },
  appleButton: {
    width: '100%',
    height: 44,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
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
  googleIcon: {
    width: 17,
    height: 17,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
    includeFontPadding: false,
  },
});
