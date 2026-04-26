import React from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { RTCView, type MediaStream } from 'react-native-webrtc';
import { useKeepAwake } from 'expo-keep-awake';
import { semantic, spacing, typography, radii } from '@baby-monitor/design-tokens';
import type { ConnectionState, LullabyTrack } from '@baby-monitor/shared-types';
import {
  StatusPill,
  DbMeter,
  ThresholdSlider,
  AlertOverlay,
  BatteryIndicator,
} from '../components';
import { useElapsedTime } from '../hooks/use-elapsed-time.hook';
import { useLastActivity } from '../hooks/use-last-activity.hook';
import { commonStyles } from '../theme';

interface MonitorScreenProps {
  readonly connectionState: ConnectionState;
  readonly connectedAt: number | null;
  readonly currentDb: number;
  readonly threshold: number;
  readonly alertActive: boolean;
  readonly lastNoiseAt: number | null;
  readonly remoteStream: MediaStream | null;
  readonly videoEnabled: boolean;
  readonly canTalk: boolean;
  readonly isTalking: boolean;
  readonly babyBattery: number | null;
  readonly babyCharging: boolean;
  readonly lullabyTrack: LullabyTrack | null;
  readonly onThresholdChange: (value: number) => void;
  readonly onDismissAlert: () => void;
  readonly onToggleVideo: () => void;
  readonly onTalkStart: () => void;
  readonly onTalkStop: () => void;
  readonly onLullabyPlay: (track: LullabyTrack) => void;
  readonly onLullabyStop: () => void;
  readonly onDisconnect: () => void;
}

export function MonitorScreen({
  connectionState,
  connectedAt,
  currentDb,
  threshold,
  alertActive,
  lastNoiseAt,
  remoteStream,
  videoEnabled,
  canTalk,
  isTalking,
  babyBattery,
  babyCharging,
  lullabyTrack,
  onThresholdChange,
  onDismissAlert,
  onToggleVideo,
  onTalkStart,
  onTalkStop,
  onLullabyPlay,
  onLullabyStop,
  onDisconnect,
}: MonitorScreenProps): React.JSX.Element {
  // Keep the screen awake while monitoring so the JS engine stays
  // responsive (alerts + vibration) and the user can glance at the dB
  // meter without unlocking the phone.
  useKeepAwake();

  const elapsed = useElapsedTime(connectedAt);
  const lastActivity = useLastActivity(lastNoiseAt);

  const handleDisconnect = () => {
    Alert.alert(
      'Desconectar',
      'Tem certeza que deseja parar o monitoramento?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Desconectar',
          style: 'destructive',
          onPress: onDisconnect,
        },
      ],
    );
  };

  const showVideo = videoEnabled && remoteStream !== null;

  return (
    <View style={commonStyles.screenContainer}>
      <AlertOverlay visible={alertActive} onDismiss={onDismissAlert} />

      <View style={styles.topBar}>
        <StatusPill state={connectionState} />
        <View style={styles.topBarRight}>
          <BatteryIndicator level={babyBattery} charging={babyCharging} />
          <Text style={styles.timer}>{elapsed}</Text>
        </View>
      </View>

      {showVideo && (
        <View style={styles.videoContainer}>
          <RTCView
            streamURL={(remoteStream as unknown as { toURL: () => string }).toURL()}
            style={styles.video}
            objectFit="cover"
            mirror={false}
          />
        </View>
      )}

      <View style={styles.meterContainer}>
        <DbMeter db={currentDb} />
      </View>

      <View style={styles.activityContainer}>
        <Text style={styles.activityLabel}>{lastActivity}</Text>
      </View>

      <View style={styles.controlsContainer}>
        <ThresholdSlider
          value={threshold}
          onValueChange={onThresholdChange}
        />
      </View>

      <View style={styles.lullabyRow}>
        <LullabyButton
          label="Ruído branco"
          active={lullabyTrack === 'white-noise'}
          onPress={() =>
            lullabyTrack === 'white-noise'
              ? onLullabyStop()
              : onLullabyPlay('white-noise')
          }
        />
        <LullabyButton
          label="Batimento"
          active={lullabyTrack === 'heartbeat'}
          onPress={() =>
            lullabyTrack === 'heartbeat'
              ? onLullabyStop()
              : onLullabyPlay('heartbeat')
          }
        />
      </View>

      <View style={styles.bottomBar}>
        {canTalk && (
          <Pressable
            onPressIn={onTalkStart}
            onPressOut={onTalkStop}
            style={({ pressed }) => [
              styles.talkButton,
              (isTalking || pressed) && styles.talkButtonActive,
            ]}
          >
            <Text
              style={[
                styles.talkButtonText,
                isTalking && styles.talkButtonTextActive,
              ]}
            >
              {isTalking ? 'Transmitindo…' : 'Segurar para falar'}
            </Text>
          </Pressable>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.videoButton,
            videoEnabled && styles.videoButtonActive,
            pressed && styles.pressed,
          ]}
          onPress={onToggleVideo}
        >
          <Text
            style={[
              styles.videoButtonText,
              videoEnabled && styles.videoButtonTextActive,
            ]}
          >
            {videoEnabled ? 'Ocultar câmera' : 'Ver câmera'}
          </Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [
            styles.disconnectButton,
            pressed && styles.pressed,
          ]}
          onPress={handleDisconnect}
        >
          <Text style={styles.disconnectText}>Desconectar</Text>
        </Pressable>
      </View>
    </View>
  );
}

interface LullabyButtonProps {
  readonly label: string;
  readonly active: boolean;
  readonly onPress: () => void;
}

function LullabyButton({ label, active, onPress }: LullabyButtonProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.lullabyButton,
        active && styles.lullabyButtonActive,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.lullabyButtonText,
          active && styles.lullabyButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing[16],
    paddingBottom: spacing[6],
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
  },
  timer: {
    fontFamily: typography.family.mono,
    fontSize: typography.size.sm,
    color: semantic.text.muted,
  },
  videoContainer: {
    aspectRatio: 4 / 3,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: semantic.bg.primary,
    marginBottom: spacing[4],
  },
  video: {
    flex: 1,
  },
  meterContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing[8],
  },
  activityContainer: {
    alignItems: 'center',
    paddingBottom: spacing[6],
  },
  activityLabel: {
    fontSize: typography.size.sm,
    color: semantic.text.muted,
    fontWeight: typography.weight.medium,
  },
  controlsContainer: {
    paddingBottom: spacing[6],
  },
  lullabyRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[3],
    paddingBottom: spacing[6],
  },
  lullabyButton: {
    paddingVertical: spacing[2],
    paddingHorizontal: spacing[5],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: semantic.text.muted,
  },
  lullabyButtonActive: {
    backgroundColor: semantic.text.muted,
  },
  lullabyButtonText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: semantic.text.muted,
  },
  lullabyButtonTextActive: {
    color: semantic.bg.primary,
  },
  bottomBar: {
    alignItems: 'center',
    paddingBottom: spacing[10],
    gap: spacing[3],
  },
  talkButton: {
    paddingVertical: spacing[4],
    paddingHorizontal: spacing[10],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: semantic.status.connected,
    minWidth: 220,
    alignItems: 'center',
  },
  talkButtonActive: {
    backgroundColor: semantic.status.connected,
  },
  talkButtonText: {
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    color: semantic.status.connected,
  },
  talkButtonTextActive: {
    color: semantic.bg.primary,
  },
  videoButton: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[8],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: semantic.text.muted,
  },
  videoButtonActive: {
    borderColor: semantic.status.connected,
  },
  videoButtonText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: semantic.text.muted,
  },
  videoButtonTextActive: {
    color: semantic.status.connected,
  },
  disconnectButton: {
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[8],
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: semantic.status.disconnected,
  },
  disconnectText: {
    fontSize: typography.size.sm,
    fontWeight: typography.weight.medium,
    color: semantic.status.disconnected,
  },
  pressed: {
    opacity: 0.85,
  },
});
