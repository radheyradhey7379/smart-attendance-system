import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.smart.attendance',
  appName: 'Smart Attendance',
  webDir: 'dist',
  server: {
    cleartext: true
  }
};

export default config;
