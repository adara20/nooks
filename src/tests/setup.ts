import '@testing-library/jest-dom';
// Auto-installs fake-indexeddb globally before any modules load.
// This ensures Dexie finds indexedDB available at import time.
import 'fake-indexeddb/auto';

// Polyfill URL.createObjectURL / revokeObjectURL for jsdom
URL.createObjectURL = vi.fn(() => 'blob:mock-url');
URL.revokeObjectURL = vi.fn();

// Full localStorage polyfill — jsdom's built-in stub is incomplete
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => localStorageStore[key] ?? null,
  setItem: (key: string, value: string) => { localStorageStore[key] = value; },
  removeItem: (key: string) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); },
  get length() { return Object.keys(localStorageStore).length; },
  key: (index: number) => Object.keys(localStorageStore)[index] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});
