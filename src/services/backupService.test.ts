import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  exportData,
  validateBackup,
  mergeData,
  getLastExportDate,
  setLastExportDate,
  getExportFilename,
  triggerDownload,
  type NooksBackup,
} from './backupService';
import { createBucket, createTask } from '../tests/factories';

// ─── exportData ───────────────────────────────────────────────────────────────

describe('exportData', () => {
  it('returns a valid JSON string', () => {
    const result = exportData([], []);
    expect(() => JSON.parse(result)).not.toThrow();
  });

  it('includes version: 1', () => {
    const parsed = JSON.parse(exportData([], []));
    expect(parsed.version).toBe(1);
  });

  it('includes exportedAt as an ISO string', () => {
    const parsed = JSON.parse(exportData([], []));
    expect(typeof parsed.exportedAt).toBe('string');
    expect(new Date(parsed.exportedAt).toISOString()).toBe(parsed.exportedAt);
  });

  it('includes all provided buckets', () => {
    const buckets = [createBucket({ name: 'Work' }), createBucket({ name: 'Personal' })];
    const parsed = JSON.parse(exportData(buckets, []));
    expect(parsed.buckets).toHaveLength(2);
    expect(parsed.buckets[0].name).toBe('Work');
    expect(parsed.buckets[1].name).toBe('Personal');
  });

  it('includes all provided tasks', () => {
    const tasks = [createTask({ title: 'Buy milk' }), createTask({ title: 'Call mum' })];
    const parsed = JSON.parse(exportData([], tasks));
    expect(parsed.tasks).toHaveLength(2);
    expect(parsed.tasks[0].title).toBe('Buy milk');
  });

  it('includes tasks with all statuses including done', () => {
    const tasks = [
      createTask({ status: 'todo' }),
      createTask({ status: 'done' }),
      createTask({ status: 'in-progress' }),
      createTask({ status: 'backlog' }),
    ];
    const parsed = JSON.parse(exportData([], tasks));
    expect(parsed.tasks).toHaveLength(4);
  });
});

// ─── getExportFilename ────────────────────────────────────────────────────────

describe('getExportFilename', () => {
  it('returns a filename starting with nooks-backup-', () => {
    expect(getExportFilename()).toMatch(/^nooks-backup-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

// ─── triggerDownload ──────────────────────────────────────────────────────────

describe('triggerDownload', () => {
  it('creates and clicks an anchor element with correct attributes', () => {
    const mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(mockAnchor as unknown as HTMLElement);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as unknown as HTMLElement);
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as unknown as HTMLElement);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    triggerDownload('{"test":true}', 'test-backup.json');

    expect(mockAnchor.download).toBe('test-backup.json');
    expect(mockAnchor.click).toHaveBeenCalledOnce();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');

    vi.restoreAllMocks();
  });
});

// ─── validateBackup ───────────────────────────────────────────────────────────

describe('validateBackup', () => {
  const validBackup: NooksBackup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    buckets: [],
    tasks: [],
  };

  it('returns true for a valid backup object', () => {
    expect(validateBackup(validBackup)).toBe(true);
  });

  it('returns false for null', () => {
    expect(validateBackup(null)).toBe(false);
  });

  it('returns false for a non-object', () => {
    expect(validateBackup('string')).toBe(false);
    expect(validateBackup(42)).toBe(false);
    expect(validateBackup(undefined)).toBe(false);
  });

  it('returns false when version is missing', () => {
    const { version: _v, ...noVersion } = validBackup;
    expect(validateBackup(noVersion)).toBe(false);
  });

  it('returns false when version is not a number', () => {
    expect(validateBackup({ ...validBackup, version: '1' })).toBe(false);
  });

  it('returns false when exportedAt is missing', () => {
    const { exportedAt: _e, ...noExportedAt } = validBackup;
    expect(validateBackup(noExportedAt)).toBe(false);
  });

  it('returns false when buckets is missing', () => {
    const { buckets: _b, ...noBuckets } = validBackup;
    expect(validateBackup(noBuckets)).toBe(false);
  });

  it('returns false when tasks is missing', () => {
    const { tasks: _t, ...noTasks } = validBackup;
    expect(validateBackup(noTasks)).toBe(false);
  });

  it('returns false when buckets is not an array', () => {
    expect(validateBackup({ ...validBackup, buckets: {} })).toBe(false);
  });

  it('returns false when tasks is not an array', () => {
    expect(validateBackup({ ...validBackup, tasks: 'bad' })).toBe(false);
  });
});

// ─── mergeData ────────────────────────────────────────────────────────────────

describe('mergeData', () => {
  it('returns all incoming buckets when existing is empty', () => {
    const incoming = { buckets: [createBucket({ name: 'Work' })], tasks: [] };
    const result = mergeData({ buckets: [], tasks: [] }, incoming);
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0].name).toBe('Work');
  });

  it('skips incoming buckets with same name as existing (case-insensitive)', () => {
    const existing = { buckets: [createBucket({ name: 'Work' })], tasks: [] };
    const incoming = { buckets: [createBucket({ name: 'work' })], tasks: [] };
    const result = mergeData(existing, incoming);
    expect(result.buckets).toHaveLength(0);
  });

  it('adds genuinely new incoming buckets', () => {
    const existing = { buckets: [createBucket({ name: 'Work' })], tasks: [] };
    const incoming = {
      buckets: [createBucket({ name: 'Work' }), createBucket({ name: 'Personal' })],
      tasks: [],
    };
    const result = mergeData(existing, incoming);
    expect(result.buckets).toHaveLength(1);
    expect(result.buckets[0].name).toBe('Personal');
  });

  it('returns all incoming tasks when existing is empty', () => {
    const bucket = createBucket({ id: 1, name: 'Work' });
    const task = createTask({ title: 'Write report', bucketId: 1 });
    const result = mergeData(
      { buckets: [], tasks: [] },
      { buckets: [bucket], tasks: [task] }
    );
    expect(result.tasks).toHaveLength(1);
  });

  it('skips duplicate tasks — same title and same bucket name', () => {
    const existingBucket = createBucket({ id: 1, name: 'Work' });
    const existingTask = createTask({ title: 'Write report', bucketId: 1 });
    const incomingBucket = createBucket({ id: 99, name: 'Work' });
    const incomingTask = createTask({ title: 'Write report', bucketId: 99 });

    const result = mergeData(
      { buckets: [existingBucket], tasks: [existingTask] },
      { buckets: [incomingBucket], tasks: [incomingTask] }
    );
    expect(result.tasks).toHaveLength(0);
  });

  it('adds tasks with same title but different bucket', () => {
    const bucketA = createBucket({ id: 1, name: 'Work' });
    const bucketB = createBucket({ id: 2, name: 'Personal' });
    const existingTask = createTask({ title: 'Buy stuff', bucketId: 1 });
    const incomingTask = createTask({ title: 'Buy stuff', bucketId: 2 });

    const result = mergeData(
      { buckets: [bucketA, bucketB], tasks: [existingTask] },
      { buckets: [bucketA, bucketB], tasks: [incomingTask] }
    );
    expect(result.tasks).toHaveLength(1);
  });

  it('strips ids from returned buckets and tasks', () => {
    const incoming = {
      buckets: [createBucket({ id: 99, name: 'New' })],
      tasks: [createTask({ id: 88, title: 'New task' })],
    };
    const result = mergeData({ buckets: [], tasks: [] }, incoming);
    expect(result.buckets[0]).not.toHaveProperty('id');
    expect(result.tasks[0]).not.toHaveProperty('id');
  });

  it('does not mutate the existing data', () => {
    const existing = {
      buckets: [createBucket({ name: 'Work' })],
      tasks: [createTask({ title: 'Task 1' })],
    };
    const originalLength = existing.buckets.length;
    mergeData(existing, { buckets: [createBucket({ name: 'New' })], tasks: [] });
    expect(existing.buckets).toHaveLength(originalLength);
  });
});

// ─── localStorage helpers ─────────────────────────────────────────────────────

describe('getLastExportDate', () => {
  beforeEach(() => {
    localStorage.removeItem('nooks_last_export');
  });

  it('returns null when no export date is stored', () => {
    expect(getLastExportDate()).toBeNull();
  });

  it('returns a Date when a valid ISO string is stored', () => {
    const iso = '2024-06-15T10:00:00.000Z';
    localStorage.setItem('nooks_last_export', iso);
    const result = getLastExportDate();
    expect(result).toBeInstanceOf(Date);
    expect(result?.toISOString()).toBe(iso);
  });

  it('returns null when stored value is not a valid date', () => {
    localStorage.setItem('nooks_last_export', 'not-a-date');
    expect(getLastExportDate()).toBeNull();
  });
});

describe('setLastExportDate', () => {
  beforeEach(() => {
    localStorage.removeItem('nooks_last_export');
  });

  it('stores an ISO string in localStorage', () => {
    setLastExportDate();
    const stored = localStorage.getItem('nooks_last_export');
    expect(stored).not.toBeNull();
    expect(new Date(stored!).toISOString()).toBe(stored);
  });

  it('updates the stored date on subsequent calls', async () => {
    setLastExportDate();
    const first = localStorage.getItem('nooks_last_export');
    await new Promise(r => setTimeout(r, 5));
    setLastExportDate();
    const second = localStorage.getItem('nooks_last_export');
    expect(second).not.toBe(first);
  });
});
