// Deterministic, per-issuer statement templates + balance audit.
//
// Pure functions only (no DOM, no window, no network) so they can be unit-tested in Node.
// Input is the flat list of positioned text items produced by extractTextFromPDF():
//     [{ str, x, y, page }]   (y grows upwards, as in PDF user space)
//
// Every template returns the same shape:
//     { template, issuer, product, card, statementDate, period, anchors, rows }
// where `anchors` are the numbers the statement itself prints (opening/total/etc.) and
// `rows` are the transactions. auditStatement() then proves the rows add up to the anchors.

import { bankKeyFromIssuer } from './accounts.js';

const r2 = (n) => Math.round(n * 100) / 100;

// ───────────────────────── text helpers ─────────────────────────

// A printed money value: optional currency glyph, Indian/Western grouping, 1-2 decimals, optional CR/DR.
const MONEY_RE = /^[^\d\-]{0,3}-?\d[\d,]*\.\d{1,2}(?:\s*(?:CR|DR))?$/i;
const isMoney = (s) => MONEY_RE.test(String(s).trim());
const toNum = (s) => parseFloat(String(s).replace(/[^\d.]/g, ''));
const hasCR = (s) => /\bCR$/i.test(String(s).trim());

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const iso = (y, m, d) => {
    if (y < 100) y += 2000;
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};
const dmySlash = (s) => {
    const m = String(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
    return m ? iso(+m[3], +m[2], +m[1]) : null;
};
// "04 Oct 26", "18 Oct, 2026", "October 18, 2026"
const textDate = (s) => {
    const str = String(s).trim();
    let m = str.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*,?\s+(\d{2,4})$/);
    if (m) return iso(+m[3], MONTHS[m[2].toLowerCase()], +m[1]);
    m = str.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),?\s+(\d{4})$/);
    if (m) return iso(+m[3], MONTHS[m[1].toLowerCase()], +m[2]);
    return null;
};

// Group items into visual lines (per page, top to bottom, left to right).
export const buildLines = (items) => {
    const byPage = new Map();
    for (const it of items || []) {
        if (!it || it.str === undefined || !String(it.str).trim()) continue;
        const p = it.page ?? 1;
        if (!byPage.has(p)) byPage.set(p, []);
        byPage.get(p).push(it);
    }
    const lines = [];
    [...byPage.keys()].sort((a, b) => a - b).forEach((page) => {
        const arr = byPage.get(page).sort((a, b) => (b.y - a.y) || (a.x - b.x));
        let cur = null;
        for (const it of arr) {
            if (cur && Math.abs(cur.y - it.y) <= 2.5) cur.items.push(it);
            else { cur = { page, y: it.y, items: [it] }; lines.push(cur); }
        }
    });
    lines.forEach((l) => {
        l.items.sort((a, b) => a.x - b.x);
        l.text = l.items.map((i) => String(i.str).trim()).join(' ');
    });
    return lines;
};

const moneyTokens = (line) => line.items.filter((i) => isMoney(i.str));

// First line after `labelRe` (within `within` lines) that carries at least `min` money values.
const moneyRowAfter = (lines, labelRe, min, within = 8) => {
    const idx = lines.findIndex((l) => labelRe.test(l.text));
    if (idx < 0) return null;
    for (let i = idx; i <= Math.min(lines.length - 1, idx + within); i++) {
        const t = moneyTokens(lines[i]);
        if (t.length >= min) return t.map((m) => toNum(m.str));
    }
    return null;
};

// Money value printed below a column label, aligned by x (for layouts where values sit under labels).
const moneyUnderLabel = (lines, labelRe, { dxMin = -15, dxMax = 55, within = 4 } = {}) => {
    for (let i = 0; i < lines.length; i++) {
        const label = lines[i].items.find((it) => labelRe.test(it.str));
        if (!label) continue;
        for (let j = i + 1; j <= Math.min(lines.length - 1, i + within); j++) {
            const hit = lines[j].items.find((it) => isMoney(it.str) && it.x >= label.x + dxMin && it.x <= label.x + dxMax);
            if (hit) return toNum(hit.str);
        }
    }
    return null;
};

// First item under a label (aligned by x) that satisfies `test`; used for dates and limits.
const itemUnderLabel = (lines, labelRe, test, { dxMin = -15, dxMax = 60, within = 6 } = {}) => {
    for (let i = 0; i < lines.length; i++) {
        const label = lines[i].items.find((it) => labelRe.test(String(it.str).trim()));
        if (!label) continue;
        for (let j = i + 1; j <= Math.min(lines.length - 1, i + within); j++) {
            const hit = lines[j].items.find((it) => test(String(it.str).trim()) && it.x >= label.x + dxMin && it.x <= label.x + dxMax);
            if (hit) return hit;
        }
    }
    return null;
};
const dateUnderLabel = (lines, labelRe, opts) => {
    const it = itemUnderLabel(lines, labelRe, (v) => textDate(v) !== null, opts);
    return it ? textDate(it.str) : null;
};
const moneyUnder = (lines, labelRe, opts) => {
    const it = itemUnderLabel(lines, labelRe, isMoney, opts);
    return it ? toNum(it.str) : null;
};

// Pair a credit with an earlier-or-later debit of the same amount + merchant (e.g. an EMI conversion
// reverses the original purchase). Both are flagged so they can be treated as pass-through.
const flagOffsetPairs = (rows) => {
    const norm = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14);
    const open = new Map();
    rows.forEach((row, idx) => {
        if (row.direction !== 'debit') return;
        const k = `${norm(row.description)}|${row.amount}`;
        if (!open.has(k)) open.set(k, []);
        open.get(k).push(idx);
    });
    rows.forEach((row, idx) => {
        if (row.direction !== 'credit') return;
        const k = `${norm(row.description)}|${row.amount}`;
        const cand = open.get(k);
        if (cand && cand.length) {
            const j = cand.shift();
            rows[j].offsetOf = idx;
            row.offsetOf = j;
        }
    });
    return rows;
};

// ───────────────────────── HDFC credit card ─────────────────────────

const parseHdfcCard = (lines) => {
    const text = lines.map((l) => l.text).join('\n');
    const holder = ((text.match(/^(.+?)\s+Credit Card No\./m) || [])[1] || '').trim();
    const nums = moneyRowAfter(lines, /PREVIOUS STATEMENT DUES/i, 5);
    const anchors = nums ? {
        previousBalance: nums[0], payments: nums[1], purchases: nums[2], fees: nums[3], totalDue: nums[4]
    } : null;

    const stmtDate = (text.match(/Statement Date\s+(\d{1,2} [A-Za-z]{3}, \d{4})/) || [])[1];
    const period = text.match(/Billing Period\s+(\d{1,2} [A-Za-z]{3}, \d{4})\s*-\s*(\d{1,2} [A-Za-z]{3}, \d{4})/);
    const cardNo = (text.match(/Credit Card No\.\s+([\dX]+)/) || [])[1] || '';

    const rows = [];
    let inTx = false;
    let prev = null;
    for (const line of lines) {
        if (/DATE\s*&\s*TIME/i.test(line.text) && /TRANSACTION DESCRIPTION/i.test(line.text)) { inTx = true; prev = null; continue; }
        if (/Rewards Program Points Summary|Smart EMI Loan Summary|GST Summary|Eligible for|Important Information/i.test(line.text)) { inTx = false; prev = null; continue; }
        if (!inTx) continue;

        const first = line.items[0];
        const dm = first && String(first.str).match(/^(\d{2}\/\d{2}\/\d{4})\s*\|?\s*(\d{2}:\d{2})?/);
        const money = moneyTokens(line);
        if (dm && money.length) {
            const amountItem = money[money.length - 1];
            const isCredit = line.items.some((i) => String(i.str).trim() === '+');
            const skip = new Set(['C', '`', '₹', '+', 'l', 'Rs', 'Rs.']);
            let desc = line.items
                .filter((i) => i !== first && i !== amountItem)
                .filter((i) => !skip.has(String(i.str).trim()) && !/^\+\s*\d+$/.test(String(i.str).trim()))
                .map((i) => String(i.str).trim()).join(' ');
            // Description continued on the line above ("... (Ref#" / number printed apart)
            if (prev && /\(Ref#\s*$/i.test(prev.text) && prev.page === line.page && (prev.y - line.y) < 16) {
                desc = `${prev.text} ${desc}`.trim();
            }
            const ref = (desc.match(/\(Ref#\s*([A-Za-z0-9]+)\)?/i) || [])[1] || '';
            desc = desc.replace(/\(Ref#[^)]*\)?\s*$/i, '').replace(/\s+/g, ' ').trim();
            rows.push({
                date: dmySlash(dm[1]),
                time: dm[2] || '',
                description: desc,
                amount: r2(toNum(amountItem.str)),
                direction: isCredit ? 'credit' : 'debit',
                refId: ref,
                page: line.page
            });
            prev = null;
        } else {
            prev = line;
        }
    }

    // Due date / minimum due sit on one row under "MINIMUM DUE | DUE DATE"; limits are whole rupees on a row of three.
    const meta = { dueDate: null, minDue: null, creditLimit: null, availableCredit: null };
    const dueIdx = lines.findIndex((l) => /MINIMUM DUE/i.test(l.text) && /DUE DATE/i.test(l.text));
    if (dueIdx >= 0) {
        for (let j = dueIdx + 1; j <= Math.min(lines.length - 1, dueIdx + 5); j++) {
            const dateItem = lines[j].items.find((i) => textDate(String(i.str).trim()) !== null);
            const money = moneyTokens(lines[j]);
            if (dateItem && money.length) { meta.dueDate = textDate(dateItem.str); meta.minDue = toNum(money[0].str); break; }
        }
    }
    const limIdx = lines.findIndex((l) => /TOTAL CREDIT LIMIT/i.test(l.text));
    if (limIdx >= 0) {
        for (let j = limIdx + 1; j <= Math.min(lines.length - 1, limIdx + 8); j++) {
            const ints = lines[j].items.filter((i) => /^\d{1,3}(?:,\d{2,3})+$|^\d{4,}$/.test(String(i.str).trim()));
            if (ints.length >= 3) { meta.creditLimit = toNum(ints[0].str); meta.availableCredit = toNum(ints[1].str); break; }
        }
    }

    return {
        template: 'hdfc-credit-card',
        kind: 'card',
        holder,
        issuer: 'HDFC Bank',
        product: ((text.match(/^(.*Credit Card Statement)/mi) || [])[1] || 'Credit Card').trim(),
        card: { mask: cardNo, last4: cardNo.slice(-4) },
        statementDate: stmtDate ? textDate(stmtDate) : null,
        period: period ? { start: textDate(period[1]), end: textDate(period[2]) } : null,
        anchors,
        meta,
        rows
    };
};

// ───────────────────────── SBI Card ─────────────────────────

const SBI_FLAGS = new Set(['C', 'D', 'EN', 'FP', 'EMD', 'BT', 'M', 'TAD', 'T']);

const parseSbiCard = (lines) => {
    const text = lines.map((l) => l.text).join('\n');
    const holder = ((text.match(/^(.+?)\s+Credit Card Number/m) || [])[1] || '').trim();
    const nums = moneyRowAfter(lines, /ACCOUNT SUMMARY/i, 5, 14);
    const anchors = nums ? {
        previousBalance: nums[0], payments: nums[1], purchases: nums[2], fees: nums[3], totalDue: nums[4]
    } : null;

    const period = text.match(/Statement Period:\s*(\d{1,2} [A-Za-z]{3} \d{2,4})\s*to\s*(\d{1,2} [A-Za-z]{3} \d{2,4})/i);
    const stmtDate = (text.match(/(\d{1,2} [A-Za-z]{3} \d{4})\s*\n?[^\n]*Payment Due Date/i) || [])[1];
    const mask = (text.match(/(X{2,4}(?:\s+X{2,4})*\s*X*\d{2,4})/) || [])[1] || '';

    const rows = [];
    for (const line of lines) {
        const first = line.items[0];
        const dm = first && String(first.str).match(/^(\d{1,2}) ([A-Za-z]{3}) (\d{2,4})$/);
        if (!dm) continue;
        const last = line.items[line.items.length - 1];
        const flag = String(last.str).trim();
        if (!SBI_FLAGS.has(flag)) continue;
        const money = moneyTokens(line);
        if (!money.length) continue;
        const amountItem = money[money.length - 1];
        const desc = line.items
            .filter((i) => i !== first && i !== last && i !== amountItem)
            .map((i) => String(i.str).trim()).join(' ').replace(/\s+/g, ' ').trim();
        rows.push({
            date: iso(+dm[3], MONTHS[dm[2].toLowerCase()], +dm[1]),
            description: desc,
            amount: r2(toNum(amountItem.str)),
            direction: (flag === 'C' || flag === 'T') ? 'credit' : 'debit',
            flag,
            refId: '',
            page: line.page
        });
    }

    const meta = {
        dueDate: dateUnderLabel(lines, /^Payment Due Date$/i, { dxMin: -10, dxMax: 40, within: 3 }),
        minDue: moneyUnder(lines, /Minimum Amount Due$/i, { dxMin: -10, dxMax: 60, within: 6 }),
        creditLimit: moneyUnder(lines, /^Credit Limit$/i, { dxMin: -10, dxMax: 50, within: 3 }),
        availableCredit: moneyUnder(lines, /^Available Credit Limit$/i, { dxMin: -10, dxMax: 50, within: 3 })
    };

    return {
        template: 'sbi-card',
        kind: 'card',
        holder,
        issuer: 'SBI Card',
        product: 'SBI Card',
        card: { mask, last4: mask.replace(/\D/g, '').slice(-2) },
        statementDate: stmtDate ? textDate(stmtDate) : null,
        period: period ? { start: textDate(period[1]), end: textDate(period[2]) } : null,
        anchors,
        meta,
        rows
    };
};

// ───────────────────────── ICICI credit card ─────────────────────────

const parseIciciCard = (lines) => {
    const text = lines.map((l) => l.text).join('\n');
    const holder = ((text.match(/^(?:MR|MRS|MS)\.?\s+([A-Z][A-Z ]+?)(?:\s+Download|$)/m) || [])[1] || '').trim();
    const anchors = {
        totalDue: moneyUnderLabel(lines, /^Total Amount due$/i, { dxMin: -15, dxMax: 40 }),
        previousBalance: moneyUnderLabel(lines, /^Previous Balance$/i),
        purchases: moneyUnderLabel(lines, /^Purchases \/ Charges$/i),
        cash: moneyUnderLabel(lines, /^Cash Advances$/i),
        payments: moneyUnderLabel(lines, /^Payments \/ Credits$/i, { dxMin: -15, dxMax: 70 })
    };
    const complete = Object.values(anchors).every((v) => v !== null);

    const period = text.match(/Statement period\s*:\s*([A-Za-z]+ \d{1,2}, \d{4})\s*to\s*([A-Za-z]+ \d{1,2}, \d{4})/i);
    const stmtDate = (text.match(/STATEMENT DATE[\s\S]{0,400}?([A-Z][a-z]+ \d{1,2}, \d{4})/) || [])[1];

    const rows = [];
    let descX = null;
    let card = '';
    let lastRow = null;
    let lastRowLine = null;
    for (const line of lines) {
        const hdr = line.items.find((i) => /^Transaction Details$/i.test(String(i.str).trim()));
        if (hdr) { descX = hdr.x; lastRow = null; continue; }
        const cardItem = line.items.find((i) => /^\d{4}X{4,}\d{4}$/.test(String(i.str).trim()));
        if (cardItem) { card = String(cardItem.str).trim(); lastRow = null; continue; }
        if (descX === null) continue;

        const [d, serial] = line.items;
        if (d && serial && /^\d{2}\/\d{2}\/\d{4}$/.test(String(d.str).trim()) && /^\d{8,}$/.test(String(serial.str).trim())) {
            const money = moneyTokens(line);
            if (!money.length) { lastRow = null; continue; }
            const amountItem = money[money.length - 1];
            const desc = line.items
                .filter((i) => i !== d && i !== serial && !isMoney(i.str) && !/^-?\d+$/.test(String(i.str).trim()))
                .map((i) => String(i.str).trim()).join(' ');
            const amount = r2(toNum(amountItem.str));
            const row = {
                date: dmySlash(d.str),
                description: desc.replace(/\s+/g, ' ').trim(),
                amount,
                direction: hasCR(amountItem.str) ? 'credit' : 'debit',
                refId: String(serial.str).trim(),
                cardMask: card,
                page: line.page
            };
            if (amount > 0) { rows.push(row); lastRow = row; lastRowLine = line; } else { lastRow = null; }
            continue;
        }

        // Continuation of the previous description ("<1/6>RELIANCE DIGITAL" on the next line)
        if (lastRow && line.page === lastRowLine.page && (lastRowLine.y - line.y) < 16 &&
            line.items.every((i) => Math.abs(i.x - descX) <= 3) && !moneyTokens(line).length) {
            lastRow.description = `${lastRow.description} ${line.text}`.replace(/\s+/g, ' ').trim();
            lastRowLine = line;
        } else {
            lastRow = null;
        }
    }

    const meta = {
        dueDate: dateUnderLabel(lines, /^PAYMENT DUE DATE$/i, { dxMin: -15, dxMax: 60, within: 8 }),
        minDue: moneyUnder(lines, /^Minimum Amount due$/i, { dxMin: -5, dxMax: 45, within: 4 }),
        creditLimit: moneyUnder(lines, /^Credit Limit$/i, { dxMin: -15, dxMax: 55, within: 5 }),
        availableCredit: moneyUnder(lines, /^Available Credit$/i, { dxMin: -15, dxMax: 55, within: 5 })
    };

    return {
        template: 'icici-credit-card',
        kind: 'card',
        holder,
        issuer: 'ICICI Bank',
        product: 'Credit Card',
        card: { mask: card, last4: card.slice(-4) },
        statementDate: stmtDate ? textDate(stmtDate) : null,
        period: period ? { start: textDate(period[1]), end: textDate(period[2]) } : null,
        anchors: complete ? anchors : null,
        meta,
        rows
    };
};

// ───────────────────────── savings / current accounts ─────────────────────────
// Bank statements carry a running balance on every row, which lets the audit prove the chain row by row.

const num0 = (s) => parseFloat(String(s).replace(/[^\d.]/g, '')); // also reads bare "0"
const isNumeric = (s) => /^-?\d[\d,]*(?:\.\d+)?$/.test(String(s).trim());
const rightEdge = (it) => it.x + (it.width || String(it.str).length * 4.6);
const cleanSpaces = (t) => String(t).replace(/\s+/g, ' ').trim();

// HDFC prints narration wrapped at a fixed width, sometimes mid-word: re-join those without a space.
const joinWrapped = (parts, wrapAt = 37) => parts.reduce((acc, part, i) => {
    if (i === 0) return part;
    const prev = parts[i - 1];
    const glue = prev.length >= wrapAt && /[A-Za-z0-9]$/.test(prev) && /^[A-Za-z0-9]/.test(part);
    return acc + (glue ? '' : ' ') + part;
}, '');

const parseHdfcSavings = (lines) => {
    const text = lines.map((l) => l.text).join('\n');
    const rows = [];
    let dateX = null; let narrX = null;
    let cur = null;
    let anchors = null;
    let opening = null;

    const finish = () => {
        if (!cur) return;
        let narr = joinWrapped(cur.parts);
        const ref = (narr.match(/Ref\s*([A-Za-z0-9]+)\s*$/) || [])[1] || '';
        narr = cleanSpaces(narr.replace(/\s*Value\s*Dt\b.*$/i, ''));
        rows.push({ date: cur.date, description: narr, amount: cur.amount, direction: cur.direction, balance: cur.balance, refId: ref, page: cur.page });
        cur = null;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const txnHdr = line.items.find((it) => /^Txn Date$/i.test(String(it.str).trim()));
        if (txnHdr) {
            dateX = txnHdr.x;
            finish();
            continue;
        }
        const ob = line.text.match(/^Opening Balance\s*:\s*([\d,]+\.\d{2})/);
        if (ob && opening === null) opening = toNum(ob[1]);

        if (/^SUMMARY$/i.test(line.text)) {
            finish();
            const vals = moneyRowAfter(lines.slice(i), /Opening Balance/i, 4, 4);
            const cnt = lines.slice(i, i + 8).find((l) => /^\d+\s+\d+$/.test(l.items.filter((it) => isNumeric(it.str)).map((it) => it.str).join(' ')) && l.items.length === 2);
            if (vals) {
                anchors = { opening: vals[0], totalDebits: vals[1], totalCredits: vals[2], closing: vals[3] };
                if (cnt) { anchors.debitCount = parseInt(cnt.items[0].str, 10); anchors.creditCount = parseInt(cnt.items[1].str, 10); }
            }
            break;
        }
        if (dateX === null) continue;

        const first = line.items[0];
        const isRow = first && /^\d{2}\/\d{2}\/\d{4}$/.test(String(first.str).trim()) && Math.abs(first.x - dateX) <= 12;
        if (isRow) {
            finish();
            const money = moneyTokens(line);
            if (money.length < 3) continue;
            const [w, d, bal] = money.slice(-3).map((m) => toNum(m.str));
            const firstMoney = money[money.length - 3];
            const ownItems = line.items.filter((it) => it !== first && it.x > first.x + 20 && it.x < firstMoney.x - 2 && !isMoney(it.str));
            if (narrX === null && ownItems.length) narrX = ownItems[0].x;   // narration column starts under the first row's text
            const own = ownItems.map((it) => String(it.str).trim());
            cur = {
                date: dmySlash(first.str), amount: r2(w > 0 ? w : d), direction: w > 0 ? 'debit' : 'credit',
                balance: bal, parts: own, page: line.page
            };
        } else if (cur && narrX !== null && line.page === cur.page && line.items.length && Math.abs(line.items[0].x - narrX) <= 6 && !moneyTokens(line).length) {
            cur.parts.push(line.text);
        }
    }
    finish();

    return {
        template: 'hdfc-savings', kind: 'bank',
        holder: ((lines.find((l) => l.page === 1 && /^[A-Za-z][A-Za-z.]+(?: [A-Za-z.]+){1,3}$/.test(l.text) && !/Page|Account|Statement/i.test(l.text)) || {}).text || '').trim(), issuer: 'HDFC Bank', product: 'Savings Account',
        card: { mask: (text.match(/Account Number\s*:\s*(\d+)/) || [])[1] || '', last4: ((text.match(/Account Number\s*:\s*(\d+)/) || [])[1] || '').slice(-4) },
        statementDate: null,
        period: (() => { const m = text.match(/(\d{2}\/\d{2}\/\d{4})\s*To\s*(\d{2}\/\d{2}\/\d{4})/); return m ? { start: dmySlash(m[1]), end: dmySlash(m[2]) } : null; })(),
        anchors: anchors || (opening !== null ? { opening } : null),
        rows
    };
};

const parseIciciSavings = (lines) => {
    const text = lines.map((l) => l.text).join('\n');
    let hdr = null; // { partX, depR, wdrR }
    let opening = null; let totals = null;
    const rows = [];
    let pending = [];     // narration lines seen since the last date row
    let prevRow = null;   // last transaction row (receives the "below" half of its narration)

    // A narration block is vertically centred on its date line (equal lines above and below), so the lines
    // between two date rows split in the same proportion: the first `above(prev)` belong to the row above.
    const flush = (nextRow) => {
        const take = prevRow ? Math.min(prevRow.above, pending.length) : 0;
        if (prevRow) prevRow.parts.push(...pending.slice(0, take));
        const rest = pending.slice(take);
        if (nextRow) { nextRow.parts.unshift(...rest); nextRow.above = rest.length; }
        else if (prevRow) prevRow.parts.push(...rest);
        pending = [];
    };

    for (const line of lines) {
        const dep = line.items.find((it) => /^DEPOSITS$/i.test(String(it.str).trim()));
        const wdr = line.items.find((it) => /^WITHDRAWALS$/i.test(String(it.str).trim()));
        const part = line.items.find((it) => /^PARTICULARS$/i.test(String(it.str).trim()));
        if (dep && wdr && part) { hdr = { partX: part.x, depR: rightEdge(dep), wdrR: rightEdge(wdr) }; flush(null); prevRow = null; continue; }
        if (!hdr) continue;
        const first = line.items[0];
        if (first && /^Total:?$/i.test(String(first.str).trim())) {
            flush(null);
            const m = moneyTokens(line).map((t) => toNum(t.str));
            if (m.length >= 3) totals = m;
            break;
        }
        const isRow = first && /^\d{2}-\d{2}-\d{4}$/.test(String(first.str).trim());
        if (isRow) {
            const money = moneyTokens(line);
            if (line.items.some((it) => /^B\/F$/i.test(String(it.str).trim()))) {
                if (money.length) opening = toNum(money[money.length - 1].str);
                flush(null); prevRow = null; pending = [];
                continue;
            }
            if (money.length < 2) continue;
            const bal = money[money.length - 1];
            const amt = money[money.length - 2];
            const direction = Math.abs(rightEdge(amt) - hdr.depR) <= Math.abs(rightEdge(amt) - hdr.wdrR) ? 'credit' : 'debit';
            const own = line.items
                .filter((it) => it !== first && it.x >= hdr.partX - 4 && it.x < amt.x - 2 && !isMoney(it.str))
                .map((it) => String(it.str).trim()).join(' ');
            const row = { date: dmyDash(first.str), amount: r2(toNum(amt.str)), direction, balance: toNum(bal.str), page: line.page, parts: [], above: 0 };
            flush(row);
            if (own) row.parts.push(own);
            rows.push(row);
            prevRow = row;
        } else if (line.items.length && Math.abs(line.items[0].x - hdr.partX) <= 4 && !moneyTokens(line).length) {
            pending.push(line.text);
        }
    }
    flush(null);

    rows.forEach((r) => {
        let t = r.parts.join(' ');
        const ref = (t.match(/\/(\d{12})\b/) || [])[1] || '';
        t = t.replace(/\/[A-Za-z0-9]{20,}/g, '');
        t = t.replace(/(\/\d{12}(?:\/[A-Za-z0-9]+)?)(?:\s+[A-Za-z0-9]{1,7})+$/, '$1');   // wrapped hash tails
        r.description = cleanSpaces(t);
        r.refId = ref;
        delete r.parts; delete r.above;
    });

    const acct = (text.match(/Statement of Transactions in Savings\s*Account\s*([X\d]+)/i) || text.match(/Savings A\/c\s*([X\d]+)/i) || [])[1] || '';
    const per = text.match(/period\s+([A-Za-z]+ \d{1,2}, \d{4})\s*-\s*([A-Za-z]+ \d{1,2}, \d{4})/i);
    return {
        template: 'icici-savings', kind: 'bank',
        holder: ((text.match(/ACCOUNT HOLDERS\s*:\s*(?:MR\.?|MRS\.?|MS\.?)?\s*([A-Z][A-Z .]+)/) || [])[1] || '').trim(), issuer: 'ICICI Bank', product: 'Savings Account',
        card: { mask: acct, last4: acct.slice(-4) },
        statementDate: null,
        period: per ? { start: textDate(per[1]), end: textDate(per[2]) } : null,
        anchors: totals ? { opening, totalCredits: totals[0], totalDebits: totals[1], closing: totals[2] } : (opening !== null ? { opening } : null),
        rows
    };
};

const dmyDash = (s) => {
    const m = String(s).match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    return m ? iso(+m[3], +m[2], +m[1]) : null;
};

const parseSbiSavings = (lines) => {
    const text = lines.map((l) => l.text).join('\n');
    let opening = null; let closing = null;
    const rows = [];
    let pending = [];
    let inTable = false;

    for (const line of lines) {
        if (/^Your Opening Balance/i.test(line.text)) {
            const n = line.items.find((it) => isMoney(it.str)); if (n) opening = toNum(n.str);
            inTable = true; pending = []; continue;
        }
        if (/^Your Closing Balance/i.test(line.text)) {
            const n = line.items.find((it) => isMoney(it.str)); if (n) closing = toNum(n.str);
            inTable = false; continue;
        }
        if (!inTable) continue;
        const first = line.items[0];
        if (!first) continue;
        const isRow = /^\d{2}-\d{2}-\d{2}$/.test(String(first.str).trim());
        if (isRow) {
            const nums = line.items.filter((it) => it.x > 380 && isNumeric(it.str));
            if (nums.length < 3) { pending = []; continue; }
            const [cr, dr, bal] = nums.slice(-3).map((n) => num0(n.str));
            const own = line.items.filter((it) => it !== first && it.x > first.x + 20 && it.x < 300 && String(it.str).trim() !== '-')
                .map((it) => String(it.str).trim()).join(' ');
            const description = cleanSpaces(own || pending.join(' '));
            pending = [];
            rows.push({
                date: dmyDash(first.str), description, amount: r2(cr > 0 ? cr : dr), direction: cr > 0 ? 'credit' : 'debit',
                balance: bal, refId: (description.match(/UPI\/(?:DR|CR)\/(\d{12})/) || [])[1] || '', page: line.page
            });
        } else if (first.x >= 55 && first.x <= 70 && !moneyTokens(line).length) {
            pending.push(line.text);
        }
    }

    const acct = (text.match(/SAVING ACCOUNT\s*\n?\s*(X+\d+)/i) || text.match(/(XXXXXXX\d{4})/) || [])[1] || '';
    const anchors = (opening !== null || closing !== null) ? { opening, closing } : null;
    return {
        template: 'sbi-savings', kind: 'bank',
        holder: ((text.match(/Welcome\s+(?:Mr\.?|Mrs\.?|Ms\.?)?\s*([A-Z][A-Z .]+)/) || [])[1] || '').trim(), issuer: 'State Bank of India', product: 'Savings Account',
        card: { mask: acct, last4: acct.slice(-4) },
        statementDate: null,
        period: null,
        anchors,
        rows
    };
};

// ───────────────────────── registry ─────────────────────────

export const STATEMENT_TEMPLATES = [
    {
        id: 'hdfc-savings',
        detect: (t) => /Savings Account Details/i.test(t) && /Txn Date/i.test(t) && /Withdrawals/i.test(t) && /Closing Balance/i.test(t),
        parse: parseHdfcSavings
    },
    {
        id: 'icici-savings',
        detect: (t) => /Statement of Transactions in Savings/i.test(t) && /WITHDRAWALS/.test(t),
        parse: parseIciciSavings
    },
    {
        id: 'sbi-savings',
        detect: (t) => /TRANSACTION OVERVIEW/i.test(t) && /Your Opening Balance/i.test(t) && /sbi\.co\.in/i.test(t),
        parse: parseSbiSavings
    },
    {
        id: 'hdfc-credit-card',
        detect: (t) => /HDFC Bank Credit Cards/i.test(t) && /Credit Card Statement/i.test(t),
        parse: parseHdfcCard
    },
    {
        id: 'sbi-card',
        detect: (t) => /SBI Card/i.test(t) && /Transaction Details|Credit Card Number/i.test(t),
        parse: parseSbiCard
    },
    {
        id: 'icici-credit-card',
        detect: (t) => /ICICI Bank/i.test(t) && /CREDIT CARD STATEMENT/i.test(t),
        parse: parseIciciCard
    }
];

const firstPagesText = (lines) => lines.filter((l) => l.page <= 4).map((l) => l.text).join('\n');

// Which template (if any) recognises this document.
export const detectStatementTemplate = (items) => {
    const lines = buildLines(items);
    const head = firstPagesText(lines);
    return STATEMENT_TEMPLATES.find((t) => t.detect(head)) || null;
};

// ───────────────────────── audit ─────────────────────────

const CENT = 0.015;       // exact-match tolerance (float noise only)
const ROUNDING = 1.0;     // issuers round the printed "total due" to the rupee

const fmt = (n) => (n === null || n === undefined ? '—' : `₹${Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

// Prove the extracted rows against the numbers the statement itself prints.
//   verified      every check that could run passed, and the row totals were tied to the statement
//   mismatch      at least one check failed → something is missing, duplicated or mis-signed
//   unverifiable  the statement printed nothing we could compare against (never shown as "OK")
export const auditStatement = ({ anchors, rows, kind = 'card' }) => {
    if (kind === 'bank') return auditBankStatement({ anchors, rows });
    const debits = rows.filter((r) => r.direction === 'debit');
    const credits = rows.filter((r) => r.direction === 'credit');
    const sumDebits = r2(debits.reduce((s, r) => s + r.amount, 0));
    const sumCredits = r2(credits.reduce((s, r) => s + r.amount, 0));
    const checks = [];
    const hints = [];

    if (anchors) {
        const a = anchors;
        const expectedTotal = r2((a.previousBalance || 0) + (a.purchases || 0) + (a.fees || 0) + (a.cash || 0) - (a.payments || 0));
        const diff = r2(a.totalDue - expectedTotal);
        checks.push({
            id: 'statement-equation',
            label: 'Statement equation: previous balance + purchases + charges − payments = total due',
            expected: expectedTotal, actual: a.totalDue, diff,
            status: Math.abs(diff) < ROUNDING ? 'pass' : 'fail'
        });

        const expectedDebits = r2((a.purchases || 0) + (a.fees || 0) + (a.cash || 0));
        const dDiff = r2(sumDebits - expectedDebits);
        checks.push({
            id: 'debits-total',
            label: `Extracted debits (${debits.length} rows) match the statement's purchases + charges`,
            expected: expectedDebits, actual: sumDebits, diff: dDiff,
            status: Math.abs(dDiff) <= CENT ? 'pass' : 'fail'
        });

        const cDiff = r2(sumCredits - (a.payments || 0));
        checks.push({
            id: 'credits-total',
            label: `Extracted credits (${credits.length} rows) match the statement's payments & credits`,
            expected: a.payments || 0, actual: sumCredits, diff: cDiff,
            status: Math.abs(cDiff) <= CENT ? 'pass' : 'fail'
        });

        // Diagnose failures so the user knows where to look
        const explain = (diff, side, list) => {
            if (Math.abs(diff) <= CENT) return;
            const want = Math.abs(diff);
            if (diff < 0) hints.push(`${side}: ${fmt(want)} printed on the statement was not extracted — a row is probably missing.`);
            else hints.push(`${side}: extracted ${fmt(want)} more than the statement prints — a row may be duplicated or mis-classified.`);
            const dup = list.find((r) => Math.abs(r.amount - want) <= CENT);
            if (dup) hints.push(`${side}: "${dup.description}" (${fmt(dup.amount)}) equals the difference — check that row first.`);
            const flip = list.find((r) => Math.abs(2 * r.amount - want) <= CENT);
            if (flip) hints.push(`${side}: "${flip.description}" (${fmt(flip.amount)}) may be a ${flip.direction === 'debit' ? 'credit' : 'debit'} read as a ${flip.direction}.`);
        };
        explain(dDiff, 'Debits', debits);
        explain(cDiff, 'Credits', credits);
    }

    const rowChecks = checks.filter((c) => c.id !== 'statement-equation');
    let status;
    if (!rowChecks.length) status = 'unverifiable';
    else if (checks.some((c) => c.status === 'fail')) status = 'mismatch';
    else status = 'verified';

    const failed = checks.filter((c) => c.status === 'fail').length;
    return {
        status,
        reconciled: status === 'verified',
        passRate: checks.length ? Math.round(((checks.length - failed) / checks.length) * 100) : 0,
        mathChecks: checks.length,
        mathPasses: checks.length - failed,
        totalDebits: sumDebits,
        totalCredits: sumCredits,
        openingBalance: anchors ? anchors.previousBalance ?? null : null,
        closingBalance: anchors ? anchors.totalDue ?? null : null,
        checks,
        hints,
        anchors: anchors || null
    };
};


// Bank statement audit: every row prints a running balance, so the chain can be proven row by row.
const auditBankStatement = ({ anchors, rows }) => {
    const debits = rows.filter((r) => r.direction === 'debit');
    const credits = rows.filter((r) => r.direction === 'credit');
    const sumDebits = r2(debits.reduce((s, r) => s + r.amount, 0));
    const sumCredits = r2(credits.reduce((s, r) => s + r.amount, 0));
    const a = anchors || {};
    const checks = []; const hints = [];
    const add = (id, label, expected, actual, tol = CENT) => {
        const diff = r2(actual - expected);
        checks.push({ id, label, expected, actual, diff, status: Math.abs(diff) <= tol ? 'pass' : 'fail' });
        return diff;
    };

    // 1) Opening + credits − debits must land on the printed closing balance.
    if (a.opening != null && a.closing != null) {
        add('balance-roll', `Opening ${fmt(a.opening)} + ${credits.length} credits − ${debits.length} debits = closing balance`,
            a.closing, r2(a.opening + sumCredits - sumDebits));
    }
    // 2) Printed totals and counts, where the bank prints them.
    if (a.totalDebits != null) {
        const d = add('debits-total', `Extracted debits (${debits.length} rows) match the statement's total debits`, a.totalDebits, sumDebits);
        if (Math.abs(d) > CENT) hints.push(d < 0 ? `Debits: ${fmt(Math.abs(d))} printed on the statement was not extracted — a row is probably missing.` : `Debits: extracted ${fmt(d)} more than the statement prints — a row may be duplicated or mis-classified.`);
    }
    if (a.totalCredits != null) {
        const d = add('credits-total', `Extracted credits (${credits.length} rows) match the statement's total credits`, a.totalCredits, sumCredits);
        if (Math.abs(d) > CENT) hints.push(d < 0 ? `Credits: ${fmt(Math.abs(d))} printed on the statement was not extracted — a row is probably missing.` : `Credits: extracted ${fmt(d)} more than the statement prints — a row may be duplicated or mis-classified.`);
    }
    if (a.debitCount != null) add('debit-count', 'Debit row count matches the statement', a.debitCount, debits.length, 0);
    if (a.creditCount != null) add('credit-count', 'Credit row count matches the statement', a.creditCount, credits.length, 0);

    // 3) Row-by-row balance chain.
    const withBal = rows.length > 0 && rows.every((r) => typeof r.balance === 'number');
    if (withBal && a.opening != null) {
        let prev = a.opening; let broken = null;
        for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const expected = r2(prev + (r.direction === 'credit' ? r.amount : -r.amount));
            if (Math.abs(expected - r.balance) > CENT) { broken = { i, r, expected, prev }; break; }
            prev = r.balance;
        }
        checks.push({
            id: 'balance-chain',
            label: `Running balance is consistent across all ${rows.length} rows`,
            expected: broken ? broken.expected : prev, actual: broken ? broken.r.balance : prev,
            diff: broken ? r2(broken.r.balance - broken.expected) : 0,
            status: broken ? 'fail' : 'pass'
        });
        if (broken) {
            const { r, expected, prev: pb } = broken;
            const delta = r2(r.balance - pb);
            hints.push(`Row ${broken.i + 1} (${r.date}, "${r.description.slice(0, 40)}") shows balance ${fmt(r.balance)}, but previous balance ${fmt(pb)} ${r.direction === 'credit' ? '+' : '−'} ${fmt(r.amount)} = ${fmt(expected)}.`);
            if (Math.abs(Math.abs(delta) - r.amount) <= CENT) hints.push(`That row's direction looks flipped: the balance moved the opposite way (${fmt(Math.abs(delta))}).`);
            else hints.push(`${fmt(Math.abs(delta) )} moved the balance here — one or more transactions just before this row are probably missing.`);
        }
    }

    const anyRun = checks.length > 0 && (checks.some((c) => c.id === 'balance-chain' || c.id === 'balance-roll' || c.id.endsWith('-total')));
    const failed = checks.filter((c) => c.status === 'fail').length;
    const status = !anyRun ? 'unverifiable' : failed ? 'mismatch' : 'verified';
    return {
        status, reconciled: status === 'verified',
        passRate: checks.length ? Math.round(((checks.length - failed) / checks.length) * 100) : 0,
        mathChecks: checks.length, mathPasses: checks.length - failed,
        totalDebits: sumDebits, totalCredits: sumCredits,
        openingBalance: a.opening ?? null, closingBalance: a.closing ?? null,
        checks, hints, anchors: anchors || null
    };
};

// ───────────────────────── statement summary ─────────────────────────

// The facts about one statement that are worth keeping after the import (history, chain checks, net worth, due dates).
export const buildStatementSummary = (parsed, audit) => {
    const a = parsed.anchors || {};
    const m = parsed.meta || {};
    const isBank = parsed.kind === 'bank';
    const dates = parsed.rows.map((r) => r.date).filter(Boolean).sort();
    const sum = (dir) => r2(parsed.rows.filter((r) => r.direction === dir).reduce((s, r) => s + r.amount, 0));
    return {
        template: parsed.template,
        kind: parsed.kind,
        issuer: parsed.issuer,
        bank: bankKeyFromIssuer(parsed.issuer),
        last4: (parsed.card && parsed.card.last4) || '',
        statementDate: parsed.statementDate || null,
        periodStart: (parsed.period && parsed.period.start) || null,
        periodEnd: (parsed.period && parsed.period.end) || dates[dates.length - 1] || null,
        firstTxnDate: dates[0] || null,
        opening: (isBank ? a.opening : a.previousBalance) ?? null,
        closing: (isBank ? a.closing : a.totalDue) ?? null,
        totalDue: isBank ? null : (a.totalDue ?? null),
        minDue: m.minDue ?? null,
        dueDate: m.dueDate ?? null,
        creditLimit: m.creditLimit ?? null,
        availableCredit: m.availableCredit ?? null,
        totalDebits: sum('debit'),
        totalCredits: sum('credit'),
        txnCount: parsed.rows.length,
        auditStatus: audit ? audit.status : 'unverifiable'
    };
};

// ───────────────────────── entry point ─────────────────────────

// Returns null when no template recognises the document, otherwise the parsed statement plus its audit.
export const parseStatementWithTemplate = (items) => {
    const lines = buildLines(items);
    const head = firstPagesText(lines);
    const tpl = STATEMENT_TEMPLATES.find((t) => t.detect(head));
    if (!tpl) return null;
    const parsed = tpl.parse(lines);
    if (!parsed.rows.length) return null;
    if (parsed.kind !== 'bank') flagOffsetPairs(parsed.rows);
    const audit = auditStatement({ anchors: parsed.anchors, rows: parsed.rows, kind: parsed.kind });
    return { ...parsed, audit, summary: buildStatementSummary(parsed, audit) };
};
