import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLaunchAction, stripLaunchAction, formatBytes, getPwaState, isStandalone, getStorageStatus } from './pwa.js';

test('shortcut actions: only add / import / review are accepted', () => {
    assert.equal(parseLaunchAction('?action=add'), 'add');
    assert.equal(parseLaunchAction('?action=import'), 'import');
    assert.equal(parseLaunchAction('?source=pwa&action=review'), 'review');
    assert.equal(parseLaunchAction('?action=delete-everything'), null);
    assert.equal(parseLaunchAction('?action='), null);
    assert.equal(parseLaunchAction(''), null);
    assert.equal(parseLaunchAction(), null);
});

test('stripLaunchAction removes only the action and keeps the rest of the address', () => {
    assert.equal(stripLaunchAction('/financials/', '?action=add'), '/financials/');
    assert.equal(stripLaunchAction('/financials/', '?source=pwa&action=import', '#x'), '/financials/?source=pwa#x');
    assert.equal(stripLaunchAction('/', ''), '/');
});

test('formatBytes is short and human', () => {
    assert.equal(formatBytes(0), '0 KB');
    assert.equal(formatBytes(NaN), '0 KB');
    assert.equal(formatBytes(512), '1 KB');
    assert.equal(formatBytes(150 * 1024), '150 KB');
    assert.equal(formatBytes(5.5 * 1024 * 1024), '5.5 MB');
    assert.equal(formatBytes(2.25 * 1024 * 1024 * 1024), '2.3 GB');
});

test('in node (no browser) everything degrades quietly', async () => {
    assert.equal(isStandalone(), false);
    assert.deepEqual(getPwaState(), { needRefresh: false, offlineReady: false, canInstall: false, installed: false });
    const s = await getStorageStatus();
    assert.equal(s.supported, false);
    assert.equal(s.persisted, false);
});
