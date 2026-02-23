import { db, type Bucket, type Task, type TaskStatus } from '../db';
import {
  syncUpsertTask,
  syncDeleteTask,
  syncUpsertBucket,
  syncDeleteBucket,
} from './firebaseService';

class Repository {
  // ─── Buckets ───────────────────────────────────────────────────────────────

  async getAllBuckets(): Promise<Bucket[]> {
    return await db.buckets.toArray();
  }

  async addBucket(bucket: Omit<Bucket, 'id' | 'createdAt'>): Promise<number> {
    const id = await db.buckets.add({ ...bucket, createdAt: new Date() });
    const saved = await db.buckets.get(id);
    if (saved) { try { await syncUpsertBucket(saved); } catch (e) { console.warn("[repository] syncUpsertBucket failed:", e); } }
    return id;
  }

  async updateBucket(id: number, updates: Partial<Bucket>): Promise<void> {
    await db.buckets.update(id, updates);
    const saved = await db.buckets.get(id);
    if (saved) { try { await syncUpsertBucket(saved); } catch (e) { console.warn("[repository] syncUpsertBucket failed:", e); } }
  }

  async deleteBucket(id: number): Promise<void> {
    await db.transaction('rw', db.buckets, db.tasks, async () => {
      await db.buckets.delete(id);
      await db.tasks.where('bucketId').equals(id).modify({ bucketId: undefined });
    });
    try { await syncDeleteBucket(id); } catch (e) { console.warn("[repository] syncDeleteBucket failed:", e); }
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  async getAllTasks(): Promise<Task[]> {
    return await db.tasks.toArray();
  }

  async getTasksByBucket(bucketId: number): Promise<Task[]> {
    return await db.tasks.where('bucketId').equals(bucketId).toArray();
  }

  async addTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<number> {
    const id = await db.tasks.add({ ...task, createdAt: new Date() });
    const saved = await db.tasks.get(id);
    if (saved) { try { await syncUpsertTask(saved); } catch (e) { console.warn("[repository] syncUpsertTask failed:", e); } }
    return id;
  }

  async updateTask(id: number, updates: Partial<Task>): Promise<void> {
    if (updates.status === 'done' && !updates.completedAt) {
      updates.completedAt = new Date();
    } else if (updates.status && updates.status !== 'done') {
      updates.completedAt = undefined;
    }
    await db.tasks.update(id, updates);
    const saved = await db.tasks.get(id);
    if (saved) { try { await syncUpsertTask(saved); } catch (e) { console.warn("[repository] syncUpsertTask failed:", e); } }
  }

  async deleteTask(id: number): Promise<void> {
    await db.tasks.delete(id);
    try { await syncDeleteTask(id); } catch (e) { console.warn("[repository] syncDeleteTask failed:", e); }
  }

  // ─── Seed data ─────────────────────────────────────────────────────────────

  async seedIfEmpty() {
    const bucketCount = await db.buckets.count();
    if (bucketCount === 0) {
      const personalId = await this.addBucket({ name: 'Personal', emoji: '🏠' });
      const errandsId = await this.addBucket({ name: 'Errands', emoji: '🛒' });
      const learningId = await this.addBucket({ name: 'Learning', emoji: '📚' });

      await this.addTask({
        title: 'Water the plants',
        bucketId: personalId,
        status: 'todo',
        isUrgent: true,
        isImportant: true,
        details: "Don't forget the ferns in the corner.",
      });

      await this.addTask({
        title: 'Buy groceries',
        bucketId: errandsId,
        status: 'in-progress',
        isUrgent: false,
        isImportant: true,
        dueDate: new Date(),
      });

      await this.addTask({
        title: 'Read 10 pages of a book',
        bucketId: learningId,
        status: 'todo',
        isUrgent: false,
        isImportant: false,
      });
    }
  }
}

export const repository = new Repository();
