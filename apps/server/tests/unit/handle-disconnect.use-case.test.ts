import { HandleDisconnectUseCase } from '../../src/domain/use-cases/handle-disconnect.use-case';
import type { IRoomRepository, RoomEntity } from '@baby-monitor/shared-types';

const mockRepository: jest.Mocked<IRoomRepository> = {
  create: jest.fn(),
  findByCode: jest.fn(),
  addBaby: jest.fn(),
  removePeer: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
};

const room = (overrides: Partial<RoomEntity> = {}): RoomEntity => ({
  code: 'ABC123',
  babyPeerId: null,
  parentPeerId: null,
  createdAt: 0,
  ...overrides,
});

describe('HandleDisconnectUseCase', () => {
  let useCase: HandleDisconnectUseCase;

  beforeEach(() => {
    useCase = new HandleDisconnectUseCase(mockRepository);
  });

  it('reports the room as deleted when it never existed', () => {
    mockRepository.findByCode.mockReturnValue(null);

    const result = useCase.execute({ roomCode: 'GONE99', role: 'parent' });

    expect(result).toEqual({ roomDeleted: true, remainingPeerId: null });
    expect(mockRepository.removePeer).not.toHaveBeenCalled();
    expect(mockRepository.delete).not.toHaveBeenCalled();
  });

  it('removes the disconnecting peer from the room', () => {
    mockRepository.findByCode
      .mockReturnValueOnce(room({ parentPeerId: 'p1', babyPeerId: 'b1' }))
      .mockReturnValueOnce(room({ parentPeerId: null, babyPeerId: 'b1' }));

    useCase.execute({ roomCode: 'ABC123', role: 'parent' });

    expect(mockRepository.removePeer).toHaveBeenCalledWith('ABC123', 'parent');
  });

  it('returns the remaining peer when the other side stays connected', () => {
    mockRepository.findByCode
      .mockReturnValueOnce(room({ parentPeerId: 'p1', babyPeerId: 'b1' }))
      .mockReturnValueOnce(room({ parentPeerId: null, babyPeerId: 'b1' }));

    const result = useCase.execute({ roomCode: 'ABC123', role: 'parent' });

    expect(result).toEqual({ roomDeleted: false, remainingPeerId: 'b1' });
    expect(mockRepository.delete).not.toHaveBeenCalled();
  });

  it('returns the remaining parent when the baby disconnects', () => {
    mockRepository.findByCode
      .mockReturnValueOnce(room({ parentPeerId: 'p1', babyPeerId: 'b1' }))
      .mockReturnValueOnce(room({ parentPeerId: 'p1', babyPeerId: null }));

    const result = useCase.execute({ roomCode: 'ABC123', role: 'baby' });

    expect(mockRepository.removePeer).toHaveBeenCalledWith('ABC123', 'baby');
    expect(result).toEqual({ roomDeleted: false, remainingPeerId: 'p1' });
  });

  it('deletes the room when both peers are gone', () => {
    mockRepository.findByCode
      .mockReturnValueOnce(room({ parentPeerId: 'p1', babyPeerId: null }))
      .mockReturnValueOnce(room({ parentPeerId: null, babyPeerId: null }));

    const result = useCase.execute({ roomCode: 'ABC123', role: 'parent' });

    expect(mockRepository.delete).toHaveBeenCalledWith('ABC123');
    expect(result).toEqual({ roomDeleted: true, remainingPeerId: null });
  });

  it('deletes the room when removePeer leaves the repository without a row', () => {
    mockRepository.findByCode
      .mockReturnValueOnce(room({ parentPeerId: 'p1', babyPeerId: null }))
      .mockReturnValueOnce(null);

    const result = useCase.execute({ roomCode: 'ABC123', role: 'parent' });

    expect(mockRepository.delete).toHaveBeenCalledWith('ABC123');
    expect(result).toEqual({ roomDeleted: true, remainingPeerId: null });
  });
});
