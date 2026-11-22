// Run with:  node --test src/services/statementTemplates.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { auditStatement, buildLines, parseStatementWithTemplate } from './statementTemplates.js';

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


// ── ICICI savings: a "Total:" row is printed under the table on EVERY page, not just the last ──
const it = (str, x, y, page) => ({ str, x, y, page });
const iciciHeader = (y, page) => [it('DATE', 36.8, y, page), it('MODE', 76.5, y, page), it('PARTICULARS', 143.8, y, page), it('DEPOSITS', 372.8, y, page), it('WITHDRAWALS', 431.5, y, page), it('BALANCE', 526.5, y, page)];
const iciciRow = (date, desc, dep, wdr, bal, y, page) => [it(date, 35.4, y, page), it(desc, 143.8, y, page), ...(dep ? [it(dep, 379.6, y, page)] : []), ...(wdr ? [it(wdr, 459.4, y, page)] : []), it(bal, 528.1, y, page)];
const iciciTotal = (dep, wdr, bal, y, page) => [it('Total:', 141, y, page), it(dep, 378.6, y, page), it(wdr, 458.4, y, page), it(bal, 526.9, y, page)];

const iciciTwoPages = () => [
    it('Statement of Transactions in Savings', 36.8, 490, 1), it('Account XXXXXXXX1234 in INR for the period September 01, 2026 - September 30, 2026', 189.4, 490, 1),
    ...iciciHeader(470, 1),
    ...iciciRow('01-09-2026', 'B/F', '', '', '1,000.00', 455, 1).filter((x) => x.x !== 143.8), it('B/F', 143.8, 455, 1),
    ...iciciRow('02-09-2026', 'UPI/SHOP ONE', '', '100.00', '900.00', 440, 1),
    ...iciciRow('03-09-2026', 'UPI/FRIEND', '500.00', '', '1,400.00', 425, 1),
    ...iciciTotal('500.00', '100.00', '1,400.00', 400, 1),         // page-1 subtotal
    it('Page 1 of 2', 476, 14, 1),
    it('Statement of Transactions in Savings', 36.8, 742, 2),
    ...iciciHeader(725, 2),
    ...iciciRow('15-09-2026', 'UPI/SHOP TWO', '', '400.00', '1,000.00', 705, 2),
    ...iciciRow('30-09-2026', 'Int.Pd', '26.00', '', '1,026.00', 690, 2),
    ...iciciTotal('26.00', '400.00', '1,026.00', 670, 2),          // page-2 subtotal
    it('Legends for transactions in your Account Statement', 143.8, 600, 2),   // junk at the narration column
    it('Page 2 of 2', 469, 43, 2)
];

test('ICICI savings: transactions on page 2 are not dropped after page 1\'s Total row', () => {
    const r = parseStatementWithTemplate(iciciTwoPages());
    assert.ok(r, 'template recognised');
    assert.equal(r.rows.length, 4);
    assert.deepEqual(r.rows.map((x) => x.page), [1, 1, 2, 2]);
    // anchors are the SUM of the page subtotals, closing is the last page's balance
    assert.deepEqual({ ...r.anchors }, { opening: 1000, totalCredits: 526, totalDebits: 500, closing: 1026 });
    assert.equal(r.audit.status, 'verified');
    // legend text after the final Total must not leak into the last narration
    assert.ok(!/Legends/.test(r.rows[3].description));
});

test('ICICI savings: single-page statement (one Total) still works', () => {
    const items = iciciTwoPages().filter((x) => x.page === 1);
    const r = parseStatementWithTemplate(items);
    assert.equal(r.rows.length, 2);
    assert.equal(r.audit.status, 'verified');
});


// ── SBI Card: the GST line under a fee has no date of its own ──
const sbiStatement = () => [
    it('SBI Card', 20, 960, 1), it('Credit Card Number', 324, 947, 1),
    it('ACCOUNT SUMMARY', 30, 700, 1),
    it('1,000.00', 36.9, 667, 1), it('1,000.00', 119, 667, 1), it('100.00', 205, 667, 1), it('590.00', 284, 667, 1), it('690.00', 371, 667, 1),
    it('Transaction Details', 181, 560, 1),
    it('04 Nov 26', 25, 540, 1), it('PAYMENT RECEIVED', 70, 540, 1), it('1,000.00', 369, 540, 1), it('C', 414, 540, 1),
    it('18 Nov 26', 25, 528, 1), it('ANNUAL FEE CHARGED', 70, 528, 1), it('500.00', 380, 528, 1), it('D', 414, 528, 1),
    it('IGST DB @ 18.00%', 70, 516, 1), it('90.00', 385, 516, 1), it('D', 414, 516, 1),
    it('20 Nov 26', 25, 500, 1), it('UPI-SHOP', 70, 500, 1), it('100.00', 380, 500, 1), it('D', 414, 500, 1)
];

test('SBI Card: an undated IGST line under the annual fee is kept and audited', () => {
    const r = parseStatementWithTemplate(sbiStatement());
    assert.ok(r);
    const igst = r.rows.find((x) => /IGST/.test(x.description));
    assert.ok(igst, 'IGST row extracted');
    assert.equal(igst.amount, 90);
    assert.equal(igst.date, '2026-11-18', 'shares the fee row\'s date');
    assert.equal(r.audit.status, 'verified');
});

test('ICICI Credit Card: inception date range is aligned to statement cycle', () => {
    const items = [
        it('ICICI Bank', 40, 790, 1),
        it('CREDIT CARD STATEMENT', 40, 785, 1),
        it('STATEMENT DATE', 80, 648, 1),
        it('October 18, 2026', 70, 636, 1),
        it('Statement period : December 19, 2025 to October 18, 2026', 41, 80, 1),
        it('Transaction Details', 100, 500, 1),
        it('4786XXXXXXXX5004', 100, 480, 1),
        it('30/09/2026', 35, 450, 1),
        it('14269950509', 80, 450, 1),
        it('RELIANCE DIGITAL', 150, 450, 1),
        it('1,000.00', 400, 450, 1)
    ];
    const r = parseStatementWithTemplate(items);
    assert.ok(r);
    assert.equal(r.template, 'icici-credit-card');
    assert.deepEqual(r.period, { start: '2026-09-19', end: '2026-10-18' });
    assert.equal(r.summary.periodStart, '2026-09-19');
    assert.equal(r.summary.periodEnd, '2026-10-18');
});
