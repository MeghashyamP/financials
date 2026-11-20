/**
 * statementImport.js — everything that happens after a statement's rows are saved:
 *   1. the statement joins the history (settings.statements)
 *   2. the account's profile learns its number / limit / due day
 *   3. the account's Net Worth line is refreshed (card owed, bank balance)
 *   4. a credit card's due date + amount land in Recurring and on the calendar
 *
 * It only talks to the outside through `saveSetting(key, value)`, so it can be tested with a fake.
 */

import { makeStatementRecord, upsertStatement, syncNetWorthFromStatement, planCardBill } from './statementLedger.js';
import { learnProfileFromStatement, statementConflict } from './accounts.js';

const endKey = (r) => r.periodEnd || r.statementDate || '';

/**
 * @param settings   latest settings snapshot (read once; every write goes through saveSetting)
 * @param input      { summary, account, fileName, documentId }
 * @param env        { todayIso, nowIso, newId, saveSetting, groupKind, effectiveValue, cardBillCategory }
 * @returns { recorded, skippedReason?, record?, networthUpdated, billPlanned, profileUpdated }
 */
export const applyStatementImport = async (settings, { summary, account, fileName = '', documentId = null }, env) => {
    const { todayIso, nowIso, newId, saveSetting, groupKind, effectiveValue, cardBillCategory } = env;
    const out = { recorded: false, networthUpdated: false, billPlanned: false, profileUpdated: false };
    if (!summary || !account) return { ...out, skippedReason: 'no statement details' };

    const profiles = { ...(settings.accountProfiles || {}) };
    const profile = profiles[account] || {};
    if (statementConflict(profile, summary)) {
        return { ...out, skippedReason: `"${account}" does not look like the account this statement belongs to` };
    }

    // 1. history
    const record = makeStatementRecord(summary, { account, fileName, importedAt: nowIso });
    if (documentId) record.documentId = documentId;
    const statements = upsertStatement(settings.statements || [], record);
    await saveSetting('statements', statements);
    out.recorded = true;
    out.record = record;

    // 2. profile
    const learned = learnProfileFromStatement(profile, summary);
    if (JSON.stringify(learned) !== JSON.stringify(profile)) {
        profiles[account] = learned;
        await saveSetting('accountProfiles', profiles);
        out.profileUpdated = true;
    }

    const isNewest = statements.filter((r) => r.account === account).every((r) => endKey(r) <= endKey(record));

    // 3. net worth
    if (settings.autoNetWorthFromStatements !== false) {
        const nw = syncNetWorthFromStatement(settings.networthItems || [], record, { newId });
        if (nw.changed) {
            await saveSetting('networthItems', nw.items);
            const active = nw.items.filter((it) => it.includeInNetWorth !== false);
            const totalAssets = active
                .filter((it) => ['asset', 'balance', 'income'].includes(groupKind(it.category)))
                .reduce((s, it) => s + effectiveValue(it), 0);
            const totalLiabs = active
                .filter((it) => groupKind(it.category) === 'liability')
                .reduce((s, it) => s + Math.abs(effectiveValue(it)), 0);
            await saveSetting('assetsTotal', totalAssets);
            await saveSetting('liabilitiesTotal', totalLiabs);
            await saveSetting('netWorthConfigured', true);
            out.networthUpdated = true;
        }
    }

    // 4. card due date → Recurring + calendar (newest statement only)
    if (record.kind === 'card' && isNewest) {
        const plan = planCardBill({
            recurring: settings.recurring || [],
            billInstances: settings.billInstances || [],
            record, todayIso, category: cardBillCategory, newId
        });
        if (plan.changed) {
            await saveSetting('recurring', plan.recurring);
            await saveSetting('billInstances', plan.billInstances);
            out.billPlanned = true;
        }
    }
    return out;
};
