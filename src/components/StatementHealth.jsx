import React from 'react';
import { formatCurrencyVal, formatDate, toLocalDateStr, maskNumbersInText, localizeDatesInText } from '../utils.jsx';
import { analyzeStatements } from '../services/statementLedger.js';
import { matchAcrossStatements } from '../services/crossMatch.js';

const pill = (bg, color) => ({
    background: bg, color, fontSize: '0.72rem', fontWeight: 700, padding: '2px 8px',
    borderRadius: '10px', whiteSpace: 'nowrap', display: 'inline-block'
});

const AUDIT = {
    verified: { label: 'Verified', style: pill('#D1FAE5', '#065F46') },
    mismatch: { label: 'Mismatch', style: pill('#FEE2E2', '#991B1B') },
    unverifiable: { label: 'Unverified', style: pill('#FEF3C7', '#92400E') }
};
const CHAIN = {
    first: { label: 'First on record', style: pill('#E2E8F0', '#334155') },
    ok: { label: 'Continues ✓', style: pill('#D1FAE5', '#065F46') },
    gap: { label: 'Gap', style: pill('#FEF3C7', '#92400E') },
    chain: { label: 'Balance break', style: pill('#FEE2E2', '#991B1B') },
    overlap: { label: 'Overlaps', style: pill('#E0E7FF', '#3730A3') }
};

/**
 * Statement history + health: per-account timeline, missed statements, balance breaks, and the payments that
 * could / could not be matched across statements. Everything is derived from settings.statements + transactions.
 */
export const StatementHealth = ({ settings = {}, transactions = [], updateSetting, showToast }) => {
    const today = toLocalDateStr(new Date());
    const statements = settings.statements || [];
    const profiles = settings.accountProfiles || {};
    const money = (v) => (v === null || v === undefined ? '—' : formatCurrencyVal(v, settings.currency || 'INR'));
    // every date follows Settings → Date format
    const fmtDate = (d) => (d ? formatDate(d, settings.dateFormat) : '—');
    const say = (text) => maskNumbersInText(localizeDatesInText(text, settings.dateFormat));

    const analysis = React.useMemo(() => analyzeStatements(statements, today), [statements, today]);
    const matches = React.useMemo(() => matchAcrossStatements(transactions, profiles), [transactions, profiles]);
    const [removing, setRemoving] = React.useState(null);

    const autoNw = settings.autoNetWorthFromStatements !== false;
    const issueCount = analysis.issues.filter((i) => i.severity === 'warning').length;
    const cp = matches.cardPayments;

    const removeStatement = async (id) => {
        if (removing !== id) { setRemoving(id); return; }
        await updateSetting('statements', statements.filter((s) => s.id !== id));
        setRemoving(null);
        showToast && showToast('Statement record removed (its transactions are untouched)');
    };

    const txLabel = (t) => `${fmtDate(t.date)} · ${t.account} · ${money(t.amount)}${t.narration ? ` · ${String(t.narration).slice(0, 48)}` : ''}`;

    return (
        <div className="section-card" style={{ marginBottom: '28px' }}>
            <div className="section-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <span>Statement history & health</span>
                <span style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={pill('#E2E8F0', '#334155')}>{statements.length} statement{statements.length === 1 ? '' : 's'}</span>
                    <span style={issueCount ? pill('#FEF3C7', '#92400E') : pill('#D1FAE5', '#065F46')}>
                        {issueCount ? `${issueCount} to look at` : 'All clear'}
                    </span>
                </span>
            </div>

            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.82rem', marginBottom: '14px', cursor: 'pointer' }}>
                <input type="checkbox" checked={autoNw} onChange={(e) => updateSetting('autoNetWorthFromStatements', e.target.checked)} />
                Update Net Worth automatically from each statement (card amount owed, bank balance)
            </label>

            {statements.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                    Import a recognised statement (HDFC, SBI or ICICI card or savings account) and its history appears here —
                    opening vs closing balance checks, missed months, and card due dates.
                </p>
            ) : (
                <>
                    {analysis.issues.length > 0 && (
                        <div style={{ border: '1px solid #FDE68A', background: '#FFFBEB', borderRadius: '10px', padding: '10px 14px', marginBottom: '16px', fontSize: '0.82rem' }}>
                            <div style={{ fontWeight: 700, marginBottom: '4px', color: '#92400E' }}>Worth a look</div>
                            {analysis.issues.map((i, k) => (
                                <div key={k} style={{ padding: '2px 0', color: i.severity === 'warning' ? '#92400E' : 'var(--text-muted)' }}>
                                    {i.severity === 'warning' ? '⚠️' : 'ℹ️'} <strong>{i.account}</strong> — {say(i.message)}
                                </div>
                            ))}
                        </div>
                    )}

                    {analysis.accounts.map((account) => {
                        const { items, stale } = analysis.byAccount[account];
                        const profile = profiles[account] || {};
                        const latest = items[items.length - 1]?.record;
                        const isCard = profile.type === 'credit_card' || latest?.kind === 'card';
                        const used = isCard && latest?.creditLimit && latest?.totalDue != null ? Math.min(100, Math.round((latest.totalDue / latest.creditLimit) * 100)) : null;
                        return (
                            <div key={account} style={{ marginBottom: '18px' }}>
                                <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                                    <strong style={{ fontSize: '0.92rem' }}>{account}</strong>
                                    {latest?.last4 && <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>•{latest.last4}</span>}
                                    {isCard && latest?.totalDue != null && (
                                        <span style={{ fontSize: '0.8rem' }}>
                                            Owed {money(latest.totalDue)}
                                            {latest.creditLimit ? ` of ${money(latest.creditLimit)} limit${used !== null ? ` (${used}% used)` : ''}` : ''}
                                            {latest.dueDate ? ` · due ${fmtDate(latest.dueDate)}` : ''}
                                        </span>
                                    )}
                                    {!isCard && latest?.closing != null && <span style={{ fontSize: '0.8rem' }}>Balance {money(latest.closing)} at {fmtDate(latest.periodEnd)}</span>}
                                    {stale && <span style={pill('#FEF3C7', '#92400E')}>No new statement for {stale.days} days</span>}
                                </div>
                                <div className="table-responsive">
                                    <table className="table" style={{ fontSize: '0.8rem' }}>
                                        <thead>
                                            <tr>
                                                <th>Period</th>
                                                <th>{isCard ? 'Previous → Total due' : 'Opening → Closing'}</th>
                                                {isCard && <th>Min due / due date</th>}
                                                <th>Txns</th>
                                                <th>Audit</th>
                                                <th>History</th>
                                                <th></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items.slice().reverse().map(({ record: r, check }) => (
                                                <tr key={r.id}>
                                                    <td style={{ whiteSpace: 'nowrap' }}>{r.periodStart ? `${fmtDate(r.periodStart)} – ` : 'to '}{fmtDate(r.periodEnd)}</td>
                                                    <td style={{ whiteSpace: 'nowrap' }}>{money(r.opening)} → {money(r.closing)}</td>
                                                    {isCard && <td style={{ whiteSpace: 'nowrap' }}>{r.minDue != null ? money(r.minDue) : '—'} · {fmtDate(r.dueDate)}</td>}
                                                    <td>{r.txnCount}</td>
                                                    <td><span style={(AUDIT[r.auditStatus] || AUDIT.unverifiable).style}>{(AUDIT[r.auditStatus] || AUDIT.unverifiable).label}</span></td>
                                                    <td title={say(check.message)}><span style={(CHAIN[check.status] || CHAIN.first).style}>{(CHAIN[check.status] || CHAIN.first).label}</span></td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        <button className="btn btn-secondary btn-sm" style={{ border: 'none', color: 'var(--danger)', padding: '2px 6px' }} onClick={() => removeStatement(r.id)}>
                                                            {removing === r.id ? 'Sure?' : 'Remove'}
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        );
                    })}
                </>
            )}

            {/* Matching across statements */}
            <div style={{ marginTop: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '6px' }}>Matched across statements</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px', fontSize: '0.8rem' }}>
                    <span style={pill('#D1FAE5', '#065F46')}>{cp.pairs.length} card payment{cp.pairs.length === 1 ? '' : 's'} matched</span>
                    <span style={pill('#D1FAE5', '#065F46')}>{matches.selfTransfers.pairs.length} own-account transfer{matches.selfTransfers.pairs.length === 1 ? '' : 's'} matched</span>
                    <span style={pill('#D1FAE5', '#065F46')}>{matches.refunds.pairs.length} refund{matches.refunds.pairs.length === 1 ? '' : 's'} linked</span>
                </div>

                {cp.unmatchedBank.length > 0 && (
                    <details style={{ marginBottom: '6px' }} open>
                        <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: '#92400E', fontWeight: 600 }}>
                            {cp.unmatchedBank.length} card bill payment{cp.unmatchedBank.length === 1 ? '' : 's'} from your bank not found on a card statement
                        </summary>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 2px' }}>
                            Either the card statement for that cycle isn't imported yet, or the payment hasn't posted.
                        </div>
                        {cp.unmatchedBank.slice(0, 12).map((t) => <div key={t.id} style={{ fontSize: '0.8rem', padding: '1px 0' }}>• {txLabel(t)}</div>)}
                    </details>
                )}
                {cp.unmatchedCard.length > 0 && (
                    <details style={{ marginBottom: '6px' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.82rem', color: '#92400E', fontWeight: 600 }}>
                            {cp.unmatchedCard.length} card payment{cp.unmatchedCard.length === 1 ? '' : 's'} with no matching bank debit
                        </summary>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 2px' }}>
                            Paid from an account you haven't imported (UPI app, another bank) or the bank statement is missing.
                        </div>
                        {cp.unmatchedCard.slice(0, 12).map((t) => <div key={t.id} style={{ fontSize: '0.8rem', padding: '1px 0' }}>• {txLabel(t)}</div>)}
                    </details>
                )}
                {matches.selfTransfers.unmatchedOut.length + matches.selfTransfers.unmatchedIn.length > 0 && (
                    <details style={{ marginBottom: '6px' }}>
                        <summary style={{ cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                            {matches.selfTransfers.unmatchedOut.length + matches.selfTransfers.unmatchedIn.length} own-account transfer leg(s) with no other side
                        </summary>
                        {[...matches.selfTransfers.unmatchedOut, ...matches.selfTransfers.unmatchedIn].slice(0, 12).map((t) => (
                            <div key={t.id} style={{ fontSize: '0.8rem', padding: '1px 0' }}>• {t.neutralSign === '-' ? 'Out' : 'In'} · {txLabel(t)}</div>
                        ))}
                    </details>
                )}
                {matches.refunds.unmatched.length > 0 && (
                    <details>
                        <summary style={{ cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                            {matches.refunds.unmatched.length} refund{matches.refunds.unmatched.length === 1 ? '' : 's'} with no purchase found
                        </summary>
                        {matches.refunds.unmatched.slice(0, 12).map((t) => <div key={t.id} style={{ fontSize: '0.8rem', padding: '1px 0' }}>• {txLabel(t)}</div>)}
                    </details>
                )}
                {cp.pairs.length + cp.unmatchedBank.length + cp.unmatchedCard.length === 0 && matches.refunds.pairs.length + matches.refunds.unmatched.length === 0 && (
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Nothing to match yet — import a card statement together with the bank statement that paid it.</div>
                )}
            </div>
        </div>
    );
};
