// TOTP (Time-based One-Time Password) implementation for 2FA.
// Compatible with Google Authenticator, Authy, etc.

import crypto from 'node:crypto';

// Base32 encoding/decoding for TOTP secret keys
const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = '';
  for (const byte of buffer) bits += byte.toString(2).padStart(8, '0');
  let result = '';
  for (let i = 0; i < bits.length; i += 5) {
    const chunk = bits.slice(i, i + 5).padEnd(5, '0');
    result += BASE32_CHARS[parseInt(chunk, 2)];
  }
  return result;
}

function base32Decode(str) {
  const cleaned = str.replace(/[^A-Z2-7]/gi, '').toUpperCase();
  let bits = '';
  for (const char of cleaned) {
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

// Generate a new TOTP secret for a user
export function generateTOTPSecret() {
  const secret = crypto.randomBytes(20); // 160-bit secret
  return {
    secret: base32Encode(secret),
    secretHex: secret.toString('hex'),
  };
}

// Generate TOTP code for a given secret and time
export function generateTOTP(secretBase32, timeStep = 30, digits = 6) {
  const key = base32Decode(secretBase32);
  const epoch = Math.floor(Date.now() / 1000);
  const counter = Math.floor(epoch / timeStep);
  
  // Convert counter to 8-byte buffer (big-endian)
  const counterBuf = Buffer.alloc(8);
  counterBuf.writeBigInt64BE(BigInt(counter));
  
  // HMAC-SHA1
  const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
  
  // Dynamic truncation
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  ) % Math.pow(10, digits);
  
  return code.toString().padStart(digits, '0');
}

// Verify a TOTP code (allows ±1 time step for clock drift)
export function verifyTOTP(secretBase32, code, timeStep = 30) {
  // Check current, previous, and next time steps (±30 seconds)
  for (let drift = -1; drift <= 1; drift++) {
    const epoch = Math.floor(Date.now() / 1000) + (drift * timeStep);
    const counter = Math.floor(epoch / timeStep);
    
    const key = base32Decode(secretBase32);
    const counterBuf = Buffer.alloc(8);
    counterBuf.writeBigInt64BE(BigInt(counter));
    
    const hmac = crypto.createHmac('sha1', key).update(counterBuf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const expected = (
      ((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)
    ) % Math.pow(10, 6);
    
    if (expected.toString().padStart(6, '0') === code) {
      return true;
    }
  }
  return false;
}

// Generate a QR code URL for authenticator apps
export function getTOTPAuthURL(email, secretBase32, issuer = 'VELTRUVIA') {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedEmail = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedEmail}?secret=${secretBase32}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

// Generate a manual entry key display (for users who can't scan QR)
export function getTOTPManualEntry(secretBase32, email) {
  // Group into chunks of 4 for readability
  const grouped = secretBase32.match(/.{1,4}/g)?.join(' ') || secretBase32;
  return {
    key: grouped,
    email,
    type: 'TOTP',
    app: 'Google Authenticator, Authy, or similar',
  };
}
