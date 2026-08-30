#!/usr/bin/env node
/**
 * build-portable.mjs — Build a single portable .exe for Windows.
 *
 * Fixes the electron-builder symlink extraction issue on Windows without
 * Developer Mode by pre-downloading and pre-extracting the binary caches
 * with macOS symlink entries excluded.
 *
 * Usage:
 *   node scripts/build-portable.mjs
 *   npm run electron:portable
 */

import { execSync, execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SEVENZIP = join(ROOT, "node_modules/7zip-bin/win/x64/7za.exe");
const CACHE = join(
  process.env.LOCALAPPDATA || join(process.env.USERPROFILE, "AppData/Local"),
  "electron-builder/Cache"
);

// ── Binary cache definitions ───────────────────────────────────────
const CACHES = [
  {
    name: "nsis",
    url: "https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z",
    dir: "nsis-3.0.4.1",
  },
  {
    name: "nsis",
    url: "https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-resources-3.4.1/nsis-resources-3.4.1.7z",
    dir: "nsis-resources-3.4.1",
  },
  {
    name: "winCodeSign",
    url: "https://github.com/electron-userland/electron-builder-binaries/releases/download/winCodeSign-2.6.0/winCodeSign-2.6.0.7z",
    dir: "winCodeSign-2.6.0",
  },
];

function log(msg) {
  console.log(`\x1b[36m▸\x1b[0m ${msg}`);
}

function run(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: "inherit" });
}

function downloadAndExtract(cacheGroup, url, targetDir) {
  const cacheDir = join(CACHE, cacheGroup);
  const archiveName = url.split("/").pop();
  const archivePath = join(cacheDir, archiveName);
  const targetPath = join(cacheDir, targetDir);

  if (existsSync(targetPath)) {
    log(`${targetDir} already cached — skipping`);
    return;
  }

  mkdirSync(cacheDir, { recursive: true });

  log(`Downloading ${archiveName}...`);
  execSync(`curl -L -o "${archivePath}" "${url}"`, {
    cwd: ROOT,
    stdio: "inherit",
  });

  log(`Extracting ${targetDir} (skipping macOS symlinks)...`);
  execFileSync(
    SEVENZIP,
    [
      "x",
      "-bd",
      "-y",
      archivePath,
      `-o${targetPath}`,
      "-x!darwin",
      "-x!.DS_Store",
    ],
    { cwd: ROOT, stdio: "inherit" }
  );

  log(`${targetDir} ✓`);
}

// ── Main ───────────────────────────────────────────────────────────
log("Pre-caching electron-builder binaries (skipping macOS symlinks)...");
for (const c of CACHES) {
  downloadAndExtract(c.name, c.url, c.dir);
}

log("Building portable .exe...");
process.env.CSC_IDENTITY_AUTO_DISCOVERY = "false";

const electronBuilder = join(ROOT, "node_modules/.bin/electron-builder");
const builder = existsSync(electronBuilder + ".cmd")
  ? electronBuilder + ".cmd"
  : electronBuilder;

run(
  `"${builder}" --config electron/electron-builder.json --win portable`
);

// Find and report output
const distDir = join(ROOT, "dist-desktop");
const exes = readdirSync(distDir).filter((f) => f.endsWith(".exe"));
if (exes.length > 0) {
  const exe = exes[0];
  const { size } = statSync(join(distDir, exe));
  const mb = (size / 1024 / 1024).toFixed(1);
  log(`\n✅ Portable .exe ready: dist-desktop/${exe} (${mb} MB)`);
} else {
  console.error("❌ Build completed but no .exe found in dist-desktop/");
  process.exit(1);
}
