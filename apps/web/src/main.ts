// ============================================================
// Baby Station — Composition Root
// Reads room code from URL, wires all layers, starts streaming
// ============================================================

import { AudioCaptureRepository } from './infrastructure/audio/audio-capture.repository';
import { SignalingClient } from './infrastructure/signaling/signaling.client';
import { WebRtcPeer } from './infrastructure/webrtc/webrtc-peer';
import {
  BatteryMonitorRepository,
  type BatterySnapshot,
} from './infrastructure/battery/battery-monitor.repository';
import { WakeLockRepository } from './infrastructure/screen/wake-lock.repository';
import { LullabyPlayerRepository } from './infrastructure/lullaby/lullaby-player.repository';
import { BabyStationUi } from './presentation/components/baby-station.ui';
import { AudioLevel } from './domain/entities/audio-level.entity';
import { Connection } from './domain/entities/connection.entity';
import { SIGNALING_URL } from '@baby-monitor/webrtc-config';
import {
  DB_SEND_INTERVAL_MS,
  STATUS_SEND_INTERVAL_MS,
} from '@baby-monitor/shared-types';
import type {
  ConnectionState,
  StatusMessage,
} from '@baby-monitor/shared-types';
import './presentation/styles/main.css';

class BabyStationApp {
  private readonly audioCapture = new AudioCaptureRepository();
  private readonly signaling = new SignalingClient();
  private readonly webrtc = new WebRtcPeer();
  private readonly ui = new BabyStationUi();
  private readonly connection = new Connection();
  private readonly battery = new BatteryMonitorRepository();
  private readonly wakeLock = new WakeLockRepository();
  private readonly lullaby = new LullabyPlayerRepository();

  private dbInterval: ReturnType<typeof setInterval> | null = null;
  private statusInterval: ReturnType<typeof setInterval> | null = null;

  async start(): Promise<void> {
    const roomCode = this.extractRoomCode();

    if (!roomCode) {
      this.showCodeEntry();
      return;
    }

    this.connection.roomCode = roomCode;
    this.updateState('waiting');

    try {
      await this.signaling.connect(SIGNALING_URL);
      await this.setupMicrophone();
      this.wireSignaling();
      this.wireWebRtc();
      this.setupDisconnect();

      this.signaling.joinRoom(roomCode);
    } catch (error) {
      this.ui.showError(
        error instanceof Error ? error.message : 'Erro ao conectar',
      );
    }
  }

  private extractRoomCode(): string | null {
    const parts = window.location.pathname.split('/');
    const roomIndex = parts.indexOf('room');
    if (roomIndex !== -1 && parts[roomIndex + 1]) {
      return parts[roomIndex + 1].toUpperCase();
    }
    return null;
  }

  private showCodeEntry(): void {
    const input = document.getElementById('code-input') as HTMLInputElement;
    const btn = document.getElementById('code-btn') as HTMLButtonElement;
    const entry = document.getElementById('code-entry') as HTMLElement;

    // Hide elements not relevant for code entry screen
    const status = document.getElementById('status');
    const dbContainer = document.querySelector('.db-container') as HTMLElement;
    const timer = document.getElementById('timer');
    const disconnectBtn = document.getElementById('disconnect-btn');
    if (status) status.style.display = 'none';
    if (dbContainer) dbContainer.style.display = 'none';
    if (timer) timer.style.display = 'none';
    if (disconnectBtn) disconnectBtn.style.display = 'none';

    if (entry) entry.style.display = 'flex';

    btn?.addEventListener('click', () => {
      const code = input?.value.trim().toUpperCase();
      if (code && code.length === 6) {
        window.location.href = `/room/${code}`;
      }
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') btn?.click();
    });
  }

  private async setupMicrophone(): Promise<void> {
    const stream = await this.requestMediaWithFallback();
    this.audioCapture.startAnalyser(stream);
    this.audioCapture.startKeepAlive();
    this.webrtc.addAudioTrack(stream);
    if (stream.getVideoTracks().length > 0) {
      this.webrtc.addVideoTrack(stream);
    }
  }

  private async requestMediaWithFallback(): Promise<MediaStream> {
    try {
      return await this.audioCapture.requestAudioVideo();
    } catch {
      // Camera denied or unavailable — fall back to audio-only.
      return this.audioCapture.requestMicrophone();
    }
  }

  private parentAudioEl: HTMLAudioElement | null = null;

  private attachParentAudio(stream: MediaStream): void {
    if (!this.parentAudioEl) {
      const el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', '');
      el.style.display = 'none';
      document.body.appendChild(el);
      this.parentAudioEl = el;
    }
    this.parentAudioEl.srcObject = stream;
  }

  private detachParentAudio(): void {
    if (this.parentAudioEl) {
      this.parentAudioEl.srcObject = null;
      this.parentAudioEl.remove();
      this.parentAudioEl = null;
    }
  }

  private wireSignaling(): void {
    this.signaling.onPeerJoined(async (data) => {
      if (data.role === 'baby') {
        this.updateState('connecting');
        this.webrtc.createDataChannel();
        this.webrtc.onDataChannelMessage = (msg) => {
          if (msg.type === 'video-toggle') {
            this.webrtc.setVideoEnabled(msg.enabled);
          }
          if (msg.type === 'talk-state') {
            // While parent is talking, mute the baby mic to prevent the
            // parent's voice (playing on the baby speaker) from feeding
            // back into the stream.
            this.webrtc.setMicEnabled(!msg.talking);
          }
          if (msg.type === 'play-lullaby') {
            this.lullaby.play(msg.track);
          }
          if (msg.type === 'stop-lullaby') {
            this.lullaby.stop();
          }
        };
        this.webrtc.onTrack = (stream) => {
          this.attachParentAudio(stream);
        };
        const offer = await this.webrtc.createOffer();
        this.signaling.sendSignal(offer);
        this.startDbStream();
        this.startStatusStream();
        this.wakeLock.acquire().catch(() => {});
      }
    });

    this.signaling.onSignal(async (data) => {
      if (data.type === 'answer' && data.sdp) {
        await this.webrtc.handleAnswer(data.sdp);
      }
      if (data.type === 'ice-candidate' && data.candidate) {
        await this.webrtc.addIceCandidate(data.candidate);
      }
    });

    this.signaling.onPeerDisconnected(() => {
      this.updateState('disconnected');
      this.stopDbStream();
      this.stopStatusStream();
      this.lullaby.stop();
      this.wakeLock.release().catch(() => {});
    });

    this.signaling.onRoomError((data) => {
      this.ui.showError(data.message);
    });
  }

  private wireWebRtc(): void {
    this.webrtc.onIceCandidate = (candidate) => {
      this.signaling.sendSignal({ type: 'ice-candidate', candidate });
    };

    this.webrtc.onConnectionStateChange = (state) => {
      const stateMap: Record<string, ConnectionState> = {
        connecting: 'connecting',
        connected: 'connected',
        disconnected: 'reconnecting',
        failed: 'disconnected',
        closed: 'disconnected',
      };
      const mapped = stateMap[state];
      if (mapped) this.updateState(mapped);
    };
  }

  private startDbStream(): void {
    this.dbInterval = setInterval(() => {
      const db = this.audioCapture.getDbLevel();
      const level = new AudioLevel(db);
      this.webrtc.sendData(level.toJson());
      this.ui.updateDbLevel(db);
    }, DB_SEND_INTERVAL_MS);
  }

  private stopDbStream(): void {
    if (this.dbInterval) {
      clearInterval(this.dbInterval);
      this.dbInterval = null;
    }
  }

  private async startStatusStream(): Promise<void> {
    const supported = await this.battery.start((snapshot) => {
      this.sendStatus(snapshot);
    });
    if (!supported) return;

    const initial = this.battery.getSnapshot();
    if (initial) this.sendStatus(initial);

    this.statusInterval = setInterval(() => {
      const snap = this.battery.getSnapshot();
      if (snap) this.sendStatus(snap);
    }, STATUS_SEND_INTERVAL_MS);
  }

  private stopStatusStream(): void {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
      this.statusInterval = null;
    }
    this.battery.stop();
  }

  private sendStatus(snapshot: BatterySnapshot): void {
    const msg: StatusMessage = {
      type: 'status',
      battery: snapshot.level,
      charging: snapshot.charging,
      ts: Date.now(),
    };
    this.webrtc.sendData(JSON.stringify(msg));
  }

  private setupDisconnect(): void {
    this.ui.onDisconnect(() => {
      this.stopDbStream();
      this.stopStatusStream();
      this.audioCapture.stopKeepAlive();
      this.audioCapture.stopAnalyser();
      this.detachParentAudio();
      this.lullaby.dispose();
      this.wakeLock.release().catch(() => {});
      this.webrtc.close();
      this.signaling.disconnect();
      this.updateState('disconnected');
      // Redirect to code entry screen
      window.location.href = '/';
    });
  }

  private updateState(state: ConnectionState): void {
    this.connection.transition(state);
    this.ui.setConnectionState(state);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const app = new BabyStationApp();
  app.start();
});
