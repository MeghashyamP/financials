import React from 'react';
import { createPortal } from 'react-dom';
import { Icon, formatDate, useEscapeKey } from '../utils.jsx';

// Pop-up picker for the Transactions "document" filter. Every file shows its statement period and its
// upload date (both in the date format chosen in Settings), ordered by statement period.
export const DocumentFilterModal = ({ options = [], manualCount = 0, selected = 'all', onSelect, onClose, settings }) => {
    const [search, setSearch] = React.useState('');
    useEscapeKey(onClose);
    const fmt = (d) => formatDate(d, settings?.dateFormat);
    const q = search.trim().toLowerCase();
    const shown = q ? options.filter((d) => String(d.filename || '').toLowerCase().includes(q)) : options;

    // One line per entry: File | Statement period | Uploaded | Transactions
    const COLS = 'minmax(0, 1.5fr) minmax(0, 2fr) minmax(0, 1.2fr) 84px';
    const cell = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.84rem' };
    const row = (key, active, onClick, content) => (
        <div key={key} onClick={onClick} style={{
            display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', columnGap: '16px', padding: '9px 14px',
            borderRadius: '8px', cursor: 'pointer',
            border: active ? '1.5px solid var(--primary)' : '1px solid var(--border-color)',
            background: active ? 'var(--primary-light, #EEF2FF)' : 'var(--card-bg, #fff)'
        }}>{content}</div>
    );
    const count = (n) => <span className="badge badge-info" style={{ justifySelf: 'end', fontSize: '0.74rem' }}>{n} txns</span>;

    // Rendered on <body> so the toolbar's stacking context can't put the sidebar on top of the pop-up
    return createPortal(
        <div className="modal-overlay confirm-modal-overlay" onClick={onClose}>
            <div className="modal-container" style={{ maxWidth: '980px', width: '96vw' }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header" style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-color)' }}>
                    <h3 className="modal-title">Filter by Document</h3>
                    <button className="modal-close-btn" onClick={onClose}><Icon name="close" /></button>
                </div>
                <div className="modal-body" style={{ padding: '16px 24px' }}>
                    <input className="form-control" autoFocus placeholder="Search file name…" value={search}
                        onChange={(e) => setSearch(e.target.value)} style={{ width: '100%', height: '34px', marginBottom: '12px' }} />
                    {/* Column labels */}
                    <div style={{ display: 'grid', gridTemplateColumns: COLS, columnGap: '16px', padding: '0 14px 6px', fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        <span>File</span><span>Statement period</span><span>Uploaded</span><span style={{ textAlign: 'right' }}>Txns</span>
                    </div>
                    <div style={{ maxHeight: '55vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '4px' }}>
                        {row('all', selected === 'all', () => onSelect('all'), (
                            <span style={{ ...cell, fontWeight: 700, gridColumn: '1 / -1' }}>📄 All Documents</span>
                        ))}
                        {shown.map((d) => {
                            const p = d.period || {};
                            const period = p.start && p.end && p.start !== p.end ? `${fmt(p.start)} → ${fmt(p.end)}` : fmt(p.start || p.end);
                            return row(d.id, selected === d.id, () => onSelect(d.id), (
                                <>
                                    <span style={{ ...cell, fontWeight: 700 }} title={d.filename}>📄 {d.filename}</span>
                                    <span style={{ ...cell, fontWeight: 600 }} title={period}>{period || <span style={{ color: 'var(--text-muted)' }}>—</span>}</span>
                                    <span style={{ ...cell, color: 'var(--text-muted)' }}>{d.createdAt ? fmt(d.createdAt) : '—'}</span>
                                    {count(d.count)}
                                </>
                            ));
                        })}
                        {manualCount > 0 && row('manual', selected === 'manual', () => onSelect('manual'), (
                            <>
                                <span style={{ ...cell, fontWeight: 700, gridColumn: '1 / 4' }}>✍️ Manual Entry</span>
                                {count(manualCount)}
                            </>
                        ))}
                        {shown.length === 0 && q && <div style={{ padding: '14px', color: 'var(--text-muted)', textAlign: 'center' }}>No file matches "{search}".</div>}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};
