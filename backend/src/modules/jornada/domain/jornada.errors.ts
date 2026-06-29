export class NoPolicyForDateError extends Error {
  readonly httpStatus = 404 as const;

  constructor(operarioId: string | null, zoneId: string | null, dateStr: string) {
    const scope = operarioId
      ? `operario "${operarioId}"`
      : zoneId
        ? `zona "${zoneId}"`
        : 'GLOBAL';
    super(
      `No se encontró una política de jornada laboral vigente para ${scope} en la fecha "${dateStr}".`
    );
    this.name = 'NoPolicyForDateError';
  }
}

export class SurchargeRatesNotConfiguredError extends Error {
  readonly httpStatus = 422 as const;

  constructor(dateStr: string) {
    super(`No se encontraron tasas de recargo configuradas para la fecha "${dateStr}".`);
    this.name = 'SurchargeRatesNotConfiguredError';
  }
}
