import React from 'react';
import {
    Icon, formatCurrencyVal, filterTransactionsByPeriod, formatDate,
    ModernDateFilterPicker, PeriodSelectOptions, getContrastTextColor,
    formatCategorySubIconFirst, filterCategoriesByType, renderCategoryOptions, DatePickerField
} from '../utils.jsx';
import { updateTransactionInDB, deleteTransactionFromDB } from '../store.js';
import { EditTransactionModal, TagManagerModal, AddEntryModal, CategoryPickerModal } from '../components/modals/TransactionModals.jsx';

export const TransactionsPage = ({
    transactions,
    allTransactions = [],
    documents = [],
    documentFilter = "all",
    setDocumentFilter,
    settings,
    onDelete,
    onPatch,
    onAdd,
    onAddTag,
    tags,
    updateSetting,
    search = "",
    narrationFilter = "",
    categoryFilter = [],
    accountFilter = [],
    tagFilter = [],
    amountFilter = "",
    typeFilter = [],
    notesFilter = "",
    customFromDate = "",
    customToDate = "",
    sortField = "date",
    sortDirection = "desc",
    handleTxSort,
    renderSortIcon
}) => {
    const [txToDelete, setTxToDelete] = React.useState(null);
    const [txToEdit, setTxToEdit] = React.useState(null);
    const [activeTagTx, setActiveTagTx] = React.useState(null);
    const [linkModalTx, setLinkModalTx] = React.useState(null);
    const [categoryPickerTx, setCategoryPickerTx] = React.useState(null);

    const categories = settings.categories || [];
    const accounts = settings.accounts || [];
    const recurringList = (settings?.recurring || []).filter(Boolean);

    // Map document IDs to document objects for quick lookup
    const documentMap = React.useMemo(() => {
        const map = new Map();
        (documents || []).forEach(d => {
            if (d && d.id) {
                map.set(d.id, {
                    id: d.id,
                    filename: d.filename || "Untitled Document",
                    createdAt: d.createdAt,
                    source: d.source
                });
            }
        });
        (settings?.statements || []).forEach(s => {
            if (s && s.documentId && !map.has(s.documentId)) {
                map.set(s.documentId, {
                    id: s.documentId,
                    filename: s.fileName || `${s.account || 'Imported'} Statement`,
                    createdAt: s.importedAt,
                    source: "statement"
                });
            }
        });
        (allTransactions || transactions || []).forEach(t => {
            if (t && t.documentId && !map.has(t.documentId)) {
                map.set(t.documentId, {
                    id: t.documentId,
                    filename: `Statement (${t.account || "Imported"})`,
                    source: "import"
                });
            }
        });
        return map;
    }, [documents, settings?.statements, allTransactions, transactions]);

    const selectedDocName = React.useMemo(() => {
        if (!documentFilter || documentFilter === "all") return null;
        if (documentFilter === "manual") return "Manual / Direct Entry";
        const found = documentMap.get(documentFilter);
        return found ? found.filename : "Selected Document";
    }, [documentFilter, documentMap]);

    // Handle Escape key for all modals in TransactionsPage
    React.useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === "Escape") {
                if (linkModalTx) setLinkModalTx(null);
                if (txToEdit) setTxToEdit(null);
                if (txToDelete) setTxToDelete(null);
                if (activeTagTx) setActiveTagTx(null);
                if (categoryPickerTx) setCategoryPickerTx(null);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [linkModalTx, txToEdit, txToDelete, activeTagTx, categoryPickerTx]);

    // If a documentFilter is active, search across allTransactions so statement transactions
    // outside the current date filter window are not hidden.
    const baseList = (documentFilter && documentFilter !== "all" && allTransactions && allTransactions.length > 0)
        ? allTransactions
        : transactions;

    // 1. Column & field-specific filtering
    const filteredBase = baseList.filter(t => {
        if (documentFilter && documentFilter !== "all") {
            if (documentFilter === "manual") {
                if (t.documentId) return false;
            } else {
                if (t.documentId !== documentFilter) return false;
            }
        }
        const nf = narrationFilter.toLowerCase().trim();
        if (nf && !((t.narration && t.narration.toLowerCase().includes(nf)) || (t.merchant && t.merchant.toLowerCase().includes(nf)))) {
            return false;
        }

        if (categoryFilter.length > 0 && !categoryFilter.some(f => t.category === f || (t.category && t.category.startsWith(f + " - ")))) {
            return false;
        }

        if (accountFilter.length > 0 && !accountFilter.includes(t.account)) {
            return false;
        }

        if (tagFilter.length > 0 && (!t.tags || !tagFilter.some(f => t.tags.includes(f)))) {
            return false;
        }

        if (typeFilter.length > 0 && !typeFilter.includes(t.type)) {
            return false;
        }

        const af = amountFilter.trim();
        // Several amounts can be given separated by commas (e.g. "500, 1200")
        const afParts = af.split(",").map(x => x.trim()).filter(Boolean);
        if (afParts.length && !afParts.some(x => String(t.amount || "").includes(x))) {
            return false;
        }

        const notesF = notesFilter.toLowerCase().trim();
        if (notesF && (!t.notes || !t.notes.toLowerCase().includes(notesF))) {
            return false;
        }

        if (settings.selectedPeriod === "custom-range") {
            if (customFromDate && t.date < customFromDate) return false;
            if (customToDate && t.date > customToDate) return false;
        }

        return true;
    });

    // 2. Global multi-word search ranking logic
    const matchesWord = (t, word) => {
        if (!word) return true;
        return (
            (t.merchant && t.merchant.toLowerCase().includes(word)) ||
            (t.narration && t.narration.toLowerCase().includes(word)) ||
            (t.category && t.category.toLowerCase().includes(word)) ||
            (t.account && t.account.toLowerCase().includes(word)) ||
            (t.notes && t.notes.toLowerCase().includes(word)) ||
            (t.tags && t.tags.some(tag => tag.toLowerCase().includes(word))) ||
            String(t.amount || "").includes(word)
        );
    };

    // Helper: wrap matching words with <mark> for inline highlighting
    const highlightText = (text, words) => {
        if (!text || !words || words.length === 0) return text;
        const str = String(text);
        const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const pattern = new RegExp(`(${escaped.join('|')})`, 'gi');
        const parts = str.split(pattern);
        if (parts.length === 1) return str;
        return parts.map((part, i) =>
            i % 2 === 1
                ? React.createElement('mark', { key: i, className: 'tx-hl' }, part)
                : part
        );
    };

    let ranked = [];
    const q = search.toLowerCase().trim();
    // Hoist search words so they're available in render for highlighting
    const searchWords = q ? q.split(/\s+/).filter(Boolean) : [];

    // scored: { t, score } pairs used for relevance-first sorting
    let scoredRanked = [];

    if (!q) {
        scoredRanked = filteredBase.map(t => ({ t, score: 0 }));
    } else {
        const words = searchWords;
        if (words.length <= 1) {
            scoredRanked = filteredBase
                .filter(t => matchesWord(t, words[0]))
                .map(t => ({ t, score: 1 }));
        } else {
            // Score each transaction by how many words it matches
            scoredRanked = filteredBase
                .map(t => ({ t, score: words.filter(w => matchesWord(t, w)).length }))
                .filter(({ score }) => score > 0);
        }
    }
    ranked = scoredRanked.map(({ t }) => t);

    // 3. Column sorting — when multi-word search is active, score is primary; column is tiebreaker
    const isMultiWordSearch = searchWords.length > 1;
    const sorted = [...scoredRanked].sort((a, b) => {
        // Primary: search score descending (only when multi-word search active)
        if (isMultiWordSearch && a.score !== b.score) {
            return b.score - a.score;
        }

        // Secondary (or sole): column sort
        if (!sortField) return 0;
        let valA = a.t[sortField];
        let valB = b.t[sortField];
        if (sortField === "date") {
            const parseDateToMs = (dStr) => {
                if (!dStr) return 0;
                if (dStr instanceof Date) return dStr.getTime();
                const str = String(dStr).trim();
                const ymd = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
                if (ymd) return new Date(parseInt(ymd[1], 10), parseInt(ymd[2], 10) - 1, parseInt(ymd[3], 10)).getTime();
                const dmy = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
                if (dmy) {
                    let p1 = parseInt(dmy[1], 10), p2 = parseInt(dmy[2], 10), p3 = parseInt(dmy[3], 10);
                    if (p3 < 100) p3 += 2000;
                    let day = p1 > 12 ? p1 : (p2 > 12 ? p2 : p1);
                    let month = p1 > 12 ? p2 : (p2 > 12 ? p1 : p2);
                    return new Date(p3, month - 1, day).getTime();
                }
                const d = new Date(str);
                return isNaN(d.getTime()) ? 0 : d.getTime();
            };
            valA = parseDateToMs(a.t.date);
            valB = parseDateToMs(b.t.date);
        } else if (sortField === "amount") {
            valA = Number(a.t.amount || 0);
            valB = Number(b.t.amount || 0);
        } else if (sortField === "narration") {
            valA = (a.t.narration || a.t.merchant || "").toLowerCase();
            valB = (b.t.narration || b.t.merchant || "").toLowerCase();
        } else if (sortField === "tags") {
            valA = (a.t.tags ? a.t.tags.join(",") : "").toLowerCase();
            valB = (b.t.tags ? b.t.tags.join(",") : "").toLowerCase();
        } else if (typeof valA === "string" || typeof valB === "string") {
            valA = (valA || "").toLowerCase();
            valB = (valB || "").toLowerCase();
        }
        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
    }).map(({ t }) => t);

    const handleRemoveTag = (tx, tagToRemove) => {
        const updatedTags = (tx.tags || []).filter(t => t !== tagToRemove);
        onPatch(tx.id, { tags: updatedTags });
    };

    const formatCurrency = (val) => formatCurrencyVal(val, settings.currency || "INR");

    const handlePeriodChange = (val) => {
        updateSetting("selectedPeriod", val);
    };

    return (
        <div style={{ paddingTop: '4px' }}>

            {/* Active document filter banner */}
            {selectedDocName && (
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 14px',
                    marginBottom: '10px',
                    background: 'var(--primary-light, #EEF2FF)',
                    border: '1px solid #C7D2FE',
                    borderRadius: '8px',
                    fontSize: '0.82rem',
                    color: '#3730A3'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.05rem' }}>📄</span>
                        <span>
                            Filtered by Document: <strong>{selectedDocName}</strong> ({sorted.length} {sorted.length === 1 ? 'transaction' : 'transactions'})
                        </span>
                    </div>
                    <button
                        onClick={() => setDocumentFilter && setDocumentFilter("all")}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#4F46E5',
                            fontWeight: 600,
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '3px 8px',
                            borderRadius: '4px'
                        }}
                        title="Clear document filter"
                    >
                        ✕ Clear filter
                    </button>
                </div>
            )}

            {/* Ledger Table */}
            {sorted.length === 0 ? (
                <div className="empty-state">
                    <Icon name="transactions" currency={settings.currency} />
                    <div className="empty-state-text">
                        <h3>{selectedDocName ? `No Records Found For "${selectedDocName}"` : "No Records Matching Filters"}</h3>
                        <p>{selectedDocName ? "Try refining your other filters or clearing the document filter." : "Try refining your search terms or date filter options."}</p>
                        {selectedDocName && (
                            <button className="btn btn-secondary btn-sm" style={{ marginTop: '10px' }} onClick={() => setDocumentFilter && setDocumentFilter("all")}>
                                Clear Document Filter
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="table-responsive" style={{ height: 'calc(100vh - 170px)', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flex: 1, height: '100%', overflowY: 'auto', overflowX: 'auto', paddingRight: '6px', scrollbarGutter: 'stable' }}>
                        <table className="table tx-table" style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                            <colgroup>
                                <col style={{ width: '120px' }} />
                                <col style={{ width: 'auto' }} />
                                <col style={{ width: '160px' }} />
                                <col style={{ width: '130px' }} />
                                <col style={{ width: '150px' }} />
                                <col style={{ width: '120px' }} />
                                <col style={{ width: '110px' }} />
                                <col style={{ width: '120px' }} />
                            </colgroup>
                            <tbody>
                                {sorted.map(t => {
                                    const catParts = t.category && t.category.includes(" - ") ? t.category.split(" - ") : [t.category, ""];
                                    const catParent = catParts[0];
                                    const catSubRaw = catParts.slice(1).join(" - ");
                                    const catSub = formatCategorySubIconFirst(catSubRaw);
                                    const linkedRec = recurringList.find(r => r && r.id === t.linkedRecurringId);

                                    const customType = (settings.categoryTypes || {})[t.category] || (settings.categoryTypes || {})[catParent];
                                    const isNeutralTx = t.type === "neutral" || customType === "neutral" || (!customType && ["Transfer", "Misc", "Others"].includes(catParent));
                                    const isIncomeTx = !isNeutralTx && (t.type === "income" || customType === "income" || (!customType && catParent === "Income"));

                                    return (
                                        <tr key={t.id}>
                                            <td className="tx-cell-date" style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(t.date, settings.dateFormat)}</td>
                                            <td className="tx-cell-narr">
                                                <div style={{ fontWeight: 500, fontSize: '0.88rem' }}>
                                                    {highlightText(t.narration || t.merchant, searchWords)}
                                                    {t.receipt === 1 && (
                                                        <span title="Receipt attached" style={{ marginLeft: '6px', color: 'var(--primary)', cursor: 'pointer' }}>📎</span>
                                                    )}
                                                </div>
                                                {t.documentId && documentMap.get(t.documentId) && (
                                                    <div
                                                        onClick={() => setDocumentFilter && setDocumentFilter(t.documentId)}
                                                        title={`Imported from "${documentMap.get(t.documentId).filename}". Click to filter transactions from this document.`}
                                                        style={{
                                                            fontSize: '0.71rem',
                                                            color: documentFilter === t.documentId ? 'var(--primary)' : 'var(--text-muted)',
                                                            cursor: 'pointer',
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '3px',
                                                            marginTop: '2px',
                                                            background: documentFilter === t.documentId ? 'var(--primary-light, #EEF2FF)' : 'rgba(0,0,0,0.03)',
                                                            padding: '1px 6px',
                                                            borderRadius: '4px',
                                                            border: documentFilter === t.documentId ? '1px solid var(--primary)' : '1px solid rgba(0,0,0,0.06)'
                                                        }}
                                                    >
                                                        <span>📄</span>
                                                        <span style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {documentMap.get(t.documentId).filename}
                                                        </span>
                                                    </div>
                                                )}
                                            </td>

                                            <td className="tx-cell-cat" style={{ textAlign: 'center' }}>
                                                <div
                                                    className="category-cell-clickable"
                                                    onClick={() => setCategoryPickerTx(t)}
                                                    title="Click to change category"
                                                    style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', padding: '3px 10px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', cursor: 'pointer' }}
                                                >
                                                    <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#334155' }}>{highlightText(catParent, searchWords)}</div>
                                                    {catSub && (
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '1px' }}>{highlightText(catSub, searchWords)}</div>
                                                    )}
                                                </div>
                                            </td>

                                            <td className="tx-cell-acct" style={{ fontSize: '0.82rem', textAlign: 'center' }}>{highlightText(t.account, searchWords)}</td>

                                            <td className="tx-cell-tags">
                                                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '3px' }}>
                                                    {(t.tags || []).map(tag => {
                                                        const foundTag = (tags || []).find(tg => tg.name.toLowerCase() === tag.toLowerCase());
                                                        const tagBg = foundTag ? (foundTag.color || 'var(--primary)') : 'var(--primary)';
                                                        const textColor = getContrastTextColor(tagBg);
                                                        const needsBorder = textColor === '#1E293B';
                                                        return (
                                                            <span key={tag} className="tag-pill" style={{ backgroundColor: tagBg, color: textColor, border: needsBorder ? '1px solid #CBD5E1' : 'none' }}>
                                                                {tag}
                                                                <button className="remove-btn" style={{ color: textColor }} onClick={() => handleRemoveTag(t, tag)}>×</button>
                                                            </span>
                                                        );
                                                    })}
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        style={{ padding: '2px 6px', height: '22px', borderRadius: '4px', display: 'flex', alignItems: 'center' }}
                                                        onClick={() => setActiveTagTx(t)}
                                                    >
                                                        +
                                                    </button>
                                                </div>
                                            </td>

                                            <td className="tx-cell-amount" style={{ fontWeight: 600, color: isNeutralTx ? "var(--info)" : (isIncomeTx ? "var(--success)" : "var(--danger)"), whiteSpace: 'nowrap', textAlign: 'center' }}>
                                                {`${isNeutralTx ? ((t.neutralSign || (t.type === "expense" ? "-" : "+")) === "-" ? "-" : "+") : (isIncomeTx ? "+" : "-")}${formatCurrency(t.amount)}`}
                                            </td>

                                            <td className={`tx-cell-notes${t.notes ? '' : ' tx-cell-empty'}`} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: '110px', textAlign: 'center' }}>
                                                <span title={t.notes || ""}>{t.notes ? highlightText(t.notes.length > 35 ? t.notes.slice(0, 35) + "…" : t.notes, searchWords) : "—"}</span>
                                            </td>

                                            <td className="tx-cell-actions" style={{ textAlign: 'center', paddingRight: '8px' }}>
                                                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'center' }}>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        style={linkedRec ? {
                                                            background: '#EEF2FF',
                                                            color: '#4F46E5',
                                                            border: '1.5px solid #818CF8',
                                                            borderRadius: '7px',
                                                            padding: '2px 6px',
                                                            boxShadow: '0 1px 3px rgba(79, 70, 229, 0.12)'
                                                        } : {
                                                            border: 'none',
                                                            background: 'transparent',
                                                            color: 'var(--primary)',
                                                            padding: '4px 6px'
                                                        }}
                                                        onClick={() => setLinkModalTx(t)}
                                                        title={linkedRec ? `Linked to Recurring: ${linkedRec.name}` : "Link to Recurring Item"}
                                                    >
                                                        🔄
                                                    </button>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        style={{ border: 'none', color: 'var(--primary)', padding: '4px 6px' }}
                                                        onClick={() => setTxToEdit(t)}
                                                        title="Edit transaction"
                                                    >
                                                        ✏️
                                                    </button>
                                                    <button
                                                        className="btn btn-secondary btn-sm"
                                                        style={{ border: 'none', color: 'var(--danger)', padding: '4px 6px' }}
                                                        onClick={() => setTxToDelete(t)}
                                                        title="Delete row"
                                                    >
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
                </div>
            )}

            {/* Tag Editor modal overlay */}
            {activeTagTx && (
                <TagManagerModal
                    tx={activeTagTx}
                    tags={tags}
                    onClose={() => setActiveTagTx(null)}
                    onAddTag={onAddTag}
                    onSave={async (updatedTags) => {
                        if (onAddTag && Array.isArray(updatedTags)) {
                            for (const tg of updatedTags) {
                                await onAddTag(tg);
                            }
                        }
                        await onPatch(activeTagTx.id, { tags: updatedTags });
                        setActiveTagTx(null);
                    }}
                />
            )}

            {/* Link to Recurring Transaction Modal */}
            {linkModalTx && (() => {
                const linkCatParent = linkModalTx.category ? linkModalTx.category.split(" - ")[0] : "";
                const linkCustomType = (settings.categoryTypes || {})[linkModalTx.category] || (settings.categoryTypes || {})[linkCatParent];
                const isLinkNeutral = linkModalTx.type === "neutral" || linkCustomType === "neutral" || (!linkCustomType && ["Transfer", "Misc", "Others"].includes(linkCatParent));
                const isLinkIncome = !isLinkNeutral && (linkModalTx.type === "income" || linkCustomType === "income" || (!linkCustomType && linkCatParent === "Income"));
                const linkSignStr = isLinkNeutral ? (linkModalTx.neutralSign === '-' ? '-' : '+') : (isLinkIncome ? '+' : '-');

                // Filter recurring templates matching transaction category (or all recurring items if transaction is neutral)
                const linkCatNorm = (linkModalTx.category || "").trim().toLowerCase();
                const filteredRecurringList = recurringList.filter(r => {
                    if (isLinkNeutral) return true;
                    if (!linkCatNorm || linkCatNorm === "general") return true;
                    const rCat = (r.category || "").trim().toLowerCase();
                    if (!rCat) return true;
                    const rCatParent = rCat.split(" - ")[0];
                    const linkCatParentNorm = linkCatNorm.split(" - ")[0];
                    return rCat === linkCatNorm || rCatParent === linkCatParentNorm;
                }).sort((a, b) => {
                    if (isLinkNeutral) {
                        const aCat = (a.category || "").trim().toLowerCase();
                        const bCat = (b.category || "").trim().toLowerCase();
                        const aMatch = aCat === linkCatNorm ? 2 : (aCat.startsWith(linkCatNorm) ? 1 : 0);
                        const bMatch = bCat === linkCatNorm ? 2 : (bCat.startsWith(linkCatNorm) ? 1 : 0);
                        if (aMatch !== bMatch) return bMatch - aMatch;
                    }
                    return (a.name || "").localeCompare(b.name || "");
                });

                return (
                    <div className="modal-overlay" onClick={() => setLinkModalTx(null)}>
                        <div className="modal-container" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
                            <div className="modal-header" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)' }}>
                                <h3 className="modal-title">Link to Recurring Item</h3>
                                <button className="modal-close-btn" onClick={() => setLinkModalTx(null)}><Icon name="close" /></button>
                            </div>
                            <div className="modal-body" style={{ padding: '20px 24px' }}>
                                {/* Target Transaction Summary Bar (2-Line Layout) */}
                                <div style={{ padding: '14px 18px', borderRadius: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', marginBottom: '20px' }}>
                                    {/* Line 1: Item Name & Category */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', fontSize: '0.9rem' }}>
                                        <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Item: </span>
                                            <strong style={{ fontSize: '0.98rem', color: 'var(--text-main)' }}>{linkModalTx.narration || linkModalTx.merchant || "Transaction"}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Category: </span>
                                            <span className="badge" style={{ background: '#E2E8F0', color: '#334155', padding: '3px 8px', borderRadius: '6px', fontSize: '0.82rem', fontWeight: 600 }}>
                                                {linkModalTx.category || "General"}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Line 2: Date & Amount */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: '1px dashed #E2E8F0', fontSize: '0.86rem' }}>
                                        <div>
                                            <span style={{ color: 'var(--text-muted)' }}>Date: </span>
                                            <strong style={{ color: 'var(--text-main)' }}>{formatDate(linkModalTx.date, settings.dateFormat)}</strong>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--text-muted)' }}>Amount: </span>
                                            <strong style={{ fontSize: '1.05rem', color: isLinkIncome ? '#059669' : (isLinkNeutral ? '#0284C7' : '#DC2626'), whiteSpace: 'nowrap' }}>
                                                {`${linkSignStr}${formatCurrency(linkModalTx.amount)}`}
                                            </strong>
                                        </div>
                                    </div>
                                </div>

                                <p style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '12px' }}>
                                    {isLinkNeutral
                                        ? "Select Recurring Item to Link:"
                                        : <>Select Recurring Item under <strong>"{linkModalTx.category || "General"}"</strong> to Link:</>
                                    }
                                </p>

                                <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', paddingRight: '4px', marginBottom: '8px' }}>
                                    {/* Unlink Option */}
                                    {(() => {
                                        const currentRecId = linkModalTx.linkedRecurringId;
                                        const currentSiblings = currentRecId ? (transactions || []).filter(t => t.linkedRecurringId === currentRecId) : [];

                                        return (
                                            <div
                                                style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px',
                                                    borderRadius: '10px', border: !linkModalTx.linkedRecurringId ? '1.5px solid var(--primary)' : '1px solid var(--border-color)',
                                                    background: !linkModalTx.linkedRecurringId ? 'var(--primary-light)' : '#fff', cursor: 'pointer'
                                                }}
                                                onClick={async () => {
                                                    const cleanNotes = (notesStr) => {
                                                        if (!notesStr) return "";
                                                        return String(notesStr)
                                                            .replace(/\(Linked (Inflow|Outflow) from Dashboard on [^)]+\)/g, "")
                                                            .replace(/Linked (Inflow|Outflow) from Dashboard on [^\n\r.]*/g, "")
                                                            .replace(/\(Created (Inflow|Outflow) from Dashboard on [^)]+\)/g, "")
                                                            .replace(/Created (Inflow|Outflow) from Dashboard on [^\n\r.]*/g, "")
                                                            .trim();
                                                    };

                                                    if (currentSiblings.length > 0) {
                                                        for (const sib of currentSiblings) {
                                                            await onPatch(sib.id, {
                                                                linkedRecurringId: null,
                                                                notes: cleanNotes(sib.notes)
                                                            });
                                                        }
                                                    } else {
                                                        await onPatch(linkModalTx.id, {
                                                            linkedRecurringId: null,
                                                            notes: cleanNotes(linkModalTx.notes)
                                                        });
                                                    }
                                                    setLinkModalTx(null);
                                                }}
                                            >
                                                <div style={{ fontWeight: 600, fontSize: '0.86rem', color: 'var(--text-muted)' }}>
                                                    🚫 Unlink Recurring Item
                                                    {currentSiblings.length > 1 && (
                                                        <span style={{ fontSize: '0.76rem', color: '#DC2626', fontWeight: 600, marginLeft: '8px' }}>
                                                            (Unlinks all {currentSiblings.length} transactions)
                                                        </span>
                                                    )}
                                                </div>
                                                {!linkModalTx.linkedRecurringId && <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '0.78rem' }}>Selected</span>}
                                            </div>
                                        );
                                    })()}

                                    {filteredRecurringList.length === 0 ? (
                                        <div style={{ padding: '16px 18px', textAlign: 'center', color: 'var(--text-muted)', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0', fontSize: '0.84rem' }}>
                                            {isLinkNeutral
                                                ? "No recurring templates found."
                                                : <>No recurring templates found in category <strong>"{linkModalTx.category || "General"}"</strong>.</>
                                            }
                                        </div>
                                    ) : (
                                        filteredRecurringList.map(r => {
                                            const isSelected = linkModalTx.linkedRecurringId === r.id;
                                            const rType = r.type || "expense";
                                            const isRIncome = rType === "income";
                                            const rSign = isRIncome ? '+' : '-';
                                            const linkNow = new Date();
                                            const linkTodayStr = `${linkNow.getFullYear()}-${String(linkNow.getMonth() + 1).padStart(2, '0')}-${String(linkNow.getDate()).padStart(2, '0')}`;
                                            const isExp = r.endDate && r.endDate < linkTodayStr;

                                            return (
                                                <div
                                                    key={r.id}
                                                    style={{
                                                        display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.1fr) minmax(0, 2fr) minmax(0, 1.2fr)',
                                                        gap: '12px', alignItems: 'center', padding: '12px 18px',
                                                        borderRadius: '10px', border: isSelected ? '1.5px solid var(--primary)' : '1px solid var(--border-color)',
                                                        background: isSelected ? 'var(--primary-light)' : '#fff', cursor: 'pointer'
                                                    }}
                                                    onClick={async () => {
                                                        await onPatch(linkModalTx.id, { linkedRecurringId: r.id });
                                                        setLinkModalTx(null);
                                                    }}
                                                >
                                                    {/* Template Name */}
                                                    <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {r.name}
                                                    </div>

                                                    {/* Cadence */}
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {r.cadence || "Monthly"}
                                                        {isExp && <span style={{ fontSize: '0.66rem', background: '#F3F4F6', color: '#6B7280', padding: '1px 5px', borderRadius: '4px', marginLeft: '6px' }}>Expired</span>}
                                                    </div>

                                                    {/* Category */}
                                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {r.category || "General"}
                                                    </div>

                                                    {/* Amount */}
                                                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: isRIncome ? '#059669' : '#DC2626', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                        {`${rSign}${formatCurrency(r.amount)}`}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 24px', borderTop: '1px solid var(--border-color)' }}>
                                <button className="btn btn-secondary btn-sm" onClick={() => setLinkModalTx(null)}>Close</button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Edit Transaction Modal */}
            {txToEdit && (
                <EditTransactionModal
                    tx={txToEdit}
                    settings={settings}
                    tags={tags}
                    onClose={() => setTxToEdit(null)}
                    onAddTag={onAddTag}
                    onSave={async (patch) => {
                        if (onAddTag && patch.tags && Array.isArray(patch.tags)) {
                            for (const tg of patch.tags) {
                                await onAddTag(tg);
                            }
                        }
                        await onPatch(txToEdit.id, patch);
                        setTxToEdit(null);
                    }}
                />
            )}

            {/* Delete Transaction Confirmation Modal */}
            {txToDelete && (
                <div className="modal-overlay confirm-modal-overlay">
                    <div className="modal-container">
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ color: 'var(--danger)' }}>Confirm Transaction Deletion</h3>
                            <button className="modal-close-btn" onClick={() => setTxToDelete(null)}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '12px' }}>Are you sure you want to permanently delete this transaction?</p>
                            <div style={{ padding: '12px', backgroundColor: 'var(--bg-color)', borderRadius: '8px', border: '1px solid var(--border-color)', fontSize: '0.9rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Date:</span>
                                    <span style={{ fontWeight: 500 }}>{formatDate(txToDelete.date, settings.dateFormat)}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Merchant:</span>
                                    <span style={{ fontWeight: 500 }}>{txToDelete.merchant}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Amount:</span>
                                    <span style={{ fontWeight: 600, color: txToDelete.type === 'income' ? 'var(--success)' : 'var(--danger)' }}>
                                        {txToDelete.type === 'income' ? '+' : '-'}{formatCurrency(txToDelete.amount)}
                                    </span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>Category:</span>
                                    <span className="badge" style={{ backgroundColor: 'var(--border-color)', color: 'var(--text-main)', padding: '2px 6px', borderRadius: '4px' }}>{txToDelete.category}</span>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={() => setTxToDelete(null)}>Cancel</button>
                            <button className="btn btn-danger" onClick={async () => {
                                await onDelete(txToDelete.id);
                                setTxToDelete(null);
                            }}>
                                Confirm Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Category Picker Modal */}
            {categoryPickerTx && (() => {
                const catParent = categoryPickerTx.category ? categoryPickerTx.category.split(" - ")[0] : "";
                const customType = (settings.categoryTypes || {})[categoryPickerTx.category] || (settings.categoryTypes || {})[catParent];
                let pickerType = categoryPickerTx.type;
                if (pickerType !== "neutral" && pickerType !== "income") {
                    if (customType) pickerType = customType;
                    else if (["Transfer", "Misc", "Others"].includes(catParent)) pickerType = "neutral";
                    else if (catParent === "Income") pickerType = "income";
                    else pickerType = pickerType || "expense";
                }
                return (
                    <CategoryPickerModal
                        categories={filterCategoriesByType(categories, pickerType, settings.categoryTypes)}
                        selected={categoryPickerTx.category}
                        onSelect={async (newCat) => {
                            await onPatch(categoryPickerTx.id, { category: newCat });
                            setCategoryPickerTx(null);
                        }}
                        onClose={() => setCategoryPickerTx(null)}
                    />
                );
            })()}
        </div>
    );
};

// --- SUB-PAGE: Recurring Transactions (Section 10) ---
