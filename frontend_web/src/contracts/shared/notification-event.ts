export interface NovedadCreatedEvent {
  type: 'novedad-created';
  novedadId: string;
  horasExtra: string;
  supervisorId: string;
  zoneId: string;
}
