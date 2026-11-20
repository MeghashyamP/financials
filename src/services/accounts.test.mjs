import test from 'node:test';
import assert from 'node:assert/strict';
import {
    seedDefaultAccounts, DEFAULT_ACCOUNTS, bankKeyFromIssuer,
    matchAccountForStatement, resolveStatementAccount, learnProfileFromStatement
} from './accounts.js';

const names = DEFAULT_ACCOUNTS.map((d) => d.name);

test('fresh install and old placeholder lists get the six default accounts', () => {
    for (const accounts of [[], undefined, ['Bank 1', 'Bank 2', 'Credit Card 1'], ['Main Checking', 'Everyday Visa', 'Rewards Card', 'Cash']]) {
        const r = seedDefaultAccounts({ accounts });
        assert.deepEqual(r.accounts, names);
        assert.equal(r.changed, true);
        assert.equal(r.accountProfiles['HDFC Credit Card'].type, 'credit_card');
        assert.equal(r.accountProfiles['SBI Debit Card'].type, 'bank');
    }
});

test('placeholder accounts that transactions already use are kept', () => {
    const r = seedDefaultAccounts({ accounts: ['Bank 1', 'Bank 2', 'Credit Card 1'] }, ['Bank 2']);
    assert.deepEqual(r.accounts, [...names, 'Bank 2']);
});

test('an existing user keeps their accounts and only gains the missing defaults, once', () => {
    const first = seedDefaultAccounts({ accounts: ['hdfc credit card', 'Cash'] });
    assert.deepEqual(first.accounts, ['hdfc credit card', 'Cash', ...names.filter((n) => n !== 'HDFC Credit Card')]);
    assert.equal(first.accountProfiles['hdfc credit card'].bank, 'HDFC');
    // second run (flag set): nothing re-added even if the user deleted a default
    const again = seedDefaultAccounts({ accounts: ['Cash'], accountsSeededV1: true, accountProfiles: {} });
    assert.deepEqual(again.accounts, ['Cash']);
    assert.equal(again.changed, false);
});

test('bank key from issuer names', () => {
    assert.equal(bankKeyFromIssuer('HDFC Bank'), 'HDFC');
    assert.equal(bankKeyFromIssuer('SBI Card'), 'SBI');
    assert.equal(bankKeyFromIssuer('State Bank of India'), 'SBI');
    assert.equal(bankKeyFromIssuer('ICICI Bank'), 'ICICI');
    assert.equal(bankKeyFromIssuer('Some Credit Union'), '');
});

const settings = () => ({
    accounts: names,
    accountProfiles: Object.fromEntries(DEFAULT_ACCOUNTS.map((d) => [d.name, { type: d.type, bank: d.bank }]))
});

test('statement matches the single account of that bank and type', () => {
    const m = matchAccountForStatement(settings(), { kind: 'card', bank: 'SBI', last4: '85' });
    assert.deepEqual(m, { name: 'SBI Credit Card', by: 'bank' });
    assert.equal(matchAccountForStatement(settings(), { kind: 'bank', bank: 'Axis', last4: '1' }), null);
});

test('number match beats bank match; SBI cards only print two digits', () => {
    const s = settings();
    s.accountProfiles['HDFC Credit Card'].last4 = '4321';
    s.accountProfiles['SBI Credit Card'].last4 = '4485';
    assert.equal(matchAccountForStatement(s, { kind: 'card', bank: 'SBI', last4: '85' }).by, 'last4');
    assert.equal(matchAccountForStatement(s, { kind: 'card', bank: 'HDFC', last4: '4321' }).name, 'HDFC Credit Card');
});

test('picking the wrong account in the dropdown is corrected or warned about', () => {
    const s = settings();
    // default dropdown value is the first account; an SBI card statement is dropped on it
    const r = resolveStatementAccount(s, { kind: 'card', bank: 'SBI', last4: '85' }, 'HDFC Credit Card');
    assert.equal(r.account, 'SBI Credit Card');
    assert.equal(r.switched, true);
    // a custom account with no bank is left alone
    const keep = resolveStatementAccount({ ...s, accounts: [...s.accounts, 'My Card'], accountProfiles: { ...s.accountProfiles, 'My Card': {} } }, { kind: 'card', bank: 'SBI', last4: '85' }, 'My Card');
    assert.equal(keep.account, 'My Card');
    // ambiguous: two SBI cards → cannot decide, warn
    const two = { accounts: ['SBI A', 'SBI B', 'HDFC Credit Card'], accountProfiles: { 'SBI A': { type: 'credit_card', bank: 'SBI' }, 'SBI B': { type: 'credit_card', bank: 'SBI' }, 'HDFC Credit Card': { type: 'credit_card', bank: 'HDFC' } } };
    const w = resolveStatementAccount(two, { kind: 'card', bank: 'SBI', last4: '85' }, 'HDFC Credit Card');
    assert.equal(w.account, 'HDFC Credit Card');
    assert.ok(w.warning);
});

test('profile learns number, limit and due day from a card statement', () => {
    const p = learnProfileFromStatement({ type: 'credit_card', bank: 'HDFC' }, { kind: 'card', bank: 'HDFC', last4: '4321', creditLimit: 500000, dueDate: '2026-11-07', statementDate: '2026-10-18' });
    assert.deepEqual(p, { type: 'credit_card', bank: 'HDFC', last4: '4321', creditLimit: 500000, dueDay: 7, statementDay: 18 });
    // a number the user already typed is never replaced
    assert.equal(learnProfileFromStatement({ last4: '4242' }, { kind: 'card', last4: '4321' }).last4, '4242');
});
