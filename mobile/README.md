# OncoConnect Patient Mobile App

## How it works

The mobile app wraps the existing patient.html in a native Capacitor shell.
API calls go to a configurable server (default: Vercel deployment).

## Setup

```bash
# Install Capacitor CLI globally (one time)
npm install -g @capacitor/cli

# Add Android platform
npx cap add android

# Sync web assets to native project
npx cap sync

# Open in Android Studio
npx cap open android
```

## Build APK

In Android Studio:
1. Build → Build Bundle(s) / APK(s) → Build APK(s)
2. Output: `android/app/build/outputs/apk/debug/app-debug.apk`

## Configuration

Edit `capacitor.config.ts` to set:
- `server.url` — API server URL (default: Vercel deployment)
- For local development with Express: `http://10.0.2.2:3000` (Android emulator)

## Features

- ✅ Patient login & registration
- ✅ View appointments
- ✅ Book appointments
- ✅ View prescriptions
- ✅ Lab results
- ✅ Video call support
- ✅ Push notifications (when configured)
- ✅ Offline mode (limited)
