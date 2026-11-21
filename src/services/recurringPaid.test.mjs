import test from 'node:test';
import assert from 'node:assert/strict';
import { isRecurringPaidOnDate, isNetWorthPaidOnDate, toYYYYMMDD } from './recurringPaid.js';

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
