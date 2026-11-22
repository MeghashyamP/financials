/**
 * statementLedger.js — what the app remembers about every statement it has imported.
 *
 * One record per (account, statement period) lives in `settings.statements`. From those records this module
 * works out: whether consecutive statements chain (this opening == last closing), which months are missing,
 * which accounts have gone stale, plus the side effects of an import — the Net Worth line for the account and
 * the due-date bill for a credit card. Pure functions only (ids and "today" are passed in), unit-tested in node.
 */

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

const toUtc = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
};
export const daysBetween = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
const monthOf = (iso) => iso.slice(0, 7);
const nextMonth = (ym) => {
    let [y, m] = ym.split('-').map(Number);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
    return `${y}-${String(m).padStart(2, '0')}`;
};
export const monthsStrictlyBetween = (fromYm, toYm) => {
    const out = [];
    let cur = nextMonth(fromYm);
    while (cur < toYm && out.length < 60) { out.push(cur); cur = nextMonth(cur); }
    return out;
};

export const STALE_AFTER_DAYS = 45;
const CHAIN_TOLERANCE = 1.01; // issuers round "total due" to the rupee

/**
 * For a statement ending on endIso (e.g. "2026-10-18"):
 * - Month-end statements (e.g. 30/31) run from the 1st of that month (2026-09-01).
 * - Mid-month statements ending on day D (e.g. 18) began on day D + 1 of the prior month (2026-09-19).
 * - If a preferred start day (e.g. 19 from a printed header) is provided, it is preserved.
 */
export const cycleStartFor = (endIso, preferredDay) => {
    if (!endIso || typeof endIso !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(endIso)) return '';
    const [y, m, d] = endIso.slice(0, 10).split('-').map(Number);
    const daysInCurrentMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    if (d === daysInCurrentMonth && (preferredDay === undefined || preferredDay === null)) {
        return `${y}-${String(m).padStart(2, '0')}-01`;
    }
    let prevM = m - 1;
    let prevY = y;
    if (prevM < 1) { prevM = 12; prevY -= 1; }
    const dayToUse = (preferredDay !== undefined && preferredDay !== null && preferredDay >= 1 && preferredDay <= 31)
        ? preferredDay
        : (d <= 28 ? d + 1 : 1);
    const maxDays = new Date(Date.UTC(prevY, prevM, 0)).getUTCDate();
    const finalDay = Math.min(dayToUse, maxDays);
    return `${prevY}-${String(prevM).padStart(2, '0')}-${String(finalDay).padStart(2, '0')}`;
};

// ───────────────────────── records ─────────────────────────

export const statementId = (account, summary) =>
    `${account}|${summary.kind}|${summary.periodEnd || summary.statementDate || summary.firstTxnDate || 'undated'}`;

/** Turn the parser's summary into the record stored in settings. */
export const makeStatementRecord = (summary, { account, fileName = '', importedAt = '' } = {}) => {
    let periodStart = isIso(summary.periodStart) ? summary.periodStart : null;
    const periodEnd = isIso(summary.periodEnd) ? summary.periodEnd : null;
    // A card cycle is about a month: align multi-month or inception ranges to the monthly cycle ending on periodEnd
    if (summary.kind === 'card' && periodEnd) {
        if (periodStart && daysBetween(periodStart, periodEnd) > 62) {
            const startDay = Number(periodStart.slice(8, 10));
            periodStart = cycleStartFor(periodEnd, startDay);
        } else if (!periodStart) {
            periodStart = cycleStartFor(periodEnd);
        }
    }
    return {
        id: statementId(account, summary),
        account,
        kind: summary.kind,
        template: summary.template,
        bank: summary.bank || '',
        last4: summary.last4 || '',
        statementDate: summary.statementDate || null,
        periodStart,
        periodEnd,
        opening: summary.opening ?? null,
        closing: summary.closing ?? null,
        totalDue: summary.totalDue ?? null,
        minDue: summary.minDue ?? null,
        dueDate: summary.dueDate ?? null,
        creditLimit: summary.creditLimit ?? null,
        availableCredit: summary.availableCredit ?? null,
        totalDebits: summary.totalDebits ?? null,
        totalCredits: summary.totalCredits ?? null,
        txnCount: summary.txnCount ?? 0,
        auditStatus: summary.auditStatus || 'unverifiable',
        fileName,
        importedAt
    };
};

/** Replace the record for the same account + period (re-importing a statement never duplicates it). */
export const upsertStatement = (list = [], record) => {
    const rest = (list || []).filter((r) => r && r.id !== record.id);
    return [...rest, record].sort((a, b) => String(a.periodEnd || '').localeCompare(String(b.periodEnd || '')));
};

const endKey = (r) => r.periodEnd || r.statementDate || r.periodStart || '';
const sortedFor = (records, account) => records
    .filter((r) => r && r.account === account && endKey(r))
    .sort((a, b) => endKey(a).localeCompare(endKey(b)));

// ───────────────────────── chain / gaps ─────────────────────────

/**
 * Compare two consecutive statements of one account.
 *   ok       contiguous and opening == previous closing
 *   gap      statements missing in between (months listed when they can be named)
 *   chain    contiguous but the opening balance does not equal the previous closing
 *   overlap  periods overlap (rows are de-duplicated on import, so this is informational)
 */
export const compareConsecutive = (prev, cur) => {
    const prevEnd = endKey(prev);
    const curEnd = endKey(cur);
    const gapDays = daysBetween(prevEnd, curEnd);
    const contiguous = cur.periodStart ? daysBetween(prevEnd, cur.periodStart) <= 3 : gapDays <= STALE_AFTER_DAYS;

    if (!contiguous) {
        const upTo = cur.periodStart ? monthOf(cur.periodStart) : monthOf(curEnd);
        const missing = monthsStrictlyBetween(monthOf(prevEnd), upTo);
        return {
            status: 'gap',
            missingMonths: missing,
            message: missing.length
                ? `No statement for ${missing.join(', ')}`
                : `${gapDays} days between this and the previous statement`
        };
    }
    if (cur.periodStart && daysBetween(cur.periodStart, prevEnd) > 3) {
        return { status: 'overlap', message: 'Overlaps the previous statement period' };
    }
    if (prev.closing != null && cur.opening != null && Math.abs(r2(prev.closing) - r2(cur.opening)) > CHAIN_TOLERANCE) {
        const diff = r2(cur.opening - prev.closing);
        return {
            status: 'chain',
            diff,
            message: `Opening ${fmt(cur.opening)} does not match the previous closing ${fmt(prev.closing)} (difference ${fmt(diff)}). A statement or a transaction may be missing.`
        };
    }
    return { status: 'ok', message: 'Opening balance matches the previous statement' };
};

const fmt = (n) => (n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

/** Per-account timeline with the chain result on each statement, plus a flat issue list. */
export const analyzeStatements = (records = [], todayIso = '') => {
    const accounts = [...new Set((records || []).filter(Boolean).map((r) => r.account))].sort();
    const byAccount = {};
    const issues = [];

    for (const account of accounts) {
        const list = sortedFor(records, account);
        const items = list.map((rec, i) => ({
            record: rec,
            check: i === 0 ? { status: 'first', message: 'First statement on record' } : compareConsecutive(list[i - 1], rec)
        }));
        let stale = null;
        const last = list[list.length - 1];
        if (last && isIso(todayIso) && isIso(endKey(last))) {
            const age = daysBetween(endKey(last), todayIso);
            if (age > STALE_AFTER_DAYS) stale = { status: 'stale', days: age, message: `Latest statement ends ${endKey(last)} (${age} days ago)` };
        }
        byAccount[account] = { items, stale };
        items.forEach((it) => {
            if (['gap', 'chain', 'overlap'].includes(it.check.status)) {
                issues.push({ account, severity: it.check.status === 'overlap' ? 'info' : 'warning', status: it.check.status, statementId: it.record.id, message: it.check.message, missingMonths: it.check.missingMonths || [] });
            }
            if (it.record.auditStatus === 'mismatch') {
                issues.push({ account, severity: 'warning', status: 'audit', statementId: it.record.id, message: `The balance audit failed for the statement ending ${endKey(it.record)}` });
            }
        });
        if (stale) issues.push({ account, severity: 'info', status: 'stale', message: stale.message });
    }
    return { accounts, byAccount, issues };
};

/**
 * Preview, before saving, how an incoming statement relates to what is already on record for the account.
 */
export const checkAgainstHistory = (records = [], account, summary) => {
    const incoming = makeStatementRecord(summary, { account });
    const list = sortedFor(records, account).filter((r) => r.id !== incoming.id);
    const existing = (records || []).find((r) => r && r.id === incoming.id);
    const before = list.filter((r) => endKey(r) < endKey(incoming));
    const after = list.filter((r) => endKey(r) > endKey(incoming));
    const prev = before[before.length - 1];
    const next = after[0];

    const notes = [];
    let status = 'first';
    if (prev) {
        const c = compareConsecutive(prev, incoming);
        status = c.status;
        notes.push({ with: 'previous', ...c });
    }
    if (next) {
        const c = compareConsecutive(incoming, next);
        if (c.status === 'gap' || c.status === 'chain') notes.push({ with: 'next', ...c });
        if (!prev) status = c.status === 'ok' ? 'ok' : c.status;
    }
    return { status, notes, alreadyImported: !!existing, previous: prev || null, next: next || null };
};

// ───────────────────────── net worth ─────────────────────────

/**
 * Keep one Net Worth line per account in step with the newest statement:
 *   credit card → "Credit Cards" liability = total amount due (limit kept as the debt basis)
 *   bank        → "Bank Accounts" balance = closing balance
 * Older statements never overwrite a newer figure. Lines the user created by hand are matched by name and
 * adopted, never duplicated.
 */
export const syncNetWorthFromStatement = (items = [], record, { newId, now = '' } = {}) => {
    if (!record || !record.account) return { items, changed: false };
    const isCard = record.kind === 'card';
    const amount = isCard ? record.totalDue : record.closing;
    const asOf = record.periodEnd || record.statementDate;
    if (amount === null || amount === undefined || !asOf) return { items, changed: false };

    const category = isCard ? 'Credit Cards' : 'Bank Accounts';
    const lowerName = record.account.toLowerCase();
    let idx = items.findIndex((it) => it && it.autoAccount === record.account);
    if (idx < 0) idx = items.findIndex((it) => it && it.category === category && String(it.name || '').toLowerCase() === lowerName);

    const note = `Auto-updated from the statement ending ${asOf}`;
    if (idx >= 0) {
        const cur = items[idx];
        if (cur.asOf && cur.asOf >= asOf) return { items, changed: false };
        const next = isCard
            ? { ...cur, autoAccount: record.account, asOf, value: r2(amount), invested: record.creditLimit ?? cur.invested ?? 0, startDate: record.dueDate || cur.startDate, notes: note }
            : { ...cur, autoAccount: record.account, asOf, currentBalance: r2(amount), invested: 0, value: r2(amount), notes: note };
        const list = items.slice();
        list[idx] = next;
        return { items: list, changed: true };
    }

    const created = isCard
        ? { id: newId(), category, name: record.account, startDate: record.dueDate || asOf, endDate: '', invested: record.creditLimit ?? 0, interestRate: 0, value: r2(amount), notes: note, includeInNetWorth: true, autoAccount: record.account, asOf }
        : { id: newId(), category, name: record.account, startDate: asOf, endDate: '', invested: 0, interestRate: 0, value: r2(amount), currentBalance: r2(amount), notes: note, includeInNetWorth: true, autoAccount: record.account, asOf };
    return { items: [...items, created], changed: true };
};

// ───────────────────────── card bill (Recurring + calendar) ─────────────────────────

const dayOf = (iso) => Number(iso.slice(8, 10));

/**
 * A credit card statement becomes a recurring monthly bill (due day from the statement) plus a pending bill
 * for this cycle with the exact amount due, so it shows on the calendar and in Upcoming Payments.
 * Pending auto-bills from older statements are superseded (the new total already includes them).
 */
export const planCardBill = ({ recurring = [], billInstances = [], record, todayIso, category = 'Credit - Bill 💳', newId }) => {
    if (!record || record.kind !== 'card' || !isIso(record.dueDate) || !isIso(todayIso)) {
        return { recurring, billInstances, changed: false };
    }
    const due = record.dueDate;
    const upcoming = due >= todayIso;
    const name = `${record.account} bill`;
    const total = r2(record.totalDue ?? 0);
    const lowerAccount = record.account.toLowerCase();
    let recs = recurring.slice();
    let changed = false;

    // The card's bill may already exist: made by an earlier statement, or by you (a recurring item named after the card).
    let idx = recs.findIndex((r) => r && r.autoAccount === record.account);
    if (idx < 0) {
        idx = recs.findIndex((r) => r && r.type !== 'income' && [lowerAccount, `${lowerAccount} bill`].includes(String(r.name || '').trim().toLowerCase()));
        if (idx >= 0) { recs[idx] = { ...recs[idx], autoAccount: record.account }; changed = true; }
    }

    if (idx < 0 && upcoming && total > 0) {
        recs.push({
            id: newId(), name, category, type: 'expense', amount: total, isVariableAmount: true, estimatedAmount: total,
            dateFlexDays: 3, amountHistory: [], cadence: 'monthly', weeklyDays: ['Mon'], monthlyDays: String(dayOf(due)),
            customIntervalDays: 14, customDays: '', startDate: due, nextDate: due, endDate: '', occurrences: undefined,
            excludeFromMonthlyCalculations: false, active: true, autoAccount: record.account, autoSource: 'statement'
        });
        idx = recs.length - 1;
        changed = true;
    } else if (idx >= 0 && total > 0) {
        const cur = recs[idx];
        if (upcoming) {
            if (Number(cur.estimatedAmount) !== total || cur.nextDate !== due || String(cur.monthlyDays) !== String(dayOf(due))) {
                recs[idx] = { ...cur, amount: total, estimatedAmount: total, isVariableAmount: true, monthlyDays: String(dayOf(due)), nextDate: due };
                changed = true;
            }
        } else if (Number(cur.estimatedAmount) !== total) {
            // due date already passed: keep the schedule, but the amount owed is what the statement says
            recs[idx] = { ...cur, amount: total, estimatedAmount: total, isVariableAmount: true };
            changed = true;
        }
    }

    const recId = idx >= 0 ? recs[idx].id : null;
    let bills = billInstances.slice();
    // Distinct monthly billing cycles are preserved to maintain full history across cycles (e.g. Sep 7, Oct 7, Nov 7).
    // Older pending bills are NOT deleted so they remain visible as separate overdue instances on Dashboard.

    if (recId && upcoming && total > 0) {
        const existing = bills.find((b) => b && b.recurringId === recId && b.dueDate === due);
        if (existing) {
            if (existing.status === 'pending' && Number(existing.amount) !== total) {
                bills = bills.map((b) => (b === existing ? { ...b, amount: total } : b));
                changed = true;
            }
        } else {
            bills.push({
                id: `bill_stmt_${record.account.replace(/\W+/g, '_')}_${due}`,
                recurringId: recId, name: recs[idx].name || name, category: recs[idx].category || category, type: 'expense', amount: total, dueDate: due, status: 'pending',
                linkedTxId: null, createdAt: new Date().toISOString(), autoSource: 'statement', autoAccount: record.account
            });
            changed = true;
        }
    } else if (recId && total === 0) {
        // nothing owed this cycle: clear any pending bill for this due date
        const kept = bills.filter((b) => !(b && b.recurringId === recId && b.status === 'pending' && b.dueDate === due));
        if (kept.length !== bills.length) { bills = kept; changed = true; }
    }
    return { recurring: recs, billInstances: bills, changed };
};
