import React from 'react';
import { CategoryPickerModal } from './modals/TransactionModals.jsx';
import { useEscapeKey, formatDate, formatCurrencyVal, Icon } from '../utils.jsx';
import {
    CONDITION_FIELDS, ACTION_TYPES, normalizeRule, emptyRule, validateRule, previewRule, revertRuleOnTx, describeRule
} from '../services/rulesEngine.js';

const NEEDS_REVIEW_RE = /Needs Review|Uncategorized/i;
const inputStyle = { height: '34px', fontSize: '0.85rem' };

const fieldOps = (field) => (CONDITION_FIELDS.find((f) => f.id === field) || CONDITION_FIELDS[0]).ops;
const defaultValueFor = (field) => (field === 'type' ? 'expense' : '');

/** Chips for a list of tag names, with a picker for existing tags and (optionally) a box for a new one. */
const TagListEditor = ({ value, onChange, tags, allowNew }) => {
    const list = Array.isArray(value) ? value : String(value || '').split(',').map((s) => s.trim()).filter(Boolean);
    const [typed, setTyped] = React.useState('');
    const free = tags.filter((t) => !list.some((l) => l.toLowerCase() === t.name.toLowerCase()));
    const add = (name) => {
        const n = String(name || '').trim();
        if (!n || list.some((l) => l.toLowerCase() === n.toLowerCase())) return;
        onChange([...list, n]);
    };
    return (
        <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: list.length ? '6px' : 0 }}>
                {list.map((name) => {
                    const known = tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
                    return (
                        <span key={name} style={{ background: known ? known.color : '#64748B', color: '#fff', borderRadius: '12px', padding: '2px 10px', fontSize: '0.78rem', fontWeight: 600, display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                            {name}
                            <button type="button" onClick={() => onChange(list.filter((l) => l !== name))} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: 0, fontSize: '0.9rem', lineHeight: 1 }} aria-label={`Remove ${name}`}>×</button>
                        </span>
                    );
                })}
            </div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {free.length > 0 && (
                    <select className="form-control" style={{ ...inputStyle, width: 'auto', minWidth: '150px' }} value="" onChange={(e) => { add(e.target.value); e.target.value = ''; }}>
                        <option value="">+ Pick a tag…</option>
                        {free.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                    </select>
                )}
                {allowNew && (
                    <>
                        <input className="form-control" style={{ ...inputStyle, width: '150px' }} placeholder="or a new tag" value={typed}
                            onChange={(e) => setTyped(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(typed); setTyped(''); } }} />
                        <button type="button" className="btn btn-secondary btn-sm" disabled={!typed.trim()} onClick={() => { add(typed); setTyped(''); }}>Add</button>
                    </>
                )}
            </div>
        </div>
    );
};

/**
 * Create / edit a rule, Gmail style: pick conditions, pick actions, see what it would do to the transactions you already
 * have, and decide whether to apply it to them. New transactions from future imports are always covered.
 */
export const RuleBuilderModal = ({ rule, transactions = [], settings = {}, tags = [], impactedCount = 0, onSave, onClose, prefill = null }) => {
    useEscapeKey(onClose);
    const editing = !!(rule && rule.id);
    const [draft, setDraft] = React.useState(() => {
        const base = rule ? normalizeRule(rule) : { ...emptyRule(), ...(prefill || {}) };
        return JSON.parse(JSON.stringify(base));
    });
    const [pickerFor, setPickerFor] = React.useState(null);        // { kind: 'action'|'condition', index }
    const [applyExisting, setApplyExisting] = React.useState(true);
    const [overwriteManual, setOverwriteManual] = React.useState(false);
    const [reapply, setReapply] = React.useState(true);            // editing: undo earlier changes, then apply the new version
    const [saving, setSaving] = React.useState(false);

    const categories = React.useMemo(() => (settings.categories || []).filter((c) => !NEEDS_REVIEW_RE.test(c)), [settings.categories]);
    const accounts = settings.accounts || [];
    const money = (v) => formatCurrencyVal(v, settings.currency || 'INR');
    const problem = validateRule(draft);

    // What the rule would do to existing transactions (after virtually undoing its own earlier work when re-applying)
    const preview = React.useMemo(() => {
        const base = editing && reapply ? transactions.map((t) => revertRuleOnTx(t, rule.id).tx) : transactions;
        return previewRule({ ...draft, id: draft.id || 'preview' }, base, { overwriteManual, pool: settings.categories || null });
    }, [draft, transactions, overwriteManual, editing, reapply, rule, settings.categories]);

    const patch = (p) => setDraft((d) => ({ ...d, ...p }));
    const setCond = (i, p) => setDraft((d) => ({ ...d, conditions: d.conditions.map((c, k) => (k === i ? { ...c, ...p } : c)) }));
    const setAct = (i, p) => setDraft((d) => ({ ...d, actions: d.actions.map((a, k) => (k === i ? { ...a, ...p } : a)) }));
    const removeCond = (i) => setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, k) => k !== i) }));
    const removeAct = (i) => setDraft((d) => ({ ...d, actions: d.actions.filter((_, k) => k !== i) }));

    const changeField = (i, field) => setCond(i, { field, op: fieldOps(field)[0].id, value: defaultValueFor(field), value2: '' });
    const changeActionType = (i, type) => setAct(i, { type, value: type === 'setCategory' ? '' : [] });

    const save = async () => {
        if (problem || saving) return;
        setSaving(true);
        try {
            await onSave(
                { ...draft, conditions: draft.conditions, actions: draft.actions },
                { applyExisting: editing ? reapply : applyExisting, overwriteManual, revertFirst: editing && reapply }
            );
        } finally { setSaving(false); }
    };

    const willChange = preview.willChange;
    const summary = (() => {
        try { return describeRule(draft, { money }); } catch (e) { return null; }
    })();

    return (
        <div className="modal-overlay">
            <div className="modal-container" style={{ maxWidth: '780px', width: '96%', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
                <div className="modal-header">
                    <h3 className="modal-title">{editing ? 'Edit rule' : 'Create rule'}</h3>
                    <button className="modal-close-btn" onClick={onClose}><Icon name="close" /></button>
                </div>

                <div className="modal-body" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
                    <label style={{ fontSize: '0.78rem', fontWeight: 600 }}>Name <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(optional)</span>
                        <input className="form-control" style={inputStyle} placeholder="e.g. Food delivery" value={draft.name || ''} onChange={(e) => patch({ name: e.target.value })} />
                    </label>

                    {/* WHEN */}
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', fontWeight: 700, fontSize: '0.88rem' }}>
                            When a transaction matches
                            <select className="form-control" style={{ ...inputStyle, width: 'auto' }} value={draft.match || 'all'} onChange={(e) => patch({ match: e.target.value })}>
                                <option value="all">all</option>
                                <option value="any">any</option>
                            </select>
                            of these:
                        </div>
                        {draft.conditions.map((c, i) => {
                            const ops = fieldOps(c.field);
                            return (
                                <div key={i} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
                                    <select className="form-control" style={{ ...inputStyle, width: '190px' }} value={c.field} onChange={(e) => changeField(i, e.target.value)}>
                                        {CONDITION_FIELDS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                                    </select>
                                    <select className="form-control" style={{ ...inputStyle, width: '190px' }} value={c.op} onChange={(e) => setCond(i, { op: e.target.value })}>
                                        {ops.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                                        {c.op === 'contains' && <option value="contains">contains</option>}
                                    </select>
                                    {(c.field === 'narration' || c.field === 'refId') && (
                                        <input className="form-control" style={{ ...inputStyle, flex: '1 1 200px' }} value={c.value || ''} onChange={(e) => setCond(i, { value: e.target.value })}
                                            placeholder={(ops.find((o) => o.id === c.op) || {}).hint || 'text'} />
                                    )}
                                    {c.field === 'amount' && (
                                        <>
                                            <input className="form-control" type="number" min="0" style={{ ...inputStyle, width: '130px' }} value={c.value ?? ''} onChange={(e) => setCond(i, { value: e.target.value })} placeholder="amount" />
                                            {c.op === 'between' && (<><span style={{ fontSize: '0.8rem' }}>and</span><input className="form-control" type="number" min="0" style={{ ...inputStyle, width: '130px' }} value={c.value2 ?? ''} onChange={(e) => setCond(i, { value2: e.target.value })} placeholder="amount" /></>)}
                                        </>
                                    )}
                                    {c.field === 'type' && (
                                        <select className="form-control" style={{ ...inputStyle, width: '190px' }} value={c.value} onChange={(e) => setCond(i, { value: e.target.value })}>
                                            <option value="expense">Expense</option>
                                            <option value="income">Income</option>
                                            <option value="neutral">Transfer (neutral)</option>
                                        </select>
                                    )}
                                    {c.field === 'account' && (
                                        <select className="form-control" style={{ ...inputStyle, width: '220px' }} value={c.value || ''} onChange={(e) => setCond(i, { value: e.target.value })}>
                                            <option value="">Choose account…</option>
                                            {accounts.map((a) => <option key={a} value={a}>{a}</option>)}
                                        </select>
                                    )}
                                    {c.field === 'category' && (
                                        <button type="button" className="form-control" style={{ ...inputStyle, width: 'auto', minWidth: '220px', textAlign: 'left', cursor: 'pointer' }} onClick={() => setPickerFor({ kind: 'condition', index: i })}>
                                            {c.value || 'Choose category…'}
                                        </button>
                                    )}
                                    {c.field === 'tag' && (
                                        <select className="form-control" style={{ ...inputStyle, width: '200px' }} value={c.value || ''} onChange={(e) => setCond(i, { value: e.target.value })}>
                                            <option value="">Choose tag…</option>
                                            {tags.map((t) => <option key={t.name} value={t.name}>{t.name}</option>)}
                                        </select>
                                    )}
                                    {draft.conditions.length > 1 && (
                                        <button type="button" className="btn btn-secondary btn-sm" style={{ border: 'none', color: 'var(--danger)' }} onClick={() => removeCond(i)} title="Remove condition"><Icon name="trash" /></button>
                                    )}
                                </div>
                            );
                        })}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => patch({ conditions: [...draft.conditions, { field: 'amount', op: 'gte', value: '' }] })}>+ Add condition</button>
                    </div>

                    {/* THEN */}
                    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px' }}>
                        <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '10px' }}>Then</div>
                        {draft.actions.map((a, i) => (
                            <div key={i} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <select className="form-control" style={{ ...inputStyle, width: '160px' }} value={a.type} onChange={(e) => changeActionType(i, e.target.value)}>
                                    {ACTION_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                                </select>
                                {a.type === 'setCategory' ? (
                                    <button type="button" className="form-control" style={{ ...inputStyle, width: 'auto', minWidth: '260px', textAlign: 'left', cursor: 'pointer' }} onClick={() => setPickerFor({ kind: 'action', index: i })}>
                                        {a.value || 'Choose category…'}
                                    </button>
                                ) : (
                                    <TagListEditor value={a.value} onChange={(v) => setAct(i, { value: v })} tags={tags} allowNew={a.type === 'addTags'} />
                                )}
                                {draft.actions.length > 1 && (
                                    <button type="button" className="btn btn-secondary btn-sm" style={{ border: 'none', color: 'var(--danger)' }} onClick={() => removeAct(i)} title="Remove action"><Icon name="trash" /></button>
                                )}
                            </div>
                        ))}
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => patch({ actions: [...draft.actions, { type: 'addTags', value: [] }] })}>+ Add action</button>
                    </div>

                    {/* PREVIEW / APPLY */}
                    <div style={{ background: 'var(--bg-subtle, #F8FAFC)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px', fontSize: '0.84rem' }}>
                        {summary && !problem && <div style={{ color: 'var(--text-muted)', marginBottom: '6px' }}>If {summary.when}, then {summary.then}.</div>}
                        {problem ? (
                            <div style={{ color: '#B45309', fontWeight: 600 }}>{problem}</div>
                        ) : (
                            <>
                                <div style={{ fontWeight: 700 }}>
                                    Matches {preview.matching} of your {transactions.length} transaction{transactions.length === 1 ? '' : 's'}
                                    {preview.matching > 0 && <span style={{ fontWeight: 500 }}> — {willChange} would change{preview.alreadyDone ? `, ${preview.alreadyDone} already as the rule wants` : ''}{preview.skippedManual ? `, ${preview.skippedManual} you set by hand` : ''}</span>}
                                </div>
                                {preview.changeSamples.length > 0 && (
                                    <div className="table-responsive" style={{ marginTop: '8px', maxHeight: '170px', overflowY: 'auto' }}>
                                        <table className="table" style={{ fontSize: '0.78rem' }}>
                                            <thead><tr><th>Date</th><th>Narration</th><th>Amount</th><th>After</th></tr></thead>
                                            <tbody>
                                                {preview.changeSamples.map(({ before, after }) => (
                                                    <tr key={before.id}>
                                                        <td style={{ whiteSpace: 'nowrap' }}>{formatDate(before.date, settings.dateFormat)}</td>
                                                        <td style={{ maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={before.narration}>{before.narration}</td>
                                                        <td style={{ whiteSpace: 'nowrap' }}>{money(before.amount)}</td>
                                                        <td>{after.category !== before.category ? after.category : ''}{(after.tags || []).join(',') !== (before.tags || []).join(',') ? ` · tags: ${(after.tags || []).join(', ') || '—'}` : ''}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                                {preview.matching > 0 && preview.changeSamples.length === 0 && preview.samples.length > 0 && (
                                    <div style={{ marginTop: '6px', color: 'var(--text-muted)' }}>
                                        e.g. {preview.samples.slice(0, 3).map((t) => `“${String(t.narration).slice(0, 30)}”`).join(', ')}
                                    </div>
                                )}

                                <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {!editing ? (
                                        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', fontWeight: 600 }}>
                                            <input type="checkbox" checked={applyExisting} onChange={(e) => setApplyExisting(e.target.checked)} />
                                            Also apply to the {willChange} existing transaction{willChange === 1 ? '' : 's'} it would change
                                        </label>
                                    ) : (
                                        <>
                                            <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
                                                <input type="radio" checked={reapply} onChange={() => setReapply(true)} style={{ marginTop: '3px' }} />
                                                <span><strong>Update existing transactions</strong> — take back what this rule did before{impactedCount ? ` (${impactedCount} transaction${impactedCount === 1 ? '' : 's'})` : ''}, then apply the edited rule to everything that matches.</span>
                                            </label>
                                            <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer' }}>
                                                <input type="radio" checked={!reapply} onChange={() => setReapply(false)} style={{ marginTop: '3px' }} />
                                                <span><strong>Only from now on</strong> — leave existing transactions as they are; new imports use the edited rule.</span>
                                            </label>
                                        </>
                                    )}
                                    {preview.skippedManual > 0 && (!editing || reapply) && (applyExisting || editing) && (
                                        <label style={{ display: 'flex', gap: '8px', alignItems: 'center', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                            <input type="checkbox" checked={overwriteManual} onChange={(e) => setOverwriteManual(e.target.checked)} />
                                            Also overwrite the {preview.skippedManual} categor{preview.skippedManual === 1 ? 'y' : 'ies'} I set by hand
                                        </label>
                                    )}
                                    <div style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>Rules also run automatically on every transaction you import or add from now on.</div>
                                </div>
                            </>
                        )}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={save} disabled={!!problem || saving}>
                        {saving ? 'Saving…' : editing ? 'Save rule' : ((applyExisting && willChange > 0) ? `Create rule & apply to ${willChange}` : 'Create rule')}
                    </button>
                </div>
            </div>

            {pickerFor && (
                <CategoryPickerModal
                    categories={categories}
                    selected={pickerFor.kind === 'action' ? draft.actions[pickerFor.index]?.value : draft.conditions[pickerFor.index]?.value}
                    onSelect={(cat) => {
                        if (pickerFor.kind === 'action') setAct(pickerFor.index, { value: cat }); else setCond(pickerFor.index, { value: cat });
                        setPickerFor(null);
                    }}
                    onClose={() => setPickerFor(null)}
                />
            )}
        </div>
    );
};
