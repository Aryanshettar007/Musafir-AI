import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { useAuth } from '@/context/auth-context';
import {
  deleteUserAccount,
  getPrimaryAuthProvider,
  type AuthProviderType,
} from '@/services/account-service';

export interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteAccountModal({ visible, onClose, onSuccess }: DeleteAccountModalProps) {
  const { user } = useAuth();
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';

  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const provider: AuthProviderType = getPrimaryAuthProvider(user);

  const handleClose = () => {
    if (isDeleting) return;
    setPassword('');
    setErrorMessage(null);
    onClose();
  };

  const handleDelete = async () => {
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

      setPassword('');
      onSuccess();
    } catch (err: any) {
      console.warn('[DeleteAccountModal] Error deleting account:', err);
      const msg = err?.message || 'Could not delete account. Please try again.';
      setErrorMessage(msg);
      if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const colors = {
    overlay: isDark ? 'rgba(0, 0, 0, 0.75)' : 'rgba(0, 0, 0, 0.5)',
    cardBg: isDark ? '#1C1C1E' : '#FFFFFF',
    textPrimary: isDark ? '#FFFFFF' : '#000000',
    textSecondary: isDark ? '#A0A0A0' : '#6E6E6E',
    border: isDark ? '#2C2C2E' : '#E5E5EA',
    inputBg: isDark ? '#141416' : '#F7F7F8',
    inputBorder: isDark ? '#3A3A3C' : '#D1D1D6',
    dangerBg: isDark ? '#2D1414' : '#FEE2E2',
    dangerBorder: isDark ? '#5A2020' : '#FECACA',
    dangerText: '#EF4444',
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.overlay, { backgroundColor: colors.overlay }]}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.cardBg,
              borderColor: colors.border,
            },
          ]}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.iconCircle}>
              <Ionicons name="trash-outline" size={22} color="#EF4444" />
            </View>
            <View style={styles.headerTextContainer}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>
                Delete Account
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                This action is permanent and cannot be undone.
              </Text>
            </View>
            <Pressable
              onPress={handleClose}
              disabled={isDeleting}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.6 }]}>
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Description & Impact List */}
          <View style={styles.infoBox}>
            <View style={styles.infoItem}>
              <Ionicons name="alert-circle-outline" size={16} color="#EF4444" style={styles.infoIcon} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                All your road trips, downloaded audio, and saved favorites will be erased.
              </Text>
            </View>
            <View style={styles.infoItem}>
              <Ionicons name="shield-checkmark-outline" size={16} color={colors.textSecondary} style={styles.infoIcon} />
              <Text style={[styles.infoText, { color: colors.textSecondary }]}>
                {provider === 'apple'
                  ? 'Sign in with Apple tokens will be revoked from your Apple ID.'
                  : provider === 'google'
                  ? 'App access permissions will be revoked from your Google Account.'
                  : 'Your credentials and preferences will be permanently wiped.'}
              </Text>
            </View>
          </View>

          {/* Error Banner */}
          {errorMessage ? (
            <View style={[styles.errorBanner, { backgroundColor: colors.dangerBg, borderColor: colors.dangerBorder }]}>
              <Ionicons name="warning-outline" size={16} color="#EF4444" />
              <Text style={styles.errorBannerText}>{errorMessage}</Text>
            </View>
          ) : null}

          {/* Password Prompt for Email/Password Users */}
          {provider === 'password' && (
            <View style={styles.inputSection}>
              <Text style={[styles.inputLabel, { color: colors.textPrimary }]}>
                Confirm Password
              </Text>
              <View
                style={[
                  styles.inputWrapper,
                  {
                    backgroundColor: colors.inputBg,
                    borderColor: colors.inputBorder,
                  },
                ]}>
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
                  style={[styles.input, { color: colors.textPrimary }]}
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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

          {/* Provider Notice for Social Auth */}
          {provider === 'apple' && (
            <View style={[styles.socialNotice, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="logo-apple" size={18} color={colors.textPrimary} />
              <Text style={[styles.socialNoticeText, { color: colors.textSecondary }]}>
                You will be prompted to authenticate with Apple to confirm deletion.
              </Text>
            </View>
          )}

          {provider === 'google' && (
            <View style={[styles.socialNotice, { backgroundColor: colors.inputBg, borderColor: colors.border }]}>
              <Ionicons name="logo-google" size={18} color={colors.textPrimary} />
              <Text style={[styles.socialNoticeText, { color: colors.textSecondary }]}>
                You will be prompted to verify your Google Account to confirm deletion.
              </Text>
            </View>
          )}

          {/* Actions */}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={handleClose}
              disabled={isDeleting}
              style={({ pressed }) => [
                styles.cancelButton,
                {
                  backgroundColor: colors.inputBg,
                  borderColor: colors.border,
                },
                pressed && { opacity: 0.7 },
              ]}>
              <Text style={[styles.cancelButtonText, { color: colors.textPrimary }]}>
                Cancel
              </Text>
            </Pressable>

            <Pressable
              onPress={handleDelete}
              disabled={isDeleting}
              style={({ pressed }) => [
                styles.deleteButton,
                pressed && { opacity: 0.8 },
              ]}>
              {isDeleting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.deleteButtonText}>
                  Delete Account
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    padding: 22,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTextContainer: {
    flex: 1,
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  closeBtn: {
    padding: 4,
  },
  infoBox: {
    gap: 10,
    paddingVertical: 4,
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
    fontSize: 13,
    lineHeight: 18,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 12,
    color: '#EF4444',
    fontWeight: '500',
  },
  inputSection: {
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
  input: {
    flex: 1,
    fontSize: 14,
    height: '100%',
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
    fontSize: 12,
    lineHeight: 16,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 6,
  },
  cancelButton: {
    flex: 1,
    height: 46,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    flex: 1.2,
    height: 46,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
