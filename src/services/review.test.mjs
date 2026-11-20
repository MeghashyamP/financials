import test from 'node:test';
import assert from 'node:assert/strict';
import { groupForReview, applyCategory, learnedMerchants, isNeedsReview, isUserDecision, ruleTextFor } from './review.js';

let n = 0;
const tx = (o) => ({ id: `t${++n}`, type: 'expense', amount: 100, date: '2026-10-01', account: 'SBI Credit Card', category: 'Others - Needs Review 🔍', ...o });

test('needs-review rows group by payee, biggest money first', () => {
    const list = [
        tx({ narration: 'UPI/DR/111111111111/RAMU TEA STALL/SBIN/9876500003@ybl/tea', amount: 20 }),
        tx({ narration: 'UPI/DR/222222222222/RAMU TEA STALL/SBIN/9876500003@ybl/tea', amount: 30, date: '2026-10-05' }),
        tx({ narration: 'UPI/DR/333333333333/SHARMA FLOWERS/SBIN/9876500004@ybl/', amount: 500 }),
        tx({ narration: 'SWIGGY', category: 'Food & Drinks - Fastfood 🍔' })
    ];
    const g = groupForReview(list);
    assert.equal(g.length, 2);
    assert.equal(g[0].count, 1);
    assert.equal(g[0].total, 500);
    assert.equal(g[1].count, 2);
    assert.equal(g[1].total, 50);
    assert.equal(g[1].lastDate, '2026-10-05');
    assert.equal(g[1].ids.length, 2);
    assert.deepEqual(g[1].accounts, ['SBI Credit Card']);
});

test('only Needs Review / Uncategorized rows are included', () => {
    assert.equal(isNeedsReview(tx({})), true);
    assert.equal(isNeedsReview(tx({ category: 'Others - Uncategorized ❓' })), true);
    assert.equal(isNeedsReview(tx({ category: 'Groceries - Staples 🌾' })), false);
    assert.equal(groupForReview([tx({ category: 'Groceries - Staples 🌾' })]).length, 0);
});

test('choosing a transfer category makes the row neutral, and back again', () => {
    const exp = applyCategory(tx({ type: 'expense' }), 'Transfer - Self 🔄');
    assert.equal(exp.type, 'neutral');
    assert.equal(exp.neutralSign, '-');
    assert.equal(exp.categorySource, 'manual');
    const inc = applyCategory(tx({ type: 'income' }), 'Credit - Card 💳');
    assert.equal(inc.neutralSign, '+');
    const back = applyCategory(exp, 'Shopping - Online 🛍️');
    assert.equal(back.type, 'expense');
    assert.equal('neutralSign' in back, false);
    const plain = applyCategory(tx({ type: 'expense' }), 'Groceries - Staples 🌾');
    assert.equal(plain.type, 'expense');
});

test('learned merchants: dominant category, mixed merchants first, auto picks are not decisions', () => {
    const list = [
        tx({ narration: 'APOLLO PHARMACY HYDERABAD', category: 'Medical - Medicines 💊' }),
        tx({ narration: 'APOLLO PHARMACY HYDERABAD', category: 'Medical - Medicines 💊', categorySource: 'manual' }),
        tx({ narration: 'APOLLO PHARMACY HYDERABAD', category: 'Shopping - Online 🛍️', categorySource: 'manual' }),
        tx({ narration: 'BIGBASKET BANGALORE', category: 'Groceries - Staples 🌾', categorySource: 'merchant' }),
        tx({ narration: 'BIGBASKET BANGALORE', category: 'Groceries - Staples 🌾', categorySource: 'merchant' }),
        tx({ narration: 'SOMETHING', category: 'Others - Needs Review 🔍' })
    ];
    const m = learnedMerchants(list);
    assert.equal(m.length, 2);
    assert.equal(m[0].mixed, true);
    assert.equal(m[0].category, 'Medical - Medicines 💊');
    assert.equal(m[0].categories.length, 2);
    assert.equal(m[0].decided, 3);
    assert.equal(m[1].decided, 0, 'dictionary picks are not your decisions');
    assert.equal(isUserDecision({ categorySource: 'merchant' }), false);
    assert.equal(isUserDecision({}), true, 'rows from before sources were tracked count as decisions');
    assert.equal(isUserDecision({ categorySource: 'manual' }), true);
});

test('rule text avoids reference numbers so it matches next month too', () => {
    assert.equal(ruleTextFor('UPI/DR/657931389278/SAMPLE MILK/CNRB/9876500002/milk'), 'SAMPLE MILK');
    assert.equal(ruleTextFor('UPI-SAMPLE TIFFIN CENTRE-9876500005@ybl-UTIB0000-123456789012-NA'), 'SAMPLE TIFFIN CENTRE');
    assert.equal(ruleTextFor('SWIGGYFOODBANGALORE 12345'), 'SWIGGYFOODBANGALORE');
    assert.equal(ruleTextFor('POS 4375XXXX1234 ACME STORES MUMBAI 05/10'), 'ACME STORES MUMBAI');
    assert.equal(ruleTextFor('A2AINT01 - C00000000000000001 - - 50200000000000 - ACME TECH PVT LTD'), 'ACME TECH PVT LTD');
    const g = groupForReview([tx({ narration: 'UPI/DR/111111111111/RAMU TEA STALL/SBIN/9876500003@ybl/tea' })]);
    assert.equal(g[0].ruleText, 'RAMU TEA STALL');
});
