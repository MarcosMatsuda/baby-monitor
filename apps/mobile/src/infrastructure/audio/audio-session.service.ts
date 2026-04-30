import { setAudioModeAsync } from 'expo-audio';

// Configures the OS audio session so the parent phone keeps playing the
// baby's audio (and stays able to record for talk-back) while the screen
// is locked or the app is in the background. On iOS this combines with
// UIBackgroundModes=['audio'] from Info.plist to keep the AVAudioSession
// active.
export async function enableBackgroundAudio(): Promise<void> {
  await setAudioModeAsync({
    shouldPlayInBackground: true,
    playsInSilentMode: true,
    allowsRecording: true,
    interruptionMode: 'doNotMix',
    shouldRouteThroughEarpiece: false,
  });
}

export async function disableBackgroundAudio(): Promise<void> {
  await setAudioModeAsync({
    shouldPlayInBackground: false,
    playsInSilentMode: false,
    allowsRecording: false,
    interruptionMode: 'mixWithOthers',
    shouldRouteThroughEarpiece: false,
  });
}
