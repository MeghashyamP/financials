/**
 * crossMatch.js — tie transactions from different statements to each other.
 *
 *   cardPayments   bank debit "paid the card" ↔ credit-card statement "payment received"
 *   selfTransfers  money you moved from one of your accounts to another
 *   refunds        a refund credit ↔ the purchase it reverses
 *
 * Nothing is stored: matches are recomputed from the transactions, so they stay correct when rows are edited,
 * re-imported or deleted. Pure functions, unit-tested in node.
 */

import { merchantKey } from '../categorizer.js';

const toUtc = (iso) => {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
};
const dayDiff = (a, b) => Math.round((toUtc(b) - toUtc(a)) / 86400000);
const sameAmount = (a, b, tol = 0.015) => Math.abs(Number(a) - Number(b)) <= tol;

const CARD_BILL_RE = /CRED\s*CLUB|CC\s*PAYMENT|CREDIT\s*CARD|CARD\s*PAYMENT|BPPY|BILLDESK|AUTOPAY/i;
const isNeutral = (t) => t && t.type === 'neutral';

// Greedy one-to-one pairing by closest date.
const pairUp = (lefts, rights, { minDays, maxDays, tolerance = 0.015, amountOf = (t) => t.amount, ok = () => true }) => {
    const pairs = [];
    const used = new Set();
    const sortedLefts = lefts.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (const l of sortedLefts) {
        let best = null;
        let bestGap = Infinity;
        for (const r of rights) {
            if (used.has(r.id)) continue;
            if (!sameAmount(amountOf(l), amountOf(r), tolerance)) continue;
            if (!ok(l, r)) continue;
            const gap = dayDiff(l.date, r.date);
            if (gap < minDays || gap > maxDays) continue;
            if (Math.abs(gap) < bestGap) { best = r; bestGap = Math.abs(gap); }
        }
        if (best) { used.add(best.id); pairs.push({ left: l, right: best, daysApart: dayDiff(l.date, best.date) }); }
    }
    const leftIds = new Set(pairs.map((p) => p.left.id));
    return {
        pairs,
        unmatchedLeft: lefts.filter((l) => !leftIds.has(l.id)),
        unmatchedRight: rights.filter((r) => !used.has(r.id))
    };
};

export const matchCardPayments = (transactions = [], profiles = {}) => {
    const typeOf = (t) => profiles[t.account]?.type;
    const bankOut = transactions.filter((t) => isNeutral(t) && t.neutralSign === '-' && typeOf(t) === 'bank'
        && (/^Credit - Card/.test(t.category || '') || CARD_BILL_RE.test(`${t.narration || ''} ${t.merchant || ''}`)));
    const cardIn = transactions.filter((t) => isNeutral(t) && t.neutralSign === '+' && typeOf(t) === 'credit_card');
    // The card credit posts the same day or a few days after the bank debit. Paying "the total due" through CRED / UPI
    // is often rounded to the rupee (₹1,64,388 for ₹1,64,390.80 owed), so allow a few rupees of difference.
    const r = pairUp(bankOut, cardIn, { minDays: -1, maxDays: 6, tolerance: 5 });
    return {
        pairs: r.pairs.map((p) => ({ bank: p.left, card: p.right, daysApart: p.daysApart })),
        unmatchedBank: r.unmatchedLeft,
        unmatchedCard: r.unmatchedRight
    };
};

export const matchSelfTransfers = (transactions = [], profiles = {}) => {
    const selfRow = (t) => isNeutral(t) && /^Transfer - Self/.test(t.category || '');
    const out = transactions.filter((t) => selfRow(t) && t.neutralSign === '-');
    const inn = transactions.filter((t) => selfRow(t) && t.neutralSign === '+');
    const r = pairUp(out, inn, { minDays: -1, maxDays: 3, ok: (a, b) => a.account !== b.account });
    return {
        pairs: r.pairs.map((p) => ({ from: p.left, to: p.right, daysApart: p.daysApart })),
        unmatchedOut: r.unmatchedLeft,
        unmatchedIn: r.unmatchedRight
    };
};

export const matchRefunds = (transactions = [], { maxDays = 120 } = {}) => {
    const refunds = transactions.filter((t) => t.type === 'income' && /Refund/i.test(t.category || '') && merchantKey(t.narration || t.merchant || ''));
    const purchases = transactions.filter((t) => t.type === 'expense');
    const used = new Set();
    const pairs = [];
    const unmatched = [];
    for (const rf of refunds.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
        const key = merchantKey(rf.narration || rf.merchant || '');
        let best = null;
        let bestGap = Infinity;
        for (const p of purchases) {
            if (used.has(p.id)) continue;
            if (merchantKey(p.narration || p.merchant || '') !== key) continue;
            if (Number(p.amount) + 0.015 < Number(rf.amount)) continue;
            const gap = dayDiff(p.date, rf.date);
            if (gap < 0 || gap > maxDays) continue;
            // prefer the same account, then the exact amount, then the closest date
            const score = gap + (p.account === rf.account ? 0 : 1000) + (sameAmount(p.amount, rf.amount) ? 0 : 500);
            if (score < bestGap) { best = p; bestGap = score; }
        }
        if (best) { used.add(best.id); pairs.push({ purchase: best, refund: rf, partial: !sameAmount(best.amount, rf.amount) }); }
        else unmatched.push(rf);
    }
    return { pairs, unmatched };
};

/** Everything at once, plus a lookup so a row can show "matched with …". */
export const matchAcrossStatements = (transactions = [], profiles = {}) => {
    const cardPayments = matchCardPayments(transactions, profiles);
    const selfTransfers = matchSelfTransfers(transactions, profiles);
    const refunds = matchRefunds(transactions);
    const byTx = {};
    cardPayments.pairs.forEach((p) => { byTx[p.bank.id] = { kind: 'card-payment', otherId: p.card.id }; byTx[p.card.id] = { kind: 'card-payment', otherId: p.bank.id }; });
    selfTransfers.pairs.forEach((p) => { byTx[p.from.id] = { kind: 'self-transfer', otherId: p.to.id }; byTx[p.to.id] = { kind: 'self-transfer', otherId: p.from.id }; });
    refunds.pairs.forEach((p) => { byTx[p.purchase.id] = { kind: 'refund', otherId: p.refund.id }; byTx[p.refund.id] = { kind: 'refund', otherId: p.purchase.id }; });
    return { cardPayments, selfTransfers, refunds, byTx };
};
