/**
 * Reporte PSL contracts — shared types between backend and frontend.
 *
 * Plain TypeScript interfaces; no decorators.
 */

export interface PslReportRowDto {
  compania: string;
  cedula: string;
  concepto: string;
  anio: number;
  periodo: number;
  horasOrdinaria: string; // H.MM format e.g. "5.30"
  tipoHora: string;       // "D"
  diaLaborado: number;    // Excel serial
  tipoMvto: string;       // "NORMA"
  horaInicio: string;     // "HH:MM"
  horaFinal: string;      // "HH:MM"
}

export interface PslReportRequestDto {
  desde: string; // YYYY-MM-DD
  hasta: string; // YYYY-MM-DD
  zoneId?: string;
}
