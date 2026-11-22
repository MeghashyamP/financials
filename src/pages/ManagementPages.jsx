import React from 'react';
import { buildDocumentPeriods, compareByPeriod } from '../services/documentPeriods.js';
import { AppInstallCard } from '../components/AppInstallCard.jsx';
import { AccountsSetup } from '../components/AccountsSetup.jsx';
import { StatementHealth } from '../components/StatementHealth.jsx';
import { LearnedMerchants } from '../components/MerchantReview.jsx';
import { RulesManager } from '../components/RulesManager.jsx';
import { PrivacySettings } from '../components/PrivacySettings.jsx';
import { RecoveryKitCard } from '../components/RecoveryKitCard.jsx';
import {
    Icon, formatCurrencyVal, formatDate, formatDateTime, DatePickerField, DEFAULT_CATEGORIES,
    filterCategoriesByType, getContrastTextColor, formatCategorySubIconFirst,
    renderCategoryOptions, getOccurrencesInPeriod, calculateNextExpectedDate, useEscapeKey, CATEGORY_DESCRIPTIONS,
    calculatePeriodDateRange, getISOStringInTimezone, isRuleEnabled, normalizeCategoryName
} from '../utils.jsx';
import {
    updateTransactionInDB, deleteTransactionFromDB, saveRuleInDB, deleteRuleFromDB, wipeDatabase,
    initDB, saveSettingInDB, saveTagInDB, saveDocumentInDB, checkStoragePersistence, requestStoragePersistence
} from '../store.js';
import { exportBackup, importBackup, restoreBackup } from '../services/backup.js';
import {
    pickLocalProjectFile,
    openLocalProjectFile,
    readStateFromLocalFile,
    writeStateToLocalFile,
    setGlobalFileHandle,
    getGlobalFileHandle,
    restoreGlobalFileHandle,
    getHandleFromIndexedDB,
    verifyFileHandlePermission
} from '../services/localFileSync.js';
import { CreateRecurringModal, CreateRuleModal, LogBillInstanceModal } from '../components/modals/PlanningModals.jsx';

export const RecurringPage = ({
    transactions = [],
    settings = {},
    suggested = [],
    updateSetting,
    showToast,
    subpageActionSignal,
    selectedPeriod = "next_6_months",
    setSelectedPeriod,
    customStart = "",
    setCustomStart,
    customEnd = "",
    setCustomEnd,
    displayStartDate,
    displayEndDate,
    normPeriodKey,
    handleStartDateChange,
    handleEndDateChange,
    handleUnifiedPeriodChange,
    PeriodSelectOptions,
    recurringCollapseSignal,
    setRecurringIsAnyCollapsed
}) => {
    const confirmedList = (settings?.recurring || []).filter(Boolean);
    const safeTransactions = Array.isArray(transactions) ? transactions.filter(Boolean) : [];
    const safeSuggested = Array.isArray(suggested) ? suggested.filter(Boolean) : [];

    const [showModal, setShowModal] = React.useState(false);
    const [editingItem, setEditingItem] = React.useState(null);
    const [loggingBillItem, setLoggingBillItem] = React.useState(null);
    const [itemToDelete, setItemToDelete] = React.useState(null);
    const [flowFilter, setFlowFilter] = React.useState("all");
    const [sortBy, setSortBy] = React.useState("next_due_date");
    const [sortOrder, setSortOrder] = React.useState("asc");
    const [collapsedSections, setCollapsedSections] = React.useState({
        suggestions: true,
        outflows: true,
        inflows: true,
        expired: true,
        outflows_within: true,
        outflows_beyond: true,
        inflows_within: true,
        inflows_beyond: true
    });

    const toggleSection = (key) => {
        setCollapsedSections(prev => {
            const nextState = !prev[key];
            const updated = { ...prev, [key]: nextState };
            if (!nextState) {
                if (key === 'outflows') {
                    delete updated.outflows_within;
                    delete updated.outflows_beyond;
                } else if (key === 'inflows') {
                    delete updated.inflows_within;
                    delete updated.inflows_beyond;
                }
            }
            return updated;
        });
    };

    const handleExpandAll = () => {
        setCollapsedSections({});
    };

    const handleCollapseAll = () => {
        setCollapsedSections({
            suggestions: true,
            outflows: true,
            inflows: true,
            expired: true,
            outflows_within: true,
            outflows_beyond: true,
            inflows_within: true,
            inflows_beyond: true
        });
    };

    const handleSortChange = (field) => {
        if (sortBy === field) {
            setSortOrder(prev => prev === "asc" ? "desc" : "asc");
        } else {
            setSortBy(field);
            if (field === "name" || field === "next_due_date") {
                setSortOrder("asc");
            } else {
                setSortOrder("desc");
            }
        }
    };

    const prevSubpageActionSignal = React.useRef(subpageActionSignal);
    React.useEffect(() => {
        if (subpageActionSignal > prevSubpageActionSignal.current) {
            setEditingItem(null);
            setShowModal(true);
        }
        prevSubpageActionSignal.current = subpageActionSignal;
    }, [subpageActionSignal]);
    const [mappedModalItem, setMappedModalItem] = React.useState(null);
    const [newNoteText, setNewNoteText] = React.useState("");
    const [deletingNoteId, setDeletingNoteId] = React.useState(null);

    // Close Mapped Transactions modal on Escape key press
    React.useEffect(() => {
        if (!mappedModalItem) return;
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                setMappedModalItem(null);
                setDeletingNoteId(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [mappedModalItem]);

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const handleAddMappedNote = async (e) => {
        e?.preventDefault();
        if (!newNoteText.trim() || !mappedModalItem) return;
        const noteObj = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            dateStr: todayStr,
            text: newNoteText.trim(),
            isAutoGenerated: false
        };
        const existingLogs = Array.isArray(mappedModalItem.changeLogs) ? mappedModalItem.changeLogs : [];
        const updatedLogs = [noteObj, ...existingLogs];
        const updatedItem = { ...mappedModalItem, changeLogs: updatedLogs };

        const updatedList = confirmedList.map(c => c.id === updatedItem.id ? updatedItem : c);
        if (updateSetting) await updateSetting("recurring", updatedList);
        setMappedModalItem(updatedItem);
        setNewNoteText("");
        if (showToast) showToast("Note added to recurring transaction");
    };

    const handleDeleteMappedNote = async (logId) => {
        if (!mappedModalItem) return;
        if (deletingNoteId !== logId) {
            setDeletingNoteId(logId);
            return;
        }
        const existingLogs = Array.isArray(mappedModalItem.changeLogs) ? mappedModalItem.changeLogs : [];
        const updatedLogs = existingLogs.filter(l => l.id !== logId);
        const updatedItem = { ...mappedModalItem, changeLogs: updatedLogs };

        const updatedList = confirmedList.map(c => c.id === updatedItem.id ? updatedItem : c);
        if (updateSetting) await updateSetting("recurring", updatedList);
        setMappedModalItem(updatedItem);
        setDeletingNoteId(null);
        if (showToast) showToast("Note deleted");
    };

    const activeList = confirmedList.filter(c => c && (!c.endDate || String(c.endDate) >= todayStr));
    const activeInflowList = activeList.filter(c => c.type === "income");
    const activeOutflowList = activeList.filter(c => c.type !== "income");
    const expiredList = confirmedList.filter(c => c && c.endDate && String(c.endDate) < todayStr);

    const toggleExcludeRecurring = async (id) => {
        const updatedList = confirmedList.map(c => {
            if (c.id === id) {
                const nextState = !c.excludeFromMonthlyCalculations;
                if (showToast) showToast(nextState ? `"${c.name}" excluded from recurring calculations` : `"${c.name}" included in recurring calculations`);
                return { ...c, excludeFromMonthlyCalculations: nextState };
            }
            return c;
        });
        if (updateSetting) await updateSetting("recurring", updatedList);
    };

    const toggleFlowType = async (id) => {
        const updatedList = confirmedList.map(c => {
            if (c.id === id) {
                const nextType = c.type === "income" ? "expense" : "income";
                if (showToast) showToast(`"${c.name}" flow changed to ${nextType === "income" ? "Inflow" : "Outflow"}`);
                return { ...c, type: nextType };
            }
            return c;
        });
        if (updateSetting) await updateSetting("recurring", updatedList);
    };

    const formatCurrency = (val) => formatCurrencyVal(val, settings?.currency || "INR");

    const renderRecurringCategory = (cat) => {
        const rawCat = cat || "Uncategorized";
        if (rawCat.includes(" - ")) {
            const parts = rawCat.split(" - ");
            const parent = parts[0];
            const sub = parts.slice(1).join(" - ");
            return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', lineHeight: 1.25 }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-main)', whiteSpace: 'nowrap' }}>{parent} -</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{sub}</span>
                </div>
            );
        }
        return <span style={{ fontWeight: 500, color: 'var(--text-main)' }}>{rawCat}</span>;
    };

    // Calculate monthly equivalent amount
    const getItemMonthlyEq = (item) => {
        if (!item) return 0;
        let amt = Number(item.amount || 0);
        if (isNaN(amt)) amt = 0;
        const cadence = item.cadence || "monthly";
        let monthlyEquivalent = amt;
        if (cadence === "weekly" || cadence === "weekly_days") monthlyEquivalent = (amt * 52) / 12;
        else if (cadence === "biweekly") monthlyEquivalent = (amt * 26) / 12;
        else if (cadence === "quarterly") monthlyEquivalent = amt / 3;
        else if (cadence === "annual" || cadence === "yearly") monthlyEquivalent = amt / 12;
        else if (cadence === "once") monthlyEquivalent = 0;
        else if (cadence === "custom_interval" && item.customIntervalDays) monthlyEquivalent = (amt * 30) / Math.max(1, Number(item.customIntervalDays) || 14);
        return monthlyEquivalent;
    };

    const getPeriodRange = () => {
        if (displayStartDate && displayEndDate) {
            return { pStartStr: displayStartDate, pEndStr: displayEndDate };
        }
        return calculatePeriodDateRange(selectedPeriod, new Date(), customStart, customEnd);
    };

    const getPeriodItemAmount = (item) => {
        if (!item || item.excludeFromMonthlyCalculations) return 0;
        const { pStartStr, pEndStr } = getPeriodRange();
        const count = getOccurrencesInPeriod(item, pStartStr, pEndStr);
        const amt = Number(item.estimatedAmount || item.amount || 0);
        const pendingInst = (settings?.billInstances || []).find(b =>
            b.recurringId === item.id &&
            b.status === 'pending' &&
            b.dueDate &&
            b.dueDate >= pStartStr &&
            b.dueDate <= pEndStr
        );
        if (pendingInst) {
            if (count <= 1) return Number(pendingInst.amount) || 0;
            return (Number(pendingInst.amount) || 0) + (count - 1) * (isNaN(amt) ? 0 : amt);
        }
        return (isNaN(amt) ? 0 : amt) * (isNaN(count) ? 0 : count);
    };

    // Period total sums (Items with active occurrences in selected period)
    const confirmedPeriodInflow = confirmedList.reduce((sum, item) => {
        if (!item || item.excludeFromMonthlyCalculations || item.type !== "income") return sum;
        return sum + getPeriodItemAmount(item);
    }, 0);

    const confirmedPeriodOutflow = confirmedList.reduce((sum, item) => {
        if (!item || item.excludeFromMonthlyCalculations || item.type === "income") return sum;
        return sum + getPeriodItemAmount(item);
    }, 0);

    const netPeriodSurplus = confirmedPeriodInflow - confirmedPeriodOutflow;

    const confirmedMonthlyOutflow = activeList.reduce((sum, item) => {
        if (!item || item.excludeFromMonthlyCalculations || item.type === "income") return sum;
        return sum + getItemMonthlyEq(item);
    }, 0);

    const getPeriodBadgeLabel = () => {
        const range = getPeriodRange();
        return `${range.pStartStr} to ${range.pEndStr}`;
    };

    const handleSaveRecurring = async (item) => {
        let updatedList;
        if (editingItem) {
            updatedList = confirmedList.map(c => {
                if (c.id === editingItem.id) {
                    const logs = Array.isArray(c.changeLogs) ? [...c.changeLogs] : [];

                    const changes = [];
                    if (item.name && item.name !== c.name) {
                        changes.push(`Name: "${c.name}" → "${item.name}"`);
                    }
                    const oldAmt = Number(c.estimatedAmount || c.amount || 0);
                    const newAmt = Number(item.estimatedAmount || item.amount || 0);
                    if (newAmt !== oldAmt) {
                        changes.push(`Amount: ${formatCurrency(oldAmt)} → ${formatCurrency(newAmt)}`);
                    }
                    if (item.type && item.type !== c.type) {
                        changes.push(`Type: ${c.type} → ${item.type}`);
                    }
                    if (item.category && item.category !== c.category) {
                        changes.push(`Category: "${c.category || 'None'}" → "${item.category}"`);
                    }
                    if (item.cadence && item.cadence !== c.cadence) {
                        changes.push(`Cadence: ${c.cadence} → ${item.cadence}`);
                    }
                    if (item.monthlyDays && String(item.monthlyDays) !== String(c.monthlyDays)) {
                        changes.push(`Day of Month: ${c.monthlyDays} → ${item.monthlyDays}`);
                    }
                    if (item.startDate && item.startDate !== c.startDate) {
                        changes.push(`Start Date: ${formatDate(c.startDate, settings?.dateFormat)} → ${formatDate(item.startDate, settings?.dateFormat)}`);
                    }
                    if (item.endDate !== c.endDate) {
                        changes.push(`End Date: ${c.endDate ? formatDate(c.endDate, settings?.dateFormat) : 'None'} → ${item.endDate ? formatDate(item.endDate, settings?.dateFormat) : 'None'}`);
                    }
                    if (item.isVariableAmount !== undefined && item.isVariableAmount !== c.isVariableAmount) {
                        changes.push(`Amount Type: ${c.isVariableAmount ? 'Variable' : 'Fixed'} → ${item.isVariableAmount ? 'Variable' : 'Fixed'}`);
                    }

                    if (changes.length > 0) {
                        logs.unshift({
                            id: crypto.randomUUID(),
                            timestamp: Date.now(),
                            dateStr: todayStr,
                            text: `Updated: ${changes.join(', ')}`,
                            isAutoGenerated: true
                        });
                    }

                    return { ...c, ...item, changeLogs: logs };
                }
                return c;
            });
        } else {
            updatedList = [...confirmedList, { id: crypto.randomUUID(), ...item }];
        }
        if (updateSetting) await updateSetting("recurring", updatedList);
        if (editingItem && settings?.billInstances && updateSetting) {
            const pendingInstances = settings.billInstances || [];
            const hasInvalidPending = pendingInstances.some(b => b.recurringId === editingItem.id && b.status === 'pending' && item.startDate && b.dueDate < item.startDate);
            if (hasInvalidPending) {
                const cleaned = pendingInstances.filter(b => !(b.recurringId === editingItem.id && b.status === 'pending' && item.startDate && b.dueDate < item.startDate));
                await updateSetting("billInstances", cleaned);
            }
        }
        if (editingItem && settings?.networthItems && updateSetting) {
            const newAmt = Number(item.estimatedAmount || item.amount || 0);
            const networthList = settings.networthItems || [];
            const hasLinked = networthList.some(nw => nw.linkedRecurringId === editingItem.id && nw.syncMode !== "amortizing" && nw.syncMode !== "loan_principal" && nw.syncMode !== "sip" && nw.syncMode !== "investment_sip");
            if (hasLinked) {
                const updatedNwList = networthList.map(nw => {
                    if (nw.linkedRecurringId === editingItem.id && nw.syncMode !== "amortizing" && nw.syncMode !== "loan_principal" && nw.syncMode !== "sip" && nw.syncMode !== "investment_sip") {
                        return { ...nw, value: newAmt };
                    }
                    return nw;
                });
                await updateSetting("networthItems", updatedNwList);
            }
        }
        if (showToast) showToast(editingItem ? "Recurring item updated" : "Recurring item added");
        setShowModal(false);
        setEditingItem(null);
    };

    const handleSaveBillInstance = async (billInst) => {
        const existing = settings?.billInstances || [];
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
        if (showToast) showToast(`Bill instance logged for "${billInst.name}"`);
        setLoggingBillItem(null);
    };

    const handleClearBillInstance = async (recurringId, instanceId) => {
        const existing = settings?.billInstances || [];
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
        if (showToast) showToast(`Cleared logged bill for "${loggingBillItem?.name || 'Item'}"`);
        setLoggingBillItem(null);
    };

    const handleKeepSuggestion = async (item) => {
        if (!item) return;
        const updatedList = [...confirmedList, {
            id: crypto.randomUUID(),
            name: item.merchantDisplay || item.merchantNormalized || "Recurring Payment",
            category: item.category || "Subscriptions - Others ⚙️",
            amount: Number(item.averageCharge || item.amount || 0),
            type: item.type || "expense",
            cadence: item.cadence || "monthly",
            nextDate: item.nextDate || todayStr,
            active: true,
            excludeFromMonthlyCalculations: false
        }];
        if (updateSetting) await updateSetting("recurring", updatedList);
        if (item.merchantNormalized) {
            const dismissed = settings?.dismissedPatterns || [];
            if (!dismissed.includes(item.merchantNormalized)) {
                if (updateSetting) await updateSetting("dismissedPatterns", [...dismissed, item.merchantNormalized]);
            }
        }
        if (showToast) showToast(`Kept suggestion for "${item.merchantDisplay || "Recurring Payment"}"`);
    };

    const handleIgnoreSuggestion = async (item) => {
        if (!item) return;
        const dismissed = settings?.dismissedPatterns || [];
        const updatedDismissed = [...dismissed, item.merchantNormalized];
        if (updateSetting) await updateSetting("dismissedPatterns", updatedDismissed);
        if (showToast) showToast(`Ignored suggestion for "${item.merchantDisplay || "Item"}"`);
    };

    const handleRemoveConfirmed = async (id) => {
        const updatedList = confirmedList.filter(c => c.id !== id);
        if (updateSetting) await updateSetting("recurring", updatedList);
        if (settings?.networthItems && updateSetting) {
            const networthList = settings.networthItems || [];
            if (networthList.some(nw => nw.linkedRecurringId === id)) {
                const updatedNw = networthList.map(nw => nw.linkedRecurringId === id ? { ...nw, linkedRecurringId: null } : nw);
                await updateSetting("networthItems", updatedNw);
            }
        }
        if (showToast) showToast("Recurring item removed");
    };

    const getCadenceLabel = (c) => {
        if (!c) return "Monthly";
        const nDateStr = typeof c.nextDate === 'string' ? c.nextDate : (c.nextDate instanceof Date ? c.nextDate.toISOString().split('T')[0] : String(c.nextDate || ''));
        const sDateStr = typeof c.startDate === 'string' ? c.startDate : (c.startDate instanceof Date ? c.startDate.toISOString().split('T')[0] : String(c.startDate || ''));
        if (c.cadence === "once") return `Once (${nDateStr ? formatDate(nDateStr, settings?.dateFormat) : "Single"})`;
        if (c.cadence === "daily") return "Daily";
        if (c.cadence === "biweekly") return "Bi-Weekly (Every 2w)";
        if (c.cadence === "monthly") {
            // Prefer explicit monthlyDays field, then startDate day, then nextDate day
            let dueDay = "";
            if (c.monthlyDays) {
                const rawMD = c.monthlyDays;
                const isLast = (typeof rawMD === 'string' && rawMD.trim().toLowerCase() === 'last') ||
                    (Array.isArray(rawMD) && rawMD.length === 1 && String(rawMD[0]).toLowerCase() === 'last');
                if (isLast) {
                    dueDay = "Last";
                } else {
                    const parsed = Array.isArray(rawMD)
                        ? rawMD
                        : String(rawMD).split(",").map(x => x.trim()).filter(Boolean);
                    dueDay = parsed.join(", ");
                }
            } else if (sDateStr && sDateStr.includes('-')) {
                dueDay = String(parseInt(sDateStr.split('-')[2], 10) || "");
            } else if (nDateStr && nDateStr.includes('-')) {
                dueDay = String(parseInt(nDateStr.split('-')[2], 10) || "");
            }
            return `Monthly${dueDay ? ` (${dueDay})` : ""}`;
        }
        if (c.cadence === "quarterly") return "Quarterly (Every 3m)";
        if (c.cadence === "half_yearly" || c.cadence === "semi_annual") return "Half Yearly (Every 6m)";
        if (c.cadence === "yearly" || c.cadence === "annual" || c.cadence === "annually") return "Annually";
        if (c.cadence === "weekly_days" || c.cadence === "weekly") {
            const daysStr = Array.isArray(c.weeklyDays) ? c.weeklyDays.join(", ") : String(c.weeklyDays || "");
            return `Weekly${daysStr ? ` (${daysStr})` : ""}`;
        }
        if (c.cadence === "monthly_days") {
            const mDaysStr = Array.isArray(c.monthlyDays) ? c.monthlyDays.join(", ") : String(c.monthlyDays || "");
            return `Monthly Dates (${mDaysStr})`;
        }
        if (c.cadence === "custom_interval" || c.cadence === "every") return `Every ${c.customIntervalDays || 14} Days`;
        if (c.cadence === "custom_days" || c.cadence === "custom_dates") {
            // Show first and last custom date as a summary
            const datesList = Array.isArray(c.customDays)
                ? c.customDays
                : typeof c.customDays === 'string'
                    ? c.customDays.split(",").map(s => s.trim()).filter(Boolean)
                    : [];
            if (datesList.length === 0) return "Custom Dates";
            return `Custom (${datesList.length} date${datesList.length > 1 ? 's' : ''})`;
        }
        return c.cadence || "Monthly";
    };

    const renderTableSortIcon = (field) => {
        const isActive = sortBy === field;
        const isAsc = isActive && sortOrder === "asc";
        const isDesc = isActive && sortOrder === "desc";

        return (
            <span
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginLeft: '3px',
                    width: '10px',
                    height: '12px'
                }}
            >
                <svg width="10" height="12" viewBox="0 0 10 12" fill="none" style={{ display: 'block' }}>
                    {(!isActive || isAsc) && (
                        <path
                            d="M5 1L9 5H1L5 1Z"
                            fill={isAsc ? "var(--primary, #4F46E5)" : "var(--text-muted, #9CA3AF)"}
                            fillOpacity={isAsc ? 1 : 0.45}
                        />
                    )}
                    {(!isActive || isDesc) && (
                        <path
                            d="M5 11L1 7H9L5 11Z"
                            fill={isDesc ? "var(--primary, #4F46E5)" : "var(--text-muted, #9CA3AF)"}
                            fillOpacity={isDesc ? 1 : 0.45}
                        />
                    )}
                </svg>
            </span>
        );
    };

    const renderRecurringTable = (itemsList = [], scopePrefix = "default") => {
        const isWithinCollapsed = collapsedSections[`${scopePrefix}_within`];
        const isBeyondCollapsed = collapsedSections[`${scopePrefix}_beyond`];

        const { pStartStr, pEndStr } = getPeriodRange();
        const safeItems = (itemsList || []).filter(Boolean);
        const hasInPeriod = safeItems.some(c => getOccurrencesInPeriod(c, pStartStr, pEndStr) > 0);
        const hasBeyond = safeItems.some(c => getOccurrencesInPeriod(c, pStartStr, pEndStr) === 0);

        const isWithinHidden = !hasInPeriod || isWithinCollapsed;
        const isBeyondHidden = !hasBeyond || isBeyondCollapsed;
        const hideHeaders = isWithinHidden && isBeyondHidden;

        return (
            <div className="table-responsive">
                <table className="table" style={{ width: '100%', tableLayout: 'auto' }}>
                    {!hideHeaders && (
                        <thead>
                            <tr>
                                <th onClick={() => handleSortChange("name")} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', width: '34%', minWidth: '220px' }} title="Sort by Name">
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        Name
                                        {renderTableSortIcon("name")}
                                    </span>
                                </th>
                                <th style={{ whiteSpace: 'nowrap', width: '13%', minWidth: '110px' }}>Category</th>
                                <th onClick={() => handleSortChange("per_payment")} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', width: '12%', minWidth: '105px' }} title="Sort by Amount">
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        Amount
                                        {renderTableSortIcon("per_payment")}
                                    </span>
                                </th>
                                <th onClick={() => handleSortChange("period_total")} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', width: '12%', minWidth: '110px' }} title="Sort by Period Total">
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        Period Total
                                        {renderTableSortIcon("period_total")}
                                    </span>
                                </th>
                                <th style={{ whiteSpace: 'nowrap', width: '9%', minWidth: '90px' }}>Frequency</th>
                                <th onClick={() => handleSortChange("next_due_date")} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', width: '9%', minWidth: '100px' }} title="Sort by Next Date">
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                                        Next Date
                                        {renderTableSortIcon("next_due_date")}
                                    </span>
                                </th>
                                <th style={{ whiteSpace: 'nowrap', width: '7%', minWidth: '80px' }}>End Date</th>
                                <th style={{ whiteSpace: 'nowrap', width: '6%', minWidth: '90px' }}>Actions</th>
                            </tr>
                        </thead>
                    )}
                    <tbody>
                        {(() => {
                        const { pStartStr, pEndStr } = getPeriodRange();
                        const periodRefDate = pStartStr ? new Date(pStartStr + "T00:00:00") : new Date();

                        const sortFn = (list) => [...list].sort((a, b) => {
                            let valA, valB;
                            if (sortBy === "name") {
                                valA = (a.name || "").toLowerCase();
                                valB = (b.name || "").toLowerCase();
                                if (valA < valB) return sortOrder === "asc" ? -1 : 1;
                                if (valA > valB) return sortOrder === "asc" ? 1 : -1;
                                return 0;
                            } else if (sortBy === "per_payment") {
                                const pendingInstA = (settings?.billInstances || []).find(bi => bi.recurringId === a.id && bi.status === 'pending' && bi.dueDate && bi.dueDate >= pStartStr && bi.dueDate <= pEndStr);
                                const pendingInstB = (settings?.billInstances || []).find(bi => bi.recurringId === b.id && bi.status === 'pending' && bi.dueDate && bi.dueDate >= pStartStr && bi.dueDate <= pEndStr);
                                valA = pendingInstA ? Number(pendingInstA.amount) : Number(a.estimatedAmount || a.amount || 0);
                                valB = pendingInstB ? Number(pendingInstB.amount) : Number(b.estimatedAmount || b.amount || 0);
                            } else if (sortBy === "period_total") {
                                valA = getPeriodItemAmount(a);
                                valB = getPeriodItemAmount(b);
                            } else if (sortBy === "next_due_date") {
                                const parseTs = (val) => {
                                    if (!val) return Infinity;
                                    if (val instanceof Date) return val.getTime();
                                    const d = new Date(String(val).includes('T') ? String(val) : String(val) + "T00:00:00");
                                    return isNaN(d.getTime()) ? Infinity : d.getTime();
                                };
                                const pendingInstA = (settings?.billInstances || []).find(bi => bi.recurringId === a.id && bi.status === 'pending' && bi.dueDate && bi.dueDate >= pStartStr && bi.dueDate <= pEndStr);
                                const pendingInstB = (settings?.billInstances || []).find(bi => bi.recurringId === b.id && bi.status === 'pending' && bi.dueDate && bi.dueDate >= pStartStr && bi.dueDate <= pEndStr);
                                valA = parseTs(pendingInstA ? pendingInstA.dueDate : calculateNextExpectedDate(a, periodRefDate));
                                valB = parseTs(pendingInstB ? pendingInstB.dueDate : calculateNextExpectedDate(b, periodRefDate));
                            } else {
                                valA = 0;
                                valB = 0;
                            }

                            if (valA < valB) return sortOrder === "asc" ? -1 : 1;
                            if (valA > valB) return sortOrder === "asc" ? 1 : -1;
                            return 0;
                        });

                        const safeItems = (itemsList || []).filter(Boolean);
                        const inPeriodItems = sortFn(safeItems.filter(c => getOccurrencesInPeriod(c, pStartStr, pEndStr) > 0));
                        const outOfPeriodItems = sortFn(safeItems.filter(c => getOccurrencesInPeriod(c, pStartStr, pEndStr) === 0));

                        const isWithinCollapsed = Boolean(collapsedSections[`${scopePrefix}_within`]);
                        const isBeyondCollapsed = Boolean(collapsedSections[`${scopePrefix}_beyond`]);

                        const renderRow = (c, isOutOfPeriod) => {
                            if (!c) return null;
                            const linkedTxns = safeTransactions.filter(t => t && t.linkedRecurringId === c.id);
                            const periodAmt = getPeriodItemAmount(c);
                            const calculatedNextDate = calculateNextExpectedDate(c, periodRefDate);

                            const pendingBillInst = (settings?.billInstances || []).find(b =>
                                b.recurringId === c.id &&
                                b.status === 'pending' &&
                                b.dueDate &&
                                b.dueDate >= pStartStr &&
                                b.dueDate <= pEndStr
                            );
                            const baseEstimatedAmt = Number(c.estimatedAmount || c.amount || 0);
                            const displayAmount = pendingBillInst ? pendingBillInst.amount : baseEstimatedAmt;
                            const displayPeriodAmt = periodAmt;
                            const displayDueDate = pendingBillInst ? pendingBillInst.dueDate : calculatedNextDate;

                            return (
                                <tr key={c.id} style={isOutOfPeriod ? { opacity: 0.42, filter: 'grayscale(0.3)' } : {}}>
                                    <td style={{ fontWeight: 600, color: isOutOfPeriod ? 'var(--text-muted)' : undefined }}>{c.name || "Untitled"}</td>
                                    <td>{renderRecurringCategory(c.category)}</td>
                                    <td style={{
                                        fontWeight: 600,
                                        color: c.excludeFromMonthlyCalculations ? 'var(--text-muted)' : (c.type === "income" ? "var(--success)" : "var(--danger)"),
                                        textDecoration: c.excludeFromMonthlyCalculations ? 'line-through' : 'none',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', whiteSpace: 'nowrap' }}>
                                            <div style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {c.type === "income" ? "+" : "−"}{formatCurrency(displayAmount)}
                                            </div>
                                            {pendingBillInst ? (
                                                <div style={{ fontSize: '0.68rem', color: 'var(--success)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>(Logged)</div>
                                            ) : (
                                                c.isVariableAmount && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>~Estimate</div>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{
                                        fontWeight: 700,
                                        color: c.excludeFromMonthlyCalculations ? 'var(--text-muted)' : (c.type === "income" ? "var(--success)" : "var(--danger)"),
                                        textDecoration: c.excludeFromMonthlyCalculations ? 'line-through' : 'none',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', whiteSpace: 'nowrap' }}>
                                            <div style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                                                {c.type === "income" ? "+" : "−"}{formatCurrency(displayPeriodAmt)}
                                            </div>
                                            {pendingBillInst ? (
                                                <div style={{ fontSize: '0.68rem', color: 'var(--success)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>(Logged)</div>
                                            ) : (
                                                c.isVariableAmount && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>~Estimate</div>
                                            )}
                                        </div>
                                    </td>
                                    <td><span className="badge badge-info">{getCadenceLabel(c)}</span></td>
                                    <td style={{ whiteSpace: 'nowrap' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                            <div style={{ whiteSpace: 'nowrap' }}>{displayDueDate ? formatDate(displayDueDate, settings?.dateFormat) : "—"}</div>
                                            {pendingBillInst ? (
                                                <div style={{ fontSize: '0.68rem', color: 'var(--success)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>(Logged)</div>
                                            ) : (
                                                c.isVariableAmount && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, textAlign: 'center', whiteSpace: 'nowrap' }}>~Estimate</div>
                                            )}
                                        </div>
                                    </td>
                                    <td style={{ whiteSpace: 'nowrap' }}>{c.endDate ? formatDate(c.endDate, settings?.dateFormat) : "No End Date"}</td>
                                    <td>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
                                            {c.isVariableAmount ? (() => {
                                                const allBillInstsForC = (settings?.billInstances || []).filter(b => b && b.recurringId === c.id);
                                                const hasMultipleCycles = allBillInstsForC.length > 1;
                                                return (
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        style={{
                                                            fontSize: '0.82rem',
                                                            width: hasMultipleCycles ? 'auto' : '28px',
                                                            height: '26px',
                                                            padding: hasMultipleCycles ? '0 6px' : 0,
                                                            borderRadius: '6px',
                                                            whiteSpace: 'nowrap',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '3px',
                                                            background: pendingBillInst ? '#ECFDF5' : (allBillInstsForC.length > 0 ? '#EEF2FF' : 'transparent'),
                                                            color: pendingBillInst ? '#047857' : (allBillInstsForC.length > 0 ? '#4338CA' : '#374151'),
                                                            border: pendingBillInst ? '1px solid #A7F3D0' : (allBillInstsForC.length > 0 ? '1px solid #C7D2FE' : 'none'),
                                                            cursor: 'pointer',
                                                            flexShrink: 0
                                                        }}
                                                        onClick={() => setLoggingBillItem(c)}
                                                        title={allBillInstsForC.length > 0 ? `${allBillInstsForC.length} cycle(s) logged. Click to view/edit statement figures.` : "Log Bill Statement"}
                                                    >
                                                        🧾{hasMultipleCycles ? <span style={{ fontSize: '0.72rem', fontWeight: 700 }}>{allBillInstsForC.length}</span> : null}
                                                    </button>
                                                );
                                            })() : (
                                                <div style={{ width: '28px', height: '26px', flexShrink: 0 }} />
                                            )}
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                style={{ fontSize: '0.75rem', padding: '2px 8px', whiteSpace: 'nowrap' }}
                                                onClick={() => setMappedModalItem(c)}
                                                title={`${linkedTxns.length} Mapped`}
                                            >
                                                🔄 {linkedTxns.length}
                                            </button>
                                            <button
                                                type="button"
                                                className={`badge ${c.excludeFromMonthlyCalculations ? "badge-queued" : "badge-income"}`}
                                                style={{
                                                    cursor: 'pointer',
                                                    border: 'none',
                                                    padding: '3px 8px',
                                                    fontSize: '0.85rem',
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    userSelect: 'none'
                                                }}
                                                onClick={() => toggleExcludeRecurring(c.id)}
                                                title={c.excludeFromMonthlyCalculations ? "Excluded from recurring calculations (Click to include)" : "Included in recurring calculations (Click to exclude)"}
                                            >
                                                {c.excludeFromMonthlyCalculations ? "❌" : "✅"}
                                            </button>
                                            <div style={{ display: 'flex', gap: '4px' }}>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ border: 'none', color: 'var(--primary)', padding: '4px 6px' }}
                                                    onClick={() => { setEditingItem(c); setShowModal(true); }}
                                                    title="Edit recurring item"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ border: 'none', color: 'var(--danger)', padding: '4px 6px' }}
                                                    onClick={() => setItemToDelete(c)}
                                                    title="Delete recurring item"
                                                >
                                                    <Icon name="trash" />
                                                </button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            );
                        };

                        return (
                            <>
                                {inPeriodItems.length > 0 && (
                                    <>
                                        <tr
                                            onClick={() => toggleSection(`${scopePrefix}_within`)}
                                            style={{ background: 'var(--bg-color)', borderTop: '2px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', userSelect: 'none' }}
                                            title="Click to expand/collapse section"
                                        >
                                            <td colSpan={8} style={{ padding: '8px 12px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', position: 'relative' }}>
                                                    <span>📌 Within Period Scope ({inPeriodItems.length})</span>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        style={{ border: 'none', padding: '4px', background: 'transparent', color: 'var(--text-muted)', position: 'absolute', right: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        onClick={(e) => { e.stopPropagation(); toggleSection(`${scopePrefix}_within`); }}
                                                        title={isWithinCollapsed ? "Expand section" : "Collapse section"}
                                                    >
                                                        <Icon name={isWithinCollapsed ? "chevronDown" : "chevronUp"} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {!isWithinCollapsed && inPeriodItems.map(c => renderRow(c, false))}
                                    </>
                                )}

                                {outOfPeriodItems.length > 0 && (
                                    <>
                                        <tr
                                            onClick={() => toggleSection(`${scopePrefix}_beyond`)}
                                            style={{ background: 'var(--bg-color)', borderTop: '2px solid var(--border-color)', borderBottom: '1px solid var(--border-color)', cursor: 'pointer', userSelect: 'none' }}
                                            title="Click to expand/collapse section"
                                        >
                                            <td colSpan={8} style={{ padding: '8px 12px', fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: 'center' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', position: 'relative' }}>
                                                    <span>⌛ Beyond Period Scope ({outOfPeriodItems.length})</span>
                                                    <button
                                                        type="button"
                                                        className="btn btn-secondary btn-sm"
                                                        style={{ border: 'none', padding: '4px', background: 'transparent', color: 'var(--text-muted)', position: 'absolute', right: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        onClick={(e) => { e.stopPropagation(); toggleSection(`${scopePrefix}_beyond`); }}
                                                        title={isBeyondCollapsed ? "Expand section" : "Collapse section"}
                                                    >
                                                        <Icon name={isBeyondCollapsed ? "chevronDown" : "chevronUp"} />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {!isBeyondCollapsed && outOfPeriodItems.map(c => renderRow(c, true))}
                                    </>
                                )}
                            </>
                        );
                    })()}
                </tbody>
            </table>
        </div>
    );
};

    const isAnyCollapsed = Object.values(collapsedSections).some(Boolean);

    const handleToggleExpandCollapseAll = React.useCallback(() => {
        setCollapsedSections(prev => {
            const currentlyCollapsed = Object.values(prev).some(Boolean);
            if (currentlyCollapsed) {
                return {};
            } else {
                return {
                    suggestions: true,
                    outflows: true,
                    inflows: true,
                    expired: true,
                    outflows_within: true,
                    outflows_beyond: true,
                    inflows_within: true,
                    inflows_beyond: true
                };
            }
        });
    }, []);

    const prevCollapseSignal = React.useRef(recurringCollapseSignal);
    React.useEffect(() => {
        if (recurringCollapseSignal > prevCollapseSignal.current) {
            handleToggleExpandCollapseAll();
        }
        prevCollapseSignal.current = recurringCollapseSignal;
    }, [recurringCollapseSignal, handleToggleExpandCollapseAll]);

    React.useEffect(() => {
        if (setRecurringIsAnyCollapsed) {
            setRecurringIsAnyCollapsed(isAnyCollapsed);
        }
    }, [isAnyCollapsed, setRecurringIsAnyCollapsed]);

    return (
        <div>
            {/* Section 1: Detected Suggestions */}
            {suggested.length > 0 && (
                <div
                    className="section-card"
                    style={{
                        marginBottom: '28px',
                        border: '1px solid rgba(99, 102, 241, 0.3)',
                        borderRadius: '16px',
                        overflow: 'hidden',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                        background: 'var(--card-bg)'
                    }}
                >
                    {/* Header Block */}
                    <div
                        style={{
                            padding: '16px 20px',
                            background: 'rgba(99, 102, 241, 0.04)',
                            borderBottom: collapsedSections.suggestions ? 'none' : '1px solid rgba(99, 102, 241, 0.3)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '12px',
                            cursor: 'pointer',
                            userSelect: 'none'
                        }}
                        onClick={() => toggleSection('suggestions')}
                        title="Click header to expand/collapse section"
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
                                fontSize: '1.2rem',
                                border: '1px solid rgba(99, 102, 241, 0.3)',
                                color: 'var(--primary)'
                            }}>
                                <Icon name="alert" />
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>Detected Recurring Suggestions</h3>
                                    <span style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--primary)', padding: '2px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600 }}>
                                        {suggested.length} {suggested.length === 1 ? 'Suggestion' : 'Suggestions'}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>Auto-detected recurring payments from transaction history</div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }} onClick={e => e.stopPropagation()}>
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                style={{ border: 'none', padding: '6px', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                onClick={(e) => { e.stopPropagation(); toggleSection('suggestions'); }}
                                title={collapsedSections.suggestions ? "Expand section" : "Collapse section"}
                            >
                                <Icon name={collapsedSections.suggestions ? "chevronDown" : "chevronUp"} />
                            </button>
                        </div>
                    </div>
                    {!collapsedSections.suggestions && (
                        <div className="table-responsive">
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Service/Merchant</th>
                                        <th>Category</th>
                                        <th>Cadence</th>
                                        <th>Charges</th>
                                        <th>Monthly Eq.</th>
                                        <th>Next Expected</th>
                                        <th>Confidence</th>
                                        <th>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {suggested.map((s, idx) => (
                                        <tr key={idx}>
                                            <td style={{ fontWeight: 600 }}>{s.merchantDisplay}</td>
                                            <td>{renderRecurringCategory(s.category)}</td>
                                            <td>{s.cadence}</td>
                                            <td>{s.occurrences}x ({formatCurrency(s.averageCharge)})</td>
                                            <td>{formatCurrency(s.monthlyEquivalent)}</td>
                                            <td>{s.nextDate}</td>
                                            <td>
                                                <span className={`badge ${s.confidence === "high" ? "badge-income" : "badge-queued"}`}>
                                                    {s.confidence}
                                                </span>
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: '6px' }}>
                                                    <button className="btn btn-primary btn-sm" onClick={() => handleKeepSuggestion(s)}>Keep</button>
                                                    <button className="btn btn-secondary btn-sm" onClick={() => handleIgnoreSuggestion(s)}>Ignore</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Section 2: Active Recurring Items - Segregated Inflow & Outflow */}
            {activeList.length === 0 ? (
                <div className="section-card" style={{ marginBottom: '24px' }}>
                    <div className="section-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span>Active Recurring Transactions</span>
                        <span className="badge badge-income" style={{ fontSize: '0.78rem' }}>0 Active</span>
                    </div>
                    <div className="empty-state">
                        <Icon name="recurring" />
                        <div className="empty-state-text">
                            <h3>No Active Recurring Items</h3>
                            <p>Add SIPs, rent, EMIs, salary or recurring bills using the button above.</p>
                            <button className="btn btn-primary" onClick={() => setShowModal(true)}>Add Recurring Item</button>
                        </div>
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '24px' }}>
                    {/* Outflow Section */}
                    {(flowFilter === "all" || flowFilter === "outflow") && (
                        <div
                            className="section-card"
                            style={{
                                marginBottom: '24px',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: '16px',
                                overflow: 'hidden',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                background: 'var(--card-bg)'
                            }}
                        >
                            {/* Header Block */}
                            <div
                                style={{
                                    padding: '16px 20px',
                                    background: 'rgba(239, 68, 68, 0.04)',
                                    borderBottom: collapsedSections.outflows ? 'none' : '1px solid rgba(239, 68, 68, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '12px',
                                    cursor: 'pointer',
                                    userSelect: 'none'
                                }}
                                onClick={() => toggleSection('outflows')}
                                title="Click header to expand/collapse section"
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
                                        fontSize: '1.2rem',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        color: 'var(--danger)'
                                    }}>
                                        <Icon name="arrowUp" />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>Active Recurring Outflows</h3>
                                            <span style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--danger)', padding: '2px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600 }}>
                                                {activeOutflowList.length} {activeOutflowList.length === 1 ? 'Item' : 'Items'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>EMIs, SIPs, rent, subscriptions &amp; bill commitments</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }} onClick={e => e.stopPropagation()}>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Period Total</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--danger)' }}>
                                            −{formatCurrency(confirmedPeriodOutflow)}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        style={{ border: 'none', padding: '6px', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        onClick={(e) => { e.stopPropagation(); toggleSection('outflows'); }}
                                        title={collapsedSections.outflows ? "Expand section" : "Collapse section"}
                                    >
                                        <Icon name={collapsedSections.outflows ? "chevronDown" : "chevronUp"} />
                                    </button>
                                </div>
                            </div>
                            {!collapsedSections.outflows && (
                                activeOutflowList.length === 0 ? (
                                    <div className="empty-state" style={{ padding: '20px 16px' }}>
                                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            No active recurring outflows (EMIs, SIPs, rent, subscriptions) configured.
                                        </p>
                                    </div>
                                ) : (
                                    renderRecurringTable(activeOutflowList, 'outflows')
                                )
                            )}
                        </div>
                    )}

                    {/* Inflow Section */}
                    {(flowFilter === "all" || flowFilter === "inflow") && (
                        <div
                            className="section-card"
                            style={{
                                marginBottom: '24px',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                borderRadius: '16px',
                                overflow: 'hidden',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                background: 'var(--card-bg)'
                            }}
                        >
                            {/* Header Block */}
                            <div
                                style={{
                                    padding: '16px 20px',
                                    background: 'rgba(16, 185, 129, 0.04)',
                                    borderBottom: collapsedSections.inflows ? 'none' : '1px solid rgba(16, 185, 129, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    flexWrap: 'wrap',
                                    gap: '12px',
                                    cursor: 'pointer',
                                    userSelect: 'none'
                                }}
                                onClick={() => toggleSection('inflows')}
                                title="Click header to expand/collapse section"
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
                                        fontSize: '1.2rem',
                                        border: '1px solid rgba(16, 185, 129, 0.3)',
                                        color: 'var(--success)'
                                    }}>
                                        <Icon name="arrowDown" />
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>Active Recurring Inflows</h3>
                                            <span style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--success)', padding: '2px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600 }}>
                                                {activeInflowList.length} {activeInflowList.length === 1 ? 'Item' : 'Items'}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>Salary, interest, rental income &amp; recurring deposit receipts</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }} onClick={e => e.stopPropagation()}>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>Period Total</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--success)' }}>
                                            +{formatCurrency(confirmedPeriodInflow)}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        style={{ border: 'none', padding: '6px', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                        onClick={(e) => { e.stopPropagation(); toggleSection('inflows'); }}
                                        title={collapsedSections.inflows ? "Expand section" : "Collapse section"}
                                    >
                                        <Icon name={collapsedSections.inflows ? "chevronDown" : "chevronUp"} />
                                    </button>
                                </div>
                            </div>
                            {!collapsedSections.inflows && (
                                activeInflowList.length === 0 ? (
                                    <div className="empty-state" style={{ padding: '20px 16px' }}>
                                        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            No active recurring inflows (salary, deposits, interest) configured.
                                        </p>
                                    </div>
                                ) : (
                                    renderRecurringTable(activeInflowList, 'inflows')
                                )
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Section 3: Expired Recurring Items list */}
            <div
                className="section-card"
                style={{
                    marginBottom: '28px',
                    border: '1px solid rgba(156, 163, 175, 0.3)',
                    borderRadius: '16px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                    background: 'var(--card-bg)'
                }}
            >
                {/* Header Block */}
                <div
                    style={{
                        padding: '16px 20px',
                        background: 'rgba(156, 163, 175, 0.04)',
                        borderBottom: collapsedSections.expired ? 'none' : '1px solid rgba(156, 163, 175, 0.3)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px',
                        cursor: 'pointer',
                        userSelect: 'none'
                    }}
                    onClick={() => toggleSection('expired')}
                    title="Click header to expand/collapse section"
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
                            fontSize: '1.2rem',
                            border: '1px solid rgba(156, 163, 175, 0.3)',
                            color: 'var(--text-muted)'
                        }}>
                            ⌛
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>Expired Recurring Transactions</h3>
                                <span style={{ background: 'var(--bg-color)', border: '1px solid var(--border-color)', color: 'var(--text-muted)', padding: '2px 10px', borderRadius: '12px', fontSize: '0.78rem', fontWeight: 600 }}>
                                    {expiredList.length} {expiredList.length === 1 ? 'Expired' : 'Expired'}
                                </span>
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>Past recurring commitments where End Date has passed</div>
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }} onClick={e => e.stopPropagation()}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ border: 'none', padding: '6px', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            onClick={(e) => { e.stopPropagation(); toggleSection('expired'); }}
                            title={collapsedSections.expired ? "Expand section" : "Collapse section"}
                        >
                            <Icon name={collapsedSections.expired ? "chevronDown" : "chevronUp"} />
                        </button>
                    </div>
                </div>
                {!collapsedSections.expired && (
                    expiredList.length === 0 ? (
                        <div className="empty-state" style={{ padding: '20px 16px' }}>
                            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                No expired recurring transactions. Items automatically move here once their End Date passes.
                            </p>
                        </div>
                    ) : (
                        <div className="table-responsive">
                            <table className="table" style={{ width: '100%', tableLayout: 'auto' }}>
                                <thead>
                                    <tr>
                                        <th style={{ whiteSpace: 'nowrap', width: '34%', minWidth: '220px' }}>Name</th>
                                        <th style={{ whiteSpace: 'nowrap', width: '13%', minWidth: '110px' }}>Category</th>
                                        <th style={{ whiteSpace: 'nowrap', width: '11%', minWidth: '95px' }}>Per Payment</th>
                                        <th style={{ whiteSpace: 'nowrap', width: '11%', minWidth: '100px' }}>Period Total</th>
                                        <th style={{ whiteSpace: 'nowrap', width: '9%', minWidth: '90px' }}>Frequency</th>
                                        <th style={{ whiteSpace: 'nowrap', width: '9%', minWidth: '100px' }}>Next Date</th>
                                        <th style={{ whiteSpace: 'nowrap', width: '7%', minWidth: '80px' }}>End Date</th>
                                        <th style={{ whiteSpace: 'nowrap', width: '6%', minWidth: '90px' }}>Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {expiredList.map(c => {
                                        if (!c) return null;
                                        const linkedTxns = safeTransactions.filter(t => t && t.linkedRecurringId === c.id);
                                        const periodAmt = getPeriodItemAmount(c);
                                        return (
                                            <tr key={c.id} style={{ opacity: 0.6 }}>
                                                <td style={{ fontWeight: 600 }}>{c.name || "Untitled"}</td>
                                                <td>{renderRecurringCategory(c.category)}</td>
                                                <td style={{ fontWeight: 600, color: c.type === "income" ? "var(--success)" : "var(--danger)", whiteSpace: 'nowrap' }}>
                                                    <span style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>{c.type === "income" ? "+" : "−"}{formatCurrency(c.amount)}</span>
                                                </td>
                                                <td style={{ fontWeight: 700, color: c.type === "income" ? "var(--success)" : (c.excludeFromMonthlyCalculations ? "var(--text-muted)" : "var(--danger)"), whiteSpace: 'nowrap' }}>
                                                    <span style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>{c.type === "income" ? "+" : "−"}{formatCurrency(periodAmt)}</span>
                                                </td>
                                                <td><span className="badge badge-info">{getCadenceLabel(c)}</span></td>
                                                <td>—</td>
                                                <td>{c.endDate ? formatDate(c.endDate, settings?.dateFormat) : "Expired"}</td>
                                                <td>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'nowrap' }}>
                                                        <button
                                                            className="btn btn-secondary btn-sm"
                                                            style={{ fontSize: '0.75rem', padding: '2px 8px', whiteSpace: 'nowrap' }}
                                                            onClick={() => setMappedModalItem(c)}
                                                            title={`${linkedTxns.length} Mapped`}
                                                        >
                                                            🔄 {linkedTxns.length}
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className={`badge ${c.excludeFromMonthlyCalculations ? "badge-queued" : "badge-income"}`}
                                                            style={{
                                                                cursor: 'pointer',
                                                                border: 'none',
                                                                padding: '3px 8px',
                                                                fontSize: '0.85rem',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                userSelect: 'none'
                                                            }}
                                                            onClick={() => toggleExcludeRecurring(c.id)}
                                                            title={c.excludeFromMonthlyCalculations ? "Excluded from recurring calculations (Click to include)" : "Included in recurring calculations (Click to exclude)"}
                                                        >
                                                            {c.excludeFromMonthlyCalculations ? "❌" : "✅"}
                                                        </button>
                                                        <div style={{ display: 'flex', gap: '4px' }}>
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                style={{ border: 'none', color: 'var(--primary)', padding: '4px 6px' }}
                                                                onClick={() => { setEditingItem(c); setShowModal(true); }}
                                                                title="Edit / Extend End Date to Reactivate"
                                                            >
                                                                ✏️
                                                            </button>
                                                            <button
                                                                className="btn btn-secondary btn-sm"
                                                                style={{ border: 'none', color: 'var(--danger)', padding: '4px 6px' }}
                                                                onClick={() => setItemToDelete(c)}
                                                                title="Delete recurring item"
                                                            >
                                                                <Icon name="trash" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )
                )}
            </div>

            {/* Delete Confirmation Modal for Recurring Entries */}
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
                            <p style={{ marginBottom: '12px', fontSize: '0.9rem' }}>Are you sure you want to delete this recurring ledger entry?</p>
                            <div style={{ padding: '12px', backgroundColor: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.88rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Name:</span>
                                    <span style={{ fontWeight: 600 }}>{itemToDelete.name}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Category:</span>
                                    <span style={{ fontWeight: 500 }}>{itemToDelete.category}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Amount:</span>
                                    <span style={{ fontWeight: 600, color: itemToDelete.type === "income" ? "var(--success)" : "var(--danger)" }}>
                                        {itemToDelete.type === "income" ? "+" : "-"}{formatCurrency(itemToDelete.amount)}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setItemToDelete(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={async () => {
                                await handleRemoveConfirmed(itemToDelete.id);
                                setItemToDelete(null);
                            }}>
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add/Edit Recurring Modal */}
            {showModal && (
                <CreateRecurringModal
                    settings={settings}
                    editingItem={editingItem}
                    onClose={() => { setShowModal(false); setEditingItem(null); }}
                    onSave={handleSaveRecurring}
                />
            )}

            {/* Log Bill Instance Modal */}
            {loggingBillItem && (
                <LogBillInstanceModal
                    item={loggingBillItem}
                    settings={settings}
                    referenceDate={(() => {
                        const { pStartStr } = getPeriodRange();
                        return pStartStr ? new Date(pStartStr + "T00:00:00") : new Date();
                    })()}
                    onClose={() => setLoggingBillItem(null)}
                    onSave={handleSaveBillInstance}
                    onClear={handleClearBillInstance}
                />
            )}

            {/* Mapped Transactions View Modal */}
            {mappedModalItem && (
                <div className="modal-overlay" onClick={() => { setMappedModalItem(null); setDeletingNoteId(null); }}>
                    <div className="modal-container" style={{ maxWidth: '620px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <h3 className="modal-title" style={{ textAlign: 'center', margin: 0, width: '100%' }}>Mapped Transactions</h3>
                            <button className="modal-close-btn" onClick={() => { setMappedModalItem(null); setDeletingNoteId(null); }} style={{ position: 'absolute', right: '20px' }}>
                                <Icon name="close" />
                            </button>
                        </div>
                        
                        <div className="modal-body" style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px' }}>
                            {/* Recurring Item Information Card */}
                            <div style={{
                                background: 'var(--bg-color)',
                                borderRadius: '12px',
                                border: '1px solid var(--border-color)',
                                padding: '14px 16px',
                                marginBottom: '20px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                    <div>
                                        <div style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                            {mappedModalItem.name}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                            {mappedModalItem.category || 'Recurring item'}
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 700, color: mappedModalItem.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                                            {mappedModalItem.type === 'income' ? '+' : '-'}{formatCurrency(mappedModalItem.estimatedAmount || mappedModalItem.amount)}
                                        </div>
                                        <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            {mappedModalItem.isVariableAmount ? '⚡ Variable (~)' : '🔒 Fixed Amount'}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '0.78rem', paddingTop: '10px', borderTop: '1px solid var(--border-color)' }}>
                                    <span className="badge badge-info">🗓️ {getCadenceLabel(mappedModalItem)}</span>
                                    {mappedModalItem.startDate && (
                                        <span className="badge badge-secondary">Start: {formatDate(mappedModalItem.startDate, settings?.dateFormat)}</span>
                                    )}
                                    {mappedModalItem.endDate && (
                                        <span className="badge badge-secondary">End: {formatDate(mappedModalItem.endDate, settings?.dateFormat)}</span>
                                    )}
                                    <span className={`badge ${mappedModalItem.excludeFromMonthlyCalculations ? "badge-queued" : "badge-income"}`}>
                                        {mappedModalItem.excludeFromMonthlyCalculations ? "🚫 Excluded from Calculations" : "📊 Included in Calculations"}
                                    </span>
                                </div>
                            </div>

                            {/* Section 0: Billing Cycles & Monthly History */}
                            <div style={{ marginBottom: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <h4 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                                        Billing Cycles & History ({(settings?.billInstances || []).filter(b => b && b.recurringId === mappedModalItem.id).length})
                                    </h4>
                                    <button
                                        type="button"
                                        className="btn btn-secondary btn-sm"
                                        style={{ fontSize: '0.75rem', padding: '3px 8px', borderRadius: '6px' }}
                                        onClick={() => setLoggingBillItem(mappedModalItem)}
                                    >
                                        + Log Cycle / Bill
                                    </button>
                                </div>
                                {((settings?.billInstances || []).filter(b => b && b.recurringId === mappedModalItem.id)).length === 0 ? (
                                    <div className="empty-state" style={{ padding: '12px 16px', background: 'var(--bg-color)', borderRadius: '8px' }}>
                                        <div className="empty-state-text">
                                            <p style={{ fontSize: '0.82rem', margin: 0 }}>
                                                No individual billing cycles logged yet.
                                                {mappedModalItem.isVariableAmount ? " Click '+ Log Cycle / Bill' to log a statement amount for a month (e.g. Sep 7, Oct 7, Nov 7)." : ""}
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                        {(settings?.billInstances || [])
                                            .filter(b => b && b.recurringId === mappedModalItem.id)
                                            .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''))
                                            .map(b => {
                                                const isPaid = b.status === 'paid';
                                                const isOverdue = !isPaid && b.dueDate && b.dueDate < todayStr;
                                                const statusBadge = isPaid
                                                    ? <span className="badge badge-success" style={{ fontSize: '0.72rem' }}>🟢 Paid</span>
                                                    : (isOverdue
                                                        ? <span className="badge badge-danger" style={{ fontSize: '0.72rem' }}>🔴 Overdue</span>
                                                        : <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>🟡 Upcoming</span>);
                                                const linkedTx = b.linkedTxId ? (transactions || []).find(t => t.id === b.linkedTxId) : null;

                                                return (
                                                    <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }}>
                                                        <div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Due {formatDate(b.dueDate, settings?.dateFormat)}</span>
                                                                {statusBadge}
                                                            </div>
                                                            {linkedTx && (
                                                                <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                                    Paid via: {linkedTx.narration || linkedTx.merchant} on {formatDate(linkedTx.date, settings?.dateFormat)}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                            <span style={{ fontWeight: 700, fontSize: '0.9rem', color: mappedModalItem.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                                                                {mappedModalItem.type === 'income' ? '+' : '-'}{formatCurrency(b.amount)}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary btn-sm"
                                                                style={{ padding: '2px 6px', fontSize: '0.72rem', height: '24px' }}
                                                                onClick={() => setLoggingBillItem({ ...mappedModalItem, _targetBillInstance: b })}
                                                                title="Edit this cycle"
                                                            >
                                                                ✏️
                                                            </button>
                                                            <button
                                                                type="button"
                                                                className="btn btn-secondary btn-sm"
                                                                style={{ padding: '2px 6px', fontSize: '0.72rem', height: '24px', color: '#DC2626' }}
                                                                onClick={() => handleClearBillInstance(mappedModalItem.id, b.id)}
                                                                title="Clear this cycle"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                    </div>
                                )}
                            </div>

                            {/* Section 1: Mapped Ledger Transactions */}
                            <div style={{ marginBottom: '24px' }}>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text-main)' }}>
                                    Mapped Transactions ({transactions.filter(t => t.linkedRecurringId === mappedModalItem.id).length})
                                </h4>
                                {transactions.filter(t => t.linkedRecurringId === mappedModalItem.id).length === 0 ? (
                                    <div className="empty-state" style={{ padding: '16px', background: 'var(--bg-color)', borderRadius: '8px' }}>
                                        <div className="empty-state-text">
                                            <p style={{ fontSize: '0.82rem', margin: 0 }}>No transactions mapped to this recurring rule yet. You can map transactions from the Transactions tab.</p>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                                        {transactions.filter(t => t.linkedRecurringId === mappedModalItem.id).map(t => (
                                            <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: '#fff' }}>
                                                <div>
                                                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>{t.narration || t.merchant}</div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{formatDate(t.date, settings?.dateFormat)} · {t.account}</div>
                                                </div>
                                                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: t.type === 'neutral' ? '#0000ff' : (t.type === 'income' ? 'var(--success)' : 'var(--danger)') }}>
                                                    {t.type === 'neutral' ? (t.neutralSign === '-' ? '-' : '+') : (t.type === 'income' ? '+' : '-')}{formatCurrency(t.amount)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Section 2: Notes & Activity Log */}
                            <div>
                                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '10px', color: 'var(--text-main)' }}>
                                    Notes & Activity Log ({(mappedModalItem.changeLogs?.length || 0) + (mappedModalItem.amountHistory?.length || 0)})
                                </h4>
                                
                                {/* Add Note Input */}
                                <form onSubmit={handleAddMappedNote} style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="Add a note or log entry..."
                                        value={newNoteText}
                                        onChange={e => setNewNoteText(e.target.value)}
                                        style={{ fontSize: '0.82rem', flex: 1 }}
                                    />
                                    <button
                                        type="submit"
                                        className="btn btn-primary btn-sm"
                                        disabled={!newNoteText.trim()}
                                        style={{ whiteSpace: 'nowrap', padding: '6px 12px' }}
                                    >
                                        + Add Note
                                    </button>
                                </form>

                                {/* Combined List of Notes & Revision History */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
                                    {/* Manual Notes */}
                                    {(mappedModalItem.changeLogs || []).map(log => (
                                        <div key={log.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '8px 12px', borderRadius: '8px', background: 'var(--bg-color)', border: '1px solid var(--border-color)' }}>
                                            <div style={{ flex: 1, paddingRight: '8px' }}>
                                                <div style={{ fontSize: '0.83rem', color: 'var(--text-main)', whiteSpace: 'pre-wrap' }}>{log.text}</div>
                                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                    📝 Note · {log.dateStr ? formatDate(log.dateStr, settings?.dateFormat) : new Date(log.timestamp).toLocaleDateString()}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn-sm"
                                                onClick={() => handleDeleteMappedNote(log.id)}
                                                style={{
                                                    padding: '2px 8px',
                                                    fontSize: '0.75rem',
                                                    background: deletingNoteId === log.id ? 'var(--danger)' : 'transparent',
                                                    color: deletingNoteId === log.id ? '#fff' : 'var(--danger)',
                                                    border: deletingNoteId === log.id ? '1px solid var(--danger)' : '1px solid var(--border-color)',
                                                    borderRadius: '5px',
                                                    cursor: 'pointer',
                                                    whiteSpace: 'nowrap'
                                                }}
                                                title={deletingNoteId === log.id ? "Click again to confirm deletion" : "Delete note"}
                                            >
                                                {deletingNoteId === log.id ? "Confirm Delete?" : "🗑️"}
                                            </button>
                                        </div>
                                    ))}

                                    {/* Amount Revision History */}
                                    {(mappedModalItem.amountHistory || []).map((ah, idx) => (
                                        <div key={`ah-${idx}`} style={{ padding: '8px 12px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.06)', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                                            <div style={{ fontSize: '0.83rem', color: 'var(--text-main)' }}>
                                                ℹ️ Amount revised to <strong>{formatCurrency(ah.amount)}</strong>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                                                Revision History · {formatDate(ah.changedAt, settings?.dateFormat)}
                                            </div>
                                        </div>
                                    ))}

                                    {(!mappedModalItem.changeLogs || mappedModalItem.changeLogs.length === 0) && (!mappedModalItem.amountHistory || mappedModalItem.amountHistory.length === 0) && (
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontStyle: 'italic', padding: '10px', textAlign: 'center' }}>
                                            No notes or change history logged yet.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="modal-footer" style={{ padding: '12px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => { setMappedModalItem(null); setDeletingNoteId(null); }}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- SUB-COMPONENT: Create / Edit Recurring Transaction Modal ---


export const DocumentsPage = ({ documents, transactions, settings, onSyncFolder, showToast, loadState, onDeleteDocument, updateSetting, onViewDocumentTransactions }) => {
    const [docToDelete, setDocToDelete] = React.useState(null);
    const [deleteStep, setDeleteStep] = React.useState(1);

    // Each file's statement period (first → last date), and the list ordered by it (oldest first)
    const documentRows = React.useMemo(() => {
        const periods = buildDocumentPeriods(settings?.statements, transactions, documents);
        return [...(documents || [])]
            .map(d => ({ ...d, period: periods.get(d.id) || null }))
            .sort(compareByPeriod);
    }, [documents, transactions, settings?.statements]);

    const handleManualUpload = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        let uploadCount = 0;
        for (let i = 0; i < files.length; i++) {
            const file = files[i];

            // Validate size limit (20MB)
            if (file.size > 20 * 1024 * 1024) {
                showToast(`File "${file.name}" exceeds 20 MB size limit`, "error");
                continue;
            }

            const docId = crypto.randomUUID();
            await saveDocumentInDB({
                id: docId,
                filename: file.name,
                mimeType: file.type || "application/octet-stream",
                size: file.size,
                status: "stored",
                source: "upload",
                createdAt: new Date(Date.now() + i * 10).toISOString()
                // fileData Blob omitted to save local storage space
            });
            uploadCount++;
        }

        if (uploadCount > 0) {
            showToast(`Successfully uploaded ${uploadCount} file(s)`);
            loadState();
        }
    };

    const formatBytes = (bytes) => {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const syncMeta = settings.driveSyncMetadata || null;

    return (
        <div>
            <StatementHealth settings={settings} transactions={transactions} updateSetting={updateSetting} showToast={showToast} />

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginBottom: '28px' }}>

                {/* Box 1: File Uploader dropzone */}
                <div className="section-card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="section-card-title">Upload Receipts / Invoices</div>
                    <label className="upload-zone" style={{ flex: 1 }}>
                        <Icon name="download" />
                        <div>
                            <h4 style={{ fontWeight: 600, color: 'var(--text-main)' }}>Click to select files</h4>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>Accepts Images, PDFs, CSVs (Max 20MB)</p>
                        </div>
                        <input
                            type="file"
                            multiple
                            style={{ display: 'none' }}
                            onChange={handleManualUpload}
                            accept=".csv,.pdf,image/*"
                        />
                    </label>
                </div>

                {/* Box 2: Local Directory Watcher config */}
                <div className="section-card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="section-card-title">Directory Inbox Sync</div>

                    <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '16px' }}>
                        Sync transactions automatically from a local folder on your computer by authorizing directory access.
                    </p>

                    <div style={{ padding: '14px', backgroundColor: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.85rem', marginBottom: '16px' }}>
                        {syncMeta ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div>Folder: <strong>{syncMeta.folderName}</strong></div>
                                <div>Last sync: {formatDate(syncMeta.lastSync, settings.dateFormat)}</div>
                                <div>New files: {syncMeta.filesScanned} | Added: {syncMeta.transactionsAdded}</div>
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-light)', textAlign: 'center', padding: '10px 0' }}>
                                No local folders synced yet.
                            </div>
                        )}
                    </div>

                    <button className="btn btn-primary" style={{ marginTop: 'auto' }} onClick={onSyncFolder}>
                        <Icon name="sync" />
                        <span>Sync Local Directory</span>
                    </button>
                </div>
            </div>

            {/* Vault Table list */}
            <div className="section-card">
                <div className="section-card-title">Secure Vault Files</div>
                {documents.length === 0 ? (
                    <div className="empty-state">
                        <Icon name="documents" />
                        <div className="empty-state-text">
                            <h3>No Documents Stored</h3>
                            <p>Upload files or sync folders to stack receipt files securely in database.</p>
                        </div>
                    </div>
                ) : (
                    <div className="table-responsive">
                        <table className="table">
                            <thead>
                                <tr>
                                    <th>Filename</th>
                                    <th>Source</th>
                                    <th>Status</th>
                                    <th style={{ textAlign: 'center' }}>Transactions</th>
                                    <th>Statement Period</th>
                                    <th>Uploaded Date & Time</th>
                                    <th style={{ width: '60px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {documentRows.map(d => {
                                    const count = transactions ? transactions.filter(t => t.documentId === d.id).length : 0;
                                    return (
                                        <tr key={d.id}>
                                            <td style={{ fontWeight: 600 }}>{d.filename}</td>
                                            <td style={{ textTransform: 'capitalize' }}>{d.source === "google-drive" ? "Folder Sync" : d.source}</td>
                                            <td>
                                                <span className={`badge badge-${d.status}`}>
                                                    {d.status}
                                                </span>
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {count > 0 ? (
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        style={{
                                                            fontSize: '0.78rem',
                                                            padding: '3px 10px',
                                                            borderRadius: '6px',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            cursor: 'pointer',
                                                            color: 'var(--primary)',
                                                            background: 'var(--primary-light, #EEF2FF)',
                                                            border: '1px solid #C7D2FE'
                                                        }}
                                                        onClick={() => onViewDocumentTransactions && onViewDocumentTransactions(d.id)}
                                                        title={`View ${count} transactions imported from "${d.filename}"`}
                                                    >
                                                        <span>🔍 {count} {count === 1 ? 'txn' : 'txns'}</span>
                                                    </button>
                                                ) : (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>0 txns</span>
                                                )}
                                            </td>
                                            <td style={{ whiteSpace: 'nowrap', fontWeight: 500 }}>
                                                {d.period && (d.period.start || d.period.end)
                                                    ? (d.period.start && d.period.end && d.period.start !== d.period.end
                                                        ? `${formatDate(d.period.start, settings.dateFormat)} → ${formatDate(d.period.end, settings.dateFormat)}`
                                                        : formatDate(d.period.start || d.period.end, settings.dateFormat))
                                                    : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                                            </td>
                                            <td>{formatDateTime(d.createdAt, settings.dateFormat)}</td>
                                            <td style={{ textAlign: 'right' }}>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ border: 'none', color: 'var(--danger)' }}
                                                    onClick={() => {
                                                        setDocToDelete(d);
                                                        setDeleteStep(1);
                                                    }}
                                                    title="Delete File"
                                                >
                                                    <Icon name="trash" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Delete File Confirmation Modal */}
            {docToDelete && (
                <div className="modal-overlay confirm-modal-overlay">
                    <div className="modal-container">
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ color: 'var(--danger)' }}>
                                {deleteStep === 1 ? "Delete Vault File?" : "Confirm Permanent Deletion"}
                            </h3>
                            <button className="modal-close-btn" onClick={() => setDocToDelete(null)}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modal-body">
                            {deleteStep === 1 ? (
                                <div>
                                    <p style={{ marginBottom: '12px' }}>
                                        Are you sure you want to delete the file <strong>{docToDelete.filename}</strong>?
                                    </p>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                        This action will delete the file from your Secure Vault and <strong>remove all associated transactions</strong> parsed from it.
                                    </p>
                                    <div style={{ marginTop: '16px', padding: '12px', backgroundColor: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: 'var(--danger)', fontSize: '0.875rem' }}>
                                        <strong>Associated transactions found:</strong> {transactions ? transactions.filter(t => t.documentId === docToDelete.id).length : 0}
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <p style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: '12px' }}>
                                        This action is permanent and cannot be undone!
                                    </p>
                                    <p>
                                        Please confirm once again that you want to delete <strong>{docToDelete.filename}</strong> and all of its associated transactions.
                                    </p>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setDocToDelete(null)}>Cancel</button>
                            {deleteStep === 1 ? (
                                <button className="btn btn-danger" onClick={() => setDeleteStep(2)}>
                                    Delete File
                                </button>
                            ) : (
                                <button className="btn btn-danger" onClick={async () => {
                                    await onDeleteDocument(docToDelete.id);
                                    setDocToDelete(null);
                                }}>
                                    Confirm Permanently Delete
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


// --- SUB-PAGE: Rules (Section 15) ---


export const RulesPage = ({ rules, tags = [], settings, transactions = [], onBulkCategorize, showToast, onSaveRule, onDeleteRule, onRunRule, subpageActionSignal }) => {
    return (
        <div>
            <RulesManager
                rules={rules}
                transactions={transactions}
                settings={settings}
                tags={tags}
                openCreateSignal={subpageActionSignal}
                onSaveRule={onSaveRule}
                onDeleteRule={onDeleteRule}
                onRunRule={onRunRule}
                showToast={showToast}
            />

            {onBulkCategorize && (
                <LearnedMerchants transactions={transactions} settings={settings} onBulkCategorize={onBulkCategorize} showToast={showToast} />
            )}
        </div>
    );
};


// --- SUB-PAGE: Settings (Section 16) ---


export const SettingsPage = ({
    privacy,
    settings,
    updateSetting,
    onWipe,
    showToast,
    tags = [],
    transactions = [],
    rules = [],
    documents = [],
    onAddTag,
    onDeleteTag,
    onUpdateTag,
    onUpdateTransactions,
    loadState,
    currentUser,
    cloudSyncStatus,
    onOpenCloudAuth,
    onSignOutCloud
}) => {

    // Net worth configurations
    const [geminiKeyInput, setGeminiKeyInput] = React.useState(() => {
        try { return localStorage.getItem("gemini_api_key") || ""; } catch (e) { return ""; }
    });
    const [assets, setAssets] = React.useState(settings.assetsTotal || 0);
    const [liabilities, setLiabilities] = React.useState(settings.liabilitiesTotal || 0);

    // Backup & restore state
    const [isExporting, setIsExporting] = React.useState(false);
    const [isRestoring, setIsRestoring] = React.useState(false);
    const [pendingRestoreBackup, setPendingRestoreBackup] = React.useState(null);
    const [importInputKey, setImportInputKey] = React.useState(Date.now());

    // Storage Persistence & Local Project File Sync
    const [isPersisted, setIsPersisted] = React.useState(false);
    const [linkedFile, setLinkedFile] = React.useState(() => getGlobalFileHandle());
    const [filePermissionGranted, setFilePermissionGranted] = React.useState(false);
    const [isFileSyncing, setIsFileSyncing] = React.useState(false);

    React.useEffect(() => {
        checkStoragePersistence().then(persisted => {
            setIsPersisted(persisted);
        });

        // Check if there is an active file handle in memory or IndexedDB and query permissions
        const checkFilePermission = async () => {
            const { handle, permissionGranted } = await restoreGlobalFileHandle();
            if (handle) {
                setLinkedFile(handle);
                setFilePermissionGranted(permissionGranted);
            } else {
                const current = getGlobalFileHandle();
                setLinkedFile(current);
                if (current && current.queryPermission) {
                    const status = await current.queryPermission({ mode: 'readwrite' });
                    setFilePermissionGranted(status === 'granted');
                }
            }
        };
        checkFilePermission();
    }, [settings.storageMode]);

    const handleRequestPersistence = async () => {
        const granted = await requestStoragePersistence();
        setIsPersisted(granted);
        if (granted) {
            showToast("Storage Lock Granted! Data is protected from browser eviction.", "success");
        } else {
            showToast("Storage Lock requested! Bookmarking this tab completes browser-level lock.", "warning");
        }
    };

    const handleSwitchStorageMode = async (targetMode) => {
        if (targetMode === "project_file") {
            let handle = linkedFile || getGlobalFileHandle();
            if (!handle) {
                handle = await getHandleFromIndexedDB();
            }

            if (!handle && !settings.linkedFileName) {
                await handleLinkProjectFile();
            } else {
                await updateSetting("storageMode", "project_file");
                showToast("Active Storage Engine: Local Project Folder File (.json)", "success");
                if (handle) {
                    setLinkedFile(handle);
                    setGlobalFileHandle(handle);
                    setIsFileSyncing(true);
                    const success = await writeStateToLocalFile(handle, { transactions, tags, rules, settings, documents });
                    setIsFileSyncing(false);
                    if (success) {
                        setFilePermissionGranted(true);
                    }
                }
            }
        } else {
            await updateSetting("storageMode", "browser");
            showToast("Active Storage Engine: Web Browser Database (IndexedDB)", "info");
        }
    };

    const handleLinkProjectFile = async () => {
        try {
            // Open native file picker to select an existing .json file
            const handle = await openLocalProjectFile();
            if (handle) {
                const hasPerm = await verifyFileHandlePermission(handle, true);
                setLinkedFile(handle);
                setGlobalFileHandle(handle);
                setFilePermissionGranted(hasPerm);
                const tz = settings?.timezone || "Asia/Calcutta";
                await updateSetting("storageMode", "project_file");
                await updateSetting("linkedFileName", handle.name || "financials-data.json");
                await updateSetting("lastFileSyncedAt", getISOStringInTimezone(new Date(), tz));

                setIsFileSyncing(true);
                // If browser has transactions, sync current state (with deletions) to file
                // If browser has 0 transactions but file has data, restore from file
                if ((!transactions || transactions.length === 0) && hasPerm) {
                    const fileData = await readStateFromLocalFile(handle);
                    if (fileData && fileData.transactions && fileData.transactions.length > 0) {
                        const stats = await restoreBackup(fileData, {
                            initDB,
                            saveSettingInDB,
                            saveTagInDB,
                            saveRuleInDB,
                            saveDocumentInDB,
                            wipeDatabase
                        });
                        if (typeof loadState === "function") {
                            await loadState();
                        }
                        showToast(`Linked "${handle.name}" and loaded ${stats.transactions} transactions from file!`, "success");
                        setIsFileSyncing(false);
                        return;
                    }
                }

                const success = await writeStateToLocalFile(handle, { transactions, tags, rules, settings, documents });
                setIsFileSyncing(false);

                if (success) {
                    showToast(`Linked existing file "${handle.name}" and synced ${transactions.length} transactions!`, "success");
                } else {
                    showToast(`Linked "${handle.name}". Please grant write permission to enable auto-sync.`, "warning");
                }
            }
        } catch (err) {
            showToast(`Failed to link file: ${err.message}`, "error");
        }
    };

    const handleCreateNewProjectFile = async () => {
        try {
            const handle = await pickLocalProjectFile("financials-data.json");
            if (handle) {
                setLinkedFile(handle);
                setGlobalFileHandle(handle);
                setFilePermissionGranted(true);
                const tz = settings?.timezone || "Asia/Calcutta";
                await updateSetting("storageMode", "project_file");
                await updateSetting("linkedFileName", handle.name || "financials-data.json");
                await updateSetting("lastFileSyncedAt", getISOStringInTimezone(new Date(), tz));

                setIsFileSyncing(true);
                const success = await writeStateToLocalFile(handle, { transactions, tags, rules, settings, documents });
                setIsFileSyncing(false);

                if (success) {
                    showToast(`Created new project file "${handle.name}" and synced data!`, "success");
                } else {
                    showToast(`Created "${handle.name}". Ready for sync.`, "warning");
                }
            }
        } catch (err) {
            showToast(`Failed to create file: ${err.message}`, "error");
        }
    };

    const handleReAuthorizeFile = async () => {
        let handle = linkedFile || getGlobalFileHandle();
        if (!handle) {
            handle = await getHandleFromIndexedDB();
        }
        if (handle) {
            const granted = await verifyFileHandlePermission(handle, true);
            if (granted) {
                setLinkedFile(handle);
                setGlobalFileHandle(handle);
                setFilePermissionGranted(true);
                showToast(`Permission granted for "${handle.name}". Syncing...`, "success");
                setIsFileSyncing(true);
                await writeStateToLocalFile(handle, { transactions, tags, rules, settings, documents });
                setIsFileSyncing(false);
                const tz = settings?.timezone || "Asia/Calcutta";
                const nowIso = getISOStringInTimezone(new Date(), tz);
                await updateSetting("lastFileSyncedAt", nowIso);
                return;
            }
        }
        // If handle is invalid or user wants to re-pick, open native open picker
        await handleLinkProjectFile();
    };

    const handleManualFileSync = async () => {
        let handle = linkedFile || getGlobalFileHandle();
        if (!handle) {
            handle = await getHandleFromIndexedDB();
        }
        if (!handle) {
            await handleLinkProjectFile();
            return;
        }
        setIsFileSyncing(true);
        const success = await writeStateToLocalFile(handle, { transactions, tags, rules, settings, documents });
        setIsFileSyncing(false);
        if (success) {
            setLinkedFile(handle);
            setGlobalFileHandle(handle);
            setFilePermissionGranted(true);
            const tz = settings?.timezone || "Asia/Calcutta";
            const nowIso = getISOStringInTimezone(new Date(), tz);
            await updateSetting("lastFileSyncedAt", nowIso);
            showToast(`Synced ${transactions.length} transactions to "${handle.name || settings.linkedFileName || 'financials-data.json'}"`, "success");
        } else {
            setFilePermissionGranted(false);
            showToast(`Could not write to local file. Please click 'Re-connect File' to grant permission.`, "error");
        }
    };

    const handleUnlinkProjectFile = async () => {
        setLinkedFile(null);
        setGlobalFileHandle(null);
        setFilePermissionGranted(false);
        await updateSetting("storageMode", "browser");
        await updateSetting("linkedFileName", null);
        showToast("Unlinked local file. Reverted to Web Browser storage mode.", "info");
    };

    // Lists management
    const [selectedParentCategory, setSelectedParentCategory] = React.useState("");
    const [customParentCategory, setCustomParentCategory] = React.useState("");
    const [newSubcategoryName, setNewSubcategoryName] = React.useState("");
    const [newSubcategoryEmoji, setNewSubcategoryEmoji] = React.useState("");
    const [newCategoryType, setNewCategoryType] = React.useState("expense");
    const [categorySearch, setCategorySearch] = React.useState("");
    const [categoryTab, setCategoryTab] = React.useState("all");
    const [showCategoryModal, setShowCategoryModal] = React.useState(false);
    const closeCategoryModal = React.useCallback(() => setShowCategoryModal(false), []);
    useEscapeKey(showCategoryModal ? closeCategoryModal : null);

    // Lock body scroll while category setup modal is open
    React.useEffect(() => {
        if (!showCategoryModal) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [showCategoryModal]);

    // Tag management state
    const [newTagName, setNewTagName] = React.useState("");
    const [newTagColor, setNewTagColor] = React.useState("#4F46E5");
    const [editingTag, setEditingTag] = React.useState(null);

    const tagUsageCounts = React.useMemo(() => {
        const counts = {};
        if (transactions) {
            transactions.forEach(t => {
                if (t.tags && Array.isArray(t.tags)) {
                    t.tags.forEach(tag => {
                        counts[tag] = (counts[tag] || 0) + 1;
                    });
                }
            });
        }
        return counts;
    }, [transactions]);

    const categoryUsageCounts = React.useMemo(() => {
        const counts = {};
        if (transactions) {
            transactions.forEach(t => {
                if (t.category) {
                    counts[t.category] = (counts[t.category] || 0) + 1;
                }
            });
        }
        return counts;
    }, [transactions]);

    const [wipeConfirmation, setWipeConfirmation] = React.useState("");
    const [showWipeModal, setShowWipeModal] = React.useState(false);
    const [confirmDeleteTag, setConfirmDeleteTag] = React.useState(null);
    const [confirmDeleteCategory, setConfirmDeleteCategory] = React.useState(null);

    const categories = settings.categories || [];
    const accounts = settings.accounts || [];
    const dismissedCount = (settings.dismissedPatterns || []).length;

    const parentCategories = React.useMemo(() => {
        const parents = new Set();
        categories.forEach(c => {
            if (c.includes(" - ")) {
                parents.add(c.split(" - ")[0]);
            }
        });
        return Array.from(parents);
    }, [categories]);

    React.useEffect(() => {
        if (parentCategories.length > 0 && !selectedParentCategory) {
            setSelectedParentCategory(parentCategories[0]);
        }
    }, [parentCategories]);

    const handleSaveNetWorth = async (e) => {
        e.preventDefault();
        await updateSetting("assetsTotal", Number(assets));
        await updateSetting("liabilitiesTotal", Number(liabilities));
        await updateSetting("netWorthConfigured", true);
        showToast("Net Worth values stored successfully");
    };

    const handleExportBackup = async () => {
        try {
            setIsExporting(true);
            const stats = await exportBackup({ transactions, tags, rules, settings, documents });
            showToast(`Backup exported: ${stats.transactions} transactions, ${stats.rules} rules, ${stats.tags} tags, and all settings.`);
        } catch (err) {
            showToast(`Export failed: ${err.message}`, "error");
        } finally {
            setIsExporting(false);
        }
    };

    const handleFileSelectForImport = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const parsed = await importBackup(file);
            setPendingRestoreBackup(parsed);
        } catch (err) {
            showToast(err.message || "Failed to read backup file", "error");
        } finally {
            setImportInputKey(Date.now());
        }
    };

    const handleConfirmRestore = async () => {
        if (!pendingRestoreBackup) return;
        try {
            setIsRestoring(true);
            const stats = await restoreBackup(pendingRestoreBackup, {
                initDB,
                saveSettingInDB,
                saveTagInDB,
                saveRuleInDB,
                saveDocumentInDB,
                wipeDatabase
            });
            if (typeof loadState === "function") {
                await loadState();
            }
            showToast(`Data restored successfully: ${stats.transactions} transactions, ${stats.rules} rules, ${stats.tags} tags.`);
            setPendingRestoreBackup(null);
        } catch (err) {
            showToast(`Restore failed: ${err.message}`, "error");
        } finally {
            setIsRestoring(false);
        }
    };

    const handleAddCategory = async () => {
        const parent = selectedParentCategory === "NEW" ? customParentCategory.trim() : (selectedParentCategory || "").trim();
        const sub = newSubcategoryName.trim();
        const emoji = newSubcategoryEmoji.trim() || "⚙️";

        if (!parent) {
            showToast("Main Category name cannot be empty", "error");
            return;
        }
        if (!sub) {
            showToast("Subcategory name cannot be empty", "error");
            return;
        }

        const fullName = `${parent} - ${sub} ${emoji}`;

        if (categories.some(c => normalizeCategoryName(c) === normalizeCategoryName(fullName))) {
            showToast("Category and Subcategory mapping already exists", "error");
            return;
        }

        const updatedCategories = [...categories, fullName];
        const isDefaultParent = ["Food & Drinks", "Groceries", "Transport", "Shopping", "Personal", "Utilities", "Subscriptions", "Health", "Entertainment", "Fitness", "Home", "Services", "Support", "Income", "Transfer", "Misc", "Others"].includes(parent);
        const updatedTypes = { ...(settings.categoryTypes || {}), [fullName]: newCategoryType };
        if (!isDefaultParent && selectedParentCategory === "NEW") {
            updatedTypes[parent] = newCategoryType;
        }

        await updateSetting("categories", updatedCategories);
        await updateSetting("categoryTypes", updatedTypes);

        setNewSubcategoryName("");
        setNewSubcategoryEmoji("");
        if (selectedParentCategory === "NEW") {
            setCustomParentCategory("");
            setSelectedParentCategory(parent);
        }
        showToast(`Subcategory "${sub}" added to "${parent}" (${newCategoryType.toUpperCase()})`);
    };

    const handleRemoveCategory = async (cat) => {
        if (DEFAULT_CATEGORIES.includes(cat)) {
            showToast("Pre-determined categories cannot be deleted", "error");
            return;
        }
        if (categories.length <= 1) {
            showToast("Must have at least one category", "error");
            return;
        }
        const updated = categories.filter(c => c !== cat);
        const updatedTypes = { ...(settings.categoryTypes || {}) };
        delete updatedTypes[cat];
        await updateSetting("categories", updated);
        await updateSetting("categoryTypes", updatedTypes);

        // Transactions that used this category go back to "Needs Review" so they land in the Review inbox
        const reviewCategory = DEFAULT_CATEGORIES.find(c => c.startsWith("Others - Needs Review")) || "Others - Needs Review 🔍";
        let count = 0;
        const updatedTxList = await Promise.all(transactions.map(async t => {
            if (t.category === cat || (t.category && t.category.startsWith(cat + " - "))) {
                count++;
                const updatedTx = { ...t, category: reviewCategory, categorySource: "unknown" };
                await updateTransactionInDB(updatedTx);
                return updatedTx;
            }
            return t;
        }));
        if (count > 0 && typeof onUpdateTransactions === "function") {
            onUpdateTransactions(updatedTxList);
        }

        showToast(`Category "${cat}" removed${count > 0 ? ` and ${count} transaction(s) sent to Needs Review` : ''}`);
    };

    const handleRestoreSuggestions = async () => {
        await updateSetting("dismissedPatterns", []);
        showToast("All ignored suggestions restored");
    };

    const handleConfirmWipe = () => {
        if (wipeConfirmation === "DELETE") {
            onWipe();
            setShowWipeModal(false);
            setWipeConfirmation("");
        } else {
            showToast("Must type DELETE exactly", "error");
        }
    };

    const groupedCategories = React.useMemo(() => {
        const groups = {};
        const DEFAULT_EXPENSE_PARENTS = ["Food & Drinks", "Groceries", "Transport", "Shopping", "Personal", "Utilities", "Subscriptions", "Health", "Entertainment", "Fitness", "Home", "Services", "Support"];
        const DEFAULT_INCOME_PARENTS = ["Income"];
        const DEFAULT_NEUTRAL_PARENTS = ["Transfer", "Misc", "Others"];

        categories.forEach(c => {
            const parent = c.includes(" - ") ? c.split(" - ")[0] : "Others";
            const subAndEmoji = c.includes(" - ") ? c.split(" - ")[1] : c;

            // Extract label and emoji
            const emojiMatch = subAndEmoji.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji}/u);
            const emoji = emojiMatch ? emojiMatch[0] : "⚙️";
            const label = subAndEmoji.replace(emoji, "").trim();

            let parentType = "expense";
            if (DEFAULT_INCOME_PARENTS.includes(parent)) parentType = "income";
            else if (DEFAULT_NEUTRAL_PARENTS.includes(parent)) parentType = "neutral";
            else if (DEFAULT_EXPENSE_PARENTS.includes(parent)) parentType = "expense";
            else parentType = (settings.categoryTypes || {})[parent] || "expense";

            const isDefault = DEFAULT_CATEGORIES.includes(c);
            const itemType = isDefault ? parentType : ((settings.categoryTypes || {})[c] || parentType);

            if (!groups[parent]) {
                groups[parent] = {
                    name: parent,
                    type: parentType,
                    description: CATEGORY_DESCRIPTIONS[parent] || "",
                    items: []
                };
            }
            groups[parent].items.push({
                full: c,
                label: label,
                emoji: emoji,
                isDefault: isDefault,
                type: itemType
            });
        });
        return groups;
    }, [categories, settings.categoryTypes]);

    const filteredParentCategories = React.useMemo(() => {
        return parentCategories.filter(p => {
            const pGroup = groupedCategories[p];
            const pType = pGroup ? pGroup.type : (
                (settings.categoryTypes || {})[p] ||
                (["Income"].includes(p) ? "income" : ["Transfer", "Misc", "Others"].includes(p) ? "neutral" : "expense")
            );
            return pType === newCategoryType;
        });
    }, [parentCategories, groupedCategories, settings.categoryTypes, newCategoryType]);

    const displayParentCategories = filteredParentCategories.length > 0 ? filteredParentCategories : parentCategories;

    React.useEffect(() => {
        if (selectedParentCategory !== "NEW") {
            if (displayParentCategories.length > 0 && !displayParentCategories.includes(selectedParentCategory)) {
                setSelectedParentCategory(displayParentCategories[0]);
            }
        }
    }, [newCategoryType, displayParentCategories]);

    const customCategoryCount = React.useMemo(() => categories.filter(c => !DEFAULT_CATEGORIES.includes(c)).length, [categories]);
    const defaultCategoryCount = categories.length - customCategoryCount;

    const filteredCategoryGroups = React.useMemo(() => {
        const query = categorySearch.toLowerCase().trim();
        let groupList = Object.values(groupedCategories);

        // When user types a search query, search across ALL categories & subcategories regardless of selected tab below
        if (query) {
            const result = [];
            groupList.forEach(g => {
                const isParentMatch = g.name.toLowerCase().includes(query) || (g.description && g.description.toLowerCase().includes(query));
                const matchingItems = g.items.filter(item => item.label.toLowerCase().includes(query) || item.full.toLowerCase().includes(query));

                if (isParentMatch) {
                    result.push(g);
                } else if (matchingItems.length > 0) {
                    result.push({
                        ...g,
                        items: matchingItems
                    });
                }
            });
            return result;
        }

        // When no search query, filter by selected tab
        if (categoryTab === "custom") {
            groupList = groupList.map(g => ({
                ...g,
                items: g.items.filter(item => !item.isDefault)
            })).filter(g => g.items.length > 0);
        } else if (categoryTab === "default") {
            groupList = groupList.map(g => ({
                ...g,
                items: g.items.filter(item => item.isDefault)
            })).filter(g => g.items.length > 0);
        } else if (categoryTab === "expense") {
            groupList = groupList.map(g => ({
                ...g,
                items: g.items.filter(item => item.type === "expense")
            })).filter(g => g.items.length > 0);
        } else if (categoryTab === "income") {
            groupList = groupList.map(g => ({
                ...g,
                items: g.items.filter(item => item.type === "income")
            })).filter(g => g.items.length > 0);
        } else if (categoryTab === "neutral") {
            groupList = groupList.map(g => ({
                ...g,
                items: g.items.filter(item => item.type === "neutral")
            })).filter(g => g.items.length > 0);
        } else if (categoryTab !== "all") {
            groupList = groupList.filter(g => g.name === categoryTab);
        }

        return groupList;
    }, [groupedCategories, categorySearch, categoryTab]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Section 1: Preference Settings */}
            <div className="section-card">
                <div className="section-card-title">Preference Settings</div>
                <div className="form-row" style={{ maxWidth: '640px' }}>
                    <div className="form-field">
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>System Currency</label>
                        <select
                            className="form-control"
                            value={settings.currency || "INR"}
                            onChange={async (e) => {
                                const val = e.target.value;
                                await updateSetting("currency", val);
                                showToast(`Currency updated to ${val}`);
                            }}
                            style={{ width: '100%' }}
                        >
                            <option value="INR">Indian Rupee (₹)</option>
                            <option value="USD">US Dollar ($)</option>
                            <option value="EUR">Euro (€)</option>
                            <option value="GBP">British Pound (£)</option>
                            <option value="JPY">Japanese Yen (¥)</option>
                            <option value="CAD">Canadian Dollar ($)</option>
                            <option value="AUD">Australian Dollar ($)</option>
                        </select>
                    </div>
                    <div className="form-field">
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Date Format</label>
                        <select
                            className="form-control"
                            value={settings.dateFormat || "24/Jun/2002 Sun"}
                            onChange={async (e) => {
                                const val = e.target.value;
                                await updateSetting("dateFormat", val);
                                showToast(`Date format updated`);
                            }}
                            style={{ width: '100%' }}
                        >
                            <option value="24/Jun/2002 Sun">24/Jun/2002 Sun (Default)</option>
                            <option value="MM/DD/YY">MM/DD/YY (06/24/02)</option>
                            <option value="DD/MM/YYYY">DD/MM/YYYY (24/06/2002)</option>
                            <option value="YYYY-MM-DD">YYYY-MM-DD (2002-06-24)</option>
                            <option value="MM/DD/YYYY">MM/DD/YYYY (06/24/2002)</option>
                            <option value="DD-MM-YYYY">DD-MM-YYYY (24-06-2002)</option>
                            <option value="MMM DD, YYYY">MMM DD, YYYY (Jun 24, 2002)</option>
                        </select>
                    </div>
                    <div className="form-field">
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>Timezone</label>
                        <select
                            className="form-control"
                            value={settings.timezone || "Asia/Calcutta"}
                            onChange={async (e) => {
                                const val = e.target.value;
                                await updateSetting("timezone", val);
                                showToast(`Timezone updated to ${val}`);
                            }}
                            style={{ width: '100%' }}
                        >
                            <optgroup label="Asia">
                                <option value="Asia/Calcutta">IST — India Standard Time (UTC+5:30) ★ Default</option>
                                <option value="Asia/Kolkata">Asia/Kolkata (UTC+5:30)</option>
                                <option value="Asia/Dhaka">BST — Bangladesh (UTC+6:00)</option>
                                <option value="Asia/Karachi">PKT — Pakistan (UTC+5:00)</option>
                                <option value="Asia/Dubai">GST — Gulf (UTC+4:00)</option>
                                <option value="Asia/Singapore">SGT — Singapore (UTC+8:00)</option>
                                <option value="Asia/Shanghai">CST — China (UTC+8:00)</option>
                                <option value="Asia/Tokyo">JST — Japan (UTC+9:00)</option>
                                <option value="Asia/Seoul">KST — Korea (UTC+9:00)</option>
                                <option value="Asia/Bangkok">ICT — Indochina (UTC+7:00)</option>
                                <option value="Asia/Riyadh">AST — Arabia (UTC+3:00)</option>
                                <option value="Asia/Jakarta">WIB — West Indonesia (UTC+7:00)</option>
                            </optgroup>
                            <optgroup label="Europe">
                                <option value="Europe/London">GMT/BST — London (UTC+0/+1)</option>
                                <option value="Europe/Paris">CET/CEST — Paris (UTC+1/+2)</option>
                                <option value="Europe/Berlin">CET/CEST — Berlin (UTC+1/+2)</option>
                                <option value="Europe/Moscow">MSK — Moscow (UTC+3:00)</option>
                                <option value="Europe/Istanbul">TRT — Turkey (UTC+3:00)</option>
                            </optgroup>
                            <optgroup label="Americas">
                                <option value="America/New_York">EST/EDT — New York (UTC-5/-4)</option>
                                <option value="America/Chicago">CST/CDT — Chicago (UTC-6/-5)</option>
                                <option value="America/Denver">MST/MDT — Denver (UTC-7/-6)</option>
                                <option value="America/Los_Angeles">PST/PDT — Los Angeles (UTC-8/-7)</option>
                                <option value="America/Sao_Paulo">BRT — São Paulo (UTC-3:00)</option>
                                <option value="America/Toronto">EST/EDT — Toronto (UTC-5/-4)</option>
                                <option value="America/Vancouver">PST/PDT — Vancouver (UTC-8/-7)</option>
                            </optgroup>
                            <optgroup label="Africa &amp; Middle East">
                                <option value="Africa/Johannesburg">SAST — South Africa (UTC+2:00)</option>
                                <option value="Africa/Cairo">EET — Egypt (UTC+2:00)</option>
                                <option value="Africa/Lagos">WAT — West Africa (UTC+1:00)</option>
                                <option value="Africa/Nairobi">EAT — East Africa (UTC+3:00)</option>
                            </optgroup>
                            <optgroup label="Pacific">
                                <option value="Pacific/Auckland">NZST — New Zealand (UTC+12:00)</option>
                                <option value="Australia/Sydney">AEST — Sydney (UTC+10:00)</option>
                                <option value="Australia/Melbourne">AEST — Melbourne (UTC+10:00)</option>
                                <option value="Pacific/Honolulu">HST — Hawaii (UTC-10:00)</option>
                            </optgroup>
                            <optgroup label="UTC">
                                <option value="UTC">UTC — Coordinated Universal Time</option>
                            </optgroup>
                        </select>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', display: 'block' }}>
                            Used for display purposes. Stored dates are in YYYY-MM-DD format.
                        </span>
                    </div>
                </div>
            </div>

            {/* Section 1.5: Gemini AI Integration */}
            <div className="section-card" style={{ borderLeft: '4px solid var(--primary)' }}>
                <div className="section-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span>⚡ Gemini AI Bank Statement Extractor (Free Tier)</span>
                    <span style={{ fontSize: '0.75rem', background: '#D1FAE5', color: '#065F46', padding: '2px 8px', borderRadius: '10px', fontWeight: 700 }}>Higher Precision</span>
                </div>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
                    Passes bank statement PDFs directly to Google's Gemini Vision AI to extract transactions with much higher precision across any bank format globally.
                    The key is kept in this browser only. It is not included in backups, the linked file, or cloud sync.
                </p>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center', maxWidth: '640px' }}>
                    <input
                        type="password"
                        className="form-control"
                        placeholder="Paste your free Gemini API key (AIzaSy…)"
                        value={geminiKeyInput}
                        onChange={(e) => {
                            const val = e.target.value.trim();
                            setGeminiKeyInput(val);
                            try {
                                if (val) localStorage.setItem("gemini_api_key", val);
                                else localStorage.removeItem("gemini_api_key");
                            } catch (storageErr) { }
                        }}
                        style={{ flex: 1 }}
                    />
                    <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary"
                        style={{ fontSize: '0.82rem', whiteSpace: 'nowrap' }}
                    >
                        🔑 Get Free Key →
                    </a>
                </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' }}>

                {/* Manage Categories */}
                <div className="section-card">
                    <div className="section-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                        <span style={{ fontWeight: 700 }}>🏷️ Categories & Subcategories</span>
                        <span className="badge badge-info" style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: '12px' }}>
                            {categories.length} Total
                        </span>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: '1.45' }}>
                        View, search, and manage default and custom categories, subcategories, and type classifications (Inflow, Outflow, Neutral). Pre-determined categories are protected and cannot be deleted, while custom categories can be freely created and managed.
                    </p>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <span className="badge badge-success" style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '10px' }}>
                            ⭐ {customCategoryCount} Custom
                        </span>
                        <span className="badge badge-secondary" style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '10px' }}>
                            🔒 {defaultCategoryCount} Default
                        </span>
                    </div>
                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => setShowCategoryModal(true)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontWeight: 700, padding: '12px 20px', fontSize: '0.92rem', borderRadius: '10px', boxShadow: '0 2px 8px rgba(79, 70, 229, 0.2)' }}
                    >
                        ⚙️ View & Manage Categories
                    </button>
                </div>

                {/* Category Management Popup Modal */}
                {showCategoryModal && (
                    <div className="category-picker-overlay" onClick={() => setShowCategoryModal(false)}>
                        <div
                            className="category-picker-container"
                            style={{ maxWidth: '1240px', width: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', padding: 0 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Modal Header */}
                            <div className="category-picker-header" style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <h3 className="modal-title" style={{ margin: 0 }}>Categories & Subcategories Setup</h3>
                                    <span className="badge badge-info" style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '12px' }}>
                                        {categories.length} Total
                                    </span>
                                    <span
                                        className="badge badge-success"
                                        style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '12px', cursor: 'pointer' }}
                                        onClick={() => setCategoryTab("custom")}
                                        title="Click to view user created categories"
                                    >
                                        ⭐ {customCategoryCount} User Created
                                    </span>
                                    <span
                                        className="badge badge-secondary"
                                        style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '12px', cursor: 'pointer' }}
                                        onClick={() => setCategoryTab("default")}
                                        title="Click to view default pre-determined categories"
                                    >
                                        🔒 {defaultCategoryCount} Default
                                    </span>
                                </div>
                                <button type="button" className="modal-close-btn" onClick={() => setShowCategoryModal(false)}>
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                    </svg>
                                </button>
                            </div>

                            {/* Modal Scrollable Content Area */}
                            <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>

                                {/* Form: Add New Category / Subcategory - Ultra-Compact Layout */}
                                <div style={{
                                    backgroundColor: 'var(--bg-main, #F8FAFC)',
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border-color)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px'
                                }}>
                                    {/* Row 1: Mode Switcher (Heading/Selection) + Category Type Selection */}
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                                        {/* Mode Switcher */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    if (selectedParentCategory === "NEW") {
                                                        setSelectedParentCategory(parentCategories[0] || "");
                                                    }
                                                }}
                                                style={{
                                                    border: selectedParentCategory !== "NEW" ? '1px solid #6366F1' : '1px solid #CBD5E1',
                                                    background: selectedParentCategory !== "NEW" ? '#EEF2FF' : '#FFFFFF',
                                                    color: selectedParentCategory !== "NEW" ? '#4338CA' : '#64748B',
                                                    fontWeight: selectedParentCategory !== "NEW" ? 700 : 500,
                                                    fontSize: '0.78rem',
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer'
                                                }}
                                                title="Add a subcategory to an existing main category"
                                            >
                                                📁 Existing Main Category
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedParentCategory("NEW")}
                                                style={{
                                                    border: selectedParentCategory === "NEW" ? '1px solid #6366F1' : '1px solid #CBD5E1',
                                                    background: selectedParentCategory === "NEW" ? '#EEF2FF' : '#FFFFFF',
                                                    color: selectedParentCategory === "NEW" ? '#4338CA' : '#64748B',
                                                    fontWeight: selectedParentCategory === "NEW" ? 700 : 500,
                                                    fontSize: '0.78rem',
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer'
                                                }}
                                                title="Create a new main category"
                                            >
                                                🌟 New Main Category
                                            </button>
                                        </div>

                                        {/* Type Selector (styled identically to mode switcher buttons) */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginRight: '2px' }}>Transaction Type:</span>
                                            <button
                                                type="button"
                                                onClick={() => setNewCategoryType("expense")}
                                                style={{
                                                    border: newCategoryType === "expense" ? '1px solid #6366F1' : '1px solid #CBD5E1',
                                                    background: newCategoryType === "expense" ? '#EEF2FF' : '#FFFFFF',
                                                    color: newCategoryType === "expense" ? '#4338CA' : '#64748B',
                                                    fontWeight: newCategoryType === "expense" ? 700 : 500,
                                                    fontSize: '0.78rem',
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                💸 Outflow
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNewCategoryType("income")}
                                                style={{
                                                    border: newCategoryType === "income" ? '1px solid #6366F1' : '1px solid #CBD5E1',
                                                    background: newCategoryType === "income" ? '#EEF2FF' : '#FFFFFF',
                                                    color: newCategoryType === "income" ? '#4338CA' : '#64748B',
                                                    fontWeight: newCategoryType === "income" ? 700 : 500,
                                                    fontSize: '0.78rem',
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                💰 Inflow
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setNewCategoryType("neutral")}
                                                style={{
                                                    border: newCategoryType === "neutral" ? '1px solid #6366F1' : '1px solid #CBD5E1',
                                                    background: newCategoryType === "neutral" ? '#EEF2FF' : '#FFFFFF',
                                                    color: newCategoryType === "neutral" ? '#4338CA' : '#64748B',
                                                    fontWeight: newCategoryType === "neutral" ? 700 : 500,
                                                    fontSize: '0.78rem',
                                                    padding: '4px 10px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                🔄 Neutral
                                            </button>
                                        </div>
                                    </div>

                                    {/* Row 2: Inputs + Add Button */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 1fr) minmax(160px, 1fr) 90px auto', gap: '8px', alignItems: 'center' }}>
                                        {selectedParentCategory !== "NEW" ? (
                                            <select
                                                className="form-control"
                                                style={{ width: '100%', padding: '5px 8px', fontSize: '0.82rem' }}
                                                value={selectedParentCategory}
                                                onChange={(e) => setSelectedParentCategory(e.target.value)}
                                            >
                                                {displayParentCategories.map(p => (
                                                    <option key={p} value={p}>{p}</option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                className="form-control"
                                                placeholder="New Main Category Name..."
                                                value={customParentCategory}
                                                onChange={(e) => setCustomParentCategory(e.target.value)}
                                                style={{ width: '100%', padding: '5px 8px', fontSize: '0.82rem' }}
                                                autoFocus
                                            />
                                        )}

                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="Subcategory Name (e.g. Netflix)"
                                            value={newSubcategoryName}
                                            onChange={(e) => setNewSubcategoryName(e.target.value)}
                                            style={{ width: '100%', padding: '5px 8px', fontSize: '0.82rem' }}
                                        />

                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="Emoji (🍿)"
                                            value={newSubcategoryEmoji}
                                            onChange={(e) => setNewSubcategoryEmoji(e.target.value)}
                                            style={{ width: '100%', padding: '5px 8px', fontSize: '0.82rem' }}
                                        />

                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={handleAddCategory}
                                            style={{ padding: '6px 16px', fontSize: '0.82rem', fontWeight: 600, whiteSpace: 'nowrap' }}
                                        >
                                            Add Category
                                        </button>
                                    </div>
                                </div>

                                {/* Search & Tabs */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <input
                                        type="text"
                                        className="category-picker-search-input"
                                        placeholder="Search categories or subcategories..."
                                        value={categorySearch}
                                        onChange={(e) => setCategorySearch(e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box' }}
                                    />

                                    <div className="category-picker-tab-bar" style={{ overflowX: 'auto' }}>
                                        <div
                                            className={`category-picker-tab ${categoryTab === "all" ? "active" : ""}`}
                                            onClick={() => setCategoryTab("all")}
                                        >
                                            All Groups ({categories.length})
                                        </div>
                                        <div
                                            className={`category-picker-tab ${categoryTab === "custom" ? "active" : ""}`}
                                            onClick={() => setCategoryTab("custom")}
                                            style={{ fontWeight: 600, color: categoryTab === "custom" ? '#FFFFFF' : '#4338CA', backgroundColor: categoryTab === "custom" ? 'var(--primary)' : '#EEF2FF' }}
                                        >
                                            ⭐ User Created ({customCategoryCount})
                                        </div>
                                        <div
                                            className={`category-picker-tab ${categoryTab === "default" ? "active" : ""}`}
                                            onClick={() => setCategoryTab("default")}
                                        >
                                            🔒 Default ({defaultCategoryCount})
                                        </div>
                                        <div
                                            className={`category-picker-tab ${categoryTab === "expense" ? "active" : ""}`}
                                            onClick={() => setCategoryTab("expense")}
                                        >
                                            💸 Outflow
                                        </div>
                                        <div
                                            className={`category-picker-tab ${categoryTab === "income" ? "active" : ""}`}
                                            onClick={() => setCategoryTab("income")}
                                        >
                                            💰 Inflow
                                        </div>
                                        <div
                                            className={`category-picker-tab ${categoryTab === "neutral" ? "active" : ""}`}
                                            onClick={() => setCategoryTab("neutral")}
                                        >
                                            🔄 Neutral
                                        </div>
                                        {Object.keys(groupedCategories).map(name => (
                                            <div
                                                key={name}
                                                className={`category-picker-tab ${categoryTab === name ? "active" : ""}`}
                                                onClick={() => setCategoryTab(name)}
                                            >
                                                {name} ({groupedCategories[name].items.length})
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {/* Category List Grid Body */}
                                <div style={{ flex: 1, minHeight: '380px', maxHeight: '560px', overflowY: 'auto', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '16px', backgroundColor: '#FFFFFF' }}>
                                    {filteredCategoryGroups.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                                            {categoryTab === "custom"
                                                ? "No custom categories created yet. Use the form above to add your first custom subcategory!"
                                                : `No categories found matching "${categorySearch}".`}
                                        </div>
                                    ) : (
                                        filteredCategoryGroups.map(g => (
                                            <div key={g.name} className="category-group" style={{ marginBottom: '20px' }}>
                                                <div className="category-group-header" style={{ cursor: 'default', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '6px', marginBottom: '10px' }}>
                                                    <div className="category-group-info" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span className="category-group-title" style={{ fontSize: '0.95rem' }}>{g.name}</span>
                                                        <span className={`badge ${g.type === 'income' ? 'badge-success' : g.type === 'neutral' ? 'badge-info' : 'badge-secondary'}`} style={{ fontSize: '0.68rem', padding: '2px 8px', textTransform: 'capitalize' }}>
                                                            {g.type === 'income' ? '💰 Inflow' : g.type === 'neutral' ? '🔄 Neutral' : '💸 Outflow'}
                                                        </span>
                                                        {g.description && <span className="category-group-desc">• {g.description}</span>}
                                                    </div>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                        {g.items.length} items
                                                    </span>
                                                </div>

                                                <div className="subcategory-grid" style={{ paddingLeft: '0' }}>
                                                    {g.items.map(item => (
                                                        <div
                                                            key={item.full}
                                                            className="subcategory-button"
                                                            style={{
                                                                cursor: 'default',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                padding: '5px 12px',
                                                                height: 'auto',
                                                                borderRadius: '20px',
                                                                backgroundColor: item.isDefault ? '#F8FAFC' : '#EEF2FF',
                                                                borderColor: item.isDefault ? 'var(--border-color)' : '#C7D2FE'
                                                            }}
                                                        >
                                                            <div className="subcategory-emoji-container">
                                                                {item.emoji}
                                                            </div>
                                                            <span className="subcategory-label" style={{ fontWeight: 500 }}>{item.label}</span>
                                                            {!item.isDefault && (
                                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', marginLeft: '4px' }}>
                                                                    <span
                                                                        style={{
                                                                            fontSize: '0.68rem',
                                                                            color: '#4338CA',
                                                                            background: '#E0E7FF',
                                                                            padding: '2px 6px',
                                                                            borderRadius: '10px'
                                                                        }}
                                                                    >
                                                                        Custom
                                                                    </span>
                                                                    <button
                                                                        type="button"
                                                                        title={`Delete category "${item.full}"`}
                                                                        style={{
                                                                            border: 'none',
                                                                            background: 'none',
                                                                            color: 'var(--danger)',
                                                                            cursor: 'pointer',
                                                                            padding: '2px',
                                                                            display: 'inline-flex',
                                                                            alignItems: 'center'
                                                                        }}
                                                                        onClick={() => setConfirmDeleteCategory(item.full)}
                                                                    >
                                                                        <Icon name="trash" />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {privacy && <PrivacySettings privacy={privacy} showToast={showToast} />}

                {currentUser && <RecoveryKitCard settings={settings} updateSetting={updateSetting} currentUser={currentUser} showToast={showToast} />}

                {/* Manage Accounts */}
                <AccountsSetup settings={settings} transactions={transactions} updateSetting={updateSetting} showToast={showToast} />

                {/* Manage Tags */}
                <div className="section-card">
                    <div className="section-card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Tags Setup</span>
                        <span className="badge badge-info" style={{ fontSize: '0.72rem', padding: '2px 8px' }}>{tags.length} Total</span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                        <input
                            type="text"
                            className="form-control"
                            placeholder="New Tag Name..."
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            style={{ flex: 1 }}
                        />
                        <input
                            type="color"
                            value={newTagColor}
                            onChange={(e) => setNewTagColor(e.target.value)}
                            style={{ width: '38px', height: '36px', padding: '2px', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}
                            title="Choose Tag Color"
                        />
                        <button
                            className="btn btn-primary"
                            onClick={async () => {
                                const name = newTagName.trim();
                                if (!name) return;
                                if (tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
                                    showToast(`Tag "${name}" already exists`, "error");
                                    return;
                                }
                                if (onAddTag) {
                                    await onAddTag({ name, color: newTagColor });
                                    setNewTagName("");
                                    showToast(`Tag "${name}" added`);
                                }
                            }}
                        >
                            Add
                        </button>
                    </div>

                    <div style={{ maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {tags.length === 0 ? (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px 0', fontSize: '0.85rem' }}>
                                No tags created yet. Add one above!
                            </div>
                        ) : (
                            tags.map(t => {
                                const isEditing = editingTag && editingTag.oldName === t.name;
                                const count = tagUsageCounts[t.name] || 0;

                                if (isEditing) {
                                    return (
                                        <div key={t.name} style={{ display: 'flex', gap: '6px', alignItems: 'center', backgroundColor: '#EEF2FF', padding: '6px 8px', borderRadius: '6px' }}>
                                            <input
                                                type="text"
                                                className="form-control"
                                                value={editingTag.name}
                                                onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                                                style={{ flex: 1, height: '28px', fontSize: '0.82rem' }}
                                                autoFocus
                                            />
                                            <input
                                                type="color"
                                                value={editingTag.color}
                                                onChange={(e) => setEditingTag({ ...editingTag, color: e.target.value })}
                                                style={{ width: '30px', height: '28px', padding: '1px', border: 'none', cursor: 'pointer' }}
                                            />
                                            <button
                                                className="btn btn-primary btn-sm"
                                                style={{ height: '28px', padding: '0 8px', fontSize: '0.75rem' }}
                                                onClick={async () => {
                                                    const oldN = (editingTag.oldName || "").trim();
                                                    const newN = (editingTag.name || "").trim();

                                                    if (!newN) {
                                                        showToast("Tag name cannot be empty", "error");
                                                        return;
                                                    }

                                                    // Duplicate tag name validation check
                                                    const duplicate = tags.find(t => t.name.toLowerCase() === newN.toLowerCase() && t.name.toLowerCase() !== oldN.toLowerCase());
                                                    if (duplicate) {
                                                        showToast(`A tag with name "${newN}" already exists`, "error");
                                                        return;
                                                    }

                                                    if (onUpdateTag) {
                                                        const res = await onUpdateTag(editingTag.oldName, editingTag.name, editingTag.color);
                                                        if (res !== false) {
                                                            setEditingTag(null);
                                                        }
                                                    }
                                                }}
                                            >
                                                Save
                                            </button>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                style={{ height: '28px', padding: '0 8px', fontSize: '0.75rem' }}
                                                onClick={() => setEditingTag(null)}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={t.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', backgroundColor: '#F9FAFB', borderRadius: '6px', fontSize: '0.85rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span className="tag-pill" style={{ backgroundColor: t.color || 'var(--primary-light)', color: getContrastTextColor(t.color || '#4F46E5'), border: getContrastTextColor(t.color || '#4F46E5') === '#1E293B' ? '1px solid #CBD5E1' : 'none', margin: 0, fontWeight: 600, padding: '3px 10px', borderRadius: '12px' }}>
                                                {t.name}
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                ({count} tx{count === 1 ? '' : 's'})
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                style={{ border: 'none', padding: '2px 6px', fontSize: '0.78rem' }}
                                                onClick={() => setEditingTag({ oldName: t.name, name: t.name, color: t.color || '#4F46E5' })}
                                                title="Edit Tag"
                                            >
                                                ✏️
                                            </button>
                                            <button
                                                className="btn btn-secondary btn-sm"
                                                style={{ border: 'none', color: 'var(--danger)', padding: '2px 6px', fontSize: '0.78rem' }}
                                                onClick={() => setConfirmDeleteTag(t.name)}
                                                title="Delete Tag"
                                            >
                                                <Icon name="trash" />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {/* Section 3: Detection restores */}
            <div className="section-card">
                <div className="section-card-title">Detection Adjustments</div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '14px' }}>
                    You have currently ignored <strong>{dismissedCount}</strong> suggested recurring merchant schedules.
                </p>
                <button className="btn btn-secondary" onClick={handleRestoreSuggestions} disabled={dismissedCount === 0}>
                    Restore Ignored Suggestions
                </button>
            </div>

            {/* Section 3.5: Data Storage Management */}
            <div className="section-card" style={{ borderLeft: '4px solid var(--primary)', overflow: 'hidden' }}>
                <div className="section-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, var(--primary) 0%, #4F46B5 100%)',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '1.1rem',
                            boxShadow: '0 4px 10px rgba(101, 88, 211, 0.25)'
                        }}>
                            💾
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                Data Storage Management
                            </h3>
                            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                Manage offline databases, local project file auto-sync, and system backups
                            </span>
                        </div>
                    </div>
                    <span className="status-pill status-pill-success" style={{ fontSize: '0.78rem', padding: '5px 12px' }}>
                        <span className="pulse-dot pulse-dot-success"></span>
                        🔒 100% Private & Offline
                    </span>
                </div>

                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '12px 0 16px 0', lineHeight: '1.55' }}>
                    Select your active storage engine below. You can store data inside the browser's high-speed <code style={{ background: 'var(--bg-color)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--primary)', fontWeight: 600 }}>IndexedDB</code> database or link a <code style={{ background: 'var(--bg-color)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)', color: 'var(--primary)', fontWeight: 600 }}>.json</code> file in your local project folder to auto-sync transactions directly to disk.
                </p>

                {/* Storage Options Selection Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '18px', marginBottom: '24px' }}>

                    {/* Option 0: Cloud Account & End-to-End Encrypted Sync */}
                    <div className={`storage-option-card ${currentUser ? 'active' : ''}`} style={{ borderColor: currentUser ? 'var(--primary)' : 'var(--border-color)' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div className="storage-icon-box" style={{ background: '#ECFDF5', border: '1px solid #A7F3D0', color: '#059669' }}>☁️</div>
                                    <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700 }}>
                                        Cloud Sync (End-to-End Encrypted)
                                    </h4>
                                </div>
                                {currentUser ? (
                                    <span className="status-pill status-pill-success">
                                        <span className="pulse-dot pulse-dot-success"></span>
                                        {cloudSyncStatus === "syncing" ? "Syncing..." : cloudSyncStatus === "synced" ? "Synced ✓" : cloudSyncStatus === "locked" ? "Paused: sign in again" : cloudSyncStatus === "error" ? "Sync failed" : "Connected"}
                                    </span>
                                ) : (
                                    <span className="status-pill" style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                                        Optional
                                    </span>
                                )}
                            </div>

                            <p style={{ margin: '0 0 14px 0', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                                Automatic multi-device sync encrypted via <strong>AES-256</strong> before leaving your browser. Protected with your password — zero readability in the cloud database.
                            </p>

                            {/* Cloud Status Box */}
                            <div style={{
                                background: currentUser ? '#ECFDF5' : 'var(--bg-color)',
                                border: `1px solid ${currentUser ? '#A7F3D0' : 'var(--border-color)'}`,
                                borderRadius: '10px',
                                padding: '10px 12px',
                                marginBottom: '12px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {currentUser ? "Active Cloud Account:" : "Account Status:"}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', fontWeight: 600, color: currentUser ? '#047857' : 'var(--text-muted)' }}>
                                        {currentUser ? "🔒 E2E Encrypted" : "Offline / Unlinked"}
                                    </span>
                                </div>
                                <div style={{ fontSize: '0.74rem', color: currentUser ? '#047857' : 'var(--text-muted)', lineHeight: '1.4', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {currentUser
                                        ? `Signed in as ${currentUser.email}. All updates auto-sync in the background.`
                                        : "Sign in or create an account to access your finances from any computer or mobile browser."}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            {currentUser ? (
                                <button
                                    type="button"
                                    className="btn btn-secondary"
                                    onClick={onSignOutCloud}
                                    style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, padding: '8px 12px', borderRadius: '8px' }}
                                >
                                    🚪 Sign Out ({currentUser.email.split('@')[0]})
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={onOpenCloudAuth}
                                    style={{
                                        flex: 1,
                                        fontSize: '0.82rem',
                                        fontWeight: 600,
                                        padding: '8px 14px',
                                        borderRadius: '8px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <span>☁️</span>
                                    <span>Sign In / Create Account</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Option 1: Web Browser Database (IndexedDB) */}
                    <div className={`storage-option-card ${settings.storageMode !== 'project_file' ? 'active' : ''}`}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div className="storage-icon-box">🌐</div>
                                    <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700 }}>
                                        Web Browser Database
                                    </h4>
                                </div>
                                {settings.storageMode !== 'project_file' ? (
                                    <span className="status-pill status-pill-primary">
                                        ✓ Active Storage
                                    </span>
                                ) : (
                                    <span className="status-pill" style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                                        IndexedDB Engine
                                    </span>
                                )}
                            </div>

                            <p style={{ margin: '0 0 14px 0', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                                Fast client-side storage saved inside browser <strong>IndexedDB</strong>. Operates completely offline with instant reads and writes.
                            </p>

                            {/* Persistence Lock Status Box */}
                            <div style={{
                                background: isPersisted ? '#ECFDF5' : '#FFFBEB',
                                border: `1px solid ${isPersisted ? '#A7F3D0' : '#FDE68A'}`,
                                borderRadius: '10px',
                                padding: '10px 12px',
                                marginBottom: '12px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        Persistence Lock Status:
                                    </span>
                                    {isPersisted ? (
                                        <span className="status-pill status-pill-success">
                                            <span className="pulse-dot pulse-dot-success"></span>
                                            🔒 Storage Locked
                                        </span>
                                    ) : (
                                        <span className="status-pill status-pill-warning">
                                            <span className="pulse-dot pulse-dot-warning"></span>
                                            ⚠️ Standard Storage
                                        </span>
                                    )}
                                </div>
                                <div style={{ fontSize: '0.74rem', color: isPersisted ? '#047857' : '#B45309', lineHeight: '1.4' }}>
                                    {isPersisted
                                        ? "Protected from automatic browser eviction during low disk space."
                                        : "Standard storage active. Click 'Lock Storage' or bookmark the app to request permanent cache protection."}
                                </div>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button
                                type="button"
                                className={`btn ${settings.storageMode !== 'project_file' ? 'btn-secondary' : 'btn-primary'}`}
                                onClick={() => handleSwitchStorageMode("browser")}
                                disabled={settings.storageMode !== 'project_file'}
                                style={{ flex: 1, fontSize: '0.82rem', fontWeight: 600, padding: '8px 12px', borderRadius: '8px' }}
                            >
                                {settings.storageMode !== 'project_file' ? "✓ Active Mode" : "Activate Web Browser Mode"}
                            </button>
                            {!isPersisted && (
                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    onClick={handleRequestPersistence}
                                    style={{
                                        fontSize: '0.82rem',
                                        fontWeight: 600,
                                        padding: '8px 14px',
                                        borderRadius: '8px',
                                        background: 'linear-gradient(135deg, var(--primary) 0%, #4F46B5 100%)',
                                        boxShadow: '0 2px 6px rgba(101, 88, 211, 0.25)',
                                        whiteSpace: 'nowrap'
                                    }}
                                >
                                    🔒 Lock Storage
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Option 2: Local Project Folder File Sync */}
                    <div className={`storage-option-card ${settings.storageMode === 'project_file' ? 'active' : ''}`}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <div className="storage-icon-box">📁</div>
                                    <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700 }}>
                                        Project Folder File (.json)
                                    </h4>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span className="status-pill" style={{ background: '#F1F5F9', color: '#475569', border: '1px solid #E2E8F0' }}>
                                        🛡️ gitignored
                                    </span>
                                    {settings.storageMode === 'project_file' && (
                                        <span className="status-pill status-pill-primary">
                                            ✓ Active Storage
                                        </span>
                                    )}
                                </div>
                            </div>

                            <p style={{ margin: '0 0 14px 0', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                                Auto-syncs transactions directly to a <code>.json</code> file in your local directory using the File System API.
                            </p>

                            {/* Linked File Box */}
                            <div style={{
                                background: settings.linkedFileName ? 'var(--primary-light)' : 'var(--bg-color)',
                                border: `1px ${settings.linkedFileName ? 'solid rgba(101, 88, 211, 0.25)' : 'dashed var(--border-color)'}`,
                                borderRadius: '10px',
                                padding: '12px',
                                marginBottom: '12px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <span style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                        File Sync Status:
                                    </span>
                                    {settings.linkedFileName ? (
                                        linkedFile && filePermissionGranted ? (
                                            <span className="status-pill status-pill-success">
                                                <span className="pulse-dot pulse-dot-success"></span>
                                                🟢 Auto-Synced to Disk
                                            </span>
                                        ) : (
                                            <span className="status-pill" style={{ background: '#FFFBEB', color: '#B45309', border: '1px solid #FDE68A' }}>
                                                <span className="pulse-dot pulse-dot-warning"></span>
                                                ⚠️ Re-authorization Needed
                                            </span>
                                        )
                                    ) : (
                                        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                            Unlinked
                                        </span>
                                    )}
                                </div>
                                {settings.linkedFileName ? (
                                    <div style={{ marginTop: '6px' }}>
                                        <div style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 600, wordBreak: 'break-all', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            📄 <code>{settings.linkedFileName}</code>
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: (linkedFile && filePermissionGranted) ? 'var(--text-muted)' : '#B45309', marginTop: '2px' }}>
                                            {linkedFile && filePermissionGranted
                                                ? "All edits auto-save directly to disk in real-time."
                                                : "Browser file permission paused after reload. Click 'Re-connect File' below to enable auto-sync."}
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ marginTop: '6px', fontSize: '0.76rem', color: 'var(--text-muted)', lineHeight: '1.45' }}>
                                        💡 <strong>First time setting this up?</strong> Click <strong>"➕ Create First-Time File"</strong> to initialize a new <code>financials-data.json</code> in your project folder, or click <strong>"📂 Link Existing File"</strong> if you already have one.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {settings.storageMode === 'project_file' ? (
                                settings.linkedFileName ? (
                                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                        {linkedFile && filePermissionGranted ? (
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                onClick={handleManualFileSync}
                                                disabled={isFileSyncing}
                                                style={{
                                                    flex: 1,
                                                    fontSize: '0.82rem',
                                                    fontWeight: 600,
                                                    borderRadius: '8px',
                                                    background: 'linear-gradient(135deg, var(--primary) 0%, #4F46B5 100%)',
                                                    boxShadow: '0 2px 6px rgba(101, 88, 211, 0.25)'
                                                }}
                                            >
                                                {isFileSyncing ? "Syncing to Disk..." : "⚡ Sync to Disk Now"}
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                className="btn btn-primary"
                                                onClick={handleLinkProjectFile}
                                                style={{
                                                    flex: 1,
                                                    fontSize: '0.82rem',
                                                    fontWeight: 600,
                                                    borderRadius: '8px',
                                                    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                                                    border: 'none',
                                                    color: '#fff',
                                                    boxShadow: '0 2px 6px rgba(245, 158, 11, 0.25)'
                                                }}
                                            >
                                                📂 Select Existing File (.json)
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={handleLinkProjectFile}
                                            style={{ fontSize: '0.82rem', borderRadius: '8px' }}
                                            title="Choose an existing financials-data.json file"
                                        >
                                            📂 Choose File
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={handleUnlinkProjectFile}
                                            style={{ fontSize: '0.82rem', borderRadius: '8px' }}
                                        >
                                            Unlink
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={handleCreateNewProjectFile}
                                            style={{
                                                fontSize: '0.82rem',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                padding: '9px 12px',
                                                borderRadius: '8px',
                                                background: 'linear-gradient(135deg, var(--primary) 0%, #4F46B5 100%)',
                                                boxShadow: '0 2px 6px rgba(101, 88, 211, 0.25)',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            ➕ Create First-Time File
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={handleLinkProjectFile}
                                            style={{
                                                fontSize: '0.82rem',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                padding: '9px 12px',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--card-bg, #fff)',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            📂 Link Existing File
                                        </button>
                                    </div>
                                )
                            ) : (
                                settings.linkedFileName ? (
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={() => handleSwitchStorageMode("project_file")}
                                            style={{
                                                flex: 1,
                                                fontSize: '0.84rem',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '8px',
                                                padding: '9px 16px',
                                                borderRadius: '8px',
                                                background: 'linear-gradient(135deg, var(--primary) 0%, #4F46B5 100%)',
                                                boxShadow: '0 2px 6px rgba(101, 88, 211, 0.25)'
                                            }}
                                        >
                                            Use Project File Mode
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={handleUnlinkProjectFile}
                                            style={{ fontSize: '0.82rem', borderRadius: '8px' }}
                                        >
                                            Unlink
                                        </button>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <button
                                            type="button"
                                            className="btn btn-primary"
                                            onClick={handleCreateNewProjectFile}
                                            style={{
                                                fontSize: '0.82rem',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                padding: '9px 12px',
                                                borderRadius: '8px',
                                                background: 'linear-gradient(135deg, var(--primary) 0%, #4F46B5 100%)',
                                                boxShadow: '0 2px 6px rgba(101, 88, 211, 0.25)',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            ➕ Create First-Time File
                                        </button>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={handleLinkProjectFile}
                                            style={{
                                                fontSize: '0.82rem',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px',
                                                padding: '9px 12px',
                                                borderRadius: '8px',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--card-bg, #fff)',
                                                whiteSpace: 'nowrap'
                                            }}
                                        >
                                            📂 Link Existing File
                                        </button>
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                </div>

                {/* Manual Export & Import JSON Actions */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: '16px',
                    borderTop: '1px solid var(--border-color)',
                    paddingTop: '20px'
                }}>
                    {/* Export Card */}
                    <div className="storage-action-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: '#EEF2FF',
                                border: '1px solid #C7D2FE',
                                color: 'var(--primary)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.1rem'
                            }}>
                                📤
                            </div>
                            <div>
                                <h5 style={{ margin: '0 0 2px 0', fontSize: '0.88rem', fontWeight: 700 }}>Export Backup</h5>
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                    Instant .json export ({transactions.length} txs)
                                </span>
                            </div>
                        </div>
                        <button
                            className="btn btn-secondary"
                            onClick={handleExportBackup}
                            disabled={isExporting}
                            style={{ fontSize: '0.82rem', fontWeight: 600, padding: '7px 14px', borderRadius: '8px' }}
                        >
                            {isExporting ? "Exporting..." : "📥 Download"}
                        </button>
                    </div>

                    {/* Import Card */}
                    <div className="storage-action-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '10px',
                                background: '#ECFDF5',
                                border: '1px solid #A7F3D0',
                                color: '#059669',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.1rem'
                            }}>
                                📥
                            </div>
                            <div>
                                <h5 style={{ margin: '0 0 2px 0', fontSize: '0.88rem', fontWeight: 700 }}>Restore JSON</h5>
                                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                    Restore from uploaded .json
                                </span>
                            </div>
                        </div>
                        <label className="btn btn-secondary" style={{ fontSize: '0.82rem', fontWeight: 600, padding: '7px 14px', borderRadius: '8px', margin: 0, cursor: 'pointer' }}>
                            📂 Restore
                            <input type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileSelectForImport} key={importInputKey} />
                        </label>
                    </div>
                </div>
            </div>

            {/* Install as an app, protect local data, show the running version */}
            <AppInstallCard />

            {/* Section 4: Danger Zone Wipe */}
            <div className="section-card danger-zone-card">
                <div className="section-card-title danger-zone-title">Danger Zone</div>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '14px' }}>
                    Erase all stored transactions, rules, document uploads, and budget parameters from the local database. Original local files remain unchanged.
                </p>
                <button className="btn btn-danger" onClick={() => setShowWipeModal(true)}>
                    Wipe All System Data
                </button>
            </div>

            {/* Category Delete Confirmation Modal */}
            {confirmDeleteCategory && (
                <div className="modal-overlay confirm-modal-overlay" style={{ zIndex: 3000 }} onClick={() => setConfirmDeleteCategory(null)}>
                    <div className="modal-container" style={{ maxWidth: '440px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ color: 'var(--danger)' }}>Confirm Category Deletion</h3>
                            <button className="modal-close-btn" onClick={() => setConfirmDeleteCategory(null)}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '8px' }}>
                                Are you sure you want to delete category <strong>"{confirmDeleteCategory}"</strong>?
                            </p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.4 }}>
                                This category will be permanently deleted and removed from <strong>{categoryUsageCounts[confirmDeleteCategory] || 0} transaction(s)</strong>.
                            </p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setConfirmDeleteCategory(null)}>Cancel</button>
                            <button
                                className="btn btn-danger"
                                onClick={async () => {
                                    await handleRemoveCategory(confirmDeleteCategory);
                                    setConfirmDeleteCategory(null);
                                }}
                            >
                                Delete Category
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Tag Delete Confirmation Modal */}
            {confirmDeleteTag && (
                <div className="modal-overlay confirm-modal-overlay" style={{ zIndex: 3000 }} onClick={() => setConfirmDeleteTag(null)}>
                    <div className="modal-container" style={{ maxWidth: '420px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ color: 'var(--danger)' }}>Confirm Tag Deletion</h3>
                            <button className="modal-close-btn" onClick={() => setConfirmDeleteTag(null)}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '8px' }}>
                                Are you sure you want to delete tag <strong>"{confirmDeleteTag}"</strong>?
                            </p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.4 }}>
                                This tag will be permanently removed from <strong>{tagUsageCounts[confirmDeleteTag] || 0} transaction(s)</strong>.
                                If you recreate this tag later, previously untagged transactions will <em>not</em> automatically pick it up.
                            </p>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setConfirmDeleteTag(null)}>Cancel</button>
                            <button
                                className="btn btn-danger"
                                onClick={async () => {
                                    if (onDeleteTag) {
                                        await onDeleteTag(confirmDeleteTag);
                                    }
                                    setConfirmDeleteTag(null);
                                }}
                            >
                                Delete Tag
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Wipe confirmation modal */}
            {showWipeModal && (
                <div className="modal-overlay confirm-modal-overlay">
                    <div className="modal-container">
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ color: 'var(--danger)' }}>Erase Database Vault?</h3>
                            <button className="modal-close-btn" onClick={() => setShowWipeModal(false)}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '16px' }}>
                                This action is destructive and will completely delete your local transactions registry from IndexedDB database.
                            </p>
                            <div className="form-field">
                                <label>Type <strong>DELETE</strong> to confirm:</label>
                                <input
                                    type="text"
                                    className="form-control"
                                    placeholder="DELETE"
                                    value={wipeConfirmation}
                                    onChange={(e) => setWipeConfirmation(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setShowWipeModal(false)}>Cancel</button>
                            <button className="btn btn-danger" onClick={handleConfirmWipe} disabled={wipeConfirmation !== "DELETE"}>
                                Confirm Erase
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Restore Confirmation Modal */}
            {pendingRestoreBackup && (
                <div className="modal-overlay confirm-modal-overlay">
                    <div className="modal-container" style={{ maxWidth: '520px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ color: 'var(--primary)' }}>Restore Financial Backup?</h3>
                            <button className="modal-close-btn" onClick={() => setPendingRestoreBackup(null)}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', marginBottom: '14px', lineHeight: 1.4 }}>
                                You are about to restore financial data from a local JSON backup file.
                            </p>
                            <div style={{ padding: '12px 14px', backgroundColor: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.82rem', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '6px', marginBottom: '6px', borderBottom: '1px dashed var(--border-color)' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Backup Date:</span>
                                    <strong>{pendingRestoreBackup.exportedAt ? formatDate(pendingRestoreBackup.exportedAt, settings.dateFormat) : 'Unknown'}</strong>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                    <div>📊 Transactions: <strong>{(pendingRestoreBackup.transactions || []).length}</strong></div>
                                    <div>⚙️ Rules: <strong>{(pendingRestoreBackup.rules || []).length}</strong></div>
                                    <div>🏷️ Tags: <strong>{(pendingRestoreBackup.tags || []).length}</strong></div>
                                    <div>📄 Documents: <strong>{(pendingRestoreBackup.documents || []).length}</strong></div>
                                </div>
                            </div>
                            <div style={{ padding: '10px 12px', backgroundColor: '#FEF2F2', color: '#991B1B', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                                <span>⚠️</span>
                                <span><strong>Warning:</strong> Restoring this backup will replace existing browser storage with the data from this backup file.</span>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setPendingRestoreBackup(null)} disabled={isRestoring}>
                                Cancel
                            </button>
                            <button className="btn btn-primary" onClick={handleConfirmRestore} disabled={isRestoring}>
                                {isRestoring ? "Restoring Data..." : "Confirm & Restore Backup"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
};


