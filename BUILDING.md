# Building & Releasing

## How the exes relate to the source

Each `VELTRUVIA <App>/` folder is a **packaged Electron build** of the shared
backend (`VELTRUVIA Server/resources/app/`), built with electron-builder using
the configs in `resources/app/electron/electron-builder-<app>.json` — one set
per bundle, byte-identical, mirrored by `sync-bundles.mjs`. The builder injects
each app's entry via `extraMetadata.main`:

- `electron-builder-server.json` → `main-server.js`
- `electron-builder-doctor.json` → `main-doctor.js`
- `electron-builder-patient.json` → `main-patient.js`
- `electron-builder-lab.json` → `main-lab.js`

## Editing code

1. Edit **only** `VELTRUVIA Server/resources/app/` (canonical source).
2. Run `npm run sync-bundles` to propagate to the three client bundles
   (each client keeps its own `package.json` main entry automatically).
3. Run `npm run check` (fast gate) and `npm run verify` (full feature sweep, 90 checks × 4 apps).

## Rebuilding the executables

Run electron-builder from the **Server** bundle directory (it has the working
local electron-builder install) and pass each app's config by path — running
npx from the client bundles can resolve a broken cached electron-builder:

**Always pass `--win nsis zip`.** electron-builder builds for the *host* platform
by default, so the same command on Linux quietly produces `AppImage`/`deb` and
no installer at all — `public/downloads/` then gets nothing and the download
page keeps its old version. On a Windows host the flag is harmless; on Linux it
is the difference between a Windows installer and a Linux one.

Paths use forward slashes so the same line works in bash and PowerShell. Do not
copy the `..\..\..\` form from older notes: on Linux that is one long filename
and electron-builder fails with `ENOENT`.

```bash
cd "VELTRUVIA Server/resources/app"
npx electron-builder --win nsis zip --config electron/electron-builder-server.json --publish never
npx electron-builder --win nsis zip --config "../../../VELTRUVIA Doctor/resources/app/electron/electron-builder-doctor.json" --publish never
npx electron-builder --win nsis zip --config "../../../VELTRUVIA Patient/resources/app/electron/electron-builder-patient.json" --publish never
npx electron-builder --win nsis zip --config "../../../VELTRUVIA Lab/resources/app/electron/electron-builder-lab.json" --publish never
```

Two Linux-host caveats: the `linux` target in the configs aborts on `deb` with
`Please specify project homepage` because `package.json` has no `homepage`
field — irrelevant with `--win`, and the reason to build only Windows here. The
`ffmpeg.dll` line of `extraResources` does not exist in a Linux electron
package, so `file source doesn't exist` is expected noise; the Windows build of
electron ships it. If the NSIS step itself stops on the VM, it wants wine
(`sudo apt-get install -y wine64`); build on Windows instead if you would
rather not add it.

Note: all configs write into the same `dist-desktop/` — each build replaces
`win-unpacked/`, so copy/sign each exe before building the next app. The
shippable Windows artifacts are the **NSIS installers** (`Setup <version>.exe`);
the loose `win-unpacked\*.exe` can never run standalone (it needs its sibling
DLLs/paks). Sign installers right after each build (see below).

## Build size & signing

The builder configs exclude dev-only trees (`test/`, `docs/`, `*.md`, `*.map`,
`*.d.ts`, typings and tooling files) from `node_modules` inside the asar, and
set `compression: maximum`. Native modules (`*.node`) are unpacked.

To sign the exes (Windows):

A self-signed placeholder already exists at the repo root
(`veltruvia-codesign.pfx` + `.codesign-pfx-pass`, cert in the current-user
store, thumbprint 41C3FA186F6E35C0A980FD401CC8EB096F03917A). electron-builder
picks it up automatically via CSC_LINK/CSC_KEY_PASSWORD, or sign afterwards:

```powershell
# PowerShell (from VELTRUVIA Server/resources/app/)
$env:CSC_LINK="C:\path\to\cert.pfx"      # or certificateSubjectName via signtool
$env:CSC_KEY_PASSWORD="<pfx password>"
npx electron-builder --config electron/electron-builder-server.json
```

Replace the self-signed cert with a CA-issued (OV/EV) certificate for any
distribution beyond this machine — until then SmartScreen shows
"Unknown publisher" on the installers. Verify with
`Get-AuthenticodeSignature .\dist-desktop\*.exe`.

## Building the mobile APKs (Patient & Lab)

The Android apps wrap the shared web UI. One-time setup (per machine):
JDK 21 (Capacitor 7 requires it — JDK 17 fails with "invalid source release: 21")
+ Android Studio or just the cmdline-tools, then `cd mobile/patient && npm install
&& npx cap add android` (and the same in `mobile/lab`). See `mobile/README.md`.

From the repo root:

```bash
npm run apk:patient                                    # debug APK (no baked server URL)
VELTRUVIA_API_BASE=https://emr.yourclinic.com npm run apk:lab   # bake the cloud server in
npm run apk:patient -- --release                       # release APK (must be signed)
```

Each APK ships ONLY its own portal: the build prunes the other role's HTML/JS,
the desktop-only pages and `patient-pages.js`, and rewrites the PWA manifest
to the app's own name and icons. No emulator URL is ever baked in — leave
`VELTRUVIA_API_BASE` unset and users configure the server in-app (⚙ button).

Output: `mobile/<app>/android/app/build/outputs/apk/<debug|release>/`.

### Signing the APKs (release)

```bash
keytool -genkeypair -v -keystore veltruvia-release.keystore -alias veltruvia \
  -keyalg RSA -keysize 2048 -validity 10000
```

Wire the keystore into each app's `android/app/build.gradle` `signingConfigs.release`
and build with `VELTRUVIA_KEYSTORE_PASSWORD=…` (full snippet in `mobile/README.md`).
Upload the signed `VELTRUVIA Patient.apk` and `VELTRUVIA Lab.apk` to the same
GitHub Releases the exes use — the download page links there.

## Deploying a fresh build to the top-level app folders

The top-level `VELTRUVIA <App>/` folders are **dev-checkout layouts**: the exe
loads `resources/app/` (the canonical, gate-enforced source tree) directly.
An asar-built exe is for **standalone installs only**. When refreshing the
top-level folders:

1. Copy everything from `dist-desktop/win-unpacked/` **except `resources/`**
   (exe, DLLs, paks, `locales/`).
2. Delete the destination `locales/` first — `Copy-Item` merges directories,
   so old locale packs would otherwise survive (locale pruning = ~40 MB).
3. Never delete/rename `resources/app/` in any bundle: check.mjs,
   sync-bundles.mjs, the tests, and the exe itself all depend on it.
4. Launch, then probe `http://127.0.0.1:3000/health` (or the fallback port
   printed in the server window) to confirm the build works.

## Release checklist

- [ ] `npm run check` green (no drift, no await bugs, icons valid)
- [ ] `npm run verify` green (90/90 × 4 apps)
- [ ] Version bumped in all four `resources/app/package.json`
- [ ] No `.exe.new`, `test*.db`, `.demo-admin-password`, or logs in release folders
- [ ] `HOST` unset (or `127.0.0.1`), `VELTRUVIA_DEMO` unset
- [ ] Installer/exe code-signed (if distributing beyond this machine)
- [ ] Server & Doctor exes deployed to the top-level `VELTRUVIA <App>/` folders
      from `dist-desktop/win-unpacked/` (delete destination `locales/` first;
      copy everything **except** `resources/` — see "Deploying a fresh build")
- [ ] Mobile APKs built + signed into `dist/`: `VELTRUVIA Patient.apk`,
      `VELTRUVIA Lab.apk` (toolchain + commands in `mobile/README.md`; on this
      machine JDK 21 + Android SDK already live in `C:\Users\Sara\veltruvia-build-tools\`)
- [ ] APKs + exes uploaded to GitHub Releases (download-page links point there)
- [ ] The same files present in `public/downloads/` — `VELTRUVIA-Server-Setup.exe`,
      `VELTRUVIA-Doctor-Setup.exe`, `VELTRUVIA-Doctor-Portable.zip`,
      `VELTRUVIA-Lab-Setup.exe`, `VELTRUVIA-Lab-Portable.zip`, `VELTRUVIA-Lab.apk`,
      `VELTRUVIA-Patient.apk`. `download.html` links to that directory by name and
      the page 404s on every button when it is missing; binaries are never committed
- [ ] The four updater manifests alongside them — `latest-server.yml`,
      `latest-doctor.yml`, `latest-patient.yml`, `latest-lab.yml`. electron-builder
      names each one after its config's `publish.channel` (`latest-server`, …), so
      they come out of `dist-desktop/` already named. **The download page reads the
      version from these, not from the HTML** (`public/js/artifact-versions.js`):
      copy a manifest and its card shows that version; omit it and the card hides
      its version line entirely. Never hand-edit them
- [ ] `SHA256SUMS.txt` regenerated from the files just copied, in the same directory:
      `cd public/downloads && sha256sum VELTRUVIA-*-Setup.exe VELTRUVIA-*-Portable.zip \
      VELTRUVIA-*.apk > SHA256SUMS.txt && sha256sum -c SHA256SUMS.txt` — every line
      must report `OK`, and the download page's checksum table fills from this file
- [ ] Each manifest's `version:` matches the version the page should advertise —
      `grep -m1 '^version' public/downloads/latest-*.yml` should print the same
      version four times. A page that shows an older version than `/health` is this
      step skipped, not a bug in the page
