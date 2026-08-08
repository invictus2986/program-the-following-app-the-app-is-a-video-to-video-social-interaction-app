import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jaiff.app',
  appName: 'Jaiff',
  webDir: 'www',
  server: {
    url: 'https://jaiff.com',
    cleartext: false
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 700,
      launchAutoHide: true,
      launchFadeOutDuration: 600,
      backgroundColor: '#000000',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
      useDialog: false
    }
  }
};

export default config;
