import React from 'react';
import {
    Icon, formatCurrencyVal, formatDate, filterTransactionsByPeriod, getContrastTextColor,
    formatCategorySubIconFirst
} from '../utils.jsx';
import { CreateBudgetModal, CreateGoalModal } from '../components/modals/PlanningModals.jsx';

export const BudgetsPage = ({ transactions, settings, updateSetting, showToast, subpageActionSignal }) => {
    const budgetsList = settings.budgets || [];
    const [showCreateModal, setShowCreateModal] = React.useState(false);
    const [budgetToDelete, setBudgetToDelete] = React.useState(null);

    const prevSubpageActionSignal = React.useRef(subpageActionSignal);
    React.useEffect(() => {
        if (subpageActionSignal > prevSubpageActionSignal.current) {
            setShowCreateModal(true);
        }
        prevSubpageActionSignal.current = subpageActionSignal;
    }, [subpageActionSignal]);

    // Filter transactions for this month to calculate budget progress
    const now = new Date();
    const thisMonthTx = transactions.filter(t => {
        const tDate = new Date(t.date);
        return tDate.getFullYear() === now.getFullYear() && tDate.getMonth() === now.getMonth();
    });

    // Calculate spent per category
    const spentByCategory = {};
    thisMonthTx.forEach(t => {
        if (t.type === "expense") {
            spentByCategory[t.category] = (spentByCategory[t.category] || 0) + t.amount;
        }
    });

    const formatCurrency = (val) => formatCurrencyVal(val, settings.currency || "INR");

    const handleCreateBudget = async (item) => {
        const exists = budgetsList.some(b => b.category.toLowerCase() === item.category.toLowerCase());
        if (exists) {
            showToast(`A budget for category "${item.category}" already exists`, "error");
            return;
        }
        const updatedList = [...budgetsList, {
            id: crypto.randomUUID(),
            category: item.category,
            limit: Number(item.limit),
            active: true
        }];
        await updateSetting("budgets", updatedList);
        showToast("Budget limit established");
        setShowCreateModal(false);
    };

    const handleDeleteBudget = async (id) => {
        const updatedList = budgetsList.filter(b => b.id !== id);
        await updateSetting("budgets", updatedList);
        showToast("Budget limit deleted");
    };

    // Calculate budget health totals
    const totalBudgetLimit = budgetsList.reduce((sum, b) => sum + b.limit, 0);
    const totalBudgetSpent = budgetsList.reduce((sum, b) => sum + (spentByCategory[b.category] || 0), 0);
    const budgetHealthRatio = totalBudgetLimit > 0 ? (totalBudgetSpent / totalBudgetLimit) * 100 : 0;

    return (
        <div>
            {budgetsList.length === 0 ? (
                <div className="empty-state" style={{ padding: '60px 20px' }}>
                    <Icon name="budgets" />
                    <div className="empty-state-text">
                        <h3>No Budgets Set</h3>
                        <p>Track your spending categories by setting custom monthly envelopes.</p>
                        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>Create budget</button>
                    </div>
                </div>
            ) : (
                <div>
                    {/* Health overview panel */}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px', marginBottom: '28px' }}>
                        <div className="card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '20px' }}>
                            <div style={{ flex: 1 }}>
                                <h3 style={{ fontWeight: 600, fontSize: '1.1rem', marginBottom: '8px' }}>Budget Health Overview</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '12px' }}>
                                    You have spent {formatCurrency(totalBudgetSpent)} out of {formatCurrency(totalBudgetLimit)} budgeted limit for this month.
                                </p>
                                <div className="progress-container">
                                    <div className="progress-bar-bg">
                                        <div
                                            className={`progress-bar-fill ${budgetHealthRatio > 100 ? "danger" : budgetHealthRatio > 80 ? "warning" : "success"}`}
                                            style={{ width: `${Math.min(budgetHealthRatio, 100)}%` }}
                                        ></div>
                                    </div>
                                    <div className="progress-labels">
                                        <span>{budgetHealthRatio.toFixed(0)}% Used</span>
                                        <span>{formatCurrency(Math.max(totalBudgetLimit - totalBudgetSpent, 0))} Remaining</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="card" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
                            <span className="card-title">Envelopes Set</span>
                            <div className="card-value" style={{ marginTop: '8px', color: 'var(--primary)' }}>{budgetsList.length}</div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Active Categories</span>
                        </div>
                    </div>

                    {/* Envelopes list */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
                        {budgetsList.map(b => {
                            const spent = spentByCategory[b.category] || 0;
                            const ratio = (spent / b.limit) * 100;
                            const remaining = b.limit - spent;

                            return (
                                <div key={b.id} className="card" style={{ padding: '20px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', alignItems: 'center' }}>
                                        <h4 style={{ fontWeight: 600, fontSize: '1rem' }}>{b.category}</h4>
                                        <button
                                            className="btn btn-secondary btn-sm"
                                            style={{ border: 'none', color: 'var(--danger)', padding: 0 }}
                                            onClick={() => setBudgetToDelete(b)}
                                            title="Delete Budget"
                                        >
                                            <Icon name="trash" />
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                                        <span style={{ color: 'var(--text-muted)' }}>Spent: <strong>{formatCurrency(spent)}</strong></span>
                                        <span>Limit: {formatCurrency(b.limit)}</span>
                                    </div>

                                    {/* Progress indicator bar */}
                                    <div className="progress-container" style={{ margin: 0 }}>
                                        <div className="progress-bar-bg" style={{ height: '6px' }}>
                                            <div
                                                className={`progress-bar-fill ${ratio > 100 ? "danger" : ratio > 80 ? "warning" : "success"}`}
                                                style={{ width: `${Math.min(ratio, 100)}%` }}
                                            ></div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '6px' }}>
                                        <span style={{ color: ratio > 100 ? 'var(--danger)' : 'var(--text-muted)' }}>
                                            {ratio > 100 ? "Over Budget!" : `${ratio.toFixed(0)}% utilized`}
                                        </span>
                                        <span style={{ fontWeight: 600, color: remaining >= 0 ? "var(--success)" : "var(--danger)" }}>
                                            {remaining >= 0 ? `${formatCurrency(remaining)} left` : `${formatCurrency(Math.abs(remaining))} over`}
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Create Budget Modal */}
            {showCreateModal && (
                <CreateBudgetModal
                    onClose={() => setShowCreateModal(false)}
                    onSave={handleCreateBudget}
                    settings={settings}
                />
            )}

            {/* Confirm Delete Budget Modal */}
            {budgetToDelete && (
                <div className="modal-overlay confirm-modal-overlay" onClick={() => setBudgetToDelete(null)}>
                    <div className="modal-container" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ color: 'var(--danger)' }}>Delete Budget</h3>
                            <button className="modal-close-btn" onClick={() => setBudgetToDelete(null)}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modal-body" style={{ padding: '16px 20px' }}>
                            <p style={{ margin: '0 0 12px 0', fontSize: '0.88rem', color: 'var(--text-main)' }}>
                                Are you sure you want to delete this budget envelope?
                            </p>
                            <div style={{ padding: '12px', background: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Category:</span>
                                    <span style={{ fontWeight: 600 }}>{budgetToDelete.category}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Limit:</span>
                                    <span style={{ fontWeight: 600 }}>{formatCurrency(budgetToDelete.limit)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setBudgetToDelete(null)}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={async () => {
                                    await handleDeleteBudget(budgetToDelete.id);
                                    setBudgetToDelete(null);
                                }}
                            >
                                Delete Budget
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


// --- SUB-PAGE: Goals (Section 13) ---


export const GoalsPage = ({ settings, updateSetting, showToast, subpageActionSignal }) => {
    const goalsList = settings.goals || [];
    const [showCreateModal, setShowCreateModal] = React.useState(false);
    const [goalToDelete, setGoalToDelete] = React.useState(null);

    const prevSubpageActionSignal = React.useRef(subpageActionSignal);
    React.useEffect(() => {
        if (subpageActionSignal > prevSubpageActionSignal.current) {
            setShowCreateModal(true);
        }
        prevSubpageActionSignal.current = subpageActionSignal;
    }, [subpageActionSignal]);

    const formatCurrency = (val) => formatCurrencyVal(val, settings.currency || "INR");

    const handleCreateGoal = async (item) => {
        const updatedList = [...goalsList, {
            id: crypto.randomUUID(),
            name: item.name,
            target: Number(item.target),
            current: Number(item.current || 0),
            dueDate: item.dueDate || "",
            note: item.note || ""
        }];
        await updateSetting("goals", updatedList);
        showToast("Financial Goal created successfully");
        setShowCreateModal(false);
    };

    const handleDeleteGoal = async (id) => {
        const updatedList = goalsList.filter(g => g.id !== id);
        await updateSetting("goals", updatedList);
        showToast("Goal deleted");
    };

    const handleUpdateProgress = async (id, val) => {
        const updatedList = goalsList.map(g => {
            if (g.id === id) {
                return { ...g, current: Math.min(Number(val), g.target) };
            }
            return g;
        });
        await updateSetting("goals", updatedList);
        showToast("Goal progress updated");
    };

    return (
        <div>
            {goalsList.length === 0 ? (
                <div className="empty-state">
                    <Icon name="goals" />
                    <div className="empty-state-text">
                        <h3>No Goals Set</h3>
                        <p>Build healthy savings milestones for big purchases or retirement funds.</p>
                        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>Create goal</button>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
                    {goalsList.map(g => {
                        const ratio = (g.current / g.target) * 100;
                        const remaining = g.target - g.current;

                        return (
                            <div key={g.id} className="card" style={{ padding: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '14px', alignItems: 'flex-start' }}>
                                    <div>
                                        <h4 style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-main)' }}>{g.name}</h4>
                                        {g.dueDate && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Target Date: {formatDate(g.dueDate, settings.dateFormat)}</span>}
                                    </div>
                                    <button
                                        className="btn btn-secondary btn-sm"
                                        style={{ border: 'none', color: 'var(--danger)', padding: 0 }}
                                        onClick={() => setGoalToDelete(g)}
                                        title="Delete Goal"
                                    >
                                        <Icon name="trash" />
                                    </button>
                                </div>

                                {g.note && <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '16px', fontStyle: 'italic' }}>{g.note}</p>}

                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '6px' }}>
                                    <span>Saved: <strong>{formatCurrency(g.current)}</strong></span>
                                    <span>Target: {formatCurrency(g.target)}</span>
                                </div>

                                {/* Progress Bar */}
                                <div className="progress-container" style={{ margin: '0 0 16px 0' }}>
                                    <div className="progress-bar-bg" style={{ height: '8px' }}>
                                        <div
                                            className="progress-bar-fill primary"
                                            style={{ width: `${Math.min(ratio, 100)}%` }}
                                        ></div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', alignItems: 'center' }}>
                                    <span style={{ fontWeight: 500, color: 'var(--primary)' }}>{ratio.toFixed(0)}% Completed</span>
                                    <span style={{ color: 'var(--text-muted)' }}>{formatCurrency(remaining)} left</span>
                                </div>

                                {/* Inline Quick deposit input slider */}
                                <div style={{ marginTop: '16px', borderTop: '1px solid var(--border-color)', paddingTop: '14px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Adjust:</span>
                                    <input
                                        type="range"
                                        min="0"
                                        max={g.target}
                                        value={g.current}
                                        onChange={(e) => handleUpdateProgress(g.id, e.target.value)}
                                        style={{ flex: 1, accentColor: 'var(--primary)' }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {showCreateModal && (
                <CreateGoalModal
                    onClose={() => setShowCreateModal(false)}
                    onSave={handleCreateGoal}
                    settings={settings}
                />
            )}

            {/* Confirm Delete Goal Modal */}
            {goalToDelete && (
                <div className="modal-overlay confirm-modal-overlay" onClick={() => setGoalToDelete(null)}>
                    <div className="modal-container" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ color: 'var(--danger)' }}>Delete Goal</h3>
                            <button className="modal-close-btn" onClick={() => setGoalToDelete(null)}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modal-body" style={{ padding: '16px 20px' }}>
                            <p style={{ margin: '0 0 12px 0', fontSize: '0.88rem', color: 'var(--text-main)' }}>
                                Are you sure you want to delete this savings goal?
                            </p>
                            <div style={{ padding: '12px', background: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Goal Name:</span>
                                    <span style={{ fontWeight: 600 }}>{goalToDelete.name}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Target:</span>
                                    <span style={{ fontWeight: 600 }}>{formatCurrency(goalToDelete.target)}</span>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer" style={{ padding: '12px 20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button type="button" className="btn btn-secondary" onClick={() => setGoalToDelete(null)}>
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={async () => {
                                    await handleDeleteGoal(goalToDelete.id);
                                    setGoalToDelete(null);
                                }}
                            >
                                Delete Goal
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


// --- SUB-PAGE: Net Worth Ledger (Fixed Assets, Passive Income, Pension, House Tax,
// Insurance, Investments, Liabilities, Credit Cards, Current Balances) ---
// --- SUB-PAGE: Net Worth Ledger ---
