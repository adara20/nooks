import { initializeApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { type Task, type Bucket } from '../db';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const firestore = getFirestore(app);

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export const signUpWithEmail = (email: string, password: string) =>
  createUserWithEmailAndPassword(auth, email, password);

export const signInWithEmail = (email: string, password: string) =>
  signInWithEmailAndPassword(auth, email, password);

export const signOutUser = () => firebaseSignOut(auth);

export const onAuthChange = (callback: (user: User | null) => void) =>
  onAuthStateChanged(auth, callback);

// ─── Serialisation helpers ────────────────────────────────────────────────────

/** Convert a JS Date (or undefined) to a Firestore Timestamp for storage. */
function toTimestamp(date: Date | undefined): Timestamp | null {
  return date ? Timestamp.fromDate(date) : null;
}

/** Serialise a Task for Firestore — converts all Date fields to Timestamps. */
function serialiseTask(task: Task): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    details: task.details ?? null,
    bucketId: task.bucketId ?? null,
    status: task.status,
    isUrgent: task.isUrgent,
    isImportant: task.isImportant,
    dueDate: toTimestamp(task.dueDate),
    createdAt: toTimestamp(task.createdAt),
    completedAt: toTimestamp(task.completedAt),
  };
}

/** Serialise a Bucket for Firestore. */
function serialiseBucket(bucket: Bucket): Record<string, unknown> {
  return {
    id: bucket.id,
    name: bucket.name,
    emoji: bucket.emoji,
    createdAt: toTimestamp(bucket.createdAt),
  };
}

// ─── Sync helpers ─────────────────────────────────────────────────────────────
// All functions are no-ops when the user is not signed in.
// Errors are caught and logged — a Firebase failure must never crash a local write.

export async function syncUpsertTask(task: Task): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || task.id == null) return;
  try {
    await setDoc(
      doc(firestore, `users/${uid}/tasks/${task.id}`),
      serialiseTask(task)
    );
  } catch (err) {
    console.warn('[firebaseService] syncUpsertTask failed:', err);
  }
}

export async function syncDeleteTask(taskId: number): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await deleteDoc(doc(firestore, `users/${uid}/tasks/${taskId}`));
  } catch (err) {
    console.warn('[firebaseService] syncDeleteTask failed:', err);
  }
}

export async function syncUpsertBucket(bucket: Bucket): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid || bucket.id == null) return;
  try {
    await setDoc(
      doc(firestore, `users/${uid}/buckets/${bucket.id}`),
      serialiseBucket(bucket)
    );
  } catch (err) {
    console.warn('[firebaseService] syncUpsertBucket failed:', err);
  }
}

export async function syncDeleteBucket(bucketId: number): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  try {
    await deleteDoc(doc(firestore, `users/${uid}/buckets/${bucketId}`));
  } catch (err) {
    console.warn('[firebaseService] syncDeleteBucket failed:', err);
  }
}
