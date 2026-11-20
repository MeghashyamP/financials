import React from 'react';
import {
    Icon, DEFAULT_CATEGORIES, formatCurrencyVal, calculatePeriodDateRange,
    detectRecurringTransactions, processImportedTransaction, useEscapeKey,
    formatDate, getContrastTextColor, formatCategorySubIconFirst, filterTransactionsByPeriod,
    ModernDateFilterPicker, NET_WORTH_GROUPS, PeriodSelectOptions, generateFingerprint,
    getOccurrencesInPeriod, getEffectiveNetWorthItemValue, getISOStringInTimezone,
    shiftDateByCadence, getAnchorDayForRecurring, netWorthMonthsPerCycle, toLocalDateStr, setPrivacyMasked
} from './utils.jsx';
import {
    fetchStateFromDB, saveSettingInDB, saveTransactionsInDB, saveTagInDB,
    deleteTagFromDB, saveRuleInDB, deleteRuleFromDB, updateTransactionInDB,
    deleteTransactionFromDB, saveDocumentInDB, deleteDocumentFromDB,
    deleteDocumentAndTransactionsFromDB, wipeDatabase, requestStoragePersistence
} from './store.js';

import { DashboardPage } from './pages/DashboardPage.jsx';
import { TransactionsPage } from './pages/TransactionsPage.jsx';
import { NetWorthPage } from './pages/NetWorthPage.jsx';
import { BudgetsPage, GoalsPage } from './pages/PlanningPages.jsx';
import { RecurringPage, DocumentsPage, RulesPage, SettingsPage } from './pages/ManagementPages.jsx';

import { AddEntryModal } from './components/modals/TransactionModals.jsx';
import { ImportFileModal, CsvMappingDialog, PdfColumnMappingDialog, PdfImportConfirmDialog } from './components/modals/ImportModals.jsx';
import { AuthModal } from './components/modals/AuthModal.jsx';
import { extractTextFromPDF, parseTransactionsFromPDFText, parseCSVText } from './services/importers.js';
import { setCategoryMemory } from './categorizer.js';
import { applyStatementImport } from './services/statementImport.js';
import { planImport, mergeIntoPlaceholder, withFingerprints } from './services/importDedupe.js';
import { applyRules, revertRuleOnTx, isEnabled as isRuleOn } from './services/rulesEngine.js';
import { resolveStatementAccount } from './services/accounts.js';
import { applyCategory, isNeedsReview } from './services/review.js';
import { ReviewInbox } from './components/MerchantReview.jsx';
import { ReportsPage } from './pages/ReportsPage.jsx';
import { LockScreen } from './components/LockScreen.jsx';
import { isLockEnabled, getIdleMinutes, readPrivacyDefault } from './services/appLock.js';
import { markBackup, backupHealth, snoozeBackupBanner } from './services/backupStatus.js';
import { exportBackup } from './services/backup.js';
import { getGlobalFileHandle, writeStateToLocalFile, restoreGlobalFileHandle } from './services/localFileSync.js';
import {
    supabase, getCurrentUser, signOutUser, saveUserDataToCloud,
    getSessionEncryptionKey, hashSyncState, isCloudSyncPaused
} from './services/supabaseService.js';


class ModalErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error("Modal Error Boundary caught an error:", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="modal-overlay">
                    <div className="modal-container" style={{ maxWidth: '500px', padding: '24px', textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '12px' }}>⚠️</div>
                        <h3 style={{ color: 'var(--danger)', marginBottom: '8px' }}>Dialog Error</h3>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                            {this.state.error?.message || "An unexpected error occurred."}
                        </p>
                        <button className="btn btn-primary" onClick={() => {
                            this.setState({ hasError: false, error: null });
                            if (this.props.onReset) this.props.onReset();
                        }}>
                            Close & Continue
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

class PageErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error("Page Error Boundary caught an error:", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '40px', textAlign: 'center', backgroundColor: 'var(--card-bg)', borderRadius: '12px', margin: '20px', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>⚠️</div>
                    <h3 style={{ color: 'var(--danger)', marginBottom: '8px' }}>Page Load Error</h3>
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '20px', maxWidth: '500px', margin: '0 auto 20px' }}>
                        {this.state.error?.message || "An error occurred while loading this view."}
                    </p>
                    <button className="btn btn-primary" onClick={() => {
                        this.setState({ hasError: false, error: null });
                        if (this.props.onReset) this.props.onReset();
                    }}>
                        Reset View
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

const AppInner = ({ privacy }) => {
    // "Hide amounts": set before any child renders so every formatted amount in this pass is masked
    setPrivacyMasked(privacy.privacyMode);
    // Main unified states
    const [activePage, setActivePage] = React.useState("dashboard");

    const handleNavigatePage = (pageId) => {
        setActivePage(pageId);
        setShowAddEntryModal(false);
        setShowImportModal(false);
        setShowSyncModal(false);
        window.scrollTo(0, 0);
    };
    const [transactions, setTransactions] = React.useState([]);
    // Teach the categoriser from what you've already categorised (your own choices beat built-in guesses)
    React.useEffect(() => { setCategoryMemory(transactions); }, [transactions]);
    const needsReviewCount = React.useMemo(() => transactions.filter(isNeedsReview).length, [transactions]);
    // "Your data only lives in this browser" reminder (re-evaluated after a backup / snooze / sync)
    const [backupTick, setBackupTick] = React.useState(0);
    const [tags, setTags] = React.useState([]);
    const [rules, setRules] = React.useState([]);
    const [settings, setSettings] = React.useState({});
    // Always-current copy of settings for async flows that write several keys in a row (e.g. a statement import):
    // reading `settings` from the render closure there would silently overwrite an earlier write.
    const settingsRef = React.useRef({});
    settingsRef.current = settings;
    const [documents, setDocuments] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [toasts, setToasts] = React.useState([]);

    // Calculation Period per-page state defaults:
    // Dashboard: current month ("this_month")
    // Recurring: current month ("this_month")
    // Transactions: all time ("all_time")
    const [pagePeriods, setPagePeriods] = React.useState({
        dashboard: "this_month",
        recurring: "this_month",
        transactions: "all_time",
        budgets: "this_month"
    });
    const [pageCustomStarts, setPageCustomStarts] = React.useState({});
    const [pageCustomEnds, setPageCustomEnds] = React.useState({});

    const calcPeriod = pagePeriods[activePage] || (activePage === "transactions" ? "all_time" : "this_month");
    const setCalcPeriod = (val) => handleUnifiedPeriodChange(val);
    const calcCustomStart = pageCustomStarts[activePage] || "";
    const setCalcCustomStart = (val) => setPageCustomStarts(prev => ({ ...prev, [activePage]: val }));
    const calcCustomEnd = pageCustomEnds[activePage] || "";
    const setCalcCustomEnd = (val) => setPageCustomEnds(prev => ({ ...prev, [activePage]: val }));

    const [networthSectionFilter, setNetworthSectionFilter] = React.useState("all");
    const [networthCollapsed, setNetworthCollapsed] = React.useState({});
    const [recurringCollapseSignal, setRecurringCollapseSignal] = React.useState(0);
    const [recurringIsAnyCollapsed, setRecurringIsAnyCollapsed] = React.useState(true);

    // Calculate All Time min and max transaction dates
    const allTimeRange = React.useMemo(() => {
        if (!transactions || transactions.length === 0) {
            const today = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
            return { start: "2020-01-01", end: todayStr };
        }
        let minD = null;
        let maxD = null;
        transactions.forEach(t => {
            if (!t.date) return;
            const dStr = String(t.date).slice(0, 10);
            if (!minD || dStr < minD) minD = dStr;
            if (!maxD || dStr > maxD) maxD = dStr;
        });
        const today = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
        return {
            start: minD || "2020-01-01",
            end: maxD || todayStr
        };
    }, [transactions]);

    // Calculate All Time min start date and max end date specifically for Recurring transactions
    const recurringAllTimeRange = React.useMemo(() => {
        const recurringItems = (settings?.recurring || []).filter(Boolean);
        const today = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

        let minD = null;
        let maxD = null;

        recurringItems.forEach(c => {
            const sDate = c.startDate || c.date || c.nextDate;
            if (sDate) {
                const sStr = String(sDate).slice(0, 10);
                if (!minD || sStr < minD) minD = sStr;
            }
            if (c.endDate) {
                const eStr = String(c.endDate).slice(0, 10);
                if (!maxD || eStr > maxD) maxD = eStr;
            }
        });

        if (transactions && transactions.length > 0) {
            transactions.forEach(t => {
                if (!t.date) return;
                const dStr = String(t.date).slice(0, 10);
                if (!minD || dStr < minD) minD = dStr;
            });
        }

        const startStr = minD || todayStr;

        // Calculate 30 years after lowest start date
        const startDateObj = new Date(startStr + "T00:00:00");
        let thirtyYearsEndStr = "";
        if (!isNaN(startDateObj.getTime())) {
            const endDateObj = new Date(startDateObj);
            endDateObj.setFullYear(endDateObj.getFullYear() + 30);
            thirtyYearsEndStr = `${endDateObj.getFullYear()}-${pad(endDateObj.getMonth() + 1)}-${pad(endDateObj.getDate())}`;
        } else {
            thirtyYearsEndStr = `${today.getFullYear() + 30}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
        }

        let finalEndStr = thirtyYearsEndStr;
        if (maxD && maxD > thirtyYearsEndStr) {
            finalEndStr = maxD;
        }

        return {
            start: startStr,
            end: finalEndStr
        };
    }, [settings?.recurring, transactions]);

    const activePeriod = calcPeriod;
    const normPeriodKey = (activePeriod || "this_month").toLowerCase().replace(/-/g, "_");
    const calcRange = calculatePeriodDateRange(activePeriod, new Date(), calcCustomStart, calcCustomEnd);

    const displayStartDate = React.useMemo(() => {
        if (["custom", "custom_range"].includes(normPeriodKey)) {
            return calcCustomStart || calcRange.pStartStr;
        }
        if (["all_time", "all"].includes(normPeriodKey)) {
            if (activePage === "recurring") {
                return calcCustomStart || recurringAllTimeRange.start;
            }
            return calcCustomStart || allTimeRange.start;
        }
        return calcRange.pStartStr;
    }, [normPeriodKey, calcCustomStart, calcRange.pStartStr, allTimeRange.start, recurringAllTimeRange.start, activePage]);

    const displayEndDate = React.useMemo(() => {
        if (["custom", "custom_range"].includes(normPeriodKey)) {
            return calcCustomEnd || calcRange.pEndStr;
        }
        if (["all_time", "all"].includes(normPeriodKey)) {
            if (activePage === "recurring") {
                return calcCustomEnd || recurringAllTimeRange.end;
            }
            return calcCustomEnd || allTimeRange.end;
        }
        return calcRange.pEndStr;
    }, [normPeriodKey, calcCustomEnd, calcRange.pEndStr, allTimeRange.end, recurringAllTimeRange.end, activePage]);

    const handleUnifiedPeriodChange = (val) => {
        setPagePeriods(prev => ({ ...prev, [activePage]: val }));
        const normVal = (val || "").toLowerCase().replace(/-/g, "_");
        if (!["custom", "custom_range"].includes(normVal)) {
            setPageCustomStarts(prev => ({ ...prev, [activePage]: "" }));
            setPageCustomEnds(prev => ({ ...prev, [activePage]: "" }));
        }
    };

    const handleStartDateChange = (val) => {
        setPageCustomStarts(prev => ({ ...prev, [activePage]: val }));
        if (!calcCustomEnd) setPageCustomEnds(prev => ({ ...prev, [activePage]: displayEndDate }));
        handleUnifiedPeriodChange("custom");
    };

    const handleEndDateChange = (val) => {
        setPageCustomEnds(prev => ({ ...prev, [activePage]: val }));
        if (!calcCustomStart) setPageCustomStarts(prev => ({ ...prev, [activePage]: displayStartDate }));
        handleUnifiedPeriodChange("custom");
    };

    const [isSidebarCollapsed, setIsSidebarCollapsed] = React.useState(() => {
        return localStorage.getItem("sidebar_collapsed") === "true";
    });

    const toggleSidebar = () => {
        setIsSidebarCollapsed(prev => {
            const next = !prev;
            localStorage.setItem("sidebar_collapsed", next ? "true" : "false");
            return next;
        });
    };

    const getPageTitle = (page) => {
        switch (page) {
            case "dashboard": return "Financials Dashboard";
            case "transactions": return "";
            case "networth": return "Net Worth";
            case "recurring": return "Recurring";
            case "review": return "Needs Review";
            case "reports": return "Reports";
            case "budgets": return "Monthly Budgets";
            case "goals": return "Savings Goals";
            case "documents": return "Document Vault";
            case "rules": return "Transaction Rules";
            case "settings": return "System Settings";
            default: return "Financials";
        }
    };

    const getPageDescription = (page) => {
        switch (page) {
            case "dashboard": return "Self-contained personal wealth control panel";
            case "transactions": return "";
            case "networth": return "Capital assets, investment portfolios, real estate & debt principal owed";
            case "recurring": return "Periodic bills, EMIs, SIPs, regular income and scheduled commitments";
            case "review": return "Transactions the app wouldn't categorise on its own — decide once, remembered forever";
            case "reports": return "Financial year summary, what your cards cost, alerts, cash-flow forecast and CSV export";
            case "budgets": return "Configure envelopes and track your current spending limits";
            case "goals": return "Establish and trace your long term capital targets";
            case "documents": return "Upload and store your bank statements, receipts, and invoices";
            case "rules": return "Build automation filters to map merchants to categories instantly";
            case "settings": return "Manage your custom options, catalogs, categories, and resets";
            default: return "";
        }
    };

    // Modal Toggles & Page Actions
    const [showAddEntryModal, setShowAddEntryModal] = React.useState(false);
    const [showImportModal, setShowImportModal] = React.useState(false);
    const [showSyncModal, setShowSyncModal] = React.useState(false);
    const [showAuthModal, setShowAuthModal] = React.useState(false);
    const [authModalNotice, setAuthModalNotice] = React.useState("");
    const [authModalView, setAuthModalView] = React.useState("signIn");
    const [currentUser, setCurrentUser] = React.useState(null);
    const [cloudSyncStatus, setCloudSyncStatus] = React.useState("idle"); // "idle" | "syncing" | "synced" | "error"
    const backupInfo = React.useMemo(() => backupHealth({ transactionCount: transactions.length }), [transactions.length, backupTick, cloudSyncStatus]);
    const handleBackupNow = async () => {
        try {
            await exportBackup({ transactions, tags, rules, settings, documents });
            setBackupTick(t => t + 1);
            showToast("Backup downloaded. Keep the file somewhere safe (it is not encrypted).", "success");
        } catch (e) {
            showToast("Backup failed: " + (e?.message || "unknown error"), "error");
        }
    };
    const [subpageActionSignal, setSubpageActionSignal] = React.useState(0);

    // Transactions search and filter states in topbar
    const [txSearch, setTxSearch] = React.useState("");
    const [txTypeFilter, setTxTypeFilter] = React.useState("all");
    const [txCategoryFilter, setTxCategoryFilter] = React.useState("all");
    const [txAccountFilter, setTxAccountFilter] = React.useState("all");
    const [txTagFilter, setTxTagFilter] = React.useState("all");
    const [txNarrationFilter, setTxNarrationFilter] = React.useState("");
    const [txAmountFilter, setTxAmountFilter] = React.useState("");
    const [txNotesFilter, setTxNotesFilter] = React.useState("");
    const [activeTxPopover, setActiveTxPopover] = React.useState(null);
    const [txCustomFromDate, setTxCustomFromDate] = React.useState("");
    const [txCustomToDate, setTxCustomToDate] = React.useState("");
    const [txSortField, setTxSortField] = React.useState("date");
    const [txSortDirection, setTxSortDirection] = React.useState("desc");

    const handleTxSort = (field) => {
        if (txSortField !== field) {
            setTxSortField(field);
            setTxSortDirection("asc");
        } else if (txSortDirection === "asc") {
            setTxSortDirection("desc");
        } else {
            setTxSortField(null);
        }
    };

    const renderSortIcon = (field) => {
        const isActive = txSortField === field;
        const isAsc = isActive && txSortDirection === "asc";
        const isDesc = isActive && txSortDirection === "desc";

        return (
            <span
                title={`Sort by ${field} (${isActive ? (txSortDirection === 'asc' ? 'Ascending' : 'Descending') : 'Click to sort'})`}
                onClick={(e) => {
                    e.stopPropagation();
                    handleTxSort(field);
                }}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    flexShrink: 0,
                    marginLeft: '4px',
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

    // Fetch unified state on mount and when updates occur. Returns the loaded state (or null).
    const loadState = async () => {
        try {
            const state = await fetchStateFromDB();
            setTransactions(state.transactions);
            setTags(state.tags);
            setRules(state.rules);
            setSettings(state.settings);
            setDocuments(state.documents);
            return state;
        } catch (e) {
            showToast("Error loading local database", "error");
            return null;
        } finally {
            setLoading(false);
        }
    };

    // Fingerprint of the state last known to match the cloud copy. Pushes only happen
    // when the current state differs from it.
    const lastSyncedHashRef = React.useRef(null);

    // Treat the given state as already in sync (after load, restore or upload).
    const markStateAsSynced = (state) => {
        if (state) lastSyncedHashRef.current = hashSyncState(state);
    };

    React.useEffect(() => {
        // The state as loaded is the baseline: opening the app must not push this
        // device's copy over the cloud; only changes made here should be uploaded.
        loadState().then(markStateAsSynced);
        requestStoragePersistence();

        // Restore local project file handle from IndexedDB if available
        restoreGlobalFileHandle().then(({ handle, permissionGranted }) => {
            if (handle && permissionGranted) {
                console.log("Restored active file handle with write permission:", handle.name);
            }
        }).catch(err => console.warn("Restore file handle error:", err));

        // Check active Supabase session
        getCurrentUser().then(user => {
            setCurrentUser(user || null);
        }).catch(err => console.warn("Supabase user check:", err));

        // Detect Supabase Auth redirect errors & recovery flows
        try {
            const hash = window.location.hash;
            const search = window.location.search;
            if (hash || search) {
                const raw = hash.startsWith('#') ? hash.substring(1) : (search.startsWith('?') ? search.substring(1) : search);
                const params = new URLSearchParams(raw);
                const errorCode = params.get('error_code');
                const errorDesc = params.get('error_description');
                const error = params.get('error');
                const type = params.get('type');

                if (type === 'recovery') {
                    setAuthModalView("setNewPassword");
                    setShowAuthModal(true);
                    window.history.replaceState(null, '', window.location.pathname);
                } else if (error || errorCode || errorDesc) {
                    // Remove error hash from address bar so page URL remains clean
                    window.history.replaceState(null, '', window.location.pathname);

                    if (errorCode === 'otp_expired' || (errorDesc && errorDesc.toLowerCase().includes('expired'))) {
                        showToast(
                            "The email link was already used or expired. If Gmail pre-scanned the link, your account may already be confirmed — try signing in!",
                            "warning"
                        );
                        setAuthModalNotice("Email link expired or was auto-verified by Gmail's link scanner. Try signing in with your email and password below! If you still need to verify, you can enter the 6-digit code or resend.");
                        setShowAuthModal(true);
                    } else {
                        const message = errorDesc ? decodeURIComponent(errorDesc).replace(/\+/g, ' ') : (error || "Authentication error occurred");
                        showToast(`Auth error: ${message}`, "error");
                    }
                }
            }
        } catch (urlErr) {
            console.warn("Error parsing auth URL parameters:", urlErr);
        }

        // Listen for auth state changes. Pulling cloud data on sign-in is handled by
        // AuthModal, which restores the cloud copy and overwrites local data.
        const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            setCurrentUser(session?.user || null);
            if (event === 'PASSWORD_RECOVERY') {
                setAuthModalView("setNewPassword");
                setShowAuthModal(true);
            }
        });

        return () => {
            authListener?.subscription?.unsubscribe();
        };
    }, []);

    // Automatic Cloud Sync when logged in (debounced, content-based change detection)
    React.useEffect(() => {
        if (loading || !currentUser || lastSyncedHashRef.current === null) return;

        const timer = setTimeout(async () => {
            if (isCloudSyncPaused()) return;
            const snapshot = { transactions, tags, rules, settings, documents };
            const currentHash = hashSyncState(snapshot);
            if (currentHash === lastSyncedHashRef.current) return;

            // The encryption key lives in sessionStorage, so a new tab or browser restart
            // keeps the Supabase session but loses the key. Pause instead of failing.
            if (!getSessionEncryptionKey()) {
                setCloudSyncStatus("locked");
                return;
            }

            setCloudSyncStatus("syncing");
            try {
                await saveUserDataToCloud(snapshot);
                lastSyncedHashRef.current = currentHash;
                markBackup('cloud');
                setCloudSyncStatus("synced");
                setTimeout(() => setCloudSyncStatus(s => (s === "synced" ? "idle" : s)), 2500);
            } catch (err) {
                console.error("Auto cloud sync error:", err);
                setCloudSyncStatus("error");
            }
        }, 1500);

        return () => clearTimeout(timer);
    }, [transactions, tags, rules, settings, documents, currentUser, loading]);

    // Surface the paused state as soon as a session without a key is detected.
    React.useEffect(() => {
        if (currentUser && !getSessionEncryptionKey()) setCloudSyncStatus("locked");
    }, [currentUser]);

    // Real-time automatic sync to linked local project file when storage mode is project_file
    const isAutoSyncInitial = React.useRef(true);
    React.useEffect(() => {
        if (isAutoSyncInitial.current) {
            isAutoSyncInitial.current = false;
            return;
        }
        if (settings.storageMode !== 'project_file') return;

        const handle = getGlobalFileHandle();
        if (handle) {
            const timer = setTimeout(async () => {
                const success = await writeStateToLocalFile(handle, { transactions, tags, rules, settings, documents });
                if (success) {
                    const nowIso = getISOStringInTimezone(new Date(), settings?.timezone);
                    // Written to the DB only (not React state) so it doesn't re-trigger this effect.
                    saveSettingInDB("lastFileSyncedAt", nowIso).catch(() => {});
                } else {
                    console.warn("Auto-sync to local file failed (permission or invalid handle). User re-authorization may be required.");
                }
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [transactions, tags, rules, settings, documents]);


    // Helper to display floating toasts
    const showToast = (message, type = "success") => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 3500);
    };

    // Tag management helpers
    const handleSaveTag = async (tagObj) => {
        const name = (typeof tagObj === "string" ? tagObj : tagObj?.name || "").trim();
        if (!name) return;

        const existing = tags.find(t => t.name.toLowerCase() === name.toLowerCase());
        if (existing) return existing;

        const newTag = {
            name: name,
            color: (typeof tagObj === "object" && tagObj.color) ? tagObj.color : '#4F46E5',
            createdAt: new Date().toISOString()
        };

        try {
            await saveTagInDB(newTag);
            setTags(prev => [...prev.filter(t => t.name.toLowerCase() !== name.toLowerCase()), newTag]);
        } catch (e) {
            console.error("Failed to save tag in DB", e);
        }
        return newTag;
    };

    const handleDeleteTag = async (tagName) => {
        if (!tagName) return;
        try {
            await deleteTagFromDB(tagName);
            setTags(prev => prev.filter(t => t.name.toLowerCase() !== tagName.toLowerCase()));

            // Clean up transaction tag lists in DB & state so recreating same tag later doesn't pick up old transactions
            const updatedTxList = await Promise.all(transactions.map(async t => {
                if (t.tags && Array.isArray(t.tags) && t.tags.some(tag => tag.toLowerCase() === tagName.toLowerCase())) {
                    const newT = t.tags.filter(tag => tag.toLowerCase() !== tagName.toLowerCase());
                    const updatedTx = { ...t, tags: newT };
                    await updateTransactionInDB(updatedTx);
                    return updatedTx;
                }
                return t;
            }));
            setTransactions(updatedTxList);

            showToast(`Tag "${tagName}" deleted`);
        } catch (e) {
            showToast("Failed to delete tag", "error");
        }
    };

    const handleUpdateTag = async (oldName, newName, newColor) => {
        const oldN = (oldName || "").trim();
        const newN = (newName || "").trim();
        if (!newN) return false;

        // Check for duplicate tag name (case-insensitive)
        const duplicate = tags.find(t => t.name.toLowerCase() === newN.toLowerCase() && t.name.toLowerCase() !== oldN.toLowerCase());
        if (duplicate) {
            showToast(`A tag with name "${newN}" already exists`, "error");
            return false;
        }

        try {
            if (oldN && oldN.toLowerCase() !== newN.toLowerCase()) {
                await deleteTagFromDB(oldN);
            }
            const updatedTag = {
                name: newN,
                color: newColor || '#4F46E5',
                createdAt: new Date().toISOString()
            };
            await saveTagInDB(updatedTag);

            setTags(prev => [...prev.filter(t => t.name.toLowerCase() !== oldN.toLowerCase() && t.name.toLowerCase() !== newN.toLowerCase()), updatedTag]);

            if (oldN && oldN.toLowerCase() !== newN.toLowerCase()) {
                const updatedTxList = await Promise.all(transactions.map(async t => {
                    if (t.tags && Array.isArray(t.tags) && t.tags.some(tag => tag.toLowerCase() === oldN.toLowerCase())) {
                        const newT = t.tags.map(tag => tag.toLowerCase() === oldN.toLowerCase() ? newN : tag);
                        const updatedTx = { ...t, tags: newT };
                        await updateTransactionInDB(updatedTx);
                        return updatedTx;
                    }
                    return t;
                }));
                setTransactions(updatedTxList);
            }
            showToast(`Tag updated to "${newN}"`);
            return true;
        } catch (e) {
            showToast("Failed to update tag", "error");
            return false;
        }
    };

    // Updates settings store (Section 4.5 Preferences API)
    const updateSetting = async (key, value) => {
        try {
            settingsRef.current = { ...settingsRef.current, [key]: value };
            await saveSettingInDB(key, value);
            setSettings(prev => ({ ...prev, [key]: value }));
        } catch (e) {
            showToast("Failed to save preference settings", "error");
        }
    };

    // Insert new transaction manually / batch CSV imports
    const importSummaryText = (res, linkedCount) => {
        const parts = [`${res.inserted} added`];
        if (res.replaced) parts.push(`${res.replaced} replaced your Dashboard payment${res.replaced === 1 ? "" : "s"}`);
        if (res.duplicates) parts.push(`${res.duplicates} already imported (skipped)`);
        if (res.possibleDuplicates) parts.push(`${res.possibleDuplicates} possible duplicate${res.possibleDuplicates === 1 ? "" : "s"} left out`);
        if (linkedCount) parts.push(`${linkedCount} linked to your ledger`);
        return `Import summary: ${parts.join(", ")}.`;
    };

    // opts.mode === "import": statement / CSV / folder imports. They also skip rows that overlap what is already saved
    // and let a real statement row replace a payment you ticked off on the Dashboard (see services/importDedupe.js).
    const handleAddTransactions = async (newItems, opts = {}) => {
        const isImport = opts.mode === "import";
        const availableCats = settings?.categories || DEFAULT_CATEGORIES;
        const processed = newItems.map(t => {
            const now = new Date().toISOString();
            // narration is the primary description; merchant mirrors it for fingerprinting/rules
            const narrationVal = t.narration || t.merchant || "Unknown";
            const item = {
                id: t.id || ((typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`),
                date: t.date || now.split('T')[0],
                narration: narrationVal,
                merchant: narrationVal,
                refId: t.refId || "",
                category: t.category || "",
                categorySource: t.categorySource,
                categoryConfidence: t.categoryConfidence,
                ruleChanges: t.ruleChanges,
                amount: Math.abs(Number(t.amount || 0)),
                // keep "neutral" (card-bill payments, own-account transfers, reversals) — it is excluded from income & spending
                type: (t.type === "income" || t.type === "neutral") ? t.type : "expense",
                neutralSign: t.type === "neutral" ? (t.neutralSign === "-" ? "-" : "+") : undefined,
                account: t.account || "Bank 1",
                tags: Array.isArray(t.tags) ? t.tags : (typeof t.tags === "string" ? t.tags.split(",").map(x => x.trim()).filter(Boolean) : []),
                notes: t.notes || "",
                receipt: t.receipt ? 1 : 0,
                source: t.source || "manual",
                createdAt: t.createdAt || now,
                documentId: t.documentId || null,
                replaceTargetId: t.replaceTargetId || null,
                linkedRecurringId: t.linkedRecurringId || null
            };

            const finalized = processImportedTransaction(item, rules, availableCats);
            if (finalized.neutralSign === undefined) delete finalized.neutralSign;
            if (finalized.categorySource === undefined) delete finalized.categorySource;
            if (finalized.categoryConfidence === undefined) delete finalized.categoryConfidence;
            if (finalized.ruleChanges === undefined) delete finalized.ruleChanges;
            return finalized;
        });

        const withFp = withFingerprints(processed, generateFingerprint);
        const plan = planImport(withFp, transactions || [], { recurring: settingsRef.current.recurring || [], exactOnly: !isImport });
        // choices made in the review dialog
        newItems.forEach((orig, i) => {
            if (orig.forceInsert && plan[i].action !== "insert" && plan[i].reason !== "exact") plan[i] = { action: "insert" };
            if (orig.skipPlaceholderMatch && plan[i].action === "replace") plan[i] = { action: "insert" };
            if (orig.replaceTargetId) plan[i] = { action: "replace", matchId: orig.replaceTargetId };
        });

        try {
            const itemsToInsert = [];
            let replaced = 0, duplicates = 0, possibleDuplicates = 0;
            for (let i = 0; i < withFp.length; i++) {
                const row = withFp[i];
                const step = plan[i];
                if (step.action === "duplicate") { duplicates++; continue; }
                if (step.action === "maybe-duplicate") { possibleDuplicates++; continue; }
                if (step.action === "replace") {
                    const target = (transactions || []).find(x => x.id === step.matchId);
                    if (target) {
                        try {
                            await updateTransactionInDB(mergeIntoPlaceholder(target, row, { fmtDate: (d) => formatDate(d, settingsRef.current.dateFormat) }));
                            replaced++;
                        } catch (mergeErr) {
                            duplicates++;   // the statement row already exists under another transaction
                        }
                        continue;
                    }
                }
                delete row.replaceTargetId;
                itemsToInsert.push(row);
            }
            let result = { inserted: 0, duplicates: 0 };
            if (itemsToInsert.length > 0) {
                result = await saveTransactionsInDB(itemsToInsert);
            }
            await loadState();
            return { ...result, duplicates: result.duplicates + duplicates, replaced, possibleDuplicates };
        } catch (e) {
            console.error("Error saving transactions in DB:", e);
            showToast("Error inserting transactions in database: " + (e?.message || "unknown error"), "error");
            return { inserted: 0, duplicates: newItems.length, replaced: 0, possibleDuplicates: 0 };
        }
    };

    // Delete transaction
    const handleDeleteTransaction = async (id) => {
        try {
            await deleteTransactionFromDB(id);
            showToast("Transaction deleted successfully");
            loadState();
        } catch (e) {
            showToast("Delete failed", "error");
        }
    };

    // Delete document and its transactions
    const handleDeleteDocument = async (docId) => {
        try {
            await deleteDocumentAndTransactionsFromDB(docId);
            showToast("File and associated transactions deleted successfully");
            await loadState();
        } catch (e) {
            showToast("Failed to delete file and transactions", "error");
        }
    };

    // Quick category/tag updates inline in table cell
    const handlePatchTransaction = async (id, patch) => {
        const tx = transactions.find(t => t.id === id);
        if (!tx) return;

        const updated = { ...tx, ...patch };
        if (patch && Object.prototype.hasOwnProperty.call(patch, "category") && !Object.prototype.hasOwnProperty.call(patch, "categorySource")) {
            updated.categorySource = "manual";
        }
        // Category / tag changes don't affect the fingerprint; date / merchant / amount / account / type do.
        // Keep the "#2" suffix that tells apart identical rows from the same import.
        const fpFields = ["date", "merchant", "narration", "amount", "account", "type"];
        if (fpFields.some(k => patch && Object.prototype.hasOwnProperty.call(patch, k))) {
            const suffix = (String(tx.fingerprint || "").match(/#\d+$/) || [""])[0];
            updated.fingerprint = generateFingerprint(updated) + suffix;
        }

        try {
            await updateTransactionInDB(updated);
            setTransactions(prev => prev.map(t => t.id === id ? updated : t));
            showToast("Transaction updated");
        } catch (e) {
            showToast("Update failed", "error");
        }
    };

    // ───── Rules (Gmail-style) ─────
    // Save many changed transactions (a type flip also changes the fingerprint; the "#2" suffix is kept).
    const persistTxUpdates = async (pairs) => {
        const updatedById = new Map();
        let failed = 0;
        for (const { before, after } of pairs) {
            let next = after;
            if (next.type !== before.type) {
                const suffix = (String(before.fingerprint || "").match(/#\d+$/) || [""])[0];
                next = { ...after, fingerprint: generateFingerprint(after) + suffix };
            }
            try {
                await updateTransactionInDB(next);
                updatedById.set(next.id, next);
            } catch (e) {
                failed++;
            }
        }
        if (updatedById.size > 0) setTransactions(prev => prev.map(t => updatedById.get(t.id) || t));
        return { updated: updatedById.size, failed };
    };

    const txChanged = (a, b) =>
        a.category !== b.category || a.type !== b.type || a.neutralSign !== b.neutralSign || a.categorySource !== b.categorySource
        || (Array.isArray(a.tags) ? a.tags : []).join("\u0001") !== (Array.isArray(b.tags) ? b.tags : []).join("\u0001")
        || JSON.stringify(a.ruleChanges || null) !== JSON.stringify(b.ruleChanges || null);

    // Apply one rule to the transactions already saved (optionally taking back its earlier changes first).
    const applyRuleToExisting = async (rule, { overwriteManual = false, revertFirst = false } = {}) => {
        const pool = settingsRef.current.categories || DEFAULT_CATEGORIES;
        const on = isRuleOn(rule);
        const pairs = [];
        for (const t of transactions) {
            let base = t;
            if (revertFirst) base = revertRuleOnTx(t, rule.id).tx;
            const next = on ? applyRules(base, [rule], { overwriteManual, pool }).tx : base;
            if (txChanged(t, next)) pairs.push({ before: t, after: next });
        }
        return persistTxUpdates(pairs);
    };

    const handleSaveRule = async (rule, opts = {}) => {
        const now = new Date().toISOString();
        const saved = { ...rule, id: rule.id || crypto.randomUUID(), version: 2, createdAt: rule.createdAt || now, updatedAt: now };
        delete saved.legacy;
        saved.enabled = (rule.enabled === 0 || rule.enabled === false) ? 0 : 1;
        // tags a rule adds are created if they don't exist yet
        for (const a of saved.actions || []) {
            if (a.type === "addTags") {
                const names = Array.isArray(a.value) ? a.value : String(a.value || "").split(",");
                for (const name of names.map(x => String(x).trim()).filter(Boolean)) await handleSaveTag(name);
            }
        }
        await saveRuleInDB(saved);
        let result = { updated: 0, failed: 0 };
        if (opts.applyExisting || opts.revertFirst) {
            result = await applyRuleToExisting(saved, { overwriteManual: !!opts.overwriteManual, revertFirst: !!opts.revertFirst });
        }
        await loadState();
        if (!opts.quiet) {
            showToast(result.updated
                ? `Rule saved and applied to ${result.updated} existing transaction${result.updated === 1 ? "" : "s"}`
                : "Rule saved — it will apply to everything you import from now on");
        }
        return result;
    };

    const handleRunRule = async (rule, opts = {}) => {
        const result = await applyRuleToExisting(rule, { overwriteManual: !!opts.overwriteManual });
        await loadState();
        return result;
    };

    const handleDeleteRule = async (rule, { revert = false } = {}) => {
        let reverted = 0;
        // Either way the rule's change records leave the transactions: undone (revert) or simply forgotten (keep).
        const pairs = [];
        for (const t of transactions) {
            if (t.ruleChanges && t.ruleChanges[rule.id]) {
                if (revert) {
                    pairs.push({ before: t, after: revertRuleOnTx(t, rule.id).tx });
                } else {
                    const rest = { ...t.ruleChanges };
                    delete rest[rule.id];
                    const kept = { ...t };
                    if (Object.keys(rest).length) kept.ruleChanges = rest; else delete kept.ruleChanges;
                    pairs.push({ before: t, after: kept });
                }
            }
        }
        const saved = await persistTxUpdates(pairs);
        if (revert) reverted = saved.updated;
        await deleteRuleFromDB(rule.id);
        await loadState();
        return { reverted };
    };

    // Set one category on many transactions (Needs Review inbox, learned-merchants manager).
    // Rows flip between neutral / income / expense when the category moves money between your own accounts.
    const handleBulkCategorize = async (ids, category) => {
        const wanted = new Set(ids);
        const updatedById = new Map();
        let failed = 0;
        for (const t of transactions) {
            if (!wanted.has(t.id)) continue;
            const next = applyCategory(t, category);
            if (next.type !== t.type) {
                const suffix = (String(t.fingerprint || "").match(/#\d+$/) || [""])[0];
                next.fingerprint = generateFingerprint(next) + suffix;
            }
            try {
                await updateTransactionInDB(next);
                updatedById.set(t.id, next);
            } catch (e) {
                failed++;
            }
        }
        if (updatedById.size > 0) setTransactions(prev => prev.map(t => updatedById.get(t.id) || t));
        return { updated: updatedById.size, failed };
    };

    // PDF Bank Statement / Receipt Import handler
    // Step 1: pdfMappingData → shows PdfColumnMappingDialog (how tokens map to fields)
    // Step 2: pdfImportData → shows PdfImportConfirmDialog (review all transactions)
    const [pdfMappingData, setPdfMappingData] = React.useState(null);
    const [pdfImportData, setPdfImportData] = React.useState(null);

    const handlePdfParsed = (parsedTransactions, filename, file, selectedAccount) => {
        // Recognised bank/card layouts are already fully structured → straight to review (no column mapping needed)
        if (parsedTransactions?.[0]?._templateParsed) {
            let account = selectedAccount || parsedTransactions[0].account || "";
            // Use the statement's own card/account number (and bank) to put it in the right account.
            const stmt = parsedTransactions[0]._statement;
            if (stmt) {
                const pick = resolveStatementAccount(settingsRef.current, stmt, account);
                if (pick.switched) showToast(`Imported into "${pick.account}" — ${pick.reason}.`, "info");
                if (pick.warning) showToast(pick.warning, "warning");
                account = pick.account;
            }
            setShowImportModal(false);
            confirmPdfMapping(parsedTransactions.map(t => ({ ...t, account })), filename, file);
            return;
        }
        // Go to mapping dialog first
        setPdfMappingData({ parsedTransactions, filename, file, selectedAccount });
        setShowImportModal(false); // close the upload modal
    };

    // Called when user confirms the column mapping — builds final transactions and opens review
    const confirmPdfMapping = (mappedTransactions, filename, file) => {
        try {
            const availableCats = settings?.categories || DEFAULT_CATEGORIES;
            const finalTxs = (mappedTransactions || []).map(t => {
                const merch = String(t?.merchant || t?.narration || "Bank Transaction");
                const rawItem = {
                    ...t,
                    narration: merch,
                    merchant: merch,
                    type: (t?.type === "income" || t?.type === "neutral") ? t.type : "expense",
                    category: t?.category || ""
                };
                return processImportedTransaction(rawItem, rules, availableCats);
            });
            setPdfImportData({
                transactions: finalTxs,
                filename,
                file
            });
            setPdfMappingData(null);
        } catch (err) {
            console.error("Error in confirmPdfMapping:", err);
            showToast("Error preparing transaction review: " + err.message, "error");
        }
    };


    // Advance a recurring item's date by one cycle, keeping its due day
    // (Jan 31 monthly -> Feb 28 -> Mar 31, never Mar 3).
    const advanceRecurringDate = (dateStr, r) =>
        shiftDateByCadence(dateStr, r.cadence, 1, {
            anchorDay: getAnchorDayForRecurring(r),
            intervalDays: r.customIntervalDays
        });

    // Advance a Net Worth ledger item's Next Due Date based on its frequency-per-year
    const advanceNetWorthDate = (dateStr, frequencyPerYear) =>
        shiftDateByCadence(dateStr, "monthly", netWorthMonthsPerCycle(frequencyPerYear));

    // Apply "Link to Ledger" selections made in the PDF review table: advances the linked
    // Recurring / Net Worth item's next due date so the ledger stays live.
    const applyLedgerLinks = async (selectedTransactions) => {
        const linked = selectedTransactions.filter(t => t.linkTo);
        if (linked.length === 0) return;

        let recurringList = settings.recurring || [];
        let networthList = settings.networthItems || [];
        let billInstancesList = settings.billInstances || [];
        let recurringChanged = false, networthChanged = false, billInstancesChanged = false;

        linked.forEach(t => {
            const [kind, id] = t.linkTo.split(":");
            if (kind === "recurring") {
                recurringList = recurringList.map(r => r.id === id ? { ...r, nextDate: advanceRecurringDate(t.date, r) } : r);
                recurringChanged = true;

                // Also check if any Net Worth item is linked to this recurring template
                const hasLinkedNw = networthList.some(nw => nw.linkedRecurringId === id);
                if (hasLinkedNw) {
                    networthList = networthList.map(it => {
                        if (it.linkedRecurringId !== id) return it;
                        const isInvestment = (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "investment";
                        const isSip = it.syncMode === "sip" || it.syncMode === "investment_sip" || (isInvestment && it.syncMode !== "revolving");
                        if (isSip) {
                            const curInv = Number(it.invested || 0);
                            const curVal = Number(it.value !== undefined ? it.value : curInv);
                            const txAmt = Number(t.amount || 0);
                            return {
                                ...it,
                                invested: curInv + txAmt,
                                value: curVal + txAmt
                            };
                        } else if (it.syncMode === "amortizing" || it.syncMode === "loan_principal") {
                            const curVal = Number(it.value || 0);
                            const txAmt = Number(t.amount || 0);
                            return {
                                ...it,
                                value: Math.max(0, curVal - txAmt)
                            };
                        }
                        return it;
                    });
                    networthChanged = true;
                }
            } else if (kind === "billInstance") {
                billInstancesList = billInstancesList.map(b => b.id === id ? { ...b, status: 'paid', linkedTxId: t.id } : b);
                billInstancesChanged = true;
            } else if (kind === "networth") {
                networthList = networthList.map(it => {
                    if (it.id !== id) return it;
                    const updated = { ...it, nextDueDate: advanceNetWorthDate(t.date, it.frequencyPerYear) };
                    // For investments/SIPs, roll the payment into both invested and value
                    const isInvestment = it.category === "Investments" || (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "investment";
                    if (isInvestment || it.syncMode === "sip") {
                        const curInv = Number(it.invested || 0);
                        const curVal = Number(it.value !== undefined ? it.value : curInv);
                        const txAmt = Number(t.amount || 0);
                        updated.invested = curInv + txAmt;
                        updated.value = curVal + txAmt;
                    }
                    return updated;
                });
                networthChanged = true;
            }
        });

        if (recurringChanged) await updateSetting("recurring", recurringList);
        if (billInstancesChanged) await updateSetting("billInstances", billInstancesList);
        if (networthChanged) await updateSetting("networthItems", networthList);
    };

    const triggerPdfImport = async (selectedTransactions, statementCtx = null) => {
        if (!selectedTransactions || selectedTransactions.length === 0) {
            showToast("No transactions selected for import", "warning");
            setPdfImportData(null);
            return;
        }

        const docId = (typeof crypto !== "undefined" && crypto.randomUUID) 
            ? crypto.randomUUID() 
            : `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        try {
            // Add source & account default mapping if needed
            const itemsToInsert = selectedTransactions.map(t => ({
                ...t,
                source: "pdf-import",
                documentId: docId
            }));

            const res = await handleAddTransactions(itemsToInsert, { mode: "import" });

            try {
                await applyLedgerLinks(selectedTransactions);
            } catch (ledgerErr) {
                console.warn("Ledger link notice:", ledgerErr);
            }

            const linkedCount = selectedTransactions.filter(t => t.linkTo).length;
            showToast(importSummaryText(res, linkedCount));

            // Auto-register any new account names used in this import into Settings > Accounts
            const existingAccounts = settings?.accounts || [];
            const newAccounts = [...new Set(itemsToInsert.map(t => t.account).filter(Boolean))]
                .filter(a => !existingAccounts.some(e => e.toLowerCase() === a.toLowerCase()));
            if (newAccounts.length > 0) {
                try {
                    await updateSetting("accounts", [...existingAccounts, ...newAccounts]);
                } catch (accErr) {
                    console.warn("Account update notice:", accErr);
                }
            }

            // Statement history, account profile, Net Worth line and card due-date bill
            if (statementCtx?.summary) {
                try {
                    const nwKind = (cat) => (NET_WORTH_GROUPS.find(g => g.key === cat) || {}).kind;
                    const outcome = await applyStatementImport(
                        settingsRef.current,
                        { summary: statementCtx.summary, account: statementCtx.account || selectedTransactions[0]?.account, fileName: statementCtx.fileName, documentId: docId },
                        {
                            todayIso: toLocalDateStr(new Date()),
                            nowIso: new Date().toISOString(),
                            newId: () => ((typeof crypto !== "undefined" && crypto.randomUUID) ? crypto.randomUUID() : `id_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`),
                            saveSetting: updateSetting,
                            groupKind: nwKind,
                            effectiveValue: (it) => getEffectiveNetWorthItemValue(it, settingsRef.current.recurring || [], settingsRef.current.billInstances || []),
                            cardBillCategory: (settingsRef.current.categories || DEFAULT_CATEGORIES).find(c => String(c).startsWith("Credit - Card")) || "Credit - Card 💳"
                        }
                    );
                    if (outcome.skippedReason) {
                        showToast(`Statement history not updated: ${outcome.skippedReason}.`, "warning");
                    } else {
                        const extras = [outcome.networthUpdated && "Net Worth updated", outcome.billPlanned && "card due date added to Recurring"].filter(Boolean);
                        if (extras.length) showToast(`Statement saved — ${extras.join(", ")}.`);
                    }
                } catch (stmtErr) {
                    console.warn("Statement history notice:", stmtErr);
                }
            }

            // Save PDF document metadata in Vault if file object exists (without binary blob to save storage)
            if (pdfImportData?.file) {
                try {
                    await saveDocumentInDB({
                        id: docId,
                        filename: pdfImportData.filename || pdfImportData.file.name || "statement.pdf",
                        mimeType: "application/pdf",
                        size: pdfImportData.file.size || 0,
                        status: "stored",
                        source: "upload",
                        createdAt: new Date().toISOString()
                    });
                } catch (docErr) {
                    console.warn("Could not save PDF document metadata in Vault DB:", docErr);
                }
            }
        } catch (err) {
            console.error("Error during PDF import execution:", err);
            showToast(`Import failed: ${err.message}`, "error");
        } finally {
            setPdfImportData(null);
            setShowImportModal(false);
            if (typeof loadState === 'function') {
                await loadState();
            }
        }
    };

    // CSV Bank Statement Column Mapping UI Modal handler
    const [csvMappingData, setCsvMappingData] = React.useState(null);

    const handleCsvParsed = (rows, filename) => {
        if (rows.length < 2) {
            showToast("CSV file is too short or empty", "error");
            return;
        }
        const headers = rows[0].map((h, idx) => ({ index: idx, name: h || `Column ${idx + 1}` }));
        setCsvMappingData({
            rows: rows.slice(1),
            headers,
            filename,
            mappings: {
                date: 0,
                merchant: 1,
                amount: 2,
                type: -1, // -1 means use expense/income toggle or separate debit/credit column
                debit: -1,
                credit: -1
            }
        });
    };

    const triggerCsvImport = async (mappings) => {
        const { rows, filename } = csvMappingData;
        const itemsToInsert = [];
        const docId = crypto.randomUUID();

        rows.forEach(row => {
            const dateVal = row[mappings.date] || "";
            const merchantVal = row[mappings.merchant] || "";
            let amountVal = 0;
            let typeVal = "expense";

            if (mappings.debit !== -1 && mappings.credit !== -1) {
                const deb = Math.abs(parseFloat(String(row[mappings.debit] || "0").replace(/[^\d.-]/g, '')));
                const cred = Math.abs(parseFloat(String(row[mappings.credit] || "0").replace(/[^\d.-]/g, '')));
                if (cred > 0) {
                    amountVal = cred;
                    typeVal = "income";
                } else {
                    amountVal = deb;
                    typeVal = "expense";
                }
            } else {
                const amtStr = String(row[mappings.amount] || "0").replace(/[^\d.-]/g, '');
                const parsedAmt = parseFloat(amtStr);
                amountVal = Math.abs(parsedAmt);
                if (mappings.type !== -1) {
                    const tStr = String(row[mappings.type]).toLowerCase();
                    typeVal = (tStr.includes("in") || tStr.includes("cred") || parsedAmt > 0) ? "income" : "expense";
                } else {
                    typeVal = parsedAmt >= 0 ? "income" : "expense";
                }
            }

            // Format date (YYYY-MM-DD)
            let formattedDate = "";
            try {
                const dateObj = new Date(dateVal);
                if (!isNaN(dateObj.getTime())) {
                    formattedDate = dateObj.toISOString().split('T')[0];
                }
            } catch (e) { }

            if (formattedDate && merchantVal && amountVal > 0) {
                itemsToInsert.push({
                    date: formattedDate,
                    merchant: merchantVal,
                    amount: amountVal,
                    type: typeVal,
                    account: "CSV Import",
                    source: "csv",
                    documentId: docId
                });
            }
        });

        if (itemsToInsert.length === 0) {
            showToast("No valid transactions parsed from CSV", "warning");
            setCsvMappingData(null);
            return;
        }

        const res = await handleAddTransactions(itemsToInsert, { mode: "import" });
        showToast(importSummaryText(res, 0));

        // Auto-register any new account names used in this import into Settings > Accounts
        const existingAccounts = settings?.accounts || [];
        const newAccounts = [...new Set(itemsToInsert.map(t => t.account).filter(Boolean))]
            .filter(a => !existingAccounts.some(e => e.toLowerCase() === a.toLowerCase()));
        if (newAccounts.length > 0) {
            await updateSetting("accounts", [...existingAccounts, ...newAccounts]);
        }

        // Add CSV document metadata in vault list (Section 8.2)
        await saveDocumentInDB({
            id: docId,
            filename,
            mimeType: "text/csv",
            size: csvMappingData.rows.length * 100, // mock size
            status: "stored",
            source: "manual-csv",
            createdAt: new Date().toISOString()
        });

        setCsvMappingData(null);
        setShowImportModal(false);
        loadState();
    };

    // Modern client-side Directory Picker Watcher sync (Section 17/18 replacement)
    const handleSyncLocalFolder = async () => {
        try {
            if (!window.showDirectoryPicker) {
                showToast("Your browser does not support Directory Picker API. Please drag-and-drop files in Documents page.", "warning");
                return;
            }

            const dirHandle = await window.showDirectoryPicker();
            showToast(`Access granted to directory: ${dirHandle.name}`);

            let newTxCount = 0;
            let fileCount = 0;
            let duplicateCount = 0;

            const processedIds = [...(settings.processedFileIds || [])];
            const resetAt = settings.driveResetAt ? new Date(settings.driveResetAt) : null;
            const updatedProcessedIds = [...processedIds];

            // Loop directory files
            for await (const entry of dirHandle.values()) {
                if (entry.kind === 'file') {
                    const file = await entry.getFile();
                    const fileId = `${file.name}-${file.size}-${file.lastModified}`;

                    // Skip files already processed or modified at/before driveResetAt
                    if (processedIds.includes(fileId)) continue;
                    if (resetAt && new Date(file.lastModified) <= resetAt) continue;

                    const docId = crypto.randomUUID();

                    fileCount++;
                    updatedProcessedIds.push(fileId);

                    // Handle PDF sync parsing (Default)
                    if (file.name.endsWith(".pdf")) {
                        try {
                            const text = await extractTextFromPDF(file);
                            const parsedItems = parseTransactionsFromPDFText(text, file.name);
                            const syncItems = parsedItems.map(item => ({
                                ...item,
                                account: "Folder Import",
                                source: "google-drive", // flag source as drive imports
                                documentId: docId
                            }));

                            if (syncItems.length > 0) {
                                const res = await handleAddTransactions(syncItems, { mode: "import" });
                                newTxCount += res.inserted;
                                duplicateCount += res.duplicates;
                            }
                        } catch (err) {
                            console.error("Error parsing PDF during sync:", err);
                            showToast(`Failed to parse PDF "${file.name}": ${err.message}`, "error");
                        }
                    }
                    // Handle CSV sync parsing
                    else if (file.name.endsWith(".csv")) {
                        const text = await file.text();
                        const rows = parseCSVText(text);
                        if (rows.length >= 2) {
                            // Parse with basic heuristic columns
                            const headers = rows[0].map(h => String(h).toLowerCase());
                            const dateIdx = headers.findIndex(h => h.includes("date"));
                            const descIdx = headers.findIndex(h => h.includes("desc") || h.includes("merchant") || h.includes("payee") || h.includes("name"));
                            const amtIdx = headers.findIndex(h => h.includes("amount") || h.includes("debit") || h.includes("credit"));

                            if (dateIdx !== -1 && descIdx !== -1 && amtIdx !== -1) {
                                const syncItems = [];
                                for (let i = 1; i < rows.length; i++) {
                                    const r = rows[i];
                                    const dateVal = r[dateIdx];
                                    const descVal = r[descIdx];
                                    const amtVal = parseFloat(String(r[amtIdx] || "0").replace(/[^\d.-]/g, ''));

                                    if (dateVal && descVal && !isNaN(amtVal)) {
                                        syncItems.push({
                                            date: new Date(dateVal).toISOString().split('T')[0],
                                            merchant: descVal,
                                            amount: Math.abs(amtVal),
                                            type: amtVal >= 0 ? "income" : "expense",
                                            account: "Folder Import",
                                            source: "google-drive", // flag source as drive imports
                                            documentId: docId
                                        });
                                    }
                                }

                                if (syncItems.length > 0) {
                                    const res = await handleAddTransactions(syncItems, { mode: "import" });
                                    newTxCount += res.inserted;
                                    duplicateCount += res.duplicates;
                                }
                            }
                        }
                    }

                    // Store Document vault metadata (Section 17.2/4.2) - omit fileData Blob to save storage
                    await saveDocumentInDB({
                        id: docId,
                        filename: file.name,
                        mimeType: file.type || "application/octet-stream",
                        size: file.size,
                        status: "stored",
                        source: "google-drive",
                        createdAt: new Date(file.lastModified).toISOString()
                    });
                }
            }

            // Save settings changes
            await updateSetting("processedFileIds", updatedProcessedIds);
            await updateSetting("driveSyncMetadata", {
                lastSync: new Date().toISOString(),
                folderName: dirHandle.name,
                filesScanned: fileCount,
                transactionsAdded: newTxCount,
                duplicatesSkipped: duplicateCount
            });

            showToast(`Sync Complete! Added ${newTxCount} transactions, stored ${fileCount} files.`);
            loadState();
        } catch (e) {
            if (e.name !== "AbortError") {
                showToast("Folder sync cancelled or failed", "error");
            }
        }
    };

    if (loading) {
        return (
            <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F9FAFB' }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #6558D3', borderRadius: '50%', width: '40px', height: '40px', animation: 'spin 1s linear infinite', margin: '0 auto 16px auto' }}></div>
                    <p style={{ color: '#6B7280', fontWeight: 500 }}>Decrypting Local Financials Vault...</p>
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    // Shared computed values based on period selection
    const filteredTx = filterTransactionsByPeriod(transactions, activePeriod, calcCustomStart, calcCustomEnd);

    // Suggested recurring lists derived from algorithm
    const suggestedRecurring = detectRecurringTransactions(transactions, rules, settings.dismissedPatterns || [], settings.recurring || []);

    return (
        <div className="app-container">

            {/* Floating Toast Notification Containers */}
            <div className="toast-container">
                {toasts.map(t => (
                    <div key={t.id} className={`toast ${t.type}`}>
                        <Icon name={t.type === "error" ? "alert" : "check"} />
                        <span>{t.message}</span>
                    </div>
                ))}
            </div>

            {/* Left Sidebar - Desktop Navigation */}
            <aside className={`sidebar ${isSidebarCollapsed ? "collapsed" : ""}`}>
                <div className="sidebar-brand" title="Financials">
                    <Icon name="transactions" currency={settings.currency} />
                    <span className="sidebar-label">Financials</span>
                </div>
                <ul className="sidebar-nav">
                    {[
                        { id: "dashboard", label: "Dashboard", icon: "home" },
                        { id: "recurring", label: "Recurring", icon: "recurring" },
                        { id: "transactions", label: "Transactions", icon: "transactions" },
                        { id: "review", label: "Review", icon: "alert", badge: needsReviewCount },
                        { id: "networth", label: "Net Worth", icon: "networth" },
                        { id: "budgets", label: "Budgets", icon: "budgets" },
                        { id: "goals", label: "Goals", icon: "goals" },
                        { id: "reports", label: "Reports", icon: "subscriptions" },
                        { id: "documents", label: "Documents", icon: "documents" },
                        { id: "rules", label: "Rules", icon: "rules" },
                        { id: "settings", label: "Settings", icon: "settings" }
                    ].map(item => (
                        <li
                            key={item.id}
                            title={item.label}
                            className={`sidebar-nav-item ${activePage === item.id ? "active" : ""}`}
                            onClick={() => handleNavigatePage(item.id)}
                        >
                            <Icon name={item.icon} currency={settings.currency} />
                            <span className="sidebar-label">{item.label}</span>
                            {item.badge > 0 && <span className="nav-badge">{item.badge > 99 ? "99+" : item.badge}</span>}
                        </li>
                    ))}
                </ul>
                {/* Cloud Account & Sidebar Bottom Controls */}
                <div style={{
                    padding: isSidebarCollapsed ? '12px 6px' : '12px 14px',
                    borderTop: '1px solid var(--border-color)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                    alignItems: isSidebarCollapsed ? 'center' : 'stretch'
                }}>
                    <div style={{ display: 'flex', gap: '6px', flexDirection: isSidebarCollapsed ? 'column' : 'row' }}>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={privacy.togglePrivacy}
                            title={privacy.privacyMode ? "Show amounts" : "Hide amounts (for shared screens)"}
                            aria-pressed={privacy.privacyMode}
                            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                        >
                            <span>{privacy.privacyMode ? "👁️" : "🙈"}</span>
                            {!isSidebarCollapsed && <span>{privacy.privacyMode ? "Show" : "Hide"}</span>}
                        </button>
                        {privacy.lockEnabled && (
                            <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={privacy.lockNow}
                                title="Lock the app now"
                                style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                            >
                                <span>🔒</span>
                                {!isSidebarCollapsed && <span>Lock</span>}
                            </button>
                        )}
                    </div>
                    {currentUser ? (
                        <div style={{
                            background: 'var(--bg-color, #F8FAFC)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '8px',
                            padding: isSidebarCollapsed ? '6px' : '8px 10px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: isSidebarCollapsed ? 'center' : 'space-between',
                            gap: '6px'
                        }}>
                            {!isSidebarCollapsed && (
                                <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                    <div style={{ fontSize: '0.73rem', fontWeight: 700, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <span>☁️</span>
                                        {cloudSyncStatus === "locked" ? (
                                            <span
                                                role="button"
                                                onClick={() => setShowAuthModal(true)}
                                                title="Your encryption key isn't available in this tab. Sign in again to resume cloud sync."
                                                style={{ cursor: 'pointer', color: 'var(--warning)', textDecoration: 'underline' }}
                                            >
                                                Sync paused: sign in
                                            </span>
                                        ) : (
                                            <span>{cloudSyncStatus === "syncing" ? "Syncing..." : cloudSyncStatus === "synced" ? "Synced ✓" : cloudSyncStatus === "error" ? "Sync failed" : "Cloud Account"}</span>
                                        )}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis' }} title={currentUser.email}>
                                        {currentUser.email}
                                    </div>
                                </div>
                            )}
                            <button
                                type="button"
                                onClick={async () => {
                                    try {
                                        await signOutUser();
                                        setCurrentUser(null);
                                        showToast("Signed out successfully", "info");
                                    } catch (err) {
                                        showToast("Sign out failed", "error");
                                    }
                                }}
                                title="Sign Out"
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    fontSize: '0.8rem',
                                    padding: '4px'
                                }}
                            >
                                🚪
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            className="btn btn-outline"
                            onClick={() => setShowAuthModal(true)}
                            title="Sign In or Create Account"
                            style={{
                                width: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '6px',
                                padding: isSidebarCollapsed ? '8px 0' : '8px 10px',
                                fontSize: '0.82rem',
                                borderRadius: '8px',
                                border: '1px solid var(--primary)',
                                color: 'var(--primary)',
                                background: 'transparent',
                                cursor: 'pointer'
                            }}
                        >
                            <span>☁️</span>
                            {!isSidebarCollapsed && <span style={{ fontWeight: 600 }}>Cloud Sign In</span>}
                        </button>
                    )}
                </div>
                <button
                    className="sidebar-toggle-btn"
                    onClick={toggleSidebar}
                    title={isSidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                    <Icon name={isSidebarCollapsed ? "chevronRight" : "chevronLeft"} />
                </button>
            </aside>

            {/* Mobile Navigation Header */}
            <div className="mobile-topbar">
                <div className="sidebar-brand" style={{ margin: 0, padding: 0 }}>
                    <Icon name="transactions" currency={settings.currency} />
                    <span style={{ fontSize: '1.15rem' }}>Financials</span>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => setShowAuthModal(true)}
                        title={currentUser ? currentUser.email : "Cloud Account"}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        <span>☁️</span>
                    </button>
                    {activePage === "documents" && (
                        <button className="btn btn-secondary btn-sm" onClick={handleSyncLocalFolder} title="Sync Folder">
                            <Icon name="sync" />
                        </button>
                    )}
                    {(activePage === "transactions" || activePage === "documents") && (
                        <button className="btn btn-secondary btn-sm" onClick={() => setShowImportModal(true)} title="Import PDF/CSV">
                            <Icon name="download" />
                        </button>
                    )}
                    {activePage === "transactions" && (
                        <button className="btn btn-primary btn-sm" onClick={() => setShowAddEntryModal(true)} title="Add Transaction">
                            <Icon name="plus" />
                        </button>
                    )}
                    {["networth", "recurring", "budgets", "goals", "rules"].includes(activePage) && (
                        <button className="btn btn-primary btn-sm" onClick={() => setSubpageActionSignal(s => s + 1)} title="Add">
                            <Icon name="plus" />
                        </button>
                    )}
                </div>
            </div>

            {/* Mobile Bottom Navigation bar (touch target 44px friendly) */}
            <nav className="mobile-bottom-nav">
                <div className="mobile-nav-scroll">
                    {[
                        { id: "dashboard", label: "Dashboard", icon: "home" },
                        { id: "recurring", label: "Recurring", icon: "recurring" },
                        { id: "transactions", label: "Txns", icon: "transactions" },
                        { id: "review", label: "Review", icon: "alert", badge: needsReviewCount },
                        { id: "networth", label: "Net Worth", icon: "networth" },
                        { id: "budgets", label: "Budgets", icon: "budgets" },
                        { id: "goals", label: "Goals", icon: "goals" },
                        { id: "reports", label: "Reports", icon: "subscriptions" },
                        { id: "documents", label: "Docs", icon: "documents" },
                        { id: "rules", label: "Rules", icon: "rules" },
                        { id: "settings", label: "Settings", icon: "settings" }
                    ].map(item => (
                        <div
                            key={item.id}
                            className={`mobile-nav-item ${activePage === item.id ? "active" : ""}`}
                            onClick={() => handleNavigatePage(item.id)}
                        >
                            <Icon name={item.icon} currency={settings.currency} />
                            <span>{item.label}</span>
                            {item.badge > 0 && <span className="nav-badge nav-badge-mobile">{item.badge > 99 ? "99+" : item.badge}</span>}
                        </div>
                    ))}
                    <div className="mobile-nav-item" onClick={privacy.togglePrivacy} role="button" aria-pressed={privacy.privacyMode}>
                        <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{privacy.privacyMode ? "👁️" : "🙈"}</span>
                        <span>{privacy.privacyMode ? "Show" : "Hide"}</span>
                    </div>
                    {privacy.lockEnabled && (
                        <div className="mobile-nav-item" onClick={privacy.lockNow} role="button">
                            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>🔒</span>
                            <span>Lock</span>
                        </div>
                    )}
                </div>
            </nav>

            {/* Main Content Layout View */}
            <div className={`main-wrapper ${isSidebarCollapsed ? "sidebar-collapsed" : ""}`}>

                {/* Header top sticky bar - Desktop */}
                <header className="topbar" style={["transactions", "dashboard", "recurring", "networth"].includes(activePage) ? { height: 'auto', minHeight: '115px', boxSizing: 'border-box', padding: '12px 32px' } : {}}>
                    {activePage === "dashboard" && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                            {/* Line 1: All the tiles */}
                            <div className="topbar-tiles-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', width: '100%', alignItems: 'center' }}>
                                {(() => {
                                    const expenseTx = filteredTx.filter(t => t.type === "expense");
                                    const incomeTx = filteredTx.filter(t => t.type === "income");

                                    const rawNetworthItems = settings.networthItems || [];
                                    const networthItems = rawNetworthItems.filter(it => it.includeInNetWorth !== false);
                                    const hasLedger = rawNetworthItems.length > 0;
                                    const recurringList = settings.recurring || [];
                                    const billInstances = settings.billInstances || [];
                                    const ledgerCash = networthItems
                                        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "balance")
                                        .reduce((s, it) => s + getEffectiveNetWorthItemValue(it, recurringList, billInstances), 0);
                                    const ledgerAssets = networthItems
                                        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "asset")
                                        .reduce((s, it) => s + getEffectiveNetWorthItemValue(it, recurringList, billInstances), 0);
                                    const ledgerInvestments = networthItems
                                        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "investment")
                                        .reduce((s, it) => s + getEffectiveNetWorthItemValue(it, recurringList, billInstances), 0);
                                    const ledgerLiabilities = networthItems
                                        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "liability")
                                        .reduce((s, it) => s + Math.abs(getEffectiveNetWorthItemValue(it, recurringList, billInstances)), 0);

                                    const assets = hasLedger ? (ledgerCash + ledgerAssets + ledgerInvestments) : (settings.assetsTotal || 0);
                                    const liabilities = hasLedger ? ledgerLiabilities : (settings.liabilitiesTotal || 0);
                                    const netWorthVal = assets - liabilities;
                                    const netWorthReady = hasLedger || settings.netWorthConfigured;

                                    const incomeSum = incomeTx.reduce((s, t) => s + t.amount, 0);
                                    const spendingSum = expenseTx.reduce((s, t) => s + t.amount, 0);
                                    const savingsRate = incomeSum > 0 ? (((incomeSum - spendingSum) / incomeSum) * 100) : 0;

                                    const fmt = (v) => formatCurrencyVal(v, settings.currency || "INR");

                                    const tiles = [
                                        { id: 'networth', title: 'Net Worth', displayVal: netWorthReady ? fmt(netWorthVal) : 'Not set', icon: 'networth', color: netWorthVal < 0 ? 'var(--danger)' : 'var(--text-main)', iconClass: netWorthVal < 0 ? 'danger' : 'primary', onClick: () => handleNavigatePage('networth'), cursor: 'pointer' },
                                        { id: 'income', title: 'Inflow', displayVal: fmt(incomeSum), icon: 'arrowDown', color: 'var(--success)', iconClass: 'success' },
                                        { id: 'expenses', title: 'Outflow', displayVal: fmt(spendingSum), icon: 'arrowUp', color: 'var(--warning)', iconClass: 'warning' },
                                        { id: 'savings', title: 'Savings Rate', displayVal: `${savingsRate.toFixed(1)}%`, icon: 'goals', color: savingsRate >= 0 ? 'var(--info)' : 'var(--danger)', iconClass: 'info' }
                                    ];

                                    return tiles.map((t, idx) => (
                                        <div
                                            key={t.id || idx}
                                            className="card"
                                            style={{
                                                padding: '8px 14px',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--card-bg)',
                                                boxShadow: 'var(--shadow-sm)',
                                                margin: 0,
                                                cursor: t.onClick ? 'pointer' : 'default'
                                            }}
                                            onClick={t.onClick}
                                            title={t.onClick ? "Click to view Net Worth ledger" : undefined}
                                        >
                                            <div className="card-header" style={{ marginBottom: '2px' }}>
                                                <span className="card-title" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t.title}</span>
                                                <div className={`card-icon ${t.iconClass}`} style={{ width: '22px', height: '22px', padding: '2px', borderRadius: '6px' }}>
                                                    <Icon name={t.icon} currency={settings.currency} />
                                                </div>
                                            </div>
                                            <div className="card-value" style={{ fontSize: '1.05rem', fontWeight: 700, color: t.color, lineHeight: 1.2 }}>
                                                {t.displayVal}
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>

                            {/* Line 2: Period (center aligned) */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                                {/* Unified Date Selector controls */}
                                <div className="unified-date-selector" style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', background: 'var(--card-bg)', padding: '3px 8px', height: '36px', borderRadius: '8px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', boxSizing: 'border-box', width: '403px', minWidth: '403px', maxWidth: '403px' }}>
                                    {/* Left: Start Date Picker */}
                                    <div
                                        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                                        onClick={(e) => {
                                            const inputEl = e.currentTarget.querySelector('input[type="date"]');
                                            if (inputEl) {
                                                try {
                                                    if (inputEl.showPicker) inputEl.showPicker();
                                                    else inputEl.focus();
                                                } catch (err) { }
                                            }
                                        }}
                                    >
                                        <div className="form-control" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', padding: '2px 8px', height: '28px', cursor: 'pointer', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', whiteSpace: 'nowrap', width: '115px', minWidth: '115px', maxWidth: '115px' }}>
                                            <span style={{ fontWeight: 500 }}>{formatDate(displayStartDate, settings.dateFormat)}</span>
                                        </div>
                                        <input
                                            type="date"
                                            value={displayStartDate}
                                            onChange={(e) => handleStartDateChange(e.target.value)}
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                                            title="Start Date"
                                        />
                                    </div>

                                    {/* Center: Selected Period Selector */}
                                    <ModernDateFilterPicker
                                        value={normPeriodKey}
                                        onChange={handleUnifiedPeriodChange}
                                    />

                                    {/* Right: End Date Picker */}
                                    <div
                                        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                                        onClick={(e) => {
                                            const inputEl = e.currentTarget.querySelector('input[type="date"]');
                                            if (inputEl) {
                                                try {
                                                    if (inputEl.showPicker) inputEl.showPicker();
                                                    else inputEl.focus();
                                                } catch (err) { }
                                            }
                                        }}
                                    >
                                        <div className="form-control" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', padding: '2px 8px', height: '28px', cursor: 'pointer', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', whiteSpace: 'nowrap', width: '115px', minWidth: '115px', maxWidth: '115px' }}>
                                            <span style={{ fontWeight: 500 }}>{formatDate(displayEndDate, settings.dateFormat)}</span>
                                        </div>
                                        <input
                                            type="date"
                                            value={displayEndDate}
                                            onChange={(e) => handleEndDateChange(e.target.value)}
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                                            title="End Date"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                    {activePage === "networth" && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                            {/* Line 1: Summary Tiles */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', width: '100%', alignItems: 'center' }}>
                                {(() => {
                                    const nwItems = (settings.networthItems || []).filter(it => it.includeInNetWorth !== false);
                                    const nwRecurring = settings.recurring || [];
                                    const nwBillInstances = settings.billInstances || [];
                                    const nwCash = nwItems
                                        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "balance")
                                        .reduce((s, it) => s + getEffectiveNetWorthItemValue(it, nwRecurring, nwBillInstances), 0);
                                    const nwAssets = nwItems
                                        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "asset")
                                        .reduce((s, it) => s + getEffectiveNetWorthItemValue(it, nwRecurring, nwBillInstances), 0);
                                    const nwInvestments = nwItems
                                        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "investment")
                                        .reduce((s, it) => s + getEffectiveNetWorthItemValue(it, nwRecurring, nwBillInstances), 0);
                                    const nwLiabilities = nwItems
                                        .filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "liability")
                                        .reduce((s, it) => s + Math.abs(getEffectiveNetWorthItemValue(it, nwRecurring, nwBillInstances)), 0);
                                    const nwTotal = nwCash + nwAssets + nwInvestments - nwLiabilities;
                                    const fmt = (v) => formatCurrencyVal(v, settings.currency || "INR");

                                    const isCashNegative = nwCash < 0;
                                    const isTotalNegative = nwTotal < 0;

                                    const tiles = [
                                        { id: 'all', title: 'Net Worth', val: nwTotal, icon: 'networth', color: isTotalNegative ? 'var(--danger)' : 'var(--text-main)', border: isTotalNegative ? 'var(--danger)' : 'var(--primary)', bg: isTotalNegative ? 'rgba(239, 68, 68, 0.04)' : 'rgba(99, 102, 241, 0.04)', shadow: isTotalNegative ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)', iconClass: isTotalNegative ? 'danger' : 'primary' },
                                        { id: 'assets', title: 'Fixed Assets', val: nwAssets, icon: 'home', color: nwAssets < 0 ? 'var(--danger)' : 'var(--primary)', border: nwAssets < 0 ? 'var(--danger)' : 'var(--primary)', bg: nwAssets < 0 ? 'rgba(239, 68, 68, 0.04)' : 'rgba(99, 102, 241, 0.04)', shadow: nwAssets < 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)', iconClass: nwAssets < 0 ? 'danger' : 'primary' },
                                        { id: 'investments', title: 'Investments', val: nwInvestments, icon: 'goals', color: nwInvestments < 0 ? 'var(--danger)' : 'var(--info)', border: nwInvestments < 0 ? 'var(--danger)' : 'var(--info)', bg: nwInvestments < 0 ? 'rgba(239, 68, 68, 0.04)' : 'rgba(59, 130, 246, 0.04)', shadow: nwInvestments < 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)', iconClass: nwInvestments < 0 ? 'danger' : 'info' },
                                        { id: 'cash', title: 'Bank & Cash', val: nwCash, icon: 'arrowDown', color: isCashNegative ? 'var(--danger)' : 'var(--success)', border: isCashNegative ? 'var(--danger)' : 'var(--success)', bg: isCashNegative ? 'rgba(239, 68, 68, 0.04)' : 'rgba(16, 185, 129, 0.04)', shadow: isCashNegative ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)', iconClass: isCashNegative ? 'danger' : 'success' },
                                        { id: 'liabilities', title: 'Liabilities', val: nwLiabilities, icon: 'arrowUp', color: 'var(--danger)', border: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.04)', shadow: 'rgba(239, 68, 68, 0.15)', iconClass: 'warning' }
                                    ];

                                    return tiles.map(t => {
                                        const isSelected = networthSectionFilter === t.id;
                                        return (
                                            <div
                                                key={t.id}
                                                className="card"
                                                style={{
                                                    padding: '8px 14px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s ease',
                                                    border: isSelected ? `2px solid ${t.border}` : '1px solid var(--border-color)',
                                                    background: isSelected ? t.bg : 'var(--card-bg)',
                                                    boxShadow: isSelected ? `0 4px 12px ${t.shadow}` : 'var(--shadow-sm)',
                                                    transform: isSelected ? 'translateY(-1px)' : 'none',
                                                    margin: 0
                                                }}
                                                onClick={() => setNetworthSectionFilter(t.id)}
                                                title={`Click to filter ${t.title}`}
                                            >
                                                <div className="card-header" style={{ marginBottom: '2px' }}>
                                                    <span className="card-title" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t.title}</span>
                                                    <div className={`card-icon ${t.iconClass}`} style={{ width: '22px', height: '22px', padding: '2px', borderRadius: '6px' }}>
                                                        <Icon name={t.icon} />
                                                    </div>
                                                </div>
                                                <div className="card-value" style={{ fontSize: '1.05rem', fontWeight: 700, color: t.color, lineHeight: 1.2 }}>
                                                    {fmt(t.val)}
                                                </div>
                                            </div>
                                        );
                                    });
                                })()}
                            </div>

                            {/* Line 2: Section filter status, collapse all toggle & Add ledger entry */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', width: '100%', flexWrap: 'wrap' }}>
                                {(() => {
                                    const items = settings.networthItems || [];
                                    const cashCount = items.filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "balance").length;
                                    const assetCount = items.filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "asset").length;
                                    const investmentCount = items.filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "investment").length;
                                    const liabilityCount = items.filter(it => (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "liability").length;
                                    const allSectionKeys = ["assets", "investments", "cash", "liabilities", ...NET_WORTH_GROUPS.map(g => g.key)];
                                    const isAllCollapsed = allSectionKeys.length > 0 && allSectionKeys.every(k => networthCollapsed[k] !== false);

                                    return (
                                        <React.Fragment>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)' }}>
                                                <span>
                                                    {networthSectionFilter === 'all' && `Showing All Sections (${items.length} total entries)`}
                                                    {networthSectionFilter === 'cash' && `Showing Cash & Bank Balances (${cashCount} entries)`}
                                                    {networthSectionFilter === 'assets' && `Showing Fixed Assets (${assetCount} entries)`}
                                                    {networthSectionFilter === 'investments' && `Showing Investments (${investmentCount} entries)`}
                                                    {networthSectionFilter === 'liabilities' && `Showing Debt & Liabilities (${liabilityCount} entries)`}
                                                </span>
                                                {networthSectionFilter !== 'all' && (
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        style={{ fontSize: '0.75rem', padding: '2px 10px', borderRadius: '12px', fontWeight: 500 }}
                                                        onClick={() => setNetworthSectionFilter('all')}
                                                    >
                                                        Show All
                                                    </button>
                                                )}
                                            </div>

                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <button
                                                    className="btn btn-secondary btn-sm"
                                                    style={{ fontSize: '0.8rem', padding: '6px 14px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontWeight: 600, width: '115px', minWidth: '115px', maxWidth: '115px' }}
                                                    onClick={() => {
                                                        const nextState = {};
                                                        const targetState = !isAllCollapsed;
                                                        allSectionKeys.forEach(k => { nextState[k] = targetState; });
                                                        setNetworthCollapsed(nextState);
                                                    }}
                                                >
                                                    <span>{isAllCollapsed ? "Expand All" : "Collapse All"}</span>
                                                </button>
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    style={{ padding: '6px 14px', fontSize: '0.82rem' }}
                                                    onClick={() => setSubpageActionSignal(s => s + 1)}
                                                >
                                                    + Add Ledger Entry
                                                </button>
                                            </div>
                                        </React.Fragment>
                                    );
                                })()}
                            </div>
                        </div>
                    )}
                    {activePage === "recurring" && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}>
                            {/* Line 1: Tiles */}
                            <div className="topbar-tiles-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', width: '100%', alignItems: 'center' }}>
                                {(() => {
                                    const confirmedList = (settings?.recurring || []).filter(Boolean);
                                    const now = new Date();
                                    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                                    const activeList = confirmedList.filter(c => c && (!c.endDate || String(c.endDate) >= todayStr));

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

                                    const getPeriodRange = () => calculatePeriodDateRange(calcPeriod || "next_6_months", new Date(), calcCustomStart, calcCustomEnd);

                                    const getPeriodItemAmount = (item) => {
                                        if (!item || item.excludeFromMonthlyCalculations) return 0;
                                        const { pStartStr, pEndStr } = getPeriodRange();
                                        const count = getOccurrencesInPeriod(item, pStartStr, pEndStr);
                                        const amt = Number(item.amount || 0);
                                        return (isNaN(amt) ? 0 : amt) * (isNaN(count) ? 0 : count);
                                    };

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

                                    const fmt = (v) => formatCurrencyVal(v, settings?.currency || "INR");

                                    const tiles = [
                                        { title: 'Recurring Inflow', displayVal: `+${fmt(confirmedPeriodInflow)}`, icon: 'arrowDown', color: 'var(--success)', iconClass: 'success' },
                                        { title: 'Recurring Outflow', displayVal: `−${fmt(confirmedPeriodOutflow)}`, icon: 'arrowUp', color: 'var(--danger)', iconClass: 'warning' },
                                        { title: 'Net Cash Surplus', displayVal: `${netPeriodSurplus >= 0 ? "+" : ""}${fmt(netPeriodSurplus)}`, icon: 'networth', color: netPeriodSurplus >= 0 ? 'var(--success)' : 'var(--danger)', iconClass: 'primary' },
                                        { title: 'Monthly Outflow Rate', displayVal: fmt(confirmedMonthlyOutflow), icon: 'recurring', color: 'var(--primary)', iconClass: 'info' }
                                    ];

                                    return tiles.map((t, idx) => (
                                        <div
                                            key={idx}
                                            className="card"
                                            style={{
                                                padding: '8px 14px',
                                                border: '1px solid var(--border-color)',
                                                background: 'var(--card-bg)',
                                                boxShadow: 'var(--shadow-sm)',
                                                margin: 0
                                            }}
                                        >
                                            <div className="card-header" style={{ marginBottom: '2px' }}>
                                                <span className="card-title" style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t.title}</span>
                                                <div className={`card-icon ${t.iconClass}`} style={{ width: '22px', height: '22px', padding: '2px', borderRadius: '6px' }}>
                                                    <Icon name={t.icon} />
                                                </div>
                                            </div>
                                            <div className="card-value" style={{ fontSize: '1.05rem', fontWeight: 700, color: t.color, lineHeight: 1.2 }}>
                                                {t.displayVal}
                                            </div>
                                        </div>
                                    ));
                                })()}
                            </div>

                            {/* Line 2: Recurring overview, Period, Add recurring item */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', width: '100%', flexWrap: 'nowrap' }}>
                                {/* Recurring Overview */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-main)', flex: '0 0 auto' }}>
                                    <span>Recurring Overview</span>
                                    <span className="badge badge-income" style={{ fontSize: '0.78rem' }}>
                                        {(settings.recurring || []).filter(c => {
                                            const now = new Date();
                                            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                                            return !c.endDate || c.endDate >= todayStr;
                                        }).length} Active
                                    </span>
                                </div>

                                {/* Unified Period Selector - Center Aligned */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', background: 'var(--card-bg)', padding: '3px 8px', height: '36px', borderRadius: '8px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', boxSizing: 'border-box', width: '403px', minWidth: '403px', maxWidth: '403px' }}>
                                        <div
                                            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                                            onClick={(e) => {
                                                const inputEl = e.currentTarget.querySelector('input[type="date"]');
                                                if (inputEl) {
                                                    try {
                                                        if (inputEl.showPicker) inputEl.showPicker();
                                                        else inputEl.focus();
                                                    } catch (err) { }
                                                }
                                            }}
                                        >
                                            <div className="form-control" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', padding: '2px 8px', height: '28px', cursor: 'pointer', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', whiteSpace: 'nowrap', width: '115px', minWidth: '115px', maxWidth: '115px' }}>
                                                <span style={{ fontWeight: 500 }}>{formatDate(displayStartDate, settings.dateFormat)}</span>
                                            </div>
                                            <input
                                                type="date"
                                                value={displayStartDate}
                                                onChange={(e) => handleStartDateChange(e.target.value)}
                                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                                                title="Start Date"
                                            />
                                        </div>

                                        <ModernDateFilterPicker
                                            value={normPeriodKey}
                                            onChange={handleUnifiedPeriodChange}
                                        />

                                        <div
                                            style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                                            onClick={(e) => {
                                                const inputEl = e.currentTarget.querySelector('input[type="date"]');
                                                if (inputEl) {
                                                    try {
                                                        if (inputEl.showPicker) inputEl.showPicker();
                                                        else inputEl.focus();
                                                    } catch (err) { }
                                                }
                                            }}
                                        >
                                            <div className="form-control" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', padding: '2px 8px', height: '28px', cursor: 'pointer', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', whiteSpace: 'nowrap', width: '115px', minWidth: '115px', maxWidth: '115px' }}>
                                                <span style={{ fontWeight: 500 }}>{formatDate(displayEndDate, settings.dateFormat)}</span>
                                            </div>
                                            <input
                                                type="date"
                                                value={displayEndDate}
                                                onChange={(e) => handleEndDateChange(e.target.value)}
                                                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                                                title="End Date"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Right-aligned Actions */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto' }}>
                                    {/* Expand / Collapse All Button - Fixed width so size doesn't change */}
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ height: '36px', width: '125px', minWidth: '125px', maxWidth: '125px', padding: '0 10px', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.84rem', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '8px', whiteSpace: 'nowrap' }}
                                        onClick={() => setRecurringCollapseSignal(s => s + 1)}
                                        title={recurringIsAnyCollapsed ? "Expand all sections" : "Collapse all sections"}
                                    >
                                        <span>{recurringIsAnyCollapsed ? "📂" : "📁"}</span>
                                        <span>{recurringIsAnyCollapsed ? "Expand All" : "Collapse All"}</span>
                                    </button>

                                    {/* Add Recurring Item Button */}
                                    <button
                                        className="btn btn-primary"
                                        style={{ height: '36px', minWidth: '140px', padding: '0 14px', flex: '0 0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                                        onClick={() => setSubpageActionSignal(s => s + 1)}
                                    >
                                        <Icon name="plus" />
                                        <span>Add Recurring Item</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                    {activePage === "transactions" && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                            {/* Row 1: Global search + date range + import + add */}
                            <div className="tx-topbar-row1" style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%' }}>
                                {/* Global search */}
                                <div style={{ position: 'relative', flex: 1, minWidth: '160px' }}>
                                    <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none', fontSize: '0.9rem' }}>🔍</span>
                                    <input
                                        type="text"
                                        className="form-control"
                                        style={{ height: '34px', fontSize: '0.84rem', padding: '4px 12px 4px 32px', width: '100%' }}
                                        placeholder="Search transactions..."
                                        value={txSearch}
                                        onChange={(e) => setTxSearch(e.target.value)}
                                    />
                                </div>

                                {/* Date range picker */}
                                <div className="unified-date-selector" style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'var(--card-bg)', padding: '3px 8px', height: '34px', borderRadius: '8px', border: '1px solid var(--border-color)', boxSizing: 'border-box', flexShrink: 0, width: '403px', minWidth: '403px', maxWidth: '403px' }}>
                                    {/* Start Date */}
                                    <div
                                        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                                        onClick={(e) => {
                                            const inputEl = e.currentTarget.querySelector('input[type="date"]');
                                            if (inputEl) { try { if (inputEl.showPicker) inputEl.showPicker(); else inputEl.focus(); } catch (err) { } }
                                        }}
                                    >
                                        <div className="form-control" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.79rem', padding: '2px 7px', height: '26px', cursor: 'pointer', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', whiteSpace: 'nowrap', width: '115px', minWidth: '115px', maxWidth: '115px' }}>
                                            <span style={{ fontWeight: 500 }}>{formatDate(displayStartDate, settings.dateFormat)}</span>
                                        </div>
                                        <input type="date" value={displayStartDate} onChange={(e) => handleStartDateChange(e.target.value)} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} title="Start Date" />
                                    </div>
                                    <ModernDateFilterPicker
                                        value={normPeriodKey}
                                        onChange={handleUnifiedPeriodChange}
                                    />
                                    {/* End Date */}
                                    <div
                                        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                                        onClick={(e) => {
                                            const inputEl = e.currentTarget.querySelector('input[type="date"]');
                                            if (inputEl) { try { if (inputEl.showPicker) inputEl.showPicker(); else inputEl.focus(); } catch (err) { } }
                                        }}
                                    >
                                        <div className="form-control" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.79rem', padding: '2px 7px', height: '26px', cursor: 'pointer', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', whiteSpace: 'nowrap', width: '115px', minWidth: '115px', maxWidth: '115px' }}>
                                            <span style={{ fontWeight: 500 }}>{formatDate(displayEndDate, settings.dateFormat)}</span>
                                        </div>
                                        <input type="date" value={displayEndDate} onChange={(e) => handleEndDateChange(e.target.value)} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} title="End Date" />
                                    </div>
                                </div>

                                {/* Type Filter */}
                                <select
                                    className="form-control"
                                    style={{ height: '34px', fontSize: '0.83rem', padding: '0 8px', flexShrink: 0, width: '120px' }}
                                    value={txTypeFilter}
                                    onChange={(e) => setTxTypeFilter(e.target.value)}
                                    title="Filter by Transaction Type"
                                >
                                    <option value="all">All Types</option>
                                    <option value="expense">Outflow</option>
                                    <option value="income">Inflow</option>
                                    <option value="neutral">Neutral</option>
                                </select>

                                {/* Import */}
                                <button className="btn btn-secondary" style={{ height: '34px', padding: '0 12px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.83rem' }} onClick={() => setShowImportModal(true)}>
                                    <Icon name="download" />
                                    <span>Import</span>
                                </button>

                                {/* Add Transaction */}
                                <button className="btn btn-primary" style={{ height: '34px', padding: '0 14px', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.83rem' }} onClick={() => setShowAddEntryModal(true)}>
                                    <Icon name="plus" />
                                    <span>Add Transaction</span>
                                </button>
                            </div>

                            {/* Row 2: Interactive column header bar */}
                            <div className="tx-column-headers-bar" style={{
                                display: 'grid',
                                gridTemplateColumns: '120px 1fr 160px 130px 150px 120px 110px 120px',
                                alignItems: 'center',
                                background: '#F9FAFB',
                                border: '1px solid var(--border-color)',
                                borderRadius: '10px',
                                padding: '8px 18px',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                color: 'var(--text-muted)',
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                userSelect: 'none'
                            }}>
                                {/* DATE */}
                                <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => handleTxSort('date')}>
                                    <span style={{ color: txSortField === "date" ? 'var(--primary)' : 'inherit', fontWeight: txSortField === "date" ? 700 : 600 }}>Date</span>
                                    {renderSortIcon("date")}
                                </div>

                                {/* NARRATION */}
                                <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }} onClick={() => handleTxSort('narration')}>
                                    <span style={{ color: (txNarrationFilter || txSortField === 'narration') ? 'var(--primary)' : 'inherit', fontWeight: (txNarrationFilter || txSortField === 'narration') ? 700 : 600 }}>Narration</span>
                                    {txNarrationFilter && <span className="badge badge-info" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>Filtered</span>}
                                    {renderSortIcon("narration")}
                                </div>

                                {/* CATEGORY */}
                                <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => handleTxSort('category')}>
                                    <span style={{ color: (txCategoryFilter !== 'all' || txSortField === 'category') ? 'var(--primary)' : 'inherit', fontWeight: (txCategoryFilter !== 'all' || txSortField === 'category') ? 700 : 600 }}>Category</span>
                                    {txCategoryFilter !== 'all' && <span className="badge badge-info" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>Filtered</span>}
                                    {renderSortIcon("category")}
                                </div>

                                {/* ACCOUNT */}
                                <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => handleTxSort('account')}>
                                    <span style={{ color: (txAccountFilter !== 'all' || txSortField === 'account') ? 'var(--primary)' : 'inherit', fontWeight: (txAccountFilter !== 'all' || txSortField === 'account') ? 700 : 600 }}>Account</span>
                                    {txAccountFilter !== 'all' && <span className="badge badge-info" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>Filtered</span>}
                                    {renderSortIcon("account")}
                                </div>

                                {/* TAGS */}
                                <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => handleTxSort('tags')}>
                                    <span style={{ color: (txTagFilter !== 'all' || txSortField === 'tags') ? 'var(--primary)' : 'inherit', fontWeight: (txTagFilter !== 'all' || txSortField === 'tags') ? 700 : 600 }}>Tags</span>
                                    {txTagFilter !== 'all' && <span className="badge badge-info" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>Filtered</span>}
                                    {renderSortIcon("tags")}
                                </div>

                                {/* AMOUNT */}
                                <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => handleTxSort('amount')}>
                                    <span style={{ color: (txTypeFilter !== 'all' || txAmountFilter || txSortField === 'amount') ? 'var(--primary)' : 'inherit', fontWeight: (txTypeFilter !== 'all' || txAmountFilter || txSortField === 'amount') ? 700 : 600 }}>Amount</span>
                                    {(txTypeFilter !== 'all' || txAmountFilter) && <span className="badge badge-info" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>Filtered</span>}
                                    {renderSortIcon("amount")}
                                </div>

                                {/* NOTES */}
                                <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }} onClick={() => handleTxSort('notes')}>
                                    <span style={{ color: (txNotesFilter || txSortField === 'notes') ? 'var(--primary)' : 'inherit', fontWeight: (txNotesFilter || txSortField === 'notes') ? 700 : 600 }}>Notes</span>
                                    {txNotesFilter && <span className="badge badge-info" style={{ fontSize: '0.62rem', padding: '1px 5px' }}>Filtered</span>}
                                    {renderSortIcon("notes")}
                                </div>

                                {/* ACTIONS */}
                                <div style={{ textAlign: 'center' }}>Actions</div>
                            </div>
                        </div>
                    )}

                    {!["networth", "recurring", "dashboard", "transactions"].includes(activePage) && (
                        <div className="topbar-actions">
                            {activePage === "documents" && (
                                <>
                                    <button className="btn btn-secondary" onClick={handleSyncLocalFolder}>
                                        <Icon name="sync" />
                                        <span>Sync Folder</span>
                                    </button>
                                    <button className="btn btn-primary" onClick={() => setShowImportModal(true)}>
                                        <Icon name="download" />
                                        <span>Import PDF/CSV</span>
                                    </button>
                                </>
                            )}
                            {activePage === "budgets" && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'nowrap', background: 'var(--card-bg)', padding: '4px 8px', height: '40px', borderRadius: '8px', border: '1px solid var(--border-color)', boxShadow: '0 1px 3px rgba(0,0,0,0.04)', boxSizing: 'border-box', width: '403px', minWidth: '403px', maxWidth: '403px' }}>
                                    {/* Left: Start Date Picker */}
                                    <div
                                        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                                        onClick={(e) => {
                                            const inputEl = e.currentTarget.querySelector('input[type="date"]');
                                            if (inputEl) {
                                                try {
                                                    if (inputEl.showPicker) inputEl.showPicker();
                                                    else inputEl.focus();
                                                } catch (err) { }
                                            }
                                        }}
                                    >
                                        <div className="form-control" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', padding: '2px 10px', height: '30px', cursor: 'pointer', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', whiteSpace: 'nowrap', width: '115px', minWidth: '115px', maxWidth: '115px' }}>
                                            <span style={{ fontWeight: 500 }}>{formatDate(displayStartDate, settings.dateFormat)}</span>
                                        </div>
                                        <input
                                            type="date"
                                            value={displayStartDate}
                                            onChange={(e) => handleStartDateChange(e.target.value)}
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                                            title="Start Date"
                                        />
                                    </div>

                                    {/* Center: Selected Period Selector */}
                                    <ModernDateFilterPicker
                                        value={normPeriodKey}
                                        onChange={handleUnifiedPeriodChange}
                                    />

                                    {/* Right: End Date Picker */}
                                    <div
                                        style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
                                        onClick={(e) => {
                                            const inputEl = e.currentTarget.querySelector('input[type="date"]');
                                            if (inputEl) {
                                                try {
                                                    if (inputEl.showPicker) inputEl.showPicker();
                                                    else inputEl.focus();
                                                } catch (err) { }
                                            }
                                        }}
                                    >
                                        <div className="form-control" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', padding: '2px 10px', height: '30px', cursor: 'pointer', background: 'var(--card-bg)', border: '1px solid var(--border-color)', borderRadius: '6px', whiteSpace: 'nowrap', width: '115px', minWidth: '115px', maxWidth: '115px' }}>
                                            <span style={{ fontWeight: 500 }}>{formatDate(displayEndDate, settings.dateFormat)}</span>
                                        </div>
                                        <input
                                            type="date"
                                            value={displayEndDate}
                                            onChange={(e) => handleEndDateChange(e.target.value)}
                                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                                            title="End Date"
                                        />
                                    </div>
                                </div>
                            )}
                            {activePage === "budgets" && (
                                <button className="btn btn-primary" onClick={() => setSubpageActionSignal(s => s + 1)}>
                                    <Icon name="plus" />
                                    <span>Create Budget</span>
                                </button>
                            )}
                            {activePage === "goals" && (
                                <button className="btn btn-primary" onClick={() => setSubpageActionSignal(s => s + 1)}>
                                    <Icon name="plus" />
                                    <span>Create Goal</span>
                                </button>
                            )}
                            {activePage === "rules" && (
                                <button className="btn btn-primary" onClick={() => setSubpageActionSignal(s => s + 1)}>
                                    <Icon name="plus" />
                                    <span>Create Rule</span>
                                </button>
                            )}
                        </div>
                    )}
                </header>

                {/* Page Content viewport container */}
                <main className="content-body" style={activePage === 'transactions' ? { paddingTop: '12px', maxWidth: 'none' } : {}}>

                    {activePage === "dashboard" && backupInfo.show && (
                        <div role="status" style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', background: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E', borderRadius: '12px', padding: '10px 16px', marginBottom: '16px', fontSize: '0.85rem' }}>
                            <span style={{ fontSize: '1.2rem' }}>💾</span>
                            <span style={{ flex: '1 1 260px' }}>
                                <strong>Back up your data.</strong> {backupInfo.message} Browsers can clear site data without warning.
                            </span>
                            <button className="btn btn-primary btn-sm" onClick={handleBackupNow}>Download backup</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => handleNavigatePage("settings")}>Cloud / file sync</button>
                            <button className="btn btn-secondary btn-sm" onClick={() => { snoozeBackupBanner(7); setBackupTick(t => t + 1); }}>Remind me in a week</button>
                        </div>
                    )}                    <PageErrorBoundary key={activePage}>
                    {activePage === "dashboard" && (
                        <DashboardPage
                            transactions={filteredTx}
                            allTransactions={transactions}
                            settings={settings}
                            setActivePage={handleNavigatePage}
                            updateSetting={updateSetting}
                            loadState={loadState}
                            showToast={showToast}
                            setTxCategoryFilter={setTxCategoryFilter}
                        />
                    )}
                    {activePage === "transactions" && (
                        <TransactionsPage
                            transactions={filteredTx}
                            settings={settings}
                            onDelete={handleDeleteTransaction}
                            onPatch={handlePatchTransaction}
                            onAdd={handleAddTransactions}
                            onAddTag={handleSaveTag}
                            updateSetting={updateSetting}
                            tags={tags}
                            search={txSearch}
                            narrationFilter={txNarrationFilter}
                            categoryFilter={txCategoryFilter}
                            accountFilter={txAccountFilter}
                            tagFilter={txTagFilter}
                            amountFilter={txAmountFilter}
                            typeFilter={txTypeFilter}
                            notesFilter={txNotesFilter}
                            customFromDate={txCustomFromDate}
                            customToDate={txCustomToDate}
                            sortField={txSortField}
                            sortDirection={txSortDirection}
                            handleTxSort={handleTxSort}
                            renderSortIcon={renderSortIcon}
                        />
                    )}
                    {activePage === "networth" && (
                        <NetWorthPage
                            settings={settings}
                            updateSetting={updateSetting}
                            showToast={showToast}
                            setActivePage={handleNavigatePage}
                            subpageActionSignal={subpageActionSignal}
                            activeSectionFilter={networthSectionFilter}
                            setActiveSectionFilter={setNetworthSectionFilter}
                            collapsed={networthCollapsed}
                            setCollapsed={setNetworthCollapsed}
                        />
                    )}
                    {activePage === "recurring" && (
                        <RecurringPage
                            transactions={transactions}
                            settings={settings}
                            suggested={suggestedRecurring}
                            updateSetting={updateSetting}
                            showToast={showToast}
                            subpageActionSignal={subpageActionSignal}
                            selectedPeriod={calcPeriod}
                            setSelectedPeriod={setCalcPeriod}
                            customStart={calcCustomStart}
                            setCustomStart={setCalcCustomStart}
                            customEnd={calcCustomEnd}
                            setCustomEnd={setCalcCustomEnd}
                            displayStartDate={displayStartDate}
                            displayEndDate={displayEndDate}
                            normPeriodKey={normPeriodKey}
                            handleStartDateChange={handleStartDateChange}
                            handleEndDateChange={handleEndDateChange}
                            handleUnifiedPeriodChange={handleUnifiedPeriodChange}
                            PeriodSelectOptions={PeriodSelectOptions}
                            recurringCollapseSignal={recurringCollapseSignal}
                            setRecurringIsAnyCollapsed={setRecurringIsAnyCollapsed}
                        />
                    )}
                    {activePage === "budgets" && (
                        <BudgetsPage
                            transactions={filteredTx}
                            settings={settings}
                            updateSetting={updateSetting}
                            showToast={showToast}
                            subpageActionSignal={subpageActionSignal}
                            selectedPeriod={calcPeriod}
                            customStart={calcCustomStart}
                            customEnd={calcCustomEnd}
                        />
                    )}
                    {activePage === "goals" && (
                        <GoalsPage
                            settings={settings}
                            updateSetting={updateSetting}
                            showToast={showToast}
                            subpageActionSignal={subpageActionSignal}
                        />
                    )}
                    {activePage === "documents" && (
                        <DocumentsPage
                            documents={documents}
                            transactions={transactions}
                            settings={settings}
                            onSyncFolder={handleSyncLocalFolder}
                            showToast={showToast}
                            loadState={loadState}
                            onDeleteDocument={handleDeleteDocument}
                            updateSetting={updateSetting}
                        />
                    )}
                    {activePage === "reports" && (
                        <ReportsPage
                            transactions={transactions}
                            settings={settings}
                            updateSetting={updateSetting}
                            showToast={showToast}
                        />
                    )}
                    {activePage === "review" && (
                        <ReviewInbox
                            transactions={transactions}
                            settings={settings}
                            onBulkCategorize={handleBulkCategorize}
                            onSaveRule={handleSaveRule}
                            showToast={showToast}
                        />
                    )}
                    {activePage === "rules" && (
                        <RulesPage
                            rules={rules}
                            tags={tags}
                            settings={settings}
                            transactions={transactions}
                            onBulkCategorize={handleBulkCategorize}
                            showToast={showToast}
                            subpageActionSignal={subpageActionSignal}
                            onSaveRule={handleSaveRule}
                            onRunRule={handleRunRule}
                            onDeleteRule={handleDeleteRule}
                        />
                    )}
                    {activePage === "settings" && (
                        <SettingsPage
                            privacy={privacy}
                            settings={settings}
                            updateSetting={updateSetting}
                            tags={tags}
                            transactions={transactions}
                            rules={rules}
                            documents={documents}
                            onAddTag={handleSaveTag}
                            onDeleteTag={handleDeleteTag}
                            onUpdateTag={handleUpdateTag}
                            onUpdateTransactions={setTransactions}
                            loadState={loadState}
                            currentUser={currentUser}
                            cloudSyncStatus={cloudSyncStatus}
                            onOpenCloudAuth={() => setShowAuthModal(true)}
                            onSignOutCloud={async () => {
                                try {
                                    await signOutUser();
                                    setCurrentUser(null);
                                    showToast("Signed out successfully", "info");
                                } catch (err) {
                                    showToast("Sign out failed", "error");
                                }
                            }}
                            onWipe={async () => {
                                await wipeDatabase();
                                await loadState();
                                showToast("All financial data successfully erased", "warning");
                                setActivePage("dashboard");
                            }}
                            showToast={showToast}
                        />
                    )}
                    </PageErrorBoundary>
                </main>
            </div>

            {/* Global Add Entry Modal Form Component */}
            {showAddEntryModal && (
                <AddEntryModal
                    onClose={() => setShowAddEntryModal(false)}
                    onSave={async (item) => {
                        const res = await handleAddTransactions([item]);
                        if (res.inserted > 0) {
                            showToast("Transaction added successfully");
                        } else {
                            showToast("Transaction already exists (duplicate skipped)", "warning");
                        }
                        setShowAddEntryModal(false);
                    }}
                    settings={settings}
                    tags={tags}
                    onAddTag={saveTagInDB}
                />
            )}

            {/* Global Import File Modal Form Component */}
            {showImportModal && (
                <ImportFileModal
                    onClose={() => setShowImportModal(false)}
                    onCsvParsed={handleCsvParsed}
                    onPdfParsed={handlePdfParsed}
                    showToast={showToast}
                    settings={settings}
                    rules={rules}
                />
            )}

            {/* Cloud Auth / Account Modal */}
            <AuthModal
                isOpen={showAuthModal}
                onClose={() => {
                    setShowAuthModal(false);
                    setAuthModalNotice("");
                    setAuthModalView("signIn");
                }}
                onAuthSuccess={async (user) => {
                    setCurrentUser(user);
                    // AuthModal has just restored or uploaded, so local and cloud now match.
                    markStateAsSynced(await loadState());
                    setCloudSyncStatus("idle");
                }}
                showToast={showToast}
                localState={{ transactions, tags, rules, settings, documents }}
                initialNotice={authModalNotice}
                initialView={authModalView}
            />

            {/* CSV Column Mapping Dialog overlay */}
            {csvMappingData && (
                <CsvMappingDialog
                    mappingData={csvMappingData}
                    onClose={() => setCsvMappingData(null)}
                    onConfirm={triggerCsvImport}
                />
            )}

            {/* PDF Column Mapping Dialog — shown between upload and review */}
            {pdfMappingData && (
                <ModalErrorBoundary onReset={() => setPdfMappingData(null)}>
                    <PdfColumnMappingDialog
                        pdfMappingData={pdfMappingData}
                        onClose={() => setPdfMappingData(null)}
                        onConfirm={confirmPdfMapping}
                        settings={settings}
                    />
                </ModalErrorBoundary>
            )}

            {/* PDF Transaction Verification Dialog overlay */}
            {pdfImportData && (
                <ModalErrorBoundary onReset={() => setPdfImportData(null)}>
                    <PdfImportConfirmDialog
                        pdfImportData={pdfImportData}
                        onClose={() => setPdfImportData(null)}
                        onConfirm={triggerPdfImport}
                        settings={settings}
                        existingTransactions={transactions}
                    />
                </ModalErrorBoundary>
            )}

        </div>
    );
};

// App shell: the lock screen and "hide amounts" live out here, around the app, so locking never loses what
// the app is doing (it stays mounted, just hidden) and the lock check happens before anything is shown.
export const App = () => {
    const [lockEnabled, setLockEnabled] = React.useState(() => isLockEnabled());
    const [locked, setLocked] = React.useState(() => isLockEnabled());
    const [privacyMode, setPrivacyMode] = React.useState(() => readPrivacyDefault());
    const lastActivity = React.useRef(Date.now());
    const lockedRef = React.useRef(locked);
    lockedRef.current = locked;

    React.useEffect(() => {
        if (!lockEnabled) return undefined;
        const bump = () => { lastActivity.current = Date.now(); };
        const idleLimit = () => getIdleMinutes() * 60000;
        const check = () => {
            const limit = idleLimit();
            if (limit > 0 && !lockedRef.current && Date.now() - lastActivity.current > limit) setLocked(true);
        };
        const events = ["pointerdown", "keydown", "wheel", "touchstart"];
        events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
        const timer = setInterval(check, 10000);
        const onVisible = () => { if (document.visibilityState === "visible") check(); };
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            events.forEach((e) => window.removeEventListener(e, bump));
            clearInterval(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [lockEnabled]);

    const privacy = {
        privacyMode,
        setPrivacyMode,
        togglePrivacy: () => setPrivacyMode((p) => !p),
        lockEnabled,
        lockNow: () => { if (isLockEnabled()) setLocked(true); },
        onLockChanged: () => { const on = isLockEnabled(); setLockEnabled(on); if (!on) setLocked(false); }
    };

    return (
        <>
            <div style={{ display: locked ? "none" : "contents" }} aria-hidden={locked}>
                <AppInner privacy={privacy} />
            </div>
            {locked && <LockScreen onUnlock={() => { lastActivity.current = Date.now(); setLocked(false); }} />}
        </>
    );
};
