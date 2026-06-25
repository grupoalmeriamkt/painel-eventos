import { DateTime } from "luxon";

/**
 * Regras de tempo do negócio.
 *
 * - Todos os timestamps são armazenados em UTC no banco.
 * - O fechamento diário e o agrupamento mensal usam o fuso de negócio
 *   (America/Sao_Paulo por padrão). NUNCA agrupe por dia/mês em UTC.
 */

export const BUSINESS_TZ = process.env.BUSINESS_TIMEZONE ?? "America/Sao_Paulo";

/** "2026-06-23" no fuso de negócio para um instante UTC. */
export function businessDateKey(utcISO: string, tz: string = BUSINESS_TZ): string {
  return DateTime.fromISO(utcISO, { zone: "utc" }).setZone(tz).toFormat("yyyy-MM-dd");
}

/** "2026-06" (mês de referência) no fuso de negócio para um instante UTC. */
export function businessMonthKey(utcISO: string, tz: string = BUSINESS_TZ): string {
  return DateTime.fromISO(utcISO, { zone: "utc" }).setZone(tz).toFormat("yyyy-MM");
}

/** Ano do evento a partir de uma data de evento (date-only, sem fuso). */
export function eventYear(eventDate: string | null | undefined): number | null {
  if (!eventDate) return null;
  const dt = DateTime.fromISO(eventDate);
  return dt.isValid ? dt.year : null;
}

/**
 * Limites UTC [início, fim) de um dia de negócio.
 * Ex.: "2026-06-23" → ["2026-06-23T03:00:00Z", "2026-06-24T03:00:00Z") (BRT = UTC-3).
 */
export function businessDayBoundsUtc(
  dateKey: string,
  tz: string = BUSINESS_TZ,
): { startUtc: string; endUtc: string } {
  const start = DateTime.fromISO(dateKey, { zone: tz }).startOf("day");
  const end = start.plus({ days: 1 });
  return {
    startUtc: start.toUTC().toISO()!,
    endUtc: end.toUTC().toISO()!,
  };
}

/** Limites UTC [início, fim) de um mês de negócio ("2026-06"). */
export function businessMonthBoundsUtc(
  monthKey: string,
  tz: string = BUSINESS_TZ,
): { startUtc: string; endUtc: string } {
  const start = DateTime.fromISO(`${monthKey}-01`, { zone: tz }).startOf("month");
  const end = start.plus({ months: 1 });
  return {
    startUtc: start.toUTC().toISO()!,
    endUtc: end.toUTC().toISO()!,
  };
}

/**
 * Instante "as_of" para o snapshot de um dia: 23:59:59.999 daquele dia
 * no fuso de negócio, em UTC. Usado para fotografar o funil ao fim do dia.
 */
export function endOfBusinessDayUtc(dateKey: string, tz: string = BUSINESS_TZ): string {
  return DateTime.fromISO(dateKey, { zone: tz }).endOf("day").toUTC().toISO()!;
}

/** Dia de negócio "ontem" relativo a um instante (default: agora). */
export function previousBusinessDateKey(
  nowUtcISO: string,
  tz: string = BUSINESS_TZ,
): string {
  return DateTime.fromISO(nowUtcISO, { zone: "utc" })
    .setZone(tz)
    .minus({ days: 1 })
    .toFormat("yyyy-MM-dd");
}
