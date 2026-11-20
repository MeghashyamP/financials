/**
 * importDedupe.js — decide what an import does with each incoming row, before anything is saved.
 *
 *   duplicate        already in the app (same fingerprint, or same account + date + amount + direction with the
 *                    same reference number / a similar narration) → skipped, so overlapping statements never double up
 *   maybe-duplicate  same account + date + amount + direction but nothing else says it is the same row → left out
 *                    by default, shown in the review so you can add it back
 *   replace          the row is the real bank/card entry for a payment you ticked off on the Dashboard calendar:
 *                    the statement's details replace the temporary transaction (no duplicate, link kept)
 *   insert           new
 *
 * Pure functions, unit-tested in node.
 */

import { cleanNarration } from '../categorizer.js';

const canon = (s) => String(s || '').trim().toLowerCase();
const toUtc = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number); return Date.UTC(y, (m || 1) - 1, d || 1); };
export const dayDiff = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
const sameAmount = (a, b, tol = 0.015) => Math.abs(Number(a) - Number(b)) <= tol;
const cents = (n) => Math.round(Math.abs(Number(n) || 0) * 100);

/** credit = money in, debit = money out (neutral rows carry their own sign). */
export const directionOf = (t) => {
    if (!t) return 'debit';
    if (t.type === 'income') return 'credit';
    if (t.type === 'expense') return 'debit';
    return t.neutralSign === '-' ? 'debit' : 'credit';
};

/** A temporary transaction created by ticking a recurring payment off on the Dashboard. */
export const isDashboardPlaceholder = (t) => !!t
    && !!t.linkedRecurringId
    && (t.source === 'dashboard' || /^Created (Inflow|Outflow) from Dashboard/i.test(String(t.notes || '')));

const tokens = (s) => new Set(cleanNarration(s).split(' ').filter((w) => w.length >= 3 && !/^\d+$/.test(w)));
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Same payee, allowing for different wrapping / noise between two statements. */
export const narrationsAlike = (a, b) => {
    const sa = squash(a);
    const sb = squash(b);
    if (!sa || !sb) return false;
    if (sa === sb) return true;
    const [short, long] = sa.length <= sb.length ? [sa, sb] : [sb, sa];
    if (short.length >= 8 && long.includes(short)) return true;
    const ta = tokens(a);
    const tb = tokens(b);
    if (!ta.size || !tb.size) return false;
    let shared = 0;
    ta.forEach((w) => { if (tb.has(w)) shared += 1; });
    return shared / Math.min(ta.size, tb.size) >= 0.6 && shared >= 1;
};

const legacyKey = (p) => `${String(p.date || '').trim()}|${String(p.merchant || p.narration || '').trim().toLowerCase()}|${Number(p.amount || 0).toFixed(2)}|${String(p.account || 'Imported account').trim().toLowerCase()}`;

/**
 * @param incoming  processed rows: { date, amount, type, neutralSign, account, narration, merchant, refId, fingerprint }
 * @param existing  transactions already saved
 * @param opts      { recurring: settings.recurring, windowDays: placeholder date window (default 7) }
 * @returns         one entry per incoming row, same order:
 *                  { action, matchId, matchLabel, reason }
 */
export const planImport = (incoming = [], existing = [], { recurring = [], windowDays = 7, exactOnly = false } = {}) => {
    const plan = incoming.map(() => ({ action: 'insert' }));
    const consumed = new Set();

    // 1. exact fingerprint (and rows saved before `type` was part of the fingerprint)
    const byFp = new Map();
    const byLegacy = new Map();
    for (const t of existing) {
        if (!t) continue;
        if (t.fingerprint) {
            byFp.set(t.fingerprint, t.id);
            byLegacy.set(`${t.fingerprint}|${t.type}`, t.id);
        }
    }
    incoming.forEach((row, i) => {
        const hit = byFp.get(row.fingerprint);
        if (hit && !consumed.has(hit)) {
            consumed.add(hit);
            plan[i] = { action: 'duplicate', matchId: hit, reason: 'exact' };
            return;
        }
        if (!String(row.fingerprint || '').includes('#')) {
            const old = byLegacy.get(`${legacyKey(row)}|${row.type}`);
            if (old && !consumed.has(old)) { consumed.add(old); plan[i] = { action: 'duplicate', matchId: old, reason: 'exact' }; }
        }
    });

    if (exactOnly) return plan;

    // 2. same account + date + amount + direction (overlapping statements whose narration text differs)
    const idx = new Map();
    for (const t of existing) {
        if (!t || isDashboardPlaceholder(t)) continue;
        const k = `${canon(t.account)}|${String(t.date).slice(0, 10)}|${cents(t.amount)}|${directionOf(t)}`;
        if (!idx.has(k)) idx.set(k, []);
        idx.get(k).push(t);
    }
    incoming.forEach((row, i) => {
        if (plan[i].action !== 'insert') return;
        const k = `${canon(row.account)}|${String(row.date).slice(0, 10)}|${cents(row.amount)}|${directionOf(row)}`;
        const cands = (idx.get(k) || []).filter((t) => !consumed.has(t.id));
        if (!cands.length) return;
        const strong = cands.find((t) => (row.refId && t.refId && canon(row.refId) === canon(t.refId)) || narrationsAlike(row.narration, t.narration));
        if (strong) {
            consumed.add(strong.id);
            plan[i] = { action: 'duplicate', matchId: strong.id, reason: 'same-details' };
        } else {
            plan[i] = { action: 'maybe-duplicate', matchId: cands[0].id, reason: 'same-day-amount', matchLabel: cands[0].narration };
        }
    });

    // 3. temporary Dashboard payments replaced by the real statement row
    const placeholders = existing.filter((t) => isDashboardPlaceholder(t));
    if (placeholders.length) {
        const recById = new Map((recurring || []).filter(Boolean).map((r) => [r.id, r]));
        const order = incoming.map((_, i) => i).filter((i) => plan[i].action === 'insert')
            .sort((a, b) => String(incoming[a].date).localeCompare(String(incoming[b].date)));
        for (const i of order) {
            const row = incoming[i];
            let best = null;
            let bestScore = Infinity;
            for (const ph of placeholders) {
                if (consumed.has(ph.id)) continue;
                if (directionOf(ph) !== directionOf(row)) continue;
                const d = Math.abs(dayDiff(ph.date, row.date));
                const sched = ph.scheduledDate ? dayDiff(ph.scheduledDate, row.date) : null;
                const inWindow = d <= windowDays || (sched !== null && sched >= -3 && sched <= 10);
                if (!inWindow) continue;
                const rec = recById.get(ph.linkedRecurringId);
                const variable = !!(rec && (rec.isVariableAmount || rec.estimatedAmount));
                const tol = variable ? Math.max(1, 0.3 * Number(ph.amount)) : Math.max(1, 0.005 * Number(ph.amount));
                const diff = Math.abs(Number(row.amount) - Number(ph.amount));
                if (diff > tol) continue;
                const score = (diff / Math.max(1, Number(ph.amount))) * 100 + d - (canon(ph.account) === canon(row.account) ? 1 : 0);
                if (score < bestScore) { best = ph; bestScore = score; }
            }
            if (best) {
                consumed.add(best.id);
                plan[i] = { action: 'replace', matchId: best.id, matchLabel: best.merchant || best.narration, reason: 'dashboard-payment' };
            }
        }
    }
    return plan;
};

/**
 * Give every row its fingerprint. Identical rows inside ONE import (two ₹20 payments to the same shop on a day) get
 * #2, #3… so both are kept; re-importing the same file reproduces the same suffixes → still de-duplicated.
 */
export const withFingerprints = (rows, fingerprintOf) => {
    const seen = new Map();
    return rows.map((r) => {
        const base = fingerprintOf(r);
        const n = (seen.get(base) || 0) + 1;
        seen.set(base, n);
        return { ...r, fingerprint: n > 1 ? `${base}#${n}` : base };
    });
};

/** The saved transaction after a statement row replaces a temporary Dashboard payment. */
export const mergeIntoPlaceholder = (ph, row, { fmtDate = (d) => d } = {}) => {
    const neutral = row.type === 'neutral';
    const rowChoseCategory = row.categorySource === 'rule' || row.categorySource === 'manual';
    // The recurring item's category is what you meant; keep it unless the statement row was categorised by you / a rule,
    // or it is a transfer-type row (type and category must agree).
    const keepCategory = !neutral && !rowChoseCategory && ph.category && !/Needs Review|Uncategorized/i.test(ph.category);
    const tags = [...new Set([...(Array.isArray(ph.tags) ? ph.tags : []), ...(Array.isArray(row.tags) ? row.tags : [])])];
    const merged = {
        ...ph,
        date: row.date,
        narration: row.narration,
        merchant: row.merchant || row.narration,
        refId: row.refId || ph.refId || '',
        amount: row.amount,
        type: row.type,
        account: row.account || ph.account,
        fingerprint: row.fingerprint,
        source: row.source || 'pdf-import',
        documentId: row.documentId || ph.documentId || null,
        category: keepCategory ? ph.category : row.category,
        categorySource: keepCategory ? 'recurring' : row.categorySource,
        categoryConfidence: keepCategory ? 'high' : row.categoryConfidence,
        tags,
        notes: `Matched your Dashboard payment "${ph.merchant || ph.narration}" of ${fmtDate(ph.date)}; the statement's details were kept`,
        linkedRecurringId: ph.linkedRecurringId
    };
    if (neutral) merged.neutralSign = row.neutralSign; else delete merged.neutralSign;
    if (row.ruleChanges) merged.ruleChanges = row.ruleChanges;
    delete merged.scheduledDate;
    if (merged.categorySource === undefined) delete merged.categorySource;
    if (merged.categoryConfidence === undefined) delete merged.categoryConfidence;
    return merged;
};

/** Counts for toasts / the review banner. */
export const summarizePlan = (plan = []) => plan.reduce((acc, p) => {
    acc[p.action] = (acc[p.action] || 0) + 1;
    return acc;
}, { insert: 0, duplicate: 0, 'maybe-duplicate': 0, replace: 0 });
