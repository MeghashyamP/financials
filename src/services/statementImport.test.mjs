import test from 'node:test';
import assert from 'node:assert/strict';
import { applyStatementImport } from './statementImport.js';
import { DEFAULT_ACCOUNTS } from './accounts.js';

const summary = (over = {}) => ({
    template: 'hdfc-credit-card', kind: 'card', issuer: 'HDFC Bank', bank: 'HDFC', last4: '4321',
    statementDate: '2026-10-18', periodStart: '2026-09-19', periodEnd: '2026-10-18',
    opening: 10000.5, closing: 25000, totalDue: 25000, minDue: 1250, dueDate: '2026-11-07',
    creditLimit: 500000, availableCredit: 475000, totalDebits: 20000, totalCredits: 5000.5,
    txnCount: 80, auditStatus: 'verified', ...over
});

const baseSettings = () => ({
    accounts: DEFAULT_ACCOUNTS.map((d) => d.name),
    accountProfiles: Object.fromEntries(DEFAULT_ACCOUNTS.map((d) => [d.name, { type: d.type, bank: d.bank }])),
    statements: [], networthItems: [], recurring: [], billInstances: []
});

const makeEnv = (store, over = {}) => {
    let n = 0;
    return {
        todayIso: '2026-10-20', nowIso: '2026-10-20T10:00:00.000Z',
        newId: () => `id${++n}`,
        saveSetting: async (k, v) => { store[k] = v; },
        groupKind: (c) => ({ 'Credit Cards': 'liability', 'Bank Accounts': 'balance' }[c]),
        effectiveValue: (it) => Number(it.value || 0),
        cardBillCategory: 'Credit - Bill 💳',
        ...over
    };
};

test('importing a card statement records history, learns the profile, updates net worth and plans the bill', async () => {
    const settings = baseSettings();
    const store = {};
    const r = await applyStatementImport(settings, { summary: summary(), account: 'HDFC Credit Card', fileName: 'hdfc.pdf', documentId: 'doc1' }, makeEnv(store));
    assert.equal(r.recorded, true);
    assert.equal(store.statements.length, 1);
    assert.equal(store.statements[0].documentId, 'doc1');
    assert.equal(store.accountProfiles['HDFC Credit Card'].last4, '4321');
    assert.equal(store.accountProfiles['HDFC Credit Card'].creditLimit, 500000);
    assert.equal(store.accountProfiles['HDFC Credit Card'].dueDay, 7);
    assert.equal(store.networthItems[0].value, 25000);
    assert.equal(store.liabilitiesTotal, 25000);
    assert.equal(store.assetsTotal, 0);
    assert.equal(store.recurring[0].nextDate, '2026-11-07');
    assert.equal(store.billInstances[0].amount, 25000);
    assert.ok(r.networthUpdated && r.billPlanned && r.profileUpdated);
});

test('an account that is clearly the wrong bank is not polluted with this statement', async () => {
    const store = {};
    const r = await applyStatementImport(baseSettings(), { summary: summary({ bank: 'SBI', issuer: 'SBI Card', last4: '85' }), account: 'HDFC Credit Card' }, makeEnv(store));
    assert.equal(r.recorded, false);
    assert.match(r.skippedReason, /does not look like/);
    assert.deepEqual(store, {});
});

test('net worth sync can be switched off, an older statement does not touch the bill', async () => {
    const settings = { ...baseSettings(), autoNetWorthFromStatements: false };
    const store = {};
    await applyStatementImport(settings, { summary: summary(), account: 'HDFC Credit Card' }, makeEnv(store));
    assert.equal(store.networthItems, undefined);

    // newer statement already on record → importing the older one must not replace the bill
    const withNewer = { ...baseSettings(), statements: [{ id: 'HDFC Credit Card|card|2026-11-18', account: 'HDFC Credit Card', kind: 'card', periodEnd: '2026-11-18' }] };
    const s2 = {};
    const r = await applyStatementImport(withNewer, { summary: summary(), account: 'HDFC Credit Card' }, makeEnv(s2));
    assert.equal(r.billPlanned, false);
    assert.equal(s2.recurring, undefined);
});

test('bank statements update the balance and never create a bill', async () => {
    const store = {};
    const bank = { template: 'icici-savings', kind: 'bank', issuer: 'ICICI Bank', bank: 'ICICI', last4: '7777', periodStart: '2026-10-01', periodEnd: '2026-10-31', opening: 1000, closing: 2500.75, auditStatus: 'verified', txnCount: 12 };
    const r = await applyStatementImport(baseSettings(), { summary: bank, account: 'ICICI Debit Card' }, makeEnv(store));
    assert.equal(store.networthItems[0].category, 'Bank Accounts');
    assert.equal(store.networthItems[0].value, 2500.75);
    assert.equal(store.assetsTotal, 2500.75);
    assert.equal(r.billPlanned, false);
    assert.equal(store.recurring, undefined);
});
