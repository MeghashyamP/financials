import test from 'node:test';
import assert from 'node:assert/strict';

// crypto.js reads window.crypto / window.btoa; in node they live on globalThis
globalThis.window = globalThis;
const { encryptPayload, decryptPayload, generateRecoveryKit, recoverSecret, parseRecoveryKit, buildRecoveryKitFile } = await import('./crypto.js');

const data = { transactions: [{ id: 1, amount: 10 }], settings: { a: 1 } };

test('envelopes without a recovery key are unchanged and still decrypt', async () => {
    const env = await encryptPayload(data, 'pw-one');
    assert.equal(env.recovery, undefined);
    assert.deepEqual(await decryptPayload(env, 'pw-one'), data);
    await assert.rejects(() => decryptPayload(env, 'other'), /Invalid password/);
});

test('recovery kit: forget the password, open the sealed copy with the kit, decrypt the data', async () => {
    const kit = await generateRecoveryKit();
    const env = await encryptPayload(data, 'old-password', { recoveryPublicKey: kit.publicKey });
    assert.ok(env.recovery && env.recovery.ct && env.recovery.kid === kit.kid);
    assert.ok(!JSON.stringify(env).includes('old-password'), 'password is never stored in the clear');

    // the account password was reset: the new one cannot open the data
    await assert.rejects(() => decryptPayload(env, 'new-password'), /Invalid password/);
    // the kit recovers the old password, which can
    const recovered = await recoverSecret(env.recovery, kit.privateKey);
    assert.equal(recovered, 'old-password');
    assert.deepEqual(await decryptPayload(env, recovered), data);

    // after recovering, saving again under the new password re-seals it
    const env2 = await encryptPayload(data, 'new-password', { recoveryPublicKey: kit.publicKey });
    assert.equal(await recoverSecret(env2.recovery, kit.privateKey), 'new-password');
});

test('a different kit, a missing recovery blob or a corrupt kit file fail with a clear message', async () => {
    const a = await generateRecoveryKit();
    const b = await generateRecoveryKit();
    const env = await encryptPayload(data, 'pw', { recoveryPublicKey: a.publicKey });
    await assert.rejects(() => recoverSecret(env.recovery, b.privateKey), /does not match/);
    await assert.rejects(() => recoverSecret(undefined, a.privateKey), /no recovery data/);
    await assert.rejects(() => recoverSecret(env.recovery, { kty: 'nope' }), /not valid/);
    assert.throws(() => parseRecoveryKit('not json'), /not a recovery kit/);
    assert.throws(() => parseRecoveryKit('{"type":"other"}'), /not a recovery kit/);
});

test('kit file round-trips through parse', async () => {
    const kit = await generateRecoveryKit();
    const file = buildRecoveryKitFile({ privateKey: kit.privateKey, kid: kit.kid, email: 'me@example.com' });
    const parsed = parseRecoveryKit(file);
    assert.equal(parsed.kid, kit.kid);
    assert.equal(parsed.email, 'me@example.com');
    const env = await encryptPayload(data, 'pw2', { recoveryPublicKey: kit.publicKey });
    assert.equal(await recoverSecret(env.recovery, parsed.privateKey), 'pw2');
});
