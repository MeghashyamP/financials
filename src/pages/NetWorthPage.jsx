import React from 'react';
import {
    Icon, formatDate, formatCurrencyVal, NET_WORTH_GROUPS, NET_WORTH_GROUP_KEYS,
    computeNetWorthMonthlyEstimate, getCurrencySymbol, useEscapeKey, getEffectiveNetWorthItemValue,
    getTodayStr, DatePickerField
} from '../utils.jsx';
import { CreateNetWorthItemModal } from '../components/modals/PlanningModals.jsx';

export const NetWorthPage = ({ settings, updateSetting, showToast, setActivePage, subpageActionSignal, activeSectionFilter: propActiveSectionFilter, setActiveSectionFilter: propSetActiveSectionFilter, collapsed: propCollapsed, setCollapsed: propSetCollapsed }) => {
    const items = settings.networthItems || [];
    const [showModal, setShowModal] = React.useState(false);
    const [editingItem, setEditingItem] = React.useState(null);
    const [defaultModalCategory, setDefaultModalCategory] = React.useState(null);
    const [localCollapsed, setLocalCollapsed] = React.useState({});
    const collapsed = propCollapsed !== undefined ? propCollapsed : localCollapsed;
    const setCollapsed = propSetCollapsed || setLocalCollapsed;
    const [quickBillItem, setQuickBillItem] = React.useState(null);
    const [quickBillAmount, setQuickBillAmount] = React.useState("");
    const [quickBillInvestedAmount, setQuickBillInvestedAmount] = React.useState("");
    const [selectedRecurringId, setSelectedRecurringId] = React.useState("");
    const [quickBillSyncMode, setQuickBillSyncMode] = React.useState("revolving");
    const [recurringSearch, setRecurringSearch] = React.useState("");
    const [isRecurringDropdownOpen, setIsRecurringDropdownOpen] = React.useState(false);
    const recurringDropdownRef = React.useRef(null);
    const [quickBalanceItem, setQuickBalanceItem] = React.useState(null);
    const [quickBalanceValue, setQuickBalanceValue] = React.useState("");
    const [quickBalanceDate, setQuickBalanceDate] = React.useState("");
    const [itemToDelete, setItemToDelete] = React.useState(null);
    const [localActiveSectionFilter, setLocalActiveSectionFilter] = React.useState("all");

    const activeSectionFilter = propActiveSectionFilter !== undefined ? propActiveSectionFilter : localActiveSectionFilter;
    const setActiveSectionFilter = propSetActiveSectionFilter || setLocalActiveSectionFilter;

    const closeQuickBill = React.useCallback(() => setQuickBillItem(null), []);
    const closeQuickBalance = React.useCallback(() => setQuickBalanceItem(null), []);
    const closeItemToDelete = React.useCallback(() => setItemToDelete(null), []);

    useEscapeKey(quickBillItem ? closeQuickBill : null);
    useEscapeKey(quickBalanceItem ? closeQuickBalance : null);
    useEscapeKey(itemToDelete ? closeItemToDelete : null);

    const prevSubpageActionSignal = React.useRef(subpageActionSignal);
    React.useEffect(() => {
        if (subpageActionSignal > prevSubpageActionSignal.current) {
            setEditingItem(null);
            setDefaultModalCategory(null);
            setShowModal(true);
        }
        prevSubpageActionSignal.current = subpageActionSignal;
    }, [subpageActionSignal]);

    const formatCurrency = (val) => formatCurrencyVal(val, settings.currency || "INR");

    // Dynamic resolution of item value (syncs with recurring amount or latest logged bill instance)
    const getEffectiveItemValue = React.useCallback((it) => {
        return getEffectiveNetWorthItemValue(it, settings?.recurring, settings?.billInstances);
    }, [settings?.recurring, settings?.billInstances]);

    const persistItems = async (updatedList) => {
        await updateSetting("networthItems", updatedList);
        const activeList = updatedList.filter(it => it.includeInNetWorth !== false);
        const assetKinds = ["asset", "balance", "income"];
        const totalAssets = activeList
            .filter(it => assetKinds.includes((NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind))
            .reduce((s, it) => s + getEffectiveItemValue(it), 0);
        const totalLiabs = activeList
            .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "liability")
            .reduce((s, it) => s + Math.abs(getEffectiveItemValue(it)), 0);
        await updateSetting("assetsTotal", totalAssets);
        await updateSetting("liabilitiesTotal", totalLiabs);
        await updateSetting("netWorthConfigured", true);
    };

    const handleSave = async (item) => {
        let updatedList;
        if (editingItem) {
            updatedList = items.map(it => it.id === editingItem.id ? { ...it, ...item } : it);
        } else {
            updatedList = [...items, { id: crypto.randomUUID(), ...item }];
        }
        await persistItems(updatedList);
        showToast(editingItem ? "Ledger entry updated" : "Ledger entry added");
        setShowModal(false);
        setEditingItem(null);
        setDefaultModalCategory(null);
    };

    const handleDelete = async (id) => {
        const updatedList = items.filter(it => it.id !== id);
        await persistItems(updatedList);
        showToast("Ledger entry removed");
    };

    const toggleIncludeInNetWorth = async (id) => {
        const updatedList = items.map(it => {
            if (it.id === id) {
                const nextState = it.includeInNetWorth === false ? true : false;
                showToast(nextState ? `"${it.name}" included in Net Worth` : `"${it.name}" excluded from Net Worth`);
                return { ...it, includeInNetWorth: nextState };
            }
            return it;
        });
        await persistItems(updatedList);
    };

    const handleQuickBillSave = async () => {
        if (!quickBillItem) return;
        const selectedRec = (settings?.recurring || []).find(r => r && r.id === selectedRecurringId);
        const isInvestment = (NET_WORTH_GROUPS.find(g => g.key === quickBillItem.category) || {}).kind === "investment";
        const pendingInst = selectedRec ? (settings?.billInstances || []).find(b => b && b.recurringId === selectedRec.id && b.status === 'pending') : null;
        const effectiveRecAmount = pendingInst ? Number(pendingInst.amount) : Number(selectedRec?.estimatedAmount || selectedRec?.amount || 0);

        const updatedList = items.map(it => {
            if (it.id === quickBillItem.id) {
                const finalVal = quickBillAmount !== "" ? Number(quickBillAmount) : Number(it.value || 0);
                const finalInvested = quickBillInvestedAmount !== "" ? Number(quickBillInvestedAmount) : (it.invested !== undefined ? Number(it.invested) : undefined);
                
                if (selectedRec) {
                    const isAmortizing = quickBillSyncMode === "amortizing";
                    const isSip = quickBillSyncMode === "sip";
                    const resolvedVal = (isAmortizing || isSip || isInvestment)
                        ? finalVal
                        : effectiveRecAmount;
                    return {
                        ...it,
                        linkedRecurringId: selectedRec.id,
                        syncMode: quickBillSyncMode,
                        value: resolvedVal,
                        ...(finalInvested !== undefined ? { invested: finalInvested } : {})
                    };
                } else {
                    return {
                        ...it,
                        linkedRecurringId: null,
                        syncMode: undefined,
                        value: finalVal,
                        ...(finalInvested !== undefined ? { invested: finalInvested } : {})
                    };
                }
            }
            return it;
        });

        await persistItems(updatedList);
        if (selectedRec) {
            const modeLabel = quickBillSyncMode === 'sip'
                ? 'Recurring SIP Accumulation'
                : quickBillSyncMode === 'amortizing'
                    ? 'Amortizing Loan Principal'
                    : 'Revolving Statement';
            showToast(`Saved "${quickBillItem.name}" linked with recurring "${selectedRec.name}" (${modeLabel})`);
        } else {
            showToast(`Saved balances for "${quickBillItem.name}"`);
        }
        setQuickBillItem(null);
        setIsRecurringDropdownOpen(false);
    };

    const handleQuickBalanceSave = async () => {
        if (!quickBalanceItem) return;
        const finalCurrentBal = quickBalanceValue !== "" ? Number(quickBalanceValue) : 0;
        const finalInvested = Number(quickBalanceItem.invested || 0);
        const finalValue = finalCurrentBal - finalInvested;

        const updatedList = items.map(it => {
            if (it.id === quickBalanceItem.id) {
                return {
                    ...it,
                    currentBalance: finalCurrentBal,
                    value: finalValue,
                    startDate: quickBalanceDate || getTodayStr()
                };
            }
            return it;
        });

        await persistItems(updatedList);
        showToast(`Updated balance for "${quickBalanceItem.name}" to ${formatCurrency(finalCurrentBal)}`);
        setQuickBalanceItem(null);
    };

    const toggleCollapse = (key) => setCollapsed(prev => ({ ...prev, [key]: !(prev[key] !== false) }));

    // Grand totals across items included in Net Worth calculation
    const activeItems = items.filter(it => it.includeInNetWorth !== false);

    const totalCashVal = activeItems
        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "balance")
        .reduce((s, it) => s + getEffectiveItemValue(it), 0);
    const totalAssetsVal = activeItems
        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "asset")
        .reduce((s, it) => s + getEffectiveItemValue(it), 0);
    const totalInvestmentsVal = activeItems
        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "investment")
        .reduce((s, it) => s + getEffectiveItemValue(it), 0);
    const totalLiabilitiesVal = activeItems
        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "liability")
        .reduce((s, it) => s + Math.abs(getEffectiveItemValue(it)), 0);
    const netWorthVal = totalCashVal + totalAssetsVal + totalInvestmentsVal - totalLiabilitiesVal;

    const cashCount = items.filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "balance").length;
    const assetCount = items.filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "asset").length;
    const investmentCount = items.filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "investment").length;
    const liabilityCount = items.filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "liability").length;

    const SECTIONS = [
        {
            id: "assets",
            label: "Fixed & Physical Assets",
            subtitle: "Real estate property, vehicles, physical gold, precious metals & collectibles",
            icon: "🏠",
            color: "var(--primary)",
            bgTint: "rgba(99, 102, 241, 0.04)",
            borderAccent: "rgba(99, 102, 241, 0.3)",
            kinds: ["asset"],
            defaultCategory: "Fixed Assets",
            addBtnLabel: "+ Add Fixed Asset",
            count: assetCount,
            totalVal: totalAssetsVal
        },
        {
            id: "investments",
            label: "Investment Portfolios",
            subtitle: "Mutual funds, stocks, fixed deposits, bonds, retirement PF & crypto",
            icon: "📈",
            color: "var(--info)",
            bgTint: "rgba(59, 130, 246, 0.04)",
            borderAccent: "rgba(59, 130, 246, 0.3)",
            kinds: ["investment"],
            defaultCategory: "Mutual Funds & SIPs",
            addBtnLabel: "+ Add Investment",
            count: investmentCount,
            totalVal: totalInvestmentsVal
        },
        {
            id: "cash",
            label: "Bank & Cash Balances",
            subtitle: "Bank savings accounts, checking accounts, digital wallets & physical cash holdings",
            icon: "💵",
            color: "var(--success)",
            bgTint: "rgba(16, 185, 129, 0.04)",
            borderAccent: "rgba(16, 185, 129, 0.3)",
            kinds: ["balance"],
            defaultCategory: "Bank Accounts",
            addBtnLabel: "+ Add Bank / Cash",
            count: cashCount,
            totalVal: totalCashVal
        },
        {
            id: "liabilities",
            label: "Liabilities & Debt Principal",
            subtitle: "Home mortgage, personal loans, car loans & credit card statement owed",
            icon: "💳",
            color: "var(--danger)",
            bgTint: "rgba(239, 68, 68, 0.04)",
            borderAccent: "rgba(239, 68, 68, 0.3)",
            kinds: ["liability"],
            defaultCategory: "Liabilities",
            addBtnLabel: "+ Add Debt / Loan",
            count: liabilityCount,
            totalVal: totalLiabilitiesVal
        }
    ];

    const visibleSections = activeSectionFilter === "all"
        ? SECTIONS
        : SECTIONS.filter(s => s.id === activeSectionFilter);

    return (
        <div>
            {/* Master Section Blocks */}
            {items.length === 0 ? (
                <div className="empty-state">
                    <Icon name="networth" />
                    <div className="empty-state-text">
                        <h3>No Ledger Entries Yet</h3>
                        <p>Add your fixed assets, investment portfolio, gold, loans and bank balances to track your complete net worth.</p>
                        <button className="btn btn-primary" onClick={() => setShowModal(true)}>Add Asset / Liability</button>
                    </div>
                </div>
            ) : (
                visibleSections.map(section => {
                    const secItems = items.filter(it => section.kinds.includes((NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind));
                    const secActiveItems = secItems.filter(it => it.includeInNetWorth !== false);
                    const secTotalVal = section.id === "liabilities"
                        ? secActiveItems.reduce((s, it) => s + Math.abs(getEffectiveItemValue(it)), 0)
                        : secActiveItems.reduce((s, it) => s + getEffectiveItemValue(it), 0);
                    const isSecCollapsed = collapsed[section.id] !== false;

                    return (
                        <div
                            key={section.id}
                            className="section-card"
                            style={{
                                marginBottom: '28px',
                                border: `1px solid ${section.borderAccent}`,
                                borderRadius: '16px',
                                overflow: 'hidden',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                background: 'var(--card-bg)'
                            }}
                        >
                            {/* Master Section Header Block */}
                            <div
                                style={{
                                    padding: '16px 20px',
                                    background: section.bgTint,
                                    borderBottom: isSecCollapsed ? 'none' : `1px solid ${section.borderAccent}`,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '12px',
                                    cursor: 'pointer',
                                    userSelect: 'none'
                                }}
                                onClick={() => toggleCollapse(section.id)}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                    <div style={{
                                        width: '40px',
                                        height: '40px',
                                        borderRadius: '12px',
                                        background: 'var(--bg-color)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: '1.3rem',
                                        border: `1px solid ${section.borderAccent}`
                                    }}>
                                        {section.icon}
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>{section.label}</h3>
                                            <span style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '2px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600 }}>
                                                {secItems.length} {secItems.length === 1 ? 'Entry' : 'Entries'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>{section.subtitle}</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }} onClick={e => e.stopPropagation()}>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Section Total</div>
                                        <div style={{ fontSize: '1.18rem', fontWeight: 800, color: (section.id !== 'liabilities' && secTotalVal < 0) ? 'var(--danger)' : section.color }}>
                                            {formatCurrency(secTotalVal)}
                                        </div>
                                    </div>

                                    <button
                                        className="btn btn-secondary btn-sm"
                                        style={{
                                            borderRadius: '8px',
                                            fontSize: '0.78rem',
                                            fontWeight: 600,
                                            padding: '6px 12px',
                                            borderColor: section.borderAccent,
                                            color: section.color,
                                            background: 'var(--card-bg)'
                                        }}
                                        onClick={() => {
                                            setDefaultModalCategory(section.defaultCategory);
                                            setEditingItem(null);
                                            setShowModal(true);
                                        }}
                                    >
                                        {section.addBtnLabel}
                                    </button>

                                    <button
                                        className="btn btn-secondary btn-sm"
                                        style={{ border: 'none', padding: '6px', background: 'transparent', color: 'var(--text-muted)' }}
                                        onClick={() => toggleCollapse(section.id)}
                                    >
                                        <Icon name={isSecCollapsed ? "chevronDown" : "chevronUp"} />
                                    </button>
                                </div>
                            </div>

                            {/* Section Body: Category Sub-Blocks */}
                            {!isSecCollapsed && (
                                <div style={{ padding: '16px 20px' }}>
                                    {secItems.length === 0 ? (
                                        <div style={{
                                            padding: '28px 20px',
                                            textAlign: 'center',
                                            background: 'var(--bg-color)',
                                            borderRadius: '12px',
                                            border: '1px dashed var(--border-color)'
                                        }}>
                                            <div style={{ fontSize: '1.8rem', marginBottom: '6px' }}>{section.icon}</div>
                                            <div style={{ fontWeight: 600, fontSize: '0.92rem', color: 'var(--text-main)', marginBottom: '4px' }}>No entries in {section.label}</div>
                                            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Add entries to track your accurate balance in this section.</div>
                                            <button
                                                className="btn btn-primary btn-sm"
                                                onClick={() => {
                                                    setDefaultModalCategory(section.defaultCategory);
                                                    setEditingItem(null);
                                                    setShowModal(true);
                                                }}
                                            >
                                                {section.addBtnLabel}
                                            </button>
                                        </div>
                                    ) : (
                                        NET_WORTH_GROUPS.filter(g => section.kinds.includes(g.kind)).map(group => {
                                            const groupItems = items.filter(it => it.category === group.key);
                                            if (groupItems.length === 0) return null;
                                            const groupTotalValue = groupItems.reduce((s, it) => s + getEffectiveItemValue(it), 0);
                                            const isCatCollapsed = collapsed[group.key] !== false;

                                            return (
                                                <div
                                                    key={group.key}
                                                    style={{
                                                        marginBottom: '16px',
                                                        borderRadius: '12px',
                                                        border: '1px solid var(--border-color)',
                                                        background: 'var(--card-bg)',
                                                        overflow: 'hidden'
                                                    }}
                                                >
                                                    {/* Category Block Header */}
                                                    <div
                                                        style={{
                                                            padding: '12px 18px',
                                                            background: 'var(--bg-color)',
                                                            display: 'flex',
                                                            justifyContent: 'space-between',
                                                            alignItems: 'center',
                                                            cursor: 'pointer',
                                                            userSelect: 'none',
                                                            borderBottom: isCatCollapsed ? 'none' : '1px solid var(--border-color)'
                                                        }}
                                                        onClick={() => toggleCollapse(group.key)}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 600, fontSize: '0.92rem' }}>
                                                            <span>{group.icon}</span>
                                                            <span>{group.label}</span>
                                                            <span style={{ fontSize: '0.78rem', fontWeight: 500, color: 'var(--text-muted)', background: 'var(--card-bg)', padding: '1px 8px', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
                                                                {groupItems.length}
                                                            </span>
                                                        </div>

                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                                            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: (group.kind !== 'liability' && groupTotalValue < 0) ? 'var(--danger)' : `var(--${group.swatch})` }}>
                                                                {formatCurrency(groupTotalValue)}
                                                            </span>
                                                            <Icon name={isCatCollapsed ? "chevronDown" : "chevronUp"} />
                                                        </div>
                                                    </div>

                                                    {/* Table of Items */}
                                                    {!isCatCollapsed && (
                                                        <div className="table-responsive">
                                                            <table className="table" style={{ fontSize: '0.82rem', margin: 0 }}>
                                                                <thead>
                                                                    {group.kind === "balance" ? (
                                                                        <tr>
                                                                            <th style={{ paddingLeft: '18px', minWidth: '180px' }}>Name</th>
                                                                            <th style={{ minWidth: '120px' }}>Date</th>
                                                                            <th style={{ minWidth: '130px' }}>Current Balance</th>
                                                                            <th style={{ minWidth: '130px' }}>Minimum Balance</th>
                                                                            <th style={{ minWidth: '140px' }}>Current Value</th>
                                                                            <th style={{ minWidth: '140px' }}>Notes</th>
                                                                            <th style={{ width: '160px', minWidth: '160px', paddingRight: '18px' }}>Actions</th>
                                                                        </tr>
                                                                    ) : (group.kind === "asset" || (group.kind === "investment" && group.subKind === "market")) ? (
                                                                        <tr>
                                                                            <th style={{ paddingLeft: '18px', minWidth: '180px' }}>Name</th>
                                                                            <th style={{ minWidth: '130px' }}>{group.kind === "investment" ? "Investment Date" : "Purchase Date"}</th>
                                                                            <th style={{ minWidth: '130px' }}>Invested</th>
                                                                            <th style={{ minWidth: '140px' }}>Current Value</th>
                                                                            <th style={{ minWidth: '130px' }}>Gain / Loss</th>
                                                                            <th style={{ minWidth: '140px' }}>Notes</th>
                                                                            <th style={{ width: '160px', minWidth: '160px', paddingRight: '18px' }}>Actions</th>
                                                                        </tr>
                                                                    ) : (group.kind === "liability" && group.subKind === "revolving") ? (
                                                                        <tr>
                                                                            <th style={{ paddingLeft: '18px', minWidth: '180px' }}>Name</th>
                                                                            <th style={{ minWidth: '120px' }}>Due Date</th>
                                                                            <th style={{ minWidth: '130px' }}>Credit Limit</th>
                                                                            <th style={{ minWidth: '140px' }}>Outstanding Debt</th>
                                                                            <th style={{ minWidth: '140px' }}>Notes</th>
                                                                            <th style={{ width: '160px', minWidth: '160px', paddingRight: '18px' }}>Actions</th>
                                                                        </tr>
                                                                    ) : group.kind === "liability" ? (
                                                                        <tr>
                                                                            <th style={{ paddingLeft: '18px', minWidth: '180px' }}>Name</th>
                                                                            <th style={{ minWidth: '140px' }}>Payoff Date</th>
                                                                            <th style={{ minWidth: '100px' }}>Interest Rate</th>
                                                                            <th style={{ minWidth: '150px' }}>Outstanding Debt</th>
                                                                            <th style={{ minWidth: '140px' }}>Notes</th>
                                                                            <th style={{ width: '160px', minWidth: '160px', paddingRight: '18px' }}>Actions</th>
                                                                        </tr>
                                                                    ) : (
                                                                        <tr>
                                                                            <th style={{ paddingLeft: '18px', minWidth: '180px' }}>Name</th>
                                                                            <th style={{ minWidth: '130px' }}>Start Date</th>
                                                                            <th style={{ minWidth: '140px' }}>Maturity Date</th>
                                                                            <th style={{ minWidth: '130px' }}>Invested</th>
                                                                            <th style={{ minWidth: '100px' }}>Interest Rate</th>
                                                                            <th style={{ minWidth: '150px' }}>Current Value</th>
                                                                            <th style={{ minWidth: '130px' }}>Gain / Loss</th>
                                                                            <th style={{ minWidth: '140px' }}>Notes</th>
                                                                            <th style={{ width: '160px', minWidth: '160px', paddingRight: '18px' }}>Actions</th>
                                                                        </tr>
                                                                    )}
                                                                </thead>
                                                                <tbody>
                                                                    {groupItems.map(it => {
                                                                        const isLiability = it.category === "Credit Cards" || group.kind === "liability";
                                                                        const isInvestment = group.kind === "investment" || (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "investment";
                                                                        const investedAmt = Number(it.invested || 0);
                                                                        const currentVal = getEffectiveItemValue(it);
                                                                        const gainVal = currentVal - investedAmt;
                                                                        const gainPct = investedAmt > 0 ? ((gainVal / investedAmt) * 100).toFixed(1) : null;
                                                                        const isLinked = Boolean(it.linkedRecurringId);
                                                                        const linkedRec = isLinked ? (settings?.recurring || []).find(rec => rec && rec.id === it.linkedRecurringId) : null;

                                                                        const renderBalanceBtn = () => {
                                                                            if (!isLiability && !isInvestment) return null;
                                                                            const btnIcon = isInvestment ? "📈" : "💳";
                                                                            const btnTitle = isInvestment
                                                                                ? (isLinked && linkedRec
                                                                                    ? `Synced with SIP: "${linkedRec.name}" (${formatCurrency(linkedRec.estimatedAmount || linkedRec.amount || 0)})`
                                                                                    : "Update Investment Balance & SIP Sync")
                                                                                : (isLinked && linkedRec
                                                                                    ? `Synced with recurring: "${linkedRec.name}" (${formatCurrency(linkedRec.estimatedAmount || linkedRec.amount || 0)})`
                                                                                    : "Update Recurring Bill Balance");

                                                                            return (
                                                                                <button
                                                                                    className="btn btn-secondary btn-sm"
                                                                                    style={{
                                                                                        padding: '3px 6px',
                                                                                        fontSize: '0.9rem',
                                                                                        display: 'inline-flex',
                                                                                        alignItems: 'center',
                                                                                        justifyContent: 'center',
                                                                                        background: isLinked ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                                                                                        borderColor: isLinked ? 'rgba(99, 102, 241, 0.45)' : 'transparent',
                                                                                        borderWidth: '1px',
                                                                                        borderStyle: 'solid',
                                                                                        borderRadius: '6px',
                                                                                        boxShadow: isLinked ? '0 0 0 1px rgba(99, 102, 241, 0.2)' : 'none'
                                                                                    }}
                                                                                    onClick={() => {
                                                                                        setQuickBillItem(it);
                                                                                        setSelectedRecurringId(it.linkedRecurringId || "");
                                                                                        const isTermLiability = ["Home Loan", "Auto & Personal Loans", "Education Loans", "Other Liabilities"].includes(it.category) || (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).subKind === "term";
                                                                                        const defaultSyncMode = isInvestment ? "sip" : (isTermLiability ? "amortizing" : "revolving");
                                                                                        const currentSyncMode = it.syncMode || defaultSyncMode;
                                                                                        setQuickBillSyncMode(currentSyncMode);
                                                                                        const effectiveVal = getEffectiveItemValue(it);
                                                                                        if (it.linkedRecurringId && currentSyncMode === "revolving" && !isInvestment) {
                                                                                            setQuickBillAmount(effectiveVal ?? "");
                                                                                        } else {
                                                                                            setQuickBillAmount(it.value !== undefined ? it.value : (effectiveVal ?? ""));
                                                                                        }
                                                                                        setQuickBillInvestedAmount(it.invested !== undefined ? it.invested : "");
                                                                                        setRecurringSearch("");
                                                                                        setIsRecurringDropdownOpen(false);
                                                                                    }}
                                                                                    title={btnTitle}
                                                                                >
                                                                                    {btnIcon}
                                                                                </button>
                                                                            );
                                                                        };

                                                                        if (group.kind === "balance") {
                                                                            const currBal = Number(it.currentBalance ?? (currentVal + investedAmt));
                                                                            return (
                                                                                <tr key={it.id}>
                                                                                    <td style={{ fontWeight: 600, paddingLeft: '18px', minWidth: '180px', wordBreak: 'break-word' }}>
                                                                                        {it.name}
                                                                                    </td>
                                                                                    <td style={{ minWidth: '120px', whiteSpace: 'nowrap' }}>{it.startDate ? formatDate(it.startDate, settings?.dateFormat) : "—"}</td>
                                                                                    <td style={{ fontWeight: 600 }}>{formatCurrency(currBal)}</td>
                                                                                    <td>{investedAmt ? formatCurrency(investedAmt) : "—"}</td>
                                                                                    <td style={{ fontWeight: 600, color: currentVal >= 0 ? "var(--success)" : "var(--danger)" }}>
                                                                                        {formatCurrency(currentVal)}
                                                                                    </td>
                                                                                    <td style={{ color: 'var(--text-muted)' }}>{it.notes || "—"}</td>
                                                                                    <td style={{ paddingRight: '18px' }}>
                                                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                                            <button
                                                                                                className="btn btn-secondary btn-sm"
                                                                                                style={{
                                                                                                    padding: '2px 6px',
                                                                                                    fontSize: '0.85rem',
                                                                                                    fontWeight: 600,
                                                                                                    background: it.includeInNetWorth !== false ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                                                                    color: it.includeInNetWorth !== false ? 'var(--success)' : 'var(--danger)',
                                                                                                    borderColor: it.includeInNetWorth !== false ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                                                                                                    display: 'inline-flex',
                                                                                                    alignItems: 'center',
                                                                                                    justifyContent: 'center'
                                                                                                }}
                                                                                                onClick={() => toggleIncludeInNetWorth(it.id)}
                                                                                                title={it.includeInNetWorth !== false ? "Included in Net Worth calculation (Click to toggle)" : "Excluded from Net Worth calculation (Click to toggle)"}
                                                                                            >
                                                                                                {it.includeInNetWorth !== false ? "✅" : "❌"}
                                                                                            </button>
                                                                                            {(() => {
                                                                                                const isUpdatedToday = it.startDate === getTodayStr();
                                                                                                return (
                                                                                                    <button
                                                                                                        className="btn btn-secondary btn-sm"
                                                                                                        style={{
                                                                                                            padding: '3px 6px',
                                                                                                            fontSize: '0.9rem',
                                                                                                            display: 'inline-flex',
                                                                                                            alignItems: 'center',
                                                                                                            justifyContent: 'center',
                                                                                                            background: isUpdatedToday ? 'rgba(16, 185, 129, 0.16)' : 'transparent',
                                                                                                            borderColor: isUpdatedToday ? 'rgba(16, 185, 129, 0.45)' : 'transparent',
                                                                                                            color: isUpdatedToday ? 'var(--success)' : 'inherit',
                                                                                                            borderWidth: '1px',
                                                                                                            borderStyle: 'solid',
                                                                                                            borderRadius: '6px',
                                                                                                            boxShadow: isUpdatedToday ? '0 0 0 1px rgba(16, 185, 129, 0.25)' : 'none'
                                                                                                        }}
                                                                                                        onClick={() => {
                                                                                                            setQuickBalanceItem(it);
                                                                                                            const currBal = Number(it.currentBalance ?? (currentVal + investedAmt));
                                                                                                            setQuickBalanceValue(currBal !== undefined ? currBal : "");
                                                                                                            setQuickBalanceDate(getTodayStr());
                                                                                                        }}
                                                                                                        title={isUpdatedToday ? `Updated Today (${formatDate(it.startDate, settings?.dateFormat)}) - Click to adjust balance` : (it.startDate ? `Update Balance (Last updated: ${formatDate(it.startDate, settings?.dateFormat)})` : "Update Current Balance")}
                                                                                                    >
                                                                                                        💵
                                                                                                    </button>
                                                                                                );
                                                                                            })()}
                                                                                            <button className="btn btn-secondary btn-sm" style={{ border: 'none', padding: '4px' }}
                                                                                                onClick={() => { setEditingItem(it); setShowModal(true); }}
                                                                                                title="Edit Entry">
                                                                                                <Icon name="edit" />
                                                                                            </button>
                                                                                            <button className="btn btn-secondary btn-sm" style={{ border: 'none', padding: '4px', color: 'var(--danger)' }}
                                                                                                onClick={() => setItemToDelete(it)}
                                                                                                title="Delete Entry">
                                                                                                <Icon name="trash" />
                                                                                            </button>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        }

                                                                        if (group.kind === "asset" || (group.kind === "investment" && group.subKind === "market")) {
                                                                            return (
                                                                                <tr key={it.id}>
                                                                                    <td style={{ fontWeight: 600, paddingLeft: '18px', minWidth: '180px', wordBreak: 'break-word' }}>
                                                                                        {it.name}
                                                                                    </td>
                                                                                    <td style={{ minWidth: '130px', whiteSpace: 'nowrap' }}>{it.startDate ? formatDate(it.startDate, settings?.dateFormat) : "—"}</td>
                                                                                    <td>{investedAmt ? formatCurrency(investedAmt) : "—"}</td>
                                                                                    <td style={{ fontWeight: 600, color: currentVal >= 0 ? "var(--success)" : "var(--danger)" }}>
                                                                                        {formatCurrency(currentVal)}
                                                                                    </td>
                                                                                    <td>
                                                                                        {investedAmt > 0 ? (
                                                                                            <span style={{ fontWeight: 600, color: gainVal >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                                                                {gainVal >= 0 ? "+" : ""}{formatCurrency(gainVal)} {gainPct !== null && `(${gainVal >= 0 ? "+" : ""}${gainPct}%)`}
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                                                                                        )}
                                                                                    </td>
                                                                                    <td style={{ color: 'var(--text-muted)' }}>{it.notes || "—"}</td>
                                                                                    <td style={{ paddingRight: '18px' }}>
                                                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                                            <button
                                                                                                className="btn btn-secondary btn-sm"
                                                                                                style={{
                                                                                                    padding: '2px 6px',
                                                                                                    fontSize: '0.85rem',
                                                                                                    fontWeight: 600,
                                                                                                    background: it.includeInNetWorth !== false ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                                                                    color: it.includeInNetWorth !== false ? 'var(--success)' : 'var(--danger)',
                                                                                                    borderColor: it.includeInNetWorth !== false ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                                                                                                    display: 'inline-flex',
                                                                                                    alignItems: 'center',
                                                                                                    justifyContent: 'center'
                                                                                                }}
                                                                                                onClick={() => toggleIncludeInNetWorth(it.id)}
                                                                                                title={it.includeInNetWorth !== false ? "Included in Net Worth calculation (Click to toggle)" : "Excluded from Net Worth calculation (Click to toggle)"}
                                                                                            >
                                                                                                {it.includeInNetWorth !== false ? "✅" : "❌"}
                                                                                            </button>
                                                                                            {renderBalanceBtn()}
                                                                                            <button className="btn btn-secondary btn-sm" style={{ border: 'none', padding: '4px' }}
                                                                                                onClick={() => { setEditingItem(it); setShowModal(true); }}
                                                                                                title="Edit Entry">
                                                                                                <Icon name="edit" />
                                                                                            </button>
                                                                                            <button className="btn btn-secondary btn-sm" style={{ border: 'none', padding: '4px', color: 'var(--danger)' }}
                                                                                                onClick={() => setItemToDelete(it)}
                                                                                                title="Delete Entry">
                                                                                                <Icon name="trash" />
                                                                                            </button>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        }

                                                                        if (group.kind === "liability" && group.subKind === "revolving") {
                                                                            return (
                                                                                <tr key={it.id}>
                                                                                    <td style={{ fontWeight: 600, paddingLeft: '18px', minWidth: '180px', wordBreak: 'break-word' }}>
                                                                                        {it.name}
                                                                                    </td>
                                                                                    <td style={{ minWidth: '120px', whiteSpace: 'nowrap' }}>{it.startDate ? formatDate(it.startDate, settings?.dateFormat) : "—"}</td>
                                                                                    <td>{investedAmt ? formatCurrency(investedAmt) : "—"}</td>
                                                                                    <td style={{ fontWeight: 600, color: 'var(--danger)' }}>
                                                                                        {formatCurrency(currentVal)}
                                                                                    </td>
                                                                                    <td style={{ color: 'var(--text-muted)' }}>{it.notes || "—"}</td>
                                                                                    <td style={{ paddingRight: '18px' }}>
                                                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                                            <button
                                                                                                className="btn btn-secondary btn-sm"
                                                                                                style={{
                                                                                                    padding: '2px 6px',
                                                                                                    fontSize: '0.85rem',
                                                                                                    fontWeight: 600,
                                                                                                    background: it.includeInNetWorth !== false ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                                                                    color: it.includeInNetWorth !== false ? 'var(--success)' : 'var(--danger)',
                                                                                                    borderColor: it.includeInNetWorth !== false ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                                                                                                    display: 'inline-flex',
                                                                                                    alignItems: 'center',
                                                                                                    justifyContent: 'center'
                                                                                                }}
                                                                                                onClick={() => toggleIncludeInNetWorth(it.id)}
                                                                                                title={it.includeInNetWorth !== false ? "Included in Net Worth calculation (Click to toggle)" : "Excluded from Net Worth calculation (Click to toggle)"}
                                                                                            >
                                                                                                {it.includeInNetWorth !== false ? "✅" : "❌"}
                                                                                            </button>
                                                                                            {renderBalanceBtn()}
                                                                                            <button className="btn btn-secondary btn-sm" style={{ border: 'none', padding: '4px' }}
                                                                                                onClick={() => { setEditingItem(it); setShowModal(true); }}
                                                                                                title="Edit Entry">
                                                                                                <Icon name="edit" />
                                                                                            </button>
                                                                                            <button className="btn btn-secondary btn-sm" style={{ border: 'none', padding: '4px', color: 'var(--danger)' }}
                                                                                                onClick={() => setItemToDelete(it)}
                                                                                                title="Delete Entry">
                                                                                                <Icon name="trash" />
                                                                                            </button>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        }

                                                                        if (group.kind === "liability") {
                                                                            return (
                                                                                <tr key={it.id}>
                                                                                    <td style={{ fontWeight: 600, paddingLeft: '18px', minWidth: '180px', wordBreak: 'break-word' }}>
                                                                                        {it.name}
                                                                                    </td>
                                                                                    <td style={{ minWidth: '140px', whiteSpace: 'nowrap' }}>{it.endDate ? formatDate(it.endDate, settings?.dateFormat) : "—"}</td>
                                                                                    <td>{it.interestRate ? `${it.interestRate}%` : "—"}</td>
                                                                                    <td style={{ fontWeight: 600, color: "var(--danger)" }}>
                                                                                        {formatCurrency(currentVal)}
                                                                                    </td>
                                                                                    <td style={{ color: 'var(--text-muted)' }}>{it.notes || "—"}</td>
                                                                                    <td style={{ paddingRight: '18px' }}>
                                                                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                                            <button
                                                                                                className="btn btn-secondary btn-sm"
                                                                                                style={{
                                                                                                    padding: '2px 6px',
                                                                                                    fontSize: '0.85rem',
                                                                                                    fontWeight: 600,
                                                                                                    background: it.includeInNetWorth !== false ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                                                                    color: it.includeInNetWorth !== false ? 'var(--success)' : 'var(--danger)',
                                                                                                    borderColor: it.includeInNetWorth !== false ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                                                                                                    display: 'inline-flex',
                                                                                                    alignItems: 'center',
                                                                                                    justifyContent: 'center'
                                                                                                }}
                                                                                                onClick={() => toggleIncludeInNetWorth(it.id)}
                                                                                                title={it.includeInNetWorth !== false ? "Included in Net Worth calculation (Click to toggle)" : "Excluded from Net Worth calculation (Click to toggle)"}
                                                                                            >
                                                                                                {it.includeInNetWorth !== false ? "✅" : "❌"}
                                                                                            </button>
                                                                                            {renderBalanceBtn()}
                                                                                            <button className="btn btn-secondary btn-sm" style={{ border: 'none', padding: '4px' }}
                                                                                                onClick={() => { setEditingItem(it); setShowModal(true); }}
                                                                                                title="Edit Entry">
                                                                                                <Icon name="edit" />
                                                                                            </button>
                                                                                            <button className="btn btn-secondary btn-sm" style={{ border: 'none', padding: '4px', color: 'var(--danger)' }}
                                                                                                onClick={() => setItemToDelete(it)}
                                                                                                title="Delete Entry">
                                                                                                <Icon name="trash" />
                                                                                            </button>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        }

                                                                        return (
                                                                            <tr key={it.id}>
                                                                                <td style={{ fontWeight: 600, paddingLeft: '18px', minWidth: '200px', wordBreak: 'break-word' }}>
                                                                                    {it.name}
                                                                                </td>
                                                                                <td style={{ minWidth: '130px', whiteSpace: 'nowrap' }}>{it.startDate ? formatDate(it.startDate, settings?.dateFormat) : "—"}</td>
                                                                                <td style={{ minWidth: '140px', whiteSpace: 'nowrap' }}>{it.endDate ? formatDate(it.endDate, settings?.dateFormat) : "—"}</td>
                                                                                <td>{investedAmt ? formatCurrency(investedAmt) : "—"}</td>
                                                                                <td>{it.interestRate ? `${it.interestRate}%` : "—"}</td>
                                                                                <td style={{ fontWeight: 600, color: group.kind === "liability" ? "var(--danger)" : (currentVal >= 0 ? "var(--success)" : "var(--danger)") }}>
                                                                                    {formatCurrency(currentVal)}
                                                                                </td>
                                                                                <td>
                                                                                    {investedAmt > 0 ? (
                                                                                        <span style={{ fontWeight: 600, color: gainVal >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                                                            {gainVal >= 0 ? "+" : ""}{formatCurrency(gainVal)} {gainPct !== null && `(${gainVal >= 0 ? "+" : ""}${gainPct}%)`}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                                                                                    )}
                                                                                </td>
                                                                                <td style={{ color: 'var(--text-muted)' }}>{it.notes || "—"}</td>
                                                                                <td style={{ paddingRight: '18px' }}>
                                                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                                                        <button
                                                                                            className="btn btn-secondary btn-sm"
                                                                                            style={{
                                                                                                padding: '2px 6px',
                                                                                                fontSize: '0.85rem',
                                                                                                fontWeight: 600,
                                                                                                background: it.includeInNetWorth !== false ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                                                                color: it.includeInNetWorth !== false ? 'var(--success)' : 'var(--danger)',
                                                                                                borderColor: it.includeInNetWorth !== false ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
                                                                                                display: 'inline-flex',
                                                                                                alignItems: 'center',
                                                                                                justifyContent: 'center'
                                                                                            }}
                                                                                            onClick={() => toggleIncludeInNetWorth(it.id)}
                                                                                            title={it.includeInNetWorth !== false ? "Included in Net Worth calculation (Click to toggle)" : "Excluded from Net Worth calculation (Click to toggle)"}
                                                                                        >
                                                                                            {it.includeInNetWorth !== false ? "✅" : "❌"}
                                                                                        </button>
                                                                                        {renderBalanceBtn()}
                                                                                        <button className="btn btn-secondary btn-sm" style={{ border: 'none', padding: '4px' }}
                                                                                            onClick={() => { setEditingItem(it); setShowModal(true); }}
                                                                                            title="Edit Entry">
                                                                                            <Icon name="edit" />
                                                                                        </button>
                                                                                        <button className="btn btn-secondary btn-sm" style={{ border: 'none', padding: '4px', color: 'var(--danger)' }}
                                                                                            onClick={() => setItemToDelete(it)}
                                                                                            title="Delete Entry">
                                                                                            <Icon name="trash" />
                                                                                        </button>
                                                                                    </div>
                                                                                </td>
                                                                            </tr>
                                                                        );
                                                                    })}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })
            )}

            {/* Quick Credit Card / Liability / Investment Recurring Bill / SIP Update Modal */}
            {quickBillItem && (() => {
                const isInvestment = (NET_WORTH_GROUPS.find(g => g.key === quickBillItem.category) || {}).kind === "investment";
                const isLiability = (NET_WORTH_GROUPS.find(g => g.key === quickBillItem.category) || {}).kind === "liability" || quickBillItem.category === "Credit Cards";
                const isTermLiability = ["Home Loan", "Auto & Personal Loans", "Education Loans", "Other Liabilities"].includes(quickBillItem.category) || (NET_WORTH_GROUPS.find(g => g.key === quickBillItem.category) || {}).subKind === "term";

                const effectiveVal = getEffectiveItemValue(quickBillItem);
                const currentLinkedRec = (settings?.recurring || []).find(r => r && r.id === quickBillItem.linkedRecurringId);
                const previewSelectedRec = (settings?.recurring || []).find(r => r && r.id === selectedRecurringId);
                const allRecurring = (settings?.recurring || []).filter(Boolean);
                const filteredRecurring = allRecurring.filter(r => {
                    if (!recurringSearch.trim()) return true;
                    const q = recurringSearch.toLowerCase();
                    return (r.name && r.name.toLowerCase().includes(q)) ||
                        (r.category && r.category.toLowerCase().includes(q)) ||
                        (r.cadence && r.cadence.toLowerCase().includes(q));
                });

                const isLinked = Boolean(selectedRecurringId && previewSelectedRec);
                const isRevolving = isLinked && quickBillSyncMode === "revolving";
                const isAmortizing = isLinked && quickBillSyncMode === "amortizing";
                const isSip = isLinked && quickBillSyncMode === "sip";

                const previewPendingInst = previewSelectedRec ? (settings?.billInstances || []).find(b => b && b.recurringId === previewSelectedRec.id && b.status === 'pending') : null;
                const previewAmt = previewSelectedRec ? (previewPendingInst ? Number(previewPendingInst.amount) : Number(previewSelectedRec.estimatedAmount || previewSelectedRec.amount || 0)) : 0;

                const investedNum = Number(quickBillInvestedAmount || 0);
                const valueNum = (isRevolving && !isInvestment) ? previewAmt : Number(quickBillAmount || 0);
                const gainNum = valueNum - investedNum;
                const gainPct = investedNum > 0 ? ((gainNum / investedNum) * 100).toFixed(1) : null;

                return (
                    <div
                        className="modal-overlay"
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onClick={(e) => { if (e.target === e.currentTarget) { setQuickBillItem(null); setIsRecurringDropdownOpen(false); } }}
                    >
                        <div
                            className="modal-container"
                            style={{
                                width: '560px',
                                maxWidth: '94vw',
                                height: isInvestment ? '700px' : '660px',
                                maxHeight: '92vh',
                                display: 'flex',
                                flexDirection: 'column',
                                borderRadius: '16px',
                                overflow: 'hidden'
                            }}
                        >
                            {/* Modal Header */}
                            <div className="modal-header" style={{ padding: '18px 24px 14px 24px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
                                <div style={{ minWidth: 0, flex: 1, marginRight: '12px' }}>
                                    <h3 className="modal-title" style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                        {isInvestment ? "Update Investment & SIP Sync" : "Update Balance & Sync"}
                                    </h3>
                                    <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                        {isInvestment
                                            ? "Manage portfolio valuation, invested capital, and link recurring SIP accumulation."
                                            : "Manage statement balance or link to a recurring transaction template."}
                                    </p>
                                </div>
                                <button className="modal-close-btn" onClick={() => { setQuickBillItem(null); setIsRecurringDropdownOpen(false); }} title="Close">
                                    <Icon name="close" />
                                </button>
                            </div>

                            {/* Form Content */}
                            <form onSubmit={(e) => { e.preventDefault(); handleQuickBillSave(); }} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                                {/* Item Summary Card */}
                                <div style={{ padding: '14px 24px 0 24px', flexShrink: 0 }}>
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        padding: '12px 16px',
                                        backgroundColor: 'var(--bg-secondary, #F8FAFC)',
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '12px',
                                        gap: '12px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                <div style={{ fontWeight: 700, fontSize: '0.96rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {quickBillItem.name}
                                                </div>
                                                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span>{quickBillItem.category}</span>
                                                    {currentLinkedRec && (
                                                        <>
                                                            <span>•</span>
                                                            <span style={{ color: 'var(--primary, #4F46E5)', fontWeight: 600 }}>
                                                                🔗 Currently linked: {currentLinkedRec.name}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            {isInvestment && investedNum > 0 && (
                                                <div style={{
                                                    fontSize: '0.78rem',
                                                    fontWeight: 700,
                                                    padding: '3px 8px',
                                                    borderRadius: '6px',
                                                    background: gainNum >= 0 ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                                                    color: gainNum >= 0 ? 'var(--success)' : 'var(--danger)',
                                                    border: gainNum >= 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid rgba(239, 68, 68, 0.3)',
                                                    whiteSpace: 'nowrap'
                                                }}>
                                                    Gain: {gainNum >= 0 ? "+" : ""}{formatCurrency(gainNum)} {gainPct !== null && `(${gainNum >= 0 ? "+" : ""}${gainPct}%)`}
                                                </div>
                                            )}
                                        </div>

                                        {/* Inputs Section */}
                                        {isInvestment ? (
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                                                {/* Invested Amount (Capital) */}
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700 }}>
                                                            Invested Capital
                                                        </span>
                                                        {isSip && (
                                                            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--primary, #4F46E5)', background: 'rgba(99, 102, 241, 0.12)', padding: '1px 5px', borderRadius: '4px' }}>
                                                                + Auto-SIP
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                                                        <span style={{ position: 'absolute', left: '10px', fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-muted)', pointerEvents: 'none' }}>
                                                            {getCurrencySymbol(settings?.currency || "INR")}
                                                        </span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            className="form-control"
                                                            style={{
                                                                width: '100%',
                                                                boxSizing: 'border-box',
                                                                paddingLeft: '26px',
                                                                paddingRight: '10px',
                                                                fontSize: '0.94rem',
                                                                fontWeight: 700,
                                                                height: '38px',
                                                                borderRadius: '8px',
                                                                textAlign: 'right'
                                                            }}
                                                            value={quickBillInvestedAmount}
                                                            onChange={(e) => setQuickBillInvestedAmount(e.target.value)}
                                                            placeholder="0.00"
                                                        />
                                                    </div>
                                                </div>

                                                {/* Current Portfolio Value (Valuation) */}
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700 }}>
                                                            Current Valuation
                                                        </span>
                                                        {isSip && (
                                                            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--primary, #4F46E5)', background: 'rgba(99, 102, 241, 0.12)', padding: '1px 5px', borderRadius: '4px' }}>
                                                                + Auto-SIP
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                                                        <span style={{ position: 'absolute', left: '10px', fontSize: '0.86rem', fontWeight: 700, color: 'var(--text-muted)', pointerEvents: 'none' }}>
                                                            {getCurrencySymbol(settings?.currency || "INR")}
                                                        </span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            className="form-control"
                                                            style={{
                                                                width: '100%',
                                                                boxSizing: 'border-box',
                                                                paddingLeft: '26px',
                                                                paddingRight: '10px',
                                                                fontSize: '0.94rem',
                                                                fontWeight: 700,
                                                                height: '38px',
                                                                borderRadius: '8px',
                                                                textAlign: 'right'
                                                            }}
                                                            value={quickBillAmount}
                                                            onChange={(e) => setQuickBillAmount(e.target.value)}
                                                            placeholder="0.00"
                                                            required
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            /* Single Balance Input for Liabilities / Other */
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                                                <div style={{ minWidth: '220px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px', marginBottom: '4px', whiteSpace: 'nowrap' }}>
                                                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                            {isAmortizing ? "Principal Balance" : isRevolving ? "Statement Balance" : "Current Balance"}
                                                        </span>
                                                        {isRevolving && (
                                                            <span style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--primary, #4F46E5)', background: 'rgba(99, 102, 241, 0.12)', padding: '1px 5px', borderRadius: '4px', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                                                Auto-Synced
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                                                        <span style={{
                                                            position: 'absolute',
                                                            left: '10px',
                                                            fontSize: '0.86rem',
                                                            fontWeight: 700,
                                                            color: 'var(--text-muted)',
                                                            pointerEvents: 'none'
                                                        }}>
                                                            {getCurrencySymbol(settings?.currency || "INR")}
                                                        </span>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            className="form-control"
                                                            style={{
                                                                width: '100%',
                                                                boxSizing: 'border-box',
                                                                paddingLeft: '26px',
                                                                paddingRight: '10px',
                                                                fontSize: '0.96rem',
                                                                fontWeight: 700,
                                                                height: '38px',
                                                                borderRadius: '8px',
                                                                background: isRevolving ? 'rgba(0, 0, 0, 0.04)' : 'var(--card-bg, #fff)',
                                                                color: isRevolving ? 'var(--text-muted)' : 'var(--text-main)',
                                                                cursor: isRevolving ? 'not-allowed' : 'text',
                                                                textAlign: 'right'
                                                            }}
                                                            value={isRevolving ? previewAmt : quickBillAmount}
                                                            onChange={(e) => setQuickBillAmount(e.target.value)}
                                                            placeholder="0.00"
                                                            disabled={isRevolving}
                                                            required={!isRevolving}
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="modal-body" style={{ padding: '16px 24px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: '14px', overflowY: 'auto' }}>
                                    
                                    {/* 1. Recurring Transaction Dropdown Field (Search in top field only) */}
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                            <label style={{ fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>
                                                {isInvestment ? "Recurring SIP / Investment Template" : "Recurring Transaction Template"}
                                            </label>
                                            {selectedRecurringId && (
                                                <button
                                                    type="button"
                                                    onClick={() => { setSelectedRecurringId(""); setRecurringSearch(""); setIsRecurringDropdownOpen(false); }}
                                                    style={{
                                                        background: 'transparent',
                                                        border: 'none',
                                                        color: 'var(--danger, #EF4444)',
                                                        fontSize: '0.74rem',
                                                        fontWeight: 600,
                                                        cursor: 'pointer',
                                                        padding: 0
                                                    }}
                                                >
                                                    Unlink / Set None
                                                </button>
                                            )}
                                        </div>

                                        <div ref={recurringDropdownRef} style={{ position: 'relative', width: '100%' }}>
                                            {/* Direct Search Input Field */}
                                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }}>
                                                <span style={{
                                                    position: 'absolute',
                                                    left: '12px',
                                                    color: 'var(--text-muted)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    pointerEvents: 'none'
                                                }}>
                                                    <Icon name="search" />
                                                </span>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    placeholder={previewSelectedRec ? `Linked: ${previewSelectedRec.name} (Type to search...)` : (isInvestment ? "Search recurring SIP templates (or select None)..." : "Search recurring templates (or select None)...")}
                                                    value={recurringSearch}
                                                    onChange={(e) => {
                                                        setRecurringSearch(e.target.value);
                                                        setIsRecurringDropdownOpen(true);
                                                    }}
                                                    onFocus={() => setIsRecurringDropdownOpen(true)}
                                                    style={{
                                                        width: '100%',
                                                        boxSizing: 'border-box',
                                                        fontSize: '0.88rem',
                                                        paddingLeft: '34px',
                                                        paddingRight: (recurringSearch || selectedRecurringId) ? '62px' : '36px',
                                                        height: '44px',
                                                        borderRadius: '10px',
                                                        border: isRecurringDropdownOpen ? '1.5px solid var(--primary, #4F46E5)' : '1px solid var(--border-color)',
                                                        boxShadow: isRecurringDropdownOpen ? '0 0 0 3px rgba(99, 102, 241, 0.12)' : 'none'
                                                    }}
                                                />
                                                <div style={{ position: 'absolute', right: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    {(recurringSearch || selectedRecurringId) && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setRecurringSearch("");
                                                                if (!recurringSearch && selectedRecurringId) {
                                                                    setSelectedRecurringId("");
                                                                }
                                                            }}
                                                            style={{
                                                                background: 'transparent',
                                                                border: 'none',
                                                                color: 'var(--text-muted)',
                                                                cursor: 'pointer',
                                                                padding: '4px',
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                fontSize: '0.82rem',
                                                                borderRadius: '4px'
                                                            }}
                                                            title="Clear"
                                                        >
                                                            ✕
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => setIsRecurringDropdownOpen(prev => !prev)}
                                                        style={{
                                                            background: 'transparent',
                                                            border: 'none',
                                                            color: 'var(--text-muted)',
                                                            cursor: 'pointer',
                                                            padding: '4px',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '0.72rem',
                                                            transform: isRecurringDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                                                            transition: 'transform 0.2s ease'
                                                        }}
                                                        title={isRecurringDropdownOpen ? "Close list" : "Open list"}
                                                    >
                                                        ▼
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Selected Template Badge Card (When a template is selected) */}
                                            {previewSelectedRec && !recurringSearch && (
                                                <div style={{
                                                    marginTop: '6px',
                                                    padding: '8px 12px',
                                                    backgroundColor: 'rgba(99, 102, 241, 0.08)',
                                                    border: '1px solid rgba(99, 102, 241, 0.25)',
                                                    borderRadius: '8px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    gap: '8px'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                                        <div style={{
                                                            width: '22px',
                                                            height: '22px',
                                                            borderRadius: '6px',
                                                            background: 'var(--primary, #4F46E5)',
                                                            color: '#fff',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            fontSize: '0.75rem',
                                                            flexShrink: 0
                                                        }}>
                                                            <Icon name="link" />
                                                        </div>
                                                        <div style={{ minWidth: 0, flex: 1 }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{ fontWeight: 700, fontSize: '0.84rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                    {previewSelectedRec.name}
                                                                </span>
                                                                {quickBillItem.linkedRecurringId === previewSelectedRec.id && (
                                                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.15)', color: '#059669' }}>
                                                                        Current
                                                                    </span>
                                                                )}
                                                                {previewPendingInst && (
                                                                    <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.15)', color: 'var(--primary, #4F46E5)' }}>
                                                                        Logged
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)' }}>
                                                                {previewSelectedRec.category || 'General'} • <span style={{ textTransform: 'capitalize' }}>{previewSelectedRec.cadence || 'Monthly'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                        <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--primary, #4F46E5)' }}>
                                                            {formatCurrency(previewAmt)}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Dropdown Popup List */}
                                            {isRecurringDropdownOpen && (
                                                <div
                                                    style={{
                                                        position: 'absolute',
                                                        top: 'calc(100% + 6px)',
                                                        left: 0,
                                                        right: 0,
                                                        zIndex: 120,
                                                        background: 'var(--card-bg, #fff)',
                                                        border: '1px solid var(--border-color)',
                                                        borderRadius: '12px',
                                                        boxShadow: '0 12px 28px rgba(0, 0, 0, 0.18), 0 4px 10px rgba(0, 0, 0, 0.08)',
                                                        maxHeight: '260px',
                                                        display: 'flex',
                                                        flexDirection: 'column',
                                                        overflow: 'hidden'
                                                    }}
                                                >
                                                    {/* Dropdown Options */}
                                                    <div style={{ flex: 1, overflowY: 'auto', padding: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                        {/* Unlink / Manual Option */}
                                                        <div
                                                            style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'space-between',
                                                                padding: '8px 12px',
                                                                borderRadius: '8px',
                                                                border: selectedRecurringId === "" ? '1.5px solid var(--primary, #4F46E5)' : '1px solid transparent',
                                                                background: selectedRecurringId === "" ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                                                cursor: 'pointer',
                                                                transition: 'background 0.12s ease'
                                                            }}
                                                            onClick={() => {
                                                                setSelectedRecurringId("");
                                                                setRecurringSearch("");
                                                                setIsRecurringDropdownOpen(false);
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ fontSize: '0.9rem' }}>🚫</span>
                                                                <div>
                                                                    <div style={{ fontWeight: 600, fontSize: '0.84rem', color: selectedRecurringId === "" ? 'var(--primary, #4F46E5)' : 'var(--text-main)' }}>
                                                                        None (Manual / Unlink)
                                                                    </div>
                                                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                                                        Do not link to recurring template; manage balance manually
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            {selectedRecurringId === "" && (
                                                                <span style={{ fontWeight: 700, color: 'var(--primary, #4F46E5)', fontSize: '0.74rem' }}>Selected</span>
                                                            )}
                                                        </div>

                                                        {/* Recurring Templates List */}
                                                        {filteredRecurring.length === 0 ? (
                                                            <div style={{ padding: '16px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
                                                                No recurring templates found.
                                                            </div>
                                                        ) : (
                                                            filteredRecurring.map(r => {
                                                                const isSelected = selectedRecurringId === r.id;
                                                                const isCurrentlyLinked = quickBillItem.linkedRecurringId === r.id;
                                                                const pendingInst = (settings?.billInstances || []).find(b => b && b.recurringId === r.id && b.status === 'pending');
                                                                const rAmt = pendingInst ? Number(pendingInst.amount) : Number(r.estimatedAmount || r.amount || 0);

                                                                return (
                                                                    <div
                                                                        key={r.id}
                                                                        style={{
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            justifyContent: 'space-between',
                                                                            padding: '8px 12px',
                                                                            borderRadius: '8px',
                                                                            border: isSelected ? '1.5px solid var(--primary, #4F46E5)' : '1px solid transparent',
                                                                            background: isSelected ? 'rgba(99, 102, 241, 0.08)' : 'transparent',
                                                                            cursor: 'pointer',
                                                                            transition: 'background 0.12s ease'
                                                                        }}
                                                                        onClick={() => {
                                                                            setSelectedRecurringId(r.id);
                                                                            setRecurringSearch("");
                                                                            setIsRecurringDropdownOpen(false);
                                                                        }}
                                                                    >
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1, marginRight: '10px' }}>
                                                                            <div style={{
                                                                                width: '16px',
                                                                                height: '16px',
                                                                                borderRadius: '50%',
                                                                                border: isSelected ? '2px solid var(--primary, #4F46E5)' : '1.5px solid var(--border-color)',
                                                                                display: 'flex',
                                                                                alignItems: 'center',
                                                                                justifyContent: 'center',
                                                                                background: isSelected ? 'var(--primary, #4F46E5)' : 'transparent',
                                                                                flexShrink: 0
                                                                            }}>
                                                                                {isSelected && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#fff' }} />}
                                                                            </div>
                                                                            <div style={{ minWidth: 0, flex: 1 }}>
                                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                    <span style={{ fontWeight: 600, fontSize: '0.84rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                                                        {r.name}
                                                                                    </span>
                                                                                    {isCurrentlyLinked && (
                                                                                        <span style={{ fontSize: '0.64rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'rgba(16, 185, 129, 0.12)', color: '#059669' }}>
                                                                                            Current
                                                                                        </span>
                                                                                    )}
                                                                                    {pendingInst && (
                                                                                        <span style={{ fontSize: '0.64rem', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.12)', color: 'var(--primary, #4F46E5)' }}>
                                                                                            Logged
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', gap: '5px', alignItems: 'center' }}>
                                                                                    <span>{r.category || 'General'}</span>
                                                                                    <span>•</span>
                                                                                    <span style={{ textTransform: 'capitalize' }}>{r.cadence || 'Monthly'}</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                                                            <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-main)' }}>
                                                                                {formatCurrency(rAmt)}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* 2. Sync Mode Selector (Shown ONLY when recurring transaction is selected) */}
                                    {isLinked && (
                                        <div style={{ background: 'var(--bg-secondary, #F8FAFC)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-main)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                Sync Mode
                                            </div>
                                            {isInvestment ? (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                    <div
                                                        style={{
                                                            padding: '8px 10px',
                                                            borderRadius: '8px',
                                                            border: quickBillSyncMode === 'sip' ? '1.5px solid var(--primary, #4F46E5)' : '1px solid var(--border-color)',
                                                            background: quickBillSyncMode === 'sip' ? 'rgba(99, 102, 241, 0.08)' : 'var(--card-bg, #fff)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '2px',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                        onClick={() => setQuickBillSyncMode('sip')}
                                                    >
                                                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <span>📈 Recurring SIP Sync</span>
                                                            {quickBillSyncMode === 'sip' && <span style={{ color: 'var(--primary, #4F46E5)', fontSize: '0.72rem', fontWeight: 800 }}>✓</span>}
                                                        </div>
                                                        <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                                                            SIP payments ({formatCurrency(previewAmt)}) automatically add to Invested capital & Current value
                                                        </div>
                                                    </div>
                                                    <div
                                                        style={{
                                                            padding: '8px 10px',
                                                            borderRadius: '8px',
                                                            border: quickBillSyncMode === 'revolving' ? '1.5px solid var(--primary, #4F46E5)' : '1px solid var(--border-color)',
                                                            background: quickBillSyncMode === 'revolving' ? 'rgba(99, 102, 241, 0.08)' : 'var(--card-bg, #fff)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '2px',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                        onClick={() => setQuickBillSyncMode('revolving')}
                                                    >
                                                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <span>📊 Fixed / Manual Sync</span>
                                                            {quickBillSyncMode === 'revolving' && <span style={{ color: 'var(--primary, #4F46E5)', fontSize: '0.72rem', fontWeight: 800 }}>✓</span>}
                                                        </div>
                                                        <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                                                            Invested and valuation figures are managed manually
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                    <div
                                                        style={{
                                                            padding: '8px 10px',
                                                            borderRadius: '8px',
                                                            border: quickBillSyncMode === 'revolving' ? '1.5px solid var(--primary, #4F46E5)' : '1px solid var(--border-color)',
                                                            background: quickBillSyncMode === 'revolving' ? 'rgba(99, 102, 241, 0.08)' : 'var(--card-bg, #fff)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '2px',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                        onClick={() => setQuickBillSyncMode('revolving')}
                                                    >
                                                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <span>💳 Revolving Debt</span>
                                                            {quickBillSyncMode === 'revolving' && <span style={{ color: 'var(--primary, #4F46E5)', fontSize: '0.72rem', fontWeight: 800 }}>✓</span>}
                                                        </div>
                                                        <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                                                            Debt mirrors monthly statement bill (Credit Cards)
                                                        </div>
                                                    </div>
                                                    <div
                                                        style={{
                                                            padding: '8px 10px',
                                                            borderRadius: '8px',
                                                            border: quickBillSyncMode === 'amortizing' ? '1.5px solid var(--primary, #4F46E5)' : '1px solid var(--border-color)',
                                                            background: quickBillSyncMode === 'amortizing' ? 'rgba(99, 102, 241, 0.08)' : 'var(--card-bg, #fff)',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            flexDirection: 'column',
                                                            gap: '2px',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                        onClick={() => setQuickBillSyncMode('amortizing')}
                                                    >
                                                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                                            <span>🏠 Amortizing Loan</span>
                                                            {quickBillSyncMode === 'amortizing' && <span style={{ color: 'var(--primary, #4F46E5)', fontSize: '0.72rem', fontWeight: 800 }}>✓</span>}
                                                        </div>
                                                        <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', lineHeight: '1.2' }}>
                                                            Preserves principal & auto-reduces when EMI is paid
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* 3. Guidance Info Note */}
                                    <div style={{
                                        padding: '10px 14px',
                                        backgroundColor: 'var(--bg-secondary, #F8FAFC)',
                                        border: '1px dashed var(--border-color)',
                                        borderRadius: '10px',
                                        fontSize: '0.76rem',
                                        color: 'var(--text-muted)',
                                        lineHeight: '1.4'
                                    }}>
                                        {isSip ? (
                                            <span>
                                                💡 <strong>Recurring SIP Sync:</strong> When recurring SIP <strong>"{previewSelectedRec.name}"</strong> ({formatCurrency(previewAmt)}) is paid or marked paid on Dashboard, its amount is automatically added to both your <strong>Invested Capital</strong> and <strong>Current Portfolio Value</strong>.
                                            </span>
                                        ) : isRevolving && !isInvestment ? (
                                            <span>
                                                💡 <strong>Revolving Debt Sync:</strong> Balance automatically mirrors <strong>"{previewSelectedRec.name}"</strong> statement amount ({formatCurrency(previewAmt)}). Paying or updating this recurring bill adjusts the balance.
                                            </span>
                                        ) : isAmortizing ? (
                                            <span>
                                                💡 <strong>Amortizing Loan Sync:</strong> Balance reflects total remaining loan principal. When <strong>"{previewSelectedRec.name}"</strong> EMI ({formatCurrency(previewAmt)}) is logged, the principal balance reduces automatically.
                                            </span>
                                        ) : (
                                            <span>
                                                💡 <strong>Manual Tracking:</strong> Valuation and invested balances are maintained manually without automatic recurring template sync.
                                            </span>
                                        )}
                                    </div>

                                </div>

                                {/* Modal Footer */}
                                <div className="modal-footer" style={{ padding: '14px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '10px', flexShrink: 0 }}>
                                    <button type="button" className="btn btn-secondary" onClick={() => { setQuickBillItem(null); setIsRecurringDropdownOpen(false); }}>
                                        Cancel
                                    </button>
                                    <button type="submit" className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                                        <Icon name="check" />
                                        Save Changes
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}

            {/* Quick Bank & Cash Balance Update Modal */}
            {quickBalanceItem && (() => {
                const minBal = Number(quickBalanceItem.invested || 0);
                const currentBalNum = Number(quickBalanceValue || 0);
                const derivedCurrentVal = currentBalNum - minBal;
                const currSymbol = getCurrencySymbol(settings?.currency || "INR");

                return (
                    <div className="modal-overlay" onClick={() => setQuickBalanceItem(null)}>
                        <div
                            className="modal-container"
                            style={{ maxWidth: '440px', width: '92%', borderRadius: '16px', overflow: 'hidden' }}
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="modal-header" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(16, 185, 129, 0.05)', borderBottom: '1px solid rgba(16, 185, 129, 0.15)', padding: '16px 20px' }}>
                                <div style={{ textAlign: 'center' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                        <span>💵</span> Update Balance
                                    </h3>
                                    <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '2px', fontWeight: 500 }}>
                                        {quickBalanceItem.name}
                                    </div>
                                </div>
                                <button
                                    className="btn btn-secondary btn-sm"
                                    style={{ position: 'absolute', right: '16px', top: '16px', border: 'none', background: 'transparent' }}
                                    onClick={() => setQuickBalanceItem(null)}
                                >
                                    <Icon name="close" />
                                </button>
                            </div>

                            {/* Modal Body */}
                            <form onSubmit={(e) => { e.preventDefault(); handleQuickBalanceSave(); }}>
                                <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    
                                    {/* Current Balance Input */}
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label" style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px' }}>
                                            Current Balance
                                        </label>
                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                            <span style={{ position: 'absolute', left: '12px', fontWeight: 700, fontSize: '1.05rem', color: 'var(--text-muted)' }}>
                                                {currSymbol}
                                            </span>
                                            <input
                                                type="number"
                                                step="any"
                                                autoFocus
                                                required
                                                className="form-control"
                                                placeholder="0.00"
                                                style={{ paddingLeft: '32px', fontSize: '1.1rem', fontWeight: 700, height: '42px' }}
                                                value={quickBalanceValue}
                                                onChange={e => setQuickBalanceValue(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {/* Breakdown & Value Preview */}
                                    <div style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            <span>Minimum Required Balance:</span>
                                            <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{formatCurrency(minBal)}</span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', fontWeight: 700, borderTop: '1px dashed var(--border-color)', paddingTop: '6px' }}>
                                            <span>Effective Current Value:</span>
                                            <span style={{ color: derivedCurrentVal >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                                                {formatCurrency(derivedCurrentVal)}
                                            </span>
                                        </div>
                                    </div>

                                    {/* As of Date */}
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                                            As of Date
                                        </label>
                                        <DatePickerField
                                            value={quickBalanceDate}
                                            onChange={setQuickBalanceDate}
                                            dateFormat={settings?.dateFormat}
                                            label="Select date"
                                            style={{ fontSize: '0.88rem', height: '38px', fontWeight: 600, background: 'var(--card-bg)' }}
                                        />
                                    </div>
                                </div>

                                {/* Modal Footer */}
                                <div className="modal-footer" style={{ padding: '14px 24px', background: 'var(--bg-color)', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ fontSize: '0.85rem' }}
                                        onClick={() => setQuickBalanceItem(null)}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        style={{ fontSize: '0.85rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--success)', borderColor: 'var(--success)' }}
                                    >
                                        <Icon name="check" /> Update Balance
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}

            {/* Delete Ledger Entry Confirmation Modal */}
            {itemToDelete && (
                <div className="modal-overlay confirm-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setItemToDelete(null); }}>
                    <div className="modal-container" style={{ maxWidth: '420px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ color: 'var(--danger)' }}>Confirm Deletion</h3>
                            <button className="modal-close-btn" onClick={() => setItemToDelete(null)}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '12px', fontSize: '0.9rem' }}>Are you sure you want to delete this net worth entry?</p>
                            <div style={{ padding: '12px', backgroundColor: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.88rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Name:</span>
                                    <span style={{ fontWeight: 600 }}>{itemToDelete.name}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Category:</span>
                                    <span style={{ fontWeight: 500 }}>{NET_WORTH_GROUPS.find(g => g.key === itemToDelete.category)?.label || itemToDelete.category}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Current Value:</span>
                                    <span style={{ fontWeight: 600 }}>{formatCurrency(itemToDelete.value || 0)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setItemToDelete(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={async () => {
                                await handleDelete(itemToDelete.id);
                                setItemToDelete(null);
                            }}>
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showModal && (
                <CreateNetWorthItemModal
                    onClose={() => { setShowModal(false); setEditingItem(null); setDefaultModalCategory(null); }}
                    onSave={handleSave}
                    settings={settings}
                    editingItem={editingItem}
                    defaultCategory={defaultModalCategory}
                />
            )}
        </div>
    );
};

export default NetWorthPage;
