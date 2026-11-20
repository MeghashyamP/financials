// Run with:  node --test src/categorizer.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { categorize, setCategoryMemory, merchantKey } from './categorizer.js';

const POOL = [
    'Food & Drinks - Delivery 🛵', 'Food & Drinks - Fastfood 🍔', 'Food & Drinks - Lunch 🍱', 'Food & Drinks - Others ⚙️',
    'Groceries - Staples 🌾', 'Groceries - Others ⚙️', 'Health - Medicines 💊', 'Health - Hospital 🏥', 'Health - Others ⚙️',
    'Transport - Fuel ⛽', 'Transport - Train 🚆', 'Transport - Others ⚙️', 'Tax - GST 📈', 'Tax - Others ⚙️',
    'Credit - Card 💳', 'Transfer - Self 🔄', 'Transfer - Bank 🏦', 'Income - Refund 🔙', 'Income - Others ⚙️',
    'Utilities - Electricity ⚡', 'Utilities - Rent 🏠', 'Utilities - Others ⚙️', 'Investment - Stocks 📊', 'Investment - Others ⚙️',
    'Shopping - Others ⚙️', 'Hidden Charges - Interest 📈', 'Hidden Charges - Processing 📑', 'Others - Needs Review 🔍'
];
const cat = (narration, extra = {}) => { setCategoryMemory([]); return categorize({ narration, pool: POOL, type: 'expense', ...extra }).category; };

test('glued card-statement merchants are recognised', () => {
    assert.match(cat('SWIGGY FOODBANGALORE'), /Delivery/);
    assert.match(cat('PZELECTRICITYMUMBAI'), /Electricity/);
    assert.match(cat('KESHAV PETROFIL PR41957HYDERABAD'), /Fuel/);
    assert.match(cat('APOLLO PHARMACIES LIMIT HYDERABAD'), /Medicines/);
});

test('fuel station is not mistaken for a hospital/health merchant', () => {
    assert.match(cat('YASHODA FILLING STATION RANGAREDDY'), /Fuel/);
});

test('short words only match as whole words (no "vi" inside "service", "tea" inside "steam")', () => {
    assert.match(cat('Service Request Charges Ltd'), /Needs Review/);
    assert.match(cat('STEAMERS PVT'), /Needs Review/);
});

test('unknown UPI payee is flagged, never silently called a transfer', () => {
    assert.match(cat('UPI-RAVI TEJA'), /Needs Review/);
});

test('UPI payee name with a recognisable word is categorised', () => {
    assert.match(cat('UPI-RAM KIRANA AND GENESTORE'), /Groceries/);
});

test('GST / EMI-interest / fee lines', () => {
    assert.match(cat('IGST-CI@18%'), /GST/);
    assert.match(cat('Interest Amount Amortization - <1/6>RELIANCE DIGITAL'), /Interest/);
    assert.match(cat('Annual fee - 2nd year'), /Processing/);
});

test('a person named in a remark that contains "GST" is not tax', () => {
    assert.match(cat('UPI-Sunil Verma-GST Money Transfer'), /Needs Review/);
});

test('card bill payments', () => {
    assert.match(cat('BPPY CC PAYMENT DP000000000001abCdE', { type: 'income', direction: 'credit', kind: 'card' }), /Credit - Card/);
    assert.match(cat('UPI-CRED Club-cred.club@ payment on CRED'), /Credit - Card/);
});

test('card credit that is not a payment is a refund', () => {
    assert.match(cat('BLINK COMMERCE PVT LTDBANGALORE', { type: 'income', direction: 'credit', kind: 'card' }), /Refund/);
});

test('tax refund that mentions your own name is a refund, own-name transfers are Self', () => {
    const holder = 'Ravi Kumar Sharma';
    assert.match(cat('NEFT Cr-ITDTAX REFUND 2026-27 RAVI KUMAR SHARMA', { type: 'income', direction: 'credit', holder }), /Refund/);
    assert.match(cat('UPI-RAVI KUMAR SHARMA-9876500001@yescred Investments', { holder }), /Transfer - Self/);
});

test('learned history beats the built-in guess, but ambiguous history does not', () => {
    setCategoryMemory([
        { narration: 'UPI-RAVI TEJA', category: 'Groceries - Staples 🌾' },
        { narration: 'UPI-RAVI TEJA', category: 'Groceries - Staples 🌾' }
    ]);
    assert.equal(categorize({ narration: 'UPI-RAVI TEJA', pool: POOL }).category, 'Groceries - Staples 🌾');
    setCategoryMemory([
        { narration: 'UPI-ZZ SHOP', category: 'Groceries - Staples 🌾' },
        { narration: 'UPI-ZZ SHOP', category: 'Shopping - Others ⚙️' }
    ]);
    assert.match(categorize({ narration: 'UPI-ZZ SHOP', pool: POOL }).category, /Needs Review/);
});

test('merchantKey is stable across months (reference numbers removed)', () => {
    assert.equal(merchantKey('UPI/DR/657931389278/SAMPLE MILK/CNRB/9876500002/milk'), merchantKey('UPI/DR/111111111111/SAMPLE MILK/CNRB/9876500002/milk'));
});

test('custom pool without a sub-category falls back to the parent "Others"', () => {
    const r = categorize({ narration: 'SWIGGY FOOD', pool: ['Food & Drinks - Others ⚙️', 'Others - Needs Review 🔍'] });
    assert.equal(r.category, 'Food & Drinks - Others ⚙️');
});
