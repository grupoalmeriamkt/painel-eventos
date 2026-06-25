import { describe, it, expect } from "vitest";
import {
  businessDateKey,
  businessMonthKey,
  businessDayBoundsUtc,
  businessMonthBoundsUtc,
  endOfBusinessDayUtc,
  previousBusinessDateKey,
  eventYear,
} from "./time";

const TZ = "America/Sao_Paulo"; // BRT = UTC-3 (sem horário de verão desde 2019)

describe("time — fuso de negócio", () => {
  it("agrupa por dia no fuso correto, não em UTC", () => {
    // 2026-06-24 02:00 UTC = 2026-06-23 23:00 BRT → ainda é dia 23 no negócio
    expect(businessDateKey("2026-06-24T02:00:00.000Z", TZ)).toBe("2026-06-23");
    // 2026-06-24 03:00 UTC = 2026-06-24 00:00 BRT → vira dia 24
    expect(businessDateKey("2026-06-24T03:00:00.000Z", TZ)).toBe("2026-06-24");
  });

  it("mês de referência no fuso de negócio", () => {
    // 2026-07-01 02:00 UTC = 2026-06-30 23:00 BRT → ainda junho
    expect(businessMonthKey("2026-07-01T02:00:00.000Z", TZ)).toBe("2026-06");
  });

  it("limites UTC do dia de negócio", () => {
    const { startUtc, endUtc } = businessDayBoundsUtc("2026-06-23", TZ);
    expect(startUtc).toBe("2026-06-23T03:00:00.000Z");
    expect(endUtc).toBe("2026-06-24T03:00:00.000Z");
  });

  it("limites UTC do mês de negócio", () => {
    const { startUtc, endUtc } = businessMonthBoundsUtc("2026-06", TZ);
    expect(startUtc).toBe("2026-06-01T03:00:00.000Z");
    expect(endUtc).toBe("2026-07-01T03:00:00.000Z");
  });

  it("as-of do fim do dia de negócio em UTC", () => {
    // 23:59:59.999 BRT do dia 23 = 02:59:59.999 UTC do dia 24
    expect(endOfBusinessDayUtc("2026-06-23", TZ)).toBe("2026-06-24T02:59:59.999Z");
  });

  it("dia de negócio anterior considera o fuso", () => {
    // job roda 00:05 BRT do dia 24 (= 03:05 UTC) → fecha o dia 23
    expect(previousBusinessDateKey("2026-06-24T03:05:00.000Z", TZ)).toBe("2026-06-23");
  });

  it("ano do evento", () => {
    expect(eventYear("2027-03-15")).toBe(2027);
    expect(eventYear(null)).toBeNull();
  });
});
