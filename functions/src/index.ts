import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

initializeApp();

// ─── onInboxCreated ───────────────────────────────────────────────────────────
//
// Fires when a contributor writes a new doc to users/{ownerUID}/inbox/{inboxId}.
// Looks up all FCM tokens registered under the owner's account and sends a
// data-only multicast push. The SW onBackgroundMessage handler calls
// showNotification() to control display, preventing double-notifications.
// When the app is in the foreground, Firebase delivers only to onMessage and
// the Sonner toast from NotificationProvider handles display instead.
//
// Path:  users/{ownerUID}/inbox/{inboxId}

export const onInboxCreated = onDocumentCreated(
  'users/{ownerUID}/inbox/{inboxId}',
  async (event) => {
    const ownerUID = event.params.ownerUID;
    const data = event.data?.data();

    if (!data) return;

    const title = String(data.title ?? 'New task submitted');
    const contributorEmail = String(data.contributorEmail ?? 'Someone');

    // Fetch all FCM tokens registered for this owner
    const db = getFirestore();
    const tokensSnap = await db
      .collection(`users/${ownerUID}/fcmTokens`)
      .get();

    if (tokensSnap.empty) return;

    const tokens = tokensSnap.docs.map((d) => d.id);

    const notificationTitle = `📥 ${contributorEmail} submitted a task`;

    // Data-only push: the SW onBackgroundMessage handler calls showNotification()
    // so we control display on all platforms. No notification field — avoids a
    // double-notification where both the FCM payload and the SW handler show one.
    const messaging = getMessaging();
    const response = await messaging.sendEachForMulticast({
      tokens,
      data: {
        title: notificationTitle,
        body: title,
        icon: '/icons/icon-192x192.png',
      },
    });

    // Prune any tokens that are no longer valid
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
);
