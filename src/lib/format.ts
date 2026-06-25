import { DateTime } from "luxon";

const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const INT = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/** R$ 1.234.567,89 — aceita number, string numérica ou null. */
export function formatBRL(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return BRL.format(n);
}

/** 1.234 */
export function formatInt(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return INT.format(value);
}

/** DD/MM/AAAA a partir de "yyyy-MM-dd" ou ISO. */
export function formatDateBR(value: string | null | undefined): string {
  if (!value) return "—";
  const dt = value.length > 10 ? DateTime.fromISO(value) : DateTime.fromISO(value);
  return dt.isValid ? dt.toFormat("dd/MM/yyyy") : "—";
}

/** DD/MM/AAAA HH:mm no fuso de negócio a partir de um ISO UTC. */
export function formatDateTimeBR(
  utcISO: string | null | undefined,
  tz = "America/Sao_Paulo",
): string {
  if (!utcISO) return "—";
  const dt = DateTime.fromISO(utcISO, { zone: "utc" }).setZone(tz);
  return dt.isValid ? dt.toFormat("dd/MM/yyyy HH:mm") : "—";
}

/** 12,3% */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits).replace(".", ",")}%`;
}
