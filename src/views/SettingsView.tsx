import React, { useState, useRef } from 'react';
import { formatDistanceToNow, addDays, format } from 'date-fns';
import { Download, Upload, ArrowLeft, AlertCircle, Cloud, CloudOff, LogIn, UserPlus, LogOut, CheckCircle2, Loader2, Copy, Users } from 'lucide-react';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { Modal } from '../components/Modal';
import { repository } from '../services/repository';
import { db } from '../db';
import {
  exportData,
  triggerDownload,
  getExportFilename,
  validateBackup,
  mergeData,
  getLastExportDate,
  setLastExportDate,
  type NooksBackup,
} from '../services/backupService';
import {
  type AppMode,
  getAppMode,
  setAppMode,
  getStoredOwnerEmail,
  storeOwnerInfo,
  clearOwnerInfo,
  generateInviteCode,
  redeemInviteCode,
  getContributorPermission,
  removeContributorPermission,
} from '../services/contributorService';
import { useAuth } from '../context/AuthContext';
import { cn } from '../utils/cn';

interface SettingsViewProps {
  onBack: () => void;
  onModeChange?: (mode: AppMode) => void;
}

// ─── App Mode Card ────────────────────────────────────────────────────────────

const AppModeCard: React.FC<{ onModeChange: (mode: AppMode) => void }> = ({ onModeChange }) => {
  const { user, isSignedIn } = useAuth();
  const [mode, setMode] = useState<AppMode>(getAppMode());
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteExpiry, setInviteExpiry] = useState<Date | null>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [redeemCode, setRedeemCode] = useState('');
  const [redeemError, setRedeemError] = useState<string | null>(null);
  const [redeemLoading, setRedeemLoading] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const [linkedEmail, setLinkedEmail] = useState<string | null>(() => getStoredOwnerEmail());

  // Load contributor permission on mount (if in contributor mode and signed in)
  React.useEffect(() => {
    if (mode === 'contributor' && isSignedIn && user) {
      getContributorPermission(user.uid)
        .then(perm => {
          if (perm) setLinkedEmail(perm.ownerEmail);
        })
        .catch(() => {});
    }
  }, [mode, isSignedIn, user]);

  const handleModeToggle = (newMode: AppMode) => {
    if (newMode === mode) return;
    setAppMode(newMode);
    setMode(newMode);
    onModeChange(newMode);
    // Reset invite state when toggling
    setInviteCode(null);
    setInviteExpiry(null);
    setRedeemError(null);
    setRedeemSuccess(false);
    if (newMode === 'owner') {
      clearOwnerInfo();
      setLinkedEmail(null);
    }
  };

  const handleGenerateInvite = async () => {
    if (!user) return;
    setInviteLoading(true);
    setInviteError(null);
    try {
      const code = await generateInviteCode(user.uid, user.email ?? '');
      setInviteCode(code);
      setInviteExpiry(addDays(new Date(), 7));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInviteError(msg.includes('permission') || msg.includes('Missing or insufficient')
        ? 'Permission denied. Make sure the Firestore security rules allow writes to the invites collection.'
        : 'Failed to generate invite code. Please try again.');
    } finally {
      setInviteLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!inviteCode) return;
    await navigator.clipboard.writeText(inviteCode);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const handleRedeem = async () => {
    if (!user || !redeemCode.trim()) return;
    setRedeemLoading(true);
    setRedeemError(null);
    try {
      const result = await redeemInviteCode(redeemCode.trim(), user.uid, user.email ?? '');
      storeOwnerInfo(result.ownerUID, result.ownerEmail);
      setLinkedEmail(result.ownerEmail);
      setRedeemSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('expired')) setRedeemError('This invite code has expired.');
      else if (msg.includes('already redeemed')) setRedeemError('This code has already been used.');
      else if (msg.includes('not found')) setRedeemError('Invite code not found. Check the code and try again.');
      else setRedeemError('Something went wrong. Please try again.');
    } finally {
      setRedeemLoading(false);
    }
  };

  const handleRemoveContributor = async () => {
    if (!user) return;
    try {
      await removeContributorPermission(user.uid);
    } catch {
      // silently fail
    }
    setLinkedEmail(null);
  };

  return (
    <Card className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <Users size={18} className="text-nook-ink/60" />
        <span className="text-sm font-bold text-nook-ink">App Mode</span>
      </div>

      {/* Mode toggle */}
      <div className="flex rounded-xl overflow-hidden border border-nook-ink/10" data-testid="app-mode-toggle">
        <button
          className={cn(
            'flex-1 py-2 text-xs font-bold transition-colors',
            mode === 'owner' ? 'bg-nook-ink text-white' : 'bg-transparent text-nook-ink/50 hover:text-nook-ink'
          )}
          onClick={() => handleModeToggle('owner')}
          data-testid="mode-owner-btn"
        >
          Owner
        </button>
        <button
          className={cn(
            'flex-1 py-2 text-xs font-bold transition-colors',
            mode === 'contributor' ? 'bg-nook-ink text-white' : 'bg-transparent text-nook-ink/50 hover:text-nook-ink'
          )}
          onClick={() => handleModeToggle('contributor')}
          data-testid="mode-contributor-btn"
        >
          Contributor
        </button>
      </div>

      {/* Owner mode: invite + linked contributor */}
      {mode === 'owner' && isSignedIn && (
        <div className="space-y-3">
          {!inviteCode ? (
            <Button
              variant="secondary"
              className="w-full py-3 text-sm"
              onClick={handleGenerateInvite}
              disabled={inviteLoading}
              data-testid="generate-invite-btn"
            >
              {inviteLoading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
              Generate Invite Code
            </Button>
          ) : (
            <div className="p-3 bg-nook-sand/30 rounded-xl space-y-2" data-testid="invite-code-card">
              <p className="text-[11px] font-bold uppercase tracking-widest text-nook-ink/40">Invite Code</p>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xl font-bold font-mono tracking-widest text-nook-ink" data-testid="invite-code-text">
                  {inviteCode}
                </span>
                <button
                  onClick={handleCopyCode}
                  aria-label="Copy invite code"
                  className="text-nook-ink/40 hover:text-nook-orange transition-colors"
                  data-testid="copy-invite-btn"
                >
                  {inviteCopied ? <CheckCircle2 size={18} className="text-green-500" /> : <Copy size={18} />}
                </button>
              </div>
              {inviteExpiry && (
                <p className="text-[11px] text-nook-ink/40">
                  Expires {format(inviteExpiry, 'MMM d, yyyy')}
                </p>
              )}
            </div>
          )}

          {inviteError && (
            <p className="text-xs text-red-600" role="alert" data-testid="invite-error">{inviteError}</p>
          )}

          {linkedEmail && (
            <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl" data-testid="linked-contributor-card">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-nook-ink/40">Linked Contributor</p>
                <p className="text-sm font-bold text-nook-ink">{linkedEmail}</p>
              </div>
              <button
                onClick={handleRemoveContributor}
                className="text-xs text-red-400 hover:text-red-600 font-bold transition-colors"
                data-testid="remove-contributor-btn"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      )}

      {/* Owner mode: prompt to sign in */}
      {mode === 'owner' && !isSignedIn && (
        <p className="text-xs text-nook-ink/50">
          Sign in via Cloud Backup to generate an invite code for your contributor.
        </p>
      )}

      {/* Contributor mode */}
      {mode === 'contributor' && (
        <div className="space-y-3">
          {redeemSuccess ? (
            <div className="p-3 bg-green-50 rounded-xl text-green-700 text-sm font-bold" data-testid="redeem-success">
              ✅ Linked! Switch back to see your home screen.
            </div>
          ) : linkedEmail ? (
            <div className="p-3 bg-green-50 rounded-xl" data-testid="linked-owner-card">
              <p className="text-[11px] font-bold uppercase tracking-widest text-nook-ink/40">Linked to</p>
              <p className="text-sm font-bold text-nook-ink">{linkedEmail}</p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-nook-ink/50">Enter the invite code from the owner to link your accounts.</p>
              <input
                type="text"
                placeholder="Invite code"
                value={redeemCode}
                onChange={e => setRedeemCode(e.target.value.toUpperCase())}
                className="w-full px-4 py-2.5 rounded-xl border border-nook-ink/10 bg-white text-sm font-mono font-bold text-nook-ink placeholder-nook-ink/30 focus:outline-none focus:ring-2 focus:ring-nook-ink/20 uppercase tracking-widest"
                data-testid="redeem-code-input"
              />
              {redeemError && (
                <p className="text-xs text-red-600" role="alert" data-testid="redeem-error">{redeemError}</p>
              )}
              <Button
                className="w-full py-3 text-sm"
                onClick={handleRedeem}
                disabled={redeemLoading || !redeemCode.trim()}
                data-testid="redeem-btn"
              >
                {redeemLoading ? <Loader2 size={16} className="animate-spin mr-2" /> : null}
                Link Account
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
};

// ─── Cloud Backup Card ────────────────────────────────────────────────────────

const CloudBackupCard: React.FC = () => {
  const { user, isSignedIn, syncStatus, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  const handleAuth = async () => {
    if (!email.trim() || !password.trim()) {
      setAuthError('Please enter your email and password.');
      return;
    }
    setAuthError(null);
    setAuthLoading(true);
    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await signUp(email.trim(), password);
      }
      setEmail('');
      setPassword('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Map common Firebase error codes to friendly messages
      if (msg.includes('auth/invalid-credential') || msg.includes('auth/wrong-password') || msg.includes('auth/user-not-found')) {
        setAuthError('Incorrect email or password.');
      } else if (msg.includes('auth/email-already-in-use')) {
        setAuthError('An account with this email already exists. Try signing in instead.');
      } else if (msg.includes('auth/weak-password')) {
        setAuthError('Password must be at least 6 characters.');
      } else if (msg.includes('auth/invalid-email')) {
        setAuthError('Please enter a valid email address.');
      } else {
        setAuthError('Something went wrong. Please try again.');
      }
    } finally {
      setAuthLoading(false);
    }
  };

  const syncLabel: Record<typeof syncStatus, string> = {
    idle: 'Connected',
    syncing: 'Syncing…',
    synced: 'All synced',
    error: 'Sync error',
  };

  const SyncIcon = () => {
    if (syncStatus === 'syncing') return <Loader2 size={16} className="animate-spin text-nook-ink/50" />;
    if (syncStatus === 'synced') return <CheckCircle2 size={16} className="text-green-500" />;
    if (syncStatus === 'error') return <AlertCircle size={16} className="text-nook-orange" />;
    return <Cloud size={16} className="text-nook-ink/50" />;
  };

  if (isSignedIn) {
    return (
      <div data-testid="cloud-signed-in">
      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Cloud size={18} className="text-nook-ink/60" />
            <span className="text-sm font-bold text-nook-ink">Cloud Backup</span>
          </div>
          <div className="flex items-center gap-1.5">
            <SyncIcon />
            <span className="text-xs text-nook-ink/60">{syncLabel[syncStatus]}</span>
          </div>
        </div>

        <p className="text-xs text-nook-ink/50 truncate" data-testid="cloud-email">{user?.email}</p>

        <Button
          variant="secondary"
          className="w-full py-3 flex items-center justify-center gap-2 text-sm"
          onClick={signOut}
          data-testid="cloud-signout-button"
        >
          <LogOut size={16} />
          Sign out
        </Button>
      </Card>
      </div>
    );
  }

  return (
    <div data-testid="cloud-signed-out">
    <Card className="space-y-4">
      <div className="flex items-center gap-2">
        <CloudOff size={18} className="text-nook-ink/40" />
        <span className="text-sm font-bold text-nook-ink">Cloud Backup</span>
      </div>

      <p className="text-xs text-nook-ink/50">
        Sign in to automatically back up your data and access it from any device.
      </p>

      {/* Mode toggle */}
      <div className="flex rounded-xl overflow-hidden border border-nook-ink/10">
        <button
          className={cn(
            'flex-1 py-2 text-xs font-bold transition-colors',
            mode === 'signin'
              ? 'bg-nook-ink text-white'
              : 'bg-transparent text-nook-ink/50 hover:text-nook-ink'
          )}
          onClick={() => { setMode('signin'); setAuthError(null); }}
          data-testid="cloud-mode-signin"
        >
          Sign in
        </button>
        <button
          className={cn(
            'flex-1 py-2 text-xs font-bold transition-colors',
            mode === 'signup'
              ? 'bg-nook-ink text-white'
              : 'bg-transparent text-nook-ink/50 hover:text-nook-ink'
          )}
          onClick={() => { setMode('signup'); setAuthError(null); }}
          data-testid="cloud-mode-signup"
        >
          Create account
        </button>
      </div>

      {/* Fields */}
      <div className="space-y-2">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="w-full px-4 py-2.5 rounded-xl border border-nook-ink/10 bg-white text-sm text-nook-ink placeholder-nook-ink/30 focus:outline-none focus:ring-2 focus:ring-nook-ink/20"
          data-testid="cloud-email-input"
          autoComplete="email"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') handleAuth(); }}
          className="w-full px-4 py-2.5 rounded-xl border border-nook-ink/10 bg-white text-sm text-nook-ink placeholder-nook-ink/30 focus:outline-none focus:ring-2 focus:ring-nook-ink/20"
          data-testid="cloud-password-input"
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
        />
      </div>

      {authError && (
        <p className="text-xs text-red-600" role="alert" data-testid="cloud-auth-error">{authError}</p>
      )}

      <Button
        className="w-full py-3 flex items-center justify-center gap-2 text-sm"
        onClick={handleAuth}
        disabled={authLoading}
        data-testid="cloud-auth-button"
      >
        {authLoading
          ? <Loader2 size={16} className="animate-spin" />
          : mode === 'signin' ? <LogIn size={16} /> : <UserPlus size={16} />
        }
        {authLoading ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
      </Button>
    </Card>
    </div>
  );
};

// ─── SettingsView ──────────────────────────────────────────────────────────────

export const SettingsView: React.FC<SettingsViewProps> = ({ onBack, onModeChange }) => {
  const [lastExport, setLastExport] = useState<Date | null>(getLastExportDate);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const [pendingBackup, setPendingBackup] = useState<NooksBackup | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isReplaceConfirmOpen, setIsReplaceConfirmOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleModeChange = (newMode: AppMode) => {
    onModeChange?.(newMode);
  };

  const isStale = lastExport === null || Date.now() - lastExport.getTime() >= 3 * 24 * 60 * 60 * 1000;

  const handleExport = async () => {
    const buckets = await repository.getAllBuckets();
    const tasks = await repository.getAllTasks();
    const json = exportData(buckets, tasks);
    triggerDownload(json, getExportFilename());
    setLastExportDate();
    setLastExport(new Date());
    setImportSuccess('Backup downloaded successfully.');
    setTimeout(() => setImportSuccess(null), 3000);
  };

  const handleImportClick = () => {
    setImportError(null);
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (!validateBackup(parsed)) {
          setImportError('This file doesn\'t look like a valid Nooks backup. Please try again.');
          return;
        }
        setPendingBackup(parsed);
        setIsImportModalOpen(true);
      } catch {
        setImportError('Could not read that file. Make sure it\'s a valid JSON backup.');
      }
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected if needed
    e.target.value = '';
  };

  const handleReplace = async () => {
    setIsImportModalOpen(false);
    setIsReplaceConfirmOpen(true);
  };

  const handleReplaceConfirmed = async () => {
    if (!pendingBackup) return;
    await db.tasks.clear();
    await db.buckets.clear();
    for (const bucket of pendingBackup.buckets) {
      const { id: _id, ...rest } = bucket;
      await repository.addBucket(rest);
    }
    for (const task of pendingBackup.tasks) {
      const { id: _id, ...rest } = task;
      await repository.addTask(rest);
    }
    setPendingBackup(null);
    setIsReplaceConfirmOpen(false);
    setImportSuccess('All data restored from backup.');
    setTimeout(() => setImportSuccess(null), 4000);
  };

  const handleMerge = async () => {
    if (!pendingBackup) return;
    const existingBuckets = await repository.getAllBuckets();
    const existingTasks = await repository.getAllTasks();
    const { buckets: newBuckets, tasks: newTasks } = mergeData(
      { buckets: existingBuckets, tasks: existingTasks },
      { buckets: pendingBackup.buckets, tasks: pendingBackup.tasks }
    );

    // We need to map incoming task bucketIds to newly inserted bucket IDs
    // Build name→newId map for newly added buckets
    const bucketNameToNewId = new Map<string, number>();
    for (const b of newBuckets) {
      const newId = await repository.addBucket(b);
      bucketNameToNewId.set(b.name.toLowerCase(), newId);
    }

    // Build full name→id map (existing + newly inserted)
    const existingBuckets2 = await repository.getAllBuckets();
    const bucketNameToId = new Map<string, number>();
    for (const b of existingBuckets2) {
      bucketNameToId.set(b.name.toLowerCase(), b.id!);
    }

    // Map incoming task bucketIds via bucket name
    for (const task of newTasks) {
      const incomingBucket = pendingBackup.buckets.find(b => b.id === task.bucketId);
      const resolvedBucketId = incomingBucket
        ? bucketNameToId.get(incomingBucket.name.toLowerCase())
        : undefined;
      await repository.addTask({ ...task, bucketId: resolvedBucketId });
    }

    setPendingBackup(null);
    setIsImportModalOpen(false);
    const added = newBuckets.length + newTasks.length;
    setImportSuccess(`Merged! Added ${added} new item${added !== 1 ? 's' : ''}.`);
    setTimeout(() => setImportSuccess(null), 4000);
  };

  return (
    <div className="p-6 pb-32 space-y-8 safe-top">
      {/* Header */}
      <header className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
          <ArrowLeft size={24} />
        </Button>
        <h1 className="text-3xl font-display font-bold text-nook-ink">Settings</h1>
      </header>

      {/* Feedback messages */}
      {importError && (
        <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium" role="alert">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{importError}</span>
        </div>
      )}
      {importSuccess && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-2xl text-green-700 text-sm font-medium" role="status">
          {importSuccess}
        </div>
      )}

      {/* App Mode section */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-nook-ink/40 px-1">Sharing</h2>
        <AppModeCard onModeChange={handleModeChange} />
      </section>

      {/* Cloud Backup section */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-nook-ink/40 px-1">Cloud Backup</h2>
        <CloudBackupCard />
      </section>

      {/* JSON Backup section */}
      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-nook-ink/40 px-1">Data Backup</h2>

        {/* Last backup indicator */}
        <Card className={cn(
          'space-y-1',
          isStale ? 'border-nook-orange/40 bg-orange-50/50' : ''
        )}>
          <p className="text-xs font-bold uppercase tracking-widest text-nook-ink/40">Last Backup</p>
          <p className={cn(
            'text-lg font-bold',
            isStale ? 'text-nook-orange' : 'text-nook-ink'
          )}>
            {lastExport
              ? `${formatDistanceToNow(lastExport, { addSuffix: true })}`
              : 'No backup yet'}
          </p>
        </Card>

        {/* Export */}
        <Button
          className="w-full py-4 flex items-center justify-center gap-3"
          onClick={handleExport}
          data-testid="export-button"
        >
          <Download size={20} />
          Export Data
        </Button>

        {/* Import */}
        <Button
          variant="secondary"
          className="w-full py-4 flex items-center justify-center gap-3"
          onClick={handleImportClick}
          data-testid="import-button"
        >
          <Upload size={20} />
          Import Backup
        </Button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
          data-testid="file-input"
          aria-label="Import backup file"
        />

        <p className="text-xs text-nook-ink/40 text-center px-4">
          Backups include all your buckets and tasks. Store the file somewhere safe.
        </p>
      </section>

      {/* Import choice modal */}
      <Modal
        isOpen={isImportModalOpen}
        onClose={() => { setIsImportModalOpen(false); setPendingBackup(null); }}
        title="Import Backup"
      >
        <div className="space-y-4">
          <p className="text-nook-ink/70">What would you like to do with your existing data?</p>
          <div className="space-y-3">
            <Button
              variant="secondary"
              className="w-full py-4"
              onClick={handleMerge}
              data-testid="merge-button"
            >
              Merge — add new items, skip duplicates
            </Button>
            <Button
              variant="danger"
              className="w-full py-4"
              onClick={handleReplace}
              data-testid="replace-button"
            >
              Replace — wipe current data and restore
            </Button>
            <Button
              variant="ghost"
              className="w-full py-3"
              onClick={() => { setIsImportModalOpen(false); setPendingBackup(null); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Replace confirmation modal */}
      <Modal
        isOpen={isReplaceConfirmOpen}
        onClose={() => setIsReplaceConfirmOpen(false)}
        title="Are you sure?"
      >
        <div className="space-y-4">
          <p className="text-nook-ink/70">
            This will <strong>delete all your current data</strong> and restore from the backup file. This cannot be undone.
          </p>
          <div className="space-y-3">
            <Button
              variant="danger"
              className="w-full py-4"
              onClick={handleReplaceConfirmed}
              data-testid="confirm-replace-button"
            >
              Yes, replace everything
            </Button>
            <Button
              variant="ghost"
              className="w-full py-3"
              onClick={() => setIsReplaceConfirmOpen(false)}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
