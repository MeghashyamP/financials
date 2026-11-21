import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DEFAULT_CATEGORIES,
    normalizeCategoryName,
    reconcileBackupCategories,
    stripLocalOnlySettings,
    LOCAL_ONLY_SETTING_KEYS
} from './categories.js';
import { restoreBackup } from './backup.js';

test('normalizeCategoryName strips emojis, variation selectors, flags, and normalizes spacing & case', () => {
    assert.equal(normalizeCategoryName('Groceries - Fruits 🍎'), 'groceries - fruits');
    assert.equal(normalizeCategoryName('Groceries - Fruits 🥑'), 'groceries - fruits');
    assert.equal(normalizeCategoryName('Transport - Cab 🚕'), 'transport - cab');
    assert.equal(normalizeCategoryName('Transport - Cab'), 'transport - cab');
    assert.equal(normalizeCategoryName('Food & Drinks - Dining Out 🍽️'), 'food & drinks - dining out');
    assert.equal(normalizeCategoryName('Events - Spiritual 🪔'), 'events - spiritual');
    assert.equal(normalizeCategoryName('Country - India 🇮🇳'), 'country - india');
    assert.equal(normalizeCategoryName('Health  —  Pharmacy  💊'), 'health - pharmacy');
    assert.equal(normalizeCategoryName(''), '');
    assert.equal(normalizeCategoryName(null), '');
    assert.equal(normalizeCategoryName(undefined), '');
});

test('reconcileBackupCategories ensures default categories are canonical and fixed', () => {
    const backup = {
        settings: {
            categories: [
                // Backup only had 3 categories, one with an old emoji and one with no emoji
                'Groceries - Fruits 🥑',
                'Transport - Cab',
                'Custom - My Personal Projects 🚀'
            ]
        },
        transactions: [],
        rules: []
    };

    reconcileBackupCategories(backup);

    // All default categories must be present and canonical
    assert.equal(backup.settings.categories.length, DEFAULT_CATEGORIES.length + 1);
    DEFAULT_CATEGORIES.forEach(defaultCat => {
        assert.ok(
            backup.settings.categories.includes(defaultCat),
            `Default category "${defaultCat}" should be in reconciled categories`
        );
    });

    // Old emoji Groceries - Fruits 🥑 is mapped to canonical Groceries - Fruits 🍎
    assert.ok(backup.settings.categories.includes('Groceries - Fruits 🍎'));
    assert.ok(!backup.settings.categories.includes('Groceries - Fruits 🥑'));

    // Transport - Cab without emoji is mapped to canonical Transport - Cab 🚕
    assert.ok(backup.settings.categories.includes('Transport - Cab 🚕'));
    assert.ok(!backup.settings.categories.includes('Transport - Cab'));

    // Custom user category is preserved and added
    assert.ok(backup.settings.categories.includes('Custom - My Personal Projects 🚀'));
});

test('reconcileBackupCategories remaps category occurrences across transactions, rules, budgets, recurring and categoryTypes', () => {
    const backup = {
        settings: {
            categories: [
                'Groceries - Fruits 🥑',
                'Custom - Pet Care 🐶'
            ],
            budgets: [
                { id: 'b1', category: 'Groceries - Fruits 🥑', limit: 5000 },
                { id: 'b2', category: 'Custom - Pet Care 🐶', limit: 2000 }
            ],
            recurring: [
                { id: 'r1', name: 'Fruit Box', category: 'Groceries - Fruits 🥑', amount: 1000 },
                { id: 'r2', name: 'Vet Subscription', category: 'Custom - Pet Care 🐶', amount: 500 }
            ],
            billInstances: [
                { id: 'bi1', category: 'Groceries - Fruits 🥑', amount: 1000 }
            ],
            categoryTypes: {
                'Groceries - Fruits 🥑': 'expense',
                'Custom - Pet Care 🐶': 'expense'
            }
        },
        transactions: [
            { id: 't1', narration: 'Supermarket', amount: 250, category: 'Groceries - Fruits 🥑' },
            { id: 't2', narration: 'Uber', amount: 300, category: 'Transport - Cab' },
            { id: 't3', narration: 'Vet Clinic', amount: 800, category: 'Custom - Pet Care 🐶' }
        ],
        rules: [
            { id: 'rl1', whenText: 'fruit', thenText: 'Groceries - Fruits 🥑' },
            {
                id: 'rl2',
                actions: [{ type: 'setCategory', value: 'Transport - Cab' }],
                conditions: [{ field: 'category', op: 'equals', value: 'Groceries - Fruits 🥑' }]
            }
        ]
    };

    reconcileBackupCategories(backup);

    // Transactions remapped
    assert.equal(backup.transactions[0].category, 'Groceries - Fruits 🍎');
    assert.equal(backup.transactions[1].category, 'Transport - Cab 🚕');
    assert.equal(backup.transactions[2].category, 'Custom - Pet Care 🐶');

    // Rules remapped
    assert.equal(backup.rules[0].thenText, 'Groceries - Fruits 🍎');
    assert.equal(backup.rules[1].actions[0].value, 'Transport - Cab 🚕');
    assert.equal(backup.rules[1].conditions[0].value, 'Groceries - Fruits 🍎');

    // Budgets remapped
    assert.equal(backup.settings.budgets[0].category, 'Groceries - Fruits 🍎');
    assert.equal(backup.settings.budgets[1].category, 'Custom - Pet Care 🐶');

    // Recurring & billInstances remapped
    assert.equal(backup.settings.recurring[0].category, 'Groceries - Fruits 🍎');
    assert.equal(backup.settings.recurring[1].category, 'Custom - Pet Care 🐶');
    assert.equal(backup.settings.billInstances[0].category, 'Groceries - Fruits 🍎');

    // categoryTypes remapped
    assert.equal(backup.settings.categoryTypes['Groceries - Fruits 🍎'], 'expense');
    assert.equal(backup.settings.categoryTypes['Groceries - Fruits 🥑'], undefined);
    assert.equal(backup.settings.categoryTypes['Custom - Pet Care 🐶'], 'expense');
});

test('reconcileBackupCategories discovers custom categories from transactions even if omitted from settings.categories', () => {
    const backup = {
        settings: {
            // Empty categories array in backup
            categories: []
        },
        transactions: [
            { id: 't1', narration: 'Crypto', category: 'Investments - Solana Staking 🪙' }
        ]
    };

    reconcileBackupCategories(backup);

    // Default categories intact
    assert.ok(backup.settings.categories.includes('Groceries - Staples 🌾'));
    // Custom category discovered and preserved
    assert.ok(backup.settings.categories.includes('Investments - Solana Staking 🪙'));
    assert.equal(backup.transactions[0].category, 'Investments - Solana Staking 🪙');
});

test('restoreBackup reconciles categories before saving to database', async () => {
    const savedSettings = {};
    const savedTransactions = [];
    const savedRules = [];

    const mockInitDB = async () => ({
        transaction: () => ({
            objectStore: () => ({
                put: (t) => savedTransactions.push(t)
            }),
            oncomplete: null,
            onerror: null
        })
    });

    const mockDBOps = {
        initDB: async () => ({
            transaction: () => {
                const tx = {
                    objectStore: () => ({
                        put: (t) => savedTransactions.push(t)
                    }),
                    oncomplete: () => {},
                    onerror: () => {}
                };
                setTimeout(() => tx.oncomplete && tx.oncomplete(), 0);
                return tx;
            }
        }),
        saveSettingInDB: async (key, val) => { savedSettings[key] = val; },
        saveTagInDB: async () => {},
        saveRuleInDB: async (rule) => { savedRules.push(rule); },
        saveDocumentInDB: async () => {},
        wipeDatabase: async () => {}
    };

    const backup = {
        settings: {
            categories: [
                'Groceries - Fruits 🥑',
                'Custom - Freelance Web 🌐'
            ]
        },
        transactions: [
            { id: 'tx-1', narration: 'Fresh Market', amount: 450, category: 'Groceries - Fruits 🥑' }
        ],
        rules: [
            { id: 'r-1', whenText: 'market', thenText: 'Groceries - Fruits 🥑' }
        ]
    };

    await restoreBackup(backup, mockDBOps);

    // Default categories must not be modified or missing
    assert.ok(savedSettings.categories.includes('Groceries - Fruits 🍎'));
    assert.ok(!savedSettings.categories.includes('Groceries - Fruits 🥑'));
    assert.ok(savedSettings.categories.includes('Custom - Freelance Web 🌐'));
    assert.equal(savedSettings.categories.length, DEFAULT_CATEGORIES.length + 1);

    // Transactions & rules saved with canonical category
    assert.equal(savedTransactions[0].category, 'Groceries - Fruits 🍎');
    assert.equal(savedRules[0].thenText, 'Groceries - Fruits 🍎');
});

test('stripLocalOnlySettings removes browser-local keys like geminiApiKey', () => {
    const raw = {
        timezone: 'Asia/Calcutta',
        geminiApiKey: 'secret-key-123',
        dateFormat: 'DD/MM/YYYY'
    };
    const cleaned = stripLocalOnlySettings(raw);
    assert.equal(cleaned.timezone, 'Asia/Calcutta');
    assert.equal(cleaned.dateFormat, 'DD/MM/YYYY');
    assert.equal(cleaned.geminiApiKey, undefined);
});
