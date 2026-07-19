import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, authApi, compensacionApi, jornadaPolicyApi, orgApi, setUnauthorizedHandler } from './client';
import type { ConfirmPayoutRequest } from '@futuragest/contracts';
import { tokenStore } from '../auth/token-store';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function authHeader(init?: RequestInit): string | undefined {
  return (init?.headers as Record<string, string> | undefined)?.['Authorization'];
}

afterEach(() => {
  tokenStore.clear();
  localStorage.clear();
  vi.restoreAllMocks();
  setUnauthorizedHandler(() => {});
});

describe('authApi.login', () => {
  beforeEach(() => {
    localStorage.setItem('fg.deviceId', 'device-xyz');
  });

  it('POSTs credentials with device info and no Authorization header', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      jsonResponse(200, {
        accessToken: 'a',
        refreshToken: 'r',
        passwordChangeRequired: false,
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await authApi.login({ email: 'u@futuragest.co', password: 'secret' });

    expect(result.accessToken).toBe('a');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/auth/login');
    expect(authHeader(init)).toBeUndefined();
    const sent = JSON.parse(init?.body as string);
    expect(sent).toMatchObject({
      email: 'u@futuragest.co',
      password: 'secret',
      deviceId: 'device-xyz',
    });
    expect(typeof sent.deviceLabel).toBe('string');
  });

  it('throws ApiError with the backend message on 401', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(401, { message: 'Invalid email or password' })));
    await expect(authApi.login({ email: 'x@y.co', password: 'bad' })).rejects.toMatchObject({
      status: 401,
      message: 'Invalid email or password',
    });
  });
});

describe('refresh single-flight on 401', () => {
  beforeEach(() => {
    localStorage.setItem('fg.deviceId', 'device-xyz');
    tokenStore.setSession({ userId: 'user-1', refreshToken: 'refresh-1' });
    tokenStore.setAccessToken('stale-token');
  });

  it('refreshes exactly once for concurrent 401s and retries with the fresh token', async () => {
    let refreshCalls = 0;
    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/auth/refresh')) {
        refreshCalls += 1;
        return jsonResponse(200, { accessToken: 'fresh-token' });
      }
      if (u.includes('/auth/me')) {
        return authHeader(init) === 'Bearer fresh-token'
          ? jsonResponse(200, { id: 'user-1', email: 'u@futuragest.co', role: 'GERENCIA' })
          : jsonResponse(401, { message: 'jwt expired' });
      }
      throw new Error(`unexpected url ${u}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const [a, b] = await Promise.all([authApi.me(), authApi.me()]);

    expect(refreshCalls).toBe(1);
    expect(a).toMatchObject({ id: 'user-1' });
    expect(b).toMatchObject({ id: 'user-1' });
    expect(tokenStore.getAccessToken()).toBe('fresh-token');
  });

  it('clears the session and calls the unauthorized handler when refresh fails', async () => {
    const onUnauth = vi.fn();
    setUnauthorizedHandler(onUnauth);
    const fetchMock = vi.fn(async (url: string | URL) => {
      const u = String(url);
      if (u.includes('/auth/refresh')) return jsonResponse(401, { message: 'revoked' });
      return jsonResponse(401, { message: 'jwt expired' });
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(authApi.me()).rejects.toBeInstanceOf(ApiError);
    expect(onUnauth).toHaveBeenCalledOnce();
    expect(tokenStore.getSession()).toBeNull();
    expect(tokenStore.getAccessToken()).toBeNull();
  });
});

describe('compensacionApi', () => {
  beforeEach(() => {
    tokenStore.setAccessToken('test-token');
  });

  it('getBalance GETs /compensacion/:operarioId with desde & hasta query params', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ operarioId: 'op-1', desde: '2026-05-01', hasta: '2026-05-15', creditosHoras: '3.50', debitosHoras: '1.00', carryIn: '0.00', saldoHoras: '2.50', breakdown: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await compensacionApi.getBalance('op-1', '2026-05-01', '2026-05-15');

    expect(result.saldoHoras).toBe('2.50');
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/compensacion\/op-1\?desde=2026-05-01&hasta=2026-05-15/);
  });

  it('closePeriod POSTs to /compensacion/:operarioId/close', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: 'period-1', periodKey: '2026-05-Q1' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await compensacionApi.closePeriod('op-1', { desde: '2026-05-01', hasta: '2026-05-15' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/compensacion/op-1/close');
    expect(init?.method).toBe('POST');
  });

  it('getPayout GETs /compensacion/:operarioId/payout with periodKey', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ operarioId: 'op-1', periodKey: '2026-05-Q1', saldoHoras: '2.50', horasBase: '2.50', factorRecargo: '1.25', horasPagables: '3.13' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await compensacionApi.getPayout('op-1', '2026-05-Q1');

    expect(result.factorRecargo).toBe('1.25');
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/compensacion/op-1/payout');
    expect(String(url)).toContain('periodKey=2026-05-Q1');
  });

  it('getJornadaPolicies GETs /jornada-policy', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify([{ id: 'pol-1', horasDiarias: '8.00', vigenteDesde: '2026-01-01', createdAt: '' }]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await compensacionApi.getJornadaPolicies();

    expect(result[0].horasDiarias).toBe('8.00');
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/jornada-policy$/);
  });

  describe('getJornadaPolicies filter (T9)', () => {
    function stubPolicies() {
      const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
        new Response(
          JSON.stringify([{ id: 'pol-1', horasDiarias: '8.00', vigenteDesde: '2026-01-01', createdAt: '' }]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
      vi.stubGlobal('fetch', fetchMock);
      return fetchMock;
    }

    it('with no filter issues GET /jornada-policy with no query string', async () => {
      const fetchMock = stubPolicies();
      await compensacionApi.getJornadaPolicies();
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/jornada-policy$/);
    });

    it('with zoneId="zA" issues /jornada-policy?zoneId=zA', async () => {
      const fetchMock = stubPolicies();
      await compensacionApi.getJornadaPolicies({ zoneId: 'zA' });
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/jornada-policy\?zoneId=zA$/);
    });

    it('with zoneId="" issues /jornada-policy?zoneId= (global IS NULL filter)', async () => {
      const fetchMock = stubPolicies();
      await compensacionApi.getJornadaPolicies({ zoneId: '' });
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/jornada-policy\?zoneId=$/);
    });

    it('with zoneId=null issues /jornada-policy?zoneId= (same as empty string)', async () => {
      const fetchMock = stubPolicies();
      await compensacionApi.getJornadaPolicies({ zoneId: null });
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/jornada-policy\?zoneId=$/);
    });

    it('with operarioId="o1" issues /jornada-policy?operarioId=o1', async () => {
      const fetchMock = stubPolicies();
      await compensacionApi.getJornadaPolicies({ operarioId: 'o1' });
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/jornada-policy\?operarioId=o1$/);
    });

    it('with zoneId="zA" and operarioId="o1" issues /jornada-policy?zoneId=zA&operarioId=o1', async () => {
      const fetchMock = stubPolicies();
      await compensacionApi.getJornadaPolicies({ zoneId: 'zA', operarioId: 'o1' });
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/jornada-policy\?zoneId=zA&operarioId=o1$/);
    });

    it('jornadaPolicyApi.list forwards the filter the same way', async () => {
      const fetchMock = stubPolicies();
      await jornadaPolicyApi.list({ zoneId: 'zA', operarioId: 'o1' });
      const [url] = fetchMock.mock.calls[0];
      expect(String(url)).toMatch(/\/jornada-policy\?zoneId=zA&operarioId=o1$/);
    });
  });

  it('confirmPayout POSTs to /compensacion/:operarioId/payout/confirm with body', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          operarioId: 'op-1',
          periodKey: '2026-05-Q1',
          saldoHoras: '2.50',
          horasBase: '2.50',
          factorRecargo: '1.25',
          horasPagables: '3.13',
          paidAt: '2026-06-10T12:00:00.000Z',
          payoutRef: 'ref-uuid-001',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const body: ConfirmPayoutRequest = { periodKey: '2026-05-Q1' };
    const result = await compensacionApi.confirmPayout('op-1', body);

    expect(result.paidAt).toBe('2026-06-10T12:00:00.000Z');
    expect(result.payoutRef).toBe('ref-uuid-001');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/compensacion/op-1/payout/confirm');
    expect(init?.method).toBe('POST');
    const sent = JSON.parse(init?.body as string);
    expect(sent.periodKey).toBe('2026-05-Q1');
  });

  it('createJornadaPolicy POSTs to /jornada-policy', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: 'pol-2', horasDiarias: '7.00', vigenteDesde: '2026-07-01', createdAt: '' }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await compensacionApi.createJornadaPolicy({
      horaInicio: '06:00',
      horaFin: '14:00',
      diasLaborales: [1, 2, 3, 4, 5],
      horasDiarias: 7,
      horasSemanales: 44,
      vigenteDesde: '2026-07-01',
    });

    expect(result.horasDiarias).toBe('7.00');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/jornada-policy$/);
    expect(init?.method).toBe('POST');
  });
});

describe('cold reload', () => {
  it('mints an access token via refresh when only a session exists', async () => {
    localStorage.setItem('fg.deviceId', 'device-xyz');
    tokenStore.setSession({ userId: 'user-1', refreshToken: 'refresh-1' });
    // no access token in memory (simulates a fresh page load)

    const fetchMock = vi.fn(async (url: string | URL, init?: RequestInit) => {
      const u = String(url);
      if (u.includes('/auth/refresh')) return jsonResponse(200, { accessToken: 'minted' });
      if (u.includes('/auth/me') && authHeader(init) === 'Bearer minted') {
        return jsonResponse(200, { id: 'user-1', email: 'u@futuragest.co', role: 'GERENCIA' });
      }
      return jsonResponse(401, { message: 'no token' });
    });
    vi.stubGlobal('fetch', fetchMock);

    const me = await authApi.me();
    expect(me).toMatchObject({ id: 'user-1' });
  });
});

// ---------------------------------------------------------------------------
// orgApi — Área CRUD
// ---------------------------------------------------------------------------

describe('orgApi area endpoints', () => {
  beforeEach(() => {
    tokenStore.setAccessToken('test-token');
  });

  it('listAreas GETs /org/areas and returns an array', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      jsonResponse(200, [
        { id: 'a-1', name: 'Patio Central', horaInicio: '06:00', horaFin: '14:00', zoneId: 'z-1', createdAt: '', updatedAt: '' },
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await orgApi.listAreas();

    expect(result[0].name).toBe('Patio Central');
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/org\/areas$/);
  });

  it('createArea POSTs /org/areas with the body and returns { id }', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      jsonResponse(201, { id: 'a-new' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await orgApi.createArea({
      name: 'Depósito',
      horaInicio: '08:00',
      horaFin: '16:00',
      zoneId: 'z-1',
    });

    expect(result.id).toBe('a-new');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/org\/areas$/);
    expect(init?.method).toBe('POST');
    const sent = JSON.parse(init?.body as string);
    expect(sent).toMatchObject({ name: 'Depósito', horaInicio: '08:00', horaFin: '16:00', zoneId: 'z-1' });
  });

  it('createArea throws ApiError on 409 conflict', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(409, { message: 'Area name already in use in this zone', code: 'AREA_NAME_IN_USE' }),
    ));

    await expect(
      orgApi.createArea({ name: 'Duplicate', horaInicio: '06:00', horaFin: '14:00', zoneId: 'z-1' }),
    ).rejects.toMatchObject({ status: 409, message: 'Area name already in use in this zone' });
  });

  it('updateArea PATCHes /org/areas/:id with partial body and returns AreaResponseDto', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) =>
      jsonResponse(200, { id: 'a-1', name: 'Almacén', horaInicio: '07:00', horaFin: '15:00', zoneId: 'z-1', createdAt: '', updatedAt: '' }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await orgApi.updateArea('a-1', { name: 'Almacén' });

    expect(result.name).toBe('Almacén');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/org/areas/a-1');
    expect(init?.method).toBe('PATCH');
    const sent = JSON.parse(init?.body as string);
    expect(sent).toEqual({ name: 'Almacén' });
  });

  it('updateArea throws ApiError on 404 not found', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(404, { message: 'Area not found', code: 'AREA_NOT_FOUND' }),
    ));

    await expect(
      orgApi.updateArea('nonexistent', { name: 'Nope' }),
    ).rejects.toMatchObject({ status: 404, message: 'Area not found' });
  });

  it('deleteArea DELETEs /org/areas/:id', async () => {
    const fetchMock = vi.fn(async (_url: string | URL, _init?: RequestInit) => new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await orgApi.deleteArea('a-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/org/areas/a-1');
    expect(init?.method).toBe('DELETE');
  });

  it('deleteArea throws ApiError on 409 with dependents', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse(409, { message: 'Area has dependent operarios', code: 'AREA_HAS_DEPENDENTS' }),
    ));

    await expect(orgApi.deleteArea('a-1')).rejects.toMatchObject({
      status: 409,
      message: 'Area has dependent operarios',
    });
  });
});
