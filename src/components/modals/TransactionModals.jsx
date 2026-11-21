import React from 'react';
import { 
  Icon, DatePickerField, DEFAULT_CATEGORIES, filterCategoriesByType, 
  getContrastTextColor, formatCategorySubIconFirst, useEscapeKey, formatCurrencyVal,
  CATEGORY_DESCRIPTIONS, getCurrencySymbol
} from '../../utils.jsx';

        export const CategoryPickerModal = ({ categories, selected, onSelect, onClose, title = "Select Category", onSelectGroup, onClear }) => {
            const [search, setSearch] = React.useState("");
            // `selected` may be a single value (picker) or an array (multi-select filter)
            const isMulti = Array.isArray(selected);
            const has = (v) => isMulti ? selected.includes(v) : selected === v;
            const [activeTab, setActiveTab] = React.useState("all");
            useEscapeKey(onClose);

            // Lock body scroll while category picker is mounted
            React.useEffect(() => {
                const prevOverflow = document.body.style.overflow;
                document.body.style.overflow = 'hidden';
                return () => {
                    document.body.style.overflow = prevOverflow;
                };
            }, []);

            // Navigate / scroll directly to the selected category on modal open
            React.useEffect(() => {
                if (selected && !isMulti) {
                    const timer = setTimeout(() => {
                        const selectedEl = document.querySelector('.category-picker-body .selected');
                        if (selectedEl) {
                            selectedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        }
                    }, 80);
                    return () => clearTimeout(timer);
                }
            }, [selected]);

            // Group categories by parent
            const grouped = React.useMemo(() => {
                const groups = {};
                categories.forEach(c => {
                    const parent = c.includes(" - ") ? c.split(" - ")[0] : "Others";
                    const subAndEmoji = c.includes(" - ") ? c.split(" - ")[1] : c;

                    // Extract label and emoji
                    const emojiMatch = subAndEmoji.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji}/u);
                    const emoji = emojiMatch ? emojiMatch[0] : "⚙️";
                    const label = subAndEmoji.replace(emoji, "").trim();

                    if (!groups[parent]) {
                        groups[parent] = {
                            name: parent,
                            description: CATEGORY_DESCRIPTIONS[parent] || "",
                            items: []
                        };
                    }
                    groups[parent].items.push({
                        full: c,
                        label: label,
                        emoji: emoji
                    });
                });
                return groups;
            }, [categories]);

            const parentGroupsList = React.useMemo(() => Object.keys(grouped), [grouped]);

            // Filter groups and items based on search query
            const filteredGroups = React.useMemo(() => {
                const query = search.toLowerCase().trim();
                let groupValues = Object.values(grouped);

                // When user types a search query, search across ALL categories & subcategories regardless of selected tab below
                if (query) {
                    const result = [];
                    groupValues.forEach(g => {
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
                if (activeTab !== "all") {
                    groupValues = groupValues.filter(g => g.name === activeTab);
                }

                return groupValues;
            }, [grouped, search, activeTab]);

            // Total category item count available in view
            const totalCategoriesCount = React.useMemo(() => {
                return filteredGroups.reduce((acc, g) => acc + g.items.length, 0);
            }, [filteredGroups]);

            return (
                <div className="category-picker-overlay" onClick={onClose}>
                    <div className="category-picker-container" onClick={(e) => e.stopPropagation()}>
                        <div className="category-picker-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h3 className="modal-title" style={{ margin: 0 }}>{title}</h3>
                                <span className="badge badge-info" style={{ fontSize: '0.72rem', padding: '3px 8px', borderRadius: '12px' }}>
                                    {totalCategoriesCount} Available
                                </span>
                            </div>
                            {isMulti && <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-muted)' }}>{selected.length} selected</span>}
                            {onClear && (isMulti ? selected.length > 0 : (selected && selected !== 'all')) && (
                                <button type="button" className="btn btn-secondary btn-sm" style={{ marginLeft: isMulti ? '10px' : 'auto', marginRight: '10px' }} onClick={onClear}>Clear filter</button>
                            )}
                            {isMulti && <button type="button" className="btn btn-primary btn-sm" style={{ marginRight: '10px' }} onClick={onClose}>Done</button>}
                            <button type="button" className="modal-close-btn" onClick={onClose}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <line x1="18" y1="6" x2="6" y2="18"></line>
                                    <line x1="6" y1="6" x2="18" y2="18"></line>
                                </svg>
                            </button>
                        </div>

                        {/* Search Bar */}
                        <div className="category-picker-search-container">
                            <input
                                type="text"
                                className="category-picker-search-input"
                                placeholder="Search categories..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                autoFocus
                            />
                        </div>

                        {/* Horizontal Quick Filter Tabs */}
                        <div className="category-picker-tab-bar">
                            <div
                                className={`category-picker-tab ${activeTab === "all" ? "active" : ""}`}
                                onClick={() => setActiveTab("all")}
                            >
                                All Groups ({categories.length})
                            </div>
                            {parentGroupsList.map(name => {
                                const itemCount = grouped[name]?.items?.length || 0;
                                return (
                                    <div
                                        key={name}
                                        className={`category-picker-tab ${activeTab === name ? "active" : ""}`}
                                        onClick={() => setActiveTab(name)}
                                    >
                                        {name} ({itemCount})
                                    </div>
                                );
                            })}
                        </div>

                        {/* Modal Body */}
                        <div className="category-picker-body">
                            {filteredGroups.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--text-muted)' }}>
                                    <p style={{ marginBottom: '0', fontSize: '0.9rem' }}>
                                        No matching categories found for "<strong>{search}</strong>".
                                    </p>
                                </div>
                            ) : (
                                filteredGroups.map(g => {
                                    const hasSubcategories = g.items.length > 1 || (g.items.length === 1 && g.items[0].label !== g.name);

                                    if (hasSubcategories) {
                                        const isParentSelected = isMulti ? has(g.name) : (selected === g.name || (selected && selected.startsWith(g.name + " - ")));

                                        return (
                                            <div key={g.name} className="category-group">
                                                <div
                                                    className="category-group-header"
                                                    onClick={() => {
                                                        if (onSelectGroup) { onSelectGroup(g.name); return; }
                                                        const othersItem = g.items.find(item => item.label.toLowerCase() === "others") || g.items[0];
                                                        onSelect(othersItem.full);
                                                    }}
                                                >
                                                    <div className={`category-group-radio ${isParentSelected ? 'selected' : ''}`}>
                                                        <div className="category-group-radio-inner"></div>
                                                    </div>
                                                    <div className="category-group-info">
                                                        <span className="category-group-title">{g.name}</span>
                                                        {g.description && <span className="category-group-desc">• {g.description}</span>}
                                                    </div>
                                                </div>
                                                <div className="subcategory-grid">
                                                    {g.items.map(item => {
                                                        const isSel = has(item.full);
                                                        return (
                                                            <button
                                                                key={item.full}
                                                                type="button"
                                                                className={`subcategory-button ${isSel ? 'selected' : ''}`}
                                                                onClick={() => onSelect(item.full)}
                                                                title={item.full}
                                                            >
                                                                <div className="subcategory-emoji-container">
                                                                    {item.emoji}
                                                                </div>
                                                                <span className="subcategory-label">{item.label}</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    } else {
                                        const item = g.items[0];
                                        const isSel = has(item.full) || has(g.name);

                                        return (
                                            <div
                                                key={g.name}
                                                className={`category-list-item-row ${isSel ? 'selected' : ''}`}
                                                onClick={() => onSelect(item.full)}
                                            >
                                                <div className={`category-group-radio ${isSel ? 'selected' : ''}`}>
                                                    <div className="category-group-radio-inner"></div>
                                                </div>
                                                <div className="category-list-item-emoji-circle">
                                                    {item.emoji}
                                                </div>
                                                <div className="category-group-info" style={{ flex: 1 }}>
                                                    <span className="category-group-title">{g.name}</span>
                                                    <span className="category-group-desc">{g.description}</span>
                                                </div>
                                            </div>
                                        );
                                    }
                                })
                            )}
                        </div>
                    </div>
                </div>
            );
        };

        // --- MODAL COMPONENT: Edit Transaction ---
        export const EditTransactionModal = ({ tx, onClose, onSave, settings, tags = [], onAddTag }) => {
            useEscapeKey(onClose);
            const initialType = React.useMemo(() => {
                if (tx.type === "neutral") return "neutral";
                if (tx.type === "income") return "income";
                const catParent = tx.category ? tx.category.split(" - ")[0] : "";
                const customType = (settings?.categoryTypes || {})[tx.category] || (settings?.categoryTypes || {})[catParent];
                if (customType === "neutral") return "neutral";
                if (customType === "income") return "income";
                if (customType === "expense") return "expense";
                if (["Transfer", "Misc", "Others"].includes(catParent)) return "neutral";
                if (catParent === "Income") return "income";
                return tx.type || "expense";
            }, [tx, settings]);

            const [type, setType] = React.useState(initialType);
            const [neutralSign, setNeutralSign] = React.useState(tx.neutralSign || "+");
            const [amount, setAmount] = React.useState(String(tx.amount || ""));
            const [narration, setNarration] = React.useState(tx.narration || tx.merchant || "");
            const [refId, setRefId] = React.useState(tx.refId || "");
            const [date, setDate] = React.useState(tx.date || "");
            const [category, setCategory] = React.useState(tx.category || "");
            const [account, setAccount] = React.useState(tx.account || "");
            const [selectedTags, setSelectedTags] = React.useState(tx.tags || []);
            const [notes, setNotes] = React.useState(tx.notes || "");
            const [showCategoryPicker, setShowCategoryPicker] = React.useState(false);

            // Tag creation state
            const [newTagName, setNewTagName] = React.useState("");
            const [newTagColor, setNewTagColor] = React.useState("#4F46E5");

            const handleCreateTag = async () => {
                const name = newTagName.trim();
                if (!name) return;

                if (onAddTag) {
                    await onAddTag({ name, color: newTagColor, createdAt: new Date().toISOString() });
                }
                if (!selectedTags.includes(name)) {
                    setSelectedTags([...selectedTags, name]);
                }
                setNewTagName("");
            };

            const handleTypeChange = (newType) => {
                setType(newType);
                const validCats = filterCategoriesByType(settings.categories || DEFAULT_CATEGORIES, newType, settings.categoryTypes);
                if (!validCats.includes(category)) {
                    setCategory(validCats[0] || "Others - Others ⚙️");
                }
            };

            const toggleTag = (tagName) => {
                if (selectedTags.includes(tagName)) {
                    setSelectedTags(selectedTags.filter(t => t !== tagName));
                } else {
                    setSelectedTags([...selectedTags, tagName]);
                }
            };

            const handleSubmit = (e) => {
                e.preventDefault();
                if (!amount || isNaN(amount) || parseFloat(amount) <= 0 || !narration) return;

                onSave({
                    type,
                    neutralSign: type === "neutral" ? neutralSign : undefined,
                    amount: parseFloat(amount),
                    narration,
                    merchant: narration, // keep merchant in sync for fingerprinting/rules
                    refId,
                    date,
                    category,
                    account,
                    tags: selectedTags,
                    notes
                });
            };

            return (
                <div className="modal-overlay">
                    <div className="modal-container">
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ flex: 1, textAlign: 'center' }}>Edit Transaction</h3>
                            <button className="modal-close-btn" onClick={onClose}>
                                <Icon name="close" />
                            </button>
                        </div>
                        {/* Frozen sub-header: Outflow / Inflow / Neutral toggle */}
                        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-color)', flexShrink: 0, background: 'var(--card-bg)' }}>
                            <div className="segmented-control">
                                <button type="button" className={`segmented-btn ${type === "expense" ? "active expense" : ""}`} onClick={() => handleTypeChange("expense")}>Outflow</button>
                                <button type="button" className={`segmented-btn ${type === "income" ? "active income" : ""}`} onClick={() => handleTypeChange("income")}>Inflow</button>
                                <button type="button" className={`segmented-btn ${type === "neutral" ? "active neutral" : ""}`} onClick={() => handleTypeChange("neutral")}>Neutral</button>
                            </div>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                            <div className="modal-body">
                                <div className="form-grid">

                                    {/* Amount & Date */}
                                    <div className="form-row">
                                        <div className="form-field">
                                            <label>Amount ({getCurrencySymbol(settings?.currency || "INR")})</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {type === "neutral" ? (
                                                    <button
                                                        type="button"
                                                        style={{
                                                            width: '38px',
                                                            height: '38px',
                                                            borderRadius: '8px',
                                                            border: `1px solid ${neutralSign === '+' ? 'var(--success)' : 'var(--danger)'}`,
                                                            backgroundColor: neutralSign === '+' ? 'var(--success)' : 'var(--danger)',
                                                            color: '#FFFFFF',
                                                            fontWeight: 800,
                                                            fontSize: '1.2rem',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            flexShrink: 0,
                                                            boxShadow: 'var(--shadow-sm)',
                                                            userSelect: 'none',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                        onClick={() => setNeutralSign(neutralSign === "+" ? "-" : "+")}
                                                        title={`Click to toggle sign (currently ${neutralSign === "+" ? "Positive (+)" : "Negative (-)"})`}
                                                    >
                                                        {neutralSign}
                                                    </button>
                                                ) : (
                                                    <div
                                                        style={{
                                                            width: '38px',
                                                            height: '38px',
                                                            borderRadius: '8px',
                                                            border: `1px solid ${type === 'income' ? 'var(--success)' : 'var(--danger)'}`,
                                                            backgroundColor: type === 'income' ? 'var(--success)' : 'var(--danger)',
                                                            color: '#FFFFFF',
                                                            fontWeight: 800,
                                                            fontSize: '1.2rem',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            flexShrink: 0,
                                                            userSelect: 'none'
                                                        }}
                                                        title={type === 'income' ? 'Inflow (+)' : 'Outflow (-)'}
                                                    >
                                                        {type === 'income' ? '+' : '-'}
                                                    </div>
                                                )}
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="form-control"
                                                    placeholder="0.00"
                                                    value={amount}
                                                    onChange={(e) => setAmount(e.target.value)}
                                                    required
                                                    style={{
                                                        fontWeight: 700,
                                                        fontSize: '1.05rem',
                                                        color: (type === 'neutral' ? neutralSign === '+' : type === 'income') ? 'var(--success)' : 'var(--danger)'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className="form-field">
                                            <label>Date</label>
                                            <DatePickerField
                                                value={date}
                                                onChange={setDate}
                                                dateFormat={settings.dateFormat}
                                                label="Select date"
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Narration (primary description) */}
                                    <div className="form-field">
                                        <label>Narration</label>
                                        <input type="text" className="form-control" placeholder="e.g. UPI THANNERU VENKATA NA..." value={narration} onChange={(e) => setNarration(e.target.value)} required />
                                    </div>

                                    {/* Ref ID & Account — half/half */}
                                    <div className="form-row">
                                        <div className="form-field">
                                            <label>Ref ID <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(hidden in ledger)</span></label>
                                            <input type="text" className="form-control" placeholder="e.g. TXN1234567" value={refId} onChange={(e) => setRefId(e.target.value)} />
                                        </div>
                                        <div className="form-field">
                                            <label>Account</label>
                                            <select className="form-control" value={account} onChange={(e) => setAccount(e.target.value)}>
                                                {settings.accounts?.map(a => <option key={a} value={a}>{a}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Category — full width */}
                                    <div className="form-field">
                                        <label>Category</label>
                                        <button type="button" className="category-select-trigger" onClick={() => setShowCategoryPicker(true)}>
                                            <div className="category-trigger-content">
                                                {(() => {
                                                    const parent = category.includes(" - ") ? category.split(" - ")[0] : "";
                                                    const subAndEmoji = category.includes(" - ") ? category.split(" - ")[1] : category;
                                                    const emojiMatch = subAndEmoji.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji}/u);
                                                    const emoji = emojiMatch ? emojiMatch[0] : "⚙️";
                                                    const label = subAndEmoji.replace(emoji, "").trim();
                                                    return (<><span className="category-trigger-emoji">{emoji}</span><span className="category-trigger-label">{parent ? `${parent} › ${label}` : label}</span></>);
                                                })()}
                                            </div>
                                            <span className="category-trigger-arrow">▼</span>
                                        </button>
                                    </div>

                                    {/* Tags Section with Clear Separation */}
                                    <div className="form-field">
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                                            {/* 1. Attached Tags Box */}
                                            <div>
                                                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span>Attached Tags ({selectedTags.length})</span>
                                                </label>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '38px', padding: '8px', border: '1.5px solid var(--border-color)', borderRadius: '8px', backgroundColor: '#F8FAFC', alignItems: 'center' }}>
                                                    {selectedTags.length === 0 ? (
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No tags attached to this transaction</span>
                                                    ) : (
                                                        selectedTags.map(tagName => {
                                                            const foundTag = (tags || []).find(t => t.name.toLowerCase() === tagName.toLowerCase());
                                                            const tagColor = foundTag ? (foundTag.color || 'var(--primary)') : 'var(--primary)';
                                                            const textColor = getContrastTextColor(tagColor);
                                                            const needsBorder = textColor === '#1E293B';
                                                            return (
                                                                <span
                                                                    key={tagName}
                                                                    className="tag-pill"
                                                                    style={{
                                                                        backgroundColor: tagColor,
                                                                        color: textColor,
                                                                        border: needsBorder ? '1px solid #CBD5E1' : 'none',
                                                                        fontWeight: 600,
                                                                        fontSize: '0.78rem',
                                                                        padding: '4px 10px',
                                                                        borderRadius: '14px',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '6px',
                                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                                                    }}
                                                                >
                                                                    <span>{tagName}</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setSelectedTags(selectedTags.filter(t => t !== tagName))}
                                                                        style={{
                                                                            background: 'none',
                                                                            border: 'none',
                                                                            color: textColor,
                                                                            cursor: 'pointer',
                                                                            fontWeight: 'bold',
                                                                            fontSize: '0.88rem',
                                                                            lineHeight: 1,
                                                                            padding: 0,
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            opacity: 0.85
                                                                        }}
                                                                        title="Remove Tag"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </span>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>

                                            {/* 2. Available Tags Box */}
                                            <div>
                                                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px', display: 'block' }}>
                                                    Available Tags <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>(click to attach)</span>
                                                </label>

                                                {/* Create & Attach New Tag Row */}
                                                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                                                    <input
                                                        type="text"
                                                        className="form-control"
                                                        placeholder="Create & attach new tag..."
                                                        value={newTagName}
                                                        onChange={(e) => setNewTagName(e.target.value)}
                                                        style={{ flex: 1 }}
                                                    />
                                                    <input
                                                        type="color"
                                                        value={newTagColor}
                                                        onChange={(e) => setNewTagColor(e.target.value)}
                                                        style={{ width: '38px', height: '36px', padding: '2px', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}
                                                        title="Pick Tag Color"
                                                    />
                                                    <button type="button" className="btn btn-secondary" onClick={handleCreateTag}>Create</button>
                                                </div>

                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '110px', overflowY: 'auto', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                                    {tags.filter(t => !selectedTags.includes(t.name)).length === 0 ? (
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                            {tags.length === 0 ? 'No tags created yet' : 'All available tags attached'}
                                                        </span>
                                                    ) : (
                                                        tags.filter(t => !selectedTags.includes(t.name)).map(t => {
                                                            const tagColor = t.color || 'var(--primary)';
                                                            const textColor = getContrastTextColor(tagColor);
                                                            return (
                                                                <span
                                                                    key={t.name}
                                                                    onClick={() => setSelectedTags([...selectedTags, t.name])}
                                                                    style={{
                                                                        cursor: 'pointer',
                                                                        padding: '4px 12px',
                                                                        borderRadius: '16px',
                                                                        fontSize: '0.78rem',
                                                                        fontWeight: 600,
                                                                        backgroundColor: tagColor,
                                                                        color: textColor,
                                                                        border: textColor === '#1E293B' ? '1px solid #CBD5E1' : '1px solid transparent',
                                                                        opacity: 1,
                                                                        transition: 'all 0.15s ease',
                                                                        userSelect: 'none',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px'
                                                                    }}
                                                                    title={`Click to attach ${t.name}`}
                                                                >
                                                                    <span>+ {t.name}</span>
                                                                </span>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>

                                        </div>
                                    </div>

                                    {/* Notes */}
                                    <div className="form-field">
                                        <label>Notes</label>
                                        <textarea className="form-control" placeholder="Additional notes or context..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ resize: 'vertical', minHeight: '60px' }} />
                                    </div>

                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Changes</button>
                            </div>
                        </form>

                        {showCategoryPicker && (
                            <CategoryPickerModal
                                categories={filterCategoriesByType(settings.categories || DEFAULT_CATEGORIES, type, settings.categoryTypes)}
                                selected={category}
                                onSelect={(cat) => { setCategory(cat); setShowCategoryPicker(false); }}
                                onClose={() => setShowCategoryPicker(false)}
                            />
                        )}
                    </div>
                </div>
            );
        };


        // --- MODAL COMPONENT: Manual Add entry Form ---
        export const AddEntryModal = ({ onClose, onSave, settings, tags, onAddTag }) => {
            useEscapeKey(onClose);
            const [type, setType] = React.useState("expense");
            const [neutralSign, setNeutralSign] = React.useState("+");
            const [amount, setAmount] = React.useState("");
            const [narration, setNarration] = React.useState("");
            const [refId, setRefId] = React.useState("");
            const [date, setDate] = React.useState(() => {
                const now = new Date();
                const y = now.getFullYear();
                const m = String(now.getMonth() + 1).padStart(2, '0');
                const d = String(now.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            });
            const [category, setCategory] = React.useState(() => {
                const valid = filterCategoriesByType(settings.categories || DEFAULT_CATEGORIES, "expense", settings.categoryTypes);
                return valid[0] || "Food & Drinks - Breakfast 🍳";
            });
            const [account, setAccount] = React.useState(settings.accounts?.[0] || "Bank 1");
            const [selectedTags, setSelectedTags] = React.useState([]);
            const [notes, setNotes] = React.useState("");
            const [showCategoryPicker, setShowCategoryPicker] = React.useState(false);

            const handleTypeChange = (newType) => {
                setType(newType);
                const validCats = filterCategoriesByType(settings.categories || DEFAULT_CATEGORIES, newType, settings.categoryTypes);
                if (!validCats.includes(category)) {
                    setCategory(validCats[0] || "Food & Drinks - Breakfast 🍳");
                }
            };

            // Tag creations
            const [newTagName, setNewTagName] = React.useState("");
            const [newTagColor, setNewTagColor] = React.useState("#4F46E5");

            const handleCreateTag = async () => {
                const name = newTagName.trim();
                if (!name) return;

                if (tags.some(t => t.name.toLowerCase() === name.toLowerCase())) {
                    setNewTagName("");
                    return;
                }

                await onAddTag({ name, color: newTagColor, createdAt: new Date().toISOString() });
                setSelectedTags([...selectedTags, name]);
                setNewTagName("");
            };

            const toggleTag = (tagName) => {
                if (selectedTags.includes(tagName)) {
                    setSelectedTags(selectedTags.filter(t => t !== tagName));
                } else {
                    setSelectedTags([...selectedTags, tagName]);
                }
            };

            const handleSubmit = (e) => {
                e.preventDefault();
                if (!amount || isNaN(amount) || parseFloat(amount) <= 0 || !narration) return;

                onSave({
                    type,
                    neutralSign: type === "neutral" ? neutralSign : undefined,
                    amount: parseFloat(amount),
                    narration,
                    merchant: narration, // keep merchant in sync for fingerprinting/rules
                    refId,
                    date,
                    category,
                    account,
                    tags: selectedTags,
                    notes,
                    source: "manual"
                });
            };

            return (
                <div className="modal-overlay">
                    <div className="modal-container">
                        <div className="modal-header">
                            <h3 className="modal-title" style={{ flex: 1, textAlign: 'center' }}>Create Transaction</h3>
                            <button className="modal-close-btn" onClick={onClose}>
                                <Icon name="close" />
                            </button>
                        </div>
                        {/* Frozen sub-header: Outflow / Inflow / Neutral toggle */}
                        <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border-color)', flexShrink: 0, background: 'var(--card-bg)' }}>
                            <div className="segmented-control">
                                <button
                                    type="button"
                                    className={`segmented-btn ${type === "expense" ? "active expense" : ""}`}
                                    onClick={() => handleTypeChange("expense")}
                                >
                                    Outflow
                                </button>
                                <button
                                    type="button"
                                    className={`segmented-btn ${type === "income" ? "active income" : ""}`}
                                    onClick={() => handleTypeChange("income")}
                                >
                                    Inflow
                                </button>
                                <button
                                    type="button"
                                    className={`segmented-btn ${type === "neutral" ? "active neutral" : ""}`}
                                    onClick={() => handleTypeChange("neutral")}
                                >
                                    Neutral
                                </button>
                            </div>
                        </div>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                            <div className="modal-body">
                                <div className="form-grid">

                                    {/* Amount & Date */}
                                    <div className="form-row">
                                        <div className="form-field">
                                            <label>Amount ({getCurrencySymbol(settings?.currency || "INR")})</label>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {type === "neutral" ? (
                                                    <button
                                                        type="button"
                                                        style={{
                                                            width: '38px',
                                                            height: '38px',
                                                            borderRadius: '8px',
                                                            border: `1px solid ${neutralSign === '+' ? 'var(--success)' : 'var(--danger)'}`,
                                                            backgroundColor: neutralSign === '+' ? 'var(--success)' : 'var(--danger)',
                                                            color: '#FFFFFF',
                                                            fontWeight: 800,
                                                            fontSize: '1.2rem',
                                                            cursor: 'pointer',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            flexShrink: 0,
                                                            boxShadow: 'var(--shadow-sm)',
                                                            userSelect: 'none',
                                                            transition: 'all 0.15s ease'
                                                        }}
                                                        onClick={() => setNeutralSign(neutralSign === "+" ? "-" : "+")}
                                                        title={`Click to toggle sign (currently ${neutralSign === "+" ? "Positive (+)" : "Negative (-)"})`}
                                                    >
                                                        {neutralSign}
                                                    </button>
                                                ) : (
                                                    <div
                                                        style={{
                                                            width: '38px',
                                                            height: '38px',
                                                            borderRadius: '8px',
                                                            border: `1px solid ${type === 'income' ? 'var(--success)' : 'var(--danger)'}`,
                                                            backgroundColor: type === 'income' ? 'var(--success)' : 'var(--danger)',
                                                            color: '#FFFFFF',
                                                            fontWeight: 800,
                                                            fontSize: '1.2rem',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            flexShrink: 0,
                                                            userSelect: 'none'
                                                        }}
                                                        title={type === 'income' ? 'Inflow (+)' : 'Outflow (-)'}
                                                    >
                                                        {type === 'income' ? '+' : '-'}
                                                    </div>
                                                )}
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    className="form-control"
                                                    placeholder="0.00"
                                                    value={amount}
                                                    onChange={(e) => setAmount(e.target.value)}
                                                    required
                                                    style={{
                                                        fontWeight: 700,
                                                        fontSize: '1.05rem',
                                                        color: (type === 'neutral' ? neutralSign === '+' : type === 'income') ? 'var(--success)' : 'var(--danger)'
                                                    }}
                                                />
                                            </div>
                                        </div>
                                        <div className="form-field">
                                            <label>Date</label>
                                            <DatePickerField
                                                value={date}
                                                onChange={setDate}
                                                dateFormat={settings.dateFormat}
                                                label="Select date"
                                                required
                                            />
                                        </div>
                                    </div>

                                    {/* Narration (primary description) */}
                                    <div className="form-field">
                                        <label>Narration</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            placeholder="e.g. UPI THANNERU VENKATA NA..."
                                            value={narration}
                                            onChange={(e) => setNarration(e.target.value)}
                                            required
                                        />
                                    </div>

                                    {/* Ref ID & Account — half/half */}
                                    <div className="form-row">
                                        <div className="form-field">
                                            <label>Ref ID <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(hidden in ledger)</span></label>
                                            <input
                                                type="text"
                                                className="form-control"
                                                placeholder="e.g. TXN1234567"
                                                value={refId}
                                                onChange={(e) => setRefId(e.target.value)}
                                            />
                                        </div>
                                        <div className="form-field">
                                            <label>Account</label>
                                            <select className="form-control" value={account} onChange={(e) => setAccount(e.target.value)}>
                                                {settings.accounts?.map(a => <option key={a} value={a}>{a}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Category — full width */}
                                    <div className="form-field">
                                        <label>Category</label>
                                        <button
                                            type="button"
                                            className="category-select-trigger"
                                            onClick={() => setShowCategoryPicker(true)}
                                        >
                                            <div className="category-trigger-content">
                                                {(() => {
                                                    const parent = category.includes(" - ") ? category.split(" - ")[0] : "";
                                                    const subAndEmoji = category.includes(" - ") ? category.split(" - ")[1] : category;
                                                    const emojiMatch = subAndEmoji.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji}/u);
                                                    const emoji = emojiMatch ? emojiMatch[0] : "⚙️";
                                                    const label = subAndEmoji.replace(emoji, "").trim();
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

                                    {/* Tags Setup with Clear Separation */}
                                    <div className="form-field">
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                                            {/* Create New Tag */}
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    placeholder="Create new tag"
                                                    value={newTagName}
                                                    onChange={(e) => setNewTagName(e.target.value)}
                                                    style={{ flex: 1 }}
                                                />
                                                <input
                                                    type="color"
                                                    value={newTagColor}
                                                    onChange={(e) => setNewTagColor(e.target.value)}
                                                    style={{ width: '38px', height: '36px', padding: '2px', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}
                                                    title="Pick Tag Color"
                                                />
                                                <button type="button" className="btn btn-secondary" onClick={handleCreateTag}>Create</button>
                                            </div>

                                            {/* 1. Attached Tags Box */}
                                            <div>
                                                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span>Attached Tags ({selectedTags.length})</span>
                                                </label>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '38px', padding: '8px', border: '1.5px solid var(--border-color)', borderRadius: '8px', backgroundColor: '#F8FAFC', alignItems: 'center' }}>
                                                    {selectedTags.length === 0 ? (
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No tags attached</span>
                                                    ) : (
                                                        selectedTags.map(tagName => {
                                                            const foundTag = (tags || []).find(t => t.name.toLowerCase() === tagName.toLowerCase());
                                                            const tagColor = foundTag ? (foundTag.color || 'var(--primary)') : 'var(--primary)';
                                                            const textColor = getContrastTextColor(tagColor);
                                                            const needsBorder = textColor === '#1E293B';
                                                            return (
                                                                <span
                                                                    key={tagName}
                                                                    className="tag-pill"
                                                                    style={{
                                                                        backgroundColor: tagColor,
                                                                        color: textColor,
                                                                        border: needsBorder ? '1px solid #CBD5E1' : 'none',
                                                                        fontWeight: 600,
                                                                        fontSize: '0.78rem',
                                                                        padding: '4px 10px',
                                                                        borderRadius: '14px',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '6px',
                                                                        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                                                    }}
                                                                >
                                                                    <span>{tagName}</span>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setSelectedTags(selectedTags.filter(t => t !== tagName))}
                                                                        style={{
                                                                            background: 'none',
                                                                            border: 'none',
                                                                            color: textColor,
                                                                            cursor: 'pointer',
                                                                            fontWeight: 'bold',
                                                                            fontSize: '0.88rem',
                                                                            lineHeight: 1,
                                                                            padding: 0,
                                                                            display: 'flex',
                                                                            alignItems: 'center',
                                                                            opacity: 0.85
                                                                        }}
                                                                        title="Remove Tag"
                                                                    >
                                                                        ×
                                                                    </button>
                                                                </span>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>

                                            {/* 2. Available Tags Box */}
                                            <div>
                                                <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px', display: 'block' }}>
                                                    Available Tags <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>(click to attach)</span>
                                                </label>
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '100px', overflowY: 'auto', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                                    {tags.filter(t => !selectedTags.includes(t.name)).length === 0 ? (
                                                        <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                            {tags.length === 0 ? 'No tags created yet' : 'All available tags attached'}
                                                        </span>
                                                    ) : (
                                                        tags.filter(t => !selectedTags.includes(t.name)).map(t => {
                                                            const tagColor = t.color || 'var(--primary)';
                                                            const textColor = getContrastTextColor(tagColor);
                                                            return (
                                                                <span
                                                                    key={t.name}
                                                                    onClick={() => setSelectedTags([...selectedTags, t.name])}
                                                                    style={{
                                                                        cursor: 'pointer',
                                                                        padding: '4px 12px',
                                                                        borderRadius: '16px',
                                                                        fontSize: '0.78rem',
                                                                        fontWeight: 600,
                                                                        backgroundColor: tagColor,
                                                                        color: textColor,
                                                                        border: textColor === '#1E293B' ? '1px solid #CBD5E1' : '1px solid transparent',
                                                                        opacity: 1,
                                                                        transition: 'all 0.15s ease',
                                                                        userSelect: 'none',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px'
                                                                    }}
                                                                    title={`Click to attach ${t.name}`}
                                                                >
                                                                    <span>+ {t.name}</span>
                                                                </span>
                                                            );
                                                        })
                                                    )}
                                                </div>
                                            </div>

                                        </div>
                                    </div>

                                    {/* Notes */}
                                    <div className="form-field">
                                        <label>Notes</label>
                                        <textarea
                                            className="form-control"
                                            placeholder="Additional notes or context..."
                                            value={notes}
                                            onChange={(e) => setNotes(e.target.value)}
                                            rows={2}
                                            style={{ resize: 'vertical', minHeight: '60px' }}
                                        />
                                    </div>

                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Transaction</button>
                            </div>
                        </form>
                    </div>

                    {showCategoryPicker && (
                        <CategoryPickerModal
                            categories={filterCategoriesByType(settings.categories || DEFAULT_CATEGORIES, type, settings.categoryTypes)}
                            selected={category}
                            onSelect={(cat) => {
                                setCategory(cat);
                                setShowCategoryPicker(false);
                            }}
                            onClose={() => setShowCategoryPicker(false)}
                        />
                    )}
                </div>
            );
        };


        // --- MODAL COMPONENT: Import File Dialog (PDF default, CSV fallback) ---
        // Step 1: User picks account + file type
        // Step 2: File is selected and parsed → hands off to PdfImportConfirmDialog or CsvMappingDialog
        // --- MODAL COMPONENT: Import File Dialog (PDF & AI Bank Parser default, CSV fallback) ---


        // --- MODAL COMPONENT: Tag Manager Modal (Section 7.2) ---
        export const TagManagerModal = ({ tx, tags = [], onClose, onSave, onAddTag }) => {
            useEscapeKey(onClose);
            const [selected, setSelected] = React.useState([...(tx.tags || [])]);
            const [newTagName, setNewTagName] = React.useState("");
            const [newTagColor, setNewTagColor] = React.useState("#4F46E5");

            const handleToggle = (tag) => {
                if (selected.includes(tag)) {
                    setSelected(selected.filter(t => t !== tag));
                } else {
                    setSelected([...selected, tag]);
                }
            };

            const handleCreate = async () => {
                const name = newTagName.trim();
                if (!name) return;

                if (!selected.includes(name)) {
                    setSelected([...selected, name]);
                }
                if (onAddTag) {
                    await onAddTag({ name, color: newTagColor });
                }
                setNewTagName("");
            };

            const handleSubmit = (e) => {
                e.preventDefault();
                onSave(selected);
            };

            const getTagColor = (tName) => {
                const found = tags.find(t => t.name.toLowerCase() === tName.toLowerCase());
                return found ? (found.color || '#4F46E5') : '#4F46E5';
            };

            const allTagNames = Array.from(new Set([...tags.map(t => t.name), ...selected]));

            return (
                <div className="modal-overlay">
                    <div className="modal-container">
                        <div className="modal-header">
                            <h3 className="modal-title">Tag Transaction: {tx.merchant}</h3>
                            <button className="modal-close-btn" onClick={onClose}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <form onSubmit={handleSubmit}>
                            <div className="modal-body">
                                <div className="form-grid">
                                    <div className="form-field">
                                        <label>Attach New Tag</label>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <input
                                                type="text"
                                                className="form-control"
                                                placeholder="Type Tag name..."
                                                value={newTagName}
                                                onChange={(e) => setNewTagName(e.target.value)}
                                                style={{ flex: 1 }}
                                            />
                                            <input
                                                type="color"
                                                value={newTagColor}
                                                onChange={(e) => setNewTagColor(e.target.value)}
                                                style={{ width: '38px', height: '36px', padding: '2px', border: '1px solid var(--border-color)', borderRadius: '6px', cursor: 'pointer' }}
                                                title="Pick Tag Color"
                                            />
                                            <button type="button" className="btn btn-secondary" onClick={handleCreate}>Add</button>
                                        </div>
                                    </div>

                                    {/* 1. Attached Tags Box */}
                                    <div>
                                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span>Attached Tags ({selected.length})</span>
                                        </label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '38px', padding: '8px', border: '1.5px solid var(--border-color)', borderRadius: '8px', backgroundColor: '#F8FAFC', alignItems: 'center' }}>
                                            {selected.length === 0 ? (
                                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>No tags attached</span>
                                            ) : (
                                                selected.map(tagName => {
                                                    const tagColor = getTagColor(tagName);
                                                    const textColor = getContrastTextColor(tagColor);
                                                    const needsBorder = textColor === '#1E293B';
                                                    return (
                                                        <span
                                                            key={tagName}
                                                            className="tag-pill"
                                                            style={{
                                                                backgroundColor: tagColor,
                                                                color: textColor,
                                                                border: needsBorder ? '1px solid #CBD5E1' : 'none',
                                                                fontWeight: 600,
                                                                fontSize: '0.78rem',
                                                                padding: '4px 10px',
                                                                borderRadius: '14px',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '6px',
                                                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                                            }}
                                                        >
                                                            <span>{tagName}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggle(tagName)}
                                                                style={{
                                                                    background: 'none',
                                                                    border: 'none',
                                                                    color: textColor,
                                                                    cursor: 'pointer',
                                                                    fontWeight: 'bold',
                                                                    fontSize: '0.88rem',
                                                                    lineHeight: 1,
                                                                    padding: 0,
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    opacity: 0.85
                                                                }}
                                                                title="Remove Tag"
                                                            >
                                                                ×
                                                            </button>
                                                        </span>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>

                                    {/* 2. Available Tags Box */}
                                    <div>
                                        <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)', marginBottom: '6px', display: 'block' }}>
                                            Available Tags <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>(click to attach)</span>
                                        </label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '120px', overflowY: 'auto', padding: '8px', border: '1px solid var(--border-color)', borderRadius: '8px' }}>
                                            {tags.filter(t => !selected.includes(t.name)).length === 0 ? (
                                                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                    {tags.length === 0 ? 'No tags created yet' : 'All available tags attached'}
                                                </span>
                                            ) : (
                                                tags.filter(t => !selected.includes(t.name)).map(t => {
                                                    const tagColor = t.color || 'var(--primary)';
                                                    const textColor = getContrastTextColor(tagColor);
                                                    return (
                                                        <span
                                                            key={t.name}
                                                            onClick={() => handleToggle(t.name)}
                                                            style={{
                                                                cursor: 'pointer',
                                                                padding: '4px 12px',
                                                                borderRadius: '16px',
                                                                fontSize: '0.78rem',
                                                                fontWeight: 600,
                                                                backgroundColor: tagColor,
                                                                color: textColor,
                                                                border: textColor === '#1E293B' ? '1px solid #CBD5E1' : '1px solid transparent',
                                                                opacity: 1,
                                                                transition: 'all 0.15s ease',
                                                                userSelect: 'none',
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px'
                                                            }}
                                                            title={`Click to attach ${t.name}`}
                                                        >
                                                            <span>+ {t.name}</span>
                                                        </span>
                                                    );
                                                })
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                                <button type="submit" className="btn btn-primary">Save Tags</button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        };


