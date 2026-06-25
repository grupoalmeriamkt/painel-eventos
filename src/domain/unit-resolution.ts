import type {
  UnitMappingRule,
  UnitResolutionMethod,
} from "@/lib/supabase/database.types";

/** Sinais extraídos do lead do Kommo para resolver a unidade. */
export interface UnitSignals {
  /** override manual local (maior prioridade absoluta) */
  manualOverrideUnitId?: string | null;
  /** valores de campos personalizados: fieldId -> valor(es) em texto */
  customFields?: { fieldId: number | null; fieldName?: string | null; value: string }[];
  tags?: string[];
  pipelineId?: number | null;
}

export interface UnitResolution {
  unitId: string | null;
  method: UnitResolutionMethod;
  confidence: number; // 0..1
  /** ids de regras que casaram (auditoria) */
  matchedRuleIds: string[];
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function matches(operator: string, candidate: string, value: string): boolean {
  const c = normalize(candidate);
  const v = normalize(value);
  switch (operator) {
    case "equals":
      return c === v;
    case "contains":
      return c.includes(v);
    case "starts_with":
      return c.startsWith(v);
    case "regex":
      try {
        return new RegExp(value, "i").test(candidate);
      } catch {
        return false;
      }
    default:
      return c === v;
  }
}

function ruleMatches(rule: UnitMappingRule, signals: UnitSignals): boolean {
  switch (rule.source_type) {
    case "manual_override":
      return false; // tratado fora do laço de regras
    case "custom_field": {
      const fields = signals.customFields ?? [];
      return fields.some((f) => {
        const sameField =
          rule.source_field_id != null
            ? f.fieldId === rule.source_field_id
            : true;
        return sameField && matches(rule.match_operator, f.value, rule.match_value);
      });
    }
    case "tag":
      return (signals.tags ?? []).some((t) =>
        matches(rule.match_operator, t, rule.match_value),
      );
    case "pipeline":
      return (
        signals.pipelineId != null &&
        String(signals.pipelineId) === String(rule.match_value)
      );
    case "text_rule": {
      // procura em qualquer campo de texto + tags
      const haystack = [
        ...(signals.customFields ?? []).map((f) => f.value),
        ...(signals.tags ?? []),
      ];
      return haystack.some((h) => matches(rule.match_operator, h, rule.match_value));
    }
    default:
      return false;
  }
}

const METHOD_BY_SOURCE: Record<string, UnitResolutionMethod> = {
  custom_field: "custom_field",
  tag: "tag",
  pipeline: "pipeline",
  text_rule: "text_rule",
};

/**
 * Resolve a unidade de um lead segundo a prioridade configurada.
 * Sem fuzzy agressivo. Se as regras do melhor nível de prioridade apontarem
 * para unidades diferentes, marca "conflict" e devolve à fila de qualidade.
 */
export function resolveUnit(
  rules: UnitMappingRule[],
  signals: UnitSignals,
): UnitResolution {
  // 1. Override manual vence sempre.
  if (signals.manualOverrideUnitId) {
    return {
      unitId: signals.manualOverrideUnitId,
      method: "manual_override",
      confidence: 1,
      matchedRuleIds: [],
    };
  }

  const active = rules
    .filter((r) => r.is_active && r.source_type !== "manual_override")
    .sort((a, b) => a.priority - b.priority);

  const matched = active.filter((r) => ruleMatches(r, signals));
  if (matched.length === 0) {
    return { unitId: null, method: "unresolved", confidence: 0, matchedRuleIds: [] };
  }

  // Considera apenas as regras do melhor nível de prioridade (menor número).
  const bestPriority = matched[0]!.priority;
  const top = matched.filter((r) => r.priority === bestPriority);
  const distinctUnits = new Set(top.map((r) => r.unit_id));

  if (distinctUnits.size > 1) {
    return {
      unitId: null,
      method: "conflict",
      confidence: 0,
      matchedRuleIds: top.map((r) => r.id),
    };
  }

  const winner = top[0]!;
  return {
    unitId: winner.unit_id,
    method: METHOD_BY_SOURCE[winner.source_type] ?? "text_rule",
    confidence: 0.9,
    matchedRuleIds: top.map((r) => r.id),
  };
}
