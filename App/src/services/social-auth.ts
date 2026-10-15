import { Platform } from 'react-native';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  auth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithPopup,
  browserPopupRedirectResolver,
  updateProfile,
  User,
  getFirebaseErrorMessage,
} from '@/config/firebase';

/**
 * Checks whether Apple Sign-In is supported on the current device.
 * Only iOS 13+ devices support Apple Sign-In.
 */
export async function isAppleAuthAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

/**
 * Initiates Apple Sign-In on iOS and authenticates with Firebase Auth.
 */
export async function performAppleSignIn(): Promise<User> {
  if (Platform.OS !== 'ios') {
    throw new Error('Sign in with Apple is only supported on iOS devices.');
  }

  try {
    const AppleAuthentication = await import('expo-apple-authentication');
    const isAvailable = await AppleAuthentication.isAvailableAsync();
    if (!isAvailable) {
      throw new Error('Sign in with Apple is not available on this device.');
    }

    // Cryptographic nonce for replay protection
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

    const userCredential = await signInWithCredential(auth, credential);

    // Apple transmits the full name during the user's initial authorization
    let appleName = '';
    if (appleCredential.fullName) {
      const parts = [
        appleCredential.fullName.givenName,
        appleCredential.fullName.middleName,
        appleCredential.fullName.familyName,
      ].filter(Boolean);
      appleName = parts.join(' ').trim() || appleCredential.fullName.nickname || '';
    }

    if (appleName) {
      try {
        await AsyncStorage.setItem('@musafir_social_name', appleName);
        await AsyncStorage.setItem('@musafir_apple_name', appleName);
      } catch (storageErr) {
        console.warn('[performAppleSignIn] Error caching Apple name:', storageErr);
      }

      try {
        await updateProfile(userCredential.user, { displayName: appleName });
      } catch (profileErr) {
        console.warn('[performAppleSignIn] Error updating profile displayName:', profileErr);
      }

      try {
        Object.defineProperty(userCredential.user, 'displayName', {
          value: appleName,
          configurable: true,
          writable: true,
        });
      } catch {}
    } else {
      // Subsequent Apple sign-ins: Apple sends null for fullName.
      // Check if userCredential has displayName, or fall back to cached Apple name
      const fallbackName =
        userCredential.user.displayName ||
        (await AsyncStorage.getItem('@musafir_apple_name')) ||
        (await AsyncStorage.getItem('@musafir_social_name'));

      if (fallbackName && fallbackName.trim()) {
        const cleanName = fallbackName.trim();
        try {
          await AsyncStorage.setItem('@musafir_social_name', cleanName);
        } catch {}

        if (!userCredential.user.displayName) {
          try {
            await updateProfile(userCredential.user, { displayName: cleanName });
          } catch {}
          try {
            Object.defineProperty(userCredential.user, 'displayName', {
              value: cleanName,
              configurable: true,
              writable: true,
            });
          } catch {}
        }
      }
    }

    return userCredential.user;
  } catch (error: any) {
    if (
      error?.code === 'ERR_REQUEST_CANCELED' ||
      error?.code === '1001' ||
      error?.message?.includes('canceled')
    ) {
      throw new Error('Sign-in cancelled.');
    }
    const friendlyMessage = getFirebaseErrorMessage(error);
    throw new Error(friendlyMessage);
  }
}

/**
 * Initiates Google Sign-In across Web, iOS, and Android and authenticates with Firebase Auth.
 */
export async function performGoogleSignIn(): Promise<User> {
  // Web browser flow: Firebase built-in GoogleAuthProvider popup
  if (Platform.OS === 'web') {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const userCredential = await signInWithPopup(
        auth,
        provider,
        browserPopupRedirectResolver
      );
      if (userCredential.user.displayName) {
        try {
          await AsyncStorage.setItem('@musafir_social_name', userCredential.user.displayName);
          await AsyncStorage.setItem('@musafir_google_name', userCredential.user.displayName);
        } catch {}
      }
      return userCredential.user;
    } catch (error: any) {
      if (error?.code === 'auth/popup-closed-by-user') {
        throw new Error('Sign-in cancelled.');
      }
      const friendlyMessage = getFirebaseErrorMessage(error);
      throw new Error(friendlyMessage);
    }
  }

  // Native flow: iOS and Android via @react-native-google-signin/google-signin
  const webClientId =
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

  if (!webClientId) {
    throw new Error(
      'Google Sign-In configuration missing. Please add EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to your .env file.'
    );
  }

  try {
    const { GoogleSignin, statusCodes } = await import(
      '@react-native-google-signin/google-signin'
    );

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
      throw new Error('Sign-in cancelled.');
    }

    const idToken =
      response.type === 'success'
        ? response.data.idToken
        : (response as any)?.data?.idToken || (response as any)?.idToken;

    if (!idToken) {
      throw new Error('No ID token received from Google.');
    }

    const credential = GoogleAuthProvider.credential(idToken);
    const userCredential = await signInWithCredential(auth, credential);

    // Extract name from Google sign-in response
    const googleUser =
      response.type === 'success'
        ? response.data?.user
        : (response as any)?.data?.user || (response as any)?.user;

    const googleName =
      googleUser?.name ||
      [googleUser?.givenName, googleUser?.familyName].filter(Boolean).join(' ').trim() ||
      userCredential.user.displayName ||
      '';

    if (googleName && googleName.trim()) {
      const cleanName = googleName.trim();
      try {
        await AsyncStorage.setItem('@musafir_social_name', cleanName);
        await AsyncStorage.setItem('@musafir_google_name', cleanName);
      } catch (storageErr) {
        console.warn('[performGoogleSignIn] Error caching Google name:', storageErr);
      }

      if (!userCredential.user.displayName || userCredential.user.displayName !== cleanName) {
        try {
          await updateProfile(userCredential.user, { displayName: cleanName });
        } catch (profileErr) {
          console.warn('[performGoogleSignIn] Error updating displayName:', profileErr);
        }
      }

      try {
        Object.defineProperty(userCredential.user, 'displayName', {
          value: cleanName,
          configurable: true,
          writable: true,
        });
      } catch {}
    }

    return userCredential.user;
  } catch (error: any) {
    if (error?.message === 'Sign-in cancelled.') {
      throw error;
    }

    const code = error?.code;
    if (code === 'SIGN_IN_CANCELLED' || code === '12501') {
      throw new Error('Sign-in cancelled.');
    }
    if (code === 'IN_PROGRESS') {
      throw new Error('Sign-in already in progress.');
    }
    if (code === 'PLAY_SERVICES_NOT_AVAILABLE') {
      throw new Error('Google Play Services is not available on this device.');
    }

    const friendlyMessage = getFirebaseErrorMessage(error);
    throw new Error(friendlyMessage);
  }
}
