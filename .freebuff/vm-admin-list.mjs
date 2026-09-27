// Debug: tables + user count via libsql on VM
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { createClient } = require('@libsql/client');

const db = createClient({ url: 'file:./chemocure.db' });
const tables = await db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name");
console.log('TABLES:', tables.rows.map(r => r.name).join(', '));
const cnt = await db.execute('SELECT COUNT(*) AS n FROM users');
console.log('user count:', cnt.rows[0].n);
const rs = await db.execute('SELECT id, email, role, active FROM users');
for (const r of rs.rows) console.log(JSON.stringify(r));
