/**
 * recurringMatch.js — "catch-up import": match statement rows to the payments your Recurring list expects.
 *
 * For every recurring item the schedule is expanded into the dates it should have been paid on. Each incoming row is
 * then scored against the open dates (amount, date, and whether the text looks like that item — learned from rows you
 * already linked). Matching is one row ↔ one date. Only confident matches are pre-accepted.
 *
 * Pure functions, unit-tested in node. `nextOccurrence(item, fromIso)` is injected (the app's date engine).
 */

import { merchantKey } from '../categorizer.js';
import { dayDiff, directionOf, narrationsAlike } from './importDedupe.js';

const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const addDays = (iso, n) => {
    const [y, m, d] = iso.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d) + n * 86400000);
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
};

const HALF_INTERVAL = { daily: 0, weekly: 3, weekly_days: 3, biweekly: 6, custom_interval: 6 };
/** How close an existing linked payment must be to count as "this occurrence is already paid". */
const filledWindow = (item) => (HALF_INTERVAL[item.cadence] !== undefined ? HALF_INTERVAL[item.cadence] : 15);

/** Dates the item is scheduled on within [fromIso, toIso]. */
export const expandOccurrences = (item, fromIso, toIso, nextOccurrence, cap = 120) => {
    const out = [];
    let from = fromIso;
    for (let i = 0; i < cap; i++) {
        const d = nextOccurrence(item, from);
        if (!d || d > toIso) break;
        if (d >= fromIso) out.push(d);
        from = addDays(d, 1);
    }
    return out;
};

const isVariable = (r) => !!(r.isVariableAmount || r.estimatedAmount);
const expectedAmount = (r) => Number(r.estimatedAmount || r.amount) || 0;

/** What each recurring item's payments have looked like before (from rows already linked to it). */
export const learnNarrations = (existing = []) => {
    const map = new Map();
    for (const t of existing) {
        if (!t || !t.linkedRecurringId) continue;
        const key = merchantKey(t.narration || t.merchant || '');
        if (!key || key.length < 3) continue;
        if (!map.has(t.linkedRecurringId)) map.set(t.linkedRecurringId, new Set());
        map.get(t.linkedRecurringId).add(key);
    }
    return map;
};

const nameHit = (row, item, learned) => {
    const key = merchantKey(row.narration || '');
    if (key && key.length >= 3 && learned.get(item.id) && learned.get(item.id).has(key)) return 'learned';
    const name = squash(item.name);
    if (name.length >= 5 && squash(row.narration).includes(name)) return 'name';
    if (item.name && narrationsAlike(item.name, row.narration)) return 'name';
    return null;
};

/**
 * @param rows         incoming rows { date, amount, type, neutralSign, narration, skip? } — `skip` rows (duplicates,
 *                     replacements) are ignored
 * @param recurring    settings.recurring
 * @param existing     saved transactions (linked ones = already-paid dates + learned narrations)
 * @returns { matches: [one per row: null | { recurringId, name, occurrence, confidence, score, reason, alternatives }],
 *            missed: [{ recurringId, name, date, amount }] }
 *          confidence: 'high' | 'medium' | 'low'  (only high / medium should be applied automatically)
 */
export const planRecurringMatches = ({ rows = [], recurring = [], existing = [], nextOccurrence, todayIso, extraWindow = 5 }) => {
    const matches = rows.map(() => null);
    const live = rows.map((r, i) => i).filter((i) => !rows[i].skip && rows[i].date);
    if (!live.length || !recurring.length || !nextOccurrence) return { matches, missed: [] };

    const dates = live.map((i) => rows[i].date).sort();
    const rangeFrom = addDays(dates[0], -15);
    const rangeTo = addDays(dates[dates.length - 1], 15);
    const learned = learnNarrations(existing);
    const linkedByRec = new Map();
    for (const t of existing) {
        if (!t || !t.linkedRecurringId || !t.date) continue;
        if (!linkedByRec.has(t.linkedRecurringId)) linkedByRec.set(t.linkedRecurringId, []);
        linkedByRec.get(t.linkedRecurringId).push(String(t.date).slice(0, 10));
    }

    // open occurrences
    const occs = [];
    for (const item of recurring) {
        if (!item || item.active === false || !item.id) continue;
        const win = filledWindow(item);
        const paid = linkedByRec.get(item.id) || [];
        for (const date of expandOccurrences(item, rangeFrom, rangeTo, nextOccurrence)) {
            if (paid.some((p) => Math.abs(dayDiff(p, date)) <= win)) continue;     // already paid
            occs.push({ item, date, key: `${item.id}|${date}` });
        }
    }

    // score every plausible pair
    const pairs = [];
    for (const i of live) {
        const row = rows[i];
        const dir = directionOf(row);
        for (const o of occs) {
            const want = o.item.type === 'income' ? 'credit' : 'debit';
            if (dir !== want) continue;
            const exp = expectedAmount(o.item);
            const diff = Math.abs(Number(row.amount) - exp);
            const tol = isVariable(o.item) ? Math.max(1, 0.3 * exp) : Math.max(1, 0.005 * exp);
            if (diff > tol) continue;
            const hit = nameHit(row, o.item, learned);
            const gap = Math.abs(dayDiff(o.date, row.date));
            const window = (Number(o.item.dateFlexDays) || 0) + extraWindow + (hit ? 7 : 0);
            if (gap > window) continue;
            const exact = diff <= 0.5;
            const score = 50 + (hit === 'learned' ? 40 : hit === 'name' ? 30 : 0) + (exact ? 10 : 0) - gap * 2;
            let confidence = 'low';
            if (hit && score >= 70) confidence = 'high';
            else if ((exact && !isVariable(o.item) && gap <= 3) || hit) confidence = 'medium';
            pairs.push({ i, o, score, confidence, reason: hit || (exact ? 'amount+date' : 'date') });
        }
    }

    // best first, one row ↔ one occurrence
    pairs.sort((a, b) => b.score - a.score);
    const usedRow = new Set();
    const usedOcc = new Set();
    for (const p of pairs) {
        if (usedRow.has(p.i) || usedOcc.has(p.o.key)) continue;
        const rivals = pairs.filter((q) => q.i === p.i && q.o.item.id !== p.o.item.id && !usedOcc.has(q.o.key));
        const close = rivals.filter((q) => p.score - q.score <= 5);
        // two different items fit equally well and no text tells them apart → don't pick, offer both
        const ambiguous = close.length > 0 && !(p.reason === 'learned' || p.reason === 'name');
        usedRow.add(p.i);
        usedOcc.add(p.o.key);
        matches[p.i] = {
            recurringId: p.o.item.id,
            name: p.o.item.name,
            occurrence: p.o.date,
            confidence: ambiguous ? 'low' : p.confidence,
            score: p.score,
            reason: p.reason,
            alternatives: ambiguous ? [p, ...close.slice(0, 3)].map((q) => ({ recurringId: q.o.item.id, name: q.o.item.name })) : []
        };
    }

    // scheduled dates inside the statement's own range that nothing matched
    const lo = dates[0];
    const hi = todayIso && todayIso < dates[dates.length - 1] ? todayIso : dates[dates.length - 1];
    const missed = occs
        .filter((o) => o.date >= lo && o.date <= hi && !usedOcc.has(o.key))
        .map((o) => ({ recurringId: o.item.id, name: o.item.name, date: o.date, amount: expectedAmount(o.item), type: o.item.type }))
        .sort((a, b) => a.date.localeCompare(b.date));
    return { matches, missed };
};

/** Matches that are safe to apply without asking. */
export const isAutoApplied = (m) => !!m && (m.confidence === 'high' || m.confidence === 'medium');
