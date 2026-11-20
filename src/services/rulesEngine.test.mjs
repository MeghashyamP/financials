import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeRule, matchesRule, applyRules, revertRuleOnTx, previewRule, impactedBy, validateRule,
    describeRule, sortRules, isConditionFilled
} from './rulesEngine.js';

let n = 0;
const tx = (o) => ({
    id: `t${++n}`, narration: 'SWIGGY BANGALORE', merchant: 'SWIGGY BANGALORE', amount: 350, type: 'expense',
    account: 'HDFC Credit Card', category: 'Others - Needs Review 🔍', tags: [], ...o
});
const rule = (o) => ({
    id: `r${++n}`, version: 2, name: '', match: 'all', enabled: 1, createdAt: `2026-01-0${(n % 9) + 1}`,
    conditions: [{ field: 'narration', op: 'containsAny', value: 'swiggy, zomato' }],
    actions: [{ type: 'setCategory', value: 'Food & Drinks - Delivery 🛵' }], ...o
});

test('older { whenText, thenText } rules still work', () => {
    const legacy = { id: 'old', whenText: 'swiggy', thenText: 'Food & Drinks - Delivery 🛵', enabled: 1, createdAt: '2025-01-01' };
    const r = normalizeRule(legacy);
    assert.equal(r.version, 2);
    assert.equal(r.legacy, true);
    assert.equal(matchesRule(legacy, tx({})), true);
    assert.equal(matchesRule(legacy, tx({ narration: 'AMAZON' })), false);
    const res = applyRules(tx({}), [legacy]);
    assert.equal(res.tx.category, 'Food & Drinks - Delivery 🛵');
});

test('text conditions: any-of, none-of, glued words, regex', () => {
    assert.equal(matchesRule(rule({}), tx({ narration: 'ZOMATOONLINE 8812' })), true);
    assert.equal(matchesRule(rule({}), tx({ narration: 'BIGBASKET' })), false);
    const none = rule({ conditions: [{ field: 'narration', op: 'containsAny', value: 'swiggy' }, { field: 'narration', op: 'notContains', value: 'instamart' }] });
    assert.equal(matchesRule(none, tx({ narration: 'SWIGGY INSTAMART' })), false);
    assert.equal(matchesRule(none, tx({ narration: 'SWIGGY FOOD' })), true);
    const glued = rule({ conditions: [{ field: 'narration', op: 'containsAny', value: 'amazon pay' }] });
    assert.equal(matchesRule(glued, tx({ narration: 'AMAZONPAYINDIA' })), true);
    const rx = rule({ conditions: [{ field: 'narration', op: 'regex', value: '^UPI-.*@ybl$' }] });
    assert.equal(matchesRule(rx, tx({ narration: 'UPI-SHOP-1@ybl' })), true);
    assert.equal(matchesRule(rx, tx({ narration: 'NEFT-SHOP' })), false);
});

test('amount, type, account, category and tag conditions combine with AND (or OR)', () => {
    const r = rule({ conditions: [
        { field: 'narration', op: 'containsAny', value: 'swiggy' },
        { field: 'amount', op: 'gte', value: '300' },
        { field: 'type', op: 'is', value: 'expense' },
        { field: 'account', op: 'is', value: 'HDFC Credit Card' }
    ] });
    assert.equal(matchesRule(r, tx({})), true);
    assert.equal(matchesRule(r, tx({ amount: 100 })), false);
    assert.equal(matchesRule(r, tx({ account: 'SBI Credit Card' })), false);
    const between = rule({ conditions: [{ field: 'amount', op: 'between', value: '100', value2: '400' }] });
    assert.equal(matchesRule(between, tx({ amount: 350 })), true);
    assert.equal(matchesRule(between, tx({ amount: 500 })), false);
    const cat = rule({ conditions: [{ field: 'category', op: 'is', value: 'Food & Drinks' }] });
    assert.equal(matchesRule(cat, tx({ category: 'Food & Drinks - Lunch 🍱' })), true, 'a group name matches its sub-categories');
    const tag = rule({ conditions: [{ field: 'tag', op: 'hasNot', value: 'reviewed' }] });
    assert.equal(matchesRule(tag, tx({ tags: ['Reviewed'] })), false);
    assert.equal(matchesRule(tag, tx({ tags: [] })), true);
    const any = rule({ match: 'any', conditions: [{ field: 'narration', op: 'containsAny', value: 'nomatch' }, { field: 'amount', op: 'eq', value: '350' }] });
    assert.equal(matchesRule(any, tx({})), true);
});

test('a rule with no filled condition never matches anything', () => {
    const empty = rule({ conditions: [{ field: 'narration', op: 'containsAny', value: '' }] });
    assert.equal(matchesRule(empty, tx({})), false);
    assert.equal(isConditionFilled({ field: 'amount', op: 'between', value: '1', value2: '' }), false);
    assert.match(validateRule(empty), /at least one condition/);
    assert.match(validateRule(rule({ conditions: [{ field: 'narration', op: 'regex', value: '(' }] })), /not a valid pattern/);
    assert.match(validateRule(rule({ actions: [{ type: 'addTags', value: '' }] })), /what the rule should do/);
    assert.equal(validateRule(rule({})), null);
});

test('actions: set category, add tags, remove tags — and every change is recorded', () => {
    const r = rule({ actions: [
        { type: 'setCategory', value: 'Food & Drinks - Delivery 🛵' },
        { type: 'addTags', value: 'eating out, review' },
        { type: 'removeTags', value: 'todo' }
    ] });
    const res = applyRules(tx({ tags: ['todo', 'keep'] }), [r]);
    assert.equal(res.changed, true);
    assert.equal(res.tx.category, 'Food & Drinks - Delivery 🛵');
    assert.equal(res.tx.categorySource, 'rule');
    assert.deepEqual(res.tx.tags, ['keep', 'eating out', 'review']);
    const delta = res.tx.ruleChanges[r.id];
    assert.equal(delta.category.from, 'Others - Needs Review 🔍');
    assert.deepEqual(delta.tagsAdded, ['eating out', 'review']);
    assert.deepEqual(delta.tagsRemoved, ['todo']);
    // applying again changes nothing and keeps the record
    const again = applyRules(res.tx, [r]);
    assert.equal(again.changed, false);
    assert.deepEqual(again.tx.ruleChanges[r.id], delta);
});

test('a category you set by hand is not overwritten unless asked', () => {
    const r = rule({});
    const mine = tx({ category: 'Shopping - Online 🛍️', categorySource: 'manual' });
    const res = applyRules(mine, [r]);
    assert.equal(res.tx.category, 'Shopping - Online 🛍️');
    assert.equal(res.skippedManual, 1);
    assert.equal(res.changed, false);
    const forced = applyRules(mine, [r], { overwriteManual: true });
    assert.equal(forced.tx.category, 'Food & Drinks - Delivery 🛵');
    assert.equal(forced.tx.ruleChanges[r.id].category.from, 'Shopping - Online 🛍️');
});

test('disabled rules and deleted categories do nothing; rules run oldest first (newest category wins)', () => {
    assert.equal(applyRules(tx({}), [rule({ enabled: 0 })]).changed, false);
    assert.equal(applyRules(tx({}), [rule({})], { pool: ['Other - X'] }).changed, false, 'category not in the list');
    const older = rule({ id: 'a', createdAt: '2026-01-01', actions: [{ type: 'setCategory', value: 'Food & Drinks - Delivery 🛵' }] });
    const newer = rule({ id: 'b', createdAt: '2026-02-01', actions: [{ type: 'setCategory', value: 'Food & Drinks - Fastfood 🍔' }] });
    const res = applyRules(tx({}), [newer, older]);
    assert.equal(res.tx.category, 'Food & Drinks - Fastfood 🍔');
    assert.ok(res.tx.ruleChanges.a && res.tx.ruleChanges.b);
    assert.deepEqual(sortRules([newer, older]).map((r) => r.id), ['a', 'b']);
});

test('a transfer category flips the type to neutral and reverting flips it back', () => {
    const r = rule({ actions: [{ type: 'setCategory', value: 'Transfer - Self 🔄' }] });
    const res = applyRules(tx({ type: 'expense' }), [r]);
    assert.equal(res.tx.type, 'neutral');
    assert.equal(res.tx.neutralSign, '-');
    const back = revertRuleOnTx(res.tx, r.id);
    assert.equal(back.tx.type, 'expense');
    assert.equal('neutralSign' in back.tx, false);
    assert.equal(back.typeChanged, true);
    assert.equal(back.tx.category, 'Others - Needs Review 🔍');
    assert.equal('ruleChanges' in back.tx, false);
});

test('reverting restores what the rule changed and respects later edits', () => {
    const r = rule({ actions: [{ type: 'setCategory', value: 'Food & Drinks - Delivery 🛵' }, { type: 'addTags', value: 'eating out' }, { type: 'removeTags', value: 'todo' }] });
    const applied = applyRules(tx({ tags: ['todo', 'keep'] }), [r]).tx;
    const back = revertRuleOnTx(applied, r.id);
    assert.equal(back.changed, true);
    assert.equal(back.tx.category, 'Others - Needs Review 🔍');
    assert.deepEqual(back.tx.tags.sort(), ['keep', 'todo']);

    // you changed the category afterwards → the revert leaves your choice, but still undoes the tags
    const edited = { ...applied, category: 'Entertainment - Movies 🎬', categorySource: 'manual' };
    const partial = revertRuleOnTx(edited, r.id);
    assert.equal(partial.tx.category, 'Entertainment - Movies 🎬');
    assert.deepEqual(partial.tx.tags.sort(), ['keep', 'todo']);

    // a transaction the rule never touched is returned as is
    const untouched = tx({});
    assert.equal(revertRuleOnTx(untouched, r.id).changed, false);
});

test('two rules on one transaction revert independently', () => {
    const a = rule({ id: 'ra', createdAt: '2026-01-01', actions: [{ type: 'addTags', value: 'one' }] });
    const b = rule({ id: 'rb', createdAt: '2026-01-02', actions: [{ type: 'addTags', value: 'two' }] });
    const both = applyRules(tx({}), [a, b]).tx;
    assert.deepEqual(both.tags, ['one', 'two']);
    const noA = revertRuleOnTx(both, 'ra').tx;
    assert.deepEqual(noA.tags, ['two']);
    assert.ok(noA.ruleChanges.rb && !noA.ruleChanges.ra);
});

test('preview counts matching, changing, already-done and hand-set transactions', () => {
    const r = rule({});
    const list = [
        tx({}),
        tx({ category: 'Food & Drinks - Delivery 🛵' }),
        tx({ category: 'Shopping - Online 🛍️', categorySource: 'manual' }),
        tx({ narration: 'AMAZON' })
    ];
    const p = previewRule(r, list);
    assert.deepEqual({ m: p.matching, c: p.willChange, d: p.alreadyDone, s: p.skippedManual }, { m: 3, c: 1, d: 1, s: 1 });
    assert.equal(p.changeSamples[0].after.category, 'Food & Drinks - Delivery 🛵');
    const forced = previewRule(r, list, { overwriteManual: true });
    assert.equal(forced.willChange, 2);
});

test('impactedBy lists exactly the transactions a rule changed', () => {
    const r = rule({});
    const list = [applyRules(tx({}), [r]).tx, tx({ narration: 'OTHER' }), applyRules(tx({}), [r]).tx];
    assert.equal(impactedBy(list, r.id).length, 2);
    assert.equal(impactedBy(list, 'nope').length, 0);
});

test('rules read back in plain words', () => {
    const r = rule({ conditions: [{ field: 'narration', op: 'containsAny', value: 'swiggy, zomato' }, { field: 'amount', op: 'gte', value: '500' }], actions: [{ type: 'setCategory', value: 'Food' }, { type: 'addTags', value: 'a, b' }] });
    const d = describeRule(r);
    assert.equal(d.when, 'narration contains any of “swiggy”, “zomato” and amount is at least 500');
    assert.equal(d.then, 'set category to Food; add tags a, b');
});
