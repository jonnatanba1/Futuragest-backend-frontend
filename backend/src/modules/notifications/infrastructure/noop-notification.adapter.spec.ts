/**
 * Unit spec — NoOpNotificationAdapter
 *
 * Spec: PN-9 — NoOp adapter resolves successfully; never throws.
 */

import { NoOpNotificationAdapter } from './noop-notification.adapter';
import type { NovedadCreatedPayload } from '../domain/notification.port';

describe('NoOpNotificationAdapter', () => {
  let adapter: NoOpNotificationAdapter;

  beforeEach(() => {
    adapter = new NoOpNotificationAdapter();
  });

  it('PN-9 — notifyNovedadCreated resolves without throwing', async () => {
    const payload: NovedadCreatedPayload = {
      novedadId: 'nov-1',
      tipoNovedad: 'HORAS_EXTRA',
      horasExtra: '2.50',
      supervisorId: 'sup-1',
      zoneId: 'zone-1',
    };

    await expect(adapter.notifyNovedadCreated(payload)).resolves.toBeUndefined();
  });

  it('PN-10 — returns void (not null, not a value)', async () => {
    const payload: NovedadCreatedPayload = {
      novedadId: 'nov-2',
      tipoNovedad: 'HORAS_EXTRA',
      horasExtra: '1.00',
      supervisorId: 'sup-2',
      zoneId: 'zone-2',
    };

    const result = await adapter.notifyNovedadCreated(payload);
    expect(result).toBeUndefined();
  });
});
