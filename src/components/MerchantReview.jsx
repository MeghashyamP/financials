import React from 'react';
import { formatCurrencyVal, formatDate, DEFAULT_CATEGORIES } from '../utils.jsx';
import { CategoryPickerModal } from './modals/TransactionModals.jsx';
import { groupForReview, learnedMerchants } from '../services/review.js';

const NEEDS_REVIEW_CATEGORY_RE = /Needs Review|Uncategorized/i;

/**
 * Needs Review inbox: every row the app would not guess, grouped by payee. Pick a category once and it is
 * applied to all of that payee's rows — and remembered for every future import.
 */
export const ReviewInbox = ({ transactions = [], settings = {}, onBulkCategorize, onSaveRule, showToast }) => {
    const groups = React.useMemo(() => groupForReview(transactions), [transactions]);
    const rawCats = (settings.categories && settings.categories.length > 0) ? settings.categories : DEFAULT_CATEGORIES;
    const categories = rawCats.filter((c) => !NEEDS_REVIEW_CATEGORY_RE.test(c));
    const money = (v) => formatCurrencyVal(v, settings.currency || 'INR');
    const shortDate = (d) => (d ? formatDate(d, settings.dateFormat) : '');
    const [picked, setPicked] = React.useState({});
    const [makeRule, setMakeRule] = React.useState({});
    const [busy, setBusy] = React.useState(null);
    const [limit, setLimit] = React.useState(25);
    const [pickerKey, setPickerKey] = React.useState(null);   // payee whose category is being chosen in the popup

    const totalRows = groups.reduce((s, g) => s + g.count, 0);

    const apply = async (g) => {
        const category = picked[g.key];
        if (!category) return;
        setBusy(g.key);
        try {
            const res = await onBulkCategorize(g.ids, category);
            if (makeRule[g.key] && onSaveRule) {
                await onSaveRule({
                    version: 2, match: 'all', enabled: 1, name: '',
                    conditions: [{ field: 'narration', op: 'contains', value: g.ruleText || g.label.slice(0, 40) }],
                    actions: [{ type: 'setCategory', value: category }]
                }, { applyExisting: false, quiet: true });
            }
            showToast(`${res.updated} transaction${res.updated === 1 ? '' : 's'} for "${g.label.slice(0, 30)}" set to ${category}${res.failed ? ` (${res.failed} could not be saved)` : ''}`);
        } finally {
            setBusy(null);
        }
    };

    if (groups.length === 0) {
        return (
            <div className="empty-state">
                <div className="empty-state-text">
                    <h3>Nothing to review 🎉</h3>
                    <p>Every transaction has a category. New imports that the app can't place confidently will show up here.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="section-card">
            <div className="section-card-title" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span>Needs Review</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    {groups.length} payee{groups.length === 1 ? '' : 's'} · {totalRows} transaction{totalRows === 1 ? '' : 's'}
                </span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 0 14px' }}>
                The app never guesses a category it isn't sure about. Choose one per payee — it is applied to all their rows and
                remembered, so the next statement categorises them by itself. Biggest amounts first.
            </p>

            {groups.slice(0, limit).map((g) => (
                <div key={g.key} style={{ border: '1px solid var(--border-color)', borderRadius: '10px', padding: '10px 14px', marginBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: '0.9rem', flex: '1 1 220px', wordBreak: 'break-word' }}>{g.label}</strong>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {g.count} txn{g.count === 1 ? '' : 's'} · {money(g.total)} · {shortDate(g.firstDate)}{g.firstDate !== g.lastDate ? ` – ${shortDate(g.lastDate)}` : ''}
                        </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '2px 0 8px' }}>
                        {g.accounts.join(', ')}{g.income > 0 && g.expense === 0 ? ' · money in' : ''}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            className="form-control"
                            style={{ flex: '1 1 220px', minWidth: 0, textAlign: 'left', cursor: 'pointer', color: picked[g.key] ? 'inherit' : 'var(--text-muted)' }}
                            onClick={() => setPickerKey(g.key)}
                        >
                            {picked[g.key] || 'Choose a category…'}
                        </button>
                        <label style={{ display: 'flex', gap: '5px', alignItems: 'center', fontSize: '0.76rem', color: 'var(--text-muted)', cursor: 'pointer' }} title="Also add a rule on the Rules page so it is visible and editable there">
                            <input type="checkbox" checked={!!makeRule[g.key]} onChange={(e) => setMakeRule((p) => ({ ...p, [g.key]: e.target.checked }))} />
                            Add a rule
                        </label>
                        <button className="btn btn-primary btn-sm" disabled={!picked[g.key] || busy === g.key} onClick={() => apply(g)}>
                            {busy === g.key ? 'Saving…' : g.count > 1 ? `Apply to all ${g.count}` : 'Apply'}
                        </button>
                    </div>
                    {g.samples.length > 1 && (
                        <details style={{ marginTop: '6px' }}>
                            <summary style={{ cursor: 'pointer', fontSize: '0.74rem', color: 'var(--text-muted)' }}>Narrations</summary>
                            {g.samples.map((s, i) => <div key={i} style={{ fontSize: '0.74rem', color: 'var(--text-muted)', wordBreak: 'break-all' }}>{s}</div>)}
                        </details>
                    )}
                </div>
            ))}
            {groups.length > limit && (
                <button className="btn btn-secondary btn-sm" onClick={() => setLimit((l) => l + 25)}>Show {Math.min(25, groups.length - limit)} more payees</button>
            )}
            {pickerKey && (
                <CategoryPickerModal
                    categories={categories}
                    selected={picked[pickerKey]}
                    onSelect={(cat) => { setPicked((p) => ({ ...p, [pickerKey]: cat })); setPickerKey(null); }}
                    onClose={() => setPickerKey(null)}
                />
            )}
        </div>
    );
};

/**
 * Learned merchants (Rules page): every merchant with categorised rows. Change a merchant's category for all of its
 * rows at once; merchants filed under several categories are listed first so they can be merged into one.
 */
export const LearnedMerchants = ({ transactions = [], settings = {}, onBulkCategorize, showToast }) => {
    const merchants = React.useMemo(() => learnedMerchants(transactions), [transactions]);
    const rawCats = (settings.categories && settings.categories.length > 0) ? settings.categories : DEFAULT_CATEGORIES;
    const categories = rawCats.filter((c) => !NEEDS_REVIEW_CATEGORY_RE.test(c));
    const [query, setQuery] = React.useState('');
    const [onlyMixed, setOnlyMixed] = React.useState(false);
    const [draft, setDraft] = React.useState({});
    const [busy, setBusy] = React.useState(null);
    const [limit, setLimit] = React.useState(20);
    const [pickerKey, setPickerKey] = React.useState(null);   // merchant whose category is being chosen in the popup
    const money = (v) => formatCurrencyVal(v, settings.currency || 'INR');

    const q = query.trim().toLowerCase();
    const shown = merchants.filter((m) => (!onlyMixed || m.mixed) && (!q || m.label.toLowerCase().includes(q) || m.category.toLowerCase().includes(q)));
    const mixedCount = merchants.filter((m) => m.mixed).length;

    const apply = async (m) => {
        const category = draft[m.key];
        if (!category) return;
        setBusy(m.key);
        try {
            const res = await onBulkCategorize(m.ids, category);
            showToast(`"${m.label.slice(0, 30)}": ${res.updated} transaction${res.updated === 1 ? '' : 's'} set to ${category}`);
            setDraft((d) => { const n = { ...d }; delete n[m.key]; return n; });
        } finally { setBusy(null); }
    };

    if (merchants.length === 0) return null;

    return (
        <div className="section-card" style={{ marginTop: '24px' }}>
            <div className="section-card-title" style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                <span>Learned merchants</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{merchants.length} merchants{mixedCount ? ` · ${mixedCount} filed under more than one category` : ''}</span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', margin: '0 0 12px' }}>
                New imports reuse what you've already chosen for a merchant. Fix a merchant here and every one of its transactions follows.
            </p>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' }}>
                <input className="form-control" placeholder="Search merchant or category…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: '1 1 220px', height: '34px' }} />
                <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={onlyMixed} onChange={(e) => setOnlyMixed(e.target.checked)} /> Only mixed
                </label>
            </div>
            <div className="table-responsive">
                <table className="table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                        <tr><th>Merchant</th><th>Txns</th><th>Total</th><th>Category now</th><th>Change all to</th><th></th></tr>
                    </thead>
                    <tbody>
                        {shown.slice(0, limit).map((m) => (
                            <tr key={m.key}>
                                <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.label}>{m.label}</td>
                                <td>{m.count}</td>
                                <td style={{ whiteSpace: 'nowrap' }}>{money(m.total)}</td>
                                <td style={{ minWidth: '220px' }}>
                                    {m.mixed ? (
                                        <div>
                                            <div style={{ color: '#B45309', fontWeight: 700, marginBottom: '4px' }}>Mixed — {m.categories.length} categories</div>
                                            {m.categories.map((c) => (
                                                <button
                                                    key={c.category}
                                                    type="button"
                                                    onClick={() => setDraft((d) => ({ ...d, [m.key]: c.category }))}
                                                    title="Use this one for all of them"
                                                    style={{
                                                        display: 'flex', justifyContent: 'space-between', gap: '10px', width: '100%', textAlign: 'left',
                                                        background: draft[m.key] === c.category ? 'var(--primary-light, #EEF2FF)' : 'transparent',
                                                        border: '1px solid var(--border-color)', borderRadius: '8px', padding: '2px 8px', marginBottom: '3px', cursor: 'pointer', fontSize: '0.76rem'
                                                    }}
                                                >
                                                    <span>{c.category}</span><strong>×{c.count}</strong>
                                                </button>
                                            ))}
                                            <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Click one to merge them all into it, or pick another →</div>
                                        </div>
                                    ) : m.category}
                                </td>
                                <td>
                                    <button
                                        type="button"
                                        className="form-control"
                                        style={{ height: '30px', fontSize: '0.78rem', minWidth: '180px', textAlign: 'left', cursor: 'pointer', color: draft[m.key] ? 'inherit' : 'var(--text-muted)' }}
                                        onClick={() => setPickerKey(m.key)}
                                    >
                                        {draft[m.key] || (m.mixed ? 'Pick one to merge…' : 'Change category…')}
                                    </button>
                                </td>
                                <td><button className="btn btn-primary btn-sm" disabled={!draft[m.key] || busy === m.key} onClick={() => apply(m)}>{busy === m.key ? '…' : 'Apply'}</button></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {shown.length > limit && <button className="btn btn-secondary btn-sm" style={{ marginTop: '8px' }} onClick={() => setLimit((l) => l + 20)}>Show more</button>}
            {shown.length === 0 && <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '8px 0' }}>No merchants match.</div>}
            {pickerKey && (
                <CategoryPickerModal
                    categories={categories}
                    selected={draft[pickerKey] || (merchants.find((m) => m.key === pickerKey) || {}).category}
                    onSelect={(cat) => { setDraft((d) => ({ ...d, [pickerKey]: cat })); setPickerKey(null); }}
                    onClose={() => setPickerKey(null)}
                />
            )}
        </div>
    );
};
