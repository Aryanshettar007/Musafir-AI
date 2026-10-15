import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  auth,
  EmailAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  deleteUser,
  getFirebaseErrorMessage,
  User,
} from '@/config/firebase';
import { api } from '@/services/api';
import { clearAllOfflineTripData } from '@/services/trip-service';

export type AuthProviderType = 'apple' | 'google' | 'password' | 'unknown';

/**
 * Detects the primary auth provider associated with the current Firebase user.
 */
export function getPrimaryAuthProvider(user: User | null): AuthProviderType {
  if (!user || !user.providerData || user.providerData.length === 0) {
    return 'unknown';
  }

  const providerIds = user.providerData.map((p) => p.providerId);
  if (providerIds.includes('apple.com')) return 'apple';
  if (providerIds.includes('google.com')) return 'google';
  if (providerIds.includes('password')) return 'password';
  return 'unknown';
}

/**
 * Re-authenticates an email + password user with their current password.
 */
export async function reauthenticatePassword(password: string): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.email) {
    throw new Error('No authenticated email user found.');
  }

  try {
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);
  } catch (err) {
    const friendly = getFirebaseErrorMessage(err);
    throw new Error(friendly);
  }
}

/**
 * Re-authenticates an Apple Sign-In user on iOS and captures a fresh authorization code.
 * The authorization code is required by Apple REST API to revoke the user token.
 */
export async function reauthenticateApple(): Promise<{ authorizationCode?: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('No authenticated user found.');

  if (Platform.OS !== 'ios') {
    return {};
  }

  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Apple Sign-In is not available on this device.');
    }

    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce
    );

    const appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });

    if (!appleCredential.identityToken) {
      throw new Error('No identity token received from Apple.');
    }

    const provider = new OAuthProvider('apple.com');
    const credential = provider.credential({
      idToken: appleCredential.identityToken,
      rawNonce,
    });

    await reauthenticateWithCredential(currentUser, credential);

    return {
      authorizationCode: appleCredential.authorizationCode || undefined,
    };
  } catch (err: any) {
    if (
      err?.code === 'ERR_REQUEST_CANCELED' ||
      err?.code === '1001' ||
      err?.message?.includes('canceled')
    ) {
      throw new Error('Verification cancelled.');
    }
    const friendly = getFirebaseErrorMessage(err);
    throw new Error(friendly);
  }
}

/**
 * Re-authenticates a Google Sign-In user across Web, iOS, and Android.
 */
export async function reauthenticateGoogle(): Promise<{ idToken?: string }> {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error('No authenticated user found.');

  // Web flow
  if (Platform.OS === 'web') {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await reauthenticateWithPopup(currentUser, provider);
      return {};
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user') {
        throw new Error('Verification cancelled.');
      }
      const friendly = getFirebaseErrorMessage(err);
      throw new Error(friendly);
    }
  }

  // Native flow (iOS / Android)
  const webClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

  if (!webClientId) {
    throw new Error('Google configuration missing. Please verify EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.');
  }

  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');

    GoogleSignin.configure({
      webClientId,
      iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
      offlineAccess: false,
    });

    if (Platform.OS === 'android') {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    }

    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') {
      throw new Error('Verification cancelled.');
    }

    const idToken =
      response.type === 'success'
        ? response.data.idToken
        : (response as any)?.data?.idToken || (response as any)?.idToken;

    if (!idToken) {
      throw new Error('No ID token received from Google.');
    }

    const credential = GoogleAuthProvider.credential(idToken);
    await reauthenticateWithCredential(currentUser, credential);

    return { idToken };
  } catch (err: any) {
    if (err?.message === 'Verification cancelled.') throw err;
    const code = err?.code;
    if (code === 'SIGN_IN_CANCELLED' || code === '12501') {
      throw new Error('Verification cancelled.');
    }
    const friendly = getFirebaseErrorMessage(err);
    throw new Error(friendly);
  }
}

export interface DeleteAccountOptions {
  password?: string;
}

/**
 * Executes full account deletion:
 * 1. Pre-emptively reauthenticates user with their provider (Email/Password, Apple, Google)
 * 2. Deletes user records from the backend (MongoDB User, Trips, Listens, Reports)
 * 3. Revokes Apple/Google authorization tokens (removing app from user's account dashboard)
 * 4. Deletes user account from Firebase Auth
 * 5. Purges local cached trips, downloads, and storage
 */
export async function deleteUserAccount(options?: DeleteAccountOptions): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('You must be signed in to delete your account.');
  }

  const provider = getPrimaryAuthProvider(currentUser);
  let appleAuthorizationCode: string | undefined;
  let googleToken: string | undefined;

  // Step 1: Re-authenticate to ensure recent login and acquire revocation tokens
  if (provider === 'password') {
    if (!options?.password) {
      throw new Error('Please enter your password to confirm account deletion.');
    }
    await reauthenticatePassword(options.password);
  } else if (provider === 'apple') {
    const appleRes = await reauthenticateApple();
    appleAuthorizationCode = appleRes.authorizationCode;
  } else if (provider === 'google') {
    const googleRes = await reauthenticateGoogle();
    googleToken = googleRes.idToken;
  }

  // Step 2: Delete backend data (User, Trips, Listens, Reports) and revoke server-side
  try {
    await api.delete('/me', {
      data: {
        appleAuthorizationCode,
        googleToken,
      },
    });
  } catch (backendErr) {
    console.warn('[deleteUserAccount] Backend deletion warning:', backendErr);
    // Continue with client-side deletion even if backend is temporarily offline
  }

  // Step 3: Revoke Google permissions locally on native device
  if (provider === 'google' && Platform.OS !== 'web') {
    try {
      const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
      await GoogleSignin.revokeAccess();
    } catch (revokeErr) {
      console.warn('[deleteUserAccount] Google client revokeAccess error:', revokeErr);
    }
  }

  // Step 4: Delete user from Firebase Auth
  try {
    await deleteUser(currentUser);
  } catch (fbErr: any) {
    if (fbErr?.code === 'auth/requires-recent-login') {
      throw new Error('Please sign in again before deleting your account.');
    }
    // If backend Admin SDK already deleted the user, user-not-found is expected and harmless
    if (fbErr?.code !== 'auth/user-not-found') {
      const friendly = getFirebaseErrorMessage(fbErr);
      throw new Error(friendly);
    }
  }

  // Step 5: Clean up all offline data, audio downloads, and profile storage
  try {
    await clearAllOfflineTripData();
    await AsyncStorage.multiRemove([
      '@musafir_user_profile',
      '@musafir_social_name',
      '@musafir_apple_name',
      '@musafir_google_name',
    ]);
  } catch (storageErr) {
    console.warn('[deleteUserAccount] Storage cleanup warning:', storageErr);
  }
}
