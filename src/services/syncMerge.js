/**
 * syncMerge.js — combine this device's data with a newer cloud copy (written by another device) without losing either side.
 * Used only when BOTH changed since the last sync; otherwise the newer side simply replaces the older one.
 *
 * Rules (nothing is ever dropped, so an edit made on either device survives):
 *  - transactions: union by id; same id → this device's version wins; a different id with the same fingerprint is the same
 *    entry imported on both devices → kept once.
 *  - rules / documents: union by id (this device wins);  tags: union by name.
 *  - settings: cloud as the base, this device's values on top; lists of records (budgets, goals, ...) are merged by id,
 *    lists of plain strings (categories, accounts) are merged without duplicates.
 * Known limit: something deleted on one device comes back if the other device still had it.
 */

const unionById = (cloudList = [], localList = [], idOf = (x) => x && x.id) => {
    const out = new Map();
    for (const item of cloudList || []) { const id = idOf(item); if (id !== undefined && id !== null) out.set(id, item); }
    for (const item of localList || []) { const id = idOf(item); if (id !== undefined && id !== null) out.set(id, item); }
    return [...out.values()];
};

export const mergeTransactions = (cloudList = [], localList = []) => {
    const out = new Map();
    const fingerprints = new Set();
    for (const t of cloudList || []) {
        if (!t || t.id === undefined) continue;
        out.set(t.id, t);
        if (t.fingerprint) fingerprints.add(t.fingerprint);
    }
    for (const t of localList || []) {
        if (!t || t.id === undefined) continue;
        if (out.has(t.id)) { out.set(t.id, t); continue; }
        if (t.fingerprint && fingerprints.has(t.fingerprint)) continue; // same entry, imported on both devices
        out.set(t.id, t);
        if (t.fingerprint) fingerprints.add(t.fingerprint);
    }
    return [...out.values()];
};

const isRecordList = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === 'object' && !Array.isArray(x) && x.id !== undefined);
const isStringList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string');

export const mergeSettings = (cloud = {}, local = {}) => {
    const out = { ...(cloud || {}) };
    for (const [key, value] of Object.entries(local || {})) {
        const other = out[key];
        if (isRecordList(value) && (isRecordList(other) || (Array.isArray(other) && other.length === 0))) {
            out[key] = unionById(other, value);
        } else if (isRecordList(other) && Array.isArray(value) && value.length === 0) {
            out[key] = other;
        } else if (isStringList(value) && isStringList(other)) {
            out[key] = [...new Set([...value, ...other])];
        } else if (value !== undefined) {
            out[key] = value;
        }
    }
    return out;
};

export const mergeSyncStates = (local = {}, cloud = {}) => ({
    ...cloud,
    transactions: mergeTransactions(cloud.transactions, local.transactions),
    tags: unionById(cloud.tags, local.tags, (t) => t && t.name),
    rules: unionById(cloud.rules, local.rules),
    documents: unionById(cloud.documents, local.documents),
    settings: mergeSettings(cloud.settings, local.settings)
});

// ───────────────────────── three-way merge (real sync) ─────────────────────────
// Each device remembers the data as it was at its last sync (the "base"). Comparing base ↔ this device ↔ cloud shows
// exactly what each side changed, including deletions, so changes from both devices are combined correctly:
//   changed on one side only → that change is taken      deleted on one side, untouched on the other → deleted
//   deleted on one side, edited on the other → the edit is kept     edited on both → field by field, this device wins ties

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Same data ignoring empty values (the cloud copy drops null / "" / []) and key order. */
export const canon = (v) => {
    if (Array.isArray(v)) return v.map(canon);
    if (isObj(v)) {
        const o = {};
        for (const k of Object.keys(v).sort()) {
            const c = canon(v[k]);
            if (c === null || c === undefined || c === '' || (Array.isArray(c) && c.length === 0)) continue;
            o[k] = c;
        }
        return o;
    }
    return v;
};
export const sameData = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

const hasId = (x) => isObj(x) && x.id !== undefined && x.id !== null;
const isIdList = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length + b.length > 0 && [...a, ...b].every(hasId);

const mergeStringList = (b = [], l = [], c = []) => {
    const bs = new Set(b);
    const removed = new Set([...b.filter((x) => !l.includes(x)), ...b.filter((x) => !c.includes(x))]);
    const out = [];
    for (const x of [...l, ...c]) if (!removed.has(x) && !out.includes(x)) out.push(x);
    for (const x of l) if (bs.has(x) && !out.includes(x) && !removed.has(x)) out.push(x);
    return out;
};

const mergeValue = (b, l, c) => {
    if (sameData(l, c)) return l;
    if (sameData(b, l)) return c;      // only the cloud changed it
    if (sameData(b, c)) return l;      // only this device changed it
    if (isObj(l) && isObj(c)) return mergeFields(isObj(b) ? b : {}, l, c);
    if (isIdList(l, c)) return mergeCollection(Array.isArray(b) ? b : [], l, c, (x) => x.id);
    if (Array.isArray(l) && Array.isArray(c) && [...l, ...c].every((x) => typeof x === 'string')) {
        return mergeStringList(Array.isArray(b) ? b : [], l, c);
    }
    return l;                          // edited on both: this device wins
};

const mergeFields = (b, l, c) => {
    const out = {};
    for (const k of new Set([...Object.keys(c), ...Object.keys(l)])) {
        const v = mergeValue(b[k], l[k], c[k]);
        if (v !== undefined) out[k] = v;
    }
    return out;
};

export const mergeCollection = (baseList = [], localList = [], cloudList = [], keyOf = (x) => x && x.id) => {
    const index = (list) => { const m = new Map(); for (const x of list || []) { const k = keyOf(x); if (k !== undefined && k !== null) m.set(k, x); } return m; };
    const B = index(baseList), L = index(localList), C = index(cloudList);
    const out = [];
    for (const key of new Set([...C.keys(), ...L.keys()])) {
        const b = B.get(key), l = L.get(key), c = C.get(key);
        if (l && c) out.push(isObj(l) && isObj(c) ? mergeFields(isObj(b) ? b : {}, l, c) : l);
        else if (l) { if (!(b && sameData(b, l))) out.push(l); }      // gone from the cloud: delete only if untouched here
        else if (c) { if (!(b && sameData(b, c))) out.push(c); }      // gone from this device: delete only if untouched there
    }
    return out;
};

const dedupeByFingerprint = (list) => {
    const seen = new Set();
    return list.filter((t) => {
        if (!t.fingerprint) return true;
        if (seen.has(t.fingerprint)) return false;   // the same entry imported on both devices
        seen.add(t.fingerprint);
        return true;
    });
};

/** The part of the state that is synced (no PDF blobs, no device-only secrets). */
export const toSyncShape = (state = {}, stripLocal = (s) => s) => ({
    transactions: state.transactions || [],
    tags: state.tags || [],
    rules: state.rules || [],
    documents: (state.documents || []).map((d) => { const { fileData, ...rest } = d; return rest; }),
    settings: stripLocal(state.settings || {})
});

export const mergeThreeWay = (base, local, cloud) => ({
    transactions: dedupeByFingerprint(mergeCollection(base.transactions, local.transactions, cloud.transactions)),
    tags: mergeCollection(base.tags, local.tags, cloud.tags, (t) => t && t.name),
    rules: mergeCollection(base.rules, local.rules, cloud.rules),
    documents: mergeCollection(base.documents, local.documents, cloud.documents),
    settings: mergeFields(base.settings || {}, local.settings || {}, cloud.settings || {})
});
