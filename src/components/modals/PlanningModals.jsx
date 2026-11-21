import React from 'react';
import { 
  Icon, DatePickerField, DEFAULT_CATEGORIES, filterCategoriesByType, 
  useEscapeKey, formatCurrencyVal, NET_WORTH_GROUPS, getCurrencySymbol,
  renderCategoryOptions, formatDate, calculateNextExpectedDate, addMonthsClamped
} from '../../utils.jsx';
import { CategoryPickerModal } from './TransactionModals.jsx';

// Date of the k-th occurrence (k = 0 is the start date) of a schedule. Computed from
// the start date each time, so month-based cadences keep their due day instead of
// drifting after short months (e.g. Jan 31 monthly -> Feb 28 -> Mar 31).
const nthCadenceDate = (base, k, cad, monthDay, intervalDays) => {
    if (k === 0) return new Date(base);
    const dayStep = cad === 'daily' ? 1
        : cad === 'weekly' ? 7
        : cad === 'biweekly' ? 14
        : cad === 'every' ? (Number(intervalDays) || 14)
        : null;
    if (dayStep) {
        const d = new Date(base);
        d.setDate(d.getDate() + k * dayStep);
        return d;
    }
    const monthStep = cad === 'quarterly' ? 3 : cad === 'half_yearly' ? 6 : cad === 'yearly' ? 12 : 1;
    const anchor = (cad === 'monthly' && monthDay)
        ? (monthDay === 'last' ? 'last' : (Number(monthDay) || base.getDate()))
        : base.getDate();
    return addMonthsClamped(base, k * monthStep, anchor);
};

const FREQUENCY_OPTIONS = [
    { value: 'monthly', icon: '📅', label: 'Monthly', desc: 'Every month on the same date' },
    { value: 'yearly', icon: '🔄', label: 'Yearly / Annual', desc: 'Once a year on anniversary date' },
    { value: 'weekly_days', icon: '📆', label: 'Specific Days of Week', desc: 'Repeats on chosen days (e.g. Mon, Wed, Fri)' },
    { value: 'monthly_days', icon: '🗓️', label: 'Specific Days of Month', desc: 'Repeats on specific dates (e.g. 1st & 15th)' },
    { value: 'custom_interval', icon: '⏳', label: 'Custom Days Interval', desc: 'Repeats every N days (e.g. every 14 days)' },
    { value: 'custom_days', icon: '📌', label: 'Specific Set of Dates', desc: 'Custom list of explicit dates' },
    { value: 'once', icon: '1️⃣', label: 'Repeated Only Once', desc: 'Single occurrence' }
];

const FrequencyPicker = ({ value, onChange }) => {
    const [open, setOpen] = React.useState(false);
    const containerRef = React.useRef(null);

    const selectedOpt = FREQUENCY_OPTIONS.find(o => o.value === value) || FREQUENCY_OPTIONS[0];

    React.useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
            <button
                type="button"
                onClick={() => setOpen(!open)}
                style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-color)',
                    background: 'var(--card-bg)',
                    display: 'flex',
                    alignItems: 'center',
                    justify: 'space-between',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: open ? '0 0 0 3px rgba(59, 130, 246, 0.15)' : 'none',
                    borderColor: open ? 'var(--primary)' : 'var(--border-color)'
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', textAlign: 'left' }}>
                    <span style={{ fontSize: '1.25rem' }}>{selectedOpt.icon}</span>
                    <div>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>{selectedOpt.label}</div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{selectedOpt.desc}</div>
                    </div>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
            </button>

            {open && (
                <div
                    style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        right: 0,
                        zIndex: 1050,
                        background: 'var(--card-bg, #ffffff)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '12px',
                        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.15)',
                        padding: '6px',
                        maxHeight: '280px',
                        overflowY: 'auto'
                    }}
                >
                    {FREQUENCY_OPTIONS.map((opt) => {
                        const isSelected = opt.value === value;
                        return (
                            <div
                                key={opt.value}
                                onClick={() => {
                                    onChange(opt.value);
                                    setOpen(false);
                                }}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justify: 'space-between',
                                    padding: '9px 12px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    background: isSelected ? 'var(--bg-color)' : 'transparent',
                                    transition: 'background 0.15s ease'
                                }}
                                onMouseEnter={(e) => {
                                    if (!isSelected) e.currentTarget.style.background = 'var(--bg-color)';
                                }}
                                onMouseLeave={(e) => {
                                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <span style={{ fontSize: '1.15rem' }}>{opt.icon}</span>
                                    <div>
                                        <div style={{ fontWeight: isSelected ? 700 : 500, fontSize: '0.88rem', color: isSelected ? 'var(--primary)' : 'var(--text-main)' }}>
                                            {opt.label}
                                        </div>
                                        <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                                            {opt.desc}
                                        </div>
                                    </div>
                                </div>
                                {isSelected && <span style={{ color: 'var(--primary)', fontWeight: 700 }}>✓</span>}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

        export const CreateRecurringModal = ({ settings, editingItem, onClose, onSave }) => {
            useEscapeKey(onClose);
            const categories = settings?.categories || [];
            const e = editingItem || {};
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const [name, setName] = React.useState(e.name || "");
            const [category, setCategory] = React.useState(e.category || (categories[0] || "Utilities"));
            const [showCategoryPicker, setShowCategoryPicker] = React.useState(false);
            const [amount, setAmount] = React.useState(e.amount ?? "");
            const [isVariableAmount, setIsVariableAmount] = React.useState(!!e.isVariableAmount);
            const [dateFlexDays, setDateFlexDays] = React.useState(e.dateFlexDays || 0);
            const [type, setType] = React.useState(e.type || "expense");

            const handleTypeChange = (newType) => {
                setType(newType);
                const validCats = filterCategoriesByType(categories.length > 0 ? categories : DEFAULT_CATEGORIES, newType, settings?.categoryTypes) || [];
                if (!validCats.includes(category)) {
                    setCategory(validCats[0] || "Food & Drinks - Breakfast 🍳");
                }
            };
            const mapInitialCadenceType = (c) => {
                if (!c) return "monthly";
                if (c === "weekly_days" || c === "weekly") return "weekly";
                if (c === "daily") return "daily";
                if (c === "biweekly") return "biweekly";
                if (c === "custom_interval" || c === "every") return "every";
                if (c === "quarterly") return "quarterly";
                if (c === "half_yearly" || c === "semi_annual") return "half_yearly";
                if (c === "yearly" || c === "annual" || c === "annually") return "yearly";
                if (c === "custom_days" || c === "custom_dates") return "custom_dates";
                if (c === "once") return "once";
                return "monthly";
            };

            const [cadenceType, setCadenceType] = React.useState(mapInitialCadenceType(e.cadence));
            const initialWeekly = Array.isArray(e.weeklyDays) ? e.weeklyDays : (typeof e.weeklyDays === 'string' ? e.weeklyDays.split(',').map(x => x.trim()).filter(Boolean) : ["Mon"]);
            const [weeklyDays, setWeeklyDays] = React.useState(initialWeekly);

            const getStartDay = (sDate) => {
                if (!sDate) return "1";
                const parts = String(sDate).split("-");
                if (parts.length === 3) return String(parseInt(parts[2], 10) || 1);
                return "1";
            };

            const [startDate, setStartDate] = React.useState(e.startDate || todayStr);
            const [endDate, setEndDate] = React.useState(e.endDate || "");
            const [customIntervalDays, setCustomIntervalDays] = React.useState(e.customIntervalDays || 14);

            const parseCustomDaysToArr = (raw) => {
                if (Array.isArray(raw)) return raw.filter(Boolean);
                if (typeof raw === 'string') return raw.split(',').map(s => s.trim()).filter(Boolean);
                return [];
            };
            const [customDays, setCustomDays] = React.useState(() => parseCustomDaysToArr(e.customDays));
            const [tempCustomDate, setTempCustomDate] = React.useState("");
            const [occurrences, setOccurrences] = React.useState(() => {
                if (e.occurrences) return String(e.occurrences);
                return "";
            });
            const [excludeFromMonthlyCalculations, setExcludeFromMonthlyCalculations] = React.useState(!!e.excludeFromMonthlyCalculations);
            const [dateError, setDateError] = React.useState("");

            // initialMonthly: prefer stored monthlyDays; if "last" keep it; else parse numeric
            const getInitialMonthlyDay = () => {
                if (e.monthlyDays) {
                    const raw = Array.isArray(e.monthlyDays) ? e.monthlyDays[0] : String(e.monthlyDays).split(',')[0].trim();
                    if (String(raw).toLowerCase() === 'last') return 'last';
                    const n = parseInt(raw, 10);
                    if (!isNaN(n) && n >= 1 && n <= 30) return String(n);
                }
                return getStartDay(e.startDate || todayStr);
            };
            const [monthlyDay, setMonthlyDay] = React.useState(getInitialMonthlyDay);

            const validateDateRange = (sDate, eDate) => {
                // Only validate if end date is specified (non-empty string)
                if (sDate && eDate && eDate.trim() !== "" && sDate > eDate) {
                    return "Start Date cannot be after End Date (Start Date ≤ End Date).";
                }
                return "";
            };

            const handleStartDateChange = (newDate) => {
                setStartDate(newDate);
                if (!editingItem || !editingItem.monthlyDays) {
                    setMonthlyDay(getStartDay(newDate));
                }
                const err = validateDateRange(newDate, endDate);
                setDateError(err);
            };

            const computeEndDateFromOccurrences = (sd, occ, cad, monthDay, intervalDays) => {
                const n = parseInt(occ, 10);
                if (!sd || isNaN(n) || n <= 0) return "";
                const base = new Date(sd + "T00:00:00");
                if (isNaN(base.getTime())) return "";
                const pad2 = (x) => String(x).padStart(2, '0');
                const localStr = (d) => `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
                return localStr(nthCadenceDate(base, n - 1, cad, monthDay, intervalDays));
            };

            const computeOccurrencesFromEndDate = (sd, ed, cad, monthDay, intervalDays) => {
                if (!sd || !ed) return "";
                const base = new Date(sd + "T00:00:00");
                const end = new Date(ed + "T23:59:59");
                if (isNaN(base.getTime()) || isNaN(end.getTime()) || end < base) return "";
                let count = 0;
                while (count < 1000 && nthCadenceDate(base, count, cad, monthDay, intervalDays) <= end) {
                    count++;
                }
                return String(count);
            };

            const handleEndDateChange = (val) => {
                setEndDate(val);
                const occ = computeOccurrencesFromEndDate(startDate, val, cadenceType, monthlyDay, customIntervalDays);
                if (occ) setOccurrences(occ);
                const err = validateDateRange(startDate, val);
                setDateError(err);
            };

            const handleOccurrencesChange = (val) => {
                setOccurrences(val);
                const ed = computeEndDateFromOccurrences(startDate, val, cadenceType, monthlyDay, customIntervalDays);
                if (ed) setEndDate(ed);
                const err = validateDateRange(startDate, ed);
                setDateError(err);
            };

            // For custom dates, auto-sync Start Date to lowest custom date and End Date to highest custom date
            const syncCustomDatesRange = (datesList) => {
                if (!datesList || datesList.length === 0) return;
                const sorted = [...datesList].sort();
                const minD = sorted[0];
                const maxD = sorted[sorted.length - 1];
                if (minD) setStartDate(minD);
                if (maxD) setEndDate(maxD);
                setOccurrences(String(sorted.length));
            };

            // Toggle a date in/out of custom days array
            const toggleCustomDay = (dateStr) => {
                setCustomDays(prev => {
                    const updated = prev.includes(dateStr) ? prev.filter(d => d !== dateStr) : [...prev, dateStr].sort();
                    syncCustomDatesRange(updated);
                    return updated;
                });
            };

            const handleAddCustomDate = () => {
                if (!tempCustomDate) return;
                setDateError("");
                const updated = customDays.includes(tempCustomDate) ? customDays : [...customDays, tempCustomDate].sort();
                setCustomDays(updated);
                setTempCustomDate("");
                syncCustomDatesRange(updated);
            };

            const isEndDateInvalid = Boolean(startDate && endDate && endDate.trim() !== "" && startDate > endDate);
            const isFormInvalid = isEndDateInvalid || (cadenceType === "custom_dates" && customDays.length === 0 && !tempCustomDate);

            const handleSubmit = (ev) => {
                ev.preventDefault();
                if (!name.trim() || !amount || isFormInvalid) return;

                let finalCustomDays = [...customDays];
                if (cadenceType === "custom_dates") {
                    if (tempCustomDate && !finalCustomDays.includes(tempCustomDate)) {
                        finalCustomDays = [...finalCustomDays, tempCustomDate].sort();
                    }
                    if (finalCustomDays.length === 0) return;
                    syncCustomDatesRange(finalCustomDays);
                }

                const effectiveStartDate = (cadenceType === "custom_dates" && finalCustomDays.length > 0)
                    ? [...finalCustomDays].sort()[0]
                    : startDate;

                const effectiveEndDate = (cadenceType === "custom_dates" && finalCustomDays.length > 0)
                    ? [...finalCustomDays].sort()[[...finalCustomDays].length - 1]
                    : endDate;

                // Validate start date <= end date ONLY IF end date is specified
                const err = validateDateRange(effectiveStartDate, effectiveEndDate);
                if (err) {
                    setDateError(err);
                    return;
                }

                setDateError("");

                let finalCadence = cadenceType;
                if (cadenceType === "weekly") finalCadence = "weekly_days";
                if (cadenceType === "every") finalCadence = "custom_interval";
                if (cadenceType === "custom_dates") finalCadence = "custom_days";

                const effectiveMonthlyDay = monthlyDay || getStartDay(effectiveStartDate);
                const customDaysStr = Array.isArray(finalCustomDays) ? finalCustomDays.join(", ") : String(finalCustomDays || "");

                let updatedAmountHistory = Array.isArray(e.amountHistory) ? [...e.amountHistory] : [];
                if (editingItem && editingItem.amount !== undefined && Number(editingItem.amount) !== Number(amount)) {
                    updatedAmountHistory.push({
                        amount: Number(editingItem.amount),
                        changedAt: todayStr
                    });
                }

                const computedInitialNextDate = calculateNextExpectedDate({
                    startDate: effectiveStartDate,
                    cadence: finalCadence,
                    weeklyDays: cadenceType === "weekly" ? (Array.isArray(weeklyDays) ? weeklyDays : ["Mon"]) : ["Mon"],
                    monthlyDays: effectiveMonthlyDay,
                    customIntervalDays: cadenceType === "every" ? (Number(customIntervalDays) || 14) : 14,
                    customDays: cadenceType === "custom_dates" ? customDaysStr : "",
                    endDate: effectiveEndDate
                }, new Date(effectiveStartDate + "T00:00:00")) || effectiveStartDate;

                const shouldRecalculateNextDate = !e.nextDate ||
                    e.startDate !== effectiveStartDate ||
                    e.cadence !== finalCadence ||
                    String(e.monthlyDays || '') !== String(effectiveMonthlyDay || '') ||
                    e.nextDate < effectiveStartDate;

                const effectiveNextDate = shouldRecalculateNextDate
                    ? (calculateNextExpectedDate({
                        startDate: effectiveStartDate,
                        cadence: finalCadence,
                        weeklyDays: cadenceType === "weekly" ? (Array.isArray(weeklyDays) ? weeklyDays : ["Mon"]) : ["Mon"],
                        monthlyDays: effectiveMonthlyDay,
                        customIntervalDays: cadenceType === "every" ? (Number(customIntervalDays) || 14) : 14,
                        customDays: cadenceType === "custom_dates" ? customDaysStr : "",
                        endDate: effectiveEndDate
                    }, new Date(todayStr + "T00:00:00")) || computedInitialNextDate)
                    : e.nextDate;

                onSave({
                    name: name.trim(),
                    category,
                    amount: Number(amount),
                    isVariableAmount,
                    estimatedAmount: isVariableAmount ? Number(amount) : undefined,
                    dateFlexDays: Number(dateFlexDays) || 0,
                    amountHistory: updatedAmountHistory,
                    type,
                    cadence: finalCadence,
                    weeklyDays: cadenceType === "weekly" ? (Array.isArray(weeklyDays) ? weeklyDays : ["Mon"]) : ["Mon"],
                    monthlyDays: effectiveMonthlyDay,
                    customIntervalDays: cadenceType === "every" ? (Number(customIntervalDays) || 14) : 14,
                    customDays: cadenceType === "custom_dates" ? customDaysStr : "",
                    startDate: effectiveStartDate,
                    nextDate: effectiveNextDate,
                    endDate: effectiveEndDate,
                    occurrences: cadenceType === "custom_dates" ? finalCustomDays.length : (occurrences ? Number(occurrences) : undefined),
                    excludeFromMonthlyCalculations,
                    active: true
                });
            };

            return (
                <div className="modal-overlay">
                    <div className="modal-container" style={{ maxWidth: '620px' }}>
                        <div className="modal-header" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <h3 className="modal-title" style={{ textAlign: 'center', margin: 0, width: '100%' }}>{editingItem ? "Edit" : "Add"} Recurring Item</h3>
                            <button className="modal-close-btn" onClick={onClose} style={{ position: 'absolute', right: '20px' }}><Icon name="close" /></button>
                        </div>

                        {/* High-visibility Outflow / Inflow Flow Pill Toggle Sub-header */}
                        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
                            <div className="flow-segmented-pill-container" style={{ width: '100%', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                                <button
                                    type="button"
                                    className={`flow-pill-btn ${type === "expense" ? "active outflow" : ""}`}
                                    onClick={() => handleTypeChange("expense")}
                                    style={{ width: '100%', padding: '9px 16px', fontSize: '0.92rem' }}
                                >
                                    Outflow
                                </button>
                                <button
                                    type="button"
                                    className={`flow-pill-btn ${type === "income" ? "active inflow" : ""}`}
                                    onClick={() => handleTypeChange("income")}
                                    style={{ width: '100%', padding: '9px 16px', fontSize: '0.92rem' }}
                                >
                                    Inflow
                                </button>
                            </div>
                        </div>

                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                            <div className="modal-body" style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: '16px' }}>
                                <div className="form-grid">
                                    <div className="form-row">
                                        <div className="form-field">
                                            <label>Name / Service</label>
                                            <input type="text" className="form-control" placeholder="e.g. HDFC Home Loan EMI, Netflix, Zerodha SIP"
                                                value={name} onChange={(ev) => setName(ev.target.value)} required />
                                        </div>
                                        <div className="form-field">
                                            <label style={{ color: type === 'income' ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: '20px' }}>
                                                <span>Amount ({getCurrencySymbol(settings?.currency || "INR")})</span>
                                                {isVariableAmount && <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--primary)' }}>~ Estimated</span>}
                                            </label>
                                            <input type="number" step="0.01" className="form-control" placeholder="0.00"
                                                value={amount} onChange={(ev) => setAmount(ev.target.value)} required
                                                style={{
                                                    borderColor: type === 'income' ? 'var(--success)' : 'var(--danger)',
                                                    color: type === 'income' ? 'var(--success)' : 'var(--danger)',
                                                    fontWeight: 600
                                                }} />
                                        </div>
                                    </div>

                                    {/* Side-by-side Amount Type Buttons */}
                                    <div style={{ marginBottom: '16px' }}>
                                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                                            Amount Type
                                        </label>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: 'var(--bg-color)', padding: '4px', borderRadius: '10px', border: '1px solid var(--border-color)', boxSizing: 'border-box' }}>
                                            <button
                                                type="button"
                                                onClick={() => setIsVariableAmount(false)}
                                                style={{
                                                    padding: '7px 12px',
                                                    borderRadius: '7px',
                                                    border: !isVariableAmount ? '1px solid var(--border-color)' : '1px solid transparent',
                                                    boxSizing: 'border-box',
                                                    fontSize: '0.82rem',
                                                    fontWeight: !isVariableAmount ? 700 : 500,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                    background: !isVariableAmount ? 'var(--card-bg, #ffffff)' : 'transparent',
                                                    color: !isVariableAmount ? 'var(--primary, #4F46E5)' : 'var(--text-muted)',
                                                    boxShadow: !isVariableAmount ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '6px'
                                                }}
                                            >
                                                🔒 Fixed Amount
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setIsVariableAmount(true)}
                                                style={{
                                                    padding: '7px 12px',
                                                    borderRadius: '7px',
                                                    border: isVariableAmount ? '1px solid #C7D2FE' : '1px solid transparent',
                                                    boxSizing: 'border-box',
                                                    fontSize: '0.82rem',
                                                    fontWeight: isVariableAmount ? 700 : 500,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.15s ease',
                                                    background: isVariableAmount ? 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)' : 'transparent',
                                                    color: isVariableAmount ? '#4338CA' : 'var(--text-muted)',
                                                    boxShadow: isVariableAmount ? '0 1px 4px rgba(79, 70, 229, 0.15)' : 'none',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '6px'
                                                }}
                                            >
                                                ⚡ Variable Amount (~)
                                            </button>
                                        </div>
                                    </div>

                                    {((e?.changeLogs && e.changeLogs.length > 0) || (e?.amountHistory && e.amountHistory.length > 0)) && (
                                        <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', marginBottom: '12px', background: 'rgba(59, 130, 246, 0.08)', padding: '8px 12px', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                                            {e.changeLogs && e.changeLogs.length > 0 ? (
                                                <>
                                                    ℹ️ <strong>Last Revision:</strong> {e.changeLogs[0].text} <span style={{ color: 'var(--text-muted)' }}>({e.changeLogs[0].dateStr ? formatDate(e.changeLogs[0].dateStr, settings?.dateFormat) : 'Recently'})</span>
                                                </>
                                            ) : (
                                                <>
                                                    ℹ️ <strong>Amount Revision History:</strong> Last revised from {formatCurrencyVal(e.amountHistory[e.amountHistory.length - 1].amount, settings?.currency)} on {e.amountHistory[e.amountHistory.length - 1].changedAt}.
                                                </>
                                            )}
                                        </div>
                                    )}

                                    <div className="form-field">
                                        <label>Category</label>
                                        <button
                                            type="button"
                                            className="category-select-trigger"
                                            onClick={() => setShowCategoryPicker(true)}
                                        >
                                            <div className="category-trigger-content">
                                                {(() => {
                                                    const catStr = String(category || "Utilities");
                                                    const parent = catStr.includes(" - ") ? catStr.split(" - ")[0] : "";
                                                    const subAndEmoji = catStr.includes(" - ") ? catStr.split(" - ")[1] : catStr;
                                                    const emojiMatch = subAndEmoji ? subAndEmoji.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji}/u) : null;
                                                    const emoji = emojiMatch ? emojiMatch[0] : "⚙️";
                                                    const label = subAndEmoji ? subAndEmoji.replace(emoji, "").trim() : catStr;
                                                    return (
                                                        <>
                                                            <span className="category-trigger-emoji">{emoji}</span>
                                                            <span className="category-trigger-label">
                                                                {parent ? `${parent} › ${label}` : label}
                                                            </span>
                                                        </>
                                                    );
                                                })()}
                                            </div>
                                            <span className="category-trigger-arrow">▼</span>
                                        </button>
                                    </div>

                                     {/* ─── Start / End / Occurrences row ─── */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                                        <div className="form-field" style={{ margin: 0 }}>
                                            <label>Start Date</label>
                                            <DatePickerField value={startDate} onChange={handleStartDateChange} dateFormat={settings?.dateFormat} label="Select start date" />
                                        </div>
                                        <div className="form-field" style={{ margin: 0 }}>
                                            <label style={{ color: isEndDateInvalid ? 'var(--danger)' : 'inherit', fontWeight: isEndDateInvalid ? 600 : 'inherit' }}>
                                                End Date <span style={{ fontWeight: 400, color: isEndDateInvalid ? 'var(--danger)' : 'var(--text-muted)' }}>(Optional)</span>
                                            </label>
                                            <DatePickerField
                                                value={endDate}
                                                onChange={handleEndDateChange}
                                                dateFormat={settings?.dateFormat}
                                                label="No end date"
                                                style={isEndDateInvalid ? { borderColor: 'var(--danger)', color: 'var(--danger)', background: 'rgba(239, 68, 68, 0.06)', fontWeight: 600 } : {}}
                                            />
                                        </div>
                                        <div className="form-field" style={{ margin: 0 }}>
                                            <label>Occurrences <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(Optional)</span></label>
                                            <input
                                                type="number"
                                                min="1"
                                                className="form-control"
                                                placeholder="e.g. 12"
                                                value={occurrences}
                                                onChange={(ev) => handleOccurrencesChange(ev.target.value)}
                                            />
                                        </div>
                                    </div>

                                    {/* ─── Frequency row: 40% selector + 60% always-visible detail panel ─── */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 3fr', gap: '10px', alignItems: 'start', marginBottom: '16px' }}>
                                        <div className="form-field" style={{ margin: 0, position: 'relative' }}>
                                            <label>Repeat Frequency</label>
                                            <select className="form-control" value={cadenceType} onChange={(ev) => setCadenceType(ev.target.value)}>
                                                <option value="daily">Daily</option>
                                                <option value="weekly">Weekly</option>
                                                <option value="biweekly">Bi-Weekly</option>
                                                <option value="monthly">Monthly</option>
                                                <option value="quarterly">Quarterly</option>
                                                <option value="half_yearly">Half Yearly</option>
                                                <option value="yearly">Annually</option>
                                                <option value="once">One-Time Only</option>
                                                <option value="every">Every N Days</option>
                                                <option value="custom_dates">Custom Dates</option>
                                            </select>
                                            <div style={{
                                                position: 'absolute',
                                                top: '100%',
                                                left: 0,
                                                marginTop: '4px',
                                                color: 'var(--danger)',
                                                fontSize: '0.76rem',
                                                fontWeight: 600,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                visibility: isEndDateInvalid ? 'visible' : 'hidden',
                                                pointerEvents: 'none',
                                                whiteSpace: 'nowrap'
                                            }}>
                                                <Icon name="alert" />
                                                <span>End Date ≥ Start Date</span>
                                            </div>
                                        </div>

                                        {/* Right panel — ALWAYS rendered */}
                                        <div className="form-field" style={{ margin: 0 }}>
                                            {cadenceType === "weekly" ? (
                                                <>
                                                    <label>Day of Week</label>
                                                    <select className="form-control"
                                                        value={Array.isArray(weeklyDays) ? weeklyDays[0] || "Mon" : "Mon"}
                                                        onChange={(ev) => setWeeklyDays([ev.target.value])}>
                                                        <option value="Mon">Monday</option>
                                                        <option value="Tue">Tuesday</option>
                                                        <option value="Wed">Wednesday</option>
                                                        <option value="Thu">Thursday</option>
                                                        <option value="Fri">Friday</option>
                                                        <option value="Sat">Saturday</option>
                                                        <option value="Sun">Sunday</option>
                                                    </select>
                                                </>
                                            ) : cadenceType === "monthly" ? (
                                                <>
                                                    <label>Day of Month</label>
                                                    <select className="form-control" value={monthlyDay}
                                                        onChange={(ev) => setMonthlyDay(ev.target.value)}>
                                                        {Array.from({ length: 30 }, (_, i) => i + 1).map(d => (
                                                            <option key={d} value={String(d)}>{d}</option>
                                                        ))}
                                                        <option value="last">Last</option>
                                                    </select>
                                                </>
                                            ) : cadenceType === "every" ? (
                                                <>
                                                    <label>Interval (Days)</label>
                                                    <input type="number" min="1" className="form-control"
                                                        placeholder="e.g. 14" value={customIntervalDays}
                                                        onChange={(ev) => setCustomIntervalDays(ev.target.value)} />
                                                </>
                                            ) : cadenceType === "custom_dates" ? (
                                                <>
                                                    <label>Add Custom Date</label>
                                                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                                        <DatePickerField
                                                            value={tempCustomDate}
                                                            onChange={(val) => setTempCustomDate(val)}
                                                            dateFormat={settings?.dateFormat}
                                                            label="Select date"
                                                        />
                                                        <button
                                                            type="button"
                                                            className="btn btn-primary"
                                                            disabled={!tempCustomDate}
                                                            onClick={handleAddCustomDate}
                                                            style={{ whiteSpace: 'nowrap', padding: '6px 12px', height: '36px', fontSize: '0.82rem' }}
                                                        >
                                                            + Add
                                                        </button>
                                                    </div>
                                                </>
                                            ) : (
                                                /* Description for all fixed-cadence types */
                                                <>
                                                    <label>&nbsp;</label>
                                                    <div style={{
                                                        fontSize: '0.8rem', color: 'var(--text-muted)',
                                                        background: 'var(--bg-color)', border: '1px solid var(--border-color)',
                                                        borderRadius: '6px', padding: '8px 10px', lineHeight: 1.55,
                                                        minHeight: '36px', display: 'flex', alignItems: 'center'
                                                    }}>
                                                        {cadenceType === 'daily' && 'Repeats every single day from the start date.'}
                                                        {cadenceType === 'biweekly' && 'Repeats every 2 weeks from the start date.'}
                                                        {cadenceType === 'quarterly' && 'Repeats every 3 months on the same day.'}
                                                        {cadenceType === 'half_yearly' && 'Repeats every 6 months on the same day.'}
                                                        {cadenceType === 'yearly' && 'Repeats annually on the same calendar date.'}
                                                        {cadenceType === 'once' && 'Occurs once on the start date. No recurring pattern.'}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>

                                    {/* ─── Reserved slot for Selected Custom Dates (always reserves height so popup does not resize) ─── */}
                                    <div className="form-field" style={{
                                        marginBottom: '16px',
                                        visibility: cadenceType === "custom_dates" ? "visible" : "hidden",
                                        pointerEvents: cadenceType === "custom_dates" ? "auto" : "none"
                                    }}>
                                        <label style={{ userSelect: 'none' }}>Selected Custom Dates ({customDays.length})</label>
                                        <div style={{
                                            height: '44px', padding: '6px 10px', borderRadius: '8px',
                                            border: '1px solid var(--border-color)', background: 'var(--bg-color)',
                                            display: 'flex', flexWrap: 'nowrap', gap: '6px', alignItems: 'center',
                                            overflowX: 'auto', overflowY: 'hidden', boxSizing: 'border-box'
                                        }}>
                                            {customDays.length === 0 ? (
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>No custom dates added yet. Select a date above using the date picker to add it.</span>
                                            ) : (
                                                customDays.map(d => (
                                                    <span key={d} style={{
                                                        fontSize: '0.78rem', background: 'var(--primary)', color: '#fff',
                                                        borderRadius: '5px', padding: '3px 8px', display: 'inline-flex',
                                                        alignItems: 'center', gap: '6px', fontWeight: 500, flexShrink: 0,
                                                        whiteSpace: 'nowrap'
                                                    }}>
                                                        {formatDate(d, settings?.dateFormat) || d}
                                                        <button
                                                            type="button"
                                                            onClick={() => toggleCustomDay(d)}
                                                            title="Remove date"
                                                            style={{
                                                                background: 'none', border: 'none', color: '#fff',
                                                                cursor: 'pointer', padding: 0, fontSize: '0.85rem',
                                                                lineHeight: 1, display: 'flex', alignItems: 'center'
                                                            }}
                                                        >
                                                            ✕
                                                        </button>
                                                    </span>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setExcludeFromMonthlyCalculations(prev => !prev)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        fontSize: '0.82rem',
                                        fontWeight: 500,
                                        padding: '6px 12px',
                                        borderRadius: '6px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                        border: excludeFromMonthlyCalculations ? '1px solid var(--danger)' : '1px solid var(--border-color)',
                                        background: excludeFromMonthlyCalculations ? 'rgba(239, 68, 68, 0.12)' : 'var(--bg-color)',
                                        color: excludeFromMonthlyCalculations ? 'var(--danger)' : 'var(--text-muted)'
                                    }}
                                    title="Toggle whether this item is included or excluded from recurring calculation totals"
                                >
                                    <span>{excludeFromMonthlyCalculations ? "🚫 Excluded from Recurring Calculations" : "📊 Exclude from Recurring Calculations"}</span>
                                </button>
                                <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                                    <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        disabled={isFormInvalid}
                                        style={{
                                            opacity: isFormInvalid ? 0.5 : 1,
                                            cursor: isFormInvalid ? 'not-allowed' : 'pointer'
                                        }}
                                    >
                                        {editingItem ? "Save Changes" : "Add Recurring Item"}
                                    </button>
                                </div>
                            </div>
                        </form>

                        {showCategoryPicker && (
                            <CategoryPickerModal
                                categories={filterCategoriesByType(categories.length > 0 ? categories : DEFAULT_CATEGORIES, type, settings?.categoryTypes)}
                                selected={category}
                                onSelect={(cat) => { setCategory(cat); setShowCategoryPicker(false); }}
                                onClose={() => setShowCategoryPicker(false)}
                            />
                        )}
                    </div>
                </div>
            );
        };


        // --- SUB-PAGE: Budgets (Section 12) ---


        export const CreateNetWorthItemModal = ({ onClose, onSave, settings, editingItem, defaultCategory }) => {
            useEscapeKey(onClose);
            const getTodayStr = () => {
                const today = new Date();
                const yyyy = today.getFullYear();
                const mm = String(today.getMonth() + 1).padStart(2, '0');
                const dd = String(today.getDate()).padStart(2, '0');
                return `${yyyy}-${mm}-${dd}`;
            };

            const e = editingItem || {};
            const initialCategory = e.category || defaultCategory || NET_WORTH_GROUPS[0].key;
            const initialGroup = NET_WORTH_GROUPS.find(g => g.key === initialCategory);
            const [entryType, setEntryType] = React.useState(initialGroup?.kind === "liability" ? "liability" : "asset");
            const [category, setCategory] = React.useState(initialCategory);
            const [name, setName] = React.useState(e.name || "");
            // Whenever editing these transactions, by default should change the date to current date in the popup
            const [startDate, setStartDate] = React.useState(editingItem ? getTodayStr() : (e.startDate || getTodayStr()));
            const [endDate, setEndDate] = React.useState(e.endDate || "");
            const [invested, setInvested] = React.useState(e.invested ?? "");
            const [currentBalance, setCurrentBalance] = React.useState(e.currentBalance ?? (e.value !== undefined || e.invested !== undefined ? (Number(e.value || 0) + Number(e.invested || 0)) : ""));
            const [interestRate, setInterestRate] = React.useState(e.interestRate ?? "");
            const [value, setValue] = React.useState(e.value ?? "");
            const [notes, setNotes] = React.useState(e.notes || "");
            const [includeInNetWorth, setIncludeInNetWorth] = React.useState(e.includeInNetWorth !== false);

            const handleTypeSwitch = (type) => {
                setEntryType(type);
                const currentKind = (NET_WORTH_GROUPS.find(g => g.key === category) || {}).kind;
                if (type === "liability" && currentKind !== "liability") {
                    setCategory("Liabilities");
                } else if (type === "asset" && currentKind === "liability") {
                    setCategory("Fixed Assets");
                }
            };

            const handleCategoryChange = (catKey) => {
                setCategory(catKey);
                const grp = NET_WORTH_GROUPS.find(g => g.key === catKey);
                if (grp?.kind === "liability") {
                    setEntryType("liability");
                } else {
                    setEntryType("asset");
                }
            };

            const grp = NET_WORTH_GROUPS.find(g => g.key === category);
            const isBalanceGroup = grp?.kind === "balance";
            const isMarketInvestment = grp?.kind === "investment" && grp?.subKind === "market";
            const isFixedInvestment = grp?.kind === "investment" && grp?.subKind === "fixed";
            const isAssetGroup = grp?.kind === "asset" || isMarketInvestment;
            const isRevolvingLiability = grp?.kind === "liability" && grp?.subKind === "revolving";
            const isTermLoan = grp?.kind === "liability";

            const handleSubmit = (ev) => {
                ev.preventDefault();
                if (!name.trim()) return;
                const finalInvested = invested === "" ? 0 : Number(invested);
                const finalCurrentBal = currentBalance === "" ? 0 : Number(currentBalance);
                const finalValue = isBalanceGroup
                    ? (finalCurrentBal - finalInvested)
                    : (value === "" ? 0 : Number(value));

                onSave({
                    category,
                    name: name.trim(),
                    startDate,
                    endDate,
                    invested: finalInvested,
                    interestRate: interestRate === "" ? 0 : Number(interestRate),
                    value: finalValue,
                    currentBalance: isBalanceGroup ? finalCurrentBal : undefined,
                    notes,
                    includeInNetWorth,
                    linkedRecurringId: e.linkedRecurringId || null
                });
            };

            const isLiability = entryType === "liability";
            const currSymbol = getCurrencySymbol(settings?.currency || "INR");

            const derivedCurrentVal = Number(currentBalance || 0) - Number(invested || 0);

            return (
                <div className="modal-overlay">
                    <div className="modal-container" style={{ maxWidth: '580px', width: '92%', maxHeight: '90vh' }}>
                        <div className="modal-header" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <h3 className="modal-title" style={{ textAlign: 'center', margin: 0, width: '100%' }}>
                                {editingItem ? (isLiability ? "Edit Liability" : "Edit Asset") : (isLiability ? "Add Liability" : "Add Asset")}
                            </h3>
                            <button className="modal-close-btn" onClick={onClose} style={{ position: 'absolute', right: '20px' }}><Icon name="close" /></button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                            <div className="modal-body">
                                {/* Entry Type Selector Segmented Pills (Only shown when creating a new item) */}
                                {!editingItem && (
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: 'var(--bg-color)', padding: '4px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <button
                                            type="button"
                                            style={{
                                                flex: 1,
                                                padding: '8px 12px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontWeight: 600,
                                                fontSize: '0.85rem',
                                                background: entryType === 'asset' ? 'var(--success)' : 'transparent',
                                                color: entryType === 'asset' ? '#fff' : 'var(--text-muted)',
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px'
                                            }}
                                            onClick={() => handleTypeSwitch('asset')}
                                        >
                                            <span>💰</span> Asset &amp; Investment
                                        </button>
                                        <button
                                            type="button"
                                            style={{
                                                flex: 1,
                                                padding: '8px 12px',
                                                borderRadius: '6px',
                                                border: 'none',
                                                cursor: 'pointer',
                                                fontWeight: 600,
                                                fontSize: '0.85rem',
                                                background: entryType === 'liability' ? 'var(--danger)' : 'transparent',
                                                color: entryType === 'liability' ? '#fff' : 'var(--text-muted)',
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                gap: '6px'
                                            }}
                                            onClick={() => handleTypeSwitch('liability')}
                                        >
                                            <span>🔴</span> Liability &amp; Debt Owed
                                        </button>
                                    </div>
                                )}

                                <div className="form-grid">
                                    <div className="form-row">
                                        <div className="form-field">
                                            <label>Category {editingItem && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>(Cannot be changed)</span>}</label>
                                            <select
                                                className="form-control"
                                                value={category}
                                                onChange={(ev) => handleCategoryChange(ev.target.value)}
                                                disabled={Boolean(editingItem)}
                                                style={editingItem ? { opacity: 0.7, cursor: 'not-allowed', background: 'var(--bg-color)' } : {}}
                                            >
                                                {isLiability ? (
                                                    <optgroup label="🔴 DEBT &amp; LIABILITIES">
                                                        {NET_WORTH_GROUPS.filter(g => g.kind === 'liability').map(g => (
                                                            <option key={g.key} value={g.key}>{g.icon} {g.label}</option>
                                                        ))}
                                                    </optgroup>
                                                ) : (
                                                    <>
                                                        <optgroup label="💰 ASSETS &amp; CASH BALANCES">
                                                            {NET_WORTH_GROUPS.filter(g => ['asset', 'balance'].includes(g.kind)).map(g => (
                                                                <option key={g.key} value={g.key}>{g.icon} {g.label}</option>
                                                            ))}
                                                        </optgroup>
                                                        <optgroup label="📈 INVESTMENTS">
                                                            {NET_WORTH_GROUPS.filter(g => g.kind === 'investment').map(g => (
                                                                <option key={g.key} value={g.key}>{g.icon} {g.label}</option>
                                                            ))}
                                                        </optgroup>
                                                    </>
                                                )}
                                            </select>
                                        </div>
                                        <div className="form-field">
                                            <label>Name</label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                placeholder={isLiability ? "e.g. Home Loan, Credit Card" : "e.g. Nifty 50 Fund, Savings Account"}
                                                value={name}
                                                onChange={(ev) => setName(ev.target.value)}
                                                required
                                            />
                                        </div>
                                    </div>

                                    {isBalanceGroup ? (
                                        <>
                                            <div className="form-row">
                                                <div className="form-field">
                                                    <label>Date</label>
                                                    <DatePickerField
                                                        value={startDate}
                                                        onChange={setStartDate}
                                                        dateFormat={settings?.dateFormat}
                                                        label="Select date"
                                                    />
                                                </div>
                                                <div className="form-field">
                                                    <label>Minimum Balance ({currSymbol})</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="form-control"
                                                        placeholder="0.00"
                                                        value={invested}
                                                        onChange={(ev) => setInvested(ev.target.value)}
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-row">
                                                <div className="form-field">
                                                    <label>Current Balance ({currSymbol})</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="form-control"
                                                        placeholder="0.00"
                                                        value={currentBalance}
                                                        onChange={(ev) => setCurrentBalance(ev.target.value)}
                                                    />
                                                </div>
                                                <div className="form-field">
                                                    <label style={{ fontWeight: 600, color: 'var(--primary)' }}>Current Value ({currSymbol})</label>
                                                    <input
                                                        type="text"
                                                        className="form-control"
                                                        value={formatCurrencyVal(derivedCurrentVal)}
                                                        disabled
                                                        style={{ fontWeight: 700, background: 'var(--bg-color)', color: derivedCurrentVal < 0 ? 'var(--danger)' : 'var(--success)' }}
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    ) : isAssetGroup ? (
                                        <>
                                            <div className="form-row">
                                                <div className="form-field">
                                                    <label>{isMarketInvestment ? "Investment Date" : "Purchase Date"}</label>
                                                    <DatePickerField
                                                        value={startDate}
                                                        onChange={setStartDate}
                                                        dateFormat={settings?.dateFormat}
                                                        label={isMarketInvestment ? "Select investment date" : "Select purchase date"}
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-row">
                                                <div className="form-field">
                                                    <label>Invested / Cost Basis ({currSymbol})</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="form-control"
                                                        placeholder="0.00"
                                                        value={invested}
                                                        onChange={(ev) => setInvested(ev.target.value)}
                                                    />
                                                </div>
                                                <div className="form-field">
                                                    <label>Current Value ({currSymbol})</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="form-control"
                                                        placeholder="0.00"
                                                        value={value}
                                                        onChange={(ev) => setValue(ev.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    ) : isRevolvingLiability ? (
                                        <>
                                            <div className="form-row">
                                                <div className="form-field">
                                                    <label>Statement / Due Date</label>
                                                    <DatePickerField
                                                        value={startDate}
                                                        onChange={setStartDate}
                                                        dateFormat={settings?.dateFormat}
                                                        label="Select due date"
                                                    />
                                                </div>
                                            </div>
                                            <div className="form-row">
                                                <div className="form-field">
                                                    <label>Credit Limit / Debt Basis ({currSymbol})</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="form-control"
                                                        placeholder="0.00"
                                                        value={invested}
                                                        onChange={(ev) => setInvested(ev.target.value)}
                                                    />
                                                </div>
                                                <div className="form-field">
                                                    <label style={{ color: 'var(--danger)', fontWeight: 600 }}>Outstanding Debt ({currSymbol})</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        className="form-control"
                                                        placeholder="0.00"
                                                        value={value}
                                                        onChange={(ev) => setValue(ev.target.value)}
                                                    />
                                                </div>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="form-row">
                                                <div className="form-field">
                                                    <label>Start Date</label>
                                                    <DatePickerField
                                                        value={startDate}
                                                        onChange={setStartDate}
                                                        dateFormat={settings?.dateFormat}
                                                        label="Select start date"
                                                    />
                                                </div>
                                                <div className="form-field">
                                                    <label>{isLiability ? "Payoff / Closure Date" : "Maturity / End Date"}</label>
                                                    <DatePickerField
                                                        value={endDate}
                                                        onChange={setEndDate}
                                                        dateFormat={settings?.dateFormat}
                                                        label="Select end date"
                                                    />
                                                </div>
                                            </div>

                                            <div className="form-row">
                                                <div className="form-field">
                                                    <label>{isLiability ? `Original Principal (${currSymbol})` : `Invested / Basis (${currSymbol})`}</label>
                                                    <input type="number" step="0.01" className="form-control" placeholder="0.00" value={invested} onChange={(ev) => setInvested(ev.target.value)} />
                                                </div>
                                                <div className="form-field">
                                                    <label>Interest Rate (%)</label>
                                                    <input type="number" step="0.01" className="form-control" placeholder="e.g. 7.5" value={interestRate} onChange={(ev) => setInterestRate(ev.target.value)} />
                                                </div>
                                                <div className="form-field">
                                                    <label style={{ fontWeight: 600, color: isLiability ? 'var(--danger)' : 'var(--success)' }}>
                                                        {isLiability ? `Outstanding Debt (${currSymbol})` : `Current Value (${currSymbol})`}
                                                    </label>
                                                    <input type="number" step="0.01" className="form-control" placeholder="0.00" value={value} onChange={(ev) => setValue(ev.target.value)} />
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    <div className="form-field" style={{ background: 'var(--bg-color)', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', margin: 0, fontWeight: 600 }}>
                                            <input
                                                type="checkbox"
                                                checked={includeInNetWorth}
                                                onChange={(ev) => setIncludeInNetWorth(ev.target.checked)}
                                            />
                                            <span>Include this entry in Net Worth calculation</span>
                                        </label>
                                        <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', marginLeft: '24px', display: 'block' }}>
                                            Uncheck if you want to track this asset/liability separately without counting towards net worth.
                                        </span>
                                    </div>

                                    <div className="form-field">
                                        <label>Notes</label>
                                        <textarea className="form-control" style={{ height: '54px', resize: 'none' }}
                                            value={notes} onChange={(ev) => setNotes(ev.target.value)} />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                                <button
                                    type="submit"
                                    className="btn btn-primary"
                                    style={{
                                        background: isLiability ? 'var(--danger)' : 'var(--success)',
                                        borderColor: isLiability ? 'var(--danger)' : 'var(--success)'
                                    }}
                                >
                                    {editingItem ? "Save Changes" : (isLiability ? "Add Liability" : "Add Asset")}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        };


        // --- SUB-PAGE: Documents (Section 14) ---


        export const CreateBudgetModal = ({ onClose, onSave, settings, tags = [] }) => {
            useEscapeKey(onClose);
            const rawCategories = (settings?.categories && settings.categories.length > 0) ? settings.categories : DEFAULT_CATEGORIES;
            const categories = rawCategories.filter(c => !/Needs Review|Uncategorized/i.test(c));

            // Extract unique main categories (e.g. "Food & Drinks", "Shopping", "Entertainment")
            const mainCategories = React.useMemo(() => {
                const set = new Set();
                categories.forEach(c => {
                    const main = c.includes(" - ") ? c.split(" - ")[0].trim() : c.trim();
                    if (main) set.add(main);
                });
                return Array.from(set).sort();
            }, [categories]);

            // Available tags list
            const availableTags = React.useMemo(() => {
                const set = new Set();
                (tags || []).forEach(t => {
                    const name = typeof t === 'string' ? t : (t?.name || "");
                    if (name) set.add(name.replace(/^#/, '').trim());
                });
                (settings?.tags || []).forEach(t => {
                    const name = typeof t === 'string' ? t : (t?.name || "");
                    if (name) set.add(name.replace(/^#/, '').trim());
                });
                return Array.from(set).filter(Boolean).sort();
            }, [tags, settings]);

            // Target envelope type: "mainCategory" | "subCategory" | "tag"
            const [targetType, setTargetType] = React.useState("mainCategory");
            const [selectedMainCategory, setSelectedMainCategory] = React.useState(mainCategories[0] || "Food & Drinks");
            const [selectedSubCategory, setSelectedSubCategory] = React.useState(categories[0] || "");
            const [selectedTag, setSelectedTag] = React.useState(availableTags[0] || "");
            const [customTag, setCustomTag] = React.useState("");
            const [limit, setLimit] = React.useState("");

            const handleSubmit = (e) => {
                e.preventDefault();
                const limitNum = parseFloat(limit);
                if (isNaN(limitNum) || limitNum <= 0) return;

                if (targetType === "mainCategory") {
                    if (!selectedMainCategory) return;
                    onSave({
                        targetType: "mainCategory",
                        mainCategory: selectedMainCategory,
                        category: `${selectedMainCategory} (All)`,
                        limit: limitNum
                    });
                } else if (targetType === "tag") {
                    const effectiveTag = (customTag.trim() || selectedTag || "").replace(/^#/, '').trim();
                    if (!effectiveTag) return;
                    onSave({
                        targetType: "tag",
                        tag: effectiveTag,
                        category: `Tag: #${effectiveTag}`,
                        limit: limitNum
                    });
                } else {
                    if (!selectedSubCategory) return;
                    onSave({
                        targetType: "subCategory",
                        subCategory: selectedSubCategory,
                        category: selectedSubCategory,
                        limit: limitNum
                    });
                }
            };

            const currentCurrency = getCurrencySymbol(settings?.currency || "INR");

            return (
                <div className="modal-overlay">
                    <div className="modal-container" style={{ maxWidth: '520px' }}>
                        <div className="modal-header">
                            <div>
                                <h3 className="modal-title">Create Monthly Budget</h3>
                                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                                    Set spending envelopes for broad categories, specific subcategories, or custom tags
                                </p>
                            </div>
                            <button className="modal-close-btn" onClick={onClose}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {/* Target Type Pill Selector */}
                                <div>
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
                                        Envelope Scope
                                    </label>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '10px' }}>
                                        <button
                                            type="button"
                                            className={`btn btn-xs ${targetType === "mainCategory" ? "btn-primary" : "btn-secondary"}`}
                                            onClick={() => setTargetType("mainCategory")}
                                            style={{ padding: '6px 4px', fontSize: '0.76rem', fontWeight: targetType === "mainCategory" ? 700 : 500, border: 'none' }}
                                        >
                                            📁 Main Category
                                        </button>
                                        <button
                                            type="button"
                                            className={`btn btn-xs ${targetType === "subCategory" ? "btn-primary" : "btn-secondary"}`}
                                            onClick={() => setTargetType("subCategory")}
                                            style={{ padding: '6px 4px', fontSize: '0.76rem', fontWeight: targetType === "subCategory" ? 700 : 500, border: 'none' }}
                                        >
                                            🏷️ Subcategory
                                        </button>
                                        <button
                                            type="button"
                                            className={`btn btn-xs ${targetType === "tag" ? "btn-primary" : "btn-secondary"}`}
                                            onClick={() => setTargetType("tag")}
                                            style={{ padding: '6px 4px', fontSize: '0.76rem', fontWeight: targetType === "tag" ? 700 : 500, border: 'none' }}
                                        >
                                            🔖 Specific Tag
                                        </button>
                                    </div>
                                </div>

                                {/* Main Category Option */}
                                {targetType === "mainCategory" && (
                                    <div className="form-field">
                                        <label>Select Main Category Envelope</label>
                                        <select
                                            className="form-control"
                                            value={selectedMainCategory}
                                            onChange={(e) => setSelectedMainCategory(e.target.value)}
                                        >
                                            {mainCategories.map(m => (
                                                <option key={m} value={m}>{m} (All Subcategories)</option>
                                            ))}
                                        </select>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4 }}>
                                            💡 <strong>Broad Envelope:</strong> Any transaction in <em>{selectedMainCategory}</em> (e.g. breakfast, lunch, dinner, fastfood, groceries) will automatically count toward this budget limit.
                                        </div>
                                    </div>
                                )}

                                {/* Specific Subcategory Option */}
                                {targetType === "subCategory" && (
                                    <div className="form-field">
                                        <label>Select Specific Subcategory Envelope</label>
                                        <select
                                            className="form-control"
                                            value={selectedSubCategory}
                                            onChange={(e) => setSelectedSubCategory(e.target.value)}
                                        >
                                            {renderCategoryOptions(categories)}
                                        </select>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4 }}>
                                            💡 <strong>Narrow Envelope:</strong> Only transactions specifically categorized under this exact subcategory will count toward this budget.
                                        </div>
                                    </div>
                                )}

                                {/* Specific Tag Option */}
                                {targetType === "tag" && (
                                    <div className="form-field">
                                        <label>Select or Enter Tag Envelope</label>
                                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                            {availableTags.length > 0 && (
                                                <select
                                                    className="form-control"
                                                    style={{ flex: '1 1 180px' }}
                                                    value={selectedTag}
                                                    onChange={(e) => {
                                                        setSelectedTag(e.target.value);
                                                        setCustomTag("");
                                                    }}
                                                >
                                                    <option value="">— Choose existing tag —</option>
                                                    {availableTags.map(t => (
                                                        <option key={t} value={t}>#{t}</option>
                                                    ))}
                                                </select>
                                            )}
                                            <input
                                                type="text"
                                                className="form-control"
                                                style={{ flex: '1 1 180px' }}
                                                placeholder={availableTags.length > 0 ? "Or type new tag…" : "Tag name (e.g. vacation)"}
                                                value={customTag}
                                                onChange={(e) => {
                                                    setCustomTag(e.target.value);
                                                    if (e.target.value) setSelectedTag("");
                                                }}
                                            />
                                        </div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', lineHeight: 1.4 }}>
                                            💡 <strong>Tag Envelope:</strong> Any expense transaction tagged with <strong>#{customTag.trim() || selectedTag || 'tag'}</strong> will count toward this budget regardless of its category.
                                        </div>
                                    </div>
                                )}

                                {/* Monthly Limit */}
                                <div className="form-field">
                                    <label>Monthly Limit ({currentCurrency})</label>
                                    <input
                                        type="number"
                                        step="1"
                                        className="form-control"
                                        placeholder="e.g. 15000"
                                        value={limit}
                                        onChange={(e) => setLimit(e.target.value)}
                                        required
                                        autoFocus
                                    />
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Establish Envelope Limit</button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        };




        export const CreateGoalModal = ({ onClose, onSave, settings }) => {
            useEscapeKey(onClose);
            const [name, setName] = React.useState("");
            const [target, setTarget] = React.useState("");
            const [current, setCurrent] = React.useState("");
            const [dueDate, setDueDate] = React.useState("");
            const [note, setNote] = React.useState("");

            const handleSubmit = (e) => {
                e.preventDefault();
                if (!name || !target || isNaN(target) || parseFloat(target) <= 0) return;

                onSave({
                    name,
                    target: parseFloat(target),
                    current: parseFloat(current || "0"),
                    dueDate,
                    note
                });
            };

            return (
                <div className="modal-overlay">
                    <div className="modal-container">
                        <div className="modal-header">
                            <h3 className="modal-title">Create Savings Goal</h3>
                            <button className="modal-close-btn" onClick={onClose}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                            <div className="modal-body">
                                <div className="form-grid">
                                    <div className="form-field">
                                        <label>Goal Name</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="e.g. Vacation Trip, Emergency Fund"
                                            value={name}
                                            onChange={(e) => setName(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="form-row">
                                        <div className="form-field">
                                            <label>Target Amount ({getCurrencySymbol(settings?.currency || "INR")})</label>
                                            <input
                                                type="number"
                                                className="form-control"
                                                placeholder="5000"
                                                value={target}
                                                onChange={(e) => setTarget(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="form-field">
                                            <label>Current Capital ({getCurrencySymbol(settings?.currency || "INR")})</label>
                                            <input
                                                type="number"
                                                className="form-control"
                                                placeholder="500"
                                                value={current}
                                                onChange={(e) => setCurrent(e.target.value)}
                                            />
                                        </div>
                                    </div>

                                    <div className="form-field">
                                        <label>Target Completion Date</label>
                                        <DatePickerField
                                            value={dueDate}
                                            onChange={setDueDate}
                                            dateFormat={settings?.dateFormat}
                                            label="Select target completion date"
                                        />
                                    </div>

                                    <div className="form-field">
                                        <label>Memo / Notes</label>
                                        <textarea
                                            className="form-control"
                                            placeholder="Notes about budget cuts..."
                                            value={note}
                                            onChange={(e) => setNote(e.target.value)}
                                            style={{ height: '60px', resize: 'none' }}
                                        />
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Create Goal</button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        };




        export const CreateRuleModal = ({ onClose, onSave, categories }) => {
            useEscapeKey(onClose);
            const [whenText, setWhenText] = React.useState("");
            const [thenText, setThenText] = React.useState(categories[0] || "");

            const handleSubmit = (e) => {
                e.preventDefault();
                if (!whenText || !thenText) return;

                onSave({
                    id: crypto.randomUUID(),
                    whenText,
                    thenText,
                    enabled: 1,
                    createdAt: new Date().toISOString()
                });
            };

            return (
                <div className="modal-overlay">
                    <div className="modal-container">
                        <div className="modal-header">
                            <h3 className="modal-title">Create Categorization Rule</h3>
                            <button className="modal-close-btn" onClick={onClose}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                            <div className="modal-body">
                                <div className="form-grid">
                                    <div className="form-field">
                                        <label>When Merchant Name Contains:</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="e.g. netflix, chevron, groceries"
                                            value={whenText}
                                            onChange={(e) => setWhenText(e.target.value)}
                                            required
                                        />
                                    </div>

                                    <div className="form-field">
                                        <label>Then Categorize As:</label>
                                        <select className="form-control" value={thenText} onChange={(e) => setThenText(e.target.value)}>
                                            {renderCategoryOptions(categories)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Establish Rule</button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        };

        export const LogBillInstanceModal = ({ item, settings, onClose, onSave, onClear, referenceDate }) => {
            useEscapeKey(onClose);
            const now = new Date();
            const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            const isIncome = item?.type === 'income';

            // Pre-fill Next Expected Date using referenceDate if provided
            const initialExpectedDate = React.useMemo(() => {
                if (!item) return todayStr;
                const computed = calculateNextExpectedDate(item, referenceDate || new Date());
                return computed || item.nextDate || item.date || todayStr;
            }, [item, referenceDate, todayStr]);

            // All bill instances logged for this recurring item across all cycles
            const allBillInsts = React.useMemo(() => {
                if (!item) return [];
                return (settings?.billInstances || [])
                    .filter(b => b && b.recurringId === item.id)
                    .sort((a, b) => (b.dueDate || '').localeCompare(a.dueDate || ''));
            }, [item, settings?.billInstances]);

            const defaultInitialCycleId = React.useMemo(() => {
                if (item?._targetBillInstance?.id) return item._targetBillInstance.id;
                if (allBillInsts.length === 0) return 'new';
                const match = allBillInsts.find(b => b.dueDate === initialExpectedDate || (b.dueDate && b.dueDate.substring(0, 7) === initialExpectedDate.substring(0, 7)));
                if (match) return match.id;
                return 'new';
            }, [item, allBillInsts, initialExpectedDate]);

            const [selectedCycleId, setSelectedCycleId] = React.useState(defaultInitialCycleId);

            const activeBillInst = React.useMemo(() => {
                if (selectedCycleId === 'new') return null;
                return allBillInsts.find(b => b.id === selectedCycleId) || null;
            }, [selectedCycleId, allBillInsts]);

            const [amount, setAmount] = React.useState(() => {
                if (activeBillInst) return activeBillInst.amount;
                return item?.estimatedAmount || item?.amount || "";
            });
            const [dueDate, setDueDate] = React.useState(() => {
                if (activeBillInst) return activeBillInst.dueDate;
                return initialExpectedDate;
            });

            // Keep form in sync when selected cycle changes
            React.useEffect(() => {
                if (activeBillInst) {
                    setAmount(activeBillInst.amount);
                    setDueDate(activeBillInst.dueDate);
                } else if (selectedCycleId === 'new') {
                    setAmount(item?.estimatedAmount || item?.amount || "");
                    setDueDate(initialExpectedDate);
                }
            }, [selectedCycleId, activeBillInst, item, initialExpectedDate]);

            const handleCycleSelectChange = (newCycleId) => {
                setSelectedCycleId(newCycleId);
                if (newCycleId === 'new') {
                    setAmount(item?.estimatedAmount || item?.amount || "");
                    setDueDate(initialExpectedDate);
                } else {
                    const inst = allBillInsts.find(b => b.id === newCycleId);
                    if (inst) {
                        setAmount(inst.amount);
                        setDueDate(inst.dueDate);
                    }
                }
            };

            const handleSubmit = (ev) => {
                ev.preventDefault();
                if (!amount || !dueDate) return;
                const existing = activeBillInst || allBillInsts.find(b => b.dueDate === dueDate);
                onSave({
                    id: existing?.id || ('bill_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5)),
                    recurringId: item.id,
                    name: item.name,
                    category: item.category,
                    type: item.type || 'expense',
                    amount: Number(amount),
                    dueDate,
                    status: existing?.status || 'pending',
                    linkedTxId: existing?.linkedTxId || null,
                    createdAt: existing?.createdAt || new Date().toISOString()
                });
                onClose();
            };

            const handleClear = () => {
                if (onClear && item?.id && activeBillInst?.id) {
                    onClear(item.id, activeBillInst.id);
                }
                onClose();
            };

            const currencySymbol = getCurrencySymbol(settings?.currency || "INR");

            const modalTitle = activeBillInst 
                ? (isIncome ? "Update Logged Inflow" : "Update Logged Outflow")
                : (isIncome ? "Log Inflow Cycle" : "Log Outflow Cycle");

            const dateLabel = isIncome ? "Actual Expected Date" : "Actual Due Date";

            const submitBtnText = activeBillInst
                ? (isIncome ? "Update Inflow Log" : "Update Outflow Log")
                : (isIncome ? "Save Inflow Instance" : "Save Outflow Instance");

            const clearBtnText = isIncome ? "🗑️ Clear This Logged Inflow" : "🗑️ Clear This Logged Outflow";

            return (
                <div className="modal-overlay">
                    <div className="modal-container" style={{ maxWidth: '580px', width: '100%', borderRadius: '16px', padding: '24px 28px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{
                                width: '48px',
                                height: '48px',
                                borderRadius: '50%',
                                background: activeBillInst ? 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)' : 'linear-gradient(135deg, #EEF2FF 0%, #E0E7FF 100%)',
                                color: activeBillInst ? '#047857' : '#4338CA',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '1.4rem',
                                marginBottom: '10px',
                                boxShadow: activeBillInst ? '0 2px 8px rgba(16, 185, 129, 0.2)' : '0 2px 8px rgba(79, 70, 229, 0.15)'
                            }}>
                                🧾
                            </div>
                            <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                {modalTitle}
                            </h3>
                            <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                {activeBillInst ? (
                                    <span>Currently logged: <strong style={{ color: 'var(--success)' }}>{formatCurrencyVal(activeBillInst.amount, settings?.currency)}</strong> {isIncome ? 'expected' : 'due'} on <strong>{formatDate(activeBillInst.dueDate, settings?.dateFormat)}</strong></span>
                                ) : (
                                    <span>Enter statement cycle figures for <strong style={{ color: 'var(--text-main)' }}>{item?.name}</strong></span>
                                )}
                            </p>
                        </div>

                        {/* Select Billing Cycle / Month List (Scrollable, showing 5+ cycles) */}
                        <div style={{ marginBottom: '16px', textAlign: 'left' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <label style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-main)', margin: 0 }}>
                                    Select Billing Cycle / Month {allBillInsts.length > 0 ? `(${allBillInsts.length})` : ''}
                                </label>
                                <button
                                    type="button"
                                    onClick={() => handleCycleSelectChange('new')}
                                    style={{
                                        background: selectedCycleId === 'new' ? '#EEF2FF' : 'transparent',
                                        border: selectedCycleId === 'new' ? '1.5px solid #6366F1' : '1px dashed var(--border-color)',
                                        color: selectedCycleId === 'new' ? '#4F46E5' : 'var(--text-muted)',
                                        fontSize: '0.74rem',
                                        fontWeight: 700,
                                        padding: '3px 8px',
                                        borderRadius: '6px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    + Log New Cycle
                                </button>
                            </div>

                            {allBillInsts.length === 0 ? (
                                <div style={{ padding: '10px 12px', background: 'var(--bg-color)', borderRadius: '8px', fontSize: '0.8rem', color: 'var(--text-muted)', border: '1px solid var(--border-color)' }}>
                                    No previous billing cycles recorded. Enter the figures below to create the first cycle.
                                </div>
                            ) : (
                                <div style={{
                                    maxHeight: '185px',
                                    overflowY: 'auto',
                                    border: '1px solid var(--border-color)',
                                    borderRadius: '8px',
                                    background: '#fff',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '2px',
                                    padding: '4px'
                                }}>
                                    {allBillInsts.map(b => {
                                        const isSelected = selectedCycleId === b.id;
                                        const isPaid = b.status === 'paid';
                                        const isOverdue = !isPaid && b.dueDate && b.dueDate < todayStr;
                                        const statusBadge = isPaid
                                            ? <span className="badge badge-success" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>🟢 Paid</span>
                                            : (isOverdue
                                                ? <span className="badge badge-danger" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>🔴 Overdue</span>
                                                : <span className="badge badge-warning" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>🟡 Upcoming</span>);

                                        return (
                                            <div
                                                key={b.id}
                                                onClick={() => handleCycleSelectChange(b.id)}
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    padding: '7px 10px',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    background: isSelected ? '#EEF2FF' : 'transparent',
                                                    border: isSelected ? '1.5px solid #6366F1' : '1px solid transparent',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.84rem', fontWeight: isSelected ? 700 : 600, color: isSelected ? '#1E1B4B' : 'var(--text-main)' }}>
                                                        Due {formatDate(b.dueDate, settings?.dateFormat)}
                                                    </span>
                                                    {statusBadge}
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <span style={{ fontSize: '0.86rem', fontWeight: 700, color: isSelected ? '#4338CA' : (isIncome ? 'var(--success)' : 'var(--danger)') }}>
                                                        {isIncome ? '+' : '-'}{formatCurrencyVal(b.amount, settings?.currency)}
                                                    </span>
                                                    {isSelected && <span style={{ color: '#4F46E5', fontWeight: 800, fontSize: '0.8rem' }}>✓</span>}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <form onSubmit={handleSubmit} style={{ textAlign: 'left' }}>
                            {/* Actual Amount (₹) - Actual Due Date in the same line */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '18px' }}>
                                <div className="form-field">
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px', display: 'block' }}>
                                        Actual Amount ({currencySymbol})
                                    </label>
                                    <input
                                        type="number"
                                        step="0.01"
                                        className="form-control"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        required
                                        autoFocus
                                        placeholder="0.00"
                                        style={{ fontSize: '1.05rem', fontWeight: 700, height: '42px', borderRadius: '8px' }}
                                    />
                                </div>

                                <div className="form-field">
                                    <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px', display: 'block' }}>
                                        {dateLabel}
                                    </label>
                                    <DatePickerField
                                        value={dueDate}
                                        onChange={setDueDate}
                                        dateFormat={settings?.dateFormat}
                                        label="Date"
                                        style={{ height: '42px', borderRadius: '8px' }}
                                    />
                                </div>
                            </div>

                            {activeBillInst && (
                                <div style={{ marginBottom: '16px', textAlign: 'center' }}>
                                    <button
                                        type="button"
                                        onClick={handleClear}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#DC2626',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            textDecoration: 'underline'
                                        }}
                                    >
                                        {clearBtnText}
                                    </button>
                                </div>
                            )}

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                <button type="button" className="btn btn-secondary" onClick={onClose} style={{ borderRadius: '8px', padding: '9px 16px', fontWeight: 600 }}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary" style={{ borderRadius: '8px', padding: '9px 16px', fontWeight: 600 }}>
                                    {submitBtnText}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        };
