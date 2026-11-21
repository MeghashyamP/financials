// Transaction categoriser.
//
// Priority (first hit wins):
//   1. What YOU did before — the dominant category you gave the same merchant/payee earlier (learned memory).
//   2. Structural facts about the row (GST lines, card fees, EMI interest, card-bill payments, self transfers).
//   3. A curated merchant dictionary matched on whole words (short words) or substrings (distinct brand names).
//   4. Otherwise "Others - Needs Review" — it never guesses, so wrong categories can't slip in silently.
//
// Pure module (no DOM/React) so it can be unit-tested in Node.

const NEEDS_REVIEW = 'Others - Needs Review';

// ───────────── text normalisation ─────────────

const stripTrailingBrackets = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/g, '').trim();

// Lowercased text with long reference numbers and banking noise removed; used for whole-word matching.
export const cleanNarration = (s) => String(stripTrailingBrackets(s) || '')
    .toLowerCase()
    .replace(/\(ref#[^)]*\)?/g, ' ')
    .replace(/\b\d{5,}\b/g, ' ')                                  // reference / phone numbers
    .replace(/\b(upi|imps|neft|rtgs|ach|mmt|dr|cr|ibl|ybl|axl|oksbi|okaxis|okicici|okhdfcbank|paytm|apl|axisb|unitype|yescred|fam|value dt|ref)\b/g, ' ')
    .replace(/[^a-z0-9&.' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Same text with every separator removed: lets brand names match inside glued strings such as
// "SWIGGYFOODBANGALORE" or "PZELECTRICITYMUMBAI" that card statements print.
const squash = (s) => String(stripTrailingBrackets(s) || '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Stable key for "same merchant/payee" across months (used by learned memory).
export const merchantKey = (narration) => {
    let t = String(stripTrailingBrackets(narration) || '').toLowerCase();
    // SBI/ICICI style  UPI/DR/<ref>/<PAYEE>/<BANK>/<vpa>/<note>  →  keep payee + vpa
    const parts = t.split('/');
    if (parts.length >= 5 && /^(upi|mmt|imps)/.test(parts[0])) t = `${parts[3]} ${parts[5] || ''}`;
    t = t.replace(/\(ref#[^)]*\)?/g, ' ')
        .replace(/\b(upi|imps|neft|rtgs|ach|emi|prin|int|nbr|nb)\b/g, ' ')
        .replace(/[0-9*#]+/g, ' ')
        .replace(/[^a-z@. ]+/g, ' ')
        .replace(/\s+/g, ' ').trim();
    return t.split(' ').filter((w) => w.length > 1).slice(0, 4).join(' ');
};

// ───────────── learned memory ─────────────

let memory = new Map();   // key → Map(category → count)

const isUsable = (cat) => cat && !/Needs Review|Uncategorized|^Needs review$/i.test(cat);

// Categories picked by the app itself (not by you). Only your own choices are remembered, so a wrong
// automatic guess can never teach itself back to the app.
export const AUTO_SOURCES = new Set(['merchant', 'income-rule', 'self', 'card-payment', 'remark', 'card-credit', 'unknown', 'no-category', 'import']);
export const isUserDecision = (t) => !t || !t.categorySource || !AUTO_SOURCES.has(t.categorySource);

export const buildCategoryMemory = (transactions) => {
    const m = new Map();
    for (const t of transactions || []) {
        if (!t || !isUsable(t.category) || !isUserDecision(t)) continue;
        const key = merchantKey(t.narration || t.merchant);
        if (!key || key.length < 3) continue;
        if (!m.has(key)) m.set(key, new Map());
        const inner = m.get(key);
        inner.set(t.category, (inner.get(t.category) || 0) + 1);
    }
    return m;
};

export const setCategoryMemory = (transactions) => { memory = buildCategoryMemory(transactions); };

const recall = (narration) => {
    const key = merchantKey(narration);
    const inner = key && memory.get(key);
    if (!inner) return null;
    const ranked = [...inner.entries()].sort((a, b) => b[1] - a[1]);
    const [cat, n] = ranked[0];
    const second = ranked[1] ? ranked[1][1] : 0;
    return n >= 2 * second ? cat : null;   // ambiguous history → don't guess
};

// ───────────── merchant dictionary ─────────────
// b: brand substrings matched against the squashed text (use distinctive strings, ≥ 5 chars)
// w: whole-word patterns matched against the cleaned text (short / ambiguous words)

const R = (c, b, w, extra = {}) => ({ c, b: b || [], w: (w || []).map((x) => new RegExp(`\\b(?:${x})\\b`, 'i')), ...extra });

const RULES = [
    // ── fees, taxes and card charges (exact structural patterns) ──
    R('Tax - GST', [], ['igst|cgst|sgst']),
    R('Hidden Charges - Interest', ['offusemiint', 'interestamountamortization', 'financecharge', 'interestcharged', 'interestdebit'], ['interest (on|charged|amount)']),
    R('Hidden Charges - Late', ['latepayment', 'latefee'], []),
    R('Hidden Charges - Processing', ['annualfee', 'joiningfee', 'processingfee', 'markupfee', 'smscharge', 'imps p2p'], ['annual fee|service charge|amc|atm (fee|charge)|debit card fee|processing fee']),
    R('Hidden Charges - Fine', [], ['penalty|challan|fine']),

    // ── credit-card bill settlement ──
    R('Credit - Bill', ['credclub', 'cc payment', 'ccpayment', 'bppy', 'paymentreceived', 'creditcardpayment', 'cardpayment', 'billdeskcard'], ['credit card|card payment|cred club|payment received|thank you']),

    // ── investments ──
    R('Investment - NPS', ['npstrust', 'pfrda'], ['nps']),
    R('Investment - Stocks', ['zerodha', 'indianclearingcorp', 'upstox', 'angelone', 'angelbroking', 'icicidirect', 'hdfcsec', 'kotaksecurities'], ['groww stocks|demat|broking']),
    R('Investment - Funds', ['mutualfund', 'kuvera', 'indmoney', 'coinbyzerodha', 'smallcase', 'camsonline', 'kfintech'], ['sip|mf']),
    R('Investment - Crypto', ['coinswitch', 'coindcx', 'wazirx', 'binance'], []),
    R('Investment - PPF', [], ['ppf|sukanya']),

    // ── insurance ──
    R('Insurance - Health', ['starhealth', 'maxbupa', 'carehealth', 'nivabupa', 'hdfcergo', 'healthinsurance'], []),
    R('Insurance - Vehicle', ['motorinsurance', 'twowheelerinsurance'], []),
    R('Insurance - Life', ['licofindia', 'lifeinsurance', 'maxlife', 'sbilife', 'hdfclife', 'iciciprulife', 'termplan'], ['lic']),
    R('Insurance - Others', ['insurance', 'policybazaar', 'acko', 'digitinsurance'], []),

    // ── loans / EMIs ──
    R('EMI - Personal', ['newtapfinance', 'hcrefinser', 'bajajfin', 'homecredit', 'moneyview', 'kreditbee', 'finserv', 'fullerton', 'tatacapital', 'hdbfinancial'], []),

    // ── utilities (PayZapp bills print as PZ<biller><city>) ──
    R('Utilities - Electricity', ['pzelectricity', 'bescom', 'tsspdcl', 'tgspdcl', 'apspdcl', 'tatapower', 'adanielectricity', 'electricitybill'], ['electricity|power bill']),
    R('Utilities - Water', ['pzwater', 'waterboard', 'hmwssb'], ['water bill']),
    R('Utilities - Gas', ['pzgas', 'indanegas', 'bharatgas', 'hpgas', 'mahanagargas', 'gaslpg'], ['lpg|png']),
    R('Utilities - Phone', ['myjio', 'postpaid', 'pzrecharge', 'paytmrecharge', 'airtelprepaid', 'jiorecharge', 'vodafoneidea', 'bsnl', 'mobilerecharge'], ['recharge|airtel|jio|vi postpaid']),
    R('Utilities - Internet', ['pzbroadband', 'actfibernet', 'hathway', 'excitel', 'airtelxstream', 'jiofiber', 'broadband'], ['wifi|fiber|fibre']),
    R('Utilities - TV', ['tataplay', 'dishtv', 'd2h', 'sundirect', 'pzdth'], ['dth']),
    R('Utilities - Rent', ['houserent', 'monthrent'], ['rent|rental']),

    // ── subscriptions ──
    R('Subscriptions - AI', ['openai', 'chatgpt', 'anthropic', 'claude.ai', 'midjourney', 'perplexity'], []),
    R('Subscriptions - Video', ['netflix', 'hotstar', 'primevideo', 'sonyliv', 'zee5', 'youtubepremium', 'jiocinema', 'disney'], []),
    R('Subscriptions - Audio', ['spotify', 'gaana', 'jiosaavn', 'audible'], []),
    R('Subscriptions - Cloud', ['googleone', 'icloud', 'dropbox', 'googlestorage', 'googleplay'], []),
    R('Subscriptions - Software', ['adobe', 'microsoft365', 'github', 'notion', 'canva', 'zoom'], []),
    R('Subscriptions - Apps', ['appleservices', 'apple.com/bill', 'itunes'], []),

    // ── health ──
    R('Health - Pharmacy', ['apollopharm', 'pharmacy', 'pharmeasy', 'medplus', '1mg', 'netmeds', 'drugmart', 'medicalstore', 'medicals', 'chemist', 'ameerpetdrug', 'wellness forever', 'medicare', 'pharma'], ['drug|pharma|phar|medical|medico|chemists']),
    R('Health - Optics', ['eyespecia', 'eyecare', 'opticals', 'optician', 'lenskart', 'visioncare'], ['eye|optical|optics']),
    R('Health - Dentist', ['dental', 'dentist'], []),
    R('Health - Labs', ['diagnostic', 'pathlab', 'thyrocare', 'metropolis', 'lalpath', 'redcliffe'], ['lab|labs']),
    R('Health - Hospital', ['hospital', 'nursinghome', 'apollohospital', 'kimshealth', 'asianinstitute', 'nephro', 'apollo'], []),
    R('Health - Doctor', ['practo', 'clinic', 'doctor'], ['dr']),

    // ── fuel & transport ──
    R('Transport - Fuel', ['petrofil', 'petroleum', 'fillingstation', 'fuelstation', 'hpcl', 'bpcl', 'iocl', 'indianoil', 'bharatpetroleum', 'hindustanpetroleum', 'shellindia', 'nayarapetrol', 'reliancebp', 'petrolpump', 'fuels'], ['petrol|diesel|fuel|cng|shell']),
    R('Transport - Train', ['indianrailways', 'irctc', 'railway'], ['train|uts']),
    R('Transport - Cab', ['uberindia', 'olacabs', 'olamoney', 'rapido', 'namma yatri', 'nammayatri', 'bluesmart'], ['uber|ola|cab|taxi']),
    R('Transport - Tolls', ['fastag', 'nhai', 'tollplaza'], ['toll']),
    R('Transport - Parking', [], ['parking']),
    R('Transport - Metro', ['metrorail', 'hmrl', 'bmrcl'], ['metro']),
    R('Transport - Bus', ['redbus', 'tsrtc', 'apsrtc', 'ksrtc', 'abhibus'], ['bus|rtc']),
    R('Transport - Others', ['paytmtravel'], []),
    R('Transport - Service', ['bikeservice', 'carservice', 'autoservice', 'tyres'], []),

    // ── travel ──
    R('Travel - Flights', ['indigo', 'airindia', 'vistara', 'spicejet', 'akasaair', 'airasia'], ['flight']),
    R('Travel - Hotels', ['makemytrip', 'goibibo', 'agoda', 'airbnb', 'oyorooms', 'booking.com', 'treebo', 'fabhotels'], ['resort|lodge']),

    // ── food (delivery first, then eateries) ──
    R('Food & Drinks - Delivery', ['swiggy', 'zomato', 'eatsure', 'magicpin', 'faasos', 'boxeight'], []),
    R('Food & Drinks - Fastfood', ['dominos', 'mcdonald', 'mcdonalds', 'kfc', 'burgerking', 'subway', 'pizzahut', 'dunkin', 'wendys'], ['burger|pizza|momos']),
    R('Food & Drinks - Cafes', ['starbucks', 'cafecoffeeday', 'thirdwave', 'blueTokai', 'chaayos', 'chaipoint'], ['coffee|chai|tea|cafe']),
    R('Food & Drinks - Sweets', ['sweets', 'mithai', 'haldiram', 'icecream', 'baskinrobbins'], []),
    R('Food & Drinks - Bakery', ['bakery', 'bakers', 'cakes'], []),
    R('Food & Drinks - Snacks', ['chatbandar', 'chat bandar', 'chaat', 'pani puri', 'tiffin'], ['chat|snacks|samosa|bhel']),
    R('Food & Drinks - Drinks', ['juicepoint', 'juicecenter', 'fruitjuice', 'softdrink', 'lassi'], ['juice|shake|soda']),
    R('Food & Drinks - Lunch', ['restaurant', 'biryani', 'dhaba', 'canteen', 'foodquest', 'foodcourt', 'bahar', 'bhojan', 'meals', 'kitchen', 'paradise', 'foodzone'], ['hotel|food|dining|cafeteria|eatery|mess']),
    R('Food & Drinks - Alcohol', ['wines', 'liquor', 'brewery', 'beerstore', 'wineshop', 'familybar'], ['bar|pub|beer|wine']),

    // ── groceries (quick-commerce and neighbourhood stores) ──
    R('Groceries - Staples', ['blinkit', 'blinkcommerce', 'zepto', 'kiranaproducts', 'bigbasket', 'instamart', 'jiomart', 'dmart', 'avenuesupermarts', 'ratnadeep', 'moreretail', 'naturesbasket', 'spencers', 'supermarket', 'supermart', 'supermarkets', 'superma', 'kirana', 'genestore', 'generalstore', 'provision', 'ricedepot', 'nationalmart', 'dailyneeds', 'grocer', 'departmentalstore'], ['mart|kirana|vegetables|veg|milk|dairy|fruits|fruit']),

    // ── shopping ──
    R('Shopping - Clothes', ['myntra', 'ajio', 'zara', 'uniqlo', 'pantaloons', 'trends', 'lifestylestores', 'westside', 'shoppersstop', 'maxfashion', 'bewakoof', 'clothing', 'textiles', 'fashion'], []),
    R('Shopping - Shoes', ['nike', 'adidas', 'metroshoes', 'footwear'], ['bata|puma']),
    R('Shopping - Gadgets', ['reliancedigital', 'croma', 'vijaysales', 'samsung', 'oneplus', 'electronics'], []),
    R('Shopping - Beauty', ['nykaa', 'purplle', 'sephora', 'beautyparlour', 'cosmetics'], []),
    R('Shopping - Others', ['amazon', 'amzn', 'flipkart', 'meesho', 'snapdeal', 'ikea', 'decathlon', 'tatacliq', 'shopsy', 'firstcry'], []),
    R('Home - Furniture', ['pepperfry', 'urbanladder', 'furniture', 'woodenstreet'], []),

    // ── entertainment / fitness / personal ──
    R('Entertainment - Movies', ['cinepolis', 'bookmyshow', 'pvrcinema', 'pvrinox', 'inox', 'cinema', 'multiplex'], ['movie|movies']),
    R('Entertainment - Gaming', ['playstation', 'xbox', 'epicgames'], ['steam']),
    R('Fitness - Gym', ['cultfit', 'curefit', 'anytimefitness', 'goldsgym', 'fitnessfirst'], ['gym|fitness']),
    R('Personal - Salon', ['urbancompany', 'urbanclap', 'naturalssalon', 'lakme salon', 'greentrends', 'jawed'], ['salon|spa|barber|saloon']),
    R('Personal - Salon', [], ['haircut|hair cut|hair']),

    // ── services / education ──
    R('Services - Courier', ['dtdc', 'delhivery', 'bluedart', 'ecomexpress', 'shiprocket', 'logistics', 'courier'], ['courier']),
    R('Kids - School', ['schoolfee', 'public school', 'publicschool'], ['school|college|tuition|academy']),
    R('Donation - Charity', ['donation', 'charity', 'temple', 'devasthanam', 'samithi'], ['seva|ngo']),
    R('Events - Spiritual', ['pooja', 'puja', 'mandir'], []),
    R('Shopping - Others', ['asspl', 'amazonsellerservices'], []),

    // ── generic fallbacks, only after every merchant rule had its chance ──
    R('Transfer - Bank', ['ibfundstransfer', 'fundstransfer', 'banktransfer'], []),
    R('EMI - Personal', ['offusemi'], ['loan|emi|nbfc']),
    R('EMI - Others', ['achd'], []),
];

// ───────────── remark-driven rules (text typed by the payer) ─────────────

const REMARK_RULES = [
    R('Utilities - Rent', [], ['rent|house rent|monthly rent']),
    R('Investment - Others', [], ['investments?|invest']),
    R('Support - Mom', [], ['mom|mother|amma']),
    R('Support - Dad', [], ['dad|father|nanna']),
    R('Groceries - Staples', [], ['milk|rice|vegetables|veg|fruits|groceries|kirana']),
    R('Transport - Auto', [], ['auto']),
    R('Transport - Cab', [], ['cab|rapid|rapido']),
    R('Food & Drinks - Breakfast', [], ['break|breakfast']),
    R('Food & Drinks - Lunch', [], ['lunch|dinner|breakfast|food|tiffin']),
    R('Food & Drinks - Snacks', [], ['snacks|chat']),
    R('Transport - Fuel', [], ['petrol|fuel|diesel']),
];

// ───────────── income rules (credits) ─────────────

const INCOME_RULES = [
    R('Income - Salary', ['salary', 'payroll', 'wages'], ['salary|payroll']),
    R('Income - Refund', ['itdtaxrefund', 'taxrefund', 'refund', 'reversal', 'reimbursement'], ['refund|reversal|reversed|reimbursement']),
    R('Income - Interest', ['interestpaid', 'intpd', 'savingsinterest', 'interestcredit'], ['interest|int pd|int paid']),
    R('Income - Dividend', ['dividend'], []),
    R('Income - Cashback', ['cashback'], ['cashback']),
    R('Income - Rental', [], ['rent received|rental income']),
    R('Income - Freelance', ['freelance', 'upwork', 'fiverr'], []),
    R('Income - Pension', ['pension', 'epfo'], []),
];

// ───────────── engine ─────────────

const matches = (rule, text, squashed) =>
    rule.b.some((b) => squashed.includes(squash(b))) ||
    rule.w.some((re) => re.test(text));

const personNameTokens = (holder) => String(holder || '').toLowerCase()
    .replace(/\b(mr|mrs|ms|shri|smt|dr)\b\.?/g, ' ').split(/[^a-z]+/).filter((w) => w.length > 2);

// Is `narration` a transfer to/from the account holder (own account / own other bank)?
const isSelf = (text, holder) => {
    const toks = personNameTokens(holder);
    if (toks.length < 2) return false;
    return toks.filter((t) => text.includes(t)).length >= Math.min(2, toks.length);
};

/**
 * categorize({ narration, type, direction, holder, kind, pool })
 *   type:      'income' | 'expense' | 'neutral'
 *   direction: 'debit' | 'credit'   (statement direction, optional)
 *   holder:    account-holder name (optional) → own-account transfers
 *   kind:      'card' | 'bank'      (optional)
 *   pool:      list of allowed categories
 * Returns { category, confidence: 'high'|'medium'|'low', source }.
 */
export const categorize = ({ narration = '', type = 'expense', direction, holder, kind, pool }) => {
    const categories = (pool && pool.length) ? pool : [];
    const find = (label) => {
        if (!label) return null;
        const exact = categories.find((c) => c.toLowerCase().includes(label.toLowerCase()));
        if (exact) return exact;
        const parent = label.split(' - ')[0].toLowerCase();
        return categories.find((c) => c.toLowerCase().startsWith(`${parent} - others`))
            || categories.find((c) => c.toLowerCase().startsWith(`${parent} -`)) || null;
    };
    const review = () => find(NEEDS_REVIEW) || `${NEEDS_REVIEW} 🔍`;
    const done = (label, confidence, source) => {
        const category = find(label);
        return category ? { category, confidence, source } : { category: review(), confidence: 'low', source: 'no-category' };
    };

    const raw = String(narration || '');
    const text = cleanNarration(raw);
    const sq = squash(raw);
    const isCredit = direction ? direction === 'credit' : type === 'income';

    // 1. what the user has done before with this merchant
    const learned = recall(raw);
    if (learned && categories.includes(learned)) return { category: learned, confidence: 'high', source: 'history' };

    // 2. income-side hints for credits (a tax refund that names you is still a refund, not a self transfer)
    if (isCredit) {
        if (kind === 'card' && !/payment|thank you|bppy/i.test(raw) && !INCOME_RULES.some((r) => matches(r, text, sq))) {
            return done('Income - Refund', 'medium', 'card-credit');
        }
        for (const r of INCOME_RULES) if (matches(r, text, sq)) return done(r.c, 'high', 'income-rule');
        if (/\b(payment received|thank you|bppy|cc payment)\b/i.test(raw) || sq.includes('paymentreceived')) return done('Credit - Bill', 'high', 'card-payment');
    }

    // 3. own-account transfers (money you moved between your own accounts: never income or spending).
    //    The real investing happens on the outflow to the broker/fund, which has its own rule below.
    if (isSelf(text, holder)) return done('Transfer - Self', 'high', 'self');

    // 4. merchant dictionary
    for (const r of RULES) {
        if (r.c === 'Credit - Bill' && isCredit && kind !== 'card') continue;
        if (matches(r, text, sq)) return done(r.c, 'high', 'merchant');
    }

    // 5. remark typed by the payer (UPI note), only for person-to-person style narrations
    for (const r of REMARK_RULES) {
        if (matches(r, text, sq)) return done(r.c, 'medium', 'remark');
    }

    // 6. nothing reliable — flag it instead of guessing
    return { category: review(), confidence: 'low', source: 'unknown' };
};
