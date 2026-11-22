#!/usr/bin/env node
/**
 * offsite-backup.mjs — encrypted, verified second copy of the newest backup.
 *
 * Closes O1's "backups land on one person's PC" gap. It takes the newest file
 * matching a pattern from the backup directory, encrypts it with AES-256-GCM,
 * writes a SHA-256 manifest, copies both to a second destination (local/USB/
 * NFS path or an rclone remote such as Backblaze B2 / Cloudflare R2 / S3), and
 * decrypts the result in memory to prove it round-trips. Old copies are pruned
 * by name (timestamped), so retention is predictable.
 *
 *   # generate the key once, on the backup host (never in the repo)
 *   openssl rand -hex 32 > ~/.veltruvia-offsite.key && chmod 600 ~/.veltruvia-offsite.key
 *
 *   # on the VM, --source is the 02:15 timer's output, not app/backups (which
 *   # only holds veltruvia-boot-* restart snapshots that never change between
 *   # reboots)
 *   node scripts/offsite-backup.mjs --source /home/ubuntu/veltruvia-backups \
 *     --pattern '*.tar.gz' --key-file ~/.veltruvia-offsite.key --dest /mnt/offsite/veltruvia
 *
 *   # include the imaging store (data/images) as a second encrypted archive
 *   node scripts/offsite-backup.mjs --source /home/ubuntu/veltruvia-backups \
 *     --pattern '*.tar.gz' --images /home/ubuntu/veltruvia/app/data/images \
 *     --key-file ~/.veltruvia-offsite.key --dest /mnt/offsite/veltruvia
 *
 *   # same, to an rclone remote (configure the remote once with `rclone config`)
 *   node scripts/offsite-backup.mjs --source <dir> --key-file <key> --rclone b2:veltruvia-offsite/db
 *
 * Images are tarred before encryption, so the archive is one file per run.
 * Databases and image archives are pruned independently (KEEP applies to each).
 *
 *   # restore one archive
 *   node scripts/offsite-backup.mjs --decrypt <archive>.enc --out /tmp/restore --key-file <key>
 *
 * Exit: 0 copied+verified · 1 failure · 2 nothing to do.
 */
import {
  createReadStream, createWriteStream, existsSync, mkdirSync, openSync, closeSync,
  readSync, readdirSync, statSync, unlinkSync, writeFileSync, writeSync, copyFileSync, readFileSync,
} from 'node:fs';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const arg = (name, fallback = null) => {
  const eq = process.argv.find(a => a.startsWith(name + '='));
  if (eq) return eq.slice(name.length + 1) || fallback;
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const flag = name => process.argv.includes(name);

const MAGIC = Buffer.from('VLTB1\n');
const IV_LEN = 12, TAG_LEN = 16;
const HEADER = MAGIC.length + IV_LEN + TAG_LEN;   // 34 bytes

function loadKey() {
  const file = arg('--key-file', process.env.OFFSITE_BACKUP_KEY_FILE);
  const raw = arg('--key', process.env.OFFSITE_BACKUP_KEY);
  let value = raw;
  if (!value && file) {
    if (!existsSync(file)) throw new Error(`key file not found: ${file}`);
    value = readFileSync(file, 'utf8').trim();
  }
  if (!value) throw new Error('no key: pass --key-file (or set OFFSITE_BACKUP_KEY_FILE) — see the header for openssl rand');
  value = value.replace(/^["']|["']$/g, '').trim();
  let key;
  if (/^[0-9a-fA-F]{64}$/.test(value)) key = Buffer.from(value, 'hex');
  else if (/^[A-Za-z0-9+/=]{43,44}$/.test(value)) key = Buffer.from(value, 'base64');
  else if (Buffer.byteLength(value) === 32) key = Buffer.from(value);
  else throw new Error('key must be 64 hex chars, base64 of 32 bytes, or 32 raw bytes');
  if (key.length !== 32) throw new Error(`key must be 32 bytes (got ${key.length})`);
  return key;
}

const sha256File = path => new Promise((res, rej) => {
  const h = createHash('sha256');
  createReadStream(path).on('data', d => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
});

async function encrypt(src, dest, key) {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const hash = createHash('sha256');
  const out = createWriteStream(dest, { mode: 0o600 });
  out.write(Buffer.concat([MAGIC, iv, Buffer.alloc(TAG_LEN)]));
  const rs = createReadStream(src);
  rs.on('data', d => hash.update(d));
  await pipeline(rs, cipher, out);
  const tag = cipher.getAuthTag();
  const fd = openSync(dest, 'r+');
  writeSync(fd, tag, 0, TAG_LEN, MAGIC.length + IV_LEN);   // tag is only known at the end
  closeSync(fd);
  return { sha256: hash.digest('hex'), bytes: statSync(dest).size };
}

async function decrypt(archive, outPath, key) {
  const fd = openSync(archive, 'r');
  const head = Buffer.alloc(HEADER);
  const read = readSync(fd, head, 0, HEADER, 0);
  closeSync(fd);
  if (read !== HEADER || !head.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('not a VELTRUVIA offsite archive (bad magic)');
  const iv = head.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  const tag = head.subarray(MAGIC.length + IV_LEN, HEADER);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  await pipeline(createReadStream(archive, { start: HEADER }), decipher, createWriteStream(outPath, { mode: 0o600 }));
  return { sha256: await sha256File(outPath), bytes: statSync(outPath).size };
}

// ── Restore mode ───────────────────────────────────────────────────
if (flag('--decrypt')) {
  const archive = resolve(arg('--decrypt'));
  const out = resolve(arg('--out', dirname(archive)));
  mkdirSync(out, { recursive: true });
  const target = join(out, basename(archive).replace(/\.enc$/, ''));
  const info = await decrypt(archive, target, loadKey());
  console.log(`✅ decrypted ${archive}\n   → ${target} (${info.bytes} bytes, sha256 ${info.sha256})`);
  process.exit(0);
}

// ── Copy mode ──────────────────────────────────────────────────────
const SOURCE = resolve(arg('--source', process.env.OFFSITE_SOURCE || '/home/ubuntu/veltruvia/app/backups'));
const PATTERN = arg('--pattern', '*.db');
// data/images holds every uploaded study; it is not part of the DB snapshot.
const IMAGES = arg('--images', process.env.OFFSITE_IMAGES);
const DEST = arg('--dest');
const RCLONE = arg('--rclone');
const KEEP = Number(arg('--keep', 12));
const DRY = flag('--dry-run');

if (!DEST && !RCLONE) {
  console.error('❌ pass --dest <dir> or --rclone <remote:path>');
  process.exit(1);
}
if (!existsSync(SOURCE)) {
  console.error(`❌ source directory not found: ${SOURCE}`);
  process.exit(1);
}

const re = new RegExp('^' + PATTERN.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
const candidates = readdirSync(SOURCE)
  .filter(f => re.test(f))
  .map(f => ({ f, path: join(SOURCE, f), mtime: statSync(join(SOURCE, f)).mtimeMs }))
  .sort((a, b) => b.mtime - a.mtime);

if (!candidates.length && !IMAGES) {
  console.error(`[offsite] nothing matching ${PATTERN} in ${SOURCE}`);
  process.exit(2);
}
if (!candidates.length) console.warn(`[offsite] no ${PATTERN} found in ${SOURCE} — shipping images only`);

const newest = candidates[0];
const stamp = new Date(newest.mtime).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const name = `veltruvia-offsite-${stamp}-${basename(newest.f)}`;
const archiveName = `${name}.enc`;
const workDir = resolve(arg('--work', 'reports/offsite'));
mkdirSync(workDir, { recursive: true });
const localArchive = join(workDir, archiveName);
const localManifest = join(workDir, `${archiveName}.json`);

console.log(`[offsite] source   ${newest.path} (${(statSync(newest.path).size / 1024).toFixed(0)} KB)`);
console.log(`[offsite] archive  ${archiveName}`);

if (DRY) {
  console.log('[offsite] dry run — nothing written');
  process.exit(0);
}

const key = loadKey();
const enc = await encrypt(newest.path, localArchive, key);
const manifest = {
  createdAt: new Date().toISOString(),
  archive: archiveName,
  source: { file: basename(newest.f), bytes: statSync(newest.path).size, mtime: new Date(newest.mtime).toISOString() },
  plaintextSha256: enc.sha256,
  archiveBytes: enc.bytes,
  encryption: 'AES-256-GCM',
  version: 'VLTB1',
  host: (await import('node:os')).hostname(),
};
writeFileSync(localManifest, JSON.stringify(manifest, null, 2) + '\n');

// Verify before it leaves the host: authenticated decrypt + sha compare.
const checkPath = join(workDir, `.verify-${process.pid}`);
const back = await decrypt(localArchive, checkPath, key);
unlinkSync(checkPath);
if (back.sha256 !== enc.sha256) {
  console.error(`❌ verification failed: decrypted sha256 ${back.sha256} != ${enc.sha256}`);
  process.exit(1);
}
console.log(`[offsite] verified ${enc.sha256.slice(0, 16)}… (plaintext ${(enc.sha256.length, statSync(newest.path).size)} bytes)`);

// ── Ship it ────────────────────────────────────────────────────────
let listing = [];
if (DEST) {
  const dest = resolve(DEST);
  mkdirSync(dest, { recursive: true });
  copyFileSync(localArchive, join(dest, archiveName));
  copyFileSync(localManifest, join(dest, `${archiveName}.json`));
  listing = readdirSync(dest).filter(f => f.endsWith('.enc'));
  console.log(`[offsite] copied → ${dest}`);
}
if (RCLONE) {
  const remote = RCLONE.replace(/\/+$/, '');
  try {
    execFileSync('rclone', ['copyto', localArchive, `${remote}/${archiveName}`], { stdio: 'inherit' });
    execFileSync('rclone', ['copyto', localManifest, `${remote}/${archiveName}.json`], { stdio: 'inherit' });
    listing = execFileSync('rclone', ['lsf', '--files-only', remote], { encoding: 'utf8' })
      .split('\n').map(s => s.trim()).filter(f => f.endsWith('.enc'));
    console.log(`[offsite] uploaded → ${remote}`);
  } catch (err) {
    console.error(`❌ rclone failed: ${err.message}`);
    process.exit(1);
  }
}

// ── Retention: keep the newest KEEP archives by timestamped name ───
const sorted = listing.sort();                      // name embeds UTC timestamp
const drop = sorted.slice(0, Math.max(0, sorted.length - KEEP));
for (const old of drop) {
  try {
    if (DEST) {
      const dest = resolve(DEST);
      unlinkSync(join(dest, old));
      try { unlinkSync(join(dest, `${old}.json`)); } catch { /* manifest already gone */ }
    }
    if (RCLONE) {
      execFileSync('rclone', ['deletefile', `${RCLONE.replace(/\/+$/, '')}/${old}`]);
      try { execFileSync('rclone', ['deletefile', `${RCLONE.replace(/\/+$/, '')}/${old}.json`]); } catch { /* ignore */ }
    }
    console.log(`[offsite] pruned ${old}`);
  } catch (err) { console.log(`[offsite] could not prune ${old}: ${err.message}`); }
}

console.log(`\n✅ offsite copy verified • ${Math.min(sorted.length, KEEP)} of ${sorted.length} archive(s) retained (keep ${KEEP})`);

// ── Images archive ─────────────────────────────────────────────────
// The nightly DB dump never contains data/images, so an off-box copy of the
// imaging store is a separate, encrypted archive with its own retention.
if (IMAGES) {
  const imagesDir = resolve(IMAGES);
  if (!existsSync(imagesDir)) {
    console.warn(`[offsite] images directory not found: ${imagesDir} — skipped`);
  } else {
    // An empty directory still tars to ~115 bytes, so a byte check alone would
    // report "verified" for a copy that contains no studies at all. Count files.
    const imageFiles = readdirSync(imagesDir, { recursive: true, withFileTypes: true })
      .filter(e => e.isFile()).length;
    const tarName = `.images-${process.pid}.tar.gz`;
    const tarPath = join(workDir, tarName);
    execFileSync('tar', ['-czf', tarPath, '-C', dirname(imagesDir), basename(imagesDir)], { stdio: 'inherit' });
    const tarBytes = statSync(tarPath).size;
    if (!tarBytes || !imageFiles) {
      unlinkSync(tarPath);
      console.warn(`[offsite] ⚠️  images directory holds ${imageFiles} file(s): ${imagesDir} — nothing archived (no uploads yet, or --images points at the wrong store)`);
    } else {
      const imgStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
      const imgArchive = `veltruvia-offsite-images-${imgStamp}.tar.gz.enc`;
      const imgLocal = join(workDir, imgArchive);
      const imgManifest = join(workDir, `${imgArchive}.json`);
      const enc = await encrypt(tarPath, imgLocal, key);
      writeFileSync(imgManifest, JSON.stringify({
        createdAt: new Date().toISOString(),
        archive: imgArchive,
        source: { dir: imagesDir, tarBytes },
        plaintextSha256: enc.sha256,
        archiveBytes: enc.bytes,
        encryption: 'AES-256-GCM',
        version: 'VLTB1',
        host: (await import('node:os')).hostname(),
      }, null, 2) + '\n');

      const verifyPath = join(workDir, `.verify-images-${process.pid}`);
      const back = await decrypt(imgLocal, verifyPath, key);
      unlinkSync(verifyPath);
      if (back.sha256 !== enc.sha256) {
        console.error('❌ images verification failed: decrypted sha256 does not match');
        process.exit(1);
      }
      console.log(`[offsite] verified images ${enc.sha256.slice(0, 16)}… (${(tarBytes / 1024).toFixed(0)} KB tar)`);

      let imgListing = [];
      if (DEST) {
        const dest = resolve(DEST);
        copyFileSync(imgLocal, join(dest, imgArchive));
        copyFileSync(imgManifest, join(dest, `${imgArchive}.json`));
        imgListing = readdirSync(dest).filter(f => f.startsWith('veltruvia-offsite-images-') && f.endsWith('.enc'));
        console.log(`[offsite] copied images → ${dest}`);
      }
      if (RCLONE) {
        const remote = RCLONE.replace(/\/+$/, '');
        try {
          execFileSync('rclone', ['copyto', imgLocal, `${remote}/${imgArchive}`], { stdio: 'inherit' });
          execFileSync('rclone', ['copyto', imgManifest, `${remote}/${imgArchive}.json`], { stdio: 'inherit' });
          imgListing = execFileSync('rclone', ['lsf', '--files-only', remote], { encoding: 'utf8' })
            .split('\n').map(s => s.trim()).filter(f => f.startsWith('veltruvia-offsite-images-') && f.endsWith('.enc'));
          console.log(`[offsite] uploaded images → ${remote}`);
        } catch (err) {
          console.error(`❌ rclone failed for images: ${err.message}`);
          process.exit(1);
        }
      }

      const imgSorted = imgListing.sort();
      for (const old of imgSorted.slice(0, Math.max(0, imgSorted.length - KEEP))) {
        try {
          if (DEST) {
            unlinkSync(join(resolve(DEST), old));
            try { unlinkSync(join(resolve(DEST), `${old}.json`)); } catch {}
          }
          if (RCLONE) {
            execFileSync('rclone', ['deletefile', `${RCLONE.replace(/\/+$/, '')}/${old}`]);
            try { execFileSync('rclone', ['deletefile', `${RCLONE.replace(/\/+$/, '')}/${old}.json`]); } catch {}
          }
          console.log(`[offsite] pruned images ${old}`);
        } catch (err) { console.log(`[offsite] could not prune images ${old}: ${err.message}`); }
      }
      unlinkSync(tarPath);
      console.log(`✅ image archive verified • ${Math.min(imgSorted.length, KEEP)} of ${imgSorted.length} retained (keep ${KEEP})`);
    }
  }
}
