import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

// Initialize Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Google Auth Provider with Google Sheets and Drive.file scopes
export const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

// Flags & in-memory token cache with persistent storage backing
let isSigningIn = false;
let cachedAccessToken: string | null = null;

const getStoredToken = (): string | null => {
  if (typeof window === 'undefined') return null;
  return sessionStorage.getItem('gsheets_oauth_token') || localStorage.getItem('gsheets_oauth_token');
};

const storeToken = (token: string) => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem('gsheets_oauth_token', token);
    localStorage.setItem('gsheets_oauth_token', token);
  } catch (e) {
    console.warn('Could not store token:', e);
  }
};

const clearStoredToken = () => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem('gsheets_oauth_token');
    localStorage.removeItem('gsheets_oauth_token');
  } catch (e) {
    console.warn('Could not clear token:', e);
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const storedToken = getStoredToken();
      const effectiveToken = cachedAccessToken || storedToken;
      if (effectiveToken) {
        cachedAccessToken = effectiveToken;
        if (onAuthSuccess) onAuthSuccess(user, effectiveToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      clearStoredToken();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to obtain Google access token for Sheets integration.');
    }

    cachedAccessToken = credential.accessToken;
    storeToken(credential.accessToken);
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (cachedAccessToken) return cachedAccessToken;
  const stored = getStoredToken();
  if (stored) {
    cachedAccessToken = stored;
    return stored;
  }
  return null;
};

export const logout = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  clearStoredToken();
};
