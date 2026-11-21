import React from 'react';
import {
    Icon, formatCurrencyVal, filterTransactionsByPeriod, formatDate,
    ModernDateFilterPicker, PeriodSelectOptions, getContrastTextColor,
    formatCategorySubIconFirst, calculatePeriodDateRange, getCurrencySymbol,
    getOccurrencesInPeriod, NET_WORTH_GROUPS, getAnchorDayOfMonth, getAnchorDayForRecurring,
    shiftDateByCadence, netWorthMonthsPerCycle, DatePickerField, useEscapeKey
} from '../utils.jsx';
import { updateTransactionInDB, deleteTransactionFromDB, saveTransactionsInDB, saveTagInDB } from '../store.js';
import { LogBillInstanceModal } from '../components/modals/PlanningModals.jsx';
import { AddEntryModal } from '../components/modals/TransactionModals.jsx';

import { stripTrailingBrackets } from '../services/importDedupe.js';

// A payment linked to a recurring item is shown by that item's name (readable); the bank's own text goes underneath.
const nameParts = (tx, recurring = []) => {
    const rec = tx && tx.linkedRecurringId ? (recurring || []).find(r => r && r.id === tx.linkedRecurringId) : null;
    const raw = tx?.merchant || tx?.narration || "";
    if (!rec || !rec.name) return { title: raw || "Transaction", sub: "" };
    const bank = stripTrailingBrackets(raw);
    const same = bank.trim().toLowerCase() === rec.name.trim().toLowerCase();
    return { title: rec.name, sub: same ? "" : bank };
};

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

export const DashboardPage = ({ transactions, allTransactions, settings, setActivePage, updateSetting, loadState, showToast, setTxCategoryFilter, onViewCategoryTransactions, tags, onAddTag, onAddTransactions }) => {
    const expenseTx = transactions.filter(t => t.type === "expense");
    const incomeTx = transactions.filter(t => t.type === "income");
    const fullTx = allTransactions || transactions;
    const [selectedDay, setSelectedDay] = React.useState(null);
    const [calendarViewDate, setCalendarViewDate] = React.useState(new Date());

    // Income & Spending sums
    const incomeSum = incomeTx.reduce((s, t) => s + t.amount, 0);
    const spendingSum = expenseTx.reduce((s, t) => s + t.amount, 0);
    const formatCurrency = (val) => formatCurrencyVal(val, settings.currency || "INR");

    // Calculate main category breakdown, transaction counts, and subcategory mappings
    const mainCategoryBreakdown = {};
    const mainCategoryTxCounts = {};
    const subcategoryMap = {};

    expenseTx.forEach(t => {
        const fullCat = t.category || "Uncategorized";
        const mainCat = fullCat.includes(" - ") ? fullCat.split(" - ")[0] : fullCat;

        mainCategoryBreakdown[mainCat] = (mainCategoryBreakdown[mainCat] || 0) + t.amount;
        mainCategoryTxCounts[mainCat] = (mainCategoryTxCounts[mainCat] || 0) + 1;

        if (!subcategoryMap[mainCat]) subcategoryMap[mainCat] = {};
        if (!subcategoryMap[mainCat][fullCat]) {
            subcategoryMap[mainCat][fullCat] = { amount: 0, count: 0 };
        }
        subcategoryMap[mainCat][fullCat].amount += t.amount;
        subcategoryMap[mainCat][fullCat].count += 1;
    });

    // Sort transactions: newest 5
    const recentTx = [...transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Calendar & Payments Row */}
            <div className="content-columns" style={{ margin: 0, gridTemplateColumns: '2fr 3fr', gap: '16px' }}>
                <PaymentsCalendarWidget
                    settings={settings}
                    transactions={fullTx}
                    selectedDay={selectedDay}
                    setSelectedDay={setSelectedDay}
                    viewDate={calendarViewDate}
                    setViewDate={setCalendarViewDate}
                />
                <PaymentsSectionWidget
                    settings={settings}
                    transactions={fullTx}
                    tags={tags}
                    onAddTag={onAddTag}
                    onAddTransactions={onAddTransactions}
                    updateSetting={updateSetting}
                    loadState={loadState}
                    showToast={showToast}
                    selectedDay={selectedDay}
                    setSelectedDay={setSelectedDay}
                    viewDate={calendarViewDate}
                />
            </div>

            {/* Expanded Category Spending Breakdown Section */}
            <div className="section-card" style={{ background: 'var(--card-bg)', margin: 0, padding: '24px' }}>
                <CategoryDonutSvgChart
                    mainBreakdown={mainCategoryBreakdown}
                    mainTxCounts={mainCategoryTxCounts}
                    subBreakdownMap={subcategoryMap}
                    total={spendingSum}
                    settings={settings}
                    onViewTransactions={(catName) => {
                        if (onViewCategoryTransactions) {
                            onViewCategoryTransactions(catName);
                        } else {
                            if (setTxCategoryFilter) setTxCategoryFilter([catName]);
                            if (setActivePage) setActivePage("transactions");
                        }
                    }}
                />
            </div>

            {/* Financial Intelligence & Smart Insights Bar */}
            <FinancialInsightsPanel
                transactions={transactions}
                settings={settings}
                setActivePage={setActivePage}
            />

            {/* Recent Activities Section */}
            <div className="section-card">
                <div className="section-card-title">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Icon name="transactions" /> Recent Activities
                    </span>
                    <button className="btn btn-secondary btn-sm" onClick={() => setActivePage("transactions")}>View All</button>
                </div>
                {recentTx.length === 0 ? (
                    <div className="empty-state">
                        <Icon name="transactions" currency={settings.currency} />
                        <div className="empty-state-text">
                            <h3>Empty Registry</h3>
                            <p>No transactions registered for the selected period.</p>
                        </div>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table" style={{ margin: 0 }}>
                            <thead>
                                <tr>
                                    <th>Merchant</th>
                                    <th>Category</th>
                                    <th>Date</th>
                                    <th style={{ textAlign: 'right' }}>Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentTx.map(t => {
                                    const firstChar = (t.merchant || "T").trim().charAt(0).toUpperCase();
                                    return (
                                        <tr key={t.id} style={{ transition: 'background-color 0.15s ease' }}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div className="merchant-avatar" style={{
                                                        background: t.type === "income"
                                                            ? "linear-gradient(135deg, #10B981 0%, #059669 100%)"
                                                            : "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)"
                                                    }}>
                                                        {firstChar}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 600, color: 'var(--text-main)' }}>{nameParts(t, settings.recurring).title}</div>
                                                        {nameParts(t, settings.recurring).sub && (
                                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.merchant}>{nameParts(t, settings.recurring).sub}</div>
                                                        )}
                                                        {t.paymentMode && (
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.paymentMode}</div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td>
                                                <span className="badge" style={{ backgroundColor: 'var(--bg-color)', color: 'var(--text-main)', border: '1px solid var(--border-color)', fontWeight: 500 }}>
                                                    {t.category}
                                                </span>
                                            </td>
                                            <td style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                                {formatDate(t.date, settings.dateFormat)}
                                            </td>
                                            <td style={{ textAlign: 'right', fontWeight: 700, fontSize: '0.95rem', color: t.type === "neutral" ? "var(--info)" : (t.type === "income" ? "var(--success)" : "var(--danger)") }}>
                                                {t.type === "neutral" ? (t.neutralSign === "-" ? "-" : "+") : (t.type === "income" ? "+" : "-")}{formatCurrency(t.amount)}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: Comprehensive Financial Intelligence Panel ---
const FinancialInsightsPanel = ({ transactions, settings, setActivePage }) => {
    const formatCurrency = (val) => formatCurrencyVal(val, settings.currency || "INR");

    const expenseTx = transactions.filter(t => t.type === "expense");
    const incomeTx = transactions.filter(t => t.type === "income");

    const incomeSum = incomeTx.reduce((s, t) => s + t.amount, 0);
    const spendingSum = expenseTx.reduce((s, t) => s + t.amount, 0);
    const netCashFlow = incomeSum - spendingSum;
    const savingsRate = incomeSum > 0 ? ((netCashFlow / incomeSum) * 100) : 0;

    // Needs review count
    const needsReviewCount = transactions.filter(t => t.category === "Needs review").length;

    // Daily spend velocity calculation
    const now = new Date();
    const currentDay = Math.max(1, now.getDate());
    const dailySpend = spendingSum > 0 ? spendingSum / currentDay : 0;

    // Top spending category analysis
    const categoryTotals = {};
    expenseTx.forEach(t => {
        categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
    });
    const topCategoryKey = Object.keys(categoryTotals).sort((a, b) => categoryTotals[b] - categoryTotals[a])[0];
    const topCategoryAmount = topCategoryKey ? categoryTotals[topCategoryKey] : 0;
    const topCategoryPct = spendingSum > 0 ? Math.round((topCategoryAmount / spendingSum) * 100) : 0;

    // Largest single transaction
    const largestTx = [...expenseTx].sort((a, b) => b.amount - a.amount)[0];

    // Savings rate status grade
    let savingsGrade = { label: "No Income", color: "var(--text-muted)", bg: "var(--bg-color)" };
    if (incomeSum > 0) {
        if (savingsRate >= 30) savingsGrade = { label: "Excellent Savings", color: "#059669", bg: "#ECFDF5" };
        else if (savingsRate >= 15) savingsGrade = { label: "Healthy Savings", color: "#2563EB", bg: "#EFF6FF" };
        else if (savingsRate >= 0) savingsGrade = { label: "Tight Cash Flow", color: "#D97706", bg: "#FFFBEB" };
        else savingsGrade = { label: "Deficit Spending", color: "#DC2626", bg: "#FEF2F2" };
    }

    return (
        <div className="section-card" style={{ background: 'var(--card-bg)' }}>
            <div className="section-card-title">
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Icon name="sparkles" /> Financial Intelligence & Insights
                </span>
                {needsReviewCount > 0 ? (
                    <button
                        className="dashboard-badge-pill"
                        style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FCD34D', cursor: 'pointer' }}
                        onClick={() => setActivePage("transactions")}
                    >
                        <Icon name="alert" /> {needsReviewCount} item{needsReviewCount > 1 ? 's' : ''} to review
                    </button>
                ) : (
                    <span className="dashboard-badge-pill" style={{ background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0' }}>
                        <Icon name="check" /> Books Clean
                    </span>
                )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>

                {/* Metric 1: Financial Health & Savings Rate */}
                <div className="insight-metric-card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Savings Grade
                        </span>
                        <span className="dashboard-badge-pill" style={{ background: savingsGrade.bg, color: savingsGrade.color }}>
                            {savingsGrade.label}
                        </span>
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                        {savingsRate.toFixed(1)}%
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {netCashFlow >= 0 ? `+${formatCurrency(netCashFlow)} retained` : `${formatCurrency(Math.abs(netCashFlow))} overspent`}
                    </div>
                </div>

                {/* Metric 2: Spend Velocity / Daily Pace */}
                <div className="insight-metric-card">
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                        Daily Burn Rate
                    </div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px' }}>
                        {formatCurrency(dailySpend)}<span style={{ fontSize: '0.85rem', fontWeight: 500, color: 'var(--text-muted)' }}>/day</span>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Over {currentDay} elapsed days this period
                    </div>
                </div>

                {/* Metric 3: Top Expense Concentration */}
                <div className="insight-metric-card">
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                        Top Category
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {topCategoryKey || "None"}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {topCategoryKey ? `${formatCurrency(topCategoryAmount)} (${topCategoryPct}% of total)` : 'No expense data'}
                    </div>
                </div>

                {/* Metric 4: Peak Single Transaction */}
                <div className="insight-metric-card">
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                        Peak Transaction
                    </div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--danger)', marginBottom: '4px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {largestTx ? formatCurrency(largestTx.amount) : "₹0"}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {largestTx ? `${largestTx.merchant}` : "No expenses"}
                    </div>
                </div>

            </div>
        </div>
    );
};

// --- SHARED DATE HELPERS FOR PAYMENTS WIDGETS ---
// (getAnchorDayOfMonth / getAnchorDayForRecurring live in utils.jsx)
const toYYYYMMDD = (dStr) => {
    if (!dStr) return "";
    if (dStr instanceof Date) {
        const y = dStr.getFullYear();
        const m = String(dStr.getMonth() + 1).padStart(2, '0');
        const day = String(dStr.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }
    const str = String(dStr).trim();
    const ymd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymd) {
        return `${ymd[1]}-${String(parseInt(ymd[2], 10)).padStart(2, '0')}-${String(parseInt(ymd[3], 10)).padStart(2, '0')}`;
    }
    const dmy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (dmy) {
        let p1 = parseInt(dmy[1], 10), p2 = parseInt(dmy[2], 10), p3 = parseInt(dmy[3], 10);
        if (p3 < 100) p3 += 2000;
        let day = p1 > 12 ? p1 : (p2 > 12 ? p2 : p1);
        let month = p1 > 12 ? p2 : (p2 > 12 ? p1 : p2);
        return `${p3}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    const d = new Date(str);
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

const getMainCategory = (cat) => {
    if (!cat) return "";
    const str = String(cat).trim();
    return str.includes(" - ") ? str.split(" - ")[0].trim() : str;
};

const getDueDateInMonth = (anchorDay, viewYear, viewMonth) => {
    const maxDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    const day = anchorDay === 'last' ? maxDays : Math.min(Math.max(Number(anchorDay) || 1, 1), maxDays);
    const m = String(viewMonth + 1).padStart(2, '0');
    const d = String(day).padStart(2, '0');
    return `${viewYear}-${m}-${d}`;
};

const isRecurringPaidOnDate = ({
    recurringItem,
    targetDateStr,
    viewMonthPrefix,
    transactions,
    billInstances
}) => {
    if (!recurringItem || !targetDateStr) return false;
    const targetMonth = targetDateStr.slice(0, 7);
    const monthPrefix = viewMonthPrefix || targetMonth;
    const targetObj = new Date(targetDateStr + "T00:00:00");

    // 1. Check bill instances
    const billInsts = (billInstances || []).filter(b => b && b.recurringId === recurringItem.id);
    const monthBillInst = billInsts.find(b => b.dueDate && (b.dueDate === targetDateStr || b.dueDate.startsWith(monthPrefix)));
    if (monthBillInst) {
        if (monthBillInst.status === 'paid') {
            // Verify that a corresponding payment transaction actually exists in transactions
            const hasBackingTx = (transactions || []).some(t => {
                if (!t || t.pendingMapping) return false;
                if (monthBillInst.linkedTxId && t.id === monthBillInst.linkedTxId) {
                    return true;
                }
                const isLinked = (t.linkedRecurringId === recurringItem.id);
                const isNameMatch = Boolean(t.merchant && recurringItem.name && t.merchant.trim().toLowerCase() === recurringItem.name.trim().toLowerCase());
                if (!isLinked && !isNameMatch) return false;
                if (t.scheduledDate) {
                    return t.scheduledDate === targetDateStr || t.scheduledDate.startsWith(monthPrefix);
                }
                const tDate = toYYYYMMDD(t.date);
                return tDate && tDate.startsWith(monthPrefix);
            });
            if (hasBackingTx) {
                return true;
            }
            // If no backing transaction exists (e.g. was deleted), do not treat as paid!
        } else {
            return false;
        }
    }

    // 2. Check transactions
    const flexDays = Number(recurringItem.dateFlexDays) || 0;
    const targetAmt = Math.abs(Number(recurringItem.estimatedAmount || recurringItem.amount || 0));

    const matchingTxs = (transactions || []).filter(t => {
        if (!t || t.pendingMapping) return false;
        const tDate = toYYYYMMDD(t.date);
        if (!tDate) return false;

        const isLinked = (t.linkedRecurringId === recurringItem.id);
        const isNameMatch = Boolean(t.merchant && recurringItem.name && t.merchant.trim().toLowerCase() === recurringItem.name.trim().toLowerCase());
        const isCatMatch = Boolean(flexDays > 0 && t.category && recurringItem.category && t.category === recurringItem.category);

        if (!isLinked && !isNameMatch && !isCatMatch) return false;

        // If transaction has an explicit scheduledDate, it must match this target date or month
        if (t.scheduledDate) {
            return t.scheduledDate === targetDateStr || t.scheduledDate.startsWith(monthPrefix);
        }

        const txTs = new Date(tDate + "T00:00:00").getTime();
        const diffDays = Math.abs(txTs - targetObj.getTime()) / (1000 * 60 * 60 * 24);

        if (flexDays > 0) {
            return diffDays <= flexDays;
        }

        // flexDays === 0:
        // Must be in the same month cycle
        if (tDate.startsWith(monthPrefix)) return true;

        // Or if explicitly linked by user (isLinked):
        // Allow within 20 days IF this target date is in the past relative to nextDate (e.g. user marked past month paid with early tx)
        if (isLinked && diffDays <= 20) {
            if (recurringItem.nextDate && targetDateStr < recurringItem.nextDate) {
                return true;
            }
        }

        return false;
    });

    if (matchingTxs.length === 0) return false;
    if (targetAmt > 0) {
        const allHaveAmount = matchingTxs.every(t => t.amount !== undefined && t.amount !== null);
        if (allHaveAmount) {
            const matchingSum = matchingTxs.reduce((acc, t) => acc + Math.abs(Number(t.amount || 0)), 0);
            return matchingSum >= targetAmt - 0.01;
        }
    }
    return true;
};

const isNetWorthPaidOnDate = ({
    networthItem,
    targetDateStr,
    viewMonthPrefix,
    transactions
}) => {
    if (!networthItem || !targetDateStr) return false;
    const targetMonth = targetDateStr.slice(0, 7);
    const monthPrefix = viewMonthPrefix || targetMonth;
    const targetObj = new Date(targetDateStr + "T00:00:00");

    return (transactions || []).some(t => {
        if (!t || t.pendingMapping) return false;
        const tDate = toYYYYMMDD(t.date);
        if (!tDate) return false;

        const isLinked = (t.linkedRecurringId === networthItem.id);
        const isNameMatch = Boolean(t.merchant && networthItem.name && t.merchant.trim().toLowerCase() === networthItem.name.trim().toLowerCase());

        if (!isLinked && !isNameMatch) return false;

        if (t.scheduledDate) {
            return t.scheduledDate === targetDateStr || t.scheduledDate.startsWith(monthPrefix);
        }

        if (tDate.startsWith(monthPrefix)) return true;

        const txTs = new Date(tDate + "T00:00:00").getTime();
        const diffDays = Math.abs(txTs - targetObj.getTime()) / (1000 * 60 * 60 * 24);

        if (isLinked && diffDays <= 20) {
            if (networthItem.nextDueDate && targetDateStr < networthItem.nextDueDate) {
                return true;
            }
        }

        return false;
    });
};

// --- SUB-COMPONENT: Calendar widget for the Dashboard ---
const PaymentsCalendarWidget = ({ settings, transactions, selectedDay, setSelectedDay, viewDate, setViewDate }) => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();

    const dueItems = React.useMemo(() => {
        const items = [];
        const calNow = new Date();
        const calTodayStr = `${calNow.getFullYear()}-${String(calNow.getMonth() + 1).padStart(2, '0')}-${String(calNow.getDate()).padStart(2, '0')}`;
        const viewMonthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
        const viewMonthStartStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
        const daysInViewMonth = new Date(year, month + 1, 0).getDate();
        const viewMonthEndStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(daysInViewMonth).padStart(2, '0')}`;

        (settings.recurring || []).forEach(r => {
            if (r.active === false || (r.endDate && r.endDate < calTodayStr)) return;

            // Only show item if it actually occurs in this view month according to its cadence
            if (getOccurrencesInPeriod(r, viewMonthStartStr, viewMonthEndStr) <= 0) return;

            const billInstancesForR = (settings.billInstances || []).filter(b => b.recurringId === r.id);
            const currentMonthBillInst = billInstancesForR.find(b => b.dueDate && b.dueDate.startsWith(viewMonthPrefix));

            const anchorDay = getAnchorDayForRecurring(r);
            const itemDueDateStr = currentMonthBillInst ? currentMonthBillInst.dueDate : getDueDateInMonth(anchorDay, year, month);

            if (r.startDate && itemDueDateStr < r.startDate) return;
            if (r.endDate && itemDueDateStr > r.endDate) return;

            // Check if already paid in this view month
            const isPaid = isRecurringPaidOnDate({
                recurringItem: r,
                targetDateStr: itemDueDateStr,
                viewMonthPrefix,
                transactions,
                billInstances: settings.billInstances
            });

            if (!isPaid) {
                items.push({ date: itemDueDateStr });
            }
        });

        (settings.networthItems || []).forEach(it => {
            if (!it.nextDueDate) return;
            const anchorDay = getAnchorDayOfMonth(it.nextDueDate);
            const itemDueDateStr = getDueDateInMonth(anchorDay, year, month);

            const isPaid = isNetWorthPaidOnDate({
                networthItem: it,
                targetDateStr: itemDueDateStr,
                viewMonthPrefix,
                transactions
            });

            if (!isPaid) {
                items.push({ date: itemDueDateStr });
            }
        });
        return items.filter(i => !isNaN(new Date(i.date).getTime()));
    }, [settings.recurring, settings.billInstances, settings.networthItems, transactions, year, month]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yearOptions = React.useMemo(() => {
        const list = [];
        for (let y = 1970; y <= 2100; y++) {
            list.push(y);
        }
        return list;
    }, []);

    // Month grid calculation (starting from Monday)
    const firstDay = new Date(year, month, 1);
    // Sunday = 0 -> offset 6, Monday = 1 -> offset 0, Tue = 2 -> offset 1, etc.
    const startOffset = (firstDay.getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    while (cells.length < 42) cells.push(null);

    const dueDaysInMonthMap = {};
    dueItems.forEach(i => {
        const d = new Date(i.date);
        if (d.getFullYear() === year && d.getMonth() === month) {
            const dayNum = d.getDate();
            dueDaysInMonthMap[dayNum] = (dueDaysInMonthMap[dayNum] || 0) + 1;
        }
    });

    return (
        <div className="section-card" style={{ background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)' }}>
            {/* Mini Month Calendar Header & Grid */}
            <div style={{ background: 'var(--bg-color)', padding: '12px', borderRadius: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', position: 'relative', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Previous Month"
                            onClick={() => {
                                setViewDate(new Date(year, month - 1, 1));
                                setSelectedDay(null);
                            }}>
                            <Icon name="chevronLeft" />
                        </button>
                        <select
                            className="btn btn-secondary btn-sm"
                            style={{
                                width: '115px',
                                fontWeight: 600,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                MozAppearance: 'none',
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 8px center',
                                paddingRight: '22px',
                                paddingLeft: '10px',
                                textAlign: 'center'
                            }}
                            value={month}
                            onChange={(e) => {
                                const newMonth = parseInt(e.target.value, 10);
                                setViewDate(new Date(year, newMonth, 1));
                                setSelectedDay(null);
                            }}
                        >
                            {MONTHS.map((m, idx) => (
                                <option key={idx} value={idx}>{m}</option>
                            ))}
                        </select>
                        <select
                            className="btn btn-secondary btn-sm"
                            style={{
                                width: '80px',
                                fontWeight: 600,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                appearance: 'none',
                                WebkitAppearance: 'none',
                                MozAppearance: 'none',
                                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23475569' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: 'right 8px center',
                                paddingRight: '20px',
                                paddingLeft: '10px',
                                textAlign: 'center'
                            }}
                            value={year}
                            onChange={(e) => {
                                const newYear = parseInt(e.target.value, 10);
                                setViewDate(new Date(newYear, month, 1));
                                setSelectedDay(null);
                            }}
                        >
                            {yearOptions.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>
                        <button className="btn btn-secondary btn-sm" style={{ padding: '3px 8px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            title="Next Month"
                            onClick={() => {
                                setViewDate(new Date(year, month + 1, 1));
                                setSelectedDay(null);
                            }}>
                            <Icon name="chevronRight" />
                        </button>
                    </div>
                    <button className={`btn btn-sm ${selectedDay ? 'btn-primary' : 'btn-secondary'}`} style={{ position: 'absolute', right: 0, fontSize: '0.75rem', padding: '2px 10px', height: '32px', fontWeight: 600 }}
                        title={selectedDay ? "View full month" : "Select today's date"}
                        onClick={() => {
                            if (selectedDay) {
                                setSelectedDay(null);
                            } else {
                                const now = new Date();
                                setViewDate(now);
                                setSelectedDay(now);
                            }
                        }}>
                        {selectedDay ? 'Month' : 'Today'}
                    </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '6px', textAlign: 'center' }}>
                    {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, idx) => (
                        <div key={idx} className="cal-day-header">{d}</div>
                    ))}
                    {cells.map((d, idx) => {
                        if (!d) {
                            return <div key={idx} className="cal-tile-empty">&nbsp;</div>;
                        }
                        const cellDate = new Date(year, month, d);
                        const isToday = cellDate.toDateString() === today.toDateString();
                        const dueCount = dueDaysInMonthMap[d] || 0;
                        const isSelected = selectedDay && cellDate.toDateString() === selectedDay.toDateString();

                        let tileClass = "cal-tile";
                        if (isSelected) tileClass += " cal-tile-selected";
                        else if (isToday) tileClass += " cal-tile-today";

                        return (
                            <div
                                key={idx}
                                className={tileClass}
                                onClick={() => {
                                    if (isSelected) {
                                        setSelectedDay(null);
                                    } else {
                                        setSelectedDay(cellDate);
                                    }
                                }}
                            >
                                {d}
                                {dueCount > 0 && (
                                    <span className="cal-due-badge">
                                        {dueCount}
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>
    );
};

// --- SUB-COMPONENT: Payments section with Upcoming, Overdue, and Paid filters ---
const PaymentsSectionWidget = ({ settings, transactions, updateSetting, loadState, showToast, selectedDay, setSelectedDay, viewDate, tags, onAddTag, onAddTransactions }) => {
    const [filter, setFilter] = React.useState("upcoming");
    const [markPaidModalItem, setMarkPaidModalItem] = React.useState(null);
    const [loggingBillItem, setLoggingBillItem] = React.useState(null);
    const [selectedTxIdToLink, setSelectedTxIdToLink] = React.useState(null);
    const [isMappingMode, setIsMappingMode] = React.useState(false);
    const [selectedMapTxIds, setSelectedMapTxIds] = React.useState([]);
    const [newTxModalData, setNewTxModalData] = React.useState(null);
    const [unmarkConfirmItem, setUnmarkConfirmItem] = React.useState(null);
    const [unmarkLinkedTxs, setUnmarkLinkedTxs] = React.useState([]);
    const [createdDateOption, setCreatedDateOption] = React.useState("due_date");
    const [customCreatedDate, setCustomCreatedDate] = React.useState("");
    const [sessionCreatedTxIds, setSessionCreatedTxIds] = React.useState([]);
    const sessionCreatedTxIdsRef = React.useRef(sessionCreatedTxIds);
    sessionCreatedTxIdsRef.current = sessionCreatedTxIds;

    React.useEffect(() => {
        return () => {
            if (sessionCreatedTxIdsRef.current && sessionCreatedTxIdsRef.current.length > 0) {
                for (const id of sessionCreatedTxIdsRef.current) {
                    deleteTransactionFromDB(id);
                }
            }
        };
    }, []);

    // Self-heal: automatically remove orphaned bill instances marked 'paid' whose backing transaction was deleted
    React.useEffect(() => {
        if (!settings.billInstances || settings.billInstances.length === 0) return;
        const orphaned = settings.billInstances.filter(b => {
            if (b.status !== 'paid') return false;
            if (b.linkedTxId) {
                return !(transactions || []).some(t => t && t.id === b.linkedTxId);
            }
            return !(transactions || []).some(t => {
                if (!t || t.linkedRecurringId !== b.recurringId) return false;
                const sched = t.scheduledDate || t.date;
                return b.dueDate === sched || (sched && b.dueDate && b.dueDate.startsWith(sched.slice(0, 7)));
            });
        });
        if (orphaned.length > 0 && typeof updateSetting === 'function') {
            const cleaned = settings.billInstances.filter(b => !orphaned.includes(b));
            updateSetting("billInstances", cleaned);
        }
    }, [transactions, settings.billInstances]);

    const handleSaveBillInstance = async (billInst) => {
        const existing = settings.billInstances || [];
        const filtered = existing.filter(b => !(b.id === billInst.id || (b.recurringId === billInst.recurringId && b.dueDate === billInst.dueDate && b.status === 'pending')));
        if (updateSetting) await updateSetting("billInstances", [...filtered, billInst]);
        if (settings?.networthItems && updateSetting) {
            const networthList = settings.networthItems || [];
            const hasLinked = networthList.some(nw => nw.linkedRecurringId === billInst.recurringId && nw.syncMode !== "amortizing" && nw.syncMode !== "loan_principal" && nw.syncMode !== "sip" && nw.syncMode !== "investment_sip");
            if (hasLinked) {
                const updatedNwList = networthList.map(nw => {
                    if (nw.linkedRecurringId === billInst.recurringId && nw.syncMode !== "amortizing" && nw.syncMode !== "loan_principal" && nw.syncMode !== "sip" && nw.syncMode !== "investment_sip") {
                        return { ...nw, value: Number(billInst.amount) };
                    }
                    return nw;
                });
                await updateSetting("networthItems", updatedNwList);
            }
        }
        if (typeof loadState === 'function') await loadState();
        if (typeof showToast === 'function') showToast(`Logged bill for "${billInst.name}"`);
        setLoggingBillItem(null);
    };

    const handleClearBillInstance = async (recurringId, instanceId) => {
        const existing = settings.billInstances || [];
        const filtered = existing.filter(b => {
            if (instanceId) return b.id !== instanceId;
            return !(b.recurringId === recurringId && b.status === 'pending');
        });
        if (updateSetting) await updateSetting("billInstances", filtered);
        if (settings?.networthItems && updateSetting) {
            const networthList = settings.networthItems || [];
            const linkedRec = (settings?.recurring || []).find(r => r.id === recurringId);
            const fallbackAmt = Number(linkedRec?.estimatedAmount || linkedRec?.amount || 0);
            const hasLinked = networthList.some(nw => nw.linkedRecurringId === recurringId && nw.syncMode !== "amortizing" && nw.syncMode !== "loan_principal" && nw.syncMode !== "sip" && nw.syncMode !== "investment_sip");
            if (hasLinked) {
                const updatedNwList = networthList.map(nw => {
                    if (nw.linkedRecurringId === recurringId && nw.syncMode !== "amortizing" && nw.syncMode !== "loan_principal" && nw.syncMode !== "sip" && nw.syncMode !== "investment_sip") {
                        return { ...nw, value: fallbackAmt };
                    }
                    return nw;
                });
                await updateSetting("networthItems", updatedNwList);
            }
        }
        if (typeof loadState === 'function') await loadState();
        if (typeof showToast === 'function') showToast(`Cleared logged bill for "${loggingBillItem?.name || 'Item'}"`);
        setLoggingBillItem(null);
    };

    const formatCurrency = (val) => formatCurrencyVal(val, settings.currency || "INR");

    const toYYYYMMDD = (dStr) => {
        if (!dStr) return "";
        if (dStr instanceof Date) {
            const y = dStr.getFullYear();
            const m = String(dStr.getMonth() + 1).padStart(2, '0');
            const day = String(dStr.getDate()).padStart(2, '0');
            return `${y}-${m}-${day}`;
        }
        const str = String(dStr).trim();
        const ymd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
        if (ymd) {
            return `${ymd[1]}-${String(parseInt(ymd[2], 10)).padStart(2, '0')}-${String(parseInt(ymd[3], 10)).padStart(2, '0')}`;
        }
        const dmy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
        if (dmy) {
            let p1 = parseInt(dmy[1], 10), p2 = parseInt(dmy[2], 10), p3 = parseInt(dmy[3], 10);
            if (p3 < 100) p3 += 2000;
            let day = p1 > 12 ? p1 : (p2 > 12 ? p2 : p1);
            let month = p1 > 12 ? p2 : (p2 > 12 ? p1 : p2);
            return `${p3}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        }
        const d = new Date(str);
        if (isNaN(d.getTime())) return "";
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const calNow = new Date();
    const todayStr = `${calNow.getFullYear()}-${String(calNow.getMonth() + 1).padStart(2, '0')}-${String(calNow.getDate()).padStart(2, '0')}`;
    const todayObj = new Date(calNow.getFullYear(), calNow.getMonth(), calNow.getDate());

    const viewYear = viewDate ? viewDate.getFullYear() : calNow.getFullYear();
    const viewMonth = viewDate ? viewDate.getMonth() : calNow.getMonth();
    const viewMonthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`;

    const { upcomingItems, overdueItems } = React.useMemo(() => {
        const upcoming = [];
        const overdue = [];
        const flexDefault = 0;

        (settings.recurring || []).forEach(r => {
            if (r.active === false || (r.endDate && r.endDate < calNow.toISOString().split('T')[0])) return;
            const flexDays = Number(r.dateFlexDays) || flexDefault;
            const anchorDay = getAnchorDayForRecurring(r);
            const monthDueDateStr = getDueDateInMonth(anchorDay, viewYear, viewMonth);

            // Look for a bill instance created for this recurring template
            const billInstancesForR = (settings.billInstances || []).filter(b => b.recurringId === r.id);
            const currentMonthBillInst = billInstancesForR.find(b => b.dueDate && b.dueDate.startsWith(viewMonthPrefix));

            const checkTxPaid = (targetDateStr) => {
                return isRecurringPaidOnDate({
                    recurringItem: r,
                    targetDateStr,
                    viewMonthPrefix,
                    transactions,
                    billInstances: settings.billInstances
                });
            };

            const viewMonthStartStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`;
            const daysInViewMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
            const viewMonthEndStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(daysInViewMonth).padStart(2, '0')}`;
            const effectiveDueDateStr = currentMonthBillInst ? currentMonthBillInst.dueDate : monthDueDateStr;
            const occursInViewMonth = currentMonthBillInst || (getOccurrencesInPeriod(r, viewMonthStartStr, viewMonthEndStr) > 0);

            // Ensure the due date is valid according to startDate and endDate
            const isWithinActiveRange = (!r.startDate || effectiveDueDateStr >= r.startDate) && (!r.endDate || effectiveDueDateStr <= r.endDate);

            // 1. OVERDUE CHECK: Check if item has a past due date < todayStr that is unpaid
            const pendingOverdueInst = billInstancesForR.find(b => b.status === 'pending' && b.dueDate && b.dueDate < todayStr && (!r.startDate || b.dueDate >= r.startDate));
            if (pendingOverdueInst) {
                const instDateObj = new Date(pendingOverdueInst.dueDate + "T00:00:00");
                const diffTime = Math.abs(todayObj - instDateObj);
                overdue.push({
                    id: r.id,
                    kind: "recurring",
                    date: pendingOverdueInst.dueDate,
                    dateObj: instDateObj,
                    name: r.name,
                    amount: pendingOverdueInst.amount,
                    isVariableAmount: false,
                    hasBillInstance: true,
                    billInstanceId: pendingOverdueInst.id,
                    dateFlexDays: flexDays,
                    type: r.type || "expense",
                    category: r.category || "Recurring bill",
                    cadence: r.cadence || "monthly",
                    swatch: "warning",
                    daysOverdue: Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                });
            } else if (occursInViewMonth && isWithinActiveRange && effectiveDueDateStr < todayStr && effectiveDueDateStr.startsWith(viewMonthPrefix)) {
                if (!checkTxPaid(effectiveDueDateStr)) {
                    const rawDateObj = new Date(effectiveDueDateStr + "T00:00:00");
                    const diffTime = Math.abs(todayObj - rawDateObj);
                    overdue.push({
                        id: r.id,
                        kind: "recurring",
                        date: effectiveDueDateStr,
                        dateObj: rawDateObj,
                        name: r.name,
                        amount: r.estimatedAmount || r.amount,
                        isVariableAmount: !!r.isVariableAmount,
                        hasBillInstance: false,
                        billInstanceId: null,
                        dateFlexDays: flexDays,
                        type: r.type || "expense",
                        category: r.category || "Recurring bill",
                        cadence: r.cadence || "monthly",
                        swatch: "warning",
                        daysOverdue: Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                    });
                }
            }

            // 2. UPCOMING CHECK: Check current view month item (if >= todayStr)
            if (occursInViewMonth && isWithinActiveRange && effectiveDueDateStr >= todayStr && effectiveDueDateStr.startsWith(viewMonthPrefix)) {
                const isPaidUpcoming = checkTxPaid(effectiveDueDateStr);

                if (!isPaidUpcoming) {
                    const upcomingDateObj = new Date(effectiveDueDateStr + "T00:00:00");
                    upcoming.push({
                        id: r.id,
                        kind: "recurring",
                        date: effectiveDueDateStr,
                        dateObj: upcomingDateObj,
                        name: r.name,
                        amount: currentMonthBillInst ? currentMonthBillInst.amount : (r.estimatedAmount || r.amount),
                        isVariableAmount: !!r.isVariableAmount && !currentMonthBillInst,
                        hasBillInstance: !!currentMonthBillInst,
                        billInstanceId: currentMonthBillInst ? currentMonthBillInst.id : null,
                        dateFlexDays: flexDays,
                        type: r.type || "expense",
                        category: r.category || "Recurring bill",
                        cadence: r.cadence || "monthly",
                        swatch: "warning"
                    });
                }
            }
        });

        (settings.networthItems || []).forEach(it => {
            if (!it.nextDueDate) return;
            const rawDueDateStr = it.nextDueDate;
            const anchorDay = getAnchorDayOfMonth(rawDueDateStr);
            const monthDueDateStr = getDueDateInMonth(anchorDay, viewYear, viewMonth);

            const isTxPaid = (targetDateStr) => {
                return isNetWorthPaidOnDate({
                    networthItem: it,
                    targetDateStr,
                    viewMonthPrefix,
                    transactions
                });
            };

            // Overdue check
            if (rawDueDateStr < todayStr) {
                if (!isTxPaid(rawDueDateStr)) {
                    const rawDateObj = new Date(rawDueDateStr + "T00:00:00");
                    const diffTime = Math.abs(todayObj - rawDateObj);
                    overdue.push({
                        id: it.id,
                        kind: "networth",
                        date: rawDueDateStr,
                        dateObj: rawDateObj,
                        name: it.name,
                        amount: Math.abs(Number(it.incomeExpense || 0)),
                        type: Number(it.incomeExpense || 0) < 0 ? "expense" : "income",
                        category: it.category || "Loans & Liabilities",
                        frequencyPerYear: it.frequencyPerYear || 12,
                        swatch: (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).swatch || "primary",
                        daysOverdue: Math.ceil(diffTime / (1000 * 60 * 60 * 24))
                    });
                }
            }

            // Upcoming check
            if (monthDueDateStr >= todayStr && monthDueDateStr.startsWith(viewMonthPrefix)) {
                if (!isTxPaid(monthDueDateStr)) {
                    const monthDateObj = new Date(monthDueDateStr + "T00:00:00");
                    upcoming.push({
                        id: it.id,
                        kind: "networth",
                        date: monthDueDateStr,
                        dateObj: monthDateObj,
                        name: it.name,
                        amount: Math.abs(Number(it.incomeExpense || 0)),
                        type: Number(it.incomeExpense || 0) < 0 ? "expense" : "income",
                        category: it.category || "Loans & Liabilities",
                        frequencyPerYear: it.frequencyPerYear || 12,
                        swatch: (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).swatch || "primary"
                    });
                }
            }
        });

        upcoming.sort((a, b) => {
            const timeDiff = a.dateObj - b.dateObj;
            if (timeDiff !== 0) return timeDiff;
            return Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0));
        });

        overdue.sort((a, b) => {
            const timeDiff = a.dateObj - b.dateObj;
            if (timeDiff !== 0) return timeDiff;
            return Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0));
        });

        return { upcomingItems: upcoming, overdueItems: overdue };
    }, [settings.recurring, settings.billInstances, settings.networthItems, transactions, viewYear, viewMonth, todayStr, viewMonthPrefix]);

    const getItemDueDate = React.useCallback((item) => {
        if (!item) return item?.date;
        if (item.scheduledDate) return item.scheduledDate;
        if (item.dueDate) return item.dueDate;
        if (item.linkedRecurringId) {
            const billInsts = (settings.billInstances || []).filter(b => b && b.recurringId === item.linkedRecurringId);
            const linkedBill = billInsts.find(b => (b.linkedTxId && b.linkedTxId === item.id) || (b.status === 'paid' && b.dueDate));
            if (linkedBill && linkedBill.dueDate) return linkedBill.dueDate;
            const r = (settings.recurring || []).find(rec => rec && rec.id === item.linkedRecurringId);
            if (r) {
                const anchorDay = getAnchorDayForRecurring(r);
                const txDateStr = toYYYYMMDD(item.date);
                if (txDateStr) {
                    const txParts = txDateStr.split('-');
                    return getDueDateInMonth(anchorDay, parseInt(txParts[0], 10), parseInt(txParts[1], 10) - 1);
                }
                return getDueDateInMonth(anchorDay, viewYear, viewMonth);
            }
            const netW = (settings.networthItems || []).find(it => it && it.id === item.linkedRecurringId);
            if (netW && netW.nextDueDate) {
                const anchorDay = getAnchorDayOfMonth(netW.nextDueDate);
                const txDateStr = toYYYYMMDD(item.date);
                if (txDateStr) {
                    const txParts = txDateStr.split('-');
                    return getDueDateInMonth(anchorDay, parseInt(txParts[0], 10), parseInt(txParts[1], 10) - 1);
                }
                return getDueDateInMonth(anchorDay, viewYear, viewMonth);
            }
        }
        return item.date;
    }, [settings.recurring, settings.networthItems, settings.billInstances, viewYear, viewMonth]);

    const paidItems = React.useMemo(() => {
        const list = (transactions || []).filter(t => !t.pendingMapping && (t.linkedRecurringId || t.linkTo || t.source === "recurring" || (t.notes && t.notes.includes("Marked as paid"))));
        return list.sort((a, b) => {
            const dateA = toYYYYMMDD(a.date);
            const dateB = toYYYYMMDD(b.date);
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            return Math.abs(Number(b.amount || 0)) - Math.abs(Number(a.amount || 0));
        });
    }, [transactions]);

    const selectedDayStr = selectedDay ? toYYYYMMDD(selectedDay) : null;

    const filteredUpcoming = selectedDayStr ? upcomingItems.filter(i => i.date === selectedDayStr) : upcomingItems;
    const filteredOverdue = React.useMemo(() => {
        if (selectedDayStr) {
            if (selectedDayStr === todayStr) {
                // Selecting "Today": Shows ALL pending items overdue as of today (due_date < Today)
                return overdueItems.filter(i => i.date < todayStr);
            } else if (selectedDayStr > todayStr) {
                // Selecting a Future Date: Show 0 items for that specific date
                return [];
            } else {
                // Selecting a Past Date (selectedDayStr < todayStr):
                // Show all unpaid items due on or before that selected past date (due_date <= selectedDayStr)
                return overdueItems.filter(i => i.date <= selectedDayStr);
            }
        } else {
            // Month view level selection
            const calYear = calNow.getFullYear();
            const calMonth = calNow.getMonth();
            const isPrevMonth = viewYear < calYear || (viewYear === calYear && viewMonth < calMonth);

            if (isPrevMonth) {
                // Selecting a Previous Month: Show overdue items till last date of that previous month
                const lastDateOfPrevMonthStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(new Date(viewYear, viewMonth + 1, 0).getDate()).padStart(2, '0')}`;
                return overdueItems.filter(i => i.date <= lastDateOfPrevMonthStr);
            } else {
                // Selecting Current Month (or future month): Show overdue items till < today
                return overdueItems.filter(i => i.date < todayStr);
            }
        }
    }, [selectedDayStr, todayStr, overdueItems, viewYear, viewMonth]);
    const filteredPaid = React.useMemo(() => {
        return paidItems.filter(i => {
            const txDateStr = toYYYYMMDD(i.date);
            const dueDateStr = toYYYYMMDD(getItemDueDate(i));
            if (selectedDayStr) {
                return txDateStr === selectedDayStr || dueDateStr === selectedDayStr;
            }
            return txDateStr.startsWith(viewMonthPrefix) || dueDateStr.startsWith(viewMonthPrefix);
        });
    }, [paidItems, selectedDayStr, viewMonthPrefix, getItemDueDate]);

    // Auto-select active filter tab based on calendar view & date selection rules
    React.useEffect(() => {
        if (selectedDayStr) {
            if (selectedDayStr >= todayStr) {
                // Today or future date selected: show upcoming filter, if empty show paid filter
                if (filteredUpcoming.length > 0) {
                    setFilter("upcoming");
                } else if (filteredOverdue.length > 0) {
                    setFilter("overdue");
                } else {
                    setFilter("paid");
                }
            } else {
                // Past date selected: show overdue filter, if empty show paid filter
                if (filteredOverdue.length > 0) {
                    setFilter("overdue");
                } else if (filteredUpcoming.length > 0) {
                    setFilter("upcoming");
                } else {
                    setFilter("paid");
                }
            }
        } else {
            // Month view level selection
            const calYear = calNow.getFullYear();
            const calMonth = calNow.getMonth();
            const isPrevMonth = viewYear < calYear || (viewYear === calYear && viewMonth < calMonth);
            const isNextMonth = viewYear > calYear || (viewYear === calYear && viewMonth > calMonth);

            if (isPrevMonth) {
                // 1. Previous month selected: show overdue filter, if nothing exists show paid filter
                if (filteredOverdue.length > 0) {
                    setFilter("overdue");
                } else {
                    setFilter("paid");
                }
            } else if (isNextMonth) {
                // 2. Next month selected: show upcoming filter, if nothing exists show paid filter
                if (filteredUpcoming.length > 0) {
                    setFilter("upcoming");
                } else {
                    setFilter("paid");
                }
            } else {
                // Current month
                if (filteredOverdue.length > 0) {
                    setFilter("overdue");
                } else if (filteredUpcoming.length > 0) {
                    setFilter("upcoming");
                } else {
                    setFilter("paid");
                }
            }
        }
    }, [selectedDayStr, viewYear, viewMonth, filteredUpcoming.length, filteredOverdue.length, filteredPaid.length, todayStr]);

    const handleBackFromMapping = async () => {
        try {
            if (sessionCreatedTxIds.length > 0) {
                for (const id of sessionCreatedTxIds) {
                    await deleteTransactionFromDB(id);
                }
                setSessionCreatedTxIds([]);
                if (typeof loadState === "function") {
                    await loadState();
                }
            }
        } catch (err) {
            console.error("Error deleting session-created transactions on back:", err);
        } finally {
            setSelectedMapTxIds([]);
            setIsMappingMode(false);
            setNewTxModalData(null);
        }
    };

    const handleCloseMarkPaidModal = async () => {
        try {
            if (sessionCreatedTxIds.length > 0) {
                for (const id of sessionCreatedTxIds) {
                    await deleteTransactionFromDB(id);
                }
                setSessionCreatedTxIds([]);
                if (typeof loadState === "function") {
                    await loadState();
                }
            }
        } catch (err) {
            console.error("Error deleting session-created transactions on modal close:", err);
        } finally {
            setSessionCreatedTxIds([]);
            setMarkPaidModalItem(null);
            setSelectedTxIdToLink(null);
            setIsMappingMode(false);
            setSelectedMapTxIds([]);
            setCreatedDateOption("due_date");
            setCustomCreatedDate("");
            setNewTxModalData(null);
        }
    };

    // Close modals in strict LIFO order on Escape key
    useEscapeKey(unmarkConfirmItem ? () => { setUnmarkConfirmItem(null); setUnmarkLinkedTxs([]); } : null);
    useEscapeKey(markPaidModalItem && isMappingMode && !newTxModalData ? handleBackFromMapping : null);
    useEscapeKey(markPaidModalItem && !isMappingMode && !newTxModalData ? handleCloseMarkPaidModal : null);

    // Candidate matching transactions for Mark Paid modal (exact same date and amount, including neutral)
    const candidateMatches = React.useMemo(() => {
        if (!markPaidModalItem) return [];
        const isIncome = markPaidModalItem.type === "income";
        const itemDateStr = markPaidModalItem.date;
        const itemAmount = Math.abs(Number(markPaidModalItem.amount));
        return (transactions || []).filter(t => {
            if (t.linkedRecurringId) return false;
            const tType = t.type || "expense";
            const isTypeMatch = isIncome
                ? (tType === "income" || tType === "neutral")
                : (tType === "expense" || tType === "neutral");
            if (!isTypeMatch) return false;
            const tDateStr = toYYYYMMDD(t.date);
            const tAmount = Math.abs(Number(t.amount));
            return tDateStr === itemDateStr && Math.abs(tAmount - itemAmount) < 0.01;
        });
    }, [markPaidModalItem, transactions]);

    // Unmapped transactions matching exact amount across all dates (outflow includes expense + neutral; inflow includes income + neutral)
    const samePriceMatches = React.useMemo(() => {
        if (!markPaidModalItem) return [];
        const isIncome = markPaidModalItem.type === "income";
        const itemAmount = Math.abs(Number(markPaidModalItem.amount || 0));
        if (itemAmount <= 0) return [];
        return (transactions || []).filter(t => {
            if (t.linkedRecurringId) return false;
            const tType = t.type || "expense";
            const isTypeMatch = isIncome
                ? (tType === "income" || tType === "neutral")
                : (tType === "expense" || tType === "neutral");
            if (!isTypeMatch) return false;
            const tAmount = Math.abs(Number(t.amount || 0));
            return Math.abs(tAmount - itemAmount) < 0.01;
        }).sort((a, b) => new Date(b.date) - new Date(a.date));
    }, [markPaidModalItem, transactions]);

    // Transactions list for multi-transaction mapping mode (includes both direction-matching and neutral transactions)
    const candidateTxList = React.useMemo(() => {
        if (!markPaidModalItem) return [];
        const isIncome = markPaidModalItem.type === "income";
        const itemMainCat = getMainCategory(markPaidModalItem.category).toLowerCase();

        return (transactions || []).filter(t => {
            if (t.linkedRecurringId && (!selectedMapTxIds.includes(t.id) && t.linkedRecurringId !== markPaidModalItem.id)) return false;
            const tType = t.type || "expense";
            const isTypeMatch = isIncome
                ? (tType === "income" || tType === "neutral")
                : (tType === "expense" || tType === "neutral");
            if (!isTypeMatch) return false;

            const tMainCat = getMainCategory(t.category).toLowerCase();
            // Category match: same main category, or any neutral transaction (transfers, card payments, settlements)
            if (itemMainCat && itemMainCat !== "general" && tMainCat === itemMainCat) {
                return true;
            }
            if (tType === "neutral") {
                return true;
            }
            if (!itemMainCat || itemMainCat === "general") {
                return true;
            }
            if (selectedMapTxIds.includes(t.id)) {
                return true;
            }
            return false;
        }).sort((a, b) => {
            const aSelected = selectedMapTxIds.includes(a.id) ? 1 : 0;
            const bSelected = selectedMapTxIds.includes(b.id) ? 1 : 0;
            if (aSelected !== bSelected) return bSelected - aSelected;
            const aCatMatch = getMainCategory(a.category).toLowerCase() === itemMainCat ? 1 : 0;
            const bCatMatch = getMainCategory(b.category).toLowerCase() === itemMainCat ? 1 : 0;
            if (aCatMatch !== bCatMatch) return bCatMatch - aCatMatch;
            return new Date(b.date) - new Date(a.date);
        });
    }, [markPaidModalItem, transactions, selectedMapTxIds]);

    const selectedMapSum = React.useMemo(() => {
        return (transactions || [])
            .filter(t => selectedMapTxIds.includes(t.id))
            .reduce((acc, t) => acc + Math.abs(Number(t.amount || 0)), 0);
    }, [transactions, selectedMapTxIds]);

    const handleOpenAddTxModalForRemaining = () => {
        if (!markPaidModalItem) return;
        const isIncome = markPaidModalItem.type === "income";
        const targetAmt = Math.abs(Number(markPaidModalItem.amount || 0));
        const remainingAmt = Number(Math.max(0, targetAmt - selectedMapSum).toFixed(2));
        const defaultAccount = (markPaidModalItem.account && (settings.accounts || []).includes(markPaidModalItem.account))
            ? markPaidModalItem.account
            : ((settings.accounts || []).includes("Bank 1")
                ? "Bank 1"
                : ((settings.accounts || []).find(a => (settings.accountProfiles || {})[a]?.type === "bank") || (settings.accounts || [])[0] || "Bank 1"));

        setNewTxModalData({
            type: markPaidModalItem.type || (isIncome ? "income" : "expense"),
            amount: remainingAmt > 0 ? remainingAmt : "",
            narration: markPaidModalItem.name || "",
            merchant: markPaidModalItem.name || "",
            category: markPaidModalItem.category || (isIncome ? "Income - Other" : "General"),
            account: defaultAccount,
            date: markPaidModalItem.date || todayStr,
            source: "dashboard"
        });
    };

    const handleSaveNewTxFromModal = async (newTxData) => {
        try {
            const isIncome = markPaidModalItem.type === "income";
            const dateFormatted = formatDate(todayStr, settings.dateFormat);
            const txId = newTxData.id || ((typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
            const noteMsg = newTxData.notes || `Created partial ${isIncome ? "Inflow" : "Outflow"} for "${markPaidModalItem.name}" from Dashboard on ${dateFormatted}`;

            const fullTx = {
                ...newTxData,
                id: txId,
                linkedRecurringId: null,
                pendingMapping: true,
                scheduledDate: newTxData.date || markPaidModalItem.date || todayStr,
                source: "dashboard",
                notes: noteMsg
            };

            if (typeof onAddTransactions === "function") {
                await onAddTransactions([fullTx]);
            } else {
                await saveTransactionsInDB([fullTx]);
                if (typeof loadState === "function") {
                    await loadState();
                }
            }

            setSessionCreatedTxIds(prev => prev.includes(txId) ? prev : [...prev, txId]);
            setSelectedMapTxIds(prev => prev.includes(txId) ? prev : [...prev, txId]);
            setNewTxModalData(null);
            if (typeof showToast === "function") {
                showToast(`Created & selected ${formatCurrency(fullTx.amount)} transaction`);
            }
        } catch (err) {
            console.error("Error creating transaction in mapping modal:", err);
            if (typeof showToast === "function") {
                showToast("Failed to create transaction: " + (err?.message || "unknown error"), "error");
            }
        }
    };

    const confirmMarkPaid = async (item, txIdToLink, creationDateOverride) => {
        try {
            const isIncome = item.type === "income";
            const linkIds = Array.isArray(txIdToLink) ? txIdToLink : (txIdToLink ? [txIdToLink] : []);
            const dateFormatted = formatDate(todayStr, settings.dateFormat);
            let createdTxId = null;

            if (linkIds.length > 0) {
                for (const id of linkIds) {
                    const existingTx = (transactions || []).find(t => t.id === id);
                    if (existingTx) {
                        const noteMsg = `Linked ${isIncome ? "Inflow" : "Outflow"} from Dashboard on ${dateFormatted}`;
                        const updatedTx = {
                            ...existingTx,
                            linkedRecurringId: item.id,
                            scheduledDate: existingTx.scheduledDate || item.date || todayStr,
                            notes: existingTx.notes ? (existingTx.notes.includes("from Dashboard") ? existingTx.notes : `${existingTx.notes} (${noteMsg})`) : noteMsg
                        };
                        delete updatedTx.pendingMapping;
                        await updateTransactionInDB(updatedTx);
                    }
                }
                // If any transactions were created in this session but then deselected by the user, delete them
                if (sessionCreatedTxIds.length > 0) {
                    const unusedSessionTxIds = sessionCreatedTxIds.filter(id => !linkIds.includes(id));
                    for (const unusedId of unusedSessionTxIds) {
                        await deleteTransactionFromDB(unusedId);
                    }
                }
                setSessionCreatedTxIds([]);
            } else {
                const noteMsg = `Created ${isIncome ? "Inflow" : "Outflow"} from Dashboard on ${dateFormatted}`;
                // Temporary entry: when the real statement row arrives it replaces this one (services/importDedupe.js).
                // `scheduledDate` is when the payment was due, so a late tick still matches the right statement row.
                const accountList = settings.accounts || [];
                const accountProfiles = settings.accountProfiles || {};
                const payFrom = (item.account && accountList.includes(item.account))
                    ? item.account
                    : (accountList.includes("Bank 1")
                        ? "Bank 1"
                        : (accountList.find(a => accountProfiles[a]?.type === "bank") || accountList[0] || "Bank 1"));
                createdTxId = crypto.randomUUID();
                const txDate = creationDateOverride || (createdDateOption === "due_date" ? (item.date || todayStr) : (createdDateOption === "today" ? todayStr : (customCreatedDate || item.date || todayStr)));
                const newTx = {
                    id: createdTxId,
                    date: txDate,
                    merchant: item.name,
                    narration: item.name,
                    amount: item.amount,
                    type: item.type || (isIncome ? "income" : "expense"),
                    category: item.category || "Subscriptions",
                    account: payFrom,
                    linkedRecurringId: item.id,
                    source: "dashboard",
                    scheduledDate: item.date || txDate,
                    tags: [],
                    notes: noteMsg
                };
                await updateTransactionInDB(newTx);
            }

            const effectiveLinkedTxId = linkIds[0] || createdTxId || null;

            // Advance schedule on item or mark bill instance paid
            if (item.kind === "recurring") {
                const rTemplate = (settings.recurring || []).find(r => r.id === item.id);
                const fullTemplateAmount = rTemplate ? Math.abs(Number(rTemplate.estimatedAmount || rTemplate.amount || 0)) : Math.abs(Number(item.amount || 0));

                if (item.hasBillInstance && item.billInstanceId) {
                    const updatedInstances = (settings.billInstances || []).map(b => {
                        if (b.id === item.billInstanceId) {
                            return { ...b, status: 'paid', amount: fullTemplateAmount, linkedTxId: effectiveLinkedTxId };
                        }
                        return b;
                    });
                    await updateSetting("billInstances", updatedInstances);
                } else if (item.date) {
                    const newBillInst = {
                        id: crypto.randomUUID(),
                        recurringId: item.id,
                        name: item.name,
                        amount: fullTemplateAmount,
                        dueDate: item.date,
                        status: 'paid',
                        linkedTxId: effectiveLinkedTxId
                    };
                    const existing = settings.billInstances || [];
                    await updateSetting("billInstances", [...existing, newBillInst]);
                }
                const updatedList = (settings.recurring || []).map(r => {
                    if (r.id !== item.id) return r;
                    const nextDate = shiftDateByCadence(r.nextDate, r.cadence, 1, {
                        anchorDay: getAnchorDayForRecurring(r),
                        intervalDays: r.customIntervalDays
                    });
                    return { ...r, nextDate };
                });
                await updateSetting("recurring", updatedList);

                // Auto-reduce amortizing loan principal in Net Worth if linked
                const paidAmount = Number(item.amount || 0);
                const currentNwItems = settings.networthItems || [];
                const hasAmortizingLinked = currentNwItems.some(nw => nw.linkedRecurringId === item.id && (nw.syncMode === "amortizing" || nw.syncMode === "loan_principal"));
                if (hasAmortizingLinked && paidAmount > 0) {
                    const updatedNw = currentNwItems.map(nw => {
                        if (nw.linkedRecurringId === item.id && (nw.syncMode === "amortizing" || nw.syncMode === "loan_principal")) {
                            const remainingVal = Math.max(0, Number(nw.value || 0) - paidAmount);
                            return { ...nw, value: remainingVal };
                        }
                        return nw;
                    });
                    await updateSetting("networthItems", updatedNw);
                }

                // Auto-accumulate recurring SIP payments in Net Worth into both invested & current valuation
                const hasSipLinked = currentNwItems.some(nw => nw.linkedRecurringId === item.id && (nw.syncMode === "sip" || nw.syncMode === "investment_sip" || (NET_WORTH_GROUPS.find(g => g.key === nw.category)?.kind === "investment" && nw.syncMode !== "revolving")));
                if (hasSipLinked && paidAmount > 0) {
                    const updatedNw = currentNwItems.map(nw => {
                        if (nw.linkedRecurringId === item.id && (nw.syncMode === "sip" || nw.syncMode === "investment_sip" || (NET_WORTH_GROUPS.find(g => g.key === nw.category)?.kind === "investment" && nw.syncMode !== "revolving"))) {
                            const currentInvested = Number(nw.invested || 0);
                            const currentValue = Number(nw.value !== undefined ? nw.value : currentInvested);
                            return {
                                ...nw,
                                invested: currentInvested + paidAmount,
                                value: currentValue + paidAmount
                            };
                        }
                        return nw;
                    });
                    await updateSetting("networthItems", updatedNw);
                }
            } else if (item.kind === "networth") {
                const updatedList = (settings.networthItems || []).map(it => {
                    if (it.id !== item.id) return it;
                    const nextDueDate = shiftDateByCadence(it.nextDueDate, "monthly", netWorthMonthsPerCycle(it.frequencyPerYear));
                    return { ...it, nextDueDate };
                });
                await updateSetting("networthItems", updatedList);
            }

            // Refresh global state so new transaction and updated settings are immediately reflected across all views
            if (typeof loadState === "function") {
                await loadState();
            }

            if (typeof showToast === "function") {
                const actionLabel = linkIds.length > 0 ? `Linked ${linkIds.length} txn${linkIds.length > 1 ? 's' : ''}` : "Created";
                const typeLabel = isIncome ? "Inflow" : "Outflow";
                showToast(`${actionLabel} ${typeLabel} for "${item.name}" from Dashboard on ${dateFormatted}`);
            }
        } catch (e) {
        } finally {
            setSessionCreatedTxIds([]);
            setMarkPaidModalItem(null);
            setSelectedTxIdToLink(null);
            setIsMappingMode(false);
            setSelectedMapTxIds([]);
            setNewTxModalData(null);
        }
    };

    const executeUnlinkSingle = async (txToUnlink, allLinkedTxs) => {
        try {
            const linkedRecId = txToUnlink.linkedRecurringId;
            const targetDueDate = txToUnlink.scheduledDate || toYYYYMMDD(txToUnlink.date);
            const isNewlyCreated = txToUnlink.notes && (txToUnlink.notes.includes("Created Inflow from Dashboard") || txToUnlink.notes.includes("Created Outflow from Dashboard") || txToUnlink.notes.startsWith("Created "));

            // 1. Unlink or delete this specific transaction
            if (isNewlyCreated) {
                await deleteTransactionFromDB(txToUnlink.id);
            } else {
                let cleanedNotes = (txToUnlink.notes || "")
                    .replace(/\(Linked (Inflow|Outflow) from Dashboard on [^)]+\)/g, "")
                    .replace(/Linked (Inflow|Outflow) from Dashboard on [^\n\r.]*/g, "")
                    .replace(/\(Created (Inflow|Outflow) from Dashboard on [^)]+\)/g, "")
                    .replace(/Created (Inflow|Outflow) from Dashboard on [^\n\r.]*/g, "")
                    .trim();

                const updatedTx = {
                    ...txToUnlink,
                    linkedRecurringId: null,
                    scheduledDate: null,
                    notes: cleanedNotes
                };
                await updateTransactionInDB(updatedTx);
            }

            // 2. Identify remaining linked transactions
            const remainingTxs = (allLinkedTxs || []).filter(t => t.id !== txToUnlink.id);
            const remainingSum = remainingTxs.reduce((sum, t) => sum + Math.abs(Number(t.amount || 0)), 0);

            // 3. Find recurring item & target amount
            const rItem = (settings.recurring || []).find(r => r && r.id === linkedRecId);
            const nwItem = (settings.networthItems || []).find(it => it && it.id === linkedRecId);
            const fullTargetAmount = rItem
                ? Math.abs(Number(rItem.estimatedAmount || rItem.amount || 0))
                : (nwItem ? Math.abs(Number(nwItem.incomeExpense || 0)) : (remainingSum + Math.abs(Number(txToUnlink.amount || 0))));

            const remainingUnpaid = Number(Math.max(0, fullTargetAmount - remainingSum).toFixed(2));

            // 4. Update or create billInstance with status: 'pending' and amount: remainingUnpaid
            const existingInstances = settings.billInstances || [];
            const targetMonthPrefix = targetDueDate ? targetDueDate.slice(0, 7) : "";
            const biIndex = existingInstances.findIndex(b => b && b.recurringId === linkedRecId && (b.dueDate === targetDueDate || (targetMonthPrefix && b.dueDate && b.dueDate.startsWith(targetMonthPrefix))));

            if (remainingUnpaid > 0) {
                if (biIndex !== -1) {
                    const updatedInstances = existingInstances.map((b, idx) => {
                        if (idx === biIndex) {
                            return {
                                ...b,
                                status: 'pending',
                                amount: remainingUnpaid,
                                dueDate: targetDueDate,
                                linkedTxId: remainingTxs[0]?.id || null
                            };
                        }
                        return b;
                    });
                    await updateSetting("billInstances", updatedInstances);
                } else {
                    const newBillInst = {
                        id: crypto.randomUUID(),
                        recurringId: linkedRecId,
                        name: rItem?.name || nwItem?.name || txToUnlink.merchant || "Recurring Bill",
                        amount: remainingUnpaid,
                        dueDate: targetDueDate,
                        status: 'pending',
                        linkedTxId: remainingTxs[0]?.id || null
                    };
                    await updateSetting("billInstances", [...existingInstances, newBillInst]);
                }

                // 5. Rewind recurring nextDate if it was shifted past targetDueDate
                if (rItem && rItem.nextDate && rItem.nextDate > targetDueDate) {
                    const updatedList = (settings.recurring || []).map(r => {
                        if (!r || r.id !== linkedRecId) return r;
                        const prevDate = shiftDateByCadence(r.nextDate, r.cadence, -1, {
                            anchorDay: getAnchorDayForRecurring(r),
                            intervalDays: r.customIntervalDays
                        });
                        return { ...r, nextDate: prevDate };
                    });
                    await updateSetting("recurring", updatedList);
                }

                if (nwItem && nwItem.nextDueDate && nwItem.nextDueDate > targetDueDate) {
                    const updatedList = (settings.networthItems || []).map(it => {
                        if (!it || it.id !== linkedRecId) return it;
                        const prevDueDate = shiftDateByCadence(it.nextDueDate, "monthly", -netWorthMonthsPerCycle(it.frequencyPerYear));
                        return { ...it, nextDueDate: prevDueDate };
                    });
                    await updateSetting("networthItems", updatedList);
                }
            } else {
                // If remaining linked transactions still cover the full amount
                if (biIndex !== -1) {
                    const updatedInstances = existingInstances.map((b, idx) => {
                        if (idx === biIndex) {
                            return {
                                ...b,
                                status: 'paid',
                                amount: remainingSum,
                                linkedTxId: remainingTxs[0]?.id || null
                            };
                        }
                        return b;
                    });
                    await updateSetting("billInstances", updatedInstances);
                }
            }

            // 6. Net worth adjustment for the unlinked amount
            const unlinkedAmt = Math.abs(Number(txToUnlink.amount || 0));
            if (nwItem && unlinkedAmt > 0) {
                if (nwItem.syncMode === "amortizing" || nwItem.syncMode === "loan_principal") {
                    const updatedNw = (settings.networthItems || []).map(nw => nw.id === nwItem.id ? { ...nw, value: Number(nw.value || 0) + unlinkedAmt } : nw);
                    await updateSetting("networthItems", updatedNw);
                } else if (nwItem.syncMode === "sip" || nwItem.syncMode === "investment_sip" || (NET_WORTH_GROUPS.find(g => g.key === nwItem.category)?.kind === "investment" && nwItem.syncMode !== "revolving")) {
                    const updatedNw = (settings.networthItems || []).map(nw => {
                        if (nw.id === nwItem.id) {
                            const newInvested = Math.max(0, Number(nw.invested || 0) - unlinkedAmt);
                            const newValue = Math.max(0, Number(nw.value || 0) - unlinkedAmt);
                            return { ...nw, invested: newInvested, value: newValue };
                        }
                        return nw;
                    });
                    await updateSetting("networthItems", updatedNw);
                }
            }

            if (typeof loadState === "function") {
                await loadState();
            }

            if (typeof showToast === "function") {
                const itemName = rItem?.name || nwItem?.name || txToUnlink.merchant || "Payment";
                const isOverdue = targetDueDate < todayStr;
                const dest = isOverdue ? "Overdue" : "Upcoming";
                showToast(`Unlinked "${txToUnlink.merchant || txToUnlink.narration}". "${itemName}" moved to ${dest} with remaining amount of ${formatCurrency(remainingUnpaid)}.`);
            }
        } catch (err) {
            console.error("Error unlinking single transaction:", err);
            if (typeof showToast === "function") {
                showToast("Failed to unlink transaction: " + (err?.message || "unknown error"), "error");
            }
        } finally {
            setUnmarkConfirmItem(null);
            setUnmarkLinkedTxs([]);
        }
    };

    const executeUnmarkPaid = async (txList, primaryTx) => {
        try {
            const targetList = Array.isArray(txList) && txList.length > 0 ? txList : [primaryTx];
            const linkedRecId = primaryTx?.linkedRecurringId || targetList[0]?.linkedRecurringId;

            for (const t of targetList) {
                const isNewlyCreated = t.notes && (t.notes.includes("Created Inflow from Dashboard") || t.notes.includes("Created Outflow from Dashboard") || t.notes.startsWith("Created "));

                if (isNewlyCreated) {
                    await deleteTransactionFromDB(t.id);
                } else {
                    let cleanedNotes = (t.notes || "")
                        .replace(/\(Linked (Inflow|Outflow) from Dashboard on [^)]+\)/g, "")
                        .replace(/Linked (Inflow|Outflow) from Dashboard on [^\n\r.]*/g, "")
                        .replace(/\(Created (Inflow|Outflow) from Dashboard on [^)]+\)/g, "")
                        .replace(/Created (Inflow|Outflow) from Dashboard on [^\n\r.]*/g, "")
                        .trim();

                    const updatedTx = {
                        ...t,
                        linkedRecurringId: null,
                        scheduledDate: null,
                        notes: cleanedNotes
                    };
                    await updateTransactionInDB(updatedTx);
                }
            }

            // Remove any auto-created bill instances that were linked to these unlinked transactions
            if (settings.billInstances && settings.billInstances.length > 0) {
                const targetIds = targetList.map(t => t.id);
                const updatedInstances = (settings.billInstances || []).filter(b => {
                    const isLinked = b.linkedTxId && targetIds.includes(b.linkedTxId);
                    if (isLinked) return false;
                    if (linkedRecId && b.recurringId === linkedRecId && (b.status === 'paid' || b.status === 'pending')) {
                        const matchesAnyTx = targetList.some(t => {
                            const sched = t.scheduledDate || t.date;
                            return b.dueDate === sched || (sched && b.dueDate && b.dueDate.startsWith(sched.slice(0, 7)));
                        });
                        if (matchesAnyTx) return false;
                    }
                    return true;
                });
                if (updatedInstances.length !== settings.billInstances.length) {
                    await updateSetting("billInstances", updatedInstances);
                }
            }

            // Rewind schedule if linked to a recurring item or networth item
            if (linkedRecId) {
                const rItem = (settings.recurring || []).find(r => r && r.id === linkedRecId);
                if (rItem) {
                    const updatedList = (settings.recurring || []).map(r => {
                        if (!r || r.id !== linkedRecId) return r;
                        const nextDate = shiftDateByCadence(r.nextDate, r.cadence, -1, {
                            anchorDay: getAnchorDayForRecurring(r),
                            intervalDays: r.customIntervalDays
                        });
                        return { ...r, nextDate };
                    });
                    await updateSetting("recurring", updatedList);

                    // Revert Net Worth updates if linked to amortizing loan or SIP investment
                    const currentNwItems = settings.networthItems || [];
                    const nwItem = currentNwItems.find(nw => nw && nw.linkedRecurringId === linkedRecId);
                    if (nwItem) {
                        const unmarkAmount = targetList.reduce((acc, t) => acc + Math.abs(Number(t.amount || 0)), 0);
                        if (unmarkAmount > 0) {
                            if (nwItem.syncMode === "amortizing" || nwItem.syncMode === "loan_principal") {
                                const updatedNw = currentNwItems.map(nw => nw.id === nwItem.id ? { ...nw, value: Number(nw.value || 0) + unmarkAmount } : nw);
                                await updateSetting("networthItems", updatedNw);
                            } else if (nwItem.syncMode === "sip" || nwItem.syncMode === "investment_sip" || (NET_WORTH_GROUPS.find(g => g.key === nwItem.category)?.kind === "investment" && nwItem.syncMode !== "revolving")) {
                                const updatedNw = currentNwItems.map(nw => {
                                    if (nw.id === nwItem.id) {
                                        const newInvested = Math.max(0, Number(nw.invested || 0) - unmarkAmount);
                                        const newValue = Math.max(0, Number(nw.value || 0) - unmarkAmount);
                                        return { ...nw, invested: newInvested, value: newValue };
                                    }
                                    return nw;
                                });
                                await updateSetting("networthItems", updatedNw);
                            }
                        }
                    }
                } else {
                    const nwItem = (settings.networthItems || []).find(it => it && it.id === linkedRecId);
                    if (nwItem) {
                        const updatedList = (settings.networthItems || []).map(it => {
                            if (!it || it.id !== linkedRecId) return it;
                            const nextDueDate = shiftDateByCadence(it.nextDueDate, "monthly", -netWorthMonthsPerCycle(it.frequencyPerYear));
                            return { ...it, nextDueDate };
                        });
                        await updateSetting("networthItems", updatedList);
                    }
                }
            }

            if (typeof loadState === "function") {
                await loadState();
            }

            if (typeof showToast === "function") {
                const nameLabel = primaryTx?.merchant || primaryTx?.narration || "Payment";
                if (targetList.length > 1) {
                    showToast(`Unmarked payment "${nameLabel}" and unlinked all ${targetList.length} transactions.`);
                } else {
                    const isNewlyCreated = primaryTx?.notes && (primaryTx.notes.includes("Created Inflow from Dashboard") || primaryTx.notes.includes("Created Outflow from Dashboard") || primaryTx.notes.startsWith("Created "));
                    if (isNewlyCreated) {
                        showToast(`Deleted transaction "${nameLabel}" and unmarked as paid.`);
                    } else {
                        showToast(`Unlinked transaction "${nameLabel}".`);
                    }
                }
            }
        } catch (e) {
            console.error("Failed to unmark paid item:", e);
        } finally {
            setUnmarkConfirmItem(null);
            setUnmarkLinkedTxs([]);
        }
    };

    const handleUnmarkPaid = (tx) => {
        const linkedRecId = tx.linkedRecurringId;
        const schedDate = tx.scheduledDate || toYYYYMMDD(tx.date);
        const schedMonth = schedDate ? schedDate.slice(0, 7) : "";

        const relatedTxs = linkedRecId
            ? (transactions || []).filter(t => !t.pendingMapping && t.linkedRecurringId === linkedRecId && (
                t.scheduledDate
                    ? (t.scheduledDate === schedDate || (schedMonth && t.scheduledDate.startsWith(schedMonth)))
                    : (schedMonth && toYYYYMMDD(t.date).startsWith(schedMonth))
            ))
            : [tx];
        const finalTxs = relatedTxs.length > 0 ? relatedTxs : [tx];
        const sortedTxs = [...finalTxs].sort((a, b) => {
            if (a.id === tx.id) return -1;
            if (b.id === tx.id) return 1;
            return new Date(b.date) - new Date(a.date);
        });

        setUnmarkConfirmItem(tx);
        setUnmarkLinkedTxs(sortedTxs);
    };

    return (
        <div className="section-card" style={{ background: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--border-color)', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', height: '100%', padding: '16px' }}>
            {/* 3 Filter Tabs: Upcoming, Overdue, Paid */}
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '12px' }}>
                <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-color)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)', width: '100%' }}>
                    <button
                        className={`btn btn-sm ${filter === 'upcoming' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => setFilter('upcoming')}
                        style={{ flex: 1, fontSize: '0.78rem', padding: '5px 10px', borderRadius: '7px', fontWeight: filter === 'upcoming' ? 700 : 500, border: 'none' }}
                    >
                        Upcoming ({filteredUpcoming.length})
                    </button>
                    <button
                        className="btn btn-sm"
                        onClick={() => setFilter('overdue')}
                        style={{
                            flex: 1, fontSize: '0.78rem', padding: '5px 10px', borderRadius: '7px', fontWeight: filter === 'overdue' ? 700 : 500, border: 'none',
                            background: filter === 'overdue' ? '#DC2626' : '#FFFFFF',
                            color: filter === 'overdue' ? '#FFFFFF' : '#DC2626',
                            boxShadow: filter === 'overdue' ? '0 2px 6px rgba(220, 38, 38, 0.3)' : 'none'
                        }}
                    >
                        Overdue ({filteredOverdue.length})
                    </button>
                    <button
                        className="btn btn-sm"
                        onClick={() => setFilter('paid')}
                        style={{
                            flex: 1, fontSize: '0.78rem', padding: '5px 10px', borderRadius: '7px', fontWeight: filter === 'paid' ? 700 : 500, border: 'none',
                            background: filter === 'paid' ? '#10B981' : '#FFFFFF',
                            color: filter === 'paid' ? '#FFFFFF' : '#059669',
                            boxShadow: filter === 'paid' ? '0 2px 6px rgba(16, 185, 129, 0.3)' : 'none'
                        }}
                    >
                        Paid / Received ({filteredPaid.length})
                    </button>
                </div>
            </div>

            {/* Active Filter Content: Fixed Height (300px) with Always-On Scrollbar */}
            <div className="payments-scroll-container" style={{ height: '300px', maxHeight: '300px', overflowY: 'scroll', display: 'flex', flexDirection: 'column', gap: '6px', padding: '4px 6px 4px 2px' }}>
                {filter === "upcoming" && (
                    filteredUpcoming.length === 0 ? (
                        <div className="empty-state" style={{ padding: '24px 12px', margin: 'auto 0' }}>
                            <Icon name="calendar" />
                            <div className="empty-state-text">
                                <h3>No Upcoming Payments</h3>
                                <p style={{ fontSize: '0.8rem' }}>{selectedDayStr ? "No scheduled payments for selected date." : "No upcoming commitments found for this month."}</p>
                            </div>
                        </div>
                    ) : (
                        filteredUpcoming.map((item, idx) => {
                            const itemDateObj = new Date(item.date + "T00:00:00");
                            const diffTime = itemDateObj - todayObj;
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            const dueText = diffDays <= 0 ? "Due Today" : (diffDays === 1 ? "Due Tomorrow" : `Due in ${diffDays} Days`);

                            return (
                                <div key={item.id || idx} className="payments-item-card" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.8fr) minmax(0, 1.35fr) minmax(0, 1fr) 28px', gap: '8px', alignItems: 'center', padding: '6px 10px', minHeight: '38px' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                        {item.name}
                                    </div>
                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                        {item.category}
                                    </div>
                                    <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                        <span className="upcoming-date-default">Due {formatDate(item.date, settings.dateFormat)}</span>
                                        <span className="upcoming-days-hover" style={{ fontWeight: 700, background: '#EEF2FF', color: '#4338CA', padding: '1px 6px', borderRadius: '4px', border: '1px solid #C7D2FE' }}>
                                            {dueText}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', minWidth: 0 }}>
                                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: item.type === 'neutral' ? 'var(--info)' : (item.type === 'income' ? 'var(--success)' : 'var(--danger)'), overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                                            {`${item.type === 'neutral' ? (item.neutralSign === '-' ? '-' : '+') : (item.type === 'income' ? '+' : '-')}${formatCurrency(item.amount)}`}
                                            {item.isVariableAmount && !item.hasBillInstance && (
                                                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginLeft: '3px' }} title="Estimated amount">(E)</span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ width: '26px', height: '26px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#EEF2FF', color: '#4F46E5', border: '1.5px solid #C7D2FE', cursor: 'pointer', flexShrink: 0, boxShadow: '0 1px 3px rgba(79, 70, 229, 0.15)' }}
                                            title="Mark as Paid"
                                            onClick={() => { setMarkPaidModalItem(item); setSelectedTxIdToLink(null); setCreatedDateOption("due_date"); setCustomCreatedDate(item.date || todayStr); setNewTxModalData(null); }}
                                        >
                                            <Icon name="check" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )
                )}

                {filter === "overdue" && (
                    filteredOverdue.length === 0 ? (
                        <div className="empty-state" style={{ padding: '24px 12px', margin: 'auto 0' }}>
                            <Icon name={selectedDayStr && selectedDayStr > todayStr ? "calendar" : "check"} />
                            <div className="empty-state-text">
                                <h3>{selectedDayStr && selectedDayStr > todayStr ? "No Overdue Payments for Future Date" : "All Caught Up!"}</h3>
                                <p style={{ fontSize: '0.8rem', marginBottom: selectedDayStr && selectedDayStr > todayStr ? '8px' : '0' }}>
                                    {selectedDayStr && selectedDayStr > todayStr
                                        ? "Overdue items do not apply to future dates."
                                        : "No overdue payments found for this month."}
                                </p>
                                {selectedDayStr && selectedDayStr > todayStr && (
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        style={{ fontSize: '0.75rem', padding: '4px 10px', marginTop: '4px', cursor: 'pointer' }}
                                        onClick={() => setSelectedDay(null)}
                                    >
                                        Clear Date Filter to View Overdue Items
                                    </button>
                                )}
                            </div>
                        </div>
                    ) : (
                        filteredOverdue.map((item, idx) => (
                            <div key={item.id || idx} className="payments-item-card" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.8fr) minmax(0, 1.35fr) minmax(0, 1fr) 28px', gap: '8px', alignItems: 'center', padding: '6px 10px', minHeight: '38px' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                    {item.name}
                                </div>
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                    {item.category || "General"}
                                </div>
                                <div style={{ fontSize: '0.76rem', color: '#DC2626', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                    <span className="overdue-date-default">Due {formatDate(item.date, settings.dateFormat)}</span>
                                    <span className="overdue-days-hover" style={{ fontWeight: 700, background: '#FEE2E2', color: '#DC2626', padding: '1px 6px', borderRadius: '4px', border: '1px solid #FCA5A5' }}>
                                        {item.daysOverdue} Day{item.daysOverdue > 1 ? 's' : ''} Overdue
                                    </span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', whiteSpace: 'nowrap', minWidth: 0 }}>
                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: item.type === 'neutral' ? 'var(--info)' : (item.type === 'income' ? 'var(--success)' : 'var(--danger)'), overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'center' }}>
                                        {`${item.type === 'neutral' ? (item.neutralSign === '-' ? '-' : '+') : (item.type === 'income' ? '+' : '-')}${formatCurrency(item.amount)}`}
                                        {item.isVariableAmount && !item.hasBillInstance && (
                                            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, marginLeft: '3px' }} title="Estimated amount">(E)</span>
                                        )}
                                    </div>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '4px' }}>
                                    <button
                                        className="btn btn-primary btn-sm"
                                        style={{ width: '26px', height: '26px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#FEE2E2', color: '#DC2626', border: '1.5px solid #FCA5A5', cursor: 'pointer', flexShrink: 0, boxShadow: '0 1px 3px rgba(220, 38, 38, 0.15)' }}
                                        title="Mark as Paid"
                                        onClick={() => { setMarkPaidModalItem(item); setSelectedTxIdToLink(null); setCreatedDateOption("due_date"); setCustomCreatedDate(item.date || todayStr); setNewTxModalData(null); }}
                                    >
                                        <Icon name="check" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )
                )}

                {filter === "paid" && (
                    filteredPaid.length === 0 ? (
                        <div className="empty-state" style={{ padding: '24px 12px', margin: 'auto 0' }}>
                            <Icon name="transactions" />
                            <div className="empty-state-text">
                                <h3>No Paid / Received Payments</h3>
                                <p style={{ fontSize: '0.8rem' }}>No completed payment history recorded for this month.</p>
                            </div>
                        </div>
                    ) : (
                        filteredPaid.map((item, idx) => (
                            <div key={item.id || idx} className="payments-item-card" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1.8fr) minmax(0, 1.35fr) minmax(0, 1fr) 28px', gap: '8px', alignItems: 'center', padding: '6px 10px', minHeight: '38px' }}>
                                <div style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                    {nameParts(item, settings.recurring).title}
                                    {nameParts(item, settings.recurring).sub && (
                                        <span style={{ fontWeight: 400, fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: '6px' }} title={item.merchant}>· {nameParts(item, settings.recurring).sub.slice(0, 22)}…</span>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                    {item.category || "General"}
                                </div>
                                <div style={{ fontSize: '0.76rem', color: '#059669', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                    <span className="paid-date-default" style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                                        Due {formatDate(getItemDueDate(item), settings.dateFormat)}
                                    </span>
                                    <span className="paid-date-hover" style={{ fontWeight: 700, background: '#D1FAE5', color: '#065F46', padding: '1px 6px', borderRadius: '4px', border: '1px solid #6EE7B7' }}>
                                        ✓ {formatDate(item.date, settings.dateFormat)}
                                    </span>
                                </div>
                                <div style={{ fontWeight: 700, fontSize: '0.85rem', textAlign: 'right', whiteSpace: 'nowrap', color: item.type === 'income' ? 'var(--success)' : 'var(--danger)', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
                                    {`${item.type === 'income' ? '+' : '-'}${formatCurrency(item.amount)}`}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        style={{ width: '24px', height: '24px', padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', background: '#FEE2E2', color: '#DC2626', border: '1px solid #FCA5A5', cursor: 'pointer', flexShrink: 0 }}
                                        title="Unmark as Paid (Remove)"
                                        onClick={() => handleUnmarkPaid(item)}
                                    >
                                        <Icon name="close" />
                                    </button>
                                </div>
                            </div>
                        ))
                    )
                )}
            </div>

            {/* Mark Paid Confirmation / Transaction Match Modal */}
            {markPaidModalItem && (() => {
                const isIncome = markPaidModalItem.type === "income";
                const targetAmt = Math.abs(Number(markPaidModalItem.amount || 0));
                const sumMatches = Math.abs(selectedMapSum - targetAmt) < 0.01;
                const remainingAmt = Number(Math.max(0, targetAmt - selectedMapSum).toFixed(2));
                const hasRemaining = selectedMapSum < targetAmt && remainingAmt > 0.009;

                const exactDateMatch = samePriceMatches.find(t => toYYYYMMDD(t.date) === markPaidModalItem.date);
                const effectiveSelectedTxId = selectedTxIdToLink === null
                    ? (exactDateMatch ? exactDateMatch.id : (samePriceMatches[0]?.id || "__create_new__"))
                    : selectedTxIdToLink;
                const isCreatingNew = effectiveSelectedTxId === "__create_new__" || samePriceMatches.length === 0;
                const chosenCreationDate = createdDateOption === "due_date"
                    ? (markPaidModalItem.date || todayStr)
                    : (createdDateOption === "today"
                        ? todayStr
                        : (customCreatedDate || markPaidModalItem.date || todayStr));

                return (
                    <div className="modal-overlay" onClick={handleCloseMarkPaidModal}>
                        <div className="modal-container" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3 className="modal-title">
                                    {isMappingMode
                                        ? (isIncome ? "Map Inflow to Existing Transaction(s)" : "Map Outflow to Existing Transaction(s)")
                                        : (isIncome ? "Mark Inflow as Received" : "Mark Outflow as Paid")
                                    }
                                </h3>
                                <button className="modal-close-btn" onClick={handleCloseMarkPaidModal}>
                                    <Icon name="close" />
                                </button>
                            </div>
                            <div className="modal-body" style={{ padding: '16px' }}>
                                {!isMappingMode ? (
                                    <>
                                        <div style={{ padding: '14px 16px', borderRadius: '12px', background: isIncome ? '#F0FDF4' : '#F8FAFC', border: isIncome ? '1px solid #A7F3D0' : '1px solid #E2E8F0', marginBottom: '16px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: isIncome ? '#047857' : '#475569', background: isIncome ? '#D1FAE5' : '#E2E8F0', padding: '2px 8px', borderRadius: '10px' }}>
                                                    {isIncome ? "Inflow / Income" : "Outflow / Expense"}
                                                </span>
                                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{markPaidModalItem.category || "General"}</span>
                                            </div>
                                            <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-main)' }}>{markPaidModalItem.name}</div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '0.84rem' }}>
                                                <span style={{ color: 'var(--text-muted)' }}>Due Date: <strong style={{ color: 'var(--text-main)' }}>{formatDate(markPaidModalItem.date, settings.dateFormat)}</strong></span>
                                                <span><strong style={{ fontSize: '1.05rem', color: isIncome ? '#059669' : '#DC2626', whiteSpace: 'nowrap' }}>{`${isIncome ? '+' : '-'}${formatCurrency(markPaidModalItem.amount)}`}</strong></span>
                                            </div>
                                        </div>

                                        {samePriceMatches.length > 0 ? (
                                            <div>
                                                <p style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                                                    Found {samePriceMatches.length} unmapped transaction{samePriceMatches.length > 1 ? 's' : ''} matching <span style={{ whiteSpace: 'nowrap' }}>{`${isIncome ? '+' : '-'}${formatCurrency(markPaidModalItem.amount)}`}</span>:
                                                </p>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto', marginBottom: '12px' }}>
                                                    {samePriceMatches.map(tx => {
                                                        const isChecked = effectiveSelectedTxId === tx.id;
                                                        const isExactDate = toYYYYMMDD(tx.date) === markPaidModalItem.date;
                                                        const isNeutralTx = tx.type === "neutral";
                                                        const txSign = isNeutralTx ? (tx.neutralSign === "+" ? "+" : "-") : (isIncome ? "+" : "-");
                                                        const txColor = isNeutralTx ? "var(--info, #2563EB)" : (isIncome ? '#059669' : '#DC2626');
                                                        return (
                                                            <label
                                                                key={tx.id}
                                                                style={{
                                                                    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                                                                    borderRadius: '8px', border: isChecked ? '1.5px solid var(--primary)' : '1px solid var(--border-color)',
                                                                    background: isChecked ? 'var(--primary-light)' : '#fff', cursor: 'pointer'
                                                                }}
                                                            >
                                                                <input
                                                                    type="radio"
                                                                    name="txMatch"
                                                                    checked={isChecked}
                                                                    onChange={() => setSelectedTxIdToLink(tx.id)}
                                                                />
                                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <span style={{ fontWeight: 600, fontSize: '0.84rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                            {tx.merchant || tx.narration || "Transaction"}
                                                                        </span>
                                                                        {isExactDate && (
                                                                            <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: '#D1FAE5', color: '#065F46', fontWeight: 700 }}>
                                                                                Exact Date
                                                                            </span>
                                                                        )}
                                                                        {isNeutralTx && (
                                                                            <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: '#DBEAFE', color: '#1E40AF', fontWeight: 700 }}>
                                                                                Neutral
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
                                                                        <span>{formatDate(tx.date, settings.dateFormat)}</span>
                                                                        <span>• {tx.category || "General"}</span>
                                                                        <span>• {tx.account || "Account"}</span>
                                                                    </div>
                                                                </div>
                                                                <span style={{ fontWeight: 700, fontSize: '0.86rem', color: txColor, whiteSpace: 'nowrap' }}>
                                                                    {`${txSign}${formatCurrency(tx.amount)}`}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}

                                                    <label
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px',
                                                            borderRadius: '8px', border: effectiveSelectedTxId === '__create_new__' ? '1.5px solid var(--primary)' : '1px dashed var(--border-color)',
                                                            background: effectiveSelectedTxId === '__create_new__' ? 'var(--primary-light)' : '#FAFAFA', cursor: 'pointer'
                                                        }}
                                                    >
                                                        <input
                                                            type="radio"
                                                            name="txMatch"
                                                            checked={effectiveSelectedTxId === '__create_new__'}
                                                            onChange={() => setSelectedTxIdToLink('__create_new__')}
                                                        />
                                                        <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-main)' }}>
                                                            ➕ Create a new transaction instead
                                                        </div>
                                                    </label>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '10px 12px', borderRadius: '10px', background: '#FFFBEB', border: '1px solid #FCD34D', color: '#92400E', fontSize: '0.82rem', marginBottom: '12px' }}>
                                                    <div style={{ marginTop: '2px', flexShrink: 0 }}><Icon name="info" /></div>
                                                    <div>No unmapped transactions found matching <strong style={{ whiteSpace: 'nowrap' }}>{`${isIncome ? '+' : '-'}${formatCurrency(markPaidModalItem.amount)}`}</strong>.</div>
                                                </div>
                                                <p style={{ fontSize: '0.84rem', color: 'var(--text-main)', marginBottom: '8px' }}>
                                                    {isIncome ? "Would you like to record a new inflow transaction for this item?" : "Would you like to create a new outflow transaction for this item?"}
                                                </p>
                                            </div>
                                        )}

                                        {isCreatingNew && (
                                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', marginTop: '10px' }}>
                                                <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                                                    Choose Transaction Creation Date:
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                        <input
                                                            type="radio"
                                                            name="creationDateOpt"
                                                            checked={createdDateOption === "due_date"}
                                                            onChange={() => setCreatedDateOption("due_date")}
                                                        />
                                                        <span><strong>Due Date:</strong> {formatDate(markPaidModalItem.date, settings.dateFormat)} (Recommended)</span>
                                                    </label>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                        <input
                                                            type="radio"
                                                            name="creationDateOpt"
                                                            checked={createdDateOption === "today"}
                                                            onChange={() => setCreatedDateOption("today")}
                                                        />
                                                        <span><strong>Today:</strong> {formatDate(todayStr, settings.dateFormat)}</span>
                                                    </label>
                                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                        <input
                                                            type="radio"
                                                            name="creationDateOpt"
                                                            checked={createdDateOption === "custom"}
                                                            onChange={() => setCreatedDateOption("custom")}
                                                        />
                                                        <span><strong>Specific Date:</strong></span>
                                                        {createdDateOption === "custom" && (
                                                            <div style={{ width: '150px' }} onClick={(e) => e.stopPropagation()}>
                                                                <DatePickerField
                                                                    value={customCreatedDate || markPaidModalItem.date || todayStr}
                                                                    onChange={(val) => setCustomCreatedDate(val)}
                                                                    dateFormat={settings?.dateFormat}
                                                                    style={{ padding: '2px 8px', fontSize: '0.78rem', minHeight: '30px', borderRadius: '6px', border: '1px solid var(--border-color)', background: '#fff' }}
                                                                />
                                                            </div>
                                                        )}
                                                    </label>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {/* Multi-transaction mapping mode */}
                                        <div style={{ padding: '12px 14px', borderRadius: '10px', background: '#F8FAFC', border: '1px solid #E2E8F0', marginBottom: '12px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', fontWeight: 600 }}>
                                                <span>Item: <strong>{markPaidModalItem.name}</strong></span>
                                                <span>Target: <strong style={{ color: isIncome ? '#059669' : '#DC2626', whiteSpace: 'nowrap' }}>{`${isIncome ? '+' : '-'}${formatCurrency(markPaidModalItem.amount)}`}</strong></span>
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #CBD5E1', fontSize: '0.82rem' }}>
                                                <span>Selected ({selectedMapTxIds.length}): <strong>{formatCurrency(selectedMapSum)}</strong></span>
                                                {sumMatches ? (
                                                    <span style={{ background: '#D1FAE5', color: '#065F46', fontWeight: 700, padding: '2px 8px', borderRadius: '10px', fontSize: '0.74rem' }}>✓ Sum Matches!</span>
                                                ) : selectedMapSum < targetAmt ? (
                                                    <span style={{ background: '#FEF3C7', color: '#92400E', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', fontSize: '0.74rem' }}>Remaining: {formatCurrency(remainingAmt)}</span>
                                                ) : (
                                                    <span style={{ background: '#FEE2E2', color: '#991B1B', fontWeight: 600, padding: '2px 8px', borderRadius: '10px', fontSize: '0.74rem' }}>Exceeds by: {formatCurrency(selectedMapSum - targetAmt)}</span>
                                                )}
                                            </div>
                                        </div>

                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                            <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', margin: 0 }}>
                                                Select existing {isIncome ? "inflow" : "outflow"} or neutral transaction(s):
                                            </p>
                                            <button
                                                type="button"
                                                className="btn btn-secondary btn-sm"
                                                style={{ fontSize: '0.74rem', padding: '3px 8px', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}
                                                onClick={handleOpenAddTxModalForRemaining}
                                                title="Open full transaction form to create a new transaction"
                                            >
                                                <Icon name="plus" />
                                                <span>Create New Transaction</span>
                                            </button>
                                        </div>

                                        <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                                            {candidateTxList.length === 0 ? (
                                                <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                                    No existing {isIncome ? "inflow" : "outflow"} or neutral transactions found.
                                                </div>
                                            ) : (
                                                candidateTxList.map(tx => {
                                                    const isChecked = selectedMapTxIds.includes(tx.id);
                                                    const isNeutralTx = tx.type === "neutral";
                                                    const txSign = isNeutralTx ? (tx.neutralSign === "+" ? "+" : "-") : (isIncome ? "+" : "-");
                                                    const txColor = isNeutralTx ? "var(--info, #2563EB)" : (isIncome ? '#059669' : '#DC2626');
                                                    return (
                                                        <label
                                                            key={tx.id}
                                                            style={{
                                                                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                                                                borderRadius: '8px', border: isChecked ? '1.5px solid var(--primary)' : '1px solid var(--border-color)',
                                                                background: isChecked ? 'var(--primary-light)' : '#fff', cursor: 'pointer'
                                                            }}
                                                        >
                                                            <input
                                                                type="checkbox"
                                                                checked={isChecked}
                                                                onChange={() => {
                                                                    setSelectedMapTxIds(prev =>
                                                                        prev.includes(tx.id) ? prev.filter(id => id !== tx.id) : [...prev, tx.id]
                                                                    );
                                                                }}
                                                            />
                                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    <span style={{ fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                        {tx.merchant || tx.narration || "Transaction"}
                                                                    </span>
                                                                    {isNeutralTx && (
                                                                        <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: '#DBEAFE', color: '#1E40AF', fontWeight: 700 }}>
                                                                            Neutral
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '6px' }}>
                                                                    <span>{formatDate(tx.date, settings.dateFormat)}</span>
                                                                    <span>• {tx.category || "General"}</span>
                                                                    <span>• {tx.account || "Account"}</span>
                                                                </div>
                                                            </div>
                                                            <span style={{ fontWeight: 700, fontSize: '0.84rem', color: txColor, whiteSpace: 'nowrap' }}>
                                                                {`${txSign}${formatCurrency(tx.amount)}`}
                                                            </span>
                                                        </label>
                                                    );
                                                })
                                            )}
                                        </div>

                                        {hasRemaining && (
                                            <div
                                                style={{
                                                    marginTop: '8px',
                                                    padding: '10px 14px',
                                                    borderRadius: '8px',
                                                    border: '1.5px dashed var(--primary)',
                                                    background: 'var(--primary-light)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '12px'
                                                }}
                                            >
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-main)' }}>
                                                        Remaining to cover: <strong style={{ color: isIncome ? '#059669' : '#DC2626' }}>{formatCurrency(remainingAmt)}</strong>
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                        Open creation popup pre-filled with this balance (you can create one or multiple transactions).
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    className="btn btn-primary btn-sm"
                                                    style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem' }}
                                                    onClick={handleOpenAddTxModalForRemaining}
                                                >
                                                    <Icon name="plus" />
                                                    <span>Create Transaction</span>
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                            <div className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', padding: '12px 16px' }}>
                                {!isMappingMode ? (
                                    <>
                                        <button className="btn btn-secondary btn-sm" onClick={() => setIsMappingMode(true)}>
                                            Map to Existing Transaction(s)
                                        </button>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            style={isIncome ? { background: '#10B981', borderColor: '#059669' } : { background: '#DC2626', borderColor: '#B91C1C', color: '#FFFFFF' }}
                                            onClick={() => {
                                                if (isCreatingNew) {
                                                    confirmMarkPaid(markPaidModalItem, null, chosenCreationDate);
                                                } else {
                                                    confirmMarkPaid(markPaidModalItem, effectiveSelectedTxId);
                                                }
                                            }}
                                        >
                                            {!isCreatingNew
                                                ? "Link Selected Transaction"
                                                : (isIncome ? "Create & Record Inflow" : "Create & Mark Outflow Paid")
                                            }
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button className="btn btn-secondary btn-sm" onClick={handleBackFromMapping}>
                                            Back
                                        </button>
                                        <button
                                            className="btn btn-primary btn-sm"
                                            disabled={!sumMatches}
                                            style={!sumMatches ? { opacity: 0.5, cursor: 'not-allowed', background: '#94A3B8', borderColor: '#64748B' } : (isIncome ? { background: '#10B981', borderColor: '#059669' } : { background: '#DC2626', borderColor: '#B91C1C', color: '#FFFFFF' })}
                                            onClick={() => confirmMarkPaid(markPaidModalItem, selectedMapTxIds)}
                                        >
                                            {sumMatches
                                                ? `Link Selected (${selectedMapTxIds.length}) Transaction${selectedMapTxIds.length > 1 ? 's' : ''}`
                                                : "Sum Must Match Target Amount"
                                            }
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Full Transaction Creation Modal for Mapping Mode */}
            {newTxModalData && (
                <AddEntryModal
                    initialData={newTxModalData}
                    title={`Create ${markPaidModalItem?.type === "income" ? "Inflow" : "Outflow"} Transaction`}
                    settings={settings}
                    tags={tags || []}
                    onAddTag={onAddTag || (async (tag) => { await saveTagInDB(tag); if (typeof loadState === "function") await loadState(); })}
                    style={{ zIndex: 2000 }}
                    onClose={() => setNewTxModalData(null)}
                    onSave={handleSaveNewTxFromModal}
                />
            )}

            {/* Double Confirm Unmarking Modal Overlay */}
            {unmarkConfirmItem && (() => {
                const isMultiLinked = unmarkLinkedTxs.length > 1;
                const totalSum = unmarkLinkedTxs.reduce((acc, t) => acc + Math.abs(Number(t.amount || 0)), 0);
                const linkedRecId = unmarkConfirmItem.linkedRecurringId;
                const rItem = (settings.recurring || []).find(r => r && r.id === linkedRecId);
                const nwItem = (settings.networthItems || []).find(it => it && it.id === linkedRecId);
                const targetName = rItem?.name || nwItem?.name || unmarkConfirmItem.merchant || unmarkConfirmItem.narration || "Payment Item";

                const clickedTxAmount = Math.abs(Number(unmarkConfirmItem.amount || 0));
                const remainingTxs = unmarkLinkedTxs.filter(t => t.id !== unmarkConfirmItem.id);
                const remainingLinkedSum = remainingTxs.reduce((acc, t) => acc + Math.abs(Number(t.amount || 0)), 0);

                const fullTargetAmount = rItem
                    ? Math.abs(Number(rItem.estimatedAmount || rItem.amount || 0))
                    : (nwItem ? Math.abs(Number(nwItem.incomeExpense || 0)) : totalSum);

                const remainingUnpaidAmount = Number(Math.max(0, fullTargetAmount - remainingLinkedSum).toFixed(2));
                const targetDueDate = unmarkConfirmItem.scheduledDate || toYYYYMMDD(unmarkConfirmItem.date);
                const isOverdue = targetDueDate < todayStr;
                const destinationSection = isOverdue ? "Overdue" : "Upcoming";

                return (
                    <div className="modal-overlay" onClick={() => { setUnmarkConfirmItem(null); setUnmarkLinkedTxs([]); }}>
                        <div className="modal-container" style={{ maxWidth: '540px' }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)' }}>
                                <h3 className="modal-title" style={{ color: '#DC2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    ⚠️ {isMultiLinked ? "Confirm Unlinking Transaction" : "Confirm Unmarking Payment"}
                                </h3>
                                <button className="modal-close-btn" onClick={() => { setUnmarkConfirmItem(null); setUnmarkLinkedTxs([]); }}>
                                    <Icon name="close" />
                                </button>
                            </div>
                            <div className="modal-body" style={{ padding: '20px' }}>
                                {isMultiLinked ? (
                                    <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '14px', marginBottom: '16px', fontSize: '0.86rem', color: '#991B1B' }}>
                                        <div>
                                            This recurring payment for <strong>"{targetName}"</strong> (Target: <strong>{formatCurrency(fullTargetAmount)}</strong>) is linked to <strong>{unmarkLinkedTxs.length} transactions</strong> (Total: <strong>{formatCurrency(totalSum)}</strong>).
                                        </div>
                                        <div style={{ marginTop: '8px', padding: '8px 10px', background: '#FFFFFF', borderRadius: '6px', border: '1px solid #FECACA', color: '#7F1D1D', fontSize: '0.82rem' }}>
                                            Unlinking <strong>"{unmarkConfirmItem.narration || unmarkConfirmItem.merchant}"</strong> ({formatCurrency(clickedTxAmount)}) will leave {remainingTxs.length} transaction{remainingTxs.length > 1 ? 's' : ''} ({formatCurrency(remainingLinkedSum)}) linked, and move <strong>"{targetName}"</strong> to <strong>{destinationSection}</strong> with the remaining amount of <strong>{formatCurrency(remainingUnpaidAmount)}</strong>.
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '10px', padding: '14px', marginBottom: '16px', fontSize: '0.86rem', color: '#991B1B' }}>
                                        This recurring payment for <strong>"{targetName}"</strong> is linked to <strong>1 transaction</strong> ({formatCurrency(totalSum)}).
                                        <div style={{ marginTop: '6px' }}>
                                            Unmarking will move this item back to <strong>{destinationSection}</strong> and unlink/delete the transaction.
                                        </div>
                                    </div>
                                )}

                                <p style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '8px' }}>
                                    {isMultiLinked ? "Linked Transactions for this occurrence:" : "Linked Transaction to be Unlinked / Deleted:"}
                                </p>

                                <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px', paddingRight: '4px' }}>
                                    {unmarkLinkedTxs.map(t => {
                                        const isClicked = t.id === unmarkConfirmItem.id;
                                        const isNew = t.notes && (t.notes.includes("Created Inflow from Dashboard") || t.notes.includes("Created Outflow from Dashboard") || t.notes.startsWith("Created "));

                                        return (
                                            <div
                                                key={t.id}
                                                style={{
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    padding: '8px 12px', borderRadius: '8px',
                                                    background: isClicked ? '#FEF2F2' : '#F8FAFC',
                                                    border: isClicked ? '1.5px solid #DC2626' : '1px solid #E2E8F0',
                                                    fontSize: '0.82rem'
                                                }}
                                            >
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <strong style={{ color: 'var(--text-main)' }}>{t.narration || t.merchant}</strong>
                                                        {isClicked && isMultiLinked && (
                                                            <span style={{ fontSize: '0.68rem', padding: '1px 6px', borderRadius: '4px', background: '#FEE2E2', color: '#DC2626', fontWeight: 700 }}>
                                                                Selected to Unlink
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                                                        {formatDate(t.date, settings.dateFormat)} • {t.category || "General"}
                                                        {isClicked ? (
                                                            <span style={{ marginLeft: '6px', color: '#DC2626', fontWeight: 600 }}>
                                                                {isNew ? "(Will be deleted)" : "(Will be unlinked)"}
                                                            </span>
                                                        ) : (
                                                            <span style={{ marginLeft: '6px', color: '#059669', fontWeight: 600 }}>
                                                                (Will stay linked)
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={{ fontWeight: 700, color: t.type === 'income' ? '#059669' : '#DC2626', whiteSpace: 'nowrap' }}>
                                                    {`${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}`}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            <div className="modal-footer" style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => { setUnmarkConfirmItem(null); setUnmarkLinkedTxs([]); }}>
                                    Cancel
                                </button>
                                {isMultiLinked ? (
                                    <>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ color: '#DC2626', borderColor: '#FCA5A5' }}
                                            onClick={() => executeUnmarkPaid(unmarkLinkedTxs, unmarkConfirmItem)}
                                        >
                                            Unlink All ({unmarkLinkedTxs.length})
                                        </button>
                                        <button
                                            className="btn btn-danger btn-sm"
                                            style={{ background: '#DC2626', color: '#FFF', fontWeight: 700, padding: '6px 14px', borderRadius: '8px' }}
                                            onClick={() => executeUnlinkSingle(unmarkConfirmItem, unmarkLinkedTxs)}
                                        >
                                            Unlink This ({formatCurrency(clickedTxAmount)})
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        className="btn btn-danger btn-sm"
                                        style={{ background: '#DC2626', color: '#FFF', fontWeight: 700, padding: '6px 14px', borderRadius: '8px' }}
                                        onClick={() => executeUnmarkPaid(unmarkLinkedTxs, unmarkConfirmItem)}
                                    >
                                        Confirm & Unlink
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Log Bill Instance Modal */}
            {loggingBillItem && (
                <LogBillInstanceModal
                    item={loggingBillItem}
                    settings={settings}
                    referenceDate={viewDate}
                    onClose={() => setLoggingBillItem(null)}
                    onSave={handleSaveBillInstance}
                    onClear={handleClearBillInstance}
                />
            )}
        </div>
    );
};

// --- SUB-COMPONENT: Custom SVG Line/Area Cash Flow Chart ---
const CashFlowSvgChart = ({ transactions, settings }) => {
    const [hoveredIdx, setHoveredIdx] = React.useState(null);

    // Group transactions by month (last 7 months)
    const monthsNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthlyTotals = {};

    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const label = `${monthsNames[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`;
        monthlyTotals[label] = { income: 0, expense: 0, dateObj: d };
    }

    transactions.forEach(t => {
        const tDate = new Date(t.date);
        if (isNaN(tDate.getTime())) return;
        const label = `${monthsNames[tDate.getMonth()]} ${String(tDate.getFullYear()).slice(-2)}`;
        if (monthlyTotals[label]) {
            if (t.type === "income") monthlyTotals[label].income += t.amount;
            else monthlyTotals[label].expense += t.amount;
        }
    });

    const keys = Object.keys(monthlyTotals);
    const dataPoints = keys.map(k => ({
        label: k,
        income: monthlyTotals[k].income,
        expense: monthlyTotals[k].expense,
        net: monthlyTotals[k].income - monthlyTotals[k].expense
    }));

    const activeIdx = hoveredIdx !== null ? hoveredIdx : dataPoints.length - 1;
    const activePoint = dataPoints[activeIdx] || dataPoints[0];

    const maxVal = Math.max(
        ...dataPoints.map(d => Math.max(d.income, d.expense)),
        100
    );

    const width = 500;
    const height = 210;
    const paddingLeft = 45;
    const paddingRight = 15;
    const paddingTop = 20;
    const paddingBottom = 30;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;

    const getX = (idx) => paddingLeft + (idx / Math.max(1, dataPoints.length - 1)) * chartWidth;
    const getY = (val) => height - paddingBottom - (val / maxVal) * chartHeight;

    // Generate smooth Bezier curve string
    const generateSmoothPath = (points) => {
        if (!points || points.length === 0) return "";
        if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
        let path = `M ${points[0].x} ${points[0].y}`;
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[i];
            const p1 = points[i + 1];
            const mx = (p0.x + p1.x) / 2;
            path += ` C ${mx} ${p0.y}, ${mx} ${p1.y}, ${p1.x} ${p1.y}`;
        }
        return path;
    };

    const incomePts = dataPoints.map((d, i) => ({ x: getX(i), y: getY(d.income) }));
    const expensePts = dataPoints.map((d, i) => ({ x: getX(i), y: getY(d.expense) }));

    const incomePath = generateSmoothPath(incomePts);
    const expensePath = generateSmoothPath(expensePts);

    const yBottom = getY(0);
    const x0 = getX(0);
    const xN = getX(dataPoints.length - 1);

    const incomeArea = incomePath ? `${incomePath} L ${xN} ${yBottom} L ${x0} ${yBottom} Z` : "";
    const expenseArea = expensePath ? `${expensePath} L ${xN} ${yBottom} L ${x0} ${yBottom} Z` : "";

    const formatCurrency = (val) => formatCurrencyVal(val, settings.currency || "INR");

    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* Header line with title and active point highlight */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <span style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-main)' }}>Cash Flow Trends</span>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginLeft: '8px' }}>
                        ({activePoint.label})
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.82rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Net:</span>
                    <span className="dashboard-badge-pill" style={{
                        background: activePoint.net >= 0 ? '#ECFDF5' : '#FEF2F2',
                        color: activePoint.net >= 0 ? '#059669' : '#DC2626',
                        border: activePoint.net >= 0 ? '1px solid #A7F3D0' : '1px solid #FECACA'
                    }}>
                        {activePoint.net >= 0 ? '+' : ''}{formatCurrency(activePoint.net)}
                    </span>
                </div>
            </div>

            <div style={{ position: 'relative', width: '100%' }}>
                <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{ overflow: 'visible' }}>
                    <defs>
                        <linearGradient id="incGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#10B981" stopOpacity="0.22" />
                            <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                        </linearGradient>
                        <linearGradient id="expGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#F59E0B" stopOpacity="0.22" />
                            <stop offset="100%" stopColor="#F59E0B" stopOpacity="0.0" />
                        </linearGradient>
                    </defs>

                    {/* Horizontal Grid lines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio, idx) => {
                        const val = maxVal * ratio;
                        const y = getY(val);
                        return (
                            <g key={idx}>
                                <line x1={paddingLeft} y1={y} x2={width - paddingRight} y2={y} stroke="var(--border-color)" strokeWidth="0.5" strokeDasharray="4 4" />
                                <text x={paddingLeft - 8} y={y + 3} textAnchor="end" fill="var(--text-light)" fontSize="8px">
                                    {getCurrencySymbol(settings?.currency || "INR")}{Math.round(val)}
                                </text>
                            </g>
                        );
                    })}

                    {/* Fill Areas */}
                    {incomeArea && <path d={incomeArea} fill="url(#incGrad)" />}
                    {expenseArea && <path d={expenseArea} fill="url(#expGrad)" />}

                    {/* Smooth Stroke Curves */}
                    {incomePath && <path d={incomePath} fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" />}
                    {expensePath && <path d={expensePath} fill="none" stroke="#F59E0B" strokeWidth="2.5" strokeLinecap="round" />}

                    {/* Vertical Focus Line for hovered month */}
                    {activeIdx !== null && (
                        <line
                            x1={getX(activeIdx)}
                            y1={paddingTop}
                            x2={getX(activeIdx)}
                            y2={height - paddingBottom}
                            stroke="var(--primary)"
                            strokeWidth="1.5"
                            strokeDasharray="3 3"
                            opacity="0.6"
                        />
                    )}

                    {/* Interactive Data Dots & Month Columns */}
                    {dataPoints.map((d, idx) => {
                        const cx = getX(idx);
                        const cyInc = getY(d.income);
                        const cyExp = getY(d.expense);
                        const isSelected = idx === activeIdx;

                        return (
                            <g key={idx}
                                onMouseEnter={() => setHoveredIdx(idx)}
                                onMouseLeave={() => setHoveredIdx(null)}
                                style={{ cursor: 'pointer' }}
                            >
                                {/* Invisible wide hit target column */}
                                <rect
                                    x={cx - 20}
                                    y={paddingTop}
                                    width="40"
                                    height={chartHeight}
                                    fill="transparent"
                                />

                                {/* Income point */}
                                <circle cx={cx} cy={cyInc} r={isSelected ? "5" : "3.5"} fill="#10B981" stroke="#FFFFFF" strokeWidth="1.5" />
                                {/* Expense point */}
                                <circle cx={cx} cy={cyExp} r={isSelected ? "5" : "3.5"} fill="#F59E0B" stroke="#FFFFFF" strokeWidth="1.5" />
                            </g>
                        );
                    })}

                    {/* Month X Axis Labels */}
                    {dataPoints.map((d, idx) => (
                        <text
                            key={idx}
                            x={getX(idx)}
                            y={height - 8}
                            textAnchor="middle"
                            fill={idx === activeIdx ? 'var(--text-main)' : 'var(--text-muted)'}
                            fontWeight={idx === activeIdx ? "700" : "500"}
                            fontSize="9px"
                        >
                            {d.label}
                        </text>
                    ))}
                </svg>
            </div>

            {/* Chart Legend & Focus Summary */}
            <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', fontSize: '0.8rem', paddingTop: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '10px', backgroundColor: '#10B981', borderRadius: '50%' }}></span>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                        Income ({formatCurrency(activePoint.income)})
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '10px', height: '10px', backgroundColor: '#F59E0B', borderRadius: '50%' }}></span>
                    <span style={{ color: 'var(--text-muted)', fontWeight: 500 }}>
                        Expenses ({formatCurrency(activePoint.expense)})
                    </span>
                </div>
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: Custom SVG Category Donut Spend Chart (Main Category Rollup & Subcategory Drill-down) ---
const CategoryDonutSvgChart = ({ mainBreakdown = {}, mainTxCounts = {}, subBreakdownMap = {}, total = 0, settings, onViewTransactions }) => {
    const [selectedMainCategory, setSelectedMainCategory] = React.useState(null);
    const [hoveredIndex, setHoveredIndex] = React.useState(null);

    const formatCurrency = (val) => formatCurrencyVal(val, settings?.currency || "INR");

    const isSubView = selectedMainCategory !== null;

    // Determine data set based on view mode
    let currentBreakdown = {};
    let currentTxCounts = {};
    let viewTotal = total;

    if (isSubView) {
        const subObj = subBreakdownMap[selectedMainCategory] || {};
        Object.keys(subObj).forEach(subKey => {
            currentBreakdown[subKey] = subObj[subKey].amount;
            currentTxCounts[subKey] = subObj[subKey].count;
        });
        viewTotal = mainBreakdown[selectedMainCategory] || 0;
    } else {
        currentBreakdown = mainBreakdown;
        currentTxCounts = mainTxCounts;
    }

    const categories = Object.keys(currentBreakdown);
    const data = categories.map(catKey => {
        const val = currentBreakdown[catKey];
        const count = currentTxCounts[catKey] || 0;
        const percentage = viewTotal > 0 ? (val / viewTotal) * 100 : 0;

        let displayLabel = catKey;
        if (isSubView && catKey.includes(" - ")) {
            displayLabel = catKey.split(" - ")[1];
        }

        const subCount = !isSubView && subBreakdownMap[catKey] ? Object.keys(subBreakdownMap[catKey]).length : 0;

        return {
            key: catKey,
            label: catKey,
            displayLabel: displayLabel,
            value: val,
            count: count,
            percentage: percentage,
            subCount: subCount
        };
    }).sort((a, b) => b.value - a.value);

    const colors = [
        "#EF4444", "#F59E0B", "#10B981", "#3B82F6", "#8B5CF6",
        "#EC4899", "#06B6D4", "#F97316", "#14B8A6", "#84CC16",
        "#64748B"
    ];

    let accumulatedAngle = 0;
    const segments = data.map((d, idx) => {
        const angle = viewTotal > 0 ? (d.value / viewTotal) * 360 : 0;
        const strokeDashOffset = 100 - (accumulatedAngle / 360) * 100;
        const strokeDashArray = `${viewTotal > 0 ? (d.value / viewTotal) * 100 : 0} ${100 - (viewTotal > 0 ? (d.value / viewTotal) * 100 : 0)}`;
        accumulatedAngle += angle;
        return {
            ...d,
            color: colors[idx % colors.length],
            strokeDashArray,
            strokeDashOffset
        };
    });

    const activeSeg = hoveredIndex !== null ? segments[hoveredIndex] : null;

    if (segments.length === 0 || total <= 0) {
        return (
            <div className="empty-state" style={{ width: '100%', padding: '40px 20px', border: 'none', background: 'transparent' }}>
                <Icon name="budgets" />
                <div className="empty-state-text">
                    <h3 style={{ fontSize: '1.1rem' }}>No Expenses Recorded</h3>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem' }}>Create or import expenses to visualize category spending.</p>
                </div>
            </div>
        );
    }

    const topCategory = segments[0];
    const totalTxCount = segments.reduce((sum, s) => sum + s.count, 0);

    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header bar with title, centered back button & summary chips */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                {/* Left side: Icon & Title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '10px',
                        background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(59, 130, 246, 0.15))',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--primary)'
                    }}>
                        <Icon name="budgets" />
                    </div>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {isSubView ? `${selectedMainCategory} Subcategories` : "Category Spending Breakdown"}
                        </h3>
                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            {isSubView
                                ? `Subcategory distribution for ${selectedMainCategory} (${formatCurrency(viewTotal)})`
                                : `Distribution across ${segments.length} main categor${segments.length === 1 ? 'y' : 'ies'}`
                            }
                        </span>
                    </div>
                </div>

                {/* Center Column: Prominent Centered Back Button (if inspecting subcategories) */}
                {isSubView && (
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, minWidth: '200px' }}>
                        <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => {
                                setSelectedMainCategory(null);
                                setHoveredIndex(null);
                            }}
                            style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '7px 16px',
                                borderRadius: '20px',
                                fontWeight: 700,
                                fontSize: '0.84rem',
                                background: 'var(--bg-color)',
                                border: '1.5px solid var(--primary)',
                                color: 'var(--primary)',
                                boxShadow: '0 2px 8px rgba(79, 70, 229, 0.15)',
                                cursor: 'pointer',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            ← Back to Main Categories
                        </button>
                    </div>
                )}

                {/* Right side summary chips with total transaction count */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '5px 12px',
                        borderRadius: '20px',
                        background: 'var(--bg-color)',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.8rem'
                    }}>
                        <span style={{ color: 'var(--text-muted)' }}>Category:</span>
                        <span style={{ fontWeight: 700, color: 'var(--primary)' }}>
                            {isSubView ? selectedMainCategory : "All Categories"}
                        </span>
                    </div>
                    <div style={{
                        padding: '5px 12px',
                        borderRadius: '20px',
                        background: 'var(--bg-color)',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.8rem',
                        color: 'var(--text-main)',
                        fontWeight: 600
                    }}>
                        <span style={{ color: 'var(--text-muted)' }}>Transactions:</span> <span style={{ color: 'var(--primary)', fontWeight: 700 }}>{totalTxCount}</span>
                    </div>
                    <div style={{
                        padding: '5px 12px',
                        borderRadius: '20px',
                        background: 'var(--bg-color)',
                        border: '1px solid var(--border-color)',
                        fontSize: '0.8rem',
                        color: 'var(--text-main)',
                        fontWeight: 600
                    }}>
                        <span style={{ color: 'var(--text-muted)' }}>Spend:</span> <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{formatCurrency(viewTotal)}</span>
                    </div>
                </div>
            </div>

            {/* Full Width Top Horizontal Distribution Ratio Bar with direct labels */}
            <div style={{
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                background: 'var(--bg-color)',
                borderRadius: '14px',
                padding: '12px 16px',
                border: '1px solid var(--border-color)',
                boxShadow: 'var(--shadow-xs)',
                boxSizing: 'border-box'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Category Outflow Ratio
                    </span>
                    <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                        {activeSeg ? (
                            <>
                                <span style={{ color: activeSeg.color, fontWeight: 700 }}>{activeSeg.displayLabel}</span>: {formatCurrency(activeSeg.value)} ({activeSeg.percentage.toFixed(1)}% • {activeSeg.count} txns)
                            </>
                        ) : (
                            <span>{totalTxCount} total transactions across {segments.length} {isSubView ? 'subcategories' : 'categories'}</span>
                        )}
                    </span>
                </div>

                {/* Continuous Segmented Bar with Labels Inside */}
                <div style={{
                    width: '100%',
                    height: '26px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    display: 'flex',
                    background: 'var(--border-color)',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.12)'
                }}>
                    {segments.map((seg, idx) => (
                        <div
                            key={idx}
                            onMouseEnter={() => setHoveredIndex(idx)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            onClick={() => {
                                if (!isSubView && seg.subCount > 0) {
                                    setSelectedMainCategory(seg.key);
                                    setHoveredIndex(null);
                                }
                            }}
                            style={{
                                width: `${seg.percentage}%`,
                                height: '100%',
                                backgroundColor: seg.color,
                                opacity: (hoveredIndex === null || hoveredIndex === idx) ? 1 : 0.45,
                                cursor: (!isSubView && seg.subCount > 0) ? 'pointer' : 'default',
                                transition: 'all 0.2s ease',
                                boxShadow: hoveredIndex === idx ? `0 0 10px ${seg.color}` : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0 4px',
                                overflow: 'hidden',
                                boxSizing: 'border-box'
                            }}
                            title={`${seg.displayLabel}: ${formatCurrency(seg.value)} (${seg.percentage.toFixed(1)}% • ${seg.count} txns)`}
                        >
                            <span style={{
                                fontSize: '0.71rem',
                                fontWeight: 700,
                                color: '#FFFFFF',
                                textShadow: '0 1px 2px rgba(255,255,255,0.4)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                userSelect: 'none'
                            }}>
                                {seg.displayLabel} {seg.percentage.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Main Content Grid: Fixed Constant Height Category Breakdown Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                alignContent: 'start',
                gap: '12px',
                width: '100%',
                minHeight: '260px',
                maxHeight: '260px',
                overflowY: 'auto',
                padding: '4px 6px 10px 4px',
                boxSizing: 'border-box'
            }}>
                {segments.map((seg, idx) => {
                    const isHovered = hoveredIndex === idx;
                    const canDrill = !isSubView && seg.subCount > 0;
                    return (
                        <div
                            key={idx}
                            onMouseEnter={() => setHoveredIndex(idx)}
                            onMouseLeave={() => setHoveredIndex(null)}
                            onClick={() => {
                                if (canDrill) {
                                    setSelectedMainCategory(seg.key);
                                    setHoveredIndex(null);
                                }
                            }}
                            style={{
                                padding: '12px 14px',
                                borderRadius: '12px',
                                background: isHovered ? 'var(--card-bg)' : 'var(--bg-color)',
                                border: `1px solid ${isHovered ? seg.color : 'var(--border-color)'}`,
                                boxShadow: isHovered ? `0 4px 14px ${seg.color}20` : 'var(--shadow-xs)',
                                transform: isHovered ? 'translateY(-2px)' : 'none',
                                cursor: canDrill ? 'pointer' : 'default',
                                transition: 'all 0.2s ease',
                                boxSizing: 'border-box',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '8px'
                            }}
                        >
                            {/* Header Row: Dot + Title & Percentage Badge */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', overflow: 'hidden', minWidth: 0 }}>
                                    <span style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        backgroundColor: seg.color,
                                        flexShrink: 0,
                                        boxShadow: `0 0 5px ${seg.color}88`
                                    }}></span>
                                    <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={seg.key}>
                                        {seg.displayLabel}
                                    </span>
                                </div>
                                <span style={{
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    color: seg.color,
                                    background: seg.color + '18',
                                    padding: '2px 7px',
                                    borderRadius: '10px',
                                    flexShrink: 0
                                }}>
                                    {seg.percentage.toFixed(1)}%
                                </span>
                            </div>

                            {/* Amount & Txn count Button Row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
                                <span style={{ fontWeight: 800, fontSize: '1.02rem', color: 'var(--text-main)', display: 'block', lineHeight: 1.2 }}>
                                    {formatCurrency(seg.value)}
                                </span>

                                {onViewTransactions && seg.count > 0 && (
                                    <button
                                        style={{
                                            fontSize: '0.74rem',
                                            padding: '3px 9px',
                                            borderRadius: '8px',
                                            fontWeight: 700,
                                            whiteSpace: 'nowrap',
                                            flexShrink: 0,
                                            background: 'var(--card-bg)',
                                            border: '1.5px solid var(--border-color)',
                                            color: 'var(--text-main)',
                                            cursor: 'pointer',
                                            transition: 'all 0.2s ease',
                                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                        }}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.background = 'var(--primary)';
                                            e.currentTarget.style.color = '#ffffff';
                                            e.currentTarget.style.borderColor = 'var(--primary)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.background = 'var(--card-bg)';
                                            e.currentTarget.style.color = 'var(--text-main)';
                                            e.currentTarget.style.borderColor = 'var(--border-color)';
                                        }}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onViewTransactions(seg.key);
                                        }}
                                        title={`View ${seg.count} transaction${seg.count > 1 ? 's' : ''} for ${seg.key}`}
                                    >
                                        {seg.count} ➔
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

// --- SUB-PAGE: Transactions ---
