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
  getDocs,
  collection,
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

// ─── Deserialisation helpers ──────────────────────────────────────────────────

/** Convert a Firestore Timestamp (or null) back to a JS Date. */
function fromTimestamp(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value.toDate();
  return undefined;
}

/** Deserialise a raw Firestore document back into a Task. */
function deserialiseTask(data: Record<string, unknown>): Task {
  return {
    id: typeof data.id === 'number' ? data.id : undefined,
    title: String(data.title ?? ''),
    details: typeof data.details === 'string' ? data.details : undefined,
    bucketId: typeof data.bucketId === 'number' ? data.bucketId : undefined,
    status: (data.status as Task['status']) ?? 'todo',
    isUrgent: Boolean(data.isUrgent),
    isImportant: Boolean(data.isImportant),
    dueDate: fromTimestamp(data.dueDate),
    createdAt: fromTimestamp(data.createdAt) ?? new Date(),
    completedAt: fromTimestamp(data.completedAt),
  };
}

/** Deserialise a raw Firestore document back into a Bucket. */
function deserialiseBucket(data: Record<string, unknown>): Bucket {
  return {
    id: typeof data.id === 'number' ? data.id : undefined,
    name: String(data.name ?? ''),
    emoji: String(data.emoji ?? ''),
    createdAt: fromTimestamp(data.createdAt) ?? new Date(),
  };
}

// ─── Initial sync helpers ─────────────────────────────────────────────────────

/** Fetch all tasks and buckets stored under a user's Firestore subtree. */
export async function fetchCloudData(uid: string): Promise<{ buckets: Bucket[]; tasks: Task[] }> {
  const [bucketsSnap, tasksSnap] = await Promise.all([
    getDocs(collection(firestore, `users/${uid}/buckets`)),
    getDocs(collection(firestore, `users/${uid}/tasks`)),
  ]);
  const buckets = bucketsSnap.docs.map(d => deserialiseBucket(d.data() as Record<string, unknown>));
  const tasks = tasksSnap.docs.map(d => deserialiseTask(d.data() as Record<string, unknown>));
  return { buckets, tasks };
}

/** Write every local task and bucket up to Firestore (used after merge to push net-new items). */
export async function pushAllToCloud(
  uid: string,
  tasks: Task[],
  buckets: Bucket[]
): Promise<void> {
  await Promise.all([
    ...buckets
      .filter(b => b.id != null)
      .map(b =>
        setDoc(doc(firestore, `users/${uid}/buckets/${b.id}`), serialiseBucket(b))
      ),
    ...tasks
      .filter(t => t.id != null)
      .map(t =>
        setDoc(doc(firestore, `users/${uid}/tasks/${t.id}`), serialiseTask(t))
      ),
  ]);
}

/**
 * Run the one-time merge that happens when a user signs in.
 *
 * Strategy:
 *   1. Fetch cloud data.
 *   2. Merge cloud→local  (insert cloud items not yet in IndexedDB).
 *   3. Push the full local store back to Firestore so every device sees
 *      the union.
 *
 * Accepts callbacks so the caller (AuthContext) can drive status transitions
 * without this module importing React or the repository.
 */
export async function runInitialSync(
  uid: string,
  callbacks: {
    getLocalData: () => Promise<{ buckets: Bucket[]; tasks: Task[] }>;
    insertMergedItems: (items: {
      buckets: Omit<Bucket, 'id'>[];
      tasks: Omit<Task, 'id'>[];
    }) => Promise<void>;
    getAllLocalData: () => Promise<{ buckets: Bucket[]; tasks: Task[] }>;
  }
): Promise<void> {
  const [cloudData, localData] = await Promise.all([
    fetchCloudData(uid),
    callbacks.getLocalData(),
  ]);

  // Merge cloud items into local (only new items — no overwrites)
  const { mergeData } = await import('./backupService');
  const toInsert = mergeData(localData, cloudData);
  if (toInsert.buckets.length > 0 || toInsert.tasks.length > 0) {
    await callbacks.insertMergedItems(toInsert);
  }

  // Push the full updated local store back to Firestore
  const updatedLocal = await callbacks.getAllLocalData();
  await pushAllToCloud(uid, updatedLocal.tasks, updatedLocal.buckets);
}
