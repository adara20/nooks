import { type Task } from '../db';

export interface Nudge {
  id: string;
  message: string;
  type: 'urgent' | 'important' | 'praise' | 'gentle';
}

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

export function generateNudges(tasks: Task[], lastExportDate: Date | null = null, isSignedIn = false): Nudge[] {
  const nudges: Nudge[] = [];
  const activeTasks = tasks.filter(t => t.status !== 'done' && t.status !== 'backlog');
  const backlogTasks = tasks.filter(t => t.status === 'backlog');
  
  if (activeTasks.length === 0) {
    if (backlogTasks.length > 0) {
      nudges.push({
        id: 'backlog-nudge',
        message: `Your active list is empty, but you've got ${backlogTasks.length} task(s) in your backlog. Ready to pull one in?`,
        type: 'important'
      });
    } else {
      nudges.push({
        id: 'empty',
        message: "Your plate is clean! Time to find a new nook to explore?",
        type: 'praise'
      });
    }
    return nudges;
  }

  const urgentImportant = activeTasks.filter(t => t.isUrgent && t.isImportant);
  const importantNotUrgent = activeTasks.filter(t => !t.isUrgent && t.isImportant);
  const tooManyTasks = activeTasks.length > 8;

  if (urgentImportant.length > 0) {
    nudges.push({
      id: 'urgent-important',
      message: `You've got ${urgentImportant.length} fire(s) to put out. Let's handle those first.`,
      type: 'urgent'
    });
  }

  if (backlogTasks.length > 5) {
    nudges.push({
      id: 'backlog-heavy',
      message: "Your backlog is getting a bit dusty. Maybe clear some space or pull something in?",
      type: 'gentle'
    });
  }

  if (importantNotUrgent.length > 0) {
    nudges.push({
      id: 'important-not-urgent',
      message: "You haven't touched any important, non-urgent tasks in a while. Lock in.",
      type: 'important'
    });
  }

  if (tooManyTasks) {
    nudges.push({
      id: 'overwhelmed',
      message: "You've got a lot on your plate right now. Maybe finish something first?",
      type: 'gentle'
    });
  }

  if (activeTasks.length < 3 && activeTasks.length > 0) {
    nudges.push({
      id: 'light-load',
      message: "Looking good! Just a few bits left to tidy up.",
      type: 'praise'
    });
  }

  const backupOverdue =
    !isSignedIn &&
    (lastExportDate === null ||
      Date.now() - lastExportDate.getTime() >= THREE_DAYS_MS);

  if (backupOverdue) {
    const message =
      lastExportDate === null
        ? "No backup yet. Head to Settings to save a copy of your nooks."
        : `Your last backup was a while ago. Worth saving a fresh copy.`;
    nudges.push({
      id: 'backup-overdue',
      message,
      type: 'gentle',
    });
  }

  return nudges;
}
