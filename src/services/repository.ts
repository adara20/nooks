import { db, type Bucket, type Task, type TaskStatus } from '../db';

class Repository {
  // Buckets
  async getAllBuckets(): Promise<Bucket[]> {
    return await db.buckets.toArray();
  }

  async addBucket(bucket: Omit<Bucket, 'id' | 'createdAt'>): Promise<number> {
    return await db.buckets.add({
      ...bucket,
      createdAt: new Date()
    });
  }

  async updateBucket(id: number, updates: Partial<Bucket>): Promise<void> {
    await db.buckets.update(id, updates);
  }

  async deleteBucket(id: number): Promise<void> {
    await db.transaction('rw', db.buckets, db.tasks, async () => {
      await db.buckets.delete(id);
      // Instead of deleting tasks, we just remove the bucketId
      await db.tasks.where('bucketId').equals(id).modify({ bucketId: undefined });
    });
  }

  // Tasks
  async getAllTasks(): Promise<Task[]> {
    return await db.tasks.toArray();
  }

  async getTasksByBucket(bucketId: number): Promise<Task[]> {
    return await db.tasks.where('bucketId').equals(bucketId).toArray();
  }

  async addTask(task: Omit<Task, 'id' | 'createdAt'>): Promise<number> {
    return await db.tasks.add({
      ...task,
      createdAt: new Date()
    });
  }

  async updateTask(id: number, updates: Partial<Task>): Promise<void> {
    if (updates.status === 'done' && !updates.completedAt) {
      updates.completedAt = new Date();
    } else if (updates.status && updates.status !== 'done') {
      updates.completedAt = undefined;
    }
    await db.tasks.update(id, updates);
  }

  async deleteTask(id: number): Promise<void> {
    await db.tasks.delete(id);
  }

  // Seed Data
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
        details: 'Don\'t forget the ferns in the corner.'
      });

      await this.addTask({
        title: 'Buy groceries',
        bucketId: errandsId,
        status: 'in-progress',
        isUrgent: false,
        isImportant: true,
        dueDate: new Date()
      });

      await this.addTask({
        title: 'Read 10 pages of a book',
        bucketId: learningId,
        status: 'todo',
        isUrgent: false,
        isImportant: false
      });
    }
  }
}

export const repository = new Repository();
