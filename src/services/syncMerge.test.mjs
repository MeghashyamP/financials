import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSyncStates, mergeTransactions, mergeSettings } from './syncMerge.js';

test('transactions from both devices are kept; same id → this device wins', () => {
    const cloud = [{ id: 'a', amount: 1, fingerprint: 'fa' }, { id: 'b', amount: 2, fingerprint: 'fb' }];
    const local = [{ id: 'b', amount: 20, fingerprint: 'fb' }, { id: 'c', amount: 3, fingerprint: 'fc' }];
    const m = mergeTransactions(cloud, local);
    assert.deepEqual(m.map((t) => t.id).sort(), ['a', 'b', 'c']);
    assert.equal(m.find((t) => t.id === 'b').amount, 20);
});

test('the same statement row imported on both devices (different ids) is kept once', () => {
    const m = mergeTransactions([{ id: 'x1', fingerprint: 'same' }], [{ id: 'y1', fingerprint: 'same' }, { id: 'y2', fingerprint: 'other' }]);
    assert.deepEqual(m.map((t) => t.id).sort(), ['x1', 'y2']);
});

test('settings: local values on top, record lists merged by id, string lists without duplicates', () => {
    const cloud = { currency: 'INR', budgets: [{ id: 1, v: 'c' }, { id: 2, v: 'c2' }], categories: ['A', 'B'], theme: 'dark' };
    const local = { currency: 'USD', budgets: [{ id: 1, v: 'l' }, { id: 3, v: 'l3' }], categories: ['A', 'C'] };
    const s = mergeSettings(cloud, local);
    assert.equal(s.currency, 'USD');
    assert.equal(s.theme, 'dark');
    assert.deepEqual(s.budgets.map((b) => `${b.id}${b.v}`).sort(), ['1l', '2c2', '3l3']);
    assert.deepEqual(s.categories.sort(), ['A', 'B', 'C']);
});

test('an empty local list does not erase the cloud list', () => {
    assert.deepEqual(mergeSettings({ goals: [{ id: 1 }] }, { goals: [] }).goals, [{ id: 1 }]);
});

test('whole-state merge unions tags, rules and documents', () => {
    const m = mergeSyncStates(
        { transactions: [], tags: [{ name: 't1' }], rules: [{ id: 'r1' }], documents: [{ id: 'd1' }], settings: {} },
        { transactions: [], tags: [{ name: 't2' }], rules: [{ id: 'r2' }], documents: [{ id: 'd2' }], settings: {}, syncedAt: 'x' }
    );
    assert.equal(m.tags.length, 2);
    assert.equal(m.rules.length, 2);
    assert.equal(m.documents.length, 2);
    assert.equal(m.syncedAt, 'x');
});

import { mergeThreeWay } from './syncMerge.js';
const shape = (o = {}) => ({ transactions: [], tags: [], rules: [], documents: [], settings: {}, ...o });

test('3-way: a change on each device to different transactions is combined', () => {
    const base = shape({ transactions: [{ id: 1, category: 'A' }, { id: 2, category: 'B' }] });
    const local = shape({ transactions: [{ id: 1, category: 'A2' }, { id: 2, category: 'B' }] });
    const cloud = shape({ transactions: [{ id: 1, category: 'A' }, { id: 2, category: 'B2' }] });
    const m = mergeThreeWay(base, local, cloud);
    assert.deepEqual(m.transactions.map((t) => t.category).sort(), ['A2', 'B2']);
});

test('3-way: deleting on one device really deletes, unless the other device edited it', () => {
    const base = shape({ transactions: [{ id: 1, n: 'x' }, { id: 2, n: 'y' }, { id: 3, n: 'z' }] });
    const local = shape({ transactions: [{ id: 2, n: 'y' }, { id: 3, n: 'z' }] });            // deleted 1
    const cloud = shape({ transactions: [{ id: 1, n: 'x' }, { id: 2, n: 'y' }, { id: 3, n: 'z2' }] }); // edited 3
    const m = mergeThreeWay(base, local, cloud);
    assert.deepEqual(m.transactions.map((t) => t.id).sort(), [2, 3]);
    assert.equal(m.transactions.find((t) => t.id === 3).n, 'z2');
    // delete vs edit: the edit survives
    const m2 = mergeThreeWay(base, shape({ transactions: [{ id: 2, n: 'y' }, { id: 3, n: 'z' }] }), shape({ transactions: [{ id: 1, n: 'x!' }, { id: 2, n: 'y' }, { id: 3, n: 'z' }] }));
    assert.ok(m2.transactions.some((t) => t.id === 1 && t.n === 'x!'));
});

test('3-way: new on each device kept; same field edited on both → this device wins; empty values do not count as changes', () => {
    const base = shape({ transactions: [{ id: 1, note: 'a', tags: [] }] });
    const local = shape({ transactions: [{ id: 1, note: 'L', tags: [] }, { id: 9, note: 'new-local' }] });
    const cloud = shape({ transactions: [{ id: 1, note: 'C' }, { id: 8, note: 'new-cloud' }] });
    const m = mergeThreeWay(base, local, cloud);
    assert.equal(m.transactions.find((t) => t.id === 1).note, 'L');
    assert.deepEqual(m.transactions.map((t) => t.id).sort(), [1, 8, 9]);
    const same = mergeThreeWay(base, shape({ transactions: [{ id: 1, note: 'a', tags: [] }] }), shape({ transactions: [{ id: 1, note: 'a' }] }));
    assert.equal(same.transactions.length, 1);
});

test('3-way: settings lists merge by id with deletions, category names add/remove', () => {
    const base = shape({ settings: { budgets: [{ id: 1 }, { id: 2 }], categories: ['A', 'B', 'C'] } });
    const local = shape({ settings: { budgets: [{ id: 2 }, { id: 3 }], categories: ['A', 'B', 'C', 'L'] } });  // deleted budget 1, added 3 and category L
    const cloud = shape({ settings: { budgets: [{ id: 1 }, { id: 2 }, { id: 4 }], categories: ['A', 'C', 'K'] } }); // added 4, removed B, added K
    const m = mergeThreeWay(base, local, cloud);
    assert.deepEqual(m.settings.budgets.map((b) => b.id).sort(), [2, 3, 4]);
    assert.deepEqual([...m.settings.categories].sort(), ['A', 'C', 'K', 'L']);
});

test('3-way: the same statement imported on both devices (different ids) is kept once', () => {
    const m = mergeThreeWay(shape(), shape({ transactions: [{ id: 'l', fingerprint: 'f' }] }), shape({ transactions: [{ id: 'c', fingerprint: 'f' }] }));
    assert.equal(m.transactions.length, 1);
});
