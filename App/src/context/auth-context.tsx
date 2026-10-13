import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  auth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  getFirebaseErrorMessage,
  User,
} from '@/config/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithEmail: (email: string, password: string) => Promise<User>;
  signUpWithEmail: (email: string, password: string) => Promise<User>;
  signInWithGoogle: () => Promise<User>;
  signInWithApple: () => Promise<User>;
  logOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(
      auth,
      (currentUser) => {
        setUser(currentUser);
        setLoading(false);
      },
      (err) => {
        console.warn('Firebase Auth State listener error:', err);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const clearError = () => setError(null);

  const signInWithEmail = async (email: string, password: string): Promise<User> => {
    setError(null);
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), password);
      setUser(userCredential.user);
      return userCredential.user;
    } catch (err) {
      const friendlyMessage = getFirebaseErrorMessage(err);
      setError(friendlyMessage);
      throw new Error(friendlyMessage);
    }
  };

  const signUpWithEmail = async (email: string, password: string): Promise<User> => {
    setError(null);
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email.trim(), password);
      setUser(userCredential.user);
      return userCredential.user;
    } catch (err) {
      const friendlyMessage = getFirebaseErrorMessage(err);
      setError(friendlyMessage);
      throw new Error(friendlyMessage);
    }
  };

  const signInWithGoogle = async (): Promise<User> => {
    setError(null);
    try {
      const { performGoogleSignIn } = await import('@/services/social-auth');
      const authedUser = await performGoogleSignIn();
      setUser(authedUser);
      return authedUser;
    } catch (err: any) {
      if (err?.message !== 'Sign-in cancelled.') {
        setError(err.message);
      }
      throw err;
    }
  };

  const signInWithApple = async (): Promise<User> => {
    setError(null);
    try {
      const { performAppleSignIn } = await import('@/services/social-auth');
      const authedUser = await performAppleSignIn();
      setUser(authedUser);
      return authedUser;
    } catch (err: any) {
      if (err?.message !== 'Sign-in cancelled.') {
        setError(err.message);
      }
      throw err;
    }
  };

  const logOut = async (): Promise<void> => {
    setError(null);
    try {
      await signOut(auth);
      setUser(null);
    } catch (err) {
      const friendlyMessage = getFirebaseErrorMessage(err);
      setError(friendlyMessage);
      throw new Error(friendlyMessage);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogle,
        signInWithApple,
        logOut,
        clearError,
      }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
