import React from 'react';
import { RuleBuilderModal } from './RuleBuilderModal.jsx';
import { useEscapeKey, formatDate, formatCurrencyVal, Icon } from '../utils.jsx';
import { normalizeRule, sortRules, describeRule, impactedBy, isEnabled, previewRule } from '../services/rulesEngine.js';

/**
 * Rules list, Gmail style. Each rule shows what it matches and what it does, how many transactions it has changed,
 * and can be switched off, edited, re-run on existing transactions, or deleted — with the choice to take back what it did.
 */
export const RulesManager = ({
    rules = [], transactions = [], settings = {}, tags = [], openCreateSignal = 0,
    onSaveRule, onDeleteRule, onRunRule, showToast
}) => {
    const [builder, setBuilder] = React.useState(null);        // { rule } | { rule: null }
    const [toDelete, setToDelete] = React.useState(null);
    const money = (v) => formatCurrencyVal(v, settings.currency || 'INR');
    const sorted = React.useMemo(() => sortRules(rules).map((r) => ({ raw: r, rule: normalizeRule(r) })), [rules]);

    const lastSignal = React.useRef(openCreateSignal);
    React.useEffect(() => {
        if (openCreateSignal > lastSignal.current) setBuilder({ rule: null });
        lastSignal.current = openCreateSignal;
    }, [openCreateSignal]);

    const impactMap = React.useMemo(() => {
        const m = {};
        transactions.forEach((t) => { if (t.ruleChanges) Object.keys(t.ruleChanges).forEach((id) => { m[id] = (m[id] || 0) + 1; }); });
        return m;
    }, [transactions]);

    const toggle = async (raw) => {
        await onSaveRule({ ...raw, enabled: isEnabled(raw) ? 0 : 1 }, { applyExisting: false, quiet: true });
        showToast(isEnabled(raw) ? 'Rule switched off (existing transactions are unchanged)' : 'Rule switched on for new transactions');
    };

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', maxWidth: '640px' }}>
                    Rules work like Gmail filters: <strong>when</strong> a transaction matches, <strong>then</strong> set its category or add / remove tags.
                    They apply to the transactions you already have (you choose) and to everything you import from now on.
                </div>
                <button className="btn btn-primary" onClick={() => setBuilder({ rule: null })}>+ Create rule</button>
            </div>

            {sorted.length === 0 ? (
                <div className="empty-state">
                    <Icon name="rules" />
                    <div className="empty-state-text">
                        <h3>No rules yet</h3>
                        <p>For example: when the narration contains “swiggy, zomato” and the amount is at least 500 → set the category to Food delivery and add the tag “eating out”.</p>
                        <button className="btn btn-primary" onClick={() => setBuilder({ rule: null })}>Create your first rule</button>
                    </div>
                </div>
            ) : (
                <div className="section-card">
                    <div className="section-card-title">Your rules <span style={{ fontWeight: 500, fontSize: '0.75rem', color: 'var(--text-muted)' }}>· applied oldest first; if two rules set a category, the newer one wins</span></div>
                    {sorted.map(({ raw, rule }) => {
                        const d = describeRule(rule, { money });
                        const on = isEnabled(raw);
                        const changed = impactMap[rule.id] || 0;
                        return (
                            <div key={rule.id} style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 14px', marginBottom: '10px', opacity: on ? 1 : 0.6 }}>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                                    <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                                        {rule.name && <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '2px' }}>{rule.name}</div>}
                                        <div style={{ fontSize: '0.84rem' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>When</span> {d.when}</div>
                                        <div style={{ fontSize: '0.84rem' }}><span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Then</span> {d.then}</div>
                                        <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            {changed ? `Has changed ${changed} transaction${changed === 1 ? '' : 's'}` : 'Has not changed any transactions yet'}
                                            {rule.createdAt ? ` · created ${formatDate(rule.createdAt, settings.dateFormat)}` : ''}
                                            {rule.legacy ? ' · older rule' : ''}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <label style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '0.78rem', cursor: 'pointer' }} title={on ? 'Switch off (keeps existing changes)' : 'Switch on'}>
                                            <input type="checkbox" checked={on} onChange={() => toggle(raw)} style={{ transform: 'scale(1.15)' }} /> On
                                        </label>
                                        <button className="btn btn-secondary btn-sm" onClick={() => setBuilder({ rule: raw })}>Edit</button>
                                        <button className="btn btn-secondary btn-sm" disabled={!on} title="Apply this rule to matching transactions you already have" onClick={async () => {
                                            const res = await onRunRule(raw, {});
                                            showToast(res.updated ? `Rule applied to ${res.updated} transaction${res.updated === 1 ? '' : 's'}` : 'Nothing to change — every matching transaction already follows this rule');
                                        }}>Run on existing</button>
                                        <button className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)' }} onClick={() => setToDelete(raw)} title="Delete rule"><Icon name="trash" /></button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {builder && (
                <RuleBuilderModal
                    rule={builder.rule}
                    prefill={builder.prefill}
                    transactions={transactions}
                    settings={settings}
                    tags={tags}
                    impactedCount={builder.rule ? (impactMap[builder.rule.id] || 0) : 0}
                    onClose={() => setBuilder(null)}
                    onSave={async (rule, opts) => {
                        const res = await onSaveRule(rule, opts);
                        setBuilder(null);
                        return res;
                    }}
                />
            )}

            {toDelete && (
                <DeleteRuleModal
                    rule={toDelete}
                    transactions={transactions}
                    settings={settings}
                    onClose={() => setToDelete(null)}
                    onConfirm={async (revert) => {
                        const res = await onDeleteRule(toDelete, { revert });
                        setToDelete(null);
                        showToast(revert
                            ? `Rule deleted and ${res.reverted} transaction${res.reverted === 1 ? '' : 's'} put back as they were`
                            : 'Rule deleted — transactions were left as they are');
                    }}
                />
            )}
        </div>
    );
};

/** Delete a rule: keep what it did to your transactions, or take it back. Shows exactly how many are affected. */
const DeleteRuleModal = ({ rule, transactions, settings, onClose, onConfirm }) => {
    useEscapeKey(onClose);
    const r = normalizeRule(rule);
    const impacted = React.useMemo(() => impactedBy(transactions, r.id), [transactions, r.id]);
    const [choice, setChoice] = React.useState(impacted.length ? 'revert' : 'keep');
    const [busy, setBusy] = React.useState(false);
    const d = describeRule(r);
    const money = (v) => formatCurrencyVal(v, settings.currency || 'INR');
    const n = impacted.length;

    return (
        <div className="modal-overlay confirm-modal-overlay" onClick={onClose}>
            <div className="modal-container" style={{ maxWidth: '560px', width: '94%' }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">Delete rule{r.name ? ` “${r.name}”` : ''}?</h3>
                    <button className="modal-close-btn" onClick={onClose}><Icon name="close" /></button>
                </div>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>When {d.when}, then {d.then}.</div>
                    {n === 0 ? (
                        <div style={{ fontSize: '0.88rem' }}>This rule has not changed any of your transactions, so deleting it only stops it applying to future imports.</div>
                    ) : (
                        <>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>This rule has changed {n} transaction{n === 1 ? '' : 's'}.</div>
                            <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer', border: `1px solid ${choice === 'revert' ? 'var(--primary)' : 'var(--border-color)'}`, borderRadius: '10px', padding: '10px 12px' }}>
                                <input type="radio" checked={choice === 'revert'} onChange={() => setChoice('revert')} style={{ marginTop: '3px' }} />
                                <span><strong>Delete the rule and undo its changes</strong> on {n} transaction{n === 1 ? '' : 's'} — categories and tags it set go back to what they were. Anything you changed by hand afterwards stays.</span>
                            </label>
                            <label style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', cursor: 'pointer', border: `1px solid ${choice === 'keep' ? 'var(--primary)' : 'var(--border-color)'}`, borderRadius: '10px', padding: '10px 12px' }}>
                                <input type="radio" checked={choice === 'keep'} onChange={() => setChoice('keep')} style={{ marginTop: '3px' }} />
                                <span><strong>Delete the rule only</strong> — the {n} transaction{n === 1 ? '' : 's'} stay exactly as they are now.</span>
                            </label>
                            <div className="table-responsive" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                                <table className="table" style={{ fontSize: '0.76rem' }}>
                                    <tbody>
                                        {impacted.slice(0, 6).map((t) => (
                                            <tr key={t.id}>
                                                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(t.date, settings.dateFormat)}</td>
                                                <td style={{ maxWidth: '230px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.narration}</td>
                                                <td style={{ whiteSpace: 'nowrap' }}>{money(t.amount)}</td>
                                            </tr>
                                        ))}
                                        {n > 6 && <tr><td colSpan={3} style={{ color: 'var(--text-muted)' }}>…and {n - 6} more</td></tr>}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </div>
                <div className="modal-footer">
                    <button className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
                    <button className="btn btn-danger" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(n > 0 && choice === 'revert'); } finally { setBusy(false); } }}>
                        {busy ? 'Deleting…' : n > 0 && choice === 'revert' ? `Delete & undo ${n}` : 'Delete rule'}
                    </button>
                </div>
            </div>
        </div>
    );
};
