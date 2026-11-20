import React from 'react';
import { Icon, formatCurrencyVal, formatDate } from '../utils.jsx';
import { ACCOUNT_TYPES, BANKS } from '../services/accounts.js';

const typeLabel = (id) => (ACCOUNT_TYPES.find((t) => t.id === id) || { label: 'Not set' }).label;
const numOrEmpty = (v) => (v === '' || v === null || v === undefined ? '' : String(v));

/**
 * Settings → Accounts. Each account has a name (what transactions refer to) and a profile: type, bank,
 * last digits (lets statements find their account on their own), credit limit and statement / due days.
 */
export const AccountsSetup = ({ settings = {}, transactions = [], updateSetting, showToast }) => {
    const accounts = settings.accounts || [];
    const profiles = settings.accountProfiles || {};
    const statements = settings.statements || [];
    const money = (v) => formatCurrencyVal(v, settings.currency || 'INR');

    const [newName, setNewName] = React.useState('');
    const [newType, setNewType] = React.useState('credit_card');
    const [newBank, setNewBank] = React.useState('');
    const [editing, setEditing] = React.useState(null);
    const [draft, setDraft] = React.useState({});
    const [removing, setRemoving] = React.useState(null);

    const txCount = React.useMemo(() => {
        const m = {};
        transactions.forEach((t) => { if (t.account) m[t.account] = (m[t.account] || 0) + 1; });
        return m;
    }, [transactions]);

    const latestFor = (name) => statements
        .filter((s) => s.account === name)
        .sort((a, b) => String(a.periodEnd || '').localeCompare(String(b.periodEnd || '')))
        .pop();

    const add = async () => {
        const name = newName.trim();
        if (!name) return;
        if (accounts.some((a) => a.toLowerCase() === name.toLowerCase())) {
            showToast('Account name already exists', 'error');
            return;
        }
        await updateSetting('accounts', [...accounts, name]);
        await updateSetting('accountProfiles', { ...profiles, [name]: { type: newType, ...(newBank ? { bank: newBank } : {}) } });
        setNewName('');
        showToast(`Account "${name}" added`);
    };

    const remove = async (name) => {
        if (accounts.length <= 1) { showToast('Must have at least one account', 'error'); return; }
        if (removing !== name) { setRemoving(name); return; }
        await updateSetting('accounts', accounts.filter((a) => a !== name));
        const next = { ...profiles };
        delete next[name];
        await updateSetting('accountProfiles', next);
        setRemoving(null);
        showToast(`Account "${name}" removed${txCount[name] ? ` — its ${txCount[name]} transactions keep the name` : ''}`);
    };

    const startEdit = (name) => {
        setEditing(name);
        setDraft({ type: '', bank: '', last4: '', creditLimit: '', statementDay: '', dueDay: '', ...(profiles[name] || {}) });
    };

    const saveEdit = async () => {
        const clean = {
            type: draft.type || undefined,
            bank: draft.bank || undefined,
            last4: String(draft.last4 || '').replace(/\D/g, '').slice(-4) || undefined,
            creditLimit: draft.creditLimit === '' ? undefined : Number(draft.creditLimit),
            statementDay: draft.statementDay === '' ? undefined : Math.min(31, Math.max(1, Number(draft.statementDay))),
            dueDay: draft.dueDay === '' ? undefined : Math.min(31, Math.max(1, Number(draft.dueDay)))
        };
        Object.keys(clean).forEach((k) => clean[k] === undefined && delete clean[k]);
        await updateSetting('accountProfiles', { ...profiles, [editing]: clean });
        setEditing(null);
        showToast(`Saved "${editing}"`);
    };

    const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
    const isCardDraft = draft.type === 'credit_card';

    return (
        <div className="section-card">
            <div className="section-card-title">Accounts Setup</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: '0 0 12px' }}>
                Add the last digits of each card / account and imported statements find their account by themselves.
                Credit limit and due day are filled in from statements.
            </p>

            <div className="flex-row-gap" style={{ marginBottom: '16px', flexWrap: 'wrap' }}>
                <input type="text" className="form-control" placeholder="Add new account" value={newName}
                    onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} style={{ flex: '1 1 180px' }} />
                <select className="form-control" value={newType} onChange={(e) => setNewType(e.target.value)} style={{ flex: '0 0 190px' }}>
                    {ACCOUNT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
                <select className="form-control" value={newBank} onChange={(e) => setNewBank(e.target.value)} style={{ flex: '0 0 110px' }}>
                    <option value="">Bank…</option>
                    {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
                <button className="btn btn-primary" onClick={add}>Add</button>
            </div>

            <div style={{ maxHeight: '460px', overflowY: 'auto' }}>
                {accounts.map((name) => {
                    const p = profiles[name] || {};
                    const latest = latestFor(name);
                    const isEditing = editing === name;
                    return (
                        <div key={name} className="settings-list-item" style={{ display: 'block' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                <span style={{ fontWeight: 600, flex: '1 1 160px' }}>{name}</span>
                                <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                    {typeLabel(p.type)}{p.bank ? ` · ${p.bank}` : ''}{p.last4 ? ` · •${p.last4}` : ''}
                                </span>
                                {txCount[name] > 0 && <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{txCount[name]} txns</span>}
                                <button className="btn btn-secondary btn-sm" onClick={() => (isEditing ? setEditing(null) : startEdit(name))}>{isEditing ? 'Close' : 'Edit'}</button>
                                <button className="btn btn-secondary btn-sm" style={{ border: 'none', color: 'var(--danger)', padding: '0 4px' }} onClick={() => remove(name)} title="Remove account">
                                    {removing === name ? 'Sure?' : <Icon name="trash" />}
                                </button>
                            </div>
                            {latest && !isEditing && (
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                                    Latest statement ({formatDate(latest.periodEnd, settings.dateFormat)}):{' '}
                                    {latest.kind === 'card'
                                        ? `owed ${money(latest.totalDue ?? 0)}${p.creditLimit ? ` of ${money(p.creditLimit)}` : ''}${latest.dueDate ? `, due ${formatDate(latest.dueDate, settings.dateFormat)}` : ''}`
                                        : `balance ${money(latest.closing ?? 0)}`}
                                </div>
                            )}
                            {isEditing && (
                                <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px' }}>
                                    <label style={{ fontSize: '0.76rem' }}>Type
                                        <select className="form-control" value={draft.type || ''} onChange={set('type')}>
                                            <option value="">Not set</option>
                                            {ACCOUNT_TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                                        </select>
                                    </label>
                                    <label style={{ fontSize: '0.76rem' }}>Bank
                                        <select className="form-control" value={draft.bank || ''} onChange={set('bank')}>
                                            <option value="">Not set</option>
                                            {BANKS.map((b) => <option key={b} value={b}>{b}</option>)}
                                        </select>
                                    </label>
                                    <label style={{ fontSize: '0.76rem' }}>Last 4 digits (SBI cards print 2)
                                        <input className="form-control" inputMode="numeric" maxLength={4} value={numOrEmpty(draft.last4)} onChange={set('last4')} placeholder="1234" />
                                    </label>
                                    {isCardDraft && (
                                        <>
                                            <label style={{ fontSize: '0.76rem' }}>Credit limit
                                                <input className="form-control" type="number" min="0" value={numOrEmpty(draft.creditLimit)} onChange={set('creditLimit')} />
                                            </label>
                                            <label style={{ fontSize: '0.76rem' }}>Statement day (1–31)
                                                <input className="form-control" type="number" min="1" max="31" value={numOrEmpty(draft.statementDay)} onChange={set('statementDay')} />
                                            </label>
                                            <label style={{ fontSize: '0.76rem' }}>Payment due day (1–31)
                                                <input className="form-control" type="number" min="1" max="31" value={numOrEmpty(draft.dueDay)} onChange={set('dueDay')} />
                                            </label>
                                        </>
                                    )}
                                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px' }}>
                                        <button className="btn btn-primary btn-sm" onClick={saveEdit}>Save</button>
                                        <button className="btn btn-secondary btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
