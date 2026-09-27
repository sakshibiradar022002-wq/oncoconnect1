// Bootstrap an admin account using the server's own crypto (hashPassword + encryptPHI).
// Run on VM: node vm-bootstrap-admin.mjs <email> <password>
// Idempotent: updates the password hash if the account already exists.
import 'dotenv/config';
import { createRequire } from 'node:module';
const require = createRequire(new URL('./src/crypto.js', import.meta.url));
const { hashPassword, encryptPHI } = await import('./src/crypto.js');

const email = (process.argv[2] || '').toLowerCase().trim();
const password = process.argv[3] || '';
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('bad email'); process.exit(1); }
if (password.length < 12) { console.error('password must be >= 12 chars'); process.exit(1); }

const { createClient } = require('@libsql/client');
const db = createClient({ url: 'file:./chemocure.db' });

const hash = hashPassword(password);
const nameEnc = encryptPHI('Clinic Administrator');
const metaEnc = encryptPHI({ specialty: 'Administration', institution: 'VELTRUVIA Clinic' });
const now = new Date().toISOString();

await db.execute({
  sql: `INSERT INTO users (id, email, password_hash, role, active, name_enc, meta_enc, created_at)
        VALUES ('admin-bootstrap', ?, ?, 'admin', 1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET email=excluded.email, password_hash=excluded.password_hash,
          name_enc=excluded.name_enc, meta_enc=excluded.meta_enc, active=1`,
  args: [email, hash, nameEnc, metaEnc, now],
}).catch(async (e) => {
  // unique email belongs to another row → update that row instead
  const r = await db.execute({
    sql: `UPDATE users SET password_hash=?, role='admin', active=1, name_enc=?, meta_enc=? WHERE email=?`,
    args: [hash, nameEnc, metaEnc, email],
  });
  if (r.rowsAffected === 0) { console.error('insert failed:', e.message); process.exit(1); }
});

const check = await db.execute({ sql: 'SELECT id, email, role, active FROM users WHERE email=?', args: [email] });
console.log('BOOTSTRAPPED:', JSON.stringify(check.rows[0]));
