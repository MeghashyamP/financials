import React from 'react';
import { CategoryPickerModal } from './modals/TransactionModals.jsx';

// Column header bar for the Transactions page. Clicking a column name opens a small
// filter popover; the little arrows next to it still sort. A filtered column is shown
// in the primary colour, bold and underlined (no "Filtered" badge).
export const TxColumnHeaders = ({
    settings, tags = [],
    sortField, handleTxSort, renderSortIcon,
    narrationFilter, setNarrationFilter,
    categoryFilter, setCategoryFilter,
    accountFilter, setAccountFilter,
    tagFilter, setTagFilter,
    typeFilter, setTypeFilter,
    amountFilter, setAmountFilter,
    notesFilter, setNotesFilter,
}) => {
    const [open, setOpen] = React.useState(null);
    const barRef = React.useRef(null);

    React.useEffect(() => {
        if (!open) return;
        const onDown = (e) => { if (open !== 'category' && barRef.current && !barRef.current.contains(e.target)) setOpen(null); };
        const onKey = (e) => { if (e.key === "Escape") setOpen(null); };
        document.addEventListener("mousedown", onDown);
        window.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [open]);

    const categories = settings?.categories || [];
    const accounts = settings?.accounts || [];
    
    const filtered = {
        narration: !!narrationFilter,
        category: categoryFilter.length > 0,
        account: accountFilter.length > 0,
        tags: tagFilter.length > 0,
        amount: typeFilter.length > 0 || !!amountFilter,
        notes: !!notesFilter,
    };

    const toggle = (key) => { setOpen(o => (o === key ? null : key));  };

    const popStyle = (align) => ({
        position: 'absolute', top: 'calc(100% + 8px)', zIndex: 60, width: '230px',
        background: 'var(--card-bg, #fff)', border: '1px solid var(--border-color)', borderRadius: '10px',
        boxShadow: '0 8px 24px rgba(15,23,42,0.14)', padding: '10px', textTransform: 'none',
        letterSpacing: 'normal', fontWeight: 500, color: 'var(--text-main)', fontSize: '0.82rem', textAlign: 'left',
        ...(align === 'left' ? { left: 0 } : align === 'right' ? { right: 0 } : { left: '50%', transform: 'translateX(-50%)' })
    });

    const optionStyle = (selected) => ({
        padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
        background: selected ? 'var(--primary-light, #EEF2FF)' : 'transparent',
        color: selected ? 'var(--primary)' : 'inherit', fontWeight: selected ? 700 : 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
    });

    const clearBtn = (onClear, active) => active && (
        <button className="btn btn-secondary btn-sm" style={{ marginTop: '8px', width: '100%' }}
            onClick={() => { onClear(); setOpen(null); }}>Clear filter</button>
    );

    const textPopover = (value, setValue, placeholder, align) => (
        <div style={popStyle(align)} onClick={(e) => e.stopPropagation()}>
            <input autoFocus className="form-control" style={{ width: '100%', height: '32px', fontSize: '0.82rem' }}
                placeholder={placeholder} value={value} onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') setOpen(null); }} />
            {clearBtn(() => setValue(""), !!value)}
        </div>
    );

    const listPopover = (items, current, setValue, align, emptyLabel) => {
        const toggleItem = (v) => setValue(current.includes(v) ? current.filter(x => x !== v) : [...current, v]);
        return (
            <div style={popStyle(align)} onClick={(e) => e.stopPropagation()}>
                <div style={{ maxHeight: '260px', overflowY: 'auto' }}>
                    {items.map(it => {
                        const on = current.includes(it.value);
                        return (
                            <label key={it.value} style={{ ...optionStyle(on), display: 'flex', alignItems: 'center', gap: '8px' }} title={it.label}>
                                <input type="checkbox" checked={on} onChange={() => toggleItem(it.value)} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
                            </label>
                        );
                    })}
                    {items.length === 0 && <div style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{emptyLabel}</div>}
                </div>
                {clearBtn(() => setValue([]), current.length > 0)}
            </div>
        );
    };

    const header = (key, label, { sortKey = key, align = 'center', isFilter = true } = {}) => {
        const isFiltered = isFilter && filtered[key];
        const isSorted = sortField === sortKey;
        return (
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: align === 'left' ? 'flex-start' : 'center' }}>
                <span
                    onClick={() => (isFilter ? toggle(key) : handleTxSort(sortKey))}
                    title={isFilter ? `Filter by ${label.toLowerCase()}` : `Sort by ${label.toLowerCase()}`}
                    style={{
                        cursor: 'pointer',
                        color: (isFiltered || isSorted) ? 'var(--primary)' : 'inherit',
                        fontWeight: (isFiltered || isSorted) ? 700 : 600,
                        textDecoration: isFiltered ? 'underline' : 'none',
                        textUnderlineOffset: '3px'
                    }}
                >{label}</span>
                {renderSortIcon(sortKey)}
                {open === key && key === 'narration' && textPopover(narrationFilter, setNarrationFilter, 'Narration contains…', 'left')}
                {open === key && key === 'notes' && textPopover(notesFilter, setNotesFilter, 'Notes contain…', 'right')}
                {open === key && key === 'account' && listPopover(accounts.map(a => ({ value: a, label: a })), accountFilter, setAccountFilter, 'center', 'No accounts yet')}
                {open === key && key === 'tags' && listPopover((tags || []).map(t => ({ value: t.name, label: t.name })), tagFilter, setTagFilter, 'center', 'No tags yet')}
                {open === key && key === 'category' && (
                    <CategoryPickerModal
                        title="Filter by Category"
                        categories={categories}
                        selected={categoryFilter}
                        onSelect={(c) => setCategoryFilter(categoryFilter.includes(c) ? categoryFilter.filter(x => x !== c) : [...categoryFilter, c])}
                        onSelectGroup={(p) => setCategoryFilter(categoryFilter.includes(p) ? categoryFilter.filter(x => x !== p) : [...categoryFilter, p])}
                        onClear={() => setCategoryFilter([])}
                        onClose={() => setOpen(null)}
                    />
                )}
                {open === key && key === 'amount' && (
                    <div style={popStyle('right')} onClick={(e) => e.stopPropagation()}>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '4px' }}>Type</div>
                        {[['expense', 'Outflow'], ['income', 'Inflow'], ['neutral', 'Neutral']].map(([v, l]) => {
                            const on = typeFilter.includes(v);
                            return (
                                <label key={v} style={{ ...optionStyle(on), display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <input type="checkbox" checked={on} onChange={() => setTypeFilter(on ? typeFilter.filter(x => x !== v) : [...typeFilter, v])} />
                                    {l}
                                </label>
                            );
                        })}
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '8px 0 4px' }}>Amount contains (comma for several)</div>
                        <input className="form-control" style={{ width: '100%', height: '30px', fontSize: '0.82rem' }}
                            placeholder="e.g. 500, 1200" value={amountFilter} onChange={(e) => setAmountFilter(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') setOpen(null); }} />
                        {clearBtn(() => { setTypeFilter([]); setAmountFilter(""); }, filtered.amount)}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div ref={barRef} className="tx-column-headers-bar" style={{
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
            userSelect: 'none',
            position: 'relative',
            zIndex: 5
        }}>
            {header('date', 'Date', { align: 'left', isFilter: false })}
            {header('narration', 'Narration', { align: 'left' })}
            {header('category', 'Category')}
            {header('account', 'Account')}
            {header('tags', 'Tags')}
            {header('amount', 'Amount')}
            {header('notes', 'Notes')}
            <div style={{ textAlign: 'center' }}>Actions</div>
        </div>
    );
};
