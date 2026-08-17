import { getApp, getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

function required(value: string | undefined, name: string): string {
  if (!value)
    throw new Error(
      `Missing ${name}. Copy .env.example to .env and add your Firebase Web configuration.`,
    );
  return value;
}

const firebaseConfig: FirebaseOptions = {
  apiKey: required(import.meta.env.VITE_FIREBASE_API_KEY, "VITE_FIREBASE_API_KEY"),
  authDomain: required(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, "VITE_FIREBASE_AUTH_DOMAIN"),
  projectId: required(import.meta.env.VITE_FIREBASE_PROJECT_ID, "VITE_FIREBASE_PROJECT_ID"),
  storageBucket: required(
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    "VITE_FIREBASE_STORAGE_BUCKET",
  ),
  messagingSenderId: required(
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    "VITE_FIREBASE_MESSAGING_SENDER_ID",
  ),
  appId: required(import.meta.env.VITE_FIREBASE_APP_ID, "VITE_FIREBASE_APP_ID"),
};

/**
 * Firebase's browser SDK is safe to initialise more than once during Vite hot
 * reloads, provided we reuse the existing default app.
 */
export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
export const firebaseStorage = getStorage(firebaseApp);

// Short aliases keep call sites close to the names used in Firebase's docs.
export const auth = firebaseAuth;
export const db = firestore;
export const storage = firebaseStorage;
