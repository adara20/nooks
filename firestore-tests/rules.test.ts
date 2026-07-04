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
  deleteDoc,
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

// The exact submission shape the client (submitInboxTask) writes.
function validSubmission(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Pick up groceries',
    details: null,
    isUrgent: false,
    isImportant: true,
    dueDate: null,
    contributorUID: CONTRIB,
    contributorEmail: 'contrib@example.com',
    status: 'pending',
    createdAt: new Date(),
    ...overrides,
  };
}

// Puts CONTRIB on the owner's allow-list, mirroring the production backfill.
async function linkContributor(uid = CONTRIB) {
  await seed(`users/${OWNER}/contributors/${uid}`, { linkedAt: new Date() });
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

describe('contributor allow-list (users/{owner}/contributors)', () => {
  it('owner can add, read, and remove contributors', async () => {
    await assertSucceeds(
      setDoc(doc(asOwner(), `users/${OWNER}/contributors/${CONTRIB}`), { linkedAt: new Date() })
    );
    await assertSucceeds(getDoc(doc(asOwner(), `users/${OWNER}/contributors/${CONTRIB}`)));
    await assertSucceeds(deleteDoc(doc(asOwner(), `users/${OWNER}/contributors/${CONTRIB}`)));
  });

  it('nobody can add themselves to another user\'s allow-list', async () => {
    await assertFails(
      setDoc(doc(asAttacker(), `users/${OWNER}/contributors/${ATTACKER}`), { linkedAt: new Date() })
    );
    await assertFails(
      setDoc(doc(asContrib(), `users/${OWNER}/contributors/${CONTRIB}`), { linkedAt: new Date() })
    );
  });

  it('non-owners cannot read the allow-list', async () => {
    await linkContributor();
    await assertFails(getDoc(doc(asContrib(), `users/${OWNER}/contributors/${CONTRIB}`)));
    await assertFails(getDocs(collection(asAttacker(), `users/${OWNER}/contributors`)));
  });
});

describe('inbox — create (the core fix: allow-list gated)', () => {
  it('a linked contributor can submit a well-formed pending item', async () => {
    await linkContributor();
    await assertSucceeds(
      setDoc(doc(asContrib(), `users/${OWNER}/inbox/sub1`), validSubmission())
    );
  });

  it('a linked contributor can submit with details and a due date', async () => {
    await linkContributor();
    await assertSucceeds(
      setDoc(
        doc(asContrib(), `users/${OWNER}/inbox/sub1`),
        validSubmission({ details: 'the oat milk kind', dueDate: new Date() })
      )
    );
  });

  it('an authenticated stranger CANNOT create in the owner\'s inbox (old rules allowed this)', async () => {
    // No allow-list entry for ATTACKER — even stamping their own UID must fail.
    await assertFails(
      setDoc(
        doc(asAttacker(), `users/${OWNER}/inbox/spam1`),
        validSubmission({ contributorUID: ATTACKER, contributorEmail: 'attacker@example.com' })
      )
    );
  });

  it('an unauthenticated user cannot create in the inbox', async () => {
    await assertFails(
      setDoc(doc(asAnon(), `users/${OWNER}/inbox/spam1`), validSubmission())
    );
  });

  it('a linked contributor cannot forge someone else\'s contributorUID', async () => {
    await linkContributor();
    await assertFails(
      setDoc(
        doc(asContrib(), `users/${OWNER}/inbox/forged`),
        validSubmission({ contributorUID: ATTACKER })
      )
    );
  });

  it('a revoked contributor (allow-list doc deleted) can no longer submit', async () => {
    // Never linked in this test — equivalent to post-revocation state.
    await assertFails(
      setDoc(doc(asContrib(), `users/${OWNER}/inbox/late`), validSubmission())
    );
  });

  it('submissions must be pending — cannot arrive pre-accepted or carry a taskId', async () => {
    await linkContributor();
    await assertFails(
      setDoc(
        doc(asContrib(), `users/${OWNER}/inbox/sneaky`),
        validSubmission({ status: 'accepted' })
      )
    );
    await assertFails(
      setDoc(
        doc(asContrib(), `users/${OWNER}/inbox/sneaky2`),
        { ...validSubmission(), taskId: 42 }
      )
    );
  });

  it('submissions are shape-validated (title required/bounded, no extra fields)', async () => {
    await linkContributor();

    await assertFails(
      setDoc(doc(asContrib(), `users/${OWNER}/inbox/notitle`), validSubmission({ title: '' }))
    );
    await assertFails(
      setDoc(
        doc(asContrib(), `users/${OWNER}/inbox/hugetitle`),
        validSubmission({ title: 'x'.repeat(501) })
      )
    );
    await assertFails(
      setDoc(
        doc(asContrib(), `users/${OWNER}/inbox/extra`),
        { ...validSubmission(), surprise: 'field' }
      )
    );
  });

  it('the owner retains full write access to their own inbox regardless of shape', async () => {
    // Owner-side accept/decline updates are not shape-constrained.
    await seed(`users/${OWNER}/inbox/sub1`, validSubmission());
    await assertSucceeds(
      updateDoc(doc(asOwner(), `users/${OWNER}/inbox/sub1`), { status: 'accepted', taskId: 7 })
    );
  });
});

describe('inbox — read/delete scoping (regression)', () => {
  it('a contributor can query and delete only their own submissions', async () => {
    await seed(`users/${OWNER}/inbox/mine`, validSubmission());
    await seed(`users/${OWNER}/inbox/other`, validSubmission({ contributorUID: 'someone-else' }));

    await assertSucceeds(
      getDocs(query(collection(asContrib(), `users/${OWNER}/inbox`), where('contributorUID', '==', CONTRIB)))
    );
    await assertSucceeds(getDoc(doc(asContrib(), `users/${OWNER}/inbox/mine`)));
    await assertSucceeds(deleteDoc(doc(asContrib(), `users/${OWNER}/inbox/mine`)));

    await assertFails(getDoc(doc(asContrib(), `users/${OWNER}/inbox/other`)));
    await assertFails(deleteDoc(doc(asContrib(), `users/${OWNER}/inbox/other`)));
  });

  it('the owner\'s inbox cannot be listed unfiltered by a non-owner', async () => {
    await seed(`users/${OWNER}/inbox/mine`, validSubmission());
    await assertFails(getDocs(collection(asContrib(), `users/${OWNER}/inbox`)));
    await assertFails(getDocs(collection(asAttacker(), `users/${OWNER}/inbox`)));
  });

  it('a contributor cannot update inbox items (accept/decline is owner-only)', async () => {
    await seed(`users/${OWNER}/inbox/mine`, validSubmission());
    await assertFails(
      updateDoc(doc(asContrib(), `users/${OWNER}/inbox/mine`), { status: 'accepted' })
    );
  });
});

describe('invites — CLOSED (default-deny, no match block)', () => {
  it('nobody can mint an invite — not even the owner for their own UID', async () => {
    await assertFails(
      setDoc(doc(asOwner(), 'invites/NEWCODE'), {
        ownerUID: OWNER,
        ownerEmail: 'owner@example.com',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 864e5),
      })
    );
  });

  it('existing invite docs cannot be read, even with the exact code', async () => {
    await seed('invites/OLDCODE', { ownerUID: OWNER, ownerEmail: 'owner@example.com' });

    await assertFails(getDoc(doc(asContrib(), 'invites/OLDCODE')));
    await assertFails(getDoc(doc(asAttacker(), 'invites/OLDCODE')));
    await assertFails(getDoc(doc(asOwner(), 'invites/OLDCODE')));
  });

  it('the invites collection cannot be enumerated', async () => {
    await seed('invites/CODE1', { ownerUID: OWNER, ownerEmail: 'owner@example.com' });
    await assertFails(getDocs(collection(asAttacker(), 'invites')));
  });

  it('existing invites cannot be redeemed or updated', async () => {
    await seed('invites/OLDCODE', {
      ownerUID: OWNER,
      ownerEmail: 'owner@example.com',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 864e5),
    });

    await assertFails(
      updateDoc(doc(asAttacker(), 'invites/OLDCODE'), {
        redeemedBy: ATTACKER,
        redeemedAt: new Date(),
      })
    );
    await assertFails(
      updateDoc(doc(asOwner(), 'invites/OLDCODE'), { expiresAt: new Date() })
    );
  });
});

describe('contributor permission doc (localStorage recovery path)', () => {
  it('a contributor can read and write their own permission doc', async () => {
    await seed(`users/${CONTRIB}/permissions/contributor`, {
      ownerUID: OWNER,
      ownerEmail: 'owner@example.com',
      linkedAt: new Date(),
    });
    await assertSucceeds(getDoc(doc(asContrib(), `users/${CONTRIB}/permissions/contributor`)));
  });

  it('nobody else can read a contributor\'s permission doc', async () => {
    await seed(`users/${CONTRIB}/permissions/contributor`, {
      ownerUID: OWNER,
      ownerEmail: 'owner@example.com',
    });
    await assertFails(getDoc(doc(asAttacker(), `users/${CONTRIB}/permissions/contributor`)));
    await assertFails(getDoc(doc(asOwner(), `users/${CONTRIB}/permissions/contributor`)));
  });
});
