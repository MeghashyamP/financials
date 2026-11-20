// Run with:  node --test src/services/statementTemplates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditStatement, buildLines } from './statementTemplates.js';

const anchors = { previousBalance: 1000, purchases: 500, fees: 0, payments: 1000, totalDue: 500 };
const rows = (list) => list.map(([amount, direction], i) => ({ amount, direction, description: `row ${i}`, date: '2026-01-01' }));

test('verified when rows tie to every printed total', () => {
    const a = auditStatement({ anchors, rows: rows([[300, 'debit'], [200, 'debit'], [1000, 'credit']]) });
    assert.equal(a.status, 'verified');
    assert.equal(a.reconciled, true);
});

test('missing row is reported with the exact amount', () => {
    const a = auditStatement({ anchors, rows: rows([[300, 'debit'], [1000, 'credit']]) });
    assert.equal(a.status, 'mismatch');
    assert.equal(a.checks.find((c) => c.id === 'debits-total').diff, -200);
    assert.ok(a.hints.some((h) => /missing/.test(h)));
});

test('duplicated row is pinpointed', () => {
    const a = auditStatement({ anchors, rows: rows([[300, 'debit'], [200, 'debit'], [200, 'debit'], [1000, 'credit']]) });
    assert.equal(a.status, 'mismatch');
    assert.ok(a.hints.some((h) => /row 1|row 2/.test(h)));
});

test('direction flipped on one row is flagged', () => {
    const a = auditStatement({ anchors, rows: rows([[300, 'debit'], [100, 'credit'], [1000, 'credit']]) });
    assert.equal(a.status, 'mismatch');
});

test('no printed totals → unverifiable, never verified', () => {
    const a = auditStatement({ anchors: null, rows: rows([[300, 'debit']]) });
    assert.equal(a.status, 'unverifiable');
    assert.equal(a.reconciled, false);
});

test('printed total due may be rounded to the rupee', () => {
    const a = auditStatement({
        anchors: { previousBalance: 10.37, purchases: 100.98, fees: 0, payments: 10, totalDue: 101 },
        rows: rows([[100.98, 'debit'], [10, 'credit']])
    });
    assert.equal(a.status, 'verified');
});

test('buildLines groups by y and orders by x', () => {
    const lines = buildLines([
        { str: 'b', x: 50, y: 100, page: 1 }, { str: 'a', x: 10, y: 101, page: 1 }, { str: 'c', x: 5, y: 80, page: 1 }
    ]);
    assert.deepEqual(lines.map((l) => l.text), ['a b', 'c']);
});

// ───── bank statements ─────
const bankRows = (list) => list.map(([amount, direction, balance], i) => ({ amount, direction, balance, description: `tx ${i}`, date: '2026-01-0' + (i + 1) }));

test('bank: verified when chain, totals and counts all agree', () => {
    const a = auditStatement({
        kind: 'bank',
        anchors: { opening: 1000, closing: 1300, totalDebits: 200, totalCredits: 500, debitCount: 1, creditCount: 1 },
        rows: bankRows([[500, 'credit', 1500], [200, 'debit', 1300]])
    });
    assert.equal(a.status, 'verified');
});

test('bank: a missing row breaks the chain and is located', () => {
    const a = auditStatement({
        kind: 'bank',
        anchors: { opening: 1000, closing: 1300 },
        rows: bankRows([[500, 'credit', 1500], [100, 'debit', 1200]])   // a ₹100 debit is missing before this row? balance 1300 expected
    });
    assert.equal(a.status, 'mismatch');
    assert.ok(a.checks.some((c) => c.id === 'balance-chain' && c.status === 'fail'));
    assert.ok(a.hints.length > 0);
});

test('bank: flipped direction is detected from the balance movement', () => {
    const a = auditStatement({
        kind: 'bank',
        anchors: { opening: 1000, closing: 1300 },
        rows: bankRows([[200, 'credit', 800], [500, 'credit', 1300]])    // first row is really a debit
    });
    assert.equal(a.status, 'mismatch');
    assert.ok(a.hints.some((h) => /flipped/.test(h)));
});

test('bank: opening/closing only (SBI-style) is still verified by chain + roll', () => {
    const a = auditStatement({ kind: 'bank', anchors: { opening: 100, closing: 60 }, rows: bankRows([[40, 'debit', 60]]) });
    assert.equal(a.status, 'verified');
});

test('bank: no anchors → unverifiable', () => {
    const a = auditStatement({ kind: 'bank', anchors: null, rows: bankRows([[40, 'debit', 60]]) });
    assert.equal(a.status, 'unverifiable');
});
