import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/auth-context';
import {
  deleteUserAccount,
  getPrimaryAuthProvider,
  type AuthProviderType,
} from '@/services/account-service';
import { LegalLinks } from '@/components/legal-links';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { user, signInWithEmail, signInWithGoogle, signInWithApple, logOut } = useAuth();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authMethod, setAuthMethod] = useState<'password' | 'google' | 'apple'>('password');
  const [confirmedWarning, setConfirmedWarning] = useState(false);

  // Status states
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDeletedSuccess, setIsDeletedSuccess] = useState(false);

  const provider: AuthProviderType = getPrimaryAuthProvider(user);

  const colors = {
    bg: isDark ? '#000000' : '#F9FAFB',
    cardBg: isDark ? '#1C1C1E' : '#FFFFFF',
    border: isDark ? '#2C2C2E' : '#E5E7EB',
    textPrimary: isDark ? '#FFFFFF' : '#111827',
    textSecondary: isDark ? '#9CA3AF' : '#6B7280',
    inputBg: isDark ? '#141416' : '#F3F4F6',
    inputBorder: isDark ? '#3A3A3C' : '#D1D5DB',
    dangerBg: isDark ? '#271212' : '#FEF2F2',
    dangerBorder: isDark ? '#4C1D1D' : '#FEE2E2',
    dangerText: '#EF4444',
    accent: '#007AFF',
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(user ? '/(tabs)/profile' : '/(auth)/login');
    }
  };

  // Immediate deletion handler for already authenticated users
  const handleDeleteForSignedInUser = async () => {
    if (isDeleting) return;

    if (!confirmedWarning) {
      setErrorMessage('Please check the confirmation box below acknowledging that this action is permanent.');
      return;
    }

    if (provider === 'password' && !password.trim()) {
      setErrorMessage('Please enter your current password to confirm account deletion.');
      return;
    }

    try {
      setIsDeleting(true);
      setErrorMessage(null);

      if (Platform.OS !== 'web') {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch {}
      }

      await deleteUserAccount({
        password: provider === 'password' ? password : undefined,
      });

      if (Platform.OS !== 'web') {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      }

      setIsDeletedSuccess(true);
    } catch (err: any) {
      console.warn('[DeleteAccountScreen] Error deleting account:', err);
      const msg = err?.message || 'Could not delete account. Please verify your credentials and try again.';
      setErrorMessage(msg);
      if (Platform.OS !== 'web') {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch {}
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // Immediate deletion handler for guest / web visitors not currently logged in
  const handleDeleteForUnauthenticatedUser = async (method: 'password' | 'google' | 'apple') => {
    if (isDeleting) return;

    if (!confirmedWarning) {
      setErrorMessage('Please check the confirmation box below acknowledging that this action is permanent.');
      return;
    }

    try {
      setIsDeleting(true);
      setErrorMessage(null);

      if (Platform.OS !== 'web') {
        try {
          await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch {}
      }

      if (method === 'password') {
        if (!email.trim()) {
          setErrorMessage('Please enter your account email address.');
          setIsDeleting(false);
          return;
        }
        if (!password) {
          setErrorMessage('Please enter your account password.');
          setIsDeleting(false);
          return;
        }

        // 1. Sign in to verify identity
        await signInWithEmail(email.trim(), password);

        // 2. Immediately delete user data and account
        await deleteUserAccount({ password });
      } else if (method === 'google') {
        // 1. Sign in with Google to verify identity
        await signInWithGoogle();

        // 2. Immediately delete user data and account
        await deleteUserAccount();
      } else if (method === 'apple') {
        // 1. Sign in with Apple to verify identity
        await signInWithApple();

        // 2. Immediately delete user data and account
        await deleteUserAccount();
      }

      if (Platform.OS !== 'web') {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } catch {}
      }

      setIsDeletedSuccess(true);
    } catch (err: any) {
      console.warn('[DeleteAccountScreen] Error deleting account:', err);
      const msg = err?.message || 'Could not delete account. Please check your credentials and try again.';
      setErrorMessage(msg);
      if (Platform.OS !== 'web') {
        try {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } catch {}
      }
    } finally {
      setIsDeleting(false);
    }
  };

  // SUCCESS SCREEN
  if (isDeletedSuccess) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
        <ScrollView contentContainerStyle={styles.centerContent}>
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={styles.successIconCircle}>
              <Ionicons name="checkmark-circle" size={48} color="#10B981" />
            </View>

            <Text style={[styles.title, { color: colors.textPrimary, textAlign: 'center' }]}>
              Account Deleted
            </Text>

            <Text style={[styles.bodyText, { color: colors.textSecondary, textAlign: 'center' }]}>
              Your Musafir AI account and all associated data (including trips, profile details, generated voices, and listening history) have been permanently deleted from our servers.
            </Text>

            <Pressable
              onPress={() => router.replace('/(auth)/login')}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: colors.accent, marginTop: 12 },
                pressed && { opacity: 0.8 },
              ]}>
              <Text style={styles.primaryBtnText}>Return to Home / Sign In</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        {/* Top Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <View style={styles.headerTitleRow}>
            <Pressable
              onPress={handleBack}
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.backButton}>
              <Ionicons name="arrow-back" size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
              Delete Account
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          
          {/* Main Card */}
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            
            {/* Warning Badge Header */}
            <View style={styles.badgeRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="trash-outline" size={24} color="#EF4444" />
              </View>
              <View style={styles.badgeTextCol}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  Permanent Account Deletion
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Delete your Musafir AI account and all associated data immediately.
                </Text>
              </View>
            </View>

            {/* Error Message */}
            {errorMessage ? (
              <View style={[styles.errorBox, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
                <Ionicons name="alert-circle" size={18} color="#EF4444" style={{ marginTop: 1 }} />
                <Text style={styles.errorText}>{errorMessage}</Text>
              </View>
            ) : null}

            {/* What will be deleted section */}
            <View style={[styles.infoBox, { backgroundColor: isDark ? '#141416' : '#F9FAFB', borderColor: colors.border }]}>
              <Text style={[styles.infoBoxTitle, { color: colors.textPrimary }]}>
                What happens when you delete your account:
              </Text>
              <View style={styles.infoList}>
                <View style={styles.infoItem}>
                  <Ionicons name="close-circle" size={15} color="#EF4444" style={styles.infoIcon} />
                  <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                    All your saved trips and travel history will be permanently erased.
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Ionicons name="close-circle" size={15} color="#EF4444" style={styles.infoIcon} />
                  <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                    Your custom AI cloned voices and audio history will be wiped.
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Ionicons name="close-circle" size={15} color="#EF4444" style={styles.infoIcon} />
                  <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                    Connected Google/Apple authorizations and login credentials will be revoked.
                  </Text>
                </View>
                <View style={styles.infoItem}>
                  <Ionicons name="close-circle" size={15} color="#EF4444" style={styles.infoIcon} />
                  <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                    This action is immediate and cannot be undone.
                  </Text>
                </View>
              </View>
            </View>

            {/* Confirmation Checkbox */}
            <Pressable
              onPress={() => setConfirmedWarning(!confirmedWarning)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: confirmedWarning }}
              style={styles.checkboxRow}>
              <View
                style={[
                  styles.checkbox,
                  {
                    borderColor: confirmedWarning ? '#EF4444' : colors.inputBorder,
                    backgroundColor: confirmedWarning ? '#EF4444' : 'transparent',
                  },
                ]}>
                {confirmedWarning ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
              </View>
              <Text style={[styles.checkboxLabel, { color: colors.textPrimary }]}>
                I understand that account deletion is immediate and all my data will be permanently removed.
              </Text>
            </Pressable>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* SCENARIO 1: USER IS ALREADY SIGNED IN */}
            {user ? (
              <View style={styles.actionSection}>
                <View style={[styles.userBadge, { backgroundColor: isDark ? '#141416' : '#F3F4F6', borderColor: colors.border }]}>
                  <Ionicons name="person-circle-outline" size={20} color={colors.textSecondary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.userBadgeText, { color: colors.textPrimary }]}>
                      Signed in as: <Text style={{ fontWeight: '700' }}>{user.email || user.displayName || 'Musafir User'}</Text>
                    </Text>
                    <Text style={[styles.userProviderText, { color: colors.textSecondary }]}>
                      Provider: {provider === 'google' ? 'Google' : provider === 'apple' ? 'Apple' : 'Email & Password'}
                    </Text>
                  </View>
                  <Pressable
                    onPress={async () => {
                      await logOut();
                    }}
                    style={({ pressed }) => pressed && { opacity: 0.6 }}>
                    <Text style={[styles.switchAccountText, { color: colors.accent }]}>Switch</Text>
                  </Pressable>
                </View>

                {provider === 'password' ? (
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>
                      Confirm your password to verify ownership
                    </Text>
                    <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                      <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                      <TextInput
                        value={password}
                        onChangeText={setPassword}
                        placeholder="Current password"
                        placeholderTextColor={colors.textSecondary}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        style={[styles.textInput, { color: colors.textPrimary }]}
                      />
                      <Pressable
                        onPress={() => setShowPassword(!showPassword)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color={colors.textSecondary}
                        />
                      </Pressable>
                    </View>
                  </View>
                ) : provider === 'apple' && Platform.OS === 'web' ? (
                  <View style={[styles.appleWebNotice, { backgroundColor: isDark ? '#18181B' : '#F9FAFB', borderColor: colors.border }]}>
                    <Ionicons name="logo-apple" size={26} color={colors.textPrimary} style={{ marginBottom: 4 }} />
                    <Text style={[styles.appleWebTitle, { color: colors.textPrimary }]}>
                      Please Complete on Your iPhone
                    </Text>
                    <Text style={[styles.appleWebDesc, { color: colors.textSecondary }]}>
                      Because Apple Sign-In uses your device's biometric security (Face ID / Touch ID), please open the Musafir AI app on your iPhone to delete your account:
                    </Text>
                    <View style={styles.appleStepMiniList}>
                      <Text style={[styles.appleStepMiniText, { color: colors.textPrimary }]}>
                        1. Open <Text style={{ fontWeight: '700' }}>Musafir AI</Text> on your iPhone
                      </Text>
                      <Text style={[styles.appleStepMiniText, { color: colors.textPrimary }]}>
                        2. Go to <Text style={{ fontWeight: '700' }}>Profile</Text> → Tap <Text style={{ fontWeight: '700', color: '#EF4444' }}>Delete Account</Text>
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        Linking.openURL('musafir://profile/delete-account').catch(() => {
                          Linking.openURL('musafir://profile').catch(() => {});
                        });
                      }}
                      style={({ pressed }) => [
                        styles.openAppBtn,
                        pressed && { opacity: 0.8 },
                      ]}>
                      <Ionicons name="phone-portrait-outline" size={17} color="#FFFFFF" />
                      <Text style={styles.openAppBtnText}>Open in Musafir AI App</Text>
                    </Pressable>
                  </View>
                ) : (
                  <View style={[styles.socialNotice, { backgroundColor: isDark ? '#141416' : '#F3F4F6', borderColor: colors.border }]}>
                    <Ionicons
                      name={provider === 'google' ? 'logo-google' : 'logo-apple'}
                      size={20}
                      color={colors.textPrimary}
                    />
                    <Text style={[styles.socialNoticeText, { color: colors.textSecondary }]}>
                      Click below to re-authenticate with {provider === 'google' ? 'Google' : 'Apple'} and immediately delete your account.
                    </Text>
                  </View>
                )}

                {!(provider === 'apple' && Platform.OS === 'web') ? (
                  <Pressable
                    onPress={handleDeleteForSignedInUser}
                    disabled={isDeleting}
                    style={({ pressed }) => [
                      styles.dangerBtn,
                      pressed && { opacity: 0.8 },
                      isDeleting && { opacity: 0.6 },
                    ]}>
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <View style={styles.btnContent}>
                        <Ionicons name="trash" size={17} color="#FFFFFF" />
                        <Text style={styles.dangerBtnText}>
                          {provider === 'password'
                            ? 'Permanently Delete My Account'
                            : `Verify with ${provider === 'google' ? 'Google' : 'Apple'} & Delete`}
                        </Text>
                      </View>
                    )}
                  </Pressable>
                ) : null}
              </View>
            ) : (
              /* SCENARIO 2: USER IS NOT SIGNED IN (WEB VISITOR) */
              <View style={styles.actionSection}>
                <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
                  Verify your account credentials:
                </Text>

                {/* Auth Method Selector Tabs */}
                <View style={[styles.tabRow, { backgroundColor: isDark ? '#141416' : '#E5E7EB' }]}>
                  <Pressable
                    onPress={() => {
                      setAuthMethod('password');
                      setErrorMessage(null);
                    }}
                    style={[
                      styles.tabBtn,
                      authMethod === 'password' && {
                        backgroundColor: colors.cardBg,
                        shadowColor: '#000',
                        shadowOpacity: 0.1,
                        shadowRadius: 2,
                        elevation: 2,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.tabBtnText,
                        { color: authMethod === 'password' ? colors.textPrimary : colors.textSecondary },
                      ]}>
                      Email & Password
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setAuthMethod('google');
                      setErrorMessage(null);
                    }}
                    style={[
                      styles.tabBtn,
                      authMethod === 'google' && {
                        backgroundColor: colors.cardBg,
                        shadowColor: '#000',
                        shadowOpacity: 0.1,
                        shadowRadius: 2,
                        elevation: 2,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.tabBtnText,
                        { color: authMethod === 'google' ? colors.textPrimary : colors.textSecondary },
                      ]}>
                      Google
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setAuthMethod('apple');
                      setErrorMessage(null);
                    }}
                    style={[
                      styles.tabBtn,
                      authMethod === 'apple' && {
                        backgroundColor: colors.cardBg,
                        shadowColor: '#000',
                        shadowOpacity: 0.1,
                        shadowRadius: 2,
                        elevation: 2,
                      },
                    ]}>
                    <Text
                      style={[
                        styles.tabBtnText,
                        { color: authMethod === 'apple' ? colors.textPrimary : colors.textSecondary },
                      ]}>
                      Apple
                    </Text>
                  </Pressable>
                </View>

                {/* Email + Password Form */}
                {authMethod === 'password' ? (
                  <View style={styles.formFields}>
                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Account Email</Text>
                      <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                        <Ionicons name="mail-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                        <TextInput
                          value={email}
                          onChangeText={setEmail}
                          placeholder="your-email@example.com"
                          placeholderTextColor={colors.textSecondary}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={[styles.textInput, { color: colors.textPrimary }]}
                        />
                      </View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>Account Password</Text>
                      <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                        <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                        <TextInput
                          value={password}
                          onChangeText={setPassword}
                          placeholder="Your account password"
                          placeholderTextColor={colors.textSecondary}
                          secureTextEntry={!showPassword}
                          autoCapitalize="none"
                          style={[styles.textInput, { color: colors.textPrimary }]}
                        />
                        <Pressable
                          onPress={() => setShowPassword(!showPassword)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons
                            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                            size={18}
                            color={colors.textSecondary}
                          />
                        </Pressable>
                      </View>
                    </View>

                    <Pressable
                      onPress={() => handleDeleteForUnauthenticatedUser('password')}
                      disabled={isDeleting}
                      style={({ pressed }) => [
                        styles.dangerBtn,
                        pressed && { opacity: 0.8 },
                        isDeleting && { opacity: 0.6 },
                      ]}>
                      {isDeleting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <View style={styles.btnContent}>
                          <Ionicons name="trash" size={17} color="#FFFFFF" />
                          <Text style={styles.dangerBtnText}>Sign In & Delete Account</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                ) : null}

                {/* Google Sign-In & Delete */}
                {authMethod === 'google' ? (
                  <View style={styles.oauthContainer}>
                    <Text style={[styles.oauthDesc, { color: colors.textSecondary }]}>
                      Sign in with the Google account associated with your Musafir AI profile to immediately delete your account.
                    </Text>
                    <Pressable
                      onPress={() => handleDeleteForUnauthenticatedUser('google')}
                      disabled={isDeleting}
                      style={({ pressed }) => [
                        styles.dangerBtn,
                        pressed && { opacity: 0.8 },
                        isDeleting && { opacity: 0.6 },
                      ]}>
                      {isDeleting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <View style={styles.btnContent}>
                          <Ionicons name="logo-google" size={18} color="#FFFFFF" />
                          <Text style={styles.dangerBtnText}>Continue with Google & Delete</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                ) : null}

                {/* Apple ID Instructions */}
                {authMethod === 'apple' ? (
                  <View style={styles.appleInfoContainer}>
                    <View style={[styles.appleIconHeader, { backgroundColor: isDark ? '#27272A' : '#F3F4F6' }]}>
                      <Ionicons name="logo-apple" size={28} color={colors.textPrimary} />
                    </View>
                    <Text style={[styles.appleHeading, { color: colors.textPrimary }]}>
                      Delete Account on Your iPhone
                    </Text>
                    <Text style={[styles.appleSubheading, { color: colors.textSecondary }]}>
                      Because Apple Sign-In uses your device's biometric security (Face ID / Touch ID), please complete account deletion directly in the Musafir AI app on your phone:
                    </Text>

                    <View style={[styles.appleStepsCard, { backgroundColor: isDark ? '#141416' : '#F9FAFB', borderColor: colors.border }]}>
                      <View style={styles.appleStep}>
                        <View style={[styles.stepNumberBadge, { backgroundColor: colors.accent }]}>
                          <Text style={styles.stepNumberText}>1</Text>
                        </View>
                        <Text style={[styles.stepText, { color: colors.textPrimary }]}>
                          Open the <Text style={{ fontWeight: '700' }}>Musafir AI</Text> app on your iPhone.
                        </Text>
                      </View>

                      <View style={styles.appleStep}>
                        <View style={[styles.stepNumberBadge, { backgroundColor: colors.accent }]}>
                          <Text style={styles.stepNumberText}>2</Text>
                        </View>
                        <Text style={[styles.stepText, { color: colors.textPrimary }]}>
                          Go to the <Text style={{ fontWeight: '700' }}>Profile</Text> tab and scroll to the bottom.
                        </Text>
                      </View>

                      <View style={styles.appleStep}>
                        <View style={[styles.stepNumberBadge, { backgroundColor: colors.accent }]}>
                          <Text style={styles.stepNumberText}>3</Text>
                        </View>
                        <Text style={[styles.stepText, { color: colors.textPrimary }]}>
                          Tap <Text style={{ fontWeight: '700', color: '#EF4444' }}>Delete Account</Text> and confirm with Face ID / Touch ID.
                        </Text>
                      </View>
                    </View>

                    <Pressable
                      onPress={() => {
                        Linking.openURL('musafir://profile/delete-account').catch(() => {
                          Linking.openURL('musafir://profile').catch(() => {});
                        });
                      }}
                      style={({ pressed }) => [
                        styles.openAppBtn,
                        pressed && { opacity: 0.8 },
                      ]}>
                      <Ionicons name="phone-portrait-outline" size={17} color="#FFFFFF" />
                      <Text style={styles.openAppBtnText}>Open in Musafir AI App</Text>
                    </Pressable>

                    <Text style={[styles.appleSettingsTip, { color: colors.textSecondary }]}>
                      Tip: You can also manage or revoke Musafir AI access anytime from your iPhone Settings → [Your Name] → Sign-In & Security → Sign in with Apple.
                    </Text>
                  </View>
                ) : null}
              </View>
            )}

          </View>

          {/* Footer & Legal */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              For privacy inquiries, contact support at support@musafir-ai.com
            </Text>
            <LegalLinks variant="compact" />
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  scrollContent: {
    padding: 16,
    gap: 20,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  centerContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 18,
    width: '100%',
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeTextCol: {
    flex: 1,
    gap: 3,
  },
  title: {
    fontSize: 19,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  bodyText: {
    fontSize: 14,
    lineHeight: 20,
  },
  successIconCircle: {
    alignSelf: 'center',
    marginBottom: 4,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#EF4444',
    lineHeight: 18,
    fontWeight: '500',
  },
  infoBox: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    gap: 10,
  },
  infoBoxTitle: {
    fontSize: 13.5,
    fontWeight: '700',
  },
  infoList: {
    gap: 8,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  infoIcon: {
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 2,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '500',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  actionSection: {
    gap: 16,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  userBadgeText: {
    fontSize: 13,
  },
  userProviderText: {
    fontSize: 12,
    marginTop: 1,
  },
  switchAccountText: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  socialNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  socialNoticeText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 17,
  },
  tabRow: {
    flexDirection: 'row',
    borderRadius: 8,
    padding: 3,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBtnText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  formFields: {
    gap: 14,
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 46,
  },
  inputIcon: {
    marginRight: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 14,
    height: '100%',
  },
  oauthContainer: {
    gap: 14,
    paddingVertical: 6,
  },
  oauthDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  dangerBtn: {
    backgroundColor: '#DC2626',
    height: 46,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  dangerBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  primaryBtn: {
    height: 46,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  appleWebNotice: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  appleWebTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  appleWebDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  appleStepMiniList: {
    gap: 6,
    marginVertical: 4,
  },
  appleStepMiniText: {
    fontSize: 13,
  },
  openAppBtn: {
    backgroundColor: '#007AFF',
    height: 42,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 6,
    width: '100%',
  },
  openAppBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
  appleInfoContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  appleIconHeader: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleHeading: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  appleSubheading: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  appleStepsCard: {
    width: '100%',
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    marginVertical: 4,
  },
  appleStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  stepNumberBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  stepText: {
    flex: 1,
    fontSize: 13,
  },
  appleSettingsTip: {
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 6,
  },
  footer: {
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
  },
  footerText: {
    fontSize: 12,
    textAlign: 'center',
  },
});
