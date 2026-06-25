import { DateTime } from "luxon";
import { BUSINESS_TZ } from "@/lib/time";

export type PeriodPreset = "hoje" | "semana" | "mes" | "ano" | "tudo" | "custom";

export interface ResolvedPeriod {
  preset: PeriodPreset;
  startUtc: string;
  endUtc: string;
  label: string;
  de: string | null; // yyyy-MM-dd (custom)
  ate: string | null;
}

const MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** Resolve preset/de/ate (no fuso de negócio) em limites UTC [start, end). */
export function resolvePeriod(params: {
  periodo?: string | null;
  de?: string | null;
  ate?: string | null;
}): ResolvedPeriod {
  const now = DateTime.now().setZone(BUSINESS_TZ);
  const preset = (params.periodo as PeriodPreset) || "mes";

  let start: DateTime;
  let end: DateTime;
  let label: string;
  let de: string | null = null;
  let ate: string | null = null;

  switch (preset) {
    case "hoje":
      start = now.startOf("day");
      end = start.plus({ days: 1 });
      label = `Hoje · ${now.toFormat("dd/MM")}`;
      break;
    case "semana":
      start = now.startOf("week");
      end = start.plus({ weeks: 1 });
      label = "Esta semana";
      break;
    case "ano":
      start = now.startOf("year");
      end = start.plus({ years: 1 });
      label = String(now.year);
      break;
    case "tudo":
      start = DateTime.fromISO("2015-01-01", { zone: BUSINESS_TZ });
      end = now.plus({ years: 5 });
      label = "Todo o período";
      break;
    case "custom": {
      const d = params.de ? DateTime.fromISO(params.de, { zone: BUSINESS_TZ }) : now.startOf("month");
      const a = params.ate ? DateTime.fromISO(params.ate, { zone: BUSINESS_TZ }) : now;
      start = d.startOf("day");
      end = a.startOf("day").plus({ days: 1 });
      de = start.toFormat("yyyy-MM-dd");
      ate = a.toFormat("yyyy-MM-dd");
      label = `${start.toFormat("dd/MM")} – ${a.toFormat("dd/MM")}`;
      break;
    }
    case "mes":
    default:
      start = now.startOf("month");
      end = start.plus({ months: 1 });
      label = `${MONTHS[now.month - 1]}/${now.year}`;
      break;
  }

  return {
    preset: preset === "custom" ? "custom" : preset,
    startUtc: start.toUTC().toISO()!,
    endUtc: end.toUTC().toISO()!,
    label,
    de,
    ate,
  };
}
