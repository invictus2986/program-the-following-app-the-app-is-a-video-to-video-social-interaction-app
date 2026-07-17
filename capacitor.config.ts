import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jaiff.app',
  appName: 'Jaiff',
  webDir: 'www',
  server: {
    url: 'https://jaiff.com',
    cleartext: false
  }
};

export default config;
