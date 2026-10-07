// ═══════════════════════════════════════════════════════════════════════
// TURN REST credentials — coturn `use-auth-secret` scheme.
// ═══════════════════════════════════════════════════════════════════════
// coturn configured with use-auth-secret + static-auth-secret accepts
// time-limited credentials instead of long-lived accounts:
//   username   = "<unix-expiry>:<tag>"
//   credential = base64(HMAC-SHA1(secret, username))
// coturn verifies the HMAC and rejects any username whose leading timestamp
// has passed — so a leaked credential dies within the hour and the secret
// itself never leaves the server. Same format as coturn's examples/turn-rest.py.
import crypto from 'crypto';

export function mintTurnCredentials(secret, ttlSec = 3600, now = Date.now()) {
  if (!secret) throw new Error('TURN secret not configured');
  const ttl = Math.max(60, Math.min(86400, Math.floor(ttlSec)));
  const expiry = Math.floor(now / 1000) + ttl;
  const username = `${expiry}:veltruvia`;
  const credential = crypto.createHmac('sha1', secret).update(username).digest('base64');
  return { username, credential, ttl };
}
