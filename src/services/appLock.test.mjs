import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LOCK_KEY, isLockEnabled, createLock, verifyPassphrase, removeLock, forceRemoveLock,
    getIdleMinutes, setIdleMinutes, readPrivacyDefault, writePrivacyDefault
} from './appLock.js';

const memoryStore = () => {
    const m = new Map();
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
};

test('a lock verifies only the right passphrase and never stores it', async () => {
    const store = memoryStore();
    assert.equal(isLockEnabled(store), false);
    await createLock('correct horse', { store });
    assert.equal(isLockEnabled(store), true);
    assert.equal(await verifyPassphrase('correct horse', store), true);
    assert.equal(await verifyPassphrase('Correct horse', store), false);
    assert.equal(await verifyPassphrase('', store), false);
    const raw = store.getItem(LOCK_KEY);
    assert.ok(!raw.includes('correct horse'));
    assert.ok(JSON.parse(raw).iterations >= 100000);
});

test('same passphrase gets a different salt and hash each time', async () => {
    const a = memoryStore(); const b = memoryStore();
    await createLock('same passphrase', { store: a });
    await createLock('same passphrase', { store: b });
    assert.notEqual(JSON.parse(a.getItem(LOCK_KEY)).hash, JSON.parse(b.getItem(LOCK_KEY)).hash);
});

test('too-short passphrases are refused', async () => {
    await assert.rejects(() => createLock('abc', { store: memoryStore() }), /at least 6/);
});

test('removing the lock needs the passphrase; forgetting it means forceRemoveLock', async () => {
    const store = memoryStore();
    await createLock('open sesame', { store });
    assert.equal(await removeLock('wrong one', store), false);
    assert.equal(isLockEnabled(store), true);
    assert.equal(await removeLock('open sesame', store), true);
    assert.equal(isLockEnabled(store), false);
    await createLock('open sesame', { store });
    forceRemoveLock(store);
    assert.equal(isLockEnabled(store), false);
});

test('idle minutes and privacy default persist; a corrupt record means no lock', async () => {
    const store = memoryStore();
    assert.equal(setIdleMinutes(5, store), false, 'no lock yet');
    await createLock('whatever ok', { store, idleMinutes: 15 });
    assert.equal(getIdleMinutes(store), 15);
    setIdleMinutes(30, store);
    assert.equal(getIdleMinutes(store), 30);
    assert.equal(readPrivacyDefault(store), false);
    writePrivacyDefault(true, store);
    assert.equal(readPrivacyDefault(store), true);
    store.setItem(LOCK_KEY, '{not json');
    assert.equal(isLockEnabled(store), false);
    assert.equal(await verifyPassphrase('x', store), false);
});
