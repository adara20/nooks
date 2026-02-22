import { describe, it, expect } from 'vitest';
import { generateNudges } from './nudgeService';
import { createTask } from '../tests/factories';

describe('generateNudges', () => {
  it('returns a praise nudge when there are no active tasks', () => {
    const nudges = generateNudges([]);
    expect(nudges).toHaveLength(1);
    expect(nudges[0].type).toBe('praise');
  });

  it('returns an urgent nudge when there are urgent+important tasks', () => {
    const tasks = [createTask({ isUrgent: true, isImportant: true, status: 'todo' })];
    const nudges = generateNudges(tasks);
    const urgentNudge = nudges.find(n => n.id === 'urgent-important');
    expect(urgentNudge).toBeDefined();
    expect(urgentNudge?.type).toBe('urgent');
  });

  it('returns an important nudge when there are important but not urgent tasks', () => {
    const tasks = [createTask({ isUrgent: false, isImportant: true, status: 'todo' })];
    const nudges = generateNudges(tasks);
    const importantNudge = nudges.find(n => n.id === 'important-not-urgent');
    expect(importantNudge).toBeDefined();
    expect(importantNudge?.type).toBe('important');
  });

  it('returns an overwhelmed nudge when there are more than 8 active tasks', () => {
    const tasks = Array.from({ length: 9 }, () => createTask({ status: 'todo' }));
    const nudges = generateNudges(tasks);
    const overwhelmedNudge = nudges.find(n => n.id === 'overwhelmed');
    expect(overwhelmedNudge).toBeDefined();
  });

  it('does not count done tasks as active — returns praise when only done tasks exist', () => {
    const tasks = [
      createTask({ status: 'done' }),
      createTask({ status: 'done' }),
    ];
    const nudges = generateNudges(tasks);
    expect(nudges[0].type).toBe('praise');
  });

  it('returns a backlog nudge when active list is empty but backlog has items', () => {
    const tasks = [createTask({ status: 'backlog' })];
    const nudges = generateNudges(tasks);
    expect(nudges[0].id).toBe('backlog-nudge');
  });

  it('returns a backlog-heavy nudge when more than 5 tasks are in backlog alongside active tasks', () => {
    const activeTasks = [createTask({ status: 'todo' })];
    const backlogTasks = Array.from({ length: 6 }, () => createTask({ status: 'backlog' }));
    const nudges = generateNudges([...activeTasks, ...backlogTasks]);
    const backlogHeavyNudge = nudges.find(n => n.id === 'backlog-heavy');
    expect(backlogHeavyNudge).toBeDefined();
    expect(backlogHeavyNudge?.type).toBe('gentle');
  });

  it('does not show backlog-heavy nudge when backlog has 5 or fewer tasks', () => {
    const activeTasks = [createTask({ status: 'todo' })];
    const backlogTasks = Array.from({ length: 5 }, () => createTask({ status: 'backlog' }));
    const nudges = generateNudges([...activeTasks, ...backlogTasks]);
    expect(nudges.find(n => n.id === 'backlog-heavy')).toBeUndefined();
  });

  it('returns a light-load nudge when there are 1-2 active tasks', () => {
    const tasks = [createTask({ status: 'todo' }), createTask({ status: 'in-progress' })];
    const nudges = generateNudges(tasks);
    const lightLoadNudge = nudges.find(n => n.id === 'light-load');
    expect(lightLoadNudge).toBeDefined();
    expect(lightLoadNudge?.type).toBe('praise');
  });

  it('does not return light-load nudge when there are 3 or more active tasks', () => {
    const tasks = Array.from({ length: 3 }, () => createTask({ status: 'todo' }));
    const nudges = generateNudges(tasks);
    expect(nudges.find(n => n.id === 'light-load')).toBeUndefined();
  });
});
