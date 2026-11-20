import test from 'node:test';
import assert from 'node:assert/strict';
import { planImport, mergeIntoPlaceholder, isDashboardPlaceholder, narrationsAlike, directionOf, summarizePlan } from './importDedupe.js';

let n = 0;
const tx = (o) => ({ id: `e${++n}`, type: 'expense', amount: 100, account: 'HDFC Debit Card', date: '2026-10-05', narration: 'SOMETHING', ...o });
const row = (o) => {
    const r = { type: 'expense', amount: 100, account: 'HDFC Debit Card', date: '2026-10-05', narration: 'SOMETHING', ...o };
    r.merchant = r.merchant || r.narration;
    r.fingerprint = r.fingerprint || `${r.date}|${r.narration.toLowerCase()}|${Number(r.amount).toFixed(2)}|${r.account.toLowerCase()}|${r.type}`;
    return r;
};
const placeholder = (o) => tx({
    narration: 'Home Rent', merchant: 'Home Rent', amount: 12000, date: '2026-10-05', account: 'Bank 1',
    linkedRecurringId: 'rec-rent', source: 'dashboard', notes: 'Created Outflow from Dashboard on 05/Oct/2026', category: 'Utilities - Rent 🏠', tags: [], ...o
});

test('direction: income/credit in, expense/debit out, neutral follows its sign', () => {
    assert.equal(directionOf({ type: 'income' }), 'credit');
    assert.equal(directionOf({ type: 'expense' }), 'debit');
    assert.equal(directionOf({ type: 'neutral', neutralSign: '-' }), 'debit');
    assert.equal(directionOf({ type: 'neutral', neutralSign: '+' }), 'credit');
});

test('narrations from two statements are recognised as the same payee', () => {
    assert.equal(narrationsAlike('UPI-SWIGGY-swiggy@ybl-123', 'UPI-SWIGGY-swiggy@ybl-123456'), true);
    assert.equal(narrationsAlike('IMPS-629655634390-RAVI KUMAR-ICIC-xxxxxx', 'IMPS 629655634390 RAVI KUMAR ICIC'), true);
    assert.equal(narrationsAlike('AMAZON PAY INDIA', 'BIGBASKET GROCERIES'), false);
    assert.equal(narrationsAlike('', 'x'), false);
});

test('an overlapping statement: rows already saved are duplicates, only new rows are inserted', () => {
    const a = row({ date: '2026-10-10', narration: 'AMAZON PAY', amount: 500 });
    const b = row({ date: '2026-10-12', narration: 'NETFLIX', amount: 649 });
    const existing = [{ ...tx(a), fingerprint: a.fingerprint }, { ...tx(b), fingerprint: b.fingerprint }];
    const fresh = row({ date: '2026-10-20', narration: 'BIGBASKET', amount: 1200 });
    const plan = planImport([a, b, fresh], existing);
    assert.deepEqual(plan.map((p) => p.action), ['duplicate', 'duplicate', 'insert']);
    assert.deepEqual(summarizePlan(plan), { insert: 1, duplicate: 2, 'maybe-duplicate': 0, replace: 0 });
});

test('identical rows are matched one-to-one (two ₹20 payments, one already saved)', () => {
    const first = row({ narration: 'TEA STALL', amount: 20 });
    const second = row({ narration: 'TEA STALL', amount: 20, fingerprint: `${first.fingerprint}#2` });
    const existing = [{ ...tx(first), fingerprint: first.fingerprint }];
    const plan = planImport([first, second], existing);
    assert.deepEqual(plan.map((p) => p.action), ['duplicate', 'insert']);
});

test('same day, amount and reference number but different narration text is still a duplicate', () => {
    const existing = [tx({ narration: 'Rent to landlord (renamed by me)', refId: 'UTR123456', amount: 12000, fingerprint: 'old|fp' })];
    const plan = planImport([row({ narration: 'NEFT-UTR123456-LANDLORD', refId: 'UTR123456', amount: 12000 })], existing);
    assert.equal(plan[0].action, 'duplicate');
    assert.equal(plan[0].reason, 'same-details');
});

test('same day and amount with nothing else in common is only a maybe-duplicate', () => {
    const existing = [tx({ narration: 'CASH PAID TO PLUMBER', amount: 750, fingerprint: 'x' })];
    const plan = planImport([row({ narration: 'UPI-GROCERY MART-123', amount: 750 })], existing);
    assert.equal(plan[0].action, 'maybe-duplicate');
    assert.equal(plan[0].matchLabel, 'CASH PAID TO PLUMBER');
});

test('different account or direction is not a duplicate', () => {
    const existing = [tx({ narration: 'AMAZON PAY', amount: 500, fingerprint: 'x' })];
    assert.equal(planImport([row({ narration: 'AMAZON PAY', amount: 500, account: 'SBI Credit Card' })], existing)[0].action, 'insert');
    assert.equal(planImport([row({ narration: 'AMAZON PAY', amount: 500, type: 'income' })], existing)[0].action, 'insert');
});

test('rows saved before type was part of the fingerprint still count as already imported', () => {
    const old = row({ narration: 'ZOMATO', amount: 300 });
    const legacy = `${old.date}|zomato|300.00|${old.account.toLowerCase()}`;
    const existing = [tx({ narration: 'ZOMATO', amount: 300, fingerprint: legacy })];
    assert.equal(planImport([old], existing)[0].action, 'duplicate');
});

test('a Dashboard payment is replaced by the matching statement row', () => {
    const ph = placeholder();
    assert.equal(isDashboardPlaceholder(ph), true);
    const incoming = row({ narration: 'UPI-LANDLORD NAME-9876@ybl-HDFC0001-123456789012', amount: 12000, date: '2026-10-06' });
    const plan = planImport([incoming], [ph], { recurring: [{ id: 'rec-rent', isVariableAmount: false }] });
    assert.equal(plan[0].action, 'replace');
    assert.equal(plan[0].matchId, ph.id);

    const merged = mergeIntoPlaceholder(ph, { ...incoming, category: 'Others - Needs Review 🔍', categorySource: 'unknown', tags: [], source: 'pdf-import', documentId: 'doc1' });
    assert.equal(merged.id, ph.id, 'the transaction keeps its id');
    assert.equal(merged.date, '2026-10-06');
    assert.equal(merged.narration, incoming.narration);
    assert.equal(merged.account, 'HDFC Debit Card');
    assert.equal(merged.linkedRecurringId, 'rec-rent', 'still linked to the recurring item');
    assert.equal(merged.category, 'Utilities - Rent 🏠', 'your recurring category survives an auto-guessed one');
    assert.equal(merged.categorySource, 'recurring');
    assert.equal(merged.fingerprint, incoming.fingerprint);
    assert.equal(merged.documentId, 'doc1');
    assert.match(merged.notes, /Matched your Dashboard payment/);
    const nice = mergeIntoPlaceholder(ph, incoming, { fmtDate: (d) => `<${d}>` });
    assert.match(nice.notes, /of <2026-10-05>/, 'dates in notes follow the date-format setting');
    assert.equal(isDashboardPlaceholder(merged), false, 'it is a real transaction now');
});

test('placeholder matching: fixed amounts must match, variable amounts may differ, window and direction apply', () => {
    const ph = placeholder();
    const fixed = [{ id: 'rec-rent', isVariableAmount: false }];
    assert.equal(planImport([row({ amount: 12300, date: '2026-10-05' })], [ph], { recurring: fixed })[0].action, 'insert', '₹300 off on a fixed bill');
    const variable = [{ id: 'rec-rent', isVariableAmount: true, estimatedAmount: 12000 }];
    assert.equal(planImport([row({ amount: 12300, date: '2026-10-05' })], [ph], { recurring: variable })[0].action, 'replace');
    assert.equal(planImport([row({ amount: 12000, date: '2026-10-20' })], [ph], { recurring: fixed })[0].action, 'insert', 'outside the window');
    assert.equal(planImport([row({ amount: 12000, type: 'income' })], [ph], { recurring: fixed })[0].action, 'insert', 'wrong direction');
    // ticked late: the placeholder is dated today but the scheduled date is what counts
    const late = placeholder({ date: '2026-10-25', scheduledDate: '2026-10-05' });
    assert.equal(planImport([row({ amount: 12000, date: '2026-10-06' })], [late], { recurring: fixed })[0].action, 'replace');
});

test('each Dashboard payment is used once, the closest row wins', () => {
    const ph = placeholder();
    const near = row({ amount: 12000, date: '2026-10-05', narration: 'RENT A' });
    const far = row({ amount: 12000, date: '2026-10-09', narration: 'RENT B' });
    const plan = planImport([far, near], [ph], { recurring: [{ id: 'rec-rent' }] });
    assert.deepEqual(plan.map((p) => p.action), ['insert', 'replace']);
});

test('a bank card-bill payment (neutral debit) can replace a ticked credit-card bill', () => {
    const ph = placeholder({ narration: 'HDFC Credit Card', merchant: 'HDFC Credit Card', amount: 50000, linkedRecurringId: 'rec-cc', category: 'Credit - Bill 💸', date: '2026-10-07' });
    const incoming = row({ type: 'neutral', neutralSign: '-', amount: 50000, date: '2026-10-07', narration: 'UPI-CRED Club-cred.club@axisb' });
    const plan = planImport([incoming], [ph], { recurring: [{ id: 'rec-cc', isVariableAmount: true, estimatedAmount: 50000 }] });
    assert.equal(plan[0].action, 'replace');
    const merged = mergeIntoPlaceholder(ph, { ...incoming, category: 'Credit - Card 💳', categorySource: 'card-payment' });
    assert.equal(merged.type, 'neutral');
    assert.equal(merged.neutralSign, '-');
    assert.equal(merged.category, 'Credit - Card 💳', 'transfer-type rows keep the statement category so type and category agree');
});

test('a duplicate row never also consumes a Dashboard payment', () => {
    const ph = placeholder();
    const saved = row({ amount: 12000, date: '2026-10-05', narration: 'RENT REAL' });
    const existing = [{ ...tx(saved), fingerprint: saved.fingerprint }, ph];
    const plan = planImport([saved], existing, { recurring: [{ id: 'rec-rent' }] });
    assert.equal(plan[0].action, 'duplicate');
});

test('rule-chosen categories and tags survive the merge', () => {
    const ph = placeholder({ tags: ['home'] });
    const incoming = row({ amount: 12000, category: 'Home - Essentials 🧻', categorySource: 'rule', tags: ['rent-rule'], ruleChanges: { r1: { category: { from: 'x', to: 'y' } } } });
    const merged = mergeIntoPlaceholder(ph, incoming);
    assert.equal(merged.category, 'Home - Essentials 🧻');
    assert.deepEqual(merged.tags.sort(), ['home', 'rent-rule']);
    assert.ok(merged.ruleChanges.r1);
});
