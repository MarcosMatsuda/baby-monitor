// Minimal WebRTC fakes for unit testing the WebRtcPeer adapter.
// Only the surface the adapter actually exercises is implemented.

import { vi } from 'vitest';

export class FakeRtpSender {
  private params: RTCRtpSendParameters = { encodings: [] } as unknown as RTCRtpSendParameters;
  public setParametersError: unknown = null;

  getParameters(): RTCRtpSendParameters {
    return this.params;
  }

  setParameters(p: RTCRtpSendParameters): Promise<void> {
    if (this.setParametersError) {
      const err = this.setParametersError;
      this.setParametersError = null;
      return Promise.reject(err);
    }
    this.params = p;
    return Promise.resolve();
  }

  // Test helpers
  seedEncodings(encodings: RTCRtpEncodingParameters[]): void {
    this.params = { encodings } as unknown as RTCRtpSendParameters;
  }

  currentEncodings(): RTCRtpEncodingParameters[] | undefined {
    return this.params.encodings;
  }
}

export class FakeMediaStreamTrack {
  enabled = true;
  public applyConstraintsError: unknown = null;
  public lastConstraints: MediaTrackConstraints | null = null;

  constructor(public kind: 'audio' | 'video') {}

  applyConstraints(constraints: MediaTrackConstraints): Promise<void> {
    this.lastConstraints = constraints;
    if (this.applyConstraintsError) {
      const err = this.applyConstraintsError;
      this.applyConstraintsError = null;
      return Promise.reject(err);
    }
    return Promise.resolve();
  }
}

export const createFakeStream = (
  audio?: FakeMediaStreamTrack,
  video?: FakeMediaStreamTrack,
): MediaStream => {
  const audioTracks = audio ? [audio] : [];
  const videoTracks = video ? [video] : [];
  return {
    getAudioTracks: () => audioTracks,
    getVideoTracks: () => videoTracks,
  } as unknown as MediaStream;
};

export class FakeDataChannel {
  public sent: string[] = [];
  public closed = false;
  public readyState: RTCDataChannelState = 'open';
  public onmessage: ((event: MessageEvent) => void) | null = null;

  constructor(public label: string) {}

  send(data: string): void {
    if (this.readyState !== 'open') throw new Error('not open');
    this.sent.push(data);
  }

  close(): void {
    this.closed = true;
    this.readyState = 'closed';
  }

  fireMessage(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }
}

export class FakePeerConnection {
  public connectionState: RTCPeerConnectionState = 'new';
  public closed = false;
  public addedTracks: Array<{ track: FakeMediaStreamTrack; stream: MediaStream }> = [];
  public createdChannels: FakeDataChannel[] = [];
  public localDescription: RTCSessionDescriptionInit | null = null;
  public remoteDescriptions: RTCSessionDescriptionInit[] = [];
  public addedCandidates: RTCIceCandidate[] = [];
  public lastConfig: RTCConfiguration | undefined;

  public onicecandidate: ((event: RTCPeerConnectionIceEvent) => void) | null = null;
  public onconnectionstatechange: (() => void) | null = null;
  public ontrack: ((event: RTCTrackEvent) => void) | null = null;

  // Test seam — controls what createOffer returns.
  public nextOffer: RTCSessionDescriptionInit = { type: 'offer', sdp: 'v=0\r\n' };
  public nextSender: FakeRtpSender | null = null;

  constructor(config?: RTCConfiguration) {
    this.lastConfig = config;
  }

  addTrack(track: FakeMediaStreamTrack, stream: MediaStream): FakeRtpSender {
    this.addedTracks.push({ track, stream });
    const sender = this.nextSender ?? new FakeRtpSender();
    this.nextSender = null;
    return sender;
  }

  createDataChannel(label: string): FakeDataChannel {
    const channel = new FakeDataChannel(label);
    this.createdChannels.push(channel);
    return channel;
  }

  createOffer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve(this.nextOffer);
  }

  setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc;
    return Promise.resolve();
  }

  setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescriptions.push(desc);
    return Promise.resolve();
  }

  addIceCandidate(candidate: RTCIceCandidate): Promise<void> {
    this.addedCandidates.push(candidate);
    return Promise.resolve();
  }

  close(): void {
    this.closed = true;
  }

  // Test helpers — drive lifecycle events.
  fireIceCandidate(candidate: RTCIceCandidate | null): void {
    this.onicecandidate?.({ candidate } as RTCPeerConnectionIceEvent);
  }

  setStateAndFire(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.();
  }

  fireTrack(streams: MediaStream[]): void {
    this.ontrack?.({ streams } as unknown as RTCTrackEvent);
  }
}

export interface InstalledRtc {
  peers: FakePeerConnection[];
  /** Last config passed to a newly constructed peer. */
  lastConfig(): RTCConfiguration | undefined;
}

export const installFakeRtc = (): InstalledRtc => {
  const installed: InstalledRtc = {
    peers: [],
    lastConfig() {
      return this.peers[this.peers.length - 1]?.lastConfig;
    },
  };

  class StubPeer {
    constructor(config?: RTCConfiguration) {
      const peer = new FakePeerConnection(config);
      installed.peers.push(peer);
      return peer as unknown as StubPeer;
    }
  }

  class StubSessionDesc {
    type: string;
    sdp: string;
    constructor(init: RTCSessionDescriptionInit) {
      this.type = init.type;
      this.sdp = init.sdp ?? '';
    }
  }

  class StubIceCandidate {
    constructor(public init: RTCIceCandidateInit) {}
    toJSON(): RTCIceCandidateInit {
      return this.init;
    }
  }

  vi.stubGlobal('RTCPeerConnection', StubPeer);
  vi.stubGlobal('RTCSessionDescription', StubSessionDesc);
  vi.stubGlobal('RTCIceCandidate', StubIceCandidate);

  return installed;
};
