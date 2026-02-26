import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  updateDoc,
  query,
  where,
  Timestamp,
  addDoc,
} from 'firebase/firestore';
import { firestore } from './firebaseService';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InboxItem {
  id: string;               // Firestore doc ID
  title: string;
  details?: string;
  isUrgent: boolean;
  isImportant: boolean;
  dueDate?: Date;
  contributorUID: string;
  contributorEmail: string;
  status: 'pending' | 'accepted' | 'declined';
  taskId?: number;          // set after acceptance
  createdAt: Date;
}

export interface ContributorPermission {
  ownerUID: string;
  ownerEmail: string;
  linkedAt: Date;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toTimestamp(date: Date | undefined): Timestamp | null {
  return date ? Timestamp.fromDate(date) : null;
}

function fromTimestamp(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Timestamp) return value.toDate();
  return undefined;
}

function deserialiseInboxItem(id: string, data: Record<string, unknown>): InboxItem {
  return {
    id,
    title: String(data.title ?? ''),
    details: typeof data.details === 'string' ? data.details : undefined,
    isUrgent: Boolean(data.isUrgent),
    isImportant: Boolean(data.isImportant),
    dueDate: fromTimestamp(data.dueDate),
    contributorUID: String(data.contributorUID ?? ''),
    contributorEmail: String(data.contributorEmail ?? ''),
    status: (data.status as InboxItem['status']) ?? 'pending',
    taskId: typeof data.taskId === 'number' ? data.taskId : undefined,
    createdAt: fromTimestamp(data.createdAt) ?? new Date(),
  };
}

/** Generate a random alphanumeric invite code. */
function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // unambiguous chars
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Invite codes ─────────────────────────────────────────────────────────────

/**
 * Generate a 7-day invite code for the given owner and store it in Firestore.
 * Returns the generated code string.
 */
export async function generateInviteCode(ownerUID: string, ownerEmail: string): Promise<string> {
  const code = generateCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  await setDoc(doc(firestore, `invites/${code}`), {
    ownerUID,
    ownerEmail,
    createdAt: Timestamp.fromDate(now),
    expiresAt: Timestamp.fromDate(expiresAt),
  });

  return code;
}

/**
 * Redeem an invite code.
 * Validates that the code exists, hasn't expired, and hasn't been redeemed.
 * On success: marks it redeemed and writes the contributor permission doc.
 * Returns the owner's UID and email.
 */
export async function redeemInviteCode(
  code: string,
  contributorUID: string,
  contributorEmail: string
): Promise<{ ownerUID: string; ownerEmail: string }> {
  const inviteRef = doc(firestore, `invites/${code}`);
  const inviteSnap = await getDoc(inviteRef);

  if (!inviteSnap.exists()) {
    throw new Error('Invalid invite code.');
  }

  const data = inviteSnap.data();
  const expiresAt = fromTimestamp(data.expiresAt);
  if (!expiresAt || expiresAt < new Date()) {
    throw new Error('This invite code has expired.');
  }

  if (data.redeemedBy) {
    throw new Error('This invite code has already been used.');
  }

  const ownerUID = String(data.ownerUID);
  const ownerEmail = String(data.ownerEmail);

  // Mark invite as redeemed
  await updateDoc(inviteRef, {
    redeemedBy: contributorUID,
    redeemedAt: Timestamp.fromDate(new Date()),
  });

  // Write contributor permission doc under contributor's UID
  await setDoc(doc(firestore, `users/${contributorUID}/permissions/contributor`), {
    ownerUID,
    ownerEmail,
    linkedAt: Timestamp.fromDate(new Date()),
  });

  return { ownerUID, ownerEmail };
}

/**
 * Read the contributor's permission doc. Returns null if not linked.
 */
export async function getContributorPermission(
  contributorUID: string
): Promise<ContributorPermission | null> {
  const snap = await getDoc(
    doc(firestore, `users/${contributorUID}/permissions/contributor`)
  );
  if (!snap.exists()) return null;
  const data = snap.data();
  return {
    ownerUID: String(data.ownerUID ?? ''),
    ownerEmail: String(data.ownerEmail ?? ''),
    linkedAt: fromTimestamp(data.linkedAt) ?? new Date(),
  };
}

/**
 * Remove the contributor permission doc (unlink).
 */
export async function removeContributorPermission(contributorUID: string): Promise<void> {
  await deleteDoc(doc(firestore, `users/${contributorUID}/permissions/contributor`));
}

// ─── Inbox (submission) ───────────────────────────────────────────────────────

/**
 * Submit a task to the owner's inbox. Returns the Firestore doc ID.
 */
export async function submitInboxTask(
  ownerUID: string,
  item: Omit<InboxItem, 'id' | 'status' | 'createdAt' | 'taskId'>
): Promise<string> {
  const ref = await addDoc(collection(firestore, `users/${ownerUID}/inbox`), {
    title: item.title,
    details: item.details ?? null,
    isUrgent: item.isUrgent,
    isImportant: item.isImportant,
    dueDate: toTimestamp(item.dueDate),
    contributorUID: item.contributorUID,
    contributorEmail: item.contributorEmail,
    status: 'pending',
    createdAt: Timestamp.fromDate(new Date()),
  });
  return ref.id;
}

/**
 * Fetch all inbox submissions for a specific contributor (for their home view).
 */
export async function getContributorSubmissions(
  ownerUID: string,
  contributorUID: string
): Promise<InboxItem[]> {
  const q = query(
    collection(firestore, `users/${ownerUID}/inbox`),
    where('contributorUID', '==', contributorUID)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => deserialiseInboxItem(d.id, d.data() as Record<string, unknown>));
}

/**
 * Delete a pending inbox item (contributor removing their own submission).
 */
export async function deleteInboxItem(ownerUID: string, inboxId: string): Promise<void> {
  await deleteDoc(doc(firestore, `users/${ownerUID}/inbox/${inboxId}`));
}

/**
 * Fetch all pending inbox items for the owner to review.
 */
export async function fetchPendingInboxItems(ownerUID: string): Promise<InboxItem[]> {
  const q = query(
    collection(firestore, `users/${ownerUID}/inbox`),
    where('status', '==', 'pending')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => deserialiseInboxItem(d.id, d.data() as Record<string, unknown>));
}

/**
 * Get count of pending inbox items (used for the nudge).
 */
export async function getPendingInboxCount(ownerUID: string): Promise<number> {
  const items = await fetchPendingInboxItems(ownerUID);
  return items.length;
}

/**
 * Accept an inbox item: mark it accepted and record the local task ID.
 */
export async function acceptInboxItem(
  ownerUID: string,
  inboxId: string,
  taskId: number
): Promise<void> {
  await updateDoc(doc(firestore, `users/${ownerUID}/inbox/${inboxId}`), {
    status: 'accepted',
    taskId,
  });
}

/**
 * Decline an inbox item.
 */
export async function declineInboxItem(ownerUID: string, inboxId: string): Promise<void> {
  await updateDoc(doc(firestore, `users/${ownerUID}/inbox/${inboxId}`), {
    status: 'declined',
  });
}

/**
 * Fetch the current task status for an accepted inbox item.
 * Used by the contributor to see progress after acceptance.
 * Returns null if the taskId is not available or the task cannot be read.
 */
export async function getAcceptedTaskStatus(
  ownerUID: string,
  taskId: number
): Promise<string | null> {
  try {
    const snap = await getDoc(doc(firestore, `users/${ownerUID}/tasks/${taskId}`));
    if (!snap.exists()) return null;
    return String(snap.data().status ?? null);
  } catch {
    return null;
  }
}

// ─── localStorage helpers ─────────────────────────────────────────────────────
// These store lightweight, per-device UI state.  They are intentionally NOT
// synced to Firestore — they only affect the local contributor experience.

export type AppMode = 'owner' | 'contributor';

const MODE_KEY = 'nooks_app_mode';
const OWNER_UID_KEY = 'nooks_contributor_owner_uid';
const OWNER_EMAIL_KEY = 'nooks_contributor_owner_email';

/** Read the persisted app mode.  Defaults to 'owner' if never set. */
export function getAppMode(): AppMode {
  return (localStorage.getItem(MODE_KEY) as AppMode) ?? 'owner';
}

/** Persist the app mode so it survives page reloads. */
export function setAppMode(mode: AppMode): void {
  localStorage.setItem(MODE_KEY, mode);
}

/** UID of the owner whose inbox the contributor is submitting to. */
export function getStoredOwnerUID(): string | null {
  return localStorage.getItem(OWNER_UID_KEY);
}

/** Display email of the owner, shown in the contributor header and submit form. */
export function getStoredOwnerEmail(): string | null {
  return localStorage.getItem(OWNER_EMAIL_KEY);
}

/** Persist owner UID + email after a successful invite code redemption. */
export function storeOwnerInfo(ownerUID: string, ownerEmail: string): void {
  localStorage.setItem(OWNER_UID_KEY, ownerUID);
  localStorage.setItem(OWNER_EMAIL_KEY, ownerEmail);
}

/** Remove owner info when the contributor unlinks (switches back to owner mode). */
export function clearOwnerInfo(): void {
  localStorage.removeItem(OWNER_UID_KEY);
  localStorage.removeItem(OWNER_EMAIL_KEY);
}

// ─── Dismissed submissions ────────────────────────────────────────────────────
// Dismissed items are hidden from the contributor's list but NOT deleted from
// Firestore.  The contributor can reveal them at any time via "X hidden · Reveal".

const DISMISSED_KEY = 'nooks_dismissed_submissions';

/** Returns the set of inboxItem IDs the contributor has soft-hidden from their view. */
export function getDismissedSubmissionIds(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

/** Add an inboxItem ID to the dismissed set so it is hidden from the contributor's list. */
export function dismissSubmission(id: string): void {
  const current = getDismissedSubmissionIds();
  current.add(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...current]));
}

/** Remove all dismissed submission IDs, making every item visible again. */
export function clearDismissedSubmissions(): void {
  localStorage.removeItem(DISMISSED_KEY);
}
