/**
 * Re-shows an OS notification directly from the client, bypassing FCM/Firestore
 * entirely. Used to "restore" a notification the user already dismissed for
 * something still pending (an inbox submission or a due reminder).
 */
export async function resendNotification(title: string, options: NotificationOptions = {}): Promise<void> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
  } catch (err) {
    console.warn('[notificationRestoreService] Failed to show notification:', err);
  }
}
