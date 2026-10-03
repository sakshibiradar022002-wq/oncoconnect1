// TURN credential minting tests — coturn `use-auth-secret` (REST) scheme.
// The canonical bundle lives at VELTRUVIA Server/resources/app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mintTurnCredentials } from '../VELTRUVIA Server/resources/app/src/lib/turn.js';

test('TURN REST credentials follow the coturn use-auth-secret scheme', () => {
  const secret = 'unit-test-secret';
  const now = 1_760_000_000_000;
  const { username, credential, ttl } = mintTurnCredentials(secret, 3600, now);
  assert.equal(ttl, 3600);
  const m = /^(\d+):veltruvia$/.exec(username);
  assert.ok(m, 'username must be "<unix-expiry>:veltruvia"');
  assert.equal(Number(m[1]), Math.floor(now / 1000) + 3600, 'expiry = now + ttl');
  const expected = crypto.createHmac('sha1', secret).update(username).digest('base64');
  assert.equal(credential, expected, 'credential = base64(HMAC-SHA1(secret, username))');
});

test('TURN mint rejects a missing secret and clamps silly TTLs', () => {
  assert.throws(() => mintTurnCredentials(''), /secret/i);
  assert.throws(() => mintTurnCredentials(undefined), /secret/i);
  const { username } = mintTurnCredentials('s', 1, 1_760_000_000_000);
  assert.equal(Number(username.split(':')[0]), Math.floor(1_760_000_000_000 / 1000) + 60, 'ttl clamped up to 60s');
  const { username: u2 } = mintTurnCredentials('s', 999_999, 1_760_000_000_000);
  assert.equal(Number(u2.split(':')[0]), Math.floor(1_760_000_000_000 / 1000) + 86400, 'ttl clamped down to 24h');
});
