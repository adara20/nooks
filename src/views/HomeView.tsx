import React, { useState, useEffect, useCallback } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { repository } from '../services/repository';
import { generateNudges } from '../services/nudgeService';
import { getLastExportDate } from '../services/backupService';
import { useAuth } from '../context/AuthContext';
import { getPendingInboxCount, getAppMode } from '../services/contributorService';
import { Card } from '../components/Card';
import { PullToRefreshIndicator } from '../components/PullToRefreshIndicator';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { motion } from 'motion/react';
import { Sparkles, Flame, Info, CheckCircle2, Settings } from 'lucide-react';
import { cn } from '../utils/cn';

interface HomeViewProps {
  onNavigateToTasks: (status: string | null) => void;
  onNavigateToSettings: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ onNavigateToTasks, onNavigateToSettings }) => {
  const tasks = useLiveQuery(() => repository.getAllTasks());
  const buckets = useLiveQuery(() => repository.getAllBuckets());
  const { isSignedIn, user } = useAuth();
  const [pendingInboxCount, setPendingInboxCount] = useState(0);

  // Extracted so it can be called both on mount and on pull-to-refresh
  const fetchInboxCount = useCallback(async () => {
    if (!isSignedIn || !user || getAppMode() !== 'owner') return;
    try {
      setPendingInboxCount(await getPendingInboxCount(user.uid));
    } catch {
      // fire-and-forget — never crash the home view
    }
  }, [isSignedIn, user]);

  useEffect(() => { fetchInboxCount(); }, [fetchInboxCount]);

  const { pullDistance, isRefreshing } = usePullToRefresh({
    onRefresh: fetchInboxCount,
    // Only enable when the owner is signed in — contributors have their own view
    disabled: !isSignedIn || getAppMode() !== 'owner',
  });

  if (!tasks || !buckets) return null;

  const nudges = generateNudges(tasks, getLastExportDate(), isSignedIn, pendingInboxCount);
  const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'backlog');
  const doneTasks = tasks.filter(t => t.status === 'done');
  const inProgressTasks = tasks.filter(t => t.status === 'in-progress');
  const backlogTasks = tasks.filter(t => t.status === 'backlog');

  const getNudgeIcon = (type: string) => {
    switch (type) {
      case 'urgent': return <Flame className="text-red-500" size={24} />;
      case 'important': return <Sparkles className="text-nook-orange" size={24} />;
      case 'praise': return <CheckCircle2 className="text-nook-leaf" size={24} />;
      default: return <Info className="text-blue-500" size={24} />;
    }
  };

  const getNudgeStyles = (type: string) => {
    switch (type) {
      case 'urgent': return 'bg-red-50 border-red-100';
      case 'important': return 'bg-orange-50 border-orange-100';
      case 'praise': return 'bg-green-50 border-green-100';
      default: return 'bg-blue-50 border-blue-100';
    }
  };

  return (
    <div className="p-6 pb-32 space-y-8 safe-top">
      <PullToRefreshIndicator pullDistance={pullDistance} isRefreshing={isRefreshing} />
      <header className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-4xl font-display font-bold text-nook-ink">Hey there.</h1>
          <p className="text-nook-ink/60 font-medium">Let's find some nooks to fill.</p>
        </div>
        <button
          onClick={onNavigateToSettings}
          aria-label="Settings"
          className="mt-1 p-2 rounded-xl text-nook-ink/40 hover:text-nook-ink/70 hover:bg-nook-ink/5 transition-colors"
        >
          <Settings size={22} />
        </button>
      </header>

      <section className="space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-nook-ink/40 px-1">Nudges</h2>
        <div className="space-y-4">
          {nudges.map((nudge, idx) => (
            <motion.div
              key={nudge.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.1 }}
            >
              <Card
                onClick={() => {
                  if (nudge.id === 'backup-overdue') onNavigateToSettings();
                  else if (nudge.id === 'inbox-pending') onNavigateToTasks('inbox');
                  else if (nudge.id === 'urgent-important') onNavigateToTasks('urgent-important');
                  else if (nudge.id === 'important-not-urgent') onNavigateToTasks('important-not-urgent');
                  else if (nudge.id === 'backlog-nudge' || nudge.id === 'backlog-heavy') onNavigateToTasks('backlog');
                  else onNavigateToTasks('active');
                }}
                className={cn("flex items-start gap-4 border-2", getNudgeStyles(nudge.type))}
              >
                <div className="mt-1">{getNudgeIcon(nudge.type)}</div>
                <p className="text-lg font-medium leading-tight text-nook-ink">{nudge.message}</p>
              </Card>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4">
        <Card
          onClick={() => onNavigateToTasks('active')}
          className="bg-nook-orange text-white border-none flex flex-col justify-between h-32"
        >
          <span className="text-xs font-bold uppercase tracking-widest opacity-80">Active</span>
          <span className="text-5xl font-display font-bold">{activeTasks.length}</span>
        </Card>
        <Card
          onClick={() => onNavigateToTasks('done')}
          className="bg-nook-leaf text-white border-none flex flex-col justify-between h-32"
        >
          <span className="text-xs font-bold uppercase tracking-widest opacity-80">Done</span>
          <span className="text-5xl font-display font-bold">{doneTasks.length}</span>
        </Card>
        <Card
          onClick={() => onNavigateToTasks('in-progress')}
          className="bg-nook-sand text-nook-ink border-none flex flex-col justify-between h-32"
        >
          <span className="text-xs font-bold uppercase tracking-widest opacity-60">In Progress</span>
          <span className="text-5xl font-display font-bold">{inProgressTasks.length}</span>
        </Card>
        <Card
          onClick={() => onNavigateToTasks('backlog')}
          className="bg-nook-clay text-white border-none flex flex-col justify-between h-32"
        >
          <span className="text-xs font-bold uppercase tracking-widest opacity-80">Backlog</span>
          <span className="text-5xl font-display font-bold">{backlogTasks.length}</span>
        </Card>
      </section>
    </div>
  );
};
