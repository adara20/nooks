import React, { useEffect, useRef } from 'react';
import { Toaster, toast } from 'sonner';
import {
  collection,
  query,
  where,
  onSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from '../services/firebaseService';
import { getAppMode, getStoredOwnerUID } from '../services/contributorService';
import { hasSeen, markSeen } from '../services/notificationsSeenService';
import { useAuth } from './AuthContext';

// ─── Status label helpers ─────────────────────────────────────────────────────

function humanReadableStatus(status: string): string {
  switch (status) {
    case 'todo':        return 'To Do';
    case 'in-progress': return 'In Progress';
    case 'done':        return 'Done ✓';
    case 'backlog':     return 'Backlog';
    default:            return status;
  }
}

// ─── Owner: inbox listener ────────────────────────────────────────────────────

function startOwnerInboxListener(uid: string): Unsubscribe {
  const ref = collection(firestore, 'users', uid, 'inbox');
  let isFirstSnapshot = true;

  return onSnapshot(ref, { includeMetadataChanges: false }, async (snapshot) => {
    // Skip the first snapshot if it's served from cache to avoid cold-start spam
    if (isFirstSnapshot) {
      isFirstSnapshot = false;
      if (snapshot.metadata.fromCache) return;
    }

    for (const change of snapshot.docChanges()) {
      if (change.type !== 'added') continue;

      const eventId = `inbox:created:${change.doc.id}`;
      if (await hasSeen(eventId)) continue;
      await markSeen(eventId);

      const data = change.doc.data();
      const contributorEmail = String(data.contributorEmail ?? 'Someone');
      const title = String(data.title ?? 'Untitled');
      toast(`📥 New submission from ${contributorEmail}: "${title}"`);
    }
  });
}

// ─── Contributor: inbox status listener ──────────────────────────────────────

function startContributorInboxStatusListener(ownerUID: string, contributorUID: string): Unsubscribe {
  const ref = query(
    collection(firestore, 'users', ownerUID, 'inbox'),
    where('contributorUID', '==', contributorUID)
  );
  let isFirstSnapshot = true;

  return onSnapshot(ref, { includeMetadataChanges: false }, async (snapshot) => {
    if (isFirstSnapshot) {
      isFirstSnapshot = false;
      if (snapshot.metadata.fromCache) return;
    }

    for (const change of snapshot.docChanges()) {
      if (change.type !== 'modified') continue;

      const data = change.doc.data();
      const newStatus = String(data.status ?? '');
      if (newStatus !== 'accepted' && newStatus !== 'declined') continue;

      const eventId = `inbox:status:${change.doc.id}:${newStatus}`;
      if (await hasSeen(eventId)) continue;
      await markSeen(eventId);

      const title = String(data.title ?? 'Untitled');
      if (newStatus === 'accepted') {
        toast.success(`✅ Your submission "${title}" was accepted`);
      } else {
        toast.error(`❌ Your submission "${title}" was declined`);
      }
    }
  });
}

// ─── Contributor: task status listener ───────────────────────────────────────

function startContributorTaskStatusListener(ownerUID: string, contributorUID: string): Unsubscribe {
  const ref = query(
    collection(firestore, 'users', ownerUID, 'tasks'),
    where('contributorUID', '==', contributorUID)
  );
  let isFirstSnapshot = true;

  return onSnapshot(ref, { includeMetadataChanges: false }, async (snapshot) => {
    if (isFirstSnapshot) {
      isFirstSnapshot = false;
      if (snapshot.metadata.fromCache) return;
    }

    for (const change of snapshot.docChanges()) {
      if (change.type !== 'modified') continue;

      const data = change.doc.data();
      const newStatus = String(data.status ?? '');
      const eventId = `task:status:${change.doc.id}:${newStatus}`;

      if (await hasSeen(eventId)) continue;
      await markSeen(eventId);

      const title = String(data.title ?? 'Untitled');
      const label = humanReadableStatus(newStatus);

      if (newStatus === 'done') {
        toast.success(`🔄 Your task "${title}" is now ${label}`);
      } else {
        toast(`🔄 Your task "${title}" is now ${label}`);
      }
    }
  });
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isSignedIn } = useAuth();
  const unsubscribesRef = useRef<Unsubscribe[]>([]);

  useEffect(() => {
    // Tear down any existing listeners
    unsubscribesRef.current.forEach(fn => fn());
    unsubscribesRef.current = [];

    if (!isSignedIn || !user) return;

    const appMode = getAppMode();

    if (appMode === 'owner') {
      unsubscribesRef.current.push(startOwnerInboxListener(user.uid));
    } else {
      // contributor
      const ownerUID = getStoredOwnerUID();
      if (!ownerUID) return;

      unsubscribesRef.current.push(
        startContributorInboxStatusListener(ownerUID, user.uid),
        startContributorTaskStatusListener(ownerUID, user.uid)
      );
    }

    return () => {
      unsubscribesRef.current.forEach(fn => fn());
      unsubscribesRef.current = [];
    };
  }, [user, isSignedIn]);

  return (
    <>
      <Toaster richColors position="top-center" />
      {children}
    </>
  );
};
