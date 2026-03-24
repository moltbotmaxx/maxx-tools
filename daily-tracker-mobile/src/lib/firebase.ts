import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';

export interface FirebaseConfigurationStatus {
  firebaseReady: boolean;
  googleAuthReady: boolean;
  missingFirebaseKeys: string[];
  missingGoogleKeys: string[];
}

const firebaseConfig = {
  apiKey:
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyD9Q9b_RkQ5KCUSoNdqs8W2C3jrB6Q_pCQ',
  authDomain:
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'daily-tracker-ee82c.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'daily-tracker-ee82c',
  storageBucket:
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'daily-tracker-ee82c.firebasestorage.app',
  messagingSenderId:
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '240727869932',
  appId:
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID ||
    '1:240727869932:web:09e2f501e2674d65a698c9',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-X6CE1KMD4H',
};

export const googleClientIds = {
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '',
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
};

const missingFirebaseKeys = Object.entries(firebaseConfig)
  .filter(([, value]) => !value)
  .map(([key]) => key);

const missingGoogleKeys = Object.entries(googleClientIds)
  .filter(([, value]) => !value)
  .map(([key]) => key);

export const configurationStatus: FirebaseConfigurationStatus = {
  firebaseReady: missingFirebaseKeys.length === 0,
  googleAuthReady: missingGoogleKeys.length === 0,
  missingFirebaseKeys,
  missingGoogleKeys,
};

let firebaseApp: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

if (configurationStatus.firebaseReady) {
  firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(firebaseApp);
  auth = getAuth(firebaseApp);
}

export { auth, db, firebaseApp };
