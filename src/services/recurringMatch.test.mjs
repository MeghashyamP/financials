import test from 'node:test';
import assert from 'node:assert/strict';
import { expandOccurrences, planRecurringMatches, learnNarrations, isAutoApplied } from './recurringMatch.js';

// stand-in for the app's date engine: monthly on item.day (or yearly / once)
const next = (item, fromIso) => {
    if (item.cadence === 'once') return item.startDate >= fromIso ? item.startDate : '';
    let [y, m] = fromIso.split('-').map(Number);
    for (let i = 0; i < 30; i++) {
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(item.day).padStart(2, '0')}`;
        if (iso >= fromIso && (!item.startDate || iso >= item.startDate) && (!item.endDate || iso <= item.endDate)) return iso;
        m += 1; if (m > 12) { m = 1; y += 1; }
    }
    return '';
};

const rec = (o) => ({ id: o.name, type: 'expense', cadence: 'monthly', active: true, ...o });
const RENT = rec({ name: 'Home Rent', day: 5, amount: 12000, startDate: '2026-06-05' });
const LOAN = rec({ name: 'Home Loan', day: 15, amount: 90000, startDate: '2026-06-15' });
const SIP_A = rec({ name: 'SIP Alpha', day: 15, amount: 1000, startDate: '2026-06-15' });
const SIP_B = rec({ name: 'SIP Beta', day: 15, amount: 1000, startDate: '2026-06-15' });
const ELEC = rec({ name: 'Electricity', day: 16, amount: 1000, estimatedAmount: 1000, isVariableAmount: true, startDate: '2026-06-16' });
const SALARY = rec({ name: 'Salary', type: 'income', day: 4, amount: 100000, startDate: '2026-06-04' });

const row = (o) => ({ type: 'expense', amount: 100, date: '2026-10-05', narration: 'X', ...o });
const plan = (rows, recurring, existing = []) => planRecurringMatches({ rows, recurring, existing, nextOccurrence: next, todayIso: '2026-11-20' });

test('schedule expands into every due date in a range', () => {
    assert.deepEqual(expandOccurrences(RENT, '2026-08-01', '2026-10-31', next), ['2026-08-05', '2026-09-05', '2026-10-05']);
    assert.deepEqual(expandOccurrences(RENT, '2026-11-06', '2026-11-30', next), []);
});

test('a forgotten year: each month of rows lands on its own month', () => {
    const rows = [
        row({ date: '2026-08-04', amount: 12000, narration: 'UPI-LANDLORD' }),
        row({ date: '2026-09-06', amount: 12000, narration: 'UPI-LANDLORD' }),
        row({ date: '2026-10-05', amount: 12000, narration: 'UPI-LANDLORD' })
    ];
    const { matches } = plan(rows, [RENT]);
    assert.deepEqual(matches.map((m) => m && m.occurrence), ['2026-08-05', '2026-09-05', '2026-10-05']);
    assert.ok(matches.every((m) => isAutoApplied(m)), 'fixed amount, right date → pre-accepted');
});

test('amount, direction and date must fit', () => {
    assert.equal(plan([row({ amount: 12500, date: '2026-10-05' })], [RENT]).matches[0], null, 'fixed bill ₹500 off');
    assert.equal(plan([row({ amount: 12000, date: '2026-10-25' })], [RENT]).matches[0], null, 'too far from the due date');
    assert.equal(plan([row({ amount: 12000, type: 'income' })], [RENT]).matches[0], null, 'money in is not rent');
    assert.equal(plan([row({ amount: 100000, type: 'income', date: '2026-10-04' })], [SALARY]).matches[0].recurringId, 'Salary');
});

test('a credit-card bill paid from the bank (neutral debit) can match a bill item', () => {
    const cc = rec({ name: 'Card Bill', day: 7, amount: 50000, estimatedAmount: 50000, isVariableAmount: true, startDate: '2026-06-07' });
    const m = plan([row({ type: 'neutral', neutralSign: '-', amount: 52000, date: '2026-10-07', narration: 'UPI-CRED Club' })], [cc]).matches[0];
    assert.equal(m.recurringId, 'Card Bill');
});

test('same amount on the same day for two items is not guessed — both are offered', () => {
    const { matches } = plan([row({ amount: 1000, date: '2026-10-15', narration: 'ACH D-MUTUAL' })], [SIP_A, SIP_B]);
    assert.equal(matches[0].confidence, 'low');
    assert.equal(isAutoApplied(matches[0]), false);
    assert.deepEqual(matches[0].alternatives.map((a) => a.name).sort(), ['SIP Alpha', 'SIP Beta']);
});

test('text learned from earlier linked rows breaks the tie and is trusted', () => {
    const existing = [{ id: 't1', date: '2026-09-15', amount: 1000, linkedRecurringId: 'SIP Beta', narration: 'ACH D- BETAFUND-123456' }];
    const { matches } = plan([row({ amount: 1000, date: '2026-10-15', narration: 'ACH D- BETAFUND-998877' })], [SIP_A, SIP_B], existing);
    assert.equal(matches[0].recurringId, 'SIP Beta');
    assert.equal(matches[0].confidence, 'high');
    assert.equal(matches[0].reason, 'learned');
    assert.ok(learnNarrations(existing).get('SIP Beta').size === 1);
});

test('the item name in the narration counts as a hit; a variable bill matches on rough amount', () => {
    const named = plan([row({ amount: 90000, date: '2026-10-15', narration: 'EMI HOME LOAN ACCOUNT' })], [LOAN]).matches[0];
    assert.equal(named.recurringId, 'Home Loan');
    assert.equal(named.reason, 'name');
    const elec = plan([row({ amount: 1180, date: '2026-10-18', narration: 'BILLDESK POWER' })], [ELEC]).matches[0];
    assert.equal(elec.recurringId, 'Electricity');
    assert.notEqual(elec.confidence, 'high', 'variable + no text → at best medium/low');
});

test('already-paid dates are not matched again, skipped rows are ignored', () => {
    const paid = [{ id: 'p', date: '2026-10-05', amount: 12000, linkedRecurringId: 'Home Rent', narration: 'rent' }];
    assert.equal(plan([row({ amount: 12000 })], [RENT], paid).matches[0], null);
    assert.equal(plan([row({ amount: 12000, skip: true })], [RENT]).matches[0], null);
});

test('one row fills one date; the second identical row stays unmatched', () => {
    const { matches } = plan([row({ amount: 12000 }), row({ amount: 12000, date: '2026-10-06' })], [RENT]);
    assert.equal(matches.filter(Boolean).length, 1);
});

test('missed: scheduled dates inside the statement range with no matching row', () => {
    const rows = [row({ amount: 12000, date: '2026-09-05' }), row({ amount: 100, date: '2026-10-30', narration: 'COFFEE' })];
    const { matches, missed } = plan(rows, [RENT, LOAN]);
    assert.equal(matches[0].recurringId, 'Home Rent');
    const labels = missed.map((m) => `${m.name} ${m.date}`);
    assert.ok(labels.includes('Home Loan 2026-09-15'));
    assert.ok(labels.includes('Home Loan 2026-10-15'));
    assert.ok(labels.includes('Home Rent 2026-10-05'));
    assert.ok(!labels.includes('Home Rent 2026-09-05'), 'that one was matched');
    assert.ok(!labels.some((l) => l.includes('2026-11')), 'nothing beyond the statement range');
});

test('ended or inactive items produce nothing', () => {
    const ended = rec({ name: 'Old', day: 5, amount: 12000, startDate: '2026-01-05', endDate: '2026-08-05' });
    assert.equal(plan([row({ amount: 12000 })], [ended]).matches[0], null);
    assert.equal(plan([row({ amount: 12000 })], [{ ...RENT, active: false }]).matches[0], null);
});
