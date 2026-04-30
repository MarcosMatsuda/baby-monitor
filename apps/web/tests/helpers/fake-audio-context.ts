// Minimal Web Audio fakes used by audio-capture and lullaby-player
// tests. Only the surface actually exercised by production code is
// implemented. We deliberately keep this small instead of pulling in
// a full AudioContext mock library — every method here maps to a
// real call site, so divergence from the spec is easy to audit.

import { vi } from 'vitest';

export interface FakeNode {
  connections: FakeNode[];
  disconnected: boolean;
  connect(target: FakeNode): void;
  disconnect(): void;
}

const makeNode = (): FakeNode => ({
  connections: [],
  disconnected: false,
  connect(target) {
    this.connections.push(target);
  },
  disconnect() {
    this.disconnected = true;
    this.connections = [];
  },
});

export interface FakeAnalyser extends FakeNode {
  fftSize: number;
  readonly frequencyBinCount: number;
  // Allows tests to drive what getByteFrequencyData fills the buffer with.
  nextFrequencyData: Uint8Array | null;
  getByteFrequencyData(buffer: Uint8Array): void;
}

export const createFakeAnalyser = (): FakeAnalyser => {
  const node = makeNode() as FakeAnalyser;
  node.fftSize = 2048;
  Object.defineProperty(node, 'frequencyBinCount', {
    get(this: FakeAnalyser) {
      return this.fftSize / 2;
    },
  });
  node.nextFrequencyData = null;
  node.getByteFrequencyData = function (buffer: Uint8Array) {
    if (this.nextFrequencyData) {
      buffer.set(this.nextFrequencyData.subarray(0, buffer.length));
    }
  };
  return node;
};

export interface FakeOscillator extends FakeNode {
  type: OscillatorType;
  frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
  started: boolean;
  startedAt: number | null;
  stopped: boolean;
  stoppedAt: number | null;
  onended: (() => void) | null;
  start(when?: number): void;
  stop(when?: number): void;
}

export const createFakeOscillator = (): FakeOscillator => {
  const node = makeNode() as FakeOscillator;
  node.type = 'sine';
  node.frequency = { setValueAtTime: vi.fn() };
  node.started = false;
  node.startedAt = null;
  node.stopped = false;
  node.stoppedAt = null;
  node.onended = null;
  node.start = function (when?: number) {
    this.started = true;
    this.startedAt = when ?? 0;
  };
  node.stop = function (when?: number) {
    if (this.stopped) throw new Error('already stopped');
    this.stopped = true;
    this.stoppedAt = when ?? 0;
  };
  return node;
};

export interface FakeGain extends FakeNode {
  gain: {
    value: number;
    setValueAtTime: ReturnType<typeof vi.fn>;
    linearRampToValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
}

export const createFakeGain = (): FakeGain => {
  const node = makeNode() as FakeGain;
  node.gain = {
    value: 1,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  return node;
};

export interface FakeBuffer {
  numberOfChannels: number;
  length: number;
  sampleRate: number;
  data: Float32Array;
  getChannelData(channel: number): Float32Array;
}

export const createFakeBuffer = (channels: number, length: number, sampleRate: number): FakeBuffer => {
  const data = new Float32Array(length);
  return {
    numberOfChannels: channels,
    length,
    sampleRate,
    data,
    getChannelData() {
      return data;
    },
  };
};

export interface FakeBufferSource extends FakeNode {
  buffer: FakeBuffer | null;
  loop: boolean;
  started: boolean;
  stopped: boolean;
  start(): void;
  stop(): void;
}

export const createFakeBufferSource = (): FakeBufferSource => {
  const node = makeNode() as FakeBufferSource;
  node.buffer = null;
  node.loop = false;
  node.started = false;
  node.stopped = false;
  node.start = function () {
    this.started = true;
  };
  node.stop = function () {
    if (this.stopped) throw new Error('already stopped');
    this.stopped = true;
  };
  return node;
};

export interface FakeAudioContext {
  state: AudioContextState;
  sampleRate: number;
  currentTime: number;
  destination: FakeNode;
  closed: boolean;
  resumed: boolean;
  createdAnalysers: FakeAnalyser[];
  createdSources: FakeNode[];
  createdOscillators: FakeOscillator[];
  createdGains: FakeGain[];
  createdBufferSources: FakeBufferSource[];
  createMediaStreamSource(stream: MediaStream): FakeNode;
  createAnalyser(): FakeAnalyser;
  createOscillator(): FakeOscillator;
  createGain(): FakeGain;
  createBuffer(channels: number, length: number, sampleRate: number): FakeBuffer;
  createBufferSource(): FakeBufferSource;
  close(): Promise<void>;
  resume(): Promise<void>;
}

export const createFakeAudioContext = (): FakeAudioContext => {
  const ctx: FakeAudioContext = {
    state: 'running',
    sampleRate: 48000,
    currentTime: 0,
    destination: makeNode(),
    closed: false,
    resumed: false,
    createdAnalysers: [],
    createdSources: [],
    createdOscillators: [],
    createdGains: [],
    createdBufferSources: [],
    createMediaStreamSource() {
      const node = makeNode();
      this.createdSources.push(node);
      return node;
    },
    createAnalyser() {
      const node = createFakeAnalyser();
      this.createdAnalysers.push(node);
      return node;
    },
    createOscillator() {
      const node = createFakeOscillator();
      this.createdOscillators.push(node);
      return node;
    },
    createGain() {
      const node = createFakeGain();
      this.createdGains.push(node);
      return node;
    },
    createBuffer(channels, length, sampleRate) {
      return createFakeBuffer(channels, length, sampleRate);
    },
    createBufferSource() {
      const node = createFakeBufferSource();
      this.createdBufferSources.push(node);
      return node;
    },
    close() {
      this.closed = true;
      this.state = 'closed';
      return Promise.resolve();
    },
    resume() {
      this.resumed = true;
      if (this.state === 'suspended') this.state = 'running';
      return Promise.resolve();
    },
  };
  return ctx;
};

export interface InstalledAudio {
  contexts: FakeAudioContext[];
}

/**
 * Installs a fake `AudioContext` global. Returns the list of contexts
 * the production code constructs, so tests can assert on lifecycle.
 */
export const installFakeAudioContext = (): InstalledAudio => {
  const installed: InstalledAudio = { contexts: [] };

  class StubAudioContext {
    constructor() {
      const ctx = createFakeAudioContext();
      installed.contexts.push(ctx);
      return ctx as unknown as StubAudioContext;
    }
  }

  vi.stubGlobal('AudioContext', StubAudioContext);
  return installed;
};
