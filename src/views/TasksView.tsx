import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { repository } from '../services/repository';
import { type Task, type Bucket, type TaskStatus } from '../db';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Modal } from '../components/Modal';
import { Plus, LayoutGrid, List, Settings2, Trash2, ChevronRight, AlertCircle, Star, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { format } from 'date-fns';
import { cn } from '../utils/cn';
import {
  type InboxItem,
  fetchPendingInboxItems,
  acceptInboxItem,
  declineInboxItem,
} from '../services/contributorService';
import { useAuth } from '../context/AuthContext';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator';

interface TasksViewProps {
  initialStatusFilter?: string | null;
  onClearFilter?: () => void;
  onFilterChange?: (filter: string | null) => void;
}

export const TasksView: React.FC<TasksViewProps> = ({ initialStatusFilter, onClearFilter, onFilterChange }) => {
  const tasks = useLiveQuery(() => repository.getAllTasks());
  const buckets = useLiveQuery(() => repository.getAllBuckets());
  const { user } = useAuth();

  const [viewMode, setViewMode] = useState<'list' | 'quadrant'>('list');
  const [selectedBucketId, setSelectedBucketId] = useState<number | null>(null);
  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [isBucketModalOpen, setIsBucketModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);

  // 'inbox' is a virtual filter — it renders contributor inbox items instead of local tasks.
  const isInboxView = initialStatusFilter === 'inbox';

  // Fetch pending inbox items from Firestore when the inbox view is active.
  // Items live in users/{ownerUID}/inbox and are not stored in local IndexedDB.
  const userUid = user?.uid;

  // Extracted so it can be called both on mount and on pull-to-refresh
  const fetchInbox = useCallback(async () => {
    if (!isInboxView || !userUid) return;
    setInboxLoading(true);
    try {
      setInboxItems(await fetchPendingInboxItems(userUid));
    } catch {
      setInboxItems([]);
    } finally {
      setInboxLoading(false);
    }
  }, [isInboxView, userUid]);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  const { pullDistance, isRefreshing } = usePullToRefresh({
    onRefresh: fetchInbox,
    // Only active in the inbox view — the normal task list is live via useLiveQuery
    disabled: !isInboxView,
  });

  if (!tasks || !buckets) return null;

  const getFilteredTasks = () => {
    // Inbox items are fetched from Firestore, not the local DB
    if (isInboxView) return [];

    let baseTasks = tasks;

    if (initialStatusFilter === 'active') {
      baseTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'backlog');
    } else if (initialStatusFilter === 'done') {
      baseTasks = tasks.filter(t => t.status === 'done');
    } else if (initialStatusFilter === 'in-progress') {
      baseTasks = tasks.filter(t => t.status === 'in-progress');
    } else if (initialStatusFilter === 'backlog') {
      baseTasks = tasks.filter(t => t.status === 'backlog');
    } else if (initialStatusFilter === 'urgent-important') {
      baseTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'backlog' && t.isUrgent && t.isImportant);
    } else if (initialStatusFilter === 'important-not-urgent') {
      baseTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'backlog' && !t.isUrgent && t.isImportant);
    } else {
      // Default behavior: hide done and backlog tasks unless explicitly filtered
      baseTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'backlog');
    }

    if (selectedBucketId) {
      baseTasks = baseTasks.filter(t => t.bucketId === selectedBucketId);
    }

    return baseTasks;
  };

  const filteredTasks = getFilteredTasks();

  const getInitialStatusForFilter = (): TaskStatus => {
    if (initialStatusFilter === 'backlog') return 'backlog';
    if (initialStatusFilter === 'in-progress') return 'in-progress';
    return 'todo';
  };

  const handleToggleStatus = async (task: Task) => {
    const nextStatus: TaskStatus = task.status === 'todo' ? 'in-progress' : 'done';
    await repository.updateTask(task.id!, { status: nextStatus });
  };

  /**
   * Accept a contributor's inbox submission:
   *  1. Create a local Dexie task (preserving contributorUID so the contributor
   *     can read live status via the Firestore security rule).
   *  2. Mark the inbox item as 'accepted' in Firestore and record the new taskId
   *     so the contributor can poll its status later.
   *  3. Remove the item from the local inbox list.
   */
  const handleAcceptInboxItem = async (item: InboxItem) => {
    if (!user) return;
    const taskId = await repository.addTask({
      title: item.title,
      details: item.details,
      isUrgent: item.isUrgent,
      isImportant: item.isImportant,
      dueDate: item.dueDate,
      status: 'todo',
      contributorUID: item.contributorUID, // stored so Firestore rule can grant contributor read access
    });
    await acceptInboxItem(user.uid, item.id, taskId);
    setInboxItems(prev => prev.filter(i => i.id !== item.id));
  };

  /** Decline a contributor inbox item and remove it from the local list. */
  const handleDeclineInboxItem = async (item: InboxItem) => {
    if (!user) return;
    await declineInboxItem(user.uid, item.id);
    setInboxItems(prev => prev.filter(i => i.id !== item.id));
  };

  return (
    <div className="pb-32">
      {/* Pull-to-refresh indicator — only shown in inbox view */}
      {isInboxView && (
        <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      )}
      {/* Top Bar */}
      <div className="sticky top-0 bg-warm-bg/80 backdrop-blur-md z-30 px-6 pt-8 pb-4 space-y-4 safe-top">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-display font-bold text-nook-ink">Tasks</h1>
          <div className="flex gap-2">
            <Button 
              variant="secondary" 
              size="icon" 
              onClick={() => setViewMode(viewMode === 'list' ? 'quadrant' : 'list')}
            >
              {viewMode === 'list' ? <LayoutGrid size={20} /> : <List size={20} />}
            </Button>
            <Button variant="secondary" size="icon" onClick={() => setIsBucketModalOpen(true)}>
              <Settings2 size={20} />
            </Button>
          </div>
        </div>

        {/* Bucket Filter */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
          {initialStatusFilter && (
            <button
              onClick={onClearFilter}
              className="px-4 py-2 rounded-full text-sm font-bold bg-nook-ink text-white flex items-center gap-2 whitespace-nowrap"
            >
              <span className="capitalize">{initialStatusFilter.replace(/-/g, ' ')}</span>
              <X size={14} />
            </button>
          )}
          <button
            onClick={() => setSelectedBucketId(null)}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all",
              selectedBucketId === null && initialStatusFilter !== 'backlog' ? "bg-nook-orange text-white" : "bg-nook-sand text-nook-ink/60"
            )}
          >
            All Buckets
          </button>
          
          <button
            onClick={() => onFilterChange?.(initialStatusFilter === 'backlog' ? null : 'backlog')}
            className={cn(
              "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all",
              initialStatusFilter === 'backlog' ? "bg-nook-orange text-white" : "bg-nook-sand text-nook-ink/60"
            )}
          >
            Backlog
          </button>

          {buckets.map(bucket => (
            <button
              key={bucket.id}
              onClick={() => setSelectedBucketId(selectedBucketId === bucket.id ? null : bucket.id!)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2",
                selectedBucketId === bucket.id ? "bg-nook-orange text-white" : "bg-nook-sand text-nook-ink/60"
              )}
            >
              <span>{bucket.emoji}</span>
              <span>{bucket.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 mt-4">
        {isInboxView ? (
          <div className="space-y-3">
            {inboxLoading ? (
              <div className="py-20 text-center opacity-40">
                <p className="font-bold animate-pulse">Loading inbox...</p>
              </div>
            ) : inboxItems.length > 0 ? (
              <AnimatePresence mode="popLayout">
                {inboxItems.map(item => (
                  <InboxItemRow
                    key={item.id}
                    item={item}
                    onAccept={() => handleAcceptInboxItem(item)}
                    onDecline={() => handleDeclineInboxItem(item)}
                  />
                ))}
              </AnimatePresence>
            ) : (
              <div className="py-20 text-center space-y-2 opacity-40">
                <p className="text-4xl">💌</p>
                <p className="font-bold">No pending inbox tasks.</p>
              </div>
            )}
          </div>
        ) : viewMode === 'list' ? (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filteredTasks.length > 0 ? (
                filteredTasks.map(task => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    bucket={buckets.find(b => b.id === task.bucketId)}
                    onToggle={() => handleToggleStatus(task)}
                    onEdit={() => setEditingTask(task)}
                  />
                ))
              ) : (
                <div className="py-20 text-center space-y-2 opacity-40">
                  <p className="text-4xl">✨</p>
                  <p className="font-bold">Nothing here yet.</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <QuadrantView tasks={filteredTasks} onEdit={setEditingTask} />
        )}
      </div>

      {/* FAB — hidden in inbox view */}
      {!isInboxView && (
        <Button
          className="fixed bottom-24 right-6 w-14 h-14 rounded-2xl shadow-xl z-40"
          onClick={() => setIsNewTaskModalOpen(true)}
        >
          <Plus size={32} />
        </Button>
      )}

      {/* Modals */}
      <Modal 
        isOpen={isNewTaskModalOpen || !!editingTask} 
        onClose={() => {
          setIsNewTaskModalOpen(false);
          setEditingTask(null);
        }} 
        title={editingTask ? "Edit Task" : "New Task"}
      >
        <TaskForm
          buckets={buckets}
          initialTask={editingTask}
          initialStatus={editingTask ? undefined : getInitialStatusForFilter()}
          onClose={() => {
            setIsNewTaskModalOpen(false);
            setEditingTask(null);
          }}
        />
      </Modal>

      <Modal 
        isOpen={isBucketModalOpen} 
        onClose={() => setIsBucketModalOpen(false)} 
        title="Manage Buckets"
      >
        <BucketManager buckets={buckets} />
      </Modal>
    </div>
  );
};

const TaskItem: React.FC<{ 
  task: Task; 
  bucket?: Bucket; 
  onToggle: () => void;
  onEdit: () => void;
}> = ({ task, bucket, onToggle, onEdit }) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      <Card className="flex items-center gap-4 p-3" onClick={onEdit}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={cn(
            "w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all",
            task.status === 'in-progress' 
              ? "border-nook-orange bg-nook-orange/10 text-nook-orange" 
              : "border-nook-sand text-transparent"
          )}
        >
          {task.status === 'in-progress' && <div className="w-2 h-2 bg-nook-orange rounded-full animate-pulse" />}
        </button>
        
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-nook-ink truncate">{task.title}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs">{bucket?.emoji || '📁'}</span>
            {task.dueDate && (
              <span className="text-[10px] font-bold text-nook-ink/40 uppercase">
                {format(task.dueDate, 'MMM d')}
              </span>
            )}
            <div className="flex gap-1">
              {task.isUrgent && <AlertCircle size={12} className="text-red-500" />}
              {task.isImportant && <Star size={12} className="text-nook-orange" fill="currentColor" />}
            </div>
          </div>
        </div>
        
        <ChevronRight size={16} className="text-nook-sand" />
      </Card>
    </motion.div>
  );
};

const InboxItemRow: React.FC<{
  item: InboxItem;
  onAccept: () => void;
  onDecline: () => void;
}> = ({ item, onAccept, onDecline }) => {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
    >
      <Card className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-nook-ink">{item.title}</h3>
            {item.details && (
              <p className="text-sm text-nook-ink/60 mt-0.5 line-clamp-2">{item.details}</p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {item.isUrgent && <AlertCircle size={14} className="text-red-500" />}
            {item.isImportant && <Star size={14} className="text-nook-orange" fill="currentColor" />}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-bold text-nook-ink/40 uppercase tracking-wide">
          {item.dueDate && (
            <span>Due {format(item.dueDate, 'MMM d')}</span>
          )}
          <span className="truncate">From: {item.contributorEmail}</span>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={onDecline}
            aria-label="Decline"
            className="flex-1 py-2.5 rounded-xl text-sm font-bold border-2 border-nook-sand text-nook-ink/50 hover:border-red-300 hover:text-red-500 transition-all flex items-center justify-center gap-2"
          >
            <X size={16} />
            Decline
          </button>
          <button
            onClick={onAccept}
            aria-label="Accept"
            className="flex-[2] py-2.5 rounded-xl text-sm font-bold bg-nook-orange text-white flex items-center justify-center gap-2 hover:bg-nook-orange/90 transition-all"
          >
            <Check size={16} />
            Accept
          </button>
        </div>
      </Card>
    </motion.div>
  );
};

const QuadrantView: React.FC<{ tasks: Task[], onEdit: (t: Task) => void }> = ({ tasks, onEdit }) => {
  const quadrants = [
    { title: 'Urgent + Important', filter: (t: Task) => t.isUrgent && t.isImportant, color: 'bg-red-50' },
    { title: 'Important', filter: (t: Task) => !t.isUrgent && t.isImportant, color: 'bg-orange-50' },
    { title: 'Urgent', filter: (t: Task) => t.isUrgent && !t.isImportant, color: 'bg-blue-50' },
    { title: 'Neither', filter: (t: Task) => !t.isUrgent && !t.isImportant, color: 'bg-nook-sand/20' },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 h-[60vh]">
      {quadrants.map(q => (
        <div key={q.title} className={cn("rounded-2xl p-3 flex flex-col gap-2 overflow-hidden", q.color)}>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-nook-ink/40">{q.title}</h4>
          <div className="flex-1 overflow-y-auto space-y-2 no-scrollbar">
            {tasks.filter(q.filter).map(task => (
              <div 
                key={task.id} 
                onClick={() => onEdit(task)}
                className="bg-white p-2 rounded-xl shadow-sm text-xs font-bold text-nook-ink truncate"
              >
                {task.title}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const TaskForm: React.FC<{
  buckets: Bucket[];
  initialTask?: Task | null;
  initialStatus?: TaskStatus;
  onClose: () => void;
}> = ({ buckets, initialTask, initialStatus, onClose }) => {
  const [title, setTitle] = useState(initialTask?.title || '');
  const [details, setDetails] = useState(initialTask?.details || '');
  const [bucketId, setBucketId] = useState(initialTask?.bucketId || buckets[0]?.id || undefined);
  const [status, setStatus] = useState<TaskStatus>(initialTask?.status || initialStatus || 'todo');
  const [isUrgent, setIsUrgent] = useState(initialTask?.isUrgent || false);
  const [isImportant, setIsImportant] = useState(initialTask?.isImportant || false);
  const [dueDate, setDueDate] = useState(initialTask?.dueDate ? format(initialTask.dueDate, 'yyyy-MM-dd') : '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    const taskData = {
      title,
      details,
      bucketId: bucketId === 0 ? undefined : bucketId,
      isUrgent,
      isImportant,
      status,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    };

    if (initialTask) {
      await repository.updateTask(initialTask.id!, taskData);
    } else {
      await repository.addTask(taskData);
    }
    onClose();
  };

  const handleDelete = async () => {
    if (initialTask && confirm('Delete this task?')) {
      await repository.deleteTask(initialTask.id!);
      onClose();
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

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-bold uppercase tracking-widest text-nook-ink/40">Bucket</label>
          <select 
            className="w-full bg-nook-sand/30 rounded-xl p-3 text-sm font-bold focus:outline-none appearance-none"
            value={bucketId || 0}
            onChange={e => setBucketId(Number(e.target.value) || undefined)}
          >
            <option value={0}>No Bucket</option>
            {buckets.map(b => (
              <option key={b.id} value={b.id}>{b.emoji} {b.name}</option>
            ))}
          </select>
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
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-widest text-nook-ink/40">Status</label>
        <div className="flex gap-2">
          {(['todo', 'in-progress', 'backlog'] as TaskStatus[]).map(s => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "flex-1 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border-2",
                status === s ? "bg-nook-orange text-white border-nook-orange" : "bg-nook-sand/20 text-nook-ink/40 border-transparent"
              )}
            >
              {s.replace('-', ' ')}
            </button>
          ))}
        </div>
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

      <div className="flex gap-3 pt-4">
        {initialTask && (
          <Button type="button" variant="danger" size="lg" className="flex-1" onClick={handleDelete}>
            <Trash2 size={20} />
          </Button>
        )}
        <Button type="submit" className="flex-[3] py-4">
          {initialTask ? "Save Changes" : "Create Task"}
        </Button>
      </div>
    </form>
  );
};

const BucketManager: React.FC<{ buckets: Bucket[] }> = ({ buckets }) => {
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('📁');
  const [editingBucket, setEditingBucket] = useState<Bucket | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const emojis = ['🏠', '🛒', '📚', '💼', '🌱', '🎨', '🏃', '🍕', '✈️', '📁'];

  const handleAdd = async () => {
    if (!newName) return;
    await repository.addBucket({ name: newName, emoji: newEmoji });
    setNewName('');
    setIsAdding(false);
  };

  const handleUpdate = async () => {
    if (!editingBucket || !newName) return;
    await repository.updateBucket(editingBucket.id!, { name: newName, emoji: newEmoji });
    setEditingBucket(null);
    setNewName('');
  };

  const handleDelete = async (id: number) => {
    if (confirm('Delete this bucket? Tasks will be kept but unassigned.')) {
      await repository.deleteBucket(id);
    }
  };

  const startEditing = (bucket: Bucket) => {
    setEditingBucket(bucket);
    setNewName(bucket.name);
    setNewEmoji(bucket.emoji);
    setIsAdding(false);
  };

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {buckets.map(bucket => (
          <div key={bucket.id} className="flex items-center justify-between p-4 bg-nook-sand/20 rounded-2xl">
            <div className="flex items-center gap-3" onClick={() => startEditing(bucket)}>
              <span className="text-2xl">{bucket.emoji}</span>
              <span className="font-bold">{bucket.name}</span>
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" onClick={() => startEditing(bucket)}>
                <Settings2 size={18} className="text-nook-ink/40" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleDelete(bucket.id!)}>
                <Trash2 size={18} className="text-red-400" />
              </Button>
            </div>
          </div>
        ))}
      </div>

      {(isAdding || editingBucket) ? (
        <div className="p-4 bg-nook-sand/40 rounded-3xl space-y-4">
          <div className="flex gap-3">
            <div className="grid grid-cols-5 gap-2">
              {emojis.map(e => (
                <button 
                  key={e} 
                  onClick={() => setNewEmoji(e)}
                  className={cn("text-xl p-1 rounded-lg", newEmoji === e && "bg-nook-orange/20")}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
          <input
            autoFocus
            type="text"
            placeholder="Bucket name"
            className="w-full bg-white rounded-xl p-3 font-bold focus:outline-none"
            value={newName}
            onChange={e => setNewName(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => { setIsAdding(false); setEditingBucket(null); }}>Cancel</Button>
            <Button className="flex-1" onClick={editingBucket ? handleUpdate : handleAdd}>
              {editingBucket ? 'Update' : 'Add'}
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" className="w-full py-4 border-2 border-dashed border-nook-sand" onClick={() => setIsAdding(true)}>
          <Plus size={20} className="mr-2" /> Add New Bucket
        </Button>
      )}
    </div>
  );
};
