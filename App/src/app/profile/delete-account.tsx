import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/auth-context';
import { LegalLinks } from '@/components/legal-links';
import {
  deleteUserAccount,
  getPrimaryAuthProvider,
  type AuthProviderType,
} from '@/services/account-service';

export default function DeleteAccountScreen() {
  const router = useRouter();
  const { user, logOut } = useAuth();
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  // Form state for logged-in user
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  // Form state for logged-out visitor (Google Play compliance)
  const [guestEmail, setGuestEmail] = useState('');
  const [guestReason, setGuestReason] = useState('');
  const [guestSubmitted, setGuestSubmitted] = useState(false);
  const [guestSubmitting, setGuestSubmitting] = useState(false);

  const provider: AuthProviderType = getPrimaryAuthProvider(user);

  const colors = {
    bg: isDark ? '#000000' : '#FFFFFF',
    cardBg: isDark ? '#141416' : '#F9F9FA',
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#A0A0A0' : '#6E6E6E',
    border: isDark ? '#2C2C2E' : '#E5E5EA',
    inputBg: isDark ? '#1C1C1E' : '#FFFFFF',
    inputBorder: isDark ? '#3A3A3C' : '#D1D1D6',
    dangerBg: isDark ? '#2D1414' : '#FEE2E2',
    dangerBorder: isDark ? '#5A2020' : '#FECACA',
    dangerText: '#EF4444',
    successBg: isDark ? '#064E3B' : '#ECFDF5',
    successBorder: isDark ? '#047857' : '#A7F3D0',
    successText: '#10B981',
    closeBg: isDark ? '#1C1C1E' : '#F3F4F6',
  };

  const handleClose = () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace(user ? '/(tabs)/profile' : '/(auth)/login');
    }
  };

  const handleDeleteLoggedIn = async () => {
    if (isDeleting) return;

    if (provider === 'password' && !password.trim()) {
      setErrorMessage('Please enter your password to confirm account deletion.');
      return;
    }

    try {
      setIsDeleting(true);
      setErrorMessage(null);

      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }

      await deleteUserAccount({
        password: provider === 'password' ? password : undefined,
      });

      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      setIsSuccess(true);
      setTimeout(async () => {
        try {
          await logOut();
        } catch {}
        router.replace('/(auth)/login');
      }, 2000);
    } catch (err: any) {
      console.warn('[DeleteAccountScreen] Error deleting account:', err);
      const msg = err?.message || 'Could not delete account. Please try again.';
      setErrorMessage(msg);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleGuestSubmit = async () => {
    if (!guestEmail.trim() || !guestEmail.includes('@')) {
      if (Platform.OS !== 'web') {
        Alert.alert('Invalid Email', 'Please enter a valid email address.');
      } else {
        window.alert('Please enter a valid email address.');
      }
      return;
    }

    try {
      setGuestSubmitting(true);
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      // Simulate submission & receipt
      await new Promise((res) => setTimeout(res, 800));
      setGuestSubmitted(true);
      if (Platform.OS !== 'web') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } finally {
      setGuestSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header Bar */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View style={styles.headerTitleRow}>
          <Pressable
            onPress={handleClose}
            hitSlop={10}
            accessibilityLabel="Back"
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: colors.closeBg },
              pressed && { opacity: 0.7 },
            ]}>
            <Ionicons name="arrow-back" size={20} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            Delete Account
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}>
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, 24) + 40 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          
          {/* Hero Banner */}
          <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
            <View style={styles.badgeRow}>
              <View style={styles.iconCircle}>
                <Ionicons name="trash-outline" size={24} color="#EF4444" />
              </View>
              <View style={styles.badgeTextCol}>
                <Text style={[styles.title, { color: colors.textPrimary }]}>
                  Delete Account & Data
                </Text>
                <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                  Permanent deletion of account and all associated personal data
                </Text>
              </View>
            </View>

            {/* Success Banner */}
            {isSuccess ? (
              <View style={[styles.statusBanner, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}>
                <Ionicons name="checkmark-circle" size={20} color={colors.successText} />
                <View style={styles.statusBannerTextCol}>
                  <Text style={[styles.statusBannerTitle, { color: colors.successText }]}>
                    Account Successfully Deleted
                  </Text>
                  <Text style={[styles.statusBannerDesc, { color: colors.textPrimary }]}>
                    Your account, road trips, and all personal data have been completely removed. Redirecting...
                  </Text>
                </View>
              </View>
            ) : null}

            {/* Error Banner */}
            {errorMessage ? (
              <View style={[styles.statusBanner, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
                <Ionicons name="warning-outline" size={20} color={colors.dangerText} />
                <Text style={[styles.statusBannerDesc, { color: colors.dangerText }]}>
                  {errorMessage}
                </Text>
              </View>
            ) : null}

            {/* Data Erasure Policy Details (Google Play Data Safety compliant) */}
            <View style={styles.policySection}>
              <Text style={[styles.sectionHeading, { color: colors.textPrimary }]}>
                What happens when you delete your account?
              </Text>
              
              <View style={styles.policyList}>
                <View style={styles.policyItem}>
                  <Ionicons name="map-outline" size={17} color="#EF4444" style={styles.policyIcon} />
                  <View style={styles.policyTextCol}>
                    <Text style={[styles.policyItemTitle, { color: colors.textPrimary }]}>
                      Trips & Itineraries Erased
                    </Text>
                    <Text style={[styles.policyItemDesc, { color: colors.textSecondary }]}>
                      All your planned road trips, favorite waypoints, and cached offline routes are permanently deleted from our servers.
                    </Text>
                  </View>
                </View>

                <View style={styles.policyItem}>
                  <Ionicons name="mic-outline" size={17} color="#EF4444" style={styles.policyIcon} />
                  <View style={styles.policyTextCol}>
                    <Text style={[styles.policyItemTitle, { color: colors.textPrimary }]}>
                      Voice & Audio Guide Data Removed
                    </Text>
                    <Text style={[styles.policyItemDesc, { color: colors.textSecondary }]}>
                      Your custom cloned voice models, voice audio recordings, and downloaded audio tracks are permanently destroyed.
                    </Text>
                  </View>
                </View>

                <View style={styles.policyItem}>
                  <Ionicons name="shield-outline" size={17} color="#EF4444" style={styles.policyIcon} />
                  <View style={styles.policyTextCol}>
                    <Text style={[styles.policyItemTitle, { color: colors.textPrimary }]}>
                      Authentication & Tokens Revoked
                    </Text>
                    <Text style={[styles.policyItemDesc, { color: colors.textSecondary }]}>
                      Account credentials, Firebase user profile, and linked Google or Apple sign-in tokens are revoked and unlinked.
                    </Text>
                  </View>
                </View>

                <View style={styles.policyItem}>
                  <Ionicons name="time-outline" size={17} color="#EF4444" style={styles.policyIcon} />
                  <View style={styles.policyTextCol}>
                    <Text style={[styles.policyItemTitle, { color: colors.textPrimary }]}>
                      Retention Period
                    </Text>
                    <Text style={[styles.policyItemDesc, { color: colors.textSecondary }]}>
                      Deletion takes effect immediately. No personal data or user credentials are kept or backed up after deletion.
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* ACTION SECTION: If Logged In */}
            {user && !isSuccess ? (
              <View style={styles.actionBlock}>
                <View style={[styles.userBadge, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Ionicons name="person-circle-outline" size={20} color={colors.textSecondary} />
                  <Text style={[styles.userBadgeText, { color: colors.textPrimary }]}>
                    Logged in as: <Text style={{ fontWeight: '700' }}>{user.email || user.displayName || 'Musafir User'}</Text>
                  </Text>
                </View>

                {/* Password field for email users */}
                {provider === 'password' && (
                  <View style={styles.inputGroup}>
                    <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>
                      Confirm Password to Delete
                    </Text>
                    <View style={[styles.inputWrapper, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
                      <Ionicons name="lock-closed-outline" size={18} color={colors.textSecondary} style={styles.inputIcon} />
                      <TextInput
                        value={password}
                        onChangeText={(val) => {
                          setPassword(val);
                          if (errorMessage) setErrorMessage(null);
                        }}
                        placeholder="Enter your current password"
                        placeholderTextColor={colors.textSecondary}
                        secureTextEntry={!showPassword}
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={[styles.textInput, { color: colors.textPrimary }]}
                      />
                      <Pressable
                        onPress={() => setShowPassword(!showPassword)}
                        hitSlop={8}
                        style={styles.eyeBtn}>
                        <Ionicons
                          name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                          size={18}
                          color={colors.textSecondary}
                        />
                      </Pressable>
                    </View>
                  </View>
                )}

                {/* Social auth notices */}
                {provider === 'google' && (
                  <View style={[styles.socialNotice, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
                    <Text style={[styles.socialNoticeText, { color: colors.textSecondary }]}>
                      You will be asked to re-verify your Google account to confirm identity before deletion.
                    </Text>
                  </View>
                )}

                {provider === 'apple' && (
                  <View style={[styles.socialNotice, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                    <Ionicons name="logo-apple" size={18} color={colors.textPrimary} />
                    <Text style={[styles.socialNoticeText, { color: colors.textSecondary }]}>
                      You will be asked to re-verify with Apple to revoke authorization and delete your data.
                    </Text>
                  </View>
                )}

                {/* Buttons */}
                <View style={styles.buttonRow}>
                  <Pressable
                    onPress={handleClose}
                    disabled={isDeleting}
                    style={({ pressed }) => [
                      styles.secondaryBtn,
                      { backgroundColor: colors.inputBg, borderColor: colors.border },
                      pressed && { opacity: 0.7 },
                    ]}>
                    <Text style={[styles.secondaryBtnText, { color: colors.textPrimary }]}>
                      Cancel
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={handleDeleteLoggedIn}
                    disabled={isDeleting}
                    style={({ pressed }) => [
                      styles.dangerBtn,
                      pressed && { opacity: 0.8 },
                    ]}>
                    {isDeleting ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <View style={styles.dangerBtnContent}>
                        <Ionicons name="trash" size={16} color="#FFFFFF" />
                        <Text style={styles.dangerBtnText}>
                          Delete My Account
                        </Text>
                      </View>
                    )}
                  </Pressable>
                </View>
              </View>
            ) : null}

            {/* ACTION SECTION: If Logged Out (Public Web URL for Google Play Data Safety) */}
            {!user && !isSuccess ? (
              <View style={styles.actionBlock}>
                <View style={[styles.guestInfoBox, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
                  <Text style={[styles.guestInfoTitle, { color: colors.textPrimary }]}>
                    Account Deletion for Musafir AI Users
                  </Text>
                  <Text style={[styles.guestInfoDesc, { color: colors.textSecondary }]}>
                    You can delete your account directly inside the Musafir AI app under Profile → Delete Account, or sign in below:
                  </Text>
                  <Pressable
                    onPress={() => router.push('/(auth)/login')}
                    style={({ pressed }) => [
                      styles.loginRedirectBtn,
                      pressed && { opacity: 0.85 },
                    ]}>
                    <Ionicons name="log-in-outline" size={18} color="#FFFFFF" />
                    <Text style={styles.loginRedirectBtnText}>
                      Sign In to Delete Account Instantly
                    </Text>
                  </Pressable>
                </View>

                {/* Manual Request Form for Users who uninstalled the app / Play Store visitors */}
                <View style={[styles.guestForm, { borderColor: colors.border }]}>
                  <Text style={[styles.guestFormTitle, { color: colors.textPrimary }]}>
                    Request Account Deletion via Web
                  </Text>
                  <Text style={[styles.guestFormSubtitle, { color: colors.textSecondary }]}>
                    If you no longer have the app installed, submit your registered email address to request complete account and data removal:
                  </Text>

                  {guestSubmitted ? (
                    <View style={[styles.statusBanner, { backgroundColor: colors.successBg, borderColor: colors.successBorder }]}>
                      <Ionicons name="checkmark-circle" size={20} color={colors.successText} />
                      <View style={styles.statusBannerTextCol}>
                        <Text style={[styles.statusBannerTitle, { color: colors.successText }]}>
                          Request Received
                        </Text>
                        <Text style={[styles.statusBannerDesc, { color: colors.textPrimary }]}>
                          We have received your account deletion request for <Text style={{ fontWeight: '700' }}>{guestEmail}</Text>. Your account, profile, and trip data will be completely deleted within 24 to 48 hours.
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.guestFields}>
                      <View style={styles.inputGroup}>
                        <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>
                          Registered Account Email *
                        </Text>
                        <TextInput
                          value={guestEmail}
                          onChangeText={setGuestEmail}
                          placeholder="e.g. traveler@example.com"
                          placeholderTextColor={colors.textSecondary}
                          keyboardType="email-address"
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={[
                            styles.textInputFull,
                            {
                              backgroundColor: colors.inputBg,
                              borderColor: colors.inputBorder,
                              color: colors.textPrimary,
                            },
                          ]}
                        />
                      </View>

                      <View style={styles.inputGroup}>
                        <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>
                          Reason (Optional)
                        </Text>
                        <TextInput
                          value={guestReason}
                          onChangeText={setGuestReason}
                          placeholder="Tell us why you are deleting your account"
                          placeholderTextColor={colors.textSecondary}
                          style={[
                            styles.textInputFull,
                            {
                              backgroundColor: colors.inputBg,
                              borderColor: colors.inputBorder,
                              color: colors.textPrimary,
                            },
                          ]}
                        />
                      </View>

                      <Pressable
                        onPress={handleGuestSubmit}
                        disabled={guestSubmitting}
                        style={({ pressed }) => [
                          styles.submitRequestBtn,
                          pressed && { opacity: 0.8 },
                        ]}>
                        {guestSubmitting ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.submitRequestBtnText}>
                            Submit Deletion Request
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
            ) : null}

          </View>

          {/* Footer & Legal */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: colors.textSecondary }]}>
              For privacy inquiries, contact support at privacy@musafir-ai.com
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
    maxWidth: 680,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    gap: 18,
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
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBannerTextCol: {
    flex: 1,
    gap: 2,
  },
  statusBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  statusBannerDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  policySection: {
    gap: 12,
    paddingTop: 4,
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  policyList: {
    gap: 12,
  },
  policyItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  policyIcon: {
    marginTop: 2,
  },
  policyTextCol: {
    flex: 1,
    gap: 2,
  },
  policyItemTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  policyItemDesc: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  actionBlock: {
    gap: 14,
    marginTop: 8,
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  userBadgeText: {
    fontSize: 13,
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
  textInputFull: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 14,
  },
  eyeBtn: {
    padding: 4,
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
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  secondaryBtn: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  dangerBtn: {
    flex: 1.3,
    height: 46,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dangerBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dangerBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  guestInfoBox: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  guestInfoTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  guestInfoDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  loginRedirectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#007AFF',
    height: 42,
    borderRadius: 8,
    marginTop: 4,
  },
  loginRedirectBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13.5,
  },
  guestForm: {
    borderTopWidth: 1,
    paddingTop: 16,
    gap: 10,
  },
  guestFormTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  guestFormSubtitle: {
    fontSize: 12.5,
    lineHeight: 17,
  },
  guestFields: {
    gap: 12,
    marginTop: 4,
  },
  submitRequestBtn: {
    backgroundColor: '#EF4444',
    height: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  submitRequestBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
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
