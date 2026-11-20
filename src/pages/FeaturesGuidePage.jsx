import React from 'react';
import { Icon } from '../utils.jsx';

export const FeaturesGuidePage = () => {
    const [viewMode, setViewMode] = React.useState('user'); // 'user' (End-User) | 'dev' (Developer)
    const [searchQuery, setSearchQuery] = React.useState('');
    const [expandedCards, setExpandedCards] = React.useState({});

    const toggleExpand = (id) => {
        setExpandedCards(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const expandAll = () => {
        const allIds = {};
        const source = viewMode === 'user' ? userGuideItems : devSections.flatMap(s => s.features);
        source.forEach(item => { allIds[item.id] = true; });
        setExpandedCards(allIds);
    };

    const collapseAll = () => {
        setExpandedCards({});
    };

    // ==========================================
    // SECTION A: END-USER GUIDE (Plain English / Practical Scenarios)
    // ==========================================
    const userGuideItems = [
        {
            id: 'dashboard-tick',
            icon: '✅',
            title: 'Ticking Bills on the Dashboard & Auto-Merging Statements',
            category: 'Smart Workflow',
            oneLiner: 'Pay a bill early? Tick it on your dashboard, and when you upload your bank statement at month-end, the app merges them without duplicating.',
            howToUse: 'On your Dashboard under "Upcoming Bills", click the checkmark next to any scheduled bill (like your WiFi or Rent). The app records it as paid right away.',
            whatHappensNext: 'When you import your bank statement at the end of the month, the app spots that you already ticked this payment. Instead of creating a duplicate second entry, it updates the temporary entry with the exact settled rupee amount from your bank and keeps your original notes and tags intact!',
            proTip: 'You never have to worry about whether to record a payment now or wait for the bank statement. Record it now; the statement handles the rest seamlessly.'
        },
        {
            id: 'card-payment-pairing',
            icon: '💳',
            title: 'Paying Your Credit Card Won\'t Double-Count Your Expenses',
            category: 'Smart Accounting',
            oneLiner: 'When money leaves your bank account to pay your card bill, the app knows it\'s a transfer—not a brand new expense.',
            howToUse: 'Simply upload both your Savings Account statement and your Credit Card statement whenever you receive them.',
            whatHappensNext: 'The app connects the ₹25,000 leaving your bank account with the ₹25,000 arriving on your credit card. It marks them as a "Neutral Transfer". Your expenses stay accurate based on what you actually bought on the card, without artificially doubling your monthly spend.',
            proTip: 'Even if the dates differ by up to 7 days (e.g. you paid on Friday and the bank settled on Tuesday), the app pairs them automatically.'
        },
        {
            id: 'needs-review-inbox',
            icon: '🔍',
            title: 'The "Needs Review" Inbox: Teach the App Once, Remembered Forever',
            category: 'Categorization',
            oneLiner: 'The app never secretly guesses where your money went. Any unknown payee goes to your Review tab where you decide once.',
            howToUse: 'Click the "Review" tab in the left sidebar whenever the red notification badge appears.',
            whatHappensNext: 'All transactions for that merchant (even if there are 20 of them across several months) are grouped together. Click the Category popup, pick the right category, and click "Apply". All 20 transactions update in one click, and every future statement from that merchant will categorize automatically!',
            proTip: 'Check the "Add a rule" box before clicking Apply if you want to inspect or customize the rule later on the Rules page.'
        },
        {
            id: 'password-statement',
            icon: '🔒',
            title: 'Password-Protected Bank Statements Handled Safely',
            category: 'Statement Ingestion',
            oneLiner: 'Upload your encrypted PDF statement and type your password. If you make a typo, it safely stops without scrambling your data.',
            howToUse: 'Click "Import" $\\to$ select your statement PDF. If the PDF has a password, a prompt appears asking for your statement password.',
            whatHappensNext: 'The app unlocks the statement completely inside your browser. If the password is wrong, it alerts you immediately and halts—nothing is extracted or imported until you provide the correct password.',
            proTip: 'The modal shows helpful bank password hints (e.g., HDFC: First 4 letters UPPERCASE + DOB DDMM; SBI Bank: DOB DDMMYY + mobile last 5; SBI Card: DOB DDMMYYYY + card last 4; ICICI: First 4 letters lowercase + DOB DDMM).'
        },
        {
            id: 'statement-review-experience',
            icon: '📄',
            title: 'Visual Statement Audit & Review with Neutral Transfers',
            category: 'Statement Ingestion',
            oneLiner: 'Review extracted bank and credit card statement transactions in a clean, natural table view with 2-tier categories and neutral transfer support.',
            howToUse: 'Upload any statement $\\to$ the review screen opens with spacious columns matching your main Transactions page.',
            whatHappensNext: 'Click on any category to change it via the visual picker, adjust amounts or narrations, and set transactions to Neutral (transfers/investments) with a quick [+] / [-] sign toggle before importing.',
            proTip: 'Selecting a Transfer category automatically switches the row to Neutral with the correct sign, while audit totals recalculate live in the top summary banner.'
        },
        {
            id: 'privacy-mode-hide',
            icon: '🙈',
            title: 'Instant Privacy Mode (Hide Numbers from Peeking Eyes)',
            category: 'Privacy',
            oneLiner: 'Working in a café, office, or with family around? Press the Eye icon to turn all financial figures into ₹•••••• instantly.',
            howToUse: 'Click the Eye icon in the top header (or bottom navigation on phones).',
            whatHappensNext: 'Every balance, monthly total, chart number, and transaction row immediately turns into masked dots. You can comfortably organize categories, add tags, and review rules without anyone seeing your net worth or balances.',
            proTip: 'Toggle the eye back anytime you want to reveal the numbers again.'
        },
        {
            id: 'envelope-budgeting',
            icon: '📁',
            title: 'Flexible Envelope Budgeting: Main Categories, Subcategories, or Tags',
            category: 'Budgeting',
            oneLiner: 'Set a broad budget for "Food & Drinks" as a whole, drill down into just "Fastfood", or budget for an entire trip using a tag like #vacation.',
            howToUse: 'Go to the "Budgets" tab $\\to$ click "Create Budget". Choose whether you want an Entire Main Category, a Specific Subcategory, or a Tag.',
            whatHappensNext: 'If you choose "Food & Drinks", any transaction for breakfast, lunch, dinner, Swiggy, or groceries counts against that budget. The progress bar turns green, yellow, or red with real-time alerts if you exceed your limit.',
            proTip: 'You can have both! Set a broad ₹30,000 monthly envelope for "Food & Drinks" AND a strict ₹4,000 sub-envelope for "Fastfood 🍔" simultaneously.'
        },
        {
            id: 'auto-networth',
            icon: '📈',
            title: 'Automatic Net Worth Updates: Statements Update Your Balance Sheet',
            category: 'Net Worth',
            oneLiner: 'No need to type your bank balances manually. Uploading your statement automatically syncs your Net Worth ledger.',
            howToUse: 'Head to "Net Worth" to see all your assets (bank accounts, mutual funds, gold, property) and liabilities (loans, cards).',
            whatHappensNext: 'Whenever you import your monthly bank statement, the app reads the closing balance from your bank and automatically updates that account\'s balance in your Net Worth overview.',
            proTip: 'Your Net Worth overview calculates your overall wealth, asset-to-debt ratio, and month-over-month growth automatically.'
        },
        {
            id: 'sneaky-charges',
            icon: '🚨',
            title: 'Catching Sneaky Bank Charges, Card Fees & Hidden GST',
            category: 'Financial Defense',
            oneLiner: 'The app hunts down debit interest, annual card charges, ATM fees, and GST that banks silently take from your accounts.',
            howToUse: 'Open the "Reports" tab and look at the "Card & Banking Costs" card.',
            whatHappensNext: 'The app automatically identifies bank service charges, IMPS fees, loan interest, and processing fees, showing you the exact total you paid to banks this year.',
            proTip: 'Compare this card between different bank accounts to see which bank is charging you the highest fees.'
        },
        {
            id: 'double-charge-alert',
            icon: '⚠️',
            title: 'Double-Charge & Price Spike Alerts',
            category: 'Fraud Protection',
            oneLiner: 'Accidentally swiped your card twice at a restaurant? The app alerts you immediately if the exact same amount was charged twice in 24 hours.',
            howToUse: 'Look at the "Smart Financial Alerts" card at the top of your Dashboard or Reports page.',
            whatHappensNext: 'If a merchant bills you twice on the same day, or charges significantly more than your usual average, an alert chip appears showing the merchant name, the dates, and the amounts.',
            proTip: 'Gives you instant evidence to contact your bank or merchant to request a quick chargeback or refund.'
        },
        {
            id: 'cashflow-runway',
            icon: '🔮',
            title: '30-Day Moving Cashflow Forecast: See Your Balance 30 Days Ahead',
            category: 'Forecasting',
            oneLiner: 'Will you have enough cash for rent and bills at the end of the month? The forecast graphs your bank balance for the next 30 days.',
            howToUse: 'Go to the "Reports" tab and look at the "30-Day Cashflow Forecast" chart.',
            whatHappensNext: 'It takes your current bank balance, factors in your upcoming recurring bills (SIPs, EMIs, credit card settlements), and accounts for your everyday daily spending to graph your projected balance day by day.',
            proTip: 'If your line dips close to zero, you\'ll know weeks in advance before incurring an overdraft or missed payment penalty.'
        },
        {
            id: 'local-file-sync',
            icon: '💾',
            title: 'Save Directly to a File on Your Computer (Zero Cloud Dependency)',
            category: 'Data Ownership',
            oneLiner: 'Prefer keeping your data locally on your computer? Connect a local JSON file once and every change writes straight to your hard drive.',
            howToUse: 'Go to Settings $\\to$ "Local File Synchronization" $\\to$ select or create a file (e.g. `financials-data.json`) on your hard drive.',
            whatHappensNext: 'Every time you add a transaction, update a category, or set a budget, the app writes directly to that file in real time. You own your data 100% on your own machine.',
            proTip: 'You can save this file into your personal iCloud, Dropbox, or Google Drive folder for automatic encrypted syncing across your devices!'
        },
        {
            id: 'emergency-recovery-kit',
            icon: '🗝️',
            title: 'Emergency Recovery Kit: Never Get Locked Out of Your Account',
            category: 'Account Safety',
            oneLiner: 'Download your sealed recovery kit file once. If you ever forget your password, this file is your master key to restore access.',
            howToUse: 'Go to Settings $\\to$ Security $\\to$ click "Download Recovery Kit". Save the `financials-recovery-kit.json` file in a safe place.',
            whatHappensNext: 'Because the app uses zero-knowledge encryption, no one (not even customer support) can reset your password. If you forget your password, upload this file to unlock and restore all your data in seconds.',
            proTip: 'Store a copy of this recovery file on a USB thumb drive or in your password manager vault.'
        },
        {
            id: 'no-date-drift',
            icon: '📅',
            title: 'No Date Drift on End-of-Month Bills',
            category: 'Smart Scheduling',
            oneLiner: 'Scheduled a bill for the 31st? In February it reminds you on the 28th, but next month it jumps right back to March 31st automatically.',
            howToUse: 'When setting up recurring bills (in the "Recurring" tab), set the due date to the actual billing day (e.g. 31st).',
            whatHappensNext: 'Most apps permanently drift to the 28th forever after February. Financials anchors to the true day: in 30-day months it bills on the 30th, in February on the 28th, and in 31-day months it returns to the 31st.',
            proTip: 'Works for daily, weekly, bi-weekly, monthly, quarterly, and annual commitments.'
        },
        {
            id: 'rules-automation',
            icon: '⚡',
            title: 'Automate Everything with Rules: Teach the App Your Preferences',
            category: 'Automation',
            oneLiner: 'Create rules like "Whenever description contains Uber, tag it #travel and set category to Transportation".',
            howToUse: 'Go to the "Rules" tab $\\to$ click "Create Rule". Choose conditions (narration, amount range, account) and actions (set category, add tags).',
            whatHappensNext: 'The rule runs automatically on every future statement you import. Best of all: if you ever delete or change a rule, you can revert all transactions it touched without corrupting your manual edits!',
            proTip: 'The app protects categories you set by hand: rules will never overwrite your manual decisions unless you explicitly tell them to.'
        },
        {
            id: 'column-header-filters',
            icon: '📊',
            title: 'Table Column Header Filters: Instant Multi-Criteria Search',
            category: 'Transactions',
            oneLiner: 'Click any column header on the Transactions page to filter by categories, accounts, descriptions, or amounts on the fly.',
            howToUse: 'On the Transactions page, click directly on column names like "Category", "Account", or "Description". A quick filter popover opens.',
            whatHappensNext: 'The Category popover features full search and group selection with checkboxes for multi-category filtering. Active filtered columns light up in bold primary color with a one-click "Clear filter" button.',
            proTip: 'The sort arrows next to the column names still work independently so you can filter and sort in any combination.'
        },
        {
            id: 'rules-link-recurring',
            icon: '🔗',
            title: 'Auto-Link Recurring Bills with Rules',
            category: 'Automation',
            oneLiner: 'Create rules that automatically tie bank statement transactions to your scheduled recurring bills.',
            howToUse: 'In the Rules page, select the new action "Link to recurring payment" and choose your recurring item (e.g., "Home Rent" or "Gym Membership").',
            whatHappensNext: 'Whenever a statement row matches your rule condition, it is automatically mapped to that recurring bill, appends the bill name in brackets (e.g. "UPI-LANDLORD (Home Rent)"), and marks the bill paid on your calendar. If you revert the rule, the link and bracketed text are cleanly undone!',
            proTip: 'Deduplication completely ignores the bracketed text, so your future statements will never be flagged as duplicates.'
        },
        {
            id: 'same-price-bill-mapping',
            icon: '🎯',
            title: 'Smart Bill Mapping: Same-Price Suggestions & Custom Date Pickers',
            category: 'Smart Workflow',
            oneLiner: 'Paid a bill on a different day? The Mark Paid modal spots transactions with the exact same amount for 1-click linking.',
            howToUse: 'Click the checkmark on any upcoming bill. If you paid it on a different day, the modal surfaces all unmapped transactions with matching amounts.',
            whatHappensNext: 'Select the matching transaction to link it instantly, or choose "+ Create a new transaction instead". When creating a new transaction, you can pick the exact date: Due Date, Today, or a Specific Date formatted according to your Settings preference.',
            proTip: 'If your payment was split into multiple parts, switch to "Map to Existing Transaction(s)" to select multiple transactions across the whole category whose sum matches the bill.'
        }
    ];

    // ==========================================
    // SECTION B: DEVELOPER & ENGINE MECHANICS (Under the Hood / Invariants)
    // ==========================================
    const devSections = [
        {
            id: 'dev-crypto',
            title: '1. Cryptographic Protocols & Security Invariants',
            badge: 'Zero-Knowledge',
            badgeColor: '#10B981',
            features: [
                {
                    id: 'd-aes',
                    title: 'AES-GCM-256 with 12-Byte Nonce Freshness',
                    tag: 'crypto.subtle',
                    summary: 'Client-side authenticated AES-GCM encryption with fresh IV generation on every write.',
                    details: 'Payloads are encrypted in the browser using the native Web Cryptography API. A 12-byte cryptographically secure random IV is generated for every payload. Authenticated GCM tags guarantee that any bit flip is immediately detected.'
                },
                {
                    id: 'd-pbkdf2',
                    title: 'PBKDF2 Key Derivation (100,000 SHA-256 Rounds)',
                    tag: 'PBKDF2-HMAC-SHA256',
                    summary: '100k iteration key stretching with a 16-byte random salt.',
                    details: 'Protects passwords against GPU/ASIC rainbow table attacks. Encryption keys exist strictly in volatile memory during user sessions and are never persisted to disk or transmitted over networks.'
                },
                {
                    id: 'd-gzip',
                    title: 'Pre-Cipher GZIP Binary Stream Compression',
                    tag: 'Entropy Masking',
                    summary: 'Compresses JSON before passing it to the cipher.',
                    details: 'Data is compressed using GZIP streams before AES-GCM encryption. This minimizes payload sizes and smooths out JSON structural formatting tokens, preventing ciphertext size-inference attacks.'
                },
                {
                    id: 'd-lock',
                    title: 'Constant-Time Salted Hash App Lock',
                    tag: 'Timing-Safe',
                    summary: 'Idle screen lock using salted SHA-256 hashes with constant-time verification.',
                    details: 'The lock passphrase is never stored. Inactivity is tracked across pointer, keydown, wheel, and visibilitychange events. Idle limits are configurable (1m to 60m). Verification prevents timing leakage.'
                }
            ]
        },
        {
            id: 'dev-parsing',
            title: '2. PDF Statement Extraction & Worker Invariants',
            badge: 'PDF.js & OCR',
            badgeColor: '#3B82F6',
            features: [
                {
                    id: 'd-dualpass',
                    title: 'Spatial Table Coordinate Parser + Multi-Line Block Parser',
                    tag: 'Geometry Clustering',
                    summary: 'Dual-pass extraction engine resolving spatial drops on wrapped rows.',
                    details: 'Pass 1 runs geometric column clustering (X coordinates, line heights, date boundaries, and serial number filtering). Pass 2 groups multi-line transaction blocks. A fail-safe merger merges missing rows, boosting transaction yield to 100% on complex statements.'
                },
                {
                    id: 'd-buffer',
                    title: 'ArrayBuffer Detachment Safeguards',
                    tag: 'Worker Threading',
                    summary: 'Prevents web worker memory transfers from detaching ArrayBuffers.',
                    details: 'When PDF.js web workers process ArrayBuffers, browser transfer lists detach the buffer, leaving `byteLength === 0`. The engine clones buffers via `Uint8Array.slice(0)` and preserves underlying `File` references to allow safe password retries.'
                },
                {
                    id: 'd-ai',
                    title: 'Parallel Gemini 2.0 Flash with Backoff & OCR',
                    tag: 'Vision Extractor',
                    summary: 'Parallel page processing with canvas OCR and automatic 429/503 retry.',
                    details: 'Renders pages to HTML5 canvases (2.0x scale JPEG) and processes pages in parallel batches (concurrency: 2 to 5). Implements exponential backoff on HTTP 429 and 503 errors across candidate models.'
                }
            ]
        },
        {
            id: 'dev-audit',
            title: '3. Accounting Invariants & Mathematical Ledger Audits',
            badge: 'Math Invariant',
            badgeColor: '#8B5CF6',
            features: [
                {
                    id: 'd-sanity',
                    title: 'Equation: Opening + Credits − Debits = Closing',
                    tag: 'Double-Entry Invariant',
                    summary: 'Verifies net transaction flow against printed statement balance boundaries.',
                    details: 'Sum of extracted deposits and withdrawals must reconcile with the printed opening and closing balances within ±₹1 rounding tolerance. Running balances are verified step-by-step across each consecutive row transition.'
                },
                {
                    id: 'd-gap',
                    title: 'Row Discrepancy Localization: Δ = |Bal_i - (Bal_{i-1} ± Amt_i)|',
                    tag: 'Gap Pinpointer',
                    summary: 'Calculates the exact transition index, date range, and rupee gap when rows are dropped.',
                    details: 'If consecutive running balances show an unaccounted discrepancy, the engine outputs the exact row index, date interval, and discrepancy amount in rupees.'
                },
                {
                    id: 'd-chaining',
                    title: 'Monthly Ledger Chaining (Month N Opening == Month N-1 Closing)',
                    tag: 'Chronological Audit',
                    summary: 'Verifies chronological continuity across monthly statement imports.',
                    details: 'Prevents gaps in multi-year tax ledgers by checking that consecutive statement periods connect smoothly with zero balance discrepancies.'
                }
            ]
        },
        {
            id: 'dev-heuristics',
            title: '4. Categorization Pipeline & Merchant Heuristics',
            badge: 'Heuristics',
            badgeColor: '#EC4899',
            features: [
                {
                    id: 'd-pipeline',
                    title: '4-Tier Deterministic Resolution Hierarchy',
                    tag: 'Resolution Tree',
                    summary: 'Learned History → Structural Rules → Merchant Dictionary → Needs Review.',
                    details: 'User decisions always win. Structural bank patterns (salary, EMI, bank charges) evaluate second. Built-in merchant dictionary evaluates third. Ambiguous transactions fall back safely to Needs Review.'
                },
                {
                    id: 'd-glued',
                    title: 'Glued-Word POS Extraction Regex',
                    tag: 'Token Splitting',
                    summary: 'Splits concatenated merchant strings printed on card slips.',
                    details: 'Extracts brand names from strings like `SWIGGYBANGALORE` or `ZEPTOMUMBAI` while stripping terminal city suffixes (`DELHI`, `BLR`, `MUM`, `HYD`) and card machine reference codes.'
                },
                {
                    id: 'd-tokens',
                    title: 'Token Boundary Protection: (?:^|[^a-z0-9])',
                    tag: 'Zero Collisions',
                    summary: 'Prevents substring collisions on short words.',
                    details: 'Guarantees that short keywords only match as standalone tokens. Prevents `vi` matching inside `service`, `tea` matching inside `steam`, or `ola` matching inside `cholamandalam`.'
                },
                {
                    id: 'd-disambig',
                    title: 'Contextual Disambiguation Heuristics',
                    tag: 'Disambiguation',
                    summary: 'Resolves fuel vs medical, GST remarks vs tax, and card settlements vs refunds.',
                    details: 'Fuel station identifiers (`HPCL`, `BPCL`, `IOCL`, `PETROL`, `DIESEL`) override nearby hospital names. UPI narrations with "GST" in remarks are separated from official tax portals. Non-settlement card credits are identified as refunds.'
                },
                {
                    id: 'd-rule-linking',
                    title: 'Reversible Recurring Link Actions in Rules Engine',
                    tag: 'Rule Engine Action',
                    summary: 'Deterministic linkRecurring rule action with atomic reversible state deltas.',
                    details: 'The rules engine supports `linkRecurring` actions assigning `linkedRecurringId` and appending `(Recurring Name)` in brackets to narration/merchant. Each run records an atomic delta (`link: { from, to, narrationFrom, merchantFrom, label }`) enabling clean 1-click rollbacks via `revertRuleOnTx`.'
                }
            ]
        },
        {
            id: 'dev-reconcile',
            title: '5. Cross-Account Reconciliation & Storage Architecture',
            badge: 'Deduplication',
            badgeColor: '#F59E0B',
            features: [
                {
                    id: 'd-crossmatch',
                    title: 'Card Bill Pairing (±7 Days, ±₹1 Window)',
                    tag: 'Pairing Window',
                    summary: 'Pairs neutral bank debits with card statement credits.',
                    details: 'Matches savings account payments to card statement credits within a 7-day window and ±₹1 rounding tolerance. Nearest date wins.'
                },
                {
                    id: 'd-dedupe',
                    title: '1-to-1 Fingerprinting: date|amount|type|account|refId|narration',
                    tag: 'Smart Dedupe',
                    summary: 'Distinguishes genuine identical payments from duplicate uploads.',
                    details: 'Exact matches are skipped; same-day & same-amount rows with differing narrations are flagged as Maybe Duplicates. Settled statement transactions replace estimated dashboard placeholders.'
                },
                {
                    id: 'd-csvsafe',
                    title: 'RFC 4180 Formula Injection Prevention',
                    tag: 'CSV Sanitization',
                    summary: 'Prepends single quotes to dangerous spreadsheet formula prefixes.',
                    details: 'All text fields starting with `=, +, -, @` are escaped with a leading single quote `\'` to prevent spreadsheet macro execution attacks upon export.'
                },
                {
                    id: 'd-bracket-dedupe',
                    title: 'Trailing Bracket Sanitization: stripTrailingBrackets',
                    tag: 'Deduplication Invariant',
                    summary: 'Preserves human-readable recurring labels in narration while keeping fingerprinting pure.',
                    details: 'When statement rows replace placeholders or linking rules run, recurring names are preserved in trailing brackets: `Original Narration (Recurring Name)`. All duplicate fingerprint generators, merchant normalizers, and categorizer tokenizers strip trailing brackets before hashing, ensuring 100% duplicate detection fidelity across subsequent imports.'
                },
                {
                    id: 'd-catchup-match',
                    title: 'Catch-Up Statement Matching & Score-Based Recurring Planning',
                    tag: 'Occurrence Engine',
                    summary: 'Scores and maps historical statement rows to open recurring schedule occurrences.',
                    details: 'Expands recurring cadence schedules across statement date ranges and evaluates candidate rows against open dates via learned merchant keys, token similarity, amount boundaries, and directional sign checks. High-confidence one-to-one matches are pre-accepted to catch up unmapped past months.'
                },
                {
                    id: 'd-backing-tx',
                    title: 'Backing-Transaction Verification & Self-Healing Reconciliation',
                    tag: 'Ledger Integrity',
                    summary: 'Guarantees that deleting transactions immediately restores recurring payment items.',
                    details: '`isRecurringPaidOnDate` strictly verifies that an actual backing transaction exists in the ledger before honoring a `status === \'paid\'` bill instance. Deleting a transaction via the table deletion handler or dashboard unmark automatically purges orphaned bill instances, rewinds recurring schedule cadences, and reverts amortizing loan balances.'
                }
            ]
        }
    ];

    // Filter items based on active view and search query
    const filteredUserItems = userGuideItems.filter(item => {
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        return (
            item.title.toLowerCase().includes(q) ||
            item.oneLiner.toLowerCase().includes(q) ||
            item.howToUse.toLowerCase().includes(q) ||
            item.whatHappensNext.toLowerCase().includes(q) ||
            item.category.toLowerCase().includes(q)
        );
    });

    const filteredDevSections = devSections.map(sec => {
        const matchingFeatures = sec.features.filter(f => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
                f.title.toLowerCase().includes(q) ||
                f.summary.toLowerCase().includes(q) ||
                f.details.toLowerCase().includes(q) ||
                f.tag.toLowerCase().includes(q)
            );
        });
        if (matchingFeatures.length === 0) return null;
        return { ...sec, features: matchingFeatures };
    }).filter(Boolean);

    return (
        <div style={{ maxWidth: '1200px', margin: '0 auto', paddingBottom: '60px' }}>
            {/* Hero Banner with Mode Switcher */}
            <div style={{
                background: 'linear-gradient(135deg, #1E1B4B 0%, #312E81 50%, #4338CA 100%)',
                color: '#FFFFFF',
                borderRadius: '16px',
                padding: '30px 26px',
                marginBottom: '24px',
                boxShadow: '0 10px 25px -5px rgba(67, 56, 202, 0.3)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: 'rgba(255, 255, 255, 0.15)', padding: '4px 12px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600, marginBottom: '10px' }}>
                            <span>✨ Comprehensive Feature & Rules Manual</span>
                        </div>
                        <h2 style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0 0 8px', letterSpacing: '-0.02em', color: '#FFFFFF' }}>
                            Financials Guide: User How-Tos & Developer Mechanics
                        </h2>
                        <p style={{ fontSize: '0.92rem', color: '#E0E7FF', margin: 0, maxWidth: '780px', lineHeight: 1.5 }}>
                            Explore all <strong>100+ built-in features, smart workflows, and hidden rules</strong>. Switch between the plain-English everyday user guide and the technical under-the-hood developer specification below.
                        </p>
                    </div>

                    {/* View Mode Toggle Buttons */}
                    <div style={{ display: 'flex', background: 'rgba(255, 255, 255, 0.15)', padding: '4px', borderRadius: '12px', gap: '4px' }}>
                        <button
                            type="button"
                            onClick={() => setViewMode('user')}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.84rem',
                                fontWeight: viewMode === 'user' ? 700 : 500,
                                background: viewMode === 'user' ? '#FFFFFF' : 'transparent',
                                color: viewMode === 'user' ? '#312E81' : '#FFFFFF',
                                boxShadow: viewMode === 'user' ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            👤 Everyday User Guide
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('dev')}
                            style={{
                                padding: '8px 16px',
                                borderRadius: '8px',
                                border: 'none',
                                cursor: 'pointer',
                                fontSize: '0.84rem',
                                fontWeight: viewMode === 'dev' ? 700 : 500,
                                background: viewMode === 'dev' ? '#FFFFFF' : 'transparent',
                                color: viewMode === 'dev' ? '#312E81' : '#FFFFFF',
                                boxShadow: viewMode === 'dev' ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            🛠️ Developer & Under-the-Hood
                        </button>
                    </div>
                </div>

                {/* Search Bar & Expand Controls */}
                <div style={{ marginTop: '22px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: '1 1 360px', maxWidth: '600px' }}>
                        <input
                            type="text"
                            placeholder={viewMode === 'user' ? "🔍 Search tips, features, how-tos (e.g. 'bills', 'budget', 'card', 'privacy')…" : "🔍 Search technical specs, regex, algorithms, invariants…"}
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '10px 16px',
                                fontSize: '0.88rem',
                                borderRadius: '10px',
                                border: 'none',
                                outline: 'none',
                                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.12)',
                                color: '#1F2937',
                                background: '#FFFFFF'
                            }}
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery('')}
                                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}
                            >
                                ✕
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="button"
                            className="btn btn-sm"
                            onClick={expandAll}
                            style={{ background: 'rgba(255, 255, 255, 0.18)', color: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.25)', fontSize: '0.78rem' }}
                        >
                            Expand All
                        </button>
                        <button
                            type="button"
                            className="btn btn-sm"
                            onClick={collapseAll}
                            style={{ background: 'rgba(255, 255, 255, 0.1)', color: '#FFFFFF', border: '1px solid rgba(255, 255, 255, 0.2)', fontSize: '0.78rem' }}
                        >
                            Collapse All
                        </button>
                    </div>
                </div>
            </div>

            {/* VIEW MODE 1: END-USER GUIDE */}
            {viewMode === 'user' && (
                <div>
                    <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                                👤 Everyday User How-Tos & Pro-Tips
                            </h3>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                                Practical, real-world workflows explained in simple terms.
                            </p>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            Showing {filteredUserItems.length} of {userGuideItems.length} guides
                        </span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
                        {filteredUserItems.map(item => {
                            const isExpanded = !!expandedCards[item.id];
                            return (
                                <div
                                    key={item.id}
                                    className="card"
                                    style={{
                                        padding: '20px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'space-between',
                                        border: isExpanded ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                                        boxShadow: isExpanded ? '0 6px 18px rgba(79, 70, 229, 0.08)' : 'none'
                                    }}
                                >
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                <span style={{ fontSize: '1.4rem' }}>{item.icon}</span>
                                                <h4 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                                                    {item.title}
                                                </h4>
                                            </div>
                                            <span style={{ fontSize: '0.68rem', padding: '2px 8px', borderRadius: '12px', background: 'var(--primary-light)', color: 'var(--primary)', fontWeight: 700, whiteSpace: 'nowrap' }}>
                                                {item.category}
                                            </span>
                                        </div>

                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-main)', margin: '0 0 12px', lineHeight: 1.45, fontWeight: 500 }}>
                                            {item.oneLiner}
                                        </p>

                                        {isExpanded && (
                                            <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                <div>
                                                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                        How to do it:
                                                    </span>
                                                    <p style={{ fontSize: '0.82rem', color: 'var(--text-main)', margin: '2px 0 0', lineHeight: 1.45 }}>
                                                        {item.howToUse}
                                                    </p>
                                                </div>

                                                <div>
                                                    <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                                        What happens behind the scenes:
                                                    </span>
                                                    <p style={{ fontSize: '0.82rem', color: 'var(--text-main)', margin: '2px 0 0', lineHeight: 1.45 }}>
                                                        {item.whatHappensNext}
                                                    </p>
                                                </div>

                                                <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '8px', padding: '8px 10px', color: '#1E40AF', fontSize: '0.78rem', lineHeight: 1.4 }}>
                                                    💡 <strong>Pro Tip:</strong> {item.proTip}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => toggleExpand(item.id)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            color: 'var(--primary)',
                                            cursor: 'pointer',
                                            fontSize: '0.78rem',
                                            fontWeight: 600,
                                            padding: '8px 0 0',
                                            textAlign: 'left',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            marginTop: '8px'
                                        }}
                                    >
                                        <span>{isExpanded ? '▲ Show Less' : '▼ Read How It Works & Pro Tips'}</span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* VIEW MODE 2: DEVELOPER & ENGINE MECHANICS */}
            {viewMode === 'dev' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <h3 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                                🛠️ Developer Specifications & Technical Invariants
                            </h3>
                            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                                Deep dive into cryptographic invariants, regex token boundaries, accounting equations, and worker detachment safeguards.
                            </p>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                            {filteredDevSections.reduce((s, sec) => s + sec.features.length, 0)} specifications documented
                        </span>
                    </div>

                    {filteredDevSections.map(sec => (
                        <div key={sec.id} className="section-card" style={{ padding: '22px', borderRadius: '14px', border: '1px solid var(--border-color)', background: 'var(--card-bg)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                <h4 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: 'var(--text-main)' }}>
                                    {sec.title}
                                </h4>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 9px', borderRadius: '12px', background: `${sec.badgeColor}15`, color: sec.badgeColor, border: `1px solid ${sec.badgeColor}35` }}>
                                    {sec.badge}
                                </span>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px' }}>
                                {sec.features.map(f => {
                                    const isExpanded = !!expandedCards[f.id];
                                    return (
                                        <div
                                            key={f.id}
                                            style={{
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '10px',
                                                padding: '16px',
                                                background: isExpanded ? 'rgba(99, 102, 241, 0.03)' : 'var(--bg-color)',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'space-between'
                                            }}
                                        >
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '6px' }}>
                                                    <h5 style={{ fontSize: '0.94rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                                                        {f.title}
                                                    </h5>
                                                    <code style={{ fontSize: '0.68rem', padding: '2px 6px', borderRadius: '4px', background: '#F1F5F9', color: '#475569' }}>
                                                        {f.tag}
                                                    </code>
                                                </div>

                                                <p style={{ fontSize: '0.82rem', color: 'var(--text-main)', margin: '0 0 8px', lineHeight: 1.45 }}>
                                                    {f.summary}
                                                </p>

                                                {isExpanded && (
                                                    <div style={{ borderTop: '1px dashed var(--border-color)', paddingTop: '8px', marginTop: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.45 }}>
                                                        {f.details}
                                                    </div>
                                                )}
                                            </div>

                                            <button
                                                type="button"
                                                onClick={() => toggleExpand(f.id)}
                                                style={{
                                                    background: 'none',
                                                    border: 'none',
                                                    color: 'var(--primary)',
                                                    cursor: 'pointer',
                                                    fontSize: '0.76rem',
                                                    fontWeight: 600,
                                                    padding: '6px 0 0',
                                                    textAlign: 'left',
                                                    marginTop: '6px'
                                                }}
                                            >
                                                <span>{isExpanded ? '▲ Hide Technical Details' : '▼ View Implementation Details'}</span>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
