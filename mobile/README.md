# VELTRUVIA mobile apps (Patient & Lab)

Native Android wrappers around the existing web portals. The web UI is the
single source (`VELTRUVIA Server/resources/app/public/`); `npm run sync-bundles`
keeps it current, and the APK build copies it into each app's `www/`.

```
mobile/
├── patient/   → com.veltruvia.patient   (APK for patients' phones)
└── lab/       → com.veltruvia.lab       (APK for lab technicians' phones)
```

Both apps talk to the **VELTRUVIA Server** (cloud VM or clinic PC) over HTTPS:
login → Bearer token → all reads/writes go to the server, so everything
patients and labs see is the same data the Doctor app sees.

## One-time setup (per machine)

1. Install **JDK 21** (Capacitor 7 requires Java 21; JDK 17 fails with
   "invalid source release: 21") and the Android SDK (Android Studio, or just
   cmdline-tools + `sdkmanager "platform-tools" "platforms;android-35"
   "build-tools;35.0.0"`).
2. From the repo root:
   ```bash
   cd mobile/patient
   npm install
   npx cap add android
   # repeat for mobile/lab
   ```
3. `local.properties` inside each `android/` folder must point at your SDK
   (Capacitor usually creates it) — do **not** commit it.

### Building on this machine (already set up — no downloads needed)

A portable, user-local toolchain lives at `C:\Users\Sara\veltruvia-build-tools\`
(`jdk-21.0.12.1+1`, `android-sdk` with platform-35/build-tools 35). Build with:

```bash
export JAVA_HOME="C:\\Users\Sara\veltruvia-build-tools\jdk-21.0.12.1+1"
export ANDROID_HOME="C:\\Users\Sara\veltruvia-build-tools\android-sdk"
export VELTRUVIA_KEYSTORE_PASSWORD="$(tr -d '\r\n' < .keystore-pass)"
# android/ is generated, not committed — create it once (step 2 above) if it is
# missing. cmd.exe on this Windows build does not resolve gradlew.bat from the
# current directory, so expand the path before handing it to cmd:
cd mobile/patient
npx cap add android
cd android
cmd //c "%CD%\gradlew.bat assembleRelease"
```

Both release APKs were produced and signature-verified this way; copies sit in
`dist/` at the repo root — build output only, gitignored, never committed.

## Building

```bash
# from the repo root — debug APK for testing:
npm run apk:patient
npm run apk:lab

# point at your cloud server while building:
VELTRUVIA_API_BASE=https://emr.yourclinic.com npm run apk:patient

# release (unsigned until you sign it):
npm run apk:patient -- --release
```

The server address is baked in at build time, but every app also has a ⚙
button (bottom-right) where the user can change it — useful when the clinic
moves servers.

## Signing the release APKs

```bash
keytool -genkeypair -v -keystore veltruvia-release.keystore -alias veltruvia \
  -keyalg RSA -keysize 2048 -validity 10000
```

`mobile/patient/android/app/build.gradle` (and lab's):
```gradle
android {
    signingConfigs {
        release {
            storeFile file(System.getenv("VELTRUVIA_KEYSTORE") ?: "../veltruvia-release.keystore")
            storePassword System.getenv("VELTRUVIA_KEYSTORE_PASSWORD")
            keyAlias "veltruvia"
            keyPassword System.getenv("VELTRUVIA_KEYSTORE_PASSWORD")
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
}
```

Then:
```bash
VELTRUVIA_KEYSTORE_PASSWORD=… npm run apk:patient -- --release
```

Upload both APKs to the GitHub Releases page alongside the Windows exes —
the download page links there.
