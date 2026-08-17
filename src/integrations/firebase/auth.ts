import {
  GoogleAuthProvider,
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";

import { firebaseAuth } from "./client";

let persistencePromise: Promise<void> | undefined;

async function prepareAuth(): Promise<void> {
  if (typeof window === "undefined") return;
  persistencePromise ??= setPersistence(firebaseAuth, browserLocalPersistence);
  await persistencePromise;
  await firebaseAuth.authStateReady();
}

export async function waitForAuth(): Promise<User | null> {
  await prepareAuth();
  return firebaseAuth.currentUser;
}

export async function requireUser(): Promise<User> {
  const user = await waitForAuth();
  if (!user) throw new Error("Please sign in to continue.");
  return user;
}

export async function signInWithGoogle(): Promise<User> {
  await prepareAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(firebaseAuth, provider);
  return result.user;
}

export async function signInWithEmail(email: string, password: string): Promise<User> {
  await prepareAuth();
  const result = await signInWithEmailAndPassword(firebaseAuth, email, password);
  return result.user;
}

export async function createAccountWithEmail(email: string, password: string): Promise<User> {
  await prepareAuth();
  const result = await createUserWithEmailAndPassword(firebaseAuth, email, password);
  return result.user;
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(firebaseAuth);
}

export function subscribeToAuth(listener: (user: User | null) => void): () => void {
  return onAuthStateChanged(firebaseAuth, listener);
}
