// ============================================================
// @baby-monitor/shared-types
// Domain layer — pure types, zero dependencies
// These types define the contract between all apps.
// ============================================================

// ---- Entities ----

export interface RoomEntity {
  readonly code: string;
  readonly babyPeerId: string | null;
  readonly parentPeerId: string | null;
  readonly createdAt: number;
}

export interface PeerEntity {
  readonly id: string;
  readonly role: PeerRole;
  readonly connectedAt: number;
}

export type PeerRole = 'baby' | 'parent';

export type ConnectionState =
  | 'idle'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected';

export type AlertState = 'idle' | 'triggered' | 'dismissed';

// ---- DTOs ----

export interface CreateRoomDto {}

export interface RoomCreatedDto {
  readonly roomCode: string;
}

export interface JoinRoomDto {
  readonly roomCode: string;
}

export interface PeerJoinedDto {
  readonly peerId: string;
  readonly role: PeerRole;
}

export interface PeerDisconnectedDto {
  readonly peerId: string;
}

export interface RoomErrorDto {
  readonly message: string;
}

export interface SignalDto {
  readonly type: 'offer' | 'answer' | 'ice-candidate';
  readonly sdp?: string;
  readonly candidate?: RTCIceCandidateInit;
}

// ---- DataChannel Messages ----

export type DataChannelMessage =
  | DbLevelMessage
  | StatusMessage
  | PingMessage
  | VideoToggleMessage;

export interface DbLevelMessage {
  readonly type: 'db';
  readonly value: number;
  readonly ts: number;
}

export interface StatusMessage {
  readonly type: 'status';
  readonly battery: number;
  readonly charging: boolean;
  readonly ts: number;
}

export interface PingMessage {
  readonly type: 'ping';
  readonly ts: number;
}

// Parent → baby: turn the video track on/off without renegotiating SDP.
export interface VideoToggleMessage {
  readonly type: 'video-toggle';
  readonly enabled: boolean;
  readonly ts: number;
}

// ---- Socket Event Map ----

export interface IClientToServerEvents {
  'create-room': (data: CreateRoomDto) => void;
  'join-room': (data: JoinRoomDto) => void;
  'signal': (data: SignalDto) => void;
}

export interface IServerToClientEvents {
  'room-created': (data: RoomCreatedDto) => void;
  'peer-joined': (data: PeerJoinedDto) => void;
  'peer-disconnected': (data: PeerDisconnectedDto) => void;
  'room-error': (data: RoomErrorDto) => void;
  'signal': (data: SignalDto) => void;
}

// ---- Repository Interfaces (Dependency Inversion) ----

export interface IRoomRepository {
  create(code: string, parentPeerId: string): RoomEntity;
  findByCode(code: string): RoomEntity | null;
  addBaby(code: string, babyPeerId: string): RoomEntity | null;
  removePeer(code: string, role: PeerRole): void;
  delete(code: string): void;
  count(): number;
}

export interface ISignalingRepository {
  connect(serverUrl: string): Promise<void>;
  disconnect(): void;
  createRoom(): Promise<string>;
  joinRoom(roomCode: string): Promise<void>;
  sendSignal(data: SignalDto): void;
  onPeerJoined(callback: (data: PeerJoinedDto) => void): void;
  onPeerDisconnected(callback: (data: PeerDisconnectedDto) => void): void;
  onSignal(callback: (data: SignalDto) => void): void;
  onRoomError(callback: (data: RoomErrorDto) => void): void;
}

export interface IWebRtcRepository {
  createPeerConnection(): void;
  addAudioTrack(stream: MediaStream): void;
  addVideoTrack(stream: MediaStream): void;
  createOffer(): Promise<string>;
  createAnswer(remoteSdp: string): Promise<string>;
  setRemoteDescription(sdp: string, type: 'offer' | 'answer'): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  onIceCandidate(callback: (candidate: RTCIceCandidateInit) => void): void;
  onTrack(callback: (stream: MediaStream) => void): void;
  onDataChannel(callback: (channel: RTCDataChannel) => void): void;
  createDataChannel(label: string): RTCDataChannel;
  getConnectionState(): RTCPeerConnectionState;
  close(): void;
}

// ---- Constants ----

export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const DB_SEND_INTERVAL_MS = 100;
export const ALERT_WINDOW_SIZE = 10;
export const ALERT_DEBOUNCE_COUNT = 3;
export const ALERT_DISMISS_DELAY_MS = 5000;
export const DEFAULT_THRESHOLD_DB = -35;
export const RECONNECT_TIMEOUT_MS = 60000;
export const ROOM_TTL_MS = 120000;
