/**
 * review.js — helpers behind the "Needs Review" inbox and the learned-merchants manager.
 * Pure functions, unit-tested in node.
 */

import { merchantKey, cleanNarration, AUTO_SOURCES, isUserDecision } from '../categorizer.js';

export { AUTO_SOURCES, isUserDecision };

export const NEEDS_REVIEW_RE = /Needs Review|Uncategorized|^Needs review$/i;
// Categories that move money between your own accounts: never income or spending.
export const NEUTRAL_CATEGORY_RE = /^(Transfer|Misc) - |^Credit - Bill/;

// A missing / empty category also needs review.
export const isNeedsReview = (t) => !!t && (!String(t.category || '').trim() || NEEDS_REVIEW_RE.test(String(t.category)));

const keyOf = (t) => merchantKey(t.narration || t.merchant || '') || cleanNarration(t.narration || t.merchant || '').slice(0, 24) || 'unknown';

/**
 * Text for a "merchant contains …" rule that will still match next month's narration (no reference numbers,
 * dates or amounts): the UPI payee name when there is one, otherwise the first words of letters.
 */
export const ruleTextFor = (narration = '') => {
    const n = String(narration).trim();
    const slash = n.split('/');
    if (slash.length >= 5 && /^(upi|imps|mmt)/i.test(slash[0]) && slash[3].trim().length >= 3) return slash[3].trim();
    const dash = n.match(/^UPI-([^-]{3,})-/i);
    if (dash) return dash[1].trim();
    // The longest unbroken run of letters (digits and reference codes break a run), so the text is a real substring
    // of the narration and "contains" matches next month too.
    const runs = n.match(/[A-Za-z&][A-Za-z&. ]{2,}[A-Za-z&.]/g) || [];
    const best = runs.map((r) => r.trim()).sort((a, b) => b.length - a.length)[0] || n.replace(/\d+/g, ' ').trim();
    return best.slice(0, 40).trim();
};

/** Needs-Review rows grouped by payee / merchant, biggest money first. */
export const groupForReview = (transactions = []) => {
    const groups = new Map();
    for (const t of transactions) {
        if (!isNeedsReview(t)) continue;
        const key = keyOf(t);
        if (!groups.has(key)) {
            groups.set(key, { key, label: '', ids: [], count: 0, total: 0, income: 0, expense: 0, firstDate: t.date, lastDate: t.date, accounts: new Set(), samples: [] });
        }
        const g = groups.get(key);
        const amt = Number(t.amount) || 0;
        g.ids.push(t.id);
        g.count += 1;
        g.total += amt;
        if (t.type === 'income') g.income += amt; else if (t.type === 'expense') g.expense += amt;
        if (t.date < g.firstDate) g.firstDate = t.date;
        if (t.date >= g.lastDate) { g.lastDate = t.date; g.label = String(t.narration || t.merchant || '').trim(); }
        if (t.account) g.accounts.add(t.account);
        const n = String(t.narration || t.merchant || '').trim();
        if (n && g.samples.length < 3 && !g.samples.includes(n)) g.samples.push(n);
    }
    return [...groups.values()]
        .map((g) => {
            const label = g.label || g.samples[0] || g.key;
            return { ...g, accounts: [...g.accounts], total: Math.round(g.total * 100) / 100, label, ruleText: ruleTextFor(label) };
        })
        .sort((a, b) => b.total - a.total || b.count - a.count);
};

/** The transaction with a new category (and the income/expense/neutral type that goes with it). */
export const applyCategory = (tx, category) => {
    const next = { ...tx, category, categorySource: 'manual' };
    const wantsNeutral = NEUTRAL_CATEGORY_RE.test(category);
    if (wantsNeutral && tx.type !== 'neutral') {
        next.neutralSign = tx.type === 'income' ? '+' : '-';
        next.type = 'neutral';
    } else if (!wantsNeutral && tx.type === 'neutral') {
        next.type = tx.neutralSign === '+' ? 'income' : 'expense';
        delete next.neutralSign;
    }
    return next;
};

/** Every merchant you have rows for, with the categories used on it, so it can be reviewed, changed or merged. */
export const learnedMerchants = (transactions = []) => {
    const map = new Map();
    for (const t of transactions) {
        if (!t || !t.category || isNeedsReview(t)) continue;
        const key = keyOf(t);
        if (!key || key === 'unknown') continue;
        if (!map.has(key)) map.set(key, { key, label: '', count: 0, total: 0, byCategory: new Map(), decided: 0, ids: [] });
        const m = map.get(key);
        m.count += 1;
        m.total += Number(t.amount) || 0;
        m.ids.push(t.id);
        if (isUserDecision(t)) m.decided += 1;
        m.byCategory.set(t.category, (m.byCategory.get(t.category) || 0) + 1);
        m.label = m.label || String(t.narration || t.merchant || '').trim();
    }
    return [...map.values()].map((m) => {
        const ranked = [...m.byCategory.entries()].sort((a, b) => b[1] - a[1]);
        return {
            key: m.key, label: m.label || m.key, count: m.count, total: Math.round(m.total * 100) / 100,
            category: ranked[0][0], categories: ranked.map(([category, count]) => ({ category, count })),
            mixed: ranked.length > 1, decided: m.decided, ids: m.ids
        };
    }).sort((a, b) => (Number(b.mixed) - Number(a.mixed)) || b.count - a.count);
};

export const SOURCE_LABELS = {
    manual: 'You chose this',
    rule: 'Your rule',
    history: 'Learned from your earlier choice',
    merchant: 'Known merchant',
    'income-rule': 'Recognised income',
    self: 'Transfer between your accounts',
    'card-payment': 'Card bill payment',
    'card-credit': 'Credit on a card',
    remark: 'Guessed from the payment note',
    unknown: 'No match — needs your review',
    'no-category': 'No matching category',
    import: 'Set by the import'
};
