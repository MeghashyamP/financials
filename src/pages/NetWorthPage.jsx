import React from 'react';
import {
    Icon, formatDate, formatCurrencyVal, NET_WORTH_GROUPS, NET_WORTH_GROUP_KEYS,
    computeNetWorthMonthlyEstimate, getCurrencySymbol
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
    const [itemToDelete, setItemToDelete] = React.useState(null);
    const [localActiveSectionFilter, setLocalActiveSectionFilter] = React.useState("all");

    const activeSectionFilter = propActiveSectionFilter !== undefined ? propActiveSectionFilter : localActiveSectionFilter;
    const setActiveSectionFilter = propSetActiveSectionFilter || setLocalActiveSectionFilter;

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

    const persistItems = async (updatedList) => {
        await updateSetting("networthItems", updatedList);
        const activeList = updatedList.filter(it => it.includeInNetWorth !== false);
        const assetKinds = ["asset", "balance", "income"];
        const totalAssets = activeList
            .filter(it => assetKinds.includes((NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind))
            .reduce((s, it) => s + Number(it.value || 0), 0);
        const totalLiabs = activeList
            .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "liability")
            .reduce((s, it) => s + Math.abs(Number(it.value || 0)), 0);
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
        if (!quickBillItem || quickBillAmount === "") return;
        const updatedList = items.map(it => {
            if (it.id === quickBillItem.id) {
                return { ...it, value: Number(quickBillAmount) };
            }
            return it;
        });
        await persistItems(updatedList);
        showToast(`Statement balance updated for "${quickBillItem.name}"`);
        setQuickBillItem(null);
        setQuickBillAmount("");
    };

    const toggleCollapse = (key) => setCollapsed(prev => ({ ...prev, [key]: !(prev[key] !== false) }));

    // Grand totals across items included in Net Worth calculation
    const activeItems = items.filter(it => it.includeInNetWorth !== false);

    const totalCashVal = activeItems
        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "balance")
        .reduce((s, it) => s + Number(it.value || 0), 0);
    const totalAssetsVal = activeItems
        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "asset")
        .reduce((s, it) => s + Number(it.value || 0), 0);
    const totalInvestmentsVal = activeItems
        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "investment")
        .reduce((s, it) => s + Number(it.value || 0), 0);
    const totalLiabilitiesVal = activeItems
        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "liability")
        .reduce((s, it) => s + Math.abs(Number(it.value || 0)), 0);
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
                    const secTotalVal = secActiveItems.reduce((s, it) => s + Math.abs(Number(it.value || 0)), 0);
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
                                        <div style={{ fontSize: '1.18rem', fontWeight: 800, color: section.color }}>
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
                                            const groupTotalValue = groupItems.reduce((s, it) => s + Number(it.value || 0), 0);
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
                                                            <span style={{ fontWeight: 700, fontSize: '0.92rem', color: `var(--${group.swatch})` }}>
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
                                                                            <th style={{ minWidth: '130px' }}>Start Date</th>
                                                                            <th style={{ minWidth: '140px' }}>Payoff Date</th>
                                                                            <th style={{ minWidth: '130px' }}>Original Principal</th>
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
                                                                        const isCreditCard = it.category === "Credit Cards" || group.kind === "liability";
                                                                        const investedAmt = Number(it.invested || 0);
                                                                        const currentVal = Number(it.value || 0);
                                                                        const gainVal = currentVal - investedAmt;
                                                                        const gainPct = investedAmt > 0 ? ((gainVal / investedAmt) * 100).toFixed(1) : null;

                                                                        if (group.kind === "balance") {
                                                                            const currBal = Number(it.currentBalance ?? (currentVal + investedAmt));
                                                                            return (
                                                                                <tr key={it.id}>
                                                                                    <td style={{ fontWeight: 600, paddingLeft: '18px', minWidth: '180px', wordBreak: 'break-word' }}>{it.name}</td>
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
                                                                                    <td style={{ fontWeight: 600, paddingLeft: '18px', minWidth: '180px', wordBreak: 'break-word' }}>{it.name}</td>
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
                                                                                    <td style={{ fontWeight: 600, paddingLeft: '18px', minWidth: '180px', wordBreak: 'break-word' }}>{it.name}</td>
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
                                                                                            {isCreditCard && (
                                                                                                <button
                                                                                                    className="btn btn-secondary btn-sm"
                                                                                                    style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                                                                                                    onClick={() => { setQuickBillItem(it); setQuickBillAmount(it.value ?? ""); }}
                                                                                                    title="Update Statement Balance"
                                                                                                >
                                                                                                    💳 Balance
                                                                                                </button>
                                                                                            )}
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
                                                                                <td style={{ fontWeight: 600, paddingLeft: '18px', minWidth: '200px', wordBreak: 'break-word' }}>{it.name}</td>
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
                                                                                        {isCreditCard && (
                                                                                            <button
                                                                                                className="btn btn-secondary btn-sm"
                                                                                                style={{ padding: '2px 6px', fontSize: '0.72rem' }}
                                                                                                onClick={() => { setQuickBillItem(it); setQuickBillAmount(it.value ?? ""); }}
                                                                                                title="Update Statement Balance"
                                                                                            >
                                                                                                💳 Balance
                                                                                            </button>
                                                                                        )}
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

            {/* Quick Credit Card / Liability Monthly Bill Update Modal */}
            {quickBillItem && (
                <div className="modal-overlay">
                    <div className="modal-container" style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Update Monthly Bill Balance</h3>
                            <button className="modal-close-btn" onClick={() => setQuickBillItem(null)}><Icon name="close" /></button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                                Update current monthly statement balance for <strong>"{quickBillItem.name}"</strong>
                            </p>
                            <div className="form-field">
                                <label>Statement Balance ({getCurrencySymbol(settings?.currency || "INR")})</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    className="form-control"
                                    value={quickBillAmount}
                                    onChange={(e) => setQuickBillAmount(e.target.value)}
                                    placeholder="Enter new monthly statement amount"
                                    required
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setQuickBillItem(null)}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleQuickBillSave}>Update Balance</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Ledger Entry Confirmation Modal */}
            {itemToDelete && (
                <div className="modal-overlay confirm-modal-overlay">
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

// --- MODAL COMPONENT: Add/Edit Net Worth Ledger Entry ---
