import { describe, it, expect } from "vitest";
import { resolveStateAsOf, computeDailySnapshot } from "./snapshot";
import { DEFAULT_ACTIVE_PIPELINE, DEFAULT_TOTAL_PIPELINE } from "./categories";
import type { CalcConfig, LeadMeta, StageTransition } from "./types";

const config: CalcConfig = {
  totalPipelineCategories: DEFAULT_TOTAL_PIPELINE,
  activePipelineCategories: DEFAULT_ACTIVE_PIPELINE,
  historicalValueMethodology: "at_stage_entry",
};

const U = "11111111-1111-1111-1111-111111111111";

function lead(id: string, over: Partial<LeadMeta> = {}): LeadMeta {
  return {
    leadId: id,
    currentCategory: null,
    currentUnitId: U,
    currentValue: 0,
    currentEventDate: null,
    leadSource: null,
    responsibleUserId: null,
    createdAtKommo: "2026-06-01T00:00:00.000Z",
    deletedAtKommo: null,
    ...over,
  };
}

function tr(
  leadId: string,
  to: StageTransition["toCategory"],
  changedAt: string,
  value: number,
  over: Partial<StageTransition> = {},
): StageTransition {
  return {
    leadId,
    fromCategory: null,
    toCategory: to,
    changedAt,
    value,
    unitId: U,
    eventDate: null,
    ...over,
  };
}

describe("resolveStateAsOf (estoque)", () => {
  it("usa a última transição <= asOf", () => {
    const trans = [
      tr("a", "proposta", "2026-06-10T12:00:00.000Z", 1000),
      tr("a", "negociacao", "2026-06-15T12:00:00.000Z", 1200, {
        fromCategory: "proposta",
      }),
    ];
    const state = resolveStateAsOf(trans, [lead("a")], "2026-06-12T03:00:00.000Z", config);
    expect(state).toHaveLength(1);
    expect(state[0]!.category).toBe("proposta");
    expect(state[0]!.value).toBe(1000);
  });

  it("usa valor no instante da entrada mesmo se o valor mudar depois (at_stage_entry)", () => {
    const trans = [tr("a", "negociacao", "2026-06-10T12:00:00.000Z", 5000)];
    // valor atual do lead mudou para 9999, mas o snapshot histórico usa 5000
    const state = resolveStateAsOf(
      trans,
      [lead("a", { currentValue: 9999, currentCategory: "negociacao" })],
      "2026-06-20T03:00:00.000Z",
      config,
    );
    expect(state[0]!.value).toBe(5000);
  });

  it("cai para o estado atual quando não há histórico (baseline)", () => {
    const state = resolveStateAsOf(
      [],
      [lead("a", { currentCategory: "contrato", currentValue: 7000 })],
      "2026-06-20T03:00:00.000Z",
      config,
    );
    expect(state[0]!.category).toBe("contrato");
    expect(state[0]!.value).toBe(7000);
  });

  it("ignora leads criados depois do asOf e excluídos antes do asOf", () => {
    const future = lead("future", { createdAtKommo: "2026-07-01T00:00:00.000Z" });
    const deleted = lead("deleted", {
      currentCategory: "lead",
      deletedAtKommo: "2026-06-05T00:00:00.000Z",
    });
    const state = resolveStateAsOf([], [future, deleted], "2026-06-20T03:00:00.000Z", config);
    expect(state).toHaveLength(0);
  });
});

describe("computeDailySnapshot (estoque)", () => {
  it("agrega por categoria e calcula total/active pipeline configuráveis", () => {
    const states = resolveStateAsOf(
      [
        tr("a", "proposta", "2026-06-10T12:00:00.000Z", 1000),
        tr("b", "negociacao", "2026-06-10T12:00:00.000Z", 2000),
        tr("c", "contrato", "2026-06-10T12:00:00.000Z", 3000),
        tr("d", "concluido", "2026-06-10T12:00:00.000Z", 4000),
      ],
      [lead("a"), lead("b"), lead("c"), lead("d")],
      "2026-06-20T03:00:00.000Z",
      config,
    );
    const snap = computeDailySnapshot({ states, newLeadIds: new Set(), config });
    expect(snap.byCategory.proposta.count).toBe(1);
    // total pipeline = proposta+negociacao+contrato+fechado (concluído fora)
    expect(snap.totalPipelineValue).toBe(6000);
    // active pipeline default inclui até fechado (concluído fora)
    expect(snap.activePipelineValue).toBe(6000);
    expect(snap.completedValue).toBe(4000);
  });

  it("total pipeline respeita configuração customizada", () => {
    const states = resolveStateAsOf(
      [
        tr("a", "proposta", "2026-06-10T12:00:00.000Z", 1000),
        tr("b", "negociacao", "2026-06-10T12:00:00.000Z", 2000),
      ],
      [lead("a"), lead("b")],
      "2026-06-20T03:00:00.000Z",
      config,
    );
    const snap = computeDailySnapshot({
      states,
      newLeadIds: new Set(),
      config: { ...config, totalPipelineCategories: ["negociacao"] },
    });
    expect(snap.totalPipelineValue).toBe(2000);
  });

  it("conta atendimento precificado (valor > 0) separadamente", () => {
    const states = resolveStateAsOf(
      [
        tr("a", "atendimento", "2026-06-10T12:00:00.000Z", 0),
        tr("b", "atendimento", "2026-06-10T12:00:00.000Z", 1500),
      ],
      [lead("a"), lead("b")],
      "2026-06-20T03:00:00.000Z",
      config,
    );
    const snap = computeDailySnapshot({ states, newLeadIds: new Set(), config });
    expect(snap.leadsInServiceCount).toBe(2);
    expect(snap.pricedLeadsInServiceCount).toBe(1);
    expect(snap.pricedLeadsInServiceValue).toBe(1500);
  });

  it("monta breakdown por ano do evento sem hardcode de ano", () => {
    const states = resolveStateAsOf(
      [
        tr("a", "proposta", "2026-06-10T12:00:00.000Z", 1000, { eventDate: "2026-12-20" }),
        tr("b", "proposta", "2026-06-10T12:00:00.000Z", 2000, { eventDate: "2027-03-15" }),
        tr("c", "negociacao", "2026-06-10T12:00:00.000Z", 5000, { eventDate: "2028-01-01" }),
      ],
      [lead("a"), lead("b"), lead("c")],
      "2026-06-20T03:00:00.000Z",
      config,
    );
    const snap = computeDailySnapshot({ states, newLeadIds: new Set(), config });
    expect(snap.eventYearBreakdown["2026"]).toBe(1000);
    expect(snap.eventYearBreakdown["2027"]).toBe(2000);
    expect(snap.eventYearBreakdown["2028"]).toBe(5000);
  });

  it("trata lead sem valor e sem data de evento sem quebrar", () => {
    const states = resolveStateAsOf(
      [tr("a", "lead", "2026-06-10T12:00:00.000Z", 0, { eventDate: null })],
      [lead("a")],
      "2026-06-20T03:00:00.000Z",
      config,
    );
    const snap = computeDailySnapshot({ states, newLeadIds: new Set(["a"]), config });
    expect(snap.newLeadsCount).toBe(1);
    expect(snap.newLeadsValue).toBe(0);
    expect(snap.byCategory.lead.count).toBe(1);
  });
});
