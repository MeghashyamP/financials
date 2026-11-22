import test from 'node:test';
import assert from 'node:assert/strict';
import {
    makeStatementRecord, upsertStatement, analyzeStatements, compareConsecutive, checkAgainstHistory,
    syncNetWorthFromStatement, planCardBill, daysBetween, monthsStrictlyBetween
} from './statementLedger.js';

const card = (over = {}) => ({
    template: 'x-card', kind: 'card', bank: 'HDFC', last4: '1234', statementDate: '2026-09-18',
    periodStart: '2026-08-19', periodEnd: '2026-09-18', opening: 1000, closing: 5000, totalDue: 5000,
    minDue: 500, dueDate: '2026-10-07', creditLimit: 100000, availableCredit: 90000,
    totalDebits: 6000, totalCredits: 2000, txnCount: 20, auditStatus: 'verified', ...over
});
const rec = (summary, account = 'HDFC Credit Card') => makeStatementRecord(summary, { account, fileName: 'a.pdf', importedAt: '2026-10-01' });

let n = 0;
const newId = () => `id${++n}`;

test('date helpers', () => {
    assert.equal(daysBetween('2026-09-18', '2026-10-18'), 30);
    assert.deepEqual(monthsStrictlyBetween('2026-06', '2026-10'), ['2026-07', '2026-08', '2026-09']);
    assert.deepEqual(monthsStrictlyBetween('2026-06', '2026-07'), []);
});

test('records are keyed by account + period so a re-import replaces, never duplicates', () => {
    const a = rec(card());
    const again = rec(card({ minDue: 600 }));
    assert.equal(a.id, again.id);
    const list = upsertStatement(upsertStatement([], a), again);
    assert.equal(list.length, 1);
    assert.equal(list[0].minDue, 600);
});

test('a card period that is far too long is aligned to the monthly statement cycle', () => {
    const r = rec(card({ periodStart: '2025-12-19', periodEnd: '2026-10-18' }));
    assert.equal(r.periodStart, '2026-09-19');
});

test('consecutive card statements chain when opening equals the previous closing', () => {
    const sep = rec(card());
    const oct = rec(card({ periodStart: '2026-09-19', periodEnd: '2026-10-18', statementDate: '2026-10-18', opening: 5000, closing: 7000, totalDue: 7000, dueDate: '2026-11-07' }));
    assert.equal(compareConsecutive(sep, oct).status, 'ok');
    const wrong = rec(card({ periodStart: '2026-09-19', periodEnd: '2026-10-18', opening: 4200, closing: 7000, totalDue: 7000 }));
    const c = compareConsecutive(sep, wrong);
    assert.equal(c.status, 'chain');
    assert.equal(c.diff, -800);
});

test('rounded totals (±₹1) still chain', () => {
    const sep = rec(card({ closing: 5000.4 }));
    const oct = rec(card({ periodStart: '2026-09-19', periodEnd: '2026-10-18', opening: 5000 }));
    assert.equal(compareConsecutive(sep, oct).status, 'ok');
});

test('a skipped month is reported by name', () => {
    const jul = rec(card({ periodStart: '2026-06-19', periodEnd: '2026-07-18', opening: 0, closing: 100, totalDue: 100 }));
    const oct = rec(card({ periodStart: '2026-09-19', periodEnd: '2026-10-18', opening: 100, closing: 900, totalDue: 900 }));
    const c = compareConsecutive(jul, oct);
    assert.equal(c.status, 'gap');
    assert.deepEqual(c.missingMonths, ['2026-08']);
});

test('a bank statement with no printed period falls back to a 45 day rule', () => {
    const bank = (end, opening, closing) => rec({ kind: 'bank', template: 'b', bank: 'SBI', last4: '1111', periodStart: null, periodEnd: end, opening, closing, auditStatus: 'verified' }, 'SBI Debit Card');
    assert.equal(compareConsecutive(bank('2026-08-26', 10, 20), bank('2026-09-25', 20, 30)).status, 'ok');
    assert.equal(compareConsecutive(bank('2026-08-26', 10, 20), bank('2026-11-25', 20, 30)).status, 'gap');
});

test('analyze: timeline, stale account, failed audit', () => {
    const list = [
        rec(card()),
        rec(card({ periodStart: '2026-09-19', periodEnd: '2026-10-18', opening: 9999, closing: 1, totalDue: 1, auditStatus: 'mismatch' })),
        rec(card({ periodEnd: '2026-05-18', periodStart: '2026-04-19', opening: 0, closing: 10, totalDue: 10 }), 'SBI Credit Card')
    ];
    const a = analyzeStatements(list, '2026-12-20');
    assert.deepEqual(a.accounts, ['HDFC Credit Card', 'SBI Credit Card']);
    const hdfc = a.byAccount['HDFC Credit Card'];
    assert.equal(hdfc.items[0].check.status, 'first');
    assert.equal(hdfc.items[1].check.status, 'chain');
    assert.ok(hdfc.stale, 'latest statement is more than 45 days old');
    assert.ok(a.issues.some((i) => i.status === 'audit'));
    assert.ok(a.issues.some((i) => i.status === 'chain'));
    assert.ok(a.issues.some((i) => i.status === 'stale' && i.account === 'SBI Credit Card'));
});

test('checkAgainstHistory previews the chain before saving', () => {
    const history = [rec(card())];
    const good = checkAgainstHistory(history, 'HDFC Credit Card', card({ periodStart: '2026-09-19', periodEnd: '2026-10-18', opening: 5000, closing: 8000, totalDue: 8000 }));
    assert.equal(good.status, 'ok');
    const again = checkAgainstHistory(history, 'HDFC Credit Card', card());
    assert.equal(again.alreadyImported, true);
    const first = checkAgainstHistory([], 'HDFC Credit Card', card());
    assert.equal(first.status, 'first');
    const gap = checkAgainstHistory(history, 'HDFC Credit Card', card({ periodStart: '2026-12-19', periodEnd: '2027-01-18', opening: 5000 }));
    assert.equal(gap.status, 'gap');
});

test('net worth: creates, updates, never regresses, adopts hand-made lines', () => {
    const sep = rec(card());
    const first = syncNetWorthFromStatement([], sep, { newId });
    assert.equal(first.items.length, 1);
    assert.equal(first.items[0].category, 'Credit Cards');
    assert.equal(first.items[0].value, 5000);
    assert.equal(first.items[0].invested, 100000);

    const oct = rec(card({ periodEnd: '2026-10-18', opening: 5000, closing: 7000, totalDue: 7000 }));
    const second = syncNetWorthFromStatement(first.items, oct, { newId });
    assert.equal(second.items.length, 1);
    assert.equal(second.items[0].value, 7000);

    // importing an OLDER statement later must not roll the balance back
    const older = syncNetWorthFromStatement(second.items, sep, { newId });
    assert.equal(older.changed, false);
    assert.equal(older.items[0].value, 7000);

    // a line the user made by hand with the same name is adopted
    const hand = [{ id: 'h', category: 'Credit Cards', name: 'hdfc credit card', value: 1, includeInNetWorth: true }];
    const adopted = syncNetWorthFromStatement(hand, sep, { newId });
    assert.equal(adopted.items.length, 1);
    assert.equal(adopted.items[0].id, 'h');
    assert.equal(adopted.items[0].value, 5000);
});

test('net worth: bank accounts use the closing balance', () => {
    const bank = rec({ kind: 'bank', template: 'b', bank: 'ICICI', last4: '2222', periodEnd: '2026-10-31', opening: 100, closing: 250.5, auditStatus: 'verified' }, 'ICICI Debit Card');
    const r = syncNetWorthFromStatement([], bank, { newId });
    assert.equal(r.items[0].category, 'Bank Accounts');
    assert.equal(r.items[0].currentBalance, 250.5);
    assert.equal(r.items[0].value, 250.5);
});

test('card bill: creates a monthly bill and a pending cycle bill; older cycles are preserved for history', () => {
    const sep = rec(card({ dueDate: '2026-10-07' }));
    const p1 = planCardBill({ record: sep, todayIso: '2026-09-25', newId });
    assert.equal(p1.recurring.length, 1);
    assert.equal(p1.recurring[0].monthlyDays, '7');
    assert.equal(p1.recurring[0].cadence, 'monthly');
    assert.equal(p1.billInstances.length, 1);
    assert.equal(p1.billInstances[0].amount, 5000);
    assert.equal(p1.billInstances[0].dueDate, '2026-10-07');

    // same statement again: nothing changes
    const p1b = planCardBill({ recurring: p1.recurring, billInstances: p1.billInstances, record: sep, todayIso: '2026-09-25', newId });
    assert.equal(p1b.changed, false);

    const oct = rec(card({ periodEnd: '2026-10-18', dueDate: '2026-11-07', totalDue: 7000, closing: 7000 }));
    const p2 = planCardBill({ recurring: p1.recurring, billInstances: p1.billInstances, record: oct, todayIso: '2026-10-20', newId });
    assert.equal(p2.recurring.length, 1);
    assert.equal(p2.recurring[0].estimatedAmount, 7000);
    assert.equal(p2.recurring[0].nextDate, '2026-11-07');
    assert.equal(p2.billInstances.length, 2, 'both Sep and Oct cycles are preserved');
    assert.equal(p2.billInstances[0].dueDate, '2026-10-07');
    assert.equal(p2.billInstances[1].dueDate, '2026-11-07');
});

test('card bill: your own recurring item named after the card is adopted, never duplicated', () => {
    // shaped like a hand-made setup: monthly item named after the card, a manually logged pending bill, a manual estimate
    const mine = { id: 'cc', name: 'HDFC Credit Card', type: 'expense', cadence: 'monthly', monthlyDays: '7', amount: 60000, estimatedAmount: 60000, isVariableAmount: true, nextDate: '2026-09-07', startDate: '2026-09-07', category: 'Credit - Bill 💸', active: true };
    const oldManualBill = { id: 'b-old', recurringId: 'cc', name: 'HDFC Credit Card', amount: 80000, dueDate: '2026-09-07', status: 'pending', type: 'expense' };
    const stmt = rec(card({ dueDate: '2026-11-07', totalDue: 150000, closing: 150000, periodEnd: '2026-10-18' }));
    const p = planCardBill({ recurring: [mine], billInstances: [oldManualBill], record: stmt, todayIso: '2026-10-20', newId });
    assert.equal(p.recurring.length, 1, 'no second "bill" item');
    assert.equal(p.recurring[0].id, 'cc');
    assert.equal(p.recurring[0].category, 'Credit - Bill 💸', 'your category is kept');
    assert.equal(p.recurring[0].nextDate, '2026-11-07');
    assert.equal(p.recurring[0].estimatedAmount, 150000);
    assert.equal(p.recurring[0].autoAccount, 'HDFC Credit Card');
    assert.equal(p.billInstances.length, 2, 'both manual bill and statement bill exist');
    assert.equal(p.billInstances[0].dueDate, '2026-09-07');
    assert.equal(p.billInstances[1].dueDate, '2026-11-07');
    assert.equal(p.billInstances[1].recurringId, 'cc');
    assert.equal(p.billInstances[1].name, 'HDFC Credit Card');

    // the due date has already passed: no new bill, but the amount owed follows the statement and existing bill remains
    const past = planCardBill({ recurring: [mine], billInstances: [oldManualBill], record: stmt, todayIso: '2026-11-20', newId });
    assert.equal(past.recurring.length, 1);
    assert.equal(past.recurring[0].estimatedAmount, 150000);
    assert.equal(past.recurring[0].nextDate, '2026-09-07', 'schedule untouched');
    assert.equal(past.billInstances.length, 1);
    assert.equal(past.billInstances[0].dueDate, '2026-09-07');
});

test('card bill: a paid bill is never touched, a past due date creates nothing, zero due creates nothing', () => {
    const sep = rec(card({ dueDate: '2026-10-07' }));
    const p1 = planCardBill({ record: sep, todayIso: '2026-09-25', newId });
    const paid = p1.billInstances.map((b) => ({ ...b, status: 'paid' }));
    const again = planCardBill({ recurring: p1.recurring, billInstances: paid, record: sep, todayIso: '2026-09-26', newId });
    assert.equal(again.billInstances[0].status, 'paid');

    const past = planCardBill({ record: sep, todayIso: '2026-12-01', newId });
    assert.equal(past.changed, false);
    assert.equal(past.recurring.length, 0);

    const zero = planCardBill({ record: rec(card({ totalDue: 0, closing: 0 })), todayIso: '2026-09-25', newId });
    assert.equal(zero.recurring.length, 0);
    assert.equal(zero.billInstances.length, 0);
});
