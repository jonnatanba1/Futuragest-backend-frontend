import type {
  AttendanceDto,
  ClosePeriodRequest,
  CompensationPeriodDto,
  CompensatoryRestDto,
  ConfirmPayoutRequest,
  CreateJornadaPolicyRequest,
  CreateOperarioRequest,
  CreateSurchargeRateRequest,
  EnhancedPeriodBalanceDto,
  HolidayDto,
  ImportResultDto,
  JornadaPolicyDto,
  MeResponse,
  MunicipioResponseDto,
  NovedadDto,
  OperarioDto,
  PeriodBalanceDto,
  PeriodPayoutDto,
  PhotoUrlResponseDto,
  ScheduleCompensatoryRequest,
  SupervisorDto,
  SurchargeRateDto,
  UpdateJornadaPolicyRequest,
  ZoneResponseDto,
} from '@futuragest/contracts';

export type { SupervisorDto };
import { config } from '../../config';
import { getDeviceId, getDeviceLabel } from '../auth/device';
import { tokenStore } from '../auth/token-store';

/**
 * Hand-typed thin HTTP client for the FuturaGest backend.
 *
 * The generated OpenAPI types (packages/contracts/generated/api.ts) are empty
 * stubs — DTOs lack @ApiProperty so Swagger emits `Record<string, never>`.
 * See engram backend/openapi-empty-schemas-pending. Until the backend exposes
 * real schemas we type request/response shapes by hand against the maintained
 * hand-written contracts. Swapping to openapi-fetch later keeps these call sites.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Called when refresh fails — lets the auth layer redirect to /login. */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(handler: () => void): void {
  onUnauthorized = handler;
}

interface RequestOptions {
  body?: unknown;
  /** Attach the bearer token and refresh-on-401. Default true. */
  auth?: boolean;
}

function buildHeaders(token: string | null, hasBody: boolean): HeadersInit {
  const headers: Record<string, string> = {};
  if (hasBody) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function raise(res: Response): Promise<never> {
  let code: string | undefined;
  let message = `Request failed with status ${res.status}`;
  let body: unknown;
  try {
    body = await res.json();
    if (body && typeof body === 'object') {
      const b = body as { message?: unknown; code?: unknown };
      if (typeof b.message === 'string') message = b.message;
      else if (Array.isArray(b.message)) message = b.message.join(', ');
      if (typeof b.code === 'string') code = b.code;
    }
  } catch {
    // non-JSON error body — keep the default message
  }
  throw new ApiError(res.status, message, code, body);
}

// --- Single-flight refresh -------------------------------------------------
// Concurrent 401s must trigger exactly ONE /auth/refresh call; all callers
// await the same promise and retry with the fresh token.
let refreshPromise: Promise<string | null> | null = null;

async function performRefresh(): Promise<string | null> {
  const session = tokenStore.getSession();
  if (!session) return null;
  try {
    const res = await fetch(`${config.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: session.userId,
        deviceId: getDeviceId(),
        refreshToken: session.refreshToken,
      }),
    });
    if (!res.ok) {
      // Refresh token is dead/revoked — full logout.
      tokenStore.clear();
      onUnauthorized();
      return null;
    }
    const data = (await res.json()) as RefreshResponse;
    tokenStore.setAccessToken(data.accessToken);
    return data.accessToken;
  } catch {
    // Network failure during refresh — treat as a failed refresh so callers
    // never hang on a rejected promise; drop to logged-out state.
    tokenStore.clear();
    onUnauthorized();
    return null;
  }
}

function refresh(): Promise<string | null> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const auth = opts.auth ?? true;
  const url = `${config.apiBaseUrl}${path}`;
  const hasBody = opts.body !== undefined;
  const isFormData = opts.body instanceof FormData;
  const send = (token: string | null): Promise<Response> =>
    fetch(url, {
      method,
      // For FormData let the browser set the multipart Content-Type (with boundary).
      headers: buildHeaders(token, hasBody && !isFormData),
      body: hasBody ? (isFormData ? (opts.body as FormData) : JSON.stringify(opts.body)) : undefined,
    });

  let token = auth ? tokenStore.getAccessToken() : null;
  // On a cold reload the access token is gone but a session may exist — mint one.
  if (auth && !token && tokenStore.getSession()) {
    token = await refresh();
    if (!token) throw new ApiError(401, 'Unauthorized');
  }

  let res = await send(token);

  if (res.status === 401 && auth) {
    const fresh = await refresh();
    if (!fresh) {
      throw new ApiError(401, 'Unauthorized');
    }
    res = await send(fresh);
  }

  if (!res.ok) await raise(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- Typed endpoint surface -------------------------------------------------

export interface LoginBody {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  passwordChangeRequired: boolean;
}

export interface RefreshResponse {
  accessToken: string;
}

export interface ChangePasswordBody {
  oldPassword: string;
  newPassword: string;
}

export const authApi = {
  login: (body: LoginBody): Promise<LoginResponse> =>
    request<LoginResponse>('POST', '/auth/login', {
      auth: false,
      body: { ...body, deviceId: getDeviceId(), deviceLabel: getDeviceLabel() },
    }),

  me: (): Promise<MeResponse> => request<MeResponse>('GET', '/auth/me'),

  changePassword: (body: ChangePasswordBody): Promise<{ message: string }> =>
    request<{ message: string }>('POST', '/auth/change-password', { body }),
};

// --- IAM / Org --------------------------------------------------------------

export const iamApi = {
  listOperarios: (opts: { includeInactive?: boolean } = {}): Promise<OperarioDto[]> =>
    request<OperarioDto[]>(
      'GET',
      `/iam/operarios${opts.includeInactive ? '?includeInactive=true' : ''}`,
    ),

  getOperario: (id: string): Promise<OperarioDto> =>
    request<OperarioDto>('GET', `/iam/operarios/${id}`),

  createOperario: (body: CreateOperarioRequest): Promise<{ id: string }> =>
    request<{ id: string }>('POST', '/iam/operarios', { body }),

  deactivateOperario: (id: string): Promise<OperarioDto> =>
    request<OperarioDto>('PATCH', `/iam/operarios/${id}/deactivate`),

  reactivateOperario: (id: string): Promise<OperarioDto> =>
    request<OperarioDto>('PATCH', `/iam/operarios/${id}/reactivate`),

  reassignOperario: (id: string, supervisorId: string): Promise<OperarioDto> =>
    request<OperarioDto>('PATCH', `/iam/operarios/${id}`, { body: { supervisorId } }),

  listSupervisors: (): Promise<SupervisorDto[]> =>
    request<SupervisorDto[]>('GET', '/iam/supervisors'),

  importOperarios: (file: File): Promise<ImportResultDto> => {
    const fd = new FormData();
    fd.append('file', file);
    return request<ImportResultDto>('POST', '/iam/operarios/import', { body: fd });
  },

  createSupervisor: (body: {
    email: string;
    password: string;
    area: string;
    zoneId: string;
    municipioId: string;
  }): Promise<{ id: string }> => request<{ id: string }>('POST', '/iam/supervisors', { body }),
};

export const orgApi = {
  listZones: (): Promise<ZoneResponseDto[]> => request<ZoneResponseDto[]>('GET', '/org/zones'),

  listMunicipios: (): Promise<MunicipioResponseDto[]> =>
    request<MunicipioResponseDto[]>('GET', '/org/municipios'),

  createZone: (body: { name: string }): Promise<{ id: string }> =>
    request<{ id: string }>('POST', '/org/zones', { body }),

  updateZone: (id: string, body: { name: string }): Promise<ZoneResponseDto> =>
    request<ZoneResponseDto>('PATCH', `/org/zones/${id}`, { body }),

  deleteZone: (id: string): Promise<void> => request<void>('DELETE', `/org/zones/${id}`),

  createMunicipio: (body: { name: string; zoneId: string }): Promise<{ id: string }> =>
    request<{ id: string }>('POST', '/org/municipios', { body }),

  updateMunicipio: (
    id: string,
    body: { name?: string; zoneId?: string },
  ): Promise<MunicipioResponseDto> =>
    request<MunicipioResponseDto>('PATCH', `/org/municipios/${id}`, { body }),

  deleteMunicipio: (id: string): Promise<void> =>
    request<void>('DELETE', `/org/municipios/${id}`),

  listUsers: (): Promise<UserListItemDto[]> => request<UserListItemDto[]>('GET', '/org/users'),

  provisionUser: (body: { email: string; password: string; role: string }): Promise<{ id: string }> =>
    request<{ id: string }>('POST', '/org/users', { body }),

  assignCoordinador: (body: { userId: string; zoneId: string }): Promise<void> =>
    request<void>('POST', '/org/coordinadores/assign', { body }),
};

/** User row from GET /org/users (admin). Never includes passwordHash. */
export interface UserListItemDto {
  id: string;
  email: string;
  role: string;
  mustChangePassword: boolean;
  coordinatedZoneId: string | null;
  createdAt: string;
}

export const asistenciaApi = {
  listAttendance: (opts: { since?: string } = {}): Promise<AttendanceDto[]> =>
    request<AttendanceDto[]>(
      'GET',
      `/asistencia${opts.since ? `?since=${encodeURIComponent(opts.since)}` : ''}`,
    ),

  /** Presigned URL for an attendance photo (check-in or check-out). */
  getPhotoUrl: (
    id: string,
    phase: 'checkin' | 'checkout' = 'checkin',
  ): Promise<PhotoUrlResponseDto> =>
    request<PhotoUrlResponseDto>('GET', `/asistencia/${id}/photo?phase=${phase}`),
};

export interface HealthResponse {
  status: string;
  postgres?: string;
  minio?: string;
}

export const healthApi = {
  check: (): Promise<HealthResponse> => request<HealthResponse>('GET', '/health', { auth: false }),
};

// --- Compensación de Horas --------------------------------------------------

export const compensacionApi = {
  /** GET /compensacion/:operarioId?desde=...&hasta=... */
  getBalance: (operarioId: string, desde: string, hasta: string): Promise<PeriodBalanceDto> =>
    request<PeriodBalanceDto>(
      'GET',
      `/compensacion/${operarioId}?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`,
    ),

  /** POST /compensacion/:operarioId/close */
  closePeriod: (operarioId: string, body: ClosePeriodRequest): Promise<CompensationPeriodDto> =>
    request<CompensationPeriodDto>('POST', `/compensacion/${operarioId}/close`, { body }),

  /** GET /compensacion/:operarioId/payout?periodKey=... */
  getPayout: (operarioId: string, periodKey: string): Promise<PeriodPayoutDto> =>
    request<PeriodPayoutDto>(
      'GET',
      `/compensacion/${operarioId}/payout?periodKey=${encodeURIComponent(periodKey)}`,
    ),

  /** POST /compensacion/:operarioId/payout/confirm */
  confirmPayout: (operarioId: string, body: ConfirmPayoutRequest): Promise<PeriodPayoutDto> =>
    request<PeriodPayoutDto>('POST', `/compensacion/${operarioId}/payout/confirm`, { body }),

  /** GET /jornada-policy */
  getJornadaPolicies: (): Promise<JornadaPolicyDto[]> =>
    request<JornadaPolicyDto[]>('GET', '/jornada-policy'),

  /** POST /jornada-policy */
  createJornadaPolicy: (body: CreateJornadaPolicyRequest): Promise<JornadaPolicyDto> =>
    request<JornadaPolicyDto>('POST', '/jornada-policy', { body }),
};

export const novedadesApi = {
  listNovedades: (opts: { since?: string } = {}): Promise<NovedadDto[]> =>
    request<NovedadDto[]>(
      'GET',
      `/novedades${opts.since ? `?since=${encodeURIComponent(opts.since)}` : ''}`,
    ),

  // approve/reject carry no body — all fields are server-derived from the JWT.
  approveNovedad: (id: string): Promise<NovedadDto> =>
    request<NovedadDto>('PATCH', `/novedades/${id}/approve`),

  rejectNovedad: (id: string): Promise<NovedadDto> =>
    request<NovedadDto>('PATCH', `/novedades/${id}/reject`),
};

// --- JornadaPolicy (full CRUD — PR 5) ---------------------------------------

export const jornadaPolicyApi = {
  list: (): Promise<JornadaPolicyDto[]> =>
    request<JornadaPolicyDto[]>('GET', '/jornada-policy'),

  get: (id: string): Promise<JornadaPolicyDto> =>
    request<JornadaPolicyDto>('GET', `/jornada-policy/${id}`),

  create: (body: CreateJornadaPolicyRequest): Promise<JornadaPolicyDto> =>
    request<JornadaPolicyDto>('POST', '/jornada-policy', { body }),

  update: (id: string, body: UpdateJornadaPolicyRequest): Promise<JornadaPolicyDto> =>
    request<JornadaPolicyDto>('PATCH', `/jornada-policy/${id}`, { body }),

  archive: (id: string): Promise<void> =>
    request<void>('DELETE', `/jornada-policy/${id}`),
};

// --- Holidays (PR 5) --------------------------------------------------------

export const holidayApi = {
  listByYear: (year: number): Promise<HolidayDto[]> =>
    request<HolidayDto[]>('GET', `/holidays?year=${year}`),

  generateYear: (year: number): Promise<HolidayDto[]> =>
    request<HolidayDto[]>('POST', `/holidays/generate`, { body: { year } }),

  create: (body: { date: string; name: string }): Promise<HolidayDto> =>
    request<HolidayDto>('POST', '/holidays', { body }),
};

// --- SurchargeRates (PR 5) --------------------------------------------------

export const surchargeRateApi = {
  list: (): Promise<SurchargeRateDto[]> =>
    request<SurchargeRateDto[]>('GET', '/surcharge-rates'),

  create: (body: CreateSurchargeRateRequest): Promise<SurchargeRateDto> =>
    request<SurchargeRateDto>('POST', '/surcharge-rates', { body }),
};

// --- CompensatoryRest (PR 5) ------------------------------------------------

export const compensatoryRestApi = {
  list: (opts: { operarioId?: string; month?: string } = {}): Promise<CompensatoryRestDto[]> => {
    const params = new URLSearchParams();
    if (opts.operarioId) params.set('operarioId', opts.operarioId);
    if (opts.month) params.set('month', opts.month);
    const qs = params.toString();
    return request<CompensatoryRestDto[]>('GET', `/compensatorio${qs ? `?${qs}` : ''}`);
  },

  schedule: (id: string, body: ScheduleCompensatoryRequest): Promise<CompensatoryRestDto> =>
    request<CompensatoryRestDto>('PATCH', `/compensatorio/${id}/schedule`, { body }),
};

// --- Enhanced Balance (PR 5) ------------------------------------------------

export const enhancedBalanceApi = {
  getBalance: (operarioId: string, desde: string, hasta: string): Promise<EnhancedPeriodBalanceDto> =>
    request<EnhancedPeriodBalanceDto>(
      'GET',
      `/compensacion/${operarioId}?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}&enhanced=true`,
    ),
};
