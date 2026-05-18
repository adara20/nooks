import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { app, auth, firestore } from './firebaseService';

const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY as string;

/**
 * Returns true if this browser/device supports FCM web push.
 * Requires: service worker support + Notification API + PushManager.
 * On iOS this requires Safari 16.4+ with the app installed to the home screen.
 */
export async function isFcmSupported(): Promise<boolean> {
  return isSupported();
}

/**
 * Returns the current Notification permission state.
 * 'default' = never asked, 'granted' = allowed, 'denied' = blocked.
 */
export function getNotificationPermission(): NotificationPermission {
  if (typeof Notification === 'undefined') return 'denied';
  return Notification.permission;
}

/**
 * Requests notification permission (must be called from a user gesture),
 * obtains the FCM token, and stores it in Firestore under
 * users/{uid}/fcmTokens/{token}.
 *
 * Returns the token string on success, or null if:
 * - user is not signed in
 * - browser doesn't support FCM
 * - permission was denied
 * - token retrieval failed
 */
export async function requestPermissionAndSaveToken(): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  if (!(await isFcmSupported())) return null;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return null;

  try {
    // Pass the active SW registration explicitly so Firebase uses our custom
    // /sw.js instead of looking for the default /firebase-messaging-sw.js.
    const registration = await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return null;

    await setDoc(
      doc(firestore, 'users', uid, 'fcmTokens', token),
      {
        token,
        createdAt: serverTimestamp(),
        platform: getPlatform(),
      }
    );

    return token;
  } catch (err) {
    console.warn('[fcmService] Failed to get/save FCM token:', err);
    return null;
  }
}

function getPlatform(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPad/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'web';
}
