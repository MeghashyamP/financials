import React from 'react';
import { Icon, DEFAULT_CATEGORIES, processImportedTransaction, useEscapeKey, formatCurrencyVal, renderCategoryOptions } from '../../utils.jsx';
import { 
  loadImportLibraries, parseCSVText, preprocessPDFWithPDFLib, splitPdfIntoPages, 
  parseBankStatementWithGeminiAI, performCanvasOCRForPage, parseFallbackPDFText,
  parseHeuristicDate, extractTextFromPDF, parseTransactionsFromPDFText
} from '../../services/importers.js';

        export const ImportFileModal = ({ onClose, onCsvParsed, onPdfParsed, showToast, settings, rules = [] }) => {
            useEscapeKey(onClose);
            const [importType, setImportType] = React.useState("pdf");
            const [pdfEngine, setPdfEngine] = React.useState("ai"); // "ai" or "local"
            const [apiKey, setApiKey] = React.useState(() => localStorage.getItem("gemini_api_key") || settings?.geminiApiKey || "");
            const [processing, setProcessing] = React.useState(false);
            const [statusMsg, setStatusMsg] = React.useState("Extracting text and identifying transactions…");

            const accounts = settings?.accounts || ["Bank 1", "Bank 2", "Credit Card 1"];
            const [selectedAccount, setSelectedAccount] = React.useState(accounts[0] || "");
            const [customAccount, setCustomAccount] = React.useState("");
            const isCustom = selectedAccount === "__custom__";
            const effectiveAccount = isCustom ? customAccount.trim() : selectedAccount;

            const handleApiKeyChange = (val) => {
                setApiKey(val);
                localStorage.setItem("gemini_api_key", val.trim());
            };

            const handleFileChange = async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (!effectiveAccount) {
                    showToast("Please select or enter an account before uploading.", "warning");
                    return;
                }

                setProcessing(true);
                try {
                    if (importType === "pdf" || file.name.toLowerCase().endsWith(".pdf")) {
                        let parsedTx = [];
                        await loadImportLibraries();

                        if (pdfEngine === "ai" && (apiKey.trim() || localStorage.getItem("gemini_api_key"))) {
                            setStatusMsg("⚡ Preparing document for Gemini AI extraction…");
                            const availableCats = settings?.categories || DEFAULT_CATEGORIES;
                            parsedTx = await parseBankStatementWithGeminiAI(file, apiKey.trim(), (msg) => setStatusMsg(msg), availableCats, rules);
                        } else {
                            setStatusMsg("🔒 Running open-source spatial table extractor…");
                            const text = await extractTextFromPDF(file);
                            parsedTx = parseTransactionsFromPDFText(text, file.name);
                        }

                        if (!parsedTx || parsedTx.length === 0) {
                            showToast("No structured transactions detected in PDF.", "warning");
                        }

                        onPdfParsed(parsedTx, file.name, file, effectiveAccount);
                    } else {
                        // CSV parsing
                        const reader = new FileReader();
                        reader.onload = (event) => {
                            const text = event.target.result;
                            const rows = parseCSVText(text);
                            onCsvParsed(rows, file.name);
                        };
                        reader.readAsText(file);
                    }
                } catch (err) {
                    console.error("Manual upload parse error:", err);
                    showToast(`Error parsing file: ${err.message}`, "error");
                } finally {
                    setProcessing(false);
                }
            };

            return (
                <div className="modal-overlay">
                    <div className="modal-container" style={{ maxWidth: '620px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Import Statement / Receipt</h3>
                            <button className="modal-close-btn" onClick={onClose} disabled={processing}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>

                            {/* Step 1: Account Selection */}
                            <div style={{ background: 'var(--primary-light)', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ fontSize: '1rem' }}>🏦</span>
                                    <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--primary)' }}>Which account is this statement for?</span>
                                </div>
                                <select
                                    className="form-control"
                                    value={selectedAccount}
                                    onChange={(e) => setSelectedAccount(e.target.value)}
                                    disabled={processing}
                                    style={{ fontWeight: 500 }}
                                >
                                    {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                                    <option value="__custom__">+ Enter manually…</option>
                                </select>
                                {isCustom && (
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="e.g. SBI Savings, HDFC Credit Card…"
                                        value={customAccount}
                                        onChange={(e) => setCustomAccount(e.target.value)}
                                        disabled={processing}
                                        autoFocus
                                    />
                                )}
                            </div>

                            {/* Step 2: File type */}
                            <div className="segmented-control">
                                <button
                                    className={`segmented-btn ${importType === "pdf" ? "active income" : ""}`}
                                    onClick={() => setImportType("pdf")}
                                    disabled={processing}
                                    style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                                >
                                    PDF Bank Statement / Receipt
                                </button>
                                <button
                                    className={`segmented-btn ${importType === "csv" ? "active expense" : ""}`}
                                    onClick={() => setImportType("csv")}
                                    disabled={processing}
                                    style={{ padding: '6px 10px', fontSize: '0.85rem' }}
                                >
                                    CSV Bank Statement
                                </button>
                            </div>

                            {/* PDF Extractor Mode Selector */}
                            {importType === "pdf" && (
                                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)' }}>Extraction Engine</span>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button
                                                type="button"
                                                className={`btn btn-xs ${pdfEngine === "ai" ? "btn-primary" : "btn-secondary"}`}
                                                onClick={() => setPdfEngine("ai")}
                                                style={{ fontSize: '0.75rem', padding: '3px 9px' }}
                                            >
                                                ⚡ Gemini AI (Higher Precision)
                                            </button>
                                            <button
                                                type="button"
                                                className={`btn btn-xs ${pdfEngine === "local" ? "btn-primary" : "btn-secondary"}`}
                                                onClick={() => setPdfEngine("local")}
                                                style={{ fontSize: '0.75rem', padding: '3px 9px' }}
                                            >
                                                🔒 Offline Local
                                            </button>
                                        </div>
                                    </div>

                                    {pdfEngine === "ai" && (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
                                                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Gemini Free API Key:</span>
                                                <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'none', fontWeight: 600 }}>
                                                    🔑 Get Free Key (Google AI Studio) →
                                                </a>
                                            </div>
                                            <input
                                                type="password"
                                                className="form-control"
                                                placeholder="Paste your free Gemini API key (AIzaSy…)"
                                                value={apiKey}
                                                onChange={(e) => handleApiKeyChange(e.target.value)}
                                                disabled={processing}
                                                style={{ fontSize: '0.82rem', height: '34px' }}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {processing ? (
                                <div style={{ textAlign: 'center', padding: '30px 0' }}>
                                    <div style={{ border: '3px solid #f3f3f3', borderTop: '3px solid var(--primary)', borderRadius: '50%', width: '32px', height: '32px', animation: 'spin 1s linear infinite', margin: '0 auto 12px auto' }}></div>
                                    <p style={{ color: 'var(--text-main)', fontWeight: 600, fontSize: '0.88rem' }}>{statusMsg}</p>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginTop: '4px' }}>Parsing transactions and structuring data…</p>
                                </div>
                            ) : (
                                <label className="upload-zone" style={{ opacity: effectiveAccount ? 1 : 0.55, cursor: effectiveAccount ? 'pointer' : 'not-allowed' }}>
                                    <Icon name="download" />
                                    <div>
                                        <h4 style={{ fontWeight: 600, color: 'var(--text-main)' }}>
                                            {importType === "pdf"
                                                ? (pdfEngine === "ai" ? "⚡ Upload Bank PDF (Gemini AI Extraction)" : "🔒 Upload Bank PDF (Offline Extractor)")
                                                : "Click to pick CSV statement"}
                                        </h4>
                                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                                            {effectiveAccount
                                                ? `Will be imported into: ${effectiveAccount}`
                                                : "Select an account above first"}
                                        </p>
                                    </div>
                                    <input
                                        type="file"
                                        style={{ display: 'none' }}
                                        accept={importType === "pdf" ? ".pdf" : ".csv"}
                                        onChange={handleFileChange}
                                        disabled={!effectiveAccount}
                                    />
                                </label>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={onClose} disabled={processing}>Cancel</button>
                        </div>
                    </div>
                </div>
            );
        };



        // --- DIALOG COMPONENT: PDF Column Mapping Dialog ---
        // Shown between file upload and the full review table.
        // Displays how each detected PDF token maps to a canonical transaction field.
        // User can remap any field before proceeding to the review table.
        export const PdfColumnMappingDialog = ({ pdfMappingData, onClose, onConfirm, settings }) => {
            useEscapeKey(onClose);
            const { parsedTransactions, filename, selectedAccount } = pdfMappingData;

            // Extract all distinct column names detected in the PDF table
            const sampleTx = parsedTransactions[0] || {};
            const rawCols = sampleTx._extractedColumns || (sampleTx._rawColumns ? Object.keys(sampleTx._rawColumns) : null);
            const extractedColumns = (rawCols && rawCols.length > 0) ? rawCols : ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"];

            // Canonical field definitions
            const CANONICAL_FIELDS = [
                { key: "date", label: "Date", icon: "📅", desc: "Transaction date", multi: true },
                { key: "narration", label: "Narration", icon: "📝", desc: "Description / merchant / payee", multi: true },
                { key: "amount", label: "Amount", icon: "💰", desc: "Transaction value", multi: true },
                { key: "type", label: "Type", icon: "↕️", desc: "Inflow or Outflow indicator", multi: false },
                { key: "refId", label: "Ref ID", icon: "🔑", desc: "Reference / cheque / UPI number", multi: true },
                { key: "account", label: "Account", icon: "🏦", desc: "Bank account or wallet", multi: false },
                { key: "category", label: "Category", icon: "🗂️", desc: "Auto-matched from rules", multi: false },
                { key: "tags", label: "Tags", icon: "🏷️", desc: "Labels (comma-separated)", multi: true },
                { key: "notes", label: "Notes", icon: "📌", desc: "Extra notes / memo", multi: true },
            ];

            // Initial smart mapping selection
            const getInitialMapping = () => {
                const map = {
                    date: [],
                    narration: [],
                    amount: [],
                    type: "__auto__",
                    refId: [],
                    account: "__pre_account__",
                    category: "__auto_category__",
                    tags: [],
                    notes: []
                };

                extractedColumns.forEach(col => {
                    const lc = col.toLowerCase();
                    if (/date|dt/i.test(lc) && !/val/i.test(lc) && map.date.length === 0) {
                        map.date.push(col);
                    } else if (/narration|description|particulars|details/i.test(lc) && map.narration.length === 0) {
                        map.narration.push(col);
                    } else if (/chq|ref|cheque|txn/i.test(lc) && map.refId.length === 0) {
                        map.refId.push(col);
                    } else if (/withdrawal|deposit|debit|credit|amount/i.test(lc)) {
                        map.amount.push(col);
                    }
                });

                // Fallbacks if not auto-matched
                if (map.date.length === 0 && extractedColumns.length > 0) map.date.push(extractedColumns[0]);
                if (map.narration.length === 0 && extractedColumns.length > 1) map.narration.push(extractedColumns[1]);

                return map;
            };

            const [mapping, setMapping] = React.useState(getInitialMapping);

            // Toggle a column in multi-select mapping for a given field
            const toggleColumn = (fieldKey, colName) => {
                setMapping(prev => {
                    const currentCols = prev[fieldKey] || [];
                    if (currentCols.includes(colName)) {
                        return { ...prev, [fieldKey]: currentCols.filter(c => c !== colName) };
                    } else {
                        return { ...prev, [fieldKey]: [...currentCols, colName] };
                    }
                });
            };

            // Helper to get combined value of selected columns for a single transaction row
            const resolveFieldValue = (fieldKey, t) => {
                const raw = t._rawColumns || {};
                const selectedCols = mapping[fieldKey] || [];

                if (fieldKey === "account") {
                    return mapping.account === "__pre_account__" ? (selectedAccount || "Main Checking") : "";
                }
                if (fieldKey === "category") {
                    return "Needs review (auto from rules)";
                }
                if (fieldKey === "type") {
                    if (mapping.type === "expense") return "Outflow";
                    if (mapping.type === "income") return "Inflow";
                    if (t.type === "income") return "Inflow (Credit)";
                    return "Outflow (Debit)";
                }

                if (fieldKey === "amount") {
                    if (selectedCols.length === 0) return t.amount ? String(t.amount) : "0.00";
                    let valParts = [];
                    selectedCols.forEach(col => {
                        if (raw[col]) valParts.push(raw[col]);
                    });
                    if (valParts.length > 0) {
                        return valParts.join(" / ");
                    }
                    return t.amount ? String(t.amount) : "0.00";
                }

                if (fieldKey === "date") {
                    if (selectedCols.length === 0) return t.date || "—";
                    const vals = selectedCols.map(col => raw[col]).filter(Boolean);
                    if (vals.length > 0) return vals.join(" ");
                    return t.date || "—";
                }

                // Generic text field concatenation with space
                if (selectedCols.length === 0) return "— empty —";
                const values = selectedCols.map(col => raw[col]).filter(v => v && v.trim().length > 0);
                return values.length > 0 ? values.join(" ") : "— empty —";
            };

            const handleConfirm = () => {
                try {
                    const mapped = (parsedTransactions || []).map(t => {
                        const raw = t._rawColumns || {};

                        // Resolve date into YYYY-MM-DD (app storage format)
                        let finalDate = parseHeuristicDate(t.date) || new Date().toISOString().split('T')[0];
                        if (mapping.date && mapping.date.length > 0) {
                            for (const col of mapping.date) {
                                if (raw[col]) {
                                    const parsed = parseHeuristicDate(raw[col]);
                                    if (parsed) { finalDate = parsed; break; }
                                }
                            }
                        }

                        // Resolve narration (combine multiple selected columns with space)
                        let narrationVal = t.narration || t.merchant || "Bank Transaction";
                        if (mapping.narration && mapping.narration.length > 0) {
                            const parts = mapping.narration.map(col => raw[col]).filter(v => v && String(v).trim().length > 0);
                            if (parts.length > 0) narrationVal = parts.join(" ");
                        }

                        // Resolve Ref ID (combine multiple selected columns with space)
                        let refIdVal = t.refId || "";
                        if (mapping.refId && mapping.refId.length > 0) {
                            const parts = mapping.refId.map(col => raw[col]).filter(v => v && String(v).trim().length > 0);
                            if (parts.length > 0) refIdVal = parts.join(" ");
                        }

                        // Resolve Amount & Type
                        let amountVal = Math.abs(Number(t.amount || 0));
                        let typeVal = t.type || "expense";

                        if (mapping.type === "expense") typeVal = "expense";
                        else if (mapping.type === "income") typeVal = "income";

                        if (mapping.amount && mapping.amount.length > 0) {
                            let foundAmt = null;
                            for (const col of mapping.amount) {
                                const val = raw[col];
                                if (val !== undefined && val !== null) {
                                    const clean = String(val).replace(/[^\d.-]/g, '');
                                    const num = parseFloat(clean);
                                    if (!isNaN(num) && num !== 0) {
                                        foundAmt = Math.abs(num);
                                        if (mapping.type === "__auto__") {
                                            if (/withdrawal|debit|dr/i.test(col)) typeVal = "expense";
                                            else if (/deposit|credit|cr/i.test(col)) typeVal = "income";
                                            else if (num < 0) typeVal = "expense";
                                        }
                                        break;
                                    }
                                }
                            }
                            if (foundAmt !== null) amountVal = foundAmt;
                        }

                        // Resolve Notes
                        let notesVal = t.notes || "";
                        if (mapping.notes && mapping.notes.length > 0) {
                            const parts = mapping.notes.map(col => raw[col]).filter(v => v && String(v).trim().length > 0);
                            if (parts.length > 0) notesVal = parts.join(" ");
                        }

                        return {
                            ...t,
                            date: finalDate,
                            narration: narrationVal,
                            merchant: narrationVal,
                            amount: amountVal,
                            type: typeVal,
                            refId: refIdVal,
                            account: selectedAccount || t.account || "Main Checking",
                            category: t.category || "Needs review",
                            tags: (mapping.tags && mapping.tags.length > 0) ? mapping.tags.map(col => raw[col]).filter(Boolean) : (t.tags || []),
                            notes: notesVal
                        };
                    });

                    onConfirm(mapped, filename, pdfMappingData.file);
                } catch (err) {
                    console.error("Error confirming PDF mapping:", err);
                    alert("Error processing column mapping: " + err.message);
                }
            };

            const activeMappedFields = CANONICAL_FIELDS.filter(f => {
                if (f.key === "account" || f.key === "category" || f.key === "type") return true;
                return (mapping[f.key] || []).length > 0;
            });

            return (
                <div className="modal-overlay">
                    <div className="modal-container modal-lg" style={{ maxWidth: '920px', maxHeight: '92vh' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">Column Mapping — {filename}</h3>
                            <button className="modal-close-btn" onClick={onClose}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modal-body" style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px' }}>
                                Detected <strong>{parsedTransactions.length}</strong> transaction{parsedTransactions.length !== 1 ? 's' : ''} with <strong>{extractedColumns.length} distinct columns</strong> in <strong>{filename}</strong>.
                            </p>

                            {/* PDF-lib Pre-Processing & Metadata Info Box */}
                            {sampleTx._pdfLibPreprocessed && (
                                <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '0.8rem', color: '#0369A1' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                        <span style={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <span>⚡ PDF-lib Document Pre-Processed</span>
                                            <span style={{ background: '#0284C7', color: '#FFFFFF', fontSize: '0.68rem', padding: '1px 6px', borderRadius: '10px', fontWeight: 600 }}>PDF-lib 1.17</span>
                                        </span>
                                        <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                                            {sampleTx._pdfPageInfos?.length || sampleTx._pdfMetadata?.pageCount || 1} Page(s) Verified
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '0.75rem', marginTop: '4px' }}>
                                        {sampleTx._pdfMetadata?.title && (
                                            <div><strong>Title:</strong> {sampleTx._pdfMetadata.title}</div>
                                        )}
                                        {sampleTx._pdfMetadata?.producer && (
                                            <div><strong>Producer:</strong> {sampleTx._pdfMetadata.producer}</div>
                                        )}
                                        {sampleTx._pdfFormFields && sampleTx._pdfFormFields.length > 0 && (
                                            <div><strong>AcroForm Fields:</strong> {sampleTx._pdfFormFields.length} extracted</div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Detected PDF Columns Summary Bar */}
                            <div style={{ background: 'var(--primary-light)', padding: '10px 14px', borderRadius: '8px', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    📄 Extracted PDF Columns (Select one or multiple for any field):
                                </span>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                    {extractedColumns.map(col => (
                                        <span key={col} style={{ fontSize: '0.8rem', padding: '3px 9px', background: '#FFFFFF', border: '1px solid var(--border-color)', borderRadius: '6px', fontWeight: 600, color: 'var(--text-main)' }}>
                                            {col}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Mapping Rows Header */}
                            <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr 220px', gap: '14px', padding: '6px 0 8px 0', borderBottom: '2px solid var(--border-color)' }}>
                                <span style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dashboard Field</span>
                                <span style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Select PDF Columns to Combine (Appended with Space)</span>
                                <span style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sample Row 1 Output</span>
                            </div>

                            {/* Mapping Rows */}
                            {CANONICAL_FIELDS.map((field, i) => {
                                const selectedCols = mapping[field.key] || [];

                                return (
                                    <div key={field.key} style={{ display: 'grid', gridTemplateColumns: '170px 1fr 220px', gap: '14px', alignItems: 'center', padding: '12px 0', borderBottom: i < CANONICAL_FIELDS.length - 1 ? '1px solid var(--border-color)' : 'none' }}>
                                        {/* Field Label */}
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <span>{field.icon}</span> <span>{field.label}</span>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>{field.desc}</div>
                                        </div>

                                        {/* Multi-Column Selector / Config */}
                                        <div>
                                            {field.key === "type" ? (
                                                <select
                                                    className="form-control"
                                                    style={{ height: '34px', fontSize: '0.82rem', maxWidth: '280px' }}
                                                    value={mapping.type}
                                                    onChange={e => setMapping(prev => ({ ...prev, type: e.target.value }))}
                                                >
                                                    <option value="__auto__">⚡ Auto-detect from Withdrawal/Deposit columns</option>
                                                    <option value="expense">🔴 Always Outflow (Debit)</option>
                                                    <option value="income">🟢 Always Inflow (Credit)</option>
                                                </select>
                                            ) : field.key === "account" ? (
                                                <span style={{ fontSize: '0.82rem', color: 'var(--primary)', fontWeight: 600, background: 'var(--primary-light)', padding: '4px 10px', borderRadius: '6px' }}>
                                                    🏦 Pre-selected: {selectedAccount || "Main Checking"}
                                                </span>
                                            ) : field.key === "category" ? (
                                                <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', background: 'var(--bg-color)', padding: '4px 10px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                                                    🤖 Auto-matched from Rules / Needs review
                                                </span>
                                            ) : (
                                                <div>
                                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                        {extractedColumns.map(col => {
                                                            const isSel = selectedCols.includes(col);
                                                            return (
                                                                <button
                                                                    key={col}
                                                                    type="button"
                                                                    onClick={() => toggleColumn(field.key, col)}
                                                                    style={{
                                                                        fontSize: '0.78rem',
                                                                        padding: '4px 10px',
                                                                        borderRadius: '6px',
                                                                        fontWeight: isSel ? 700 : 500,
                                                                        cursor: 'pointer',
                                                                        border: isSel ? '1.5px solid var(--primary)' : '1px solid var(--border-color)',
                                                                        backgroundColor: isSel ? 'var(--primary-light)' : 'var(--bg-color)',
                                                                        color: isSel ? 'var(--primary)' : 'var(--text-main)',
                                                                        transition: 'all 0.15s ease'
                                                                    }}
                                                                >
                                                                    {isSel ? "✓ " : "+ "}{col}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                    {selectedCols.length > 1 && (
                                                        <div style={{ fontSize: '0.72rem', color: 'var(--primary)', fontWeight: 600, marginTop: '4px' }}>
                                                            🔗 {selectedCols.length} columns selected — values will be joined with a space.
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        {/* Sample Row 1 Value */}
                                        <span style={{
                                            fontSize: '0.8rem',
                                            color: selectedCols.length === 0 && field.multi ? 'var(--text-light)' : 'var(--text-main)',
                                            fontFamily: 'monospace',
                                            background: selectedCols.length === 0 && field.multi ? 'transparent' : 'var(--bg-color)',
                                            padding: '6px 10px',
                                            borderRadius: '6px',
                                            border: selectedCols.length === 0 && field.multi ? '1px dashed var(--border-color)' : '1px solid var(--border-color)',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            display: 'block'
                                        }} title={resolveFieldValue(field.key, sampleTx)}>
                                            {resolveFieldValue(field.key, sampleTx)}
                                        </span>
                                    </div>
                                );
                            })}

                            {/* Live preview table */}
                            {parsedTransactions.length > 0 && (
                                <div style={{ marginTop: '24px' }}>
                                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '10px', color: 'var(--text-muted)' }}>
                                        Live Preview — first {Math.min(3, parsedTransactions.length)} rows with current multi-column selection:
                                    </div>
                                    <div className="table-responsive">
                                        <table className="table" style={{ fontSize: '0.78rem', minWidth: '700px' }}>
                                            <thead>
                                                <tr>
                                                    {activeMappedFields.map(f => (
                                                        <th key={f.key} style={{ whiteSpace: 'nowrap' }}>{f.icon} {f.label}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {parsedTransactions.slice(0, 3).map((t, idx) => (
                                                    <tr key={idx}>
                                                        {activeMappedFields.map(f => (
                                                            <td key={f.key} style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                                {resolveFieldValue(f.key, t) || "—"}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleConfirm}>
                                Looks Good → Review All Transactions
                            </button>
                        </div>
                    </div>
                </div>
            );
        };


        // --- DIALOG COMPONENT: PDF Bank Statement Verification & Audit Dialog ---
        export const PdfImportConfirmDialog = ({ pdfImportData, onClose, onConfirm, settings }) => {
            const { transactions, filename } = pdfImportData;

            // Extract metadata from the first transaction object
            const sampleTx = transactions[0] || {};
            const bankProfile = sampleTx._bankProfile || { name: "Bank Statement", code: "GENERIC", icon: "📄", primaryColor: "#6558D3" };
            const reconciliation = sampleTx._reconciliation || { passRate: 100, reconciled: true, totalDebits: 0, totalCredits: 0 };

            // Categories list
            const rawCategories = settings?.categories || DEFAULT_CATEGORIES;
            const categories = rawCategories.includes("Needs review")
                ? rawCategories
                : ["Needs review", ...rawCategories];

            const accounts = settings?.accounts || [];

            // Link options
            const linkOptions = {
                billInstances: (settings?.billInstances || []).filter(b => b.status === 'pending').map(b => ({ id: b.id, label: `${b.name} (Due ${b.dueDate}: ${formatCurrencyVal(b.amount, settings?.currency)})` })),
                recurring: (settings?.recurring || []).map(r => ({ id: r.id, label: r.name })),
                networth: (settings?.networthItems || []).filter(it => it.frequencyPerYear > 0).map(it => ({ id: it.id, label: `${it.name} (${it.category})` }))
            };
            const hasLinkOptions = linkOptions.billInstances.length + linkOptions.recurring.length + linkOptions.networth.length > 0;

            const [searchQuery, setSearchQuery] = React.useState("");
            const [rowFilter, setRowFilter] = React.useState("all"); // "all" | "attention"

            const isNeedsAttention = (item) => {
                const conf = String(item._importConfidence || "").toLowerCase();
                if (conf === "low" || conf === "medium") return true;
                const cat = String(item.category || "");
                return cat.includes("Needs Review") || cat === "Needs review";
            };

            // Local state to keep track of edited fields and selection status
            const [items, setItems] = React.useState(
                transactions.map((t, idx) => ({
                    ...t,
                    narration: t.narration || t.merchant || "",
                    tags: Array.isArray(t.tags) ? t.tags.join(", ") : (t.tags || ""),
                    notes: t.notes || "",
                    refId: t.refId || "",
                    account: t.account || "",
                    linkTo: "",
                    tempId: idx,
                    selected: true
                }))
            );

            const handleToggleSelectAll = (e) => {
                const checked = e.target.checked;
                setItems(prev => prev.map(item => ({ ...item, selected: checked })));
            };

            const handleToggleItem = (tempId) => {
                setItems(prev => prev.map(item =>
                    item.tempId === tempId ? { ...item, selected: !item.selected } : item
                ));
            };

            const handleFieldChange = (tempId, field, value) => {
                setItems(prev => prev.map(item =>
                    item.tempId === tempId ? { ...item, [field]: value } : item
                ));
            };

            const [saving, setSaving] = React.useState(false);

            const handleSave = async () => {
                if (saving) return;
                setSaving(true);
                try {
                    const selectedItems = items
                        .filter(item => item.selected)
                        .map(({ tempId, selected, ...rest }) => ({
                            ...rest,
                            narration: rest.narration,
                            merchant: rest.narration,
                            tags: Array.isArray(rest.tags)
                                ? rest.tags
                                : (typeof rest.tags === "string" ? rest.tags.split(",").map(t => t.trim()).filter(Boolean) : [])
                        }));
                    await onConfirm(selectedItems);
                } catch (err) {
                    console.error("Error in handleSave:", err);
                } finally {
                    setSaving(false);
                }
            };

            const renderLinkOptions = () => (
                <React.Fragment>
                    <option value="">— Not linked —</option>
                    {linkOptions.billInstances.length > 0 && (
                        <optgroup label="Pending Bills (Bill Instances)">
                            {linkOptions.billInstances.map(o => <option key={`billInstance:${o.id}`} value={`billInstance:${o.id}`}>{o.label}</option>)}
                        </optgroup>
                    )}
                    {linkOptions.recurring.length > 0 && (
                        <optgroup label="Recurring bills">
                            {linkOptions.recurring.map(o => <option key={`recurring:${o.id}`} value={`recurring:${o.id}`}>{o.label}</option>)}
                        </optgroup>
                    )}
                    {linkOptions.networth.length > 0 && (
                        <optgroup label="Net Worth ledger (EMI, SIP, premiums…)">
                            {linkOptions.networth.map(o => <option key={`networth:${o.id}`} value={`networth:${o.id}`}>{o.label}</option>)}
                        </optgroup>
                    )}
                </React.Fragment>
            );

            const attentionCount = items.filter(isNeedsAttention).length;

            const filteredItems = items.filter(item => {
                if (rowFilter === "attention" && !isNeedsAttention(item)) return false;
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return (
                    item.narration.toLowerCase().includes(q) ||
                    (item.refId || "").toLowerCase().includes(q) ||
                    (item.category || "").toLowerCase().includes(q) ||
                    String(item.amount).includes(q)
                );
            });

            const allSelected = items.length > 0 && items.every(item => item.selected);
            const selectedCount = items.filter(item => item.selected).length;

            const formatCurr = (val) => formatCurrencyVal(val, settings.currency || "INR");

            const totalSelectedDebits = items.filter(i => i.selected && i.type === "expense").reduce((s, i) => s + i.amount, 0);
            const totalSelectedCredits = items.filter(i => i.selected && i.type === "income").reduce((s, i) => s + i.amount, 0);

            const cellInput = { height: '32px', fontSize: '0.82rem', width: '100%', padding: '4px 6px' };
            const refIdStyle = { ...cellInput, color: 'var(--text-muted)', fontStyle: 'italic' };

            return (
                <div className="modal-overlay">
                    <div className="modal-container modal-lg" style={{ maxWidth: '1120px', width: 'min(1120px, 96vw)', maxHeight: '92vh' }}>
                        <div className="modal-header" style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ fontSize: '1.4rem' }}>{bankProfile.icon}</span>
                                <div>
                                    <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span>Bank Statement Audit — {bankProfile.name}</span>
                                        <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '12px', background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700 }}>
                                            {bankProfile.code} Engine
                                        </span>
                                    </h3>
                                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                        File: <strong>{filename}</strong>
                                    </div>
                                </div>
                            </div>
                            <button className="modal-close-btn" onClick={onClose}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modal-body" style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: '16px' }}>

                            {/* Bank Extraction Summary & Reconciliation Banner */}
                            <div style={{
                                background: 'linear-gradient(135deg, #F8FAFC 0%, #EFF6FF 100%)',
                                border: '1px solid #CBD5E1',
                                borderRadius: '12px',
                                padding: '14px 18px',
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                                gap: '16px',
                                alignItems: 'center'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Extracted Volume</div>
                                    <div style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '2px' }}>
                                        {items.length} Transactions
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Debits / Credits</div>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 600, marginTop: '2px', display: 'flex', gap: '10px' }}>
                                        <span style={{ color: 'var(--danger)' }}>🔴 Dr: {formatCurr(reconciliation.totalDebits || totalSelectedDebits)}</span>
                                        <span style={{ color: 'var(--success)' }}>🟢 Cr: {formatCurr(reconciliation.totalCredits || totalSelectedCredits)}</span>
                                    </div>
                                </div>

                                <div>
                                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Math Reconciliation Audit</div>
                                    <div style={{ marginTop: '4px' }}>
                                        {reconciliation.reconciled ? (
                                            <span style={{ background: '#D1FAE5', color: '#065F46', fontSize: '0.78rem', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <span>✅ 100% Math Reconciled</span>
                                            </span>
                                        ) : (
                                            <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: '0.78rem', fontWeight: 700, padding: '4px 10px', borderRadius: '12px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                                <span>⚠️ Check Notice ({reconciliation.passRate}% Math Match)</span>
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Search & Filter Tool Bar */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '380px' }}>
                                    <input
                                        type="text"
                                        className="form-control"
                                        placeholder="🔍 Search narration, ref ID, amount…"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        style={{ height: '34px', fontSize: '0.82rem' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    {attentionCount > 0 && (
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <button
                                                type="button"
                                                className={`btn btn-xs ${rowFilter === "all" ? "btn-primary" : "btn-secondary"}`}
                                                onClick={() => setRowFilter("all")}
                                                style={{ fontSize: '0.75rem', padding: '3px 9px' }}
                                            >
                                                All rows
                                            </button>
                                            <button
                                                type="button"
                                                className={`btn btn-xs ${rowFilter === "attention" ? "btn-primary" : "btn-secondary"}`}
                                                onClick={() => setRowFilter("attention")}
                                                style={{ fontSize: '0.75rem', padding: '3px 9px' }}
                                            >
                                                Needs a look ({attentionCount})
                                            </button>
                                        </div>
                                    )}
                                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                                        Selected to import: <strong style={{ color: 'var(--primary)' }}>{selectedCount} of {items.length}</strong> ({formatCurr(totalSelectedDebits)} debits, {formatCurr(totalSelectedCredits)} credits)
                                    </div>
                                </div>
                            </div>
                            {attentionCount > 0 && (
                                <div style={{
                                    background: '#FEF3C7',
                                    color: '#92400E',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    padding: '8px 12px',
                                    borderRadius: '8px',
                                    border: '1px solid #F59E0B'
                                }}>
                                    {attentionCount} row{attentionCount !== 1 ? "s" : ""} {attentionCount === 1 ? "was" : "were"} extracted with lower confidence (date, amount, direction, or category). Fix those before importing — use “Needs a look” to jump to them.
                                </div>
                            )}

                            {/* Extracted Transactions Grid */}
                            {filteredItems.length === 0 ? (
                                <div className="empty-state" style={{ padding: '30px 10px' }}>
                                    <Icon name="alert" />
                                    <div className="empty-state-text">
                                        <h3>No Matching Transactions</h3>
                                        <p>No rows matched your search filter "{searchQuery}".</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="table-responsive" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                                    <table className="table" style={{ minWidth: '1050px', fontSize: '0.82rem' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: '36px' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={allSelected}
                                                        onChange={handleToggleSelectAll}
                                                        style={{ transform: 'scale(1.2)' }}
                                                    />
                                                </th>
                                                <th style={{ width: '130px' }}>Date</th>
                                                <th style={{ minWidth: '180px' }}>Narration / Merchant</th>
                                                <th style={{ width: '150px' }}>Category</th>
                                                <th style={{ width: '130px' }}>Account</th>
                                                <th style={{ width: '100px' }}>Amount</th>
                                                <th style={{ width: '90px' }}>Type</th>
                                                <th style={{ width: '110px' }}>Tags</th>
                                                <th style={{ width: '120px' }}>Notes</th>
                                                <th style={{ width: '110px', color: 'var(--text-muted)' }}>Ref ID</th>
                                                {hasLinkOptions && <th style={{ width: '170px' }}>Link to Ledger</th>}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredItems.map((item) => (
                                                <tr key={item.tempId} style={{
                                                    opacity: item.selected ? 1 : 0.4,
                                                    transition: 'all 0.15s ease',
                                                    background: isNeedsAttention(item) ? 'rgba(245, 158, 11, 0.08)' : undefined
                                                }}>
                                                    <td>
                                                        <input
                                                            type="checkbox"
                                                            checked={item.selected}
                                                            onChange={() => handleToggleItem(item.tempId)}
                                                            style={{ transform: 'scale(1.2)' }}
                                                        />
                                                    </td>
                                                    <td>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                                            <input type="date" className="form-control" style={cellInput}
                                                                value={item.date}
                                                                onChange={(e) => handleFieldChange(item.tempId, "date", e.target.value)}
                                                            />
                                                            {isNeedsAttention(item) && (
                                                                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#B45309', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                                                                    {(item._importConfidence === "low" ? "Low confidence" : item._importConfidence === "medium" ? "Check this row" : "Needs review")}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td>
                                                        <input type="text" className="form-control" style={cellInput}
                                                            value={item.narration}
                                                            onChange={(e) => handleFieldChange(item.tempId, "narration", e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <select className="form-control" style={cellInput}
                                                            value={item.category}
                                                            onChange={(e) => handleFieldChange(item.tempId, "category", e.target.value)}
                                                        >
                                                            <option value="Others - Needs Review 🔍">🔍 Others - Needs Review</option>
                                                            {renderCategoryOptions(rawCategories, item.type)}
                                                        </select>
                                                    </td>
                                                    <td>
                                                        {accounts.length > 0 ? (
                                                            <select className="form-control" style={cellInput}
                                                                value={item.account}
                                                                onChange={(e) => handleFieldChange(item.tempId, "account", e.target.value)}
                                                            >
                                                                {accounts.map(a => <option key={a} value={a}>{a}</option>)}
                                                            </select>
                                                        ) : (
                                                            <input type="text" className="form-control" style={cellInput}
                                                                value={item.account}
                                                                onChange={(e) => handleFieldChange(item.tempId, "account", e.target.value)}
                                                            />
                                                        )}
                                                    </td>
                                                    <td>
                                                        <input type="number" step="0.01" className="form-control" style={cellInput}
                                                            value={item.amount}
                                                            onChange={(e) => handleFieldChange(item.tempId, "amount", parseFloat(e.target.value) || 0)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <select className="form-control" style={{
                                                            ...cellInput,
                                                            fontWeight: 600,
                                                            color: item.type === "income" ? "var(--success)" : "var(--danger)",
                                                            background: item.type === "income" ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)"
                                                        }}
                                                            value={item.type}
                                                            onChange={(e) => handleFieldChange(item.tempId, "type", e.target.value)}
                                                        >
                                                            <option value="expense">🔴 Outflow</option>
                                                            <option value="income">🟢 Inflow</option>
                                                        </select>
                                                    </td>
                                                    <td>
                                                        <input type="text" className="form-control" style={cellInput}
                                                            placeholder="tag1, tag2"
                                                            value={item.tags}
                                                            onChange={(e) => handleFieldChange(item.tempId, "tags", e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input type="text" className="form-control" style={cellInput}
                                                            placeholder="Optional note…"
                                                            value={item.notes}
                                                            onChange={(e) => handleFieldChange(item.tempId, "notes", e.target.value)}
                                                        />
                                                    </td>
                                                    <td>
                                                        <input type="text" className="form-control" style={refIdStyle}
                                                            placeholder="Auto-detected…"
                                                            value={item.refId}
                                                            onChange={(e) => handleFieldChange(item.tempId, "refId", e.target.value)}
                                                        />
                                                    </td>
                                                    {hasLinkOptions && (
                                                        <td>
                                                            <select className="form-control" style={cellInput}
                                                                value={item.linkTo}
                                                                onChange={(e) => handleFieldChange(item.tempId, "linkTo", e.target.value)}
                                                            >
                                                                {renderLinkOptions()}
                                                            </select>
                                                        </td>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                        <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', paddingTop: '12px' }}>
                            <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                            <button
                                className="btn btn-primary"
                                onClick={handleSave}
                                disabled={selectedCount === 0 || saving}
                            >
                                {saving ? "Importing…" : `Import ${selectedCount} Transaction${selectedCount !== 1 ? 's' : ''}`}
                            </button>
                        </div>
                    </div>
                </div>
            );
        };


        // --- DIALOG COMPONENT: CSV Column Mapping Dialog ---
        export const CsvMappingDialog = ({ mappingData, onClose, onConfirm }) => {
            useEscapeKey(onClose);
            const { headers, filename } = mappingData;
            const [mappings, setMappings] = React.useState({
                date: 0,
                merchant: 1,
                amount: 2,
                type: -1,
                debit: -1,
                credit: -1
            });

            const [useDebitCredit, setUseDebitCredit] = React.useState(false);

            const handleSave = () => {
                onConfirm(mappings);
            };

            return (
                <div className="modal-overlay">
                    <div className="modal-container modal-lg">
                        <div className="modal-header">
                            <h3 className="modal-title">Map Columns for: {filename}</h3>
                            <button className="modal-close-btn" onClick={onClose}>
                                <Icon name="close" />
                            </button>
                        </div>
                        <div className="modal-body">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                    Match the headers from your bank statement file columns to the correct schema properties.
                                </p>

                                <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500, fontSize: '0.9rem', cursor: 'pointer' }}>
                                        <input
                                            type="checkbox"
                                            checked={useDebitCredit}
                                            onChange={(e) => setUseDebitCredit(e.target.checked)}
                                            style={{ transform: 'scale(1.2)' }}
                                        />
                                        <span>Use separate Debit & Credit columns</span>
                                    </label>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                                    <div className="form-field">
                                        <label>Transaction Date Column</label>
                                        <select
                                            className="form-control"
                                            value={mappings.date}
                                            onChange={(e) => setMappings({ ...mappings, date: parseInt(e.target.value) })}
                                        >
                                            {headers.map(h => <option key={h.index} value={h.index}>{h.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="form-field">
                                        <label>Merchant / Description Column</label>
                                        <select
                                            className="form-control"
                                            value={mappings.merchant}
                                            onChange={(e) => setMappings({ ...mappings, merchant: parseInt(e.target.value) })}
                                        >
                                            {headers.map(h => <option key={h.index} value={h.index}>{h.name}</option>)}
                                        </select>
                                    </div>

                                    {!useDebitCredit ? (
                                        <>
                                            <div className="form-field">
                                                <label>Amount Column</label>
                                                <select
                                                    className="form-control"
                                                    value={mappings.amount}
                                                    onChange={(e) => setMappings({ ...mappings, amount: parseInt(e.target.value) })}
                                                >
                                                    {headers.map(h => <option key={h.index} value={h.index}>{h.name}</option>)}
                                                </select>
                                            </div>

                                            <div className="form-field">
                                                <label>Inflow/Outflow Flag Column (Optional)</label>
                                                <select
                                                    className="form-control"
                                                    value={mappings.type}
                                                    onChange={(e) => setMappings({ ...mappings, type: parseInt(e.target.value) })}
                                                >
                                                    <option value={-1}>Detect from Amount (+/-)</option>
                                                    {headers.map(h => <option key={h.index} value={h.index}>{h.name}</option>)}
                                                </select>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="form-field">
                                                <label>Debit Amount Column (Outflows)</label>
                                                <select
                                                    className="form-control"
                                                    value={mappings.debit}
                                                    onChange={(e) => setMappings({ ...mappings, debit: parseInt(e.target.value) })}
                                                >
                                                    <option value={-1}>-- Select Column --</option>
                                                    {headers.map(h => <option key={h.index} value={h.index}>{h.name}</option>)}
                                                </select>
                                            </div>

                                            <div className="form-field">
                                                <label>Credit Amount Column (Inflows)</label>
                                                <select
                                                    className="form-control"
                                                    value={mappings.credit}
                                                    onChange={(e) => setMappings({ ...mappings, credit: parseInt(e.target.value) })}
                                                >
                                                    <option value={-1}>-- Select Column --</option>
                                                    {headers.map(h => <option key={h.index} value={h.index}>{h.name}</option>)}
                                                </select>
                                            </div>
                                        </>
                                    )}

                                </div>

                                <div className="section-card" style={{ padding: '14px', backgroundColor: '#F9FAFB' }}>
                                    <h4 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '6px' }}>Row Sample Preview:</h4>
                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                        {headers.slice(0, 5).map(h => (
                                            <span key={h.index} style={{ fontSize: '0.75rem', backgroundColor: '#FFFFFF', padding: '4px 8px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                                                <strong>{h.name}</strong>: {mappingData.rows[0]?.[h.index] || "-"}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="modal-footer">
                            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
                            <button className="btn btn-primary" onClick={handleSave}>Confirm Map & Import</button>
                        </div>
                    </div>
                </div>
            );
        };


