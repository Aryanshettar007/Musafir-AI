import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/auth-context';
import { syncUserSignIn } from '@/services/user-service';

export default function SignUpScreen() {
  const router = useRouter();
  const { signUpWithEmail } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isConfirmEntered = confirmPassword.length > 0;
  const isPasswordsMatching = password.length > 0 && password === confirmPassword;

  const handleSignUp = async () => {
    if (!email.trim()) {
      setErrorMessage('Please enter your email address.');
      return;
    }
    if (!password) {
      setErrorMessage('Please create a password.');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      setErrorMessage(null);
      await signUpWithEmail(email, password);

      // Send request to backend with Firebase ID token
      await syncUserSignIn();

      router.replace('/(onboarding)');
    } catch (err: any) {
      setErrorMessage(err.message || 'Registration failed. Please try again.');
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
                  Create an account
                </ThemedText>
                <ThemedText themeColor="textSecondary" type="small" style={styles.description}>
                  Enter your email below to create your Musafir AI account
                </ThemedText>
              </View>

              <View style={styles.fields}>
                {errorMessage ? (
                  <Alert
                    variant="destructive"
                    title="Registration Error"
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
                  autoComplete="new-password"
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (errorMessage) setErrorMessage(null);
                  }}
                />

                <View style={styles.confirmWrapper}>
                  <Input
                    label="Confirm Password"
                    placeholder="••••••••"
                    isPassword
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChangeText={(text) => {
                      setConfirmPassword(text);
                      if (errorMessage) setErrorMessage(null);
                    }}
                  />

                  {isConfirmEntered && (
                    <View style={styles.matchStatusRow}>
                      <Text
                        style={[
                          styles.matchStatusText,
                          { color: isPasswordsMatching ? '#10b981' : '#ef4444' },
                        ]}>
                        {isPasswordsMatching
                          ? '✓ Passwords match'
                          : '✗ Passwords do not match'}
                      </Text>
                    </View>
                  )}
                </View>

                <Button
                  variant="default"
                  size="default"
                  isLoading={loading}
                  onPress={handleSignUp}
                  style={styles.submitButton}>
                  {loading ? 'Creating Account...' : 'Create Account'}
                </Button>
              </View>

              <View style={styles.footerRow}>
                <ThemedText themeColor="textSecondary" type="small">
                  Already have an account?{' '}
                </ThemedText>
                <Button
                  variant="link"
                  size="sm"
                  onPress={() => router.push('/(auth)/login')}>
                  Log In
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
  confirmWrapper: {
    gap: 6,
  },
  matchStatusRow: {
    paddingLeft: 2,
    marginTop: -2,
  },
  matchStatusText: {
    fontSize: 12,
    fontWeight: '500',
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
