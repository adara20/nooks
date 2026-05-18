import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';

initializeApp();

// ─── onInboxCreated ───────────────────────────────────────────────────────────
//
// Fires when a contributor writes a new doc to users/{ownerUID}/inbox/{inboxId}.
// Looks up all FCM tokens registered under the owner's account and sends a
// data-only push (no notification field) so the SW background handler controls
// the display — preventing double-toasts when the app is open in the foreground.
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

    // Send a data-only multicast message
    const messaging = getMessaging();
    const response = await messaging.sendEachForMulticast({
      tokens,
      data: {
        title: `📥 ${contributorEmail} submitted a task`,
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
