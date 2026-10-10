import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
// @ts-expect-error getReactNativePersistence exists in React Native bundle of firebase/auth
import { getReactNativePersistence } from 'firebase/auth';
import {
  initializeAuth,
  getAuth,
  browserLocalPersistence,
  inMemoryPersistence,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  Auth,
} from 'firebase/auth';
import { Platform } from 'react-native';

export const firebaseConfig = {
  apiKey: 'AIzaSyD0mrtjE7iEga4Hgd9ZlRClbdMHYSTl7kY',
  authDomain: 'musafir-ai-a7114.firebaseapp.com',
  projectId: 'musafir-ai-a7114',
  storageBucket: 'musafir-ai-a7114.firebasestorage.app',
  messagingSenderId: '623421286127',
  appId: '1:623421286127:web:d1537d46062dddfd649d1a',
  measurementId: 'G-0BMJ6Y7P2K'
};

// Initialize or reuse Firebase App
const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize or reuse Auth with platform-appropriate persistence (AsyncStorage on native, localStorage on web)
let auth: Auth;
try {
  const persistence =
    Platform.OS === 'web'
      ? browserLocalPersistence
      : typeof getReactNativePersistence === 'function'
      ? getReactNativePersistence(AsyncStorage)
      : inMemoryPersistence;

  auth = initializeAuth(app, {
    persistence,
  });
} catch {
  auth = getAuth(app);
}

/**
 * Maps Firebase Auth error codes to user-friendly messages
 */
export function getFirebaseErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'An unexpected error occurred. Please try again.';
  }

  const err = error as { code?: string; message?: string };
  const code = err.code || '';

  switch (code) {
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/user-disabled':
      return 'This user account has been disabled.';
    case 'auth/user-not-found':
      return 'No account found with this email.';
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please verify and try again.';
    case 'auth/email-already-in-use':
      return 'An account already exists with this email address.';
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.';
    case 'auth/operation-not-allowed':
      return 'Email/password sign-in is not enabled in Firebase Console.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection.';
    case 'auth/too-many-requests':
      return 'Too many failed attempts. Please try again in a few minutes.';
    case 'auth/invalid-api-key':
    case 'auth/api-key-not-valid':
      return 'Firebase API Key is invalid or not yet configured in .env.';
    default:
      if (err.message && err.message.length < 120) {
        return err.message.replace('Firebase: ', '');
      }
      return 'Authentication failed. Please check your credentials and try again.';
  }
}

export {
  app,
  auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
};