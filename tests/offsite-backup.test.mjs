import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(ROOT, 'scripts', 'offsite-backup.mjs');

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'veltruvia-offsite-'));
  const src = join(dir, 'backups');
  const dest = join(dir, 'offsite');
  const keyFile = join(dir, 'offsite.key');
  const work = join(dir, 'work');
  mkdirSync(src, { recursive: true });
  mkdirSync(dest, { recursive: true });
  writeFileSync(keyFile, randomBytes(32).toString('hex') + '\n', { mode: 0o600 });
  const payload = Buffer.concat([Buffer.from('SQLite format 3\0'), randomBytes(4096)]);
  writeFileSync(join(src, 'chemical-2026-11-21.db'), payload);
  return { dir, src, dest, keyFile, work, payload };
}

const run = (args, opts = {}) => spawnSync(process.execPath, [SCRIPT, ...args], {
  encoding: 'utf8', cwd: opts.cwd || ROOT, ...opts,
});

test('encrypts, verifies, copies and decrypts the newest backup', () => {
  const f = fixture();
  const out = run([
    '--source', f.src, '--key-file', f.keyFile, '--dest', f.dest,
    '--work', f.work, '--keep', '5',
  ]);
  assert.equal(out.status, 0, out.stderr);

  const files = readdirSync(f.dest);
  const archive = files.find(n => n.endsWith('.enc'));
  const manifestFile = files.find(n => n.endsWith('.json'));
  assert.ok(archive, 'archive written');
  assert.ok(manifestFile, 'manifest written');

  const manifest = JSON.parse(readFileSync(join(f.dest, manifestFile), 'utf8'));
  assert.equal(manifest.encryption, 'AES-256-GCM');
  assert.equal(manifest.bytes, undefined);           // size is recorded under archiveBytes
  assert.ok(manifest.archiveBytes > f.payload.length, 'ciphertext is larger than plaintext');

  const restoreDir = join(f.dir, 'restore');
  const back = run(['--decrypt', join(f.dest, archive), '--out', restoreDir, '--key-file', f.keyFile]);
  assert.equal(back.status, 0, back.stderr);

  const restored = readFileSync(join(restoreDir, archive.replace(/\.enc$/, '')));
  assert.deepEqual(restored, f.payload, 'decrypted bytes match the original backup');
});

test('prunes older archives down to the keep count', () => {
  const f = fixture();
  for (const old of ['20000101T000000Z', '20000102T000000Z', '20000103T000000Z']) {
    writeFileSync(join(f.dest, `veltruvia-offsite-${old}-x.db.enc`), 'old');
  }
  const out = run([
    '--source', f.src, '--key-file', f.keyFile, '--dest', f.dest,
    '--work', f.work, '--keep', '2',
  ]);
  assert.equal(out.status, 0, out.stderr);
  const kept = readdirSync(f.dest).filter(n => n.endsWith('.enc'));
  assert.equal(kept.length, 2, `kept ${kept.join(', ')}`);
  assert.ok(kept.some(n => n.includes('20000103T')), `newest old archive survives (${kept.join(', ')})`);
});

test('refuses to run without a destination or with a bad key', () => {
  const f = fixture();
  const noDest = run(['--source', f.src, '--key-file', f.keyFile]);
  assert.equal(noDest.status, 1);

  writeFileSync(f.keyFile, 'too-short\n');
  const badKey = run(['--source', f.src, '--key-file', f.keyFile, '--dest', f.dest, '--work', f.work]);
  assert.equal(badKey.status, 1);
  assert.match(badKey.stderr, /key must be 64 hex chars/);
});

test('warns instead of "verifying" an empty images directory', () => {
  const f = fixture();
  const images = join(f.dir, 'images');
  mkdirSync(images, { recursive: true });
  const out = run([
    '--source', f.src, '--key-file', f.keyFile, '--dest', f.dest,
    '--work', f.work, '--images', images,
  ]);
  assert.equal(out.status, 0, out.stderr);
  assert.match(out.stdout + out.stderr, /images directory holds 0 file\(s\)/);
  assert.equal(readdirSync(f.dest).filter(n => n.includes('images')).length, 0, 'no image archive written');
});

test('exits 2 when nothing matches the pattern', () => {
  const f = fixture();
  const out = run(['--source', f.src, '--pattern', '*.tar.gz', '--key-file', f.keyFile, '--dest', f.dest, '--work', f.work]);
  assert.equal(out.status, 2);
});
