/**
 * reports.js — numbers behind the Reports page. Pure functions (dates and "today" are passed in), unit-tested in node.
 *
 *   financial-year summary + year-on-year, what the cards cost, unusual-spend alerts,
 *   a 30-day cash-flow forecast, and CSV export.
 *
 * Only `income` and `expense` rows count as money earned / spent; `neutral` rows (transfers between your own
 * accounts, card bill payments) are left out, exactly as on the dashboard.
 */

import { merchantKey } from '../categorizer.js';

const r2 = (n) => Math.round(Number(n) * 100) / 100;
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');
const toUtc = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
export const dayDiff = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
export const addDays = (iso, n) => {
    const d = new Date(toUtc(iso) + n * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};
const monthKey = (iso) => String(iso).slice(0, 7);
const median = (arr) => {
    const a = arr.slice().sort((x, y) => x - y);
    const mid = Math.floor(a.length / 2);
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
};

// ───────────────────────── financial year ─────────────────────────

/** Start year of the financial year containing `iso` (India: April → March, so 2026-02-10 is in FY 2025-26). */
export const fyStartYear = (iso, startMonth = 4) => {
    const y = Number(String(iso).slice(0, 4));
    const m = Number(String(iso).slice(5, 7));
    return m >= startMonth ? y : y - 1;
};
export const fyLabel = (startYear, startMonth = 4) =>
    (startMonth === 1 ? `${startYear}` : `FY ${startYear}-${String(startYear + 1).slice(2)}`);
export const fyMonths = (startYear, startMonth = 4) => {
    const out = [];
    for (let i = 0; i < 12; i++) {
        const m0 = startMonth - 1 + i;
        const y = startYear + Math.floor(m0 / 12);
        const m = (m0 % 12) + 1;
        out.push({ key: `${y}-${pad(m)}`, label: `${MONTH_NAMES[m - 1]} ${String(y).slice(2)}` });
    }
    return out;
};
export const fyRange = (startYear, startMonth = 4) => {
    const months = fyMonths(startYear, startMonth);
    const last = months[11].key;
    const [ly, lm] = last.split('-').map(Number);
    const lastDay = new Date(Date.UTC(ly, lm, 0)).getUTCDate();
    return { start: `${months[0].key}-01`, end: `${last}-${pad(lastDay)}` };
};
/** Financial years that have any transactions, newest first. */
export const availableFys = (transactions = [], startMonth = 4) => {
    const set = new Set(transactions.filter((t) => t && t.date).map((t) => fyStartYear(t.date, startMonth)));
    return [...set].sort((a, b) => b - a);
};

const parentOf = (c) => (String(c || '').includes(' - ') ? String(c).split(' - ')[0] : (c || 'Others'));

export const summarizeFy = (transactions = [], startYear, { startMonth = 4, monthsLimit = 12 } = {}) => {
    const months = fyMonths(startYear, startMonth).slice(0, monthsLimit);
    const keys = new Set(months.map((m) => m.key));
    const byMonth = new Map(months.map((m) => [m.key, { ...m, income: 0, expense: 0 }]));
    const cats = new Map();
    const parents = new Map();
    let income = 0;
    let expense = 0;
    for (const t of transactions) {
        if (!t || !t.date || !keys.has(monthKey(t.date))) continue;
        const amt = Number(t.amount) || 0;
        if (t.type === 'income') { income += amt; byMonth.get(monthKey(t.date)).income += amt; }
        else if (t.type === 'expense') {
            expense += amt; byMonth.get(monthKey(t.date)).expense += amt;
            const c = t.category || 'Others';
            const e = cats.get(c) || { category: c, total: 0, count: 0 };
            e.total += amt; e.count += 1; cats.set(c, e);
            const p = parentOf(c);
            const pe = parents.get(p) || { parent: p, total: 0, count: 0 };
            pe.total += amt; pe.count += 1; parents.set(p, pe);
        }
    }
    const share = (list) => list.map((x) => ({ ...x, total: r2(x.total), share: expense > 0 ? x.total / expense : 0 })).sort((a, b) => b.total - a.total);
    return {
        startYear, label: fyLabel(startYear, startMonth),
        income: r2(income), expense: r2(expense), savings: r2(income - expense),
        savingsRate: income > 0 ? (income - expense) / income : null,
        months: [...byMonth.values()].map((m) => ({ ...m, income: r2(m.income), expense: r2(m.expense) })),
        categories: share([...cats.values()]),
        parents: share([...parents.values()])
    };
};

/**
 * This FY against the previous one. While the current FY is still running, the previous year is cut at the same
 * number of months so the comparison is like for like.
 */
export const compareFy = (transactions = [], startYear, { startMonth = 4, todayIso } = {}) => {
    const currentStart = todayIso ? fyStartYear(todayIso, startMonth) : startYear;
    let elapsed = 12;
    if (todayIso && startYear === currentStart) {
        const m = Number(todayIso.slice(5, 7));
        elapsed = ((m - startMonth + 12) % 12) + 1;
    }
    const current = summarizeFy(transactions, startYear, { startMonth, monthsLimit: elapsed });
    const previous = summarizeFy(transactions, startYear - 1, { startMonth, monthsLimit: elapsed });
    const pct = (a, b) => (b > 0 ? (a - b) / b : null);
    return {
        current, previous, monthsCompared: elapsed, partial: elapsed < 12,
        delta: {
            income: r2(current.income - previous.income), expense: r2(current.expense - previous.expense), savings: r2(current.savings - previous.savings),
            incomePct: pct(current.income, previous.income), expensePct: pct(current.expense, previous.expense)
        },
        hasPrevious: previous.income + previous.expense > 0
    };
};

// ───────────────────────── what the cards cost ─────────────────────────

export const COST_BUCKETS = [
    { id: 'finance', label: 'Interest & finance charges', re: /finance\s*charge|fin\.?\s*chg|interest\s*(charge|on)|emi\s*interest|\bint\.?\s*(on|chg)\b/i },
    { id: 'late', label: 'Late payment fees', re: /late\s*(payment|fee)|\blpc\b|overdue|over\s*limit|overlimit/i },
    { id: 'gst', label: 'GST on fees', re: /\b(i|c|s)?gst\b/i },
    { id: 'forex', label: 'Forex markup', re: /forex|mark\s*-?up|cross\s*currency|\bdcc\b/i },
    { id: 'annual', label: 'Annual / joining fee', re: /annual\s*fee|joining\s*fee|membership\s*fee|renewal\s*fee/i },
    { id: 'other', label: 'Other fees & penalties', re: /\bfees?\b|penalt|processing\s*fee|convenience|surcharge|cash\s*advance\s*fee/i }
];

/** Fees, interest and penalties paid (rows filed under "Hidden Charges", or whose narration says so). */
export const cardCosts = (transactions = [], { from, to } = {}) => {
    const rows = [];
    for (const t of transactions) {
        if (!t || t.type !== 'expense' || !t.date) continue;
        if (from && t.date < from) continue;
        if (to && t.date > to) continue;
        const text = `${t.narration || ''} ${t.merchant || ''}`;
        const hiddenCat = /^Hidden Charges/i.test(t.category || '') || /^Tax - GST/i.test(t.category || '');
        const bucket = COST_BUCKETS.find((b) => b.re.test(text));
        if (!hiddenCat && !(bucket && bucket.id !== 'other' && bucket.id !== 'gst')) continue;
        const b = bucket || COST_BUCKETS[COST_BUCKETS.length - 1];
        rows.push({ id: t.id, date: t.date, account: t.account, narration: t.narration, amount: Number(t.amount) || 0, bucket: b.id });
    }
    const sumBy = (keyFn) => {
        const m = new Map();
        rows.forEach((r) => { const k = keyFn(r); m.set(k, (m.get(k) || 0) + r.amount); });
        return m;
    };
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return {
        total: r2(total),
        count: rows.length,
        byBucket: COST_BUCKETS.map((b) => ({ id: b.id, label: b.label, total: r2(sumBy((r) => r.bucket).get(b.id) || 0), count: rows.filter((r) => r.bucket === b.id).length })).filter((b) => b.count > 0),
        byAccount: [...sumBy((r) => r.account || 'Unknown').entries()].map(([account, t]) => ({ account, total: r2(t) })).sort((a, b) => b.total - a.total),
        rows: rows.sort((a, b) => b.date.localeCompare(a.date))
    };
};

// ───────────────────────── alerts ─────────────────────────

const label = (t) => String(t.narration || t.merchant || '').trim().slice(0, 60);

export const findDuplicateCharges = (transactions = [], { minAmount = 100 } = {}) => {
    const groups = new Map();
    for (const t of transactions) {
        if (!t || t.type !== 'expense' || (Number(t.amount) || 0) < minAmount) continue;
        const k = `${t.account}|${t.date}|${Number(t.amount).toFixed(2)}|${merchantKey(t.narration || t.merchant || '')}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(t);
    }
    return [...groups.values()].filter((g) => g.length > 1).map((g) => ({
        kind: 'duplicate', severity: 'warning',
        title: `${g.length} identical charges on ${g[0].date}`,
        detail: `${label(g[0])} · ${g[0].account} · ${r2(g[0].amount)} each — a double swipe, or two real purchases?`,
        txIds: g.map((t) => t.id), date: g[0].date
    }));
};

export const findLargeOutliers = (transactions = [], { todayIso, windowDays = 90, factor = 3, minExcess = 1000, minHistory = 4 } = {}) => {
    const byMerchant = new Map();
    for (const t of transactions) {
        if (!t || t.type !== 'expense') continue;
        const k = merchantKey(t.narration || t.merchant || '');
        if (!k || k.length < 3) continue;
        if (!byMerchant.has(k)) byMerchant.set(k, []);
        byMerchant.get(k).push(t);
    }
    const out = [];
    for (const list of byMerchant.values()) {
        if (list.length < minHistory) continue;
        const med = median(list.map((t) => Number(t.amount) || 0));
        for (const t of list) {
            if (todayIso && dayDiff(t.date, todayIso) > windowDays) continue;
            const amt = Number(t.amount) || 0;
            if (amt > med * factor && amt - med >= minExcess) {
                out.push({
                    kind: 'large', severity: 'info', title: `Unusually large: ${label(t)}`,
                    detail: `${r2(amt)} on ${t.date} (${t.account}) — this merchant is usually about ${r2(med)}.`,
                    txIds: [t.id], date: t.date
                });
            }
        }
    }
    return out;
};

export const findNewBigMerchants = (transactions = [], { todayIso, recentDays = 45, minAmount = 5000, minHistoryDays = 60 } = {}) => {
    // "New" only means something once there is history to be new against: with a single imported statement every
    // payee would look new.
    const dated = transactions.filter((t) => t && t.date).map((t) => t.date).sort();
    const earliest = dated[0];
    const first = new Map();
    for (const t of transactions) {
        if (!t || t.type !== 'expense') continue;
        const k = merchantKey(t.narration || t.merchant || '');
        if (!k || k.length < 3) continue;
        const e = first.get(k);
        if (!e) first.set(k, { first: t, count: 1 });
        else { e.count += 1; if (t.date < e.first.date) e.first = t; }
    }
    const out = [];
    for (const e of first.values()) {
        const t = e.first;
        if (e.count > 1 || (Number(t.amount) || 0) < minAmount) continue;
        if (todayIso && dayDiff(t.date, todayIso) > recentDays) continue;
        if (!earliest || dayDiff(earliest, t.date) < minHistoryDays) continue;
        out.push({ kind: 'new-merchant', severity: 'info', title: `New payee: ${label(t)}`, detail: `First payment ${r2(t.amount)} on ${t.date} (${t.account}).`, txIds: [t.id], date: t.date });
    }
    return out;
};

/** A monthly charge whose amount just changed (streaming, software, insurance…). */
export const findPriceChanges = (transactions = [], { minChange = 0.05 } = {}) => {
    const byMerchant = new Map();
    for (const t of transactions) {
        if (!t || t.type !== 'expense') continue;
        const k = merchantKey(t.narration || t.merchant || '');
        if (!k || k.length < 3) continue;
        if (!byMerchant.has(k)) byMerchant.set(k, []);
        byMerchant.get(k).push(t);
    }
    const out = [];
    for (const list of byMerchant.values()) {
        if (list.length < 3) continue;
        const s = list.slice().sort((a, b) => a.date.localeCompare(b.date));
        const gaps = s.slice(1).map((t, i) => dayDiff(s[i].date, t.date));
        const monthly = gaps.length >= 2 && gaps.every((g) => g >= 24 && g <= 38);
        if (!monthly) continue;
        const last = s[s.length - 1];
        const prev = s[s.length - 2];
        const before = s[s.length - 3];
        const a = Number(last.amount) || 0;
        const b = Number(prev.amount) || 0;
        if (b > 0 && Math.abs(Number(before.amount) - b) < 0.5 && Math.abs(a - b) / b >= minChange) {
            out.push({
                kind: 'price-change', severity: 'warning', title: `${a > b ? 'Price up' : 'Price down'}: ${label(last)}`,
                detail: `Was ${r2(b)}, now ${r2(a)} (${a > b ? '+' : ''}${(((a - b) / b) * 100).toFixed(0)}%) on ${last.date}.`,
                txIds: [last.id], date: last.date
            });
        }
    }
    return out;
};

export const buildAlerts = (transactions = [], { todayIso } = {}) => {
    const all = [
        ...findDuplicateCharges(transactions),
        ...findPriceChanges(transactions),
        ...findLargeOutliers(transactions, { todayIso }),
        ...findNewBigMerchants(transactions, { todayIso })
    ];
    const rank = { warning: 0, info: 1 };
    return all.sort((a, b) => (rank[a.severity] - rank[b.severity]) || String(b.date).localeCompare(String(a.date)));
};

// ───────────────────────── forecast ─────────────────────────

/**
 * Day-by-day cash balance for the next `days` days from what is already scheduled: recurring items and pending
 * bills. `nextOccurrence(item, fromIso)` returns the first occurrence on/after `fromIso` (or '' when none) —
 * injected so this stays free of the date engine in utils. A pending bill replaces that month's recurring estimate.
 */
export const buildForecast = ({
    startBalance = 0, recurring = [], billInstances = [], todayIso, days = 30, nextOccurrence,
    everydayDaily = 0, includeEveryday = false
}) => {
    const endIso = addDays(todayIso, days - 1);
    const events = [];
    const consumed = new Set();
    const pending = (billInstances || []).filter((b) => b && b.status === 'pending');

    for (const r of recurring || []) {
        if (!r || r.active === false) continue;
        let from = todayIso;
        for (let guard = 0; guard < 400; guard++) {
            const d = nextOccurrence ? nextOccurrence(r, from) : '';
            if (!d || d > endIso) break;
            const bill = pending.find((b) => b.recurringId === r.id && monthKey(b.dueDate) === monthKey(d) && !consumed.has(b.id));
            const amount = Number(bill ? bill.amount : (r.estimatedAmount ?? r.amount)) || 0;
            const date = bill ? bill.dueDate : d;
            if (bill) consumed.add(bill.id);
            if (amount > 0 && date >= todayIso && date <= endIso) {
                events.push({ date, name: r.name, amount, direction: r.type === 'income' ? 'in' : 'out', source: bill ? 'bill' : 'recurring', recurringId: r.id });
            }
            from = addDays(d, 1);
        }
    }
    // pending bills not tied to a recurring occurrence in the window (including recently overdue ones, shown today)
    for (const b of pending) {
        if (consumed.has(b.id)) continue;
        const amount = Number(b.amount) || 0;
        if (amount <= 0) continue;
        const overdue = b.dueDate < todayIso;
        if (overdue && dayDiff(b.dueDate, todayIso) > 31) continue;
        if (!overdue && b.dueDate > endIso) continue;
        events.push({ date: overdue ? todayIso : b.dueDate, name: b.name, amount, direction: b.type === 'income' ? 'in' : 'out', source: 'bill', overdue });
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

    const series = [];
    let balance = Number(startBalance) || 0;
    let min = null;
    for (let i = 0; i < days; i++) {
        const date = addDays(todayIso, i);
        const todays = events.filter((e) => e.date === date);
        const delta = todays.reduce((s, e) => s + (e.direction === 'in' ? e.amount : -e.amount), 0) - (includeEveryday ? everydayDaily : 0);
        balance = r2(balance + delta);
        series.push({ date, balance, delta: r2(delta), events: todays });
        if (!min || balance < min.balance) min = { date, balance };
    }
    return {
        startBalance: r2(startBalance), endBalance: series.length ? series[series.length - 1].balance : r2(startBalance),
        series, events, min, goesNegative: !!(min && min.balance < 0),
        totalIn: r2(events.filter((e) => e.direction === 'in').reduce((s, e) => s + e.amount, 0)),
        totalOut: r2(events.filter((e) => e.direction === 'out').reduce((s, e) => s + e.amount, 0))
    };
};

// Spending that is scheduled or lumpy rather than "everyday": left out of the per-day estimate.
const NOT_EVERYDAY = new Set(['EMI', 'Insurance', 'Investment', 'Tax', 'Credit', 'Transfer', 'Misc', 'Hidden Charges']);

/**
 * Typical everyday spending per day: recurring-linked rows and EMI / insurance / investment / tax / transfer rows are
 * left out, and the total is divided by the days the data actually covers (at least 30), not by the whole window.
 */
export const everydaySpendPerDay = (transactions = [], { todayIso, windowDays = 90 } = {}) => {
    let total = 0;
    let earliest = null;
    for (const t of transactions) {
        if (!t || t.type !== 'expense' || t.linkedRecurringId || !t.date) continue;
        const gap = dayDiff(t.date, todayIso);
        if (gap < 0 || gap >= windowDays) continue;
        if (NOT_EVERYDAY.has(parentOf(t.category))) continue;
        total += Number(t.amount) || 0;
    }
    for (const t of transactions) {
        if (!t || !t.date) continue;
        const gap = dayDiff(t.date, todayIso);
        if (gap < 0 || gap >= windowDays) continue;
        if (!earliest || t.date < earliest) earliest = t.date;
    }
    const covered = earliest ? Math.min(windowDays, Math.max(30, dayDiff(earliest, todayIso) + 1)) : windowDays;
    return r2(total / covered);
};

// ───────────────────────── CSV export ─────────────────────────

const FORMULA_START = /^[=+\-@\t\r]/;

/** CSV-safe cell. Text that a spreadsheet could read as a formula gets a leading apostrophe. */
export const csvCell = (value, { text = false } = {}) => {
    if (value === null || value === undefined) return '';
    let s = typeof value === 'number' ? String(value) : String(value);
    if (text && FORMULA_START.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const TRANSACTION_COLUMNS = [
    { key: 'date', header: 'Date' },
    { key: 'account', header: 'Account', text: true },
    { key: 'narration', header: 'Narration', text: true },
    { key: 'category', header: 'Category', text: true },
    { key: 'type', header: 'Type' },
    { key: 'debit', header: 'Debit' },
    { key: 'credit', header: 'Credit' },
    { key: 'neutral', header: 'Transfer (not income/expense)' },
    { key: 'refId', header: 'Ref ID', text: true },
    { key: 'tags', header: 'Tags', text: true },
    { key: 'notes', header: 'Notes', text: true }
];

const rowFor = (t) => {
    const amt = Number(t.amount) || 0;
    const neutralOut = t.type === 'neutral' && t.neutralSign === '-';
    const neutralIn = t.type === 'neutral' && t.neutralSign !== '-';
    return {
        date: t.date, account: t.account || '', narration: t.narration || t.merchant || '', category: t.category || '',
        type: t.type === 'income' ? 'Income' : t.type === 'neutral' ? 'Transfer' : 'Expense',
        debit: t.type === 'expense' ? amt : (neutralOut ? amt : ''),
        credit: t.type === 'income' ? amt : (neutralIn ? amt : ''),
        neutral: t.type === 'neutral' ? amt : '',
        refId: t.refId || '', tags: Array.isArray(t.tags) ? t.tags.join('; ') : (t.tags || ''), notes: t.notes || ''
    };
};

export const filterTransactions = (transactions = [], { from, to, account, category, type } = {}) =>
    transactions.filter((t) => t
        && (!from || t.date >= from) && (!to || t.date <= to)
        && (!account || t.account === account)
        && (!category || (t.category || '').startsWith(category))
        && (!type || type === 'all' || t.type === type));

/** CSV text (UTF-8 BOM + CRLF so Excel opens ₹, accents and quotes correctly). */
export const transactionsToCSV = (transactions = [], { bom = true } = {}) => {
    const sorted = transactions.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const head = TRANSACTION_COLUMNS.map((c) => csvCell(c.header)).join(',');
    const lines = sorted.map((t) => {
        const row = rowFor(t);
        return TRANSACTION_COLUMNS.map((c) => csvCell(row[c.key], { text: c.text })).join(',');
    });
    return (bom ? '﻿' : '') + [head, ...lines].join('\r\n') + '\r\n';
};

export const STATEMENT_COLUMNS = [
    ['account', 'Account'], ['kind', 'Kind'], ['periodStart', 'Period start'], ['periodEnd', 'Period end'], ['statementDate', 'Statement date'],
    ['opening', 'Opening / previous balance'], ['closing', 'Closing / total due'], ['minDue', 'Minimum due'], ['dueDate', 'Due date'],
    ['creditLimit', 'Credit limit'], ['txnCount', 'Transactions'], ['auditStatus', 'Audit']
];
export const statementsToCSV = (statements = [], { bom = true } = {}) => {
    const head = STATEMENT_COLUMNS.map(([, h]) => csvCell(h)).join(',');
    const lines = statements.slice().sort((a, b) => String(a.periodEnd).localeCompare(String(b.periodEnd)))
        .map((s) => STATEMENT_COLUMNS.map(([k]) => csvCell(s[k], { text: k === 'account' })).join(','));
    return (bom ? '﻿' : '') + [head, ...lines].join('\r\n') + '\r\n';
};
