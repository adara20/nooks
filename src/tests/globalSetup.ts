import { IDBFactory } from 'fake-indexeddb';

// This runs once before all test files are loaded.
// We must install fake-indexeddb globally BEFORE any Dexie module is imported.
export default function setup() {
  (globalThis as any).indexedDB = new IDBFactory();
}
