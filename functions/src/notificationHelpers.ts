import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';

export interface PushPayload {
  type: 'inbox' | 'reminder';
  title: string;
  body: string;
  icon?: string;
}

/**
 * Sends a data-only FCM multicast push to every token registered under
 * users/{ownerUID}/fcmTokens, then prunes any tokens FCM reports as
 * invalid/unregistered. No-ops if the owner has no registered tokens.
 *
 * Data-only (no `notification` field) so the client SW's onBackgroundMessage
 * handler controls display — avoids double-notifications when the app is
 * in the foreground (handled instead by the Sonner toast).
 */
export async function sendPushToUser(ownerUID: string, payload: PushPayload): Promise<void> {
  const db = getFirestore();
  const tokensSnap = await db.collection(`users/${ownerUID}/fcmTokens`).get();

  if (tokensSnap.empty) return;

  const tokens = tokensSnap.docs.map((d) => d.id);

  const messaging = getMessaging();
  const response = await messaging.sendEachForMulticast({
    tokens,
    data: {
      type: payload.type,
      title: payload.title,
      body: payload.body,
      icon: payload.icon ?? '/icons/icon-192x192.png',
    },
  });

  const staleTokens: Promise<FirebaseFirestore.WriteResult>[] = [];
  response.responses.forEach((res, idx) => {
    if (!res.success) {
      const errorCode = res.error?.code ?? '';
      if (
        errorCode === 'messaging/registration-token-not-registered' ||
        errorCode === 'messaging/invalid-registration-token'
      ) {
        staleTokens.push(
          db.doc(`users/${ownerUID}/fcmTokens/${tokens[idx]}`).delete()
        );
      }
    }
  });

  if (staleTokens.length > 0) {
    await Promise.all(staleTokens);
  }
}
