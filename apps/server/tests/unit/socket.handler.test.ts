import { SocketHandler } from '../../src/presentation/handlers/socket.handler';
import { CreateRoomUseCase } from '../../src/domain/use-cases/create-room.use-case';
import { JoinRoomUseCase } from '../../src/domain/use-cases/join-room.use-case';
import { HandleDisconnectUseCase } from '../../src/domain/use-cases/handle-disconnect.use-case';

type Listener = (...args: unknown[]) => void;

class FakeBroadcast {
  public emitted: Array<{ event: string; payload: unknown }> = [];
  emit(event: string, payload: unknown): void {
    this.emitted.push({ event, payload });
  }
}

class FakeSocket {
  public id: string;
  public joined: string[] = [];
  public emitted: Array<{ event: string; payload: unknown }> = [];
  public broadcasts = new Map<string, FakeBroadcast>();
  private listeners = new Map<string, Listener[]>();

  constructor(id: string) {
    this.id = id;
  }

  on(event: string, cb: Listener): void {
    const list = this.listeners.get(event) ?? [];
    list.push(cb);
    this.listeners.set(event, list);
  }

  emit(event: string, payload: unknown): void {
    this.emitted.push({ event, payload });
  }

  join(roomCode: string): void {
    this.joined.push(roomCode);
  }

  to(roomCode: string): FakeBroadcast {
    let b = this.broadcasts.get(roomCode);
    if (!b) {
      b = new FakeBroadcast();
      this.broadcasts.set(roomCode, b);
    }
    return b;
  }

  fire(event: string, ...args: unknown[]): void {
    for (const cb of this.listeners.get(event) ?? []) cb(...args);
  }
}

class FakeServer {
  private listeners = new Map<string, Listener[]>();

  on(event: string, cb: Listener): void {
    const list = this.listeners.get(event) ?? [];
    list.push(cb);
    this.listeners.set(event, list);
  }

  fire(event: string, ...args: unknown[]): void {
    for (const cb of this.listeners.get(event) ?? []) cb(...args);
  }
}

const buildHandler = () => {
  const createRoom = { execute: jest.fn() } as unknown as jest.Mocked<CreateRoomUseCase>;
  const joinRoom = { execute: jest.fn() } as unknown as jest.Mocked<JoinRoomUseCase>;
  const handleDisconnect = {
    execute: jest.fn(),
  } as unknown as jest.Mocked<HandleDisconnectUseCase>;

  const handler = new SocketHandler(createRoom, joinRoom, handleDisconnect);
  return { handler, createRoom, joinRoom, handleDisconnect };
};

const connect = (handler: SocketHandler, socket: FakeSocket): void => {
  const io = new FakeServer();
  handler.register(io as unknown as Parameters<SocketHandler['register']>[0]);
  io.fire('connection', socket);
};

describe('SocketHandler', () => {
  describe('register', () => {
    it('subscribes to the io connection event', () => {
      const { handler } = buildHandler();
      const io = new FakeServer();
      const onSpy = jest.spyOn(io, 'on');

      handler.register(io as unknown as Parameters<SocketHandler['register']>[0]);

      expect(onSpy).toHaveBeenCalledWith('connection', expect.any(Function));
    });
  });

  describe('create-room', () => {
    it('joins the new room, stores the parent session, and emits room-created', () => {
      const { handler, createRoom } = buildHandler();
      createRoom.execute.mockReturnValue({ roomCode: 'ABC123' });

      const socket = new FakeSocket('parent-1');
      connect(handler, socket);
      socket.fire('create-room');

      expect(createRoom.execute).toHaveBeenCalledWith({ parentPeerId: 'parent-1' });
      expect(socket.joined).toEqual(['ABC123']);
      expect(socket.emitted).toEqual([
        { event: 'room-created', payload: { roomCode: 'ABC123' } },
      ]);
    });
  });

  describe('join-room', () => {
    it('emits room-error and skips room join when join use case fails', () => {
      const { handler, joinRoom } = buildHandler();
      joinRoom.execute.mockReturnValue({ success: false, error: 'Room not found' });

      const socket = new FakeSocket('baby-1');
      connect(handler, socket);
      socket.fire('join-room', { roomCode: 'NOPE99' });

      expect(socket.emitted).toEqual([
        { event: 'room-error', payload: { message: 'Room not found' } },
      ]);
      expect(socket.joined).toEqual([]);
    });

    it('on success: joins the room, broadcasts peer-joined to the parent, and echoes peer-joined to itself', () => {
      const { handler, joinRoom } = buildHandler();
      joinRoom.execute.mockReturnValue({
        success: true,
        data: { peerId: 'baby-1', role: 'baby' },
      });

      const socket = new FakeSocket('baby-1');
      connect(handler, socket);
      socket.fire('join-room', { roomCode: 'ABC123' });

      expect(joinRoom.execute).toHaveBeenCalledWith({
        roomCode: 'ABC123',
        babyPeerId: 'baby-1',
      });
      expect(socket.joined).toEqual(['ABC123']);
      expect(socket.broadcasts.get('ABC123')!.emitted).toEqual([
        { event: 'peer-joined', payload: { peerId: 'baby-1', role: 'baby' } },
      ]);
      expect(socket.emitted).toEqual([
        { event: 'peer-joined', payload: { peerId: 'baby-1', role: 'baby' } },
      ]);
    });
  });

  describe('signal', () => {
    it('relays the payload to the room when a session is registered', () => {
      const { handler, createRoom } = buildHandler();
      createRoom.execute.mockReturnValue({ roomCode: 'ABC123' });

      const socket = new FakeSocket('parent-1');
      connect(handler, socket);
      socket.fire('create-room');

      const offer = { type: 'offer', sdp: 'v=0' };
      socket.fire('signal', offer);

      expect(socket.broadcasts.get('ABC123')!.emitted).toContainEqual({
        event: 'signal',
        payload: offer,
      });
    });

    it('drops the signal silently when the socket has no session', () => {
      const { handler } = buildHandler();
      const socket = new FakeSocket('orphan-1');
      connect(handler, socket);

      expect(() => socket.fire('signal', { type: 'offer', sdp: '' })).not.toThrow();
      expect(socket.broadcasts.size).toBe(0);
    });
  });

  describe('disconnect', () => {
    it('calls the disconnect use case, broadcasts peer-disconnected, and forgets the session', () => {
      const { handler, createRoom, handleDisconnect } = buildHandler();
      createRoom.execute.mockReturnValue({ roomCode: 'ABC123' });
      handleDisconnect.execute.mockReturnValue({
        roomDeleted: false,
        remainingPeerId: 'baby-1',
      });

      const socket = new FakeSocket('parent-1');
      connect(handler, socket);
      socket.fire('create-room');
      socket.fire('disconnect');

      expect(handleDisconnect.execute).toHaveBeenCalledWith({
        roomCode: 'ABC123',
        role: 'parent',
      });
      expect(socket.broadcasts.get('ABC123')!.emitted).toContainEqual({
        event: 'peer-disconnected',
        payload: { peerId: 'parent-1' },
      });

      // Session was removed: a follow-up signal must now be dropped.
      socket.fire('signal', { type: 'offer', sdp: '' });
      expect(socket.broadcasts.get('ABC123')!.emitted).not.toContainEqual({
        event: 'signal',
        payload: expect.any(Object),
      });
    });

    it('is a no-op when the socket never had a session', () => {
      const { handler, handleDisconnect } = buildHandler();
      const socket = new FakeSocket('orphan-1');
      connect(handler, socket);

      socket.fire('disconnect');

      expect(handleDisconnect.execute).not.toHaveBeenCalled();
      expect(socket.broadcasts.size).toBe(0);
    });
  });
});
