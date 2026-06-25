import { describe, it, expect } from "vitest";
import { resolveUnit, type UnitSignals } from "./unit-resolution";
import type { UnitMappingRule } from "@/lib/supabase/database.types";

const ALMERIA = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const IZZI = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

function rule(over: Partial<UnitMappingRule>): UnitMappingRule {
  return {
    id: Math.random().toString(36).slice(2),
    priority: 100,
    source_type: "custom_field",
    source_field_id: 555,
    source_field_name: "Espaço que vai ser utilizado",
    match_operator: "contains",
    match_value: "almeria",
    unit_id: ALMERIA,
    is_active: true,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

describe("resolveUnit", () => {
  it("override manual vence tudo", () => {
    const r = resolveUnit([rule({})], {
      manualOverrideUnitId: IZZI,
      customFields: [{ fieldId: 555, value: "Almeria" }],
    });
    expect(r.unitId).toBe(IZZI);
    expect(r.method).toBe("manual_override");
    expect(r.confidence).toBe(1);
  });

  it("resolve por campo personalizado", () => {
    const signals: UnitSignals = { customFields: [{ fieldId: 555, value: "Almeria Hall" }] };
    const r = resolveUnit([rule({})], signals);
    expect(r.unitId).toBe(ALMERIA);
    expect(r.method).toBe("custom_field");
  });

  it("respeita prioridade (menor número vence) sem marcar conflito", () => {
    const rules = [
      rule({ priority: 1, source_type: "custom_field", match_value: "wine", unit_id: IZZI }),
      rule({ priority: 5, source_type: "tag", match_value: "almeria", unit_id: ALMERIA }),
    ];
    const r = resolveUnit(rules, {
      customFields: [{ fieldId: 555, value: "Izzi Wine Garden" }],
      tags: ["almeria"],
    });
    expect(r.unitId).toBe(IZZI);
    expect(r.method).toBe("custom_field");
  });

  it("marca conflito quando regras de mesma prioridade apontam unidades diferentes", () => {
    const rules = [
      rule({ priority: 10, source_type: "tag", match_value: "almeria", unit_id: ALMERIA }),
      rule({ priority: 10, source_type: "tag", match_value: "wine", unit_id: IZZI }),
    ];
    const r = resolveUnit(rules, { tags: ["almeria", "wine"] });
    expect(r.method).toBe("conflict");
    expect(r.unitId).toBeNull();
    expect(r.matchedRuleIds).toHaveLength(2);
  });

  it("retorna unresolved quando nada casa", () => {
    const r = resolveUnit([rule({ match_value: "matri" })], {
      customFields: [{ fieldId: 555, value: "Outro espaço" }],
    });
    expect(r.method).toBe("unresolved");
    expect(r.unitId).toBeNull();
  });

  it("não faz fuzzy agressivo: 'equals' exige igualdade normalizada", () => {
    const r = resolveUnit(
      [rule({ match_operator: "equals", match_value: "almeria" })],
      { customFields: [{ fieldId: 555, value: "Almeria Garden" }] },
    );
    expect(r.method).toBe("unresolved");
  });

  it("normaliza acentos e caixa", () => {
    const r = resolveUnit(
      [rule({ match_operator: "equals", match_value: "matri", unit_id: ALMERIA })],
      { customFields: [{ fieldId: 555, value: "  MATRI  " }] },
    );
    expect(r.unitId).toBe(ALMERIA);
  });
});
