import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { sendPushToUser } from './notificationHelpers';

initializeApp();

// ─── onInboxCreated ───────────────────────────────────────────────────────────
//
// Fires when a contributor writes a new doc to users/{ownerUID}/inbox/{inboxId}.
// Sends a data-only multicast push to the owner's registered FCM tokens via
// the shared sendPushToUser helper.
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

    await sendPushToUser(ownerUID, {
      type: 'inbox',
      title: `📥 ${contributorEmail} submitted a task`,
      body: title,
    });
  }
);

// ─── onReminderDue ────────────────────────────────────────────────────────────
//
// Runs daily at 8:00 AM America/New_York. Checks every user's reminders
// (users/{ownerUID}/reminders/{reminderId}) for ones that are active and due,
// sends a data-only push per due reminder via the shared helper, then
// advances nextDueDate by the reminder's intervalDays.
//
// Path:  users/{ownerUID}/reminders/{reminderId}

export const onReminderDue = onSchedule(
  { schedule: 'every day 08:00', timeZone: 'America/New_York' },
  async () => {
    const db = getFirestore();
    const now = new Date();

    const dueSnap = await db
      .collectionGroup('reminders')
      .where('active', '==', true)
      .where('nextDueDate', '<=', now)
      .get();

    for (const reminderDoc of dueSnap.docs) {
      const ownerUID = reminderDoc.ref.parent.parent?.id;
      if (!ownerUID) continue;

      const data = reminderDoc.data();
      const title = String(data.title ?? 'Reminder');
      const intervalDays = Number(data.intervalDays ?? 0);
      const currentDueDate = (data.nextDueDate as FirebaseFirestore.Timestamp).toDate();

      await sendPushToUser(ownerUID, {
        type: 'reminder',
        title: `⏰ ${title}`,
        body: 'This reminder is due today.',
      });

      const nextDueDate = new Date(currentDueDate);
      nextDueDate.setDate(nextDueDate.getDate() + intervalDays);
      nextDueDate.setUTCHours(0, 0, 0, 0);

      await reminderDoc.ref.update({
        nextDueDate,
        lastFiredAt: now,
      });
    }
  }
);
