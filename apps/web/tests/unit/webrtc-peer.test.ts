import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { WebRtcPeer } from '../../src/infrastructure/webrtc/webrtc-peer';
import {
  FakeDataChannel,
  FakeMediaStreamTrack,
  FakePeerConnection,
  FakeRtpSender,
  createFakeStream,
  installFakeRtc,
  type InstalledRtc,
} from '../helpers/fake-rtc';

describe('WebRtcPeer', () => {
  let rtc: InstalledRtc;
  let peer: WebRtcPeer;
  let pc: FakePeerConnection;

  beforeEach(() => {
    rtc = installFakeRtc();
    peer = new WebRtcPeer();
    pc = rtc.peers[0];
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('construction', () => {
    test('creates an RTCPeerConnection with the project ICE config', () => {
      expect(rtc.peers).toHaveLength(1);
      expect(pc.lastConfig?.iceServers?.length).toBeGreaterThan(0);
    });

    test('wires the three lifecycle event handlers on the underlying connection', () => {
      expect(typeof pc.onicecandidate).toBe('function');
      expect(typeof pc.onconnectionstatechange).toBe('function');
      expect(typeof pc.ontrack).toBe('function');
    });
  });

  describe('ICE candidate forwarding', () => {
    test('invokes onIceCandidate with the candidate JSON', () => {
      const cb = vi.fn();
      peer.onIceCandidate = cb;
      const candidate = { toJSON: () => ({ candidate: 'candidate:1 ...' }) } as RTCIceCandidate;

      pc.fireIceCandidate(candidate);

      expect(cb).toHaveBeenCalledWith({ candidate: 'candidate:1 ...' });
    });

    test('ignores end-of-candidates signal (null candidate)', () => {
      const cb = vi.fn();
      peer.onIceCandidate = cb;
      pc.fireIceCandidate(null);
      expect(cb).not.toHaveBeenCalled();
    });

    test('does not throw when no callback is registered', () => {
      const candidate = { toJSON: () => ({}) } as RTCIceCandidate;
      expect(() => pc.fireIceCandidate(candidate)).not.toThrow();
    });
  });

  describe('connection state forwarding', () => {
    test('forwards every state change through onConnectionStateChange', () => {
      const cb = vi.fn();
      peer.onConnectionStateChange = cb;

      pc.setStateAndFire('connecting');
      pc.setStateAndFire('connected');

      expect(cb).toHaveBeenNthCalledWith(1, 'connecting');
      expect(cb).toHaveBeenNthCalledWith(2, 'connected');
    });

    test('does not throw when no callback is registered', () => {
      expect(() => pc.setStateAndFire('failed')).not.toThrow();
    });
  });

  describe('track forwarding', () => {
    test('invokes onTrack with the first stream from the event', () => {
      const cb = vi.fn();
      peer.onTrack = cb;
      const stream = createFakeStream();
      pc.fireTrack([stream]);
      expect(cb).toHaveBeenCalledWith(stream);
    });

    test('does nothing when the event has no streams', () => {
      const cb = vi.fn();
      peer.onTrack = cb;
      pc.fireTrack([]);
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('addAudioTrack', () => {
    test('extracts the audio track and adds it to the connection', () => {
      const audio = new FakeMediaStreamTrack('audio');
      const stream = createFakeStream(audio);

      peer.addAudioTrack(stream);

      expect(pc.addedTracks).toHaveLength(1);
      expect(pc.addedTracks[0].track).toBe(audio);
      expect(pc.addedTracks[0].stream).toBe(stream);
    });

    test('is a no-op when the stream has no audio tracks', () => {
      peer.addAudioTrack(createFakeStream());
      expect(pc.addedTracks).toHaveLength(0);
    });
  });

  describe('setMicEnabled', () => {
    test('toggles the audio track enabled flag', () => {
      const audio = new FakeMediaStreamTrack('audio');
      peer.addAudioTrack(createFakeStream(audio));

      peer.setMicEnabled(false);
      expect(audio.enabled).toBe(false);

      peer.setMicEnabled(true);
      expect(audio.enabled).toBe(true);
    });

    test('is safe to call before any audio track is added', () => {
      expect(() => peer.setMicEnabled(false)).not.toThrow();
    });
  });

  describe('addVideoTrack', () => {
    test('starts the video track disabled and applies the default bitrate cap', async () => {
      const sender = new FakeRtpSender();
      pc.nextSender = sender;
      const video = new FakeMediaStreamTrack('video');

      peer.addVideoTrack(createFakeStream(undefined, video));
      await Promise.resolve();
      await Promise.resolve();

      expect(video.enabled).toBe(false);
      expect(pc.addedTracks[0].track).toBe(video);
      const encodings = sender.currentEncodings();
      expect(encodings).toHaveLength(1);
      expect(encodings![0].maxBitrate).toBeGreaterThan(0);
    });

    test('is a no-op when the stream has no video tracks', () => {
      peer.addVideoTrack(createFakeStream());
      expect(pc.addedTracks).toHaveLength(0);
    });
  });

  describe('setVideoEnabled', () => {
    test('toggles the video track enabled flag', () => {
      const video = new FakeMediaStreamTrack('video');
      peer.addVideoTrack(createFakeStream(undefined, video));

      peer.setVideoEnabled(true);
      expect(video.enabled).toBe(true);
    });

    test('is safe to call before any video track is added', () => {
      expect(() => peer.setVideoEnabled(true)).not.toThrow();
    });
  });

  describe('setTorchEnabled', () => {
    test('applies a torch constraint to the video track', async () => {
      const video = new FakeMediaStreamTrack('video');
      peer.addVideoTrack(createFakeStream(undefined, video));

      await peer.setTorchEnabled(true);

      expect(video.lastConstraints).toEqual({ advanced: [{ torch: true }] });
    });

    test('swallows errors from unsupported cameras (Safari/iOS, front cam)', async () => {
      const video = new FakeMediaStreamTrack('video');
      video.applyConstraintsError = new Error('OverconstrainedError');
      peer.addVideoTrack(createFakeStream(undefined, video));

      await expect(peer.setTorchEnabled(true)).resolves.toBeUndefined();
    });

    test('is a no-op without a video track', async () => {
      await expect(peer.setTorchEnabled(true)).resolves.toBeUndefined();
    });
  });

  describe('setVideoBitrate', () => {
    test('preserves existing encoding fields and overwrites maxBitrate', async () => {
      const sender = new FakeRtpSender();
      pc.nextSender = sender;
      peer.addVideoTrack(createFakeStream(undefined, new FakeMediaStreamTrack('video')));
      sender.seedEncodings([{ rid: 'h', active: true } as RTCRtpEncodingParameters]);

      await peer.setVideoBitrate(120_000);

      expect(sender.currentEncodings()).toEqual([
        { rid: 'h', active: true, maxBitrate: 120_000 },
      ]);
    });

    test('creates a single encoding entry when none exist yet', async () => {
      const sender = new FakeRtpSender();
      pc.nextSender = sender;
      peer.addVideoTrack(createFakeStream(undefined, new FakeMediaStreamTrack('video')));
      sender.seedEncodings([]);

      await peer.setVideoBitrate(80_000);

      expect(sender.currentEncodings()).toEqual([{ maxBitrate: 80_000 }]);
    });

    test('swallows errors from setParameters (browser rejects mid-negotiation)', async () => {
      const sender = new FakeRtpSender();
      pc.nextSender = sender;
      peer.addVideoTrack(createFakeStream(undefined, new FakeMediaStreamTrack('video')));
      sender.setParametersError = new Error('InvalidStateError');

      await expect(peer.setVideoBitrate(120_000)).resolves.toBeUndefined();
    });

    test('is a no-op without a video sender', async () => {
      await expect(peer.setVideoBitrate(120_000)).resolves.toBeUndefined();
    });
  });

  describe('createDataChannel', () => {
    test('creates a channel with the telemetry label and returns it', () => {
      const channel = peer.createDataChannel();
      expect(pc.createdChannels).toHaveLength(1);
      expect(pc.createdChannels[0].label).toBe('telemetry');
      expect(channel).toBe(pc.createdChannels[0]);
    });

    test('parses incoming JSON messages and forwards them to the callback', () => {
      const cb = vi.fn();
      peer.onDataChannelMessage = cb;
      const channel = peer.createDataChannel() as unknown as FakeDataChannel;

      channel.fireMessage(JSON.stringify({ type: 'db', value: -42 }));

      expect(cb).toHaveBeenCalledWith({ type: 'db', value: -42 });
    });

    test('silently ignores malformed JSON without invoking the callback', () => {
      const cb = vi.fn();
      peer.onDataChannelMessage = cb;
      const channel = peer.createDataChannel() as unknown as FakeDataChannel;

      expect(() => channel.fireMessage('not json {')).not.toThrow();
      expect(cb).not.toHaveBeenCalled();
    });
  });

  describe('SDP exchange', () => {
    test('createOffer creates and sets the local description, returns dto', async () => {
      pc.nextOffer = { type: 'offer', sdp: 'v=0\r\nm=audio\r\n' };

      const dto = await peer.createOffer();

      expect(pc.localDescription).toEqual(pc.nextOffer);
      expect(dto).toEqual({ type: 'offer', sdp: 'v=0\r\nm=audio\r\n' });
    });

    test('handleAnswer wraps the SDP and sets it as remote description', async () => {
      await peer.handleAnswer('v=0\r\na=answer\r\n');

      expect(pc.remoteDescriptions).toHaveLength(1);
      const remote = pc.remoteDescriptions[0] as RTCSessionDescriptionInit;
      expect(remote.type).toBe('answer');
      expect(remote.sdp).toBe('v=0\r\na=answer\r\n');
    });

    test('addIceCandidate wraps the init payload and forwards it to the connection', async () => {
      await peer.addIceCandidate({ candidate: 'candidate:1 udp ...', sdpMLineIndex: 0 });

      expect(pc.addedCandidates).toHaveLength(1);
    });
  });

  describe('sendData', () => {
    test('sends through the data channel when ready', () => {
      const channel = peer.createDataChannel() as unknown as FakeDataChannel;
      channel.readyState = 'open';

      peer.sendData('{"type":"ping"}');

      expect(channel.sent).toEqual(['{"type":"ping"}']);
    });

    test('drops the message silently when the channel is not open', () => {
      const channel = peer.createDataChannel() as unknown as FakeDataChannel;
      channel.readyState = 'connecting';

      expect(() => peer.sendData('{}')).not.toThrow();
      expect(channel.sent).toEqual([]);
    });

    test('drops the message silently when no channel exists', () => {
      expect(() => peer.sendData('{}')).not.toThrow();
    });
  });

  describe('getState', () => {
    test('returns the underlying connection state', () => {
      pc.connectionState = 'connected';
      expect(peer.getState()).toBe('connected');
    });
  });

  describe('close', () => {
    test('closes both the data channel and the peer connection', () => {
      const channel = peer.createDataChannel() as unknown as FakeDataChannel;
      peer.close();
      expect(channel.closed).toBe(true);
      expect(pc.closed).toBe(true);
    });

    test('is safe when no data channel was ever created', () => {
      expect(() => peer.close()).not.toThrow();
      expect(pc.closed).toBe(true);
    });
  });
});
