import test from 'node:test';
import assert from 'node:assert/strict';
import { matchCardPayments, matchSelfTransfers, matchRefunds, matchAcrossStatements } from './crossMatch.js';

const profiles = {
    'HDFC Debit Card': { type: 'bank', bank: 'HDFC' },
    'SBI Debit Card': { type: 'bank', bank: 'SBI' },
    'HDFC Credit Card': { type: 'credit_card', bank: 'HDFC' }
};
let n = 0;
const tx = (o) => ({ id: `t${++n}`, narration: '', ...o });

test('bank card-bill payment pairs with the card statement credit, nearest date wins', () => {
    const bank1 = tx({ date: '2026-10-05', amount: 50000, type: 'neutral', neutralSign: '-', account: 'HDFC Debit Card', category: 'Credit - Bill 💳', narration: 'CC PAYMENT HDFC' });
    const bank2 = tx({ date: '2026-10-20', amount: 50000, type: 'neutral', neutralSign: '-', account: 'HDFC Debit Card', category: 'Credit - Bill 💳' });
    const card1 = tx({ date: '2026-10-06', amount: 50000, type: 'neutral', neutralSign: '+', account: 'HDFC Credit Card', narration: 'PAYMENT RECEIVED' });
    const card2 = tx({ date: '2026-10-22', amount: 50000, type: 'neutral', neutralSign: '+', account: 'HDFC Credit Card' });
    const stray = tx({ date: '2026-10-10', amount: 1234, type: 'neutral', neutralSign: '+', account: 'HDFC Credit Card' });
    const r = matchCardPayments([bank2, card2, bank1, card1, stray], profiles);
    assert.equal(r.pairs.length, 2);
    const first = r.pairs.find((p) => p.bank.id === bank1.id);
    assert.equal(first.card.id, card1.id);
    assert.equal(first.daysApart, 1);
    assert.deepEqual(r.unmatchedCard.map((t) => t.id), [stray.id]);
    assert.equal(r.unmatchedBank.length, 0);
});

test('payment more than a week apart, or a different amount, does not match', () => {
    const bank = tx({ date: '2026-10-01', amount: 100, type: 'neutral', neutralSign: '-', account: 'HDFC Debit Card', category: 'Credit - Bill 💳' });
    const late = tx({ date: '2026-10-20', amount: 100, type: 'neutral', neutralSign: '+', account: 'HDFC Credit Card' });
    const other = tx({ date: '2026-10-02', amount: 150, type: 'neutral', neutralSign: '+', account: 'HDFC Credit Card' });
    const r = matchCardPayments([bank, late, other], profiles);
    assert.equal(r.pairs.length, 0);
    assert.equal(r.unmatchedBank.length, 1);
});

test('a payment rounded to the rupee still matches, a real difference does not', () => {
    const bank = tx({ date: '2026-10-04', amount: 90000, type: 'neutral', neutralSign: '-', account: 'HDFC Debit Card', category: 'Credit - Bill 💳' });
    const card = tx({ date: '2026-10-04', amount: 90003, type: 'neutral', neutralSign: '+', account: 'HDFC Credit Card' });
    assert.equal(matchCardPayments([bank, card], profiles).pairs.length, 1);
    const far = tx({ date: '2026-10-04', amount: 90012, type: 'neutral', neutralSign: '+', account: 'HDFC Credit Card' });
    assert.equal(matchCardPayments([bank, far], profiles).pairs.length, 0);
});

test('own-account transfers need two different accounts', () => {
    const out = tx({ date: '2026-10-03', amount: 7000, type: 'neutral', neutralSign: '-', account: 'HDFC Debit Card', category: 'Transfer - Self 🔄' });
    const inn = tx({ date: '2026-10-03', amount: 7000, type: 'neutral', neutralSign: '+', account: 'SBI Debit Card', category: 'Transfer - Self 🔄' });
    const same = tx({ date: '2026-10-03', amount: 7000, type: 'neutral', neutralSign: '+', account: 'HDFC Debit Card', category: 'Transfer - Self 🔄' });
    const r = matchSelfTransfers([out, same, inn], profiles);
    assert.equal(r.pairs.length, 1);
    assert.equal(r.pairs[0].to.id, inn.id);
    assert.deepEqual(r.unmatchedIn.map((t) => t.id), [same.id]);
});

test('a refund links to the purchase it reverses', () => {
    const buy = tx({ date: '2026-09-01', amount: 999, type: 'expense', account: 'HDFC Credit Card', narration: 'AMAZON PAY INDIA BANGALORE', category: 'Shopping - Online 🛍️' });
    const buy2 = tx({ date: '2026-09-10', amount: 999, type: 'expense', account: 'HDFC Credit Card', narration: 'AMAZON PAY INDIA BANGALORE', category: 'Shopping - Online 🛍️' });
    const refund = tx({ date: '2026-09-20', amount: 999, type: 'income', account: 'HDFC Credit Card', narration: 'AMAZON PAY INDIA BANGALORE', category: 'Income - Refund 🔙' });
    const r = matchRefunds([buy, buy2, refund]);
    assert.equal(r.pairs.length, 1);
    assert.equal(r.pairs[0].purchase.id, buy2.id, 'closest earlier purchase');
    assert.equal(r.pairs[0].partial, false);
    const partial = matchRefunds([buy, tx({ date: '2026-09-05', amount: 400, type: 'income', account: 'HDFC Credit Card', narration: 'AMAZON PAY INDIA BANGALORE', category: 'Income - Refund 🔙' })]);
    assert.equal(partial.pairs[0].partial, true);
    const none = matchRefunds([refund]);
    assert.equal(none.unmatched.length, 1);
});

test('lookup table covers both sides of every pair', () => {
    const bank = tx({ date: '2026-10-05', amount: 10, type: 'neutral', neutralSign: '-', account: 'HDFC Debit Card', category: 'Credit - Bill 💳' });
    const card = tx({ date: '2026-10-05', amount: 10, type: 'neutral', neutralSign: '+', account: 'HDFC Credit Card' });
    const all = matchAcrossStatements([bank, card], profiles);
    assert.equal(all.byTx[bank.id].otherId, card.id);
    assert.equal(all.byTx[card.id].otherId, bank.id);
});
