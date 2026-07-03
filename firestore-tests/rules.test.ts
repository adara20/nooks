import { readFileSync } from 'fs';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { beforeAll, afterAll, beforeEach, describe, it } from 'vitest';

const OWNER = 'owner-uid';
const CONTRIB = 'contributor-uid';
const ATTACKER = 'attacker-uid';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const [host, portStr] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
  testEnv = await initializeTestEnvironment({
    projectId: 'nooks-rules-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host,
      port: Number(portStr),
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

// Firestore handles for each principal.
const asOwner = () => testEnv.authenticatedContext(OWNER).firestore();
const asContrib = () => testEnv.authenticatedContext(CONTRIB).firestore();
const asAttacker = () => testEnv.authenticatedContext(ATTACKER).firestore();
const asAnon = () => testEnv.unauthenticatedContext().firestore();

// Seed a document while bypassing rules — used to represent data that already
// exists in production (e.g. an invite minted under the OLD rules).
async function seed(path: string, data: Record<string, unknown>) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data);
  });
}

describe('owner data isolation (regression — must stay locked)', () => {
  it('owner can read/write their own task; others cannot', async () => {
    await seed(`users/${OWNER}/tasks/1`, { title: 'private', status: 'todo' });

    await assertSucceeds(getDoc(doc(asOwner(), `users/${OWNER}/tasks/1`)));
    await assertFails(getDoc(doc(asAttacker(), `users/${OWNER}/tasks/1`)));
    await assertFails(getDoc(doc(asAnon(), `users/${OWNER}/tasks/1`)));
  });

  it('a task cannot be enumerated by a non-owner, even a contributor', async () => {
    await seed(`users/${OWNER}/tasks/1`, { title: 'a', contributorUID: CONTRIB });
    await seed(`users/${OWNER}/tasks/2`, { title: 'b' }); // not the contributor's

    // Unfiltered list of the owner's whole task collection is denied.
    await assertFails(getDocs(collection(asContrib(), `users/${OWNER}/tasks`)));
  });

  it('contributor read exception is scoped to tasks they submitted', async () => {
    await seed(`users/${OWNER}/tasks/1`, { title: 'submitted', contributorUID: CONTRIB });
    await seed(`users/${OWNER}/tasks/2`, { title: 'not theirs', contributorUID: 'someone-else' });

    // Single-doc get of their own submitted task succeeds…
    await assertSucceeds(getDoc(doc(asContrib(), `users/${OWNER}/tasks/1`)));
    // …but not of a task submitted by someone else.
    await assertFails(getDoc(doc(asContrib(), `users/${OWNER}/tasks/2`)));

    // A query filtered to their own contributorUID is allowed.
    await assertSucceeds(
      getDocs(query(collection(asContrib(), `users/${OWNER}/tasks`), where('contributorUID', '==', CONTRIB)))
    );
  });

  it('buckets and reminders stay owner-only', async () => {
    await seed(`users/${OWNER}/buckets/1`, { name: 'Health' });
    await seed(`users/${OWNER}/reminders/1`, { title: 'Refill', active: true });

    await assertSucceeds(getDoc(doc(asOwner(), `users/${OWNER}/buckets/1`)));
    await assertFails(getDoc(doc(asAttacker(), `users/${OWNER}/buckets/1`)));
    await assertFails(getDoc(doc(asContrib(), `users/${OWNER}/reminders/1`)));
  });
});

describe('invites — create', () => {
  it('owner can mint an invite for their own UID', async () => {
    await assertSucceeds(
      setDoc(doc(asOwner(), 'invites/ABC123'), {
        ownerUID: OWNER,
        ownerEmail: 'owner@example.com',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 864e5),
      })
    );
  });

  it('a user cannot mint an invite impersonating another owner', async () => {
    await assertFails(
      setDoc(doc(asAttacker(), 'invites/FORGED'), {
        ownerUID: OWNER, // not the attacker's own UID
        ownerEmail: 'owner@example.com',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 864e5),
      })
    );
  });
});

describe('invites — read (the core fix)', () => {
  it('a contributor who knows the code can get() the invite', async () => {
    await seed('invites/CODE1', { ownerUID: OWNER, ownerEmail: 'owner@example.com' });
    await assertSucceeds(getDoc(doc(asContrib(), 'invites/CODE1')));
  });

  it('the invites collection CANNOT be enumerated (no harvesting emails/codes)', async () => {
    await seed('invites/CODE1', { ownerUID: OWNER, ownerEmail: 'owner@example.com' });
    await seed('invites/CODE2', { ownerUID: 'other', ownerEmail: 'other@example.com' });

    // This is the exact attack the old `allow read` permitted.
    await assertFails(getDocs(collection(asAttacker(), 'invites')));
    await assertFails(getDocs(collection(asContrib(), 'invites')));
  });
});

describe('invites — redeem (backward compatibility with existing invites)', () => {
  it('an EXISTING (old-rules) un-redeemed invite can still be redeemed', async () => {
    // No redeemedBy field — mirrors a doc created before this change.
    await seed('invites/OLDCODE', {
      ownerUID: OWNER,
      ownerEmail: 'owner@example.com',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 864e5),
    });

    await assertSucceeds(
      updateDoc(doc(asContrib(), 'invites/OLDCODE'), {
        redeemedBy: CONTRIB,
        redeemedAt: new Date(),
      })
    );
  });

  it('an already-redeemed invite cannot be re-redeemed by someone else', async () => {
    await seed('invites/USED', {
      ownerUID: OWNER,
      ownerEmail: 'owner@example.com',
      redeemedBy: CONTRIB,
    });

    await assertFails(
      updateDoc(doc(asAttacker(), 'invites/USED'), {
        redeemedBy: ATTACKER,
        redeemedAt: new Date(),
      })
    );
  });

  it('a redeemer cannot rewrite ownerUID while redeeming', async () => {
    await seed('invites/CODE', { ownerUID: OWNER, ownerEmail: 'owner@example.com' });

    await assertFails(
      updateDoc(doc(asAttacker(), 'invites/CODE'), {
        redeemedBy: ATTACKER,
        ownerUID: ATTACKER, // attempt to hijack ownership
      })
    );
  });

  it('the owner can still update their own invite', async () => {
    await seed('invites/MINE', { ownerUID: OWNER, ownerEmail: 'owner@example.com' });
    await assertSucceeds(
      updateDoc(doc(asOwner(), 'invites/MINE'), { expiresAt: new Date(Date.now() + 864e5) })
    );
  });
});
