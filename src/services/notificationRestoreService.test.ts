import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resendNotification } from './notificationRestoreService';

const originalNavigator = globalThis.navigator;

function mockServiceWorkerReady(registration: { showNotification: ReturnType<typeof vi.fn> } | null) {
  Object.defineProperty(globalThis, 'navigator', {
    value: registration
      ? { ...originalNavigator, serviceWorker: { ready: Promise.resolve(registration) } }
      : { ...originalNavigator, serviceWorker: undefined },
    writable: true,
    configurable: true,
  });
}

describe('notificationRestoreService: resendNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('calls showNotification with the given title and options', async () => {
    const mockShowNotification = vi.fn();
    mockServiceWorkerReady({ showNotification: mockShowNotification });

    await resendNotification('Title', { body: 'Body text' });

    expect(mockShowNotification).toHaveBeenCalledWith('Title', { body: 'Body text' });
  });

  it('defaults to an empty options object when none is provided', async () => {
    const mockShowNotification = vi.fn();
    mockServiceWorkerReady({ showNotification: mockShowNotification });

    await resendNotification('Title only');

    expect(mockShowNotification).toHaveBeenCalledWith('Title only', {});
  });

  it('is a no-op when serviceWorker is not available on navigator', async () => {
    mockServiceWorkerReady(null);
    await expect(resendNotification('Title')).resolves.toBeUndefined();
  });

  it('swallows errors from showNotification without throwing', async () => {
    const mockShowNotification = vi.fn().mockImplementation(() => {
      throw new Error('not allowed');
    });
    mockServiceWorkerReady({ showNotification: mockShowNotification });

    await expect(resendNotification('Title')).resolves.toBeUndefined();
  });

  it('swallows a rejected serviceWorker.ready promise without throwing', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { ...originalNavigator, serviceWorker: { ready: Promise.reject(new Error('no SW')) } },
      writable: true,
      configurable: true,
    });

    await expect(resendNotification('Title')).resolves.toBeUndefined();
  });
});
