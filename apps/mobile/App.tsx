import React, { useState, useCallback } from 'react';
import { StatusBar } from 'expo-status-bar';
import { View, StyleSheet, Vibration } from 'react-native';
import { mediaDevices, type MediaStream } from 'react-native-webrtc';
import { semantic } from '@baby-monitor/design-tokens';
import type {
  ConnectionState,
  DataChannelMessage,
  LullabyTrack,
} from '@baby-monitor/shared-types';
import { ENV } from './src/infrastructure/config/env';

import { RoleSelectionScreen } from './src/presentation/screens/role-selection.screen';
import { PairingScreen } from './src/presentation/screens/pairing.screen';
import { MonitorScreen } from './src/presentation/screens/monitor.screen';

import { useConnection } from './src/presentation/stores/connection.store';
import { useMonitor } from './src/presentation/stores/monitor.store';

import { SignalingRepository } from './src/infrastructure/signaling/signaling.repository';
import { WebRtcPeerMobile } from './src/infrastructure/webrtc/webrtc-peer-mobile';
import {
  enableBackgroundAudio,
  disableBackgroundAudio,
} from './src/infrastructure/audio/audio-session.service';
import { AlertEngine } from './src/domain/entities/alert-engine.entity';
import { ProcessDbReadingUseCase } from './src/domain/use-cases/process-db-reading.use-case';

type Screen = 'role-selection' | 'pairing' | 'monitor';

const VIBRATION_PATTERN = [200, 100, 200, 100, 400];
const BASE_URL = ENV.BABY_STATION_URL;

// ---- Singletons (created once, survive screen transitions) ----
const signalingRepo = new SignalingRepository();
const alertEngine = new AlertEngine();
const processDbReading = new ProcessDbReadingUseCase(alertEngine);
let webrtcPeer: WebRtcPeerMobile | null = null;
let localAudioStream: MediaStream | null = null;

async function requestMicrophone(): Promise<MediaStream | null> {
  try {
    const stream = await mediaDevices.getUserMedia({ audio: true });
    return stream as unknown as MediaStream;
  } catch {
    // Mic denied — talk-back is disabled, monitoring still works.
    return null;
  }
}

function stopLocalAudio(): void {
  if (localAudioStream) {
    (localAudioStream as any).getTracks?.().forEach((t: any) => t.stop?.());
    localAudioStream = null;
  }
}

export default function App(): React.JSX.Element {
  const [screen, setScreen] = useState<Screen>('role-selection');
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [canTalk, setCanTalk] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [lullabyTrack, setLullabyTrack] = useState<LullabyTrack | null>(null);
  const connection = useConnection();
  const monitor = useMonitor();

  // ---- Handlers ----

  const handleSelectParent = useCallback(async () => {
    try {
      connection.setState('waiting');
      // Activate background-friendly audio session before any track is
      // attached, so iOS keeps playback alive when the screen locks.
      await enableBackgroundAudio().catch(() => {});
      // Request mic permission in parallel with signaling setup so it's ready
      // before the baby station sends its offer.
      const micPromise = requestMicrophone();
      await signalingRepo.connect(ENV.SIGNALING_URL);
      const roomCode = await signalingRepo.createRoom();
      connection.setRoomCode(roomCode);
      localAudioStream = await micPromise;
      setCanTalk(localAudioStream !== null);
      setScreen('pairing');

      // Wire signaling for WebRTC handshake
      signalingRepo.onSignal(async (data) => {
        if (!webrtcPeer) return;

        if (data.type === 'offer' && data.sdp) {
          const answer = await webrtcPeer.handleOffer(data.sdp);
          signalingRepo.sendSignal(answer);
        }

        if (data.type === 'ice-candidate' && data.candidate) {
          await webrtcPeer.addIceCandidate(data.candidate);
        }
      });

      signalingRepo.onPeerJoined(() => {
        // Baby station connected — create WebRTC peer
        webrtcPeer = new WebRtcPeerMobile();

        if (localAudioStream) {
          webrtcPeer.addLocalAudioTrack(localAudioStream);
        }

        webrtcPeer.onConnectionStateChange = (state: string) => {
          const map: Record<string, ConnectionState> = {
            connecting: 'connecting',
            connected: 'connected',
            disconnected: 'reconnecting',
            failed: 'disconnected',
            closed: 'disconnected',
          };
          const mapped = map[state];
          if (mapped) {
            connection.setState(mapped);
            if (mapped === 'connected') setScreen('monitor');
          }
        };

        webrtcPeer.onDataChannelMessage = (msg: DataChannelMessage) => {
          if (msg.type === 'db') {
            monitor.pushReading(msg.value);

            const result = processDbReading.execute({
              value: msg.value,
              ts: msg.ts,
              threshold: monitor.threshold,
            });

            if (result.alertAction === 'trigger') {
              monitor.setAlertState('triggered');
              Vibration.vibrate(VIBRATION_PATTERN, true);
            }

            if (result.alertAction === 'dismiss') {
              monitor.setAlertState('idle');
              Vibration.cancel();
            }
          }

          if (msg.type === 'status') {
            monitor.setBabyStatus(msg.battery, msg.charging);
          }
        };

        webrtcPeer.onIceCandidate = (candidate) => {
          signalingRepo.sendSignal({ type: 'ice-candidate', candidate });
        };

        webrtcPeer.onTrack = (stream) => {
          setRemoteStream(stream);
        };

        connection.setState('connecting');
      });

      signalingRepo.onPeerDisconnected(() => {
        connection.setState('disconnected');
        Vibration.cancel();
        webrtcPeer?.close();
        webrtcPeer = null;
        signalingRepo.disconnect();
        connection.reset();
        monitor.reset();
        alertEngine.reset();
        setRemoteStream(null);
        setVideoEnabled(false);
        setIsTalking(false);
        setCanTalk(false);
        setLullabyTrack(null);
        stopLocalAudio();
        disableBackgroundAudio().catch(() => {});
        setScreen('role-selection');
      });

    } catch {
      connection.setState('disconnected');
      stopLocalAudio();
      setCanTalk(false);
      setLullabyTrack(null);
      disableBackgroundAudio().catch(() => {});
    }
  }, [connection, monitor]);

  const handleSelectBaby = useCallback(() => {
    // Show instructions — in MVP just alert, future: bottom sheet
  }, []);

  const handleBack = useCallback(() => {
    signalingRepo.disconnect();
    connection.reset();
    monitor.reset();
    alertEngine.reset();
    setRemoteStream(null);
    setVideoEnabled(false);
    setIsTalking(false);
    setCanTalk(false);
    setLullabyTrack(null);
    stopLocalAudio();
    disableBackgroundAudio().catch(() => {});
    setScreen('role-selection');
  }, [connection, monitor]);

  const handleDismissAlert = useCallback(() => {
    alertEngine.dismiss();
    monitor.setAlertState('idle');
    Vibration.cancel();
  }, [monitor]);

  const handleToggleVideo = useCallback(() => {
    setVideoEnabled((prev) => {
      const next = !prev;
      webrtcPeer?.sendData({
        type: 'video-toggle',
        enabled: next,
        ts: Date.now(),
      });
      return next;
    });
  }, []);

  const handleTalkStart = useCallback(() => {
    if (!webrtcPeer || !localAudioStream) return;
    webrtcPeer.setMicEnabled(true);
    webrtcPeer.sendData({ type: 'talk-state', talking: true, ts: Date.now() });
    setIsTalking(true);
  }, []);

  const handleTalkStop = useCallback(() => {
    if (!webrtcPeer) return;
    webrtcPeer.setMicEnabled(false);
    webrtcPeer.sendData({ type: 'talk-state', talking: false, ts: Date.now() });
    setIsTalking(false);
  }, []);

  const handleLullabyPlay = useCallback((track: LullabyTrack) => {
    if (!webrtcPeer) return;
    webrtcPeer.sendData({ type: 'play-lullaby', track, ts: Date.now() });
    setLullabyTrack(track);
  }, []);

  const handleLullabyStop = useCallback(() => {
    if (!webrtcPeer) return;
    webrtcPeer.sendData({ type: 'stop-lullaby', ts: Date.now() });
    setLullabyTrack(null);
  }, []);

  const handleDisconnect = useCallback(() => {
    webrtcPeer?.close();
    webrtcPeer = null;
    signalingRepo.disconnect();
    connection.reset();
    monitor.reset();
    alertEngine.reset();
    setRemoteStream(null);
    setVideoEnabled(false);
    setIsTalking(false);
    setCanTalk(false);
    setLullabyTrack(null);
    stopLocalAudio();
    disableBackgroundAudio().catch(() => {});
    setScreen('role-selection');
  }, [connection, monitor]);

  // ---- Render ----

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {screen === 'role-selection' && (
        <RoleSelectionScreen
          onSelectParent={handleSelectParent}
          onSelectBaby={handleSelectBaby}
        />
      )}

      {screen === 'pairing' && connection.roomCode && (
        <PairingScreen
          roomCode={connection.roomCode}
          connectionState={connection.state}
          baseUrl={BASE_URL}
          onBack={handleBack}
        />
      )}

      {screen === 'monitor' && (
        <MonitorScreen
          connectionState={connection.state}
          connectedAt={connection.connectedAt}
          currentDb={monitor.currentDb}
          threshold={monitor.threshold}
          alertActive={monitor.alertState === 'triggered'}
          lastNoiseAt={monitor.lastNoiseAt}
          remoteStream={remoteStream}
          videoEnabled={videoEnabled}
          canTalk={canTalk}
          isTalking={isTalking}
          babyBattery={monitor.babyBattery}
          babyCharging={monitor.babyCharging}
          lullabyTrack={lullabyTrack}
          onThresholdChange={monitor.setThreshold}
          onDismissAlert={handleDismissAlert}
          onToggleVideo={handleToggleVideo}
          onTalkStart={handleTalkStart}
          onTalkStop={handleTalkStop}
          onLullabyPlay={handleLullabyPlay}
          onLullabyStop={handleLullabyStop}
          onDisconnect={handleDisconnect}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: semantic.bg.primary,
  },
});
