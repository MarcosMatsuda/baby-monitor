// ============================================================
// @baby-monitor/webrtc-config
// Infrastructure constants — ICE servers, codec preferences
// ============================================================

export interface IceServerConfig {
  readonly urls: string | string[];
  readonly username?: string;
  readonly credential?: string;
}

export const ICE_SERVERS: readonly IceServerConfig[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  ...(process.env.TURN_URL
    ? [
        {
          urls: process.env.TURN_URL,
          username: process.env.TURN_USER ?? '',
          credential: process.env.TURN_PASS ?? '',
        },
      ]
    : []),
] as const;

export const WEBRTC_CONFIG = {
  iceServers: ICE_SERVERS as unknown as RTCIceServer[],
} satisfies RTCConfiguration;

export const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    sampleRate: 16000,
  },
  video: false,
};

export const VIDEO_CONSTRAINTS: MediaTrackConstraints = {
  width: { ideal: 320 },
  height: { ideal: 240 },
  frameRate: { ideal: 15, max: 20 },
  facingMode: 'environment',
};

export const MEDIA_CONSTRAINTS: MediaStreamConstraints = {
  audio: AUDIO_CONSTRAINTS.audio,
  video: VIDEO_CONSTRAINTS,
};

// Cap to protect baby-phone battery and cellular uplink.
export const VIDEO_MAX_BITRATE_BPS = 250_000;

export const DATA_CHANNEL_LABEL = 'telemetry';

export const ANALYSER_FFT_SIZE = 2048;

export const SIGNALING_URL =
  process.env.SIGNALING_URL ?? 'http://localhost:3003';
