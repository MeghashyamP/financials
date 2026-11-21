import test from 'node:test';
import assert from 'node:assert/strict';
import { isRecurringPaidOnDate, isNetWorthPaidOnDate, toYYYYMMDD, getPastCycleDueDates } from './recurringPaid.js';
import { DEFAULT_CATEGORIES } from './categories.js';

test('toYYYYMMDD handles Date objects and various string date formats', () => {
    assert.equal(toYYYYMMDD('2026-12-07'), '2026-12-07');
    assert.equal(toYYYYMMDD('07/12/2026'), '2026-12-07');
    assert.equal(toYYYYMMDD('19/Sep/2026'), '2026-09-19');
    assert.equal(toYYYYMMDD(new Date(2026, 11, 7)), '2026-12-07');
});

test('mapping a September 19 transaction does NOT mark November or December recurring due dates as paid', () => {
    const recurringItem = {
        id: 'rec-insurance',
        name: 'EMI PZINSURANCEMUMBAI',
        amount: 7328,
        monthlyDays: 7,
        cadence: 'monthly',
        dateFlexDays: 0,
        nextDate: '2026-11-07' // advanced after paying Oct 7
    };

    const transactions = [
        {
            id: 'tx-sep-19',
            merchant: 'EMI PZINSURANCEMUMBAI',
            date: '2026-09-19',
            amount: 7328,
            linkedRecurringId: 'rec-insurance'
        }
    ];

    // October 7 (in the past relative to nextDate, within 20 days of Sep 19) is paid
    const isOctPaid = isRecurringPaidOnDate({
        recurringItem,
        targetDateStr: '2026-10-07',
        viewMonthPrefix: '2026-10',
        transactions,
        billInstances: []
    });
    assert.equal(isOctPaid, true, 'October 7th should be considered paid');

    // November 7 (nextDate) is NOT paid
    const isNovPaid = isRecurringPaidOnDate({
        recurringItem,
        targetDateStr: '2026-11-07',
        viewMonthPrefix: '2026-11',
        transactions,
        billInstances: []
    });
    assert.equal(isNovPaid, false, 'November 7th must NOT be considered paid by the Sep 19 transaction');

    // December 7 (future) is NOT paid
    const isDecPaid = isRecurringPaidOnDate({
        recurringItem,
        targetDateStr: '2026-12-07',
        viewMonthPrefix: '2026-12',
        transactions,
        billInstances: []
    });
    assert.equal(isDecPaid, false, 'December 7th must NOT be considered paid by the Sep 19 transaction');

    // January 7 (future) is NOT paid
    const isJanPaid = isRecurringPaidOnDate({
        recurringItem,
        targetDateStr: '2027-01-07',
        viewMonthPrefix: '2027-01',
        transactions,
        billInstances: []
    });
    assert.equal(isJanPaid, false, 'January 7th must NOT be considered paid by the Sep 19 transaction');
});

test('scheduledDate on transaction binds payment strictly to that due date or month', () => {
    const recurringItem = {
        id: 'rec-loan',
        name: 'Megha Marriage Loan',
        amount: 14156,
        monthlyDays: 7,
        cadence: 'monthly'
    };

    const transactions = [
        {
            id: 'tx-oct',
            merchant: 'Megha Marriage Loan',
            date: '2026-10-05',
            scheduledDate: '2026-10-07',
            linkedRecurringId: 'rec-loan'
        }
    ];

    const isOctPaid = isRecurringPaidOnDate({
        recurringItem,
        targetDateStr: '2026-10-07',
        viewMonthPrefix: '2026-10',
        transactions,
        billInstances: []
    });
    assert.equal(isOctPaid, true);

    const isDecPaid = isRecurringPaidOnDate({
        recurringItem,
        targetDateStr: '2026-12-07',
        viewMonthPrefix: '2026-12',
        transactions,
        billInstances: []
    });
    assert.equal(isDecPaid, false);
});

test('Net Worth loan EMI item paid in past does not mark future months as paid', () => {
    const networthItem = {
        id: 'nw-loan',
        name: 'Personal Loan',
        incomeExpense: -15000,
        nextDueDate: '2026-11-07'
    };

    const transactions = [
        {
            id: 'tx-sep',
            merchant: 'Personal Loan',
            date: '2026-09-07',
            linkedRecurringId: 'nw-loan'
        }
    ];

    const isDecPaid = isNetWorthPaidOnDate({
        networthItem,
        targetDateStr: '2026-12-07',
        viewMonthPrefix: '2026-12',
        transactions
    });
    assert.equal(isDecPaid, false, 'December EMI must remain unpaid');
});

test('deleted transaction causes paid bill instance to revert to unpaid', () => {
    const recurringItem = {
        id: 'rec-netflix',
        name: 'Netflix',
        amount: 649,
        monthlyDays: 15,
        cadence: 'monthly'
    };

    const billInstances = [
        {
            id: 'bi-1',
            recurringId: 'rec-netflix',
            dueDate: '2026-11-15',
            status: 'paid',
            linkedTxId: 'tx-deleted-1'
        }
    ];

    // Transactions list does NOT have tx-deleted-1
    const transactions = [];

    const isPaid = isRecurringPaidOnDate({
        recurringItem,
        targetDateStr: '2026-11-15',
        viewMonthPrefix: '2026-11',
        transactions,
        billInstances
    });
    assert.equal(isPaid, false, 'If backing transaction was deleted, recurring item must not be marked paid');
});

test('partially paid recurring item with multiple linked transactions', () => {
    const recurringItem = {
        id: 'rec-rent',
        name: 'House Rent',
        amount: 10000,
        monthlyDays: 5,
        cadence: 'monthly'
    };

    const tx1 = {
        id: 'tx-1',
        merchant: 'House Rent',
        date: '2026-11-05',
        amount: 6000,
        scheduledDate: '2026-11-05',
        linkedRecurringId: 'rec-rent'
    };

    const tx2 = {
        id: 'tx-2',
        merchant: 'House Rent',
        date: '2026-11-05',
        amount: 4000,
        scheduledDate: '2026-11-05',
        linkedRecurringId: 'rec-rent'
    };

    // Both linked: sum is 10000 -> fully paid
    const isFullyPaid = isRecurringPaidOnDate({
        recurringItem,
        targetDateStr: '2026-11-05',
        viewMonthPrefix: '2026-11',
        transactions: [tx1, tx2],
        billInstances: []
    });
    assert.equal(isFullyPaid, true, 'When sum matches target amount, recurring item is paid');

    // tx1 unlinked: remaining tx2 is only 4000 -> NOT paid
    const isPartiallyPaid = isRecurringPaidOnDate({
        recurringItem,
        targetDateStr: '2026-11-05',
        viewMonthPrefix: '2026-11',
        transactions: [tx2],
        billInstances: []
    });
    assert.equal(isPartiallyPaid, false, 'When remaining linked sum is less than target amount, recurring item is not paid');

    // Bill instance marked pending with remaining amount 6000 -> NOT paid
    const isPendingInstPaid = isRecurringPaidOnDate({
        recurringItem,
        targetDateStr: '2026-11-05',
        viewMonthPrefix: '2026-11',
        transactions: [tx2],
        billInstances: [{
            id: 'bi-pending-1',
            recurringId: 'rec-rent',
            dueDate: '2026-11-05',
            status: 'pending',
            amount: 6000
        }]
    });
    assert.equal(isPendingInstPaid, false, 'Pending bill instance must not be treated as paid');
});

test('distinct monthly bill instances (Sep, Oct, Nov) are independently checked for payment without collision', () => {
    const cardRecurring = {
        id: 'rec-card-1',
        name: 'HDFC Credit Card',
        isVariableAmount: true,
        estimatedAmount: 150000,
        amount: 150000,
        cadence: 'monthly',
        monthlyDays: '7',
        nextDate: '2026-11-07'
    };

    const billInstances = [
        { id: 'bi-sep', recurringId: 'rec-card-1', dueDate: '2026-09-07', amount: 147615, status: 'paid', linkedTxId: 'tx-pay-sep' },
        { id: 'bi-oct', recurringId: 'rec-card-1', dueDate: '2026-10-07', amount: 130000, status: 'pending', linkedTxId: null },
        { id: 'bi-nov', recurringId: 'rec-card-1', dueDate: '2026-11-07', amount: 200000, status: 'pending', linkedTxId: null }
    ];

    const sepTx = {
        id: 'tx-pay-sep',
        merchant: 'HDFC Credit Card',
        date: '2026-09-08',
        amount: 147615,
        scheduledDate: '2026-09-07',
        linkedRecurringId: 'rec-card-1'
    };

    // Sep 7 is paid
    assert.equal(isRecurringPaidOnDate({
        recurringItem: cardRecurring,
        targetDateStr: '2026-09-07',
        viewMonthPrefix: '2026-09',
        transactions: [sepTx],
        billInstances
    }), true, 'Sep cycle with paid bill instance is marked paid');

    // Oct 7 is pending (unpaid overdue)
    assert.equal(isRecurringPaidOnDate({
        recurringItem: cardRecurring,
        targetDateStr: '2026-10-07',
        viewMonthPrefix: '2026-10',
        transactions: [sepTx],
        billInstances
    }), false, 'Oct cycle with pending bill instance is unpaid');

    // Nov 7 is pending (unpaid upcoming)
    assert.equal(isRecurringPaidOnDate({
        recurringItem: cardRecurring,
        targetDateStr: '2026-11-07',
        viewMonthPrefix: '2026-11',
        transactions: [sepTx],
        billInstances
    }), false, 'Nov cycle with pending bill instance is unpaid');
});

test('getPastCycleDueDates generates all cycle due dates starting from startDate', () => {
    const r = {
        id: 'rec-card-1',
        name: 'HDFC Credit Card',
        amount: 150000,
        cadence: 'monthly',
        monthlyDays: '7',
        startDate: '2026-08-07'
    };

    // Up to Nov 21, 2026: should include Aug 7, Sep 7, Oct 7, Nov 7
    const cyclesNov21 = getPastCycleDueDates(r, '2026-11-21');
    assert.deepEqual(cyclesNov21, ['2026-08-07', '2026-09-07', '2026-10-07', '2026-11-07']);

    // Up to Oct 15, 2026 (specific selected date): should include Aug 7, Sep 7, Oct 7
    const cyclesOct15 = getPastCycleDueDates(r, '2026-10-15');
    assert.deepEqual(cyclesOct15, ['2026-08-07', '2026-09-07', '2026-10-07']);

    // Up to Sep 30, 2026 (end of September month): should include Aug 7, Sep 7
    const cyclesSepEnd = getPastCycleDueDates(r, '2026-09-30');
    assert.deepEqual(cyclesSepEnd, ['2026-08-07', '2026-09-07']);

    // On or before start date: returns empty
    const cyclesBefore = getPastCycleDueDates(r, '2026-08-07');
    assert.deepEqual(cyclesBefore, []);
});

test('getPastCycleDueDates respects endDate and monthlyDays last', () => {
    const rLast = {
        id: 'rec-rent',
        name: 'House Rent',
        amount: 25000,
        cadence: 'monthly',
        monthlyDays: 'last',
        startDate: '2026-01-15',
        endDate: '2026-04-30'
    };

    const cycles = getPastCycleDueDates(rLast, '2026-06-01');
    assert.deepEqual(cycles, ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
});

test('filtering overdue items by selectedDate (dueDate <= selectedDate) shows all past months transactions', () => {
    const overdueList = [
        { id: 'rec-1', name: 'Credit Card', date: '2026-08-07', amount: 50000 },
        { id: 'rec-1', name: 'Credit Card', date: '2026-09-07', amount: 50000 },
        { id: 'rec-1', name: 'Credit Card', date: '2026-10-07', amount: 50000 },
        { id: 'rec-1', name: 'Credit Card', date: '2026-11-07', amount: 50000 }
    ];

    // Selecting Oct 15, 2026: all overdue on or before Oct 15 (Aug 7, Sep 7, Oct 7)
    const selectedDate = '2026-10-15';
    const filtered = overdueList.filter(i => i.date <= selectedDate);
    assert.equal(filtered.length, 3);
    assert.deepEqual(filtered.map(i => i.date), ['2026-08-07', '2026-09-07', '2026-10-07']);

    // Selecting Month View for September 2026 (last day: 2026-09-30)
    const sepMonthEnd = '2026-09-30';
    const filteredMonth = overdueList.filter(i => i.date <= sepMonthEnd);
    assert.equal(filteredMonth.length, 2);
    assert.deepEqual(filteredMonth.map(i => i.date), ['2026-08-07', '2026-09-07']);
});

test('DEFAULT_CATEGORIES includes Food & Drinks - Dineout', () => {
    assert.ok(DEFAULT_CATEGORIES.includes('Food & Drinks - Dineout 🍽️'), 'DEFAULT_CATEGORIES must include Food & Drinks - Dineout');
});

test('candidate transactions for mapping only show same main category or same price (including neutral)', () => {
    const item = {
        id: 'rec-card',
        name: 'HDFC Credit Card',
        type: 'expense',
        category: 'Credit - Bill 💳',
        amount: 50000
    };

    const targetAmt = 50000;
    const itemMainCat = 'credit';

    const transactions = [
        // 1. Same main category, different price: should MATCH
        { id: 'tx-1', type: 'expense', category: 'Credit - EMI', amount: 15000 },
        // 2. Different category, same price (expense): should MATCH
        { id: 'tx-2', type: 'expense', category: 'Shopping - Clothes', amount: 50000 },
        // 3. Different category, same price (neutral): should MATCH
        { id: 'tx-3', type: 'neutral', category: 'Transfer - Bank', amount: 50000 },
        // 4. Different category, different price (expense): should NOT match
        { id: 'tx-4', type: 'expense', category: 'Food & Drinks - Lunch', amount: 1200 },
        // 5. Different category, different price (neutral): should NOT match
        { id: 'tx-5', type: 'neutral', category: 'Transfer - Own Account', amount: 20000 }
    ];

    const getMainCategory = (cat) => cat && cat.includes(' - ') ? cat.split(' - ')[0].trim() : (cat || '');

    const candidates = transactions.filter(t => {
        const tType = t.type || 'expense';
        const isTypeMatch = tType === 'expense' || tType === 'neutral';
        if (!isTypeMatch) return false;

        const tAmount = Math.abs(Number(t.amount || 0));
        const isSamePrice = targetAmt > 0 && Math.abs(tAmount - targetAmt) < 0.01;
        if (isSamePrice) return true;

        const tMainCat = getMainCategory(t.category).toLowerCase().trim();
        if (itemMainCat && tMainCat === itemMainCat) return true;

        return false;
    });

    assert.equal(candidates.length, 3);
    assert.deepEqual(candidates.map(c => c.id), ['tx-1', 'tx-2', 'tx-3']);
});

test('document list sorting by uploaded order preserves chronological upload order', () => {
    const docs = [
        { id: 'doc-3', filename: 'March.pdf', createdAt: '2026-03-01T10:00:00Z', count: 5 },
        { id: 'doc-1', filename: 'January.pdf', createdAt: '2026-01-01T10:00:00Z', count: 50 },
        { id: 'doc-2', filename: 'February.pdf', createdAt: '2026-02-01T10:00:00Z', count: 20 }
    ];

    // Uploaded order (chronological by upload time): January, February, March
    const sorted = [...docs].sort((a, b) => {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (timeA !== timeB) return timeA - timeB;
        return (a.filename || '').localeCompare(b.filename || '');
    });

    assert.deepEqual(sorted.map(d => d.filename), ['January.pdf', 'February.pdf', 'March.pdf']);
});
