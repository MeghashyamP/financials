import test from 'node:test';
import assert from 'node:assert/strict';
import {
    fyStartYear, fyLabel, fyRange, fyMonths, availableFys, summarizeFy, compareFy,
    cardCosts, findDuplicateCharges, findLargeOutliers, findNewBigMerchants, findPriceChanges, buildAlerts,
    buildForecast, everydaySpendPerDay, csvCell, transactionsToCSV, statementsToCSV, filterTransactions, addDays
} from './reports.js';

let n = 0;
const tx = (o) => ({ id: `t${++n}`, type: 'expense', amount: 100, account: 'HDFC Credit Card', category: 'Shopping - Online 🛍️', narration: 'SOMESHOP', ...o });

test('financial year runs April to March', () => {
    assert.equal(fyStartYear('2026-04-01'), 2026);
    assert.equal(fyStartYear('2027-03-31'), 2026);
    assert.equal(fyStartYear('2026-03-31'), 2025);
    assert.equal(fyLabel(2026), 'FY 2026-27');
    assert.equal(fyLabel(2026, 1), '2026');
    assert.deepEqual(fyRange(2026), { start: '2026-04-01', end: '2027-03-31' });
    assert.deepEqual(fyRange(2023), { start: '2023-04-01', end: '2024-03-31' });
    assert.equal(fyMonths(2026)[0].key, '2026-04');
    assert.equal(fyMonths(2026)[11].key, '2027-03');
    assert.deepEqual(availableFys([tx({ date: '2026-05-01' }), tx({ date: '2025-01-01' }), tx({ date: '2026-12-01' })]), [2026, 2024]);
});

test('summary counts income and expense only; transfers are ignored', () => {
    const list = [
        tx({ date: '2026-04-10', type: 'income', amount: 100000, category: 'Income - Salary 💵' }),
        tx({ date: '2026-04-12', amount: 20000, category: 'Groceries - Staples 🌾' }),
        tx({ date: '2026-05-02', amount: 5000, category: 'Groceries - Veggies 🥦' }),
        tx({ date: '2026-05-03', type: 'neutral', neutralSign: '-', amount: 50000, category: 'Credit - Bill 💳' }),
        tx({ date: '2027-04-01', amount: 999 }) // next FY
    ];
    const s = summarizeFy(list, 2026);
    assert.equal(s.income, 100000);
    assert.equal(s.expense, 25000);
    assert.equal(s.savings, 75000);
    assert.equal(s.savingsRate, 0.75);
    assert.equal(s.months[0].expense, 20000);
    assert.equal(s.months[1].expense, 5000);
    assert.equal(s.parents[0].parent, 'Groceries');
    assert.equal(s.parents[0].total, 25000);
    assert.equal(s.categories[0].category, 'Groceries - Staples 🌾');
});

test('year-on-year is like for like while the year is running', () => {
    const list = [
        tx({ date: '2025-04-10', amount: 1000 }), tx({ date: '2025-05-10', amount: 1000 }), tx({ date: '2025-11-10', amount: 9000 }),
        tx({ date: '2026-04-10', amount: 1500 }), tx({ date: '2026-05-10', amount: 1500 })
    ];
    const c = compareFy(list, 2026, { todayIso: '2026-05-20' });
    assert.equal(c.partial, true);
    assert.equal(c.monthsCompared, 2);
    assert.equal(c.previous.expense, 2000, 'November of last year is outside the 2 months compared');
    assert.equal(c.current.expense, 3000);
    assert.equal(c.delta.expense, 1000);
    assert.equal(c.delta.expensePct, 0.5);
    const full = compareFy(list, 2025, { todayIso: '2026-05-20' });
    assert.equal(full.partial, false);
    assert.equal(full.hasPrevious, false);
});

test('card costs: fees, interest and GST are found, merchants are not', () => {
    const list = [
        tx({ date: '2026-10-01', amount: 450, narration: 'FINANCE CHARGES', category: 'Hidden Charges - Penalty ⚠️' }),
        tx({ date: '2026-10-02', amount: 81, narration: 'IGST-CI@18%', category: 'Tax - GST 📈' }),
        tx({ date: '2026-10-03', amount: 500, narration: 'LATE PAYMENT FEE' }),
        tx({ date: '2026-10-04', amount: 1999, narration: 'AMAZON PAY INDIA' }),
        tx({ date: '2026-10-05', amount: 12, narration: 'FOREX MARKUP USD', account: 'SBI Credit Card' })
    ];
    const c = cardCosts(list);
    assert.equal(c.count, 4);
    assert.equal(c.total, 450 + 81 + 500 + 12);
    assert.ok(c.byBucket.find((b) => b.id === 'late'));
    assert.ok(c.byBucket.find((b) => b.id === 'forex'));
    assert.equal(c.byAccount[0].account, 'HDFC Credit Card');
    assert.equal(cardCosts(list, { from: '2026-10-03' }).count, 2);
});

test('alerts: double swipe, price change, outlier, new big payee', () => {
    const dup = findDuplicateCharges([
        tx({ date: '2026-10-05', amount: 2500, narration: 'CROMA ELECTRONICS' }), tx({ date: '2026-10-05', amount: 2500, narration: 'CROMA ELECTRONICS' }),
        tx({ date: '2026-10-05', amount: 20, narration: 'TEA STALL' }), tx({ date: '2026-10-05', amount: 20, narration: 'TEA STALL' })
    ]);
    assert.equal(dup.length, 1, 'tiny identical rows are not flagged');

    const sub = (date, amount) => tx({ date, amount, narration: 'NETFLIX.COM' });
    const price = findPriceChanges([sub('2026-07-05', 499), sub('2026-08-05', 499), sub('2026-09-05', 499), sub('2026-10-05', 649)]);
    assert.equal(price.length, 1);
    assert.match(price[0].detail, /Was 499, now 649/);
    assert.equal(findPriceChanges([sub('2026-07-05', 499), sub('2026-08-05', 499), sub('2026-09-05', 499)]).length, 0);

    const shop = (date, amount) => tx({ date, amount, narration: 'RELIANCE FRESH' });
    const out = findLargeOutliers([shop('2026-08-01', 800), shop('2026-08-10', 900), shop('2026-09-01', 850), shop('2026-09-15', 700), shop('2026-10-10', 9000)], { todayIso: '2026-10-20' });
    assert.equal(out.length, 1);
    assert.equal(out[0].txIds.length, 1);

    const fresh = findNewBigMerchants([tx({ date: '2026-10-10', amount: 25000, narration: 'BRAND NEW JEWELLERS' }), tx({ date: '2026-01-10', amount: 25000, narration: 'OLD STORE HERE' })], { todayIso: '2026-10-20' });
    assert.equal(fresh.length, 1);
    assert.match(fresh[0].title, /BRAND NEW/);
    // with only one month of history nothing can be called "new"
    assert.equal(findNewBigMerchants([tx({ date: '2026-10-01', amount: 9000, narration: 'ONE' }), tx({ date: '2026-10-10', amount: 25000, narration: 'TWO PLACE' })], { todayIso: '2026-10-20' }).length, 0);

    const all = buildAlerts([sub('2026-07-05', 499), sub('2026-08-05', 499), sub('2026-09-05', 499), sub('2026-10-05', 649)], { todayIso: '2026-10-20' });
    assert.equal(all[0].severity, 'warning');
});

// a monthly stand-in for the app's date engine
const monthlyOn = (day) => (r, fromIso) => {
    let [y, m] = fromIso.split('-').map(Number);
    for (let i = 0; i < 24; i++) {
        const iso = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        if (iso >= fromIso) return iso;
        m += 1; if (m > 12) { m = 1; y += 1; }
    }
    return '';
};

test('forecast: scheduled flows move the balance day by day, a pending bill replaces the estimate', () => {
    const recurring = [
        { id: 'rent', name: 'Rent', type: 'expense', amount: 20000, cadence: 'monthly' },
        { id: 'sal', name: 'Salary', type: 'income', amount: 80000, cadence: 'monthly' },
        { id: 'card', name: 'HDFC bill', type: 'expense', amount: 10000, estimatedAmount: 10000, cadence: 'monthly' }
    ];
    const billInstances = [{ id: 'b1', recurringId: 'card', name: 'HDFC bill', amount: 150000, dueDate: '2026-11-25', status: 'pending', type: 'expense' }];
    const nextOccurrence = (r, from) => ({ rent: monthlyOn(1), sal: monthlyOn(28), card: monthlyOn(25) }[r.id](r, from));
    const f = buildForecast({ startBalance: 50000, recurring, billInstances, todayIso: '2026-11-20', days: 30, nextOccurrence });
    const names = f.events.map((e) => `${e.date} ${e.name} ${e.direction} ${e.amount}`);
    assert.deepEqual(names, [
        '2026-11-25 HDFC bill out 150000',
        '2026-11-28 Salary in 80000',
        '2026-12-01 Rent out 20000'
    ]);
    assert.equal(f.series.length, 30);
    assert.equal(f.series[0].date, '2026-11-20');
    assert.equal(f.series[4].balance, 50000);
    assert.equal(f.series[5].balance, 50000 - 150000);
    assert.equal(f.min.date, '2026-11-25');
    assert.equal(f.goesNegative, true);
    assert.equal(f.endBalance, 50000 - 150000 + 80000 - 20000);
    assert.equal(f.totalOut, 150000 + 20000);
});

test('forecast: overdue pending bills land on today; everyday spending is optional', () => {
    const billInstances = [{ id: 'b', name: 'Old bill', amount: 500, dueDate: '2026-11-15', status: 'pending', type: 'expense' }, { id: 'c', name: 'Ancient', amount: 9, dueDate: '2026-08-01', status: 'pending', type: 'expense' }];
    const base = { startBalance: 1000, billInstances, todayIso: '2026-11-20', days: 3, nextOccurrence: () => '' };
    const a = buildForecast(base);
    assert.equal(a.events.length, 1);
    assert.equal(a.events[0].overdue, true);
    assert.equal(a.series[0].balance, 500);
    const b = buildForecast({ ...base, everydayDaily: 100, includeEveryday: true });
    assert.equal(b.series[2].balance, 500 - 300);
});

test('everyday spend ignores scheduled / lumpy rows and divides by the days the data covers', () => {
    const list = [
        tx({ date: '2026-11-10', amount: 900, category: 'Food & Drinks - Fastfood 🍔' }),
        tx({ date: '2026-11-11', amount: 5000, linkedRecurringId: 'rent' }),
        tx({ date: '2026-11-12', amount: 70000, category: 'EMI - Home 🏠' }),
        tx({ date: '2026-11-13', amount: 30000, category: 'Insurance - Health 🩺' }),
        tx({ date: '2026-01-01', amount: 99999 })
    ];
    // 900 over a 30-day minimum span
    assert.equal(everydaySpendPerDay(list, { todayIso: '2026-11-20', windowDays: 90 }), 30);
    // data going back 60 days → divided by 61
    const longer = [...list, tx({ date: '2026-09-21', amount: 0.01, category: 'Food & Drinks - Fastfood 🍔' })];
    assert.equal(everydaySpendPerDay(longer, { todayIso: '2026-11-20', windowDays: 90 }), 14.75);
});

test('CSV: quoting, formula safety, BOM, debit/credit/transfer columns', () => {
    assert.equal(csvCell('a,b'), '"a,b"');
    assert.equal(csvCell('say "hi"'), '"say ""hi"""');
    assert.equal(csvCell('=SUM(A1)', { text: true }), "'=SUM(A1)");
    assert.equal(csvCell('-5', { text: false }), '-5');
    assert.equal(csvCell(12.5), '12.5');
    assert.equal(csvCell(null), '');

    const csv = transactionsToCSV([
        tx({ date: '2026-10-02', type: 'income', amount: 500, narration: 'SALARY, OCT', category: 'Income - Salary 💵' }),
        tx({ date: '2026-10-01', amount: 120.5, narration: '=cmd|calc', tags: ['a', 'b'] }),
        tx({ date: '2026-10-03', type: 'neutral', neutralSign: '-', amount: 900, narration: 'CC PAYMENT' })
    ]);
    assert.ok(csv.startsWith('﻿Date,Account,Narration'));
    const lines = csv.trim().split('\r\n');
    assert.equal(lines.length, 4);
    assert.match(lines[1], /^2026-10-01,HDFC Credit Card,'=cmd\|calc,.*,Expense,120\.5,,,/);
    assert.match(lines[2], /"SALARY, OCT"/);
    assert.match(lines[2], /,Income,,500,,/);
    assert.match(lines[3], /,Transfer,900,,900,/);
    assert.ok(!transactionsToCSV([], { bom: false }).startsWith('﻿'));
});

test('filters and statement CSV', () => {
    const list = [tx({ date: '2026-10-01', account: 'A', category: 'Food & Drinks - Fastfood 🍔' }), tx({ date: '2026-11-01', account: 'B', type: 'income' })];
    assert.equal(filterTransactions(list, { from: '2026-10-15' }).length, 1);
    assert.equal(filterTransactions(list, { account: 'A' }).length, 1);
    assert.equal(filterTransactions(list, { category: 'Food' }).length, 1);
    assert.equal(filterTransactions(list, { type: 'income' }).length, 1);
    assert.equal(filterTransactions(list, { type: 'all' }).length, 2);
    const s = statementsToCSV([{ account: 'HDFC Credit Card', kind: 'card', periodEnd: '2026-10-18', opening: 1, closing: 2, txnCount: 3, auditStatus: 'verified' }]);
    assert.match(s, /HDFC Credit Card,card,,2026-10-18/);
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
