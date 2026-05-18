/// <reference lib="WebWorker" />
/// <reference types="vite-plugin-pwa/client" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';

declare const self: ServiceWorkerGlobalScope;

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ─── FCM Background Message Handler ──────────────────────────────────────────
// Service workers cannot access import.meta.env, so Firebase config is
// hardcoded here. These are all public-safe client-side values (not secrets).

const app = initializeApp({
  apiKey: 'AIzaSyC35ZRgg2vMJky_0R0gxQnG6_dqQCGaN4A',
  authDomain: 'nooks-bea45.firebaseapp.com',
  projectId: 'nooks-bea45',
  storageBucket: 'nooks-bea45.firebasestorage.app',
  messagingSenderId: '318405806355',
  appId: '1:318405806355:web:ef6acce07217f002f0b2e6',
});

const messaging = getMessaging(app);

/**
 * Handle FCM data-only push messages that arrive while the app is in the
 * background or closed. Cloud Functions send data-only payloads (no
 * notification field) so we control the display here instead of relying on
 * FCM's automatic notification display (which would cause double-toasts when
 * the app is in the foreground).
 */
onBackgroundMessage(messaging, (payload) => {
  const { title, body, icon } = payload.data ?? {};

  if (!title) return;

  self.registration.showNotification(title, {
    body: body ?? '',
    icon: icon ?? '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: payload.data,
  });
});
