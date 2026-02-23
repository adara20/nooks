import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { type User } from 'firebase/auth';
import {
  onAuthChange,
  signInWithEmail,
  signUpWithEmail,
  signOutUser,
  runInitialSync,
} from '../services/firebaseService';
import { repository } from '../services/repository';
import { type Bucket, type Task } from '../db';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface AuthContextValue {
  user: User | null;
  isSignedIn: boolean;
  authLoading: boolean;
  syncStatus: SyncStatus;
  setSyncStatus: (status: SyncStatus) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle');
  // Track which UIDs we've already synced this session to avoid duplicate merges
  const syncedUids = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsubscribe = onAuthChange(async (u) => {
      setUser(u);
      setAuthLoading(false);

      if (u && !syncedUids.current.has(u.uid)) {
        syncedUids.current.add(u.uid);
        setSyncStatus('syncing');
        try {
          await runInitialSync(u.uid, {
            getLocalData: async () => {
              const [buckets, tasks] = await Promise.all([
                repository.getAllBuckets(),
                repository.getAllTasks(),
              ]);
              return { buckets, tasks };
            },
            insertMergedItems: async (items: {
              buckets: Omit<Bucket, 'id'>[];
              tasks: Omit<Task, 'id'>[];
            }) => {
              for (const bucket of items.buckets) {
                await repository.addBucket(bucket);
              }
              for (const task of items.tasks) {
                await repository.addTask(task);
              }
            },
            getAllLocalData: async () => {
              const [buckets, tasks] = await Promise.all([
                repository.getAllBuckets(),
                repository.getAllTasks(),
              ]);
              return { buckets, tasks };
            },
          });
          setSyncStatus('synced');
        } catch (err) {
          console.warn('[AuthContext] runInitialSync failed:', err);
          setSyncStatus('error');
        }
      }
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
    await signInWithEmail(email, password);
  };

  const signUp = async (email: string, password: string) => {
    await signUpWithEmail(email, password);
  };

  const signOut = async () => {
    await signOutUser();
    setSyncStatus('idle');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isSignedIn: user !== null,
        authLoading,
        syncStatus,
        setSyncStatus,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
