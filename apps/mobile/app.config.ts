import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'BabyMonitor',
  slug: 'baby-monitor',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  splash: {
    backgroundColor: '#0c0b0f',
  },
  assetBundlePatterns: ['**/*'],
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.marcos.matsuda.babymonitor',
    infoPlist: {
      UIBackgroundModes: ['audio'],
      NSMicrophoneUsageDescription:
        'Baby Monitor uses the microphone so you can talk to your baby through push-to-talk.',
    },
  },
  android: {
    adaptiveIcon: {
      backgroundColor: '#0c0b0f',
    },
    package: 'com.marcos.matsuda.babymonitor',
    permissions: [
      'RECORD_AUDIO',
      'MODIFY_AUDIO_SETTINGS',
      'FOREGROUND_SERVICE',
      'FOREGROUND_SERVICE_MICROPHONE',
      'WAKE_LOCK',
      'VIBRATE',
      'INTERNET',
      'ACCESS_NETWORK_STATE',
    ],
  },
  plugins: ['expo-audio'],
  owner: 'marcos.matsuda',
  extra: {
    signalingUrl: process.env.SIGNALING_URL || 'http://localhost:3003',
    babyStationUrl: process.env.BABY_STATION_URL || 'http://localhost:5175',
    eas: {
      projectId: '7e7c85ba-34f1-46ad-983e-311883a16515',
    },
  },
});
