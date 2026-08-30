import { processImportedTransaction, DEFAULT_CATEGORIES } from "../utils.jsx";

// Helper to dynamically load external heavy PDF & OCR libraries on-demand
export const loadImportLibraries = async () => {
    const scripts = [];
    if (!window.pdfjsLib) {
        scripts.push('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    }
    if (!window.PDFLib) {
        scripts.push('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js');
    }
    if (!window.Tesseract) {
        scripts.push('https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js');
    }

    for (const src of scripts) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
};


        // Client-side CSV Text Parser
        export const parseCSVText = (text) => {
            const lines = [];
            let row = [""];
            let inQuotes = false;

            for (let i = 0; i < text.length; i++) {
                const char = text[i];
                const nextChar = text[i + 1];

                if (char === '"') {
                    if (inQuotes && nextChar === '"') {
                        row[row.length - 1] += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    row.push('');
                } else if ((char === '\r' || char === '\n') && !inQuotes) {
                    if (char === '\r' && nextChar === '\n') {
                        i++;
                    }
                    lines.push(row);
                    row = [''];
                } else {
                    row[row.length - 1] += char;
                }
            }
            if (row.length > 1 || row[0] !== '') {
                lines.push(row);
            }
            return lines;
        };

        // PDF Document Pre-Processor & Info Extractor using PDF-lib
        // Extracts metadata (Title, Author, Subject, Producer), AcroForm Interactive Fields, Page Dimensions & Rotations
        export const preprocessPDFWithPDFLib = async (arrayBuffer) => {
            const result = {
                metadata: {},
                formFields: [],
                pageInfos: [],
                numPages: 0,
                formTextItems: [],
                preprocessed: true
            };

            const PDFLib = window.PDFLib || window.pdfLib;
            if (!PDFLib || !PDFLib.PDFDocument) {
                console.warn("PDF-lib is not available on window. Skipping PDF-lib pre-processing.");
                return result;
            }

            try {
                // Load PDF document using pdf-lib (with ignoreEncryption flag for robust loading)
                const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
                result.numPages = pdfDoc.getPageCount();

                // 1. Extract Document Metadata
                try {
                    result.metadata = {
                        title: pdfDoc.getTitle() || "",
                        author: pdfDoc.getAuthor() || "",
                        subject: pdfDoc.getSubject() || "",
                        creator: pdfDoc.getCreator() || "",
                        producer: pdfDoc.getProducer() || "",
                        keywords: pdfDoc.getKeywords() || "",
                        creationDate: pdfDoc.getCreationDate() ? pdfDoc.getCreationDate().toISOString() : null,
                        modificationDate: pdfDoc.getModificationDate() ? pdfDoc.getModificationDate().toISOString() : null,
                        pageCount: result.numPages
                    };
                } catch (metaErr) {
                    console.warn("PDF-lib metadata extraction notice:", metaErr);
                }

                // 2. Extract AcroForm Interactive Fields & Values (Statements, Form Receipts, Tax Invoices)
                try {
                    const form = pdfDoc.getForm();
                    const fields = form.getFields();
                    fields.forEach((field, index) => {
                        const name = field.getName();
                        const fieldType = field.constructor ? field.constructor.name : "Field";
                        let val = "";
                        try {
                            if (typeof field.getText === 'function') {
                                val = field.getText() || "";
                            } else if (typeof field.getValue === 'function') {
                                val = field.getValue() || "";
                            }
                        } catch (vErr) { }

                        if (name || val) {
                            result.formFields.push({ name, type: fieldType, value: val });
                            if (val && val.trim()) {
                                result.formTextItems.push({
                                    str: `${name}: ${val}`,
                                    x: 50,
                                    y: 850 - (index * 18),
                                    width: 100,
                                    page: 1,
                                    isFormField: true
                                });
                            }
                        }
                    });
                } catch (formErr) {
                    // Normal PDFs may not contain interactive AcroForms
                }

                // 3. Inspect page structures (geometry & rotation)
                try {
                    const pages = pdfDoc.getPages();
                    result.pageInfos = pages.map((page, idx) => {
                        const { width, height } = page.getSize();
                        const rotation = page.getRotation ? page.getRotation().angle : 0;
                        return { pageIndex: idx + 1, width, height, rotation };
                    });
                } catch (pErr) { }

            } catch (err) {
            }

            return result;
        };

        // Multi-pass JSON sanitizer and partial JSON recovery helper for AI outputs
        const robustParseJsonTransactions = (jsonStr) => {
            let clean = (jsonStr || "").replace(/```json/gi, '').replace(/```/g, '').trim();
            if (!clean) return [];

            // Attempt 1: Standard JSON parse
            try {
                const res = JSON.parse(clean);
                if (Array.isArray(res)) return res;
            } catch (e1) { }

            // Attempt 2: Sanitize raw control characters & unescaped linebreaks
            try {
                const sanitized = clean.replace(/[\u0000-\u001F]+/g, " ");
                const res = JSON.parse(sanitized);
                if (Array.isArray(res)) return res;
            } catch (e2) { }

            // Attempt 3: Auto-fix truncated JSON array (cut off at max tokens)
            try {
                const lastBraceIdx = clean.lastIndexOf('}');
                if (lastBraceIdx !== -1) {
                    const repaired = clean.substring(0, lastBraceIdx + 1) + ']';
                    const res = JSON.parse(repaired);
                    if (Array.isArray(res)) return res;
                }
            } catch (e3) { }

            // Attempt 4: Extract individual valid JSON objects via Regex
            const extracted = [];
            const objectMatches = clean.match(/\{\s*"date"\s*:[\s\S]*?\}/gi);
            if (objectMatches) {
                for (const objStr of objectMatches) {
                    try {
                        const parsedObj = JSON.parse(objStr);
                        if (parsedObj && (parsedObj.date || parsedObj.amount)) {
                            extracted.push(parsedObj);
                        }
                    } catch (e4) { }
                }
                if (extracted.length > 0) return extracted;
            }

            // Attempt 5: Key-Value regex fallback for extreme string escaping issues
            const kvRegex = /"date"\s*:\s*"([^"]+)"[\s\S]*?"narration"\s*:\s*"([^"]*)"[\s\S]*?"amount"\s*:\s*([\d.]+)[\s\S]*?"type"\s*:\s*"([^"]+)"/gi;
            let m;
            while ((m = kvRegex.exec(clean)) !== null) {
                extracted.push({
                    date: m[1],
                    narration: m[2],
                    amount: parseFloat(m[3]) || 0,
                    type: m[4]
                });
            }

            if (extracted.length > 0) return extracted;

            throw new Error("Unable to parse JSON transaction data returned by AI.");
        };

        // Helper to split multi-page PDF into single-page PDF File chunks using pdf-lib
        export const splitPdfIntoPages = async (file) => {
            const arrayBuffer = await file.arrayBuffer();
            const PDFLib = window.PDFLib || window.pdfLib;
            if (!PDFLib || !PDFLib.PDFDocument) return [file];

            const srcDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
            const pageCount = srcDoc.getPageCount();
            if (pageCount <= 1) return [file];

            const pageFiles = [];
            for (let i = 0; i < pageCount; i++) {
                const newDoc = await PDFLib.PDFDocument.create();
                const [copiedPage] = await newDoc.copyPages(srcDoc, [i]);
                newDoc.addPage(copiedPage);
                const pdfBytes = await newDoc.save();
                const pageBlob = new Blob([pdfBytes], { type: 'application/pdf' });
                const pageFile = new File([pageBlob], `${file.name}_page_${i + 1}.pdf`, { type: 'application/pdf' });
                pageFiles.push(pageFile);
            }
            return pageFiles;
        };

        // Gemini Free Vision/PDF Bank Statement Parser API Client (Parallel Page-by-Page Extractor)
        export const parseBankStatementWithGeminiAI = async (file, apiKey, onProgress, availableCategories = DEFAULT_CATEGORIES, rules = []) => {
            const key = (apiKey || localStorage.getItem("gemini_api_key") || "").trim();
            if (!key) {
                throw new Error("Gemini API Key is required for AI Bank Parsing. Get a free API key at https://aistudio.google.com/app/apikey");
            }

            const categoriesPool = (availableCategories && availableCategories.length > 0) ? availableCategories : DEFAULT_CATEGORIES;
            const categoriesListStr = categoriesPool.join(", ");

            // 1. Dynamically query ModelService.ListModels for active models supported by user's API key
            let candidateModels = [
                "gemini-2.0-flash",
                "gemini-1.5-flash-latest",
                "gemini-1.5-flash-001",
                "gemini-1.5-pro-latest",
                "gemini-2.0-flash-exp"
            ];

            try {
                const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
                if (listRes.ok) {
                    const listData = await listRes.json();
                    const available = (listData.models || [])
                        .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"))
                        .map(m => m.name.replace(/^models\//, ''));

                    if (available.length > 0) {
                        candidateModels = available.sort((a, b) => {
                            const aScore = a.includes("flash") ? 2 : (a.includes("pro") ? 1 : 0);
                            const bScore = b.includes("flash") ? 2 : (b.includes("pro") ? 1 : 0);
                            return bScore - aScore;
                        });
                    }
                }
            } catch (listErr) {
                console.warn("Model list discovery notice:", listErr);
            }

            // 2. Split multi-page PDF into single page document chunks
            let pdfPages = [file];
            if (file.name.toLowerCase().endsWith('.pdf')) {
                try {
                    if (typeof onProgress === 'function') onProgress("📄 Inspecting PDF structure & splitting pages…");
                    pdfPages = await splitPdfIntoPages(file);
                } catch (e) {
                    console.warn("PDF page splitting notice, processing as single file:", e);
                }
            }

            const totalPages = pdfPages.length;
            const CONCURRENCY_LIMIT = 5; // Process 5 pages simultaneously in parallel batches
            const pageResults = new Array(totalPages);
            let completedCount = 0;

            if (typeof onProgress === 'function') {
                if (totalPages > 1) {
                    onProgress(`⚡ Gemini AI processing ${totalPages} pages in parallel (${CONCURRENCY_LIMIT} at once)…`);
                } else {
                    onProgress(`⚡ Gemini AI processing single page document…`);
                }
            }

            // Helper function to process a single PDF page chunk via Gemini API
            const extractSinglePage = async (pageIdx, pageFile) => {
                const base64Data = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const res = reader.result;
                        const b64 = typeof res === 'string' ? (res.split(',')[1] || res) : '';
                        resolve(b64);
                    };
                    reader.onerror = (err) => reject(err);
                    reader.readAsDataURL(pageFile);
                });

                const mimeType = pageFile.type || 'application/pdf';
                const currentYear = new Date().getFullYear();

                const promptText = `You are an expert financial bank statement parser. Extract ALL transactions from this statement page.
Return ONLY a valid JSON array of objects with NO markdown formatting, NO extra text.
Do NOT skip any transaction line on this page. Do NOT stop early. Extract every single row.

Transaction Classifications ("type"):
- "inflow" (or "income"): Credits, deposits, salary, freelance payouts, interest received, refunds, cashbacks.
- "outflow" (or "expense"): Debits, withdrawals, merchant payments, bill payments, shopping, fees paid.
- "neutral": Internal account-to-account transfers, wallet top-ups, credit card bill settlements, loan repayments, balance adjustments, or pass-through entries.

DATE (critical — this is how the app stores every transaction):
- Each ROW has its own transaction date. Copy that row's date. Do NOT reuse one date for every row.
- NEVER use statement date, statement period start/end, "as on" date, opening date, closing date, or billing date (these are often the 20th). Those header dates are not the transaction date.
- Prefer the Txn Date / Transaction Date / Date column. Use Value Date / Value Dt only if no txn date exists on that row.
- "datePrinted": EXACT date text printed on THIS row only (e.g. "05/08/26" or "05 Aug 2026"). Different rows almost always have different datePrinted values.
- "date" MUST be YYYY-MM-DD with zero-padded month and day, converted from that row's datePrinted (example: 05/08/26 → 2026-08-05). Never return DD/MM/YYYY or "05 Aug 2026" in "date".
- Indian statements use DD/MM/YYYY or DD/MM/YY. 01/02/26 is 1 February, NOT 2 January.
- Take the year from that row or the statement period on the page. If the year is 2-digit, expand it (26 → 2026). If still missing, use ${currentYear}.

Keys required for each transaction object:
- "datePrinted": exact per-row printed date as specified above
- "date": string in YYYY-MM-DD converted from datePrinted
- "narration": full transaction description or merchant name (preserve full detail, UPI IDs, NEFT/RTGS/IMPS refs)
- "amount": positive number
- "type": MUST be strictly one of: "inflow", "outflow", or "neutral"
- "category": MUST be picked strictly from this exact allowed categories list: [${categoriesListStr}]. Analyze narration, merchant name, and context carefully to choose the single best matching category. For internal transfers or card settlements, pick a Transfer/Credit category. If no specific category fits, use "Others - Needs Review 🔍".
- "refId": string transaction reference/UPI/NEFT/cheque ID if present, else ""
- "confidence": "high" if date, amount, and debit/credit are clearly printed; "medium" if one of those was inferred from context; "low" if date, amount, or direction is blurry, guessed, or ambiguous. Uncertain category alone is not enough for "low" — use "Others - Needs Review 🔍" for that.

Output format example:
[
  {"datePrinted":"01/02/26","date":"${currentYear}-02-01","narration":"UPI-SRI SAI LEELA AMBULA","amount":1000.0,"type":"outflow","category":"Food & Drinks - Fastfood 🍔","refId":"0000639803414548","confidence":"high"},
  {"datePrinted":"02/02/26","date":"${currentYear}-02-02","narration":"SALARY CREDIT ACME CORP","amount":50000.0,"type":"inflow","category":"Income - Salary 💵","refId":"NEFT12345678","confidence":"high"},
  {"datePrinted":"03/02/26","date":"${currentYear}-02-03","narration":"TRANSFER TO SAVINGS A/C","amount":5000.0,"type":"neutral","category":"Transfer - Bank Transfer 🏦","refId":"UPI87654321","confidence":"medium"}
]`;

                const payload = {
                    contents: [{
                        parts: [
                            { text: promptText },
                            { inline_data: { mime_type: mimeType, data: base64Data } }
                        ]
                    }],
                    generationConfig: {
                        temperature: 0.1,
                        maxOutputTokens: 8192,
                        responseMimeType: "application/json"
                    }
                };

                let response = null;
                let lastErrMsg = "";

                for (const modelName of candidateModels) {
                    try {
                        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${encodeURIComponent(key)}`;
                        const res = await fetch(apiUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(payload)
                        });
                        if (res.ok) {
                            response = res;
                            break;
                        } else {
                            const errData = await res.json().catch(() => ({}));
                            lastErrMsg = errData?.error?.message || `HTTP ${res.status}`;
                        }
                    } catch (e) {
                        lastErrMsg = e.message;
                    }
                }

                if (!response) {
                    console.warn(`Page ${pageIdx + 1} extraction failed: ${lastErrMsg}`);
                    return { pageTx: [], rawText: "" };
                }

                const resJson = await response.json();
                const rawText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text || "";
                const pageTx = robustParseJsonTransactions(rawText);
                return { pageTx, rawText };
            };

            // Process pages in parallel batches
            for (let i = 0; i < totalPages; i += CONCURRENCY_LIMIT) {
                const batchIndices = [];
                for (let j = i; j < Math.min(i + CONCURRENCY_LIMIT, totalPages); j++) {
                    batchIndices.push(j);
                }

                await Promise.all(batchIndices.map(async (pageIdx) => {
                    const res = await extractSinglePage(pageIdx, pdfPages[pageIdx]);
                    pageResults[pageIdx] = res;
                    completedCount++;
                    if (typeof onProgress === 'function' && totalPages > 1) {
                        onProgress(`⚡ Gemini AI extracted ${completedCount} of ${totalPages} pages in parallel…`);
                    }
                }));
            }

            // Aggregate results preserving strict page order
            let allExtractedTx = [];
            let rawTextAccumulator = "";
            for (let i = 0; i < totalPages; i++) {
                if (pageResults[i]) {
                    allExtractedTx = allExtractedTx.concat(pageResults[i].pageTx);
                    rawTextAccumulator += " " + pageResults[i].rawText;
                }
            }

            const bankProfile = detectBankProfile(file.name + " " + rawTextAccumulator);

            const todayIso = new Date().toISOString().split('T')[0];
            const printedDateField = (tx) => tx.datePrinted || tx.date_printed || tx.txnDate || tx.printedDate || "";
            const dateFromNarration = (text) => {
                if (!text) return null;
                const match = String(text).match(/(?:\b)(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[.\s-]+\d{1,2}(?:\s*,\s*\d{2,4})?|\d{1,2}[\s-]+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:[\s,-]+\d{2,4})?)(?:\b)/i);
                return match ? parseHeuristicDate(match[0]) : null;
            };

            const resolvedDates = allExtractedTx.map(tx => {
                const printed = printedDateField(tx);
                return parseHeuristicDate(printed) || parseHeuristicDate(tx.date) || dateFromNarration(tx.narration);
            });
            const uniqueResolved = new Set(resolvedDates.filter(Boolean));
            const allSameDate = allExtractedTx.length >= 5 && uniqueResolved.size <= 1;

            return allExtractedTx.map((tx, idx) => {
                const printed = printedDateField(tx);
                let parsedDate = parseHeuristicDate(printed) || parseHeuristicDate(tx.date);
                if (allSameDate) {
                    const fromNarration = dateFromNarration(tx.narration);
                    if (fromNarration) parsedDate = fromNarration;
                }
                const storedDate = parsedDate || resolvedDates[idx] || todayIso;
                const amountVal = Math.abs(parseFloat(tx.amount) || 0);
                let confidence = String(tx.confidence || "").toLowerCase();
                if (confidence !== "high" && confidence !== "medium" && confidence !== "low") {
                    confidence = parsedDate && amountVal > 0 ? "high" : "low";
                }
                if (!parsedDate || amountVal <= 0) confidence = "low";
                else if (allSameDate) confidence = "low";
                else if (String(tx.category || "").includes("Needs Review") && confidence === "high") {
                    confidence = "medium";
                }

                const rawItem = {
                    id: crypto.randomUUID(),
                    date: storedDate,
                    narration: tx.narration || "Bank Transaction",
                    merchant: tx.narration || "Bank Transaction",
                    amount: amountVal,
                    type: (tx.type === "inflow" || tx.type === "income") ? "income" : (tx.type === "neutral" ? "neutral" : "expense"),
                    category: tx.category || "Others - Needs Review 🔍",
                    account: "",
                    tags: [],
                    notes: "",
                    refId: tx.refId || "",
                    source: "pdf-import",
                    receipt: false,
                    _bankProfile: bankProfile,
                    _aiParsed: true,
                    _importConfidence: confidence,
                    _rawColumns: {
                        "Date": printed || storedDate,
                        "Description": tx.narration,
                        "Amount": tx.amount,
                        "Ref ID": tx.refId
                    }
                };
                return processImportedTransaction(rawItem, rules, categoriesPool);
            });
        };

        // Dedicated Bank Layout Profile Detector
        const detectBankProfile = (rawText) => {
            const textUpper = (rawText || "").toUpperCase();
            if (textUpper.includes("HDFC BANK") || textUpper.includes("HDFCBANK") || textUpper.includes("HDFC")) {
                return { name: "HDFC Bank", code: "HDFC", icon: "🏦", primaryColor: "#004B87" };
            }
            if (textUpper.includes("STATE BANK OF INDIA") || textUpper.includes("SBI") || textUpper.includes("ONLINESBI") || textUpper.includes("SBIN0")) {
                return { name: "State Bank of India (SBI)", code: "SBI", icon: "🏦", primaryColor: "#280071" };
            }
            if (textUpper.includes("ICICI BANK") || textUpper.includes("ICICIBANK") || textUpper.includes("ICIC0")) {
                return { name: "ICICI Bank", code: "ICICI", icon: "🏦", primaryColor: "#F37021" };
            }
            if (textUpper.includes("AXIS BANK") || textUpper.includes("UTIB0") || textUpper.includes("AXISBANK")) {
                return { name: "Axis Bank", code: "AXIS", icon: "🏦", primaryColor: "#97144D" };
            }
            if (textUpper.includes("KOTAK MAHINDRA") || textUpper.includes("KOTAK BANK") || textUpper.includes("KKBK0")) {
                return { name: "Kotak Mahindra Bank", code: "KOTAK", icon: "🏦", primaryColor: "#ED1C24" };
            }
            if (textUpper.includes("PUNJAB NATIONAL BANK") || textUpper.includes("PNB") || textUpper.includes("PUNB0")) {
                return { name: "Punjab National Bank (PNB)", code: "PNB", icon: "🏦", primaryColor: "#A21942" };
            }
            if (textUpper.includes("CANARA BANK") || textUpper.includes("CNRB0")) {
                return { name: "Canara Bank", code: "CANARA", icon: "🏦", primaryColor: "#00A8B5" };
            }
            if (textUpper.includes("BANK OF BARODA") || textUpper.includes("BARB0")) {
                return { name: "Bank of Baroda", code: "BOB", icon: "🏦", primaryColor: "#F26522" };
            }
            if (textUpper.includes("INDUSIND BANK") || textUpper.includes("INDB0")) {
                return { name: "IndusInd Bank", code: "INDUSIND", icon: "🏦", primaryColor: "#842220" };
            }
            if (textUpper.includes("IDFC FIRST BANK") || textUpper.includes("IDFB0")) {
                return { name: "IDFC FIRST Bank", code: "IDFC", icon: "🏦", primaryColor: "#9E1B32" };
            }
            if (textUpper.includes("FEDERAL BANK") || textUpper.includes("FDRL0")) {
                return { name: "Federal Bank", code: "FEDERAL", icon: "🏦", primaryColor: "#004889" };
            }
            if (textUpper.includes("CHASE BANK") || textUpper.includes("JPMORGAN CHASE") || textUpper.includes("CHASE")) {
                return { name: "JPMorgan Chase Bank", code: "CHASE", icon: "🏛️", primaryColor: "#117ACA" };
            }
            if (textUpper.includes("BANK OF AMERICA") || textUpper.includes("BOFA")) {
                return { name: "Bank of America", code: "BOFA", icon: "🏛️", primaryColor: "#012169" };
            }
            if (textUpper.includes("WELLS FARGO")) {
                return { name: "Wells Fargo", code: "WELLSFARGO", icon: "🏛️", primaryColor: "#CD1409" };
            }
            if (textUpper.includes("CITIBANK") || textUpper.includes("CITI")) {
                return { name: "Citibank", code: "CITI", icon: "🏛️", primaryColor: "#003B70" };
            }
            if (textUpper.includes("REVOLUT")) {
                return { name: "Revolut", code: "REVOLUT", icon: "💳", primaryColor: "#0075FF" };
            }
            if (textUpper.includes("WISE") || textUpper.includes("TRANSFERWISE")) {
                return { name: "Wise", code: "WISE", icon: "💳", primaryColor: "#00E5FF" };
            }
            return { name: "Bank Statement", code: "GENERIC", icon: "📄", primaryColor: "#6558D3" };
        };

        // Mathematical Balance Reconciliation & Quality Auditing
        const reconcileStatementBalances = (transactions) => {
            if (!transactions || transactions.length === 0) {
                return {
                    passRate: 100,
                    reconciled: true,
                    totalDebits: 0,
                    totalCredits: 0,
                    mathChecks: 0,
                    mathPasses: 0,
                    openingBalance: null,
                    closingBalance: null
                };
            }

            let mathPasses = 0;
            let mathChecks = 0;
            let totalDebits = 0;
            let totalCredits = 0;
            let openingBal = null;
            let closingBal = null;

            for (let i = 0; i < transactions.length; i++) {
                const tx = transactions[i];
                if (tx.type === "expense") totalDebits += tx.amount;
                if (tx.type === "income") totalCredits += tx.amount;

                const rawCols = tx._rawColumns || {};
                const balStr = rawCols["balance"] || rawCols["closing balance"] || rawCols["running balance"] || rawCols["bal"] || "";
                const balVal = parseFloat(String(balStr).replace(/[^\d.-]/g, ''));

                if (!isNaN(balVal)) {
                    if (openingBal === null && i === 0) {
                        // Estimate opening balance
                        openingBal = tx.type === "expense" ? balVal + tx.amount : balVal - tx.amount;
                    }
                    closingBal = balVal;

                    if (i > 0) {
                        const prevBalStr = (transactions[i - 1]._rawColumns || {})["balance"] || (transactions[i - 1]._rawColumns || {})["closing balance"] || "";
                        const prevBal = parseFloat(String(prevBalStr).replace(/[^\d.-]/g, ''));

                        if (!isNaN(prevBal)) {
                            mathChecks++;
                            // Check if prevBal +/- amount = balVal
                            const expectedExpense = Math.round((prevBal - tx.amount) * 100) / 100;
                            const expectedIncome = Math.round((prevBal + tx.amount) * 100) / 100;
                            const expectedReverseExpense = Math.round((prevBal + tx.amount) * 100) / 100; // for reverse chronological
                            const expectedReverseIncome = Math.round((prevBal - tx.amount) * 100) / 100;

                            const actual = Math.round(balVal * 100) / 100;

                            if (Math.abs(actual - expectedExpense) <= 0.5 ||
                                Math.abs(actual - expectedIncome) <= 0.5 ||
                                Math.abs(actual - expectedReverseExpense) <= 0.5 ||
                                Math.abs(actual - expectedReverseIncome) <= 0.5) {
                                mathPasses++;
                            }
                        }
                    }
                }
            }

            const passRate = mathChecks > 0 ? Math.round((mathPasses / mathChecks) * 100) : 100;
            return {
                passRate,
                reconciled: passRate >= 75,
                totalDebits: Math.round(totalDebits * 100) / 100,
                totalCredits: Math.round(totalCredits * 100) / 100,
                mathChecks,
                mathPasses,
                openingBalance: openingBal !== null ? Math.round(openingBal * 100) / 100 : null,
                closingBalance: closingBal !== null ? Math.round(closingBal * 100) / 100 : null
            };
        };

        // Render Canvas page & execute Tesseract OCR for image-based/scanned statement PDFs
        export const performCanvasOCRForPage = async (page, pageNum) => {
            if (!window.Tesseract) return [];
            try {
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement("canvas");
                const context = canvas.getContext("2d");
                canvas.height = viewport.height;
                canvas.width = viewport.width;

                await page.render({ canvasContext: context, viewport: viewport }).promise;
                const dataUrl = canvas.toDataURL("image/png");

                const result = await window.Tesseract.recognize(dataUrl, 'eng');
                const words = result?.data?.words || [];

                return words.map(w => ({
                    str: w.text,
                    x: Math.round(w.bbox.x0 / 2.0),
                    y: Math.round((viewport.height - w.bbox.y0) / 2.0), // invert Y for PDF standard coords
                    width: Math.round((w.bbox.x1 - w.bbox.x0) / 2.0),
                    page: pageNum,
                    isOCR: true
                })).filter(w => w.str && w.str.trim() !== "");
            } catch (err) {
                console.warn(`OCR processing failed for page ${pageNum}:`, err);
                return [];
            }
        };

        // Client-side PDF Text & Geometry Extractor (with PDF-lib Pre-Processing & Password Decryption)
        export const extractTextFromPDF = async (file) => {
            await loadImportLibraries();
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const arrayBuffer = e.target.result;

                        // Pre-process PDF with PDF-lib for document metadata, AcroForm fields, and geometry
                        const pdfLibResult = await preprocessPDFWithPDFLib(arrayBuffer);

                        const pdfjsLib = window['pdfjs-dist/build/pdf'] || window.pdfjsLib;
                        if (!pdfjsLib) {
                            throw new Error("PDF.js library is not loaded.");
                        }

                        let pdf = null;
                        let password = "";
                        let attempts = 0;

                        while (attempts < 3) {
                            try {
                                const loadingTask = pdfjsLib.getDocument({
                                    data: arrayBuffer,
                                    password: password
                                });
                                pdf = await loadingTask.promise;
                                break; // Success!
                            } catch (err) {
                                if (err.name === 'PasswordException') {
                                    attempts++;
                                    if (attempts >= 3) {
                                        throw new Error("Incorrect password entered 3 times.");
                                    }
                                    const passwordHints = `Password Hints for Bank Statements:\n• HDFC: Cust ID / DOB (DDMMYYYY)\n• SBI: Last 5 mobile digits + DOB (DDMMYY)\n• ICICI: Name 4 letters + DOB (DDMM)\n• Axis: Name 4 letters + DOB (DDMMYY)\n• Kotak: CRN or Name + DOB`;
                                    const msg = attempts > 1
                                        ? `Incorrect password (Attempt ${attempts}/3).\nPlease enter password for "${file.name}":\n\n${passwordHints}`
                                        : `The file "${file.name}" is password-protected.\n\n${passwordHints}\n\nEnter Password:`;
                                    password = prompt(msg);
                                    if (password === null) {
                                        throw new Error("Password decryption cancelled by user.");
                                    }
                                } else {
                                    throw err;
                                }
                            }
                        }

                        if (!pdf) {
                            throw new Error("Failed to load PDF document.");
                        }

                        let fullText = "";
                        const pageItems = [];

                        // Prepend extracted interactive form fields from PDF-lib if present
                        if (pdfLibResult.formTextItems && pdfLibResult.formTextItems.length > 0) {
                            pageItems.push(...pdfLibResult.formTextItems);
                            const formTextStr = pdfLibResult.formTextItems.map(item => item.str).join("\n");
                            fullText += formTextStr + "\n";
                        }

                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const textContent = await page.getTextContent();
                            let textItems = textContent.items;

                            // Scanned PDF check: if page has < 5 text elements, fallback to Tesseract OCR
                            if (textItems.length < 5 && window.Tesseract) {
                                const ocrItems = await performCanvasOCRForPage(page, i);
                                if (ocrItems.length > 0) {
                                    textItems = ocrItems;
                                }
                            }

                            // Reconstruct line layout using baseline Y coordinates
                            const lines = {};
                            for (const item of textItems) {
                                if (!item.str || item.str.trim() === "") continue;
                                const rawY = item.y !== undefined ? item.y : item.transform[5];
                                const rawX = item.x !== undefined ? item.x : item.transform[4];
                                const y = Math.round(rawY * 10) / 10;
                                const x = Math.round(rawX * 10) / 10;

                                if (!lines[y]) {
                                    lines[y] = [];
                                }
                                const itemObj = { str: item.str, x, y, width: item.width || 0, page: i };
                                lines[y].push(itemObj);
                                pageItems.push(itemObj);
                            }

                            const sortedY = Object.keys(lines).sort((a, b) => parseFloat(b) - parseFloat(a));
                            const pageLines = sortedY.map(y => {
                                const lineItems = lines[y].sort((a, b) => a.x - b.x);
                                return lineItems.map(item => item.str).join(" ");
                            });

                            fullText += pageLines.join("\n") + "\n";
                        }

                        resolve({
                            fullText,
                            items: pageItems,
                            numPages: pdf.numPages,
                            metadata: pdfLibResult.metadata,
                            formFields: pdfLibResult.formFields,
                            pageInfos: pdfLibResult.pageInfos,
                            pdfLibPreprocessed: true
                        });
                    } catch (err) {
                        reject(err);
                    }
                };
                reader.onerror = (err) => reject(err);
                reader.readAsArrayBuffer(file);
            });
        };

        // Heuristic date parser helper
        export const parseHeuristicDate = (dateStr) => {
            if (!dateStr) return null;
            try {
                const str = String(dateStr).trim();

                // Already-stored ISO calendar date, optionally with a time suffix
                const isoPrefix = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s]|$)/);
                if (isoPrefix) {
                    const y = parseInt(isoPrefix[1], 10);
                    const m = parseInt(isoPrefix[2], 10);
                    const d = parseInt(isoPrefix[3], 10);
                    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    }
                }

                // 1. Text Month parsing (e.g., "15 Aug 2026", "15-Aug-2026", "Aug 15, 2026")
                const monthNames = {
                    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
                    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
                    january: "01", february: "02", march: "03", april: "04", june: "06",
                    july: "07", august: "08", september: "09", october: "10", november: "11", december: "12"
                };

                const textMatch = str.match(/^(\d{1,2})[\s\/-]+([a-z]{3,9})[\s\/-]+(\d{2,4})$/i) ||
                                  str.match(/^([a-z]{3,9})[\s\/-]+(\d{1,2})[\s\/,-]+(\d{2,4})$/i);
                if (textMatch) {
                    let day, monthStr, yearStr;
                    if (/^\d/.test(textMatch[1])) {
                        day = textMatch[1];
                        monthStr = textMatch[2].toLowerCase();
                        yearStr = textMatch[3];
                    } else {
                        monthStr = textMatch[1].toLowerCase();
                        day = textMatch[2];
                        yearStr = textMatch[3];
                    }
                    const monthVal = monthNames[monthStr];
                    if (monthVal) {
                        let y = parseInt(yearStr, 10);
                        if (y < 100) y += 2000;
                        return `${y}-${monthVal}-${String(day).padStart(2, '0')}`;
                    }
                }

                // 2. Numeric date parsing (YYYY-MM-DD or DD-MM-YYYY)
                let cleaned = str.replace(/[\/.]/g, "-").trim();
                const parts = cleaned.split("-");
                if (parts.length === 3) {
                    let [p1, p2, p3] = parts;
                    if (p3.length === 2) p3 = "20" + p3;
                    if (p1.length <= 2) {
                        // Could be DD-MM-YYYY or MM-DD-YYYY
                        let n1 = parseInt(p1, 10);
                        let n2 = parseInt(p2, 10);
                        let y = parseInt(p3, 10);
                        if (n1 > 12 && n2 <= 12) { // DD-MM-YYYY
                            return `${y}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
                        } else if (n2 > 12 && n1 <= 12) { // MM-DD-YYYY
                            return `${y}-${String(n1).padStart(2, '0')}-${String(n2).padStart(2, '0')}`;
                        } else { // Default to DD-MM-YYYY (standard bank statement format)
                            return `${y}-${String(n2).padStart(2, '0')}-${String(n1).padStart(2, '0')}`;
                        }
                    } else if (p1.length === 4) { // YYYY-MM-DD
                        let y = parseInt(p1, 10);
                        let m = parseInt(p2, 10);
                        let d = parseInt(p3, 10);
                        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    }
                }

                // 3. Fallback to JS Date object
                const d = new Date(str);
                if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
                    const y = d.getFullYear();
                    const m = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    return `${y}-${m}-${day}`;
                }
            } catch (e) { }
            return null;
        };

        // High-Precision PDF Statement & Receipt Table Parser for Bank Statements
        export const parseTransactionsFromPDFText = (pdfResult, filename) => {
            const rawText = typeof pdfResult === "string" ? pdfResult : (pdfResult?.fullText || "");
            const pageItems = typeof pdfResult === "object" && pdfResult?.items ? pdfResult.items : [];
            const pdfMetadata = pdfResult?.metadata || {};
            const pdfFormFields = pdfResult?.formFields || [];
            const pdfPageInfos = pdfResult?.pageInfos || [];
            const pdfLibPreprocessed = pdfResult?.pdfLibPreprocessed || false;

            const bankProfile = detectBankProfile(rawText);

            let transactions = [];

            // Pass 1 & 2: Position-aware spatial table parsing with baseline clustering & dynamic column bounding
            if (pageItems.length > 0) {
                const tableResult = parsePositionedPDFTable(pageItems, filename, bankProfile);
                if (tableResult && tableResult.transactions && tableResult.transactions.length > 0) {
                    transactions = tableResult.transactions;
                }
            }

            // Pass 3: Fallback line-by-line parser if spatial table engine yielded 0 rows
            if (transactions.length === 0) {
                transactions = parseFallbackPDFText(rawText, filename);
            }

            // Pass 4: Mathematical Balance Reconciliation & Audit Scoring
            const reconciliation = reconcileStatementBalances(transactions);

            // Enrich transaction objects with Bank Profile & Audit Metadata and auto-categorize into 30 categories
            return transactions.map(tx => {
                const processed = processImportedTransaction(tx, [], DEFAULT_CATEGORIES);
                return {
                    ...processed,
                    _bankProfile: bankProfile,
                    _reconciliation: reconciliation,
                    _pdfMetadata: pdfMetadata,
                    _pdfFormFields: pdfFormFields,
                    _pdfPageInfos: pdfPageInfos,
                    _pdfLibPreprocessed: pdfLibPreprocessed
                };
            });
        };

        // Advanced position-based table parser with visual baseline clustering and multi-line narration stitching
        const parsePositionedPDFTable = (items, filename, bankProfile) => {
            // Baseline Y clustering (tolerance threshold = 3.5pt to handle slight floating point Y variations)
            const linesByPage = {};
            for (const item of items) {
                const p = item.page;
                if (!linesByPage[p]) linesByPage[p] = [];

                let matchedLine = linesByPage[p].find(line => Math.abs(line.y - item.y) <= 3.5);
                if (!matchedLine) {
                    matchedLine = { y: item.y, items: [] };
                    linesByPage[p].push(matchedLine);
                }
                matchedLine.items.push(item);
            }

            // Build array of sorted lines per page (descending Y)
            const allSortedLines = [];
            Object.keys(linesByPage).sort((a, b) => parseInt(a) - parseInt(b)).forEach(p => {
                const pageLines = linesByPage[p];
                pageLines.sort((a, b) => b.y - a.y);
                pageLines.forEach(line => {
                    const sortedItems = line.items.sort((a, b) => a.x - b.x);
                    allSortedLines.push({ page: parseInt(p), y: line.y, items: sortedItems });
                });
            });

            // Known header keywords and header column starters
            const headerKeywords = [
                "date", "narration", "particulars", "description", "details",
                "chq", "ref", "cheque", "value dt", "value date", "withdrawal", "deposit",
                "debit", "credit", "amount", "closing balance", "balance", "ref.no",
                "txn date", "transaction date", "posted date", "type", "mode", "instrument"
            ];

            let headerLine = null;
            let headerLineIdx = -1;

            // Search top 40 lines for table header row
            for (let i = 0; i < Math.min(allSortedLines.length, 40); i++) {
                const line = allSortedLines[i];
                const lineText = line.items.map(it => it.str.toLowerCase()).join(" ");
                let matchCount = 0;
                headerKeywords.forEach(kw => {
                    if (lineText.includes(kw)) matchCount++;
                });

                if (matchCount >= 2 && line.items.length >= 2) {
                    headerLine = line;
                    headerLineIdx = i;
                    break;
                }
            }

            if (!headerLine) return null;

            // Check if header extends to adjacent line (multi-line header title support)
            let combinedHeaderItems = [...headerLine.items];
            if (headerLineIdx + 1 < allSortedLines.length) {
                const nextLine = allSortedLines[headerLineIdx + 1];
                const nextLineText = nextLine.items.map(it => it.str.toLowerCase()).join(" ");
                if (/amt|date|dr|cr|bal|no|no\.|dt|ref/i.test(nextLineText) && nextLine.items.length >= 2) {
                    // Check horizontal alignment proximity
                    combinedHeaderItems.push(...nextLine.items);
                }
            }

            // Extract distinct header columns and their X start coordinates
            const sortedHeaderItems = combinedHeaderItems.sort((a, b) => a.x - b.x);
            const rawHeaderColumns = [];

            let hIdx = 0;
            while (hIdx < sortedHeaderItems.length) {
                const item = sortedHeaderItems[hIdx];
                const str = item.str.trim();
                if (!str) { hIdx++; continue; }

                let combinedText = str;
                let xStart = item.x;
                let nextIdx = hIdx + 1;

                while (nextIdx < sortedHeaderItems.length) {
                    const nextItem = sortedHeaderItems[nextIdx];
                    const nextStr = nextItem.str.trim();
                    const candidate = (combinedText + " " + nextStr).toLowerCase();

                    const isKnownPhrase = (
                        candidate === "value dt" || candidate === "value date" ||
                        candidate === "withdrawal amt." || candidate === "withdrawal amt" || candidate === "withdrawal amount" ||
                        candidate === "deposit amt." || candidate === "deposit amt" || candidate === "deposit amount" ||
                        candidate === "closing balance" || candidate === "opening balance" || candidate === "running balance" ||
                        candidate === "chq./ref.no." || candidate === "chq/ref.no" || candidate === "chq / ref no" || candidate === "chq. / ref. no." ||
                        candidate === "txn date" || candidate === "transaction date" || candidate === "post date"
                    );

                    // Check horizontal distance between header tokens
                    const dist = nextItem.x - (item.x + item.width);

                    if (isKnownPhrase || (dist >= 0 && dist <= 25 && /amt|dt|no|date|dr|cr|bal/i.test(nextStr))) {
                        combinedText += " " + nextStr;
                        nextIdx++;
                    } else {
                        break;
                    }
                }

                rawHeaderColumns.push({ text: combinedText.replace(/\s+/g, " ").trim(), xStart });
                hIdx = nextIdx;
            }

            if (rawHeaderColumns.length < 2) return null;

            // Define exact adaptive X bounding ranges for each column
            const columns = [];
            for (let idx = 0; idx < rawHeaderColumns.length; idx++) {
                const col = rawHeaderColumns[idx];
                const next = rawHeaderColumns[idx + 1];
                let name = col.text.replace(/\s+/g, " ").trim();

                let xMin = idx === 0 ? 0 : columns[idx - 1].xMax;
                let xMax = next ? (next.xStart - 4) : 99999;

                // Prevent overlap
                if (xMax <= xMin) xMax = xMin + 40;

                columns.push({ name, xMin, xMax, xStart: col.xStart });
            }

            const columnNames = columns.map(c => c.name);

            // Regroup text items into table rows with Multi-Line Narration Stitching
            const dateRegex = /(?:\b)(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}(?:\s*,\s*\d{2,4})?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+\d{2,4})?)(?:\b)/i;
            const amountRegex = /(-?[₹$€£¥]?\s?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)\s*(cr|dr|crv|drv)?\b/i;

            const dateColIdx = columns.findIndex(c => /date|dt/i.test(c.name) && !/val/i.test(c.name));
            const dateCol = dateColIdx >= 0 ? columns[dateColIdx] : columns[0];
            const narrationCol = columns.find(c => /narration|description|particulars|details/i.test(c.name)) || columns[1] || columns[0];

            const extractedRows = [];
            let currentRow = null;

            // Process lines below header
            for (let i = headerLineIdx + 1; i < allSortedLines.length; i++) {
                const line = allSortedLines[i];
                const lineText = line.items.map(it => it.str).join(" ").trim();

                // Skip non-table page footers, terms, & running page titles
                if (!lineText || /page\s*no\s*:|statement\s*of\s*account|nomination\s*:|statement\s*from|account\s*branch|hdfc\s*bank|joint\s*holders|total\s*debits|total\s*credits/i.test(lineText)) {
                    continue;
                }

                // Check if line starts a NEW transaction row (contains date in date column or line start)
                const dateItem = line.items.find(it => (it.x >= dateCol.xMin && it.x <= dateCol.xMax + 15) && dateRegex.test(it.str));
                const isNewRow = Boolean(dateItem || (line.items.length >= 2 && dateRegex.test(line.items[0].str)));

                if (isNewRow) {
                    if (currentRow) {
                        extractedRows.push(currentRow);
                    }
                    currentRow = {};
                    columns.forEach(c => currentRow[c.name] = []);
                }

                if (!currentRow) continue;

                // Assign text items on this line to respective columns based on X coordinates
                line.items.forEach(item => {
                    const str = item.str.trim();
                    if (!str) return;

                    // Find matching column by X range
                    let matchedCol = columns.find(c => item.x >= c.xMin && item.x < c.xMax);
                    if (!matchedCol) {
                        let minDist = Infinity;
                        columns.forEach(c => {
                            const dist = Math.abs(item.x - c.xStart);
                            if (dist < minDist) {
                                minDist = dist;
                                matchedCol = c;
                            }
                        });
                    }

                    if (matchedCol && currentRow[matchedCol.name]) {
                        currentRow[matchedCol.name].push(str);
                    }
                });
            }

            if (currentRow) {
                extractedRows.push(currentRow);
            }

            // Convert extracted row cell arrays into clean, structured transaction objects
            const transactions = [];

            extractedRows.forEach(rowCells => {
                const rawColumns = {};
                columnNames.forEach(colName => {
                    // Multi-line narration stitching: join array elements with space
                    rawColumns[colName] = (rowCells[colName] || []).join(" ").replace(/\s+/g, " ").trim();
                });

                const hasContent = Object.values(rawColumns).some(val => val.length > 0);
                if (!hasContent) return;

                // 1. Date Extraction
                let dateVal = "";
                const dateKey = columnNames.find(k => /date|dt/i.test(k) && !/val/i.test(k)) || columnNames[0];
                if (rawColumns[dateKey]) {
                    const match = rawColumns[dateKey].match(dateRegex);
                    if (match) dateVal = parseHeuristicDate(match[0]) || "";
                }
                if (!dateVal) {
                    for (const k of columnNames) {
                        const match = (rawColumns[k] || "").match(dateRegex);
                        if (match) {
                            dateVal = parseHeuristicDate(match[0]) || "";
                            if (dateVal) break;
                        }
                    }
                }
                if (!dateVal) dateVal = new Date().toISOString().split('T')[0];

                // 2. Multi-line Narration Extraction & Cleaning
                const narrationKey = columnNames.find(k => /narration|description|particulars|details/i.test(k)) || columnNames[1] || columnNames[0];
                let narrationVal = rawColumns[narrationKey] || "";

                // 3. Ref ID Extraction
                const refKey = columnNames.find(k => /chq|ref|cheque|txn/i.test(k));
                let refIdVal = refKey ? rawColumns[refKey] : "";
                if (!refIdVal && narrationVal) {
                    const refMatch = narrationVal.match(/(?:ref|txn|upi|imps|neft|rtgs|chq|rrn)\s*[:#.-]?\s*([A-Z0-9]{6,25})/i);
                    if (refMatch) refIdVal = refMatch[1];
                }

                // 4. Amount & Direction (Withdrawal vs Deposit vs Combined Amount)
                const withdrawalKey = columnNames.find(k => /withdrawal|debit|dr/i.test(k));
                const depositKey = columnNames.find(k => /deposit|credit|cr/i.test(k));
                const amountKey = columnNames.find(k => /amount/i.test(k));

                let amountVal = 0;
                let typeVal = "expense";

                if (withdrawalKey && rawColumns[withdrawalKey]) {
                    const clean = rawColumns[withdrawalKey].replace(/[^\d.-]/g, '');
                    const parsed = parseFloat(clean);
                    if (!isNaN(parsed) && parsed > 0) {
                        amountVal = parsed;
                        typeVal = "expense";
                    }
                }

                if (amountVal === 0 && depositKey && rawColumns[depositKey]) {
                    const clean = rawColumns[depositKey].replace(/[^\d.-]/g, '');
                    const parsed = parseFloat(clean);
                    if (!isNaN(parsed) && parsed > 0) {
                        amountVal = parsed;
                        typeVal = "income";
                    }
                }

                if (amountVal === 0 && amountKey && rawColumns[amountKey]) {
                    const rawAmtText = rawColumns[amountKey];
                    const clean = rawAmtText.replace(/[^\d.-]/g, '');
                    const parsed = parseFloat(clean);
                    if (!isNaN(parsed) && parsed !== 0) {
                        amountVal = Math.abs(parsed);
                        if (/\bcr\b/i.test(rawAmtText)) typeVal = "income";
                        else if (/\bdr\b/i.test(rawAmtText)) typeVal = "expense";
                        else typeVal = parsed < 0 ? "expense" : "income";
                    }
                }

                // Standalone "Type"/"Mode" column overrides direction when present
                const typeColKey = columnNames.find(k => /^type$/i.test(k.trim()));
                if (typeColKey && rawColumns[typeColKey]) {
                    const tVal = rawColumns[typeColKey].toLowerCase();
                    if (tVal.startsWith("cr")) typeVal = "income";
                    else if (tVal.startsWith("dr")) typeVal = "expense";
                }

                // Skip invalid rows without amount and narration
                if (amountVal === 0 && narrationVal.length < 2) return;

                transactions.push({
                    id: crypto.randomUUID(),
                    date: dateVal,
                    narration: narrationVal || "Bank Transaction",
                    merchant: narrationVal || "Bank Transaction",
                    amount: amountVal,
                    type: typeVal,
                    category: "Needs review",
                    account: "",
                    tags: [],
                    notes: "",
                    refId: refIdVal,
                    source: "pdf-import",
                    receipt: false,
                    _rawColumns: rawColumns,
                    _extractedColumns: columnNames
                });
            });

            return { transactions, columnNames };
        };

        // Fallback PDF parser for unstructured bank statements
        export const parseFallbackPDFText = (text, filename) => {
            const lines = text.split("\n").map(l => l.trim()).filter(l => l.length > 0);
            const transactions = [];

            const dateRegex = /(?:\b)(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \d{1,2}(?:\s*,\s*\d{2,4})?|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*(?:\s+\d{2,4})?)(?:\b)/i;
            const amountRegex = /(-?[₹$€£¥]?\s?\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?)\s*(cr|dr|crv|drv)?\b/i;
            const refIdRegex = /(?:ref(?:erence)?\s*(?:no\.?|id|#)?|txn\s*(?:id|no\.?)?|upi\s*ref|imps\s*ref|neft\s*ref|rtgs\s*ref|chq\s*no\.?|cheque\s*no\.?)\s*[:#]?\s*([A-Z0-9]{6,30})/i;

            const fallbackCols = ["Date", "Description", "Ref ID", "Amount"];

            for (const line of lines) {
                if (/^(page \d|statement of account|opening balance\s*$|closing balance\s*$|total\s*$)/i.test(line)) continue;

                const dateMatch = line.match(dateRegex);
                const amtMatches = [...line.matchAll(new RegExp(amountRegex, "gi"))].filter(m => {
                    const digits = m[1].replace(/[^\d]/g, '');
                    return digits.length > 0;
                });

                if (dateMatch && amtMatches.length > 0) {
                    const dateStr = dateMatch[0];
                    const amtMatch = amtMatches.length >= 2 ? amtMatches[amtMatches.length - 2] : amtMatches[0];
                    const amtStr = amtMatch[0];
                    const crDrMarker = (amtMatch[2] || "").toLowerCase();

                    let parsedDate = parseHeuristicDate(dateStr);
                    if (!parsedDate) continue;

                    const cleanAmtStr = amtMatch[1].replace(/[^\d.-]/g, '');
                    let amount = parseFloat(cleanAmtStr);
                    if (isNaN(amount) || amount === 0) continue;

                    let type;
                    if (crDrMarker.startsWith("cr")) type = "income";
                    else if (crDrMarker.startsWith("dr")) type = "expense";
                    else if (amount < 0) type = "expense";
                    else if (/\b(credited|deposit|received|refund|salary|interest paid)\b/i.test(line)) type = "income";
                    else type = "expense";

                    const refMatch = line.match(refIdRegex);
                    const refId = refMatch ? refMatch[1] : "";

                    let narration = line
                        .replace(dateStr, "")
                        .replace(amtStr, "")
                        .replace(refMatch ? refMatch[0] : "", "")
                        .replace(/[\s,|#]+/g, " ")
                        .trim();

                    narration = narration.replace(/^(debit|credit|purchase|card|pos|withdrawal|deposit)\b/i, "").trim();

                    if (narration.length > 2) {
                        transactions.push({
                            id: crypto.randomUUID(),
                            date: parsedDate,
                            narration,
                            merchant: narration,
                            amount: Math.abs(amount),
                            type,
                            category: "Needs review",
                            account: "",
                            tags: [],
                            notes: "",
                            refId,
                            source: "pdf-import",
                            receipt: false,
                            _rawColumns: {
                                "Date": dateStr,
                                "Description": narration,
                                "Ref ID": refId,
                                "Amount": amtStr
                            },
                            _extractedColumns: fallbackCols
                        });
                    }
                }
            }

            return transactions;
        };


        // --- Recurring & Subscription Detection Algorithm (Section 9) ---
