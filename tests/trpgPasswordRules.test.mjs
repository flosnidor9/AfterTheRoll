import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const projectId = 'demo-afterthe-roll';
const documentPath = 'private_trpg_passwords/archive';
const fixture = { salt: 'ab'.repeat(16), iv: 'cd'.repeat(12), ciphertext: 'ef'.repeat(32), authTag: '01'.repeat(16) };
let environment;

before(async () => {
  const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1', port: 8087,
      rules,
    },
  });
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), documentPath), fixture);
  });
});

after(async () => { await environment?.cleanup(); });

for (const [label, uid, claims] of [
  ['anonymous', null, null],
  ['ordinary signed-in user', 'ordinary', { email: 'reader@example.com', email_verified: true }],
  ['unverified admin email', 'unverified', { email: 'flosnidor9@gmail.com', email_verified: false }],
  ['admin email without verification claim', 'missing-claim', { email: 'flosnidor9@gmail.com' }],
]) {
  test(`${label} cannot read, write, list, or delete the archive`, async () => {
    const context = uid ? environment.authenticatedContext(uid, claims) : environment.unauthenticatedContext();
    const db = context.firestore();
    await assertFails(getDoc(doc(db, documentPath)));
    await assertFails(setDoc(doc(db, documentPath), fixture));
    await assertFails(getDocs(collection(db, 'private_trpg_passwords')));
    await assertFails(deleteDoc(doc(db, documentPath)));
  });
}

test('verified admin can read and update only the encrypted archive', async () => {
  const db = environment.authenticatedContext('admin', { email: 'flosnidor9@gmail.com', email_verified: true }).firestore();
  const snapshot = await assertSucceeds(getDoc(doc(db, documentPath)));
  assert.deepEqual(snapshot.data(), fixture);
  await assertSucceeds(setDoc(doc(db, documentPath), fixture));
  await assertFails(getDoc(doc(db, 'private_trpg_passwords/other')));
  await assertFails(setDoc(doc(db, 'private_trpg_passwords/other'), fixture));
  await assertFails(getDocs(collection(db, 'private_trpg_passwords')));
  await assertFails(deleteDoc(doc(db, documentPath)));
});

test('even admin cannot store plaintext passwords or malformed archives', async () => {
  const db = environment.authenticatedContext('admin', { email: 'flosnidor9@gmail.com', email_verified: true }).firestore();
  for (const payload of [
    { password: 'must-not-be-stored' },
    { ...fixture, masterKey: 'must-not-be-stored' },
    { ...fixture, salt: 'short' },
    { ...fixture, iv: 123 },
    { ...fixture, ciphertext: 'abc' },
    { ...fixture, authTag: '' },
  ]) await assertFails(setDoc(doc(db, documentPath), payload));
  await assertFails(updateDoc(doc(db, documentPath), { plaintext: 'must-not-be-stored' }));
});

test('verified admin can initialize an empty vault', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(doc(context.firestore(), documentPath));
  });
  const db = environment.authenticatedContext('admin', { email: 'flosnidor9@gmail.com', email_verified: true }).firestore();
  await assertSucceeds(setDoc(doc(db, documentPath), fixture));
});

test('merged rules preserve public archive data and guest comments', async () => {
  const db = environment.unauthenticatedContext().firestore();
  for (const path of ['plays/example', 'acorns/example', 'profile_config/example', 'promise_tickets/example']) {
    await assertSucceeds(getDoc(doc(db, path)));
  }
  const guestComment = { name: 'Guest', message: 'Hello', authorRole: 'guest', timestamp: serverTimestamp() };
  await assertSucceeds(setDoc(doc(db, 'afterTheRollGuestbook/example'), guestComment));
  await assertSucceeds(setDoc(doc(db, 'afterTheRollDeploymentComments_2026_example/example'), guestComment));
});

test('merged rules preserve existing private collections', async () => {
  const publicDb = environment.unauthenticatedContext().firestore();
  const adminDb = environment.authenticatedContext('admin', { email: 'flosnidor9@gmail.com', email_verified: true }).firestore();
  for (const path of ['private_character_links/example', 'private_promise_tickets/example']) {
    await assertFails(getDoc(doc(publicDb, path)));
    await assertSucceeds(getDoc(doc(adminDb, path)));
  }
});
