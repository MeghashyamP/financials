import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDocumentPeriods, formatPeriod, shortDate, compareByPeriod } from './documentPeriods.js';

test('period comes from the statement record, falling back to its transactions', () => {
    const statements = [
        { documentId: 'a', periodStart: '2026-09-01', periodEnd: '2026-09-30' },
        { documentId: 'b', periodStart: null, periodEnd: '2026-10-18' }      // card: only the end is trusted
    ];
    const txs = [
        { documentId: 'a', date: '2026-09-05' }, { documentId: 'a', date: '2026-09-29' },
        { documentId: 'b', date: '2026-09-20' }, { documentId: 'b', date: '2026-10-10' },
        { documentId: 'c', date: '2026-08-02' }, { documentId: 'c', date: '2026-08-20' },
        { date: '2026-01-01' }                                                  // manual entry, no document
    ];
    const m = buildDocumentPeriods(statements, txs);
    assert.deepEqual(m.get('a'), { start: '2026-09-01', end: '2026-09-30' });      // printed period wins over txn dates
    assert.deepEqual(m.get('b'), { start: '2026-09-20', end: '2026-10-18' });      // missing start filled from txns
    assert.deepEqual(m.get('c'), { start: '2026-08-02', end: '2026-08-20' });      // no statement record at all
    assert.equal(m.size, 3);
});

test('formatPeriod is compact and tolerates missing dates', () => {
    assert.equal(shortDate('2026-09-01'), '01 Sep 26');
    assert.equal(formatPeriod({ start: '2026-09-01', end: '2026-09-30' }), '01 Sep 26 – 30 Sep 26');
    assert.equal(formatPeriod({ start: '', end: '2026-09-30' }), '30 Sep 26');
    assert.equal(formatPeriod({ start: '2026-09-01', end: '2026-09-01' }), '01 Sep 26');
    assert.equal(formatPeriod(null), '');
    assert.equal(formatPeriod({ start: '', end: '' }), '');
});

test('sorted by statement period (oldest first), not by upload time; undated last', () => {
    const docs = [
        { id: 'oct', filename: 'oct.pdf', createdAt: '2026-11-20T10:00:00Z', period: { start: '2026-10-01', end: '2026-10-31' } },
        { id: 'none', filename: 'z.pdf', createdAt: '2026-11-01T10:00:00Z', period: null },
        { id: 'sep', filename: 'sep.pdf', createdAt: '2026-11-22T10:00:00Z', period: { start: '2026-09-01', end: '2026-09-30' } },
        { id: 'aug', filename: 'aug.pdf', createdAt: '2026-11-21T10:00:00Z', period: { start: '2026-08-01', end: '2026-08-31' } }
    ];
    assert.deepEqual([...docs].sort(compareByPeriod).map((d) => d.id), ['aug', 'sep', 'oct', 'none']);
});
