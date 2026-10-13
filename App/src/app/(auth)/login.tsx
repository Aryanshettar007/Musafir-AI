import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SocialAuthButtons } from '@/components/auth/social-auth-buttons';
import { useAuth } from '@/context/auth-context';
import { syncUserSignIn } from '@/services/user-service';

export default function LoginScreen() {
  const router = useRouter();
  const { signInWithEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      await signInWithEmail(email, password);

      // Send request to backend with Firebase ID token (GET /me)
      const syncResult = await syncUserSignIn();

      if (syncResult.hasProfile) {
        router.replace('/(tabs)');
      } else {
        router.replace('/(onboarding)');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardView}>
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.formContainer}>
              <View style={styles.header}>
                <ThemedText type="subtitle" style={styles.title}>
                  Welcome back
                </ThemedText>
                <ThemedText themeColor="textSecondary" type="small" style={styles.description}>
                  Enter your email to sign in to your Musafir AI account
                </ThemedText>
              </View>

              <View style={styles.fields}>
                {errorMessage ? (
                  <Alert
                    variant="destructive"
                    title="Authentication Error"
                    description={errorMessage}
                  />
                ) : null}

                <Input
                  label="Email"
                  placeholder="m@example.com"
                  keyboardType="email-address"
                  autoComplete="email"
                  autoCorrect={false}
                  value={email}
                  onChangeText={(text) => {
                    setEmail(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                />

                <Input
                  label="Password"
                  placeholder="••••••••"
                  isPassword
                  autoComplete="password"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                />

                <Button
                  variant="default"
                  size="default"
                  isLoading={loading}
                  onPress={handleLogin}
                  style={styles.submitButton}>
                  {loading ? 'Signing In...' : 'Sign In'}
                </Button>

                <SocialAuthButtons
                  disabled={loading}
                  onError={(err) => setErrorMessage(err)}
                />
              </View>

              <View style={styles.footerRow}>
                <ThemedText themeColor="textSecondary" type="small">
                  Don't have an account?{' '}
                </ThemedText>
                <Button
                  variant="link"
                  size="sm"
                  onPress={() => router.push('/(auth)/signup')}>
                  Sign Up
                </Button>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
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
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  formContainer: {
    width: '100%',
    maxWidth: 400,
    gap: 24,
  },
  header: {
    gap: 8,
    alignItems: 'center',
  },
  title: {
    fontSize: 38,
    lineHeight: 44,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  fields: {
    gap: 16,
  },
  submitButton: {
    marginTop: 8,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
