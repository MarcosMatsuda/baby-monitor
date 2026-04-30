import { HealthHandler } from '../../src/presentation/handlers/health.handler';
import type { IRoomRepository } from '@baby-monitor/shared-types';

const mockRepository: jest.Mocked<IRoomRepository> = {
  create: jest.fn(),
  findByCode: jest.fn(),
  addBaby: jest.fn(),
  removePeer: jest.fn(),
  delete: jest.fn(),
  count: jest.fn(),
};

interface FakeResponse {
  body: unknown;
  json: (payload: unknown) => void;
}

const fakeResponse = (): FakeResponse => {
  const res: FakeResponse = {
    body: null,
    json: (payload) => {
      res.body = payload;
    },
  };
  return res;
};

interface RouteRegistry {
  routes: Map<string, (req: unknown, res: FakeResponse) => void>;
  get(path: string, handler: (req: unknown, res: FakeResponse) => void): void;
}

const fakeRouter = (): RouteRegistry => {
  const routes = new Map<string, (req: unknown, res: FakeResponse) => void>();
  return {
    routes,
    get(path, handler) {
      routes.set(path, handler);
    },
  };
};

describe('HealthHandler', () => {
  let handler: HealthHandler;

  beforeEach(() => {
    handler = new HealthHandler(mockRepository);
  });

  it('registers a GET /health route', () => {
    const router = fakeRouter();
    handler.register(router as unknown as Parameters<HealthHandler['register']>[0]);

    expect(router.routes.has('/health')).toBe(true);
  });

  it('responds with status ok, current room count, and uptime in seconds', () => {
    mockRepository.count.mockReturnValue(3);
    jest.spyOn(process, 'uptime').mockReturnValue(123.7);

    const router = fakeRouter();
    handler.register(router as unknown as Parameters<HealthHandler['register']>[0]);
    const res = fakeResponse();
    router.routes.get('/health')!({}, res);

    expect(res.body).toEqual({ status: 'ok', rooms: 3, uptime: 123 });
  });

  it('reads the current room count on every request (not just once at registration)', () => {
    mockRepository.count.mockReturnValueOnce(0).mockReturnValueOnce(5);
    jest.spyOn(process, 'uptime').mockReturnValue(0);

    const router = fakeRouter();
    handler.register(router as unknown as Parameters<HealthHandler['register']>[0]);
    const route = router.routes.get('/health')!;

    const r1 = fakeResponse();
    route({}, r1);
    const r2 = fakeResponse();
    route({}, r2);

    expect((r1.body as { rooms: number }).rooms).toBe(0);
    expect((r2.body as { rooms: number }).rooms).toBe(5);
  });

});
