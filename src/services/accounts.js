/**
 * accounts.js — account records on top of the plain list of account names.
 *
 * `settings.accounts` stays a list of names (every page and every transaction refers to an account by its
 * name). The richer record lives beside it in `settings.accountProfiles[name]`:
 *   { type, bank, last4, creditLimit, statementDay, dueDay, openingBalance, openingDate }
 * Pure functions, unit-tested in node.
 */

export const ACCOUNT_TYPES = [
    { id: 'credit_card', label: 'Credit card' },
    { id: 'bank', label: 'Bank / savings account' },
    { id: 'cash', label: 'Cash / wallet' },
    { id: 'other', label: 'Other' }
];

export const BANKS = ['HDFC', 'SBI', 'ICICI', 'Axis', 'Kotak', 'Other'];

// "Debit Card" accounts are the savings accounts the debit cards draw on.
export const DEFAULT_ACCOUNTS = [
    { name: 'HDFC Credit Card', type: 'credit_card', bank: 'HDFC' },
    { name: 'HDFC Debit Card', type: 'bank', bank: 'HDFC' },
    { name: 'SBI Credit Card', type: 'credit_card', bank: 'SBI' },
    { name: 'SBI Debit Card', type: 'bank', bank: 'SBI' },
    { name: 'ICICI Credit Card', type: 'credit_card', bank: 'ICICI' },
    { name: 'ICICI Debit Card', type: 'bank', bank: 'ICICI' }
];

// Placeholder lists the app used to ship with; replaced (not merged) by the real defaults.
const PLACEHOLDER_SETS = [
    ['Main Checking', 'Everyday Visa', 'Rewards Card', 'Cash'],
    ['Bank 1', 'Bank 2', 'Credit Card 1']
];

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Seed the six default accounts once. Existing accounts are never removed or renamed; placeholder lists are
 * replaced (but any placeholder that transactions already use is kept). Returns `changed` so the caller only
 * persists when something actually moved.
 */
export const seedDefaultAccounts = (settings = {}, usedAccountNames = []) => {
    const current = Array.isArray(settings.accounts) ? settings.accounts : [];
    const used = new Set((usedAccountNames || []).filter(Boolean));
    const profiles = { ...(settings.accountProfiles || {}) };
    let accounts = current.slice();
    let changed = false;

    const isPlaceholder = current.length === 0 || PLACEHOLDER_SETS.some((p) => sameList(p, current));
    if (isPlaceholder) {
        const keep = current.filter((n) => used.has(n));
        accounts = [...DEFAULT_ACCOUNTS.map((d) => d.name), ...keep.filter((n) => !DEFAULT_ACCOUNTS.some((d) => d.name === n))];
        changed = true;
    } else if (!settings.accountsSeededV1) {
        for (const d of DEFAULT_ACCOUNTS) {
            if (!accounts.some((a) => a.toLowerCase() === d.name.toLowerCase())) {
                accounts.push(d.name);
                changed = true;
            }
        }
    }

    for (const d of DEFAULT_ACCOUNTS) {
        const real = accounts.find((a) => a.toLowerCase() === d.name.toLowerCase());
        if (real && !profiles[real]) {
            profiles[real] = { type: d.type, bank: d.bank };
            changed = true;
        }
    }
    if (!settings.accountsSeededV1) changed = true;
    return { accounts, accountProfiles: profiles, accountsSeededV1: true, changed };
};

/** "HDFC Bank" / "SBI Card" / "State Bank of India" → "HDFC" / "SBI" / "SBI". */
export const bankKeyFromIssuer = (issuer = '') => {
    const s = String(issuer).toUpperCase();
    if (/HDFC/.test(s)) return 'HDFC';
    if (/\bSBI\b|STATE BANK/.test(s)) return 'SBI';
    if (/ICICI/.test(s)) return 'ICICI';
    if (/AXIS/.test(s)) return 'Axis';
    if (/KOTAK/.test(s)) return 'Kotak';
    return '';
};

const suffixMatch = (a, b) => {
    const x = String(a || '').replace(/\D/g, '');
    const y = String(b || '').replace(/\D/g, '');
    if (!x || !y) return false;
    const n = Math.min(x.length, y.length);
    return n >= 2 && x.slice(-n) === y.slice(-n);
};

const wantedType = (kind) => (kind === 'card' ? 'credit_card' : 'bank');

/**
 * Which of the user's accounts does this statement belong to?
 *   by 'last4'  the card / account number matches a saved profile (strong)
 *   by 'bank'   exactly one account of the right type for that bank has no conflicting number (weaker)
 */
export const matchAccountForStatement = (settings = {}, stmt = {}) => {
    const accounts = settings.accounts || [];
    const profiles = settings.accountProfiles || {};
    const type = wantedType(stmt.kind);
    const typed = accounts.filter((a) => profiles[a]?.type === type);

    const byLast4 = typed.filter((a) => suffixMatch(profiles[a].last4, stmt.last4));
    if (byLast4.length === 1) return { name: byLast4[0], by: 'last4' };

    const byBank = typed.filter((a) => profiles[a].bank === stmt.bank && (!profiles[a].last4 || suffixMatch(profiles[a].last4, stmt.last4)));
    if (byBank.length === 1) return { name: byBank[0], by: 'bank' };
    return null;
};

/** True when a saved account profile clearly belongs to a different bank / type / number than the statement. */
export const statementConflict = (profile = {}, stmt = {}) => {
    if (!profile) return false;
    const wrongBank = profile.bank && stmt.bank && profile.bank !== stmt.bank;
    const wrongType = ['credit_card', 'bank'].includes(profile.type) && profile.type !== wantedType(stmt.kind);
    const wrongNumber = profile.last4 && stmt.last4 && !suffixMatch(profile.last4, stmt.last4);
    return !!(wrongBank || wrongType || wrongNumber);
};

/**
 * Pick the account for an imported statement. The user's own choice wins unless the statement clearly
 * belongs elsewhere (its number matches another account, or the chosen account is for a different bank/type).
 */
export const resolveStatementAccount = (settings = {}, stmt = {}, selected = '') => {
    const profiles = settings.accountProfiles || {};
    const match = matchAccountForStatement(settings, stmt);
    const chosen = profiles[selected] || null;

    if (match && match.by === 'last4' && match.name !== selected) {
        return { account: match.name, switched: true, reason: `Matched by number ending ${stmt.last4}` };
    }
    if (chosen) {
        if (statementConflict(chosen, stmt)) {
            if (match) return { account: match.name, switched: match.name !== selected, reason: `This looks like a ${stmt.bank || 'different'} ${stmt.kind === 'card' ? 'card' : 'account'} statement` };
            return { account: selected, switched: false, warning: `This statement looks like it belongs to a different account than "${selected}". Check the account before importing.` };
        }
    }
    if (!chosen && match) return { account: match.name, switched: match.name !== selected, reason: `Matched ${stmt.bank || ''} account` };
    return { account: selected, switched: false };
};

/** Fill in profile fields the statement can tell us (never overwrites what the user typed, except live limits). */
export const learnProfileFromStatement = (profile = {}, stmt = {}) => {
    const next = { ...profile };
    if (!next.type) next.type = wantedType(stmt.kind);
    if (!next.bank && stmt.bank) next.bank = stmt.bank;
    if (!next.last4 && stmt.last4) next.last4 = String(stmt.last4);
    if (stmt.kind === 'card') {
        if (stmt.creditLimit) next.creditLimit = stmt.creditLimit;
        if (stmt.dueDate && /^\d{4}-\d{2}-(\d{2})$/.test(stmt.dueDate)) next.dueDay = Number(stmt.dueDate.slice(8, 10));
        if (stmt.statementDate && /^\d{4}-\d{2}-(\d{2})$/.test(stmt.statementDate)) next.statementDay = Number(stmt.statementDate.slice(8, 10));
    }
    return next;
};
