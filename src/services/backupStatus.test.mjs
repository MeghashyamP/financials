import test from 'node:test';
import assert from 'node:assert/strict';
import { markBackup, snoozeBackupBanner, backupHealth, STALE_DAYS } from './backupStatus.js';

const memoryStore = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) }; };
const day = 86400000;
const now = new Date('2026-11-20T10:00:00Z');

test('no data, no nagging', () => {
    assert.equal(backupHealth({ transactionCount: 0, now, store: memoryStore() }).show, false);
});

test('data that was never copied anywhere is flagged', () => {
    const h = backupHealth({ transactionCount: 120, now, store: memoryStore() });
    assert.equal(h.show, true);
    assert.match(h.message, /never been backed up/);
});

test('any recent copy (file, cloud or linked file) silences it; the newest one counts', () => {
    const store = memoryStore();
    markBackup('file', new Date(now.getTime() - 40 * day), store);
    assert.equal(backupHealth({ transactionCount: 5, now, store }).show, true);
    markBackup('cloud', new Date(now.getTime() - 2 * day), store);
    const h = backupHealth({ transactionCount: 5, now, store });
    assert.equal(h.show, false);
    assert.equal(h.via, 'cloud sync');
    assert.equal(h.daysSince, 2);
});

test('goes stale after the threshold and can be snoozed', () => {
    const store = memoryStore();
    markBackup('linked', new Date(now.getTime() - (STALE_DAYS + 1) * day), store);
    const h = backupHealth({ transactionCount: 5, now, store });
    assert.equal(h.show, true);
    assert.match(h.message, /15 days ago \(the linked file\)/);
    snoozeBackupBanner(7, now, store);
    assert.equal(backupHealth({ transactionCount: 5, now, store }).show, false);
    assert.equal(backupHealth({ transactionCount: 5, now: new Date(now.getTime() + 8 * day), store }).show, true);
});

test('unusable storage never throws', () => {
    const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
    assert.doesNotThrow(() => markBackup('file', now, broken));
    assert.equal(backupHealth({ transactionCount: 3, now, store: broken }).show, true);
    assert.doesNotThrow(() => markBackup('file', now, null));
});
