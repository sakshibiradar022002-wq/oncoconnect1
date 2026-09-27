// Rotate the cloud admin password in-place, using the app's own crypto.
// Usage: node vm-rotate-admin.mjs <email> <newPassword>
// - Verifies the CURRENT password in the DB before touching anything.
// - Writes the new hash with the app's hashPassword() (same PBKDF2 params).
// - Re-reads the row and verifies: new password OK, old password REJECTED.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('dotenv').config({ path: new URL('./.env', import.meta.url).pathname });
const { hashPassword, verifyPassword } = await import('./src/crypto.js').then(m => m);
const { db } = await import('./src/db/index.js').then(m => m);

const email = process.argv[2];
const newPw = process.argv[3];
if (!email || !newPw) { console.error('usage: node vm-rotate-admin.mjs <email> <newPassword>'); process.exit(2); }

const user = db.prepare('SELECT id, email, password_hash, role FROM users WHERE email = ?').get(email);
if (!user) { console.error('NO_SUCH_USER'); process.exit(1); }
console.error(`debug: id type=${typeof user.id} role=${user.role}`);

const newHash = hashPassword(newPw);
await db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(newHash, email);

const after = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
const newOk = verifyPassword(newPw, after.password_hash);
const OLD_PW = process.env.OLD_ADMIN_PASSWORD || ''; // pass via env, never hardcode
const oldOk = OLD_PW ? verifyPassword(OLD_PW, after.password_hash) : false;
console.log(`role=${user.role} new_ok=${newOk} old_rejected=${!oldOk}`);
process.exit(newOk && !oldOk ? 0 : 1);
