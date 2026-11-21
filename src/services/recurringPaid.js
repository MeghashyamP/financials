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
    const targetBillInst = billInsts.find(b => b.dueDate === targetDateStr)
        || billInsts.find(b => b.dueDate && b.dueDate.startsWith(monthPrefix));
    if (targetBillInst) {
        if (targetBillInst.status === 'paid') {
            // Verify that a corresponding payment transaction actually exists in transactions
            const hasBackingTx = (transactions || []).some(t => {
                if (!t || t.pendingMapping) return false;
                if (targetBillInst.linkedTxId && t.id === targetBillInst.linkedTxId) {
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

export const addMonthsClamped = (date, n, anchorDay) => {
    const day = anchorDay === 'last' ? 31 : (Number(anchorDay) || date.getDate());
    const y = date.getFullYear();
    const m = date.getMonth() + n;
    const maxDays = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(day, maxDays));
};

export const getAnchorDayOfMonth = (dStr) => {
    if (!dStr) return 1;
    if (typeof dStr === 'string' && dStr.includes('-')) {
        const parts = dStr.split('-');
        if (parts.length === 3) {
            const dayNum = parseInt(parts[2].substring(0, 2), 10);
            if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) return dayNum;
        }
    }
    const d = new Date(dStr);
    if (!isNaN(d.getTime())) return d.getDate();
    return 1;
};

export const getAnchorDayForRecurring = (r) => {
    if (!r) return 1;
    if (r.monthlyDays) {
        const rawMD = r.monthlyDays;
        const isLast = (typeof rawMD === 'string' && rawMD.trim().toLowerCase() === 'last') ||
            (Array.isArray(rawMD) && rawMD.length === 1 && String(rawMD[0]).toLowerCase() === 'last');
        if (isLast) return 'last';
        const parsed = Array.isArray(rawMD)
            ? parseInt(rawMD[0], 10)
            : parseInt(String(rawMD).split(',')[0].trim(), 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 31) return parsed;
    }
    const sDate = r.startDate || r.nextDate;
    return getAnchorDayOfMonth(sDate);
};

export const getPastCycleDueDates = (r, beforeDateStr) => {
    if (!r || !beforeDateStr) return [];
    const sDateStr = toYYYYMMDD(r.startDate || r.nextDate);
    if (!sDateStr) return [];
    if (sDateStr >= beforeDateStr) return [];

    const cadence = r.cadence || "monthly";
    const cycleDates = [];
    const limit = 1200;

    if (cadence === "once") {
        if (sDateStr < beforeDateStr && (!r.endDate || sDateStr <= r.endDate)) {
            cycleDates.push(sDateStr);
        }
        return cycleDates;
    }

    if (cadence === "custom_days" || cadence === "custom_dates") {
        if (!r.customDays) return [];
        const datesList = typeof r.customDays === "string"
            ? r.customDays.split(",").map(s => s.trim()).filter(Boolean)
            : (Array.isArray(r.customDays) ? r.customDays : []);
        for (const d of datesList) {
            const dStr = toYYYYMMDD(d);
            if (dStr && dStr >= sDateStr && dStr < beforeDateStr && (!r.endDate || dStr <= r.endDate)) {
                cycleDates.push(dStr);
            }
        }
        return cycleDates.sort();
    }

    if (cadence === "monthly" || cadence === "monthly_days") {
        const rawMonthlyDays = r.monthlyDays;
        const isLast = rawMonthlyDays && (
            (typeof rawMonthlyDays === 'string' && rawMonthlyDays.trim().toLowerCase() === 'last') ||
            (Array.isArray(rawMonthlyDays) && rawMonthlyDays.length === 1 && String(rawMonthlyDays[0]).toLowerCase() === 'last')
        );

        let targetDays;
        if (isLast) {
            targetDays = ['last'];
        } else if (rawMonthlyDays) {
            const parsed = typeof rawMonthlyDays === "string"
                ? rawMonthlyDays.split(",").map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= 31)
                : (Array.isArray(rawMonthlyDays) ? rawMonthlyDays.map(x => parseInt(x, 10)).filter(n => !isNaN(n)) : []);
            targetDays = parsed.length > 0 ? parsed : [getAnchorDayForRecurring(r)];
        } else {
            targetDays = [getAnchorDayForRecurring(r)];
        }

        const [sY, sM] = sDateStr.split('-').map(Number);
        const [todayY, todayM] = beforeDateStr.split('-').map(Number);

        let y = sY;
        let m = sM - 1;
        let iter = 0;

        while ((y < todayY || (y === todayY && m <= (todayM - 1))) && iter < limit) {
            iter++;
            const maxDays = new Date(y, m + 1, 0).getDate();
            for (const td of targetDays) {
                const actualDay = td === 'last' ? maxDays : Math.min(Number(td), maxDays);
                const dStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(actualDay).padStart(2, '0')}`;
                if (dStr >= sDateStr && dStr < beforeDateStr && (!r.endDate || dStr <= r.endDate)) {
                    cycleDates.push(dStr);
                }
            }
            m++;
            if (m > 11) {
                m = 0;
                y++;
            }
        }
        return cycleDates.sort();
    }

    if (cadence === "quarterly" || cadence === "half_yearly" || cadence === "semi_annual" || cadence === "yearly" || cadence === "annual" || cadence === "annually") {
        const monthStep = cadence === "quarterly" ? 3 : (cadence === "half_yearly" || cadence === "semi_annual") ? 6 : 12;
        const anchorDay = getAnchorDayForRecurring(r);
        const sParts = sDateStr.split('-').map(Number);
        const baseDate = new Date(sParts[0], sParts[1] - 1, sParts[2]);
        let k = 0;
        while (k < limit) {
            const nextDate = addMonthsClamped(baseDate, k * monthStep, anchorDay);
            const dStr = toYYYYMMDD(nextDate);
            if (!dStr || dStr >= beforeDateStr) break;
            if (dStr >= sDateStr && (!r.endDate || dStr <= r.endDate)) {
                cycleDates.push(dStr);
            }
            k++;
        }
        return cycleDates.sort();
    }

    if (cadence === "daily" || cadence === "weekly" || cadence === "weekly_days" || cadence === "biweekly" || cadence === "custom_interval" || cadence === "every") {
        const stepDays = cadence === "daily" ? 1
            : cadence === "biweekly" ? 14
            : (cadence === "custom_interval" || cadence === "every") ? Math.max(1, Number(r.customIntervalDays) || 14)
            : 7;

        if (cadence === "weekly_days" && Array.isArray(r.weeklyDays) && r.weeklyDays.length > 0) {
            const dayMap = { "Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6 };
            const targetDayNums = r.weeklyDays.map(d => dayMap[d]).filter(n => n !== undefined);
            const sParts = sDateStr.split('-').map(Number);
            const curr = new Date(sParts[0], sParts[1] - 1, sParts[2]);
            let iter = 0;
            while (iter < limit) {
                iter++;
                const dStr = toYYYYMMDD(curr);
                if (dStr >= beforeDateStr) break;
                if (targetDayNums.includes(curr.getDay())) {
                    if (dStr >= sDateStr && (!r.endDate || dStr <= r.endDate)) {
                        cycleDates.push(dStr);
                    }
                }
                curr.setDate(curr.getDate() + 1);
            }
            return cycleDates.sort();
        }

        const sParts = sDateStr.split('-').map(Number);
        const curr = new Date(sParts[0], sParts[1] - 1, sParts[2]);
        let iter = 0;
        while (iter < limit) {
            iter++;
            const dStr = toYYYYMMDD(curr);
            if (dStr >= beforeDateStr) break;
            if (dStr >= sDateStr && (!r.endDate || dStr <= r.endDate)) {
                cycleDates.push(dStr);
            }
            curr.setDate(curr.getDate() + stepDays);
        }
        return cycleDates.sort();
    }

    return cycleDates;
};
