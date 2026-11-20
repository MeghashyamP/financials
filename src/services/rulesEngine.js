/**
 * rulesEngine.js — Gmail-style rules for transactions.
 *
 * A rule is   WHEN <conditions> THEN <actions>:
 *   conditions  narration / reference (contains any of, contains none of, equals, starts with, regex),
 *               amount (≥ ≤ = between), type, account, category, tag — all of them (or any, per rule.match)
 *   actions     set the category, add tags, remove tags
 *
 * Every change a rule makes is recorded on the transaction (`ruleChanges[ruleId]`) with what it replaced, so a rule can
 * later be taken back precisely — and anything you changed by hand afterwards is left alone.
 * Rules saved by older versions ({ whenText, thenText }) are understood too.
 *
 * Pure functions, unit-tested in node.
 */

import { NEUTRAL_CATEGORY_RE } from './review.js';
import { appendRecurringName } from './importDedupe.js';

// ───────────────────────── shape ─────────────────────────

export const TEXT_OPS = [
    { id: 'containsAny', label: 'contains any of', hint: 'comma-separated: swiggy, zomato' },
    { id: 'notContains', label: 'contains none of', hint: 'comma-separated' },
    { id: 'equals', label: 'is exactly' },
    { id: 'startsWith', label: 'starts with' },
    { id: 'regex', label: 'matches pattern (regex)' }
];
export const AMOUNT_OPS = [
    { id: 'gte', label: 'is at least' },
    { id: 'lte', label: 'is at most' },
    { id: 'eq', label: 'is exactly' },
    { id: 'between', label: 'is between' }
];
export const CONDITION_FIELDS = [
    { id: 'narration', label: 'Narration / merchant', ops: TEXT_OPS },
    { id: 'refId', label: 'Reference number', ops: TEXT_OPS },
    { id: 'amount', label: 'Amount', ops: AMOUNT_OPS },
    { id: 'type', label: 'Type', ops: [{ id: 'is', label: 'is' }] },
    { id: 'account', label: 'Account', ops: [{ id: 'is', label: 'is' }, { id: 'isNot', label: 'is not' }] },
    { id: 'category', label: 'Current category', ops: [{ id: 'is', label: 'is' }, { id: 'isNot', label: 'is not' }] },
    { id: 'tag', label: 'Tags', ops: [{ id: 'has', label: 'include' }, { id: 'hasNot', label: 'do not include' }] }
];
export const ACTION_TYPES = [
    { id: 'setCategory', label: 'Set category' },
    { id: 'addTags', label: 'Add tags' },
    { id: 'removeTags', label: 'Remove tags' },
    { id: 'linkRecurring', label: 'Link to recurring payment' }
];

export const isEnabled = (rule) => !!rule && (rule.enabled === 1 || rule.enabled === true);

/** Always returns the current shape; older { whenText, thenText } rules become one text condition + one action. */
export const normalizeRule = (rule) => {
    if (!rule) return null;
    if (Array.isArray(rule.conditions) && Array.isArray(rule.actions)) {
        return { match: 'all', name: '', ...rule, version: 2 };
    }
    return {
        id: rule.id, version: 2, legacy: true, name: '', match: 'all', enabled: rule.enabled, createdAt: rule.createdAt,
        conditions: rule.whenText ? [{ field: 'narration', op: 'contains', value: String(rule.whenText) }] : [],
        actions: rule.thenText ? [{ type: 'setCategory', value: String(rule.thenText) }] : []
    };
};

export const sortRules = (rules = []) => rules.filter(Boolean).slice()
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')) || String(a.id).localeCompare(String(b.id)));

const toList = (v) => (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim()).filter(Boolean);
const lc = (s) => String(s || '').toLowerCase();
const squash = (s) => lc(s).replace(/[^a-z0-9]/g, '');
const tagsOf = (tx) => (Array.isArray(tx.tags) ? tx.tags : (typeof tx.tags === 'string' ? tx.tags.split(',') : [])).map((t) => String(t).trim()).filter(Boolean);
const hasTag = (tags, name) => tags.some((t) => lc(t) === lc(name));

/** Problem with a rule that should stop it being saved, or null. */
export const validateRule = (rule) => {
    const r = normalizeRule(rule);
    if (!r) return 'Empty rule';
    const conds = r.conditions.filter(isConditionFilled);
    if (!conds.length) return 'Add at least one condition (otherwise the rule would match everything).';
    for (const c of r.conditions) {
        if (c.op === 'regex') { try { new RegExp(c.value, 'i'); } catch (e) { return `"${c.value}" is not a valid pattern.`; } }
    }
    if (!r.actions.filter(isActionFilled).length) return 'Choose what the rule should do (set a category or add / remove tags).';
    return null;
};

export const isConditionFilled = (c) => {
    if (!c || !c.field) return false;
    if (c.field === 'amount') {
        if (c.op === 'between') return c.value !== '' && c.value !== undefined && c.value2 !== '' && c.value2 !== undefined && !Number.isNaN(Number(c.value)) && !Number.isNaN(Number(c.value2));
        return c.value !== '' && c.value !== undefined && !Number.isNaN(Number(c.value));
    }
    return toList(c.op === 'contains' ? [c.value] : c.value).length > 0;
};
export const isActionFilled = (a) => !!a && ((a.type === 'setCategory' || a.type === 'linkRecurring') ? !!a.value : toList(a.value).length > 0);

// ───────────────────────── matching ─────────────────────────

const textMatch = (hay, op, value) => {
    const h = lc(hay);
    const hs = squash(hay);
    const found = (term) => {
        const t = lc(term);
        if (h.includes(t)) return true;
        const ts = squash(term);
        return ts.length >= 4 && hs.includes(ts);   // "amazon pay" also finds "AMAZONPAY"
    };
    switch (op) {
        case 'contains': return value !== '' && found(value);
        case 'containsAny': return toList(value).some(found);
        case 'notContains': return !toList(value).some(found);
        case 'equals': return h.trim() === lc(value).trim();
        case 'startsWith': return h.trim().startsWith(lc(value).trim());
        case 'regex': try { return new RegExp(value, 'i').test(String(hay || '')); } catch (e) { return false; }
        default: return false;
    }
};

const conditionHolds = (c, tx) => {
    switch (c.field) {
        case 'narration': return textMatch(tx.narration || tx.merchant || '', c.op, c.value);
        case 'refId': return textMatch(tx.refId || '', c.op, c.value);
        case 'amount': {
            const amt = Math.abs(Number(tx.amount) || 0);
            const a = Number(c.value);
            if (c.op === 'gte') return amt >= a;
            if (c.op === 'lte') return amt <= a;
            if (c.op === 'eq') return Math.abs(amt - a) < 0.005;
            if (c.op === 'between') { const b = Number(c.value2); return amt >= Math.min(a, b) && amt <= Math.max(a, b); }
            return false;
        }
        case 'type': return tx.type === c.value;
        case 'account': { const inList = toList(c.value).some((v) => lc(v) === lc(tx.account)); return c.op === 'isNot' ? !inList : inList; }
        case 'category': {
            const cur = tx.category || '';
            const inList = toList(c.value).some((v) => cur === v || cur.startsWith(`${v} - `));
            return c.op === 'isNot' ? !inList : inList;
        }
        case 'tag': { const tags = tagsOf(tx); const any = toList(c.value).some((v) => hasTag(tags, v)); return c.op === 'hasNot' ? !any : any; }
        default: return false;
    }
};

export const matchesRule = (rule, tx) => {
    const r = normalizeRule(rule);
    if (!r) return false;
    const conds = r.conditions.filter(isConditionFilled);
    if (!conds.length) return false;
    return r.match === 'any' ? conds.some((c) => conditionHolds(c, tx)) : conds.every((c) => conditionHolds(c, tx));
};

// ───────────────────────── applying ─────────────────────────

const flipForCategory = (cur, category) => {
    const wantsNeutral = NEUTRAL_CATEGORY_RE.test(category);
    if (wantsNeutral && cur.type !== 'neutral') { cur.neutralSign = cur.type === 'income' ? '+' : '-'; cur.type = 'neutral'; }
    else if (!wantsNeutral && cur.type === 'neutral') { cur.type = cur.neutralSign === '+' ? 'income' : 'expense'; delete cur.neutralSign; }
};

const mergeDelta = (prev, next) => {
    if (!prev) return next;
    const out = { ...prev };
    if (next.category) out.category = prev.category ? { ...prev.category, to: next.category.to } : next.category;
    if (next.link) out.link = prev.link ? { ...prev.link, to: next.link.to } : next.link;
    for (const k of ['tagsAdded', 'tagsRemoved']) if (next[k]) out[k] = [...new Set([...(prev[k] || []), ...next[k]])];
    return out;
};

/**
 * Run rules (enabled ones, oldest first) over one transaction.
 * @returns { tx, changed, changes: { [ruleId]: delta }, skippedManual }
 *   `changed` — a rule changed something now. A category you set by hand is not overwritten unless overwriteManual.
 */
export const applyRules = (tx, rules = [], { overwriteManual = false, pool = null } = {}) => {
    const cur = { ...tx, tags: tagsOf(tx) };
    const changes = {};
    let skippedManual = 0;
    for (const raw of sortRules(rules)) {
        if (!isEnabled(raw)) continue;
        const rule = normalizeRule(raw);
        if (!matchesRule(rule, cur)) continue;
        const delta = {};
        for (const action of rule.actions) {
            if (!isActionFilled(action)) continue;
            if (action.type === 'setCategory') {
                const target = action.value;
                if (pool && !pool.includes(target)) continue;           // category no longer exists
                if (cur.category === target) continue;
                if (cur.categorySource === 'manual' && !overwriteManual) { skippedManual += 1; continue; }
                delta.category = delta.category
                    ? { ...delta.category, to: target }
                    : { from: cur.category, to: target, typeFrom: cur.type, signFrom: cur.neutralSign, sourceFrom: cur.categorySource };
                cur.category = target;
                cur.categorySource = 'rule';
                cur.categoryConfidence = 'high';
                flipForCategory(cur, target);
            } else if (action.type === 'linkRecurring') {
                if (cur.linkedRecurringId === action.value) continue;
                delta.link = { from: cur.linkedRecurringId || null, to: action.value, narrationFrom: cur.narration, merchantFrom: cur.merchant, label: action.label || '' };
                cur.linkedRecurringId = action.value;
                if (action.label) {
                    cur.narration = appendRecurringName(cur.narration, action.label);
                    cur.merchant = appendRecurringName(cur.merchant || cur.narration, action.label);
                }
            } else if (action.type === 'addTags') {
                const added = toList(action.value).filter((v) => !hasTag(cur.tags, v));
                if (added.length) { cur.tags = [...cur.tags, ...added]; delta.tagsAdded = [...(delta.tagsAdded || []), ...added]; }
            } else if (action.type === 'removeTags') {
                const wanted = toList(action.value);
                const removed = cur.tags.filter((t) => wanted.some((w) => lc(w) === lc(t)));
                if (removed.length) { cur.tags = cur.tags.filter((t) => !removed.includes(t)); delta.tagsRemoved = [...(delta.tagsRemoved || []), ...removed]; }
            }
        }
        if (delta.category || delta.tagsAdded || delta.tagsRemoved || delta.link) {
            changes[rule.id] = delta;
            cur.ruleChanges = { ...(cur.ruleChanges || {}), [rule.id]: mergeDelta((cur.ruleChanges || {})[rule.id], delta) };
        }
    }
    if (cur.ruleChanges && !Object.keys(cur.ruleChanges).length) delete cur.ruleChanges;
    return { tx: cur, changed: Object.keys(changes).length > 0, changes, skippedManual };
};

/**
 * Undo one rule on one transaction. A category is put back only if it is still what the rule set (a later change by
 * you or another rule is respected); tags the rule added are removed, tags it removed come back.
 * @returns { tx, changed, typeChanged }
 */
export const revertRuleOnTx = (tx, ruleId) => {
    const rec = tx && tx.ruleChanges && tx.ruleChanges[ruleId];
    if (!rec) return { tx, changed: false, typeChanged: false };
    const cur = { ...tx, tags: tagsOf(tx) };
    let changed = false;
    let typeChanged = false;
    if (rec.category && cur.category === rec.category.to) {
        cur.category = rec.category.from;
        if (rec.category.sourceFrom === undefined) delete cur.categorySource; else cur.categorySource = rec.category.sourceFrom;
        delete cur.categoryConfidence;
        if (rec.category.typeFrom && cur.type !== rec.category.typeFrom) {
            cur.type = rec.category.typeFrom;
            if (cur.type === 'neutral') cur.neutralSign = rec.category.signFrom || '-'; else delete cur.neutralSign;
            typeChanged = true;
        }
        changed = true;
    }
    if (rec.link && cur.linkedRecurringId === rec.link.to) {
        if (rec.link.from) cur.linkedRecurringId = rec.link.from; else delete cur.linkedRecurringId;
        if (rec.link.label && cur.narration === appendRecurringName(rec.link.narrationFrom, rec.link.label)) {
            cur.narration = rec.link.narrationFrom;
            cur.merchant = rec.link.merchantFrom || rec.link.narrationFrom;
        }
        changed = true;
    }
    if (rec.tagsAdded && rec.tagsAdded.length) {
        const before = cur.tags.length;
        cur.tags = cur.tags.filter((t) => !rec.tagsAdded.some((a) => lc(a) === lc(t)));
        if (cur.tags.length !== before) changed = true;
    }
    if (rec.tagsRemoved && rec.tagsRemoved.length) {
        const back = rec.tagsRemoved.filter((r) => !hasTag(cur.tags, r));
        if (back.length) { cur.tags = [...cur.tags, ...back]; changed = true; }
    }
    const rest = { ...cur.ruleChanges };
    delete rest[ruleId];
    if (Object.keys(rest).length) cur.ruleChanges = rest; else delete cur.ruleChanges;
    return { tx: cur, changed, typeChanged };
};

// ───────────────────────── preview / impact ─────────────────────────

/** What would this rule do to the transactions you already have? (nothing is changed) */
export const previewRule = (rule, transactions = [], { overwriteManual = false, pool = null } = {}) => {
    const r = normalizeRule({ ...rule, enabled: 1 });
    const out = { matching: 0, willChange: 0, alreadyDone: 0, skippedManual: 0, samples: [], changeSamples: [] };
    for (const tx of transactions) {
        if (!tx || !matchesRule(r, tx)) continue;
        out.matching += 1;
        if (out.samples.length < 6) out.samples.push(tx);
        const res = applyRules(tx, [r], { overwriteManual, pool });
        if (res.skippedManual) out.skippedManual += 1;
        if (res.changed) { out.willChange += 1; if (out.changeSamples.length < 6) out.changeSamples.push({ before: tx, after: res.tx }); }
        else if (!res.skippedManual) out.alreadyDone += 1;
    }
    return out;
};

/** Transactions this rule has changed (what deleting-with-revert would touch). */
export const impactedBy = (transactions = [], ruleId) => transactions.filter((t) => t && t.ruleChanges && t.ruleChanges[ruleId]);

// ───────────────────────── wording ─────────────────────────

const opLabel = (field, op) => {
    if (op === 'contains') return 'contains';
    const f = CONDITION_FIELDS.find((x) => x.id === field);
    const o = f && f.ops.find((x) => x.id === op);
    return o ? o.label : op;
};

export const describeCondition = (c, { money = (v) => v } = {}) => {
    const name = { narration: 'narration', refId: 'reference number', amount: 'amount', type: 'type', account: 'account', category: 'category', tag: 'tags' }[c.field] || c.field;
    if (c.field === 'amount') return c.op === 'between' ? `amount is between ${money(c.value)} and ${money(c.value2)}` : `amount ${opLabel('amount', c.op)} ${money(c.value)}`;
    const vals = toList(c.op === 'contains' ? [c.value] : c.value);
    return `${name} ${opLabel(c.field, c.op)} ${vals.map((v) => `“${v}”`).join(', ')}`;
};

export const describeAction = (a) => {
    const vals = toList(a.value);
    if (a.type === 'setCategory') return `set category to ${a.value}`;
    if (a.type === 'addTags') return `add tag${vals.length === 1 ? '' : 's'} ${vals.join(', ')}`;
    if (a.type === 'removeTags') return `remove tag${vals.length === 1 ? '' : 's'} ${vals.join(', ')}`;
    if (a.type === 'linkRecurring') return `link to recurring payment “${a.label || a.value}”`;
    return '';
};

export const describeRule = (rule, opts) => {
    const r = normalizeRule(rule);
    const joiner = r.match === 'any' ? ' or ' : ' and ';
    return {
        when: r.conditions.filter(isConditionFilled).map((c) => describeCondition(c, opts)).join(joiner) || 'no conditions',
        then: r.actions.filter(isActionFilled).map(describeAction).join('; ') || 'no actions'
    };
};

export const emptyRule = () => ({
    id: undefined, version: 2, name: '', match: 'all', enabled: 1,
    conditions: [{ field: 'narration', op: 'containsAny', value: '' }],
    actions: [{ type: 'setCategory', value: '' }]
});
