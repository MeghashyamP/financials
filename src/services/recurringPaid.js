// Helper to parse dates into YYYY-MM-DD
export const toYYYYMMDD = (dStr) => {
    if (!dStr) return "";
    if (dStr instanceof Date) {
        const y = dStr.getFullYear();
        const m = String(dStr.getMonth() + 1).padStart(2, '0');
        const day = String(dStr.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    const str = String(dStr).trim();
    const ymd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymd) {
        return `${ymd[1]}-${String(parseInt(ymd[2], 10)).padStart(2, '0')}-${String(parseInt(ymd[3], 10)).padStart(2, '0')}`;
    }
    const dmy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (dmy) {
        let p1 = parseInt(dmy[1], 10), p2 = parseInt(dmy[2], 10), p3 = parseInt(dmy[3], 10);
        if (p3 < 100) p3 += 2000;
        let day = p1 > 12 ? p1 : (p2 > 12 ? p2 : p1);
        let month = p1 > 12 ? p2 : (p2 > 12 ? p1 : p2);
        return `${p3}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const isRecurringPaidOnDate = ({
    recurringItem,
    targetDateStr,
    viewMonthPrefix,
    transactions,
    billInstances
}) => {
    if (!recurringItem || !targetDateStr) return false;
    const targetMonth = targetDateStr.slice(0, 7);
    const monthPrefix = viewMonthPrefix || targetMonth;
    const targetObj = new Date(targetDateStr + "T00:00:00");

    // 1. Check bill instances
    const billInsts = (billInstances || []).filter(b => b && b.recurringId === recurringItem.id);
    const monthBillInst = billInsts.find(b => b.dueDate && (b.dueDate === targetDateStr || b.dueDate.startsWith(monthPrefix)));
    if (monthBillInst) {
        if (monthBillInst.status === 'paid') {
            // Verify that a corresponding payment transaction actually exists in transactions
            const hasBackingTx = (transactions || []).some(t => {
                if (!t || t.pendingMapping) return false;
                if (monthBillInst.linkedTxId && t.id === monthBillInst.linkedTxId) {
                    return true;
                }
                const isLinked = (t.linkedRecurringId === recurringItem.id);
                const isNameMatch = Boolean(t.merchant && recurringItem.name && t.merchant.trim().toLowerCase() === recurringItem.name.trim().toLowerCase());
                if (!isLinked && !isNameMatch) return false;
                if (t.scheduledDate) {
                    return t.scheduledDate === targetDateStr || t.scheduledDate.startsWith(monthPrefix);
                }
                const tDate = toYYYYMMDD(t.date);
                return tDate && tDate.startsWith(monthPrefix);
            });
            if (hasBackingTx) {
                return true;
            }
            // If no backing transaction exists (e.g. was deleted), do not treat as paid!
        } else {
            return false;
        }
    }

    // 2. Check transactions
    const flexDays = Number(recurringItem.dateFlexDays) || 0;
    const targetAmt = Math.abs(Number(recurringItem.estimatedAmount || recurringItem.amount || 0));

    const matchingTxs = (transactions || []).filter(t => {
        if (!t || t.pendingMapping) return false;
        const tDate = toYYYYMMDD(t.date);
        if (!tDate) return false;

        const isLinked = (t.linkedRecurringId === recurringItem.id);
        const isNameMatch = Boolean(t.merchant && recurringItem.name && t.merchant.trim().toLowerCase() === recurringItem.name.trim().toLowerCase());
        const isCatMatch = Boolean(flexDays > 0 && t.category && recurringItem.category && t.category === recurringItem.category);

        if (!isLinked && !isNameMatch && !isCatMatch) return false;

        // If transaction has an explicit scheduledDate, it must match this target date or month
        if (t.scheduledDate) {
            return t.scheduledDate === targetDateStr || t.scheduledDate.startsWith(monthPrefix);
        }

        const txTs = new Date(tDate + "T00:00:00").getTime();
        const diffDays = Math.abs(txTs - targetObj.getTime()) / (1000 * 60 * 60 * 24);

        if (flexDays > 0) {
            return diffDays <= flexDays;
        }

        // flexDays === 0:
        // Must be in the same month cycle
        if (tDate.startsWith(monthPrefix)) return true;

        // Or if explicitly linked by user (isLinked):
        // Allow within 20 days IF this target date is in the past relative to nextDate (e.g. user marked past month paid with early tx)
        if (isLinked && diffDays <= 20) {
            if (recurringItem.nextDate && targetDateStr < recurringItem.nextDate) {
                return true;
            }
        }

        return false;
    });

    if (matchingTxs.length === 0) return false;
    if (targetAmt > 0) {
        const allHaveAmount = matchingTxs.every(t => t.amount !== undefined && t.amount !== null);
        if (allHaveAmount) {
            const matchingSum = matchingTxs.reduce((acc, t) => acc + Math.abs(Number(t.amount || 0)), 0);
            return matchingSum >= targetAmt - 0.01;
        }
    }
    return true;
};

export const isNetWorthPaidOnDate = ({
    networthItem,
    targetDateStr,
    viewMonthPrefix,
    transactions
}) => {
    if (!networthItem || !targetDateStr) return false;
    const targetMonth = targetDateStr.slice(0, 7);
    const monthPrefix = viewMonthPrefix || targetMonth;
    const targetObj = new Date(targetDateStr + "T00:00:00");

    return (transactions || []).some(t => {
        if (!t) return false;
        const tDate = toYYYYMMDD(t.date);
        if (!tDate) return false;

        const isLinked = (t.linkedRecurringId === networthItem.id);
        const isNameMatch = Boolean(t.merchant && networthItem.name && t.merchant.trim().toLowerCase() === networthItem.name.trim().toLowerCase());

        if (!isLinked && !isNameMatch) return false;

        if (t.scheduledDate) {
            return t.scheduledDate === targetDateStr || t.scheduledDate.startsWith(monthPrefix);
        }

        if (tDate.startsWith(monthPrefix)) return true;

        const txTs = new Date(tDate + "T00:00:00").getTime();
        const diffDays = Math.abs(txTs - targetObj.getTime()) / (1000 * 60 * 60 * 24);

        if (isLinked && diffDays <= 20) {
            if (networthItem.nextDueDate && targetDateStr < networthItem.nextDueDate) {
                return true;
            }
        }

        return false;
    });
};
