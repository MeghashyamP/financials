import test from 'node:test';
import assert from 'node:assert/strict';
import { findSensitiveRanges, redactText } from './redaction.js';

const hits = (s) => findSensitiveRanges(s).map(([a, b]) => s.slice(a, b));

test('masks account, card and reference numbers', () => {
    assert.deepEqual(hits('A/c No 50100123456789 IFSC HDFC0001234'), ['50100123456789']);
    assert.deepEqual(hits('Card 4375 51XX XXXX 1234 ending'), ['4375 51XX XXXX 1234']);
    assert.deepEqual(hits('UPI/DR/657931389278/SOME SHOP'), ['657931389278']);
});

test('masks mobile numbers including the one inside a UPI id, keeps the handle', () => {
    assert.deepEqual(hits('UPI-SAMPLE-9876543210@ybl'), ['9876543210']);
    assert.deepEqual(hits('call 98765 43210 now'), ['98765 43210']);
});

test('masks e-mail and PAN but not UPI handles', () => {
    assert.deepEqual(hits('mail me at ravi.k@example.com'), ['ravi.k@example.com']);
    assert.deepEqual(hits('PAN ABCDE1234F'), ['ABCDE1234F']);
    assert.deepEqual(hits('UPI-SHOP-shop@okhdfcbank'), []);
});

test('leaves amounts, dates and merchant text alone', () => {
    for (const s of ['1,23,456.78', '₹ 10000000.00', '05/08/2026', 'SWIGGY BANGALORE', 'Balance 45,000.50 Cr', 'EMI 12/36']) {
        assert.deepEqual(hits(s), [], s);
    }
});

test('redactText replaces only the sensitive span', () => {
    const out = redactText('A/c 50100123456789 debit');
    assert.match(out, /^A\/c █+ debit$/);
    assert.equal(redactText('plain text'), 'plain text');
});
