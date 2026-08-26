import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.oncoconnect.patient',
  appName: 'OncoConnect',
  webDir: 'public',
  server: {
    // The Express server will run on localhost; we proxy to it
    androidScheme: 'https',
    // For local development with the Express server:
    // url: 'http://10.0.2.2:3000', // Android emulator
    // url: 'http://localhost:3000',  // iOS simulator
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0d1117',
      showSpinner: true,
      spinnerColor: '#2563eb',
    },
  },
};

export default config;
