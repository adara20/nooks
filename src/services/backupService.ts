import { type Bucket, type Task } from '../db';

export interface NooksBackup {
  version: number;
  exportedAt: string;
  buckets: Bucket[];
  tasks: Task[];
}

const LAST_EXPORT_KEY = 'nooks_last_export';

// ─── Export ──────────────────────────────────────────────────────────────────

export function exportData(buckets: Bucket[], tasks: Task[]): string {
  const backup: NooksBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    buckets,
    tasks,
  };
  return JSON.stringify(backup, null, 2);
}

export function triggerDownload(jsonString: string, filename: string): void {
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getExportFilename(): string {
  const date = new Date().toISOString().split('T')[0];
  return `nooks-backup-${date}.json`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateBackup(parsed: unknown): parsed is NooksBackup {
  if (!parsed || typeof parsed !== 'object') return false;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.version !== 'number') return false;
  if (typeof obj.exportedAt !== 'string') return false;
  if (!Array.isArray(obj.buckets)) return false;
  if (!Array.isArray(obj.tasks)) return false;
  return true;
}

// ─── Merge ────────────────────────────────────────────────────────────────────

export interface MergeResult {
  buckets: Omit<Bucket, 'id'>[];
  tasks: Omit<Task, 'id'>[];
}

export function mergeData(
  existing: { buckets: Bucket[]; tasks: Task[] },
  incoming: { buckets: Bucket[]; tasks: Task[] }
): MergeResult {
  // Find buckets from incoming that don't exist in existing (case-insensitive name match)
  const existingBucketNames = new Set(
    existing.buckets.map(b => b.name.toLowerCase())
  );
  const newBuckets = incoming.buckets.filter(
    b => !existingBucketNames.has(b.name.toLowerCase())
  );

  // Build a combined name→bucket map for task deduplication
  // Prefer existing bucket IDs, fall back to incoming
  const allBucketsByName = new Map<string, Bucket>();
  for (const b of existing.buckets) {
    allBucketsByName.set(b.name.toLowerCase(), b);
  }
  for (const b of incoming.buckets) {
    if (!allBucketsByName.has(b.name.toLowerCase())) {
      allBucketsByName.set(b.name.toLowerCase(), b);
    }
  }

  // Build a set of existing task signatures: "title::bucketName"
  const existingTaskSigs = new Set<string>();
  for (const t of existing.tasks) {
    const bucket = existing.buckets.find(b => b.id === t.bucketId);
    const bucketName = bucket ? bucket.name.toLowerCase() : '__none__';
    existingTaskSigs.add(`${t.title.toLowerCase()}::${bucketName}`);
  }

  // Find tasks from incoming that don't match an existing signature
  const newTasks = incoming.tasks.filter(t => {
    const bucket = incoming.buckets.find(b => b.id === t.bucketId);
    const bucketName = bucket ? bucket.name.toLowerCase() : '__none__';
    return !existingTaskSigs.has(`${t.title.toLowerCase()}::${bucketName}`);
  });

  // Strip IDs so the repository can assign new ones on insert
  const bucketsToInsert: Omit<Bucket, 'id'>[] = newBuckets.map(({ id: _id, ...rest }) => rest);
  const tasksToInsert: Omit<Task, 'id'>[] = newTasks.map(({ id: _id, ...rest }) => rest);

  return { buckets: bucketsToInsert, tasks: tasksToInsert };
}

// ─── localStorage helpers ─────────────────────────────────────────────────────

export function getLastExportDate(): Date | null {
  const stored = localStorage.getItem(LAST_EXPORT_KEY);
  if (!stored) return null;
  const date = new Date(stored);
  if (isNaN(date.getTime())) return null;
  return date;
}

export function setLastExportDate(): void {
  localStorage.setItem(LAST_EXPORT_KEY, new Date().toISOString());
}
