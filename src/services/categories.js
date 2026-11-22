/**
 * categories.js — Canonical Categories & Reconciliation Service
 *
 * Defines canonical DEFAULT_CATEGORIES and category reconciliation logic for
 * backup imports/restores, ensuring default categories remain completely fixed
 * and user-created categories are preserved.
 */

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
    "Food & Drinks - Dineout 🥘",
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

export const LOCAL_ONLY_SETTING_KEYS = ["geminiApiKey"];

export const stripLocalOnlySettings = (settingsObj = {}) => {
    const clean = { ...(settingsObj || {}) };
    LOCAL_ONLY_SETTING_KEYS.forEach(k => { delete clean[k]; });
    return clean;
};

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

/**
 * Normalizes a category string for comparison:
 * Strips emojis, variation selectors, flags, normalizes dashes, collapses whitespace,
 * and converts to lower case.
 */
export const normalizeCategoryName = (cat) => {
    if (!cat || typeof cat !== 'string') return '';
    return cat
        .replace(/\p{Extended_Pictographic}/gu, '')
        .replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '')
        .replace(/[\uFE00-\uFE0F\u200D\u20E3]/g, '')
        .replace(/[\u{1F1E6}-\u{1F1FF}]/gu, '')
        .replace(/[—–]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
};

/**
 * Reconciles backup categories:
 * 1. Default categories remain fixed and canonical (all 264 DEFAULT_CATEGORIES).
 * 2. Matches category names ignoring emojis:
 *    - If name matches any default category, assigns it to that default category.
 *    - If name does not match any default category, preserves/creates a user-created category.
 * 3. Updates all category references in transactions, rules, budgets, recurring, billInstances,
 *    and categoryTypes.
 */
export const reconcileBackupCategories = (backup) => {
    if (!backup || typeof backup !== 'object') return backup;

    // Build lookup map from canonical DEFAULT_CATEGORIES
    const defaultNormMap = new Map();
    DEFAULT_CATEGORIES.forEach(c => {
        const norm = normalizeCategoryName(c);
        if (norm) {
            defaultNormMap.set(norm, c);
        }
    });
    const defaultExactSet = new Set(DEFAULT_CATEGORIES);

    // Cache category resolution
    const categoryCache = new Map();

    const resolveCategory = (rawCat) => {
        if (!rawCat || typeof rawCat !== 'string') return rawCat;
        const trimmed = rawCat.trim();
        if (!trimmed) return rawCat;
        if (categoryCache.has(trimmed)) {
            return categoryCache.get(trimmed);
        }

        // Exact match with default category
        if (defaultExactSet.has(trimmed)) {
            categoryCache.set(trimmed, trimmed);
            return trimmed;
        }

        // Name match ignoring emoji
        const norm = normalizeCategoryName(trimmed);
        if (defaultNormMap.has(norm)) {
            const canonical = defaultNormMap.get(norm);
            categoryCache.set(trimmed, canonical);
            return canonical;
        }

        // Custom user-created category
        categoryCache.set(trimmed, trimmed);
        return trimmed;
    };

    // Collect user-created categories (unmatched names)
    const userCreatedCategories = [];
    const seenCustomNorms = new Set();

    const registerIfCustom = (rawCat) => {
        if (!rawCat || typeof rawCat !== 'string') return;
        const trimmed = rawCat.trim();
        if (!trimmed) return;
        const norm = normalizeCategoryName(trimmed);
        if (!norm) return;

        // If it matches a default category, it is NOT user-created
        if (defaultNormMap.has(norm)) return;

        if (!seenCustomNorms.has(norm)) {
            seenCustomNorms.add(norm);
            userCreatedCategories.push(trimmed);
        }
    };

    // 1. Discover custom categories from settings
    if (Array.isArray(backup.settings?.categories)) {
        backup.settings.categories.forEach(registerIfCustom);
    }
    if (Array.isArray(backup.settings?.customCategories)) {
        backup.settings.customCategories.forEach(registerIfCustom);
    }

    // 2. Discover custom categories from transactions
    if (Array.isArray(backup.transactions)) {
        backup.transactions.forEach(t => registerIfCustom(t?.category));
    }

    // 3. Discover custom categories from rules
    if (Array.isArray(backup.rules)) {
        backup.rules.forEach(r => {
            if (!r) return;
            registerIfCustom(r.thenText);
            if (Array.isArray(r.actions)) {
                r.actions.forEach(a => {
                    if (a?.type === 'setCategory') registerIfCustom(a.value);
                });
            }
            if (Array.isArray(r.conditions)) {
                r.conditions.forEach(c => {
                    if (c?.field === 'category') registerIfCustom(c.value);
                });
            }
        });
    }

    // 4. Discover custom categories from budgets, recurring, billInstances
    if (Array.isArray(backup.settings?.budgets)) {
        backup.settings.budgets.forEach(b => registerIfCustom(b?.category));
    }
    if (Array.isArray(backup.settings?.recurring)) {
        backup.settings.recurring.forEach(r => registerIfCustom(r?.category));
    }
    if (Array.isArray(backup.settings?.billInstances)) {
        backup.settings.billInstances.forEach(bi => registerIfCustom(bi?.category));
    }

    // 5. Ensure settings exists and set canonical categories + userCreatedCategories
    if (!backup.settings || typeof backup.settings !== 'object') {
        backup.settings = {};
    }
    backup.settings.categories = [...DEFAULT_CATEGORIES, ...userCreatedCategories];
    if (backup.settings.customCategories) {
        delete backup.settings.customCategories;
    }

    // 6. Remap transactions
    if (Array.isArray(backup.transactions)) {
        backup.transactions.forEach(t => {
            if (t && t.category) {
                t.category = resolveCategory(t.category);
            }
        });
    }

    // 7. Remap rules
    if (Array.isArray(backup.rules)) {
        backup.rules.forEach(r => {
            if (!r) return;
            if (r.thenText) {
                r.thenText = resolveCategory(r.thenText);
            }
            if (Array.isArray(r.actions)) {
                r.actions.forEach(a => {
                    if (a && a.type === 'setCategory' && a.value) {
                        a.value = resolveCategory(a.value);
                    }
                });
            }
            if (Array.isArray(r.conditions)) {
                r.conditions.forEach(c => {
                    if (c && c.field === 'category' && c.value) {
                        c.value = resolveCategory(c.value);
                    }
                });
            }
        });
    }

    // 8. Remap budgets
    if (Array.isArray(backup.settings.budgets)) {
        backup.settings.budgets.forEach(b => {
            if (b && b.category) {
                b.category = resolveCategory(b.category);
            }
        });
    }

    // 9. Remap recurring
    if (Array.isArray(backup.settings.recurring)) {
        backup.settings.recurring.forEach(r => {
            if (r && r.category) {
                r.category = resolveCategory(r.category);
            }
        });
    }

    // 10. Remap billInstances
    if (Array.isArray(backup.settings.billInstances)) {
        backup.settings.billInstances.forEach(bi => {
            if (bi && bi.category) {
                bi.category = resolveCategory(bi.category);
            }
        });
    }

    // 11. Remap categoryTypes keys
    if (backup.settings.categoryTypes && typeof backup.settings.categoryTypes === 'object') {
        const updatedCategoryTypes = {};
        for (const [key, val] of Object.entries(backup.settings.categoryTypes)) {
            const resolvedKey = resolveCategory(key);
            updatedCategoryTypes[resolvedKey] = val;
        }
        backup.settings.categoryTypes = updatedCategoryTypes;
    }

    return backup;
};
