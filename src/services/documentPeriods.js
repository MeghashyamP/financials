/**
 * documentPeriods.js — the statement period (first → last date) of each imported document.
 * Pure functions, unit-tested in node.
 *
 * Period source, best first: the statement record's own printed period (settings.statements, linked by
 * documentId), then the first/last date of the transactions that came from that document.
 */

import { daysBetween, cycleStartFor } from './statementLedger.js';

const ISO = /^\d{4}-\d{2}-\d{2}/;
const day = (v) => (ISO.test(String(v || '')) ? String(v).slice(0, 10) : '');

/** Map documentId → { start, end } (ISO dates, either may be '' when unknown). */
export const buildDocumentPeriods = (statements = [], transactions = [], documents = []) => {
    const fromTx = new Map();
    for (const t of transactions || []) {
        if (!t || !t.documentId) continue;
        const d = day(t.date);
        if (!d) continue;
        const cur = fromTx.get(t.documentId) || { start: d, end: d };
        if (d < cur.start) cur.start = d;
        if (d > cur.end) cur.end = d;
        fromTx.set(t.documentId, cur);
    }

    const docIdByFilename = new Map();
    for (const d of documents || []) {
        if (d && d.id && d.filename) docIdByFilename.set(d.filename, d.id);
    }

    const out = new Map();
    for (const s of statements || []) {
        if (!s) continue;
        const targetDocId = s.documentId || (s.fileName && docIdByFilename.get(s.fileName));
        if (!targetDocId) continue;

        const tx = fromTx.get(targetDocId) || { start: '', end: '' };
        let sStart = day(s.periodStart);
        const sEnd = day(s.periodEnd) || day(s.statementDate);

        // Beginning of statement period:
        // When statement start is missing, null, or too far in the past (> 62 days),
        // infer from sEnd (e.g. 18 Oct -> 19 Sep, or 30 Sep -> 01 Sep).
        if (sEnd && (!sStart || daysBetween(sStart, sEnd) > 62)) {
            const startDay = sStart ? Number(sStart.slice(8, 10)) : undefined;
            const inferred = cycleStartFor(sEnd, startDay);
            if (inferred) sStart = inferred;
        }

        out.set(targetDocId, {
            start: sStart || tx.start,
            end: sEnd || tx.end
        });
    }
    for (const [id, tx] of fromTx) if (!out.has(id)) out.set(id, { ...tx });
    return out;
};

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2026-09-01" → "01 Sep 26" (short enough for a dropdown). */
export const shortDate = (iso) => {
    const d = day(iso);
    if (!d) return '';
    return `${d.slice(8, 10)} ${MON[+d.slice(5, 7) - 1]} ${d.slice(2, 4)}`;
};

/** "01 Sep 26 – 30 Sep 26", one side only when only one is known, '' when neither. */
export const formatPeriod = (p) => {
    if (!p || (!p.start && !p.end)) return '';
    if (p.start && p.end) return p.start === p.end ? shortDate(p.start) : `${shortDate(p.start)} – ${shortDate(p.end)}`;
    return shortDate(p.start || p.end);
};

/** Oldest statement period first; documents with no period go last, ordered by upload time. */
export const compareByPeriod = (a, b) => {
    const ka = a.period ? (a.period.start || a.period.end) : '';
    const kb = b.period ? (b.period.start || b.period.end) : '';
    if (ka && kb) {
        if (ka !== kb) return ka < kb ? -1 : 1;
        const ea = a.period.end || '', eb = b.period.end || '';
        if (ea !== eb) return ea < eb ? -1 : 1;
    } else if (ka || kb) {
        return ka ? -1 : 1;
    }
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return String(a.filename || '').localeCompare(String(b.filename || ''));
};
