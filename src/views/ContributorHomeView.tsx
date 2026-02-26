import React, { useState, useEffect } from 'react';
import { Plus, AlertCircle, Star, Trash2, X, Settings, EyeOff } from 'lucide-react';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { cn } from '../utils/cn';
import {
  type InboxItem,
  submitInboxTask,
  getContributorSubmissions,
  deleteInboxItem,
  getStoredOwnerUID,
  getStoredOwnerEmail,
  getAcceptedTaskStatus,
  getDismissedSubmissionIds,
  dismissSubmission,
  clearDismissedSubmissions,
} from '../services/contributorService';
import { useAuth } from '../context/AuthContext';

// ─── Status display constants ─────────────────────────────────────────────────

/** Visual representation for each InboxItem status in the submission row pill. */
const STATUS_DISPLAY: Record<InboxItem['status'], { label: string; emoji: string; className: string }> = {
  pending: { label: 'Pending', emoji: '⏳', className: 'bg-nook-sand text-nook-ink/60' },
  accepted: { label: 'Accepted', emoji: '✅', className: 'bg-green-100 text-green-700' },
  declined: { label: 'Declined', emoji: '❌', className: 'bg-red-50 text-red-500' },
};

/**
 * Maps Firestore task status strings to the human-readable label shown inside
 * the "✅" pill for accepted submissions.  Fetched via getAcceptedTaskStatus.
 * Falls back to "Accepted" when the status is null/unknown.
 */
const TASK_STATUS_LABEL: Record<string, string> = {
  'todo': 'To Do',
  'in-progress': 'In Progress',
  'backlog': 'Backlog',
  'done': 'Done ✓',
};

// ─── Sub-components ────────────────────────────────────────────────────────────

interface SubmissionRowProps {
  item: InboxItem;
  /**
   * Live task status fetched from the owner's Firestore task document.
   * Only present for accepted items that have a taskId.  Undefined means the
   * status could not be read (not yet set, or permission error).
   */
  taskStatus?: string;
  onDelete: () => void;
  /** Soft-hide: hides the row locally (localStorage) without deleting from Firestore. */
  onDismiss: () => void;
}

const SubmissionRow: React.FC<SubmissionRowProps> = ({ item, taskStatus, onDelete, onDismiss }) => {
  const pill = STATUS_DISPLAY[item.status];
  // For accepted items with a resolved live status, show the real task progress
  // (To Do / In Progress / Done ✓) instead of the static "Accepted" label.
  const statusLabel =
    item.status === 'accepted' && taskStatus
      ? (TASK_STATUS_LABEL[taskStatus] ?? pill.label)
      : pill.label;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      <Card className="p-4 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-nook-ink">{item.title}</h3>
            {item.details && (
              <p className="text-sm text-nook-ink/60 mt-0.5 line-clamp-2">{item.details}</p>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {item.isUrgent && <AlertCircle size={14} className="text-red-500" />}
            {item.isImportant && <Star size={14} className="text-nook-orange" fill="currentColor" />}
          </div>
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className={cn('px-2.5 py-1 rounded-full text-[11px] font-bold', pill.className)}>
              {pill.emoji} {statusLabel}
            </span>
            {item.dueDate && (
              <span className="text-[11px] font-bold text-nook-ink/40 uppercase">
                Due {format(item.dueDate, 'MMM d')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/*
             * Dismiss (soft-hide): only for accepted / declined items.
             * Pending items are not dismissable — the contributor may still
             * want to cancel them via the delete button.
             */}
            {item.status !== 'pending' && (
              <button
                onClick={onDismiss}
                aria-label="Dismiss"
                className="text-nook-ink/30 hover:text-nook-ink/60 transition-colors"
              >
                <EyeOff size={16} />
              </button>
            )}
            {/* Hard delete: removes the Firestore inbox document for all statuses. */}
            <button
              onClick={onDelete}
              aria-label="Delete submission"
              className="text-nook-ink/30 hover:text-red-400 transition-colors"
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
};

// ─── Submit form ───────────────────────────────────────────────────────────────

interface SubmitFormProps {
  ownerEmail: string;
  onSubmit: (item: Omit<InboxItem, 'id' | 'contributorUID' | 'contributorEmail' | 'status' | 'createdAt'>) => Promise<void>;
  onClose: () => void;
}

const SubmitForm: React.FC<SubmitFormProps> = ({ ownerEmail, onSubmit, onClose }) => {
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [isUrgent, setIsUrgent] = useState(false);
  const [isImportant, setIsImportant] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit({
        title: title.trim(),
        details: details.trim() || undefined,
        isUrgent,
        isImportant,
        dueDate: dueDate ? new Date(dueDate) : undefined,
      });
      onClose();
    } catch {
      setSubmitError('Failed to send. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <input
          autoFocus
          type="text"
          placeholder="What needs doing?"
          className="w-full bg-transparent text-2xl font-bold placeholder:text-nook-ink/20 focus:outline-none"
          value={title}
          onChange={e => setTitle(e.target.value)}
        />
        <textarea
          placeholder="Any extra details?"
          className="w-full bg-nook-sand/30 rounded-2xl p-4 text-sm focus:outline-none min-h-[100px]"
          value={details}
          onChange={e => setDetails(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-nook-ink/40">Due Date</label>
        <input
          type="date"
          className="w-full bg-nook-sand/30 rounded-xl p-3 text-sm font-bold focus:outline-none"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
        />
      </div>

      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => setIsUrgent(!isUrgent)}
          className={cn(
            "flex-1 p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-1",
            isUrgent ? "border-red-500 bg-red-50 text-red-500" : "border-nook-sand text-nook-ink/40"
          )}
        >
          <AlertCircle size={24} />
          <span className="text-[10px] font-bold uppercase">Urgent</span>
        </button>
        <button
          type="button"
          onClick={() => setIsImportant(!isImportant)}
          className={cn(
            "flex-1 p-4 rounded-2xl border-2 transition-all flex flex-col items-center gap-1",
            isImportant ? "border-nook-orange bg-orange-50 text-nook-orange" : "border-nook-sand text-nook-ink/40"
          )}
        >
          <Star size={24} fill={isImportant ? "currentColor" : "none"} />
          <span className="text-[10px] font-bold uppercase">Important</span>
        </button>
      </div>

      <p className="text-xs text-nook-ink/40 text-center">
        This task will be sent to <span className="font-bold">{ownerEmail}</span> for review.
      </p>

      {submitError && (
        <p className="text-xs text-red-600 text-center" role="alert">{submitError}</p>
      )}

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" className="flex-1" onClick={onClose}>
          <X size={18} />
        </Button>
        <Button type="submit" className="flex-[3] py-4" disabled={submitting}>
          {submitting ? 'Sending...' : 'Send Task'}
        </Button>
      </div>
    </form>
  );
};

// ─── Main view ─────────────────────────────────────────────────────────────────

interface ContributorHomeViewProps {
  onNavigateToSettings: () => void;
}

export const ContributorHomeView: React.FC<ContributorHomeViewProps> = ({ onNavigateToSettings }) => {
  const { user } = useAuth();
  const ownerUID = getStoredOwnerUID();
  const ownerEmail = getStoredOwnerEmail() ?? 'your partner';

  const [submissions, setSubmissions] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [taskStatuses, setTaskStatuses] = useState<Map<string, string>>(new Map());
  const [dismissed, setDismissed] = useState<Set<string>>(() => getDismissedSubmissionIds());

  const userUid = user?.uid;

  useEffect(() => {
    // Can't fetch without both UIDs — show empty state immediately.
    if (!ownerUID || !userUid) {
      setLoading(false);
      return;
    }
    setLoading(true);
    getContributorSubmissions(ownerUID, userUid)
      .then(async (items) => {
        setSubmissions(items);
        // For each accepted item that has been linked to a local task (taskId set),
        // fetch the live task status from the owner's Firestore document so we can
        // show To Do / In Progress / Done ✓ instead of the static "Accepted" label.
        // Requires the Firestore rule:
        //   match /users/{userId}/tasks/{taskId} {
        //     allow read: if request.auth != null
        //                 && resource.data.contributorUID == request.auth.uid;
        //   }
        const accepted = items.filter(s => s.status === 'accepted' && s.taskId != null);
        if (accepted.length > 0) {
          const pairs = await Promise.all(
            accepted.map(async s => [s.id, await getAcceptedTaskStatus(ownerUID, s.taskId!)] as const)
          );
          setTaskStatuses(new Map(pairs.filter(([, v]) => v !== null) as [string, string][]));
        }
      })
      .catch(() => setSubmissions([]))
      .finally(() => setLoading(false));
  }, [ownerUID, userUid]);

  // Filter out submissions the contributor has soft-hidden (localStorage).
  // hiddenCount drives the "X hidden · Reveal" footer and the "All caught up" empty state.
  const visible = submissions.filter(s => !dismissed.has(s.id));
  const hiddenCount = dismissed.size;

  /**
   * Submit a new task to the owner's inbox.
   * Optimistically prepends the item to the local list so the UI updates
   * instantly, using the Firestore doc ID returned by submitInboxTask.
   */
  const handleSubmit = async (
    item: Omit<InboxItem, 'id' | 'contributorUID' | 'contributorEmail' | 'status' | 'createdAt'>
  ) => {
    if (!ownerUID || !user) return;
    const submittable: Omit<InboxItem, 'id' | 'status' | 'createdAt' | 'taskId'> = {
      ...item,
      contributorUID: user.uid,
      contributorEmail: user.email ?? '',
    };
    const id = await submitInboxTask(ownerUID, submittable);
    // Optimistically add to local list for immediate feedback
    const optimistic: InboxItem = {
      id,
      ...submittable,
      status: 'pending',
      createdAt: new Date(),
    };
    setSubmissions(prev => [optimistic, ...prev]);
  };

  /**
   * Hard-delete a submission from the owner's Firestore inbox.
   * Available for all statuses so the contributor can retract any submission.
   * Also cleans the id from the dismissed set to avoid stale localStorage entries.
   */
  const handleDelete = async (item: InboxItem) => {
    if (!ownerUID) return;
    await deleteInboxItem(ownerUID, item.id);
    setSubmissions(prev => prev.filter(s => s.id !== item.id));
    // Keep dismissed set tidy in case this item was previously dismissed
    setDismissed(prev => {
      const next = new Set(prev);
      next.delete(item.id);
      return next;
    });
  };

  /**
   * Soft-hide a submission from the contributor's view.
   * The item is NOT deleted from Firestore — it is only stored in localStorage
   * so it can be revealed later.  Only available for non-pending items.
   */
  const handleDismiss = (id: string) => {
    dismissSubmission(id);
    setDismissed(prev => new Set([...prev, id]));
  };

  /** Reveal all soft-hidden submissions by clearing the localStorage dismiss set. */
  const handleRevealAll = () => {
    clearDismissedSubmissions();
    setDismissed(new Set());
  };

  return (
    <div className="pb-32">
      {/* Header */}
      <div className="px-6 pt-12 pb-6 flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl font-display font-bold text-nook-ink">Add a task</h1>
          <p className="text-nook-ink/50 font-medium">
            for <span className="font-bold text-nook-ink/70">{ownerEmail}</span>
          </p>
        </div>
        <button
          onClick={onNavigateToSettings}
          aria-label="Settings"
          className="mt-1 p-2 rounded-xl text-nook-ink/40 hover:text-nook-ink/70 hover:bg-nook-ink/5 transition-colors"
        >
          <Settings size={22} />
        </button>
      </div>

      {/* Submissions list */}
      <div className="px-6 space-y-3">
        {loading ? (
          <div className="py-20 text-center opacity-40">
            <p className="font-bold animate-pulse">Loading your submissions...</p>
          </div>
        ) : visible.length === 0 && hiddenCount === 0 ? (
          <div className="py-20 text-center space-y-2 opacity-40">
            <p className="text-4xl">📨</p>
            <p className="font-bold">No tasks submitted yet.</p>
            <p className="text-sm">Tap + to add your first task.</p>
          </div>
        ) : visible.length === 0 && hiddenCount > 0 ? (
          // All items are dismissed
          <div className="py-20 text-center space-y-3">
            <p className="text-4xl opacity-40">🙈</p>
            <p className="font-bold text-nook-ink/40">All caught up.</p>
            <button
              onClick={handleRevealAll}
              className="text-sm font-bold text-nook-orange hover:underline"
            >
              Show {hiddenCount} hidden {hiddenCount === 1 ? 'item' : 'items'}
            </button>
          </div>
        ) : (
          <>
            <AnimatePresence mode="popLayout">
              {visible.map(item => (
                <SubmissionRow
                  key={item.id}
                  item={item}
                  taskStatus={taskStatuses.get(item.id)}
                  onDelete={() => handleDelete(item)}
                  onDismiss={() => handleDismiss(item.id)}
                />
              ))}
            </AnimatePresence>

            {/* Hidden items footer */}
            {hiddenCount > 0 && (
              <div className="pt-2 text-center">
                <button
                  onClick={handleRevealAll}
                  className="text-xs font-bold text-nook-ink/30 hover:text-nook-orange transition-colors"
                >
                  {hiddenCount} hidden · Reveal
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      <Button
        className="fixed bottom-24 right-6 w-14 h-14 rounded-2xl shadow-xl z-40"
        onClick={() => setIsFormOpen(true)}
        aria-label="Add task"
      >
        <Plus size={32} />
      </Button>

      {/* Submit modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title="New Task"
      >
        <SubmitForm
          ownerEmail={ownerEmail}
          onSubmit={handleSubmit}
          onClose={() => setIsFormOpen(false)}
        />
      </Modal>
    </div>
  );
};
