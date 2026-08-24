// Database adapter. Three backends behind one tiny async interface:
//
//   - libsql (@libsql/client)  — used when TURSO_DATABASE_URL is set. Points
//     at a Turso cloud database (free tier, no disk needed on the host) or a
//     local file via a file: URL.
//   - better-sqlite3           — local file, fast native binding.
//   - node:sqlite              — local file, zero build step (Node >= 22).
//
// The interface every backend exposes:
//   db.prepare(sql) -> { run(...args), get(...args), all(...args) }  (async)
//   db.exec(sql), db.pragma(str)                                     (async)
//
// All methods return promises so the same route code works against both the
// in-process SQLite files and the remote Turso HTTP API.

import { readFileSync, writeFileSync } from 'node:fs';

let impl = null;

export async function openDatabase(path) {
  const tursoUrl = process.env.TURSO_DATABASE_URL || process.env.LIBSQL_URL;
  if (tursoUrl) {
    const { createClient } = await import('@libsql/client');
    const client = createClient({
      url: tursoUrl,
      authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    });
    impl = 'libsql';
    return wrapLibsql(client, tursoUrl);
  }

  // Serverless hosts (Vercel, Netlify, Cloudflare) have a read-only, ephemeral
  // filesystem — a local SQLite file cannot work there. Fail with a clear,
  // actionable message instead of a cryptic native crash.
  if (process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    throw new Error(
      'This is a serverless deployment (e.g. Vercel) but no TURSO_DATABASE_URL is set. ' +
      'SQLite files cannot persist on serverless hosts — create a free Turso ' +
      'database (https://turso.tech) and set these environment variables in your ' +
      'host dashboard: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, JWT_SECRET, PHI_ENCRYPTION_KEY. ' +
      'Step-by-step: see DEPLOY_VERCEL.md in the repo. ' +
      'Alternatively deploy to a host with a persistent disk (Render, Fly.io, Railway).'
    );
  }

  // Try better-sqlite3 first.
  try {
    const mod = await import('better-sqlite3');
    const db = new mod.default(path);
    impl = 'better-sqlite3';
    return wrapSync(db, (s) => db.pragma(s), path);
  } catch {
    // Try node:sqlite (Node >= 22)
    try {
      const { DatabaseSync } = await import('node:sqlite');
      const db = new DatabaseSync(path);
      impl = 'node:sqlite';
      return wrapSync(db, (s) => db.exec(`PRAGMA ${s};`), path);
    } catch {
      // Fall back to sql.js (WASM-based, no native build needed)
      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs();
      let db;
      const fs = await import('node:fs');
      if (path === ':memory:') {
        db = new SQL.Database();
      } else {
        try {
          const buffer = fs.readFileSync(path);
          db = new SQL.Database(buffer);
        } catch {
          db = new SQL.Database();
        }
      }
      impl = 'sql.js';
      return wrapSqlJs(db, path);
    }
  }
}

export function activeImpl() { return impl; }

// Promisify a synchronous sqlite handle (both share prepare/exec).
function wrapSync(db, pragma, dbPath) {
  return {
    async exec(sql) { db.exec(sql); },
    async pragma(str) { pragma(str); },
    prepare(sql) {
      const stmt = db.prepare(sql);
      return {
        async run(...args) { return stmt.run(...args); },
        async get(...args) { return stmt.get(...args); },
        async all(...args) { return stmt.all(...args); },
      };
    },
    close() {
      try { db.close(); } catch {}
    },
    name: dbPath,
  };
}

function wrapSqlJs(db, dbPath) {
  const save = () => { try { const data = db.export(); writeFileSync(dbPath, Buffer.from(data)); } catch {} };
  const intervalId = setInterval(save, 5000);
  process.on('exit', save);
  process.on('SIGINT', () => { save(); process.exit(); });
  return {
    async exec(sql) {
      db.exec(sql);
    },
    async pragma(str) {
      try { db.run(`PRAGMA ${str}`); } catch {}
    },
    prepare(sql) {
      return {
        async run(...args) {
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          db.run(sql, params);
          return { changes: db.getRowsModified() };
        },
        async get(...args) {
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          const stmt = db.prepare(sql);
          try {
            stmt.bind(params);
            if (stmt.step()) {
              const cols = stmt.getColumnNames();
              const vals = stmt.get();
              const row = {};
              cols.forEach((c, i) => row[c] = vals[i]);
              return row;
            }
            return undefined;
          } finally {
            stmt.free();
          }
        },
        async all(...args) {
          const params = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
          const stmt = db.prepare(sql);
          try {
            stmt.bind(params);
            const rows = [];
            while (stmt.step()) {
              const cols = stmt.getColumnNames();
              const vals = stmt.get();
              const row = {};
              cols.forEach((c, i) => row[c] = vals[i]);
              rows.push(row);
            }
            return rows;
          } finally {
            stmt.free();
          }
        },
      };
    },
    close() {
      clearInterval(intervalId);
      save(); // final flush
      db.close();
    },
    name: dbPath,
  };
}

function wrapLibsql(client, url) {
  return {
    async exec(sql) {
      // executeMultiple runs a whole script (schema files); PRAGMAs are
      // meaningless over the remote HTTP protocol, so strip them.
      const script = sql.split('\n').filter(l => !/^\s*PRAGMA\b/i.test(l)).join('\n');
      await client.executeMultiple(script);
    },
    async pragma() { /* not applicable to a remote database */ },
    prepare(sql) {
      return {
        async run(...args) {
          const r = await client.execute({ sql, args });
          return { changes: r.rowsAffected };
        },
        async get(...args) {
          const r = await client.execute({ sql, args });
          return r.rows[0] ? { ...r.rows[0] } : undefined;
        },
        async all(...args) {
          const r = await client.execute({ sql, args });
          return r.rows.map(row => ({ ...row }));
        },
      };
    },
    close() { /* libsql client has no close method */ },
    name: url,
  };
}
