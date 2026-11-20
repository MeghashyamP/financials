import React from 'react';
import { formatCurrencyVal, formatDate, localizeDatesInText, DatePickerField, maskNumbersInText, isPrivacyMasked, getEffectiveNetWorthItemValue, calculateNextExpectedDate, NET_WORTH_GROUPS, toLocalDateStr } from '../utils.jsx';
import {
    availableFys, fyStartYear, fyLabel, fyRange, compareFy, summarizeFy, cardCosts, buildAlerts,
    buildForecast, everydaySpendPerDay, filterTransactions, transactionsToCSV, statementsToCSV, addDays
} from '../services/reports.js';

const TABS = [
    { id: 'fy', label: 'Financial year' },
    { id: 'cards', label: 'Fees & interest' },
    { id: 'alerts', label: 'Alerts' },
    { id: 'forecast', label: 'Forecast' },
    { id: 'export', label: 'Export' }
];

const Stat = ({ label, value, sub, color }) => (
    <div style={{ border: '1px solid var(--border-color)', borderRadius: '12px', padding: '12px 16px', background: 'var(--card-bg, #fff)', flex: '1 1 150px', minWidth: 0 }}>
        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ fontSize: '1.25rem', fontWeight: 700, color: color || 'var(--text-main)', marginTop: '2px' }}>{value}</div>
        {sub && <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
    </div>
);

const pctText = (p) => (p === null || p === undefined ? '' : `${p >= 0 ? '+' : ''}${(p * 100).toFixed(0)}%`);

// Income vs spending per month
const MonthlyBars = ({ months, money }) => {
    const max = Math.max(1, ...months.map((m) => Math.max(m.income, m.expense)));
    const W = 720; const H = 190; const pad = 26; const bw = (W - pad * 2) / months.length;
    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Monthly income and spending">
            {months.map((m, i) => {
                const x = pad + i * bw;
                const hi = ((H - 44) * m.income) / max;
                const he = ((H - 44) * m.expense) / max;
                return (
                    <g key={m.key}>
                        <title>{`${m.label}: income ${money(m.income)}, spending ${money(m.expense)}`}</title>
                        <rect x={x + bw * 0.12} y={H - 24 - hi} width={bw * 0.36} height={hi} rx="2" fill="var(--success, #10B981)" />
                        <rect x={x + bw * 0.52} y={H - 24 - he} width={bw * 0.36} height={he} rx="2" fill="var(--danger, #EF4444)" />
                        <text x={x + bw / 2} y={H - 8} fontSize="10" textAnchor="middle" fill="var(--text-muted, #64748B)">{m.label.split(' ')[0]}</text>
                    </g>
                );
            })}
        </svg>
    );
};

const BalanceLine = ({ series, money, fmtDate }) => {
    if (!series.length) return null;
    const W = 720; const H = 190; const pad = 28;
    const vals = series.map((p) => p.balance);
    const min = Math.min(0, ...vals); const max = Math.max(1, ...vals);
    const x = (i) => pad + (i * (W - pad * 2)) / Math.max(1, series.length - 1);
    const y = (v) => H - 24 - ((H - 44) * (v - min)) / (max - min || 1);
    const d = series.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
    return (
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} role="img" aria-label="Projected balance">
            <line x1={pad} x2={W - pad} y1={y(0)} y2={y(0)} stroke="var(--border-color, #E2E8F0)" strokeDasharray="4 4" />
            <path d={d} fill="none" stroke="var(--primary, #6558D3)" strokeWidth="2.2" />
            {series.map((p, i) => (p.events.length ? <circle key={p.date} cx={x(i)} cy={y(p.balance)} r="3.5" fill={p.delta < 0 ? 'var(--danger, #EF4444)' : 'var(--success, #10B981)'}><title>{`${fmtDate(p.date)}: ${money(p.balance)} — ${p.events.map((e) => e.name).join(', ')}`}</title></circle> : null))}
            <text x={pad} y={H - 6} fontSize="10" fill="var(--text-muted, #64748B)">{fmtDate(series[0].date)}</text>
            <text x={W - pad} y={H - 6} fontSize="10" textAnchor="end" fill="var(--text-muted, #64748B)">{fmtDate(series[series.length - 1].date)}</text>
        </svg>
    );
};

const download = (filename, text, mime = 'text/csv;charset=utf-8') => {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
};

export const ReportsPage = ({ transactions = [], settings = {}, updateSetting, showToast }) => {
    const [tab, setTab] = React.useState('fy');
    const todayIso = toLocalDateStr(new Date());
    const money = (v) => formatCurrencyVal(v, settings.currency || 'INR');
    const startMonth = Number(settings.fyStartMonth) === 1 ? 1 : 4;
    // every date follows Settings → Date format
    const fmtDate = (d) => (d ? formatDate(d, settings.dateFormat) : '');

    const fys = React.useMemo(() => availableFys(transactions, startMonth), [transactions, startMonth]);
    const currentFy = fyStartYear(todayIso, startMonth);
    const [fy, setFy] = React.useState(null);
    const activeFy = fy ?? (fys.includes(currentFy) ? currentFy : (fys[0] ?? currentFy));
    const fyOptions = fys.length ? fys : [currentFy];

    return (
        <div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                {TABS.map((t) => (
                    <button key={t.id} className={`btn btn-sm ${tab === t.id ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
            </div>

            {['fy', 'cards'].includes(tab) && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
                    <select className="form-control" style={{ width: 'auto', minWidth: '150px' }} value={activeFy} onChange={(e) => setFy(Number(e.target.value))}>
                        {fyOptions.map((y) => <option key={y} value={y}>{fyLabel(y, startMonth)}</option>)}
                    </select>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '6px', alignItems: 'center' }}>
                        Year starts in
                        <select className="form-control" style={{ width: 'auto' }} value={startMonth} onChange={(e) => { setFy(null); updateSetting('fyStartMonth', Number(e.target.value)); }}>
                            <option value={4}>April (India FY)</option>
                            <option value={1}>January</option>
                        </select>
                    </label>
                </div>
            )}

            {tab === 'fy' && <FinancialYearTab transactions={transactions} fy={activeFy} startMonth={startMonth} todayIso={todayIso} money={money} />}
            {tab === 'cards' && <CardCostsTab transactions={transactions} fy={activeFy} startMonth={startMonth} money={money} fmtDate={fmtDate} />}
            {tab === 'alerts' && <AlertsTab transactions={transactions} todayIso={todayIso} money={money} dateFormat={settings.dateFormat} />}
            {tab === 'forecast' && <ForecastTab transactions={transactions} settings={settings} todayIso={todayIso} money={money} fmtDate={fmtDate} />}
            {tab === 'export' && <ExportTab transactions={transactions} settings={settings} todayIso={todayIso} showToast={showToast} />}
        </div>
    );
};

// ───────────────────────── Financial year ─────────────────────────
const FinancialYearTab = ({ transactions, fy, startMonth, todayIso, money }) => {
    const cmp = React.useMemo(() => compareFy(transactions, fy, { startMonth, todayIso }), [transactions, fy, startMonth, todayIso]);
    const full = React.useMemo(() => summarizeFy(transactions, fy, { startMonth }), [transactions, fy, startMonth]);
    const [open, setOpen] = React.useState(null);
    if (full.income + full.expense === 0) {
        return <div className="empty-state"><div className="empty-state-text"><h3>No transactions in {fyLabel(fy, startMonth)}</h3><p>Import a statement or pick another year.</p></div></div>;
    }
    const rate = full.savingsRate;
    return (
        <div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <Stat label="Income" value={money(full.income)} color="var(--success)" sub={cmp.hasPrevious ? `${pctText(cmp.delta.incomePct)} vs ${fyLabel(fy - 1, startMonth)}${cmp.partial ? ` (first ${cmp.monthsCompared} months)` : ''}` : null} />
                <Stat label="Spending" value={money(full.expense)} color="var(--danger)" sub={cmp.hasPrevious ? `${pctText(cmp.delta.expensePct)} vs ${fyLabel(fy - 1, startMonth)}${cmp.partial ? ` (first ${cmp.monthsCompared} months)` : ''}` : null} />
                <Stat label="Saved" value={money(full.savings)} color={full.savings >= 0 ? 'var(--success)' : 'var(--danger)'} />
                <Stat label="Savings rate" value={rate === null ? '—' : `${(rate * 100).toFixed(0)}%`} sub={rate === null ? 'No income recorded' : null} />
            </div>

            <div className="section-card" style={{ marginBottom: '16px' }}>
                <div className="section-card-title">Month by month <span style={{ fontWeight: 500, fontSize: '0.75rem', color: 'var(--text-muted)' }}> · <span style={{ color: 'var(--success)' }}>■</span> income <span style={{ color: 'var(--danger)' }}>■</span> spending</span></div>
                <MonthlyBars months={full.months} money={money} />
            </div>

            <div className="section-card">
                <div className="section-card-title">Where it went</div>
                {full.parents.map((p) => {
                    const subs = full.categories.filter((c) => (c.category.includes(' - ') ? c.category.split(' - ')[0] : 'Others') === p.parent);
                    return (
                        <div key={p.parent} style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '0.84rem', cursor: 'pointer' }} onClick={() => setOpen(open === p.parent ? null : p.parent)}>
                                <span style={{ fontWeight: 600 }}>{open === p.parent ? '▾' : '▸'} {p.parent}</span>
                                <span>{money(p.total)} <span style={{ color: 'var(--text-muted)' }}>· {(p.share * 100).toFixed(0)}%</span></span>
                            </div>
                            <div style={{ height: '6px', background: 'var(--border-color, #E2E8F0)', borderRadius: '3px', marginTop: '3px' }}>
                                <div style={{ width: `${Math.max(1, p.share * 100)}%`, height: '100%', background: 'var(--primary, #6558D3)', borderRadius: '3px' }} />
                            </div>
                            {open === p.parent && (
                                <div style={{ margin: '6px 0 4px 16px', fontSize: '0.8rem' }}>
                                    {subs.map((c) => (
                                        <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', color: 'var(--text-muted)' }}>
                                            <span>{c.category.includes(' - ') ? c.category.split(' - ')[1] : c.category} ({c.count})</span><span>{money(c.total)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// ───────────────────────── Card costs ─────────────────────────
const CardCostsTab = ({ transactions, fy, startMonth, money, fmtDate }) => {
    const range = fyRange(fy, startMonth);
    const costs = React.useMemo(() => cardCosts(transactions, { from: range.start, to: range.end }), [transactions, range.start, range.end]);
    if (costs.count === 0) {
        return <div className="empty-state"><div className="empty-state-text"><h3>No fees or interest found in {fyLabel(fy, startMonth)} 🎉</h3><p>Finance charges, late fees, forex markup and GST on fees would show up here.</p></div></div>;
    }
    return (
        <div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <Stat label={`Cost of money, ${fyLabel(fy, startMonth)}`} value={money(costs.total)} color="var(--danger)" sub={`${costs.count} charge${costs.count === 1 ? '' : 's'}`} />
                {costs.byBucket.map((b) => <Stat key={b.id} label={b.label} value={money(b.total)} sub={`${b.count} charge${b.count === 1 ? '' : 's'}`} />)}
            </div>
            <div className="section-card" style={{ marginBottom: '16px' }}>
                <div className="section-card-title">By account</div>
                {costs.byAccount.map((a) => <div key={a.account} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', padding: '3px 0' }}><span>{a.account}</span><strong>{money(a.total)}</strong></div>)}
            </div>
            <div className="section-card">
                <div className="section-card-title">Every charge</div>
                <div className="table-responsive">
                    <table className="table" style={{ fontSize: '0.8rem' }}>
                        <thead><tr><th>Date</th><th>Account</th><th>Narration</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                        <tbody>{costs.rows.map((r) => <tr key={r.id}><td style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.date)}</td><td>{r.account}</td><td>{r.narration}</td><td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{money(r.amount)}</td></tr>)}</tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

// ───────────────────────── Alerts ─────────────────────────
const AlertsTab = ({ transactions, todayIso, money, dateFormat }) => {
    const alerts = React.useMemo(() => buildAlerts(transactions, { todayIso }), [transactions, todayIso]);
    const [dismissed, setDismissed] = React.useState(() => {
        try { return JSON.parse(localStorage.getItem('dismissed_alerts') || '[]'); } catch (e) { return []; }
    });
    const keyOf = (a) => `${a.kind}|${a.txIds.join(',')}`;
    const visible = alerts.filter((a) => !dismissed.includes(keyOf(a)));
    const dismiss = (a) => {
        const next = [...dismissed, keyOf(a)];
        setDismissed(next);
        try { localStorage.setItem('dismissed_alerts', JSON.stringify(next.slice(-300))); } catch (e) { /* storage unavailable */ }
    };
    if (visible.length === 0) {
        return <div className="empty-state"><div className="empty-state-text"><h3>Nothing unusual 🎉</h3><p>Double charges, price changes on regular payments, unusually large spends and big payments to new payees show up here.</p></div></div>;
    }
    return (
        <div className="section-card">
            <div className="section-card-title">{visible.length} thing{visible.length === 1 ? '' : 's'} worth a look</div>
            {visible.map((a) => (
                <div key={keyOf(a)} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', padding: '8px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '1.1rem' }}>{a.severity === 'warning' ? '⚠️' : 'ℹ️'}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.88rem', wordBreak: 'break-word' }}>{localizeDatesInText(a.title, dateFormat)}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{maskNumbersInText(localizeDatesInText(a.detail, dateFormat))}</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => dismiss(a)}>It's fine</button>
                </div>
            ))}
        </div>
    );
};

// ───────────────────────── Forecast ─────────────────────────
const ForecastTab = ({ transactions, settings, todayIso, money, fmtDate }) => {
    const items = settings.networthItems || [];
    const autoStart = React.useMemo(() => items
        .filter((it) => it.includeInNetWorth !== false && (NET_WORTH_GROUPS.find((g) => g.key === it.category) || {}).kind === 'balance')
        .reduce((s, it) => s + getEffectiveNetWorthItemValue(it, settings.recurring || [], settings.billInstances || []), 0), [items, settings.recurring, settings.billInstances]);
    const [override, setOverride] = React.useState('');
    const [days, setDays] = React.useState(30);
    const [everyday, setEveryday] = React.useState(false);
    const start = override === '' ? autoStart : Number(override) || 0;
    const daily = React.useMemo(() => everydaySpendPerDay(transactions, { todayIso }), [transactions, todayIso]);

    const fc = React.useMemo(() => buildForecast({
        startBalance: start, recurring: (settings.recurring || []).filter(Boolean), billInstances: settings.billInstances || [], todayIso, days,
        nextOccurrence: (item, fromIso) => calculateNextExpectedDate(item, new Date(`${fromIso}T00:00:00`)) || '',
        everydayDaily: daily, includeEveryday: everyday
    }), [start, settings.recurring, settings.billInstances, todayIso, days, daily, everyday]);

    return (
        <div>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '14px' }}>
                <label style={{ fontSize: '0.78rem' }}>Starting balance (bank + cash)
                    <input className="form-control" type="number" placeholder={isPrivacyMasked() ? '••••' : String(Math.round(autoStart))} value={override} onChange={(e) => setOverride(e.target.value)} style={{ width: '180px' }} />
                </label>
                <label style={{ fontSize: '0.78rem' }}>Look ahead
                    <select className="form-control" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                        <option value={30}>30 days</option><option value={60}>60 days</option><option value={90}>90 days</option>
                    </select>
                </label>
                <label style={{ fontSize: '0.8rem', display: 'flex', gap: '6px', alignItems: 'center', cursor: 'pointer', paddingBottom: '8px' }}>
                    <input type="checkbox" checked={everyday} onChange={(e) => setEveryday(e.target.checked)} />
                    Include everyday spending (~{money(daily)}/day, last 90 days)
                </label>
            </div>
            {override === '' && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>Starting balance comes from your Net Worth "Bank Accounts" and "Cash" lines (kept current by statement imports): {money(autoStart)}.</p>}

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
                <Stat label="Money in (scheduled)" value={money(fc.totalIn)} color="var(--success)" />
                <Stat label="Money out (scheduled)" value={money(fc.totalOut)} color="var(--danger)" />
                <Stat label={`Balance on ${fmtDate(fc.series[fc.series.length - 1]?.date)}`} value={money(fc.endBalance)} color={fc.endBalance < 0 ? 'var(--danger)' : undefined} />
                <Stat label="Lowest point" value={money(fc.min?.balance ?? 0)} sub={fc.min ? fmtDate(fc.min.date) : ''} color={fc.goesNegative ? 'var(--danger)' : undefined} />
            </div>
            {fc.goesNegative && <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '10px 14px', fontSize: '0.84rem', color: '#991B1B', marginBottom: '14px' }}>⚠️ Scheduled payments take you below zero on {fmtDate(fc.min.date)}. Move money in before then, or check the bills below.</div>}

            <div className="section-card" style={{ marginBottom: '16px' }}>
                <div className="section-card-title">Projected balance</div>
                <BalanceLine series={fc.series} money={money} fmtDate={fmtDate} />
            </div>
            <div className="section-card">
                <div className="section-card-title">Scheduled payments & income</div>
                {fc.events.length === 0 ? <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: 0 }}>Nothing scheduled in this window. Add Recurring items, or import a card statement to schedule its due date.</p> : fc.events.map((e, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', fontSize: '0.84rem', padding: '4px 0', borderBottom: '1px solid var(--border-color)' }}>
                        <span>{fmtDate(e.date)} · {e.name}{e.overdue ? ' (overdue)' : ''}{e.source === 'bill' ? ' · exact bill' : ''}</span>
                        <strong style={{ color: e.direction === 'in' ? 'var(--success)' : 'var(--danger)' }}>{e.direction === 'in' ? '+' : '−'}{money(e.amount)}</strong>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ───────────────────────── Export ─────────────────────────
const ExportTab = ({ transactions, settings, todayIso, showToast }) => {
    const [filters, setFilters] = React.useState({ from: '', to: '', account: '', category: '', type: 'all' });
    const accounts = settings.accounts || [];
    const parents = [...new Set((settings.categories || []).map((c) => (c.includes(' - ') ? c.split(' - ')[0] : 'Others')))];
    const rows = React.useMemo(() => filterTransactions(transactions, filters), [transactions, filters]);
    const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));
    const quick = (from, to) => setFilters((f) => ({ ...f, from, to }));
    const { start, end } = fyRange(fyStartYear(todayIso, Number(settings.fyStartMonth) === 1 ? 1 : 4), Number(settings.fyStartMonth) === 1 ? 1 : 4);
    const prevFy = fyRange(fyStartYear(todayIso, Number(settings.fyStartMonth) === 1 ? 1 : 4) - 1, Number(settings.fyStartMonth) === 1 ? 1 : 4);

    return (
        <div className="section-card">
            <div className="section-card-title">Export to CSV (opens in Excel / Google Sheets)</div>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => quick(start, end)}>This financial year</button>
                <button className="btn btn-secondary btn-sm" onClick={() => quick(prevFy.start, prevFy.end)}>Last financial year</button>
                <button className="btn btn-secondary btn-sm" onClick={() => quick(addDays(todayIso, -29), todayIso)}>Last 30 days</button>
                <button className="btn btn-secondary btn-sm" onClick={() => quick('', '')}>All time</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                <label style={{ fontSize: '0.76rem' }}>From
                    <DatePickerField value={filters.from} onChange={(v) => setFilters((f) => ({ ...f, from: v }))} dateFormat={settings.dateFormat} label="Any date" />
                </label>
                <label style={{ fontSize: '0.76rem' }}>To
                    <DatePickerField value={filters.to} onChange={(v) => setFilters((f) => ({ ...f, to: v }))} dateFormat={settings.dateFormat} label="Any date" />
                </label>
                <label style={{ fontSize: '0.76rem' }}>Account
                    <select className="form-control" value={filters.account} onChange={set('account')}><option value="">All accounts</option>{accounts.map((a) => <option key={a} value={a}>{a}</option>)}</select>
                </label>
                <label style={{ fontSize: '0.76rem' }}>Category group
                    <select className="form-control" value={filters.category} onChange={set('category')}><option value="">All categories</option>{parents.map((p) => <option key={p} value={p}>{p}</option>)}</select>
                </label>
                <label style={{ fontSize: '0.76rem' }}>Type
                    <select className="form-control" value={filters.type} onChange={set('type')}><option value="all">All</option><option value="expense">Expenses</option><option value="income">Income</option><option value="neutral">Transfers</option></select>
                </label>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                <button className="btn btn-primary" disabled={rows.length === 0} onClick={() => { download(`financials-transactions-${todayIso}.csv`, transactionsToCSV(rows)); showToast(`Exported ${rows.length} transactions`); }}>
                    Download {rows.length} transaction{rows.length === 1 ? '' : 's'}
                </button>
                <button className="btn btn-secondary" disabled={!(settings.statements || []).length} onClick={() => { download(`financials-statements-${todayIso}.csv`, statementsToCSV(settings.statements || [])); showToast('Exported statement history'); }}>
                    Download statement history
                </button>
            </div>
            <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '12px 0 0' }}>
                The file stays on your device. It has Debit, Credit and Transfer columns so card payments and moves between your own accounts don't inflate totals.
                For a full backup you can restore later, use Settings → Backup.
            </p>
        </div>
    );
};
