#!/usr/bin/env node
/**
 * sepolia-replay.mjs — read-only replay of the VELTRUVIA AuditTrail anchors.
 *
 * Turns the [VERIFY] markers in reports/SEPOLIA-DISCLOSURE-ASSESSMENT.md into
 * fact: how many audit events are on chain, how many *distinct* identifiers the
 * old (<= 2.6.7) write path published, and the block/time window that covers.
 *
 *   node scripts/sepolia-replay.mjs
 *   node scripts/sepolia-replay.mjs --contract 0x… --rpc https://… --json
 *   node scripts/sepolia-replay.mjs --from-block 6123456 --to-block 6200000
 *   node scripts/sepolia-replay.mjs --join /tmp/chemocure-copy.db
 *
 * `--join <db>` answers the question the counts above cannot: how many of the
 * published identifiers belong to a person in this store. Local values are
 * hashed here with the same digest used for the chain values and compared
 * set-to-set, so no identifier leaves the process — the output is counts.
 * Open a COPY of the live database, not the live file.
 *
 * Safety properties, by design:
 *   • read-only — no key, no transaction, no eth_sendRawTransaction.
 *   • never prints an identifier. An MRN or email address is decoded in memory,
 *     classified, and folded into a counter; only counts are emitted. Even the
 *     distinct-value sets are kept as sha256 digests, so a printed report/JSON
 *     can be handed to counsel without re-publishing PHI.
 *   • no npm dependency for the replay — plain JSON-RPC over fetch, like
 *     scripts/uptime-heartbeat.mjs. The `--join` store is opened read-only with
 *     `node:sqlite`, falling back to the app's better-sqlite3.
 *
 * Why calldata and not the event: `recordAudit(bytes32 recordHash, string action,
 * string targetId)` emits EntryRecorded(id, recordHash, action, previousHash) —
 * the third *argument* (the identifier) is input data only, so it must be read
 * from eth_getTransactionByHash. One caveat: a transaction that reverted is not
 * counted here (it emits no log) even though its calldata is public.
 *
 * Exit: 0 replay complete · 1 RPC/usage failure · 2 nothing to count.
 */
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';

const DEFAULTS = {
  // Documented in reports/SEPOLIA-DISCLOSURE-ASSESSMENT.md and contracts/README.md.
  contract: '0x601bfA130A709e55122234D046d57a6294aE9E7F',
  rpc: process.env.SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  chunk: 5000,
};

const arg = (name, fallback = null) => {
  const eq = process.argv.find(a => a.startsWith(name + '='));
  if (eq) return eq.slice(name.length + 1) || fallback;
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = name => process.argv.includes(name);

if (flag('--help') || flag('-h')) {
  console.log(`sepolia-replay — read-only Sepolia anchor replay (counts only)

  --contract <address>   contract to replay (default ${DEFAULTS.contract})
  --rpc <url>            JSON-RPC endpoint (default $SEPOLIA_RPC_URL or publicnode)
  --from-block <n>       first block to scan (default: contract creation, found by search)
  --to-block <n>         last block to scan (default: latest)
  --chunk <n>            blocks per eth_getLogs call (default ${DEFAULTS.chunk}; halved on error)
  --json                 emit a machine-readable summary to stdout instead of the report
  --quiet                suppress progress lines on stderr
  --join <db>            also join the published identifiers against a local
                         VELTRUVIA database (use a copy, not the live file) and
                         report how many resolve to a patient MRN, a user
                         account, or nothing. Counts only — never a value.

Print-out contains counts and block numbers only — never an MRN or an email.`);
  process.exit(0);
}

// keccak256 lets us filter on the real EntryRecorded topic and read the
// contract's own counter. Node exposes it only where OpenSSL 3.2+ is present,
// so treat it as an optimisation, never a requirement: without it the script
// still works, it just asks for every log from the address and validates the
// shape instead.
function keccakHex(text) {
  try { return createHash('KECCAK-256').update(text).digest('hex'); } catch { return null; }
}
const TOPIC_ENTRY_RECORDED = keccakHex('EntryRecorded(uint256,bytes32,string,bytes32)');
const SELECTOR_ENTRY_COUNT = keccakHex('getEntryCount()')?.slice(0, 8) ?? null;

const CONTRACT = String(arg('--contract', DEFAULTS.contract)).toLowerCase();
const RPC = arg('--rpc', DEFAULTS.rpc);
const CHUNK_START = Math.max(100, Number(arg('--chunk', DEFAULTS.chunk)) || DEFAULTS.chunk);
const JSON_OUT = flag('--json');
const QUIET = flag('--quiet');
const JOIN_DB = arg('--join', null);

if (!/^0x[0-9a-f]{40}$/.test(CONTRACT)) {
  console.error(`✗ --contract is not a 20-byte address: ${CONTRACT}`);
  process.exit(1);
}

const log = (...m) => { if (!QUIET && !JSON_OUT) console.error(...m); };
const hex = n => '0x' + n.toString(16);

// ── JSON-RPC ───────────────────────────────────────────────────────
let requestId = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function rpc(method, params, { attempts = 4 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(RPC, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'user-agent': 'VELTRUVIA-sepolia-replay/1.0' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      if (body.error) throw new Error(`${method}: ${body.error.message || 'RPC error'}`);
      return body.result;
    } catch (err) {
      lastError = err;
      if (attempt < attempts) await sleep(300 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`RPC ${method} failed after ${attempts} attempts: ${lastError?.message}`);
}

// ── ABI decoding without a dependency ──────────────────────────────
// recordAudit(bytes32,string,string) → 4-byte selector + 3 head words + tails.
// EntryRecorded(uint256,bytes32,string,bytes32) → 2 topics + (bytes32,string,bytes32) data.
const word = (buf, i) => buf.subarray(i * 32, i * 32 + 32);

function readString(body, byteOffset, maxLen = 512) {
  if (byteOffset % 32 !== 0 || byteOffset + 32 > body.length) return null;
  const len = Number(BigInt('0x' + word(body, byteOffset / 32).toString('hex')));
  const start = byteOffset + 32;
  if (!Number.isFinite(len) || len > maxLen || start + len > body.length) return null;
  const text = body.subarray(start, start + len).toString('utf8');
  // Identifiers and action names are printable ASCII; anything else is noise.
  if (!/^[\x20-\x7e]*$/.test(text)) return null;
  return text;
}

/** Decode a recordAudit call's input. Returns { recordHash, action, targetId } or null. */
export function decodeRecordAudit(input) {
  if (typeof input !== 'string' || !input.startsWith('0x')) return null;
  const body = Buffer.from(input.slice(10), 'hex'); // drop 0x + 4-byte selector
  if (body.length < 96) return null;
  const recordHash = '0x' + word(body, 0).toString('hex');
  const offAction = Number(BigInt('0x' + word(body, 1).toString('hex')));
  const offTarget = Number(BigInt('0x' + word(body, 2).toString('hex')));
  const action = readString(body, offAction, 64);
  const targetId = readString(body, offTarget, 256);
  if (action === null || targetId === null) return null;
  return { recordHash, action, targetId };
}

/** Decode an EntryRecorded log's data. Returns { recordHash, action, previousHash } or null. */
export function decodeEntryRecorded(data) {
  if (typeof data !== 'string' || !data.startsWith('0x')) return null;
  const body = Buffer.from(data.slice(2), 'hex');
  if (body.length < 96) return null;
  const recordHash = '0x' + word(body, 0).toString('hex');
  const offAction = Number(BigInt('0x' + word(body, 1).toString('hex')));
  const previousHash = '0x' + word(body, 2).toString('hex');
  const action = readString(body, offAction, 64);
  if (action === null) return null;
  return { recordHash, action, previousHash };
}

// ── Classification (values stay in memory) ─────────────────────────
const DIGEST = v => createHash('sha256').update(String(v)).digest('hex');
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const HASHED = /^0x[0-9a-f]{64}$/i;
const SHORT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/;

/** Bucket a historical targetId. The value itself is never returned. */
export function classifyTarget(targetId) {
  const v = String(targetId ?? '');
  if (!v) return 'empty';
  if (HASHED.test(v)) return 'already hashed (2.6.8+)';
  if (EMAIL.test(v)) return 'email address';
  if (SHORT_ID.test(v)) return 'MRN / short identifier';
  return 'other free text';
}

// ── Optional local join (--join <db>) ─────────────────────────────
// The replay keeps only digests, so the person count cannot be recovered from
// its own output. Re-derive it: hash this store's values with the same DIGEST,
// intersect, count. Values stay in memory; only the tallies leave.
const APP_DIR = process.env.APP_DIR || 'VELTRUVIA Server/resources/app';

async function openLocalDb(path) {
  try {
    const { DatabaseSync } = await import('node:sqlite');
    return new DatabaseSync(path, { readOnly: true });
  } catch { /* older Node — use the app's driver */ }
  const { createRequire } = await import('node:module');
  const req = createRequire(resolve(APP_DIR, 'package.json'));
  return new (req('better-sqlite3'))(path, { readonly: true });
}

/** Digests of every identifier this store can name without the PHI key. */
function localDigestSets(db) {
  const rows = sql => { try { return db.prepare(sql).all() || []; } catch { return []; } };
  const add = (set, list) => {
    for (const row of list) if (row && row.v != null && row.v !== '') set.add(DIGEST(row.v));
  };
  const emails = new Set();
  const userIds = new Set();
  const mrns = new Set();
  const auditTargets = new Set();
  add(emails, rows('SELECT DISTINCT email AS v FROM users'));
  add(userIds, rows('SELECT DISTINCT id AS v FROM users'));
  // The exact strings the old write path anchored: audit_log.target_id.
  add(auditTargets, rows('SELECT DISTINCT target_id AS v FROM audit_log WHERE target_id IS NOT NULL'));
  // Every table carrying a plaintext MRN key — discovered, not hard-listed.
  for (const t of rows("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")) {
    const name = String(t && t.name);
    if (!/^[A-Za-z0-9_]+$/.test(name)) continue;
    add(mrns, rows(`SELECT DISTINCT patient_mrn AS v FROM "${name}"`));
    add(mrns, rows(`SELECT DISTINCT mrn AS v FROM "${name}"`));
  }
  return { emails, userIds, mrns, auditTargets };
}

/** Count how many published digests resolve inside the given local sets. */
function tally(chainDigests, localSets) {
  const merged = new Set();
  for (const set of localSets) for (const d of set) merged.add(d);
  let matched = 0;
  for (const d of chainDigests) if (merged.has(d)) matched += 1;
  return { published: chainDigests.size, matched, unmatched: chainDigests.size - matched };
}

export function joinWithLocal(seen, database, db) {
  const local = localDigestSets(db);
  const shortId = tally(seen.id, [local.mrns, local.userIds, local.auditTargets]);
  const toPatient = tally(seen.id, [local.mrns]);
  const toAccount = tally(seen.id, [local.userIds]);
  return {
    database,
    candidateValues: {
      usersEmail: local.emails.size,
      usersId: local.userIds.size,
      patientMrn: local.mrns.size,
      auditTargetId: local.auditTargets.size,
    },
    shortIdentifiers: shortId,
    shortIdentifiersAsPatientMrn: toPatient,
    shortIdentifiersAsUserAccount: toAccount,
    emails: tally(seen.email, [local.emails, local.auditTargets]),
    otherFreeText: tally(seen.other, [local.auditTargets, local.mrns, local.userIds]),
    // A matched MRN is one patient; a matched account is one person. Emails held
    // only inside encrypted kv blobs cannot be seen here, so this is a floor.
    affectedPatientsFloor: toPatient.matched,
  };
}

// ── Discovery ──────────────────────────────────────────────────────
async function latestBlock() {
  return Number(BigInt(await rpc('eth_blockNumber', [])));
}

/** Lowest block holding contract code — assumes code, once deployed, stays. */
async function creationBlock(latest, toBlock) {
  const hasCode = async n => {
    const code = await rpc('eth_getCode', [CONTRACT, hex(n)]);
    return typeof code === 'string' && code !== '0x' && code.length > 2;
  };
  if (!(await hasCode(toBlock))) return null;
  let lo = 0;
  let hi = toBlock;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (await hasCode(mid)) hi = mid; else lo = mid + 1;
  }
  return lo;
}

async function collectLogs(fromBlock, toBlock, chunk) {
  const logs = [];
  let size = chunk;
  let start = fromBlock;
  while (start <= toBlock) {
    const end = Math.min(start + size - 1, toBlock);
    try {
      const filter = { address: CONTRACT, fromBlock: hex(start), toBlock: hex(end) };
      if (TOPIC_ENTRY_RECORDED) filter.topics = ['0x' + TOPIC_ENTRY_RECORDED];
      const batch = await rpc('eth_getLogs', [filter], { attempts: 3 });
      for (const entry of batch || []) {
        if (String(entry.address || '').toLowerCase() !== CONTRACT) continue;
        logs.push(entry);
      }
      log(`  scanned ${start}…${end} (${logs.length} log${logs.length === 1 ? '' : 's'} so far)`);
      start = end + 1;
      size = Math.min(chunk, size * 2); // recover after a shrink
      if (size > chunk) size = chunk;
    } catch (err) {
      if (size <= 100) throw err;
      size = Math.max(100, Math.floor(size / 2));
      log(`  range too large (${err.message}) — retrying with ${size}-block chunks`);
    }
  }
  return logs;
}

async function blockTimestamp(n) {
  const block = await rpc('eth_getBlockByNumber', [hex(n), false]);
  const ts = block && block.timestamp ? Number(BigInt(block.timestamp)) : null;
  return ts ? new Date(ts * 1000).toISOString() : null;
}

// ── Main ───────────────────────────────────────────────────────────
async function main() {
  if (JOIN_DB && !existsSync(JOIN_DB)) {
    throw new Error(`--join database not found: ${JOIN_DB} (use a copy, e.g. cp chemocure.db /tmp/join.db)`);
  }
  const latest = await latestBlock();
  const toBlock = Number(arg('--to-block', latest));
  if (!Number.isInteger(toBlock) || toBlock > latest) {
    throw new Error(`--to-block ${arg('--to-block')} is not a mined block (latest ${latest})`);
  }

  let fromBlock = arg('--from-block', null) ? Number(arg('--from-block')) : null;
  if (fromBlock === null) {
    log(`• locating contract creation block (binary search to ${toBlock})`);
    fromBlock = await creationBlock(latest, toBlock);
    if (fromBlock === null) {
      console.error(`✗ no contract code at ${CONTRACT} on or before block ${toBlock} — wrong address or network?`);
      process.exit(2);
    }
  }
  if (!Number.isInteger(fromBlock) || fromBlock < 0 || fromBlock > toBlock) {
    throw new Error(`--from-block ${arg('--from-block')} is out of range`);
  }

  const chainId = Number(BigInt(await rpc('eth_chainId', [])));
  let contractEntryCount = null;
  if (SELECTOR_ENTRY_COUNT) {
    try {
      const raw = await rpc('eth_call', [{ to: CONTRACT, data: '0x' + SELECTOR_ENTRY_COUNT }, 'latest']);
      if (typeof raw === 'string' && raw !== '0x') contractEntryCount = Number(BigInt(raw));
    } catch { /* counter is a nice-to-have, not a hard requirement */ }
  }
  log(`• contract ${CONTRACT} · chain ${chainId} · blocks ${fromBlock}…${toBlock}`);
  log('• scanning logs');

  const logs = await collectLogs(fromBlock, toBlock, CHUNK_START);

  const decodedLogs = [];
  const txHashes = new Set();
  let undecodableLogs = 0;
  for (const entry of logs) {
    const decoded = decodeEntryRecorded(entry.data || '0x');
    if (!decoded) { undecodableLogs += 1; continue; }
    decodedLogs.push({ ...decoded, block: Number(BigInt(entry.blockNumber)), txHash: entry.transactionHash });
    if (entry.transactionHash) txHashes.add(entry.transactionHash);
  }

  log(`• fetching ${txHashes.size} transaction${txHashes.size === 1 ? '' : 's'} for calldata`);
  const classes = new Map();
  const seen = { email: new Set(), id: new Set(), hashed: new Set(), other: new Set() };
  let decodedTxs = 0;
  let mismatched = 0;
  let withoutTarget = 0;

  for (const txHash of txHashes) {
    const tx = await rpc('eth_getTransactionByHash', [txHash]);
    const call = tx && decodeRecordAudit(tx.input || tx.data || '');
    if (!call) { withoutTarget += 1; continue; }
    decodedTxs += 1;
    // Cross-check against the event: same tx, same action string. Rejects noise
    // from any other function that happens to share the 3-argument shape.
    const matching = decodedLogs.filter(l => l.txHash === txHash);
    if (matching.length && !matching.some(l => l.action === call.action)) mismatched += 1;
    const bucket = classifyTarget(call.targetId);
    classes.set(bucket, (classes.get(bucket) || 0) + 1);
    const digest = DIGEST(call.targetId);
    if (bucket === 'email address') seen.email.add(digest);
    else if (bucket === 'MRN / short identifier') seen.id.add(digest);
    else if (bucket.startsWith('already hashed')) seen.hashed.add(digest);
    else seen.other.add(digest);
  }

  const blocks = decodedLogs.map(l => l.block).filter(Number.isFinite);
  const firstBlock = blocks.length ? Math.min(...blocks) : null;
  const lastBlock = blocks.length ? Math.max(...blocks) : null;
  const distinctTotal = seen.email.size + seen.id.size + seen.hashed.size + seen.other.size;

  const summary = {
    contract: CONTRACT,
    chainId,
    rpc: RPC.replace(/\/\/[^/]*@/, '//***@'), // never echo credentials in a URL
    scanned: { fromBlock, toBlock },
    events: decodedLogs.length,
    contractEntryCount,
    undecodableLogs,
    transactions: txHashes.size,
    decodedTxs,
    transactionsWithoutDecodableTarget: withoutTarget,
    actionMismatches: mismatched,
    firstAnchor: firstBlock === null ? null : { block: firstBlock, at: await blockTimestamp(firstBlock) },
    lastAnchor: lastBlock === null ? null : { block: lastBlock, at: await blockTimestamp(lastBlock) },
    anchorsByClass: Object.fromEntries([...classes.entries()].sort()),
    distinctTargets: {
      email: seen.email.size,
      mrnOrShortId: seen.id.size,
      alreadyHashed: seen.hashed.size,
      other: seen.other.size,
      total: distinctTotal,
    },
    note: 'Counts only — no identifier value is printed or stored by this script.',
  };

  if (JOIN_DB) {
    const db = await openLocalDb(JOIN_DB);
    try {
      summary.localJoin = joinWithLocal(seen, JOIN_DB, db);
    } finally {
      try { db.close(); } catch { /* closing a read-only handle cannot lose data */ }
    }
  }

  if (JSON_OUT) {
    console.log(JSON.stringify(summary, null, 2));
    return summary;
  }

  const pad = (label, value) => console.log(`  ${label.padEnd(38)} ${value}`);
  console.log('');
  console.log(`Sepolia anchor replay — read-only, counts only`);
  console.log('─'.repeat(62));
  pad('Contract', CONTRACT);
  pad('Chain', chainId);
  pad('Blocks scanned', `${fromBlock} … ${toBlock}`);
  pad('EntryRecorded events', summary.events);
  if (summary.contractEntryCount !== null) {
    pad('Contract getEntryCount()', `${summary.contractEntryCount}${summary.contractEntryCount === summary.events ? ' (matches)' : ' (MISMATCH — events missed)'}`);
  }
  if (summary.undecodableLogs) pad('Undecodable logs (not counted)', summary.undecodableLogs);
  pad('Distinct anchoring transactions', summary.transactions);
  pad('Calldata decoded', summary.decodedTxs);
  if (summary.transactionsWithoutDecodableTarget) pad('Tx without decodable targetId', summary.transactionsWithoutDecodableTarget);
  if (summary.actionMismatches) pad('Action mismatches (checked)', summary.actionMismatches);
  pad('First anchor', summary.firstAnchor ? `block ${summary.firstAnchor.block} · ${summary.firstAnchor.at}` : 'n/a');
  pad('Last anchor', summary.lastAnchor ? `block ${summary.lastAnchor.block} · ${summary.lastAnchor.at}` : 'n/a');
  console.log('');
  console.log('  What the historical targetId values were (events per class):');
  if (!summary.anchorsByClass || Object.keys(summary.anchorsByClass).length === 0) {
    console.log('    (none decoded)');
  } else {
    for (const [label, count] of Object.entries(summary.anchorsByClass)) {
      console.log(`    ${label.padEnd(34)} ${count}`);
    }
  }
  console.log('');
  console.log('  Distinct identifiers published (deduplicated, never listed):');
  pad('    email addresses', summary.distinctTargets.email);
  pad('    MRN / short identifiers', summary.distinctTargets.mrnOrShortId);
  pad('    already hashed (2.6.8+)', summary.distinctTargets.alreadyHashed);
  pad('    other free text', summary.distinctTargets.other);
  pad('    total distinct', summary.distinctTargets.total);
  if (summary.localJoin) {
    const j = summary.localJoin;
    const line = (label, t) => pad(`    ${label}`, `${t.matched} of ${t.published}${t.unmatched ? ` (${t.unmatched} not found)` : ''}`);
    console.log('');
    console.log(`  Join against the local store (read-only, counts only):`);
    pad('    database', j.database);
    pad('    candidate values', `emails ${j.candidateValues.usersEmail} · user ids ${j.candidateValues.usersId} · MRNs ${j.candidateValues.patientMrn}`);
    line('short identifiers resolved', j.shortIdentifiers);
    line('    …as a patient MRN', j.shortIdentifiersAsPatientMrn);
    line('    …as a user account', j.shortIdentifiersAsUserAccount);
    line('email addresses resolved', j.emails);
    line('other free text resolved', j.otherFreeText);
    console.log('');
    pad('    AFFECTED PATIENTS (floor)', j.affectedPatientsFloor);
    console.log('');
    console.log('  Floor, not a total: a short identifier that is a patient MRN counts as');
    console.log('  one patient, but patient emails live inside encrypted kv blobs, so an');
    console.log('  email that matches no user account is unresolvable here. Identifiers');
    console.log('  published for accounts since deleted also cannot match.');
  }
  console.log('');
  console.log('  A reverted transaction publishes calldata but emits no event, so it is');
  console.log('  not in the counts above. Copy the numbers into');
  console.log('  reports/SEPOLIA-DISCLOSURE-ASSESSMENT.md §2 — they are all that moves');
  console.log('  the three [VERIFY] markers.');
  return summary;
}

// Only run when executed as a script — tests import the decoders directly.
const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  main().then(summary => {
    process.exit(summary.events === 0 ? 2 : 0);
  }).catch(err => {
    console.error(`✗ ${err.message}`);
    process.exit(1);
  });
}
