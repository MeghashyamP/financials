import React from "react";
import { applyRules } from "./services/rulesEngine.js";
import { categorize } from "./categorizer.js";

export const DEFAULT_CATEGORIES = [
    // 1. Food & Drinks
    "Food & Drinks - Breakfast 🍳",
    "Food & Drinks - Lunch 🍱",
    "Food & Drinks - Dinner 🍽️",
    "Food & Drinks - Brunch 🥂",
    "Food & Drinks - Snacks 🥨",
    "Food & Drinks - Drinks 🥤",
    "Food & Drinks - Fastfood 🍔",
    "Food & Drinks - Alcohol 🍸",
    "Food & Drinks - Delivery 🛵",
    "Food & Drinks - Sweets 🍩",
    "Food & Drinks - Bakery 🥐",
    "Food & Drinks - Cafes 🧋",
    "Food & Drinks - Date 👩‍❤️‍👨",
    "Food & Drinks - Others ⚙️",

    // 2. Groceries
    "Groceries - Staples 🌾",
    "Groceries - Veggies 🥦",
    "Groceries - Fruits 🍎",
    "Groceries - Meat 🥩",
    "Groceries - Seafood 🦐",
    "Groceries - Dairy 🧀",
    "Groceries - Eggs 🥚",
    "Groceries - Pantry 🥫",
    "Groceries - Spices 🧂",
    "Groceries - Frozen 🧊",
    "Groceries - Others ⚙️",

    // 3. Transport
    "Transport - Fuel ⛽",
    "Transport - Charging 🔋",
    "Transport - Bus 🚌",
    "Transport - Train 🚆",
    "Transport - Metro 🚇",
    "Transport - Cab 🚕",
    "Transport - Auto 🛺",
    "Transport - Parking 🅿️",
    "Transport - Tolls 🛣️",
    "Transport - Rental 🔑",
    "Transport - Service 🔩",
    "Transport - Repairs 🛞",
    "Transport - Others ⚙️",

    // 4. Shopping
    "Shopping - Clothes 👔",
    "Shopping - Shoes 👟",
    "Shopping - Gadgets 💻",
    "Shopping - Books 📚",
    "Shopping - Games 🎮",
    "Shopping - Gifts 🎁",
    "Shopping - Beauty 💄",
    "Shopping - Jewelry 💎",
    "Shopping - Festival 🧨",
    "Shopping - Others ⚙️",

    // 5. Personal
    "Personal - Salon 💈",
    "Personal - Grooming 🪞",
    "Personal - Spa 🧖",
    "Personal - Skincare 🧴",
    "Personal - Hobbies 🎨",
    "Personal - Vices 🚬",
    "Personal - Others ⚙️",

    // 6. Utilities
    "Utilities - Electricity ⚡",
    "Utilities - Solar ☀️",
    "Utilities - Water 💧",
    "Utilities - Gas 🛢️",
    "Utilities - Internet 📡",
    "Utilities - Garbage 🗑️",
    "Utilities - TV 📺",
    "Utilities - Phone 📱",
    "Utilities - Heating ♨️",
    "Utilities - Rent 🏠",
    "Utilities - Others ⚙️",

    // 7. Subscriptions
    "Subscriptions - AI 🤖",
    "Subscriptions - Cloud ☁️",
    "Subscriptions - Video 🎞️",
    "Subscriptions - Audio 🎙️",
    "Subscriptions - Software 🧩",
    "Subscriptions - News 📰",
    "Subscriptions - Apps 📲",
    "Subscriptions - Magazines 📖",
    "Subscriptions - Courses 🎓",
    "Subscriptions - Others ⚙️",

    // 8. Health
    "Health - Doctor 👨‍⚕️",
    "Health - Hospital 🏥",
    "Health - Dentist 🦷",
    "Health - Optics 👓",
    "Health - Labs 🧪",
    "Health - Therapy 🧠",
    "Health - Pharmacy 💊",
    "Health - Others ⚙️",

    // 9. Entertainment
    "Entertainment - Movies 🍿",
    "Entertainment - Shows 🎤",
    "Entertainment - Gaming 👾",
    "Entertainment - Music 🎧",
    "Entertainment - Concerts 🎟️",
    "Entertainment - Events 🎫",
    "Entertainment - Parties 🥳",
    "Entertainment - Clubs 🪩",
    "Entertainment - Others ⚙️",

    // 10. Fitness
    "Fitness - Gym 🏋️",
    "Fitness - Sports ⚽",
    "Fitness - Yoga 🧘",
    "Fitness - Trainer 🏃",
    "Fitness - Classes 🩰",
    "Fitness - Gear 🥊",
    "Fitness - Membership 🔖",
    "Fitness - Supplements 💪",
    "Fitness - Others ⚙️",

    // 11. Home
    "Home - Maintenance 🛠️",
    "Home - Furniture 🛋️",
    "Home - Decor 🖼️",
    "Home - Repairs 🔧",
    "Home - Supplies 🧻",
    "Home - Garden 🪴",
    "Home - Storage 📦",
    "Home - Appliances 🔌",
    "Home - Upkeep 🪣",
    "Home - Others ⚙️",

    // 12. Services
    "Services - Laundry 🧺",
    "Services - Cleaning 🧹",
    "Services - Plumber 🚰",
    "Services - Electrician 💡",
    "Services - Carpenter 🪚",
    "Services - Tailor 🪡",
    "Services - Courier 📮",
    "Services - Mechanic 🧰",
    "Services - Pest 🦟",
    "Services - Security 💂",
    "Services - Driver 🧑‍✈️",
    "Services - Cook 🧑‍🍳",
    "Services - Maid 🧼",
    "Services - Locksmith 🗝️",
    "Services - Wash 🧽",
    "Services - Others ⚙️",

    // 13. Support
    "Support - Spouse 💑",
    "Support - Brother 👦",
    "Support - Sister 👧",
    "Support - Relative 👨‍👩‍👧",
    "Support - Friend 🧑‍🤝‍🧑",
    "Support - Mom 👩",
    "Support - Dad 👨",
    "Support - Others ⚙️",

    // 14. Income
    "Income - Salary 💰",
    "Income - Bonus 🏆",
    "Income - Stipend 🧑‍🎓",
    "Income - Dividend 💹",
    "Income - Interest 🏷️",
    "Income - Freelance 🧑‍💻",
    "Income - Rental 🏬",
    "Income - Royalty 🪪",
    "Income - Cashback 🔁",
    "Income - Refund 🔙",
    "Income - Gift 🧧",
    "Income - Grant 🎖️",
    "Income - Pension 👴",
    "Income - Sale 🛍️",
    "Income - Reimbursement 💼",
    "Income - Gains 🌱",
    "Income - Others ⚙️",

    // 15. Transfer
    "Transfer - Bank 🏦",
    "Transfer - Wallet 👛",
    "Transfer - Self 🔄",
    "Transfer - Forex 💱",
    "Transfer - Deposit 🔒",
    "Transfer - Settlement 🧾",
    "Transfer - Cash 🏧",
    "Transfer - Others ⚙️",

    // 16. Credit
    "Credit - BNPL 🕒",
    "Credit - Bill 💳",
    "Credit - Others ⚙️",

    // 17. EMI
    "EMI - Home 🏡",
    "EMI - Car 🚗",
    "EMI - Personal 👤",
    "EMI - Education 📘",
    "EMI - Appliance 🌀",
    "EMI - Others ⚙️",

    // 18. Kids
    "Kids - School 🏫",
    "Kids - Tuition ✏️",
    "Kids - Toys 🧸",
    "Kids - Clothes 👕",
    "Kids - Care 💗",
    "Kids - Books 🎒",
    "Kids - Snacks 🍪",
    "Kids - Nursery 👶",
    "Kids - Activities 🛝",
    "Kids - Others ⚙️",

    // 19. Pets
    "Pets - Food 🦴",
    "Pets - Vet 🩺",
    "Pets - Toys 🥎",
    "Pets - Grooming 🚿",
    "Pets - Boarding 🐈",
    "Pets - Medicine 🩹",
    "Pets - Others ⚙️",

    // 20. Travel
    "Travel - Flights 🛫",
    "Travel - Hotels 🏨",
    "Travel - Tours 🗺️",
    "Travel - Visa 🛂",
    "Travel - Activities 🎡",
    "Travel - Resorts 🏝️",
    "Travel - Camping ⛺",
    "Travel - Others ⚙️",

    // 21. Events
    "Events - Spiritual 🪔",
    "Events - Wedding 💍",
    "Events - Reunion 🤝",
    "Events - Festival 🎆",
    "Events - Others ⚙️",

    // 22. Investment
    "Investment - Funds 📈",
    "Investment - Stocks 📊",
    "Investment - Crypto 🪙",
    "Investment - Gold 🥇",
    "Investment - SGB 🏵️",
    "Investment - Bonds 📃",
    "Investment - Forex 🌍",
    "Investment - Realestate 🏗️",
    "Investment - PPF 🐖",
    "Investment - NPS 👵",
    "Investment - IPO 🚀",
    "Investment - Others ⚙️",

    // 23. Insurance
    "Insurance - Health ❤️‍🩹",
    "Insurance - Vehicle 🚘",
    "Insurance - Life 🛡️",
    "Insurance - Home 🧯",
    "Insurance - Term 🗒️",
    "Insurance - Travel ✈️",
    "Insurance - Gadgets 🎛️",
    "Insurance - Others ⚙️",

    // 24. Tax
    "Tax - Income 💸",
    "Tax - Property 🏘️",
    "Tax - GST 🧮",
    "Tax - Capital 🗃️",
    "Tax - Customs 🛃",
    "Tax - Professional 🗂️",
    "Tax - Others ⚙️",

    // 25. Hidden Charges
    "Hidden Charges - Penalty ⚠️",
    "Hidden Charges - Fine 🚨",
    "Hidden Charges - Challan 🚔",
    "Hidden Charges - Maintenance 📆",
    "Hidden Charges - Forex 💲",
    "Hidden Charges - Interest 📉",
    "Hidden Charges - Late ⌛",
    "Hidden Charges - Processing 📑",
    "Hidden Charges - Others ⚙️",

    // 26. Donation
    "Donation - Charity 🤲",
    "Donation - Tithe 🕯️",
    "Donation - NGO 🌐",
    "Donation - Help 🙏",
    "Donation - Cause 🎗️",
    "Donation - Tip 🙌",
    "Donation - Others ⚙️",

    // 27. Business
    "Business - Payroll 👷",
    "Business - Inventory 🏭",
    "Business - Marketing 📢",
    "Business - Shipping 🚚",
    "Business - Software 🖥️",
    "Business - Office 🪑",
    "Business - Legal 📎",
    "Business - Others ⚙️",

    // 28. Legal
    "Legal - Lawyer 👨‍⚖️",
    "Legal - Court 🏛️",
    "Legal - Fines 🛑",
    "Legal - Dispute ⚖️",
    "Legal - Documentation 📜",
    "Legal - Affidavit ✒️",
    "Legal - Others ⚙️",

    // 29. Misc
    "Misc - Adjust ⏱️",
    "Misc - Roundoff 🔢",
    "Misc - Others ⚙️",

    // 30. Others
    "Others - Needs Review 🔍",
    "Others - Uncategorized ❓",
    "Others - Others ⚙️"
];

// Category prediction (see src/categorizer.js): learned history → structural rules → merchant dictionary → "Needs Review".
export const predictBestCategory = (narration = "", type = "expense", availableCategories = DEFAULT_CATEGORIES, context = {}) => {
    const pool = (availableCategories && availableCategories.length > 0) ? availableCategories : DEFAULT_CATEGORIES;
    return categorize({ narration, type, pool, ...context }).category;
};

// Process imported transaction: predict category, apply user rules (rule overwrites), enforce category boundaries
// Rules are saved with enabled: 1/0, but imported or hand-edited data may use true/false.
export const isRuleEnabled = (rule) => Boolean(rule) && (rule.enabled === 1 || rule.enabled === true);

export const processImportedTransaction = (tx, rules = [], availableCategories = DEFAULT_CATEGORIES) => {
    const categoriesPool = (availableCategories && availableCategories.length > 0) ? availableCategories : DEFAULT_CATEGORIES;
    const merch = String(tx?.merchant || tx?.narration || "Unknown").trim();
    const rawType = String(tx?.type || "").toLowerCase();
    const typeVal = (rawType === "income" || rawType === "inflow") ? "income" : (rawType === "neutral" ? "neutral" : "expense");

    // 1. Initial category prediction if missing, invalid, or generic
    let categoryVal = tx?.category || "";
    const isValidCategory = categoriesPool.includes(categoryVal);
    let categorySource = tx?.categorySource || (categoryVal && isValidCategory ? "import" : "");
    let categoryConfidence = tx?.categoryConfidence;

    if (!categoryVal || !isValidCategory || categoryVal === "Needs review" || categoryVal === "Uncategorized") {
        const guess = categorize({
            narration: merch, type: typeVal, pool: categoriesPool,
            direction: tx?._direction, holder: tx?._holder, kind: tx?._statementKind
        });
        categoryVal = guess.category;
        categorySource = guess.source;
        categoryConfidence = guess.confidence;
    }

    // 2. Run the user's rules (Gmail-style: conditions → set category / add or remove tags). Rules beat the initial
    //    guess; a category the user set by hand during review is left alone.
    let working = {
        ...tx,
        narration: merch,
        merchant: merch,
        type: typeVal,
        category: categoryVal,
        categorySource,
        categoryConfidence
    };
    if (working.neutralSign === undefined) delete working.neutralSign;
    const ruled = applyRules(working, rules || [], { pool: categoriesPool });
    working = ruled.tx;
    categoryVal = working.category;
    categorySource = working.categorySource;
    categoryConfidence = working.categoryConfidence;

    // 3. Enforce category boundaries (cannot go beyond predefined + user custom categories)
    if (!categoriesPool.includes(categoryVal)) {
        const matched = categoriesPool.find(c => c.toLowerCase() === categoryVal.toLowerCase() || c.toLowerCase().includes(categoryVal.toLowerCase()));
        categoryVal = matched || categoriesPool.find(c => c.includes("Needs Review")) || "Others - Needs Review 🔍";
    }

    const result = {
        ...tx,
        narration: merch,
        merchant: merch,
        type: working.type,
        category: categoryVal,
        categorySource: categorySource || undefined,
        categoryConfidence: categoryConfidence || undefined
    };
    if (working.type === "neutral") result.neutralSign = working.neutralSign;
    else delete result.neutralSign;
    if (ruled.changed || tx?.ruleChanges) {
        result.tags = working.tags;
        if (working.ruleChanges) result.ruleChanges = working.ruleChanges;
    }
    return result;
};

export const CATEGORY_DESCRIPTIONS = {
    "Food & Drinks": "Breakfast, lunch, dinner, drinks, cafes",
    "Groceries": "Kitchen staples, veggies, fruits, pantry",
    "Transport": "Fuel, EV charging, cabs, public transit, tolls",
    "Shopping": "Apparel, gadgets, electronics, games, gifts",
    "Personal": "Haircut, salon, grooming, spa, skincare",
    "Utilities": "Electricity, solar, water, gas, wifi, rent",
    "Subscriptions": "AI, streaming, cloud, software apps",
    "Health": "Doctor, pharmacy, hospital, dentist, labs",
    "Entertainment": "Movies, gaming, concerts, outings, parties",
    "Fitness": "Gym, sports, yoga, training, gear",
    "Home": "Maintenance, furniture, decor, repairs",
    "Services": "Laundry, cleaning, plumber, electrician, help",
    "Support": "Financial support for loved ones & friends",
    "Income": "Salary, freelance, bonus, interest, refunds",
    "Transfer": "Inter-account bank, wallet & settlement transfers",
    "Credit": "Credit card & BNPL bills",
    "EMI": "Loan & mortgage repayments",
    "Kids": "School, tuition, child care, toys, books",
    "Pets": "Pet food, vet, grooming, boarding",
    "Travel": "Flights, hotels, vacations, tours",
    "Events": "Parties, weddings, reunions, celebrations",
    "Investment": "Mutual funds, stocks, crypto, gold, SGBs, SIPs",
    "Insurance": "Health, life, vehicle, home insurance",
    "Tax": "Income tax, GST, property tax",
    "Hidden Charges": "Bank fines, late fees, interest, challans",
    "Donation": "Charity, NGO, tithes, help, tips",
    "Business": "Payroll, inventory, marketing, office expenses",
    "Legal": "Lawyer, court, legal documentation, disputes",
    "Misc": "Adjustments, roundoffs",
    "Others": "Uncategorized items & items needing review"
};

// Net Worth ledger group definitions — crisp categories for Assets, Investments & Debt Liabilities
export const NET_WORTH_GROUPS = [
    // Cash & Bank Balances
    { key: "Bank Accounts", label: "Bank Accounts & Wallets", icon: "🏦", swatch: "success", kind: "balance" },
    { key: "Cash & Wallets", label: "Physical Cash", icon: "💵", swatch: "success", kind: "balance" },

    // Fixed & Physical Assets
    { key: "Fixed Assets", label: "Fixed Assets & Real Estate", icon: "🏠", swatch: "info", kind: "asset" },
    { key: "Vehicles", label: "Vehicles & Automobiles", icon: "🚗", swatch: "info", kind: "asset" },
    { key: "Gold & Metals", label: "Gold & Precious Metals", icon: "🥇", swatch: "warning", kind: "asset" },
    { key: "Other Assets", label: "Other Valuables & Assets", icon: "💎", swatch: "info", kind: "asset" },

    // Investments
    { key: "Investments", label: "General Investments", icon: "📈", swatch: "warning", kind: "investment", subKind: "market" },
    { key: "Fixed Deposits", label: "Fixed Deposits & FDs", icon: "🏦", swatch: "warning", kind: "investment", subKind: "fixed" },
    { key: "Retirement & PF", label: "Retirement & PF Corpus", icon: "👴", swatch: "warning", kind: "investment", subKind: "fixed" },
    { key: "Stocks & Equity", label: "Stocks & Equity Portfolio", icon: "📈", swatch: "warning", kind: "investment", subKind: "market" },
    { key: "Mutual Funds & SIPs", label: "Mutual Funds Portfolio", icon: "📊", swatch: "warning", kind: "investment", subKind: "market" },
    { key: "Bonds & Debt", label: "Bonds & Fixed Income", icon: "📜", swatch: "warning", kind: "investment", subKind: "fixed" },
    { key: "Crypto", label: "Crypto & Digital Assets", icon: "🪙", swatch: "warning", kind: "investment", subKind: "market" },
    { key: "Other Investments", label: "Other Investments", icon: "💼", swatch: "warning", kind: "investment", subKind: "market" },

    // Debt Liabilities
    { key: "Liabilities", label: "General Debt Owed", icon: "🏦", swatch: "danger", kind: "liability", subKind: "term" },
    { key: "Home Loan", label: "Mortgage / Home Loan Principal", icon: "🏠", swatch: "danger", kind: "liability", subKind: "term" },
    { key: "Auto & Personal Loans", label: "Personal & Auto Loans Owed", icon: "🚘", swatch: "danger", kind: "liability", subKind: "term" },
    { key: "Education Loans", label: "Education Loans Owed", icon: "🎓", swatch: "danger", kind: "liability", subKind: "term" },
    { key: "Credit Cards", label: "Credit Card Statement Owed", icon: "💳", swatch: "danger", kind: "liability", subKind: "revolving" },
    { key: "Hand Loans & Debt", label: "Hand Loans & Debts Owed", icon: "🤝", swatch: "danger", kind: "liability", subKind: "revolving" },
    { key: "Other Liabilities", label: "Other Liabilities", icon: "⚠️", swatch: "danger", kind: "liability", subKind: "term" }
];

export const NET_WORTH_GROUP_KEYS = NET_WORTH_GROUPS.map(g => g.key);

// Dynamic resolution of Net Worth item value (if linked to a recurring template, syncs based on syncMode)
export const getEffectiveNetWorthItemValue = (it, recurringList = [], billInstances = []) => {
    if (!it) return 0;
    // For amortizing loan principal and SIP investments, the item value represents the principal/portfolio valuation
    if (it.syncMode === "amortizing" || it.syncMode === "loan_principal" || it.syncMode === "sip" || it.syncMode === "investment_sip") {
        return Number(it.value || 0);
    }
    const isInvestment = (NET_WORTH_GROUPS.find(g => g.key === it.category) || {}).kind === "investment";
    if (isInvestment && it.syncMode !== "revolving") {
        return Number(it.value || 0);
    }
    if (it.linkedRecurringId) {
        const linkedRec = (recurringList || []).find(r => r && r.id === it.linkedRecurringId);
        if (linkedRec) {
            // Check if there is a pending logged bill instance for this recurring transaction
            const pendingInst = (billInstances || []).find(b => b && b.recurringId === linkedRec.id && b.status === 'pending');
            if (pendingInst && pendingInst.amount !== undefined && pendingInst.amount !== "") {
                return Number(pendingInst.amount);
            }
            return Number(linkedRec.estimatedAmount || linkedRec.amount || 0);
        }
    }
    return Number(it.value || 0);
};

// Compute a rough "monthly estimate" cash-flow figure for a net worth item based on its
// income/expense amount and how many times a year it recurs (mirrors the spreadsheet's
// "Monthly - 12 / Yearly - 1" + "Monthly Estimate" columns).
export const computeNetWorthMonthlyEstimate = (item) => {
    const amt = Number(item.incomeExpense || 0);
    const perYear = Number(item.frequencyPerYear || 0);
    if (!amt || !perYear) return 0;
    return (amt * perYear) / 12;
};

export const filterCategoriesByType = (categoriesList, typeFilter, categoryTypes = {}) => {
    if (!typeFilter || typeFilter === "all") return categoriesList || [];
    const incomeParents = ["Income"];
    const neutralParents = ["Transfer", "Misc", "Others"];

    return (categoriesList || []).filter(c => {
        const parent = c.includes(" - ") ? c.split(" - ")[0] : "Others";
        const customType = (categoryTypes || {})[c] || (categoryTypes || {})[parent];
        if (customType) {
            if (typeFilter === "income") return customType === "income";
            if (typeFilter === "expense") return customType === "expense";
            if (typeFilter === "neutral") return customType === "neutral";
            return true;
        }
        if (typeFilter === "income") {
            return incomeParents.includes(parent);
        }
        if (typeFilter === "expense") {
            return !incomeParents.includes(parent) && !neutralParents.includes(parent);
        }
        if (typeFilter === "neutral") {
            return neutralParents.includes(parent);
        }
        return true;
    });
};

export const getContrastTextColor = (hexColor) => {
    if (!hexColor) return '#FFFFFF';
    let hex = hexColor.replace('#', '').trim();
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length !== 6) return '#FFFFFF';
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 150) ? '#1E293B' : '#FFFFFF';
};

export const formatCategorySubIconFirst = (subStr) => {
    if (!subStr) return "";
    const emojiMatch = subStr.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|\p{Emoji}/u);
    if (!emojiMatch) return subStr;
    const emoji = emojiMatch[0];
    const textLabel = subStr.replace(emoji, "").trim();
    return `${emoji} ${textLabel}`;
};

export const renderCategoryOptions = (categoriesList, typeFilter, categoryTypes = {}) => {
    const filteredList = filterCategoriesByType(categoriesList, typeFilter, categoryTypes);
    const groups = {};
    filteredList.forEach(c => {
        const parent = c.includes(" - ") ? c.split(" - ")[0] : "Others";
        const subAndEmoji = c.includes(" - ") ? c.split(" - ")[1] : c;
        if (!groups[parent]) groups[parent] = [];
        groups[parent].push({ full: c, label: subAndEmoji });
    });
    return Object.keys(groups).map(parent => (
        <optgroup key={parent} label={parent}>
            {groups[parent].map(item => (
                <option key={item.full} value={item.full}>{item.label}</option>
            ))}
        </optgroup>
    ));
};

// --- Hook to close popups/modals on Escape key press (LIFO Stack to close only top-most modal) ---
const escapeStack = [];
export const useEscapeKey = (onClose) => {
    React.useEffect(() => {
        if (!onClose) return;

        const handleKeyDown = (e) => {
            if (e.key === "Escape" || e.key === "Esc") {
                if (escapeStack.length > 0 && escapeStack[escapeStack.length - 1] === onClose) {
                    onClose();
                }
            }
        };

        escapeStack.push(onClose);
        window.addEventListener("keydown", handleKeyDown);

        return () => {
            const idx = escapeStack.lastIndexOf(onClose);
            if (idx !== -1) {
                escapeStack.splice(idx, 1);
            }
            window.removeEventListener("keydown", handleKeyDown);
        };
    }, [onClose]);
};

// --- global currency helper utilities ---
// "Hide amounts" (privacy mode): every currency figure in the app goes through formatCurrencyVal, so masking here
// covers every page. The flag is module-level and set by the App before it renders.
let privacyMasked = false;
export const setPrivacyMasked = (on) => { privacyMasked = !!on; };
export const isPrivacyMasked = () => privacyMasked;
// Mask money written inside plain sentences (statement checks, alert details); dates are left alone.
export const maskNumbersInText = (text) => {
    if (!privacyMasked) return text;
    return String(text).replace(/\d[\d,]*(?:\.\d+)?/g, (m, off, str) => {
        const prev = str[off - 1] || "";
        const next = str[off + m.length] || "";
        if (prev === "-" || next === "-" || /\d/.test(prev)) return m;
        return "••";
    });
};

export const formatCurrencyVal = (val, currencyCode = "INR") => {
    if (privacyMasked) return `${getCurrencySymbol(currencyCode)} ••••`;
    const localeMap = {
        INR: "en-IN",
        USD: "en-US",
        EUR: "en-IE",
        GBP: "en-GB",
        JPY: "ja-JP",
        CAD: "en-CA",
        AUD: "en-AU"
    };
    const locale = localeMap[currencyCode] || "en-US";
    return new Intl.NumberFormat(locale, { style: 'currency', currency: currencyCode }).format(val);
};

export const getCurrencySymbol = (currencyCode = "INR") => {
    const symbols = {
        INR: "₹",
        USD: "$",
        EUR: "€",
        GBP: "£",
        JPY: "¥",
        CAD: "$",
        AUD: "$"
    };
    return symbols[currencyCode] || "₹";
};

// --- inline SVG icon components to avoid external SVG dependencies ---
export const Icon = ({ name, currency = "INR", className = "" }) => {
    const getTransactionsIcon = (curr) => {
        switch (curr) {
            case "EUR":
                return (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 10h12" />
                        <path d="M6 14H4" />
                        <path d="M6 6H4" />
                        <path d="M12 6a4.3 4.3 0 1 1 0 12" />
                    </svg>
                );
            case "GBP":
                return (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 7c0-5.333-8-5.333-8 0" />
                        <path d="M10 7v14" />
                        <path d="M6 21h12" />
                        <path d="M6 13h10" />
                    </svg>
                );
            case "JPY":
                return (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 9.5V21" />
                        <path d="m6 3 6 6.5L18 3" />
                        <path d="M6 15h12" />
                        <path d="M6 11h12" />
                    </svg>
                );
            case "INR":
                return (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M6 3h12" />
                        <path d="M6 8h12" />
                        <path d="m6 13 8.5 8" />
                        <path d="M6 13h3" />
                        <path d="M9 13c6.667 0 6.667-10 0-10" />
                    </svg>
                );
            case "USD":
            case "CAD":
            case "AUD":
            default:
                return (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                );
        }
    };

    const icons = {
        home: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
        ),
        transactions: getTransactionsIcon(currency),
        recurring: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
        ),
        subscriptions: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="14" x="2" y="5" rx="2" />
                <line x1="2" x2="22" y1="10" y2="10" />
            </svg>
        ),
        budgets: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
                <line x1="15" y1="3" x2="15" y2="21" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="3" y1="15" x2="21" y2="15" />
            </svg>
        ),
        goals: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <circle cx="12" cy="12" r="6" />
                <circle cx="12" cy="12" r="2" />
            </svg>
        ),
        documents: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
                <path d="M14 2v4a2 2 0 0 0 2 2h4" />
                <path d="M10 9H8M16 13H8M16 17H8" />
            </svg>
        ),
        rules: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 10h12M4 14h12M4 18h12M14 6h6M17 3v6" />
            </svg>
        ),
        features: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" />
                <path d="M6 6h10M6 10h10" />
            </svg>
        ),
        sparkles: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3L12 3z" />
            </svg>
        ),
        settings: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
        ),
        sync: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
            </svg>
        ),
        plus: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5v14" />
            </svg>
        ),
        trash: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" />
            </svg>
        ),
        download: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
            </svg>
        ),
        close: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
            </svg>
        ),
        folder: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
            </svg>
        ),
        arrowUp: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m5 12 7-7 7 7M12 5v14" />
            </svg>
        ),
        arrowDown: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m19 12-7 7-7-7M12 19V5" />
            </svg>
        ),
        check: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
            </svg>
        ),
        alert: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" x2="12" y1="8" y2="12" />
                <line x1="12" x2="12.01" y1="16" y2="16" />
            </svg>
        ),
        infoCircle: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 16v-4M12 8h.01" />
            </svg>
        ),
        edit: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
        ),
        networth: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 3v18h18" />
                <path d="m19 9-5 5-4-4-4 4" />
                <path d="M14 9h5v5" />
            </svg>
        ),
        calendar: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
        ),
        chevronLeft: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 18-6-6 6-6" />
            </svg>
        ),
        chevronRight: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 18 6-6-6-6" />
            </svg>
        ),
        chevronDown: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m6 9 6 6 6-6" />
            </svg>
        ),
        chevronUp: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m18 15-6-6-6 6" />
            </svg>
        ),
        search: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
        ),
        unlink: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m18.84 12.25 1.72-1.71a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="m5.16 11.75-1.72 1.71a5 5 0 0 0 7.07 7.07l1.72-1.71" />
                <line x1="2" y1="2" x2="22" y2="22" />
            </svg>
        ),
        link: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
        )
    };

    return (
        <span className={`inline-flex items-center justify-center ${className}`} style={{ width: '1em', height: '1em', strokeWidth: 2 }}>
            {icons[name] || icons.home}
        </span>
    );
};

// --- IndexedDB Database wrapper engine ---


export const getTodayStr = () => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const formatDate = (dateInput, formatStyle = "24/Jun/2002 Sun") => {
    if (!dateInput) return "";
    let year, month, day, date;

    if (dateInput instanceof Date) {
        date = dateInput;
        year = date.getFullYear();
        month = date.getMonth();
        day = date.getDate();
    } else if (typeof dateInput === "number") {
        date = new Date(dateInput);
        year = date.getFullYear();
        month = date.getMonth();
        day = date.getDate();
    } else {
        const str = String(dateInput).trim();
        // Match YYYY-MM-DD or YYYY/MM/DD at the start of string
        const ymdMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
        if (ymdMatch) {
            year = parseInt(ymdMatch[1], 10);
            month = parseInt(ymdMatch[2], 10) - 1;
            day = parseInt(ymdMatch[3], 10);
            date = new Date(year, month, day);
        } else {
            // Match DD-MM-YYYY or DD/MM/YYYY (e.g. "20/08/2026", "05-08-2026")
            const dmyMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
            if (dmyMatch) {
                let p1 = parseInt(dmyMatch[1], 10);
                let p2 = parseInt(dmyMatch[2], 10);
                let p3 = parseInt(dmyMatch[3], 10);
                if (p3 < 100) p3 += 2000;

                if (p1 > 12 && p2 <= 12) {
                    day = p1; month = p2 - 1; year = p3;
                } else if (p2 > 12 && p1 <= 12) {
                    month = p1 - 1; day = p2; year = p3;
                } else {
                    day = p1; month = p2 - 1; year = p3;
                }
                date = new Date(year, month, day);
            } else {
                date = new Date(str);
                if (!isNaN(date.getTime())) {
                    year = date.getFullYear();
                    month = date.getMonth();
                    day = date.getDate();
                }
            }
        }
    }

    if (!date || isNaN(date.getTime())) return String(dateInput);

    const monthsShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const weekdaysShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    const d = String(day).padStart(2, '0');
    const m = String(month + 1).padStart(2, '0');
    const mmm = monthsShort[month];
    const yyyy = year;
    const yy = String(yyyy).slice(-2);
    const ddd = weekdaysShort[date.getDay()];

    switch (formatStyle) {
        case "24/Jun/2002 Sun":
            return `${d}/${mmm}/${yyyy} ${ddd}`;
        case "MM/DD/YY":
            return `${m}/${d}/${yy}`;
        case "DD/MM/YYYY":
            return `${d}/${m}/${yyyy}`;
        case "YYYY-MM-DD":
            return `${yyyy}-${m}-${d}`;
        case "MM/DD/YYYY":
            return `${m}/${d}/${yyyy}`;
        case "DD-MM-YYYY":
            return `${d}-${m}-${yyyy}`;
        case "MMM DD, YYYY":
            return `${mmm} ${d}, ${yyyy}`;
        default:
            return `${d}/${mmm}/${yyyy} ${ddd}`;
    }
};

// "2026-08" → "Aug 2026" (or "08/2026", "2026-08", … following the chosen date format)
export const formatMonthYear = (ym, formatStyle = "24/Jun/2002 Sun") => {
    const m = String(ym || "").match(/^(\d{4})-(\d{2})$/);
    if (!m) return String(ym || "");
    const year = m[1];
    const mm = m[2];
    const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mmm = names[Number(mm) - 1] || mm;
    switch (formatStyle) {
        case "MM/DD/YY": return `${mm}/${year.slice(-2)}`;
        case "DD/MM/YYYY":
        case "MM/DD/YYYY": return `${mm}/${year}`;
        case "YYYY-MM-DD": return `${year}-${mm}`;
        case "DD-MM-YYYY": return `${mm}-${year}`;
        default: return `${mmm} ${year}`;
    }
};

// Show every ISO date (2026-10-18) and month (2026-10) inside a sentence in the user's chosen date format.
// Used for messages built in plain JS modules (statement checks, alerts) that only know ISO dates.
export const localizeDatesInText = (text, formatStyle = "24/Jun/2002 Sun") => {
    if (text === null || text === undefined) return text;
    return String(text)
        .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (m) => formatDate(m, formatStyle))
        .replace(/\b(\d{4})-(\d{2})\b(?!-)/g, (m) => formatMonthYear(m, formatStyle));
};

export const formatDateTime = (dateInput, formatStyle = "24/Jun/2002 Sun") => {
    if (!dateInput) return "—";
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return String(dateInput);

    const dateStr = formatDate(dateInput, formatStyle);
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    hours = hours ? hours : 12;
    const strHours = String(hours).padStart(2, '0');

    return `${dateStr} · ${strHours}:${minutes} ${ampm}`;
};

/**
 * Format a Date object into an ISO 8601 string adjusted to a given timezone with exact offset.
 * Example for Asia/Calcutta: "2026-11-14T15:58:30.123+05:30"
 */
export const getISOStringInTimezone = (dateInput = new Date(), timezone = "Asia/Calcutta") => {
    try {
        const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
        if (isNaN(d.getTime())) return new Date().toISOString();

        const tz = timezone || "Asia/Calcutta";
        const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: tz,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false
        });
        const parts = formatter.formatToParts(d);
        const map = {};
        for (const p of parts) map[p.type] = p.value;
        const ms = String(d.getMilliseconds()).padStart(3, "0");

        // Calculate offset in target timezone
        const utcDate = new Date(d.toLocaleString("en-US", { timeZone: "UTC" }));
        const tzDate = new Date(d.toLocaleString("en-US", { timeZone: tz }));
        const diffMinutes = Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
        const sign = diffMinutes >= 0 ? "+" : "-";
        const absDiff = Math.abs(diffMinutes);
        const offHours = String(Math.floor(absDiff / 60)).padStart(2, "0");
        const offMinutes = String(absDiff % 60).padStart(2, "0");
        const offsetStr = `${sign}${offHours}:${offMinutes}`;

        let hour = map.hour === "24" ? "00" : map.hour;
        return `${map.year}-${map.month}-${map.day}T${hour}:${map.minute}:${map.second}.${ms}${offsetStr}`;
    } catch (e) {
        return (dateInput instanceof Date ? dateInput : new Date()).toISOString();
    }
};

// Reusable date field: shows date in settings.dateFormat, opens native date picker on click/focus
export const DatePickerField = ({ value, onChange, dateFormat, className = "form-control", style = {}, label, required }) => {
    const displayText = value ? formatDate(value, dateFormat) : "";
    const containerRef = React.useRef(null);
    const handleClick = () => {
        const inputEl = containerRef.current && containerRef.current.querySelector('input[type="date"]');
        if (inputEl) {
            try { if (inputEl.showPicker) inputEl.showPicker(); else inputEl.focus(); } catch (err) { }
        }
    };
    return (
        <div ref={containerRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', width: '100%' }} onClick={handleClick}>
            <div
                className={className}
                style={{
                    display: 'flex', alignItems: 'center', cursor: 'pointer',
                    userSelect: 'none', minHeight: '36px', flex: 1, width: '100%', ...style
                }}
            >
                <span style={{ fontWeight: 500, color: displayText ? 'inherit' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {displayText || (label || "Select date")}
                </span>
            </div>
            <input
                type="date"
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                required={required}
                aria-label={label || "Date"}
                style={{
                    position: 'absolute', inset: 0, width: '100%', height: '100%',
                    opacity: 0, cursor: 'pointer', zIndex: 1
                }}
            />
        </div>
    );
};

// Strip trailing bracketed content added during recurring mapping, e.g. "UPI-NAME (Recurring Item)" -> "UPI-NAME"
const stripTrailingBrackets = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/g, '').trim();

// Generates the transaction duplicate detection fingerprint
export const generateFingerprint = (t) => {
    const dateStr = String(t.date || "").trim();
    const merchantStr = stripTrailingBrackets(t.merchant || "").toLowerCase();
    const amountVal = Number(t.amount || 0).toFixed(2);
    const accountStr = String(t.account || "Imported account").trim().toLowerCase();
    // type is part of the key so a purchase and its same-day refund/reversal (same merchant + amount) are both kept
    return `${dateStr}|${merchantStr}|${amountVal}|${accountStr}|${String(t.type || "expense").toLowerCase()}`;
};

// Lowercase and trim merchant, strip terminal # plus digits, reference numbers
export const normalizeMerchantName = (merchant) => {
    if (!merchant) return "";
    let name = stripTrailingBrackets(merchant).toLowerCase();
    // Remove common payment terminal suffix codes (e.g. "Merchant Name #12345", "Merchant Name *982", "Merchant Name Ref 8943")
    name = name.replace(/#\d+/g, '');
    name = name.replace(/\*\d+/g, '');
    name = name.replace(/ref\s*\d+/g, '');
    name = name.replace(/val\s*\d+/g, '');
    name = name.replace(/[\d]{6,}/g, ''); // Remove reference numbers longer than 6 digits
    name = name.replace(/[^\w\s]/g, ' '); // Replace punctuation with space
    name = name.replace(/\s+/g, ' ').trim(); // Collapse whitespace
    return name;
};

// Filter transactions by period selector
export const filterTransactionsByPeriod = (transactions, period, customStart = "", customEnd = "") => {
    const key = (period || "all_time").toLowerCase().replace(/-/g, "_");
    if (key === "all_time" || key === "all") return transactions;

    const { pStartStr, pEndStr } = calculatePeriodDateRange(period, new Date(), customStart, customEnd);

    return transactions.filter(t => {
        if (!t.date) return false;
        return t.date >= pStartStr && t.date <= pEndStr;
    });
};


export const detectRecurringTransactions = (transactions = [], rules = [], dismissedPatterns = [], existingRecurring = []) => {
    if (!Array.isArray(transactions)) return [];
    const safeExisting = Array.isArray(existingRecurring) ? existingRecurring.filter(Boolean) : [];
    const safeDismissed = Array.isArray(dismissedPatterns) ? dismissedPatterns : [];

    // Group expenses only
    const expenses = transactions.filter(t => t && t.type === "expense");
    const groups = {};

    // Existing confirmed recurring merchant names
    const existingNormNames = safeExisting.map(r => normalizeMerchantName(r?.name || "")).filter(Boolean);

    // 1. Merchant Normalization & Candidate Grouping
    expenses.forEach(t => {
        const normMerchant = normalizeMerchantName(t.merchant);
        if (!normMerchant) return;

        if (!groups[normMerchant]) {
            groups[normMerchant] = [];
        }
        groups[normMerchant].push(t);
    });

    const suggestions = [];

    Object.keys(groups).forEach(merchantName => {
        const txList = [...groups[merchantName]].sort((a, b) => new Date(a.date) - new Date(b.date));
        if (txList.length < 2) return; // Require at least two unique occurrences

        // Skip if dismissed/ignored
        if (safeDismissed.includes(merchantName)) return;

        // Skip if already in confirmed recurring items
        if (existingNormNames.some(existing => existing === merchantName || merchantName.includes(existing) || existing.includes(merchantName))) return;

        // Calculate consecutive intervals (in days)
        const dates = txList.map(t => new Date(t.date));
        const intervals = [];
        for (let i = 1; i < dates.length; i++) {
            const diffTime = Math.abs(dates[i] - dates[i - 1]);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            intervals.push(diffDays);
        }

        // Find the dominant/average interval
        const avgInterval = intervals.reduce((s, x) => s + x, 0) / intervals.length;

        // Determine Cadence Window matching (Section 9.2)
        let cadence = null;
        if (avgInterval >= 5 && avgInterval <= 9) cadence = "weekly";
        else if (avgInterval >= 12 && avgInterval <= 17) cadence = "biweekly";
        else if (avgInterval >= 24 && avgInterval <= 40) cadence = "monthly";
        else if (avgInterval >= 75 && avgInterval <= 110) cadence = "quarterly";
        else if (avgInterval >= 330 && avgInterval <= 400) cadence = "annual";

        if (!cadence) return; // Reject if doesn't fit cadence window

        // Calculate amount variation
        const amounts = txList.map(t => Number(t.amount || 0));
        const avgAmount = amounts.reduce((s, x) => s + x, 0) / amounts.length;
        if (avgAmount <= 0) return;
        const devAmounts = amounts.map(a => Math.abs(a - avgAmount) / avgAmount);
        const maxAmountDev = Math.max(...devAmounts);

        // Max variation checks
        const subHints = ["netflix", "spotify", "hulu", "disney", "youtube", "icloud", "dropbox", "adobe", "microsoft", "amazon prime", "patreon", "membership", "studio", "gym", "openai", "chatgpt", "canva", "notion", "zoom", "slack", "github"];
        const isSubHint = subHints.some(hint => merchantName.includes(hint)) || txList.some(t => {
            const cat = (t.category || "").toLowerCase();
            const tags = Array.isArray(t.tags) ? t.tags : (typeof t.tags === "string" ? [t.tags] : []);
            return cat.includes("subscription") || tags.some(tg => String(tg).toLowerCase().includes("subscription"));
        });

        const billHints = ["mortgage", "rent", "loan", "insurance", "utility", "utilities", "electric", "water", "internet", "phone", "mobile", "daycare", "tuition", "lease", "car payment", "auto payment", "hoa", "property tax"];
        const isBillHint = billHints.some(hint => merchantName.includes(hint));

        // Deviation limit rules: Subscriptions <= 20%, other recurring <= 35%
        const allowedDev = isSubHint ? 0.20 : 0.35;
        if (maxAmountDev > allowedDev) return;

        // Section 9.5: Protection against false positives (require 3 occurrences and <=3% deviation if no hint)
        const hasHint = isSubHint || isBillHint;
        if (!hasHint) {
            if (txList.length < 3) return; // 3 occurrences minimum
            if (maxAmountDev > 0.03) return; // <= 3% amount variation
        }

        // Jitter (deviation from exact calendar cadence)
        const jitter = Math.max(...intervals.map(i => Math.abs(i - avgInterval)));

        // Confidence Calculation (Section 9.6)
        // High confidence: at least 3 occurrences, amount deviation <= 12%, interval jitter <= 5 days
        let confidence = "likely";
        if (txList.length >= 3 && maxAmountDev <= 0.12 && jitter <= 5) {
            confidence = "high";
        }

        // Calculate Next Expected Date calendar-aware (Section 9.6)
        // dates[] were parsed from "YYYY-MM-DD" as UTC midnight, so toISOString recovers the original day.
        const lastDate = dates[dates.length - 1];
        const nextDateStr = shiftDateByCadence(lastDate.toISOString().split('T')[0], cadence, 1);

        // Convert to monthly equivalents (Section 9.6)
        let monthlyEquivalent = avgAmount;
        if (cadence === "weekly") monthlyEquivalent = (avgAmount * 52) / 12;
        else if (cadence === "biweekly") monthlyEquivalent = (avgAmount * 26) / 12;
        else if (cadence === "quarterly") monthlyEquivalent = avgAmount / 3;
        else if (cadence === "annual") monthlyEquivalent = avgAmount / 12;

        const lastTx = txList[txList.length - 1] || {};

        suggestions.push({
            merchantNormalized: merchantName,
            merchantDisplay: lastTx.merchant || merchantName,
            category: lastTx.category || "Subscriptions - Others ⚙️",
            type: lastTx.type || "expense",
            cadence,
            occurrences: txList.length,
            confidence,
            averageCharge: avgAmount,
            monthlyEquivalent,
            nextDate: nextDateStr,
            isSubscription: isSubHint
        });
    });

    return suggestions;
};

export const PeriodSelectOptions = () => (
    <React.Fragment>
        <optgroup label="Past Periods">
            <option value="prev_7_days">Past 7 Days</option>
            <option value="prev_15_days">Past 15 Days</option>
            <option value="prev_month">Previous Month</option>
            <option value="prev_3_months">Previous 3 Months</option>
            <option value="prev_6_months">Previous 6 Months</option>
            <option value="prev_12_months">Previous Year</option>
        </optgroup>
        <optgroup label="Current Period">
            <option value="this_month">Current Month</option>
            <option value="this_year">Current Year</option>
        </optgroup>
        <optgroup label="Future Projections">
            <option value="next_7_days">Next 7 Days</option>
            <option value="next_15_days">Next 15 Days</option>
            <option value="next_30_days">Next 30 Days</option>
            <option value="next_month">Next Month</option>
            <option value="next_3_months">Next 3 Months</option>
            <option value="next_6_months">Next 6 Months</option>
            <option value="next_12_months">Next Year</option>
        </optgroup>
        <optgroup label="General / Custom">
            <option value="all_time">All Time</option>
            <option value="custom">Custom Date Range...</option>
        </optgroup>
    </React.Fragment>
);

export const calculatePeriodDateRange = (periodKey, refDate = new Date(), customStart = "", customEnd = "") => {
    const pad = (n) => String(n).padStart(2, '0');
    const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const today = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate());
    const year = today.getFullYear();
    const month = today.getMonth();

    let startDate, endDate;

    const key = (periodKey || "this_month").toLowerCase().replace(/-/g, "_");

    switch (key) {
        // --- Single Day ---
        case "prev_day":
        case "last_day":
        case "yesterday":
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 1);
            endDate = new Date(startDate);
            break;
        case "this_day":
        case "today":
        case "current_day":
            startDate = new Date(today);
            endDate = new Date(today);
            break;
        case "next_day":
        case "tomorrow":
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() + 1);
            endDate = new Date(startDate);
            break;

        // --- 7 Days ---
        case "prev_7_days":
        case "last_7_days":
        case "past_7_days":
        case "7_days":
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 6);
            endDate = new Date(today);
            break;
        case "this_7_days":
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 3);
            endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 3);
            break;
        case "next_7_days":
            startDate = new Date(today);
            endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 6);
            break;

        // --- Calendar Week ---
        case "prev_week":
        case "last_week": {
            const dayOfWeek = today.getDay() || 7;
            startDate = new Date(today);
            startDate.setDate(today.getDate() - dayOfWeek - 6);
            endDate = new Date(today);
            endDate.setDate(today.getDate() - dayOfWeek);
            break;
        }
        case "this_week":
        case "week": {
            const dayOfWeek = today.getDay() || 7;
            startDate = new Date(today);
            startDate.setDate(today.getDate() - dayOfWeek + 1);
            endDate = new Date(today);
            endDate.setDate(today.getDate() + (7 - dayOfWeek));
            break;
        }
        case "next_week": {
            const dayOfWeek = today.getDay() || 7;
            startDate = new Date(today);
            startDate.setDate(today.getDate() + (8 - dayOfWeek));
            endDate = new Date(today);
            endDate.setDate(today.getDate() + (14 - dayOfWeek));
            break;
        }

        // --- 15 Days ---
        case "prev_15_days":
        case "last_15_days":
        case "past_15_days":
        case "15_days":
        case "15days":
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 14);
            endDate = new Date(today);
            break;
        case "this_15_days":
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 7);
            endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 7);
            break;
        case "next_15_days":
            startDate = new Date(today);
            endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 14);
            break;

        // --- 30 Days ---
        case "prev_30_days":
        case "last_30_days":
        case "past_30_days":
        case "30_days":
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 29);
            endDate = new Date(today);
            break;
        case "this_30_days":
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 15);
            endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 14);
            break;
        case "next_30_days":
            startDate = new Date(today);
            endDate = new Date(today);
            endDate.setDate(endDate.getDate() + 29);
            break;

        // --- Month ---
        case "prev_month":
        case "last_month":
        case "previous_month":
            startDate = new Date(year, month - 1, 1);
            endDate = new Date(year, month, 0);
            break;
        case "this_month":
        case "current_month":
        case "monthly":
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month + 1, 0);
            break;
        case "next_month":
            startDate = new Date(year, month + 1, 1);
            endDate = new Date(year, month + 2, 0);
            break;

        // --- 3 Months ---
        case "prev_3_months":
        case "last_3_months":
        case "previous_3_months":
            startDate = new Date(year, month - 3, 1);
            endDate = new Date(year, month, 0);
            break;
        case "this_3_months":
        case "this_quarter":
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month + 3, 0);
            break;
        case "next_3_months":
        case "next_quarter":
            startDate = new Date(year, month + 1, 1);
            endDate = new Date(year, month + 4, 0);
            break;

        // --- 6 Months ---
        case "prev_6_months":
        case "last_6_months":
        case "previous_6_months":
            startDate = new Date(year, month - 6, 1);
            endDate = new Date(year, month, 0);
            break;
        case "this_6_months":
        case "this_half_year":
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month + 6, 0);
            break;
        case "next_6_months":
        case "next_half_year":
            startDate = new Date(year, month + 1, 1);
            endDate = new Date(year, month + 7, 0);
            break;

        // --- 12 Months / Year ---
        case "prev_12_months":
        case "last_12_months":
        case "previous_12_months":
        case "last_year":
        case "past_year":
            startDate = new Date(year - 1, 0, 1);
            endDate = new Date(year - 1, 11, 31);
            break;
        case "this_12_months":
        case "this_year":
        case "current_year":
            startDate = new Date(year, 0, 1);
            endDate = new Date(year, 11, 31);
            break;
        case "next_12_months":
        case "next_year":
            startDate = new Date(year + 1, 0, 1);
            endDate = new Date(year + 1, 11, 31);
            break;

        // --- All Time & Custom ---
        case "all_time":
        case "all":
            startDate = new Date(1970, 0, 1);
            endDate = new Date(2099, 11, 31);
            break;
        case "custom":
        case "custom_range":
            if (customStart && customEnd) {
                const sParts = customStart.split('-').map(Number);
                const eParts = customEnd.split('-').map(Number);
                startDate = new Date(sParts[0], sParts[1] - 1, sParts[2]);
                endDate = new Date(eParts[0], eParts[1] - 1, eParts[2]);
            } else {
                startDate = new Date(today);
                endDate = new Date(today);
                endDate.setDate(endDate.getDate() + 30);
            }
            break;

        default:
            startDate = new Date(year, month, 1);
            endDate = new Date(year, month + 1, 0);
            break;
    }

    return {
        pStartStr: fmt(startDate),
        pEndStr: fmt(endDate),
        displayRange: key === "all_time" || key === "all" ? "All Time" : `${fmt(startDate)} to ${fmt(endDate)}`
    };
};

// --- SUB-COMPONENT: Modern Segmented Date Filter Popover ---
export const ModernDateFilterPicker = ({ value, onChange }) => {
    const [isOpen, setIsOpen] = React.useState(false);
    const containerRef = React.useRef(null);

    React.useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const parseKey = (keyStr) => {
        const k = (keyStr || "this_month").toLowerCase().replace(/-/g, "_");
        if (k === "all_time" || k === "all") return { direction: "all", duration: "all" };
        if (k === "custom" || k === "custom_range") return { direction: "custom", duration: "custom" };

        let direction = "current";
        if (k.startsWith("last_") || k.startsWith("prev_") || k.startsWith("previous_") || k.includes("past")) {
            direction = "previous";
        } else if (k.startsWith("next_") || k.startsWith("future_")) {
            direction = "next";
        } else if (k.startsWith("this_") || k.startsWith("current_")) {
            direction = "current";
        }

        let duration = "month";
        if (k.includes("day") && !k.includes("days")) duration = "day";
        else if (k.includes("7_days") || k.includes("7days")) duration = "7_days";
        else if (k.includes("week")) duration = "week";
        else if (k.includes("15_days") || k.includes("15days")) duration = "15_days";
        else if (k.includes("30_days") || k.includes("30days")) duration = "30_days";
        else if (k.includes("3_months") || k.includes("quarter")) duration = "3_months";
        else if (k.includes("6_months") || k.includes("half_year")) duration = "6_months";
        else if (k.includes("12_months") || k.includes("year")) duration = "12_months";
        else if (k.includes("month")) duration = "month";

        return { direction, duration };
    };

    const { direction, duration } = parseKey(value);

    const getDisplayLabel = (keyStr) => {
        const { direction: dir, duration: dur } = parseKey(keyStr);
        if (dir === "all") return "All Time";
        if (dir === "custom") return "Custom Range";

        const dirLabel = dir === "previous" ? "Previous" : dir === "next" ? "Next" : "Current";
        const durLabelMap = {
            day: "Day",
            "7_days": "7 Days",
            week: "Week",
            "15_days": "15 Days",
            "30_days": "30 Days",
            month: "Month",
            "3_months": "3 Months",
            "6_months": "6 Months",
            "12_months": "Year"
        };

        return `${dirLabel} ${durLabelMap[dur] || "Month"}`;
    };

    const handleSelectCombination = (newDir, newDur) => {
        if (newDir === "all") {
            onChange("all_time");
        } else if (newDir === "custom") {
            onChange("custom");
        } else {
            const dirPrefixMap = { previous: "prev", current: "this", next: "next" };
            const prefix = dirPrefixMap[newDir] || "this";
            const targetKey = `${prefix}_${newDur}`;
            onChange(targetKey);
        }
        setIsOpen(false);
    };

    const directions = [
        { id: "previous", label: "Previous" },
        { id: "current", label: "Current" },
        { id: "next", label: "Next" },
        { id: "all", label: "All Time" },
        { id: "custom", label: "Custom" }
    ];

    const durations = [
        { id: "day", label: "Day" },
        { id: "7_days", label: "7 Days" },
        { id: "week", label: "Week" },
        { id: "15_days", label: "15 Days" },
        { id: "30_days", label: "30 Days" },
        { id: "month", label: "Month" },
        { id: "3_months", label: "3 Months" },
        { id: "6_months", label: "6 Months" },
        { id: "12_months", label: "Year" }
    ];

    return (
        <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '145px',
                    minWidth: '145px',
                    maxWidth: '145px',
                    height: '28px',
                    padding: '2px 10px',
                    fontSize: '0.81rem',
                    fontWeight: 600,
                    borderRadius: '6px',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-main)',
                    cursor: 'pointer',
                    boxShadow: 'var(--shadow-sm)',
                    whiteSpace: 'nowrap'
                }}
            >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textAlign: 'center' }}>{getDisplayLabel(value)}</span>
                <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: '4px', flexShrink: 0 }}>▼</span>
            </button>

            {/* Popover Menu */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    zIndex: 1000,
                    width: '340px',
                    padding: '14px',
                    borderRadius: '12px',
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border-color)',
                    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '14px'
                }}>
                    {/* Section 1: Scope / Direction */}
                    <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                            Period Scope
                        </div>
                        <div style={{ display: 'flex', background: 'var(--bg-color)', padding: '3px', borderRadius: '8px', gap: '2px' }}>
                            {directions.map(d => {
                                const active = direction === d.id;
                                return (
                                    <button
                                        key={d.id}
                                        type="button"
                                        onClick={() => {
                                            if (d.id === "all" || d.id === "custom") {
                                                handleSelectCombination(d.id, duration);
                                            } else {
                                                handleSelectCombination(d.id, duration === "all" || duration === "custom" ? "month" : duration);
                                            }
                                        }}
                                        style={{
                                            flex: 1,
                                            padding: '5px 4px',
                                            fontSize: '0.74rem',
                                            fontWeight: active ? 700 : 500,
                                            border: 'none',
                                            borderRadius: '6px',
                                            background: active ? 'var(--primary)' : 'transparent',
                                            color: active ? '#FFFFFF' : 'var(--text-main)',
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        {d.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Section 2: Duration / Interval */}
                    {direction !== "all" && direction !== "custom" && (
                        <div>
                            <div style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                                Duration Interval
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
                                {durations.map(durItem => {
                                    const active = duration === durItem.id;
                                    return (
                                        <button
                                            key={durItem.id}
                                            type="button"
                                            onClick={() => handleSelectCombination(direction === "all" || direction === "custom" ? "current" : direction, durItem.id)}
                                            style={{
                                                padding: '6px 8px',
                                                fontSize: '0.78rem',
                                                fontWeight: active ? 700 : 500,
                                                border: active ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                                                borderRadius: '8px',
                                                background: active ? 'rgba(99, 102, 241, 0.15)' : 'var(--bg-color)',
                                                color: active ? 'var(--primary)' : 'var(--text-main)',
                                                cursor: 'pointer',
                                                transition: 'all 0.15s ease'
                                            }}
                                        >
                                            {durItem.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// Settings that belong to this browser only and must never leave it: not in JSON
// exports, the linked local file, or the cloud copy (e.g. third-party API keys).
export const LOCAL_ONLY_SETTING_KEYS = ["geminiApiKey"];

export const stripLocalOnlySettings = (settingsObj = {}) => {
    const clean = { ...(settingsObj || {}) };
    LOCAL_ONLY_SETTING_KEYS.forEach(k => { delete clean[k]; });
    return clean;
};

// --- Calendar-safe date arithmetic (local time, no UTC drift, no month overflow) ---

export const toLocalDateStr = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Parse "YYYY-MM-DD" (or a Date) into a local-midnight Date. Returns null when invalid.
export const parseLocalDate = (value) => {
    if (value instanceof Date) {
        return isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(String(value || "").trim());
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

// Add n months (n may be negative). The result lands on anchorDay, or on the month's
// last day when the month is shorter: Jan 31 + 1 month = Feb 28, not Mar 3.
// anchorDay is 1-31 or 'last'; it defaults to the date's own day.
export const addMonthsClamped = (date, n, anchorDay) => {
    const day = anchorDay === 'last' ? 31 : (Number(anchorDay) || date.getDate());
    const y = date.getFullYear();
    const m = date.getMonth() + n;
    const maxDays = new Date(y, m + 1, 0).getDate();
    return new Date(y, m, Math.min(day, maxDays));
};

export const getAnchorDayOfMonth = (dStr) => {
    if (!dStr) return 1;
    if (typeof dStr === 'string' && dStr.includes('-')) {
        const parts = dStr.split('-');
        if (parts.length === 3) {
            const dayNum = parseInt(parts[2].substring(0, 2), 10);
            if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) return dayNum;
        }
    }
    const d = new Date(dStr);
    if (!isNaN(d.getTime())) return d.getDate();
    return 1;
};

// Day of month a recurring item is due on: its monthlyDays setting, else its start date's day.
export const getAnchorDayForRecurring = (r) => {
    if (!r) return 1;
    if (r.monthlyDays) {
        const rawMD = r.monthlyDays;
        const isLast = (typeof rawMD === 'string' && rawMD.trim().toLowerCase() === 'last') ||
            (Array.isArray(rawMD) && rawMD.length === 1 && String(rawMD[0]).toLowerCase() === 'last');
        if (isLast) return 'last';
        const parsed = Array.isArray(rawMD)
            ? parseInt(rawMD[0], 10)
            : parseInt(String(rawMD).split(',')[0].trim(), 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 31) return parsed;
    }
    const sDate = r.startDate || r.nextDate;
    return getAnchorDayOfMonth(sDate);
};

// Move a "YYYY-MM-DD" date forward (steps > 0) or back (steps < 0) by whole cadence cycles.
export const shiftDateByCadence = (dateStr, cadence, steps = 1, { anchorDay, intervalDays } = {}) => {
    const base = parseLocalDate(dateStr) || parseLocalDate(new Date());
    const addDays = (n) => {
        const d = new Date(base);
        d.setDate(d.getDate() + n);
        return d;
    };
    let out;
    switch (cadence) {
        case "daily": out = addDays(steps); break;
        case "weekly":
        case "weekly_days": out = addDays(7 * steps); break;
        case "biweekly": out = addDays(14 * steps); break;
        case "every":
        case "custom_interval": out = addDays(Math.max(1, Number(intervalDays) || 14) * steps); break;
        case "quarterly": out = addMonthsClamped(base, 3 * steps, anchorDay); break;
        case "half_yearly":
        case "semi_annual": out = addMonthsClamped(base, 6 * steps, anchorDay); break;
        case "annual":
        case "yearly":
        case "annually": out = addMonthsClamped(base, 12 * steps, anchorDay); break;
        case "monthly":
        default: out = addMonthsClamped(base, steps, anchorDay); break;
    }
    return toLocalDateStr(out);
};

// Net Worth ledger items store payments-per-year; map that to a month step.
export const netWorthMonthsPerCycle = (frequencyPerYear) =>
    frequencyPerYear >= 12 ? 1 : frequencyPerYear === 4 ? 3 : frequencyPerYear === 2 ? 6 : 12;

export const calculateNextExpectedDate = (item, refDate = new Date()) => {
    if (!item) return "";
    const toStr = (v) => typeof v === 'string' ? v : (v instanceof Date ? v.toISOString().split('T')[0] : (v ? String(v) : ''));

    // Local-time safe date→string: avoids UTC offset causing wrong date
    const localDateStr = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    };

    const sStartStr = toStr(item.startDate || item.nextDate || item.createdAt || new Date().toISOString().split('T')[0]);
    if (!sStartStr) return "";

    const today = new Date(refDate);
    today.setHours(0, 0, 0, 0);

    const sDate = new Date(sStartStr + "T00:00:00");
    if (isNaN(sDate.getTime())) return "";

    const sEndStr = toStr(item.endDate);
    const eDate = sEndStr ? new Date(sEndStr + "T23:59:59") : null;
    if (eDate && !isNaN(eDate.getTime()) && today > eDate) {
        return ""; // Expired
    }

    const cadence = item.cadence || "monthly";

    if (cadence === "once") {
        return sDate >= today ? localDateStr(sDate) : "";
    }

    if (cadence === "daily") {
        return localDateStr(today);
    }

    if (cadence === "weekly" || cadence === "weekly_days") {
        const dayMap = { "Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6 };
        const rawDays = Array.isArray(item.weeklyDays) && item.weeklyDays.length > 0
            ? item.weeklyDays
            : [Object.keys(dayMap)[sDate.getDay()] || "Mon"];
        const targetDayNums = rawDays.map(d => dayMap[d]).filter(n => n !== undefined);

        let curr = new Date(today);
        for (let i = 0; i < 7; i++) {
            if (targetDayNums.includes(curr.getDay())) {
                if (!eDate || curr <= eDate) {
                    return localDateStr(curr);
                }
            }
            curr.setDate(curr.getDate() + 1);
        }
        return localDateStr(today);
    }

    if (cadence === "monthly" || cadence === "monthly_days") {
        // Support "last" as a special monthlyDays value meaning last day of month
        const rawMonthlyDays = item.monthlyDays;
        const isLast = rawMonthlyDays && (
            (typeof rawMonthlyDays === 'string' && rawMonthlyDays.trim().toLowerCase() === 'last') ||
            (Array.isArray(rawMonthlyDays) && rawMonthlyDays.length === 1 && String(rawMonthlyDays[0]).toLowerCase() === 'last')
        );

        let targetDays = [sDate.getDate()];
        if (isLast) {
            targetDays = ['last'];
        } else if (rawMonthlyDays) {
            const parsed = typeof rawMonthlyDays === "string"
                ? rawMonthlyDays.split(",").map(x => parseInt(x.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= 31)
                : (Array.isArray(rawMonthlyDays) ? rawMonthlyDays.map(x => parseInt(x, 10)).filter(n => !isNaN(n)) : []);
            if (parsed.length > 0) targetDays = parsed;
        }

        let currYear = today.getFullYear();
        let currMonth = today.getMonth();

        for (let mOffset = 0; mOffset < 24; mOffset++) {
            const m = (currMonth + mOffset) % 12;
            const y = currYear + Math.floor((currMonth + mOffset) / 12);
            const maxDays = new Date(y, m + 1, 0).getDate();

            for (const td of targetDays) {
                const actualDay = td === 'last' ? maxDays : Math.min(Number(td), maxDays);
                const cand = new Date(y, m, actualDay, 0, 0, 0);
                if (cand >= today && cand >= sDate) {
                    if (!eDate || cand <= eDate) {
                        return localDateStr(cand);
                    }
                }
            }
        }
    }

    if (cadence === "quarterly" || cadence === "half_yearly" || cadence === "semi_annual") {
        // Step from the original start date each time so short months don't drift the due day.
        const step = cadence === "quarterly" ? 3 : 6;
        let k = 0;
        let curr = new Date(sDate);
        while (curr < today && k < 2400) {
            k++;
            curr = addMonthsClamped(sDate, k * step);
        }
        if (!eDate || curr <= eDate) return localDateStr(curr);
    }

    if (cadence === "yearly" || cadence === "annual" || cadence === "annually") {
        let curr = new Date(sDate);
        while (curr < today) {
            curr.setFullYear(curr.getFullYear() + 1);
        }
        if (!eDate || curr <= eDate) return localDateStr(curr);
    }

    if (cadence === "biweekly") {
        let curr = new Date(sDate);
        while (curr < today) {
            curr.setDate(curr.getDate() + 14);
        }
        if (!eDate || curr <= eDate) return localDateStr(curr);
    }

    if (cadence === "custom_interval" || cadence === "every") {
        const step = Math.max(1, Number(item.customIntervalDays) || 14);
        let curr = new Date(sDate);
        while (curr < today) {
            curr.setDate(curr.getDate() + step);
        }
        if (!eDate || curr <= eDate) return localDateStr(curr);
    }

    if (cadence === "custom_days" || cadence === "custom_dates") {
        if (!item.customDays) return "";
        const datesList = typeof item.customDays === "string"
            ? item.customDays.split(",").map(s => s.trim()).filter(Boolean)
            : (Array.isArray(item.customDays) ? item.customDays : []);
        const todayStr = localDateStr(today);
        const upcoming = datesList
            .map(d => toStr(d))
            .filter(dStr => dStr >= todayStr)
            .sort();
        if (upcoming.length > 0) return upcoming[0];
    }

    return toStr(item.nextDate) || localDateStr(sDate);
};


export const getOccurrencesInPeriod = (item, pStartStr, pEndStr) => {
    if (!item || !pStartStr || !pEndStr) return 0;

    const toStr = (v) => typeof v === 'string' ? v : (v instanceof Date ? v.toISOString().split('T')[0] : (v ? String(v) : ''));

    const safePStartStr = toStr(pStartStr);
    const safePEndStr = toStr(pEndStr);

    const pStart = new Date(safePStartStr + "T00:00:00");
    const pEnd = new Date(safePEndStr + "T23:59:59");
    if (isNaN(pStart.getTime()) || isNaN(pEnd.getTime()) || pEnd < pStart) return 0;

    const sStartStr = toStr(item.startDate);
    const sEndStr = toStr(item.endDate);

    const effectiveStart = sStartStr ? new Date(sStartStr + "T00:00:00") : null;
    const itemEnd = sEndStr ? new Date(sEndStr + "T23:59:59") : null;

    if (itemEnd && !isNaN(itemEnd.getTime()) && itemEnd < pStart) return 0;
    if (effectiveStart && !isNaN(effectiveStart.getTime()) && effectiveStart > pEnd) return 0;

    const cadence = item.cadence || "monthly";
    const startStr = sStartStr || toStr(item.nextDate) || safePStartStr;
    const itemStart = new Date(startStr + "T00:00:00");
    const validAnchor = !isNaN(itemStart.getTime()) ? itemStart : pStart;

    if (cadence === "once") {
        if (validAnchor >= pStart && validAnchor <= pEnd) {
            if ((!effectiveStart || validAnchor >= effectiveStart) && (!itemEnd || validAnchor <= itemEnd)) return 1;
        }
        return 0;
    }

    if (cadence === "custom" || cadence === "custom_days" || cadence === "custom_dates" || Boolean(item.customDays)) {
        if (!item.customDays) return 0;
        const datesList = typeof item.customDays === "string"
            ? item.customDays.split(",").map(s => s.trim()).filter(Boolean)
            : (Array.isArray(item.customDays) ? item.customDays : []);
        let count = 0;
        for (const dStr of datesList) {
            const d = new Date(toStr(dStr) + "T00:00:00");
            if (!isNaN(d.getTime())) {
                if (d >= pStart && d <= pEnd && (!effectiveStart || d >= effectiveStart) && (!itemEnd || d <= itemEnd)) {
                    count++;
                }
            }
        }
        return count;
    }

    let count = 0;

    if (cadence === "monthly") {
        const rawMD = item.monthlyDays;
        const isLast = rawMD && (
            (typeof rawMD === 'string' && rawMD.trim().toLowerCase() === 'last') ||
            (Array.isArray(rawMD) && rawMD.length === 1 && String(rawMD[0]).toLowerCase() === 'last')
        );
        let targetDay;
        if (isLast) {
            targetDay = 'last';
        } else if (rawMD) {
            const parsed = typeof rawMD === 'string'
                ? parseInt(rawMD.split(',')[0].trim(), 10)
                : (Array.isArray(rawMD) ? parseInt(rawMD[0], 10) : NaN);
            targetDay = !isNaN(parsed) ? parsed : validAnchor.getDate();
        } else {
            targetDay = validAnchor.getDate();
        }

        let currYear = pStart.getFullYear();
        let currMonth = pStart.getMonth();

        while (true) {
            const maxDays = new Date(currYear, currMonth + 1, 0).getDate();
            const actualDay = targetDay === 'last' ? maxDays : Math.min(Number(targetDay), maxDays);
            const occDate = new Date(currYear, currMonth, actualDay, 12, 0, 0);

            if (occDate > pEnd) break;

            if (occDate >= pStart && occDate <= pEnd && (!effectiveStart || occDate >= effectiveStart) && (!itemEnd || occDate <= itemEnd)) {
                count++;
            }

            currMonth++;
            if (currMonth > 11) {
                currMonth = 0;
                currYear++;
            }
        }
        return count;
    }

    if (cadence === "yearly" || cadence === "annual" || cadence === "annually") {
        const targetMonth = validAnchor.getMonth();
        const targetDay = validAnchor.getDate();
        let currYear = pStart.getFullYear();

        while (true) {
            const maxDays = new Date(currYear, targetMonth + 1, 0).getDate();
            const actualDay = Math.min(targetDay, maxDays);
            const occDate = new Date(currYear, targetMonth, actualDay, 12, 0, 0);

            if (occDate > pEnd) break;

            if (occDate >= pStart && occDate <= pEnd && (!effectiveStart || occDate >= effectiveStart) && (!itemEnd || occDate <= itemEnd)) {
                count++;
            }

            currYear++;
        }
        return count;
    }

    if (cadence === "quarterly" || cadence === "half_yearly" || cadence === "semi_annual") {
        // Each occurrence is anchor + k*step months (clamped), computed from the anchor
        // rather than the previous occurrence, so a 31st anchor never drifts to the 1st.
        const step = cadence === "quarterly" ? 3 : 6;
        const monthsFromAnchor = (pStart.getFullYear() - validAnchor.getFullYear()) * 12 + (pStart.getMonth() - validAnchor.getMonth());
        let k = Math.floor(monthsFromAnchor / step) - 1;
        for (let guard = 0; guard < 2400; guard++, k++) {
            const occ = addMonthsClamped(validAnchor, k * step);
            const occDate = new Date(occ.getFullYear(), occ.getMonth(), occ.getDate(), 12, 0, 0);
            if (occDate > pEnd) break;

            if (occDate >= pStart && (!effectiveStart || occDate >= effectiveStart) && (!itemEnd || occDate <= itemEnd)) {
                count++;
            }
        }
        return count;
    }

    if (cadence === "daily" || cadence === "weekly" || cadence === "biweekly" || cadence === "custom_interval") {
        let stepDays = 7;
        if (cadence === "daily") stepDays = 1;
        else if (cadence === "biweekly") stepDays = 14;
        else if (cadence === "custom_interval") stepDays = Math.max(1, Number(item.customIntervalDays) || 14);

        let curr = new Date(validAnchor.getTime());
        if (curr < pStart) {
            const diffMs = pStart.getTime() - curr.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const stepsToSkip = Math.floor(diffDays / stepDays);
            if (stepsToSkip > 0) {
                curr.setDate(curr.getDate() + (stepsToSkip * stepDays));
            }
        } else if (curr > pStart) {
            const diffMs = curr.getTime() - pStart.getTime();
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            const stepsBack = Math.ceil(diffDays / stepDays);
            curr.setDate(curr.getDate() - (stepsBack * stepDays));
        }

        while (true) {
            const occDate = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate(), 12, 0, 0);
            if (occDate > pEnd) break;

            if (occDate >= pStart && occDate <= pEnd && (!effectiveStart || occDate >= effectiveStart) && (!itemEnd || occDate <= itemEnd)) {
                count++;
            }

            curr.setDate(curr.getDate() + stepDays);
        }
        return count;
    }

    if (cadence === "weekly_days") {
        const dayMap = { "Sun": 0, "Mon": 1, "Tue": 2, "Wed": 3, "Thu": 4, "Fri": 5, "Sat": 6 };
        const rawDays = Array.isArray(item.weeklyDays) ? item.weeklyDays : (typeof item.weeklyDays === "string" ? [item.weeklyDays] : ["Mon"]);
        const targetDays = rawDays.map(d => dayMap[d]).filter(d => d !== undefined);
        let curr = new Date(pStart.getTime());
        curr.setHours(12, 0, 0, 0);

        while (curr <= pEnd) {
            if (targetDays.includes(curr.getDay())) {
                if ((!effectiveStart || curr >= effectiveStart) && (!itemEnd || curr <= itemEnd)) {
                    count++;
                }
            }
            curr.setDate(curr.getDate() + 1);
        }
        return count;
    }

    if (cadence === "monthly_days") {
        const rawStr = typeof item.monthlyDays === "string" ? item.monthlyDays : (Array.isArray(item.monthlyDays) ? item.monthlyDays.join(",") : String(item.monthlyDays || "1"));
        const days = rawStr.split(",").map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n >= 1 && n <= 31);
        if (days.length === 0) return 0;
        days.sort((a, b) => a - b);
        let currYear = pStart.getFullYear();
        let currMonth = pStart.getMonth();

        while (true) {
            const maxDaysInMonth = new Date(currYear, currMonth + 1, 0).getDate();
            let monthDone = false;
            for (const d of days) {
                const actualDay = Math.min(d, maxDaysInMonth);
                const occDate = new Date(currYear, currMonth, actualDay, 12, 0, 0);

                if (occDate > pEnd) { monthDone = true; break; }

                if (occDate >= pStart && occDate <= pEnd && (!effectiveStart || occDate >= effectiveStart) && (!itemEnd || occDate <= itemEnd)) {
                    count++;
                }
            }
            if (monthDone) break;

            currMonth++;
            if (currMonth > 11) {
                currMonth = 0;
                currYear++;
            }
        }
        return count;
    }

    // Default monthly fallback (each step computed from pStart so short months don't drift it)
    for (let k = 0; k < 2400; k++) {
        const curr = addMonthsClamped(pStart, k);
        const occDate = new Date(curr.getFullYear(), curr.getMonth(), curr.getDate(), 12, 0, 0);
        if (occDate > pEnd) break;
        if ((!effectiveStart || occDate >= effectiveStart) && (!itemEnd || occDate <= itemEnd)) {
            count++;
        }
    }
    return count;
};

export { toYYYYMMDD, isRecurringPaidOnDate, isNetWorthPaidOnDate } from './services/recurringPaid.js';
